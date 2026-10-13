// --- Hub tab: command deck (links, pins, weather, library, today glance) ---

let HUB_LINK_FILTER = "all";
let HUB_RECEIPT_FILTER = "today";
let HUB_FOCUS_LINK_INPUT = false;
let HUB_STYLES_INJECTED = false;
let HUB_WEATHER_CACHE = null;
let HUB_LIBRARY_TAB = "book";
let HUB_LIBRARY_SPOTLIGHT = hubLoadSpotlight();

function hubLoadSpotlight() {
  try {
    const raw = JSON.parse(localStorage.getItem("hubLibrarySpotlight") || "null");
    if (raw && typeof raw === "object") {
      return {
        book: raw.book != null ? Number(raw.book) || null : null,
        comedy: raw.comedy != null ? Number(raw.comedy) || null : null,
        watch: raw.watch != null ? Number(raw.watch) || null : null,
      };
    }
  } catch (_) {}
  return { book: null, comedy: null, watch: null };
}

function hubSaveSpotlight() {
  try { localStorage.setItem("hubLibrarySpotlight", JSON.stringify(HUB_LIBRARY_SPOTLIGHT)); } catch (_) {}
}

function hubClearSpotlight(kind) {
  if (!kind) return;
  HUB_LIBRARY_SPOTLIGHT[kind] = null;
  hubSaveSpotlight();
}

const HUB_LIBRARY_KINDS = new Set(["book", "comedy", "watch"]);

const HUB_PIN_PRESETS = [
  { label: "Gmail", url: "https://mail.google.com", emoji: "📧" },
  { label: "Google Sheets", url: "https://sheets.google.com", emoji: "📊" },
  { label: "Google Docs", url: "https://docs.google.com", emoji: "📝" },
  { label: "GitHub", url: "https://github.com", emoji: "🐙" },
  { label: "YouTube", url: "https://youtube.com", emoji: "▶️" },
  { label: "Figma", url: "https://figma.com", emoji: "🎨" },
  { label: "Luma", url: "https://lu.ma", emoji: "🎟️" },
];

const HUB_LIBRARY_TABS = [
  { key: "book", label: "Books", placeholder: "The Pragmatic Programmer", creatorPh: "Author (optional)" },
  { key: "comedy", label: "Comedy", placeholder: "Bill Burr", creatorPh: "Special (optional)" },
  { key: "watch", label: "Watchlist", placeholder: "Veritasium — that chip video", creatorPh: "Creator (optional)" },
];

