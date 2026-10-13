"""Local-only RAG: TF-IDF index over personal knowledge (repo files, ideas, notes, Obsidian
vault, companion memories, day notes, project notes, agent chat). Ask via Ollama only — no cloud
calls on this path."""
from __future__ import annotations

import json
import logging
import math
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfTransformer, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

import ai
import companion_memory
import db

log = logging.getLogger(__name__)

_PROJECT_DIR = Path(__file__).parent
_DATA_DIR = (
    Path(os.environ["WAYPOINT_DATA_DIR"])
    if os.environ.get("WAYPOINT_DATA_DIR")
    else _PROJECT_DIR
)
_VAULT_PATH = Path(
    __import__("personal_data").vault_path()
)
_INDEX_DIR = _DATA_DIR / "rag_index"
_CHUNKS_FILE = _INDEX_DIR / "chunks.jsonl"
_TFIDF_FILE = _INDEX_DIR / "tfidf.npz"
_VOCAB_FILE = _INDEX_DIR / "vocab.json"
_LEGACY_PKL = _INDEX_DIR / "tfidf.pkl"
_META_FILE = _INDEX_DIR / "meta.json"

CHUNK_SIZE = 1000
OVERLAP = 120
AGENT_MSG_CAP = 60
NOTE_TYPES = ("skill", "problem", "thinking", "funny", "essay")

_lock = threading.Lock()
_cache: dict = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _chunk_text(
    text: str,
    source: str,
    source_id: str | int,
    title: str,
    path: str | None = None,
) -> list[dict]:
    text = (text or "").strip()
    if len(text) < 80:
        return []
    step = CHUNK_SIZE - OVERLAP
    chunks = []
    for i, start in enumerate(range(0, len(text), step)):
        piece = text[start : start + CHUNK_SIZE]
        if len(piece.strip()) < 60:
            continue
        chunks.append(
            {
                "id": f"{source}:{source_id}:{i}",
                "source": source,
                "source_id": str(source_id),
                "title": title,
                "text": piece,
                "path": path,
            }
        )
    return chunks


