// --- Goals ---------------------------------------------------------

const GOALS_EXPANDED = new Set();
const GOAL_COACH_PROPOSALS = new Map();
const GOAL_PROGRESS_TODAY_KEY = "goalProgressToday";
const GOAL_NUDGE_DISMISSED_KEY = "goalNudgeDismissed";

function ensureGoalDeviceStyles() {
  if (document.getElementById("goal-device-styles")) return;
  const style = document.createElement("style");
  style.id = "goal-device-styles";
  style.textContent = `
    html.device-phone .goal-card-header,
    html.device-coarse .goal-card-header { flex-wrap:wrap; align-items:flex-start !important; }
    html.device-phone .goal-card-header button,
    html.device-phone .goal-progress-control,
    html.device-coarse .goal-card-header button,
    html.device-coarse .goal-progress-control { min-height:36px; }
    @media (max-width:600px), (pointer:coarse), (hover:none) {
      .goal-card-header { flex-wrap:wrap; align-items:flex-start !important; }
      .goal-card-header button, .goal-progress-control { min-height:36px; }
    }
  `;
  document.head.appendChild(style);
}

function goalChunkDone(chunk) {
  return !!chunk.done;
}

function goalLinkedTasks(goal) {
  const candidates = [goal.linked_tasks, goal.tasks, goal.goal_tasks];
  return candidates.find(Array.isArray) || [];
}

function goalTaskProgress(task) {
  if (task.done || task.completed || task.status === "done" || task.status === "completed") return 1;
  const total = Number(task.progress_total);
  const done = Number(task.progress_done);
  if (total > 0 && Number.isFinite(done)) return Math.max(0, Math.min(1, done / total));
  return 0;
}

function goalProgress(goal) {
  const chunks = Array.isArray(goal.chunks) ? goal.chunks : [];
  const linkedTasks = goalLinkedTasks(goal);
  const linkedTotal = linkedTasks.length || Math.max(0, Number(goal.linked_task_count) || 0);
  const linkedDone = linkedTasks.length
    ? linkedTasks.filter(task => goalTaskProgress(task) >= 1).length
    : Math.max(0, Number(goal.linked_task_done) || 0);
  const linkedCredit = linkedTasks.length
    ? linkedTasks.reduce((sum, task) => sum + goalTaskProgress(task), 0)
    : linkedDone;
  const chunkDone = chunks.filter(goalChunkDone).length;
  const total = chunks.length + linkedTotal;
  const done = chunkDone + linkedDone;
  const credit = chunkDone + linkedCredit;
  const calculatedPct = total ? Math.round((credit / total) * 100) : 0;
  const manualPct = goal.progress_pct == null || goal.progress_pct === ""
    ? null
    : Math.max(0, Math.min(100, Number(goal.progress_pct)));
  const pct = Number.isFinite(manualPct) ? Math.round(manualPct) : calculatedPct;
  return { done, total, pct, linkedTotal, linkedDone, linkedCredit, manual: Number.isFinite(manualPct) };
}

function firstOpenChunk(chunks) {
  return chunks.find(c => !goalChunkDone(c)) || null;
}

function goalProgressRing(done, total, pct) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const stroke = pct === 100 && total > 0 ? "var(--status-good)" : "var(--accent)";
  const label = total ? `${done}/${total}` : "—";
  return `<svg class="goal-progress-ring" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style="flex-shrink:0;">
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="var(--gridline)" stroke-width="3"></circle>
    <circle class="goal-progress-ring-value" cx="18" cy="18" r="${r}" fill="none" stroke="${stroke}" stroke-width="3"
      stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 18 18)" stroke-linecap="round"></circle>
    <text x="18" y="19" text-anchor="middle" font-size="7" fill="var(--ink-secondary)">${escapeHtml(label)}</text>
  </svg>`;
}

function goalProgressBar(pct, total) {
  const fill = pct === 100 ? "var(--status-good)" : "var(--accent)";
  return `<div class="goal-progress-bar" role="progressbar" aria-label="Goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
    title="${total ? `${pct}% complete` : "No chunks or linked tasks yet"}"
    style="margin-top:6px; height:5px; border-radius:3px; background:var(--gridline); overflow:hidden; width:min(100%, 280px);">
    <div style="width:${pct}%; height:100%; background:${fill}; transition:width 200ms ease;"></div>
  </div>`;
}

