// --- Events ---------------------------------------------------------

let EVT_SHOW_WEEKLY = false;
let EVT_CACHED = [];
let EVT_CAL_CACHED = [];
let EVT_SELECT_MODE = false;
const EVT_SELECTED = new Set();
const EVT_SKIP_RE = /<!--evt-skip:(\d{4}-\d{2}-\d{2})-->/g;
const EVT_LANE_RE = /<!--evt-lane:(work|passion)-->/i;
const EVT_WEEKLY_RE = /<!--evt-weekly-->/i;
const EVT_RRULE_RE = /<!--evt-rrule:([^>]+)-->/i;

function evtTodayStr() {
  return localYmd();
}

function evtEndDate(ev) {
  return ev.end_date || ev.date || "";
}

function evtShortDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function evtDayCount(start, end) {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  return Math.round((e - s) / 86400000) + 1;
}

function evtAddDays(isoDate, delta) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function evtEachDay(start, end) {
  const days = [];
  if (!start) return days;
  const last = end || start;
  let cursor = start;
  while (cursor <= last) {
    days.push(cursor);
    cursor = evtAddDays(cursor, 1);
    if (days.length > 60) break;
  }
  return days;
}

function evtSkippedDays(ev) {
  const found = [...String(ev.description || "").matchAll(EVT_SKIP_RE)].map(m => m[1]);
  return new Set(found);
}

function evtStripSkips(desc) {
  return String(desc || "")
    .replace(/\n?<!--evt-skip:\d{4}-\d{2}-\d{2}-->/g, "")
    .replace(/\n?<!--evt-lane:(work|passion)-->/gi, "")
    .replace(/\n?<!--evt-weekly-->/gi, "")
    .replace(/\n?<!--evt-rrule:[^>]+-->/gi, "")
    .trim();
}

function evtLaneOf(r) {
  const m = String(r?.description || "").match(EVT_LANE_RE);
  if (m) return m[1].toLowerCase();
  return r?.lane === "work" ? "work" : "passion";
}

function evtRruleOf(r) {
  if (r?.rrule) return String(r.rrule);
  const m = String(r?.description || "").match(EVT_RRULE_RE);
  return m ? m[1].trim() : "";
}

function evtIsWeekly(r) {
  return /WEEKLY/i.test(evtRruleOf(r)) || !!r?.weekly || EVT_WEEKLY_RE.test(String(r?.description || ""));
}

function evtComposeDescription(notes, { skips = [], lane = "passion", weekly = false, rrule = "" } = {}) {
  const parts = [String(notes || "").trim()];
  if (lane === "work" || lane === "passion") parts.push(`<!--evt-lane:${lane}-->`);
  if (weekly || /WEEKLY/i.test(rrule)) parts.push("<!--evt-weekly-->");
  if (rrule) parts.push(`<!--evt-rrule:${rrule}-->`);
  [...skips].forEach(d => parts.push(`<!--evt-skip:${d}-->`));
  return parts.filter(Boolean).join("\n");
}

function evtStoredTime(value) {
  const text = String(value == null ? "" : value).trim();
  return text;
}

function evtWithSkip(desc, dateStr) {
  const ev = { description: desc };
  const existing = [...evtSkippedDays(ev)];
  if (!existing.includes(dateStr)) existing.push(dateStr);
  return evtComposeDescription(evtStripSkips(desc), {
    skips: existing,
    lane: evtLaneOf(ev),
    weekly: evtIsWeekly(ev),
    rrule: evtRruleOf(ev),
  });
}