def _collect_corpus() -> tuple[list[dict], dict]:
    chunks: list[dict] = []
    counts: dict[str, int] = {}

    # 1. repo_files
    try:
        files = db.list_repo_files()
        for f in files:
            text = (f.get("extracted_text") or "").strip()
            if text:
                chunks.extend(
                    _chunk_text(
                        text,
                        "repo_file",
                        f["id"],
                        f.get("filename") or str(f["id"]),
                    )
                )
        counts["repo_files"] = len(files)
    except Exception as exc:
        log.warning("local_rag corpus repo_files: %s", exc)

    # 2. Ideas
    try:
        ideas = db.list_ideas()
        for idea in ideas:
            title = (idea.get("title") or "").strip()
            body = (idea.get("body") or "").strip()
            text = f"{title}\n{body}".strip()
            chunks.extend(_chunk_text(text, "idea", idea["id"], title or "idea"))
        counts["ideas"] = len(ideas)
    except Exception as exc:
        log.warning("local_rag corpus ideas: %s", exc)

    # 3. Notes lists
    try:
        total = 0
        for list_type in NOTE_TYPES:
            notes = db.list_notes(list_type)
            for note in notes:
                title = (note.get("title") or "").strip()
                body = (note.get("body") or "").strip()
                text = f"{title}\n{body}".strip()
                chunks.extend(
                    _chunk_text(text, f"note_{list_type}", note["id"], title or list_type)
                )
            total += len(notes)
        counts["notes"] = total
    except Exception as exc:
        log.warning("local_rag corpus notes: %s", exc)

    # 4. Companion memories
    try:
        mems = companion_memory.get_memories(apply_decay=False, include_forgotten=True)
        for mem in mems:
            title = (mem.get("title") or "").strip()
            body = (mem.get("body") or "").strip()
            text = f"{title}\n{body}".strip()
            chunks.extend(
                _chunk_text(text, "companion_memory", mem.get("id", ""), title or "memory")
            )
        counts["companion_memories"] = len(mems)
    except Exception as exc:
        log.warning("local_rag corpus companion_memory: %s", exc)

    # 5. Obsidian vault markdown files
    try:
        md_files = list(_VAULT_PATH.rglob("*.md")) if _VAULT_PATH.exists() else []
        for md_path in md_files:
            try:
                text = md_path.read_text(encoding="utf-8", errors="replace")
                rel = str(md_path.relative_to(_VAULT_PATH))
                chunks.extend(
                    _chunk_text(text, "obsidian", rel, md_path.stem, path=rel)
                )
            except Exception:
                pass
        counts["obsidian"] = len(md_files)
    except Exception as exc:
        log.warning("local_rag corpus obsidian: %s", exc)

    # 6. Recent day notes
    try:
        days = db.list_days(limit=90)
        day_count = 0
        for day in days:
            notes_text = (day.get("notes") or "").strip()
            if notes_text:
                date_str = day.get("date", "")
                chunks.extend(
                    _chunk_text(notes_text, "day_note", date_str, f"Day {date_str}")
                )
                day_count += 1
        counts["day_notes"] = day_count
    except Exception as exc:
        log.warning("local_rag corpus day_notes: %s", exc)

    # 7. Project notes
    try:
        projects = db.list_projects()
        pn_count = 0
        for proj in projects:
            proj_notes = db.list_project_notes(proj["id"])
            for pn in proj_notes:
                body = (pn.get("body") or "").strip()
                if not body:
                    continue
                title = f"{proj.get('name', 'project')}: {pn.get('category', 'note')}"
                chunks.extend(_chunk_text(body, "project_note", pn["id"], title))
                pn_count += 1
        counts["project_notes"] = pn_count
    except Exception as exc:
        log.warning("local_rag corpus project_notes: %s", exc)

    # 8. Agent chat (last N turns)
    try:
        msgs = (
            db.list_all_agent_messages(limit=AGENT_MSG_CAP)
            if hasattr(db, "list_all_agent_messages")
            else db.list_agent_messages(limit=AGENT_MSG_CAP)
        )
        chat_count = 0
        for msg in msgs:
            role = msg.get("role", "")
            if role not in ("user", "assistant"):
                continue
            content = (msg.get("content") or "").strip()
            if len(content) < 80:
                continue
            chunks.extend(
                _chunk_text(content, "agent_chat", msg.get("id", ""), f"Agent chat ({role})")
            )
            chat_count += 1
        counts["agent_chat"] = chat_count
    except Exception as exc:
        log.warning("local_rag corpus agent_chat: %s", exc)

    # 9. Napkin / work queue markdown living next to the app
    try:
        n_count = 0
        for name in ("NAPKIN.md", "ISSUES.md", "WORK.md", "NAPKIN_COMPILED.md"):
            path = _PROJECT_DIR / name
            if not path.is_file():
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            chunks.extend(_chunk_text(text, "napkin", name, name, path=name))
            n_count += 1
        counts["napkin"] = n_count
    except Exception as exc:
        log.warning("local_rag corpus napkin: %s", exc)

    return chunks, counts


def rebuild_index() -> dict:
    """Collect all corpus sources, fit TF-IDF, persist. Returns stats dict."""
    with _lock:
        _INDEX_DIR.mkdir(parents=True, exist_ok=True)
        chunks, counts = _collect_corpus()
        indexed = [c for c in chunks if (c.get("text") or "").strip()]
        doc_count = len(set(f"{c['source']}:{c['source_id']}" for c in indexed))

        if not indexed:
            _CHUNKS_FILE.write_text("", encoding="utf-8")
            meta = {
                "built_at": _now_iso(),
                "chunk_count": 0,
                "doc_count": 0,
                "sources": counts,
            }
            _META_FILE.write_text(json.dumps(meta), encoding="utf-8")
            _cache.clear()
            _cache.update(loaded=True, chunks=[], vectorizer=None, matrix=None, meta=meta)
            return {"doc_count": 0, "chunk_count": 0, "sources": counts}

        texts = [c["text"] for c in indexed]
        vectorizer = TfidfVectorizer(max_features=8000, stop_words="english")
        matrix = vectorizer.fit_transform(texts)

        with _CHUNKS_FILE.open("w", encoding="utf-8") as fh:
            for chunk in indexed:
                fh.write(json.dumps(chunk, ensure_ascii=False) + "\n")
        _save_tfidf(vectorizer, matrix)

        meta = {
            "built_at": _now_iso(),
            "chunk_count": len(indexed),
            "doc_count": doc_count,
            "sources": counts,
        }
        _META_FILE.write_text(json.dumps(meta), encoding="utf-8")

        _cache.clear()
        _cache.update(
            loaded=True,
            chunks=indexed,
            vectorizer=vectorizer,
            matrix=matrix,
            meta=meta,
        )
        return {"doc_count": doc_count, "chunk_count": len(indexed), "sources": counts}


