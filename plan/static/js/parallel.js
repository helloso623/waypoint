// --- Parallel: tabletop-RPG game interface ---------------------------------

const RPL_HISTORY_KEY = "rplHistory";
const RPL_HISTORY_MAX = 20;
const RPL_POLL_MS = 1500;
const RPL_TYPE_MS = 8;
const RPL_COIN_MS = 700;
const RPL_CHRONICLE_PAGE = 5;
const RPL_MAP_POLL_MS = 3000;

const RPL_SCREENS = ["home", "play", "inventory", "shop", "map", "modify"];
function rplReadStoredScreen() {
  const stored = localStorage.getItem("rplMainTab");
  return RPL_SCREENS.includes(stored) ? stored : "play";
}
let RPL_MAIN_TAB = rplReadStoredScreen();
let RPL_CMD_INDEX = -1;
let RPL_CMD_DRAFT = "";
let RPL_POLL_TIMER = null;
let RPL_TYPEWRITER = null;
let RPL_FLAVOR_TIMER = null;
let RPL_FLAVOR_IDX = 0;
let RPL_MESSAGES = [];
let RPL_STATE = null;
let RPL_JOURNAL = [];
let RPL_FORMING = false;
let RPL_BUSY = false;
let RPL_STATUS_SUPPORTED = true;
let RPL_POLL_MODE = "status";
let RPL_BACKDROP_ACTIVE = "a";
let RPL_PENDING_GM_SNAPSHOT = null;
let RPL_WALLET = null;
let RPL_MAP = null;
let RPL_PORTRAITS = [];
let RPL_API = { coins: true, wallet: true, map: true, portraits: true, bend: true, rules: true, items: true, scenes: true, pregen: true };
let RPL_ITEMS = [];
let RPL_SCENES = [];
let RPL_MAP_AUTO_GEN = false;
let RPL_SCENE_POLL_TIMER = null;
let RPL_PENDING_SCENE_MSG_ID = null;
let RPL_SCENE_POLL_COUNT = 0;
const RPL_SCENE_POLL_MS = 1500;
const RPL_SCENE_POLL_MAX = 24;
let RPL_CHRONICLE_PAGE_IDX = 0;
let RPL_CHRONICLE_FOLLOW = true;
let RPL_INV_INSPECT_IDX = null;
let RPL_SCENE_FAIL = null;
let RPL_SCENE_PROMPT = "";
let RPL_PENDING_CHOICE = null;
let RPL_IMAGE_GEN = { available: true, reason: null };
let RPL_QUEST_TAB = "active";
let RPL_LEFT_COLLAPSED = false;
let RPL_RIGHT_COLLAPSED = false;
let RPL_MAP_POLL_TIMER = null;
let RPL_PORTRAIT_POLL_TIMER = null;
let RPL_COIN_BALANCE = 0;
let RPL_BEND_PREVIEW = null;
let RPL_BEND_HOLD_RAF = null;
let RPL_BEND_LAST_OUTCOME = null;
let RPL_BEND_OUTCOME_TIMER = null;
const RPL_BEND_HOLD_MS = 900;
const RPL_BEND_EMPTY_COPY = "Describe a change to the living world. Canon blocks contradictions.";
const RPL_BEND_OUTCOME_TTL_MS = 45000;
const RPL_BEND_OUTCOME_SHOW_MS = 7000;
let RPL_RULES = null;
let RPL_CODEX_TAB = "rules";
let RPL_CODEX_OPEN = false;
let RPL_RECEIPTS_SUPPORTED = true;
let RPL_RECEIPTS = [];
let RPL_PENDING_DEED_ID = null;
let RPL_PARALLEL_SETTINGS = null;
let RPL_PREGEN = { running: false, done: 0, total: 0, generated: 0, skipped: 0, failed: 0, message: "" };
let RPL_PREGEN_POLL_TIMER = null;
let RPL_PREGEN_POLLING = false;
const RPL_LS_DENSITY = "rpl_text_density";
const RPL_LS_SPECTACLE = "rpl_reduced_spectacle";

const RPL_DEEDS = [
  {
    id: "forge",
    label: "Forge a device",
    prefill: "I spend the day forging the device I designed — applying what I built in the real workshop.",
    requirement: "Requires a blueprint run receipt from today",
    matches: (r) => r.source === "blueprint" && r.kind === "run" && rplReceiptIsToday(r),
    jump: () => {
      if (typeof AUTOMATION_STUDIO_OPEN !== "undefined") AUTOMATION_STUDIO_OPEN = true;
      if (typeof renderAutomationStudioView === "function") renderAutomationStudioView();
    },
  },
  {
    id: "train",
    label: "Train under pressure",
    prefill: "I train under pressure — carrying the arcade's tempo into drills until my body remembers the rhythm.",
    requirement: "Requires an arcade match_played receipt from today",
    matches: (r) => r.source === "arcade" && r.kind === "match_played" && rplReceiptIsToday(r),
    jump: () => { if (typeof goToTab === "function") goToTab("Practice"); },
  },
  {
    id: "honor",
    label: "Honor my commitments",
    prefill: "I honor my commitments openly — letting today's real promises strengthen my reputation here.",
    requirement: "Requires a planner day_saved or contract_done receipt from today",
    matches: (r) => r.source === "planner" && (r.kind === "day_saved" || r.kind === "contract_done") && rplReceiptIsToday(r),
    jump: () => { if (typeof goToTab === "function") goToTab("Today"); },
  },
];

const RPL_FLAVOR_LINES = [
  "GM is writing the response…",
  "Usually takes 10–30 seconds.",
  "Your action is locked in — waiting on the world.",
  "Still working — check story below when it lands.",
];

async function parallelFetch(path, opts) {
  try {
    const res = await fetch(path, opts);
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }
}

function rplTodayIso() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rplReceiptIsToday(receipt) {
  const raw = receipt && receipt.created_at;
  if (!raw) return false;
  return String(raw).slice(0, 10) === rplTodayIso();
}

function rplDeedUnlocked(deed) {
  if (!deed || !Array.isArray(RPL_RECEIPTS)) return false;
  return RPL_RECEIPTS.some(r => deed.matches(r));
}

async function rplFetchReceipts() {
  const res = await parallelFetch("/api/receipts");
  if (res.status === 404) {
    RPL_RECEIPTS_SUPPORTED = false;
    RPL_RECEIPTS = [];
    return;
  }
  if (!res.ok || !Array.isArray(res.data)) return;
  RPL_RECEIPTS_SUPPORTED = true;
  RPL_RECEIPTS = res.data;
}

async function rplPostDeedReceipt(deedName) {
  try {
    await parallelFetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "parallel",
        kind: "deed",
        summary: `${deedName} unlocked by real action`,
      }),
    });
  } catch (_) { /* graceful */ }
}

function rplRenderDeedChip(deed) {
  const unlocked = rplDeedUnlocked(deed);
  const req = escapeHtml(deed.requirement);
  const label = escapeHtml(deed.label);
  const lock = unlocked ? "" : `<span class="rpl-deed-lock" aria-hidden="true">${rplMarkSvg("lock", "rpl-deed-lock")}</span>`;
  const cls = unlocked ? "rpl-deed-chip rpl-deed-unlocked" : "rpl-deed-chip rpl-deed-locked";
  return `<button type="button" class="${cls}" data-deed-id="${escapeHtml(deed.id)}" title="${req}" aria-disabled="${unlocked ? "false" : "true"}">
    ${lock}<span class="rpl-deed-label">${label}</span>
    ${unlocked ? "" : `<span class="rpl-deed-go" data-deed-go="${escapeHtml(deed.id)}">go →</span>`}
  </button>`;
}

function rplRenderDeedsRowHtml() {
  if (!RPL_RECEIPTS_SUPPORTED) return "";
  const chips = RPL_DEEDS.map(rplRenderDeedChip).join("");
  return `<div class="rpl-deeds-row" id="rpl-deeds-row">
    <div class="rpl-deeds-label">Deeds</div>
    <div class="rpl-deeds-chips" role="group" aria-label="Reality-gated deeds">${chips}</div>
    <p class="rpl-deeds-explainer">the world rewards what you really did today</p>
  </div>`;
}

function rplUpdateDeedsRow() {
  const row = document.getElementById("rpl-deeds-row");
  if (!RPL_RECEIPTS_SUPPORTED) {
    if (row) row.remove();
    return;
  }
  if (!row) {
    const bar = document.getElementById("rpl-action-bar");
    const inputWrap = bar && bar.querySelector(".rpl-input-wrap");
    if (inputWrap) inputWrap.insertAdjacentHTML("beforebegin", rplRenderDeedsRowHtml());
    rplWireDeeds();
    return;
  }
  const chips = row.querySelector(".rpl-deeds-chips");
  if (chips) {
    chips.innerHTML = RPL_DEEDS.map(rplRenderDeedChip).join("");
    rplWireDeeds();
  }
}

function rplDeedJump(deedId) {
  const deed = RPL_DEEDS.find(d => d.id === deedId);
  if (deed && typeof deed.jump === "function") deed.jump();
}

function rplWireDeeds() {
  const row = document.getElementById("rpl-deeds-row");
  if (!row || !RPL_RECEIPTS_SUPPORTED) return;
  row.querySelectorAll(".rpl-deed-go").forEach(go => {
    go.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      rplDeedJump(go.getAttribute("data-deed-go") || "");
    };
  });
  row.querySelectorAll(".rpl-deed-chip.rpl-deed-locked").forEach(chip => {
    chip.onclick = (e) => {
      if (e.target.closest(".rpl-deed-go")) return;
      e.preventDefault();
    };
  });
  row.querySelectorAll(".rpl-deed-chip.rpl-deed-unlocked").forEach(chip => {
    chip.onclick = () => {
      const deedId = chip.getAttribute("data-deed-id") || "";
      const deed = RPL_DEEDS.find(d => d.id === deedId);
      const input = document.getElementById("rpl-input");
      if (!deed || !input || input.disabled) return;
      input.value = deed.prefill;
      input.focus();
      RPL_PENDING_DEED_ID = deed.id;
      RPL_CMD_INDEX = -1;
      RPL_CMD_DRAFT = input.value;
    };
  });
}

function rplPlayerId() {
  const chars = (RPL_STATE && RPL_STATE.characters) || [];
  const mc = chars.find(c => c.role === "player_character" || c.id === "mc");
  return (mc && mc.id) || "mc";
}

function rplResolveLocalImage(kind, id) {
  try {
    if (typeof window !== "undefined" && typeof window.wpLocalImage === "function") {
      const url = window.wpLocalImage(kind, id);
      if (url) return String(url);
    }
  } catch (_) { /* Grok H helper is optional */ }
  return "";
}

function rplPortraitUrl(characterId) {
  const local = rplResolveLocalImage("portrait", characterId);
  if (local) return local;
  const hit = RPL_PORTRAITS.find(p => String(p.character_id) === String(characterId));
  return hit && hit.url ? hit.url : "";
}

let RPL_SVG_SEQ = 0;
function rplSvgUid(prefix) {
  RPL_SVG_SEQ += 1;
  return `${prefix}${RPL_SVG_SEQ}`;
}

function rplMarkSvg(kind, extraClass) {
  const cls = extraClass ? `rpl-mark ${extraClass}` : "rpl-mark";
  const marks = {
    world: `<circle cx="48" cy="48" r="16" fill="currentColor"/><ellipse cx="48" cy="48" rx="38" ry="16" fill="none" stroke="currentColor" stroke-width="6.5" transform="rotate(-28 48 48)"/><ellipse cx="48" cy="48" rx="38" ry="16" fill="none" stroke="currentColor" stroke-width="6.5" transform="rotate(28 48 48)"/><circle cx="78" cy="34" r="6" fill="currentColor"/>`,
    char: `<circle cx="48" cy="30" r="16" fill="currentColor"/><path d="M18 86c2-24 14-36 30-40 16 4 28 16 30 40H18z" fill="currentColor"/>`,
    inv: `<path d="M22 38h52l6 42H16z" fill="currentColor"/><path d="M30 38c0-12 8-20 18-20s18 8 18 20" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><rect x="42" y="50" width="12" height="16" rx="3" fill="#0c0a08"/>`,
    quest: `<path d="M48 12 84 48 48 84 12 48z" fill="currentColor"/><path d="M48 28v40M40 36h16" stroke="#0c0a08" stroke-width="7" stroke-linecap="round"/>`,
    chron: `<path d="M16 20h28c8 0 12 4 12 12v48H28c-8 0-12-4-12-12V20z" fill="currentColor" opacity=".45"/><path d="M80 20H52c-8 0-12 4-12 12v48h32c8 0 12-4 12-12V20z" fill="currentColor"/>`,
    map: `<circle cx="48" cy="48" r="30" fill="currentColor" opacity=".22"/><path d="M48 14l8 26 26 8-26 8-8 26-8-26-26-8 26-8z" fill="currentColor"/>`,
    menu: `<rect x="18" y="24" width="60" height="8" rx="4" fill="currentColor"/><rect x="18" y="44" width="60" height="8" rx="4" fill="currentColor"/><rect x="18" y="64" width="40" height="8" rx="4" fill="currentColor"/>`,
    railL: `<rect x="20" y="16" width="14" height="64" rx="4" fill="currentColor"/><path d="M42 32h34v8H42zM42 48h26v8H42z" fill="currentColor"/>`,
    railR: `<rect x="62" y="16" width="14" height="64" rx="4" fill="currentColor"/><path d="M20 32h34v8H20zM28 48h26v8H28z" fill="currentColor"/>`,
    upload: `<rect x="18" y="22" width="60" height="52" rx="8" fill="currentColor" opacity=".22"/><path d="M48 34v28M38 44l10-10 10 10" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    lock: `<rect x="24" y="42" width="48" height="36" rx="8" fill="currentColor"/><path d="M34 42V32a14 14 0 0 1 28 0v10" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="60" r="5" fill="#0c0a08"/>`,
    coin: `<circle cx="48" cy="48" r="28" fill="currentColor"/><circle cx="48" cy="48" r="16" fill="none" stroke="#0c0a08" stroke-width="5"/><path d="M48 36v24" stroke="#0c0a08" stroke-width="5" stroke-linecap="round"/>`,
    close: `<path d="M28 28l40 40M68 28 28 68" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`,
    replace: `<path d="M70 48a22 22 0 1 1-6.4-15.6" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M70 22v18H52" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
    codex: `<path d="M20 18h24c10 0 16 6 16 16v48H32c-8 0-12-4-12-12V18z" fill="currentColor" opacity=".4"/><path d="M76 18H52c-10 0-16 6-16 16v48h28c8 0 12-4 12-12V18z" fill="currentColor"/>`,
    settings: `<circle cx="48" cy="48" r="12" fill="currentColor"/><path d="M48 16l6 12 12-2-2 12 12 6-12 6 2 12-12-2-6 12-6-12-12 2 2-12-12-6 12-6-2-12 12 2z" fill="currentColor" opacity=".45"/>`,
    home: `<path d="M16 46 L48 18 L80 46 V80 H58 V58 H38 V80 H16 Z" fill="currentColor"/>`,
    shop: `<path d="M18 38h60l-6 42H24z" fill="currentColor" opacity=".85"/><path d="M14 38h68l-8-16H22z" fill="currentColor"/><rect x="40" y="52" width="16" height="28" fill="#0c0a08"/>`,
    stall: `<path d="M12 40h72v8H12z" fill="currentColor"/><path d="M18 48h12v36H18zM66 48h12v36H66z" fill="currentColor" opacity=".7"/><path d="M12 28h72l-8 12H20z" fill="currentColor"/>`,
  };
  return `<svg class="${cls}" viewBox="0 0 96 96" aria-hidden="true">${marks[kind] || marks.world}</svg>`;
}

function rplPortraitPlateSvg(seed) {
  const uid = rplSvgUid("pp");
  const s = String(seed || "traveler");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  const tilt = (Math.abs(h) % 7) - 3;
  return `<svg class="rpl-silhouette rpl-portrait-plate" viewBox="0 0 80 100" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c9a227"/>
        <stop offset="1" stop-color="#e84a2f"/>
      </linearGradient>
      <pattern id="${uid}h" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 4L4 0" stroke="#2a2018" stroke-width="0.65"/>
      </pattern>
    </defs>
    <rect width="80" height="100" fill="#120e0c"/>
    <rect width="80" height="100" fill="url(#${uid}h)" opacity="0.55"/>
    <rect x="3.2" y="3.2" width="73.6" height="93.6" fill="none" stroke="url(#${uid}g)" stroke-width="1.7"/>
    <rect x="6.6" y="6.6" width="66.8" height="86.8" fill="none" stroke="#c9a227" stroke-opacity="0.32" stroke-width="0.7"/>
    <ellipse cx="40" cy="34" rx="14" ry="16" fill="#2a221c" transform="rotate(${tilt} 40 34)"/>
    <path d="M16 92c3-28 12-42 24-48 12 6 21 20 24 48H16z" fill="#241c18"/>
    <circle cx="40" cy="18" r="2.2" fill="#e84a2f"/>
    <rect x="28" y="86" width="24" height="4" rx="1" fill="#c9a227" opacity="0.72"/>
  </svg>`;
}

function rplSilhouetteSvg(seed) {
  return rplPortraitPlateSvg(seed);
}

function rplItemPlateSvg(name, rarity) {
  const uid = rplSvgUid("ip");
  const mono = escapeHtml(rplItemMonogram(name));
  const r = String(rarity || "common").toLowerCase();
  const seal = r === "legendary" ? "#e8c84a" : r === "rare" ? "#6a8fd4" : r === "uncommon" ? "#5aa86a" : "#8a7e6c";
  return `<svg class="rpl-item-plate" viewBox="0 0 96 96" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c9a227"/>
        <stop offset="1" stop-color="#e84a2f"/>
      </linearGradient>
      <pattern id="${uid}h" width="5" height="5" patternUnits="userSpaceOnUse">
        <path d="M0 5L5 0" stroke="#2a2018" stroke-width="0.7"/>
      </pattern>
    </defs>
    <rect width="96" height="96" fill="#120e0c"/>
    <rect width="96" height="96" fill="url(#${uid}h)" opacity="0.5"/>
    <rect x="4" y="4" width="88" height="88" fill="none" stroke="url(#${uid}g)" stroke-width="2"/>
    <rect x="9" y="9" width="78" height="78" fill="none" stroke="#c9a227" stroke-opacity="0.28" stroke-width="0.8"/>
    <text x="48" y="58" text-anchor="middle" font-size="22" font-family="Georgia, 'Iowan Old Style', serif" fill="#e8dfd0" font-weight="700">${mono}</text>
    <circle cx="78" cy="18" r="7" fill="${seal}"/>
    <circle cx="78" cy="18" r="3.2" fill="#0c0a08" opacity="0.35"/>
  </svg>`;
}

function rplScenePlateSvg(label) {
  const uid = rplSvgUid("sc");
  const loc = escapeHtml(String(label || "").slice(0, 28));
  return `<svg class="rpl-scene-plate" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1c1614"/>
        <stop offset="0.55" stop-color="#2a1c16"/>
        <stop offset="1" stop-color="#0c0a08"/>
      </linearGradient>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c9a227"/>
        <stop offset="1" stop-color="#e84a2f"/>
      </linearGradient>
    </defs>
    <rect width="160" height="100" fill="url(#${uid}sky)"/>
    <circle cx="126" cy="22" r="9" fill="#c9a227" opacity="0.28"/>
    <path d="M0 68 Q28 52 52 62 T108 58 T160 70 V100 H0 Z" fill="#18120e"/>
    <path d="M0 78 Q40 66 80 76 T160 80 V100 H0 Z" fill="#100c0a"/>
    <path d="M0 62 H160" stroke="#c9a227" stroke-opacity="0.18" stroke-width="0.6"/>
    <rect x="3" y="3" width="154" height="94" fill="none" stroke="url(#${uid}g)" stroke-width="1.6"/>
    ${loc ? `<text x="80" y="92" text-anchor="middle" font-size="7" font-family="Georgia, serif" fill="#c9a227" letter-spacing="1.4">${loc}</text>` : ""}
  </svg>`;
}

function rplPendingChoices() {
  const fromState = RPL_STATE && Array.isArray(RPL_STATE.pending_choices) ? RPL_STATE.pending_choices : [];
  const cleaned = fromState.map(c => String(c || "").trim()).filter(Boolean).slice(0, 4);
  if (cleaned.length) return cleaned;
  const gm = rplLatestGm(RPL_MESSAGES);
  return rplParseChoicesFromGm(gm && gm.content);
}

function rplParseChoicesFromGm(text) {
  if (!text) return [];
  const lines = String(text).trim().split(/\n/);
  const choices = [];
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 10; i -= 1) {
    const stripped = lines[i].trim();
    if (!stripped) {
      if (choices.length) break;
      continue;
    }
    const match = stripped.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/);
    if (match && match[1]) {
      choices.unshift(match[1].trim());
      continue;
    }
    if (choices.length) break;
  }
  return choices.length >= 2 ? choices.slice(0, 4) : [];
}

function rplBeatSummary() {
  return (RPL_STATE && RPL_STATE.beat_summary) ? String(RPL_STATE.beat_summary).trim() : "";
}

function rplStakesLine(summary) {
  const state = summary || RPL_STATE;
  if (state && state.stakes_line) return String(state.stakes_line).trim();
  const player = (state && state.player) || {};
  const wounds = player.wounds;
  const parts = [];
  if (Array.isArray(wounds) && wounds.length) {
    parts.push(`Wounds: ${wounds.slice(0, 2).join(", ")}`);
  } else if (typeof wounds === "string" && wounds.trim()) {
    parts.push(`Condition: ${wounds.trim()}`);
  }
  const threads = (state && state.urgent_threads) || [];
  if (threads[0]) {
    const t = threads[0].title || threads[0].summary || "";
    if (t) parts.push(`Pressure: ${t}`);
  }
  return parts.join(" · ") || "";
}

function rplResourceRows(summary) {
  const player = (summary && summary.player) || {};
  const res = player.resources;
  if (!res || typeof res !== "object" || Array.isArray(res)) return [];
  const rows = [];
  Object.keys(res).forEach(key => {
    const val = res[key];
    const label = key.replace(/_/g, " ");
    if (Array.isArray(val)) {
      if (!val.length) return;
      rows.push({ label, value: val.map(v => String(v).replace(/_/g, " ")).join(", ") });
    } else if (val && typeof val === "object") {
      rows.push({ label, value: Object.keys(val).join(", ") });
    } else if (val != null && String(val).trim()) {
      rows.push({ label, value: String(val).replace(/_/g, " ") });
    }
  });
  return rows.slice(0, 8);
}

function rplIsFirstRun() {
  return !(RPL_MESSAGES || []).some(m => m.role === "gm");
}

function rplUnwrapMessages(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.messages)) return data.messages;
  return [];
}

function rplUnwrapJournal(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.journal)) return data.journal;
  return [];
}

