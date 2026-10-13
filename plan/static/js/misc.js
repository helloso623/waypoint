// --- About ---------------------------------------------------------

async function renderAbout() {
  const settings = await api("/api/about");
  return `
    <div class="card">
      <label style="font-size:11px;color:var(--ink-muted);">Project description</label>
      <textarea id="about-description" style="min-height:100px;">${escapeHtml(settings.project_description || "")}</textarea>
      <label style="font-size:11px;color:var(--ink-muted);margin-top:8px;display:block;">Why I'm doing this</label>
      <textarea id="about-why">${escapeHtml(settings.why || "")}</textarea>
      <label style="font-size:11px;color:var(--ink-muted);margin-top:8px;display:block;">About me</label>
      <textarea id="about-bio">${escapeHtml(settings.bio || "")}</textarea>
      <div style="margin-top:12px;"><button type="button" class="primary" id="save-about">Save</button></div>
    </div>
    <p class="stub">The Competitions tab reads a project description directly from its own box for now —
    this About page is your reference copy / what gets used if that's ever wired to auto-fill.
    Model routing, budget, integrations, and data controls live on the <strong>Settings</strong> tab.</p>`;
}

function wireAbout() {
  document.getElementById("save-about").onclick = async () => {
    await api("/api/about", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_description: document.getElementById("about-description").value,
        why: document.getElementById("about-why").value,
        bio: document.getElementById("about-bio").value,
      }),
    });
  };
}

async function renderObsidian() {
  const settings = await api("/api/about");
  return `
    <div class="card">
      <strong style="font-size:13px;">Notes for Claude</strong>
      <p class="stub" style="margin:4px 0 8px;">Jot down anything you want added or changed as you think of it --
        no need to say it in chat right away. Checked and worked from whenever you're back here.</p>
      <div data-rich-for="claude-notes-body" style="margin-top:6px;">${RICH_TOOLBAR_HTML}</div>
      <div id="claude-notes-body" class="rich-editable" contenteditable="true" data-placeholder="Things to add/change/fix...">${settings.claude_notes || ""}</div>
    </div>
    <div class="card stub">
      <strong>Obsidian vault</strong><br><br>
      Every saved day, goal, and subagent run is mirrored to Markdown in <code>obsidian_vault/</code>
      (or wherever <code>OBSIDIAN_VAULT_PATH</code> points in your .env) -- nothing to install, it's
      written automatically. Open that folder as a vault in Obsidian:<br><br>
      - <code>Daily/&lt;date&gt;.md</code> -- day notes<br>
      - <code>Goals/&lt;title&gt;.md</code> -- goals + chunks<br>
      - <code>Project Plan.md</code> -- the living roadmap, edit it directly, has a Scratch section for rough notes<br>
      - <code>Agent Activity.md</code> -- live log of what every subagent just did<br><br>
      This is currently one-way (DB -> Markdown, overwritten on save). Edits made inside Obsidian
      don't flow back yet -- that needs a file-watcher, which is a natural next build step.
    </div>`;
}

function wireObsidian() {
  wireRichToolbar("claude-notes-body");
  const box = document.getElementById("claude-notes-body");
  box.onblur = () => api("/api/about", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claude_notes: box.innerHTML.trim() }),
  });
}


// Prompts tab: one editable settings-backed document, seeded server-side with a researched
// prompt-engineering cheat sheet on first open (claude_notes 2026-07-16).
const PROMPT_STARTERS = [
  { label: "Daily brief", text: "Give me a 5-line brief for today: overdue, due, and the one thing that matters." },
  { label: "Plan the next hour", text: "Look at my open tasks and propose the next hour. Be concrete." },
  { label: "Rewrite this", text: "Rewrite the following so it is clearer and shorter:\n\n" },
];

async function renderPromptsPage() {
  const page = await api("/api/prompts-page");
  const chips = PROMPT_STARTERS.map((s, i) =>
    `<button type="button" class="secondary prompt-starter" data-prompt-starter="${i}">${escapeHtml(s.label)}</button>`
  ).join("");
  return `
    <p class="page-title">Prompts</p>
    <p class="page-subtitle">Your prompt cheat sheet -- pre-seeded with researched best practices, fully yours to
    rewrite. Saved in the app's own database, nothing external.</p>
    <div class="card">
      <div class="prompt-starters" aria-label="Prompt starters">${chips}
        <button type="button" class="secondary" id="prompts-page-blank">Start from blank</button>
      </div>
      <textarea id="prompts-page-editor" style="width:100%; min-height:65vh; font-family:ui-monospace, monospace; font-size:13px; line-height:1.5;">${(page.content || "").replace(/</g, "&lt;")}</textarea>
      <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
      <button type="button" class="primary" id="prompts-page-save">Save</button>
        <span id="prompts-page-status" class="stub"></span>
      </div>
    </div>`;
}

function wirePromptsPage() {
  const editor = document.getElementById("prompts-page-editor");
  document.querySelectorAll("[data-prompt-starter]").forEach(btn => {
    btn.onclick = () => {
      const starter = PROMPT_STARTERS[Number(btn.dataset.promptStarter)];
      if (!editor || !starter) return;
      editor.value = editor.value.trim() ? `${editor.value.trim()}\n\n${starter.text}` : starter.text;
      editor.focus();
    };
  });
  const blank = document.getElementById("prompts-page-blank");
  if (blank && editor) blank.onclick = () => { editor.value = ""; editor.focus(); };
  document.getElementById("prompts-page-save").onclick = async () => {
    const status = document.getElementById("prompts-page-status");
    await api("/api/prompts-page", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: document.getElementById("prompts-page-editor").value }),
    });
    status.textContent = "Saved.";
    setTimeout(() => { status.textContent = ""; }, 2000);
  };
}

// --- Global game layer (WaypointGame) ------------------------------------

const GAME_QUEST_POOL = {
  pulse2: { label: "Log 3 day pulses", target: 3 },
  tasks3: { label: "Finish 2 tasks", target: 2 },
  addtask2: { label: "Add 2 tasks", target: 2 },
  reflect1: { label: "Write a reflection", target: 1 },
  contract1: { label: "Keep today's contract", target: 1 },
  contact1: { label: "Log a contact follow-up", target: 1 },
  match1: { label: "Play a brain game", target: 1 },
  paint6: { label: "Paint 2 honest hours", target: 2 },
  showup1: { label: "Show up: pulse + one painted hour", target: 1 },
  estimate1: { label: "Estimate how long a task will take", target: 1 },
  actual1: { label: "Log how long a task actually took", target: 1 },
  book1: { label: "Hub reading", target: 1 },
  blueprint1: { label: "Blueprint grade", target: 1 },
  capture3: { label: "Capture 2 notes", target: 2 },
  overdue1: { label: "Clear 1 overdue task", target: 1 },
  talk1: { label: "Follow up with companion", target: 1 },
};
const GAME_QUEST_JUMP_TABS = {
  pulse2: "Today",
  tasks3: "Tasks",
  addtask2: "Tasks",
  reflect1: "Thinking",
  contract1: "Today",
  contact1: "Contacts",
  match1: "Practice",
  paint6: "Today",
  showup1: "Today",
  estimate1: "Tasks",
  actual1: "Tasks",
  book1: "Hub",
  blueprint1: "Practice",
  capture3: "Hub",
  overdue1: "Tasks",
  talk1: "Home",
};

const GAME_QUEST_REWARD_XP = 40;
const GAME_CHEST_GEM_REWARD = 1;
const GAME_CHEST_XP_REWARD = 120;
const GAME_STREAK_MILESTONES = [7, 30, 100];
const GAME_COMBO_WINDOW_MS = 10 * 60 * 1000;
const GAME_COMBO_BONUS_XP = 15;
const GAME_LEDGER_MAX = 40;
const GAME_STREAK_SHIELD_MILESTONES = [7, 30];
const GAME_OFFLINE_BOUNTY_BONUS_PCT = 0.2;
const GAME_FULL_STACK_MIN_ZONES = 3;
const GAME_FULL_STACK_GEM_MONTHLY_CAP = 3;
const GAME_EVENING_RITUAL_HOUR = 21;
const GAME_DAY_SIGIL_KEY = "gameDaySigilShown";
const GAME_QUEST_ROTATION_KEY = "gameQuestRotationV2";
const GAME_DAY_SIGIL_MIN_MS = 2500;
const GAME_DAY_SIGIL_MAX_MS = 3500;

const GAME_OFFLINE_BOUNTY_POOL = [
  { key: "offline_pulse", label: "Log a pulse", target: 1, questKey: "pulse2" },
  { key: "offline_task", label: "Complete a task", target: 1, questKey: "tasks3" },
  { key: "offline_paint", label: "Paint 1 hour", target: 1, questKey: "paint6" },
];

let GAME_XP_FLOATER_QUEUE = [];
let GAME_XP_FLOATER_BUSY = false;
let GAME_QUEST_NUDGE_SHOWN = false;
let GAME_HUD_INJECTED = false;
let GAME_POLL_BASELINE = null;
let GAME_DAY_SIGIL_ACTIVE = false;

function gameReadInt(key, fallback) {
  try {
    const v = parseInt(localStorage.getItem(key) || "", 10);
    return Number.isFinite(v) ? Math.max(0, v) : fallback;
  } catch (_) { return fallback; }
}

function gameWriteInt(key, value) {
  try { localStorage.setItem(key, String(Math.max(0, Math.floor(value)))); } catch (_) {}
}

function gameReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) { return fallback; }
}

function gameWriteJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function gamePrefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function gameIsOfflineMode() {
  const usage = HUD_DATA.usage || {};
  if (hudTruthySetting(usage.offline_mode)) return true;
  const label = resolveModelChipLabel(usage);
  return label === "Offline" || label.startsWith("Offline");
}

function gameLedgerPush(entry) {
  const list = gameReadJson("gameRewardLedger", []);
  if (!Array.isArray(list)) return;
  list.unshift({
    ts: Date.now(),
    type: entry.type || "event",
    amount: entry.amount != null ? entry.amount : null,
    reason: entry.reason || "",
    meta: entry.meta || null,
  });
  gameWriteJson("gameRewardLedger", list.slice(0, GAME_LEDGER_MAX));
}

function gameReadStreakShields() {
  return Math.min(1, gameReadInt("gameStreakShields", 0));
}

function gameGrantStreakShield(reason) {
  if (gameReadStreakShields() >= 1) return false;
  gameWriteInt("gameStreakShields", 1);
  gameLedgerPush({ type: "shield", amount: 1, reason: reason || "Streak shield earned" });
  showToast("Streak shield banked — saves one missed day", "good");
  return true;
}

function gameReadStreakOverlay() {
  return gameReadInt("gameStreakOverlay", 0);
}

function gameEffectiveStreak(apiStreak) {
  const overlay = gameReadStreakOverlay();
  if (overlay > 0) return Math.max(overlay, apiStreak || 0);
  return apiStreak || 0;
}

function gameMaybeConsumeStreakShield(prevStreak, apiStreak) {
  const prev = Math.max(0, Number(prevStreak) || 0);
  const cur = Math.max(0, Number(apiStreak) || 0);
  if (prev < 2 || cur >= prev) return false;
  const broke = cur === 0 || cur < prev - 1;
  if (!broke || gameReadStreakShields() < 1) return false;
  gameWriteInt("gameStreakShields", 0);
  gameWriteInt("gameStreakOverlay", prev);
  gameLedgerPush({ type: "shield", amount: -1, reason: `Shield used — streak held at ${prev}d` });
  showToast(`Streak shield used — flame stays at ${prev}d`, "good");
  return true;
}

function gameCheckStreakShieldMilestones(streak) {
  const s = streak || 0;
  const granted = new Set(gameReadJson("gameShieldMilestonesGranted", []));
  GAME_STREAK_SHIELD_MILESTONES.forEach(m => {
    if (s < m || granted.has(m)) return;
    granted.add(m);
    gameWriteJson("gameShieldMilestonesGranted", [...granted].sort((a, b) => a - b));
    gameGrantStreakShield(`${m}-day milestone`);
  });
}

function gameReadXpComboLast() {
  return gameReadInt("gameXpComboLastTs", 0);
}

function gameApplyXpCombo(baseAmount) {
  const now = Date.now();
  const last = gameReadXpComboLast();
  const inWindow = last > 0 && (now - last) < GAME_COMBO_WINDOW_MS;
  gameWriteInt("gameXpComboLastTs", now);
  if (!inWindow) return { amount: baseAmount, bonus: 0, combo: false };
  return { amount: baseAmount + GAME_COMBO_BONUS_XP, bonus: GAME_COMBO_BONUS_XP, combo: true };
}

function gameAwardGems(n, reason) {
  const add = Math.max(0, Math.floor(Number(n) || 0));
  if (!add) return;
  const prev = gameReadInt("gameGems", 0);
  gameWriteInt("gameGems", prev + add);
  gameLedgerPush({ type: "gem", amount: add, reason: reason || "Gems" });
  gameUpdateHud();
  window.dispatchEvent(new CustomEvent("waypoint:gems", { detail: { gems: prev + add } }));
}

function gameNoteReceiptStamp(receipt) {
  if (!receipt) return false;
  const source = String(receipt.source || "system").trim() || "system";
  const kind = String(receipt.kind || "unknown").trim() || "unknown";
  const stampKey = `${source}:${kind}`;
  const stamps = gameReadJson("gameReceiptStamps", []);
  if (!Array.isArray(stamps)) return false;
  if (stamps.includes(stampKey)) return false;
  stamps.push(stampKey);
  gameWriteJson("gameReceiptStamps", stamps);
  gameLedgerPush({ type: "stamp", amount: 1, reason: `New stamp: ${stampKey}` });
  if (!gamePrefersReducedMotion()) celebrate({ particleCount: 24, duration: 800 });
  showToast(`New receipt stamp — ${source}`, "good");
  return true;
}

function gameCheckFullStackDayCombo(receipts, today) {
  const day = today || localYmd();
  if (gameReadJson("gameFullStackTriumphDate", "") === day) return;
  const rows = Array.isArray(receipts) ? receipts : [];
  const zones = new Set();
  rows.forEach(r => {
    if (!r || gameReceiptDayKey(r.created_at) !== day) return;
    const src = String(r.source || "").trim();
    if (src) zones.add(src);
  });
  if (zones.size < GAME_FULL_STACK_MIN_ZONES) return;
  const monthKey = day.slice(0, 7);
  const gemState = gameReadJson("gameFullStackGemsMonth", { month: "", count: 0 });
  const count = gemState.month === monthKey ? (gemState.count || 0) : 0;
  gameWriteJson("gameFullStackTriumphDate", day);
  gameLedgerPush({ type: "combo", amount: zones.size, reason: `Full stack day — ${zones.size} zones` });
  if (typeof window.momentOfTriumph === "function") {
    window.momentOfTriumph({
      title: "FULL STACK DAY",
      subtitle: `${zones.size} zones touched — honest cross-world progress`,
      workspace: "plan",
    });
  }
  if (count < GAME_FULL_STACK_GEM_MONTHLY_CAP) {
    gameAwardGems(1, "Full stack day combo");
    gameWriteJson("gameFullStackGemsMonth", { month: monthKey, count: count + 1 });
  }
}

function gameEnsureOfflineBounties(dateStr) {
  const today = dateStr || localYmd();
  let state = gameReadJson("gameOfflineBounties", null);
  if (!state || state.date !== today) {
    state = { date: today, progress: {}, claimed: {} };
    gameWriteJson("gameOfflineBounties", state);
  }
  if (!state.progress || typeof state.progress !== "object") state.progress = {};
  if (!state.claimed || typeof state.claimed !== "object") state.claimed = {};
  return state;
}

function gameSyncOfflineBounties(questState) {
  if (!gameIsOfflineMode()) return;
  const bountyState = gameEnsureOfflineBounties();
  const qState = questState || gameEnsureQuestState();
  let changed = false;
  GAME_OFFLINE_BOUNTY_POOL.forEach(b => {
    if (bountyState.claimed[b.key]) return;
    const cur = Math.min(b.target, qState.counters[b.questKey] || 0);
    if ((bountyState.progress[b.key] || 0) !== cur) {
      bountyState.progress[b.key] = cur;
      changed = true;
    }
    if (cur >= b.target && !bountyState.claimed[b.key]) {
      bountyState.claimed[b.key] = true;
      changed = true;
      gameLedgerPush({ type: "bounty", amount: 1, reason: `Offline bounty: ${b.label}` });
      showToast(`Offline bounty cleared — ${b.label}`, "good");
    }
  });
  if (changed) gameWriteJson("gameOfflineBounties", bountyState);
}

function gameClosingRitualDoneToday() {
  return gameReadJson("gameCloseDayDone", "") === localYmd();
}

function gameMarkClosingRitualDone() {
  gameWriteJson("gameCloseDayDone", localYmd());
  gameLedgerPush({ type: "ritual", amount: null, reason: "Close the day ritual" });
}

function gameIsEveningRitualWindow() {
  return new Date().getHours() >= GAME_EVENING_RITUAL_HOUR;
}

function gameDaySigilShownToday() {
  try { return localStorage.getItem(GAME_DAY_SIGIL_KEY) === localYmd(); } catch (_) { return false; }
}

function gameMarkDaySigilShown() {
  try { localStorage.setItem(GAME_DAY_SIGIL_KEY, localYmd()); } catch (_) {}
}

function gameDismissDaySigil(overlay, card, timerId) {
  if (!overlay || !overlay.isConnected) return;
  if (timerId) clearTimeout(timerId);
  if (GAME_DAY_SIGIL_ACTIVE !== overlay) return;
  GAME_DAY_SIGIL_ACTIVE = false;
  const reduced = gamePrefersReducedMotion();
  if (reduced) {
    overlay.remove();
    return;
  }
  card.classList.remove("game-day-sigil-card--in");
  card.classList.add("game-day-sigil-card--out");
  setTimeout(() => overlay.remove(), 180);
}

function gameMaybeShowDaySigil() {
  if (GAME_DAY_SIGIL_ACTIVE || gameDaySigilShownToday()) return;
  gameMarkDaySigilShown();

  const state = gameEnsureQuestState();
  const done = gameQuestsCompletedCount(state);
  const questTotal = gameTodayQuestKeys().length;
  const allDone = gameAllQuestsDone(state);
  const apiStreak = (HUD_DATA.practice && HUD_DATA.practice.streak) || gameReadInt("gameStreakLastSeen", 0);
  const streak = gameEffectiveStreak(apiStreak);
  const reduced = gamePrefersReducedMotion();
  const dwellMs = reduced
    ? 1400
    : GAME_DAY_SIGIL_MIN_MS + Math.floor(Math.random() * (GAME_DAY_SIGIL_MAX_MS - GAME_DAY_SIGIL_MIN_MS + 1));

  ensureGameLayerStyles();
  const overlay = document.createElement("div");
  overlay.className = "game-day-sigil-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Today's streak and quests");
  const chestLine = !allDone && !state.claimed
    ? `<div class="game-day-sigil-chest">&#128230; Chest possible — finish all three</div>`
    : "";
  overlay.innerHTML = `
    <div class="game-day-sigil-card" tabindex="-1">
      <div class="game-day-sigil-flame" aria-hidden="true">&#128293;</div>
      <div class="game-day-sigil-streak">${streak > 0 ? `${streak}-day streak` : "Start today's streak"}</div>
      <div class="game-day-sigil-quests">&#9876; Quests ${done}/${questTotal}</div>
      ${chestLine}
      <div class="game-day-sigil-hint">Tap to dismiss</div>
    </div>`;
  document.body.appendChild(overlay);
  GAME_DAY_SIGIL_ACTIVE = overlay;
  const card = overlay.querySelector(".game-day-sigil-card");
  if (!reduced) requestAnimationFrame(() => card.classList.add("game-day-sigil-card--in"));
  else card.classList.add("game-day-sigil-card--in");

  let timerId = null;
  const dismiss = () => gameDismissDaySigil(overlay, card, timerId);
  timerId = setTimeout(dismiss, dwellMs);
  overlay.addEventListener("click", dismiss);
}

function gameLevelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
}

function gameXpForLevel(level) {
  const l = Math.max(1, level);
  return 60 * (l - 1) * (l - 1);
}

function gameXpProgress(xp) {
  const level = gameLevelFromXp(xp);
  const cur = gameXpForLevel(level);
  const next = gameXpForLevel(level + 1);
  const span = Math.max(1, next - cur);
  return { level, cur, next, pct: Math.min(100, Math.max(0, ((xp - cur) / span) * 100)) };
}

