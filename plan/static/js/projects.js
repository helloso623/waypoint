// --- Projects: overview grid + per-project detail page -----------------------------------------------

const PROJECT_NOTE_CATEGORIES = ["general", "daily", "milestone", "problem", "idea"];
const PRJ_TIMELINE_TYPES = ["created", "status", "progress", "milestone", "note", "task_done", "competition"];
const PRJ_TIMELINE_GLYPH = {
  created: "\u2726", status: "\u21C4", progress: "\u25B2", milestone: "\u2605",
  note: "\u270E", task_done: "\u2713", competition: "\uD83C\uDFC6",
};
const PRJ_NOTE_CAT_CLASS = {
  general: "prj-cat-general", daily: "prj-cat-daily", milestone: "prj-cat-milestone",
  problem: "prj-cat-problem", idea: "prj-cat-idea",
};
let OPEN_PROJECT_NOTES = new Set();
let PRJ_LAST_ACTIVITY = {};
let PRJ_CHRONICLE_CACHE = {};
let PRJ_CHRONICLE_ORDER = localStorage.getItem("prjChronicleOrder") === "newest" ? "newest" : "chronological";
let PRJ_CHRONICLE_TYPE_FILTER = null;
const PRJ_FEATURE_PREFS_PREFIX = "projectFeatureVisibility:";

function prjFeatureVisibility(projectId) {
  const defaults = { activity: true, progress: true };
  try {
    const saved = JSON.parse(localStorage.getItem(`${PRJ_FEATURE_PREFS_PREFIX}${projectId}`) || "{}");
    return {
      activity: typeof saved.activity === "boolean" ? saved.activity : defaults.activity,
      progress: typeof saved.progress === "boolean" ? saved.progress : defaults.progress,
    };
  } catch (_) {
    return defaults;
  }
}

function prjSetFeatureVisibility(projectId, feature, visible) {
  const prefs = prjFeatureVisibility(projectId);
  prefs[feature] = !!visible;
  try {
    localStorage.setItem(`${PRJ_FEATURE_PREFS_PREFIX}${projectId}`, JSON.stringify(prefs));
  } catch (_) {}
  return prefs;
}

let PROJECT_DETAIL_ID = (() => {
  const raw = localStorage.getItem("projectDetailId");
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : null;
})();

function setProjectDetailId(id) {
  PROJECT_DETAIL_ID = id ? Number(id) : null;
  if (PROJECT_DETAIL_ID) localStorage.setItem("projectDetailId", String(PROJECT_DETAIL_ID));
  else localStorage.removeItem("projectDetailId");
}

function goLinkDumpForProject(projectId, projectName) {
  const id = Number(projectId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    localStorage.setItem("dumpLinkProjectId", String(id));
    localStorage.setItem("dumpLinkProjectName", projectName || "");
    localStorage.setItem("nts_thinking_filter", "all");
    localStorage.setItem("nts_thinking_projectFilter", String(id));
  } catch (_) {}
  if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Thinking") {
    if (typeof render === "function") render();
    return;
  }
  if (typeof goToTab === "function") goToTab("Thinking");
}

