// --- Skills / Problems / Thinking (generic freeform list) ---------------------------------------------------------

// --- Document upload: auto-classify into Ideas/Skills/Problems/Thinking ---------------------------------------------------------

let DOC_CLASSIFY_PROPOSALS = null;
let DOC_CLASSIFY_FILENAME = "";
let DOC_CLASSIFY_SOURCES = [];
const DOC_CLASSIFY_LIST_TYPES = ["idea", "skill", "problem", "thinking", "funny", "essay"];

const NOTE_AUTOSAVE_TIMERS = {};
const NOTE_BULK_STATE = {};
let NTS_PROJECTS_CACHE = [];
let SELECTED_SKILL_ID = null;
const NTS_PROJECT_META_RE = /<!--\s*waypoint-project:(\d+)\s*-->/i;

const NTS_CLASSIFY_TARGETS = [
  { value: "idea", label: "Idea", api: "ideas" },
  { value: "skill", label: "Skill", api: "lists" },
  { value: "problem", label: "Problem", api: "lists" },
  { value: "funny", label: "Funny", api: "lists" },
  { value: "essay", label: "Essay", api: "lists" },
];

const NTS_FONT_FAMILIES = [
  { label: "Sans", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, 'Cascadia Code', Consolas, monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Garamond", value: "'EB Garamond', Garamond, 'Times New Roman', serif" },
];

const NTS_TEXT_SWATCHES = ["#1a1a1a", "#374151", "#6b7280", "#e8663d", "#2563eb", "#7c3aed", "#059669", "#dc2626"];
const NTS_HIGHLIGHT_SWATCHES = ["#fef08a", "#fde68a", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fecaca", "#fed7aa", "#f3f4f6"];
const NTS_TABLE_CELL_SWATCHES = ["", "#fef08a", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fecaca", "#f3f4f6", "#ffffff"];

const NTS_HEADING_BLOCKS = [
  { label: "Normal", tag: "p" },
  { label: "Title", tag: "h1", style: "font-size:1.75em;font-weight:700;" },
  { label: "Subtitle", tag: "h2", style: "font-size:1.25em;font-weight:500;color:var(--ink-secondary);" },
  { label: "Heading 1", tag: "h1" },
  { label: "Heading 2", tag: "h2" },
  { label: "Heading 3", tag: "h3" },
  { label: "Quote", tag: "blockquote" },
  { label: "Code block", tag: "pre" },
];

const NTS_LINE_HEIGHTS = ["1", "1.15", "1.5", "2"];
const NTS_PARAGRAPH_SPACING = ["0", "4", "8", "12", "18"];
const NTS_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre";
let NOTES_TOOLBAR_HTML = "";
let NOTES_CARD_TOOLBAR_HTML = "";

const NTS_LIST_IDENTITIES = {
  skill: {
    className: "nts-app-skill",
    title: "Skill Atlas",
    kicker: "Topographic learning terrain",
    intent: "Map skill transfer honestly; proficiency is height, adjacency is local context.",
    action: "Terrain stays local",
    button: "Focus atlas",
  },
  problem: {
    className: "nts-app-problem",
    title: "War Room",
    kicker: "Tactical constraints board",
    intent: "Break pressure into constraints, hypotheses, attacks, and next experiments.",
    action: "Create battle card",
    button: "Add battle card",
  },
  thinking: {
    className: "nts-app-thinking",
    title: "Mind Inbox",
    kicker: "Quiet dump stream",
    intent: "Capture first; classify only after the thought is safe.",
    action: "Frictionless capture",
    button: "Start dumping",
  },
  funny: {
    className: "nts-app-funny",
    title: "Spark Deck",
    kicker: "Shuffleable social sparks",
    intent: "Surface one spark at a time, then copy or save the reaction.",
    action: "Shuffle one spark",
    button: "Shuffle spark",
  },
  essay: {
    className: "nts-app-essay",
    title: "Writing Studio",
    kicker: "Outline-driven long form",
    intent: "Write with a calm document body, visible outline, and honest export options.",
    action: "Outline + export",
    button: "Open latest essay",
  },
};

const NTS_LIST_SWITCHER_TABS = ["Ideas", "Skills", "Problems", "Thinking", "Funny", "Essays", "Repository"];

const NTS_LIST_EMPTY_MSG = {
  skill: "No skills in the atlas yet. Add one above or import from a .txt or .md file.",
  problem: "No battle cards yet. Use the template button or capture a constraint above.",
  thinking: "Inbox is clear. Dump a thought above — classify later, or never.",
  funny: "No sparks in the deck. Add one above, then shuffle.",
  essay: "No essays yet. Start writing above or import an outline from a document.",
};

function ntsListEmptyMessage(listType, itemCount, filter, search) {
  const q = (search || "").trim();
  const f = filter || "all";
  if (itemCount > 0 && (q || f !== "all")) {
    return "No entries match your search or filter. Try clearing filters.";
  }
  return NTS_LIST_EMPTY_MSG[listType] || "Nothing here yet.";
}

function ntsSwitcherLabel(tab) {
  if (typeof TAB_LABELS !== "undefined" && TAB_LABELS[tab]) return TAB_LABELS[tab];
  return tab;
}

function ntsSwitcherNeighborTabs(activeTab) {
  const tabs = NTS_LIST_SWITCHER_TABS;
  const idx = tabs.indexOf(activeTab);
  if (idx < 0) return { prev: null, next: null, idx: -1 };
  return {
    prev: idx > 0 ? tabs[idx - 1] : null,
    next: idx < tabs.length - 1 ? tabs[idx + 1] : null,
    idx,
  };
}

function ntsEstimateTokens(text) {
  return Math.max(0, Math.ceil((text || "").length / 4));
}

function ntsDeleteButtonLabel(listType) {
  return "Delete";
}

function ntsSwitcherCount(tab) {
  if (typeof CAPTURE_LIST_COUNTS === "undefined" || !CAPTURE_LIST_COUNTS) return null;
  const raw = CAPTURE_LIST_COUNTS[tab];
  const n = Number(raw);
  return raw == null || !Number.isFinite(n) ? null : n;
}

function ntsSwitcherPill(tab, activeTab) {
  const active = tab === activeTab;
  const label = ntsSwitcherLabel(tab);
  const count = ntsSwitcherCount(tab);
  const countHtml = count == null
    ? ""
    : `<span class="nts-pill-count" data-count-for="${escapeHtml(tab)}">${count}</span>`;
  const title = count == null ? label : `${label} — ${count} entr${count === 1 ? "y" : "ies"}`;
  return `<button type="button" class="nts-pill${active ? " nts-pill--active" : ""}" data-tab="${escapeHtml(tab)}" title="${escapeHtml(title)}"${active ? ` aria-current="page"` : ""}>
        <span class="nts-pill-label">${escapeHtml(label)}</span>${countHtml}
      </button>`;
}

function ntsSwitcherNavBtn(tab, glyph, direction) {
  if (!tab) {
    return `<button type="button" class="nts-list-nav-btn" disabled aria-disabled="true" aria-label="No ${direction} list">${glyph}</button>`;
  }
  const label = ntsSwitcherLabel(tab);
  return `<button type="button" class="nts-list-nav-btn" data-tab="${escapeHtml(tab)}" data-nav-dir="${direction}" title="Go to ${escapeHtml(label)}" aria-label="${direction === "previous" ? "Previous" : "Next"} list: ${escapeHtml(label)}">${glyph}</button>`;
}

function renderNtsListSwitcher(activeTab) {
  ensureNotesScopedStyles();
  const { prev, next } = ntsSwitcherNeighborTabs(activeTab);
  const pills = NTS_LIST_SWITCHER_TABS.map(tab => ntsSwitcherPill(tab, activeTab)).join("");
  // A div with role=navigation, not <nav>: app.css styles `nav button` as a full-width
  // sidebar row, which would stretch every pill across the rail.
  return `<div class="nts-list-switcher" role="navigation" aria-label="Capture lists">
      <div class="nts-list-switcher-top">
        ${ntsSwitcherNavBtn(prev, "&#8592;", "previous")}
        <div class="nts-list-rail" id="nts-list-rail">${pills}</div>
        ${ntsSwitcherNavBtn(next, "&#8594;", "next")}
      </div>
    </div>`;
}

// Retired: the pill rail above is the single Capture selector. Kept as a no-op so the
// Ideas and Repository render paths that still call it stay valid.
function renderNtsCaptureConnect() {
  return "";
}

let NTS_SWITCHER_KEY_NAV = false;
let NTS_SWITCHER_COUNTS_PENDING = false;

function ntsCenterActivePill(rail) {
  const active = rail.querySelector(".nts-pill--active");
  if (!active || rail.scrollWidth <= rail.clientWidth) return;
  const target = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
  rail.scrollLeft = Math.max(0, Math.min(target, rail.scrollWidth - rail.clientWidth));
}

// Ideas and Repository render without awaiting refreshCaptureListCounts, so counts can be
// unknown on a first visit. Fill them in place once instead of showing a guessed number.
async function ntsHydrateSwitcherCounts(activeTab) {
  if (NTS_SWITCHER_COUNTS_PENDING) return;
  if (typeof refreshCaptureListCounts !== "function") return;
  const missing = NTS_LIST_SWITCHER_TABS.some(tab => ntsSwitcherCount(tab) == null);
  if (!missing) return;
  NTS_SWITCHER_COUNTS_PENDING = true;
  try {
    await refreshCaptureListCounts();
  } catch (_) {
    return;
  } finally {
    NTS_SWITCHER_COUNTS_PENDING = false;
  }
  const rail = document.getElementById("nts-list-rail");
  if (!rail) return;
  rail.querySelectorAll(".nts-pill").forEach(pill => {
    const tab = pill.dataset.tab;
    const count = ntsSwitcherCount(tab);
    if (count == null) return;
    const existing = pill.querySelector(".nts-pill-count");
    if (existing) existing.textContent = count;
    else pill.insertAdjacentHTML("beforeend", `<span class="nts-pill-count" data-count-for="${escapeHtml(tab)}">${count}</span>`);
    const label = ntsSwitcherLabel(tab);
    pill.title = `${label} — ${count} entr${count === 1 ? "y" : "ies"}`;
  });
  if (activeTab) ntsCenterActivePill(rail);
}

function wireNtsListSwitcher() {
  const go = (tab, viaKeyboard = false) => {
    if (!tab || typeof goToTab !== "function") return;
    NTS_SWITCHER_KEY_NAV = viaKeyboard;
    goToTab(tab);
  };
  document.querySelectorAll(".nts-list-switcher [data-tab]").forEach(btn => {
    if (btn.disabled) return;
    btn.onclick = () => go(btn.dataset.tab);
  });

  const rail = document.getElementById("nts-list-rail");
  if (!rail) return;
  const activePill = rail.querySelector(".nts-pill--active");
  const activeTab = activePill?.dataset.tab || "";
  ntsCenterActivePill(rail);
  if (NTS_SWITCHER_KEY_NAV) {
    NTS_SWITCHER_KEY_NAV = false;
    activePill?.focus({ preventScroll: true });
  }
  rail.onkeydown = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const from = e.target.closest(".nts-pill")?.dataset.tab || activeTab;
    const { prev, next } = ntsSwitcherNeighborTabs(from);
    const target = e.key === "ArrowLeft" ? prev : next;
    if (!target) return;
    e.preventDefault();
    go(target, true);
  };
  ntsHydrateSwitcherCounts(activeTab);
}

function ntsPrefKey(listType, key) {
  return `nts_${listType}_${key}`;
}

function getNotePref(listType, key, fallback = "") {
  try {
    const v = localStorage.getItem(ntsPrefKey(listType, key));
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function setNotePref(listType, key, value) {
  try {
    localStorage.setItem(ntsPrefKey(listType, key), value);
  } catch (_) { /* ignore quota */ }
}

function getNoteBulkState(listType) {
  if (!NOTE_BULK_STATE[listType]) NOTE_BULK_STATE[listType] = { active: false, ids: new Set() };
  return NOTE_BULK_STATE[listType];
}

function getDumpLinkProjectContext() {
  try {
    const id = Number(localStorage.getItem("dumpLinkProjectId"));
    const name = localStorage.getItem("dumpLinkProjectName") || "";
    if (Number.isFinite(id) && id > 0) return { id, name };
  } catch (_) {}
  return null;
}

function clearDumpLinkProjectContext() {
  try {
    localStorage.removeItem("dumpLinkProjectId");
    localStorage.removeItem("dumpLinkProjectName");
    localStorage.removeItem("nts_thinking_projectFilter");
  } catch (_) {}
}

function noteGetProjectId(item) {
  const m = String(item?.body || "").match(NTS_PROJECT_META_RE);
  return m ? Number(m[1]) : null;
}

function noteBodySetProjectId(body, projectId) {
  const stripped = String(body || "").replace(NTS_PROJECT_META_RE, "").trim();
  if (!projectId) return stripped;
  return `<!-- waypoint-project:${projectId} -->\n${stripped}`;
}

function ntsProjectName(projectId, projects) {
  const p = (projects || NTS_PROJECTS_CACHE).find(x => x.id === projectId);
  return p?.name || "";
}

function sortThinkingItemsForProject(items, listType) {
  if (listType !== "thinking") return items;
  const projectFilter = Number(getNotePref("thinking", "projectFilter", ""));
  const ctx = getDumpLinkProjectContext();
  const focusId = Number.isFinite(projectFilter) && projectFilter > 0 ? projectFilter : ctx?.id;
  if (!focusId) return items;
  return [...items].sort((a, b) => {
    const aLinked = noteGetProjectId(a) === focusId ? 0 : 1;
    const bLinked = noteGetProjectId(b) === focusId ? 0 : 1;
    if (aLinked !== bLinked) return aLinked - bLinked;
    return Number(b.id) - Number(a.id);
  });
}

function renderNoteProjectLinkRow(item, listType) {
  if (listType !== "thinking") return "";
  const linkedId = noteGetProjectId(item);
  const ctx = getDumpLinkProjectContext();
  const projects = NTS_PROJECTS_CACHE || [];
  const opts = projects.map(p =>
    `<option value="${p.id}" ${linkedId === p.id ? "selected" : ""}>${escapeHtml(p.name || "Untitled")}</option>`
  ).join("");
  const linkedName = linkedId ? ntsProjectName(linkedId, projects) : "";
  return `
    <div class="nts-project-link-row" style="margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
      <span class="stub" style="margin:0;">project &rarr;</span>
      <select class="note-link-project" data-id="${item.id}" data-type="${listType}">
        <option value="">No project</option>
        ${opts}
      </select>
      ${linkedName ? `<span class="pill status-good">${escapeHtml(linkedName)}</span>` : ""}
      ${ctx && linkedId !== ctx.id ? `<button type="button" class="secondary note-link-project-quick" data-id="${item.id}" data-project="${ctx.id}" title="Link to ${escapeHtml(ctx.name || `project #${ctx.id}`)}">Link here</button>` : ""}
    </div>`;
}

function renderThinkingProjectBanner() {
  const ctx = getDumpLinkProjectContext();
  if (!ctx) return "";
  const label = ctx.name || `project #${ctx.id}`;
  return `
    <div class="card nts-project-link-banner" style="border-left:3px solid var(--status-good);">
      <strong>Link dumps to ${escapeHtml(label)}</strong>
      <span class="stub">Assign any dump below to this project, or capture a new one — linked entries sort to the top.</span>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
        <button type="button" class="secondary nts-project-filter-linked" data-id="${ctx.id}">Linked only</button>
        <button type="button" class="secondary nts-project-filter-all">Show all</button>
        <button type="button" class="secondary nts-project-link-clear">Clear context</button>
      </div>
    </div>`;
}

function noteBodyPlain(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function noteItemToMd(item) {
  const bodyText = noteBodyPlain(item.body);
  return `# ${item.title || "Untitled"}\n\n${bodyText}\n`;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown(filename, md) {
  downloadBlob(filename, md, "text/markdown");
}

function noteSourcePills(item) {
  if (item.source === "ai") return '<span class="pill nts-pill-ai">ai</span>';
  return '<span class="pill nts-pill-mine">mine</span>';
}

function notesToolbarSwatches(colors, cmd, label) {
  return colors.map(c =>
    `<button type="button" class="nts-rt-swatch" data-cmd="${cmd}" data-value="${c}" style="background:${c};" aria-label="${escapeHtml(label)} ${c}" title="${escapeHtml(label)} ${c}"></button>`
  ).join("");
}

function notesBuildToolbarHtml() {
  const fontOpts = NTS_FONT_FAMILIES.map(f =>
    `<option value="${escapeHtml(f.value)}">${escapeHtml(f.label)}</option>`
  ).join("");
  const headingOpts = NTS_HEADING_BLOCKS.map((h, idx) =>
    `<option value="${idx}" data-label="${escapeHtml(h.label)}">${escapeHtml(h.label)}</option>`
  ).join("");
  const lhOpts = NTS_LINE_HEIGHTS.map(lh =>
    `<option value="${lh}">${lh}</option>`
  ).join("");
  const spacingOpts = NTS_PARAGRAPH_SPACING.map(px =>
    `<option value="${px}">${px}px</option>`
  ).join("");
  const textSwatches = notesToolbarSwatches(NTS_TEXT_SWATCHES, "foreColor", "Text color");
  const hiSwatches = notesToolbarSwatches(NTS_HIGHLIGHT_SWATCHES, "hiliteColor", "Highlight color");
  return `
  <div class="nts-rich-toolbar nts-toolbar-v2 rich-toolbar" role="toolbar" aria-label="Notes toolbar v2">
    <details class="nts-rt-group nts-rt-file" open>
      <summary>File</summary>
      <span class="nts-rt-doc-title" data-nts-doc-title>Untitled</span>
      <span class="nts-rt-save-state" data-nts-save-state>Saved locally</span>
      <button type="button" data-action="duplicateNote" title="Duplicate this note when editing an existing entry">Duplicate</button>
      <button type="button" disabled title="Version history needs a backend endpoint">Version history unavailable</button>
      <button type="button" disabled title="Move/archive is not exposed by the list API">Move/archive unavailable</button>
    </details>
    <details class="nts-rt-group" open>
      <summary>Undo</summary>
      <button type="button" data-cmd="undo" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" data-cmd="redo" title="Redo (Ctrl+Y)">Redo</button>
      <button type="button" disabled title="No local deleted-block history exists yet">Restore deleted block unavailable</button>
    </details>
    <details class="nts-rt-group" open>
      <summary>Text</summary>
      <select data-cmd="fontFamily" title="Font family" aria-label="Font family">${fontOpts}</select>
      <span class="nts-rt-stepper" title="Font size">
        <button type="button" data-action="fontSizeDec" title="Decrease font size">-</button>
        <input type="number" data-action="fontSize" min="8" max="72" value="14" title="Font size in pixels" aria-label="Font size in pixels">
        <button type="button" data-action="fontSizeInc" title="Increase font size">+</button>
      </span>
      <button type="button" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button type="button" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button type="button" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
      <button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
      <button type="button" data-action="inlineCode" title="Inline code">&lt;/&gt;</button>
      <button type="button" data-cmd="removeFormat" title="Clear formatting">Clear</button>
      <span class="nts-rt-colors">
        <span class="nts-rt-label">Text color</span>
        <span class="nts-rt-swatches">${textSwatches}</span>
        <input type="color" data-cmd="foreColor" data-custom="1" title="Custom text color" value="#1a1a1a" aria-label="Custom text color">
      </span>
      <span class="nts-rt-colors">
        <span class="nts-rt-label">Highlight color</span>
        <span class="nts-rt-swatches">${hiSwatches}</span>
        <input type="color" data-cmd="hiliteColor" data-custom="1" title="Custom highlight color" value="#fef08a" aria-label="Custom highlight color">
      </span>
    </details>
    <details class="nts-rt-group">
      <summary>Paragraph</summary>
      <select data-cmd="formatBlock" title="Paragraph style" aria-label="Paragraph style"><option value="">Style...</option>${headingOpts}</select>
      <button type="button" data-cmd="justifyLeft" title="Align left">Left</button>
      <button type="button" data-cmd="justifyCenter" title="Align center">Center</button>
      <button type="button" data-cmd="justifyRight" title="Align right">Right</button>
      <button type="button" data-cmd="justifyFull" title="Justify">Justify</button>
      <select data-action="lineHeight" title="Line height" aria-label="Line height"><option value="">Line height</option>${lhOpts}</select>
      <select data-action="paragraphSpacing" title="Paragraph spacing" aria-label="Paragraph spacing"><option value="">Paragraph spacing</option>${spacingOpts}</select>
      <button type="button" data-cmd="insertUnorderedList" title="Bulleted list">Bullets</button>
      <button type="button" data-cmd="insertOrderedList" title="Numbered list">Numbered</button>
      <button type="button" data-action="checklist" title="Checklist">Checklist</button>
      <button type="button" data-cmd="indent" title="Indent">Indent</button>
      <button type="button" data-cmd="outdent" title="Outdent">Outdent</button>
      <button type="button" data-cmd="formatBlock" data-value="<blockquote>" title="Quote">Quote</button>
      <button type="button" data-action="codeBlock" title="Code block">Code block</button>
      <button type="button" data-cmd="insertHorizontalRule" title="Horizontal rule">Rule</button>
    </details>
    <details class="nts-rt-group">
      <summary>Insert</summary>
      <button type="button" data-action="link" title="Insert link chip">Link</button>
      <button type="button" data-action="image" title="Insert image">Image</button>
      <span class="nts-rt-table-wrap">
        <button type="button" data-action="table" title="Insert table">Table</button>
        <span class="nts-rt-table-grid" style="display:none;"></span>
      </span>
      <button type="button" data-action="checklist" title="Insert checkbox">Checkbox</button>
      <button type="button" data-cmd="insertHorizontalRule" title="Insert divider">Divider</button>
      <button type="button" data-action="date" title="Insert today's date">Date</button>
      <button type="button" data-action="attachment" title="Attach a file through the existing attachment endpoint">Attachment</button>
    </details>
    <details class="nts-rt-group">
      <summary>Layout</summary>
      <button type="button" data-table-action="addRow">+ Row</button>
      <button type="button" data-table-action="delRow">- Row</button>
      <button type="button" data-table-action="addCol">+ Col</button>
      <button type="button" data-table-action="delCol">- Col</button>
      <button type="button" data-table-action="mergeRight">Merge right</button>
      <button type="button" data-table-action="cellBg">Cell bg</button>
      <button type="button" data-table-action="sortColumn">Sort column</button>
      <button type="button" data-table-action="resizeCols">Resize cols</button>
    </details>
    <details class="nts-rt-group">
      <summary>Review</summary>
      <span class="nts-rt-wordcount" data-nts-wordcount title="Word count">0 words · 0 chars · ≈ 0 tokens · 0 min · selection 0</span>
      <button type="button" data-action="outlineRefresh" title="Refresh outline panel">Refresh outline</button>
    </details>
    <details class="nts-rt-group">
      <summary>Export</summary>
      <button type="button" data-export="txt">Plain text</button>
      <button type="button" data-export="md">Markdown</button>
      <button type="button" data-export="html">HTML</button>
      <button type="button" data-action="printPdf">PDF print</button>
      <button type="button" data-export="docx">DOCX</button>
      <button type="button" class="nts-rt-fullscreen" title="Full screen editor">Fullscreen</button>
    </details>
  </div>`;
}

function notesEnsureToolbarHtml() {
  if (!NOTES_TOOLBAR_HTML) NOTES_TOOLBAR_HTML = notesBuildToolbarHtml();
  return NOTES_TOOLBAR_HTML;
}

function notesBuildCardToolbarHtml() {
  return `
  <div class="nts-rich-toolbar nts-toolbar-inline rich-toolbar" role="toolbar" aria-label="Notes inline toolbar">
    <button type="button" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
    <button type="button" data-action="link" title="Insert link">Link</button>
    <button type="button" class="nts-rt-fullscreen secondary" title="Open full editor">Open full editor</button>
  </div>`;
}

function notesEnsureCardToolbarHtml() {
  if (!NOTES_CARD_TOOLBAR_HTML) NOTES_CARD_TOOLBAR_HTML = notesBuildCardToolbarHtml();
  return NOTES_CARD_TOOLBAR_HTML;
}

function ntsIsUrl(text) {
  return /^https?:\/\/\S+$/i.test((text || "").trim());
}

function ntsNormalizeLinkUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(s)) return `https://${s}`;
  return s;
}

function ntsLinkLabel(url) {
  try {
    const u = new URL(ntsNormalizeLinkUrl(url));
    return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.slice(0, 20) + (u.pathname.length > 20 ? "…" : "") : "");
  } catch (_) {
    return url.slice(0, 32);
  }
}

function ntsRichToolbarHtml() {
  return notesEnsureToolbarHtml();
}

function ntsGetEditable(toolbarRoot) {
  const richFor = toolbarRoot.closest("[data-rich-for]");
  if (!richFor) return null;
  return document.getElementById(richFor.dataset.richFor);
}

function ntsFocusEditable(editable) {
  if (!editable) return;
  editable.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount === 0 && editable.childNodes.length) {
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function ntsExec(editable, cmd, value) {
  ntsFocusEditable(editable);
  document.execCommand(cmd, false, value == null ? null : value);
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsApplyFontFamily(editable, family) {
  ntsFocusEditable(editable);
  document.execCommand("fontName", false, family.split(",")[0].replace(/['"]/g, ""));
  editable.querySelectorAll("font").forEach(f => {
    const span = document.createElement("span");
    span.style.fontFamily = family;
    span.innerHTML = f.innerHTML;
    f.replaceWith(span);
  });
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsClosestBlock(node, root) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root) {
    if (el.matches?.(NTS_BLOCK_SELECTOR)) return el;
    el = el.parentElement;
  }
  return null;
}

function ntsSubRangeForBlock(block, fullRange, editable) {
  const sub = document.createRange();
  const startBlock = ntsClosestBlock(fullRange.startContainer, editable);
  const endBlock = ntsClosestBlock(fullRange.endContainer, editable);
  if (block.contains(fullRange.startContainer) || block === startBlock) {
    sub.setStart(fullRange.startContainer, fullRange.startOffset);
  } else {
    sub.selectNodeContents(block);
    sub.collapse(true);
  }
  if (block.contains(fullRange.endContainer) || block === endBlock) {
    sub.setEnd(fullRange.endContainer, fullRange.endOffset);
  } else {
    sub.selectNodeContents(block);
    sub.collapse(false);
  }
  if (sub.collapsed) return null;
  const ancestor = sub.commonAncestorContainer;
  if (ancestor !== block && !block.contains(ancestor)) return null;
  return sub;
}

function ntsBlocksInRange(editable, range) {
  return [...editable.querySelectorAll(NTS_BLOCK_SELECTOR)].filter(block => {
    if (!range.intersectsNode(block)) return false;
    const sub = ntsSubRangeForBlock(block, range, editable);
    return sub && !sub.collapsed;
  });
}

function ntsWrapRangeFontSize(range, sizePx) {
  const span = document.createElement("span");
  span.style.fontSize = `${sizePx}px`;
  try {
    range.surroundContents(span);
  } catch (_) {
    const extracted = range.extractContents();
    span.appendChild(extracted);
    range.insertNode(span);
  }
}

function ntsApplyFontSize(editable, px) {
  const size = Math.min(72, Math.max(8, Number(px) || 14));
  ntsFocusEditable(editable);
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) {
    document.execCommand("insertHTML", false, `<span style="font-size:${size}px">\u200b</span>`);
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const range = sel.getRangeAt(0);
  if (range.collapsed) {
    document.execCommand("insertHTML", false, `<span style="font-size:${size}px">\u200b</span>`);
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (!editable.contains(range.commonAncestorContainer)) return;

  const blockRanges = ntsBlocksInRange(editable, range)
    .map(block => ntsSubRangeForBlock(block, range, editable))
    .filter(sub => sub && !sub.collapsed);

  if (blockRanges.length) {
    blockRanges.reverse().forEach(sub => ntsWrapRangeFontSize(sub, size));
  } else {
    ntsWrapRangeFontSize(range.cloneRange(), size);
  }
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsApplyLineHeight(editable, lh) {
  ntsFocusEditable(editable);
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  const block = node?.closest("p, div, li, h1, h2, h3, blockquote, pre") || editable;
  block.style.lineHeight = lh;
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsInsertLinkChip(editable, url, label) {
  const normalized = ntsNormalizeLinkUrl(url);
  if (!normalized) return;
  const text = label || ntsLinkLabel(normalized);
  const safeUrl = escapeHtml(normalized);
  const safeText = escapeHtml(text);
  const favicon = (() => {
    try {
      const u = new URL(normalized);
      return `https://www.google.com/s2/favicons?domain=${escapeHtml(u.hostname)}&sz=16`;
    } catch (_) {
      return "";
    }
  })();
  ntsFocusEditable(editable);
  document.execCommand("insertHTML", false,
    `<a class="nts-link-chip" href="${safeUrl}" target="_blank" rel="noopener" contenteditable="false" data-url="${safeUrl}" title="Ctrl/Cmd-click to open; click to edit">${favicon ? `<img src="${favicon}" alt="">` : '<span class="nts-link-favicon">↗</span>'}<span>${safeText}</span><b aria-hidden="true">edit</b></a>&nbsp;`);
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsSetLinkChipContent(chip, url, label) {
  const normalized = ntsNormalizeLinkUrl(url);
  if (!normalized) return;
  const safeUrl = escapeHtml(normalized);
  const safeText = escapeHtml(label || ntsLinkLabel(normalized));
  let favicon = "";
  try {
    const u = new URL(normalized);
    favicon = `https://www.google.com/s2/favicons?domain=${escapeHtml(u.hostname)}&sz=16`;
  } catch (_) { /* fallback icon below */ }
  chip.href = normalized;
  chip.dataset.url = normalized;
  chip.innerHTML = `${favicon ? `<img src="${favicon}" alt="">` : '<span class="nts-link-favicon">↗</span>'}<span>${safeText}</span><b aria-hidden="true">edit</b>`;
}

function ntsLinkChipLabel(chip) {
  return chip.querySelector("span:not(.nts-link-favicon)")?.textContent || chip.textContent.replace(/\s*edit\s*$/, "");
}

function ntsInsertChecklist(editable) {
  ntsFocusEditable(editable);
  document.execCommand("insertHTML", false,
    '<ul class="nts-checklist"><li><input type="checkbox"><span contenteditable="true">To-do item</span></li></ul>');
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsBuildTableGridHtml(rows, cols) {
  let html = '<table class="nts-table"><tbody>';
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) html += "<td>&nbsp;</td>";
    html += "</tr>";
  }
  html += "</tbody></table><p><br></p>";
  return html;
}

function ntsInsertTable(editable, rows, cols) {
  ntsFocusEditable(editable);
  document.execCommand("insertHTML", false, ntsBuildTableGridHtml(rows, cols));
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsApplyParagraphSpacing(editable, px) {
  ntsFocusEditable(editable);
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  const block = node?.closest("p, div, li, h1, h2, h3, blockquote, pre") || editable;
  block.style.marginBottom = `${Math.max(0, Number(px) || 0)}px`;
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsInsertImageFigure(editable, url) {
  if (!url) return;
  const safeUrl = escapeHtml(url);
  ntsFocusEditable(editable);
  document.execCommand("insertHTML", false, `
    <figure class="nts-image-figure" contenteditable="false">
      <span class="nts-image-frame">
        <img src="${safeUrl}" alt="" class="nts-image-resizable">
        <span class="nts-image-handles" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </span>
      <figcaption contenteditable="true">Caption</figcaption>
      <span class="nts-image-tools">
        <button type="button" data-img-align="left">Left</button>
        <button type="button" data-img-align="center">Center</button>
        <button type="button" data-img-align="right">Right</button>
        <button type="button" data-img-remove="1">Remove</button>
      </span>
    </figure><p><br></p>`);
  editable.querySelectorAll("img").forEach(img => {
    const src = (img.getAttribute("src") || "").trim();
    if (!src) {
      img.classList.add("wp-paste-void");
      img.hidden = true;
      img.closest(".nts-image-figure")?.remove();
      return;
    }
    img.addEventListener("error", () => {
      img.classList.add("wp-paste-void");
      img.hidden = true;
      img.closest(".nts-image-figure")?.classList.add("wp-paste-void");
    }, { once: true });
  });
  if (typeof window.wpHidePasteVoids === "function") window.wpHidePasteVoids(editable);
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

window.wpInsertPastedImage = function wpInsertPastedImage(url, target) {
  if (!url || !target) return false;
  const editable = (target.isContentEditable && target.classList?.contains("rich-editable"))
    ? target
    : target.closest?.(".rich-editable, .note-body-edit, .nts-fs-editable");
  if (!editable) return false;
  ntsInsertImageFigure(editable, url);
  return true;
};

function ntsSelectionElement() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  return node || null;
}

function ntsActiveTableCell(editable) {
  const node = ntsSelectionElement();
  if (!node || !editable.contains(node)) return null;
  return node.closest("td, th");
}

function ntsActiveTable(editable) {
  return ntsActiveTableCell(editable)?.closest("table") || ntsSelectionElement()?.closest?.("table");
}

function ntsRunTableAction(editable, action) {
  const cell = ntsActiveTableCell(editable);
  const table = cell?.closest("table") || ntsActiveTable(editable);
  if (!table) {
    showToast("Click inside a table first.");
    return;
  }
  const tbody = table.querySelector("tbody") || table;
  const activeCell = cell || tbody.querySelector("td, th");
  if (action === "addRow") {
    const baseRow = activeCell?.closest("tr") || tbody.rows[tbody.rows.length - 1];
    const cols = baseRow?.cells.length || 1;
    const tr = document.createElement("tr");
    for (let i = 0; i < cols; i++) {
      const td = document.createElement("td");
      td.innerHTML = "&nbsp;";
      tr.appendChild(td);
    }
    if (baseRow?.nextSibling) tbody.insertBefore(tr, baseRow.nextSibling);
    else tbody.appendChild(tr);
  } else if (action === "delRow" && tbody.rows.length > 1) {
    (activeCell?.closest("tr") || tbody.rows[tbody.rows.length - 1]).remove();
  } else if (action === "addCol") {
    const idx = activeCell ? activeCell.cellIndex + 1 : (tbody.rows[0]?.cells.length || 0);
    Array.from(tbody.rows).forEach(row => {
      const td = document.createElement("td");
      td.innerHTML = "&nbsp;";
      row.insertBefore(td, row.cells[idx] || null);
    });
  } else if (action === "delCol") {
    const colCount = tbody.rows[0]?.cells.length || 0;
    if (colCount > 1) {
      const idx = activeCell ? activeCell.cellIndex : colCount - 1;
      Array.from(tbody.rows).forEach(row => { if (row.cells[idx]) row.cells[idx].remove(); });
    }
  } else if (action === "mergeRight") {
    const right = activeCell?.nextElementSibling;
    if (activeCell && right) {
      activeCell.colSpan = (activeCell.colSpan || 1) + (right.colSpan || 1);
      activeCell.innerHTML = `${activeCell.innerHTML} ${right.innerHTML}`.trim();
      right.remove();
    }
  } else if (action === "cellBg") {
    const color = window.prompt("Cell background color (hex or CSS color):", "#fef08a");
    if (activeCell && color != null) activeCell.style.backgroundColor = color.trim();
  } else if (action === "sortColumn") {
    const idx = activeCell ? activeCell.cellIndex : 0;
    const rows = Array.from(tbody.rows);
    rows.sort((a, b) => (a.cells[idx]?.textContent || "").localeCompare(b.cells[idx]?.textContent || ""));
    rows.forEach(row => tbody.appendChild(row));
  } else if (action === "resizeCols") {
    const width = window.prompt("Column width in pixels:", "160");
    const px = Math.max(40, Number(width) || 160);
    const idx = activeCell ? activeCell.cellIndex : 0;
    Array.from(tbody.rows).forEach(row => { if (row.cells[idx]) row.cells[idx].style.width = `${px}px`; });
  }
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function ntsUpdateWordCount(toolbarRoot, editable) {
  if (!editable) return;
  const text = noteBodyPlain(editable.innerHTML);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;
  const tokens = ntsEstimateTokens(text);
  const mins = Math.max(1, Math.ceil(words / 200));
  const sel = window.getSelection();
  const selected = sel && editable.contains(sel.anchorNode) ? (sel.toString().trim().split(/\s+/).filter(Boolean).length || 0) : 0;
  const msg = `${words} word${words === 1 ? "" : "s"} · ${chars} chars · ≈ ${tokens} tokens · ${mins} min · selection ${selected}`;
  toolbarRoot?.querySelectorAll("[data-nts-wordcount]").forEach(el => { el.textContent = msg; });
  document.querySelectorAll(`[data-nts-wordcount-for="${editable.id}"]`).forEach(el => { el.textContent = msg; });
  ntsCheckEssayMilestones(editable, words);
}

const NTS_ESSAY_MILESTONE_THRESHOLDS = [500, 1500, 3000];

function ntsEssayMilestoneStorageKey(essayId, threshold) {
  return `essayMilestone:${essayId}:${threshold}`;
}

function ntsEssayMilestoneLabels(threshold) {
  if (threshold >= 3000) return { toast: "Essay epic unlocked", xp: 25 };
  if (threshold >= 1500) return { toast: "Essay deep dive", xp: 15 };
  return { toast: "Essay draft beacon", xp: 8 };
}

function ntsResolveEssayId(editable) {
  if (!editable) return null;
  if (editable.dataset?.id) return String(editable.dataset.id);
  if (editable.id?.startsWith("note-body-")) return editable.id.slice("note-body-".length);
  return null;
}

function ntsCheckEssayMilestones(editable, words) {
  if (ACTIVE_TAB !== "Essays") return;
  const essayId = ntsResolveEssayId(editable);
  if (!essayId) return;
  NTS_ESSAY_MILESTONE_THRESHOLDS.forEach(threshold => {
    if (words < threshold) return;
    const key = ntsEssayMilestoneStorageKey(essayId, threshold);
    if (localStorage.getItem(key)) return;
    try { localStorage.setItem(key, "1"); } catch (_) { return; }
    const meta = ntsEssayMilestoneLabels(threshold);
    if (typeof showToast === "function") showToast(`${meta.toast} — ${threshold.toLocaleString()} words`, "good");
    if (window.WaypointGame && typeof window.WaypointGame.awardXp === "function") {
      window.WaypointGame.awardXp(meta.xp, `${threshold} words`);
    }
  });
}

async function ntsExportDocx(title, html, text, basename) {
  const base = (basename || title || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "note";
  const res = await fetch("/api/export/docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ title: title || base, html, text }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function ntsPrintEditable(editable, title) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title || "note")}</title></head><body>${editable.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function ntsExportEditable(editable, format, basename) {
  const html = editable.innerHTML;
  const plain = noteBodyPlain(html);
  const base = (basename || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "note";
  if (format === "md") downloadMarkdown(`${base}.md`, `# ${basename || base}\n\n${plain}\n`);
  else if (format === "txt") downloadBlob(`${base}.txt`, plain, "text/plain");
  else if (format === "html") downloadBlob(`${base}.html`, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(basename || base)}</title></head><body>${html}</body></html>`, "text/html");
  else if (format === "docx") {
    ntsExportDocx(basename || base, html, plain, base).catch(err => showToast(errorMessage(err)));
  }
}

function ntsShowLinkPopover(chip, editable) {
  document.querySelectorAll(".nts-link-popover").forEach(p => p.remove());
  const pop = document.createElement("div");
  pop.className = "nts-link-popover";
  pop.innerHTML = `
    <input type="url" class="nts-link-pop-url" value="${escapeHtml(chip.dataset.url || chip.href)}" placeholder="URL">
    <input type="text" class="nts-link-pop-label" value="${escapeHtml(ntsLinkChipLabel(chip))}" placeholder="Label">
    <div class="nts-link-pop-actions">
      <button type="button" class="primary nts-link-pop-save">Save</button>
      <button type="button" class="secondary nts-link-pop-remove">Remove</button>
    </div>`;
  document.body.appendChild(pop);
  const rect = chip.getBoundingClientRect();
  pop.style.top = `${rect.bottom + window.scrollY + 4}px`;
  pop.style.left = `${rect.left + window.scrollX}px`;
  pop.querySelector(".nts-link-pop-save").onclick = () => {
    const url = ntsNormalizeLinkUrl(pop.querySelector(".nts-link-pop-url").value);
    const label = pop.querySelector(".nts-link-pop-label").value.trim() || ntsLinkLabel(url);
    if (url) {
      ntsSetLinkChipContent(chip, url, label);
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
    pop.remove();
  };
  pop.querySelector(".nts-link-pop-remove").onclick = () => {
    const text = document.createTextNode(ntsLinkChipLabel(chip));
    chip.replaceWith(text);
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    pop.remove();
  };
  const closeOnClick = e => {
    if (!pop.contains(e.target) && e.target !== chip) {
      pop.remove();
      document.removeEventListener("mousedown", closeOnClick);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", closeOnClick), 0);
}

function ntsShowTablePopover(table, editable, x, y, initialCell = null) {
  document.querySelectorAll(".nts-table-popover").forEach(p => p.remove());
  const pop = document.createElement("div");
  pop.className = "nts-table-popover";
  const swatches = NTS_TABLE_CELL_SWATCHES.map(c =>
  `<button type="button" class="nts-rt-swatch${c ? "" : " nts-rt-swatch-clear"}" data-bg="${c}" style="${c ? `background:${c};` : ""}" title="${c || "Clear"}"></button>`
  ).join("");
  pop.innerHTML = `
    <div class="nts-table-pop-row">
      <button type="button" data-tbl="addRow">+ Row</button>
      <button type="button" data-tbl="delRow">− Row</button>
      <button type="button" data-tbl="addCol">+ Col</button>
      <button type="button" data-tbl="delCol">− Col</button>
      <button type="button" data-tbl="mergeRight">Merge right</button>
      <button type="button" data-tbl="sortColumn">Sort column</button>
      <button type="button" data-tbl="resizeCols">Resize cols</button>
    </div>
    <div class="nts-table-pop-colors"><span class="nts-rt-label">Cell bg</span>${swatches}</div>`;
  pop.style.top = `${y}px`;
  pop.style.left = `${x}px`;
  document.body.appendChild(pop);
  let activeCell = initialCell;
  table.addEventListener("click", e => {
    if (e.target.tagName === "TD" || e.target.tagName === "TH") activeCell = e.target;
  }, { once: true });
  pop.querySelectorAll("[data-tbl]").forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.tbl;
      const tbody = table.querySelector("tbody") || table;
      if (action === "addRow") {
        const cols = tbody.rows[0]?.cells.length || 1;
        const tr = document.createElement("tr");
        for (let i = 0; i < cols; i++) {
          const td = document.createElement("td");
          td.innerHTML = "&nbsp;";
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      } else if (action === "delRow" && tbody.rows.length > 1) {
        const row = activeCell?.closest("tr") || tbody.rows[tbody.rows.length - 1];
        row.remove();
      } else if (action === "addCol") {
        Array.from(tbody.rows).forEach(row => {
          const td = document.createElement("td");
          td.innerHTML = "&nbsp;";
          row.appendChild(td);
        });
      } else if (action === "delCol") {
        const colCount = tbody.rows[0]?.cells.length || 0;
        if (colCount > 1) {
          const idx = activeCell ? activeCell.cellIndex : colCount - 1;
          Array.from(tbody.rows).forEach(row => { if (row.cells[idx]) row.cells[idx].remove(); });
        }
      } else if (action === "mergeRight") {
        const right = activeCell?.nextElementSibling;
        if (activeCell && right) {
          activeCell.colSpan = (activeCell.colSpan || 1) + (right.colSpan || 1);
          activeCell.innerHTML = `${activeCell.innerHTML} ${right.innerHTML}`.trim();
          right.remove();
        }
      } else if (action === "sortColumn") {
        const idx = activeCell ? activeCell.cellIndex : 0;
        Array.from(tbody.rows)
          .sort((a, b) => (a.cells[idx]?.textContent || "").localeCompare(b.cells[idx]?.textContent || ""))
          .forEach(row => tbody.appendChild(row));
      } else if (action === "resizeCols") {
        const width = window.prompt("Column width in pixels:", "160");
        const px = Math.max(40, Number(width) || 160);
        const idx = activeCell ? activeCell.cellIndex : 0;
        Array.from(tbody.rows).forEach(row => { if (row.cells[idx]) row.cells[idx].style.width = `${px}px`; });
      }
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    };
  });
  pop.querySelectorAll("[data-bg]").forEach(btn => {
    btn.onclick = () => {
      if (activeCell) activeCell.style.backgroundColor = btn.dataset.bg || "";
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    };
  });
  const closeOnClick = e => {
    if (!pop.contains(e.target)) {
      pop.remove();
      document.removeEventListener("mousedown", closeOnClick);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", closeOnClick), 0);
}

function ntsBuildOutline(editable) {
  const headings = editable.querySelectorAll("h1, h2, h3");
  const items = [];
  headings.forEach((h, i) => {
    const id = h.id || `nts-h-${i}`;
    if (!h.id) h.id = id;
    const level = h.tagName.toLowerCase();
    const text = (h.textContent || "").trim() || "(empty heading)";
    items.push({ id, level, text });
  });
  return items;
}

function ntsRenderOutline(outlineEl, editable) {
  const items = ntsBuildOutline(editable);
  if (!items.length) {
    outlineEl.innerHTML = '<p class="stub">No headings yet — add H1, H2, or H3.</p>';
    return;
  }
  outlineEl.innerHTML = items.map(it =>
    `<button type="button" class="nts-outline-item nts-outline-${it.level}" data-target="${escapeHtml(it.id)}">${escapeHtml(it.text)}</button>`
  ).join("");
  outlineEl.querySelectorAll(".nts-outline-item").forEach(btn => {
    btn.onclick = () => {
      const target = editable.querySelector(`#${CSS.escape(btn.dataset.target)}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
}

function ntsIsLongNote(body) {
  return noteBodyPlain(body).length >= 800;
}

function ntsFsToolbarHtml() {
  return typeof RICH_TOOLBAR_HTML !== "undefined" ? RICH_TOOLBAR_HTML : "";
}

function ntsFsCopyToClipboard(text) {
  if (!navigator.clipboard) {
    showToast("Clipboard is not available in this browser.");
    return Promise.reject(new Error("clipboard unavailable"));
  }
  return navigator.clipboard.writeText(text);
}

function openNtsFullscreenEditor(editableId, options = {}) {
  const original = document.getElementById(editableId);
  if (!original) return;
  const withOutline = !!options.withOutline;
  const noteId = options.noteId;
  const listType = options.listType;
  const basename = (options.basename || options.title || "essay").trim() || "essay";
  const initialTitle = options.title != null
    ? options.title
    : (noteId
      ? document.querySelector(`.note-title-edit[data-id="${noteId}"]`)?.value
      : document.getElementById(options.titleTargetId || "note-title")?.value) || "";
  const toolbarHtml = ntsFsToolbarHtml();
  const overlay = document.createElement("div");
  overlay.className = "wf-code-modal-overlay nts-fs-overlay";
  overlay.innerHTML = `
    <div class="wf-code-modal nts-fs-modal nts-fs-docs" role="dialog" aria-modal="true" aria-label="Full-screen editor" style="width:min(1100px, 96vw); height:92vh;">
      <div class="nts-fs-topbar">
        <input type="text" id="nts-fs-title" class="nts-fs-title" value="${escapeHtml(initialTitle).replace(/"/g, "&quot;")}" placeholder="Untitled" aria-label="Document title">
        <span class="nts-fs-save-state" id="nts-fs-save-state">${noteId ? "Autosaves after edits" : "Draft — use Save on the card to persist"}</span>
        <div class="nts-fs-topbar-actions">
          <button type="button" class="secondary nts-fs-export" data-export-action="copy-html" title="Copy HTML to clipboard">Copy HTML</button>
          <button type="button" class="secondary nts-fs-export" data-export-action="copy-text" title="Copy plain text to clipboard">Copy text</button>
          <button type="button" class="secondary nts-fs-export" data-export-action="download-txt" title="Download plain text file">Download .txt</button>
          <button type="button" class="secondary nts-fs-export" data-export-action="download-md" title="Download Markdown file">Download .md</button>
          <button type="button" class="secondary nts-fs-export" data-export-action="download-html" title="Download HTML file">Download .html</button>
          <button type="button" class="secondary nts-fs-export" data-export-action="download-docx" title="Download Word document">Download .docx</button>
          <button type="button" class="secondary nts-fs-export" data-export-action="print-pdf" title="Print or save as PDF">PDF print</button>
          <button type="button" class="primary" id="nts-fs-save">Save</button>
          <button type="button" class="secondary" id="nts-fs-close">Close</button>
        </div>
      </div>
      <div class="nts-fs-layout">
        ${withOutline ? '<aside class="nts-fs-outline" id="nts-fs-outline"><strong class="nts-fs-outline-label">Outline</strong></aside>' : ""}
        <div class="nts-fs-main">
          <div class="nts-fs-toolbar-wrap" data-rich-for="nts-fullscreen-editable">${toolbarHtml}</div>
          <div class="nts-fs-page">
            <div id="nts-fullscreen-editable" class="rich-editable nts-fs-editable" contenteditable="true">${original.innerHTML}</div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const fsEditable = document.getElementById("nts-fullscreen-editable");
  const outlineEl = document.getElementById("nts-fs-outline");
  const titleInput = document.getElementById("nts-fs-title");
  const saveStateEl = document.getElementById("nts-fs-save-state");
  let autosaveTimer = null;
  let closed = false;

  if (typeof wireRichToolbar === "function") {
    wireRichToolbar("nts-fullscreen-editable");
    const nestedFsBtn = document.querySelector('[data-rich-for="nts-fullscreen-editable"] .rich-fullscreen-btn');
    if (nestedFsBtn) nestedFsBtn.style.display = "none";
  }

  const syncTitleToSource = () => {
    if (noteId) {
      const cardTitle = document.querySelector(`.note-title-edit[data-id="${noteId}"]`);
      if (cardTitle) cardTitle.value = titleInput.value;
    } else if (options.titleTargetId) {
      const composerTitle = document.getElementById(options.titleTargetId);
      if (composerTitle) composerTitle.value = titleInput.value;
    }
  };

  const syncBodyToSource = () => {
    original.innerHTML = fsEditable.innerHTML;
    original.dispatchEvent(new Event("input", { bubbles: true }));
    if (outlineEl) ntsRenderOutline(outlineEl, fsEditable);
  };

  const syncAll = () => {
    syncBodyToSource();
    syncTitleToSource();
  };

  const persistNote = async (silent = false) => {
    syncAll();
    if (!noteId || !listType) {
      if (!silent) saveStateEl.textContent = "Synced to card — use Save there to persist";
      return;
    }
    clearTimeout(NOTE_AUTOSAVE_TIMERS[noteId]);
    const title = titleInput.value.trim();
    const body = fsEditable.innerHTML.trim();
    saveStateEl.textContent = "Saving…";
    try {
      await api(`/api/lists/${listType}/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const item = LAST_NOTE_ITEMS.find(i => String(i.id) === String(noteId));
      if (item) {
        item.title = title;
        item.body = body;
      }
      showNoteSavedIndicator(noteId);
      saveStateEl.textContent = silent ? "Saved" : "Saved";
    } catch (err) {
      saveStateEl.textContent = "Save failed";
      if (!silent) showToast(errorMessage(err));
    }
  };

  const scheduleAutosave = () => {
    if (!noteId || !listType) return;
    clearTimeout(autosaveTimer);
    saveStateEl.textContent = "Unsaved changes…";
    autosaveTimer = setTimeout(() => persistNote(true), 1500);
  };

  fsEditable.addEventListener("input", () => {
    syncBodyToSource();
    scheduleAutosave();
  });
  titleInput.addEventListener("input", () => {
    syncTitleToSource();
    scheduleAutosave();
  });

  overlay.querySelectorAll("[data-export-action]").forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.exportAction;
      const docTitle = titleInput.value.trim() || basename;
      const plain = noteBodyPlain(fsEditable.innerHTML);
      const slug = docTitle.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "note";
      try {
        if (action === "copy-html") {
          await ntsFsCopyToClipboard(fsEditable.innerHTML);
          if (typeof showToast === "function") showToast("HTML copied", "info");
        } else if (action === "copy-text") {
          await ntsFsCopyToClipboard(plain);
          if (typeof showToast === "function") showToast("Plain text copied", "info");
        } else if (action === "download-txt") {
          ntsExportEditable(fsEditable, "txt", docTitle);
        } else if (action === "download-md") {
          ntsExportEditable(fsEditable, "md", docTitle);
        } else if (action === "download-html") {
          ntsExportEditable(fsEditable, "html", docTitle);
        } else if (action === "download-docx") {
          await ntsExportDocx(docTitle, fsEditable.innerHTML, plain, slug);
          if (typeof showToast === "function") showToast("DOCX downloaded", "info");
        } else if (action === "print-pdf") {
          ntsPrintEditable(fsEditable, docTitle);
        }
      } catch (_) {
        showToast("Export failed — clipboard may be blocked.");
      }
    };
  });

  if (outlineEl) ntsRenderOutline(outlineEl, fsEditable);

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(autosaveTimer);
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const onKeyDown = e => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  document.getElementById("nts-fs-close").onclick = close;
  document.getElementById("nts-fs-save").onclick = () => persistNote(false);
  titleInput.focus();
  titleInput.select();
}

function wireNtsRichToolbar(editableId, options = {}) {
  const editable = document.getElementById(editableId);
  const toolbarRoot = document.querySelector(`[data-rich-for="${editableId}"] .nts-rich-toolbar`)
    || document.querySelector(`[data-rich-for="${editableId}"]`);
  if (!editable || !toolbarRoot) return;

  const titleEl = toolbarRoot.querySelector("[data-nts-doc-title]");
  if (titleEl) titleEl.textContent = options.docTitle || options.basename || "Untitled";
  const saveEl = toolbarRoot.querySelector("[data-nts-save-state]");
  if (saveEl) saveEl.textContent = options.saveState || (options.itemId ? "Autosaves after edits" : "Draft not saved yet");

  toolbarRoot.querySelectorAll("button[data-cmd]").forEach(btn => {
    btn.onclick = () => {
      ntsExec(editable, btn.dataset.cmd, btn.dataset.value || null);
      ntsUpdateWordCount(toolbarRoot, editable);
    };
  });

  toolbarRoot.querySelectorAll("button[data-cmd][data-value]").forEach(btn => {
    btn.onclick = () => {
      ntsExec(editable, btn.dataset.cmd, btn.dataset.value);
      ntsUpdateWordCount(toolbarRoot, editable);
    };
  });

  toolbarRoot.querySelectorAll("select[data-cmd]").forEach(sel => {
    sel.onchange = () => {
      if (!sel.value) return;
      if (sel.dataset.cmd === "formatBlock") {
        const meta = NTS_HEADING_BLOCKS[Number(sel.value)] || NTS_HEADING_BLOCKS.find(h => h.tag === sel.value);
        if (meta?.style) {
          ntsExec(editable, "formatBlock", `<${meta.tag}>`);
          const sel2 = window.getSelection();
          let node = sel2?.anchorNode;
          if (node?.nodeType === 3) node = node.parentElement;
          const block = node?.closest(meta.tag);
          if (block) block.setAttribute("style", meta.style);
        } else {
          ntsExec(editable, "formatBlock", `<${sel.value}>`);
        }
      } else if (sel.dataset.cmd === "fontFamily") {
        ntsApplyFontFamily(editable, sel.value);
      }
      sel.value = "";
      ntsUpdateWordCount(toolbarRoot, editable);
    };
  });

  toolbarRoot.querySelectorAll("input[type=color][data-cmd]").forEach(inp => {
    inp.oninput = () => {
      ntsExec(editable, inp.dataset.cmd, inp.value);
      ntsUpdateWordCount(toolbarRoot, editable);
    };
  });

  const fontSizeInput = toolbarRoot.querySelector("[data-action=fontSize]");
  if (fontSizeInput) {
    const applySize = () => ntsApplyFontSize(editable, fontSizeInput.value);
    fontSizeInput.onchange = applySize;
    toolbarRoot.querySelector("[data-action=fontSizeDec]")?.addEventListener("click", () => {
      fontSizeInput.value = Math.max(8, Number(fontSizeInput.value) - 1);
      applySize();
    });
    toolbarRoot.querySelector("[data-action=fontSizeInc]")?.addEventListener("click", () => {
      fontSizeInput.value = Math.min(72, Number(fontSizeInput.value) + 1);
      applySize();
    });
  }

  toolbarRoot.querySelector("[data-action=lineHeight]")?.addEventListener("change", e => {
    if (e.target.value) ntsApplyLineHeight(editable, e.target.value);
    e.target.value = "";
  });

  toolbarRoot.querySelector("[data-action=paragraphSpacing]")?.addEventListener("change", e => {
    if (e.target.value !== "") ntsApplyParagraphSpacing(editable, e.target.value);
    e.target.value = "";
  });

  toolbarRoot.querySelector("[data-action=inlineCode]")?.addEventListener("click", () => {
    ntsFocusEditable(editable);
    const sel = window.getSelection();
    const text = sel?.toString() || "code";
    document.execCommand("insertHTML", false, `<code class="nts-inline-code">${escapeHtml(text)}</code>`);
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  });

  toolbarRoot.querySelector("[data-action=codeBlock]")?.addEventListener("click", () => {
    ntsFocusEditable(editable);
    const sel = window.getSelection();
    const text = sel?.toString() || "code";
    document.execCommand("insertHTML", false, `<pre><code>${escapeHtml(text)}</code></pre><p><br></p>`);
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  });

  toolbarRoot.querySelector("[data-action=checklist]")?.addEventListener("click", () => ntsInsertChecklist(editable));

  toolbarRoot.querySelector("[data-action=link]")?.addEventListener("click", () => {
    const url = window.prompt("Link URL:");
    if (!url) return;
    ntsInsertLinkChip(editable, url);
  });

  toolbarRoot.querySelector("[data-action=image]")?.addEventListener("click", () => {
    const url = window.prompt("Paste an image URL, or leave blank to upload local image(s):");
    if (url) {
      ntsInsertImageFigure(editable, url.trim());
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const picked = Array.from(input.files || []);
      if (!picked.length) return;
      const { successes, failures } = await uploadAttachmentFiles(picked, {
        entity_type: "rich_image",
        entity_id: "0",
        onProgress: (cur, total) => {
          if (typeof showToast === "function") showToast(`Uploading image ${cur}/${total}…`, "info");
        },
      });
      successes.forEach(({ data }) => {
        ntsInsertImageFigure(editable, `/api/attachments/${data.id}/file`);
      });
      if (failures.length) showToast(formatUploadResultMessage(successes, failures));
    };
    input.click();
  });

  toolbarRoot.querySelector("[data-action=attachment]")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async () => {
      const picked = Array.from(input.files || []);
      if (!picked.length) return;
      const { successes, failures } = await uploadAttachmentFiles(picked, {
        entity_type: "rich_attachment",
        entity_id: "0",
        onProgress: (cur, total) => {
          if (typeof showToast === "function") showToast(`Uploading ${cur}/${total}…`, "info");
        },
      });
      successes.forEach(({ file, data }) => {
        ntsInsertLinkChip(editable, `/api/attachments/${data.id}/file`, file.name);
      });
      if (failures.length) showToast(formatUploadResultMessage(successes, failures));
    };
    input.click();
  });

  toolbarRoot.querySelector("[data-action=date]")?.addEventListener("click", () => {
    ntsFocusEditable(editable);
    document.execCommand("insertText", false, new Date().toLocaleDateString());
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  });

  toolbarRoot.querySelector("[data-action=duplicateNote]")?.addEventListener("click", () => {
    if (options.onDuplicate) options.onDuplicate();
    else showToast("Duplicate is available after a saved list item is loaded.");
  });

  toolbarRoot.querySelectorAll("[data-table-action]").forEach(btn => {
    btn.addEventListener("click", () => ntsRunTableAction(editable, btn.dataset.tableAction));
  });

  const tableWrap = toolbarRoot.querySelector(".nts-rt-table-wrap");
  const gridEl = toolbarRoot.querySelector(".nts-rt-table-grid");
  if (tableWrap && gridEl) {
    let gridHtml = "";
    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 8; c++) {
        gridHtml += `<button type="button" class="nts-grid-cell" data-r="${r}" data-c="${c}" title="${r}×${c}"></button>`;
      }
    }
    gridEl.innerHTML = gridHtml;
    tableWrap.querySelector("[data-action=table]")?.addEventListener("click", e => {
      e.stopPropagation();
      gridEl.style.display = gridEl.style.display === "none" ? "grid" : "none";
    });
    gridEl.querySelectorAll(".nts-grid-cell").forEach(cell => {
      cell.addEventListener("mouseenter", () => {
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        gridEl.querySelectorAll(".nts-grid-cell").forEach(g => {
          g.classList.toggle("nts-grid-active", Number(g.dataset.r) <= r && Number(g.dataset.c) <= c);
        });
      });
      cell.addEventListener("click", () => {
        ntsInsertTable(editable, Number(cell.dataset.r), Number(cell.dataset.c));
        gridEl.style.display = "none";
      });
    });
    document.addEventListener("click", () => { gridEl.style.display = "none"; });
  }

  const exportBtn = toolbarRoot.querySelector("[data-action=exportMenu]");
  const exportMenu = toolbarRoot.querySelector(".nts-rt-menu");
  if (exportBtn && exportMenu) {
    exportBtn.onclick = e => {
      e.stopPropagation();
      exportMenu.style.display = exportMenu.style.display === "none" ? "flex" : "none";
    };
    exportMenu.querySelectorAll("[data-export]").forEach(btn => {
      btn.onclick = () => {
        ntsExportEditable(editable, btn.dataset.export, options.basename);
        exportMenu.style.display = "none";
      };
    });
    document.addEventListener("click", () => { exportMenu.style.display = "none"; });
  }

  toolbarRoot.querySelectorAll("[data-export]").forEach(btn => {
    btn.addEventListener("click", () => ntsExportEditable(editable, btn.dataset.export, options.basename || options.docTitle));
  });

  toolbarRoot.querySelector("[data-action=printPdf]")?.addEventListener("click", () => {
    ntsPrintEditable(editable, options.basename || options.docTitle || "note");
  });

  toolbarRoot.querySelector("[data-action=outlineRefresh]")?.addEventListener("click", () => {
    const outlineEl = options.outlineEl || document.getElementById("nts-fs-outline");
    if (outlineEl) ntsRenderOutline(outlineEl, editable);
    else showToast("Open an essay in fullscreen to use the outline panel.");
  });

  const fsBtn = toolbarRoot.querySelector(".nts-rt-fullscreen");
  if (fsBtn && options.onFullscreen !== null) {
    fsBtn.onclick = () => {
      if (options.onFullscreen) options.onFullscreen();
      else openNtsFullscreenEditor(editableId, { withOutline: options.withOutline, basename: options.basename });
    };
  } else if (fsBtn && editableId === "nts-fullscreen-editable") {
    fsBtn.style.display = "none";
  }

  editable.addEventListener("input", () => ntsUpdateWordCount(toolbarRoot, editable));
  editable.addEventListener("paste", e => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type && (item.type === "image/png" || item.type === "image/jpeg" || item.type === "image/webp" || item.type.startsWith("image/"))) {
          e.preventDefault();
          e.stopPropagation();
          const file = item.getAsFile();
          const insert = async () => {
            let url = "";
            if (typeof window.wpResolvePastedImage === "function") {
              url = await window.wpResolvePastedImage(file);
            } else {
              try { url = URL.createObjectURL(file); } catch (_) { url = ""; }
              if (!url) {
                url = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result || ""));
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(file);
                }).catch(() => "");
              }
            }
            if (url) ntsInsertImageFigure(editable, url);
            else if (typeof window.wpHidePasteVoids === "function") window.wpHidePasteVoids(editable);
            else if (typeof showToast === "function") showToast("Could not save pasted image", "warn");
          };
          insert();
          return;
        }
      }
    }
    const html = e.clipboardData?.getData("text/html") || "";
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      e.preventDefault();
      ntsInsertImageFigure(editable, imgMatch[1].replace(/&amp;/g, "&"));
      return;
    }
    const text = e.clipboardData?.getData("text/plain")?.trim();
    if (text && ntsIsUrl(text)) {
      e.preventDefault();
      ntsInsertLinkChip(editable, text);
    }
  });
  editable.addEventListener("click", e => {
    const chip = e.target.closest(".nts-link-chip");
    if (chip) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        window.open(chip.href, "_blank", "noopener");
        return;
      }
      ntsShowLinkPopover(chip, editable);
      return;
    }
    const imgBtn = e.target.closest("[data-img-align], [data-img-remove]");
    if (imgBtn) {
      const fig = imgBtn.closest(".nts-image-figure");
      if (imgBtn.dataset.imgRemove) fig?.remove();
      else if (fig) {
        fig.classList.remove("nts-img-left", "nts-img-center", "nts-img-right");
        fig.classList.add(`nts-img-${imgBtn.dataset.imgAlign}`);
      }
      editable.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const table = e.target.closest("table.nts-table");
    if (table && e.target.closest("td, th")) {
      ntsShowTablePopover(table, editable, e.clientX, e.clientY + window.scrollY, e.target.closest("td, th"));
    }
    const li = e.target.closest(".nts-checklist li");
    if (li && e.target.type === "checkbox") {
      li.classList.toggle("nts-check-done", e.target.checked);
      editable.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  document.addEventListener("selectionchange", () => ntsUpdateWordCount(toolbarRoot, editable));
  ntsUpdateWordCount(toolbarRoot, editable);
}

function wireNotesToolbar(editableId, options = {}) {
  return wireNtsRichToolbar(editableId, options);
}

// Injected once into <head> under a fixed id; callers embed the empty return value in their
// markup, so re-renders no longer stack duplicate copies of this sheet.
function ensureNotesScopedStyles() {
  if (document.getElementById("nts-scoped-styles")) return;
  const style = document.createElement("style");
  style.id = "nts-scoped-styles";
  style.textContent = notesScopedCss();
  document.head.appendChild(style);
}

function notesScopedStyles() {
  ensureNotesScopedStyles();
  return "";
}

function notesScopedCss() {
  return `
.nts-list-app-shell,
.nts-app-skill, .nts-app-problem, .nts-app-thinking, .nts-app-funny, .nts-app-essay, .nts-app-repository {
  --nts-app-accent: var(--accent);
  --nts-chip-accent: var(--accent);
}
.nts-list-switcher {
  /* Near-black ink keeps the accent-filled pill legible on Capture's gold accent, where
     white-on-accent falls under 3:1. */
  --nts-pill-ink: color-mix(in srgb, var(--accent) 12%, #14110c);
  position: sticky;
  top: 0;
  z-index: 130;
  margin: 0 0 10px;
  padding: 5px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--gridline));
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
  backdrop-filter: blur(8px);
}
body[data-workspace="capture"] .nts-list-switcher { top: 48px; }
body[data-workspace="capture"] #nav.tab-chip-bar { display: none !important; }
.nts-list-switcher-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.nts-list-rail {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.nts-list-rail::-webkit-scrollbar { display: none; }
.nts-pill {
  flex: 0 0 auto;
  width: auto;
  scroll-snap-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 5px 14px;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--gridline));
  background: transparent;
  color: var(--ink-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.nts-pill:hover {
  color: var(--ink-primary);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--gridline));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.nts-pill--active {
  font-weight: 700;
  color: var(--nts-pill-ink);
  border-color: color-mix(in srgb, var(--accent) 85%, var(--ink-primary));
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 90%, #fff 10%), var(--accent));
  box-shadow: 0 1px 6px color-mix(in srgb, var(--accent) 28%, transparent);
}
.nts-pill-count {
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--ink-muted);
  background: color-mix(in srgb, var(--bg-shell) 70%, transparent);
}
.nts-pill--active .nts-pill-count {
  color: var(--nts-pill-ink);
  background: color-mix(in srgb, #fff 40%, transparent);
}
.nts-list-nav-btn {
  flex: 0 0 auto;
  /* aspect-ratio instead of a fixed width so the button stays a circle when the comfortable
     density preference raises min-height on every button. */
  height: 36px;
  width: auto;
  aspect-ratio: 1 / 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--gridline));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-card));
  color: var(--ink-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.nts-list-nav-btn:hover:not(:disabled) {
  color: var(--ink-primary);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-card));
}
.nts-list-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.nts-pill:focus-visible,
.nts-list-nav-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}
@media (max-width: 560px) {
  .nts-pill { padding: 5px 11px; }
  .nts-list-switcher { padding: 4px 5px; }
}
@media (prefers-reduced-motion: reduce) {
  .nts-pill { transition: none; }
}
.nts-app-identity {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 10px;
  padding:10px 14px; margin-bottom:0;
  border-left:4px solid var(--nts-app-accent);
  border-radius: 0 10px 10px 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--nts-app-accent) 14%, var(--bg-card)) 0%,
    color-mix(in srgb, var(--nts-app-accent) 5%, var(--bg-card)) 42%,
    var(--bg-card) 100%
  );
  box-shadow: 0 1px 0 color-mix(in srgb, var(--nts-app-accent) 10%, transparent) inset;
}
.nts-app-identity-main { min-width:0; flex:1; }
.nts-app-kicker { font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--nts-app-accent); font-weight:700; }
.nts-app-identity h2 { margin:0; font-size:15px; line-height:1.2; }
.nts-app-identity .nts-app-intent { margin:2px 0 0; font-size:11px; line-height:1.35; color:var(--ink-muted); }
.nts-app-meta { display:block; margin-top:2px; font-size:10px; color:var(--ink-muted); }
.nts-app-identity .nts-identity-action {
  flex-shrink:0; font-size:11px; padding:4px 10px; white-space:nowrap;
}
.nts-spark-preview {
  flex-basis:100%; width:100%; margin-top:0; padding:6px 8px; border-radius:6px; font-size:11px;
  background:color-mix(in srgb, var(--nts-app-accent) 10%, var(--bg-shell)); font-weight:600;
}
.note-card.done, .nts-sheet-row.done {
  border-left: 4px solid var(--status-good, #3d9970);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--status-good, #3d9970) 14%, var(--bg-card)) 0%,
    color-mix(in srgb, var(--status-good, #3d9970) 6%, var(--bg-card)) 100%
  );
}
.note-card.done .note-title-edit {
  color: var(--status-good, #3d9970);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--status-good, #3d9970) 45%, transparent);
}
.note-card.nts-view-compact.done .note-title-edit {
  color: var(--status-good, #3d9970);
}
.nts-sheet-row.done .nts-sheet-title {
  color: var(--status-good, #3d9970);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--status-good, #3d9970) 40%, transparent);
}
.nts-done-pill {
  color: var(--status-good, #3d9970);
  border-color: color-mix(in srgb, var(--status-good, #3d9970) 35%, var(--gridline));
  background: color-mix(in srgb, var(--status-good, #3d9970) 12%, var(--bg-card));
}
.nts-list-app-shell .note-card:not(.done) {
  border-left: 3px solid color-mix(in srgb, var(--nts-app-accent) 55%, var(--gridline));
}
.nts-list-app-shell .note-card:not(.done):hover,
.nts-list-app-shell .note-card:not(.done):focus-within {
  border-left-color: var(--nts-app-accent);
  box-shadow: -2px 0 0 color-mix(in srgb, var(--nts-app-accent) 22%, transparent);
}
.nts-list-app-shell .nts-sheet-row:not(.done) td:first-child + td {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--nts-app-accent) 45%, transparent);
}
.nts-empty-msg {
  margin: 8px 0 0;
  padding: 14px 14px 14px 16px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--nts-app-accent) 55%, var(--ink-muted));
  border: 1px dashed color-mix(in srgb, var(--nts-app-accent) 28%, var(--gridline));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--nts-app-accent) 12%, var(--bg-shell)) 0%,
    color-mix(in srgb, var(--nts-app-accent) 5%, var(--bg-card)) 100%
  );
}
.nts-sheet-wrap .nts-empty-msg { border-style: dashed; }
.nts-import-doc-card { padding: 10px 12px; }
.nts-import-doc-card strong { font-size: 13px; }
.nts-import-doc-card .stub { font-size: 11px; margin-top: 2px !important; }
.nts-essay-outline-panel {
  grid-column:1 / -1; display:grid; gap:8px; padding-top:8px;
  border-top:1px dashed color-mix(in srgb, var(--nts-app-accent) 28%, var(--gridline));
}
.nts-essay-outline-card { background:var(--bg-shell); border-radius:8px; padding:8px 10px; }
.nts-essay-outline-card summary { cursor:pointer; font-weight:700; }
.nts-composer-card {
  border-color:color-mix(in srgb, var(--nts-app-accent) 30%, var(--gridline));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--nts-app-accent) 8%, var(--bg-card)) 0%,
    var(--bg-card) 72%
  );
  box-shadow: 0 1px 0 color-mix(in srgb, var(--nts-app-accent) 10%, transparent) inset;
}
.nts-composer-card .rich-editable,
.nts-composer-card #note-body {
  max-height: min(36vh, 280px);
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--nts-app-accent) 18%, var(--gridline));
  border-radius: 8px;
  background: color-mix(in srgb, var(--nts-app-accent) 3%, var(--bg-card));
}
.nts-composer-card .nts-composer-actions {
  position: sticky; bottom: 0; padding-top: 8px; margin-top: 4px;
  background: linear-gradient(180deg, transparent, var(--bg-card) 35%);
  z-index: 2;
}
.nts-toolbar {
  display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:0;
  border-color: color-mix(in srgb, var(--nts-app-accent) 16%, var(--gridline));
  background: color-mix(in srgb, var(--nts-app-accent) 4%, var(--bg-card));
}
.nts-search {
  flex:1; min-width:160px;
  border-color: color-mix(in srgb, var(--nts-app-accent) 20%, var(--gridline));
  background: color-mix(in srgb, var(--nts-app-accent) 3%, var(--bg-card));
}
.nts-filter-chips, .nts-view-toggle { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
.nts-chip, .nts-view-btn, .nts-select-toggle {
  font-size:12px; padding:4px 10px; border-radius:999px; cursor:pointer;
  border:1px solid color-mix(in srgb, var(--nts-app-accent) 14%, var(--gridline));
  background:color-mix(in srgb, var(--nts-app-accent) 4%, var(--bg-card));
  color:var(--ink-secondary);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.nts-chip:hover, .nts-view-btn:hover, .nts-select-toggle:hover {
  border-color: color-mix(in srgb, var(--nts-app-accent) 35%, var(--gridline));
  color: var(--ink-primary);
}
.nts-chip.active, .nts-view-btn.active, .nts-select-toggle.active {
  border-color:var(--nts-app-accent);
  color:color-mix(in srgb, var(--nts-app-accent) 75%, var(--ink-primary));
  background:color-mix(in srgb, var(--nts-app-accent) 14%, var(--bg-card));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--nts-app-accent) 18%, transparent);
}
.nts-inbox-banner {
  border-left:4px solid var(--nts-app-accent);
  background:linear-gradient(
    90deg,
    color-mix(in srgb, var(--nts-app-accent) 12%, var(--bg-card)) 0%,
    color-mix(in srgb, var(--nts-app-accent) 4%, var(--bg-card)) 100%
  );
  padding:10px 12px; margin-bottom:0;
}
.nts-inbox-banner strong { display:block; margin-bottom:2px; }
.nts-saved-indicator {
  font-size:10px; color:var(--status-success, #3d9970); opacity:0; transition:opacity 180ms ease;
  margin-left:4px; flex-shrink:0;
}
.nts-saved-indicator.nts-saved-visible { opacity:1; }
.skill-practice-meta:empty { display:none; }
.skill-practice-meta {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:7px;
  color:var(--ink-muted); font-size:10px;
}
.skill-trend-spark { color:var(--nts-app-accent); display:inline-flex; align-items:center; gap:4px; }
.note-card.skill-map-selected {
  outline:2px solid color-mix(in srgb, var(--nts-app-accent) 70%, transparent);
  outline-offset:2px;
  box-shadow:0 0 0 4px color-mix(in srgb, var(--nts-app-accent) 12%, transparent);
}
.note-card-header { display:flex; justify-content:space-between; align-items:start; gap:8px; }
.note-group { display:flex; flex-direction:column; gap:12px; }
.note-card.nts-view-list {
  min-height:132px; margin-bottom:0; padding:14px 16px;
  display:flex; flex-direction:column; gap:0;
}
.note-card.nts-view-list .note-title-edit {
  font-size:15px; font-weight:700; color:var(--ink-primary); letter-spacing:-0.01em;
}
.note-card.nts-view-list .note-body-edit {
  min-height:56px; max-height:120px; overflow:hidden; font-size:13px; line-height:1.5;
  color:var(--ink-secondary);
}
.note-card.nts-view-list [data-rich-for] {
  opacity:0; max-height:0; overflow:hidden; margin:0 !important; pointer-events:none;
  transition:opacity 140ms ease, max-height 180ms ease;
}
.note-card.nts-view-list:hover [data-rich-for],
.note-card.nts-view-list:focus-within [data-rich-for] {
  opacity:1; max-height:120px; margin-top:6px !important; pointer-events:auto;
}
.note-card.nts-view-list .note-card-footer {
  opacity:0; max-height:0; overflow:hidden; margin:0 !important; pointer-events:none;
  transition:opacity 140ms ease, max-height 180ms ease;
}
.note-card.nts-view-list:hover .note-card-footer,
.note-card.nts-view-list:focus-within .note-card-footer {
  opacity:1; max-height:48px; margin-top:8px !important; pointer-events:auto;
}
.note-card.nts-view-list .note-card-actions button:not(.note-delete) {
  opacity:0; transition:opacity 140ms ease;
}
.note-card.nts-view-list:hover .note-card-actions button:not(.note-delete),
.note-card.nts-view-list:focus-within .note-card-actions button:not(.note-delete) {
  opacity:1;
}
.note-bulk-check { flex-shrink:0; display:none; }
.nts-select-mode .note-bulk-check { display:inline-block; }
.nts-classify-row {
  display:flex; align-items:center; gap:8px; margin-top:8px; padding-top:8px;
  border-top:1px dashed var(--gridline); font-size:12px;
}
.nts-classify-row select { font-size:12px; max-width:160px; }
.nts-classify-feedback { font-size:11px; color:var(--status-success, #3d9970); margin-left:4px; }
.note-card.nts-view-compact { padding:6px 10px; margin-top:4px; }
.note-compact-row { display:flex; align-items:center; gap:8px; flex-wrap:nowrap; }
.note-compact-row .note-title-edit {
  flex:1; min-width:0; font-weight:600; border:none; background:transparent;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.note-compact-row .note-body-wrap,
.note-compact-row .note-card-footer,
.note-compact-row .nts-classify-row,
.note-compact-row [data-rich-for] { display:none !important; }
.nts-compact-pills { display:flex; gap:4px; flex-shrink:0; align-items:center; }
.nts-compact-actions { display:flex; gap:4px; flex-shrink:0; }
.note-card.nts-essay-card { cursor:pointer; }
.note-card.nts-essay-card .note-body-edit { min-height:48px; max-height:120px; overflow:hidden; }
.nts-bulk-bar {
  position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:200;
  display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:999px;
  background:var(--bg-card); border:1px solid var(--gridline);
  box-shadow:0 4px 24px color-mix(in srgb, var(--ink-primary) 18%, transparent);
}
.nts-bulk-bar button { font-size:12px; }
.nts-bulk-count { font-size:12px; font-weight:600; white-space:nowrap; }
.note-group.nts-view-compact-group .note-card.nts-view-list { display:none; }
.note-group:not(.nts-view-compact-group) .note-card.nts-view-compact { display:none; }
.note-group.nts-view-table-group .note-card { display:none !important; }
.nts-toolbar-inline {
  display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-bottom:4px;
}
.nts-toolbar-inline .nts-rt-fullscreen { margin-left:auto; }
.nts-rich-toolbar {
  display:flex; flex-wrap:wrap; gap:4px; align-items:flex-start; margin-bottom:6px;
  padding:6px; background:var(--bg-shell); border:1px solid var(--gridline); border-radius:8px;
}
.nts-toolbar-v2 details {
  border:1px solid transparent; border-radius:8px; padding:2px 4px;
  background:color-mix(in srgb, var(--bg-card) 72%, transparent);
}
.nts-toolbar-v2 details:not([open]) { padding-bottom:2px; }
.nts-toolbar-v2 summary {
  cursor:pointer; font-size:10px; font-weight:800; letter-spacing:.05em; text-transform:uppercase;
  color:var(--ink-muted); list-style:none; margin-bottom:3px;
}
.nts-toolbar-v2 summary::-webkit-details-marker { display:none; }
.nts-rt-group { display:flex; gap:3px; align-items:center; flex-wrap:wrap; max-width:min(760px, 100%); }
.nts-rt-file { min-width:180px; }
.nts-rt-doc-title { max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:700; color:var(--ink-primary); }
.nts-rt-save-state { font-size:10px; color:var(--ink-muted); }
.nts-rt-div { width:1px; height:22px; background:var(--gridline); margin:0 4px; flex-shrink:0; }
.nts-rt-spacer { flex:1; min-width:8px; }
.nts-rich-toolbar button, .nts-rt-stepper button {
  background:var(--bg-card); border:1px solid var(--gridline); color:var(--ink-primary);
  border-radius:3px; padding:3px 7px; font-size:11px; cursor:pointer; line-height:1.2;
}
.nts-rich-toolbar button:disabled { opacity:.45; cursor:not-allowed; }
.nts-rich-toolbar button:hover, .nts-rt-stepper button:hover { background:var(--bg-card-hover, var(--bg-card)); }
.nts-rich-toolbar select, .nts-rt-stepper input[type=number] {
  font-size:11px; padding:3px 5px; border:1px solid var(--gridline); border-radius:3px;
  background:var(--bg-card); color:var(--ink-primary);
}
.nts-rt-stepper input[type=number] { width:40px; text-align:center; }
.nts-rt-colors { display:flex; align-items:center; gap:3px; }
.nts-rt-label { font-size:10px; color:var(--ink-muted); font-weight:600; margin-right:2px; white-space:nowrap; }
.nts-rt-swatches { display:flex; gap:2px; }
.nts-rt-swatch {
  width:14px; height:14px; border-radius:2px; border:1px solid var(--gridline); padding:0; cursor:pointer;
}
.nts-rt-swatch-clear { background:repeating-linear-gradient(45deg, #ccc, #ccc 2px, #fff 2px, #fff 4px); }
.nts-rich-toolbar input[type=color] { width:22px; height:22px; padding:0; border:1px solid var(--gridline); border-radius:3px; cursor:pointer; }
.nts-rt-wordcount { font-size:10px; color:var(--ink-muted); white-space:nowrap; margin:0 6px; }
.nts-wordcount-bar {
  display:flex; justify-content:flex-end; padding:4px 2px 0; font-size:11px; color:var(--ink-muted);
  border-top:1px solid color-mix(in srgb, var(--gridline) 55%, transparent);
}
.nts-rt-dropdown { position:relative; }
.nts-rt-menu {
  position:absolute; top:100%; right:0; z-index:50; display:flex; flex-direction:column;
  background:var(--bg-card); border:1px solid var(--gridline); border-radius:4px; min-width:140px;
  box-shadow:0 4px 12px color-mix(in srgb, var(--ink-primary) 12%, transparent);
}
.nts-rt-menu button { border:none; border-bottom:1px solid var(--gridline); text-align:left; padding:6px 10px; font-size:11px; }
.nts-rt-menu button:last-child { border-bottom:none; }
.nts-rt-table-wrap { position:relative; }
.nts-rt-table-grid {
  position:absolute; top:100%; left:0; z-index:60; display:grid; grid-template-columns:repeat(8,14px);
  gap:2px; padding:6px; background:var(--bg-card); border:1px solid var(--gridline); border-radius:4px;
}
.nts-grid-cell { width:14px; height:14px; border:1px solid var(--gridline); background:var(--bg-shell); padding:0; cursor:pointer; }
.nts-grid-cell.nts-grid-active { background:color-mix(in srgb, var(--accent) 35%, var(--bg-shell)); }
.nts-link-chip {
  display:inline-flex; align-items:center; gap:4px; padding:1px 8px; border-radius:999px;
  background:color-mix(in srgb, var(--accent) 12%, var(--bg-card)); border:1px solid var(--accent);
  color:var(--accent); text-decoration:none; font-size:12px; cursor:pointer;
}
.nts-link-chip img { width:14px; height:14px; border-radius:3px; }
.nts-link-chip b { font-size:9px; opacity:.55; font-weight:600; }
.nts-link-favicon { font-size:10px; opacity:.7; }
.nts-link-popover, .nts-table-popover {
  position:absolute; z-index:300; background:var(--bg-card); border:1px solid var(--gridline);
  border-radius:6px; padding:8px; box-shadow:0 4px 16px color-mix(in srgb, var(--ink-primary) 15%, transparent);
  display:flex; flex-direction:column; gap:6px; min-width:200px;
}
.nts-link-pop-actions { display:flex; gap:6px; }
.nts-table-pop-row { display:flex; gap:4px; flex-wrap:wrap; }
.nts-table-pop-colors { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.nts-checklist { list-style:none; margin:4px 0; padding:0; }
.nts-checklist li { display:flex; align-items:flex-start; gap:6px; margin:4px 0; }
.nts-checklist li.nts-check-done span { text-decoration:line-through; opacity:0.6; }
.nts-checklist input[type=checkbox] { margin-top:3px; flex-shrink:0; }
.nts-inline-code { font-family:ui-monospace, monospace; background:var(--bg-shell); padding:1px 4px; border-radius:3px; font-size:0.9em; }
.nts-table { border-collapse:collapse; width:100%; margin:8px 0; }
.nts-table td, .nts-table th { border:1px solid var(--gridline); padding:6px 8px; min-width:60px; }
.nts-image-figure {
  position:relative; display:inline-flex; flex-direction:column; gap:4px; max-width:100%;
  margin:10px 0; padding:6px; border:1px solid var(--gridline); border-radius:10px;
  background:var(--bg-card);
}
.nts-image-frame { position:relative; display:inline-block; }
.nts-image-resizable { max-width:100%; width:min(420px, 100%); border-radius:6px; display:block; resize:both; overflow:auto; }
.nts-image-handles i { position:absolute; width:8px; height:8px; border:1px solid var(--bg-card); background:var(--accent); border-radius:50%; }
.nts-image-handles i:nth-child(1) { left:-4px; top:-4px; }
.nts-image-handles i:nth-child(2) { right:-4px; top:-4px; }
.nts-image-handles i:nth-child(3) { right:-4px; bottom:-4px; }
.nts-image-handles i:nth-child(4) { left:-4px; bottom:-4px; }
.nts-image-figure figcaption { font-size:12px; color:var(--ink-muted); outline:none; }
.nts-image-figure:has(img[src=""]), .nts-image-figure:has(img:not([src])), .nts-image-figure.wp-paste-void,
img.wp-paste-void, img[src=""], img:not([src]) { display:none !important; }
.nts-image-tools { display:flex; gap:4px; flex-wrap:wrap; }
.nts-img-left { float:left; margin-right:12px; }
.nts-img-center { display:flex; margin-left:auto; margin-right:auto; width:max-content; }
.nts-img-right { float:right; margin-left:12px; }
.nts-fs-overlay { background:color-mix(in srgb, var(--ink-primary) 38%, transparent); backdrop-filter:blur(6px); }
.nts-fs-modal.nts-fs-docs {
  display:flex; flex-direction:column; padding:0; overflow:hidden;
  background:color-mix(in srgb, #faf9f7 88%, var(--bg-card));
  border:1px solid color-mix(in srgb, var(--gridline) 70%, #e8e6e3);
  box-shadow:0 28px 90px color-mix(in srgb, var(--ink-primary) 22%, transparent);
}
.nts-fs-topbar {
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  padding:10px 16px; flex-shrink:0;
  border-bottom:1px solid color-mix(in srgb, var(--gridline) 65%, #e8e6e3);
  background:color-mix(in srgb, #ffffff 90%, var(--bg-card));
}
.nts-fs-title {
  flex:1; min-width:180px; font-size:20px; font-weight:600; letter-spacing:-0.02em;
  border:none; background:transparent; color:var(--ink-primary); outline:none;
}
.nts-fs-save-state { font-size:11px; color:var(--ink-muted); white-space:nowrap; }
.nts-fs-topbar-actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-left:auto; }
.nts-fs-topbar-actions button { font-size:12px; }
.nts-fs-layout { display:flex; flex:1; min-height:0; gap:0; }
.nts-fs-outline {
  width:210px; flex-shrink:0; overflow-y:auto;
  border-right:1px solid color-mix(in srgb, var(--gridline) 65%, #e8e6e3);
  padding:14px 12px; background:color-mix(in srgb, #f5f4f2 80%, var(--bg-shell));
}
.nts-fs-outline-label { display:block; font-size:12px; margin-bottom:8px; color:var(--ink-secondary); }
.nts-fs-main { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; background:color-mix(in srgb, #faf9f7 88%, var(--bg-card)); }
.nts-fs-toolbar-wrap {
  flex-shrink:0; padding:8px 12px 0;
  border-bottom:1px solid color-mix(in srgb, var(--gridline) 50%, transparent);
  background:color-mix(in srgb, #ffffff 85%, var(--bg-card));
}
.nts-fs-toolbar-wrap .rich-toolbar { margin:0; border:none; background:transparent; padding:0 0 8px; }
.nts-fs-page { flex:1; overflow-y:auto; min-height:0; }
.nts-fs-editable {
  max-width:720px; margin:0 auto; width:100%;
  min-height:calc(100% - 48px); padding:36px 28px 72px;
  font-family:Georgia, 'Times New Roman', serif;
  font-size:16px; line-height:1.75; color:var(--ink-primary);
  border:none; background:transparent; outline:none;
}
.nts-fs-editable:focus { outline:none; }
.nts-outline-item {
  display:block; width:100%; text-align:left; border:none; background:none; cursor:pointer;
  font-size:12px; padding:4px 6px; color:var(--ink-secondary); border-radius:3px;
}
.nts-outline-item:hover { background:color-mix(in srgb, var(--accent) 8%, var(--bg-card)); color:var(--ink-primary); }
.nts-outline-h1 { font-weight:700; padding-left:4px; }
.nts-outline-h2 { padding-left:14px; }
.nts-outline-h3 { padding-left:24px; font-size:11px; }
.nts-sheet-wrap { overflow-x:auto; }
.nts-sheet { width:100%; border-collapse:collapse; font-size:12px; }
.nts-sheet th, .nts-sheet td { padding:8px 10px; border-bottom:1px solid var(--gridline); text-align:left; vertical-align:top; }
.nts-sheet th { cursor:pointer; user-select:none; font-weight:600; background:color-mix(in srgb, var(--nts-app-accent) 8%, var(--bg-shell)); white-space:nowrap; }
.nts-sheet th:hover { background:color-mix(in srgb, var(--nts-app-accent) 14%, var(--bg-shell)); }
.nts-sheet th:nth-child(2), .nts-sheet td:nth-child(2) {
  position:sticky; left:0; z-index:2; background:var(--bg-card);
  box-shadow:6px 0 10px color-mix(in srgb, var(--ink-primary) 5%, transparent);
}
.nts-sheet th:nth-child(2) { background:color-mix(in srgb, var(--nts-app-accent) 8%, var(--bg-shell)); z-index:3; }
.nts-sort-ind { font-size:10px; margin-left:4px; opacity:0.7; }
.nts-sheet-preview { max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink-muted); }
.nts-sheet-title { font-weight:600; }
.nts-sheet-check-col { width:32px; }
.nts-select-mode .nts-sheet .note-bulk-check { display:inline-block; }
.nts-sheet .note-bulk-check { display:none; }
`;
}

function renderNoteToolbar(listType) {
  const search = getNotePref(listType, "search", "");
  const filter = getNotePref(listType, "filter", "all");
  const view = getNotePref(listType, "view", "list");
  const bulk = getNoteBulkState(listType);
  const ctx = listType === "thinking" ? getDumpLinkProjectContext() : null;
  // Standardized options across all Capture lists.
  const filters = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "done", label: "Done" },
    { key: "ai", label: "AI-added" },
    { key: "mine", label: "Mine" },
  ];
  if (ctx) {
    filters.push({ key: "project", label: ctx.name ? `Linked project` : "This project" });
  }
  return `
    <div class="card nts-toolbar" data-list-type="${escapeHtml(listType)}">
      <input type="search" class="nts-search" placeholder="Search title and body…" value="${escapeHtml(search).replace(/"/g, "&quot;")}">
      <div class="nts-filter-chips">
        ${filters.map(f => `<button type="button" class="nts-chip ${filter === f.key ? "active" : ""}" data-filter="${f.key}">${f.label}</button>`).join("")}
      </div>
      <div class="nts-view-toggle">
        <span class="stub" style="margin:0;">View:</span>
        <button type="button" class="nts-view-btn ${view === "list" ? "active" : ""}" data-view="list">List</button>
        <button type="button" class="nts-view-btn ${view === "compact" ? "active" : ""}" data-view="compact">Compact</button>
        <button type="button" class="nts-view-btn ${view === "table" ? "active" : ""}" data-view="table">Table</button>
      </div>
      <button type="button" class="nts-select-toggle ${bulk.active ? "active" : ""}">Select</button>
    </div>`;
}

