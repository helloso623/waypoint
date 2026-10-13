"""Orchestrator: single entry point the app calls into. It routes each job to a
named subagent. Every subagent calls the Anthropic API (ai.py); a few
(currently daily_reflector) automatically fall back to a local Ollama model
if the Anthropic call fails for a connectivity reason -- see
ai.local_model_available()/ai._call_local_model() for the real implementation,
which lives in ai.py (not here) since that's where the Anthropic-calling
functions it wraps already live.

To add a subagent: write the function, register it in SUBAGENTS, call
orchestrator.run("name", **kwargs) from app.py.
"""
import threading
import time
import uuid

import ai
import budget
import db
import notify
import obsidian_sync

_registry_lock = threading.Lock()
_running = {}


def list_running():
    """In-process subagent runs still executing (not the Agent-tab chat turn)."""
    now = time.time()
    with _registry_lock:
        return [
            {
                "id": run_id,
                "name": info["name"],
                "age_seconds": round(now - info["started_at"], 1),
                "cancel_requested": bool(info.get("cancel_requested")),
            }
            for run_id, info in _running.items()
        ]


def request_cancel(run_id):
    """Best-effort cooperative cancel: sets the run's cancel flag."""
    with _registry_lock:
        info = _running.get(run_id)
        if not info:
            return {"ok": False, "agent_id": run_id, "error": "no running agent with that id"}
        info["cancel"].set()
        info["cancel_requested"] = True
        return {
            "ok": True,
            "agent_id": run_id,
            "name": info["name"],
            "cancel_requested": True,
        }

def goal_chunker(title, deadline, today):
    """Subagent: splits a goal into dated, editable chunks."""
    return ai.chunk_goal(title, deadline, today)


def goal_coach(goal, today):
    """Creative, proposal-only coaching for one goal; app.py owns every confirmed write."""
    return ai.coach_goal(goal, today)


def daily_reflector(date, metrics, hours_by_category):
    """Subagent: writes the end-of-day summary used in the email + Obsidian note."""
    return ai.daily_summary(date, metrics, hours_by_category)


def day_title_engraver(receipt_summaries):
    """Subagent: engraves a short evocative day title from receipt summaries (Trends filmstrip)."""
    return ai.engrave_day_title(receipt_summaries)


def contact_scout(contacts):
    """Subagent: decides who's gone cold and worth reaching out to.
    Currently only reasons over warmth/last_contact/current_focus already in
    the DB. Two follow-up subagents to wire in later:
      - a screenshot-OCR agent that reads the messages you photograph (press
        the hotkey) and updates warmth/last_contact automatically
      - a LinkedIn-watcher agent that refreshes current_focus per contact
    """
    return ai.suggest_contact_outreach(contacts)


def schedule_optimizer(stats, recent_days, category_labels):
    """Subagent: the backlog's "happiness-maximizing scheduler" -- proposes a suggested
    allocation for tomorrow, grounded only in Pearson correlations the caller already
    computed from the user's real days/hours history (never computed by the model itself).
    Suggestion-only: nothing in this path writes to days/hours, the schedule, or the
    calendar -- it's surfaced as a button on the Today tab the user can take or leave.
    """
    return ai.suggest_schedule(stats, recent_days, category_labels)


def social_post_suggester(date, metrics, hours_by_category, day_notes, hour_notes):
    """Subagent: turns a day's already-logged activity (same data daily_reflector uses for the
    end-of-day summary, plus the per-hour notes for real specifics) into 1-3 short, specific
    social-media caption ideas. Opt-in -- a button on the Today tab, next to the daily summary --
    not automatic, since it's a real API call. This app has no social posting integration: these
    are just copyable caption ideas, nothing here posts anywhere on its own.
    """
    return ai.suggest_social_posts(date, metrics, hours_by_category, day_notes, hour_notes)


def vibecode_category(instruction):
    """Subagent: turns a freeform instruction into a structured hour-category
    (key/label/color), applied immediately -- this is the app's "vibecoding":
    instead of you hand-editing category config, you describe it and the AI
    fills in the structured part.
    """
    return ai.parse_category_instruction(instruction)


def competition_scout(project_description):
    """Subagent: finds hackathons/competitions to enter and competitors, via web search."""
    return ai.research_competitions(project_description)


def task_validator(day_notes, open_tasks):
    """Subagent: reads a day's notes and marks related open tasks done/partial -- the
    "AI does most of the doing" half of the to-do list, so you don't have to manually
    check things off after already writing about them in the daily notes.
    """
    return ai.validate_tasks_from_notes(day_notes, open_tasks)