const PROJECTS_STYLE_HTML = `<style>
  .prj-page-header { margin-bottom: 14px; }
  .prj-page-header .page-title::after {
    content: ""; display: block; width: 52px; height: 3px; margin-top: 8px;
    background: linear-gradient(90deg, var(--status-good), var(--accent), transparent); border-radius: 1px;
  }
  .prj-section-title {
    font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--ink-secondary); margin: 16px 0 10px; display: flex; align-items: center; gap: 8px;
  }
  .prj-section-title::before {
    content: ""; width: 3px; height: 14px; border-radius: 1px; background: var(--accent); flex-shrink: 0;
  }
  .prj-section-title--active::before { background: var(--status-good); }
  .prj-section-title--paused::before { background: var(--status-warning); }
  .prj-section-title--done::before { background: #c9a227; }
  .prj-empty {
    padding: 18px 14px; text-align: center; border-radius: 8px; font-size: 13px; color: var(--ink-secondary);
    border: 1px dashed color-mix(in srgb, var(--accent) 28%, var(--gridline));
    background: color-mix(in srgb, var(--accent) 4%, var(--bg-card));
  }
  .prj-empty--active {
    border-color: color-mix(in srgb, var(--status-good) 35%, var(--gridline));
    background: color-mix(in srgb, var(--status-good) 5%, var(--bg-card));
  }
  .prj-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
  .prj-tile {
    padding:10px 12px; border-left: 3px solid var(--prj-accent, var(--gridline));
    transition: border-color var(--t-quick) ease, box-shadow var(--t-quick) ease, transform var(--t-quick) ease;
  }
  .prj-tile:hover {
    border-color: color-mix(in srgb, var(--prj-accent, var(--accent)) 70%, var(--border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--prj-accent, var(--accent)) 12%, transparent);
  }
  .prj-tile--active { --prj-accent: var(--status-good); }
  .prj-tile--paused { --prj-accent: var(--status-warning); opacity: 0.92; }
  .prj-tile--done {
    --prj-accent: #c9a227;
    opacity: 0.88;
    background: color-mix(in srgb, #c9a227 3%, var(--bg-card));
  }
  .prj-group-paused { border-left: 3px solid var(--status-warning); }
  .prj-group-done { border-left: 3px solid #c9a227; }
  .prj-group-paused summary::-webkit-details-marker,
  .prj-group-done summary::-webkit-details-marker { display: none; }
  .prj-tile-top { display:flex; align-items:flex-start; gap:6px; }
  .prj-tile-name { font-weight:600; font-size:14px; line-height:1.3; color:var(--ink-primary); }
  .prj-tile-meta { display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-top:4px; }
  .prj-tile-footer { display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:11px; }
  .prj-avatars { display:flex; gap:2px; align-items:center; }
  .prj-avatar { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--border); font-size:9px; font-weight:700; color:#fff; }
  .prj-idea-link { font-size:14px; line-height:1; opacity:0.85; }
  .prj-progress-bar { height:4px; background:var(--gridline); border-radius:2px; margin-top:8px; overflow:hidden; }
  .prj-progress-fill { height:100%; background:var(--status-good); border-radius:2px; transition:width 0.15s; }
  .prj-tile--paused .prj-progress-fill { background: var(--status-warning); }
  .prj-tile--done .prj-progress-fill { background: #c9a227; }
  .prj-detail-back { margin-bottom:12px; }
  .prj-detail-header { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .prj-detail-section { margin-top:14px; padding-top:14px; border-top:1px solid var(--gridline); }
  .prj-detail-section-title {
    font-size:13px; font-weight:600; margin-bottom:8px; display:flex; align-items:center; gap:8px;
  }
  .prj-detail-section-title::before {
    content:""; width:3px; height:14px; border-radius:1px; background:var(--accent); flex-shrink:0;
  }
  .prj-archive-box {
    margin-top:12px; padding:12px 14px; border-radius:8px;
    border:1px solid color-mix(in srgb, #c9a227 40%, var(--gridline));
    background: linear-gradient(135deg, color-mix(in srgb, #c9a227 8%, var(--bg-card)), color-mix(in srgb, #c9a227 3%, var(--bg-card)));
    border-left: 4px solid #c9a227;
  }
  .prj-archive-box strong { color: color-mix(in srgb, #c9a227 80%, var(--ink-primary)); }
  .prj-grade-input {
    border-color: color-mix(in srgb, #c9a227 45%, var(--border)) !important;
    background: color-mix(in srgb, #c9a227 6%, var(--bg-shell)) !important;
  }
  .prj-task-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:6px 0; border-bottom:1px solid var(--gridline); font-size:13px; }
  .prj-comp-row { padding:6px 0; border-bottom:1px solid var(--gridline); font-size:13px; }
  .prj-progress-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:8px; }
  .prj-progress-row input[type="range"] { flex:1; min-width:120px; }
  .prj-feature-toggles { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-top:10px; }
  .prj-feature-toggles-label { margin-right:2px; font-size:11px; color:var(--ink-muted); }
  .prj-feature-toggle {
    appearance:none; display:inline-flex; align-items:center; gap:5px; padding:3px 9px;
    border:1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
    border-radius:999px; background:var(--bg-shell); color:var(--ink-secondary);
    font-size:10px; font-weight:600; letter-spacing:0.04em; cursor:pointer;
  }
  .prj-feature-toggle:hover { border-color:color-mix(in srgb, var(--accent) 48%, var(--border)); color:var(--ink-primary); }
  .prj-feature-toggle.active {
    border-color:color-mix(in srgb, var(--status-good) 55%, var(--border));
    background:color-mix(in srgb, var(--status-good) 9%, var(--bg-shell)); color:var(--status-good);
  }
  .prj-feature-toggle-dot { width:6px; height:6px; border-radius:50%; background:currentColor; opacity:0.45; }
  .prj-feature-toggle.active .prj-feature-toggle-dot { opacity:1; }
  .prj-tile-activity { font-size:10px; margin-top:4px; color:var(--ink-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .prj-chronicle-toolbar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:8px; }
  .prj-chronicle-filters { display:flex; flex-wrap:wrap; gap:4px; }
  .prj-chronicle-filter { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--gridline); background:transparent; cursor:pointer; color:var(--ink-secondary); }
  .prj-chronicle-filter.active { background:var(--border); color:var(--ink-primary); font-weight:600; }
  .prj-chronicle-list { display:flex; flex-direction:column; gap:0; border-left:2px solid var(--gridline); margin-left:8px; padding-left:10px; }
  .prj-chronicle-row { display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:12px; line-height:1.35; }
  .prj-chronicle-glyph { flex-shrink:0; width:18px; text-align:center; opacity:0.9; }
  .prj-chronicle-when { flex-shrink:0; font-variant-numeric:tabular-nums; color:var(--ink-muted); min-width:72px; font-size:11px; }
  .prj-chronicle-body { flex:1; min-width:0; }
  .prj-chronicle-title { font-weight:500; color:var(--ink-primary); }
  .prj-chronicle-detail { color:var(--ink-secondary); font-size:11px; margin-top:1px; }
  .prj-notes-pinned { margin-bottom:8px; padding:8px; border-radius:6px; background:linear-gradient(135deg, rgba(201,162,39,0.08), rgba(201,162,39,0.02)); border:1px solid rgba(201,162,39,0.25); }
  .prj-notes-pinned-label { font-size:11px; font-weight:600; color:var(--ink-secondary); margin-bottom:4px; }
  .prj-note-row { padding:6px 0; border-bottom:1px solid var(--gridline); }
  .prj-note-row.prj-note-milestone { border-left:3px solid rgba(201,162,39,0.55); padding-left:8px; margin-left:-2px; }
  .prj-note-head { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .prj-note-actions { display:flex; gap:4px; align-items:center; }
  .prj-note-pin { border:none; background:none; cursor:pointer; font-size:14px; line-height:1; padding:0 2px; color:var(--ink-muted); }
  .prj-note-pin.prj-note-pin--on { color:#c9a227; }
  .prj-note-body { margin-top:4px; font-size:13px; }
  .prj-note-body.prj-note-editing { outline:1px dashed var(--border); padding:4px; border-radius:4px; min-height:32px; }
  .prj-activity-meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px; min-width:0; }
  .prj-activity-time { color:var(--ink-muted); font-size:11px; font-variant-numeric:tabular-nums; }
  .prj-cat-general { background:var(--gridline); }
  .prj-cat-daily { background:rgba(80,140,220,0.2); }
  .prj-cat-milestone { background:rgba(201,162,39,0.22); }
  .prj-cat-problem { background:rgba(220,80,80,0.18); }
  .prj-cat-idea { background:rgba(140,90,220,0.18); }
  .prj-deadlines-card { border-left: 3px solid var(--status-serious); }
  .prj-deadline-overdue { color: var(--status-critical); font-weight: 600; }
</style>`;

function prjTeamAvatarHtml(name) {
  if (typeof teamAvatarHtml === "function") return teamAvatarHtml(name, { size: 22, dot: false });
  const initials = typeof teamInitials === "function" ? teamInitials(name) : String(name || "?").slice(0, 2).toUpperCase();
  const color = typeof teamHashColor === "function" ? teamHashColor(name) : "var(--border)";
  return `<span class="team-avatar prj-avatar" style="width:22px;height:22px;background:${color};" title="${escapeHtml(name)}"><span class="team-avatar-initials">${escapeHtml(initials)}</span></span>`;
}

function prjDueCountMap(deadlines) {
  const map = {};
  (deadlines || []).forEach(d => {
    if (d.project_id && d.status !== "done") {
      map[d.project_id] = (map[d.project_id] || 0) + 1;
    }
  });
  return map;
}

function prjTimelineGlyph(type) {
  if (type && String(type).startsWith("note:")) return PRJ_TIMELINE_GLYPH.note;
  return PRJ_TIMELINE_GLYPH[type] || "\u2022";
}

function prjNoteCatClass(category) {
  return PRJ_NOTE_CAT_CLASS[category] || "prj-cat-general";
}

function prjFormatWhen(when) {
  if (!when) return "";
  return String(when).slice(0, 10);
}