function rplCollectInventory(state) {
  if (!state || typeof state !== "object") return [];
  try {
    const player = state.player || {};
    const merged = [];
    const seen = new Set();
    [].concat(state.inventory || [], player.inventory || []).forEach(item => {
      if (!item || typeof item !== "object") return;
      const key = String(item.id || item.name || "").toLowerCase() || `item-${merged.length}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });
    if (merged.length) return merged;
    return rplNormalizeInventory(player);
  } catch (_) {
    return [];
  }
}

function rplNormalizeInventory(playerOrState) {
  if (!playerOrState || typeof playerOrState !== "object") return [];
  try {
    if (playerOrState.player) {
      return rplCollectInventory(playerOrState);
    }
    const res = playerOrState.resources;
    if (!res || typeof res !== "object" || Array.isArray(res)) return [];
    const items = [];
    Object.keys(res).forEach(key => {
      const val = res[key];
      if (Array.isArray(val)) {
        val.forEach(v => {
          if (v == null) return;
          items.push({ name: String(v).replace(/_/g, " "), qty: 1, rarity: "common", effect: key, origin: "resources" });
        });
      } else if (val && typeof val === "object") {
        Object.keys(val).forEach(k => items.push({ name: k, qty: 1, rarity: "common", effect: key, origin: "resources" }));
      } else if (val != null && val !== "") {
        items.push({ name: String(val).replace(/_/g, " "), qty: 1, rarity: "common", effect: key, origin: "resources" });
      }
    });
    return items;
  } catch (_) {
    return [];
  }
}

function rplNormalizeQuests(state) {
  const q = (state && state.quests) || {};
  const mapThread = t => ({
    title: t.title || t.name || "Untitled",
    stakes: t.stakes || t.summary || "",
    next: t.next || t.next_move || "",
    risk: t.risk || t.urgency || "",
  });
  const threads = ((state && state.urgent_threads) || []).map(mapThread);
  return {
    active: (q.active || threads).map(mapThread),
    rumors: (q.rumors || []).map(mapThread),
    consequences: (q.consequences || []).map(mapThread),
    completed: (q.completed || []).map(mapThread),
  };
}

function rplPlayerCharacter(summary) {
  const chars = (summary && summary.characters) || (RPL_STATE && RPL_STATE.characters) || [];
  const pid = rplPlayerId();
  return chars.find(c => String(c.id) === String(pid)) || null;
}

function rplPortraitRecord(characterId) {
  return RPL_PORTRAITS.find(p => String(p.character_id) === String(characterId)) || null;
}

function rplCanonicalPlayerEntity(summary) {
  const state = summary || RPL_STATE;
  const player = (state && state.player) || {};
  const chars = (state && state.characters) || [];
  const pid = rplPlayerId();
  let entity = chars.find(c => String(c.id) === String(pid)) || null;
  if (!entity) entity = chars.find(c => c.role === "player_character") || null;
  const portrait = rplPortraitRecord(entity ? entity.id : pid);
  if (!entity && portrait) {
    entity = {
      id: pid,
      name: player.name || "Traveler",
      role: "player_character",
      archetype: player.stage || "",
    };
  }
  if (!entity && (player.name || player.stage || portrait)) {
    entity = {
      id: pid,
      name: player.name || "Traveler",
      role: "player_character",
      archetype: player.stage || "",
    };
  }
  return { entity, player, portrait, pid };
}

function rplSceneMood(summary) {
  const player = (summary && summary.player) || {};
  const rep = player.reputation;
  if (player.mood) return String(player.mood);
  if (rep && typeof rep === "object" && Object.keys(rep).length) {
    const top = Object.entries(rep).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    if (top) return `${top[0]}: ${top[1]}`;
  }
  return "";
}

function rplRarityClass(rarity) {
  const r = String(rarity || "common").toLowerCase();
  if (r === "legendary") return "rpl-rarity-legendary";
  if (r === "rare") return "rpl-rarity-rare";
  if (r === "uncommon") return "rpl-rarity-uncommon";
  return "rpl-rarity-common";
}

function rplNotYetNote(label) {
  return `<div class="rpl-not-yet">${escapeHtml(label)} not yet</div>`;
}

async function rplFetchCoins() {
  const coinsRes = await parallelFetch("/api/coins");
  if (coinsRes.status === 404) {
    RPL_API.coins = false;
  } else if (coinsRes.ok && coinsRes.data) {
    RPL_API.coins = true;
    const d = coinsRes.data;
    const bal = d.balance != null ? d.balance : d.points;
    RPL_WALLET = { balance: bal, recent: d.ledger || d.recent || [] };
    RPL_COIN_BALANCE = Number(bal) || 0;
    return;
  } else if (coinsRes.status && coinsRes.status !== 404) {
    RPL_API.coins = false;
  }
  await rplFetchWallet();
  if (!RPL_API.wallet || !RPL_WALLET) {
    const sumRes = await parallelFetch("/api/practice/summary");
    if (sumRes.ok && sumRes.data) {
      RPL_COIN_BALANCE = Number(sumRes.data.points) || 0;
    }
  }
}

async function rplFetchWallet() {
  const res = await parallelFetch("/api/wallet");
  if (res.status === 404) { RPL_API.wallet = false; return; }
  if (res.ok && res.data) {
    RPL_WALLET = res.data;
    RPL_COIN_BALANCE = Number(res.data.balance) || 0;
  }
}

async function rplFetchMap() {
  const res = await parallelFetch("/api/parallel/map");
  if (res.status === 404) { RPL_API.map = false; return; }
  if (res.ok && res.data) RPL_MAP = res.data;
}

async function rplFetchPortraits() {
  const res = await parallelFetch("/api/parallel/portraits");
  if (res.status === 404) { RPL_API.portraits = false; return; }
  if (res.ok && Array.isArray(res.data)) RPL_PORTRAITS = res.data;
}

async function rplFetchRules() {
  const res = await parallelFetch("/api/parallel/rules");
  if (res.status === 404) { RPL_API.rules = false; RPL_RULES = null; return; }
  if (res.ok && res.data) {
    RPL_API.rules = true;
    RPL_RULES = res.data;
    return;
  }
  if (res.status && res.status !== 404) RPL_API.rules = false;
}

function rplUnwrapItems(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

async function rplFetchItems() {
  const res = await parallelFetch("/api/parallel/items");
  if (res.status === 404) { RPL_API.items = false; RPL_ITEMS = []; return; }
  if (res.ok) RPL_ITEMS = rplUnwrapItems(res.data);
}

function rplItemRecord(itemId) {
  if (itemId == null || itemId === "") return null;
  return RPL_ITEMS.find(i => String(i.item_id) === String(itemId)) || null;
}

function rplItemUrl(itemId) {
  const local = rplResolveLocalImage("item", itemId);
  if (local) return local;
  const hit = rplItemRecord(itemId);
  return (hit && hit.url) || "";
}

function rplItemMonogram(name) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function rplUnwrapScenes(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.scenes)) return data.scenes;
  return [];
}

async function rplFetchScenes() {
  const res = await parallelFetch("/api/parallel/scenes");
  if (res.status === 404) { RPL_API.scenes = false; RPL_SCENES = []; return; }
  if (res.ok) RPL_SCENES = rplUnwrapScenes(res.data);
}

function rplCollectLostItems(state) {
  if (!state || typeof state !== "object") return [];
  const lost = [];
  const seen = new Set();
  const add = (item) => {
    if (!item) return;
    const name = typeof item === "string" ? item : (item.name || item.id || "");
    if (!name) return;
    const key = String(name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lost.push(typeof item === "object" ? item : { name: item });
  };
  (state.lost_items || []).forEach(add);
  const log = state.inventory_log || [];
  if (Array.isArray(log)) {
    log.forEach(entry => {
      if (!entry) return;
      const action = String(entry.action || entry.event || entry.type || "").toLowerCase();
      if (!action) return;
      if (action.includes("gain") || action.includes("found") || action.includes("pick") || action.includes("receive")) return;
      if (action.includes("lost") || action.includes("drop") || action.includes("consum") || action.includes("spent") || action.includes("remove")) {
        add(entry.item || entry);
      }
    });
  }
  return lost;
}

function rplPlayerKnowledgeBullets(state) {
  const player = (state && state.player) || {};
  const k = player.knowledge;
  if (!k) return [];
  if (Array.isArray(k)) return k.map(s => String(s).trim()).filter(Boolean);
  if (typeof k === "string") return rplRulesBullets(k);
  if (typeof k === "object") {
    return Object.entries(k).map(([key, val]) => {
      const v = val != null ? String(val).trim() : "";
      return v ? `${key.replace(/_/g, " ")}: ${v}` : key.replace(/_/g, " ");
    }).filter(Boolean);
  }
  return [];
}

function rplCharacterAppearance(characterId, state) {
  const apps = (state && state.appearances) || {};
  if (apps[characterId]) return String(apps[characterId]);
  const hit = ((state && state.characters) || []).find(c => String(c.id) === String(characterId));
  return (hit && hit.appearance) ? String(hit.appearance) : "";
}

function rplSceneRecordUrl(scene) {
  if (!scene) return "";
  if (typeof scene === "string") return scene;
  return scene.url || (scene.message_id ? rplSceneUrl(scene.message_id) : (scene.id ? rplSceneUrl(scene.id) : ""));
}

function rplSceneRecordId(scene) {
  if (!scene) return "";
  if (typeof scene === "string") {
    const m = String(scene).match(/\/scenes\/([^/.]+)/);
    return m ? m[1] : "";
  }
  return String(scene.message_id || scene.id || "");
}

function rplRulesBullets(rulesText) {
  const raw = String(rulesText || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines.map(l => l.replace(/^[-*•\d.)]+\s*/, "").trim()).filter(Boolean);
  }
  return raw.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 3);
}

function rplCodexWorldDate() {
  if (RPL_RULES && RPL_RULES.world_date) return RPL_RULES.world_date;
  return (RPL_STATE && RPL_STATE.world_date) || "—";
}

function rplCodexActiveThreadsCount() {
  if (RPL_RULES && RPL_RULES.active_threads_count != null) {
    return Number(RPL_RULES.active_threads_count) || 0;
  }
  const threads = (RPL_STATE && RPL_STATE.urgent_threads) || [];
  return threads.length;
}

function rplLocationRecord(state) {
  const player = (state && state.player) || {};
  const locKey = String(player.location || "").trim();
  const pools = [
    (state && state.locations) || [],
    (RPL_MAP && RPL_MAP.locations) || [],
  ];
  for (const pool of pools) {
    const hit = pool.find(l => String(l.id) === locKey || String(l.name) === locKey);
    if (hit) return hit;
  }
  if (locKey) return { id: locKey, name: locKey.replace(/_/g, " "), description: player.location_description || player.location_desc || "" };
  return { id: "", name: "Unknown shores", description: "" };
}

function rplCodexWeatherLine(state) {
  const player = (state && state.player) || {};
  const env = (state && state.environment) || {};
  if (env.weather) return String(env.weather);
  if (state.weather) return String(state.weather);
  if (player.weather) return String(player.weather);
  const mood = rplSceneMood(state);
  return mood ? `Mood: ${mood}` : "";
}

function rplStanceClass(stance) {
  const s = String(stance || "neutral").toLowerCase();
  if (s.includes("hostile") || s.includes("enemy")) return "rpl-stance-hostile";
  if (s.includes("player") || s.includes("ally") || s.includes("friendly")) return "rpl-stance-ally";
  if (s.includes("passive") || s.includes("protect")) return "rpl-stance-passive";
  return "rpl-stance-neutral";
}

function rplCodexFactions(state) {
  const list = (state && state.factions) || [];
  if (list.length) return list;
  const rep = (state && state.player && state.player.reputation) || {};
  return Object.keys(rep).map(id => ({
    id,
    name: id.replace(/_/g, " "),
    stance: rep[id],
  }));
}

function rplCodexSceneMessage() {
  return rplLatestGm(RPL_MESSAGES);
}

function rplCodexMapThumbHtml() {
  if (!RPL_MAP || RPL_MAP.ready === false) {
    return `<div class="rpl-codex-map-thumb rpl-codex-map-empty">${rplMapCompassSvg()}<span>Map not charted</span></div>`;
  }
  const img = RPL_MAP.image ? escapeHtml(RPL_MAP.image) : "";
  if (img) {
    return `<div class="rpl-codex-map-thumb"><img src="${img}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="rpl-codex-map-thumb rpl-codex-map-empty">${rplMapCompassSvg()}<span>Regions forming…</span></div>`;
}

function rplCodexEnvVisualHtml(loc, gmMsg) {
  const name = escapeHtml(loc.name || loc.id || "Unknown");
  const desc = escapeHtml(loc.description || "");
  const sceneUrl = gmMsg && gmMsg.has_scene && gmMsg.id ? escapeHtml(rplSceneUrl(gmMsg.id)) : "";
  const visual = sceneUrl
    ? `<div class="rpl-codex-env-scene"><img src="${sceneUrl}" alt="" loading="lazy" /></div>`
    : `<div class="rpl-codex-env-scene rpl-codex-env-placeholder">
        <div class="rpl-codex-env-fog" aria-hidden="true"></div>
        ${rplScenePlateSvg(loc.name || loc.id || "")}
        <div class="rpl-codex-env-loc-overlay">${name}</div>
      </div>`;
  const weather = rplCodexWeatherLine(RPL_STATE);
  return `${visual}
    <div class="rpl-codex-env-head">
      <h3 class="rpl-codex-env-title">${name}</h3>
      ${desc ? `<p class="rpl-codex-env-desc">${desc}</p>` : ""}
      ${weather ? `<p class="rpl-codex-env-weather">${escapeHtml(weather)}</p>` : ""}
    </div>`;
}

function rplRenderCodexRulesTab() {
  const knowledge = rplPlayerKnowledgeBullets(RPL_STATE);
  const rulesText = (RPL_RULES && RPL_RULES.rules_text) || "";
  const rulesBullets = rplRulesBullets(rulesText);
  const hasKnowledge = knowledge.length > 0;
  const hasRules = rulesBullets.length > 0;
  if (!hasKnowledge && !hasRules && !RPL_API.rules) {
    return `<div class="rpl-codex-page rpl-codex-page-rules"><p class="rpl-codex-empty">You haven't learned anything definite about this world yet.</p></div>`;
  }
  if (!hasKnowledge && !hasRules) {
    return `<div class="rpl-codex-page rpl-codex-page-rules"><p class="rpl-codex-empty">Nothing recorded in your own words yet.</p></div>`;
  }
  let html = `<div class="rpl-codex-page rpl-codex-page-rules"><p class="rpl-codex-knowledge-note">What your character knows — not the GM's secret ledger.</p>`;
  if (hasKnowledge) {
    html += `<div class="rpl-codex-knowledge-head">Observations</div><ul class="rpl-codex-rules-list">${knowledge.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
  }
  if (hasRules) {
    html += `<div class="rpl-codex-knowledge-head">Rules you've pieced together</div><ul class="rpl-codex-rules-list">${rulesBullets.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
  }
  html += `</div>`;
  return html;
}

function rplRenderSceneFilmstripHtml() {
  const scenes = Array.isArray(RPL_SCENES) ? RPL_SCENES : [];
  if (!scenes.length) {
    return `<div class="rpl-scene-filmstrip-empty">No illustrated scenes yet.</div>`;
  }
  const thumbs = scenes.map(s => {
    const url = rplSceneRecordUrl(s);
    const mid = rplSceneRecordId(s);
    if (!url) return "";
    return `<button type="button" class="rpl-scene-film-thumb" data-scene-id="${escapeHtml(mid)}" data-scene-url="${escapeHtml(url)}" title="Set backdrop">
      <img src="${escapeHtml(rplBustUrl(url))}" alt="" loading="lazy" />
      <span class="rpl-film-replace" data-scene-id="${escapeHtml(mid)}" title="Replace scene image">${rplMarkSvg("replace")}</span>
    </button>`;
  }).filter(Boolean).join("");
  if (!thumbs) return `<div class="rpl-scene-filmstrip-empty">No illustrated scenes yet.</div>`;
  return `<div class="rpl-scene-filmstrip" id="rpl-scene-filmstrip">${thumbs}</div>`;
}

function rplWireSceneFilmstrip(root) {
  const scope = root || document;
  scope.querySelectorAll(".rpl-scene-film-thumb").forEach(btn => {
    btn.onclick = (e) => {
      if (e.target.closest(".rpl-film-replace")) return;
      const mid = btn.getAttribute("data-scene-id");
      if (!mid) return;
      rplSetBackdrop(mid, true, true);
      document.querySelectorAll(".rpl-scene-film-thumb").forEach(b => b.classList.remove("rpl-active"));
      btn.classList.add("rpl-active");
    };
  });
  scope.querySelectorAll(".rpl-film-replace").forEach(rep => {
    rep.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const mid = rep.getAttribute("data-scene-id");
      if (mid) rplPickAndUploadImage("scene", mid);
    };
    rep.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mid = rep.getAttribute("data-scene-id");
      if (mid) rplPickAndUploadImage("scene", mid);
    };
  });
}

function rplUpdateSceneFilmstrips() {
  const codexFilm = document.getElementById("rpl-codex-scene-film");
  if (codexFilm) {
    codexFilm.innerHTML = rplRenderSceneFilmstripHtml();
    rplWireSceneFilmstrip(codexFilm);
  }
  const viewportFilm = document.getElementById("rpl-viewport-scene-film");
  if (viewportFilm) {
    viewportFilm.innerHTML = rplRenderSceneFilmstripHtml();
    rplWireSceneFilmstrip(viewportFilm);
  }
}

function rplRenderCodexEnvTab() {
  const loc = rplLocationRecord(RPL_STATE);
  const gmMsg = rplCodexSceneMessage();
  return `<div class="rpl-codex-page rpl-codex-page-env">
    ${rplCodexEnvVisualHtml(loc, gmMsg)}
    <div class="rpl-codex-map-block">
      <div class="rpl-codex-map-label">Charted world</div>
      ${rplCodexMapThumbHtml()}
      <button type="button" class="rpl-menu-btn rpl-codex-map-open" id="rpl-codex-map-open">Open map</button>
    </div>
    <div class="rpl-codex-scene-block">
      <div class="rpl-codex-map-label">Scene gallery</div>
      <div id="rpl-codex-scene-film">${rplRenderSceneFilmstripHtml()}</div>
    </div>
  </div>`;
}

function rplRenderCodexWorldTab() {
  const date = escapeHtml(String(rplCodexWorldDate()));
  const count = rplCodexActiveThreadsCount();
  const factions = rplCodexFactions(RPL_STATE);
  const factionHtml = factions.length
    ? factions.map(f => {
        const stance = f.stance || f.agenda || "";
        return `<div class="rpl-codex-faction">
          <span class="rpl-codex-faction-name">${escapeHtml(f.name || f.id || "Unknown")}</span>
          ${stance ? `<span class="rpl-codex-stance ${rplStanceClass(stance)}">${escapeHtml(String(stance).replace(/_/g, " "))}</span>` : ""}
        </div>`;
      }).join("")
    : `<p class="rpl-codex-empty">No factions on record yet.</p>`;
  return `<div class="rpl-codex-page rpl-codex-page-world">
    <div class="rpl-codex-stat"><span class="rpl-codex-stat-label">World date</span><span class="rpl-codex-stat-val">${date}</span></div>
    <div class="rpl-codex-stat"><span class="rpl-codex-stat-label">Active threads</span><span class="rpl-codex-stat-val">${escapeHtml(String(count))}</span></div>
    <div class="rpl-codex-factions-head">Factions</div>
    <div class="rpl-codex-factions">${factionHtml}</div>
  </div>`;
}

function rplRenderCodexBody() {
  const tabs = [
    { id: "rules", label: "What you know" },
    { id: "env", label: "Environment" },
    { id: "world", label: "World" },
  ];
  const tabHtml = tabs.map(t => `<button type="button" class="rpl-codex-tab${RPL_CODEX_TAB === t.id ? " rpl-active" : ""}" data-codex-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`).join("");
  let page = "";
  if (RPL_CODEX_TAB === "env") page = rplRenderCodexEnvTab();
  else if (RPL_CODEX_TAB === "world") page = rplRenderCodexWorldTab();
  else page = rplRenderCodexRulesTab();
  return `<div class="rpl-codex-tabs">${tabHtml}</div><div class="rpl-codex-pages" id="rpl-codex-pages">${page}</div>`;
}

function rplCodexPanelHtml() {
  return `<aside class="rpl-codex-drawer" id="rpl-codex-panel" aria-hidden="true">
    <div class="rpl-codex-parchment">
      <header class="rpl-codex-head">
        <span class="rpl-codex-title">World Codex</span>
        <button type="button" class="rpl-overlay-close" id="rpl-codex-close" aria-label="Close codex">${rplMarkSvg("close")}</button>
      </header>
      <div class="rpl-codex-body" id="rpl-codex-body">${rplRenderCodexBody()}</div>
    </div>
  </aside>`;
}

function rplUpdateCodexPanel() {
  const body = document.getElementById("rpl-codex-body");
  if (!body) return;
  body.innerHTML = rplRenderCodexBody();
  rplWireCodexControls();
  rplSyncAllMarginalia();
}

function rplOpenCodex(tab) {
  if (tab) RPL_CODEX_TAB = tab;
  RPL_CODEX_OPEN = true;
  rplToggleWorldPanel(false);
  const panel = document.getElementById("rpl-codex-panel");
  if (panel) {
    panel.classList.add("rpl-open");
    panel.setAttribute("aria-hidden", "false");
  }
  rplSyncScrim();
  rplFetchRules().then(() => {
    rplUpdateCodexPanel();
    if (RPL_CODEX_TAB === "env") {
      rplFetchMap().then(rplUpdateCodexPanel);
      rplFetchScenes().then(() => {
        rplUpdateCodexPanel();
        rplWireSceneFilmstrip(document.getElementById("rpl-codex-scene-film"));
      });
    }
  });
  rplUpdateCodexPanel();
}

function rplCloseCodex() {
  RPL_CODEX_OPEN = false;
  const panel = document.getElementById("rpl-codex-panel");
  if (panel) {
    panel.classList.remove("rpl-open");
    panel.setAttribute("aria-hidden", "true");
  }
  rplSyncScrim();
}

function rplWireCodexControls() {
  document.querySelectorAll("[data-codex-tab]").forEach(btn => {
    btn.onclick = () => {
      const tab = btn.getAttribute("data-codex-tab") || "rules";
      if (tab === RPL_CODEX_TAB) return;
      RPL_CODEX_TAB = tab;
      rplUpdateCodexPanel();
      if (tab === "env") {
        rplFetchMap().then(rplUpdateCodexPanel);
        rplFetchScenes().then(() => {
          rplUpdateCodexPanel();
          rplWireSceneFilmstrip(document.getElementById("rpl-codex-scene-film"));
        });
      }
    };
  });
  const mapOpen = document.getElementById("rpl-codex-map-open");
  if (mapOpen) mapOpen.onclick = () => { rplCloseCodex(); rplOpenMap(); };
}

function rplCoinBalance() {
  if (RPL_WALLET && RPL_WALLET.balance != null) return Number(RPL_WALLET.balance) || 0;
  return RPL_COIN_BALANCE;
}

function rplUpdateCoinsDisplay(animate) {
  const el = document.getElementById("rpl-coins-val");
  if (!el) return;
  const bal = rplCoinBalance();
  if (!animate) { el.textContent = String(bal); RPL_COIN_BALANCE = bal; return; }
  const from = RPL_COIN_BALANCE;
  const to = bal;
  if (from === to) { el.textContent = String(to); return; }
  const start = performance.now();
  const dur = 200;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = String(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(tick);
    else RPL_COIN_BALANCE = to;
  };
  requestAnimationFrame(tick);
}

function rplAnimateCoins(amount, kind, label, originEl) {
  const hud = document.getElementById("rpl-coins");
  const counter = document.getElementById("rpl-coins-val");
  if (!hud || !counter || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    rplUpdateCoinsDisplay(true);
    return;
  }
  const hudRect = hud.getBoundingClientRect();
  const origin = originEl ? originEl.getBoundingClientRect() : {
    left: window.innerWidth * 0.5,
    top: window.innerHeight * 0.6,
    width: 0,
    height: 0,
  };
  const n = Math.min(16, Math.max(8, Math.ceil(Math.abs(Number(amount) || 0) / 8) || 10));
  for (let i = 0; i < n; i++) {
    const fly = document.createElement("span");
    fly.className = "rpl-coin-fly";
    fly.textContent = "";
    const ox = origin.left + origin.width * 0.5 + (Math.random() - 0.5) * 40;
    const oy = origin.top + origin.height * 0.5 + (Math.random() - 0.5) * 20;
    fly.style.left = `${ox}px`;
    fly.style.top = `${oy}px`;
    document.body.appendChild(fly);
    const delay = i * 35;
    setTimeout(() => {
      fly.style.transition = `all ${RPL_COIN_MS}ms cubic-bezier(0.22,1,0.36,1)`;
      fly.style.left = `${hudRect.left + hudRect.width * 0.55}px`;
      fly.style.top = `${hudRect.top + 2}px`;
      fly.style.opacity = "0";
      fly.style.transform = "scale(0.4)";
    }, delay);
    setTimeout(() => fly.remove(), RPL_COIN_MS + delay + 50);
  }
  if (kind === "spend") {
    for (let i = 0; i < 6; i++) {
      const drop = document.createElement("span");
      drop.className = "rpl-coin-fly rpl-coin-drop";
      drop.textContent = "";
      drop.style.left = `${hudRect.left + hudRect.width * 0.4 + i * 6}px`;
      drop.style.top = `${hudRect.top + 4}px`;
      document.body.appendChild(drop);
      requestAnimationFrame(() => {
        drop.style.transition = `all 500ms ease-in`;
        drop.style.top = `${hudRect.top + 40 + i * 8}px`;
        drop.style.opacity = "0";
      });
      setTimeout(() => drop.remove(), 600);
    }
  }
  counter.classList.add(kind === "spend" ? "rpl-coin-spend" : "rpl-coin-earn");
  setTimeout(() => counter.classList.remove("rpl-coin-spend", "rpl-coin-earn"), RPL_COIN_MS);
  if (label) {
    const tag = document.createElement("span");
    tag.className = "rpl-coin-label";
    tag.textContent = label;
    hud.appendChild(tag);
    setTimeout(() => tag.remove(), RPL_COIN_MS + 200);
  }
  setTimeout(() => rplUpdateCoinsDisplay(true), RPL_COIN_MS - 200);
}

function rplLoadHistory() {
  try {
    const raw = localStorage.getItem(RPL_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-RPL_HISTORY_MAX) : [];
  } catch (_) {
    return [];
  }
}

function rplSaveHistory(entry) {
  const text = String(entry || "").trim();
  if (!text) return;
  let hist = rplLoadHistory().filter(h => h !== text);
  hist.push(text);
  if (hist.length > RPL_HISTORY_MAX) hist = hist.slice(-RPL_HISTORY_MAX);
  localStorage.setItem(RPL_HISTORY_KEY, JSON.stringify(hist));
}

function rplProseHtml(text) {
  const escaped = escapeHtml(text || "");
  const paras = escaped.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (!paras.length) return "";
  return paras.map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

function rplLatestGm(messages) {
  if (!messages || !messages.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "gm") return messages[i];
  }
  return null;
}

function rplLatestSceneMessage(messages) {
  if (!messages || !messages.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "gm" && m.has_scene && m.id) return m;
  }
  return null;
}

