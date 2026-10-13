// --- Classes: recurring school slots + coursework ---------------------------------------

const CLASS_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let CLASSES_EDITOR_OPEN = false;
let CLASSES_EDIT_ID = null;

function classIsCalendarClass(ev) {
  return !!(ev && (ev.kind === "class" || ev.class_id));
}

function classShouldListAsEvent(ev) {
  return !classIsCalendarClass(ev);
}

async function classMarkCalendarSlots(classId) {
  try {
    const calendar = await api("/api/calendar");
    const rows = (calendar || []).filter(e => Number(e.class_id) === Number(classId));
    await Promise.all(rows.filter(e => e.kind !== "class").map(row =>
      api(`/api/calendar/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "class" }),
      }).catch(() => null)
    ));
  } catch (_) {}
}

function classJoinHref(value) {
  const href = String(value || "").trim();
  if (/^https?:\/\//i.test(href)) return href;
  const match = String(value || "").match(/https?:\/\/\S+/i);
  return match ? match[0] : "";
}

function classHomeworkDeferred(item, todayStr = localYmd()) {
  if (item.item_type !== "homework") return false;
  if (!item.due_date) return true;
  const days = Math.round((Date.parse(`${item.due_date}T12:00:00`) - Date.parse(`${todayStr}T12:00:00`)) / 86400000);
  return days > 2;
}

function classDurationLabel(start, end) {
  const toMinutes = value => {
    const [hour, minute] = String(value || "").split(":").map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
  };
  const minutes = Math.max(0, toMinutes(end) - toMinutes(start));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function classesStyles() {
  return `<style>
    .cls-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
    .cls-toolbar .stub { margin-right:auto; }
    .cls-editor { margin-bottom:12px; border-left:3px solid var(--accent); }
    .cls-form-grid { display:grid; grid-template-columns:2fr 1.2fr 1fr 1fr 1fr; gap:8px; }
    .cls-form-grid .cls-wide { grid-column:span 2; }
    .cls-form-actions { display:flex; gap:8px; align-items:center; margin-top:10px; }
    .cls-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(285px, 1fr)); gap:10px; }
    .cls-card { border-top:3px solid color-mix(in srgb, var(--accent) 60%, var(--gridline)); }
    .cls-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .cls-title { font-size:16px; font-weight:650; }
    .cls-slot { margin-top:5px; font-variant-numeric:tabular-nums; }
    .cls-meta { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
    .cls-source { text-transform:capitalize; }
    .cls-card-actions { display:flex; gap:5px; }
    .cls-coursework { margin-top:12px; padding-top:10px; border-top:1px solid var(--gridline); }
    .cls-coursework summary { cursor:pointer; font-size:12px; font-weight:600; color:var(--ink-secondary); }
    .cls-item { padding:7px 0; border-bottom:1px solid var(--gridline); font-size:12px; }
    .cls-item-top { display:flex; align-items:flex-start; gap:6px; }
    .cls-item-title { flex:1; min-width:0; font-weight:600; }
    .cls-item-meta, .cls-attachments { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; align-items:center; }
    .cls-item-form { display:grid; grid-template-columns:1.4fr .9fr 1fr; gap:6px; margin-top:9px; }
    .cls-item-form .cls-item-wide { grid-column:1 / -1; }
    .cls-empty { text-align:center; padding:28px 16px; border:1px dashed var(--gridline); border-radius:10px; }
    .cls-item-deferred { opacity:0.7; }
    .cls-join { font-size:11px; text-decoration:none; }
    .cls-overlap { font-size:12px; color:var(--status-serious); margin:6px 0 0; }
    @media (max-width:760px) {
      .cls-form-grid, .cls-item-form { grid-template-columns:1fr 1fr; }
      .cls-form-grid .cls-wide, .cls-item-form .cls-item-wide { grid-column:1 / -1; }
    }
  </style>`;
}

function classEditorHtml(row = null) {
  const weekday = row ? Number(row.weekday) : 0;
  const weeks = Number(row?.horizon_weeks || 16);
  const startDate = row?.start_date || "";
  const endDate = row?.end_date || "";
  return `<section class="card cls-editor">
    <div class="section-title">${row ? "Edit recurring class" : "Add recurring class"}</div>
    <form id="class-editor-form" data-id="${row ? row.id : ""}">
      <div class="cls-form-grid">
        <input name="name" class="cls-wide" required maxlength="160" placeholder="Class name" value="${escapeHtml(row?.name || "")}">
        <select name="weekday" aria-label="Weekday">
          ${CLASS_WEEKDAYS.map((day, index) => `<option value="${index}" ${weekday === index ? "selected" : ""}>${day}</option>`).join("")}
        </select>
        <input name="start_time" type="time" required value="${escapeHtml(row?.start_time || "09:00")}">
        <input name="end_time" type="time" required value="${escapeHtml(row?.end_time || "10:00")}">
        <input name="travel_minutes" type="number" min="0" max="360" placeholder="Travel min" value="${Number(row?.travel_minutes || 0)}">
        <input name="location" placeholder="Location (optional)" value="${escapeHtml(row?.location || "")}">
        <input name="horizon_weeks" type="number" min="1" max="52" title="Weeks to project on Calendar" value="${weeks}">
        <input name="start_date" type="date" title="First week (optional)" value="${escapeHtml(startDate)}">
        <input name="end_date" type="date" title="Last week (optional)" value="${escapeHtml(endDate)}">
        <input name="notes" class="cls-wide" placeholder="Notes (optional)" value="${escapeHtml(row?.notes || "")}">
        <input name="url" class="cls-wide" type="url" placeholder="Zoom / meeting URL (optional)" value="${escapeHtml(row?.url || row?.meeting_url || "")}">
      </div>
      <p class="cls-overlap" id="class-overlap-warn" hidden></p>
      <div class="cls-form-actions">
        <button type="submit">${row ? "Save changes" : "Add class"}</button>
        <button type="button" class="secondary" id="class-editor-cancel">Cancel</button>
        <span class="stub">Creates weekly School calendar slots — classes stay off the Events tab.</span>
      </div>
    </form>
  </section>`;
}

function classItemHtml(item) {
  const deferred = classHomeworkDeferred(item);
  const due = item.due_date ? `Due ${escapeHtml(item.due_date)}` : "No deadline";
  const task = item.task_id
    ? `<button type="button" class="link-button cls-open-task" title="Open Tasks">Task #${item.task_id}${item.task_status === "done" ? " ✓" : ""}</button>`
    : "";
  const externalUrl = classJoinHref(item.url);
  const attachments = (item.attachments || []).map(file =>
    `<a href="/api/attachments/${file.id}/file" target="_blank" rel="noopener">${escapeHtml(file.filename)}</a>`
  ).join("");
  return `<div class="cls-item${deferred ? " cls-item-deferred" : ""}">
    <div class="cls-item-top">
      <span aria-hidden="true">${item.item_type === "document" ? "📎" : "✓"}</span>
      <span class="cls-item-title">${escapeHtml(item.title)}</span>
      <button type="button" class="icon-button cls-delete-item" data-class-id="${item.class_id}" data-id="${item.id}" title="Remove from class">×</button>
    </div>
    <div class="cls-item-meta stub">
      <span>${escapeHtml(due)}</span>${task}
      ${deferred ? '<span class="pill">not work yet</span>' : ""}
      ${externalUrl ? `<a class="cls-join" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener">Join</a>` : ""}
    </div>
    ${item.notes ? `<div class="stub" style="margin-top:4px;">${escapeHtml(item.notes)}</div>` : ""}
    ${attachments ? `<div class="cls-attachments">Files: ${attachments}</div>` : ""}
    ${item.grade_letter ? `<div class="cls-grade"><strong>${escapeHtml(item.grade_letter)} · ${item.grade_score}/10</strong>${escapeHtml(item.grade_feedback || "")}</div>` : ""}
    ${item.item_type === "homework" ? `<button type="button" class="secondary compact cls-grade-item" data-class-id="${item.class_id}" data-id="${item.id}">Auto-grade</button>` : ""}
  </div>`;
}

function classCardHtml(row) {
  const items = row.items || [];
  return `<article class="card cls-card">
    <div class="cls-card-head">
      <div>
        <div class="cls-title">${escapeHtml(row.name)}</div>
        <div class="cls-slot">${CLASS_WEEKDAYS[row.weekday]} · ${escapeHtml(row.start_time)}–${escapeHtml(row.end_time)}</div>
      </div>
      <div class="cls-card-actions">
        <button type="button" class="secondary cls-edit" data-id="${row.id}">Edit</button>
        <button type="button" class="icon-button cls-delete" data-id="${row.id}" title="Delete class">×</button>
      </div>
    </div>
    <div class="cls-meta">
      <span class="pill">${escapeHtml(classDurationLabel(row.start_time, row.end_time))}</span>
      ${row.travel_minutes ? `<span class="pill">${row.travel_minutes} min travel</span>` : ""}
      ${row.location ? `<span class="pill">${escapeHtml(row.location)}</span>` : ""}
      ${classJoinHref(row.url || row.location || row.notes) ? `<a class="cls-join pill" href="${escapeHtml(classJoinHref(row.url || row.location || row.notes))}" target="_blank" rel="noopener">Join</a>` : ""}
      <span class="pill cls-source">${escapeHtml(row.source || "manual")}</span>
      <span class="pill">${Number(row.horizon_weeks || 16)} weeks</span>
    </div>
    ${row.notes ? `<p class="stub" style="margin:8px 0 0;">${escapeHtml(row.notes)}</p>` : ""}
    <details class="cls-coursework" ${items.length ? "open" : ""}>
      <summary>Homework & documents (${items.length})</summary>
      <div>${items.map(classItemHtml).join("")}</div>
      <form class="cls-item-form" data-class-id="${row.id}">
        <input name="title" required maxlength="180" placeholder="Homework or document">
        <select name="item_type" aria-label="Type">
          <option value="homework">Homework</option>
          <option value="document">Document</option>
        </select>
        <input name="due_date" type="date" title="Deadline">
        <input name="url" placeholder="Link (optional)">
        <input name="notes" placeholder="Notes (optional)">
        <input name="file" type="file" aria-label="Attach file">
        <div class="cls-item-wide" style="display:flex; gap:7px; align-items:center;">
          <button type="submit" class="secondary">Attach</button>
          <span class="stub">A deadline also creates a linked School task.</span>
        </div>
      </form>
    </details>
  </article>`;
}

async function renderClasses() {
  const [classes, pronote, nyu] = await Promise.all([
    api("/api/classes"),
    api("/api/school/pronote/status").catch(() => ({ configured: false, connected_school: null })),
    api("/api/nyu/status").catch(() => ({ can_sync: false, ics_saved: false, connected: false })),
  ]);
  const editing = CLASSES_EDIT_ID ? classes.find(row => row.id === CLASSES_EDIT_ID) : null;
  if (CLASSES_EDIT_ID && !editing) CLASSES_EDIT_ID = null;
  const pronoteLabel = pronote.connected_school
    ? `Pronote: ${escapeHtml(pronote.connected_school)}`
    : (pronote.configured ? "Pronote configured" : "Configure Pronote in Settings");
  const nyuLabel = nyu.connected ? "Brightspace API connected" : (nyu.ics_saved ? "Brightspace feed saved" : "Set up NYU in Settings");
  return `${classesStyles()}
    <div class="page-header">
      <div><h2 class="page-title">Classes</h2><p class="page-subtitle">Recurring learning slots, coursework, and deadlines.</p></div>
    </div>
    <div class="wp-toolbar cls-toolbar">
      <span class="stub">${pronoteLabel} · ${escapeHtml(nyuLabel)}</span>
      <button type="button" class="secondary" id="classes-pronote-sync">Sync Pronote</button>
      <button type="button" class="secondary" id="classes-nyu-sync">Sync NYU</button>
      <button type="button" class="secondary" id="classes-rebuild">Rebuild calendar</button>
      <button type="button" id="classes-add">+ Add class</button>
    </div>
    ${CLASSES_EDITOR_OPEN || editing ? classEditorHtml(editing) : ""}
    ${classes.length
      ? `<div class="cls-grid">${classes.map(classCardHtml).join("")}</div>`
      : `<div class="cls-empty"><strong>No classes yet.</strong><div class="stub" style="margin-top:6px;">Add a weekly class, sync Pronote, import a Brightspace calendar feed, or apply a pasted Albert schedule from Settings.</div></div>`}`;
}

async function classUploadItemFile(itemId, file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  form.append("entity_type", "class_item");
  form.append("entity_id", String(itemId));
  await api("/api/attachments", { method: "POST", body: form });
}

function wireClasses() {
  document.getElementById("classes-add")?.addEventListener("click", () => {
    CLASSES_EDIT_ID = null;
    CLASSES_EDITOR_OPEN = true;
    render();
  });
  document.getElementById("class-editor-cancel")?.addEventListener("click", () => {
    CLASSES_EDIT_ID = null;
    CLASSES_EDITOR_OPEN = false;
    render();
  });
  document.getElementById("class-editor-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.weekday = Number(data.weekday);
    data.travel_minutes = Number(data.travel_minutes || 0);
    data.horizon_weeks = Number(data.horizon_weeks || 16);
    data.start_date = data.start_date || null;
    data.end_date = data.end_date || null;
    if (data.url) {
      data.notes = [data.notes, data.url].filter(Boolean).join("\n");
      delete data.url;
    }
    const id = form.dataset.id;
    try {
      const warnEl = document.getElementById("class-overlap-warn");
      if (warnEl && data.start_time && data.end_time) {
        const nextDate = (() => {
          const today = new Date(`${localYmd()}T12:00:00`);
          const wanted = (Number(data.weekday) + 1) % 7;
          let diff = wanted - today.getDay();
          if (diff < 0) diff += 7;
          today.setDate(today.getDate() + diff);
          return localYmd(today);
        })();
        try {
          const check = await api("/api/calendar/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: nextDate,
              start_time: data.start_time,
              end_time: data.end_time,
              title: data.name,
            }),
          });
          if ((check.overlaps || []).length) {
            warnEl.hidden = false;
            warnEl.textContent = `Overlap: ${(check.overlaps || []).map(e => e.title).join(", ")}`;
            if (!window.confirm("This class overlaps another calendar event. Save anyway?")) return;
          } else {
            warnEl.hidden = true;
          }
        } catch (_) {}
      }
      const saved = await api(id ? `/api/classes/${id}` : "/api/classes", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const savedId = id || saved?.class?.id;
      if (savedId) await classMarkCalendarSlots(savedId);
      CLASSES_EDIT_ID = null;
      CLASSES_EDITOR_OPEN = false;
      showToast(id ? "Class updated in Calendar" : "Class added to Calendar — not listed as an event", "success");
      render();
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  });
  document.querySelectorAll(".cls-edit").forEach(button => {
    button.onclick = () => {
      CLASSES_EDIT_ID = Number(button.dataset.id);
      CLASSES_EDITOR_OPEN = false;
      render();
    };
  });
  document.querySelectorAll(".cls-delete").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Delete this recurring class and its Calendar slots? Linked coursework tasks are kept.")) return;
      try {
        await api(`/api/classes/${button.dataset.id}`, { method: "DELETE" });
        showToast("Class removed", "success");
        render();
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
    };
  });
  document.querySelectorAll(".cls-item-form").forEach(form => {
    form.onsubmit = async event => {
      event.preventDefault();
      const values = new FormData(form);
      const file = values.get("file");
      const dueDate = values.get("due_date") || null;
      const payload = {
        title: values.get("title"),
        item_type: values.get("item_type"),
        due_date: dueDate,
        notes: values.get("notes"),
        url: values.get("url"),
        create_task: Boolean(dueDate),
      };
      try {
        const item = await api(`/api/classes/${form.dataset.classId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (file && file.size) await classUploadItemFile(item.id, file);
        if (item.task_id && payload.item_type === "homework") {
          const tags = ["school", "homework"];
          if (/\baleks\b/i.test(payload.title || "")) tags.push("aleks");
          try {
            await api(`/api/tasks/${item.task_id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tags: tags.join(","),
                deadline_kind: payload.due_date ? "hard" : "indefinite",
              }),
            });
          } catch (_) {}
        }
        showToast(item.task_id ? (classHomeworkDeferred({ ...payload, item_type: payload.item_type, due_date: dueDate }) ? "Attached — homework stays off today until the last two days" : "Attached and linked task created") : "Attached to class", "success");
        render();
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
    };
  });
  document.querySelectorAll(".cls-delete-item").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Remove this item from the class? Its linked task will be kept.")) return;
      try {
        await api(`/api/classes/${button.dataset.classId}/items/${button.dataset.id}`, { method: "DELETE" });
        render();
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
    };
  });
  document.querySelectorAll(".cls-item-form input[name='title']").forEach(input => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        input.closest("form")?.requestSubmit();
      }
    });
  });
  document.querySelectorAll("#class-editor-form input[name='name']").forEach(input => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        input.closest("form")?.requestSubmit();
      }
    });
  });
  document.querySelectorAll(".cls-open-task").forEach(button => {
    button.onclick = () => goToTab("Tasks");
  });
  document.querySelectorAll(".cls-grade-item").forEach(button => {
    button.onclick = async () => {
      const answer = prompt("Optional: paste the student work to grade (leave blank to grade notes/files).") || "";
      button.disabled = true;
      button.textContent = "Grading…";
      try {
        const result = await api(`/api/classes/${button.dataset.classId}/items/${button.dataset.id}/grade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer }),
        });
        const letter = result.grade?.letter || "";
        const score = result.grade?.score;
        showToast(`Graded ${letter}${score != null ? ` · ${score}/10` : ""}`, "success");
        render();
      } catch (error) {
        showToast(errorMessage(error), "error");
        button.disabled = false;
        button.textContent = "Auto-grade";
      }
    };
  });
  document.getElementById("classes-rebuild")?.addEventListener("click", async () => {
    const rows = await api("/api/classes");
    let total = 0;
    for (const row of rows || []) {
      const patched = await api(`/api/classes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon_weeks: row.horizon_weeks || 16 }),
      });
      total += patched.events_created || 0;
      await classMarkCalendarSlots(row.id);
    }
    showToast(`Rebuilt ${total} recurring calendar class slots (not listed as events)`, "success");
    render();
  });
  document.getElementById("classes-pronote-sync")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Syncing…";
    try {
      const result = await api("/api/school/pronote/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      showToast(`Pronote: ${result.calendar_created || 0} calendar events, ${result.tasks_created || 0} tasks`, "success");
      render();
    } catch (error) {
      showToast(errorMessage(error), "error");
      button.disabled = false;
      button.textContent = "Sync Pronote";
    }
  });
  document.getElementById("classes-nyu-sync")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    try {
      const status = await api("/api/nyu/status").catch(() => ({ can_sync: false }));
      if (!status.can_sync) {
        if (typeof openSettingsSection === "function") openSettingsSection("nyu-integrations-card");
        else showToast("Add a Brightspace calendar feed in Settings → NYU", "info");
        return;
      }
      button.disabled = true;
      button.textContent = "Syncing…";
      const result = await api("/api/nyu/sync", { method: "POST" });
      showToast(`NYU: ${result.events || 0} calendar events, ${result.tasks || 0} tasks`, "success");
      render();
    } catch (error) {
      showToast(errorMessage(error), "error");
      button.disabled = false;
      button.textContent = "Sync NYU";
    }
  });
}