function prjFormatActivityTimestamp(when) {
  if (!when) return "";
  const parsed = new Date(when);
  if (Number.isNaN(parsed.getTime())) return String(when).replace("T", " ").slice(0, 16);
  return parsed.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function prjUpdateLastActivity(projectId, entries) {
  if (!entries || !entries.length) return;
  const sorted = [...entries].sort((a, b) => String(b.when || "").localeCompare(String(a.when || "")));
  const title = (sorted[0].title || "").trim();
  if (title) PRJ_LAST_ACTIVITY[projectId] = title;
}

async function fetchProjectTimeline(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}/timeline`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function patchProjectNote(noteId, payload) {
  try {
    const res = await fetch(`/api/project-notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function prjTileActivityLine(p) {
  const last = PRJ_LAST_ACTIVITY[p.id];
  if (last) return `<div class="prj-tile-activity" title="Last activity">${escapeHtml(last)}</div>`;
  const count = Number(p.note_count);
  if (Number.isFinite(count) && count > 0) {
    return `<div class="prj-tile-activity">${escapeHtml(String(count))} note${count === 1 ? "" : "s"}</div>`;
  }
  return "";
}

function projectStatusTileClass(status) {
  if (status === "paused") return "prj-tile--paused";
  if (status === "done") return "prj-tile--done";
  return "prj-tile--active";
}

function projectStatusPillClass(status) {
  if (status === "active") return "status-good";
  if (status === "paused") return "status-warning";
  if (status === "done") return "";
  return "";
}

function projectTileHtml(p, team, ideas, dueCount) {
  team = team || [];
  ideas = ideas || [];
  const sourceIdea = ideas.find(i => i.id === p.source_idea_id);
  const assignedIds = p.team_member_ids || [];
  const avatars = assignedIds.map(id => {
    const m = team.find(t => t.id === id);
    return m ? prjTeamAvatarHtml(m.name) : "";
  }).join("");
  const progress = Math.min(100, Math.max(0, Number(p.progress) || 0));
  const featureVisibility = prjFeatureVisibility(p.id);
  const tileCls = projectStatusTileClass(p.status);
  const statusPillCls = projectStatusPillClass(p.status);
  const donePill = p.status === "done"
    ? `<span class="pill" style="color:#c9a227;border-color:color-mix(in srgb,#c9a227 55%,var(--border));background:color-mix(in srgb,#c9a227 10%,var(--bg-shell));">${escapeHtml(p.status)}</span>`
    : `<span class="pill ${statusPillCls}">${escapeHtml(p.status)}</span>`;
  return `
    <div class="card project-card-wrap prj-tile ${tileCls}" data-project-card="${p.id}" data-id="${p.id}" draggable="false">
      <div class="prj-tile-top">
        <span class="drag-handle" draggable="true" title="Drag to reorder">&#10247;</span>
        <button type="button" class="prj-tile-open" data-project="${p.id}" style="flex:1; text-align:left; border:none; background:none; cursor:pointer; padding:0; min-width:0;">
          <div class="prj-tile-name">${escapeHtml(p.name || "Untitled")}</div>
          <div class="prj-tile-meta">
            ${p.kind ? `<span class="pill">${escapeHtml(p.kind)}</span>` : ""}
            ${donePill}
            ${p.grade && p.status === "done" ? `<span class="pill" style="color:#c9a227;border-color:color-mix(in srgb,#c9a227 50%,var(--border));background:color-mix(in srgb,#c9a227 8%,var(--bg-shell));font-weight:600;">${escapeHtml(p.grade)}</span>` : ""}
            ${sourceIdea ? `<span class="prj-idea-link" title="Linked idea: ${escapeHtml(sourceIdea.title)}">&#128161;</span>` : ""}
            ${dueCount ? `<span class="pill status-serious" title="Tasks with due dates">${dueCount} due</span>` : ""}
          </div>
          ${featureVisibility.progress ? `<div class="prj-progress-bar"><div class="prj-progress-fill" style="width:${progress}%"></div></div>` : ""}
          ${featureVisibility.activity ? prjTileActivityLine(p) : ""}
          <div class="prj-tile-footer">
            <span class="prj-avatars">${avatars || '<span class="stub">—</span>'}</span>
            ${featureVisibility.progress ? `<span class="stub">${progress}%</span>` : ""}
          </div>
        </button>
        <button type="button" class="secondary project-link-dump" data-project="${p.id}" data-name="${escapeHtml(p.name || "").replace(/"/g, "&quot;")}" title="Link dump entries to this project">Link dump</button>
        ${p.status !== "active" ? `<button class="secondary project-reactivate" data-project="${p.id}" type="button" title="Reactivate">&#8635;</button>` : ""}
      </div>
    </div>`;
}

function projectTaskRowHtml(t) {
  const urgClass = (typeof URGENCY_CLASS !== "undefined" ? URGENCY_CLASS : {})[t.urgency] || "";
  const doneClass = t.status === "done" ? "done" : "";
  const dueBadge = t.due_date ? `<span class="pill">due ${escapeHtml(t.due_date)}</span>` : "";
  return `
    <div class="prj-task-row ${doneClass}">
      <span class="pill ${urgClass} ${t.urgency === "critical" && t.status !== "done" ? "pill-loud" : ""}">${escapeHtml(t.urgency)}</span>
      ${dueBadge}
      <span class="pill">${escapeHtml(t.status)}</span>
      <span style="flex:1; min-width:120px;">
        <span>${escapeHtml(t.title)}</span>
        ${t.description ? `<span class="stub" style="display:block; white-space:pre-wrap;">${escapeHtml(t.description)}</span>` : ""}
      </span>
      ${t.status !== "done" ? `<button type="button" class="secondary prj-task-complete" data-task="${t.id}">Complete</button>` : ""}
      <button type="button" class="secondary prj-task-open" data-task="${t.id}">Edit in Tasks</button>
    </div>`;
}

function projectDetailHtml(p, team, ideas, tasks, competitions) {
  team = team || [];
  ideas = ideas || [];
  tasks = (tasks || []).filter(t => String(t.project_id) === String(p.id));
  competitions = (competitions || []).filter(c => c.project_id === p.id);
  const sourceIdea = ideas.find(i => i.id === p.source_idea_id);
  const ideaOptionsHtml = ideas.map(i => `<option value="${i.id}" ${i.id === p.source_idea_id ? "selected" : ""}>${escapeHtml((i.title || "").slice(0, 40))}</option>`).join("");
  const assignedIds = p.team_member_ids || [];
  const assignedPills = assignedIds.map(id => team.find(m => m.id === id)).filter(Boolean).map(m => `
    <span class="pill">${escapeHtml(m.name)} <button class="project-member-remove" data-project="${p.id}" data-member="${m.id}" title="Unassign from project" style="border:none; background:none; color:inherit; cursor:pointer; padding:0 0 0 4px; font-size:11px;">x</button></span>
  `).join(" ");
  const availableMembers = team.filter(m => !assignedIds.includes(m.id));
  const progress = Math.min(100, Math.max(0, Number(p.progress) || 0));
  const featureVisibility = prjFeatureVisibility(p.id);
  const compRows = competitions.map(c => `
    <div class="prj-comp-row">
      <strong>${escapeHtml(c.title)}</strong>
      ${c.type ? `<span class="pill">${escapeHtml(c.type)}</span>` : ""}
      <span class="pill">${escapeHtml(c.status || "found")}</span>
      ${c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="stub" style="margin-left:6px;">link</a>` : ""}
    </div>`).join("");
  const taskRows = tasks.map(t => projectTaskRowHtml(t)).join("");

  return `
    <button type="button" class="secondary prj-detail-back" id="prj-back-overview">&larr; all projects</button>
    <div class="card">
      <div class="prj-detail-header">
        <input type="text" class="project-name" data-project="${p.id}" value="${escapeHtml(p.name || "").replace(/"/g, "&quot;")}" style="font-weight:600; flex:1; min-width:180px; font-size:16px;">
        <select class="project-status" data-project="${p.id}">
          <option value="active" ${p.status === "active" ? "selected" : ""}>active</option>
          <option value="paused" ${p.status === "paused" ? "selected" : ""}>paused</option>
          <option value="done" ${p.status === "done" ? "selected" : ""}>done</option>
        </select>
        <input type="text" class="project-kind" data-project="${p.id}" list="project-kind-options" value="${escapeHtml(p.kind || "").replace(/"/g, "&quot;")}" placeholder="category" style="width:160px;">
        <button class="secondary project-delete" data-project="${p.id}" title="Removes from Planner only">Remove project</button>
      </div>
      <div class="prj-feature-toggles" role="group" aria-label="Visible project features">
        <span class="prj-feature-toggles-label">Show</span>
        <button type="button" class="prj-feature-toggle ${featureVisibility.activity ? "active" : ""}" data-project="${p.id}" data-feature="activity" aria-pressed="${featureVisibility.activity}">
          <span class="prj-feature-toggle-dot" aria-hidden="true"></span>Activity log
        </button>
        <button type="button" class="prj-feature-toggle ${featureVisibility.progress ? "active" : ""}" data-project="${p.id}" data-feature="progress" aria-pressed="${featureVisibility.progress}">
          <span class="prj-feature-toggle-dot" aria-hidden="true"></span>Progress
        </button>
      </div>
      <div data-prj-feature-panel="progress" ${featureVisibility.progress ? "" : "hidden"}>
        <div class="prj-progress-row">
          <span style="font-size:13px;">Progress</span>
          <input type="range" min="0" max="100" class="project-progress-slider" data-project="${p.id}" value="${progress}" aria-label="Project completion percentage">
          <span class="project-progress-label" data-project="${p.id}" style="font-size:13px; min-width:36px;">${progress}%</span>
        </div>
        <div class="prj-progress-bar" style="margin-top:4px;"><div class="prj-progress-fill project-progress-bar-fill" data-project="${p.id}" style="width:${progress}%"></div></div>
      </div>
      ${p.status === "done" ? `
        <div class="prj-archive-box">
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <strong>Completed archive</strong>
            <input type="date" class="project-completed-at" data-project="${p.id}" value="${escapeHtml((p.completed_at || "").slice(0, 10))}" title="Completion date">
            <input type="text" class="project-grade prj-grade-input" data-project="${p.id}" value="${escapeHtml(p.grade || "").replace(/"/g, "&quot;")}" placeholder="Grade (e.g. A, 18/20)" style="width:170px;">
          </div>
          <div data-rich-for="project-archive-${p.id}" style="margin-top:8px;">${RICH_TOOLBAR_HTML}</div>
          <div id="project-archive-${p.id}" class="rich-editable project-archive-notes" data-project="${p.id}" contenteditable="true">${p.archive_notes || ""}</div>
          ${fieldHistoryWidgetHtml("project", p.id, "archive_notes")}
        </div>` : ""}

      <div class="prj-detail-section">
        <div class="prj-detail-section-title">Description</div>
        <div data-rich-for="project-desc-${p.id}">${RICH_TOOLBAR_HTML}</div>
        <div id="project-desc-${p.id}" class="rich-editable project-desc-edit" data-project="${p.id}" contenteditable="true">${p.description || ""}</div>
        ${fieldHistoryWidgetHtml("project", p.id, "description")}
        <button class="secondary project-describe-readme" data-project="${p.id}" style="margin-top:8px;">Describe from README</button>
      </div>

      <div class="prj-detail-section">
        <div class="prj-detail-section-title">Linked context</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:13px;">
          ${sourceIdea ? `<span class="pill">from idea: ${escapeHtml(sourceIdea.title)}</span>` : ""}
          <select class="project-link-idea" data-project="${p.id}">
            <option value="">${sourceIdea ? "Unlink idea" : "Link to idea..."}</option>
            ${ideaOptionsHtml}
          </select>
          <button type="button" class="secondary project-link-dump" data-project="${p.id}" data-name="${escapeHtml(p.name || "").replace(/"/g, "&quot;")}">Link dump &rarr;</button>
        </div>
        ${competitions.length ? `
          <div style="margin-top:10px;">
            <strong style="font-size:12px;">Linked competitions</strong>
            ${compRows}
          </div>` : '<p class="prj-empty" style="margin-top:8px;">No competitions linked to this project.</p>'}
        <div style="margin-top:10px;">
          <strong style="font-size:12px;">Team</strong>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px;">
            ${assignedPills || '<span class="stub">No team members assigned.</span>'}
          </div>
          <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <select class="project-add-member" data-project="${p.id}">
              <option value="">+ assign team member...</option>
              ${availableMembers.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}
            </select>
            <button class="secondary project-manage-team" data-project="${p.id}">Manage team &rarr;</button>
          </div>
        </div>
      </div>

      <div class="prj-detail-section">
        <div class="prj-detail-section-title">Tasks for this project</div>
        <div style="display:flex; gap:6px; margin-bottom:8px;">
          <input type="text" id="prj-quick-task-title" data-project="${p.id}" placeholder="Add a task to this project" style="flex:1;">
          <input type="date" id="prj-quick-task-due" value="${typeof taskSuggestedDeadline === "function" ? taskSuggestedDeadline("medium") : ""}" title="Suggested from medium urgency">
          <button type="button" class="secondary" id="prj-quick-task-push">Push +7d</button>
          <button type="button" class="secondary" id="prj-quick-task-dismiss">No deadline</button>
          <button type="button" class="primary" id="prj-quick-task-add" data-project="${p.id}">Add task</button>
        </div>
        ${tasks.length ? taskRows : '<p class="prj-empty">No tasks linked to this project.</p>'}
        <button type="button" class="secondary" id="prj-go-tasks" style="margin-top:8px;">Manage in Tasks &rarr;</button>
      </div>

      <div class="prj-detail-section">
        <div class="prj-detail-section-title">Repository</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <input type="text" class="project-path" data-project="${p.id}" placeholder="Folder path" value="${escapeHtml(p.path || "").replace(/"/g, "&quot;")}" style="flex:1; min-width:180px;">
          <input type="text" class="project-run-command" data-project="${p.id}" placeholder="run command (default: python app.py)" value="${escapeHtml(p.run_command || "").replace(/"/g, "&quot;")}" style="flex:1; min-width:180px;">
        </div>
        <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          <button class="secondary project-open-folder" data-project="${p.id}">Open folder</button>
          <button class="primary project-run" data-project="${p.id}">Run</button>
          <button class="secondary project-scan-code" data-project="${p.id}">Scan code</button>
        </div>
        ${p.code_summary ? `<div class="stub" style="margin-top:8px; border-top:1px solid var(--gridline); padding-top:8px;">${p.code_summary}</div>` : ""}
      </div>

      <div class="prj-detail-section">
        <div class="prj-detail-section-title">Chronicle</div>
        <div class="prj-chronicle-toolbar">
          <button type="button" class="secondary prj-chronicle-order" data-project="${p.id}" style="font-size:11px; padding:2px 8px;">
            ${PRJ_CHRONICLE_ORDER === "newest" ? "newest first" : "chronological"}
          </button>
          <div class="prj-chronicle-filters" id="prj-chronicle-filters-${p.id}"></div>
          <button type="button" class="secondary prj-chronicle-export" data-project="${p.id}" style="font-size:11px; padding:2px 8px; margin-left:auto;">Download chronicle (.md)</button>
        </div>
        <div id="project-chronicle-${p.id}"><p class="stub">Loading chronicle...</p></div>
      </div>

      <div class="prj-detail-section" data-prj-feature-panel="activity" ${featureVisibility.activity ? "" : "hidden"}>
        <div class="prj-detail-section-title">Activity log</div>
        <div id="project-notes-${p.id}"></div>
      </div>
    </div>`;
}

