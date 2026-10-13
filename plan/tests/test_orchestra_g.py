"""Source contracts for Grok G leftover orchestra: paste, boards, no mini-dock on body."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class OrchestraGPasteBoardsTests(unittest.TestCase):
    def test_paste_handles_clipboard_mimes_html_and_blob_fallback(self):
        issues = source("static/js/napkin_issues.js")
        self.assertIn("navigator.clipboard", issues)
        self.assertIn("fileToDataUrl", issues)
        self.assertIn("image/png", issues)
        self.assertIn("image/jpeg", issues)
        self.assertIn("image/webp", issues)
        self.assertIn("function imageFromHtml(", issues)
        self.assertIn("text/html", issues)
        self.assertIn("URL.createObjectURL", issues)
        self.assertIn("blob:", issues)
        self.assertIn("function wireRobustPaste(", issues)
        self.assertIn('document.addEventListener("paste"', issues)
        self.assertIn('document.addEventListener("drop"', issues)
        self.assertIn("window.wpResolvePastedImage", issues)

    def test_paste_void_is_hidden_or_removed(self):
        issues = source("static/js/napkin_issues.js")
        notes = source("static/js/notes.js")
        misc = source("static/js/misc.js")
        self.assertIn("wp-paste-void", issues)
        self.assertIn("hideEmptyPasteVoids", issues)
        self.assertIn("display: none", issues)
        self.assertIn("wp-paste-void", notes)
        self.assertIn("wp-paste-void", misc)
        self.assertIn("quick-capture-image-preview", misc)
        self.assertIn("#quick-capture-image-preview:empty", misc)
        self.assertIn("if (!url) return;", notes)

    def test_docs_sheets_slides_are_google_like(self):
        issues = source("static/js/napkin_issues.js")
        self.assertIn("wp-docs-shell", issues)
        self.assertIn("wp-docs-toolbar", issues)
        self.assertIn('data-doc-cmd="bold"', issues)
        self.assertIn('data-doc-cmd="italic"', issues)
        self.assertIn('data-doc-block="H1"', issues)
        self.assertIn('data-doc-block="H2"', issues)
        self.assertIn('data-doc-cmd="insertUnorderedList"', issues)
        self.assertIn("wp-docs-link", issues)
        self.assertIn("wp-docs-paper", issues)
        self.assertIn("wp-sheet-formula", issues)
        self.assertIn("=SUM(A1:A3)", issues)
        self.assertIn("=A1+B1", issues)
        self.assertIn("function evaluateSheetFormula(", issues)
        self.assertIn("wp-sheet-tabs", issues)
        self.assertIn("rows: 80", issues)
        self.assertIn("cols: 26", issues)
        self.assertIn("wp-slide-notes", issues)
        self.assertIn("wp-slide-film", issues)
        self.assertIn("wp-slide-textbox", issues)
        self.assertIn("wp-slide-box", issues)
        self.assertIn("Speaker notes", issues)

    def test_inject_mini_dock_does_not_append_to_body(self):
        issues = source("static/js/napkin_issues.js")
        self.assertIn("function injectMiniDock(", issues)
        fn = issues.split("function injectMiniDock(", 1)[1].split("function ", 1)[0]
        self.assertNotIn("document.body.appendChild", fn)
        self.assertNotIn("document.body.append(", fn)
        self.assertNotIn('id="wp-mini-dock"', fn)
        self.assertIn("HUD cluster already exists", fn)

    def test_scribble_only_capture_defaults_to_feedback(self):
        misc = source("static/js/misc.js")
        self.assertIn('id: "feedback"', misc)
        self.assertIn('options.type || "feedback"', misc)
        self.assertIn("napkin-title-hidden", misc)
        self.assertIn("Keep scribbling here — this is the only writing area", misc)
        self.assertIn("detailsInput.focus()", misc)


if __name__ == "__main__":
    unittest.main()