function hubEnsureStyles() {
  if (HUB_STYLES_INJECTED) return;
  HUB_STYLES_INJECTED = true;
  const el = document.createElement("style");
  el.id = "hub-styles";
  el.textContent = `
    .hub-glance { display: flex; flex-wrap: nowrap; gap: 6px; margin-bottom: 12px; overflow-x: auto; }
    .hub-glance-item { flex: 1 1 0; min-width: 100px; background: var(--surface, var(--card)); border: 1px solid var(--gridline);
      border-radius: 8px; padding: 8px 10px; cursor: pointer; transition: border-color 0.15s; }
    .hub-glance-item:hover { border-color: var(--accent); }
    .hub-glance-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); white-space: nowrap; }
    .hub-glance-value { font-size: 16px; font-weight: 700; margin-top: 1px; line-height: 1.2; }
    .hub-glance-detail { font-size: 10px; color: var(--ink-muted); margin-top: 2px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hub-share-app { margin-left: auto; background: transparent; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); color: var(--ink-secondary); }
    .hub-share-app:hover { color: var(--ink-primary); border-color: var(--accent); }
    .hub-share-row { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
    .hub-share-copy { font-size: 12px; color: var(--ink-muted); }
    .hub-glance-quests { flex: 0 0 auto; min-width: 92px; cursor: pointer; }
    .hub-glance-eye { font-size: 10px; opacity: 0.65; margin-left: 2px; }
    .hub-stack { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .hub-card { background: var(--surface, var(--card)); border: 1px solid var(--gridline); border-radius: 10px; padding: 12px; }
    .hub-card-head { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-muted); margin: 0 0 8px; }
    .hub-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .hub-chip { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--gridline);
      background: transparent; color: var(--ink-muted); cursor: pointer; }
    .hub-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .hub-link-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--gridline); }
    .hub-link-row:last-child { border-bottom: none; }
    .hub-link-row.done { opacity: 0.72; }
    .hub-link-row.done .hub-link-title { text-decoration: line-through; color: var(--status-good); }
    .hub-favicon { width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0; margin-top: 2px; }
    .hub-link-body { flex: 1; min-width: 0; }
    .hub-link-title { font-weight: 600; font-size: 12px; word-break: break-word; }
    .hub-link-note { font-size: 10px; color: var(--ink-muted); margin-top: 1px; }
    .hub-link-actions { display: flex; gap: 3px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
    .hub-link-actions button { font-size: 10px; padding: 2px 6px; }
    .hub-card-head-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .hub-card-head-row .hub-card-head { margin: 0; }
    .hub-receipt-toolbar { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .hub-receipt-refresh { font-size: 10px; padding: 2px 8px; }
    .hub-receipt-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 7px; align-items: center;
      padding: 6px 0; border-bottom: 1px solid var(--gridline); min-height: 0; }
    .hub-receipt-row:last-child { border-bottom: none; }
    .hub-receipt-origin { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.32; align-self: center;
      transition: opacity 0.15s ease, transform 0.15s ease; position: relative; box-sizing: border-box; }
    .hub-receipt-row:hover .hub-receipt-origin { opacity: 0.72; transform: translateY(-1px); }
    .hub-receipt-origin.planner { border: 1px dashed rgba(34,197,94,0.55); border-radius: 2px;
      background: repeating-linear-gradient(90deg, transparent 0 2px, rgba(34,197,94,0.08) 2px 3px); }
    .hub-receipt-origin.arcade { border-radius: 50%; border: 1px solid rgba(217,119,6,0.45); color: rgba(217,119,6,0.75);
      font-size: 11px; line-height: 14px; text-align: center; }
    .hub-receipt-origin.arcade::before { content: "◉"; display: block; margin-top: 1px; }
    .hub-receipt-origin.blueprint { clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
      background: rgba(59,130,246,0.28); border: 1px solid rgba(59,130,246,0.4); }
    .hub-receipt-origin.parallel { border-radius: 50%; background: rgba(220,38,38,0.22);
      border: 1px solid rgba(220,38,38,0.42); box-shadow: inset 0 0 0 2px rgba(220,38,38,0.12); }
    .hub-receipt-origin.docs { border: 1px solid rgba(20,184,166,0.35); border-radius: 1px; overflow: hidden;
      background: linear-gradient(135deg, transparent 46%, rgba(20,184,166,0.38) 46% 100%); }
    .hub-receipt-origin.system { border-radius: 50%; border: 1px dashed rgba(148,163,184,0.35); }
    .hub-receipt-origin.system::before,
    .hub-receipt-origin.system::after { content: ""; position: absolute; inset: 3px; border-radius: 50%;
      border: 1.5px solid rgba(148,163,184,0.5); box-sizing: border-box; }
    .hub-receipt-origin.system::after { inset: 5px 3px; border-radius: 2px; border-style: solid; transform: rotate(45deg); }
    .hub-receipt-source { font-size: 9px; line-height: 1; padding: 3px 7px; border-radius: 999px;
      text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; border: 1px solid transparent; white-space: nowrap; }
    .hub-receipt-source.planner { background: rgba(34,197,94,0.14); color: #22c55e; border-color: rgba(34,197,94,0.25); }
    .hub-receipt-source.arcade { background: rgba(251,191,36,0.16); color: #d97706; border-color: rgba(251,191,36,0.35); }
    .hub-receipt-source.blueprint { background: rgba(59,130,246,0.14); color: #3b82f6; border-color: rgba(59,130,246,0.25); }
    .hub-receipt-source.parallel { background: rgba(168,85,247,0.14); color: #a855f7; border-color: rgba(168,85,247,0.25); }
    .hub-receipt-source.docs { background: rgba(20,184,166,0.14); color: #0f766e; border-color: rgba(20,184,166,0.25); }
    .hub-receipt-source.system { background: rgba(148,163,184,0.18); color: var(--ink-muted); border-color: rgba(148,163,184,0.28); }
    .hub-receipt-summary { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hub-receipt-time { font-size: 10px; color: var(--ink-muted); white-space: nowrap; }
    .hub-pin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
    .hub-pin-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
      position: relative; padding: 10px 4px; border-radius: 8px; border: 1px solid var(--gridline); background: var(--bg-card-hover, rgba(255,255,255,0.03));
      text-decoration: none; color: inherit; cursor: pointer; transition: transform 0.12s, border-color 0.12s; min-height: 64px; }
    .hub-pin-tile:hover { transform: translateY(-1px); border-color: var(--accent); }
    .hub-pin-remove {
      position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; padding: 0; line-height: 1;
      font-size: 11px; border-radius: 999px; border: 1px solid var(--gridline); background: var(--bg-shell);
      color: var(--ink-muted); cursor: pointer; display: none; align-items: center; justify-content: center;
    }
    .hub-pin-tile:hover .hub-pin-remove, .hub-pin-tile:focus-within .hub-pin-remove { display: inline-flex; }
    .hub-pin-remove:hover { color: var(--status-critical); border-color: color-mix(in srgb, var(--status-critical) 40%, var(--border)); }
    .hub-pin-emoji { font-size: 22px; line-height: 1; }
    .hub-pin-label { font-size: 9px; text-align: center; line-height: 1.2; color: var(--ink-muted); word-break: break-word; }
    .hub-pin-add { border-style: dashed; color: var(--ink-muted); font-size: 10px; }
    .hub-pin-form { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; }
    .hub-pin-form input { flex: 1 1 100px; min-width: 80px; font-size: 11px; }
    .hub-weather-inline {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 6px 10px; border-radius: 8px; border: 1px solid var(--gridline);
      background: var(--bg-card-hover, rgba(255,255,255,0.02)); font-size: 12px; color: var(--ink-muted);
    }
    .hub-weather-inline:hover .hub-gear { opacity: 1; }
    .hub-weather-now { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ink-primary); white-space: nowrap; }
    .hub-weather-now-emoji { font-size: 18px; line-height: 1; }
    .hub-weather-now-temp { font-size: 14px; }
    .hub-weather-city-inline { font-size: 11px; color: var(--ink-muted); }
    .hub-weather-mini { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
    .hub-weather-mini-day { font-size: 10px; text-align: center; white-space: nowrap; }
    .hub-weather-mini-day span { display: block; }
    .hub-book-row { padding: 6px 0; border-bottom: 1px solid var(--gridline); }
    .hub-book-row:last-child { border-bottom: none; }
    .hub-book-row.finished { animation: hub-celebrate 1.2s ease-in-out 1; border-color: rgba(251,191,36,0.5); }
    @keyframes hub-celebrate {
      0%, 100% { box-shadow: none; background: transparent; }
      50% { box-shadow: 0 0 24px rgba(251,191,36,0.45); background: linear-gradient(90deg, transparent, rgba(251,191,36,0.08), transparent); }
    }
    .hub-book-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
    .hub-book-streak { font-size: 12px; }
    .hub-progress { width: 100%; margin: 4px 0; accent-color: var(--accent); }
    .hub-stub { font-size: 11px; color: var(--ink-muted); padding: 6px 0; }
    .hub-add-form { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .hub-add-form input { flex: 1 1 160px; font-size: 13px; padding: 8px 10px; }
    .hub-add-form .primary { padding: 8px 14px; }
    .hub-add-form-prominent input[type="url"] { flex: 2 1 220px; font-size: 14px; padding: 10px 12px; border-radius: 8px; }
    .hub-suggestions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .hub-suggestion { font-size: 10px; padding: 3px 7px; border-radius: 8px; border: 1px solid var(--gridline);
      background: transparent; cursor: pointer; color: var(--ink-muted); }
    .hub-suggestion:hover { border-color: var(--accent); color: var(--ink-primary); }
    .hub-gear { background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px; color: var(--ink-muted); opacity: 0; transition: opacity 0.15s; }
    .hub-weather-inline .hub-gear { opacity: 0; }
    .hub-gear:hover { color: var(--ink-primary); opacity: 1; }
    .hub-lib-tabs { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
    .hub-lib-tab { font-size: 11px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--gridline);
      background: transparent; color: var(--ink-muted); cursor: pointer; font-weight: 600; }
    .hub-lib-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .hub-lib-toolbar { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
    .hub-lib-spotlight { background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04));
      border: 1px solid rgba(251,191,36,0.35); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
    .hub-lib-spotlight-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(251,191,36,0.9); font-weight: 700; }
    .hub-lib-spotlight-title { font-size: 14px; font-weight: 700; margin: 2px 0 4px; }
    .hub-lib-status { font-size: 9px; padding: 1px 6px; border-radius: 999px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .hub-lib-status.open { background: rgba(99,102,241,0.15); color: var(--accent, #6366f1); border: 1px solid rgba(99,102,241,0.3); }
    .hub-lib-status.done { background: rgba(251,191,36,0.15); color: #d97706; border: 1px solid rgba(251,191,36,0.35); }
    .hub-lib-creator { font-size: 10px; color: var(--ink-muted); font-weight: 400; }
    .hub-lib-find { display: flex; flex-wrap: wrap; gap: 3px; margin: 4px 0; }
    .hub-lib-find a { font-size: 9px; padding: 2px 6px; border-radius: 5px; border: 1px solid var(--gridline);
      text-decoration: none; color: var(--ink-muted); background: var(--bg-card-hover, rgba(255,255,255,0.03)); }
    .hub-lib-find a:hover { border-color: var(--accent); color: var(--ink-primary); }
    .hub-lib-actions { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; align-items: center; }
    .hub-lib-actions button { font-size: 10px; padding: 2px 6px; }
    .hub-lib-finished { margin-top: 10px; border-top: 1px dashed var(--gridline); padding-top: 8px; }
    .hub-lib-finished summary { cursor: pointer; font-size: 11px; font-weight: 700; color: var(--ink-muted); list-style: none; display: flex; align-items: center; gap: 4px; }
    .hub-lib-finished summary::-webkit-details-marker { display: none; }
    .hub-lib-finished summary::before { content: "🏆"; }
    .hub-lib-shelf { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .hub-lib-trophy { flex: 1 1 120px; min-width: 100px; padding: 6px 8px; border-radius: 6px;
      border: 1px solid rgba(251,191,36,0.25); background: rgba(251,191,36,0.06); font-size: 11px; }
    .hub-lib-trophy-title { font-weight: 600; }
    .hub-lib-stars { color: #fbbf24; font-size: 11px; letter-spacing: 1px; }
    .hub-lib-touched { font-size: 10px; color: var(--ink-muted); }
    .hub-explainer {
      margin-bottom: 12px; padding: 12px 14px; border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--gridline));
      background: color-mix(in srgb, var(--accent) 8%, var(--bg-card));
    }
    .hub-explainer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
    .hub-explainer-head strong { font-size: 13px; color: var(--ink-primary); }
    .hub-explainer-dismiss { font-size: 11px; padding: 2px 8px; flex-shrink: 0; }
    .hub-explainer-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 12px; color: var(--ink-secondary); line-height: 1.45; }
    .hub-explainer-list li::before { content: "·"; margin-right: 6px; color: var(--accent); }
  `;
  document.head.appendChild(el);
}

