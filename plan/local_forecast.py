"""Local forecast engine — lightweight sequence predictor over hour categories.

Uses only sqlite day/hour logs and happiness metrics. No sklearn/torch; a small
numpy attention stub (or pure-Python fallback) labels predictions clearly as
*local forecast* — not a trained transformer.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date as date_cls, datetime

import db

# Six macro tokens — maps every painted category into a compact alphabet.
FORECAST_TOKENS = ("work", "thinking", "social", "recovery", "planned", "other")
TOKEN_INDEX = {t: i for i, t in enumerate(FORECAST_TOKENS)}

CATEGORY_TO_TOKEN = {
    "work": "work",
    "thinking": "thinking",
    "social": "social",
    "work_with_people": "social",
    "sleep": "recovery",
    "free_time": "recovery",
    "planned": "planned",
    "other": "other",
}

DAY_TYPE_LABELS = ("productive", "recovery", "social")

PRODUCTIVE_TOKENS = frozenset({"work", "thinking", "planned"})
RECOVERY_TOKENS = frozenset({"recovery"})
SOCIAL_TOKENS = frozenset({"social"})


def _category_to_token(category: str | None) -> str | None:
    if not category:
        return None
    return CATEGORY_TO_TOKEN.get(category, "other")


def _hour_grid_from_day(hours: dict) -> list[str | None]:
    """24-slot grid of macro tokens (None = unpainted)."""
    grid: list[str | None] = [None] * 24
    for hour, info in (hours or {}).items():
        try:
            h = int(hour)
        except (TypeError, ValueError):
            continue
        if 0 <= h < 24:
            grid[h] = _category_to_token((info or {}).get("category"))
    return grid


def _load_history(limit_days: int = 500) -> list[dict]:
    conn = db.get_conn()
    day_rows = conn.execute(
        "SELECT date, happiness FROM days ORDER BY date DESC LIMIT ?",
        (limit_days,),
    ).fetchall()
    if not day_rows:
        conn.close()
        return []

    dates = [r["date"] for r in day_rows]
    happiness_by_date = {r["date"]: r["happiness"] for r in day_rows}
    placeholders = ",".join("?" * len(dates))
    hour_rows = conn.execute(
        f"""SELECT date, hour, category FROM hours
            WHERE date IN ({placeholders})
            ORDER BY date, hour""",
        dates,
    ).fetchall()
    conn.close()

    hours_by_date: dict[str, dict] = defaultdict(dict)
    for row in hour_rows:
        hours_by_date[row["date"]][row["hour"]] = {"category": row["category"]}

    history = []
    for d in dates:
        grid = _hour_grid_from_day(hours_by_date.get(d, {}))
        if not any(grid):
            continue
        history.append({
            "date": d,
            "happiness": happiness_by_date.get(d),
            "tokens": grid,
        })
    return history


def _build_bigram_counts(history: list[dict]) -> dict[str, Counter]:
    counts: dict[str, Counter] = defaultdict(Counter)
    for entry in history:
        prev: str | None = None
        for tok in entry["tokens"]:
            if tok is None:
                prev = None
                continue
            if prev is not None:
                counts[prev][tok] += 1
            prev = tok
    return counts


def _build_hour_slot_counts(history: list[dict]) -> dict[int, Counter]:
    """Per clock-hour frequency of tokens across all logged days."""
    slot_counts: dict[int, Counter] = defaultdict(Counter)
    for entry in history:
        for hour, tok in enumerate(entry["tokens"]):
            if tok:
                slot_counts[hour][tok] += 1
    return slot_counts


def _token_distribution(counter: Counter, smoothing: float = 0.35) -> list[dict]:
    total = sum(counter.values()) + smoothing * len(FORECAST_TOKENS)
    if total <= 0:
        uniform = 1.0 / len(FORECAST_TOKENS)
        return [{"token": t, "probability": round(uniform, 3)} for t in FORECAST_TOKENS]
    dist = []
    for tok in FORECAST_TOKENS:
        p = (counter.get(tok, 0) + smoothing) / total
        dist.append({"token": tok, "probability": round(p, 3)})
    dist.sort(key=lambda x: -x["probability"])
    return dist


def _markov_next(prev_token: str | None, bigrams: dict[str, Counter], hour: int,
                 slot_counts: dict[int, Counter]) -> list[dict]:
    if prev_token and bigrams.get(prev_token):
        base = bigrams[prev_token]
    elif slot_counts.get(hour):
        base = slot_counts[hour]
    else:
        base = Counter()
    return _token_distribution(base)


def _attention_stub_next(context_tokens: list[str], bigrams: dict[str, Counter]) -> list[dict]:
    """Tiny numpy attention over recent tokens — local forecast stub, not a trained model."""
    if not context_tokens:
        return _token_distribution(Counter())

    try:
        import numpy as np
    except ImportError:
        return _markov_next(context_tokens[-1], bigrams, 0, {})

    n = len(FORECAST_TOKENS)
    weights = np.array([1.0 + 0.35 * i for i in range(len(context_tokens))], dtype=float)
    weights /= weights.sum()
    logits = np.zeros(n, dtype=float)
    for w, tok in zip(weights, context_tokens):
        idx = TOKEN_INDEX.get(tok)
        if idx is None:
            continue
        logits[idx] += w
        for nxt, cnt in bigrams.get(tok, {}).items():
            j = TOKEN_INDEX.get(nxt)
            if j is not None:
                logits[j] += w * cnt * 0.15
    logits = logits - logits.max()
    probs = np.exp(logits)
    probs /= probs.sum()
    dist = [{"token": FORECAST_TOKENS[i], "probability": round(float(probs[i]), 3)}
            for i in range(n)]
    dist.sort(key=lambda x: -x["probability"])
    return dist


def _classify_day_type(token_counts: Counter) -> str:
    productive = sum(token_counts.get(t, 0) for t in PRODUCTIVE_TOKENS)
    recovery = sum(token_counts.get(t, 0) for t in RECOVERY_TOKENS)
    social = sum(token_counts.get(t, 0) for t in SOCIAL_TOKENS)
    total = productive + recovery + social + token_counts.get("other", 0)
    if total <= 0:
        return "productive"
    scores = {
        "productive": productive / total,
        "recovery": recovery / total,
        "social": social / total,
    }
    return max(scores, key=scores.get)


def _happiness_boost(history: list[dict], today_tokens: list[str | None]) -> dict | None:
    pairs = []
    for entry in history:
        h = entry.get("happiness")
        if h is None:
            continue
        counts = Counter(t for t in entry["tokens"] if t)
        if not counts:
            continue
        dominant = counts.most_common(1)[0][0]
        pairs.append((dominant, h))

    if len(pairs) < 5:
        return None

    by_token: dict[str, list[int]] = defaultdict(list)
    for tok, h in pairs:
        by_token[tok].append(h)

    overall = sum(h for _, h in pairs) / len(pairs)
    scored = []
    for tok, vals in by_token.items():
        if len(vals) < 3:
            continue
        mean_h = sum(vals) / len(vals)
        scored.append({
            "token": tok,
            "mean_happiness": round(mean_h, 2),
            "lift": round(mean_h - overall, 2),
            "sample_days": len(vals),
        })
    if not scored:
        return None
    scored.sort(key=lambda s: (-s["lift"], -s["mean_happiness"]))
    best = scored[0]

    today_counts = Counter(t for t in today_tokens if t)
    today_dominant = today_counts.most_common(1)[0][0] if today_counts else None
    suggestion = best["token"]
    if today_dominant == suggestion and len(scored) > 1:
        suggestion = scored[1]["token"]

    return {
        "suggested_token": suggestion,
        "mean_happiness": best["mean_happiness"],
        "lift_vs_average": best["lift"],
        "based_on_days": best["sample_days"],
        "model": "local_forecast",
        "note": (
            f"On your logged days, more {suggestion} hours correlate with "
            f"happiness ~{best['lift']:+.1f} vs your average."
        ),
    }


def _predict_remaining(
    today_grid: list[str | None],
    current_hour: int,
    history: list[dict],
    bigrams: dict[str, Counter],
    slot_counts: dict[int, Counter],
    max_slots: int = 6,
) -> list[dict]:
    """Predict up to max_slots upcoming hour categories for the rest of today."""
    context = [t for t in today_grid[: current_hour + 1] if t]
    prev = context[-1] if context else None
    predictions = []
    painted_ahead = 0

    for hour in range(current_hour + 1, 24):
        if today_grid[hour] is not None:
            prev = today_grid[hour]
            context.append(prev)
            continue
        if len(predictions) >= max_slots:
            break
        markov = _markov_next(prev, bigrams, hour, slot_counts)
        attn = _attention_stub_next(context[-6:], bigrams)
        blended = Counter()
        for item in markov:
            blended[item["token"]] += item["probability"] * 0.55
        for item in attn:
            blended[item["token"]] += item["probability"] * 0.45
        dist = _token_distribution(blended, smoothing=0.1)
        top = dist[0]
        predictions.append({
            "hour": hour,
            "token": top["token"],
            "probability": top["probability"],
            "alternatives": dist[1:3],
        })
        prev = top["token"]
        context.append(prev)
        painted_ahead += 1

    if not predictions and painted_ahead == 0:
        for hour in range(current_hour + 1, min(24, current_hour + 1 + max_slots)):
            dist = _markov_next(prev, bigrams, hour, slot_counts)
            top = dist[0]
            predictions.append({
                "hour": hour,
                "token": top["token"],
                "probability": top["probability"],
                "alternatives": dist[1:3],
            })
            prev = top["token"]
    return predictions


def build_forecast(date_str: str | None = None) -> dict:
    """Build local forecast for *date_str* (defaults to today)."""
    target = date_str or date_cls.today().isoformat()
    now = datetime.now()
    current_hour = now.hour if target == date_cls.today().isoformat() else 23

    day = db.get_day(target)
    today_grid = _hour_grid_from_day(day.get("hours") or {})
    history = _load_history(limit_days=500)
    bigrams = _build_bigram_counts(history)
    slot_counts = _build_hour_slot_counts(history)

    token_counts = Counter(t for t in today_grid if t)
    day_type = _classify_day_type(token_counts)
    remaining = _predict_remaining(
        today_grid, current_hour, history, bigrams, slot_counts, max_slots=6,
    )
    happiness = _happiness_boost(history, today_grid)

    labels = {c["key"]: c["label"] for c in db.list_categories()}
    token_labels = {
        "work": labels.get("work", "Work"),
        "thinking": labels.get("thinking", "Thinking"),
        "social": labels.get("social", "Social"),
        "recovery": labels.get("sleep", "Recovery"),
        "planned": labels.get("planned", "Planned"),
        "other": labels.get("other", "Other"),
    }

    for pred in remaining:
        pred["label"] = token_labels.get(pred["token"], pred["token"].replace("_", " ").title())
        for alt in pred.get("alternatives", []):
            alt["label"] = token_labels.get(alt["token"], alt["token"])

    if happiness:
        happiness["label"] = token_labels.get(
            happiness["suggested_token"], happiness["suggested_token"],
        )

    return {
        "model": "local_forecast",
        "date": target,
        "current_hour": current_hour,
        "day_type": day_type,
        "history_days": len(history),
        "painted_hours_today": sum(1 for t in today_grid if t),
        "next_activities": remaining,
        "happiness_boost": happiness,
        "tokens": list(FORECAST_TOKENS),
        "insufficient_data": len(history) < 3,
        "interpolated_hours": _interpolate_today_gaps(today_grid),
        "happiness_month_outlook": _month_happiness_outlook(history),
    }


def _interpolate_today_gaps(grid: list[str | None]) -> list[dict]:
    filled = list(grid)
    last = None
    for i, tok in enumerate(filled):
        nxt = next((filled[j] for j in range(i + 1, len(filled)) if filled[j]), None)
        if tok is None and last and nxt and last == nxt:
            filled[i] = last
        if filled[i]:
            last = filled[i]
    return [
        {"hour": hour, "token": tok, "interpolated": grid[hour] is None and tok is not None}
        for hour, tok in enumerate(filled) if tok
    ]


def _month_happiness_outlook(history: list[dict]) -> dict | None:
    scores = [entry.get("happiness") for entry in history if entry.get("happiness") is not None]
    if len(scores) < 3:
        return None
    recent = scores[:14]
    mean = sum(recent) / len(recent)
    older = scores[14:28] or recent
    older_mean = sum(older) / len(older)
    slope = mean - older_mean
    return {
        "recent_avg": round(mean, 2),
        "delta_vs_prior": round(slope, 2),
        "outlook": "up" if slope > 0.15 else ("down" if slope < -0.15 else "steady"),
    }
