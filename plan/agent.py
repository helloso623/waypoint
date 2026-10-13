"""The in-app AI agent: a chat that can actually act on your data (add a goal,
log a calendar event, save an idea, ...) via tool use, instead of you filling
out each tab's form by hand. Conversation history persists in `agent_messages`
so it survives app restarts.

Separate from orchestrator.py's subagents: those are single-purpose, stateless
calls (chunk this goal, summarize this day); this is a multi-turn conversation
that decides which of several tools to call each turn.
"""
import json
import os
import re
import threading
import time
import unicodedata
from pathlib import Path

from anthropic import Anthropic

import ai
import backup
import chat_backends
import db
import embeddings
import model_roles
import orchestrator
import repository
import rules

NOTE_LIST_TYPES = ("skill", "problem", "thinking", "funny", "essay")
CONTEXT_MAX_CHARS = 7000
REPO_SUMMARY_MAX_CHARS = 800
REPO_FILE_MAX_CHARS = 80000
PROJECT_FILE_DEFAULT_CHARS = 20000
PROJECT_FILE_MAX_CHARS = 80000
REPO_LIST_MAX_FILES = 50
REPO_SUMMARY_PREVIEW_CHARS = 200
USER_PROFILE_MAX_CHARS = 600
CLASSIFY_MAX_CHARS = 100000
CLASSIFY_BIAS_LIST_TYPES = ("idea", "skill", "problem", "thinking", "funny", "essay")

MODEL = model_roles.anthropic_model("chat")
MAX_TOOL_ROUNDS = 12
MAX_FAKE_TOOL_RETRIES = 2
THINKING_BUDGET_TOKENS = 2500
_WRITE_INTENT_RE = re.compile(
    r"\b(add|create|save|log|track|recreate|retry|update|delete|remove|schedule|organize|"
    r"make|set|book|remind|put|grade|assign)\b",
    re.I,
)
_WRITE_ENTITY_RE = re.compile(
    r"\b(contacts?|customers?|tasks?|events?|notes?|ideas?|projects?|goals?|meetings?|"
    r"situations?|calendar|class(?:es)?|homework|assignments?|appointments?|reminders?)\b",
    re.I,
)
# Imperatives that are writes even without an entity word ("schedule Tuesday 9am").
_WRITE_COMMAND_RE = re.compile(
    r"\b(add|create|save|schedule|delete|remove|book|grade|remind)\b",
    re.I,
)
_WRITE_FAIL_RE = re.compile(
    r"\b(weren'?t|wasn'?t|were not|didn'?t|did not|never|not)\b.{0,48}"
    r"\b(added|saved|created|updated|written|done)\b",
    re.I,
)
_FORCE_TOOL_RE = re.compile(
    r"\b(use the tool|with the tool|actually (?:add|save|create|use)|call the tool|"
    r"not done|search .{0,20}tool)\b|\ba{3,}d+\b|\bt+o{2,}l+",
    re.I,
)
_HARD_TASK_RE = re.compile(
    r"\b(too hard|too difficult|this is hard|escalate|retry harder|"
    r"stronger model|use a stronger|try (?:gpt|openai|claude)|can'?t (?:do|solve) this)\b",
    re.I,
)
_FAKE_TOOL_PROSE_RE = re.compile(
    r"(?:contacts?|customers?|tasks?|notes?|projects?|events?)\s*\.\s*(?:add|create|update|delete)"
    r"|\*\*[a-z_]+\.[a-z_]+\*\*"
    r"|`[a-z_]+\.[a-z_]+`"
    r"|\badding (?:both|them|him|her|it|these|those) now\b"
    r"|\busing (?:the )?(?:contacts?|customers?) tool\b",
    re.I,
)
_CLAIM_WRITE_SUCCESS_RE = re.compile(
    r"\b(done|saved|added|created|updated|deleted|recorded|wrote|written)\b",
    re.I,
)
_COUNT_CLAIM_RE = re.compile(
    r"\b(\d+)\s+(contacts?|customers?|tasks?|events?|ideas?|projects?|notes?|goals?)\b",
    re.I,
)
BATCH_ADD_TASKS_MAX = 80
CODE_READ_TOOLS = frozenset({"read_project_file"})
SELF_CODING_WRITE_TOOLS = frozenset({"propose_file_edit", "propose_command"})
SELF_CODING_TOOL_NAMES = CODE_READ_TOOLS | SELF_CODING_WRITE_TOOLS
CONFIRMATION_TOOLS = frozenset({
    "create_situation",
    "delete_task", "delete_idea", "delete_note", "delete_project",
    "delete_event", "delete_calendar_event", "delete_contact", "delete_competition",
    "delete_repository_file",
    "delete_automation_rule",
})
WRITE_TOOLS = frozenset({
    "add_calendar_event", "add_goal", "add_idea", "add_project", "add_customer",
    "add_contact", "add_task", "batch_add_tasks", "add_recurring_class",
    "add_recurring_event", "complete_event", "complete_calendar_event",
    "update_event", "add_task_bet",
    "set_task_prerequisite", "add_alarm",
    "import_course_schedule", "preview_bulk_import", "preview_schedule_import",
    "grade_class_item", "update_task", "complete_task", "delete_task",
    "update_contact", "update_customer", "update_project", "update_idea",
    "update_note", "update_calendar_event",
    "add_note", "add_project_note", "classify_into_lists", "create_situation",
    "delete_idea", "delete_note", "delete_project", "delete_event",
    "delete_calendar_event",
    "delete_contact", "delete_competition", "delete_repository_file",
    "stop_agent", "propose_file_edit", "propose_command",
    "apply_style_paint", "set_hidden_apps",
    "create_automation_rule", "set_automation_rule_enabled", "delete_automation_rule",
    "test_automation_rule",
})
_CALENDAR_TOOL_ALIASES = {
    "complete_event": "complete_calendar_event",
    "delete_event": "delete_calendar_event",
}
_CALENDAR_UPDATE_FIELDS = (
    "title", "date", "start_time", "end_time", "category", "notes",
    "url", "kind", "lane", "status", "rrule", "series_id",
)
CONFIRM_TOOL_PREFIX = "[CONFIRM_TOOL]"

_steer_lock = threading.Lock()
_steer_queue = []
_chat_in_flight = False
_chat_cancel_requested = False

_client = None


def self_coding_enabled():
    """True only when the user explicitly enabled Developer / self-coding mode in Settings."""
    value = (db.get_settings().get("self_coding_enabled") or "false").strip().lower()
    return value in ("1", "true", "yes", "on")


def self_coding_permitted():
    """Self-coding tools register only when enabled AND Agent chat routes to Claude."""
    return self_coding_enabled() and model_roles.is_strong_coding_model("chat")


def code_edit_policy():
    """plan_confirm: plans only; propose_with_approval: staged edits when permitted."""
    return "propose_with_approval" if self_coding_permitted() else "plan_confirm"


def client():
    if not db.is_api_enabled():
        raise RuntimeError("API is disabled (kill switch is on) -- re-enable it in the app to use AI features.")
    import ai
    ai.check_daily_budget(role="chat")
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


TOOLS = [
    {
        "name": "add_calendar_event",
        "description": "Add an event to the calendar. Never invent a clock time — omit start_time/"
                       "end_time unless the user named them (untimed events are allowed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "date": {"type": "string", "description": "YYYY-MM-DD"},
                "start_time": {"type": "string", "description": "HH:MM only if the user named a time — never invent 9am"},
                "end_time": {"type": "string", "description": "HH:MM only if the user named an end — never invent one"},
                "notes": {"type": "string"},
                "url": {"type": "string", "description": "Zoom or meeting link"},
                "kind": {"type": "string", "description": "event or class — classes stay off the event calendar"},
                "lane": {"type": "string", "description": "work or passion"},
            },
            "required": ["title", "date"],
        },
    },
    {
        "name": "complete_event",
        "description": "Alias of complete_calendar_event — mark a calendar event done by id.",
        "input_schema": {
            "type": "object",
            "properties": {"event_id": {"type": "integer"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "complete_calendar_event",
        "description": "Mark a calendar event done by id (status=done). Use after the user finished "
                       "or attended it. Covers the day-plan calendar, not interest-tab events.",
        "input_schema": {
            "type": "object",
            "properties": {"event_id": {"type": "integer"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "update_event",
        "description": "Edit an Events-tab interest event (title, description, date range, times, url, status). "
                       "Not the day-plan calendar — use update_calendar_event for those.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "date": {"type": "string"},
                "end_date": {"type": "string"},
                "start_time": {"type": "string"},
                "end_time": {"type": "string"},
                "all_day": {"type": "boolean"},
                "location": {"type": "string"},
                "url": {"type": "string"},
                "status": {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "add_recurring_event",
        "description": "Materialize a weekly calendar series. Never invent a clock time — "
                       "ask for start_time/end_time or omit both. Do not default to 09:00.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD first occurrence"},
                "start_time": {"type": "string"},
                "end_time": {"type": "string"},
                "weeks": {"type": "integer"},
                "end_date": {"type": "string"},
                "category": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["title", "start_date"],
        },
    },
    {
        "name": "add_task_bet",
        "description": "Stake coins that a task will be done by a due date. Missed due dates forfeit into the pool.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "due_date": {"type": "string"},
                "coins": {"type": "integer"},
            },
            "required": ["task_id", "coins"],
        },
    },
    {
        "name": "set_task_prerequisite",
        "description": "Block a task until another task is done. Novel/hard work should sit behind a prerequisite.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "prerequisite_id": {"type": "integer"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "add_alarm",
        "description": "Schedule an alarm that dismisses only after a math or memory minigame.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "fire_at": {"type": "string", "description": "ISO timestamp"},
                "kind": {"type": "string", "enum": ["math", "memory"]},
            },
            "required": ["title", "fire_at"],
        },
    },
    {
        "name": "add_goal",
        "description": "Add a goal with a deadline. It gets auto-chunked into dated sub-tasks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "deadline": {"type": "string", "description": "YYYY-MM-DD"},
            },
            "required": ["title", "deadline"],
        },
    },
    {
        "name": "add_idea",
        "description": "Save a freeform idea (shows up in the 3D idea map).",
        "input_schema": {
            "type": "object",
            "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
            "required": ["title"],
        },
    },
    {
        "name": "add_project",
        "description": "Register a software or hardware project you're working on.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "kind": {"type": "string", "enum": ["software", "hardware"]},
            },
            "required": ["name"],
        },
    },
    {
        "name": "add_customer",
        "description": "Add a potential customer to track.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "company": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "add_contact",
        "description": "Create/save a personal contact in the Waypoint database (exact tool name: "
                       "add_contact — NOT contacts.add). This is the ONLY way to add a contact; "
                       "narrating 'contacts.add' in chat does nothing. Extract EVERY useful detail "
                       "from the user's message/context into the structured fields — do not leave "
                       "known facts only in chat. Put leftover context in notes/description. Prefer "
                       "filling what_they_do, met_where, met_when, email, phone, linkedin_url, "
                       "closeness, current_focus, and description whenever the user gave that "
                       "information. Call once per person.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "what_they_do": {
                    "type": "string",
                    "description": "role, job, company, craft — what they do",
                },
                "met_where": {
                    "type": "string",
                    "description": "where you met (event, city, intro, online, etc.)",
                },
                "met_when": {
                    "type": "string",
                    "description": "when you met (date, season, trip, approx ok)",
                },
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "linkedin_url": {"type": "string"},
                "closeness": {
                    "type": "string",
                    "enum": ["acquaintance", "contact", "friend", "close", "family", "work"],
                    "description": "relationship closeness bucket",
                },
                "current_focus": {
                    "type": "string",
                    "description": "what they are currently working on / care about",
                },
                "description": {
                    "type": "string",
                    "description": "rich profile summary from the context",
                },
                "notes": {
                    "type": "string",
                    "description": "any remaining facts, quotes, follow-ups, or context",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_contacts",
        "description": "Search contacts by name/notes/role. Use before update_contact when you only "
                       "know a name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "substring match on name, notes, role, etc."},
            },
        },
    },
    {
        "name": "update_contact",
        "description": "Update an existing contact. Pass contact_id when known; otherwise pass name "
                       "to resolve (use list_contacts if ambiguous). Include every field to change — "
                       "merge new facts into notes/description rather than wiping unknown fields. "
                       "Set append_notes:true to append to existing notes instead of replacing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "integer"},
                "name": {"type": "string", "description": "lookup key and/or new display name"},
                "what_they_do": {"type": "string"},
                "met_where": {"type": "string"},
                "met_when": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "linkedin_url": {"type": "string"},
                "closeness": {
                    "type": "string",
                    "enum": ["acquaintance", "contact", "friend", "close", "family", "work"],
                },
                "current_focus": {"type": "string"},
                "description": {"type": "string"},
                "notes": {"type": "string"},
                "append_notes": {
                    "type": "boolean",
                    "description": "if true, append notes to existing notes (default false = replace when notes provided)",
                },
            },
        },
    },
    {
        "name": "list_customers",
        "description": "Search customers by name/company/notes. Use before update_customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string"},
            },
        },
    },
    {
        "name": "update_customer",
        "description": "Update an existing customer by id (use list_customers first if needed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "integer"},
                "name": {"type": "string"},
                "company": {"type": "string"},
                "notes": {"type": "string"},
                "status": {"type": "string"},
                "append_notes": {"type": "boolean"},
            },
            "required": ["customer_id"],
        },
    },
    {
        "name": "update_project",
        "description": "Update an existing project by id (use list_projects first if needed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "status": {"type": "string"},
                "progress": {"type": "number", "description": "0-100"},
                "kind": {"type": "string"},
                "path": {"type": "string"},
                "run_command": {"type": "string"},
                "archive_notes": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "update_idea",
        "description": "Update an idea's title and/or body by id (use get_recent_ideas first if needed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "idea_id": {"type": "integer"},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["idea_id"],
        },
    },
    {
        "name": "update_note",
        "description": "Update a Capture-list note (skill/problem/thinking/funny/essay) by id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "integer"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "status": {"type": "string", "enum": ["open", "done"]},
                "proficiency": {"type": "integer", "description": "1-10 for skills"},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "update_calendar_event",
        "description": "Edit a calendar event by id in every way: time, date, title, url, status, "
                       "kind, notes, lane. Never invent a clock time — omit start_time/end_time "
                       "unless the user named them; persist named times exactly as HH:MM.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer"},
                "title": {"type": "string"},
                "date": {"type": "string", "description": "YYYY-MM-DD"},
                "start_time": {"type": "string", "description": "HH:MM only if the user named a time — never invent 9am"},
                "end_time": {"type": "string", "description": "HH:MM only if the user named an end — never invent one"},
                "category": {"type": "string"},
                "notes": {"type": "string"},
                "url": {"type": "string", "description": "Zoom or meeting link"},
                "kind": {"type": "string", "description": "event or class"},
                "lane": {"type": "string", "description": "work or passion"},
                "status": {"type": "string", "description": "planned, done, skipped"},
                "rrule": {"type": "string"},
                "series_id": {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "add_task",
        "description": "Add a to-do item. Urgency drives sort order and critical tasks email the "
                       "user immediately. Use progress_total/progress_unit for trackable-quantity "
                       "tasks (e.g. total=5, unit='h' for a 5-hour task) -- omit both for a simple "
                       "done/not-done task.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string", "description": "Multiline task description"},
                "notes": {"type": "string"},
                "urgency": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "due_date": {"type": "string", "description": "YYYY-MM-DD; omit unless the user named a date — never invent one"},
                "tags": {"type": "string", "description": "comma tags, e.g. speaking,school"},
                "estimate_minutes": {"type": "integer"},
                "deadline_kind": {"type": "string", "enum": ["hard", "indefinite"]},
                "progress_total": {"type": "number"},
                "progress_unit": {"type": "string"},
                "contact_id": {"type": "integer"},
                "project_id": {"type": "integer"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "batch_add_tasks",
        "description": "Create several to-dos in one call (max 80). Use when the user lists many "
                       "items. Each item needs a title. Omit due_date unless the user named a date. "
                       "Duplicate titles (already in the planner or in this batch) are skipped and "
                       "returned in skipped — do not invent a count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                            "tags": {"type": "string"},
                            "estimate_minutes": {"type": "integer"},
                            "urgency": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                            "notes": {"type": "string"},
                            "description": {"type": "string"},
                        },
                        "required": ["title"],
                    },
                },
            },
            "required": ["tasks"],
        },
    },
    {
        "name": "add_recurring_class",
        "description": "Add a weekly class and materialize it as recurring School calendar events. "
                       "weekday is 0=Monday through 6=Sunday. Times are HH:MM 24h.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "weekday": {"type": "integer", "minimum": 0, "maximum": 6},
                "start_time": {"type": "string"},
                "end_time": {"type": "string"},
                "location": {"type": "string"},
                "travel_minutes": {"type": "integer"},
                "notes": {"type": "string"},
                "horizon_weeks": {"type": "integer", "description": "how many weeks to project (1-52, default 16)"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD first meeting"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD last meeting (end of term)"},
            },
            "required": ["name", "weekday", "start_time", "end_time"],
        },
    },
    {
        "name": "preview_bulk_import",
        "description": "Preview a pasted list of tasks or events as one table without writing. "
                       "Do not use this for course timetables — use preview_schedule_import. "
                       "Call this once for a long list, then confirm to apply (duplicates skipped).",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "kind": {"type": "string", "enum": ["task", "event"]},
                "end_date": {"type": "string", "description": "YYYY-MM-DD term end for schedule imports"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "preview_schedule_import",
        "description": "Dedicated preview for a pasted course timetable (weekday + start–end + name). "
                       "Never invent times; skip lines without two clock times. Returns a table; "
                       "nothing is written until the user confirms. Do not bulk-add classes via "
                       "add_calendar_event or batch_add_tasks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD last class date"},
                "classes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "weekday": {"type": "integer"},
                            "start_time": {"type": "string"},
                            "end_time": {"type": "string"},
                            "end_date": {"type": "string"},
                        },
                        "required": ["name", "weekday", "start_time", "end_time"],
                    },
                },
            },
        },
    },
    {
        "name": "import_course_schedule",
        "description": "Apply a previously previewed course schedule as recurring classes with an "
                       "optional end_date so they stop at term end. Always preview first with "
                       "preview_schedule_import. Skips duplicate name+weekday+time slots.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD last class date"},
                "classes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "weekday": {"type": "integer"},
                            "start_time": {"type": "string"},
                            "end_time": {"type": "string"},
                            "end_date": {"type": "string"},
                        },
                        "required": ["name", "weekday", "start_time", "end_time"],
                    },
                },
            },
        },
    },
    {
        "name": "list_classes",
        "description": "List recurring classes with homework items and last auto-grade if any.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "grade_class_item",
        "description": "Run the auto-grader on a class homework/document item. Pass class_id and "
                       "item_id from list_classes. Optional student answer text.",
        "input_schema": {
            "type": "object",
            "properties": {
                "class_id": {"type": "integer"},
                "item_id": {"type": "integer"},
                "answer": {"type": "string"},
            },
            "required": ["class_id", "item_id"],
        },
    },
    {
        "name": "list_observations",
        "description": "Read UI observations / requested fixes the user submitted from the Observation "
                       "widget (also opened as GitHub issues). Use this when they ask you to act on "
                       "a quoted fix.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "list_tasks",
        "description": "Search and list existing tasks so you can find one to edit, complete, or "
                       "delete. Returns up to 30 matches with id, title, status, urgency, due_date, "
                       "and progress. Use this when the user refers to a task by name instead of id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["todo", "partial", "done"]},
                "search": {"type": "string", "description": "substring match on title or notes"},
            },
        },
    },
    {
        "name": "update_task",
        "description": "Update an existing task by id. Use list_tasks first if you only know the "
                       "title. Set status to 'done' to mark complete (completed_at is set "
                       "automatically).",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer"},
                "title": {"type": "string"},
                "urgency": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                "status": {"type": "string", "enum": ["todo", "partial", "done"]},
                "progress_done": {"type": "number"},
                "progress_total": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "complete_task",
        "description": "Mark an existing task as done. Shortcut for update_task with status='done'.",
        "input_schema": {
            "type": "object",
            "properties": {"task_id": {"type": "integer"}},
            "required": ["task_id"],
        },
    },
    {
        "name": "delete_task",
        "description": "Delete a task by id (recoverable from trash). After calling this, tell the "
                       "user you deleted it and include the task's exact title in your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"task_id": {"type": "integer"}},
            "required": ["task_id"],
        },
    },
    {
        "name": "list_running_agents",
        "description": "List subagents currently running elsewhere in the app (id, name, age). "
                       "Use before stop_agent so you know valid ids.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "stop_agent",
        "description": "Request cancellation of a running subagent by id (best-effort). Confirm with "
                       "the user which agent you're stopping.",
        "input_schema": {
            "type": "object",
            "properties": {"agent_id": {"type": "string"}},
            "required": ["agent_id"],
        },
    },
    {
        "name": "spawn_agent",
        "description": "Start another agent job in the background with its own prompt. "
                       "Use for parallel work. Confirm with the user before spawning many.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "add_to_cart",
        "description": "Queue something on the personal cart for the user to validate later. "
                       "Does not purchase — only stages a title, optional URL, and notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "url": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "list_cart",
        "description": "List queued/validated cart items the user still needs to confirm.",
        "input_schema": {
            "type": "object",
            "properties": {"status": {"type": "string", "description": "queued, validated, or rejected"}},
        },
    },
    {
        "name": "use_integration",
        "description": "Use a saved SDK/token from Settings (Cursor, Claude, ChatGPT, Codex, VS Code, Hugging Face, n8n, Obsidian). "
                       "Probes the live service or lists the vault. Never purchases and never runs a shell.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "cursor, claude, chatgpt, codex, vscode, huggingface, n8n, obsidian"},
                "action": {"type": "string", "description": "status, list, or ping"},
                "payload": {"type": "object"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "delete_idea",
        "description": "Delete an idea by id (recoverable from trash). Name the exact idea title in "
                       "your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"idea_id": {"type": "integer"}},
            "required": ["idea_id"],
        },
    },
    {
        "name": "delete_note",
        "description": "Delete a notes-list entry by id (recoverable from trash). Name the exact "
                       "note title in your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"note_id": {"type": "integer"}},
            "required": ["note_id"],
        },
    },
    {
        "name": "delete_project",
        "description": "Delete a project by id (recoverable from trash). Name the exact project in "
                       "your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"project_id": {"type": "integer"}},
            "required": ["project_id"],
        },
    },
    {
        "name": "delete_event",
        "description": "Alias of delete_calendar_event — delete a calendar event by id.",
        "input_schema": {
            "type": "object",
            "properties": {"event_id": {"type": "integer"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "delete_calendar_event",
        "description": "Delete a calendar event by id (permanent — not in trash). Name the exact "
                       "event title in your confirmation. Use when the user asks to remove or cancel it.",
        "input_schema": {
            "type": "object",
            "properties": {"event_id": {"type": "integer"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "delete_contact",
        "description": "Delete a contact by id (recoverable from trash). Name the exact contact in "
                       "your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"contact_id": {"type": "integer"}},
            "required": ["contact_id"],
        },
    },
    {
        "name": "delete_competition",
        "description": "Delete a competition entry by id (recoverable from trash). Name the exact "
                       "competition in your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"competition_id": {"type": "integer"}},
            "required": ["competition_id"],
        },
    },
    {
        "name": "scan_competitions",
        "description": "Web-search for hackathons/competitions to enter and competitors, given a "
                       "project description. IMPORTANT: before calling this, tell the user in plain "
                       "text what you're about to search for (a short summary) and wait for their "
                       "next message to confirm or adjust it -- don't call this on the first ask.",
        "input_schema": {
            "type": "object",
            "properties": {"project_description": {"type": "string"}},
            "required": ["project_description"],
        },
    },
    {
        "name": "search_repository",
        "description": "Search the user's uploaded file repository (TF-IDF RAG) for relevant "
                       "snippets. Use for topical search across many files — never invent content "
                       "that should come from their knowledge base. To read a specific uploaded file "
                       "in full, use list_repository_files then read_repository_file instead.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "k": {"type": "integer", "description": "max snippets to return (default 8)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_repository_files",
        "description": "List files in the user's uploaded Capture → Repository dump (id, filename, "
                       "category, word_count, summary preview). Optional category filter. Returns up "
                       "to 50 files. Use before read_repository_file when you need a specific file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "optional filter, e.g. Docs, Code, Notes, Research",
                },
            },
        },
    },
    {
        "name": "read_repository_file",
        "description": "Read text from one uploaded repository file by file_id or filename "
                       "(fuzzy substring match). Returns extracted text for documents; binary/media "
                       "files return metadata only. For large files, read in chunks via offset until "
                       "truncated is false.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_id": {"type": "integer", "description": "repo_files id from list_repository_files"},
                "filename": {"type": "string", "description": "filename or substring to match"},
                "offset": {
                    "type": "integer",
                    "description": "character offset to start reading from (default 0)",
                },
                "max_chars": {
                    "type": "integer",
                    "description": f"max characters to return per call (default {REPO_FILE_MAX_CHARS}, cap {REPO_FILE_MAX_CHARS})",
                },
            },
        },
    },
    {
        "name": "summarize_repository",
        "description": "Rebuild the rolling master summary of all repository files (may use AI). "
                       "Use when the user asks what's in their repo or wants an updated overview.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "delete_repository_file",
        "description": "Delete one uploaded repository file by file_id (permanent — not in trash). "
                       "First call without confirmed returns proposed_actions; only deletes when "
                       "confirmed:true after the user approves. Name the exact filename in your reply.",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_id": {"type": "integer", "description": "repo_files id from list_repository_files"},
                "confirmed": {
                    "type": "boolean",
                    "description": "set true only after the user explicitly approves the proposed deletion",
                },
            },
            "required": ["file_id"],
        },
    },
    {
        "name": "get_overdue_tasks",
        "description": "List open tasks whose due_date is before today.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_todays_plan",
        "description": "Today's day metrics/hour grid, calendar events, and tasks due today.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_projects",
        "description": "List projects with id, name, kind, status, and progress percent.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "optional filter, e.g. active or done"},
            },
        },
    },
    {
        "name": "get_recent_ideas",
        "description": "Return the most recently saved ideas (id, title, body preview).",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "default 10, max 20"},
            },
        },
    },
    {
        "name": "classify_into_lists",
        "description": "Analyze document text and propose Capture list entries (skill, problem, thinking, "
                       "funny, essay, or idea). Returns proposals only — does NOT insert into the database. "
                       "Pass text when content is already in the chat (e.g. --- BEGIN FILE CONTENT --- blocks); "
                       "or file_id to load from the repository. After reviewing proposals, use add_note or "
                       "add_idea to save approved items.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "document text — use when content is already in the chat",
                },
                "filename": {
                    "type": "string",
                    "description": "label for the source (e.g. original filename)",
                },
                "file_id": {
                    "type": "integer",
                    "description": "repository file id — loads extracted text from Capture → Repository",
                },
                "bias_list": {
                    "type": "string",
                    "enum": list(CLASSIFY_BIAS_LIST_TYPES),
                    "description": "optional hint to prefer one list type when ambiguous",
                },
            },
        },
    },
    {
        "name": "add_note",
        "description": "Add an entry to a freeform list (skills, problems, thinking, funny, essay).",
        "input_schema": {
            "type": "object",
            "properties": {
                "list_type": {"type": "string", "enum": list(NOTE_LIST_TYPES)},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["list_type", "title"],
        },
    },
    {
        "name": "add_project_note",
        "description": "Log a devlog / project note (category e.g. general, bug, feature, decision).",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "integer"},
                "category": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["project_id", "body"],
        },
    },
    {
        "name": "create_situation",
        "description": "Capture a real-world situation in one call by creating or updating multiple linked "
                       "records: contact note, project note, task, calendar event, and/or capture note. "
                       "Use when the user describes something that spans several areas (e.g. met someone, "
                       "log it on the project, schedule a follow-up). First call without confirmed returns "
                       "proposed_actions (plan only — nothing written); call again with confirmed:true "
                       "after the user approves. Partial success is OK on execute — created + errors. "
                       "Look up contact_id / project_id with list tools when unknown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "short natural-language label for this situation",
                },
                "confirmed": {
                    "type": "boolean",
                    "description": "set true only after the user explicitly approves the proposed plan",
                },
                "contact": {
                    "type": "object",
                    "description": "Update or create a contact. Extract every useful detail from "
                                   "context into structured fields (role, where/when met, email, "
                                   "phone, closeness, focus, description) — not just a name.",
                    "properties": {
                        "contact_id": {"type": "integer"},
                        "name": {"type": "string", "description": "lookup or create if no contact_id"},
                        "what_they_do": {"type": "string"},
                        "met_where": {"type": "string"},
                        "met_when": {"type": "string"},
                        "email": {"type": "string"},
                        "phone": {"type": "string"},
                        "linkedin_url": {"type": "string"},
                        "closeness": {
                            "type": "string",
                            "enum": ["acquaintance", "contact", "friend", "close", "family", "work"],
                        },
                        "current_focus": {"type": "string"},
                        "description": {"type": "string"},
                        "notes": {"type": "string"},
                        "append": {
                            "type": "boolean",
                            "description": "append to existing notes (default true)",
                        },
                    },
                },
                "project_note": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "integer"},
                        "project_name": {"type": "string"},
                        "category": {"type": "string"},
                        "body": {"type": "string"},
                    },
                    "required": ["body"],
                },
                "task": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "notes": {"type": "string"},
                        "urgency": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                        "due_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "contact_id": {"type": "integer"},
                        "project_id": {"type": "integer"},
                        "progress_total": {"type": "number"},
                        "progress_unit": {"type": "string"},
                    },
                    "required": ["title"],
                },
                "calendar_event": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "date": {"type": "string", "description": "YYYY-MM-DD"},
                        "start_time": {"type": "string", "description": "HH:MM, optional"},
                        "end_time": {"type": "string", "description": "HH:MM, optional"},
                        "notes": {"type": "string"},
                    },
                    "required": ["title", "date"],
                },
                "note": {
                    "type": "object",
                    "description": "Optional capture-list entry (skill, problem, thinking, funny, essay)",
                    "properties": {
                        "list_type": {"type": "string", "enum": list(NOTE_LIST_TYPES)},
                        "title": {"type": "string"},
                        "body": {"type": "string"},
                    },
                    "required": ["list_type", "title"],
                },
            },
        },
    },
    {
        "name": "get_state",
        "description": "Broad snapshot of goals, calendar, ideas, projects, customers, contacts, "
                       "and open tasks as counts plus short title lists. Prefer targeted get_* / "
                       "list_* tools when they suffice.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "read_project_file",
        "description": "Read a file from the planner's own project directory (relative path, e.g. "
                       "'app.py', 'NAPKIN.md', 'ISSUES.md'). Use this to see current code or the "
                       "work queue before proposing a change. For large files, read in chunks via "
                       "offset until truncated is false.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "offset": {
                    "type": "integer",
                    "description": "character offset to start reading from (default 0)",
                },
                "max_chars": {
                    "type": "integer",
                    "description": f"max characters to return per call (default {PROJECT_FILE_DEFAULT_CHARS}, cap {PROJECT_FILE_MAX_CHARS})",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "propose_file_edit",
        "description": "Stage a find-and-replace edit for the user to review and approve -- this "
                       "does NOT write the file immediately. Give old_string (the exact existing "
                       "text to find, copied verbatim from read_project_file -- must appear exactly "
                       "once in the file) and new_string (what replaces it). To create a brand new "
                       "file, leave old_string empty and put the full content in new_string. Only "
                       "paths inside the planner's own project directory are allowed. A full "
                       "project backup is taken automatically if the user approves, before the edit "
                       "is applied. Prefer small, targeted old_string/new_string pairs over "
                       "rewriting large chunks -- it's cheaper and safer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "relative path within the project"},
                "old_string": {"type": "string", "description": "exact existing text to replace; empty string to create a new file"},
                "new_string": {"type": "string", "description": "replacement text (or full content, for a new file)"},
                "reason": {"type": "string", "description": "short explanation of the change, shown to the user"},
            },
            "required": ["path", "old_string", "new_string", "reason"],
        },
    },
    {
        "name": "propose_command",
        "description": "Stage a shell command (e.g. run tests, install a package, git status) for "
                       "the user to review and approve -- this does NOT run it immediately. Runs in "
                       "the project directory if approved. Not sandboxed beyond that and beyond the "
                       "user's manual review, so only propose commands relevant to this project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "reason": {"type": "string", "description": "short explanation of what this does and why, shown to the user"},
            },
            "required": ["command", "reason"],
        },
    },
    {
        "name": "apply_style_paint",
        "description": "Paint a visual effect onto a UI region. Writes to the style_paint_config "
                       "setting so the client applies it on next boot. Effects: aurora (cyan accent), "
                       "ember (orange accent), solstice (gold accent), midnight (dark indigo background), "
                       "soft-glow (box shadow), dim (reduced brightness), frost (blur). "
                       "Targets: document (whole page), hud (top bar), nav (tab strip), main (content area), "
                       "launcher (home launcher). System app cannot be hidden via this tool.",
        "input_schema": {
            "type": "object",
            "properties": {
                "effect": {
                    "type": "string",
                    "enum": ["aurora", "ember", "solstice", "midnight", "soft-glow", "dim", "frost"],
                },
                "target": {
                    "type": "string",
                    "enum": ["document", "hud", "nav", "main", "launcher"],
                },
                "enabled": {"type": "boolean", "description": "true to apply, false to remove (default true)"},
            },
            "required": ["effect", "target"],
        },
    },
    {
        "name": "set_hidden_apps",
        "description": "Hide or show app icons in the launcher. Hidden apps are still accessible "
                       "via direct navigation but don't appear in the launcher grid. "
                       "System app (id 'system') cannot be hidden.",
        "input_schema": {
            "type": "object",
            "properties": {
                "hide": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "App ids to add to hidden list (e.g. ['people', 'parallel'])",
                },
                "show": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "App ids to remove from hidden list (unhide)",
                },
            },
        },
    },
    {
        "name": "list_automation_rules",
        "description": "List all when-then automation rules.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_automation_rule",
        "description": (
            "Create a when-then automation rule. Runs deterministically; "
            "use ai_step action only when AI judgment is needed (defaults to cloud; "
            "local AI is weak — only set backend=local if user explicitly asks). "
            "Never run Blueprint Python graphs from rules. "
            "Example: when task.completed where urgency=critical → notify_discord."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Human-readable rule name"},
                "trigger_type": {
                    "type": "string",
                    "enum": sorted(rules.TRIGGER_TYPES),
                    "description": "Event that fires this rule",
                },
                "condition": {
                    "type": "object",
                    "description": (
                        "Optional filter on event payload keys. "
                        "E.g. {\"urgency\": \"critical\"} or {\"title\": {\"contains\": \"bug\"}}. "
                        "Empty object matches all events."
                    ),
                },
                "actions": {
                    "type": "array",
                    "description": (
                        "Ordered list of actions. Each action is an object with a 'type' key "
                        f"from: {', '.join(sorted(rules.SAFE_ACTIONS))}. "
                        "Add extra fields per type (e.g. message for notify_discord, "
                        "title for add_task, prompt+backend for ai_step)."
                    ),
                    "items": {"type": "object"},
                },
                "ai_mode": {
                    "type": "string",
                    "enum": ["none", "cloud", "local"],
                    "description": "Metadata field: 'none' for fully algorithmic rules, 'cloud' if ai_step uses cloud, 'local' only when user explicitly requests local.",
                },
                "enabled": {"type": "boolean"},
            },
            "required": ["name", "trigger_type", "actions"],
        },
    },
    {
        "name": "set_automation_rule_enabled",
        "description": "Enable or disable an automation rule by id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "rule_id": {"type": "integer"},
                "enabled": {"type": "boolean"},
            },
            "required": ["rule_id", "enabled"],
        },
    },
    {
        "name": "delete_automation_rule",
        "description": "Delete an automation rule by id (permanent). Name the rule in your confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {"rule_id": {"type": "integer"}},
            "required": ["rule_id"],
        },
    },
    {
        "name": "test_automation_rule",
        "description": "Test an automation rule by id with a sample payload. Runs matching SAFE actions for real unless dry_run=true.",
        "input_schema": {
            "type": "object",
            "properties": {
                "rule_id": {"type": "integer"},
                "payload": {"type": "object", "description": "Sample event payload to test against"},
                "dry_run": {"type": "boolean", "description": "If true, only check match — don't run actions"},
            },
            "required": ["rule_id"],
        },
    },
    {
        "name": "local_rag_ask",
        "description": (
            "Ask a focused question answered ONLY from the user's local knowledge "
            "(notes, ideas, Obsidian vault, repo files, memories, project notes). "
            "Uses local Ollama — free, private, grounded. Prefer this over generic "
            "recall when the user asks about their own notes, documents, or Obsidian content. "
            "Requires Ollama running and the index built (use rebuild_local_rag_index if missing). "
            "Keep questions short and specific — local models are weak."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "Focused question about the user's personal knowledge"},
                "k": {"type": "integer", "description": "Number of chunks to retrieve (default 4, max 10)"},
            },
            "required": ["question"],
        },
    },
    {
        "name": "local_rag_search",
        "description": (
            "TF-IDF search across the user's local knowledge index "
            "(notes, ideas, Obsidian, repo files, memories). Returns scored snippets. "
            "Use this to find relevant passages before quoting or when you don't need a generated answer."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "k": {"type": "integer", "description": "Number of results (default 5, max 20)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "rebuild_local_rag_index",
        "description": (
            "Rebuild the local knowledge RAG index from all corpus sources "
            "(notes, ideas, Obsidian vault, repo files, memories, project notes, agent chat). "
            "Call this when the user asks to refresh the index or when local_rag_ask reports a missing index."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "web_search",
        "description": (
            "Search the live web. Use for current facts, docs, news, or anything not in "
            "the planner database. Prefer this over guessing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "propose_bug",
        "description": (
            "File a product bug into the Agent tab inbox. The user reviews it and can "
            "accept it onto their Napkin list. Use when you find a real bug, broken UI, "
            "or reliability issue in Waypoint — not for user tasks or personal notes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "details": {
                    "type": "string",
                    "description": "What's broken, where, and how to reproduce",
                },
            },
            "required": ["title"],
        },
    },
    {
        "name": "read_napkin",
        "description": "Read the Napkin backlog, compiled ISSUES.md work queue, WORK.md, and "
                       "NAPKIN_COMPILED.md. Call this when the user says work, or when you need "
                       "the open improvement list. Does not crumple notes. Optional query filters "
                       "to matching notes so you do not dump the whole backlog.",
        "input_schema": {
            "type": "object",
            "properties": {
                "which": {
                    "type": "string",
                    "enum": ["all", "napkin", "issues", "work"],
                    "description": "all (default) returns napkin + issues + work; or one file",
                },
                "query": {
                    "type": "string",
                    "description": "Optional case-insensitive filter; only matching notes/sections are returned",
                },
                "offset": {"type": "integer"},
                "max_chars": {"type": "integer"},
            },
        },
    },
]


def _truncate_text(text, max_chars):
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _project_rel_path(path_str):
    """Accept app.py, NAPKIN.md, or mistaken plan/NAPKIN.md prefixes."""
    path = str(path_str or "").strip().lstrip("/")
    while path.startswith("plan/"):
        path = path[5:]
    return path


def _read_named_project_file(rel_path, tool_input=None):
    ok, target = backup.is_path_inside_project(_project_rel_path(rel_path))
    if not ok:
        return {"error": "path is outside the project directory -- not allowed"}
    if not target.is_file():
        return {"error": f"no such file: {rel_path}"}
    try:
        full_text = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"error": "not a text file"}
    offset, max_chars = _parse_pagination_args(
        tool_input or {}, default_max=PROJECT_FILE_DEFAULT_CHARS, hard_cap=PROJECT_FILE_MAX_CHARS,
    )
    return {"path": _project_rel_path(rel_path), **_paginate_text(full_text, offset, max_chars)}


