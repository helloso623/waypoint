"""Contracts for the napkin audit: secrets, sqlite, git, codegen, agent bugs, UI."""
from __future__ import annotations

import ast
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PYTHON = Path(os.environ.get("WAYPOINT_PYTHON") or ROOT.parent / ".venv" / "bin" / "python")
if not PYTHON.is_file():
    PYTHON = Path(sys.executable)


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class NapkinAuditSourceTests(unittest.TestCase):
    def test_about_allowlists_and_hides_env_path(self):
        app = source("app.py")
        self.assertIn("def _public_about_payload", app)
        self.assertIn("def _is_secret_setting_key", app)
        self.assertIn('payload["recent_errors"]', app)
        self.assertIn("def _git_pull_status", app)
        self.assertNotIn("dev-only-insecure", app)
        self.assertIn('form method="post"', app)
        self.assertIn("hmac.compare_digest", app)
        self.assertIn("Content-Security-Policy", app)
        self.assertIn('if not data.get("confirm")', app)
        self.assertIn("shlex.split", app)
        self.assertIn('shutil.which("code")', app)
        self.assertNotIn('payload["env_path"]', app)
        self.assertIn('"/api/agent/bugs"', app)
        self.assertIn('"/api/napkin/accept"', app)
        self.assertIn('"/api/napkin/compile"', app)
        self.assertIn('"/api/export/me"', app)
        self.assertIn("127.0.0.1 (not 0.0.0.0)", app)

    def test_sqlite_wal_indexes_contacts_and_prunes(self):
        db = source("db.py")
        self.assertIn("journal_mode = WAL", db)
        self.assertIn("idx_hours_date", db)
        self.assertIn("idx_api_usage_created", db)
        self.assertIn("idx_agent_log_created", db)
        self.assertIn("idx_agent_messages_conversation", db)
        self.assertIn("CONTACT_COLUMNS", db)
        self.assertIn("def prune_api_usage", db)
        self.assertIn("def prune_agent_log", db)
        self.assertIn("CREATE TABLE IF NOT EXISTS agent_bugs", db)
        self.assertIn("class _ConnProxy", db)

    def test_web_search_fallback_and_context_window(self):
        agent = source("agent.py")
        backends = source("chat_backends.py")
        self.assertIn('"name": "web_search"', agent)
        self.assertIn('"name": "propose_bug"', agent)
        self.assertIn('"name": "preview_bulk_import"', agent)
        self.assertIn('"name": "import_course_schedule"', agent)
        self.assertIn("web_search.search", agent)
        self.assertIn("t.get(\"name\") != \"web_search\"", agent)
        self.assertIn("max_tokens=4000", agent)
        self.assertIn("via the web_search tool", backends)
        self.assertIn("Do not claim you searched unless", backends)
        self.assertIn("CONTEXT_WINDOW_MESSAGES = 120", source("companion_memory.py"))
        self.assertIn("def search(", source("web_search.py"))
        self.assertIn("IMAGE_CACHE_DIR", source("parallel_life.py"))
        self.assertIn("def resolve_image_path", source("parallel_life.py"))
        self.assertIn("button.ghost", source("static/css/app.css"))
        self.assertIn("agent-copy-chat", source("static/js/agent.js"))

    def test_napkin_push_off_and_launcher_logs_pull(self):
        sync = source("napkin_sync.py")
        self.assertIn('os.environ.get("NAPKIN_AUTO_PUSH", "false")', sync)
        vbs = (ROOT.parent / "Waypoint.vbs").read_text(encoding="utf-8")
        self.assertIn("last-git-pull.log", vbs)
        self.assertIn("EXIT=%ERRORLEVEL%", vbs)
        self.assertIn("starting git pull --ff-only", vbs)
        self.assertIn("last-git-pull.log", source(".gitignore"))

    def test_requirements_are_pinned_and_declare_runtime_deps(self):
        req = source("requirements.txt")
        lines = [ln.strip() for ln in req.splitlines() if ln.strip() and not ln.startswith("#")]
        self.assertTrue(lines)
        self.assertTrue(all("==" in ln for ln in lines), lines)
        names = {ln.split("==", 1)[0].lower() for ln in lines}
        for needed in ("numpy", "scipy", "pillow", "flask", "anthropic"):
            self.assertIn(needed, names)

    def test_local_rag_does_not_pickle(self):
        rag = source("local_rag.py")
        self.assertNotIn("import pickle", rag)
        self.assertIn("tfidf.npz", rag)
        self.assertIn("def _save_tfidf", rag)
        self.assertIn("TfidfTransformer", rag)

    def test_workflow_emit_quotes_and_validates_names(self):
        wf = source("workflow.py")
        self.assertIn("def _safe_ident", wf)
        self.assertIn("def _code_expr", wf)
        self.assertIn("print({_code_expr", wf)

    def test_agent_ui_has_picker_composer_and_bugs(self):
        js = source("static/js/agent.js")
        self.assertIn("agent-conv-search", js)
        self.assertIn("agent-conv-popover", js)
        self.assertIn("<textarea id=\"agent-input\"", js)
        self.assertIn("agent-manager-bugs", js)
        self.assertIn("Accept to Napkin", js)
        self.assertIn("function refreshAgentBugs", js)
        self.assertIn("Shift+Enter", js)
        misc = source("static/js/misc.js")
        self.assertIn('data-napkin-accept', misc)
        self.assertIn("/api/napkin/accept", misc)
        self.assertIn("napkin-compile-git", misc)
        self.assertIn("napkin-copy-all", misc)
        self.assertIn("Compile all to git", misc)
        self.assertIn('id: "feedback"', misc)
        self.assertIn("isNapkinCaptureType", misc)

    def test_innerhtml_and_project_run_confirm(self):
        self.assertIn("escapeHtml(varName)", source("static/js/automation.js"))
        self.assertIn("escapeHtml(result.summary", source("static/js/code.js"))
        self.assertIn('JSON.stringify({ confirm: true })', source("static/js/projects.js"))
        self.assertIn("data-hw-level", source("static/js/practice.js"))