function gameHashDate(dateStr) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = ((h << 5) - h + dateStr.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function gameReadQuestSignals() {
  const today = typeof localYmd === "function" ? localYmd() : "";
  const parsed = gameReadJson("waypointQuestSignalsV1", null);
  if (!parsed || typeof parsed !== "object") return { date: today };
  return parsed;
}

function gameWriteQuestSignals(partial) {
  const today = typeof localYmd === "function" ? localYmd() : "";
  const current = gameReadQuestSignals();
  const next = { ...current, ...partial, date: today };
  gameWriteJson("waypointQuestSignalsV1", next);
  return next;
}

function gameCompanionSnippet() {
  try {
    const raw = JSON.parse(localStorage.getItem("companionChatHistory") || "null");
    const lists = [];
    if (Array.isArray(raw)) lists.push(raw);
    if (Array.isArray(raw?.messages)) lists.push(raw.messages);
    if (raw?.conversations && typeof raw.conversations === "object") {
      Object.values(raw.conversations).forEach(entry => {
        if (Array.isArray(entry?.messages)) lists.push(entry.messages);
      });
    }
    const user = lists.flat().reverse().find(item => item && item.role === "user" && String(item.content || "").trim());
    const text = String(user?.content || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 42) : "";
  } catch (_) {
    return "";
  }
}

function gameQuestEligible(key) {
  if (!GAME_QUEST_POOL[key]) return false;
  const signals = gameReadQuestSignals();
  if (key === "blueprint1") {
    if (signals.hasBlueprints) return true;
    try {
      const receipts = JSON.parse(localStorage.getItem("wp:automation-receipts") || "[]");
      if (Array.isArray(receipts) && receipts.length) return true;
    } catch (_) {}
    try {
      const practice = window.WaypointHabits?.snapshot?.()?.counts?.practice || {};
      if (Object.keys(practice).some(name => /blueprint|automation/i.test(name))) return true;
    } catch (_) {}
    return false;
  }
  if (key === "book1") {
    if (signals.hasReading) return true;
    try {
      const tabs = window.WaypointHabits?.snapshot?.()?.counts?.tabs || {};
      return (Number(tabs.Hub) || 0) > 0;
    } catch (_) {
      return false;
    }
  }
  if (key === "talk1") {
    return !!gameCompanionSnippet() || !!signals.hasCompanion;
  }
  return true;
}

function gameQuestLabel(key) {
  const meta = GAME_QUEST_POOL[key];
  if (!meta) return key;
  const signals = gameReadQuestSignals();
  if (key === "overdue1" && signals.openTitle) {
    return `Finish overdue: ${String(signals.openTitle).slice(0, 36)}`;
  }
  if (key === "talk1") {
    const snippet = gameCompanionSnippet();
    if (snippet) return `Act on: “${snippet}”`;
  }
  return meta.label;
}

function gameSelectDailyQuests(dateStr, count) {
  const keys = Object.keys(GAME_QUEST_POOL).filter(gameQuestEligible);
  const coreKeys = ["pulse2", "tasks3", "addtask2", "reflect1", "contract1", "match1", "showup1"].filter(key => keys.includes(key));
  let seed = gameHashDate(dateStr);
  const pool = keys.slice();
  const picked = [];
  const take = Math.max(1, Math.min(keys.length, Number(count) || 3));
  let habitOrder = [];
  try {
    const habits = window.WaypointHabits;
    const snapshot = habits?.snapshot?.();
    if (snapshot?.updatedAt && typeof habits.suggestQuestKeys === "function") {
      habitOrder = habits.suggestQuestKeys(keys, keys.length);
    }
  } catch (_) {
    habitOrder = [];
  }
  const habitRank = new Map(habitOrder.map((key, index) => [key, index]));
  const corePick = coreKeys.length
    ? (habitOrder.length
      ? coreKeys.slice().sort((a, b) => (
        (habitRank.get(a) ?? keys.length) - (habitRank.get(b) ?? keys.length)
        || ((keys.indexOf(a) + seed) % keys.length) - ((keys.indexOf(b) + seed) % keys.length)
      ))[0]
      : coreKeys[seed % coreKeys.length])
    : pool[0];
  if (corePick && pool.includes(corePick)) {
    picked.push(corePick);
    pool.splice(pool.indexOf(corePick), 1);
  }
  seed = Math.imul(seed, 1103515245) + 12345;
  while (picked.length < take && pool.length) {
    const weights = pool.map(key => {
      const rank = habitRank.get(key);
      let weight = rank == null ? 1 : 1 + Math.max(0, habitOrder.length - rank);
      if (key === "overdue1" && gameReadQuestSignals().overdueCount > 0) weight += 6;
      if (key === "talk1" && gameCompanionSnippet()) weight += 3;
      if (key === "pulse2" || key === "showup1" || key === "reflect1") weight += 2;
      if (key === "contract1" || key === "contact1" || key === "addtask2") weight += 2;
      return weight;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let roll = (seed >>> 0) % totalWeight;
    let idx = 0;
    while (idx < weights.length - 1 && roll >= weights[idx]) {
      roll -= weights[idx];
      idx++;
    }
    picked.push(pool.splice(idx, 1)[0]);
    seed = Math.imul(seed, 1103515245) + 12345;
  }
  return picked;
}

function gameQuestSelectionLimit() {
  if (window.WaypointLoot && typeof window.WaypointLoot.questLimit === "function") {
    return window.WaypointLoot.questLimit();
  }
  return 3;
}

function gameAvailableQuestKeys(dateStr) {
  const date = dateStr || localYmd();
  const cached = gameReadJson(GAME_QUEST_ROTATION_KEY, null);
  let keys;
  // Today's rotation is reused as long as it IS today's and its keys are real quests. It used
  // to be re-rolled whenever a cached key became INELIGIBLE, but eligibility depends on live
  // app state (having overdue tasks, someone to talk to), so it flips between sessions. A
  // re-roll produced five different keys, and gameEnsureQuestState then dropped every accepted
  // quest that was not among them -- which is why the accept prompt came back on the next login.
  if (cached?.date === date && Array.isArray(cached.keys)) {
    const valid = cached.keys.filter(key => GAME_QUEST_POOL[key]);
    if (valid.length) keys = valid;
  }
  if (!keys) {
    keys = gameSelectDailyQuests(date, 5);
    gameWriteJson(GAME_QUEST_ROTATION_KEY, { date, keys });
  }
  ["estimate1", "actual1"].forEach(key => {
    if (GAME_QUEST_POOL[key] && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

function gameReadXpToday() {
  const today = localYmd();
  try {
    const raw = JSON.parse(localStorage.getItem("gameXpToday") || "null");
    if (raw && raw.date === today) return Math.max(0, parseInt(raw.amount, 10) || 0);
  } catch (_) {}
  return 0;
}

function gameAddXpToday(amount) {
  const today = localYmd();
  const cur = gameReadXpToday();
  try {
    localStorage.setItem("gameXpToday", JSON.stringify({ date: today, amount: cur + Math.max(0, amount) }));
  } catch (_) {}
}

function gameReadSeenLevels() {
  try {
    const parsed = JSON.parse(localStorage.getItem("seenLevels") || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n)) : []);
  } catch (_) { return new Set(); }
}

function gameMarkSeenLevel(level) {
  const seen = gameReadSeenLevels();
  seen.add(level);
  try { localStorage.setItem("seenLevels", JSON.stringify([...seen].sort((a, b) => a - b))); } catch (_) {}
}

function gameReadSeenStreakMilestones() {
  try {
    const parsed = JSON.parse(localStorage.getItem("seenStreakMilestones") || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n)) : []);
  } catch (_) { return new Set(); }
}

function gameMarkSeenStreakMilestone(m) {
  const seen = gameReadSeenStreakMilestones();
  seen.add(m);
  try { localStorage.setItem("seenStreakMilestones", JSON.stringify([...seen].sort((a, b) => a - b))); } catch (_) {}
}

function gameEnsureQuestState(dateStr) {
  const today = dateStr || localYmd();
  let state;
  try { state = JSON.parse(localStorage.getItem("gameQuests") || "null"); } catch (_) { state = null; }
  if (!state || state.date !== today) {
    state = { date: today, counters: {}, awarded: {}, claimed: false, selected: gameSelectDailyQuests(today, 3) };
    try { localStorage.setItem("gameQuests", JSON.stringify(state)); } catch (_) {}
  }
  if (!state.counters || typeof state.counters !== "object") state.counters = {};
  if (!state.awarded || typeof state.awarded !== "object") state.awarded = {};
  if (state.claimed == null) state.claimed = false;
  const available = gameAvailableQuestKeys(today);
  const previousSelection = Array.isArray(state.selected) ? state.selected.join("|") : null;
  if (!Array.isArray(state.selected)) state.selected = gameSelectDailyQuests(today, 3);
  // Keep an accepted quest even if it has fallen out of today's rotation. Only drop keys that
  // are not real quests any more; filtering against the rotation is what lost the acceptance.
  state.selected = state.selected
    .filter(key => GAME_QUEST_POOL[key])
    .slice(0, gameQuestSelectionLimit());
  if (!state.selected.length) state.selected = gameSelectDailyQuests(today, 3).filter(key => available.includes(key));
  if (previousSelection !== state.selected.join("|")) gameSaveQuestState(state);
  return state;
}

function gameSaveQuestState(state) {
  try { localStorage.setItem("gameQuests", JSON.stringify(state)); } catch (_) {}
}

function gameTodayQuestKeys() {
  return gameEnsureQuestState().selected.slice();
}

function gameQuestDone(state, key) {
  const meta = GAME_QUEST_POOL[key];
  if (!meta) return false;
  return (state.counters[key] || 0) >= meta.target;
}

function gameQuestsCompletedCount(state) {
  return gameTodayQuestKeys().filter(k => gameQuestDone(state, k)).length;
}

function gameAllQuestsDone(state) {
  const keys = gameTodayQuestKeys();
  return keys.length >= 3 && keys.every(k => gameQuestDone(state, k));
}

function gameParsePaintHours(summary) {
  const m = String(summary || "").match(/(\d+(?:\.\d+)?)\s*hours?\s*painted/i);
  return m ? parseFloat(m[1]) : null;
}

function gameReceiptDayKey(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return String(createdAt).slice(0, 10);
  return localYmd(d);
}

function ensureGameLayerStyles() {
  if (document.getElementById("game-layer-styles")) return;
  const style = document.createElement("style");
  style.id = "game-layer-styles";
  style.textContent = `
    .hud-game-cluster { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
    .hud-xp-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 7px;
      border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--bg-card) 90%, var(--accent) 8%);
      cursor: pointer; font-size: 10px; color: var(--ink-secondary); max-width: 100%;
    }
    .hud-xp-btn:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); color: var(--ink-primary); }
    .hud-xp-level { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .hud-xp-bar { display: block; width: 36px; height: 3px; border-radius: 999px; background: color-mix(in srgb, var(--ink-muted) 25%, transparent); overflow: hidden; }
    .hud-xp-fill { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 200ms ease; }
    .hud-gems-count { font-size: 10px; color: var(--ink-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .hud-quests-btn {
      display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px;
      border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      cursor: pointer; font-size: 10px; color: var(--ink-secondary); position: relative;
    }
    .hud-quests-btn:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--border)); color: var(--ink-primary); }
    .hud-quests-btn--near-miss {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
      color: var(--ink-primary);
      animation: game-quest-near-miss 1.8s ease-in-out infinite;
    }
    .hud-quest-near-miss-tag {
      font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      color: color-mix(in srgb, var(--accent) 80%, var(--ink-primary));
    }
    @keyframes game-quest-near-miss {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); }
      50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent); }
    }
    .hud-game-chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
      border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      cursor: pointer; font-size: 10px; color: var(--ink-secondary); white-space: nowrap;
    }
    .hud-game-chip:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--border)); color: var(--ink-primary); }
    .hud-game-chip--evening { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .hud-game-chip--offline { border-color: color-mix(in srgb, var(--status-warning) 35%, var(--border)); }
    .hud-streak-shield { font-size: 9px; opacity: 0.9; }
    .game-xp-floater--combo {
      border-color: color-mix(in srgb, var(--status-warning) 55%, var(--border));
      background: color-mix(in srgb, var(--bg-card) 82%, var(--status-warning) 18%);
    }
    .game-ledger-row { font-size: 11px; line-height: 1.35; padding: 4px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent); }
    .game-ledger-row:last-child { border-bottom: none; }
    .game-ledger-time { font-size: 10px; color: var(--ink-muted); }
    .game-stamp-grid { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0; }
    .game-stamp-chip { font-size: 9px; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--border); color: var(--ink-muted); }
    .game-bounty-row { margin: 5px 0; }
    .hud-quest-dots { display: inline-flex; gap: 3px; align-items: center; }
    .hud-quest-dot { width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--ink-muted) 35%, transparent); }
    .hud-quest-dot--done { background: var(--status-good); box-shadow: 0 0 4px color-mix(in srgb, var(--status-good) 55%, transparent); }
    .hud-chest-btn {
      margin-left: 2px; padding: 0 4px; border: none; background: none; cursor: pointer; font-size: 12px; line-height: 1;
      filter: drop-shadow(0 0 4px color-mix(in srgb, var(--status-warning) 45%, transparent)); animation: game-chest-glow 1.6s ease-in-out infinite;
      transition: transform 150ms var(--ease-snap, cubic-bezier(0.34, 1.45, 0.64, 1));
    }
    .hud-chest-btn:hover { transform: scale(1.08); }
    @keyframes game-chest-glow { 0%, 100% { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--status-warning) 35%, transparent)); } 50% { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--status-warning) 75%, transparent)); } }
    .game-xp-floater {
      position: fixed; z-index: 100060; pointer-events: none; padding: 4px 9px; border-radius: 999px;
      font-size: 11px; font-weight: 600; color: var(--ink-primary); border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
      background: color-mix(in srgb, var(--bg-card) 88%, var(--accent) 12%); box-shadow: 0 6px 20px rgba(0,0,0,0.28);
      white-space: nowrap; opacity: 0; transform: translate(4px, 8px);
    }
    .game-xp-floater--in { opacity: 1; transform: translate(0, 0); transition: opacity 160ms ease, transform 180ms var(--ease-out, ease); }
    .game-xp-floater--out { opacity: 0; transform: translate(-2px, -10px); transition: opacity 160ms ease, transform 180ms var(--ease-out, ease); }
    .game-quest-row { margin: 6px 0; }
    .game-quest-bar { height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--ink-muted) 20%, transparent); overflow: hidden; margin-top: 4px; }
    .game-quest-fill { height: 100%; background: var(--accent); border-radius: inherit; transition: width 180ms ease, background 160ms ease; }
    .game-chest-overlay {
      position: fixed; inset: 0; z-index: 100070; display: flex; align-items: center; justify-content: center;
      background: rgba(6, 8, 12, 0.55); pointer-events: auto;
    }
    .game-chest-stage { position: relative; width: 120px; height: 96px; }
    .game-chest-lid {
      position: absolute; left: 8px; right: 8px; top: 18px; height: 28px; border-radius: 6px 6px 2px 2px;
      background: linear-gradient(180deg, #d4a03a, #a16207); border: 2px solid #854d0e;
      transform-origin: left bottom; transform: rotateX(0deg);
    }
    .game-chest-box {
      position: absolute; left: 8px; right: 8px; bottom: 8px; height: 44px; border-radius: 4px 4px 8px 8px;
      background: linear-gradient(180deg, #ca8a04, #92400e); border: 2px solid #854d0e;
    }
    .game-chest-gem {
      position: absolute; left: 50%; top: 42px; transform: translate(-50%, 0) scale(0.2); opacity: 0; font-size: 28px;
    }
    .game-chest-overlay--open .game-chest-lid { animation: game-chest-lid 800ms ease forwards; }
    .game-chest-overlay--open .game-chest-gem { animation: game-chest-gem 800ms ease 200ms forwards; }
    @keyframes game-chest-lid {
      0% { transform: perspective(200px) rotateX(0deg); }
      55% { transform: perspective(200px) rotateX(-118deg); }
      100% { transform: perspective(200px) rotateX(-118deg); }
    }
    @keyframes game-chest-gem {
      0% { opacity: 0; transform: translate(-50%, 8px) scale(0.2); }
      45% { opacity: 1; transform: translate(-50%, -18px) scale(1.1); }
      100% { opacity: 1; transform: translate(-50%, -10px) scale(1); }
    }
    .game-streak-milestones { display: flex; gap: 6px; margin: 8px 0 4px; flex-wrap: wrap; }
    .game-streak-milestone {
      font-size: 10px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--ink-muted);
    }
    .game-streak-milestone--hit { color: var(--status-good); border-color: color-mix(in srgb, var(--status-good) 45%, var(--border)); }
    .game-streak-milestone--next {
      color: var(--ink-primary); border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
    }
    @media (prefers-reduced-motion: reduce) {
      .hud-chest-btn { animation: none !important; }
      .hud-quests-btn--near-miss { animation: none !important; box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent); }
      .game-chest-overlay--open .game-chest-lid, .game-chest-overlay--open .game-chest-gem { animation-duration: 0.35s; animation-delay: 0s; }
      .game-xp-floater--in, .game-xp-floater--out { transition: none !important; }
    }
    body.calm-mode .hud-game-cluster { display: inline-flex !important; }
    .game-day-sigil-overlay {
      position: fixed; inset: 0; z-index: 100055; display: flex; align-items: flex-start; justify-content: center;
      padding: 72px 16px 16px; pointer-events: none;
    }
    .game-day-sigil-card {
      pointer-events: auto; cursor: pointer; max-width: 320px; width: 100%;
      padding: 14px 16px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
      background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
      box-shadow: 0 12px 36px rgba(0,0,0,0.32); text-align: center;
      opacity: 0; transform: translateY(-6px);
      transition: opacity 200ms ease, transform 220ms ease;
    }
    .game-day-sigil-card--in { opacity: 1; transform: translateY(0); }
    .game-day-sigil-card--out { opacity: 0; transform: translateY(-4px); transition-duration: 180ms; }
    .game-day-sigil-flame { font-size: 28px; line-height: 1; margin-bottom: 6px; }
    .game-day-sigil-streak { font-size: 13px; font-weight: 700; color: var(--ink-primary); margin-bottom: 4px; }
    .game-day-sigil-quests { font-size: 12px; color: var(--ink-secondary); margin-bottom: 4px; }
    .game-day-sigil-chest {
      font-size: 11px; color: color-mix(in srgb, var(--status-warning) 75%, var(--ink-secondary));
      margin-top: 2px;
    }
    .game-day-sigil-hint { font-size: 10px; color: var(--ink-muted); margin-top: 8px; }
    @media (prefers-reduced-motion: reduce) {
      .game-day-sigil-card { transition-duration: 120ms; transform: none; }
      .game-day-sigil-card--in, .game-day-sigil-card--out { transform: none; }
    }`;
  document.head.appendChild(style);
}

function injectGameHud() {
  if (GAME_HUD_INJECTED || document.getElementById("hud-xp-btn")) return;
  const metrics = document.querySelector(".hud-metrics");
  const anchor = document.getElementById("hud-agent-chip");
  if (!metrics) return;
  ensureGameLayerStyles();
  const cluster = document.createElement("div");
  cluster.className = "hud-game-cluster";
  cluster.id = "hud-game-cluster";
  cluster.innerHTML = `
    <button type="button" class="hud-loot-cluster" id="hud-xp-btn" title="Open rewards and loot">
      <span class="hud-loot-coins" id="hud-coins-label">&#9673; —</span>
      <span class="hud-loot-divider" aria-hidden="true"></span>
      <span class="hud-xp-level" id="hud-xp-level">Lv 1</span>
      <span class="hud-xp-bar" aria-hidden="true"><span class="hud-xp-fill" id="hud-xp-fill" style="width:0%"></span></span>
      <span class="hud-gems-count" id="hud-gems-count">&#128142; 0</span>
    </button>
    <button type="button" class="hud-quests-btn" id="hud-quests-btn" title="Daily quests">
      <span id="hud-quests-label">&#9876; 0/3</span>
      <span class="hud-quest-dots" id="hud-quest-dots" aria-hidden="true"></span>
    </button>
    <button type="button" class="hud-chest-btn" id="hud-chest-btn" hidden title="Claim today's quest chest" aria-label="Claim today's quest chest">&#128230;</button>`;
  if (anchor) metrics.insertBefore(cluster, anchor);
  else metrics.appendChild(cluster);
  GAME_HUD_INJECTED = true;
}

function gameShowXpFloater(amount, reason, anchorPoint, opts) {
  if (!amount || amount <= 0) return;
  GAME_XP_FLOATER_QUEUE.push({ amount, reason: reason || "", anchorPoint, combo: !!(opts && opts.combo) });
  gameDrainXpFloaterQueue();
}

function gameDrainXpFloaterQueue() {
  if (GAME_XP_FLOATER_BUSY || !GAME_XP_FLOATER_QUEUE.length) return;
  GAME_XP_FLOATER_BUSY = true;
  const item = GAME_XP_FLOATER_QUEUE.shift();
  if (!item) { GAME_XP_FLOATER_BUSY = false; return; }
  const reduced = gamePrefersReducedMotion();
  const anchor = item.anchorPoint || document.getElementById("hud-xp-btn");
  const chip = document.createElement("div");
  chip.className = "game-xp-floater" + (item.combo ? " game-xp-floater--combo" : "");
  chip.textContent = item.combo
    ? `COMBO +${item.amount} XP${item.reason ? ` · ${item.reason}` : ""}`
    : `+${item.amount} XP${item.reason ? ` · ${item.reason}` : ""}`;
  document.body.appendChild(chip);
  if (anchor && typeof anchor.getBoundingClientRect === "function") {
    const rect = anchor.getBoundingClientRect();
    chip.style.left = `${Math.max(8, rect.left + rect.width / 2 - 40)}px`;
    chip.style.top = `${Math.max(8, rect.top - 8)}px`;
  } else if (item.anchorPoint && item.anchorPoint.x != null) {
    chip.style.left = `${item.anchorPoint.x}px`;
    chip.style.top = `${item.anchorPoint.y}px`;
  } else {
    chip.style.right = "16px";
    chip.style.bottom = "88px";
  }
  if (!reduced) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => chip.classList.add("game-xp-floater--in"));
    });
  } else {
    chip.classList.add("game-xp-floater--in");
  }
  const dwellMs = reduced ? 700 : 950;
  const exitMs = reduced ? 80 : 180;
  setTimeout(() => {
    if (!reduced) chip.classList.add("game-xp-floater--out");
    else chip.style.opacity = "0";
    setTimeout(() => {
      chip.remove();
      GAME_XP_FLOATER_BUSY = false;
      gameDrainXpFloaterQueue();
    }, exitMs);
  }, dwellMs);
}

function gameCheckLevelUp(prevXp, nextXp) {
  const prevLevel = gameLevelFromXp(prevXp);
  const nextLevel = gameLevelFromXp(nextXp);
  if (nextLevel <= prevLevel) return;
  const seen = gameReadSeenLevels();
  for (let lvl = prevLevel + 1; lvl <= nextLevel; lvl += 1) {
    if (seen.has(lvl)) continue;
    gameMarkSeenLevel(lvl);
    if (typeof window.momentOfTriumph === "function") {
      window.momentOfTriumph({ title: `LEVEL ${lvl}`, subtitle: "Honest progress — earned from real actions", workspace: "plan" });
    }
  }
}

function gameAwardQuestCompletions(state) {
  const keys = gameTodayQuestKeys();
  let changed = false;
  keys.forEach(key => {
    if (!gameQuestDone(state, key) || state.awarded[key]) return;
    state.awarded[key] = true;
    changed = true;
    window.WaypointHabits?.observe("quest-completed", key);
    window.WaypointGame.awardXp(GAME_QUEST_REWARD_XP, GAME_QUEST_POOL[key].label);
  });
  if (changed) {
    gameSaveQuestState(state);
  }
  // A single pursuit still earns its XP, but the day only lands once every
  // selected pursuit is done. gameMarkTodayComplete is idempotent per date.
  if (gameAllQuestsDone(state)) gameMarkTodayComplete();
}

function gameMarkTodayComplete() {
  const today = localYmd();
  let alreadyComplete = false;
  try { alreadyComplete = localStorage.getItem("gameTodayCompleteDate") === today; } catch (_) {}
  try { localStorage.setItem("gameTodayCompleteDate", today); } catch (_) {}
  gameSyncTodayCompleteCue();
  if (!alreadyComplete && typeof window.momentOfTriumph === "function") {
    window.momentOfTriumph({
      title: "DAY COMPLETE",
      subtitle: "Every daily pursuit finished",
      accent: "#facc15",
      workspace: "home",
      nonBlocking: true,
    });
  }
}

function gameSyncTodayCompleteCue() {
  const complete = gameTodayComplete();
  document.body.classList.toggle("game-today-complete", complete);
  const todayHeader = document.getElementById("pln-today-header");
  todayHeader?.classList.toggle("pln-today-header--quest-complete", complete);
  if (complete && todayHeader && !document.getElementById("pln-today-quest-complete")) {
    todayHeader.querySelector(".pln-today-header-date")?.insertAdjacentHTML("afterend", '<span class="pln-today-quest-complete" id="pln-today-quest-complete">✓ TODAY COMPLETE</span>');
  } else if (!complete) {
    document.getElementById("pln-today-quest-complete")?.remove();
  }
  document.querySelector("[data-loot-profile]")?.classList.toggle("loot-profile-chip--complete", complete);
  if (complete) {
    const questsBtn = document.getElementById("hud-quests-btn");
    questsBtn?.classList.remove("hud-quests-btn--near-miss");
    questsBtn?.querySelector(".hud-quest-near-miss-tag")?.remove();
  }
  if (typeof updateLauncherQuestRadar === "function" && typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Home") {
    updateLauncherQuestRadar();
  }
}

function gameTodayComplete() {
  try { return localStorage.getItem("gameTodayCompleteDate") === localYmd(); } catch (_) { return false; }
}

function gameUpdateHudChips() {
  const cluster = document.getElementById("hud-game-cluster");
  if (!cluster) return;

  let closeChip = document.getElementById("hud-close-day-chip");
  const showClose = gameIsEveningRitualWindow() && !gameClosingRitualDoneToday();
  if (showClose && !closeChip) {
    closeChip = document.createElement("button");
    closeChip.type = "button";
    closeChip.className = "hud-game-chip hud-game-chip--evening";
    closeChip.id = "hud-close-day-chip";
    closeChip.title = "Close the day — review quests or Today";
    closeChip.textContent = "Close the day";
    closeChip.onclick = e => {
      e.stopPropagation();
      gameMarkClosingRitualDone();
      closeChip.remove();
      const questsBtn = document.getElementById("hud-quests-btn");
      if (questsBtn) {
        openHudDropdown(questsBtn, gameQuestDropdownHtml());
      } else if (typeof goToTab === "function") {
        goToTab("Today");
      }
    };
    cluster.appendChild(closeChip);
  } else if (!showClose && closeChip) {
    closeChip.remove();
  }

  let bountyChip = document.getElementById("hud-offline-bounty-chip");
  const offline = gameIsOfflineMode();
  if (offline && !bountyChip) {
    bountyChip = document.createElement("button");
    bountyChip.type = "button";
    bountyChip.className = "hud-game-chip hud-game-chip--offline";
    bountyChip.id = "hud-offline-bounty-chip";
    bountyChip.title = "Offline bounty board — +20% XP while local-only";
    bountyChip.textContent = "Bounties";
    bountyChip.onclick = e => {
      e.stopPropagation();
      if (HUD_DROPDOWN) { closeHudDropdown(); return; }
      openHudDropdown(bountyChip, gameOfflineBountyDropdownHtml());
    };
    cluster.appendChild(bountyChip);
  } else if (!offline && bountyChip) {
    bountyChip.remove();
  }
}

function gameUpdateHud() {
  injectGameHud();
  const xp = gameReadInt("gameXp", 0);
  const gems = gameReadInt("gameGems", 0);
  const prog = gameXpProgress(xp);
  const state = gameEnsureQuestState();
  const questKeys = gameTodayQuestKeys();
  const done = gameQuestsCompletedCount(state);
  const allDone = gameAllQuestsDone(state);
  const nearMiss = questKeys.length >= 3 && done === questKeys.length - 1 && !allDone && !state.claimed;

  const levelEl = document.getElementById("hud-xp-level");
  const fillEl = document.getElementById("hud-xp-fill");
  if (levelEl) levelEl.textContent = `Lv ${prog.level}`;
  if (fillEl) fillEl.style.width = `${prog.pct.toFixed(1)}%`;

  const gemsEl = document.getElementById("hud-gems-count");
  if (gemsEl) {
    gemsEl.hidden = false;
    gemsEl.textContent = `💎 ${gems.toLocaleString()}`;
  }

  const questsBtn = document.getElementById("hud-quests-btn");
  const questsLabel = document.getElementById("hud-quests-label");
  if (questsLabel) {
    questsLabel.textContent = nearMiss ? `⚔ ${done}/${questKeys.length} · 1 left` : `⚔ ${done}/${questKeys.length}`;
  }
  if (questsBtn) {
    questsBtn.classList.toggle("hud-quests-btn--near-miss", nearMiss);
    let tag = questsBtn.querySelector(".hud-quest-near-miss-tag");
    if (nearMiss && !tag) {
      tag = document.createElement("span");
      tag.className = "hud-quest-near-miss-tag";
      tag.textContent = "1 left";
      questsBtn.appendChild(tag);
    } else if (!nearMiss && tag) {
      tag.remove();
    }
  }

  const dotsEl = document.getElementById("hud-quest-dots");
  if (dotsEl) {
    dotsEl.innerHTML = questKeys.map(k => `<span class="hud-quest-dot ${gameQuestDone(state, k) ? "hud-quest-dot--done" : ""}"></span>`).join("");
  }

  const chestBtn = document.getElementById("hud-chest-btn");
  if (chestBtn) chestBtn.hidden = !(allDone && !state.claimed);

  gameUpdateHudChips();
  gameMaybeQuestNudge(state);
  gameSyncTodayCompleteCue();
  window.dispatchEvent(new CustomEvent("waypoint:game-state"));
}

