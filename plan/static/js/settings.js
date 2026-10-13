// --- Settings tab ---------------------------------------------------------

let schoolScheduleCourses = [];

function settingsPlotlyLayout(theme, extra = {}) {
  return {
    paper_bgcolor: theme.card,
    plot_bgcolor: theme.card,
    font: { color: theme.ink, size: 12, family: "system-ui, sans-serif" },
    xaxis: { gridcolor: theme.gridline, linecolor: theme.gridline, tickfont: { color: theme.inkMuted } },
    yaxis: { gridcolor: theme.gridline, linecolor: theme.gridline, tickfont: { color: theme.inkMuted } },
    margin: { l: 48, r: 20, t: 20, b: 50 },
    hovermode: "x unified",
    ...extra,
  };
}

function budgetBarColor(status) {
  if (status === "over") return "var(--status-critical)";
  if (status === "warning") return "var(--status-warning)";
  return "var(--status-good)";
}

function settingsUsagePeriodHtml(usage) {
  const day = usage.day || { tokens: 0, estimated_cost_usd: 0, by_model: [] };
  const month = usage.month_total || usage.month || { tokens: 0, estimated_cost_usd: 0, by_model: [] };
  const row = (models) => (models || []).length
    ? models.map(m => `<tr><td>${escapeHtml(m.model || "—")}</td><td style="text-align:right;">${Number(m.input_tokens || 0).toLocaleString()} / ${Number(m.output_tokens || 0).toLocaleString()}</td><td style="text-align:right;">$${(m.estimated_cost_usd || 0).toFixed(4)}</td></tr>`).join("")
    : '<tr><td colspan="3" class="stub">No calls in this window.</td></tr>';
  return `
    <div class="card-grid" id="settings-usage-periods" style="margin-top:14px;">
      <div>
        <strong style="font-size:12px;">Today</strong>
        <p class="stub" style="margin:4px 0 8px;">${escapeHtml(usage.today || "today")} · ${(day.tokens || 0).toLocaleString()} tokens · $${(day.estimated_cost_usd || 0).toFixed(4)}</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--gridline);text-align:left;"><th style="padding:4px 0;">Model</th><th style="padding:4px 0;text-align:right;">In / out</th><th style="padding:4px 0;text-align:right;">Cost</th></tr></thead>
          <tbody>${row(day.by_model)}</tbody>
        </table>
      </div>
      <div>
        <strong style="font-size:12px;">This month</strong>
        <p class="stub" style="margin:4px 0 8px;">${escapeHtml(usage.month || (usage.today || "").slice(0, 7) || "month")} · ${(month.tokens || 0).toLocaleString()} tokens · $${(month.estimated_cost_usd || 0).toFixed(4)}</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--gridline);text-align:left;"><th style="padding:4px 0;">Model</th><th style="padding:4px 0;text-align:right;">In / out</th><th style="padding:4px 0;text-align:right;">Cost</th></tr></thead>
          <tbody>${row(month.by_model)}</tbody>
        </table>
      </div>
    </div>`;
}

function dailyCapBarColor(ratio) {
  if (ratio >= 1) return "var(--status-critical)";
  if (ratio >= 0.7) return "var(--status-warning)";
  return "var(--status-good)";
}

async function settingsApiOr(endpoint, fallback = {}) {
  try {
    const data = await api(endpoint);
    return data || fallback;
  } catch (err) {
    return { ...fallback, _settings_error: errorMessage(err) };
  }
}