function evtHhmm(value) {
  const text = String(value || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
}

function evtIsWeeklyHidden(r, todayStr = evtTodayStr()) {
  const rrule = evtRruleOf(r);
  const weekly = /WEEKLY/i.test(rrule) || evtIsWeekly(r);
  if (!weekly) return false;
  const raw = r.date || r.start_date;
  if (!raw) return false;
  const start = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
  const today = new Date(`${todayStr}T12:00:00`);
  const days = Math.round((start - today) / 86400000);
  return days > 2;
}

function evtIsActionable(r, todayStr = evtTodayStr()) {
  if (evtIsWeeklyHidden(r, todayStr) && !EVT_SHOW_WEEKLY) return false;
  return true;
}

function evtJoinHref(url) {
  const href = String(url || "").trim();
  if (!/^https?:\/\//i.test(href)) return "";
  return href;
}

function evtIsMeetingUrl(url) {
  return /zoom\.us|meet\.google|teams\.microsoft|webex\.com|whereby\.com/i.test(String(url || ""));
}

function evtJoinButton(url, { compact = false } = {}) {
  const href = evtJoinHref(url);
  if (!href) return "";
  const label = evtIsMeetingUrl(href) ? "Join" : "Open";
  const klass = compact ? "secondary compact evt-join" : "primary evt-join";
  return `<a class="${klass}" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${escapeHtml(href)}">${label}</a>`;
}

function evtDurationPill(ev) {
  const start = ev.date;
  if (!start) return "";
  const end = evtEndDate(ev);
  const timed = !Number(ev.all_day) && ev.start_time;
  const timeLabel = timed
    ? ` · ${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ""}`
    : " · all day";
  if (!end || end === start) {
    return `<span class="pill">${escapeHtml(evtShortDate(start) + timeLabel)}</span>`;
  }
  const days = evtDayCount(start, end);
  return `<span class="pill">${escapeHtml(evtShortDate(start))} → ${escapeHtml(evtShortDate(end))} · ${days} day${days === 1 ? "" : "s"}${escapeHtml(timeLabel)}</span>`;
}

function evtBucket(ev) {
  const today = evtTodayStr();
  const start = ev.date || "";
  const end = evtEndDate(ev) || start;
  if (!start) return "upcoming";
  if (end < today) return "past";
  if (start <= today && today <= end) return "ongoing";
  if (start > today) return "upcoming";
  return "past";
}

function evtTimesOverlap(a, b) {
  if (Number(a.all_day) || Number(b.all_day)) return false;
  const aDays = evtEachDay(a.date, evtEndDate(a)).filter(d => !evtSkippedDays(a).has(d));
  const bDays = evtEachDay(b.date, evtEndDate(b)).filter(d => !evtSkippedDays(b).has(d));
  if (!aDays.some(d => bDays.includes(d))) return false;
  const aStart = evtHhmm(a.start_time);
  const aEnd = evtHhmm(a.end_time);
  const bStart = evtHhmm(b.start_time);
  const bEnd = evtHhmm(b.end_time);
  if (aStart == null || bStart == null) return false;
  const aStop = aEnd == null ? aStart + 60 : aEnd;
  const bStop = bEnd == null ? bStart + 60 : bEnd;
  return aStart < bStop && bStart < aStop;
}

function evtFindOverlaps(candidate, pool = EVT_CACHED) {
  return (pool || []).filter(other => {
    if (!other || Number(other.id) === Number(candidate.id)) return false;
    if (other.status === "skipped") return false;
    if (!evtIsActionable(other)) return false;
    return evtTimesOverlap(candidate, other);
  });
}

function evtOverlapBanner(overlaps, calendarHits) {
  const titles = [
    ...(overlaps || []).map(e => e.title),
    ...(calendarHits || []).map(e => e.title),
  ].filter(Boolean);
  if (!titles.length) return "";
  return `<p class="evt-overlap-warn" role="status">Overlap: ${escapeHtml(titles.slice(0, 4).join(", "))}${titles.length > 4 ? "…" : ""}</p>`;
}

function evtDayStrip(r) {
  const skipped = evtSkippedDays(r);
  const days = evtEachDay(r.date, evtEndDate(r));
  if (!days.length) return "";
  return `<div class="evt-day-strip" data-id="${r.id}" title="Click a day to cancel that instance — Paint still works elsewhere">
    ${days.map(day => `<button type="button" class="evt-day-chip${skipped.has(day) ? " evt-day-cancelled" : ""}" data-id="${r.id}" data-day="${escapeHtml(day)}" ${skipped.has(day) ? "disabled" : ""}>${escapeHtml(evtShortDate(day))}</button>`).join("")}
  </div>`;
}

function renderEventCard(r) {
  const notes = evtStripSkips(r.description);
  const locationNotes = [notes, r.location].filter(Boolean).join(" — ");
  const overlaps = evtFindOverlaps(r, EVT_CACHED);
  const calHits = evtFindOverlaps(r, EVT_CAL_CACHED);
  const hidden = evtIsWeeklyHidden(r);
  const weekly = evtIsWeekly(r);
  const lane = evtLaneOf(r);
  const selected = EVT_SELECTED.has(String(r.id));
  const startStored = evtStoredTime(r.start_time);
  const endStored = evtStoredTime(r.end_time);
  return `
    <div class="card evt-card${hidden ? " evt-weekly-hidden" : ""}${selected ? " evt-card-selected" : ""}" data-id="${r.id}">
      <div style="display:flex; justify-content:space-between; align-items:start; gap:8px;">
        <div style="flex:1; min-width:0;">
          ${EVT_SELECT_MODE ? `<label class="evt-select-label"><input type="checkbox" class="event-select" data-id="${r.id}" ${selected ? "checked" : ""}> Select</label>` : ""}
          <input type="text" class="event-title" data-id="${r.id}" value="${escapeHtml(r.title || "").replace(/"/g, "&quot;")}" aria-label="Title" style="font-weight:700; width:min(420px,100%);">
          <div style="margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            ${evtDurationPill(r)}
            ${hidden ? '<span class="pill">weekly · hidden until closer</span>' : ""}
            ${weekly && !hidden ? '<span class="pill">weekly</span>' : ""}
            <span class="pill evt-lane-pill">${escapeHtml(lane)}</span>
            ${evtJoinButton(r.url)}
          </div>
        </div>
        <span style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
          <button class="secondary event-to-calendar" data-id="${r.id}" data-title="${escapeHtml(r.title || "").replace(/"/g, "&quot;")}" data-date="${escapeHtml(r.date || "")}" data-start="${escapeHtml(startStored)}" data-end="${escapeHtml(endStored)}" data-url="${escapeHtml(r.url || "").replace(/"/g, "&quot;")}" data-notes="${escapeHtml(locationNotes).replace(/"/g, "&quot;")}" data-lane="${escapeHtml(lane)}" title="Add to Calendar day plan on start date" style="font-size:11px;">→ calendar</button>
          <select class="event-status" data-id="${r.id}">
            <option value="suggested" ${r.status === "suggested" ? "selected" : ""}>suggested</option>
            <option value="interested" ${r.status === "interested" ? "selected" : ""}>interested</option>
            <option value="going" ${r.status === "going" ? "selected" : ""}>going</option>
            <option value="skipped" ${r.status === "skipped" ? "selected" : ""}>skipped</option>
          </select>
          <button class="secondary event-delete" data-id="${r.id}" style="padding:1px 6px; font-size:11px;">x</button>
        </span>
      </div>
      ${evtOverlapBanner(overlaps, calHits)}
      ${evtDayStrip(r)}
      <div style="margin-top:6px; display:flex; gap:6px; align-items:center; font-size:12px; flex-wrap:wrap;">
        From <input type="date" class="event-date" data-id="${r.id}" value="${escapeHtml(r.date || "")}" style="width:140px;">
        to <input type="date" class="event-end-date" data-id="${r.id}" value="${escapeHtml(r.end_date || "")}" style="width:140px;" title="Leave blank for a single-day event">
        <label><input type="checkbox" class="event-all-day" data-id="${r.id}" ${Number(r.all_day) ? "checked" : ""}> all day</label>
        <input type="time" class="event-start-time" data-id="${r.id}" value="${escapeHtml(startStored)}" ${Number(r.all_day) ? "disabled" : ""} aria-label="Start time" title="Stored start time">
        <span>to</span>
        <input type="time" class="event-end-time" data-id="${r.id}" value="${escapeHtml(endStored)}" ${Number(r.all_day) ? "disabled" : ""} aria-label="End time" title="Stored end time">
        <select class="event-lane" data-id="${r.id}" title="Work vs passion" aria-label="Work vs passion">
          <option value="work" ${lane === "work" ? "selected" : ""}>Work</option>
          <option value="passion" ${lane !== "work" ? "selected" : ""}>Passion</option>
        </select>
        <label title="Weekly events hide until the last two days"><input type="checkbox" class="event-weekly" data-id="${r.id}" ${weekly ? "checked" : ""}> weekly</label>
      </div>
      <textarea class="event-description" data-id="${r.id}" placeholder="Notes" style="margin-top:8px; min-height:56px; width:100%;">${escapeHtml(notes)}</textarea>
      <input type="text" class="event-location" data-id="${r.id}" value="${escapeHtml(r.location || "").replace(/"/g, "&quot;")}" placeholder="Location" style="margin-top:6px; width:100%;">
      <div class="evt-url-row">
        <input type="url" class="event-url" data-id="${r.id}" value="${escapeHtml(r.url || "").replace(/"/g, "&quot;")}" placeholder="Zoom / meeting URL" aria-label="Zoom or meeting URL" style="flex:1; min-width:180px;">
        ${evtJoinButton(r.url, { compact: true })}
      </div>
    </div>`;
}

function renderEventGroup(title, items, { collapsed = false } = {}) {
  if (!items.length) return "";
  const body = items.map(renderEventCard).join("");
  if (collapsed) {
    return `
      <details class="evt-group evt-group-past">
        <summary><strong style="font-size:13px;">${escapeHtml(title)}</strong> <span class="pill">${items.length}</span></summary>
        <div style="margin-top:8px;">${body}</div>
      </details>`;
  }
  return `
    <div class="evt-group">
      <strong style="font-size:13px; display:block; margin-bottom:8px;">${escapeHtml(title)} <span class="pill">${items.length}</span></strong>
      ${body}
    </div>`;
}

async function renderEvents() {
  const [events, settings, calendar, actionable] = await Promise.all([
    api("/api/events"),
    api("/api/events/settings"),
    api("/api/calendar").catch(() => []),
    api("/api/events/actionable").catch(() => null),
  ]);

  EVT_CACHED = events;
  EVT_CAL_CACHED = Array.isArray(calendar)
    ? calendar.filter(e => (typeof classShouldListAsEvent === "function" ? classShouldListAsEvent(e) : (e.kind !== "class" && !e.class_id)))
    : [];

  const weeklyHidden = events.filter(e => evtIsWeeklyHidden(e));
  const calWeeklyHidden = EVT_CAL_CACHED.filter(e => evtIsWeeklyHidden(e));
  const actionableIds = Array.isArray(actionable) ? new Set(actionable.map(e => e.id)) : null;
  const visible = events.filter(e => {
    if (e.kind === "class" || e.class_id) return false;
    if (evtIsWeeklyHidden(e) && !EVT_SHOW_WEEKLY) return false;
    if (!evtIsActionable(e)) return false;
    if (actionableIds && !EVT_SHOW_WEEKLY && evtIsWeeklyHidden(e) && !actionableIds.has(e.id)) return false;
    return e.status !== "skipped";
  });
  const skipped = events.filter(e => e.status === "skipped");
  const ongoing = visible.filter(e => evtBucket(e) === "ongoing");
  const upcoming = visible.filter(e => evtBucket(e) === "upcoming");
  const past = visible.filter(e => evtBucket(e) === "past");

  const grouped = [
    renderEventGroup("Ongoing", ongoing),
    renderEventGroup("Upcoming", upcoming),
    renderEventGroup("Past", past, { collapsed: true }),
    renderEventGroup("Cancelled instances", skipped, { collapsed: true }),
  ].filter(Boolean).join("");

  const hiddenCount = weeklyHidden.length + calWeeklyHidden.length;

  const content = `
    <style>
      .evt-group { margin-bottom:14px; }
      .evt-group-past summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:8px; }
      .evt-group-past summary::-webkit-details-marker { display:none; }
      .evt-card + .evt-card { margin-top:0; }
      .evt-url-row { display:flex; gap:8px; align-items:center; margin-top:6px; }
      .evt-join { text-decoration:none; white-space:nowrap; }
      .evt-day-strip { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; min-height:36px; }
      .evt-day-chip { font-size:11px; padding:6px 10px; min-height:32px; border-radius:999px; border:1px solid var(--gridline); background:var(--bg-shell); cursor:pointer; }
      .evt-day-chip:hover { border-color:var(--status-serious); color:var(--status-serious); }
      .evt-day-cancelled { text-decoration:line-through; opacity:0.55; cursor:default; }
      .evt-overlap-warn { margin:8px 0 0; font-size:12px; color:var(--status-serious); }
      .evt-weekly-hidden { opacity:0.7; }
      .evt-card-selected { outline:2px solid var(--accent); }
      .evt-select-label { font-size:11px; display:inline-flex; gap:6px; align-items:center; margin-bottom:4px; }
    </style>
    <div class="card">
      <strong style="font-size:13px;">Your interests &amp; location</strong>
      <p class="stub" style="margin:4px 0 8px;">Used by the scan below to find events actually relevant to you.</p>
      <div class="card-grid">
        <input type="text" id="events-interests" placeholder="Interests (e.g. climbing, jazz, AI meetups)" value="${escapeHtml(settings.interests || "").replace(/"/g, "&quot;")}">
        <input type="text" id="events-location" placeholder="Location (e.g. Paris, France)" value="${escapeHtml(settings.location || "").replace(/"/g, "&quot;")}">
      </div>
      <button class="primary" id="scan-events" style="margin-top:8px;">Scan for events</button>
    </div>
    <div class="card">
      <strong style="font-size:13px;">Add one yourself</strong>
      <p class="stub" style="margin:4px 0 8px;">New events are timed. Check all day only when that is really intended. Click a day on a card to cancel that instance — Paint still works.</p>
      <div class="card-grid">
        <input type="text" id="new-event-title" placeholder="Title">
        <input type="date" id="new-event-date" placeholder="Start date">
        <input type="date" id="new-event-end-date" placeholder="End date (optional)">
        <input type="time" id="new-event-start-time" aria-label="Start time" title="Leave blank for all-day">
        <input type="time" id="new-event-end-time" aria-label="End time">
        <label style="font-size:12px;"><input type="checkbox" id="new-event-all-day"> all day</label>
        <select id="new-event-lane" title="Work vs passion" aria-label="Work vs passion">
          <option value="passion">Passion</option>
          <option value="work">Work</option>
        </select>
        <label style="font-size:12px;"><input type="checkbox" id="new-event-weekly"> weekly (hides until last two days)</label>
        <input type="text" id="new-event-location" placeholder="Location">
        <select id="new-event-status">
          <option value="interested">Want to go</option>
          <option value="going">Going</option>
        </select>
        <input type="url" id="new-event-url" placeholder="Zoom / meeting URL" aria-label="Zoom or meeting URL">
      </div>
      <p class="evt-overlap-warn" id="new-event-overlap" hidden></p>
      <textarea id="new-event-desc" placeholder="Notes" style="margin-top:8px;"></textarea>
      <button class="secondary" id="add-event" style="margin-top:8px;">Add</button>
    </div>
    <div class="card" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <span class="stub">${hiddenCount ? `${hiddenCount} weekly event(s) hidden until the last two days` : "Weekly events hide until they are actionable"}.</span>
      <button type="button" class="secondary compact" id="evt-toggle-weekly">${EVT_SHOW_WEEKLY ? "Hide far weekly" : "Show weekly early"}</button>
      <button type="button" class="secondary compact" id="events-select" title="Select events to edit or clear">${EVT_SELECT_MODE ? "Done selecting" : "Select"}</button>
      <button type="button" class="secondary compact" id="events-edit-selected" title="Edit selected events" ${EVT_SELECT_MODE ? "" : "hidden"}>Edit selected</button>
      <button type="button" class="secondary compact" id="events-clear" title="Clear selected events" ${EVT_SELECT_MODE ? "" : "hidden"}>Clear selected</button>
      <span class="pill" ${EVT_SELECT_MODE ? "" : "hidden"}>${EVT_SELECTED.size} selected</span>
    </div>
    ${grouped || '<p class="stub">Nothing yet -- add one above, or scan for events near you.</p>'}`;

  PLN_SHELL_FOCUS = "strip";
  const shell = await renderPlannerFusedShell();
  return replacePlannerModeChipsWithSubnav(shell)
    .replace('<div id="pln-tab-extras"></div>', `<div id="pln-tab-extras">${content}</div>`);
}

async function evtWarnOverlaps(candidate, host) {
  const local = evtFindOverlaps(candidate, EVT_CACHED);
  let calendarHits = [];
  if (candidate.date && candidate.start_time && !candidate.all_day) {
    try {
      const check = await api("/api/calendar/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: candidate.date,
          start_time: candidate.start_time,
          end_time: candidate.end_time,
          title: candidate.title,
        }),
      });
      calendarHits = check.overlaps || [];
    } catch (_) {}
  }
  const banner = evtOverlapBanner(local, calendarHits);
  if (host) {
    host.hidden = !banner;
    host.innerHTML = banner || "";
  }
  return { local, calendarHits, ok: !local.length && !calendarHits.length };
}

