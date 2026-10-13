// --- Calendar ---------------------------------------------------------

let CALENDAR_VIEW = ["month", "week", "day", "hours", "list"].includes(localStorage.getItem("calendarView"))
  ? localStorage.getItem("calendarView")
  : "month";
let CALENDAR_MONTH_YM = localStorage.getItem("calendarMonth") || localYmd().slice(0, 7);
let CALENDAR_WEEK_START = localStorage.getItem("calendarWeekStart") || "";
let CALENDAR_FOCUS_ID = null;
let CALENDAR_GOOGLE_CONNECTED = false;
let CALENDAR_EVENTS = [];
let CALENDAR_PLAN_EVENTS = [];

function calYmToDate(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function calFormatYm(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function calMonthLabel(ym) {
  const d = calYmToDate(ym);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function calDaysInMonth(ym) {
  const d = calYmToDate(ym);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function calDayStr(ym, day) {
  const d = calYmToDate(ym);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calDateFromYmd(ymd) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  return new Date(y, m - 1, d);
}

function calFormatYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calShiftDay(ymd, days) {
  const d = calDateFromYmd(ymd);
  d.setDate(d.getDate() + days);
  return calFormatYmd(d);
}

function calWeekStartFor(ymd) {
  const d = calDateFromYmd(ymd);
  d.setDate(d.getDate() - d.getDay());
  return calFormatYmd(d);
}

function calResolvedWeekStart() {
  if (/^\d{4}-\d{2}-\d{2}$/.test(CALENDAR_WEEK_START)) return CALENDAR_WEEK_START;
  CALENDAR_WEEK_START = calWeekStartFor(CURRENT_DATE || localYmd());
  return CALENDAR_WEEK_START;
}

function calTruncate(text, max) {
  const t = text || "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function calPlanningEventOnDay(ev, dayStr) {
  const start = ev.date;
  if (!start) return false;
  const end = ev.end_date || start;
  return dayStr >= start && dayStr <= end;
}

function calPlanningMarkers(ev, dayStr) {
  const start = ev.date;
  const end = ev.end_date || start;
  let prefix = "";
  let suffix = "";
  if (dayStr > start) prefix = "◂ ";
  if (dayStr < end) suffix = " ▸";
  return { prefix, suffix };
}

function calEventTimePrefix(ev) {
  return ev && ev.start_time ? `${String(ev.start_time).slice(0, 5)} ` : "";
}

function calIsClass(ev) {
  return !!(ev && (ev.kind === "class" || ev.class_id));
}

function calEventCalendarItems(events) {
  return (events || []).filter(ev => !calIsClass(ev));
}

function calHourDivisionMinutes() {
  if (typeof tdyHourDivisionMinutes === "function") return tdyHourDivisionMinutes();
  try {
    const n = Number(localStorage.getItem("hourSplitMinutes") || "60");
    return [15, 20, 30, 60].includes(n) ? n : 60;
  } catch {
    return 60;
  }
}

function calPaintCell(date, hour) {
  const day = (typeof WEEK_PAINT_HOURS !== "undefined" && WEEK_PAINT_HOURS[date]) || {};
  return day[hour] || day[String(hour)] || null;
}

function calTravelPaintStyle(cell) {
  const key = String(cell?.category || "").toLowerCase().replace(/[\s_]+/g, "-");
  if (key === "travel" || key === "time-change" || key === "timechange") {
    return "background:#111111;color:#ffffff;";
  }
  return "";
}

function calEventToneClass(event) {
  if (calIsClass(event)) return " cal-chip-class";
  if (event?.lane === "work") return " cal-chip-work";
  if (event?.lane === "passion") return " cal-chip-passion";
  return "";
}

function calNowMarkerHtml(dayStr) {
  if (dayStr !== localYmd()) return "";
  const n = new Date();
  const top = ((n.getHours() + n.getMinutes() / 60 - 6) / 16) * 100;
  return `<div class="tdy-now-marker cal-now-marker" style="top:${Math.max(0, Math.min(100, top))}%;"></div>`;
}

function calPaintStripHtml(dayStr) {
  const cells = Array.from({ length: 24 }, (_, hour) => {
    const cell = calPaintCell(dayStr, hour);
    const style = calTravelPaintStyle(cell)
      || (cell && typeof hourCellPaintStyle === "function" ? hourCellPaintStyle(cell) : "");
    const selected = typeof TDY_WEEK_SELECT !== "undefined" && TDY_WEEK_SELECT.has(`${dayStr}|${hour}`);
    return `<button type="button" class="cal-paint-cell${cell?.category ? " cal-paint-cell-filled" : ""}${selected ? " tdy-week-paint-cell-selected" : ""}" data-week-date="${escapeHtml(dayStr)}" data-week-hour="${hour}" style="${style}" title="${escapeHtml(`${dayStr} ${String(hour).padStart(2, "0")}:00`)}"></button>`;
  }).join("");
  return `<div class="cal-paint-strip" role="group" aria-label="Painted hours">${cells}</div>`;
}

function calDayEvents(calendarEvents, planningEvents, dayStr) {
  return [
    ...(calendarEvents || []).filter(event => event.date === dayStr),
    ...(planningEvents || []).filter(event => calPlanningEventOnDay(event, dayStr)).map(event => ({ ...event, _plan: true })),
  ];
}

function wirePlannerStripStayOnTab() {
  document.querySelectorAll(".pln-mini-day, .pln-day-chip, .today-day-chip").forEach(btn => {
    btn.onclick = async () => {
      const date = btn.dataset.date;
      if (!date) return;
      if (date === CURRENT_DATE) {
        if (typeof refreshPlannerStripPartial === "function") refreshPlannerStripPartial();
        return;
      }
      if (typeof tryNavigateTodayDate === "function") await tryNavigateTodayDate(date);
      else render();
    };
  });
  document.querySelectorAll(".pln-strip-nav-btn").forEach(btn => {
    btn.onclick = async () => {
      if (typeof plnShiftDateByMonths !== "function" || typeof tryNavigateTodayDate !== "function") {
        render();
        return;
      }
      const newDate = plnShiftDateByMonths(CURRENT_DATE, Number(btn.dataset.dir));
      await tryNavigateTodayDate(newDate);
    };
  });
}

function renderCalendarListRows(events, googleStatus) {
  return events.map(e => `
    <tr id="cal-row-${e.id}" class="${CALENDAR_FOCUS_ID === e.id ? "cal-row-focus" : ""}">
      <td><input type="date" data-event="${e.id}" class="cal-date" value="${escapeHtml(e.date || "")}"></td>
      <td><input type="time" data-event="${e.id}" class="cal-start" value="${escapeHtml(e.start_time || "")}"></td>
      <td><input type="time" data-event="${e.id}" class="cal-end" value="${escapeHtml(e.end_time || "")}"></td>
      <td><input type="text" data-event="${e.id}" class="cal-title" value="${escapeHtml(e.title || "").replace(/"/g, "&quot;")}"></td>
      <td><input type="text" data-event="${e.id}" class="cal-notes" value="${escapeHtml(e.notes || "").replace(/"/g, "&quot;")}"></td>
      <td>${e.google_event_id ? '<span class="pill status-good">synced</span>' : `<button class="secondary cal-sync" data-event="${e.id}" ${googleStatus.connected ? "" : "disabled"}>Sync to Google</button>`}</td>
      <td><button class="secondary icon-circle cal-delete" data-event="${e.id}" title="Delete event" aria-label="Delete event">&times;</button></td>
    </tr>`).join("");
}

function renderCalendarMonthGrid(calendarEvents, planningEvents, ym) {
  const first = calYmToDate(ym);
  const startPad = first.getDay();
  const days = calDaysInMonth(ym);
  const today = localYmd();
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [];

  for (let i = 0; i < startPad; i++) {
    cells.push('<div class="cal-month-cell cal-month-cell-pad"></div>');
  }

  for (let day = 1; day <= days; day++) {
    const dayStr = calDayStr(ym, day);
    const isToday = dayStr === today;
    const chronological = (a, b) => {
      const aTime = a.start_time ? String(a.start_time).slice(0, 5) : "99:99";
      const bTime = b.start_time ? String(b.start_time).slice(0, 5) : "99:99";
      return aTime.localeCompare(bTime)
        || String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
    };
    const dayCalEvents = calendarEvents.filter(e => e.date === dayStr).sort(chronological);
    const dayPlanEvents = planningEvents.filter(e => calPlanningEventOnDay(e, dayStr)).sort(chronological);

    const calChips = dayCalEvents.map(e => `
      <button type="button" class="cal-month-chip cal-month-chip-cal" data-cal-id="${e.id}" title="${escapeHtml(e.title || "")}">
        ${escapeHtml(calTruncate(calEventTimePrefix(e) + (e.title || ""), 18))}
      </button>`).join("");

    const planChips = dayPlanEvents.map(e => {
      const { prefix, suffix } = calPlanningMarkers(e, dayStr);
      const label = calEventTimePrefix(e) + (e.title || "");
      return `<button type="button" class="cal-month-chip cal-month-chip-plan" data-plan-id="${e.id}" title="Open planning event: ${escapeHtml(e.title || "")}">${escapeHtml(prefix)}${escapeHtml(calTruncate(label, 16))}${escapeHtml(suffix)}</button>`;
    }).join("");

    cells.push(`
      <div class="cal-month-cell${isToday ? " cal-month-cell-today" : ""}" data-day="${escapeHtml(dayStr)}">
        <div class="cal-month-cell-head">
          <button type="button" class="cal-month-daynum cal-month-goto" data-day="${escapeHtml(dayStr)}" title="Open in Today">${day}</button>
          <button type="button" class="cal-month-plan secondary" data-day="${escapeHtml(dayStr)}" title="Plan ${escapeHtml(dayStr)}">plan</button>
          <button type="button" class="cal-month-add secondary" data-day="${escapeHtml(dayStr)}" title="Add event on ${escapeHtml(dayStr)}">+ add</button>
        </div>
        <div class="cal-month-chips">${calChips}${planChips}</div>
      </div>`);
  }

  return `
    <div class="cal-month-toolbar">
      <button type="button" class="secondary icon-circle cal-month-nav" data-dir="-1" title="Previous month" aria-label="Previous month">←</button>
      <strong class="cal-month-label">${escapeHtml(calMonthLabel(ym))}</strong>
      <button type="button" class="secondary icon-circle cal-month-nav" data-dir="1" title="Next month" aria-label="Next month">→</button>
      <button type="button" class="secondary cal-month-today">Today</button>
    </div>
    <div class="cal-month-weekdays">${weekdayLabels.map(w => `<div class="cal-month-weekday">${w}</div>`).join("")}</div>
    <div class="cal-month-grid">${cells.join("")}</div>`;
}

function calWeekTimeParts(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function calWeekLabel(startYmd) {
  const start = calDateFromYmd(startYmd);
  const end = calDateFromYmd(calShiftDay(startYmd, 6));
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return sameYear ? `${startLabel} – ${endLabel}, ${end.getFullYear()}` : `${startLabel} – ${endLabel}`;
}

function calWeekEventBounds(event) {
  const start = calWeekTimeParts(event.start_time);
  if (start == null) return null;
  const rawEnd = calWeekTimeParts(event.end_time);
  let end = rawEnd != null && rawEnd > start ? rawEnd : start + 60;
  if (end - start < 60) {
    const hourEnd = Math.floor(start / 60) * 60 + 60;
    return { start, end: Math.max(end, hourEnd) };
  }
  return { start, end };
}

function calWeekEventIsOffHours(event) {
  const dayStart = 6 * 60;
  const dayEnd = 22 * 60;
  const bounds = calWeekEventBounds(event);
  if (!bounds) return false;
  return bounds.end <= dayStart || bounds.start >= dayEnd;
}

function calWeekOverlapColumns(events) {
  const ranked = events
    .map(event => ({ event, bounds: calWeekEventBounds(event) }))
    .filter(item => item.bounds)
    .sort((a, b) => a.bounds.start - b.bounds.start || a.bounds.end - b.bounds.end || Number(a.event.id) - Number(b.event.id));
  const active = [];
  ranked.forEach(item => {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].bounds.end <= item.bounds.start) active.splice(i, 1);
    }
    const used = new Set(active.map(entry => entry.col));
    let col = 0;
    while (used.has(col)) col += 1;
    item.col = col;
    active.push(item);
  });
  const out = new Map();
  ranked.forEach(item => {
    const peers = ranked.filter(other =>
      other.bounds.start < item.bounds.end && other.bounds.end > item.bounds.start
    );
    const width = Math.max(1, ...peers.map(peer => peer.col + 1));
    out.set(Number(item.event.id), { col: item.col, cols: width });
  });
  return out;
}

function renderCalendarWeekEvent(event, layout = null) {
  const dayStart = 6 * 60;
  const dayEnd = 22 * 60;
  const tone = calEventToneClass(event);
  const plan = event._plan ? " cal-week-chip-plan" : "";
  const bounds = calWeekEventBounds(event);
  if (!bounds || calWeekEventIsOffHours(event)) {
    const time = event.start_time ? `${String(event.start_time).slice(0, 5)} ` : "";
    const label = `${time}${event.title || "Untitled event"}`;
    return `<button type="button" class="cal-week-chip cal-week-chip-all-day${tone}${plan}" data-cal-id="${event.id}" data-kind="${event._plan ? "event" : "calendar"}" data-id="${event.id}" title="${escapeHtml(label)}">${escapeHtml(calTruncate(label, 24))}</button>`;
  }
  const visibleStart = Math.max(dayStart, Math.min(dayEnd, bounds.start));
  const visibleEnd = Math.min(dayEnd, Math.max(visibleStart, bounds.end));
  const top = ((visibleStart - dayStart) / (dayEnd - dayStart)) * 100;
  const height = Math.max(6.25, ((visibleEnd - visibleStart) / (dayEnd - dayStart)) * 100);
  const time = String(event.start_time).slice(0, 5);
  const slot = layout?.get(Number(event.id));
  const cols = Math.max(1, slot?.cols || 1);
  const col = Math.min(cols - 1, slot?.col || 0);
  const width = (100 / cols).toFixed(3);
  const left = ((100 / cols) * col).toFixed(3);
  return `
    <button type="button" class="cal-week-chip cal-week-chip-timed${tone}${plan}" data-cal-id="${event.id}" data-kind="${event._plan ? "event" : "calendar"}" data-id="${event.id}"
      style="top:${top.toFixed(3)}%;height:${height.toFixed(3)}%;left:calc(${left}% + 2px);width:calc(${width}% - 4px);right:auto;"
      title="${escapeHtml(`${time} ${event.title || ""}`)}">
      <span>${escapeHtml(time)}</span> ${escapeHtml(calTruncate(event.title || "Untitled event", 22))}
    </button>`;
}

function renderCalendarWeekGrid(calendarEvents, startYmd, planningEvents = []) {
  const today = localYmd();
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const split = calHourDivisionMinutes();
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayStr = calShiftDay(startYmd, i);
    const date = calDateFromYmd(dayStr);
    const dayEvents = calDayEvents(calendarEvents, planningEvents, dayStr);
    const strip = dayEvents.filter(event => calWeekTimeParts(event.start_time) == null || calWeekEventIsOffHours(event));
    const timed = dayEvents.filter(event => calWeekTimeParts(event.start_time) != null && !calWeekEventIsOffHours(event));
    const layout = calWeekOverlapColumns(timed);
    return `
      <section class="cal-week-day${dayStr === today ? " cal-week-day-today" : ""}" data-day="${escapeHtml(dayStr)}">
        <header class="cal-week-day-head">
          <button type="button" class="cal-week-goto" data-day="${escapeHtml(dayStr)}" title="Open in Today">
            <span>${escapeHtml(date.toLocaleDateString(undefined, { weekday: "short" }))}</span>
            <strong>${date.getDate()}</strong>
          </button>
          <button type="button" class="secondary cal-week-add" data-day="${escapeHtml(dayStr)}">+ Event</button>
        </header>
        <div class="cal-week-all-day">${strip.map(event => renderCalendarWeekEvent(event)).join("")}</div>
        ${calPaintStripHtml(dayStr)}
        <div class="cal-week-timeline" data-split="${split}">
          ${i === 0 ? hours.map(hour => `<span class="cal-week-hour" style="top:${((hour - 6) / 16) * 100}%">${String(hour).padStart(2, "0")}:00</span>`).join("") : ""}
          ${timed.map(event => renderCalendarWeekEvent(event, layout)).join("")}
          ${calNowMarkerHtml(dayStr)}
        </div>
      </section>`;
  }).join("");

  return `
    <div class="cal-week-toolbar">
      <button type="button" class="secondary icon-circle cal-week-nav" data-dir="-1" title="Previous week" aria-label="Previous week">←</button>
      <strong class="cal-week-label">${escapeHtml(calWeekLabel(startYmd))}</strong>
      <button type="button" class="secondary icon-circle cal-week-nav" data-dir="1" title="Next week" aria-label="Next week">→</button>
      <button type="button" class="secondary cal-week-today">This week</button>
    </div>
    <div class="cal-week-scroll">
      <div class="cal-week-grid">${days}</div>
    </div>`;
}