def _read_napkin_bundle(tool_input=None):
    which = str((tool_input or {}).get("which") or "all").strip().lower()
    files = []
    if which in ("all", "napkin"):
        files.append("NAPKIN.md")
    if which in ("all", "issues"):
        files.append("ISSUES.md")
    if which in ("all", "work"):
        files.append("WORK.md")
        files.append("NAPKIN_COMPILED.md")
    if not files:
        files = ["NAPKIN.md", "ISSUES.md", "WORK.md"]
    parts = []
    missing = []
    query = str((tool_input or {}).get("query") or "").strip().lower()
    for rel in files:
        got = _read_named_project_file(rel, {"max_chars": 20000, "offset": 0})
        if got.get("error"):
            missing.append(rel)
            continue
        body = got.get("content") or got.get("text") or ""
        if query:
            body = _filter_markdown_sections(body, query)
            if not body.strip():
                continue
        parts.append(f"# {rel}\n{body}")
    text = "\n\n".join(parts).strip()
    offset, max_chars = _parse_pagination_args(
        tool_input or {}, default_max=16000, hard_cap=40000,
    )
    out = {"ok": True, "files": files, "text": text, **_paginate_text(text, offset, max_chars)}
    if query:
        out["query"] = query
    if missing:
        out["missing"] = missing
    return out


def _filter_markdown_sections(text, query):
    """Keep a heading and its body when the heading or body mentions query."""
    if not query:
        return text
    chunks = re.split(r"(?=^#{1,3} )", text, flags=re.M)
    kept = [chunk.rstrip() for chunk in chunks if query in chunk.lower()]
    if kept:
        return "\n\n".join(kept).strip()
    lines = [ln for ln in text.splitlines() if query in ln.lower()]
    return "\n".join(lines).strip()


def _compact_tool_result(name, result):
    """Cap tool payloads so multi-round turns do not blow the context window."""
    if not isinstance(result, dict):
        return result
    out = {}
    for key, value in result.items():
        if isinstance(value, str) and len(value) > 2800:
            out[key] = value[:2800] + "…"
        elif isinstance(value, list) and len(value) > 30:
            out[key] = value[:30]
            out[f"{key}_truncated"] = len(value)
        else:
            out[key] = value
    return out


def _parse_pagination_args(tool_input, default_max, hard_cap):
    try:
        offset = int(tool_input.get("offset", 0))
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)
    try:
        max_chars = int(tool_input.get("max_chars", default_max))
    except (TypeError, ValueError):
        max_chars = default_max
    max_chars = max(1, min(max_chars, hard_cap))
    return offset, max_chars


def _paginate_text(text, offset, max_chars):
    text = text or ""
    total_chars = len(text)
    chunk = text[offset : offset + max_chars]
    end = offset + len(chunk)
    truncated = end < total_chars
    result = {
        "content": chunk,
        "offset": offset,
        "total_chars": total_chars,
        "truncated": truncated,
    }
    if truncated:
        result["next_offset"] = end
    return result


def _list_repository_files(tool_input):
    category = (tool_input.get("category") or "").strip() or None
    if category and category not in repository.CATEGORIES:
        return {"error": f"category must be one of: {', '.join(repository.CATEGORIES)}"}
    rows = db.list_repo_files(category=category)[:REPO_LIST_MAX_FILES]
    return {
        "ok": True,
        "count": len(rows),
        "files": [
            {
                "id": r["id"],
                "filename": r["filename"],
                "category": r.get("category"),
                "word_count": r.get("word_count"),
                "summary": _truncate_text(r.get("summary") or "", REPO_SUMMARY_PREVIEW_CHARS),
            }
            for r in rows
        ],
    }


def _resolve_repository_file(tool_input):
    """Return repo_files row, or a dict with error/matches for ambiguous filename lookup."""
    file_id = tool_input.get("file_id")
    filename = (tool_input.get("filename") or "").strip()

    if file_id is not None:
        try:
            file_id = int(file_id)
        except (TypeError, ValueError):
            return {"error": "file_id must be an integer"}
        row = db.get_repo_file(file_id)
        if not row:
            return {"error": f"no repository file with id {file_id}"}
        return row

    if filename:
        rows = db.list_repo_files()
        lower = filename.lower()
        exact = [r for r in rows if r["filename"].lower() == lower]
        if len(exact) == 1:
            return exact[0]
        if len(exact) > 1:
            return {
                "error": "multiple files match that exact filename — pass file_id instead",
                "matches": [{"id": r["id"], "filename": r["filename"]} for r in exact[:10]],
            }
        partial = [r for r in rows if lower in r["filename"].lower()]
        if len(partial) == 1:
            return partial[0]
        if len(partial) > 1:
            return {
                "error": "filename matches multiple files — pass file_id or a more specific name",
                "matches": [{"id": r["id"], "filename": r["filename"]} for r in partial[:10]],
            }
        return {"error": f"no repository file matching {filename!r}"}

    return {"error": "provide file_id or filename"}


def _read_repository_file(tool_input):
    resolved = _resolve_repository_file(tool_input)
    if isinstance(resolved, dict) and resolved.get("error"):
        return resolved
    row = resolved

    meta = {
        "id": row["id"],
        "filename": row["filename"],
        "category": row.get("category"),
        "word_count": row.get("word_count"),
        "summary": row.get("summary"),
        "mime": row.get("mime"),
        "size": row.get("size"),
    }

    extracted = (row.get("extracted_text") or "").strip()
    binary_markers = ("binary file", "binary media", "no text extracted")
    is_unreadable = (
        not extracted
        or (extracted.startswith("[") and any(m in extracted.lower() for m in binary_markers))
    )

    if is_unreadable and not repository._is_text_like(row["filename"]):
        return {
            "ok": True,
            **meta,
            "readable": False,
            "note": "not text-readable; use search snippets",
        }

    text = extracted
    if not text:
        try:
            content = repository.get_file_content(row["id"])
        except Exception as exc:
            return {"error": str(exc)}
        if not content:
            return {"error": "file not found"}
        if not content.get("editable"):
            return {
                "ok": True,
                **meta,
                "readable": False,
                "kind": content.get("kind"),
                "note": "not text-readable; use search snippets",
            }
        text = content.get("text") or content.get("extracted_text") or ""

    if not text.strip():
        return {
            "ok": True,
            **meta,
            "readable": False,
            "note": "not text-readable; use search snippets",
        }

    offset, max_chars = _parse_pagination_args(
        tool_input, default_max=REPO_FILE_MAX_CHARS, hard_cap=REPO_FILE_MAX_CHARS,
    )
    page = _paginate_text(text, offset, max_chars)
    note = None
    if page.get("truncated"):
        note = (
            f"Returned chars {offset}-{page.get('offset', offset) + len(page.get('content') or '')} "
            f"of {page.get('total_chars')} — call again with offset={page.get('next_offset')} "
            "to continue reading the rest of the document."
        )

    result = {"ok": True, **meta, "readable": True, **page}
    if note:
        result["note"] = note
    return result