function rplStoryEntries(messages) {
  const entries = [];
  const list = Array.isArray(messages) ? messages : [];
  list.forEach((m, i) => {
    if (!m || m.role !== "gm") return;
    const prev = i > 0 && list[i - 1]?.role === "user" ? list[i - 1] : null;
    entries.push({
      date: m.world_date || "",
      gm: m.content || "",
      choice: prev ? (prev.content || "") : "",
      id: m.id,
    });
  });
  return entries;
}

function rplRenderStorySoFar(messages) {
  const entries = rplStoryEntries(messages);
  if (!entries.length && !RPL_PENDING_CHOICE) {
    return `<div class="rpl-story-empty">
      <p class="rpl-story-empty-lead">No story yet.</p>
      <p class="rpl-story-empty-steps">1. Type what you do in the box below<br>2. Press <strong>Say</strong> or Enter<br>3. Read the reply here — consequences stick.</p>
    </div>`;
  }
  let html = entries.map((e, idx) => {
    const isLast = idx === entries.length - 1 && !RPL_PENDING_CHOICE;
    const choice = e.choice
      ? `<div class="rpl-story-choice">&gt; ${escapeHtml(e.choice)}</div>`
      : "";
    const date = e.date ? `<span class="rpl-story-date">${escapeHtml(e.date)}</span>` : "";
    return `<article class="rpl-story-entry${isLast ? " rpl-story-entry-latest" : ""}" data-story-idx="${idx}">
      ${date}
      ${choice}
      <div class="rpl-story-gm">${rplProseHtml(e.gm)}</div>
    </article>`;
  }).join("");
  if (RPL_PENDING_CHOICE) {
    html += `<article class="rpl-story-entry rpl-story-entry-pending rpl-story-entry-latest">
      <div class="rpl-story-choice">&gt; ${escapeHtml(RPL_PENDING_CHOICE)}</div>
      <div class="rpl-story-gm rpl-story-pending"><em>Waiting for GM… usually 10–30 seconds.</em></div>
    </article>`;
  }
  return html;
}

function rplSceneUrl(messageId) {
  const local = rplResolveLocalImage("scene", messageId);
  if (local) return local;
  const id = encodeURIComponent(String(messageId));
  const scene = (Array.isArray(RPL_SCENES) ? RPL_SCENES : []).find(
    s => String(s.message_id) === String(messageId)
  );
  const v = encodeURIComponent(scene?.created_at || "1");
  return `/scenes/${id}.png?v=${v}`;
}

const RPL_SCENE_IMG_RETRY = new Set();
function rplOnSceneImageError(messageId) {
  const key = String(messageId || "");
  if (!key || RPL_SCENE_IMG_RETRY.has(key)) return;
  RPL_SCENE_IMG_RETRY.add(key);
  const msg = (Array.isArray(RPL_MESSAGES) ? RPL_MESSAGES : []).find(m => String(m.id) === key);
  if (msg) msg.has_scene = false;
  if (typeof rplIllustrate === "function") rplIllustrate(key, null, true);
}

function rplCancelTypewriter() {
  if (RPL_TYPEWRITER) {
    clearInterval(RPL_TYPEWRITER);
    RPL_TYPEWRITER = null;
  }
}

function rplTypewriterReveal(el, fullText, onDone) {
  rplCancelTypewriter();
  if (!el) return;
  const text = String(fullText || "");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!text || reduced) {
    el.innerHTML = rplProseHtml(text);
    el.classList.remove("rpl-typing");
    if (onDone) onDone();
    return;
  }
  let idx = 0;
  el.innerHTML = "";
  el.classList.add("rpl-typing");

  const finish = () => {
    rplCancelTypewriter();
    el.innerHTML = rplProseHtml(text);
    el.classList.remove("rpl-typing");
    el.removeEventListener("click", skip);
    if (onDone) onDone();
  };

  const skip = (e) => {
    e.stopPropagation();
    finish();
  };
  el.addEventListener("click", skip);

  RPL_TYPEWRITER = setInterval(() => {
    idx += 1;
    el.innerHTML = rplProseHtml(text.slice(0, idx));
    if (idx >= text.length) finish();
  }, RPL_TYPE_MS);
}

function rplStylesHtml() {
  return "";
}

function rplMapCompassSvg() {
  const uid = rplSvgUid("cmp");
  return `<svg class="rpl-map-compass" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#c9a227"/>
        <stop offset="1" stop-color="#e84a2f"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="47" fill="#120e0c" stroke="url(#${uid}g)" stroke-width="1.6"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="#c9a227" stroke-opacity="0.28" stroke-width="0.8"/>
    <path d="M50 8 L54 46 L50 42 L46 46 Z" fill="#c9a227"/>
    <path d="M50 92 L46 54 L50 58 L54 54 Z" fill="#6a5e4e"/>
    <path d="M8 50 L46 46 L42 50 L46 54 Z" fill="#8a7e6c"/>
    <path d="M92 50 L54 54 L58 50 L54 46 Z" fill="#8a7e6c"/>
    <circle cx="50" cy="50" r="5" fill="#e84a2f"/>
    <text x="50" y="16" text-anchor="middle" font-size="8" fill="#c9a227" font-family="Georgia,serif">N</text>
  </svg>`;
}

function rplMapEmptyHtml(showGenerate) {
  const player = (RPL_STATE && RPL_STATE.player) || {};
  const loc = player.location || "Unknown shores";
  const genBtn = showGenerate
    ? `<button type="button" class="rpl-menu-btn rpl-map-chart-btn" id="rpl-map-generate">Chart this world</button>
       <div class="rpl-scene-status" id="rpl-map-gen-status"></div>`
    : `<div class="rpl-scene-status rpl-scene-error">Map API not available</div>`;
  return `<div class="rpl-map-undiscovered" id="rpl-map-empty">
    <div class="rpl-map-fog-layer" aria-hidden="true"></div>
    <div class="rpl-map-silhouette" aria-hidden="true"></div>
    ${rplMapCompassSvg()}
    <div class="rpl-map-marker rpl-current" style="left:50%;top:50%;position:relative">
      <div class="rpl-map-marker-dot"></div>
    </div>
    <p class="rpl-map-empty-title">Undiscovered world</p>
    <p class="rpl-map-empty-loc">${escapeHtml(loc)}</p>
    ${genBtn}
  </div>`;
}

function rplSetPanelInert(panel, inert) {
  if (!panel) return;
  if (inert) {
    panel.setAttribute("aria-hidden", "true");
    panel.style.pointerEvents = "none";
    panel.querySelectorAll("button, input, textarea, a, select, [tabindex]").forEach(el => {
      if (!el.hasAttribute("data-rpl-tabindex")) {
        el.setAttribute("data-rpl-tabindex", el.getAttribute("tabindex") ?? "");
      }
      el.setAttribute("tabindex", "-1");
    });
  } else {
    panel.removeAttribute("aria-hidden");
    panel.style.pointerEvents = "";
    panel.querySelectorAll("[data-rpl-tabindex]").forEach(el => {
      const prev = el.getAttribute("data-rpl-tabindex");
      if (prev === "") el.removeAttribute("tabindex");
      else el.setAttribute("tabindex", prev);
      el.removeAttribute("data-rpl-tabindex");
    });
  }
}

function rplApplyPanelInertness() {
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  rplSetPanelInert(document.getElementById("rpl-rail-left"), mobile);
  rplSetPanelInert(document.getElementById("rpl-rail-right"), mobile);
  rplSetPanelInert(document.getElementById("rpl-slide-left"), !mobile);
  rplSetPanelInert(document.getElementById("rpl-slide-right"), !mobile);
}

function rplMarginaliaCoinSpend() {
  const recent = (RPL_WALLET && (RPL_WALLET.recent || RPL_WALLET.ledger)) || [];
  if (!Array.isArray(recent)) return false;
  return recent.some(r => {
    const delta = r.delta != null ? r.delta : r.amount;
    return Number(delta) < 0;
  });
}

function rplMarginaliaGateLocked() {
  if (!RPL_RECEIPTS_SUPPORTED) return true;
  return RPL_DEEDS.some(d => !rplDeedUnlocked(d));
}

function rplMarginaliaLabels() {
  const labels = [];
  const quests = rplNormalizeQuests(RPL_STATE);
  if ((quests.consequences || []).length > 0) labels.push("owed favor");
  const locs = (RPL_MAP && RPL_MAP.locations) || (RPL_STATE && RPL_STATE.locations) || [];
  if (locs.some(l => l && !l.known && !l.discovered)) labels.push("unseen road");
  if (rplMarginaliaCoinSpend()) labels.push("paid in coins");
  if (rplMarginaliaGateLocked()) labels.push("truth locked by receipt");
  return labels.slice(0, 2);
}

function rplClearMarginalia(container) {
  if (!container) return;
  container.querySelectorAll(".rpl-marginalia").forEach(n => n.remove());
}

function rplMarginaliaContentHeight(body) {
  const page = body.querySelector(".rpl-codex-pages");
  if (page) return page.scrollHeight;
  const kids = Array.from(body.children).filter(ch => !ch.classList.contains("rpl-marginalia"));
  if (!kids.length) return 0;
  let bottom = 0;
  kids.forEach(ch => { bottom = Math.max(bottom, ch.offsetTop + ch.offsetHeight); });
  return bottom - kids[0].offsetTop;
}

function rplApplyMarginaliaToPanel(panelEl) {
  if (!panelEl) return;
  const body = panelEl.querySelector(".rpl-codex-body") || panelEl.querySelector(".rpl-panel-body");
  if (!body) return;
  rplClearMarginalia(body);
  const panelH = body.clientHeight;
  const contentH = rplMarginaliaContentHeight(body);
  if (panelH <= contentH + 40) return;
  const labels = rplMarginaliaLabels();
  if (!labels.length) return;
  const corners = ["rpl-marginalia-tl", "rpl-marginalia-br"];
  labels.forEach((label, i) => {
    const note = document.createElement("span");
    note.className = `rpl-marginalia rpl-marginalia-in ${corners[i] || "rpl-marginalia-br"}`;
    note.textContent = label;
    body.appendChild(note);
  });
}

function rplSyncAllMarginalia() {
  requestAnimationFrame(() => {
    rplApplyMarginaliaToPanel(document.getElementById("rpl-inv-panel"));
    rplApplyMarginaliaToPanel(document.getElementById("rpl-quest-panel"));
    const codex = document.getElementById("rpl-codex-panel");
    if (codex && codex.classList.contains("rpl-open")) rplApplyMarginaliaToPanel(codex);
  });
}

function rplParticlesHtml() {
  const items = [];
  for (let i = 0; i < 14; i++) {
    const left = (i * 17 + 7) % 100;
    const dur = 14 + (i % 5) * 4;
    const delay = -(i * 2.3);
    items.push(`<span class="rpl-particle" style="left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s"></span>`);
  }
  return items.join("");
}

function rplRenderMcStageHtml(summary) {
  const { entity: ch, player, portrait, pid } = rplCanonicalPlayerEntity(summary);
  const portraitUrl = (portrait && portrait.url) || rplPortraitUrl(pid);
  const name = (ch && ch.name) || player.name || "Traveler";
  const archetype = (ch && (ch.archetype || ch.role)) || player.stage || "";
  const portraitInner = portraitUrl
    ? `<img src="${escapeHtml(portraitUrl)}" alt="" />`
    : rplSilhouetteSvg(name);
  return `<div class="rpl-mc-stage" id="rpl-mc-stage" role="img" aria-label="${escapeHtml(name)}" title="Open character gallery">
    <button type="button" class="rpl-mc-portrait-upload" id="rpl-mc-portrait-upload" title="Upload or replace portrait">${rplMarkSvg("upload")}</button>
    <div class="rpl-mc-stage-frame">
      <div class="rpl-mc-stage-portrait rpl-paste-target" id="rpl-mc-stage-portrait">${portraitInner}<span class="rpl-paste-hint">Paste or drop image</span></div>
      <div class="rpl-mc-stage-plaque">
        <span class="rpl-mc-stage-name">${escapeHtml(name)}</span>
        ${archetype ? `<span class="rpl-mc-stage-role">${escapeHtml(archetype)}</span>` : ""}
      </div>
    </div>
  </div>`;
}

function rplUpdateMcStage() {
  const host = document.getElementById("rpl-mc-stage");
  if (!host) return;
  host.outerHTML = rplRenderMcStageHtml(RPL_STATE);
  rplWireMcStage();
}

function rplWireMcStage() {
  const stage = document.getElementById("rpl-mc-stage");
  if (!stage) return;
  const pid = rplPlayerId();
  stage.onclick = (e) => {
    if (e.target.closest(".rpl-mc-portrait-upload, .rpl-paste-target, .rpl-img-tools, button")) return;
    rplOpenGallery();
  };
  const portrait = document.getElementById("rpl-mc-stage-portrait");
  rplBindImagePasteTarget(portrait, "portrait", () => pid);
  const uploadBtn = document.getElementById("rpl-mc-portrait-upload");
  if (uploadBtn) {
    uploadBtn.onclick = (e) => {
      e.stopPropagation();
      rplPickAndUploadImage("portrait", pid);
    };
  }
  if (portrait) {
    portrait.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      rplPickAndUploadImage("portrait", pid);
    };
  }
}

function rplRenderInvSlotContent(it) {
  const itemId = it.id || it.item_id;
  const url = rplItemUrl(itemId);
  if (url) {
    return `<img class="rpl-inv-slot-img" src="${escapeHtml(url)}" alt="" loading="lazy" /><span class="rpl-inv-name rpl-inv-name-overlay">${escapeHtml(it.name || "?")}</span>`;
  }
  return `${rplItemPlateSvg(it.name, it.rarity)}<div class="rpl-inv-name">${escapeHtml(it.name || "?")}</div>`;
}

function rplRenderLostItemsSection(state) {
  const lost = rplCollectLostItems(state);
  if (!lost.length) return "";
  const rows = lost.map(it => {
    const name = escapeHtml(it.name || it.id || "?");
    const reason = it.reason || it.action || "";
    return `<li>${name}${reason ? `<span class="rpl-inv-lost-reason">${escapeHtml(String(reason))}</span>` : ""}</li>`;
  }).join("");
  return `<div class="rpl-inv-lost"><div class="rpl-inv-lost-head">Lost / dropped</div><ul class="rpl-inv-lost-list">${rows}</ul></div>`;
}

async function rplGenerateItemImage(itemId, regenerate, btn) {
  if (!itemId || !RPL_IMAGE_GEN.available) return;
  const statusEl = document.getElementById("rpl-inv-item-status");
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = regenerate ? "Repainting item…" : "Painting item…";
  const res = await parallelFetch("/api/parallel/item-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId, regenerate: !!regenerate }),
  });
  if (btn) btn.disabled = false;
  if (res.ok && res.data && (res.data.url || res.data.path)) {
    await rplFetchItems();
    rplUpdatePanels();
    if (statusEl) statusEl.textContent = res.data.cached ? "Item art ready (cached)." : "Item art ready.";
  } else {
    const reason = (res.data && res.data.reason) || "Item image unavailable.";
    if (statusEl) statusEl.textContent = reason;
    if (typeof showToast === "function") showToast(reason, "warn");
  }
}

function rplRenderCharacterPanel(summary) {
  const { entity: ch, player, portrait, pid } = rplCanonicalPlayerEntity(summary);
  const portraitUrl = (portrait && portrait.url) || rplPortraitUrl(pid);
  const hasIdentity = !!(ch && ch.name) || !!portraitUrl || !!(player.name) || !!player.stage;
  if (!hasIdentity) {
    return `<div class="rpl-portrait-wrap">${rplSilhouetteSvg("traveler")}</div><div class="rpl-inv-empty">Your parallel self isn't defined yet. The first GM reply usually fills this in.</div>`;
  }
  const name = (ch && ch.name) || player.name || "Traveler";
  const archetype = (ch && (ch.archetype || ch.role)) || player.stage || "";
  const traits = ch && ch.traits;
  const traitsText = Array.isArray(traits) ? traits.join(", ") : (traits || "");
  const portraitHtml = portraitUrl
    ? `<img src="${escapeHtml(portraitUrl)}" alt="" />`
    : rplSilhouetteSvg(name);
  const wounds = (ch && ch.wounds) || player.wounds;
  const woundsText = Array.isArray(wounds) ? wounds.join(", ") : (wounds || "");
  const rels = ch && ch.relationships;
  let relText = "";
  if (rels && typeof rels === "object") {
    relText = Object.entries(rels).map(([k, v]) => `${k}: ${v}`).join("; ");
  } else if (typeof rels === "string") {
    relText = rels;
  }
  const objective = (ch && ch.objective) || player.objective || player.goal || "";
  return `
    <div class="rpl-portrait-wrap">${portraitHtml}</div>
    <div class="rpl-char-name">${escapeHtml(name)}</div>
    ${archetype ? `<div class="rpl-char-stage">${escapeHtml(archetype)}</div>` : ""}
    ${traitsText ? `<div class="rpl-char-wounds"><div class="rpl-char-label">Traits</div><div class="rpl-char-value">${escapeHtml(traitsText)}</div></div>` : ""}
    ${woundsText ? `<div class="rpl-char-wounds"><div class="rpl-char-label">Wounds</div><div class="rpl-char-value">${escapeHtml(woundsText)}</div></div>` : ""}
    ${relText ? `<div class="rpl-char-wounds"><div class="rpl-char-label">Relationships</div><div class="rpl-char-value">${escapeHtml(relText)}</div></div>` : ""}
    ${objective ? `<div class="rpl-char-wounds"><div class="rpl-char-label">Objective</div><div class="rpl-char-value">${escapeHtml(objective)}</div></div>` : ""}`;
}

function rplRenderInventoryInspect(items, idx) {
  if (idx == null || idx < 0 || !items[idx]) {
    return `<div class="rpl-inv-inspect rpl-inv-inspect-empty rpl-plate" id="rpl-inv-inspect">${rplItemPlateSvg("", "common")}<span class="rpl-inv-inspect-meta">Tap an item to inspect it.</span></div>`;
  }
  const it = items[idx];
  const itemId = it.id || it.item_id;
  const url = rplItemUrl(itemId);
  const artInner = url
    ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" />`
    : rplItemPlateSvg(it.name, it.rarity);
  const rarity = escapeHtml(String(it.rarity || "common"));
  const effect = it.effect ? `<span><strong>Effect:</strong> ${escapeHtml(it.effect)}</span>` : "";
  const origin = it.origin ? `<span><strong>Origin:</strong> ${escapeHtml(it.origin)}</span>` : "";
  const genLabel = url ? "Regenerate art" : "Generate art";
  const imgTools = itemId ? rplRenderImgToolsHtml("item", itemId, !!url) : "";
  const genBtn = itemId
    ? `<button type="button" class="rpl-inv-item-gen" id="rpl-inv-item-gen" data-item-id="${escapeHtml(String(itemId))}" data-has-art="${url ? "1" : "0"}"${RPL_IMAGE_GEN.available ? "" : " disabled"}>${genLabel}</button><div class="rpl-inv-item-status" id="rpl-inv-item-status"></div>`
    : "";
  return `<div class="rpl-inv-inspect rpl-plate" id="rpl-inv-inspect">
    <div class="rpl-inv-inspect-art rpl-paste-target" id="rpl-inv-inspect-art">${artInner}<span class="rpl-paste-hint">Paste or drop image</span></div>
    <div class="rpl-inv-inspect-name">${escapeHtml(it.name || "?")}${it.qty > 1 ? ` ×${escapeHtml(String(it.qty))}` : ""}</div>
    <div class="rpl-inv-inspect-meta">
      <span><strong>Rarity:</strong> ${rarity}</span>
      ${effect}${origin}
    </div>
    ${imgTools || genBtn ? `<div class="rpl-inv-item-art-actions">${imgTools}${genBtn}</div>` : ""}
  </div>`;
}

function rplRenderResourcesBlock(summary) {
  const rows = rplResourceRows(summary);
  if (!rows.length) {
    return `<div class="rpl-resources"><div class="rpl-resources-title">Resources</div><div class="rpl-inv-empty" style="padding:6px 0">No resources tracked yet. They appear when the GM establishes them.</div></div>`;
  }
  const body = rows.map(r => `<div class="rpl-resource-row"><span class="rpl-resource-label">${escapeHtml(r.label)}</span><span class="rpl-resource-val">${escapeHtml(r.value)}</span></div>`).join("");
  return `<div class="rpl-resources"><div class="rpl-resources-title">Resources</div>${body}</div>`;
}

