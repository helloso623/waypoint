"""The DOM-upgrade MutationObserver must not be able to re-trigger itself.

The bug this guards: napkin_issues.js observes document.body with subtree:true and its callback
writes to the DOM (innerHTML, appendChild, remove, classList, style). Running those writes while
still observing fed them straight back in as new mutations, which re-ran the callback, forever.
Rendering anything large -- the skin locker's 138-card grid above all -- lit that fuse and killed
the renderer process outright. There is no JS exception in that failure, just a dead tab, which
is why it read as "the app crashes on the skin window" and resisted log-based debugging.

Static checks, because reproducing it needs a real browser and the failure mode is a crash rather
than an assertion. They pin the two properties that keep the loop impossible.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "static/js/napkin_issues.js").read_text(encoding="utf-8")


class ObserverLoopTests(unittest.TestCase):
    def test_the_upgrade_pass_disconnects_while_it_runs(self):
        """Without this the callback's own writes re-enter the observer immediately."""
        body = re.search(r"function runUpgradePass\(\)\s*\{(.*?)\n  \}", SRC, re.S)
        self.assertIsNotNone(body, "runUpgradePass is gone; the guard it holds may be gone too")
        self.assertIn("obs.disconnect()", body.group(1),
                      "the upgrade pass must disconnect before mutating the DOM")

    def test_the_observer_is_always_reconnected(self):
        """A throw mid-pass must not silently kill icon upgrades for the rest of the session."""
        body = re.search(r"function runUpgradePass\(\)\s*\{(.*?)\n  \}", SRC, re.S).group(1)
        self.assertIn("finally", body, "reconnect must be in a finally block")
        after_finally = body.split("finally", 1)[1]
        self.assertIn("obs.observe", after_finally)

    def test_mutations_are_coalesced_into_one_pass(self):
        """A burst of records must schedule one pass, not one pass per record."""
        self.assertRegex(SRC, r"new MutationObserver\(\s*\(\)\s*=>\s*\{\s*\n?\s*if \(upgradePending\) return;",
                         "the observer callback must bail out when a pass is already queued")
        self.assertIn("requestAnimationFrame(runUpgradePass)", SRC)

    def test_the_callback_does_not_mutate_the_dom_directly(self):
        """The observer callback itself must only schedule; mutating inline reopens the loop."""
        cb = re.search(r"const obs = new MutationObserver\(\(\) => \{(.*?)\n  \}\);", SRC, re.S)
        self.assertIsNotNone(cb)
        for banned in ("innerHTML", "appendChild", "classList", "setAttribute"):
            self.assertNotIn(banned, cb.group(1),
                             f"observer callback writes to the DOM ({banned}), which re-triggers it")


if __name__ == "__main__":
    unittest.main()