function goalDateIsToday(value) {
  if (!value) return false;
  const text = String(value);
  if (text.slice(0, 10) === localYmd()) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && localYmd(date) === localYmd();
}

function markGoalProgressToday() {
  try { localStorage.setItem(GOAL_PROGRESS_TODAY_KEY, localYmd()); } catch (_) {}
}

function goalsHaveProgressToday(goals) {
  try {
    if (localStorage.getItem(GOAL_PROGRESS_TODAY_KEY) === localYmd()) return true;
  } catch (_) {}
  return goals.some(goal => {
    const chunks = Array.isArray(goal.chunks) ? goal.chunks : [];
    const tasks = goalLinkedTasks(goal);
    return chunks.some(chunk => goalChunkDone(chunk)
      && [chunk.completed_at, chunk.updated_at, chunk.done_at].some(goalDateIsToday))
      || tasks.some(task => goalTaskProgress(task) > 0
        && [task.completed_at, task.updated_at, task.done_at].some(goalDateIsToday));
  });
}

function renderGoalNudge(goals) {
  if (!goals.length || goalsHaveProgressToday(goals)) return "";
  try {
    if (localStorage.getItem(GOAL_NUDGE_DISMISSED_KEY) === localYmd()) return "";
  } catch (_) {}
  return `<div class="card" id="goal-progress-nudge" style="display:flex; align-items:center; gap:10px; border-left:3px solid var(--status-warning);">
    <span aria-hidden="true">🔥</span>
    <div style="flex:1; min-width:0;"><strong>No goal progress logged today.</strong>
      <span class="stub" style="margin-left:4px;">One chunk or linked task keeps the trail warm.</span></div>
    <button type="button" class="secondary" id="goal-nudge-dismiss" title="Dismiss for today" style="padding:2px 8px;">×</button>
  </div>`;
}

function renderGoalNextAction(chunks) {
  if (!chunks.length) {
    return `<div class="stub" style="margin-bottom:10px; padding:8px 10px; border-radius:8px; background:color-mix(in srgb, var(--ink-muted) 8%, var(--bg-card));">No chunks yet — add some by re-chunking or editing below.</div>`;
  }
  const next = firstOpenChunk(chunks);
  if (!next) {
    return `<div style="margin-bottom:10px; padding:8px 10px; border-radius:8px; border-left:3px solid var(--status-good); background:color-mix(in srgb, var(--status-good) 10%, var(--bg-card));">
      <span class="pill status-good" style="margin-right:6px;">Done</span>All chunks complete.
    </div>`;
  }
  const due = next.due_date ? `<span class="pill" style="margin-left:6px;">due ${escapeHtml(next.due_date)}</span>` : "";
  return `<div style="margin-bottom:10px; padding:8px 10px; border-radius:8px; border-left:3px solid var(--accent); background:color-mix(in srgb, var(--accent) 10%, var(--bg-card));">
    <div style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--accent); margin-bottom:4px;">Next action</div>
    <div><strong>${escapeHtml(next.title)}</strong>${due}</div>
  </div>`;
}

function renderGoalCoachQuests(quests = []) {
  if (!quests.length) return "";
  const rows = quests.map(q => `
    <div class="goal-coach-quest-row ${q.done ? "done" : ""}" data-coach-quest-row="${q.id}"
      style="display:flex; align-items:flex-start; gap:8px; padding:7px 0; border-bottom:1px solid var(--gridline);">
      <input type="checkbox" class="goal-coach-quest-done" data-id="${q.id}" ${q.done ? "checked" : ""} style="margin-top:3px;">
      <div style="flex:1; min-width:0;">
        <strong>${escapeHtml(q.title || "")}</strong>
        ${q.description ? `<div class="stub" style="margin-top:2px;">${escapeHtml(q.description)}</div>` : ""}
        ${q.success_criteria ? `<div style="font-size:11px; margin-top:3px;"><span class="pill">win condition</span> ${escapeHtml(q.success_criteria)}</div>` : ""}
      </div>
      ${q.difficulty ? `<span class="pill">${escapeHtml(q.difficulty)}</span>` : ""}
      <button type="button" class="secondary goal-coach-quest-delete" data-id="${q.id}" title="Remove quest"
        style="padding:1px 7px;">×</button>
    </div>`).join("");
  return `<section style="margin-top:12px;">
    <div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--accent);">Accepted quests</div>
    ${rows}
  </section>`;
}