function rplRenderInventoryPanel(summary) {
  let items = [];
  try {
    items = rplCollectInventory(summary || RPL_STATE);
  } catch (_) {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  const count = items.length;
  const slots = items.map((it, idx) => {
    const tip = [it.effect, it.origin].filter(Boolean).join(" · ");
    const selected = RPL_INV_INSPECT_IDX === idx ? " rpl-inv-selected" : "";
    return `<button type="button" class="rpl-inv-slot rpl-cabinet-drawer ${rplRarityClass(it.rarity)}${selected}" title="${escapeHtml(tip)}" data-inv-idx="${idx}" aria-label="Inspect ${escapeHtml(it.name || "item")}">
      ${it.qty > 1 ? `<span class="rpl-inv-qty">${escapeHtml(String(it.qty))}</span>` : ""}
      ${rplRenderInvSlotContent(it)}
    </button>`;
  });
  const countLine = count
    ? `<div class="rpl-inv-count">${count} item${count === 1 ? "" : "s"}</div>`
    : "";
  const grid = count
    ? `<div class="rpl-inv-scroll rpl-cabinet-drawers"><div class="rpl-inv-grid rpl-cabinet-grid">${slots.join("")}</div></div>`
    : `<div class="rpl-inv-grid rpl-cabinet-grid" style="opacity:.35">${Array.from({ length: 6 }, () => `<div class="rpl-inv-slot rpl-cabinet-drawer rpl-inv-slot-empty" aria-hidden="true"></div>`).join("")}</div>`;
  const empty = count ? "" : `<div class="rpl-inv-empty">Pack empty. Take actions that earn or find gear — the GM adds items when they're real in the scene.</div>`;
  const inspectIdx = RPL_INV_INSPECT_IDX != null && RPL_INV_INSPECT_IDX < count ? RPL_INV_INSPECT_IDX : null;
  return `<div class="rpl-inv-cabinet" id="rpl-inv-cabinet">
    <div class="rpl-cabinet-head"><span class="rpl-cabinet-plaque">Field cabinet</span></div>
    ${rplRenderResourcesBlock(summary)}${countLine}${grid}${empty}${rplRenderLostItemsSection(summary || RPL_STATE)}${rplRenderInventoryInspect(items, inspectIdx)}
  </div>`;
}

function rplRenderQuestsPanel(summary) {
  const quests = rplNormalizeQuests(summary);
  const tabs = ["active", "rumors", "consequences", "completed"];
  const tabHtml = tabs.map(t => `<button type="button" class="rpl-quest-tab${RPL_QUEST_TAB === t ? " rpl-active" : ""}" data-quest-tab="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("");
  const list = quests[RPL_QUEST_TAB] || [];
  const listHtml = list.length
    ? list.map(q => `<div class="rpl-quest-item">
        <div class="rpl-quest-title">${escapeHtml(q.title)}</div>
        ${q.stakes ? `<div class="rpl-quest-stakes">${escapeHtml(q.stakes)}</div>` : ""}
        ${q.next ? `<div class="rpl-quest-next">Next: ${escapeHtml(q.next)}</div>` : ""}
        ${q.risk ? `<div class="rpl-quest-next">Risk: ${escapeHtml(String(q.risk))}</div>` : ""}
      </div>`).join("")
    : `<div class="rpl-inv-empty" style="padding:8px">${RPL_QUEST_TAB === "active" ? "No active quests. Ask around or pursue a thread in your next action." : "Nothing in this tab yet."}</div>`;
  return `<div class="rpl-quest-tabs">${tabHtml}</div>${listHtml}`;
}

function rplChronicleSpreadEntry(entry, pageNum) {
  const major = entry.kind === "bend" || entry.kind === "consequence";
  const ribbon = major ? `<div class="rpl-chronicle-ribbon" title="Major event"></div>` : "";
  const narration = escapeHtml(entry.text || entry.narration || "");
  const choice = entry.choice ? `<div class="rpl-chronicle-choice">${escapeHtml(entry.choice)}</div>` : "";
  const outcome = entry.outcome ? `<div class="rpl-chronicle-text">${escapeHtml(entry.outcome)}</div>` : "";
  const loot = entry.loot ? `<div class="rpl-chronicle-loot">${escapeHtml(entry.loot)}</div>` : "";
  return `<div class="rpl-chronicle-spread">
    <div class="rpl-chronicle-page rpl-chronicle-left">${ribbon}
      <div class="rpl-chronicle-date">${escapeHtml(entry.date || "")}</div>
      <div class="rpl-chronicle-text">${narration}</div>
      <div class="rpl-chronicle-pagenum">${pageNum}</div>
    </div>
    <div class="rpl-chronicle-spine"></div>
    <div class="rpl-chronicle-page rpl-chronicle-right">
      ${choice}${outcome}${loot}
      <div class="rpl-chronicle-pagenum">${pageNum + 1}</div>
    </div>
  </div>`;
}

function rplChronicleEntries() {
  const entries = [];
  const msgs = RPL_MESSAGES || [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "gm") {
      const prev = i > 0 && msgs[i - 1].role === "user" ? msgs[i - 1] : null;
      entries.push({
        type: "scene",
        date: m.world_date || "",
        text: m.content || "",
        choice: prev ? prev.content : "",
        outcome: "",
        kind: (m.content || "").includes("[Reality bends]") ? "bend" : "scene",
        thumbId: m.has_scene ? m.id : null,
      });
    }
  }
  (RPL_JOURNAL || []).forEach(j => {
    entries.push({ type: "journal", date: j.world_date, text: j.entry, kind: j.kind || "event" });
  });
  entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return entries;
}

function rplChronicleLiveText() {
  const entries = rplStoryEntries(RPL_MESSAGES);
  const tail = entries.slice(-3);
  let text = tail.map(e => {
    const choice = e.choice ? `You: ${e.choice}\n` : "";
    const gm = (e.gm || "").replace(/\[Reality bends\]\s*/i, "");
    return `${choice}${gm}`.trim();
  }).filter(Boolean).join("\n\n");
  if (RPL_PENDING_CHOICE) {
    const pending = `You: ${RPL_PENDING_CHOICE}\n(The world is resolving…)`;
    text = text ? `${text}\n\n${pending}` : pending;
  }
  return text;
}

function rplRenderChroniclePanel() {
  const entries = rplChronicleEntries();
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / 1));
  if (RPL_CHRONICLE_FOLLOW && total > 0) RPL_CHRONICLE_PAGE_IDX = total - 1;
  if (RPL_CHRONICLE_PAGE_IDX >= pages) RPL_CHRONICLE_PAGE_IDX = pages - 1;
  const entry = entries[RPL_CHRONICLE_PAGE_IDX];
  const pageBase = RPL_CHRONICLE_PAGE_IDX * 2 + 1;
  const spreadHtml = entry
    ? rplChronicleSpreadEntry(entry, pageBase)
    : `<div class="rpl-inv-empty" style="padding:12px">The chronicle begins after the first turn.</div>`;
  const pager = total > 1
    ? `<div class="rpl-chronicle-pager">
        <button type="button" id="rpl-chron-prev" ${RPL_CHRONICLE_PAGE_IDX <= 0 ? "disabled" : ""}>← prev</button>
        <span style="font-size:9px;color:#6a5e4e">Scene ${RPL_CHRONICLE_PAGE_IDX + 1} / ${total}</span>
        <button type="button" id="rpl-chron-next" ${RPL_CHRONICLE_PAGE_IDX >= total - 1 ? "disabled" : ""}>next →</button>
        <button type="button" class="rpl-chronicle-expand" id="rpl-chron-latest" style="margin-left:6px">latest</button>
      </div>`
    : "";
  const histToggle = `<button type="button" class="rpl-chronicle-expand" id="rpl-hist-toggle" style="margin-top:6px">raw scene log</button>`;
  const histHtml = `<div id="rpl-history-log" hidden>${rplRenderHistoryLog(RPL_MESSAGES)}</div>`;
  return `${spreadHtml}${pager}${histToggle}${histHtml}`;
}

function rplRenderHistoryEntry(m) {
  if (m.role === "user") {
    return `<div class="rpl-hist-user">&gt; ${escapeHtml(m.content || "")}</div>`;
  }
  const thumb = m.has_scene
    ? `<div class="rpl-hist-thumb"><img src="${escapeHtml(rplSceneUrl(m.id))}" alt="" loading="lazy" /></div>`
    : `<div class="rpl-hist-thumb"></div>`;
  const illustrate = m.id
    ? `<div class="rpl-scene-btn-row">
        <button type="button" class="rpl-illustrate-btn" data-msg-id="${escapeHtml(String(m.id))}" data-regen="0">Illustrate</button>
        ${m.has_scene ? `<button type="button" class="rpl-illustrate-btn" data-msg-id="${escapeHtml(String(m.id))}" data-regen="1">Regenerate</button>` : ""}
      </div>`
    : "";
  return `<div class="rpl-hist-gm" data-msg-id="${escapeHtml(String(m.id || ""))}">
    ${thumb}<div><div class="rpl-hist-text">${rplProseHtml(m.content)}</div>${illustrate}</div>
  </div>`;
}

function rplRenderHistoryLog(messages) {
  if (!messages || !messages.length) {
    return `<div class="rpl-hist-user" style="opacity:.6">No scenes yet.</div>`;
  }
  return messages.map(rplRenderHistoryEntry).join("");
}

function rplFormingHtml(reason) {
  const detail = reason
    ? escapeHtml(reason)
    : "The parallel world has not finished taking shape. Return when the threads have been woven.";
  return `<div class="rpl-forming-screen"><div><strong>The world is still forming</strong><p>${detail}</p></div></div>`;
}

function rplSettingsStorageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function rplSettingsStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) { /* graceful */ }
}

function rplLocalPrefs() {
  return {
    textDensity: rplSettingsStorageGet(RPL_LS_DENSITY, "comfortable"),
    reducedSpectacle: rplSettingsStorageGet(RPL_LS_SPECTACLE, "false") === "true",
  };
}

function rplApplyLocalPrefs() {
  const game = document.querySelector(".rpl-game");
  if (!game) return;
  const prefs = rplLocalPrefs();
  game.classList.toggle("rpl-density-compact", prefs.textDensity === "compact");
  game.classList.toggle("rpl-reduced-spectacle", prefs.reducedSpectacle);
  const particles = game.querySelector(".rpl-particles");
  if (particles) particles.hidden = prefs.reducedSpectacle;
}

function rplPlayerDisplayName() {
  const { entity, player } = rplCanonicalPlayerEntity(RPL_STATE);
  return (entity && entity.name) || player.name || "";
}

async function rplFetchParallelSettings() {
  const res = await parallelFetch("/api/about");
  if (res.ok && res.data) {
    RPL_PARALLEL_SETTINGS = res.data;
    return res.data;
  }
  return RPL_PARALLEL_SETTINGS || {};
}

async function rplSaveParallelSetting(key, value, toastMsg) {
  const res = await parallelFetch("/api/about", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value }),
  });
  if (res.ok) {
    if (!RPL_PARALLEL_SETTINGS) RPL_PARALLEL_SETTINGS = {};
    RPL_PARALLEL_SETTINGS[key] = value;
    if (typeof showToast === "function") showToast(toastMsg || "Settings saved");
    return true;
  }
  if (typeof showToast === "function") showToast("Could not save settings", "warn");
  return false;
}

function rplRenderSettingsBody() {
  const prefs = rplLocalPrefs();
  const api = RPL_PARALLEL_SETTINGS || {};
  const autoIll = api.parallel_auto_illustrate !== "false";
  const imageProvider = ["local", "openai", "auto"].includes(api.parallel_image_provider)
    ? api.parallel_image_provider : "local";
  const displayName = rplPlayerDisplayName();
  const nameBlock = displayName
    ? `<div class="rpl-settings-field">
        <div class="rpl-settings-label">Known as</div>
        <p class="rpl-settings-help">How NPCs and the chronicle refer to your character.</p>
        <div class="rpl-settings-readonly">${escapeHtml(displayName)}</div>
        <p class="rpl-settings-note">Established in-world — earn a new name through play.</p>
      </div>`
    : `<div class="rpl-settings-field">
        <div class="rpl-settings-label">Known as</div>
        <p class="rpl-settings-help">Your in-world name appears here once the GM establishes it in play.</p>
      </div>`;
  return `${nameBlock}
    <div class="rpl-settings-field">
      <div class="rpl-settings-label" id="rpl-set-image-provider-label">Image provider</div>
      <p class="rpl-settings-help">Local is the default and always produces an on-device image. OpenAI requires an API key. Auto starts local and may use OpenAI if local generation fails.</p>
      <select id="rpl-set-image-provider" class="rpl-settings-select" aria-labelledby="rpl-set-image-provider-label">
        <option value="local"${imageProvider === "local" ? " selected" : ""}>Local</option>
        <option value="openai"${imageProvider === "openai" ? " selected" : ""}>OpenAI</option>
        <option value="auto"${imageProvider === "auto" ? " selected" : ""}>Auto</option>
      </select>
    </div>
    <div class="rpl-settings-field">
      <label class="rpl-settings-row" for="rpl-set-auto-illustrate">
        <input type="checkbox" id="rpl-set-auto-illustrate"${autoIll ? " checked" : ""} />
        <span class="rpl-settings-label">Auto-illustrate scenes</span>
      </label>
      <p class="rpl-settings-help">Generate a scene image automatically after each GM reply.</p>
    </div>
    <div class="rpl-settings-field">
      <div class="rpl-settings-label" id="rpl-set-density-label">Text density</div>
      <p class="rpl-settings-help">How much dialogue text fits on screen at once.</p>
      <select id="rpl-set-density" class="rpl-settings-select" aria-labelledby="rpl-set-density-label">
        <option value="comfortable"${prefs.textDensity !== "compact" ? " selected" : ""}>Comfortable</option>
        <option value="compact"${prefs.textDensity === "compact" ? " selected" : ""}>Compact</option>
      </select>
    </div>
    <div class="rpl-settings-field rpl-settings-field-last">
      <label class="rpl-settings-row" for="rpl-set-spectacle">
        <input type="checkbox" id="rpl-set-spectacle"${prefs.reducedSpectacle ? " checked" : ""} />
        <span class="rpl-settings-label">Reduced spectacle</span>
      </label>
      <p class="rpl-settings-help">Turn off particles and scene motion for a calmer, text-first view.</p>
    </div>`;
}

function rplWireSettingsControls() {
  const autoIll = document.getElementById("rpl-set-auto-illustrate");
  const imageProvider = document.getElementById("rpl-set-image-provider");
  const density = document.getElementById("rpl-set-density");
  const spectacle = document.getElementById("rpl-set-spectacle");
  if (autoIll) {
    autoIll.onchange = () => {
      rplSaveParallelSetting(
        "parallel_auto_illustrate",
        autoIll.checked ? "true" : "false",
        autoIll.checked ? "Auto-illustrate on" : "Auto-illustrate off"
      );
    };
  }
  if (imageProvider) {
    imageProvider.onchange = async () => {
      const saved = await rplSaveParallelSetting(
        "parallel_image_provider",
        imageProvider.value,
        `Image provider: ${imageProvider.options[imageProvider.selectedIndex].text}`
      );
      if (saved) {
        const status = await parallelFetch("/api/parallel/status");
        if (status.ok && status.data) rplApplyImageGenStatus(status.data);
      }
    };
  }
  if (density) {
    density.onchange = () => {
      rplSettingsStorageSet(RPL_LS_DENSITY, density.value);
      rplApplyLocalPrefs();
      if (typeof showToast === "function") showToast("Text density updated");
    };
  }
  if (spectacle) {
    spectacle.onchange = () => {
      rplSettingsStorageSet(RPL_LS_SPECTACLE, spectacle.checked ? "true" : "false");
      rplApplyLocalPrefs();
      if (typeof showToast === "function") showToast(spectacle.checked ? "Reduced spectacle on" : "Reduced spectacle off");
    };
  }
}

async function rplOpenSettings() {
  rplToggleWorldPanel(false);
  rplCloseCodex();
  await rplFetchParallelSettings();
  const body = document.getElementById("rpl-settings-body");
  if (body) {
    body.innerHTML = rplRenderSettingsBody();
    rplWireSettingsControls();
  }
  rplToggleOverlay("rpl-settings-overlay", true);
}

function rplCloseSettings() {
  rplToggleOverlay("rpl-settings-overlay", false);
}

function rplMainTabsHtml() {
  const tabs = [
    ["home", "Home"],
    ["play", "Play"],
    ["inventory", "Inventory"],
    ["shop", "Shop"],
    ["map", "Map"],
  ];
  const buttons = tabs.map(([id, label]) => {
    const on = RPL_MAIN_TAB === id ? " active rpl-main-tab-active" : "";
    return `<button type="button" class="rpl-main-tab${on}" data-rpl-main-tab="${id}">${escapeHtml(label)}</button>`;
  }).join("");
  const modOn = RPL_MAIN_TAB === "modify" ? " active rpl-main-tab-active" : "";
  return `<nav class="rpl-main-tabs wp-parallel-marquee" role="tablist" aria-label="Parallel views">
    ${buttons}
    <button type="button" class="rpl-main-tab rpl-main-tab-modify${modOn}" data-rpl-main-tab="modify">Modify</button>
  </nav>`;
}

function rplModifyTabHtml() {
  return `<section class="rpl-modify-tab" id="rpl-modify-tab">
    <header class="rpl-modify-head">
      <h2>Modify</h2>
      <p class="rpl-bend-lede">Rewrite established facts. Paid, irreversible when confirmed — canon may refuse contradictions.</p>
    </header>
    <div id="rpl-bend-outcome" class="rpl-bend-outcome" hidden></div>
    <textarea id="rpl-bend-input" placeholder="e.g. The bridge was never destroyed, and the merchant remembers our deal…" aria-label="Describe the world change you want"></textarea>
    <div id="rpl-bend-result"></div>
    <div class="rpl-bend-actions">
      <button type="button" class="rpl-menu-btn" id="rpl-bend-preview">Preview change</button>
      <button type="button" class="rpl-menu-btn rpl-bend-confirm-primary" id="rpl-bend-confirm" disabled>Confirm change</button>
    </div>
  </section>`;
}

function rplPartyMembers(summary) {
  const state = summary || RPL_STATE || {};
  if (Array.isArray(state.party) && state.party.length) return state.party.slice(0, 6);
  const chars = state.characters || [];
  const player = state.player || {};
  const loc = String(player.location || "").trim();
  const pid = rplPlayerId();
  const party = [];
  const seen = new Set();
  const add = (ch) => {
    if (!ch) return;
    const key = String(ch.id || ch.name || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    party.push(ch);
  };
  const { entity } = rplCanonicalPlayerEntity(state);
  if (entity) add(entity);
  chars.forEach(ch => {
    if (String(ch.id) === String(pid)) return;
    const chLoc = String(ch.location || "").trim();
    if (loc && chLoc && chLoc === loc) add(ch);
  });
  return party.slice(0, 6);
}

function rplRenderPartyPlate(summary, hostId) {
  const members = rplPartyMembers(summary);
  const plates = members.map((ch, idx) => {
    const cid = ch.id || ch.name || `p${idx}`;
    const url = rplPortraitUrl(cid);
    const name = ch.name || "Traveler";
    const role = ch.role || ch.archetype || "";
    const inner = url
      ? `<img src="${escapeHtml(url)}" alt="" />`
      : rplSilhouetteSvg(name);
    return `<button type="button" class="rpl-party-member" data-party-id="${escapeHtml(String(cid))}" title="${escapeHtml(name)}">
      <span class="rpl-party-bust">${inner}</span>
      <span class="rpl-party-name">${escapeHtml(name)}</span>
      ${role ? `<span class="rpl-party-role">${escapeHtml(role)}</span>` : ""}
    </button>`;
  }).join("");
  const body = plates || `<div class="rpl-party-empty">Party unformed — the first scene names who stands with you.</div>`;
  const idAttr = hostId === false ? "" : ` id="${escapeHtml(hostId || "rpl-party-plate")}"`;
  return `<div class="rpl-party-plate"${idAttr} aria-label="Party">
    <div class="rpl-party-kicker">Party</div>
    <div class="rpl-party-row">${body}</div>
  </div>`;
}

function rplWirePartyPlate() {
  const host = document.getElementById("rpl-party-plate");
  if (!host) return;
  host.querySelectorAll("[data-party-id]").forEach(btn => {
    btn.onclick = () => rplOpenGallery();
  });
}

function rplUpdatePartyPlate() {
  const host = document.getElementById("rpl-party-plate");
  if (!host) return;
  host.outerHTML = rplRenderPartyPlate(RPL_STATE);
  rplWirePartyPlate();
}

function rplShopStalls(summary) {
  const state = summary || RPL_STATE || {};
  if (Array.isArray(state.shop_stalls) && state.shop_stalls.length) return state.shop_stalls;
  const locs = ((RPL_MAP && RPL_MAP.locations) || (state.map && state.map.locations) || []).filter(Boolean);
  const items = rplCollectInventory(state);
  if (!locs.length) {
    const locName = (state.player && state.player.location) || "";
    return [{
      id: "here",
      name: locName,
      description: "",
      current: true,
      wares: items,
    }];
  }
  return locs.map(loc => ({
    id: loc.id,
    name: loc.name || loc.id,
    description: loc.description || "",
    current: loc.id === (RPL_MAP && RPL_MAP.current_location_id),
    wares: items.filter(it => {
      const origin = String(it.origin || "").toLowerCase();
      return origin && (origin === String(loc.id || "").toLowerCase() || origin === String(loc.name || "").toLowerCase());
    }),
  }));
}

function rplHomeScreenInner(summary, worldDate, latestGm) {
  const player = (summary && summary.player) || {};
  const loc = player.location || "";
  const date = worldDate || (summary && summary.world_date) || "";
  const stakes = rplStakesLine(summary);
  const quests = rplNormalizeQuests(summary).active || [];
  const gm = latestGm || rplLatestGm(RPL_MESSAGES);
  const excerpt = gm && gm.content ? String(gm.content).trim().slice(0, 420) : "";
  const sceneMsg = rplLatestSceneMessage(RPL_MESSAGES) || (gm && gm.has_scene ? gm : null);
  const sceneUrl = sceneMsg && sceneMsg.id ? rplSceneUrl(sceneMsg.id) : "";
  const vignette = sceneUrl
    ? `<img class="rpl-home-vignette-img" src="${escapeHtml(sceneUrl)}" alt="" />`
    : rplScenePlateSvg(loc);
  const questTickets = quests.slice(0, 4).map(q => `<div class="rpl-choice-ticket rpl-home-quest">
    <span class="rpl-ticket-seal"></span>
    <span class="rpl-ticket-copy"><strong>${escapeHtml(q.title || "")}</strong>${q.stakes ? `<em>${escapeHtml(q.stakes)}</em>` : ""}</span>
  </div>`).join("");
  return `
    <div class="rpl-home-folio">
      <aside class="rpl-home-leaf rpl-home-leaf-left">
        ${rplRenderPartyPlate(summary, false)}
        <div class="rpl-home-place">
          <span class="rpl-home-kicker">Present scene</span>
          <div class="rpl-home-vignette rpl-parchment-stage">${vignette}</div>
          ${loc ? `<div class="rpl-home-loc">${escapeHtml(loc)}</div>` : ""}
          ${date ? `<div class="rpl-home-date">${escapeHtml(date)}</div>` : ""}
        </div>
      </aside>
      <div class="rpl-home-leaf rpl-home-leaf-right">
        ${stakes ? `<p class="rpl-home-stakes">${escapeHtml(stakes)}</p>` : ""}
        <div class="rpl-ticket-list rpl-home-jumps">
          <button type="button" class="rpl-choice-ticket rpl-choice-btn" data-rpl-main-tab="play"><span class="rpl-ticket-seal">I</span><span class="rpl-ticket-copy">Enter the scene</span></button>
          <button type="button" class="rpl-choice-ticket rpl-choice-btn" data-rpl-main-tab="inventory"><span class="rpl-ticket-seal">II</span><span class="rpl-ticket-copy">Open the cabinet</span></button>
          <button type="button" class="rpl-choice-ticket rpl-choice-btn" data-rpl-main-tab="shop"><span class="rpl-ticket-seal">III</span><span class="rpl-ticket-copy">Walk the stalls</span></button>
          <button type="button" class="rpl-choice-ticket rpl-choice-btn" data-rpl-main-tab="map"><span class="rpl-ticket-seal">IV</span><span class="rpl-ticket-copy">Spread the chart</span></button>
        </div>
        ${questTickets ? `<div class="rpl-home-threads"><span class="rpl-home-kicker">Open threads</span><div class="rpl-ticket-list">${questTickets}</div></div>` : ""}
        ${excerpt ? `<div class="rpl-home-excerpt rpl-parchment-stage"><span class="rpl-home-kicker">Last spoken</span>${rplProseHtml(excerpt)}</div>` : `<p class="rpl-home-empty">No scene yet. Enter play to begin.</p>`}
      </div>
    </div>`;
}

function rplShopScreenInner(summary) {
  const stalls = rplShopStalls(summary);
  const items = rplCollectInventory(summary);
  const stallHtml = stalls.map(stall => {
    const wares = (stall.wares && stall.wares.length) ? stall.wares : [];
    const wareHtml = wares.length
      ? wares.map(it => {
        const itemId = it.id || it.item_id || "";
        const url = rplItemUrl(itemId);
        const art = url ? `<img src="${escapeHtml(url)}" alt="" />` : rplItemPlateSvg(it.name, it.rarity);
        return `<button type="button" class="rpl-stall-ware" data-rpl-inquire="1" data-item-name="${escapeHtml(it.name || "")}" data-stall-name="${escapeHtml(stall.name || "")}">
          <span class="rpl-stall-ware-art">${art}</span>
          <span class="rpl-stall-ware-name">${escapeHtml(it.name || "")}</span>
        </button>`;
      }).join("")
      : `<p class="rpl-stall-empty">No listed wares here. Carried goods stay in the cabinet.</p>`;
    return `<article class="rpl-stall${stall.current ? " rpl-stall-current" : ""}" data-stall-id="${escapeHtml(String(stall.id || ""))}">
      <header class="rpl-stall-head">
        <span class="rpl-stall-awning"></span>
        <h3 class="rpl-stall-name">${escapeHtml(stall.name || "Stall")}</h3>
      </header>
      ${stall.description ? `<p class="rpl-stall-desc">${escapeHtml(stall.description)}</p>` : ""}
      <div class="rpl-stall-wares">${wareHtml}</div>
    </article>`;
  }).join("");
  const packNote = items.length
    ? `<p class="rpl-shop-pack-note">${items.length} carried item${items.length === 1 ? "" : "s"} in the cabinet.</p>`
    : "";
  return `<div class="rpl-bazaar">
    <header class="rpl-bazaar-head">
      <span class="rpl-home-kicker">Stalls</span>
      <h2>Known places of trade</h2>
      ${packNote}
    </header>
    <div class="rpl-bazaar-row">${stallHtml || `<p class="rpl-stall-empty">No charted places yet. Walk the map, then return.</p>`}</div>
  </div>`;
}

function rplWireShopScreen() {
  document.querySelectorAll("[data-rpl-inquire]").forEach(btn => {
    btn.onclick = () => {
      const item = btn.getAttribute("data-item-name") || "this ware";
      const stall = btn.getAttribute("data-stall-name") || "";
      rplSetMainTab("play");
      const input = document.getElementById("rpl-input");
      if (input) {
        input.value = stall ? `I inquire about ${item} at ${stall}.` : `I inquire about ${item}.`;
        input.focus();
      }
    };
  });
}

function rplUpdateAuxScreens() {
  const home = document.getElementById("rpl-screen-home");
  if (home) home.innerHTML = rplHomeScreenInner(RPL_STATE, RPL_STATE && RPL_STATE.world_date, rplLatestGm(RPL_MESSAGES));
  const shop = document.getElementById("rpl-shop-body");
  if (shop) {
    shop.innerHTML = rplShopScreenInner(RPL_STATE);
    rplWireShopScreen();
  }
  rplWirePartyPlate();
}

function rplScreenHidden(id) {
  return RPL_MAIN_TAB === id ? "" : " hidden";
}

function rplHudStrip(summary, worldDate) {
  const player = (summary && summary.player) || {};
  const date = escapeHtml(worldDate || (summary && summary.world_date) || "—");
  const loc = escapeHtml(player.location || "");
  const bal = rplCoinBalance();
  const stakes = escapeHtml(rplStakesLine(summary));
  const stakesHtml = stakes
    ? `<div class="rpl-hud-stakes" id="rpl-hud-stakes" title="${stakes}">${stakes}</div>`
    : `<div class="rpl-hud-stakes" id="rpl-hud-stakes"></div>`;
  const coinsHtml = `<div class="rpl-coins" id="rpl-coins" title="Coins from practice + spends">${rplMarkSvg("coin", "rpl-mark-coin")}<span class="rpl-coins-val" id="rpl-coins-val">${bal}</span></div>`;
  return `${rplMainTabsHtml()}<header class="rpl-hud-strip rpl-chrome rpl-hud wp-parallel-hud">
    ${rplRenderPartyPlate(summary)}
    <div class="rpl-hud-gauges rpl-hud-meta">
      <div class="rpl-hud-gauge">
        <span class="rpl-hud-gauge-label">World day</span>
        <div class="rpl-hud-date" id="rpl-hud-date" title="In-world day">${date}</div>
      </div>
      <div class="rpl-hud-gauge rpl-hud-gauge-wide">
        <span class="rpl-hud-gauge-label">Pressure</span>
        ${stakesHtml}
      </div>
      <div class="rpl-hud-gauge">
        <span class="rpl-hud-gauge-label">Place</span>
        <div class="rpl-hud-loc" id="rpl-hud-loc">${loc}</div>
      </div>
    </div>
    <div class="rpl-hud-actions">
      <div class="rpl-pregen-pill" id="rpl-pregen-pill" hidden></div>
      ${coinsHtml}
      <div class="rpl-panel-toggles">
        <button type="button" class="rpl-icon-btn" id="rpl-world-menu-btn" title="World menu">${rplMarkSvg("menu")}</button>
        <button type="button" class="rpl-icon-btn" id="rpl-toggle-left" title="Character">${rplMarkSvg("railL")}</button>
        <button type="button" class="rpl-icon-btn" id="rpl-toggle-right" title="Quests & chronicle">${rplMarkSvg("railR")}</button>
        <button type="button" class="rpl-icon-btn" id="rpl-map-btn" title="Map">${rplMarkSvg("map")}</button>
      </div>
    </div>
  </header>`;
}

function rplRailIconsHtml(side) {
  if (side === "left") {
    return `<div class="rpl-rail-icons">
      <button type="button" class="rpl-rail-icon" data-rpl-expand="char" title="Character">${rplMarkSvg("char")}</button>
      <button type="button" class="rpl-rail-icon" data-rpl-expand="inv" title="Inventory">${rplMarkSvg("inv")}</button>
    </div>`;
  }
  return `<div class="rpl-rail-icons">
    <button type="button" class="rpl-rail-icon" data-rpl-expand="quest" title="Quests">${rplMarkSvg("quest")}</button>
    <button type="button" class="rpl-rail-icon" data-rpl-expand="chron" title="Chronicle">${rplMarkSvg("chron")}</button>
  </div>`;
}

function rplLeftRail(summary) {
  const collapsed = RPL_LEFT_COLLAPSED ? " rpl-collapsed" : "";
  return `<aside class="rpl-rail rpl-rail-left${collapsed}" id="rpl-rail-left">
    ${rplRailIconsHtml("left")}
    <div class="rpl-panel rpl-panel-char" id="rpl-char-panel">
      <div class="rpl-panel-head"><span class="rpl-panel-mark">${rplMarkSvg("char")}</span><span>Character</span></div>
      <div class="rpl-panel-body" id="rpl-char-body">${rplRenderCharacterPanel(summary)}</div>
    </div>
  </aside>`;
}

function rplRightRail(summary) {
  const collapsed = RPL_RIGHT_COLLAPSED ? " rpl-collapsed" : "";
  return `<aside class="rpl-rail rpl-rail-right${collapsed}" id="rpl-rail-right">
    ${rplRailIconsHtml("right")}
    <div class="rpl-panel" id="rpl-quest-panel">
      <div class="rpl-panel-head"><span class="rpl-panel-mark">${rplMarkSvg("quest")}</span><span>Quests</span></div>
      <div class="rpl-panel-body" id="rpl-quest-body">${rplRenderQuestsPanel(summary)}</div>
    </div>
    <div class="rpl-panel" id="rpl-chronicle-panel">
      <div class="rpl-panel-head"><span class="rpl-panel-mark">${rplMarkSvg("chron")}</span><span>Chronicle</span></div>
      <div class="rpl-panel-body" id="rpl-chronicle-body">${rplRenderChroniclePanel()}</div>
    </div>
  </aside>`;
}

function rplOverlaysHtml() {
  return `
    <div class="rpl-scrim" id="rpl-scrim"></div>
    <div class="rpl-slide-over rpl-left" id="rpl-slide-left"></div>
    <div class="rpl-slide-over rpl-right" id="rpl-slide-right"></div>
    <aside class="rpl-slide-over rpl-right" id="rpl-world-panel" aria-hidden="true">
      <div class="rpl-panel">
        <div class="rpl-panel-head"><span>World</span></div>
        <div class="rpl-panel-body" style="display:flex;flex-direction:column;gap:8px">
          <button type="button" class="rpl-menu-btn" id="rpl-world-open-codex">${rplMarkSvg("codex")} World codex</button>
          <button type="button" class="rpl-menu-btn" id="rpl-world-open-map">${rplMarkSvg("map")} Open map</button>
          <button type="button" class="rpl-menu-btn" id="rpl-pregen-images">Generate all art</button>
          <button type="button" class="rpl-menu-btn" id="rpl-world-open-settings">${rplMarkSvg("settings")} Settings</button>
        </div>
      </div>
    </aside>
    ${rplCodexPanelHtml()}
    <div class="rpl-overlay" id="rpl-map-overlay">
      <div class="rpl-overlay-panel rpl-map-panel">
        <div class="rpl-overlay-head"><span>World Map</span><button type="button" class="rpl-overlay-close" id="rpl-map-close" aria-label="Close map">${rplMarkSvg("close")}</button></div>
        <div class="rpl-overlay-body"><p class="rpl-map-overlay-hint">The chart lives on the Map screen.</p>
          <button type="button" class="rpl-menu-btn" data-rpl-main-tab="map" id="rpl-overlay-goto-map">Open chart</button>
        </div>
      </div>
    </div>
    <div class="rpl-overlay" id="rpl-gallery-overlay">
      <div class="rpl-overlay-panel rpl-gallery-panel">
        <div class="rpl-overlay-head"><span>Characters</span><button type="button" class="rpl-overlay-close" id="rpl-gallery-close" aria-label="Close gallery">${rplMarkSvg("close")}</button></div>
        <div class="rpl-overlay-body" id="rpl-gallery-body"></div>
      </div>
    </div>
    <div class="rpl-overlay" id="rpl-settings-overlay">
      <div class="rpl-overlay-panel rpl-settings-panel">
        <div class="rpl-overlay-head"><span>Edit settings</span><button type="button" class="rpl-overlay-close" id="rpl-settings-close" aria-label="Close settings">${rplMarkSvg("close")}</button></div>
        <div class="rpl-overlay-body" id="rpl-settings-body"></div>
      </div>
    </div>`;
}

function rplScenePromptValue() {
  const el = document.getElementById("rpl-scene-prompt");
  if (el) RPL_SCENE_PROMPT = String(el.value || "");
  return RPL_SCENE_PROMPT;
}

function rplImageGenHint() {
  if (RPL_IMAGE_GEN.available) return "";
  const reason = RPL_IMAGE_GEN.reason || "Image generation unavailable";
  return `<div class="rpl-scene-status rpl-scene-error">${escapeHtml(reason)}</div>`;
}

function rplBustUrl(url) {
  if (!url) return "";
  const base = String(url).split("?")[0];
  return `${base}?t=${Date.now()}`;
}

function rplFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !String(file.type).startsWith("image/")) {
      reject(new Error("Not an image"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

/** Convert any browser-decodable image data URL to PNG (server prefers PNG without Pillow). */
function rplEnsurePngDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl || typeof dataUrl !== "string") {
      reject(new Error("No image data"));
      return;
    }
    if (/^data:image\/png;base64,/i.test(dataUrl)) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, img.naturalWidth || img.width || 1);
        canvas.height = Math.max(1, img.naturalHeight || img.height || 1);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });
}

async function rplClipboardImageDataUrl(clipboardData) {
  if (!clipboardData || !clipboardData.items) return null;
  for (let i = 0; i < clipboardData.items.length; i += 1) {
    const item = clipboardData.items[i];
    if (item.type && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) return rplFileToDataUrl(blob);
    }
  }
  return null;
}

async function rplRefreshAfterImageUpload(kind, id, url) {
  const bust = rplBustUrl(url);
  if (kind === "scene") {
    const mid = String(id);
    const msg = RPL_MESSAGES.find(m => String(m.id) === mid);
    if (msg) msg.has_scene = true;
    RPL_SCENE_FAIL = null;
    await rplFetchScenes();
    rplSetBackdrop(mid, true, true);
    rplUpdateSceneControls();
    rplUpdateSceneFilmstrips();
    rplRenderHistoryList();
    if (RPL_CODEX_OPEN) rplUpdateCodexPanel();
  } else if (kind === "portrait") {
    await rplFetchPortraits();
    rplUpdateMcStage();
    rplUpdatePanels();
    const gallery = document.getElementById("rpl-gallery-overlay");
    if (gallery && gallery.classList.contains("rpl-open")) rplRenderGallery();
  } else if (kind === "item") {
    await rplFetchItems();
    rplUpdatePanels();
  } else if (kind === "map") {
    await rplFetchMap();
    rplRenderMap();
    if (RPL_CODEX_OPEN) rplUpdateCodexPanel();
  }
  return bust;
}

async function rplUploadParallelImage(kind, id, dataUrl) {
  if (!dataUrl) {
    const reason = "No image data";
    if (typeof showToast === "function") showToast(reason, "warn");
    return { ok: false, reason };
  }
  let pngUrl = dataUrl;
  try {
    pngUrl = await rplEnsurePngDataUrl(dataUrl);
  } catch (_) {
    /* fall through with original; server may still accept PNG */
  }
  const body = { kind, image: pngUrl };
  if (kind !== "map" && id != null && id !== "") body.id = id;
  const res = await parallelFetch("/api/parallel/image/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.data || res.data.ok !== true) {
    const reason = (res.data && res.data.reason) || "Upload failed";
    if (typeof showToast === "function") showToast(reason, "warn");
    return { ok: false, reason };
  }
  const url = res.data.url || res.data.path || "";
  await rplRefreshAfterImageUpload(kind, id, url);
  if (typeof showToast === "function") showToast("Image uploaded");
  return { ok: true, url, path: res.data.path };
}

function rplPickAndUploadImage(kind, id) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) {
        resolve({ ok: false });
        return;
      }
      try {
        const dataUrl = await rplFileToDataUrl(file);
        resolve(await rplUploadParallelImage(kind, id, dataUrl));
      } catch (_) {
        if (typeof showToast === "function") showToast("Could not read image", "warn");
        resolve({ ok: false });
      }
    };
    input.click();
  });
}

async function rplTryClipboardPaste(kind, id, focusEl) {
  if (kind !== "map" && (id == null || id === "")) {
    if (typeof showToast === "function") showToast("No image target yet", "warn");
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const imgType = item.types.find(t => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getAsType(imgType);
          const dataUrl = await rplFileToDataUrl(new File([blob], "paste.png", { type: imgType }));
          await rplUploadParallelImage(kind, id, dataUrl);
          return;
        }
      }
    }
  } catch (_) { /* clipboard permission or unsupported */ }
  if (focusEl && typeof focusEl.focus === "function") {
    focusEl.focus();
    if (typeof showToast === "function") showToast("Press Ctrl+V / ⌘V to paste", "info");
    return;
  }
  if (typeof showToast === "function") showToast("Click the image area and press Ctrl+V / ⌘V", "warn");
}

function rplEnsurePasteHint(el) {
  if (!el || el.querySelector(":scope > .rpl-paste-hint")) return;
  const hint = document.createElement("span");
  hint.className = "rpl-paste-hint";
  hint.textContent = "Paste or drop image";
  el.appendChild(hint);
}

function rplBindImagePasteTarget(el, kind, idGetter) {
  if (!el || el._rplPasteBound) return;
  el._rplPasteBound = true;
  el.classList.add("rpl-paste-target");
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
  rplEnsurePasteHint(el);
  el.addEventListener("click", (e) => {
    if (e.target.closest("button, .rpl-film-replace")) return;
    el.focus();
  });
  el.addEventListener("paste", async (e) => {
    e.preventDefault();
    const id = typeof idGetter === "function" ? idGetter() : idGetter;
    if (kind !== "map" && (id == null || id === "")) {
      if (typeof showToast === "function") showToast("No image target yet", "warn");
      return;
    }
    try {
      const dataUrl = await rplClipboardImageDataUrl(e.clipboardData);
      if (dataUrl) await rplUploadParallelImage(kind, id, dataUrl);
    } catch (_) {
      if (typeof showToast === "function") showToast("Could not read pasted image", "warn");
    }
  });
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("rpl-paste-dragover");
  });
  el.addEventListener("dragleave", () => el.classList.remove("rpl-paste-dragover"));
  el.addEventListener("drop", async (e) => {
    e.preventDefault();
    el.classList.remove("rpl-paste-dragover");
    const id = typeof idGetter === "function" ? idGetter() : idGetter;
    if (kind !== "map" && (id == null || id === "")) return;
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !String(file.type).startsWith("image/")) return;
    try {
      const dataUrl = await rplFileToDataUrl(file);
      await rplUploadParallelImage(kind, id, dataUrl);
    } catch (_) {
      if (typeof showToast === "function") showToast("Could not read dropped image", "warn");
    }
  });
}

function rplRenderImgToolsHtml(kind, id, hasArt) {
  const idStr = id != null && id !== "" ? String(id) : "";
  const needId = kind !== "map";
  const disabled = needId && !idStr ? " disabled" : "";
  const replaceCls = hasArt ? "" : " hidden";
  return `<div class="rpl-img-tools" data-rpl-img-kind="${escapeHtml(kind)}" data-rpl-img-id="${escapeHtml(idStr)}">
    <button type="button" class="rpl-scene-btn rpl-img-paste"${disabled}>Paste</button>
    <button type="button" class="rpl-scene-btn rpl-scene-btn-secondary rpl-img-upload"${disabled}>Upload</button>
    <button type="button" class="rpl-scene-btn rpl-scene-btn-secondary rpl-img-replace${replaceCls}"${disabled}>Replace</button>
  </div>`;
}

function rplWireImgTools(scope, pasteTargetGetter) {
  const root = scope || document;
  root.querySelectorAll(".rpl-img-tools").forEach(row => {
    if (row._rplImgToolsWired) return;
    row._rplImgToolsWired = true;
    const kind = row.getAttribute("data-rpl-img-kind") || "";
    const id = row.getAttribute("data-rpl-img-id") || "";
    const idVal = kind === "map" ? "" : id;
    const pasteBtn = row.querySelector(".rpl-img-paste");
    const uploadBtn = row.querySelector(".rpl-img-upload");
    const replaceBtn = row.querySelector(".rpl-img-replace");
    const focusEl = typeof pasteTargetGetter === "function" ? pasteTargetGetter(row) : null;
    if (pasteBtn) {
      pasteBtn.onclick = (e) => {
        e.stopPropagation();
        rplTryClipboardPaste(kind, idVal, focusEl);
      };
    }
    const pick = (e) => {
      e.stopPropagation();
      rplPickAndUploadImage(kind, idVal);
    };
    if (uploadBtn) uploadBtn.onclick = pick;
    if (replaceBtn) replaceBtn.onclick = pick;
  });
}

function rplRenderSceneControls(gmMsg) {
  const gm = gmMsg || rplLatestGm(RPL_MESSAGES);
  const sceneMsg = rplLatestSceneMessage(RPL_MESSAGES) || (gm && gm.has_scene ? gm : null);
  const previewId = sceneMsg && sceneMsg.id;
  const previewUrl = previewId ? rplSceneUrl(previewId) : "";
  const hasScene = !!(sceneMsg && sceneMsg.has_scene);
  const msgId = gm && gm.id ? String(gm.id) : "";
  const fail = RPL_SCENE_FAIL && String(RPL_SCENE_FAIL.messageId) === msgId ? RPL_SCENE_FAIL : null;
  const previewInner = previewUrl
    ? `<img src="${escapeHtml(previewUrl)}?t=${Date.now()}" alt="Last illustrated scene" />`
    : fail
      ? `<div class="rpl-scene-stub"><p>${escapeHtml(fail.reason || "Image generation failed.")}</p><button type="button" class="rpl-scene-btn" id="rpl-scene-retry">Retry</button></div>`
      : `<div class="rpl-scene-preview-stub">${rplScenePlateSvg("")}<span>No scene image yet</span></div>`;
  const apiHint = !RPL_IMAGE_GEN.available && !previewUrl ? rplImageGenHint() : "";
  const status = fail && !previewUrl
    ? `<div class="rpl-scene-status rpl-scene-error" id="rpl-scene-status">${escapeHtml(fail.reason || "Could not paint the scene.")}</div>`
    : apiHint || `<div class="rpl-scene-status" id="rpl-scene-status"></div>`;
  const promptVal = escapeHtml(RPL_SCENE_PROMPT || "");
  const collapsed = !hasScene && !previewUrl;
  const imgTools = msgId ? rplRenderImgToolsHtml("scene", msgId, hasScene || !!previewUrl) : "";
  return `<div class="rpl-scene-controls${collapsed ? " rpl-scene-collapsed" : ""}" id="rpl-scene-controls">
    <button type="button" class="rpl-scene-toggle" id="rpl-scene-toggle">${collapsed ? "Show scene art" : "Hide scene art"}</button>
    <div class="rpl-scene-preview rpl-paste-target" id="rpl-scene-preview">${previewInner}<span class="rpl-paste-hint">Paste or drop image</span></div>
    <input type="text" class="rpl-scene-prompt" id="rpl-scene-prompt" placeholder="Optional prompt tweak…" aria-label="Image prompt tweak" value="${promptVal}" />
    <div class="rpl-scene-btn-row">
      <button type="button" class="rpl-scene-btn" id="rpl-scene-illustrate" data-msg-id="${escapeHtml(msgId)}" ${msgId && RPL_IMAGE_GEN.available ? "" : "disabled"}>Illustrate</button>
      <button type="button" class="rpl-scene-btn rpl-scene-btn-secondary" id="rpl-scene-regenerate" data-msg-id="${escapeHtml(msgId)}" ${hasScene && RPL_IMAGE_GEN.available ? "" : "disabled"}>Regenerate</button>
    </div>
    ${imgTools ? `<div class="rpl-scene-img-tools">${imgTools}</div>` : ""}
    ${status}
  </div>`;
}

function rplGameShell(summary, worldDate, latestGm) {
  const sceneMsg = rplLatestSceneMessage(RPL_MESSAGES) || (latestGm && latestGm.has_scene ? latestGm : null);
  const sceneUrl = sceneMsg && sceneMsg.id ? rplSceneUrl(sceneMsg.id) : "";
  const placeholderHidden = sceneUrl ? " hidden" : "";
  const imgHtml = sceneUrl ? `<img src="${escapeHtml(sceneUrl)}" alt="" />` : "";
  const player = (summary && summary.player) || {};
  const loc = escapeHtml(player.location || "");
  const mood = escapeHtml(rplSceneMood(summary));
  const hasStory = !rplIsFirstRun();
  const storyOpenAttr = "";
  const verbHiddenAttr = hasStory ? " hidden" : "";
  return `
    ${rplHudStrip(summary, worldDate)}
    <div class="wp-parallel-screens" id="rpl-screens">
    <section class="wp-parallel-screen rpl-screen-home" data-rpl-screen="home" id="rpl-screen-home"${rplScreenHidden("home")}>
      ${rplHomeScreenInner(summary, worldDate, latestGm)}
    </section>
    <div class="rpl-modify-wrap" id="rpl-modify-wrap"${rplScreenHidden("modify")}>${rplModifyTabHtml()}</div>
    <div class="rpl-stage wp-parallel-screen rpl-screen-play" data-rpl-screen="play" id="rpl-play-stage"${rplScreenHidden("play")}>
      ${rplLeftRail(summary)}
      <main class="rpl-center">
        <div class="rpl-viewport rpl-proscenium rpl-parchment-stage" id="rpl-viewport">
          <div class="rpl-proscenium-frame" aria-hidden="true"></div>
          <div class="rpl-scene-meta">
            ${loc ? `<div class="rpl-scene-loc" id="rpl-scene-loc">${loc}</div>` : ""}
            ${mood ? `<div class="rpl-scene-mood" id="rpl-scene-mood">${mood}</div>` : ""}
          </div>
          <div class="rpl-scene-placeholder" id="rpl-scene-placeholder"${placeholderHidden}>
            <div class="rpl-fog"></div><div class="rpl-fog rpl-fog-2"></div>
            <div class="rpl-scene-plate-wrap">${rplScenePlateSvg(player.location || "")}</div>
          </div>
          <div class="rpl-scene-layer rpl-active" id="rpl-backdrop-a">${imgHtml}</div>
          <div class="rpl-scene-layer" id="rpl-backdrop-b"></div>
          <div class="rpl-particles" aria-hidden="true">${rplParticlesHtml()}</div>
          <div class="rpl-vignette"></div>
          ${rplRenderMcStageHtml(summary)}
          <div class="rpl-viewport-scene-strip" id="rpl-viewport-scene-film-wrap">
            <div class="rpl-viewport-scene-strip-label">Scenes</div>
            <div id="rpl-viewport-scene-film">${rplRenderSceneFilmstripHtml()}</div>
          </div>
          ${rplRenderSceneControls(latestGm)}
          <div class="rpl-dialogue-zone">
            <div class="rpl-dialogue-box" id="rpl-dialogue-box">
              <div class="rpl-dialogue-text" id="rpl-dialogue-text"></div>
              <div class="rpl-dialogue-hint">click to skip · ↑↓ recall commands</div>
            </div>
          </div>
        </div>
        <details class="rpl-story-so-far" id="rpl-story-so-far" aria-label="Story so far"${storyOpenAttr}>
          <summary class="rpl-story-head">
            <span>Story so far</span>
            <button type="button" class="rpl-story-follow rpl-active" id="rpl-story-follow" title="Auto-scroll to latest">follow latest</button>
          </summary>
          <div class="rpl-story-body" id="rpl-story-body">${rplRenderStorySoFar(RPL_MESSAGES)}</div>
        </details>
        <div class="rpl-action-bar" id="rpl-action-bar">
          <div id="rpl-beat-banner" hidden></div>
          <div id="rpl-choice-row" class="rpl-ticket-list"></div>
          <div class="rpl-action-row">
            <div class="rpl-input-wrap">
              <input type="text" id="rpl-input" placeholder="What do you do? Type, then Say or Enter" autocomplete="off" aria-label="Your action" />
              <button type="button" class="rpl-say-btn" id="rpl-say-btn">Say</button>
            </div>
          </div>
          <div class="rpl-verb-chips"${verbHiddenAttr} role="group" aria-label="Quick starters">
            <button type="button" class="rpl-verb-chip" data-verb="I look around and assess the situation.">Look around</button>
            <button type="button" class="rpl-verb-chip" data-verb="I talk to whoever is nearest.">Talk</button>
            <button type="button" class="rpl-verb-chip" data-verb="I rest and recover.">Rest</button>
          </div>
          ${rplRenderDeedsRowHtml()}
          <div class="rpl-resolving" id="rpl-resolving" hidden>
            <div class="rpl-rune" aria-hidden="true"></div>
            <div class="rpl-flavor" id="rpl-flavor-text">${escapeHtml(RPL_FLAVOR_LINES[0])}</div>
          </div>
        </div>
      </main>
      ${rplRightRail(summary)}
    </div>
    <section class="wp-parallel-screen rpl-screen-inventory" data-rpl-screen="inventory" id="rpl-screen-inventory"${rplScreenHidden("inventory")}>
      <div class="rpl-inv-hall">
        <header class="rpl-inv-hall-head">
          <span class="rpl-home-kicker">Cabinet</span>
          <h2>What you carry</h2>
        </header>
        <div class="rpl-panel-body" id="rpl-inv-body">${rplRenderInventoryPanel(summary)}</div>
      </div>
    </section>
    <section class="wp-parallel-screen rpl-screen-shop" data-rpl-screen="shop" id="rpl-screen-shop"${rplScreenHidden("shop")}>
      <div class="rpl-panel-body" id="rpl-shop-body">${rplShopScreenInner(summary)}</div>
    </section>
    <section class="wp-parallel-screen rpl-screen-map rpl-cartograph" data-rpl-screen="map" id="rpl-screen-map"${rplScreenHidden("map")}>
      <header class="rpl-map-table-head">
        <span class="rpl-home-kicker">Chart table</span>
        <h2>Known lands</h2>
      </header>
      <div class="rpl-map-toolbar" id="rpl-map-toolbar"></div>
      <div class="rpl-map-canvas-wrap rpl-paste-target rpl-parchment-stage" id="rpl-map-wrap">
        ${rplMapEmptyHtml(true)}
      </div>
    </section>
    </div>
    ${rplOverlaysHtml()}`;
}

function rplUpdateHud(summary, worldDate) {
  const player = (summary && summary.player) || {};
  const dateEl = document.getElementById("rpl-hud-date");
  const locEl = document.getElementById("rpl-hud-loc");
  const stakesEl = document.getElementById("rpl-hud-stakes");
  const date = worldDate || (summary && summary.world_date) || "—";
  if (dateEl) dateEl.textContent = date;
  if (locEl) locEl.textContent = player.location || "";
  const stakes = rplStakesLine(summary);
  if (stakesEl) {
    stakesEl.textContent = stakes;
    stakesEl.title = stakes;
    stakesEl.hidden = !stakes;
  }
  rplUpdateCoinsDisplay(false);
}

function rplRenderChoiceRowHtml() {
  if (RPL_BUSY || RPL_PENDING_CHOICE) return "";
  const choices = rplPendingChoices();
  if (!choices.length) return "";
  const btns = choices.map((c, i) => {
    const seal = ["I", "II", "III", "IV"][i] || String(i + 1);
    return `<button type="button" class="rpl-choice-btn rpl-choice-ticket" data-choice-idx="${i}"><span class="rpl-ticket-seal">${seal}</span><span class="rpl-ticket-copy">${escapeHtml(c)}</span></button>`;
  }).join("");
  return `<div class="rpl-choice-row rpl-ticket-list"><div class="rpl-choice-label">Engraved tickets</div><div class="rpl-choice-btns">${btns}</div></div>`;
}

function rplUpdateBeatBanner() {
  const el = document.getElementById("rpl-beat-banner");
  if (!el) return;
  const beat = rplBeatSummary();
  if (!beat || RPL_BUSY) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `<strong>Since your last action</strong>${escapeHtml(beat)}`;
}

function rplUpdateChoiceRow() {
  const host = document.getElementById("rpl-choice-row");
  if (!host) return;
  host.innerHTML = rplRenderChoiceRowHtml();
  host.querySelectorAll(".rpl-choice-btn").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.getAttribute("data-choice-idx"), 10);
      const choices = rplPendingChoices();
      const text = choices[idx];
      if (text) rplSubmitAction(text);
    };
  });
}

function rplUpdateActionChrome() {
  rplUpdateChoiceRow();
  rplUpdateBeatBanner();
}

function rplUpdateStoryPanel() {
  const body = document.getElementById("rpl-story-body");
  if (!body) return;
  body.innerHTML = rplRenderStorySoFar(RPL_MESSAGES);
  if (RPL_CHRONICLE_FOLLOW) {
    body.scrollTop = body.scrollHeight;
  }
}

function rplUpdateSceneControls() {
  rplScenePromptValue();
  const host = document.getElementById("rpl-scene-controls");
  if (!host) return;
  const gm = rplLatestGm(RPL_MESSAGES);
  host.outerHTML = rplRenderSceneControls(gm);
  rplWireSceneControls();
}

function rplWireInventoryInspect() {
  let items = [];
  try {
    items = rplCollectInventory(RPL_STATE);
  } catch (_) {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  document.querySelectorAll("[data-inv-idx]").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.getAttribute("data-inv-idx"), 10);
      RPL_INV_INSPECT_IDX = RPL_INV_INSPECT_IDX === idx ? null : idx;
      rplUpdatePanels();
    };
  });
  const genBtn = document.getElementById("rpl-inv-item-gen");
  if (genBtn) {
    genBtn.onclick = () => {
      const itemId = genBtn.getAttribute("data-item-id");
      const hasArt = genBtn.getAttribute("data-has-art") === "1";
      rplGenerateItemImage(itemId, hasArt, genBtn);
    };
  }
  const inspectArt = document.getElementById("rpl-inv-inspect-art");
  const inspectIdx = RPL_INV_INSPECT_IDX;
  let inspectItemId = null;
  if (inspectIdx != null && items[inspectIdx]) {
    inspectItemId = items[inspectIdx].id || items[inspectIdx].item_id;
  }
  if (inspectArt && inspectItemId) {
    rplBindImagePasteTarget(inspectArt, "item", () => inspectItemId);
  }
  rplWireImgTools(document.getElementById("rpl-inv-inspect"), () => document.getElementById("rpl-inv-inspect-art"));
  if (RPL_INV_INSPECT_IDX != null && RPL_INV_INSPECT_IDX >= items.length) {
    RPL_INV_INSPECT_IDX = null;
  }
}

function rplWireIllustrateButtons(root) {
  const scope = root || document;
  scope.querySelectorAll(".rpl-illustrate-btn").forEach(btn => {
    btn.onclick = () => rplIllustrate(
      btn.getAttribute("data-msg-id"),
      btn,
      btn.getAttribute("data-regen") === "1"
    );
  });
}

function rplWireSceneControls() {
  const illustrateBtn = document.getElementById("rpl-scene-illustrate");
  const regenBtn = document.getElementById("rpl-scene-regenerate");
  const retryBtn = document.getElementById("rpl-scene-retry");
  const followBtn = document.getElementById("rpl-story-follow");
  const toggleBtn = document.getElementById("rpl-scene-toggle");
  const promptEl = document.getElementById("rpl-scene-prompt");
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      const host = document.getElementById("rpl-scene-controls");
      if (!host) return;
      const collapsed = host.classList.toggle("rpl-scene-collapsed");
      toggleBtn.textContent = collapsed ? "Show scene art" : "Hide scene art";
    };
  }
  if (promptEl) {
    promptEl.oninput = () => { RPL_SCENE_PROMPT = String(promptEl.value || ""); };
  }
  if (illustrateBtn) {
    illustrateBtn.onclick = () => rplIllustrate(
      illustrateBtn.getAttribute("data-msg-id"),
      illustrateBtn,
      false
    );
  }
  if (regenBtn) {
    regenBtn.onclick = () => rplIllustrate(
      regenBtn.getAttribute("data-msg-id"),
      regenBtn,
      true
    );
  }
  if (retryBtn) {
    retryBtn.onclick = () => {
      const gm = rplLatestGm(RPL_MESSAGES);
      if (gm && gm.id) rplIllustrate(String(gm.id), retryBtn, !!gm.has_scene);
    };
  }
  const preview = document.getElementById("rpl-scene-preview");
  const gm = rplLatestGm(RPL_MESSAGES);
  const msgId = gm && gm.id ? String(gm.id) : "";
  if (preview && msgId) {
    preview._rplPasteBound = false;
    rplBindImagePasteTarget(preview, "scene", () => msgId);
  }
  rplWireImgTools(document.getElementById("rpl-scene-controls"), () => document.getElementById("rpl-scene-preview"));
  if (followBtn) {
    followBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      RPL_CHRONICLE_FOLLOW = !RPL_CHRONICLE_FOLLOW;
      followBtn.classList.toggle("rpl-active", RPL_CHRONICLE_FOLLOW);
      followBtn.textContent = RPL_CHRONICLE_FOLLOW ? "follow latest" : "paused";
      if (RPL_CHRONICLE_FOLLOW) rplUpdateStoryPanel();
    };
  }
}

function rplUpdatePanels() {
  const charBody = document.getElementById("rpl-char-body");
  const invBody = document.getElementById("rpl-inv-body");
  const questBody = document.getElementById("rpl-quest-body");
  const chronBody = document.getElementById("rpl-chronicle-body");
  if (charBody) charBody.innerHTML = rplRenderCharacterPanel(RPL_STATE);
  if (invBody) invBody.innerHTML = rplRenderInventoryPanel(RPL_STATE);
  if (questBody) questBody.innerHTML = rplRenderQuestsPanel(RPL_STATE);
  if (chronBody) chronBody.innerHTML = rplRenderChroniclePanel();
  rplUpdateMcStage();
  rplUpdatePartyPlate();
  rplUpdateAuxScreens();
  rplWireInventoryInspect();
  rplWireChronicleControls();
  rplUpdateStoryPanel();
  rplSyncSlideOvers();
  rplApplyPanelInertness();
  rplSyncAllMarginalia();
  rplUpdateActionChrome();
}


function rplRenderHistoryList() {
  const log = document.getElementById("rpl-history-log");
  if (!log) return;
  log.innerHTML = rplRenderHistoryLog(RPL_MESSAGES);
  rplWireIllustrateButtons(log);
}

function rplSetSceneStatus(text, isError) {
  const el = document.getElementById("rpl-scene-status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("rpl-scene-error", !!isError);
}

function rplUpdateDialogue(gmMsg, animate) {
  const textEl = document.getElementById("rpl-dialogue-text");
  const box = document.getElementById("rpl-dialogue-box");
  if (!textEl) return;
  if (!gmMsg || !gmMsg.content) {
    textEl.innerHTML = `<p style="font-style:italic;color:#8a7e6c;">Type an action below and press Say. The reply shows here and in Story so far.</p>`;
    return;
  }
  if (box) box.classList.remove("rpl-dialogue-in");
  void (box && box.offsetWidth);
  if (box) box.style.animation = "none";
  requestAnimationFrame(() => {
    if (box) {
      box.style.animation = "";
      if (animate) box.classList.add("rpl-dialogue-in");
    }
    if (animate) {
      rplTypewriterReveal(textEl, gmMsg.content);
    } else {
      rplCancelTypewriter();
      textEl.innerHTML = rplProseHtml(gmMsg.content);
    }
  });
}

function rplSetBackdrop(messageId, hasScene, crossfade) {
  const placeholder = document.getElementById("rpl-scene-placeholder");
  if (!messageId || !hasScene) {
    if (placeholder) placeholder.hidden = false;
    const a = document.getElementById("rpl-backdrop-a");
    const b = document.getElementById("rpl-backdrop-b");
    if (a) a.classList.remove("rpl-active");
    if (b) b.classList.remove("rpl-active");
    return;
  }
  const url = rplSceneUrl(messageId);
  if (placeholder) placeholder.hidden = true;

  const layerA = document.getElementById("rpl-backdrop-a");
  const layerB = document.getElementById("rpl-backdrop-b");
  if (!layerA || !layerB) return;

  const incoming = RPL_BACKDROP_ACTIVE === "a" ? layerB : layerA;
  const outgoing = RPL_BACKDROP_ACTIVE === "a" ? layerA : layerB;

  incoming.innerHTML = `<img src="${escapeHtml(url)}" alt="" data-rpl-scene="${escapeHtml(String(messageId))}" />`;
  incoming.querySelector("img")?.addEventListener("error", () => rplOnSceneImageError(messageId));
  if (crossfade) {
    incoming.classList.add("rpl-active");
    outgoing.classList.remove("rpl-active");
    RPL_BACKDROP_ACTIVE = RPL_BACKDROP_ACTIVE === "a" ? "b" : "a";
  } else {
    layerA.innerHTML = `<img src="${escapeHtml(url)}" alt="" data-rpl-scene="${escapeHtml(String(messageId))}" />`;
    layerA.querySelector("img")?.addEventListener("error", () => rplOnSceneImageError(messageId));
    layerB.innerHTML = "";
    layerA.classList.add("rpl-active");
    layerB.classList.remove("rpl-active");
    RPL_BACKDROP_ACTIVE = "a";
  }
}

function rplStopScenePoll() {
  if (RPL_SCENE_POLL_TIMER) {
    clearInterval(RPL_SCENE_POLL_TIMER);
    RPL_SCENE_POLL_TIMER = null;
  }
  RPL_SCENE_POLL_COUNT = 0;
  RPL_PENDING_SCENE_MSG_ID = null;
}

function rplStartScenePoll(messageId) {
  if (!messageId) return;
  rplStopScenePoll();
  RPL_PENDING_SCENE_MSG_ID = String(messageId);
  RPL_SCENE_POLL_COUNT = 0;
  const tick = async () => {
    RPL_SCENE_POLL_COUNT += 1;
    if (RPL_SCENE_POLL_COUNT > RPL_SCENE_POLL_MAX) {
      rplStopScenePoll();
      return;
    }
    const msgRes = await parallelFetch("/api/parallel/messages?limit=50");
    if (!msgRes.ok) return;
    RPL_MESSAGES = rplUnwrapMessages(msgRes.data);
    const msg = RPL_MESSAGES.find(m => String(m.id) === RPL_PENDING_SCENE_MSG_ID);
    if (msg && msg.has_scene) {
      rplSetBackdrop(msg.id, true, true);
      rplUpdateSceneControls();
      rplRenderHistoryList();
      await rplFetchScenes();
      rplUpdateSceneFilmstrips();
      rplStopScenePoll();
    }
  };
  RPL_SCENE_POLL_TIMER = setInterval(tick, RPL_SCENE_POLL_MS);
  tick();
}

function rplMaybePollSceneForGm(gmMsg) {
  if (!gmMsg || !gmMsg.id || gmMsg.has_scene) return;
  rplStartScenePoll(gmMsg.id);
}

function rplApplyDefaultRailCollapse() {
  const narrow = window.matchMedia("(max-width: 1100px)").matches;
  if (!narrow) return;
  RPL_LEFT_COLLAPSED = true;
  RPL_RIGHT_COLLAPSED = true;
  const left = document.getElementById("rpl-rail-left");
  const right = document.getElementById("rpl-rail-right");
  const toggleLeft = document.getElementById("rpl-toggle-left");
  const toggleRight = document.getElementById("rpl-toggle-right");
  if (left) left.classList.add("rpl-collapsed");
  if (right) right.classList.add("rpl-collapsed");
  if (toggleLeft) toggleLeft.classList.remove("rpl-active");
  if (toggleRight) toggleRight.classList.remove("rpl-active");
}

function rplStopPolling() {
  if (RPL_POLL_TIMER) {
    clearInterval(RPL_POLL_TIMER);
    RPL_POLL_TIMER = null;
  }
}

function rplStopFlavorRotation() {
  if (RPL_FLAVOR_TIMER) {
    clearInterval(RPL_FLAVOR_TIMER);
    RPL_FLAVOR_TIMER = null;
  }
}

function rplStartFlavorRotation() {
  rplStopFlavorRotation();
  const el = document.getElementById("rpl-flavor-text");
  if (!el) return;
  const tick = () => {
    el.textContent = RPL_FLAVOR_LINES[RPL_FLAVOR_IDX % RPL_FLAVOR_LINES.length];
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    RPL_FLAVOR_IDX += 1;
  };
  tick();
  RPL_FLAVOR_TIMER = setInterval(tick, 2400);
}

function rplSetResolving(busy) {
  RPL_BUSY = busy;
  const input = document.getElementById("rpl-input");
  const sayBtn = document.getElementById("rpl-say-btn");
  const resolving = document.getElementById("rpl-resolving");
  const actionBar = document.getElementById("rpl-action-bar");
  if (input) input.disabled = !!busy;
  if (sayBtn) sayBtn.disabled = !!busy;
  if (resolving) resolving.hidden = !busy;
  if (actionBar) actionBar.classList.toggle("rpl-busy", !!busy);
  if (busy) {
    rplStartFlavorRotation();
    rplUpdateChoiceRow();
    const beat = document.getElementById("rpl-beat-banner");
    if (beat) beat.hidden = true;
  } else {
    rplStopFlavorRotation();
    rplUpdateActionChrome();
  }
}

function rplApplyImageGenStatus(data) {
  const ig = data && data.image_gen;
  if (!ig) return;
  RPL_IMAGE_GEN = {
    available: !!ig.available,
    reason: ig.reason || null,
  };
}

function rplUpdatePregenUi() {
  const progress = RPL_PREGEN || {};
  const pill = document.getElementById("rpl-pregen-pill");
  const button = document.getElementById("rpl-pregen-images");
  const hasProgress = !!progress.running || !!progress.message;
  if (pill) {
    const text = progress.running
      ? `Art ${Number(progress.done) || 0}/${Number(progress.total) || 0}`
      : (progress.message || "");
    pill.textContent = text;
    pill.title = progress.message || text;
    pill.hidden = !hasProgress;
    pill.classList.toggle("rpl-running", !!progress.running);
    pill.classList.toggle("rpl-done", !progress.running && hasProgress);
  }
  if (button) {
    button.disabled = !!progress.running || !RPL_IMAGE_GEN.available || RPL_API.pregen === false;
    button.textContent = progress.running ? "Generating all art…" : "Generate all art";
    button.title = !RPL_IMAGE_GEN.available
      ? (RPL_IMAGE_GEN.reason || "Image generation unavailable")
      : "Generate every missing item, portrait, scene, and map image";
  }
}

function rplApplyPregenStatus(data) {
  const pregen = data && data.pregen;
  if (!pregen) return false;
  const previousDone = Number(RPL_PREGEN.done) || 0;
  RPL_PREGEN = {
    running: !!pregen.running,
    done: Number(pregen.done) || 0,
    total: Number(pregen.total) || 0,
    generated: Number(pregen.generated) || 0,
    skipped: Number(pregen.skipped) || 0,
    failed: Number(pregen.failed) || 0,
    message: pregen.message || "",
  };
  rplUpdatePregenUi();
  return RPL_PREGEN.done > previousDone;
}

function rplStopPregenPolling() {
  if (RPL_PREGEN_POLL_TIMER) {
    clearTimeout(RPL_PREGEN_POLL_TIMER);
    RPL_PREGEN_POLL_TIMER = null;
  }
}

async function rplRefreshPregenImages() {
  const [msgRes] = await Promise.all([
    parallelFetch("/api/parallel/messages?limit=50"),
    rplFetchMap(),
    rplFetchPortraits(),
    rplFetchItems(),
    rplFetchScenes(),
  ]);
  if (msgRes.ok) RPL_MESSAGES = rplUnwrapMessages(msgRes.data);
  rplUpdatePanels();
  rplUpdateSceneControls();
  rplUpdateSceneFilmstrips();
  rplRenderMap();
  const gallery = document.getElementById("rpl-gallery-overlay");
  if (gallery && gallery.classList.contains("rpl-open")) rplRenderGallery();
  if (RPL_CODEX_OPEN) rplUpdateCodexPanel();
  const latestScene = rplLatestSceneMessage(RPL_MESSAGES);
  if (latestScene && latestScene.id) rplSetBackdrop(latestScene.id, true, true);
}

async function rplPollPregen() {
  if (RPL_PREGEN_POLLING) return;
  RPL_PREGEN_POLLING = true;
  const res = await parallelFetch("/api/parallel/status");
  if (res.ok && res.data) {
    const imagesChanged = rplApplyPregenStatus(res.data);
    if (imagesChanged) await rplRefreshPregenImages();
  }
  RPL_PREGEN_POLLING = false;
  if (RPL_PREGEN.running) {
    RPL_PREGEN_POLL_TIMER = setTimeout(rplPollPregen, RPL_POLL_MS);
  } else {
    rplStopPregenPolling();
  }
}

function rplStartPregenPolling() {
  if (RPL_PREGEN_POLL_TIMER || RPL_PREGEN_POLLING) return;
  RPL_PREGEN_POLL_TIMER = setTimeout(() => {
    RPL_PREGEN_POLL_TIMER = null;
    rplPollPregen();
  }, RPL_POLL_MS);
}

async function rplStartPregenImages() {
  if (RPL_PREGEN.running || RPL_API.pregen === false) return;
  const button = document.getElementById("rpl-pregen-images");
  if (button) button.disabled = true;
  const res = await parallelFetch("/api/parallel/pregen-images", { method: "POST" });
  if (res.status === 404) {
    RPL_API.pregen = false;
    rplUpdatePregenUi();
    if (typeof showToast === "function") showToast("Generate-all endpoint is not available yet.", "warn");
    return;
  }
  if (!res.ok || !res.data) {
    if (button) button.disabled = false;
    const reason = (res.data && (res.data.reason || res.data.error)) || "Could not queue missing art.";
    if (typeof showToast === "function") showToast(reason, "warn");
    return;
  }
  RPL_API.pregen = true;
  rplApplyPregenStatus(res.data);
  if (RPL_PREGEN.running) rplStartPregenPolling();
  else await rplRefreshPregenImages();
  if (typeof showToast === "function") showToast(RPL_PREGEN.message || "Missing art queued.");
}

async function rplPollStatus() {
  if (RPL_RECEIPTS_SUPPORTED) {
    await rplFetchReceipts();
    rplUpdateDeedsRow();
  }

  if (RPL_POLL_MODE === "messages") {
    const msgRes = await parallelFetch("/api/parallel/messages?limit=50");
    if (!msgRes.ok) return;
    const prevGm = rplLatestGm(RPL_MESSAGES);
    RPL_MESSAGES = rplUnwrapMessages(msgRes.data);
    const newGm = rplLatestGm(RPL_MESSAGES);
    const resolved = newGm && (!prevGm || newGm.id !== prevGm.id || newGm.content !== prevGm.content);
    if (resolved && (!RPL_PENDING_GM_SNAPSHOT || newGm.id !== RPL_PENDING_GM_SNAPSHOT.id || newGm.content !== RPL_PENDING_GM_SNAPSHOT.content)) {
      rplSetResolving(false);
      rplStopPolling();
      RPL_PENDING_GM_SNAPSHOT = null;
      await rplRefreshAfterResolve();
    }
    return;
  }

  const res = await parallelFetch("/api/parallel/status");
  if (!res.ok) {
    if (res.status === 404) {
      RPL_STATUS_SUPPORTED = false;
      RPL_POLL_MODE = "messages";
      return;
    }
    return;
  }
  rplApplyImageGenStatus(res.data);
  rplApplyPregenStatus(res.data);
  if (RPL_PREGEN.running) rplStartPregenPolling();
  const busy = !!(res.data && res.data.busy);
  if (!busy) {
    rplSetResolving(false);
    rplStopPolling();
    RPL_PENDING_GM_SNAPSHOT = null;
    await rplRefreshAfterResolve();
  }
}

function rplStartPolling() {
  rplStopPolling();
  RPL_POLL_TIMER = setInterval(rplPollStatus, RPL_POLL_MS);
  rplPollStatus();
}

async function rplRefreshAfterResolve() {
  if (RPL_RECEIPTS_SUPPORTED) await rplFetchReceipts();

  const [msgRes, stateRes, journalRes] = await Promise.all([
    parallelFetch("/api/parallel/messages?limit=50"),
    parallelFetch("/api/parallel/state"),
    parallelFetch("/api/parallel/journal?limit=30"),
  ]);

  const prevGm = rplLatestGm(RPL_MESSAGES);

  if (msgRes.ok) {
    RPL_MESSAGES = rplUnwrapMessages(msgRes.data);
  }

  if (stateRes.ok && stateRes.data) {
    RPL_STATE = stateRes.data.state_summary || stateRes.data;
  }

  await Promise.all([rplFetchCoins(), rplFetchMap(), rplFetchPortraits(), rplFetchRules(), rplFetchItems(), rplFetchScenes()]);

  if (journalRes.ok) {
    RPL_JOURNAL = rplUnwrapJournal(journalRes.data);
  }

  const newGm = rplLatestGm(RPL_MESSAGES);
  const isNew = newGm && (!prevGm || newGm.id !== prevGm.id || newGm.content !== prevGm.content);
  RPL_PENDING_CHOICE = null;
  const worldDate = stateRes.ok && stateRes.data
    ? (stateRes.data.world_date || (RPL_STATE && RPL_STATE.world_date))
    : (RPL_STATE && RPL_STATE.world_date);

  rplUpdateHud(RPL_STATE, worldDate);
  rplUpdateWorldPanel();
  if (RPL_CODEX_OPEN) rplUpdateCodexPanel();
  const prevBal = RPL_COIN_BALANCE;
  await rplFetchCoins();
  const newBal = rplCoinBalance();
  if (newBal > prevBal) rplAnimateCoins(newBal - prevBal, "earn");
  else if (newBal < prevBal) rplAnimateCoins(prevBal - newBal, "spend");
  else rplUpdateCoinsDisplay(false);

  if (newGm) {
    rplUpdateDialogue(newGm, isNew);
    const sceneMsg = rplLatestSceneMessage(RPL_MESSAGES);
    if (sceneMsg && sceneMsg.has_scene) {
      const crossfade = !!(prevGm && prevGm.id !== sceneMsg.id);
      rplSetBackdrop(sceneMsg.id, true, crossfade);
    } else if (newGm && !newGm.has_scene) {
      rplMaybePollSceneForGm(newGm);
    }
  }

  rplUpdatePanels();
  rplUpdateSceneControls();
  rplUpdateSceneFilmstrips();
  rplUpdateDeedsRow();
  rplUpdateActionChrome();
}

function rplToggleHistory(open) {
  const drawer = document.getElementById("rpl-history-drawer");
  if (!drawer) return;
  const isOpen = typeof open === "boolean" ? open : !drawer.classList.contains("rpl-open");
  drawer.classList.toggle("rpl-open", isOpen);
}

function rplScrimShouldClose() {
  return !document.querySelector(".rpl-overlay.rpl-open, .rpl-codex-drawer.rpl-open, #rpl-world-panel.rpl-open");
}

function rplSyncScrim() {
  const scrim = document.getElementById("rpl-scrim");
  if (!scrim) return;
  scrim.classList.toggle("rpl-open", !rplScrimShouldClose());
}

function rplToggleWorldPanel(open) {
  const panel = document.getElementById("rpl-world-panel");
  if (!panel) return;
  const isOpen = typeof open === "boolean" ? open : !panel.classList.contains("rpl-open");
  panel.classList.toggle("rpl-open", isOpen);
  panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  rplSyncScrim();
}

async function rplIllustrate(messageId, btn, regenerate) {
  if (!messageId) return;
  if (!RPL_IMAGE_GEN.available) {
    const reason = RPL_IMAGE_GEN.reason || "Image generation unavailable";
    rplSetSceneStatus(reason, true);
    if (typeof showToast === "function") showToast(reason, "warn");
    return;
  }
  const prompt = rplScenePromptValue();
  const buttons = [btn, document.getElementById("rpl-scene-illustrate"), document.getElementById("rpl-scene-regenerate")].filter(Boolean);
  buttons.forEach(b => { b.disabled = true; });
  rplSetSceneStatus(regenerate ? "Repainting the scene…" : "Painting the scene…", false);
  const res = await parallelFetch("/api/parallel/illustrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId, prompt: prompt || undefined, regenerate: !!regenerate }),
  });
  const data = res.data || {};
  const ok = res.ok && data.path && data.ok !== false;
  if (ok) {
    RPL_SCENE_FAIL = null;
    if (prompt) RPL_SCENE_PROMPT = prompt;
    const msg = RPL_MESSAGES.find(m => String(m.id) === String(messageId));
    if (msg) msg.has_scene = true;
    RPL_SCENE_IMG_RETRY.delete(String(messageId));
    rplRenderHistoryList();
    rplUpdateSceneControls();
    const sceneMsg = rplLatestSceneMessage(RPL_MESSAGES) || msg;
    if (sceneMsg && sceneMsg.id) {
      rplSetBackdrop(sceneMsg.id, true, true);
    }
    await rplFetchScenes();
    rplUpdateSceneFilmstrips();
    rplSetSceneStatus(data.cached ? "Scene ready (cached)." : "Scene illustrated.", false);
    if (typeof showToast === "function") showToast(data.cached ? "Scene ready" : "Scene illustrated");
  } else {
    const reason = (data && data.reason) || (res.status ? `request failed (${res.status})` : "Image API unavailable");
    RPL_SCENE_FAIL = { messageId: String(messageId), reason };
    rplSetSceneStatus(reason, true);
    rplUpdateSceneControls();
    if (typeof showToast === "function") showToast(reason, "warn");
  }
  buttons.forEach(b => { b.disabled = false; });
}

function rplAppendLocalUser(content) {
  const entry = {
    id: `local-${Date.now()}`,
    role: "user",
    content: String(content || ""),
    world_date: null,
    created_at: new Date().toISOString(),
    has_scene: false,
  };
  RPL_MESSAGES.push(entry);
  rplRenderHistoryList();
}

async function renderParallel() {
  rplStopPolling();
  rplStopPregenPolling();
  rplStopScenePoll();
  rplStopFlavorRotation();
  rplCancelTypewriter();
  RPL_BUSY = false;
  RPL_POLL_MODE = "status";
  RPL_PENDING_GM_SNAPSHOT = null;
  RPL_CODEX_OPEN = false;
  RPL_CODEX_TAB = "rules";
  RPL_RECEIPTS_SUPPORTED = true;
  RPL_RECEIPTS = [];
  RPL_PENDING_DEED_ID = null;
  RPL_MAP_AUTO_GEN = false;
  RPL_ITEMS = [];
  RPL_SCENES = [];

  const [stateRes, practiceRes] = await Promise.all([
    parallelFetch("/api/parallel/state"),
    parallelFetch("/api/practice/summary"),
  ]);
  const practiceSummary = practiceRes.ok && practiceRes.data ? practiceRes.data : {};
  const sharedTrophies = typeof arcGetTrophies === "function"
    ? arcGetTrophies()
    : Math.max(0, parseInt(localStorage.getItem("arcadeTrophies") || "0", 10) || 0);
  const playStrip = renderPlayWorkspaceStrip({
    streak: practiceSummary.streak || 0,
    trophies: sharedTrophies,
  });
  RPL_FORMING = !stateRes.ok || !stateRes.data || stateRes.data.ready === false;
  const formingReason = RPL_FORMING
    ? (stateRes.data && stateRes.data.reason) || (stateRes.ok ? "Not ready yet." : "The endpoint is not reachable yet.")
    : "";

  RPL_MESSAGES = [];
  RPL_JOURNAL = [];
  RPL_STATE = null;

  if (!RPL_FORMING) {
    const [msgRes, journalRes] = await Promise.all([
      parallelFetch("/api/parallel/messages?limit=50"),
      parallelFetch("/api/parallel/journal?limit=30"),
    ]);
    if (msgRes.ok) RPL_MESSAGES = rplUnwrapMessages(msgRes.data);
    if (journalRes.ok) RPL_JOURNAL = rplUnwrapJournal(journalRes.data);
    RPL_STATE = stateRes.data.state_summary || stateRes.data;
    await Promise.all([rplFetchCoins(), rplFetchMap(), rplFetchPortraits(), rplFetchRules(), rplFetchItems(), rplFetchScenes(), rplFetchReceipts()]);
  }

  const latestGm = rplLatestGm(RPL_MESSAGES);
  const worldDate = RPL_FORMING
    ? null
    : (stateRes.data && (stateRes.data.world_date || (RPL_STATE && RPL_STATE.world_date)));

  if (typeof document !== "undefined" && document.body) {
    document.body.classList.add("wp-parallel-restyle");
  }

  if (RPL_FORMING) {
    return `${rplStylesHtml()}${playStrip}<div class="rpl-game rpl-chrome wp-parallel-restyle">${rplFormingHtml(formingReason)}</div>`;
  }

  return `${rplStylesHtml()}${playStrip}<div class="rpl-game rpl-chrome wp-parallel-restyle">${rplGameShell(RPL_STATE, worldDate, latestGm)}</div>`;
}

function rplUpdateWorldPanel() {
  rplUpdatePanels();
}

function rplWireChronicleControls() {
  const prev = document.getElementById("rpl-chron-prev");
  const next = document.getElementById("rpl-chron-next");
  if (prev) prev.onclick = () => {
    if (RPL_CHRONICLE_PAGE_IDX > 0) { RPL_CHRONICLE_PAGE_IDX -= 1; rplUpdatePanels(); }
  };
  if (next) next.onclick = () => {
    const total = rplChronicleEntries().length;
    if (RPL_CHRONICLE_PAGE_IDX < total - 1) { RPL_CHRONICLE_PAGE_IDX += 1; rplUpdatePanels(); }
  };
  const histToggle = document.getElementById("rpl-hist-toggle");
  const histLog = document.getElementById("rpl-history-log");
  if (histToggle && histLog) {
    histToggle.onclick = () => {
      const open = histLog.hidden;
      histLog.hidden = !open;
      histToggle.textContent = open ? "hide raw log" : "raw scene log";
      if (open) {
        histLog.innerHTML = rplRenderHistoryLog(RPL_MESSAGES);
        histLog.querySelectorAll(".rpl-illustrate-btn").forEach(btn => {
          btn.onclick = () => rplIllustrate(btn.getAttribute("data-msg-id"), btn);
        });
      }
    };
  }
  const latest = document.getElementById("rpl-chron-latest");
  if (latest) latest.onclick = () => {
    RPL_CHRONICLE_PAGE_IDX = Math.max(0, rplChronicleEntries().length - 1);
    RPL_CHRONICLE_FOLLOW = true;
    rplUpdatePanels();
  };
  document.querySelectorAll("[data-quest-tab]").forEach(btn => {
    btn.onclick = () => {
      RPL_QUEST_TAB = btn.getAttribute("data-quest-tab") || "active";
      rplUpdatePanels();
    };
  });
}

function rplSyncSlideOvers() {
  const left = document.getElementById("rpl-slide-left");
  const right = document.getElementById("rpl-slide-right");
  const charBody = document.getElementById("rpl-char-body");
  const invBody = document.getElementById("rpl-inv-body");
  const questBody = document.getElementById("rpl-quest-body");
  const chronBody = document.getElementById("rpl-chronicle-body");
  if (left && charBody) {
    const invHtml = invBody
      ? `<div class="rpl-panel"><div class="rpl-panel-head"><span>Inventory</span></div><div class="rpl-panel-body">${invBody.innerHTML}</div></div>`
      : `<button type="button" class="rpl-menu-btn" data-rpl-main-tab="inventory">Open cabinet</button>`;
    left.innerHTML = `<div class="rpl-panel rpl-panel-char"><div class="rpl-panel-head"><span>Character</span></div><div class="rpl-panel-body">${charBody.innerHTML}</div></div>${invHtml}`;
  }
  if (right && questBody && chronBody) {
    right.innerHTML = `<div class="rpl-panel"><div class="rpl-panel-head"><span>Quests</span></div><div class="rpl-panel-body">${questBody.innerHTML}</div></div>
      <div class="rpl-panel"><div class="rpl-panel-head"><span>Chronicle</span></div><div class="rpl-panel-body">${chronBody.innerHTML}</div></div>`;
  }
  rplApplyPanelInertness();
}

function rplToggleOverlay(id, open) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = typeof open === "boolean" ? open : !el.classList.contains("rpl-open");
  el.classList.toggle("rpl-open", isOpen);
  rplSyncScrim();
}

function rplDrawMapFog(canvas, mapData) {
  if (!canvas || !mapData) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "rgba(12,10,8,0.88)";
  ctx.fillRect(0, 0, w, h);
  const locs = (mapData.locations || []).filter(loc => loc && (loc.known || loc.discovered));
  locs.forEach(loc => {
    if (!loc.known && !loc.discovered) return;
    const x = (Number(loc.x) || 50) / 100 * w;
    const y = (Number(loc.y) || 50) / 100 * h;
    const r = Math.min(w, h) * 0.12;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(12,10,8,0)");
    grad.addColorStop(1, "rgba(12,10,8,0.88)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  });
}

function rplRenderMapToolbar() {
  const toolbar = document.getElementById("rpl-map-toolbar");
  if (!toolbar) return;
  const hasMapImage = !!(RPL_MAP && RPL_MAP.image);
  toolbar.innerHTML = rplRenderImgToolsHtml("map", "", hasMapImage);
  rplWireImgTools(toolbar, () => document.getElementById("rpl-map-wrap"));
}

function rplWireMapPasteTarget() {
  const wrap = document.getElementById("rpl-map-wrap");
  if (!wrap) return;
  wrap._rplPasteBound = false;
  rplBindImagePasteTarget(wrap, "map", () => "");
  if (!wrap.querySelector(":scope > .rpl-paste-hint")) {
    const hint = document.createElement("span");
    hint.className = "rpl-paste-hint rpl-map-paste-hint";
    hint.textContent = "Paste or drop image";
    wrap.appendChild(hint);
  }
}

function rplRenderMap() {
  rplRenderMapToolbar();
  const wrap = document.getElementById("rpl-map-wrap");
  if (!wrap) return;
  const mapData = RPL_MAP;
  if (!mapData || mapData.ready === false) {
    wrap.innerHTML = rplMapEmptyHtml(!!RPL_API.map);
    const gen = document.getElementById("rpl-map-generate");
    if (gen) gen.onclick = () => rplGenerateMap(gen);
    rplWireMapPasteTarget();
    return;
  }
  const localMap = rplResolveLocalImage("map", "world");
  const imgUrl = escapeHtml(localMap || mapData.image || "");
  const locs = (mapData.locations || []).filter(loc => loc && (loc.known || loc.discovered));
  const curId = mapData.current_location_id;
  if (!imgUrl && !locs.length) {
    wrap.innerHTML = rplMapEmptyHtml(true);
    const gen = document.getElementById("rpl-map-generate");
    if (gen) gen.onclick = () => rplGenerateMap(gen);
    rplWireMapPasteTarget();
    return;
  }
  const markers = locs.map(loc => {
    const isCur = String(loc.id) === String(curId);
    const known = loc.known || loc.discovered;
    if (!known) return "";
    return `<div class="rpl-map-marker${isCur ? " rpl-current" : ""}" style="left:${Number(loc.x) || 50}%;top:${Number(loc.y) || 50}%" data-loc-id="${escapeHtml(String(loc.id))}" data-loc-name="${escapeHtml(loc.name || "")}" data-loc-desc="${escapeHtml(loc.description || "")}">
      <div class="rpl-map-marker-dot"></div>
      <div class="rpl-map-marker-label">${escapeHtml(loc.name || loc.id)}</div>
    </div>`;
  }).join("");
  const routes = (mapData.routes || []).map(r => {
    const from = locs.find(l => String(l.id) === String(r.from));
    const to = locs.find(l => String(l.id) === String(r.to));
    if (!from || !to) return "";
    return `<line x1="${from.x}%" y1="${from.y}%" x2="${to.x}%" y2="${to.y}%" stroke="rgba(201,162,39,0.35)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  }).join("");
  wrap.innerHTML = `${imgUrl ? `<img src="${imgUrl}" alt="" id="rpl-map-img" />` : rplMapEmptyHtml(false)}
    <svg class="rpl-map-routes" viewBox="0 0 100 100" preserveAspectRatio="none">${routes}</svg>
    <canvas class="rpl-map-fog-canvas" id="rpl-map-fog"></canvas>
    ${markers}
    <div class="rpl-map-popover" id="rpl-map-popover" hidden></div>`;
  const fog = document.getElementById("rpl-map-fog");
  if (fog) {
    const img = document.getElementById("rpl-map-img");
    const draw = () => rplDrawMapFog(fog, mapData);
    if (img) img.onload = draw;
    else draw();
    window.addEventListener("resize", draw);
  }
  wrap.querySelectorAll(".rpl-map-marker").forEach(m => {
    m.onclick = (e) => {
      e.stopPropagation();
      const pop = document.getElementById("rpl-map-popover");
      if (!pop) return;
      const name = m.getAttribute("data-loc-name") || "";
      const desc = m.getAttribute("data-loc-desc") || "";
      pop.hidden = false;
      pop.style.left = m.style.left;
      pop.style.top = m.style.top;
      pop.innerHTML = `<strong>${escapeHtml(name)}</strong>${desc ? `<br>${escapeHtml(desc)}` : ""}`;
      setTimeout(() => {
        const close = (ev) => { if (!pop.contains(ev.target)) { pop.hidden = true; document.removeEventListener("click", close); } };
        document.addEventListener("click", close);
      }, 10);
    };
  });
  rplWireMapPasteTarget();
}

async function rplGenerateMap(btn) {
  if (btn) btn.disabled = true;
  const statusEl = document.getElementById("rpl-map-gen-status");
  if (statusEl) statusEl.textContent = "Charting the world…";
  const res = await parallelFetch("/api/parallel/map/generate", { method: "POST" });
  if (res.ok) {
    if (statusEl) statusEl.textContent = "Map ready.";
    await rplFetchMap();
    rplRenderMap();
  } else {
    if (btn) btn.disabled = false;
    const reason = (res.data && (res.data.reason || res.data.error)) || "Map generation unavailable.";
    if (statusEl) statusEl.textContent = reason;
    if (typeof showToast === "function") showToast(reason, "warn");
  }
}

function rplOpenMap() {
  rplSetMainTab("map");
}

function rplCloseMap() {
  rplToggleOverlay("rpl-map-overlay", false);
}

function rplResetBendHold() {
  if (RPL_BEND_HOLD_RAF) {
    cancelAnimationFrame(RPL_BEND_HOLD_RAF);
    RPL_BEND_HOLD_RAF = null;
  }
  const btn = document.getElementById("rpl-bend-confirm");
  if (btn) {
    btn.classList.remove("rpl-hold-active");
    btn.style.setProperty("--rpl-hold-pct", "0");
  }
}

function rplClearBendOutcomeTimer() {
  if (RPL_BEND_OUTCOME_TIMER) {
    clearTimeout(RPL_BEND_OUTCOME_TIMER);
    RPL_BEND_OUTCOME_TIMER = null;
  }
}

function rplRenderBendOutcomeBanner() {
  const el = document.getElementById("rpl-bend-outcome");
  if (!el) return;
  rplClearBendOutcomeTimer();
  const o = RPL_BEND_LAST_OUTCOME;
  if (!o || Date.now() - o.at > RPL_BEND_OUTCOME_TTL_MS) {
    el.hidden = true;
    el.innerHTML = "";
    el.className = "rpl-bend-outcome";
    return;
  }
  const cls = o.kind === "applied" ? "rpl-bend-outcome-applied" : "rpl-bend-outcome-blocked";
  el.className = `rpl-bend-outcome ${cls}`;
  el.hidden = false;
  el.innerHTML = escapeHtml(o.message);
  RPL_BEND_OUTCOME_TIMER = setTimeout(() => {
    el.classList.add("rpl-bend-outcome-fade");
    setTimeout(() => {
      el.hidden = true;
      el.innerHTML = "";
      el.className = "rpl-bend-outcome";
    }, 400);
  }, RPL_BEND_OUTCOME_SHOW_MS);
}

function rplSetBendOutcome(kind, message) {
  RPL_BEND_LAST_OUTCOME = { kind, message, at: Date.now() };
  rplRenderBendOutcomeBanner();
}

function rplRenderBendEmptyState() {
  const box = document.getElementById("rpl-bend-result");
  if (!box) return;
  box.innerHTML = `<div class="rpl-bend-empty">${escapeHtml(RPL_BEND_EMPTY_COPY)}</div>`;
}

function rplBendConfirmLabel(price) {
  if (price > 50) return "Hold to confirm";
  if (price > 0) return `Confirm · ${price} coins`;
  return "Confirm change";
}

function rplWireBendHoldConfirm(price) {
  const btn = document.getElementById("rpl-bend-confirm");
  if (!btn) return;
  rplResetBendHold();
  btn.onmousedown = null;
  btn.onmouseup = null;
  btn.onmouseleave = null;
  btn.ontouchstart = null;
  btn.ontouchend = null;
  btn.ontouchcancel = null;
  btn.onclick = null;

  if (price > 50) {
    btn.classList.add("rpl-hold-confirm");
    if (!btn.querySelector(".rpl-hold-ring")) {
      btn.insertAdjacentHTML("afterbegin", `<span class="rpl-hold-ring" aria-hidden="true"></span>`);
    }
    const startHold = (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      rplResetBendHold();
      const start = performance.now();
      btn.classList.add("rpl-hold-active");
      const tick = (now) => {
        const pct = Math.min(1, (now - start) / RPL_BEND_HOLD_MS);
        btn.style.setProperty("--rpl-hold-pct", String(pct));
        if (pct >= 1) {
          rplResetBendHold();
          rplConfirmBend();
          return;
        }
        RPL_BEND_HOLD_RAF = requestAnimationFrame(tick);
      };
      RPL_BEND_HOLD_RAF = requestAnimationFrame(tick);
    };
    const endHold = () => rplResetBendHold();
    btn.onmousedown = startHold;
    btn.onmouseup = endHold;
    btn.onmouseleave = endHold;
    btn.ontouchstart = startHold;
    btn.ontouchend = endHold;
    btn.ontouchcancel = endHold;
  } else {
    btn.classList.remove("rpl-hold-confirm", "rpl-hold-active");
    const ring = btn.querySelector(".rpl-hold-ring");
    if (ring) ring.remove();
    btn.onclick = () => rplConfirmBend();
  }
}

function rplRenderBendPreview(data) {
  const box = document.getElementById("rpl-bend-result");
  const confirmBtn = document.getElementById("rpl-bend-confirm");
  if (!box) return;
  RPL_BEND_PREVIEW = data;
  if (!data) {
    rplRenderBendEmptyState();
    if (confirmBtn) { confirmBtn.disabled = true; rplResetBendHold(); }
    return;
  }
  if (data.ready === false && data.reason) {
    box.innerHTML = `<div class="rpl-not-yet">${escapeHtml(data.reason)}</div>`;
    if (confirmBtn) { confirmBtn.disabled = true; rplResetBendHold(); }
    return;
  }
  if (data.blocked) {
    const reason = data.block_reason || data.reason || "contradicts canon";
    rplSetBendOutcome("blocked", `Blocked — ${reason}`);
    box.innerHTML = `<div class="rpl-bend-blocked">Canon blocked this change: ${escapeHtml(reason)}</div>
      ${data.summary ? `<p>${escapeHtml(data.summary)}</p>` : ""}`;
    if (confirmBtn) { confirmBtn.disabled = true; rplResetBendHold(); }
    return;
  }
  const price = Number(data.price);
  const hasPrice = data.price != null && !Number.isNaN(price);
  const affected = data.affected || data.affected_scenes || "";
  const summary = data.summary || data.before_after_summary || "";
  const severity = data.severity ? String(data.severity) : "";
  const warn = data.fairness_warning || "";
  const costBlock = hasPrice
    ? (price > 50
      ? `<div class="rpl-bend-cost-prominent">${escapeHtml(String(price))} coins</div>`
      : `<p><strong>Cost:</strong> ${escapeHtml(String(price))} coins</p>`)
    : "";
  const fairnessBlock = hasPrice
    ? `<div class="rpl-bend-fairness">${price > 0
      ? "Irreversible — established facts will reshape. Coins spent are not refunded."
      : "Irreversible — established facts will reshape."}</div>`
    : "";
  box.innerHTML = `<div class="rpl-bend-preview">
    ${severity ? `<div class="rpl-bend-severity">${escapeHtml(severity)}</div>` : ""}
    ${costBlock}
    ${fairnessBlock}
    ${affected ? `<p><strong>Affected:</strong> ${escapeHtml(String(affected))}</p>` : ""}
    ${summary ? `<p><strong>Before → after:</strong> ${escapeHtml(String(summary))}</p>` : ""}
    ${warn ? `<div class="rpl-bend-warn">${escapeHtml(warn)}</div>` : ""}
  </div>`;
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = rplBendConfirmLabel(hasPrice ? price : 0);
    rplWireBendHoldConfirm(hasPrice ? price : 0);
  }
}

async function rplPreviewBend() {
  const input = document.getElementById("rpl-bend-input");
  const previewBtn = document.getElementById("rpl-bend-preview");
  const text = input ? String(input.value || "").trim() : "";
  if (!text) return;
  if (previewBtn) previewBtn.disabled = true;
  const res = await parallelFetch("/api/parallel/bend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: text }),
  });
  if (previewBtn) previewBtn.disabled = false;
  if (res.status === 404) { RPL_API.bend = false; rplRenderBendPreview({ ready: false, reason: "Modify world is not available yet." }); return; }
  if (res.ok && res.data) rplRenderBendPreview(res.data);
  else rplRenderBendPreview({ ready: false, reason: (res.data && res.data.reason) || "Could not price this bend." });
}