function hubTodayStr() {
  return localYmd();
}

function hubYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localYmd(d);
}

function hubLinkHost(url) {
  try { return new URL(url).hostname; } catch (_) { return ""; }
}

function hubFaviconUrl(url) {
  const host = hubLinkHost(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}` : "";
}

function hubGetPins() {
  try { return JSON.parse(localStorage.getItem("hubPins") || "[]"); } catch (_) { return []; }
}

function hubSavePins(pins) {
  localStorage.setItem("hubPins", JSON.stringify(pins));
}

function hubGetReading() {
  try { return JSON.parse(localStorage.getItem("hubReading") || "{}"); } catch (_) { return {}; }
}

function hubSaveReading(data) {
  localStorage.setItem("hubReading", JSON.stringify(data));
}

function hubWaypointGame() {
  const wg = window.WaypointGame;
  return wg && typeof wg === "object" ? wg : null;
}

function hubReadingXpKey() {
  return `hubReadingXp_${hubTodayStr()}`;
}

function hubReadingXpCount() {
  try { return Math.max(0, parseInt(localStorage.getItem(hubReadingXpKey()) || "0", 10) || 0); } catch (_) { return 0; }
}

function hubIncReadingXp() {
  const n = hubReadingXpCount() + 1;
  localStorage.setItem(hubReadingXpKey(), String(n));
  return n;
}

function hubQuestsGlanceSummary() {
  const wg = hubWaypointGame();
  if (!wg || typeof wg.getState !== "function") return null;
  let state;
  try { state = wg.getState(); } catch (_) { return null; }
  const quests = state && state.questsToday;
  if (quests == null) return null;
  if (typeof quests === "number") {
    return { value: String(quests), detail: "today" };
  }
  if (Array.isArray(quests)) {
    const done = quests.filter(q => q && (q.done || q.complete)).length;
    return { value: `${done}/${quests.length}`, detail: "quests today" };
  }
  if (typeof quests === "object") {
    const total = quests.total != null ? quests.total : (quests.count != null ? quests.count : null);
    const done = quests.done != null ? quests.done : (quests.completed != null ? quests.completed : 0);
    if (total != null) return { value: `${done}/${total}`, detail: "quests today" };
    if (quests.label) return { value: String(quests.label), detail: "quests today" };
  }
  return null;
}

function hubGameOff() {
  return typeof isGameFeaturesHidden === "function" ? isGameFeaturesHidden() : document.body.classList.contains("game-off");
}

function hubOpenHudQuests() {
  const btn = document.getElementById("hud-quests-btn");
  if (btn) {
    btn.click();
    return;
  }
  if (typeof setHudStatusExpanded === "function") setHudStatusExpanded(true);
  document.getElementById("hud-quests-btn")?.click();
}

function hubGetTouched() {
  try { return JSON.parse(localStorage.getItem("hubLibraryTouched") || "{}"); } catch (_) { return {}; }
}

function hubSaveTouched(data) {
  localStorage.setItem("hubLibraryTouched", JSON.stringify(data));
}

function hubGetWeatherLoc() {
  try { return JSON.parse(localStorage.getItem("hubWeather") || "null"); } catch (_) { return null; }
}

function hubSaveWeatherLoc(loc) {
  localStorage.setItem("hubWeather", JSON.stringify(loc));
}

function hubWeatherEmoji(code) {
  const c = Number(code);
  if (c === 0) return "☀️";
  if (c <= 3) return "⛅";
  if (c <= 48) return "🌫️";
  if (c <= 55) return "🌦️";
  if (c <= 65) return "🌧️";
  if (c <= 75) return "❄️";
  if (c <= 82) return "🌧️";
  if (c <= 99) return "⛈️";
  return "🌡️";
}

function hubParseNote(note) {
  let raw = (note || "").trim();
  let creator = "";
  let rating = null;
  const ratingMatch = raw.match(/\|\s*rating:(\d)\s*$/i);
  if (ratingMatch) {
    rating = Number(ratingMatch[1]);
    raw = raw.slice(0, ratingMatch.index).trim();
  }
  const creatorMatch = raw.match(/^by\s+(.+?)\s*\|\s*/i);
  if (creatorMatch) {
    creator = creatorMatch[1].trim();
    raw = raw.slice(creatorMatch[0].length).trim();
  }
  return { creator, text: raw, rating };
}

function hubBuildNote(creator, text, rating) {
  let note = "";
  if (creator) note = `by ${creator}`;
  if (text) note = note ? `${note} | ${text}` : text;
  if (rating != null && rating >= 1 && rating <= 5) {
    note = note ? `${note} | rating:${rating}` : `rating:${rating}`;
  }
  return note;
}

function hubSetNoteRating(note, rating) {
  const parsed = hubParseNote(note);
  return hubBuildNote(parsed.creator, parsed.text, rating);
}

function hubTouchedAgo(title) {
  const touched = hubGetTouched();
  const ts = touched[title];
  if (!ts) return "";
  const then = new Date(ts);
  const now = new Date();
  const days = Math.floor((now - then) / 86400000);
  if (days <= 0) return "touched today";
  if (days === 1) return "touched 1d ago";
  return `touched ${days}d ago`;
}

function hubLogTouched(title) {
  const touched = hubGetTouched();
  touched[title] = new Date().toISOString();
  hubSaveTouched(touched);
}

function hubBookStreak(bookTitle) {
  const reading = hubGetReading();
  const entry = reading[bookTitle];
  if (!entry || !entry.lastLog) return 0;
  const today = hubTodayStr();
  const yesterday = hubYesterdayStr();
  if (entry.lastLog !== today && entry.lastLog !== yesterday) return 0;
  return entry.streak || 1;
}

function hubLogReading(bookTitle) {
  const reading = hubGetReading();
  const today = hubTodayStr();
  const yesterday = hubYesterdayStr();
  if (!reading[bookTitle]) reading[bookTitle] = { progress: 0, lastLog: null, streak: 0 };
  const entry = reading[bookTitle];
  if (entry.lastLog === today) {
    // already logged today
  } else if (entry.lastLog === yesterday) {
    entry.streak = (entry.streak || 1) + 1;
    entry.lastLog = today;
  } else {
    entry.streak = 1;
    entry.lastLog = today;
  }
  hubSaveReading(reading);
  return entry.streak;
}

function hubRenderStars(rating) {
  if (!rating || rating < 1) return "";
  const full = "★".repeat(Math.min(5, Math.max(1, rating)));
  const empty = "☆".repeat(5 - full.length);
  return `<span class="hub-lib-stars" title="${rating}/5">${full}${empty}</span>`;
}

function hubFindOnlineHtml(item, kind) {
  const title = item.title || "";
  const parsed = hubParseNote(item.note);
  const searchTitle = parsed.creator ? `${title} ${parsed.creator}` : title;
  const links = [];
  if (kind === "book") {
    links.push(["Google Books", `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(title)}`]);
    links.push(["Read online", `https://www.google.com/search?q=${encodeURIComponent(title + " read online")}`]);
    links.push(["Goodreads", `https://www.goodreads.com/search?q=${encodeURIComponent(title)}`]);
  } else if (kind === "comedy") {
    links.push(["YouTube", `https://www.youtube.com/results?search_query=${encodeURIComponent(title + " stand up special")}`]);
    links.push(["Spotify", `https://open.spotify.com/search/${encodeURIComponent(searchTitle)}`]);
  } else if (kind === "watch") {
    links.push(["YouTube", `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTitle)}`]);
  }
  if (!links.length) return "";
  return `<div class="hub-lib-find">${links.map(([label, href]) =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`
  ).join("")}</div>`;
}

function hubFilterLinks(links) {
  if (HUB_LINK_FILTER === "open") return links.filter(l => l.status === "open");
  if (HUB_LINK_FILTER === "done") return links.filter(l => l.status === "done");
  if (HUB_LINK_FILTER === "tasks") return links.filter(l => l.kind === "task");
  return links.filter(l => !HUB_LIBRARY_KINDS.has(l.kind));
}

function hubReceiptUrl() {
  const params = new URLSearchParams();
  params.set("limit", HUB_RECEIPT_FILTER === "all" ? "50" : "120");
  if (HUB_RECEIPT_FILTER === "today") params.set("date", hubTodayStr());
  return `/api/receipts?${params.toString()}`;
}

function hubFilterReceipts(receipts) {
  if (HUB_RECEIPT_FILTER !== "7d") return receipts;
  const cutoff = Date.now() - 7 * 86400000;
  return receipts.filter(r => {
    const t = new Date(r.created_at).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

async function hubFetchReceipts() {
  return hubFilterReceipts(await api(hubReceiptUrl()));
}

function hubRelativeTime(ts) {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

function hubReceiptSourceClass(source) {
  const safe = String(source || "").toLowerCase();
  return ["planner", "arcade", "blueprint", "parallel", "docs", "system"].includes(safe) ? safe : "system";
}

function hubReceiptOriginStampHtml(source) {
  const cls = hubReceiptSourceClass(source);
  return `<span class="hub-receipt-origin ${escapeHtml(cls)}" aria-hidden="true" title="${escapeHtml(source)}"></span>`;
}

function hubRenderReceiptRow(receipt) {
  const source = receipt.source || "system";
  return `<div class="hub-receipt-row" data-id="${escapeHtml(receipt.id)}">
    <span class="hub-receipt-source ${hubReceiptSourceClass(source)}">${escapeHtml(source)}</span>
    <span class="hub-receipt-summary" title="${escapeHtml(receipt.summary || "")}">${escapeHtml(receipt.summary || "")}</span>
    <span class="hub-receipt-time" title="${escapeHtml(receipt.created_at || "")}">${escapeHtml(hubRelativeTime(receipt.created_at))}</span>
    ${hubReceiptOriginStampHtml(source)}
  </div>`;
}

function hubRenderReceipts(receipts, error) {
  const filters = [
    ["today", "Today"],
    ["7d", "7d"],
    ["all", "All"],
  ];
  let body = "";
  if (error) {
    body = `<div class="hub-stub">Could not load receipts.</div>`;
  } else if (receipts.length) {
    body = receipts.map(hubRenderReceiptRow).join("");
  } else {
    body = `<div class="hub-stub">actions leave receipts here</div>`;
  }
  return `<div class="hub-card hub-card-receipts">
    <div class="hub-card-head-row">
      <div class="hub-card-head">Receipts</div>
      <div class="hub-receipt-toolbar">
        ${filters.map(([k, label]) => `<button type="button" class="hub-chip hub-receipt-filter ${HUB_RECEIPT_FILTER === k ? "active" : ""}" data-receipt-filter="${escapeHtml(k)}">${escapeHtml(label)}</button>`).join("")}
        <button type="button" class="secondary hub-receipt-refresh" id="hub-receipt-refresh">Refresh</button>
      </div>
    </div>
    ${body}
  </div>`;
}

async function hubFetchWeather(loc) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=3&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather fetch failed");
  return res.json();
}

async function hubGeocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("geocode failed");
  const data = await res.json();
  if (!data.results || !data.results.length) throw new Error("city not found");
  const r = data.results[0];
  return { name: r.name + (r.admin1 ? `, ${r.admin1}` : ""), lat: r.latitude, lon: r.longitude };
}

function hubRenderWeatherHtml(weather, loc, error) {
  if (error) {
    return `<div class="hub-weather-inline"><span class="hub-stub" style="padding:0;">${escapeHtml(error)}</span>
      <button type="button" class="hub-gear hub-weather-setup" title="Change city">⚙</button></div>`;
  }
  if (!weather || !loc) {
    return `<div class="hub-weather-inline">
      <span class="hub-stub" style="padding:0;">Set city for weather</span>
      <button type="button" class="secondary hub-weather-setup" style="font-size:10px; margin-left:auto;">Choose city</button>
    </div>`;
  }
  const cur = weather.current || {};
  const daily = weather.daily || {};
  const miniDays = (daily.time || []).slice(0, 3).map((day, i) => `
    <div class="hub-weather-mini-day">
      <span>${escapeHtml(new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }))}</span>
      <span>${hubWeatherEmoji(daily.weather_code[i])} ${Math.round(daily.temperature_2m_max[i])}°</span>
    </div>`).join("");
  return `<div class="hub-weather-inline">
    <div class="hub-weather-now">
      <span class="hub-weather-now-emoji">${hubWeatherEmoji(cur.weather_code)}</span>
      <span class="hub-weather-now-temp">${Math.round(cur.temperature_2m ?? 0)}°</span>
      <span class="hub-weather-city-inline">${escapeHtml(loc.name)}</span>
    </div>
    <div class="hub-weather-mini">${miniDays}</div>
    <button type="button" class="hub-gear hub-weather-setup" title="Change city">⚙</button>
  </div>`;
}

function hubShareRowHtml() {
  return `<div class="hub-share-row" id="hub-share-row">
    <button type="button" class="hub-share-app" id="hub-share-app" title="Copy a local or Tailscale link">Send app</button>
    <span class="hub-share-copy">Copies this machine&apos;s URL, Tailscale if it&apos;s up, and a one-line how-to.</span>
  </div>`;
}

function hubRenderExplainer() {
  try {
    if (localStorage.getItem("hubExplained") === "1") return "";
  } catch (_) { return ""; }
  return `
    <div class="hub-explainer card" id="hub-explainer" role="region" aria-label="Hub guide">
      <div class="hub-explainer-head">
        <strong>Your command deck — save links for later, pin your apps and sites, glance at today</strong>
        <button type="button" class="secondary hub-explainer-dismiss" id="hub-explainer-dismiss">Got it</button>
      </div>
      <ul class="hub-explainer-list">
        <li><strong>Link inbox</strong> — paste URLs to save for later; mark done or turn into tasks.</li>
        <li><strong>Pinned apps</strong> — one-click tiles for Gmail, GitHub, localhost, anything you open daily.</li>
        <li><strong>Weather</strong> — set your city once; three-day glance stays inline.</li>
        <li><strong>Library</strong> — books, comedy, and watchlist with progress and &ldquo;tonight&rdquo; picks.</li>
      </ul>
    </div>`;
}

function hubRenderGlance(tasks, events, calEvents, practice, today) {
  const openTasks = tasks.filter(t => t.status === "todo" || t.status === "partial");
  const focusTasks = [...openTasks]
    .map(t => ({ t, meta: typeof taskFocusMeta === "function" ? taskFocusMeta(t, today) : { score: 0 } }))
    .sort((a, b) => b.meta.score - a.meta.score)
    .slice(0, 3);
  const scoutToday = events.filter(ev => typeof briefingEventToday === "function" && briefingEventToday(ev, today));
  const calToday = calEvents.filter(ev => ev.date === today);
  const eventCount = scoutToday.length + calToday.length;
  const eventNames = [
    ...scoutToday.slice(0, 2).map(e => e.title),
    ...calToday.slice(0, 2).map(e => e.title),
  ].slice(0, 3);
  const questsGlance = hubQuestsGlanceSummary();

  return `<div class="hub-glance">
    <div class="hub-glance-item" data-goto="Tasks">
      <div class="hub-glance-label">Open tasks</div>
      <div class="hub-glance-value">${openTasks.length}</div>
      <div class="hub-glance-detail">${focusTasks.length ? focusTasks.map(({ t }) => escapeHtml(t.title)).join(" · ") : "Nothing queued"}</div>
    </div>
    <div class="hub-glance-item" data-goto="Events">
      <div class="hub-glance-label">Today&apos;s events</div>
      <div class="hub-glance-value">${eventCount}</div>
      <div class="hub-glance-detail">${eventNames.length ? eventNames.map(n => escapeHtml(n)).join(" · ") : "Clear calendar"}</div>
    </div>
    ${hubGameOff() ? "" : `<div class="hub-glance-item" data-goto="Practice">
      <div class="hub-glance-label">Practice</div>
      <div class="hub-glance-value">${practice.streak || 0}</div>
      <div class="hub-glance-detail">${practice.points || 0} points</div>
    </div>`}
    ${!hubGameOff() && questsGlance ? `<div class="hub-glance-item hub-glance-quests" id="hub-glance-quests" title="Daily quests are already on">
      <div class="hub-glance-label">Quests</div>
      <div class="hub-glance-value">${escapeHtml(questsGlance.value)}</div>
      <div class="hub-glance-detail">${escapeHtml(questsGlance.detail)}</div>
    </div>` : ""}
  </div>`;
}

function hubRenderLinkRow(link) {
  const done = link.status === "done";
  const isTask = link.kind === "task";
  const host = hubLinkHost(link.url);
  const fav = link.url ? `<img class="hub-favicon" src="${escapeHtml(hubFaviconUrl(link.url))}" alt="" width="18" height="18">` : `<span class="hub-favicon" style="display:inline-block; background:var(--gridline);"></span>`;
  const title = link.title || link.url || "Untitled";
  const href = link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener" class="hub-link-title">${escapeHtml(title)}</a>` : `<span class="hub-link-title">${escapeHtml(title)}</span>`;
  return `<div class="hub-link-row ${done ? "done" : ""}" data-id="${link.id}">
    ${fav}
    <div class="hub-link-body">
      ${href}
      ${host ? `<div class="hub-link-note">${escapeHtml(host)}</div>` : ""}
      ${link.note ? `<div class="hub-link-note">${escapeHtml(link.note)}</div>` : ""}
      ${isTask ? `<div class="hub-link-note" style="color:var(--accent);">→ task</div>` : ""}
    </div>
    <div class="hub-link-actions">
      ${!done ? `<button type="button" class="secondary hub-link-done" data-id="${link.id}">✓</button>` : ""}
      ${!isTask && !HUB_LIBRARY_KINDS.has(link.kind) ? `<button type="button" class="secondary hub-link-task" data-id="${link.id}">→ task</button>` : ""}
      <button type="button" class="secondary hub-link-delete" data-id="${link.id}">×</button>
    </div>
  </div>`;
}

