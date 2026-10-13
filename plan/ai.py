"""Thin wrapper around the Anthropic API. Every prompt used by the orchestrator's
subagents lives here so they're all in one place to tune.
"""
import json
import os
import re

from anthropic import Anthropic

import db
import model_roles

MODEL = model_roles.anthropic_model("orchestrator")

_client = None
LAST_SOURCE = None  # best-effort: "claude" | "openai" | "grok" | "ollama" | "local_deterministic"
LAST_REROUTE = None  # {from, to, reason, role} when failover kicked in
LAST_SOURCE_BY_ROLE = {}

OFFLINE_BLOCKED_MSG = (
    "Offline mode is on and no local model is reachable. "
    "Start Ollama or turn offline mode off in Settings."
)
OFFLINE_CLOUD_BLOCKED_MSG = (
    "Offline mode is on — cloud AI is disabled. "
    "Use a local-capable feature or turn offline mode off in Settings."
)


def _truthy_setting(value):
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


def offline_mode_enabled():
    """True when env or Settings force local-only AI routing (G2 persists offline_mode)."""
    if _truthy_setting(os.environ.get("WAYPOINT_OFFLINE_MODE")):
        return True
    return _truthy_setting(db.get_settings().get("offline_mode"))


def _block_paid_cloud_if_offline(feature_hint=None):
    """Raise before any paid/cloud call when offline mode is active."""
    if not offline_mode_enabled():
        return
    if feature_hint:
        raise RuntimeError(
            f"Offline mode is on — {feature_hint} Turn offline mode off in Settings to use cloud AI."
        )
    raise RuntimeError(OFFLINE_CLOUD_BLOCKED_MSG)


def _offline_degraded_suffix():
    return f"(offline: generated locally via {_live_local_model_name()})"


def _append_offline_label(text):
    suffix = _offline_degraded_suffix()
    body = (text or "").strip()
    if suffix in body:
        return body
    return f"{body}\n\n{suffix}" if body else suffix


def _route_json_via_ollama(prompt, max_tokens=800):
    """Parse JSON from a local Ollama response when offline mode blocks cloud paths."""
    if not local_model_available():
        raise RuntimeError(OFFLINE_BLOCKED_MSG)
    raw = _call_local_model(
        f"{prompt}\n\nRespond with ONLY valid JSON — no markdown fences, no preamble.",
        max_tokens=max_tokens,
    )
    try:
        return _extract_json(raw)
    except (json.JSONDecodeError, ValueError, AttributeError):
        raise RuntimeError(
            "Offline mode is on — the local model did not return valid JSON. "
            "Try again or turn offline mode off in Settings."
        ) from None


def check_daily_budget(role=None):
    """Block paid API calls when today's spend hits the daily cap.

    Agent chat (role='chat') gets a 1.2x soft margin so mid-conversation cutoffs
    are rarer than a small overspend. Lazy-imports budget to avoid ai↔budget cycles.
    """
    import budget
    spent = budget.spent_today()
    cap = budget.daily_cap()
    threshold = 1.2 if role == "chat" else 1.0
    if cap > 0 and spent / cap >= threshold:
        raise RuntimeError(
            f"Daily AI budget reached (${spent:.2f} of ${cap:.2f}) — raise it in Settings "
            "or wait for tomorrow. Results>cost still applies: the cap prevents runaway spend, not quality."
        )


def client():
    if not db.is_api_enabled():
        raise RuntimeError("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    _block_paid_cloud_if_offline("this feature requires cloud AI.")
    check_daily_budget()
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


# --- Offline fallback: claude_notes -- "connect the ollama when off wifi [...] as a dual system".
# Only wraps subagents whose output is forgiving of a much smaller local model (plain summaries,
# not strict multi-field JSON extraction) -- see daily_summary below for the one real usage.
LOCAL_MODEL_URL = (
    os.environ.get("LOCAL_MODEL_URL")
    or os.environ.get("OLLAMA_URL")
    or "http://127.0.0.1:11434"
).rstrip("/")


def list_ollama_model_names():
    """Return installed Ollama model tag names (empty list if unreachable)."""
    import requests
    try:
        resp = requests.get(f"{LOCAL_MODEL_URL}/api/tags", timeout=1.5)
        if not resp.ok:
            return []
        return [m.get("name") for m in (resp.json().get("models") or []) if m.get("name")]
    except Exception:
        return []


def _score_ollama_tag(name: str) -> tuple:
    """Higher is better. Prefer capable mid/large tags over tiny 1b/3b defaults."""
    lower = (name or "").lower()
    # Penalize tiny models hard
    tiny = any(x in lower for x in (":1b", "1b-", "tiny", "mini:1", ":2b", "2b-"))
    small = any(x in lower for x in (":3b", "3b-", "phi3", "phi-3", "gemma2:2b"))
    # Bonus families known to be decent locally
    family = 0
    if "qwen" in lower:
        family += 40
    if "llama3.1" in lower or "llama3.2" in lower or "llama3.3" in lower:
        family += 35
    if "mistral" in lower or "mixtral" in lower:
        family += 30
    if "gemma2" in lower or "gemma3" in lower:
        family += 25
    if "deepseek" in lower:
        family += 28
    # Size bonus from tag
    size = 0
    for label, pts in (
        ("70b", 90), ("34b", 80), ("32b", 78), ("27b", 72), ("14b", 60),
        ("13b", 58), ("9b", 48), ("8b", 45), ("7b", 40), ("4b", 20), ("3b", 8),
    ):
        if label in lower:
            size = pts
            break
    if tiny:
        size -= 50
    elif small and size < 15:
        size = 8
    instruct = 5 if any(x in lower for x in ("instruct", "chat", "it")) else 0
    return (family + size + instruct, len(lower))


def pick_ollama_model(available=None, preferred=None):
    """Pick the best installed Ollama model.

    Order: preferred (if present) → settings/env name if installed → highest-scoring tag → fallback.
    """
    models = list(available) if available is not None else list_ollama_model_names()
    if preferred and preferred in models:
        return preferred
    try:
        configured = model_roles.local_model_name_configured()
    except Exception:
        configured = (os.environ.get("LOCAL_MODEL_NAME") or "").strip()
    if configured and configured in models:
        return configured
    if not models:
        return configured or os.environ.get("LOCAL_MODEL_NAME") or "llama3.2:3b"
    return max(models, key=_score_ollama_tag)


def _live_local_model_name():
    """Prefer an installed Ollama tag (auto-select best) over a stale default."""
    try:
        preferred = model_roles.local_model_name_configured()
    except Exception:
        preferred = (os.environ.get("LOCAL_MODEL_NAME") or "").strip() or None
    try:
        return pick_ollama_model(preferred=preferred or None)
    except Exception:
        return preferred or os.environ.get("LOCAL_MODEL_NAME") or "llama3.2:3b"


# Back-compat alias; prefer _live_local_model_name() in call sites.
LOCAL_MODEL_NAME = _live_local_model_name()


def local_model_available():
    """Real reachability check (short timeout) -- used both by the offline-fallback path below
    and by the sidebar's usage widget to show whether a fallback actually exists right now."""
    import requests
    try:
        resp = requests.get(f"{LOCAL_MODEL_URL}/api/tags", timeout=1.5)
        return resp.ok
    except Exception:
        return False


def _call_local_model(prompt, max_tokens=300):
    global LAST_SOURCE
    import requests
    model = _live_local_model_name()
    resp = requests.post(
        f"{LOCAL_MODEL_URL}/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens},
        },
        timeout=90,
    )
    resp.raise_for_status()
    mark_live_source(None, "ollama")
    return resp.json().get("response", "").strip()


# --- OpenAI routing (claude_notes 2026-07-16: "use codex more freely than claude model as
# claude is better in tasks and intelligence but is bad in costs"). gpt-5-mini handles the
# high-volume/low-stakes work (practice-game generation + grading); Claude stays the default
# for everything judgment-heavy. Falls back to Claude automatically if the key is missing or
# the call fails, so nothing breaks offline-from-OpenAI.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = model_roles.openai_model("tasks")

# --- Grok / xAI (OpenAI-compatible chat completions at api.x.ai). Same niche as OpenAI for
# tasks / practice / coding Q&A. Agent tool-use chat stays Claude-only.
XAI_API_BASE = os.environ.get("XAI_API_BASE", "https://api.x.ai/v1").rstrip("/")


def _openai_api_key():
    return (os.environ.get("OPENAI_API_KEY") or OPENAI_API_KEY or "").strip()


