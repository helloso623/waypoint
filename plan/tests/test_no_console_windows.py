"""The app must not pop console windows while it runs.

It is launched with pythonw.exe, which has no console. On Windows every child process then
gets its own new console window that jumps to the front. Git runs on every napkin and
game-state sync and tailscale is queried at startup, so this showed up as windows repeatedly
stealing focus while the machine was in use.

These tests assert the flag is actually passed, rather than trusting that a wrapper is used.
"""
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

PLAN = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PLAN))

import proc_util

# Modules whose subprocess use is app housekeeping and must stay invisible.
HOUSEKEEPING = ["napkin_sync.py", "repo_commit.py", "tailscale_net.py", "repository.py",
                "app.py"]


class HiddenProcessTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "CREATE_NO_WINDOW only exists on Windows")
    def test_wrapper_sets_create_no_window(self):
        with mock.patch("subprocess.run") as run:
            proc_util.run(["git", "status"])
        flags = run.call_args.kwargs.get("creationflags", 0)
        self.assertTrue(flags & subprocess.CREATE_NO_WINDOW,
                        "CREATE_NO_WINDOW missing, a console window will appear")

    @unittest.skipUnless(os.name == "nt", "CREATE_NO_WINDOW only exists on Windows")
    def test_wrapper_preserves_other_flags(self):
        with mock.patch("subprocess.Popen") as popen:
            proc_util.popen(["git", "status"], creationflags=0x00000200)
        flags = popen.call_args.kwargs.get("creationflags", 0)
        self.assertTrue(flags & subprocess.CREATE_NO_WINDOW)
        self.assertTrue(flags & 0x00000200, "an existing creationflag was dropped")

    def test_wrapper_is_a_noop_off_windows(self):
        with mock.patch("os.name", "posix"), mock.patch("subprocess.run") as run:
            proc_util.run(["git", "status"])
        self.assertNotIn("creationflags", run.call_args.kwargs)

    def test_housekeeping_modules_do_not_call_subprocess_directly(self):
        offenders = []
        for name in HOUSEKEEPING:
            text = (PLAN / name).read_text(encoding="utf-8")
            for match in re.finditer(r"subprocess\.(run|Popen|check_output|call)\(", text):
                line = text[:match.start()].count("\n") + 1
                offenders.append(f"{name}:{line} {match.group(0)}")
        self.assertEqual(offenders, [],
                         "use proc_util.run/popen so no console window appears:\n  "
                         + "\n  ".join(offenders))


if __name__ == "__main__":
    unittest.main()