def _repository_row_text(row):
    """Return extracted text for a repo_files row, or empty string if not readable."""
    extracted = (row.get("extracted_text") or "").strip()
    binary_markers = ("binary file", "binary media", "no text extracted")
    is_unreadable = (
        not extracted
        or (extracted.startswith("[") and any(m in extracted.lower() for m in binary_markers))
    )

    if is_unreadable and not repository._is_text_like(row["filename"]):
        return ""

    text = extracted
    if not text:
        try:
            content = repository.get_file_content(row["id"])
        except Exception:
            return ""
        if not content or not content.get("editable"):
            return ""
        text = content.get("text") or ""

    return (text or "").strip()


def _resolve_classify_text(tool_input):
    """Resolve document text and filename for classify_into_lists."""
    text = (tool_input.get("text") or "").strip()
    filename = (tool_input.get("filename") or "").strip()
    file_id = tool_input.get("file_id")
    input_truncated = False

    if not text and file_id is not None:
        resolved = _resolve_repository_file({"file_id": file_id})
        if isinstance(resolved, dict) and resolved.get("error"):
            return resolved
        row = resolved
        if not filename:
            filename = row.get("filename") or ""
        text = _repository_row_text(row)
        if not text:
            return {"error": "repository file has no extractable text"}

    if not text:
        return {"error": "provide text or file_id with readable content"}

    if len(text) > CLASSIFY_MAX_CHARS:
        text = text[:CLASSIFY_MAX_CHARS]
        input_truncated = True

    return {
        "text": text,
        "filename": filename or "document",
        "input_truncated": input_truncated,
    }


def _classify_into_lists(tool_input):
    import ai

    resolved = _resolve_classify_text(tool_input)
    if resolved.get("error"):
        return resolved

    bias_list = (tool_input.get("bias_list") or "").strip() or None
    if bias_list not in CLASSIFY_BIAS_LIST_TYPES:
        bias_list = None

    try:
        result = ai.classify_document(
            resolved["filename"], resolved["text"], bias_list=bias_list,
        )
    except Exception as exc:
        return {"error": str(exc)}

    items = result.get("items") or []
    truncated = bool(result.get("truncated")) or resolved.get("input_truncated")
    out = {
        "ok": True,
        "items": items,
        "chunks_processed": result.get("chunks_processed", 0),
        "truncated": truncated,
    }
    if result.get("note"):
        out["note"] = result["note"]
    elif resolved.get("input_truncated"):
        out["note"] = f"input capped at first {CLASSIFY_MAX_CHARS:,} characters"
    return out


def _is_confirmed(tool_input):
    val = (tool_input or {}).get("confirmed")
    if val is True:
        return True
    if isinstance(val, str) and val.strip().lower() in ("true", "1", "yes"):
        return True
    return False


def _strip_confirmed(tool_input):
    return {k: v for k, v in (tool_input or {}).items() if k != "confirmed"}


def _confirmation_pending(tool_name, proposed_actions, summary=None):
    return {
        "needs_confirmation": True,
        "tool": tool_name,
        "proposed_actions": proposed_actions,
        "summary": summary or _summarize_proposed_actions(proposed_actions),
        "message": (
            "Plan only — nothing was changed. Summarize proposed_actions for the user and call again "
            "with confirmed:true only after they approve (or they can use the Confirm button)."
        ),
    }


def _propose_write_action(tool_name, tool_input):
    payload = _strip_confirmed(tool_input or {})
    action = {"action": tool_name}
    for key in ("title", "name", "date", "path", "filename", "task_id", "project_id", "contact_id"):
        if key in payload and payload[key] not in (None, ""):
            action[key] = payload[key]
    return [action]


def _normalize_task_title(title):
    """Normalize task titles for exact duplicate protection."""
    text = unicodedata.normalize("NFKC", str(title or "")).casefold()
    return re.sub(r"[\W_]+", " ", text, flags=re.UNICODE).strip()


def _due_date_or_dismissed(payload):
    """Only persist a due date the caller actually named. Empty means no auto-deadline."""
    due = payload.get("due_date") if isinstance(payload, dict) else None
    if isinstance(due, str):
        due = due.strip() or None
    elif due in ("",):
        due = None
    return due, not bool(due)


_CLOCK_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::\d{2})?$")
_INVENTED_TIME_ERROR = (
    "Need a clock time from the user — I will not invent one. "
    "Name a start (and end) as HH:MM, or leave the event untimed."
)


