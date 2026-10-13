"""Token/credit budget manager: usage reporting and local optimization analysis.

Guiding principle (owner directive): RESULTS > COST, always. This module never
recommends trading output quality for savings. Optimization means eliminating waste
on high-volume, low-stakes paths (task parsing, practice games) — judgment, chat,
planning, and coding quality stay on the strongest models by design.
"""
import json
from datetime import date, timedelta
from pathlib import Path

import ai
import db
import model_roles

VAULT_PATH = Path(__file__).parent / "obsidian_vault" / "Token Budget.md"

EXPENSIVE_CLAUDE_MARKERS = ("opus", "sonnet", "claude")


def _model_cost(model, in_tok, out_tok):
    in_price, out_price = db._PRICING.get(model, (3.0, 15.0))
    return (in_tok or 0) / 1_000_000 * in_price + (out_tok or 0) / 1_000_000 * out_price


def _parse_budget(settings):
    raw = (settings.get("budget_usd_month") or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _budget_status(spent, budget):
    if budget is None or budget <= 0:
        return "ok"
    ratio = spent / budget
    if ratio > 1.0:
        return "over"
    if ratio > 0.7:
        return "warning"
    return "ok"


def _usage_by_day(days=30):
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    conn = db.get_conn()
    rows = conn.execute(
        """
        SELECT substr(created_at, 1, 10) AS day, model,
               SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok
        FROM api_usage
        WHERE substr(created_at, 1, 10) >= ?
        GROUP BY day, model
        ORDER BY day ASC
        """,
        (start,),
    ).fetchall()
    conn.close()

    by_day = {}
    for r in rows:
        day = r["day"]
        entry = by_day.setdefault(day, {"date": day, "tokens": 0, "cost_usd": 0.0})
        in_tok = r["in_tok"] or 0
        out_tok = r["out_tok"] or 0
        cost = _model_cost(r["model"], in_tok, out_tok)
        entry["tokens"] += in_tok + out_tok
        entry["cost_usd"] += cost

    return [
        {"date": d, "tokens": v["tokens"], "cost_usd": round(v["cost_usd"], 4)}
        for d, v in sorted(by_day.items())
    ]


def spent_today():
    """Sum today's api_usage cost in USD."""
    today = date.today().isoformat()
    conn = db.get_conn()
    rows = conn.execute(
        """
        SELECT model, SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok
        FROM api_usage
        WHERE substr(created_at, 1, 10) = ?
        GROUP BY model
        """,
        (today,),
    ).fetchall()
    conn.close()
    total = 0.0
    for r in rows:
        total += _model_cost(r["model"], r["in_tok"], r["out_tok"])
    return round(total, 4)


def daily_cap():
    """Owner-configurable daily spend cap (USD); default $3."""
    raw = (db.get_settings().get("daily_budget_usd") or "").strip()
    if not raw:
        return 3.0
    try:
        val = float(raw)
        return val if val > 0 else 3.0
    except ValueError:
        return 3.0


def cap_pressure():
    """Ratio of today's spend to the daily cap (0.0 if cap unset/zero)."""
    cap = daily_cap()
    if cap <= 0:
        return 0.0
    return spent_today() / cap


def _spent_this_month():
    month_prefix = date.today().strftime("%Y-%m")
    conn = db.get_conn()
    rows = conn.execute(
        """
        SELECT model, SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok
        FROM api_usage
        WHERE substr(created_at, 1, 7) = ?
        GROUP BY model
        """,
        (month_prefix,),
    ).fetchall()
    conn.close()
    total = 0.0
    for r in rows:
        total += _model_cost(r["model"], r["in_tok"], r["out_tok"])
    return round(total, 4)


def _is_expensive_claude(model):
    if model.startswith("openai:") or model.startswith("grok:"):
        return False
    lower = model.lower()
    return any(m in lower for m in EXPENSIVE_CLAUDE_MARKERS)


def usage_report():
    totals = db.total_api_usage()
    settings = db.get_settings()
    budget_usd_month = _parse_budget(settings)
    spent_this_month = _spent_this_month()
    by_model = totals.get("by_model", [])
    top_spenders = sorted(by_model, key=lambda m: m.get("estimated_cost_usd", 0), reverse=True)

    return {
        "total_tokens": totals["total_tokens"],
        "estimated_cost_usd": totals["estimated_cost_usd"],
        "by_model": by_model,
        "by_day": _usage_by_day(30),
        "spent_this_month": spent_this_month,
        "spent_today": spent_today(),
        "daily_cap": daily_cap(),
        "budget_usd_month": budget_usd_month,
        "budget_status": _budget_status(spent_this_month, budget_usd_month),
        "routing": model_roles.routing_snapshot(),
        "top_spenders": top_spenders,
    }


def _local_recommendations(report):
    recs = []
    total_cost = report.get("estimated_cost_usd") or 0.0
    by_model = report.get("by_model") or []
    routing = report.get("routing") or {}
    budget_status = report.get("budget_status", "ok")
    budget = report.get("budget_usd_month")
    spent_month = report.get("spent_this_month") or 0.0

    claude_cost = sum(
        m.get("estimated_cost_usd", 0)
        for m in by_model
        if _is_expensive_claude(m.get("model", ""))
    )
    claude_share = (claude_cost / total_cost) if total_cost > 0 else 0.0

    cheap_alt = model_roles.openai_configured() or model_roles.grok_configured()
    if claude_share >= 0.5 and cheap_alt:
        expensive = [m["model"] for m in by_model if _is_expensive_claude(m.get("model", ""))]
        top = expensive[0] if expensive else "Claude"
        alt = "openai or grok" if model_roles.openai_configured() and model_roles.grok_configured() else (
            "openai" if model_roles.openai_configured() else "grok"
        )
        recs.append({
            "finding": f"Expensive Claude models ({top}) account for ~{claude_share * 100:.0f}% of estimated spend.",
            "recommendation": (
                f"Route high-volume roles to {alt}: set route_tasks, route_practice, and route_coding "
                f"to {alt.split(' or ')[0]} (or auto) in settings so tasks, practice games, and coding Q&A "
                "use cheaper models."
            ),
        })

    # Only the genuinely low-stakes, high-volume roles are downgrade candidates.
    # Coding is deliberately excluded: results > cost.
    cheaper_roles = ("tasks", "practice")
    on_claude = [r for r in cheaper_roles if routing.get(r, {}).get("backend") == "claude"]
    if on_claude and cheap_alt:
        alt = "openai, grok, or auto" if model_roles.openai_configured() and model_roles.grok_configured() else (
            "openai or auto" if model_roles.openai_configured() else "grok or auto"
        )
        recs.append({
            "finding": f"High-volume low-stakes roles still on Claude backend: {', '.join(on_claude)}.",
            "recommendation": (
                f"Switch {', '.join(on_claude)} to {alt} in model routing — same results "
                "on these mechanical paths, lower cost. Judgment/chat/planning/coding stay premium."
            ),
        })

    if budget_status in ("warning", "over") and budget:
        pct = (spent_month / budget * 100) if budget else 0
        recs.append({
            "finding": f"Monthly spend ${spent_month:.2f} is {pct:.0f}% of ${budget:.2f} budget ({budget_status}).",
            "recommendation": (
                "Enable cheaper routes for tasks/practice/coding, reduce opt-in AI features "
                "(competition scan, idea similarity, schedule optimizer), and use the API kill switch "
                "for non-essential calls until month-end."
            ),
        })

    # Results > cost: Ollama is surfaced as an offline/backup option only, never as a
    # quality downgrade recommendation for coding or judgment work.
    if ai.local_model_available():
        recs.append({
            "finding": f"Ollama is reachable locally ({ai.LOCAL_MODEL_NAME}).",
            "recommendation": (
                "Offline fallback is ready. Keep coding/judgment on cloud models for quality; "
                "Ollama covers you when offline, not as a cost downgrade."
            ),
        })

    if not recs and total_cost == 0:
        recs.append({
            "finding": "No API usage recorded yet.",
            "recommendation": "Set a monthly budget_usd_month before heavy AI use so warnings trigger early.",
        })

    return recs


def _ai_recommendations(report):
    stats = {
        "total_tokens": report.get("total_tokens"),
        "estimated_cost_usd": report.get("estimated_cost_usd"),
        "spent_this_month": report.get("spent_this_month"),
        "budget_usd_month": report.get("budget_usd_month"),
        "budget_status": report.get("budget_status"),
        "top_spenders": [
            {"model": m["model"], "cost": m.get("estimated_cost_usd")}
            for m in (report.get("top_spenders") or [])[:5]
        ],
        "routing_backends": {k: v.get("backend") for k, v in (report.get("routing") or {}).items()},
    }
    prompt = f"""You are a token-budget advisor for a personal planner app. Given these usage stats,
suggest 2-3 concrete, actionable optimization ideas (routing changes, feature usage, caps).
Do not repeat generic advice already obvious from the numbers.

HARD RULE: results > cost, always. Never suggest downgrading model quality for judgment,
chat, planning, or coding work. Only suggest cheaper routing where output quality is
unaffected (mechanical/high-volume paths), or ways to eliminate wasted calls entirely.

Stats JSON:
{json.dumps(stats)}

Respond with ONLY a JSON array of 2-3 objects:
[{{"finding": "...", "recommendation": "..."}}]"""
    data = ai.route_json("tasks", prompt, max_tokens=500)
    if not isinstance(data, list):
        return []
    out = []
    for item in data:
        if isinstance(item, dict) and item.get("finding") and item.get("recommendation"):
            out.append({
                "finding": str(item["finding"]),
                "recommendation": str(item["recommendation"]),
            })
    return out[:3]


def _build_markdown(report, recommendations, previous_section=""):
    today = date.today().isoformat()
    lines = [
        "# Token Budget",
        "",
        f"**Generated:** {today}",
        "",
        "> Principle: **results > cost**. Optimization removes waste on low-stakes paths;",
        "> it never trades output quality for savings.",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Total tokens | {report.get('total_tokens', 0):,} |",
        f"| Estimated total cost (USD) | ${report.get('estimated_cost_usd', 0):.4f} |",
        f"| Spent this month (USD) | ${report.get('spent_this_month', 0):.4f} |",
    ]
    budget = report.get("budget_usd_month")
    if budget is not None:
        lines.append(f"| Monthly budget (USD) | ${budget:.2f} |")
        lines.append(f"| Budget status | {report.get('budget_status', 'ok')} |")
    else:
        lines.append("| Monthly budget (USD) | not set |")

    lines.extend(["", "## Recommendations", ""])
    if recommendations:
        for i, rec in enumerate(recommendations, 1):
            lines.append(f"{i}. **{rec['finding']}** — {rec['recommendation']}")
    else:
        lines.append("- No changes suggested; routing and spend look reasonable.")

    if previous_section:
        lines.extend(["", previous_section])

    return "\n".join(lines) + "\n"


def _previous_report_section():
    if not VAULT_PATH.exists():
        return ""
    content = VAULT_PATH.read_text(encoding="utf-8")
    if not content.strip():
        return ""
    prev_lines = content.splitlines()
    trimmed = prev_lines[-100:] if len(prev_lines) > 100 else prev_lines
    return "## Previous report\n\n" + "\n".join(trimmed)


def optimize_allocation():
    report = usage_report()
    recommendations = _local_recommendations(report)

    try:
        recommendations.extend(_ai_recommendations(report))
    except Exception as exc:
        print(f"[budget] optional AI recommendations failed: {exc}")

    previous = _previous_report_section()
    markdown = _build_markdown(report, recommendations, previous_section=previous)

    VAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    VAULT_PATH.write_text(markdown, encoding="utf-8")

    return {
        "report": markdown,
        "path": str(VAULT_PATH),
        "recommendations": recommendations,
    }