function renderOverviewShell(distinctKinds, deadlineRows, deadlines) {
  const presetKinds = ["software", "hardware", "theater", "writing", "research", "other"];
  const kindOptionsHtml = Array.from(new Set([...distinctKinds, ...presetKinds]))
    .map(k => `<option value="${escapeHtml(k)}"></option>`).join("");
  return `
    <div class="prj-page-header">
      <p class="page-title">Projects</p>
      <p class="page-subtitle">Track what you're building — open a project for full detail, or drag tiles to reorder.</p>
    </div>
    <datalist id="project-kind-options">${kindOptionsHtml}</datalist>
    <div class="card" style="border-left:3px solid var(--status-good);">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="text" id="new-project-name" placeholder="Project name">
        <input type="text" id="new-project-kind" list="project-kind-options" placeholder="category">
        <input type="text" id="new-project-desc" placeholder="Description" style="flex:1;">
        <button class="primary" id="add-project">Add project</button>
      </div>
      <div id="similar-box" class="stub"></div>
    </div>
    ${deadlines.length ? `<div class="card prj-deadlines-card">
      <strong style="font-size:13px; color:var(--status-serious);">Approaching deadlines</strong>
      <div style="margin-top:6px;">${deadlineRows}</div>
    </div>` : ""}`;
}

