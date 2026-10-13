"""Test-wide safety settings, applied before any test module imports the app.

napkin_sync and game_sync default to auto-committing, and register an exit hook that commits
pending changes. Any test that imported them without opting out therefore made real commits in
the developer's own repository when pytest exited -- which on a public repo means publishing
whatever was in NAPKIN.md / ISSUES.md at that moment. Tests must never touch git.
"""
import os

os.environ["NAPKIN_AUTO_COMMIT"] = "false"
os.environ["NAPKIN_AUTO_PUSH"] = "false"
os.environ["NAPKIN_COMMIT_MODE"] = "exit"