def _normalize_clock(value):
    """Return HH:MM if the caller named a real time, else None. Never invent 09:00."""
    text = str(value or "").strip()
    if not text:
        return None
    match = _CLOCK_RE.match(text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def _persist_named_clock(value):
    """Empty-time guard: no auto-time invention. Never invent a clock time.

    If the user named none, persist empty (None). If they named a time, persist it
    exactly as HH:MM — do not substitute 09:00 or any other default.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return _normalize_clock(text)


def _named_clocks(tool_input, *keys):
    out = {}
    for key in keys:
        out[key] = _normalize_clock((tool_input or {}).get(key))
    return out


def _weekday_int(value):
    """Monday=0 … Sunday=6. 0 is a real day — never treat it as missing."""
    if value is None or value is False or value is True:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if n < 0 or n > 6:
        return None
    return n


def _web_search_keys_present():
    try:
        import chat_backends
        return chat_backends.web_search_keys_present()
    except Exception:
        for name in ("BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY", "SERPAPI_KEY", "SERPAPI_API_KEY"):
            if (os.environ.get(name) or "").strip():
                return True
        return False


def _result_record_id(result, *keys):
    if not isinstance(result, dict):
        return None
    for key in keys:
        row = result.get(key)
        if isinstance(row, dict) and row.get("id") is not None:
            return row.get("id")
        if result.get(key) is not None and key.endswith("_id"):
            return result.get(key)
    if result.get("id") is not None:
        return result.get("id")
    return None


def _class_slot_exists(name, weekday, start_time, end_time):
    name_key = (name or "").strip().lower()
    start = _normalize_clock(start_time)
    end = _normalize_clock(end_time)
    weekday_i = _weekday_int(weekday)
    if not name_key or weekday_i is None or not start or not end:
        return False
    for row in db.list_classes() or []:
        if (
            str(row.get("name") or "").strip().lower() == name_key
            and _weekday_int(row.get("weekday")) == weekday_i
            and _normalize_clock(row.get("start_time")) == start
            and _normalize_clock(row.get("end_time")) == end
        ):
            return True
    return False


def _preview_table_actions(kind, rows):
    actions = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        action = {"action": kind, **{k: row[k] for k in row if row[k] not in (None, "")}}
        actions.append(action)
    return actions


def _preview_schedule_payload(tool_input):
    import napkin_complete
    classes = tool_input.get("classes") or napkin_complete.parse_course_schedule(
        tool_input.get("text") or "", end_date=tool_input.get("end_date"),
    )
    cleaned = []
    skipped = []
    for item in classes or []:
        name = (item.get("name") or "").strip()
        start = _normalize_clock(item.get("start_time"))
        end = _normalize_clock(item.get("end_time"))
        weekday = _weekday_int(item.get("weekday"))
        if not name or weekday is None or not start or not end:
            skipped.append({**item, "reason": "missing name, weekday, or named clock times"})
            continue
        row = {
            "name": name,
            "weekday": weekday,
            "start_time": start,
            "end_time": end,
            "end_date": item.get("end_date") or tool_input.get("end_date"),
        }
        row["duplicate"] = _class_slot_exists(name, row["weekday"], start, end)
        cleaned.append(row)
    proposed = _preview_table_actions("import_class", cleaned)
    pending = _confirmation_pending(
        "preview_schedule_import",
        proposed,
        summary=f"Import {len(cleaned)} class slot{'s' if len(cleaned) != 1 else ''} from pasted schedule",
    )
    pending.update({
        "ok": True,
        "preview": True,
        "kind": "schedule",
        "classes": cleaned,
        "count": len(cleaned),
        "duplicates": sum(1 for row in cleaned if row.get("duplicate")),
        "skipped": skipped,
        "warning": "Preview only — nothing was added. Confirm to import unique slots.",
    })
    return pending


def _import_course_classes(classes, end_date=None):
    created = []
    skipped = []
    for item in classes or []:
        name = (item.get("name") or "").strip()
        start = _normalize_clock(item.get("start_time"))
        end = _normalize_clock(item.get("end_time"))
        weekday = _weekday_int(item.get("weekday"))
        if not name or weekday is None or not start or not end:
            skipped.append({**item, "reason": "missing named clock times — not invented"})
            continue
        if _class_slot_exists(name, weekday, start, end):
            skipped.append({"name": name, "weekday": weekday, "start_time": start, "reason": "duplicate"})
            continue
        class_id = db.upsert_class_slot(
            name, weekday, start, end,
            source="agent",
            end_date=item.get("end_date") or end_date,
            horizon_weeks=int(item.get("horizon_weeks") or 16),
        )
        events_created = db.materialize_class_events(class_id)
        row = db.get_class(class_id)
        created.append({
            "id": class_id,
            "class": row,
            "events_created": events_created,
            "name": name,
            "weekday": weekday,
            "start_time": start,
            "end_time": end,
        })
    return {
        "ok": True,
        "created": created,
        "skipped": skipped,
        "count": len(created),
        "ids": [row["id"] for row in created],
    }


def _apply_preview_bulk(tool_input):
    import napkin_complete
    kind = (tool_input.get("kind") or "task").strip().lower()
    if kind == "schedule":
        return _import_course_classes(
            tool_input.get("classes") or napkin_complete.parse_course_schedule(
                tool_input.get("text") or "", end_date=tool_input.get("end_date"),
            ),
            end_date=tool_input.get("end_date"),
        )
    if kind == "event":
        items = tool_input.get("items") or napkin_complete.parse_bulk_lines(
            tool_input.get("text") or "", kind="event",
        )
        created, skipped = [], []
        for item in items:
            title = (item.get("title") or "").strip()
            date_value = (item.get("date") or "").strip()
            if not title or not date_value:
                skipped.append({**item, "reason": "missing title or date"})
                continue
            start = _normalize_clock(item.get("start_time"))
            end = _normalize_clock(item.get("end_time"))
            if _matching_calendar_events(title, date_value, start):
                skipped.append({"title": title, "date": date_value, "reason": "duplicate"})
                continue
            event_id = db.insert_calendar_event(
                title, date_value, start, end, None, item.get("notes"),
            )
            created.append(db.get_calendar_event(event_id))
        return {
            "ok": True,
            "kind": "event",
            "created": created,
            "skipped": skipped,
            "count": len(created),
            "ids": [row.get("id") for row in created if row.get("id") is not None],
        }
    items = tool_input.get("items") or napkin_complete.parse_bulk_lines(
        tool_input.get("text") or "", kind="task",
    )
    return _execute_tool(
        "batch_add_tasks",
        {"tasks": [{"title": (item.get("title") or "").strip(), "notes": item.get("notes") or ""}
                   for item in items if (item.get("title") or "").strip()],
         "confirmed": True},
        tool_policy="auto",
    )


def _matching_calendar_events(title, date_value, start_time):
    """Same-day events with the same normalized title and start time."""
    normalized = _normalize_task_title(title)
    date_value = str(date_value or "").strip()
    if not normalized or not date_value:
        return []
    start = str(start_time or "").strip()
    matches = []
    for event in db.list_calendar_events(start=date_value, end=date_value):
        if _normalize_task_title(event.get("title")) != normalized:
            continue
        if str(event.get("start_time") or "").strip() == start:
            matches.append(event)
    return matches


def _duplicate_calendar_confirmation(tool_input):
    duplicates = _matching_calendar_events(
        (tool_input or {}).get("title"),
        (tool_input or {}).get("date"),
        _persist_named_clock((tool_input or {}).get("start_time")),
    )
    if not duplicates:
        return None
    compact = [
        {
            "id": event.get("id"),
            "title": event.get("title"),
            "date": event.get("date"),
            "start_time": event.get("start_time"),
        }
        for event in duplicates[:5]
    ]
    title = str((tool_input or {}).get("title") or "").strip()
    date_value = str((tool_input or {}).get("date") or "").strip()
    warning = (
        f'An event named "{title}" already exists on {date_value} at that time. '
        "Confirm only if you intentionally want a repeat."
    )
    proposed = _propose_write_action("add_calendar_event", tool_input)
    proposed[0].update({
        "warning": "Repeated calendar event",
        "repeated": True,
        "duplicate_events": compact,
    })
    pending = _confirmation_pending(
        "add_calendar_event", proposed, summary=f"Add repeated event: {title}",
    )
    pending.update({
        "warning": warning,
        "repeated": True,
        "duplicate_events": compact,
    })
    return pending


def _matching_task_titles(title):
    normalized = _normalize_task_title(title)
    if not normalized:
        return []
    return [
        task for task in db.list_tasks()
        if _normalize_task_title(task.get("title")) == normalized
    ]


def _duplicate_task_confirmation(tool_input):
    duplicates = _matching_task_titles((tool_input or {}).get("title"))
    if not duplicates:
        return None
    compact = [
        {
            "id": task.get("id"),
            "title": task.get("title"),
            "status": task.get("status"),
            "urgency": task.get("urgency"),
            "due_date": task.get("due_date"),
        }
        for task in duplicates[:5]
    ]
    title = str((tool_input or {}).get("title") or "").strip()
    warning = (
        f'A task named "{title}" already exists. Confirm only if you intentionally want a repeat.'
    )
    proposed = _propose_write_action("add_task", tool_input)
    proposed[0].update({
        "warning": "Repeated task",
        "repeated": True,
        "duplicate_tasks": compact,
    })
    pending = _confirmation_pending("add_task", proposed, summary=f"Add repeated task: {title}")
    pending.update({
        "warning": warning,
        "repeated": True,
        "duplicate_tasks": compact,
    })
    return pending


def _maybe_require_write_confirm(tool_name, tool_input, tool_policy):
    if tool_name == "add_task" and not _is_confirmed(tool_input):
        duplicate = _duplicate_task_confirmation(tool_input)
        if duplicate:
            return duplicate
    if tool_name == "add_calendar_event" and not _is_confirmed(tool_input):
        duplicate = _duplicate_calendar_confirmation(tool_input)
        if duplicate:
            return duplicate
    if tool_policy != "confirm" or tool_name not in WRITE_TOOLS or _is_confirmed(tool_input):
        return None
    if tool_name in CONFIRMATION_TOOLS:
        return None
    proposed = _propose_write_action(tool_name, tool_input)
    summary = _describe_tool_step(tool_name, tool_input)
    return _confirmation_pending(tool_name, proposed, summary=summary)


def _action_memory_query(tool_name, tool_input) -> str:
    try:
        payload = json.dumps(tool_input or {}, default=str)
    except Exception:
        payload = str(tool_input or "")
    return f"{tool_name} {payload}"


def _with_recalled_memories(tool_name, tool_input, result):
    """Attach related companion memories before/with write actions (not only when asked)."""
    if tool_name not in WRITE_TOOLS and tool_name not in CONFIRMATION_TOOLS:
        return result
    if not isinstance(result, dict):
        return result
    try:
        import companion_memory
        return companion_memory.attach_recalled_memories(
            result,
            _action_memory_query(tool_name, tool_input),
            limit=5,
        )
    except Exception as exc:
        print(f"[agent] memory recall attach failed: {exc}")
        return result


def _confirmation_from_result(tool_name, tool_input, result):
    confirm_input = _strip_confirmed(tool_input)
    if isinstance(result.get("classes"), list):
        confirm_input["classes"] = result["classes"]
    if isinstance(result.get("items"), list):
        confirm_input["items"] = result["items"]
    if result.get("kind"):
        confirm_input["kind"] = result["kind"]
    return {
        "tool": result.get("tool") or tool_name,
        "input": confirm_input,
        "proposed_actions": result.get("proposed_actions", []),
        "summary": result.get("summary", ""),
        "warning": result.get("warning", ""),
        "repeated": bool(result.get("repeated")),
        "duplicate_tasks": result.get("duplicate_tasks") or [],
        "recalled_memories": result.get("recalled_memories") or [],
        "classes": result.get("classes") or [],
        "items": result.get("items") or [],
        "kind": result.get("kind") or "",
        "count": result.get("count"),
        "duplicates": result.get("duplicates"),
        "preview": bool(result.get("preview")),
    }


def _summarize_proposed_actions(proposed_actions):
    bits = []
    for action in proposed_actions or []:
        kind = action.get("action", "change")
        label = action.get("label") or action.get("title") or action.get("name") or action.get("filename")
        if label:
            bits.append(f"{kind}: {label}")
        else:
            bits.append(kind.replace("_", " "))
    return "; ".join(bits) if bits else "pending changes"


def _parse_confirm_tool_message(user_message):
    text = (user_message or "").strip()
    if not text.startswith(CONFIRM_TOOL_PREFIX):
        return None
    try:
        payload = json.loads(text[len(CONFIRM_TOOL_PREFIX):].strip())
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
    tool = payload.get("tool")
    tool_input = dict(payload.get("input") or {})
    # Confirm UI stages any write (Companion normal route) plus always-confirm tools.
    if tool not in WRITE_TOOLS and tool not in CONFIRMATION_TOOLS:
        return None
    tool_input["confirmed"] = True
    return tool, tool_input


def _confirm_tool_reply(tool_name, result):
    if result.get("error"):
        return f"Could not complete: {result['error']}"
    if result.get("needs_confirmation") or result.get("preview"):
        return "Preview only — nothing was added. Confirm the table if you want me to apply it."
    if result.get("ok") is False:
        return "Nothing was saved — the tool did not complete."
    summary = (result.get("summary") or "").strip()
    if tool_name == "create_situation":
        created = result.get("created") or {}
        ids = []
        for key, row in (created.items() if isinstance(created, dict) else []):
            rid = row.get("id") if isinstance(row, dict) else None
            if rid is not None:
                ids.append(f"{key} id {rid}")
        if not created:
            return "Nothing was saved — the situation was not recorded."
        parts = [f"Recorded situation ({', '.join(created.keys())})"]
        if ids:
            parts.append(", ".join(ids))
        if summary:
            parts.append(summary)
        return " — ".join(parts)
    if tool_name == "add_contact":
        contact = result.get("contact") or {}
        name = (contact.get("name") or result.get("name") or "").strip()
        cid = _result_record_id(result, "contact", "contact_id")
        if not cid:
            return "Nothing was saved — the contact was not created."
        return f"Done — saved contact{f' {name}' if name else ''} (id {cid})."
    if tool_name == "add_task":
        task = result.get("task") or {}
        title = (task.get("title") or "").strip()
        task_id = _result_record_id(result, "task", "task_id")
        if not task_id:
            return "Nothing was saved — the task was not created."
        return f"Done — saved task{f' {title}' if title else ''} (id {task_id})."
    if tool_name in ("batch_add_tasks", "preview_bulk_import"):
        count = result.get("count")
        skipped = result.get("skipped") or []
        created = result.get("created") or []
        titles = [
            (row.get("title") or "").strip()
            for row in created
            if isinstance(row, dict)
        ]
        ids = [
            row.get("id") for row in created
            if isinstance(row, dict) and row.get("id") is not None
        ]
        if not count:
            extra = f" · skipped {len(skipped)}" if skipped else ""
            return f"Nothing was saved — no new rows were created{extra}."
        bit = f"{count} item{'s' if count != 1 else ''}"
        if titles:
            shown = ", ".join(titles[:8])
            extra = f" (+{len(titles) - 8} more)" if len(titles) > 8 else ""
            bit = f"{bit}: {shown}{extra}"
        if ids:
            shown_ids = ", ".join(str(i) for i in ids[:8])
            bit += f" (ids {shown_ids}{'' if len(ids) <= 8 else '…'})"
        if skipped:
            bit += f" · skipped {len(skipped)} duplicate{'s' if len(skipped) != 1 else ''}"
        return f"Done — {bit}."
    if tool_name in ("import_course_schedule", "preview_schedule_import", "add_recurring_class"):
        created = result.get("created") if isinstance(result.get("created"), list) else []
        class_row = result.get("class") or {}
        ids = result.get("ids") or [
            row.get("id") for row in created if isinstance(row, dict) and row.get("id") is not None
        ]
        if class_row.get("id") is not None:
            ids = ids or [class_row.get("id")]
        count = result.get("count")
        if count is None:
            count = len(ids)
        if not count and not ids:
            skipped = result.get("skipped") or []
            extra = f" · skipped {len(skipped)}" if skipped else ""
            return f"Nothing was saved — no classes were imported{extra}."
        names = [
            (row.get("name") or (row.get("class") or {}).get("name") or "").strip()
            for row in created if isinstance(row, dict)
        ]
        if class_row.get("name") and not names:
            names = [class_row.get("name")]
        bit = f"{count} class slot{'s' if count != 1 else ''}"
        if names:
            bit += ": " + ", ".join(n for n in names[:8] if n)
        if ids:
            bit += f" (ids {', '.join(str(i) for i in ids[:8])})"
        skipped = result.get("skipped") or []
        if skipped:
            bit += f" · skipped {len(skipped)}"
        return f"Done — {bit}."
    if tool_name == "add_calendar_event":
        event = result.get("event") or {}
        title = (event.get("title") or "").strip()
        date_value = (event.get("date") or "").strip()
        event_id = _result_record_id(result, "event", "event_id")
        if not event_id:
            return "Nothing was saved — the event was not created."
        when = f" on {date_value}" if date_value else ""
        clock = _normalize_clock(event.get("start_time"))
        time_bit = f" at {clock}" if clock else ""
        return f"Done — saved event{f' {title}' if title else ''}{when}{time_bit} (id {event_id})."
    if tool_name == "add_recurring_event":
        ids = result.get("ids") or []
        count = result.get("count")
        if not count and not ids:
            return "Nothing was saved — the series was not created."
        return f"Done — saved weekly series ({count or len(ids)} events, ids {', '.join(str(i) for i in ids[:8])})."
    if tool_name == "add_idea":
        idea = result.get("idea") or {}
        title = (idea.get("title") or "").strip()
        idea_id = _result_record_id(result, "idea", "idea_id")
        if not idea_id:
            return "Nothing was saved — the idea was not created."
        return f"Done — saved idea{f' {title}' if title else ''} (id {idea_id})."
    if tool_name == "add_project":
        project = result.get("project") or {}
        name = (project.get("name") or "").strip()
        pid = _result_record_id(result, "project", "project_id")
        if not pid:
            return "Nothing was saved — the project was not created."
        return f"Done — saved project{f' {name}' if name else ''} (id {pid})."
    if tool_name == "update_contact":
        contact = result.get("contact") or {}
        name = (contact.get("name") or "").strip()
        cid = _result_record_id(result, "contact", "contact_id")
        fields = result.get("fields_set") or []
        bit = f" ({', '.join(fields)})" if fields else ""
        id_bit = f" (id {cid})" if cid else ""
        if not cid:
            return "Nothing was saved — the contact was not updated."
        return f"Done — updated contact{f' {name}' if name else ''}{bit}{id_bit}."
    if tool_name == "add_customer":
        customer = result.get("customer") or {}
        name = (customer.get("name") or "").strip()
        cid = _result_record_id(result, "customer", "customer_id")
        if not cid:
            return "Nothing was saved — the customer was not created."
        return f"Done — saved customer{f' {name}' if name else ''} (id {cid})."
    if tool_name == "spawn_agent":
        job_id = result.get("id")
        if not job_id:
            return "Nothing was spawned — no agent id returned."
        title = (result.get("title") or "").strip()
        return f"Spawned agent{f' {title}' if title else ''} (id {job_id})."
    if tool_name == "stop_agent":
        job_id = result.get("id") or result.get("agent_id")
        if result.get("ok") and job_id:
            return f"Stop requested for agent {job_id}."
        return result.get("error") or "Could not stop that agent."
    if tool_name in (
        "update_customer", "update_project", "update_idea", "update_note", "update_calendar_event",
        "update_task", "add_note",
        "add_goal", "add_project_note",
    ):
        rid = _result_record_id(result, "task", "event", "idea", "project", "note", "goal", "customer")
        if summary and rid:
            return f"Done — {summary} (id {rid})"
        if summary:
            return f"Done — {summary}"
        label = tool_name.replace("_", " ")
        return f"Done — {label}."
    if summary:
        return f"Done — {summary}"
    if result.get("title"):
        return f"Done — deleted {result['title']}"
    if result.get("name"):
        return f"Done — deleted {result['name']}"
    if result.get("filename"):
        return f"Done — deleted {result['filename']}"
    if result.get("ok"):
        rid = _result_record_id(result)
        if rid:
            return f"Confirmed — action completed (id {rid})."
        count = result.get("count")
        if count:
            return f"Confirmed — action completed ({count})."
        return "Confirmed — action completed."
    return "Nothing was saved — the tool did not report a created id."


_CONTACT_FIELD_KEYS = (
    "what_they_do", "met_where", "met_when", "email", "phone", "linkedin_url",
    "closeness", "current_focus", "description", "notes",
)


def _contact_write_fields(payload):
    """Pull every known contact column from a tool payload (skip empties)."""
    fields = {}
    if not isinstance(payload, dict):
        return fields
    for key in _CONTACT_FIELD_KEYS:
        if key not in payload:
            continue
        val = payload.get(key)
        if val is None:
            continue
        if isinstance(val, str):
            val = val.strip()
            if not val:
                continue
        fields[key] = val
    return fields


def _get_contact_by_id(contact_id):
    matches = [c for c in db.list_contacts() if c["id"] == contact_id]
    return matches[0] if matches else None


def _resolve_contact_by_ref(payload):
    """Return (contact_row_or_none, contact_id_or_none, create_name_or_none, error_or_none)."""
    contact_id = payload.get("contact_id")
    if contact_id is not None:
        try:
            contact_id = int(contact_id)
        except (TypeError, ValueError):
            return None, None, None, "contact_id must be an integer"
        contact = _get_contact_by_id(contact_id)
        if not contact:
            return None, None, None, f"no contact with id {contact_id}"
        return contact, contact_id, None, None

    name = (payload.get("name") or "").strip()
    if not name:
        return None, None, None, "contact_id or name required"

    contacts = db.list_contacts()
    lower = name.lower()
    exact = [c for c in contacts if c["name"].lower() == lower]
    if len(exact) == 1:
        return exact[0], exact[0]["id"], None, None
    if len(exact) > 1:
        return None, None, None, f"ambiguous contact name {name!r} — pass contact_id"
    partial = [c for c in contacts if lower in c["name"].lower()]
    if len(partial) == 1:
        return partial[0], partial[0]["id"], None, None
    if len(partial) > 1:
        return None, None, None, f"ambiguous contact name {name!r} — pass contact_id"
    return None, None, name, None


def _resolve_project_by_ref(payload):
    """Return (project_row_or_none, project_id_or_none, error_or_none)."""
    project_id = payload.get("project_id")
    if project_id is not None:
        try:
            project_id = int(project_id)
        except (TypeError, ValueError):
            return None, None, "project_id must be an integer"
        project = db.get_project(project_id)
        if not project:
            return None, None, f"no project with id {project_id}"
        return project, project_id, None

    name = (payload.get("project_name") or payload.get("name") or "").strip()
    if not name:
        return None, None, "project_id or project_name required"

    projects = db.list_projects()
    lower = name.lower()
    exact = [p for p in projects if p["name"].lower() == lower]
    if len(exact) == 1:
        return exact[0], exact[0]["id"], None
    if len(exact) > 1:
        return None, None, f"ambiguous project name {name!r} — pass project_id"
    partial = [p for p in projects if lower in p["name"].lower()]
    if len(partial) == 1:
        return partial[0], partial[0]["id"], None
    if len(partial) > 1:
        return None, None, f"ambiguous project name {name!r} — pass project_id"
    return None, None, f"no project matching {name!r}"


def _plan_situation(tool_input):
    """Validate and describe what create_situation would write — no database mutations."""
    proposed_actions = []
    errors = []
    linked_contact_id = None
    linked_project_id = None

    contact_payload = tool_input.get("contact")
    if isinstance(contact_payload, dict) and contact_payload:
        notes = (contact_payload.get("notes") or "").strip()
        name = (contact_payload.get("name") or "").strip()
        rich = _contact_write_fields(contact_payload)
        if notes or rich or contact_payload.get("contact_id") is not None or name:
            contact, contact_id, create_name, err = _resolve_contact_by_ref(contact_payload)
            if err:
                errors.append({"item": "contact", "error": err})
            elif create_name:
                proposed_actions.append({
                    "action": "create_contact",
                    "name": create_name,
                    "what_they_do": rich.get("what_they_do"),
                    "met_where": rich.get("met_where"),
                    "met_when": rich.get("met_when"),
                    "email": rich.get("email"),
                    "phone": rich.get("phone"),
                    "closeness": rich.get("closeness"),
                    "notes_preview": _truncate_text(notes or rich.get("description") or "", 160) or None,
                    "fields": {k: v for k, v in rich.items() if v},
                })
            else:
                entry = {
                    "action": "update_contact",
                    "contact_id": contact_id,
                    "name": contact["name"],
                    "fields": {k: v for k, v in rich.items() if v},
                }
                if notes:
                    entry["append"] = contact_payload.get("append", True)
                    entry["notes_preview"] = _truncate_text(notes, 160)
                proposed_actions.append(entry)
                linked_contact_id = contact_id

    project_note_payload = tool_input.get("project_note")
    if isinstance(project_note_payload, dict) and project_note_payload:
        body = (project_note_payload.get("body") or "").strip()
        if not body:
            errors.append({"item": "project_note", "error": "body is required"})
        else:
            project, project_id, err = _resolve_project_by_ref(project_note_payload)
            if err:
                errors.append({"item": "project_note", "error": err})
            else:
                proposed_actions.append({
                    "action": "add_project_note",
                    "project_id": project_id,
                    "project_name": project["name"],
                    "category": project_note_payload.get("category", "general"),
                    "body_preview": _truncate_text(body, 160),
                })
                linked_project_id = project_id

    task_payload = tool_input.get("task")
    if isinstance(task_payload, dict) and task_payload:
        title = (task_payload.get("title") or "").strip()
        if not title:
            errors.append({"item": "task", "error": "title is required"})
        else:
            task_action = {
                "action": "add_task",
                "title": title,
                "urgency": task_payload.get("urgency", "medium"),
                "due_date": task_payload.get("due_date"),
                "contact_id": task_payload.get("contact_id", linked_contact_id),
                "project_id": task_payload.get("project_id", linked_project_id),
                "description_preview": _truncate_text(task_payload.get("description", ""), 120) or None,
                "notes_preview": _truncate_text(task_payload.get("notes", ""), 120) or None,
            }
            duplicates = _matching_task_titles(title)
            if duplicates:
                task_action.update({
                    "warning": (
                        f'A task named "{title}" already exists. Confirm only if this repeat is intentional.'
                    ),
                    "repeated": True,
                    "duplicate_tasks": [
                        {
                            "id": task.get("id"),
                            "title": task.get("title"),
                            "status": task.get("status"),
                        }
                        for task in duplicates[:5]
                    ],
                })
            proposed_actions.append(task_action)

    event_payload = tool_input.get("calendar_event")
    if isinstance(event_payload, dict) and event_payload:
        title = (event_payload.get("title") or "").strip()
        date = (event_payload.get("date") or "").strip()
        if not title or not date:
            errors.append({"item": "calendar_event", "error": "title and date are required"})
        else:
            proposed_actions.append({
                "action": "add_calendar_event",
                "title": title,
                "date": date,
                "start_time": event_payload.get("start_time"),
                "end_time": event_payload.get("end_time"),
                "notes_preview": _truncate_text(event_payload.get("notes", ""), 120) or None,
            })

    note_payload = tool_input.get("note")
    if isinstance(note_payload, dict) and note_payload:
        list_type = note_payload.get("list_type", "")
        note_title = (note_payload.get("title") or "").strip()
        if list_type not in NOTE_LIST_TYPES:
            errors.append({
                "item": "note",
                "error": f"list_type must be one of: {', '.join(NOTE_LIST_TYPES)}",
            })
        elif not note_title:
            errors.append({"item": "note", "error": "title is required"})
        else:
            proposed_actions.append({
                "action": "add_note",
                "list_type": list_type,
                "title": note_title,
                "body_preview": _truncate_text(note_payload.get("body", ""), 120) or None,
            })

    if not proposed_actions and not any(
        k in tool_input for k in ("contact", "project_note", "task", "calendar_event", "note")
    ):
        return {"error": "provide at least one of: contact, project_note, task, calendar_event, note"}

    summary = (tool_input.get("summary") or "").strip() or None
    out = {"proposed_actions": proposed_actions}
    if summary:
        out["summary"] = summary
    if errors:
        out["errors"] = errors
    if not proposed_actions and errors:
        out["error"] = "could not build a plan — fix errors and try again"
    return out


def _create_situation(tool_input):
    """Create or update multiple linked records from one natural situation payload."""
    created = {}
    errors = []
    linked_contact_id = None
    linked_project_id = None

    contact_payload = tool_input.get("contact")
    if isinstance(contact_payload, dict) and contact_payload:
        notes = (contact_payload.get("notes") or "").strip()
        name = (contact_payload.get("name") or "").strip()
        rich = _contact_write_fields(contact_payload)
        if notes or rich or contact_payload.get("contact_id") is not None or name:
            contact, contact_id, create_name, err = _resolve_contact_by_ref(contact_payload)
            if err:
                errors.append({"item": "contact", "error": err})
            else:
                try:
                    if create_name:
                        fields = dict(rich)
                        fields["name"] = create_name
                        if notes and "notes" not in fields:
                            fields["notes"] = notes
                        contact_id = db.upsert_contact(None, **fields)
                        created["contact"] = {
                            "contact_id": contact_id,
                            "name": create_name,
                            "created": True,
                            "fields_set": sorted(fields.keys()),
                        }
                    else:
                        updates = dict(rich)
                        if notes:
                            append = contact_payload.get("append", True)
                            existing = (contact.get("notes") or "").strip()
                            merged = (
                                f"{existing}\n\n{notes}".strip()
                                if append and existing
                                else notes
                            )
                            updates["notes"] = merged
                        if updates:
                            db.upsert_contact(contact_id, **updates)
                        created["contact"] = {
                            "contact_id": contact_id,
                            "name": contact["name"],
                            "notes_updated": bool(notes),
                            "fields_set": sorted(updates.keys()),
                        }
                    linked_contact_id = contact_id
                except Exception as exc:
                    errors.append({"item": "contact", "error": str(exc)})

    project_note_payload = tool_input.get("project_note")
    if isinstance(project_note_payload, dict) and project_note_payload:
        body = (project_note_payload.get("body") or "").strip()
        if body:
            project, project_id, err = _resolve_project_by_ref(project_note_payload)
            if err:
                errors.append({"item": "project_note", "error": err})
            else:
                try:
                    note_id = db.insert_project_note(
                        project_id,
                        project_note_payload.get("category", "general"),
                        body,
                    )
                    created["project_note"] = {
                        "note_id": note_id,
                        "project_id": project_id,
                        "project_name": project["name"],
                    }
                    linked_project_id = project_id
                except Exception as exc:
                    errors.append({"item": "project_note", "error": str(exc)})
        else:
            errors.append({"item": "project_note", "error": "body is required"})

    task_payload = tool_input.get("task")
    if isinstance(task_payload, dict) and task_payload:
        title = (task_payload.get("title") or "").strip()
        if not title:
            errors.append({"item": "task", "error": "title is required"})
        else:
            try:
                contact_id = task_payload.get("contact_id", linked_contact_id)
                project_id = task_payload.get("project_id", linked_project_id)
                urgency = task_payload.get("urgency", "medium")
                due_date, deadline_dismissed = _due_date_or_dismissed(task_payload)
                task_id = db.insert_task(
                    title,
                    description=task_payload.get("description", ""),
                    notes=task_payload.get("notes", ""),
                    urgency=urgency,
                    progress_total=task_payload.get("progress_total"),
                    progress_unit=task_payload.get("progress_unit"),
                    contact_id=contact_id,
                    project_id=project_id,
                    due_date=due_date,
                    deadline_dismissed=deadline_dismissed,
                )
                if urgency == "critical" and os.environ.get("PLANNER_TO_EMAIL"):
                    import email_sender
                    email_sender.send(
                        os.environ["PLANNER_TO_EMAIL"],
                        f"[critical] New task: {title}",
                        task_payload.get("notes", ""),
                    )
                created["task"] = db.get_task(task_id)
            except Exception as exc:
                errors.append({"item": "task", "error": str(exc)})

    event_payload = tool_input.get("calendar_event")
    if isinstance(event_payload, dict) and event_payload:
        title = (event_payload.get("title") or "").strip()
        date = (event_payload.get("date") or "").strip()
        if not title or not date:
            errors.append({"item": "calendar_event", "error": "title and date are required"})
        else:
            try:
                duplicates = _matching_calendar_events(
                    title, date, event_payload.get("start_time"),
                )
                if duplicates:
                    errors.append({
                        "item": "calendar_event",
                        "error": "duplicate event with the same title, date, and time already exists",
                        "existing": [
                            {"id": ev.get("id"), "title": ev.get("title"), "date": ev.get("date")}
                            for ev in duplicates[:5]
                        ],
                    })
                else:
                    event_id = db.insert_calendar_event(
                        title,
                        date,
                        event_payload.get("start_time"),
                        event_payload.get("end_time"),
                        None,
                        event_payload.get("notes"),
                    )
                    created["calendar_event"] = db.get_calendar_event(event_id)
            except Exception as exc:
                errors.append({"item": "calendar_event", "error": str(exc)})

    note_payload = tool_input.get("note")
    if isinstance(note_payload, dict) and note_payload:
        list_type = note_payload.get("list_type", "")
        note_title = (note_payload.get("title") or "").strip()
        if list_type not in NOTE_LIST_TYPES:
            errors.append({
                "item": "note",
                "error": f"list_type must be one of: {', '.join(NOTE_LIST_TYPES)}",
            })
        elif not note_title:
            errors.append({"item": "note", "error": "title is required"})
        else:
            try:
                note_id = db.insert_note(
                    list_type, note_title, note_payload.get("body", ""), source="ai",
                )
                created["note"] = db.get_note(note_id)
            except Exception as exc:
                errors.append({"item": "note", "error": str(exc)})

    if not created and not any(
        k in tool_input
        for k in ("contact", "project_note", "task", "calendar_event", "note")
    ):
        return {"error": "provide at least one of: contact, project_note, task, calendar_event, note"}

    summary = (tool_input.get("summary") or "").strip()
    out = {"ok": bool(created), "created": created}
    if summary:
        out["summary"] = summary
    if errors:
        out["errors"] = errors
    if not created and errors:
        out["ok"] = False
    return out


def _today():
    return db.now_iso()[:10]


def _open_tasks():
    return [t for t in db.list_tasks() if t.get("status") in ("todo", "partial")]


def _compact_task(t):
    return {
        "id": t["id"], "title": t["title"], "status": t["status"],
        "urgency": t["urgency"], "due_date": t.get("due_date"),
        "progress_done": t.get("progress_done"), "progress_total": t.get("progress_total"),
    }


def _build_context_block():
    """Compact 'what I know right now' snapshot for the system prompt (~1500 tokens max)."""
    try:
        today = _today()
        open_tasks = _open_tasks()
        overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today]
        due_today = [t for t in open_tasks if t.get("due_date") == today]
        today_events = db.list_calendar_events(start=today, end=today)
        active_projects = [p for p in db.list_projects() if p.get("status", "active") != "done"]
        today_pulses = db.list_mood_pulses(date_prefix=today)
        recent_ideas = db.list_ideas()[:5]

        lines = [
            f"Today: {today}",
            f"Counts: {len(open_tasks)} open tasks, {len(overdue)} overdue, "
            f"{len(due_today)} due today, {len(today_events)} calendar events today, "
            f"{len(active_projects)} active projects, {len(today_pulses)} pulses logged today",
        ]
        if overdue:
            lines.append("Overdue (top 5): " + "; ".join(
                f"#{t['id']} {t['title']}" for t in overdue[:5]
            ))
        if due_today:
            lines.append("Due today: " + "; ".join(t["title"] for t in due_today[:5]))
        if today_events:
            lines.append("Today's events: " + "; ".join(
                f"{e.get('start_time') or 'all-day'} {e['title']}" for e in today_events[:6]
            ))
        if active_projects:
            lines.append("Active projects: " + "; ".join(
                f"{p['name']} ({p.get('progress', 0)}%)" for p in active_projects[:6]
            ))
        if recent_ideas:
            lines.append("Recent ideas: " + "; ".join(i["title"] for i in recent_ideas))

        settings = db.get_settings()
        repo_summary = _truncate_text(settings.get("repo_master_summary"), REPO_SUMMARY_MAX_CHARS)
        if repo_summary:
            lines.append(f"Repository overview: {repo_summary}")

        user_profile = _truncate_text(settings.get("user_profile"), USER_PROFILE_MAX_CHARS)
        if user_profile:
            lines.append(f"User profile: {user_profile}")

        try:
            napkin_path = Path(__file__).parent / "NAPKIN.md"
            if napkin_path.is_file():
                napkin_text = napkin_path.read_text(encoding="utf-8")
                # Skip the header so the model sees actual notes.
                body = "\n".join(napkin_text.splitlines()[6:]).strip()
                if body:
                    lines.append("Open napkin (truncated): " + _truncate_text(body, 1400))
        except Exception:
            pass

        block = "\n".join(lines)
        return _truncate_text(block, CONTEXT_MAX_CHARS)
    except Exception as exc:
        print(f"[agent] context block failed: {exc}")
        return f"Today: {_today()} (context snapshot unavailable)"


def _describe_tool_step(name, tool_input, result=None):
    """Map a tool call to a short plain-language step for the UI trace."""
    inp = tool_input or {}
    res = result if isinstance(result, dict) else {}

    def _q(key, default=""):
        val = inp.get(key, default)
        return str(val).strip() if val is not None else default

    descriptions = {
        "search_repository": lambda: f"Searched your repository for '{_q('query')}'",
        "list_repository_files": lambda: (
            "Listed repository files"
            + (f' in category "{_q("category")}"' if _q("category") else "")
        ),
        "read_repository_file": lambda: (
            f"Read repository file: {res.get('filename') or _q('filename') or '#' + str(inp.get('file_id'))}"
        ),
        "classify_into_lists": lambda: (
            "Classified "
            + (_q("filename") or res.get("filename") or "document")
            + " into Capture list proposals"
            + (f" ({len(res.get('items', []))} items)" if res.get("ok") else "")
        ),
        "summarize_repository": lambda: "Rebuilt your repository master summary",
        "delete_repository_file": lambda: (
            f"Proposed deleting repository file: {res.get('summary') or res.get('filename') or '#' + str(inp.get('file_id'))}"
            if res.get("needs_confirmation")
            else f"Deleted repository file: {res.get('filename') or '#' + str(inp.get('file_id'))}"
        ),
        "get_overdue_tasks": lambda: "Looked up your overdue tasks",
        "get_todays_plan": lambda: "Loaded today's plan and calendar",
        "list_projects": lambda: "Listed your projects",
        "get_recent_ideas": lambda: "Fetched your recent ideas",
        "get_state": lambda: "Loaded a compact data snapshot",
        "read_napkin": lambda: "Read the napkin / work queue",
        "list_tasks": lambda: (
            "Searched tasks" + (f' matching "{_q("search")}"' if _q("search") else "")
        ),
        "list_contacts": lambda: (
            "Searched contacts" + (f' matching "{_q("search")}"' if _q("search") else "")
        ),
        "list_customers": lambda: (
            "Searched customers" + (f' matching "{_q("search")}"' if _q("search") else "")
        ),
        "add_task": lambda: (
            f"Flagged repeated task: {_q('title')}"
            if res.get("needs_confirmation") and res.get("repeated")
            else (
                f"Added repeated task: {_q('title')}"
                if res.get("repeated")
                else f"Added task: {_q('title')}"
            )
        ),
        "update_task": lambda: f"Updated task #{inp.get('task_id')}",
        "update_contact": lambda: (
            "Updated contact: "
            + (
                ((res.get("contact") or {}).get("name") if isinstance(res.get("contact"), dict) else None)
                or _q("name")
                or f"#{inp.get('contact_id')}"
            )
            + (f" ({', '.join(res.get('fields_set', []))})" if res.get("fields_set") else "")
        ),
        "update_customer": lambda: f"Updated customer #{inp.get('customer_id')}",
        "update_project": lambda: f"Updated project #{inp.get('project_id')}",
        "update_idea": lambda: f"Updated idea #{inp.get('idea_id')}",
        "update_note": lambda: f"Updated note #{inp.get('note_id')}",
        "update_calendar_event": lambda: f"Updated calendar event #{inp.get('event_id')}",
        "complete_event": lambda: f"Completed calendar event #{inp.get('event_id')}",
        "complete_calendar_event": lambda: f"Completed calendar event #{inp.get('event_id')}",
        "update_event": lambda: f"Updated interest event #{inp.get('event_id')}",
        "add_recurring_event": lambda: f"Added weekly series: {inp.get('title')}",
        "add_task_bet": lambda: f"Staked {inp.get('coins')} coins on task #{inp.get('task_id')}",
        "set_task_prerequisite": lambda: f"Blocked task #{inp.get('task_id')} behind #{inp.get('prerequisite_id')}",
        "add_alarm": lambda: f"Set {inp.get('kind') or 'math'} alarm: {inp.get('title')}",
        "complete_task": lambda: f"Marked task #{inp.get('task_id')} done",
        "delete_task": lambda: (
            f"Deleted task: {res.get('title') or '#' + str(inp.get('task_id'))}"
        ),
        "list_running_agents": lambda: "Listed currently running subagents",
        "stop_agent": lambda: f"Requested stop for agent {inp.get('agent_id')}",
        "spawn_agent": lambda: f"Spawned agent {res.get('id') or inp.get('title') or ''}",
        "add_to_cart": lambda: f"Queued cart item {res.get('id')}: {inp.get('title')}",
        "list_cart": lambda: "Listed cart items",
        "delete_idea": lambda: (
            f"Deleted idea: {res.get('title') or '#' + str(inp.get('idea_id'))}"
        ),
        "delete_note": lambda: (
            f"Deleted note: {res.get('title') or '#' + str(inp.get('note_id'))}"
        ),
        "delete_project": lambda: (
            f"Deleted project: {res.get('name') or '#' + str(inp.get('project_id'))}"
        ),
        "delete_event": lambda: (
            f"Deleted calendar event: {res.get('title') or '#' + str(inp.get('event_id'))}"
        ),
        "delete_calendar_event": lambda: (
            f"Deleted calendar event: {res.get('title') or '#' + str(inp.get('event_id'))}"
        ),
        "delete_contact": lambda: (
            f"Deleted contact: {res.get('name') or '#' + str(inp.get('contact_id'))}"
        ),
        "delete_competition": lambda: (
            f"Deleted competition: {res.get('title') or '#' + str(inp.get('competition_id'))}"
        ),
        "add_calendar_event": lambda: f"Added calendar event: {_q('title')} on {_q('date')}",
        "add_goal": lambda: f"Added goal: {_q('title')}",
        "add_idea": lambda: f"Saved idea: {_q('title')}",
        "add_project": lambda: f"Added project: {_q('name')}",
        "add_note": lambda: f"Added {_q('list_type')} note: {_q('title')}",
        "add_project_note": lambda: f"Logged project note on project #{inp.get('project_id')}",
        "create_situation": lambda: (
            "Proposed situation plan"
            + (f': {_q("summary")}' if _q("summary") else "")
            + (
                f" ({len(res.get('proposed_actions', []))} actions)"
                if res.get("needs_confirmation")
                else (
                    f" ({', '.join(res.get('created', {}).keys())})"
                    if res.get("created")
                    else ""
                )
            )
        ),
        "add_customer": lambda: f"Added customer: {_q('name')}",
        "add_contact": lambda: (
            "Added contact: " + (
                ", ".join(
                    bit for bit in [
                        _q("name"),
                        _q("what_they_do"),
                        _q("met_where"),
                        _q("email"),
                        _q("closeness"),
                    ] if bit
                ) or _q("name") or "contact"
            )
        ),
        "scan_competitions": lambda: "Scanned for competitions",
        "read_project_file": lambda: f"Read project file: {_q('path')}",
        "propose_file_edit": lambda: f"Proposed edit to {_q('path')}",
        "propose_command": lambda: f"Proposed command: {_q('command')}",
        "web_search": lambda: "Searched the web" if res.get("ok") else "Web search unavailable",
        "propose_bug": lambda: f"Proposed bug: {_q('title')}",
        "preview_bulk_import": lambda: f"Previewed {res.get('count') or 0} pasted {res.get('kind') or 'rows'}",
        "preview_schedule_import": lambda: f"Previewed {res.get('count') or 0} class slots",
        "import_course_schedule": lambda: f"Imported {res.get('count') or 0} class slots",
    }
    maker = descriptions.get(name)
    if maker:
        try:
            return maker()
        except Exception:
            pass
    return f"Used {name.replace('_', ' ')}"


def _execute_tool(name, tool_input, tool_policy="auto"):
    pending = _maybe_require_write_confirm(name, tool_input, tool_policy)
    if pending:
        return pending

    if name in SELF_CODING_WRITE_TOOLS:
        if not self_coding_enabled():
            return {
                "error": "self-coding mode is off — enable Developer / self-coding mode in Settings "
                          "to propose app code changes or shell commands",
            }
        if not model_roles.is_strong_coding_model("chat"):
            backend = model_roles.configured_backend("chat")
            return {
                "error": (
                    f"self-coding requires Claude — Agent chat is routed to {backend!r}; "
                    "set route_chat to Claude in Settings to stage code edits"
                ),
            }

    name = _CALENDAR_TOOL_ALIASES.get(name, name)

    if name == "add_calendar_event":
        import napkin_complete
        # Empty-time guard: no auto-time invention. Never invent a clock time.
        start_time = _persist_named_clock(tool_input.get("start_time"))
        end_time = _persist_named_clock(tool_input.get("end_time"))
        clocks = {"start_time": start_time, "end_time": end_time}
        conflicts = napkin_complete.calendar_conflicts(
            tool_input["date"], start_time, end_time,
            title=tool_input["title"],
        )
        if (conflicts["overlaps"] or conflicts["duplicates"]) and not _is_confirmed(tool_input):
            warning = "This slot overlaps or duplicates an existing event."
            proposed = _propose_write_action("add_calendar_event", {**tool_input, **clocks})
            pending = _confirmation_pending(
                "add_calendar_event", proposed, summary=f"Add event (conflict): {tool_input['title']}",
            )
            pending.update({"warning": warning, "overlaps": conflicts["overlaps"][:5],
                            "duplicates": conflicts["duplicates"][:5]})
            return pending
        event_id = db.insert_calendar_event(
            tool_input["title"], tool_input["date"], start_time,
            end_time, None, tool_input.get("notes"),
            url=tool_input.get("url"),
            kind=tool_input.get("kind"),
            lane=tool_input.get("lane"),
        )
        _ev = db.get_calendar_event(event_id)
        try:
            rules.emit("calendar.created", dict(_ev))
        except Exception as _re:
            print(f"[rules] calendar.created (agent) error: {_re}")
        duplicates = _matching_calendar_events(
            tool_input["title"], tool_input["date"], start_time,
        )
        result = {"ok": True, "event": _ev}
        if len(duplicates) > 1:
            result.update({
                "repeated": True,
                "warning": "Created after confirming an existing event with the same title, date, and time.",
            })
        return result

    if name == "add_goal":
        try:
            chunks = orchestrator.run(
                "goal_chunker", title=tool_input["title"], deadline=tool_input["deadline"],
                today=db.now_iso()[:10],
            )
        except Exception as exc:
            chunks = []
            print(f"[agent] goal_chunker failed: {exc}")
        goal_id = db.create_goal(tool_input["title"], tool_input["deadline"], chunks)
        return {"ok": True, "goal": db.get_goal(goal_id)}

    if name == "add_idea":
        idea_id = db.insert_idea(tool_input["title"], tool_input.get("body", ""), source="ai")
        ideas = db.list_ideas()
        texts = [f"{i['title']} {i.get('body') or ''}" for i in ideas]
        for idea, (x, y, z) in zip(ideas, embeddings.texts_to_3d(texts)):
            db.update_idea_coords(idea["id"], x, y, z)
        try:
            rules.emit("idea.created", {"id": idea_id, "title": tool_input["title"], "body": tool_input.get("body", "")})
        except Exception as _re:
            print(f"[rules] idea.created (agent) error: {_re}")
        return {"ok": True, "idea_id": idea_id, "idea": db.get_idea(idea_id), "ideas_count": len(ideas)}

    if name == "add_project":
        project_id = db.insert_project(
            tool_input["name"], tool_input.get("description", ""), tool_input.get("kind", "software")
        )
        return {"ok": True, "project": db.get_project(project_id)}

    if name == "add_customer":
        customer_id = db.insert_customer(tool_input["name"], tool_input.get("company", ""), tool_input.get("notes", ""))
        return {"ok": True, "customer": db.get_customer(customer_id)}

    if name == "add_contact":
        fields = _contact_write_fields(tool_input)
        fields["name"] = (tool_input.get("name") or "").strip()
        if not fields["name"]:
            return {"error": "name is required"}
        contact_id = db.upsert_contact(None, **fields)
        contact = _get_contact_by_id(contact_id) or {"id": contact_id, **fields}
        return {"ok": True, "contact_id": contact_id, "contact": contact}

    if name == "list_contacts":
        search = (tool_input.get("search") or "").strip().lower()
        contacts = db.list_contacts()
        if search:
            contacts = [
                c for c in contacts
                if search in " ".join(
                    str(c.get(k) or "") for k in (
                        "name", "notes", "description", "what_they_do", "met_where",
                        "email", "phone", "current_focus", "closeness",
                    )
                ).lower()
            ]
        return {
            "ok": True,
            "count": len(contacts),
            "contacts": [
                {
                    "id": c["id"],
                    "name": c.get("name"),
                    "what_they_do": c.get("what_they_do"),
                    "email": c.get("email"),
                    "phone": c.get("phone"),
                    "closeness": c.get("closeness"),
                    "met_where": c.get("met_where"),
                    "notes": (c.get("notes") or "")[:160],
                }
                for c in contacts[:40]
            ],
        }

    if name == "update_contact":
        contact, contact_id, create_name, err = _resolve_contact_by_ref(tool_input)
        if err:
            return {"error": err}
        if create_name:
            return {"error": f"no contact matching {create_name!r} — use add_contact or list_contacts"}
        fields = _contact_write_fields(tool_input)
        # Allow renaming when contact_id is provided and name differs.
        if tool_input.get("contact_id") is not None and tool_input.get("name"):
            new_name = str(tool_input.get("name") or "").strip()
            if new_name and new_name.lower() != (contact.get("name") or "").lower():
                fields["name"] = new_name
        if "notes" in fields and tool_input.get("append_notes"):
            existing = (contact.get("notes") or "").strip()
            if existing:
                fields["notes"] = f"{existing}\n\n{fields['notes']}".strip()
        if not fields:
            return {"error": "no fields to update"}
        db.upsert_contact(contact_id, **fields)
        updated = _get_contact_by_id(contact_id)
        return {"ok": True, "contact_id": contact_id, "contact": updated, "fields_set": sorted(fields.keys())}

    if name == "list_customers":
        search = (tool_input.get("search") or "").strip().lower()
        customers = db.list_customers()
        if search:
            customers = [
                c for c in customers
                if search in " ".join(str(c.get(k) or "") for k in ("name", "company", "notes", "status")).lower()
            ]
        return {
            "ok": True,
            "customers": [
                {
                    "id": c["id"],
                    "name": c.get("name"),
                    "company": c.get("company"),
                    "status": c.get("status"),
                    "notes": (c.get("notes") or "")[:160],
                }
                for c in customers[:40]
            ],
        }

    if name == "update_customer":
        customer_id = tool_input["customer_id"]
        customer = db.get_customer(customer_id)
        if not customer:
            return {"error": f"no customer with id {customer_id}"}
        fields = {}
        for key in ("name", "company", "notes", "status"):
            if key in tool_input and tool_input[key] is not None:
                val = tool_input[key]
                if isinstance(val, str):
                    val = val.strip()
                fields[key] = val
        if "notes" in fields and tool_input.get("append_notes"):
            existing = (customer.get("notes") or "").strip()
            if existing:
                fields["notes"] = f"{existing}\n\n{fields['notes']}".strip()
        if not fields:
            return {"error": "no fields to update"}
        fields["last_update"] = db.now_iso()
        db.update_customer(customer_id, **fields)
        return {"ok": True, "customer": db.get_customer(customer_id), "fields_set": sorted(fields.keys())}

    if name == "update_project":
        project_id = tool_input["project_id"]
        project = db.get_project(project_id)
        if not project:
            return {"error": f"no project with id {project_id}"}
        fields = {}
        for key in ("name", "description", "status", "progress", "kind", "path", "run_command", "archive_notes"):
            if key in tool_input and tool_input[key] is not None:
                fields[key] = tool_input[key]
        if not fields:
            return {"error": "no fields to update"}
        db.update_project(project_id, **fields)
        return {"ok": True, "project": db.get_project(project_id), "fields_set": sorted(fields.keys())}

    if name == "update_idea":
        idea_id = tool_input["idea_id"]
        idea = db.get_idea(idea_id)
        if not idea:
            return {"error": f"no idea with id {idea_id}"}
        fields = {k: tool_input[k] for k in ("title", "body") if k in tool_input and tool_input[k] is not None}
        if not fields:
            return {"error": "no fields to update"}
        updated = db.update_idea(idea_id, fields)
        return {"ok": True, "idea": updated, "fields_set": sorted(fields.keys())}

    if name == "update_note":
        note_id = tool_input["note_id"]
        note = db.get_note(note_id)
        if not note:
            return {"error": f"no note with id {note_id}"}
        fields = {k: tool_input[k] for k in ("title", "body") if k in tool_input and tool_input[k] is not None}
        updated = note
        if fields:
            updated = db.update_note(note_id, fields)
        if "status" in tool_input and tool_input["status"] is not None:
            db.set_note_status(note_id, tool_input["status"])
            fields["status"] = tool_input["status"]
        if "proficiency" in tool_input and tool_input["proficiency"] is not None:
            db.set_note_proficiency(note_id, int(tool_input["proficiency"]))
            fields["proficiency"] = tool_input["proficiency"]
        if not fields:
            return {"error": "no fields to update"}
        return {"ok": True, "note": db.get_note(note_id), "fields_set": sorted(fields.keys())}

    if name == "update_calendar_event":
        event_id = tool_input["event_id"]
        event = db.get_calendar_event(event_id)
        if not event:
            return {"error": f"no calendar event with id {event_id}"}
        fields = {}
        for key in _CALENDAR_UPDATE_FIELDS:
            if key not in tool_input or tool_input[key] is None:
                continue
            if key in ("start_time", "end_time"):
                # Empty-time guard: no auto-time invention. Persist named times exactly.
                raw = tool_input[key]
                if isinstance(raw, str) and not raw.strip():
                    fields[key] = None
                else:
                    fields[key] = _persist_named_clock(raw)
                continue
            fields[key] = tool_input[key]
        if not fields:
            return {"error": "no fields to update"}
        db.update_calendar_event(event_id, **fields)
        return {"ok": True, "event": db.get_calendar_event(event_id), "fields_set": sorted(fields.keys())}

    if name == "add_task":
        duplicates = _matching_task_titles(tool_input["title"])
        urgency = tool_input.get("urgency", "medium")
        due_date, deadline_dismissed = _due_date_or_dismissed(tool_input)
        task_id = db.insert_task(
            tool_input["title"], notes=tool_input.get("notes", ""), urgency=urgency,
            description=tool_input.get("description", ""),
            progress_total=tool_input.get("progress_total"), progress_unit=tool_input.get("progress_unit"),
            contact_id=tool_input.get("contact_id"), project_id=tool_input.get("project_id"),
            due_date=due_date, deadline_dismissed=deadline_dismissed,
            created_by="ai", tags=tool_input.get("tags"),
            deadline_kind=tool_input.get("deadline_kind"),
            estimate_minutes=tool_input.get("estimate_minutes"),
        )
        if urgency == "critical" and os.environ.get("PLANNER_TO_EMAIL"):
            import email_sender
            email_sender.send(
                os.environ["PLANNER_TO_EMAIL"], f"[critical] New task: {tool_input['title']}",
                tool_input.get("notes", ""),
            )
        _task = db.get_task(task_id)
        try:
            rules.emit("task.created", dict(_task))
        except Exception as _re:
            print(f"[rules] task.created (agent) error: {_re}")
        result = {"ok": True, "task": _task}
        if duplicates:
            result.update({
                "repeated": True,
                "warning": "Created after confirming an existing task with the same normalized title.",
                "duplicate_tasks": [
                    {"id": task.get("id"), "title": task.get("title"), "status": task.get("status")}
                    for task in duplicates[:5]
                ],
            })
        return result

    if name == "batch_add_tasks":
        created = []
        skipped = []
        errors = []
        seen = set()
        for item in (tool_input.get("tasks") or [])[:BATCH_ADD_TASKS_MAX]:
            title = (item.get("title") or "").strip()
            if not title:
                errors.append({"error": "title is required", "item": item})
                continue
            key = _normalize_task_title(title)
            if not key:
                errors.append({"error": "title is required", "item": item})
                continue
            if key in seen or _matching_task_titles(title):
                skipped.append({"title": title, "reason": "duplicate"})
                continue
            seen.add(key)
            due_date, deadline_dismissed = _due_date_or_dismissed(item)
            task_id = db.insert_task(
                title,
                notes=item.get("notes", ""),
                urgency=item.get("urgency", "medium"),
                description=item.get("description", ""),
                due_date=due_date,
                deadline_dismissed=deadline_dismissed,
                created_by="ai",
                tags=item.get("tags"),
                estimate_minutes=item.get("estimate_minutes"),
            )
            task = db.get_task(task_id)
            try:
                rules.emit("task.created", dict(task))
            except Exception as _re:
                print(f"[rules] task.created (batch) error: {_re}")
            created.append(task)
        return {
            "ok": True,
            "created": created,
            "skipped": skipped,
            "count": len(created),
            "errors": errors,
        }

    if name == "add_recurring_class":
        start = _normalize_clock(tool_input.get("start_time"))
        end = _normalize_clock(tool_input.get("end_time"))
        if not start or not end:
            return {"error": _INVENTED_TIME_ERROR}
        if _class_slot_exists(tool_input["name"], tool_input["weekday"], start, end) and not _is_confirmed(tool_input):
            return _confirmation_pending(
                "add_recurring_class",
                _propose_write_action("add_recurring_class", {**tool_input, "start_time": start, "end_time": end}),
                summary=f"Add repeated class: {tool_input['name']}",
            )
        class_id = db.upsert_class_slot(
            tool_input["name"],
            int(tool_input["weekday"]),
            start,
            end,
            travel_minutes=int(tool_input.get("travel_minutes") or 0),
            location=tool_input.get("location") or "",
            notes=tool_input.get("notes") or "",
            source="agent",
            horizon_weeks=int(tool_input.get("horizon_weeks") or 16),
            start_date=tool_input.get("start_date"),
            end_date=tool_input.get("end_date"),
        )
        events_created = db.materialize_class_events(class_id)
        return {"ok": True, "class": db.get_class(class_id), "events_created": events_created}

    if name == "list_classes":
        rows = db.list_classes()
        compact = []
        for row in rows:
            compact.append({
                "id": row["id"],
                "name": row["name"],
                "weekday": row["weekday"],
                "start_time": row["start_time"],
                "end_time": row["end_time"],
                "location": row.get("location"),
                "horizon_weeks": row.get("horizon_weeks"),
                "items": [
                    {
                        "id": item["id"],
                        "title": item["title"],
                        "item_type": item["item_type"],
                        "due_date": item.get("due_date"),
                        "grade_score": item.get("grade_score"),
                        "grade_letter": item.get("grade_letter"),
                    }
                    for item in (row.get("items") or [])
                ],
            })
        return {"ok": True, "classes": compact}

    if name == "grade_class_item":
        item = db.get_class_item(int(tool_input["item_id"]))
        class_row = db.get_class(int(tool_input["class_id"]))
        if not item or not class_row or item.get("class_id") != class_row["id"]:
            return {"error": "class item not found"}
        answer = (tool_input.get("answer") or item.get("student_answer") or "").strip()
        attachments_text = "\n".join(
            f.get("filename") or "" for f in (item.get("attachments") or [])
        )
        result = ai.grade_class_work(
            title=f"{class_row['name']}: {item['title']}",
            notes=item.get("notes") or "",
            answer=answer,
            attachments_text=attachments_text,
        )
        db.update_class_item_grade(
            item["id"], result["score"], result["letter"], result["feedback"], student_answer=answer,
        )
        return {"ok": True, "grade": result, "item_id": item["id"]}

    if name == "list_observations":
        rows = db.list_observations(limit=tool_input.get("limit") or 20)
        return {"ok": True, "observations": rows}

    if name == "list_tasks":
        tasks = db.list_tasks(
            search=tool_input.get("search"), status=tool_input.get("status"),
        )[:30]
        return {
            "ok": True,
            "tasks": [
                {
                    "id": t["id"], "title": t["title"], "status": t["status"],
                    "urgency": t["urgency"], "due_date": t.get("due_date"),
                    "description": t.get("description"),
                    "progress_done": t.get("progress_done"), "progress_total": t.get("progress_total"),
                }
                for t in tasks
            ],
        }

    if name == "update_task":
        task_id = tool_input["task_id"]
        if not db.get_task(task_id):
            return {"error": f"no task with id {task_id}"}
        fields = {
            k: tool_input[k] for k in (
                "title", "description", "urgency", "due_date", "status", "progress_done",
                "progress_total", "notes",
            )
            if k in tool_input
        }
        if not fields:
            return {"error": "no fields to update"}
        db.update_task(task_id, **fields)
        _task = db.get_task(task_id)
        if fields.get("status") == "done":
            try:
                rules.emit("task.completed", dict(_task))
            except Exception as _re:
                print(f"[rules] task.completed (agent/update) error: {_re}")
        return {"ok": True, "task": _task}

    if name == "complete_task":
        task_id = tool_input["task_id"]
        if not db.get_task(task_id):
            return {"error": f"no task with id {task_id}"}
        db.update_task(task_id, status="done")
        _task = db.get_task(task_id)
        try:
            rules.emit("task.completed", dict(_task))
        except Exception as _re:
            print(f"[rules] task.completed (agent) error: {_re}")
        return {"ok": True, "task": _task}

    if name == "delete_task":
        task_id = tool_input["task_id"]
        task = db.get_task(task_id)
        if not task:
            return {"error": f"no task with id {task_id}"}
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_task",
                [{"action": "delete_task", "task_id": task_id, "title": task["title"], "restorable": True}],
                summary=f"Delete task: {task['title']}",
            )
        db.delete_task(task_id)
        return {"ok": True, "deleted_task_id": task_id, "title": task["title"], "restorable": True}

    if name == "list_running_agents":
        try:
            agents = orchestrator.list_running()
        except Exception as exc:
            return {"error": str(exc)}
        try:
            import napkin_remaining
            spawned = napkin_remaining.list_spawned_agents()
        except Exception:
            spawned = []
        return {"ok": True, "running_agents": agents, "spawned_agents": spawned, "count": len(agents) + len(spawned)}

    if name == "stop_agent":
        agent_id = str(tool_input.get("agent_id", "")).strip()
        if not agent_id:
            return {"error": "agent_id is required"}
        try:
            import napkin_remaining
            spawned = napkin_remaining.stop_spawned_agent(agent_id)
            if spawned.get("ok"):
                return spawned
        except Exception:
            pass
        try:
            return orchestrator.request_cancel(agent_id)
        except Exception as exc:
            return {"error": str(exc)}

    if name == "spawn_agent":
        import napkin_remaining
        return napkin_remaining.spawn_agent_job(tool_input.get("prompt") or "", title=tool_input.get("title") or "")

    if name == "add_to_cart":
        import napkin_remaining
        return napkin_remaining.add_cart_item(
            tool_input.get("title"),
            url=tool_input.get("url") or "",
            notes=tool_input.get("notes") or "",
            created_by="ai",
        )

    if name == "list_cart":
        import napkin_remaining
        items = napkin_remaining.list_cart(tool_input.get("status"))
        return {"ok": True, "items": items, "count": len(items)}

    if name == "use_integration":
        import napkin_depth
        return napkin_depth.use_integration(
            tool_input.get("name") or tool_input.get("id"),
            action=tool_input.get("action") or "status",
            payload=tool_input.get("payload") if isinstance(tool_input.get("payload"), dict) else {},
        )

    if name == "complete_calendar_event":
        import napkin_issues
        return napkin_issues.complete_calendar_event(tool_input.get("event_id"))

    if name == "update_event":
        import napkin_issues
        event_id = tool_input.get("event_id")
        fields = {k: tool_input[k] for k in napkin_issues.EVENT_UPDATE_FIELDS if k in tool_input}
        return napkin_issues.safe_update_interest_event(event_id, **fields)

    if name == "add_recurring_event":
        import napkin_issues
        start = _normalize_clock(tool_input.get("start_time"))
        end = _normalize_clock(tool_input.get("end_time"))
        if not start:
            return {"error": _INVENTED_TIME_ERROR}
        return napkin_issues.add_recurring_event(
            tool_input.get("title"),
            tool_input.get("start_date") or tool_input.get("date"),
            start,
            end,
            tool_input.get("weekday"),
            weeks=tool_input.get("weeks") or 8,
            category=tool_input.get("category"),
            notes=tool_input.get("notes"),
            kind=tool_input.get("kind"),
            end_date=tool_input.get("end_date"),
        )

    if name == "add_task_bet":
        import napkin_issues
        return napkin_issues.place_bet(
            tool_input.get("task_id"),
            tool_input.get("due_date"),
            tool_input.get("coins"),
        )

    if name == "set_task_prerequisite":
        import napkin_issues
        return napkin_issues.set_prerequisite(
            tool_input.get("task_id"),
            tool_input.get("prerequisite_id"),
        )

    if name == "add_alarm":
        import napkin_issues
        return napkin_issues.add_alarm(
            tool_input.get("title"),
            tool_input.get("fire_at"),
            tool_input.get("kind") or "math",
        )

    if name == "delete_idea":
        idea_id = tool_input["idea_id"]
        idea = db.get_idea(idea_id)
        if not idea:
            return {"error": f"no idea with id {idea_id}"}
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_idea",
                [{"action": "delete_idea", "idea_id": idea_id, "title": idea["title"], "restorable": True}],
                summary=f"Delete idea: {idea['title']}",
            )
        db.delete_idea(idea_id)
        return {"ok": True, "deleted_idea_id": idea_id, "title": idea["title"], "restorable": True}

    if name == "delete_note":
        note_id = tool_input["note_id"]
        note = db.get_note(note_id)
        if not note:
            return {"error": f"no note with id {note_id}"}
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_note",
                [{"action": "delete_note", "note_id": note_id, "title": note["title"], "restorable": True}],
                summary=f"Delete note: {note['title']}",
            )
        db.delete_note(note_id)
        return {"ok": True, "deleted_note_id": note_id, "title": note["title"], "restorable": True}

    if name == "delete_project":
        project_id = tool_input["project_id"]
        project = db.get_project(project_id)
        if not project:
            return {"error": f"no project with id {project_id}"}
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_project",
                [{
                    "action": "delete_project",
                    "project_id": project_id,
                    "name": project["name"],
                    "restorable": True,
                }],
                summary=f"Delete project: {project['name']}",
            )
        db.delete_project(project_id)
        return {"ok": True, "deleted_project_id": project_id, "name": project["name"], "restorable": True}

    if name == "delete_calendar_event":
        event_id = tool_input["event_id"]
        event = db.get_calendar_event(event_id)
        if not event:
            return {"error": f"no calendar event with id {event_id}"}
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_calendar_event",
                [{
                    "action": "delete_calendar_event",
                    "event_id": event_id,
                    "title": event["title"],
                    "permanent": True,
                }],
                summary=f"Delete calendar event: {event['title']} (not in trash)",
            )
        db.delete_calendar_event(event_id)
        return {
            "ok": True,
            "deleted_event_id": event_id,
            "title": event["title"],
            "restorable": False,
            "note": "calendar events are not stored in trash",
        }

    if name == "delete_contact":
        contact_id = tool_input["contact_id"]
        contacts = [c for c in db.list_contacts() if c["id"] == contact_id]
        if not contacts:
            return {"error": f"no contact with id {contact_id}"}
        contact = contacts[0]
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_contact",
                [{
                    "action": "delete_contact",
                    "contact_id": contact_id,
                    "name": contact["name"],
                    "restorable": True,
                }],
                summary=f"Delete contact: {contact['name']}",
            )
        db.delete_contact(contact_id)
        return {"ok": True, "deleted_contact_id": contact_id, "name": contact["name"], "restorable": True}

    if name == "delete_competition":
        competition_id = tool_input["competition_id"]
        competitions = [c for c in db.list_competitions() if c["id"] == competition_id]
        if not competitions:
            return {"error": f"no competition with id {competition_id}"}
        competition = competitions[0]
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_competition",
                [{
                    "action": "delete_competition",
                    "competition_id": competition_id,
                    "title": competition["title"],
                    "restorable": True,
                }],
                summary=f"Delete competition: {competition['title']}",
            )
        db.delete_competition(competition_id)
        return {
            "ok": True,
            "deleted_competition_id": competition_id,
            "title": competition["title"],
            "restorable": True,
        }

    if name == "scan_competitions":
        try:
            results = orchestrator.run("competition_scout", project_description=tool_input["project_description"])
        except Exception as exc:
            return {"error": str(exc)}
        for r in results:
            db.insert_competition(r.get("title", ""), r.get("description", ""), r.get("type", ""), r.get("url", ""))
        return {"ok": True, "results": results}

    if name == "search_repository":
        try:
            k = tool_input.get("k", 8)
            results = repository.rag_search(tool_input.get("query", ""), k=k)
            return {"ok": True, "results": results}
        except Exception as exc:
            return {"error": str(exc)}

    if name == "list_repository_files":
        try:
            return _list_repository_files(tool_input)
        except Exception as exc:
            return {"error": str(exc)}

    if name == "read_repository_file":
        try:
            return _read_repository_file(tool_input)
        except Exception as exc:
            return {"error": str(exc)}

    if name == "classify_into_lists":
        try:
            return _classify_into_lists(tool_input)
        except Exception as exc:
            return {"error": str(exc)}

    if name == "summarize_repository":
        try:
            summary = repository.rebuild_summary(force=True)
            return {"ok": True, **summary}
        except Exception as exc:
            return {"error": str(exc)}

    if name == "delete_repository_file":
        file_id = tool_input.get("file_id")
        try:
            file_id = int(file_id)
        except (TypeError, ValueError):
            return {"error": "file_id must be an integer"}
        row = db.get_repo_file(file_id)
        if not row:
            return {"error": f"no repository file with id {file_id}"}
        filename = row.get("filename") or row.get("name") or ""
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_repository_file",
                [{
                    "action": "delete_repository_file",
                    "file_id": file_id,
                    "filename": filename,
                    "permanent": True,
                }],
                summary=f"Permanently delete repository file: {filename}",
            )
        if not repository.delete_file(file_id):
            return {"error": f"could not delete repository file {file_id}"}
        return {
            "ok": True,
            "deleted_file_id": file_id,
            "filename": filename,
            "permanent": True,
            "summary": f"Permanently deleted repository file: {filename}",
        }

    if name == "get_overdue_tasks":
        today = _today()
        overdue = [t for t in _open_tasks() if t.get("due_date") and t["due_date"] < today]
        return {"ok": True, "tasks": [_compact_task(t) for t in overdue[:30]]}

    if name == "get_todays_plan":
        today = _today()
        day = db.get_day(today)
        events = db.list_calendar_events(start=today, end=today)
        due_today = [_compact_task(t) for t in _open_tasks() if t.get("due_date") == today]
        return {"ok": True, "date": today, "day": day, "events": events, "tasks_due_today": due_today}

    if name == "list_projects":
        projects = db.list_projects()
        status = tool_input.get("status")
        if status:
            projects = [p for p in projects if p.get("status") == status]
        return {
            "ok": True,
            "projects": [
                {
                    "id": p["id"], "name": p["name"], "kind": p.get("kind"),
                    "status": p.get("status"), "progress": p.get("progress", 0),
                }
                for p in projects[:30]
            ],
        }

    if name == "get_recent_ideas":
        try:
            limit = int(tool_input.get("limit", 10))
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 20))
        ideas = db.list_ideas()[:limit]
        return {
            "ok": True,
            "ideas": [
                {
                    "id": i["id"], "title": i["title"],
                    "body": _truncate_text(i.get("body") or "", 200),
                    "created_at": i.get("created_at"),
                }
                for i in ideas
            ],
        }

    if name == "add_note":
        list_type = tool_input.get("list_type", "")
        if list_type not in NOTE_LIST_TYPES:
            return {"error": f"list_type must be one of: {', '.join(NOTE_LIST_TYPES)}"}
        note_id = db.insert_note(
            list_type, tool_input["title"], tool_input.get("body", ""), source="ai",
        )
        try:
            rules.emit("note.created", {"id": note_id, "list_type": list_type,
                                        "title": tool_input["title"], "body": tool_input.get("body", "")})
        except Exception as _re:
            print(f"[rules] note.created (agent) error: {_re}")
        return {"ok": True, "note": db.get_note(note_id)}

    if name == "add_project_note":
        project_id = tool_input["project_id"]
        if not db.get_project(project_id):
            return {"error": f"no project with id {project_id}"}
        note_id = db.insert_project_note(
            project_id, tool_input.get("category", "general"), tool_input.get("body", ""),
        )
        return {"ok": True, "note_id": note_id, "project_id": project_id}

    if name == "create_situation":
        if not _is_confirmed(tool_input):
            plan = _plan_situation(tool_input)
            if plan.get("error"):
                return plan
            if not plan.get("proposed_actions"):
                out = {"ok": False, "errors": plan.get("errors", [])}
                if plan.get("errors"):
                    out["error"] = "could not build a plan — fix errors and try again"
                return out
            return _confirmation_pending(
                "create_situation",
                plan["proposed_actions"],
                summary=plan.get("summary") or tool_input.get("summary"),
            )
        try:
            result = _create_situation(_strip_confirmed(tool_input))
            if result.get("ok") and not result.get("summary"):
                summary = (tool_input.get("summary") or "").strip()
                if summary:
                    result["summary"] = summary
            return result
        except Exception as exc:
            return {"error": str(exc)}

    if name == "get_state":
        open_tasks = db.list_tasks(status="todo") + db.list_tasks(status="partial")
        contacts = db.list_contacts()
        customers = db.list_customers()
        ideas = db.list_ideas()
        projects = db.list_projects()
        goals = db.list_goals()
        events = db.list_calendar_events()
        return {
            "counts": {
                "open_tasks": len(open_tasks),
                "contacts": len(contacts),
                "customers": len(customers),
                "ideas": len(ideas),
                "projects": len(projects),
                "goals": len(goals),
                "calendar_events": len(events),
            },
            "open_tasks": [_compact_task(t) for t in open_tasks[:40]],
            "contacts": [{"id": c["id"], "name": c.get("name")} for c in contacts[:40]],
            "customers": [{"id": c["id"], "name": c.get("name")} for c in customers[:20]],
            "ideas": [{"id": i["id"], "title": i.get("title")} for i in ideas[:20]],
            "projects": [{"id": p["id"], "name": p.get("name"), "status": p.get("status")} for p in projects[:20]],
            "goals": [{"id": g["id"], "title": g.get("title")} for g in goals[:20]],
            "calendar": [
                {"id": e["id"], "title": e.get("title"), "date": e.get("date"), "start_time": e.get("start_time")}
                for e in events[:30]
            ],
        }

    if name == "read_napkin":
        return _read_napkin_bundle(tool_input)

    if name == "read_project_file":
        return _read_named_project_file(tool_input.get("path"), tool_input)

    if name == "propose_file_edit":
        ok, target = backup.is_path_inside_project(_project_rel_path(tool_input["path"]))
        if not ok:
            return {"error": "path is outside the project directory -- refusing to stage this"}
        old_string = tool_input.get("old_string", "")
        if old_string and target.is_file():
            existing = target.read_text(encoding="utf-8", errors="ignore")
            count = existing.count(old_string)
            if count == 0:
                return {"error": "old_string not found in the file -- re-read it with read_project_file, it may have changed"}
            if count > 1:
                return {"error": f"old_string appears {count} times -- make it longer/more specific so it's unique"}
        payload = {
            "path": _project_rel_path(tool_input["path"]), "old_string": old_string,
            "new_string": tool_input["new_string"], "reason": tool_input["reason"],
        }
        action_id = db.insert_pending_action(
            "file_edit", json.dumps(payload), risk_summary=_review_change("file_edit", payload)
        )
        return {"ok": True, "staged": True, "action_id": action_id,
                "note": "Staged for the user's approval -- NOT applied yet. Tell the user what you proposed."}

    if name == "propose_command":
        payload = {"command": tool_input["command"], "reason": tool_input["reason"]}
        action_id = db.insert_pending_action(
            "command", json.dumps(payload), risk_summary=_review_change("command", payload)
        )
        return {"ok": True, "staged": True, "action_id": action_id,
                "note": "Staged for the user's approval -- NOT run yet. Tell the user what you proposed."}

    if name == "apply_style_paint":
        effect = (tool_input.get("effect") or "").strip()
        target = (tool_input.get("target") or "document").strip()
        enabled = tool_input.get("enabled", True)
        valid_effects = {"aurora", "ember", "solstice", "midnight", "soft-glow", "dim", "frost"}
        valid_targets = {"document", "hud", "nav", "main", "launcher"}
        if effect not in valid_effects:
            return {"error": f"unknown effect '{effect}'"}
        if target not in valid_targets:
            return {"error": f"unknown target '{target}'"}
        settings = db.get_settings()
        try:
            cfg = json.loads(settings.get("style_paint_config") or "{}")
            if not isinstance(cfg, dict) or "layers" not in cfg:
                cfg = {"version": 1, "layers": []}
        except Exception:
            cfg = {"version": 1, "layers": []}
        layers = cfg.get("layers") or []
        existing = next((l for l in layers if l.get("effect") == effect and l.get("target") == target), None)
        if existing:
            existing["enabled"] = bool(enabled)
        else:
            import uuid as _uuid
            layers.append({"id": _uuid.uuid4().hex[:8], "effect": effect, "target": target, "enabled": bool(enabled)})
        cfg["layers"] = layers
        db.save_settings({"style_paint_config": json.dumps(cfg)})
        return {"ok": True, "style_paint_config": cfg, "note": f"{'Applied' if enabled else 'Removed'} {effect} on {target}. Client will apply on next page load or after stylePaintBoot()."}

    if name == "set_hidden_apps":
        hide = [str(a) for a in (tool_input.get("hide") or []) if str(a) != "system"]
        show = [str(a) for a in (tool_input.get("show") or [])]
        settings = db.get_settings()
        try:
            ha = json.loads(settings.get("hidden_apps") or "{}")
            if not isinstance(ha, dict):
                ha = {"version": 1, "ids": []}
        except Exception:
            ha = {"version": 1, "ids": []}
        ids = list(ha.get("ids") or [])
        for app_id in show:
            if app_id in ids:
                ids.remove(app_id)
        for app_id in hide:
            if app_id not in ids:
                ids.append(app_id)
        ha["ids"] = ids
        db.save_settings({"hidden_apps": json.dumps(ha)})
        return {"ok": True, "hidden_apps": ha, "note": f"Hidden: {ids}. Client will apply after stylePaintBoot()."}

    if name == "list_automation_rules":
        return {"ok": True, "rules": db.list_automation_rules()}

    if name == "create_automation_rule":
        rule_name = (tool_input.get("name") or "").strip()
        if not rule_name:
            return {"error": "name is required"}
        trigger_type = (tool_input.get("trigger_type") or "").strip()
        if trigger_type not in rules.TRIGGER_TYPES:
            return {"error": f"trigger_type must be one of: {', '.join(sorted(rules.TRIGGER_TYPES))}"}
        actions = tool_input.get("actions") or []
        if not isinstance(actions, list):
            return {"error": "actions must be a list"}
        for act in actions:
            atype = (act.get("type") or "")
            if atype not in rules.SAFE_ACTIONS:
                return {"error": f"action type {atype!r} is not in SAFE_ACTIONS — refusing to create rule"}
        condition = tool_input.get("condition") or {}
        ai_mode = tool_input.get("ai_mode", "none")
        enabled = bool(tool_input.get("enabled", True))
        rule_id = db.insert_automation_rule(
            rule_name, trigger_type, condition, actions, ai_mode=ai_mode, enabled=enabled,
        )
        return {"ok": True, "rule": db.get_automation_rule(rule_id)}

    if name == "set_automation_rule_enabled":
        rule_id = tool_input.get("rule_id")
        rule = db.get_automation_rule(rule_id)
        if not rule:
            return {"error": f"no automation rule with id {rule_id}"}
        db.set_automation_rule_enabled(rule_id, bool(tool_input.get("enabled", True)))
        return {"ok": True, "rule": db.get_automation_rule(rule_id)}

    if name == "delete_automation_rule":
        rule_id = tool_input.get("rule_id")
        rule = db.get_automation_rule(rule_id)
        if not rule:
            return {"error": f"no automation rule with id {rule_id}"}
        if not _is_confirmed(tool_input):
            return _confirmation_pending(
                "delete_automation_rule",
                [{"action": "delete_automation_rule", "rule_id": rule_id, "name": rule["name"]}],
                summary=f"Delete automation rule: {rule['name']}",
            )
        db.delete_automation_rule(rule_id)
        return {"ok": True, "deleted_rule_id": rule_id, "name": rule["name"]}

    if name == "test_automation_rule":
        rule_id = tool_input.get("rule_id")
        rule = db.get_automation_rule(rule_id)
        if not rule:
            return {"error": f"no automation rule with id {rule_id}"}
        payload = tool_input.get("payload") or {}
        dry_run = bool(tool_input.get("dry_run", False))
        try:
            condition = json.loads(rule.get("condition_json") or "{}")
        except Exception:
            condition = {}
        matched = rules.match_condition(payload, condition)
        if dry_run or not matched:
            return {"ok": True, "matched": matched, "dry_run": True}
        try:
            summaries = rules.emit(rule["trigger_type"], payload)
            relevant = [s for s in summaries if s.get("rule_id") == rule_id]
        except Exception as exc:
            return {"error": str(exc)}
        return {"ok": True, "matched": matched, "dry_run": False, "result": relevant}

    if name == "local_rag_ask":
        import local_rag
        question = (tool_input.get("question") or "").strip()
        if not question:
            return {"error": "question is required"}
        k = min(int(tool_input.get("k") or 4), 10)
        try:
            return local_rag.ask(question, k=k)
        except RuntimeError as exc:
            return {"error": str(exc)}
        except Exception as exc:
            return {"error": f"local_rag_ask failed: {exc}"}

    if name == "local_rag_search":
        import local_rag
        query = (tool_input.get("query") or "").strip()
        if not query:
            return {"error": "query is required"}
        k = min(int(tool_input.get("k") or 5), 20)
        results = local_rag.search(query, k=k)
        return {"ok": True, "results": results, "count": len(results)}

    if name == "rebuild_local_rag_index":
        import local_rag
        try:
            stats = local_rag.rebuild_index()
            return {"ok": True, **stats}
        except Exception as exc:
            return {"error": f"rebuild failed: {exc}"}

    if name == "web_search":
        if not _web_search_keys_present():
            return {
                "ok": False,
                "disabled": True,
                "error": "web_search is disabled — no Brave/Tavily/SerpAPI key is configured.",
            }
        import web_search
        return web_search.search(tool_input.get("query") or "")

    if name == "propose_bug":
        try:
            bug_id = db.insert_agent_bug(tool_input.get("title"), tool_input.get("details") or "")
        except ValueError as exc:
            return {"error": str(exc)}
        return {"ok": True, "bug_id": bug_id, "status": "pending"}

    if name == "preview_schedule_import":
        if _is_confirmed(tool_input):
            applied = _import_course_classes(
                tool_input.get("classes") or [],
                end_date=tool_input.get("end_date"),
            )
            if not applied.get("created") and tool_input.get("text"):
                import napkin_complete
                applied = _import_course_classes(
                    napkin_complete.parse_course_schedule(
                        tool_input.get("text") or "", end_date=tool_input.get("end_date"),
                    ),
                    end_date=tool_input.get("end_date"),
                )
            return applied
        return _preview_schedule_payload(tool_input)

    if name == "preview_bulk_import":
        import napkin_complete
        kind = (tool_input.get("kind") or "task").strip().lower()
        if kind == "schedule":
            if _is_confirmed(tool_input):
                return _apply_preview_bulk(tool_input)
            return _preview_schedule_payload(tool_input)
        if _is_confirmed(tool_input):
            return _apply_preview_bulk(tool_input)
        text = tool_input.get("text") or ""
        items = tool_input.get("items") or napkin_complete.parse_bulk_lines(
            text, kind="event" if kind == "event" else "task",
        )
        if kind == "event":
            existing = {
                ((e.get("title") or "").strip().lower(), e.get("date"), _normalize_clock(e.get("start_time")))
                for e in db.list_calendar_events()
            }
            for item in items:
                key = (
                    (item.get("title") or "").strip().lower(),
                    item.get("date"),
                    _normalize_clock(item.get("start_time")),
                )
                item["duplicate"] = key in existing
                item["start_time"] = _normalize_clock(item.get("start_time"))
                item["end_time"] = _normalize_clock(item.get("end_time"))
        else:
            existing = {(t.get("title") or "").strip().lower() for t in db.list_tasks()}
            for item in items:
                item["duplicate"] = (item.get("title") or "").strip().lower() in existing
        proposed = _preview_table_actions(kind, items)
        pending = _confirmation_pending(
            "preview_bulk_import",
            proposed,
            summary=f"Add {len(items)} {kind}{'s' if len(items) != 1 else ''} from pasted list",
        )
        pending.update({
            "ok": True,
            "kind": kind,
            "items": items,
            "count": len(items),
            "duplicates": sum(1 for i in items if i.get("duplicate")),
            "preview": True,
            "warning": "Preview only — nothing was added. Confirm the table to apply unique rows.",
        })
        return pending

    if name == "import_course_schedule":
        if not _is_confirmed(tool_input):
            return _preview_schedule_payload(tool_input)
        import napkin_complete
        classes = tool_input.get("classes") or napkin_complete.parse_course_schedule(
            tool_input.get("text") or "", end_date=tool_input.get("end_date"),
        )
        return _import_course_classes(classes, end_date=tool_input.get("end_date"))

    return {"error": f"unknown tool: {name}"}


def _review_change(action_type, payload):
    """Second, independent AI pass that flags risk on a staged self-coding action before the
    human ever sees the approve/reject buttons -- not a gate, human approval stays the only
    thing that blocks anything from running. Degrades to no risk_summary on any failure
    (API error, timeout, kill switch on) rather than blocking the staging itself.
    """
    try:
        return json.dumps(orchestrator.run("review_proposed_change", action_type=action_type, payload=payload))
    except Exception as exc:
        print(f"[agent] review_proposed_change failed: {exc}")
        return None


WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search", "allowed_callers": ["direct"]}

HOW_TO_WORK = """How to work
- YOU HAVE LIVE WRITE ACCESS to this planner's database through your tools (add_contact, add_task,
  update_*, create_situation, etc.). You are NOT a read-only chat bot. Claiming you "can't write",
  "don't have access", "need the user to paste into Waypoint", or "can't create contacts from here"
  is FALSE — never say that. Call the tool instead.