async function evtCancelInstance(eventId, day) {
  const ev = EVT_CACHED.find(e => Number(e.id) === Number(eventId));
  if (!ev || !day) return;
  const days = evtEachDay(ev.date, evtEndDate(ev)).filter(d => !evtSkippedDays(ev).has(d));
  const remaining = days.filter(d => d !== day);
  if (!remaining.length) {
    await api(`/api/events/${eventId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "skipped" }),
    });
  } else if (day === ev.date) {
    await api(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: remaining[0] }),
    });
  } else if (day === evtEndDate(ev)) {
    await api(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_date: remaining[remaining.length - 1] }),
    });
  } else {
    await api(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: evtWithSkip(ev.description, day) }),
    });
  }
  const calMatch = EVT_CAL_CACHED.find(c => c.date === day && String(c.title || "").trim() === String(ev.title || "").trim());
  if (calMatch) {
    try {
      await api(`/api/calendar/${calMatch.id}`, { method: "DELETE" });
    } catch (_) {}
  }
  if (typeof showToast === "function") showToast(`Cancelled ${day}`, "good");
}

function evtCardMeta(card) {
  const id = card?.dataset?.id;
  const ev = EVT_CACHED.find(e => String(e.id) === String(id)) || {};
  return {
    id,
    ev,
    title: card.querySelector(".event-title")?.value,
    notes: card.querySelector(".event-description")?.value || card.querySelector(".event-notes")?.value || "",
    lane: card.querySelector(".event-lane")?.value || evtLaneOf(ev),
    weekly: !!card.querySelector(".event-weekly")?.checked,
    date: card.querySelector(".event-date")?.value,
    end_date: card.querySelector(".event-end-date")?.value,
    all_day: !!card.querySelector(".event-all-day")?.checked,
    start_time: evtStoredTime(card.querySelector(".event-start-time")?.value),
    end_time: evtStoredTime(card.querySelector(".event-end-time")?.value),
    location: card.querySelector(".event-location")?.value,
    url: card.querySelector(".event-url")?.value,
  };
}

async function evtSaveDescriptionMeta(card) {
  const meta = evtCardMeta(card);
  const description = evtComposeDescription(meta.notes, {
    skips: [...evtSkippedDays(meta.ev)],
    lane: meta.lane,
    weekly: meta.weekly,
    rrule: meta.weekly ? (evtRruleOf(meta.ev) || "FREQ=WEEKLY") : "",
  });
  await api(`/api/events/${meta.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return description;
}

async function evtMaterializeWeekly(ev, weeks = 8) {
  if (!ev?.date || !ev.start_time || !ev.end_time) return null;
  return api("/api/calendar/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: ev.title,
      start_date: ev.date,
      start_time: ev.start_time,
      end_time: ev.end_time,
      weeks,
      kind: "event",
      notes: evtStripSkips(ev.description),
    }),
  });
}