function renderThinkingInboxBanner() {
  return `
    <div class="card nts-inbox-banner">
      <strong>Thinking inbox</strong>
      <span class="stub">Everything lands here first — classify later, or never. Nothing is deleted when you move an item.</span>
    </div>`;
}

function renderNoteIdentityHeader(listType, items = []) {
  const ident = NTS_LIST_IDENTITIES[listType] || NTS_LIST_IDENTITIES.thinking;
  const count = items.length;
  const openCount = items.filter(i => i.status !== "done").length;
  const sample = listType === "funny"
    ? (items.find(i => noteBodyPlain(i.body)) || items[0])
    : null;
  return `
    <section class="card nts-app-identity ${ident.className}" data-list-type="${escapeHtml(listType)}">
      <div class="nts-app-identity-main">
        <span class="nts-app-kicker">${escapeHtml(ident.kicker)}</span>
        <h2>${escapeHtml(ident.title)}</h2>
        <p class="nts-app-intent">${escapeHtml(ident.intent)}</p>
        <span class="nts-app-meta">${count} entr${count === 1 ? "y" : "ies"}${openCount !== count ? ` · ${openCount} open` : ""}</span>
      </div>
      <button type="button" class="secondary nts-identity-action" data-action="${escapeHtml(listType)}">${escapeHtml(ident.button)}</button>
      ${listType === "funny" ? `<div class="nts-spark-preview" data-spark-preview>${sample ? escapeHtml(sample.title || noteBodyPlain(sample.body).slice(0, 80)) : "No sparks yet — add one, then shuffle."}</div>` : ""}
    </section>`;
}