- Tools run ONLY via the API tool_use channel. Never invent names like contacts.add / tasks.add or
  write markdown "tool calls" — those do nothing. Exact contact tools: list_contacts, add_contact,
  update_contact, delete_contact. If unsure of a name, call list_contacts / list_tasks / get_state
  first, then the matching add_* / update_* tool.
- Only say "Done" / "saved" / "added" AFTER a tool result with ok:true (or a successful create payload).
  Quote titles and counts from the tool result fields (`count`, `created`, `skipped`, `task.title`). Never
  treat a row `id` as a count. If a tool returns needs_confirmation, say what you planned and ask them
  to Confirm — do not pretend it already ran. Ordinary add/update calls apply immediately; Confirm is
  only for deletes, create_situation, and repeated-title/time warnings.
- Turn concrete imperatives into concrete tool calls in the same turn. If the user supplied the
  required fields, do not stop at advice, a checklist, or "you can add it" — call the matching tool.
  If a tool result presents a warning (including a repeated task or event), surface it and wait for Confirm.
- For a list of tasks, call batch_add_tasks once (up to 80). Do not add them one-by-one and do not invent
  due dates — omit due_date unless the user named a date.
- Never invent a clock time. If the user did not name a start/end, leave times empty or ask — do not
  pick 9am because it looks tidy. Untimed events are allowed; recurring series and class slots must
  refuse rather than default to 09:00.