function wireEvents() {
  wirePlannerShell();
  if (typeof wirePlannerStripStayOnTab === "function") wirePlannerStripStayOnTab();
  const scanBtn = document.getElementById("scan-events");
  if (scanBtn) scanBtn.onclick = async () => {
    const interests = document.getElementById("events-interests").value.trim();
    const location = document.getElementById("events-location").value.trim();
    if (!interests || !location) return;
    scanBtn.textContent = "Scanning...";
    scanBtn.disabled = true;
    try {
      await api("/api/events/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests, location }),
      });
      render();
    } finally {
      scanBtn.textContent = "Scan for events";
      scanBtn.disabled = false;
    }
  };

  document.getElementById("evt-toggle-weekly")?.addEventListener("click", () => {
    EVT_SHOW_WEEKLY = !EVT_SHOW_WEEKLY;
    render();
  });

  const addEventBtn = document.getElementById("add-event");
  const newAllDay = document.getElementById("new-event-all-day");
  if (newAllDay) newAllDay.onchange = () => {
    document.getElementById("new-event-start-time").disabled = newAllDay.checked;
    document.getElementById("new-event-end-time").disabled = newAllDay.checked;
  };
  const overlapHost = document.getElementById("new-event-overlap");
  const previewOverlap = () => {
    const candidate = {
      id: "new",
      title: document.getElementById("new-event-title")?.value,
      date: document.getElementById("new-event-date")?.value,
      end_date: document.getElementById("new-event-end-date")?.value,
      start_time: document.getElementById("new-event-start-time")?.value,
      end_time: document.getElementById("new-event-end-time")?.value,
      all_day: document.getElementById("new-event-all-day")?.checked,
    };
    evtWarnOverlaps(candidate, overlapHost);
  };
  ["new-event-date", "new-event-end-date", "new-event-start-time", "new-event-end-time", "new-event-all-day"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", previewOverlap);
  });
  document.getElementById("new-event-title")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addEventBtn?.click();
    }
  });
  if (addEventBtn) addEventBtn.onclick = async () => {
    const title = document.getElementById("new-event-title").value.trim();
    if (!title) return;
    const endDate = document.getElementById("new-event-end-date").value;
    const allDay = document.getElementById("new-event-all-day").checked;
    const startTime = evtStoredTime(document.getElementById("new-event-start-time").value);
    const endTime = evtStoredTime(document.getElementById("new-event-end-time").value);
    const weekly = !!document.getElementById("new-event-weekly")?.checked;
    const lane = document.getElementById("new-event-lane")?.value || "passion";
    const notes = document.getElementById("new-event-desc").value;
    const payload = {
      title,
      date: document.getElementById("new-event-date").value,
      end_date: endDate || null,
      start_time: allDay ? null : (startTime || null),
      end_time: allDay ? null : (endTime || null),
      all_day: allDay || (!startTime && !endTime),
      location: document.getElementById("new-event-location").value,
      status: document.getElementById("new-event-status").value,
      url: document.getElementById("new-event-url").value,
      description: evtComposeDescription(notes, { lane, weekly, rrule: weekly ? "FREQ=WEEKLY" : "" }),
    };
    const warn = await evtWarnOverlaps(payload, overlapHost);
    if (!warn.ok && !window.confirm("This collides with another event. Add anyway?")) return;
    const created = await api("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (weekly && created?.id && payload.start_time && payload.end_time && payload.date) {
      try {
        await evtMaterializeWeekly({ ...created, ...payload }, 8);
      } catch (_) {}
    }
    render();
  };

  document.querySelectorAll(".event-to-calendar").forEach(btn => {
    btn.onclick = async () => {
      const card = btn.closest(".evt-card");
      const ev = EVT_CACHED.find(e => String(e.id) === String(btn.dataset.id));
      if (ev && evtIsWeeklyHidden(ev) && !EVT_SHOW_WEEKLY) {
        window.alert("Weekly events stay off the calendar until the last two days.");
        return;
      }
      const date = btn.dataset.date || card?.querySelector(".event-date")?.value;
      if (!date) {
        window.alert("Set a start date before sending to Calendar.");
        return;
      }
      const skipped = ev ? evtSkippedDays(ev) : new Set();
      if (skipped.has(date)) {
        window.alert("That instance was cancelled.");
        return;
      }
      btn.disabled = true;
      btn.textContent = "…";
      try {
        const check = await api("/api/calendar/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            start_time: btn.dataset.start || undefined,
            end_time: btn.dataset.end || undefined,
            title: (btn.dataset.title || "Event").trim(),
          }),
        });
        if ((check.overlaps || []).length && !window.confirm(`Overlaps ${(check.overlaps || []).map(e => e.title).join(", ")}. Add anyway?`)) {
          btn.textContent = "→ calendar";
          btn.disabled = false;
          return;
        }
        await api("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: (btn.dataset.title || "Event").trim(),
            date,
            start_time: btn.dataset.start || undefined,
            end_time: btn.dataset.end || undefined,
            notes: btn.dataset.notes || undefined,
            url: btn.dataset.url || undefined,
            lane: btn.dataset.lane || "passion",
            force: true,
          }),
        });
        btn.textContent = "added";
      } catch (err) {
        btn.textContent = "→ calendar";
        btn.disabled = false;
        window.alert(err.message || "Could not add to calendar.");
      }
    };
  });

  document.querySelectorAll(".event-status").forEach(sel => {
    sel.onchange = () => api(`/api/events/${sel.dataset.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: sel.value }),
    });
  });

  document.querySelectorAll(".event-title").forEach(inp => {
    inp.onchange = () => api(`/api/events/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: inp.value.trim() }),
    });
  });
  document.querySelectorAll(".event-description, .event-notes").forEach(inp => {
    inp.onchange = () => {
      const card = inp.closest(".evt-card");
      evtSaveDescriptionMeta(card).catch(err => window.alert(errorMessage(err)));
    };
  });
  document.querySelectorAll(".event-lane, .event-weekly").forEach(inp => {
    inp.onchange = async () => {
      const card = inp.closest(".evt-card");
      try {
        await evtSaveDescriptionMeta(card);
        const weekly = card.querySelector(".event-weekly")?.checked;
        const ev = EVT_CACHED.find(e => String(e.id) === String(card.dataset.id));
        if (weekly && ev?.date && card.querySelector(".event-start-time")?.value && card.querySelector(".event-end-time")?.value) {
          await evtMaterializeWeekly({
            ...ev,
            title: card.querySelector(".event-title")?.value,
            date: card.querySelector(".event-date")?.value,
            start_time: card.querySelector(".event-start-time")?.value,
            end_time: card.querySelector(".event-end-time")?.value,
            description: card.querySelector(".event-description")?.value,
          });
        }
        render();
      } catch (err) {
        window.alert(errorMessage(err));
      }
    };
  });
  document.querySelectorAll(".event-location").forEach(inp => {
    inp.onchange = () => api(`/api/events/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: inp.value }),
    });
  });
  document.querySelectorAll(".event-url").forEach(inp => {
    inp.onchange = () => api(`/api/events/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: inp.value }),
    }).then(() => render());
  });
  document.querySelectorAll(".event-date").forEach(inp => {
    inp.onchange = () => api(`/api/events/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: inp.value }),
    }).then(() => render());
  });
  document.querySelectorAll(".event-end-date").forEach(inp => {
    inp.onchange = () => api(`/api/events/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_date: inp.value || null }),
    }).then(() => render());
  });

  const patchTiming = async card => {
    const id = card.dataset.id;
    const allDay = card.querySelector(".event-all-day").checked;
    const start = card.querySelector(".event-start-time");
    const end = card.querySelector(".event-end-time");
    start.disabled = allDay;
    end.disabled = allDay;
    const startTime = evtStoredTime(start.value);
    const endTime = evtStoredTime(end.value);
    if (!allDay && (!startTime || !endTime)) {
      window.alert("Timed events keep the stored clock — set both start and end, or mark all day. Times are not auto-shifted.");
      render();
      return;
    }
    const candidate = {
      id,
      title: card.querySelector(".event-title")?.value,
      date: card.querySelector(".event-date")?.value,
      end_date: card.querySelector(".event-end-date")?.value,
      start_time: startTime,
      end_time: endTime,
      all_day: allDay,
    };
    const warn = await evtWarnOverlaps(candidate);
    if (!warn.ok && !window.confirm("Times overlap another event. Save anyway?")) {
      render();
      return;
    }
    await api(`/api/events/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        all_day: allDay,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : endTime,
      }),
    });
    render();
  };
  document.querySelectorAll(".event-all-day, .event-start-time, .event-end-time").forEach(inp => {
    inp.onchange = () => patchTiming(inp.closest(".evt-card")).catch(err => {
      window.alert(errorMessage(err));
      render();
    });
  });

  document.querySelectorAll(".evt-day-chip").forEach(btn => {
    btn.onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains("evt-day-cancelled")) return;
      const day = btn.dataset.day;
      if (!window.confirm(`Cancel the ${day} instance? Paint still works.`)) return;
      try {
        await evtCancelInstance(btn.dataset.id, day);
        render();
      } catch (err) {
        window.alert(errorMessage(err));
      }
    };
  });

  document.querySelectorAll(".event-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this event?")) return;
      await api(`/api/events/${btn.dataset.id}`, { method: "DELETE" });
      EVT_SELECTED.delete(String(btn.dataset.id));
      render();
    };
  });

  document.querySelectorAll(".event-select").forEach(box => {
    box.onchange = () => {
      const id = String(box.dataset.id);
      if (box.checked) EVT_SELECTED.add(id);
      else EVT_SELECTED.delete(id);
    };
  });

  document.getElementById("events-select")?.addEventListener("click", () => {
    EVT_SELECT_MODE = !EVT_SELECT_MODE;
    if (!EVT_SELECT_MODE) EVT_SELECTED.clear();
    render();
  });

  document.getElementById("events-edit-selected")?.addEventListener("click", async () => {
    const ids = [...EVT_SELECTED];
    if (!ids.length) {
      if (typeof showToast === "function") showToast("Select events to edit", "info");
      return;
    }
    EVT_SELECT_MODE = false;
    await render();
    const first = document.querySelector(`.evt-card[data-id="${ids[0]}"] .event-title`);
    first?.focus();
    first?.select?.();
  });

  document.getElementById("events-clear")?.addEventListener("click", async () => {
    const ids = [...EVT_SELECTED];
    if (!ids.length) {
      if (typeof showToast === "function") showToast("Select events to clear", "info");
      return;
    }
    if (!window.confirm(`Clear ${ids.length} selected event(s)?`)) return;
    for (const id of ids) {
      try { await api(`/api/events/${id}`, { method: "DELETE" }); } catch (_) {}
    }
    EVT_SELECTED.clear();
    EVT_SELECT_MODE = false;
    if (typeof showToast === "function") showToast(`Cleared ${ids.length} event(s)`, "good");
    render();
  });

  document.getElementById("tdy-select-edit-events")?.addEventListener("click", () => {
    EVT_SELECT_MODE = true;
    render();
  });
}
