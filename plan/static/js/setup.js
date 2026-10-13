// First-run setup: one screen, one box. Paste any AI key, press Connect, done.
//
// Built for someone who has never coded. They should not need to know which provider their
// key belongs to (the server reads the prefix), whether it works (the server checks it against
// the provider before saving), or where it is stored (WAYPOINT_DATA_DIR/.env, on this PC only).
// Skipping is allowed: the planner works fully without AI.
(function () {
  function call(path, body) {
    return fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    }).then(r => r.json().catch(() => ({})).then(data => ({ ok: r.ok, data })));
  }

  const PROVIDERS = {
    anthropic: "Claude (Anthropic)",
    openai: "ChatGPT (OpenAI)",
    xai: "Grok (xAI)",
  };

  function render() {
    if (document.getElementById("wp-setup")) return;
    const wrap = document.createElement("div");
    wrap.id = "wp-setup";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "wp-setup-title");
    wrap.innerHTML = `
      <style>
        #wp-setup { position: fixed; inset: 0; z-index: 99999; display: grid; place-items: center;
          padding: 16px; background: color-mix(in srgb, #05070c 82%, transparent);
          backdrop-filter: blur(8px); font-family: inherit; }
        #wp-setup .wps-card { width: min(520px, 100%); background: var(--bg-card, #11151d);
          color: var(--ink-primary, #eef2f8); border: 1px solid var(--border, #2a3140);
          border-radius: 18px; padding: 28px; box-shadow: 0 30px 80px rgba(0,0,0,.45); }
        #wp-setup h1 { margin: 0 0 6px; font-size: 24px; }
        #wp-setup p { margin: 0 0 16px; color: var(--ink-secondary, #a7b0c0); line-height: 1.5; font-size: 14px; }
        #wp-setup ol { margin: 0 0 18px; padding-left: 20px; color: var(--ink-secondary, #a7b0c0); font-size: 14px; line-height: 1.7; }
        #wp-setup a { color: var(--accent, #6ea8ff); }
        #wp-setup input { width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 15px;
          border-radius: 10px; border: 1px solid var(--border, #2a3140);
          background: var(--bg, #0b0e14); color: inherit; font-family: ui-monospace, monospace; }
        #wp-setup .wps-row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
        #wp-setup button { padding: 11px 18px; border-radius: 10px; font-size: 15px; cursor: pointer;
          border: 1px solid var(--border, #2a3140); background: transparent; color: inherit; }
        #wp-setup button.wps-go { background: var(--accent, #6ea8ff); color: #061022;
          border-color: transparent; font-weight: 600; flex: 1; }
        #wp-setup button:disabled { opacity: .55; cursor: wait; }
        #wp-setup .wps-msg { min-height: 22px; margin-top: 12px; font-size: 14px; }
        #wp-setup .wps-msg.err { color: #ff8a8a; }
        #wp-setup .wps-msg.ok { color: #7be0a6; }
        #wp-setup small { display: block; margin-top: 16px; color: var(--ink-muted, #7a8496); font-size: 12px; line-height: 1.5; }
      </style>
      <div class="wps-card">
        <h1 id="wp-setup-title">Welcome to Waypoint</h1>
        <p>One step to switch on the AI assistant. Paste a key from any one of these:</p>
        <ol>
          <li><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Claude: console.anthropic.com</a></li>
          <li><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">ChatGPT: platform.openai.com</a></li>
          <li><a href="https://console.x.ai" target="_blank" rel="noopener">Grok: console.x.ai</a></li>
        </ol>
        <label for="wp-setup-key" style="font-size:13px;font-weight:600;">Your API key</label>
        <input id="wp-setup-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…">
        <div class="wps-row">
          <button type="button" class="wps-go" id="wp-setup-go">Connect</button>
          <button type="button" id="wp-setup-skip">Skip for now</button>
        </div>
        <div class="wps-msg" id="wp-setup-msg" role="status" aria-live="polite"></div>
        <small>Your key is checked with the provider, then saved only on this computer. It is never
        uploaded anywhere else. You can change it later in System → Settings.</small>
      </div>`;
    document.body.appendChild(wrap);

    const input = wrap.querySelector("#wp-setup-key");
    const go = wrap.querySelector("#wp-setup-go");
    const skip = wrap.querySelector("#wp-setup-skip");
    const msg = wrap.querySelector("#wp-setup-msg");
    const say = (text, kind) => { msg.textContent = text; msg.className = "wps-msg" + (kind ? " " + kind : ""); };

    function finish() {
      wrap.remove();
      if (typeof showToast === "function") showToast("Waypoint is ready", "good");
    }

    async function connect() {
      const key = input.value.trim();
      if (!key) { say("Paste your key first.", "err"); input.focus(); return; }
      go.disabled = skip.disabled = true;
      say("Checking your key…");
      try {
        const { ok, data } = await call("/api/setup/api-key", { key });
        if (!ok) { say(data.error || "That did not work. Check the key and try again.", "err"); return; }
        say(`Connected to ${PROVIDERS[data.provider] || data.provider}.`, "ok");
        setTimeout(finish, 900);
      } catch (_) {
        say("Could not reach the app. Is it still running?", "err");
      } finally {
        go.disabled = skip.disabled = false;
      }
    }

    go.onclick = connect;
    input.addEventListener("keydown", e => { if (e.key === "Enter") connect(); });
    skip.onclick = async () => {
      skip.disabled = true;
      await call("/api/setup/skip", {}).catch(() => {});
      finish();
    };
    input.focus();
  }

  // Shown on any launch until setup is done once. A user who already has a key configured
  // (every existing install) never sees it.
  function maybeShow() {
    call("/api/setup/state").then(({ ok, data }) => {
      if (ok && !data.complete && !data.any_configured) render();
    }).catch(() => {});
  }

  window.waypointOpenSetup = render;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", maybeShow);
  else maybeShow();
})();