def _xai_api_key():
    return (os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY") or "").strip()


def openai_chat(prompt, max_tokens=800, system=None, model=None, role="tasks"):
    global LAST_SOURCE
    if not db.is_api_enabled():
        raise RuntimeError("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    _block_paid_cloud_if_offline()
    check_daily_budget()
    import requests
    key = _openai_api_key()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    model = model or OPENAI_MODEL
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": model, "messages": messages,
              # gpt-5-family models spend completion tokens on hidden reasoning first -- a small
              # cap returns an empty message. Floor the cap and keep reasoning minimal.
              "max_completion_tokens": max(1500, max_tokens), "reasoning_effort": "minimal"},
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        db.log_api_usage(f"openai:{data.get('model') or model}", data["usage"]["prompt_tokens"], data["usage"]["completion_tokens"])
    except Exception as exc:
        print(f"[ai] openai usage logging failed: {exc}")
    mark_live_source(role or "tasks", "openai")
    return data["choices"][0]["message"]["content"].strip()


def grok_chat(prompt, max_tokens=800, system=None, model=None, role="tasks"):
    """Chat via xAI OpenAI-compatible endpoint (https://api.x.ai/v1/chat/completions)."""
    global LAST_SOURCE
    if not db.is_api_enabled():
        raise RuntimeError("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    _block_paid_cloud_if_offline()
    check_daily_budget()
    import requests
    key = _xai_api_key()
    if not key:
        raise RuntimeError("XAI_API_KEY is not configured.")
    model = model or model_roles.grok_model("tasks")
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    resp = requests.post(
        f"{XAI_API_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "max_tokens": max(800, max_tokens)},
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        usage = data.get("usage") or {}
        prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
        completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens") or 0
        db.log_api_usage(f"grok:{data.get('model') or model}", prompt_tokens, completion_tokens)
    except Exception as exc:
        print(f"[ai] grok usage logging failed: {exc}")
    mark_live_source(role or "tasks", "grok")
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Grok API returned no choices.")
    content = (choices[0].get("message") or {}).get("content") or ""
    return content.strip()


def mark_live_source(role, backend, *, rerouted_from=None, reason=None):
    """Record who actually answered so HUD / chat pills can show it."""
    global LAST_SOURCE, LAST_REROUTE
    LAST_SOURCE = backend
    if role:
        LAST_SOURCE_BY_ROLE[role] = backend
    if rerouted_from and rerouted_from != backend:
        LAST_REROUTE = {
            "from": rerouted_from,
            "to": backend,
            "reason": reason or "api_failed",
            "role": role,
        }
    else:
        LAST_REROUTE = None


def live_routing_status():
    source = LAST_SOURCE
    thinking = "none"
    if source == "claude":
        thinking = "claude_extended"
    elif source == "openai":
        thinking = "openai_reasoning"
    elif source == "grok":
        thinking = "grok_native"
    return {
        "last_source": LAST_SOURCE,
        "last_reroute": LAST_REROUTE,
        "by_role": dict(LAST_SOURCE_BY_ROLE),
        "thinking": thinking,
        "web_search": True,
        "companion_writes": "auto",
    }


def call_with_fallback(role, fn):
    """Run `fn(backend)` across fallback_chain until one works.

    Combines two policies:
      * rejected credentials (HTTP 401/403) -> demote that backend briefly and try the next;
      * 5xx / 429 / timeouts -> try the next without demoting (transient);
      * kill-switch / budget RuntimeError -> never hide by rerouting.
    """
    chain = model_roles.fallback_chain(role)
    preferred = chain[0] if chain else model_roles.configured_backend(role)
    last_error = None
    tried = []
    for backend in chain:
        try:
            result = fn(backend)
            mark_live_source(
                role,
                backend,
                rerouted_from=preferred if backend != preferred and last_error is not None else None,
                reason=(str(last_error)[:180] if last_error is not None and backend != preferred else None),
            )
            return result
        except Exception as exc:
            last_error = exc
            tried.append(backend)
            if _is_auth_error(exc):
                _mark_backend_unauthorized(backend)
                print(f"[ai] role {role}: {backend} key rejected, trying next")
                continue
            if _is_transient_error(exc) and backend != chain[-1]:
                print(f"[ai] {backend} failed for {role} ({exc}); trying next provider")
                continue
            if _is_connectivity_error(exc) and backend != chain[-1]:
                print(f"[ai] {backend} unreachable for {role} ({exc}); trying next provider")
                continue
            raise
    if last_error and _is_connectivity_error(last_error) and local_model_available():
        if "ollama" in (model_roles.SAFE_BACKENDS.get(role) or set()):
            mark_live_source(role, "ollama", rerouted_from=preferred, reason="connectivity")
            return fn("ollama")
    raise last_error or RuntimeError("No AI provider available.")


def route_text(role, prompt, max_tokens=800, system=None):
    """Plain-text role router with provider failover and a separate system channel."""
    if offline_mode_enabled():
        if not local_model_available():
            raise RuntimeError(OFFLINE_BLOCKED_MSG)
        reply = _call_local_model(_with_system(prompt, system), max_tokens=max_tokens)
        mark_live_source(role, "ollama")
        return _append_offline_label(reply)
    return call_with_fallback(
        role,
        lambda backend: _call_text_backend(backend, role, prompt, max_tokens, system=system),
    )


def route_json(role, prompt, max_tokens=800, system=None):
    """JSON-returning role router; same re-routing policy as route_text."""
    if offline_mode_enabled():
        data = _route_json_via_ollama(_with_system(prompt, system), max_tokens=max_tokens)
        mark_live_source(role, "ollama")
        return data

    def _one(backend):
        if backend == "ollama":
            return _route_json_via_ollama(_with_system(prompt, system), max_tokens=max_tokens)
        if backend == "claude" and not system:
            return _ask_json(prompt, max_tokens=max_tokens)
        return _extract_json(
            _call_text_backend(backend, role, prompt, max_tokens, system=system))

    return call_with_fallback(role, _one)




def _cheap_json(prompt, max_tokens=800):
    """JSON-returning call routed through the practice/task role."""
    return route_json("practice", prompt, max_tokens=max_tokens)


# --- AI practice games (Practice tab categories B/C/D). One uniform contract per game:
# a "gen" prompt produces {"challenge": shown to the user, "reference": hidden grading key},
# a shared grading prompt scores the user's answer 0-10 against that reference. Routed through
# _cheap_json (OpenAI-first) since these are high-volume and don't need Claude-level judgment.
PRACTICE_AI_GAMES = {
    "comprehension": "Write a dense, factual passage (~200 words, complexity scaled to difficulty {difficulty}/10) on a genuinely interesting niche topic, followed by 3 comprehension questions about it. challenge = passage + questions. reference = concise correct answers to the 3 questions.",
    "summarizing": "Write a meandering, detail-heavy passage (~300 words, complexity scaled to difficulty {difficulty}/10) mixing important points with filler. challenge = the passage + 'Summarize this in at most 3 sentences, keeping only what matters.' reference = the 3-5 points a good summary must contain.",
    "precise_word": "Pick a subtle concept and describe it in 2-3 sentences WITHOUT naming it (obscurity scaled to difficulty {difficulty}/10). challenge = the description + 'What is the single most precise word for this?' reference = your pre-committed best word plus 1-2 acceptable near-synonyms.",
    "code_exercise": "Write a short coding exercise in {language} at difficulty {difficulty}/10 (1=beginner, 10=expert). challenge = the exercise statement including any starter code. reference = a correct solution and the key insight it tests.",
    "pitch": "Invent a specific product/startup premise and audience (difficulty {difficulty}/10 controls how hard the market is). challenge = 'You are pitching X to Y. Write your pitch (5-8 sentences).' with the specifics. reference = the 4-5 things a convincing pitch here must nail.",
    "neural_net_fix": "Write a fake mini research-paper spec (~150 words) for a neural network with 2-3 deliberately planted design/training flaws (subtlety scaled to difficulty {difficulty}/10). challenge = the spec + 'Identify what is wrong and how you would fix it before training.' reference = the planted flaws and correct fixes.",
    "startup_sim": "Invent a mock entrepreneurship scenario: a project idea, a market, one named competitor, and a constraint (difficulty {difficulty}/10 scales harshness). challenge = the scenario + 'You have 6 months and $5k. Lay out your plan.' reference = the 4-5 strategic moves that would actually matter in this scenario.",
    "video_understanding": "Write a mini-lecture (~250 words, depth scaled to difficulty {difficulty}/10) teaching a genuinely useful topic the average person doesn't know well. challenge = the lecture + 'Without looking back, explain the 3 most important things you just learned.' reference = the 3-4 key points a correct answer must contain.",
}


def generate_longterm_fact():
    return _cheap_json("""Give one genuinely interesting, useful, specific fact worth remembering
(science, history, technique, number -- not trivia fluff). One or two sentences.
Respond with ONLY a JSON object: {"fact": "..."}""", max_tokens=150).get("fact", "")


def generate_practice_challenge(game_key, difficulty):
    import random
    template = PRACTICE_AI_GAMES[game_key]
    spec = template.format(difficulty=difficulty, language=random.choice(["Python", "C++", "x86 assembly"]))
    prompt = f"""{spec}

Respond with ONLY a JSON object: {{"challenge": "...", "reference": "..."}}"""
    data = _cheap_json(prompt, max_tokens=1200)
    if not isinstance(data, dict) or not data.get("challenge"):
        raise RuntimeError("challenge generation returned an unexpected shape")
    return {"challenge": str(data["challenge"]), "reference": str(data.get("reference", ""))}


def grade_practice_answer(game_key, challenge, reference, answer):
    prompt = f"""A user played a practice minigame ("{game_key}"). Grade their answer.

The challenge they saw:
\"\"\"{challenge}\"\"\"

The hidden grading key:
\"\"\"{reference}\"\"\"

Their answer:
\"\"\"{answer}\"\"\"

Score 0-10 (10 = nailed everything in the grading key). Be a fair but demanding grader; empty or
off-topic answers score 0-1. Give 2-3 sentences of concrete feedback: what they got, what they
missed (name the specifics from the grading key they failed to hit).

Respond with ONLY a JSON object: {{"score": <0-10 integer>, "feedback": "..."}}"""
    data = _cheap_json(prompt, max_tokens=400)
    score = data.get("score") if isinstance(data, dict) else None
    try:
        score = max(0, min(10, int(score)))
    except (TypeError, ValueError):
        score = 0
    feedback = (data.get("feedback") if isinstance(data, dict) else "") or ""
    return {"score": score, "feedback": str(feedback)}


def grade_class_work(title, notes="", answer="", attachments_text="", rubric=""):
    """Auto-grade a class homework item. Uses the practice role (cheap, all backends)."""
    prompt = f"""Grade this school assignment fairly and specifically.

Assignment title: {title}
Teacher notes / prompt:
\"\"\"{(notes or "").strip() or "(none)"}\"\"\"
Rubric:
\"\"\"{(rubric or "").strip() or "Score completeness, correctness, and clarity."}\"\"\"
Attached materials / extracted text:
\"\"\"{(attachments_text or "").strip() or "(none)"}\"\"\"
Student work:
\"\"\"{(answer or "").strip() or "(no separate student answer — grade from notes and attachments)"}\"\"\"

Score 0-10. Also pick a US letter grade A/B/C/D/F.
feedback = 2-5 sentences naming what was solid and what is missing.
missing = short list of gaps (empty if complete).

Respond with ONLY a JSON object:
{{"score": <0-10 integer>, "letter": "A"|"B"|"C"|"D"|"F", "feedback": "...", "missing": ["..."]}}"""
    data = route_json("practice", prompt, max_tokens=700)
    if not isinstance(data, dict):
        data = {}
    try:
        score = max(0, min(10, int(data.get("score"))))
    except (TypeError, ValueError):
        score = 0
    letter = str(data.get("letter") or "").strip().upper()[:1]
    if letter not in "ABCDF":
        letter = "A" if score >= 9 else "B" if score >= 8 else "C" if score >= 7 else "D" if score >= 6 else "F"
    missing = data.get("missing") or []
    if not isinstance(missing, list):
        missing = [str(missing)]
    missing = [str(item).strip() for item in missing if str(item).strip()][:8]
    return {
        "score": score,
        "letter": letter,
        "feedback": str(data.get("feedback") or "").strip(),
        "missing": missing,
    }


# --- AI Trainer (neural_net_fix flagship) — judgment-routed for quality --------

_FAMILY_FLAW_HINTS = {
    "mlp": "bad activation choices, vanishing gradients, wrong output activation for the loss, batch-norm placement",
    "cnn": "pooling/receptive field/stride mistakes, channel ordering, padding that shrinks spatial dims",
    "rnn": "truncated BPTT horizon, exploding gradients without clipping, wrong hidden-state init",
    "lstm_gru": "forget-gate bias, peephole misuse, teacher forcing at inference, state not reset between sequences",
    "transformer": "causal masking errors, positional encoding omissions, attention scaling, layer-norm placement",
    "attention": "QKV projection dims, multi-head split, masking, softmax temperature, cross vs self-attention mix-ups",
    "gan": "mode collapse setups, discriminator too strong, non-saturating loss misuse, label smoothing bugs",
    "vae": "KL collapse, beta-VAE weighting, reparameterization trick omission, decoder capacity mismatch",
    "diffusion": "noise schedule / beta schedule, timestep embedding, predicting noise vs x0, variance parameterization",
    "autoencoder": "bottleneck too small/large, skip-connection misuse, reconstruction loss vs downstream task mismatch",
    "gnn": "oversmoothing, wrong aggregation (mean vs sum), edge direction, self-loop handling, depth vs diameter",
    "rl_value": "reward scaling, discount factor, target network update rate, double-Q omission, bootstrapping off-policy",
    "rl_policy": "advantage baseline, entropy bonus sign, PPO clip epsilon, on-policy data staleness, reward shaping bugs",
    "embeddings_contrastive": "temperature, negative sampling, projection head removal too early, augmentation asymmetry",
}


def generate_ai_trainer_challenge(model_key, model_name, difficulty, weakness_context=""):
    flaw_hints = _FAMILY_FLAW_HINTS.get(model_key, "architecture and training-setup mistakes specific to this family")
    weakness_block = ""
    if weakness_context and weakness_context.strip():
        weakness_block = f"""
The user previously missed concepts like these — weave 1-2 of them into the planted flaws:
{weakness_context.strip()}
"""
    prompt = f"""Design a flagship neural-architecture debugging exercise for the "{model_name}" model family.

Model family: {model_key}
Difficulty: {difficulty}/10 (1=obvious textbook mistakes, 10=subtle research-paper-level traps)

Create a realistic mini research-paper spec (~150-250 words) describing an architecture and training setup
with 2-4 deliberately planted flaws. Flaws must be specific to {model_name}, e.g. {flaw_hints}.
{weakness_block}
The challenge text shown to the user = the spec + a clear instruction to identify what is wrong and how to fix it before training.
The reference = a hidden grading key listing each planted flaw and the correct fix (be specific).
concepts = 3-6 short names of ML concepts this exercise tests.

Respond with ONLY a JSON object:
{{"challenge": "...", "reference": "...", "concepts": ["...", "..."]}}"""
    data = route_json("judgment", prompt, max_tokens=1800)
    if not isinstance(data, dict) or not data.get("challenge"):
        raise RuntimeError("AI trainer challenge generation returned an unexpected shape")
    concepts = data.get("concepts") or []
    if not isinstance(concepts, list):
        concepts = []
    concepts = [str(c).strip() for c in concepts if str(c).strip()][:6]
    if len(concepts) < 3:
        concepts = (concepts + ["architecture", "training", "debugging"])[:3]
    return {
        "challenge": str(data["challenge"]),
        "reference": str(data.get("reference", "")),
        "concepts": concepts,
    }


def generate_review_deepdive(challenge, reference, user_answer, score, grading_feedback=""):
    reference_block = f"""The hidden grading key:
\"\"\"{reference}\"\"\"
"""
    if not (reference or "").strip():
        reference_block = f"""Grading feedback (reference key not stored):
\"\"\"{grading_feedback}\"\"\"
"""
    prompt = f"""A student just completed a neural-architecture debugging exercise. Provide a thorough teaching review.

Score: {score}/10

The challenge they saw:
\"\"\"{challenge}\"\"\"

{reference_block}
Their answer:
\"\"\"{user_answer}\"\"\"

Write a deep, pedagogical correction. Be specific — name concepts, explain why they matter, and show correct reasoning.

Respond with ONLY a JSON object:
{{
  "summary": "2-3 sentence overall assessment",
  "what_you_got": "what they understood correctly",
  "what_you_missed": [
    {{"concept": "...", "why_it_matters": "...", "correct_thinking": "..."}}
  ],
  "ideal_answer": "what a strong answer would cover",
  "next_time": "one concrete study tip for next round"
}}"""
    data = route_json("judgment", prompt, max_tokens=2000)
    if not isinstance(data, dict):
        raise RuntimeError("review deep-dive returned an unexpected shape")
    missed = data.get("what_you_missed") or []
    if not isinstance(missed, list):
        missed = []
    cleaned_missed = []
    for item in missed:
        if isinstance(item, dict):
            cleaned_missed.append({
                "concept": str(item.get("concept", "")),
                "why_it_matters": str(item.get("why_it_matters", "")),
                "correct_thinking": str(item.get("correct_thinking", "")),
            })
    return {
        "summary": str(data.get("summary", "")),
        "what_you_got": str(data.get("what_you_got", "")),
        "what_you_missed": cleaned_missed,
        "ideal_answer": str(data.get("ideal_answer", "")),
        "next_time": str(data.get("next_time", "")),
    }


def _is_connectivity_error(exc):
    """Anthropic's SDK wraps httpx connection failures in APIConnectionError -- this is
    deliberately broad (checks the exception's own class name/message) rather than importing
    every possible httpx/anthropic exception type, since the point is "couldn't reach the
    network at all", not any specific error subclass.
    """
    text = f"{type(exc).__name__} {exc}".lower()
    return any(s in text for s in ("connectionerror", "connect", "timed out", "timeout", "network", "resolve"))


def _is_transient_error(exc):
    """True when another provider might succeed: outages, rate limits, timeouts.

    Auth failures are handled separately via _is_auth_error (demote + reroute).
    Policy RuntimeErrors (kill switch, budget, missing key) do not match these markers.
    """
    if _is_auth_error(exc):
        return False
    if _is_connectivity_error(exc):
        return True
    text_l = f"{type(exc).__name__} {exc}".lower()
    if isinstance(exc, RuntimeError) and any(
        s in text_l for s in ("kill switch", "budget", "not configured", "offline mode", "api is disabled")
    ):
        return False
    return any(
        s in text_l
        for s in (
            "429", "rate limit", "overloaded", "capacity", "529",
            "503", "502", "500", "unavailable", "service unavailable",
            "internal server error", "bad gateway", "temporarily",
        )
    )


# Back-compat alias used by older tests / call sites.
def _is_reroutable_error(exc):
    return _is_transient_error(exc) or _is_auth_error(exc)


# --- Backend health: a rejected key is not a transient blip -------------------
# route_* used to fall back only on connectivity errors, so a revoked or mistyped key
# surfaced its raw 401 to the user even when another backend was configured and working.
# Auth failures now demote that backend and re-route. The demotion is remembered briefly
# so every later call doesn't pay the same doomed round trip.
_AUTH_FAILED = {}           # backend -> monotonic timestamp of the rejection
_AUTH_RETRY_AFTER = 600.0   # seconds before a demoted backend gets another chance

_AUTH_MARKERS = (
    "authentication_error", "api key is invalid", "invalid api key", "invalid_api_key",
    "invalid x-api-key", "incorrect api key", "unauthorized", "permission_error",
)
_AUTH_STATUS_RE = re.compile(r"\b(401|403)\b")


def _is_auth_error(exc):
    """True when a provider rejected our credentials -- Anthropic's AuthenticationError, or
    the requests.HTTPError raise_for_status() produces for openai_chat / grok_chat.

    RuntimeError is excluded on purpose: those are our own policy errors (kill switch,
    daily budget, key-not-configured), which must keep propagating untouched.
    """
    if isinstance(exc, RuntimeError):
        return False
    text_l = f"{type(exc).__name__} {exc}".lower()
    return any(m in text_l for m in _AUTH_MARKERS) or bool(_AUTH_STATUS_RE.search(text_l))


def _mark_backend_unauthorized(backend):
    import time
    if not backend:
        return
    if backend not in _AUTH_FAILED:
        print(f"[ai] {backend} rejected our API key -- routing around it for "
              f"{int(_AUTH_RETRY_AFTER // 60)} min")
    _AUTH_FAILED[backend] = time.monotonic()


def backend_key_rejected(backend):
    """True while `backend` is demoted for having recently rejected its key."""
    import time
    stamp = _AUTH_FAILED.get(backend)
    return stamp is not None and (time.monotonic() - stamp) < _AUTH_RETRY_AFTER


def reset_backend_health(backend=None):
    """Clear auth demotions. Called when keys are saved so a corrected key works at once."""
    if backend:
        _AUTH_FAILED.pop(backend, None)
    else:
        _AUTH_FAILED.clear()


def _backend_has_credentials(backend):
    if backend == "openai":
        return bool(_openai_api_key())
    if backend == "grok":
        return bool(_xai_api_key())
    if backend == "claude":
        return bool((os.environ.get("ANTHROPIC_API_KEY") or "").strip())
    if backend == "ollama":
        return local_model_available()
    return False


def _fallback_backends(role, exclude=()):
    """Backends that could actually serve `role` right now, best first.

    SAFE_BACKENDS stays the single source of truth for what a role is allowed to use,
    so widening a role's policy is all it takes to let it fall back here.
    """
    allowed = model_roles.SAFE_BACKENDS.get(role, set())
    exclude = set(exclude if isinstance(exclude, (set, list, tuple)) else [exclude])
    return [
        b for b in ("openai", "grok", "claude", "ollama")
        if b in allowed and b not in exclude
        and not backend_key_rejected(b) and _backend_has_credentials(b)
    ]


def _with_system(prompt, system=None):
    """Ollama and the plain-prompt helpers have no separate system channel -- fold it in."""
    return f"{system}\n\n{prompt}" if system else prompt


def _call_text_backend(backend, role, prompt, max_tokens, system=None):
    """One role-appropriate text call against exactly one backend. No fallback here --
    the callers own that, so the retry policy lives in a single place."""
    if backend == "openai":
        return openai_chat(prompt, max_tokens=max_tokens, system=system,
                           model=model_roles.openai_model(role), role=role)
    if backend == "grok":
        return grok_chat(prompt, max_tokens=max_tokens, system=system,
                         model=model_roles.grok_model(role), role=role)
    if backend == "ollama":
        mark_live_source(role, "ollama")
        return _append_offline_label(
            _call_local_model(_with_system(prompt, system), max_tokens=max_tokens))
    kwargs = {
        "model": model_roles.anthropic_model(role) if role in model_roles.ROLE_ORDER else MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    resp = client().messages.create(**kwargs)
    _log_usage(resp)
    mark_live_source(role, "claude")
    return "".join(b.text for b in resp.content if b.type == "text").strip()



def _log_usage(resp):
    try:
        db.log_api_usage(MODEL, resp.usage.input_tokens, resp.usage.output_tokens)
    except Exception as exc:
        print(f"[ai] usage logging failed: {exc}")


def _extract_json(text):
    match = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
    return json.loads(match.group(0) if match else text)


def _strip_html(html):
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _ask_json(prompt, max_tokens=800):
    """Direct Claude JSON helper used by route_json when the backend is Claude.

    Must not call route_json — that would recurse. Failures bubble to the router.
    """
    if offline_mode_enabled():
        return _route_json_via_ollama(prompt, max_tokens=max_tokens)
    mark_live_source("planning", "claude")
    resp = client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    _log_usage(resp)
    text_out = "".join(b.text for b in resp.content if b.type == "text")
    return _extract_json(text_out)


def chunk_goal(title, deadline, today):
    prompt = f"""Break this goal down into a sequence of concrete, well-scoped chunks (sub-tasks).

Goal: {title}
Deadline: {deadline}
Today's date: {today}

Rules:
- Each chunk should be independently actionable (a single sitting's worth of work, not vague).
- Space due dates sensibly between today and the deadline, backloading nothing to the last day.
- 4-10 chunks depending on how big the goal sounds.

Respond with ONLY a JSON array: [{{"title": "...", "due_date": "YYYY-MM-DD"}}, ...]"""
    data = _ask_json(prompt)
    return data if isinstance(data, list) else []


def coach_goal(goal, today):
    """Generate specific options for one goal. This function cannot persist or schedule them."""
    prompt = f"""Act as a creative goal coach. Produce a small set of unusually specific,
actionable options for this exact goal. You are proposing only: do not claim anything was saved,
scheduled, or completed.

Today's date: {today}
Goal:
{json.dumps(goal, indent=2)}

Return:
- 2-4 ideas: a concrete angle the user likely has not considered, why it fits this goal, and a
  first move that can be started without more planning.
- 2-4 quests: finite, checkable challenges with observable success criteria. Make them feel like
  missions, not renamed to-do boilerplate. Avoid duplicating existing chunks or quests.
- 2-4 time allocations: focused work blocks the user may explicitly turn into Tasks later.
  `minutes` must be an integer from 15 to 480. `due_date` is YYYY-MM-DD and must be no later than
  the goal deadline. Cadence describes whether it is one-off or repeats; this response does not
  create recurring events.

Specificity rules:
- Reuse nouns, constraints, artifacts, and dates from the goal and its chunks.
- Name the output or experiment each suggestion produces.
- Ban generic filler such as "stay consistent", "break it into steps", "research the topic",
  "set SMART goals", or motivational praise.
- Do not invent facts about the user. When the goal is sparse, propose a bounded experiment
  instead of pretending to know hidden context.

Respond with ONLY this JSON object:
{{
  "ideas": [
    {{"title": "...", "why": "...", "first_move": "..."}}
  ],
  "quests": [
    {{
      "title": "...",
      "description": "...",
      "success_criteria": "...",
      "difficulty": "easy|medium|hard"
    }}
  ],
  "time_allocations": [
    {{
      "title": "...",
      "minutes": 90,
      "cadence": "one-off|daily|weekly|...",
      "rationale": "...",
      "due_date": "YYYY-MM-DD"
    }}
  ]
}}"""
    data = route_json("tasks", prompt, max_tokens=1800)
    if not isinstance(data, dict):
        raise RuntimeError("goal coach returned an unexpected shape")
    return data


def daily_summary(date, metrics, hours_by_category):
    prompt = f"""Write a short (3-4 sentence) daily reflection summary for a personal life-tracking app.

Date: {date}
Metrics: {json.dumps(metrics)}
Time spent by category (hours): {json.dumps(hours_by_category)}

Be direct and specific, referencing the actual numbers. No generic encouragement fluff.
Respond with ONLY plain text, no JSON, no preamble."""
    return route_text("tasks", prompt, max_tokens=300)


def engrave_day_title(receipt_summaries):
    """Short evocative day title from receipt summaries for Trends day-replay filmstrip."""
    prompt = f"""You title one day in a personal life-tracking app from its activity receipts.

Receipts (chronological summaries):
{json.dumps(receipt_summaries, indent=2)}

Write a short, evocative chapter-style title capturing the day's character — specific to these
moments, not generic. Maximum 8 words. No quotation marks around the title.

Respond with ONLY a JSON object: {{"title": "..."}}"""
    data = route_json("tasks", prompt, max_tokens=80)
    if not isinstance(data, dict):
        return {"title": None}
    title = str(data.get("title") or "").strip().strip("\"'")
    if not title:
        return {"title": None}
    words = title.split()
    if len(words) > 8:
        title = " ".join(words[:8])
    return {"title": title}


def suggest_schedule(stats, recent_days, category_labels):
    """Subagent: proposes a happiness-optimized target allocation for tomorrow.

    `stats` is a list of already-computed real statistics (Pearson correlation of each
    daily metric against same-day happiness, plus a median-split comparison), computed
    by the caller (app.py, same Pearson approach as /api/trends/correlations) -- NOT by
    this function or the model. The prompt below hands the model only those numbers and
    forbids it from citing anything else, because letting the model eyeball raw history
    and "notice" its own correlations is exactly how this kind of feature ends up
    fabricating a plausible-sounding pattern that isn't actually in the data.
    """
    stats_text = "\n".join(
        f"- {s['metric']}: correlation with happiness = {s['correlation_with_happiness']} (n={s['n']} days); "
        f"mean {s['metric']} on this user's happier half of days = {s['mean_on_happier_half']}, "
        f"vs {s['mean_on_less_happy_half']} on their less happy half"
        for s in stats
    ) or "No metric had enough paired data points to compute a reliable correlation yet."

    recent_text = "\n".join(
        f"- {d['date']}: happiness={d.get('happiness')}, work_time={d.get('work_time')}, "
        f"effective_work_time={d.get('effective_work_time')}, sports={d.get('sports')}, "
        f"focus={d.get('focus')}, motivation={d.get('motivation')}, volatility={d.get('volatility')}"
        for d in recent_days
    ) or "No recent days logged."

    prompt = f"""You are a data-grounded scheduling assistant inside a personal life-tracking app. A
user wants a suggested time/effort allocation for TOMORROW aimed at maximizing their happiness,
based ONLY on real statistical patterns already computed from their own historical data -- not on
generic productivity advice.

Correlation of each daily metric with same-day happiness (Pearson r, ranges -1 to 1), computed
across this user's full logged history:
{stats_text}

This user's most recent logged days, for context on their current baseline only -- do NOT mine
these recent rows for new patterns, only the correlation list above is statistically validated:
{recent_text}

This app also lets the user tag individual hours with an activity category ({json.dumps(category_labels)}),
but that per-hour log is still too sparse in this user's data to compute any category-level
correlation. Do not invent or imply a category-specific finding (e.g. "your Social hours correlate
with happiness") -- that data doesn't exist yet. Only the metrics in the correlation list above are
backed by real numbers; everything else is unproven context.

Rules:
- Only propose a target for a metric that appears in the correlation list above with |correlation| >= 0.12
  and n >= 8. If a metric doesn't clear that bar, leave it out rather than guessing.
- Every number in a "why" field must trace back to the correlation list above -- do not invent statistics.
- Write this as a suggestion the user is free to ignore, not an instruction or a promise.
- If nothing in the correlation list clears the bar, return an empty suggested_targets array and say so
  plainly in reasoning -- don't invent a schedule to fill the response.

Respond with ONLY a JSON object of this shape:
{{"headline": "one sentence takeaway",
  "suggested_targets": [{{"metric": "sports", "label": "Sports (min)", "target": "45+", "why": "..."}}],
  "reasoning": "2-4 sentences explaining the suggestion, citing the actual correlation numbers used",
  "caveats": "1-2 sentences on sample size / correlation-vs-causation limits"}}"""
    return _ask_json(prompt, max_tokens=900)


def suggest_social_posts(date, metrics, hours_by_category, day_notes, hour_notes):
    """Turns a day's already-logged activity (same data daily_summary uses for the end-of-day
    reflection, plus the hour-by-hour notes for real specifics) into 1-3 short social-post
    caption ideas. Opt-in -- a button on the Today tab, next to the daily summary -- not
    automatic, since it's a real API call. This app has no social media integration: these are
    just copyable caption ideas, nothing here posts anywhere on its own.
    """
    prompt = f"""A user logs their day hour-by-hour in a personal life-tracking app. Based ONLY
on what they actually logged below, write 1-3 short social-media post captions they could
choose to copy and post themselves (this app never posts anything itself -- these are just ideas).

Date: {date}
Metrics: {json.dumps(metrics)}
Hours logged by category (category key: hour count): {json.dumps(hours_by_category)}
Free-text day notes: {day_notes or "(none)"}
Hour-by-hour notes: {json.dumps(hour_notes) if hour_notes else "(none)"}

Rules:
- Ground every caption in something SPECIFIC from the data above -- an actual note, a real
  number, a specific category -- never generic filler like "Had a great day!" or "Grateful for
  today" with nothing concrete behind it.
- If the logged data is too thin to say anything specific, return fewer captions (even an empty
  array) rather than padding with generic ones.
- Keep each caption short (1-2 sentences), casual, and postable as-is -- no hashtag spam, at
  most one or two hashtags if any.
- If you return more than one, vary the tone/angle (e.g. one reflective, one punchy) rather than
  restating the same idea.

Respond with ONLY a JSON array of strings: ["caption one", "caption two", ...]"""
    data = _ask_json(prompt, max_tokens=500)
    return data if isinstance(data, list) else []


def parse_category_instruction(instruction):
    """Turns a freeform instruction like 'add a category called Gym, teal' into a
    structured category, used by the in-app vibecode box.
    """
    prompt = f"""A user is editing time-tracking categories in a personal planner app via natural
language. Their instruction: "{instruction}"

Respond with ONLY a JSON object: {{"key": "snake_case_key", "label": "Human Label", "color": "#hexcolor"}}
If they didn't specify a color, pick one visually distinct from: dark green, green, orange, red,
dark blue, light blue, light red, purple (the existing categories)."""
    return route_json("tasks", prompt, max_tokens=150)


def research_competitions(project_description):
    """Web-search for hackathons/competitions to enter and competing products/companies.

    Previous version returned generic/stale/occasionally-hallucinated results
    ("the searching ai needs to be trained, its super dumb rn") -- the prompt gave
    the model no current date to reason about "open or upcoming" against, didn't
    push it to run more than a token search or two, and didn't guard against it
    filling gaps from parametric memory instead of what it actually found.
    """
    from datetime import date

    today = date.today().isoformat()
    prompt = f"""Today's date is {today}. Research this project using web search, then find:

1. Up to 4 hackathons or competitions that are ACTUALLY open for entry or upcoming as of {today}
   (not ones that already ended -- check the actual dates you find, don't assume)
2. Up to 4 real competing products or companies already solving a similar problem

Project: \"\"\"{project_description}\"\"\"

Rules:
- Run several distinct searches (different phrasings, e.g. the core problem, the tech domain,
  "hackathon [year]", "[category] competitors") rather than stopping after one query -- a single
  generic search tends to surface only the most SEO'd results, not the most relevant ones.
- Every result must come from something you actually found via search, not general knowledge --
  if you're not confident an item is real and current, leave it out rather than guess. This
  includes descriptions: base a hackathon's theme/prizes/requirements ONLY on what the search
  result actually says right now, not on a similarly-named event you recall -- a URL being real
  does not make a remembered description of it correct, since the same recurring URL (e.g. a
  company's evergreen Devpost/hackathon page) gets reused for a different event each time.
- For hackathons: you MUST find a specific date or date range and state it in the description
  ("July 15-17, 2026", not "this year" or "the upcoming edition"). Copy that date EXACTLY as the
  source states it -- never round, guess, or "correct" a year to make it look current. If the
  page shows a past year (e.g. it actually ran in 2024) do not relabel it with {today}'s year just
  because the event name looks recurring or annual. A GitHub repo marked "archived" or read-only,
  or a page describing an event whose date has already passed, means it's over -- drop it, don't
  reuse its name for a guessed future date. Compare the exact date you found to {today} yourself --
  if it's before {today}, drop the result entirely. Never omit a date you did find just to avoid
  revealing the event is stale -- either state it exactly (if {today} or later) or exclude the
  result (if it isn't). Before including ANY hackathon, silently check: can you point to the exact
  words in a search result that state its date? If you can't, you're not grounded on it -- exclude it.
  This matters most for repos/pages whose own metadata contradicts a "current" story: e.g. a GitHub
  repo's "archived" badge, a "concluded"/"see you next year" banner, or a submissions-due date that's
  already passed even if a stream/kickoff date within the listing looks future -- any one of those
  means the event is over regardless of which specific date you'd otherwise quote.
- Be MOST suspicious of hackathons you recognize by name or brand before you even search (a big
  company's flagship hackathon, a well-known recurring event) -- that recognition is a warning
  sign, not reassurance, because it means you have a strong memorized guess about its date that
  can silently override the actual search result. For any such name, run a second, targeted
  search just for its date (e.g. "<name> 2026 dates", "<name> archived OR concluded") before
  including it, and if that search turns up an older year, "archived", or no confirmation of a
  {today}-or-later date, drop it -- don't fall back on the name recognition.
- For competitors: the description should say specifically what makes them relevant to THIS
  project (shared audience, same problem, same approach), not a generic company blurb.
- Write every description as your own plain-text synthesis, one or two sentences. Never include
  raw citation markup, footnote markers, or tags of any kind (e.g. no "<cite>...</cite>",
  "[1]", source brackets) -- those are search-tool artifacts, not something a user should see.
- It's fine to return fewer than 4 of either category if that's what real search turns up --
  a short accurate list beats a padded generic one.

Respond with ONLY a JSON array:
[{{"title": "...", "description": "...", "type": "hackathon"|"competitor", "url": "..."}}]"""

    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "allowed_callers": ["direct"]}]

    for _ in range(6):
        response = client().messages.create(model=MODEL, max_tokens=2000, messages=messages, tools=tools)
        _log_usage(response)
        if response.stop_reason == "pause_turn":
            messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": response.content}]
            continue
        break

    text = "".join(b.text for b in response.content if b.type == "text")
    try:
        data = _extract_json(text)
    except (json.JSONDecodeError, AttributeError):
        return []
    return data if isinstance(data, list) else []


def research_events(location, interests):
    """Web-search for real, upcoming events near the user matching their interests.

    Same quality bar as research_competitions: grounds on today's date so "upcoming"
    means something, requires several distinct searches instead of one generic query,
    and refuses to fill in anything not actually found via search rather than padding
    the list from parametric memory.
    """
    from datetime import date

    today = date.today().isoformat()
    prompt = f"""Today's date is {today}. Find up to 6 real, specific events happening near
"{location}" that match these interests: "{interests}".

Rules:
- Run several distinct searches (different phrasings -- e.g. one interest at a time combined
  with the location, "events near [location] [month/year]", specific venues or organizers you
  find along the way) rather than stopping after one query -- a single generic search tends to
  surface only the most SEO'd results, not the most relevant ones.
- Only include events happening ON or AFTER {today} -- check the actual date you found for each
  one, don't assume something is still upcoming.
- Every result must come from something you actually found via search, not general knowledge --
  if you're not confident an event is real, current, and actually near "{location}", leave it out
  rather than guess.
- Include the actual date and a specific location/venue you found, not a vague placeholder like
  "various locations" or "TBD".
- It's fine to return fewer than 6 if that's what real search turns up -- a short accurate list
  beats a padded generic one.

Respond with ONLY a JSON array:
[{{"title": "...", "description": "...", "date": "YYYY-MM-DD", "location": "...", "url": "..."}}]"""

    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "allowed_callers": ["direct"]}]

    for _ in range(6):
        response = client().messages.create(model=MODEL, max_tokens=2000, messages=messages, tools=tools)
        _log_usage(response)
        if response.stop_reason == "pause_turn":
            messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": response.content}]
            continue
        break

    text = "".join(b.text for b in response.content if b.type == "text")
    try:
        data = _extract_json(text)
    except (json.JSONDecodeError, AttributeError):
        return []
    return data if isinstance(data, list) else []