function renderProjectGroups(active, paused, done, team, ideas, dueCountMap) {
  return `
    <div class="prj-section-title prj-section-title--active">Active (${active.length})</div>
    <div class="project-group prj-grid" data-group="active">
      ${active.map(p => projectTileHtml(p, team, ideas, dueCountMap[p.id] || 0)).join("") || '<p class="prj-empty prj-empty--active">No active projects — start something above.</p>'}
    </div>
    ${paused.length ? `<details class="card prj-group-paused">
      <summary class="prj-section-title prj-section-title--paused" style="margin:0; cursor:pointer; list-style:none;">Paused (${paused.length})</summary>
      <div class="project-group prj-grid" data-group="paused" style="margin-top:10px;">${paused.map(p => projectTileHtml(p, team, ideas, dueCountMap[p.id] || 0)).join("")}</div>
    </details>` : ""}
    ${done.length ? `<details class="card prj-group-done" open>
      <summary class="prj-section-title prj-section-title--done" style="margin:0; cursor:pointer; list-style:none;">Completed archive (${done.length})</summary>
      <div class="project-group prj-grid" data-group="done" style="margin-top:10px;">${done.map(p => projectTileHtml(p, team, ideas, dueCountMap[p.id] || 0)).join("")}</div>
    </details>` : ""}`;
}

function projectNoteRowHtml(n, projectId) {
  const isPinned = !!Number(n.pinned);
  const isMilestone = n.category === "milestone";
  const catClass = prjNoteCatClass(n.category);
  return `
    <div class="prj-note-row ${isMilestone ? "prj-note-milestone" : ""}" data-note="${n.id}" data-project="${projectId}">
      <div class="prj-note-head">
        <span class="prj-activity-meta">
          <span class="prj-activity-time" title="${escapeHtml(n.created_at || "")}">${escapeHtml(prjFormatActivityTimestamp(n.created_at))}</span>
          <span class="pill ${catClass}">${escapeHtml(n.category || "general")}</span>
        </span>
        <span class="prj-note-actions">
          <button type="button" class="prj-note-pin ${isPinned ? "prj-note-pin--on" : ""}" data-note="${n.id}" data-project="${projectId}" title="${isPinned ? "Unpin" : "Pin"}">${isPinned ? "\u2605" : "\u2606"}</button>
          <button type="button" class="secondary prj-note-edit" data-note="${n.id}" style="padding:1px 6px; font-size:11px;">edit</button>
          <button class="secondary project-note-delete" data-note="${n.id}" data-project="${projectId}" style="padding:1px 6px; font-size:11px;">x</button>
        </span>
      </div>
      <div class="prj-note-body" data-note="${n.id}">${n.body || ""}</div>
    </div>`;
}

function wireProjectNoteRows(projectId) {
  document.querySelectorAll(`.prj-note-pin[data-project="${projectId}"]`).forEach(btn => {
    btn.onclick = async () => {
      const noteId = btn.dataset.note;
      const row = btn.closest(".prj-note-row");
      const pinned = !btn.classList.contains("prj-note-pin--on");
      const result = await patchProjectNote(noteId, { pinned: pinned ? 1 : 0 });
      if (result === null) {
        window.alert("Could not update pin — note editing may not be available yet.");
        return;
      }
      loadProjectNotes(projectId);
    };
  });

  document.querySelectorAll(`.prj-note-edit[data-note]`).forEach(btn => {
    btn.onclick = () => {
      const body = document.querySelector(`.prj-note-body[data-note="${btn.dataset.note}"]`);
      if (!body || body.classList.contains("prj-note-editing")) return;
      body.classList.add("prj-note-editing");
      body.contentEditable = "true";
      body.focus();
      const onBlur = async () => {
        body.contentEditable = "false";
        body.classList.remove("prj-note-editing");
        body.removeEventListener("blur", onBlur);
        const html = body.innerHTML.trim();
        const result = await patchProjectNote(btn.dataset.note, { body: html });
        if (result === null) window.alert("Could not save note — editing may not be available yet.");
      };
      body.addEventListener("blur", onBlur);
    };
  });
}

