"""Every static/js file must parse.

This exists because a duplicate `const` shipped in misc.js: two declarations of the same name
in one function scope. That is a SyntaxError, and a SyntaxError in a classic script means the
browser parses NONE of the file -- so every feature defined in misc.js (quick capture, the
Napkin, the HUD model dropdown) silently stopped working, with nothing in the server logs to
show for it. A parse check is cheap; losing a whole file's features is not.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

JS_DIR = Path(__file__).resolve().parent.parent / "static" / "js"
NODE = shutil.which("node")


@unittest.skipIf(NODE is None, "node is not installed")
class JavaScriptSyntaxTests(unittest.TestCase):
    def test_every_js_file_parses(self):
        broken = []
        for path in sorted(JS_DIR.glob("*.js")):
            proc = subprocess.run(
                [NODE, "--check", str(path)],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            if proc.returncode != 0:
                first = (proc.stderr or "").strip().splitlines()
                detail = next((l for l in first if "Error" in l), first[0] if first else "?")
                broken.append(f"{path.name}: {detail.strip()}")
        self.assertEqual(broken, [], "JavaScript files failed to parse:\n  " + "\n  ".join(broken))


if __name__ == "__main__":
    unittest.main()