function renderGoalCoachProposal(goalId) {
  const proposal = GOAL_COACH_PROPOSALS.get(String(goalId));
  if (!proposal) return "";
  const ideas = (proposal.ideas || []).map(item => `
    <article style="padding:9px; border:1px solid var(--gridline); border-radius:8px;">
      <strong>${escapeHtml(item.title || "")}</strong>
      ${item.why ? `<p class="stub" style="margin:4px 0;">${escapeHtml(item.why)}</p>` : ""}
      <div style="font-size:12px;"><span class="pill">first move</span> ${escapeHtml(item.first_move || "")}</div>
    </article>`).join("");
  const quests = (proposal.quests || []).map((item, idx) => `
    <article style="padding:9px; border:1px solid var(--gridline); border-radius:8px;">
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <strong style="flex:1;">${escapeHtml(item.title || "")}</strong>
        ${item.difficulty ? `<span class="pill">${escapeHtml(item.difficulty)}</span>` : ""}
      </div>
      ${item.description ? `<p class="stub" style="margin:4px 0;">${escapeHtml(item.description)}</p>` : ""}
      <div style="font-size:12px; margin-bottom:7px;"><span class="pill">win condition</span> ${escapeHtml(item.success_criteria || "")}</div>
      <button type="button" class="secondary goal-coach-accept" data-goal="${goalId}" data-kind="quest" data-index="${idx}">Accept quest</button>
    </article>`).join("");
  const allocations = (proposal.time_allocations || []).map((item, idx) => `
    <article style="padding:9px; border:1px solid var(--gridline); border-radius:8px;">
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <strong style="flex:1;">${escapeHtml(item.title || "")}</strong>
        <span class="pill">${Number(item.minutes) || 0} min</span>
        ${item.cadence ? `<span class="pill">${escapeHtml(item.cadence)}</span>` : ""}
      </div>
      ${item.rationale ? `<p class="stub" style="margin:4px 0 7px;">${escapeHtml(item.rationale)}</p>` : ""}
      <button type="button" class="secondary goal-coach-accept" data-goal="${goalId}" data-kind="time_allocation" data-index="${idx}">Create task…</button>
    </article>`).join("");
  return `<section class="goal-coach-proposal" style="margin-top:12px; padding:10px; border-radius:10px; background:color-mix(in srgb, var(--accent) 7%, var(--bg-card));">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
      <strong style="flex:1;">Coach proposals</strong>
      <span class="pill">nothing saved yet</span>
      <button type="button" class="secondary goal-coach-dismiss" data-goal="${goalId}" style="padding:1px 7px;">×</button>
    </div>
    ${ideas ? `<h4 style="margin:8px 0 5px;">Angles</h4><div style="display:grid; gap:7px;">${ideas}</div>` : ""}
    ${quests ? `<h4 style="margin:12px 0 5px;">Quests</h4><div style="display:grid; gap:7px;">${quests}</div>` : ""}
    ${allocations ? `<h4 style="margin:12px 0 5px;">Time allocations</h4><div style="display:grid; gap:7px;">${allocations}</div>` : ""}
  </section>`;
}