- When the user says "work", call read_napkin (or read ISSUES.md / NAPKIN.md / plan/ISSUES.md)
  and implement those items. Do not edit NAPKIN.md to crumple notes; say what is done and let the
  user crumple them. Paths inside the planner project are NAPKIN.md and ISSUES.md; a leading
  plan/ prefix is the same file.
- If the user says something wasn't saved, or asks to recreate/retry, immediately call the write tools
  again (or confirm create_situation with confirmed:true). Do not apologize about lacking access.
- Search the live web with web_search for current docs, APIs, or facts. Do not invent versions
  or URLs. If web_search is missing from this turn's tool list, it is disabled — say so.
  For the user's own notes/ideas/vault, prefer local_rag_search / local_rag_ask / read_napkin.
- READ before you ACT: use targeted getters (get_overdue_tasks, get_todays_plan, list_tasks, list_projects,
  get_recent_ideas, search_repository, list_repository_files, read_repository_file) before creating or
  changing data. Prefer these over get_state.
- When the user names something without an id, look it up first (list_tasks with search, list_projects, etc.).
- Batch related reads in one turn when possible; then apply edits in the same or next turn.
- When a user describes a real-world situation spanning contact + project + task + calendar, prefer
  create_situation: first call without confirmed to return proposed_actions (plan only), summarize for
  the user, then call again with confirmed:true after they approve.