def find_similar_ideas(title, body):
    """Web-search for existing products, projects, or discussions similar to one of the
    user's own ideas. Opt-in per idea (a real web-search call costs real API budget) --
    never run automatically across the whole idea list.

    Same quality bar as research_competitions/research_events: grounds on today's date,
    requires several distinct searches instead of one generic query, and refuses to fill
    in anything not actually found via search rather than padding from parametric memory.
    """
    from datetime import date

    today = date.today().isoformat()
    idea_text = f"{title}\n\n{body}".strip()
    prompt = f"""Today's date is {today}. A user has this idea:

\"\"\"{idea_text}\"\"\"

Search the web to find up to 6 real, existing products, open-source projects, or notable
discussions (e.g. Show HN, Reddit, Product Hunt) that are similar to this idea.

Rules:
- Run several distinct searches (different phrasings -- the core concept, the specific
  mechanism/approach, alternate names it might go by) rather than stopping after one query --
  a single generic search tends to surface only the most SEO'd results, not the most relevant.
- Every result must come from something you actually found via search, not general knowledge --
  if you're not confident something is real and actually similar, leave it out rather than guess.
- For each result, explain SPECIFICALLY how it's similar to and different from this idea
  (shared mechanism, same problem but different approach, same audience, etc.) -- not a
  generic blurb describing what the result does in isolation.
- It's fine to return fewer than 6 if that's what real search turns up -- a short accurate
  list beats a padded generic one.

Respond with ONLY a JSON array:
[{{"title": "...", "description": "...", "url": "...", "similarity_note": "..."}}]"""

    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "allowed_callers": ["direct"]}]

    for _ in range(6):
        response = client().messages.create(model=MODEL, max_tokens=2000, messages=messages, tools=tools)
        _log_usage(response)
        if response.stop_reason == "pause_turn":
            messages = [{"role": "user", "content": prompt}, {"role": "assistant", "content": response.content}]
            continue
        break

    text = "".join(b.text for b in response.content if b.type == "text")
    try:
        data = _extract_json(text)
    except (json.JSONDecodeError, AttributeError):
        return []
    return data if isinstance(data, list) else []


