// --- Tasks ---------------------------------------------------------

const URGENCY_CLASS = { low: "status-good", medium: "status-warning", high: "status-serious", critical: "status-critical" };
const URGENCY_IMPORTANCE = { low: 0.35, medium: 0.55, high: 0.8, critical: 1.0 };
/** Red scale: more urgent → more red (no gray shells). */
const URGENCY_COLOR = {
  low: "#c4a882",
  medium: "#e08a4a",
  high: "#e0523a",
  critical: "#c91818",
};
const QUICK_URGENCY = { critical: "critical", high: "high", med: "medium", medium: "medium", low: "low" };
const TASK_IMPORTANCE_ACCEL_GAP_MS = 700;
const TASK_IMPORTANCE_ACCEL_STEPS = [1, 5, 10, 20, 30];
const WEEKDAY_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

let TASK_SEARCH = "";
let OPEN_TASK_EDIT = new Set();
let TASK_VIEW = "list"; // "list" | "weekly"
let TASK_FREEFORM_TEXT = "";
let TASK_FREEFORM_PROPOSALS = null; // null = capture box shown; array = review-before-commit proposals
let TASK_DELIVERABLES_WEEK = 0; // 0 = this week, 1 = next week
let TASK_SORT_MODE = (() => {
  try {
    const saved = localStorage.getItem("taskSortMode");
    if (["urgent", "added", "deadline", "manual"].includes(saved)) return saved;
  } catch (_) {}
  return "urgent";
})(); // "urgent" | "added" | "deadline" | "manual"
let TASK_PROJECT_FILTER = "";
let TASK_FREEFORM_OPEN = false;
let TASK_DONE_EXPANDED = false;
let TASK_DAY_FILTER = null;
let TASK_URGENCY_EXPANDED = new Set();
let TSK_CACHED_TASKS = [];
let TSK_CACHED_PROJECTS = [];
let TASK_NEW_DEADLINE_DISMISSED = false;
let TASK_NEW_DUE_TOUCHED = false;
let TASK_KEYWORD_FILTER = "";
let TASK_BUCKET_FILTER = "";
let TASK_SHOW_DEFERRED = false;
let TSK_DATE_UNDO = null;
let TSK_FOCUSED_ID = null;
let TSK_CACHED_BETS = [];
const TASK_IMPORTANCE_ACCEL_STATE = new Map();
const TASK_IMPORTANCE_SAVE_STATE = new Map();
const TASK_KEYWORD_KEYS = ["speaking", "writing", "code", "email", "aleks", "homework", "meeting"];
const TASK_BUCKETS = ["school", "work", "life"];
const TASK_KEYWORD_RES = {
  speaking: /\b(speak|speaking|talk|call|phone|present|presentation|pitch|interview|oral)\b/i,
  writing: /\b(write|writing|essay|draft|paper|blog)\b/i,
  code: /\b(code|coding|debug|program|repo|pr\b|leetcode)\b/i,
  email: /\b(email|inbox|reply|mail)\b/i,
  aleks: /\b(aleks)\b/i,
  homework: /\b(homework|\bhw\b|assignment|problem set)\b/i,
  meeting: /\b(meeting|standup|1:1|sync)\b/i,
};

function tskToast(message, kind = "info") {
  if (typeof showToast === "function") showToast(message, kind);
}

function tskMergeTaskCache(task) {
  const idx = TSK_CACHED_TASKS.findIndex(t => t.id === task.id);
  if (idx >= 0) TSK_CACHED_TASKS[idx] = { ...TSK_CACHED_TASKS[idx], ...task };
  else TSK_CACHED_TASKS.push(task);
  if (typeof PLN_RAIL_TASKS !== "undefined" && Array.isArray(PLN_RAIL_TASKS)) {
    const plannerIdx = PLN_RAIL_TASKS.findIndex(t => t.id === task.id);
    if (plannerIdx >= 0) PLN_RAIL_TASKS[plannerIdx] = { ...PLN_RAIL_TASKS[plannerIdx], ...task };
  }
}

function tskRemoveFromCache(taskId) {
  TSK_CACHED_TASKS = TSK_CACHED_TASKS.filter(t => t.id !== taskId);
}

function tskRefreshRadarStrip() {
  const todayStr = taskTodayStr();
  const html = buildUrgencyPinnedPanel(TSK_CACHED_TASKS, todayStr);
  const existing = document.querySelector(".tsk-urgency-radar");
  if (html) {
    if (existing) {
      existing.outerHTML = html;
    } else {
      const shell = document.querySelector(".tsk-list-shell");
      if (shell) shell.insertAdjacentHTML("beforebegin", html);
    }
    document.querySelectorAll(".tsk-radar-item").forEach(item => {
      item.onclick = () => tskScrollToTask(Number(item.dataset.scrollTask));
    });
  } else if (existing) {
    existing.remove();
  }
}

function tskScrollToTask(id) {
  OPEN_TASK_EDIT.add(id);
  const panel = document.getElementById(`task-edit-${id}`);
  const btn = document.querySelector(`.task-edit-toggle[data-id="${id}"]`);
  if (panel) panel.style.display = "";
  if (btn) btn.textContent = "Close";
  loadTaskAttachments(id);
  requestAnimationFrame(() => {
    document.getElementById(`task-row-wrap-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function tskPatchTaskRow(task, projects) {
  const todayStr = taskTodayStr();
  const wrap = document.getElementById(`task-row-wrap-${task.id}`);
  if (!wrap) return;
  const row = wrap.querySelector(".task-row");
  if (!row) return;
  const isDone = task.status === "done";

  const titleEl = row.querySelector(".task-title");
  if (titleEl) titleEl.textContent = task.title || "";
  const descriptionEl = wrap.querySelector(".tsk-row-description");
  if (descriptionEl) {
    descriptionEl.textContent = task.description || "";
    descriptionEl.hidden = !task.description;
  }

  applyTaskRowUrgencyStyle(row, task.urgency, isDone);
  row.dataset.urgency = task.urgency || "medium";

  row.querySelectorAll(".tsk-urgency-bump").forEach(bumpBtn => {
    bumpBtn.dataset.urgency = task.urgency || "medium";
    bumpBtn.dataset.importance = String(taskImportanceValue(task));
  });
  const bumpWrap = row.querySelector(".tsk-urgency-bump-wrap");
  if (bumpWrap) bumpWrap.title = `Importance ${taskImportanceValue(task)}/100`;

  let urgencyWrap = row.querySelector(".tsk-urgency-wrap");
  if (taskIsOpen(task)) {
    const chipHtml = urgencyChipHtml(task, todayStr);
    if (urgencyWrap) urgencyWrap.outerHTML = chipHtml;
    else {
      const anchor = row.querySelector(".tsk-project-tag") || row.querySelector(".tsk-cat-chip") || row.querySelector(".task-title");
      anchor?.insertAdjacentHTML("afterend", chipHtml);
    }
    const newChip = row.querySelector(".tsk-urgency-chip");
    if (newChip) {
      newChip.onclick = e => {
        e.stopPropagation();
        const tid = Number(task.id);
        if (TASK_URGENCY_EXPANDED.has(tid)) TASK_URGENCY_EXPANDED.delete(tid);
        else TASK_URGENCY_EXPANDED.add(tid);
        row.querySelector(`.tsk-urgency-breakdown[data-id="${tid}"]`)?.classList.toggle("tsk-urgency-breakdown-hidden");
      };
    }
  } else if (urgencyWrap) {
    urgencyWrap.remove();
  }

  const oldProj = row.querySelector(".tsk-project-tag");
  const projHtml = taskProjectTagHtml(task.project_id, projects);
  if (projHtml) {
    if (oldProj) oldProj.outerHTML = projHtml;
    else row.querySelector(".tsk-cat-chip, .task-title")?.insertAdjacentHTML("afterend", projHtml);
  } else if (oldProj) {
    oldProj.remove();
  }

  let dueChip = row.querySelector(".tsk-due-chip");
  if (task.due_date) {
    const due = new Date(task.due_date + "T00:00:00");
    const today = new Date(todayStr + "T00:00:00");
    const diffDays = Math.round((due - today) / 86400000);
    const dueClass = taskDueChipClass(diffDays);
    const dueLabel = diffDays < 0 ? "overdue" : diffDays === 0 ? "today" : task.due_date.slice(5);
    const dueHtml = `<span class="tsk-due-chip ${dueClass}">${escapeHtml(dueLabel)}</span>`;
    if (dueChip) dueChip.outerHTML = dueHtml;
    else row.querySelector(".tsk-urgency-wrap, .tsk-project-tag, .task-title")?.insertAdjacentHTML("afterend", dueHtml);
  } else if (dueChip) {
    dueChip.remove();
  }

  const fill = row.querySelector(".tsk-progress-sliver-fill");
  if (fill) fill.style.background = URGENCY_COLOR[task.urgency] || "var(--border)";

  const editTitle = wrap.querySelector(`.task-edit-title[data-id="${task.id}"]`);
  if (editTitle) editTitle.value = task.title || "";
  const editNotes = wrap.querySelector(`.task-edit-notes[data-id="${task.id}"]`);
  if (editNotes) editNotes.value = task.notes || "";
  const editDescription = wrap.querySelector(`.task-edit-description[data-id="${task.id}"]`);
  if (editDescription) editDescription.value = task.description || "";
  const editUrgency = wrap.querySelector(`.task-edit-urgency[data-id="${task.id}"]`);
  if (editUrgency) editUrgency.value = task.urgency || "medium";
  const editDue = wrap.querySelector(`.task-edit-due[data-id="${task.id}"]`);
  if (editDue) editDue.value = task.due_date || "";
  const editTotal = wrap.querySelector(`.task-edit-total[data-id="${task.id}"]`);
  if (editTotal) editTotal.value = task.progress_total ?? "";
  const editProject = wrap.querySelector(`.task-edit-project[data-id="${task.id}"]`);
  if (editProject) editProject.value = task.project_id ?? "";
}

function tskRemoveTaskRow(taskId) {
  document.getElementById(`task-row-wrap-${taskId}`)?.remove();
  tskRemoveFromCache(taskId);
  tskRefreshRadarStrip();
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

function tskBumpDoneToday() {
  const today = taskTodayStr();
  let data = null;
  try { data = JSON.parse(localStorage.getItem("tskDoneToday") || "null"); } catch { /* ignore */ }
  if (!data || data.date !== today) data = { date: today, count: 0 };
  data.count += 1;
  localStorage.setItem("tskDoneToday", JSON.stringify(data));
  return data.count;
}

function tskShowComboFlourish(checkbox) {
  const row = checkbox.closest(".task-row");
  if (!row) return;
  row.style.position = "relative";
  const el = document.createElement("span");
  el.className = "tsk-combo-flourish";
  el.textContent = "COMBO ×3";
  row.appendChild(el);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(() => el.remove(), reduced ? 1 : 400);
}

function tskOnHighUrgencyTriumph(task) {
  if (!task || task.status !== "done") return;
  const todayStr = taskTodayStr();
  const score = computeTaskUrgency(task, todayStr).score;
  const high = task.urgency === "critical" || task.urgency === "high" || score >= 80;
  if (!high) return;
  const title = task.urgency === "critical" ? "CRITICAL CLEARED" : "HIGH STAKES DONE";
  const subtitle = (task.title || "Task complete").slice(0, 80);
  if (typeof window.momentOfTriumph === "function") {
    window.momentOfTriumph({ title, subtitle, workspace: "plan" });
  } else {
    tskToast(task.urgency === "critical" ? "Critical task cleared!" : "High-urgency win!", "good");
  }
}

function tskOnTaskMarkedDone(checkbox) {
  wgAwardXp(12, "task done");
  wgQuestProgress("tasks3");
  const count = tskBumpDoneToday();
  if (count === 3) {
    tskShowComboFlourish(checkbox);
    wgAwardXp(15, "combo");
  }
}

function tskMaybeAwardPowerCapture() {
  const today = taskTodayStr();
  let data = null;
  try { data = JSON.parse(localStorage.getItem("tskPowerCaptureDay") || "null"); } catch { /* ignore */ }
  if (!data || data.date !== today) data = { date: today, count: 0 };
  if (data.count >= 5) return;
  data.count += 1;
  localStorage.setItem("tskPowerCaptureDay", JSON.stringify(data));
  wgAwardXp(3, "power capture");
}

function taskAddDays(isoDate, delta) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function taskSuggestedDeadline(urgency, fromDate = taskTodayStr()) {
  const days = { critical: 0, high: 2, medium: 7, low: 30 };
  return taskAddDays(fromDate, days[urgency] ?? days.medium);
}

function taskProximityScore(dueDate, todayStr) {
  if (!dueDate) return 0.15;
  const diffDays = Math.round((new Date(dueDate + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
  if (diffDays <= 0) return 1;
  if (diffDays >= 14) return 0;
  const t = 1 - diffDays / 14;
  return t * t;
}

function taskOverduePressure(dueDate, todayStr) {
  if (!dueDate) return 0;
  const diffDays = Math.round((new Date(dueDate + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
  if (diffDays >= 0) return 0;
  return Math.min(1, Math.abs(diffDays) / 5);
}

function taskImportanceValue(task) {
  if (task?.importance != null && task.importance !== "") {
    const value = Number(task.importance);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  }
  return Math.round(100 * (URGENCY_IMPORTANCE[task?.urgency] || URGENCY_IMPORTANCE.medium));
}

function nextTaskImportanceDelta(taskId, direction, now = Date.now()) {
  const previous = TASK_IMPORTANCE_ACCEL_STATE.get(taskId);
  const continuing = previous
    && previous.direction === direction
    && now - previous.clickedAt <= TASK_IMPORTANCE_ACCEL_GAP_MS;
  const stepIndex = continuing
    ? Math.min(previous.stepIndex + 1, TASK_IMPORTANCE_ACCEL_STEPS.length - 1)
    : 0;
  TASK_IMPORTANCE_ACCEL_STATE.set(taskId, { direction, clickedAt: now, stepIndex });
  const magnitude = TASK_IMPORTANCE_ACCEL_STEPS[stepIndex];
  return direction === "down" ? -magnitude : magnitude;
}

function taskImportanceBumpHtml(task) {
  const importance = taskImportanceValue(task);
  return `<span class="tsk-urgency-bump-wrap" title="Importance ${importance}/100">
    <button type="button" class="tsk-urgency-bump tsk-urgency-bump-up" data-id="${task.id}" data-urgency="${escapeHtml(task.urgency || "medium")}" data-importance="${importance}" data-dir="up" title="Increase importance">&#8593;</button>
    <button type="button" class="tsk-urgency-bump tsk-urgency-bump-down" data-id="${task.id}" data-urgency="${escapeHtml(task.urgency || "medium")}" data-importance="${importance}" data-dir="down" title="Decrease importance">&#8595;</button>
  </span>`;
}

function tskCachedTask(taskId) {
  if (typeof PLN_RAIL_TASKS !== "undefined" && Array.isArray(PLN_RAIL_TASKS)) {
    const plannerTask = PLN_RAIL_TASKS.find(t => Number(t.id) === Number(taskId));
    if (plannerTask) return plannerTask;
  }
  return TSK_CACHED_TASKS.find(t => Number(t.id) === Number(taskId)) || null;
}

function tskTaskBlocked(task) {
  const pre = Number(task?.prerequisite_id || 0);
  if (!pre) return false;
  const parent = TSK_CACHED_TASKS.find(t => Number(t.id) === pre) || tskCachedTask(pre);
  return !!(parent && parent.status !== "done");
}

function tskOpenBetFor(taskId) {
  return (TSK_CACHED_BETS || []).find(b => Number(b.task_id) === Number(taskId) && b.status === "open") || null;
}

async function tskForfeitMissed(taskId, due, coins) {
  const stake = Math.max(1, Number(coins) || 10);
  const result = await api("/api/bets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: Number(taskId), due_date: due, coins: stake }),
  });
  try {
    await api("/api/bets/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (_) {}
  return result;
}

function tskApplyImportanceLocally(task) {
  tskMergeTaskCache(task);
  tskPatchTaskRow(task, TSK_CACHED_PROJECTS);
  if (typeof refreshPlannerRailTaskImportance === "function") refreshPlannerRailTaskImportance(task);
}

async function tskPersistTaskImportance(taskId, state) {
  if (state.inFlight) return;
  state.inFlight = true;
  try {
    while (state.persisted !== state.target) {
      const sent = state.target;
      const updated = await api(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: sent }),
      });
      if (updated?.importance == null || taskImportanceValue(updated) !== sent) {
        throw new Error("Importance was not persisted; restart Waypoint to apply the task migration.");
      }
      state.persisted = taskImportanceValue(updated);
      tskApplyImportanceLocally(state.target === sent ? updated : { ...updated, importance: state.target });
    }
  } catch (err) {
    state.target = state.persisted;
    const task = tskCachedTask(taskId);
    if (task) tskApplyImportanceLocally({ ...task, importance: state.persisted });
    tskToast(errorMessage(err), "warn");
  } finally {
    state.inFlight = false;
    if (state.persisted !== state.target) tskPersistTaskImportance(taskId, state);
  }
}

function tskBumpTaskImportance(taskId, direction) {
  const task = tskCachedTask(taskId);
  if (!task) return;
  let state = TASK_IMPORTANCE_SAVE_STATE.get(taskId);
  if (!state) {
    const current = taskImportanceValue(task);
    state = { persisted: current, target: current, inFlight: false };
    TASK_IMPORTANCE_SAVE_STATE.set(taskId, state);
  }
  const delta = nextTaskImportanceDelta(taskId, direction);
  const next = Math.max(0, Math.min(100, state.target + delta));
  if (next === state.target) return;
  state.target = next;
  tskApplyImportanceLocally({ ...task, importance: next });
  tskPersistTaskImportance(taskId, state);
}

function tskWireImportanceBumps(root = document) {
  root.querySelectorAll(".tsk-urgency-bump").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      tskBumpTaskImportance(Number(btn.dataset.id), btn.dataset.dir || "up");
    };
  });
}

function computeTaskUrgency(t, todayStr) {
  const importanceValue = taskImportanceValue(t);
  const importance = importanceValue / 100;
  const proximity = taskProximityScore(t.due_date, todayStr);
  const overdue = taskOverduePressure(t.due_date, todayStr);
  const impContrib = Math.round(100 * 0.55 * importance * importance);
  const proxContrib = Math.round(100 * 0.35 * proximity * proximity);
  const ovdContrib = Math.round(100 * 0.10 * overdue);
  const score = Math.round(100 * (0.55 * importance * importance + 0.35 * proximity * proximity + 0.10 * overdue));
  return {
    score,
    impContrib,
    proxContrib,
    ovdContrib,
    importanceValue,
    breakdown: `importance² ${impContrib} (level ${importanceValue}) + deadline² ${proxContrib} + overdue ${ovdContrib} = ${score}`,
  };
}

function taskProximityLabel(t, todayStr) {
  const u = computeTaskUrgency(t, todayStr);
  if (!t.due_date) return "";
  const diffDays = Math.round((new Date(t.due_date + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
  if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d: capped +${u.ovdContrib}`;
  if (diffDays === 0) return `Due today: +${u.proxContrib}`;
  if (diffDays === 1) return `Due tomorrow: +${u.proxContrib}`;
  return `Due in ${diffDays}d: +${u.proxContrib}`;
}

function taskMatchesDayFilter(t) {
  if (!TASK_DAY_FILTER) return true;
  return t.due_date === TASK_DAY_FILTER;
}

function buildTaskDayFilterStrip(todayStr) {
  const allSelected = !TASK_DAY_FILTER;
  const chips = [`<button type="button" class="tsk-day-chip${allSelected ? " tsk-day-chip-active" : ""}" data-day="">All</button>`];
  for (let i = 0; i < 7; i++) {
    const date = taskAddDays(todayStr, i);
    const label = i === 0 ? "Today" : date.slice(5);
    const active = TASK_DAY_FILTER === date;
    chips.push(`<button type="button" class="tsk-day-chip${active ? " tsk-day-chip-active" : ""}" data-day="${escapeHtml(date)}" title="Drop a task here to set due_date">${escapeHtml(label)}</button>`);
  }
  return `<div class="tsk-day-filter">${chips.join("")}</div>`;
}

function urgencyChipHtml(t, todayStr) {
  const u = computeTaskUrgency(t, todayStr);
  const expanded = TASK_URGENCY_EXPANDED.has(t.id);
  const total = Math.max(u.impContrib + u.proxContrib + u.ovdContrib, 1);
  const segs = [
    { w: u.impContrib / total, color: "var(--status-serious)" },
    { w: u.proxContrib / total, color: "var(--accent)" },
    { w: u.ovdContrib / total, color: "var(--status-critical)" },
  ].map(s => `<span class="tsk-urgency-seg" style="flex:${s.w}; background:${s.color};"></span>`).join("");
  return `<div class="tsk-urgency-wrap">
    <button type="button" class="tsk-urgency-chip" data-id="${t.id}" title="Urgency ${u.score}">
      <span class="tsk-urgency-chip-label">Urgency ${u.score}</span>
      <span class="tsk-urgency-bar">${segs}</span>
    </button>
    <div class="tsk-urgency-breakdown tsk-urgency-breakdown-hidden" hidden data-id="${t.id}"></div>
  </div>`;
}

function taskTodayStr() {
  return localYmd();
}

// Monday-based week-start (YYYY-MM-DD) for a YYYY-MM-DD date string -- used to group tasks by
// due-date week in the "Weekly" view.
function taskWeekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return localYmd(d);
}

function taskWeekLabel(startStr, todayStartStr) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const range = `${fmt(start)}–${fmt(end)}`;
  const weeksDiff = Math.round((start - new Date(todayStartStr + "T00:00:00")) / (7 * 86400000));
  if (weeksDiff === 0) return `This week (${range})`;
  if (weeksDiff === 1) return `Next week (${range})`;
  if (weeksDiff === -1) return `Last week (${range})`;
  if (weeksDiff > 1) return `In ${weeksDiff} weeks (${range})`;
  return `${Math.abs(weeksDiff)} weeks ago (${range})`;
}

function taskWeekDayColumns(weekOffset) {
  const start = new Date(taskWeekStart(taskTodayStr()) + "T00:00:00");
  start.setDate(start.getDate() + weekOffset * 7);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { label, date: localYmd(d) };
  });
}