async function rplConfirmBend() {
  const input = document.getElementById("rpl-bend-input");
  const confirmBtn = document.getElementById("rpl-bend-confirm");
  const text = input ? String(input.value || "").trim() : "";
  const preview = RPL_BEND_PREVIEW;
  if (!text || !preview || preview.blocked) return;
  const price = Number(preview.price) || 0;
  if (confirmBtn) confirmBtn.disabled = true;
  const prevBal = rplCoinBalance();
  const res = await parallelFetch("/api/parallel/bend/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: text, price }),
  });
  if (!res.ok || !res.data) {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      rplWireBendHoldConfirm(price);
    }
    const err = (res.data && (res.data.error || res.data.reason)) || "Could not apply this change.";
    rplSetBendOutcome("blocked", err);
    if (typeof showToast === "function") showToast(err);
    return;
  }
  if (res.data.accepted === false) {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      rplWireBendHoldConfirm(price);
    }
    const reason = res.data.reason || "Change rejected.";
    rplSetBendOutcome("blocked", reason);
    if (typeof showToast === "function") showToast(reason);
    return;
  }
  const costNote = price > 0 ? ` ${price} coins deducted.` : "";
  rplSetBendOutcome("applied", `Change applied — the world is reshaping.${costNote}`);
  await rplFetchCoins();
  if (price > 0) rplAnimateCoins(price, "spend", `-${price} coins modify world`, confirmBtn);
  if (res.data.busy) {
    RPL_PENDING_GM_SNAPSHOT = rplLatestGm(RPL_MESSAGES);
    RPL_POLL_MODE = RPL_STATUS_SUPPORTED ? "status" : "messages";
    rplSetResolving(true);
    rplStartPolling();
  }
  setTimeout(() => {
    RPL_BEND_PREVIEW = null;
    rplResetBendHold();
    rplClearBendOutcomeTimer();
  }, 2600);
}

