// Catch browser crashes and report them to the server.
//
// Until this file existed nothing recorded a JS exception: no window.onerror, no
// unhandledrejection handler, no endpoint. A crash left the app broken on screen and left
// absolutely no trace on disk, so "it crashes a lot" could never be turned into a cause.
//
// Loads before every other script (aa_ prefix) so it also catches errors thrown while the
// other files are still evaluating.
(function () {
  var MAX_PER_SESSION = 20; // a render loop can throw thousands; never flood the log or the disk
  var sent = 0;
  var seen = Object.create(null);

  function report(where, message, source, stack) {
    try {
      if (sent >= MAX_PER_SESSION) return;
      var key = where + "|" + message;
      if (seen[key]) return; // the same error repeating adds no information
      seen[key] = true;
      sent++;
      var body = JSON.stringify({
        where: where,
        message: String(message || ""),
        source: String(source || ""),
        stack: String(stack || ""),
      });
      // sendBeacon survives the page being torn down, which is exactly when a crash happens.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (_) {
      // Reporting must never itself throw; that would recurse through window.onerror.
    }
  }

  window.addEventListener("error", function (ev) {
    if (ev && ev.target && ev.target !== window && ev.target.tagName) {
      // A failed <script>/<img> load, not a thrown exception. Worth knowing: a script that
      // 404s leaves its whole feature dead with no visible error.
      report("resource", "failed to load " + (ev.target.src || ev.target.href || ev.target.tagName), ev.target.tagName, "");
      return;
    }
    report("error", (ev && ev.message) || "unknown error",
      (ev && ev.filename ? ev.filename + ":" + ev.lineno + ":" + ev.colno : ""),
      ev && ev.error && ev.error.stack);
  }, true); // capture phase, so resource errors (which do not bubble) are seen

  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    report("promise", (r && r.message) || String(r || "unknown rejection"), "", r && r.stack);
  });

  window.waypointReportError = function (where, err) {
    report(where || "manual", (err && err.message) || String(err || ""), "", err && err.stack);
  };
})();