async function loadProjectNotes(projectId) {
  const box = document.getElementById(`project-notes-${projectId}`);
  if (!box) return;
  const notes = await api(`/api/projects/${projectId}/notes`);
  const catOptions = PROJECT_NOTE_CATEGORIES.map(c => `<option value="${c}">${escapeHtml(c)}</option>`).join("");
  const pinned = notes.filter(n => n.pinned);
  const rest = notes.filter(n => !n.pinned);
  const pinnedHtml = pinned.length ? `
    <div class="prj-notes-pinned">
      <div class="prj-notes-pinned-label">\u2605 Pinned</div>
      ${pinned.map(n => projectNoteRowHtml(n, projectId)).join("")}
    </div>` : "";
  const noteItems = rest.map(n => projectNoteRowHtml(n, projectId)).join("");
  box.innerHTML = `
    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
      <select id="new-note-cat-${projectId}" aria-label="Activity type">${catOptions}</select>
      <span class="stub" style="font-size:11px;">Add a timestamped update</span>
    </div>
    <div data-rich-for="new-note-body-${projectId}" style="margin-top:4px;">${RICH_TOOLBAR_HTML}</div>
    <div id="new-note-body-${projectId}" class="rich-editable" contenteditable="true" data-placeholder="What did you do on this project?"></div>
    <button class="secondary project-note-add" data-project="${projectId}" style="margin-top:6px;">Log activity</button>
    <div style="margin-top:8px;">${pinnedHtml}${noteItems || (!pinned.length ? '<p class="prj-empty">No activity yet — log what happened.</p>' : "")}</div>`;
  wireRichToolbar(`new-note-body-${projectId}`);

  box.querySelector(".project-note-add").onclick = async () => {
    const body = document.getElementById(`new-note-body-${projectId}`).innerHTML.trim();
    if (!body) return;
    const category = document.getElementById(`new-note-cat-${projectId}`).value;
    await api(`/api/projects/${projectId}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, body }),
    });
    loadProjectNotes(projectId);
    loadProjectChronicle(projectId);
  };
  box.querySelectorAll(".project-note-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this note?")) return;
      await api(`/api/project-notes/${btn.dataset.note}`, { method: "DELETE" });
      loadProjectNotes(projectId);
      loadProjectChronicle(projectId);
    };
  });
  wireProjectNoteRows(projectId);
}

function prjChronicleFilterChipsHtml(projectId, entries) {
  const types = Array.from(new Set((entries || []).map(e => e.type).filter(Boolean)));
  if (!types.length) return "";
  const allActive = !PRJ_CHRONICLE_TYPE_FILTER;
  return `<button type="button" class="prj-chronicle-filter ${allActive ? "active" : ""}" data-project="${projectId}" data-type="">all</button>`
    + types.map(t => `
      <button type="button" class="prj-chronicle-filter ${PRJ_CHRONICLE_TYPE_FILTER === t ? "active" : ""}" data-project="${projectId}" data-type="${escapeHtml(t)}">${escapeHtml(t)} ${prjTimelineGlyph(t)}</button>
    `).join("");
}

function prjChronicleRowsHtml(entries) {
  let list = [...(entries || [])];
  if (PRJ_CHRONICLE_TYPE_FILTER) list = list.filter(e => e.type === PRJ_CHRONICLE_TYPE_FILTER);
  list.sort((a, b) => {
    const cmp = String(a.when || "").localeCompare(String(b.when || ""));
    return PRJ_CHRONICLE_ORDER === "newest" ? -cmp : cmp;
  });
  if (!list.length) return '<p class="prj-empty">The chronicle begins when the work does.</p>';
  return `<div class="prj-chronicle-list">${list.map(e => `
    <div class="prj-chronicle-row" data-type="${escapeHtml(e.type || "")}">
      <span class="prj-chronicle-glyph" title="${escapeHtml(e.type || "")}">${prjTimelineGlyph(e.type)}</span>
      <span class="prj-chronicle-when">${escapeHtml(prjFormatWhen(e.when))}</span>
      <div class="prj-chronicle-body">
        <div class="prj-chronicle-title">${escapeHtml(e.title || "")}</div>
        ${e.detail ? `<div class="prj-chronicle-detail">${escapeHtml(e.detail)}</div>` : ""}
      </div>
    </div>`).join("")}</div>`;
}

function renderProjectChronicleDom(projectId, entries) {
  const box = document.getElementById(`project-chronicle-${projectId}`);
  const filters = document.getElementById(`prj-chronicle-filters-${projectId}`);
  if (filters) filters.innerHTML = prjChronicleFilterChipsHtml(projectId, entries);
  if (box) box.innerHTML = prjChronicleRowsHtml(entries);
}

async function loadProjectChronicle(projectId) {
  const box = document.getElementById(`project-chronicle-${projectId}`);
  if (!box) return;
  const entries = await fetchProjectTimeline(projectId);
  PRJ_CHRONICLE_CACHE[projectId] = entries;
  prjUpdateLastActivity(projectId, entries);
  renderProjectChronicleDom(projectId, entries);
}

function wireProjectChronicle(projectId) {
  const orderBtn = document.querySelector(`.prj-chronicle-order[data-project="${projectId}"]`);
  if (orderBtn) {
    orderBtn.onclick = () => {
      PRJ_CHRONICLE_ORDER = PRJ_CHRONICLE_ORDER === "newest" ? "chronological" : "newest";
      localStorage.setItem("prjChronicleOrder", PRJ_CHRONICLE_ORDER);
      orderBtn.textContent = PRJ_CHRONICLE_ORDER === "newest" ? "newest first" : "chronological";
      renderProjectChronicleDom(projectId, PRJ_CHRONICLE_CACHE[projectId] || []);
    };
  }

  const filters = document.getElementById(`prj-chronicle-filters-${projectId}`);
  if (filters) {
    filters.onclick = e => {
      const chip = e.target.closest(".prj-chronicle-filter");
      if (!chip) return;
      const type = chip.dataset.type || null;
      PRJ_CHRONICLE_TYPE_FILTER = type || null;
      renderProjectChronicleDom(projectId, PRJ_CHRONICLE_CACHE[projectId] || []);
    };
  }

  const exportBtn = document.querySelector(`.prj-chronicle-export[data-project="${projectId}"]`);
  if (exportBtn) {
    exportBtn.onclick = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/chronicle.md`);
        if (!res.ok) {
          window.alert("Chronicle export is not available yet.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const nameInput = document.querySelector(`.project-name[data-project="${projectId}"]`);
        const slug = (nameInput && nameInput.value ? nameInput.value : "project").replace(/[^\w.-]+/g, "-").slice(0, 40);
        a.download = `${slug}-chronicle.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        window.alert(errorMessage(err));
      }
    };
  }
}

async function renderProjects() {
  const [projects, deadlines, team, ideas, tasks, competitions] = await Promise.all([
    api("/api/projects"),
    api("/api/projects/deadlines"),
    api("/api/team"),
    api("/api/ideas"),
    api("/api/tasks"),
    api("/api/competitions"),
  ]);
  const today = localYmd();
  const dueCountMap = prjDueCountMap(deadlines);

  const deadlineRows = deadlines.slice(0, 20).map(d => {
    const overdue = d.due_date < today && d.status !== "done";
    return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--gridline); font-size:13px;">
      <span>${escapeHtml(d.title)}${d.project_name ? ` <span class="stub">(${escapeHtml(d.project_name)})</span>` : ""}</span>
      <span class="${overdue ? "prj-deadline-overdue" : ""}">${escapeHtml(d.due_date)}</span>
    </div>`;
  }).join("");

  const distinctKinds = Array.from(new Set(projects.map(p => p.kind).filter(Boolean)));

  if (PROJECT_DETAIL_ID) {
    const p = projects.find(x => x.id === PROJECT_DETAIL_ID);
    if (!p) {
      setProjectDetailId(null);
    } else {
      OPEN_PROJECT_NOTES.add(p.id);
      const presetKinds = ["software", "hardware", "theater", "writing", "research", "other"];
      const kindOptionsHtml = Array.from(new Set([...distinctKinds, ...presetKinds]))
        .map(k => `<option value="${escapeHtml(k)}"></option>`).join("");
      return PROJECTS_STYLE_HTML + `
        <datalist id="project-kind-options">${kindOptionsHtml}</datalist>
        <p class="page-title">Projects</p>
        ${projectDetailHtml(p, team, ideas, tasks, competitions)}`;
    }
  }

  const active = projects.filter(p => p.status === "active");
  const paused = projects.filter(p => p.status === "paused");
  const done = projects.filter(p => p.status === "done");

  return PROJECTS_STYLE_HTML
    + renderOverviewShell(distinctKinds, deadlineRows, deadlines)
    + renderProjectGroups(active, paused, done, team, ideas, dueCountMap);
}

function wireAddProject() {
  const addBtn = document.getElementById("add-project");
  if (!addBtn) return;
  addBtn.onclick = async () => {
    const name = document.getElementById("new-project-name").value.trim();
    const kind = document.getElementById("new-project-kind").value.trim() || "software";
    const description = document.getElementById("new-project-desc").value.trim();
    if (!name) return;
    const result = await api("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, description }),
    });
    const similarBox = document.getElementById("similar-box");
    if (result.similar && result.similar.length) {
      const msg = "Similar to: " + result.similar.map(s => `${s.project.name} (${Math.round(s.score * 100)}%)`).join(", ");
      if (similarBox) similarBox.textContent = msg;
      window.alert(msg);
    } else if (similarBox) {
      similarBox.textContent = "";
    }
    render();
  };
}