function rplApplyScreenVisibility() {
  const tab = RPL_SCREENS.includes(RPL_MAIN_TAB) ? RPL_MAIN_TAB : "play";
  RPL_MAIN_TAB = tab;
  document.querySelectorAll("[data-rpl-screen]").forEach(el => {
    el.hidden = el.getAttribute("data-rpl-screen") !== tab;
  });
  const play = document.getElementById("rpl-play-stage");
  const mod = document.getElementById("rpl-modify-wrap");
  if (play) play.hidden = tab !== "play";
  if (mod) mod.hidden = tab !== "modify";
  document.querySelectorAll("[data-rpl-main-tab]").forEach(btn => {
    const active = btn.dataset.rplMainTab === tab;
    btn.classList.toggle("active", active);
    btn.classList.toggle("rpl-main-tab-active", active);
  });
  const game = document.querySelector(".rpl-game");
  if (game) game.setAttribute("data-rpl-screen", tab);
}

function rplSetMainTab(tab) {
  RPL_MAIN_TAB = RPL_SCREENS.includes(tab) ? tab : "play";
  localStorage.setItem("rplMainTab", RPL_MAIN_TAB);
  rplApplyScreenVisibility();
  rplToggleOverlay("rpl-map-overlay", false);
  if (RPL_MAIN_TAB === "modify") rplOpenBend();
  if (RPL_MAIN_TAB === "map") {
    rplRenderMap();
    rplFetchMap().then(async () => {
      rplRenderMap();
      const needsImage = RPL_API.map && RPL_MAP && !RPL_MAP.image && !rplResolveLocalImage("map", "world");
      if (needsImage && !RPL_MAP_AUTO_GEN) {
        RPL_MAP_AUTO_GEN = true;
        const statusEl = document.getElementById("rpl-map-gen-status");
        if (statusEl) statusEl.textContent = "Charting the world…";
        await rplGenerateMap(null);
      }
    });
  }
  if (RPL_MAIN_TAB === "inventory") rplWireInventoryInspect();
  if (RPL_MAIN_TAB === "shop" || RPL_MAIN_TAB === "home") rplUpdateAuxScreens();
}