function renderGoalCard(g) {
  const goalId = String(g.id);
  const expanded = GOALS_EXPANDED.has(goalId);
  const chunks = Array.isArray(g.chunks) ? g.chunks : [];
  const { done, total, pct, linkedTotal, linkedDone, linkedCredit, manual } = goalProgress(g);
  const pillClass = total && done === total ? "status-good" : "";

  const chunksHtml = chunks.map(c => {
    const isDone = goalChunkDone(c);
    return `<div class="chunk-row ${isDone ? "done" : ""}" data-chunk-row="${c.id}">
      <input type="checkbox" data-chunk="${c.id}" class="chunk-done" ${isDone ? "checked" : ""}>
      <input type="text" data-chunk="${c.id}" class="chunk-title" value="${escapeHtml(c.title || "").replace(/"/g, "&quot;")}">
      <input type="date" data-chunk="${c.id}" class="chunk-due" value="${escapeHtml(c.due_date || "")}">
    </div>`;
  }).join("");

  return `<div class="card goal-card" data-goal="${goalId}" data-linked-total="${linkedTotal}" data-linked-done="${linkedDone}" data-linked-credit="${linkedCredit}" data-manual-progress="${manual ? "1" : "0"}">
    <div class="goal-card-header" data-goal="${goalId}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}"
      style="display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none;">
      <span class="goal-chevron" aria-hidden="true" style="font-size:10px; color:var(--ink-muted); width:12px; flex-shrink:0;">${expanded ? "▼" : "▶"}</span>
      ${goalProgressRing(done, total, pct)}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
          <strong>${escapeHtml(g.title || "")}</strong>
          <span class="pill">due ${escapeHtml(g.deadline || "—")}</span>
          <span class="pill goal-done-pill ${pillClass}">${done}/${total} done</span>
          ${linkedTotal ? `<span class="pill">${linkedTotal} linked task${linkedTotal === 1 ? "" : "s"}</span>` : ""}
        </div>
        ${goalProgressBar(pct, total)}
      </div>
      <button type="button" class="secondary goal-add-task" data-id="${goalId}" data-title="${escapeHtml(g.title || "").replace(/"/g, "&quot;")}"
        data-deadline="${escapeHtml(g.deadline || "")}" title="Create a task linked to this goal"
        style="padding:3px 9px; font-size:11px; flex-shrink:0;">Add as task</button>
      <label class="goal-progress-control" title="Set goal progress directly" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--ink-muted);flex-shrink:0;">
        Progress <input type="number" class="goal-progress-input" data-id="${goalId}" min="0" max="100" step="1" value="${pct}" aria-label="Progress percentage for ${escapeHtml(g.title || "goal")}" style="width:52px;padding:3px 5px;font-size:11px;">%
        ${manual ? `<button type="button" class="secondary pill goal-progress-auto" data-id="${goalId}" title="Use calculated progress">manual ×</button>` : ""}
      </label>
      <button type="button" class="secondary goal-edit-toggle" data-id="${goalId}" title="Edit goal title and deadline"
        style="padding:3px 9px; font-size:11px; flex-shrink:0;">Edit</button>
      <button type="button" class="secondary goal-coach" data-id="${goalId}" title="Generate proposal-only coaching"
        style="padding:3px 9px; font-size:11px; flex-shrink:0;">Coach</button>
      <button type="button" class="secondary goal-delete" data-id="${goalId}" title="Delete goal"
        style="padding:1px 8px; font-size:11px; flex-shrink:0;">×</button>
    </div>
    <div class="goal-chunks-panel" data-goal="${goalId}" style="display:${expanded ? "block" : "none"}; margin-top:12px; padding-left:10px; border-left:2px solid var(--gridline);">
      <form class="goal-edit-form" data-id="${goalId}" hidden style="display:none; gap:8px; flex-wrap:wrap; margin-bottom:12px; padding:10px; border:1px solid var(--gridline); border-radius:8px;">
        <input type="text" class="goal-edit-title" value="${escapeHtml(g.title || "").replace(/"/g, "&quot;")}" aria-label="Goal title" style="flex:2;">
        <input type="date" class="goal-edit-deadline" value="${escapeHtml(g.deadline || "")}" aria-label="Goal deadline">
        <button type="submit" class="primary goal-edit-save">Save</button>
        <button type="button" class="secondary goal-edit-cancel">Cancel</button>
      </form>
      ${renderGoalNextAction(chunks)}
      ${chunksHtml || '<p class="stub">No chunks.</p>'}
      ${renderGoalCoachQuests(g.coach_quests)}
      <form class="goal-custom-quest-form" data-goal="${goalId}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        <input type="text" class="goal-custom-quest-title" maxlength="160" placeholder="Custom quest title" aria-label="Custom quest title" style="flex:1;min-width:180px;">
        <button type="submit" class="secondary">+ Add custom quest</button>
      </form>
      ${renderGoalCoachProposal(goalId)}
    </div>
  </div>`;
}

async function renderGoals() {
  ensureGoalDeviceStyles();
  const goals = await api("/api/goals");
  const goalsHtml = goals.map(renderGoalCard).join("");

  return `
    ${renderAppSubnavPills(plannerRailTabs(), { label: "Planner views" })}
    ${renderGoalNudge(goals)}
    <div class="card">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="text" id="new-goal-title" placeholder="Goal title" style="flex:2;">
        <input type="date" id="new-goal-deadline">
        <button type="button" class="primary" id="add-goal">Add goal (auto-chunk)</button>
      </div>
    </div>
    ${goalsHtml || '<div class="card" style="text-align:center; padding:24px 16px;"><strong>No goals yet.</strong><p class="stub" style="margin:6px 0 12px;">Name what you want to move forward, choose a deadline, and Waypoint will draft the first chunks.</p><button type="button" class="primary" id="goal-empty-cta">Create your first goal</button></div>'}`;
}