function gameLedgerDropdownHtml() {
  const rows = gameReadJson("gameRewardLedger", []);
  const list = Array.isArray(rows) ? rows : [];
  const body = list.length
    ? list.map(entry => {
      const when = entry.ts ? new Date(entry.ts).toLocaleString() : "—";
      const amt = entry.amount != null ? (entry.amount > 0 ? `+${entry.amount}` : String(entry.amount)) : "";
      const label = [entry.type, amt, entry.reason].filter(Boolean).join(" · ");
      return `<div class="game-ledger-row"><div>${escapeHtml(label)}</div><div class="game-ledger-time">${escapeHtml(when)}</div></div>`;
    }).join("")
    : `<div class="stub" style="padding:4px 0;">No rewards logged yet — XP, gems, and chests appear here.</div>`;
  return `
    <div class="hud-dropdown-title">Reward ledger</div>
    <div class="stub" style="padding:2px 0 6px; line-height:1.45;">Last ${GAME_LEDGER_MAX} honest XP, gem, chest, and ritual events (local only).</div>
    ${body}`;
}

function gameStampAlbumHtml() {
  const stamps = gameReadJson("gameReceiptStamps", []);
  const list = Array.isArray(stamps) ? stamps : [];
  const chips = list.length
    ? list.slice(-12).map(s => `<span class="game-stamp-chip">${escapeHtml(s)}</span>`).join("")
    : `<span class="stub">No stamps yet — receipts from quests unlock them.</span>`;
  return `
    <div class="hud-dropdown-subtitle">Receipt stamp album</div>
    <div class="hud-dropdown-row"><span>Unique stamps</span><strong>${list.length}</strong></div>
    <div class="game-stamp-grid">${chips}</div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">First time a receipt kind appears, you collect a stamp.</div>`;
}

function gameOfflineBountyDropdownHtml() {
  const state = gameEnsureOfflineBounties();
  const rows = GAME_OFFLINE_BOUNTY_POOL.map(b => {
    const cur = Math.min(b.target, state.progress[b.key] || 0);
    const done = !!state.claimed[b.key] || cur >= b.target;
    const pct = b.target > 0 ? (cur / b.target) * 100 : 0;
    return `
      <div class="game-bounty-row">
        <div class="hud-dropdown-row" style="margin:0;"><span>${escapeHtml(b.label)}</span><strong>${done ? "✓" : `${cur}/${b.target}`}</strong></div>
        <div class="game-quest-bar" aria-hidden="true"><span class="game-quest-fill" style="width:${pct.toFixed(1)}%;${done ? " background:var(--status-good);" : ""}"></span></div>
      </div>`;
  }).join("");
  return `
    <div class="hud-dropdown-title">Offline bounties</div>
    <div class="stub" style="padding:2px 0 6px; line-height:1.45;">Local-only mode — honest actions earn +${Math.round(GAME_OFFLINE_BOUNTY_BONUS_PCT * 100)}% XP on awards.</div>
    ${rows}`;
}

function gameXpSourcesHtml() {
  const state = gameEnsureQuestState();
  const questRows = gameTodayQuestKeys().map(key => {
    const meta = GAME_QUEST_POOL[key];
    const cur = Math.min(meta.target, state.counters[key] || 0);
    const done = cur >= meta.target;
    return `<div class="hud-dropdown-row"><span>${escapeHtml(meta.label)}</span><strong>${done ? "done" : `${cur}/${meta.target}`}</strong></div>`;
  }).join("");
  return `
    <div class="hud-dropdown-subtitle">Where points live</div>
    <div class="stub" style="padding:2px 0 6px; line-height:1.45;">XP from real work only — quests (+${GAME_QUEST_REWARD_XP} each), chest (+${GAME_CHEST_XP_REWARD}), honest zone awards. Coins from Arcade practice. Gems from chests / rare milestones.</div>
    ${questRows || '<div class="stub" style="padding:2px 0;">No quests selected today.</div>'}
    <div class="hud-dropdown-divider"></div>
    <div class="hud-dropdown-subtitle">Jump to earn</div>
    <button type="button" class="secondary hud-dropdown-action" id="hud-points-today">Today — paint &amp; pulse</button>
    <button type="button" class="secondary hud-dropdown-action" id="hud-points-tasks">Tasks — finish open work</button>
    <button type="button" class="secondary hud-dropdown-action" id="hud-points-quests">Quests board</button>
    <button type="button" class="secondary hud-dropdown-action" id="hud-points-practice">Practice — coins</button>
    <button type="button" class="secondary hud-dropdown-action" id="hud-points-road">Coin Road</button>`;
}

function gameXpDropdownHtml() {
  const xp = gameReadInt("gameXp", 0);
  const todayXp = gameReadXpToday();
  const prog = gameXpProgress(xp);
  const gems = gameReadInt("gameGems", 0);
  const coins = HUD_DATA.coins || {};
  const practice = HUD_DATA.practice || {};
  const coinBalance = coins.balance != null ? coins.balance : (practice.points || 0);
  const stamps = gameReadJson("gameReceiptStamps", []);
  const stampCount = Array.isArray(stamps) ? stamps.length : 0;
  const shields = gameReadStreakShields();
  return `
    <div class="hud-dropdown-title">Points map</div>
    <div class="hud-dropdown-row"><span>Level</span><strong>${prog.level}</strong></div>
    <div class="hud-dropdown-row"><span>XP today</span><strong>+${todayXp.toLocaleString()}</strong></div>
    <div class="hud-dropdown-row"><span>Total XP</span><strong>${xp.toLocaleString()}</strong></div>
    <div class="hud-dropdown-row"><span>Coins</span><strong>◉ ${Number(coinBalance || 0).toLocaleString()}</strong></div>
    <div class="hud-dropdown-row"><span>Gems</span><strong>${gems ? `💎 ${gems}` : "—"}</strong></div>
    <div class="hud-dropdown-row"><span>Receipt stamps</span><strong>${stampCount || "—"}</strong></div>
    <div class="hud-dropdown-row"><span>Streak shields</span><strong>${shields ? "🛡 1" : "—"}</strong></div>
    <div class="hud-budget-bar hud-budget-bar--dropdown" aria-hidden="true"><span class="hud-budget-fill hud-budget-fill--green" style="width:${prog.pct.toFixed(1)}%"></span></div>
    <div class="stub" style="padding:2px 0;">${prog.next - xp} XP to Lv ${prog.level + 1}</div>
    <div class="hud-dropdown-divider"></div>
    ${gameXpSourcesHtml()}
    <div class="hud-dropdown-divider"></div>
    <button type="button" class="secondary hud-dropdown-action" id="hud-view-ledger">View ledger</button>`;
}

function gameQuestDropdownHtml() {
  const state = gameEnsureQuestState();
  const keys = gameTodayQuestKeys();
  const apiStreak = Number(HUD_DATA?.practice?.streak || 0) || 0;
  const streak = typeof gameEffectiveStreak === "function" ? gameEffectiveStreak(apiStreak) : apiStreak;
  const rows = keys.map(key => {
    const meta = GAME_QUEST_POOL[key];
    const cur = Math.min(meta.target, state.counters[key] || 0);
    const pct = meta.target > 0 ? (cur / meta.target) * 100 : 0;
    const done = cur >= meta.target;
    const jumpTab = GAME_QUEST_JUMP_TABS[key];
    return `
      <div class="game-quest-row">
        <div class="hud-dropdown-row" style="margin:0;"><span>${escapeHtml(gameQuestLabel(key))}</span><strong>${cur}/${meta.target}</strong></div>
        <div class="game-quest-bar" aria-hidden="true"><span class="game-quest-fill" style="width:${pct.toFixed(1)}%;${done ? " background:var(--status-good);" : ""}"></span></div>
        <div class="stub" style="padding:2px 0 0; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span>+${GAME_QUEST_REWARD_XP} XP${done ? " · done" : ""}</span>
          ${!done && jumpTab ? `<button type="button" class="secondary" data-quest-jump="${escapeHtml(jumpTab)}">Go to ${escapeHtml(jumpTab)}</button>` : ""}
        </div>
      </div>`;
  }).join("");
  const chestNote = gameAllQuestsDone(state)
    ? (state.claimed ? "Chest opened — +1 💎 +120 XP" : "All done — today's chest is ready")
    : "Complete all three for chest: +1 💎 +120 XP";
  const claimButton = gameAllQuestsDone(state) && !state.claimed
    ? '<button type="button" class="primary hud-dropdown-action" id="hud-claim-chest">Claim chest</button>'
    : "";
  return `
    <div class="hud-dropdown-title">Daily quests</div>
    <div class="hud-dropdown-row"><span>Current streak</span><strong>${streak ? `🔥 ${streak}d` : "—"}</strong></div>
    <div class="stub" style="padding:2px 0 6px; line-height:1.45;">Three honest micro-quests rotate daily. Progress syncs from real receipts, tasks, and pulses.</div>
    ${rows}
    <div class="hud-dropdown-divider"></div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">${escapeHtml(chestNote)}</div>
    ${claimButton}`;
}

function gameOpenChest() {
  const state = gameEnsureQuestState();
  if (!gameAllQuestsDone(state) || state.claimed) return;
  state.claimed = true;
  gameSaveQuestState(state);
  gameUpdateHud();

  const reduced = gamePrefersReducedMotion();
  const overlay = document.createElement("div");
  overlay.className = "game-chest-overlay";
  overlay.innerHTML = `
    <div class="game-chest-stage" aria-hidden="true">
      <div class="game-chest-lid"></div>
      <div class="game-chest-box"></div>
      <div class="game-chest-gem">&#128142;</div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("game-chest-overlay--open"));

  const finish = () => {
    const pity = { rare: Number(localStorage.getItem("wpChestPityRare") || 0) };
    const owned = Number(localStorage.getItem("gameGems") || 0);
    const roll = Math.random() + Math.min(0.08, pity.rare * 0.002);
    let gems = GAME_CHEST_GEM_REWARD;
    let xp = GAME_CHEST_XP_REWARD;
    let rarity = "common";
    if (roll > 0.97) { rarity = "legendary"; gems = 8; xp = 420; pity.rare = 0; }
    else if (roll > 0.88) { rarity = "epic"; gems = 4; xp = 260; pity.rare = 0; }
    else if (roll > 0.62) { rarity = "rare"; gems = 2; xp = 180; pity.rare = 0; }
    else pity.rare += 1;
    localStorage.setItem("wpChestPityRare", String(pity.rare));
    gameAwardGems(gems, `Quest chest (${rarity})`);
    window.WaypointGame.awardXp(xp, `Quest chest (${rarity})`);
    if (window.WaypointLoot?.grantChest) {
      try { window.WaypointLoot.grantChest({ rarity, source: "Daily quest chest" }); } catch (_) {}
    }
    if (typeof showToast === "function") showToast(`${rarity} chest — +${gems} 💎 +${xp} XP`, "good");
    overlay.remove();
    gameUpdateHud();
  };
  setTimeout(finish, reduced ? 340 : 820);
}

function gameMaybeQuestNudge(state) {
  if (GAME_QUEST_NUDGE_SHOWN) return;
  const keys = gameTodayQuestKeys();
  const incomplete = keys.filter(k => !gameQuestDone(state, k));
  if (incomplete.length !== 1) return;
  const key = incomplete[0];
  if ((state.counters[key] || 0) <= 0) return;
  GAME_QUEST_NUDGE_SHOWN = true;
  showToast("One more task finishes today's quests", "info");
}

function gameCheckStreakMilestones(streak) {
  const seen = gameReadSeenStreakMilestones();
  const titles = { 7: "SEVEN DAY FLAME", 30: "THIRTY DAY FIRE", 100: "CENTURY STREAK" };
  GAME_STREAK_MILESTONES.forEach(m => {
    if ((streak || 0) < m || seen.has(m)) return;
    gameMarkSeenStreakMilestone(m);
    if (typeof window.momentOfTriumph === "function") {
      window.momentOfTriumph({
        title: titles[m] || `STREAK ${m}`,
        subtitle: `${streak} days of honest practice`,
        workspace: "play",
      });
    }
  });
  gameCheckStreakShieldMilestones(streak);
}

function gameStreakMilestonesHtml(streak) {
  const s = streak || 0;
  const next = GAME_STREAK_MILESTONES.find(m => s < m) || null;
  const shields = gameReadStreakShields();
  const chips = GAME_STREAK_MILESTONES.map(m => {
    const hit = s >= m;
    const isNext = next === m;
    const cls = "game-streak-milestone" + (hit ? " game-streak-milestone--hit" : "") + (isNext ? " game-streak-milestone--next" : "");
    return `<span class="${cls}">${m}d${hit ? " ✓" : isNext ? " next" : ""}</span>`;
  }).join("");
  return `
    <div class="hud-dropdown-subtitle">Milestones</div>
    <div class="game-streak-milestones">${chips}</div>
    <div class="hud-dropdown-row"><span>Streak shield</span><strong>${shields ? "🛡 1 banked" : "—"}</strong></div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">7d and 30d milestones bank one shield (max 1). A shield absorbs one streak break.</div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">Next highlight marks the upcoming honest streak milestone.</div>`;
}

async function gamePollQuestProgress() {
  if (document.visibilityState === "hidden") return;
  const today = localYmd();
  const state = gameEnsureQuestState(today);
  const keys = gameAvailableQuestKeys(today);
  let changed = false;

  const setMax = (key, value) => {
    if (!keys.includes(key)) return;
    const v = Math.max(0, Number(value) || 0);
    const cur = state.counters[key] || 0;
    if (v > cur) { state.counters[key] = v; changed = true; }
  };

  try {
    const receipts = await api(`/api/receipts?date=${encodeURIComponent(today)}`);
    let paintHours = 0;
    let matches = 0;
    let blueprintRuns = 0;
    let readingLogs = 0;
    let capturedNotes = 0;
    (Array.isArray(receipts) ? receipts : []).forEach(r => {
      if (!r) return;
      if (gameReceiptDayKey(r.created_at) !== today) return;
      gameNoteReceiptStamp(r);
      const source = String(r.source || "").toLowerCase();
      const kind = String(r.kind || "").toLowerCase();
      const summary = String(r.summary || "").toLowerCase();
      if (r.source === "planner" && r.kind === "day_saved") {
        const h = gameParsePaintHours(r.summary);
        if (h != null) paintHours = Math.max(paintHours, h);
      }
      if (r.source === "arcade" && r.kind === "match_played") matches += 1;
      if (r.source === "blueprint" && String(r.kind || "").toLowerCase().includes("run")) blueprintRuns += 1;
      if (["docs", "system"].includes(source) && /(reading|read|book)/.test(`${kind} ${summary}`)) readingLogs += 1;
      if (["docs", "planner", "system"].includes(source) && /(capture|captured|note)/.test(`${kind} ${summary}`)) capturedNotes += 1;
    });
    if (paintHours > 0) setMax("paint6", paintHours);
    if (matches > 0) setMax("match1", matches);
    if (blueprintRuns > 0) setMax("blueprint1", blueprintRuns);
    if (readingLogs > 0) setMax("book1", readingLogs);
    if (capturedNotes > 0) setMax("capture3", capturedNotes);
    const contractReceipts = (Array.isArray(receipts) ? receipts : []).filter(r => r && String(r.kind || "").toLowerCase() === "contract_done");
    if (contractReceipts.length) setMax("contract1", contractReceipts.length);
    const reflectReceipts = (Array.isArray(receipts) ? receipts : []).filter(r => r && /(reflect|thinking|journal)/.test(`${r.kind || ""} ${r.summary || ""}`.toLowerCase()));
    if (reflectReceipts.length) setMax("reflect1", reflectReceipts.length);
    gameWriteQuestSignals({
      hasBlueprints: blueprintRuns > 0 || !!gameReadQuestSignals().hasBlueprints,
      hasReading: readingLogs > 0 || !!gameReadQuestSignals().hasReading,
      unpainted: paintHours <= 0,
    });
    gameCheckFullStackDayCombo(receipts, today);
  } catch (_) {}

  try {
    const pulses = await api(`/api/pulses?date=${encodeURIComponent(today)}`);
    const pulseCount = Array.isArray(pulses) ? pulses.length : 0;
    if (pulseCount > 0) setMax("pulse2", pulseCount);
    const noted = (Array.isArray(pulses) ? pulses : []).filter(p => String(p.note || "").trim()).length;
    if (noted > 0) setMax("reflect1", noted);
    if (pulseCount > 0 && (state.counters.paint6 || 0) >= 1) setMax("showup1", 1);
  } catch (_) {}

  try {
    const tasks = await api("/api/tasks");
    const list = Array.isArray(tasks) ? tasks : [];
    const doneToday = list.filter(t => {
      if (!t || t.status !== "done") return false;
      const at = (t.completed_at || "").slice(0, 10);
      return at === today;
    }).length;
    if (doneToday > 0) setMax("tasks3", doneToday);
    const addedToday = list.filter(t => {
      if (!t) return false;
      const at = String(t.created_at || t.createdAt || "").slice(0, 10);
      return at === today;
    }).length;
    if (addedToday > 0) setMax("addtask2", addedToday);
    const overdue = list.filter(t => {
      if (!t || t.status === "done") return false;
      const due = String(t.due_date || t.due || t.deadline || "").slice(0, 10);
      return due && due < today;
    });
    const overdueDone = list.filter(t => {
      if (!t || t.status !== "done") return false;
      const at = (t.completed_at || "").slice(0, 10);
      const due = String(t.due_date || t.due || t.deadline || "").slice(0, 10);
      return at === today && due && due < today;
    }).length;
    if (overdueDone > 0) setMax("overdue1", overdueDone);
    gameWriteQuestSignals({
      overdueCount: overdue.length,
      openTitle: overdue[0]?.title || overdue[0]?.name || "",
      hasCompanion: !!gameCompanionSnippet(),
    });
  } catch (_) {}

  try {
    const contacts = await api("/api/contacts");
    const touched = (Array.isArray(contacts) ? contacts : []).filter(c => {
      const stamp = String(c.last_contact || c.updated_at || c.created_at || "").slice(0, 10);
      return stamp === today;
    }).length;
    if (touched > 0) setMax("contact1", touched);
  } catch (_) {}

  try {
    const thinking = await api("/api/lists/thinking");
    const wrote = (Array.isArray(thinking) ? thinking : []).filter(n => {
      const stamp = String(n.created_at || n.updated_at || n.createdAt || "").slice(0, 10);
      return stamp === today && String(n.body || n.title || "").trim();
    }).length;
    if (wrote > 0) setMax("reflect1", wrote);
  } catch (_) {}

  if (changed) gameSaveQuestState(state);
  gameSyncOfflineBounties(state);
  gameAwardQuestCompletions(state);
  gameUpdateHud();
}

function initGameLayerInteractions() {
  injectGameHud();
  const xpBtn = document.getElementById("hud-xp-btn");
  if (xpBtn && !xpBtn.dataset.gameWired) {
    xpBtn.dataset.gameWired = "1";
    xpBtn.title = "Points map — where XP, coins, and gems come from";
    xpBtn.onclick = async () => {
      if (HUD_DROPDOWN) { closeHudDropdown(); return; }
      try { if (typeof refreshHudData === "function") await refreshHudData(); } catch (_) {}
      openHudDropdown(xpBtn, gameXpDropdownHtml(), {
        "hud-view-ledger": () => {
          if (typeof goToTab === "function") goToTab("Practice");
        },
        "hud-points-today": () => { if (typeof goToTab === "function") goToTab("Today"); },
        "hud-points-tasks": () => { if (typeof goToTab === "function") goToTab("Tasks"); },
        "hud-points-quests": () => {
          const questsBtn = document.getElementById("hud-quests-btn");
          if (questsBtn) questsBtn.click();
        },
        "hud-points-practice": () => { if (typeof goToTab === "function") goToTab("Practice"); },
        "hud-points-road": () => {
          if (window.WaypointLoot && typeof window.WaypointLoot.open === "function") {
            window.WaypointLoot.open("road");
          } else if (typeof goToTab === "function") {
            goToTab("Practice");
          }
        },
      });
    };
  }
  const questsBtn = document.getElementById("hud-quests-btn");
  if (questsBtn && !questsBtn.dataset.gameWired) {
    questsBtn.dataset.gameWired = "1";
    questsBtn.onclick = e => {
      if (HUD_DROPDOWN) { closeHudDropdown(); return; }
      openHudDropdown(questsBtn, gameQuestDropdownHtml(), {
        "hud-claim-chest": () => gameOpenChest(),
      });
    };
  }
  const chestBtn = document.getElementById("hud-chest-btn");
  if (chestBtn && !chestBtn.dataset.gameWired) {
    chestBtn.dataset.gameWired = "1";
    chestBtn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      closeHudDropdown();
      gameOpenChest();
    };
  }
}

window.WaypointGame = {
  awardXp(amount, reason, opts) {
    const base = Math.max(0, Math.floor(Number(amount) || 0));
    if (!base) return;
    let n = base;
    if (gameIsOfflineMode()) {
      n = Math.max(1, Math.floor(base * (1 + GAME_OFFLINE_BOUNTY_BONUS_PCT)));
    }
    const combo = gameApplyXpCombo(n);
    n = combo.amount;
    const prev = gameReadInt("gameXp", 0);
    const next = prev + n;
    gameWriteInt("gameXp", next);
    gameAddXpToday(n);
    gameCheckLevelUp(prev, next);
    const floaterReason = combo.combo
      ? `${reason || ""}${gameIsOfflineMode() ? " · offline" : ""}`.trim()
      : `${reason || ""}${gameIsOfflineMode() ? " · +20% offline" : ""}`.trim();
    gameShowXpFloater(n, floaterReason, opts && opts.anchorPoint, { combo: combo.combo });
    gameLedgerPush({
      type: "xp",
      amount: n,
      reason: reason || "XP",
      meta: combo.bonus ? { comboBonus: combo.bonus, offline: gameIsOfflineMode() } : (gameIsOfflineMode() ? { offline: true } : null),
    });
    gameUpdateHud();
  },
  questProgress(key, n) {
    const inc = Math.max(1, Math.floor(Number(n) || 1));
    if (!key || !GAME_QUEST_POOL[key]) return;
    const state = gameEnsureQuestState();
    if (!gameAvailableQuestKeys().includes(key)) return;
    state.counters[key] = (state.counters[key] || 0) + inc;
    gameSaveQuestState(state);
    gameAwardQuestCompletions(state);
    gameUpdateHud();
  },
  awardGems(amount, reason) {
    gameAwardGems(amount, reason);
  },
  spendGems(amount, reason) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    const current = gameReadInt("gameGems", 0);
    if (!n || current < n) return false;
    gameWriteInt("gameGems", current - n);
    gameLedgerPush({ type: "gem", amount: -n, reason: reason || "Gem unlock" });
    gameUpdateHud();
    window.dispatchEvent(new CustomEvent("waypoint:gems", { detail: { gems: current - n } }));
    return true;
  },
  selectQuest(key) {
    const state = gameEnsureQuestState();
    const available = gameAvailableQuestKeys();
    if (!available.includes(key)) return false;
    const selected = state.selected || [];
    const index = selected.indexOf(key);
    if (index >= 0) selected.splice(index, 1);
    else {
      const alwaysOn = key === "estimate1" || key === "actual1";
      if (!alwaysOn && selected.length >= gameQuestSelectionLimit()) return false;
      selected.push(key);
      window.WaypointHabits?.observe("quest-selected", key);
    }
    state.selected = selected;
    gameSaveQuestState(state);
    gameAwardQuestCompletions(state);
    gameUpdateHud();
    return true;
  },
  claimDailyReward() {
    const state = gameEnsureQuestState();
    if (!gameAllQuestsDone(state) || state.claimed) return false;
    state.claimed = true;
    gameSaveQuestState(state);
    gameUpdateHud();
    return true;
  },
  getState() {
    const state = gameEnsureQuestState();
    const selected = gameTodayQuestKeys();
    const toQuest = key => ({
      key,
      label: gameQuestLabel(key),
      progress: state.counters[key] || 0,
      target: GAME_QUEST_POOL[key].target,
      rewardXp: GAME_QUEST_REWARD_XP,
      done: gameQuestDone(state, key),
    });
    return {
      xp: gameReadInt("gameXp", 0),
      level: gameLevelFromXp(gameReadInt("gameXp", 0)),
      gems: gameReadInt("gameGems", 0),
      questsToday: selected.map(toQuest),
      availableQuests: gameAvailableQuestKeys().map(toQuest),
      questLimit: gameQuestSelectionLimit(),
      allQuestsDone: gameAllQuestsDone(state),
      dailyRewardClaimed: !!state.claimed,
      todayComplete: gameTodayComplete(),
    };
  },
};

function gameNoteXpAward(amount, reason, opts) {
  if (window.WaypointGame && typeof window.WaypointGame.awardXp === "function") {
    window.WaypointGame.awardXp(amount, reason, opts);
  }
}

window.gameNoteXpAward = gameNoteXpAward;

function initGameLayer() {
  ensureGameLayerStyles();
  injectGameHud();
  initGameLayerInteractions();
  gameUpdateHud();
  if (window.WaypointLoot && typeof window.WaypointLoot.init === "function") window.WaypointLoot.init();
  requestAnimationFrame(() => gameMaybeShowDaySigil());
  gamePollQuestProgress();
  setInterval(gamePollQuestProgress, 10000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") gamePollQuestProgress();
  });
  setInterval(gameUpdateHudChips, 60000);
}

// --- HUD data & dropdowns -----------------------------------------------

let HUD_DROPDOWN = null;
let HUD_DROPDOWN_ON_DOC = null;
let HUD_DATA = {};
var SETTINGS_FOCUS_ID = null;
let HUD_STATUS_EXPANDED = false;

// Every non-Home page shows the intention strip, whose primary button (and the HUD "Now" chip)
// routes here. Without an entry the fallback is a fuzzy scan for a control whose text contains
// the primary verb, which silently does nothing on pages where the verb never appears as a label
// ("Chunk" on Goals, "Interpret" on Trends, "Message" on Team). Keep one entry per tab so the
// promise the strip makes is one the page can keep.
const PRIMARY_FOCUS_SELECTORS = {
  Agent: "#agent-input",
  Hub: "#hub-link-input, #hub-link-url, input[placeholder*='link' i]",
  Today: ".tdy-hour-canvas, #tdy-select-paint, .hour-cat-select, #save-day",
  Tasks: "#task-title, #new-task-title, input[placeholder*='task' i]",
  Goals: "#new-goal-title, #add-goal",
  Calendar: "#cal-inline-title, #add-cal-row",
  Events: "#new-event-title, #add-event",
  Trends: "#trd-analysis-toggle, #trend-smooth, #trend-corr-method",
  Ideas: "#idea-title, input[placeholder*='idea' i]",
  Repository: "#repo-choose-files, #repo-search-input",
  Competitions: "#new-competition-title, #add-competition",
  Settings: "#settings-routing, select[name='routing'], .settings-routing select, #route-tasks, #daily-budget-usd",
  Code: "#code-input, #code-ask-input, textarea[placeholder*='ask' i]",
  Practice: "#arc-play-btn, .arc-play-core, .prax-start-btn, #prax-game-select, #arc-training-lab",
  Parallel: "#rpl-input, .rpl-input-wrap input",
  Contacts: "#contact-search",
  Team: "#team-composer-input, #team-hero-invite-name, #team-toggle-invite",
  Customers: "#new-customer-name, #add-customer",
  About: "#about-description, #save-about",
  Prompts: "#prompts-page-editor, #prompts-page-save",
  Obsidian: "#claude-notes-body, .rich-fullscreen-btn",
  Skills: "#note-body, #add-note",
  Problems: "#note-body, #add-note",
  Thinking: "#note-body, #add-note",
  Funny: "#note-body, #add-note",
  Essays: "#note-body, #add-note",
};

function focusPrimaryControl() {
  if (ACTIVE_TAB === "Home") return;
  const meta = PAGE_INTENTS[ACTIVE_TAB];
  const primary = meta?.primary;
  if (!primary) return;
  const main = document.getElementById("main");
  if (!main) return;
  const selector = PRIMARY_FOCUS_SELECTORS[ACTIVE_TAB];
  if (selector) {
    const el = main.querySelector(selector) || document.querySelector(selector);
    if (el) {
      el.focus();
      if (typeof el.click === "function" && (el.tagName === "BUTTON" || el.type === "button")) el.click();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
  }
  const needle = primary.toLowerCase();
  const candidates = main.querySelectorAll("button, input, textarea, select, [contenteditable='true']");
  for (const el of candidates) {
    if (el.disabled || el.offsetParent === null) continue;
    const label = `${el.textContent || ""} ${el.placeholder || ""} ${el.title || ""} ${el.value || ""}`.toLowerCase();
    if (label.includes(needle)) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
  }
}

function updateHudStatusPill() {
  const pill = document.getElementById("hud-status-pill-text");
  if (!pill) return;
  const budget = HUD_DATA.budget || {};
  const usage = HUD_DATA.usage || {};
  const practice = HUD_DATA.practice || {};
  const spent = budget.spent_today || usage.day?.estimated_cost_usd || 0;
  const month = budget.spent_this_month || usage.month_total?.estimated_cost_usd || 0;
  const streak = gameEffectiveStreak(practice.streak || 0);
  const shieldNote = gameReadStreakShields() > 0 ? "🛡" : (gameReadStreakOverlay() > 0 ? "🛡" : "");
  pill.textContent = `$${Number(spent).toFixed(2)} today · $${Number(month).toFixed(2)} mo · 🔥${streak}${shieldNote ? ` ${shieldNote}` : ""}`;
}

function setHudStatusExpanded(open) {
  HUD_STATUS_EXPANDED = open;
  const detail = document.getElementById("hud-metrics-detail");
  const pill = document.getElementById("hud-status-pill");
  if (detail) detail.hidden = !open;
  if (pill) pill.setAttribute("aria-expanded", open ? "true" : "false");
}

function toggleCalmMode(force) {
  const on = force != null ? !!force : !document.body.classList.contains("calm-mode");
  document.body.classList.toggle("calm-mode", on);
  localStorage.setItem("calmMode", on ? "1" : "0");
  const pill = document.getElementById("hud-calm-pill");
  if (pill) pill.hidden = !on;
  if (on) showToast("Calm mode — essentials only", "info");
}

function initCalmMode() {
  if (localStorage.getItem("calmMode") === "1") toggleCalmMode(true);
}

function formatCompactTokens(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function estimateDailyTokenCap(usage, budget) {
  const capUsd = budget.daily_cap || 3;
  if (usage && usage.total_tokens > 0 && usage.estimated_cost_usd > 0) {
    const costPerToken = usage.estimated_cost_usd / usage.total_tokens;
    if (costPerToken > 0) return Math.round(capUsd / costPerToken);
  }
  return Math.round(capUsd / 0.000025);
}

function hudReadTrophiesCount() {
  try {
    return Math.max(0, parseInt(localStorage.getItem("arcadeTrophies") || "0", 10) || 0);
  } catch (_) { return 0; }
}

function hudTruthySetting(value) {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

function inferenceModeFromUsage(usage) {
  const explicit = String(usage && usage.inference_mode || "").toLowerCase();
  if (explicit === "cloud" || explicit === "local" || explicit === "custom") return explicit;
  if (hudTruthySetting(usage && usage.offline_mode)) return "local";
  return "cloud";
}

function shortModelName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Ollama";
  const leaf = raw.split("/").pop() || raw;
  const base = leaf.split(":")[0] || leaf;
  return base.length > 14 ? `${base.slice(0, 13)}…` : base;
}

function resolveModelChipBackend(usage) {
  if (!usage) return "Claude";
  const model = String(usage.model || "").toLowerCase();
  const routing = usage.routing || {};
  const backends = new Set(Object.values(routing).map(r => String(r.backend || "").toLowerCase()));
  if (backends.size === 1 && backends.has("ollama")) return "Ollama";
  if (model.includes("gpt") || model.includes("openai") || (usage.openai_configured && backends.has("openai") && !backends.has("claude") && !backends.has("grok"))) return "OpenAI";
  if (model.includes("grok") || (usage.grok_configured && backends.has("grok") && !backends.has("claude"))) return "Grok";
  if (model.includes("claude") || backends.has("claude")) return "Claude";
  if (usage.local_model_available && !usage.openai_configured && !usage.grok_configured) return "Ollama";
  return "Claude";
}

function liveSourceLabel(source) {
  const key = String(source || "").toLowerCase();
  if (key === "openai") return "ChatGPT";
  if (key === "grok") return "Grok";
  if (key === "claude") return "Claude";
  if (key === "ollama") return "Ollama";
  return "";
}

function resolveModelChipLabel(usage) {
  if (!usage) return "Cloud";
  const mode = inferenceModeFromUsage(usage);
  const live = usage.live_routing || {};
  const liveName = liveSourceLabel(live.last_source);
  if (mode === "local") {
    if (!usage.local_model_available) return "Local · off";
    return `Local · ${shortModelName(usage.local_model_name)}`;
  }
  if (mode === "custom") return `Custom · ${liveName || resolveModelChipBackend(usage)}`;
  if (!usage.api_enabled) {
    return usage.local_model_available ? `API off · ${shortModelName(usage.local_model_name)}` : "API off";
  }
  if (live.last_reroute && liveName) return `${liveName} · fallback`;
  return `Cloud · ${liveName || resolveModelChipBackend(usage)}`;
}

const CLAUDE_MODEL_CHOICES = [
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["claude-opus-4-5", "Claude Opus 4.5"],
  ["claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
];
const OPENAI_MODEL_CHOICES = [
  ["gpt-5-mini", "GPT-5 mini"],
  ["gpt-5", "GPT-5"],
  ["gpt-5-codex", "GPT-5 Codex"],
  ["gpt-4.1", "GPT-4.1"],
  ["gpt-4.1-mini", "GPT-4.1 mini"],
];
const GROK_MODEL_CHOICES = [
  ["grok-4.5", "Grok 4.5"],
  ["grok-4", "Grok 4"],
  ["grok-3", "Grok 3"],
];
const CLOUD_MODEL_CHOICES = [
  ...CLAUDE_MODEL_CHOICES,
  ...OPENAI_MODEL_CHOICES,
  ...GROK_MODEL_CHOICES,
];

function cloudModelFamily(id) {
  const value = String(id || "").toLowerCase();
  if (value.startsWith("gpt") || value.startsWith("o1") || value.startsWith("o3") || value.startsWith("o4")) return "openai";
  if (value.startsWith("grok")) return "grok";
  return "claude";
}

function modelChoiceList(choices, current) {
  const value = String(current || choices[0][0]).trim() || choices[0][0];
  const list = choices.slice();
  if (value && !list.some(([id]) => id === value)) list.unshift([value, value]);
  return { value, choices: list };
}

function cloudModelChoices(current) {
  return modelChoiceList(CLOUD_MODEL_CHOICES, current || "claude-sonnet-5");
}

async function saveNamedCloudModel(family, model) {
  const key = family === "openai" ? "openai_model" : family === "grok" ? "grok_model" : "claude_model";
  await api("/api/about", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: model }),
  });
}

async function setRunningInferenceMode(mode, extra) {
  await api("/api/about", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inference_mode: mode,
      offline_mode: mode === "local" ? "true" : "false",
      ...(extra || {}),
    }),
  });
  await refreshHudData();
  if (typeof renderUsageWidget === "function") renderUsageWidget();
}

function openSettingsSection(id) {
  SETTINGS_FOCUS_ID = id || "inference-settings-card";
  if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Settings") {
    if (typeof render === "function") render();
    else if (typeof focusSettingsSection === "function") focusSettingsSection();
  } else if (typeof goToTab === "function") {
    goToTab("Settings");
  }
}

function closeHudDropdown() {
  if (HUD_DROPDOWN_ON_DOC) {
    document.removeEventListener("click", HUD_DROPDOWN_ON_DOC, true);
    HUD_DROPDOWN_ON_DOC = null;
  }
  if (!HUD_DROPDOWN) return;
  const storage = document.querySelector(".hud-storage");
  ["usage-widget", "global-agent-status", "pomodoro-widget"].forEach(id => {
    const el = document.getElementById(id);
    if (el && storage && el.parentElement !== storage) {
      el.style.display = "";
      storage.appendChild(el);
    }
  });
  HUD_DROPDOWN.remove();
  HUD_DROPDOWN = null;
}

function openHudDropdown(anchorEl, html, actions) {
  closeHudDropdown();
  const panel = document.createElement("div");
  panel.className = "hud-dropdown";
  panel.innerHTML = html;
  document.body.appendChild(panel);
  const rect = anchorEl.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 6}px`;
  panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  HUD_DROPDOWN = panel;

  panel.addEventListener("click", e => {
    const button = e.target.closest("[data-quest-jump]");
    if (!button || !panel.contains(button)) return;
    e.preventDefault();
    e.stopPropagation();
    const tab = button.dataset.questJump;
    closeHudDropdown();
    if (tab && typeof goToTab === "function") goToTab(tab);
  });

  // Wire action buttons via delegation on the live panel so handlers survive
  // and always close the dropdown before navigating.
  if (actions && typeof actions === "object") {
    panel.addEventListener("click", e => {
      const btn = e.target.closest("[id]");
      if (!btn || !panel.contains(btn)) return;
      const fn = actions[btn.id];
      if (typeof fn !== "function") return;
      e.preventDefault();
      e.stopPropagation();
      closeHudDropdown();
      fn();
    });
  }

  // Close on outside *click* (not mousedown): mousedown-outside handlers that
  // aren't removed on toggle-close orphan and destroy the next dropdown before
  // its action click can fire.
  const onDoc = e => {
    if (!HUD_DROPDOWN) return;
    if (HUD_DROPDOWN.contains(e.target)) return;
    if (anchorEl && (e.target === anchorEl || (typeof anchorEl.contains === "function" && anchorEl.contains(e.target)))) return;
    closeHudDropdown();
  };
  HUD_DROPDOWN_ON_DOC = onDoc;
  setTimeout(() => {
    if (HUD_DROPDOWN === panel) document.addEventListener("click", onDoc, true);
  }, 0);
}