def _save_tfidf(vectorizer, matrix) -> None:
    np.savez_compressed(
        _TFIDF_FILE,
        data=matrix.data,
        indices=matrix.indices,
        indptr=matrix.indptr,
        shape=np.asarray(matrix.shape),
    )
    _VOCAB_FILE.write_text(json.dumps({
        "vocabulary": {str(k): int(v) for k, v in vectorizer.vocabulary_.items()},
        "idf": [float(x) for x in vectorizer.idf_.tolist()],
    }), encoding="utf-8")
    if _LEGACY_PKL.exists():
        try:
            _LEGACY_PKL.unlink()
        except OSError:
            pass


def _load_tfidf():
    blob = np.load(_TFIDF_FILE)
    matrix = csr_matrix(
        (blob["data"], blob["indices"], blob["indptr"]),
        shape=tuple(int(x) for x in blob["shape"]),
    )
    meta = json.loads(_VOCAB_FILE.read_text(encoding="utf-8"))
    vectorizer = TfidfVectorizer(max_features=8000, stop_words="english")
    vectorizer.vocabulary_ = {k: int(v) for k, v in meta["vocabulary"].items()}
    vectorizer.fixed_vocabulary_ = True
    transformer = TfidfTransformer()
    transformer.idf_ = np.asarray(meta["idf"], dtype=float)
    vectorizer._tfidf = transformer
    return vectorizer, matrix


def _index_files_ready() -> bool:
    return _CHUNKS_FILE.exists() and _TFIDF_FILE.exists() and _VOCAB_FILE.exists()