- For destructive actions (delete_task, delete_idea, delete_note, delete_project, delete_event,
  delete_calendar_event, delete_contact, delete_competition, delete_repository_file): first call without confirmed returns
  proposed_actions — nothing is deleted until confirmed:true after explicit user approval. Name the exact
  item in your reply so they can verify.
- complete_calendar_event / delete_calendar_event / update_calendar_event cover calendar CRUD in every
  way (time, date, title, url, status, kind). Never invent a clock time; persist a named time exactly.
- You always use the expert/strong tool brain on normal and strong routes (auto-apply ordinary writes).
- If a tool fails or the user says the task is too hard, the harness runs retry_harder / escalate_model
  once on a stronger available backend (OpenAI if Anthropic is dead). Do not require Anthropic.
- If a turn is predicted to cost about $0.10 or more, the UI asks the user to confirm before sending.
- spawn_agent starts a parallel background job; list_running_agents / stop_agent cover both orchestrator and spawned jobs.
- add_to_cart / list_cart stage purchases for the user to validate — never claim you bought anything.
- use_integration pings a saved SDK/token (Cursor, Claude, ChatGPT, Codex, VS Code, Hugging Face, n8n, Obsidian).
- Classes go on the calendar with kind=class so they stay off the event calendar.
- Answer from uploaded files: list_repository_files → read_repository_file for a specific document; use
  search_repository for topical search across many files. Quote real content — don't invent it.
- When the user message contains --- BEGIN FILE CONTENT --- blocks or other attached file content, you CAN
  see that text — NEVER say you can't see file contents or ask the user to paste it again.
- To file content into Capture lists: call classify_into_lists with the file text (or file_id), then for each
  approved proposal use add_note (skill/problem/thinking/funny/essay) or add_idea for idea — or present
  proposals and ask which to keep when ambiguous. Prefer classify_into_lists over guessing list_type without
  reading. List types: skill, problem, thinking, funny, essay (+ idea via add_idea).
- Never invent tasks, events, or file contents. If a required field is missing, ask one short question.
  If they already asked you to add/schedule/grade something and gave enough, call the matching tool NOW —
  do not wait for a second "yes" or describe the plan instead of tool_use.
- Keep replies SHORT — one or two sentences on what you did, no preamble or filler. When the user must
  choose between concrete next actions, put those exact options in the [followups: ...] trailer so the
  UI can render them as choice cards. Every choice must be an actionable imperative that maps to one or
  more exact tools available to you and that you can perform on the next turn; never offer unsupported
  navigation, vague exploration, or a choice that would only produce more explanation. Treat a user's
  selected follow-up as an execution request: call its tool in that turn (or return its write confirmation),
  rather than merely describing the plan. Never invent choices unsupported by their request or live data."""

TOOL_GUIDE = """Tools (use when…)
- list_repository_files — browse uploaded Capture → Repository files (id, summary preview)
- read_repository_file — read one uploaded file (by file_id or filename); if truncated is true, IMMEDIATELY call again with next_offset until the whole document is read — never answer from only the beginning
- search_repository — topical TF-IDF search across uploaded files (snippets, not full files)
- summarize_repository — user wants an updated repo overview (costs AI if stale)
- delete_repository_file — permanently remove one uploaded file (plan first via proposed_actions, then confirmed:true)
- get_overdue_tasks — overdue to-dos
- get_todays_plan — today's schedule, day metrics, tasks due today
- list_projects — project list with progress; filter by status if needed
- get_recent_ideas — recent idea-map entries
- list_tasks — find/filter tasks by name or status before editing
- get_state — broad snapshot (counts + short lists). Prefer targeted getters when you can.
- read_napkin — open napkin notes, ISSUES.md / plan/ISSUES.md work queue, WORK.md, NAPKIN_COMPILED.md.
  Call this when the user says work. Pass query to search instead of dumping the whole list.
- read_project_file — planner source (paths like app.py or NAPKIN.md; a plan/ prefix is stripped)
- add_task / update_task / complete_task / delete_task — task CRUD
- list_contacts / update_contact — find and edit contacts (rich fields)
- list_customers / update_customer — find and edit customers
- update_project / update_idea / update_note / update_calendar_event — edit existing records by id
  (calendar: time/date/title/url/status/kind; persist named times exactly, never invent 9am)
- complete_calendar_event / delete_calendar_event / complete_event / update_event / add_recurring_event
  — finish or delete a calendar event, edit interest events, or materialize weekly series
- add_task_bet / set_task_prerequisite / add_alarm — stake coins on a due date, block a task, or set a minigame alarm
- Never invent a clock time. If the user did not name a start/end, leave times empty or ask — do not pick 9am because it looks tidy.
- list_running_agents / stop_agent / spawn_agent — see, cancel, or start parallel agent jobs (spawned jobs use cancel_event threads)
- add_to_cart / list_cart — queue a purchase for the user to validate; never buy it yourself
- use_integration — ping a saved SDK/token from Settings; list an Obsidian vault; never run a shell
- add_calendar_event — schedule something (same title+date+time already on the calendar waits for Confirm; overlaps warn)
- batch_add_tasks — several tasks in one call (max 80); skipped duplicates come back in `skipped`/`count`
- preview_bulk_import — one preview table for a pasted task/event list; confirm to apply unique rows
- preview_schedule_import — dedicated preview for pasted course timetables (weekday + two clock times). Never freeform-bulk classes.
- import_course_schedule — apply a confirmed schedule preview; pass end_date so they stop at term end
- add_recurring_class — weekly class on the calendar (title, days, start/end times, optional end_date)
- list_classes / grade_class_item — class list and homework auto-grade
- add_goal — deadline goal (auto-chunked)
- add_idea — save to idea map
- add_project — register a project
- classify_into_lists — propose Capture list entries from document text or a repository file (does not insert)
- add_note — skills/problems/thinking/funny/essay lists
- add_project_note — devlog entry on a project
- create_situation — one call for linked contact note, project note, task, calendar event, and/or capture note (proposed_actions first, then confirmed:true)
- add_contact / add_customer — people tracking. For add_contact: always extract every detail
  the user gave (role/what they do, where/when met, email, phone, LinkedIn, closeness, current
  focus, description, notes). Never create a bare name-only contact when more context was provided.
  For updates, prefer update_contact / update_* tools instead of recreating.
- scan_competitions — hackathons/competitors (confirm search plan with user first)
- web_search — live web research
- propose_bug — file a product bug in the Agent tab inbox for the user to accept onto Napkin
- read_project_file — read planner project source (always available)
- propose_file_edit / propose_command — stage edits or commands (only when Developer mode + Claude routing enabled)
- local_rag_ask — ask a focused question answered ONLY from the user's local notes/ideas/Obsidian/memories via Ollama (grounded, free, private); requires Ollama running
- local_rag_search — TF-IDF search across local knowledge index for relevant passages
- rebuild_local_rag_index — rebuild the local RAG index from all corpus sources"""

SYSTEM_PROMPT_BASE = f"""You are the in-app assistant for a personal life-planner. The user talks to you
instead of filling out forms — when they ask you to add or track something, call the matching tool
right away rather than only describing what you'd do.

The conversation continues across turns. Track who said what when speaker names appear in message
content (e.g. "Alex said: …"). This is a multi-turn conversation — use prior context to answer.

You can paint visual styles onto specific regions of the UI using apply_style_paint (effect +
target). You can also hide or show launcher app icons using set_hidden_apps. Mention these
capabilities when the user asks about customising appearance or launcher layout. The System app
(id "system") cannot be hidden.

{HOW_TO_WORK}

{TOOL_GUIDE}

Tasks: when the user names a task without an id, call list_tasks with search first, then
update/complete/delete using the matching task_id.

Contacts: when the user asks to add someone and gives context, fill as many add_contact fields
as possible from that context (what_they_do, met_where, met_when, email, phone, linkedin_url,
closeness, current_focus, description, notes). Summarize remaining details into description/notes
rather than dropping them. After writes, briefly confirm what was saved. When the user asks to
change an existing person/project/idea/note/event/customer, use the matching update_* tool
(list_* first if you only have a name).

For scan_competitions: never call on the first ask — tell the user what you'll search for and wait
for confirmation, then call once they agree.

Automations (when → then): you can create, list, enable/disable, and delete automation rules via
list_automation_rules, create_automation_rule, set_automation_rule_enabled, delete_automation_rule,
and test_automation_rule. Rules are algorithmic; use the ai_step action only when AI judgment is
needed. Default ai_step backend is cloud — use local only if the user explicitly requests it (local
models are weak and often unreliable for judgment tasks). Never run Blueprint Python graphs from
rules. Example: when task.completed where urgency=critical → notify_discord.

Local RAG (personal knowledge base): for questions about the user's notes, ideas, Obsidian vault,
or uploaded documents, prefer local_rag_ask when Ollama is available — it is grounded, free, and
private. Local models are weak: keep questions focused and specific. If the index is missing, call
rebuild_local_rag_index first. Use local_rag_search for retrieval without generation."""

MATH_NOTATION_GUIDE = """Math notation: users may write LaTeX (\\frac{a}{b}, \\sqrt{x}, x^2), unicode
(× ÷ √ ² ½), inline $...$ or \\( ... \\), or plain fractions like 3/4. Interpret math naturally and
you may use LaTeX or unicode in replies when helpful."""

FRENCH_UI_REPLY_NOTE = """UI language is French — reply in French unless the user writes in another
language."""


def _ui_language():
    """Browser UI language synced to settings as waypoint_lang."""
    raw = (db.get_settings().get("waypoint_lang") or "en").strip().lower()
    return "fr" if raw.startswith("fr") else "en"


def _prompt_locale_notes():
    notes = [MATH_NOTATION_GUIDE]
    if _ui_language() == "fr":
        notes.append(FRENCH_UI_REPLY_NOTE)
    return "\n\n".join(notes)


SYSTEM_PROMPT_DATA_ONLY = f"""{SYSTEM_PROMPT_BASE}

You CAN and DO write planner data (contacts, tasks, notes, events, projects, etc.) via tools right now.
You CAN read project source files with read_project_file (paths inside the planner project only).
The only thing you cannot do without Developer / self-coding mode is stage app code edits or shell
commands (propose_file_edit / propose_command). Do not confuse that code-edit limit with data writes —
data writes always work. If they ask for code changes, read relevant files when helpful, describe a
plan only (no staged edits), and mention that Developer mode is required to apply code changes."""

SYSTEM_PROMPT_WEAK_BACKEND = f"""{SYSTEM_PROMPT_BASE}

Self-coding is enabled in Settings but Agent chat is routed to a non-Claude backend. You CAN read
project files with read_project_file, but propose_file_edit and propose_command are unavailable.
If they ask for code changes, read what you need, describe a plan only, and tell them to set
route_chat to Claude in Settings to stage edits."""

SYSTEM_PROMPT_SELF_CODING = f"""{SYSTEM_PROMPT_BASE}

Self-coding tools (read_project_file, propose_file_edit, propose_command):
- Only paths inside the planner project directory; staged for user approval — never applied immediately
- Full backup before approved edits; commands run in project dir after approval
- Paths are relative to the planner project (app.py, NAPKIN.md). A leading plan/ prefix is the same file.
- Read the file first. Prefer a small unique old_string. Never dump a whole file unless creating it.
- For large files, read_project_file returns a chunk — loop with offset/next_offset until truncated is false
- After staging, summarize the diff in one sentence and say it is waiting for approval — not "done"
- For product bugs, read_napkin / ISSUES.md first, then propose_file_edit"""


_active_chat_backend = None


def _one_chat_call(backend, messages, force_any_tool):
    """One assistant turn against exactly one backend, in Anthropic response shape."""
    global _active_chat_backend
    _active_chat_backend = backend
    tools = _chat_tools()
    if backend != "claude":
        # chat_backends normalizes OpenAI/Grok into the same block shape, so the tool loop
        # below does not need to know which backend answered.
        return chat_backends.complete(
            backend, messages, system=_system_prompt(), tools=tools,
            max_tokens=4000, force_any_tool=force_any_tool,
        )

    # Claude keeps its native server-side web_search; drop the function tool so names don't collide.
    tools = [t for t in tools if t.get("name") != "web_search"]
    create_kwargs = dict(
        model=model_roles.anthropic_model("chat"),
        max_tokens=4000,
        system=_system_prompt(),
        messages=messages,
        tools=tools + [WEB_SEARCH_TOOL],
        thinking={"type": "enabled", "budget_tokens": THINKING_BUDGET_TOKENS},
    )
    if force_any_tool:
        create_kwargs["tool_choice"] = {"type": "any"}
        # tool_choice=any is incompatible with extended thinking on some API versions
        create_kwargs.pop("thinking", None)
    try:
        return client().messages.create(**create_kwargs)
    except Exception as api_exc:
        # A rejected key must reach the re-router untouched; only the tool_choice
        # incompatibility is worth retrying here.
        if not force_any_tool or ai._is_auth_error(api_exc):
            raise
        print(f"[agent] tool_choice=any retry failed ({api_exc}); falling back to auto tools")
        create_kwargs.pop("tool_choice", None)
        create_kwargs["thinking"] = {
            "type": "enabled", "budget_tokens": THINKING_BUDGET_TOKENS,
        }
        return client().messages.create(**create_kwargs)


def _chat_model_call(messages, force_any_tool):
    """One assistant turn from whichever backend can serve `chat` right now.

    Same policy as ai.route_text: a backend that rejects its key is demoted and the turn is
    retried elsewhere, so a revoked Anthropic key downgrades the Agent tab to OpenAI/Grok
    instead of failing the whole conversation. Transient 5xx/429 errors also walk the chain
    and the HUD records who actually answered.
    """
    backend = model_roles.configured_backend("chat")
    preferred = backend
    last_error = None
    tried = []
    while True:
        try:
            response = _one_chat_call(backend, messages, force_any_tool)
            ai.mark_live_source(
                "chat",
                backend,
                rerouted_from=preferred if backend != preferred and last_error is not None else None,
                reason=(str(last_error)[:180] if last_error is not None and backend != preferred else None),
            )
            return response
        except Exception as exc:
            last_error = exc
            tried.append(backend)
            if ai._is_auth_error(exc):
                ai._mark_backend_unauthorized(backend)
                alternatives = ai._fallback_backends("chat", exclude=tried)
                if not alternatives:
                    raise
                print(f"[agent] chat: {backend} key rejected, retrying on {alternatives[0]}")
                backend = alternatives[0]
                continue
            if ai._is_transient_error(exc) or ai._is_connectivity_error(exc):
                alternatives = ai._fallback_backends("chat", exclude=tried)
                if not alternatives:
                    raise
                print(f"[agent] chat: {backend} failed ({exc}); retrying on {alternatives[0]}")
                backend = alternatives[0]
                continue
            raise


def escalate_model(current_backend=None):
    """Pick a stronger/novel live backend. OpenAI if Anthropic is dead; never require Anthropic."""
    current = (current_backend or _active_chat_backend or model_roles.configured_backend("chat") or "").strip()
    try:
        allowed = model_roles.SAFE_BACKENDS.get("chat", {"openai", "claude", "grok"})
    except Exception:
        allowed = {"openai", "claude", "grok"}
    order = ("claude", "openai", "grok")
    for candidate in order:
        if candidate == current or candidate not in allowed:
            continue
        try:
            if ai.backend_key_rejected(candidate) or not ai._backend_has_credentials(candidate):
                continue
        except Exception:
            continue
        return candidate
    try:
        alternatives = ai._fallback_backends("chat", exclude=[current] if current else [])
    except Exception:
        alternatives = []
    if alternatives:
        return alternatives[0]
    return current or "openai"


def retry_harder(messages, force_any_tool=False, current_backend=None):
    """One extra round on the stronger available backend (OpenAI if Anthropic is dead)."""
    backend = escalate_model(current_backend)
    print(f"[agent] retry_harder / escalate_model -> {backend}")
    return _one_chat_call(backend, messages, force_any_tool)


def _chat_tools():
    tools = [t for t in TOOLS if t["name"] not in SELF_CODING_TOOL_NAMES]
    tools.extend(t for t in TOOLS if t["name"] in CODE_READ_TOOLS)
    if self_coding_permitted():
        tools.extend(t for t in TOOLS if t["name"] in SELF_CODING_WRITE_TOOLS)
    backend = _active_chat_backend or model_roles.configured_backend("chat")
    if backend != "claude" and not _web_search_keys_present():
        tools = [t for t in tools if t.get("name") != "web_search"]
    return tools


def steer(message):
    """Queue a steering note for the in-flight chat turn, if any."""
    text = (message or "").strip()
    if not text:
        return {"queued": False, "note": "message is required"}
    try:
        with _steer_lock:
            if not _chat_in_flight:
                return {"queued": False, "note": "no active turn — send it as a normal message"}
            _steer_queue.append(text)
        return {"queued": True}
    except Exception as exc:
        print(f"[agent] steer failed: {exc}")
        return {"queued": False, "note": "steering unavailable"}


def begin_chat_turn():
    """Mark one UI chat turn active and clear cancellation from the prior turn."""
    global _chat_in_flight, _chat_cancel_requested
    with _steer_lock:
        _chat_in_flight = True
        _chat_cancel_requested = False
        _steer_queue.clear()


def finish_chat_turn():
    """Clear shared chat state after a UI chat turn."""
    global _chat_in_flight, _chat_cancel_requested
    with _steer_lock:
        _chat_in_flight = False
        _chat_cancel_requested = False
        _steer_queue.clear()


def request_chat_cancel():
    """Cooperatively stop the active chat before it executes more tools or persists a reply."""
    global _chat_cancel_requested
    with _steer_lock:
        if not _chat_in_flight:
            return {"ok": False, "error": "no active chat turn"}
        _chat_cancel_requested = True
        _steer_queue.clear()
    return {"ok": True, "cancelled": "chat"}


def chat_cancel_requested():
    with _steer_lock:
        return bool(_chat_cancel_requested)


def get_running_state():
    """Whether a chat turn is in flight plus orchestrator and spawned cancel_event jobs."""
    try:
        running_agents = list(orchestrator.list_running() or [])
    except Exception as exc:
        print(f"[agent] list_running failed: {exc}")
        running_agents = []
    try:
        import napkin_remaining
        spawned = napkin_remaining.list_spawned_agents() or []
    except Exception:
        spawned = []
    now = time.time()
    for job in spawned:
        created = job.get("created_at") or ""
        age = 0
        try:
            if created:
                from datetime import datetime, timezone
                stamp = created.replace("Z", "+00:00")
                age = max(0, now - datetime.fromisoformat(stamp).timestamp())
        except Exception:
            age = 0
        running_agents.append({
            "id": job.get("id"),
            "name": job.get("title") or job.get("id") or "spawned",
            "age_seconds": round(age, 1),
            "kind": "spawned",
            "status": job.get("status") or "running",
            "cancel_event": True,
        })
    try:
        with _steer_lock:
            in_flight = _chat_in_flight
    except Exception:
        in_flight = False
    return {
        "in_flight": in_flight,
        "cancel_requested": chat_cancel_requested() if in_flight else False,
        "running_agents": running_agents,
        "web_search_enabled": True if model_roles.configured_backend("chat") == "claude" else _web_search_keys_present(),
    }


def _drain_steering(messages):
    """Inject queued steering notes as extra user turns. Returns whether any were consumed."""
    try:
        with _steer_lock:
            if not _steer_queue:
                return False
            pending = list(_steer_queue)
            _steer_queue.clear()
    except Exception as exc:
        print(f"[agent] steering drain failed: {exc}")
        return False
    for note in pending:
        messages.append({"role": "user", "content": f"[user adds while you work]: {note}"})
    return True


def _sticky_tool_catalog():
    """Exact tool names available this turn — placed last in the system prompt so they stick."""
    try:
        names = [t["name"] for t in _chat_tools() if isinstance(t, dict) and t.get("name")]
    except Exception:
        names = []
    if not names:
        names = sorted(WRITE_TOOLS | {"list_contacts", "list_tasks", "list_projects", "get_state"})
    # Keep high-signal groups first for scanning, then full alphabetized dump.
    priority = [
        "add_contact", "update_contact", "list_contacts", "delete_contact",
        "add_customer", "update_customer", "list_customers",
        "add_task", "update_task", "list_tasks", "complete_task", "delete_task",
        "add_calendar_event", "add_recurring_class", "add_recurring_event", "update_calendar_event",
        "complete_calendar_event", "delete_calendar_event",
        "complete_event", "update_event", "delete_event", "add_task_bet", "set_task_prerequisite", "add_alarm",
        "batch_add_tasks", "preview_bulk_import", "preview_schedule_import", "import_course_schedule",
        "grade_class_item", "list_classes",
        "add_idea", "update_idea", "add_note", "update_note",
        "add_project", "update_project", "list_projects", "create_situation",
        "get_state", "get_todays_plan", "get_overdue_tasks",
    ]
    ordered = [n for n in priority if n in names]
    ordered.extend(sorted(n for n in names if n not in ordered))
    listing = ", ".join(ordered)
    return f"""TOOL CARD (re-read every turn — these are the ONLY valid tool names):
Call tools via API tool_use with these exact snake_case names. Narrating contacts.add / tasks.add
in markdown does nothing. Prefer list_* then add_* / update_*. A concrete user request with enough
fields should end in real tool_use now, not a suggested manual action.
Available now: {listing}
High-use writes: add_contact, update_contact, add_task, batch_add_tasks, update_task,
add_calendar_event, update_calendar_event, complete_calendar_event, delete_calendar_event,
add_recurring_class, add_idea, add_note, add_project, create_situation,
add_customer, grade_class_item."""


def _waypoint_capabilities_refresh():
    """Compact per-turn identity + options card so the model remembers Waypoint."""
    try:
        routing = model_roles.routing_snapshot()
        backends = sorted({(routing.get(r) or {}).get("backend") for r in routing} - {None})
    except Exception:
        backends = []
    try:
        ollama_ok = ai.local_model_available()
        ollama_model = ai._live_local_model_name() if ollama_ok else "offline"
    except Exception:
        ollama_ok, ollama_model = False, "unknown"
    try:
        developer = "on" if self_coding_permitted() else ("enabled (Claude required)" if self_coding_enabled() else "off")
    except Exception:
        developer = "unknown"
    backend_line = ", ".join(backends) if backends else "claude"
    return f"""WAYPOINT REFRESH (re-read every turn — you are Waypoint):
You are Waypoint's in-app assistant for this life-OS: Plan, Capture, Studio/Blueprint, Arcade, Parallel, People, System, Agent, Companion.
CRITICAL: Your tools write to the live Waypoint database. Never claim you lack write access or ask the
user to paste/create records manually instead of calling add_* / update_* / create_situation.
Exact contact tools: list_contacts, add_contact, update_contact — never invent contacts.add.
A full TOOL CARD with every exact tool name is at the end of this system prompt — re-read it before acting.
Options you can use when relevant:
- Data tools (LIVE read+write): tasks, goals, calendar, ideas, notes, projects, contacts/customers, repository
- Automations: create/list/enable when→then rules (algorithmic; optional ai_step)
- Local RAG: local_rag_ask / search / rebuild (Ollama-only, private knowledge)
- Style paint + hide apps: apply_style_paint, set_hidden_apps
- Code: read_project_file always; propose edits/commands only if Developer mode allows (code-only limit)
- This Agent turn HAS live write tools. Do not skip tool_use because Companion has a "fast" no-tool route.
  Ordinary add/schedule/grade requests should tool_use immediately; they auto-apply. Confirm is only
  for deletes, create_situation, and repeated title/time warnings.