def suggest_urgency(title, notes):
    prompt = f"""Task: "{title}"
Notes: "{notes}"

Classify urgency: low, medium, high, or critical. Respond with ONLY a JSON object:
{{"urgency": "low"|"medium"|"high"|"critical"}}"""
    data = route_json("tasks", prompt, max_tokens=50)
    return data.get("urgency", "medium")


def summarize_codebase(project_name, file_samples):
    """file_samples: list of {"path": relative path, "content": text (already truncated)}."""
    files_text = "\n\n".join(f"--- {f['path']} ---\n{f['content']}" for f in file_samples)
    prompt = f"""Here are sample files from a project called "{project_name}":

{files_text}

Write a concise (3-5 sentence) summary of what this codebase actually does, based only on what's
shown -- its purpose, main components, and stack. Respond with ONLY plain text, no preamble."""
    return route_text("coding", prompt, max_tokens=400)


def describe_project_from_readme(project_name, readme_text):
    """Condenses a project's README into a short description for the Projects tab -- lets you
    point a registered project at its folder and pull a real description instead of typing one.
    """
    prompt = f"""Here is the README for a project called "{project_name}":

\"\"\"{readme_text[:8000]}\"\"\"

Write a concise (2-4 sentence) description of what this project is and does, suitable for a
project-tracking app's description field. Plain language, no marketing fluff, based only on what
the README actually says. Respond with ONLY plain text, no preamble."""
    return route_text("tasks", prompt, max_tokens=300)