def _load_index_locked() -> bool:
    """Load persisted index into _cache. Must be called inside _lock."""
    if _cache.get("loaded"):
        return True
    if not _index_files_ready():
        return False
    try:
        chunks: list[dict] = []
        for line in _CHUNKS_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                chunks.append(json.loads(line))
        vectorizer, matrix = _load_tfidf()
        meta: dict = {}
        if _META_FILE.exists():
            try:
                meta = json.loads(_META_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        _cache.clear()
        _cache.update(
            loaded=True,
            chunks=chunks,
            vectorizer=vectorizer,
            matrix=matrix,
            meta=meta,
        )
        return True
    except Exception as exc:
        log.warning("local_rag load index: %s", exc)
        return False


def _ensure_index() -> bool:
    """Return True when the in-memory cache has a usable index (loads or auto-rebuilds)."""
    with _lock:
        if _cache.get("loaded"):
            return True
        if _load_index_locked():
            return True
    log.info("local_rag: index missing — auto-rebuilding")
    try:
        rebuild_index()
        return True
    except Exception as exc:
        log.warning("local_rag: auto-rebuild failed: %s", exc)
        return False


def status() -> dict:
    meta: dict = {}
    if _META_FILE.exists():
        try:
            meta = json.loads(_META_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "index_exists": _index_files_ready(),
        "chunk_count": meta.get("chunk_count", 0),
        "doc_count": meta.get("doc_count", 0),
        "built_at": meta.get("built_at"),
        "sources": meta.get("sources", {}),
        "ollama_available": ai.local_model_available(),
        "model": ai._live_local_model_name(),
    }


def _token_set(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]{2,}", (text or "").lower()) if t}


def _bm25_lite_scores(query: str, chunks: list[dict]) -> list[float]:
    """Cheap lexical scores for hybrid aggregation (no extra deps)."""
    q_tokens = _token_set(query)
    if not q_tokens:
        return [0.0] * len(chunks)
    docs = [_token_set(c.get("text", "")) for c in chunks]
    df = {t: sum(1 for d in docs if t in d) for t in q_tokens}
    n = max(len(docs), 1)
    avgdl = sum(len(d) for d in docs) / n
    k1, b = 1.2, 0.75
    out = []
    for d in docs:
        score = 0.0
        dl = len(d) or 1
        for t in q_tokens:
            if t not in d:
                continue
            tf = sum(1 for x in d if x == t)  # set has unique — use membership weight 1
            # Approximate tf=1 for set membership; boost title-like rarity via idf
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * ((1 + k1) / (1 + k1 * (1 - b + b * dl / max(avgdl, 1))))
            # Prefer exact token hits
            score += 0.15
        out.append(score)
    return out


def _hybrid_rank(query: str, chunks: list[dict], vectorizer, matrix, k: int) -> list[tuple[int, float]]:
    """Aggregate TF-IDF cosine + BM25-lite with source-diversity blend."""
    q_vec = vectorizer.transform([query])
    dense = cosine_similarity(q_vec, matrix).flatten()
    lexical = _bm25_lite_scores(query, chunks)

    def _norm(arr):
        mx = max(arr) if arr else 0.0
        if mx <= 1e-12:
            return [0.0] * len(arr)
        return [a / mx for a in arr]

    d_n = _norm(list(map(float, dense)))
    l_n = _norm(lexical)
    blended = [0.62 * d + 0.38 * l for d, l in zip(d_n, l_n)]
    order = sorted(range(len(blended)), key=lambda i: blended[i], reverse=True)
    picked: list[tuple[int, float]] = []
    seen_sources: dict[str, int] = {}
    for idx in order:
        if blended[idx] < 1e-9:
            break
        src = chunks[idx].get("source", "")
        penalty = 0.04 * seen_sources.get(src, 0)
        score = blended[idx] - penalty
        picked.append((idx, score))
        seen_sources[src] = seen_sources.get(src, 0) + 1
        if len(picked) >= k:
            break
    picked.sort(key=lambda x: x[1], reverse=True)
    return picked


def search(query: str, k: int = 5) -> list[dict]:
    """Return top-k chunks with hybrid TF-IDF + lexical aggregation scores."""
    if not _ensure_index():
        return []
    with _lock:
        chunks = _cache.get("chunks", [])
        vectorizer = _cache.get("vectorizer")
        matrix = _cache.get("matrix")
    if not chunks or vectorizer is None or matrix is None:
        return []
    ranked = _hybrid_rank(query, chunks, vectorizer, matrix, k)
    results = []
    for idx, score in ranked:
        chunk = chunks[idx]
        snippet = chunk["text"][:220].replace("\n", " ").strip()
        results.append(
            {
                "id": chunk["id"],
                "source": chunk["source"],
                "source_id": chunk["source_id"],
                "title": chunk["title"],
                "score": round(float(score), 5),
                "snippet": snippet,
                "method": "hybrid-tfidf-bm25",
            }
        )
    return results


def ask(query: str, k: int = 4) -> dict:
    """Retrieve top-k chunks and answer via local Ollama. Never calls cloud AI."""
    if not ai.local_model_available():
        raise RuntimeError(
            "Ollama is not reachable. Start Ollama and pull a model "
            "(e.g. `ollama pull llama3.2:3b`), then ask again."
        )
    if not _ensure_index():
        raise RuntimeError(
            "Local RAG index is not ready. Use /api/local-rag/rebuild to build it first."
        )

    with _lock:
        chunks = _cache.get("chunks", [])
        vectorizer = _cache.get("vectorizer")
        matrix = _cache.get("matrix")

    if not chunks or vectorizer is None or matrix is None:
        raise RuntimeError(
            "Local RAG index is empty. Add documents and rebuild the index."
        )

    ranked = _hybrid_rank(query, chunks, vectorizer, matrix, max(k, 6))
    selected: list[tuple[dict, float]] = [(chunks[i], sc) for i, sc in ranked]

    if not selected:
        raise RuntimeError("No relevant content found in the index for this query.")

    # Wider context so answers aren't stuck on opening passages only.
    context_budget = 12000
    used = 0
    excerpts: list[str] = []
    for i, (chunk, _score) in enumerate(selected, 1):
        title = chunk.get("title") or chunk.get("source", "")
        entry = f"[{i}] {title}\n{chunk['text']}"
        if used + len(entry) > context_budget:
            entry = entry[: max(0, context_budget - used)]
        if entry.strip():
            excerpts.append(entry)
        used += len(entry)
        if used >= context_budget:
            break

    excerpts_block = "\n\n".join(excerpts)
    prompt = (
        "You are a personal knowledge assistant. Answer ONLY from the numbered excerpts below. "
        "If the answer is not covered by the excerpts, say you don't know. "
        "Use all provided excerpts — do not rely only on the first one. "
        "Think briefly about which excerpts matter, then answer. "
        "Be concise. Cite the excerpt number and source title when relevant.\n\n"
        f"Excerpts:\n{excerpts_block}\n\n"
        f"Question: {query}\n\nAnswer:"
    )

    answer = ai._call_local_model(prompt, max_tokens=500)
    sources = [
        {
            "title": c.get("title") or c.get("source"),
            "source": c.get("source"),
            "source_id": c.get("source_id"),
            "score": round(sc, 4),
        }
        for c, sc in selected
    ]
    return {
        "answer": answer,
        "sources": sources,
        "model": ai._live_local_model_name(),
        "chunk_count_used": len(selected),
        "retrieval": "hybrid-tfidf-bm25",
    }