function renderCalendarDayGrid(calendarEvents, dayYmd, planningEvents = []) {
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const today = localYmd();
  const date = calDateFromYmd(dayYmd);
  const dayEvents = calDayEvents(calendarEvents, planningEvents, dayYmd);
  const strip = dayEvents.filter(event => calWeekTimeParts(event.start_time) == null || calWeekEventIsOffHours(event));
  const timed = dayEvents.filter(event => calWeekTimeParts(event.start_time) != null && !calWeekEventIsOffHours(event));
  const layout = calWeekOverlapColumns(timed);
  const split = calHourDivisionMinutes();
  return `
    <div class="cal-week-toolbar">
      <button type="button" class="secondary icon-circle cal-day-nav" data-dir="-1" title="Previous day">←</button>
      <strong class="cal-week-label">${escapeHtml(date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</strong>
      <button type="button" class="secondary icon-circle cal-day-nav" data-dir="1" title="Next day">→</button>
      <button type="button" class="secondary cal-week-today" data-cal-today-day="1">Today</button>
    </div>
    <div class="cal-week-scroll">
      <div class="cal-week-grid" style="grid-template-columns:1fr;min-width:0;">
        <section class="cal-week-day${dayYmd === today ? " cal-week-day-today" : ""}" data-day="${escapeHtml(dayYmd)}">
          <header class="cal-week-day-head">
            <button type="button" class="cal-week-goto" data-day="${escapeHtml(dayYmd)}">
              <span>${escapeHtml(date.toLocaleDateString(undefined, { weekday: "short" }))}</span>
              <strong>${date.getDate()}</strong>
            </button>
            <button type="button" class="secondary cal-week-add" data-day="${escapeHtml(dayYmd)}">+ Event</button>
          </header>
          <div class="cal-week-all-day">${strip.map(event => renderCalendarWeekEvent(event)).join("")}</div>
          ${calPaintStripHtml(dayYmd)}
          <div class="cal-week-timeline" style="position:relative;" data-split="${split}">
            ${hours.map(hour => `<span class="cal-week-hour" style="top:${((hour - 6) / 16) * 100}%">${String(hour).padStart(2, "0")}:00</span>`).join("")}
            ${timed.map(event => renderCalendarWeekEvent(event, layout)).join("")}
            ${calNowMarkerHtml(dayYmd)}
          </div>
        </section>
      </div>
    </div>`;
}