function taskDateInWeek(dateStr, weekStartStr) {
  const start = new Date(weekStartStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const d = new Date(dateStr + "T00:00:00");
  return d >= start && d <= end;
}

function nextWeekdayDate(dowStr) {
  const target = WEEKDAY_NAMES[dowStr.toLowerCase().slice(0, 3)];
  if (target == null) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let diff = target - today.getDay();
  if (diff < 0) diff += 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return localYmd(d);
}

function matchCategoryToken(tok) {
  const lower = tok.toLowerCase();
  return (CONFIG.categories || []).find(c =>
    c.key.toLowerCase() === lower || c.label.toLowerCase() === lower
  );
}

// Inline power syntax for the main add-title field: !urgency, @due / @weekday, #category.
function parseQuickAddTitle(raw) {
  let title = raw.trim();
  let urgency = null;
  let due_date = null;
  let category = null;

  title = title.replace(/!(critical|high|med|medium|low)\b/gi, (_, u) => {
    urgency = QUICK_URGENCY[u.toLowerCase()] || urgency;
    return "";
  });

  title = title.replace(/@due:(\d{4}-\d{2}-\d{2})\b/gi, (_, d) => {
    due_date = d;
    return "";
  });

  title = title.replace(/@(mon|tue|wed|thu|fri|sat|sun)\b/gi, (_, dow) => {
    due_date = nextWeekdayDate(dow);
    return "";
  });

  title = title.replace(/#([\w][\w-]*)\b/g, (match, catTok) => {
    const found = matchCategoryToken(catTok);
    if (found) {
      category = found.key;
      return "";
    }
    return match;
  });

  return { title: title.replace(/\s+/g, " ").trim(), urgency, due_date, category };
}

function taskFocusMeta(t, todayStr) {
  const u = computeTaskUrgency(t, todayStr);
  return { score: u.score, label: u.breakdown };
}

function taskIsOpen(t) {
  return t.status === "todo" || t.status === "partial";
}

function tskSortTasks(tasks, mode = TASK_SORT_MODE, todayStr = taskTodayStr()) {
  const createdValue = task => String(task.created_at || "").trim();
  const urgentCompare = (a, b) => {
    const score = taskFocusMeta(b, todayStr).score - taskFocusMeta(a, todayStr).score;
    return score || createdValue(b).localeCompare(createdValue(a)) || Number(b.id || 0) - Number(a.id || 0);
  };
  return [...tasks].sort((a, b) => {
    if (mode === "manual") {
      return (Number(a.sort_order || 0) - Number(b.sort_order || 0))
        || (Number(a.id || 0) - Number(b.id || 0));
    }
    if (mode === "added") {
      const created = createdValue(b).localeCompare(createdValue(a));
      return created || Number(b.id || 0) - Number(a.id || 0);
    }
    if (mode === "deadline") {
      if (!a.due_date && !b.due_date) return urgentCompare(a, b);
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date) || urgentCompare(a, b);
    }
    return urgentCompare(a, b);
  });
}

function tskNormalizeTitle(title) {
  return String(title || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tskFindLocalDuplicates(title, tasks = TSK_CACHED_TASKS) {
  const normalized = tskNormalizeTitle(title);
  if (!normalized) return [];
  const wanted = new Set(normalized.split(/\s+/));
  return tasks.filter(task => {
    if (!taskIsOpen(task)) return false;
    const candidate = tskNormalizeTitle(task.title);
    if (!candidate) return false;
    if (candidate === normalized) return true;
    if (Math.min(candidate.length, normalized.length) >= 8
        && (candidate.includes(normalized) || normalized.includes(candidate))) return true;
    const words = new Set(candidate.split(/\s+/));
    const overlap = [...wanted].filter(word => words.has(word)).length;
    const union = new Set([...wanted, ...words]).size;
    return union > 1 && overlap / union >= 0.8;
  });
}

function tskTagList(task) {
  return String(task?.tags || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}

function tskSetTags(task, tags) {
  const unique = [...new Set(tags.map(t => String(t || "").trim()).filter(Boolean))];
  return unique.join(",");
}

function tskDeadlineKind(task) {
  const kind = String(task?.deadline_kind || "").toLowerCase();
  if (kind === "hard" || kind === "definite") return "hard";
  if (kind === "indefinite") return "indefinite";
  return task?.due_date ? "hard" : "indefinite";
}

function tskBucketOf(task) {
  const tags = tskTagList(task);
  for (const bucket of TASK_BUCKETS) {
    if (tags.includes(bucket) || tags.includes(`bucket:${bucket}`)) return bucket;
  }
  const blob = `${task?.title || ""} ${task?.tags || ""} ${task?.category || ""} ${task?.description || ""} ${task?.notes || ""}`;
  if (/\b(aleks|homework|\bhw\b|assignment|problem set|school|exam|quiz|lecture|class)\b/i.test(blob)) return "school";
  if (/\b(meeting|shift|office|work|job|client|standup)\b/i.test(blob)) return "work";
  return "life";
}

function tskHomeworkDeferred(task, todayStr = taskTodayStr()) {
  const bucket = tskBucketOf(task);
  const tags = tskTagList(task);
  const blob = `${task?.title || ""} ${task?.tags || ""} ${task?.category || ""}`;
  const schoolwork = bucket === "school" || tags.includes("aleks") || tags.includes("homework")
    || /\b(aleks|homework|\bhw\b|assignment|problem set)\b/i.test(blob);
  if (!schoolwork) return false;
  if (!task?.due_date) return true;
  const days = Math.round((Date.parse(`${task.due_date}T12:00:00`) - Date.parse(`${todayStr}T12:00:00`)) / 86400000);
  return days > 2;
}

function tskKeywordsOf(task) {
  const tags = tskTagList(task);
  const blob = `${task?.title || ""} ${task?.notes || ""} ${task?.description || ""} ${task?.tags || ""}`;
  const found = [];
  for (const key of TASK_KEYWORD_KEYS) {
    if (tags.includes(key) || (TASK_KEYWORD_RES[key] && TASK_KEYWORD_RES[key].test(blob))) found.push(key);
  }
  return found;
}

function tskClassifyKeywords(task) {
  const tags = tskTagList(task);
  const detected = tskKeywordsOf(task);
  const bucket = tskBucketOf(task);
  for (const key of detected) {
    if (!tags.includes(key)) tags.push(key);
  }
  for (const other of TASK_BUCKETS) {
    const idx = tags.indexOf(other);
    if (idx >= 0 && other !== bucket) tags.splice(idx, 1);
  }
  if (!tags.includes(bucket)) tags.push(bucket);
  return tskSetTags(task, tags);
}

function tskMatchesKeywordFilter(task) {
  if (!TASK_KEYWORD_FILTER) return true;
  return tskKeywordsOf(task).includes(TASK_KEYWORD_FILTER) || tskTagList(task).includes(TASK_KEYWORD_FILTER);
}

function tskMatchesBucketFilter(task) {
  if (!TASK_BUCKET_FILTER) return true;
  return tskBucketOf(task) === TASK_BUCKET_FILTER;
}

function tskActionToast(message, actionLabel, onAction) {
  if (typeof initToastRoot === "function") initToastRoot();
  const root = document.getElementById("toast-root");
  if (!root) {
    tskToast(message, "good");
    return;
  }
  const toast = document.createElement("div");
  toast.className = "toast-item tsk-undo-toast";
  toast.setAttribute("role", "status");
  toast.style.cssText = "pointer-events:auto; padding:10px 14px; border-radius:8px; border:1px solid var(--status-good); background:color-mix(in srgb, var(--status-good) 14%, var(--bg-card)); color:var(--ink-primary); font-size:13px; line-height:1.4; box-shadow:0 4px 16px rgba(0,0,0,0.25); display:flex; gap:10px; align-items:center;";
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" class="secondary compact tsk-undo-btn">${escapeHtml(actionLabel || "Undo")}</button>`;
  const dismiss = () => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  };
  const timer = setTimeout(dismiss, 8000);
  toast.querySelector("button").onclick = async ev => {
    ev.stopPropagation();
    clearTimeout(timer);
    try { await onAction(); } catch (err) { tskToast(errorMessage(err), "warn"); }
    dismiss();
  };
  toast.onclick = () => { clearTimeout(timer); dismiss(); };
  root.appendChild(toast);
}

async function tskSetDueDate(taskId, due, { undoable = true, kind = null } = {}) {
  const previous = tskCachedTask(taskId);
  const priorDue = previous?.due_date || "";
  const priorKind = tskDeadlineKind(previous);
  const payload = { due_date: due || null, deadline_dismissed: !due };
  if (kind) payload.deadline_kind = kind;
  else payload.deadline_kind = due ? "hard" : "indefinite";
  const updated = await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  tskMergeTaskCache(updated);
  tskPatchTaskRow(updated, TSK_CACHED_PROJECTS);
  if (undoable) {
    TSK_DATE_UNDO = { id: taskId, due: priorDue, kind: priorKind };
    tskActionToast(due ? `Moved to ${due}` : "Deadline cleared", "Undo", async () => {
      await tskSetDueDate(taskId, priorDue || null, { undoable: false, kind: priorKind });
      tskToast("Date restored", "good");
      render();
    });
  }
  return updated;
}

function tskOpenMonthHours() {
  try {
    if (typeof CALENDAR_VIEW !== "undefined") CALENDAR_VIEW = "hours";
    localStorage.setItem("calendarView", "hours");
  } catch (_) {}
  if (typeof goToTab === "function") goToTab("Calendar");
}

function tskKeywordChipRow() {
  const chips = TASK_KEYWORD_KEYS.map(key => {
    const active = TASK_KEYWORD_FILTER === key;
    return `<button type="button" class="tsk-keyword-chip${active ? " active" : ""}" data-key="${escapeHtml(key)}" title="Filter by ${escapeHtml(key)}. Alt-click tags the focused task.">${escapeHtml(key)}</button>`;
  }).join("");
  const buckets = TASK_BUCKETS.map(bucket => {
    const active = TASK_BUCKET_FILTER === bucket;
    return `<button type="button" class="tsk-bucket-chip tsk-bucket-${bucket}${active ? " active" : ""}" data-bucket="${bucket}">${escapeHtml(bucket)}</button>`;
  }).join("");
  return `<div class="tsk-keyword-row" id="tsk-keyword-row">
    <span class="tsk-radar-head">Classify</span>
    ${chips}
    <button type="button" class="secondary compact" id="task-classify-all" title="Tag open tasks from title and notes">Auto-tag</button>
    <span class="tsk-radar-head">Buckets</span>
    ${buckets}
    <button type="button" class="secondary compact" id="task-bucket-game" title="Assign school / work / life">Bucket game</button>
  </div>`;
}

function tskAlwaysBarHtml(tasks, todayStr) {
  const open = tasks.filter(t => taskIsOpen(t) && tskMatchesKeywordFilter(t) && tskMatchesBucketFilter(t));
  const visible = open.filter(t => TASK_SHOW_DEFERRED || !tskHomeworkDeferred(t, todayStr));
  const deferredN = open.length - visible.length;
  const chips = visible.slice(0, 18).map(t => {
    const bucket = tskBucketOf(t);
    const kind = tskDeadlineKind(t);
    return `<button type="button" class="tsk-bar-chip tsk-bar-${escapeHtml(bucket)}" draggable="true" data-task-id="${t.id}" title="${escapeHtml(t.title)} · ${escapeHtml(kind)}">${escapeHtml((t.title || "").slice(0, 28))}</button>`;
  }).join("");
  return `<div class="tsk-always-bar" id="tsk-always-bar">
    <div class="tsk-always-bar-head">
      <strong>Tasks</strong>
      <span class="pill">${visible.length}</span>
      ${deferredN ? `<button type="button" class="secondary compact" id="tsk-show-deferred">${TASK_SHOW_DEFERRED ? "Hide later schoolwork" : `${deferredN} not work yet`}</button>` : ""}
      <button type="button" class="secondary compact" id="task-napkin-add-all" title="Add napkin notes that are not already tasks">Add all not-added from napkin</button>
    </div>
    <div class="tsk-always-bar-list">${chips || '<span class="stub">No open tasks in this filter.</span>'}</div>
  </div>`;
}

function tskWireEnterAsDone(root = document) {
  root.querySelectorAll("#new-task-title, #task-search, .task-edit-title, #wp-time-title, #wp-time-est, .tsk-est-input, .happiness-input, [data-happiness-done], .pls-h-btn, [data-quest-select]").forEach(el => {
    if (el.dataset.tskEnter) return;
    el.dataset.tskEnter = "1";
    el.addEventListener("keydown", e => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (el.id === "new-task-title") {
        e.preventDefault();
        document.getElementById("add-task")?.click();
        return;
      }
      if (el.classList.contains("task-edit-title")) {
        e.preventDefault();
        document.querySelector(`.task-edit-save[data-id="${el.dataset.id}"]`)?.click();
        return;
      }
      const quest = el.closest("[data-quest-select], .game-quest-claim, #game-claim-daily");
      if (quest) { e.preventDefault(); quest.click(); return; }
      const happy = el.closest(".pls-h-btn");
      if (happy) {
        e.preventDefault();
        happy.click();
        (document.getElementById("pls-compact-submit") || document.getElementById("pls-submit"))?.click();
      }
    });
  });
}

async function tskAddAllNotAddedFromNapkin() {
  let entries = [];
  try {
    if (typeof readNapkinBlob === "function") entries = readNapkinBlob().entries || [];
  } catch (_) {}
  try {
    const synced = await api("/api/napkin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, deleted: [] }),
    });
    if (Array.isArray(synced?.entries)) entries = synced.entries;
  } catch (_) {}
  try {
    await api("/api/napkin/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, flush: false }),
    });
  } catch (_) {}
  try {
    await api("/api/repo/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "todo task homework speaking", k: 16 }),
    });
  } catch (_) {}
  const existing = new Set((TSK_CACHED_TASKS || []).map(t => tskNormalizeTitle(t.title)));
  const created = [];
  for (const entry of entries) {
    if (entry?.kind === "scribble" || entry?.private) continue;
    const title = String(entry.title || entry.details || "").split("\n")[0].trim().slice(0, 180);
    if (!title || existing.has(tskNormalizeTitle(title))) continue;
    const tags = [];
    if (/\b(aleks|homework|school)\b/i.test(title)) tags.push("school", "homework");
    const item = await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        notes: entry.details || "",
        created_by: "napkin",
        deadline_dismissed: true,
        deadline_kind: "indefinite",
        tags: tags.join(","),
      }),
    });
    existing.add(tskNormalizeTitle(title));
    created.push(item);
  }
  return created;
}