function ntsOutlineFromHtml(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html || "";
  return Array.from(wrap.querySelectorAll("h1, h2, h3")).map((h, idx) => ({
    text: (h.textContent || "").trim() || "(empty heading)",
    level: h.tagName.toLowerCase(),
    idx,
  }));
}

function renderEssayOutlinePanel(items = []) {
  const essays = items.slice(0, 4).map(item => {
    const outline = ntsOutlineFromHtml(item.body).slice(0, 6);
    return `
      <details class="nts-essay-outline-card" ${items[0] === item ? "open" : ""}>
        <summary>${escapeHtml(item.title || "Untitled essay")}</summary>
        ${outline.length ? outline.map(h => `<button type="button" class="nts-outline-item nts-outline-${h.level}" data-essay-id="${item.id}" data-heading-idx="${h.idx}">${escapeHtml(h.text)}</button>`).join("") : '<p class="stub">No headings yet — add H1, H2, or H3.</p>'}
      </details>`;
  }).join("");
  return `
    <aside class="nts-essay-outline-panel">
      <strong>Essay outline</strong>
      <p class="stub">Click a heading to open the essay editor and jump. Drag reordering is unavailable until safe section moves exist.</p>
      ${essays || '<p class="stub">No essays yet.</p>'}
    </aside>`;
}

