"""Unit tests for Tailscale bind/trust helpers."""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import tailscale_net  # noqa: E402


class TailscaleNetTests(unittest.TestCase):
    def test_is_tailscale_addr_ranges(self):
        self.assertTrue(tailscale_net.is_tailscale_addr("100.64.0.1"))
        self.assertTrue(tailscale_net.is_tailscale_addr("100.127.255.255"))
        self.assertTrue(tailscale_net.is_tailscale_addr("::ffff:100.100.50.25"))
        self.assertTrue(tailscale_net.is_tailscale_addr("fd7a:115c:a1e0::1"))
        self.assertFalse(tailscale_net.is_tailscale_addr("127.0.0.1"))
        self.assertFalse(tailscale_net.is_tailscale_addr("192.168.1.10"))
        self.assertFalse(tailscale_net.is_tailscale_addr("8.8.8.8"))
        self.assertFalse(tailscale_net.is_tailscale_addr(""))
        self.assertFalse(tailscale_net.is_tailscale_addr("not-an-ip"))

    def test_trust_flag(self):
        with mock.patch.dict(os.environ, {"APP_TRUST_TAILSCALE": "true"}, clear=False):
            self.assertTrue(tailscale_net.trust_tailscale_enabled())
        with mock.patch.dict(os.environ, {"APP_TRUST_TAILSCALE": "0"}, clear=False):
            self.assertFalse(tailscale_net.trust_tailscale_enabled())

    def test_app_trust_helpers_exist(self):
        source = (ROOT / "app.py").read_text(encoding="utf-8")
        self.assertIn("def _trust_tailscale(", source)
        self.assertIn("def _is_trusted_remote(", source)
        self.assertIn("_is_trusted_remote()", source)
        self.assertIn("trust_tailscale", source)
        self.assertIn("tailscale_urls", source)
        self.assertIn("WAYPOINT_TAILSCALE", source)
        self.assertTrue((ROOT / "run_tailscale.py").is_file())
        self.assertTrue((ROOT / "run_tailscale.ps1").is_file())
        self.assertTrue((ROOT / "run_tailscale.sh").is_file())


if __name__ == "__main__":
    unittest.main()