function rplOpenBend() {
  RPL_BEND_PREVIEW = null;
  RPL_MAIN_TAB = "modify";
  localStorage.setItem("rplMainTab", "modify");
  rplApplyScreenVisibility();
  const input = document.getElementById("rpl-bend-input");
  const confirmBtn = document.getElementById("rpl-bend-confirm");
  if (input && !input.value) {/* keep draft if switching tabs */}
  rplRenderBendEmptyState();
  if (confirmBtn) {
    confirmBtn.disabled = !RPL_BEND_PREVIEW;
    if (!confirmBtn.classList.contains("rpl-hold-confirm")) {
      confirmBtn.textContent = "Confirm change";
    }
  }
  rplRenderBendOutcomeBanner();
  if (input) input.focus();
}

function rplCloseBend() {
  RPL_BEND_PREVIEW = null;
  rplResetBendHold();
  rplClearBendOutcomeTimer();
  rplSetMainTab("play");
}

function rplRenderGallery() {
  const body = document.getElementById("rpl-gallery-body");
  if (!body) return;
  const chars = (RPL_STATE && RPL_STATE.characters) || [];
  if (!chars.length) {
    body.innerHTML = `<div class="rpl-inv-empty">No characters met yet.</div>`;
    return;
  }
  body.innerHTML = `<div class="rpl-gallery-grid">${chars.map(ch => {
    const url = rplPortraitUrl(ch.id);
    const img = url ? `<img src="${escapeHtml(rplBustUrl(url))}" alt="" />` : rplSilhouetteSvg(ch.name || ch.id);
    const role = ch.role || ch.archetype || "";
    const appearance = rplCharacterAppearance(ch.id, RPL_STATE);
    const paintLabel = url ? "Regenerate portrait" : "Paint portrait";
    return `<div class="rpl-gallery-card" data-char-id="${escapeHtml(String(ch.id))}">
      <div class="rpl-gallery-card-img rpl-paste-target" data-char-id="${escapeHtml(String(ch.id))}">${img}<span class="rpl-paste-hint">Paste or drop image</span></div>
      <div class="rpl-gallery-name">${escapeHtml(ch.name || ch.id)}</div>
      <div class="rpl-gallery-role">${escapeHtml(role)}</div>
      ${appearance ? `<div class="rpl-gallery-appearance">${escapeHtml(appearance)}</div>` : ""}
      ${rplRenderImgToolsHtml("portrait", ch.id, !!url)}
      <button type="button" class="rpl-gallery-paint" data-char-id="${escapeHtml(String(ch.id))}" data-has-portrait="${url ? "1" : "0"}"${RPL_IMAGE_GEN.available ? "" : " disabled"}>${paintLabel}</button>
      <div class="rpl-gallery-status" id="rpl-gallery-status-${escapeHtml(String(ch.id))}"></div>
    </div>`;
  }).join("")}</div>`;
  if (!RPL_IMAGE_GEN.available) {
    body.insertAdjacentHTML("beforeend", `<div class="rpl-scene-status rpl-scene-error" style="margin-top:8px">${escapeHtml(RPL_IMAGE_GEN.reason || "Portrait generation unavailable")} — paste or upload still works.</div>`);
  }
  body.querySelectorAll(".rpl-gallery-card-img").forEach(box => {
    const cid = box.getAttribute("data-char-id");
    if (cid) {
      box._rplPasteBound = false;
      rplBindImagePasteTarget(box, "portrait", () => cid);
    }
  });
  rplWireImgTools(body, (row) => {
    const card = row.closest(".rpl-gallery-card");
    return card && card.querySelector(".rpl-gallery-card-img");
  });
  body.querySelectorAll(".rpl-gallery-paint").forEach(btn => {
    btn.onclick = async () => {
      const cid = btn.getAttribute("data-char-id");
      if (!cid || !RPL_IMAGE_GEN.available) return;
      const statusEl = document.getElementById(`rpl-gallery-status-${cid}`);
      const hasPortrait = btn.getAttribute("data-has-portrait") === "1";
      btn.disabled = true;
      if (statusEl) statusEl.textContent = hasPortrait ? "Repainting portrait…" : "Painting portrait…";
      const res = await parallelFetch("/api/parallel/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_id: cid, regenerate: hasPortrait }),
      });
      btn.disabled = false;
      if (res.ok && res.data && res.data.path) {
        if (statusEl) statusEl.textContent = res.data.cached ? "Portrait ready (cached)." : "Portrait ready.";
        await rplFetchPortraits();
        rplRenderGallery();
        rplUpdatePanels();
      } else {
        const reason = (res.data && res.data.reason) || "Portrait unavailable.";
        if (statusEl) statusEl.textContent = reason;
        if (typeof showToast === "function") showToast(reason, "warn");
      }
    };
  });
}