function tokensDropdownHtml() {
  const u = HUD_DATA.usage || {};
  const budget = HUD_DATA.budget || {};
  const today = HUD_DATA.tokensToday || 0;
  const week = HUD_DATA.tokensWeek || 0;
  const models = (u.by_model || budget.by_model || []).slice().sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens));
  const topModels = models.slice(0, 5);
  return `
    <div class="hud-dropdown-title">Token usage</div>
    <div class="hud-dropdown-row"><span>Today</span><strong>${today.toLocaleString()}</strong></div>
    <div class="hud-dropdown-row"><span>7 days</span><strong>${week.toLocaleString()}</strong></div>
    <div class="hud-dropdown-divider"></div>
    <div class="hud-dropdown-subtitle">By model</div>
    ${topModels.length ? topModels.map(m => {
      const tok = (m.input_tokens || 0) + (m.output_tokens || 0);
      return `<div class="hud-dropdown-row"><span>${escapeHtml(m.model)}</span><strong>${tok.toLocaleString()}</strong></div>`;
    }).join("") : '<div class="stub" style="padding:4px 0;">No usage recorded yet</div>'}
    <div class="hud-dropdown-divider"></div>
    <div class="hud-dropdown-subtitle">Largest calls</div>
    <div class="stub" style="padding:4px 0;">Per-call detail not available — model totals shown above.</div>
    <div class="hud-dropdown-divider"></div>
    <div id="hud-usage-widget-mount"></div>`;
}

function budgetDropdownHtml() {
  const b = HUD_DATA.budget || {};
  const spent = b.spent_today || 0;
  const cap = b.daily_cap || 3;
  const pct = cap > 0 ? spent / cap : 0;
  const models = (b.by_model || []).slice().sort((a, b) => (b.estimated_cost_usd || 0) - (a.estimated_cost_usd || 0));
  return `
    <div class="hud-dropdown-title">Daily budget</div>
    <div class="hud-dropdown-row"><span>Spent today</span><strong>$${spent.toFixed(2)}</strong></div>
    <div class="hud-dropdown-row"><span>Daily cap</span><strong>$${cap.toFixed(2)}</strong></div>
    <div class="hud-budget-bar hud-budget-bar--dropdown" aria-hidden="true"><span class="hud-budget-fill ${pct >= 0.8 ? "hud-budget-fill--red" : pct >= 0.5 ? "hud-budget-fill--amber" : "hud-budget-fill--green"}" style="width:${Math.min(100, pct * 100).toFixed(1)}%"></span></div>
    <div class="hud-dropdown-divider"></div>
    <div class="hud-dropdown-subtitle">By model</div>
    ${models.length ? models.slice(0, 5).map(m => `<div class="hud-dropdown-row"><span>${escapeHtml(m.model)}</span><strong>$${(m.estimated_cost_usd || 0).toFixed(2)}</strong></div>`).join("") : '<div class="stub" style="padding:4px 0;">No spend today</div>'}
    <div class="hud-dropdown-divider"></div>
    <button type="button" class="secondary hud-dropdown-action" id="hud-budget-settings">Open budget controls</button>`;
}

function coinsDropdownHtml() {
  const coins = HUD_DATA.coins || {};
  const practice = HUD_DATA.practice || {};
  const balance = coins.balance != null ? coins.balance : (practice.points || 0);
  const points = coins.points != null ? coins.points : (practice.points || 0);
  const ledger = coins.ledger_sum != null ? coins.ledger_sum : null;
  const wallet = HUD_DATA.wallet;
  return `
    <div class="hud-dropdown-title">Coins</div>
    <div class="hud-dropdown-row"><span>Balance</span><strong>◉ ${balance.toLocaleString()}</strong></div>
    <div class="hud-dropdown-row"><span>Earned (practice)</span><strong>+${points.toLocaleString()}</strong></div>
    ${ledger != null ? `<div class="hud-dropdown-row"><span>Ledger (Parallel)</span><strong>${ledger >= 0 ? "+" : ""}${ledger.toLocaleString()}</strong></div>` : ""}
    ${wallet && wallet.balance != null && ledger == null ? `<div class="hud-dropdown-row"><span>Wallet</span><strong>${wallet.balance.toLocaleString()}</strong></div>` : ""}
    <div class="hud-dropdown-divider"></div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">Earned from Arcade practice. Spent in Parallel (Bend Reality, etc.). Pending bonuses appear when practice awards them.</div>
    <div class="hud-dropdown-divider"></div>
    <button type="button" class="secondary hud-dropdown-action" id="hud-coins-arcade">Open Arcade</button>`;
}

function trophiesDropdownHtml() {
  const count = hudReadTrophiesCount();
  return `
    <div class="hud-dropdown-title">Trophies</div>
    <div class="hud-dropdown-row"><span>Arcade trophies</span><strong>&#127942; ${count.toLocaleString()}</strong></div>
    <div class="hud-dropdown-divider"></div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">Stored locally from Arcade matches — honest localStorage tally, not inflated.</div>
    <div class="hud-dropdown-divider"></div>
    <button type="button" class="secondary hud-dropdown-action" id="hud-trophies-arcade">Open Arcade</button>`;
}

function streakDropdownHtml() {
  const practice = HUD_DATA.practice || {};
  const apiStreak = practice.streak || 0;
  const streak = gameEffectiveStreak(apiStreak);
  const attempts = practice.total_attempts || 0;
  const shieldBanked = gameReadStreakShields() > 0;
  const shieldActive = gameReadStreakOverlay() > 0;
  return `
    <div class="hud-dropdown-title">Streak truth</div>
    <div class="hud-dropdown-row"><span>Current streak</span><strong>&#128293; ${streak}d${shieldActive ? " <span class=\"hud-streak-shield\">🛡 held</span>" : ""}</strong></div>
    <div class="hud-dropdown-row"><span>Practice attempts</span><strong>${attempts.toLocaleString()}</strong></div>
    <div class="hud-dropdown-divider"></div>
    ${gameStreakMilestonesHtml(streak)}
    <div class="hud-dropdown-divider"></div>
    <div class="stub" style="padding:2px 0; line-height:1.45;">Counted from real practice sessions via <code>/api/practice/summary</code>.${shieldBanked ? " One streak shield is banked." : ""}</div>
    ${streak === 0 ? '<div class="stub" style="padding:4px 0;">No active streak — play Arcade to start one.</div>' : ""}`;
}

function gameSyncPracticeStreak(apiStreak) {
  const prev = gameReadInt("gameStreakLastSeen", 0);
  const cur = Math.max(0, Number(apiStreak) || 0);
  const overlay = gameReadStreakOverlay();
  if (overlay > 0 && cur > 0) gameWriteInt("gameStreakOverlay", 0);
  gameMaybeConsumeStreakShield(prev, cur);
  gameWriteInt("gameStreakLastSeen", cur);
  return gameEffectiveStreak(cur);
}

