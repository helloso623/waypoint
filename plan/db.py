import json
import os
import re
import sqlite3
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

_PROJECT_DIR = Path(__file__).parent
_env_db = os.environ.get("PLANNER_DB_PATH")
_data_dir = os.environ.get("WAYPOINT_DATA_DIR")
if _env_db:
    _candidate = Path(_env_db)
    DB_PATH = _candidate if _candidate.is_absolute() else _PROJECT_DIR / _candidate
elif _data_dir:
    # Fixed external folder shared by every copy of this app, regardless of which branch/zip it
    # came from -- so a fresh download never needs planner.db/.env manually copied in again.
    # PLANNER_DB_PATH (above) still wins if both are set. See info/CANONICAL_COPY.md.
    DB_PATH = Path(_data_dir) / "planner.db"
else:
    DB_PATH = _PROJECT_DIR / "planner.db"


_tls = threading.local()


class _ConnProxy:
    """Thread-local SQLite connection. close() is a no-op so callers keep their finally blocks."""

    def __init__(self, conn):
        object.__setattr__(self, "_conn", conn)

    def close(self):
        return None

    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_conn():
    path = str(DB_PATH)
    cached = getattr(_tls, "conn", None)
    cached_path = getattr(_tls, "path", None)
    if cached is not None and cached_path == path:
        try:
            cached.execute("SELECT 1")
            return _ConnProxy(cached)
        except sqlite3.Error:
            try:
                cached.close()
            except sqlite3.Error:
                pass
            cached = None
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA synchronous = NORMAL")
    _tls.conn = conn
    _tls.path = path
    return _ConnProxy(conn)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def init_db():
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS days (
            date TEXT PRIMARY KEY,
            happiness INTEGER,
            volatility INTEGER,
            motivation INTEGER,
            focus INTEGER,
            work_time REAL,
            effective_work_time REAL,
            sports REAL,
            eating INTEGER,
            notes TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS hours (
            date TEXT NOT NULL,
            hour INTEGER NOT NULL,
            category TEXT,
            note TEXT,
            PRIMARY KEY (date, hour)
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            deadline TEXT,
            notes TEXT,
            progress_pct INTEGER,
            status TEXT DEFAULT 'active',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS goal_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            due_date TEXT,
            done INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS goal_coach_quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            success_criteria TEXT,
            difficulty TEXT,
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            warmth INTEGER DEFAULT 50,
            last_contact TEXT,
            notes TEXT,
            current_focus TEXT,
            description TEXT,
            met_where TEXT,
            met_when TEXT,
            what_they_do TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            notes TEXT,
            status TEXT DEFAULT 'todo',
            progress_done REAL,
            progress_total REAL,
            progress_unit TEXT,
            urgency TEXT DEFAULT 'medium',
            importance INTEGER,
            contact_id INTEGER REFERENCES contacts(id),
            project_id INTEGER REFERENCES projects(id),
            deadline_dismissed INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            date TEXT,
            start_time TEXT,
            end_time TEXT,
            all_day INTEGER DEFAULT 1,
            source TEXT,
            status TEXT DEFAULT 'suggested',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            key TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            color TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT,
            x REAL DEFAULT 0,
            y REAL DEFAULT 0,
            z REAL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            kind TEXT DEFAULT 'software',
            status TEXT DEFAULT 'active',
            progress INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            category TEXT DEFAULT 'general',
            body TEXT,
            pinned INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_team_members (
            project_id INTEGER NOT NULL REFERENCES projects(id),
            team_member_id INTEGER NOT NULL REFERENCES team_members(id),
            PRIMARY KEY (project_id, team_member_id)
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            company TEXT,
            status TEXT DEFAULT 'contacted',
            last_update TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            travel_minutes INTEGER DEFAULT 0,
            location TEXT,
            notes TEXT,
            source TEXT NOT NULL DEFAULT 'manual',
            start_date TEXT,
            end_date TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            category TEXT,
            notes TEXT,
            class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS class_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'homework',
            due_date TEXT,
            notes TEXT,
            url TEXT,
            task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS competitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            type TEXT,
            url TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS idea_similarity_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idea_id INTEGER NOT NULL REFERENCES ideas(id),
            title TEXT,
            description TEXT,
            url TEXT,
            similarity_note TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subagent TEXT,
            summary TEXT,
            created_at TEXT NOT NULL
        );

        -- Textual trail of how the app is actually used: tab moves, actions, and short text
        -- context. Deliberately narrow columns and a repeat counter instead of one row per
        -- event -- flipping between two tabs ten times is one row with repeats=10, not ten
        -- rows, which is what keeps this from becoming the largest table in the database.
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            tab TEXT,
            label TEXT,
            detail TEXT,
            repeats INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

        CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            entity_id TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS agent_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'New chat',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            conversation_id INTEGER REFERENCES agent_conversations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pending_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            output TEXT,
            risk_summary TEXT,
            created_at TEXT NOT NULL,
            resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            role TEXT,
            permission TEXT DEFAULT 'viewer',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS team_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_member_id INTEGER NOT NULL REFERENCES team_members(id),
            sender TEXT DEFAULT 'you',
            body TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS team_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS team_channel_members (
            channel_id INTEGER NOT NULL REFERENCES team_channels(id),
            team_member_id INTEGER NOT NULL REFERENCES team_members(id),
            PRIMARY KEY (channel_id, team_member_id)
        );

        CREATE TABLE IF NOT EXISTS team_channel_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL REFERENCES team_channels(id),
            sender TEXT DEFAULT 'you',
            body TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            content_type TEXT,
            uploaded_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS field_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            content TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deleted_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            original_id INTEGER NOT NULL,
            label TEXT,
            data_json TEXT NOT NULL,
            deleted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS practice_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_key TEXT NOT NULL,
            score REAL NOT NULL,
            max_score REAL NOT NULL,
            difficulty INTEGER NOT NULL,
            details_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS practice_difficulty (
            game_key TEXT PRIMARY KEY,
            level INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS practice_longterm (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fact TEXT NOT NULL,
            created_at TEXT NOT NULL,
            due_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            graph_json TEXT NOT NULL,
            generated_code TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS custom_apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            emoji TEXT,
            workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            row_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            list_type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS skill_proficiency_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_id INTEGER NOT NULL REFERENCES notes_lists(id) ON DELETE CASCADE,
            proficiency INTEGER NOT NULL,
            recorded_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT,
            title TEXT,
            note TEXT,
            kind TEXT NOT NULL DEFAULT 'later',
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mood_pulses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            happiness INTEGER NOT NULL,
            note TEXT,
            energy INTEGER
        );

        CREATE TABLE IF NOT EXISTS rp_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            world_date TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rp_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rp_journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            world_date TEXT NOT NULL,
            entry TEXT NOT NULL,
            kind TEXT DEFAULT 'event',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS repo_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            mime TEXT,
            size INTEGER NOT NULL DEFAULT 0,
            category TEXT NOT NULL DEFAULT 'Other',
            summary TEXT,
            extracted_text TEXT NOT NULL DEFAULT '',
            word_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS automation_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            trigger_type TEXT NOT NULL,
            condition_json TEXT NOT NULL DEFAULT '{}',
            actions_json TEXT NOT NULL,
            ai_mode TEXT NOT NULL DEFAULT 'none',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            last_run_at TEXT,
            last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS task_schedule (
            date TEXT NOT NULL,
            hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            PRIMARY KEY (date, hour, task_id)
        );
        """
    )
    conn.commit()

    if not conn.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
        from categories import CATEGORIES as DEFAULT_CATEGORIES
        for i, c in enumerate(DEFAULT_CATEGORIES):
            conn.execute(
                "INSERT INTO categories (key, label, color, sort_order) VALUES (?, ?, ?, ?)",
                (c["key"], c["label"], c["color"], i),
            )
        conn.commit()

    existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(contacts)").fetchall()}
    for col in ("description", "met_where", "met_when", "what_they_do", "email", "phone", "linkedin_url"):
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE contacts ADD COLUMN {col} TEXT")
    if "closeness" not in existing_cols:
        conn.execute("ALTER TABLE contacts ADD COLUMN closeness TEXT DEFAULT 'contact'")

    task_cols = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "due_date" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT")
    if "category" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN category TEXT")
    if "importance" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN importance INTEGER")
    if "description" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN description TEXT")
    if "deadline_dismissed" not in task_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN deadline_dismissed INTEGER DEFAULT 0")

    goal_cols = {row["name"] for row in conn.execute("PRAGMA table_info(goals)").fetchall()}
    if "notes" not in goal_cols:
        conn.execute("ALTER TABLE goals ADD COLUMN notes TEXT")
    if "progress_pct" not in goal_cols:
        conn.execute("ALTER TABLE goals ADD COLUMN progress_pct INTEGER")

    notes_cols = {row["name"] for row in conn.execute("PRAGMA table_info(notes_lists)").fetchall()}
    if "source" not in notes_cols:
        conn.execute("ALTER TABLE notes_lists ADD COLUMN source TEXT DEFAULT 'human'")
    if "status" not in notes_cols:
        conn.execute("ALTER TABLE notes_lists ADD COLUMN status TEXT DEFAULT 'open'")
    if "sort_order" not in notes_cols:
        conn.execute("ALTER TABLE notes_lists ADD COLUMN sort_order INTEGER DEFAULT 0")
    if "proficiency" not in notes_cols:
        conn.execute("ALTER TABLE notes_lists ADD COLUMN proficiency INTEGER DEFAULT 5")
    conn.execute(
        """
        INSERT INTO skill_proficiency_history (skill_id, proficiency, recorded_at)
        SELECT n.id, COALESCE(n.proficiency, 5), COALESCE(n.created_at, ?)
        FROM notes_lists n
        WHERE n.list_type = 'skill'
          AND NOT EXISTS (
              SELECT 1 FROM skill_proficiency_history h WHERE h.skill_id = n.id
          )
        """,
        (now_iso(),),
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_skill_proficiency_history_skill "
        "ON skill_proficiency_history(skill_id, id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_goal_coach_quests_goal "
        "ON goal_coach_quests(goal_id, done, id)"
    )

    project_cols = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
    if "sort_order" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT 0")
    if "source_idea_id" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN source_idea_id INTEGER REFERENCES ideas(id)")
    if "grade" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN grade TEXT")
    if "completed_at" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN completed_at TEXT")
    if "archive_notes" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN archive_notes TEXT")

    idea_cols = {row["name"] for row in conn.execute("PRAGMA table_info(ideas)").fetchall()}
    if "source" not in idea_cols:
        conn.execute("ALTER TABLE ideas ADD COLUMN source TEXT DEFAULT 'human'")
    if "sort_order" not in idea_cols:
        conn.execute("ALTER TABLE ideas ADD COLUMN sort_order INTEGER DEFAULT 0")

    project_cols = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
    if "path" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN path TEXT")
    if "run_command" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN run_command TEXT")
    if "code_summary" not in project_cols:
        conn.execute("ALTER TABLE projects ADD COLUMN code_summary TEXT")

    task_cols2 = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "assignee_id" not in task_cols2:
        conn.execute("ALTER TABLE tasks ADD COLUMN assignee_id INTEGER REFERENCES team_members(id)")

    competition_cols_pre = {row["name"] for row in conn.execute("PRAGMA table_info(competitions)").fetchall()}
    if "project_id" not in competition_cols_pre:
        conn.execute("ALTER TABLE competitions ADD COLUMN project_id INTEGER REFERENCES projects(id)")
    if "personal_credit" not in competition_cols_pre:
        conn.execute("ALTER TABLE competitions ADD COLUMN personal_credit TEXT")

    competition_cols = {row["name"] for row in conn.execute("PRAGMA table_info(competitions)").fetchall()}
    if "status" not in competition_cols:
        conn.execute("ALTER TABLE competitions ADD COLUMN status TEXT DEFAULT 'found'")
    if "source" not in competition_cols:
        conn.execute("ALTER TABLE competitions ADD COLUMN source TEXT DEFAULT 'ai'")

    agent_log_cols = {row["name"] for row in conn.execute("PRAGMA table_info(agent_log)").fetchall()}
    if "status" not in agent_log_cols:
        conn.execute("ALTER TABLE agent_log ADD COLUMN status TEXT DEFAULT 'done'")
    if "started_at" not in agent_log_cols:
        conn.execute("ALTER TABLE agent_log ADD COLUMN started_at TEXT")

    team_cols = {row["name"] for row in conn.execute("PRAGMA table_info(team_members)").fetchall()}
    if "permission" not in team_cols:
        conn.execute("ALTER TABLE team_members ADD COLUMN permission TEXT DEFAULT 'viewer'")

    calendar_cols = {row["name"] for row in conn.execute("PRAGMA table_info(calendar_events)").fetchall()}
    if "google_event_id" not in calendar_cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN google_event_id TEXT")
    if "class_id" not in calendar_cols:
        conn.execute("ALTER TABLE calendar_events ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL")

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_slot "
        "ON classes(source, name, weekday, start_time, end_time)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_events_class_date "
        "ON calendar_events(class_id, date)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hours_date ON hours(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_days_date ON days(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_api_usage_model ON api_usage(model)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_log_created ON agent_log(created_at)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_calendar_events_slot "
        "ON calendar_events(date, start_time)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_bugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            details TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL
        )
        """
    )

    class_cols = {row["name"] for row in conn.execute("PRAGMA table_info(classes)").fetchall()}
    if "horizon_weeks" not in class_cols:
        conn.execute("ALTER TABLE classes ADD COLUMN horizon_weeks INTEGER DEFAULT 16")

    class_item_cols = {row["name"] for row in conn.execute("PRAGMA table_info(class_items)").fetchall()}
    if "grade_score" not in class_item_cols:
        conn.execute("ALTER TABLE class_items ADD COLUMN grade_score INTEGER")
    if "grade_letter" not in class_item_cols:
        conn.execute("ALTER TABLE class_items ADD COLUMN grade_letter TEXT")
    if "grade_feedback" not in class_item_cols:
        conn.execute("ALTER TABLE class_items ADD COLUMN grade_feedback TEXT")
    if "graded_at" not in class_item_cols:
        conn.execute("ALTER TABLE class_items ADD COLUMN graded_at TEXT")
    if "student_answer" not in class_item_cols:
        conn.execute("ALTER TABLE class_items ADD COLUMN student_answer TEXT")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            quote TEXT,
            note TEXT,
            tab TEXT,
            github_url TEXT,
            github_issue INTEGER,
            created_at TEXT NOT NULL
        )
        """
    )

    pending_action_cols = {row["name"] for row in conn.execute("PRAGMA table_info(pending_actions)").fetchall()}
    if "risk_summary" not in pending_action_cols:
        conn.execute("ALTER TABLE pending_actions ADD COLUMN risk_summary TEXT")

    event_cols = {row["name"] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
    if "location" not in event_cols:
        conn.execute("ALTER TABLE events ADD COLUMN location TEXT")
    if "url" not in event_cols:
        conn.execute("ALTER TABLE events ADD COLUMN url TEXT")
    if "end_date" not in event_cols:
        conn.execute("ALTER TABLE events ADD COLUMN end_date TEXT")
    if "start_time" not in event_cols:
        conn.execute("ALTER TABLE events ADD COLUMN start_time TEXT")
    if "end_time" not in event_cols:
        conn.execute("ALTER TABLE events ADD COLUMN end_time TEXT")
    if "all_day" not in event_cols:
        conn.execute("ALTER TABLE events ADD COLUMN all_day INTEGER DEFAULT 1")

    task_cols3 = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "sort_order" not in task_cols3:
        conn.execute("ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0")
    if "goal_id" not in task_cols3:
        conn.execute("ALTER TABLE tasks ADD COLUMN goal_id INTEGER REFERENCES goals(id)")
    try:
        import napkin_complete as _napkin_complete
        _napkin_complete.migrate_napkin_complete(conn)
    except Exception as exc:
        print(f"[db] napkin_complete migrate: {exc}")

    project_note_cols = {row["name"] for row in conn.execute("PRAGMA table_info(project_notes)").fetchall()}
    if "pinned" not in project_note_cols:
        conn.execute("ALTER TABLE project_notes ADD COLUMN pinned INTEGER DEFAULT 0")

    # Multi-conversation Agent chat: table + backfill legacy messages into one thread.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'New chat',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    agent_msg_cols = {row["name"] for row in conn.execute("PRAGMA table_info(agent_messages)").fetchall()}
    if "conversation_id" not in agent_msg_cols:
        conn.execute("ALTER TABLE agent_messages ADD COLUMN conversation_id INTEGER")
    conv_count = conn.execute("SELECT COUNT(*) AS c FROM agent_conversations").fetchone()["c"]
    orphan_count = conn.execute(
        "SELECT COUNT(*) AS c FROM agent_messages WHERE conversation_id IS NULL"
    ).fetchone()["c"]
    if conv_count == 0 or orphan_count:
        row = conn.execute("SELECT id FROM agent_conversations ORDER BY id LIMIT 1").fetchone()
        if row:
            default_cid = row["id"]
        else:
            ts = now_iso()
            cur = conn.execute(
                "INSERT INTO agent_conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
                ("Chat", ts, ts),
            )
            default_cid = cur.lastrowid
        conn.execute(
            "UPDATE agent_messages SET conversation_id = ? WHERE conversation_id IS NULL",
            (default_cid,),
        )
        last_msg = conn.execute(
            "SELECT created_at FROM agent_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
            (default_cid,),
        ).fetchone()
        if last_msg and last_msg["created_at"]:
            conn.execute(
                "UPDATE agent_conversations SET updated_at = ? WHERE id = ?",
                (last_msg["created_at"], default_cid),
            )

    conn.commit()
    conn.close()
    _ensure_coin_ledger_table()
    _migrate_wallet_spends_to_coin_ledger()


# --- days / hours ---------------------------------------------------------

def get_day(date):
    conn = get_conn()
    day = conn.execute("SELECT * FROM days WHERE date = ?", (date,)).fetchone()
    hours = conn.execute("SELECT * FROM hours WHERE date = ? ORDER BY hour", (date,)).fetchall()
    conn.close()
    return {
        "date": date,
        "metrics": dict(day) if day else None,
        "hours": {h["hour"]: {"category": h["category"], "note": h["note"]} for h in hours},
    }


def save_day(date, metrics, hours):
    """metrics: dict of metric key -> value. hours: dict of hour(int) -> {category, note}.

    Only keys present in ``metrics`` are written. A quiet leave-save that collected an empty
    DOM (e.g. after a race) must not null out previously saved day metrics.
    """
    conn = get_conn()
    existing = conn.execute("SELECT * FROM days WHERE date = ?", (date,)).fetchone()
    fields = ["happiness", "volatility", "motivation", "focus", "work_time", "effective_work_time", "sports", "eating", "notes"]
    metrics = metrics if isinstance(metrics, dict) else {}
    provided = {f for f in fields if f in metrics}
    if existing:
        if provided:
            values = [metrics[f] for f in fields if f in provided]
            conn.execute(
                f"UPDATE days SET {', '.join(f'{f} = ?' for f in fields if f in provided)}, updated_at = ? WHERE date = ?",
                (*values, now_iso(), date),
            )
        else:
            conn.execute("UPDATE days SET updated_at = ? WHERE date = ?", (now_iso(), date))
    else:
        values = [metrics.get(f) for f in fields]
        conn.execute(
            f"INSERT INTO days (date, {', '.join(fields)}, updated_at) VALUES (?, {', '.join('?' for _ in fields)}, ?)",
            (date, *values, now_iso()),
        )

    for hour, data in hours.items():
        conn.execute(
            """
            INSERT INTO hours (date, hour, category, note) VALUES (?, ?, ?, ?)
            ON CONFLICT(date, hour) DO UPDATE SET category = excluded.category, note = excluded.note
            """,
            (date, int(hour), data.get("category"), data.get("note")),
        )
    conn.commit()
    conn.close()


def delete_day(date):
    conn = get_conn()
    conn.execute("DELETE FROM hours WHERE date = ?", (date,))
    conn.execute("DELETE FROM days WHERE date = ?", (date,))
    conn.commit()
    conn.close()


def list_days(limit=30):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM days ORDER BY date DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- goals / chunks ---------------------------------------------------------

def create_goal(title, deadline, chunks):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO goals (title, deadline, created_at) VALUES (?, ?, ?)",
        (title, deadline, now_iso()),
    )
    goal_id = cur.lastrowid
    for i, chunk in enumerate(chunks):
        conn.execute(
            "INSERT INTO goal_chunks (goal_id, title, due_date, sort_order) VALUES (?, ?, ?, ?)",
            (goal_id, chunk["title"], chunk.get("due_date"), i),
        )
    conn.commit()
    conn.close()
    return goal_id


def list_goals():
    conn = get_conn()
    goals = conn.execute("SELECT * FROM goals ORDER BY created_at DESC").fetchall()
    result = []
    for g in goals:
        chunks = conn.execute(
            "SELECT * FROM goal_chunks WHERE goal_id = ? ORDER BY sort_order", (g["id"],)
        ).fetchall()
        quests = conn.execute(
            "SELECT * FROM goal_coach_quests WHERE goal_id = ? ORDER BY done, id",
            (g["id"],),
        ).fetchall()
        linked = conn.execute(
            "SELECT * FROM tasks WHERE goal_id = ? ORDER BY created_at DESC",
            (g["id"],),
        ).fetchall()
        result.append({
            **dict(g),
            "chunks": [dict(c) for c in chunks],
            "coach_quests": [dict(q) for q in quests],
            "linked_tasks": [dict(t) for t in linked],
        })
    conn.close()
    return result


def update_goal(goal_id, **fields):
    allowed = ("title", "deadline", "notes", "progress_pct")
    updates = {key: fields[key] for key in allowed if key in fields}
    if not updates:
        return get_goal(goal_id)
    conn = get_conn()
    cur = conn.execute(
        f"UPDATE goals SET {', '.join(f'{key} = ?' for key in updates)} WHERE id = ?",
        (*updates.values(), goal_id),
    )
    conn.commit()
    conn.close()
    return get_goal(goal_id) if cur.rowcount else None


def update_chunk(chunk_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE goal_chunks SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), chunk_id),
    )
    conn.commit()
    conn.close()


def get_goal(goal_id):
    conn = get_conn()
    goal = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
    if not goal:
        conn.close()
        return None
    chunks = conn.execute(
        "SELECT * FROM goal_chunks WHERE goal_id = ? ORDER BY sort_order", (goal_id,)
    ).fetchall()
    quests = conn.execute(
        "SELECT * FROM goal_coach_quests WHERE goal_id = ? ORDER BY done, id",
        (goal_id,),
    ).fetchall()
    linked = conn.execute(
        "SELECT * FROM tasks WHERE goal_id = ? ORDER BY created_at DESC",
        (goal_id,),
    ).fetchall()
    conn.close()
    return {
        **dict(goal),
        "chunks": [dict(c) for c in chunks],
        "coach_quests": [dict(q) for q in quests],
        "linked_tasks": [dict(t) for t in linked],
    }


def insert_goal_coach_quest(goal_id, title, description="", success_criteria="", difficulty=""):
    conn = get_conn()
    cur = conn.execute(
        """
        INSERT INTO goal_coach_quests
            (goal_id, title, description, success_criteria, difficulty, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (goal_id, title, description, success_criteria, difficulty, now_iso()),
    )
    conn.commit()
    quest_id = cur.lastrowid
    row = conn.execute("SELECT * FROM goal_coach_quests WHERE id = ?", (quest_id,)).fetchone()
    conn.close()
    return dict(row)


def update_goal_coach_quest(quest_id, done):
    conn = get_conn()
    cur = conn.execute(
        "UPDATE goal_coach_quests SET done = ? WHERE id = ?",
        (int(bool(done)), quest_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM goal_coach_quests WHERE id = ?", (quest_id,)).fetchone()
    conn.close()
    return dict(row) if cur.rowcount and row else None


def delete_goal_coach_quest(quest_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM goal_coach_quests WHERE id = ?", (quest_id,)).fetchone()
    if row:
        record_deletion(conn, "goal_coach_quest", dict(row), label=row["title"])
        conn.execute("DELETE FROM goal_coach_quests WHERE id = ?", (quest_id,))
    conn.commit()
    conn.close()
    return bool(row)


def delete_goal(goal_id):
    conn = get_conn()
    try:
        # tasks.goal_id has no ON DELETE CASCADE — clear links first so goal
        # deletion cannot IntegrityError and leave a locked write connection.
        conn.execute("UPDATE tasks SET goal_id = NULL WHERE goal_id = ?", (goal_id,))
        conn.execute("DELETE FROM goal_coach_quests WHERE goal_id = ?", (goal_id,))
        conn.execute("DELETE FROM goal_chunks WHERE goal_id = ?", (goal_id,))
        conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        conn.commit()
    finally:
        conn.close()


# --- contacts ---------------------------------------------------------

def list_contacts():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM contacts ORDER BY warmth ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


CONTACT_COLUMNS = frozenset({
    "name", "warmth", "last_contact", "notes", "current_focus", "description",
    "met_where", "met_when", "what_they_do", "created_at", "email", "phone",
    "linkedin_url", "closeness",
})


def upsert_contact(contact_id, **fields):
    fields = {k: v for k, v in fields.items() if k in CONTACT_COLUMNS}
    if not fields:
        raise ValueError("no valid contact fields")
    conn = get_conn()
    if contact_id:
        conn.execute(
            f"UPDATE contacts SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
            (*fields.values(), contact_id),
        )
    else:
        fields.setdefault("created_at", now_iso())
        cols = ", ".join(fields.keys())
        placeholders = ", ".join("?" for _ in fields)
        cur = conn.execute(f"INSERT INTO contacts ({cols}) VALUES ({placeholders})", tuple(fields.values()))
        contact_id = cur.lastrowid
    conn.commit()
    conn.close()
    return contact_id


def delete_contact(contact_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
    if row:
        record_deletion(conn, "contact", dict(row), label=row["name"])
    conn.execute("UPDATE tasks SET contact_id = NULL WHERE contact_id = ?", (contact_id,))
    conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    conn.commit()
    conn.close()


# --- tasks ---------------------------------------------------------

def list_tasks(search=None, status=None):
    conn = get_conn()
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []
    if search:
        query += " AND (title LIKE ? OR description LIKE ? OR notes LIKE ?)"
        params += [f"%{search}%", f"%{search}%", f"%{search}%"]
    if status:
        query += " AND status = ?"
        params.append(status)
    # sort_order first so manual drag-reorder (which only ever touches tasks within the same
    # status group) wins once set; it defaults to 0 for every row, so untouched tasks fall
    # through to the original urgency/created_at ordering unchanged.
    query += " ORDER BY sort_order, CASE urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_task(task_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


TASK_DEADLINE_DAYS = {"critical": 0, "high": 2, "medium": 7, "low": 30}


def suggest_task_deadline(urgency, from_date=None):
    """Return the deterministic urgency deadline used by every task creation path."""
    base = from_date or date.today()
    if isinstance(base, str):
        base = date.fromisoformat(base)
    return (base + timedelta(days=TASK_DEADLINE_DAYS.get(urgency, 7))).isoformat()


def insert_task(title, notes="", urgency="medium", importance=None, progress_total=None, progress_unit=None,
                 contact_id=None, project_id=None, due_date=None, category=None, assignee_id=None,
                 description="", deadline_dismissed=False, goal_id=None, created_by="user", tags=None,
                 deadline_kind=None, estimate_minutes=None):
    deadline_dismissed = bool(deadline_dismissed)
    if due_date:
        deadline_dismissed = False
        deadline_kind = deadline_kind or "hard"
    else:
        # Empty due date stays empty — never invent a deadline.
        deadline_dismissed = True
        deadline_kind = deadline_kind or "indefinite"
        due_date = None
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            INSERT INTO tasks (title, description, notes, urgency, importance, progress_total, progress_unit,
                               contact_id, project_id, due_date, deadline_dismissed, category, assignee_id, goal_id,
                               created_by, tags, deadline_kind, estimate_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (title, description, notes, urgency, importance, progress_total, progress_unit, contact_id,
             project_id, due_date, int(deadline_dismissed), category, assignee_id, goal_id,
             created_by or "user", tags, deadline_kind, estimate_minutes, now_iso()),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_task(task_id, **fields):
    if not fields:
        return
    if fields.get("status") in ("done",) and "completed_at" not in fields:
        fields["completed_at"] = now_iso()
    conn = get_conn()
    try:
        conn.execute(
            f"UPDATE tasks SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
            (*fields.values(), task_id),
        )
        conn.commit()
    finally:
        conn.close()


def delete_task(task_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row:
        record_deletion(conn, "task", dict(row), label=row["title"])
    conn.execute("DELETE FROM attachments WHERE entity_type = 'task' AND entity_id = ?", (task_id,))
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


def reorder_tasks(ids):
    """Persists a manual drag-reorder: `ids` is a list of task ids in their new display order
    (normally all the tasks within one status group, since that's the unit the Tasks-tab UI drags
    within). Assigns sequential sort_order values 0..n-1 matching that order.
    """
    conn = get_conn()
    conn.executemany(
        "UPDATE tasks SET sort_order = ? WHERE id = ?",
        [(i, task_id) for i, task_id in enumerate(ids)],
    )
    conn.commit()
    conn.close()


def reorder_projects(ids):
    """Same pattern as reorder_tasks, scoped to the active/archived group the UI drags within."""
    conn = get_conn()
    conn.executemany(
        "UPDATE projects SET sort_order = ? WHERE id = ?",
        [(i, project_id) for i, project_id in enumerate(ids)],
    )
    conn.commit()
    conn.close()


def reorder_ideas(ids):
    """Persists manual Ideas-list order; only affects list order, not 3D map coordinates."""
    conn = get_conn()
    conn.executemany(
        "UPDATE ideas SET sort_order = ? WHERE id = ?",
        [(i, idea_id) for i, idea_id in enumerate(ids)],
    )
    conn.commit()
    conn.close()


# --- events ---------------------------------------------------------

def list_events():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM events ORDER BY date").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_event(event_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_event(title, description, date, location, url, source, status="suggested", end_date=None,
                 start_time=None, end_time=None, all_day=None):
    if all_day is None:
        all_day = not bool(start_time)
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO events (title, description, date, end_date, start_time, end_time, all_day, "
        "location, url, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (title, description, date, end_date, start_time, end_time, int(bool(all_day)),
         location, url, source, status, now_iso()),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return event_id


def update_event(event_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE events SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), event_id),
    )
    conn.commit()
    conn.close()


def set_event_status(event_id, status):
    conn = get_conn()
    conn.execute("UPDATE events SET status = ? WHERE id = ?", (status, event_id))
    conn.commit()
    conn.close()


def delete_event(event_id):
    conn = get_conn()
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()


def list_task_schedule(date_value):
    conn = get_conn()
    rows = conn.execute(
        """SELECT task_schedule.date, task_schedule.hour, task_schedule.task_id,
                  tasks.title, tasks.progress_total, tasks.progress_unit
           FROM task_schedule JOIN tasks ON tasks.id = task_schedule.task_id
           WHERE task_schedule.date = ?
           ORDER BY task_schedule.hour, task_schedule.task_id""",
        (date_value,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def schedule_task(task_id, date_value, hours):
    rows = [(date_value, int(hour), task_id, now_iso()) for hour in sorted(set(hours))]
    conn = get_conn()
    conn.execute("DELETE FROM task_schedule WHERE date = ? AND task_id = ?", (date_value, task_id))
    conn.executemany(
        "INSERT OR IGNORE INTO task_schedule (date, hour, task_id, created_at) VALUES (?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    conn.close()


def unschedule_task(task_id, date_value):
    conn = get_conn()
    conn.execute("DELETE FROM task_schedule WHERE date = ? AND task_id = ?", (date_value, task_id))
    conn.commit()
    conn.close()


# --- categories ---------------------------------------------------------

def list_categories():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM categories ORDER BY sort_order").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def upsert_category(key, label, color):
    conn = get_conn()
    existing = conn.execute("SELECT 1 FROM categories WHERE key = ?", (key,)).fetchone()
    if existing:
        conn.execute("UPDATE categories SET label = ?, color = ? WHERE key = ?", (label, color, key))
    else:
        max_order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM categories").fetchone()[0]
        conn.execute(
            "INSERT INTO categories (key, label, color, sort_order) VALUES (?, ?, ?, ?)",
            (key, label, color, max_order + 1),
        )
    conn.commit()
    conn.close()


# --- ideas ---------------------------------------------------------

def list_ideas():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM ideas ORDER BY sort_order, id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_idea(idea_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_idea(title, body, source="human"):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO ideas (title, body, source, created_at) VALUES (?, ?, ?, ?)",
        (title, body, source, now_iso()),
    )
    conn.commit()
    idea_id = cur.lastrowid
    conn.close()
    return idea_id


def update_idea_coords(idea_id, x, y, z):
    conn = get_conn()
    conn.execute("UPDATE ideas SET x = ?, y = ?, z = ? WHERE id = ?", (x, y, z, idea_id))
    conn.commit()
    conn.close()


def update_idea(idea_id, fields):
    allowed = {"title", "body"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_idea(idea_id)
    conn = get_conn()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(f"UPDATE ideas SET {set_clause} WHERE id = ?", (*updates.values(), idea_id))
    conn.commit()
    conn.close()
    return get_idea(idea_id)


def delete_idea(idea_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
    if row:
        record_deletion(conn, "idea", dict(row), label=row["title"])
    conn.execute("DELETE FROM idea_similarity_results WHERE idea_id = ?", (idea_id,))
    conn.execute("DELETE FROM field_history WHERE entity_type = 'idea' AND entity_id = ?", (idea_id,))
    conn.execute("DELETE FROM ideas WHERE id = ?", (idea_id,))
    conn.commit()
    conn.close()


def list_idea_similarity_results(idea_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM idea_similarity_results WHERE idea_id = ? ORDER BY id", (idea_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def replace_idea_similarity_results(idea_id, results):
    conn = get_conn()
    conn.execute("DELETE FROM idea_similarity_results WHERE idea_id = ?", (idea_id,))
    for r in results:
        conn.execute(
            "INSERT INTO idea_similarity_results (idea_id, title, description, url, similarity_note, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (idea_id, r.get("title", ""), r.get("description", ""), r.get("url", ""),
             r.get("similarity_note", ""), now_iso()),
        )
    conn.commit()
    conn.close()


# --- projects ---------------------------------------------------------

def list_projects():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM projects ORDER BY sort_order, created_at DESC").fetchall()
    projects = [dict(r) for r in rows]
    links = conn.execute("SELECT project_id, team_member_id FROM project_team_members").fetchall()
    conn.close()
    by_project = {}
    for l in links:
        by_project.setdefault(l["project_id"], []).append(l["team_member_id"])
    for p in projects:
        p["team_member_ids"] = by_project.get(p["id"], [])
    return projects


def get_project(project_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not row:
        conn.close()
        return None
    project = dict(row)
    links = conn.execute(
        "SELECT team_member_id FROM project_team_members WHERE project_id = ?", (project_id,)
    ).fetchall()
    conn.close()
    project["team_member_ids"] = [l["team_member_id"] for l in links]
    return project


def insert_project(name, description, kind, source_idea_id=None):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO projects (name, description, kind, source_idea_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, description, kind, source_idea_id, now_iso()),
    )
    conn.commit()
    project_id = cur.lastrowid
    conn.close()
    return project_id


def update_project(project_id, **fields):
    if not fields:
        return
    existing = get_project(project_id) or {}
    if fields.get("status") == "done" and not existing.get("completed_at") and not fields.get("completed_at"):
        fields["completed_at"] = now_iso()
    elif fields.get("status") == "active" and "completed_at" not in fields:
        fields["completed_at"] = None
    conn = get_conn()
    conn.execute(
        f"UPDATE projects SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), project_id),
    )
    conn.commit()
    conn.close()


def delete_project(project_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row:
        record_deletion(conn, "project", dict(row), label=row["name"])
    conn.execute("DELETE FROM project_notes WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM project_events WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM project_team_members WHERE project_id = ?", (project_id,))
    conn.execute("UPDATE tasks SET project_id = NULL WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()


def add_project_team_member(project_id, member_id):
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO project_team_members (project_id, team_member_id) VALUES (?, ?)",
        (project_id, member_id),
    )
    conn.commit()
    conn.close()


def remove_project_team_member(project_id, member_id):
    conn = get_conn()
    conn.execute(
        "DELETE FROM project_team_members WHERE project_id = ? AND team_member_id = ?",
        (project_id, member_id),
    )
    conn.commit()
    conn.close()


def list_project_notes(project_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM project_notes WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_project_note(project_id, category, body):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO project_notes (project_id, category, body, created_at) VALUES (?, ?, ?, ?)",
        (project_id, category, body, now_iso()),
    )
    conn.commit()
    note_id = cur.lastrowid
    conn.close()
    return note_id


def delete_project_note(note_id):
    conn = get_conn()
    conn.execute("DELETE FROM project_notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()


def get_project_note(note_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM project_notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_project_note(note_id, **fields):
    allowed = {"body", "category", "pinned"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_project_note(note_id)
    conn = get_conn()
    conn.execute(
        f"UPDATE project_notes SET {', '.join(f'{k} = ?' for k in updates)} WHERE id = ?",
        (*updates.values(), note_id),
    )
    conn.commit()
    conn.close()
    return get_project_note(note_id)


def insert_project_event(project_id, kind, detail=None):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO project_events (project_id, kind, detail, created_at) VALUES (?, ?, ?, ?)",
        (project_id, kind, detail, now_iso()),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return event_id


def list_project_events(project_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at ASC",
        (project_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_completed_tasks_for_project(project_id):
    conn = get_conn()
    rows = conn.execute(
        """SELECT * FROM tasks WHERE project_id = ? AND status = 'done' AND completed_at IS NOT NULL
           ORDER BY completed_at ASC""",
        (project_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_competitions_for_project(project_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM competitions WHERE project_id = ? ORDER BY created_at ASC",
        (project_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_receipts_for_project(project_id, project_name, limit=200):
    """Best-effort match: entity_id equals project id or summary mentions project name."""
    conn = get_conn()
    pid = str(project_id)
    name_pat = f"%{project_name}%" if project_name else None
    if name_pat:
        rows = conn.execute(
            """SELECT * FROM receipts
               WHERE entity_id = ? OR summary LIKE ?
               ORDER BY created_at ASC LIMIT ?""",
            (pid, name_pat, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM receipts WHERE entity_id = ? ORDER BY created_at ASC LIMIT ?",
            (pid, limit),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def project_deadlines():
    """Tasks with a due_date, joined to their project (if any) -- feeds the
    Projects tab's approaching-deadlines calendar view."""
    conn = get_conn()
    rows = conn.execute(
        """SELECT tasks.id, tasks.title, tasks.due_date, tasks.status, tasks.urgency,
                  tasks.project_id, projects.name AS project_name
           FROM tasks LEFT JOIN projects ON tasks.project_id = projects.id
           WHERE tasks.due_date IS NOT NULL AND tasks.due_date != ''
           ORDER BY tasks.due_date ASC"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- customers ---------------------------------------------------------

def list_customers():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM customers ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_customer(customer_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_customer(name, company, notes):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO customers (name, company, notes, last_update, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, company, notes, now_iso(), now_iso()),
    )
    conn.commit()
    customer_id = cur.lastrowid
    conn.close()
    return customer_id


def update_customer(customer_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE customers SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), customer_id),
    )
    conn.commit()
    conn.close()


def delete_customer(customer_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if row:
        record_deletion(conn, "customer", dict(row), label=row["name"])
    conn.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    conn.commit()
    conn.close()


# --- classes / recurring school slots ---------------------------------------

def list_classes():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM classes ORDER BY weekday, start_time, name COLLATE NOCASE"
    ).fetchall()
    item_rows = conn.execute(
        """SELECT class_items.*, tasks.status AS task_status
           FROM class_items
           LEFT JOIN tasks ON tasks.id = class_items.task_id
           ORDER BY class_items.due_date IS NULL, class_items.due_date, class_items.created_at"""
    ).fetchall()
    item_ids = [row["id"] for row in item_rows]
    attachments_by_item = {}
    if item_ids:
        placeholders = ",".join("?" for _ in item_ids)
        attachment_rows = conn.execute(
            f"""SELECT * FROM attachments
                WHERE entity_type = 'class_item' AND entity_id IN ({placeholders})
                ORDER BY uploaded_at""",
            item_ids,
        ).fetchall()
        for attachment in attachment_rows:
            attachments_by_item.setdefault(attachment["entity_id"], []).append(dict(attachment))
    items_by_class = {}
    for row in item_rows:
        item = dict(row)
        item["attachments"] = attachments_by_item.get(item["id"], [])
        items_by_class.setdefault(item["class_id"], []).append(item)
    conn.close()
    result = []
    for row in rows:
        class_row = dict(row)
        class_row["items"] = items_by_class.get(class_row["id"], [])
        result.append(class_row)
    return result


def get_class(class_id):
    return next((row for row in list_classes() if row["id"] == class_id), None)


def insert_class(name, weekday, start_time, end_time, travel_minutes=0, location="", notes="",
                 source="manual", start_date=None, end_date=None, horizon_weeks=16):
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO classes
           (name, weekday, start_time, end_time, travel_minutes, location, notes, source,
            start_date, end_date, horizon_weeks, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, weekday, start_time, end_time, travel_minutes, location, notes, source,
         start_date, end_date, max(1, min(int(horizon_weeks or 16), 52)), now_iso()),
    )
    conn.commit()
    class_id = cur.lastrowid
    conn.close()
    return class_id


def upsert_class_slot(name, weekday, start_time, end_time, travel_minutes=0, location="", notes="",
                      source="manual", start_date=None, end_date=None, horizon_weeks=16):
    conn = get_conn()
    row = conn.execute(
        """SELECT id FROM classes
           WHERE source = ? AND name = ? AND weekday = ? AND start_time = ? AND end_time = ?""",
        (source, name, weekday, start_time, end_time),
    ).fetchone()
    weeks = max(1, min(int(horizon_weeks or 16), 52))
    if row:
        class_id = row["id"]
        conn.execute(
            """UPDATE classes SET travel_minutes = ?, location = ?, notes = ?,
               start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
               horizon_weeks = ?
               WHERE id = ?""",
            (travel_minutes, location, notes, start_date, end_date, weeks, class_id),
        )
    else:
        cur = conn.execute(
            """INSERT INTO classes
               (name, weekday, start_time, end_time, travel_minutes, location, notes, source,
                start_date, end_date, horizon_weeks, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, weekday, start_time, end_time, travel_minutes, location, notes, source,
             start_date, end_date, weeks, now_iso()),
        )
        class_id = cur.lastrowid
    conn.commit()
    conn.close()
    return class_id


def update_class(class_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE classes SET {', '.join(f'{key} = ?' for key in fields)} WHERE id = ?",
        (*fields.values(), class_id),
    )
    conn.commit()
    conn.close()


def class_attachment_rows(class_id):
    conn = get_conn()
    rows = conn.execute(
        """SELECT attachments.* FROM attachments
           JOIN class_items ON class_items.id = attachments.entity_id
           WHERE attachments.entity_type = 'class_item' AND class_items.class_id = ?""",
        (class_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_class(class_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()
    if row:
        record_deletion(conn, "class", dict(row), label=row["name"])
    item_ids = [
        item["id"] for item in conn.execute(
            "SELECT id FROM class_items WHERE class_id = ?", (class_id,)
        ).fetchall()
    ]
    if item_ids:
        placeholders = ",".join("?" for _ in item_ids)
        conn.execute(
            f"DELETE FROM attachments WHERE entity_type = 'class_item' AND entity_id IN ({placeholders})",
            item_ids,
        )
    conn.execute("DELETE FROM calendar_events WHERE class_id = ?", (class_id,))
    conn.execute("DELETE FROM class_items WHERE class_id = ?", (class_id,))
    conn.execute("DELETE FROM classes WHERE id = ?", (class_id,))
    conn.commit()
    conn.close()


def insert_class_item(class_id, title, item_type="homework", due_date=None, notes="", url="",
                      create_task=True):
    conn = get_conn()
    class_row = conn.execute("SELECT name FROM classes WHERE id = ?", (class_id,)).fetchone()
    if not class_row:
        conn.close()
        return None
    task_id = None
    if create_task and due_date:
        task_title = f"{class_row['name']}: {title}"
        cur = conn.execute(
            """INSERT INTO tasks
               (title, description, notes, urgency, due_date, deadline_dismissed, category, created_at)
               VALUES (?, ?, ?, 'medium', ?, 0, 'School', ?)""",
            (task_title, notes, url, due_date, now_iso()),
        )
        task_id = cur.lastrowid
    cur = conn.execute(
        """INSERT INTO class_items
           (class_id, title, item_type, due_date, notes, url, task_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (class_id, title, item_type, due_date, notes, url, task_id, now_iso()),
    )
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return item_id


def delete_class_item(item_id):
    conn = get_conn()
    conn.execute("DELETE FROM attachments WHERE entity_type = 'class_item' AND entity_id = ?", (item_id,))
    conn.execute("DELETE FROM class_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()


def get_class_item(item_id):
    for row in list_classes():
        for item in row.get("items") or []:
            if item["id"] == item_id:
                return item
    return None


def update_class_item_grade(item_id, score, letter, feedback, student_answer=""):
    conn = get_conn()
    conn.execute(
        """UPDATE class_items
           SET grade_score = ?, grade_letter = ?, grade_feedback = ?, student_answer = ?, graded_at = ?
           WHERE id = ?""",
        (score, letter, feedback, student_answer or None, now_iso(), item_id),
    )
    conn.commit()
    conn.close()


def insert_observation(title, quote="", note="", tab=""):
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO observations (title, quote, note, tab, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (title, quote or "", note or "", tab or "", now_iso()),
    )
    conn.commit()
    oid = cur.lastrowid
    conn.close()
    return oid


def update_observation_github(observation_id, github_url, github_issue=None):
    conn = get_conn()
    conn.execute(
        "UPDATE observations SET github_url = ?, github_issue = ? WHERE id = ?",
        (github_url, github_issue, observation_id),
    )
    conn.commit()
    conn.close()


def get_observation(observation_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM observations WHERE id = ?", (observation_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_observations(limit=40):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM observations ORDER BY id DESC LIMIT ?",
        (max(1, min(int(limit or 40), 200)),),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def materialize_class_events(class_id, weeks=None, from_date=None, replace=False):
    """Project a recurring class slot into dated Planner calendar events."""
    conn = get_conn()
    class_row = conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()
    if not class_row:
        conn.close()
        return 0
    first_date = from_date or date.today()
    if isinstance(first_date, str):
        first_date = date.fromisoformat(first_date)
    stored_weeks = class_row["horizon_weeks"] if "horizon_weeks" in class_row.keys() else 16
    weeks = max(1, min(int(weeks if weeks is not None else (stored_weeks or 16)), 52))
    last_date = first_date + timedelta(days=weeks * 7 - 1)
    if class_row["start_date"]:
        first_date = max(first_date, date.fromisoformat(class_row["start_date"]))
    if class_row["end_date"]:
        last_date = min(last_date, date.fromisoformat(class_row["end_date"]))
    if replace:
        conn.execute(
            "DELETE FROM calendar_events WHERE class_id = ? AND date >= ?",
            (class_id, first_date.isoformat()),
        )
    notes_parts = []
    if class_row["location"]:
        notes_parts.append(f"Location: {class_row['location']}")
    if class_row["travel_minutes"]:
        notes_parts.append(f"Travel: {class_row['travel_minutes']} min")
    if class_row["notes"]:
        notes_parts.append(class_row["notes"])
    event_notes = " · ".join(notes_parts)
    created = 0
    cursor_date = first_date
    while cursor_date <= last_date:
        if cursor_date.weekday() == class_row["weekday"]:
            event_date = cursor_date.isoformat()
            existing = conn.execute(
                """SELECT id, class_id FROM calendar_events
                   WHERE title = ? AND date = ? AND start_time = ? LIMIT 1""",
                (class_row["name"], event_date, class_row["start_time"]),
            ).fetchone()
            if existing:
                if existing["class_id"] is None:
                    conn.execute(
                        "UPDATE calendar_events SET class_id = ? WHERE id = ?",
                        (class_id, existing["id"]),
                    )
            else:
                conn.execute(
                    """INSERT INTO calendar_events
                       (title, date, start_time, end_time, category, notes, class_id)
                       VALUES (?, ?, ?, ?, 'School', ?, ?)""",
                    (class_row["name"], event_date, class_row["start_time"],
                     class_row["end_time"], event_notes, class_id),
                )
                created += 1
        cursor_date += timedelta(days=1)
    conn.commit()
    conn.close()
    return created


# --- calendar events ---------------------------------------------------------

def list_calendar_events(start=None, end=None):
    conn = get_conn()
    if start and end:
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE date >= ? AND date <= ? ORDER BY date, start_time",
            (start, end),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM calendar_events ORDER BY date, start_time").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_calendar_event(event_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


_WEEKDAY_PAREN_RE = re.compile(
    r"\s*\((mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\)\s*$",
    re.I,
)


def normalize_event_title(title):
    text = re.sub(r"\s+", " ", (title or "").strip().lower())
    text = _WEEKDAY_PAREN_RE.sub("", text).strip(" -–—")
    return text


def titles_are_similar(a, b):
    """Same-slot duplicate check: exact, contained, or high token overlap after stripping weekday suffixes."""
    na = normalize_event_title(a)
    nb = normalize_event_title(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if len(na) >= 4 and len(nb) >= 4 and (na in nb or nb in na):
        return True
    wa = {w for w in re.split(r"[^a-z0-9]+", na) if len(w) >= 2}
    wb = {w for w in re.split(r"[^a-z0-9]+", nb) if len(w) >= 2}
    if not wa or not wb:
        return False
    overlap = len(wa & wb)
    union = len(wa | wb)
    return union > 0 and overlap / union >= 0.75


def find_similar_calendar_slot(title, date, start_time, exclude_id=None):
    """Return an existing calendar row in the same date+start slot with a similar title, or None."""
    date = str(date or "").strip()
    start_time = str(start_time or "").strip()
    if not date:
        return None
    conn = get_conn()
    if start_time:
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE date = ? AND IFNULL(start_time,'') = ?",
            (date, start_time),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE date = ?",
            (date,),
        ).fetchall()
    conn.close()
    for row in rows:
        event = dict(row)
        if exclude_id is not None and event.get("id") == exclude_id:
            continue
        if titles_are_similar(title, event.get("title")):
            return event
    return None


def insert_calendar_event(title, date, start_time, end_time, category, notes, class_id=None,
                          url=None, kind=None, lane=None, dedupe=True):
    try:
        import napkin_remaining
        kind = napkin_remaining.infer_event_kind(title, class_id, kind)
        lane = napkin_remaining.infer_event_lane(title, category, lane)
    except Exception:
        kind = kind or ("class" if class_id else "event")
        lane = lane or "passion"
    if dedupe:
        existing = find_similar_calendar_slot(title, date, start_time)
        if existing:
            return existing["id"]
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO calendar_events
           (title, date, start_time, end_time, category, notes, class_id, url, kind, lane)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, date, start_time, end_time, category, notes, class_id, url, kind, lane),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return event_id


CALENDAR_EVENT_UPDATE_FIELDS = (
    "title", "date", "start_time", "end_time", "category", "notes",
    "class_id", "url", "kind", "lane", "google_event_id",
    "status", "rrule", "series_id",
)


def update_calendar_event(event_id, **fields):
    if not fields:
        return
    cleaned = {}
    for key, value in fields.items():
        if key not in CALENDAR_EVENT_UPDATE_FIELDS:
            continue
        if key == "kind":
            value = "class" if value == "class" else "event"
        elif key == "lane":
            value = "work" if value == "work" else "passion"
        cleaned[key] = value
    if not cleaned:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE calendar_events SET {', '.join(f'{k} = ?' for k in cleaned)} WHERE id = ?",
        (*cleaned.values(), event_id),
    )
    conn.commit()
    conn.close()


def delete_calendar_event(event_id):
    conn = get_conn()
    # Route through the trash like every other deletable entity (CLAUDE.md requires it). This
    # was a hard DELETE with no undo, which meant a bulk calendar cleanup could only be made
    # safe by taking a manual database backup first.
    row = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
    if row:
        record_deletion(conn, "calendar_event", dict(row), label=row["title"])
    conn.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()


# --- competitions ---------------------------------------------------------

def list_competitions():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM competitions ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_competition(title, description, comp_type, url, status="found", source="ai"):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO competitions (title, description, type, url, created_at, status, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (title, description, comp_type, url, now_iso(), status, source),
    )
    conn.commit()
    competition_id = cur.lastrowid
    conn.close()
    return competition_id


def update_competition_status(competition_id, status):
    conn = get_conn()
    conn.execute("UPDATE competitions SET status = ? WHERE id = ?", (status, competition_id))
    conn.commit()
    conn.close()


def update_competition(competition_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE competitions SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), competition_id),
    )
    conn.commit()
    conn.close()


def delete_competition(competition_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM competitions WHERE id = ?", (competition_id,)).fetchone()
    if row:
        record_deletion(conn, "competition", dict(row), label=row["title"])
    conn.execute("DELETE FROM competitions WHERE id = ?", (competition_id,))
    conn.commit()
    conn.close()


# --- agent activity log ---------------------------------------------------------

def insert_agent_log(subagent, summary):
    conn = get_conn()
    conn.execute(
        "INSERT INTO agent_log (subagent, summary, created_at, status) VALUES (?, ?, ?, 'done')",
        (subagent, summary, now_iso()),
    )
    conn.commit()
    conn.close()


def start_agent_log(subagent, snippet):
    """Marks a subagent run as in-progress *before* it executes, so the Agent tab
    can show what's actually running right now instead of only ever showing
    already-finished work."""
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO agent_log (subagent, summary, created_at, started_at, status) VALUES (?, ?, ?, ?, 'running')",
        (subagent, snippet, now_iso(), now_iso()),
    )
    conn.commit()
    log_id = cur.lastrowid
    conn.close()
    return log_id


def finish_agent_log(log_id, summary):
    conn = get_conn()
    conn.execute(
        "UPDATE agent_log SET summary = ?, created_at = ?, status = 'done' WHERE id = ?",
        (summary, now_iso(), log_id),
    )
    conn.commit()
    conn.close()


def currently_running_agent_logs():
    """Running now, plus anything finished in the last 8 seconds -- most subagent
    calls complete in under a second, so without this a poll every few seconds
    would almost always see an empty list even while things are actively running,
    which reads as "this doesn't work" rather than "it's just fast."
    """
    conn = get_conn()
    rows = conn.execute(
        "SELECT *, (julianday('now') - julianday(created_at)) * 86400 AS age_seconds "
        "FROM agent_log WHERE status = 'running' "
        "OR (status = 'done' AND (julianday('now') - julianday(created_at)) * 86400 < 8) "
        "ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def recent_agent_logs(limit=30):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM agent_log WHERE status = 'done' OR status IS NULL ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- receipts (cross-app evidence ledger) ---------------------------------------------------------

RECEIPTS_LIMIT = 2000


def insert_receipt(source, kind, summary, entity_id=None):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO receipts (source, kind, summary, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (source, kind, summary, entity_id, now_iso()),
    )
    keep_ids = [
        r["id"] for r in conn.execute(
            "SELECT id FROM receipts ORDER BY id DESC LIMIT ?", (RECEIPTS_LIMIT,)
        ).fetchall()
    ]
    if keep_ids:
        placeholders = ",".join("?" * len(keep_ids))
        conn.execute(f"DELETE FROM receipts WHERE id NOT IN ({placeholders})", keep_ids)
    conn.commit()
    receipt_id = cur.lastrowid
    row = conn.execute("SELECT * FROM receipts WHERE id = ?", (receipt_id,)).fetchone()
    conn.close()
    return dict(row)


def list_receipts(limit=50, date_prefix=None):
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, RECEIPTS_LIMIT))
    conn = get_conn()
    if date_prefix:
        rows = conn.execute(
            "SELECT * FROM receipts WHERE substr(created_at, 1, 10) = ? ORDER BY id DESC LIMIT ?",
            (date_prefix, limit),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM receipts ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_receipt(receipt_id):
    conn = get_conn()
    conn.execute("DELETE FROM receipts WHERE id = ?", (receipt_id,))
    conn.commit()
    conn.close()


# --- settings (About tab) ---------------------------------------------------------

def get_settings():
    conn = get_conn()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def is_api_enabled():
    """Kill switch: checked before every Anthropic API call. Off by nothing -- only
    disabled once you explicitly flip it via /api/usage/toggle.
    """
    return get_settings().get("api_enabled") != "false"


# Rough, hand-maintained USD per-million-token estimates -- not live pricing, just
# enough to see roughly where money is going. Update if you change models/pricing.
_PRICING = {
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-opus-4-8": (15.0, 75.0),
    "openai:gpt-5-mini": (0.25, 2.0),
    "openai:gpt-5-codex": (1.25, 10.0),
    "openai:gpt-5.5": (1.25, 10.0),
    "openai:gpt-5.5-mini": (0.25, 2.0),
    "openai:gpt-5.5-codex": (1.25, 10.0),
    # xAI Grok (USD per 1M tokens; short-context rates from x.ai pricing)
    "grok:grok-4.5": (2.0, 6.0),
    "grok:grok-4.3": (1.25, 2.5),
    "grok:grok-build-0.1": (1.0, 2.0),
}


def log_api_usage(model, input_tokens, output_tokens):
    conn = get_conn()
    conn.execute(
        "INSERT INTO api_usage (model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?)",
        (model, input_tokens, output_tokens, now_iso()),
    )
    conn.commit()
    conn.close()


def total_api_usage():
    conn = get_conn()
    rows = conn.execute(
        "SELECT model, SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok FROM api_usage GROUP BY model"
    ).fetchall()
    conn.close()
    total_tokens = 0
    total_cost = 0.0
    by_model = []
    for r in rows:
        in_price, out_price = _PRICING.get(r["model"], (3.0, 15.0))
        cost = (r["in_tok"] or 0) / 1_000_000 * in_price + (r["out_tok"] or 0) / 1_000_000 * out_price
        total_tokens += (r["in_tok"] or 0) + (r["out_tok"] or 0)
        total_cost += cost
        by_model.append({"model": r["model"], "input_tokens": r["in_tok"], "output_tokens": r["out_tok"], "estimated_cost_usd": round(cost, 4)})
    return {"total_tokens": total_tokens, "estimated_cost_usd": round(total_cost, 4), "by_model": by_model}


def save_settings(data):
    conn = get_conn()
    for key, value in data.items():
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
    conn.commit()
    conn.close()


# --- agent chat ---------------------------------------------------------

def _agent_conversation_row(conn, conversation_id):
    if conversation_id is None:
        return None
    row = conn.execute(
        "SELECT * FROM agent_conversations WHERE id = ?", (int(conversation_id),)
    ).fetchone()
    return dict(row) if row else None


def list_agent_conversations(limit=100):
    """Newest-talked-to first (updated_at DESC)."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT c.*,
               (SELECT COUNT(*) FROM agent_messages m WHERE m.conversation_id = c.id) AS message_count,
               (SELECT content FROM agent_messages m
                WHERE m.conversation_id = c.id AND m.role = 'user'
                ORDER BY m.id DESC LIMIT 1) AS last_user_preview
        FROM agent_conversations c
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT ?
        """,
        (int(limit),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_agent_conversation(conversation_id):
    conn = get_conn()
    row = _agent_conversation_row(conn, conversation_id)
    conn.close()
    return row


def create_agent_conversation(title="New chat"):
    conn = get_conn()
    ts = now_iso()
    label = (title or "New chat").strip() or "New chat"
    cur = conn.execute(
        "INSERT INTO agent_conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
        (label[:80], ts, ts),
    )
    cid = cur.lastrowid
    conn.commit()
    row = _agent_conversation_row(conn, cid)
    conn.close()
    return row


def ensure_agent_conversation(conversation_id=None):
    """Return a valid conversation id; create one if needed / id missing."""
    conn = get_conn()
    if conversation_id is not None:
        row = _agent_conversation_row(conn, conversation_id)
        if row:
            conn.close()
            return row["id"]
    latest = conn.execute(
        "SELECT id FROM agent_conversations ORDER BY updated_at DESC, id DESC LIMIT 1"
    ).fetchone()
    if latest:
        cid = latest["id"]
        conn.close()
        return cid
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO agent_conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
        ("New chat", ts, ts),
    )
    cid = cur.lastrowid
    conn.commit()
    conn.close()
    return cid


def ensure_agent_conversation_by_title(title):
    """Get or create a named conversation (e.g. Companion side-thread)."""
    label = (title or "Chat").strip() or "Chat"
    conn = get_conn()
    row = conn.execute(
        "SELECT id FROM agent_conversations WHERE title = ? ORDER BY id LIMIT 1",
        (label,),
    ).fetchone()
    if row:
        cid = row["id"]
        conn.close()
        return cid
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO agent_conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
        (label[:80], ts, ts),
    )
    cid = cur.lastrowid
    conn.commit()
    conn.close()
    return cid


def rename_agent_conversation(conversation_id, title):
    label = (title or "").strip()
    if not label:
        return get_agent_conversation(conversation_id)
    conn = get_conn()
    conn.execute(
        "UPDATE agent_conversations SET title = ? WHERE id = ?",
        (label[:80], int(conversation_id)),
    )
    conn.commit()
    row = _agent_conversation_row(conn, conversation_id)
    conn.close()
    return row


def touch_agent_conversation(conversation_id, at=None):
    conn = get_conn()
    conn.execute(
        "UPDATE agent_conversations SET updated_at = ? WHERE id = ?",
        (at or now_iso(), int(conversation_id)),
    )
    conn.commit()
    conn.close()


def delete_agent_conversation(conversation_id):
    """Delete one conversation and its messages. Ensures at least one chat remains."""
    cid = int(conversation_id)
    conn = get_conn()
    conn.execute("DELETE FROM agent_messages WHERE conversation_id = ?", (cid,))
    conn.execute("DELETE FROM agent_conversations WHERE id = ?", (cid,))
    remaining = conn.execute("SELECT COUNT(*) AS c FROM agent_conversations").fetchone()["c"]
    replacement = None
    if remaining == 0:
        ts = now_iso()
        cur = conn.execute(
            "INSERT INTO agent_conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
            ("New chat", ts, ts),
        )
        replacement = cur.lastrowid
    else:
        # Prefer a real Agent chat — never hand the picker the Companion thread.
        row = conn.execute(
            """SELECT id FROM agent_conversations
               WHERE COALESCE(title, '') != 'Companion'
               ORDER BY updated_at DESC, id DESC LIMIT 1"""
        ).fetchone()
        replacement = row["id"] if row else None
        # Companion may be the only survivor — open a fresh chat rather than that thread.
        if remaining > 0 and replacement is None:
            ts = now_iso()
            cur = conn.execute(
                "INSERT INTO agent_conversations (title, created_at, updated_at) VALUES (?, ?, ?)",
                ("New chat", ts, ts),
            )
            replacement = cur.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "deleted_id": cid, "active_id": replacement}


def maybe_autotitle_agent_conversation(conversation_id, user_message):
    """If still a default title, name the chat from the first user message."""
    conv = get_agent_conversation(conversation_id)
    if not conv:
        return None
    title = (conv.get("title") or "").strip().lower()
    if title not in ("new chat", "chat", "untitled", ""):
        return conv
    text = (user_message or "").strip()
    # Drop page-context / route prefixes the UI may prepend.
    text = re.sub(r"^\[.*?\]\s*", "", text, count=1)
    text = re.sub(r"^\[Route:[^\]]*\]\s*", "", text, count=1)
    snippet = " ".join(text.split())
    if not snippet:
        return conv
    if len(snippet) > 48:
        snippet = snippet[:47].rstrip() + "…"
    return rename_agent_conversation(conversation_id, snippet)


def insert_agent_message(role, content, conversation_id=None):
    cid = ensure_agent_conversation(conversation_id)
    ts = now_iso()
    conn = get_conn()
    conn.execute(
        "INSERT INTO agent_messages (role, content, created_at, conversation_id) VALUES (?, ?, ?, ?)",
        (role, content, ts, cid),
    )
    conn.execute(
        "UPDATE agent_conversations SET updated_at = ? WHERE id = ?",
        (ts, cid),
    )
    conn.commit()
    conn.close()
    return cid


def list_agent_messages(limit=50, conversation_id=None):
    cid = ensure_agent_conversation(conversation_id)
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM (
            SELECT * FROM agent_messages
            WHERE conversation_id = ?
            ORDER BY id DESC LIMIT ?
        ) ORDER BY id
        """,
        (cid, int(limit)),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_all_agent_messages(limit=200):
    """Across all conversations — for RAG/indexing, not chat context."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM (
            SELECT * FROM agent_messages ORDER BY id DESC LIMIT ?
        ) ORDER BY id
        """,
        (int(limit),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def clear_agent_messages(conversation_id=None):
    """Clear messages in one conversation (or all, if conversation_id is None — legacy)."""
    conn = get_conn()
    if conversation_id is None:
        conn.execute("DELETE FROM agent_messages")
    else:
        conn.execute(
            "DELETE FROM agent_messages WHERE conversation_id = ?",
            (int(conversation_id),),
        )
        conn.execute(
            "UPDATE agent_conversations SET updated_at = ? WHERE id = ?",
            (now_iso(), int(conversation_id)),
        )
    conn.commit()
    conn.close()


# --- pending actions (AI-proposed commands/file-edits awaiting your approval) ---------------------------------------------------------

def insert_pending_action(action_type, payload_json, risk_summary=None):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO pending_actions (action_type, payload, risk_summary, created_at) VALUES (?, ?, ?, ?)",
        (action_type, payload_json, risk_summary, now_iso()),
    )
    conn.commit()
    action_id = cur.lastrowid
    conn.close()
    return action_id


def list_pending_actions(status=None, limit=30):
    conn = get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM pending_actions WHERE status = ? ORDER BY id DESC LIMIT ?", (status, limit)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM pending_actions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_pending_action(action_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM pending_actions WHERE id = ?", (action_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def resolve_pending_action(action_id, status, output=None):
    conn = get_conn()
    conn.execute(
        "UPDATE pending_actions SET status = ?, output = ?, resolved_at = ? WHERE id = ?",
        (status, output, now_iso(), action_id),
    )
    conn.commit()
    conn.close()


# --- freeform lists: skills / problems / thinking ---------------------------------------------------------

def list_notes(list_type):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM notes_lists WHERE list_type = ? ORDER BY sort_order, id DESC", (list_type,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_note(note_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM notes_lists WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_note(list_type, title, body, source="human"):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO notes_lists (list_type, title, body, source, created_at) VALUES (?, ?, ?, ?, ?)",
        (list_type, title, body, source, now_iso()),
    )
    note_id = cur.lastrowid
    if list_type == "skill":
        conn.execute(
            "INSERT INTO skill_proficiency_history (skill_id, proficiency, recorded_at) VALUES (?, ?, ?)",
            (note_id, 5, now_iso()),
        )
    conn.commit()
    conn.close()
    return note_id


def delete_note(note_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM notes_lists WHERE id = ?", (note_id,)).fetchone()
    if row:
        record_deletion(conn, "note", dict(row), label=row["title"])
    conn.execute("DELETE FROM notes_lists WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()


def update_note(note_id, fields):
    allowed = {"title", "body"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_note(note_id)
    conn = get_conn()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(f"UPDATE notes_lists SET {set_clause} WHERE id = ?", (*updates.values(), note_id))
    conn.commit()
    conn.close()
    return get_note(note_id)


def set_note_status(note_id, status):
    conn = get_conn()
    conn.execute("UPDATE notes_lists SET status = ? WHERE id = ?", (status, note_id))
    conn.commit()
    conn.close()


def set_note_proficiency(note_id, proficiency):
    conn = get_conn()
    row = conn.execute(
        "SELECT proficiency, list_type FROM notes_lists WHERE id = ?", (note_id,)
    ).fetchone()
    conn.execute("UPDATE notes_lists SET proficiency = ? WHERE id = ?", (proficiency, note_id))
    if row and row["list_type"] == "skill" and row["proficiency"] != proficiency:
        conn.execute(
            "INSERT INTO skill_proficiency_history (skill_id, proficiency, recorded_at) VALUES (?, ?, ?)",
            (note_id, proficiency, now_iso()),
        )
    conn.commit()
    conn.close()


def skill_proficiency_trends():
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT skill_id, proficiency, recorded_at
        FROM skill_proficiency_history
        ORDER BY skill_id, id
        """
    ).fetchall()
    conn.close()
    result = {}
    for row in rows:
        result.setdefault(row["skill_id"], []).append({
            "proficiency": row["proficiency"],
            "recorded_at": row["recorded_at"],
        })
    return result


def latest_practice_attempts():
    """One latest row per game; cheap enough to decorate the small Skills list."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT p.*
        FROM practice_attempts p
        JOIN (
            SELECT game_key, MAX(id) AS latest_id
            FROM practice_attempts
            GROUP BY game_key
        ) latest ON latest.latest_id = p.id
        ORDER BY p.created_at DESC
        """
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def reorder_notes(ids):
    """Same pattern as reorder_tasks/reorder_projects; ids are scoped to a single list_type
    since that's the unit the Skills/Problems/Thinking/Funny/Essays tabs each drag within.
    """
    conn = get_conn()
    conn.executemany(
        "UPDATE notes_lists SET sort_order = ? WHERE id = ?",
        [(i, note_id) for i, note_id in enumerate(ids)],
    )
    conn.commit()
    conn.close()


# --- team members ---------------------------------------------------------

def list_team_members():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM team_members ORDER BY name COLLATE NOCASE").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_team_member(name, email, role):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO team_members (name, email, role, created_at) VALUES (?, ?, ?, ?)",
        (name, email, role, now_iso()),
    )
    conn.commit()
    member_id = cur.lastrowid
    conn.close()
    return member_id


def delete_team_member(member_id):
    conn = get_conn()
    conn.execute("DELETE FROM team_messages WHERE team_member_id = ?", (member_id,))
    conn.execute("DELETE FROM team_channel_members WHERE team_member_id = ?", (member_id,))
    conn.execute("DELETE FROM project_team_members WHERE team_member_id = ?", (member_id,))
    conn.execute("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?", (member_id,))
    conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    conn.commit()
    conn.close()


def update_team_member(member_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE team_members SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), member_id),
    )
    conn.commit()
    conn.close()


def list_team_messages(member_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM team_messages WHERE team_member_id = ? ORDER BY id ASC", (member_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_team_message(member_id, sender, body):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO team_messages (team_member_id, sender, body, created_at) VALUES (?, ?, ?, ?)",
        (member_id, sender, body, now_iso()),
    )
    conn.commit()
    msg_id = cur.lastrowid
    conn.close()
    return msg_id


# --- team channels (group chats) ---------------------------------------------------------

def list_team_channels():
    conn = get_conn()
    channels = [dict(r) for r in conn.execute("SELECT * FROM team_channels ORDER BY created_at DESC").fetchall()]
    links = conn.execute(
        "SELECT tcm.channel_id, tm.id, tm.name FROM team_channel_members tcm "
        "JOIN team_members tm ON tm.id = tcm.team_member_id"
    ).fetchall()
    conn.close()
    by_channel = {}
    for l in links:
        by_channel.setdefault(l["channel_id"], []).append({"id": l["id"], "name": l["name"]})
    for c in channels:
        c["members"] = by_channel.get(c["id"], [])
    return channels


def get_team_channel(channel_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM team_channels WHERE id = ?", (channel_id,)).fetchone()
    if not row:
        conn.close()
        return None
    channel = dict(row)
    members = conn.execute(
        "SELECT tm.id, tm.name FROM team_channel_members tcm "
        "JOIN team_members tm ON tm.id = tcm.team_member_id WHERE tcm.channel_id = ?",
        (channel_id,),
    ).fetchall()
    conn.close()
    channel["members"] = [dict(m) for m in members]
    return channel


def insert_team_channel(name, member_ids):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO team_channels (name, created_at) VALUES (?, ?)",
        (name, now_iso()),
    )
    channel_id = cur.lastrowid
    for member_id in member_ids:
        conn.execute(
            "INSERT OR IGNORE INTO team_channel_members (channel_id, team_member_id) VALUES (?, ?)",
            (channel_id, member_id),
        )
    conn.commit()
    conn.close()
    return channel_id


def delete_team_channel(channel_id):
    conn = get_conn()
    conn.execute("DELETE FROM team_channel_messages WHERE channel_id = ?", (channel_id,))
    conn.execute("DELETE FROM team_channel_members WHERE channel_id = ?", (channel_id,))
    conn.execute("DELETE FROM team_channels WHERE id = ?", (channel_id,))
    conn.commit()
    conn.close()


def add_channel_member(channel_id, member_id):
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO team_channel_members (channel_id, team_member_id) VALUES (?, ?)",
        (channel_id, member_id),
    )
    conn.commit()
    conn.close()


def remove_channel_member(channel_id, member_id):
    conn = get_conn()
    conn.execute(
        "DELETE FROM team_channel_members WHERE channel_id = ? AND team_member_id = ?",
        (channel_id, member_id),
    )
    conn.commit()
    conn.close()


def list_channel_messages(channel_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM team_channel_messages WHERE channel_id = ? ORDER BY id ASC", (channel_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_channel_message(channel_id, sender, body):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO team_channel_messages (channel_id, sender, body, created_at) VALUES (?, ?, ?, ?)",
        (channel_id, sender, body, now_iso()),
    )
    conn.commit()
    msg_id = cur.lastrowid
    conn.close()
    return msg_id


# --- workflows (visual node-graph automation) ---------------------------------------------------------

def list_workflows():
    conn = get_conn()
    rows = conn.execute("SELECT id, name, created_at, updated_at FROM workflows ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_workflow(workflow_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_workflow(name, graph_json):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO workflows (name, graph_json, created_at) VALUES (?, ?, ?)",
        (name, graph_json, now_iso()),
    )
    conn.commit()
    workflow_id = cur.lastrowid
    conn.close()
    return workflow_id


def update_workflow(workflow_id, graph_json=None, generated_code=None, name=None):
    fields = {}
    if graph_json is not None:
        fields["graph_json"] = graph_json
    if generated_code is not None:
        fields["generated_code"] = generated_code
    if name is not None:
        fields["name"] = name
    if not fields:
        return
    fields["updated_at"] = now_iso()
    conn = get_conn()
    conn.execute(
        f"UPDATE workflows SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), workflow_id),
    )
    conn.commit()
    conn.close()


def delete_workflow(workflow_id):
    conn = get_conn()
    conn.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
    conn.commit()
    conn.close()


# --- custom apps (workflow shortcuts on the home surface) ---------------------------------------------------------

def list_custom_apps():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM custom_apps ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_custom_app(app_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM custom_apps WHERE id = ?", (app_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_custom_app(name, emoji, workflow_id):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO custom_apps (name, emoji, workflow_id, created_at) VALUES (?, ?, ?, ?)",
        (name, emoji, workflow_id, now_iso()),
    )
    conn.commit()
    app_id = cur.lastrowid
    conn.close()
    return app_id


def delete_custom_app(app_id):
    conn = get_conn()
    conn.execute("DELETE FROM custom_apps WHERE id = ?", (app_id,))
    conn.commit()
    conn.close()


def _app_data_row(row):
    data = dict(row)
    return {
        "id": data["id"],
        "row": json.loads(data["row_json"]),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


def list_app_data(app_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM app_data WHERE app_id = ? ORDER BY id",
        (app_id,),
    ).fetchall()
    conn.close()
    return [_app_data_row(r) for r in rows]


def get_app_data_row(app_id, row_id):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM app_data WHERE app_id = ? AND id = ?",
        (app_id, row_id),
    ).fetchone()
    conn.close()
    return _app_data_row(row) if row else None


def insert_app_data(app_id, row):
    created = now_iso()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO app_data (app_id, row_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (app_id, json.dumps(row), created, created),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return get_app_data_row(app_id, row_id)


def update_app_data(app_id, row_id, row):
    conn = get_conn()
    conn.execute(
        "UPDATE app_data SET row_json = ?, updated_at = ? WHERE app_id = ? AND id = ?",
        (json.dumps(row), now_iso(), app_id, row_id),
    )
    conn.commit()
    conn.close()
    return get_app_data_row(app_id, row_id)


def delete_app_data(app_id, row_id):
    conn = get_conn()
    conn.execute("DELETE FROM app_data WHERE app_id = ? AND id = ?", (app_id, row_id))
    conn.commit()
    conn.close()


# --- attachments (files/images on tasks, Agent chat messages, etc.) ---------------------------------------------------------

def list_attachments(entity_type, entity_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY id",
        (entity_type, entity_id),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_attachment(attachment_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM attachments WHERE id = ?", (attachment_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_attachment(entity_type, entity_id, filename, stored_filename, content_type):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO attachments (entity_type, entity_id, filename, stored_filename, content_type, uploaded_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (entity_type, entity_id, filename, stored_filename, content_type, now_iso()),
    )
    conn.commit()
    attachment_id = cur.lastrowid
    conn.close()
    return attachment_id


def update_attachment_entity(attachment_id, entity_type, entity_id):
    conn = get_conn()
    conn.execute(
        "UPDATE attachments SET entity_type = ?, entity_id = ? WHERE id = ?",
        (entity_type, entity_id, attachment_id),
    )
    conn.commit()
    conn.close()


def delete_attachment(attachment_id):
    conn = get_conn()
    conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
    conn.commit()
    conn.close()


# --- field_history (version snapshots for rich-editable fields) ---------------------------------------------------------
# Generic, polymorphic like attachments: any (entity_type, entity_id, field_name) can be tracked.
# A snapshot is recorded of the OLD content right before a save overwrites it, so history holds
# prior versions, not the current one. Only the most recent FIELD_HISTORY_LIMIT snapshots are kept
# per (entity_type, entity_id, field_name) -- older ones are pruned on insert.

FIELD_HISTORY_LIMIT = 3


def list_field_history(entity_type, entity_id, field_name):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM field_history WHERE entity_type = ? AND entity_id = ? AND field_name = ? "
        "ORDER BY id DESC LIMIT ?",
        (entity_type, entity_id, field_name, FIELD_HISTORY_LIMIT),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def record_field_history(entity_type, entity_id, field_name, content):
    """Snapshot `content` (the value about to be overwritten) then prune to the most recent
    FIELD_HISTORY_LIMIT snapshots for this (entity_type, entity_id, field_name)."""
    conn = get_conn()
    conn.execute(
        "INSERT INTO field_history (entity_type, entity_id, field_name, content, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (entity_type, entity_id, field_name, content, now_iso()),
    )
    keep_ids = [
        r["id"] for r in conn.execute(
            "SELECT id FROM field_history WHERE entity_type = ? AND entity_id = ? AND field_name = ? "
            "ORDER BY id DESC LIMIT ?",
            (entity_type, entity_id, field_name, FIELD_HISTORY_LIMIT),
        ).fetchall()
    ]
    if keep_ids:
        placeholders = ",".join("?" * len(keep_ids))
        conn.execute(
            "DELETE FROM field_history WHERE entity_type = ? AND entity_id = ? AND field_name = ? "
            f"AND id NOT IN ({placeholders})",
            (entity_type, entity_id, field_name, *keep_ids),
        )
    conn.commit()
    conn.close()


# --- deleted_items (undo-delete) ---------------------------------------------------------
# From claude_notes ("if i accidentally delete a big selection it still saved somewhere") and a
# direct follow-up instruction to build real undo for deletes. Snapshots the FULL row as JSON
# right before a delete removes it, so it can be restored later. Calendar events go through
# record_deletion() the same way as tasks. Restoring brings back the row itself, not
# cascade-deleted side data like attachments/notes/similarity-scan-results tied to it.

DELETED_ITEMS_LIMIT = 50
RESTORE_TABLES = {
    "task": "tasks",
    "project": "projects",
    "idea": "ideas",
    "note": "notes_lists",
    "contact": "contacts",
    "competition": "competitions",
    "customer": "customers",
    "saved_link": "saved_links",
    "class": "classes",
    "goal_coach_quest": "goal_coach_quests",
    "calendar_event": "calendar_events",
}


def record_deletion(conn, entity_type, row, label=None):
    """Call with the SAME connection the caller's delete already opened (not a fresh one) --
    this runs as part of that same delete transaction rather than a separate connection, which
    matters under Flask's threaded=True. `row` is the full dict of the record about to be deleted.
    """
    conn.execute(
        "INSERT INTO deleted_items (entity_type, original_id, label, data_json, deleted_at) VALUES (?, ?, ?, ?, ?)",
        (entity_type, row["id"], label, json.dumps(row), now_iso()),
    )
    keep_ids = [r["id"] for r in conn.execute(
        "SELECT id FROM deleted_items ORDER BY id DESC LIMIT ?", (DELETED_ITEMS_LIMIT,)
    ).fetchall()]
    if keep_ids:
        placeholders = ",".join("?" * len(keep_ids))
        conn.execute(f"DELETE FROM deleted_items WHERE id NOT IN ({placeholders})", keep_ids)


def list_trash(limit=20):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, entity_type, original_id, label, deleted_at FROM deleted_items ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def restore_deletion(trash_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM deleted_items WHERE id = ?", (trash_id,)).fetchone()
    if not row:
        conn.close()
        return None
    table = RESTORE_TABLES.get(row["entity_type"])
    if not table:
        conn.close()
        return None
    data = json.loads(row["data_json"])
    cols = list(data.keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    conn.execute(f"INSERT OR REPLACE INTO {table} ({col_list}) VALUES ({placeholders})", [data[c] for c in cols])
    conn.execute("DELETE FROM deleted_items WHERE id = ?", (trash_id,))
    conn.commit()
    conn.close()
    return {"entity_type": row["entity_type"], "id": row["original_id"]}


# --- Practice tab (cognitive drills minigames) ---------------------------------------------------------
# From claude_notes' minigame wishlist -- Category A ("Cognitive drills") of the spec in
# Project Plan.md. Difficulty is a single persisted integer per game_key: each attempt scoring
# >=80% bumps it up, <40% drops it (floor 1), matching the "win -> harder, lose -> easier" trophy
# ask. Zero-cost by design -- everything here is generated in Python, no AI calls.

PRACTICE_DIFFICULTY_MIN = 1
PRACTICE_DIFFICULTY_MAX = 10


def get_practice_difficulty(game_key):
    conn = get_conn()
    row = conn.execute("SELECT level FROM practice_difficulty WHERE game_key = ?", (game_key,)).fetchone()
    conn.close()
    return row["level"] if row else PRACTICE_DIFFICULTY_MIN


def _adjust_practice_difficulty(conn, game_key, score, max_score):
    current = conn.execute(
        "SELECT level FROM practice_difficulty WHERE game_key = ?", (game_key,)
    ).fetchone()
    level = current["level"] if current else PRACTICE_DIFFICULTY_MIN
    ratio = (score / max_score) if max_score else 0
    if ratio >= 0.8:
        level = min(PRACTICE_DIFFICULTY_MAX, level + 1)
    elif ratio < 0.4:
        level = max(PRACTICE_DIFFICULTY_MIN, level - 1)
    conn.execute(
        "INSERT INTO practice_difficulty (game_key, level) VALUES (?, ?) "
        "ON CONFLICT(game_key) DO UPDATE SET level = excluded.level",
        (game_key, level),
    )
    return level


def record_practice_attempt(game_key, score, max_score, difficulty, details=None):
    conn = get_conn()
    conn.execute(
        "INSERT INTO practice_attempts (game_key, score, max_score, difficulty, details_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (game_key, score, max_score, difficulty, json.dumps(details) if details is not None else None, now_iso()),
    )
    new_level = _adjust_practice_difficulty(conn, game_key, score, max_score)
    conn.commit()
    conn.close()
    return new_level


def practice_leaderboard():
    """Best (score/max_score) attempt per game, plus how many times each has been played."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT game_key,
               MAX(CAST(score AS REAL) / NULLIF(max_score, 0)) AS best_ratio,
               COUNT(*) AS attempts
        FROM practice_attempts
        GROUP BY game_key
        """
    ).fetchall()
    conn.close()
    return {r["game_key"]: {"best_ratio": r["best_ratio"], "attempts": r["attempts"]} for r in rows}


def list_practice_attempts(game_key, limit=10):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM practice_attempts WHERE game_key = ? ORDER BY id DESC LIMIT ?",
        (game_key, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_longterm_fact(fact, due_at):
    conn = get_conn()
    conn.execute(
        "INSERT INTO practice_longterm (fact, created_at, due_at) VALUES (?, ?, ?)",
        (fact, now_iso(), due_at),
    )
    conn.commit()
    conn.close()


def get_due_longterm_fact():
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM practice_longterm WHERE status = 'pending' AND due_at <= ? ORDER BY due_at LIMIT 1",
        (now_iso(),),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def count_pending_longterm():
    conn = get_conn()
    n = conn.execute("SELECT COUNT(*) FROM practice_longterm WHERE status = 'pending'").fetchone()[0]
    conn.close()
    return n


def mark_longterm_done(fact_id):
    conn = get_conn()
    conn.execute("UPDATE practice_longterm SET status = 'recalled' WHERE id = ?", (fact_id,))
    conn.commit()
    conn.close()


def practice_totals():
    """Duolingo-ish meta-stats: points = sum(score/max * 10 * difficulty) across all attempts;
    streak = consecutive calendar days (ending today or yesterday) with at least one attempt."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT score, max_score, difficulty, substr(created_at, 1, 10) AS day FROM practice_attempts"
    ).fetchall()
    conn.close()
    points = sum((r["score"] / r["max_score"]) * 10 * r["difficulty"] for r in rows if r["max_score"])
    days = sorted({r["day"] for r in rows}, reverse=True)
    from datetime import date, timedelta
    streak = 0
    cursor = date.today()
    day_set = set(days)
    if str(cursor) not in day_set and str(cursor - timedelta(days=1)) in day_set:
        cursor -= timedelta(days=1)
    while str(cursor) in day_set:
        streak += 1
        cursor -= timedelta(days=1)
    return {"points": round(points), "streak": streak, "total_attempts": len(rows)}


_UNSEEN_AVG_RATIO = 0.55


# --- Practice reviews (AI Trainer neural_net_fix deep-dive history) ----------

def _ensure_practice_reviews_table():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS practice_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_key TEXT NOT NULL,
            model_key TEXT NOT NULL,
            difficulty INTEGER NOT NULL,
            challenge TEXT NOT NULL,
            user_answer TEXT NOT NULL,
            score REAL NOT NULL,
            max_score REAL NOT NULL,
            feedback TEXT NOT NULL,
            detailed_review TEXT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    review_cols = {row["name"] for row in conn.execute("PRAGMA table_info(practice_reviews)").fetchall()}
    if "reference" not in review_cols:
        conn.execute("ALTER TABLE practice_reviews ADD COLUMN reference TEXT")
    conn.commit()
    conn.close()


def insert_practice_review(game_key, model_key, difficulty, challenge, user_answer,
                           score, max_score, feedback, reference=""):
    _ensure_practice_reviews_table()
    conn = get_conn()
    cur = conn.execute(
        """
        INSERT INTO practice_reviews
            (game_key, model_key, difficulty, challenge, user_answer, score, max_score, feedback, reference, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (game_key, model_key, difficulty, challenge, user_answer, score, max_score, feedback, reference, now_iso()),
    )
    conn.commit()
    review_id = cur.lastrowid
    conn.close()
    return review_id


def list_practice_reviews(game_key=None, model_key=None, limit=30):
    _ensure_practice_reviews_table()
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 30
    limit = max(1, min(limit, 200))
    conn = get_conn()
    query = "SELECT * FROM practice_reviews WHERE 1=1"
    params = []
    if game_key:
        query += " AND game_key = ?"
        params.append(game_key)
    if model_key:
        query += " AND model_key = ?"
        params.append(model_key)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_practice_review(review_id):
    _ensure_practice_reviews_table()
    conn = get_conn()
    row = conn.execute("SELECT * FROM practice_reviews WHERE id = ?", (review_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_practice_review_detailed(review_id, detailed_review):
    _ensure_practice_reviews_table()
    conn = get_conn()
    conn.execute(
        "UPDATE practice_reviews SET detailed_review = ? WHERE id = ?",
        (detailed_review, review_id),
    )
    conn.commit()
    conn.close()


def practice_review_model_stats(game_key="neural_net_fix"):
    """Per-model_key avg score ratio and attempt count from practice_reviews."""
    _ensure_practice_reviews_table()
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT model_key,
               COUNT(*) AS attempts,
               AVG(CAST(score AS REAL) / NULLIF(max_score, 0)) AS avg_ratio,
               AVG(score) AS avg_score
        FROM practice_reviews
        WHERE game_key = ?
        GROUP BY model_key
        """,
        (game_key,),
    ).fetchall()
    conn.close()
    return {
        r["model_key"]: {
            "attempts": r["attempts"],
            "avg_ratio": r["avg_ratio"] if r["avg_ratio"] is not None else _UNSEEN_AVG_RATIO,
            "avg_score": round(r["avg_score"], 2) if r["avg_score"] is not None else None,
        }
        for r in rows
    }


def bump_practice_difficulty(game_key, score, max_score):
    """Adjust persisted difficulty for an arbitrary game_key (incl. composite keys)."""
    conn = get_conn()
    new_level = _adjust_practice_difficulty(conn, game_key, score, max_score)
    conn.commit()
    conn.close()
    return new_level


# --- Hub tab (saved links / reading list) ---------------------------------------------------------

def list_saved_links(kind=None, status=None):
    conn = get_conn()
    query = "SELECT * FROM saved_links WHERE 1=1"
    params = []
    if kind:
        query += " AND kind = ?"
        params.append(kind)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_saved_link(link_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM saved_links WHERE id = ?", (link_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_saved_link(url=None, title="", note="", kind="later", status="open"):
    conn = get_conn()
    cur = conn.execute(
        """
        INSERT INTO saved_links (url, title, note, kind, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (url or "", title or "", note or "", kind, status, now_iso()),
    )
    conn.commit()
    link_id = cur.lastrowid
    conn.close()
    return link_id


def update_saved_link(link_id, **fields):
    if not fields:
        return
    conn = get_conn()
    conn.execute(
        f"UPDATE saved_links SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
        (*fields.values(), link_id),
    )
    conn.commit()
    conn.close()


def delete_saved_link(link_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM saved_links WHERE id = ?", (link_id,)).fetchone()
    if row:
        record_deletion(conn, "saved_link", dict(row), label=row["title"] or row["url"] or "link")
    conn.execute("DELETE FROM saved_links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()


# --- mood pulses (intraday happiness check-ins) ---------------------------------------------------------

MOOD_PULSE_DAILY_LIMIT = 6
MOOD_PULSE_COOLDOWN_MINUTES = 120


def insert_mood_pulse(happiness, note=None, energy=None):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO mood_pulses (created_at, happiness, note, energy) VALUES (?, ?, ?, ?)",
        (now_iso(), happiness, note, energy),
    )
    conn.commit()
    pulse_id = cur.lastrowid
    row = conn.execute("SELECT * FROM mood_pulses WHERE id = ?", (pulse_id,)).fetchone()
    conn.close()
    return dict(row)


def get_mood_pulse(pulse_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM mood_pulses WHERE id = ?", (pulse_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_mood_pulse_details(pulse_id, energy=None, note=None, clear_energy=False, clear_note=False):
    """Update energy/note on an existing pulse. Happiness is immutable after insert."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM mood_pulses WHERE id = ?", (pulse_id,)).fetchone()
    if not row:
        conn.close()
        return None
    new_energy = None if clear_energy else (energy if energy is not None else row["energy"])
    new_note = None if clear_note else (note if note is not None else row["note"])
    conn.execute(
        "UPDATE mood_pulses SET energy = ?, note = ? WHERE id = ?",
        (new_energy, new_note, pulse_id),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM mood_pulses WHERE id = ?", (pulse_id,)).fetchone()
    conn.close()
    return dict(updated) if updated else None


def list_mood_pulses(date_prefix=None):
    conn = get_conn()
    if date_prefix:
        rows = conn.execute(
            "SELECT * FROM mood_pulses WHERE substr(created_at, 1, 10) = ? ORDER BY created_at",
            (date_prefix,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM mood_pulses ORDER BY created_at").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def pulses_today_count():
    today = datetime.now(timezone.utc).date().isoformat()
    conn = get_conn()
    n = conn.execute(
        "SELECT COUNT(*) FROM mood_pulses WHERE substr(created_at, 1, 10) = ?",
        (today,),
    ).fetchone()[0]
    conn.close()
    return n


def last_pulse_time():
    conn = get_conn()
    row = conn.execute(
        "SELECT created_at FROM mood_pulses ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return row["created_at"] if row else None


def mood_pulses_summary(days=30):
    """Per-day average happiness and pulse count for the last `days` calendar days (UTC)."""
    from datetime import date, timedelta

    end = date.today()
    start = end - timedelta(days=max(days - 1, 0))
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT substr(created_at, 1, 10) AS day,
               AVG(happiness) AS avg_happiness,
               COUNT(*) AS count
        FROM mood_pulses
        WHERE substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
        GROUP BY day
        ORDER BY day
        """,
        (start.isoformat(), end.isoformat()),
    ).fetchall()
    conn.close()
    return [
        {
            "date": r["day"],
            "avg_happiness": round(r["avg_happiness"], 2) if r["avg_happiness"] is not None else None,
            "count": r["count"],
        }
        for r in rows
    ]


# --- Parallel roleplay (persistent world state + journal) -------------------------

def rp_get_state():
    conn = get_conn()
    row = conn.execute("SELECT state_json FROM rp_state WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return None
    return json.loads(row["state_json"])


def rp_save_state(state):
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO rp_state (id, state_json, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
        """,
        (json.dumps(state), now_iso()),
    )
    conn.commit()
    conn.close()


def rp_add_message(role, content, world_date=None):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO rp_messages (role, content, world_date, created_at) VALUES (?, ?, ?, ?)",
        (role, content, world_date, now_iso()),
    )
    conn.commit()
    msg_id = cur.lastrowid
    conn.close()
    return msg_id


def rp_recent_messages(limit=50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM (SELECT * FROM rp_messages ORDER BY id DESC LIMIT ?) ORDER BY id",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rp_add_journal(world_date, entry, kind="event"):
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO rp_journal (world_date, entry, kind, created_at) VALUES (?, ?, ?, ?)",
        (world_date, entry, kind, now_iso()),
    )
    conn.commit()
    entry_id = cur.lastrowid
    conn.close()
    return entry_id


def rp_journal_for(world_date):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM rp_journal WHERE world_date = ? ORDER BY id",
        (world_date,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rp_recent_journal(limit=30):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM rp_journal ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Parallel scene illustrations (append-only migration) ---------------------

_PRICING["openai:gpt-image-1"] = (10.0, 10.0)  # 4000 proxy tokens ≈ $0.04/image at this rate

_RP_SCENES_DAILY_CAP = 24  # informational; enforcement lives in parallel_life.SCENES_DAILY_CAP


def _ensure_rp_scenes_table():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rp_scenes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL UNIQUE,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def rp_get_message(message_id):
    _ensure_rp_scenes_table()
    conn = get_conn()
    row = conn.execute("SELECT * FROM rp_messages WHERE id = ?", (message_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def rp_last_message_id():
    conn = get_conn()
    row = conn.execute("SELECT id FROM rp_messages ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return row["id"] if row else None


def rp_scene_for_message(message_id):
    _ensure_rp_scenes_table()
    conn = get_conn()
    row = conn.execute("SELECT * FROM rp_scenes WHERE message_id = ?", (message_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def rp_save_scene(message_id, path):
    _ensure_rp_scenes_table()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO rp_scenes (message_id, path, created_at) VALUES (?, ?, ?)",
        (message_id, path, now_iso()),
    )
    conn.commit()
    scene_id = cur.lastrowid
    conn.close()
    return scene_id


def rp_scenes_today_count():
    _ensure_rp_scenes_table()
    today = datetime.now(timezone.utc).date().isoformat()
    conn = get_conn()
    n = conn.execute(
        "SELECT COUNT(*) FROM rp_scenes WHERE substr(created_at, 1, 10) = ?",
        (today,),
    ).fetchone()[0]
    conn.close()
    return n


def rp_list_scenes():
    _ensure_rp_scenes_table()
    conn = get_conn()
    rows = conn.execute("SELECT message_id, path, created_at FROM rp_scenes ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rp_recent_messages_with_scenes(limit=50):
    _ensure_rp_scenes_table()
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT m.*, CASE WHEN s.message_id IS NOT NULL THEN 1 ELSE 0 END AS has_scene
        FROM (SELECT * FROM rp_messages ORDER BY id DESC LIMIT ?) m
        LEFT JOIN rp_scenes s ON s.message_id = m.id
        ORDER BY m.id
        """,
        (limit,),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["has_scene"] = bool(d.pop("has_scene", 0))
        result.append(d)
    return result


# --- Coin ledger (Parallel spends; balance = practice points + ledger sum) ----

def _ensure_coin_ledger_table():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS coin_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def coin_ledger_insert(delta, reason):
    _ensure_coin_ledger_table()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO coin_ledger (delta, reason, created_at) VALUES (?, ?, ?)",
        (int(delta), reason, now_iso()),
    )
    conn.commit()
    entry_id = cur.lastrowid
    conn.close()
    return entry_id


def coin_ledger_sum():
    _ensure_coin_ledger_table()
    conn = get_conn()
    row = conn.execute("SELECT COALESCE(SUM(delta), 0) AS total FROM coin_ledger").fetchone()
    conn.close()
    return int(row["total"]) if row else 0


def coin_ledger_recent(limit=20):
    _ensure_coin_ledger_table()
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, delta, reason, created_at FROM coin_ledger ORDER BY id DESC LIMIT ?",
        (int(limit),),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _migrate_wallet_spends_to_coin_ledger():
    """One-time: copy non-practice wallet debits into coin_ledger."""
    _ensure_wallet_table()
    _ensure_coin_ledger_table()
    conn = get_conn()
    if conn.execute("SELECT 1 FROM coin_ledger LIMIT 1").fetchone():
        conn.close()
        return
    rows = conn.execute(
        "SELECT amount, reason, created_at FROM wallet_transactions WHERE source != 'practice' ORDER BY id"
    ).fetchall()
    for row in rows:
        conn.execute(
            "INSERT INTO coin_ledger (delta, reason, created_at) VALUES (?, ?, ?)",
            (int(row["amount"]), row["reason"], row["created_at"]),
        )
    conn.commit()
    conn.close()


# --- Wallet (legacy facade; spends alias coin_ledger) -----------------------

def _ensure_wallet_table():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount INTEGER NOT NULL,
            reason TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def wallet_insert(amount, reason, source):
    """Record a wallet transaction. Non-practice deltas also go to coin_ledger."""
    _ensure_wallet_table()
    amount = int(amount)
    created = now_iso()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO wallet_transactions (amount, reason, source, created_at) VALUES (?, ?, ?, ?)",
        (amount, reason, source, created),
    )
    conn.commit()
    tx_id = cur.lastrowid
    conn.close()
    if source != "practice":
        coin_ledger_insert(amount, reason)
    return tx_id


def wallet_balance():
    _ensure_wallet_table()
    conn = get_conn()
    row = conn.execute("SELECT COALESCE(SUM(amount), 0) AS bal FROM wallet_transactions").fetchone()
    conn.close()
    return int(row["bal"]) if row else 0


def wallet_recent(n=20):
    _ensure_wallet_table()
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, amount, reason, source, created_at FROM wallet_transactions ORDER BY id DESC LIMIT ?",
        (n,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def wallet_has_transactions():
    _ensure_wallet_table()
    conn = get_conn()
    row = conn.execute("SELECT 1 FROM wallet_transactions LIMIT 1").fetchone()
    conn.close()
    return row is not None


# --- Parallel character portraits (append-only migration) -------------------

def _ensure_rp_portraits_table():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rp_portraits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id TEXT NOT NULL UNIQUE,
            path TEXT NOT NULL,
            prompt_hash TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    portrait_cols = {row["name"] for row in conn.execute("PRAGMA table_info(rp_portraits)").fetchall()}
    if "prompt_hash" not in portrait_cols:
        conn.execute("ALTER TABLE rp_portraits ADD COLUMN prompt_hash TEXT")
    conn.commit()
    conn.close()


def rp_portrait_for_character(character_id):
    _ensure_rp_portraits_table()
    conn = get_conn()
    row = conn.execute("SELECT * FROM rp_portraits WHERE character_id = ?", (character_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def rp_save_portrait(character_id, path, prompt_hash=None):
    _ensure_rp_portraits_table()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO rp_portraits (character_id, path, prompt_hash, created_at) VALUES (?, ?, ?, ?)",
        (character_id, path, prompt_hash, now_iso()),
    )
    conn.commit()
    portrait_id = cur.lastrowid
    conn.close()
    return portrait_id


def rp_update_portrait(character_id, path, prompt_hash=None):
    _ensure_rp_portraits_table()
    conn = get_conn()
    conn.execute(
        "UPDATE rp_portraits SET path = ?, prompt_hash = ?, created_at = ? WHERE character_id = ?",
        (path, prompt_hash, now_iso(), character_id),
    )
    conn.commit()
    conn.close()


def rp_list_portraits():
    _ensure_rp_portraits_table()
    conn = get_conn()
    rows = conn.execute("SELECT character_id, path, created_at FROM rp_portraits ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rp_portraits_today_count():
    _ensure_rp_portraits_table()
    today = datetime.now(timezone.utc).date().isoformat()
    conn = get_conn()
    n = conn.execute(
        "SELECT COUNT(*) FROM rp_portraits WHERE substr(created_at, 1, 10) = ?",
        (today,),
    ).fetchone()[0]
    conn.close()
    return n


def rp_images_today_count():
    """Shared daily cap for scene + portrait + item image generation."""
    return rp_scenes_today_count() + rp_portraits_today_count() + rp_items_today_count()


# --- Parallel item illustrations (append-only migration) --------------------

def _ensure_rp_items_table():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rp_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL UNIQUE,
            path TEXT NOT NULL,
            prompt_hash TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    item_cols = {row["name"] for row in conn.execute("PRAGMA table_info(rp_items)").fetchall()}
    if "prompt_hash" not in item_cols:
        conn.execute("ALTER TABLE rp_items ADD COLUMN prompt_hash TEXT")
    conn.commit()
    conn.close()


def rp_item_for_id(item_id):
    _ensure_rp_items_table()
    conn = get_conn()
    row = conn.execute("SELECT * FROM rp_items WHERE item_id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def rp_save_item(item_id, path, prompt_hash=None):
    _ensure_rp_items_table()
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO rp_items (item_id, path, prompt_hash, created_at) VALUES (?, ?, ?, ?)",
        (item_id, path, prompt_hash, now_iso()),
    )
    conn.commit()
    item_row_id = cur.lastrowid
    conn.close()
    return item_row_id


def rp_update_item(item_id, path, prompt_hash=None):
    _ensure_rp_items_table()
    conn = get_conn()
    conn.execute(
        "UPDATE rp_items SET path = ?, prompt_hash = ?, created_at = ? WHERE item_id = ?",
        (path, prompt_hash, now_iso(), item_id),
    )
    conn.commit()
    conn.close()


def rp_list_items():
    _ensure_rp_items_table()
    conn = get_conn()
    rows = conn.execute("SELECT item_id, path, created_at FROM rp_items ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rp_items_today_count():
    _ensure_rp_items_table()
    today = datetime.now(timezone.utc).date().isoformat()
    conn = get_conn()
    n = conn.execute(
        "SELECT COUNT(*) FROM rp_items WHERE substr(created_at, 1, 10) = ?",
        (today,),
    ).fetchone()[0]
    conn.close()
    return n


# --- Repository dump (local file store + RAG) ---------------------------------

CONVERSATIONS_LIMIT = 5000


def insert_repo_file(filename, stored_path, mime, size, category, summary, extracted_text, word_count):
    conn = get_conn()
    cur = conn.execute(
        """
        INSERT INTO repo_files
            (filename, stored_path, mime, size, category, summary, extracted_text, word_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (filename, stored_path, mime, size, category, summary, extracted_text or "", word_count, now_iso()),
    )
    conn.commit()
    file_id = cur.lastrowid
    row = conn.execute("SELECT * FROM repo_files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    return dict(row)


def list_repo_files(category=None):
    conn = get_conn()
    if category:
        rows = conn.execute(
            "SELECT * FROM repo_files WHERE category = ? ORDER BY created_at DESC",
            (category,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM repo_files ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_repo_file(file_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM repo_files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_repo_file(file_id):
    conn = get_conn()
    conn.execute("DELETE FROM repo_files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()


def set_repo_file_category(file_id, category):
    conn = get_conn()
    conn.execute("UPDATE repo_files SET category = ? WHERE id = ?", (category, file_id))
    conn.commit()
    conn.close()


def rename_repo_file(file_id, filename):
    conn = get_conn()
    conn.execute("UPDATE repo_files SET filename = ? WHERE id = ?", (filename, file_id))
    conn.commit()
    conn.close()


def set_repo_file_summary(file_id, summary):
    conn = get_conn()
    conn.execute("UPDATE repo_files SET summary = ? WHERE id = ?", (summary, file_id))
    conn.commit()
    conn.close()


def list_repo_categories():
    conn = get_conn()
    rows = conn.execute(
        "SELECT category AS name, COUNT(*) AS count FROM repo_files GROUP BY category ORDER BY count DESC, category"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def repo_file_count():
    conn = get_conn()
    n = conn.execute("SELECT COUNT(*) FROM repo_files").fetchone()[0]
    conn.close()
    return n


def repo_total_words():
    conn = get_conn()
    n = conn.execute("SELECT COALESCE(SUM(word_count), 0) FROM repo_files").fetchone()[0]
    conn.close()
    return int(n)


def record_conversation(source, role, content):
    conn = get_conn()
    conn.execute(
        "INSERT INTO conversations (source, role, content, created_at) VALUES (?, ?, ?, ?)",
        (source, role, content, now_iso()),
    )
    keep_ids = [
        r["id"] for r in conn.execute(
            "SELECT id FROM conversations ORDER BY id DESC LIMIT ?", (CONVERSATIONS_LIMIT,)
        ).fetchall()
    ]
    if keep_ids:
        placeholders = ",".join("?" * len(keep_ids))
        conn.execute(f"DELETE FROM conversations WHERE id NOT IN ({placeholders})", keep_ids)
    conn.commit()
    conn.close()


def list_conversations(source=None, limit=50, since=None):
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 500))
    conn = get_conn()
    query = "SELECT * FROM conversations WHERE 1=1"
    params = []
    if source:
        query += " AND source = ?"
        params.append(source)
    if since:
        query += " AND created_at >= ?"
        params.append(since)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def conversation_sources():
    conn = get_conn()
    rows = conn.execute(
        "SELECT source, COUNT(*) AS count FROM conversations GROUP BY source ORDER BY count DESC, source"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Automation rules
# ---------------------------------------------------------------------------

def list_automation_rules():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM automation_rules ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_automation_rule(rule_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM automation_rules WHERE id = ?", (rule_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def insert_automation_rule(name, trigger_type, condition, actions, ai_mode="none", enabled=True):
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO automation_rules
           (name, enabled, trigger_type, condition_json, actions_json, ai_mode, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            name,
            1 if enabled else 0,
            trigger_type,
            json.dumps(condition) if isinstance(condition, dict) else condition,
            json.dumps(actions) if isinstance(actions, list) else actions,
            ai_mode,
            now_iso(),
        ),
    )
    conn.commit()
    rule_id = cur.lastrowid
    conn.close()
    return rule_id


def update_automation_rule(rule_id, **fields):
    allowed = {"name", "enabled", "trigger_type", "condition_json", "actions_json", "ai_mode"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    updates["updated_at"] = now_iso()
    conn = get_conn()
    conn.execute(
        f"UPDATE automation_rules SET {', '.join(f'{k} = ?' for k in updates)} WHERE id = ?",
        (*updates.values(), rule_id),
    )
    conn.commit()
    conn.close()


def set_automation_rule_enabled(rule_id, enabled):
    conn = get_conn()
    conn.execute(
        "UPDATE automation_rules SET enabled = ?, updated_at = ? WHERE id = ?",
        (1 if enabled else 0, now_iso(), rule_id),
    )
    conn.commit()
    conn.close()


def delete_automation_rule(rule_id):
    conn = get_conn()
    conn.execute("DELETE FROM automation_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()


def touch_automation_rule_run(rule_id, error=None):
    conn = get_conn()
    conn.execute(
        "UPDATE automation_rules SET last_run_at = ?, last_error = ? WHERE id = ?",
        (now_iso(), error, rule_id),
    )
    conn.commit()
    conn.close()


# --- Activity log -------------------------------------------------------------
# "Save as much as possible, but not storage-intensive." The compromise: keep only short
# textual fields, collapse immediate repeats into a counter, and prune on a schedule.
ACTIVITY_DETAIL_MAX = 400
ACTIVITY_LABEL_MAX = 120
ACTIVITY_KEEP_DAYS = 180
ACTIVITY_MAX_ROWS = 80000
ACTIVITY_COALESCE_SECONDS = 900
ACTIVITY_KINDS = ("nav", "action", "text", "search", "session")


def log_activity_batch(events):
    """Record client activity. Returns how many rows were written (repeats collapse).

    Coalescing matters more than it looks: bouncing between two tabs all afternoon is the
    single most common pattern, and one row per bounce would dwarf every other table.
    """
    if not events:
        return 0
    conn = get_conn()
    written = 0
    now = now_iso()
    for event in events:
        if not isinstance(event, dict):
            continue
        kind = (event.get("kind") or "").strip().lower()
        if kind not in ACTIVITY_KINDS:
            continue
        tab = (event.get("tab") or "").strip()[:ACTIVITY_LABEL_MAX]
        label = (event.get("label") or "").strip()[:ACTIVITY_LABEL_MAX]
        detail = (event.get("detail") or "").strip()[:ACTIVITY_DETAIL_MAX]
        stamp = (event.get("at") or "").strip() or now

        prev = conn.execute(
            "SELECT id, updated_at, repeats FROM activity_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        same = (
            prev
            and prev["updated_at"]
            and conn.execute(
                "SELECT 1 FROM activity_log WHERE id = ? AND kind = ? AND IFNULL(tab,'') = ? "
                "AND IFNULL(label,'') = ? AND IFNULL(detail,'') = ?",
                (prev["id"], kind, tab, label, detail),
            ).fetchone()
        )
        if same:
            conn.execute(
                "UPDATE activity_log SET repeats = repeats + 1, updated_at = ? WHERE id = ?",
                (stamp, prev["id"]),
            )
            continue
        conn.execute(
            "INSERT INTO activity_log (kind, tab, label, detail, repeats, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 1, ?, ?)",
            (kind, tab, label, detail, stamp, stamp),
        )
        written += 1
    conn.commit()
    conn.close()
    return written


def list_activity(limit=200, kind=None, since=None):
    conn = get_conn()
    sql = "SELECT * FROM activity_log"
    clauses, params = [], []
    if kind:
        clauses.append("kind = ?")
        params.append(kind)
    if since:
        clauses.append("created_at >= ?")
        params.append(since)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(int(limit))
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


API_USAGE_KEEP_DAYS = 90
API_USAGE_MAX_ROWS = 20000
AGENT_LOG_KEEP_DAYS = 90
AGENT_LOG_MAX_ROWS = 8000


def prune_api_usage(keep_days=API_USAGE_KEEP_DAYS, max_rows=API_USAGE_MAX_ROWS):
    conn = get_conn()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=keep_days)).isoformat()
    removed = conn.execute("DELETE FROM api_usage WHERE created_at < ?", (cutoff,)).rowcount or 0
    total = conn.execute("SELECT COUNT(*) FROM api_usage").fetchone()[0]
    if total > max_rows:
        removed += conn.execute(
            "DELETE FROM api_usage WHERE id IN ("
            "  SELECT id FROM api_usage ORDER BY id ASC LIMIT ?)",
            (total - max_rows,),
        ).rowcount or 0
    conn.commit()
    conn.close()
    return removed


def prune_agent_log(keep_days=AGENT_LOG_KEEP_DAYS, max_rows=AGENT_LOG_MAX_ROWS):
    conn = get_conn()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=keep_days)).isoformat()
    removed = conn.execute(
        "DELETE FROM agent_log WHERE created_at < ? AND IFNULL(status, 'done') != 'running'",
        (cutoff,),
    ).rowcount or 0
    total = conn.execute(
        "SELECT COUNT(*) FROM agent_log WHERE IFNULL(status, 'done') != 'running'"
    ).fetchone()[0]
    if total > max_rows:
        removed += conn.execute(
            "DELETE FROM agent_log WHERE id IN ("
            "  SELECT id FROM agent_log WHERE IFNULL(status, 'done') != 'running' "
            "  ORDER BY id ASC LIMIT ?)",
            (total - max_rows,),
        ).rowcount or 0
    conn.commit()
    conn.close()
    return removed


def list_agent_bugs(status="pending"):
    conn = get_conn()
    if status:
        rows = conn.execute(
            "SELECT * FROM agent_bugs WHERE status = ? ORDER BY id DESC", (status,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM agent_bugs ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def insert_agent_bug(title, details=""):
    title = (title or "").strip()
    if not title:
        raise ValueError("title is required")
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO agent_bugs (title, details, status, created_at) VALUES (?, ?, 'pending', ?)",
        (title, (details or "").strip(), now_iso()),
    )
    conn.commit()
    bug_id = cur.lastrowid
    conn.close()
    return bug_id


def get_agent_bug(bug_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM agent_bugs WHERE id = ?", (int(bug_id),)).fetchone()
    conn.close()
    return dict(row) if row else None


def set_agent_bug_status(bug_id, status):
    conn = get_conn()
    conn.execute("UPDATE agent_bugs SET status = ? WHERE id = ?", (status, bug_id))
    conn.commit()
    row = conn.execute("SELECT * FROM agent_bugs WHERE id = ?", (bug_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def prune_activity(keep_days=ACTIVITY_KEEP_DAYS, max_rows=ACTIVITY_MAX_ROWS):
    """Age out old activity, then hard-cap the row count. Returns rows removed."""
    conn = get_conn()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=keep_days)).isoformat()
    removed = conn.execute("DELETE FROM activity_log WHERE created_at < ?", (cutoff,)).rowcount or 0
    total = conn.execute("SELECT COUNT(*) FROM activity_log").fetchone()[0]
    if total > max_rows:
        removed += conn.execute(
            "DELETE FROM activity_log WHERE id IN ("
            "  SELECT id FROM activity_log ORDER BY id ASC LIMIT ?)",
            (total - max_rows,),
        ).rowcount or 0
    conn.commit()
    conn.close()
    return removed