function renderCalendarHoursGrid(calendarEvents, ym) {
  const days = calDaysInMonth(ym);
  const today = localYmd();
  const labels = Array.from({ length: 24 }, (_, h) => `<span>${String(h).padStart(2, "0")}</span>`).join("");
  const rows = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const dayStr = calDayStr(ym, day);
    const dayEvents = calendarEvents.filter(event => event.date === dayStr);
    const cells = Array.from({ length: 24 }, (_, h) => {
      const hit = dayEvents.find(event => {
        const minutes = calWeekTimeParts(event.start_time);
        return minutes != null && Math.floor(minutes / 60) === h;
      });
      const paint = calPaintCell(dayStr, h);
      const paintStyle = calTravelPaintStyle(paint)
        || (paint && typeof hourCellPaintStyle === "function" ? hourCellPaintStyle(paint) : "");
      const title = hit ? (hit.title || "Busy") : (paint?.category ? `${dayStr} ${String(h).padStart(2, "0")}:00 painted` : `${dayStr} ${String(h).padStart(2, "0")}:00`);
      return `<button type="button" class="cal-hour-cell${hit ? " cal-hour-busy" : ""}${paint?.category ? " cal-hour-painted" : ""}" data-day="${escapeHtml(dayStr)}" data-hour="${h}" data-cal-id="${hit ? hit.id : ""}" data-week-date="${escapeHtml(dayStr)}" data-week-hour="${h}" style="${paintStyle}" title="${escapeHtml(title)}"></button>`;
    }).join("");
    return `<div class="cal-hours-row${dayStr === today ? " cal-hours-today" : ""}">
      <button type="button" class="cal-hours-day cal-week-goto" data-day="${escapeHtml(dayStr)}">${day}</button>
      <div class="cal-hours-strip">${cells}</div>
    </div>`;
  }).join("");
  return `
    <div class="cal-month-toolbar">
      <button type="button" class="secondary icon-circle cal-month-nav" data-dir="-1" title="Previous month">←</button>
      <strong class="cal-month-label">${escapeHtml(calMonthLabel(ym))} · hour by hour</strong>
      <button type="button" class="secondary icon-circle cal-month-nav" data-dir="1" title="Next month">→</button>
      <button type="button" class="secondary cal-month-today">This month</button>
    </div>
    <p class="stub" style="margin:0 0 8px;">Click an hour to place an event. After Reorganise, this is the month timeline.</p>
    <div class="cal-hours-head"><span></span><div class="cal-hours-strip cal-hours-labels">${labels}</div></div>
    <div class="cal-hours-body">${rows}</div>`;
}