function settingsBool(value) {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

function settingsStorageGet(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (_) {
    return fallback;
  }
}

function settingsStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

function settingsSafeBindHost(raw) {
  const host = String(raw || "").trim();
  if (!host || host === "0.0.0.0" || host === "*" || host === "::" || host === "[::]" || host === "tailscale" || host === "tailnet") {
    return "127.0.0.1";
  }
  return host;
}

function settingsPaintSyncStatus(snap, extra) {
  const host = settingsSafeBindHost(snap && snap.bind_host);
  const bindEl = document.getElementById("settings-sync-bind");
  const lastEl = document.getElementById("settings-sync-last");
  const meta = document.getElementById("settings-sync-meta");
  const roleEl = document.getElementById("settings-sync-as-server");
  if (bindEl) bindEl.textContent = host;
  const when = (snap && (snap.updated_at || snap.last_seen)) || "";
  if (lastEl) lastEl.textContent = when || "never";
  if (roleEl && snap && snap.role) roleEl.checked = snap.role === "server";
  if (meta && extra) meta.textContent = extra;
}

const WP_HIDE_GAME_KEY = "wp-hide-game";
const WP_HIDE_GAME_LEGACY_KEY = "waypointGameOff";

function settingsGameOffEnabled() {
  const hide = settingsStorageGet(WP_HIDE_GAME_KEY, "");
  if (hide === "1" || hide === "on" || hide === "true") return true;
  if (hide === "0" || hide === "off" || hide === "false") return false;
  return settingsStorageGet(WP_HIDE_GAME_LEGACY_KEY, "") === "on";
}

function settingsApplyGameOff() {
  const on = settingsGameOffEnabled();
  try {
    document.documentElement.setAttribute("data-wp-hide-game", on ? "on" : "off");
    document.documentElement.classList.toggle("wp-hide-game", on);
    document.body?.classList.toggle("game-off", on);
    document.body?.classList.toggle("wp-hide-game", on);
  } catch (_) {}
  try { window.WaypointNapkinComplete?.applyGameOff?.(); } catch (_) {}
}

function settingsSetGameOff(on) {
  settingsStorageSet(WP_HIDE_GAME_KEY, on ? "on" : "off");
  settingsStorageSet(WP_HIDE_GAME_LEGACY_KEY, on ? "on" : "off");
  settingsApplyGameOff();
}

function settingsDownloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function settingsEnsurePreferenceStyles() {
  if (document.getElementById("settings-display-pref-styles")) return;
  const style = document.createElement("style");
  style.id = "settings-display-pref-styles";
  style.textContent = `
    html.settings-density-compact .card { padding: 14px; }
    html.settings-density-compact input,
    html.settings-density-compact select,
    html.settings-density-compact textarea,
    html.settings-density-compact :is(button.primary, button.secondary, .pill) { min-height: 32px; }
    html.settings-density-comfortable input,
    html.settings-density-comfortable select,
    html.settings-density-comfortable textarea,
    html.settings-density-comfortable :is(button.primary, button.secondary, .pill) { min-height: 38px; }
    html.settings-motion-reduced *,
    html.settings-motion-reduced *::before,
    html.settings-motion-reduced *::after {
      animation-duration: 120ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 120ms !important;
    }
    html.settings-contrast-high {
      --border: color-mix(in srgb, var(--ink-primary) 26%, transparent);
      --gridline: color-mix(in srgb, var(--ink-primary) 18%, transparent);
      --ink-muted: color-mix(in srgb, var(--ink-secondary) 82%, var(--ink-primary));
    }
    .settings-section-routing { --settings-section-accent: #5c7cfa; }
    .settings-section-budget { --settings-section-accent: #2f9e44; }
    .settings-section-integrations { --settings-section-accent: #7048e8; }
    .settings-section-data { --settings-section-accent: #0c8599; }
    .settings-section-security { --settings-section-accent: #d9480f; }
    .settings-section {
      border-left: 4px solid var(--settings-section-accent, var(--accent));
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--settings-section-accent, var(--accent)) 10%, var(--bg-card)) 0%,
        color-mix(in srgb, var(--settings-section-accent, var(--accent)) 3%, var(--bg-card)) 38%,
        var(--bg-card) 100%
      );
      box-shadow: 0 1px 0 color-mix(in srgb, var(--settings-section-accent, var(--accent)) 8%, transparent) inset;
    }
    .settings-section > strong:first-of-type {
      display: inline-block;
      padding: 2px 8px;
      margin: -2px 0 6px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 12%, transparent);
      color: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 70%, var(--ink-primary));
    }
    .settings-section input[type="text"],
    .settings-section input[type="url"],
    .settings-section input[type="number"],
    .settings-section input[type="password"],
    .settings-section input[type="search"],
    .settings-section select,
    .settings-section textarea {
      border: 1px solid color-mix(in srgb, var(--settings-section-accent, var(--accent)) 24%, var(--gridline));
      background: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 4%, var(--bg-card));
      border-radius: 8px;
      transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }
    .settings-section input:focus,
    .settings-section select:focus,
    .settings-section textarea:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 55%, var(--gridline));
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--settings-section-accent, var(--accent)) 14%, transparent);
      background: var(--bg-card);
    }
    .settings-section input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--settings-section-accent, var(--accent));
      cursor: pointer;
    }
    .settings-section label:has(input[type="checkbox"]) {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--settings-section-accent, var(--accent)) 18%, var(--gridline));
      background: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 5%, var(--bg-card));
    }
    .settings-budget-meter {
      margin-top: 14px;
      padding: 12px 12px 10px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--settings-section-accent, var(--status-good)) 22%, var(--gridline));
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--settings-section-accent, var(--status-good)) 8%, var(--bg-card)) 0%,
        var(--bg-card) 100%
      );
    }
    .settings-budget-meter + .settings-budget-meter { margin-top: 10px; }
    .settings-budget-track {
      height: 12px;
      background: color-mix(in srgb, var(--settings-section-accent, var(--status-good)) 6%, var(--bg-shell));
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--settings-section-accent, var(--status-good)) 18%, var(--border));
      box-shadow: inset 0 1px 2px color-mix(in srgb, var(--ink-primary) 6%, transparent);
    }
    .settings-budget-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
      box-shadow: 0 0 8px color-mix(in srgb, currentColor 25%, transparent);
    }
    .settings-mini-panel {
      padding: 10px;
      border: 1px solid var(--gridline);
      border-radius: 12px;
      border-color: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 16%, var(--gridline));
      background: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 4%, var(--bg-card));
    }
    .settings-card-status { margin: 4px 0 10px; }
    .settings-quiet-list { margin: 8px 0 0; padding-left: 18px; color: var(--ink-secondary); font-size: 12px; }
    .settings-quiet-list li { margin: 3px 0; }
    .settings-mini-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
    .settings-shortcut-row[hidden] { display: none !important; }
    html.device-phone .settings-shortcut-row { grid-template-columns: 1fr !important; }
    @media (max-width:600px) {
      .settings-shortcut-row { grid-template-columns: 1fr !important; }
    }
    .settings-self-coding-on {
      border-color: color-mix(in srgb, var(--status-critical) 45%, var(--gridline));
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--status-critical) 12%, var(--bg-card)) 0%,
        color-mix(in srgb, var(--status-critical) 5%, var(--bg-card)) 100%
      );
    }
    .settings-self-coding-on strong { color: var(--status-critical); }
    .settings-offline-on {
      border-color: color-mix(in srgb, var(--status-warning) 50%, var(--gridline));
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--status-warning) 14%, var(--bg-card)) 0%,
        color-mix(in srgb, var(--status-warning) 6%, var(--bg-card)) 100%
      );
    }
    .settings-offline-on > strong:first-of-type { color: var(--status-warning); }
    .settings-vibecode-on {
      border-color: color-mix(in srgb, #7048e8 35%, var(--gridline));
      background: linear-gradient(
        90deg,
        color-mix(in srgb, #7048e8 10%, var(--bg-card)) 0%,
        color-mix(in srgb, #7048e8 4%, var(--bg-card)) 100%
      );
    }
    .settings-inference-modes {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      margin: 12px 0 14px;
    }
    .settings-inference-modes .seg-pill { flex-wrap: wrap; max-width: 100%; }
    .settings-inference-btn { font-size: 12px; }
    .settings-inference-hint { margin: 0; font-size: 11px; line-height: 1.35; }
    .settings-pref-seg { flex-wrap: wrap; max-width: 100%; }
    .settings-pref-btn { font-size: 11px; }
    .settings-api-status-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 12px;
    }
    .settings-api-keys-card {
      margin-top: 14px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--settings-section-accent, var(--accent)) 18%, var(--gridline));
      background: color-mix(in srgb, var(--settings-section-accent, var(--accent)) 3%, var(--bg-card));
    }
  `;
  document.head.appendChild(style);
}

function settingsDisplayPrefs() {
  return {
    density: settingsStorageGet("settings_density", "comfortable"),
    motion: settingsStorageGet("settings_motion", "full"),
    contrast: settingsStorageGet("settings_contrast", "standard"),
  };
}

function settingsApplyDisplayPrefs(prefs = settingsDisplayPrefs()) {
  settingsEnsurePreferenceStyles();
  const root = document.documentElement;
  root.classList.toggle("settings-density-compact", prefs.density === "compact");
  root.classList.toggle("settings-density-comfortable", prefs.density !== "compact");
  root.classList.toggle("settings-motion-reduced", prefs.motion === "reduced");
  root.classList.toggle("settings-contrast-high", prefs.contrast === "high");
  root.style.setProperty("--settings-density", prefs.density);
  root.style.setProperty("--settings-motion", prefs.motion);
  root.style.setProperty("--settings-contrast", prefs.contrast);
  root.style.setProperty("--settings-card-gap", prefs.density === "compact" ? "10px" : "16px");
}

function settingsErrorNotice(label, data) {
  if (!data || !data._settings_error) return "";
  return `<p class="stub" style="margin:6px 0;color:var(--status-warning);">Could not load ${escapeHtml(label)}: ${escapeHtml(data._settings_error)}</p>`;
}

function settingsStatusPill(label, tone = "") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function settingsBackendDataLeaving(backend) {
  const normalized = String(backend || "unknown").toLowerCase();
  if (normalized === "ollama") return "Prompt stays on this machine and is sent only to local Ollama.";
  if (normalized === "local_deterministic") return "No AI prompt leaves device; local deterministic code handles it.";
  if (normalized === "openai") return "Prompt content for this feature leaves device to OpenAI when the API switch allows calls.";
  if (normalized === "grok") return "Prompt content for this feature leaves device to xAI (Grok) when the API switch allows calls.";
  if (normalized === "claude") return "Prompt content for this feature leaves device to Anthropic when the API switch allows calls.";
  if (normalized === "auto") return "Auto resolves to the configured backend shown by the routing snapshot.";
  return "No routing snapshot loaded; treat this path as unknown until status refresh succeeds.";
}

function settingsPrivacyDashboardHtml(routing) {
  const rows = Object.entries(routing || {});
  if (!rows.length) {
    return '<p class="stub">No routing snapshot available — refresh Settings once the backend is running.</p>';
  }
  return `
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--gridline);text-align:left;">
          <th style="padding:6px 0;">Task type</th>
          <th style="padding:6px 0;">Backend / model</th>
          <th style="padding:6px 0;">What leaves device</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([role, info]) => `
          <tr style="border-bottom:1px solid var(--gridline);">
            <td style="padding:7px 8px 7px 0;">
              <strong>${escapeHtml(role)}</strong>
              <div class="stub" style="font-size:11px;">${escapeHtml(info.description || "")}</div>
            </td>
            <td style="padding:7px 8px 7px 0;">${escapeHtml(info.backend || "unknown")} / ${escapeHtml(info.model || "unknown")}</td>
            <td style="padding:7px 0;">${escapeHtml(settingsBackendDataLeaving(info.backend))}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function settingsOllamaModelsHtml(models) {
  if (!models || !models.length) {
    return '<p class="stub" id="offline-ollama-models">No local models found — install Ollama and pull a model.</p>';
  }
  return `<div id="offline-ollama-models" style="display:flex;gap:6px;flex-wrap:wrap;">${models.map(model => `<span class="pill">${escapeHtml(model)}</span>`).join("")}</div>`;
}

function settingsInferenceMode(settings) {
  const explicit = String(settings.inference_mode || "").toLowerCase();
  if (["cloud", "local", "custom"].includes(explicit)) return explicit;
  return settingsBool(settings.offline_mode) ? "local" : "cloud";
}

function settingsCloudModelSelectHtml(settings, usage) {
  const claude = modelChoiceList(
    typeof CLAUDE_MODEL_CHOICES !== "undefined" ? CLAUDE_MODEL_CHOICES : [["claude-sonnet-5", "Claude Sonnet 5"]],
    settings.claude_model || usage.model || "claude-sonnet-5",
  );
  const openai = modelChoiceList(
    typeof OPENAI_MODEL_CHOICES !== "undefined" ? OPENAI_MODEL_CHOICES : [["gpt-5-mini", "GPT-5 mini"]],
    settings.openai_model || usage.openai_model || "gpt-5-mini",
  );
  const grok = modelChoiceList(
    typeof GROK_MODEL_CHOICES !== "undefined" ? GROK_MODEL_CHOICES : [["grok-4.5", "Grok 4.5"]],
    settings.grok_model || usage.grok_model || "grok-4.5",
  );
  const optionHtml = list => list.choices.map(([id, title]) =>
    `<option value="${escapeHtml(id)}" ${id === list.value ? "selected" : ""}>${escapeHtml(title)}</option>`
  ).join("");
  return `
    <div id="settings-cloud-model-panel" class="settings-model-grid">
      <div>
        <label for="cloud-model-select">Claude model</label>
        <select id="cloud-model-select">${optionHtml(claude)}</select>
      </div>
      <div>
        <label for="openai-model-select">ChatGPT model</label>
        <select id="openai-model-select">${optionHtml(openai)}</select>
      </div>
      <div>
        <label for="grok-model-select">Grok model</label>
        <select id="grok-model-select">${optionHtml(grok)}</select>
      </div>
      <div style="display:flex;align-items:flex-end;">
        <button class="secondary" id="save-cloud-model" type="button">Save models</button>
      </div>
    </div>
    <p class="stub" style="margin:6px 0 0;">Writes <code>CLAUDE_MODEL</code>, <code>OPENAI_MODEL</code>, and <code>GROK_MODEL</code> so each provider keeps working after a pull. Auto routing still picks a backend; these ids are what that backend runs.</p>`;
}

function settingsHarnessHtml(usage) {
  const live = usage.live_routing || {};
  const source = live.last_source || "none yet";
  const thinking = live.thinking || "";
  const thinkingLabel = thinking === "claude_extended"
    ? "Claude extended thinking (tools forced only after a missed call)"
    : thinking === "openai_reasoning"
      ? "OpenAI reasoning medium unless a tool retry is forced"
      : thinking === "grok_native"
        ? "Grok native — no Claude thinking traces"
        : "No live reply yet";
  const searchLabel = source === "claude"
    ? "Claude server web search + web_search tool"
    : "web_search tool";
  const writes = live.companion_writes === "auto"
    ? "Normal/strong auto-apply; deletes, repeats, and situations still confirm"
    : "Confirm before writes";
  return `
    <div class="settings-ai-manage" id="settings-harness-status">
      <div class="settings-ai-col">
        <strong style="font-size:12px;">Agent harness</strong>
        <div class="settings-ai-kv"><span>Live backend</span><strong>${escapeHtml(source)}</strong></div>
        <div class="settings-ai-kv"><span>Thinking</span><strong>${escapeHtml(thinkingLabel)}</strong></div>
        <div class="settings-ai-kv"><span>Web search</span><strong>${escapeHtml(searchLabel)}</strong></div>
        <div class="settings-ai-kv"><span>Writes</span><strong>${escapeHtml(writes)}</strong></div>
      </div>
    </div>`;
}

function settingsAiManageHtml(usage) {
  const live = usage.live_routing || {};
  const health = usage.backend_health || {};
  const routing = usage.routing || {};
  const pill = (backend) => {
    const row = health[backend] || {};
    if (row.rejected) return settingsStatusPill(`${backend} key rejected`, "status-warning");
    if (row.configured) return settingsStatusPill(`${backend} ready`, "status-good");
    return settingsStatusPill(`${backend} not set`, "");
  };
  const fallbackRows = Object.entries(routing).map(([role, info]) => {
    const chain = (info.fallback || []).join(" → ") || info.backend || "—";
    return `<div class="settings-ai-kv"><span>${escapeHtml(role)}</span><strong title="${escapeHtml(info.model || "")}">${escapeHtml(chain)}</strong></div>`;
  }).join("");
  return `
    <div class="settings-ai-manage" id="settings-ai-manage">
      <div class="settings-ai-col">
        <strong style="font-size:12px;">Provider health</strong>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">
          ${pill("claude")}${pill("openai")}${pill("grok")}${pill("ollama")}
        </div>
        <p class="stub" style="margin:0;">Last answer: <strong>${escapeHtml(live.last_source || "none yet")}</strong>
          ${live.last_reroute ? ` · rerouted ${escapeHtml(live.last_reroute.from || "")} → ${escapeHtml(live.last_reroute.to || "")}` : ""}</p>
      </div>
      <div class="settings-ai-col">
        <strong style="font-size:12px;">Fallback chain per role</strong>
        <div style="margin-top:8px;">${fallbackRows || '<p class="stub">No routing snapshot yet.</p>'}</div>
      </div>
    </div>`;
}

function settingsLocalAiStatusHtml(localAi) {
  const ready = !!(localAi && localAi.ready);
  const reachable = !!(localAi && localAi.ollama_reachable);
  const steps = (localAi && localAi.setup_steps) || [];
  const envPath = (localAi && localAi.env_path) || "";
  const tone = ready ? "status-good" : reachable ? "status-warning" : "status-warning";
  const label = ready ? "local AI ready" : reachable ? "Ollama up, pull a model" : "Ollama not reachable";
  return `
    <div id="settings-local-ai-status" class="settings-local-ai-status">
      ${settingsStatusPill(label, tone)}
      ${envPath ? `<p class="stub" style="margin:6px 0 0;">Env file: <code>${escapeHtml(envPath)}</code></p>` : ""}
      ${steps.length ? `<ul class="settings-quiet-list">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ul>` : ""}
    </div>`;
}

function focusSettingsSection() {
  const id = typeof SETTINGS_FOCUS_ID !== "undefined" ? SETTINGS_FOCUS_ID : null;
  if (!id) return;
  SETTINGS_FOCUS_ID = null;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("settings-section--focus");
  setTimeout(() => el.classList.remove("settings-section--focus"), 1600);
}

async function runLocalAiSetup() {
  try {
    const result = await api("/api/system/local-ai/setup", { method: "POST" });
    const ready = !!result.ready;
    showToast(ready ? "Local AI env written — Ollama reachable" : "Local AI env written — start Ollama, then refresh", ready ? "good" : "warn");
    if (typeof refreshHudData === "function") refreshHudData();
    if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Settings" && typeof render === "function") render();
    return result;
  } catch (err) {
    showToast(errorMessage(err), "warn");
    return null;
  }
}

function settingsApiStatusPillsHtml(usage, codeBackends) {
  const ollamaModels = codeBackends.ollama_models || [];
  const backendNames = codeBackends.backends || [];
  const ollamaReady = !!usage.local_model_available || ollamaModels.length > 0 || backendNames.includes("ollama");
  const anthropicTone = usage.anthropic_configured ? "status-good" : "";
  const openaiTone = usage.openai_configured ? "status-good" : "";
  const grokTone = usage.grok_configured ? "status-good" : "";
  const ollamaTone = ollamaReady ? "status-good" : "status-warning";
  return `
    <div class="settings-api-status-row" id="settings-api-status-pills">
      ${settingsStatusPill(`Anthropic ${usage.anthropic_configured ? "configured" : "not set"}`, anthropicTone)}
      ${settingsStatusPill(`OpenAI ${usage.openai_configured ? "configured" : "not set"}`, openaiTone)}
      ${settingsStatusPill(`Grok ${usage.grok_configured ? "configured" : "not set"}`, grokTone)}
      ${settingsStatusPill(`Ollama ${ollamaReady ? "reachable" : "not reachable"}`, ollamaTone)}
    </div>`;
}

// Three mutually exclusive modes, so the choice is a capsule track. It used to be three
// card-shaped panels, which read as content you could open rather than options you pick — and it
// meant the page showed three hints at once for a setting with one value. The hint for the
// selected mode now sits under the track; the others stay available as tooltips.
function settingsInferenceModeHtml(mode) {
  const modes = [
    ["cloud", "Cloud", "Claude/OpenAI/Grok when keys are set — uses routing below."],
    ["local", "Local (Ollama)", "Offline only — blocks paid cloud calls app-wide."],
    ["custom", "Custom", "Per-role routing — mix cloud backends yourself."],
  ];
  const selected = modes.find(([value]) => value === mode) || modes[0];
  return `
    <div class="settings-inference-modes">
      <div class="seg-pill" role="group" aria-label="Inference mode">
        ${modes.map(([value, label, hint]) => `
          <button type="button" class="seg-pill-btn settings-inference-btn ${mode === value ? "active" : ""}" data-inference-mode="${value}" id="inference-mode-${value}" title="${escapeHtml(hint)}"${mode === value ? ` aria-current="true"` : ""}>${escapeHtml(label)}</button>`).join("")}
      </div>
      <p class="stub settings-inference-hint" id="settings-inference-hint">${escapeHtml(selected[2])}</p>
    </div>`;
}

function settingsLocalModelSelectHtml(ollamaModels, selectedModel, usage) {
  const current = selectedModel || usage.local_model_name || ollamaModels[0] || "";
  const options = ollamaModels.length
    ? ollamaModels.map(model => `<option value="${escapeHtml(model)}" ${model === current ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")
    : `<option value="">No models found — pull one in Ollama</option>`;
  return `
    <div id="settings-local-model-panel" style="margin-top:12px;">
      <label style="font-size:11px;color:var(--ink-muted);display:block;">Ollama model</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;">
        <select id="local-model-select" style="flex:1;min-width:200px;">${options}</select>
        <button class="secondary" id="save-local-model" type="button">Save model</button>
        <button class="secondary" id="test-ollama-btn" type="button">Refresh status</button>
      </div>
      <p class="stub" style="margin:6px 0 0;" id="offline-ollama-detail">${ollamaModels.length
        ? `Using ${escapeHtml(current || "local model")} for compatible AI paths while Local mode is on.`
        : "Start Ollama, then run <code>ollama pull llama3.2:3b</code>."}</p>
      <span id="test-ollama-status" class="stub"></span>
    </div>`;
}

function settingsApiKeysCardHtml(usage, settings = {}) {
  const anthropicPh = usage.anthropic_configured ? "•••• configured" : "sk-ant-…";
  const openaiPh = usage.openai_configured ? "•••• configured" : "sk-…";
  const grokPh = usage.grok_configured ? "•••• configured" : "xai-…";
  const githubPh = settings.github_token_configured ? "•••• configured" : "ghp_… repo issues write";
  return `
    ${usage.anthropic_configured ? "" : `<div class="wp-anthropic-banner" id="settings-anthropic-fallback">Anthropic cannot be minted from this app. Agent already uses OpenAI, Grok, or Ollama as a first-class fallback. Paste a console.anthropic.com key only if you have one — nothing here creates or restores that key.</div>`}
    <div class="settings-api-keys-card" id="settings-api-keys-card">
      <strong style="font-size:12px;">API keys</strong>
      <p class="stub" style="margin:4px 0 10px;">Stored locally in the durable <code>.env</code> on this machine (survives a git pull). Keys are never echoed after save. Restart the app if a feature still says “not configured”.</p>
      <div class="card-grid">
        <div>
          <label style="font-size:11px;color:var(--ink-muted);display:block;">Anthropic API key</label>
          <input type="password" id="settings-anthropic-key" autocomplete="off" placeholder="${escapeHtml(anthropicPh)}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);display:block;">OpenAI API key</label>
          <input type="password" id="settings-openai-key" autocomplete="off" placeholder="${escapeHtml(openaiPh)}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);display:block;">xAI / Grok API key</label>
          <input type="password" id="settings-xai-key" autocomplete="off" placeholder="${escapeHtml(grokPh)}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);display:block;">GitHub token (optional, observations)</label>
          <input type="password" id="settings-github-token" autocomplete="off" placeholder="${escapeHtml(githubPh)}" style="width:100%;">
          <p class="stub" style="margin:4px 0 0;">Opens GitHub issues from the Observe widget. Without it, Send still opens the new-issue form.</p>
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);display:block;">GitHub repo</label>
          <input type="text" id="settings-github-repo" placeholder="helloso623/plan" value="${escapeHtml(settings.github_repo || "")}" style="width:100%;">
        </div>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="primary" id="save-api-keys" type="button">Save API keys</button>
        <span id="save-api-keys-status" class="stub"></span>
      </div>
    </div>`;
}

function settingsKeyHealthHtml(usage, codeBackends) {
  const backendNames = codeBackends.backends || [];
  const ollamaModels = codeBackends.ollama_models || [];
  const ollamaReady = !!usage.local_model_available || ollamaModels.length > 0 || backendNames.includes("ollama");
  const cloudTone = usage.api_enabled ? "status-good" : "status-critical";
  return `
    <div class="settings-mini-grid">
      <div class="settings-mini-panel">
        ${settingsStatusPill(usage.api_enabled ? "enabled" : "disabled", cloudTone)}
        <strong style="font-size:12px;margin-left:6px;">Cloud API switch</strong>
        <p class="stub" style="margin:5px 0 0;">${usage.api_enabled ? "Paid cloud calls are allowed when credentials are configured." : "Paid cloud calls are blocked by the kill switch."}</p>
      </div>
      <div class="settings-mini-panel">
        ${settingsStatusPill(backendNames.includes("claude") || usage.anthropic_configured ? "configured" : "not configured", usage.anthropic_configured ? "status-good" : "")}
        <strong style="font-size:12px;margin-left:6px;">Claude / Anthropic</strong>
        <p class="stub" style="margin:5px 0 0;">${usage.anthropic_configured ? "Anthropic key present — Claude routes can run when the API switch allows." : "No Anthropic key configured."}</p>
      </div>
      <div class="settings-mini-panel">
        ${settingsStatusPill(usage.openai_configured ? "configured" : "not configured", usage.openai_configured ? "status-good" : "")}
        <strong style="font-size:12px;margin-left:6px;">OpenAI</strong>
        <p class="stub" style="margin:5px 0 0;">${usage.openai_configured ? "OpenAI-backed routes can run if the API switch is enabled." : "No OpenAI key is configured."}</p>
      </div>
      <div class="settings-mini-panel">
        ${settingsStatusPill(usage.grok_configured ? "configured" : "not configured", usage.grok_configured ? "status-good" : "")}
        <strong style="font-size:12px;margin-left:6px;">Grok / xAI</strong>
        <p class="stub" style="margin:5px 0 0;">${usage.grok_configured ? "Grok-backed routes can run if the API switch is enabled." : "No xAI key is configured."}</p>
      </div>
      <div class="settings-mini-panel">
        ${settingsStatusPill(ollamaReady ? "reachable" : "not reachable", ollamaReady ? "status-good" : "status-warning")}
        <strong style="font-size:12px;margin-left:6px;">Ollama</strong>
        <p class="stub" style="margin:5px 0 0;">${ollamaReady ? `${ollamaModels.length || 1} local model${(ollamaModels.length || 1) === 1 ? "" : "s"} detected.` : "Start Ollama and pull a model for local fallback."}</p>
      </div>
    </div>`;
}

function settingsShortcutsHtml() {
  const shortcuts = [
    ["Shell", "Alt+H", "Open Home launcher"],
    ["Shell", "Alt+Left / Alt+Right", "Navigate app history"],
    ["Shell", "Cmd/Ctrl+K", "Open command palette"],
    ["Launcher", "/", "Search apps"],
    ["Launcher", "Arrow keys", "Move launcher focus"],
    ["Launcher", "Enter", "Launch focused app"],
    ["Launcher", "Esc", "Close overlay or return Home"],
    ["Planner", "1-9", "Preview/apply planning categories while painting"],
    ["Planner", "Drag hours", "Paint timeline blocks"],
    ["Blueprint", "Space", "Open node palette"],
    ["Blueprint", "Delete", "Delete selection"],
    ["Blueprint", "Cmd/Ctrl+C / V / D", "Copy, paste, duplicate graph selection"],
    ["Blueprint", "Cmd/Ctrl+Z", "Undo; Shift+Cmd/Ctrl+Z redo"],
    ["Blueprint", "F", "Frame graph or selected nodes"],
    ["Blueprint", "A / G / R", "Align menu, group comment, reroute selected wire"],
  ];
  return `
    <input id="settings-shortcuts-search" type="search" placeholder="Search shortcuts..." style="width:100%;margin:8px 0 10px;">
    <div id="settings-shortcuts-list">
      ${shortcuts.map(([area, keys, action]) => `
        <div class="settings-shortcut-row" data-shortcut="${escapeHtml(`${area} ${keys} ${action}`.toLowerCase())}" style="display:grid;grid-template-columns:100px 160px 1fr;gap:8px;padding:7px 0;border-bottom:1px solid var(--gridline);font-size:12px;">
          <span class="stub">${escapeHtml(area)}</span>
          <code>${escapeHtml(keys)}</code>
          <span>${escapeHtml(action)}</span>
        </div>`).join("")}
    </div>`;
}

function settingsLanguageHtml() {
  const lang = typeof getLang === "function" ? getLang() : (settingsStorageGet("waypoint_lang", "en"));
  return `
    <label class="settings-mini-panel" style="margin-top:12px;">
      <span class="stub" style="display:block;font-size:11px;" data-i18n="settings.language">Language</span>
      <select id="settings-lang-select" style="width:100%;margin-top:6px;">
        <option value="en" ${lang === "en" ? "selected" : ""} data-i18n-label="lang.en">English</option>
        <option value="fr" ${lang === "fr" ? "selected" : ""} data-i18n-label="lang.fr">Français</option>
      </select>
    </label>
    <p class="stub" style="margin:10px 0 0;line-height:1.5;" id="settings-math-tip" data-i18n="settings.mathTip">Agent &amp; Companion understand math: LaTeX (\\frac{a}{b}, \\sqrt{x}, x^2), unicode (× ÷ √ ² ½), and inline fractions like 3/4. Write formulas naturally — no special mode needed.</p>`;
}

// Two options each, and each one changes the page you are looking at the instant it is chosen.
// A dropdown made that a two-act control that also hid the alternative; a capsule track shows
// both states and applies on one click.
const SETTINGS_DISPLAY_PREFS = [
  { key: "density", label: "Density", fallback: "comfortable", options: [["comfortable", "Comfortable"], ["compact", "Compact"]] },
  { key: "motion", label: "Motion", fallback: "full", options: [["full", "Full"], ["reduced", "Reduced"]] },
  { key: "contrast", label: "Contrast", fallback: "standard", options: [["standard", "Standard"], ["high", "High contrast"]] },
];

function settingsDisplayControlsHtml(prefs) {
  const panels = SETTINGS_DISPLAY_PREFS.map(({ key, label, options }) => {
    const buttons = options.map(([value, optionLabel]) => {
      const active = prefs[key] === value;
      return `<button type="button" class="seg-pill-btn settings-pref-btn${active ? " active" : ""}" data-display-pref="${escapeHtml(key)}" data-display-value="${escapeHtml(value)}"${active ? ` aria-current="true"` : ""}>${escapeHtml(optionLabel)}</button>`;
    }).join("");
    return `
      <div class="settings-mini-panel">
        <span class="stub" style="display:block;font-size:11px;">${escapeHtml(label)}</span>
        <div class="seg-pill settings-pref-seg" role="group" aria-label="${escapeHtml(label)}" style="margin-top:6px;">${buttons}</div>
      </div>`;
  }).join("");
  return `
    <div class="settings-mini-grid">${panels}</div>
    <p class="stub" style="margin:8px 0 0;">Saved to localStorage and applied as root CSS classes/variables so the HUD can read these preferences later.</p>`;
}

async function runBudgetOptimizer() {
  const btn = document.getElementById("budget-optimize-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running optimizer...';
  }
  try {
    const result = await api("/api/budget/optimize", { method: "POST" });
    renderBudgetRecommendations(result.recommendations || []);
    const status = document.getElementById("budget-optimize-status");
    if (status) status.textContent = result.path ? `Report written to ${result.path}` : "Done.";
    return result;
  } catch (err) {
    window.alert(errorMessage(err));
    throw err;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Run budget optimizer";
    }
  }
}

function renderBudgetRecommendations(recs) {
  const el = document.getElementById("budget-recommendations");
  if (!el) return;
  if (!recs.length) {
    el.innerHTML = '<p class="stub">No recommendations — routing and spend look reasonable.</p>';
    return;
  }
  el.innerHTML = recs.map(r => `
    <div style="border-top:1px solid var(--gridline); padding:10px 0;">
      <strong style="font-size:12px;">${escapeHtml(r.finding)}</strong>
      <p class="stub" style="margin:4px 0 0;">${escapeHtml(r.recommendation)}</p>
    </div>`).join("");
}

function drawBudgetSpendChart(byDay) {
  const el = document.getElementById("budget-spend-chart");
  if (!el || !window.Plotly) return;
  if (!byDay.length) {
    el.innerHTML = '<p class="stub" style="padding:24px 0; text-align:center;">No API spend recorded in the last 30 days.</p>';
    return;
  }
  const theme = plotlyThemeVars();
  el.innerHTML = "";
  Plotly.newPlot(el, [{
    x: byDay.map(d => d.date),
    y: byDay.map(d => d.cost_usd),
    type: "bar",
    marker: { color: theme.inkMuted || theme.ink },
    hovertemplate: "%{x}<br>$%{y:.4f}<extra></extra>",
  }], settingsPlotlyLayout(theme, {
    yaxis: { ...settingsPlotlyLayout(theme).yaxis, title: "USD", rangemode: "tozero" },
    xaxis: { ...settingsPlotlyLayout(theme).xaxis, title: "" },
  }), { displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] });
}

async function renderSettings() {
  const [settings, usage, budgetReport, googleStatus, pronoteStatus, security, syncSnap, version, codeBackends, automationRules, localRagStatus, localAi, nyuStatus] = await Promise.all([
    settingsApiOr("/api/about", {}),
    settingsApiOr("/api/usage", {
      total_tokens: 0,
      estimated_cost_usd: 0,
      by_model: [],
      routing: {},
      api_enabled: false,
      openai_configured: false,
      anthropic_configured: false,
      grok_configured: false,
      local_model_available: false,
      local_model_name: "",
    }),
    settingsApiOr("/api/budget/report", { by_model: [], by_day: [], spent_this_month: 0, spent_today: 0, budget_status: "ok" }),
    settingsApiOr("/api/google/status", { connected: false, configured: false }),
    settingsApiOr("/api/school/pronote/status", { library_available: false, configured: false, connected_school: null }),
    settingsApiOr("/api/system/security", { gate_enabled: false, trust_localhost: true }),
    settingsApiOr("/api/sync", { payload: {}, role: "peer", bind_host: "127.0.0.1" }),
    settingsApiOr("/api/system/version", {}),
    settingsApiOr("/api/code/backends", { backends: [], ollama_models: [] }),
    settingsApiOr("/api/rules", []),
    settingsApiOr("/api/local-rag/status", { index_exists: false, chunk_count: 0, ollama_available: false }),
    settingsApiOr("/api/system/local-ai", { ready: false, setup_steps: [], ollama_reachable: false, env_path: "", models: [] }),
    settingsApiOr("/api/nyu/status", {
      apps: [],
      oauth_configured: false,
      connected: false,
      ics_saved: false,
      ics_url: "",
      can_sync: false,
      redirect_uri: "",
      limits: {},
    }),
  ]);
  if (!(nyuStatus.apps || []).length) {
    nyuStatus.apps = [
      { id: "brightspace", name: "Brightspace", url: "https://brightspace.nyu.edu/d2l/home", blurb: "Courses, assignments, grades, and the calendar feed." },
      { id: "albert", name: "Albert", url: "https://albert.nyu.edu/student", blurb: "Registration and official schedule. No student API — paste or export." },
      { id: "home", name: "NYU Home", url: "https://home.nyu.edu/", blurb: "Campus portal. SSO launchpad, not a data API." },
      { id: "email", name: "NYU Email", url: "https://mail.nyu.edu/", blurb: "Google Workspace. Connect Google in Settings for mail/calendar." },
    ];
  }
  const displayPrefs = settingsDisplayPrefs();
  settingsApplyDisplayPrefs(displayPrefs);
  const routing = usage.routing || {};
  const inferenceMode = settingsInferenceMode(settings);
  const offlineMode = inferenceMode === "local" || settingsBool(settings.offline_mode);
  const selfCodingOn = settingsBool(settings.self_coding_enabled);
  const vibecodeOn = settingsBool(settings.vibecode_enabled);
  const ollamaModels = codeBackends.ollama_models || [];
  const availableBackends = codeBackends.backends || [];
  const ollamaReachable = !!usage.local_model_available || ollamaModels.length > 0 || availableBackends.includes("ollama");
  const localModelName = settings.local_model_name || usage.local_model_name || ollamaModels[0] || "";
  const lastOllamaTest = settingsStorageGet("settings_ollama_last_test", "");
  const routeSelect = (role, options) => `
    <label style="font-size:11px;color:var(--ink-muted);display:block;margin-top:8px;">${escapeHtml(role)} routing</label>
    <select id="route-${role}" style="width:100%;">
      ${options.map(opt => `<option value="${opt}" ${(settings[`route_${role}`] || routing[role]?.default_backend || "auto") === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("")}
    </select>
    <div class="stub" style="font-size:11px;margin-top:3px;">Current: ${escapeHtml(routing[role]?.backend || "unknown")} / ${escapeHtml(routing[role]?.model || "unknown")}</div>`;
  const cloudRoles = ["auto", "claude", "openai", "grok"];
  const live = usage.live_routing || {};
  const liveLine = live.last_reroute
    ? `Last answer: <strong>${escapeHtml(live.last_source || "—")}</strong> (rerouted from ${escapeHtml(live.last_reroute.from || "")}${live.last_reroute.reason ? ` — ${escapeHtml(String(live.last_reroute.reason).slice(0, 80))}` : ""})`
    : `Last answer: <strong>${escapeHtml(live.last_source || "none yet")}</strong>`;

  const budget = budgetReport.budget_usd_month;
  const spent = budgetReport.spent_this_month || 0;
  const status = budgetReport.budget_status || "ok";
  const pct = budget && budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const budgetLabel = budget && budget > 0
    ? `$${spent.toFixed(2)} of $${budget.toFixed(2)} this month (${pct.toFixed(0)}%)`
    : `$${spent.toFixed(2)} spent this month (no budget set)`;

  const dailyCap = budgetReport.daily_cap != null ? budgetReport.daily_cap : 3;
  const spentToday = budgetReport.spent_today || 0;
  const dailyRatio = dailyCap > 0 ? spentToday / dailyCap : 0;
  const dailyPct = Math.min(100, dailyRatio * 100);
  const dailyStatus = dailyRatio >= 1 ? "over" : dailyRatio >= 0.7 ? "warning" : "ok";
  const dailyLabel = `$${spentToday.toFixed(2)} of $${dailyCap.toFixed(2)} today (${dailyPct.toFixed(0)}%)`;

  const modelRows = (budgetReport.by_model || []).length
    ? budgetReport.by_model.map(m => `
        <tr>
          <td>${escapeHtml(m.model)}</td>
          <td style="text-align:right;">${(m.input_tokens + m.output_tokens).toLocaleString()}</td>
          <td style="text-align:right;">$${(m.estimated_cost_usd || 0).toFixed(4)}</td>
        </tr>`).join("")
    : '<tr><td colspan="3" class="stub">No usage recorded yet.</td></tr>';

  const themeLabel = document.documentElement.getAttribute("data-theme") === "light"
    ? (typeof t === "function" ? t("btn.themeDark") : "Switch to dark")
    : (typeof t === "function" ? t("btn.themeLight") : "Switch to light");
  const gateStatus = security.gate_enabled
    ? `<span class="pill status-warning">enabled</span> — set <code>APP_ACCESS_TOKEN</code> in the environment`
    : `<span class="pill status-good">disabled</span> — no token set; localhost-only use is unchanged`;
  const localhostTrust = security.trust_localhost
    ? "127.0.0.1 is always allowed (APP_TRUST_LOCALHOST=true)."
    : "Localhost bypass is off — token required even on this machine.";
  const tailscaleTrust = security.trust_tailscale
    ? "Tailnet peers (100.x / fd7a:…) are trusted (APP_TRUST_TAILSCALE=true)."
    : "Tailnet peers need the access token unless you use Tailscale Serve to localhost.";
  const tailscaleUrls = Array.isArray(security.tailscale_urls)
    ? security.tailscale_urls.filter(url => url && !String(url).includes("0.0.0.0"))
    : [];
  const tailscaleUrlHtml = tailscaleUrls.length
    ? `<div style="font-size:12px; margin:0 0 12px;">Tailscale URLs: ${tailscaleUrls.map(url => `<code>${escapeHtml(url)}</code>`).join(" · ")}</div>`
    : `<p class="stub" style="margin:0 0 12px;">Tailscale: run <code>python run_tailscale.py</code> (or <code>.\\run_tailscale.ps1</code> on Windows) after <code>tailscale up</code>.</p>`;
  const versionLabel = version.hash
    ? `${escapeHtml(version.hash)}${version.branch ? ` · ${escapeHtml(version.branch)}` : ""}`
    : "unknown";

  const pronoteLib = pronoteStatus.library_available
    ? settingsStatusPill("library installed", "status-good")
    : settingsStatusPill("pronotepy not installed", "status-warning");
  const pronoteCfg = pronoteStatus.configured
    ? settingsStatusPill("credentials saved", "status-good")
    : settingsStatusPill("not configured", "");
  const pronoteSchool = pronoteStatus.connected_school
    ? ` · ${escapeHtml(pronoteStatus.connected_school)}`
    : "";

  return `
    <div class="card settings-section settings-section-routing${offlineMode ? " settings-offline-on" : ""}" id="inference-settings-card">
      <strong style="font-size:13px;" id="settings-model-anchor">Models &amp; routing</strong>
      <p class="stub" style="margin:4px 0 8px;">Claude, ChatGPT, and Grok can each run the full app. Set a preferred provider per role — if that API fails, Waypoint reroutes to the next working one and shows it here and on the HUD chip.</p>
      ${settingsErrorNotice("/api/usage", usage)}
      ${settingsErrorNotice("/api/code/backends", codeBackends)}
      <div style="font-size:11px;color:var(--ink-muted);margin-bottom:4px;">Inference mode</div>
      ${settingsInferenceModeHtml(inferenceMode)}
      <p class="stub settings-card-status" id="offline-status-summary">${offlineMode
        ? `<strong style="color:var(--status-warning);">Local mode</strong> — cloud AI blocked; Ollama is <strong>${ollamaReachable ? "reachable" : "not reachable"}</strong>.`
        : inferenceMode === "cloud"
          ? `Cloud mode — routing uses your selects below. Ollama is <strong>${ollamaReachable ? "reachable" : "not reachable"}</strong> as fallback.`
          : `Custom routing — per-role backends below. Ollama is <strong>${ollamaReachable ? "reachable" : "not reachable"}</strong>.`}</p>
      ${inferenceMode === "local" ? settingsLocalModelSelectHtml(ollamaModels, localModelName, usage) : settingsCloudModelSelectHtml(settings, usage)}
      ${inferenceMode !== "local" ? `
        ${settingsApiStatusPillsHtml(usage, codeBackends)}
        ${settingsAiManageHtml(usage)}
        ${settingsHarnessHtml(usage)}
        <p class="stub" id="settings-live-routing" style="margin:0 0 10px;">${liveLine}</p>
        <div class="card-grid" id="settings-routing-grid">
          <div>
            ${routeSelect("chat", cloudRoles)}
            ${routeSelect("planning", cloudRoles)}
            ${routeSelect("judgment", cloudRoles)}
            ${routeSelect("roleplay", cloudRoles)}
          </div>
          <div>
            ${routeSelect("tasks", ["auto", "claude", "openai", "grok", "ollama"])}
            ${routeSelect("practice", ["auto", "claude", "openai", "grok", "ollama"])}
            ${routeSelect("coding", ["auto", "claude", "openai", "grok", "ollama"])}
          </div>
        </div>
        <div style="margin-top:12px;"><button class="primary" id="save-routing">Save routing</button></div>
      ` : ""}
      ${settingsApiKeysCardHtml(usage, settings)}
      <div class="card" style="margin-top:12px;">
        <strong style="font-size:12px;">Data, sharing, and chrome</strong>
        <p class="stub" style="margin:4px 0 8px;">Export everything about you, send Waypoint to someone else, or strip game chrome. Game-off writes <code>wp-hide-game</code> so other tabs hide loot, arcade, and Parallel chrome.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <button type="button" class="primary" id="settings-export-me">Export everything</button>
          <button type="button" class="secondary" id="settings-export-profile">Download profile + activity</button>
          <button type="button" class="secondary" id="settings-share-app">Send the app to someone</button>
          <label style="font-size:12px;"><input type="checkbox" id="settings-game-off" ${settingsGameOffEnabled() ? "checked" : ""}> Remove all game features</label>
          <label style="font-size:12px;"><input type="checkbox" id="settings-spellcheck" ${localStorage.getItem("waypointSpellcheck") !== "off" ? "checked" : ""}> Spelling correction</label>
        </div>
        <p class="stub" id="settings-export-status" style="margin:8px 0 0;"></p>
        <p class="stub" id="settings-share-preview" style="margin:8px 0 0;white-space:pre-wrap;"></p>
        <details id="settings-ai-failures" style="margin-top:12px;">
          <summary style="cursor:pointer;font-size:12px;font-weight:700;">AI failure log — classify to improve the agent</summary>
          <p class="stub" style="margin:6px 0;">Extend classification of what failed. Send a row to the Napkin if you want it worked.</p>
          <div id="settings-ai-failures-list" class="stub">Loading…</div>
          <form id="settings-ai-failure-add" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;">
            <select id="settings-ai-failure-kind" aria-label="Failure class">
              <option value="tool">tool</option>
              <option value="model">model</option>
              <option value="prompt">prompt</option>
              <option value="data">data</option>
              <option value="other">other</option>
            </select>
            <input type="text" id="settings-ai-failure-detail" placeholder="What failed" style="flex:1;min-width:160px;">
            <button type="submit" class="secondary">Log failure</button>
          </form>
        </details>
      </div>
      <details style="margin-top:14px;" ${inferenceMode === "local" ? "open" : ""}>
        <summary style="cursor:pointer;font-size:12px;font-weight:700;">Installed local models</summary>
        <div style="margin-top:8px;">${settingsOllamaModelsHtml(ollamaModels)}</div>
        ${lastOllamaTest ? `<p class="stub" style="margin:8px 0 0;">Last successful test: ${escapeHtml(lastOllamaTest)}</p>` : ""}
      </details>
      ${inferenceMode === "local" ? `
        <details style="margin-top:10px;">
          <summary style="cursor:pointer;font-size:12px;font-weight:700;">What will not work offline</summary>
          <ul class="settings-quiet-list">
            <li>Cloud AI calls through Claude/OpenAI will fail or stay blocked.</li>
            <li>Web-backed research and uncached remote actions need network access.</li>
            <li>Image generation needs the remote image provider unless another zone adds a local path.</li>
            <li>Google sync needs network access and a connected Google account.</li>
          </ul>
        </details>
        <details style="margin-top:10px;">
          <summary style="cursor:pointer;font-size:12px;font-weight:700;">What still works locally</summary>
          <ul class="settings-quiet-list">
            <li>Planner day painting, tasks, calendar data already in SQLite, and notes.</li>
            <li>Local Arcade games, Blueprint editing, backups, exports, and saved settings.</li>
            <li>Ollama-capable AI paths when a local model is reachable.</li>
          </ul>
        </details>
      ` : ""}
    </div>

    <div class="card" id="settings-updates-card">
      <strong style="font-size:13px;">Updates &amp; local AI</strong>
      <p class="stub" style="margin:4px 0 8px;">Current version: <code id="settings-version-label">${versionLabel}</code></p>
      <p class="stub" style="margin:0 0 8px;">After a git pull this reinstalls <code>requirements.txt</code> and fills any new <code>.env.example</code> keys so local AI still starts. Then restart the app.</p>
      ${settings.git_pull ? `<p class="stub" style="margin:0 0 8px;${settings.git_pull.ok ? "" : "color:var(--status-warning);"}">Launcher git pull: ${settings.git_pull.ok ? "ok" : "failed or not fast-forward"} — <code style="white-space:pre-wrap;display:block;margin-top:4px;">${escapeHtml(settings.git_pull.log || "")}</code></p>` : `<p class="stub" style="margin:0 0 8px;">Launcher git pull log will appear here after the next desktop launch (<code>plan/last-git-pull.log</code>).</p>`}
      ${(settings.recent_errors || []).length ? `<details style="margin:0 0 8px;"><summary style="cursor:pointer;font-size:12px;">Recent swallowed errors (${settings.recent_errors.length})</summary><ul class="settings-quiet-list">${settings.recent_errors.map(e => `<li><code>${escapeHtml(e.where || "")}</code> ${escapeHtml(e.error || "")} <span class="stub">${escapeHtml(e.at || "")}</span></li>`).join("")}</ul></details>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <button class="secondary" id="settings-update-git" type="button">Update from git</button>
        <button class="secondary" id="settings-verify-local-ai" type="button">Verify local AI</button>
        <button class="secondary" id="settings-setup-local-ai" type="button">Set up local AI</button>
      </div>
      ${settingsLocalAiStatusHtml(localAi)}
    </div>

    <div class="card settings-section settings-section-security">
      <strong style="font-size:13px;">Security &amp; remote access</strong>
      <p class="stub" style="margin:4px 0 8px;">Optional access gate for phone, LAN, or Tailscale. Set <code>APP_ACCESS_TOKEN</code> in the environment and restart the app to enable. ${localhostTrust} ${tailscaleTrust}</p>
      ${settingsErrorNotice("/api/about", settings)}
      ${settingsErrorNotice("/api/system/security", security)}
      <div style="font-size:12px; margin-bottom:8px;">Gate status: ${gateStatus}</div>
      ${tailscaleUrlHtml}
      <label style="font-size:11px;color:var(--ink-muted);display:block;">Discord webhook URL</label>
      <input type="url" id="discord-webhook-url" placeholder="https://discord.com/api/webhooks/..." value="${escapeHtml(settings.discord_webhook_url || "")}" style="width:100%;">
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="secondary" id="save-discord-webhook">Save webhook</button>
        <button class="secondary" id="test-discord-webhook">Send test</button>
      </div>
    </div>

    <div class="card ${selfCodingOn ? "settings-self-coding-on" : ""} settings-section settings-section-security" id="self-coding-card">
      <strong style="font-size:13px;">Developer mode / Self-coding</strong>
      <p class="stub" style="margin:4px 0 8px;color:var(--status-critical);font-weight:600;">Dangerous — weaker models (Haiku, GPT-mini, Ollama) never get code-editing tools even when this is on. Every file edit and shell command still needs your manual approval before anything runs.</p>
      <p class="stub" style="margin:0 0 8px;">By default the assistant only organizes your data (tasks, events, notes). Turn this on to let strong cloud models read and propose edits to this app's own code (approval-gated, sandboxed to this project).</p>
      <span class="pill ${selfCodingOn ? "status-critical" : ""}" id="self-coding-pill">${selfCodingOn ? "enabled" : "off"}</span>
      <label style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer;">
        <input type="checkbox" id="self-coding-toggle" ${selfCodingOn ? "checked" : ""} style="width:18px;height:18px;">
        <span>Allow AI to read and propose app code changes</span>
      </label>
      <p class="stub" id="self-coding-hint" style="margin:8px 0 0;">${selfCodingOn
        ? "Self-coding is on — only Claude-class routes can stage edits; you must approve every change before it runs."
        : "Self-coding is off — the Agent and Code tab cannot stage file edits or shell commands."}</p>
    </div>

    <div class="card ${vibecodeOn ? "settings-vibecode-on" : ""} settings-section settings-section-routing" id="vibecode-card">
      <strong style="font-size:13px;">Vibecode (AI graph generation)</strong>
      <p class="stub" style="margin:4px 0 8px;">Claude-class models only. Off by default. When off, describe a plan and apply graph changes yourself in Blueprint.</p>
      <span class="pill ${vibecodeOn ? "status-good" : ""}" id="vibecode-pill">${vibecodeOn ? "enabled" : "off"}</span>
      <label style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer;">
        <input type="checkbox" id="vibecode-toggle" ${vibecodeOn ? "checked" : ""} style="width:18px;height:18px;">
        <span>Allow AI to generate or fix Automation Studio graphs</span>
      </label>
      <p class="stub" id="vibecode-hint" style="margin:8px 0 0;">${vibecodeOn
        ? "Vibecode is on — Blueprint Vibecode / Continue-Fix buttons call cloud AI when a strong model is routed."
        : "Vibecode is off — Blueprint hides AI graph buttons; edit nodes and wires manually."}</p>
    </div>

    <div class="card settings-section settings-section-routing">
      <strong style="font-size:13px;">Privacy dashboard</strong>
      <p class="stub settings-card-status">Each AI feature shows the backend/model and the data boundary before you use it.</p>
      ${settingsPrivacyDashboardHtml(routing)}
    </div>

    <div class="card settings-section settings-section-routing">
      <strong style="font-size:13px;">Key health</strong>
      <p class="stub settings-card-status">Secrets stay redacted; this only reports configured/not configured or reachable/not reachable.</p>
      ${settingsKeyHealthHtml(usage, codeBackends)}
    </div>

    <details class="card">
      <summary style="cursor:pointer;font-size:13px;font-weight:700;">Keyboard shortcuts</summary>
      <p class="stub settings-card-status">Reference map — editing shortcuts is not wired yet.</p>
      ${settingsShortcutsHtml()}
    </details>

    <div class="card settings-section settings-section-budget">
      <strong style="font-size:13px;">Token budget</strong>
      <p class="stub" style="margin:4px 0 8px;"><strong>results &gt; cost</strong> — the optimizer removes waste, never downgrades quality.</p>
      <label style="font-size:11px;color:var(--ink-muted);display:block;">Monthly budget (USD)</label>
      <input type="number" id="budget-usd-month" min="0" step="1" placeholder="e.g. 50" value="${budget != null ? escapeHtml(String(budget)) : ""}" style="max-width:160px;">
      <button class="secondary" id="save-budget" style="margin-left:8px;">Save budget</button>
      <label style="font-size:11px;color:var(--ink-muted);display:block;margin-top:12px;">Daily cap (USD)</label>
      <input type="number" id="daily-budget-usd" min="0" step="0.5" placeholder="3" value="${escapeHtml(String(settings.daily_budget_usd != null && settings.daily_budget_usd !== "" ? settings.daily_budget_usd : dailyCap))}" style="max-width:160px;">
      <button class="secondary" id="save-daily-cap" style="margin-left:8px;">Save daily cap</button>
      <div class="settings-budget-meter">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
          <span>Today: ${dailyLabel}</span>
          <span class="pill ${dailyStatus === "over" ? "status-critical" : dailyStatus === "warning" ? "status-warning" : "status-good"}">${dailyStatus}</span>
        </div>
        <div class="settings-budget-track">
          <div class="settings-budget-fill" style="width:${dailyPct}%; background:${dailyCapBarColor(dailyRatio)};"></div>
        </div>
      </div>
      <div class="settings-budget-meter">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
          <span>${budgetLabel}</span>
          <span class="pill ${status === "over" ? "status-critical" : status === "warning" ? "status-warning" : "status-good"}">${status}</span>
        </div>
        <div class="settings-budget-track">
          <div class="settings-budget-fill" style="width:${budget && budget > 0 ? pct : spent > 0 ? 100 : 0}%; background:${budgetBarColor(status)};"></div>
        </div>
      </div>
      <div id="budget-spend-chart" style="margin-top:16px; min-height:220px;"></div>
      <table style="width:100%; font-size:12px; margin-top:12px; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--gridline); text-align:left;">
            <th style="padding:6px 0;">Model</th>
            <th style="padding:6px 0; text-align:right;">Tokens</th>
            <th style="padding:6px 0; text-align:right;">Est. cost</th>
          </tr>
        </thead>
        <tbody>${modelRows}</tbody>
      </table>
      ${settingsUsagePeriodHtml(usage)}
      <div style="margin-top:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="primary" id="budget-optimize-btn">Run budget optimizer</button>
        <span id="budget-optimize-status" class="stub"></span>
      </div>
      <div id="budget-recommendations" style="margin-top:8px;"></div>
    </div>

    <div class="card settings-section settings-section-data" id="settings-instance-sync">
      <strong style="font-size:13px;">Instance sync</strong>
      <p class="stub" style="margin:4px 0 8px;">Different instances stay in sync by pushing this machine's snapshot and pulling it on another Tailscale host. Merge is additive (tasks, events, and napkins union by id) — local rows are never wiped. Bind never uses 0.0.0.0; Tailscale retries, then 127.0.0.1.</p>
      <p class="stub" style="margin:0 0 8px;">Bind host: <code id="settings-sync-bind">${escapeHtml(settingsSafeBindHost((syncSnap && syncSnap.bind_host) || location.hostname))}</code></p>
      <p class="stub" style="margin:0 0 8px;">Last sync: <span id="settings-sync-last">${escapeHtml((syncSnap && (syncSnap.updated_at || syncSnap.last_seen)) || "never")}</span></p>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 10px;cursor:pointer;">
        <input type="checkbox" id="settings-sync-as-server" ${(syncSnap && syncSnap.role) === "server" ? "checked" : ""}>
        This machine is the server
      </label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <button type="button" class="primary" id="settings-sync-push">Push snapshot</button>
        <button type="button" class="secondary" id="settings-sync-pull">Pull snapshot</button>
      </div>
      <p class="stub" id="settings-sync-meta" style="margin:8px 0 0;">${(syncSnap && syncSnap.updated_at) ? `Snapshot ${escapeHtml(syncSnap.role || "peer")} · ${escapeHtml(syncSnap.updated_at)}` : "No snapshot loaded yet."}</p>
    </div>

    <div class="card settings-section settings-section-data">
      <strong style="font-size:13px;">What the app knows about you</strong>
      <p class="stub" style="margin:4px 0 8px;">Self-learned profile — updated automatically after each day save. Edit here to correct or trim anything wrong.</p>
      <textarea id="user-profile" rows="10" style="width:100%; font-size:12px; font-family:inherit; resize:vertical;" placeholder="(empty — the app will build this from your daily reflections)">${escapeHtml(settings.user_profile || "")}</textarea>
      <div style="margin-top:8px;">
        <button class="secondary" id="save-user-profile">Save profile</button>
      </div>
    </div>

    <div class="card settings-section settings-section-data">
      <strong style="font-size:13px;">Data</strong>
      <p class="stub" style="margin:4px 0 8px;">Your planner data lives in a local SQLite file (<code>planner.db</code>) on this machine only — not synced to any cloud by default.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="secondary" id="settings-backup-btn">Backup now</button>
        <button class="secondary" id="settings-trash-btn">Recently deleted</button>
      </div>
    </div>

    <div class="card">
      <strong style="font-size:13px;">Appearance</strong>
      <div style="display:flex; align-items:center; gap:12px; margin-top:8px; flex-wrap:wrap;">
        <button class="secondary" id="settings-theme-btn">${themeLabel}</button>
        <span class="stub">Theme is global; density, motion, and contrast are local device preferences.</span>
      </div>
      <div style="margin-top:12px;">
        ${settingsDisplayControlsHtml(displayPrefs)}
        ${settingsLanguageHtml()}
      </div>
    </div>

    <div class="card">
      <strong style="font-size:13px;">Audit note</strong>
      <p class="stub settings-card-status">Current logs are useful but not yet a full audit trail.</p>
      <ul class="settings-quiet-list">
        <li>API usage logs store model names, token totals, estimated cost, and timestamps for budget reporting.</li>
        <li>Budget reports aggregate daily/model spend; they do not expose prompt text or API keys.</li>
        <li>Settings saves persist the latest values through <code>/api/about</code>; there is no complete settings-change audit endpoint yet.</li>
        <li>Backups record snapshot files when you run them, but restore/destructive-action audit views depend on existing backend support.</li>
      </ul>
    </div>

    <div class="card settings-section settings-section-integrations" id="nyu-integrations-card">
      <strong style="font-size:13px;">NYU</strong>
      <p class="stub settings-card-status">Brightspace calendar and assignments can sync. Albert, NYU Home, email, and the rest of campus have no student data API — those tiles open the official apps.</p>
      ${settingsErrorNotice("/api/nyu/status", nyuStatus)}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">
        ${settingsStatusPill(nyuStatus.ics_saved ? "calendar feed saved" : "no calendar feed", nyuStatus.ics_saved ? "status-good" : "")}
        ${settingsStatusPill(nyuStatus.connected ? "Brightspace API connected" : nyuStatus.oauth_configured ? "API credentials saved" : "API optional", nyuStatus.connected ? "status-good" : nyuStatus.oauth_configured ? "status-warning" : "")}
      </div>
      <div class="nyu-app-grid" id="nyu-app-grid">
        ${(nyuStatus.apps || []).map(app => `
          <a class="nyu-app-tile" href="${escapeHtml(app.url)}" target="_blank" rel="noopener" data-nyu-app="${escapeHtml(app.id)}">
            <strong>${escapeHtml(app.name)}</strong>
            <span>${escapeHtml(app.blurb)}</span>
          </a>`).join("")}
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--gridline);">
        <strong style="font-size:12px;">Brightspace calendar feed</strong>
        <p class="stub" style="margin:4px 0 8px;">In Brightspace: Calendar → Settings → Enable Calendar Feeds → copy the subscribe URL. That is the path every NYU student can use today.</p>
        <input type="url" id="nyu-ics-url" placeholder="https://brightspace.nyu.edu/d2l/le/calendar/feed/..." value="${escapeHtml(nyuStatus.ics_url || "")}" style="width:100%;margin-bottom:8px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="primary" id="nyu-ics-import-btn">Import feed</button>
          <button class="secondary" id="nyu-ics-save-btn">Save URL</button>
        </div>
      </div>

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--gridline);">
        <strong style="font-size:12px;">Brightspace API (optional)</strong>
        <p class="stub" style="margin:4px 0 8px;">Students cannot register this themselves. NYU IT / ServiceLink has to enable Manage Extensibility and issue a client id + secret. Redirect URI: <code>${escapeHtml(nyuStatus.redirect_uri || "http://127.0.0.1:5099/api/nyu/brightspace/oauth/callback")}</code></p>
        <div class="card-grid">
          <input type="text" id="nyu-client-id" placeholder="Client ID" value="${escapeHtml(settings.nyu_brightspace_client_id || "")}">
          <input type="password" id="nyu-client-secret" placeholder="Client Secret" autocomplete="off">
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="secondary" id="nyu-save-oauth-btn">Save credentials</button>
          <button class="primary" id="nyu-oauth-connect-btn">${nyuStatus.connected ? "Reconnect" : "Connect Brightspace"}</button>
          <button class="secondary" id="nyu-sync-btn" ${nyuStatus.can_sync ? "" : "disabled"}>Sync NYU</button>
          ${nyuStatus.connected ? '<button class="secondary" id="nyu-disconnect-btn">Disconnect</button>' : ""}
        </div>
      </div>
    </div>

    <div class="card settings-section settings-section-integrations" id="school-integrations-card">
      <strong style="font-size:13px;">School</strong>
      <p class="stub settings-card-status">Link Pronote (France) or import a pasted schedule (NYU Albert, etc.). Brightspace and NYU app links live in the NYU card above.</p>
      ${settingsErrorNotice("/api/school/pronote/status", pronoteStatus)}

      <div style="margin-top:12px;">
        <strong style="font-size:12px;">Pronote</strong>
        <p class="stub" id="pronote-status-line" style="margin:4px 0 8px;">
          ${pronoteLib} ${pronoteCfg}${pronoteSchool}
        </p>
        <p class="stub" style="margin:0 0 8px;font-size:11px;">Credentials are stored locally in <code>planner.db</code> on this machine only — they are sent only to your school's Pronote server when you Connect or Sync, never to Waypoint cloud.</p>
        <label style="font-size:11px;color:var(--ink-muted);display:block;">Pronote URL</label>
        <input type="url" id="pronote-url" placeholder="https://…/pronote/eleve.html" value="${escapeHtml(settings.pronote_url || "")}" style="width:100%;margin-bottom:6px;">
        <div class="card-grid">
          <div>
            <label style="font-size:11px;color:var(--ink-muted);display:block;">Username</label>
            <input type="text" id="pronote-username" autocomplete="username" value="${escapeHtml(settings.pronote_username || "")}" style="width:100%;">
          </div>
          <div>
            <label style="font-size:11px;color:var(--ink-muted);display:block;">Password</label>
            <input type="password" id="pronote-password" autocomplete="current-password" placeholder="••••••••" style="width:100%;">
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="primary" id="pronote-connect-btn">Connect</button>
          <button class="secondary" id="pronote-sync-btn" ${pronoteStatus.configured ? "" : "disabled"}>Sync next 14 days</button>
        </div>
      </div>

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--gridline);">
        <strong style="font-size:12px;">Paste schedule</strong>
        <p class="stub" style="margin:4px 0 8px;">Paste text from NYU Albert, a registrar email, or any timetable — AI proposes editable course rows.</p>
        <textarea id="school-schedule-text" rows="5" style="width:100%;font-size:12px;font-family:inherit;" placeholder="e.g. CS-UY 1114 — Mon/Wed 14:00-15:15 — WWH 101"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="secondary" id="school-schedule-parse-btn">Parse</button>
          <label style="font-size:11px;color:var(--ink-muted);">Weeks ahead</label>
          <input type="number" id="school-schedule-weeks" min="1" max="20" value="12" style="max-width:64px;">
        </div>
        <div id="school-schedule-proposals" style="margin-top:12px;"></div>
      </div>

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--gridline);">
        <strong style="font-size:12px;">Albert / file ICS</strong>
        <p class="stub" style="margin:6px 0 8px;line-height:1.5;">Albert still has no student API. Paste a schedule above, or import a downloaded <strong>.ics</strong> on Calendar. Brightspace subscribe URLs belong in the NYU card.</p>
        <button type="button" class="secondary" id="school-go-calendar-ics" style="font-size:12px;">Open Calendar tab → ICS import</button>
      </div>
    </div>

    <div class="card settings-section settings-section-integrations">
      <strong style="font-size:13px;">Integrations</strong>
      <p class="stub" style="margin:4px 0 8px;">Gmail send, Docs read, Sheets read/write, Calendar sync — gated on a
        free OAuth client you create yourself (no cost, no server hosting needed):<br>
        1. <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> — create a project<br>
        2. APIs &amp; Services -&gt; OAuth consent screen -&gt; External -&gt; fill required fields<br>
        3. APIs &amp; Services -&gt; Credentials -&gt; Create Credentials -&gt; OAuth client ID -&gt; Desktop app<br>
        4. Paste the Client ID + Secret below, then click Connect (opens your browser to approve)</p>
      <div class="card-grid">
        <input type="text" id="google-client-id" placeholder="Client ID">
        <input type="password" id="google-client-secret" placeholder="Client Secret">
      </div>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="secondary" id="save-google-settings">Save credentials</button>
        <button class="primary" id="connect-google">${googleStatus.connected ? "Reconnect" : "Connect Google Account"}</button>
        ${googleStatus.connected ? '<button class="secondary" id="disconnect-google">Disconnect</button>' : ""}
        <span class="pill ${googleStatus.connected ? "status-good" : googleStatus.configured ? "status-warning" : ""}">
          ${googleStatus.connected ? "connected" : googleStatus.configured ? "credentials saved, not connected" : "not configured"}
        </span>
      </div>
    </div>

    <div class="card settings-section settings-section-security">
      <strong style="font-size:13px;">API kill switch</strong>
      <p class="stub" style="margin:4px 0 8px;">Stops all paid API calls app-wide. Local features (practice games, trends math, backups) keep working.</p>
      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-top:8px;">
        <input type="checkbox" id="api-kill-switch" ${usage.api_enabled ? "checked" : ""} style="width:18px; height:18px;">
        <span>External API calls <strong id="api-kill-label" style="color:${usage.api_enabled ? "var(--status-good)" : "var(--status-critical)"};">${usage.api_enabled ? "enabled" : "disabled"}</strong></span>
      </label>
      <div class="stub" style="margin-top:6px;">${usage.total_tokens.toLocaleString()} tokens lifetime · ~$${usage.estimated_cost_usd.toFixed(2)} estimated</div>
    </div>

    <div class="card settings-section settings-section-data" id="settings-apps-appearance">
      <strong style="font-size:13px;">Apps &amp; appearance</strong>
      <p class="stub" style="margin:4px 0 10px;">Hide app icons from the launcher (still accessible via search or direct navigation). System app cannot be hidden.</p>
      <div id="settings-hidden-apps-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
        ${(() => {
          const hidden = typeof getHiddenAppIds === "function" ? getHiddenAppIds() : [];
          return (typeof WORKSPACE_APPS !== "undefined" ? WORKSPACE_APPS : [])
            .filter(a => a.id !== "system")
            .map(a => `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
              <input type="checkbox" class="settings-app-hide-cb" data-app-id="${escapeHtml(a.id)}" ${hidden.includes(a.id) ? "checked" : ""} style="width:15px;height:15px;">
              <span>${a.glyph} ${escapeHtml(a.name)}</span>
              ${hidden.includes(a.id) ? '<span class="pill" style="font-size:10px;">hidden</span>' : ""}
            </label>`).join("");
        })()}
      </div>
      <button type="button" class="secondary" id="settings-save-hidden-apps">Save hidden apps</button>

      <hr style="margin:16px 0;border:none;border-top:1px solid var(--gridline);">
      <strong style="font-size:12px;color:var(--ink-secondary);">Style Paint layers</strong>
      <p class="stub" style="margin:4px 0 8px;">Active visual layers painted onto UI regions.</p>
      <div id="settings-paint-layers-list" style="font-size:12px;display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
        ${(() => {
          const cfg = typeof stylePaintGetConfig === "function" ? stylePaintGetConfig() : { layers: [] };
          const layers = cfg.layers || [];
          if (!layers.length) return '<span class="stub">No layers active.</span>';
          return layers.map(l => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--gridline);">
            <span class="pill" style="font-size:10px;">${escapeHtml(l.effect)}</span>
            <span style="color:var(--ink-muted);">→ ${escapeHtml(l.target)}</span>
            <span style="margin-left:auto;color:${l.enabled ? "var(--status-good)" : "var(--ink-muted)"};">${l.enabled ? "on" : "off"}</span>
            <button type="button" class="settings-paint-remove" data-layer-id="${escapeHtml(l.id)}" style="font-size:11px;padding:2px 8px;" title="Remove">✕</button>
          </div>`).join("");
        })()}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="secondary" id="settings-paint-clear-all">Clear all layers</button>
        <button type="button" class="secondary" id="settings-paint-mode-btn">Open paint mode</button>
      </div>

      <hr style="margin:16px 0;border:none;border-top:1px solid var(--gridline);">
      <strong style="font-size:12px;color:var(--ink-secondary);">Export / Import config</strong>
      <p class="stub" style="margin:4px 0 8px;">Backup or restore your hidden apps and style paint settings.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="secondary" id="settings-export-config">Export JSON</button>
        <label class="secondary" style="cursor:pointer;display:inline-flex;align-items:center;padding:6px 14px;border:1px solid var(--gridline);border-radius:6px;font-size:13px;">
          Import JSON
          <input type="file" id="settings-import-config-file" accept=".json" style="display:none;">
        </label>
      </div>
    </div>

    <div class="card settings-section settings-section-routing" id="settings-automations-card">
      <strong style="font-size:13px;">Automations (when → then)</strong>
      <p class="stub" style="margin:4px 0 10px;">Create event-driven rules that run algorithmic actions automatically. Use <code>ai_step</code> only when judgment is needed — cloud AI is the default for that step; local AI is optional and often weak.</p>
      <div id="settings-rules-list" style="margin-bottom:14px;">
        ${(() => {
          const rulesList = Array.isArray(automationRules) ? automationRules : [];
          if (!rulesList.length) return '<p class="stub" style="margin:0;">No rules yet. Create one below.</p>';
          return rulesList.map(r => {
            const enabled = r.enabled === 1 || r.enabled === true;
            const lastRun = r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "never";
            const hasError = r.last_error ? ` <span class="pill status-warning" title="${escapeHtml(r.last_error)}">error</span>` : "";
            return `<div class="settings-mini-panel" style="padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;" data-rule-id="${r.id}">
              <span class="pill ${enabled ? "status-good" : ""}">${enabled ? "on" : "off"}</span>
              <strong style="font-size:13px;flex:1;min-width:120px;">${escapeHtml(r.name)}</strong>
              <span class="stub" style="font-size:11px;">${escapeHtml(r.trigger_type)}</span>
              <span class="stub" style="font-size:11px;">last run: ${escapeHtml(lastRun)}</span>
              ${hasError}
              <button class="secondary settings-rule-toggle" data-rule-id="${r.id}" data-enabled="${enabled ? "1" : "0"}" style="padding:2px 10px;font-size:11px;">${enabled ? "Disable" : "Enable"}</button>
              <button class="secondary settings-rule-delete" data-rule-id="${r.id}" data-rule-name="${escapeHtml(r.name)}" style="padding:2px 10px;font-size:11px;color:var(--status-critical);">Delete</button>
            </div>`;
          }).join("");
        })()}
      </div>

      <hr style="margin:12px 0;border:none;border-top:1px solid var(--gridline);">
      <strong style="font-size:12px;color:var(--ink-secondary);">Create rule</strong>
      <div class="settings-mini-grid" style="margin-top:8px;">
        <div style="grid-column:1/-1;">
          <label style="font-size:11px;color:var(--ink-muted);">Rule name</label>
          <input type="text" id="rule-new-name" placeholder="e.g. Ping Discord on critical task" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);">Trigger</label>
          <select id="rule-new-trigger" style="width:100%;">
            <option value="task.completed">task.completed</option>
            <option value="task.created">task.created</option>
            <option value="day.saved">day.saved</option>
            <option value="note.created">note.created</option>
            <option value="idea.created">idea.created</option>
            <option value="calendar.created">calendar.created</option>
            <option value="schedule.daily">schedule.daily</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);">Condition JSON <span style="font-weight:normal;">(optional)</span></label>
          <textarea id="rule-new-condition" rows="2" style="width:100%;font-family:monospace;font-size:12px;" placeholder='{"urgency":"critical"}'></textarea>
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:11px;color:var(--ink-muted);">Actions JSON array</label>
          <textarea id="rule-new-actions" rows="4" style="width:100%;font-family:monospace;font-size:12px;" placeholder='[{"type":"notify_discord","message":"Done: {{title}}"}]'></textarea>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="primary" id="settings-rule-save">Save rule</button>
        <span class="stub" style="font-size:11px;">Prefer algorithmic actions. Use <code>ai_step</code> only when judgment is needed. Local AI is optional — cloud is default for ai_step.</span>
      </div>
      <p class="stub" style="margin:10px 0 0;font-size:11px;">
        Blueprint Studio runs Python graphs manually — it is NOT triggered by rules. For event-driven automation, use this panel.
      </p>
    </div>

    <div class="card settings-section settings-section-routing" id="settings-local-rag-card">
      <strong style="font-size:13px;">Local knowledge (RAG)</strong>
      <p class="stub" style="margin:4px 0 10px;">
        TF-IDF index over your notes, ideas, Obsidian vault, repo files, memories, and project notes.
        Ask questions answered <em>only</em> from your own content via the local Ollama model — private, grounded, free.
        Repo Ask uses cloud routes; for big local knowledge use this panel.
      </p>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
        ${localRagStatus.index_exists
          ? settingsStatusPill(`${(localRagStatus.chunk_count || 0).toLocaleString()} chunks`, "status-good")
          : settingsStatusPill("no index", "status-warning")}
        ${localRagStatus.ollama_available
          ? settingsStatusPill("Ollama reachable", "status-good")
          : settingsStatusPill("Ollama not reachable", "status-warning")}
        ${localRagStatus.built_at
          ? `<span class="stub" style="font-size:11px;">Built ${new Date(localRagStatus.built_at).toLocaleString()}</span>`
          : ""}
        ${localRagStatus.model ? `<span class="stub" style="font-size:11px;">Model: ${escapeHtml(localRagStatus.model)}</span>` : ""}
      </div>

      ${localRagStatus.sources && Object.keys(localRagStatus.sources).length ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        ${Object.entries(localRagStatus.sources).map(([k, v]) =>
          `<span class="pill" title="${escapeHtml(k)}">${escapeHtml(k.replace(/_/g, " "))}: ${v}</span>`
        ).join("")}
      </div>` : ""}

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
        <button class="secondary" id="local-rag-rebuild-btn" type="button">Rebuild index</button>
        <span class="stub" id="local-rag-rebuild-status" style="font-size:11px;"></span>
      </div>

      <hr style="margin:12px 0;border:none;border-top:1px solid var(--gridline);">
      <strong style="font-size:12px;color:var(--ink-secondary);">Ask your knowledge base</strong>
      <p class="stub" style="margin:4px 0 8px;font-size:11px;">Requires Ollama running. Answers only from indexed content — never from cloud AI.</p>
      <div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap;">
        <textarea id="local-rag-question" rows="2" placeholder="e.g. What do my notes say about focus strategies?" style="flex:1;min-width:200px;font-size:13px;resize:vertical;"></textarea>
        <button class="primary" id="local-rag-ask-btn" type="button" style="align-self:flex-start;">Ask</button>
      </div>
      <div id="local-rag-answer-area" style="margin-top:10px;display:none;">
        <div id="local-rag-answer-text" style="font-size:13px;line-height:1.55;padding:10px 12px;background:var(--bg-input,var(--bg-card));border:1px solid var(--gridline);border-radius:6px;white-space:pre-wrap;"></div>
        <div id="local-rag-sources" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;"></div>
      </div>
      <div id="local-rag-ask-error" style="display:none;margin-top:8px;font-size:12px;color:var(--status-bad,#c33);"></div>
    </div>`;
}

function schoolScheduleRowHtml(course, index) {
  const days = Array.isArray(course.days) ? course.days.join(", ") : "";
  return `
    <div class="school-schedule-row settings-mini-panel" data-index="${index}" style="margin-bottom:8px;">
      <div class="settings-mini-grid">
        <div style="grid-column:1/-1;">
          <label style="font-size:11px;color:var(--ink-muted);">Course</label>
          <input type="text" class="school-row-name" value="${escapeHtml(course.name || "")}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);">Days (Mon, Wed…)</label>
          <input type="text" class="school-row-days" value="${escapeHtml(days)}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);">Location</label>
          <input type="text" class="school-row-location" value="${escapeHtml(course.location || "")}" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);">Start</label>
          <input type="text" class="school-row-start" value="${escapeHtml(course.start_time || "")}" placeholder="HH:MM" style="width:100%;">
        </div>
        <div>
          <label style="font-size:11px;color:var(--ink-muted);">End</label>
          <input type="text" class="school-row-end" value="${escapeHtml(course.end_time || "")}" placeholder="HH:MM" style="width:100%;">
        </div>
      </div>
    </div>`;
}

function schoolScheduleRenderProposals() {
  const root = document.getElementById("school-schedule-proposals");
  if (!root) return;
  if (!schoolScheduleCourses.length) {
    root.innerHTML = "";
    return;
  }
  const weeksInput = document.getElementById("school-schedule-weeks");
  const weeks = Math.max(1, Math.min(20, parseInt(weeksInput?.value, 10) || 12));
  root.innerHTML = `
    <p class="stub" style="margin:0 0 8px;">${schoolScheduleCourses.length} course(s) proposed — edit rows, then add recurring Classes and Calendar events.</p>
    ${schoolScheduleCourses.map((c, i) => schoolScheduleRowHtml(c, i)).join("")}
    <button class="primary" id="school-schedule-apply-btn">Add Classes + ${weeks} weeks</button>`;
  const applyBtn = document.getElementById("school-schedule-apply-btn");
  if (applyBtn) applyBtn.onclick = schoolScheduleApply;
}

function schoolScheduleReadRows() {
  const rows = Array.from(document.querySelectorAll(".school-schedule-row"));
  const dayMap = {
    mon: "Mon", monday: "Mon",
    tue: "Tue", tues: "Tue", tuesday: "Tue",
    wed: "Wed", wednesday: "Wed",
    thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri",
    sat: "Sat", saturday: "Sat",
    sun: "Sun", sunday: "Sun",
  };
  const valid = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  return rows.map(row => {
    const name = row.querySelector(".school-row-name")?.value.trim() || "";
    const rawDays = row.querySelector(".school-row-days")?.value || "";
    const days = [];
    rawDays.split(/[,/|\s]+/).forEach(token => {
      const t = token.trim();
      if (!t) return;
      if (valid.has(t)) { if (!days.includes(t)) days.push(t); return; }
      const mapped = dayMap[t.toLowerCase()];
      if (mapped && !days.includes(mapped)) days.push(mapped);
    });
    return {
      name,
      days,
      start_time: row.querySelector(".school-row-start")?.value.trim() || "",
      end_time: row.querySelector(".school-row-end")?.value.trim() || "",
      location: row.querySelector(".school-row-location")?.value.trim() || "",
    };
  }).filter(c => c.name && c.days.length && c.start_time && c.end_time);
}

async function schoolScheduleApply() {
  const courses = schoolScheduleReadRows();
  if (!courses.length) {
    showToast("No valid courses to apply — check name, days, and times", "warn");
    return;
  }
  const weeks = Math.max(1, Math.min(20, parseInt(document.getElementById("school-schedule-weeks")?.value, 10) || 12));
  const btn = document.getElementById("school-schedule-apply-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }
  try {
    const result = await api("/api/school/apply-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courses, weeks }),
    });
    if (result.error) {
      showToast(result.error, "warn");
    } else {
      showToast(`Added ${result.classes_upserted || 0} class slot(s) and ${result.created || 0} calendar event(s)`, "good");
    }
  } catch (err) {
    showToast(errorMessage(err), "warn");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = `Add Classes + ${weeks} weeks`;
    }
  }
}

function wireSettings() {
  document.querySelectorAll("[data-inference-mode]").forEach(btn => {
    btn.onclick = async () => {
      const mode = btn.dataset.inferenceMode;
      if (!mode || btn.classList.contains("active")) return;
      btn.disabled = true;
      try {
        await api("/api/about", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inference_mode: mode,
            offline_mode: mode === "local" ? "true" : "false",
          }),
        });
        showToast(mode === "local" ? "Local mode — Ollama only" : mode === "cloud" ? "Cloud mode" : "Custom routing", mode === "local" ? "warn" : "good");
        renderUsageWidget();
        if (typeof refreshHudData === "function") refreshHudData();
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
      } finally {
        btn.disabled = false;
      }
    };
  });

  const saveCloudModel = document.getElementById("save-cloud-model");
  if (saveCloudModel) saveCloudModel.onclick = async () => {
    const claude = document.getElementById("cloud-model-select")?.value?.trim() || "";
    const openai = document.getElementById("openai-model-select")?.value?.trim() || "";
    const grok = document.getElementById("grok-model-select")?.value?.trim() || "";
    if (!claude && !openai && !grok) {
      showToast("Choose at least one model first", "warn");
      return;
    }
    saveCloudModel.disabled = true;
    try {
      const payload = {};
      if (claude) payload.claude_model = claude;
      if (openai) payload.openai_model = openai;
      if (grok) payload.grok_model = grok;
      await api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("Cloud models saved", "good");
      renderUsageWidget();
      if (typeof refreshHudData === "function") refreshHudData();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      saveCloudModel.disabled = false;
    }
  };

  const saveLocalModel = document.getElementById("save-local-model");
  if (saveLocalModel) saveLocalModel.onclick = async () => {
    const select = document.getElementById("local-model-select");
    const model = select?.value?.trim() || "";
    if (!model) {
      showToast("Choose an Ollama model first", "warn");
      return;
    }
    saveLocalModel.disabled = true;
    try {
      await api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_model_name: model }),
      });
      showToast(`Local model set to ${model}`, "good");
      renderUsageWidget();
      if (typeof refreshHudData === "function") refreshHudData();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      saveLocalModel.disabled = false;
    }
  };

  document.getElementById("settings-export-me")?.addEventListener("click", async () => {
    const status = document.getElementById("settings-export-status");
    try {
      const data = await api("/api/export/me");
      settingsDownloadJson(`waypoint-export-${new Date().toISOString().slice(0, 10)}.json`, data);
      if (status) status.textContent = "Exported everything. File saved on this machine.";
    } catch (err) {
      if (status) status.textContent = errorMessage(err);
    }
  });
  document.getElementById("settings-export-profile")?.addEventListener("click", async () => {
    const status = document.getElementById("settings-export-status");
    try {
      const data = await api("/api/export/profile");
      settingsDownloadJson(`waypoint-profile-${new Date().toISOString().slice(0, 10)}.json`, data);
      if (status) status.textContent = "Downloaded profile and activity log.";
    } catch (err) {
      if (status) status.textContent = errorMessage(err);
    }
  });
  document.getElementById("settings-share-app")?.addEventListener("click", async () => {
    const preview = document.getElementById("settings-share-preview");
    try {
      const data = await api("/api/share/app");
      const text = data.message || data.url || "";
      try { await navigator.clipboard.writeText(text); } catch (_) {}
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "waypoint-share.txt";
      a.click();
      URL.revokeObjectURL(url);
      if (preview) preview.textContent = text;
      showToast("Share instructions copied and downloaded", "good");
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  });
  document.getElementById("settings-game-off")?.addEventListener("change", (e) => {
    settingsSetGameOff(!!e.target.checked);
  });
  document.getElementById("settings-sync-push")?.addEventListener("click", async () => {
    const meta = document.getElementById("settings-sync-meta");
    const serverToggle = document.getElementById("settings-sync-as-server");
    try {
      const role = serverToggle?.checked ? "server" : "peer";
      const saved = await api("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const counts = saved.counts || {};
      settingsPaintSyncStatus(saved, `Pushed ${counts.tasks || 0} tasks · ${counts.calendar || 0} calendar · ${counts.events || 0} events · ${counts.napkins || 0} napkins · ${saved.updated_at || "now"}`);
      showToast("Planner bundle pushed", "good");
    } catch (err) {
      if (meta) meta.textContent = errorMessage(err);
      showToast(errorMessage(err), "warn");
    }
  });
  document.getElementById("settings-sync-pull")?.addEventListener("click", async () => {
    const meta = document.getElementById("settings-sync-meta");
    try {
      const snap = await api("/api/sync/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      settingsPaintSyncStatus(snap, `Pulled ${snap.role || "peer"} · +${snap.created_tasks || 0} tasks · +${snap.created_events || 0} events · +${snap.created_napkins || 0} napkins · skipped ${snap.skipped || 0}`);
      showToast("Snapshot merged — additive, local rows kept", "info");
    } catch (err) {
      if (meta) meta.textContent = errorMessage(err);
      showToast(errorMessage(err), "warn");
    }
  });
  document.getElementById("settings-sync-as-server")?.addEventListener("change", async (e) => {
    const meta = document.getElementById("settings-sync-meta");
    const role = e.target.checked ? "server" : "peer";
    try {
      const saved = await api("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      settingsPaintSyncStatus(saved, `This machine is the ${saved.role || role}.`);
      showToast(role === "server" ? "This machine is the server" : "This machine is a peer", "good");
    } catch (err) {
      e.target.checked = !e.target.checked;
      if (meta) meta.textContent = errorMessage(err);
      showToast(errorMessage(err), "warn");
    }
  });
  document.getElementById("settings-spellcheck")?.addEventListener("change", (e) => {
    localStorage.setItem("waypointSpellcheck", e.target.checked ? "on" : "off");
    window.WaypointNapkinComplete?.applySpellcheck();
  });

  const renderAiFailures = async () => {
    const box = document.getElementById("settings-ai-failures-list");
    if (!box) return;
    try {
      const data = await api("/api/ai/failures");
      const rows = data.failures || [];
      if (!rows.length) {
        box.textContent = "No failures logged yet.";
        return;
      }
      box.innerHTML = rows.map(row => {
        let extra = {};
        try { extra = JSON.parse(row.extra || "{}"); } catch (_) {}
        return `<div class="settings-ai-failure" data-id="${row.id}">
          <strong>${escapeHtml(row.kind)}</strong>
          <span>${escapeHtml(row.detail || "")}</span>
          ${extra.classification ? `<em>${escapeHtml(extra.classification)}</em>` : ""}
          <button type="button" class="ghost" data-fail-napkin="${row.id}">Send to Napkin</button>
        </div>`;
      }).join("");
      box.querySelectorAll("[data-fail-napkin]").forEach(btn => {
        btn.onclick = () => {
          const row = rows.find(item => String(item.id) === String(btn.dataset.failNapkin));
          if (!row || typeof openQuickCapture !== "function") return;
          openQuickCapture({
            type: "feedback",
            title: `AI failure: ${row.kind}`,
            details: row.detail || "",
          });
        };
      });
    } catch (err) {
      box.textContent = errorMessage(err);
    }
  };
  renderAiFailures();
  document.getElementById("settings-ai-failure-add")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const kind = document.getElementById("settings-ai-failure-kind")?.value || "other";
    const detail = document.getElementById("settings-ai-failure-detail")?.value.trim();
    if (!detail) return;
    try {
      await api("/api/ai/failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, detail, extra: { classification: kind, source: "settings" } }),
      });
      document.getElementById("settings-ai-failure-detail").value = "";
      renderAiFailures();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  });

  const saveApiKeys = document.getElementById("save-api-keys");
  if (saveApiKeys) saveApiKeys.onclick = async () => {
    const anthropic = document.getElementById("settings-anthropic-key")?.value.trim() || "";
    const openai = document.getElementById("settings-openai-key")?.value.trim() || "";
    const xai = document.getElementById("settings-xai-key")?.value.trim() || "";
    const githubToken = document.getElementById("settings-github-token")?.value.trim() || "";
    const githubRepo = document.getElementById("settings-github-repo")?.value.trim() || "";
    const status = document.getElementById("save-api-keys-status");
    if (!anthropic && !openai && !xai && !githubToken && !githubRepo) {
      showToast("Enter at least one API key or GitHub field to save", "warn");
      return;
    }
    saveApiKeys.disabled = true;
    if (status) status.textContent = "Saving…";
    try {
      const payload = {};
      if (anthropic) payload.anthropic_api_key = anthropic;
      if (openai) payload.openai_api_key = openai;
      if (xai) payload.xai_api_key = xai;
      let restartRecommended = false;
      if (anthropic || openai || xai) {
        const result = await api("/api/settings/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        restartRecommended = !!result.restart_recommended;
        const anthropicInput = document.getElementById("settings-anthropic-key");
        const openaiInput = document.getElementById("settings-openai-key");
        const xaiInput = document.getElementById("settings-xai-key");
        if (anthropicInput) { anthropicInput.value = ""; anthropicInput.placeholder = result.anthropic_configured ? "•••• configured" : "sk-ant-…"; }
        if (openaiInput) { openaiInput.value = ""; openaiInput.placeholder = result.openai_configured ? "•••• configured" : "sk-…"; }
        if (xaiInput) { xaiInput.value = ""; xaiInput.placeholder = result.grok_configured ? "•••• configured" : "xai-…"; }
      }
      if (githubToken || githubRepo) {
        const gh = {};
        if (githubToken) gh.github_token = githubToken;
        if (githubRepo) gh.github_repo = githubRepo;
        await api("/api/about", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(gh),
        });
        const tokenInput = document.getElementById("settings-github-token");
        if (tokenInput && githubToken) { tokenInput.value = ""; tokenInput.placeholder = "•••• configured"; }
      }
      if (status) {
        status.textContent = restartRecommended
          ? "Saved to .env — restart if routes still show not configured."
          : "Saved.";
        status.style.color = "var(--status-good)";
      }
      showToast("API keys saved locally", "good");
      renderUsageWidget();
      if (typeof refreshHudData === "function") refreshHudData();
    } catch (err) {
      if (status) {
        status.textContent = errorMessage(err);
        status.style.color = "var(--status-critical)";
      }
      showToast(errorMessage(err), "warn");
    } finally {
      saveApiKeys.disabled = false;
    }
  };

  const saveRouting = document.getElementById("save-routing");
  if (saveRouting) saveRouting.onclick = async () => {
    await api("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route_chat: document.getElementById("route-chat")?.value,
        route_planning: document.getElementById("route-planning")?.value,
        route_judgment: document.getElementById("route-judgment")?.value,
        route_roleplay: document.getElementById("route-roleplay")?.value,
        route_tasks: document.getElementById("route-tasks").value,
        route_practice: document.getElementById("route-practice").value,
        route_coding: document.getElementById("route-coding").value,
      }),
    });
    renderUsageWidget();
    saveRouting.textContent = "Saved";
    setTimeout(() => { saveRouting.textContent = "Save routing"; }, 1500);
  };

  const saveBudget = document.getElementById("save-budget");
  if (saveBudget) saveBudget.onclick = async () => {
    const raw = document.getElementById("budget-usd-month").value.trim();
    await api("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_usd_month: raw }),
    });
    render();
  };

  const saveDailyCap = document.getElementById("save-daily-cap");
  if (saveDailyCap) saveDailyCap.onclick = async () => {
    const raw = document.getElementById("daily-budget-usd").value.trim();
    await api("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_budget_usd: raw }),
    });
    render();
  };

  const saveProfile = document.getElementById("save-user-profile");
  if (saveProfile) saveProfile.onclick = async () => {
    await api("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_profile: document.getElementById("user-profile").value }),
    });
    saveProfile.textContent = "Saved";
    setTimeout(() => { saveProfile.textContent = "Save profile"; }, 1500);
  };

  api("/api/budget/report").then(report => drawBudgetSpendChart(report.by_day || [])).catch(() => {});

  const optimizeBtn = document.getElementById("budget-optimize-btn");
  if (optimizeBtn) optimizeBtn.onclick = () => runBudgetOptimizer();

  const testOllamaBtn = document.getElementById("test-ollama-btn");
  if (testOllamaBtn) testOllamaBtn.onclick = async () => {
    const status = document.getElementById("test-ollama-status");
    const detail = document.getElementById("offline-ollama-detail");
    const modelsEl = document.getElementById("offline-ollama-models");
    const pills = document.getElementById("settings-api-status-pills");
    testOllamaBtn.disabled = true;
    testOllamaBtn.innerHTML = '<span class="spinner"></span> Refreshing...';
    if (status) status.textContent = "";
    try {
      const [u, b] = await Promise.all([api("/api/usage"), api("/api/code/backends")]);
      const models = b.ollama_models || [];
      const ok = !!u.local_model_available || models.length > 0 || (b.backends || []).includes("ollama");
      // Prefer server-resolved auto-pick; fall back to first tag.
      const name = u.local_model_name || models[0] || "unknown model";
      const select = document.getElementById("local-model-select");
      if (select && models.length) {
        const current = select.value;
        select.innerHTML = models.map(model =>
          `<option value="${escapeHtml(model)}" ${model === (current || name) ? "selected" : ""}>${escapeHtml(model)}</option>`
        ).join("");
        // If user never saved a model, auto-select the server's pick (best available).
        if (!current || !models.includes(current)) {
          select.value = models.includes(name) ? name : models[0];
        }
      }
      if (status) {
        status.textContent = ok
          ? `Ollama reachable — auto-using ${name}${models.length > 1 ? ` (${models.length} installed)` : ""}.`
          : "Ollama not reachable — start Ollama and run: ollama pull llama3.2:3b";
        status.style.color = ok ? "var(--status-good)" : "var(--status-warning)";
      }
      if (ok) settingsStorageSet("settings_ollama_last_test", new Date().toLocaleString());
      if (detail) {
        detail.innerHTML = ok
          ? `Using <strong>${escapeHtml(name)}</strong> (auto-picked from installed tags unless you Save model).`
          : "Start Ollama, then run <code>ollama pull llama3.2:3b</code>.";
      }
      if (modelsEl) {
        if (models.length) {
          modelsEl.outerHTML = `<div id="offline-ollama-models" style="display:flex;gap:6px;flex-wrap:wrap;">${models.map(model => `<span class="pill">${escapeHtml(model)}</span>`).join("")}</div>`;
        } else {
          modelsEl.textContent = "No local models found — install Ollama and pull a model.";
        }
      }
      if (pills) pills.outerHTML = settingsApiStatusPillsHtml(u, b);
    } catch (err) {
      if (status) {
        status.textContent = errorMessage(err);
        status.style.color = "var(--status-critical)";
      }
    } finally {
      testOllamaBtn.disabled = false;
      testOllamaBtn.textContent = "Refresh status";
    }
  };

  const vibecodeToggle = document.getElementById("vibecode-toggle");
  if (vibecodeToggle) vibecodeToggle.onchange = async () => {
    const card = document.getElementById("vibecode-card");
    const pill = document.getElementById("vibecode-pill");
    const hint = document.getElementById("vibecode-hint");
    vibecodeToggle.disabled = true;
    try {
      const enabled = vibecodeToggle.checked;
      await api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibecode_enabled: enabled ? "true" : "false" }),
      });
      if (card) card.classList.toggle("settings-vibecode-on", enabled);
      if (pill) {
        pill.textContent = enabled ? "enabled" : "off";
        pill.className = `pill ${enabled ? "status-good" : ""}`;
      }
      if (hint) {
        hint.textContent = enabled
          ? "Vibecode is on — Blueprint Vibecode / Continue-Fix buttons call cloud AI when a strong model is routed."
          : "Vibecode is off — Blueprint hides AI graph buttons; edit nodes and wires manually.";
      }
      showToast(enabled ? "Vibecode enabled — Claude-class cloud model required" : "Vibecode turned off", enabled ? "info" : "good");
    } catch (err) {
      vibecodeToggle.checked = !vibecodeToggle.checked;
      showToast(errorMessage(err), "warn");
    } finally {
      vibecodeToggle.disabled = false;
    }
  };

  const selfCodingToggle = document.getElementById("self-coding-toggle");
  if (selfCodingToggle) selfCodingToggle.onchange = async () => {
    const card = document.getElementById("self-coding-card");
    const pill = document.getElementById("self-coding-pill");
    const hint = document.getElementById("self-coding-hint");
    selfCodingToggle.disabled = true;
    try {
      const enabled = selfCodingToggle.checked;
      await api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ self_coding_enabled: enabled ? "true" : "false" }),
      });
      if (card) card.classList.toggle("settings-self-coding-on", enabled);
      if (pill) {
        pill.textContent = enabled ? "enabled" : "off";
        pill.className = `pill ${enabled ? "status-critical" : ""}`;
      }
      if (hint) {
        hint.textContent = enabled
          ? "Self-coding is on — only Claude-class routes can stage edits; you must approve every change before it runs."
          : "Self-coding is off — the Agent and Code tab cannot stage file edits or shell commands.";
      }
      showToast(enabled ? "Developer / self-coding mode enabled" : "Self-coding mode turned off", enabled ? "warn" : "good");
    } catch (err) {
      selfCodingToggle.checked = !selfCodingToggle.checked;
      showToast(errorMessage(err), "warn");
    } finally {
      selfCodingToggle.disabled = false;
    }
  };

  const backupBtn = document.getElementById("settings-backup-btn");
  if (backupBtn) backupBtn.onclick = async () => {
    backupBtn.innerHTML = '<span class="spinner"></span>Backing up...';
    backupBtn.disabled = true;
    try {
      const result = await api("/api/backup", { method: "POST" });
      window.alert(`Backed up to:\n${result.path}`);
    } finally {
      backupBtn.textContent = "Backup now";
      backupBtn.disabled = false;
    }
  };

  const trashBtn = document.getElementById("settings-trash-btn");
  if (trashBtn) trashBtn.onclick = openTrashModal;

  const themeBtn = document.getElementById("settings-theme-btn");
  if (themeBtn) themeBtn.onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    renderUsageWidget();
    render();
  };

  const shortcutSearch = document.getElementById("settings-shortcuts-search");
  if (shortcutSearch) shortcutSearch.oninput = () => {
    const query = shortcutSearch.value.trim().toLowerCase();
    document.querySelectorAll(".settings-shortcut-row").forEach(row => {
      row.hidden = !!query && !(row.dataset.shortcut || "").includes(query);
    });
  };

  const applyDisplayPrefControls = () => {
    const prefs = {};
    SETTINGS_DISPLAY_PREFS.forEach(({ key, fallback }) => {
      const active = document.querySelector(`.settings-pref-btn.active[data-display-pref="${key}"]`);
      prefs[key] = active?.dataset.displayValue || fallback;
      settingsStorageSet(`settings_${key}`, prefs[key]);
    });
    settingsApplyDisplayPrefs(prefs);
  };
  document.querySelectorAll(".settings-pref-btn").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.displayPref;
      document.querySelectorAll(`.settings-pref-btn[data-display-pref="${key}"]`).forEach(sibling => {
        const on = sibling === btn;
        sibling.classList.toggle("active", on);
        if (on) sibling.setAttribute("aria-current", "true");
        else sibling.removeAttribute("aria-current");
      });
      applyDisplayPrefControls();
    };
  });

  const langSelect = document.getElementById("settings-lang-select");
  if (langSelect) {
    langSelect.onchange = () => {
      const next = langSelect.value || "en";
      if (typeof setLang === "function") {
        setLang(next);
      } else {
        settingsStorageSet("waypoint_lang", next);
        if (typeof applyI18n === "function") applyI18n();
      }
      const themeBtn = document.getElementById("settings-theme-btn");
      if (themeBtn) {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        themeBtn.textContent = typeof t === "function"
          ? t(isLight ? "btn.themeDark" : "btn.themeLight")
          : (isLight ? "Switch to dark" : "Switch to light");
      }
      const appearanceCard = langSelect.closest(".card");
      if (typeof applyI18n === "function" && appearanceCard) applyI18n(appearanceCard);
    };
  }

  if (typeof applyI18n === "function") {
    const langBlock = document.getElementById("settings-lang-select")?.closest(".card");
    if (langBlock) applyI18n(langBlock);
  }

  const saveGoogle = document.getElementById("save-google-settings");
  if (saveGoogle) saveGoogle.onclick = async () => {
    await api("/api/google/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: document.getElementById("google-client-id").value.trim(),
        client_secret: document.getElementById("google-client-secret").value.trim(),
      }),
    });
    render();
  };

  const connectGoogle = document.getElementById("connect-google");
  if (connectGoogle) connectGoogle.onclick = async () => {
    const result = await runCancellable(connectGoogle, "Waiting for browser approval (up to 3 min)...", (signal) =>
      api("/api/google/connect", { method: "POST", signal }));
    if (result.error) window.alert(result.error);
    render();
  };

  const disconnectBtn = document.getElementById("disconnect-google");
  if (disconnectBtn) disconnectBtn.onclick = async () => {
    await api("/api/google/disconnect", { method: "POST" });
    render();
  };

  const apiSwitch = document.getElementById("api-kill-switch");
  if (apiSwitch) apiSwitch.onchange = async () => {
    await api("/api/usage/toggle", { method: "POST" });
    renderUsageWidget();
    render();
  };

  const saveDiscord = document.getElementById("save-discord-webhook");
  if (saveDiscord) saveDiscord.onclick = async () => {
    await api("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discord_webhook_url: document.getElementById("discord-webhook-url").value.trim() }),
    });
    showToast("Discord webhook saved", "good");
  };

  const testDiscord = document.getElementById("test-discord-webhook");
  if (testDiscord) testDiscord.onclick = async () => {
    testDiscord.disabled = true;
    testDiscord.innerHTML = '<span class="spinner"></span> Sending...';
    try {
      const result = await api("/api/notify/test", { method: "POST" });
      if (!result.configured) {
        showToast("No webhook configured — save a URL first", "warn");
      } else if (result.ok) {
        showToast("Test notification sent", "good");
      } else {
        showToast("Webhook configured but send failed — check URL", "warn");
      }
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      testDiscord.disabled = false;
      testDiscord.textContent = "Send test";
    }
  };

  const updateGit = document.getElementById("settings-update-git");
  if (updateGit) updateGit.onclick = async () => {
    updateGit.disabled = true;
    updateGit.innerHTML = '<span class="spinner"></span> Pulling...';
    try {
      const result = await api("/api/system/update-from-git", { method: "POST" });
      const summary = result.updated ? "Updated from git" : "Already up to date";
      const deps = result.deps_ok === false ? " — pip install failed" : "";
      showToast(`${summary}${deps} — restart the app so local AI and backend code reload`, result.updated ? "good" : "info");
      if (result.output) console.log(result.output);
      const ver = await api("/api/system/version");
      const label = document.getElementById("settings-version-label");
      if (label && ver.hash) {
        label.textContent = ver.branch ? `${ver.hash} · ${ver.branch}` : ver.hash;
      }
      if (result.local_ai && typeof render === "function") render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      updateGit.disabled = false;
      updateGit.textContent = "Update from git";
    }
  };

  const verifyLocalAi = document.getElementById("settings-verify-local-ai");
  if (verifyLocalAi) verifyLocalAi.onclick = async () => {
    verifyLocalAi.disabled = true;
    verifyLocalAi.innerHTML = '<span class="spinner"></span> Checking...';
    try {
      const health = await api("/api/system/local-ai");
      const mount = document.getElementById("settings-local-ai-status");
      if (mount) mount.outerHTML = settingsLocalAiStatusHtml(health);
      showToast(health.ready ? "Local AI is ready" : "Local AI needs setup — see the checklist", health.ready ? "good" : "warn");
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      verifyLocalAi.disabled = false;
      verifyLocalAi.textContent = "Verify local AI";
    }
  };

  const setupLocalAi = document.getElementById("settings-setup-local-ai");
  if (setupLocalAi) setupLocalAi.onclick = () => runLocalAiSetup();

  const pronoteConnect = document.getElementById("pronote-connect-btn");
  if (pronoteConnect) pronoteConnect.onclick = async () => {
    const password = document.getElementById("pronote-password")?.value || "";
    if (!password) {
      showToast("Enter your Pronote password to connect", "warn");
      return;
    }
    pronoteConnect.disabled = true;
    pronoteConnect.textContent = "Connecting…";
    try {
      const result = await api("/api/school/pronote/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: document.getElementById("pronote-url")?.value.trim() || "",
          username: document.getElementById("pronote-username")?.value.trim() || "",
          password,
        }),
      });
      if (result.error) {
        showToast(result.error, "warn");
      } else {
        showToast(result.connected_school ? `Connected — ${result.connected_school}` : "Pronote connected", "good");
        render();
      }
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      pronoteConnect.disabled = false;
      pronoteConnect.textContent = "Connect";
    }
  };

  const pronoteSync = document.getElementById("pronote-sync-btn");
  if (pronoteSync) pronoteSync.onclick = async () => {
    pronoteSync.disabled = true;
    pronoteSync.textContent = "Syncing…";
    try {
      const result = await api("/api/school/pronote/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 }),
      });
      if (result.error && !result.calendar_created && !result.tasks_created) {
        showToast(result.error, "warn");
      } else {
        const parts = [];
        if (result.calendar_created) parts.push(`${result.calendar_created} class(es)`);
        if (result.tasks_created) parts.push(`${result.tasks_created} homework task(s)`);
        showToast(parts.length ? `Synced ${parts.join(", ")}` : (result.error || "Nothing new to sync"), parts.length ? "good" : "info");
        if (result.error && parts.length) showToast(result.error, "warn");
      }
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      pronoteSync.disabled = false;
      pronoteSync.textContent = "Sync next 14 days";
    }
  };

  const scheduleParse = document.getElementById("school-schedule-parse-btn");
  if (scheduleParse) scheduleParse.onclick = async () => {
    const text = document.getElementById("school-schedule-text")?.value.trim() || "";
    if (!text) {
      showToast("Paste schedule text first", "warn");
      return;
    }
    scheduleParse.disabled = true;
    scheduleParse.textContent = "Parsing…";
    try {
      const result = await api("/api/school/parse-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (result.error && !(result.courses || []).length) {
        showToast(result.error, "warn");
        schoolScheduleCourses = [];
      } else {
        schoolScheduleCourses = result.courses || [];
        if (!schoolScheduleCourses.length) {
          showToast("No courses found in pasted text", "warn");
        } else {
          showToast(`Parsed ${schoolScheduleCourses.length} course(s)`, "good");
        }
      }
      schoolScheduleRenderProposals();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      scheduleParse.disabled = false;
      scheduleParse.textContent = "Parse";
    }
  };

  const weeksInput = document.getElementById("school-schedule-weeks");
  if (weeksInput) weeksInput.onchange = schoolScheduleRenderProposals;

  const goCalendar = document.getElementById("school-go-calendar-ics");
  if (goCalendar) goCalendar.onclick = async () => {
    if (typeof navigateToTab === "function") await navigateToTab("Calendar");
    else showToast("Open the Calendar tab to import an .ics file", "info");
  };

  const nyuIcsSave = document.getElementById("nyu-ics-save-btn");
  if (nyuIcsSave) nyuIcsSave.onclick = async () => {
    const url = document.getElementById("nyu-ics-url")?.value.trim() || "";
    try {
      await api("/api/nyu/brightspace/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ics_url: url }),
      });
      showToast(url ? "Brightspace feed URL saved" : "Feed URL cleared", "good");
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  const nyuIcsImport = document.getElementById("nyu-ics-import-btn");
  if (nyuIcsImport) nyuIcsImport.onclick = async () => {
    const url = document.getElementById("nyu-ics-url")?.value.trim() || "";
    if (!url) {
      showToast("Paste the Brightspace calendar subscribe URL first", "warn");
      return;
    }
    nyuIcsImport.disabled = true;
    nyuIcsImport.textContent = "Importing…";
    try {
      const result = await api("/api/nyu/brightspace/ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const parts = [];
      if (result.events) parts.push(`${result.events} event(s)`);
      if (result.tasks) parts.push(`${result.tasks} task(s)`);
      showToast(parts.length ? `Imported ${parts.join(", ")}` : "Nothing new in that feed", parts.length ? "good" : "info");
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      nyuIcsImport.disabled = false;
      nyuIcsImport.textContent = "Import feed";
    }
  };

  const nyuSaveOauth = document.getElementById("nyu-save-oauth-btn");
  if (nyuSaveOauth) nyuSaveOauth.onclick = async () => {
    try {
      await api("/api/nyu/brightspace/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: document.getElementById("nyu-client-id")?.value.trim() || "",
          client_secret: document.getElementById("nyu-client-secret")?.value.trim() || "",
        }),
      });
      showToast("Brightspace API credentials saved locally", "good");
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  const nyuConnect = document.getElementById("nyu-oauth-connect-btn");
  if (nyuConnect) nyuConnect.onclick = async () => {
    try {
      const result = await api("/api/nyu/brightspace/oauth/start");
      if (result.url) window.open(result.url, "_blank", "noopener");
      else showToast("Could not start Brightspace login", "warn");
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  const nyuSync = document.getElementById("nyu-sync-btn");
  if (nyuSync) nyuSync.onclick = async () => {
    nyuSync.disabled = true;
    nyuSync.textContent = "Syncing…";
    try {
      const result = await api("/api/nyu/sync", { method: "POST" });
      const parts = [];
      if (result.events) parts.push(`${result.events} event(s)`);
      if (result.tasks) parts.push(`${result.tasks} task(s)`);
      showToast(parts.length ? `NYU synced ${parts.join(", ")}` : (result.error || "Nothing new to sync"), parts.length ? "good" : "info");
      if (result.error && parts.length) showToast(result.error, "warn");
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      nyuSync.disabled = false;
      nyuSync.textContent = "Sync NYU";
    }
  };

  const nyuDisconnect = document.getElementById("nyu-disconnect-btn");
  if (nyuDisconnect) nyuDisconnect.onclick = async () => {
    try {
      await api("/api/nyu/brightspace/disconnect", { method: "POST" });
      showToast("Brightspace API disconnected", "good");
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  if (schoolScheduleCourses.length) schoolScheduleRenderProposals();

  // Apps & appearance wiring
  const saveHiddenApps = document.getElementById("settings-save-hidden-apps");
  if (saveHiddenApps) saveHiddenApps.onclick = async () => {
    const checked = Array.from(document.querySelectorAll(".settings-app-hide-cb:checked")).map(cb => cb.dataset.appId);
    const ha = { version: 1, ids: checked.filter(id => id !== "system") };
    localStorage.setItem("hiddenAppIds", JSON.stringify(ha.ids));
    try {
      await api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden_apps: JSON.stringify(ha) }),
      });
      showToast("Hidden apps saved", "good");
      if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Home" && typeof render === "function") {
        render();
      }
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  document.querySelectorAll(".settings-paint-remove").forEach(btn => {
    btn.onclick = () => {
      if (typeof stylePaintRemoveLayer === "function") {
        stylePaintRemoveLayer(btn.dataset.layerId);
        showToast("Layer removed", "info");
        render();
      }
    };
  });

  const clearAllLayers = document.getElementById("settings-paint-clear-all");
  if (clearAllLayers) clearAllLayers.onclick = () => {
    if (typeof stylePaintGetConfig === "function" && typeof stylePaintRemoveLayer === "function") {
      const cfg = stylePaintGetConfig();
      (cfg.layers || []).forEach(l => stylePaintRemoveLayer(l.id));
      showToast("All paint layers cleared", "info");
      render();
    }
  };

  const paintModeBtn = document.getElementById("settings-paint-mode-btn");
  if (paintModeBtn) paintModeBtn.onclick = () => {
    if (typeof stylePaintEnterMode === "function") {
      goToTab("Home");
      setTimeout(() => stylePaintEnterMode("aurora"), 400);
    }
  };

  const exportBtn = document.getElementById("settings-export-config");
  if (exportBtn) exportBtn.onclick = async () => {
    try {
      const settings = await api("/api/about");
      const data = {
        hidden_apps: settings.hidden_apps ? JSON.parse(settings.hidden_apps) : { version: 1, ids: [] },
        style_paint_config: settings.style_paint_config ? JSON.parse(settings.style_paint_config) : { version: 1, layers: [] },
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "waypoint-appearance.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  const importFile = document.getElementById("settings-import-config-file");
  if (importFile) importFile.onchange = async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const payload = {};
      if (data.hidden_apps) payload.hidden_apps = JSON.stringify(data.hidden_apps);
      if (data.style_paint_config) payload.style_paint_config = JSON.stringify(data.style_paint_config);
      if (!Object.keys(payload).length) { showToast("Nothing to import", "warn"); return; }
      await api("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (data.hidden_apps?.ids) localStorage.setItem("hiddenAppIds", JSON.stringify(data.hidden_apps.ids));
      if (data.style_paint_config) localStorage.setItem("stylePaintConfig", JSON.stringify(data.style_paint_config));
      if (typeof stylePaintApply === "function") stylePaintApply();
      showToast("Config imported", "good");
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };

  // --- Automations ---
  document.querySelectorAll(".settings-rule-toggle").forEach(btn => {
    btn.onclick = async () => {
      const ruleId = parseInt(btn.dataset.ruleId, 10);
      const currentlyEnabled = btn.dataset.enabled === "1";
      btn.disabled = true;
      try {
        await api(`/api/rules/${ruleId}/enable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !currentlyEnabled }),
        });
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
        btn.disabled = false;
      }
    };
  });

  document.querySelectorAll(".settings-rule-delete").forEach(btn => {
    btn.onclick = async () => {
      const ruleId = parseInt(btn.dataset.ruleId, 10);
      const ruleName = btn.dataset.ruleName || `rule #${ruleId}`;
      if (!confirm(`Delete automation rule "${ruleName}"? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        await api(`/api/rules/${ruleId}`, { method: "DELETE" });
        showToast("Rule deleted", "good");
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
        btn.disabled = false;
      }
    };
  });

  const ruleSaveBtn = document.getElementById("settings-rule-save");
  if (ruleSaveBtn) ruleSaveBtn.onclick = async () => {
    const name = (document.getElementById("rule-new-name")?.value || "").trim();
    const trigger_type = document.getElementById("rule-new-trigger")?.value || "";
    const condRaw = (document.getElementById("rule-new-condition")?.value || "").trim();
    const actionsRaw = (document.getElementById("rule-new-actions")?.value || "").trim();
    if (!name) { showToast("Rule name is required", "warn"); return; }
    if (!actionsRaw) { showToast("Actions JSON is required", "warn"); return; }
    let condition = {};
    let actions;
    if (condRaw) {
      try { condition = JSON.parse(condRaw); } catch { showToast("Condition is not valid JSON", "warn"); return; }
    }
    try { actions = JSON.parse(actionsRaw); } catch { showToast("Actions is not valid JSON", "warn"); return; }
    if (!Array.isArray(actions)) { showToast("Actions must be a JSON array", "warn"); return; }
    ruleSaveBtn.disabled = true;
    try {
      await api("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, trigger_type, condition, actions }),
      });
      showToast("Rule saved", "good");
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
      ruleSaveBtn.disabled = false;
    }
  };

  // --- Local RAG ---
  const ragRebuildBtn = document.getElementById("local-rag-rebuild-btn");
  if (ragRebuildBtn) ragRebuildBtn.onclick = async () => {
    const statusEl = document.getElementById("local-rag-rebuild-status");
    ragRebuildBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Rebuilding…";
    try {
      const result = await api("/api/local-rag/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (statusEl) statusEl.textContent = `Done — ${(result.chunk_count || 0).toLocaleString()} chunks from ${(result.doc_count || 0)} docs.`;
      showToast("RAG index rebuilt", "good");
      render();
    } catch (err) {
      if (statusEl) statusEl.textContent = errorMessage(err);
      showToast("Rebuild failed: " + errorMessage(err), "warn");
      ragRebuildBtn.disabled = false;
    }
  };

  const ragAskBtn = document.getElementById("local-rag-ask-btn");
  if (ragAskBtn) ragAskBtn.onclick = async () => {
    const questionEl = document.getElementById("local-rag-question");
    const answerArea = document.getElementById("local-rag-answer-area");
    const answerText = document.getElementById("local-rag-answer-text");
    const sourcesEl = document.getElementById("local-rag-sources");
    const errorEl = document.getElementById("local-rag-ask-error");
    const question = (questionEl?.value || "").trim();
    if (!question) { showToast("Enter a question first", "warn"); return; }
    ragAskBtn.disabled = true;
    ragAskBtn.textContent = "Asking…";
    if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }
    if (answerArea) answerArea.style.display = "none";
    try {
      const result = await api("/api/local-rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question }),
      });
      if (result.error) throw new Error(result.error);
      if (answerText) answerText.textContent = result.answer || "(no answer)";
      if (sourcesEl) {
        sourcesEl.innerHTML = (result.sources || []).map(s =>
          `<span class="pill" title="score: ${s.score}">${escapeHtml(s.title || s.source || "source")}</span>`
        ).join("");
      }
      if (answerArea) answerArea.style.display = "";
    } catch (err) {
      if (errorEl) { errorEl.textContent = errorMessage(err); errorEl.style.display = ""; }
    } finally {
      ragAskBtn.disabled = false;
      ragAskBtn.textContent = "Ask";
    }
  };

  focusSettingsSection();
}

try {
  settingsApplyDisplayPrefs();
  settingsApplyGameOff();
} catch (_) {}
