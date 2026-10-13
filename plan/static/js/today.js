// --- Today / Planner fused shell -----------------------------------

let TODAY_DAYS_WITH_DATA = null;
let TODAY_DIRTY = false;
let TODAY_HOURS = {};
let TDY_ARMED_CAT = null;
let TDY_UNPAINT = false;
let TDY_MODE = "paint";
let TDY_PAINT_PHASE = "idle";
let TDY_PAINT_ANCHOR = null;
let TDY_PAINT_RANGE = null;
let TDY_SELECT_SET = new Set();
let TDY_CLIPBOARD = null;
let TDY_PAINT_ORIGIN = null;
let TDY_FILL_ANCHOR = null;
let TDY_FILL_DRAG = null;
let PLN_SHELL_FOCUS = "canvas";
let PLN_CAL = { viewYm: null, selected: null };
let PLN_RAIL_FILTER = "all";
let PLN_RAIL_SEARCH = "";
let PLN_CHANGE_COUNT = 0;
let PLN_SCHEDULED = {};
let PLN_DRAG_TASK_ID = null;
let PLN_SELECTED_TASK_ID = null;
let PLN_RAIL_TASKS = [];
let PLN_CAL_EVENTS = [];
let PLN_PLAN_EVENTS = [];
let TODAY_WEEK_LAYERS = (() => {
  try {
    const raw = localStorage.getItem("todayWeekLayers");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter(x => x === "events" || x === "paint"));
    }
  } catch (_) {}
  return new Set();
})();
let TODAY_WEEK_MODE = (() => {
  try {
    const stored = localStorage.getItem("todayWeekMode");
    if (["day", "events", "paint", "mix"].includes(stored)) {
      if (stored === "events") TODAY_WEEK_LAYERS.add("events");
      if (stored === "paint") TODAY_WEEK_LAYERS.add("paint");
      return stored;
    }
    const migrated = localStorage.getItem("todayWeekOpen") === "1" ? "events" : "day";
    localStorage.setItem("todayWeekMode", migrated);
    if (migrated === "events") TODAY_WEEK_LAYERS.add("events");
    return migrated;
  } catch (_) {
    return "day";
  }
})();
let WEEK_PAINT_HOURS = {};
let WEEK_PAINT_DIRTY = new Set();
let TDY_WEEK_SELECT = new Set();
let TDY_EVENT_SELECT = new Set();
let TDY_NOW_MARKER_TIMER = null;
const TDY_PLANNER_DATE_KEY = "waypointPlannerDate";
const TDY_DAY_SNAPSHOT_KEY = "todayDaySnapshotV1";
const TDY_SPLIT_CACHE_KEY = "todayHourSplitsV1";
const TDY_METRICS_OPEN_KEY = "todayMetricsOpen";
const TDY_HOUR_DIV_KEY = "hourSplitMinutes";
const TDY_PULSE_DRAFT_KEY = "waypointPulseNotes";
const CLASS_NAVY = "#0b1f4d";
let RIT_ANCHOR_RANK = 0;
let RIT_SWAP_USED = false;
let RIT_PRACTICE_SUMMARY = null;
let TODAY_DAY_SNAPSHOT = null;
let TODAY_FORECAST = null;
let TDY_CANVAS_REFRESH_RAF = null;

const LATE_LOGS_KEY = "lateLogs";
const TDY_PAINT_METRIC_STATE_KEY = "todayPaintMetricStateV1";

function buildLocalForecastCardHtml() {
  return `<div class="card tdy-forecast-card" id="tdy-forecast-card">
    <div class="tdy-forecast-head">
      <strong>Local forecast</strong>
      <div class="tdy-forecast-head-actions">
        <button type="button" class="primary" id="tdy-forecast-run">Run forecast</button>
        <button type="button" class="secondary" id="tdy-forecast-refresh" hidden>Refresh</button>
      </div>
    </div>
    <div id="tdy-forecast-body" class="tdy-forecast-body" hidden>
      <p class="stub">Predict likely activities for open hours from your painted-day history — runs only when you ask.</p>
    </div>
  </div>`;
}

function setForecastCardExpanded(expanded) {
  const card = document.getElementById("tdy-forecast-card");
  const body = document.getElementById("tdy-forecast-body");
  const runBtn = document.getElementById("tdy-forecast-run");
  const refreshBtn = document.getElementById("tdy-forecast-refresh");
  if (body) body.hidden = !expanded;
  if (card) card.classList.toggle("tdy-forecast-expanded", expanded);
  if (runBtn) runBtn.hidden = expanded;
  if (refreshBtn) refreshBtn.hidden = !expanded;
}

function formatForecastHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function renderLocalForecastBody(forecast) {
  const body = document.getElementById("tdy-forecast-body");
  if (!body) return;
  if (!forecast) {
    body.innerHTML = '<p class="stub">No forecast yet — tap Refresh.</p>';
    return;
  }
  if (forecast.error) {
    body.innerHTML = `<p class="stub">${escapeHtml(forecast.error)}</p>`;
    return;
  }
  if (forecast.insufficient_data) {
    body.innerHTML = '<p class="stub">Log a few more painted days to unlock local forecasts.</p>';
    return;
  }

  const dayType = forecast.day_type || "productive";
  const dayTypeLabel = dayType.charAt(0).toUpperCase() + dayType.slice(1);
  const nextRows = (forecast.next_activities || []).map(item => {
    const pct = Math.round((item.probability || 0) * 100);
    return `<li class="tdy-forecast-next-row">
      <span class="tdy-forecast-hour">${escapeHtml(formatForecastHour(item.hour))}</span>
      <span class="tdy-forecast-token">${escapeHtml(item.label || item.token)}</span>
      <span class="tdy-forecast-pct">${pct}%</span>
    </li>`;
  }).join("");

  const boost = forecast.happiness_boost;
  const boostHtml = boost
    ? `<div class="tdy-forecast-boost">
        <span class="tdy-forecast-boost-label">Happiness boost</span>
        <strong>${escapeHtml(boost.label || boost.suggested_token)}</strong>
        <span class="stub"> · ${escapeHtml(boost.note || "")}</span>
      </div>`
    : '<p class="stub tdy-forecast-boost-empty">Not enough happiness logs for a boost suggestion yet.</p>';

  const outlook = forecast.happiness_month_outlook;
  const outlookHtml = outlook
    ? `<div class="tdy-forecast-outlook">
        <div class="tdy-forecast-section-title">Month outlook</div>
        <strong>${escapeHtml(String(outlook.outlook || "steady"))}</strong>
        <span class="stub"> · recent happiness ${escapeHtml(String(outlook.recent_avg ?? "—"))}${outlook.delta_vs_prior != null ? ` · Δ ${outlook.delta_vs_prior}` : ""}</span>
      </div>`
    : "";
  const interp = (forecast.interpolated_hours || []).filter(h => h.interpolated);
  const interpHtml = interp.length
    ? `<div class="tdy-forecast-interp">
        <div class="tdy-forecast-section-title">Filled gaps</div>
        ${interp.map(h => `<div class="tdy-forecast-interp-row"><span>${escapeHtml(formatForecastHour(h.hour))}</span><span>${escapeHtml(h.token)}</span><span class="stub">interpolated</span></div>`).join("")}
      </div>`
    : "";

  body.innerHTML = `
    <div class="tdy-forecast-meta">
      <span class="pill tdy-forecast-day-type">${escapeHtml(dayTypeLabel)} day</span>
      <span class="stub">local forecast · ${forecast.history_days || 0} logged days</span>
    </div>
    <div class="tdy-forecast-section">
      <div class="tdy-forecast-section-title">Likely next activities</div>
      ${nextRows ? `<ul class="tdy-forecast-next-list">${nextRows}</ul>` : '<p class="stub">Day looks complete — no open hours ahead.</p>'}
    </div>
    ${boostHtml}
    ${outlookHtml}
    ${interpHtml}`;
}

async function loadLocalForecast({ force = false } = {}) {
  if (!force && TODAY_FORECAST && TODAY_FORECAST.date === CURRENT_DATE) {
    setForecastCardExpanded(true);
    renderLocalForecastBody(TODAY_FORECAST);
    return TODAY_FORECAST;
  }
  setForecastCardExpanded(true);
  const body = document.getElementById("tdy-forecast-body");
  const runBtn = document.getElementById("tdy-forecast-run");
  const refreshBtn = document.getElementById("tdy-forecast-refresh");
  if (body) body.innerHTML = '<p class="stub">Loading local forecast…</p>';
  for (const btn of [runBtn, refreshBtn]) {
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
  }
  try {
    const forecast = await api(`/api/forecast/today?date=${encodeURIComponent(CURRENT_DATE)}`);
    TODAY_FORECAST = { ...forecast, date: CURRENT_DATE };
    renderLocalForecastBody(TODAY_FORECAST);
    return TODAY_FORECAST;
  } catch (exc) {
    renderLocalForecastBody({ error: String(exc) });
    return null;
  } finally {
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = "Run forecast"; }
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = "Refresh"; }
    setForecastCardExpanded(true);
  }
}

function wireLocalForecastCard() {
  document.getElementById("tdy-forecast-run")?.addEventListener("click", () => {
    loadLocalForecast({ force: true });
  });
  document.getElementById("tdy-forecast-refresh")?.addEventListener("click", () => {
    loadLocalForecast({ force: true });
  });
  if (TODAY_FORECAST && TODAY_FORECAST.date === CURRENT_DATE) {
    setForecastCardExpanded(true);
    renderLocalForecastBody(TODAY_FORECAST);
  } else {
    setForecastCardExpanded(false);
  }
}

const TDY_SPLIT_NOTE_RE = /^\[split:\s*([^/\]]+)\/([^\]]+)\](?:\s*(.*))?$/;
const TDY_METRIC_VALUE_KEYS = ["happiness", "volatility", "motivation", "focus", "work_time", "effective_work_time", "sports", "eating"];
const TDY_WORK_PAINT_KEYS = new Set(["work", "work_with_people", "thinking"]);
const TDY_EFFECTIVE_PAINT_KEYS = new Set(["work", "work_with_people", "thinking", "planned"]);
const TDY_LONG_PRESS_MS = 600;
let TDY_LONG_PRESS_TIMER = null;
let TDY_LONG_PRESS_HOUR = null;
let TODAY_AUTOSAVE_TIMER = null;
let TODAY_AUTOSAVE_IN_FLIGHT = null;
let WEEK_PAINT_SAVE_TIMER = null;
let WEEK_PAINT_SAVE_IN_FLIGHT = null;
let TODAY_DIRTY_VERSION = 0;
const TODAY_AUTOSAVE_DEBOUNCE_MS = 2500;

function loadLateLogs() {
  try {
    const raw = localStorage.getItem(LATE_LOGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function markLateLog(date) {
  const logs = loadLateLogs();
  logs[date] = getRealToday();
  localStorage.setItem(LATE_LOGS_KEY, JSON.stringify(logs));
}

async function postLateLogReceipt(filledDate, todayDate) {
  try {
    await api("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "planner",
        kind: "late_log",
        summary: `Filled ${filledDate} on ${todayDate}`,
      }),
    });
  } catch {
    /* graceful 404 or unavailable */
  }
}

function parseHourSplit(note) {
  const m = (note || "").match(TDY_SPLIT_NOTE_RE);
  if (!m) return null;
  return { a: m[1].trim(), b: m[2].trim(), rest: (m[3] || "").trim() };
}

function formatSplitNote(a, b, rest) {
  const prefix = `[split: ${a}/${b}]`;
  return rest ? `${prefix} ${rest}` : prefix;
}

function stripSplitPrefix(note) {
  const split = parseHourSplit(note);
  return split ? split.rest : (note || "");
}

function dayRowHasMetricData(day) {
  if (!day) return false;
  if (TDY_METRIC_VALUE_KEYS.some(k => day[k] != null)) return true;
  return !!(day.notes || "").trim();
}

function metricInputAttrs(metric) {
  if (metric.type === "scale") return 'min="1" max="10" step="1"';
  if (metric.key === "sports") return 'min="0" step="1"';
  if (metric.key === "work_time" || metric.key === "effective_work_time") {
    return 'min="0" max="24" step="0.25"';
  }
  return 'min="0" step="0.25"';
}

function countPaintedCategoryHours(keySet) {
  let total = 0;
  for (let h = 0; h < 24; h++) {
    const cell = getHourCell(h);
    const split = parseHourSplit(cell.note);
    if (split) {
      if (keySet.has(split.a)) total += 0.5;
      if (keySet.has(split.b)) total += 0.5;
      continue;
    }
    if (cell.category && keySet.has(cell.category)) total += 1;
  }
  return Math.round(total * 4) / 4;
}

function formatPaintedHoursHint(hours) {
  if (!hours) return "Grid: 0h painted";
  const rounded = Math.round(hours * 4) / 4;
  return `Grid: ${rounded}h painted`;
}

function loadPaintMetricState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TDY_PAINT_METRIC_STATE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function paintMetricMode(metricKey, input) {
  const state = loadPaintMetricState();
  const mode = state[CURRENT_DATE]?.[metricKey];
  if (mode === "auto" || mode === "manual") return mode;
  return input.value === "" ? "auto" : "manual";
}

function setPaintMetricMode(metricKey, mode) {
  const state = loadPaintMetricState();
  state[CURRENT_DATE] = { ...(state[CURRENT_DATE] || {}), [metricKey]: mode };
  try {
    localStorage.setItem(TDY_PAINT_METRIC_STATE_KEY, JSON.stringify(state));
  } catch {
    /* The in-DOM marker still protects manual edits for this render. */
  }
}

function prefillPaintedWorkMetrics(workHours, effectiveHours) {
  const paintedValues = {
    work_time: workHours,
    effective_work_time: effectiveHours,
  };
  let changed = 0;
  Object.entries(paintedValues).forEach(([metricKey, hours]) => {
    const input = document.getElementById(`metric-${metricKey}`);
    if (!input) return;
    const mode = input.dataset.tdyPaintMode || paintMetricMode(metricKey, input);
    input.dataset.tdyPaintMode = mode;
    setPaintMetricMode(metricKey, mode);
    if (mode !== "auto") return;

    // Leave a brand-new zero-hour day visually empty. Once an automatic value exists,
    // dropping back to zero remains a real derived update and is saved.
    const nextValue = hours > 0 ? String(hours) : (input.value === "" ? "" : "0");
    if (input.value !== nextValue) {
      input.value = nextValue;
      changed++;
    }
  });
  if (changed > 0) setTodayDirty(changed);
}

function updateMetricPaintHints() {
  const workEl = document.getElementById("tdy-hint-work_time");
  const effEl = document.getElementById("tdy-hint-effective_work_time");
  const workHours = countPaintedCategoryHours(TDY_WORK_PAINT_KEYS);
  const effectiveHours = countPaintedCategoryHours(TDY_EFFECTIVE_PAINT_KEYS);
  if (workEl) workEl.textContent = formatPaintedHoursHint(workHours);
  if (effEl) effEl.textContent = formatPaintedHoursHint(effectiveHours);
  prefillPaintedWorkMetrics(workHours, effectiveHours);
}

function tdyIsTravelPaint(category) {
  const key = String(category || "").toLowerCase().replace(/[\s_]+/g, "-");
  return key === "travel" || key === "time-change" || key === "timechange";
}

function tdyTravelPaintColor() {
  return "#111111";
}

function tdyPaintCategoryColor(category) {
  if (tdyIsTravelPaint(category)) return tdyTravelPaintColor();
  const cat = CONFIG.categories.find(c => c.key === category);
  return cat ? cat.color : "";
}

function hourCellPaintStyle(cell) {
  const split = parseHourSplit(cell.note);
  if (split) {
    const colorA = tdyPaintCategoryColor(split.a) || "var(--ink-muted)";
    const colorB = tdyPaintCategoryColor(split.b) || "var(--ink-muted)";
    return `${splitHourGradientStyle(colorA, colorB)}color:${contrastText(colorA)};`;
  }
  if (tdyIsTravelPaint(cell.category)) {
    const color = tdyTravelPaintColor();
    return `background:${color};color:${contrastText(color)};`;
  }
  const cat = CONFIG.categories.find(c => c.key === cell.category);
  if (!cat) return "";
  const color = tdyIsTravelPaint(cat.key) ? tdyTravelPaintColor() : cat.color;
  return `background:${color};color:${contrastText(color)};`;
}

function hourCellSplitTitle(cell) {
  const split = parseHourSplit(cell.note);
  if (!split) return "";
  const labelA = CONFIG.categories.find(c => c.key === split.a)?.label || split.a;
  const labelB = CONFIG.categories.find(c => c.key === split.b)?.label || split.b;
  return `Split hour: ${labelA} (first 30m) / ${labelB} (second 30m). Double-click again to unsplit.`;
}

function plnShiftDateByMonths(isoDate, deltaMonths) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1 + deltaMonths, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, maxDay));
  const p = n => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`;
}

function wgAwardXp(amount, reason, opts) {
  if (window.WaypointGame && typeof window.WaypointGame.awardXp === "function") {
    window.WaypointGame.awardXp(amount, reason, opts);
  }
}

function wgQuestProgress(key, n) {
  if (window.WaypointGame && typeof window.WaypointGame.questProgress === "function") {
    window.WaypointGame.questProgress(key, n);
  }
}

function wgDispatchGameState() {
  if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  window.dispatchEvent(new CustomEvent("waypoint:game-state"));
}

const PULSE_HONESTY_KEY = "pulseHonestyDates";
const PULSE_HONESTY_BONUS_DATE_KEY = "pulseHonestyBonusDate";
const PRACTICE_SUMMARY_CACHE_KEY = "practiceSummary";
const FOCUS_TIMER_MINUTES = 25;
const FOCUS_TIMER_MS = FOCUS_TIMER_MINUTES * 60 * 1000;
let FOCUS_TIMER_ENDS_AT = null;
let FOCUS_TIMER_TICK_ID = null;
let FOCUS_TIMER_HIDDEN_SINCE = null;
let TODAY_PULSE_DATA = null;

function loadPulseHonestyDates() {
  const dates = ritLoadJson(PULSE_HONESTY_KEY, []);
  return Array.isArray(dates) ? dates.filter(d => typeof d === "string") : [];
}

function savePulseHonestyDates(dates) {
  try {
    localStorage.setItem(PULSE_HONESTY_KEY, JSON.stringify([...new Set(dates)].sort().slice(-90)));
  } catch { /* ignore */ }
}

function recordPulseHonestyDate(date) {
  if (!date) return;
  const dates = loadPulseHonestyDates();
  if (!dates.includes(date)) {
    dates.push(date);
    savePulseHonestyDates(dates);
  }
}

function syncPulseHonestyFromPulseData(pulseData, date) {
  const count = pulseData?.today_count ?? (pulseData?.pulses || []).length;
  if (count > 0) recordPulseHonestyDate(date);
}

function countConsecutivePulseDays(throughDate) {
  const set = new Set(loadPulseHonestyDates());
  if (!set.has(throughDate)) return 0;
  let streak = 0;
  let d = throughDate;
  while (set.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

function priorConsecutivePulseDaysBefore(date) {
  const set = new Set(loadPulseHonestyDates());
  let streak = 0;
  let d = addDays(date, -1);
  while (set.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

function maybeAwardPulseHonestyBonus() {
  const today = getRealToday();
  const streak = countConsecutivePulseDays(today);
  if (streak < 3) return;
  if (localStorage.getItem(PULSE_HONESTY_BONUS_DATE_KEY) === today) return;
  try { localStorage.setItem(PULSE_HONESTY_BONUS_DATE_KEY, today); } catch { /* ignore */ }
  wgAwardXp(12, "honest pulse streak");
  showToast(`Honest pulse bonus · ${streak}-day streak`, "good");
}

function buildPulseHonestyNoteHtml() {
  if (CURRENT_DATE !== getRealToday()) return "";
  const today = getRealToday();
  const prior = priorConsecutivePulseDaysBefore(today);
  const pulsedToday = (TODAY_PULSE_DATA?.today_count ?? (TODAY_PULSE_DATA?.pulses || []).length) > 0
    || loadPulseHonestyDates().includes(today);
  if (prior < 2 && !(pulsedToday && countConsecutivePulseDays(today) >= 3)) return "";
  const streak = pulsedToday ? countConsecutivePulseDays(today) : prior + 1;
  const msg = pulsedToday && streak >= 3
    ? `Honest pulse bonus — ${streak}-day streak active`
    : `Honest pulse bonus — pulse today to complete a ${prior + 1}-day streak`;
  return `<p class="pln-pulse-honesty-note" id="pln-pulse-honesty-note">${escapeHtml(msg)}</p>`;
}

function refreshPulseHonestyNote() {
  const existing = document.getElementById("pln-pulse-honesty-note");
  const html = buildPulseHonestyNoteHtml();
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
  } else {
    const anchor = document.getElementById("pls-compact-row") || document.getElementById("pls-card");
    anchor?.insertAdjacentHTML("afterend", html);
  }
}

function cachePracticeSummary(summary) {
  if (!summary || typeof summary !== "object") return;
  try { localStorage.setItem(PRACTICE_SUMMARY_CACHE_KEY, JSON.stringify(summary)); } catch { /* ignore */ }
}

function readPracticeStreakFromCache() {
  const cached = ritLoadJson(PRACTICE_SUMMARY_CACHE_KEY, null);
  if (!cached || typeof cached.streak !== "number") return null;
  return Math.max(0, cached.streak);
}

function readTasksDoneToday() {
  const today = getRealToday();
  try {
    const data = JSON.parse(localStorage.getItem("tskDoneToday") || "null");
    if (data && data.date === today) return Math.max(0, Number(data.count) || 0);
  } catch { /* ignore */ }
  return 0;
}

function collectDayGradeSignals() {
  const pulseFilled = (TODAY_PULSE_DATA?.today_count ?? (TODAY_PULSE_DATA?.pulses || []).length) > 0;
  return {
    paintedHours: countPaintedHours(),
    tasksDone: readTasksDoneToday(),
    pulseFilled,
    practiceStreak: readPracticeStreakFromCache(),
  };
}

function computeHonestDayGrade(signals) {
  const lines = [];
  let total = 0;
  let maxTotal = 0;

  const hoursPts = Math.min(signals.paintedHours / 12, 1) * 40;
  total += hoursPts;
  maxTotal += 40;
  lines.push({
    key: "hours",
    label: `Hours painted (${signals.paintedHours}/12)`,
    pts: hoursPts,
    max: 40,
  });

  const tasksPts = Math.min(signals.tasksDone / 3, 1) * 25;
  total += tasksPts;
  maxTotal += 25;
  lines.push({
    key: "tasks",
    label: `Tasks done today (${signals.tasksDone}/3)`,
    pts: tasksPts,
    max: 25,
  });

  const pulsePts = signals.pulseFilled ? 20 : 0;
  total += pulsePts;
  maxTotal += 20;
  lines.push({
    key: "pulse",
    label: signals.pulseFilled ? "Pulse logged today" : "No pulse logged",
    pts: pulsePts,
    max: 20,
  });

  if (signals.practiceStreak != null) {
    const pracPts = Math.min(signals.practiceStreak / 7, 1) * 15;
    total += pracPts;
    maxTotal += 15;
    lines.push({
      key: "practice",
      label: `Practice streak (${signals.practiceStreak}d, cached)`,
      pts: pracPts,
      max: 15,
    });
  }

  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  const grade = pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";
  return { grade, pct, lines, total: Math.round(total), maxTotal };
}

function buildDayGradeFormulaHtml(result) {
  const rows = result.lines.map(line => `
    <div class="pln-day-grade-row">
      <span>${escapeHtml(line.label)}</span>
      <span>${Math.round(line.pts)}/${line.max}</span>
    </div>`).join("");
  return `<div class="pln-day-grade-formula">
    <p class="pln-day-grade-formula-head">Honest formula — local signals only, no AI.</p>
    ${rows}
    <div class="pln-day-grade-row pln-day-grade-total"><span>Score</span><span>${result.pct}% (${result.total}/${result.maxTotal})</span></div>
  </div>`;
}

function buildDayGradeBadgeHtml(result) {
  return `<details class="pln-day-grade-details" id="pln-day-grade-details">
    <summary class="pln-day-grade-badge pln-day-grade-${escapeHtml(result.grade)}" title="Honest day grade">
      <span class="pln-day-grade-letter">${escapeHtml(result.grade)}</span>
      <span class="pln-day-grade-pct">${result.pct}%</span>
    </summary>
  </details>`;
}

function plnShowsTodayChrome() {
  return ["Today", "Calendar", "Tasks"].includes(ACTIVE_TAB);
}

function tdyWeekLayerOn(name) {
  return TODAY_WEEK_LAYERS.has(name);
}

function tdyPersistWeekLayers() {
  try {
    localStorage.setItem("todayWeekLayers", JSON.stringify([...TODAY_WEEK_LAYERS]));
    if (TODAY_WEEK_LAYERS.size === 0) localStorage.setItem("todayWeekMode", "day");
    else if (TODAY_WEEK_LAYERS.size === 1) localStorage.setItem("todayWeekMode", [...TODAY_WEEK_LAYERS][0]);
    else localStorage.setItem("todayWeekMode", "mix");
  } catch (_) {}
}

function tdyReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function tdyWriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function tdyPersistPlannerDate(date) {
  if (!date) return;
  try { localStorage.setItem(TDY_PLANNER_DATE_KEY, date); } catch (_) {}
}

function tdyRestorePlannerDate() {
  try {
    const stored = localStorage.getItem(TDY_PLANNER_DATE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) && typeof CURRENT_DATE !== "undefined") {
      CURRENT_DATE = stored;
    }
  } catch (_) {}
}

function tdyMetricsOpen() {
  try { return localStorage.getItem(TDY_METRICS_OPEN_KEY) === "1"; } catch { return false; }
}

function tdySetMetricsOpen(open) {
  try { localStorage.setItem(TDY_METRICS_OPEN_KEY, open ? "1" : "0"); } catch (_) {}
}

function tdyHourDivisionMinutes() {
  try {
    const n = Number(localStorage.getItem(TDY_HOUR_DIV_KEY) || "60");
    return [15, 20, 30, 60].includes(n) ? n : 60;
  } catch {
    return 60;
  }
}

function tdySetHourDivisionMinutes(value) {
  const n = Number(value);
  const next = [15, 20, 30, 60].includes(n) ? n : 60;
  try { localStorage.setItem(TDY_HOUR_DIV_KEY, String(next)); } catch (_) {}
  try { document.documentElement.dataset.hourSplit = String(next); } catch (_) {}
  return next;
}

function tdyLoadDaySnapshot(date) {
  const all = tdyReadJson(TDY_DAY_SNAPSHOT_KEY, {});
  return all && typeof all === "object" ? (all[date] || null) : null;
}

function tdySaveDaySnapshot(date, payload) {
  if (!date || !payload) return;
  const all = tdyReadJson(TDY_DAY_SNAPSHOT_KEY, {});
  if (!all || typeof all !== "object") return;
  all[date] = { ...payload, savedAt: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > 40) {
    keys.sort((a, b) => (all[a]?.savedAt || 0) - (all[b]?.savedAt || 0))
      .slice(0, keys.length - 40)
      .forEach(k => { delete all[k]; });
  }
  tdyWriteJson(TDY_DAY_SNAPSHOT_KEY, all);
}

function tdyLoadSplitCache(date) {
  const all = tdyReadJson(TDY_SPLIT_CACHE_KEY, {});
  return (all && typeof all === "object" && all[date] && typeof all[date] === "object") ? all[date] : {};
}

function tdyPersistSplitCache(date, hours) {
  if (!date) return;
  const splits = {};
  Object.entries(hours || {}).forEach(([h, cell]) => {
    if (cell && parseHourSplit(cell.note)) splits[h] = { category: cell.category || "", note: cell.note || "" };
  });
  const all = tdyReadJson(TDY_SPLIT_CACHE_KEY, {});
  if (!all || typeof all !== "object") return;
  if (Object.keys(splits).length) all[date] = splits;
  else delete all[date];
  tdyWriteJson(TDY_SPLIT_CACHE_KEY, all);
}

function tdyMergeLocalSplits(date, hours) {
  const cached = tdyLoadSplitCache(date);
  Object.entries(cached).forEach(([h, cell]) => {
    const hour = Number(h);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    const current = hours[hour] || hours[String(hour)] || {};
    if (parseHourSplit(current.note)) return;
    if (cell?.note && parseHourSplit(cell.note)) hours[hour] = { category: cell.category || current.category || "", note: cell.note };
  });
  return hours;
}

function importanceColor(value) {
  if (typeof window !== "undefined" && typeof window.importanceColor === "function" && window.importanceColor !== importanceColor) {
    return window.importanceColor(value);
  }
  const n = Math.max(0, Math.min(100, Number(value)));
  if (!Number.isFinite(n)) return "#2d7dd2";
  if (n >= 75) return "#c0392b";
  if (n >= 50) return "#d97706";
  if (n >= 25) return "#2d7dd2";
  return "#1f7a4d";
}

function tdyEventKey(kind, id) {
  return `${kind}:${id}`;
}

function tdyIsClassEvent(event) {
  return !!(event && (event.kind === "class" || event.class_id));
}

function tdyEventLane(event) {
  if (!event) return "passion";
  if (event.lane === "work" || event.lane === "passion") return event.lane;
  return tdyIsClassEvent(event) ? "work" : "passion";
}

function tdyParseTimeMinutes(value) {
  const raw = String(value || "").trim();
  const colon = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) return (Number(colon[1]) % 24) * 60 + Math.min(59, Number(colon[2]));
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 2) return (Number(digits) % 24) * 60;
  const padded = digits.slice(-4).padStart(4, "0");
  const hour = Number(padded.slice(0, 2)) % 24;
  const minute = Math.min(59, Number(padded.slice(2)));
  return hour * 60 + minute;
}

function tdyFormatMinutes(mins) {
  const wrapped = ((Number(mins) % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function tdyTimePickHtml(id, value, label) {
  const shown = value ? String(value).slice(0, 5) : "";
  return `<span class="tdy-time-pick" data-time-for="${escapeHtml(id)}">
    <button type="button" class="secondary tdy-time-step" data-dir="-1" aria-label="Earlier ${escapeHtml(label || "time")}">−</button>
    <input type="text" id="${escapeHtml(id)}" class="tdy-time-numeric" inputmode="numeric" placeholder="0930" value="${escapeHtml(shown)}" maxlength="5" aria-label="${escapeHtml(label || "Time")}" title="Type 455 or 4:55, or hold +/−">
    <button type="button" class="secondary tdy-time-step" data-dir="1" aria-label="Later ${escapeHtml(label || "time")}">+</button>
  </span>`;
}

function tdyNormalizeTimeInput(input) {
  if (!input) return "";
  const mins = tdyParseTimeMinutes(input.value);
  if (mins == null) return input.value;
  input.value = tdyFormatMinutes(mins);
  return input.value;
}

function tdyWireTimePick(root = document) {
  root.querySelectorAll(".tdy-time-pick").forEach(wrap => {
    if (wrap.dataset.wired) return;
    wrap.dataset.wired = "1";
    const input = wrap.querySelector(".tdy-time-numeric");
    const stepBtns = wrap.querySelectorAll(".tdy-time-step");
    if (!input) return;
    input.addEventListener("change", () => tdyNormalizeTimeInput(input));
    input.addEventListener("blur", () => tdyNormalizeTimeInput(input));
    input.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      tdyNormalizeTimeInput(input);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    stepBtns.forEach(btn => {
      let timer = null;
      let held = 0;
      const tick = () => {
        const dir = Number(btn.dataset.dir) || 1;
        const current = tdyParseTimeMinutes(input.value) ?? 0;
        const quant = tdyHourDivisionMinutes();
        const accel = held > 12 ? 60 : held > 6 ? Math.max(15, quant) : held > 2 ? quant : Math.min(5, quant);
        input.value = tdyFormatMinutes(current + dir * accel);
        held += 1;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
        held = 0;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      btn.addEventListener("pointerdown", e => {
        if (!e.isPrimary || e.button !== 0) return;
        e.preventDefault();
        held = 0;
        tick();
        timer = setInterval(tick, 220);
        btn.setPointerCapture?.(e.pointerId);
      });
      btn.addEventListener("pointerup", stop);
      btn.addEventListener("pointercancel", stop);
      btn.addEventListener("lostpointercapture", stop);
    });
  });
}

function tdyStopPaint(reason) {
  const wasArmed = !!TDY_ARMED_CAT || TDY_UNPAINT || TDY_PAINT_PHASE !== "idle";
  TDY_ARMED_CAT = null;
  TDY_UNPAINT = false;
  resetPaintState();
  document.querySelectorAll(".tdy-cat-chip").forEach(chip => chip.classList.remove("tdy-cat-armed"));
  updateUnpaintChip();
  updatePaintGhost();
  if (wasArmed && typeof showToast === "function") showToast(reason || "Painting stopped", "info");
}

function tdyPulseDraftNotes(date) {
  const blob = tdyReadJson(TDY_PULSE_DRAFT_KEY, {});
  if (blob && blob.date === date && Array.isArray(blob.notes)) return blob.notes.filter(n => n && String(n).trim());
  return [];
}

function tdySetPulseDraftNotes(date, notes) {
  tdyWriteJson(TDY_PULSE_DRAFT_KEY, { date, notes: (notes || []).filter(Boolean).slice(-12) });
}

function tdyHourDivisionControlHtml() {
  const current = tdyHourDivisionMinutes();
  const options = [15, 20, 30, 60].map(n =>
    `<option value="${n}"${n === current ? " selected" : ""}>${n} min</option>`
  ).join("");
  return `<label class="tdy-hour-div" title="Custom hour divisions">Hour
    <select id="tdy-hour-div" aria-label="Hour divisions">${options}</select>
  </label>`;
}

function tdyNowMarkerTopPct() {
  const now = new Date();
  return ((now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600) / 24) * 100;
}

function tdyPaintNowMarker() {
  const wrap = document.getElementById("tdy-canvas-wrap");
  if (!wrap) return;
  wrap.querySelectorAll(".tdy-now-marker").forEach(node => node.remove());
  if (CURRENT_DATE !== getRealToday()) return;
  const now = new Date();
  const row = wrap.querySelector(`.tdy-hour-row[data-hour-row="${now.getHours()}"]`);
  if (!row) return;
  const marker = document.createElement("div");
  marker.className = "tdy-now-marker";
  marker.title = "Now";
  const frac = now.getMinutes() / 60 + now.getSeconds() / 3600;
  marker.style.top = `${Math.max(0, Math.min(100, frac * 100))}%`;
  row.style.position = "relative";
  row.appendChild(marker);
}

function tdyStartNowMarkerTicker() {
  if (TDY_NOW_MARKER_TIMER) clearInterval(TDY_NOW_MARKER_TIMER);
  tdyPaintNowMarker();
  TDY_NOW_MARKER_TIMER = setInterval(tdyPaintNowMarker, 30000);
}

function tdyApplyHourDivisionTicks(root = document) {
  const split = tdyHourDivisionMinutes();
  try { document.documentElement.dataset.hourSplit = String(split); } catch (_) {}
  root.querySelectorAll(".tdy-hour-cell, .tdy-week-paint-cell, .cal-week-timeline").forEach(cell => {
    cell.dataset.split = String(split);
  });
}

async function tdySendNapkinIssuesToGit() {
  let entries = [];
  if (typeof readNapkinBlob === "function") {
    entries = readNapkinBlob().entries || [];
  } else {
    try {
      const blob = JSON.parse(localStorage.getItem("waypointNapkin") || "null");
      entries = Array.isArray(blob?.entries) ? blob.entries : [];
    } catch { entries = []; }
  }
  const result = await api("/api/napkin/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries, flush: true }),
  });
  return result;
}

function buildTodayHeaderHtml() {
  if (ACTIVE_TAB !== "Today") return "";
  const gradeHtml = CURRENT_DATE === getRealToday() && new Date().getHours() >= 19
    ? buildDayGradeBadgeHtml(computeHonestDayGrade(collectDayGradeSignals()))
    : "";
  const eventsOn = tdyWeekLayerOn("events");
  const paintOn = tdyWeekLayerOn("paint");
  return `<div class="pln-today-header" id="pln-today-header">
    <span class="pln-today-header-date">${escapeHtml(formatViewingLabel(CURRENT_DATE))}</span>
    <div class="pln-today-header-actions" role="group" aria-label="Today view">
      ${gradeHtml}
      <button type="button" class="secondary" id="tdy-week-day" aria-pressed="${!eventsOn && !paintOn}">Day</button>
      <button type="button" class="secondary" id="tdy-week-events" aria-pressed="${eventsOn}">Events</button>
      <button type="button" class="secondary" id="tdy-week-paint" aria-pressed="${paintOn}" aria-controls="tdy-week-paint-sheet">Paint week</button>
      <button type="button" class="secondary" id="tdy-napkin-git" title="Send napkin issues to git">Send napkin to git</button>
    </div>
  </div>`;
}


function updateDayGradeBadge() {
  if (ACTIVE_TAB !== "Today" || CURRENT_DATE !== getRealToday()) return;
  if (new Date().getHours() < 19) {
    document.getElementById("pln-day-grade-details")?.remove();
    return;
  }
  const header = document.getElementById("pln-today-header");
  if (!header) return;
  const result = computeHonestDayGrade(collectDayGradeSignals());
  const details = document.getElementById("pln-day-grade-details");
  const wasOpen = details?.open;
  const badgeHtml = buildDayGradeBadgeHtml(result);
  const existing = document.getElementById("pln-day-grade-details");
  if (existing) {
    existing.outerHTML = badgeHtml;
  } else {
    header.insertAdjacentHTML("beforeend", badgeHtml);
  }
  const next = document.getElementById("pln-day-grade-details");
  if (next && wasOpen) next.open = true;
}

function formatFocusRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function focusTimerActive() {
  return FOCUS_TIMER_ENDS_AT != null && Date.now() < FOCUS_TIMER_ENDS_AT;
}

function buildFocusTimerBlock() {
  if (!focusTimerActive()) {
    return `<button type="button" class="secondary pln-focus-start" id="pln-focus-start">Focus 25m</button>`;
  }
  const remaining = Math.max(0, FOCUS_TIMER_ENDS_AT - Date.now());
  const pct = Math.max(0, Math.min(100, (remaining / FOCUS_TIMER_MS) * 100));
  return `<div class="pln-focus-boss" id="pln-focus-boss">
    <div class="pln-focus-boss-head">
      <strong>Focus boss</strong>
      <span id="pln-focus-time">${escapeHtml(formatFocusRemaining(remaining))}</span>
    </div>
    <div class="pln-focus-boss-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
      <div class="pln-focus-boss-hp" id="pln-focus-hp" style="width:${pct.toFixed(1)}%;"></div>
    </div>
    <button type="button" class="secondary pln-focus-abandon" id="pln-focus-abandon">Abandon</button>
  </div>`;
}

function stopFocusTimerTick() {
  if (FOCUS_TIMER_TICK_ID) {
    clearInterval(FOCUS_TIMER_TICK_ID);
    FOCUS_TIMER_TICK_ID = null;
  }
}

function pauseFocusTimerForHiddenTab() {
  if (!focusTimerActive() || FOCUS_TIMER_HIDDEN_SINCE) return;
  FOCUS_TIMER_HIDDEN_SINCE = Date.now();
  stopFocusTimerTick();
}

function resumeFocusTimerFromHiddenTab() {
  if (!FOCUS_TIMER_HIDDEN_SINCE) return;
  if (focusTimerActive()) {
    FOCUS_TIMER_ENDS_AT += Date.now() - FOCUS_TIMER_HIDDEN_SINCE;
    if (FOCUS_TIMER_ENDS_AT <= Date.now()) {
      FOCUS_TIMER_HIDDEN_SINCE = null;
      completeFocusTimer();
      return;
    }
    startFocusTimerTick();
  }
  FOCUS_TIMER_HIDDEN_SINCE = null;
}

function wireFocusTimerVisibility() {
  if (window._focusTimerVisibilityWired) return;
  window._focusTimerVisibilityWired = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseFocusTimerForHiddenTab();
    else resumeFocusTimerFromHiddenTab();
  });
}

function refreshFocusTimerUi() {
  const mount = document.getElementById("pln-rail-extras-focus");
  if (!mount) return;
  mount.innerHTML = buildFocusTimerBlock();
  wireFocusTimerControls();
  if (focusTimerActive() && !document.hidden) startFocusTimerTick();
}

function startFocusTimerTick() {
  stopFocusTimerTick();
  if (document.hidden || !document.getElementById("pln-rail-extras-focus")) return;
  FOCUS_TIMER_TICK_ID = setInterval(() => {
    if (!document.getElementById("pln-rail-extras-focus")) {
      stopFocusTimerTick();
      return;
    }
    if (!focusTimerActive()) {
      stopFocusTimerTick();
      return;
    }
    const remaining = FOCUS_TIMER_ENDS_AT - Date.now();
    if (remaining <= 0) {
      completeFocusTimer();
      return;
    }
    const hp = document.getElementById("pln-focus-hp");
    const timeEl = document.getElementById("pln-focus-time");
    const pct = Math.max(0, Math.min(100, (remaining / FOCUS_TIMER_MS) * 100));
    if (hp) hp.style.width = pct.toFixed(1) + "%";
    if (timeEl) timeEl.textContent = formatFocusRemaining(remaining);
    const track = document.querySelector(".pln-focus-boss-track");
    if (track) track.setAttribute("aria-valuenow", String(Math.round(pct)));
  }, 1000);
}

function completeFocusTimer() {
  FOCUS_TIMER_ENDS_AT = null;
  stopFocusTimerTick();
  wgAwardXp(25, "focus session");
  showToast("Focus boss defeated · +25 XP", "good");
  refreshFocusTimerUi();
}

function abandonFocusTimer() {
  FOCUS_TIMER_ENDS_AT = null;
  stopFocusTimerTick();
  showToast("Focus abandoned — no reward", "info");
  refreshFocusTimerUi();
}

function wireFocusTimerControls() {
  document.getElementById("pln-focus-start")?.addEventListener("click", () => {
    if (focusTimerActive()) return;
    FOCUS_TIMER_ENDS_AT = Date.now() + FOCUS_TIMER_MS;
    refreshFocusTimerUi();
    showToast("25-minute focus boss started", "info");
  });
  document.getElementById("pln-focus-abandon")?.addEventListener("click", () => {
    if (!focusTimerActive()) return;
    abandonFocusTimer();
  });
}

function tdyAddictiveLoopStyles() {
  return `<style>
    .pln-today-header { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; margin:0 0 6px; padding:4px 8px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); }
    .pln-today-header-date { font-size:12px; font-weight:600; color:var(--ink-secondary); }
    .pln-today-header-actions { display:flex; align-items:center; gap:6px; flex-wrap:nowrap; flex-shrink:0; }
    .pln-day-grade-details { margin:0; }
    .pln-day-grade-badge { display:inline-flex; align-items:center; gap:6px; list-style:none; cursor:pointer; padding:4px 10px; border-radius:999px; border:1px solid var(--border); background:var(--bg-shell); font-size:11px; font-weight:700; user-select:none; }
    .pln-day-grade-badge::-webkit-details-marker { display:none; }
    .pln-day-grade-letter { font-size:14px; line-height:1; }
    .pln-day-grade-pct { font-size:10px; color:var(--ink-muted); font-weight:500; }
    .pln-day-grade-A { border-color:color-mix(in srgb, var(--status-good) 50%, var(--border)); color:var(--status-good); }
    .pln-day-grade-B { border-color:color-mix(in srgb, var(--accent) 45%, var(--border)); color:var(--accent); }
    .pln-day-grade-C { border-color:color-mix(in srgb, var(--status-warning) 40%, var(--border)); color:var(--status-warning, #c98500); }
    .pln-day-grade-D, .pln-day-grade-F { border-color:color-mix(in srgb, var(--status-critical) 40%, var(--border)); color:var(--status-critical); }
    .pln-day-grade-formula { margin-top:8px; padding:8px 10px; border-radius:8px; border:1px solid var(--gridline); background:var(--bg-shell); font-size:11px; min-width:220px; }
    .pln-day-grade-formula-head { margin:0 0 6px; color:var(--ink-muted); font-size:10px; }
    .pln-day-grade-row { display:flex; justify-content:space-between; gap:8px; padding:2px 0; }
    .pln-day-grade-total { margin-top:4px; padding-top:4px; border-top:1px solid var(--gridline); font-weight:600; }
    .pln-pulse-honesty-note { margin:6px 0 0; padding:6px 10px; border-radius:8px; font-size:11px; color:var(--ink-secondary); border:1px solid color-mix(in srgb, var(--status-good) 35%, var(--border)); background:color-mix(in srgb, var(--status-good) 10%, var(--bg-card)); }
    .pln-focus-start { width:100%; margin-top:8px; font-size:11px; }
    .pln-focus-boss { margin-top:8px; padding:8px; border-radius:8px; border:1px solid color-mix(in srgb, var(--status-critical) 35%, var(--border)); background:color-mix(in srgb, var(--status-critical) 8%, var(--bg-shell)); }
    .pln-focus-boss-head { display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:6px; }
    .pln-focus-boss-track { height:10px; border-radius:999px; background:color-mix(in srgb, var(--status-critical) 20%, var(--bg-card)); overflow:hidden; border:1px solid color-mix(in srgb, var(--status-critical) 25%, var(--border)); }
    .pln-focus-boss-hp { height:100%; border-radius:999px; background:linear-gradient(90deg, var(--status-critical), color-mix(in srgb, var(--status-warning) 70%, var(--status-critical))); transition:width 0.9s linear; }
    .pln-focus-abandon { width:100%; margin-top:6px; font-size:10px; }
  </style>`;
}

const RIT_DATE_KEY = "ritualDate";
const RIT_CONTRACT_KEY = "dailyContract";
const RIT_SKIP_KEY = "ritualSkip";
const RIT_SWAP_KEY = "ritualSwapDate";
const RIT_PUZZLE_DATE_KEY = "ritualPuzzleDate";
const RIT_PUZZLE_SOLVED_KEY = "ritualPuzzleSolved";
const RIT_ANAGRAM_WORDS = ["planet", "care", "team", "read", "stop", "late", "note", "rest", "star", "calm"];
const PLN_UNFINISHED_HOUR_THRESHOLD = 3;
const RIT_MOVE_HEURISTICS = [
  "open the file",
  "write 3 bullets",
  "paint your morning hours",
  "set a 10-minute timer",
  "name the very first step",
];
const RIT_TROPHY_ROAD = [
  { node: 1, label: "+50 coins" },
  { node: 2, label: "Campus rival" },
  { node: 3, label: "Signal Storm badge" },
  { node: 4, label: "+75 coins" },
  { node: 5, label: "Bronze chest" },
  { node: 6, label: "Constellation skin" },
  { node: 7, label: "+1 bonus trophy" },
  { node: 8, label: "Rival dialogue pack" },
  { node: 9, label: "+100 coins" },
  { node: 10, label: "Founder qualifier" },
];

function setTodayDirty(delta = 1) {
  TODAY_DIRTY = true;
  TODAY_DIRTY_VERSION += 1;
  if (delta > 0) PLN_CHANGE_COUNT += delta;
  updatePlannerHudDirty();
  updatePlannerSaveBtn();
  scheduleTodayAutosave();
}

function resetTodayDirty() {
  TODAY_DIRTY = false;
  PLN_CHANGE_COUNT = 0;
  updatePlannerHudDirty();
  updatePlannerSaveBtn();
}

function updatePlannerHudDirty() {
  const nameEl = document.getElementById("hud-app-name");
  if (nameEl) nameEl.classList.toggle("pln-hud-dirty", TODAY_DIRTY);
}

function updatePlannerSaveBtn() {
  const btn = document.getElementById("save-day");
  if (!btn || btn.disabled) return;
  const realToday = getRealToday();
  const isPastDay = CURRENT_DATE < realToday;
  const base = isPastDay ? `Save ${CURRENT_DATE}` : "Save day";
  btn.textContent = PLN_CHANGE_COUNT > 0 ? `Save ${PLN_CHANGE_COUNT} change${PLN_CHANGE_COUNT === 1 ? "" : "s"}` : base;
}

function collectDaySavePayload() {
  const hours = {};
  for (let h = 0; h < 24; h++) {
    const cell = getHourCell(h);
    if (cell.category || cell.note) {
      hours[h] = { category: cell.category || "", note: cell.note || "" };
    }
  }
  // Only include keys that still have live controls. An empty DOM (leave race) must not
  // POST a sparse payload that clears previously saved day metrics.
  const metrics = {};
  const notesEl = document.getElementById("metric-notes");
  if (notesEl) metrics.notes = notesEl.value || "";
  const metricDefs = (typeof CONFIG !== "undefined" && CONFIG && Array.isArray(CONFIG.metrics))
    ? CONFIG.metrics
    : [];
  metricDefs.forEach(m => {
    const el = document.getElementById(`metric-${m.key}`);
    if (!el) return;
    const v = el.value;
    metrics[m.key] = v === "" ? null : Number(v);
  });
  return { metrics, hours };
}

function splitHourGradientStyle(colorA, colorB) {
  return `background:linear-gradient(to bottom, ${colorA} 0%, ${colorA} 50%, ${colorB} 50%, ${colorB} 100%);`;
}

function scheduleTodayAutosave() {
  if (TODAY_AUTOSAVE_TIMER) clearTimeout(TODAY_AUTOSAVE_TIMER);
  TODAY_AUTOSAVE_TIMER = setTimeout(() => {
    TODAY_AUTOSAVE_TIMER = null;
    quietSaveDay().catch(exc => console.warn("[today] autosave failed:", exc));
  }, TODAY_AUTOSAVE_DEBOUNCE_MS);
}

async function quietSaveDay({ keepalive = false } = {}) {
  if (TODAY_AUTOSAVE_IN_FLIGHT) {
    await TODAY_AUTOSAVE_IN_FLIGHT;
    if (TODAY_DIRTY) return quietSaveDay({ keepalive });
    return;
  }
  if (!TODAY_DIRTY) return;
  const savedVersion = TODAY_DIRTY_VERSION;
  const savedDate = CURRENT_DATE;
  const run = (async () => {
    const { metrics, hours } = collectDaySavePayload();
    // Refuse a no-op sparse save that would only bump updated_at (or historically null fields).
    if (!Object.keys(metrics).length && !Object.keys(hours).length) return;
    tdySaveDaySnapshot(savedDate, { metrics, hours });
    tdyPersistSplitCache(savedDate, hours);
    await api(`/api/day/${savedDate}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metrics, hours, quiet: true }),
      keepalive,
    });
    if (CURRENT_DATE === savedDate && TODAY_DIRTY_VERSION === savedVersion) resetTodayDirty();
    if (!TODAY_DAYS_WITH_DATA) await ensureTodayDaysCache();
    else if (dayRowHasMetricData({ ...metrics, notes: metrics.notes }) || Object.keys(hours).length > 0) {
      TODAY_DAYS_WITH_DATA.add(savedDate);
    }
  })();
  TODAY_AUTOSAVE_IN_FLIGHT = run;
  try {
    await run;
  } finally {
    TODAY_AUTOSAVE_IN_FLIGHT = null;
  }
}

