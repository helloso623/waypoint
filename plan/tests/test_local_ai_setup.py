"""Contracts for switching the running AI and keeping local AI alive after a pull."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = Path(os.environ.get("WAYPOINT_PYTHON") or ROOT.parent / ".venv" / "bin" / "python")
if not PYTHON.is_file():
    PYTHON = Path(sys.executable)


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class LocalAiSetupContracts(unittest.TestCase):
    def test_env_writes_follow_data_dir_not_checkout(self):
        app = source("app.py")
        self.assertIn('_ENV_PATH = _DATA_DIR / ".env"', app)
        self.assertNotIn('_ENV_PATH = Path(__file__).parent / ".env"', app)
        self.assertIn("def _merge_missing_env_defaults", app)
        self.assertIn("def _setup_local_ai_env", app)
        self.assertIn('"/api/system/local-ai"', app)
        self.assertIn('"/api/system/local-ai/setup"', app)
        self.assertIn('pip", "install", "-r"', app)

    def test_python_and_ollama_urls_are_portable(self):
        repo = source("repository.py")
        self.assertNotIn('Path("/workspace/.venv/bin/python")', repo)
        self.assertIn("WAYPOINT_PYTHON", repo)
        self.assertIn("sys.executable", repo)
        ai = source("ai.py")
        backends = source("code_backends.py")
        self.assertIn('os.environ.get("OLLAMA_URL")', ai)
        self.assertIn('os.environ.get("LOCAL_MODEL_URL")', backends)

    def test_hud_and_settings_expose_a_real_switcher(self):
        misc = source("static/js/misc.js")
        settings = source("static/js/settings.js")
        html = source("static/index.html")
        css = source("static/css/app.css")
        self.assertIn("function setRunningInferenceMode", misc)
        self.assertIn("hud-model-use-custom", misc)
        self.assertIn("Switch to Local (Ollama)", misc)
        self.assertIn("Open model routing", misc)
        self.assertIn("function openSettingsSection", misc)
        self.assertIn('id="settings-model-anchor"', settings)
        self.assertIn('id="settings-updates-card"', settings)
        self.assertIn("function runLocalAiSetup", settings)
        self.assertIn('id="hud-model-chip"', html)
        self.assertIn("Change running AI", html)
        self.assertIn(".hud-model-picks", css)
        self.assertNotIn(
            "html.device-phone #hud-model-chip,\nhtml.device-phone #hud-close-day-chip",
            css,
        )
        hide_start = css.find("html.device-phone #hud-close-day-chip")
        hide_block = css[hide_start:css.find("}", hide_start) + 1]
        self.assertIn("display: none !important", hide_block)
        self.assertNotIn("#hud-model-chip", hide_block)
        self.assertIn("html.device-phone #hud-model-chip {\n  max-width: 92px;", css)

    def test_post_pull_scripts_exist(self):
        setup = ROOT / "scripts" / "setup_local_ai.py"
        post = ROOT / "scripts" / "post_pull.py"
        self.assertTrue(setup.is_file(), setup)
        self.assertTrue(post.is_file(), post)
        self.assertIn("LOCAL_MODEL_URL", setup.read_text(encoding="utf-8"))
        self.assertIn("requirements.txt", post.read_text(encoding="utf-8"))
        example = source(".env.example")
        self.assertIn("OLLAMA_URL=", example)

    def test_env_merge_and_health_use_data_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json
from pathlib import Path
import app

assert app._ENV_PATH == app._DATA_DIR / ".env"
app._merge_env_file({"LOCAL_MODEL_URL": "http://127.0.0.1:11434", "CLAUDE_MODEL": "claude-sonnet-5"})
text = app._ENV_PATH.read_text(encoding="utf-8")
assert "LOCAL_MODEL_URL=http://127.0.0.1:11434" in text
assert "CLAUDE_MODEL=claude-sonnet-5" in text
health = app._local_ai_health()
print(json.dumps({
    "env_path": health["env_path"],
    "env_exists": health["env_exists"],
    "has_steps": isinstance(health["setup_steps"], list),
    "mode": health["inference_mode"],
}))
"""
            env = dict(os.environ, WAYPOINT_DATA_DIR=tmp)
            env.pop("LOCAL_MODEL_URL", None)
            env.pop("OLLAMA_URL", None)
            proc = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertEqual(payload["env_path"], str(Path(tmp) / ".env"))
            self.assertTrue(payload["env_exists"])
            self.assertTrue(payload["has_steps"])

    def test_about_and_local_ai_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = r"""
import json
from app import app

client = app.test_client()
about = client.get("/api/about").get_json()
health = client.get("/api/system/local-ai").get_json()
setup = client.post("/api/system/local-ai/setup", json={"local_model_name": "llama3.2:3b"}).get_json()
saved = client.post("/api/about", json={"inference_mode": "local", "claude_model": "claude-haiku-4-5-20251001"}).get_json()
again = client.get("/api/about").get_json()
print(json.dumps({
    "about_env": about.get("env_path"),
    "health_keys": sorted(health),
    "setup_ok": bool(setup.get("wrote_env")),
    "saved": saved.get("ok"),
    "mode": again.get("inference_mode"),
    "claude": again.get("claude_model"),
}))
"""
            env = dict(os.environ, WAYPOINT_DATA_DIR=tmp, PLANNER_DB_PATH=str(Path(tmp) / "planner.db"))
            proc = subprocess.run(
                [str(PYTHON), "-c", script],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr + proc.stdout)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertIsNone(payload["about_env"])
            self.assertIn("setup_steps", payload["health_keys"])
            self.assertTrue(payload["setup_ok"])
            self.assertTrue(payload["saved"])
            self.assertEqual(payload["mode"], "local")
            self.assertEqual(payload["claude"], "claude-haiku-4-5-20251001")


if __name__ == "__main__":
    unittest.main()