function hubRenderPins(pins) {
  const emptySuggestions = !pins.length ? `
    <div class="hub-suggestions">
      ${HUB_PIN_PRESETS.map(p => `<button type="button" class="hub-suggestion hub-pin-suggest" data-label="${escapeHtml(p.label)}" data-url="${escapeHtml(p.url)}" data-emoji="${escapeHtml(p.emoji)}">${escapeHtml(p.emoji)} ${escapeHtml(p.label)}</button>`).join("")}
    </div>` : "";

  return `${emptySuggestions}
    <div class="hub-pin-grid">
      ${pins.map((p, idx) => `
        <div class="hub-pin-tile" data-pin-idx="${idx}">
          <button type="button" class="hub-pin-remove" data-pin-idx="${idx}" title="Unpin ${escapeHtml(p.label)}" aria-label="Unpin ${escapeHtml(p.label)}">×</button>
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" title="${escapeHtml(p.url)}" style="display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:inherit;width:100%;">
            <span class="hub-pin-emoji">${escapeHtml(p.emoji || "🔗")}</span>
            <span class="hub-pin-label">${escapeHtml(p.label)}</span>
          </a>
        </div>`).join("")}
      <button type="button" class="hub-pin-tile hub-pin-add" id="hub-pin-toggle">+ pin</button>
    </div>
    <div class="hub-pin-form" id="hub-pin-form" style="display:none;">
      <input type="text" id="hub-pin-emoji" placeholder="emoji" maxlength="4" style="width:48px; flex:0;">
      <input type="text" id="hub-pin-label" placeholder="Label">
      <input type="url" id="hub-pin-url" placeholder="https://… or localhost:…">
      <button type="button" class="primary" id="hub-pin-save">Add</button>
      <button type="button" class="secondary" id="hub-pin-cancel">Cancel</button>
    </div>
    ${pins.length ? `<div style="margin-top:8px;"><button type="button" class="secondary hub-pin-clear" style="font-size:11px;">Clear all pins</button></div>` : ""}`;
}