function tskOpenBucketGame() {
  document.getElementById("tsk-bucket-game")?.remove();
  const queue = (TSK_CACHED_TASKS || []).filter(t => taskIsOpen(t));
  if (!queue.length) { tskToast("No open tasks to bucket", "info"); return; }
  let idx = 0;
  const modal = document.createElement("div");
  modal.id = "tsk-bucket-game";
  modal.className = "tsk-game-modal";
  const paint = () => {
    const task = queue[idx];
    if (!task) { modal.remove(); tskToast("Buckets assigned", "good"); render(); return; }
    const guess = tskBucketOf(task);
    modal.innerHTML = `<form class="tsk-game-card">
      <strong>School / work / life</strong>
      <p class="stub">${idx + 1} / ${queue.length} — guess from the description, then assign.</p>
      <p class="tsk-game-title">${escapeHtml(task.title || "")}</p>
      <p class="stub">${escapeHtml((task.description || task.notes || "No description — inferred from the title.").slice(0, 240))}</p>
      <p class="stub">Suggested: <strong>${escapeHtml(guess)}</strong></p>
      <div class="tsk-bucket-choices">
        ${TASK_BUCKETS.map(b => `<button type="button" class="primary tsk-bucket-pick" data-bucket="${b}">${escapeHtml(b)}</button>`).join("")}
      </div>
      <button type="button" class="ghost" id="tsk-bucket-skip">Skip</button>
    </form>`;
    modal.querySelectorAll(".tsk-bucket-pick").forEach(btn => {
      btn.onclick = async () => {
        const tags = tskTagList(task).filter(t => !TASK_BUCKETS.includes(t) && !t.startsWith("bucket:"));
        tags.push(btn.dataset.bucket);
        const updated = await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: tskSetTags(task, tags) }),
        });
        tskMergeTaskCache(updated);
        idx += 1;
        paint();
      };
    });
    modal.querySelector("#tsk-bucket-skip").onclick = () => { idx += 1; paint(); };
    modal.querySelector(`.tsk-bucket-pick[data-bucket="${guess}"]`)?.focus();
  };
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  modal.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const focused = modal.querySelector(".tsk-bucket-pick:focus");
    if (focused) { e.preventDefault(); focused.click(); }
  });
  document.body.appendChild(modal);
  paint();
}

function tskOpenEstimateGame(kind = "minigame") {
  if (window.WaypointNapkinComplete?.openTimeGame) {
    window.WaypointNapkinComplete.openTimeGame(kind);
    requestAnimationFrame(() => {
      const title = document.getElementById("wp-time-title");
      const open = (TSK_CACHED_TASKS || []).filter(taskIsOpen)[0];
      if (title && open && !title.value) title.value = open.title || "";
      title?.focus();
    });
    return;
  }
  document.getElementById("tsk-est-game")?.remove();
  const open = (TSK_CACHED_TASKS || []).filter(taskIsOpen);
  const modal = document.createElement("div");
  modal.id = "tsk-est-game";
  modal.className = "tsk-game-modal";
  const options = open.map(t => `<option value="${t.id}">${escapeHtml(t.title || `#${t.id}`)}</option>`).join("");
  modal.innerHTML = `<form class="tsk-game-card" id="tsk-est-form">
    <strong>${kind === "actual" ? "Time-taken game" : "Estimate-time daily minigame"}</strong>
    <p class="stub">Enter logs it. Estimates get sharper over time.</p>
    <label>Task <select id="tsk-est-task">${options}<option value="">Other…</option></select></label>
    <label>Title <input type="text" id="tsk-est-title" class="tsk-est-input" required></label>
    <label>Estimate (minutes) <input type="number" id="tsk-est-min" class="tsk-est-input" min="1" required></label>
    ${kind === "actual" ? `<label>Actual (minutes) <input type="number" id="tsk-est-actual" class="tsk-est-input" min="1" required></label>` : ""}
    <div class="tsk-game-actions">
      <button type="submit" class="primary">Log</button>
      <button type="button" class="ghost" id="tsk-est-cancel">Cancel</button>
    </div>
  </form>`;
  document.body.appendChild(modal);
  const syncTitle = () => {
    const sel = modal.querySelector("#tsk-est-task");
    const task = open.find(t => String(t.id) === String(sel.value));
    const title = modal.querySelector("#tsk-est-title");
    if (task && title) title.value = task.title || "";
  };
  modal.querySelector("#tsk-est-task").onchange = syncTitle;
  syncTitle();
  modal.querySelector("#tsk-est-cancel").onclick = () => modal.remove();
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  modal.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    const taskId = Number(modal.querySelector("#tsk-est-task").value) || null;
    const title = modal.querySelector("#tsk-est-title").value.trim();
    const estimated = Number(modal.querySelector("#tsk-est-min").value);
    const actual = kind === "actual" ? Number(modal.querySelector("#tsk-est-actual").value) : null;
    await api("/api/tasks/time-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, title, estimated_minutes: estimated || null, actual_minutes: actual || null, kind }),
    });
    if (typeof wgQuestProgress === "function") wgQuestProgress(kind === "actual" ? "actual1" : "estimate1");
    tskToast("Logged — estimates get sharper over time", "good");
    modal.remove();
  };
  modal.querySelector("#tsk-est-min")?.focus();
}

// TODO(subtasks): the current task schema has no parent/subtask relation. Add per-subtask
// deadlines here once the backend exposes parent_task_id; do not fake hierarchy in notes.

function taskCategoryMeta(categoryKey) {
  if (!categoryKey) return null;
  return (CONFIG?.categories || []).find(c => c.key === categoryKey) || null;
}

function taskDueChipClass(diffDays) {
  if (diffDays < 0) return "tsk-due-chip-overdue";
  if (diffDays === 0) return "tsk-due-chip-today";
  if (diffDays <= 3) return "tsk-due-chip-soon";
  if (diffDays <= 7) return "tsk-due-chip-week";
  return "tsk-due-chip-later";
}

function taskDragHandleHtml() {
  return `<span class="drag-handle tsk-drag-grip" draggable="true" title="Drag onto a day to change due_date" aria-label="Drag to a date"><svg class="tsk-grip-icon" width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><circle cx="3" cy="2" r="1.2" fill="currentColor"/><circle cx="7" cy="2" r="1.2" fill="currentColor"/><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="3" cy="12" r="1.2" fill="currentColor"/><circle cx="7" cy="12" r="1.2" fill="currentColor"/></svg></span>`;
}

function taskCategoryChipHtml(categoryKey) {
  const cat = taskCategoryMeta(categoryKey);
  if (!cat) return "";
  const color = cat.color || "var(--border)";
  return `<span class="tsk-cat-chip" style="background:color-mix(in srgb, ${color} 18%, var(--bg-card)); color:color-mix(in srgb, ${color} 80%, var(--ink-primary)); border-color:color-mix(in srgb, ${color} 40%, var(--gridline));">${escapeHtml(cat.label)}</span>`;
}

function taskProjectTagHtml(projectId, projects) {
  if (!projectId) return "";
  const proj = projects.find(p => String(p.id) === String(projectId));
  if (!proj) return "";
  const short = proj.name.length > 14 ? proj.name.slice(0, 12) + "…" : proj.name;
  return `<span class="tsk-project-tag" title="${escapeHtml(proj.name)}">${escapeHtml(short)}</span>`;
}

function applyTaskRowUrgencyStyle(row, urgency, isDone) {
  if (!row) return;
  row.classList.remove("tsk-row-urgency-low", "tsk-row-urgency-medium", "tsk-row-urgency-high", "tsk-row-urgency-critical", "urgency-critical");
  if (!isDone && urgency) row.classList.add(`tsk-row-urgency-${urgency}`);
}

function buildUrgencyPinnedPanel(tasks, todayStr) {
  const pinned = tasks
    .filter(t => taskIsOpen(t) && (t.urgency === "critical" || t.urgency === "high"))
    .sort((a, b) => {
      const ord = { critical: 0, high: 1 };
      const u = (ord[a.urgency] ?? 2) - (ord[b.urgency] ?? 2);
      if (u !== 0) return u;
      return taskFocusMeta(b, todayStr).score - taskFocusMeta(a, todayStr).score;
    });
  if (!pinned.length) return "";
  const visible = pinned.slice(0, 6);
  const overflow = pinned.length - visible.length;
  const rows = visible.map(t => {
    const cls = t.urgency === "critical" ? "tsk-radar-item-critical" : "tsk-radar-item-high";
    const short = t.title.length > 42 ? t.title.slice(0, 40) + "…" : t.title;
    return `<button type="button" class="tsk-radar-item ${cls}" data-scroll-task="${t.id}" title="${escapeHtml(t.title)}"><span class="tsk-radar-dot" aria-hidden="true"></span><span class="tsk-radar-text">${escapeHtml(short)}</span></button>`;
  }).join("");
  const more = overflow > 0 ? `<span class="tsk-radar-more">+${overflow} more</span>` : "";
  return `<div class="tsk-urgency-radar" aria-label="High urgency tasks"><span class="tsk-radar-head">Radar</span><div class="tsk-radar-strip">${rows}${more}</div></div>`;
}

function deliverableChipHtml(t) {
  const color = URGENCY_COLOR[t.urgency] || "var(--border)";
  const short = t.title.length > 28 ? t.title.slice(0, 26) + "…" : t.title;
  return `<button type="button" class="tsk-deliv-chip" data-id="${t.id}" title="${escapeHtml(t.title)}" style="border-left:3px solid ${color};">${escapeHtml(short)}</button>`;
}