function renderCalendarInlineEditor(event, googleStatus) {
  if (!event) return "";
  return `
    <div class="card cal-inline-editor" id="cal-inline-editor">
      <strong style="font-size:12px;">Edit event</strong>
      <div class="cal-inline-fields">
        <input type="date" id="cal-inline-date" value="${escapeHtml(event.date || "")}">
        ${typeof tdyTimePickHtml === "function"
          ? tdyTimePickHtml("cal-inline-start", event.start_time || "", "Start") + tdyTimePickHtml("cal-inline-end", event.end_time || "", "End")
          : `<input type="time" id="cal-inline-start" value="${escapeHtml(event.start_time || "")}"><input type="time" id="cal-inline-end" value="${escapeHtml(event.end_time || "")}">`}
        <input type="text" id="cal-inline-title" value="${escapeHtml(event.title || "").replace(/"/g, "&quot;")}" placeholder="Title" style="flex:2;">
        <input type="text" id="cal-inline-notes" value="${escapeHtml(event.notes || "").replace(/"/g, "&quot;")}" placeholder="Notes" style="flex:2;">
        <input type="url" id="cal-inline-url" value="${escapeHtml(event.url || "").replace(/"/g, "&quot;")}" placeholder="Zoom / meeting link" style="flex:2;">
        <select id="cal-inline-kind" title="Classes stay off this calendar">
          <option value="event" ${event.kind === "class" ? "" : "selected"}>Event</option>
          <option value="class" ${event.kind === "class" || event.class_id ? "selected" : ""}>Class</option>
        </select>
        <select id="cal-inline-lane">
          <option value="work" ${event.lane === "work" ? "selected" : ""}>Work</option>
          <option value="passion" ${event.lane === "work" ? "" : "selected"}>Passion</option>
        </select>
      </div>
      <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
        <span class="cal-inline-save-state stub" role="status">Autosaves</span>
        ${event.google_event_id
          ? '<span class="pill status-good">synced</span>'
          : `<button class="secondary cal-inline-sync" data-event="${event.id}" ${googleStatus.connected ? "" : "disabled"}>Sync to Google</button>`}
        <button class="secondary cal-inline-delete" data-event="${event.id}">Delete</button>
        <button class="secondary cal-inline-close">Close</button>
      </div>
    </div>`;
}

function calUpdateEventChip(event, { reshaped = false } = {}) {
  const monthChip = document.querySelector(`.cal-month-chip-cal[data-cal-id="${Number(event.id)}"]`);
  if (monthChip) {
    monthChip.title = event.title || "";
    monthChip.textContent = calTruncate(calEventTimePrefix(event) + (event.title || ""), 18);
  }
  if (reshaped && CALENDAR_VIEW === "week") {
    // Time/date edits move chips across the map — rebuild rather than lie about position.
    render();
    return;
  }
  const weekChip = document.querySelector(`.cal-week-chip[data-cal-id="${Number(event.id)}"]`);
  if (weekChip) {
    const label = `${calEventTimePrefix(event)}${event.title || "Untitled event"}`;
    weekChip.title = label;
    const timeSpan = weekChip.querySelector("span");
    if (timeSpan && event.start_time) {
      timeSpan.textContent = String(event.start_time).slice(0, 5);
      weekChip.lastChild.textContent = ` ${calTruncate(event.title || "Untitled event", 22)}`;
    } else {
      weekChip.textContent = calTruncate(label, 26);
    }
  }
}