function modelDropdownHtml() {
  const u = HUD_DATA.usage || {};
  const label = resolveModelChipLabel(u);
  const mode = inferenceModeFromUsage(u);
  const routing = u.routing || {};
  const rows = Object.entries(routing).slice(0, 5).map(([role, r]) =>
    `<div class="hud-dropdown-row"><span>${escapeHtml(role)}</span><strong title="${escapeHtml(r.model || "")}">${escapeHtml(r.backend || "—")}</strong></div>`
  ).join("");
  // *Status, not bare names: `openai` and `grok` are re-declared a few lines down as the
  // model-choice objects, and two `const`s of one name in a single scope is a SyntaxError
  // that kills the parse of this entire file -- taking every feature in it down with it.
  const anthropicStatus = u.anthropic_configured ? "configured" : "not set";
  const openaiStatus = u.openai_configured ? "configured" : "not set";
  const grokStatus = u.grok_configured ? "configured" : "not set";
  const ollamaStatus = u.local_model_available ? "reachable" : "not reachable";
  const claude = modelChoiceList(CLAUDE_MODEL_CHOICES, u.model);
  const openai = modelChoiceList(OPENAI_MODEL_CHOICES, u.openai_model || "gpt-5-mini");
  const grok = modelChoiceList(GROK_MODEL_CHOICES, u.grok_model || "grok-4.5");
  const pick = (value, title, hint) =>
    `<button type="button" class="hud-model-pick${mode === value ? " active" : ""}" id="hud-model-use-${value}" data-inference-mode="${value}" title="${escapeHtml(hint)}">${escapeHtml(title)}</button>`;
  return `
    <div class="hud-dropdown-title">Running AI</div>
    <div class="hud-model-now">${escapeHtml(label)}</div>
    ${u.live_routing?.last_reroute ? `<div class="stub" id="hud-live-reroute">Rerouted ${escapeHtml(u.live_routing.last_reroute.from || "")} → ${escapeHtml(u.live_routing.last_reroute.to || "")}</div>` : (u.live_routing?.last_source ? `<div class="stub" id="hud-live-source">Last reply: ${escapeHtml(liveSourceLabel(u.live_routing.last_source) || u.live_routing.last_source)}</div>` : "")}
    <div class="hud-model-picks" role="group" aria-label="Inference mode">
      ${pick("cloud", "Cloud", "Claude / OpenAI / Grok")}
      ${pick("local", "Local", "Ollama only — no paid cloud calls")}
      ${pick("custom", "Custom", "Per-role routing in Settings")}
    </div>
    ${mode !== "local" ? `
      <label class="hud-dropdown-subtitle" for="hud-cloud-model">Claude</label>
      <select id="hud-cloud-model" class="hud-model-select" data-model-family="claude">
        ${claude.choices.map(([id, title]) => `<option value="${escapeHtml(id)}" ${id === claude.value ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}
      </select>
      <label class="hud-dropdown-subtitle" for="hud-openai-model">ChatGPT</label>
      <select id="hud-openai-model" class="hud-model-select" data-model-family="openai">
        ${openai.choices.map(([id, title]) => `<option value="${escapeHtml(id)}" ${id === openai.value ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}
      </select>
      <label class="hud-dropdown-subtitle" for="hud-grok-model">Grok</label>
      <select id="hud-grok-model" class="hud-model-select" data-model-family="grok">
        ${grok.choices.map(([id, title]) => `<option value="${escapeHtml(id)}" ${id === grok.value ? "selected" : ""}>${escapeHtml(title)}</option>`).join("")}
      </select>
    ` : ""}
    <div class="stub" style="padding:6px 0 2px;">Anthropic ${anthropicStatus} · OpenAI ${openaiStatus} · Grok ${grokStatus} · Ollama ${ollamaStatus}${u.local_model_available ? ` (${escapeHtml(shortModelName(u.local_model_name))})` : ""}</div>
    ${rows || '<div class="stub" style="padding:4px 0;">No routing data</div>'}
    <div class="hud-dropdown-divider"></div>
    <button type="button" class="secondary hud-dropdown-action" id="hud-model-setup-local">${u.local_model_available ? "Verify local AI" : "Set up local AI"}</button>
    <button type="button" class="secondary hud-dropdown-action" id="hud-model-settings">More in Settings</button>`;
}

async function refreshHudData() {
  try {
    const [usage, budget, practice, coinsRes, walletRes, about] = await Promise.all([
      api("/api/usage"),
      api("/api/budget/report"),
      api("/api/practice/summary").catch(() => ({ points: 0, streak: 0, total_attempts: 0 })),
      fetch("/api/coins").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/wallet").then(r => r.ok ? r.json() : null).catch(() => null),
      api("/api/about").catch(() => ({})),
    ]);
    if (about && about.offline_mode != null && usage.offline_mode == null) {
      usage.offline_mode = about.offline_mode;
    }
    HUD_DATA.usage = usage;
    HUD_DATA.budget = budget;
    HUD_DATA.practice = practice;
    HUD_DATA.coins = coinsRes;
    HUD_DATA.wallet = walletRes && !walletRes.error ? walletRes : null;

    const todayStr = localYmd();
    const weekAgoDate = new Date();
    weekAgoDate.setDate(weekAgoDate.getDate() - 6);
    const weekAgo = localYmd(weekAgoDate);
    let tokensToday = 0;
    let tokensWeek = 0;
    (budget.by_day || []).forEach(d => {
      if (d.date === todayStr) tokensToday = d.tokens || 0;
      if (d.date >= weekAgo) tokensWeek += d.tokens || 0;
    });
    HUD_DATA.tokensToday = tokensToday;
    HUD_DATA.tokensWeek = tokensWeek;
    const tokenCap = estimateDailyTokenCap(usage, budget);

    const tokensEl = document.getElementById("hud-tokens-label");
    if (tokensEl) tokensEl.textContent = `${formatCompactTokens(tokensToday)} / ${formatCompactTokens(tokenCap)} tokens`;

    const spent = budget.spent_today || 0;
    const cap = budget.daily_cap || 3;
    const pct = cap > 0 ? spent / cap : 0;
    const budgetText = document.getElementById("hud-budget-text");
    const budgetFill = document.getElementById("hud-budget-fill");
    if (budgetText) budgetText.textContent = `$${spent.toFixed(2)} / $${cap.toFixed(2)}`;
    if (budgetFill) {
      budgetFill.style.width = `${Math.min(100, pct * 100).toFixed(1)}%`;
      budgetFill.className = "hud-budget-fill" + (pct >= 0.8 ? " hud-budget-fill--red" : pct >= 0.5 ? " hud-budget-fill--amber" : " hud-budget-fill--green");
    }

    const coinBalance = coinsRes && coinsRes.balance != null ? coinsRes.balance : (practice.points || 0);
    const coinsEl = document.getElementById("hud-coins-label");
    if (coinsEl) coinsEl.textContent = `◉ ${coinBalance.toLocaleString()}`;

    const trophies = hudReadTrophiesCount();
    const trophiesEl = document.getElementById("hud-trophies-label");
    if (trophiesEl) trophiesEl.textContent = trophies ? `🏆 ${trophies.toLocaleString()}` : "🏆 —";

    const effectiveStreak = gameSyncPracticeStreak(practice.streak || 0);
    const streakEl = document.getElementById("hud-streak-label");
    if (streakEl) {
      const shieldMark = gameReadStreakShields() > 0 ? " 🛡" : (gameReadStreakOverlay() > 0 ? " 🛡" : "");
      streakEl.textContent = `🔥 ${effectiveStreak}d${shieldMark}`;
    }

    const modelChip = document.getElementById("hud-model-chip");
    if (modelChip) {
      const label = resolveModelChipLabel(usage);
      const mode = inferenceModeFromUsage(usage);
      modelChip.textContent = label;
      modelChip.classList.toggle("hud-chip--offline", mode === "local" || label.startsWith("API off") || label.includes("off"));
      modelChip.title = `Change running AI — ${label}. Tap to switch Cloud / Local / Custom.`;
    }
    updateHudStatusPill();
    const apiStreak = (HUD_DATA.practice && HUD_DATA.practice.streak) || 0;
    if (typeof gameCheckStreakMilestones === "function") gameCheckStreakMilestones(apiStreak);
    if (typeof gameUpdateHud === "function") gameUpdateHud();
  } catch (_) { /* tolerate HUD fetch failure */ }
}

function ensureModelChipReachable() {
  // Model routing is a status chip — keep it outside the collapsed metrics group
  // so it stays clickable without expanding the pill (and below 1100px where the
  // detail row is forced hidden even when expanded).
  const modelChip = document.getElementById("hud-model-chip");
  const detail = document.getElementById("hud-metrics-detail");
  const metrics = document.querySelector(".hud-metrics");
  if (!modelChip || !detail || !metrics || !detail.contains(modelChip)) return;
  const agentChip = document.getElementById("hud-agent-chip");
  if (agentChip && agentChip.parentElement === metrics) {
    metrics.insertBefore(modelChip, agentChip);
  } else {
    metrics.insertBefore(modelChip, detail.nextSibling);
  }
  modelChip.classList.add("hud-model-chip--status");
}

function initHudInteractions() {
  ensureModelChipReachable();
  initGameLayerInteractions();

  const statusPill = document.getElementById("hud-status-pill");
  if (statusPill) {
    statusPill.onclick = () => {
      if (HUD_DROPDOWN) { closeHudDropdown(); return; }
      setHudStatusExpanded(!HUD_STATUS_EXPANDED);
    };
  }

  const nowFocus = document.getElementById("hud-now-focus");
  if (nowFocus) nowFocus.onclick = () => focusPrimaryControl();

  const tokensBtn = document.getElementById("hud-tokens-btn");
  if (tokensBtn) tokensBtn.onclick = async () => {
    if (HUD_DROPDOWN) { closeHudDropdown(); return; }
    await refreshHudData();
    openHudDropdown(tokensBtn, tokensDropdownHtml());
    const mount = document.getElementById("hud-usage-widget-mount");
    const usageEl = document.getElementById("usage-widget");
    if (mount && usageEl) {
      mount.appendChild(usageEl);
      usageEl.style.display = "block";
      renderUsageWidget();
    }
  };

  const budgetBtn = document.getElementById("hud-budget-btn");
  if (budgetBtn) budgetBtn.onclick = async () => {
    if (HUD_DROPDOWN) { closeHudDropdown(); return; }
    await refreshHudData();
    openHudDropdown(budgetBtn, budgetDropdownHtml(), {
      "hud-budget-settings": () => goToTab("Settings"),
    });
  };

  // Coins live inside the consolidated loot cluster (#hud-xp-btn / #hud-coins-label).
  // Coin Road opens via WaypointLoot capture on #hud-coins-label; no separate dropdown.

  const trophiesBtn = document.getElementById("hud-trophies-btn");
  if (trophiesBtn) trophiesBtn.onclick = async () => {
    if (HUD_DROPDOWN) { closeHudDropdown(); return; }
    await refreshHudData();
    openHudDropdown(trophiesBtn, trophiesDropdownHtml(), {
      "hud-trophies-arcade": () => goToTab("Practice"),
    });
  };

  const streakBtn = document.getElementById("hud-streak-btn");
  if (streakBtn) streakBtn.onclick = async () => {
    if (HUD_DROPDOWN) { closeHudDropdown(); return; }
    await refreshHudData();
    openHudDropdown(streakBtn, streakDropdownHtml());
  };

  const modelChip = document.getElementById("hud-model-chip");
  if (modelChip) modelChip.onclick = async () => {
    if (HUD_DROPDOWN) { closeHudDropdown(); return; }
    await refreshHudData();
    openHudDropdown(modelChip, modelDropdownHtml(), {
      "hud-model-use-local": async () => {
        await setRunningInferenceMode("local");
        showToast("Local AI — Ollama only", "warn");
      },
      "hud-model-use-cloud": async () => {
        await setRunningInferenceMode("cloud");
        showToast("Cloud AI", "good");
      },
      "hud-model-use-custom": async () => {
        await setRunningInferenceMode("custom");
        openSettingsSection("inference-settings-card");
      },
      "hud-model-setup-local": async () => {
        openSettingsSection("settings-updates-card");
        if (typeof runLocalAiSetup === "function") runLocalAiSetup();
      },
      "hud-model-settings": () => openSettingsSection("inference-settings-card"),
    });
    const bindModelSelect = (id, family) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onchange = async () => {
        const value = el.value.trim();
        if (!value) return;
        try {
          await saveNamedCloudModel(family, value);
          await refreshHudData();
          if (typeof renderUsageWidget === "function") renderUsageWidget();
          showToast(`${family} model → ${value}`, "good");
        } catch (err) {
          showToast(errorMessage(err), "warn");
        }
      };
    };
    bindModelSelect("hud-cloud-model", "claude");
    bindModelSelect("hud-openai-model", "openai");
    bindModelSelect("hud-grok-model", "grok");
  };

  const agentChip = document.getElementById("hud-agent-chip");
  if (agentChip) {
    agentChip.onclick = async () => {
      if (HUD_DROPDOWN) { closeHudDropdown(); return; }
      await refreshGlobalAgentStatus();
      const statusEl = document.getElementById("global-agent-status");
      openHudDropdown(agentChip, `<div class="hud-dropdown-title">Agent</div><div id="hud-agent-mount"></div>`);
      const mount = document.getElementById("hud-agent-mount");
      if (mount && statusEl) {
        mount.appendChild(statusEl);
        statusEl.style.display = "block";
      }
    };
  }

  const pomoBtn = document.getElementById("hud-pomodoro-btn");
  if (pomoBtn) pomoBtn.onclick = () => {
    if (HUD_DROPDOWN) { closeHudDropdown(); return; }
    initPomodoroWidget();
    const widget = document.getElementById("pomodoro-widget");
    if (!widget) return;
    openHudDropdown(pomoBtn, `<div class="hud-dropdown-title">Pomodoro</div><div id="hud-pomo-mount"></div>`);
    const mount = document.getElementById("hud-pomo-mount");
    if (mount) mount.appendChild(widget);
  };

  const settingsBtn = document.getElementById("hud-settings-btn");
  if (settingsBtn) {
    settingsBtn.title = "Settings & log off";
    settingsBtn.setAttribute("aria-label", "Settings and log off");
    settingsBtn.onclick = () => {
      if (HUD_DROPDOWN) { closeHudDropdown(); return; }
      openHudDropdown(settingsBtn, `
        <div class="hud-dropdown-title">System</div>
        <button type="button" class="secondary hud-dropdown-action" id="hud-open-settings">Open Settings</button>
        <button type="button" class="secondary hud-dropdown-action" id="hud-log-off">Log off</button>
        <p class="stub" style="margin:8px 0 0; font-size:10px; line-height:1.35;">Log off freezes the app for 10 minutes — a calm break with today's numbers. Long-press 2s to return early.</p>
      `, {
        "hud-open-settings": () => goToTab("Settings"),
        "hud-log-off": () => startLogOffBreak(),
      });
    };
  }
}

const LOG_OFF_MS = 10 * 60 * 1000;
let LOG_OFF_TIMER = null;
let LOG_OFF_RAF = null;
let LOG_OFF_ENDS_AT = 0;

function logOffTodayStats() {
  const budget = HUD_DATA.budget || {};
  const practice = HUD_DATA.practice || {};
  const questState = typeof gameEnsureQuestState === "function" ? gameEnsureQuestState() : { counters: {} };
  const counters = questState.counters || {};
  const painted = Number(counters.paint6 || 0) || 0;
  const tasksDone = Number(counters.tasks3 || 0) || 0;
  const pulses = Number(counters.pulse2 || 0) || 0;
  const xpToday = typeof gameReadXpToday === "function" ? gameReadXpToday() : 0;
  return {
    painted,
    tasksDone,
    pulses,
    xpToday,
    spent: budget.spent_today || 0,
    streak: practice.streak || 0,
  };
}

function ensureLogOffStyles() {
  if (document.getElementById("log-off-styles")) return;
  const style = document.createElement("style");
  style.id = "log-off-styles";
  style.textContent = `
    .log-off-overlay {
      position: fixed; inset: 0; z-index: 400000; display: flex; align-items: center; justify-content: center;
      padding: 24px; background:
        radial-gradient(ellipse 70% 50% at 50% 30%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%),
        linear-gradient(180deg, #0a0907 0%, #12100c 55%, #0c0a08 100%);
      color: var(--ink-primary); font-family: var(--font-ui);
      user-select: none; cursor: default;
    }
    .log-off-card {
      width: min(420px, 92vw); text-align: center; padding: 36px 28px 28px;
      border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-radius: 4px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: 0 24px 80px rgba(0,0,0,0.45);
    }
    .log-off-kicker {
      font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--ink-muted); margin-bottom: 10px;
    }
    .log-off-title {
      font-family: var(--font-display); font-size: clamp(28px, 5vw, 40px); font-weight: 700;
      letter-spacing: -0.02em; margin: 0 0 8px; color: var(--ink-primary);
    }
    .log-off-sub { font-size: 14px; color: var(--ink-secondary); margin: 0 0 22px; line-height: 1.45; }
    .log-off-countdown {
      font-family: var(--font-mono, ui-monospace, monospace); font-size: clamp(36px, 8vw, 52px);
      font-variant-numeric: tabular-nums; letter-spacing: 0.04em; margin: 0 0 22px;
      color: color-mix(in srgb, var(--accent) 70%, var(--ink-primary));
    }
    .log-off-stats {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; text-align: left; margin-bottom: 22px;
    }
    .log-off-stat { padding: 8px 10px; border: 1px solid var(--gridline); border-radius: 4px; background: color-mix(in srgb, var(--bg-shell) 70%, transparent); }
    .log-off-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-muted); }
    .log-off-stat-value { font-size: 18px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .log-off-hold {
      font-size: 11px; color: var(--ink-muted); line-height: 1.4;
      padding: 10px 12px; border: 1px dashed color-mix(in srgb, var(--border) 80%, transparent); border-radius: 4px;
    }
    .log-off-hold-bar {
      display: block; height: 2px; margin-top: 10px; border-radius: 1px;
      background: color-mix(in srgb, var(--ink-muted) 22%, transparent); overflow: hidden;
    }
    .log-off-hold-fill {
      display: block; height: 100%; width: 0%; background: var(--accent);
      transition: width 80ms linear;
    }
    .log-off-overlay.log-off-holding .log-off-hold { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); color: var(--ink-secondary); }
  `;
  document.head.appendChild(style);
}

function endLogOffBreak() {
  if (LOG_OFF_TIMER) { clearInterval(LOG_OFF_TIMER); LOG_OFF_TIMER = null; }
  if (LOG_OFF_RAF) { cancelAnimationFrame(LOG_OFF_RAF); LOG_OFF_RAF = null; }
  LOG_OFF_ENDS_AT = 0;
  document.getElementById("log-off-overlay")?.remove();
}

async function startLogOffBreak() {
  closeHudDropdown();
  ensureLogOffStyles();
  endLogOffBreak();
  try { if (typeof gamePollQuestProgress === "function") await gamePollQuestProgress(); } catch (_) {}
  try { if (typeof refreshHudData === "function") await refreshHudData(); } catch (_) {}
  const stats = logOffTodayStats();
  LOG_OFF_ENDS_AT = Date.now() + LOG_OFF_MS;
  const overlay = document.createElement("div");
  overlay.id = "log-off-overlay";
  overlay.className = "log-off-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Log off break");
  overlay.innerHTML = `
    <div class="log-off-card">
      <div class="log-off-kicker">Waypoint · log off</div>
      <h1 class="log-off-title">Take a break</h1>
      <p class="log-off-sub">App frozen for 10 minutes. Today&apos;s compiled numbers stay with you.</p>
      <div class="log-off-countdown" id="log-off-countdown">10:00</div>
      <div class="log-off-stats">
        <div class="log-off-stat"><div class="log-off-stat-label">Hours painted</div><div class="log-off-stat-value">${escapeHtml(String(stats.painted))}</div></div>
        <div class="log-off-stat"><div class="log-off-stat-label">Tasks done</div><div class="log-off-stat-value">${escapeHtml(String(stats.tasksDone))}</div></div>
        <div class="log-off-stat"><div class="log-off-stat-label">Pulses</div><div class="log-off-stat-value">${escapeHtml(String(stats.pulses))}</div></div>
        <div class="log-off-stat"><div class="log-off-stat-label">XP today</div><div class="log-off-stat-value">${escapeHtml(String(stats.xpToday))}</div></div>
      </div>
      <div class="log-off-hold" id="log-off-hold" title="Press and hold for 2 seconds to return early">
        Hold 2 seconds to return early
        <span class="log-off-hold-bar" aria-hidden="true"><span class="log-off-hold-fill" id="log-off-hold-fill"></span></span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const countdown = document.getElementById("log-off-countdown");
  const tick = () => {
    const left = Math.max(0, LOG_OFF_ENDS_AT - Date.now());
    const sec = Math.ceil(left / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (countdown) countdown.textContent = `${m}:${String(s).padStart(2, "0")}`;
    if (left <= 0) endLogOffBreak();
  };
  tick();
  LOG_OFF_TIMER = setInterval(tick, 250);

  const holdEl = document.getElementById("log-off-hold");
  const fill = document.getElementById("log-off-hold-fill");
  let holdStart = 0;
  const HOLD_MS = 2000;
  const onHoldStart = e => {
    e.preventDefault();
    holdStart = Date.now();
    overlay.classList.add("log-off-holding");
    const step = () => {
      if (!holdStart) return;
      const p = Math.min(1, (Date.now() - holdStart) / HOLD_MS);
      if (fill) fill.style.width = `${(p * 100).toFixed(1)}%`;
      if (p >= 1) { holdStart = 0; endLogOffBreak(); return; }
      LOG_OFF_RAF = requestAnimationFrame(step);
    };
    LOG_OFF_RAF = requestAnimationFrame(step);
  };
  const onHoldEnd = () => {
    holdStart = 0;
    overlay.classList.remove("log-off-holding");
    if (fill) fill.style.width = "0%";
    if (LOG_OFF_RAF) { cancelAnimationFrame(LOG_OFF_RAF); LOG_OFF_RAF = null; }
  };
  holdEl?.addEventListener("pointerdown", onHoldStart);
  holdEl?.addEventListener("pointerup", onHoldEnd);
  holdEl?.addEventListener("pointerleave", onHoldEnd);
  holdEl?.addEventListener("pointercancel", onHoldEnd);
  // Block casual dismiss / keyboard shortcuts while logged off
  overlay.addEventListener("keydown", e => { e.stopPropagation(); });
  overlay.tabIndex = -1;
  overlay.focus();
}

async function renderUsageWidget() {
  const u = await api("/api/usage");
  const el = document.getElementById("usage-widget");
  const routeRows = u.routing ? ["chat", "planning", "judgment", "tasks", "practice", "coding"].map(role => {
    const r = u.routing[role];
    return `<div style="display:flex; justify-content:space-between; gap:6px; margin-top:2px;"><span>${role}</span><span title="${escapeHtml(r.model)}">${escapeHtml(r.backend)}</span></div>`;
  }).join("") : `<div style="margin:2px 0 6px;">model: ${escapeHtml(u.model)}</div>`;
  el.innerHTML = `
    <div>${u.total_tokens.toLocaleString()} tokens ~ $${u.estimated_cost_usd.toFixed(2)}</div>
    <div style="margin:6px 0; padding:6px; border:1px solid var(--border); border-radius:8px; background:var(--bg-shell);">
      <div style="font-weight:700; color:var(--ink-secondary); margin-bottom:3px;">model routes</div>
      ${routeRows}
    </div>
    <div style="margin-bottom:6px; color:${u.local_model_available ? "var(--status-good)" : "var(--ink-muted)"};" title="Offline fallback for the daily summary only -- see claude_notes 'connect ollama when off wifi'">
      ${u.local_model_available ? `&#9679; offline fallback ready (${u.local_model_name})` : "&#9675; offline fallback: Ollama not reachable"}
    </div>
    <button class="secondary" id="api-toggle-btn" style="width:100%; font-size:11px; padding:5px;
      ${u.api_enabled ? "" : "border-color:var(--status-critical); color:var(--status-critical);"}">
      API: ${u.api_enabled ? "ON (click to stop)" : "OFF (click to resume)"}
    </button>
    <button class="secondary" id="backup-now-btn" style="width:100%; font-size:11px; padding:5px; margin-top:4px;">Backup all data now</button>
    <button class="secondary" id="trash-btn" style="width:100%; font-size:11px; padding:5px; margin-top:4px;">Recently deleted</button>
    <button class="secondary" id="theme-toggle-btn" style="width:100%; font-size:11px; padding:5px; margin-top:4px;">${document.documentElement.getAttribute("data-theme") === "light" ? "Switch to dark" : "Switch to light"}</button>`;
  document.getElementById("api-toggle-btn").onclick = async () => {
    await api("/api/usage/toggle", { method: "POST" });
    renderUsageWidget();
  };
  document.getElementById("backup-now-btn").onclick = async () => {
    const btn = document.getElementById("backup-now-btn");
    btn.innerHTML = '<span class="spinner"></span>Backing up...'; btn.disabled = true;
    const result = await api("/api/backup", { method: "POST" });
    showToast(`Backed up to: ${result.path}`, "good");
    btn.textContent = "Backup all data now"; btn.disabled = false;
  };
  document.getElementById("trash-btn").onclick = openTrashModal;
  document.getElementById("theme-toggle-btn").onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    renderUsageWidget();
  };
}

// "Recently deleted" -- undo for accidental deletes (claude_notes: "if i accidentally delete a
// big selection it still saved somewhere"). Covers tasks/projects/ideas/notes/contacts/
// competitions (db.RESTORE_TABLES); restoring brings back the row itself, not things like
// attachments or similarity-scan results that were cascade-deleted alongside it.
const TRASH_ENTITY_LABELS = { task: "Task", project: "Project", idea: "Idea", note: "Note", contact: "Contact", competition: "Competition/hackathon", customer: "Customer" };

async function openTrashModal() {
  const overlay = document.createElement("div");
  overlay.className = "wf-code-modal-overlay";
  overlay.innerHTML = `
    <div class="wf-code-modal" style="min-height:auto;">
      <strong style="font-size:13px;">Recently deleted</strong>
      <p class="stub" style="margin:0;">Restores the item itself. Keeps the last 50 deletions across the app.</p>
      <div id="trash-list" style="overflow-y:auto; max-height:50vh;"></div>
      <div style="display:flex; justify-content:flex-end;">
        <button type="button" class="secondary" id="trash-modal-close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("trash-modal-close").onclick = () => overlay.remove();

  const renderTrashList = async () => {
    const items = await api("/api/trash");
    const list = document.getElementById("trash-list");
    if (!list) return;
    list.innerHTML = items.length ? items.map(t => `
      <div class="card" style="margin-top:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div>
          <span class="pill">${TRASH_ENTITY_LABELS[t.entity_type] || t.entity_type}</span>
          <strong style="margin-left:6px;">${(t.label || "(untitled)")}</strong>
          <div class="stub">${new Date(t.deleted_at).toLocaleString()}</div>
        </div>
        <button type="button" class="primary trash-restore" data-id="${t.id}">Restore</button>
      </div>`).join("") : '<p class="stub">Nothing deleted recently.</p>';
    list.querySelectorAll(".trash-restore").forEach(btn => {
      btn.onclick = async () => {
        btn.textContent = "Restoring..."; btn.disabled = true;
        try {
          const result = await api(`/api/trash/${btn.dataset.id}/restore`, { method: "POST" });
          if (result.error) { showToast(result.error, "warn"); btn.textContent = "Restore"; btn.disabled = false; return; }
          await renderTrashList();
          render();
        } catch (err) {
          showToast(errorMessage(err), "warn");
          btn.textContent = "Restore"; btn.disabled = false;
        }
      };
    });
  };
  await renderTrashList();
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

// --- Moment of Triumph triggers -----------------------------------------

function readTriumphSeen() {
  try {
    const parsed = JSON.parse(localStorage.getItem("triumphSeen") || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_) {
    return new Set();
  }
}

function markTriumphSeen(key) {
  const seen = readTriumphSeen();
  seen.add(key);
  localStorage.setItem("triumphSeen", JSON.stringify([...seen]));
}

window.checkTriumph = function checkTriumph(key, config) {
  if (!key || readTriumphSeen().has(key)) return false;
  if (typeof window.momentOfTriumph !== "function") return false;
  markTriumphSeen(key);
  window.momentOfTriumph(config || {});
  return true;
};

let triumphCustomAppCount = null;

async function pollCustomAppTriumph() {
  try {
    const res = await fetch("/api/apps");
    if (!res.ok) return;
    const data = await res.json();
    const count = Array.isArray(data) ? data.length : 0;
    if (triumphCustomAppCount === null) {
      triumphCustomAppCount = count;
      return;
    }
    if (triumphCustomAppCount === 0 && count >= 1) {
      checkTriumph("first-custom-app", {
        title: "FIRST APP LIVE",
        subtitle: "Your custom app is published",
        workspace: "build",
      });
    }
    triumphCustomAppCount = count;
  } catch (_) {}
}

async function checkSevenDayFlameTriumph() {
  try {
    const s = await api("/api/practice/summary");
    if (typeof gameCheckStreakMilestones === "function") {
      gameCheckStreakMilestones(s.streak || 0);
      return;
    }
    if ((s.streak || 0) >= 7) {
      checkTriumph("seven-day-flame", {
        title: "SEVEN DAY FLAME",
        subtitle: `${s.streak} days of honest practice`,
        workspace: "play",
      });
    }
  } catch (_) {}
}

function checkLeaguePromotionTriumph() {
  try {
    const rival = JSON.parse(localStorage.getItem("arcadeRival") || "null");
    const league = rival && rival.league;
    if (!league) return;
    const storageKey = "triumphLastRivalLeague";
    const lastSeen = localStorage.getItem(storageKey);
    if (lastSeen === null) {
      localStorage.setItem(storageKey, league);
      return;
    }
    if (lastSeen === league) return;
    localStorage.setItem(storageKey, league);
    checkTriumph(`league-promotion-${String(league).toLowerCase().replace(/\s+/g, "-")}`, {
      title: String(league).toUpperCase(),
      subtitle: "League promoted",
      workspace: "play",
    });
  } catch (_) {}
}

function initTriumphTriggers() {
  checkLeaguePromotionTriumph();
  checkSevenDayFlameTriumph();
  pollCustomAppTriumph();
  setInterval(pollCustomAppTriumph, 5 * 60 * 1000);
}

// --- Toasts ----------------------------------------------------------------

function celebrate(opts) {
  if (document.body && document.body.classList.contains("scratchpad-open")) return;
  const intensity = window.WaypointLoot && typeof window.WaypointLoot.getConfettiMultiplier === "function"
    ? window.WaypointLoot.getConfettiMultiplier()
    : 1;
  const particleCount = Math.min(120, ((opts && opts.particleCount) || 48) * intensity);
  const duration = (opts && opts.duration) || 1000;
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100001;";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#fbbf24", "#f97316", "#22d3ee", "#a78bfa", "#22c55e", "#ec4899", "#eab308"];
  const particles = Array.from({ length: particleCount }, () => ({
    x: canvas.width * (0.3 + Math.random() * 0.4),
    y: canvas.height * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -6 - Math.random() * 10,
    size: 4 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 1,
  }));
  const start = performance.now();
  const frame = now => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    particles.forEach(p => {
      p.life = 1 - t / duration;
      if (p.life <= 0) return;
      alive += 1;
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (t < duration && alive > 0) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

window.celebrate = celebrate;

function initRewardThemes() {
  const themes = {
    aurora: { accent: "#22d3ee", glow: "rgba(34, 211, 238, 0.32)" },
    ember: { accent: "#f97316", glow: "rgba(249, 115, 22, 0.32)" },
    solstice: { accent: "#eab308", glow: "rgba(234, 179, 8, 0.28)" },
  };
  const active = localStorage.getItem("activeTheme");
  if (active && themes[active]) {
    document.documentElement.style.setProperty("--accent", themes[active].accent);
    document.documentElement.style.setProperty("--glow-accent", themes[active].glow);
  }
  if (localStorage.getItem("activeWallpaper") === "midnight" && localStorage.getItem("perkMidnight") === "1") {
    document.body.style.background = "radial-gradient(ellipse 80% 60% at 50% 0%, #1e1b4b 0%, #0c0a14 45%, #030712 100%)";
    document.body.style.backgroundAttachment = "fixed";
  }
}

function initToastRoot() {
  if (document.getElementById("toast-root")) return;
  const root = document.createElement("div");
  root.id = "toast-root";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.style.cssText = "position:fixed; bottom:max(16px, env(safe-area-inset-bottom)); right:max(16px, env(safe-area-inset-right)); z-index:100000; display:flex; flex-direction:column-reverse; gap:8px; pointer-events:none; max-width:min(360px, 90vw);";
  document.body.appendChild(root);
}

function showToast(message, kind = "info") {
  initToastRoot();
  const root = document.getElementById("toast-root");
  const normalizedKind = ({ bad: "warn", error: "warn", warning: "warn" })[kind] || kind;
  const styles = {
    info: { border: "var(--border)", bg: "var(--bg-card)", color: "var(--ink-primary)" },
    good: { border: "var(--status-good)", bg: "color-mix(in srgb, var(--status-good) 14%, var(--bg-card))", color: "var(--ink-primary)" },
    warn: { border: "var(--status-warning)", bg: "color-mix(in srgb, var(--status-warning) 14%, var(--bg-card))", color: "var(--ink-primary)" },
  };
  const s = styles[normalizedKind] || styles.info;
  while (root.children.length >= 3) root.firstChild.remove();
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.style.cssText = `pointer-events:auto; padding:10px 14px; border-radius:8px; border:1px solid ${s.border}; background:${s.bg}; color:${s.color}; font-size:13px; line-height:1.4; box-shadow:0 4px 16px rgba(0,0,0,0.25); cursor:pointer; transition:opacity 200ms ease, transform 200ms var(--ease-out, ease);`;
  toast.textContent = message;
  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px) translateX(4px)";
    setTimeout(() => toast.remove(), 200);
  };
  const timer = setTimeout(dismiss, 3500);
  toast.onclick = () => { clearTimeout(timer); dismiss(); };
  root.appendChild(toast);
  if (normalizedKind === "good" && localStorage.getItem("perkConfetti") === "1") celebrate({ particleCount: 36, duration: 1000 });
}

window.showToast = showToast;

// --- Quick capture -------------------------------------------------------

const NAPKIN_STORAGE_KEY = "waypointNapkin";
const CAPTURE_DRAFT_KEY = "waypointCaptureDraftV1";

function firstDetailsLine(details) {
  return String(details || "")
    .split(/\n/)
    .map(line => line.trim())
    .find(line => line && !/^!\[/.test(line)) || "";
}

function readCaptureDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(CAPTURE_DRAFT_KEY) || "null");
    if (draft && typeof draft === "object" && Date.now() - (draft.at || 0) < 36 * 3600 * 1000) return draft;
  } catch (_) {}
  return null;
}