def suggest_workflow_improvements(code):
    """From claude_notes: "an AI pass that suggests efficiency improvements on generated code
    after it runs" -- reviews Automation Studio's generated Python for real inefficiencies or
    bugs, advice only, never auto-applied.
    """
    prompt = f"""Here is Python code generated by a visual workflow/automation-node editor (like
Unreal Blueprints, but generating real Python):

```python
{code}
```

Suggest concrete efficiency or correctness improvements -- redundant loops, unnecessary repeated
work, obviously better standard-library calls, etc. If the code is already fine, say so plainly
instead of inventing filler suggestions. Respond with ONLY plain text (a short list is fine), no
preamble."""
    return route_text("coding", prompt, max_tokens=500)


def explain_workflow_code_selection(full_code, selection):
    """From claude_notes: "select a node/code region -> AI explanation". `selection` is the
    substring of `full_code` the user actually highlighted in the Automation Studio's code
    preview; `full_code` is passed too so the explanation isn't guessing at surrounding context.
    """
    prompt = f"""Full generated code from a visual workflow editor:

```python
{full_code}
```

The user selected this specific portion of it:

```python
{selection}
```

Explain in 2-4 plain-language sentences what that selected portion actually does, grounded in the
surrounding code shown above. Respond with ONLY plain text, no preamble."""
    return route_text("coding", prompt, max_tokens=300)