function calOpenInlineEditor(event, anchor) {
  if (!event || !anchor) return;
  const previous = document.getElementById("cal-inline-editor");
  if (previous && previous !== anchor) {
    if (typeof previous._calSave === "function") previous._calSave();
    previous.closest(".cal-month-cell, .cal-week-day")?.classList.remove("cal-month-cell-editing", "cal-week-day-editing");
    previous.remove();
  }
  CALENDAR_FOCUS_ID = Number(event.id);
  const holder = document.createElement("div");
  holder.innerHTML = renderCalendarInlineEditor(event, { connected: CALENDAR_GOOGLE_CONNECTED }).trim();
  const editor = holder.firstElementChild;
  const cell = anchor.closest(".cal-month-cell, .cal-week-day");
  anchor.insertAdjacentElement("afterend", editor);
  if (cell?.classList.contains("cal-week-day")) cell.classList.add("cal-week-day-editing");
  else cell?.classList.add("cal-month-cell-editing");

  let timer = null;
  let inFlight = null;
  const state = editor.querySelector(".cal-inline-save-state");
  const values = () => {
    const start = (typeof tdyNormalizeTimeInput === "function"
      ? tdyNormalizeTimeInput(editor.querySelector("#cal-inline-start"))
      : editor.querySelector("#cal-inline-start")?.value) || null;
    const end = (typeof tdyNormalizeTimeInput === "function"
      ? tdyNormalizeTimeInput(editor.querySelector("#cal-inline-end"))
      : editor.querySelector("#cal-inline-end")?.value) || null;
    return {
      date: editor.querySelector("#cal-inline-date")?.value || "",
      start_time: start,
      end_time: end,
      title: editor.querySelector("#cal-inline-title")?.value.trim() || "Untitled event",
      notes: editor.querySelector("#cal-inline-notes")?.value || "",
      url: editor.querySelector("#cal-inline-url")?.value || "",
      kind: editor.querySelector("#cal-inline-kind")?.value || "event",
      lane: editor.querySelector("#cal-inline-lane")?.value || "passion",
    };
  };
  const save = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (inFlight) await inFlight;
    if (state) state.textContent = "Saving…";
    const payload = values();
    inFlight = api(`/api/calendar/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    try {
      const updated = await inFlight;
      const reshaped = payload.date !== (event.date || "")
        || String(payload.start_time || "") !== String(event.start_time || "")
        || String(payload.end_time || "") !== String(event.end_time || "");
      Object.assign(event, payload, updated || {});
      calUpdateEventChip(event, { reshaped });
      if (state) state.textContent = "Saved";
    } catch (err) {
      if (state) state.textContent = "Save failed";
      if (typeof showToast === "function") showToast("Could not save event: " + errorMessage(err), "warn");
    } finally {
      inFlight = null;
    }
  };
  editor._calSave = save;
  editor.querySelectorAll("input, select").forEach(input => {
    input.addEventListener("input", () => {
      if (state) state.textContent = "Unsaved";
      clearTimeout(timer);
      timer = setTimeout(save, 450);
    });
    input.addEventListener("change", save);
  });
  editor.querySelector(".cal-inline-close")?.addEventListener("click", async () => {
    await save();
    CALENDAR_FOCUS_ID = null;
    cell?.classList.remove("cal-month-cell-editing", "cal-week-day-editing");
    editor.remove();
  });
  editor.querySelector(".cal-inline-delete")?.addEventListener("click", async () => {
    if (!window.confirm("Delete this event?")) return;
    await api(`/api/calendar/${event.id}`, { method: "DELETE" });
    CALENDAR_EVENTS = CALENDAR_EVENTS.filter(item => Number(item.id) !== Number(event.id));
    CALENDAR_FOCUS_ID = null;
    cell?.classList.remove("cal-month-cell-editing", "cal-week-day-editing");
    anchor.remove();
    editor.remove();
  });
  editor.querySelector(".cal-inline-sync")?.addEventListener("click", async e => {
    const button = e.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>';
    const result = await api(`/api/calendar/${event.id}/sync-to-google`, { method: "POST" });
    if (result.error) {
      window.alert(result.error);
      button.disabled = false;
      button.textContent = "Sync to Google";
    } else {
      button.replaceWith(Object.assign(document.createElement("span"), {
        className: "pill status-good",
        textContent: "synced",
      }));
    }
  });
  editor.querySelector("#cal-inline-title")?.focus();
  if (typeof tdyWireTimePick === "function") tdyWireTimePick(editor);
}

function renderCalendarToolbar(googleStatus) {
  return `
    <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
      <button class="secondary" id="add-cal-row">+ Add event</button>
      <label class="secondary" style="cursor:pointer; padding:7px 14px; border-radius:6px; border:1px solid var(--border);">
        Import .ics file
        <input type="file" id="ics-file-input" accept=".ics" style="display:none;">
      </label>
      <button class="secondary" id="pull-from-google" ${googleStatus.connected ? "" : "disabled"}>Pull from Google Calendar</button>
    </div>`;
}

async function renderCalendarExtrasPanel() {
  const [events, googleStatus, planningEvents] = await Promise.all([
    api("/api/calendar"),
    api("/api/google/status"),
    api("/api/events").catch(() => []),
  ]);
  CALENDAR_GOOGLE_CONNECTED = googleStatus.connected;
  CALENDAR_EVENTS = events;
  CALENDAR_PLAN_EVENTS = planningEvents;
  if (typeof loadWeekPaintHours === "function") {
    try { await loadWeekPaintHours(calResolvedWeekStart() || CURRENT_DATE || localYmd()); } catch (_) {}
  }
  const eventOnly = calEventCalendarItems(events);
  const viewToggle = `
    <div class="cal-view-toggle seg-pill" role="group" aria-label="Calendar view">
      <button type="button" class="seg-pill-btn cal-view-btn${CALENDAR_VIEW === "month" ? " active" : ""}" data-view="month">Month</button>
      <button type="button" class="seg-pill-btn cal-view-btn${CALENDAR_VIEW === "week" ? " active" : ""}" data-view="week">Week</button>
      <button type="button" class="seg-pill-btn cal-view-btn${CALENDAR_VIEW === "day" ? " active" : ""}" data-view="day">Day</button>
      <button type="button" class="seg-pill-btn cal-view-btn${CALENDAR_VIEW === "hours" ? " active" : ""}" data-view="hours">Hours</button>
      <button type="button" class="seg-pill-btn cal-view-btn${CALENDAR_VIEW === "list" ? " active" : ""}" data-view="list">List</button>
    </div>`;
  const listBlock = CALENDAR_VIEW === "list" ? `
    <div class="card cal-list-panel">
      <table>
        <thead><tr><th>Date</th><th>Start</th><th>End</th><th>Title</th><th>Notes</th><th>Google</th><th></th></tr></thead>
        <tbody>${renderCalendarListRows(eventOnly, googleStatus)}</tbody>
      </table>
      ${eventOnly.length === 0 ? '<p class="stub">No events yet -- add one below or import a calendar file. Classes stay on Today / Tasks.</p>' : ""}
    </div>` : "";
  const monthBlock = CALENDAR_VIEW === "month" ? `
    <div class="cal-month-panel">
      ${renderCalendarMonthGrid(eventOnly, planningEvents, CALENDAR_MONTH_YM)}
    </div>` : "";
  const weekBlock = CALENDAR_VIEW === "week" ? `
    <div class="cal-week-panel">
      ${renderCalendarWeekGrid(events, calResolvedWeekStart(), planningEvents)}
    </div>` : "";
  const dayBlock = CALENDAR_VIEW === "day" ? `
    <div class="cal-week-panel cal-day-panel">
      ${renderCalendarDayGrid(events, CURRENT_DATE || localYmd(), planningEvents)}
    </div>` : "";
  const hoursBlock = CALENDAR_VIEW === "hours" ? `
    <div class="cal-hours-panel">
      ${renderCalendarHoursGrid(events, CALENDAR_MONTH_YM)}
    </div>` : "";
  return `
    <style>
      .cal-view-toggle { margin-bottom:10px; }
      .cal-month-panel, .cal-week-panel, .cal-fused-extras { max-width:100%; min-width:0; overflow:visible; }
      .cal-month-panel { overflow-x:auto; overflow-y:visible; }
      .cal-month-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; min-width:0; }
      .cal-month-label { font-size:14px; min-width:0; flex:1 1 160px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cal-month-weekdays, .cal-month-grid { display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; max-width:100%; }
      .cal-month-weekday { font-size:12px; color:var(--ink-secondary); text-align:center; padding:6px 0; line-height:1.2; }
      .cal-month-cell { min-height:60px; border:1px solid var(--gridline); border-radius:6px; padding:5px; background:var(--bg-card); display:flex; flex-direction:column; gap:3px; min-width:0; overflow:visible; }
      .cal-month-cell-editing { border-color:var(--accent); position:relative; z-index:4; }
      .cal-month-cell-pad { visibility:hidden; border:none; background:transparent; }
      .cal-month-cell-today { border-color:var(--gridline); box-shadow:0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 1px 6px color-mix(in srgb, var(--accent) 14%, transparent); }
      .cal-month-cell-head { display:flex; justify-content:space-between; align-items:center; gap:3px; flex-wrap:wrap; min-width:0; }
      .cal-month-daynum { font-size:12px; font-weight:600; border:none; background:transparent; padding:1px 3px; cursor:pointer; color:inherit; font-variant-numeric:tabular-nums; min-width:1.5em; }
      .cal-month-plan, .cal-month-add { font-size:9px; padding:1px 5px; line-height:1.25; min-height:0; }
      .cal-month-chips { display:flex; flex-direction:column; gap:2px; overflow:hidden; min-width:0; max-width:100%; flex:1 1 auto; }
      .cal-month-chip { font-size:10px; line-height:1.3; padding:2px 4px; border-radius:3px; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:none; max-width:100%; }
      .cal-month-chip-cal { background:color-mix(in srgb, var(--accent) 18%, var(--bg-card)); color:var(--ink-primary); cursor:pointer; }
      .cal-month-chip-plan { background:color-mix(in srgb, var(--status-warning) 16%, var(--bg-card)); color:var(--ink-secondary); border-left:2px solid var(--status-warning); cursor:pointer; }
      .cal-inline-fields { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; align-items:center; }
      .cal-inline-fields input { font-size:13px; padding:6px 8px; min-width:0; }
      .cal-month-cell .cal-inline-editor { margin:3px 0 0; padding:7px; min-width:0; box-shadow:0 4px 14px rgba(0,0,0,0.16); }
      .cal-month-cell .cal-inline-fields { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
      .cal-month-cell .cal-inline-fields input { width:100%; box-sizing:border-box; font-size:10px; padding:4px; }
      .cal-month-cell .cal-inline-fields #cal-inline-title, .cal-month-cell .cal-inline-fields #cal-inline-notes { grid-column:1 / -1; }
      .cal-week-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
      .cal-week-label { flex:1 1 180px; text-align:center; font-size:14px; }
      .cal-week-scroll { overflow-x:auto; padding-bottom:4px; }
      .cal-week-grid { display:grid; grid-template-columns:repeat(7, minmax(120px, 1fr)); min-width:840px; gap:4px; }
      .cal-week-day { position:relative; min-width:0; border:1px solid var(--gridline); border-radius:6px; background:var(--bg-card); }
      .cal-week-day-today { box-shadow:0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent); }
      .cal-week-day-editing { z-index:5; }
      .cal-week-day-head { display:flex; align-items:center; justify-content:space-between; gap:4px; min-height:46px; padding:5px; border-bottom:1px solid var(--gridline); }
      .cal-week-goto { display:flex; align-items:baseline; gap:5px; padding:2px; border:0; background:transparent; color:var(--ink-primary); cursor:pointer; }
      .cal-week-goto span { color:var(--ink-secondary); font-size:11px; }
      .cal-week-goto strong { font-size:15px; }
      .cal-week-add { font-size:10px; padding:3px 5px; white-space:nowrap; }
      .cal-week-all-day { height:42px; padding:3px; box-sizing:border-box; display:flex; flex-direction:column; gap:2px; overflow-y:auto; border-bottom:1px solid var(--gridline); }
      .cal-week-timeline { position:relative; height:640px; background:repeating-linear-gradient(to bottom, transparent 0, transparent 39px, var(--gridline) 40px); }
      .cal-week-hour { position:absolute; left:2px; z-index:1; transform:translateY(-50%); font-size:8px; color:var(--ink-muted); pointer-events:none; }
      .cal-week-chip { border:0; border-left:2px solid var(--accent); border-radius:3px; background:color-mix(in srgb, var(--accent) 16%, var(--bg-card)); color:var(--ink-primary); text-align:left; cursor:pointer; overflow:hidden; }
      .cal-week-chip-all-day { width:100%; padding:3px 5px; font-size:10px; white-space:nowrap; text-overflow:ellipsis; }
      .cal-week-chip-timed { position:absolute; z-index:2; box-sizing:border-box; min-height:24px; padding:3px 4px; font-size:10px; line-height:1.2; }
      .cal-week-chip-timed span { color:var(--ink-secondary); font-size:9px; }
      .cal-chip-class { background:#0b1f4d !important; color:#e8eefc; border-left-color:#1d4e89; }
      .cal-chip-work { background:color-mix(in srgb, #163a6b 70%, var(--bg-card)); border-left-color:#1e4e8c; }
      .cal-chip-passion { background:color-mix(in srgb, #8b1e2d 55%, var(--bg-card)); border-left-color:#c0392b; }
      .cal-paint-strip { display:grid; grid-template-columns:repeat(24, minmax(0,1fr)); gap:1px; min-height:14px; padding:2px 3px; border-bottom:1px solid var(--gridline); background:var(--bg-shell); }
      .cal-paint-cell { min-height:12px; border:0; background:transparent; cursor:pointer; padding:0; }
      .cal-paint-cell-filled { box-shadow:inset 0 0 0 1px rgba(255,255,255,.2); }
      .cal-now-marker { position:absolute; left:8px; right:4px; height:2px; background:#e11d48; z-index:6; pointer-events:none; }
      .cal-week-timeline[data-split="15"] { background:repeating-linear-gradient(to bottom, transparent 0, transparent 9px, var(--gridline) 10px); }
      .cal-week-timeline[data-split="20"] { background:repeating-linear-gradient(to bottom, transparent 0, transparent 12px, var(--gridline) 13px); }
      .cal-week-timeline[data-split="30"] { background:repeating-linear-gradient(to bottom, transparent 0, transparent 19px, var(--gridline) 20px); }
      .cal-hour-painted { box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }
      .cal-week-day .cal-inline-editor { position:absolute; z-index:8; top:76px; left:4px; width:min(360px, calc(100vw - 56px)); box-sizing:border-box; padding:8px; box-shadow:0 6px 20px rgba(0,0,0,0.22); }
      .cal-week-day:nth-child(n+5) .cal-inline-editor { left:auto; right:4px; }
      .cal-week-day .cal-inline-fields { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      .cal-week-day .cal-inline-fields input { width:100%; min-width:0; box-sizing:border-box; font-size:11px; padding:5px; }
      .cal-week-day .cal-inline-fields #cal-inline-title, .cal-week-day .cal-inline-fields #cal-inline-notes { grid-column:1 / -1; }
      .cal-list-panel { max-width:100%; min-width:0; overflow-x:auto; }
      .cal-list-panel table { width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; }
      .cal-list-panel th, .cal-list-panel td { padding:6px 8px; text-align:left; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cal-list-panel th { font-size:12px; color:var(--ink-secondary); }
      .cal-list-panel input { font-size:13px; padding:4px 6px; min-width:0; max-width:100%; box-sizing:border-box; }
      .cal-row-focus { background:color-mix(in srgb, var(--accent) 10%, transparent); }
      .cal-hours-panel { overflow-x:auto; }
      .cal-hours-head, .cal-hours-row { display:grid; grid-template-columns:36px 1fr; gap:6px; align-items:center; }
      .cal-hours-head { margin-bottom:4px; color:var(--ink-muted); font-size:9px; }
      .cal-hours-day { border:0; background:transparent; color:var(--ink-primary); font-variant-numeric:tabular-nums; cursor:pointer; }
      .cal-hours-today .cal-hours-day { color:var(--accent); font-weight:700; }
      .cal-hours-strip { display:grid; grid-template-columns:repeat(24, minmax(10px, 1fr)); gap:1px; min-width:480px; }
      .cal-hours-labels span { text-align:center; }
      .cal-hour-cell { height:14px; border:0; border-radius:2px; background:var(--bg-shell); cursor:pointer; }
      .cal-hour-busy { background:color-mix(in srgb, var(--accent) 55%, var(--bg-card)); }
    </style>
    <details class="card cal-fused-extras" open>
      <summary style="cursor:pointer;font-weight:600;font-size:13px;">Calendar events & sync</summary>
      <div style="margin-top:10px;">
        ${viewToggle}
        ${monthBlock}
        ${weekBlock}
        ${dayBlock}
        ${hoursBlock}
        ${listBlock}
        <div class="card cal-toolbar-wrap" style="margin-top:8px;">${renderCalendarToolbar(googleStatus)}</div>
        <p class="stub" style="margin-top:8px;">${googleStatus.connected
          ? 'Google connected — sync rows push to your calendar; pull imports upcoming events.'
          : 'Connect Google in Settings for sync. Import .ics anytime.'}</p>
      </div>
    </details>`;
}

async function renderCalendar() {
  PLN_SHELL_FOCUS = "strip";
  plnSyncCalState(CURRENT_DATE);
  PLN_CAL.viewYm = CALENDAR_MONTH_YM;
  const shell = await renderPlannerFusedShell();
  const extras = await renderCalendarExtrasPanel();
  return replacePlannerModeChipsWithSubnav(shell)
    .replace('<div id="pln-tab-extras"></div>', `<div id="pln-tab-extras">${extras}</div>`);
}

function wireCalendarSharedControls() {
  const addBtn = document.getElementById("add-cal-row");
  if (addBtn) {
    addBtn.onclick = async () => {
      await api("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New event", date: CURRENT_DATE, force: true }),
      });
      render();
    };
  }

  const icsInput = document.getElementById("ics-file-input");
  if (icsInput) {
    icsInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/calendar/import-ics", { method: "POST", body: formData });
      const result = await res.json();
      window.alert(result.error || `Imported ${result.imported} event(s).`);
      render();
    };
  }

  const pullBtn = document.getElementById("pull-from-google");
  if (pullBtn) {
    pullBtn.onclick = async () => {
      pullBtn.innerHTML = '<span class="spinner"></span>Pulling...';
      pullBtn.disabled = true;
      const result = await api("/api/calendar/pull-from-google", { method: "POST" });
      window.alert(result.error || `Imported ${result.imported} event(s).`);
      render();
    };
  }

  document.querySelectorAll(".cal-sync").forEach(btn => {
    btn.onclick = async () => {
      btn.innerHTML = '<span class="spinner"></span>';
      btn.disabled = true;
      const result = await api(`/api/calendar/${btn.dataset.event}/sync-to-google`, { method: "POST" });
      if (result.error) window.alert(result.error);
      render();
    };
  });

  document.querySelectorAll(".cal-date, .cal-start, .cal-end, .cal-title, .cal-notes").forEach(inp => {
    inp.onchange = () => {
      const id = inp.dataset.event;
      const field = inp.classList.contains("cal-date") ? "date"
        : inp.classList.contains("cal-start") ? "start_time"
        : inp.classList.contains("cal-end") ? "end_time"
        : inp.classList.contains("cal-title") ? "title" : "notes";
      api(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: inp.value }),
      });
    };
  });

  document.querySelectorAll(".cal-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this event?")) return;
      await api(`/api/calendar/${btn.dataset.event}`, { method: "DELETE" });
      render();
    };
  });
}

function wireCalendarMonthView() {
  document.querySelectorAll(".cal-view-btn").forEach(btn => {
    btn.onclick = () => {
      CALENDAR_VIEW = btn.dataset.view;
      localStorage.setItem("calendarView", CALENDAR_VIEW);
      render();
    };
  });

  document.querySelectorAll(".cal-month-nav").forEach(btn => {
    btn.onclick = () => {
      const d = calYmToDate(CALENDAR_MONTH_YM);
      d.setMonth(d.getMonth() + Number(btn.dataset.dir));
      CALENDAR_MONTH_YM = calFormatYm(d);
      localStorage.setItem("calendarMonth", CALENDAR_MONTH_YM);
      if (typeof PLN_CAL !== "undefined") PLN_CAL.viewYm = CALENDAR_MONTH_YM;
      render();
    };
  });

  const todayBtn = document.querySelector(".cal-month-today");
  if (todayBtn) todayBtn.onclick = () => {
    CALENDAR_MONTH_YM = localYmd().slice(0, 7);
    localStorage.setItem("calendarMonth", CALENDAR_MONTH_YM);
    render();
  };

  document.querySelectorAll(".cal-month-chip-cal, .cal-week-chip").forEach(chip => {
    chip.onclick = e => {
      e.stopPropagation();
      const event = CALENDAR_EVENTS.find(item => Number(item.id) === Number(chip.dataset.calId));
      calOpenInlineEditor(event, chip);
    };
  });
  document.querySelectorAll(".cal-month-chip-plan").forEach(chip => {
    chip.onclick = e => {
      e.stopPropagation();
      const event = CALENDAR_PLAN_EVENTS.find(item => Number(item.id) === Number(chip.dataset.planId));
      if (event && typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("eventsFocusId", String(event.id));
      }
      if (typeof goToTab === "function") goToTab("Events");
    };
  });

  document.querySelectorAll(".cal-month-goto, .cal-month-plan, .cal-week-goto").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (typeof plnSyncCalState === "function") plnSyncCalState(btn.dataset.day);
      if (typeof navigateToPlannerDay === "function") navigateToPlannerDay(btn.dataset.day);
    };
  });

  document.querySelectorAll(".cal-week-nav").forEach(btn => {
    btn.onclick = () => {
      CALENDAR_WEEK_START = calShiftDay(calResolvedWeekStart(), Number(btn.dataset.dir) * 7);
      localStorage.setItem("calendarWeekStart", CALENDAR_WEEK_START);
      if (typeof plnSyncCalState === "function") plnSyncCalState(CALENDAR_WEEK_START);
      render();
    };
  });
  document.querySelectorAll(".cal-day-nav").forEach(btn => {
    btn.onclick = async () => {
      const base = CURRENT_DATE || localYmd();
      const next = calShiftDay(base, Number(btn.dataset.dir));
      if (typeof tryNavigateTodayDate === "function") await tryNavigateTodayDate(next);
      else render();
    };
  });
  document.querySelectorAll(".cal-week-event, .tdy-week-chip, .cal-month-chip-cal").forEach(chip => {
    chip.addEventListener("click", async (e) => {
      if (typeof TDY_ARMED_CAT === "undefined" || !TDY_ARMED_CAT) return;
      e.preventDefault();
      e.stopPropagation();
      const id = chip.dataset.calId || chip.dataset.id;
      if (!id) return;
      if (!window.confirm("Cancel this event? Painting stays armed.")) return;
      await api(`/api/calendar/${id}`, { method: "DELETE" });
      render();
    }, true);
  });
  document.querySelectorAll(".cal-hour-cell").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.calId;
      if (id) {
        const event = CALENDAR_EVENTS.find(item => Number(item.id) === Number(id));
        if (typeof TDY_ARMED_CAT !== "undefined" && TDY_ARMED_CAT) {
          if (!window.confirm("Cancel this event? Painting stays armed.")) return;
          await api(`/api/calendar/${id}`, { method: "DELETE" });
          render();
          return;
        }
        calOpenInlineEditor(event, btn);
        return;
      }
      const hour = String(btn.dataset.hour).padStart(2, "0");
      const created = await api("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New event",
          date: btn.dataset.day,
          start_time: `${hour}:00`,
          end_time: `${String((Number(btn.dataset.hour) + 1) % 24).padStart(2, "0")}:00`,
          force: true,
        }),
      });
      CALENDAR_EVENTS.push(created);
      calOpenInlineEditor(created, btn);
    };
  });

  const thisWeekBtn = document.querySelector(".cal-week-today");
  if (thisWeekBtn) thisWeekBtn.onclick = async () => {
    const today = localYmd();
    CALENDAR_WEEK_START = calWeekStartFor(today);
    localStorage.setItem("calendarWeekStart", CALENDAR_WEEK_START);
    if (thisWeekBtn.dataset.calTodayDay === "1" && typeof tryNavigateTodayDate === "function") {
      await tryNavigateTodayDate(today);
      return;
    }
    render();
  };

  document.querySelectorAll(".cal-paint-cell").forEach(cell => {
    cell.onclick = event => {
      event.stopPropagation();
      if (typeof TDY_WEEK_SELECT !== "undefined" && (event.shiftKey || (typeof TDY_MODE !== "undefined" && TDY_MODE === "select"))) {
        const key = `${cell.dataset.weekDate}|${cell.dataset.weekHour}`;
        if (TDY_WEEK_SELECT.has(key)) TDY_WEEK_SELECT.delete(key);
        else TDY_WEEK_SELECT.add(key);
        cell.classList.toggle("tdy-week-paint-cell-selected", TDY_WEEK_SELECT.has(key));
        return;
      }
      if (typeof applyWeekPaintCell === "function") {
        if (typeof TDY_UNPAINT !== "undefined" && TDY_UNPAINT) applyWeekPaintCell(cell.dataset.weekDate, Number(cell.dataset.weekHour), "");
        else if (typeof TDY_ARMED_CAT !== "undefined" && TDY_ARMED_CAT) applyWeekPaintCell(cell.dataset.weekDate, Number(cell.dataset.weekHour), TDY_ARMED_CAT);
      }
    };
  });
  document.querySelector(".cal-week-panel, .cal-hours-panel, .cal-month-panel")?.addEventListener("contextmenu", e => {
    if (typeof tdyStopPaint === "function") {
      e.preventDefault();
      tdyStopPaint();
    }
  });

  document.querySelectorAll(".cal-month-add").forEach(btn => {
    btn.onclick = async () => {
      const created = await api("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New event", date: btn.dataset.day, force: true }),
      });
      CALENDAR_EVENTS.push(created);
      const chips = btn.closest(".cal-month-cell")?.querySelector(".cal-month-chips");
      if (!chips) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cal-month-chip cal-month-chip-cal";
      chip.dataset.calId = created.id;
      chip.title = created.title || "";
      chip.textContent = calTruncate(calEventTimePrefix(created) + (created.title || ""), 18);
      chip.onclick = e => {
        e.stopPropagation();
        calOpenInlineEditor(created, chip);
      };
      chips.appendChild(chip);
      calOpenInlineEditor(created, chip);
    };
  });

  document.querySelectorAll(".cal-week-add").forEach(btn => {
    btn.onclick = async () => {
      const created = await api("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New event", date: btn.dataset.day, force: true }),
      });
      CALENDAR_EVENTS.push(created);
      const allDay = btn.closest(".cal-week-day")?.querySelector(".cal-week-all-day");
      if (!allDay) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cal-week-chip cal-week-chip-all-day";
      chip.dataset.calId = created.id;
      chip.title = created.title || "";
      chip.textContent = created.title || "Untitled event";
      chip.onclick = e => {
        e.stopPropagation();
        calOpenInlineEditor(created, chip);
      };
      allDay.appendChild(chip);
      calOpenInlineEditor(created, chip);
    };
  });

  const inlineDate = document.getElementById("cal-inline-date");
  if (inlineDate) {
    const id = CALENDAR_FOCUS_ID;
    const patch = (field, value) => api(`/api/calendar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    inlineDate.onchange = () => patch("date", inlineDate.value);
    const inlineStart = document.getElementById("cal-inline-start");
    const inlineEnd = document.getElementById("cal-inline-end");
    const inlineTitle = document.getElementById("cal-inline-title");
    const inlineNotes = document.getElementById("cal-inline-notes");
    if (inlineStart) inlineStart.onchange = (e) => patch("start_time", e.target.value);
    if (inlineEnd) inlineEnd.onchange = (e) => patch("end_time", e.target.value);
    if (inlineTitle) inlineTitle.onchange = (e) => patch("title", e.target.value);
    if (inlineNotes) inlineNotes.onchange = (e) => patch("notes", e.target.value);

    const syncBtn = document.querySelector(".cal-inline-sync");
    if (syncBtn) {
      syncBtn.onclick = async () => {
        syncBtn.innerHTML = '<span class="spinner"></span>';
        syncBtn.disabled = true;
        const result = await api(`/api/calendar/${id}/sync-to-google`, { method: "POST" });
        if (result.error) window.alert(result.error);
        render();
      };
    }

    const inlineDelete = document.querySelector(".cal-inline-delete");
    if (inlineDelete) inlineDelete.onclick = async () => {
      if (!window.confirm("Delete this event?")) return;
      CALENDAR_FOCUS_ID = null;
      await api(`/api/calendar/${id}`, { method: "DELETE" });
      render();
    };

    const inlineClose = document.querySelector(".cal-inline-close");
    if (inlineClose) inlineClose.onclick = () => {
      CALENDAR_FOCUS_ID = null;
      render();
    };
  }
}

function wireCalendar() {
  wirePlannerShell();
  if (typeof wirePlannerStripStayOnTab === "function") wirePlannerStripStayOnTab();
  wireCalendarSharedControls();
  wireCalendarMonthView();

  if (CALENDAR_VIEW === "list" && CALENDAR_FOCUS_ID) {
    const row = document.getElementById(`cal-row-${CALENDAR_FOCUS_ID}`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