function writeCaptureDraft(payload) {
  try {
    localStorage.setItem(CAPTURE_DRAFT_KEY, JSON.stringify({ ...payload, at: Date.now() }));
  } catch (_) {}
}

function clearCaptureDraft() {
  try { localStorage.removeItem(CAPTURE_DRAFT_KEY); } catch (_) {}
}

function playCaptureSuccess() {
  document.getElementById("wp-capture-success")?.remove();
  const el = document.createElement("div");
  el.id = "wp-capture-success";
  el.className = "wp-capture-success";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<svg viewBox="0 0 96 96" fill="none"><circle cx="48" cy="48" r="30" stroke="currentColor" stroke-width="7"/><path d="M30 50l12 12 24-26" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  document.body.appendChild(el);
  document.body.classList.add("wp-capture-flash");
  setTimeout(() => {
    el.remove();
    document.body.classList.remove("wp-capture-flash");
  }, 760);
}

window.wpCaptureDraft = { read: readCaptureDraft, write: writeCaptureDraft, clear: clearCaptureDraft };
window.wpPlayCaptureSuccess = playCaptureSuccess;

const QUICK_CAPTURE_TYPES = [
  { id: "feedback", label: "Feedback", tab: null, place: "Napkin" },
  { id: "napkin", label: "Napkin", tab: null, place: "Napkin" },
  { id: "scribble", label: "Scribble", tab: null, place: "Napkin" },
  { id: "task", label: "Task", tab: "Tasks", place: "Tasks" },
  { id: "idea", label: "Idea", tab: "Ideas", place: "Ideas" },
  { id: "thought", label: "Thought", tab: "Thinking", place: "Thinking" },
  { id: "funny", label: "Funny", tab: "Funny", place: "Funny" },
  { id: "event", label: "Event", tab: "Events", place: "Events" },
  { id: "contact", label: "Contact", tab: "Contacts", place: "Contacts" },
];
const QC_PRIMARY_IDS = new Set(["feedback", "napkin", "task", "idea"]);

function isNapkinCaptureType(type) {
  return type === "napkin" || type === "feedback" || type === "scribble";
}

let quickCaptureOverlay = null;

function readNapkinBlob() {
  try {
    const blob = JSON.parse(localStorage.getItem(NAPKIN_STORAGE_KEY) || "null");
    if (blob && Array.isArray(blob.entries)) return blob;
  } catch (_) {}
  return { version: 1, entries: [] };
}

// localStorage stays the source of truth so the airlock still works with no server, but the
// notes are also mirrored server-side: that copy is what lands in git (plan/NAPKIN.md) and
// what makes a note pinned on the phone visible on the laptop.
let napkinAirlockRefresh = null;

function applyServerNapkinEntries(entries) {
  if (!Array.isArray(entries)) return;
  localStorage.setItem(NAPKIN_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  if (typeof napkinAirlockRefresh === "function") {
    try { napkinAirlockRefresh(); } catch (_) {}
  }
}

function syncNapkinToServer(entries, deletedIds) {
  try {
    return api("/api/napkin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: entries, deleted: deletedIds || [] }),
    }).then(data => {
      if (data && Array.isArray(data.entries)) applyServerNapkinEntries(data.entries);
      return data;
    }).catch(err => console.warn("napkin sync deferred:", errorMessage(err)));
  } catch (err) {
    console.warn("napkin sync unavailable:", err);
    return Promise.resolve(null);
  }
}