- Work queue: NAPKIN.md, ISSUES.md, WORK.md. Call read_napkin when the user says work.
- Companion memories: auto-recalled into context when relevant to the message or upcoming write — apply them before acting; never wait for the user to ask "do you remember"
Backends in play: {backend_line}. Ollama: {"ready (" + ollama_model + ")" if ollama_ok else "not reachable"}. Developer/self-coding: {developer}.
End most helpful replies with optional follow-ups: [followups: short next ask | another | third] (max 3)."""


def _system_prompt():
    if self_coding_permitted():
        base = SYSTEM_PROMPT_SELF_CODING
    elif self_coding_enabled():
        base = SYSTEM_PROMPT_WEAK_BACKEND
    else:
        base = SYSTEM_PROMPT_DATA_ONLY
    context = _build_context_block()
    locale = _prompt_locale_notes()
    refresh = _waypoint_capabilities_refresh()
    tools = _sticky_tool_catalog()
    # TOOL CARD last: models overweight the end of the system prompt across long chats.
    return f"{base}\n\n{locale}\n\nWhat I know right now:\n{context}\n\n{refresh}\n\n{tools}"


def _finalize_chat_reply(reply, thinking=""):
    """Strip follow-ups trailer; keep Claude thinking; parse local think tags if present."""
    import reply_parse
    # Claude thinking already separate; still strip any accidental tags from reply text.
    parsed_think, body = reply_parse.parse_local_thinking(reply or "")
    body, followups = reply_parse.parse_followups(body)
    merged_thinking = "\n\n".join(p for p in (thinking, parsed_think) if p).strip()
    return body, merged_thinking, followups


def _message_needs_write_tools(text: str) -> bool:
    """True when the user is asking for a DB write / retry / 'use the tool'."""
    t = text or ""
    if _FORCE_TOOL_RE.search(t):
        return True
    if _WRITE_FAIL_RE.search(t):
        return True
    if _WRITE_INTENT_RE.search(t) and _WRITE_ENTITY_RE.search(t):
        return True
    # "schedule Tuesday 9am" / "add a class" still need tools even without "calendar"/"task".
    if _WRITE_COMMAND_RE.search(t):
        return True
    return False


def _reply_fakes_tool_use(reply: str) -> bool:
    """True when the model narrated a tool call in prose instead of tool_use."""
    return bool(_FAKE_TOOL_PROSE_RE.search(reply or ""))


def _fake_tool_retry_nudge() -> str:
    return (
        "[SYSTEM] Nothing was saved — you only wrote tool names in chat text. "
        "Call the real tools via tool_use now. Contact create tool name is exactly "
        "`add_contact` (not contacts.add). Call add_contact once per person with full "
        "fields from the conversation. Do not say Done until tool results return ok:true."
    )


def _compact_actions_for_fact_check(actions, limit=8):
    compact = []
    for action in (actions or [])[:limit]:
        result = action.get("result")
        if isinstance(result, dict):
            slim = {
                k: result.get(k)
                for k in (
                    "ok", "error", "needs_confirmation", "contact_id", "customer", "task",
                    "idea_id", "note", "event", "project", "fields_set", "created", "summary",
                    "contact", "title", "name", "filename", "count", "ids", "skipped", "preview",
                    "classes", "items", "bug_id", "disabled",
                )
                if k in result
            }
            # Read tools answer with a COLLECTION ("contacts", "tasks", ...), and none of
            # those plural keys are in the whitelist above -- only singular "contact". So a
            # correct "you have 8 contacts" arrived at the fact-checker as evidence reading
            # {"ok": true}, and got rewritten into a false "I could not confirm that".
            # Keep a bounded, counted view of any collection the tool returned.
            for key, value in result.items():
                if isinstance(value, list) and key not in slim:
                    slim[f"{key}_count"] = len(value)
                    slim[key] = value[:5]
            if not slim:
                slim = {k: result[k] for k in list(result)[:8]}
        else:
            slim = result
        compact.append({
            "tool": action.get("tool"),
            "input": action.get("input"),
            "result": slim,
        })
    return compact


def _should_fact_check_reply(reply, actions, wants_write: bool) -> bool:
    if actions:
        return True
    if wants_write:
        return True
    if _reply_fakes_tool_use(reply):
        return True
    text = reply or ""
    if _CLAIM_WRITE_SUCCESS_RE.search(text) and _WRITE_ENTITY_RE.search(text):
        return True
    return False


def _entity_kind_from_word(word: str) -> str:
    w = (word or "").lower()
    if w.startswith("class"):
        return "class"
    for kind in ("contact", "customer", "task", "event", "idea", "project", "note", "goal"):
        if w.startswith(kind):
            return kind
    return w.rstrip("s")


def _created_ids_and_counts(actions):
    """Row ids, created counts, and listed totals from successful tool results."""
    ids = []
    counts = {}
    listed = {}

    def _add_id(value):
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            pass

    def _bump(kind, n=1, store=None):
        if not kind:
            return
        target = store if store is not None else counts
        try:
            n = int(n)
        except (TypeError, ValueError):
            n = 0
        target[kind] = target.get(kind, 0) + n

    kind_for_tool = {
        "add_task": "task",
        "batch_add_tasks": "task",
        "preview_bulk_import": "task",
        "add_contact": "contact",
        "add_customer": "customer",
        "add_calendar_event": "event",
        "add_recurring_event": "event",
        "add_idea": "idea",
        "add_project": "project",
        "add_note": "note",
        "add_goal": "goal",
        "add_recurring_class": "class",
        "import_course_schedule": "class",
        "preview_schedule_import": "class",
        "list_contacts": "contact",
        "list_tasks": "task",
        "list_projects": "project",
        "list_classes": "class",
        "list_customers": "customer",
    }
    for action in actions or []:
        result = action.get("result") if isinstance(action.get("result"), dict) else {}
        tool = action.get("tool") or ""
        if result.get("error") or result.get("needs_confirmation") or result.get("preview") or result.get("ok") is False:
            if tool.startswith("list_") and result.get("ok") is not False:
                kind = kind_for_tool.get(tool)
                n = result.get("count")
                if n is None:
                    for key in ("contacts", "tasks", "projects", "classes", "customers", "events"):
                        if isinstance(result.get(key), list):
                            n = len(result.get(key))
                            kind = kind or _entity_kind_from_word(key)
                            break
                if kind is not None and n is not None:
                    listed[kind] = int(n)
            continue
        if tool.startswith("list_"):
            kind = kind_for_tool.get(tool)
            n = result.get("count")
            if n is None:
                for key in ("contacts", "tasks", "projects", "classes", "customers", "events"):
                    if isinstance(result.get(key), list):
                        n = len(result.get(key))
                        kind = kind or _entity_kind_from_word(key)
                        break
            if kind is not None and n is not None:
                listed[kind] = int(n)
            continue
        if tool in ("batch_add_tasks", "preview_bulk_import", "import_course_schedule",
                    "preview_schedule_import", "add_recurring_event"):
            created = result.get("created") or []
            n = result.get("count")
            try:
                n = int(n)
            except (TypeError, ValueError):
                n = len(created) if isinstance(created, list) else 0
            kind = kind_for_tool.get(tool, "task")
            if tool == "preview_bulk_import":
                kind = _entity_kind_from_word(result.get("kind") or "task")
            _bump(kind, n)
            for row in created if isinstance(created, list) else []:
                if isinstance(row, dict):
                    _add_id(row.get("id") or (row.get("class") or {}).get("id"))
            for value in result.get("ids") or []:
                _add_id(value)
            continue
        kind = kind_for_tool.get(tool)
        if kind:
            _bump(kind, 1)
        for key in ("task", "contact", "event", "idea", "project", "customer", "goal", "note", "class"):
            row = result.get(key)
            if isinstance(row, dict):
                _add_id(row.get("id"))
        for key in ("contact_id", "task_id", "event_id", "idea_id", "project_id", "bug_id"):
            if result.get(key) is not None:
                _add_id(result.get(key))
        created_map = result.get("created")
        if isinstance(created_map, dict):
            for kind_name, row in created_map.items():
                if isinstance(row, dict):
                    _add_id(row.get("id"))
                mapped = {
                    "calendar_event": "event",
                    "project_note": "note",
                }.get(kind_name, _entity_kind_from_word(kind_name))
                _bump(mapped, 1)
    return ids, counts, listed


def _deterministic_fact_issues(reply, actions) -> list:
    """Cheap non-AI checks for the most common hallucinations."""
    issues = []
    text = reply or ""
    if _reply_fakes_tool_use(text):
        issues.append("Reply narrates fake tool calls (e.g. contacts.add) instead of real tool_use")
    successful_writes = []
    for action in actions or []:
        result = action.get("result") if isinstance(action.get("result"), dict) else {}
        tool = action.get("tool") or ""
        if tool not in WRITE_TOOLS and tool not in CONFIRMATION_TOOLS:
            continue
        if result.get("error") or result.get("needs_confirmation"):
            continue
        if result.get("ok") is False:
            continue
        successful_writes.append(tool)
    claims_success = bool(
        _CLAIM_WRITE_SUCCESS_RE.search(text) and (_WRITE_ENTITY_RE.search(text) or _reply_fakes_tool_use(text))
    )
    if claims_success and not successful_writes:
        issues.append("Reply claims data was saved/added but no successful write tool ran")
    ids, counts, listed = _created_ids_and_counts(actions)
    id_set = set(ids)
    for match in _COUNT_CLAIM_RE.finditer(text):
        try:
            claimed = int(match.group(1))
        except (TypeError, ValueError):
            continue
        kind = _entity_kind_from_word(match.group(2))
        actual = listed.get(kind)
        if actual is None:
            actual = counts.get(kind)
        if actual is None:
            if claimed in id_set:
                issues.append(
                    f"Reply claims {claimed} {match.group(2)} but that number is a created row id; "
                    "counts must come from a tool result"
                )
            continue
        if claimed != actual:
            if claimed in id_set:
                issues.append(
                    f"Reply claims {claimed} {match.group(2)} but that number is a created row id; "
                    f"actual {kind} count is {actual}"
                )
            else:
                issues.append(
                    f"Reply claims {claimed} {match.group(2)} but the actual {kind} count is {actual}"
                )
    return issues


def _fact_check_and_correct(reply, actions, user_message):
    """Run judgment fact-checker; rewrite reply when ungrounded. Fail-open."""
    report = {
        "ok": True,
        "issues": [],
        "corrected_reply": "",
        "corrected": False,
        "skipped": False,
    }
    deterministic = _deterministic_fact_issues(reply, actions)
    if deterministic:
        report["issues"].extend(deterministic)
        report["ok"] = False
    has_count_claim = bool(_COUNT_CLAIM_RE.search(reply or ""))
    claims_write = bool(_CLAIM_WRITE_SUCCESS_RE.search(reply or ""))
    skip_ai = not deterministic and not has_count_claim and not claims_write
    if skip_ai:
        return reply, report
    if deterministic and not (actions or []):
        report["corrected_reply"] = (
            "I haven't saved that yet — no write tool ran. "
            "I'll use add_contact / the matching add_* tool next."
        )
        report["corrected"] = True
        # Still run the AI checker when the reply claimed a save so tests and
        # the model can supply a clearer correction; skip only if there is
        # nothing left to interpret.
        if not claims_write and not has_count_claim:
            return report["corrected_reply"], report
    try:
        ai_report = orchestrator.run(
            "fact_check_agent_reply",
            reply=reply,
            actions=_compact_actions_for_fact_check(actions),
            user_message=user_message or "",
        )
    except Exception as exc:
        print(f"[agent] fact_check_agent_reply failed: {exc}")
        report["error"] = str(exc)
        if not report["ok"] and not (actions or []):
            # Deterministic failure with no tools: honest fallback without AI.
            report["corrected_reply"] = (
                "I haven't saved that yet — no write tool ran. "
                "I'll use add_contact / the matching add_* tool next."
            )
            report["corrected"] = True
            return report["corrected_reply"], report
        return reply, report

    if isinstance(ai_report, dict):
        for issue in ai_report.get("issues") or []:
            bit = str(issue).strip()
            if bit and bit not in report["issues"]:
                report["issues"].append(bit)
        corrected = str(ai_report.get("corrected_reply") or "").strip()
        if ai_report.get("ok") is False:
            report["ok"] = False
        if report["issues"]:
            report["ok"] = False
        if corrected and not report["ok"]:
            report["corrected_reply"] = corrected
            report["corrected"] = True
            return corrected, report

    if not report["ok"] and not report.get("corrected_reply") and not (actions or []):
        report["corrected_reply"] = (
            "I haven't saved that yet — no write tool ran. "
            "Tell me to add them again and I'll call add_contact for each person."
        )
        report["corrected"] = True
        return report["corrected_reply"], report
    return reply, report


def _with_routing(payload, backend=None):
    source = backend or ai.LAST_SOURCE or model_roles.configured_backend("chat")
    reroute = getattr(ai, "LAST_REROUTE", None) or {}
    if backend and not (reroute.get("to") == backend and reroute.get("from")):
        ai.mark_live_source("chat", backend)
        reroute = getattr(ai, "LAST_REROUTE", None) or {}
    payload["source"] = source
    payload["model"] = model_roles.model_for("chat", source)
    payload["rerouted_from"] = reroute.get("from") if reroute.get("to") == source else None
    payload["reroute_reason"] = reroute.get("reason") if payload["rerouted_from"] else None
    payload["web_search_enabled"] = True if source == "claude" else _web_search_keys_present()
    return payload


def chat(user_message, tool_policy="auto", conversation_id=None, cancel_event=None, background=False):
    conversation_id = db.ensure_agent_conversation(conversation_id)
    LARGE_INPUT = 8000
    if (
        user_message
        and len(user_message) > LARGE_INPUT
        and not str(user_message).startswith(CONFIRM_TOOL_PREFIX)
    ):
        rest = user_message[LARGE_INPUT:]
        user_message = (
            user_message[:LARGE_INPUT]
            + f"\n\n[Pass 1 of a long input — {len(rest)} characters remain. "
            "Do not invent the rest; wait for the next pass.]"
        )
        try:
            db.save_settings({f"input_overflow_{conversation_id}": rest[:200000]})
        except Exception as exc:
            print(f"[agent] overflow store failed: {exc}")

    confirm = _parse_confirm_tool_message(user_message)
    if confirm:
        tool_name, tool_input = confirm
        db.insert_agent_message("user", "Confirmed.", conversation_id=conversation_id)
        result = _with_recalled_memories(
            tool_name, tool_input, _execute_tool(tool_name, tool_input, tool_policy="auto"),
        )
        reply = _confirm_tool_reply(tool_name, result)
        db.insert_agent_message("assistant", reply, conversation_id=conversation_id)
        step = _describe_tool_step(tool_name, tool_input, result)
        action = {"tool": tool_name, "input": tool_input, "result": result}
        confirmations = []
        if isinstance(result, dict) and result.get("needs_confirmation"):
            confirmations.append(_confirmation_from_result(tool_name, tool_input, result))
        return _with_routing({
            "reply": reply,
            "actions": [action],
            "steps": [{"tool": tool_name, "description": step}],
            "was_steered": False,
            "confirmations": confirmations,
            "confirmed": True,
            "conversation_id": conversation_id,
        })

    db.insert_agent_message("user", user_message, conversation_id=conversation_id)
    try:
        db.maybe_autotitle_agent_conversation(conversation_id, user_message)
    except Exception as exc:
        print(f"[agent] autotitle failed: {exc}")
    try:
        import companion_memory as _companion_memory
        history_limit = _companion_memory.CONTEXT_WINDOW_MESSAGES
        # Skip re-inject if an upstream caller already attached a memory block.
        if "[Companion memories" in (user_message or ""):
            memory_prefix = ""
        else:
            # Memories persist across chats; message history does not (fresh context window).
            memory_prefix = _companion_memory.build_memory_context_prefix(query=user_message)
    except Exception:
        history_limit = 32
        memory_prefix = ""
    try:
        if re.search(r"(^\s*work\b|\bwork on (the )?(napkin|issues|queue)\b|\bread the napkin\b)",
                     user_message or "", re.I):
            bundle = _read_napkin_bundle({"which": "all", "max_chars": 10000})
            work_text = (bundle.get("text") or "").strip()
            if work_text:
                memory_prefix = (
                    (memory_prefix or "")
                    + "\n[Work queue — implement these items. Do not crumple NAPKIN.md.]\n"
                    + work_text
                    + "\n"
                )
    except Exception as exc:
        print(f"[agent] work queue inject failed: {exc}")
    history = db.list_agent_messages(limit=history_limit, conversation_id=conversation_id)
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    # Inject relevance-ranked memories into the live prompt (not re-stored) before tools run.
    if memory_prefix:
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get("role") != "user":
                continue
            content = messages[i].get("content") or ""
            if "[Companion memories" in content:
                break
            messages[i] = {
                **messages[i],
                "content": (
                    memory_prefix
                    + "\n[Use recalled memories above before acting when relevant — "
                    "do not wait for the user to ask.]\n"
                    + content
                ),
            }
            break

    actions = []
    steps = []
    confirmations = []
    thinking_parts = []
    was_steered = False
    fake_tool_retries = 0
    wants_write = _message_needs_write_tools(user_message)
    user_wants_harder = bool(_HARD_TASK_RE.search(user_message or ""))
    escalated_once = False
    escalate_next = user_wants_harder
    try:
        if not background:
            begin_chat_turn()
    except Exception as exc:
        print(f"[agent] chat in-flight flag failed: {exc}")

    def this_cancelled():
        if cancel_event is not None and getattr(cancel_event, "is_set", lambda: False)():
            return True
        if background:
            return False
        return chat_cancel_requested()

    def cancelled_result():
        reply = "Stopped by you."
        db.insert_agent_message("assistant", reply, conversation_id=conversation_id)
        return _with_routing({
            "reply": reply,
            "actions": actions,
            "steps": steps,
            "was_steered": was_steered,
            "confirmations": confirmations,
            "thinking": "\n\n".join(thinking_parts) if thinking_parts else "",
            "followups": [],
            "cancelled": True,
            "conversation_id": conversation_id,
        })

    try:
        for _ in range(MAX_TOOL_ROUNDS):
            if this_cancelled():
                return cancelled_result()
            try:
                if _drain_steering(messages):
                    was_steered = True
            except Exception as exc:
                print(f"[agent] steering at loop top failed: {exc}")

            # Round 1 keeps extended thinking. Force tools only after a missed/fake-tool retry.
            # Expert brain is the strong default; escalate_model / retry_harder is one extra round.
            force_any_tool = bool(fake_tool_retries and wants_write and not actions)
            if escalate_next and not escalated_once:
                escalated_once = True
                escalate_next = False
                try:
                    response = retry_harder(messages, force_any_tool)
                except Exception as exc:
                    print(f"[agent] retry_harder failed ({exc}); using default expert brain")
                    response = _chat_model_call(messages, force_any_tool)
            else:
                response = _chat_model_call(messages, force_any_tool)
            if this_cancelled():
                return cancelled_result()
            try:
                db.log_api_usage(getattr(response, "model", None) or MODEL,
                                 response.usage.input_tokens, response.usage.output_tokens)
            except Exception as exc:
                print(f"[agent] usage logging failed: {exc}")

            thinking_text = "".join(
                getattr(b, "thinking", "") or ""
                for b in response.content
                if getattr(b, "type", None) == "thinking"
            ).strip()
            if thinking_text:
                thinking_parts.append(thinking_text)

            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue

            if response.stop_reason != "tool_use":
                # A steer arriving during the blocking model call should shape a clean follow-up
                # response, not be acknowledged and then silently dropped.
                if _drain_steering(messages):
                    was_steered = True
                    messages.append({"role": "assistant", "content": response.content})
                    continue
                raw_reply = "".join(b.text for b in response.content if b.type == "text").strip()
                faked = _reply_fakes_tool_use(raw_reply)
                should_retry = (
                    not actions
                    and fake_tool_retries < MAX_FAKE_TOOL_RETRIES
                    and (wants_write or faked)
                )
                if should_retry:
                    fake_tool_retries += 1
                    wants_write = True
                    messages.append({"role": "assistant", "content": response.content})
                    messages.append({"role": "user", "content": _fake_tool_retry_nudge()})
                    continue
                thinking = "\n\n".join(thinking_parts) if thinking_parts else ""
                reply, thinking, followups = _finalize_chat_reply(raw_reply, thinking)
                fact_check = {"ok": True, "issues": [], "skipped": True}
                if _should_fact_check_reply(reply, actions, wants_write):
                    reply, fact_check = _fact_check_and_correct(reply, actions, user_message)
                    if not fact_check.get("ok"):
                        try:
                            import napkin_complete
                            napkin_complete.log_ai_failure(
                                "fact_check", "; ".join(fact_check.get("issues") or []),
                                {"corrected": fact_check.get("corrected")},
                            )
                        except Exception:
                            pass
                db.insert_agent_message("assistant", reply, conversation_id=conversation_id)
                return _with_routing({
                    "reply": reply, "actions": actions, "steps": steps,
                    "was_steered": was_steered, "confirmations": confirmations,
                    "thinking": thinking,
                    "followups": followups,
                    "fact_check": fact_check,
                    "conversation_id": conversation_id,
                }, ai.LAST_SOURCE or model_roles.configured_backend('chat'))

            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            tool_failed_this_round = False
            for block in response.content:
                if block.type == "tool_use":
                    if this_cancelled():
                        return cancelled_result()
                    # Pre-action recall: related memories travel with the tool result / confirmation.
                    result = _with_recalled_memories(
                        block.name,
                        block.input,
                        _execute_tool(block.name, block.input, tool_policy=tool_policy),
                    )
                    if isinstance(result, dict) and result.get("error"):
                        tool_failed_this_round = True
                        try:
                            import napkin_complete
                            napkin_complete.log_ai_failure(
                                "tool", result.get("error"), {"tool": block.name},
                            )
                        except Exception:
                            pass
                    actions.append({"tool": block.name, "input": block.input, "result": result})
                    steps.append({
                        "tool": block.name,
                        "description": _describe_tool_step(block.name, block.input, result),
                    })
                    if isinstance(result, dict) and result.get("needs_confirmation"):
                        confirmations.append(_confirmation_from_result(block.name, block.input, result))
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(_compact_tool_result(block.name, result), default=str),
                    })
            messages.append({"role": "user", "content": tool_results})
            if tool_failed_this_round and not escalated_once:
                escalate_next = True
                messages.append({
                    "role": "user",
                    "content": (
                        "[retry_harder] A tool failed. Continue on a stronger backend "
                        "(escalate_model). Do not invent clock times; persist named times exactly."
                    ),
                })

        reply = "Hit the tool-call limit for this turn -- let me know if you want me to keep going."
        db.insert_agent_message("assistant", reply, conversation_id=conversation_id)
        return _with_routing({
            "reply": reply, "actions": actions, "steps": steps,
            "was_steered": was_steered, "confirmations": confirmations,
            "thinking": "\n\n".join(thinking_parts) if thinking_parts else "",
            "followups": [],
            "conversation_id": conversation_id,
        }, ai.LAST_SOURCE or model_roles.configured_backend('chat'))
    finally:
        try:
            if not background:
                finish_chat_turn()
        except Exception as exc:
            print(f"[agent] chat cleanup failed: {exc}")