def suggest_urgency(title, notes):
    """Subagent: classifies a task's urgency -- opt-in (a button), not automatic on every
    add, so it doesn't add API cost to every single task.
    """
    return ai.suggest_urgency(title, notes)


def codebase_summarizer(project_name, file_samples):
    """Subagent: reads real source files from a registered project's folder and summarizes
    what the code does -- used to flag similar *projects* by actual implementation, not just
    the description text you typed in.
    """
    return ai.summarize_codebase(project_name, file_samples)


def project_description_from_readme(project_name, readme_text):
    """Subagent: condenses a registered project's own README.md into a short description,
    so you don't have to retype what you already wrote there.
    """
    return ai.describe_project_from_readme(project_name, readme_text)


def workflow_code_reviewer(code):
    """Subagent: opt-in efficiency/correctness pass over Automation Studio's generated code,
    advice only -- never rewrites the workflow itself.
    """
    return ai.suggest_workflow_improvements(code)


def workflow_code_explainer(full_code, selection):
    """Subagent: explains a highlighted slice of Automation Studio's generated code, grounded
    in the full generated code around it, so you're not guessing what a node actually produced.
    """
    return ai.explain_workflow_code_selection(full_code, selection)


def workflow_vibecoder(description, node_catalog):
    """Subagent: turns a natural-language workflow idea into a validated Automation Studio graph."""
    return ai.generate_workflow_graph(description, node_catalog)


def workflow_improver(current_graph, instruction, node_catalog):
    """Subagent: modifies an existing Automation Studio graph per user instruction (Continue/Fix)."""
    return ai.improve_workflow_graph(current_graph, instruction, node_catalog)


def practice_challenge(game_key, difficulty):
    """Subagent: generates one round of an AI practice minigame (challenge + hidden grading
    key). Routed OpenAI-first inside ai.py for cost -- these run often and don't need
    Claude-level judgment.
    """
    return ai.generate_practice_challenge(game_key, difficulty)


def practice_grader(game_key, challenge, reference, answer):
    """Subagent: grades a free-text practice-game answer 0-10 against the round's hidden
    grading key, with concrete feedback. Same OpenAI-first routing as practice_challenge.
    """
    return ai.grade_practice_answer(game_key, challenge, reference, answer)


def review_proposed_change(action_type, payload):
    """Subagent: a second, independent pass over a staged self-coding action (file edit or
    shell command) -- runs the moment propose_file_edit/propose_command stages something, before
    the human sees the approve/reject buttons. Surfaces a plain-language risk summary; never
    blocks staging itself (the human approval stays the only real gate).
    """
    return ai.review_proposed_change(action_type, payload)


def fact_check_agent_reply(reply, actions, user_message=""):
    """Subagent: independent judgment pass over an agent chat reply vs tool evidence."""
    return ai.fact_check_agent_reply(reply, actions, user_message=user_message)


def event_scout(location, interests):
    """Subagent: scans the web for events matching your interests near your
    recorded location (both captured in the settings table from the Events tab).
    """
    return ai.research_events(location, interests)


def idea_similarity_scout(title, body):
    """Subagent: web-searches for existing products/projects/discussions similar to one of
    the user's own ideas -- opt-in per idea (a button), not automatic, since a real
    web-search call costs real API budget.
    """
    return ai.find_similar_ideas(title, body)


def document_classifier(filename, text):
    """Subagent: reads text extracted from an uploaded document (PDF/.docx) and proposes
    items to file across Ideas/Skills/Problems/Thinking. Proposals only -- the caller
    (the document-classify route) doesn't insert anything until the human reviews and
    confirms.
    """
    return ai.classify_document(filename, text)


def idea_evaluator(title, body):
    """Subagent: scores an idea's title+body and returns investor-style structured feedback,
    judged from the text alone -- competition_scout covers real research, but only for a
    registered *project*, not a freeform idea.
    """
    return ai.evaluate_idea(title, body)


def investor_pitch_reply(title, body, question, user_reply):
    """Subagent: single in-character investor follow-up after the user responds to one of
    idea_evaluator's questions -- lightweight pitch role-play, not a persisted conversation.
    """
    return ai.pitch_reply(title, body, question, user_reply)


def freeform_task_parser(text):
    """Subagent: turns a rambling, unpunctuated task brain-dump (the user's real fast-typing
    style) into one or more clean, well-titled tasks with cleaned notes, a proposed urgency, and
    a grounded rough hour estimate (or an honest "can't estimate" instead of a fabricated one).
    Proposals only -- same review-before-commit pattern as document_classifier; the Tasks tab's
    quick-capture route doesn't create anything until the human reviews and confirms.
    """
    return ai.parse_freeform_tasks(text)


