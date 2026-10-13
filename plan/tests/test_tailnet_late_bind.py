"""The app must end up on Tailscale even when it starts before Tailscale does.

At login the app usually wins the race, so _resolve_bind_host fell back to 127.0.0.1 and the
app stayed loopback-only until someone restarted it by hand. The phone could not reach it and
there was no sign of why. serve_tailnet_when_ready watches for the address and adds a listener
when it appears.
"""
import os
import sys
import threading
import time
import unittest
from unittest import mock

PLAN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PLAN)

import app as flask_app


class LateBindTests(unittest.TestCase):
    def setUp(self):
        self._env = dict(os.environ)
        os.environ["FLASK_HOST"] = "tailscale"

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env)

    def test_does_nothing_when_already_on_the_tailnet(self):
        with mock.patch.object(threading, "Thread") as thread:
            flask_app.serve_tailnet_when_ready(5099, "100.64.0.1")
        thread.assert_not_called()

    def test_does_nothing_when_tailscale_was_not_asked_for(self):
        os.environ["FLASK_HOST"] = "127.0.0.1"
        os.environ.pop("WAYPOINT_TAILSCALE", None)
        with mock.patch.object(threading, "Thread") as thread:
            flask_app.serve_tailnet_when_ready(5099, "127.0.0.1")
        thread.assert_not_called()

    def test_watches_when_it_had_to_fall_back_to_loopback(self):
        with mock.patch.object(threading, "Thread") as thread:
            flask_app.serve_tailnet_when_ready(5099, "127.0.0.1")
        thread.assert_called_once()
        self.assertTrue(thread.call_args.kwargs.get("daemon"), "must not block shutdown")

    def test_binds_the_address_once_tailscale_appears(self):
        """The whole point: a listener on the tailnet IP without a manual restart."""
        served = {}

        class FakeServer:
            def serve_forever(self):
                served["forever"] = True

        fake_ts = mock.Mock()
        fake_ts.tailscale_ipv4.side_effect = [None, None, "100.64.0.9"]
        made = {}

        def fake_make_server(host, port, application, **kwargs):
            made["host"], made["port"] = host, port
            return FakeServer()

        real_thread = threading.Thread
        started = []

        def capture(*args, **kwargs):
            t = real_thread(*args, **kwargs)
            started.append(t)
            return t

        with mock.patch.dict(sys.modules, {"tailscale_net": fake_ts}), \
             mock.patch("werkzeug.serving.make_server", fake_make_server), \
             mock.patch.object(threading, "Thread", capture):
            flask_app.serve_tailnet_when_ready(5099, "127.0.0.1", attempts=5, delay=0.01)
            started[0].join(timeout=5)

        self.assertEqual(made.get("host"), "100.64.0.9", "never bound the tailnet address")
        self.assertEqual(made.get("port"), 5099)
        self.assertTrue(served.get("forever"), "bound but never served")

    def test_gives_up_quietly_if_tailscale_never_arrives(self):
        fake_ts = mock.Mock()
        fake_ts.tailscale_ipv4.return_value = None
        real_thread = threading.Thread
        started = []

        def capture(*args, **kwargs):
            t = real_thread(*args, **kwargs)
            started.append(t)
            return t

        with mock.patch.dict(sys.modules, {"tailscale_net": fake_ts}), \
             mock.patch.object(threading, "Thread", capture):
            flask_app.serve_tailnet_when_ready(5099, "127.0.0.1", attempts=3, delay=0.01)
            started[0].join(timeout=5)
        self.assertFalse(started[0].is_alive(), "watcher thread should finish, not spin forever")


if __name__ == "__main__":
    unittest.main()