function deliverablesBoardHtml(tasks) {
  const todayStr = taskTodayStr();
  const weekStart = taskWeekStart(todayStr);
  const offsetStart = new Date(weekStart + "T00:00:00");
  offsetStart.setDate(offsetStart.getDate() + TASK_DELIVERABLES_WEEK * 7);
  const viewWeekStart = localYmd(offsetStart);
  const days = taskWeekDayColumns(TASK_DELIVERABLES_WEEK);

  const open = tasks.filter(taskIsOpen);
  const overdue = open.filter(t => t.due_date && t.due_date < todayStr);
  const inWeek = open.filter(t => t.due_date && taskDateInWeek(t.due_date, viewWeekStart));

  const overdueCol = overdue.length
    ? `<div class="tsk-deliv-col tsk-deliv-overdue">
        <div class="tsk-deliv-col-head"><span class="pill status-critical">+${overdue.length} overdue</span></div>
        <div class="tsk-deliv-chips">${overdue.map(deliverableChipHtml).join("")}</div>
      </div>`
    : "";

  const dayCols = days.map(day => {
    const dayTasks = inWeek.filter(t => t.due_date === day.date);
    const isToday = day.date === todayStr;
    return `<div class="tsk-deliv-col${isToday ? " tsk-deliv-today" : ""}" data-date="${escapeHtml(day.date)}">
      <div class="tsk-deliv-col-head">${escapeHtml(day.label)}<span class="tsk-deliv-date">${escapeHtml(day.date.slice(5))}</span></div>
      <div class="tsk-deliv-chips">${dayTasks.map(deliverableChipHtml).join("") || '<span class="stub tsk-deliv-empty">—</span>'}</div>
    </div>`;
  }).join("");

  const weekToggle = TASK_DELIVERABLES_WEEK === 0 ? "This week" : "Next week";
  const weekLabel = taskWeekLabel(viewWeekStart, taskWeekStart(todayStr));

  return `
    <div class="card tsk-deliv-board">
      <div class="tsk-deliv-header">
        <strong>Deliverables</strong>
        <span class="stub">${escapeHtml(weekLabel)}</span>
        <button type="button" class="secondary tsk-deliv-week-toggle" style="margin-left:auto;">${escapeHtml(weekToggle)}</button>
      </div>
      <div class="tsk-deliv-strip">
        ${overdueCol}
        ${dayCols}
      </div>
    </div>`;
}

function tasksScopedStyles() {
  return `<style>
    .tsk-deliv-board { margin-bottom: 6px; padding: 6px 8px; box-shadow: none; }
    .tsk-deliv-header { display:flex; align-items:center; gap:6px; flex-wrap:nowrap; margin-bottom:4px; }
    .tsk-deliv-strip { display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; }
    .tsk-deliv-col { flex:1; min-width:88px; min-height:88px; border:1px solid var(--gridline); border-radius:8px; padding:6px; background:var(--bg-shell); }
    .tsk-deliv-col.tsk-deliv-today { border-color:var(--accent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent); }
    .tsk-deliv-col.tsk-deliv-overdue { border-color:color-mix(in srgb, var(--status-critical) 50%, var(--border)); background:color-mix(in srgb, var(--status-critical) 6%, var(--bg-shell)); }
    .tsk-deliv-col-head { font-size:11px; font-weight:600; color:var(--ink-secondary); margin-bottom:6px; display:flex; flex-direction:column; gap:1px; }
    .tsk-deliv-date { font-weight:400; font-size:10px; color:var(--ink-muted); }
    .tsk-deliv-chips { display:flex; flex-direction:column; gap:4px; }
    .tsk-deliv-chip { text-align:left; font-size:11px; padding:4px 6px; border-radius:6px; border:1px solid var(--gridline); background:var(--bg-card); cursor:pointer; color:var(--ink-primary); width:100%; }
    .tsk-deliv-chip:hover { background:var(--bg-card-hover); }
    .tsk-deliv-empty { font-size:11px; }
    .tsk-add-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .tsk-add-row input[type="text"] { flex:1; min-width:180px; }
    .tsk-duplicate-hint { width:100%; margin:0; font-size:11px; color:var(--status-serious); }
    .tsk-add-extras { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px; }
    .tsk-add-extras[hidden] { display:none; }
    .tsk-add-description { width:100%; min-height:54px; resize:vertical; }
    .tsk-deadline-controls { display:inline-flex; align-items:center; gap:5px; flex-wrap:wrap; }
    .tsk-deadline-hint { font-size:10px; color:var(--ink-muted); }
    .tsk-filter-row { display:flex; gap:6px; align-items:center; flex-wrap:nowrap; overflow-x:auto; margin-bottom:4px; }
    .tsk-filter-row input[type="text"] { flex:1; min-width:120px; font-size:13px; }
    .tsk-filter-row button { font-size:12px; }
    .tsk-urgency-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .tsk-urgency-dot-critical { background:var(--status-critical); }
    .tsk-urgency-dot-high { background:var(--status-serious); }
    .tsk-urgency-dot-medium { background:var(--status-warning); }
    .tsk-urgency-dot-low { background:var(--status-good); }
    .task-row.tsk-row { display:flex; align-items:center; gap:8px; padding:8px 9px 8px 11px; border-left:4px solid transparent; border-radius:4px; transition:background 160ms ease, border-color 160ms ease; }
    .task-row.tsk-row.tsk-row-urgency-low { border-left-color:${URGENCY_COLOR.low}; background:color-mix(in srgb, ${URGENCY_COLOR.low} 7%, var(--bg-card)); }
    .task-row.tsk-row.tsk-row-urgency-medium { border-left-color:${URGENCY_COLOR.medium}; background:color-mix(in srgb, ${URGENCY_COLOR.medium} 7%, var(--bg-card)); }
    .task-row.tsk-row.tsk-row-urgency-high { border-left-color:${URGENCY_COLOR.high}; background:color-mix(in srgb, ${URGENCY_COLOR.high} 8%, var(--bg-card)); }
    .task-row.tsk-row.tsk-row-urgency-critical { border-left-color:${URGENCY_COLOR.critical}; background:color-mix(in srgb, ${URGENCY_COLOR.critical} 9%, var(--bg-card)); box-shadow:inset 3px 0 10px color-mix(in srgb, ${URGENCY_COLOR.critical} 10%, transparent); }
    .task-row.tsk-row-done { opacity:1 !important; border-left:3px solid var(--status-good) !important; padding-left:10px; background:color-mix(in srgb, var(--status-good) 10%, var(--bg-card)) !important; box-shadow:none !important; }
    .tsk-cat-chip { font-size:9px; font-weight:600; padding:1px 5px; border-radius:3px; border:1px solid; white-space:nowrap; flex-shrink:0; letter-spacing:0.02em; text-transform:uppercase; }
    .tsk-project-tag { font-size:9px; padding:1px 4px; border-radius:3px; border:1px solid var(--gridline); color:var(--ink-muted); background:var(--bg-shell); white-space:nowrap; flex-shrink:0; max-width:72px; overflow:hidden; text-overflow:ellipsis; }
    .tsk-due-chip { font-size:10px; padding:1px 6px; border-radius:4px; border:1px solid var(--gridline); color:var(--ink-muted); white-space:nowrap; flex-shrink:0; }
    .tsk-due-chip-overdue { border-color:var(--status-critical); color:var(--status-critical); background:color-mix(in srgb, var(--status-critical) 8%, var(--bg-card)); }
    .tsk-due-chip-today { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, var(--bg-card)); }
    .tsk-due-chip-soon { border-color:var(--status-warning); color:var(--status-warning); background:color-mix(in srgb, var(--status-warning) 8%, var(--bg-card)); }
    .tsk-due-chip-week { border-color:color-mix(in srgb, var(--status-serious) 50%, var(--gridline)); color:var(--ink-secondary); background:color-mix(in srgb, var(--status-serious) 5%, var(--bg-card)); }
    .tsk-due-chip-later { border-color:var(--gridline); color:var(--ink-muted); background:var(--bg-shell); }
    .tsk-drag-grip { display:inline-flex; align-items:center; justify-content:center; width:14px; height:18px; flex-shrink:0; font-size:0; line-height:0; overflow:hidden; }
    .tsk-drag-grip .tsk-grip-icon { display:block; width:10px; height:14px; pointer-events:none; }
    .tsk-urgency-bump-wrap { display:inline-flex; flex-direction:column; gap:1px; flex-shrink:0; opacity:0; transition:opacity 120ms ease; }
    .task-row.tsk-row:hover .tsk-urgency-bump-wrap, .tsk-urgency-bump-wrap:focus-within { opacity:1; }
    .tsk-urgency-bump {
      --tsk-u: ${URGENCY_COLOR.medium};
      width:16px; height:14px; padding:0; border:1px solid color-mix(in srgb, var(--tsk-u) 55%, transparent);
      border-radius:3px; background:color-mix(in srgb, var(--tsk-u) 18%, transparent);
      color:var(--tsk-u); font-size:9px; line-height:1; cursor:pointer; flex-shrink:0;
      transition:transform 90ms var(--ease-out, ease), background 120ms ease, border-color 120ms ease, color 120ms ease;
    }
    .tsk-urgency-bump[data-urgency="low"] { --tsk-u:${URGENCY_COLOR.low}; }
    .tsk-urgency-bump[data-urgency="medium"] { --tsk-u:${URGENCY_COLOR.medium}; }
    .tsk-urgency-bump[data-urgency="high"] { --tsk-u:${URGENCY_COLOR.high}; }
    .tsk-urgency-bump[data-urgency="critical"] { --tsk-u:${URGENCY_COLOR.critical}; }
    .tsk-urgency-bump:hover { background:color-mix(in srgb, var(--tsk-u) 32%, transparent); border-color:var(--tsk-u); transform:translateY(-1px); }
    .tsk-urgency-bump:active { transform:translateY(1px) scale(0.96); }
    .tsk-urgency-bump-down:hover { transform:translateY(1px); }
    .tsk-list-shell { position:relative; }
    .tsk-urgency-radar { display:flex; align-items:center; gap:8px; flex-wrap:nowrap; margin:0 0 6px; padding:4px 8px; border-radius:8px; border:1px solid color-mix(in srgb, var(--status-serious) 22%, var(--gridline)); background:color-mix(in srgb, var(--bg-card) 92%, var(--status-serious) 4%); font-size:11px; max-width:100%; min-width:0; overflow-x:auto; box-sizing:border-box; }
    .tsk-radar-head { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--ink-muted); flex-shrink:0; }
    .tsk-radar-strip { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; flex:1; max-width:100%; overflow-x:auto; }
    .tsk-radar-item { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; margin:0; border:1px solid var(--gridline); border-radius:999px; background:var(--bg-shell); color:var(--ink-secondary); cursor:pointer; text-align:left; font-size:11px; line-height:1.3; max-width:min(220px, 40vw); }
    .tsk-radar-item:hover { background:color-mix(in srgb, var(--accent) 8%, var(--bg-shell)); color:var(--ink-primary); border-color:color-mix(in srgb, var(--accent) 35%, var(--gridline)); }
    .tsk-radar-item-critical { border-color:color-mix(in srgb, var(--status-critical) 45%, var(--gridline)); }
    .tsk-radar-item-high { border-color:color-mix(in srgb, var(--status-serious) 40%, var(--gridline)); }
    .tsk-radar-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
    .tsk-radar-item-critical .tsk-radar-dot { background:var(--status-critical); box-shadow:0 0 6px color-mix(in srgb, var(--status-critical) 50%, transparent); }
    .tsk-radar-item-high .tsk-radar-dot { background:var(--status-serious); }
    .tsk-radar-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    .tsk-radar-more { font-size:10px; color:var(--ink-muted); padding:2px 4px; font-style:italic; flex-shrink:0; }
    .task-edit-panel { padding-left:12px !important; }
    .task-edit-panel .drag-handle, .task-edit-panel .tsk-drag-grip { display:none !important; }
    .tsk-progress-sliver { width:48px; height:4px; border-radius:2px; background:var(--gridline); overflow:hidden; flex-shrink:0; }
    .tsk-progress-sliver-fill { height:100%; border-radius:2px; }
    .tsk-row-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:15px; line-height:1.35; font-weight:520; }
    .tsk-row-description { margin:0 34px 7px 38px; font-size:12px; line-height:1.4; color:var(--ink-secondary); white-space:pre-wrap; }
    .tsk-row-actions { display:flex; gap:4px; flex-shrink:0; }
    .tsk-row-actions button { font-size:11px; padding:2px 6px; }
    .tsk-group-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
    .tsk-overdue-card { border-color:color-mix(in srgb, var(--status-critical) 48%, var(--border)); }
    .tsk-overdue-concierge { margin:-1px 0 8px; font-size:11px; color:var(--ink-muted); font-style:italic; }
    .tsk-overdue-age-2 .tsk-row { background:color-mix(in srgb, var(--status-critical) 11%, var(--bg-card)); }
    .tsk-overdue-age-3 .tsk-row { background:color-mix(in srgb, var(--status-critical) 16%, var(--bg-card)); box-shadow:inset 0 0 14px color-mix(in srgb, var(--status-critical) 8%, transparent); }
    .tsk-sort-toggle { display:flex; gap:4px; margin-left:auto; }
    .tsk-sort-toggle button { font-size:11px; padding:2px 8px; }
    .tsk-done-details { margin-top:0; }
    .tsk-done-summary { cursor:pointer; font-size:13px; font-weight:600; list-style:none; display:flex; align-items:center; gap:8px; }
    .tsk-done-summary::-webkit-details-marker { display:none; }
    .tsk-done-summary::before { content:"▸"; font-size:10px; color:var(--ink-muted); }
    .tsk-done-details[open] .tsk-done-summary::before { content:"▾"; }
    .tsk-focus-label { font-size:10px; color:var(--ink-muted); font-style:italic; margin-left:4px; }
    .tsk-freeform-toggle { font-size:11px; white-space:nowrap; }
    .tsk-day-filter { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; }
    .tsk-day-chip { font-size:11px; padding:8px 12px; min-height:36px; border-radius:999px; border:1px solid var(--border); background:var(--bg-shell); cursor:pointer; color:var(--ink-muted); }
    .tsk-day-chip-active { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 10%, var(--bg-shell)); }
    .tsk-urgency-wrap { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
    .tsk-urgency-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 6px; border-radius:6px; border:1px solid var(--gridline); background:var(--bg-shell); font-size:10px; cursor:pointer; color:var(--ink-secondary); }
    .tsk-urgency-chip:hover { border-color:var(--accent); }
    .tsk-urgency-chip-label { font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .tsk-urgency-bar { display:flex; width:48px; height:5px; border-radius:3px; overflow:hidden; background:var(--gridline); }
    .tsk-urgency-seg { height:100%; min-width:2px; }
    .tsk-urgency-breakdown { font-size:10px; color:var(--ink-muted); font-variant-numeric:tabular-nums; padding-left:2px; }
    .tsk-urgency-breakdown-hidden { display:none; }
    .tsk-combo-flourish { position:absolute; left:calc(100% + 4px); top:50%; transform:translateY(-50%); font-size:10px; font-weight:700; letter-spacing:0.04em; color:var(--accent); white-space:nowrap; pointer-events:none; z-index:2; animation:tsk-combo-pop 400ms ease forwards; }
    @keyframes tsk-combo-pop { 0% { opacity:0; transform:translateY(-50%) scale(0.85); } 35% { opacity:1; transform:translateY(-50%) scale(1.05); } 100% { opacity:0; transform:translateY(-65%) scale(1); } }
    @media (prefers-reduced-motion: reduce) { .tsk-combo-flourish { animation:none; opacity:1; } }
    .tsk-keyword-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:6px 0 8px; }
    .tsk-keyword-chip, .tsk-bucket-chip { font-size:11px; padding:4px 10px; min-height:32px; border-radius:999px; border:1px solid var(--gridline); background:var(--bg-shell); cursor:pointer; color:var(--ink-secondary); }
    .tsk-keyword-chip.active, .tsk-bucket-chip.active { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 12%, var(--bg-shell)); }
    .tsk-bucket-school { border-color:color-mix(in srgb, #3a5ea8 50%, var(--gridline)); }
    .tsk-bucket-work { border-color:color-mix(in srgb, var(--status-serious) 40%, var(--gridline)); }
    .tsk-bucket-life { border-color:color-mix(in srgb, var(--status-good) 40%, var(--gridline)); }
    .tsk-always-bar { margin:0 0 10px; padding:8px 10px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); }
    .tsk-always-bar-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
    .tsk-always-bar-list { display:flex; gap:6px; flex-wrap:wrap; min-height:36px; }
    .tsk-bar-chip { font-size:11px; padding:6px 10px; min-height:32px; border-radius:8px; border:1px solid var(--gridline); background:var(--bg-shell); cursor:grab; }
    .tsk-bar-school { border-left:3px solid #3a5ea8; }
    .tsk-bar-work { border-left:3px solid var(--status-serious); }
    .tsk-bar-life { border-left:3px solid var(--status-good); }
    .tsk-date-drop { outline:2px solid var(--accent); background:color-mix(in srgb, var(--accent) 14%, var(--bg-shell)) !important; }
    .tsk-date-dragging { opacity:0.65; }
    .tsk-row-deferred { opacity:0.72; }
    .tsk-kind-pill, .tsk-bucket-pill { font-size:9px; padding:1px 5px; border-radius:3px; border:1px solid var(--gridline); text-transform:uppercase; letter-spacing:0.04em; }
    .tsk-kind-hard { border-color:var(--status-serious); color:var(--status-serious); }
    .tsk-kind-indefinite { color:var(--ink-muted); }
    .tsk-tag { font-size:9px; padding:1px 5px; border-radius:3px; border:1px solid var(--gridline); color:var(--ink-secondary); }
    .tsk-ai-badge { font-size:9px; padding:1px 5px; border-radius:3px; background:color-mix(in srgb, var(--accent) 14%, var(--bg-shell)); }
    .tsk-game-modal { position:fixed; inset:0; z-index:100010; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; padding:16px; }
    .tsk-game-card { width:min(420px, 100%); background:var(--bg-card); border:1px solid var(--gridline); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:8px; }
    .tsk-game-title { font-weight:650; margin:0; }
    .tsk-bucket-choices { display:flex; gap:8px; flex-wrap:wrap; }
    .tsk-bucket-choices button { flex:1; min-height:40px; }
    .task-row.tsk-row:focus-within, .task-row-wrap:focus { outline:1px solid color-mix(in srgb, var(--accent) 50%, transparent); }
  </style>`;
}