async function flushTodayAutosave({ keepalive = false } = {}) {
  if (TODAY_AUTOSAVE_TIMER) {
    clearTimeout(TODAY_AUTOSAVE_TIMER);
    TODAY_AUTOSAVE_TIMER = null;
  }
  if (!TODAY_DIRTY && !TODAY_AUTOSAVE_IN_FLIGHT) return;
  await quietSaveDay({ keepalive });
}

function scheduleWeekPaintSave() {
  if (WEEK_PAINT_SAVE_TIMER) clearTimeout(WEEK_PAINT_SAVE_TIMER);
  WEEK_PAINT_SAVE_TIMER = setTimeout(() => {
    WEEK_PAINT_SAVE_TIMER = null;
    flushWeekPaint().catch(exc => console.warn("[today] week paint autosave failed:", exc));
  }, TODAY_AUTOSAVE_DEBOUNCE_MS);
}

async function flushWeekPaint({ keepalive = false } = {}) {
  if (WEEK_PAINT_SAVE_TIMER) {
    clearTimeout(WEEK_PAINT_SAVE_TIMER);
    WEEK_PAINT_SAVE_TIMER = null;
  }
  if (WEEK_PAINT_SAVE_IN_FLIGHT) {
    await WEEK_PAINT_SAVE_IN_FLIGHT;
    if (WEEK_PAINT_DIRTY.size) return flushWeekPaint({ keepalive });
    return;
  }
  const dirtyDates = [...WEEK_PAINT_DIRTY];
  if (!dirtyDates.length) return;
  const run = Promise.all(dirtyDates.map(async date => {
    const hours = WEEK_PAINT_HOURS[date] || {};
    const snapshot = JSON.stringify(hours);
    await api(`/api/day/${date}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, quiet: true }),
      keepalive,
    });
    if (JSON.stringify(WEEK_PAINT_HOURS[date] || {}) === snapshot) WEEK_PAINT_DIRTY.delete(date);
    if (date === CURRENT_DATE) {
      const painted = Object.values(hours).filter(cell => cell?.category).length;
      if (painted >= 2) {
        wgQuestProgress("paint6", 2);
        wgDispatchGameState();
      }
    }
    if (TODAY_DAYS_WITH_DATA && Object.values(hours).some(cell => cell?.category || cell?.note)) {
      TODAY_DAYS_WITH_DATA.add(date);
    }
  }));
  WEEK_PAINT_SAVE_IN_FLIGHT = run;
  try {
    await run;
  } finally {
    WEEK_PAINT_SAVE_IN_FLIGHT = null;
  }
  if (WEEK_PAINT_DIRTY.size) await flushWeekPaint({ keepalive });
}

function flushTodayAutosaveBeforeUnload() {
  if (!TODAY_DIRTY) return;
  if (TODAY_AUTOSAVE_TIMER) {
    clearTimeout(TODAY_AUTOSAVE_TIMER);
    TODAY_AUTOSAVE_TIMER = null;
  }
  const { metrics, hours } = collectDaySavePayload();
  if (!Object.keys(metrics).length && !Object.keys(hours).length) return;
  tdySaveDaySnapshot(CURRENT_DATE, { metrics, hours });
  tdyPersistSplitCache(CURRENT_DATE, hours);
  fetch(`/api/day/${CURRENT_DATE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metrics, hours, quiet: true }),
    keepalive: true,
  }).catch(() => { /* the page is leaving; keepalive owns delivery */ });
}

function flushWeekPaintBeforeUnload() {
  WEEK_PAINT_DIRTY.forEach(date => {
    const hours = WEEK_PAINT_HOURS[date] || {};
    fetch(`/api/day/${date}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, quiet: true }),
      keepalive: true,
    }).catch(() => { /* the page is leaving; keepalive owns delivery */ });
  });
}

function ensureTodayAutosaveGuard() {
  if (!window._plnTodayLeaveSaveWired) {
    window._plnTodayLeaveSaveWired = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && ACTIVE_TAB === "Today") {
        flushTodayAutosave({ keepalive: true }).catch(exc => console.warn("[today] hidden save failed:", exc));
        flushWeekPaint({ keepalive: true }).catch(exc => console.warn("[today] week paint save failed:", exc));
      }
    });
    window.addEventListener("beforeunload", flushTodayAutosaveBeforeUnload);
    window.addEventListener("pagehide", flushTodayAutosaveBeforeUnload);
    window.addEventListener("beforeunload", flushWeekPaintBeforeUnload);
    window.addEventListener("pagehide", flushWeekPaintBeforeUnload);
  }
  if (window._plnNavigateToTabPatched || typeof navigateToTab !== "function") return;
  window._plnNavigateToTabPatched = true;
  const origNavigateToTab = navigateToTab;
  window.navigateToTab = async function(tab) {
    if (ACTIVE_TAB === "Today" && tab !== "Today") {
      try {
        await Promise.all([
          flushTodayAutosave({ keepalive: true }),
          flushWeekPaint({ keepalive: true }),
        ]);
      } catch (exc) {
        console.warn("[today] leave save failed:", exc);
      }
    }
    return origNavigateToTab(tab);
  };
}

function plnGetScheduled(date, hour) {
  const day = PLN_SCHEDULED[date];
  if (!day) return [];
  return day[hour] ?? day[String(hour)] ?? [];
}

function plnSetScheduled(date, hour, entries) {
  if (!PLN_SCHEDULED[date]) PLN_SCHEDULED[date] = {};
  if (!entries.length) {
    delete PLN_SCHEDULED[date][hour];
    delete PLN_SCHEDULED[date][String(hour)];
  } else {
    PLN_SCHEDULED[date][hour] = entries;
  }
}

function plnLoadScheduledRows(date, rows) {
  PLN_SCHEDULED[date] = {};
  (rows || []).forEach(row => {
    const hour = Number(row.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    const entry = {
      taskId: Number(row.task_id),
      title: row.title || "Task",
      estimateMin: plnTaskEstimateMinutes(row),
    };
    PLN_SCHEDULED[date][hour] = [...(PLN_SCHEDULED[date][hour] || []), entry];
  });
}

function plnRemoveScheduledTask(date, taskId) {
  const day = PLN_SCHEDULED[date] || {};
  Object.keys(day).forEach(hour => {
    const next = (day[hour] || []).filter(entry => Number(entry.taskId) !== Number(taskId));
    if (next.length) day[hour] = next;
    else delete day[hour];
  });
}

function plnTaskEstimateMinutes(task) {
  if (task.progress_total != null && (task.progress_unit || "h").toLowerCase().startsWith("h")) {
    return Math.round(Number(task.progress_total) * 60);
  }
  return 60;
}

async function navigateToPlannerDay(newDate) {
  if (newDate === CURRENT_DATE && ACTIVE_TAB === "Today") return false;
  if (TODAY_DIRTY || TODAY_AUTOSAVE_TIMER || WEEK_PAINT_DIRTY.size) {
    await Promise.all([flushTodayAutosave(), flushWeekPaint()]);
  }
  plnSyncCalState(newDate);
  if (ACTIVE_TAB === "Today") render();
  else goToTab("Today");
  return true;
}

async function tryNavigateTodayDate(newDate) {
  if (newDate === CURRENT_DATE) return false;
  if (TODAY_DIRTY || TODAY_AUTOSAVE_TIMER || WEEK_PAINT_DIRTY.size) {
    await Promise.all([flushTodayAutosave(), flushWeekPaint()]);
  }
  plnSyncCalState(newDate);
  render();
  return true;
}

function getRealToday() {
  return localYmd();
}

function ritLoadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function ritGetRitualDate() {
  return localStorage.getItem(RIT_DATE_KEY) || "";
}

function ritSetRitualDate(date) {
  localStorage.setItem(RIT_DATE_KEY, date);
}

function ritLoadContract() {
  const c = ritLoadJson(RIT_CONTRACT_KEY, null);
  if (!c || c.date !== getRealToday()) return null;
  return c;
}

function ritSaveContract(contract) {
  localStorage.setItem(RIT_CONTRACT_KEY, JSON.stringify(contract));
}

function ritShouldShowRitual() {
  if (ACTIVE_TAB !== "Today") return false;
  const today = getRealToday();
  if (CURRENT_DATE !== today) return false;
  return ritGetRitualDate() !== today;
}

function ritSortOpenTasks(tasks, todayStr) {
  return tasks
    .filter(t => t.status !== "done")
    .sort((a, b) => {
      if (typeof computeTaskUrgency !== "function") return 0;
      return computeTaskUrgency(b, todayStr).score - computeTaskUrgency(a, todayStr).score;
    });
}

function ritFirstCalendarBlock(calEvents, todayStr) {
  const dayEvents = calEvents
    .filter(e => e.date === todayStr)
    .sort((a, b) => (a.start_time || "99:99").localeCompare(b.start_time || "99:99"));
  return dayEvents[0] || null;
}

function ritPickAnchor(tasks, calEvents, todayStr, rank) {
  const sorted = ritSortOpenTasks(tasks, todayStr);
  if (sorted.length > rank) {
    const task = sorted[rank];
    return { type: "task", id: task.id, title: task.title || "Untitled task", task };
  }
  const ev = ritFirstCalendarBlock(calEvents, todayStr);
  if (ev) {
    const time = ev.start_time ? ev.start_time.slice(0, 5) : "";
    const title = ev.title || "Calendar block";
    return { type: "calendar", id: ev.id, title: time ? `${title} (${time})` : title, event: ev };
  }
  return { type: "none", id: null, title: "Paint your day", task: null, event: null };
}

function ritDeriveMove(anchor) {
  const title = (anchor.title || "").toLowerCase();
  if (/write|draft|email|essay|report|doc/.test(title)) return "write 3 bullets";
  if (/code|file|fix|implement|build|debug|refactor/.test(title)) return "open the file";
  if (/paint|schedule|plan|hour|morning|day/.test(title)) return "paint your morning hours";
  if (anchor.type === "calendar") return "block 15 minutes to prepare";
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h + title.charCodeAt(i)) % 997;
  return RIT_MOVE_HEURISTICS[h % RIT_MOVE_HEURISTICS.length];
}

function ritGetTrophyRoadProgress() {
  return Math.max(0, parseInt(localStorage.getItem("arcadeTrophyRoad") || "0", 10) || 0);
}

function ritBuildRewardText(summary) {
  const streak = summary?.streak || 0;
  const points = summary?.points || 0;
  const roadIdx = ritGetTrophyRoadProgress();
  if (streak > 0) {
    const nextNode = RIT_TROPHY_ROAD[roadIdx];
    if (nextNode && points > 0) {
      return `Keep your ${streak}-day streak — ${points.toLocaleString()} coins toward ${nextNode.label}`;
    }
    return `Keep your ${streak}-day streak alive today`;
  }
  const nextNode = RIT_TROPHY_ROAD[roadIdx];
  if (nextNode) {
    const coinsHint = points > 0 ? ` (${points.toLocaleString()} coins)` : "";
    return `Next unlock: ${nextNode.label}${coinsHint}`;
  }
  return "One small win starts the day";
}

function ritDateSeed(isoDate) {
  let h = 0;
  for (let i = 0; i < isoDate.length; i++) h = (h * 31 + isoDate.charCodeAt(i)) >>> 0;
  return h;
}

function ritScrambleWord(word, seed) {
  const chars = word.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = (seed + i * 17) % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
    seed = (seed * 1103515245 + 12345) >>> 0;
  }
  const scrambled = chars.join("");
  return scrambled === word ? ritScrambleWord(word, seed + 1) : scrambled;
}

function ritBuildDailyPuzzle(isoDate) {
  const seed = ritDateSeed(isoDate);
  const type = seed % 3;
  if (type === 0) {
    const a = (seed % 12) + 3;
    const b = ((seed >> 4) % 15) + 5;
    const multiply = (seed >> 8) % 2 === 0;
    const answer = multiply ? a * b : a + b;
    const prompt = multiply ? `${a} × ${b} = ?` : `${a} + ${b} = ?`;
    return { type: "math", prompt, answer: String(answer) };
  }
  if (type === 1) {
    const word = RIT_ANAGRAM_WORDS[seed % RIT_ANAGRAM_WORDS.length];
    return { type: "anagram", prompt: `Unscramble: ${ritScrambleWord(word, seed)}`, answer: word };
  }
  const ratio = (seed % 2) + 2;
  const start = (seed % 4) + 2;
  const a = start;
  const b = start * ratio;
  const c = start * ratio * ratio;
  const missing = start * ratio * ratio * ratio;
  const d = start * ratio * ratio * ratio * ratio;
  return { type: "sequence", prompt: `${a}, ${b}, ${c}, ?, ${d}`, answer: String(missing) };
}

function ritIsPuzzleSolvedToday() {
  const today = getRealToday();
  return localStorage.getItem(RIT_PUZZLE_DATE_KEY) === today
    && localStorage.getItem(RIT_PUZZLE_SOLVED_KEY) === "1";
}

function ritMarkPuzzleSolved() {
  localStorage.setItem(RIT_PUZZLE_DATE_KEY, getRealToday());
  localStorage.setItem(RIT_PUZZLE_SOLVED_KEY, "1");
}

function ritNormalizePuzzleAnswer(raw) {
  return (raw || "").trim().toLowerCase().replace(/\s+/g, "");
}

function ritBuildSparkCardHtml(isoDate) {
  if (ritIsPuzzleSolvedToday()) {
    return `<div class="rit-card rit-card-spark rit-spark-cleared">
      <span class="rit-card-tag">Spark</span>
      <div class="rit-card-body">Spark cleared</div>
      <p class="rit-spark-sub">Tiny win already banked today.</p>
    </div>`;
  }
  const puzzle = ritBuildDailyPuzzle(isoDate);
  return `<div class="rit-card rit-card-spark" id="rit-spark-card" data-answer="${escapeHtml(ritNormalizePuzzleAnswer(puzzle.answer))}">
    <span class="rit-card-tag">Spark</span>
    <div class="rit-card-body" id="rit-spark-prompt">${escapeHtml(puzzle.prompt)}</div>
    <div class="rit-spark-form" id="rit-spark-form">
      <input type="text" class="rit-spark-input" id="rit-spark-input" maxlength="32" placeholder="Your answer" autocomplete="off">
      <button type="button" class="secondary rit-spark-check" id="rit-spark-check">Check</button>
    </div>
    <p class="rit-spark-feedback" id="rit-spark-feedback" hidden></p>
    <button type="button" class="secondary rit-spark-skip" id="rit-spark-skip" hidden>Skip spark</button>
  </div>`;
}

function ritStyles() {
  return `<style>
    .rit-contract-banner { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px; margin:0 0 8px; border-radius:8px; border:1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); background:color-mix(in srgb, var(--accent) 8%, var(--bg-card)); font-size:12px; }
    .rit-contract-banner.rit-contract-done { opacity:0.65; border-color:var(--status-good); background:color-mix(in srgb, var(--status-good) 10%, var(--bg-card)); }
    .rit-contract-label { font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-muted); }
    .rit-contract-anchor { font-weight:600; color:var(--ink-primary); }
    .rit-contract-move { color:var(--ink-secondary); }
    .rit-contract-check { margin:0; cursor:pointer; }
    .rit-overlay { position:absolute; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; border-radius:10px; background:color-mix(in srgb, var(--bg-card) 94%, var(--bg-shell)); backdrop-filter:blur(2px); }
    #pln-shell { position:relative; }
    .rit-panel { width:100%; max-width:640px; }
    .rit-head { text-align:center; margin-bottom:16px; }
    .rit-head h2 { margin:0 0 4px; font-size:16px; font-weight:600; color:var(--ink-primary); }
    .rit-head p { margin:0; font-size:12px; color:var(--ink-muted); }
    .rit-cards { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; margin-bottom:16px; }
    @media (max-width:900px) { .rit-cards { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
    @media (max-width:500px) { .rit-cards { grid-template-columns:1fr; } }
    .rit-card { padding:14px 12px; border-radius:10px; border:1px solid var(--gridline); background:var(--bg-shell); min-height:100px; display:flex; flex-direction:column; gap:6px; }
    .rit-card-spark { border-color:color-mix(in srgb, var(--accent) 28%, var(--gridline)); }
    .rit-spark-form { display:flex; gap:6px; align-items:center; margin-top:4px; }
    .rit-spark-input { flex:1; min-width:0; box-sizing:border-box; font-size:12px; padding:5px 8px; border-radius:8px; border:1px solid var(--border); }
    .rit-spark-check, .rit-spark-skip { font-size:11px; padding:4px 8px; }
    .rit-spark-feedback { margin:0; font-size:11px; color:var(--ink-muted); }
    .rit-spark-feedback.rit-spark-wrong { color:var(--status-warning, #c98500); }
    .rit-spark-feedback.rit-spark-good { color:var(--status-good); }
    .rit-spark-sub { margin:0; font-size:11px; color:var(--ink-muted); }
    .rit-spark-cleared .rit-card-body { color:var(--status-good); font-weight:600; }
    .rit-card-tag { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--ink-muted); }
    .rit-card-body { font-size:13px; line-height:1.45; color:var(--ink-primary); flex:1; }
    .rit-actions { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
    .rit-actions button { font-size:12px; }
    .rit-skip-form { display:none; margin-top:12px; text-align:center; }
    .rit-skip-form.rit-skip-open { display:block; }
    .rit-skip-input { width:100%; max-width:320px; box-sizing:border-box; font-size:13px; padding:6px 10px; border-radius:8px; border:1px solid var(--border); margin-bottom:8px; }
    .rit-celebrate { animation:rit-glow 0.6s ease; }
    @keyframes rit-glow { 0%,100% { box-shadow:none; } 50% { box-shadow:0 0 0 2px color-mix(in srgb, var(--status-good) 40%, transparent); } }
  </style>`;
}

function ritBuildContractBanner(contract) {
  if (!contract || contract.date !== getRealToday()) return "";
  const done = !!contract.done;
  return `<div class="rit-contract-banner${done ? " rit-contract-done" : ""}" id="rit-contract-banner">
    <span class="rit-contract-label">Daily contract</span>
    <span class="rit-contract-anchor">${escapeHtml(contract.anchorTitle || "Today")}</span>
    <span class="rit-contract-move">→ ${escapeHtml(contract.move || "")}</span>
    <label class="rit-contract-check"><input type="checkbox" id="rit-contract-done"${done ? " checked disabled" : ""}> Done</label>
  </div>`;
}

function ritBuildOverlayHtml(anchor, move, reward, swapUsed, todayStr) {
  return `<div class="rit-overlay" id="rit-overlay">
    <div class="rit-panel">
      <div class="rit-head">
        <h2>Ritual Runway</h2>
        <p>Four cards. One small start.</p>
      </div>
      <div class="rit-cards">
        <div class="rit-card">
          <span class="rit-card-tag">Anchor</span>
          <div class="rit-card-body" id="rit-anchor-body">${escapeHtml(anchor.title)}</div>
        </div>
        <div class="rit-card">
          <span class="rit-card-tag">Move</span>
          <div class="rit-card-body" id="rit-move-body">${escapeHtml(move)}</div>
        </div>
        <div class="rit-card">
          <span class="rit-card-tag">Reward</span>
          <div class="rit-card-body" id="rit-reward-body">${escapeHtml(reward)}</div>
        </div>
        ${ritBuildSparkCardHtml(todayStr)}
      </div>
      <div class="rit-actions">
        <button type="button" class="primary" id="rit-accept">Accept</button>
        <button type="button" class="secondary" id="rit-swap"${swapUsed ? " disabled" : ""}>Swap once</button>
        <button type="button" class="secondary" id="rit-skip-btn">Skip</button>
      </div>
      <div class="rit-skip-form" id="rit-skip-form">
        <input type="text" class="rit-skip-input" id="rit-skip-reason" maxlength="120" placeholder="One-line reason (optional)">
        <button type="button" class="secondary" id="rit-skip-confirm">Dismiss</button>
      </div>
    </div>
  </div>`;
}

async function ritFetchPracticeSummary() {
  try {
    const summary = await api("/api/practice/summary");
    cachePracticeSummary(summary);
    return summary;
  } catch {
    return { points: 0, streak: 0, total_attempts: 0 };
  }
}

function ritDismissOverlay() {
  document.getElementById("rit-overlay")?.remove();
}

function ritInsertContractBanner(contract) {
  const existing = document.getElementById("rit-contract-banner");
  if (existing) existing.remove();
  const chips = document.getElementById("pln-mode-chips");
  if (!chips || !contract) return;
  chips.insertAdjacentHTML("afterend", ritBuildContractBanner(contract));
  wireRitualContractDone();
}

async function ritPostContractReceipt(summary) {
  try {
    await api("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "planner", kind: "contract_done", summary }),
    });
  } catch {
    /* graceful if 404 or unavailable */
  }
}

function ritRefreshOverlayContent(anchor, move, reward) {
  const anchorEl = document.getElementById("rit-anchor-body");
  const moveEl = document.getElementById("rit-move-body");
  const rewardEl = document.getElementById("rit-reward-body");
  if (anchorEl) anchorEl.textContent = anchor.title;
  if (moveEl) moveEl.textContent = move;
  if (rewardEl) rewardEl.textContent = reward;
}

function wireRitualContractDone() {
  const cb = document.getElementById("rit-contract-done");
  if (!cb || cb._ritWired) return;
  cb._ritWired = true;
  cb.onchange = async () => {
    if (!cb.checked) return;
    const contract = ritLoadContract();
    if (!contract || contract.done) return;
    contract.done = true;
    ritSaveContract(contract);
    const banner = document.getElementById("rit-contract-banner");
    if (banner) {
      banner.classList.add("rit-contract-done", "rit-celebrate");
      setTimeout(() => banner.classList.remove("rit-celebrate"), 700);
    }
    cb.disabled = true;
    const summary = `${contract.anchorTitle}: ${contract.move}`;
    await ritPostContractReceipt(summary);
    wgAwardXp(30, "daily contract");
    wgQuestProgress("contract1");
    showToast("Contract complete", "good");
  };
}

function ritRefreshSparkCleared() {
  const card = document.getElementById("rit-spark-card");
  if (!card) return;
  card.outerHTML = `<div class="rit-card rit-card-spark rit-spark-cleared">
    <span class="rit-card-tag">Spark</span>
    <div class="rit-card-body">Spark cleared</div>
    <p class="rit-spark-sub">Tiny win already banked today.</p>
  </div>`;
}

function wireRitualSpark(todayStr) {
  const card = document.getElementById("rit-spark-card");
  if (!card || ritIsPuzzleSolvedToday()) return;

  const expected = card.dataset.answer || "";
  const input = document.getElementById("rit-spark-input");
  const feedback = document.getElementById("rit-spark-feedback");
  const skipBtn = document.getElementById("rit-spark-skip");
  let wrongAttempts = 0;

  const showFeedback = (text, kind) => {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.textContent = text;
    feedback.classList.remove("rit-spark-wrong", "rit-spark-good");
    if (kind) feedback.classList.add(kind);
  };

  const markSolved = () => {
    ritMarkPuzzleSolved();
    wgAwardXp(5, "spark");
    showToast("Spark cleared", "good");
    ritRefreshSparkCleared();
  };

  const checkAnswer = () => {
    const guess = ritNormalizePuzzleAnswer(input?.value);
    if (!guess) {
      showFeedback("Type an answer first.", "rit-spark-wrong");
      return;
    }
    if (guess === expected) {
      markSolved();
      return;
    }
    wrongAttempts += 1;
    if (wrongAttempts >= 2) {
      showFeedback("Not quite — you can skip spark for today.", "rit-spark-wrong");
      if (input) input.disabled = true;
      document.getElementById("rit-spark-check")?.setAttribute("disabled", "disabled");
      skipBtn?.removeAttribute("hidden");
      return;
    }
    showFeedback("Try once more.", "rit-spark-wrong");
    input?.focus();
    input?.select();
  };

  document.getElementById("rit-spark-check")?.addEventListener("click", checkAnswer);
  input?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkAnswer();
    }
  });
  skipBtn?.addEventListener("click", () => {
    card.outerHTML = `<div class="rit-card rit-card-spark rit-spark-cleared">
      <span class="rit-card-tag">Spark</span>
      <div class="rit-card-body">Spark skipped</div>
      <p class="rit-spark-sub">You can try again tomorrow.</p>
    </div>`;
    showToast("Spark skipped", "info");
  });
}

function wireRitualRunway(anchor, move, reward, tasks, calEvents, todayStr) {
  if (!document.getElementById("rit-overlay")) {
    wireRitualContractDone();
    return;
  }

  let currentAnchor = anchor;
  let currentMove = move;
  let swapUsed = RIT_SWAP_USED || localStorage.getItem(RIT_SWAP_KEY) === todayStr;

  document.getElementById("rit-accept")?.addEventListener("click", () => {
    const today = getRealToday();
    ritSetRitualDate(today);
    const contract = {
      date: today,
      anchorTaskId: currentAnchor.type === "task" ? currentAnchor.id : null,
      anchorTitle: currentAnchor.title,
      anchorType: currentAnchor.type,
      move: currentMove,
      done: false,
    };
    ritSaveContract(contract);
    ritDismissOverlay();
    ritInsertContractBanner(contract);
    showToast("Daily contract set", "good");
  });

  document.getElementById("rit-swap")?.addEventListener("click", () => {
    if (swapUsed) return;
    RIT_ANCHOR_RANK += 1;
    RIT_SWAP_USED = true;
    localStorage.setItem(RIT_SWAP_KEY, todayStr);
    swapUsed = true;
    currentAnchor = ritPickAnchor(tasks, calEvents, todayStr, RIT_ANCHOR_RANK);
    currentMove = ritDeriveMove(currentAnchor);
    ritRefreshOverlayContent(currentAnchor, currentMove, reward);
    const swapBtn = document.getElementById("rit-swap");
    if (swapBtn) swapBtn.disabled = true;
  });

  document.getElementById("rit-skip-btn")?.addEventListener("click", () => {
    document.getElementById("rit-skip-form")?.classList.add("rit-skip-open");
    document.getElementById("rit-skip-reason")?.focus();
  });

  document.getElementById("rit-skip-confirm")?.addEventListener("click", () => {
    const today = getRealToday();
    const reason = document.getElementById("rit-skip-reason")?.value?.trim() || "";
    ritSetRitualDate(today);
    if (reason) {
      localStorage.setItem(RIT_SKIP_KEY, JSON.stringify({ date: today, reason }));
    }
    ritDismissOverlay();
  });

  wireRitualSpark(todayStr);
  wireRitualContractDone();
}

function pulseHappinessColor(n) {
  const v = Math.max(1, Math.min(10, Number(n) || 1));
  const t = (v - 1) / 9;
  const r = Math.round(220 - t * 170);
  const g = Math.round(70 + t * 120);
  const b = Math.round(70 + t * 30);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatPulseTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16);
  }
}

const PULSE_NOTE_SAVE_COOLDOWN_MS = 60_000;
const PULSE_NOTE_SAVE_AT_KEY = "waypointPulseNoteSaveAt";
let PULSE_COUNTDOWN_TIMER = null;

function formatPulseCooldownTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16);
  }
}

function formatPulseRemaining(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "ready";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPulseMsRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isPulseOnCooldown(nextAllowedAt) {
  if (!nextAllowedAt) return false;
  return new Date(nextAllowedAt).getTime() > Date.now();
}

function pulseNoteSaveRemainingMs() {
  try {
    const at = Number(sessionStorage.getItem(PULSE_NOTE_SAVE_AT_KEY) || 0);
    if (!at) return 0;
    return Math.max(0, at + PULSE_NOTE_SAVE_COOLDOWN_MS - Date.now());
  } catch {
    return 0;
  }
}

function markPulseNoteSavedNow() {
  try { sessionStorage.setItem(PULSE_NOTE_SAVE_AT_KEY, String(Date.now())); } catch { /* ignore */ }
}

function clearPulseCountdownTicker() {
  if (PULSE_COUNTDOWN_TIMER) {
    clearInterval(PULSE_COUNTDOWN_TIMER);
    PULSE_COUNTDOWN_TIMER = null;
  }
}

function pulseCountdownMarkup(iso, label) {
  if (!iso || !isPulseOnCooldown(iso)) return "";
  const text = `${label} ${formatPulseRemaining(iso)}`;
  return `<span class="pls-countdown" data-pls-countdown="${escapeHtml(iso)}" data-pls-countdown-label="${escapeHtml(label)}">${escapeHtml(text)}</span>`;
}

function startPulseCountdownTicker() {
  clearPulseCountdownTicker();
  const tick = () => {
    let needsReload = false;
    document.querySelectorAll("[data-pls-countdown]").forEach(el => {
      const iso = el.dataset.plsCountdown;
      const label = el.dataset.plsCountdownLabel || "next in";
      const remaining = formatPulseRemaining(iso);
      if (remaining === "ready") {
        el.textContent = "ready to log";
        needsReload = true;
        return;
      }
      el.textContent = `${label} ${remaining}`;
    });
    document.querySelectorAll("[data-pls-save-again]").forEach(btn => {
      const left = pulseNoteSaveRemainingMs();
      if (left <= 0) {
        if (btn.dataset.saveLabel) btn.textContent = btn.dataset.saveLabel;
        btn.disabled = false;
        delete btn.dataset.plsSaveAgain;
        return;
      }
      btn.disabled = true;
      btn.textContent = `Save in ${formatPulseMsRemaining(left)}`;
    });
    if (needsReload && typeof loadPulseData === "function" && CURRENT_DATE === getRealToday()) {
      clearPulseCountdownTicker();
      loadPulseData(CURRENT_DATE).then(fresh => updatePulseUiInPlace(fresh)).catch(() => startPulseCountdownTicker());
    }
  };
  tick();
  const hasTargets = document.querySelector("[data-pls-countdown], [data-pls-save-again]");
  if (hasTargets) PULSE_COUNTDOWN_TIMER = setInterval(tick, 1000);
}

function buildPulseDots(count, max = 6) {
  return Array.from({ length: max }, (_, i) =>
    `<span class="pls-dot${i < count ? " pls-dot-filled" : ""}"></span>`).join("");
}

function renderPulseTimeline(pulses) {
  if (!pulses.length) {
    return `<p class="stub pls-timeline-empty">No pulses logged yet.</p>`;
  }
  return `<div class="pls-timeline">${pulses.map(p => `
    <div class="pls-timeline-item">
      <span class="pls-timeline-time">${escapeHtml(formatPulseTime(p.created_at))}</span>
      <span class="pls-timeline-dot" style="background:${pulseHappinessColor(p.happiness)};"></span>
      <span class="pls-timeline-val">${escapeHtml(String(p.happiness))}</span>
      ${p.energy != null ? `<span class="pls-timeline-energy stub">⚡${escapeHtml(String(p.energy))}</span>` : ""}
      ${p.note ? `<span class="pls-timeline-note">${escapeHtml(p.note)}</span>` : ""}
    </div>`).join("")}</div>`;
}

function pulseDetailsEditable(pulseData, isViewingToday) {
  if (!isViewingToday) return false;
  if (pulseData?.details_editable) return true;
  const pulses = pulseData?.pulses || [];
  if (!pulses.length) return false;
  const latest = pulses[pulses.length - 1];
  if (!latest?.created_at) return false;
  try {
    const created = new Date(latest.created_at).getTime();
    const mins = Number(pulseData?.cooldown_minutes) || 120;
    return Date.now() - created <= mins * 60 * 1000;
  } catch {
    return false;
  }
}

function pulseEditableId(pulseData) {
  if (pulseData?.editable_pulse_id != null) return pulseData.editable_pulse_id;
  const pulses = pulseData?.pulses || [];
  return pulses.length ? pulses[pulses.length - 1].id : null;
}

function renderPulseCard(pulseData, isViewingToday) {
  const pulses = pulseData.pulses || [];
  const todayCount = pulseData.today_count ?? pulses.length;
  const nextAllowed = pulseData.next_allowed_at;
  const onCooldown = isViewingToday && isPulseOnCooldown(nextAllowed);
  const atDailyLimit = isViewingToday && todayCount >= 6;
  const canLogNew = isViewingToday && !onCooldown && !atDailyLimit;
  const canEditDetails = pulseDetailsEditable(pulseData, isViewingToday);
  const feelingLocked = isViewingToday && (onCooldown || atDailyLimit);
  const latest = pulses.length ? pulses[pulses.length - 1] : null;
  const lockedHappiness = feelingLocked && latest ? Number(latest.happiness) : null;
  const editableId = pulseEditableId(pulseData);
  const dotCount = isViewingToday ? todayCount : pulses.length;

  const happinessBtns = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const color = pulseHappinessColor(n);
    const locked = feelingLocked;
    const selected = lockedHappiness === n ? " pls-selected" : "";
    return `<button type="button" class="pls-h-btn${selected}" data-happiness="${n}" aria-label="Happiness ${n}" style="background:${color};" ${locked || !canLogNew ? "disabled" : ""} title="${locked ? "Feeling locked for 2h" : n}">${n}</button>`;
  }).join("");

  const energyBtns = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const editingDetails = canEditDetails && feelingLocked;
    const selected = editingDetails && latest && Number(latest.energy) === n ? " pls-selected" : "";
    return `<button type="button" class="pls-e-btn${selected}" data-energy="${n}" aria-label="Energy ${n}" ${canEditDetails || canLogNew ? "" : "disabled"}>${n}</button>`;
  }).join("");

  let statusShort = "";
  if (!isViewingToday) {
    statusShort = `${pulses.length} logged (read-only)`;
  } else if (atDailyLimit) {
    statusShort = "6/6 today";
  } else if (onCooldown && canEditDetails) {
    statusShort = `feeling locked · ${pulseCountdownMarkup(nextAllowed, "next in") || `details until ${escapeHtml(formatPulseCooldownTime(nextAllowed))}`}`;
  } else if (onCooldown) {
    statusShort = pulseCountdownMarkup(nextAllowed, "next in") || `next ${escapeHtml(formatPulseCooldownTime(nextAllowed))}`;
  } else {
    statusShort = `${todayCount}/6 today`;
  }

  const noteVal = (!canLogNew && latest?.note) ? escapeHtml(latest.note) : "";
  const noteSaveLeft = pulseNoteSaveRemainingMs();
  const detailsAction = canEditDetails && feelingLocked
    ? `<button type="button" class="secondary" id="pls-save-details" data-pulse-id="${escapeHtml(String(editableId || ""))}"${noteSaveLeft > 0 ? ` data-pls-save-again="1" data-save-label="Save energy & note" disabled` : ""}>${noteSaveLeft > 0 ? `Save in ${formatPulseMsRemaining(noteSaveLeft)}` : "Save energy &amp; note"}</button>`
    : (canLogNew ? `<button type="button" class="primary" id="pls-submit" disabled>Log pulse</button>` : "");

  const formHtml = isViewingToday ? `
    <div class="pls-form" id="pls-form" data-pulse-id="${escapeHtml(String(editableId || ""))}">
      <div class="pls-row pls-energy-row">
        <span class="pls-label stub">Energy <span class="pls-optional">${canLogNew ? "(optional — set before logging)" : "(editable in the 2h window)"}</span></span>
        <div class="pls-e-row" id="pls-energy-row">${energyBtns}</div>
      </div>
      <div class="pls-row">
        <span class="pls-label">Happiness ${feelingLocked ? '<span class="pls-optional">(locked 2h)</span>' : ""}</span>
        <div class="pls-h-row" id="pls-happiness-row">${happinessBtns}</div>
      </div>
      <input type="text" id="pls-note" class="pls-note" maxlength="200" placeholder="One-line note (optional)" value="${noteVal}" ${canEditDetails || canLogNew ? "" : "disabled"}>
      ${detailsAction}
    </div>` : "";

  const expandDefault = isViewingToday && (canLogNew || canEditDetails) && (!pulses.length || canEditDetails);

  return `
    <style>
      .pls-card { margin-top: 0; }
      .pls-compact-summary { display:flex; align-items:center; gap:8px; flex-wrap:wrap; cursor:pointer; list-style:none; font-size:13px; }
      .pls-compact-summary::-webkit-details-marker { display:none; }
      .pls-compact-summary::before { content:"▸"; font-size:10px; color:var(--ink-muted); transition:transform 0.15s; }
      .pls-card[open] .pls-compact-summary::before { transform:rotate(90deg); }
      .pls-counter { font-size:12px; color:var(--ink-muted); margin-left:auto; }
      .pls-dots { display:inline-flex; gap:3px; vertical-align:middle; }
      .pls-dot { width:6px; height:6px; border-radius:50%; background:var(--border); }
      .pls-dot-filled { background:var(--status-good); }
      .pls-h-row, .pls-e-row { display:flex; gap:4px; flex-wrap:wrap; }
      .pls-h-btn { flex:1; min-width:28px; max-width:42px; height:36px; border:none; border-radius:8px; color:#fff; font-weight:600; font-size:13px; cursor:pointer; opacity:0.85; transition:transform 0.1s, opacity 0.1s; }
      .pls-h-btn:hover:not(:disabled), .pls-e-btn:hover:not(:disabled) { opacity:1; transform:scale(1.05); }
      .pls-h-btn.pls-selected, .pls-e-btn.pls-selected { outline:2px solid var(--ink-secondary); outline-offset:2px; opacity:1; }
      .pls-h-btn:focus-visible, .pls-e-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; opacity:1; }
      .pls-h-btn:disabled, .pls-e-btn:disabled { cursor:not-allowed; opacity:0.4; }
      .pls-h-btn:disabled.pls-selected { opacity:1; }
      .pls-e-btn { min-width:24px; height:24px; border:1px solid var(--border); border-radius:6px; background:var(--bg-shell); font-size:11px; cursor:pointer; color:var(--ink-secondary); }
      .pls-body { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
      .pls-row { margin-bottom:8px; }
      .pls-label { display:block; font-size:12px; margin-bottom:4px; color:var(--ink-secondary); }
      .pls-optional { font-size:11px; }
      .pls-note { width:100%; box-sizing:border-box; margin:8px 0; font-size:13px; }
      .pls-timeline { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
      .pls-timeline-item { display:flex; align-items:center; gap:8px; font-size:12px; flex-wrap:wrap; }
      .pls-timeline-time { font-variant-numeric:tabular-nums; color:var(--ink-muted); min-width:42px; }
      .pls-timeline-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
      .pls-timeline-val { font-weight:600; min-width:14px; }
      .pls-timeline-energy { font-size:11px; }
      .pls-timeline-note { color:var(--ink-secondary); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pls-status-warn { color:var(--status-warning, #c98500); }
      .pls-timeline-empty { margin:0; font-size:12px; }
    </style>
    <details class="card pls-card" id="pls-card"${expandDefault ? " open" : ""}>
      <summary class="pls-compact-summary">
        <strong>Pulse</strong>
        <span class="pls-dots">${buildPulseDots(dotCount)}</span>
        <span class="pls-counter${atDailyLimit ? " pls-status-warn" : ""}">${statusShort}</span>
      </summary>
      <div class="pls-body">
        ${formHtml}
        ${renderPulseTimeline(pulses)}
      </div>
    </details>`;
}

function renderPulseCompactRow(pulseData, isViewingToday) {
  const pulses = pulseData.pulses || [];
  const todayCount = pulseData.today_count ?? pulses.length;
  const nextAllowed = pulseData.next_allowed_at;
  const onCooldown = isViewingToday && isPulseOnCooldown(nextAllowed);
  const atDailyLimit = isViewingToday && todayCount >= 6;
  const canLogNew = isViewingToday && !onCooldown && !atDailyLimit;
  const canEditDetails = pulseDetailsEditable(pulseData, isViewingToday);
  const feelingLocked = isViewingToday && (onCooldown || atDailyLimit);
  const latest = pulses.length ? pulses[pulses.length - 1] : null;
  const lockedHappiness = feelingLocked && latest ? Number(latest.happiness) : null;
  const dotCount = isViewingToday ? todayCount : pulses.length;

  const happinessBtns = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const color = pulseHappinessColor(n);
    const selected = lockedHappiness === n ? " pls-selected" : "";
    return `<button type="button" class="pls-h-btn${selected}" data-happiness="${n}" aria-label="Happiness ${n}" style="background:${color};" ${feelingLocked || !canLogNew ? "disabled" : ""} title="${feelingLocked ? "Feeling locked for 2h" : n}">${n}</button>`;
  }).join("");
  const energyOptions = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const selected = canEditDetails && !canLogNew && Number(latest?.energy) === n ? " selected" : "";
    return `<option value="${n}"${selected}>${n}</option>`;
  }).join("");

  let statusShort = "";
  if (!isViewingToday) {
    statusShort = `${pulses.length} logged (read-only)`;
  } else if (atDailyLimit) {
    statusShort = "6/6 today";
  } else if (onCooldown && canEditDetails) {
    statusShort = `locked · ${pulseCountdownMarkup(nextAllowed, "next in") || "details open"}`;
  } else if (onCooldown) {
    statusShort = pulseCountdownMarkup(nextAllowed, "next in") || `next ${escapeHtml(formatPulseCooldownTime(nextAllowed))}`;
  } else {
    statusShort = `${todayCount}/6 today`;
  }

  const canUseCompactDetails = canLogNew || canEditDetails;
  const compactNote = (!canLogNew && latest?.note) ? escapeHtml(latest.note) : "";
  const noteSaveLeft = pulseNoteSaveRemainingMs();
  const compactAction = canLogNew
    ? `<button type="button" class="primary pls-submit" id="pls-compact-submit" disabled>Log</button>`
    : (canEditDetails
      ? `<button type="button" class="secondary pls-submit" id="pls-compact-save-details" data-pulse-id="${escapeHtml(String(pulseEditableId(pulseData) || ""))}" data-save-label="Save note"${noteSaveLeft > 0 ? ` data-pls-save-again="1" disabled` : ""}>${noteSaveLeft > 0 ? `Save in ${formatPulseMsRemaining(noteSaveLeft)}` : "Save note"}</button>`
      : (onCooldown
        ? `<span class="stub pls-feeling-locked" style="font-size:11px;">${pulseCountdownMarkup(nextAllowed, "next in") || "feeling locked"}</span>`
        : `<span class="stub" style="font-size:11px;">feeling locked</span>`));
  const happinessCheck = canLogNew
    ? `<span class="pls-happiness-check" id="pls-happiness-check" hidden>Energy full — happiness check: pick 1–10</span>`
    : "";
  const formHtml = isViewingToday ? `
    <div class="pls-compact-inputs">
      <div class="pls-compact-feeling-row">
        ${canUseCompactDetails ? `<label class="pls-compact-energy">Energy <span class="stub">(optional)</span>
          <select id="pls-compact-energy" aria-label="Optional energy before logging"><option value="">—</option>${energyOptions}</select>
        </label>` : ""}
        <div class="pls-h-row" id="pls-compact-happiness-row">${happinessBtns}</div>
        ${happinessCheck}
      </div>
      <input type="text" id="pls-compact-note" class="pls-note pls-compact-note" maxlength="200"
        aria-label="Pulse note" placeholder="Pulse note (optional)" value="${compactNote}" ${canUseCompactDetails ? "" : "disabled"}>
    </div>
    ${compactAction}` : "";

  return `<div class="pln-pulse-compact" id="pls-compact-row">
    <strong>Pulse</strong>
    <span class="pls-dots">${buildPulseDots(dotCount)}</span>
    ${formHtml}
    <span class="pls-counter${atDailyLimit ? " pls-status-warn" : ""}">${statusShort}</span>
  </div>`;
}

function buildEodBanner(paintedCount) {
  if (CURRENT_DATE !== getRealToday()) return "";
  if (new Date().getHours() < 19) return "";
  if (paintedCount >= 4) return "";
  return `<div class="pln-eod-banner" id="pln-eod-banner">
    End of day — you have ${paintedCount} hour${paintedCount === 1 ? "" : "s"} painted.
    <a href="#" id="pln-eod-scroll-grid">Fill in your day</a>
  </div>`;
}

async function loadPulseData(date) {
  return api(`/api/pulses?date=${encodeURIComponent(date)}`);
}

function updatePulseUiInPlace(fresh) {
  TODAY_PULSE_DATA = fresh;
  syncPulseHonestyFromPulseData(fresh, CURRENT_DATE);
  clearPulseCountdownTicker();
  const compact = document.getElementById("pls-compact-row");
  if (compact) compact.outerHTML = renderPulseCompactRow(fresh, true);
  const card = document.getElementById("pls-card");
  if (card) card.outerHTML = renderPulseCard(fresh, true);
  refreshPulseHonestyNote();
  updateDayGradeBadge();
  wirePulseCard(true);
  startPulseCountdownTicker();
}

function pulseDataAfterCreate(current, result) {
  const pulse = result?.pulse;
  if (!pulse) return current;
  const pulses = [...(current?.pulses || []), pulse];
  return {
    ...(current || {}),
    pulses,
    today_count: result.today_count ?? pulses.length,
    next_allowed_at: result.next_allowed_at,
    details_editable: true,
    editable_pulse_id: pulse.id,
  };
}

function wirePulseCard(isViewingToday) {
  if (!isViewingToday) return;

  let selectedHappiness = null;
  let selectedEnergy = null;
  const latest = (TODAY_PULSE_DATA?.pulses || []).slice(-1)[0];
  const canLogNew = !isPulseOnCooldown(TODAY_PULSE_DATA?.next_allowed_at)
    && (TODAY_PULSE_DATA?.today_count ?? (TODAY_PULSE_DATA?.pulses || []).length) < 6;
  if (!canLogNew && latest?.energy != null) selectedEnergy = Number(latest.energy);
  if (canLogNew) {
    const compactEnergySeed = document.getElementById("pls-compact-energy");
    if (compactEnergySeed?.value) selectedEnergy = Number(compactEnergySeed.value);
  }

  const submitBtns = [
    document.getElementById("pls-compact-submit"),
    document.getElementById("pls-submit"),
  ].filter(Boolean);
  const noteInput = document.getElementById("pls-note");
  const compactNoteInput = document.getElementById("pls-compact-note");
  const saveDetailsBtns = [
    document.getElementById("pls-compact-save-details"),
    document.getElementById("pls-save-details"),
  ].filter(Boolean);
  const compactEnergy = document.getElementById("pls-compact-energy");
  const happinessCheck = document.getElementById("pls-happiness-check");
  const happinessRow = document.getElementById("pls-compact-happiness-row") || document.getElementById("pls-happiness-row");
  const readNote = () => (noteInput ? noteInput.value : compactNoteInput?.value)?.trim() || "";

  function updateHappinessCheckPrompt() {
    const energyFull = selectedEnergy === 10;
    if (happinessCheck) {
      happinessCheck.hidden = !(canLogNew && energyFull && selectedHappiness == null);
    }
    happinessRow?.classList.toggle("pls-happiness-nudge", !!(canLogNew && energyFull && selectedHappiness == null));
  }

  function updateSubmitState() {
    submitBtns.forEach(btn => { btn.disabled = selectedHappiness == null; });
    updateHappinessCheckPrompt();
  }

  async function reloadPulseUi() {
    const fresh = await loadPulseData(CURRENT_DATE);
    updatePulseUiInPlace(fresh);
  }

  document.querySelectorAll(".pls-h-btn:not(:disabled)").forEach(btn => {
    btn.onclick = () => {
      selectedHappiness = Number(btn.dataset.happiness);
      document.querySelectorAll(".pls-h-btn").forEach(b => b.classList.toggle("pls-selected", Number(b.dataset.happiness) === selectedHappiness));
      updateSubmitState();
    };
  });

  document.querySelectorAll(".pls-e-btn:not(:disabled)").forEach(btn => {
    btn.onclick = () => {
      const n = Number(btn.dataset.energy);
      if (selectedEnergy === n) {
        selectedEnergy = null;
        btn.classList.remove("pls-selected");
      } else {
        selectedEnergy = n;
        document.querySelectorAll(".pls-e-btn").forEach(b => b.classList.toggle("pls-selected", b === btn));
      }
      updateHappinessCheckPrompt();
    };
  });
  if (compactEnergy) {
    compactEnergy.onchange = () => {
      selectedEnergy = compactEnergy.value === "" ? null : Number(compactEnergy.value);
      updateHappinessCheckPrompt();
    };
  }
  updateHappinessCheckPrompt();
  startPulseCountdownTicker();

  const submitPulse = async (submitBtn) => {
    if (selectedHappiness == null) return;
    submitBtns.forEach(b => { b.disabled = true; });
    submitBtn.textContent = "Logging…";
    try {
      const body = { happiness: selectedHappiness };
      if (selectedEnergy != null) body.energy = selectedEnergy;
      const note = readNote();
      if (note) body.note = note;
      if (note) {
        const kept = tdyPulseDraftNotes(getRealToday());
        tdySetPulseDraftNotes(getRealToday(), [...kept, note]);
      }

      let result;
      try {
        result = await api("/api/pulses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (exc) {
        let parsed = null;
        try { parsed = JSON.parse(exc.message); } catch { /* not JSON */ }
        if (parsed?.error) {
          showToast(parsed.error, "warn");
          await reloadPulseUi();
          return;
        }
        throw exc;
      }

      wgAwardXp(8, "pulse");
      wgQuestProgress("pulse2");
      if (note) wgQuestProgress("reflect1");
      wgDispatchGameState();
      window.WaypointHabits?.observe("pulse");
      recordPulseHonestyDate(getRealToday());
      maybeAwardPulseHonestyBonus();
      const nextIn = formatPulseRemaining(result?.next_allowed_at);
      showToast(nextIn && nextIn !== "ready"
        ? `Pulse logged · next in ${nextIn}`
        : "Pulse logged · feeling locked 2h", "good");
      if (noteInput) noteInput.value = "";
      if (compactNoteInput) compactNoteInput.value = "";
      try { tdySetPulseDraftNotes(getRealToday(), []); } catch (_) {}
      updatePulseUiInPlace(pulseDataAfterCreate(TODAY_PULSE_DATA, result));
    } catch (exc) {
      showToast("Pulse failed: " + exc, "warn");
    } finally {
      submitBtns.forEach(b => {
        b.textContent = b.id === "pls-compact-submit" ? "Log" : "Log pulse";
      });
      updateSubmitState();
    }
  };

  submitBtns.forEach(btn => {
    btn.onclick = () => submitPulse(btn);
  });

  saveDetailsBtns.forEach(saveDetailsBtn => {
    saveDetailsBtn.onclick = async () => {
      if (pulseNoteSaveRemainingMs() > 0) {
        showToast(`Save again in ${formatPulseMsRemaining(pulseNoteSaveRemainingMs())}`, "info");
        startPulseCountdownTicker();
        return;
      }
      const pulseId = saveDetailsBtn.dataset.pulseId || document.getElementById("pls-form")?.dataset.pulseId;
      if (!pulseId) {
        showToast("No pulse to update", "warn");
        return;
      }
      const previousLabels = saveDetailsBtns.map(btn => btn.dataset.saveLabel || btn.textContent);
      saveDetailsBtns.forEach(btn => {
        btn.disabled = true;
        btn.textContent = "Saving…";
      });
      try {
        const body = {};
        if (selectedEnergy != null) body.energy = selectedEnergy;
        else body.energy = null;
        body.note = readNote();
        const result = await api(`/api/pulses/${pulseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        markPulseNoteSavedNow();
        const nextAllowed = result?.next_allowed_at || TODAY_PULSE_DATA?.next_allowed_at;
        const nextIn = formatPulseRemaining(nextAllowed);
        showToast(nextIn && nextIn !== "ready"
          ? `Note saved · next pulse in ${nextIn}`
          : "Energy & note saved", "good");
        const pulses = (TODAY_PULSE_DATA?.pulses || []).map(p => p.id === result.pulse?.id ? result.pulse : p);
        updatePulseUiInPlace({
          ...(TODAY_PULSE_DATA || {}),
          ...result,
          pulses,
          editable_pulse_id: result.pulse?.id,
        });
      } catch (exc) {
        let parsed = null;
        try { parsed = JSON.parse(exc.message); } catch { /* not JSON */ }
        showToast(parsed?.error || ("Save failed: " + exc), "warn");
        saveDetailsBtns.forEach((btn, index) => {
          btn.disabled = false;
          btn.textContent = previousLabels[index];
        });
      }
    };
  });
}

function addDays(isoDate, delta) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const p = n => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function plnYmFromDate(isoDate) {
  return isoDate.slice(0, 7);
}

function plnShiftYm(ym, deltaMonths, anchorDay) {
  const [y, m] = ym.split("-").map(Number);
  const day = anchorDay ?? Number(CURRENT_DATE.slice(8, 10)) ?? 1;
  const target = new Date(y, m - 1 + deltaMonths, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, maxDay));
  const p = n => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}`;
}

function plnSyncCalState(selectedDate) {
  if (selectedDate) {
    PLN_CAL.selected = selectedDate;
    CURRENT_DATE = selectedDate;
    PLN_CAL.viewYm = plnYmFromDate(selectedDate);
  } else {
    if (!PLN_CAL.selected) PLN_CAL.selected = CURRENT_DATE;
    if (!PLN_CAL.viewYm) PLN_CAL.viewYm = plnYmFromDate(PLN_CAL.selected);
    CURRENT_DATE = PLN_CAL.selected;
  }
  tdyPersistPlannerDate(CURRENT_DATE);
  return PLN_CAL;
}

function plnGetViewYm() {
  return PLN_CAL.viewYm || plnYmFromDate(CURRENT_DATE);
}

const PLN_MODE_TABS = ["Today", "Tasks", "Goals", "Calendar", "Events", "Paint", "Trends"];

function buildPlannerModeChips() {
  const chips = PLN_MODE_TABS.map(t => {
    const label = typeof TAB_LABELS !== "undefined" && TAB_LABELS[t] ? TAB_LABELS[t] : t;
    return `<button type="button" class="pln-mode-chip${ACTIVE_TAB === t ? " pln-mode-chip-active" : ""}" data-tab="${escapeHtml(t)}">${escapeHtml(label)}</button>`;
  }).join("");
  return `<div class="pln-mode-chips" id="pln-mode-chips" role="tablist" aria-label="Planner views">${chips}</div>`;
}

function formatViewingLabel(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function countTodayWords(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function countPaintedHours() {
  let n = 0;
  for (let h = 0; h < 24; h++) {
    if (TODAY_HOURS[h]?.category || TODAY_HOURS[String(h)]?.category) n++;
  }
  return n;
}

function plannerDayHasTimedEvents() {
  for (let h = 0; h < 24; h++) {
    if (plnTimedEventsForHour(CURRENT_DATE, h).length) return true;
  }
  return false;
}

function plannerCanvasHasContent() {
  return countPaintedHours() > 0 || plannerDayHasTimedEvents();
}

function getTodayCompletionPct() {
  return Math.round((countPaintedHours() / 24) * 100);
}

function updateTodayCompletionMeter(previewPainted) {
  const bar = document.getElementById("tdy-completion-bar");
  const label = document.getElementById("tdy-completion-label");
  if (!bar) return;
  let painted = countPaintedHours();
  if (previewPainted != null) painted = previewPainted;
  const pct = Math.round((painted / 24) * 100);
  bar.style.width = pct + "%";
  if (pct >= 66) bar.style.background = "var(--status-good)";
  else if (pct >= 33) bar.style.background = "var(--accent)";
  else bar.style.background = "var(--ink-muted)";
  if (label) label.textContent = pct + "% scheduled";
}

function previewPaintedCountWithRange(lo, hi, category, unpaint) {
  if (unpaint) {
    let n = countPaintedHours();
    hourRange(lo, hi).forEach(h => {
      if (getHourCell(h).category) n--;
    });
    return n;
  }
  if (!category) return countPaintedHours();
  const ghostHours = new Set(hourRange(lo, hi));
  let n = 0;
  for (let h = 0; h < 24; h++) {
    const cell = getHourCell(h);
    if (cell.category || (ghostHours.has(h) && category)) n++;
  }
  return n;
}

function initTodayHoursFromDay(hours) {
  TODAY_HOURS = {};
  const merged = tdyMergeLocalSplits(CURRENT_DATE, { ...(hours || {}) });
  const snap = tdyLoadDaySnapshot(CURRENT_DATE);
  const source = Object.keys(merged).length ? merged : (snap?.hours || {});
  for (let h = 0; h < 24; h++) {
    const cell = source[h] ?? source[String(h)] ?? {};
    if (cell.category || cell.note) {
      TODAY_HOURS[h] = { category: cell.category || "", note: cell.note || "" };
    }
  }
  tdyPersistSplitCache(CURRENT_DATE, TODAY_HOURS);
}

function getHourCell(h) {
  return TODAY_HOURS[h] || TODAY_HOURS[String(h)] || { category: "", note: "" };
}

function setHourCell(h, patch) {
  const prev = getHourCell(h);
  const next = { category: prev.category || "", note: prev.note || "", ...patch };
  if (!next.category && !next.note) {
    delete TODAY_HOURS[h];
    delete TODAY_HOURS[String(h)];
  } else {
    TODAY_HOURS[h] = next;
  }
  tdyPersistSplitCache(CURRENT_DATE, TODAY_HOURS);
}

function hourRange(lo, hi) {
  const out = [];
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  for (let h = a; h <= b; h++) out.push(h);
  return out;
}

function applyHourCategories(sourceHours, replaceAll) {
  let count = 0;
  for (let h = 0; h < 24; h++) {
    const cell = sourceHours[h] ?? sourceHours[String(h)] ?? {};
    const category = cell.category ?? cell;
    if (!category || typeof category !== "string") continue;
    const prev = getHourCell(h);
    if (!replaceAll && prev.category) continue;
    setHourCell(h, { category, note: prev.note });
    count++;
  }
  if (count > 0) {
    setTodayDirty();
    refreshHourCanvas();
  }
  updateTodayCompletionMeter();
  return count;
}

function captureCurrentHourCategories() {
  const hours = {};
  for (let h = 0; h < 24; h++) {
    const cell = getHourCell(h);
    if (cell.category) hours[h] = cell.category;
  }
  return hours;
}

function refreshHourCanvas() {
  if (TDY_CANVAS_REFRESH_RAF) return;
  TDY_CANVAS_REFRESH_RAF = requestAnimationFrame(() => {
    TDY_CANVAS_REFRESH_RAF = null;
    refreshHourCanvasNow();
  });
}

function refreshHourCanvasNow() {
  const wrap = document.getElementById("tdy-canvas-wrap");
  if (wrap) wrap.innerHTML = buildHourCanvasRowsWithBadges();
  else {
    for (let h = 0; h < 24; h++) {
      const el = document.querySelector(`.tdy-hour-cell[data-hour="${h}"]`);
      if (!el) continue;
      const cell = getHourCell(h);
      const split = parseHourSplit(cell.note);
      el.style.cssText = hourCellPaintStyle(cell);
      el.classList.toggle("tdy-hour-painted", !!cell.category);
      el.classList.toggle("tdy-hour-split", !!split);
      el.title = hourCellSplitTitle(cell);
      const noteEl = el.querySelector(".tdy-hour-note-preview");
      if (noteEl) noteEl.textContent = stripSplitPrefix(cell.note) || "";
      el.classList.toggle("tdy-hour-selected", TDY_SELECT_SET.has(h));
    }
  }
  updatePaintGhost();
  updateSelectBar();
  const empty = document.getElementById("tdy-hour-empty");
  if (empty) empty.hidden = plannerCanvasHasContent();
  wireHourCellInteractions();
  updateMetricPaintHints();
  updateDayGradeBadge();
  tdyApplyHourDivisionTicks();
  tdyPaintNowMarker();
}

function updatePaintGhost() {
  document.querySelectorAll(".tdy-hour-cell").forEach(el => {
    el.classList.remove("tdy-hour-ghost", "tdy-hour-ghost-strong", "tdy-hour-ghost-unpaint");
    el.style.removeProperty("--tdy-ghost-fill");
    const oldLbl = el.querySelector(".tdy-ghost-count");
    if (oldLbl) oldLbl.remove();
  });
  document.getElementById("tdy-ghost-range-label")?.remove();

  if (TDY_MODE === "select" && TDY_SELECT_SET.size > 0) {
    const cat = TDY_ARMED_CAT ? CONFIG.categories.find(c => c.key === TDY_ARMED_CAT) : null;
    const ghostColor = cat ? cat.color : "var(--accent)";
    const sorted = [...TDY_SELECT_SET].sort((a, b) => a - b);
    sorted.forEach(h => {
      const el = document.querySelector(`.tdy-hour-cell[data-hour="${h}"]`);
      if (!el) return;
      el.classList.add("tdy-hour-ghost", "tdy-hour-ghost-strong");
      el.style.setProperty("--tdy-ghost-color", ghostColor);
      if (cat) el.style.setProperty("--tdy-ghost-fill", ghostColor);
    });
    const label = document.createElement("div");
    label.id = "tdy-ghost-range-label";
    label.className = "tdy-ghost-range-label";
    label.textContent = `${sorted.length}h selected`;
    const anchor = document.querySelector(`.tdy-hour-cell[data-hour="${sorted[sorted.length - 1]}"]`);
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      label.style.left = Math.min(rect.right + 6, window.innerWidth - 80) + "px";
      label.style.top = rect.top + "px";
      document.body.appendChild(label);
    }
    return;
  }

  if (TDY_MODE !== "paint" || !TDY_PAINT_RANGE || TDY_PAINT_PHASE === "idle") {
    updateTodayCompletionMeter();
    return;
  }
  const unpaint = TDY_UNPAINT;
  const cat = unpaint ? null : CONFIG.categories.find(c => c.key === TDY_ARMED_CAT);
  const ghostColor = unpaint ? "var(--status-critical)" : (cat ? cat.color : "var(--accent)");
  const hours = hourRange(TDY_PAINT_RANGE[0], TDY_PAINT_RANGE[1]);
  hours.forEach(h => {
    const el = document.querySelector(`.tdy-hour-cell[data-hour="${h}"]`);
    if (!el) return;
    el.classList.add("tdy-hour-ghost", "tdy-hour-ghost-strong");
    if (unpaint) el.classList.add("tdy-hour-ghost-unpaint");
    el.style.setProperty("--tdy-ghost-color", ghostColor);
    if (unpaint) {
      el.style.setProperty("--tdy-ghost-fill", "var(--status-critical)");
    } else if (cat) {
      el.style.setProperty("--tdy-ghost-fill", cat.color);
    }
  });
  const label = document.createElement("div");
  label.id = "tdy-ghost-range-label";
  label.className = "tdy-ghost-range-label" + (unpaint ? " tdy-ghost-range-label-unpaint" : "");
  label.textContent = unpaint ? `−${hours.length}h` : `${hours.length}h`;
  if (unpaint) {
    label.style.background = "var(--status-critical)";
    label.style.color = "#fff";
  } else if (cat) {
    label.style.background = ghostColor;
    label.style.color = contrastText(ghostColor);
  }
  const anchor = document.querySelector(`.tdy-hour-cell[data-hour="${hours[hours.length - 1]}"]`);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    label.style.left = Math.min(rect.right + 6, window.innerWidth - 72) + "px";
    label.style.top = rect.top + "px";
    document.body.appendChild(label);
  }
  if (unpaint) {
    updateTodayCompletionMeter(previewPaintedCountWithRange(TDY_PAINT_RANGE[0], TDY_PAINT_RANGE[1], null, true));
  } else {
    const previewCat = TDY_ARMED_CAT || (cat ? cat.key : null);
    if (previewCat) {
      updateTodayCompletionMeter(previewPaintedCountWithRange(TDY_PAINT_RANGE[0], TDY_PAINT_RANGE[1], previewCat));
    } else {
      updateTodayCompletionMeter();
    }
  }
}

function updateSelectBar() {
  const bar = document.getElementById("pln-select-toolbar");
  const countEl = document.getElementById("tdy-select-count");
  const badgeEl = document.getElementById("pln-select-mode-badge");
  if (!bar) return;
  const n = TDY_SELECT_SET.size;
  bar.hidden = TDY_MODE !== "select" || n === 0;
  if (countEl) countEl.textContent = String(n);
  if (badgeEl) badgeEl.textContent = "Select";
  if (n > 0 && TDY_MODE === "select") {
    const sorted = [...TDY_SELECT_SET].sort((a, b) => a - b);
    const anchorHour = sorted[Math.floor(sorted.length / 2)];
    const row = document.querySelector(`.tdy-hour-row[data-hour-row="${anchorHour}"]`);
    const canvas = document.getElementById("pln-canvas");
    if (row && canvas) {
      const rowRect = row.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      bar.style.top = Math.max(8, rowRect.top - canvasRect.top - 4) + "px";
      bar.style.left = "50%";
      bar.style.transform = "translateX(-50%)";
    }
  }
  if (n === 1 && TDY_MODE === "select") {
    const h = [...TDY_SELECT_SET][0];
    const cell = getHourCell(h);
    if (cell.category) TDY_FILL_ANCHOR = [h, h];
    else TDY_FILL_ANCHOR = null;
  } else if (n > 1) {
    const sorted = [...TDY_SELECT_SET].sort((a, b) => a - b);
    let contiguous = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) { contiguous = false; break; }
    }
    TDY_FILL_ANCHOR = contiguous && getHourCell(sorted[sorted.length - 1]).category
      ? [sorted[0], sorted[sorted.length - 1]] : null;
  } else {
    TDY_FILL_ANCHOR = null;
  }
}

function lockCanvasScroll(lock) {
  const wrap = document.getElementById("tdy-canvas-wrap");
  if (wrap) wrap.classList.toggle("tdy-scroll-locked", lock);
}

function resetPaintState() {
  TDY_PAINT_PHASE = "idle";
  TDY_PAINT_ANCHOR = null;
  TDY_PAINT_RANGE = null;
  TDY_PAINT_ORIGIN = null;
  lockCanvasScroll(false);
  updatePaintGhost();
}

function updateUnpaintChip() {
  const chip = document.getElementById("tdy-unpaint-toggle");
  if (chip) chip.classList.toggle("tdy-cat-armed", TDY_UNPAINT);
}

function setUnpaintMode(on) {
  TDY_UNPAINT = !!on;
  if (TDY_UNPAINT) {
    TDY_ARMED_CAT = null;
    document.querySelectorAll(".tdy-cat-chip[data-cat]").forEach(chip => chip.classList.remove("tdy-cat-armed"));
  }
  updateUnpaintChip();
}

function armCategory(key) {
  TDY_UNPAINT = false;
  TDY_ARMED_CAT = key;
  document.querySelectorAll(".tdy-cat-chip[data-cat]").forEach(chip => {
    chip.classList.toggle("tdy-cat-armed", chip.dataset.cat === key);
  });
  updateUnpaintChip();
}

function buildCategoryPalette() {
  const cats = CONFIG.categories.map((c, i) => {
    const hotkey = i < 9 ? String(i + 1) : "";
    const color = tdyIsTravelPaint(c.key) ? tdyTravelPaintColor() : c.color;
    return `<button type="button" class="tdy-cat-chip${TDY_ARMED_CAT === c.key ? " tdy-cat-armed" : ""}" data-cat="${escapeHtml(c.key)}" style="--tdy-chip-color:${escapeHtml(color)};" title="${escapeHtml(c.label)}${hotkey ? ` (${hotkey})` : ""}">
      <span class="tdy-cat-swatch" style="background:${escapeHtml(color)};"></span>
      <span class="tdy-cat-label">${escapeHtml(c.label)}</span>${hotkey ? `<span class="tdy-cat-hotkey">${hotkey}</span>` : ""}
    </button>`;
  }).join("");
  const unpaint = `<button type="button" class="tdy-cat-chip tdy-unpaint-chip${TDY_UNPAINT ? " tdy-cat-armed" : ""}" id="tdy-unpaint-toggle" title="Unpaint — click or drag to clear hours (0)">
      <span class="tdy-cat-swatch tdy-unpaint-swatch"></span>
      <span class="tdy-cat-label">Unpaint</span><span class="tdy-cat-hotkey">0</span>
    </button>`;
  return cats + unpaint;
}

function buildHourCanvasRows() {
  return Array.from({ length: 24 }, (_, h) => {
    const cell = getHourCell(h);
    const cat = CONFIG.categories.find(c => c.key === cell.category);
    const color = cat ? cat.color : "";
    const style = color ? `background:${escapeHtml(color)};color:${contrastText(color)};` : "";
    return `<div class="tdy-hour-row" data-hour-row="${h}">
      <span class="tdy-hour-time">${String(h).padStart(2, "0")}:00</span>
      <div class="tdy-hour-cell${cell.category ? " tdy-hour-painted" : ""}" data-hour="${h}" style="${style}">
        <span class="tdy-hour-note-preview">${escapeHtml(cell.note || "")}</span>
      </div>
    </div>`;
  }).join("");
}

function buildDueTodayPanel(tasks) {
  const due = tasks.filter(t => t.due_date === CURRENT_DATE && t.status !== "done");
  if (!due.length) {
    return `<div class="card tdy-due-panel"><strong class="tdy-due-head">Due today</strong><p class="stub tdy-due-empty">Nothing due — light day.</p></div>`;
  }
  const rows = due.map(t => `
    <label class="tdy-due-row">
      <input type="checkbox" class="tdy-due-check" data-id="${t.id}" ${t.status === "done" ? "checked" : ""}>
      <span class="tdy-due-title">${escapeHtml(t.title)}</span>
      <span class="pill tsk-urgency-${escapeHtml(t.urgency)}">${escapeHtml(t.urgency)}</span>
    </label>`).join("");
  return `<div class="card tdy-due-panel"><strong class="tdy-due-head">Due today</strong><div class="tdy-due-list">${rows}</div></div>`;
}

function closeNotePopover() {
  document.getElementById("tdy-note-popover")?.remove();
  document.removeEventListener("mousedown", notePopoverOutsideClick, true);
}

function notePopoverOutsideClick(e) {
  const pop = document.getElementById("tdy-note-popover");
  if (pop && !pop.contains(e.target) && !e.target.closest(".tdy-hour-cell")) closeNotePopover();
}

function closeSplitPopover() {
  document.getElementById("tdy-split-popover")?.remove();
  document.removeEventListener("mousedown", splitPopoverOutsideClick, true);
}

function splitPopoverOutsideClick(e) {
  const pop = document.getElementById("tdy-split-popover");
  if (pop && !pop.contains(e.target) && !e.target.closest(".tdy-hour-cell")) closeSplitPopover();
}

function buildSplitCategoryOptions(selected) {
  return CONFIG.categories.map(c =>
    `<option value="${escapeHtml(c.key)}"${c.key === selected ? " selected" : ""}>${escapeHtml(c.label)}</option>`
  ).join("");
}

function updateSplitPopoverPreview() {
  const top = document.getElementById("tdy-split-preview-top");
  const bottom = document.getElementById("tdy-split-preview-bottom");
  if (!top || !bottom) return;
  const a = document.getElementById("tdy-split-a")?.value;
  const b = document.getElementById("tdy-split-b")?.value;
  const catA = CONFIG.categories.find(c => c.key === a);
  const catB = CONFIG.categories.find(c => c.key === b);
  top.style.background = catA ? catA.color : "var(--ink-muted)";
  bottom.style.background = catB ? catB.color : "var(--ink-muted)";
}

function applyHourSplit(hour, catA, catB) {
  const prev = getHourCell(hour);
  if (!catA || !catB || catA === catB) return;
  const rest = stripSplitPrefix(prev.note);
  setHourCell(hour, {
    category: catA,
    note: formatSplitNote(catA, catB, rest),
  });
  setTodayDirty();
  refreshHourCanvas();
}

function clearHourSplit(hour) {
  const prev = getHourCell(hour);
  const split = parseHourSplit(prev.note);
  if (!split) return;
  setHourCell(hour, {
    category: prev.category || split.a,
    note: split.rest || "",
  });
  setTodayDirty();
  refreshHourCanvas();
}

function positionPlannerPopover(pop, desiredLeft, desiredTop) {
  const edge = 8;
  const width = pop.offsetWidth || parseFloat(getComputedStyle(pop).minWidth) || 220;
  const height = pop.offsetHeight || 100;
  const maxLeft = Math.max(edge, window.innerWidth - width - edge);
  const maxTop = Math.max(edge, window.innerHeight - height - edge);
  pop.style.left = Math.max(edge, Math.min(desiredLeft, maxLeft)) + "px";
  pop.style.top = Math.max(edge, Math.min(desiredTop, maxTop)) + "px";
}

function showSplitPopover(hour, anchorEl) {
  const cell = getHourCell(hour);
  if (!cell.category) return;
  const existing = parseHourSplit(cell.note);
  if (existing) {
    clearHourSplit(hour);
    showToast("Hour unsplit", "info");
    return;
  }
  closeSplitPopover();
  closeNotePopover();
  const pop = document.createElement("div");
  pop.id = "tdy-split-popover";
  pop.className = "tdy-split-popover";
  const rect = anchorEl.getBoundingClientRect();
  const defaultA = cell.category;
  const defaultB = CONFIG.categories.find(c => c.key !== defaultA)?.key || defaultA;
  pop.innerHTML = `
    <span class="tdy-split-pop-label">Split this hour into two 30-minute categories (double-click again to unsplit)</span>
    <div id="tdy-split-preview" class="tdy-split-preview" aria-hidden="true">
      <div id="tdy-split-preview-top" class="tdy-split-preview-half"></div>
      <div id="tdy-split-preview-bottom" class="tdy-split-preview-half"></div>
    </div>
    <div class="tdy-split-pop-row">
      <label>1st 30m</label>
      <select id="tdy-split-a">${buildSplitCategoryOptions(defaultA)}</select>
    </div>
    <div class="tdy-split-pop-row">
      <label>2nd 30m</label>
      <select id="tdy-split-b">${buildSplitCategoryOptions(defaultB)}</select>
    </div>
    <div class="tdy-split-pop-actions">
      <button type="button" class="primary" id="tdy-split-save">Split</button>
      <button type="button" class="secondary" id="tdy-split-cancel">Cancel</button>
    </div>`;
  document.body.appendChild(pop);
  positionPlannerPopover(pop, rect.left, rect.bottom + 4);
  updateSplitPopoverPreview();
  document.getElementById("tdy-split-a")?.addEventListener("change", updateSplitPopoverPreview);
  document.getElementById("tdy-split-b")?.addEventListener("change", updateSplitPopoverPreview);
  document.getElementById("tdy-split-save").onclick = () => {
    const a = document.getElementById("tdy-split-a")?.value;
    const b = document.getElementById("tdy-split-b")?.value;
    if (!a || !b) return;
    if (a === b) {
      showToast("Pick two different categories", "warn");
      return;
    }
    applyHourSplit(hour, a, b);
    closeSplitPopover();
  };
  document.getElementById("tdy-split-cancel").onclick = closeSplitPopover;
  setTimeout(() => document.addEventListener("mousedown", splitPopoverOutsideClick, true), 0);
}

function showNotePopover(hour, anchorEl) {
  closeNotePopover();
  const cell = getHourCell(hour);
  const pop = document.createElement("div");
  pop.id = "tdy-note-popover";
  pop.className = "tdy-note-popover";
  const rect = anchorEl.getBoundingClientRect();
  const split = parseHourSplit(cell.note);
  const noteValue = split ? split.rest : (cell.note || "");
  pop.innerHTML = `
    <label class="tdy-note-pop-label">Hour note</label>
    <input type="text" id="tdy-note-pop-input" class="tdy-note-pop-input" value="${escapeHtml(noteValue).replace(/"/g, "&quot;")}" maxlength="200" placeholder="details…">
    <div class="tdy-note-pop-actions">
      <button type="button" class="primary" id="tdy-note-pop-save">Save</button>
      <button type="button" class="secondary" id="tdy-note-pop-cancel">Cancel</button>
    </div>`;
  document.body.appendChild(pop);
  positionPlannerPopover(pop, rect.left, rect.bottom + 4);
  const input = document.getElementById("tdy-note-pop-input");
  input?.focus();
  input?.select();
  document.getElementById("tdy-note-pop-save").onclick = () => {
    const trimmed = input.value.trim();
    const note = split
      ? formatSplitNote(split.a, split.b, trimmed)
      : trimmed;
    setHourCell(hour, { note });
    setTodayDirty();
    refreshHourCanvas();
    closeNotePopover();
  };
  document.getElementById("tdy-note-pop-cancel").onclick = closeNotePopover;
  input?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("tdy-note-pop-save")?.click();
    if (e.key === "Escape") closeNotePopover();
  });
  setTimeout(() => document.addEventListener("mousedown", notePopoverOutsideClick, true), 0);
}

function updateTodayNotesWordCount() {
  const ta = document.getElementById("metric-notes");
  const el = document.getElementById("tdy-notes-word-count");
  if (!ta || !el) return;
  const n = countTodayWords(ta.value);
  el.textContent = n + " word" + (n === 1 ? "" : "s");
}


function hoursInWrapRange(start, end) {
  const hours = [];
  if (start <= end) {
    for (let h = start; h <= end; h++) hours.push(h);
  } else {
    for (let h = start; h < 24; h++) hours.push(h);
    for (let h = 0; h <= end; h++) hours.push(h);
  }
  return hours;
}

function findSleepCategory() {
  return CONFIG.categories.find(c =>
    /sleep/i.test(c.key) || /sleep/i.test(c.label));
}

const DAY_TEMPLATES_KEY = "dayTemplates";

function loadDayTemplates() {
  try {
    const raw = localStorage.getItem(DAY_TEMPLATES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveDayTemplates(templates) {
  localStorage.setItem(DAY_TEMPLATES_KEY, JSON.stringify(templates.slice(0, 10)));
}

function buildHourSelectOptions(selected) {
  return Array.from({ length: 24 }, (_, h) =>
    `<option value="${h}"${h === selected ? " selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
}

function buildTemplateSelectOptions(templates) {
  if (!templates.length) {
    return `<option value="">— no templates —</option>`;
  }
  return `<option value="">Apply template…</option>` +
    templates.map((t, i) =>
      `<option value="${i}">${escapeHtml(t.name)}</option>`).join("");
}

function closeTemplateManagePopover() {
  document.getElementById("tdy-template-manage-popover")?.remove();
  document.removeEventListener("mousedown", templateManageOutsideClick, true);
}

function templateManageOutsideClick(e) {
  const pop = document.getElementById("tdy-template-manage-popover");
  if (pop && !pop.contains(e.target) && !e.target.closest("#tdy-manage-templates-btn")) {
    closeTemplateManagePopover();
  }
}

function refreshTemplateSelect() {
  const sel = document.getElementById("tdy-apply-template");
  if (!sel) return;
  const templates = loadDayTemplates();
  const prev = sel.value;
  sel.innerHTML = buildTemplateSelectOptions(templates);
  if (prev && templates[Number(prev)]) sel.value = prev;
}

async function ensureTodayDaysCache() {
  if (!TODAY_DAYS_WITH_DATA) {
    const [days, hoursHist, pulseSummary] = await Promise.all([
      api("/api/days?limit=60"),
      api("/api/trends/hours-history?limit=60").catch(() => []),
      api("/api/pulses/summary?days=60").catch(() => ({ days: [] })),
    ]);
    const set = new Set();
    const hourCounts = new Map();
    const pulseDates = new Set();
    const updatedAt = new Map();
    for (const d of days) {
      if (dayRowHasMetricData(d)) set.add(d.date);
      if (d.updated_at) updatedAt.set(d.date, d.updated_at);
    }
    for (const row of hoursHist) {
      const count = plnHourCountFromHistory(row);
      if (count > 0) set.add(row.date);
      hourCounts.set(row.date, count);
    }
    for (const row of pulseSummary.days || []) {
      if (row.date && Number(row.count) > 0) pulseDates.add(row.date);
    }
    TODAY_DAYS_WITH_DATA = set;
    TODAY_DAY_SNAPSHOT = { hourCounts, pulseDates, updatedAt };
  }
  return TODAY_DAYS_WITH_DATA;
}

function invalidateTodayDaysCache() {
  TODAY_DAYS_WITH_DATA = null;
  TODAY_DAY_SNAPSHOT = null;
}

function plnHourCountFromHistory(row) {
  if (!row?.counts) return 0;
  return Object.values(row.counts).reduce((sum, n) => sum + Number(n), 0);
}

function plnCalendarDaysApart(dayDate, savedDate) {
  const a = new Date(`${dayDate}T12:00:00`);
  const b = new Date(`${savedDate}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function plnIsLateLog(dayDate, updatedAt) {
  if (!dayDate || !updatedAt) return false;
  const savedDate = String(updatedAt).slice(0, 10);
  return plnCalendarDaysApart(dayDate, savedDate) > 1;
}

function plnFormatLateSavedHint(updatedAt) {
  if (!updatedAt) return "";
  try {
    const d = new Date(updatedAt);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return String(updatedAt).slice(0, 10);
  }
}

function plnIsDayUnfinished(date, snapshot) {
  if (!snapshot) return false;
  const realToday = getRealToday();
  if (date > realToday) return false;
  if (date === realToday && new Date().getHours() < 19) return false;
  const hourCount = snapshot.hourCounts.get(date) || 0;
  const hasPulse = snapshot.pulseDates.has(date);
  return hourCount < PLN_UNFINISHED_HOUR_THRESHOLD || !hasPulse;
}

function dayStripHasData(date, daysWithData) {
  return daysWithData.has(date);
}

function buildDayStrip(daysWithData, snapshot) {
  const lateLogs = loadLateLogs();
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(CURRENT_DATE, i - 6);
    const dayNum = String(Number(date.slice(8, 10)));
    const hasData = dayStripHasData(date, daysWithData);
    const isSelected = date === CURRENT_DATE;
    const unfinished = plnIsDayUnfinished(date, snapshot) ? " pln-mini-day-unfinished" : "";
    const latePill = lateLogs[date]
      ? `<span class="pln-late-pill" title="Logged late on ${escapeHtml(lateLogs[date])}">logged late</span>` : "";
    return `<button type="button" class="today-day-chip tdy-day-chip pln-day-chip${isSelected ? " today-day-chip-selected tdy-day-chip-selected pln-day-chip-selected" : ""}${unfinished}" data-date="${escapeHtml(date)}" title="${escapeHtml(date)}">
      <span class="tdy-day-num pln-day-num">${escapeHtml(dayNum)}</span>
      <span class="tdy-day-dot pln-day-dot${hasData ? " tdy-day-dot-filled pln-day-dot-filled" : ""}"></span>
      ${latePill}
    </button>`;
  }).join("");
}

function plannerFusedStyles() {
  return `<style>
    body[data-workspace="plan"] #nav.tab-chip-bar { display: none !important; }
    body[data-workspace="plan"] #nav.tab-chip-bar .tab-chip { width: auto; flex: 0 0 auto; }
    #hud-app-name.pln-hud-dirty::after { content:""; display:inline-block; width:7px; height:7px; border-radius:50%; background:#d4a017; margin-left:6px; vertical-align:middle; }
    .pln-mode-chips { display:flex; flex-wrap:nowrap; align-items:center; gap:4px; max-width:max-content; width:auto; margin:0 0 6px; padding:3px 5px; border-radius:10px; border:1px solid var(--gridline); background:color-mix(in srgb, var(--bg-shell) 70%, var(--bg-card)); overflow-x:auto; overflow-y:hidden; max-height:none; -webkit-overflow-scrolling:touch; }
    .pln-mode-chip { display:inline-flex; align-items:center; width:auto; flex:0 0 auto; padding:4px 10px; font-size:11px; border-radius:999px; border:1px solid var(--border); background:var(--bg-shell); color:var(--ink-muted); cursor:pointer; white-space:nowrap; font-family:var(--font-ui); max-width:100%; overflow:hidden; text-overflow:ellipsis; }
    .pln-mode-chip:hover { color:var(--ink-primary); border-color:var(--ink-muted); }
    .pln-mode-chip-active { font-weight:700; color:var(--ink-primary); border-color:color-mix(in srgb, var(--accent) 45%, var(--border)); background:color-mix(in srgb, var(--accent) 12%, var(--bg-card)); }
    .pln-shell, #pln-shell { display:grid; grid-template-columns:minmax(168px,200px) minmax(0,1fr) minmax(220px,300px); gap:10px; align-items:start; min-height:420px; width:100%; max-width:100%; min-width:0; overflow:hidden; }
    .pln-shell.pln-focus-strip, #pln-shell.pln-focus-strip { grid-template-columns:minmax(220px,260px) minmax(0,1fr) minmax(200px,260px); }
    .pln-shell.pln-focus-rail, #pln-shell.pln-focus-rail { grid-template-columns:minmax(160px,190px) minmax(0,1fr) minmax(280px,360px); }
    main.pln-canvas { margin:0; flex:none; width:100%; max-width:100%; box-shadow:none; }
    .pln-strip, .pln-canvas, .pln-rail { border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); padding:8px; min-height:360px; min-width:0; max-width:100%; overflow:hidden; }
    .pln-day-strip { display:flex; gap:2px; flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden; margin-bottom:8px; -webkit-overflow-scrolling:touch; max-width:100%; min-width:0; scroll-snap-type:x mandatory; scroll-behavior:smooth; }
    .pln-day-chip { flex:0 0 auto; width:auto; max-width:52px; min-width:0; overflow:hidden; scroll-snap-align:center; }
    .pln-strip-head { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px; min-width:0; }
    .pln-strip-head strong { font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pln-strip-nav { display:flex; gap:4px; }
    .pln-strip-nav button { font-size:11px; padding:2px 6px; }
    .pln-mini-month { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:2px; font-size:11px; margin-bottom:8px; max-width:200px; }
    .pln-mini-wd { text-align:center; color:var(--ink-muted); padding:2px 1px; font-size:10px; line-height:1.2; }
    .pln-mini-day { min-height:18px; max-width:22px; aspect-ratio:1; border:none; border-radius:5px; background:transparent; cursor:pointer; font-size:11px; color:var(--ink-secondary); position:relative; padding:1px; display:flex; align-items:center; justify-content:center; font-variant-numeric:tabular-nums; }
    @media (min-width:1024px) {
      .pln-mini-day { min-height:20px; max-width:24px; padding:2px; }
    }
    .pln-mini-day:hover { background:var(--bg-shell); }
    .pln-mini-day-today { box-shadow:inset 0 0 0 1px var(--accent); }
    .pln-mini-day-selected { background:color-mix(in srgb, var(--accent) 18%, var(--bg-shell)); color:var(--ink-primary); font-weight:600; }
    .pln-mini-day-has::after { content:""; position:absolute; bottom:2px; left:50%; transform:translateX(-50%); width:3px; height:3px; border-radius:50%; background:var(--status-good); }
    .pln-mini-day-unfinished { box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--status-warning) 40%, transparent); }
    .pln-mini-day-unfinished:not(.pln-mini-day-selected) { color:color-mix(in srgb, var(--status-warning) 70%, var(--ink-secondary)); }
    .pln-late-hint { font-size:11px; color:var(--status-warning, #c98500); margin:0 0 6px; }
    .pln-commitments { font-size:11px; margin-top:6px; border-top:1px solid var(--gridline); padding-top:6px; min-width:0; max-width:100%; overflow:hidden; }
    .pln-commitments-head { font-size:10px; color:var(--ink-muted); margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pln-commit-chip { display:block; width:100%; max-width:100%; font-size:10px; padding:2px 4px; border:0; border-radius:4px; margin-bottom:2px; background:color-mix(in srgb, var(--accent) 12%, var(--bg-shell)); color:var(--ink-primary); text-align:left; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pln-commit-empty { font-size:11px; color:var(--ink-muted); font-style:italic; margin:0; }
    .pln-past-banner { font-size:11px; color:var(--status-warning, #c98500); margin:0 0 6px; }
    .pln-late-pill { display:block; max-width:100%; font-size:8px; line-height:1.2; padding:1px 3px; border-radius:999px; background:color-mix(in srgb, var(--status-warning) 18%, var(--bg-shell)); color:var(--status-warning, #c98500); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .pln-top-pulse { margin:0 0 8px; }
    .pln-pulse-compact { display:flex; align-items:center; gap:8px; flex-wrap:nowrap; padding:6px 8px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); overflow-x:auto; }
    .pln-pulse-compact strong { font-size:12px; }
    .pln-pulse-compact .pls-dots { margin-left:2px; }
    .pln-pulse-compact .pls-h-row { display:flex; gap:3px; flex-wrap:nowrap; }
    .pln-pulse-compact .pls-compact-inputs { flex:1 1 auto; min-width:0; display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:6px; }
    .pln-pulse-compact .pls-compact-feeling-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .pln-pulse-compact .pls-h-btn { min-width:22px; max-width:28px; height:28px; font-size:11px; border:none; border-radius:6px; color:#fff; font-weight:600; cursor:pointer; opacity:0.9; }
    .pln-pulse-compact .pls-h-btn:disabled { opacity:0.35; cursor:not-allowed; }
    .pln-pulse-compact .pls-h-btn.pls-selected { outline:2px solid var(--ink-secondary); outline-offset:1px; }
    .pln-pulse-compact .pls-h-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; opacity:1; }
    .pln-pulse-compact .pls-compact-energy { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--ink-secondary); }
    .pln-pulse-compact .pls-compact-energy select { width:42px; padding:3px 4px; font-size:11px; }
    .pln-pulse-compact .pls-compact-note { flex:1 1 140px; max-width:220px; min-width:0; width:auto; box-sizing:border-box; margin:0; padding:5px 7px; font-size:11px; }
    html.device-phone .pln-pulse-compact .pls-compact-note,
    html.device-coarse .pln-pulse-compact .pls-compact-note { flex:1 1 100%; max-width:none; }
    .pln-pulse-compact .pls-submit { font-size:11px; padding:4px 10px; }
    .pln-pulse-compact .pls-counter { font-size:11px; color:var(--ink-muted); margin-left:auto; font-variant-numeric:tabular-nums; }
    .pln-pulse-compact .pls-countdown, .pls-card .pls-countdown { font-variant-numeric:tabular-nums; color:var(--status-warning, #c98500); font-weight:700; }
    .pln-pulse-compact .pls-happiness-check { font-size:10px; color:var(--accent); font-weight:700; }
    .pln-pulse-compact .pls-h-row.pls-happiness-nudge { outline:1px dashed color-mix(in srgb, var(--accent) 55%, transparent); outline-offset:2px; border-radius:8px; padding:2px; }
    .pln-eod-banner { margin:0 0 8px; padding:8px 12px; border-radius:8px; border:1px solid color-mix(in srgb, var(--status-warning) 35%, var(--border)); background:color-mix(in srgb, var(--status-warning) 10%, var(--bg-card)); font-size:12px; color:var(--ink-secondary); }
    .pln-eod-banner a { color:var(--accent); text-decoration:underline; cursor:pointer; }
    .tdy-metric-hint { display:block; font-size:9px; color:var(--ink-muted); margin-top:2px; line-height:1.2; }
    .tdy-hour-cell.tdy-hour-split { box-shadow:inset 0 0 0 1px rgba(255,255,255,0.35); }
    .tdy-split-popover { position:fixed; z-index:310; min-width:220px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); box-shadow:var(--plate-shadow-hover); font-size:12px; }
    .tdy-split-pop-label { display:block; font-size:11px; color:var(--ink-muted); margin-bottom:6px; }
    .tdy-split-preview { display:flex; flex-direction:column; height:28px; border-radius:6px; border:1px solid var(--border); margin-bottom:8px; overflow:hidden; }
    .tdy-split-preview-half { flex:1; min-height:0; }
    .tdy-split-pop-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
    .tdy-split-pop-row select { flex:1; font-size:12px; }
    .tdy-split-pop-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .pln-canvas-toolbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
    .pln-canvas { position:relative; }
    .pln-select-toolbar { position:absolute; z-index:120; display:flex; gap:6px; align-items:center; flex-wrap:nowrap; padding:6px 10px; border-radius:999px; border:1px solid color-mix(in srgb, #4a90d9 35%, var(--border)); background:color-mix(in srgb, var(--bg-card) 92%, #4a90d9 8%); font-size:11px; box-shadow:0 4px 16px rgba(0,0,0,0.18), 0 0 0 1px color-mix(in srgb, #4a90d9 12%, transparent); max-width:calc(100% - 16px); overflow-x:auto; }
    .pln-select-toolbar[hidden] { display:none !important; }
    .pln-select-mode-badge { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:2px 6px; border-radius:999px; background:color-mix(in srgb, #4a90d9 18%, var(--bg-shell)); color:#4a90d9; white-space:nowrap; }
    .pln-select-count { font-weight:700; color:#4a90d9; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .pln-select-toolbar-actions { display:flex; gap:4px; align-items:center; flex-wrap:nowrap; }
    .pln-select-toolbar button, .pln-select-toolbar select { font-size:10px; padding:3px 7px; white-space:nowrap; }
    .pln-select-apply { font-weight:600; }
    .pln-hour-row.tdy-hour-row-selected .tdy-hour-time { background:color-mix(in srgb, #4a90d9 12%, transparent); border-radius:4px; }
    .pln-hour-row, .pln-hour-row.tdy-hour-row { min-width:0; max-width:100%; }
    .pln-hour-row .tdy-hour-time, .pln-canvas .tdy-hour-time { width:38px; flex-shrink:0; padding:2px 3px; font-size:10px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pln-hour-row .tdy-hour-cell, .pln-canvas .tdy-hour-cell { min-width:0; min-height:22px; padding:2px 6px; margin:1px 3px 1px 0; overflow:hidden; }
    html:not([data-player-skin]) .pln-canvas .tdy-hour-cell { border-radius:6px; }
    html[data-player-skin]:not([data-player-skin="harbor"]) .pln-canvas .tdy-hour-cell { border-radius:var(--at-r-cell, 6px); }
    .pln-canvas .tdy-hour-row { gap:4px; }
    .pln-canvas .tdy-canvas-wrap { max-width:100%; max-height:480px; overflow-x:hidden; }
    .pln-canvas .tdy-cat-palette { gap:3px; }
    .pln-canvas .tdy-cat-chip { gap:3px; padding:2px 6px; font-size:10px; }
    .pln-canvas .tdy-cat-swatch { width:8px; height:8px; }
    .tdy-hour-cell.tdy-hour-selected { outline:2px solid #4a90d9; outline-offset:-2px; }
    .pln-fill-handle { position:absolute; right:2px; bottom:2px; width:9px; height:9px; border:1px solid #fff; background:var(--tdy-fill-color, var(--accent)); cursor:crosshair; z-index:2; box-shadow:0 0 0 1px rgba(0,0,0,0.2); }
    .tdy-hour-cell.tdy-hour-fill-ghost { outline:2px dashed var(--tdy-ghost-color, var(--accent)); outline-offset:-2px; opacity:0.45; }
    .pln-fill-label { position:fixed; z-index:400; font-size:10px; padding:2px 6px; border-radius:4px; background:var(--bg-card); border:1px solid var(--border); pointer-events:none; }
    .pln-cat-radial { position:fixed; z-index:350; display:flex; flex-wrap:wrap; gap:4px; max-width:200px; padding:6px; border-radius:10px; border:1px solid var(--border); background:var(--bg-card); box-shadow:var(--plate-shadow-hover); }
    .pln-cat-radial button { width:28px; height:28px; border-radius:50%; border:2px solid #fff; cursor:pointer; box-shadow:0 0 0 1px var(--border); }
    .pln-drop-line { position:absolute; left:48px; right:8px; height:2px; background:var(--accent); pointer-events:none; z-index:3; box-shadow:0 0 6px color-mix(in srgb, var(--accent) 50%, transparent); }
    .tdy-hour-cell.pln-drop-target { box-shadow:inset 0 0 0 2px var(--accent); }
    .tdy-hour-cell.pln-drop-confirm { animation:pln-drop-pulse 0.55s ease; }
    .tdy-hour-cell.pln-timed-event-cell { background:color-mix(in srgb, var(--accent) 18%, var(--bg-shell)); box-shadow:inset 3px 0 0 var(--accent); display:flex; flex-direction:column; align-items:stretch; }
    .tdy-hour-cell.tdy-hour-painted.pln-timed-event-cell { box-shadow:inset 3px 0 0 #fff, inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, #fff); }
    @keyframes pln-drop-pulse { 0%,100% { box-shadow:inset 0 0 0 2px var(--accent); } 50% { box-shadow:inset 0 0 0 4px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 40%, transparent); } }
    .pln-task-badge { display:inline-block; font-size:9px; line-height:1.3; padding:1px 4px; border:0; border-radius:3px; background:rgba(0,0,0,0.25); color:inherit; margin-right:2px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
    .pln-event-badge { display:inline-block; font-size:9px; line-height:1.2; padding:1px 4px; border-radius:3px; margin-right:2px; max-width:100%; min-height:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:color-mix(in srgb, var(--accent) 82%, #000); color:#fff; }
    button.pln-event-badge { border:0; cursor:pointer; min-height:0; }
    .pln-event-badge-event { background:color-mix(in srgb, var(--status-serious) 82%, #000); }
    .pln-event-lane-work { background:#163a6b; box-shadow:inset 0 0 0 1px #1e4e8c; }
    .pln-event-lane-passion { background:#8b1e2d; box-shadow:inset 0 0 0 1px #c0392b; }
    .pln-event-badge { white-space:nowrap; }
    .pln-task-badge-snap { animation:pln-badge-bounce 0.45s cubic-bezier(0.34,1.56,0.64,1); }
    @keyframes pln-badge-bounce { 0% { transform:scale(0.6); opacity:0; } 60% { transform:scale(1.08); opacity:1; } 100% { transform:scale(1); } }
    .pln-task-badge-warn { color:#fff; background:color-mix(in srgb, var(--status-warning) 80%, #000); }
    .pln-rail-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; min-width:0; }
    .pln-rail-head strong { font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pln-rail-filters { display:flex; gap:3px; flex-wrap:wrap; margin-bottom:8px; }
    .pln-rail-filter { font-size:10px; padding:2px 6px; border-radius:999px; border:1px solid var(--border); background:var(--bg-shell); cursor:pointer; color:var(--ink-muted); }
    .pln-rail-filter-active { border-color:var(--accent); color:var(--accent); }
    .pln-rail-drop-hint { font-size:11px; color:var(--accent); padding:4px 6px; border-radius:6px; background:color-mix(in srgb, var(--accent) 10%, var(--bg-shell)); margin-bottom:6px; display:none; }
    .pln-rail-drop-hint.pln-rail-drop-active { display:block; }
    .pln-rail-list { display:flex; flex-direction:column; gap:4px; max-height:560px; overflow-y:auto; }
    .pln-rail-card { padding:7px 8px; border-radius:6px; border:1px solid var(--gridline); background:var(--bg-shell); cursor:grab; font-size:11px; }
    .pln-rail-card:active { cursor:grabbing; }
    .pln-rail-card.pln-rail-card-selected { border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); background:color-mix(in srgb, var(--accent) 10%, var(--bg-shell)); }
    .pln-rail-card-main { display:flex; align-items:flex-start; gap:5px; }
    .pln-rail-card-title { flex:1; min-width:0; font-weight:550; margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; line-height:1.3; min-height:1.3em; }
    .pln-rail-plan-btn { flex-shrink:0; font-size:10px; padding:2px 6px; }
    .pln-rail-card-meta { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
    .pln-rail-card .tsk-urgency-wrap { min-width:0; }
    .pln-rail-card .tsk-urgency-chip { font-size:10px; padding:2px 6px; gap:4px; }
    .pln-rail-card .tsk-urgency-bar { width:44px; height:4px; border-radius:3px; }
    .pln-rail-card .tsk-urgency-bump-wrap { display:inline-flex; gap:2px; }
    .pln-rail-card .tsk-urgency-bump { min-width:20px; height:20px; padding:0 4px; border:1px solid var(--border); border-radius:4px; background:var(--bg-card); color:var(--ink-secondary); cursor:pointer; line-height:1; }
    .pln-rail-card .tsk-urgency-bump:active { transform:scale(0.94); }
    .pln-rail-empty { font-size:12px; color:var(--ink-muted); margin:0; text-align:center; padding:12px 8px; }
    .pln-rail-empty-state { display:flex; flex-direction:column; align-items:stretch; gap:8px; padding:10px 6px; border-radius:8px; background:color-mix(in srgb, var(--bg-shell) 80%, var(--bg-card)); border:1px dashed var(--gridline); }
    .pln-rail-empty-state p { margin:0; font-size:12px; color:var(--ink-muted); text-align:center; }
    .pln-rail-capture-row { display:flex; gap:4px; }
    .pln-rail-capture-row input { flex:1; min-width:0; font-size:12px; padding:6px 8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); }
    .pln-rail-search { width:100%; box-sizing:border-box; margin:6px 0; padding:5px 7px; font-size:11px; }
    .tdy-event-quick-form { display:grid; grid-template-columns:minmax(100px, 1.4fr) auto auto minmax(120px, 1fr) auto auto; gap:5px; margin-top:7px; text-align:left; }
    .tdy-event-quick-form[hidden] { display:none; }
    .tdy-event-quick-form input { min-width:0; font-size:11px; padding:5px 6px; }
    .tdy-event-quick-form button { font-size:10px; padding:4px 7px; }
    .tdy-commitment-empty { margin:5px 0 0; font-size:11px; color:var(--ink-muted); }
    .pln-commitments-head { display:flex; align-items:center; justify-content:space-between; gap:5px; }
    .pln-commitments-head .pln-commit-add { font-size:9px; padding:2px 5px; }
    .pln-pane-empty { text-align:center; padding:14px 10px; border-radius:8px; background:color-mix(in srgb, var(--bg-shell) 75%, var(--bg-card)); border:1px dashed var(--gridline); }
    .pln-pane-empty p { margin:0 0 8px; font-size:12px; color:var(--ink-muted); }
    .pln-pane-empty .primary { font-size:12px; }
    .pln-extras { margin-top:10px; }
    .pln-extras details { margin-bottom:8px; }
    .tdy-week-surface { margin:0 0 10px; padding:8px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); }
    .tdy-week-surface-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:7px; }
    .tdy-week-grid { display:grid; grid-template-columns:repeat(7,minmax(96px,1fr)); gap:5px; overflow-x:auto; scrollbar-width:thin; }
    .tdy-week-day { min-width:105px; min-height:92px; padding:6px; border:1px solid var(--gridline); border-radius:7px; background:var(--bg-shell); }
    .tdy-week-day-current { border-color:var(--accent); }
    .tdy-week-day-head { display:flex; align-items:center; justify-content:space-between; gap:4px; margin-bottom:5px; font-size:11px; }
    .tdy-week-add { padding:1px 5px; font-size:9px; }
    .tdy-week-chip { display:block; width:100%; border:0; border-left:2px solid var(--accent); border-radius:3px; padding:3px 4px; margin:2px 0; background:color-mix(in srgb,var(--accent) 12%,var(--bg-card)); color:var(--ink-primary); text-align:left; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
    .pln-today-header-actions button[aria-pressed="true"] { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 14%,var(--bg-card)); color:var(--ink-primary); }
    .tdy-week-paint-surface { margin:0 0 10px; padding:8px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); overflow:hidden; }
    .tdy-week-paint-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:7px; }
    .tdy-week-paint-head > div { display:flex; align-items:baseline; gap:7px; }
    .tdy-week-paint-head strong { font-size:12px; }
    .tdy-week-paint-head > div span { color:var(--ink-muted); font-size:10px; }
    .tdy-week-paint-grid { display:grid; grid-template-columns:36px repeat(7,minmax(64px,1fr)); gap:1px; max-width:100%; overflow-x:auto; padding-bottom:4px; background:var(--gridline); border:1px solid var(--gridline); border-radius:7px; scrollbar-width:thin; }
    .tdy-week-paint-corner, .tdy-week-paint-day, .tdy-week-paint-hour { display:flex; align-items:center; justify-content:center; min-height:24px; background:var(--bg-shell); color:var(--ink-muted); font-size:9px; font-variant-numeric:tabular-nums; }
    .tdy-week-paint-corner, .tdy-week-paint-hour { position:sticky; left:0; z-index:2; }
    .tdy-week-paint-corner { z-index:3; font-size:7px; letter-spacing:.06em; }
    .tdy-week-paint-day { font-weight:700; white-space:nowrap; }
    .tdy-week-paint-day-current { color:var(--accent); box-shadow:inset 0 -2px 0 var(--accent); }
    .tdy-week-paint-cell { min-width:0; min-height:24px; padding:0; border:0; background:var(--bg-card); cursor:pointer; touch-action:manipulation; }
    .tdy-week-paint-cell:hover { box-shadow:inset 0 0 0 2px var(--accent); }
    .tdy-week-paint-cell-filled { box-shadow:inset 0 0 0 1px rgba(255,255,255,.2); }
    .tdy-week-paint-cell-selected { outline:2px solid #4a90d9; outline-offset:-2px; }
    .paint-week-only { max-width:100%; min-width:0; }
    .tdy-paint-tools { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .pln-paint-week-toolbar.tdy-paint-tools { margin:0 0 10px; padding:6px 4px 8px; }
    .tdy-week-paint-slot { position:relative; min-width:0; min-height:24px; background:var(--bg-card); }
    .tdy-week-paint-slot .tdy-week-paint-cell { width:100%; height:100%; min-height:24px; }
    .tdy-week-paint-event-fill { position:absolute; left:1px; right:1px; z-index:2; box-sizing:border-box; min-height:8px; }
    .tdy-week-peek { margin:0 0 10px; padding:6px 8px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); }
    .tdy-week-peek > summary { cursor:pointer; font-size:12px; color:var(--ink-muted); }
    .tdy-today-paint-strip { display:grid; grid-template-columns:repeat(24,minmax(0,1fr)); gap:1px; min-height:14px; margin-top:6px; }
    .tdy-today-strip-cell { min-height:12px; display:block; }
    .tdy-week-chip-class { border-left-color:${CLASS_NAVY}; background:color-mix(in srgb, ${CLASS_NAVY} 22%, var(--bg-card)); color:#d6e4ff; }
    .tdy-week-chip-selected { outline:2px solid #4a90d9; }
    .tdy-week-nav { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .tdy-hour-row { position:relative; }
    .tdy-now-marker { position:absolute; left:38px; right:4px; height:2px; background:#e11d48; z-index:8; pointer-events:none; box-shadow:0 0 0 1px color-mix(in srgb, #e11d48 35%, transparent); }
    .tdy-now-marker::before { content:""; position:absolute; left:-5px; top:-4px; width:10px; height:10px; border-radius:50%; background:#e11d48; }
    .tdy-hour-div { display:inline-flex; align-items:center; gap:4px; font-size:10px; color:var(--ink-muted); margin-left:6px; }
    .tdy-hour-div select { font-size:10px; padding:2px 4px; }
    .tdy-hour-cell[data-split="15"] { background-image:linear-gradient(to bottom, transparent 24%, color-mix(in srgb, var(--ink-muted) 35%, transparent) 25%, transparent 26%, transparent 49%, color-mix(in srgb, var(--ink-muted) 45%, transparent) 50%, transparent 51%, transparent 74%, color-mix(in srgb, var(--ink-muted) 35%, transparent) 75%, transparent 76%); background-size:100% 100%; }
    .tdy-hour-cell[data-split="20"] { background-image:linear-gradient(to bottom, transparent 32%, color-mix(in srgb, var(--ink-muted) 35%, transparent) 33%, transparent 34%, transparent 65%, color-mix(in srgb, var(--ink-muted) 35%, transparent) 66%, transparent 67%); }
    .tdy-hour-cell[data-split="30"] { background-image:linear-gradient(to bottom, transparent 49%, color-mix(in srgb, var(--ink-muted) 45%, transparent) 50%, transparent 51%); }
    .pln-event-fill { display:flex; align-items:stretch; gap:2px; min-height:100%; width:100%; }
    .pln-event-badge { flex:1 1 auto; min-height:0; width:auto; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .pln-event-badge-class { background:${CLASS_NAVY} !important; color:#e8eefc; box-shadow:inset 0 0 0 1px #1d4e89; }
    .pln-event-badge-selected { outline:2px solid #f5d76e; }
    .pln-event-lane-btn, .pln-event-remove { flex:0 0 auto; min-width:18px; min-height:0; padding:0 4px; border:0; border-radius:3px; font-size:9px; cursor:pointer; background:rgba(0,0,0,.35); color:#fff; }
    .pln-event-lane-btn { background:#163a6b; }
    .pln-event-lane-btn[data-lane="passion"] { background:#8b1e2d; }
    .tdy-time-pick { display:inline-flex; align-items:center; gap:2px; }
    .tdy-time-pick .tdy-time-numeric { width:4.4em; font-variant-numeric:tabular-nums; font-size:11px; padding:4px 5px; }
    .tdy-time-pick .tdy-time-step { min-width:24px; padding:2px 6px; font-size:12px; }
    .pln-rail-card { border-left-width:4px; }
    @media (max-width:900px) {
      .pln-shell { grid-template-columns:1fr; }
      .pln-strip, .pln-rail { min-height:auto; }
    }
    @media (max-width:600px) {
      .tdy-week-grid { grid-template-columns:repeat(7,minmax(84px,1fr)); padding-bottom:5px; scroll-snap-type:x proximity; }
      .tdy-week-day { min-width:84px; scroll-snap-align:start; }
    }
    html.device-narrow .pln-canvas { order:1; }
    html.device-narrow .pln-strip { order:2; }
    html.device-narrow .pln-rail { order:3; }
    html.device-phone .pln-canvas .tdy-hour-cell,
    html.device-coarse .pln-canvas .tdy-hour-cell {
      min-height:40px;
      touch-action:none;
    }
    html.device-phone .pln-pulse-compact,
    html.device-coarse .pln-pulse-compact { flex-wrap:wrap; overflow-x:visible; }
    html.device-phone .pln-pulse-compact .pls-h-btn,
    html.device-coarse .pln-pulse-compact .pls-h-btn { min-width:36px; height:40px; }
    html.device-phone .pln-pulse-compact .pls-compact-inputs { flex:1 1 auto; min-width:140px; width:auto; }
    html.device-phone .pln-mini-day,
    html.device-coarse .pln-mini-day { min-width:36px; min-height:36px; max-width:none; }
    html.device-phone .pln-strip-nav button,
    html.device-coarse .pln-strip-nav button { min-width:40px; min-height:40px; }
    html.device-phone .pln-day-chip,
    html.device-coarse .pln-day-chip { min-height:40px; min-width:40px; }
    html.device-phone .pln-select-toolbar button,
    html.device-phone .pln-select-toolbar select,
    html.device-coarse .pln-select-toolbar button,
    html.device-coarse .pln-select-toolbar select { min-height:36px; }
    html.device-phone .pln-cat-radial button,
    html.device-coarse .pln-cat-radial button { width:40px; height:40px; }
    html.device-phone .pln-fill-handle,
    html.device-coarse .pln-fill-handle { width:24px; height:24px; touch-action:none; }
    html.device-phone .pln-pulse-compact :is(input,select,textarea,button),
    html.device-phone .tdy-metrics-card :is(input,select,textarea,button),
    html.device-phone .pln-rail :is(input,select,textarea,button),
    html.device-phone .tdy-event-quick-form :is(input,select,textarea,button) {
      min-height:40px;
      font-size:16px;
    }
    html.device-phone .tdy-week-paint-cell { min-height:40px; }
    html.device-phone .tdy-week-grid {
      grid-template-columns:repeat(7,minmax(76px,1fr));
      overscroll-behavior-x:contain;
      -webkit-overflow-scrolling:touch;
    }
    html.device-phone .tdy-week-day { min-width:76px; }
    /* Computer: keep dense hour grid + mouse paint; don't inherit phone min-heights. */
    html.device-desktop .pln-canvas .tdy-hour-cell { min-height:22px; touch-action:auto; }
    html.device-desktop .pln-pulse-compact .pls-h-btn { min-width:22px; height:28px; }
    html.device-desktop .pln-fill-handle { width:12px; height:12px; }
    html.device-desktop .pln-cat-radial button { width:28px; height:28px; }
    /* Wide viewports stay dense even on coarse/touch laptops. */
    @media (min-width:721px) {
      .pln-canvas .tdy-hour-cell { min-height:22px; touch-action:auto; }
      .pln-canvas .tdy-cat-chip { min-height:0; padding:2px 6px; font-size:10px; }
      .pln-canvas :is(.pln-event-badge, .pln-task-badge, .pln-event-lane-btn, .pln-event-remove) { min-height:0; }
    }
    @media (max-width:720px) {
      .pln-canvas { order:1; }
      .pln-strip { order:2; }
      .pln-rail { order:3; }
    }
    @media (max-width:600px), (pointer:coarse), (hover:none) {
      .pln-canvas .tdy-hour-cell { min-height:40px; touch-action:none; }
      .pln-pulse-compact .pls-h-btn { min-width:36px; height:40px; }
      .pln-mini-day { min-width:36px; min-height:36px; max-width:none; }
      .pln-strip-nav button, .pln-day-chip { min-width:40px; min-height:40px; }
      .pln-select-toolbar button, .pln-select-toolbar select { min-height:36px; }
      .pln-cat-radial button { width:40px; height:40px; }
      .pln-fill-handle { width:24px; height:24px; touch-action:none; }
    }
    @media (max-width:600px) {
      .pln-pulse-compact .pls-compact-inputs { flex:1 1 auto; width:100%; }
      .tdy-week-grid {
        grid-template-columns:repeat(7,minmax(76px,1fr));
        overscroll-behavior-x:contain;
        -webkit-overflow-scrolling:touch;
      }
      .tdy-week-day { min-width:76px; }
    }
  </style>`;
}

function buildPlannerMiniMonth(ym, daysWithData, calEvents, snapshot) {
  const first = new Date(ym + "-01T00:00:00");
  const startPad = first.getDay();
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const today = getRealToday();
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const wdHtml = weekdays.map(w => `<div class="pln-mini-wd">${w}</div>`).join("");
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="pln-mini-wd"></div>');
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    const hasData = daysWithData.has(date);
    const hasCal = calEvents.some(e => e.date === date)
      || PLN_PLAN_EVENTS.some(e => {
        const end = e.end_date || e.date;
        return e.date && date >= e.date && date <= end;
      });
    const isToday = date === today;
    const isSel = date === CURRENT_DATE;
    const unfinished = plnIsDayUnfinished(date, snapshot) ? " pln-mini-day-unfinished" : "";
    cells.push(`<button type="button" class="pln-mini-day${isToday ? " pln-mini-day-today" : ""}${isSel ? " pln-mini-day-selected" : ""}${hasData || hasCal ? " pln-mini-day-has" : ""}${unfinished}" data-date="${escapeHtml(date)}">${d}</button>`);
  }
  return `<div class="pln-mini-month">${wdHtml}${cells.join("")}</div>`;
}

function tdySelectionEventTimes(hours = [...TDY_SELECT_SET]) {
  const selected = hours.map(Number).filter(h => Number.isInteger(h) && h >= 0 && h < 24).sort((a, b) => a - b);
  if (!selected.length) return { start: "", end: "" };
  const start = selected[0];
  const end = Math.min(24, selected[selected.length - 1] + 1);
  return {
    start: `${String(start).padStart(2, "0")}:00`,
    end: end === 24 ? "23:59" : `${String(end).padStart(2, "0")}:00`,
  };
}

function buildPlannerCommitments(date, calEvents, planEvents = PLN_PLAN_EVENTS) {
  const dayEvents = sortPlannerDayEvents([
    ...calEvents.filter(e => e.date === date).map(e => ({ ...e, _kind: "calendar" })),
    ...planEvents.filter(e => {
      const end = e.end_date || e.date;
      return e.date && date >= e.date && date <= end;
    }).map(e => ({ ...e, _kind: "event" })),
  ]);
  const chips = dayEvents.map(e =>
    `<button type="button" class="pln-commit-chip" data-kind="${e._kind}" data-id="${e.id}" title="Edit ${escapeHtml(e.title || "")}">${escapeHtml(calTruncateLocal(`${e.start_time ? e.start_time.slice(0, 5) + " " : ""}${e.title || ""}`, 22))}</button>`
  ).join("");
  const times = tdySelectionEventTimes();
  return `<div class="pln-commitments${dayEvents.length ? "" : " pln-pane-empty"}">
    <div class="pln-commitments-head">
      <span>Commitments</span>
      <button type="button" class="secondary pln-commit-add" data-date="${escapeHtml(date)}">+ Event</button>
    </div>
    <div class="tdy-commitment-chips">${chips || '<p class="tdy-commitment-empty">No commitments for this day.</p>'}</div>
    <form class="tdy-event-quick-form" id="tdy-event-quick-form" data-date="${escapeHtml(date)}" hidden>
      <input type="text" id="tdy-event-title" placeholder="Title" maxlength="200" required>
      ${tdyTimePickHtml("tdy-event-start", times.start, "Start")}
      ${tdyTimePickHtml("tdy-event-end", times.end, "End")}
      <input type="url" id="tdy-event-url" placeholder="Zoom / meeting link">
      <select id="tdy-event-kind" title="Class stays off the event calendar">
        <option value="event">Event</option>
        <option value="class">Class</option>
      </select>
      <select id="tdy-event-lane" title="Work vs passion">
        <option value="work">Work</option>
        <option value="passion">Passion</option>
      </select>
      <button type="submit" class="primary">Create</button>
      <button type="button" class="secondary tdy-event-quick-cancel">Cancel</button>
    </form>
  </div>`;
}

function sortPlannerDayEvents(events) {
  return [...events].sort((a, b) => {
    const aTime = a.start_time ? String(a.start_time).slice(0, 5) : "99:99";
    const bTime = b.start_time ? String(b.start_time).slice(0, 5) : "99:99";
    return aTime.localeCompare(bTime)
      || String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  });
}

function plnWeekStartFor(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return localYmd(d);
}

function buildTodayWeekSurface(date, calEvents, planEvents) {
  const start = plnWeekStartFor(date);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(start, index);
    const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    const events = sortPlannerDayEvents([
      ...calEvents.filter(event => event.date === day).map(event => ({ ...event, _kind: "calendar" })),
      ...planEvents.filter(event => event.date && day >= event.date && day <= (event.end_date || event.date))
        .map(event => ({ ...event, _kind: "event" })),
    ]);
    const chips = events.map(event => {
      const selected = TDY_EVENT_SELECT.has(tdyEventKey(event._kind, event.id));
      const klass = tdyIsClassEvent(event) ? " tdy-week-chip-class" : "";
      const lane = tdyEventLane(event);
      return `<button type="button" class="tdy-week-chip${klass}${selected ? " tdy-week-chip-selected" : ""}" data-kind="${event._kind}" data-id="${event.id}" data-lane="${lane}" title="Edit ${escapeHtml(event.title || "")}">${escapeHtml(`${event.start_time ? String(event.start_time).slice(0, 5) + " " : ""}${event.title || "Untitled event"}`)}</button>`;
    }).join("");
    return `<section class="tdy-week-day${day === date ? " tdy-week-day-current" : ""}">
      <div class="tdy-week-day-head"><button type="button" class="secondary tdy-week-goto" data-date="${day}">${escapeHtml(label)}</button><button type="button" class="secondary tdy-week-add" data-date="${day}">+ Event</button></div>
      ${chips || '<span class="stub">No events</span>'}
    </section>`;
  }).join("");
  return `<section class="tdy-week-surface" id="tdy-week-surface">
    <div class="tdy-week-surface-head">
      <strong>Week of ${escapeHtml(start)}</strong>
      <div class="tdy-week-nav">
        <button type="button" class="secondary" id="tdy-week-surface-prev" data-week-dir="-1">← Prev week</button>
        <button type="button" class="secondary" id="tdy-week-surface-next" data-week-dir="1">Next week →</button>
        <span class="stub">Click to edit · shift-click to multi-select with paint</span>
      </div>
    </div>
    <div class="tdy-week-grid">${days}</div>
  </section>`;
}

function normalizeWeekPaintHours(rawHours) {
  const hours = {};
  Object.entries(rawHours || {}).forEach(([rawHour, rawCell]) => {
    const hour = Number(rawHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !rawCell) return;
    const cell = {
      category: String(rawCell.category || ""),
      note: String(rawCell.note || ""),
    };
    if (cell.category || cell.note) hours[hour] = cell;
  });
  return hours;
}

async function loadWeekPaintHours(date) {
  const start = plnWeekStartFor(date);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const rows = await Promise.all(dates.map(day => api(`/api/day/${day}`)));
  const next = {};
  dates.forEach((day, index) => {
    next[day] = WEEK_PAINT_DIRTY.has(day)
      ? (WEEK_PAINT_HOURS[day] || {})
      : normalizeWeekPaintHours(rows[index]?.hours || {});
  });
  WEEK_PAINT_HOURS = next;
  return dates;
}

function plnIsoWeekNumber(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function plnDateForIsoWeek(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() - dow + 1);
  return simple.toISOString().slice(0, 10);
}

function tdyEventRestOfHourStyle(event, date, hour) {
  const hourStart = hour * 60;
  const startDate = event.date;
  const start = date === startDate ? plnTimeToMinutes(event.start_time, hourStart) : hourStart;
  const startClamped = Math.max(hourStart, Math.min(hourStart + 59, start));
  const top = ((startClamped - hourStart) / 60) * 100;
  const height = Math.max(8, 100 - top);
  return `position:absolute;left:0;right:0;top:${top}%;height:${height}%;`;
}

function tdyWeekPaintEventChips(day, hour) {
  return plnTimedEventsForHour(day, hour).map(event => {
    const selected = TDY_EVENT_SELECT.has(tdyEventKey(event._kind, event.id));
    const klass = tdyIsClassEvent(event) ? " tdy-week-chip-class" : "";
    const lane = tdyEventLane(event);
    const fill = tdyEventRestOfHourStyle(event, day, hour);
    const label = `${event.start_time ? String(event.start_time).slice(0, 5) + " " : ""}${event.title || "Untitled event"}`;
    return `<button type="button" class="tdy-week-chip tdy-week-paint-event-fill${klass}${selected ? " tdy-week-chip-selected" : ""}" data-kind="${event._kind}" data-id="${event.id}" data-lane="${lane}" style="${fill}" title="Edit ${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  }).join("");
}

function tdyEventQuickFormHtml(date) {
  const times = tdySelectionEventTimes();
  return `<form class="tdy-event-quick-form" id="tdy-event-quick-form" data-date="${escapeHtml(date)}" hidden>
    <input type="text" id="tdy-event-title" placeholder="Title" maxlength="200" required>
    ${tdyTimePickHtml("tdy-event-start", times.start, "Start")}
    ${tdyTimePickHtml("tdy-event-end", times.end, "End")}
    <input type="url" id="tdy-event-url" placeholder="Zoom / meeting link">
    <select id="tdy-event-kind" title="Class stays off the event calendar">
      <option value="event">Event</option>
      <option value="class">Class</option>
    </select>
    <select id="tdy-event-lane" title="Work vs passion">
      <option value="work">Work</option>
      <option value="passion">Passion</option>
    </select>
    <button type="submit" class="primary">Create</button>
    <button type="button" class="secondary tdy-event-quick-cancel">Cancel</button>
  </form>`;
}

function buildPaintWeekToolbar(date) {
  const start = plnWeekStartFor(date);
  const year = Number(String(date).slice(0, 4));
  const currentWeek = plnIsoWeekNumber(date);
  const options = Array.from({ length: 52 }, (_, i) => {
    const w = i + 1;
    const weekStart = plnDateForIsoWeek(year, w);
    return `<option value="${escapeHtml(weekStart)}" ${w === currentWeek ? "selected" : ""}>W${String(w).padStart(2, "0")} · ${escapeHtml(weekStart)}</option>`;
  }).join("");
  return `<div class="pln-paint-week-toolbar paint-week-only tdy-paint-tools" id="pln-paint-week-toolbar">
    <button type="button" class="secondary tdy-select-toggle${TDY_MODE === "select" ? " tdy-mode-active" : ""}" id="tdy-select-toggle" title="Multi-select paint cells and events">Select</button>
    <div class="tdy-cat-palette tdy-paint-tools" id="tdy-cat-palette">${buildCategoryPalette()}</div>
    <button type="button" class="secondary" id="pln-paint-week-prev" title="Previous week">←</button>
    <button type="button" class="secondary" id="pln-paint-week-next" title="Next week">→</button>
    <label class="pln-paint-week-picker">Week
      <select id="pln-paint-week-select" aria-label="52-week calendar">${options}</select>
    </label>
    <span class="stub">Week of ${escapeHtml(start)}</span>
    <span class="stub">Shift-click cells and events to multi-select both</span>
  </div>`;
}

function buildTodayWeekPeek(date) {
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const cell = getHourCell(hour);
    const style = hourCellPaintStyle(cell);
    return `<span class="tdy-today-strip-cell${cell.category ? " tdy-week-paint-cell-filled" : ""}" data-hour="${hour}" style="${style}" title="${escapeHtml(`${String(hour).padStart(2, "0")}:00`)}"></span>`;
  }).join("");
  return `<details class="tdy-week-peek tdy-today-only-strip" id="tdy-week-peek">
    <summary>Today strip</summary>
    <div class="tdy-today-paint-strip" aria-hidden="true">${hours}</div>
  </details>`;
}

function buildTodayWeekPaint(date) {
  const start = plnWeekStartFor(date);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const dayHeaders = dates.map(day => {
    const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    return `<div class="tdy-week-paint-day${day === date ? " tdy-week-paint-day-current" : ""}">${escapeHtml(label)}</div>`;
  }).join("");
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const cells = dates.map(day => {
      const cell = WEEK_PAINT_HOURS[day]?.[hour] || WEEK_PAINT_HOURS[day]?.[String(hour)] || { category: "", note: "" };
      const cat = CONFIG.categories.find(item => item.key === cell.category);
      const label = cat?.label || "Empty";
      const style = hourCellPaintStyle(cell);
      const selected = TDY_WEEK_SELECT.has(`${day}|${hour}`);
      const events = tdyWeekPaintEventChips(day, hour);
      return `<div class="tdy-week-paint-slot">
        <button type="button" class="tdy-week-paint-cell${cell.category ? " tdy-week-paint-cell-filled" : ""}${selected ? " tdy-week-paint-cell-selected" : ""}" data-week-date="${escapeHtml(day)}" data-week-hour="${hour}" style="${style}" aria-label="${escapeHtml(`${day} ${String(hour).padStart(2, "0")}:00 · ${label}`)}" title="${escapeHtml(cell.note || label)}"></button>
        ${events}
      </div>`;
    }).join("");
    return `<div class="tdy-week-paint-hour">${String(hour).padStart(2, "0")}</div>${cells}`;
  }).join("");
  return `<section class="tdy-week-paint-surface paint-week-only" id="tdy-week-paint-sheet">
    ${buildPaintWeekToolbar(date)}
    <div class="tdy-week-paint-grid tdy-week-paint-grid-24" role="grid" aria-label="Paint hours for the current week">
      <div class="tdy-week-paint-corner" aria-hidden="true">HR</div>${dayHeaders}${rows}
    </div>
    ${tdyEventQuickFormHtml(date)}
  </section>`;
}

function refreshWeekPaintCell(date, hour) {
  const cellEl = document.querySelector(`.tdy-week-paint-cell[data-week-date="${date}"][data-week-hour="${hour}"]`);
  if (!cellEl) return;
  const cell = WEEK_PAINT_HOURS[date]?.[hour] || { category: "", note: "" };
  const cat = CONFIG.categories.find(item => item.key === cell.category);
  cellEl.classList.toggle("tdy-week-paint-cell-filled", !!cell.category);
  cellEl.style.cssText = hourCellPaintStyle(cell);
  cellEl.setAttribute("aria-label", `${date} ${String(hour).padStart(2, "0")}:00 · ${cat?.label || "Empty"}`);
  cellEl.title = cell.note || cat?.label || "Empty";
}

function applyWeekPaintCell(date, hour, category) {
  const current = WEEK_PAINT_HOURS[date] || {};
  const previous = current[hour] || current[String(hour)] || { category: "", note: "" };
  const next = { category: category || "", note: previous.note || "" };
  current[hour] = next;
  WEEK_PAINT_HOURS[date] = current;
  if (date === CURRENT_DATE) {
    TODAY_HOURS = current;
    setTodayDirty();
  }
  WEEK_PAINT_DIRTY.add(date);
  scheduleWeekPaintSave();
  refreshWeekPaintCell(date, hour);
}

function wireWeekPaintSurface() {
  const sheet = document.getElementById("tdy-week-paint-sheet");
  if (!sheet) return;
  sheet.addEventListener("click", event => {
    if (event.target.closest(".tdy-week-chip, .tdy-event-quick-form")) return;
    const cell = event.target.closest(".tdy-week-paint-cell");
    if (!cell) return;
    const date = cell.dataset.weekDate;
    const hour = Number(cell.dataset.weekHour);
    const key = `${date}|${hour}`;
    if (event.shiftKey || TDY_MODE === "select") {
      if (TDY_WEEK_SELECT.has(key)) TDY_WEEK_SELECT.delete(key);
      else TDY_WEEK_SELECT.add(key);
      TDY_SELECT_SET.add(hour);
      cell.classList.toggle("tdy-week-paint-cell-selected", TDY_WEEK_SELECT.has(key));
      updateSelectBar();
      return;
    }
    if (TDY_UNPAINT) {
      applyWeekPaintCell(date, hour, "");
      return;
    }
    if (TDY_ARMED_CAT) {
      applyWeekPaintCell(date, hour, TDY_ARMED_CAT);
      return;
    }
    const rect = cell.getBoundingClientRect();
    showCategoryRadial(
      event.clientX || rect.left + rect.width / 2,
      event.clientY || rect.top + rect.height / 2,
      category => {
        armCategory(category);
        applyWeekPaintCell(date, hour, category);
      },
    );
  });
  sheet.addEventListener("contextmenu", event => {
    event.preventDefault();
    tdyStopPaint();
  });
}

function waypointConvertSelection(text = "", options = {}) {
  const form = document.getElementById("tdy-event-quick-form");
  if (!form) return false;
  const times = tdySelectionEventTimes(options.hours || [...TDY_SELECT_SET]);
  form.hidden = false;
  const title = document.getElementById("tdy-event-title");
  const start = document.getElementById("tdy-event-start");
  const end = document.getElementById("tdy-event-end");
  if (title) {
    title.value = String(options.title || text || "").trim();
    title.focus();
  }
  if (start && (options.start_time || times.start)) start.value = options.start_time || times.start;
  if (end && (options.end_time || times.end)) end.value = options.end_time || times.end;
  return true;
}

window.waypointConvertSelection = waypointConvertSelection;

function calTruncateLocal(text, max) {
  const t = text || "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function buildPlannerStrip(daysWithData, calEvents, snapshot) {
  const ym = plnGetViewYm();
  const monthLabel = new Date(ym + "-01T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return `
    <aside class="pln-strip" id="pln-strip">
      <div class="pln-strip-head">
        <strong id="pln-strip-month-label">${escapeHtml(monthLabel)}</strong>
        <div class="pln-strip-nav">
          <button type="button" class="secondary pln-strip-nav-btn" data-dir="-1" title="Previous month">←</button>
          <button type="button" class="secondary pln-strip-nav-btn" data-dir="1" title="Next month">→</button>
        </div>
      </div>
      <div id="pln-mini-month-wrap">${buildPlannerMiniMonth(ym, daysWithData, calEvents, snapshot)}</div>
      <div class="pln-day-strip" id="pln-day-strip">${buildDayStrip(daysWithData, snapshot)}</div>
      <div id="pln-commitments-wrap">${buildPlannerCommitments(CURRENT_DATE, calEvents)}</div>
      <div id="pln-strip-extras"></div>
    </aside>`;
}

function scrollStripToSelected() {
  const strip = document.getElementById("pln-day-strip");
  const chip = strip?.querySelector(`.pln-day-chip-selected, .tdy-day-chip-selected`);
  if (strip && chip) {
    const left = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
}

function refreshPlannerStripPartial() {
  const ym = plnGetViewYm();
  const monthLabel = new Date(ym + "-01T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const labelEl = document.getElementById("pln-strip-month-label");
  if (labelEl) labelEl.textContent = monthLabel;
  const miniWrap = document.getElementById("pln-mini-month-wrap");
  if (miniWrap && TODAY_DAYS_WITH_DATA) {
    miniWrap.innerHTML = buildPlannerMiniMonth(ym, TODAY_DAYS_WITH_DATA, PLN_CAL_EVENTS, TODAY_DAY_SNAPSHOT);
  }
  const stripEl = document.getElementById("pln-day-strip");
  if (stripEl && TODAY_DAYS_WITH_DATA) stripEl.innerHTML = buildDayStrip(TODAY_DAYS_WITH_DATA, TODAY_DAY_SNAPSHOT);
  const commitWrap = document.getElementById("pln-commitments-wrap");
  if (commitWrap) commitWrap.innerHTML = buildPlannerCommitments(CURRENT_DATE, PLN_CAL_EVENTS);
  wirePlannerStripNav();
  scrollStripToSelected();
}

function plnTimeToMinutes(value, fallback) {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return fallback;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function plnTimedEventAtHour(event, date, hour, kind) {
  if (!event || !event.start_time || (kind === "event" && Number(event.all_day))) return false;
  const startDate = event.date;
  const endDate = event.end_date || startDate;
  if (!startDate || date < startDate || date > endDate) return false;
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  const start = date === startDate ? plnTimeToMinutes(event.start_time, 0) : 0;
  let end = date === endDate ? plnTimeToMinutes(event.end_time, start + 60) : 24 * 60;
  if (startDate === endDate && end <= start) end = start + 60;
  return start < hourEnd && end > hourStart;
}

function plnTimedEventsForHour(date, hour) {
  return [
    ...PLN_CAL_EVENTS.filter(e => plnTimedEventAtHour(e, date, hour, "calendar"))
      .map(e => ({ ...e, _kind: "calendar" })),
    ...PLN_PLAN_EVENTS.filter(e => plnTimedEventAtHour(e, date, hour, "event"))
      .map(e => ({ ...e, _kind: "event" })),
  ];
}

function buildHourCanvasRowsWithBadges() {
  return Array.from({ length: 24 }, (_, h) => {
    const cell = getHourCell(h);
    const split = parseHourSplit(cell.note);
    const style = hourCellPaintStyle(cell);
    const splitClass = split ? " tdy-hour-split" : "";
    const splitTitle = hourCellSplitTitle(cell);
    const scheduled = plnGetScheduled(CURRENT_DATE, h);
    const badges = scheduled.map(s => {
      const est = s.estimateMin || 60;
      const warn = est > 60;
      return `<button type="button" class="pln-task-badge pln-task-scheduled${warn ? " pln-task-badge-warn" : ""}" data-task-id="${s.taskId}" title="${escapeHtml(s.title)} · click to unschedule">${warn ? `needs ${est}m — ` : ""}${escapeHtml(s.title)}</button>`;
    }).join("");
    const timedEvents = plnTimedEventsForHour(CURRENT_DATE, h);
    const eventBadges = timedEvents.map(e => {
      const isClass = tdyIsClassEvent(e);
      const lane = tdyEventLane(e);
      const zoom = e.url ? ` · ${e.url}` : "";
      const selected = TDY_EVENT_SELECT.has(tdyEventKey(e._kind, e.id));
      const className = [
        "pln-event-badge",
        `pln-event-badge-${e._kind}`,
        isClass ? "pln-event-badge-class" : `pln-event-lane-${lane}`,
        selected ? "pln-event-badge-selected" : "",
      ].filter(Boolean).join(" ");
      const fillStyle = tdyEventRestOfHourStyle(e, CURRENT_DATE, h);
      return `<span class="pln-event-fill" data-kind="${e._kind}" data-id="${e.id}" style="${fillStyle}">
        <button type="button" class="${className}" data-kind="${e._kind}" data-id="${e.id}" data-lane="${lane}" title="Edit ${escapeHtml(`${e.start_time || ""}${e.end_time ? `–${e.end_time}` : ""} ${e.title || ""}`.trim())}${escapeHtml(zoom)}">${escapeHtml(e.title || "Event")}${e.url ? " ↗" : ""}</button>
        <button type="button" class="pln-event-lane-btn" data-kind="${e._kind}" data-id="${e.id}" data-lane="${lane}" title="One-click recategorize work vs passion">${lane === "work" ? "W" : "P"}</button>
        <button type="button" class="pln-event-remove" data-kind="${e._kind}" data-id="${e.id}" title="Remove from today" aria-label="Remove event">×</button>
      </span>`;
    }).join("");
    const notePreview = stripSplitPrefix(cell.note);
    const color = CONFIG.categories.find(c => c.key === cell.category)?.color || "";
    const fillHandle = TDY_FILL_ANCHOR && TDY_FILL_ANCHOR[1] === h && cell.category && !split
      ? `<span class="pln-fill-handle" data-hour="${h}" style="--tdy-fill-color:${escapeHtml(color || "var(--accent)")};"></span>` : "";
    return `<div class="pln-hour-row tdy-hour-row${TDY_SELECT_SET.has(h) ? " tdy-hour-row-selected" : ""}" data-hour-row="${h}">
      <span class="tdy-hour-time">${String(h).padStart(2, "0")}:00</span>
      <div class="tdy-hour-cell${cell.category ? " tdy-hour-painted" : ""}${splitClass}${TDY_SELECT_SET.has(h) ? " tdy-hour-selected" : ""}${timedEvents.length ? " pln-timed-event-cell" : ""}" data-hour="${h}" style="${style}" title="${escapeHtml(splitTitle)}">
        ${eventBadges}${badges}<span class="tdy-hour-note-preview">${escapeHtml(notePreview)}</span>${fillHandle}
      </div>
    </div>`;
  }).join("");
}

function buildPlannerSelectToolbar(selectCatOpts) {
  const n = TDY_SELECT_SET.size;
  return `<div class="pln-select-toolbar" id="pln-select-toolbar"${TDY_MODE !== "select" || n === 0 ? " hidden" : ""}>
    <span class="pln-select-mode-badge" id="pln-select-mode-badge">Select</span>
    <span class="pln-select-count" id="tdy-select-count">${n}</span>
    <div class="pln-select-toolbar-actions">
      <select class="tdy-select-paint secondary" id="tdy-select-paint" title="Paint category"><option value="">Paint…</option>${selectCatOpts}</select>
      <button type="button" class="secondary" id="pln-select-assign" title="Assign task">Assign</button>
      <button type="button" class="secondary" id="tdy-select-copy" title="Copy">Copy</button>
      <button type="button" class="secondary" id="tdy-select-paste" title="Paste">Paste</button>
      <button type="button" class="secondary" id="pln-select-delete" title="Delete">Del</button>
      <button type="button" class="secondary" id="tdy-select-clear" title="Clear selected hours and overlapping events">Clear</button>
      <button type="button" class="secondary" id="tdy-select-edit-events" title="Edit events in the selected hours">Edit events</button>
      <button type="button" class="secondary" id="tdy-select-move-events" title="Move selected events to the first selected hour">Move events</button>
      <button type="button" class="primary pln-select-apply" id="pln-select-save">Apply</button>
      <button type="button" class="secondary" id="pln-select-done" title="Done">✕</button>
    </div>
  </div>`;
}

function buildPlannerCanvas(isPastDay, paintedCount, selectCatOpts, completionPct, completionColor, lateHintHtml) {
  const pastBanner = isPastDay
    ? `<p class="pln-past-banner">Editing historical day ${escapeHtml(CURRENT_DATE)}</p>` : "";
  return `
    <main class="pln-canvas" id="pln-canvas">
      ${lateHintHtml || ""}
      ${pastBanner}
      <div class="pln-canvas-toolbar tdy-canvas-toolbar">
        <button type="button" class="secondary tdy-select-toggle${TDY_MODE === "select" ? " tdy-mode-active" : ""}" id="tdy-select-toggle">Select</button>
        <div class="tdy-cat-palette" id="tdy-cat-palette">${buildCategoryPalette()}${tdyHourDivisionControlHtml()}</div>
      </div>
      <div class="tdy-hour-empty pln-pane-empty" id="tdy-hour-empty"${plannerCanvasHasContent() ? " hidden" : ""}>
        <p>No hours painted yet.</p>
        <button type="button" class="primary" id="tdy-start-paint-btn">Paint your day</button>
      </div>
      <div class="tdy-canvas-wrap" id="tdy-canvas-wrap">${buildHourCanvasRowsWithBadges()}</div>
      ${buildPlannerSelectToolbar(selectCatOpts)}
      <div class="tdy-save-row" style="margin-top:8px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <div class="tdy-completion-wrap" style="flex:1; min-width:140px;">
          <div class="tdy-completion-track"><div id="tdy-completion-bar" class="tdy-completion-bar" style="width:${completionPct}%; background:${completionColor};"></div></div>
          <div id="tdy-completion-label" class="tdy-completion-label">${completionPct}% scheduled</div>
        </div>
        <button type="button" class="primary" id="save-day">${CURRENT_DATE < getRealToday() ? `Save ${CURRENT_DATE}` : "Save day"}</button>
      </div>
      <div id="summary-box"></div>
    </main>`;
}

function plnFilterTasks(tasks, todayStr) {
  const query = String(PLN_RAIL_SEARCH || "").trim().toLowerCase();
  if (query) {
    return tasks.filter(t => String(t.title || "").toLowerCase().includes(query));
  }
  const f = PLN_RAIL_FILTER;
  const searched = tasks;
  if (f === "all") return searched.filter(t => t.status !== "done");
  if (f === "due_today") return searched.filter(t => t.due_date === CURRENT_DATE && t.status !== "done");
  if (f === "scheduled") {
    const scheduledIds = new Set();
    Object.values(PLN_SCHEDULED[CURRENT_DATE] || {}).flat().forEach(s => scheduledIds.add(s.taskId));
    return searched.filter(t => scheduledIds.has(t.id));
  }
  if (f === "overdue") return searched.filter(t => t.due_date && t.due_date < todayStr && t.status !== "done");
  if (f === "project") return searched.filter(t => t.project_id && t.status !== "done");
  if (f === "context") return searched.filter(t => t.category && t.status !== "done");
  if (f === "energy") return searched.filter(t => t.status !== "done");
  if (f === "estimated") return searched.filter(t => t.progress_total != null && t.status !== "done");
  if (f === "completed") return searched.filter(t => t.status === "done");
  if (f === "school" || f === "work" || f === "life") {
    return searched.filter(t => t.status !== "done" && plnTaskBucket(t) === f);
  }
  return searched;
}

function plnTaskBucket(task) {
  const explicit = String(task?.bucket || "").toLowerCase();
  if (explicit === "school" || explicit === "work" || explicit === "life") return explicit;
  const blob = `${task?.title || ""} ${task?.tags || ""} ${task?.category || ""}`;
  if (/\b(aleks|homework|\bhw\b|assignment|problem set|school|exam|quiz|lecture)\b/i.test(blob)) return "school";
  if (/\b(class|lab|meeting|shift|office|work)\b/i.test(blob)) return "work";
  return "life";
}

function plnHomeworkDeferred(task, todayStr) {
  if (plnTaskBucket(task) !== "school") return false;
  if (!task?.due_date) return true;
  const days = Math.round((Date.parse(`${task.due_date}T12:00:00`) - Date.parse(`${todayStr}T12:00:00`)) / 86400000);
  return days > 2;
}

function buildPlannerRailCards(tasks, todayStr) {
  const filtered = plnFilterTasks(tasks, todayStr);
  const sorted = [...filtered].sort((a, b) => {
    if (typeof computeTaskUrgency === "function") {
      return computeTaskUrgency(b, todayStr).score - computeTaskUrgency(a, todayStr).score;
    }
    return 0;
  });
  return sorted.length ? sorted.map(t => {
    const urg = typeof urgencyChipHtml === "function" ? urgencyChipHtml(t, todayStr) : "";
    const importanceBump = typeof taskImportanceBumpHtml === "function" ? taskImportanceBumpHtml(t) : "";
    const estH = t.progress_total != null ? `${t.progress_total}${t.progress_unit || "h"}` : "";
    const selected = Number(t.id) === Number(PLN_SELECTED_TASK_ID);
    const bucket = plnTaskBucket(t);
    const deferred = plnHomeworkDeferred(t, todayStr);
    const importance = typeof taskImportanceValue === "function" ? taskImportanceValue(t) : t.importance;
    const railColor = importanceColor(importance);
    return `<div class="pln-rail-card${selected ? " pln-rail-card-selected" : ""}${deferred ? " pln-rail-card-deferred" : ""}" draggable="true" data-task-id="${t.id}" data-estimate="${plnTaskEstimateMinutes(t)}" data-urgency="${escapeHtml(t.urgency || "medium")}" data-importance="${escapeHtml(importance)}" data-bucket="${bucket}" style="border-left:4px solid ${escapeHtml(railColor)};background:color-mix(in srgb, ${escapeHtml(railColor)} 16%, var(--bg-shell));">
      <div class="pln-rail-card-main">
        <div class="pln-rail-card-title">${escapeHtml(t.title)}</div>
        <button type="button" class="secondary pln-rail-plan-btn" data-task-id="${t.id}" title="Select, then click an hour">${selected ? "Cancel" : "Plan"}</button>
      </div>
      <div class="pln-rail-card-meta">${urg}${importanceBump}<span class="pill" style="font-size:9px;">${escapeHtml(bucket)}</span>${deferred ? '<span class="pill" style="font-size:9px;">not work yet</span>' : ""}${estH ? `<span class="pill" style="font-size:9px;">${escapeHtml(estH)}</span>` : ""}</div>
    </div>`;
  }).join("") : `<div class="pln-rail-empty-state empty-state empty-state--compact">
    <p class="empty-state-title">No matching tasks</p>
    <p class="empty-state-body">Capture one above, or clear the filter to see the rest.</p>
    <button type="button" class="primary empty-state-cta" id="pln-rail-empty-add">Add a task</button>
  </div>`;
}

function buildPlannerRail(tasks, todayStr) {
  const filters = [
    ["all", "All"], ["due_today", "Due"], ["overdue", "Overdue"],
    ["school", "School"], ["work", "Work"], ["life", "Life"],
  ];
  const filterHtml = filters.map(([k, label]) =>
    `<button type="button" class="pln-rail-filter${PLN_RAIL_FILTER === k ? " pln-rail-filter-active" : ""}" data-filter="${k}">${label}</button>`
  ).join("");
  const cards = buildPlannerRailCards(tasks, todayStr);
  return `
    <aside class="pln-rail" id="pln-rail">
      <div class="pln-rail-head"><strong>Tasks</strong></div>
      <div class="pln-rail-capture-row">
        <input type="text" id="pln-rail-quick-task" placeholder="Add a task…" maxlength="200">
        <button type="button" class="primary" id="pln-rail-quick-add">Add</button>
      </div>
      <input type="search" class="pln-rail-search" id="pln-rail-search" placeholder="Find any task…" value="${escapeHtml(PLN_RAIL_SEARCH).replace(/"/g, "&quot;")}">
      <div class="pln-rail-filters">${filterHtml}
        <button type="button" class="secondary" id="pln-bucket-game" title="Assign school / work / life">Buckets</button>
      </div>
      <div class="pln-rail-drop-hint${PLN_SELECTED_TASK_ID ? " pln-rail-drop-active" : ""}" id="pln-rail-drop-hint">${PLN_SELECTED_TASK_ID ? "Click an hour to schedule" : "Drop to schedule"}</div>
      <div class="pln-rail-list" id="pln-rail-list">${cards}</div>
      <div id="pln-rail-extras">
        <div id="pln-rail-extras-form"></div>
        <div id="pln-rail-extras-focus">${buildFocusTimerBlock()}</div>
      </div>
    </aside>`;
}

async function renderPlannerFusedShell() {
  stopFocusTimerTick();
  if (!window._tdyPlannerDateRestored) {
    window._tdyPlannerDateRestored = true;
    let hasQueryDate = false;
    try { hasQueryDate = !!new URLSearchParams(location.search).get("date"); } catch (_) {}
    if (!hasQueryDate) tdyRestorePlannerDate();
  }
  if (ACTIVE_TAB === "Paint") {
    TODAY_WEEK_LAYERS.add("paint");
    TODAY_WEEK_LAYERS.add("events");
    TODAY_WEEK_MODE = "mix";
  }
  const realToday = getRealToday();
  const isViewingToday = CURRENT_DATE === realToday;
  const needPulse = ACTIVE_TAB === "Today";
  const needPractice = ritShouldShowRitual();
  plnSyncCalState(CURRENT_DATE);
  const daysWithData = await ensureTodayDaysCache();
  const daySnapshot = TODAY_DAY_SNAPSHOT;
  const needWeekPaint = ACTIVE_TAB === "Paint" || ACTIVE_TAB === "Calendar"
    || (ACTIVE_TAB === "Today" && (tdyWeekLayerOn("paint") || tdyWeekLayerOn("events")));

  const [day, pulseData, allTasks, calEvents, planEvents, scheduledRows, practiceSummary, weekPaintDates] = await Promise.all([
    api(`/api/day/${CURRENT_DATE}`),
    needPulse ? loadPulseData(CURRENT_DATE) : Promise.resolve(TODAY_PULSE_DATA || { pulses: [], today_count: 0 }),
    api("/api/tasks"),
    api("/api/calendar").catch(() => []),
    api("/api/events").catch(() => []),
    api(`/api/task-schedule?date=${encodeURIComponent(CURRENT_DATE)}`).catch(() => []),
    needPractice ? ritFetchPracticeSummary() : Promise.resolve(RIT_PRACTICE_SUMMARY || { points: 0, streak: 0, total_attempts: 0 }),
    needWeekPaint ? loadWeekPaintHours(CURRENT_DATE) : Promise.resolve([]),
  ]);
  PLN_RAIL_TASKS = allTasks;
  PLN_CAL_EVENTS = calEvents;
  PLN_PLAN_EVENTS = planEvents;
  plnLoadScheduledRows(CURRENT_DATE, scheduledRows);
  RIT_PRACTICE_SUMMARY = practiceSummary;
  TODAY_PULSE_DATA = pulseData;
  cachePracticeSummary(practiceSummary);
  if (isViewingToday) syncPulseHonestyFromPulseData(pulseData, CURRENT_DATE);

  const localSnap = tdyLoadDaySnapshot(CURRENT_DATE);
  let metrics = day.metrics || {};
  if (localSnap?.metrics && !TDY_METRIC_VALUE_KEYS.some(k => metrics[k] != null) && !(metrics.notes || "").trim()) {
    metrics = { ...localSnap.metrics, ...metrics };
  }
  const hours = day.hours || {};
  const dirtyCurrentWeekHours = WEEK_PAINT_DIRTY.has(CURRENT_DATE) ? WEEK_PAINT_HOURS[CURRENT_DATE] : null;
  initTodayHoursFromDay(hours);
  if (weekPaintDates.includes(CURRENT_DATE)) {
    if (dirtyCurrentWeekHours) TODAY_HOURS = dirtyCurrentWeekHours;
    WEEK_PAINT_HOURS[CURRENT_DATE] = TODAY_HOURS;
  }
  TDY_SELECT_SET = new Set();
  resetPaintState();
  TDY_FILL_ANCHOR = null;

  const isPastDay = CURRENT_DATE < realToday;
  const paintedCount = countPaintedHours();
  const completionPct = getTodayCompletionPct();
  let completionColor = "var(--ink-muted)";
  if (completionPct >= 66) completionColor = "var(--status-good)";
  else if (completionPct >= 33) completionColor = "var(--accent)";
  const selectCatOpts = CONFIG.categories.map(c =>
    `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`).join("");
  const todayStr = realToday;
  const focusClass = PLN_SHELL_FOCUS === "strip" ? "pln-focus-strip" : PLN_SHELL_FOCUS === "rail" ? "pln-focus-rail" : "";

  const metricFields = CONFIG.metrics.map(m => {
    const hint = (m.key === "work_time" || m.key === "effective_work_time")
      ? `<span class="tdy-metric-hint" id="tdy-hint-${escapeHtml(m.key)}"></span>` : "";
    return `
    <div class="metric tdy-metric tdy-metric-${escapeHtml(m.key)}">
      <label>${escapeHtml(m.label)}</label>
      <input type="number" id="metric-${m.key}" value="${escapeHtml(String(metrics[m.key] ?? ""))}" ${metricInputAttrs(m)}>
      ${hint}
    </div>`;
  }).join("");
  const notesWordCount = countTodayWords(metrics.notes || "");
  const templates = loadDayTemplates();

  const showRitual = ritShouldShowRitual();
  const contract = ritLoadContract();
  if (showRitual) {
    RIT_ANCHOR_RANK = 0;
    RIT_SWAP_USED = localStorage.getItem(RIT_SWAP_KEY) === todayStr;
  }
  const ritualAnchor = showRitual ? ritPickAnchor(allTasks, calEvents, todayStr, RIT_ANCHOR_RANK) : null;
  const ritualMove = ritualAnchor ? ritDeriveMove(ritualAnchor) : "";
  const ritualReward = ritualAnchor ? ritBuildRewardText(practiceSummary) : "";
  const ritualOverlay = showRitual ? ritBuildOverlayHtml(ritualAnchor, ritualMove, ritualReward, RIT_SWAP_USED, todayStr) : "";
  const contractBanner = ACTIVE_TAB === "Today" && contract ? ritBuildContractBanner(contract) : "";
  const dayUpdatedAt = metrics.updated_at || null;
  const lateSaved = plnIsLateLog(CURRENT_DATE, dayUpdatedAt);
  const lateHintHtml = lateSaved
    ? `<p class="pln-late-hint" title="${escapeHtml(dayUpdatedAt || "")}">Late log — saved ${escapeHtml(plnFormatLateSavedHint(dayUpdatedAt))}</p>`
    : "";

  const shell = `
    ${plannerFusedStyles()}
    ${tdyAddictiveLoopStyles()}
    ${ritStyles()}
    ${ACTIVE_TAB === "Today" ? buildTodayHeaderHtml() : ""}
    ${ACTIVE_TAB === "Today" ? `<div class="pln-top-pulse">${renderPulseCompactRow(pulseData, isViewingToday)}</div>` : ""}
    ${ACTIVE_TAB === "Today" ? buildPulseHonestyNoteHtml() : ""}
    ${ACTIVE_TAB === "Today" ? buildEodBanner(paintedCount) : ""}
    ${ACTIVE_TAB === "Paint" ? "" : buildPlannerModeChips()}
    ${ACTIVE_TAB === "Today" ? buildTodayWeekPeek(CURRENT_DATE) : ""}
    ${ACTIVE_TAB === "Paint" || (ACTIVE_TAB === "Today" && tdyWeekLayerOn("paint")) ? (ACTIVE_TAB === "Paint" ? buildTodayWeekPaint(CURRENT_DATE) : "") : ""}
    ${ACTIVE_TAB === "Paint" ? "" : contractBanner}
    ${ACTIVE_TAB === "Paint" ? "" : `<div class="pln-shell ${focusClass}" id="pln-shell">
      ${buildPlannerStrip(daysWithData, calEvents, daySnapshot)}
      ${buildPlannerCanvas(isPastDay, paintedCount, selectCatOpts, completionPct, completionColor, lateHintHtml)}
      ${buildPlannerRail(allTasks, todayStr)}
      ${ritualOverlay}
    </div>`}
    <div class="pln-extras"${ACTIVE_TAB === "Paint" ? " hidden" : ""}>
      ${ACTIVE_TAB === "Today" ? `
        ${buildDueTodayPanel(allTasks)}
        <details class="card tdy-metrics-card"${tdyMetricsOpen() ? " open" : ""}>
          <summary class="tdy-tools-summary">Day metrics</summary>
          <div class="metrics-grid tdy-metrics-grid">${metricFields}</div>
          <label style="font-size:11px;color:var(--ink-muted);">Notes</label>
          <textarea id="metric-notes" style="min-height:48px;">${escapeHtml(metrics.notes || "")}</textarea>
          <div id="tdy-notes-word-count" class="tdy-notes-word-count">${notesWordCount} word${notesWordCount === 1 ? "" : "s"}</div>
        </details>
        ${buildLocalForecastCardHtml()}
        <details class="card tdy-tools">
          <summary class="tdy-tools-summary">Day tools</summary>
          <div class="tdy-tools-body">
            <div class="tdy-tools-row">
              <button type="button" class="secondary" id="tdy-copy-yesterday">Copy yesterday</button>
              <label class="tdy-replace-label"><input type="checkbox" id="tdy-replace-all-hours"> Replace all</label>
              <button type="button" class="secondary" id="tdy-napkin-git-tools" title="Compile napkin issues and send to git">Send napkin issues to git</button>
            </div>
            <div class="tdy-template-row">
              <button type="button" class="secondary" id="tdy-save-template">Save template</button>
              <select id="tdy-apply-template" class="secondary">${buildTemplateSelectOptions(templates)}</select>
              <button type="button" class="secondary" id="tdy-manage-templates-btn" title="Manage templates">⚙</button>
            </div>
            <div class="tdy-tools-row">
              <span>Sleep</span>
              <select id="tdy-sleep-start">${buildHourSelectOptions(23)}</select>
              <span>→</span>
              <select id="tdy-sleep-end">${buildHourSelectOptions(7)}</select>
              <button type="button" class="secondary" id="tdy-sleep-fill">Fill</button>
            </div>
            <div class="tdy-tools-row">
              <input type="text" id="vibecode-input" placeholder='vibecode category: "add Gym, teal"' style="flex:1; min-width:160px;">
              <button class="secondary" id="vibecode-btn">Apply</button>
            </div>
          </div>
        </details>
      ` : ""}
      <div id="pln-tab-extras"></div>
    </div>`;

  if (showRitual && ritualAnchor) {
    ritStoreWireContext({
      anchor: ritualAnchor,
      move: ritualMove,
      reward: ritualReward,
      tasks: allTasks,
      calEvents,
      todayStr,
    });
  } else {
    ritStoreWireContext(null);
  }

  return shell + renderTodayLegacyStyles();
}

let RIT_WIRE_CTX = null;

function ritStoreWireContext(ctx) {
  RIT_WIRE_CTX = ctx;
}

function renderTodayLegacyStyles() {
  return `<style>
      .tdy-date-bar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .tdy-day-strip { display:flex; gap:2px; margin-top:8px; flex-wrap:wrap; }
      .tdy-day-chip { display:inline-flex; flex-direction:column; align-items:center; gap:1px; min-width:24px; padding:2px 4px; border-radius:6px; border:1px solid var(--border); background:transparent; cursor:pointer; font-size:11px; font-variant-numeric:tabular-nums; color:var(--ink-muted); }
      .tdy-day-chip-selected { border-color:var(--ink-secondary); background:var(--bg-shell); color:var(--ink-secondary); }
      .tdy-day-num { line-height:1.2; }
      .tdy-day-dot { width:4px; height:4px; border-radius:50%; background:transparent; }
      .tdy-day-dot-filled { background:var(--status-good); }
      .tdy-viewing-pill { margin-top:6px; font-size:11px; }
      .tdy-grid-hint { margin:8px 0 4px; font-size:11px; color:var(--ink-muted); }
      .tdy-past-hint { margin:6px 0 0; font-size:11px; }
      .tdy-save-row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:10px; }
      .pln-save-whisper { font-size:11px; font-style:italic; color:var(--ink-muted); opacity:0; transition:opacity .4s ease; max-width:220px; line-height:1.35; flex-shrink:0; }
      .pln-save-whisper.pln-save-whisper-visible { opacity:1; }
      .pln-save-whisper.pln-save-whisper-out { opacity:0; }
      @media (prefers-reduced-motion: reduce) { .pln-save-whisper { transition:none; } }
      .tdy-completion-wrap { flex:1; min-width:120px; }
      .tdy-completion-track { height:5px; border-radius:3px; background:var(--border); overflow:hidden; }
      .tdy-completion-bar { height:100%; width:0; border-radius:3px; transition:width 0.15s ease, background 0.15s ease; }
      .tdy-completion-label { font-size:10px; color:var(--ink-muted); margin-top:2px; }
      .tdy-metrics-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; align-items:start; }
      .tdy-metrics-card .tdy-metrics-grid { margin-top:10px; }
      .tdy-metrics-grid .metric { display:flex; flex-direction:column; align-items:stretch; min-width:0; }
      .tdy-metrics-grid .metric label { display:flex; align-items:flex-end; min-height:2.7em; font-size:11px; line-height:1.25; }
      .tdy-metrics-grid .metric input { box-sizing:border-box; width:100%; min-width:0; font-size:13px; padding:4px 6px; }
      .tdy-notes-word-count { font-size:10px; color:var(--ink-muted); margin-top:2px; }
      .tdy-tools-summary { cursor:pointer; font-size:13px; font-weight:600; list-style:none; }
      .tdy-tools-summary::-webkit-details-marker { display:none; }
      .tdy-tools-summary::before { content:"▸"; display:inline-block; margin-right:6px; font-size:10px; color:var(--ink-muted); transition:transform 0.15s; }
      .tdy-tools[open] .tdy-tools-summary::before, .tdy-metrics-card[open] .tdy-tools-summary::before { transform:rotate(90deg); }
      .tdy-tools-body { margin-top:10px; display:flex; flex-direction:column; gap:10px; }
      .tdy-tools-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; font-size:12px; }
      .tdy-tools-row select, .tdy-tools-row input[type="text"] { font-size:12px; }
      .tdy-replace-label { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--ink-muted); cursor:pointer; user-select:none; }
      .tdy-template-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .tdy-template-row select { font-size:12px; min-width:120px; }
      .tdy-template-manage-popover { position:absolute; z-index:200; min-width:180px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); box-shadow:var(--plate-shadow-hover); }
      .tdy-template-manage-item { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:4px 0; font-size:12px; }
      .tdy-template-manage-item button { font-size:11px; padding:2px 6px; }
      .tdy-canvas-toolbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:6px 0 4px; }
      .tdy-select-toggle { font-size:11px; }
      .tdy-select-toggle.tdy-mode-active { border-color:var(--accent); color:var(--accent); }
      .tdy-cat-palette { display:flex; gap:3px; flex-wrap:wrap; flex:1; }
      .tdy-cat-chip { display:inline-flex; align-items:center; gap:3px; padding:2px 6px; border-radius:999px; border:1px solid var(--border); background:var(--bg-shell); font-size:10px; cursor:pointer; color:var(--ink-secondary); }
      .tdy-cat-chip.tdy-cat-armed { border-color:var(--tdy-chip-color, var(--accent)); box-shadow:inset 0 0 0 1px var(--tdy-chip-color, var(--accent)); color:var(--ink-primary); }
      .tdy-unpaint-chip.tdy-cat-armed { --tdy-chip-color:var(--status-critical); border-color:var(--status-critical); box-shadow:inset 0 0 0 1px var(--status-critical); }
      .tdy-unpaint-swatch { background:linear-gradient(135deg, #fff 45%, var(--status-critical) 46%); border:1px solid color-mix(in srgb, var(--status-critical) 60%, var(--border)); }
      .tdy-cat-swatch { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .tdy-cat-hotkey { font-size:8px; color:var(--ink-muted); margin-left:1px; }
      .tdy-canvas-wrap { max-height:480px; max-width:100%; overflow-x:hidden; overflow-y:auto; border:1px solid var(--gridline); border-radius:8px; background:var(--bg-shell); }
      .tdy-canvas-wrap.tdy-scroll-locked { overflow:hidden; }
      .tdy-hour-row { display:flex; align-items:stretch; gap:4px; border-bottom:1px solid var(--gridline); min-width:0; max-width:100%; }
      .tdy-hour-row:last-child { border-bottom:none; }
      .tdy-hour-time { width:38px; flex-shrink:0; padding:2px 3px; font-size:10px; line-height:1.2; font-variant-numeric:tabular-nums; color:var(--ink-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tdy-hour-cell { flex:1; min-width:0; min-height:22px; padding:2px 6px; cursor:crosshair; position:relative; border-radius:3px; margin:1px 3px 1px 0; overflow:hidden; }
      .tdy-hour-cell.tdy-hour-ghost { outline:2px dashed var(--tdy-ghost-color, var(--accent)); outline-offset:-2px; opacity:0.55; }
      .tdy-hour-cell.tdy-hour-ghost-strong { opacity:0.82; outline:2px solid var(--tdy-ghost-color, var(--accent)); outline-offset:-2px; background:color-mix(in srgb, var(--tdy-ghost-fill, var(--tdy-ghost-color, var(--accent))) 42%, transparent) !important; }
      .tdy-hour-cell.tdy-hour-ghost-unpaint { --tdy-ghost-color:var(--status-critical); --tdy-ghost-fill:var(--status-critical); }
      .tdy-ghost-range-label-unpaint { background:var(--status-critical) !important; color:#fff !important; }
      .tdy-ghost-range-label { position:fixed; z-index:350; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--bg-card); border:1px solid var(--border); pointer-events:none; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
      .tdy-hour-note-preview { font-size:10px; opacity:0.85; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tdy-hour-empty { margin:8px 0; font-size:12px; color:var(--ink-muted); font-style:italic; }
      .tdy-note-popover { position:fixed; z-index:300; min-width:200px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); box-shadow:var(--plate-shadow-hover); }
      .tdy-note-pop-label { display:block; font-size:11px; color:var(--ink-muted); margin-bottom:4px; }
      .tdy-note-pop-input { width:100%; box-sizing:border-box; font-size:13px; }
      .tdy-note-pop-actions { display:flex; gap:6px; margin-top:6px; }
      .tdy-due-panel { margin-top:10px; }
      .tdy-due-head { font-size:13px; }
      .tdy-due-list { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
      .tdy-due-row { display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; }
      .tdy-due-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tdy-due-empty { margin:6px 0 0; font-size:12px; }
      .tdy-forecast-card { margin-top:10px; }
      .tdy-forecast-card:not(.tdy-forecast-expanded) .tdy-forecast-head { margin-bottom:0; }
      .tdy-forecast-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; }
      .tdy-forecast-head strong { font-size:13px; }
      .tdy-forecast-head-actions { display:flex; gap:6px; align-items:center; flex-shrink:0; }
      .tdy-forecast-head button { font-size:11px; padding:2px 8px; }
      .tdy-forecast-meta { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
      .tdy-forecast-day-type { font-size:10px; text-transform:capitalize; }
      .tdy-forecast-section-title { font-size:11px; font-weight:600; color:var(--ink-secondary); margin-bottom:4px; }
      .tdy-forecast-next-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
      .tdy-forecast-next-row { display:grid; grid-template-columns:52px 1fr auto; gap:6px; align-items:center; font-size:12px; }
      .tdy-forecast-hour { font-variant-numeric:tabular-nums; color:var(--ink-muted); }
      .tdy-forecast-pct { font-size:10px; color:var(--ink-muted); }
      .tdy-forecast-boost { margin-top:10px; font-size:12px; line-height:1.45; }
      .tdy-forecast-boost-label { display:block; font-size:10px; font-weight:600; color:var(--ink-muted); text-transform:uppercase; letter-spacing:0.03em; margin-bottom:2px; }
      .tdy-forecast-boost-empty { margin:10px 0 0; font-size:11px; }
    </style>`;
}

async function renderToday() {
  PLN_SHELL_FOCUS = "canvas";
  const html = await renderPlannerFusedShell();
  if (ACTIVE_TAB === "Paint") {
    setTimeout(() => {
      if (ACTIVE_TAB === "Paint") wirePaintTab();
    }, 0);
  }
  return html;
}

function wireTodayDirtyTracking() {
  document.querySelectorAll(".metrics-grid input, #metric-notes").forEach(el => {
    el.addEventListener("input", () => {
      const metricKey = el.id.startsWith("metric-") ? el.id.slice(7) : "";
      if (metricKey === "work_time" || metricKey === "effective_work_time") {
        el.dataset.tdyPaintMode = "manual";
        setPaintMetricMode(metricKey, "manual");
      }
      setTodayDirty();
    });
  });
}

function wireTodayPowerFeatures() {
  document.getElementById("tdy-copy-yesterday")?.addEventListener("click", async () => {
    const btn = document.getElementById("tdy-copy-yesterday");
    const replaceAll = document.getElementById("tdy-replace-all-hours")?.checked;
    btn.disabled = true;
    btn.textContent = "Copying…";
    try {
      const prevDate = addDays(CURRENT_DATE, -1);
      const prevDay = await api(`/api/day/${prevDate}`);
      const sourceHours = {};
      const raw = prevDay.hours || {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && v.category) sourceHours[k] = { category: v.category };
      }
      const count = applyHourCategories(sourceHours, replaceAll);
      if (count > 0) {
        showToast("Copied yesterday's schedule — save to keep it", "info");
      } else {
        showToast("Nothing to copy — yesterday has no categories" + (replaceAll ? "" : " in empty hours"), "warn");
      }
    } catch (exc) {
      showToast("Could not load yesterday: " + exc, "warn");
    } finally {
      btn.disabled = false;
      btn.textContent = "Copy yesterday";
    }
  });

  document.getElementById("tdy-save-template")?.addEventListener("click", () => {
    const hours = captureCurrentHourCategories();
    if (!Object.keys(hours).length) {
      showToast("No hour categories to save", "warn");
      return;
    }
    const name = window.prompt("Template name:");
    if (!name || !name.trim()) return;
    const templates = loadDayTemplates();
    templates.push({ name: name.trim(), hours });
    saveDayTemplates(templates);
    refreshTemplateSelect();
    showToast(`Saved template “${name.trim()}”`, "good");
  });

  document.getElementById("tdy-apply-template")?.addEventListener("change", () => {
    const sel = document.getElementById("tdy-apply-template");
    if (!sel || sel.value === "") return;
    const templates = loadDayTemplates();
    const tpl = templates[Number(sel.value)];
    sel.value = "";
    if (!tpl) return;
    const replaceAll = document.getElementById("tdy-replace-all-hours")?.checked;
    const sourceHours = {};
    for (const [h, cat] of Object.entries(tpl.hours || {})) {
      sourceHours[h] = { category: cat };
    }
    const count = applyHourCategories(sourceHours, replaceAll);
    showToast(count > 0
      ? `Applied template “${tpl.name}” — save to keep it`
      : `Template “${tpl.name}” had nothing to apply`, count > 0 ? "info" : "warn");
  });

  document.getElementById("tdy-manage-templates-btn")?.addEventListener("click", (e) => {
    closeTemplateManagePopover();
    const templates = loadDayTemplates();
    const btn = e.currentTarget;
    const pop = document.createElement("div");
    pop.id = "tdy-template-manage-popover";
    pop.className = "tdy-template-manage-popover";
    const rect = btn.getBoundingClientRect();
    if (!templates.length) {
      pop.innerHTML = `<div class="stub" style="font-size:12px;">No saved templates.</div>`;
    } else {
      pop.innerHTML = templates.map((t, i) => `
        <div class="tdy-template-manage-item">
          <span>${escapeHtml(t.name)}</span>
          <button type="button" class="secondary tdy-template-delete" data-idx="${i}">Delete</button>
        </div>`).join("");
    }
    document.body.appendChild(pop);
    positionPlannerPopover(pop, rect.left, rect.bottom + 4);
    pop.querySelectorAll(".tdy-template-delete").forEach(delBtn => {
      delBtn.onclick = () => {
        const idx = Number(delBtn.dataset.idx);
        const list = loadDayTemplates();
        const removed = list.splice(idx, 1)[0];
        saveDayTemplates(list);
        refreshTemplateSelect();
        closeTemplateManagePopover();
        if (removed) showToast(`Deleted template “${removed.name}”`, "info");
      };
    });
    setTimeout(() => document.addEventListener("mousedown", templateManageOutsideClick, true), 0);
  });

  document.getElementById("tdy-sleep-fill")?.addEventListener("click", () => {
    const sleepCat = findSleepCategory();
    if (!sleepCat) {
      showToast("No sleep category found — add one whose name contains “sleep”", "warn");
      return;
    }
    const start = Number(document.getElementById("tdy-sleep-start")?.value);
    const end = Number(document.getElementById("tdy-sleep-end")?.value);
    const sourceHours = {};
    hoursInWrapRange(start, end).forEach(h => {
      sourceHours[h] = { category: sleepCat.key };
    });
    applyHourCategories(sourceHours, true);
    setTodayDirty();
    showToast(`Filled sleep (${String(start).padStart(2, "0")}:00 → ${String(end).padStart(2, "0")}:00)`, "info");
  });

  document.getElementById("metric-notes")?.addEventListener("input", updateTodayNotesWordCount);
}

function closeCategoryRadial() {
  document.getElementById("pln-cat-radial")?.remove();
  document.removeEventListener("mousedown", categoryRadialOutside, true);
}

function categoryRadialOutside(e) {
  const pop = document.getElementById("pln-cat-radial");
  if (pop && !pop.contains(e.target)) closeCategoryRadial();
}

function showCategoryRadial(clientX, clientY, onPick) {
  closeCategoryRadial();
  const pop = document.createElement("div");
  pop.id = "pln-cat-radial";
  pop.className = "pln-cat-radial";
  pop.innerHTML = CONFIG.categories.map((c, i) =>
    `<button type="button" data-cat="${escapeHtml(c.key)}" style="background:${escapeHtml(c.color)};" title="${escapeHtml(c.label)}${i < 9 ? ` (${i + 1})` : ""}"></button>`
  ).join("");
  document.body.appendChild(pop);
  positionPlannerPopover(pop, clientX, clientY);
  pop.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      onPick(btn.dataset.cat);
      closeCategoryRadial();
    };
  });
  setTimeout(() => document.addEventListener("mousedown", categoryRadialOutside, true), 0);
}

function applyPaintRangeToCells(lo, hi, category) {
  if (!category) return;
  hourRange(lo, hi).forEach(h => {
    const prev = getHourCell(h);
    setHourCell(h, { category, note: prev.note });
  });
  setTodayDirty();
  refreshHourCanvas();
  updateTodayCompletionMeter();
}

function applyUnpaintRangeToCells(lo, hi) {
  let count = 0;
  hourRange(lo, hi).forEach(h => {
    const prev = getHourCell(h);
    if (!prev.category) return;
    setHourCell(h, { category: "", note: prev.note });
    count++;
  });
  if (count > 0) {
    setTodayDirty(count);
    refreshHourCanvas();
    updateTodayCompletionMeter();
  }
}

function wireHourCellInteractions() {
  document.querySelectorAll(".pln-task-scheduled").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const taskId = Number(btn.dataset.taskId);
      try {
        await api(`/api/task-schedule/${taskId}?date=${encodeURIComponent(CURRENT_DATE)}`, {
          method: "DELETE",
        });
        plnRemoveScheduledTask(CURRENT_DATE, taskId);
        refreshHourCanvas();
        showToast("Task removed from the hour plan", "info");
      } catch (err) {
        showToast("Could not unschedule task: " + errorMessage(err), "warn");
      }
    };
  });
  document.querySelectorAll(".pln-event-badge").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      if (TDY_MODE === "select" || e.shiftKey) {
        const key = tdyEventKey(btn.dataset.kind, btn.dataset.id);
        if (TDY_EVENT_SELECT.has(key)) TDY_EVENT_SELECT.delete(key);
        else TDY_EVENT_SELECT.add(key);
        refreshHourCanvas();
        return;
      }
      plnOpenCommitmentEditor(btn.dataset.kind, btn.dataset.id);
    };
    btn.oncontextmenu = async e => {
      e.preventDefault();
      e.stopPropagation();
      tdyStopPaint();
      if (!window.confirm("Remove this from today? Painting stays armed.")) return;
      const endpoint = btn.dataset.kind === "event" ? `/api/events/${btn.dataset.id}` : `/api/calendar/${btn.dataset.id}`;
      try {
        await api(endpoint, { method: "DELETE" });
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
      }
    };
  });
  document.querySelectorAll(".pln-event-lane-btn").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const next = btn.dataset.lane === "work" ? "passion" : "work";
      const endpoint = btn.dataset.kind === "event" ? `/api/events/${btn.dataset.id}` : `/api/calendar/${btn.dataset.id}`;
      try {
        const updated = await api(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lane: next }),
        });
        const collection = btn.dataset.kind === "event" ? PLN_PLAN_EVENTS : PLN_CAL_EVENTS;
        const item = collection.find(event => Number(event.id) === Number(btn.dataset.id));
        if (item) Object.assign(item, { lane: next }, updated || {});
        showToast(next === "work" ? "Marked work" : "Marked passion", "info");
        refreshHourCanvas();
      } catch (err) {
        showToast(errorMessage(err), "warn");
      }
    };
  });
  document.querySelectorAll(".pln-event-remove").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const endpoint = btn.dataset.kind === "event" ? `/api/events/${btn.dataset.id}` : `/api/calendar/${btn.dataset.id}`;
      try {
        await api(endpoint, { method: "DELETE" });
        const collection = btn.dataset.kind === "event" ? PLN_PLAN_EVENTS : PLN_CAL_EVENTS;
        const idx = collection.findIndex(event => Number(event.id) === Number(btn.dataset.id));
        if (idx >= 0) collection.splice(idx, 1);
        TDY_EVENT_SELECT.delete(tdyEventKey(btn.dataset.kind, btn.dataset.id));
        refreshHourCanvas();
        refreshPlannerStripPartial();
        showToast("Event removed", "info");
      } catch (err) {
        showToast(errorMessage(err), "warn");
      }
    };
  });
  document.querySelectorAll(".pln-fill-handle").forEach(handle => {
    handle.onpointerdown = e => {
      if (!e.isPrimary || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const pointerId = e.pointerId;
      handle.setPointerCapture?.(pointerId);
      const hour = Number(handle.dataset.hour);
      const cell = getHourCell(hour);
      if (!cell.category || !TDY_FILL_ANCHOR) return;
      const [lo, hi] = TDY_FILL_ANCHOR;
      const blockLen = hi - lo + 1;
      TDY_FILL_DRAG = { lo, hi, blockLen, category: cell.category, cells: {} };
      for (let h = lo; h <= hi; h++) TDY_FILL_DRAG.cells[h] = { ...getHourCell(h) };

      const label = document.createElement("div");
      label.className = "pln-fill-label";
      label.id = "pln-fill-label";
      document.body.appendChild(label);

      const onMove = ev => {
        if (ev.pointerId !== pointerId || !ev.isPrimary) return;
        if (ev.pointerType === "mouse" && (ev.buttons & 1) === 0) return;
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetHour = hourFromEventTarget(target);
        if (targetHour == null) return;
        document.querySelectorAll(".tdy-hour-fill-ghost").forEach(el => el.classList.remove("tdy-hour-fill-ghost"));
        const repeatEnd = targetHour;
        const repeats = Math.max(1, Math.floor((repeatEnd - hi) / blockLen) + 1);
        label.textContent = `repeat x${repeats}`;
        label.style.left = ev.clientX + 12 + "px";
        label.style.top = ev.clientY + 12 + "px";
        for (let r = 1; r < repeats; r++) {
          for (let h = lo; h <= hi; h++) {
            const dest = hi + r * blockLen + (h - lo);
            if (dest >= 24) continue;
            const el = document.querySelector(`.tdy-hour-cell[data-hour="${dest}"]`);
            if (el) {
              el.classList.add("tdy-hour-fill-ghost");
              const cat = CONFIG.categories.find(c => c.key === cell.category);
              if (cat) el.style.setProperty("--tdy-ghost-color", cat.color);
            }
          }
        }
      };

      const onUp = ev => {
        if (ev.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
        label.remove();
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetHour = hourFromEventTarget(target);
        document.querySelectorAll(".tdy-hour-fill-ghost").forEach(el => el.classList.remove("tdy-hour-fill-ghost"));
        if (ev.type !== "pointercancel" && targetHour != null && TDY_FILL_DRAG) {
          const { lo: fLo, hi: fHi, blockLen: bl, category: cat } = TDY_FILL_DRAG;
          const repeats = Math.max(1, Math.floor((targetHour - fHi) / bl) + 1);
          for (let r = 1; r < repeats; r++) {
            for (let h = fLo; h <= fHi; h++) {
              const dest = fHi + r * bl + (h - fLo);
              if (dest >= 24) continue;
              const src = TDY_FILL_DRAG.cells[h];
              setHourCell(dest, { category: cat, note: src?.note || "" });
            }
          }
          setTodayDirty();
          refreshHourCanvas();
        }
        TDY_FILL_DRAG = null;
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    };
  });
}

function wirePlannerStripNav() {
  document.querySelectorAll(".pln-mini-day, .pln-day-chip, .today-day-chip").forEach(btn => {
    btn.onclick = () => {
      const date = btn.dataset.date;
      if (date === CURRENT_DATE && !TODAY_DIRTY) {
        refreshPlannerStripPartial();
        return;
      }
      navigateToPlannerDay(date);
    };
  });
  document.querySelectorAll(".pln-strip-nav-btn").forEach(btn => {
    btn.onclick = () => {
      const newDate = plnShiftDateByMonths(CURRENT_DATE, Number(btn.dataset.dir));
      navigateToPlannerDay(newDate);
    };
  });
  document.querySelectorAll(".pln-commit-add").forEach(btn => {
    btn.onclick = () => {
      const form = document.getElementById("tdy-event-quick-form");
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) document.getElementById("tdy-event-title")?.focus();
    };
  });
  document.querySelectorAll(".pln-commit-chip, .tdy-week-chip").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      if (e.shiftKey || TDY_MODE === "select") {
        const key = tdyEventKey(btn.dataset.kind || "calendar", btn.dataset.id || btn.dataset.calId);
        if (TDY_EVENT_SELECT.has(key)) TDY_EVENT_SELECT.delete(key);
        else TDY_EVENT_SELECT.add(key);
        btn.classList.toggle("tdy-week-chip-selected", TDY_EVENT_SELECT.has(key));
        return;
      }
      if (TDY_ARMED_CAT && (btn.dataset.kind === "calendar" || btn.classList.contains("tdy-week-chip"))) {
        const id = btn.dataset.id || btn.dataset.calId;
        if (id && window.confirm("Cancel this event? Painting stays armed.")) {
          await api(`/api/calendar/${id}`, { method: "DELETE" });
          render();
        }
        return;
      }
      plnOpenCommitmentEditor(btn.dataset.kind, btn.dataset.id);
    };
  });
  document.querySelectorAll(".tdy-week-add").forEach(btn => {
    btn.onclick = () => {
      const form = document.getElementById("tdy-event-quick-form");
      if (!form) return;
      plnResetQuickEventForm(form);
      form.dataset.date = btn.dataset.date;
      form.hidden = false;
      document.getElementById("tdy-event-title")?.focus();
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  });
  document.querySelectorAll(".tdy-week-goto").forEach(btn => {
    btn.onclick = () => navigateToPlannerDay(btn.dataset.date);
  });
  const quickEventForm = document.getElementById("tdy-event-quick-form");
  if (quickEventForm) {
    const cancelQuickEvent = () => {
      plnResetQuickEventForm(quickEventForm);
      quickEventForm.hidden = true;
    };
    quickEventForm.onsubmit = async e => {
      e.preventDefault();
      const title = document.getElementById("tdy-event-title")?.value.trim();
      if (!title) {
        document.getElementById("tdy-event-title")?.focus();
        return;
      }
      const submit = quickEventForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        if (TODAY_DIRTY || TODAY_AUTOSAVE_TIMER) await flushTodayAutosave();
        const editKind = quickEventForm.dataset.editKind;
        const editId = quickEventForm.dataset.editId;
        const startTime = document.getElementById("tdy-event-start")?.value || null;
        const endTime = document.getElementById("tdy-event-end")?.value || null;
        const payload = {
          title,
          start_time: startTime,
          end_time: endTime,
          url: document.getElementById("tdy-event-url")?.value || "",
          kind: document.getElementById("tdy-event-kind")?.value || "event",
          lane: document.getElementById("tdy-event-lane")?.value || "passion",
          force: true,
        };
        if (!editId) payload.date = quickEventForm.dataset.date || CURRENT_DATE;
        if (editKind === "event" && startTime && endTime) payload.all_day = false;
        const endpoint = editId
          ? (editKind === "event" ? `/api/events/${editId}` : `/api/calendar/${editId}`)
          : "/api/calendar";
        const saved = await api(endpoint, {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (editId) {
          const collection = editKind === "event" ? PLN_PLAN_EVENTS : PLN_CAL_EVENTS;
          const item = collection.find(event => Number(event.id) === Number(editId));
          if (item) Object.assign(item, payload, saved || {});
        } else {
          PLN_CAL_EVENTS.push(saved);
        }
        showToast(`${editId ? "Saved" : "Created"} “${title}”`, "good");
        plnResetQuickEventForm(quickEventForm);
        quickEventForm.hidden = true;
        refreshPlannerStripPartial();
        refreshHourCanvas();
      } catch (err) {
        showToast("Could not create event: " + errorMessage(err), "warn");
        if (submit) submit.disabled = false;
      }
    };
    quickEventForm.querySelector(".tdy-event-quick-cancel")?.addEventListener("click", cancelQuickEvent);
    quickEventForm.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancelQuickEvent();
    });
  }
}

function plnResetQuickEventForm(form) {
  delete form.dataset.editKind;
  delete form.dataset.editId;
  form.dataset.date = CURRENT_DATE;
  const title = document.getElementById("tdy-event-title");
  const start = document.getElementById("tdy-event-start");
  const end = document.getElementById("tdy-event-end");
  const url = document.getElementById("tdy-event-url");
  const kind = document.getElementById("tdy-event-kind");
  const lane = document.getElementById("tdy-event-lane");
  if (title) title.value = "";
  if (start) start.value = tdySelectionEventTimes().start;
  if (end) end.value = tdySelectionEventTimes().end;
  if (url) url.value = "";
  if (kind) kind.value = "event";
  if (lane) lane.value = "passion";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = false;
    submit.textContent = "Create";
  }
}

function plnOpenCommitmentEditor(kind, id) {
  const collection = kind === "event" ? PLN_PLAN_EVENTS : PLN_CAL_EVENTS;
  const event = collection.find(item => Number(item.id) === Number(id));
  const form = document.getElementById("tdy-event-quick-form");
  if (!event || !form) return;
  form.dataset.editKind = kind;
  form.dataset.editId = String(id);
  form.dataset.date = event.date || CURRENT_DATE;
  form.hidden = false;
  const title = document.getElementById("tdy-event-title");
  const start = document.getElementById("tdy-event-start");
  const end = document.getElementById("tdy-event-end");
  const url = document.getElementById("tdy-event-url");
  const kindEl = document.getElementById("tdy-event-kind");
  const lane = document.getElementById("tdy-event-lane");
  if (title) title.value = event.title || "";
  if (start) start.value = event.start_time ? String(event.start_time).slice(0, 5) : "";
  if (end) end.value = event.end_time ? String(event.end_time).slice(0, 5) : "";
  if (url) url.value = event.url || "";
  if (kindEl) kindEl.value = event.kind || (event.class_id ? "class" : "event");
  if (lane) lane.value = event.lane || "passion";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = false;
    submit.textContent = "Save";
  }
  title?.focus();
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  tdyWireTimePick(form);
}

async function tdyShiftEventsToHour(targetHour) {
  const hour = Number(targetHour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    showToast("Select a destination hour first", "warn");
    return;
  }
  const keys = [...TDY_EVENT_SELECT];
  const fromHours = keys.length ? keys : null;
  const events = [];
  if (fromHours) {
    keys.forEach(key => {
      const [kind, id] = key.split(":");
      const collection = kind === "event" ? PLN_PLAN_EVENTS : PLN_CAL_EVENTS;
      const event = collection.find(item => Number(item.id) === Number(id));
      if (event) events.push({ kind, event });
    });
  } else {
    [...TDY_SELECT_SET].forEach(h => {
      plnTimedEventsForHour(CURRENT_DATE, h).forEach(event => {
        events.push({ kind: event._kind, event });
      });
    });
  }
  const unique = [];
  const seen = new Set();
  events.forEach(item => {
    const key = tdyEventKey(item.kind, item.event.id);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  if (!unique.length) {
    showToast("No events to move", "info");
    return;
  }
  for (const { kind, event } of unique) {
    const start = plnTimeToMinutes(event.start_time, hour * 60);
    const end = plnTimeToMinutes(event.end_time, start + 60);
    const duration = Math.max(5, end - start);
    const nextStart = hour * 60 + (start % 60);
    const nextEnd = Math.min(24 * 60 - 1, nextStart + duration);
    const payload = {
      start_time: tdyFormatMinutes(nextStart),
      end_time: tdyFormatMinutes(nextEnd),
      date: CURRENT_DATE,
    };
    const endpoint = kind === "event" ? `/api/events/${event.id}` : `/api/calendar/${event.id}`;
    try {
      const saved = await api(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      Object.assign(event, payload, saved || {});
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  }
  TDY_EVENT_SELECT.clear();
  refreshHourCanvas();
  refreshPlannerStripPartial();
  showToast(`Moved ${unique.length} event${unique.length === 1 ? "" : "s"}`, "good");
}

function wirePlannerModeChips() {
  document.querySelectorAll(".pln-mode-chip").forEach(chip => {
    chip.onclick = () => {
      const tab = chip.dataset.tab;
      if (tab === "Paint") {
        TODAY_WEEK_LAYERS.add("paint");
        TODAY_WEEK_MODE = TODAY_WEEK_LAYERS.size === 1 ? "paint" : "mix";
        tdyPersistWeekLayers();
        if (ACTIVE_TAB !== "Paint" && typeof goToTab === "function") goToTab("Paint");
        else render();
        return;
      }
      if (tab && tab !== ACTIVE_TAB && typeof goToTab === "function") goToTab(tab);
    };
  });
}

function wirePlannerRailQuickAdd() {
  const input = document.getElementById("pln-rail-quick-task");
  const btn = document.getElementById("pln-rail-quick-add");
  const emptyAdd = document.getElementById("pln-rail-empty-add");
  if (emptyAdd && input) emptyAdd.onclick = () => input.focus();
  if (!input || !btn) return;
  const submit = async () => {
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    btn.disabled = true;
    try {
      await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, urgency: "medium" }),
      });
      input.value = "";
      render();
    } catch (exc) {
      showToast("Could not add task: " + exc, "warn");
    } finally {
      btn.disabled = false;
    }
  };
  btn.onclick = submit;
  input.onkeydown = e => { if (e.key === "Enter") submit(); };
  input.focus();
}

function wirePlannerRailFilters() {
  document.querySelectorAll(".pln-rail-filter").forEach(btn => {
    btn.onclick = () => {
      PLN_RAIL_FILTER = btn.dataset.filter;
      render();
    };
  });
  const search = document.getElementById("pln-rail-search");
  if (search) {
    let debounceTimer = null;
    search.oninput = () => {
      PLN_RAIL_SEARCH = search.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const list = document.getElementById("pln-rail-list");
        if (!list) return;
        list.innerHTML = buildPlannerRailCards(PLN_RAIL_TASKS, getRealToday());
        wirePlannerTaskSelection();
        wirePlannerTaskDrag();
        wirePlannerRailUrgencyControls(list);
      }, 120);
    };
  }
}

function plnSetSelectedTask(taskId) {
  PLN_SELECTED_TASK_ID = Number(taskId) === Number(PLN_SELECTED_TASK_ID) ? null : Number(taskId);
  document.querySelectorAll(".pln-rail-card").forEach(card => {
    const selected = Number(card.dataset.taskId) === Number(PLN_SELECTED_TASK_ID);
    card.classList.toggle("pln-rail-card-selected", selected);
    const button = card.querySelector(".pln-rail-plan-btn");
    if (button) button.textContent = selected ? "Cancel" : "Plan";
  });
  const hint = document.getElementById("pln-rail-drop-hint");
  if (hint) {
    hint.textContent = PLN_SELECTED_TASK_ID ? "Click an hour to schedule" : "Drop to schedule";
    hint.classList.toggle("pln-rail-drop-active", !!PLN_SELECTED_TASK_ID);
  }
}

function wirePlannerTaskSelection() {
  document.querySelectorAll(".pln-rail-plan-btn").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      plnSetSelectedTask(Number(btn.dataset.taskId));
    };
  });
}

async function plnScheduleTaskAtHour(task, hour) {
  if (!task || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const estMin = plnTaskEstimateMinutes(task);
  const estH = Math.max(1, Math.round(estMin / 60));
  const entry = {
    taskId: Number(task.id),
    title: task.title || "Task",
    estimateMin: estMin,
  };
  const hours = Array.from({ length: estH }, (_, offset) => hour + offset).filter(h => h < 24);
  const conflict = hours.some(h => plnGetScheduled(CURRENT_DATE, h).some(s => s.taskId !== entry.taskId)
    || plnTimedEventsForHour(CURRENT_DATE, h).length > 0);
  try {
    await api("/api/task-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: CURRENT_DATE, task_id: entry.taskId, hours }),
    });
  } catch (err) {
    showToast("Could not schedule task: " + errorMessage(err), "warn");
    return null;
  }
  plnRemoveScheduledTask(CURRENT_DATE, entry.taskId);
  hours.forEach(h => plnSetScheduled(CURRENT_DATE, h, [...plnGetScheduled(CURRENT_DATE, h), entry]));
  PLN_SELECTED_TASK_ID = null;
  refreshHourCanvas();
  updateTodayCompletionMeter();
  plnSetSelectedTask(null);
  const timeStr = `${String(hour).padStart(2, "0")}:00`;
  wgAwardXp(6, "scheduled");
  if (conflict) {
    showToast(`Conflict at ${timeStr} — “${entry.title}” overlaps another block (${estH}h)`, "warn");
  } else {
    showToast(`Scheduled ${entry.title} at ${timeStr} (${estH}h)`, "good");
  }
  return { entry, hours, conflict, estH };
}

function wirePlannerTaskDrag() {
  const hint = document.getElementById("pln-rail-drop-hint");
  let dragTask = null;
  let dropLine = null;

  document.querySelectorAll(".pln-rail-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      dragTask = {
        id: Number(card.dataset.taskId),
        estimate: Number(card.dataset.estimate) || 60,
        title: card.querySelector(".pln-rail-card-title")?.textContent || "",
      };
      PLN_DRAG_TASK_ID = dragTask.id;
      const estH = Math.max(1, Math.round(dragTask.estimate / 60));
      if (hint) {
        hint.textContent = `Drop to schedule ${estH}h`;
        hint.classList.add("pln-rail-drop-active");
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(dragTask.id));
    });
    card.addEventListener("dragend", () => {
      dragTask = null;
      PLN_DRAG_TASK_ID = null;
      if (hint) hint.classList.remove("pln-rail-drop-active");
      document.querySelectorAll(".pln-drop-target").forEach(el => el.classList.remove("pln-drop-target"));
      dropLine?.remove();
      dropLine = null;
    });
  });

  const wrap = document.getElementById("tdy-canvas-wrap");
  if (!wrap) return;

  wrap.addEventListener("dragover", e => {
    if (!dragTask) return;
    e.preventDefault();
    const hour = hourFromEventTarget(e.target);
    document.querySelectorAll(".pln-drop-target").forEach(el => el.classList.remove("pln-drop-target"));
    if (hour != null) {
      const cell = wrap.querySelector(`.tdy-hour-cell[data-hour="${hour}"]`);
      cell?.classList.add("pln-drop-target");
      if (!dropLine) {
        dropLine = document.createElement("div");
        dropLine.className = "pln-drop-line";
        wrap.style.position = "relative";
        wrap.appendChild(dropLine);
      }
      const row = wrap.querySelector(`.tdy-hour-row[data-hour-row="${hour}"]`);
      if (row) dropLine.style.top = row.offsetTop + "px";
    }
  });

  wrap.addEventListener("drop", async e => {
    if (!dragTask) return;
    e.preventDefault();
    const hour = hourFromEventTarget(e.target);
    if (hour == null) return;
    const task = PLN_RAIL_TASKS.find(t => t.id === dragTask.id) || dragTask;
    const result = await plnScheduleTaskAtHour(task, hour);
    if (!result) return;
    dropLine?.remove();
    dropLine = null;
    const cell = wrap.querySelector(`.tdy-hour-cell[data-hour="${hour}"]`);
    if (cell) {
      cell.classList.add("pln-drop-confirm");
      setTimeout(() => cell.classList.remove("pln-drop-confirm"), 600);
      const badge = cell.querySelector(".pln-task-badge:last-child");
      if (badge) {
        badge.classList.add("pln-task-badge-snap");
        setTimeout(() => badge.classList.remove("pln-task-badge-snap"), 500);
      }
    }
  });
}

let PLN_SAVE_WHISPER_TIMER = null;

function plnCountScheduledTasksToday() {
  const day = PLN_SCHEDULED[CURRENT_DATE] || {};
  const ids = new Set();
  Object.values(day).flat().forEach(s => {
    if (s && s.taskId != null) ids.add(s.taskId);
  });
  return ids.size;
}

function plnStatsFromSavedHours(hours) {
  let painted = 0;
  let blocks = 0;
  for (let h = 0; h < 24; h++) {
    const cell = hours[h] ?? hours[String(h)];
    if (!cell) continue;
    if (cell.category) painted++;
    if (cell.category || cell.note) blocks++;
  }
  return { painted, blocks, pct: Math.round((painted / 24) * 100) };
}

function plnPickSaveWhisper(hours, hadSavedData) {
  const { blocks, pct } = plnStatsFromSavedHours(hours);
  if (pct > 0) return `Day is ${pct}% mapped`;
  const taskCount = plnCountScheduledTasksToday();
  if (taskCount > 0) return `${taskCount} task${taskCount === 1 ? "" : "s"} now have a home`;
  if (!hadSavedData && blocks > 0) return "First honest block saved";
  return "Nothing fake added.";
}

function plnClearSaveWhisper() {
  if (PLN_SAVE_WHISPER_TIMER) {
    clearTimeout(PLN_SAVE_WHISPER_TIMER);
    PLN_SAVE_WHISPER_TIMER = null;
  }
  const el = document.getElementById("pln-save-whisper");
  if (el) el.remove();
}

function plnShowSaveWhisper(message) {
  plnClearSaveWhisper();
  const saveBtn = document.getElementById("save-day");
  if (!saveBtn || !message) return;
  const el = document.createElement("span");
  el.id = "pln-save-whisper";
  el.className = "pln-save-whisper";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = message;
  saveBtn.insertAdjacentElement("afterend", el);
  requestAnimationFrame(() => el.classList.add("pln-save-whisper-visible"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fadeMs = reducedMotion ? 0 : 400;
  PLN_SAVE_WHISPER_TIMER = setTimeout(() => {
    el.classList.remove("pln-save-whisper-visible");
    el.classList.add("pln-save-whisper-out");
    setTimeout(() => el.remove(), fadeMs || 1);
    PLN_SAVE_WHISPER_TIMER = null;
  }, 2500);
}

function wirePlannerSaveDay() {
  const saveBtn = document.getElementById("save-day");
  if (!saveBtn || saveBtn._plnSaveWired) return;
  saveBtn._plnSaveWired = true;
  const realToday = getRealToday();
  const isPastDay = CURRENT_DATE < realToday;
  const saveBtnLabel = isPastDay ? `Save ${CURRENT_DATE}` : "Save day";
  saveBtn.onclick = async () => {
    if (TODAY_AUTOSAVE_TIMER) {
      clearTimeout(TODAY_AUTOSAVE_TIMER);
      TODAY_AUTOSAVE_TIMER = null;
    }
    const { metrics, hours } = collectDaySavePayload();

    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;
    const hadSavedData = !!(TODAY_DAYS_WITH_DATA && TODAY_DAYS_WITH_DATA.has(CURRENT_DATE));
    try {
      const result = await api(`/api/day/${CURRENT_DATE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, hours }),
      });
      const taskNotes = (result.validated_tasks || []).map(v =>
        `<div class="pill" style="margin-top:6px;">auto-${v.status}: ${v.task.title} -- "${v.reason}"</div>`).join("");
      const box = document.getElementById("summary-box");
      if (box) {
        box.innerHTML = (result.summary ? `<div class="summary-box">${result.summary}</div>` : "") + taskNotes;
      }
      if (!TODAY_DAYS_WITH_DATA) await ensureTodayDaysCache();
      else if (dayRowHasMetricData({ ...metrics, notes: metrics.notes }) || Object.keys(hours).length > 0) {
        TODAY_DAYS_WITH_DATA.add(CURRENT_DATE);
      }
      const realToday = getRealToday();
      if (CURRENT_DATE !== realToday) {
        markLateLog(CURRENT_DATE);
        await postLateLogReceipt(CURRENT_DATE, realToday);
      }
      resetTodayDirty();
      const saveStats = plnStatsFromSavedHours(hours);
      const paintedHours = Math.min(12, saveStats.painted);
      const saveRect = saveBtn.getBoundingClientRect();
      wgAwardXp(20 + paintedHours, "day saved", {
        anchorPoint: { x: saveRect.left + saveRect.width / 2, y: saveRect.top + 32 },
      });
      if (saveStats.painted >= 2) {
        wgQuestProgress("paint6", 2);
        wgDispatchGameState();
      }
      if (saveStats.painted > 0) window.WaypointHabits?.observe("paint", saveStats.painted);
      plnShowSaveWhisper(plnPickSaveWhisper(hours, hadSavedData));
      updateDayGradeBadge();
    } finally {
      saveBtn.disabled = false;
      updatePlannerSaveBtn();
    }
  };
  updatePlannerSaveBtn();
}

function wirePlannerRailUrgencyControls(root = document) {
  root.querySelectorAll(".pln-rail-card .tsk-urgency-chip, .tsk-urgency-chip").forEach(btn => {
    if (!btn.closest(".pln-rail-card")) return;
    btn.onclick = e => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if (typeof TASK_URGENCY_EXPANDED !== "undefined") {
        if (TASK_URGENCY_EXPANDED.has(id)) TASK_URGENCY_EXPANDED.delete(id);
        else TASK_URGENCY_EXPANDED.add(id);
      }
      const detail = btn.closest(".tsk-urgency-wrap")?.querySelector(".tsk-urgency-breakdown");
      detail?.classList.toggle("tsk-urgency-breakdown-hidden");
    };
  });
  if (typeof tskWireImportanceBumps === "function") tskWireImportanceBumps(root);
}

function refreshPlannerRailTaskImportance(task) {
  const card = document.querySelector(`.pln-rail-card[data-task-id="${Number(task.id)}"]`);
  if (!card || typeof urgencyChipHtml !== "function") return;
  const wrap = card.querySelector(".tsk-urgency-wrap");
  if (wrap) wrap.outerHTML = urgencyChipHtml(task, getRealToday());
  const importance = typeof taskImportanceValue === "function" ? taskImportanceValue(task) : task.importance;
  card.querySelectorAll(".tsk-urgency-bump").forEach(btn => {
    btn.dataset.importance = String(importance);
  });
  const bumpWrap = card.querySelector(".tsk-urgency-bump-wrap");
  if (bumpWrap) bumpWrap.title = `Importance ${importance}/100`;
  const railColor = importanceColor(importance);
  card.style.borderLeft = `4px solid ${railColor}`;
  card.style.background = `color-mix(in srgb, ${railColor} 16%, var(--bg-shell))`;
  card.dataset.importance = String(importance);
  wirePlannerRailUrgencyControls(card);
}

function wirePlannerShell() {
  wirePlannerModeChips();
  wirePlannerStripNav();
  wirePlannerRailFilters();
  wirePlannerTaskSelection();
  wirePlannerTaskDrag();
  wirePlannerSaveDay();
  wirePlannerRailQuickAdd();
  wireTodayHourCanvas();
  wireFocusTimerControls();
  wireFocusTimerVisibility();
  if (focusTimerActive() && !document.hidden) startFocusTimerTick();
  [
    ["tdy-week-day", "day"],
    ["tdy-week-events", "events"],
    ["tdy-week-paint", "paint"],
  ].forEach(([id, mode]) => {
    document.getElementById(id)?.addEventListener("click", async () => {
      if (TODAY_DIRTY || TODAY_AUTOSAVE_TIMER || WEEK_PAINT_DIRTY.size) {
        await Promise.all([flushTodayAutosave(), flushWeekPaint()]);
      }
      if (mode === "paint") {
        if (typeof goToTab === "function") goToTab("Paint");
        else render();
        return;
      }
      if (mode === "day") {
        TODAY_WEEK_LAYERS.clear();
        TODAY_WEEK_MODE = "day";
      } else if (TODAY_WEEK_LAYERS.has(mode)) {
        TODAY_WEEK_LAYERS.delete(mode);
        TODAY_WEEK_MODE = TODAY_WEEK_LAYERS.size === 1 ? [...TODAY_WEEK_LAYERS][0] : (TODAY_WEEK_LAYERS.size ? "mix" : "day");
      } else {
        TODAY_WEEK_LAYERS.add(mode);
        TODAY_WEEK_MODE = TODAY_WEEK_LAYERS.size === 1 ? mode : "mix";
      }
      tdyPersistWeekLayers();
      render();
    });
  });
  wireWeekPaintSurface();

  document.getElementById("tdy-start-paint-btn")?.addEventListener("click", () => {
    if (CONFIG.categories[0]) armCategory(CONFIG.categories[0].key);
    document.getElementById("tdy-canvas-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("pln-eod-scroll-grid")?.addEventListener("click", e => {
    e.preventDefault();
    document.getElementById("tdy-canvas-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.getElementById("pln-select-done")?.addEventListener("click", () => {
    TDY_MODE = "paint";
    TDY_SELECT_SET.clear();
    document.getElementById("tdy-select-toggle")?.classList.remove("tdy-mode-active");
    refreshHourCanvas();
  });

  document.getElementById("pln-select-repeat")?.addEventListener("click", () => {
    if (!TDY_CLIPBOARD || !TDY_SELECT_SET.size) {
      showToast("Copy a selection first", "warn");
      return;
    }
    document.getElementById("tdy-select-paste")?.click();
  });

  document.getElementById("pln-select-delete")?.addEventListener("click", () => {
    TDY_SELECT_SET.forEach(h => setHourCell(h, { category: "", note: "" }));
    setTodayDirty();
    TDY_SELECT_SET.clear();
    refreshHourCanvas();
  });

  document.getElementById("pln-select-save")?.addEventListener("click", () => {
    document.getElementById("save-day")?.click();
  });

  document.getElementById("pln-select-assign")?.addEventListener("click", async () => {
    const open = PLN_RAIL_TASKS.filter(t => t.status !== "done");
    if (!open.length || !TDY_SELECT_SET.size) {
      showToast("Select hours and ensure tasks exist", "warn");
      return;
    }
    const title = open[0].title;
    const hours = [...TDY_SELECT_SET].sort((a, b) => a - b);
    const entry = { taskId: open[0].id, title, estimateMin: plnTaskEstimateMinutes(open[0]) };
    try {
      await api("/api/task-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: CURRENT_DATE, task_id: entry.taskId, hours }),
      });
    } catch (err) {
      showToast("Could not assign task: " + errorMessage(err), "warn");
      return;
    }
    plnRemoveScheduledTask(CURRENT_DATE, entry.taskId);
    hours.forEach(hour => plnSetScheduled(CURRENT_DATE, hour, [...plnGetScheduled(CURRENT_DATE, hour), entry]));
    refreshHourCanvas();
    showToast(`Assigned “${title}” to selected block`, "info");
  });

  wirePlannerRailUrgencyControls();
  tdyWireTimePick();
  tdyApplyHourDivisionTicks();
  tdyStartNowMarkerTicker();

  document.querySelector(".tdy-metrics-card")?.addEventListener("toggle", e => {
    tdySetMetricsOpen(e.currentTarget.open);
  });

  const shiftWeek = async dir => {
    const next = addDays(CURRENT_DATE, Number(dir) * 7);
    await tryNavigateTodayDate(next);
  };
  document.getElementById("tdy-week-prev")?.addEventListener("click", () => shiftWeek(-1));
  document.getElementById("tdy-week-next")?.addEventListener("click", () => shiftWeek(1));
  document.getElementById("tdy-week-surface-prev")?.addEventListener("click", () => shiftWeek(-1));
  document.getElementById("tdy-week-surface-next")?.addEventListener("click", () => shiftWeek(1));

  const sendNapkin = async btn => {
    if (!btn) return;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Sending…";
    try {
      const result = await tdySendNapkinIssuesToGit();
      const compiled = result?.compiled || {};
      const all = compiled.all ?? compiled.open ?? compiled.accepted ?? 0;
      showToast(
        all
          ? `Sent ${all} napkin note(s) to git (${compiled.accepted || 0} accepted)`
          : "Sent napkin issues to git",
        "good",
      );
    } catch (err) {
      showToast(errorMessage(err) || "Could not send napkin issues to git", "warn");
    }
    btn.disabled = false;
    btn.textContent = prev;
  };
  document.getElementById("tdy-napkin-git")?.addEventListener("click", e => sendNapkin(e.currentTarget));
  document.getElementById("tdy-napkin-git-tools")?.addEventListener("click", e => sendNapkin(e.currentTarget));

  document.getElementById("tdy-hour-div")?.addEventListener("change", e => {
    tdySetHourDivisionMinutes(e.target.value);
    tdyApplyHourDivisionTicks();
    refreshHourCanvas();
  });

  scrollStripToSelected();
}

function wireToday() {
  resetTodayDirty();
  ensureTodayAutosaveGuard();
  wirePlannerShell();
  wireTodayPowerFeatures();
  wireTodayDirtyTracking();
  wireLocalForecastCard();
  wirePulseCard(CURRENT_DATE === getRealToday());
  updateMetricPaintHints();
  updateDayGradeBadge();
  scrollStripToSelected();

  if (RIT_WIRE_CTX) {
    const { anchor, move, reward, tasks, calEvents, todayStr } = RIT_WIRE_CTX;
    wireRitualRunway(anchor, move, reward, tasks, calEvents, todayStr);
  } else {
    wireRitualContractDone();
  }

  document.querySelectorAll(".tdy-due-check").forEach(cb => {
    cb.onchange = async () => {
      await api(`/api/tasks/${cb.dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: cb.checked ? "done" : "todo" }),
      });
      render();
    };
  });

  const vibecodeBtn = document.getElementById("vibecode-btn");
  if (vibecodeBtn) vibecodeBtn.onclick = async () => {
    const input = document.getElementById("vibecode-input");
    const instruction = input.value.trim();
    if (!instruction) return;
    const btn = document.getElementById("vibecode-btn");
    btn.textContent = "...";
    btn.disabled = true;
    try {
      const result = await api("/api/categories/vibecode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      if (result.error) { window.alert(`Vibecode failed: ${result.error}`); return; }
      CONFIG = await api("/api/config");
      render();
    } finally {
      btn.textContent = "Apply";
      btn.disabled = false;
    }
  };

}

function hourFromEventTarget(target) {
  const cell = target.closest(".tdy-hour-cell");
  return cell ? Number(cell.dataset.hour) : null;
}

let tdyCanvasPointerUp = null;
let tdyCanvasSafetyTimer = null;

function wirePaintToolsAndWeekNav() {
  document.getElementById("tdy-select-toggle")?.addEventListener("click", () => {
    TDY_MODE = TDY_MODE === "select" ? "paint" : "select";
    TDY_SELECT_SET.clear();
    resetPaintState();
    document.getElementById("tdy-select-toggle")?.classList.toggle("tdy-mode-active", TDY_MODE === "select");
    refreshHourCanvas();
  });

  const armFromPalette = e => {
    const unpaintBtn = e.target.closest("#tdy-unpaint-toggle");
    if (unpaintBtn) {
      setUnpaintMode(!TDY_UNPAINT);
      return;
    }
    const chip = e.target.closest(".tdy-cat-chip[data-cat]");
    if (!chip) return;
    armCategory(chip.dataset.cat);
  };
  document.getElementById("tdy-cat-palette")?.addEventListener("click", armFromPalette);
  document.getElementById("pln-paint-only-palette")?.addEventListener("click", armFromPalette);

  document.getElementById("pln-paint-week-prev")?.addEventListener("click", () => {
    tryNavigateTodayDate(addDays(CURRENT_DATE, -7));
  });
  document.getElementById("pln-paint-week-next")?.addEventListener("click", () => {
    tryNavigateTodayDate(addDays(CURRENT_DATE, 7));
  });
  document.getElementById("pln-paint-week-select")?.addEventListener("change", e => {
    if (!e.target.value) return;
    tryNavigateTodayDate(e.target.value);
  });
}

function wirePaintTab() {
  if (ACTIVE_TAB !== "Paint") return;
  resetTodayDirty();
  if (typeof ensureTodayAutosaveGuard === "function") ensureTodayAutosaveGuard();
  wirePlannerShell();
}

function wireTodayHourCanvas() {
  wirePaintToolsAndWeekNav();
  const wrap = document.getElementById("tdy-canvas-wrap");
  if (!wrap) return;
  if (tdyCanvasSafetyTimer) {
    clearTimeout(tdyCanvasSafetyTimer);
    tdyCanvasSafetyTimer = null;
  }

  document.getElementById("tdy-select-paint")?.addEventListener("change", e => {
    const cat = e.target.value;
    if (!cat) return;
    if (TDY_SELECT_SET.size) {
      TDY_SELECT_SET.forEach(h => {
        const prev = getHourCell(h);
        setHourCell(h, { category: cat, note: prev.note });
      });
    }
    TDY_WEEK_SELECT.forEach(key => {
      const [date, hour] = key.split("|");
      applyWeekPaintCell(date, Number(hour), cat);
    });
    if (TDY_SELECT_SET.size || TDY_WEEK_SELECT.size) {
      setTodayDirty();
      refreshHourCanvas();
      updateTodayCompletionMeter();
    }
    e.target.value = "";
  });

  document.getElementById("tdy-select-clear")?.addEventListener("click", async () => {
    const hours = [...TDY_SELECT_SET];
    hours.forEach(h => setHourCell(h, { category: "", note: getHourCell(h).note }));
    const overlapping = (typeof PLN_CAL_EVENTS !== "undefined" ? PLN_CAL_EVENTS : []).filter(ev => {
      if ((ev.date || ev.start_date) !== CURRENT_DATE) return false;
      const startH = parseInt(String(ev.start_time || "0").split(":")[0], 10) || 0;
      const endH = parseInt(String(ev.end_time || String(startH + 1)).split(":")[0], 10) || startH + 1;
      return hours.some(h => h >= startH && h < Math.max(endH, startH + 1));
    });
    for (const ev of overlapping) {
      try { await api(`/api/calendar/${ev.id}`, { method: "DELETE" }); } catch (_) {}
    }
    setTodayDirty();
    refreshHourCanvas();
    if (overlapping.length && typeof showToast === "function") showToast(`Cleared ${hours.length} hour(s) and ${overlapping.length} event(s)`, "info");
  });

  document.getElementById("tdy-select-edit-events")?.addEventListener("click", () => {
    const hours = [...TDY_SELECT_SET];
    const overlapping = (typeof PLN_CAL_EVENTS !== "undefined" ? PLN_CAL_EVENTS : []).filter(ev => {
      if ((ev.date || ev.start_date) !== CURRENT_DATE) return false;
      const startH = parseInt(String(ev.start_time || "0").split(":")[0], 10) || 0;
      return hours.includes(startH);
    });
    const first = overlapping[0];
    if (!first) {
      if (typeof showToast === "function") showToast("No events in the selected hours", "info");
      return;
    }
    if (typeof plnOpenCommitmentEditor === "function") plnOpenCommitmentEditor("calendar", first.id);
    else if (typeof switchTab === "function") switchTab("Events");
  });

  document.getElementById("tdy-select-move-events")?.addEventListener("click", () => {
    const hours = [...TDY_SELECT_SET].sort((a, b) => a - b);
    tdyShiftEventsToHour(hours[0]);
  });

  document.getElementById("tdy-select-copy")?.addEventListener("click", () => {
    const data = {};
    TDY_SELECT_SET.forEach(h => { data[h] = { ...getHourCell(h) }; });
    TDY_CLIPBOARD = data;
    showToast(`Copied ${TDY_SELECT_SET.size} hour(s)`, "info");
  });

  document.getElementById("tdy-select-paste")?.addEventListener("click", () => {
    if (!TDY_CLIPBOARD || !Object.keys(TDY_CLIPBOARD).length) {
      showToast("Nothing to paste", "warn");
      return;
    }
    const keys = Object.keys(TDY_CLIPBOARD).map(Number).sort((a, b) => a - b);
    const minSel = Math.min(...TDY_SELECT_SET);
    keys.forEach((srcH, i) => {
      const dest = TDY_SELECT_SET.size ? minSel + i : srcH;
      if (dest >= 0 && dest < 24) {
        const clip = TDY_CLIPBOARD[srcH];
        setHourCell(dest, { category: clip.category, note: clip.note });
      }
    });
    setTodayDirty();
    refreshHourCanvas();
  });

  document.getElementById("tdy-select-cancel")?.addEventListener("click", () => {
    TDY_SELECT_SET.clear();
    updateSelectBar();
    refreshHourCanvas();
  });

  let dragAnchor = null;
  let lastPointer = { x: 0, y: 0 };
  let activePointerId = null;

  function clearPointerSafetyTimeout() {
    if (!tdyCanvasSafetyTimer) return;
    clearTimeout(tdyCanvasSafetyTimer);
    tdyCanvasSafetyTimer = null;
  }

  function releaseLostPointer() {
    clearPointerSafetyTimeout();
    clearTimeout(TDY_LONG_PRESS_TIMER);
    TDY_LONG_PRESS_TIMER = null;
    TDY_LONG_PRESS_HOUR = null;
    if (activePointerId != null && wrap.hasPointerCapture?.(activePointerId)) {
      wrap.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    dragAnchor = null;
    resetPaintState();
  }

  function armPointerSafetyTimeout() {
    clearPointerSafetyTimeout();
    tdyCanvasSafetyTimer = setTimeout(releaseLostPointer, 8000);
  }

  function applyPaintRange(lo, hi, category) {
    const cat = category || TDY_ARMED_CAT;
    if (!cat) return false;
    applyPaintRangeToCells(lo, hi, cat);
    return true;
  }

  function applySelectRange(lo, hi) {
    TDY_SELECT_SET.clear();
    hourRange(lo, hi).forEach(h => TDY_SELECT_SET.add(h));
    refreshHourCanvas();
    updatePaintGhost();
  }

  function onPointerDown(e) {
    if (!e.isPrimary || e.button !== 0) return;
    const hour = hourFromEventTarget(e.target);
    if (hour == null) return;
    e.preventDefault();
    if (PLN_SELECTED_TASK_ID != null) {
      const task = PLN_RAIL_TASKS.find(t => Number(t.id) === Number(PLN_SELECTED_TASK_ID));
      if (task) plnScheduleTaskAtHour(task, hour);
      return;
    }
    activePointerId = e.pointerId;
    wrap.setPointerCapture?.(activePointerId);
    armPointerSafetyTimeout();
    lastPointer = { x: e.clientX, y: e.clientY };
    const cell = getHourCell(hour);

    if (cell.category) {
      TDY_LONG_PRESS_HOUR = hour;
      clearTimeout(TDY_LONG_PRESS_TIMER);
      TDY_LONG_PRESS_TIMER = setTimeout(() => {
        if (TDY_LONG_PRESS_HOUR !== hour) return;
        const anchor = document.querySelector(`.tdy-hour-cell[data-hour="${hour}"]`);
        if (anchor) showSplitPopover(hour, anchor);
        TDY_LONG_PRESS_HOUR = null;
        resetPaintState();
      }, TDY_LONG_PRESS_MS);
    }

    if (TDY_MODE === "select") {
      dragAnchor = hour;
      applySelectRange(hour, hour);
      return;
    }

    TDY_PAINT_PHASE = "armed";
    TDY_PAINT_ANCHOR = hour;
    TDY_PAINT_RANGE = [hour, hour];
    TDY_PAINT_ORIGIN = { x: e.clientX, y: e.clientY };
    updatePaintGhost();
  }

  function onPointerMove(e) {
    if (e.pointerId !== activePointerId || !e.isPrimary) return;
    if (e.pointerType === "mouse" && (e.buttons & 1) === 0) return;
    armPointerSafetyTimeout();
    e.preventDefault();
    lastPointer = { x: e.clientX, y: e.clientY };
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const hour = hourFromEventTarget(target);

    if (TDY_MODE === "select" && dragAnchor != null && hour != null) {
      applySelectRange(dragAnchor, hour);
      return;
    }

    if (TDY_PAINT_PHASE === "idle") return;
    const moved = TDY_PAINT_ORIGIN
      ? Math.hypot(e.clientX - TDY_PAINT_ORIGIN.x, e.clientY - TDY_PAINT_ORIGIN.y)
      : 0;
    if (moved >= 8) {
      clearTimeout(TDY_LONG_PRESS_TIMER);
      TDY_LONG_PRESS_TIMER = null;
      TDY_LONG_PRESS_HOUR = null;
    }
    if (TDY_PAINT_PHASE === "armed" && (moved >= 4 || (hour != null && hour !== TDY_PAINT_ANCHOR))) {
      TDY_PAINT_PHASE = "painting";
      lockCanvasScroll(true);
    }
    if ((TDY_PAINT_PHASE === "armed" || TDY_PAINT_PHASE === "painting") && hour != null) {
      TDY_PAINT_RANGE = [TDY_PAINT_ANCHOR, hour];
      updatePaintGhost();
    }
  }

  function onPointerUp(e) {
    if (e.type === "pointercancel") {
      releaseLostPointer();
      return;
    }
    if (e.pointerId !== activePointerId) return;
    clearPointerSafetyTimeout();
    clearTimeout(TDY_LONG_PRESS_TIMER);
    TDY_LONG_PRESS_TIMER = null;
    TDY_LONG_PRESS_HOUR = null;
    if (wrap.hasPointerCapture?.(activePointerId)) wrap.releasePointerCapture(activePointerId);
    activePointerId = null;
    if (TDY_MODE === "select") {
      dragAnchor = null;
      return;
    }
    if (TDY_PAINT_PHASE === "armed" || TDY_PAINT_PHASE === "painting") {
      const range = TDY_PAINT_RANGE;
      const px = e?.clientX ?? lastPointer.x;
      const py = e?.clientY ?? lastPointer.y;
      if (range) {
        if (TDY_UNPAINT) {
          applyUnpaintRangeToCells(range[0], range[1]);
        } else if (TDY_ARMED_CAT) {
          applyPaintRange(range[0], range[1], TDY_ARMED_CAT);
        } else {
          showCategoryRadial(px, py, cat => applyPaintRange(range[0], range[1], cat));
        }
      }
    }
    resetPaintState();
  }

  wrap.addEventListener("pointerdown", onPointerDown);
  wrap.addEventListener("pointermove", onPointerMove);
  wrap.addEventListener("contextmenu", e => {
    e.preventDefault();
    tdyStopPaint();
  });
  if (tdyCanvasPointerUp) {
    document.removeEventListener("pointerup", tdyCanvasPointerUp);
    document.removeEventListener("pointercancel", tdyCanvasPointerUp);
  }
  tdyCanvasPointerUp = onPointerUp;
  document.addEventListener("pointerup", tdyCanvasPointerUp);
  document.addEventListener("pointercancel", tdyCanvasPointerUp);

  wireHourCellInteractions();
  tdyApplyHourDivisionTicks(wrap);
  tdyPaintNowMarker();

  wrap.addEventListener("dblclick", e => {
    const hour = hourFromEventTarget(e.target);
    if (hour == null) return;
    e.preventDefault();
    clearTimeout(TDY_LONG_PRESS_TIMER);
    const anchor = e.target.closest(".tdy-hour-cell");
    const cell = getHourCell(hour);
    if (cell.category) showSplitPopover(hour, anchor);
    else showNotePopover(hour, anchor);
  });

  document.removeEventListener("keydown", tdyHotkeyHandler);
  document.addEventListener("keydown", tdyHotkeyHandler);
}

function tdyHotkeyHandler(e) {
  if (!["Today", "Calendar", "Tasks"].includes(ACTIVE_TAB)) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 9 && CONFIG.categories[n - 1]) {
    armCategory(CONFIG.categories[n - 1].key);
    if (TDY_PAINT_PHASE === "armed" || TDY_PAINT_PHASE === "painting") updatePaintGhost();
  }
  if (e.key === "0") {
    setUnpaintMode(!TDY_UNPAINT);
    if (TDY_PAINT_PHASE === "armed" || TDY_PAINT_PHASE === "painting") updatePaintGhost();
  }
}

// Generic attachments widget (used by the task edit panel). Points at the shared
// /api/attachments endpoints -- entity_type/entity_id keep it reusable for any entity.
async function loadTaskAttachments(taskId) {
  const box = document.getElementById(`task-attachments-${taskId}`);
  if (!box) return;
  const files = await api(`/api/attachments?entity_type=task&entity_id=${taskId}`);
  const rows = files.map(f => `
    <span class="pill" style="display:inline-flex; align-items:center; gap:4px;">
      <a href="/api/attachments/${f.id}/file" target="_blank" rel="noopener">${f.filename}</a>
      <button type="button" class="task-attachment-delete" data-attachment="${f.id}" data-task="${taskId}" style="border:none; background:none; cursor:pointer; color:inherit; padding:0;">&times;</button>
    </span>`).join(" ");
  box.innerHTML = `
    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:6px 0;">
      ${rows || '<span class="stub" style="font-size:12px;">No files yet.</span>'}
      <input type="file" id="task-attachment-input-${taskId}" style="font-size:11px; max-width:220px;">
    </div>`;
  document.getElementById(`task-attachment-input-${taskId}`).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entity_type", "task");
    formData.append("entity_id", taskId);
    await fetch("/api/attachments", { method: "POST", body: formData });
    loadTaskAttachments(taskId);
  };
  box.querySelectorAll(".task-attachment-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this attachment?")) return;
      await api(`/api/attachments/${btn.dataset.attachment}`, { method: "DELETE" });
      loadTaskAttachments(taskId);
    };
  });
}