function renderSkillPracticeMeta(item) {
  const trend = (item.proficiency_trend || [])
    .map(entry => Number(entry.proficiency))
    .filter(value => Number.isFinite(value));
  let sparkline = "";
  if (trend.length >= 2) {
    const min = Math.min(...trend);
    const max = Math.max(...trend);
    const span = Math.max(1, max - min);
    const points = trend.map((value, idx) => {
      const x = 2 + (idx * 56 / Math.max(1, trend.length - 1));
      const y = 18 - ((value - min) * 16 / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    sparkline = `<span class="skill-trend-spark" title="Proficiency trend: ${trend.join(" → ")}">
      trend
      <svg width="60" height="20" viewBox="0 0 60 20" role="img" aria-label="Proficiency trend ${trend.join(" to ")}">
        <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
      </svg>
    </span>`;
  }
  const practiced = item.last_practiced;
  const lastPracticed = practiced?.at
    ? `<span title="${escapeHtml(practiced.game_label || practiced.game_key || "Practice")}">last practiced ${escapeHtml(String(practiced.at).slice(0, 10))}</span>`
    : "";
  return `<div class="skill-practice-meta" data-skill-meta="${item.id}">${sparkline}${lastPracticed}</div>`;
}

function renderNoteCardList(item, listType) {
  const bulk = getNoteBulkState(listType);
  const checked = bulk.ids.has(item.id) ? "checked" : "";
  const linkedProjectId = noteGetProjectId(item);
  const classifyRow = listType === "thinking" ? `
      <div class="nts-classify-row">
        <span class="stub" style="margin:0;">classify →</span>
        <select class="note-classify-select" data-id="${item.id}">
          <option value="">Choose list…</option>
          ${NTS_CLASSIFY_TARGETS.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
        </select>
        <span class="nts-classify-feedback" data-id="${item.id}"></span>
      </div>` : "";
  const essayClass = listType === "essay" ? " nts-essay-card" : "";
  return `
    <div class="card note-card nts-view-list ${item.status === "done" ? "done" : ""}${essayClass}" data-id="${item.id}" data-source="${escapeHtml(item.source || "human")}" data-status="${escapeHtml(item.status || "open")}" data-project-id="${linkedProjectId || ""}">
      <div class="note-card-header">
        <span class="drag-handle" draggable="true" title="Drag to reorder">&#10247;</span>
        <input type="checkbox" class="note-bulk-check" data-id="${item.id}" ${checked}>
        <input type="checkbox" class="note-status" data-id="${item.id}" data-type="${listType}" ${item.status === "done" ? "checked" : ""}>
        <input type="text" class="note-title-edit" data-id="${item.id}" value="${escapeHtml(item.title || "").replace(/"/g, "&quot;")}" style="font-weight:600; flex:1;">
        <span class="nts-saved-indicator" data-id="${item.id}">saved</span>
        <span class="note-card-actions" style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
          ${listType === "skill" ? `<input type="number" class="note-proficiency" data-id="${item.id}" min="1" max="10" value="${item.proficiency ?? 5}" title="Proficiency 1-10" style="width:44px;">` : ""}
          ${noteSourcePills(item)}
          <button class="secondary note-ask-agent" data-id="${item.id}" title="Ask the Agent about this">&#129302;</button>
          <button class="secondary note-delete" data-id="${item.id}" data-type="${listType}">${ntsDeleteButtonLabel(listType)}</button>
        </span>
      </div>
      <div class="note-body-wrap">
        <div data-rich-for="note-body-${item.id}" style="margin-top:6px;">${NOTES_CARD_TOOLBAR_HTML || notesEnsureCardToolbarHtml()}</div>
        <div id="note-body-${item.id}" class="rich-editable note-body-edit" data-id="${item.id}" contenteditable="true">${item.body || ""}</div>
        <div class="nts-wordcount-bar" data-nts-wordcount-for="note-body-${item.id}">0 words · 0 chars · ≈ 0 tokens · 0 min · selection 0</div>
      </div>
      ${listType === "skill" ? renderSkillPracticeMeta(item) : ""}
      <div class="note-card-footer" style="margin-top:6px;">
        <button class="primary note-save" data-id="${item.id}" data-type="${listType}">Save</button>
        ${listType === "essay" || ntsIsLongNote(item.body) ? `<button type="button" class="secondary note-open-full-editor" data-id="${item.id}" data-type="${listType}">Open full editor</button>` : ""}
        <button class="secondary note-export-md" data-id="${item.id}" title="Download this note as a Markdown file">Export .md</button>
        ${listType === "thinking" ? `<button type="button" class="secondary note-delete" data-id="${item.id}" data-type="${listType}">Delete</button>` : ""}
        ${fieldHistoryWidgetHtml("note", item.id, "body")}
      </div>
      ${renderNoteProjectLinkRow(item, listType)}
      ${classifyRow}
    </div>`;
}

function renderNoteCardCompact(item, listType) {
  const bulk = getNoteBulkState(listType);
  const checked = bulk.ids.has(item.id) ? "checked" : "";
  const linkedProjectId = noteGetProjectId(item);
  return `
    <div class="card note-card nts-view-compact note-compact-row ${item.status === "done" ? "done" : ""}" data-id="${item.id}" data-source="${escapeHtml(item.source || "human")}" data-status="${escapeHtml(item.status || "open")}" data-project-id="${linkedProjectId || ""}">
      <span class="drag-handle" draggable="true" title="Drag to reorder">&#10247;</span>
      <input type="checkbox" class="note-bulk-check" data-id="${item.id}" ${checked}>
      <input type="checkbox" class="note-status" data-id="${item.id}" data-type="${listType}" ${item.status === "done" ? "checked" : ""}>
      <input type="text" class="note-title-edit" data-id="${item.id}" value="${escapeHtml(item.title || "").replace(/"/g, "&quot;")}" title="${escapeHtml(item.title || "Untitled")}">
      <span class="nts-compact-pills">
        ${item.status === "done" ? '<span class="pill nts-done-pill">done</span>' : ""}
        ${noteSourcePills(item)}
      </span>
      <span class="nts-compact-actions">
        <button class="secondary note-delete" data-id="${item.id}" data-type="${listType}">${ntsDeleteButtonLabel(listType)}</button>
      </span>
      <div class="note-body-edit nts-compact-body-store" data-id="${item.id}" style="display:none;">${item.body || ""}</div>
    </div>`;
}

function ntsSheetSortKey(item, col) {
  if (col === "title") return (item.title || "").toLowerCase();
  if (col === "status") return item.status || "open";
  if (col === "created") return item.created_at || "";
  if (col === "source") return item.source || "human";
  if (col === "body") return noteBodyPlain(item.body).toLowerCase();
  return "";
}

function renderNoteSheet(items, listType) {
  const bulk = getNoteBulkState(listType);
  const sortCol = getNotePref(listType, "sheetSort", "created");
  const sortDir = getNotePref(listType, "sheetDir", "desc");
  const sorted = [...items].sort((a, b) => {
    const av = ntsSheetSortKey(a, sortCol);
    const bv = ntsSheetSortKey(b, sortCol);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });
  const sortInd = col => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? "&#9650;" : "&#9660;";
  };
  const rows = sorted.map(item => {
    const checked = bulk.ids.has(item.id) ? "checked" : "";
    const preview = noteBodyPlain(item.body).replace(/\s+/g, " ").slice(0, 120);
    const created = (item.created_at || "").slice(0, 10);
    const doneClass = item.status === "done" ? " done" : "";
    const linkedProjectId = noteGetProjectId(item);
    return `
      <tr class="nts-sheet-row note-card${doneClass}" data-id="${item.id}" data-source="${escapeHtml(item.source || "human")}" data-status="${escapeHtml(item.status || "open")}" data-project-id="${linkedProjectId || ""}">
        <td class="nts-sheet-check-col"><input type="checkbox" class="note-bulk-check" data-id="${item.id}" ${checked}></td>
        <td class="nts-sheet-title">${escapeHtml(item.title || "Untitled")}</td>
        <td>${escapeHtml(item.status || "open")}</td>
        <td>${escapeHtml(created)}</td>
        <td>${escapeHtml(item.source || "human")}</td>
        <td class="nts-sheet-preview" title="${escapeHtml(preview)}">${escapeHtml(preview) || "—"}</td>
        <td class="nts-sheet-actions"><button type="button" class="secondary note-delete" data-id="${item.id}" data-type="${listType}">Delete</button></td>
      </tr>`;
  }).join("");
  return `
    <div class="card nts-sheet-wrap" data-list-type="${escapeHtml(listType)}">
      <table class="nts-sheet">
        <thead>
          <tr>
            <th class="nts-sheet-check-col"></th>
            <th data-sort="title">Title <span class="nts-sort-ind">${sortInd("title")}</span></th>
            <th data-sort="status">Status <span class="nts-sort-ind">${sortInd("status")}</span></th>
            <th data-sort="created">Created <span class="nts-sort-ind">${sortInd("created")}</span></th>
            <th data-sort="source">Source <span class="nts-sort-ind">${sortInd("source")}</span></th>
            <th data-sort="body">Body preview <span class="nts-sort-ind">${sortInd("body")}</span></th>
            <th class="nts-sheet-actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr class="nts-empty-row"><td colspan="7" class="stub nts-empty-msg">${escapeHtml(ntsListEmptyMessage(listType, items.length, getNotePref(listType, "filter", "all"), getNotePref(listType, "search", "")))}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderNoteCards(items, listType) {
  const view = getNotePref(listType, "view", "list");
  const cards = items.map(i => renderNoteCardList(i, listType) + renderNoteCardCompact(i, listType)).join("");
  const groupClass = view === "compact" ? " nts-view-compact-group" : view === "table" ? " nts-view-table-group" : "";
  const sheet = view === "table" ? renderNoteSheet(items, listType) : "";
  const emptyMsg = ntsListEmptyMessage(
    listType,
    items.length,
    getNotePref(listType, "filter", "all"),
    getNotePref(listType, "search", ""),
  );
  return `
    ${sheet}
    <div class="note-group${groupClass}" data-list-type="${escapeHtml(listType)}" data-total-count="${items.length}">
      ${cards || (view !== "table" ? `<p class="stub nts-empty-msg">${escapeHtml(emptyMsg)}</p>` : "")}
    </div>`;
}

function renderDocClassifyWidget(listType) {
  const biasType = DOC_CLASSIFY_LIST_TYPES.includes(listType) ? listType : "thinking";
  if (DOC_CLASSIFY_PROPOSALS) {
    const rows = DOC_CLASSIFY_PROPOSALS.map((item, idx) => {
      const rowType = item.list_type || biasType;
      return `
      <div class="card" style="margin-top:8px;">
        <div style="display:flex; gap:8px; align-items:center;">
          <select class="doc-classify-type" data-idx="${idx}">
            ${DOC_CLASSIFY_LIST_TYPES.map(t => `<option value="${t}" ${t === rowType ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          <input type="text" class="doc-classify-title" data-idx="${idx}" value="${escapeHtml(item.title || "").replace(/"/g, "&quot;")}" style="flex:1; font-weight:600;">
          <button class="secondary doc-classify-remove" data-idx="${idx}">x</button>
        </div>
        <textarea class="doc-classify-body" data-idx="${idx}" rows="2" style="margin-top:6px; width:100%;">${escapeHtml(item.body || "")}</textarea>
        <div class="nts-wordcount-bar nts-doc-classify-tokens" data-doc-classify-tokens="${idx}">≈ ${ntsEstimateTokens(item.body || "")} tokens</div>
      </div>`;
    }).join("");
    return `
      <div class="card nts-import-doc-card" data-doc-import-widget="review">
        <strong>Import from document</strong>
        <p class="stub" style="margin-top:4px;">Proposed from ${DOC_CLASSIFY_SOURCES.length > 1
          ? `${DOC_CLASSIFY_SOURCES.length} documents`
          : `"${escapeHtml(DOC_CLASSIFY_FILENAME)}"`}</p>
        ${DOC_CLASSIFY_SOURCES.length > 1 ? `<p class="stub">${escapeHtml(DOC_CLASSIFY_SOURCES.join(", "))}</p>` : ""}
        <p class="stub">Review and edit before adding — nothing is saved until you confirm.</p>
        ${rows || '<p class="stub">No items proposed from this document.</p>'}
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="primary" id="doc-classify-confirm" ${DOC_CLASSIFY_PROPOSALS.length ? "" : "disabled"}>Add ${DOC_CLASSIFY_PROPOSALS.length} item(s)</button>
          <button class="secondary" id="doc-classify-discard">Discard</button>
        </div>
      </div>`;
  }
  return `
    <div class="card nts-import-doc-card" data-doc-import-widget="upload">
      <strong>Import from document</strong>
      <p class="stub" style="margin-top:4px;">Upload PDF, Word, Markdown, or plain text — AI proposes entries for you to review before anything is added. Large files are read in full.</p>
      <div style="margin-top:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <input type="file" id="doc-classify-input" accept=".pdf,.docx,.txt,.md" multiple hidden>
        <button type="button" class="secondary" id="doc-classify-choose">Choose files…</button>
        <span id="doc-classify-status" class="stub"></span>
      </div>
    </div>`;
}

function wireDocClassifyWidget(listType) {
  const biasType = DOC_CLASSIFY_LIST_TYPES.includes(listType) ? listType : "thinking";
  const input = document.getElementById("doc-classify-input");
  const chooseBtn = document.getElementById("doc-classify-choose");
  if (input && chooseBtn) {
    chooseBtn.onclick = () => input.click();
    input.onchange = async (e) => {
      const picked = Array.from(e.target.files || []);
      if (!picked.length) return;
      const status = document.getElementById("doc-classify-status");
      input.disabled = true;
      chooseBtn.disabled = true;

      const classifyFiles = async (signal) => {
        const combined = [];
        const sources = [];
        let failures = 0;
        let totalChunks = 0;
        let totalItems = 0;
        for (let i = 0; i < picked.length; i++) {
          if (signal?.aborted) return { cancelled: true };
          const file = picked[i];
          if (status) {
            status.textContent = picked.length > 1
              ? `Document ${i + 1}/${picked.length}: ${file.name}`
              : "";
          }
          const formData = new FormData();
          formData.append("file", file);
          formData.append("bias_list", biasType);
          const res = await fetch("/api/documents/classify", { method: "POST", body: formData, signal });
          const data = await res.json();
          if (!res.ok || data.error) {
            failures += 1;
            continue;
          }
          const chunks = Number(data.chunks_processed) || 0;
          const items = data.items || [];
          totalChunks += chunks;
          totalItems += items.length;
          sources.push(file.name);
          items.forEach(item => {
            combined.push({
              ...item,
              list_type: item.list_type || biasType,
              _source: file.name,
            });
          });
          if (status) {
            status.textContent = chunks
              ? `Read ${chunks} section${chunks === 1 ? "" : "s"} — ${items.length} item${items.length === 1 ? "" : "s"} found`
              : `${items.length} item${items.length === 1 ? "" : "s"} found`;
          }
        }
        return { combined, sources, failures, totalChunks, totalItems };
      };

      try {
        const run = typeof runCancellable === "function"
          ? () => runCancellable(chooseBtn, "Reading the whole document…", classifyFiles)
          : () => classifyFiles();
        const result = await run();
        input.disabled = false;
        chooseBtn.disabled = false;
        input.value = "";
        if (!result || result.cancelled) {
          if (status) status.textContent = "";
          return;
        }
        if (result.error) {
          if (typeof showToast === "function") showToast(result.error, "warning");
          if (status) status.textContent = "";
          return;
        }
        const { combined, sources, failures, totalChunks, totalItems } = result;
        if (!combined.length && failures) {
          showToast("Could not classify the selected document(s).");
          if (status) status.textContent = "";
          return;
        }
        if (failures) {
          const msg = `${failures} of ${picked.length} document(s) could not be classified.`;
          showToast(msg, "warning");
        }
        if (status && totalChunks) {
          status.textContent = `Read ${totalChunks} section${totalChunks === 1 ? "" : "s"} — ${totalItems} item${totalItems === 1 ? "" : "s"} found`;
        }
        DOC_CLASSIFY_SOURCES = sources;
        DOC_CLASSIFY_FILENAME = sources.length === 1 ? sources[0] : `${sources.length} documents`;
        DOC_CLASSIFY_PROPOSALS = combined;
        render();
      } catch (_) {
        input.disabled = false;
        chooseBtn.disabled = false;
        input.value = "";
        showToast("Could not classify the selected document(s).");
        if (status) status.textContent = "";
      }
    };
  }

  document.querySelectorAll(".doc-classify-type").forEach(sel => {
    sel.onchange = () => { DOC_CLASSIFY_PROPOSALS[sel.dataset.idx].list_type = sel.value; };
  });
  document.querySelectorAll(".doc-classify-title").forEach(inp => {
    inp.oninput = () => { DOC_CLASSIFY_PROPOSALS[inp.dataset.idx].title = inp.value; };
  });
  document.querySelectorAll(".doc-classify-body").forEach(ta => {
    const updateTokens = () => {
      const bar = document.querySelector(`[data-doc-classify-tokens="${ta.dataset.idx}"]`);
      if (bar) bar.textContent = `≈ ${ntsEstimateTokens(ta.value)} tokens`;
    };
    ta.oninput = () => {
      DOC_CLASSIFY_PROPOSALS[ta.dataset.idx].body = ta.value;
      updateTokens();
    };
    updateTokens();
  });
  document.querySelectorAll(".doc-classify-remove").forEach(btn => {
    btn.onclick = () => {
      if (!window.confirm("Remove this proposed item?")) return;
      DOC_CLASSIFY_PROPOSALS.splice(Number(btn.dataset.idx), 1);
      render();
    };
  });

  const confirmBtn = document.getElementById("doc-classify-confirm");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      await api("/api/documents/classify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: DOC_CLASSIFY_PROPOSALS }),
      });
      DOC_CLASSIFY_PROPOSALS = null;
      DOC_CLASSIFY_FILENAME = "";
      DOC_CLASSIFY_SOURCES = [];
      render();
    };
  }
  const discardBtn = document.getElementById("doc-classify-discard");
  if (discardBtn) {
    discardBtn.onclick = () => {
      DOC_CLASSIFY_PROPOSALS = null;
      DOC_CLASSIFY_FILENAME = "";
      DOC_CLASSIFY_SOURCES = [];
      render();
    };
  }
}