// Quick-capture: hidden behind a toggle until opened; proposals render inline when parsed.
function freeformCaptureHtml() {
  if (!TASK_FREEFORM_OPEN && TASK_FREEFORM_PROPOSALS === null) return "";

  if (TASK_FREEFORM_PROPOSALS === null) {
    return `
      <div class="card tsk-freeform-panel">
        <textarea id="task-freeform-text" placeholder="Brain-dump tasks in plain language…" style="width:100%; min-height:52px;">${escapeHtml(TASK_FREEFORM_TEXT)}</textarea>
        <div style="margin-top:6px; display:flex; gap:6px;">
          <button class="primary" id="task-freeform-parse">Parse into tasks</button>
          <button type="button" class="secondary" id="task-freeform-close">Close</button>
        </div>
      </div>`;
  }
  const items = TASK_FREEFORM_PROPOSALS;
  if (!items.length) {
    return `
      <div class="card tsk-freeform-panel">
        <p class="stub">No distinct tasks found.</p>
        <button class="secondary" id="task-freeform-discard">Back</button>
      </div>`;
  }
  const rows = items.map((it, idx) => `
    <div class="card tsk-freeform-proposal" style="margin-top:6px;">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <input type="text" class="freeform-proposal-title" data-idx="${idx}" value="${escapeHtml(it.title || "").replace(/"/g, "&quot;")}" style="flex:2; min-width:160px;">
        <select class="freeform-proposal-urgency" data-idx="${idx}">
          ${["low", "medium", "high", "critical"].map(u => `<option value="${u}" ${u === it.urgency ? "selected" : ""}>${u}</option>`).join("")}
        </select>
        <input type="date" class="freeform-proposal-due" data-idx="${idx}" value="${escapeHtml(it.due_date || taskSuggestedDeadline(it.urgency || "medium"))}" title="Urgency deadline">
        <button type="button" class="secondary freeform-proposal-push" data-idx="${idx}" title="Push deadline one week">+7d</button>
        <button type="button" class="secondary freeform-proposal-dismiss-deadline" data-idx="${idx}">No deadline</button>
        <span class="pill">${it.estimate_hours != null ? escapeHtml(String(it.estimate_hours)) + "h" : "no estimate"}</span>
        <button class="primary freeform-proposal-add" data-idx="${idx}">Add</button>
        <button class="secondary freeform-proposal-skip" data-idx="${idx}">Skip</button>
      </div>
      <p class="stub" style="margin-top:4px; white-space:pre-wrap;">${escapeHtml(it.notes || "")}${it.estimate_note ? ` — ${escapeHtml(it.estimate_note)}` : ""}</p>
    </div>`).join("");
  return `
    ${rows}
    <div class="card" style="display:flex; gap:8px;">
      <button class="primary" id="task-freeform-add-all">Add all</button>
      <button class="secondary" id="task-freeform-discard">Discard</button>
    </div>`;
}