def _workflow_catalog_maps(node_catalog):
    valid = {}
    for item in node_catalog or []:
        if not isinstance(item, dict):
            continue
        type_name = item.get("type")
        if not isinstance(type_name, str):
            continue
        valid[type_name] = {
            "params": {p for p in (item.get("params") or []) if isinstance(p, str)},
            "pins": item.get("pins") or {},
        }
    return valid


def _normalize_workflow_graph(raw, node_catalog):
    valid = _workflow_catalog_maps(node_catalog)
    warnings = []
    graph = raw.get("graph") if isinstance(raw, dict) and isinstance(raw.get("graph"), dict) else raw
    if not isinstance(graph, dict):
        graph = {}
        warnings.append("AI did not return a graph object.")

    nodes = []
    seen_ids = set()
    for i, node in enumerate(graph.get("nodes") or []):
        if not isinstance(node, dict):
            warnings.append(f"Dropped non-object node at index {i}.")
            continue
        node_id = str(node.get("id") or f"node_{i + 1}")
        if node_id in seen_ids:
            node_id = f"{node_id}_{i + 1}"
            warnings.append(f"Renamed duplicate node id at index {i}.")
        seen_ids.add(node_id)
        type_name = str(node.get("type") or "")
        params = node.get("params") if isinstance(node.get("params"), dict) else {}
        if type_name not in valid:
            warnings.append(f"Converted unknown node type '{type_name or '?'}' to raw_python.")
            type_name = "raw_python"
            params = {"code": params.get("code") or f"# Unsupported workflow node requested by AI: {node.get('type')}\npass"}
        elif type_name != "raw_python":
            allowed = valid[type_name]["params"]
            params = {k: v for k, v in params.items() if k in allowed}
        clean = {
            "id": node_id,
            "type": type_name,
            "params": params,
            "x": node.get("x", 80),
            "y": node.get("y", i * 120),
        }
        for key in ("varName", "funcName", "pairId", "meta"):
            if key in node:
                clean[key] = node[key]
        nodes.append(clean)

    valid_ids = {n["id"] for n in nodes}
    edges = []
    for i, edge in enumerate(graph.get("edges") or []):
        if not isinstance(edge, dict):
            warnings.append(f"Dropped non-object edge at index {i}.")
            continue
        if edge.get("from") not in valid_ids or edge.get("to") not in valid_ids:
            warnings.append(f"Dropped edge with missing endpoint at index {i}.")
            continue
        clean = {
            "from": edge.get("from"),
            "to": edge.get("to"),
            "fromPort": edge.get("fromPort") or "next",
            "kind": edge.get("kind") or "exec",
        }
        if edge.get("toPort"):
            clean["toPort"] = edge.get("toPort")
        if edge.get("label"):
            clean["label"] = edge.get("label")
        edges.append(clean)

    variables = [v for v in (graph.get("variables") or []) if isinstance(v, dict)]
    functions = [f for f in (graph.get("functions") or []) if isinstance(f, dict)]
    clean_graph = {"nodes": nodes, "edges": edges, "variables": variables, "functions": functions}
    if isinstance(graph.get("ui"), dict):
        clean_graph["ui"] = graph["ui"]
    return clean_graph, warnings


def improve_workflow_graph(current_graph, instruction, node_catalog):
    """Modify an existing Automation Studio graph per user instruction (Continue/Fix vibecode)."""
    graph_blob = json.dumps(current_graph or {}, indent=2)
    prompt = f"""You modify an EXISTING Waypoint Automation Studio workflow graph based on a user instruction.

CURRENT GRAPH JSON:
{graph_blob}

USER INSTRUCTION:
{instruction}

Return ONLY valid JSON with this exact top-level shape:
{{"graph": {{"nodes": [], "edges": [], "variables": [], "functions": [], "ui": null, "comments": []}}, "changes": ["plain-language edit", "..."]}}

Rules:
- Output the FULL modified graph (same schema: nodes, edges, variables, functions, ui, comments).
- Preserve existing node ids wherever a node is unchanged or only lightly edited.
- Add new nodes with short unique ids; rewire exec/data edges as needed.
- Use ONLY node types and param names from NODE_TYPES below.
- Use exec edges shaped {{"from": "...", "to": "...", "fromPort": "next", "kind": "exec"}} (or true/false/loop/done ports where appropriate).
- Use data edges only when needed, shaped {{"from": "...", "to": "...", "fromPort": "result", "toPort": "param_name", "kind": "data"}}.
- changes: 1-8 short plain-language bullets summarizing what you edited (e.g. "Added print node after start", "Rewired loop exit to done").
- Do not include markdown, comments outside JSON, or explanatory prose outside the JSON object.

NODE_TYPES:
{json.dumps(node_catalog, indent=2)}
"""
    raw = route_json("judgment", prompt, max_tokens=4000)
    changes = []
    if isinstance(raw, dict):
        changes = raw.get("changes") or []
        graph_src = raw
    else:
        graph_src = raw
    if not isinstance(changes, list):
        changes = []
    changes = [str(c).strip() for c in changes if str(c).strip()]
    graph, warnings = _normalize_workflow_graph(graph_src, node_catalog)
    return {"graph": graph, "changes": changes, "warnings": warnings}


def generate_workflow_graph(description, node_catalog):
    """Vibecode a visual workflow graph from a natural-language description."""
    prompt = f"""You convert natural-language automation requests into Waypoint Automation Studio graphs.

Return ONLY valid JSON with this exact top-level shape:
{{"nodes": [], "edges": [], "variables": [], "functions": [], "ui": null}}

Rules:
- Use ONLY node types and param names from NODE_TYPES below.
- Use exec edges shaped {{"from": "...", "to": "...", "fromPort": "next", "kind": "exec"}}.
- Use data edges only when needed, shaped {{"from": "...", "to": "...", "fromPort": "result", "toPort": "param_name", "kind": "data"}}.
- Include a start node for ordinary scripts and wire it to the first executable node.
- Keep node ids short and unique.
- Position nodes in a readable column or small grid; x/y must be numbers.
- If the user asks for behavior that no catalog node can express, create a best-effort graph with the closest valid nodes and put the irreducible Python in a custom node when available.
- Do not include markdown, comments outside JSON, or explanatory prose.

NODE_TYPES:
{json.dumps(node_catalog, indent=2)}

Description:
{description}
"""
    raw = route_json("judgment", prompt, max_tokens=3000)
    graph, warnings = _normalize_workflow_graph(raw, node_catalog)
    return {"graph": graph, "warnings": warnings}


def validate_tasks_from_notes(day_notes, open_tasks):
    """Reads today's journal/notes and decides which open tasks they provide evidence for
    completing (fully or partially) -- this is what lets the to-do list update itself from
    what you actually wrote instead of you checking things off by hand.
    """
    if not day_notes or not open_tasks:
        return []

    prompt = f"""Today's journal/notes from a life-planner app:
\"\"\"{day_notes}\"\"\"

Currently open tasks:
{json.dumps(open_tasks)}

Decide which tasks (if any) these notes provide real evidence of progress or completion for.
Only include a task if the notes genuinely support it -- do not guess or assume.

Respond with ONLY a JSON array (empty if none apply):
[{{"task_id": <id>, "status": "done"|"partial", "progress_done": <number or null>, "reason": "short quote or paraphrase from the notes"}}]"""
    data = _ask_json(prompt, max_tokens=500)
    return data if isinstance(data, list) else []


def review_proposed_change(action_type, payload):
    """Second, independent pass over a staged self-coding action (file edit or shell command),
    run automatically the moment it's staged -- before the human ever sees the approve/reject
    buttons. Not a gate: the human approval is still the only thing that blocks anything from
    actually running. This just surfaces a plain-language risk flag alongside the diff/command
    preview so things like an out-of-scope file touch or weakened error handling are easier to
    spot at a glance.
    """
    if action_type == "file_edit":
        detail = f"""File: {payload.get('path')}
Stated reason: {payload.get('reason')}

--- old_string (being removed; empty means this creates a new file) ---
{(payload.get('old_string') or '')[:4000]}

--- new_string (being added) ---
{(payload.get('new_string') or '')[:4000]}"""
    else:
        detail = f"""Shell command: {payload.get('command')}
Stated reason: {payload.get('reason')}"""

    prompt = f"""You are a second, independent reviewer for a self-coding AI agent's proposed change to
its own codebase (a personal life-planner app). The human user will see this alongside the diff
and decide whether to approve or reject it -- your job is to flag anything that looks off, not to
approve or block anything yourself.

Proposed {action_type.replace('_', ' ')}:
{detail}

Look for things like: the change touches a file or area unrelated to the stated reason, it deletes
much more than it adds without an obvious reason, it weakens or removes error handling in a way
that could hide failures, a command looks destructive or unrelated to the stated reason, secrets
or credentials appear to be touched, or anything else a careful human reviewer would want flagged.
If nothing stands out, say so plainly -- don't invent concerns just to seem thorough.

Respond with ONLY a JSON object:
{{"risk": "low"|"medium"|"high", "summary": "one sentence, plain language", "concerns": ["short bullet", ...]}}
concerns should be an empty array if risk is low and nothing stands out."""

    data = route_json("tasks", prompt, max_tokens=400)
    risk = data.get("risk") if isinstance(data, dict) else None
    if risk not in ("low", "medium", "high"):
        risk = "medium"
    concerns = data.get("concerns") if isinstance(data, dict) else None
    return {
        "risk": risk,
        "summary": (data.get("summary") or "").strip() if isinstance(data, dict) else "",
        "concerns": concerns if isinstance(concerns, list) else [],
    }