function getNoteCardSearchText(card) {
  const title = card.querySelector(".note-title-edit")?.value
    || card.querySelector(".nts-sheet-title")?.textContent || "";
  const bodyEl = card.querySelector(".note-body-edit");
  const preview = card.querySelector(".nts-sheet-preview")?.textContent || "";
  const body = bodyEl ? (bodyEl.textContent || "") : preview;
  return `${title} ${body}`.toLowerCase();
}

function applyNoteListFilters(listType) {
  const q = (getNotePref(listType, "search") || "").toLowerCase().trim();
  const filter = getNotePref(listType, "filter") || "all";
  const view = getNotePref(listType, "view", "list");
  const group = document.querySelector(`.note-group[data-list-type="${listType}"]`);
  const sheet = document.querySelector(`.nts-sheet-wrap[data-list-type="${listType}"]`);
  let visible = 0;

  const matchCard = card => {
    const text = getNoteCardSearchText(card);
    const source = card.dataset.source || "human";
    const status = card.dataset.status === "done" || card.classList.contains("done") ? "done" : "open";
    const projectId = card.dataset.projectId || "";
    const projectFilter = getNotePref(listType, "projectFilter", "");
    const focusProjectId = projectFilter || String(getDumpLinkProjectContext()?.id || "");
    const matchSearch = !q || text.includes(q);
    const matchFilter = filter === "all"
      || (filter === "open" && status !== "done")
      || (filter === "done" && status === "done")
      || (filter === "ai" && source === "ai")
      || (filter === "mine" && source !== "ai")
      || (filter === "project" && projectId && focusProjectId && projectId === String(focusProjectId));
    return matchSearch && matchFilter;
  };

  if (view === "table" && sheet) {
    sheet.querySelectorAll(".nts-sheet-row").forEach(row => {
      const show = matchCard(row);
      row.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    const emptyRow = sheet.querySelector("tbody tr.nts-empty-row, tbody tr:not(.nts-sheet-row)");
    if (emptyRow) {
      emptyRow.style.display = visible ? "none" : "";
      const emptyCell = emptyRow.querySelector(".nts-empty-msg, .stub");
      if (emptyCell && !visible) {
        const total = Number(group?.dataset.totalCount || 0);
        emptyCell.textContent = ntsListEmptyMessage(listType, total, filter, q);
      }
    }
  }

  if (group) {
    group.querySelectorAll(".note-card").forEach(card => {
      const isCompact = card.classList.contains("nts-view-compact");
      const isList = card.classList.contains("nts-view-list");
      if (view === "table") {
        card.style.display = "none";
        return;
      }
      if ((view === "compact" && isList) || (view === "list" && isCompact)) {
        card.style.display = "none";
        return;
      }
      const show = matchCard(card);
      card.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    const emptyMsg = group.querySelector(".nts-empty-msg");
    if (emptyMsg) {
      emptyMsg.style.display = visible ? "none" : "";
      if (!visible) {
        const total = Number(group.dataset.totalCount || 0);
        emptyMsg.textContent = ntsListEmptyMessage(listType, total, filter, q);
      }
    }
  }
}

function showNoteSavedIndicator(id) {
  const ind = document.querySelector(`.nts-saved-indicator[data-id="${id}"]`);
  if (!ind) return;
  ind.classList.add("nts-saved-visible");
  clearTimeout(ind._ntsHideTimer);
  ind._ntsHideTimer = setTimeout(() => ind.classList.remove("nts-saved-visible"), 1400);
}

function wireNoteBodyAutosave(listType) {
  document.querySelectorAll(".note-body-edit[data-id]").forEach(el => {
    const id = el.dataset.id;
    el.addEventListener("input", () => {
      clearTimeout(NOTE_AUTOSAVE_TIMERS[id]);
      NOTE_AUTOSAVE_TIMERS[id] = setTimeout(async () => {
        const body = el.innerHTML.trim();
        try {
          await api(`/api/lists/${listType}/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          });
          const item = LAST_NOTE_ITEMS.find(i => i.id === Number(id));
          if (item) item.body = body;
          showNoteSavedIndicator(id);
        } catch (err) {
          /* silent autosave failure — explicit Save still available */
        }
      }, 1500);
    });
  });
}

function wireNoteSheetSort(listType) {
  const sheet = document.querySelector(`.nts-sheet-wrap[data-list-type="${listType}"]`);
  if (!sheet) return;
  sheet.querySelectorAll("th[data-sort]").forEach(th => {
    th.onclick = () => {
      const col = th.dataset.sort;
      const cur = getNotePref(listType, "sheetSort", "created");
      const dir = getNotePref(listType, "sheetDir", "desc");
      if (cur === col) setNotePref(listType, "sheetDir", dir === "asc" ? "desc" : "asc");
      else {
        setNotePref(listType, "sheetSort", col);
        setNotePref(listType, "sheetDir", "asc");
      }
      render();
    };
  });
}

function wireNoteSearchFilter(listType) {
  const toolbar = document.querySelector(`.nts-toolbar[data-list-type="${listType}"]`);
  if (!toolbar) return;

  const searchInput = toolbar.querySelector(".nts-search");
  if (searchInput) {
    searchInput.oninput = () => {
      setNotePref(listType, "search", searchInput.value);
      applyNoteListFilters(listType);
    };
  }

  toolbar.querySelectorAll(".nts-chip").forEach(btn => {
    btn.onclick = () => {
      setNotePref(listType, "filter", btn.dataset.filter);
      if (btn.dataset.filter === "project") {
        const ctx = getDumpLinkProjectContext();
        if (ctx) setNotePref(listType, "projectFilter", String(ctx.id));
      }
      toolbar.querySelectorAll(".nts-chip").forEach(b => b.classList.toggle("active", b === btn));
      applyNoteListFilters(listType);
    };
  });

  toolbar.querySelectorAll(".nts-view-btn").forEach(btn => {
    btn.onclick = () => {
      setNotePref(listType, "view", btn.dataset.view);
      render();
    };
  });
}

function updateNoteBulkBar(listType) {
  const bulk = getNoteBulkState(listType);
  let bar = document.getElementById("nts-bulk-bar");
  if (!bulk.active || bulk.ids.size === 0) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "nts-bulk-bar";
    bar.className = "nts-bulk-bar";
    bar.innerHTML = `
      <span class="nts-bulk-count"></span>
      <button type="button" class="primary nts-bulk-done">Mark done</button>
      <button type="button" class="secondary nts-bulk-open">Mark open</button>
      <button type="button" class="secondary nts-bulk-prefix">Prefix titles</button>
      ${listType === "skill" ? '<button type="button" class="secondary nts-bulk-prof">Set proficiency</button>' : ""}
      <button type="button" class="secondary nts-bulk-export">Export .md</button>
      <button type="button" class="secondary nts-bulk-delete">Delete</button>`;
    document.body.appendChild(bar);
    bar.querySelector(".nts-bulk-done").onclick = () => bulkActionMarkDone(listType);
    bar.querySelector(".nts-bulk-open").onclick = () => bulkActionMarkOpen(listType);
    bar.querySelector(".nts-bulk-prefix").onclick = () => bulkActionPrefixTitles(listType);
    bar.querySelector(".nts-bulk-prof")?.addEventListener("click", () => bulkActionSetProficiency(listType));
    bar.querySelector(".nts-bulk-export").onclick = () => bulkActionExportMd(listType);
    bar.querySelector(".nts-bulk-delete").onclick = () => bulkActionDelete(listType);
  }
  bar.querySelector(".nts-bulk-count").textContent = `${bulk.ids.size} selected`;
}

function wireNoteBulkSelect(listType) {
  const bulk = getNoteBulkState(listType);
  const toggle = document.querySelector(`.nts-toolbar[data-list-type="${listType}"] .nts-select-toggle`);
  const group = document.querySelector(`.note-group[data-list-type="${listType}"]`);
  const sheet = document.querySelector(`.nts-sheet-wrap[data-list-type="${listType}"]`);
  if (!toggle) return;

  if (group) group.classList.toggle("nts-select-mode", bulk.active);
  if (sheet) sheet.classList.toggle("nts-select-mode", bulk.active);
  toggle.classList.toggle("active", bulk.active);
  toggle.onclick = () => {
    bulk.active = !bulk.active;
    if (!bulk.active) bulk.ids.clear();
    render();
  };

  const wireChecks = root => {
    if (!root) return;
    root.querySelectorAll(".note-bulk-check").forEach(cb => {
      cb.onchange = () => {
        const id = Number(cb.dataset.id);
        if (cb.checked) bulk.ids.add(id);
        else bulk.ids.delete(id);
        updateNoteBulkBar(listType);
      };
    });
  };
  wireChecks(group);
  wireChecks(sheet);
  updateNoteBulkBar(listType);
}

async function bulkActionMarkDone(listType) {
  const bulk = getNoteBulkState(listType);
  const ids = [...bulk.ids];
  for (const id of ids) {
    await api(`/api/lists/${listType}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  }
  bulk.ids.clear();
  bulk.active = false;
  render();
}

async function bulkActionMarkOpen(listType) {
  const bulk = getNoteBulkState(listType);
  const ids = [...bulk.ids];
  for (const id of ids) {
    await api(`/api/lists/${listType}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });
  }
  bulk.ids.clear();
  bulk.active = false;
  render();
}

async function bulkActionPrefixTitles(listType) {
  const bulk = getNoteBulkState(listType);
  const prefix = window.prompt("Prefix selected titles with:");
  if (prefix == null) return;
  const ids = [...bulk.ids];
  for (const id of ids) {
    const item = LAST_NOTE_ITEMS.find(i => i.id === id);
    const title = `${prefix}${item?.title || "Untitled"}`;
    await api(`/api/lists/${listType}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }
  bulk.ids.clear();
  bulk.active = false;
  render();
}

async function bulkActionSetProficiency(listType) {
  if (listType !== "skill") return;
  const bulk = getNoteBulkState(listType);
  const value = Math.min(10, Math.max(1, Number(window.prompt("Set proficiency 1-10:", "5")) || 5));
  for (const id of [...bulk.ids]) {
    await api(`/api/lists/skill/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proficiency: value }),
    });
  }
  bulk.ids.clear();
  bulk.active = false;
  render();
}

async function bulkActionDelete(listType) {
  const bulk = getNoteBulkState(listType);
  const ids = [...bulk.ids];
  if (!ids.length) return;
  const entryWord = listType === "thinking" ? "dump entr" : "entr";
  if (!window.confirm(`Delete ${ids.length} selected ${entryWord}${ids.length === 1 ? "y" : "ies"}?`)) return;
  for (const id of ids) {
    await api(`/api/lists/${listType}/${id}`, { method: "DELETE" });
  }
  bulk.ids.clear();
  bulk.active = false;
  render();
}

function bulkActionExportMd(listType) {
  const bulk = getNoteBulkState(listType);
  const items = [...bulk.ids]
    .map(id => {
      const cached = LAST_NOTE_ITEMS.find(i => i.id === id);
      if (cached) {
        const titleEl = document.querySelector(`.note-title-edit[data-id="${id}"]`);
        const bodyEl = document.getElementById(`note-body-${id}`);
        return {
          ...cached,
          title: titleEl ? titleEl.value.trim() : cached.title,
          body: bodyEl ? bodyEl.innerHTML.trim() : cached.body,
        };
      }
      return null;
    })
    .filter(Boolean);
  if (!items.length) return;
  const md = items.map(noteItemToMd).join("\n---\n\n");
  downloadMarkdown(`${listType}-notes-${items.length}.md`, md);
}

async function linkNoteToProject(noteId, listType, projectId) {
  const item = LAST_NOTE_ITEMS.find(i => i.id === Number(noteId));
  const bodyEl = document.getElementById(`note-body-${noteId}`);
  const body = bodyEl?.innerHTML || item?.body || "";
  const newBody = noteBodySetProjectId(body, projectId ? Number(projectId) : null);
  await api(`/api/lists/${listType}/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: newBody }),
  });
  if (item) item.body = newBody;
  if (bodyEl) bodyEl.innerHTML = newBody;
  document.querySelectorAll(`.note-card[data-id="${noteId}"]`).forEach(card => {
    card.dataset.projectId = projectId ? String(projectId) : "";
  });
  applyNoteListFilters(listType);
}

function wireThinkingProjectLink(listType) {
  if (listType !== "thinking") return;

  document.querySelectorAll(".note-link-project").forEach(sel => {
    sel.onchange = async () => {
      const id = sel.dataset.id;
      const type = sel.dataset.type;
      sel.disabled = true;
      try {
        await linkNoteToProject(id, type, sel.value || null);
        render();
      } catch (err) {
        showToast(errorMessage(err));
      } finally {
        sel.disabled = false;
      }
    };
  });

  document.querySelectorAll(".note-link-project-quick").forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await linkNoteToProject(btn.dataset.id, listType, btn.dataset.project);
        render();
      } catch (err) {
        showToast(errorMessage(err));
      } finally {
        btn.disabled = false;
      }
    };
  });

  document.querySelector(".nts-project-filter-linked")?.addEventListener("click", () => {
    const ctx = getDumpLinkProjectContext();
    if (!ctx) return;
    setNotePref("thinking", "projectFilter", String(ctx.id));
    setNotePref("thinking", "filter", "project");
    render();
  });

  document.querySelector(".nts-project-filter-all")?.addEventListener("click", () => {
    setNotePref("thinking", "filter", "all");
    render();
  });

  document.querySelector(".nts-project-link-clear")?.addEventListener("click", () => {
    clearDumpLinkProjectContext();
    setNotePref("thinking", "filter", "all");
    render();
  });
}

async function classifyThinkingItem(id, target) {
  const meta = NTS_CLASSIFY_TARGETS.find(t => t.value === target);
  if (!meta) return;
  const titleEl = document.querySelector(`.note-title-edit[data-id="${id}"]`);
  const bodyEl = document.getElementById(`note-body-${id}`);
  const cached = LAST_NOTE_ITEMS.find(i => i.id === Number(id));
  const title = (titleEl?.value || cached?.title || "").trim() || "Untitled";
  const body = (bodyEl?.innerHTML || cached?.body || "").trim();

  if (meta.api === "ideas") {
    await api("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
  } else {
    await api(`/api/lists/${target}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
  }

  await api(`/api/lists/thinking/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });

  const card = document.querySelector(`.note-card[data-id="${id}"]`);
  if (card) {
    card.classList.add("done");
    card.dataset.status = "done";
    card.querySelectorAll(".note-status").forEach(cb => { cb.checked = true; });
  }
  if (cached) cached.status = "done";

  const feedback = document.querySelector(`.nts-classify-feedback[data-id="${id}"]`);
  if (feedback) {
    feedback.textContent = `→ ${meta.label} · marked done (original kept)`;
    setTimeout(() => { feedback.textContent = ""; }, 5000);
  }
  applyNoteListFilters("thinking");
}

function wireThinkingClassify(listType) {
  if (listType !== "thinking") return;
  document.querySelectorAll(".note-classify-select").forEach(sel => {
    sel.onchange = async () => {
      const target = sel.value;
      if (!target) return;
      const id = sel.dataset.id;
      sel.disabled = true;
      try {
        await classifyThinkingItem(id, target);
      } catch (err) {
        showToast(errorMessage(err));
      } finally {
        sel.value = "";
        sel.disabled = false;
      }
    };
  });
}

async function ntsCreateTemplateNote(listType, title, body) {
  await api(`/api/lists/${listType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  render();
}

function wireNoteIdentityActions(listType) {
  document.querySelectorAll(`.nts-app-identity[data-list-type="${listType}"] .nts-identity-action`).forEach(btn => {
    btn.onclick = async () => {
      if (listType === "thinking") {
        document.getElementById("note-body")?.focus();
      } else if (listType === "skill") {
        document.getElementById("skills-heightmap")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (listType === "problem") {
        await ntsCreateTemplateNote("problem", "War Room card", `
          <h2>Constraint</h2><p></p>
          <h2>Hypothesis</h2><p></p>
          <h2>Attack</h2><p></p>
          <h2>Next experiment</h2><p></p>`);
      } else if (listType === "funny") {
        const sparks = LAST_NOTE_ITEMS.filter(i => (i.title || noteBodyPlain(i.body)).trim());
        const pick = sparks[Math.floor(Math.random() * Math.max(1, sparks.length))];
        const preview = document.querySelector("[data-spark-preview]");
        const text = pick ? (pick.title || noteBodyPlain(pick.body).slice(0, 120)) : "No sparks yet — add one, then shuffle.";
        if (preview) preview.textContent = text;
        if (pick && navigator.clipboard) {
          try { await navigator.clipboard.writeText(text); } catch (_) { /* clipboard may be blocked */ }
        }
      } else if (listType === "essay") {
        const first = LAST_NOTE_ITEMS[0];
        if (first) ntsOpenFullEditorForNote(first.id, listType);
        else document.getElementById("note-body")?.focus();
      }
    };
  });

  document.querySelectorAll(".nts-essay-outline-panel [data-essay-id]").forEach(btn => {
    btn.onclick = () => {
      ntsOpenFullEditorForNote(btn.dataset.essayId, listType);
    };
  });
}

function ntsOpenFullEditorForNote(id, listType, options = {}) {
  const item = LAST_NOTE_ITEMS.find(i => String(i.id) === String(id));
  const titleEl = document.querySelector(`.note-title-edit[data-id="${id}"]`);
  const title = (titleEl?.value || item?.title || "essay").trim();
  openNtsFullscreenEditor(`note-body-${id}`, {
    withOutline: listType === "essay" || !!options.withOutline,
    basename: title,
    title,
    noteId: id,
    listType,
    ...options,
  });
}

function wireEssayFullscreen(listType) {
  if (listType !== "essay") return;
  document.querySelectorAll(".note-card.nts-essay-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest("button, input, select, a, .drag-handle, .field-history-panel, .nts-rich-toolbar, .note-classify-select")) return;
      ntsOpenFullEditorForNote(card.dataset.id, listType);
    });
  });
}

async function renderNoteList(listType) {
  const items = await api(`/api/lists/${listType}`);
  if (listType === "thinking") {
    try { NTS_PROJECTS_CACHE = await api("/api/projects"); } catch { NTS_PROJECTS_CACHE = []; }
  }
  const sortedItems = sortThinkingItemsForProject(items, listType);
  LAST_NOTE_ITEMS = sortedItems;
  const activeTab = Object.keys(NOTE_LIST_TABS).find(k => NOTE_LIST_TABS[k] === listType) || "Skills";
  await refreshCaptureListCounts();
  const listSwitcher = renderNtsListSwitcher(activeTab);

  return `
    ${notesScopedStyles()}
    <div class="nts-list-app-shell ${escapeHtml(NTS_LIST_IDENTITIES[listType]?.className || "")}">
    ${listSwitcher}
    ${renderNoteIdentityHeader(listType, sortedItems)}
    <div class="card nts-composer-card">
      <div data-rich-for="note-body">${NOTES_CARD_TOOLBAR_HTML || notesEnsureCardToolbarHtml()}</div>
      <div id="note-body" class="rich-editable" contenteditable="true" data-placeholder="Write freely -- no title needed"></div>
      <div class="nts-wordcount-bar" data-nts-wordcount-for="note-body">0 words · 0 chars · ≈ 0 tokens · 0 min · selection 0</div>
      <input type="text" id="note-title" placeholder="Title (optional)" style="width:100%; margin-top:6px;">
      <div class="nts-composer-actions" style="margin-top:8px;"><button type="button" class="primary" id="add-note">Add</button></div>
    </div>
    ${renderNoteToolbar(listType)}
    ${listType === "thinking" ? renderThinkingProjectBanner() : ""}
    ${listType === "thinking" ? renderThinkingInboxBanner() : ""}
    ${renderDocClassifyWidget(listType)}
    ${listType === "skill" ? `<div class="card"><strong>Skill heightmap</strong><p class="stub">x/y = skill similarity, height = proficiency.</p><div id="skills-heightmap" style="height:420px;"></div></div>` : ""}
    ${renderNoteCards(sortedItems, listType)}
    </div>`;
}

function wireNoteList(listType) {
  wireNtsListSwitcher();
  wireNotesToolbar("note-body", {
    basename: listType,
    docTitle: `New ${NTS_LIST_IDENTITIES[listType]?.title || "note"}`,
    onFullscreen: () => openNtsFullscreenEditor("note-body", {
      withOutline: listType === "essay",
      basename: document.getElementById("note-title")?.value?.trim() || listType,
      title: document.getElementById("note-title")?.value?.trim() || "",
      titleTargetId: "note-title",
    }),
  });
  wireDocClassifyWidget(listType);
  wireNoteSearchFilter(listType);
  wireNoteBulkSelect(listType);
  wireNoteSheetSort(listType);
  wireThinkingClassify(listType);
  wireThinkingProjectLink(listType);
  wireNoteIdentityActions(listType);
  wireEssayFullscreen(listType);

  document.getElementById("add-note").onclick = async () => {
    let title = document.getElementById("note-title").value.trim();
    let body = document.getElementById("note-body").innerHTML.trim();
    const bodyText = document.getElementById("note-body").textContent.trim();
    if (!title && !bodyText) return;
    if (!title) title = bodyText.length > 50 ? bodyText.slice(0, 50) + "..." : bodyText;
    const ctx = listType === "thinking" ? getDumpLinkProjectContext() : null;
    if (ctx) body = noteBodySetProjectId(body, ctx.id);
    await api(`/api/lists/${listType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (listType === "thinking" && window.WaypointGame && typeof window.WaypointGame.questProgress === "function") {
      window.WaypointGame.questProgress("reflect1");
    }
    render();
  };

  LAST_NOTE_ITEMS.forEach(i => {
    const title = i.title || "note";
    wireNotesToolbar(`note-body-${i.id}`, {
      basename: title,
      docTitle: title,
      itemId: i.id,
      onDuplicate: async () => {
        const titleEl = document.querySelector(`.note-title-edit[data-id="${i.id}"]`);
        const bodyEl = document.getElementById(`note-body-${i.id}`);
        await api(`/api/lists/${listType}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${(titleEl?.value || i.title || "Untitled").trim()} copy`,
            body: bodyEl?.innerHTML || i.body || "",
          }),
        });
        render();
      },
      withOutline: listType === "essay",
      onFullscreen: listType === "essay" || ntsIsLongNote(i.body)
        ? () => ntsOpenFullEditorForNote(i.id, listType)
        : undefined,
    });
    wireFieldHistory("note", i.id, "body", `note-body-${i.id}`);
  });

  wireNoteBodyAutosave(listType);
  applyNoteListFilters(listType);

  document.querySelectorAll(".note-open-full-editor").forEach(btn => {
    btn.onclick = () => ntsOpenFullEditorForNote(btn.dataset.id, btn.dataset.type);
  });

  document.querySelectorAll(".note-save").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      clearTimeout(NOTE_AUTOSAVE_TIMERS[id]);
      const title = document.querySelector(`.note-title-edit[data-id="${id}"]`).value.trim();
      const body = document.getElementById(`note-body-${id}`).innerHTML.trim();
      await api(`/api/lists/${btn.dataset.type}/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      showNoteSavedIndicator(id);
    };
  });

  document.querySelectorAll(".note-export-md").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const titleEl = document.querySelector(`.note-title-edit[data-id="${id}"]`);
      const bodyEl = document.getElementById(`note-body-${id}`);
      const item = LAST_NOTE_ITEMS.find(i => i.id === id);
      if (!item) return;
      const live = {
        ...item,
        title: titleEl ? titleEl.value.trim() : item.title,
        body: bodyEl ? bodyEl.innerHTML.trim() : item.body,
      };
      const slug = (live.title || "note").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase();
      downloadMarkdown(`${slug || "note"}.md`, noteItemToMd(live));
    };
  });

  document.querySelectorAll(".note-delete").forEach(btn => {
    btn.onclick = async () => {
      const label = btn.dataset.type === "thinking" ? "this dump entry" : "this entry";
      if (!window.confirm(`Delete ${label}?`)) return;
      await api(`/api/lists/${btn.dataset.type}/${btn.dataset.id}`, { method: "DELETE" });
      render();
    };
  });

  document.querySelectorAll(".note-ask-agent").forEach(btn => {
    btn.onclick = () => {
      const item = LAST_NOTE_ITEMS.find(i => i.id === Number(btn.dataset.id));
      if (!item) return;
      const bodyText = noteBodyPlain(item.body).replace(/\s+/g, " ").trim();
      askAgentAbout(`About "${item.title}"${bodyText ? ` (${bodyText})` : ""}: `);
    };
  });

  document.querySelectorAll(".note-status").forEach(cb => {
    cb.onchange = async () => {
      await api(`/api/lists/${cb.dataset.type}/${cb.dataset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: cb.checked ? "done" : "open" }),
      });
      const card = cb.closest(".note-card");
      if (card) {
        card.classList.toggle("done", cb.checked);
        card.dataset.status = cb.checked ? "done" : "open";
        document.querySelectorAll(`.note-card[data-id="${cb.dataset.id}"]`).forEach(c => {
          c.classList.toggle("done", cb.checked);
          c.dataset.status = cb.checked ? "done" : "open";
        });
        document.querySelectorAll(`.nts-sheet-row[data-id="${cb.dataset.id}"]`).forEach(row => {
          row.classList.toggle("done", cb.checked);
          row.dataset.status = cb.checked ? "done" : "open";
        });
        const compactCard = document.querySelector(`.note-card.nts-view-compact[data-id="${cb.dataset.id}"]`);
        const pills = compactCard?.querySelector(".nts-compact-pills");
        const donePill = pills?.querySelector(".nts-done-pill");
        if (pills) {
          if (cb.checked && !donePill) pills.insertAdjacentHTML("afterbegin", '<span class="pill nts-done-pill">done</span>');
          else if (!cb.checked && donePill) donePill.remove();
        }
        const cached = LAST_NOTE_ITEMS.find(i => i.id === Number(cb.dataset.id));
        if (cached) cached.status = cb.checked ? "done" : "open";
      }
      applyNoteListFilters(listType);
    };
  });

  document.querySelectorAll(".note-proficiency").forEach(inp => {
    inp.onchange = async () => {
      const response = await api(`/api/lists/skill/${inp.dataset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proficiency: Number(inp.value) }),
      });
      if (response.skill) {
        const cached = LAST_NOTE_ITEMS.find(item => String(item.id) === String(inp.dataset.id));
        if (cached) Object.assign(cached, response.skill);
        document.querySelectorAll(`[data-skill-meta="${inp.dataset.id}"]`).forEach(meta => {
          meta.outerHTML = renderSkillPracticeMeta(response.skill);
        });
      }
      await drawSkillsHeightmap();
    };
  });

  if (listType === "skill") {
    document.querySelectorAll(".note-card[data-id]").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("button, input, textarea, select, a, [contenteditable], .drag-handle")) return;
        selectSkillMapPoint(card.dataset.id, { scroll: false });
      });
    });
    drawSkillsHeightmap();
  }

  wireNoteDragReorder(listType);
}

async function drawSkillsHeightmap() {
  const el = document.getElementById("skills-heightmap");
  if (!el) return;
  const data = await api("/api/skills/heightmap");
  if (data.error) {
    el.innerHTML = `<p class="stub">${escapeHtml(data.error)}</p>`;
    return;
  }
  if (!window.Plotly) return;
  const theme = plotlyThemeVars();
  await Plotly.newPlot(el.id, [
    {
      type: "surface",
      x: data.grid_x, y: data.grid_y, z: data.grid_z,
      colorscale: "Viridis", opacity: 0.85, showscale: false,
    },
    {
      type: "scatter3d", mode: "markers+text",
      x: data.points.map(p => p.x), y: data.points.map(p => p.y), z: data.points.map(p => p.z),
      text: data.points.map(p => p.title), textposition: "top center",
      customdata: data.points.map(p => p.id),
      hovertemplate: "%{text}<br>proficiency %{z}<extra></extra>",
      marker: { size: 5, color: theme.inkPrimary },
    },
  ], {
    paper_bgcolor: theme.card, plot_bgcolor: theme.card,
    font: { color: theme.ink },
    scene: {
      xaxis: { visible: false }, yaxis: { visible: false }, zaxis: { visible: false },
      bgcolor: theme.card,
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
  }, { displayModeBar: false, displaylogo: false });
  el._skillPoints = data.points;
  if (typeof el.removeAllListeners === "function") el.removeAllListeners("plotly_click");
  el.on("plotly_click", event => {
    const point = event?.points?.[0];
    if (!point || point.curveNumber !== 1) return;
    selectSkillMapPoint(point.customdata);
  });
  if (SELECTED_SKILL_ID != null) selectSkillMapPoint(SELECTED_SKILL_ID, { scroll: false });
}

function selectSkillMapPoint(skillId, { scroll = true } = {}) {
  SELECTED_SKILL_ID = String(skillId);
  const cards = Array.from(document.querySelectorAll(`.note-card[data-id="${SELECTED_SKILL_ID}"]`));
  document.querySelectorAll(".note-card.skill-map-selected").forEach(card => {
    card.classList.remove("skill-map-selected");
  });
  cards.forEach(card => card.classList.add("skill-map-selected"));
  if (scroll) {
    const visible = cards.find(card => card.offsetParent !== null) || cards[0];
    visible?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const map = document.getElementById("skills-heightmap");
  const points = map?._skillPoints || [];
  if (!window.Plotly || !map || !points.length) return;
  const selectedIndex = points.findIndex(point => String(point.id) === SELECTED_SKILL_ID);
  const styles = getComputedStyle(document.documentElement);
  const base = styles.getPropertyValue("--ink-primary").trim();
  const selected = styles.getPropertyValue("--accent").trim();
  Plotly.restyle(map, {
    "marker.color": [points.map((_, idx) => idx === selectedIndex ? selected : base)],
    "marker.size": [points.map((_, idx) => idx === selectedIndex ? 9 : 5)],
  }, [1]);
}

function wireNoteDragReorder(listType) {
  const view = getNotePref(listType, "view", "list");
  if (view === "table") return;
  let draggedId = null;
  document.querySelectorAll(".note-card").forEach(row => {
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
      const group = row.closest(".note-group");
      const dragging = group ? group.querySelector(".note-card.dragging") : null;
      if (!dragging || dragging.closest(".note-group") !== group) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.parentElement.insertBefore(dragging, before ? row : row.nextSibling);
    });

    row.addEventListener("drop", async e => {
      e.preventDefault();
      if (draggedId === null) return;
      const group = row.closest(".note-group");
      if (!group) return;
      const cardClass = view === "compact" ? ".note-card.nts-view-compact" : ".note-card.nts-view-list";
      const ids = Array.from(group.querySelectorAll(cardClass)).map(r => Number(r.dataset.id));
      try {
        await api(`/api/lists/${listType}/reorder`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      } catch (err) {
        showToast(errorMessage(err));
      }
      render();
    });
  });
}