class WorkflowCodegenRuntimeTests(unittest.TestCase):
    def test_print_and_run_command_quote_typed_text(self):
        from workflow import generate_code

        code = generate_code({
            "name": "audit",
            "nodes": [
                {"id": "s", "type": "start", "x": 0, "y": 0, "params": {}},
                {"id": "p", "type": "print", "x": 0, "y": 0, "params": {"message": "hello world"}},
                {"id": "c", "type": "run_command", "x": 0, "y": 0, "params": {"command": "ls -la"}},
                {"id": "v", "type": "set_variable", "x": 0, "y": 0,
                 "params": {"name": "os.system('x')", "value": "1"}},
            ],
            "edges": [
                {"from": "s", "fromPort": "next", "to": "p", "kind": "exec"},
                {"from": "p", "fromPort": "next", "to": "c", "kind": "exec"},
                {"from": "c", "fromPort": "next", "to": "v", "kind": "exec"},
            ],
        })
        self.assertIn("print('hello world')", code)
        self.assertIn("subprocess.run('ls -la', shell=True)", code)
        self.assertNotIn("print(hello world)", code)
        self.assertNotIn("subprocess.run(ls -la", code)
        self.assertNotIn("os.system('x') =", code)
        self.assertIn("os_system__x__ = 1", code)
        ast.parse(code)

    def test_safe_ident_and_code_expr_helpers(self):
        import workflow
        self.assertEqual(workflow._safe_ident("count"), "count")
        self.assertEqual(workflow._safe_ident("os.system('x')"), "os_system__x__")
        self.assertEqual(workflow._code_expr("hello world"), "'hello world'")
        self.assertEqual(workflow._code_expr("'already'"), "'already'")
        self.assertEqual(workflow._code_expr("_n_abc_result"), "_n_abc_result")


class AgentBugRuntimeTests(unittest.TestCase):
    def test_bug_roundtrip_and_about_redaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json, os
from pathlib import Path
import db
from app import app
import napkin_sync as ns
import runtime_errors

data = Path(os.environ["WAYPOINT_DATA_DIR"])
ns.STATE_FILE = data / "napkin_state.json"
ns.MARKDOWN_FILE = data / "NAPKIN.md"
ns.ISSUES_FILE = data / "ISSUES.md"
ns.AUTO_COMMIT = False

db.init_db()
db.save_settings({
    "google_client_secret": "secret-google",
    "grok_api_key": "secret-grok",
    "pronote_password": "secret-school",
    "user_profile": "public-ok",
})
bug_id = db.insert_agent_bug("Broken send button", "Composer ignores Enter")
runtime_errors.note("test.place", RuntimeError("swallowed"))
pid = db.insert_project("Demo", "", "software")
db.update_project(pid, path=os.environ["WAYPOINT_DATA_DIR"], run_command="echo hi")
client = app.test_client()
about = client.get("/api/about").get_json()
listed = client.get("/api/agent/bugs").get_json()
accepted = client.post("/api/agent/bugs", json={"action": "accept", "id": bug_id})
run = client.post(f"/api/projects/{pid}/run", json={})
print(json.dumps({
    "about_secret": about.get("google_client_secret"),
    "about_grok": about.get("grok_api_key"),
    "about_pronote": about.get("pronote_password"),
    "about_profile": about.get("user_profile"),
    "about_env": about.get("env_path"),
    "errors": [e.get("where") for e in (about.get("recent_errors") or [])],
    "bugs": [b.get("title") for b in (listed.get("bugs") or [])],
    "accept_status": accepted.status_code,
    "accepted": (accepted.get_json() or {}).get("accepted"),
    "run_status": run.status_code,
    "run_confirm": (run.get_json() or {}).get("confirm_required"),
}))
"""
            env = dict(os.environ)
            env["WAYPOINT_DATA_DIR"] = tmp
            env["PLANNER_DB_PATH"] = str(Path(tmp) / "planner.db")
            env["NAPKIN_AUTO_COMMIT"] = "false"
            import subprocess
            proc = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertIsNone(payload["about_secret"])
            self.assertIsNone(payload["about_grok"])
            self.assertIsNone(payload["about_pronote"])
            self.assertEqual(payload["about_profile"], "public-ok")
            self.assertIsNone(payload["about_env"])
            self.assertIn("test.place", payload["errors"])
            self.assertEqual(payload["bugs"], ["Broken send button"])
            self.assertEqual(payload["accept_status"], 200)
            self.assertTrue(payload["accepted"])
            self.assertEqual(payload["run_status"], 409)
            self.assertTrue(payload["run_confirm"])


if __name__ == "__main__":
    unittest.main()