def fact_check_agent_reply(reply, actions, user_message=""):
    """Independent judgment pass: ground the agent reply against tool results.

    Returns ok/issues/corrected_reply. Fail-open callers should keep the original
    reply if this raises or returns an unexpected shape.
    """
    try:
        evidence = json.dumps(actions or [], default=str)[:6000]
    except Exception:
        evidence = str(actions or [])[:6000]
    prompt = f"""You are a fact-checker for Waypoint's in-app agent. The agent may hallucinate
tool use or claim it saved data when it did not. Ground the reply ONLY in the user message
and the tool evidence below. Tool evidence is ground truth.

User message:
\"\"\"{(user_message or '')[:2000]}\"\"\"

Agent reply to check:
\"\"\"{(reply or '')[:3000]}\"\"\"

Tool evidence (JSON list of {{tool, input, result}}; empty means NO tools ran):
\"\"\"{evidence}\"\"\"

Flag as issues when the reply:
- says Done/saved/added/created/updated when there is no matching successful tool result
  (ok:true / created record) — needs_confirmation or error does NOT count as saved
- invents tool names like contacts.add (real name is add_contact) or narrates fake tool calls
- invents people, ids, titles, or fields not present in the user message or tool results
- claims inability to write when tools exist (that is false for this app)

If the reply is already honest and grounded, ok=true and corrected_reply="".
If not, ok=false and corrected_reply must be a short honest rewrite (1-3 sentences) that
matches the evidence — e.g. admit nothing was saved yet and name the real tool to call,
or accurately summarize what the tools actually returned.

Respond with ONLY a JSON object:
{{"ok": true|false, "issues": ["short bullet", ...], "corrected_reply": ""}}"""
    data = route_json("judgment", prompt, max_tokens=500)
    if not isinstance(data, dict):
        return {"ok": True, "issues": [], "corrected_reply": ""}
    issues = data.get("issues") or []
    if not isinstance(issues, list):
        issues = []
    issues = [str(x).strip() for x in issues if str(x).strip()][:8]
    corrected = str(data.get("corrected_reply") or "").strip()
    ok = bool(data.get("ok", True))
    if issues and corrected:
        ok = False
    return {"ok": ok, "issues": issues, "corrected_reply": corrected}


def evaluate_idea(title, body):
    """Scores a short idea description and gives investor-style feedback, judged only from
    the text itself -- no real market research (that's what research_competitions does for a
    registered *project*, not a freeform idea). Deliberately avoids fabricating market-size
    numbers or other false-precision the model can't actually know from a title + description.
    """
    prompt = f"""You are evaluating an early-stage idea logged in a personal planner app's "Ideas"
tab. You are reading ONLY the title and description below -- you have not done market research
and have no real data on market size, competitors, or demand. Judge only what the text itself
supports: clarity, differentiation as described, obvious risks or gaps, feasibility as described.
Do not invent market-size figures, user counts, or other precise-sounding numbers you can't
actually know from a short description.

Idea title: {title}
Idea description: \"\"\"{_strip_html(body)}\"\"\"

Respond with ONLY a JSON object:
{{"score": <1-10 integer>, "strengths": ["...", ...], "weaknesses": ["...", ...],
"questions_an_investor_would_ask": ["...", ...]}}
2-4 items per list, each specific to this idea, not generic startup advice."""
    data = _ask_json(prompt, max_tokens=700)
    if not isinstance(data, dict):
        data = {}
    try:
        score = max(1, min(10, int(data.get("score"))))
    except (TypeError, ValueError):
        score = 5

    def _list(key):
        v = data.get(key)
        return [str(x) for x in v] if isinstance(v, list) else []

    return {
        "score": score,
        "strengths": _list("strengths"),
        "weaknesses": _list("weaknesses"),
        "questions_an_investor_would_ask": _list("questions_an_investor_would_ask"),
    }


def pitch_reply(title, body, question, user_reply):
    """Single in-character investor follow-up after the user answers one of evaluate_idea's
    questions -- a lightweight pitch role-play, not a persisted multi-turn conversation.
    """
    prompt = f"""You are role-playing as a skeptical but fair investor listening to a pitch for
this idea:

Idea title: {title}
Idea description: \"\"\"{_strip_html(body)}\"\"\"

You asked: "{question}"
The founder just answered: \"\"\"{user_reply}\"\"\"

Stay in character as the investor. Write ONE short in-character follow-up (2-4 sentences)
reacting specifically to what they said -- push back, ask a sharper follow-up, or acknowledge a
genuinely good answer, whichever actually fits their reply. Do not cite market data or statistics
you don't actually have.

Respond with ONLY the investor's spoken reply as plain text -- no preamble, no quotation marks."""
    return route_text("roleplay", prompt, max_tokens=300)


def suggest_contact_outreach(contacts):
    """Given current contacts (name, warmth, last_contact, current_focus), suggest who to reach out to."""
    if not contacts:
        return []
    prompt = f"""Given this list of contacts with a "warmth" score (0-100, lower = colder / more overdue)
and what they're currently working on, suggest up to 3 people worth reaching out to this week and why.

Contacts: {json.dumps(contacts)}

Respond with ONLY a JSON array: [{{"contact_id": <id>, "reason": "..."}}]"""
    data = _ask_json(prompt, max_tokens=400)
    return data if isinstance(data, list) else []


DOCUMENT_LIST_TYPES = ("idea", "skill", "problem", "thinking", "funny", "essay")
DOCUMENT_CLASSIFY_WORD_LIMIT = 1800  # per-chunk size for whole-document classification
DOCUMENT_CLASSIFY_OVERLAP_WORDS = 150
DOCUMENT_CLASSIFY_MAX_PROPOSALS = 300


def _document_text_chunks(words):
    """Split document words into overlapping chunks for full-document classification."""
    if not words:
        return []
    if len(words) <= DOCUMENT_CLASSIFY_WORD_LIMIT:
        return [" ".join(words)]
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + DOCUMENT_CLASSIFY_WORD_LIMIT, len(words))
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start = max(0, end - DOCUMENT_CLASSIFY_OVERLAP_WORDS)
    return chunks


def _normalize_classify_title(title):
    return re.sub(r"\s+", " ", (title or "").lower().strip())


def _classify_item_text(item):
    return f"{item.get('title', '')} {item.get('body', '')}".strip()


def _classify_items_near_duplicate(a, b, similarity_threshold=0.85):
    if a.get("list_type") != b.get("list_type"):
        return False
    if _normalize_classify_title(a.get("title")) == _normalize_classify_title(b.get("title")):
        return True
    try:
        import embeddings
        sims = embeddings.similarity(_classify_item_text(a), [_classify_item_text(b)])
        return bool(sims) and sims[0] >= similarity_threshold
    except Exception:
        return False


def _dedupe_classify_items(items):
    merged = []
    for item in items:
        if any(_classify_items_near_duplicate(item, existing) for existing in merged):
            continue
        merged.append(item)
        if len(merged) >= DOCUMENT_CLASSIFY_MAX_PROPOSALS:
            break
    return merged


def _parse_classify_chunk_items(data):
    if not isinstance(data, list):
        return []
    items = []
    for item in data:
        if not isinstance(item, dict):
            continue
        list_type = item.get("list_type")
        title = (item.get("title") or "").strip()
        body = (item.get("body") or "").strip()
        if list_type not in DOCUMENT_LIST_TYPES or not title:
            continue
        items.append({"list_type": list_type, "title": title, "body": body})
    return items


def _classify_document_chunk(filename, text, part_num, total_parts, bias_list=None):
    bias_block = ""
    if bias_list in DOCUMENT_LIST_TYPES:
        bias_block = f"""
The user is importing from their "{bias_list}" list tab. When an item could reasonably fit
multiple list types, prefer "{bias_list}" — but still file clearly-different items under the
correct other list type.
"""
    slice_note = (
        f"This is part {part_num} of {total_parts} of the full document — classify only what's "
        "in this slice, but don't assume there is no related content in other parts."
        if total_parts > 1 else "This is the full document text."
    )

    prompt = f"""A user uploaded a document called "{filename}" to a personal life-planner app that
organizes freeform capture into these lists: "idea" (things to build or try), "skill" (things
learned or worth remembering how to do), "problem" (open problems/questions worth revisiting),
"thinking" (reflections, opinions, half-formed thoughts), "funny" (jokes, memes, witty lines,
humor worth saving), and "essay" (a piece of writing worth keeping close to verbatim -- an
actual essay/composition, not a note about one).
{bias_block}
{slice_note}

Document text:
\"\"\"{text}\"\"\"

Propose a list of distinct items worth adding from this slice, each filed under the single
best-fitting list. Only propose items that are actually supported by the text -- don't pad the
list or invent generic filler. A short slice may only support 1-2 items. A long, dense slice
can genuinely support dozens -- propose EVERY distinct item that's actually here, don't stop early
or cap yourself at a round number. Titles should be short and specific; bodies should be 1-4
sentences capturing the actual substance, not a restatement of the title.

Respond with ONLY a JSON array:
[{{"list_type": "idea"|"skill"|"problem"|"thinking"|"funny"|"essay", "title": "...", "body": "..."}}]"""

    data = route_json("tasks", prompt, max_tokens=8000)
    return _parse_classify_chunk_items(data)


def _budget_cap_error(exc):
    msg = str(exc).lower()
    return "daily ai budget" in msg or "budget reached" in msg


def classify_document(filename, text, bias_list=None):
    """Reads text already extracted from an uploaded document and proposes items to file
    across the app's freeform capture lists. Processes the ENTIRE document in overlapping
    chunks, then dedupes near-duplicates. Proposals only -- nothing is written to the DB here.
    """
    text = (text or "").strip()
    if not text:
        return {"items": [], "chunks_processed": 0, "truncated": False}

    if bias_list not in DOCUMENT_LIST_TYPES:
        bias_list = None

    words = text.split()
    chunks = _document_text_chunks(words)
    all_items = []
    chunks_processed = 0
    truncated = False
    note = None

    for part_num, chunk_text in enumerate(chunks, 1):
        try:
            chunk_items = _classify_document_chunk(
                filename, chunk_text, part_num, len(chunks), bias_list=bias_list,
            )
            all_items.extend(chunk_items)
            chunks_processed += 1
        except RuntimeError as exc:
            if _budget_cap_error(exc):
                truncated = True
                note = str(exc)
                break
            raise

    result = {
        "items": _dedupe_classify_items(all_items),
        "chunks_processed": chunks_processed,
        "truncated": truncated,
    }
    if note:
        result["note"] = note
    return result


TASK_URGENCIES = ("low", "medium", "high", "critical")