function hubRenderLibraryItem(item, kind, compact) {
  const parsed = hubParseNote(item.note);
  const finished = item.status === "done";
  const statusLabel = finished ? "finished" : "queued";
  const statusClass = finished ? "done" : "open";
  const reading = hubGetReading();
  const entry = reading[item.title] || { progress: 0, lastLog: null };
  const streak = kind === "book" ? hubBookStreak(item.title) : 0;
  const touchedLabel = kind !== "book" ? hubTouchedAgo(item.title) : "";

  const titleLine = parsed.creator
    ? `<strong>${escapeHtml(item.title)}</strong> <span class="hub-lib-creator">by ${escapeHtml(parsed.creator)}</span>`
    : `<strong>${escapeHtml(item.title)}</strong>`;

  const noteLine = parsed.text ? `<div class="hub-link-note">${escapeHtml(parsed.text)}</div>` : "";
  const stars = finished && kind === "book" ? hubRenderStars(parsed.rating) : "";

  let progressBlock = "";
  if (!compact && kind === "book" && !finished) {
    progressBlock = `
      <input type="range" class="hub-progress hub-book-progress" data-title="${escapeHtml(item.title)}" min="0" max="100" value="${entry.progress || 0}">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--ink-muted);">
        <span class="hub-lib-pct">${entry.progress || 0}%</span>
        <span>${entry.lastLog ? `last read ${escapeHtml(entry.lastLog)}` : "not logged yet"}</span>
      </div>`;
  }

  const metaRight = [
    streak > 0 ? `<span class="hub-book-streak" title="Reading streak">${streak}🔥</span>` : "",
    touchedLabel ? `<span class="hub-lib-touched">${escapeHtml(touchedLabel)}</span>` : "",
    stars,
  ].filter(Boolean).join(" ");

  const logBtn = !finished && !compact ? (
    kind === "book"
      ? `<button type="button" class="secondary hub-book-log" data-title="${escapeHtml(item.title)}" style="font-size:11px;">Log reading</button>`
      : `<button type="button" class="secondary hub-lib-touch" data-title="${escapeHtml(item.title)}" style="font-size:11px;">Watched some</button>`
  ) : "";

  const finishBtn = !finished && !compact
    ? `<button type="button" class="secondary hub-lib-finish" data-id="${item.id}" data-kind="${escapeHtml(kind)}" style="font-size:11px;">Finished</button>`
    : "";

  const deleteBtn = !compact
    ? `<button type="button" class="secondary hub-lib-delete" data-id="${item.id}" style="font-size:11px;">Delete</button>`
    : "";

  if (compact) {
    return `<div class="hub-lib-trophy" data-id="${item.id}">
      <div class="hub-lib-trophy-title">${escapeHtml(item.title)}</div>
      ${parsed.creator ? `<div class="hub-lib-creator">by ${escapeHtml(parsed.creator)}</div>` : ""}
      ${stars}
      ${hubFindOnlineHtml(item, kind)}
    </div>`;
  }

  return `<div class="hub-book-row ${finished ? "finished" : ""}" data-id="${item.id}" data-kind="${escapeHtml(kind)}">
    <div class="hub-book-head">
      <div>${titleLine}</div>
      <span style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <span class="hub-lib-status ${statusClass}">${escapeHtml(statusLabel)}</span>
        ${metaRight}
      </span>
    </div>
    ${item.url && hubLinkHost(item.url) ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" style="font-size:11px;">${escapeHtml(item.url)}</a>` : ""}
    ${noteLine}
    ${hubFindOnlineHtml(item, kind)}
    ${progressBlock}
    <div class="hub-lib-actions">
      ${logBtn}
      ${finishBtn}
      ${deleteBtn}
    </div>
  </div>`;
}

function hubRenderLibrarySpotlight(item, kind) {
  if (!item) return "";
  const parsed = hubParseNote(item.note);
  const creatorBit = parsed.creator ? ` <span class="hub-lib-creator">by ${escapeHtml(parsed.creator)}</span>` : "";
  return `<div class="hub-lib-spotlight" data-spotlight-id="${item.id}" data-spotlight-kind="${escapeHtml(kind)}">
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
      <div>
        <div class="hub-lib-spotlight-label">Tonight</div>
        <div class="hub-lib-spotlight-title">${escapeHtml(item.title)}${creatorBit}</div>
      </div>
      <button type="button" class="secondary hub-lib-spotlight-unpin" data-kind="${escapeHtml(kind)}" title="Unpin suggestion" style="font-size:10px; padding:2px 7px; flex-shrink:0;">Unpin</button>
    </div>
    ${hubFindOnlineHtml(item, kind)}
  </div>`;
}

function hubRenderLibrary(links) {
  const tabMeta = HUB_LIBRARY_TABS.find(t => t.key === HUB_LIBRARY_TAB) || HUB_LIBRARY_TABS[0];
  const tabItems = links.filter(l => l.kind === HUB_LIBRARY_TAB);
  const openItems = tabItems.filter(l => l.status !== "done");
  const doneItems = tabItems.filter(l => l.status === "done");
  const spotlightId = HUB_LIBRARY_SPOTLIGHT[HUB_LIBRARY_TAB];
  const spotlightItem = spotlightId
    ? openItems.find(i => i.id === spotlightId) || null
    : null;

  const tabsHtml = HUB_LIBRARY_TABS.map(t => {
    const count = links.filter(l => l.kind === t.key && l.status !== "done").length;
    return `<button type="button" class="hub-lib-tab ${HUB_LIBRARY_TAB === t.key ? "active" : ""}" data-lib-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}${count ? ` (${count})` : ""}</button>`;
  }).join("");

  const openHtml = openItems.length
    ? openItems.map(i => hubRenderLibraryItem(i, HUB_LIBRARY_TAB, false)).join("")
    : `<div class="empty-state empty-state--compact" id="hub-queue-empty">
        <p class="empty-state-title">Nothing queued</p>
        <p class="empty-state-body">Save a title below, or let Suggest next pick one.</p>
        <button type="button" class="primary empty-state-cta" id="hub-empty-add">Add one</button>
      </div>`;

  const finishedHtml = doneItems.length ? `
    <details class="hub-lib-finished">
      <summary>Finished (${doneItems.length})</summary>
      <div class="hub-lib-shelf">${doneItems.map(i => hubRenderLibraryItem(i, HUB_LIBRARY_TAB, true)).join("")}</div>
    </details>` : "";

  return `
    <div class="hub-lib-tabs">${tabsHtml}</div>
    <div class="hub-lib-toolbar">
      <button type="button" class="secondary hub-lib-suggest" data-kind="${escapeHtml(HUB_LIBRARY_TAB)}" style="font-size:10px;">Suggest next</button>
    </div>
    ${hubRenderLibrarySpotlight(spotlightItem, HUB_LIBRARY_TAB)}
    <div class="hub-add-form">
      <input type="text" id="hub-lib-title" placeholder="${escapeHtml(tabMeta.placeholder)}">
      <input type="text" id="hub-lib-creator" placeholder="${escapeHtml(tabMeta.creatorPh)}">
      <button type="button" class="primary" id="hub-lib-add">Add</button>
    </div>
    ${openHtml}
    ${finishedHtml}`;
}

async function renderHub() {
  hubEnsureStyles();
  const today = hubTodayStr();
  let links = [];
  let tasks = [];
  let events = [];
  let calEvents = [];
  let practice = { points: 0, streak: 0 };
  let receipts = [];
  let receiptsError = null;
  let weather = HUB_WEATHER_CACHE;
  let weatherError = null;
  const loc = hubGetWeatherLoc();

  try {
    [links, tasks, events, calEvents, practice] = await Promise.all([
      api("/api/links"),
      api("/api/tasks"),
      api("/api/events"),
      api("/api/calendar"),
      api("/api/practice/summary"),
    ]);
  } catch (_) {
    return `${renderAppSubnavPills(["Agent", "Hub"], { label: "Agent workspace views" })}<div class="card stub">Could not load Hub data — is the server running?</div>`;
  }

  try {
    receipts = await hubFetchReceipts();
  } catch (_) {
    receiptsError = true;
  }

  if (loc) {
    try {
      weather = await hubFetchWeather(loc);
      HUB_WEATHER_CACHE = weather;
      weatherError = null;
    } catch (_) {
      weatherError = navigator.onLine === false ? "Offline — weather unavailable" : "Could not load weather";
    }
  }

  const inboxLinks = links.filter(l => !HUB_LIBRARY_KINDS.has(l.kind));
  const filtered = hubFilterLinks(inboxLinks);
  const pins = hubGetPins();

  const chips = [
    ["all", "All"],
    ["open", "Open"],
    ["done", "Done"],
    ["tasks", "Tasks"],
  ];

  return `
    ${renderAppSubnavPills(["Agent", "Hub"], { label: "Agent workspace views" })}
    ${hubShareRowHtml()}
    ${hubRenderExplainer()}
    ${hubRenderGlance(tasks, events, calEvents, practice, today)}
    <div class="hub-stack">
      <div class="hub-card">
        <div class="hub-card-head">Link inbox</div>
        <div class="hub-add-form hub-add-form-prominent">
          <input type="url" id="hub-link-url" placeholder="Paste URL to save…" autocomplete="off">
          <input type="text" id="hub-link-note" placeholder="Note (optional)">
          <button type="button" class="primary" id="hub-link-save">Save</button>
        </div>
        <div class="hub-chips">
          ${chips.map(([k, label]) => `<button type="button" class="hub-chip ${HUB_LINK_FILTER === k ? "active" : ""}" data-filter="${k}">${escapeHtml(label)}</button>`).join("")}
        </div>
        ${filtered.length ? filtered.map(hubRenderLinkRow).join("") : `<div class="hub-stub">No links in this view.</div>`}
      </div>
      <div class="hub-card">
        <div class="hub-card-head">Pinned apps</div>
        ${hubRenderPins(pins)}
      </div>
      ${hubRenderReceipts(receipts, receiptsError)}
      ${hubRenderWeatherHtml(weather, loc, weatherError)}
      <div class="hub-card hub-card-library">
        ${hubRenderLibrary(links)}
      </div>
    </div>`;
}

function wireHub() {
  const emptyAdd = document.getElementById("hub-empty-add");
  if (emptyAdd) {
    emptyAdd.onclick = () => document.getElementById("hub-lib-title")?.focus();
  }
  const explainerDismiss = document.getElementById("hub-explainer-dismiss");
  if (explainerDismiss) {
    explainerDismiss.onclick = () => {
      try { localStorage.setItem("hubExplained", "1"); } catch (_) {}
      document.getElementById("hub-explainer")?.remove();
    };
  }

  document.querySelectorAll(".hub-glance-item").forEach(el => {
    if (el.id === "hub-glance-quests") return;
    el.onclick = () => goToTab(el.dataset.goto);
  });

  document.getElementById("hub-glance-quests")?.addEventListener("click", hubOpenHudQuests);
  document.getElementById("hub-share-app")?.addEventListener("click", () => {
    if (typeof copyShareAppLink === "function") copyShareAppLink();
  });

  if (HUB_FOCUS_LINK_INPUT) {
    HUB_FOCUS_LINK_INPUT = false;
    const inp = document.getElementById("hub-link-url");
    if (inp) { inp.focus(); inp.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }

  const linkUrl = document.getElementById("hub-link-url");
  const linkNote = document.getElementById("hub-link-note");
  const linkSave = document.getElementById("hub-link-save");
  if (linkSave) {
    const saveLink = async () => {
      const url = (linkUrl?.value || "").trim();
      if (!url) { showToast("URL required", "warn"); return; }
      let title = url;
      try { title = new URL(url).hostname; } catch (_) {}
      await api("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title, note: (linkNote?.value || "").trim() }),
      });
      const wg = hubWaypointGame();
      if (wg && typeof wg.questProgress === "function") wg.questProgress("capture3");
      if (linkUrl) linkUrl.value = "";
      if (linkNote) linkNote.value = "";
      await render();
    };
    linkSave.onclick = saveLink;
    linkUrl?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveLink(); } });
  }

  document.querySelectorAll(".hub-chip").forEach(btn => {
    btn.onclick = () => { HUB_LINK_FILTER = btn.dataset.filter; render(); };
  });

  document.querySelectorAll(".hub-receipt-filter").forEach(btn => {
    btn.onclick = () => { HUB_RECEIPT_FILTER = btn.dataset.receiptFilter || "today"; render(); };
  });

  document.getElementById("hub-receipt-refresh")?.addEventListener("click", () => render());

  document.querySelectorAll(".hub-link-done").forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/links/${btn.dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      await render();
    };
  });

  document.querySelectorAll(".hub-link-delete").forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/links/${btn.dataset.id}`, { method: "DELETE" });
      await render();
    };
  });

  document.querySelectorAll(".hub-link-task").forEach(btn => {
    btn.onclick = async () => {
      const row = btn.closest(".hub-link-row");
      const id = btn.dataset.id;
      const titleEl = row?.querySelector(".hub-link-title");
      const label = titleEl?.textContent?.trim() || "link";
      await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Check: ${label}`, urgency: "low" }),
      });
      await api(`/api/links/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "task" }),
      });
      const wg = hubWaypointGame();
      if (wg && typeof wg.awardXp === "function") wg.awardXp(4, "triaged");
      showToast("Task created", "good");
      await render();
    };
  });

  document.querySelectorAll(".hub-weather-setup").forEach(btn => {
    btn.onclick = async () => {
      const city = prompt("City name for weather:");
      if (!city || !city.trim()) return;
      try {
        const loc = await hubGeocodeCity(city.trim());
        hubSaveWeatherLoc(loc);
        HUB_WEATHER_CACHE = null;
        await render();
      } catch (_) {
        showToast("City not found", "warn");
      }
    };
  });

  const pinToggle = document.getElementById("hub-pin-toggle");
  const pinForm = document.getElementById("hub-pin-form");
  if (pinToggle && pinForm) {
    pinToggle.onclick = () => { pinForm.style.display = pinForm.style.display === "none" ? "flex" : "none"; };
    document.getElementById("hub-pin-cancel")?.addEventListener("click", () => { pinForm.style.display = "none"; });
    document.getElementById("hub-pin-save")?.addEventListener("click", () => {
      const label = (document.getElementById("hub-pin-label")?.value || "").trim();
      const url = (document.getElementById("hub-pin-url")?.value || "").trim();
      const emoji = (document.getElementById("hub-pin-emoji")?.value || "").trim() || "🔗";
      if (!label || !url) { showToast("Label and URL required", "warn"); return; }
      const pins = hubGetPins();
      pins.push({ label, url, emoji });
      hubSavePins(pins);
      pinForm.style.display = "none";
      render();
    });
  }

  document.querySelectorAll(".hub-pin-suggest").forEach(btn => {
    btn.onclick = () => {
      const pins = hubGetPins();
      pins.push({ label: btn.dataset.label, url: btn.dataset.url, emoji: btn.dataset.emoji });
      hubSavePins(pins);
      render();
    };
  });

  document.querySelectorAll(".hub-pin-remove").forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.dataset.pinIdx);
      const pins = hubGetPins();
      if (!Number.isFinite(idx) || idx < 0 || idx >= pins.length) return;
      pins.splice(idx, 1);
      hubSavePins(pins);
      render();
    };
  });

  document.querySelector(".hub-pin-clear")?.addEventListener("click", () => {
    if (confirm("Remove all pinned apps?")) { hubSavePins([]); render(); }
  });

  document.querySelectorAll(".hub-lib-tab").forEach(btn => {
    btn.onclick = () => {
      HUB_LIBRARY_TAB = btn.dataset.libTab;
      render();
    };
  });

  document.querySelectorAll(".hub-lib-suggest").forEach(btn => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      let items;
      try {
        items = await api("/api/links");
      } catch (_) {
        showToast("Could not load library", "warn");
        return;
      }
      const open = items.filter(l => l.kind === kind && l.status !== "done");
      if (!open.length) {
        showToast("Nothing queued in this tab", "warn");
        hubClearSpotlight(kind);
        render();
        return;
      }
      const pick = open[Math.floor(Math.random() * open.length)];
      HUB_LIBRARY_SPOTLIGHT[kind] = pick.id;
      hubSaveSpotlight();
      render();
    };
  });

  document.querySelectorAll(".hub-lib-spotlight-unpin").forEach(btn => {
    btn.onclick = () => {
      hubClearSpotlight(btn.dataset.kind);
      render();
    };
  });

  const libAdd = document.getElementById("hub-lib-add");
  if (libAdd) {
    const addLibraryItem = async () => {
      const title = (document.getElementById("hub-lib-title")?.value || "").trim();
      const creator = (document.getElementById("hub-lib-creator")?.value || "").trim();
      if (!title) { showToast("Title required", "warn"); return; }
      const note = creator ? `by ${creator}` : "";
      const kind = HUB_LIBRARY_TAB;
      const payload = { title, kind, note, status: "open" };
      if (kind === "book") {
        payload.url = "";
      } else {
        payload.url = "none";
      }
      await api("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const titleInp = document.getElementById("hub-lib-title");
      const creatorInp = document.getElementById("hub-lib-creator");
      if (titleInp) titleInp.value = "";
      if (creatorInp) creatorInp.value = "";
      await render();
    };
    libAdd.onclick = addLibraryItem;
    document.getElementById("hub-lib-title")?.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); addLibraryItem(); }
    });
  }

  document.querySelectorAll(".hub-book-progress").forEach(slider => {
    slider.oninput = () => {
      const reading = hubGetReading();
      const title = slider.dataset.title;
      if (!reading[title]) reading[title] = { progress: 0, lastLog: null, streak: 0 };
      reading[title].progress = Number(slider.value);
      hubSaveReading(reading);
      const row = slider.closest(".hub-book-row");
      const pct = row?.querySelector(".hub-lib-pct");
      if (pct) pct.textContent = `${slider.value}%`;
    };
  });

  document.querySelectorAll(".hub-book-log").forEach(btn => {
    btn.onclick = () => {
      const title = btn.dataset.title;
      const streak = hubLogReading(title);
      if (hubReadingXpCount() < 2) {
        hubIncReadingXp();
        const wg = hubWaypointGame();
        if (wg && typeof wg.awardXp === "function") wg.awardXp(6, "reading");
        if (wg && typeof wg.questProgress === "function") wg.questProgress("book1");
      }
      showToast(streak > 1 ? `Reading logged — ${streak} day streak!` : "Reading logged", "good");
      render();
    };
  });

  document.querySelectorAll(".hub-lib-touch").forEach(btn => {
    btn.onclick = () => {
      hubLogTouched(btn.dataset.title);
      showToast("Progress logged", "good");
      render();
    };
  });

  document.querySelectorAll(".hub-lib-finish").forEach(btn => {
    btn.onclick = async () => {
      const row = btn.closest(".hub-book-row");
      const title = row?.querySelector("strong")?.textContent?.trim();
      const kind = btn.dataset.kind;
      const id = btn.dataset.id;
      row?.classList.add("finished");

      let notePatch = null;
      if (kind === "book") {
        const raw = prompt("Rate this book (1–5 stars):", "4");
        if (raw != null && raw.trim()) {
          const rating = Math.min(5, Math.max(1, parseInt(raw.trim(), 10) || 0));
          if (rating >= 1) {
            try {
              const links = await api("/api/links");
              const item = links.find(l => String(l.id) === String(id));
              if (item) notePatch = hubSetNoteRating(item.note, rating);
            } catch (_) {}
          }
        }
      }

      const patchBody = { status: "done" };
      if (notePatch != null) patchBody.note = notePatch;

      await api(`/api/links/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (kind === "book" && title) {
        const reading = hubGetReading();
        if (reading[title]) reading[title].progress = 100;
        else reading[title] = { progress: 100, lastLog: hubTodayStr(), streak: reading[title]?.streak || 0 };
        hubSaveReading(reading);
      }

      if (HUB_LIBRARY_SPOTLIGHT[kind] === Number(id)) {
        hubClearSpotlight(kind);
      }

      if (kind === "book") {
        const wg = hubWaypointGame();
        if (wg && typeof wg.awardXp === "function") wg.awardXp(35, "book finished");
        showToast("Book finished! +35 XP · +1 gem", "good");
      } else {
        showToast("Marked finished!", "good");
      }
      await render();
    };
  });

  document.querySelectorAll(".hub-lib-delete").forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/links/${btn.dataset.id}`, { method: "DELETE" });
      await render();
    };
  });
}