function toggleGoalExpanded(goalId) {
  const id = String(goalId);
  if (GOALS_EXPANDED.has(id)) GOALS_EXPANDED.delete(id);
  else GOALS_EXPANDED.add(id);

  const panel = document.querySelector(`.goal-chunks-panel[data-goal="${id}"]`);
  const header = document.querySelector(`.goal-card-header[data-goal="${id}"]`);
  if (!panel || !header) return;

  const expanded = GOALS_EXPANDED.has(id);
  panel.style.display = expanded ? "block" : "none";
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  const chevron = header.querySelector(".goal-chevron");
  if (chevron) chevron.textContent = expanded ? "▼" : "▶";
}

function updateGoalCardProgress(card) {
  if (!card) return;
  const chunks = [...card.querySelectorAll(".chunk-done")];
  const chunkDone = chunks.filter(input => input.checked).length;
  const linkedTotal = Number(card.dataset.linkedTotal) || 0;
  const linkedDone = Number(card.dataset.linkedDone) || 0;
  const linkedCredit = Number(card.dataset.linkedCredit) || 0;
  const total = chunks.length + linkedTotal;
  const done = chunkDone + linkedDone;
  const input = card.querySelector(".goal-progress-input");
  const manual = card.dataset.manualProgress === "1";
  const pct = manual
    ? Math.max(0, Math.min(100, Math.round(Number(input?.value) || 0)))
    : (total ? Math.round(((chunkDone + linkedCredit) / total) * 100) : 0);
  if (input && !manual) input.value = String(pct);

  const donePill = card.querySelector(".goal-done-pill");
  if (donePill) {
    donePill.textContent = `${done}/${total} done`;
    donePill.classList.toggle("status-good", total > 0 && done === total);
  }
  const ring = card.querySelector(".goal-progress-ring");
  const ringValue = ring?.querySelector(".goal-progress-ring-value");
  const ringLabel = ring?.querySelector("text");
  if (ringValue) {
    const circumference = 2 * Math.PI * 14;
    ringValue.setAttribute("stroke-dashoffset", (circumference * (1 - pct / 100)).toFixed(2));
    ringValue.setAttribute("stroke", pct === 100 && total > 0 ? "var(--status-good)" : "var(--accent)");
  }
  if (ringLabel) ringLabel.textContent = total ? `${done}/${total}` : "—";
  const bar = card.querySelector(".goal-progress-bar");
  if (bar) {
    bar.setAttribute("aria-valuenow", String(pct));
    bar.title = total ? `${pct}% complete` : "No chunks or linked tasks yet";
    const fill = bar.firstElementChild;
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.style.background = pct === 100 ? "var(--status-good)" : "var(--accent)";
    }
  }
}