def cleanup_tasks(tasks, projects):
    """Rewrite open tasks: clearer titles, description + how-to help, estimates, urgency, project links.

    Returns a list of proposed updates (one per input task when possible). Use null for fields
    the model cannot honestly infer — never fabricate estimates or project links.
    """
    if not tasks:
        return []

    tasks_blob = json.dumps([
        {
            "id": t.get("id"),
            "title": t.get("title") or "",
            "notes": (t.get("notes") or "").strip(),
            "urgency": t.get("urgency"),
            "due_date": t.get("due_date"),
            "project_id": t.get("project_id"),
            "progress_total": t.get("progress_total"),
            "progress_unit": t.get("progress_unit"),
        }
        for t in tasks
    ], indent=2)
    projects_blob = json.dumps([
        {"id": p.get("id"), "name": p.get("name") or "", "description": (p.get("description") or "").strip()}
        for p in (projects or [])
    ], indent=2)

    prompt = f"""You are cleaning up a user's open task list in a personal life-planner app.
For each task below, propose improvements — but only when you can ground them in the task text
or an obvious project match. Do not invent deadlines, estimates, or project links.

Open tasks:
{tasks_blob}

Registered projects (only set project_id when a task clearly belongs to one):
{projects_blob}

For EACH task id in the input, return one object with:
- id: same task id (required)
- title: rewritten short actionable title (or null to keep existing)
- description: 1-2 sentence summary of what the task is (null if nothing to add beyond title)
- help: concrete steps or tips for how to do it (null if you cannot add real guidance)
- estimate_hours: rough hours ONLY if task type supports a grounded guess; else null
- urgency: "low"|"medium"|"high"|"critical" or null to leave unchanged
- project_id: integer project id from the list above, or null if no clear match

Rules:
- Preserve the user's intent — polish, don't change the task into something else.
- description and help must not repeat each other verbatim.
- Never fabricate a precise estimate just to fill the field.
- project_id must be one of the listed project ids or null.

Respond with ONLY a JSON array:
[{{"id": <id>, "title": "..."|null, "description": "..."|null, "help": "..."|null,
"estimate_hours": <number>|null, "urgency": "low"|"medium"|"high"|"critical"|null,
"project_id": <id>|null}}]"""

    data = route_json("tasks", prompt, max_tokens=min(4000, 120 * len(tasks) + 400))
    if not isinstance(data, list):
        return []

    valid_project_ids = {p.get("id") for p in (projects or []) if p.get("id") is not None}
    task_ids = {t.get("id") for t in tasks}
    cleaned = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            tid = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        if tid not in task_ids:
            continue
        urgency = item.get("urgency")
        if urgency is not None and urgency not in TASK_URGENCIES:
            urgency = None
        proj_id = item.get("project_id")
        if proj_id is not None:
            try:
                proj_id = int(proj_id)
                if proj_id not in valid_project_ids:
                    proj_id = None
            except (TypeError, ValueError):
                proj_id = None
        title = item.get("title")
        if title is not None:
            title = str(title).strip() or None
        description = item.get("description")
        if description is not None:
            description = str(description).strip() or None
        help_text = item.get("help")
        if help_text is not None:
            help_text = str(help_text).strip() or None
        estimate_hours = item.get("estimate_hours")
        if estimate_hours is not None:
            try:
                estimate_hours = round(float(estimate_hours), 1)
                if estimate_hours <= 0:
                    estimate_hours = None
            except (TypeError, ValueError):
                estimate_hours = None
        cleaned.append({
            "id": tid,
            "title": title,
            "description": description,
            "help": help_text,
            "estimate_hours": estimate_hours,
            "urgency": urgency,
            "project_id": proj_id,
        })
    return cleaned


def parse_freeform_tasks(text):
    """Reads a rambling, unpunctuated brain-dump typed into the Tasks tab's "quick capture" box
    -- the user's real writing style, not cleaned-up prose: lowercase, run-on, typos, one or
    several tasks mashed together with no separators. Splits it into distinct tasks, each with a
    clean title, a cleaned-up (but detail-preserving) notes paragraph, a proposed urgency, and a
    rough hour estimate grounded in whatever the text actually supports -- never a fabricated
    number. Proposals only -- same review-before-commit pattern as classify_document; the
    free-task-capture route doesn't create anything until the human reviews and confirms.
    """
    text = (text or "").strip()
    if not text:
        return []

    prompt = f"""A user typed this rough brain-dump into a task-capture box in a personal
life-planner app. This is their genuine writing style when jotting things down fast -- lowercase,
run-on, little to no punctuation, occasional typos. It may describe one task or several run
together with no clear separator. Do not judge or "fix" their writing style; just extract the
real, distinct tasks buried in it.

Raw text:
\"\"\"{text}\"\"\"

For each distinct task described:
- title: short and specific (a few words, not a restatement of the whole sentence).
- notes: 1-3 clean sentences preserving real details from the raw text (who's involved, why, any
  deadline mentioned) -- don't pad it with generic filler that wasn't actually in the text.
- urgency: "low", "medium", "high", or "critical", based on any urgency cues in the text (explicit
  deadlines, words like "asap"/"whenever"/"annoying me"); default to "medium" if nothing suggests
  otherwise.
- estimate_hours: a rough number of hours ONLY if the task type or something in the text gives you
  a reasonable basis to ground a guess (e.g. "email someone" is quick, "fix a bug that's been
  broken a week" implies real debugging time, a stated duration). If you genuinely have no
  reasonable basis, set this to null -- do not invent a precise-sounding number just to fill the
  field.
- estimate_note: one short phrase explaining the estimate's basis, or (if estimate_hours is null)
  why you couldn't ground one.

If the text describes no actual task (e.g. it's just a stray thought), return an empty array.

Respond with ONLY a JSON array:
[{{"title": "...", "notes": "...", "urgency": "low"|"medium"|"high"|"critical",
"estimate_hours": <number, decimals allowed> | null, "estimate_note": "..."}}]"""

    data = route_json("tasks", prompt, max_tokens=1500)
    if not isinstance(data, list):
        return []
    items = []
    for item in data:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        urgency = item.get("urgency")
        if urgency not in TASK_URGENCIES:
            urgency = "medium"
        try:
            estimate_hours = round(float(item.get("estimate_hours")), 1)
            if estimate_hours <= 0:
                estimate_hours = None
        except (TypeError, ValueError):
            estimate_hours = None
        items.append({
            "title": title,
            "notes": (item.get("notes") or "").strip(),
            "urgency": urgency,
            "estimate_hours": estimate_hours,
            "estimate_note": (item.get("estimate_note") or "").strip(),
        })
    return items


def update_user_profile(day_summary, metrics):
    """Revise the self-learned user profile from today's reflection (max ~30 lines)."""
    existing = (db.get_settings().get("user_profile") or "").strip()
    prompt = f"""You maintain a concise user profile for a personal life-planner app.

Existing profile (revise and compress — do NOT just append; keep at most ~30 lines):
\"\"\"{existing or "(empty — start fresh)"}\"\"\"

Today's end-of-day summary:
\"\"\"{day_summary}\"\"\"

Today's metrics JSON:
{json.dumps(metrics)}

Update the profile with patterns, preferences, energy rhythms, and current focus areas
that are evidenced by today's summary and metrics.

Rules:
- Output at most ~30 lines of markdown
- REVISE and COMPRESS the existing profile: merge new insights, drop stale or redundant items
- Never invent facts not evidenced in the summary or metrics above
- If nothing new to learn today, return the existing profile trimmed to essentials

Respond with ONLY a JSON object: {{"user_profile": "...revised markdown..."}}"""
    data = route_json("tasks", prompt, max_tokens=800)
    if isinstance(data, dict) and data.get("user_profile"):
        return str(data["user_profile"]).strip()
    return existing


_VALID_SCHEDULE_DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
_DAY_ALIASES = {
    "monday": "Mon", "mon": "Mon",
    "tuesday": "Tue", "tue": "Tue", "tues": "Tue",
    "wednesday": "Wed", "wed": "Wed",
    "thursday": "Thu", "thu": "Thu", "thur": "Thu", "thurs": "Thu",
    "friday": "Fri", "fri": "Fri",
    "saturday": "Sat", "sat": "Sat",
    "sunday": "Sun", "sun": "Sun",
}


def _normalize_schedule_day(raw):
    token = (raw or "").strip()
    if not token:
        return None
    if token in _VALID_SCHEDULE_DAYS:
        return token
    return _DAY_ALIASES.get(token.lower())


def _normalize_schedule_time(raw):
    text = (raw or "").strip()
    if not text:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})$", text)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def parse_class_schedule(text, today):
    """Parse freeform pasted class schedule text into structured course rows."""
    prompt = f"""You parse pasted university or high-school class schedules into structured data.

Today's date (for inferring term dates when missing): {today}

Pasted schedule text:
\"\"\"{text}\"\"\"

Extract every distinct course/meeting. For each course return:
- name: course title or code + title
- days: array of weekday abbreviations among Mon, Tue, Wed, Thu, Fri, Sat, Sun (use these exact 3-letter forms)
- start_time: HH:MM 24-hour local time
- end_time: HH:MM 24-hour local time
- location: room/building or empty string if unknown
- start_date: optional ISO date YYYY-MM-DD when the course term starts (omit if unknown)
- end_date: optional ISO date YYYY-MM-DD when the course term ends (omit if unknown)

Rules:
- One object per distinct course section (not one per meeting instance).
- If days are written as M/W/F or Mon/Wed, expand to ["Mon","Wed","Fri"].
- If multiple time blocks exist for the same course on different days, merge into one object with all days if the times match; otherwise separate objects.
- Do not invent courses not present in the text.
- If nothing parseable, return an empty courses array.

Respond with ONLY valid JSON:
{{"courses": [{{"name": "...", "days": ["Mon","Wed"], "start_time": "09:30", "end_time": "10:45", "location": "...", "start_date": "YYYY-MM-DD or omit", "end_date": "YYYY-MM-DD or omit"}}]}}"""

    data = route_json("tasks", prompt, max_tokens=1200)
    if not isinstance(data, dict):
        return {"courses": []}
    raw_courses = data.get("courses")
    if not isinstance(raw_courses, list):
        return {"courses": []}
    courses = []
    for item in raw_courses:
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or "").strip()
        if not name:
            continue
        days = []
        for d in item.get("days") or []:
            norm = _normalize_schedule_day(d)
            if norm and norm not in days:
                days.append(norm)
        if not days:
            continue
        start_time = _normalize_schedule_time(item.get("start_time"))
        end_time = _normalize_schedule_time(item.get("end_time"))
        if not start_time or not end_time:
            continue
        location = (item.get("location") or "").strip()
        start_date = (item.get("start_date") or "").strip() or None
        end_date = (item.get("end_date") or "").strip() or None
        for label, val in (("start_date", start_date), ("end_date", end_date)):
            if val and not re.match(r"^\d{4}-\d{2}-\d{2}$", val):
                if label == "start_date":
                    start_date = None
                else:
                    end_date = None
        courses.append({
            "name": name,
            "days": days,
            "start_time": start_time,
            "end_time": end_time,
            "location": location,
            "start_date": start_date,
            "end_date": end_date,
        })
    return {"courses": courses}