function rplOpenGallery() {
  rplToggleOverlay("rpl-gallery-overlay", true);
  rplFetchPortraits().then(() => rplRenderGallery());
}

function rplCloseGallery() {
  rplToggleOverlay("rpl-gallery-overlay", false);
}

function rplWireRails() {
  const toggleLeft = document.getElementById("rpl-toggle-left");
  const toggleRight = document.getElementById("rpl-toggle-right");
  if (toggleLeft) toggleLeft.onclick = () => {
    RPL_LEFT_COLLAPSED = !RPL_LEFT_COLLAPSED;
    const rail = document.getElementById("rpl-rail-left");
    if (rail) rail.classList.toggle("rpl-collapsed", RPL_LEFT_COLLAPSED);
    toggleLeft.classList.toggle("rpl-active", !RPL_LEFT_COLLAPSED);
  };
  if (toggleRight) toggleRight.onclick = () => {
    RPL_RIGHT_COLLAPSED = !RPL_RIGHT_COLLAPSED;
    const rail = document.getElementById("rpl-rail-right");
    if (rail) rail.classList.toggle("rpl-collapsed", RPL_RIGHT_COLLAPSED);
    toggleRight.classList.toggle("rpl-active", !RPL_RIGHT_COLLAPSED);
  };
  document.querySelectorAll("[data-rpl-expand]").forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute("data-rpl-expand");
      if (target === "inv") {
        rplSetMainTab("inventory");
        return;
      }
      if (target === "char" || target === "inv") {
        RPL_LEFT_COLLAPSED = false;
        const rail = document.getElementById("rpl-rail-left");
        if (rail) rail.classList.remove("rpl-collapsed");
      } else {
        RPL_RIGHT_COLLAPSED = false;
        const rail = document.getElementById("rpl-rail-right");
        if (rail) rail.classList.remove("rpl-collapsed");
      }
    };
  });
  const charPanel = document.getElementById("rpl-char-panel");
  if (charPanel) charPanel.onclick = (e) => {
    if (e.target.closest(".rpl-gallery-paint")) return;
    rplOpenGallery();
  };
}

function rplWireScreenNav() {
  const game = document.querySelector(".rpl-game");
  if (!game || game._rplNavBound) return;
  game._rplNavBound = true;
  game.addEventListener("click", (e) => {
    const member = e.target.closest("[data-party-id]");
    if (member && game.contains(member)) {
      rplOpenGallery();
      return;
    }
    const btn = e.target.closest("[data-rpl-main-tab]");
    if (!btn || !game.contains(btn)) return;
    e.preventDefault();
    rplSetMainTab(btn.dataset.rplMainTab);
  });
}

function rplWireOverlays() {
  const mapBtn = document.getElementById("rpl-map-btn");
  const mapClose = document.getElementById("rpl-map-close");
  const bendPreview = document.getElementById("rpl-bend-preview");
  const galleryClose = document.getElementById("rpl-gallery-close");
  const scrim = document.getElementById("rpl-scrim");
  const codexBtn = document.getElementById("rpl-codex-btn");
  const codexClose = document.getElementById("rpl-codex-close");
  const settingsBtn = document.getElementById("rpl-settings-btn");
  const settingsClose = document.getElementById("rpl-settings-close");
  const worldMenuBtn = document.getElementById("rpl-world-menu-btn");
  const worldOpenCodex = document.getElementById("rpl-world-open-codex");
  const worldOpenMap = document.getElementById("rpl-world-open-map");
  const pregenImages = document.getElementById("rpl-pregen-images");
  const worldOpenSettings = document.getElementById("rpl-world-open-settings");
  rplWireScreenNav();
  if (mapBtn) mapBtn.onclick = () => rplOpenMap();
  if (mapClose) mapClose.onclick = () => rplCloseMap();
  if (bendPreview) bendPreview.onclick = () => rplPreviewBend();
  if (galleryClose) galleryClose.onclick = () => rplCloseGallery();
  if (codexBtn) codexBtn.onclick = () => rplOpenCodex();
  if (codexClose) codexClose.onclick = () => rplCloseCodex();
  if (settingsBtn) settingsBtn.onclick = () => rplOpenSettings();
  if (settingsClose) settingsClose.onclick = () => rplCloseSettings();
  if (worldMenuBtn) worldMenuBtn.onclick = () => rplToggleWorldPanel();
  if (worldOpenCodex) worldOpenCodex.onclick = () => { rplToggleWorldPanel(false); rplOpenCodex(); };
  if (worldOpenMap) worldOpenMap.onclick = () => { rplToggleWorldPanel(false); rplOpenMap(); };
  if (pregenImages) pregenImages.onclick = () => rplStartPregenImages();
  if (worldOpenSettings) worldOpenSettings.onclick = () => { rplToggleWorldPanel(false); rplOpenSettings(); };
  rplUpdatePregenUi();
  if (scrim) scrim.onclick = () => {
    rplCloseCodex();
    rplToggleWorldPanel(false);
    rplCloseMap();
    rplCloseGallery();
    rplCloseSettings();
  };
  document.querySelectorAll(".rpl-overlay-close").forEach(btn => {
    btn.onclick = () => {
      if (btn.id === "rpl-codex-close") { rplCloseCodex(); return; }
      const overlay = btn.closest(".rpl-overlay");
      if (overlay) overlay.classList.remove("rpl-open");
      rplSyncScrim();
    };
  });
  rplWireCodexControls();
}

function wireParallel() {
  if (RPL_FORMING) return;

  const input = document.getElementById("rpl-input");
  if (!input) return;

  RPL_CMD_INDEX = -1;
  RPL_CMD_DRAFT = "";

  const latestGm = rplLatestGm(RPL_MESSAGES);
  rplUpdateDialogue(latestGm, false);
  if (latestGm && latestGm.has_scene) {
    rplSetBackdrop(latestGm.id, true, false);
  }
  rplUpdateHud(RPL_STATE, RPL_STATE && RPL_STATE.world_date);
  rplUpdateWorldPanel();
  rplWireRails();
  rplWireOverlays();
  rplWireSceneControls();
  rplWireSceneFilmstrip(document.getElementById("rpl-viewport-scene-film"));
  rplApplyDefaultRailCollapse();
  rplApplyLocalPrefs();
  rplSyncSlideOvers();
  rplApplyPanelInertness();
  rplApplyScreenVisibility();
  rplUpdateAuxScreens();
  rplWirePartyPlate();
  if (RPL_MAIN_TAB === "map") rplRenderMap();
  if (!window._rplInertResize) {
    window._rplInertResize = () => {
      rplApplyPanelInertness();
      rplSyncAllMarginalia();
    };
    window.addEventListener("resize", window._rplInertResize);
  }

  rplFetchReceipts().then(() => {
    rplUpdateDeedsRow();
    rplSyncAllMarginalia();
  });

  if (!window._rplReceiptsVisibility) {
    window._rplReceiptsVisibility = () => {
      if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB !== "Parallel") return;
      rplFetchReceipts().then(rplUpdateDeedsRow);
    };
    document.addEventListener("visibilitychange", window._rplReceiptsVisibility);
  }

  document.querySelectorAll(".rpl-verb-chip").forEach(chip => {
    chip.onclick = () => {
      const verb = chip.getAttribute("data-verb") || "";
      if (!verb) return;
      input.value = verb.endsWith(" ") ? verb : `${verb} `;
      input.focus();
      RPL_CMD_INDEX = -1;
      RPL_CMD_DRAFT = input.value;
    };
  });

  const sayBtn = document.getElementById("rpl-say-btn");
  if (sayBtn) {
    sayBtn.onclick = () => rplSubmitAction(input.value);
  }

  rplUpdateActionChrome();

  input.addEventListener("input", () => {
    if (RPL_CMD_INDEX !== -1) RPL_CMD_INDEX = -1;
    RPL_CMD_DRAFT = input.value;
    if (RPL_PENDING_DEED_ID) {
      const deed = RPL_DEEDS.find(d => d.id === RPL_PENDING_DEED_ID);
      if (!deed || input.value !== deed.prefill) RPL_PENDING_DEED_ID = null;
    }
  });

  input.onkeydown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const hist = rplLoadHistory();
      if (!hist.length) return;
      if (RPL_CMD_INDEX === -1) RPL_CMD_DRAFT = input.value;
      RPL_CMD_INDEX = Math.min(RPL_CMD_INDEX + 1, hist.length - 1);
      input.value = hist[hist.length - 1 - RPL_CMD_INDEX] || "";
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (RPL_CMD_INDEX < 0) return;
      if (RPL_CMD_INDEX === 0) {
        RPL_CMD_INDEX = -1;
        input.value = RPL_CMD_DRAFT;
        return;
      }
      RPL_CMD_INDEX -= 1;
      const hist = rplLoadHistory();
      input.value = hist[hist.length - 1 - RPL_CMD_INDEX] || "";
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    rplSubmitAction(input.value);
  };

  rplResumeBusyIfNeeded();

  if (!window._rplEscHandler) {
    window._rplEscHandler = (e) => {
      if (e.key !== "Escape") return;
      const codex = document.getElementById("rpl-codex-panel");
      if (codex && codex.classList.contains("rpl-open")) {
        e.preventDefault();
        rplCloseCodex();
        return;
      }
      const worldPanel = document.getElementById("rpl-world-panel");
      if (worldPanel && worldPanel.classList.contains("rpl-open")) {
        e.preventDefault();
        rplToggleWorldPanel(false);
        return;
      }
      const settingsOverlay = document.getElementById("rpl-settings-overlay");
      if (settingsOverlay && settingsOverlay.classList.contains("rpl-open")) {
        e.preventDefault();
        rplCloseSettings();
      }
    };
    document.addEventListener("keydown", window._rplEscHandler);
  }
}

async function rplResumeBusyIfNeeded() {
  const statusRes = await parallelFetch("/api/parallel/status");
  if (statusRes.ok && statusRes.data) {
    rplApplyImageGenStatus(statusRes.data);
    rplApplyPregenStatus(statusRes.data);
    if (RPL_PREGEN.running) rplStartPregenPolling();
    if (statusRes.data.busy) {
      RPL_STATUS_SUPPORTED = true;
      RPL_POLL_MODE = "status";
      RPL_PENDING_GM_SNAPSHOT = rplLatestGm(RPL_MESSAGES);
      rplSetResolving(true);
      rplStartPolling();
      return;
    }
  }
  if (statusRes.status === 404) {
    RPL_STATUS_SUPPORTED = false;
    RPL_POLL_MODE = "messages";
  }
  rplUpdateSceneControls();
}

async function rplSubmitAction(raw) {
  const message = String(raw || "").trim();
  const input = document.getElementById("rpl-input");
  if (!message || !input || input.disabled) return;

  const pendingDeed = RPL_PENDING_DEED_ID
    ? RPL_DEEDS.find(d => d.id === RPL_PENDING_DEED_ID)
    : null;
  const isGatedDeed = !!(pendingDeed && message === pendingDeed.prefill && rplDeedUnlocked(pendingDeed));
  RPL_PENDING_DEED_ID = null;

  rplSaveHistory(message);
  RPL_CMD_INDEX = -1;
  RPL_CMD_DRAFT = "";
  input.value = "";
  rplAppendLocalUser(message);
  RPL_PENDING_CHOICE = message;
  rplUpdateStoryPanel();
  rplSetResolving(true);

  if (isGatedDeed) rplPostDeedReceipt(pendingDeed.label);

  const res = await parallelFetch("/api/parallel/say", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.data) {
    rplSetResolving(false);
    RPL_PENDING_CHOICE = null;
    const fail = {
      id: `err-${Date.now()}`,
      role: "gm",
      content: "(Could not send — check that the app is running and try again.)",
      has_scene: false,
    };
    RPL_MESSAGES.push(fail);
    rplUpdateDialogue(fail, true);
    rplRenderHistoryList();
    rplUpdateStoryPanel();
    return;
  }

  const data = res.data;
  if (!res.ok || data.accepted === false) {
    rplSetResolving(false);
    RPL_PENDING_CHOICE = null;
    const reason = data.reason || data.error || "Could not send that action.";
    if (typeof showToast === "function") showToast(reason, "warn");
    rplUpdateStoryPanel();
    return;
  }

  const asyncMode = data.busy === true || (data.accepted === true && !data.reply);

  if (asyncMode) {
    RPL_PENDING_GM_SNAPSHOT = rplLatestGm(RPL_MESSAGES);
    if (RPL_STATUS_SUPPORTED !== false) RPL_POLL_MODE = "status";
    else RPL_POLL_MODE = "messages";
    rplStartPolling();
    rplUpdatePanels();
    return;
  }

  RPL_PENDING_CHOICE = null;

  rplSetResolving(false);

  if (data.reply) {
    const gm = {
      id: data.message_id || `gm-${Date.now()}`,
      role: "gm",
      content: data.reply,
      world_date: data.world_date || null,
      has_scene: !!data.has_scene,
    };
    RPL_MESSAGES.push(gm);
    rplUpdateDialogue(gm, true);
    if (gm.has_scene) {
      rplSetBackdrop(gm.id, true, true);
    } else {
      rplMaybePollSceneForGm(gm);
    }
    rplRenderHistoryList();
  }

  if (data.state_summary) {
    RPL_STATE = data.state_summary;
    rplUpdateHud(RPL_STATE, data.world_date);
    rplUpdateWorldPanel();
  }
}