async function renderTasksManagementPanel() {
  const qs = TASK_SEARCH ? `?search=${encodeURIComponent(TASK_SEARCH)}` : "";
  const [tasks, contacts, projects, team, betsPayload] = await Promise.all([
    api(`/api/tasks${qs}`),
    api("/api/contacts"),
    api("/api/projects"),
    api("/api/team"),
    api("/api/bets").catch(() => ({ bets: [] })),
  ]);
  TSK_CACHED_BETS = Array.isArray(betsPayload) ? betsPayload : (betsPayload?.bets || []);
  const todayStr = taskTodayStr();
  const defaultDue = "";

  const filteredTasks = tasks
    .filter(taskMatchesDayFilter)
    .filter(t => !TASK_PROJECT_FILTER || String(t.project_id || "") === TASK_PROJECT_FILTER)
    .filter(tskMatchesKeywordFilter)
    .filter(tskMatchesBucketFilter);
  const deferredSchool = filteredTasks.filter(t => taskIsOpen(t) && tskHomeworkDeferred(t, todayStr));
  const activeOpen = t => taskIsOpen(t) && (TASK_SHOW_DEFERRED || !tskHomeworkDeferred(t, todayStr));
  const overdueItems = filteredTasks.filter(t => activeOpen(t) && t.due_date && t.due_date < todayStr);
  const openItems = filteredTasks.filter(t => t.status === "todo" && activeOpen(t) && !(t.due_date && t.due_date < todayStr));
  const partialItems = filteredTasks.filter(t => t.status === "partial" && activeOpen(t) && !(t.due_date && t.due_date < todayStr));
  const doneItems = filteredTasks.filter(t => t.status === "done");

  const groups = [
    { label: "Overdue", key: "overdue", items: tskSortTasks(overdueItems, TASK_SORT_MODE, todayStr) },
    { label: "Open", key: "open", items: tskSortTasks(openItems, TASK_SORT_MODE, todayStr) },
    { label: "Partial", key: "partial", items: tskSortTasks(partialItems, TASK_SORT_MODE, todayStr) },
    { label: "Later schoolwork", key: "later", items: TASK_SHOW_DEFERRED ? [] : tskSortTasks(deferredSchool, TASK_SORT_MODE, todayStr) },
    { label: "Done", key: "done", items: doneItems },
  ];

  const catOptions = (CONFIG.categories || []).map(c => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`).join("");

  const optsWithSelected = (list, valueKey, labelKey, selected) => list.map(o =>
    `<option value="${escapeHtml(o[valueKey])}" ${String(o[valueKey]) === String(selected ?? "") ? "selected" : ""}>${escapeHtml(o[labelKey])}</option>`
  ).join("");
  const catOptsWithSelected = (selected) => (CONFIG.categories || []).map(c =>
    `<option value="${escapeHtml(c.key)}" ${c.key === selected ? "selected" : ""}>${escapeHtml(c.label)}</option>`
  ).join("");

  const rowHtml = (t, opts = {}) => {
    const draggable = opts.draggable !== false;
    const doneVal = t.progress_done ?? 0;
    const totalVal = t.progress_total;
    const pct = totalVal ? Math.min(100, Math.round((doneVal / totalVal) * 100)) : 0;
    const editOpen = OPEN_TASK_EDIT.has(t.id);
    const handle = draggable && !editOpen ? taskDragHandleHtml() : "";
    const isDone = t.status === "done";
    const deferred = tskHomeworkDeferred(t, todayStr);
    const bucket = tskBucketOf(t);
    const kind = tskDeadlineKind(t);
    const doneRowClass = isDone ? "done tsk-row-done" : "";
    const urgencyRowClass = !isDone ? `tsk-row-urgency-${escapeHtml(t.urgency)}` : "";
    const deferredClass = deferred && !isDone ? " tsk-row-deferred" : "";
    const bumpBtn = taskIsOpen(t) ? taskImportanceBumpHtml(t) : "";
    const overdueDays = taskIsOpen(t) && t.due_date && t.due_date < todayStr
      ? Math.max(1, Math.round((new Date(todayStr + "T00:00:00") - new Date(t.due_date + "T00:00:00")) / 86400000))
      : 0;
    const overdueAgeClass = overdueDays ? ` tsk-overdue-age-${Math.min(3, Math.ceil(overdueDays / 7))}` : "";
    const blocked = tskTaskBlocked(t);
    const openBet = tskOpenBetFor(t.id);
    const betPool = (TSK_CACHED_BETS || []).filter(b => Number(b.task_id) === Number(t.id) && b.status === "forfeit")
      .reduce((sum, b) => sum + Number(b.coins || 0), 0);

    let dueChip = "";
    if (t.due_date) {
      const due = new Date(t.due_date + "T00:00:00");
      const today = new Date(todayStr + "T00:00:00");
      const diffDays = Math.round((due - today) / 86400000);
      const dueClass = taskDueChipClass(diffDays);
      const dueLabel = diffDays < 0 ? "overdue" : diffDays === 0 ? "today" : t.due_date.slice(5);
      dueChip = `<span class="tsk-due-chip ${dueClass}">${escapeHtml(dueLabel)}</span>`;
    }

    const progressSliver = totalVal ? `
      <span class="tsk-progress-sliver" title="${escapeHtml(String(doneVal))}/${escapeHtml(String(totalVal))}${escapeHtml(t.progress_unit || "")}">
        <span class="tsk-progress-sliver-fill tsk-urgency-${escapeHtml(t.urgency)}" style="width:${pct}%; background:${URGENCY_COLOR[t.urgency] || "var(--border)"};"></span>
      </span>
      <input type="number" class="task-progress-done" data-id="${t.id}" value="${doneVal}" style="width:36px; font-size:11px; padding:1px 2px;" title="Progress">` : "";

    return `
      <div class="task-row-wrap tsk-row-wrap${overdueAgeClass}${deferredClass}" data-id="${t.id}" id="task-row-wrap-${t.id}" tabindex="0" data-due="${escapeHtml(t.due_date || "")}" data-kind="${escapeHtml(kind)}" data-bucket="${escapeHtml(bucket)}" data-blocked="${blocked ? "1" : "0"}" data-prerequisite="${escapeHtml(String(t.prerequisite_id || ""))}"${overdueDays ? ` data-overdue-days="${overdueDays}"` : ""}>
        <div class="task-row tsk-row ${doneRowClass} ${urgencyRowClass}" data-urgency="${escapeHtml(t.urgency)}">
          ${handle}
          <input type="checkbox" class="task-done" data-id="${t.id}" ${isDone ? "checked" : ""} title="Not done until you click this">
          <span class="tsk-row-title task-title">${escapeHtml(t.title)}</span>
          ${taskCategoryChipHtml(t.category)}
          ${taskProjectTagHtml(t.project_id, projects)}
          ${taskIsOpen(t) ? urgencyChipHtml(t, todayStr) : ""}
          ${dueChip}
          <span class="tsk-kind-pill tsk-kind-${escapeHtml(kind)}" title="Definite vs indefinite">${kind === "hard" ? "definite" : "indefinite"}</span>
          <span class="tsk-bucket-pill tsk-bar-${escapeHtml(bucket)}">${escapeHtml(bucket)}</span>
          ${deferred ? '<span class="pill" title="ALEKS / homework stays off today until the last two days">not work yet</span>' : ""}
          ${t.created_by === "ai" || t.created_by === "napkin" ? `<span class="tsk-ai-badge" title="Created by ${escapeHtml(t.created_by)}">${t.created_by === "ai" ? "AI" : "Napkin"}</span>` : ""}
          ${tskKeywordsOf(t).map(tag => `<span class="tsk-tag">${escapeHtml(tag)}</span>`).join("")}
          ${progressSliver}
          ${bumpBtn}
          <div class="tsk-row-actions">
            ${openBet ? `<span class="task-bet-stake pill" title="Staked on finishing by ${escapeHtml(openBet.due_date || t.due_date || "")}">staked ${escapeHtml(String(openBet.coins))}</span>` : ""}
            ${betPool ? `<span class="task-bet-pool pill" title="Forfeited into the pool">pool ${escapeHtml(String(betPool))}</span>` : ""}
            <button class="secondary task-bet" data-id="${t.id}" data-due="${escapeHtml(t.due_date || "")}" title="Bet coins you will finish this by a day — money goes into a pool">Bet</button>
            ${overdueDays && !isDone ? `<button class="secondary task-forfeit" data-id="${t.id}" data-due="${escapeHtml(t.due_date || "")}" title="Put money away into the pool for missing this task">Forfeit</button>` : ""}
            <button class="secondary task-edit-toggle" data-id="${t.id}" title="Edit task">${editOpen ? "Close" : "Edit"}</button>
            <button class="secondary icon-circle task-delete" data-id="${t.id}" title="Delete task" aria-label="Delete task">×</button>
          </div>
        </div>
        <div class="tsk-row-description" ${t.description ? "" : "hidden"}>${escapeHtml(t.description || "")}</div>
        <div id="task-edit-${t.id}" class="task-edit-panel" style="${editOpen ? "" : "display:none;"}">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input type="text" class="task-edit-title" data-id="${t.id}" value="${escapeHtml(t.title || "").replace(/"/g, "&quot;")}" placeholder="Title" style="flex:2; min-width:180px;">
            <select class="task-edit-urgency" data-id="${t.id}">
              ${["low", "medium", "high", "critical"].map(u => `<option value="${u}" ${u === t.urgency ? "selected" : ""}>${u}</option>`).join("")}
            </select>
            <span class="tsk-deadline-controls">
              <input type="date" class="task-edit-due" data-id="${t.id}" value="${escapeHtml(t.due_date || "")}">
              <button type="button" class="secondary task-edit-push-deadline" data-id="${t.id}" title="Push deadline one week">+7d</button>
              <button type="button" class="secondary task-edit-dismiss-deadline" data-id="${t.id}">No deadline</button>
            </span>
            <select class="task-edit-prerequisite" data-id="${t.id}" title="Must finish first">
              <option value="">no prerequisite</option>
              ${tasks.filter(other => other.id !== t.id).slice(0, 80).map(other =>
                `<option value="${other.id}" ${Number(t.prerequisite_id) === Number(other.id) ? "selected" : ""}>${escapeHtml(other.title || `#${other.id}`)}</option>`
              ).join("")}
            </select>
            <select class="task-edit-category" data-id="${t.id}"><option value="">no category</option>${catOptsWithSelected(t.category)}</select>
            <select class="task-edit-deadline-kind" data-id="${t.id}" title="Definite vs indefinite">
              <option value="indefinite" ${kind === "indefinite" ? "selected" : ""}>indefinite</option>
              <option value="hard" ${kind === "hard" ? "selected" : ""}>definite / hard</option>
            </select>
            <select class="task-edit-bucket" data-id="${t.id}" title="School / work / life">
              ${TASK_BUCKETS.map(b => `<option value="${b}" ${bucket === b ? "selected" : ""}>${b}</option>`).join("")}
            </select>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
            <input type="number" class="task-edit-total" data-id="${t.id}" value="${t.progress_total ?? ""}" placeholder="total (optional)" style="width:120px;">
            <input type="text" class="task-edit-unit" data-id="${t.id}" value="${escapeHtml(t.progress_unit || "").replace(/"/g, "&quot;")}" placeholder="unit e.g. h" style="width:90px;">
            <input type="number" class="task-edit-estimate" data-id="${t.id}" value="${t.estimate_minutes ?? ""}" placeholder="est. min" style="width:90px;" title="Estimated minutes">
            <input type="text" class="task-edit-tags" data-id="${t.id}" value="${escapeHtml(t.tags || "").replace(/"/g, "&quot;")}" placeholder="tags (speaking, aleks)" style="width:180px;">
            <select class="task-edit-contact" data-id="${t.id}"><option value="">no contact</option>${optsWithSelected(contacts, "id", "name", t.contact_id)}</select>
            <select class="task-edit-project" data-id="${t.id}"><option value="">no project</option>${optsWithSelected(projects, "id", "name", t.project_id)}</select>
            <select class="task-edit-assignee" data-id="${t.id}"><option value="">unassigned</option>${optsWithSelected(team, "id", "name", t.assignee_id)}</select>
          </div>
          <textarea class="task-edit-description" data-id="${t.id}" placeholder="Description — what this task entails" style="width:100%; margin-top:8px; min-height:70px;">${escapeHtml(t.description || "")}</textarea>
          <textarea class="task-edit-notes" data-id="${t.id}" placeholder="Private notes / working details" style="width:100%; margin-top:8px; min-height:60px;">${escapeHtml(t.notes || "")}</textarea>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button class="primary task-edit-save" data-id="${t.id}">Save</button>
            <button class="secondary task-edit-cancel" data-id="${t.id}">Cancel</button>
          </div>
          <div style="margin-top:10px; border-top:1px solid var(--gridline); padding-top:8px;">
            <strong style="font-size:12px;">Attachments</strong>
            <div id="task-attachments-${t.id}" class="task-attachments-panel"></div>
          </div>
        </div>
      </div>`;
  };

  const groupHeaderExtras = (g) => {
    return "";
  };

  TSK_CACHED_TASKS = tasks;
  TSK_CACHED_PROJECTS = projects;

  const groupsHtml = groups.map(g => {
    if (g.key === "later" && !g.items.length) return "";
    if (g.key === "partial" && !g.items.length) return "";
    if (g.key === "done") {
      return `
    <details class="card tsk-done-details"${TASK_DONE_EXPANDED ? " open" : ""}>
      <summary class="tsk-done-summary">Done <span class="pill">${g.items.length}</span></summary>
      <div style="margin-top:6px;">
        <div class="tsk-group-head" style="margin-bottom:4px;">
          ${g.items.length ? `<button type="button" class="secondary tsk-clear-completed" style="margin-left:auto;">Clear completed</button>` : ""}
        </div>
        ${g.items.map(rowHtml).join("") || '<p class="stub">Nothing here.</p>'}
      </div>
    </details>`;
    }
    return `
    <div class="card${g.key === "overdue" ? " tsk-overdue-card" : ""}">
      <div class="tsk-group-head">
        <strong>${escapeHtml(g.label)}</strong> <span class="pill">${g.items.length}</span>
        ${groupHeaderExtras(g)}
      </div>
      ${g.key === "overdue" ? '<p class="tsk-overdue-concierge">These have been waiting very patiently. Your move.</p>' : ""}
      ${g.key === "later" ? '<p class="tsk-overdue-concierge">ALEKS and homework stay off today until the last two days.</p>' : ""}
      ${g.items.map(rowHtml).join("") || (g.key === "open" ? '<p class="stub">No pressure captured — add one task or pull from backlog.</p>' : '<p class="stub">Nothing here.</p>')}
    </div>`;
  }).join("");

  const contactOptions = contacts.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  const projectOptions = projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");

  const railAddForm = `
    <div class="card tsk-add-card" style="margin-bottom:8px;">
      <div class="tsk-add-row">
        <input type="text" id="new-task-title" placeholder="Add task — !critical @fri #category">
        <button class="primary" id="add-task">Add</button>
        <button type="button" class="secondary tsk-freeform-toggle" id="task-freeform-toggle">${TASK_FREEFORM_OPEN || TASK_FREEFORM_PROPOSALS !== null ? "Hide AI capture" : "AI capture"}</button>
        <p class="tsk-duplicate-hint" id="tsk-duplicate-hint" hidden></p>
      </div>
      <div class="tsk-add-extras" id="tsk-add-extras">
        <textarea id="new-task-description" class="tsk-add-description" placeholder="Description — what this task entails"></textarea>
        <select id="new-task-urgency">
          <option value="low">low</option>
          <option value="medium" selected>medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button class="secondary" id="suggest-urgency" title="Ask AI to classify urgency">Suggest</button>
        <span class="tsk-deadline-controls">
          <input type="date" id="new-task-due" value="${escapeHtml(defaultDue)}">
          <span class="tsk-deadline-hint" id="new-task-deadline-hint">${TASK_NEW_DEADLINE_DISMISSED || !defaultDue ? "No deadline unless you pick one" : "Suggested from urgency"}</span>
          <button type="button" class="secondary" id="new-task-push-deadline">Push +7d</button>
          <button type="button" class="secondary" id="new-task-dismiss-deadline">No deadline</button>
        </span>
        <select id="new-task-category"><option value="">no category</option>${catOptions}</select>
        <input type="number" id="new-task-total" placeholder="total" style="width:80px;">
        <input type="text" id="new-task-unit" placeholder="unit" style="width:70px;">
        <select id="new-task-contact"><option value="">no contact</option>${contactOptions}</select>
        <select id="new-task-project"><option value="">no project</option>${projectOptions}</select>
        <input type="text" id="new-task-tags" placeholder="tags (speaking, school)" style="width:160px;">
        <input type="number" id="new-task-estimate" placeholder="est. min" style="width:80px;" title="Estimated minutes">
        <select id="new-task-deadline-kind">
          <option value="indefinite">indefinite</option>
          <option value="hard">hard deadline</option>
        </select>
      </div>
    </div>
    ${freeformCaptureHtml()}`;

  const management = `
    <div class="tsk-fused-extras">
        ${tskAlwaysBarHtml(tasks, todayStr)}
        ${railAddForm}
        ${deliverablesBoardHtml(tasks)}
        <div class="card">
          ${buildTaskDayFilterStrip(todayStr)}
          ${tskKeywordChipRow()}
          <p class="stub" style="margin:0 0 8px;">Drag a task onto a day to change its due date (undo from the toast). Bet coins on finishing by a day; forfeit missed tasks into the pool.</p>
          <div class="tsk-filter-row">
            <input type="text" id="task-search" placeholder="Search…" value="${escapeHtml(TASK_SEARCH).replace(/"/g, "&quot;")}">
            <select id="tsk-project-filter" aria-label="Filter tasks by project">
              <option value="">All projects</option>
              ${projects.map(p => `<option value="${p.id}"${String(p.id) === TASK_PROJECT_FILTER ? " selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
            </select>
            <select id="tsk-sort-select" aria-label="Sort tasks">
              <option value="urgent"${TASK_SORT_MODE === "urgent" ? " selected" : ""}>Urgent top</option>
              <option value="added"${TASK_SORT_MODE === "added" ? " selected" : ""}>Last added</option>
              <option value="deadline"${TASK_SORT_MODE === "deadline" ? " selected" : ""}>Soonest deadline</option>
              <option value="manual"${TASK_SORT_MODE === "manual" ? " selected" : ""}>Manual drag</option>
            </select>
            <div class="seg-pill" role="group" aria-label="Task view">
              <button type="button" class="seg-pill-btn task-view-btn${TASK_VIEW === "list" ? " active" : ""}" data-view="list">List</button>
              <button type="button" class="seg-pill-btn task-view-btn${TASK_VIEW === "weekly" ? " active" : ""}" data-view="weekly">Weekly</button>
            </div>
            <button type="button" class="secondary" id="task-cleanup-ai" title="Rewrite titles, add help, estimates, and project links">Cleanup with AI</button>
            <button type="button" class="secondary" id="task-reorganise" title="Pack hard deadlines onto upcoming days, then open the month hour-by-hour">Reorganise</button>
            <button type="button" class="secondary" id="task-place-hours" title="Open Calendar month hour-by-hour">Place on month</button>
            <button type="button" class="secondary" id="task-rollover" title="Unfinished stays unfinished — push dated leftovers to tomorrow, then replan">Replan remaining</button>
            <button type="button" class="secondary" id="task-speaking" title="Tasks that involve speaking">Speaking</button>
            <button type="button" class="secondary" id="task-bulk" title="Paste a list of tasks">Bulk import</button>
            <button type="button" class="secondary" id="task-est-game" title="Guess how long a task will take">Estimate game</button>
            <button type="button" class="secondary" id="task-actual-game" title="Log how long it actually took">Time-taken game</button>
          </div>
          ${buildUrgencyPinnedPanel(tasks, todayStr)}
          <div class="tsk-list-shell" ${TASK_VIEW === "weekly" ? "hidden" : ""}>
            ${groupsHtml}
          </div>
        </div>
    </div>`;

  return { railAddForm, management };
}

async function renderTasks() {
  PLN_SHELL_FOCUS = "rail";
  const shell = await renderPlannerFusedShell();
  const { management } = await renderTasksManagementPanel();
  return replacePlannerModeChipsWithSubnav(shell)
    .replace('<div id="pln-tab-extras"></div>', `<div id="pln-tab-extras">${tasksScopedStyles()}${management}</div>`);
}

function wireTasks() {
  wirePlannerShell();

  document.querySelectorAll(".tsk-day-chip").forEach(chip => {
    chip.onclick = () => {
      TASK_DAY_FILTER = chip.dataset.day || null;
      render();
    };
  });

  document.querySelectorAll(".tsk-urgency-chip").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if (TASK_URGENCY_EXPANDED.has(id)) TASK_URGENCY_EXPANDED.delete(id);
      else TASK_URGENCY_EXPANDED.add(id);
      const detail = document.querySelector(`.tsk-urgency-breakdown[data-id="${id}"]`);
      detail?.classList.toggle("tsk-urgency-breakdown-hidden");
    };
  });

  tskWireImportanceBumps();

  document.querySelectorAll(".tsk-radar-item").forEach(item => {
    item.onclick = () => tskScrollToTask(Number(item.dataset.scrollTask));
  });

  document.getElementById("task-cleanup-ai")?.addEventListener("click", async () => {
    const btn = document.getElementById("task-cleanup-ai");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    tskToast("Cleaning tasks…", "info");
    try {
      const result = await api("/api/tasks/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: [] }),
      });
      if (result.error) {
        tskToast(result.error, "warn");
        return;
      }
      const updated = result.updated || [];
      for (const task of updated) {
        tskMergeTaskCache(task);
        tskPatchTaskRow(task, TSK_CACHED_PROJECTS);
      }
      tskRefreshRadarStrip();
      const n = updated.length;
      tskToast(n ? `Cleaned ${n} task${n === 1 ? "" : "s"}` : "No tasks needed cleanup", n ? "good" : "info");
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    } finally {
      btn.disabled = false;
    }
  });

  const reorg = async (path, okMsg, { placeHours = false } = {}) => {
    try {
      const result = await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      tskToast(okMsg(result), "good");
      if (placeHours) tskOpenMonthHours();
      else render();
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    }
  };
  document.getElementById("task-reorganise")?.addEventListener("click", () => reorg("/api/tasks/reorganise", r => `Reorganised ${r.count || 0} hard-deadline task(s)`, { placeHours: true }));
  document.getElementById("task-place-hours")?.addEventListener("click", () => tskOpenMonthHours());
  document.getElementById("task-rollover")?.addEventListener("click", async () => {
    try {
      const rolled = await api("/api/tasks/rollover", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const packed = await api("/api/tasks/reorganise", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      tskToast(`Still not-done. Rolled ${rolled.count || 0}, then packed ${packed.count || 0} remaining deadline(s).`, "good");
      tskOpenMonthHours();
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    }
  });
  document.getElementById("task-speaking")?.addEventListener("click", async () => {
    try {
      const rows = await api("/api/tasks/speaking");
      TASK_KEYWORD_FILTER = TASK_KEYWORD_FILTER === "speaking" ? "" : "speaking";
      TASK_SEARCH = TASK_KEYWORD_FILTER ? "speak" : "";
      const n = Array.isArray(rows) ? rows.length : 0;
      tskToast(n ? `${n} speaking task(s)` : "No speaking tasks", "info");
      render();
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    }
  });
  document.getElementById("task-bulk")?.addEventListener("click", async () => {
    const text = window.prompt("Paste tasks, one per line:");
    if (!text) return;
    try {
      const preview = await api("/api/tasks/bulk-preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, kind: "task" }),
      });
      const items = preview.items || [];
      if (!items.length) { tskToast("Nothing to import", "info"); return; }
      const ok = window.confirm(`Import ${items.length} task(s)? ${items.filter(i => i.duplicate).length} look like duplicates and will be skipped.`);
      if (!ok) return;
      const result = await api("/api/tasks/bulk-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      tskToast(`Added ${result.count || 0}`, "good");
      render();
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    }
  });
  const logTimeGame = async (kind) => {
    const title = window.prompt(kind === "minigame" ? "Which task are you estimating?" : "Which task did you just finish?");
    if (!title) return;
    const estimated = Number(window.prompt("Your estimate in minutes:") || "");
    const actual = kind === "actual" ? Number(window.prompt("How many minutes did it actually take?") || "") : null;
    try {
      await api("/api/tasks/time-log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, estimated_minutes: estimated || null, actual_minutes: actual || null, kind }),
      });
      tskToast("Logged — estimates get sharper over time", "good");
      if (typeof wgQuestProgress === "function") wgQuestProgress(kind === "actual" ? "actual1" : "estimate1");
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    }
  };
  document.getElementById("task-est-game")?.addEventListener("click", () => tskOpenEstimateGame("minigame"));
  document.getElementById("task-actual-game")?.addEventListener("click", () => tskOpenEstimateGame("actual"));
  document.getElementById("task-bucket-game")?.addEventListener("click", () => tskOpenBucketGame());
  document.getElementById("tsk-show-deferred")?.addEventListener("click", () => {
    TASK_SHOW_DEFERRED = !TASK_SHOW_DEFERRED;
    render();
  });
  document.getElementById("task-napkin-add-all")?.addEventListener("click", async () => {
    const btn = document.getElementById("task-napkin-add-all");
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }
    try {
      const created = await tskAddAllNotAddedFromNapkin();
      tskToast(created.length ? `Added ${created.length} napkin task(s)` : "Every napkin note is already a task", created.length ? "good" : "info");
      render();
    } catch (err) {
      tskToast(errorMessage(err), "warn");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Add all not-added from napkin"; }
    }
  });
  document.querySelectorAll(".tsk-keyword-chip").forEach(btn => {
    btn.onclick = async e => {
      const key = btn.dataset.key;
      if (e.altKey && TSK_FOCUSED_ID) {
        const task = tskCachedTask(TSK_FOCUSED_ID);
        if (task) {
          const tags = tskTagList(task);
          if (!tags.includes(key)) tags.push(key);
          const updated = await api(`/api/tasks/${task.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: tskSetTags(task, tags) }),
          });
          tskMergeTaskCache(updated);
          tskToast(`Tagged “${task.title}” ${key}`, "good");
          render();
        }
        return;
      }
      TASK_KEYWORD_FILTER = TASK_KEYWORD_FILTER === key ? "" : key;
      render();
    };
  });
  document.querySelectorAll(".tsk-bucket-chip").forEach(btn => {
    btn.onclick = () => {
      TASK_BUCKET_FILTER = TASK_BUCKET_FILTER === btn.dataset.bucket ? "" : btn.dataset.bucket;
      render();
    };
  });
  document.getElementById("task-classify-all")?.addEventListener("click", async () => {
    let n = 0;
    for (const task of (TSK_CACHED_TASKS || []).filter(taskIsOpen)) {
      const next = tskClassifyKeywords(task);
      if (next === (task.tags || "")) continue;
      const updated = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
      tskMergeTaskCache(updated);
      n += 1;
    }
    tskToast(n ? `Tagged ${n} task(s)` : "Nothing new to classify", n ? "good" : "info");
    render();
  });

  document.getElementById("task-freeform-toggle")?.addEventListener("click", () => {
    if (TASK_FREEFORM_PROPOSALS !== null) {
      TASK_FREEFORM_PROPOSALS = null;
      TASK_FREEFORM_TEXT = "";
      TASK_FREEFORM_OPEN = false;
    } else {
      TASK_FREEFORM_OPEN = !TASK_FREEFORM_OPEN;
    }
    render();
  });

  document.getElementById("task-search")?.addEventListener("input", e => {
    TASK_SEARCH = e.target.value;
    render();
  });

  document.getElementById("tsk-project-filter")?.addEventListener("change", e => {
    TASK_PROJECT_FILTER = e.target.value;
    render();
  });

  document.getElementById("tsk-sort-select")?.addEventListener("change", e => {
    TASK_SORT_MODE = e.target.value;
    localStorage.setItem("taskSortMode", TASK_SORT_MODE);
    render();
  });

  document.querySelectorAll(".task-view-btn").forEach(btn => {
    btn.onclick = () => {
      if (TASK_VIEW === btn.dataset.view) return;
      TASK_VIEW = btn.dataset.view;
      render();
    };
  });

  const weekToggle = document.querySelector(".tsk-deliv-week-toggle");
  if (weekToggle) {
    weekToggle.onclick = () => {
      TASK_DELIVERABLES_WEEK = TASK_DELIVERABLES_WEEK === 0 ? 1 : 0;
      render();
    };
  }

  document.querySelectorAll(".tsk-deliv-chip").forEach(chip => {
    chip.onclick = () => tskScrollToTask(Number(chip.dataset.id));
  });

  document.querySelectorAll(".tsk-sort-btn").forEach(btn => {
    btn.onclick = () => {
      if (TASK_SORT_MODE === btn.dataset.sort) return;
      TASK_SORT_MODE = btn.dataset.sort;
      localStorage.setItem("taskSortMode", TASK_SORT_MODE);
      render();
    };
  });

  document.querySelector(".tsk-done-details")?.addEventListener("toggle", e => {
    TASK_DONE_EXPANDED = e.target.open;
  });

  const clearBtn = document.querySelector(".tsk-clear-completed");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      const doneIds = Array.from(document.querySelectorAll(".task-row-wrap"))
        .filter(w => w.querySelector(".task-row.tsk-row-done"))
        .map(w => Number(w.dataset.id));
      if (!doneIds.length) return;
      if (!window.confirm(`Delete ${doneIds.length} completed task(s)? This cannot be undone.`)) return;
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing...";
      try {
        for (const id of doneIds) {
          await api(`/api/tasks/${id}`, { method: "DELETE" });
        }
        render();
      } catch (err) {
        showToast(errorMessage(err));
        clearBtn.disabled = false;
        clearBtn.textContent = "Clear completed";
      }
    };
  }

  const addTaskBtn = document.getElementById("add-task");
  const newTaskTitle = document.getElementById("new-task-title");
  const duplicateHint = document.getElementById("tsk-duplicate-hint");
  if (newTaskTitle && duplicateHint) {
    newTaskTitle.addEventListener("input", () => {
      const parsed = parseQuickAddTitle(newTaskTitle.value);
      const duplicates = tskFindLocalDuplicates(parsed.title);
      duplicateHint.hidden = !duplicates.length;
      duplicateHint.textContent = duplicates.length
        ? `Possible duplicate: ${duplicates.slice(0, 2).map(t => `“${t.title}”`).join(", ")}`
        : "";
    });
  }
  const newUrgencyEl = document.getElementById("new-task-urgency");
  const newDueEl = document.getElementById("new-task-due");
  const newDeadlineHint = document.getElementById("new-task-deadline-hint");
  if (newUrgencyEl && newDueEl) {
    newUrgencyEl.onchange = () => {
      if (TASK_NEW_DUE_TOUCHED || TASK_NEW_DEADLINE_DISMISSED) return;
      newDueEl.value = taskSuggestedDeadline(newUrgencyEl.value);
      if (newDeadlineHint) newDeadlineHint.textContent = "Suggested from urgency";
    };
    newDueEl.onchange = () => {
      TASK_NEW_DUE_TOUCHED = true;
      TASK_NEW_DEADLINE_DISMISSED = false;
      if (newDeadlineHint) newDeadlineHint.textContent = "Deadline chosen";
    };
  }
  document.getElementById("new-task-push-deadline")?.addEventListener("click", () => {
    if (!newDueEl || !newUrgencyEl) return;
    newDueEl.value = taskAddDays(newDueEl.value || taskSuggestedDeadline(newUrgencyEl.value), 7);
    TASK_NEW_DUE_TOUCHED = true;
    TASK_NEW_DEADLINE_DISMISSED = false;
    if (newDeadlineHint) newDeadlineHint.textContent = "Pushed down by 7 days";
  });
  document.getElementById("new-task-dismiss-deadline")?.addEventListener("click", () => {
    if (!window.confirm("Actively dismiss this deadline and create an undated task?")) return;
    if (newDueEl) newDueEl.value = "";
    TASK_NEW_DUE_TOUCHED = true;
    TASK_NEW_DEADLINE_DISMISSED = true;
    if (newDeadlineHint) newDeadlineHint.textContent = "Deadline actively dismissed";
  });
  if (addTaskBtn) addTaskBtn.onclick = async () => {
    const rawTitle = document.getElementById("new-task-title")?.value.trim();
    if (!rawTitle) return;

    const parsed = parseQuickAddTitle(rawTitle);
    const title = parsed.title;
    const hadPowerSyntax = !!(parsed.urgency || parsed.due_date || parsed.category);
    if (!title) {
      showToast("Title is empty after removing syntax tokens.");
      return;
    }

    const localDuplicates = tskFindLocalDuplicates(title);
    if (localDuplicates.length) {
      const names = localDuplicates.slice(0, 3).map(t => `“${t.title}”`).join(", ");
      tskToast(`Duplicate check: ${names} already ${localDuplicates.length === 1 ? "exists" : "exist"}.`, "warn");
    }

    const { similar } = await api("/api/tasks/check-similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (similar && similar.length) {
      const msg = "Similar to existing task(s):\n" + similar.map(s => `- ${s.task.title} (${Math.round(s.score * 100)}%)`).join("\n") + "\n\nAdd anyway?";
      if (!window.confirm(msg)) return;
    }

    const total = document.getElementById("new-task-total").value;

    if (total !== "") {
      const { reference } = await api("/api/tasks/estimate-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (reference && reference.length) {
        showToast("Similar past tasks actually took:\n" +
          reference.map(r => `- ${r.task.title}: ${r.elapsed_hours}h (est. was ${r.task.progress_total}${r.task.progress_unit || ""})`).join("\n"));
      }
    }

    const urgency = parsed.urgency || document.getElementById("new-task-urgency").value;
    const category = parsed.category || document.getElementById("new-task-category").value || null;

    if (parsed.urgency) {
      document.getElementById("new-task-urgency").value = parsed.urgency;
      if (!parsed.due_date && !TASK_NEW_DUE_TOUCHED && !TASK_NEW_DEADLINE_DISMISSED) {
        document.getElementById("new-task-due").value = taskSuggestedDeadline(parsed.urgency);
      }
    }
    if (parsed.due_date) document.getElementById("new-task-due").value = parsed.due_date;
    if (parsed.category) document.getElementById("new-task-category").value = parsed.category;
    const due_date = parsed.due_date || document.getElementById("new-task-due").value || null;

    await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: document.getElementById("new-task-description").value,
        urgency,
        due_date,
        deadline_dismissed: !due_date,
        deadline_kind: document.getElementById("new-task-deadline-kind")?.value || (due_date ? "hard" : "indefinite"),
        category,
        tags: (() => {
          const tags = String(document.getElementById("new-task-tags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
          if (TASK_KEYWORD_FILTER && !tags.includes(TASK_KEYWORD_FILTER)) tags.push(TASK_KEYWORD_FILTER);
          if (TASK_BUCKET_FILTER && !tags.includes(TASK_BUCKET_FILTER)) tags.push(TASK_BUCKET_FILTER);
          return tags.join(",");
        })(),
        estimate_minutes: document.getElementById("new-task-estimate")?.value || null,
        progress_total: total === "" ? null : Number(total),
        progress_unit: document.getElementById("new-task-unit").value || null,
        contact_id: document.getElementById("new-task-contact").value || null,
        project_id: document.getElementById("new-task-project").value || null,
        assignee_id: document.getElementById("new-task-assignee").value || null,
      }),
    });
    TASK_NEW_DEADLINE_DISMISSED = false;
    TASK_NEW_DUE_TOUCHED = false;
    if (hadPowerSyntax) tskMaybeAwardPowerCapture();
    wgQuestProgress("addtask2");
    render();
  };

  const suggestUrgencyBtn = document.getElementById("suggest-urgency");
  if (suggestUrgencyBtn) suggestUrgencyBtn.onclick = async () => {
    const title = document.getElementById("new-task-title")?.value.trim();
    if (!title) return;
    const btn = suggestUrgencyBtn;
    btn.textContent = "..."; btn.disabled = true;
    const result = await api("/api/tasks/suggest-urgency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, notes: document.getElementById("new-task-title").value }),
    });
    if (result.urgency) {
      document.getElementById("new-task-urgency").value = result.urgency;
      if (!TASK_NEW_DUE_TOUCHED && !TASK_NEW_DEADLINE_DISMISSED) {
        document.getElementById("new-task-due").value = result.suggested_deadline || taskSuggestedDeadline(result.urgency);
        if (newDeadlineHint) newDeadlineHint.textContent = "AI urgency deadline";
      }
    }
    btn.textContent = "Suggest"; btn.disabled = false;
  };

  document.querySelectorAll(".task-done").forEach(cb => {
    cb.onchange = async () => {
      const markingDone = cb.checked;
      const id = Number(cb.dataset.id);
      tskToast("Saving…", "info");
      try {
        const updated = await api(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: markingDone ? "done" : "todo" }),
        });
        if (markingDone) {
          tskOnTaskMarkedDone(cb);
          tskOnHighUrgencyTriumph(updated);
        }
        tskMergeTaskCache(updated);
        const row = cb.closest(".task-row");
        if (row) {
          row.classList.toggle("done", markingDone);
          row.classList.toggle("tsk-row-done", markingDone);
          applyTaskRowUrgencyStyle(row, updated.urgency, markingDone);
          row.querySelector(".tsk-urgency-wrap")?.remove();
          row.querySelector(".tsk-urgency-bump")?.remove();
        }
        tskRefreshRadarStrip();
        tskToast("Saved", "good");
      } catch (err) {
        cb.checked = !markingDone;
        tskToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".task-progress-done").forEach(inp => {
    inp.onchange = async () => {
      const id = Number(inp.dataset.id);
      tskToast("Saving…", "info");
      try {
        const updated = await api(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progress_done: Number(inp.value), status: "partial" }),
        });
        tskMergeTaskCache(updated);
        tskPatchTaskRow(updated, TSK_CACHED_PROJECTS);
        tskToast("Saved", "good");
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".task-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this task?")) return;
      const id = Number(btn.dataset.id);
      tskToast("Saving…", "info");
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        tskRemoveTaskRow(id);
        tskToast("Deleted", "good");
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".task-edit-toggle").forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.id);
      const panel = document.getElementById(`task-edit-${id}`);
      if (OPEN_TASK_EDIT.has(id)) {
        OPEN_TASK_EDIT.delete(id);
        panel.style.display = "none";
        btn.textContent = "Edit";
      } else {
        OPEN_TASK_EDIT.add(id);
        panel.style.display = "";
        btn.textContent = "Close";
        await loadTaskAttachments(id);
      }
    };
  });

  document.querySelectorAll(".task-edit-cancel").forEach(btn => {
    btn.onclick = () => {
      OPEN_TASK_EDIT.delete(Number(btn.dataset.id));
      render();
    };
  });

  document.querySelectorAll(".task-edit-push-deadline").forEach(btn => {
    btn.onclick = () => {
      const due = document.querySelector(`.task-edit-due[data-id="${btn.dataset.id}"]`);
      if (due) due.value = taskAddDays(due.value || taskSuggestedDeadline("medium"), 7);
    };
  });
  document.querySelectorAll(".task-edit-dismiss-deadline").forEach(btn => {
    btn.onclick = () => {
      if (!window.confirm("Actively dismiss this task's deadline?")) return;
      const due = document.querySelector(`.task-edit-due[data-id="${btn.dataset.id}"]`);
      if (due) due.value = "";
      btn.dataset.dismissed = "true";
    };
  });

  document.querySelectorAll(".task-edit-save").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const total = document.querySelector(`.task-edit-total[data-id="${id}"]`).value;
      const dueValue = document.querySelector(`.task-edit-due[data-id="${id}"]`).value;
      const dismissButton = document.querySelector(`.task-edit-dismiss-deadline[data-id="${id}"]`);
      if (!dueValue && dismissButton?.dataset.dismissed !== "true"
          && !window.confirm("Save this task without a deadline? This actively dismisses the urgency suggestion.")) {
        return;
      }
      tskToast("Saving…", "info");
      try {
        const updated = await api(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: document.querySelector(`.task-edit-title[data-id="${id}"]`).value.trim(),
            description: document.querySelector(`.task-edit-description[data-id="${id}"]`).value,
            notes: document.querySelector(`.task-edit-notes[data-id="${id}"]`).value,
            urgency: document.querySelector(`.task-edit-urgency[data-id="${id}"]`).value,
            due_date: dueValue || null,
            deadline_dismissed: !dueValue,
            category: document.querySelector(`.task-edit-category[data-id="${id}"]`).value || null,
            progress_total: total === "" ? null : Number(total),
            progress_unit: document.querySelector(`.task-edit-unit[data-id="${id}"]`).value || null,
            contact_id: document.querySelector(`.task-edit-contact[data-id="${id}"]`).value || null,
            project_id: document.querySelector(`.task-edit-project[data-id="${id}"]`).value || null,
            assignee_id: document.querySelector(`.task-edit-assignee[data-id="${id}"]`).value || null,
            prerequisite_id: document.querySelector(`.task-edit-prerequisite[data-id="${id}"]`)?.value || null,
            deadline_kind: document.querySelector(`.task-edit-deadline-kind[data-id="${id}"]`)?.value || (dueValue ? "hard" : "indefinite"),
            estimate_minutes: document.querySelector(`.task-edit-estimate[data-id="${id}"]`)?.value || null,
            tags: (() => {
              const raw = document.querySelector(`.task-edit-tags[data-id="${id}"]`)?.value || "";
              const bucket = document.querySelector(`.task-edit-bucket[data-id="${id}"]`)?.value;
              const tags = raw.split(",").map(t => t.trim()).filter(Boolean).filter(t => !TASK_BUCKETS.includes(t.toLowerCase()));
              if (bucket) tags.push(bucket);
              return tags.join(",");
            })(),
          }),
        });
        tskMergeTaskCache(updated);
        tskPatchTaskRow(updated, TSK_CACHED_PROJECTS);
        tskRefreshRadarStrip();
        tskToast("Saved", "good");
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".task-bet").forEach(btn => {
    btn.onclick = async () => {
      const coins = Number(window.prompt("Stake how many coins you will finish this by a day? Money goes into the pool if you miss.", "10") || "");
      if (!coins || coins < 1) return;
      try {
        const result = await api("/api/bets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: Number(btn.dataset.id), due_date: btn.dataset.due || undefined, coins }),
        });
        tskToast(result.error || (result.forfeit ? `Missed — ${coins} coins into the pool` : `Staked ${coins} coins`), result.error || result.forfeit ? "warn" : "good");
        if (!result.error) render();
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".task-forfeit").forEach(btn => {
    btn.onclick = async () => {
      const coins = Number(window.prompt("Put how many coins away into the pool for missing this task?", "10") || "");
      if (!coins || coins < 1) return;
      try {
        const result = await tskForfeitMissed(btn.dataset.id, btn.dataset.due, coins);
        tskToast(result.error || `Forfeited ${result.coins || coins} into the pool`, result.error ? "warn" : "good");
        if (!result.error) render();
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    };
  });

  OPEN_TASK_EDIT.forEach(id => loadTaskAttachments(id));

  wireTaskFreeformCapture();
  wireTaskDragReorder();
  wireTaskDateDrag();
  tskWireEnterAsDone();
  tskWireDateKeyboard();
}

function wireTaskDateDrag() {
  const setDragData = (e, id) => {
    try { e.dataTransfer.setData("text/task-id", String(id)); } catch (_) {}
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
  };
  const readDragId = e => e.dataTransfer.getData("text/task-id") || e.dataTransfer.getData("text/plain");
  const dueFromTarget = target => {
    if (!target) return "";
    return target.dataset.day || target.dataset.date || target.closest("[data-date]")?.dataset.date
      || target.closest("[data-day]")?.dataset.day || target.querySelector("[data-date]")?.dataset.date || "";
  };
  const dragSources = document.querySelectorAll(".task-row-wrap, .tsk-bar-chip, .tsk-deliv-chip, .tsk-drag-grip");
  dragSources.forEach(row => {
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", e => {
      if (e.target.closest(".task-edit-panel, input, textarea, select, button:not(.tsk-bar-chip):not(.tsk-deliv-chip)")) {
        e.preventDefault();
        return;
      }
      const host = row.closest("[data-id], [data-task-id]") || row;
      const id = host.dataset.id || host.dataset.taskId || row.dataset.id || row.dataset.taskId;
      if (!id) {
        e.preventDefault();
        return;
      }
      setDragData(e, id);
      host.classList.add("tsk-date-dragging");
      TSK_FOCUSED_ID = Number(id);
    });
    row.addEventListener("dragend", () => {
      document.querySelectorAll(".tsk-date-dragging").forEach(el => el.classList.remove("tsk-date-dragging"));
    });
  });
  const dropTargets = document.querySelectorAll(".tsk-day-chip, .tsk-deliv-col, .pln-strip-day, .cal-month-cell, .cal-hour-cell");
  dropTargets.forEach(target => {
    target.addEventListener("dragover", e => {
      if (![...e.dataTransfer.types].includes("text/task-id") && ![...e.dataTransfer.types].includes("text/plain")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      target.classList.add("tsk-date-drop");
    });
    target.addEventListener("dragleave", () => target.classList.remove("tsk-date-drop"));
    target.addEventListener("drop", async e => {
      e.preventDefault();
      e.stopPropagation();
      target.classList.remove("tsk-date-drop");
      const id = readDragId(e);
      const due = dueFromTarget(target);
      if (!id || !due) return;
      try {
        await tskSetDueDate(id, due);
        tskToast(`Due date set to ${due}`, "good");
        render();
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    });
  });
}

function tskWireDateKeyboard() {
  document.querySelectorAll(".task-row-wrap").forEach(row => {
    row.addEventListener("focus", () => { TSK_FOCUSED_ID = Number(row.dataset.id); });
    row.addEventListener("keydown", async e => {
      if (e.target.closest("input, textarea, select, button")) return;
      const id = Number(row.dataset.id);
      if (e.key === "Enter") {
        e.preventDefault();
        row.querySelector(".task-done")?.click();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Backspace") return;
      e.preventDefault();
      const current = row.dataset.due || taskTodayStr();
      if (e.key === "Backspace") {
        try { await tskSetDueDate(id, null); render(); } catch (err) { tskToast(errorMessage(err), "warn"); }
        return;
      }
      const delta = e.key === "ArrowRight" ? (e.altKey ? 7 : 1) : (e.altKey ? -7 : -1);
      const next = taskAddDays(current, delta);
      try {
        await tskSetDueDate(id, next, { kind: "hard" });
        render();
        document.getElementById(`task-row-wrap-${id}`)?.focus();
      } catch (err) {
        tskToast(errorMessage(err), "warn");
      }
    });
  });
}

// Task attachments (multi-file picker + drag-drop). Overrides today.js single-file widget.
async function loadTaskAttachments(taskId) {
  const box = document.getElementById(`task-attachments-${taskId}`);
  if (!box) return;
  const files = await api(`/api/attachments?entity_type=task&entity_id=${taskId}`);
  const rows = files.map(f => `
    <span class="pill" style="display:inline-flex; align-items:center; gap:4px;">
      <a href="/api/attachments/${f.id}/file" target="_blank" rel="noopener">${escapeHtml(f.filename)}</a>
      <button type="button" class="task-attachment-delete" data-attachment="${f.id}" data-task="${taskId}" style="border:none; background:none; cursor:pointer; color:inherit; padding:0;">&times;</button>
    </span>`).join(" ");
  box.innerHTML = `
    <div class="task-attach-zone attach-drop-zone" data-task-id="${taskId}" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:6px 0;">
      ${rows || '<span class="stub" style="font-size:12px;">No files yet. Drop files here or use the picker.</span>'}
      <input type="file" id="task-attachment-input-${taskId}" multiple style="font-size:11px; max-width:220px;">
      <span id="task-attachment-status-${taskId}" class="stub" style="font-size:11px; display:none;"></span>
    </div>`;

  const statusEl = document.getElementById(`task-attachment-status-${taskId}`);
  const uploadPicked = async picked => {
    const list = Array.from(picked || []).filter(Boolean);
    if (!list.length) return;
    if (statusEl) {
      statusEl.style.display = "";
      statusEl.textContent = list.length === 1 ? `Uploading ${list[0].name}…` : `Uploading 1/${list.length}…`;
    }
    const { successes, failures } = await uploadAttachmentFiles(list, {
      entity_type: "task",
      entity_id: taskId,
      onProgress: (cur, total) => {
        if (statusEl) statusEl.textContent = `Uploading ${cur}/${total}…`;
      },
    });
    if (statusEl) statusEl.style.display = "none";
    if (failures.length) {
      const msg = formatUploadResultMessage(successes, failures);
      showToast(msg, successes.length ? "warning" : "error");
    }
    loadTaskAttachments(taskId);
  };

  const inputEl = document.getElementById(`task-attachment-input-${taskId}`);
  if (inputEl) {
    inputEl.onchange = async () => {
      await uploadPicked(inputEl.files);
      inputEl.value = "";
    };
  }
  const zone = box.querySelector(".task-attach-zone");
  if (zone) wireAttachDropZone(zone, { onFiles: uploadPicked });

  box.querySelectorAll(".task-attachment-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this attachment?")) return;
      await api(`/api/attachments/${btn.dataset.attachment}`, { method: "DELETE" });
      loadTaskAttachments(taskId);
    };
  });
}

function wireTaskFreeformCapture() {
  document.getElementById("task-freeform-close")?.addEventListener("click", () => {
    TASK_FREEFORM_OPEN = false;
    render();
  });

  if (TASK_FREEFORM_PROPOSALS === null) {
    const textEl = document.getElementById("task-freeform-text");
    if (textEl) textEl.addEventListener("input", e => { TASK_FREEFORM_TEXT = e.target.value; });
    const parseBtn = document.getElementById("task-freeform-parse");
    if (parseBtn) parseBtn.onclick = async () => {
      const text = (document.getElementById("task-freeform-text").value || "").trim();
      if (!text) return;
      parseBtn.innerHTML = '<span class="spinner"></span>Parsing...'; parseBtn.disabled = true;
      try {
        const result = await api("/api/tasks/parse-freeform", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (result.error) { showToast(result.error); return; }
        TASK_FREEFORM_PROPOSALS = result.items || [];
        TASK_FREEFORM_OPEN = true;
        render();
      } catch (err) {
        showToast(errorMessage(err));
      } finally {
        parseBtn.textContent = "Parse into tasks"; parseBtn.disabled = false;
      }
    };
    return;
  }

  const discardBtn = document.getElementById("task-freeform-discard");
  if (discardBtn) discardBtn.onclick = () => {
    TASK_FREEFORM_PROPOSALS = null;
    TASK_FREEFORM_TEXT = "";
    TASK_FREEFORM_OPEN = false;
    render();
  };

  document.querySelectorAll(".freeform-proposal-urgency").forEach(sel => {
    sel.onchange = () => {
      const idx = Number(sel.dataset.idx);
      const item = TASK_FREEFORM_PROPOSALS[idx];
      const due = document.querySelector(`.freeform-proposal-due[data-idx="${idx}"]`);
      if (!item || !due || item.deadline_touched || item.deadline_dismissed) return;
      item.urgency = sel.value;
      item.due_date = taskSuggestedDeadline(sel.value);
      due.value = item.due_date;
    };
  });
  document.querySelectorAll(".freeform-proposal-due").forEach(inp => {
    inp.onchange = () => {
      const item = TASK_FREEFORM_PROPOSALS[Number(inp.dataset.idx)];
      if (!item) return;
      item.due_date = inp.value || null;
      item.deadline_touched = true;
      item.deadline_dismissed = false;
    };
  });
  document.querySelectorAll(".freeform-proposal-push").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      const item = TASK_FREEFORM_PROPOSALS[idx];
      const due = document.querySelector(`.freeform-proposal-due[data-idx="${idx}"]`);
      if (!item || !due) return;
      due.value = taskAddDays(due.value || taskSuggestedDeadline(item.urgency || "medium"), 7);
      item.due_date = due.value;
      item.deadline_touched = true;
      item.deadline_dismissed = false;
    };
  });
  document.querySelectorAll(".freeform-proposal-dismiss-deadline").forEach(btn => {
    btn.onclick = () => {
      if (!window.confirm("Actively dismiss the deadline for this task?")) return;
      const idx = Number(btn.dataset.idx);
      const item = TASK_FREEFORM_PROPOSALS[idx];
      const due = document.querySelector(`.freeform-proposal-due[data-idx="${idx}"]`);
      if (!item) return;
      if (due) due.value = "";
      item.due_date = null;
      item.deadline_touched = true;
      item.deadline_dismissed = true;
    };
  });

  const createProposal = async (idx) => {
    const item = TASK_FREEFORM_PROPOSALS[idx];
    const titleEl = document.querySelector(`.freeform-proposal-title[data-idx="${idx}"]`);
    const urgencyEl = document.querySelector(`.freeform-proposal-urgency[data-idx="${idx}"]`);
    const dueEl = document.querySelector(`.freeform-proposal-due[data-idx="${idx}"]`);
    const title = ((titleEl ? titleEl.value : item.title) || "").trim();
    if (!title) return;
    await api("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        urgency: urgencyEl ? urgencyEl.value : item.urgency,
        description: item.notes || null,
        due_date: dueEl?.value || null,
        deadline_dismissed: !!item.deadline_dismissed,
        progress_total: item.estimate_hours || null,
        progress_unit: item.estimate_hours ? "h" : null,
      }),
    });
  };

  document.querySelectorAll(".freeform-proposal-add").forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.idx);
      btn.textContent = "Adding..."; btn.disabled = true;
      try {
        await createProposal(idx);
        TASK_FREEFORM_PROPOSALS.splice(idx, 1);
        if (!TASK_FREEFORM_PROPOSALS.length) { TASK_FREEFORM_PROPOSALS = null; TASK_FREEFORM_TEXT = ""; TASK_FREEFORM_OPEN = false; }
        render();
      } catch (err) {
        showToast(errorMessage(err));
        btn.textContent = "Add task"; btn.disabled = false;
      }
    };
  });

  document.querySelectorAll(".freeform-proposal-skip").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      TASK_FREEFORM_PROPOSALS.splice(idx, 1);
      if (!TASK_FREEFORM_PROPOSALS.length) { TASK_FREEFORM_PROPOSALS = null; TASK_FREEFORM_OPEN = false; }
      render();
    };
  });

  const addAllBtn = document.getElementById("task-freeform-add-all");
  if (addAllBtn) addAllBtn.onclick = async () => {
    addAllBtn.innerHTML = '<span class="spinner"></span>Adding...'; addAllBtn.disabled = true;
    try {
      for (let i = 0; i < TASK_FREEFORM_PROPOSALS.length; i++) {
        await createProposal(i);
      }
      TASK_FREEFORM_PROPOSALS = null;
      TASK_FREEFORM_TEXT = "";
      TASK_FREEFORM_OPEN = false;
      render();
    } catch (err) {
      showToast(errorMessage(err));
      addAllBtn.textContent = "Add all"; addAllBtn.disabled = false;
    }
  };
}

function wireTaskDragReorder() {
  if (TASK_SORT_MODE !== "manual") return;

  let draggedId = null;
  document.querySelectorAll(".task-row-wrap").forEach(row => {
    const handle = row.querySelector(".drag-handle");
    if (!handle) return;

    handle.addEventListener("dragstart", e => {
      draggedId = row.dataset.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId);
    });
    handle.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggedId = null;
    });

    row.addEventListener("dragover", e => {
      if (draggedId === null || row.dataset.id === draggedId) return;
      const dragging = row.parentElement.querySelector(".task-row-wrap.dragging");
      if (!dragging || dragging.parentElement !== row.parentElement) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.parentElement.insertBefore(dragging, before ? row : row.nextSibling);
    });

    row.addEventListener("drop", async e => {
      e.preventDefault();
      if (draggedId === null) return;
      const groupCard = row.closest(".card");
      if (!groupCard) return;
      const ids = Array.from(groupCard.querySelectorAll(".task-row-wrap")).map(r => Number(r.dataset.id));
      tskToast("Saving…", "info");
      try {
        await api("/api/tasks/reorder", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        tskToast("Saved", "good");
      } catch (err) {
        tskToast(errorMessage(err), "warn");
        render();
      }
    });
  });
}