// writeNapkinBlob only fires on add/delete, so notes pinned before this sync existed -- or
// while the server was down -- would sit in localStorage forever and never reach git. Push
// whatever is already stored once per load so nothing is stranded.
function bootstrapNapkinSync() {
  try {
    const entries = readNapkinBlob().entries;
    if (entries.length) syncNapkinToServer(entries, []);
  } catch (err) {
    console.warn("napkin bootstrap sync skipped:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapNapkinSync);
} else {
  bootstrapNapkinSync();
}

function writeNapkinBlob(blob, deletedIds) {
  const entries = Array.isArray(blob.entries) ? blob.entries : [];
  localStorage.setItem(NAPKIN_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  // Deletions must travel explicitly: the server unions entries across devices, so a
  // crumpled note would otherwise come straight back on the next sync from the other one.
  syncNapkinToServer(entries, deletedIds);
}

function napkinEntryText(entry) {
  return [entry.title, entry.details].filter(Boolean).join("\n\n");
}

function copyNapkinText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.cssText = "position:fixed; opacity:0; pointer-events:none;";
  document.body.appendChild(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard unavailable"));
}

function ensureNapkinStyles() {
  if (document.getElementById("napkin-airlock-styles")) return;
  const style = document.createElement("style");
  style.id = "napkin-airlock-styles";
  style.textContent = `
    .napkin-airlock { padding:10px 14px 12px; background:var(--bg-shell); border-bottom:1px solid var(--border); }
    .napkin-capture-dialog { display:flex; flex-direction:column; }
    .napkin-airlock-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:6px; }
    .napkin-entry-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:8px; max-height:min(36vh, 280px); overflow:auto; }
    .napkin-airlock-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:9px; }
    .napkin-airlock-head strong { font-family:var(--font-display); font-size:13px; }
    .napkin-airlock-head span { color:var(--ink-muted); font-size:10px; letter-spacing:.04em; text-transform:uppercase; }
    .napkin-airlock-tools { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:-4px 0 8px; }
    .napkin-airlock-tools input[type="search"] {
      flex:1; min-width:140px; font-size:12px; padding:5px 8px; border-radius:6px;
      border:1px solid var(--border); background:var(--bg-card); color:var(--ink-primary);
    }
    .napkin-entry-list { display:grid; gap:7px; max-height:min(48vh, 420px); overflow:auto; }
    .napkin-entry { position:relative; display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:8px; padding:9px 10px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card); transform-origin:50% 50%; }
    .napkin-entry-copy { min-width:0; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--ink-secondary); font-size:12px; line-height:1.4; }
    .napkin-entry-copy strong { display:block; color:var(--ink-primary); margin-bottom:2px; }
    .napkin-entry-time { display:block; margin-top:4px; color:var(--ink-muted); font-size:9px; }
    .napkin-entry-actions { display:flex; align-items:flex-start; gap:4px; }
    .napkin-entry-actions button { padding:3px 6px; min-height:24px; font-size:10px; }
    .napkin-empty { padding:13px; border:1px dashed var(--border); border-radius:5px; color:var(--ink-muted); font-size:12px; text-align:center; }
    .napkin-entry--crumpling { pointer-events:none; animation:napkin-crumple 320ms ease-in forwards; }
    .napkin-entry--accepted { border-color:color-mix(in srgb, var(--accent) 55%, var(--border)); background:color-mix(in srgb, var(--accent) 10%, var(--bg-card)); }
    .napkin-entry-accepted { display:block; margin-top:4px; color:var(--accent); font-size:9px; letter-spacing:.04em; text-transform:uppercase; }
    @keyframes napkin-crumple { 45% { transform:scale(.72) rotate(-3deg); filter:contrast(1.5); } 100% { transform:scale(.05) rotate(12deg); opacity:0; } }
    .command-palette-overlay:has(.napkin-capture-dialog) { align-items:flex-start; padding:2.5vh 18px 18px; }
    .napkin-capture-dialog.napkin-gg-doc {
      width:min(1280px, calc(100vw - 20px)) !important;
      max-height:min(96vh, 980px) !important;
    }
    .napkin-capture-head {
      display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      padding:12px 16px 8px; border-bottom:1px solid var(--border);
      font-family:var(--font-display); font-size:15px;
    }
    .napkin-capture-head .stub { font:10px var(--font-ui); text-transform:uppercase; letter-spacing:.08em; color:var(--ink-muted); }
    .napkin-spell-toggle { margin-left:auto; display:flex; align-items:center; gap:5px; font-size:11px; color:var(--ink-secondary); }
    .napkin-gg-body {
      font-family:"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif !important;
      font-size:18px !important; line-height:1.7 !important;
      min-height:62vh !important; padding:28px 36px !important;
    }
    .napkin-airlock { display:block; }
    #quick-capture-image-preview { padding:8px 16px 0; }
    #quick-capture-image-preview img { max-width:min(320px,100%); max-height:180px; border-radius:8px; display:block; }
    #quick-capture-image-preview:empty,
    #quick-capture-image-preview.wp-paste-void,
    #quick-capture-image-preview img[src=""],
    img.wp-paste-void { display:none !important; }
    .napkin-capture-dialog #quick-capture-title.napkin-title-hidden {
      position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0);
    }
    .wp-capture-success {
      position:fixed; inset:0; z-index:100070; pointer-events:none;
      display:grid; place-items:center;
    }
    .wp-capture-success svg {
      width:72px; height:72px; color:var(--accent, #c9a227);
      filter:drop-shadow(0 8px 24px rgba(12,10,8,.35));
      animation:wp-capture-stamp 720ms ease forwards;
    }
    @keyframes wp-capture-stamp {
      0% { transform:scale(.4) rotate(-8deg); opacity:0; }
      28% { transform:scale(1.12) rotate(2deg); opacity:1; }
      100% { transform:scale(1) rotate(0deg); opacity:0; }
    }
    .annotation-convert-popup { position:fixed; z-index:100002; display:flex; gap:5px; padding:5px; border:1px solid color-mix(in srgb, var(--accent) 40%, var(--border)); border-radius:999px; background:var(--bg-card); box-shadow:0 8px 30px rgba(0,0,0,.35); }
    .annotation-convert-popup button { padding:5px 9px; border-radius:999px; font-size:11px; white-space:nowrap; }
    @media (max-width:460px) { .napkin-entry { grid-template-columns:1fr; } .napkin-entry-actions { flex-wrap:wrap; } }
  `;
  document.head.appendChild(style);
}

function setQuickCaptureAirlock(open) {
  document.body.classList.toggle("scratchpad-open", open);
  if (typeof window.setLauncherAmbientPaused === "function") {
    window.setLauncherAmbientPaused(open);
  }
}

function openQuickCapture(options = {}) {
  if (AUTOMATION_STUDIO_OPEN) return;
  if (!options || options instanceof Event) options = {};
  if (quickCaptureOverlay) {
    if (options.type) {
      quickCaptureOverlay.querySelector(`.quick-capture-chip[data-type="${options.type}"]`)?.click();
    }
    const existingTitle = quickCaptureOverlay.querySelector("#quick-capture-title");
    const existingDetails = quickCaptureOverlay.querySelector("#quick-capture-details");
    if (typeof options.title === "string" && existingTitle) existingTitle.value = options.title;
    if (typeof options.details === "string" && existingDetails) existingDetails.value = options.details;
    const reopenType = options.type || quickCaptureOverlay.querySelector(".quick-capture-chip.active")?.dataset.type || "feedback";
    if (isNapkinCaptureType(reopenType)) existingDetails?.focus();
    else existingTitle?.focus();
    return;
  }
  ensureNapkinStyles();
  const savedType = options.type || "feedback";
  let selectedType = QUICK_CAPTURE_TYPES.some(t => t.id === savedType) ? savedType : "feedback";
  let qcEsc = null;

  const close = ({ keepDraft = true } = {}) => {
    if (quickCaptureOverlay) {
      if (keepDraft) {
        const t = quickCaptureOverlay.querySelector("#quick-capture-title")?.value || "";
        const d = quickCaptureOverlay.querySelector("#quick-capture-details")?.value || "";
        if (!t.trim() && !d.trim()) clearCaptureDraft();
        else writeCaptureDraft({ title: t, details: d, type: selectedType });
      }
      quickCaptureOverlay.remove();
      quickCaptureOverlay = null;
    }
    napkinAirlockRefresh = null;
    if (qcEsc) document.removeEventListener("keydown", qcEsc);
    setQuickCaptureAirlock(false);
  };

  quickCaptureOverlay = document.createElement("div");
  quickCaptureOverlay.className = "command-palette-overlay";
  quickCaptureOverlay.innerHTML = `
    <div class="command-palette napkin-capture-dialog napkin-gg-doc" role="dialog" aria-label="Quick capture">
      <div class="napkin-capture-head">Quick capture <span class="stub">airlock</span>
        <label class="napkin-spell-toggle"><input type="checkbox" id="napkin-spellcheck"> Spelling</label>
        <button type="button" class="ghost compact" id="napkin-browse-all" title="Browse every local napkin">Browse all</button>
        <button type="button" class="ghost compact" id="napkin-open-boards" title="Docs, Sheets, Slides">Boards</button>
      </div>
      <div id="quick-capture-chips" style="display:flex; flex-wrap:wrap; gap:6px; padding:10px 16px; border-bottom:1px solid var(--border);"></div>
      <input type="text" id="quick-capture-title" placeholder="Title or name..." autocomplete="off" spellcheck="true"
        style="width:100%; border:none; border-bottom:1px solid var(--border); border-radius:0; padding:14px 16px; font-size:16px; background:color-mix(in srgb, var(--bg-shell) 75%, var(--accent) 8%); color:var(--ink-primary); box-shadow:none;">
      <textarea id="quick-capture-details" class="napkin-gg-body" placeholder="Keep scribbling here — this is the only writing area" rows="14"
        style="width:100%; border:none; border-bottom:1px solid var(--border); border-radius:0; background:var(--bg-card); color:var(--ink-primary); box-shadow:none; resize:vertical;"></textarea>
      <div id="quick-capture-image-preview" class="wp-paste-void" hidden></div>
      <section id="napkin-airlock" class="napkin-airlock">
        <div class="napkin-airlock-head">
          <strong>The Napkin</strong>
          <span>scratch first · compile all to git</span>
        </div>
        <div class="napkin-airlock-tools">
          <input type="search" id="napkin-search" placeholder="Search notes…" autocomplete="off">
          <button type="button" class="secondary compact" id="napkin-copy-all" title="Copy every note">Copy all</button>
          <button type="button" class="secondary compact" id="napkin-compile-git" title="Write every napkin note into ISSUES.md and commit">Compile all to git</button>
          <label class="stub" style="display:flex;align-items:center;gap:4px;">Density
            <select id="napkin-density">
              <option value="compact">compact</option>
              <option value="comfortable" selected>comfortable</option>
              <option value="roomy">roomy</option>
            </select>
          </label>
        </div>
        <div id="napkin-entry-list" class="napkin-entry-list" role="feed" aria-label="Napkin entries"></div>
      </section>
      <div class="quick-capture-foot">
        <span id="quick-capture-hint"><span class="kbd">Enter</span> capture <span class="kbd">Ctrl+Enter</span> compile <span class="kbd">Esc</span> close</span>
        <span style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="ghost compact" id="quick-capture-image" title="Attach or paste an image">Image</button>
          <button type="button" class="primary" id="quick-capture-submit" style="font-size:12px; padding:5px 12px;">Capture</button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(quickCaptureOverlay);
  setQuickCaptureAirlock(true);

  const chipsEl = quickCaptureOverlay.querySelector("#quick-capture-chips");
  const titleInput = quickCaptureOverlay.querySelector("#quick-capture-title");
  const detailsInput = quickCaptureOverlay.querySelector("#quick-capture-details");
  const napkinPanel = quickCaptureOverlay.querySelector("#napkin-airlock");
  const napkinList = quickCaptureOverlay.querySelector("#napkin-entry-list");
  const submitBtn = quickCaptureOverlay.querySelector("#quick-capture-submit");
  const captureHint = quickCaptureOverlay.querySelector("#quick-capture-hint");
  const compileBtn = quickCaptureOverlay.querySelector("#napkin-compile-git");
  const copyAllBtn = quickCaptureOverlay.querySelector("#napkin-copy-all");
  const napkinSearch = quickCaptureOverlay.querySelector("#napkin-search");
  let qcShowAllTypes = false;
  if (compileBtn) {
    compileBtn.onclick = async () => {
      compileBtn.disabled = true;
      try {
        const result = await api("/api/napkin/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: readNapkinBlob().entries, flush: true }),
        });
        const compiled = result?.compiled || {};
        const all = compiled.all ?? compiled.open ?? compiled.accepted ?? 0;
        showToast(
          all
            ? `Compiled ${all} napkin note(s) to git (${compiled.accepted || 0} accepted)`
            : "Compiled work queue to git",
          "good",
        );
      } catch (err) {
        showToast(errorMessage(err) || "Could not compile napkin to git", "warn");
      }
      compileBtn.disabled = false;
    };
  }
  if (copyAllBtn) {
    copyAllBtn.onclick = async () => {
      const text = readNapkinBlob().entries.map(napkinEntryText).filter(Boolean).join("\n\n---\n\n");
      if (!text) {
        showToast("Napkin is empty", "info");
        return;
      }
      try {
        await copyNapkinText(text);
        showToast("Copied every napkin note", "info");
      } catch (_) {
        showToast("Couldn't reach the clipboard", "warn");
      }
    };
  }
  if (napkinSearch) {
    napkinSearch.addEventListener("input", () => renderNapkinEntries());
  }
  const densitySel = quickCaptureOverlay.querySelector("#napkin-density");
  if (densitySel) {
    densitySel.value = localStorage.getItem("napkinDensity") || "comfortable";
    densitySel.onchange = () => {
      localStorage.setItem("napkinDensity", densitySel.value);
      document.documentElement.dataset.napkinDensity = densitySel.value;
    };
  }
  const spellBox = quickCaptureOverlay.querySelector("#napkin-spellcheck");
  if (spellBox) {
    const on = localStorage.getItem("waypointSpellcheck") !== "off";
    spellBox.checked = on;
    titleInput.setAttribute("spellcheck", on ? "true" : "false");
    detailsInput.setAttribute("spellcheck", on ? "true" : "false");
    spellBox.onchange = () => {
      localStorage.setItem("waypointSpellcheck", spellBox.checked ? "on" : "off");
      window.WaypointNapkinComplete?.applySpellcheck?.();
      titleInput.setAttribute("spellcheck", spellBox.checked ? "true" : "false");
      detailsInput.setAttribute("spellcheck", spellBox.checked ? "true" : "false");
    };
  }
  quickCaptureOverlay.querySelector("#napkin-browse-all")?.addEventListener("click", () => {
    napkinPanel.hidden = false;
    napkinSearch?.focus();
    napkinList?.scrollIntoView({ block: "nearest" });
    renderNapkinEntries();
  });
  quickCaptureOverlay.querySelector("#napkin-open-boards")?.addEventListener("click", () => {
    if (typeof window.wpOpenBoard === "function") window.wpOpenBoard("docs");
  });
  quickCaptureOverlay.querySelector("#quick-capture-image")?.addEventListener("click", () => {
    if (typeof window.wpPickImageFile === "function") {
      window.wpPickImageFile((url) => {
        const preview = document.getElementById("quick-capture-image-preview");
        if (!url) {
          if (preview) {
            preview.innerHTML = "";
            preview.hidden = true;
            preview.classList.add("wp-paste-void");
          }
          return;
        }
        const md = `![pasted](${url})`;
        detailsInput.value = (detailsInput.value ? `${detailsInput.value}\n` : "") + md;
        detailsInput.dispatchEvent(new Event("input", { bubbles: true }));
        detailsInput.focus();
        if (preview) {
          preview.hidden = false;
          preview.classList.remove("wp-paste-void");
          preview.innerHTML = `<img src="${escapeHtml(url)}" alt="pasted">`;
        }
      });
    }
  });

  titleInput.value = typeof options.title === "string" ? options.title : "";
  detailsInput.value = typeof options.details === "string" ? options.details : "";
  if (!titleInput.value && !detailsInput.value && !options.type) {
    const draft = readCaptureDraft();
    if (draft) {
      titleInput.value = draft.title || "";
      detailsInput.value = draft.details || "";
      if (draft.type && QUICK_CAPTURE_TYPES.some(t => t.id === draft.type)) selectedType = draft.type;
    }
  }
  let pendingNapkinPromoteId = null;
  let draftTimer = null;
  const persistDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const title = titleInput.value;
      const details = detailsInput.value;
      if (!title.trim() && !details.trim()) clearCaptureDraft();
      else writeCaptureDraft({ title, details, type: selectedType });
    }, 280);
  };
  titleInput.addEventListener("input", persistDraft);
  detailsInput.addEventListener("input", persistDraft);

  const crumpleNapkinEntry = (entryId, { animateEl } = {}) => {
    const finish = () => {
      const blob = readNapkinBlob();
      blob.entries = blob.entries.filter(item => item.id !== entryId);
      writeNapkinBlob(blob, [entryId]);
      if (pendingNapkinPromoteId === entryId) pendingNapkinPromoteId = null;
      renderNapkinEntries();
    };
    if (animateEl) {
      animateEl.classList.add("napkin-entry--crumpling");
      setTimeout(finish, 300);
    } else {
      finish();
    }
  };

  const renderNapkinEntries = () => {
    const blob = readNapkinBlob();
    const query = String(napkinSearch?.value || "").trim().toLowerCase();
    const entries = blob.entries
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .filter(entry => {
        if (!query) return true;
        return napkinEntryText(entry).toLowerCase().includes(query);
      });
    if (!blob.entries.length) {
      napkinList.innerHTML = `<div class="napkin-empty">Blank napkin. Nothing here becomes work until you pin it.</div>`;
      return;
    }
    if (!entries.length) {
      napkinList.innerHTML = `<div class="napkin-empty">No notes match that search.</div>`;
      return;
    }
    napkinList.innerHTML = entries.map(entry => {
      const when = entry.createdAt ? new Date(entry.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
      const staging = pendingNapkinPromoteId === entry.id;
      const accepted = !!entry.accepted;
      const classes = ["napkin-entry"];
      if (staging) classes.push("napkin-entry--staging");
      if (accepted) classes.push("napkin-entry--accepted");
      return `<article class="${classes.join(" ")}" data-napkin-id="${escapeHtml(entry.id)}">
        <div class="napkin-entry-copy">
          ${entry.title ? `<strong>${escapeHtml(entry.title)}</strong>` : ""}
          ${entry.kind === "scribble" ? `<small class="tsk-tag">scribble</small>` : ""}
          ${entry.details ? `<span>${escapeHtml(entry.details)}</span>` : ""}
          ${when ? `<small class="napkin-entry-time">${escapeHtml(when)}</small>` : ""}
          ${accepted ? `<small class="napkin-entry-accepted">Accepted · on the git work queue</small>` : ""}
          ${staging ? `<small class="napkin-entry-time">Staging in capture — save to lift it off the napkin</small>` : ""}
        </div>
        <div class="napkin-entry-actions">
          <button type="button" class="ghost" data-napkin-copy="${escapeHtml(entry.id)}" title="Copy entry">Copy</button>
          ${staging
            ? `<button type="button" class="ghost" data-napkin-cancel-promote="${escapeHtml(entry.id)}" title="Keep on napkin">Keep</button>`
            : `${accepted
              ? ""
              : `<button type="button" class="primary" data-napkin-accept="${escapeHtml(entry.id)}" title="Accept onto the git work queue">Accept</button>`}
          <button type="button" class="ghost" data-napkin-promote="task" data-napkin-id="${escapeHtml(entry.id)}" title="Promote to task">→ Task</button>
          <button type="button" class="ghost" data-napkin-promote="idea" data-napkin-id="${escapeHtml(entry.id)}" title="Promote to idea">→ Idea</button>`}
          <button type="button" class="ghost" data-napkin-crumple="${escapeHtml(entry.id)}" title="Crumple and delete" aria-label="Crumple and delete">⌁</button>
        </div>
      </article>`;
    }).join("");

    napkinList.querySelectorAll("[data-napkin-copy]").forEach(btn => {
      btn.onclick = async () => {
        const entry = readNapkinBlob().entries.find(item => item.id === btn.dataset.napkinCopy);
        if (!entry) return;
        try {
          await copyNapkinText(napkinEntryText(entry));
          showToast("Napkin entry copied", "info");
        } catch (_) {
          showToast("Couldn't reach the clipboard", "warn");
        }
      };
    });
    napkinList.querySelectorAll("[data-napkin-promote]").forEach(btn => {
      btn.onclick = () => {
        const entry = readNapkinBlob().entries.find(item => item.id === btn.dataset.napkinId);
        if (!entry) return;
        pendingNapkinPromoteId = entry.id;
        selectedType = btn.dataset.napkinPromote;
        titleInput.value = entry.title || String(entry.details || "").split(/\n/)[0].slice(0, 140);
        detailsInput.value = entry.details || "";
        renderChips();
        renderNapkinEntries();
        titleInput.focus();
        titleInput.select();
        showToast("Filled capture — save to lift it off the napkin", "info");
      };
    });
    napkinList.querySelectorAll("[data-napkin-cancel-promote]").forEach(btn => {
      btn.onclick = () => {
        pendingNapkinPromoteId = null;
        selectedType = "napkin";
        renderChips();
        renderNapkinEntries();
      };
    });
    napkinList.querySelectorAll("[data-napkin-crumple]").forEach(btn => {
      btn.onclick = () => {
        crumpleNapkinEntry(btn.dataset.napkinCrumple, { animateEl: btn.closest(".napkin-entry") });
      };
    });
    napkinList.querySelectorAll("[data-napkin-accept]").forEach(btn => {
      btn.onclick = async () => {
        const entry = readNapkinBlob().entries.find(item => item.id === btn.dataset.napkinAccept);
        if (!entry) return;
        btn.disabled = true;
        try {
          const result = await api("/api/napkin/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: entry.id,
              title: entry.title,
              details: entry.details,
              createdAt: entry.createdAt,
              flush: true,
            }),
          });
          if (result && Array.isArray(result.entries)) {
            applyServerNapkinEntries(result.entries);
          } else {
            const blob = readNapkinBlob();
            blob.entries = blob.entries.map(item => item.id === entry.id
              ? { ...item, accepted: true, acceptedAt: new Date().toISOString() }
              : item);
            writeNapkinBlob(blob);
          }
          renderNapkinEntries();
          showToast("Accepted — on the git work queue", "good");
        } catch (err) {
          showToast(errorMessage(err) || "Could not accept napkin note", "warn");
          btn.disabled = false;
        }
      };
    });
  };
  napkinAirlockRefresh = renderNapkinEntries;

  const renderChips = () => {
    const visible = qcShowAllTypes
      ? QUICK_CAPTURE_TYPES
      : QUICK_CAPTURE_TYPES.filter(t => QC_PRIMARY_IDS.has(t.id) || t.id === selectedType);
    chipsEl.innerHTML = visible.map(t => `
      <button type="button" class="pill quick-capture-chip ${t.id === selectedType ? "active" : ""}" data-type="${escapeHtml(t.id)}"
        style="cursor:pointer; ${t.id === selectedType ? "border-color:var(--accent); background:color-mix(in srgb, var(--accent) 18%, var(--bg-card));" : ""}">${escapeHtml(t.label)}</button>`).join("")
      + (!qcShowAllTypes && visible.length < QUICK_CAPTURE_TYPES.length
        ? `<button type="button" class="pill" id="qc-more-types" title="More capture types" style="cursor:pointer;">More</button>`
        : "")
      + (typeof window.stylePaintEnterMode === "function"
        ? `<button type="button" class="pill" id="quick-capture-paint" title="Paint the interface" style="cursor:pointer; margin-left:auto;">◈ Paint</button>`
        : "");
    chipsEl.querySelectorAll(".quick-capture-chip").forEach(btn => {
      btn.onclick = () => {
        selectedType = btn.dataset.type;
        renderChips();
        if (isNapkinCaptureType(selectedType)) detailsInput.focus();
        else titleInput.focus();
      };
    });
    chipsEl.querySelector("#qc-more-types")?.addEventListener("click", () => {
      qcShowAllTypes = true;
      renderChips();
    });
    const paintBtn = chipsEl.querySelector("#quick-capture-paint");
    if (paintBtn) {
      paintBtn.onclick = () => {
        close();
        window.stylePaintEnterMode("aurora");
      };
    }
    const napkinSelected = isNapkinCaptureType(selectedType);
    napkinPanel.hidden = false;
    titleInput.classList.toggle("napkin-title-hidden", napkinSelected);
    titleInput.placeholder = napkinSelected ? "Title (auto from first line)" : "Title or name...";
    detailsInput.placeholder = napkinSelected ? "Keep scribbling here — this is the only writing area" : "Details (optional)";
    detailsInput.rows = napkinSelected ? 14 : 6;
    detailsInput.classList.toggle("napkin-gg-body", napkinSelected);
    submitBtn.textContent = napkinSelected ? "Pin to napkin" : "Capture";
    captureHint.innerHTML = napkinSelected
      ? `<span class="kbd">Enter</span> pin · <span class="kbd">Ctrl+Enter</span> compile all to git`
      : `<span class="kbd">Enter</span> capture <span class="kbd">Ctrl+Enter</span> compile <span class="kbd">Esc</span> close`;
    renderNapkinEntries();
  };
  renderChips();

  const submit = async () => {
    const details = detailsInput.value.trim();
    let title = titleInput.value.trim() || firstDetailsLine(details).slice(0, 140);
    const typeMeta = QUICK_CAPTURE_TYPES.find(t => t.id === selectedType);
    if (!typeMeta) return;
    if (!title && !(isNapkinCaptureType(selectedType) && details)) {
      showToast(isNapkinCaptureType(selectedType) ? "Give the napkin something to hold" : "Enter a title or name", "warn");
      (isNapkinCaptureType(selectedType) ? detailsInput : titleInput).focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      const today = localYmd();
      // The captured text itself already lands in its own table; this records the ACT of
      // capturing so the trail shows what was created from where.
      if (typeof recordActivity === "function") {
        recordActivity("action", null, `capture:${selectedType}`, title);
      }
      if (isNapkinCaptureType(selectedType)) {
        if (selectedType === "napkin" && window.WaypointNapkinComplete?.scribbleToPlace?.(details)) {
          selectedType = "scribble";
        }
        let pinTitle = title || firstDetailsLine(details).slice(0, 140);
        if (!titleInput.value.trim() && details) {
          try {
            const named = await api("/api/napkin/title", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ details }),
            });
            if (named?.title) pinTitle = named.title;
          } catch (_) {}
        }
        const blob = readNapkinBlob();
        blob.entries.unshift({
          id: window.crypto && typeof window.crypto.randomUUID === "function"
            ? window.crypto.randomUUID()
            : `napkin-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title: pinTitle,
          details,
          kind: selectedType === "scribble" ? "scribble" : "note",
          createdAt: new Date().toISOString(),
        });
        writeNapkinBlob(blob);
        localStorage.setItem("quickCaptureType", selectedType);
        titleInput.value = "";
        detailsInput.value = "";
        clearCaptureDraft();
        submitBtn.disabled = false;
        submitBtn.textContent = "Pin to napkin";
        renderNapkinEntries();
        playCaptureSuccess();
        detailsInput.focus();
        return;
      } else if (selectedType === "task") {
        await api("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, urgency: "medium", notes: details || undefined }) });
      } else if (selectedType === "idea") {
        await api("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body: details }) });
      } else if (selectedType === "thought") {
        await api("/api/lists/thinking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body: details }) });
      } else if (selectedType === "funny") {
        await api("/api/lists/funny", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body: details }) });
      } else if (selectedType === "event") {
        await api("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description: details, date: today }) });
      } else if (selectedType === "contact") {
        await api("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: title, what_they_do: details }) });
      }
      localStorage.setItem("quickCaptureType", selectedType);
      if (pendingNapkinPromoteId) {
        crumpleNapkinEntry(pendingNapkinPromoteId);
        pendingNapkinPromoteId = null;
      }
      clearCaptureDraft();
      playCaptureSuccess();
      if (window.WaypointGame && typeof window.WaypointGame.questProgress === "function") {
        window.WaypointGame.questProgress("capture3", 1);
      }
      close({ keepDraft: false });
      if (typeMeta.tab && ACTIVE_TAB === typeMeta.tab) render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
      submitBtn.disabled = false;
      submitBtn.textContent = isNapkinCaptureType(selectedType) ? "Pin to napkin" : "Capture";
    }
  };

  quickCaptureOverlay.querySelector("#quick-capture-submit").onclick = submit;
  titleInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  detailsInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
    if (e.key === "Enter" && !e.shiftKey && isNapkinCaptureType(selectedType)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  quickCaptureOverlay.addEventListener("mousedown", e => { if (e.target === quickCaptureOverlay) close(); });
  qcEsc = e => {
    if (e.key === "Escape" && quickCaptureOverlay) { e.preventDefault(); close(); }
  };
  document.addEventListener("keydown", qcEsc);
  if (isNapkinCaptureType(selectedType)) detailsInput.focus();
  else titleInput.focus();
}

function initSelectionCapture() {
  if (window.__waypointSelectionCapture) return;
  window.__waypointSelectionCapture = true;
  ensureNapkinStyles();
  const plannerTabs = new Set(["Today", "Tasks", "Goals", "Calendar", "Events", "Trends"]);
  let popup = null;

  const dismiss = () => {
    if (popup) popup.remove();
    popup = null;
  };
  const showForSelection = () => {
    dismiss();
    if (!plannerTabs.has(ACTIVE_TAB) || quickCaptureOverlay) return;
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    if (!selection || selection.rangeCount !== 1 || text.length < 2) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const main = document.getElementById("main");
    if (!container || !main || !main.contains(container) || container.closest("input, textarea, [contenteditable='true']")) return;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    popup = document.createElement("div");
    popup.className = "annotation-convert-popup";
    popup.setAttribute("role", "toolbar");
    popup.setAttribute("aria-label", "Convert selected text");
    popup.innerHTML = `<button type="button" class="primary" data-selection-capture="task">→ Task</button>
      <button type="button" class="ghost" data-selection-capture="event">→ Event</button>`;
    document.body.appendChild(popup);
    const popupRect = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - popupRect.width - 8, rect.left + rect.width / 2 - popupRect.width / 2))}px`;
    popup.style.top = `${Math.max(8, rect.top - popupRect.height - 8)}px`;
    popup.querySelectorAll("[data-selection-capture]").forEach(btn => {
      btn.onclick = () => {
        const compact = text.replace(/\s+/g, " ");
        const title = compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
        const details = title === text ? "" : text;
        dismiss();
        selection.removeAllRanges();
        openQuickCapture({ type: btn.dataset.selectionCapture, title, details });
      };
    });
  };

  document.addEventListener("pointerup", e => {
    if (e.target.closest(".annotation-convert-popup")) return;
    setTimeout(showForSelection, 0);
  });
  document.addEventListener("keyup", e => {
    if (e.key === "Shift" || e.shiftKey) setTimeout(showForSelection, 0);
  });
  document.addEventListener("pointerdown", e => {
    if (popup && !e.target.closest(".annotation-convert-popup")) dismiss();
  });
  window.addEventListener("scroll", dismiss, true);
}

function initQuickCaptureFab() {
  if (document.getElementById("quick-capture-fab")) return;
  const fab = document.createElement("button");
  fab.id = "quick-capture-fab";
  fab.type = "button";
  fab.className = "quick-capture-fab";
  fab.title = "Quick capture (Ctrl+Shift+A)";
  fab.setAttribute("aria-label", "Quick capture");
  fab.textContent = "+";
  fab.style.cssText = "position:fixed; bottom:calc(56px + max(16px, env(safe-area-inset-bottom))); right:max(16px, env(safe-area-inset-right)); z-index:99990; width:48px; height:48px; border-radius:50%; border:1px solid var(--border); background:var(--accent); color:var(--bg-shell); font-size:28px; line-height:1; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; padding:0;";
  fab.onclick = openQuickCapture;
  document.body.appendChild(fab);
}

// --- Sidebar clock -------------------------------------------------------

function initSidebarClock() {
  /* clock removed with sidebar — HUD shows date via streak/metrics context */
}

// --- Pomodoro focus timer ------------------------------------------------

const POMODORO_FOCUS_SEC = 25 * 60;
const POMODORO_BREAK_SEC = 5 * 60;
const BASE_DOCUMENT_TITLE = "Waypoint";
let pomodoroPhase = "focus";
let pomodoroRemaining = POMODORO_FOCUS_SEC;
let pomodoroRunning = false;
let pomodoroInterval = null;
let pomodoroTitleFlashTimer = null;

function pomodoroFormat(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function pomodoroUpdateTitle() {
  document.title = pomodoroRunning
    ? `(${pomodoroFormat(pomodoroRemaining)}) ${BASE_DOCUMENT_TITLE}`
    : BASE_DOCUMENT_TITLE;
}

function pomodoroFlashTitle(message) {
  if (pomodoroTitleFlashTimer) clearInterval(pomodoroTitleFlashTimer);
  let on = true;
  let count = 0;
  pomodoroTitleFlashTimer = setInterval(() => {
    document.title = on ? message : BASE_DOCUMENT_TITLE;
    on = !on;
    count += 1;
    if (count >= 8) {
      clearInterval(pomodoroTitleFlashTimer);
      pomodoroTitleFlashTimer = null;
      pomodoroUpdateTitle();
    }
  }, 500);
}

function pomodoroSyncUi() {
  const display = document.getElementById("pomodoro-time");
  const phaseEl = document.getElementById("pomodoro-phase");
  const startBtn = document.getElementById("pomodoro-start");
  if (!display) return;
  display.textContent = pomodoroFormat(pomodoroRemaining);
  if (phaseEl) phaseEl.textContent = pomodoroPhase === "focus" ? "Focus" : "Break";
  if (startBtn) startBtn.textContent = pomodoroRunning ? "Pause" : "Start";
  pomodoroUpdateTitle();
}

function pomodoroStopInterval() {
  if (pomodoroInterval) { clearInterval(pomodoroInterval); pomodoroInterval = null; }
}

function pomodoroOnPhaseComplete() {
  if (pomodoroPhase === "focus") {
    showToast("Focus complete — time for a break!", "good");
    pomodoroFlashTitle("(Break time!) Waypoint");
    pomodoroPhase = "break";
    pomodoroRemaining = POMODORO_BREAK_SEC;
  } else {
    showToast("Break over — back to focus!", "good");
    pomodoroFlashTitle("(Focus time!) Waypoint");
    pomodoroPhase = "focus";
    pomodoroRemaining = POMODORO_FOCUS_SEC;
  }
  pomodoroSyncUi();
}

function pomodoroTick() {
  if (pomodoroRemaining > 0) {
    pomodoroRemaining -= 1;
    pomodoroSyncUi();
    return;
  }
  pomodoroOnPhaseComplete();
}

function pomodoroStartPause() {
  if (pomodoroRunning) {
    pomodoroRunning = false;
    pomodoroStopInterval();
  } else {
    pomodoroRunning = true;
    pomodoroStopInterval();
    pomodoroInterval = setInterval(pomodoroTick, 1000);
  }
  pomodoroSyncUi();
}

function pomodoroReset() {
  pomodoroRunning = false;
  pomodoroStopInterval();
  pomodoroPhase = "focus";
  pomodoroRemaining = POMODORO_FOCUS_SEC;
  if (pomodoroTitleFlashTimer) { clearInterval(pomodoroTitleFlashTimer); pomodoroTitleFlashTimer = null; }
  pomodoroSyncUi();
}

function initPomodoroWidget() {
  if (document.getElementById("pomodoro-widget")) return;
  const mount = document.getElementById("pomodoro-mount") || document.getElementById("usage-widget");
  if (!mount) return;
  const widget = document.createElement("div");
  widget.id = "pomodoro-widget";
  widget.className = "usage-widget";
  widget.style.cssText = "padding:8px; border:1px solid var(--border); border-radius:8px; background:var(--bg-shell); font-size:11px; min-width:180px;";
  widget.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <span style="font-weight:700; color:var(--ink-secondary);">Pomodoro</span>
      <span id="pomodoro-phase" class="pill" style="font-size:10px;">Focus</span>
    </div>
    <div id="pomodoro-time" style="font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; text-align:center; margin:4px 0 8px; color:var(--ink-primary);">${pomodoroFormat(pomodoroRemaining)}</div>
    <div style="display:flex; gap:4px;">
      <button type="button" class="secondary" id="pomodoro-start" style="flex:1; font-size:11px; padding:4px;">Start</button>
      <button type="button" class="secondary" id="pomodoro-reset" style="flex:1; font-size:11px; padding:4px;">Reset</button>
    </div>`;
  mount.appendChild(widget);
  document.getElementById("pomodoro-start").onclick = pomodoroStartPause;
  document.getElementById("pomodoro-reset").onclick = pomodoroReset;
}

// --- Daily briefing ------------------------------------------------------

function briefingEventToday(ev, today) {
  const start = ev.date || "";
  const end = ev.end_date || ev.date || start;
  if (!start) return false;
  return start <= today && today <= end;
}