function wireGoals() {
  const btn = document.getElementById("add-goal");
  if (!btn) return;

  const submitGoal = async () => {
    const titleEl = document.getElementById("new-goal-title");
    const deadlineEl = document.getElementById("new-goal-deadline");
    if (!titleEl || !deadlineEl) return;

    const title = titleEl.value.trim();
    const deadline = deadlineEl.value;
    if (!title || !deadline) {
      showToast("Title and deadline are required", "warn");
      (title ? deadlineEl : titleEl).focus();
      return;
    }

    btn.textContent = "Chunking...";
    btn.disabled = true;
    try {
      const created = await api("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, deadline }),
      });
      if (created && created.id != null) GOALS_EXPANDED.add(String(created.id));
      render();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      btn.textContent = "Add goal (auto-chunk)";
      btn.disabled = false;
    }
  };
  btn.onclick = submitGoal;
  [document.getElementById("new-goal-title"), document.getElementById("new-goal-deadline")].forEach(input => {
    input?.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      submitGoal();
    });
  });
  document.getElementById("goal-empty-cta")?.addEventListener("click", () => {
    document.getElementById("new-goal-title")?.focus();
  });

  document.querySelectorAll(".goal-card-header").forEach(header => {
    header.onclick = (e) => {
      if (e.target.closest(".goal-delete, .goal-coach, .goal-edit-toggle, .goal-add-task, .goal-progress-control")) return;
      toggleGoalExpanded(header.dataset.goal);
    };
    header.onkeydown = (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleGoalExpanded(header.dataset.goal);
    };
  });

  document.querySelectorAll(".chunk-done, .chunk-title, .chunk-due").forEach(el => {
    el.onchange = () => {
      const id = el.dataset.chunk;
      const field = el.classList.contains("chunk-done") ? "done"
        : el.classList.contains("chunk-title") ? "title" : "due_date";
      const value = field === "done" ? el.checked : el.value;
      const req = api(`/api/goals/chunks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (field === "done") {
        const row = el.closest(".chunk-row");
        const card = el.closest(".goal-card");
        row?.classList.toggle("done", el.checked);
        updateGoalCardProgress(card);
        req.then(() => {
          if (el.checked) markGoalProgressToday();
        }).catch(err => {
          el.checked = !el.checked;
          row?.classList.toggle("done", el.checked);
          updateGoalCardProgress(card);
          showToast(errorMessage(err), "warn");
        });
      }
    };
  });

  document.querySelectorAll(".goal-progress-input").forEach(input => {
    input.onclick = e => e.stopPropagation();
    input.onchange = async () => {
      const value = Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)));
      input.value = String(value);
      input.disabled = true;
      try {
        await api(`/api/goals/${input.dataset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progress_pct: value }),
        });
        markGoalProgressToday();
        showToast(`Goal progress set to ${value}%`, "good");
        render();
      } catch (err) {
        input.disabled = false;
        showToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".goal-progress-auto").forEach(autoBtn => {
    autoBtn.onclick = async e => {
      e.stopPropagation();
      autoBtn.disabled = true;
      try {
        await api(`/api/goals/${autoBtn.dataset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progress_pct: null }),
        });
        showToast("Back to calculated progress", "good");
        render();
      } catch (err) {
        autoBtn.disabled = false;
        showToast(errorMessage(err), "warn");
      }
    };
  });

  document.querySelectorAll(".goal-custom-quest-form").forEach(form => {
    form.onsubmit = async e => {
      e.preventDefault();
      const input = form.querySelector(".goal-custom-quest-title");
      const title = input?.value.trim() || "";
      if (!title) {
        input?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Adding…";
      }
      try {
        await api(`/api/goals/${form.dataset.goal}/quests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        GOALS_EXPANDED.add(String(form.dataset.goal));
        showToast("Custom quest added", "good");
        render();
      } catch (err) {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "+ Add custom quest";
        }
        showToast(errorMessage(err), "warn");
      }
    };
  });

  document.getElementById("goal-nudge-dismiss")?.addEventListener("click", () => {
    try { localStorage.setItem(GOAL_NUDGE_DISMISSED_KEY, localYmd()); } catch (_) {}
    document.getElementById("goal-progress-nudge")?.remove();
  });

  document.querySelectorAll(".goal-edit-toggle").forEach(editBtn => {
    editBtn.onclick = e => {
      e.stopPropagation();
      const id = String(editBtn.dataset.id);
      GOALS_EXPANDED.add(id);
      const panel = document.querySelector(`.goal-chunks-panel[data-goal="${id}"]`);
      const header = document.querySelector(`.goal-card-header[data-goal="${id}"]`);
      if (panel) panel.style.display = "block";
      header?.setAttribute("aria-expanded", "true");
      const chevron = header?.querySelector(".goal-chevron");
      if (chevron) chevron.textContent = "▼";
      const form = panel?.querySelector(".goal-edit-form");
      if (form) {
        form.hidden = false;
        form.style.display = "flex";
        form.querySelector(".goal-edit-title")?.focus();
      }
    };
  });

  document.querySelectorAll(".goal-edit-cancel").forEach(cancelBtn => {
    cancelBtn.onclick = () => {
      const form = cancelBtn.closest(".goal-edit-form");
      if (form) {
        form.hidden = true;
        form.style.display = "none";
      }
    };
  });

  document.querySelectorAll(".goal-edit-form").forEach(form => {
    form.onsubmit = async e => {
      e.preventDefault();
      const id = String(form.dataset.id);
      const title = form.querySelector(".goal-edit-title")?.value.trim() || "";
      const deadline = form.querySelector(".goal-edit-deadline")?.value || "";
      if (!title || !deadline) {
        showToast("Title and deadline are required", "warn");
        return;
      }
      const saveBtn = form.querySelector(".goal-edit-save");
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
      try {
        await api(`/api/goals/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, deadline }),
        });
        showToast("Goal updated", "good");
        render();
      } catch (err) {
        const message = errorMessage(err);
        const unavailable = /404|not found|method not allowed/i.test(`${err?.message || ""} ${message}`);
        showToast(unavailable ? "Goal editing will work when the goal PATCH endpoint lands; nothing was changed." : message, "warn");
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
      }
    };
  });

  document.querySelectorAll(".goal-add-task").forEach(taskBtn => {
    taskBtn.onclick = async e => {
      e.stopPropagation();
      const title = taskBtn.dataset.title || "Goal";
      if (!window.confirm(`Create a linked task for “${title}”?`)) return;
      taskBtn.disabled = true;
      taskBtn.textContent = "Adding…";
      try {
        await api("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            due_date: taskBtn.dataset.deadline || null,
            category: "Goals",
            goal_id: Number(taskBtn.dataset.id),
          }),
        });
        showToast("Linked task created", "good");
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
        taskBtn.disabled = false;
        taskBtn.textContent = "Add as task";
      }
    };
  });

  document.querySelectorAll(".goal-delete").forEach(delBtn => {
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!window.confirm("Delete this goal and all its chunks?")) return;
      const goalId = delBtn.dataset.id;
      await api(`/api/goals/${goalId}`, { method: "DELETE" });
      GOALS_EXPANDED.delete(String(goalId));
      render();
    };
  });

  document.querySelectorAll(".goal-coach").forEach(coachBtn => {
    coachBtn.onclick = async (e) => {
      e.stopPropagation();
      const goalId = String(coachBtn.dataset.id);
      coachBtn.disabled = true;
      coachBtn.textContent = "Coaching…";
      try {
        const proposal = await api(`/api/goals/${goalId}/coach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        GOAL_COACH_PROPOSALS.set(goalId, proposal);
        GOALS_EXPANDED.add(goalId);
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
        coachBtn.disabled = false;
        coachBtn.textContent = "Coach";
      }
    };
  });

  document.querySelectorAll(".goal-coach-dismiss").forEach(dismiss => {
    dismiss.onclick = () => {
      GOAL_COACH_PROPOSALS.delete(String(dismiss.dataset.goal));
      render();
    };
  });

  document.querySelectorAll(".goal-coach-accept").forEach(acceptBtn => {
    acceptBtn.onclick = async () => {
      const goalId = String(acceptBtn.dataset.goal);
      const kind = acceptBtn.dataset.kind;
      const proposal = GOAL_COACH_PROPOSALS.get(goalId);
      const collection = kind === "quest" ? proposal?.quests : proposal?.time_allocations;
      const index = Number(acceptBtn.dataset.index);
      const item = collection?.[index];
      if (!item) return;
      const prompt = kind === "quest"
        ? `Accept “${item.title}” as a checkable quest?`
        : `Create a ${item.minutes}-minute task for “${item.title}”? No calendar event will be created.`;
      if (!window.confirm(prompt)) return;
      acceptBtn.disabled = true;
      try {
        await api(`/api/goals/${goalId}/coach/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, proposal: item, confirmed: true }),
        });
        collection.splice(index, 1);
        render();
      } catch (err) {
        showToast(errorMessage(err), "warn");
        acceptBtn.disabled = false;
      }
    };
  });

  document.querySelectorAll(".goal-coach-quest-done").forEach(checkbox => {
    checkbox.onchange = async () => {
      await api(`/api/goals/quests/${checkbox.dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: checkbox.checked }),
      });
      checkbox.closest(".goal-coach-quest-row")?.classList.toggle("done", checkbox.checked);
    };
  });

  document.querySelectorAll(".goal-coach-quest-delete").forEach(deleteBtn => {
    deleteBtn.onclick = async () => {
      if (!window.confirm("Remove this accepted quest? It can be restored from Trash.")) return;
      await api(`/api/goals/quests/${deleteBtn.dataset.id}`, { method: "DELETE" });
      render();
    };
  });
}