def class_schedule_parser(text, today):
    """Subagent: parses pasted class schedule text (NYU Albert, registrar exports, etc.)
    into structured course rows for review before creating recurring calendar events."""
    return ai.parse_class_schedule(text, today)


def budget_manager():
    """Subagent: analyzes API token spend and writes optimization recommendations to Obsidian."""
    return budget.optimize_allocation()


SUBAGENTS = {
    "goal_chunker": goal_chunker,
    "goal_coach": goal_coach,
    "daily_reflector": daily_reflector,
    "day_title_engraver": day_title_engraver,
    "schedule_optimizer": schedule_optimizer,
    "social_post_suggester": social_post_suggester,
    "contact_scout": contact_scout,
    "event_scout": event_scout,
    "idea_similarity_scout": idea_similarity_scout,
    "vibecode_category": vibecode_category,
    "competition_scout": competition_scout,
    "task_validator": task_validator,
    "suggest_urgency": suggest_urgency,
    "codebase_summarizer": codebase_summarizer,
    "project_description_from_readme": project_description_from_readme,
    "workflow_code_reviewer": workflow_code_reviewer,
    "workflow_code_explainer": workflow_code_explainer,
    "workflow_vibecoder": workflow_vibecoder,
    "workflow_improver": workflow_improver,
    "practice_challenge": practice_challenge,
    "practice_grader": practice_grader,
    "idea_evaluator": idea_evaluator,
    "investor_pitch_reply": investor_pitch_reply,
    "review_proposed_change": review_proposed_change,
    "fact_check_agent_reply": fact_check_agent_reply,
    "document_classifier": document_classifier,
    "freeform_task_parser": freeform_task_parser,
    "class_schedule_parser": class_schedule_parser,
    "budget_manager": budget_manager,
}


def run(name, **kwargs):
    """Every subagent call goes through here so agent activity can be logged and
    mirrored to Obsidian (`Agent Activity.md`) -- this is what lets you watch
    what each agent is doing without adding logging to every call site.

    Logs a "running" row *before* calling the subagent (not just after it
    finishes) so the Agent tab can show what's actually in flight right now,
    not only a history of already-completed runs.
    """
    if name not in SUBAGENTS:
        raise ValueError(f"unknown subagent: {name}")
    key_arg = next(iter(kwargs.values()), "")
    snippet = str(key_arg).replace("\n", " ")[:60]
    log_id = None
    run_id = uuid.uuid4().hex[:8]
    cancel_event = threading.Event()
    with _registry_lock:
        _running[run_id] = {
            "name": name,
            "started_at": time.time(),
            "cancel": cancel_event,
            "cancel_requested": False,
        }
    try:
        log_id = db.start_agent_log(name, f"'{snippet}'...")
    except Exception as exc:
        print(f"[orchestrator] activity start-log failed: {exc}")
    try:
        result = SUBAGENTS[name](**kwargs)
        if cancel_event.is_set():
            print(f"[orchestrator] subagent {name} ({run_id}) finished after cancel was requested")
    except Exception:
        if log_id is not None:
            try:
                db.finish_agent_log(log_id, f"'{snippet}' -> failed")
            except Exception as exc:
                print(f"[orchestrator] activity finish-log failed: {exc}")
        raise
    finally:
        with _registry_lock:
            _running.pop(run_id, None)
    try:
        _finish_activity(log_id, name, kwargs, result)
    except Exception as exc:
        print(f"[orchestrator] activity log failed: {exc}")
    return result


def _finish_activity(log_id, name, kwargs, result):
    key_arg = next(iter(kwargs.values()), "")
    snippet = str(key_arg).replace("\n", " ")[:60]
    count = f" -> {len(result)} result(s)" if isinstance(result, list) else ""
    summary = f"'{snippet}'{count}"
    if log_id is not None:
        db.finish_agent_log(log_id, summary)
    else:
        db.insert_agent_log(name, summary)
    obsidian_sync.write_agent_activity(db.recent_agent_logs())
    if name == "daily_reflector":
        try:
            revised = ai.update_user_profile(result, kwargs.get("metrics") or {})
            db.save_settings({"user_profile": revised})
        except Exception as exc:
            print(f"[orchestrator] update_user_profile failed: {exc}")
    if db.get_settings().get("discord_notify") == "true":
        notify.send_discord(f"✅ {name}: {summary[:140]}")