async function openDailyBriefing() {
  const today = localYmd();
  const [tasks, events] = await Promise.all([api("/api/tasks"), api("/api/events")]);
  const open = tasks.filter(t => t.status === "todo" || t.status === "partial");
  const overdue = open.filter(t => t.due_date && t.due_date < today);
  const dueToday = open.filter(t => t.due_date === today);
  const todayEvents = events.filter(ev => briefingEventToday(ev, today));

  const overlay = document.createElement("div");
  overlay.className = "command-palette-overlay";
  const overdueList = overdue.slice(0, 5).map(t => `<li>${escapeHtml(t.title)}</li>`).join("");
  const dueTodayList = dueToday.map(t => `<li>${escapeHtml(t.title)}</li>`).join("") || '<li class="stub">None due today</li>';
  const eventsList = todayEvents.map(ev => `<li>${escapeHtml(ev.title)}${ev.location ? ` <span class="stub">— ${escapeHtml(ev.location)}</span>` : ""}</li>`).join("") || '<li class="stub">No events today</li>';

  overlay.innerHTML = `
    <div class="command-palette" role="dialog" aria-label="Daily briefing" style="width:min(560px, calc(100vw - 28px));">
      <div style="padding:14px 16px; border-bottom:1px solid var(--border); font-family:var(--font-display); font-size:15px;">Daily briefing</div>
      <div style="padding:14px 16px; max-height:60vh; overflow-y:auto; font-size:13px; line-height:1.5;">
        <div style="margin-bottom:12px;">
          <strong style="color:${overdue.length ? "var(--status-critical)" : "var(--ink-primary)"};">${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}</strong>
          ${overdue.length ? `<ul style="margin:6px 0 0 18px; padding:0;">${overdueList}</ul>${overdue.length > 5 ? `<div class="stub" style="margin-top:4px;">+${overdue.length - 5} more</div>` : ""}` : '<div class="stub" style="margin-top:4px;">All clear</div>'}
        </div>
        <div style="margin-bottom:12px;">
          <strong>Due today (${dueToday.length})</strong>
          <ul style="margin:6px 0 0 18px; padding:0;">${dueTodayList}</ul>
        </div>
        <div>
          <strong>Today&apos;s events (${todayEvents.length})</strong>
          <ul style="margin:6px 0 0 18px; padding:0;">${eventsList}</ul>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; padding:10px 12px; border-top:1px solid var(--border);">
        <button type="button" class="secondary" id="briefing-close">Close</button>
        <button type="button" class="primary" id="briefing-today">Go to Today</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  overlay.querySelector("#briefing-close").onclick = close;
  overlay.querySelector("#briefing-today").onclick = () => { close(); goToTab("Today"); };
  document.addEventListener("keydown", function briefingEsc(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); document.removeEventListener("keydown", briefingEsc); }
  });
}

// --- Global keyboard: undo, tab jumps, copy link, nav history --------------

async function undoMostRecentDelete() {
  try {
    const items = await api("/api/trash");
    if (!items.length) {
      showToast("Nothing to restore", "warn");
      return;
    }
    const item = items[0];
    const result = await api(`/api/trash/${item.id}/restore`, { method: "POST" });
    if (result.error) {
      showToast(result.error, "warn");
      return;
    }
    const label = item.label || "(untitled)";
    showToast(`Restored ${label} — Ctrl+Z again for older`, "good");
    render();
  } catch (err) {
    showToast(errorMessage(err), "warn");
  }
}

function copyCurrentPageLink() {
  let url = location.origin;
  if (ACTIVE_TAB === "Today") url += `/?date=${CURRENT_DATE}`;
  navigator.clipboard.writeText(url).then(
    () => showToast("Page link copied", "good"),
    () => showToast("Could not copy link", "warn"),
  );
}

function initGlobalKeyboard() {
  document.addEventListener("keydown", e => {
    if (AUTOMATION_STUDIO_OPEN) {
      if (e.key === "Escape") return;
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      forceGoHome();
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      toggleCalmMode();
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowLeft") {
      e.preventDefault();
      navBack();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowRight") {
      e.preventDefault();
      navForward();
      return;
    }

    const typing = isTypingTarget(e.target);

    if (ACTIVE_TAB === "Home") {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
        e.preventDefault();
        if (typeof openLauncherSearch === "function") openLauncherSearch();
        return;
      }
      if (e.key === "Escape") {
        if (typeof closeLauncherSearch === "function") closeLauncherSearch();
        return;
      }
      if (!typing && LAUNCHER_FOCUS.setFocus && LAUNCHER_FOCUS.cards.length) {
        const visible = () => LAUNCHER_FOCUS.cards.filter(c => !c.classList.contains("launcher-card--hidden"));
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const list = visible();
          if (!list.length) return;
          const cur = LAUNCHER_FOCUS.cards[LAUNCHER_FOCUS.index];
          const pos = Math.max(0, list.indexOf(cur));
          const next = list[(pos + 1) % list.length];
          LAUNCHER_FOCUS.setFocus(LAUNCHER_FOCUS.cards.indexOf(next));
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const list = visible();
          if (!list.length) return;
          const cur = LAUNCHER_FOCUS.cards[LAUNCHER_FOCUS.index];
          const pos = Math.max(0, list.indexOf(cur));
          const next = list[(pos - 1 + list.length) % list.length];
          LAUNCHER_FOCUS.setFocus(LAUNCHER_FOCUS.cards.indexOf(next));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const card = LAUNCHER_FOCUS.cards[LAUNCHER_FOCUS.index];
          if (card && !card.classList.contains("launcher-card--hidden")) openApp(card.dataset.app, card);
          return;
        }
      }
    }

    if (typing) return;

    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const tab = TABS[Number(e.key) - 1];
      if (tab) goToTab(tab);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undoMostRecentDelete();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && (
      (e.shiftKey && (e.key === "z" || e.key === "Z")) ||
      (!e.shiftKey && (e.key === "y" || e.key === "Y"))
    )) {
      e.preventDefault();
      showToast("Redo isn't tracked — restored items are back in their lists", "info");
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      copyCurrentPageLink();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      openQuickCapture();
    }
  });
}

async function refreshGlobalAgentStatus() {
  const el = document.getElementById("global-agent-status");
  if (!el) return;
  try {
    const [running, pending] = await Promise.all([
      api("/api/agent/activity/running"),
      api("/api/actions?status=pending"),
    ]);
    const active = running.filter(a => a.status === "running").length;
    const color = active ? "var(--status-warning)" : pending.length ? "var(--status-serious)" : "var(--status-good)";
    el.innerHTML = `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span><span class="agent-live-dot ${active ? "running" : ""}" style="display:inline-block; margin-right:7px; background:${color};"></span>Agent status</span>
      <span class="pill">${active ? `${active} live` : pending.length ? `${pending.length} approval` : "idle"}</span>
    </div>
    <div style="margin-top:4px; color:var(--ink-muted);">${active ? "Subagents are working now" : pending.length ? "Actions need review" : "Ready for commands"}</div>`;
    const chip = document.getElementById("hud-agent-chip");
    if (chip) chip.textContent = active ? `${active} live` : pending.length ? `${pending.length} pending` : "Agent";
  } catch (_) {
    el.textContent = "Agent status: offline";
    const chip = document.getElementById("hud-agent-chip");
    if (chip) chip.textContent = "Agent";
  }
}

function initCommandPalette() {
  let overlay = null;
  let activeIndex = 0;
  const tabCommands = TABS.map(tab => ({
    id: `tab-${tab}`,
    title: `Open ${TAB_LABELS[tab] || tab}`,
    detail: `${groupForTab(tab)} page - ${PAGE_INTENTS[tab]?.title || ""}`,
    keywords: `${tab} ${groupForTab(tab)} ${PAGE_INTENTS[tab]?.loss || ""}`,
    run: () => goToTab(tab),
  }));
  const baseCommands = [
    { id: "go-home", title: "Go Home", detail: "Return to the app launcher", keywords: "home launcher apps grid start", run: () => goToTab("Home") },
    { id: "calm-mode", title: "Toggle calm mode", detail: "Strip views to hero action and essential status (Alt+M)", keywords: "calm focus minimal zen distraction", run: () => toggleCalmMode() },
    { id: "save-link", title: "Save a link", detail: "Open Hub and focus the link inbox", keywords: "save link bookmark watch later hub inbox", run: () => { HUB_FOCUS_LINK_INPUT = true; goToTab("Hub"); } },
    { id: "open-repository", title: "Open Repository", detail: "Drop files into your local knowledge store", keywords: "repository repo files rag search knowledge brain store", run: () => goToTab("Repository") },
    { id: "daily-briefing", title: "Daily briefing", detail: "Overdue tasks, today's due items, and events", keywords: "briefing today overview summary morning plan", run: openDailyBriefing },
    { id: "agent-ask", title: "Ask Agent about current page", detail: "Jump to Agent with the active page context prefilled", keywords: "agent chat ask help current page", run: () => askAgentAbout(`Help me with the ${ACTIVE_TAB} page. Intention: ${PAGE_INTENTS[ACTIVE_TAB]?.loss || ""}`) },
    { id: "automation", title: "Open Automation Studio", detail: "Node graph workspace for workflows and variables", keywords: "automation studio graph nodes variables", run: () => { AUTOMATION_STUDIO_OPEN = true; renderAutomationStudioView(); } },
    { id: "trash", title: "Recently deleted", detail: "Restore accidentally deleted records", keywords: "trash restore undo deleted", run: openTrashModal },
    { id: "backup", title: "Backup all data now", detail: "Create a manual project/data backup", keywords: "backup snapshot save", run: async () => { const result = await api("/api/backup", { method: "POST" }); showToast(`Backed up to: ${result.path}`, "good"); } },
    { id: "theme", title: "Toggle light/dark theme", detail: "Switch the visual mode", keywords: "theme dark light", run: () => { const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; document.documentElement.setAttribute("data-theme", next); localStorage.setItem("theme", next); renderUsageWidget(); } },
    { id: "parallel-world", title: "Enter the parallel world", detail: "Open the Parallel fiction interface", keywords: "parallel fiction world life act observe advance play", run: () => goToTab("Parallel") },
    { id: "preview-triumph", title: "Preview triumph", detail: "Show a demo Moment of Triumph overlay", keywords: "triumph moment preview demo celebration", run: () => window.momentOfTriumph({ title: "MOMENT OF TRIUMPH", subtitle: "Preview — your rare wins look like this", workspace: "play" }) },
    { id: "open-settings", title: "Open Settings", detail: "Models, budget, data, integrations, API kill switch", keywords: "settings configure budget routing google theme backup", run: () => goToTab("Settings") },
    { id: "open-nyu", title: "Open NYU / Brightspace", detail: "Calendar feed, campus app links, optional Brightspace API", keywords: "nyu brightspace albert school calendar ics campus", run: () => openSettingsSection("nyu-integrations-card") },
    { id: "switch-ai-local", title: "Switch to Local (Ollama)", detail: "Block cloud AI and use the local model", keywords: "ollama local offline model ai switch", run: async () => { await setRunningInferenceMode("local"); showToast("Local AI — Ollama only", "warn"); } },
    { id: "switch-ai-cloud", title: "Switch to Cloud", detail: "Use Claude / OpenAI / Grok routing", keywords: "cloud claude openai grok model ai switch", run: async () => { await setRunningInferenceMode("cloud"); showToast("Cloud AI", "good"); } },
    { id: "open-model-routing", title: "Open model routing", detail: "Jump to Settings → Models & routing", keywords: "model routing inference ollama settings ai", run: () => openSettingsSection("inference-settings-card") },
    { id: "setup-local-ai", title: "Set up local AI", detail: "Write LOCAL_MODEL_* and check Ollama after a pull", keywords: "ollama setup local ai pull env", run: () => { openSettingsSection("settings-updates-card"); if (typeof runLocalAiSetup === "function") runLocalAiSetup(); } },
    { id: "budget-optimize", title: "Run budget optimizer", detail: "Analyze token spend and write recommendations (results > cost)", keywords: "budget optimizer tokens cost spend routing", run: async () => { goToTab("Settings"); await render(); await runBudgetOptimizer(); } },
    ...tabCommands,
  ];

  const customAppCommands = () => (CUSTOM_APPS || []).map(app => ({
    id: `custom-app-${app.id}`,
    title: app.name || "Untitled",
    detail: "My app — open in Automation Studio preview",
    keywords: `my apps custom ${app.name || ""} ${app.emoji || ""} workflow`,
    section: "My apps",
    run: () => openCustomApp(app.workflow_id),
  }));

  const allCommands = () => [...baseCommands, ...customAppCommands()];

  const recordPaletteRecent = (id) => {
    let recents = [];
    try { recents = JSON.parse(localStorage.getItem("paletteRecents") || "[]"); } catch (_) { recents = []; }
    recents = [id, ...recents.filter(x => x !== id)].slice(0, 5);
    localStorage.setItem("paletteRecents", JSON.stringify(recents));
  };

  const getPaletteList = (query = "") => {
    const commands = allCommands();
    const q = query.toLowerCase().trim();
    if (!q) {
      let recentIds = [];
      try { recentIds = JSON.parse(localStorage.getItem("paletteRecents") || "[]"); } catch (_) { recentIds = []; }
      const recentCmds = recentIds.map(id => commands.find(c => c.id === id)).filter(Boolean);
      const recentSet = new Set(recentCmds.map(c => c.id));
      const myApps = customAppCommands();
      const rest = baseCommands.filter(c => !recentSet.has(c.id));
      const sections = [];
      if (recentCmds.length) sections.push({ label: "Recent", items: recentCmds });
      if (myApps.length) sections.push({ label: "My apps", items: myApps });
      sections.push({ label: null, items: rest });
      const flat = sections.flatMap(s => s.items);
      return { sections, flat: flat.slice(0, 24) };
    }
    const filtered = commands.filter(c => `${c.title} ${c.detail} ${c.keywords}`.toLowerCase().includes(q)).slice(0, 14);
    const myAppsFiltered = filtered.filter(c => c.section === "My apps");
    const otherFiltered = filtered.filter(c => c.section !== "My apps");
    const sections = [];
    if (myAppsFiltered.length) sections.push({ label: "My apps", items: myAppsFiltered });
    if (otherFiltered.length) sections.push({ label: null, items: otherFiltered });
    const flat = [...myAppsFiltered, ...otherFiltered];
    return { sections: sections.length ? sections : [{ label: null, items: filtered }], flat };
  };

  const close = () => { if (overlay) { overlay.remove(); overlay = null; } };
  const execute = async (cmd) => {
    recordPaletteRecent(cmd.id);
    close();
    await cmd.run();
  };
  const renderList = (query = "") => {
    const { sections, flat } = getPaletteList(query);
    activeIndex = Math.min(activeIndex, Math.max(0, flat.length - 1));
    const list = overlay.querySelector(".command-list");
    const html = flat.length ? sections.map(sec => {
      const header = sec.label ? `<div class="stub" style="padding:8px 14px 4px; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-muted);">${escapeHtml(sec.label)}</div>` : "";
      const items = sec.items.map(c => {
        const i = flat.indexOf(c);
        return `
      <button type="button" class="command-item ${i === activeIndex ? "active" : ""}" data-idx="${i}">
        <span><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(c.detail)}</small></span>
        <span class="kbd">Enter</span>
      </button>`;
      }).join("");
      return header + items;
    }).join("") : '<div class="stub" style="padding:18px;">No commands match.</div>';
    list.innerHTML = html;
    list.querySelectorAll(".command-item").forEach(btn => {
      const i = Number(btn.dataset.idx);
      btn.onmouseenter = () => { activeIndex = i; renderList(overlay.querySelector("input").value); };
      btn.onclick = () => execute(flat[i]);
    });
    return flat;
  };
  const open = async () => {
    if (AUTOMATION_STUDIO_OPEN) return;
    if (typeof refreshCustomApps === "function") await refreshCustomApps();
    if (overlay) { overlay.querySelector("input").focus(); return; }
    overlay = document.createElement("div");
    overlay.className = "command-palette-overlay";
    overlay.innerHTML = `<div class="command-palette" role="dialog" aria-label="Command palette">
      <input type="text" placeholder="Search pages, actions, backups, automation..." autocomplete="off" spellcheck="false">
      <div class="command-list"></div>
      <div style="display:flex; justify-content:space-between; gap:8px; padding:8px 12px; border-top:1px solid var(--border); color:var(--ink-muted); font-size:11px;">
        <span><span class="kbd">↑↓</span> move <span class="kbd">Enter</span> run</span>
        <span><span class="kbd">Esc</span> close</span>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("input");
    let filtered = renderList("");
    input.focus();
    input.addEventListener("input", () => { activeIndex = 0; filtered = renderList(input.value); });
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); filtered = renderList(input.value); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); filtered = renderList(input.value); }
      else if (e.key === "Enter" && filtered[activeIndex]) { e.preventDefault(); execute(filtered[activeIndex]); }
    });
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  };

  document.getElementById("open-command-palette").onclick = open;
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      open();
    } else if (e.key === "Escape" && overlay) {
      close();
    }
  });
}


function initInPageSearch() {
  const state = { matches: [], index: -1 };
  let bar = null;

  function buildBar() {
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "inpage-search-bar";
    bar.style.cssText = "position:fixed; top:12px; right:16px; z-index:99999; display:none; align-items:center; gap:6px; background:var(--bg-card); color:var(--ink-primary); border:1px solid var(--border); border-radius:8px; padding:6px 8px; box-shadow:0 4px 16px rgba(0,0,0,0.35); font-size:13px;";
    bar.innerHTML = `
      <input type="text" id="inpage-search-input" placeholder="Find in page" autocomplete="off" spellcheck="false" style="background:var(--bg-shell); color:var(--ink-primary); border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:13px; width:160px;" />
      <span id="inpage-search-count" style="color:var(--ink-secondary); min-width:64px; text-align:center;"></span>
      <button type="button" id="inpage-search-prev" title="Previous match (Shift+Enter)" style="background:var(--bg-card-hover); color:var(--ink-primary); border:1px solid var(--border); border-radius:6px; cursor:pointer; padding:3px 8px;">&uarr;</button>
      <button type="button" id="inpage-search-next" title="Next match (Enter)" style="background:var(--bg-card-hover); color:var(--ink-primary); border:1px solid var(--border); border-radius:6px; cursor:pointer; padding:3px 8px;">&darr;</button>
      <button type="button" id="inpage-search-close" title="Close (Esc)" style="background:var(--bg-card-hover); color:var(--ink-primary); border:1px solid var(--border); border-radius:6px; cursor:pointer; padding:3px 8px;">&times;</button>
    `;
    document.body.appendChild(bar);

    const input = bar.querySelector("#inpage-search-input");
    input.addEventListener("input", () => runSearch(input.value));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        goToMatch(state.index + (e.shiftKey ? -1 : 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeBar();
      }
    });
    bar.querySelector("#inpage-search-prev").onclick = () => goToMatch(state.index - 1);
    bar.querySelector("#inpage-search-next").onclick = () => goToMatch(state.index + 1);
    bar.querySelector("#inpage-search-close").onclick = () => closeBar();
    return bar;
  }

  function clearHighlights() {
    const main = document.getElementById("main");
    if (!main) return;
    main.querySelectorAll("mark.inpage-search-hit").forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  function runSearch(query) {
    clearHighlights();
    state.matches = [];
    state.index = -1;
    const countEl = bar.querySelector("#inpage-search-count");
    const main = document.getElementById("main");
    if (!main || !query) {
      countEl.textContent = "";
      return;
    }

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el || el.nodeName === "SCRIPT" || el.nodeName === "STYLE") return NodeFilter.FILTER_REJECT;
        if (el.closest("#inpage-search-bar")) return NodeFilter.FILTER_REJECT;
        if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    const lowerQuery = query.toLowerCase();
    textNodes.forEach(node => {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      let start = 0, idx, matched = false;
      const frag = document.createDocumentFragment();
      while ((idx = lower.indexOf(lowerQuery, start)) !== -1) {
        matched = true;
        if (idx > start) frag.appendChild(document.createTextNode(text.slice(start, idx)));
        const mark = document.createElement("mark");
        mark.className = "inpage-search-hit";
        mark.style.cssText = "background:#f5c518; color:#111; border-radius:2px;";
        mark.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(mark);
        state.matches.push(mark);
        start = idx + query.length;
      }
      if (matched) {
        if (start < text.length) frag.appendChild(document.createTextNode(text.slice(start)));
        node.parentNode.replaceChild(frag, node);
      }
    });

    if (state.matches.length) goToMatch(0);
    else countEl.textContent = "0 of 0";
  }

  function goToMatch(i) {
    if (!state.matches.length) return;
    const prev = state.matches[state.index];
    if (prev) prev.style.cssText = "background:#f5c518; color:#111; border-radius:2px;";
    state.index = ((i % state.matches.length) + state.matches.length) % state.matches.length;
    const current = state.matches[state.index];
    current.style.cssText = "background:#ff8a00; color:#111; border-radius:2px; outline:2px solid #ff8a00;";
    current.scrollIntoView({ block: "center", behavior: "smooth" });
    bar.querySelector("#inpage-search-count").textContent = `${state.index + 1} of ${state.matches.length}`;
  }

  function openBar() {
    buildBar();
    bar.style.display = "flex";
    const input = bar.querySelector("#inpage-search-input");
    input.focus();
    input.select();
    if (input.value) runSearch(input.value);
  }

  function closeBar() {
    if (!bar || bar.style.display === "none") return;
    bar.style.display = "none";
    clearHighlights();
    state.matches = [];
    state.index = -1;
  }

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      openBar();
    } else if (e.key === "Escape" && bar && bar.style.display !== "none") {
      closeBar();
    }
  });
}

function syncAgentWorkspaceColumns() {
  const ws = document.getElementById("agent-workspace");
  if (!ws || ws.dataset.agentColSyncing === "1") return;
  let next = "";
  if (ws.classList.contains("agent-focus-chat") || ws.classList.contains("agent-focus-activity")) {
    next = "minmax(0, 1fr)";
  } else if (window.matchMedia("(max-width: 1180px)").matches) {
    next = "";
  } else {
    const raw = getComputedStyle(ws).getPropertyValue("--agent-chat-fr").trim() || localStorage.agentChatFr || "1.25";
    let n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) n = 1.25;
    // Old default was 2fr (chat twice as wide) — that read as awkward side-by-side; rebalance.
    if (n >= 1.85) n = 1.25;
    n = Math.min(1.7, Math.max(1.05, n));
    next = `minmax(300px, ${n}fr) 10px minmax(280px, 1fr)`;
    ws.style.setProperty("--agent-chat-fr", String(n));
  }
  if ((ws.style.gridTemplateColumns || "") === next) return;
  ws.dataset.agentColSyncing = "1";
  ws.style.gridTemplateColumns = next;
  queueMicrotask(() => { delete ws.dataset.agentColSyncing; });
}

function installAgentColumnSync() {
  if (window.__waypointAgentColSync) return;
  window.__waypointAgentColSync = true;
  window.addEventListener("resize", () => {
    if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Agent") syncAgentWorkspaceColumns();
  });
  const obs = new MutationObserver(() => syncAgentWorkspaceColumns());
  const boot = () => {
    const ws = document.getElementById("agent-workspace");
    if (ws) obs.observe(ws, { attributes: true, attributeFilter: ["style", "class"] });
  };
  boot();
  document.addEventListener("click", e => {
    if (e.target.closest(".agent-mode-btn")) setTimeout(syncAgentWorkspaceColumns, 0);
  });
}

function wireTab() {
  if (ACTIVE_TAB === "Home") wireLauncher();
  else if (ACTIVE_TAB === "Agent") {
    wireAgent();
    installAgentColumnSync();
    syncAgentWorkspaceColumns();
    // Re-observe after Agent DOM remounts
    const ws = document.getElementById("agent-workspace");
    if (ws && window.__waypointAgentColSync) {
      // MutationObserver already installed; force sync after splitter writes --agent-chat-fr
      setTimeout(syncAgentWorkspaceColumns, 0);
    }
  }
  else if (ACTIVE_TAB === "Hub") wireHub();
  else if (ACTIVE_TAB === "Today") wireToday();
  else if (NOTE_LIST_TABS[ACTIVE_TAB]) wireNoteList(NOTE_LIST_TABS[ACTIVE_TAB]);
  else if (ACTIVE_TAB === "Goals") wireGoals();
  else if (ACTIVE_TAB === "Calendar") wireCalendar();
  else if (ACTIVE_TAB === "Trends") wireTrends();
  else if (ACTIVE_TAB === "Tasks") wireTasks();
  else if (ACTIVE_TAB === "Ideas") wireIdeas();
  else if (ACTIVE_TAB === "Repository") wireRepository();
  else if (ACTIVE_TAB === "Projects") wireProjects();
  else if (ACTIVE_TAB === "Competitions") wireCompetitions();
  else if (ACTIVE_TAB === "Classes") wireClasses();
  else if (ACTIVE_TAB === "Customers") wireCustomers();
  else if (ACTIVE_TAB === "Contacts") wireContacts();
  else if (ACTIVE_TAB === "Events") wireEvents();
  else if (ACTIVE_TAB === "About") wireAbout();
  else if (ACTIVE_TAB === "Settings") wireSettings();
  else if (ACTIVE_TAB === "Team") wireTeam();
  else if (ACTIVE_TAB === "Obsidian") wireObsidian();
  else if (ACTIVE_TAB === "Code") wireCode();
  else if (ACTIVE_TAB === "Practice") wirePractice();
  else if (ACTIVE_TAB === "Parallel") wireParallel();
  else if (ACTIVE_TAB === "Prompts") wirePromptsPage();
}

(async function init() {
  if (typeof installSpaHistoryGuard === "function") installSpaHistoryGuard();
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  initRewardThemes();
  if (typeof stylePaintBoot === "function") stylePaintBoot();
  CONFIG = await api("/api/config");
  initSidebarClock();
  initPomodoroWidget();
  initQuickCaptureFab();
  initSelectionCapture();
  initHudInteractions();
  initGameLayer();
  initCalmMode();
  if (typeof initScrollEdgeCues === "function") initScrollEdgeCues();
  installAgentColumnSync();
  renderUsageWidget();
  refreshHudData();
  render();
  refreshNavBadges();
  refreshGlobalAgentStatus();
  setInterval(refreshNavBadges, 8000);
  setInterval(refreshGlobalAgentStatus, 5000);
  setInterval(refreshHudData, 60000);
  document.getElementById("launch-automation-studio").onclick = () => {
    AUTOMATION_STUDIO_OPEN = true;
    renderAutomationStudioView();
  };
  document.getElementById("global-agent-status").onclick = () => goToTab("Agent");
  document.getElementById("nav-back").onclick = navBack;
  document.getElementById("nav-forward").onclick = navForward;
  initGlobalKeyboard();
  initCommandPalette();
  initInPageSearch();
  initTriumphTriggers();
})();