function wireProjectOverview() {
  document.querySelectorAll(".prj-tile-open").forEach(btn => {
    btn.onclick = () => {
      setProjectDetailId(Number(btn.dataset.project));
      render();
    };
  });

  document.querySelectorAll(".project-reactivate").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await api(`/api/projects/${btn.dataset.project}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      render();
    };
  });

  document.querySelectorAll(".project-link-dump").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      goLinkDumpForProject(btn.dataset.project, btn.dataset.name);
    };
  });

  wireProjectDragReorder();
}

function wireProjectDetailFields() {
  const back = document.getElementById("prj-back-overview");
  if (back) back.onclick = () => { setProjectDetailId(null); render(); };

  const goTasks = document.getElementById("prj-go-tasks");
  if (goTasks) goTasks.onclick = () => goToTab("Tasks");

  const quickTaskInput = document.getElementById("prj-quick-task-title");
  const quickTaskDue = document.getElementById("prj-quick-task-due");
  const quickTaskAdd = document.getElementById("prj-quick-task-add");
  let quickTaskDeadlineDismissed = false;
  if (quickTaskDue) quickTaskDue.onchange = () => {
    if (quickTaskDue.value) quickTaskDeadlineDismissed = false;
  };
  document.getElementById("prj-quick-task-push")?.addEventListener("click", () => {
    if (!quickTaskDue || typeof taskAddDays !== "function") return;
    quickTaskDue.value = taskAddDays(quickTaskDue.value || taskSuggestedDeadline("medium"), 7);
    quickTaskDeadlineDismissed = false;
  });
  document.getElementById("prj-quick-task-dismiss")?.addEventListener("click", () => {
    if (!window.confirm("Actively dismiss the deadline for this project task?")) return;
    if (quickTaskDue) quickTaskDue.value = "";
    quickTaskDeadlineDismissed = true;
  });
  const addProjectTask = async () => {
    const title = quickTaskInput?.value.trim();
    if (!title || !quickTaskAdd) return;
    if (!quickTaskDue?.value && !quickTaskDeadlineDismissed) {
      window.alert("Choose, push, or actively dismiss the urgency deadline.");
      return;
    }
    quickTaskAdd.disabled = true;
    try {
      await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          project_id: Number(quickTaskAdd.dataset.project),
          urgency: "medium",
          due_date: quickTaskDue?.value || null,
          deadline_dismissed: quickTaskDeadlineDismissed,
        }),
      });
      render();
    } catch (err) {
      window.alert(errorMessage(err));
      quickTaskAdd.disabled = false;
    }
  };
  if (quickTaskAdd) quickTaskAdd.onclick = addProjectTask;
  if (quickTaskInput) quickTaskInput.onkeydown = e => {
    if (e.key === "Enter") addProjectTask();
  };
  document.querySelectorAll(".prj-task-complete").forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/tasks/${btn.dataset.task}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      render();
    };
  });
  document.querySelectorAll(".prj-task-open").forEach(btn => {
    btn.onclick = () => {
      if (typeof OPEN_TASK_EDIT !== "undefined") OPEN_TASK_EDIT.add(Number(btn.dataset.task));
      goToTab("Tasks");
    };
  });

  document.querySelectorAll(".prj-feature-toggle").forEach(btn => {
    btn.onclick = () => {
      const feature = btn.dataset.feature;
      if (feature !== "activity" && feature !== "progress") return;
      const visible = btn.getAttribute("aria-pressed") !== "true";
      prjSetFeatureVisibility(btn.dataset.project, feature, visible);
      btn.setAttribute("aria-pressed", String(visible));
      btn.classList.toggle("active", visible);
      const panel = document.querySelector(`[data-prj-feature-panel="${feature}"]`);
      if (panel) panel.hidden = !visible;
    };
  });

  document.querySelectorAll(".project-progress-slider").forEach(inp => {
    const pid = inp.dataset.project;
    const bar = document.querySelector(`.project-progress-bar-fill[data-project="${pid}"]`);
    const label = document.querySelector(`.project-progress-label[data-project="${pid}"]`);
    inp.oninput = () => {
      const v = Number(inp.value);
      if (bar) bar.style.width = v + "%";
      if (label) label.textContent = v + "%";
    };
    inp.onchange = () => api(`/api/projects/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: Number(inp.value) }),
    });
  });

  document.querySelectorAll(".project-name").forEach(inp => {
    inp.onchange = () => api(`/api/projects/${inp.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: inp.value }),
    });
  });
  document.querySelectorAll(".project-kind").forEach(inp => {
    inp.onchange = () => api(`/api/projects/${inp.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: inp.value.trim() || "software" }),
    });
  });
  document.querySelectorAll(".project-link-idea").forEach(sel => {
    sel.onchange = async () => {
      await api(`/api/projects/${sel.dataset.project}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_idea_id: sel.value ? Number(sel.value) : null }),
      });
      render();
    };
  });
  document.querySelectorAll(".project-status").forEach(sel => {
    sel.onchange = async () => {
      const payload = { status: sel.value };
      if (sel.value === "done") {
        const notes = window.prompt("Completion notes / what shipped? (optional)") || "";
        if (notes.trim()) payload.archive_notes = notes.trim();
      }
      await api(`/api/projects/${sel.dataset.project}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      render();
    };
  });
  document.querySelectorAll(".project-grade").forEach(inp => {
    inp.onchange = () => api(`/api/projects/${inp.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: inp.value.trim() }),
    });
  });
  document.querySelectorAll(".project-completed-at").forEach(inp => {
    inp.onchange = () => api(`/api/projects/${inp.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: inp.value || null }),
    });
  });
  document.querySelectorAll(".project-desc-edit").forEach(el => {
    wireRichToolbar(`project-desc-${el.dataset.project}`);
    wireFieldHistory("project", Number(el.dataset.project), "description", `project-desc-${el.dataset.project}`);
    el.onblur = () => api(`/api/projects/${el.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: el.innerHTML.trim() }),
    });
  });
  document.querySelectorAll(".project-archive-notes").forEach(el => {
    wireRichToolbar(`project-archive-${el.dataset.project}`);
    wireFieldHistory("project", Number(el.dataset.project), "archive_notes", `project-archive-${el.dataset.project}`);
    el.onblur = () => api(`/api/projects/${el.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive_notes: el.innerHTML.trim() }),
    });
  });
  document.querySelectorAll(".project-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Remove from Planner? This only removes the entry here — the actual project folder is never touched.")) return;
      await api(`/api/projects/${btn.dataset.project}`, { method: "DELETE" });
      setProjectDetailId(null);
      render();
    };
  });

  document.querySelectorAll(".project-path").forEach(inp => {
    inp.onchange = () => api(`/api/projects/${inp.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: inp.value }),
    });
  });
  document.querySelectorAll(".project-run-command").forEach(inp => {
    inp.onchange = () => api(`/api/projects/${inp.dataset.project}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_command: inp.value }),
    });
  });
  document.querySelectorAll(".project-open-folder").forEach(btn => {
    btn.onclick = async () => {
      try {
        const result = await api(`/api/projects/${btn.dataset.project}/open-folder`, { method: "POST" });
        if (result.error) window.alert(result.error);
      } catch (err) {
        window.alert(errorMessage(err));
      }
    };
  });
  document.querySelectorAll(".project-run").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Run this project's command? It will start in the project folder.")) return;
      try {
        const result = await api(`/api/projects/${btn.dataset.project}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        });
        window.alert(result.error || `Ran: ${result.ran}\nin ${result.cwd}`);
      } catch (err) {
        window.alert(errorMessage(err));
      }
    };
  });
  document.querySelectorAll(".project-scan-code").forEach(btn => {
    btn.onclick = async () => {
      btn.innerHTML = '<span class="spinner"></span>Scanning...'; btn.disabled = true;
      try {
        const result = await api(`/api/projects/${btn.dataset.project}/scan-code`, { method: "POST" });
        if (result.error) {
          window.alert(result.error);
        } else if (result.similar_by_code && result.similar_by_code.length) {
          window.alert("Similar by actual code to: " + result.similar_by_code.map(s => `${s.project.name} (${Math.round(s.score * 100)}%)`).join(", "));
        }
      } catch (err) {
        window.alert(errorMessage(err));
      } finally {
        btn.textContent = "Scan code"; btn.disabled = false;
      }
      render();
    };
  });
  document.querySelectorAll(".project-describe-readme").forEach(btn => {
    btn.onclick = async () => {
      btn.innerHTML = '<span class="spinner"></span>Reading...'; btn.disabled = true;
      try {
        const result = await api(`/api/projects/${btn.dataset.project}/describe-from-readme`, { method: "POST" });
        if (result.error) window.alert(result.error);
      } catch (err) {
        window.alert(errorMessage(err));
      } finally {
        btn.textContent = "Describe from README"; btn.disabled = false;
      }
      render();
    };
  });

  document.querySelectorAll(".project-add-member").forEach(sel => {
    sel.onchange = async () => {
      if (!sel.value) return;
      await api(`/api/projects/${sel.dataset.project}/team`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_member_id: Number(sel.value) }),
      });
      render();
    };
  });

  document.querySelectorAll(".project-member-remove").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Unassign this person from the project?")) return;
      await api(`/api/projects/${btn.dataset.project}/team/${btn.dataset.member}`, { method: "DELETE" });
      render();
    };
  });

  document.querySelectorAll(".project-manage-team").forEach(btn => {
    btn.onclick = () => goToTab("Team");
  });

  document.querySelectorAll(".project-link-dump").forEach(btn => {
    btn.onclick = () => goLinkDumpForProject(btn.dataset.project, btn.dataset.name);
  });

  if (PROJECT_DETAIL_ID) {
    loadProjectNotes(PROJECT_DETAIL_ID);
    loadProjectChronicle(PROJECT_DETAIL_ID);
    wireProjectChronicle(PROJECT_DETAIL_ID);
  }
}

function wireProjects() {
  wireAddProject();
  if (PROJECT_DETAIL_ID) {
    wireProjectDetailFields();
  } else {
    wireProjectOverview();
  }
}

function wireProjectDragReorder() {
  let draggedId = null;
  document.querySelectorAll(".project-card-wrap").forEach(row => {
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
      const group = row.closest(".project-group");
      const dragging = group ? group.querySelector(".project-card-wrap.dragging") : null;
      if (!dragging || dragging.closest(".project-group") !== group) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.parentElement.insertBefore(dragging, before ? row : row.nextSibling);
    });

    row.addEventListener("drop", async e => {
      e.preventDefault();
      if (draggedId === null) return;
      const group = row.closest(".project-group");
      if (!group) return;
      const ids = Array.from(group.querySelectorAll(".project-card-wrap")).map(r => Number(r.dataset.id));
      try {
        await api("/api/projects/reorder", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      } catch (err) {
        window.alert(errorMessage(err));
      }
      render();
    });
  });
}
