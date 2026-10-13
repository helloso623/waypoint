// --- Automation: visual node-graph -> Python ---------------------------------------------------------

let WF_NODE_TYPES = {};
const WF_VARIABLE_TYPES = ["int", "float", "string", "bool", "list"];
const WF_PIN_TYPES = ["int", "float", "string", "bool", "list", "json", "any"];
const WF_IDENTIFIER_PARAMS = new Set(["variable", "name", "list_var", "dict_var", "as"]);
const WF_COMMENT_COLORS = ["#2a4a6b", "#3a5a2a", "#5a3a2a", "#4a2a5a", "#3a4a4a"];
const WF_NOTE_COLORS = ["#4a4a2a", "#2a4a4a", "#4a2a4a", "#2a3a4a", "#3a4a3a"];
const WF_ZOOM_MIN = 0.25;
const WF_ZOOM_MAX = 2;
const WF_SCROLL_PAD = 120;
const WF_GRID_SNAP = 16;
let WF_CANVAS_HOVER = false;
let WF_MOUSE_ENTERED_CANVAS = false;
let WF_CRAFT_TICK_EL = null;
let WF_CRAFT_TICK_TIMER = null;
let WF_SPLIT_VIEW = localStorage.getItem("wfSplitView") !== "0";
let WF_CODE_LANG = localStorage.getItem("wfCodeLang") === "cpp" ? "cpp" : "python";
let WF_CODE_LABELS = localStorage.getItem("wfCodeLabels") === "1";

function wfDismissCraftTick() {
  if (WF_CRAFT_TICK_TIMER) {
    clearTimeout(WF_CRAFT_TICK_TIMER);
    WF_CRAFT_TICK_TIMER = null;
  }
  if (WF_CRAFT_TICK_EL) {
    WF_CRAFT_TICK_EL.classList.remove("wf-craft-tick--visible", "wf-craft-tick--fade");
  }
}

function wfShowCraftTick(text, clientX, clientY) {
  if (!text) return;
  const reduced = typeof prefersReducedMotion === "function" && prefersReducedMotion();
  if (!WF_CRAFT_TICK_EL) {
    WF_CRAFT_TICK_EL = document.createElement("div");
    WF_CRAFT_TICK_EL.className = "wf-craft-tick";
    WF_CRAFT_TICK_EL.setAttribute("aria-hidden", "true");
    document.body.appendChild(WF_CRAFT_TICK_EL);
  }
  if (WF_CRAFT_TICK_TIMER) clearTimeout(WF_CRAFT_TICK_TIMER);
  WF_CRAFT_TICK_EL.textContent = text;
  WF_CRAFT_TICK_EL.style.left = `${clientX + 12}px`;
  WF_CRAFT_TICK_EL.style.top = `${clientY - 10}px`;
  WF_CRAFT_TICK_EL.classList.remove("wf-craft-tick--fade");
  WF_CRAFT_TICK_EL.classList.add("wf-craft-tick--visible");
  const dwell = 600;
  WF_CRAFT_TICK_TIMER = setTimeout(() => {
    if (reduced) {
      WF_CRAFT_TICK_EL.classList.remove("wf-craft-tick--visible");
    } else {
      WF_CRAFT_TICK_EL.classList.add("wf-craft-tick--fade");
      setTimeout(() => WF_CRAFT_TICK_EL?.classList.remove("wf-craft-tick--visible", "wf-craft-tick--fade"), 120);
    }
    WF_CRAFT_TICK_TIMER = null;
  }, dwell);
}

function wfSelectionScreenCenter() {
  const canvas = document.getElementById("node-canvas");
  if (!canvas || !WF_SELECTED_NODES.size) return null;
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  WF_SELECTED_NODES.forEach(id => {
    const n = CURRENT_WF.nodes.find(nd => nd.id === id);
    const card = document.querySelector(`.node-card[data-node-id="${id}"], .wf-reroute[data-node-id="${id}"]`);
    if (!n || !card) return;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + card.offsetWidth);
    maxY = Math.max(maxY, n.y + card.offsetHeight);
  });
  if (!isFinite(minX)) return null;
  return {
    x: cr.left + m.panX + ((minX + maxX) / 2) * m.zoom,
    y: cr.top + m.panY + ((minY + maxY) / 2) * m.zoom,
  };
}

function wfCanvasVisibleRect() {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return null;
  const cr = canvas.getBoundingClientRect();
  const viewportWidth = document.documentElement?.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement?.clientHeight || window.innerHeight;
  const left = Math.max(0, cr.left);
  const top = Math.max(0, cr.top);
  const right = Math.min(viewportWidth, cr.right);
  const bottom = Math.min(viewportHeight, cr.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function wfCanvasScreenCenter() {
  const visible = wfCanvasVisibleRect();
  if (!visible) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: visible.left + visible.width / 2, y: visible.top + visible.height / 2 };
}

const WF_FAVORITE_NODES = [
  { type: "on_tick", label: "On Tick" },
  { type: "set_widget", label: "Set Widget" },
  { type: "if", label: "Branch (If)" },
  { type: "exec_gate", label: "Execution Gate" },
  { type: "compare", label: "Compare" },
  { type: "print", label: "Print" },
  { type: "custom", label: "Custom Python" },
  { type: "for", label: "For Loop" },
  { type: "literal_bool", label: "Bool" },
  { type: "literal_number", label: "Number" },
  { type: "add", label: "Add (+)" },
  { type: "length", label: "Length (len)" },
  { type: "str_upper", label: "Text Upper" },
  { type: "list_append", label: "List Append" },
  { type: "literal_string", label: "String" },
];

const WF_CATALOG_SEARCH_KEYS = {
  cast_string: ["cast", "convert", "int to string", "float to string", "bool to string", "list to string", "json to string"],
  cast_int: ["cast", "convert", "string to int", "float to int", "bool to int"],
  cast_float: ["cast", "convert", "string to float", "int to float", "bool to float"],
  cast_bool: ["cast", "convert", "string to bool", "int to bool", "float to bool", "list to bool", "json to bool"],
  cast_list: ["cast", "convert", "string to list", "json to list", "array"],
  cast_json: ["cast", "convert", "string to json", "list to json", "parse json"],
};

function wfIsEmptyPaletteTarget(e) {
  if (e.target.closest(".node-card, .wf-reroute, .wf-note, .wf-pin, .wf-wire, .wf-comment-title, .wf-comment-resize, input, textarea, select, button")) {
    return false;
  }
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return false;
  const t = e.target;
  return t === canvas || t.id === "wf-world" || t.id === "node-svg" || canvas.contains(t);
}

function wfEnsurePaletteMouseCoords() {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  const visible = wfCanvasVisibleRect();
  const noClient = WF_LAST_MOUSE.clientX === 0 && WF_LAST_MOUSE.clientY === 0;
  const lastClientIsVisible = !!visible && !noClient && WF_MOUSE_ENTERED_CANVAS
    && WF_LAST_MOUSE.clientX >= visible.left && WF_LAST_MOUSE.clientX <= visible.right
    && WF_LAST_MOUSE.clientY >= visible.top && WF_LAST_MOUSE.clientY <= visible.bottom;
  const scr = lastClientIsVisible
    ? { x: WF_LAST_MOUSE.clientX, y: WF_LAST_MOUSE.clientY }
    : wfCanvasScreenCenter();
  const world = wfClientToWorld(scr.x, scr.y);
  WF_LAST_MOUSE.clientX = scr.x;
  WF_LAST_MOUSE.clientY = scr.y;
  WF_LAST_MOUSE.worldX = world.x;
  WF_LAST_MOUSE.worldY = world.y;
}

function wfPalettePlaceCoords() {
  wfEnsurePaletteMouseCoords();
  return { x: WF_LAST_MOUSE.worldX, y: WF_LAST_MOUSE.worldY };
}
let WF_SPACE_PAN = false;
let WF_SPACE_ARM = null; // { t0, dragged } while Space held for pan-or-tap
let WF_PAN_ACTIVE = false;
// Same identifier rule workflow.py's generate_code() enforces (v["name"].isidentifier() and
// not keyword.iskeyword(v["name"])) -- kept in sync by hand since there's no shared runtime
// between Python and this file. Python 3.12 keyword.kwlist.
const WF_PY_KEYWORDS = new Set(["False", "None", "True", "and", "as", "assert", "async", "await",
  "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from",
  "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield"]);
function isValidWfVarName(name) {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !WF_PY_KEYWORDS.has(name);
}

// workflow.py _code_expr() still treats dotted identifiers as live Python. This
// JS-side guard is the owned-file mitigation (workflow.py is not in this slice).
const WF_UNSAFE_EXPR_ROOTS = new Set(["os", "sys", "subprocess", "builtins", "importlib",
  "pathlib", "shutil", "socket", "pickle", "ctypes", "pty", "posix", "nt", "webbrowser",
  "http", "urllib", "requests", "eval", "exec", "open", "compile", "globals", "locals",
  "vars", "getattr", "setattr", "delattr"]);
const WF_CODE_PARAM_NAMES = new Set(["body", "expression", "lambda_body", "code", "script"]);
let WF_LAST_EMIT_GUARD = 0;

function wfLooksLikeUnsafePyExpr(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  if (s.includes("\0") || s.includes("__")) return true;
  const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\.|$)/);
  return !!(m && WF_UNSAFE_EXPR_ROOTS.has(m[1]));
}

function wfSanitizeParamValue(name, raw, asIdentifier) {
  let s = String(raw ?? "").replace(/\u0000/g, "");
  if (asIdentifier || WF_IDENTIFIER_PARAMS.has(name)) {
    if (isValidWfVarName(s)) return s;
    let cleaned = s.replace(/[^A-Za-z0-9_]/g, "_");
    if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
    return isValidWfVarName(cleaned) ? cleaned : "x";
  }
  if (WF_CODE_PARAM_NAMES.has(name)) return s;
  if (wfLooksLikeUnsafePyExpr(s)) return JSON.stringify(s);
  return s;
}

function wfSanitizeGraphForEmit(graph) {
  WF_LAST_EMIT_GUARD = 0;
  const nodes = (graph.nodes || []).map(n => {
    const params = { ...(n.params || {}) };
    Object.keys(params).forEach(k => {
      const before = params[k];
      params[k] = wfSanitizeParamValue(k, before, false);
      if (params[k] !== before) WF_LAST_EMIT_GUARD += 1;
    });
    const out = { ...n, params };
    if (n.varName != null) {
      const safe = wfSanitizeParamValue("variable", n.varName, true);
      if (safe !== n.varName) { out.varName = safe; WF_LAST_EMIT_GUARD += 1; }
    }
    if (n.funcName != null) {
      const safe = wfSanitizeParamValue("name", n.funcName, true);
      if (safe !== n.funcName) { out.funcName = safe; WF_LAST_EMIT_GUARD += 1; }
    }
    return out;
  });
  const variables = (graph.variables || []).map(v => {
    const name = wfSanitizeParamValue("variable", v.name, true);
    const deflt = wfSanitizeParamValue("default", v.default, false);
    if (name !== v.name || deflt !== v.default) WF_LAST_EMIT_GUARD += 1;
    return { ...v, name, default: deflt };
  });
  return { ...graph, nodes, variables };
}
function freshWorkflow() {
  return {
    id: null, name: "Untitled workflow",
    nodes: [{ id: "start", type: "start", x: 30, y: 30, params: {} }],
    edges: [], variables: [], functions: [], comments: [], notes: [],
    ui: { widgets: [], device: "phone" },
    meta: { zoom: 1, panX: 0, panY: 0 },
  };
}

function wfMeta() {
  if (!CURRENT_WF.meta) CURRENT_WF.meta = { zoom: 1, panX: 0, panY: 0 };
  const m = CURRENT_WF.meta;
  let z = Number(m.zoom);
  if (!Number.isFinite(z)) z = 1;
  m.zoom = Math.min(WF_ZOOM_MAX, Math.max(WF_ZOOM_MIN, z));
  m.panX = Number(m.panX) || 0;
  m.panY = Number(m.panY) || 0;
  return m;
}

function wfIsPureNode(n) {
  return !!(WF_NODE_TYPES[n?.type] || {}).pure;
}

function wfIsEntryNodeType(type) {
  return type === "start" || type === "ui_event" || type === "keyboard_event"
    || type === "on_tick" || type === "func_entry";
}

function wfNodeIsCompact(n) {
  return wfIsPureNode(n) || n.type === "get_var";
}

function wfNormalizeParams(def) {
  return (def.params || []).map(p => {
    if (typeof p === "string") {
      return { name: p, type: "string", wire: !WF_IDENTIFIER_PARAMS.has(p) };
    }
    return {
      name: p.name,
      type: p.type || "string",
      wire: p.wire !== false && !WF_IDENTIFIER_PARAMS.has(p.name),
    };
  });
}

function wfParamDefs(n) {
  const def = WF_NODE_TYPES[n.type] || {};
  if (n.type === "set_var") {
    const vtype = (wfVarByName(n.varName) || {}).type || "string";
    return [{ name: "value", type: vtype, wire: true }];
  }
  if (n.type === "call_func" && n.funcName) {
    return (wfFuncByName(n.funcName)?.params || []).map(p => ({
      name: p.name, type: p.type || "string", wire: true,
    }));
  }
  if (n.type === "func_return" && n.funcName) {
    const fn = wfFuncByName(n.funcName);
    return fn?.returns ? [{ name: "return", type: fn.returns, wire: true }] : [];
  }
  if (n.type === "reroute") {
    if (wfRerouteWireKind(n) === "exec") return [];
    const pinType = wfReroutePinType(n) || "any";
    return [{ name: "in", type: pinType, wire: true }];
  }
  return wfNormalizeParams(def);
}

function wfDataOutputDefs(n) {
  const def = WF_NODE_TYPES[n.type] || {};
  if (n.type === "get_var") {
    const vtype = (wfVarByName(n.varName) || {}).type || "string";
    return [{ port: "value", type: vtype, label: n.varName || "value" }];
  }
  if (n.type === "call_func" && n.funcName) {
    const fn = wfFuncByName(n.funcName);
    return fn?.returns ? [{ port: "result", type: fn.returns, label: "result" }] : [];
  }
  if (n.type === "func_entry" && n.funcName) {
    return (wfFuncByName(n.funcName)?.params || []).map(p => ({
      port: p.name, type: p.type || "string", label: p.name,
    }));
  }
  if (n.type === "reroute") {
    if (wfRerouteWireKind(n) === "exec") return [];
    const pinType = wfReroutePinType(n) || "any";
    return [{ port: "out", type: pinType, label: "" }];
  }
  return (def.dataOutputs || []).map(d => ({
    port: d.port, type: d.type || "any", label: d.port,
  }));
}

function wfIsParamWired(nodeId, port) {
  return CURRENT_WF.edges.some(e => e.kind === "data" && e.to === nodeId && e.toPort === port);
}

function wfTypesCompatible(src, dst) {
  if (!src || !dst || src === "any" || dst === "any") return true;
  if (src === dst) return true;
  const nums = new Set(["int", "float"]);
  return nums.has(src) && nums.has(dst);
}

function wfTypesMismatch(src, dst) {
  return !wfTypesCompatible(src, dst);
}

function wfCastValue(type, value) {
  if (type === "cast_string") {
    return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  if (type === "cast_int" || type === "cast_float") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Cannot cast ${String(value)} to number`);
    return type === "cast_int" ? Math.trunc(number) : number;
  }
  if (type === "cast_bool") {
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    return !!value;
  }
  if (type === "cast_list") {
    if (Array.isArray(value)) return [...value];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) { /* plain strings become character lists */ }
      return Array.from(value);
    }
    if (value !== null && typeof value === "object") return Object.keys(value);
    throw new Error(`Cannot cast ${String(value)} to list`);
  }
  if (type === "cast_json") return typeof value === "string" ? JSON.parse(value) : value;
  return value;
}

function wfPinTypeStyle(type) {
  if (!type) return "";
  const t = WF_PIN_TYPES.includes(type) ? type : "any";
  // Border + CSS var for fill; fill is dark until .wf-pin-connected.
  return `border-color:var(--type-${t},#888);--wf-pin-color:var(--type-${t},#888);background:var(--bg-shell);`;
}

function wfIsPinConnected(nodeId, kind, port, side) {
  const edges = CURRENT_WF?.edges || [];
  if (kind === "data") {
    if (side === "in") {
      return edges.some(e => e.kind === "data" && e.to === nodeId && e.toPort === port);
    }
    return edges.some(e => e.kind === "data" && e.from === nodeId && (e.fromPort || "value") === port);
  }
  // exec
  if (side === "in") {
    return edges.some(e => e.kind !== "data" && e.to === nodeId);
  }
  return edges.some(e => e.kind !== "data" && e.from === nodeId && (e.fromPort || "next") === port);
}

function wfUpdatePinConnectionState() {
  document.querySelectorAll(".wf-pin").forEach(pin => {
    const nodeId = pin.dataset.pinNode;
    if (!nodeId) return;
    const kind = pin.dataset.pinKind || "exec";
    const port = pin.dataset.pinPort || (kind === "exec" ? "exec" : "value");
    const side = pin.classList.contains("wf-pin-in") ? "in" : "out";
    pin.classList.toggle("wf-pin-connected", wfIsPinConnected(nodeId, kind, port, side));
  });
}

let CURRENT_WF = freshWorkflow();
let WF_LIST = [];
let wfNodeCounter = 0;
let WF_VARIABLES_COLLAPSED = true;
let WF_FUNCTIONS_COLLAPSED = true;
let WF_SELECTED_NODES = new Set(); // node ids currently marquee-selected -- reset on each render
let WF_SELECTED_EDGE = null;
let WF_DIAGNOSTICS = {};
let WF_FOCUS_FUNC = null;
let WF_SIM = null;
let WF_WATCH_VALUES = {};
const WF_SIM_MAX_STEPS = 1000;
const WF_SIM_ANIM_MS = 120;
const WF_NODE_FIRE_MS = 280;
let WF_NODE_FIRE_TIMERS = new Map();
let WF_UNDO_STACK = [];
let WF_REDO_STACK = [];
const WF_UNDO_MAX = 30;
let WF_CLIPBOARD = null;
let WF_LAST_MOUSE = { clientX: 0, clientY: 0, worldX: 200, worldY: 200 };
let WF_MINIMAP_VISIBLE = true;
let WF_WIRE_DRAG = null;
let WF_WIRE_DRAFT_RAF = null;

function wfCancelWireDraftRaf() {
  if (WF_WIRE_DRAFT_RAF) {
    cancelAnimationFrame(WF_WIRE_DRAFT_RAF);
    WF_WIRE_DRAFT_RAF = null;
  }
}
let WF_CHIP_DRAG = null;
let WF_VAR_GHOST_EL = null;
let WF_ALIGN_TOOLBAR = null;
let WF_PIN_TOOLTIP_EL = null;
let WF_PIN_TOOLTIP_TIMER = null;
let WF_CANVAS_MODE = "select";
let WF_GRAPH_WIRED = false;
let WF_SNAP_ENABLED = true;
let WF_CHAIN_FOCUS = null;
let WF_CHAIN_TOOLBAR = null;
let WF_GRAPH_SEARCH = { open: false, query: "", matches: [], index: -1 };
let WF_BUBBLES_VISIBLE = true;
let WF_WATCH_STALE = false;
let WF_DIAG_RESULTS = [];
let WF_GUIDE_EL = null;
const WF_GRAPH_SEARCH_RECENT_KEY = "wfGraphSearchRecent";
const WF_CAT_ICONS = {
  event: "⚡", flow: "➜", math: "∑", string: "Aa", collection: "[]", datetime: "🕐",
  data: "◆", utility: "⚙", variable: "v", function: "ƒ", circuit: "⌁",
};

function wfGraphPath() {
  return WF_FOCUS_FUNC ? `fn:${WF_FOCUS_FUNC}` : "main";
}

function wfEnsureMetaCollections() {
  const m = wfMeta();
  if (!m.bookmarks) m.bookmarks = {};
  if (!m.scopeViewports) m.scopeViewports = {};
  if (!Array.isArray(m.watches)) m.watches = [];
  return m;
}

function wfCategoryIcon(cat) {
  return WF_CAT_ICONS[cat] || "◻";
}

function wfNodeVisual(type) {
  const def = WF_NODE_TYPES[type] || {};
  const vis = def.visual || {};
  const cat = def.category || "utility";
  const catVar = `var(--cat-${cat})`;
  const color = vis.color || catVar;
  const icon = vis.icon || wfCategoryIcon(cat);
  const gradient = vis.gradient || vis.headerGradient
    || `linear-gradient(90deg, color-mix(in srgb, ${color} 30%, var(--bg-card)), color-mix(in srgb, ${color} 10%, var(--bg-card)))`;
  return { icon, gradient, color, category: cat };
}

function wfEmptyStub(message, hint) {
  const msg = escapeHtml(message);
  const sub = hint ? `<div class="wf-empty-hint">${escapeHtml(hint)}</div>` : "";
  return `<div class="wf-empty-stub"><div>${msg}</div>${sub}</div>`;
}

function wfNodeHeaderLabel(n) {
  const def = WF_NODE_TYPES[n.type] || { label: n.type };
  if (n.type === "literal_number" || n.type === "literal_string" || n.type === "literal_bool") {
    const raw = ((n.params || {}).value ?? "").toString();
    if (raw) return `${def.label}: ${raw.length > 18 ? raw.slice(0, 16) + "…" : raw}`;
  }
  if ((n.type === "get_var" || n.type === "set_var") && n.varName) {
    return `${n.type === "get_var" ? "Get" : "Set"} ${n.varName}`;
  }
  if (n.type === "call_func" && n.funcName) return `Call ${n.funcName}`;
  if (n.type === "func_entry" && n.funcName) return `Function ${n.funcName}`;
  if (n.type === "func_return" && n.funcName) return `Return (${n.funcName})`;
  if (n.type === "ui_event") return n.label || `On_${(n.params || {}).widget_id}_${(n.params || {}).event}`;
  return def.label || n.type;
}

function wfNodeCodeLabel(n) {
  if (n.type === "get_var") return `get(${n.varName || "variable"})`;
  if (n.type === "set_var") return `set(${n.varName || "variable"})`;
  if (n.type === "call_func") return `${n.funcName || "function"}(…)`;
  const params = wfParamDefs(n).map(p => p.name).join(", ");
  return `${n.type}(${params})`;
}

function wfNodeInitials(n) {
  const label = wfNodeHeaderLabel(n);
  const parts = label.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return (n.type || "?").slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function wfUpdateLodClasses() {
  const z = wfMeta().zoom;
  const block = z < WF_ZOOM_MIN;
  const compact = !block && z < 0.65;
  document.querySelectorAll(".node-card").forEach(card => {
    card.classList.toggle("block-LOD", block);
    card.classList.toggle("compact-LOD", compact);
  });
}

function wfSaveScopeViewport() {
  const m = wfEnsureMetaCollections();
  const path = wfGraphPath();
  m.scopeViewports[path] = { panX: m.panX, panY: m.panY, zoom: m.zoom };
}

function wfRestoreScopeViewport(path) {
  const m = wfEnsureMetaCollections();
  const v = m.scopeViewports[path];
  if (!v) return false;
  m.panX = v.panX;
  m.panY = v.panY;
  m.zoom = v.zoom;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
  wfDrawMinimap();
  return true;
}

function wfNavigateToMain() {
  wfSaveScopeViewport();
  wfSetFocusFunction(null);
  if (!wfRestoreScopeViewport("main")) wfFrameView();
  wfRenderBreadcrumbBar();
}

function wfRenderBreadcrumbBar() {
  const bar = document.getElementById("wf-fn-breadcrumb");
  if (!bar) return;
  if (!WF_FOCUS_FUNC) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `<button type="button" class="wf-bc-seg" data-wf-bc="main">Main</button>
    <span class="wf-bc-sep">/</span>
    <span class="wf-bc-current">${escapeHtml(WF_FOCUS_FUNC)}</span>`;
  bar.querySelector("[data-wf-bc='main']")?.addEventListener("click", () => wfNavigateToMain());
}

function wfBookmarkRailHtml() {
  const m = wfEnsureMetaCollections();
  const slots = [1, 2, 3, 4, 5].map(i => {
    const filled = !!(m.bookmarks[i]);
    return `<button type="button" class="wf-bookmark-slot${filled ? " wf-bookmark-filled" : ""}" data-wf-bookmark="${i}" title="Bookmark ${i}">${i}</button>`;
  }).join("");
  return `<div class="wf-bookmark-rail" id="wf-bookmark-rail" aria-label="Viewport bookmarks">${slots}</div>`;
}

function wfSaveBookmark(slot) {
  const m = wfEnsureMetaCollections();
  m.bookmarks[slot] = { graphPath: wfGraphPath(), panX: m.panX, panY: m.panY, zoom: m.zoom };
  wfRefreshBookmarkRail();
}

function wfJumpBookmark(slot) {
  const m = wfEnsureMetaCollections();
  const bm = m.bookmarks[slot];
  if (!bm) return;
  if (bm.graphPath && bm.graphPath !== wfGraphPath()) {
    if (bm.graphPath === "main") wfSetFocusFunction(null);
    else if (bm.graphPath.startsWith("fn:")) wfSetFocusFunction(bm.graphPath.slice(3));
  }
  m.panX = bm.panX;
  m.panY = bm.panY;
  m.zoom = bm.zoom;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
  wfDrawMinimap();
  wfRenderBreadcrumbBar();
}

function wfRefreshBookmarkRail() {
  document.querySelectorAll(".wf-bookmark-slot").forEach(btn => {
    const slot = Number(btn.dataset.wfBookmark);
    const filled = !!(wfEnsureMetaCollections().bookmarks[slot]);
    btn.classList.toggle("wf-bookmark-filled", filled);
  });
}

function wfExecChainFrom(nodeId, direction) {
  const chain = new Set([nodeId]);
  if (direction === "upstream" || direction === "both") {
    const queue = [nodeId];
    const seen = new Set([nodeId]);
    while (queue.length) {
      const id = queue.shift();
      CURRENT_WF.edges.forEach(e => {
        if (e.kind === "data" || e.to !== id) return;
        if (!seen.has(e.from)) { seen.add(e.from); chain.add(e.from); queue.push(e.from); }
      });
    }
  }
  if (direction === "downstream" || direction === "both") {
    const queue = [nodeId];
    const seen = new Set([nodeId]);
    while (queue.length) {
      const id = queue.shift();
      CURRENT_WF.edges.forEach(e => {
        if (e.kind === "data" || e.from !== id) return;
        if (!seen.has(e.to)) { seen.add(e.to); chain.add(e.to); queue.push(e.to); }
      });
    }
  }
  return chain;
}

function wfGraphEditorActive() {
  return AUTOMATION_STUDIO_OPEN && STUDIO_TAB === "graph" && !!document.getElementById("node-canvas");
}

function wfPointerOnEmptyCanvas(clientX, clientY, target) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return false;
  const cr = canvas.getBoundingClientRect();
  if (clientX < cr.left || clientX > cr.right || clientY < cr.top || clientY > cr.bottom) return false;
  if (target?.closest?.(".node-card, .wf-reroute, .wf-pin")) return false;
  return true;
}

function wfClearChainFocus() {
  WF_CHAIN_FOCUS = null;
  if (WF_CHAIN_TOOLBAR) { WF_CHAIN_TOOLBAR.remove(); WF_CHAIN_TOOLBAR = null; }
  document.querySelectorAll(".wf-chain-focus, .wf-chain-dim").forEach(el => {
    el.classList.remove("wf-chain-focus", "wf-chain-dim");
  });
}

function wfApplyChainFocus(chainSet) {
  WF_CHAIN_FOCUS = chainSet;
  document.querySelectorAll(".node-card, .wf-reroute").forEach(el => {
    const id = el.dataset.nodeId;
    const inChain = chainSet.has(id);
    el.classList.toggle("wf-chain-focus", inChain);
    el.classList.toggle("wf-chain-dim", !inChain);
  });
}

function wfChainFocusDirection(direction) {
  if (WF_SELECTED_NODES.size !== 1) return;
  const nodeId = [...WF_SELECTED_NODES][0];
  wfApplyChainFocus(wfExecChainFrom(nodeId, direction));
}

function wfUpdateChainFocusToolbar() {
  if (WF_CHAIN_TOOLBAR) { WF_CHAIN_TOOLBAR.remove(); WF_CHAIN_TOOLBAR = null; }
  if (!wfGraphEditorActive() || WF_SELECTED_NODES.size !== 1) {
    wfClearChainFocus();
    return;
  }
  const nodeId = [...WF_SELECTED_NODES][0];
  const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
  if (!n) return;
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  const card = document.querySelector(`.node-card[data-node-id="${nodeId}"], .wf-reroute[data-node-id="${nodeId}"]`);
  if (!card) return;
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  const screenX = cr.left + m.panX + (n.x + (card.offsetWidth / 2)) * m.zoom;
  const screenY = cr.top + m.panY + n.y * m.zoom - 32;
  const bar = document.createElement("div");
  bar.className = "wf-chain-toolbar";
  bar.id = "wf-chain-toolbar";
  bar.style.left = Math.max(8, screenX - 90) + "px";
  bar.style.top = Math.max(8, screenY) + "px";
  bar.innerHTML = `
    <button type="button" class="secondary" data-chain-focus="upstream" title="Upstream chain">Upstream</button>
    <button type="button" class="secondary" data-chain-focus="downstream" title="Downstream chain">Downstream</button>
    <button type="button" class="secondary" data-chain-focus="both" title="Full chain">Both</button>`;
  document.body.appendChild(bar);
  WF_CHAIN_TOOLBAR = bar;
  bar.querySelectorAll("[data-chain-focus]").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); wfChainFocusDirection(btn.dataset.chainFocus); };
  });
}

function wfGraphSearchRecent() {
  try {
    const raw = localStorage.getItem(WF_GRAPH_SEARCH_RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function wfGraphSearchPushRecent(q) {
  if (!q || !q.trim()) return;
  const t = q.trim();
  const list = wfGraphSearchRecent().filter(x => x !== t);
  list.unshift(t);
  localStorage.setItem(WF_GRAPH_SEARCH_RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}

function wfGraphSearchCollect(query) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];
  const hits = [];
  const push = (nodeId, label, kind) => {
    if (!nodeId) return;
    hits.push({ nodeId, label, kind });
  };
  (CURRENT_WF.nodes || []).forEach(n => {
    const title = wfNodeHeaderLabel(n);
    const blob = [title, n.type, n.varName, n.funcName, JSON.stringify(n.params || {})].join(" ").toLowerCase();
    if (blob.includes(q)) push(n.id, title, "node");
  });
  (CURRENT_WF.variables || []).forEach(v => {
    const blob = [v.name, v.type, v.default].join(" ").toLowerCase();
    if (blob.includes(q)) {
      const ref = (CURRENT_WF.nodes || []).find(n =>
        (n.type === "get_var" || n.type === "set_var") && n.varName === v.name);
      if (ref) push(ref.id, `Variable ${v.name}`, "variable");
    }
  });
  (CURRENT_WF.functions || []).forEach(f => {
    const blob = [f.name, ...(f.params || []).map(p => p.name), f.returns].join(" ").toLowerCase();
    if (blob.includes(q)) {
      const ref = (CURRENT_WF.nodes || []).find(n =>
        (n.type === "call_func" || n.type === "func_entry") && n.funcName === f.name);
      if (ref) push(ref.id, `Function ${f.name}`, "function");
    }
  });
  (CURRENT_WF.comments || []).forEach(c => {
    const blob = [(c.title || ""), (c.body || "")].join(" ").toLowerCase();
    if (!blob.includes(q)) return;
    const inside = (CURRENT_WF.nodes || []).find(n =>
      n.x >= c.x && n.y >= c.y && n.x <= c.x + (c.w || 240) && n.y <= c.y + (c.h || 140));
    push(inside?.id || null, c.title || "Comment", "comment");
  });
  const seen = new Set();
  return hits.filter(h => {
    if (!h.nodeId || seen.has(h.nodeId)) return false;
    seen.add(h.nodeId);
    return true;
  });
}

function wfGraphSearchPillHtml() {
  return `<div class="wf-graph-search-pill" id="wf-graph-search-pill" hidden>
    <input type="text" id="wf-graph-search-input" placeholder="Search graph…" autocomplete="off" spellcheck="false">
    <span id="wf-graph-search-count" class="wf-graph-search-count"></span>
    <button type="button" class="secondary" id="wf-graph-search-close" title="Close">×</button>
  </div>`;
}

function wfOpenGraphSearch(prefill) {
  const pill = document.getElementById("wf-graph-search-pill");
  const input = document.getElementById("wf-graph-search-input");
  if (!pill || !input) return;
  pill.hidden = false;
  WF_GRAPH_SEARCH.open = true;
  if (prefill) input.value = prefill;
  input.focus();
  input.select();
  wfGraphSearchUpdate(input.value);
}

function wfCloseGraphSearch() {
  const pill = document.getElementById("wf-graph-search-pill");
  if (pill) pill.hidden = true;
  WF_GRAPH_SEARCH = { open: false, query: "", matches: [], index: -1 };
}

function wfGraphSearchUpdate(query) {
  WF_GRAPH_SEARCH.query = query;
  WF_GRAPH_SEARCH.matches = wfGraphSearchCollect(query);
  WF_GRAPH_SEARCH.index = WF_GRAPH_SEARCH.matches.length ? 0 : -1;
  const cnt = document.getElementById("wf-graph-search-count");
  if (cnt) {
    cnt.textContent = WF_GRAPH_SEARCH.matches.length
      ? `${WF_GRAPH_SEARCH.index + 1}/${WF_GRAPH_SEARCH.matches.length}`
      : "0/0";
  }
}

function wfGraphSearchStep(delta) {
  const m = WF_GRAPH_SEARCH.matches;
  if (!m.length) return;
  let idx = WF_GRAPH_SEARCH.index + delta;
  if (idx < 0) idx = m.length - 1;
  if (idx >= m.length) idx = 0;
  WF_GRAPH_SEARCH.index = idx;
  const hit = m[idx];
  const cnt = document.getElementById("wf-graph-search-count");
  if (cnt) cnt.textContent = `${idx + 1}/${m.length}`;
  if (hit?.nodeId) {
    wfGraphSearchPushRecent(WF_GRAPH_SEARCH.query);
    wfFrameSearchMatch(hit.nodeId);
  }
}

function wfFrameSearchMatch(nodeId) {
  const before = { panX: wfMeta().panX, panY: wfMeta().panY };
  wfFitNodesBounds([nodeId]);
  const after = { panX: wfMeta().panX, panY: wfMeta().panY };
  if (Math.abs(after.panX - before.panX) < 0.5 && Math.abs(after.panY - before.panY) < 0.5) {
    wfMeta().panX = before.panX - 12;
    applyWfCanvasTransform();
  }
  const card = document.querySelector(`.node-card[data-node-id="${nodeId}"], .wf-reroute[data-node-id="${nodeId}"]`);
  if (card) {
    card.classList.remove("wf-search-pulse");
    void card.offsetWidth;
    card.classList.add("wf-search-pulse");
    setTimeout(() => card.classList.remove("wf-search-pulse"), 1800);
  }
}

function wfBubbleHtml(n) {
  if (!n.bubble?.text) return "";
  const collapsed = n.bubble.collapsed !== false;
  const text = escapeHtml(n.bubble.text);
  return `<div class="wf-node-bubble${collapsed ? " wf-bubble-collapsed" : ""}" data-bubble-node="${escapeHtml(n.id)}">
    <div class="wf-bubble-preview">${text}</div>
    <div class="wf-bubble-body">${text}</div>
  </div>`;
}

function wfAddBubbleComment(nodeId) {
  const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
  if (!n) return;
  const t = window.prompt("Bubble comment", n.bubble?.text || "");
  if (t === null) return;
  wfPushUndo();
  n.bubble = { text: t.trim(), collapsed: true };
  renderAutomationStudioView();
}

function wfToggleAllBubbles(show) {
  WF_BUBBLES_VISIBLE = show !== false;
  document.querySelectorAll(".wf-node-bubble").forEach(el => {
    el.style.display = WF_BUBBLES_VISIBLE ? "" : "none";
  });
}

function wfStraightenSelectedWires() {
  if (!WF_SELECTED_NODES.size && WF_SELECTED_EDGE === null) return;
  wfPushUndo();
  CURRENT_WF.edges.forEach((e, i) => {
    const selected = WF_SELECTED_NODES.has(e.from) || WF_SELECTED_NODES.has(e.to)
      || WF_SELECTED_EDGE === i;
    if (!selected) return;
    if (!e.style) e.style = {};
    e.style.straighten = true;
  });
  scheduleDrawWfConnectors();
}

function wfWirePath(p1, p2, edge) {
  if (edge?.style?.straighten) {
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    if (dx < 4 || dy < 4) return `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
    const midX = (p1.x + p2.x) / 2;
    return `M${p1.x},${p1.y} L${midX},${p1.y} L${midX},${p2.y} L${p2.x},${p2.y}`;
  }
  return wireBezier(p1, p2);
}

function wfEnsureGuideLayer() {
  const world = document.getElementById("wf-world");
  if (!world) return null;
  if (!WF_GUIDE_EL || !WF_GUIDE_EL.isConnected) {
    WF_GUIDE_EL = document.createElement("div");
    WF_GUIDE_EL.className = "wf-smart-guides";
    WF_GUIDE_EL.id = "wf-smart-guides";
    world.appendChild(WF_GUIDE_EL);
  }
  return WF_GUIDE_EL;
}

function wfClearSmartGuides() {
  if (WF_GUIDE_EL) WF_GUIDE_EL.innerHTML = "";
}

function wfNodeBounds(n) {
  const card = document.querySelector(`.node-card[data-node-id="${n.id}"], .wf-reroute[data-node-id="${n.id}"]`);
  const w = card ? card.offsetWidth : (n.type === "reroute" ? 16 : 220);
  const h = card ? card.offsetHeight : (n.type === "reroute" ? 16 : 80);
  return { x: n.x, y: n.y, w, h, cx: n.x + w / 2, cy: n.y + h / 2, r: n.x + w, b: n.y + h };
}

function wfApplySmartGuides(group, snapPx) {
  const layer = wfEnsureGuideLayer();
  if (!layer) return { dx: 0, dy: 0 };
  const threshold = 8;
  const snap = snapPx ?? 4;
  const dragIds = new Set(group.map(g => g.id));
  let bounds = group.map(g => wfNodeBounds(g.node));
  let minX = Math.min(...bounds.map(b => b.x));
  let minY = Math.min(...bounds.map(b => b.y));
  let maxR = Math.max(...bounds.map(b => b.r));
  let maxB = Math.max(...bounds.map(b => b.b));
  const dragCx = (minX + maxR) / 2;
  const dragCy = (minY + maxB) / 2;
  let dx = 0, dy = 0;
  const guides = [];
  const others = (CURRENT_WF.nodes || []).filter(n => !dragIds.has(n.id));
  others.forEach(n => {
    const o = wfNodeBounds(n);
    const checks = [
      { axis: "x", val: minX, ref: o.x, label: "left" },
      { axis: "x", val: maxR, ref: o.r, label: "right" },
      { axis: "x", val: dragCx, ref: o.cx, label: "center X" },
      { axis: "y", val: minY, ref: o.y, label: "top" },
      { axis: "y", val: maxB, ref: o.b, label: "bottom" },
      { axis: "y", val: dragCy, ref: o.cy, label: "center Y" },
    ];
    checks.forEach(c => {
      const delta = c.ref - c.val;
      if (Math.abs(delta) > threshold) return;
      if (c.axis === "x" && (dx === 0 || Math.abs(delta) < Math.abs(dx))) dx = delta;
      if (c.axis === "y" && (dy === 0 || Math.abs(delta) < Math.abs(dy))) dy = delta;
      if (Math.abs(delta) <= threshold) {
        guides.push({ axis: c.axis, pos: c.ref, label: c.label, delta });
      }
    });
  });
  if (Math.abs(dx) <= snap) {
    group.forEach(g => { g.node.x += dx; g.card.style.left = g.node.x + "px"; });
  } else dx = 0;
  if (Math.abs(dy) <= snap) {
    group.forEach(g => { g.node.y += dy; g.card.style.top = g.node.y + "px"; });
  } else dy = 0;
  layer.innerHTML = guides.slice(0, 6).map(g => {
    if (g.axis === "x") {
      return `<div class="wf-guide wf-guide-v" style="left:${g.pos}px;"><span>${escapeHtml(g.label)}</span></div>`;
    }
    return `<div class="wf-guide wf-guide-h" style="top:${g.pos}px;"><span>${escapeHtml(g.label)}</span></div>`;
  }).join("");
  return { dx, dy };
}

function wfMarkWatchesStale() {
  WF_WATCH_STALE = true;
  const m = wfEnsureMetaCollections();
  m.watches.forEach(w => { w.stale = true; });
  wfRefreshWatchesPanel();
}

function wfPinWatchFromEdge(edgeIdx) {
  const e = CURRENT_WF.edges[edgeIdx];
  if (!e || e.kind !== "data") return;
  const m = wfEnsureMetaCollections();
  const key = wfEdgeKey(e);
  if (m.watches.some(w => w.edgeKey === key)) return;
  const from = CURRENT_WF.nodes.find(n => n.id === e.from);
  m.watches.push({
    edgeKey: key,
    nodeId: e.to,
    port: e.toPort,
    label: `${from ? wfNodeHeaderLabel(from) : e.from} → ${e.toPort}`,
    stale: false,
  });
  wfRefreshWatchesPanel();
}

function wfRefreshWatchesPanel() {
  const list = document.getElementById("wf-watches-list");
  if (!list) return;
  const m = wfEnsureMetaCollections();
  if (!m.watches.length) {
    list.innerHTML = wfEmptyStub("No pinned watches", "Right-click a data wire → Pin to watches.");
    return;
  }
  list.innerHTML = m.watches.map((w, i) => {
    const val = WF_WATCH_VALUES[w.edgeKey];
    const stale = w.stale || WF_WATCH_STALE;
    const shown = val === undefined ? "—" : escapeHtml(wfTruncateWatch(val));
  return `<button type="button" class="wf-watch-row${stale ? " wf-watch-stale" : ""}" data-watch-idx="${i}" data-watch-node="${escapeHtml(w.nodeId || "")}">
      <span class="wf-watch-label">${escapeHtml(w.label || w.edgeKey)}</span>
      <span class="wf-watch-val">${shown}</span>
    </button>`;
  }).join("");
  list.querySelectorAll(".wf-watch-row").forEach(btn => {
    btn.onclick = () => {
      const nodeId = btn.dataset.watchNode;
      if (nodeId) wfFitNodesBounds([nodeId]);
    };
  });
}

async function wfHydrateWatchesFromTrace() {
  if (!CURRENT_WF.id) return;
  const path = `/api/workflows/${CURRENT_WF.id}/trace/latest`;
  try {
    const res = await fetch(path);
    if (res.status === 404) return;
    const data = await res.json();
    const trace = data.trace || data.values || data;
    if (!trace || typeof trace !== "object") return;
    Object.entries(trace).forEach(([k, v]) => { WF_WATCH_VALUES[k] = v; });
    wfPulseNodesFromTrace(trace);
    wfRefreshWatchesPanel();
    scheduleDrawWfConnectors();
  } catch (_) { /* trace endpoint optional */ }
}

function wfRenderDiagnosticsRows(rows) {
  const el = document.getElementById("wf-results-console");
  if (!el) return;
  if (!rows?.length) {
    el.innerHTML = wfEmptyStub("No issues reported", "Run Generate code to compile and refresh diagnostics.");
    return;
  }
  el.innerHTML = rows.map((d, i) => {
    const sev = escapeHtml(d.severity || "info");
    const msg = escapeHtml(d.message || "");
    const hint = d.fix_hint ? `<span class="wf-diag-hint">${escapeHtml(d.fix_hint)}</span>` : "";
    return `<button type="button" class="wf-diag-row wf-diag-${sev}" data-diag-idx="${i}" data-diag-node="${escapeHtml(d.node_id || "")}">
      <span class="wf-diag-sev">${sev}</span>
      <span class="wf-diag-msg">${msg}</span>${hint}
    </button>`;
  }).join("");
  el.querySelectorAll(".wf-diag-row").forEach(btn => {
    btn.onclick = () => {
      const nodeId = btn.dataset.diagNode;
      if (nodeId) wfFrameSearchMatch(nodeId);
    };
  });
}

function wfParseCheckDiagnostics(check) {
  const rows = [];
  if (!check || check.ok) return rows;
  const msg = check.error || check.message || "Compile error";
  const line = check.line || check.error_line;
  rows.push({ severity: "error", node_id: check.node_id || null, message: msg, fix_hint: line ? `Line ${line}` : "" });
  if (Array.isArray(check.diagnostics)) return check.diagnostics;
  if (Array.isArray(check.errors)) {
    check.errors.forEach(e => rows.push({
      severity: e.severity || "error",
      node_id: e.node_id || e.nodeId,
      message: e.message || String(e),
      fix_hint: e.fix_hint || e.hint || "",
    }));
  }
  return rows;
}

async function wfFetchDiagnostics() {
  if (!CURRENT_WF.id) return [];
  const path = `/api/workflows/${CURRENT_WF.id}/diagnostics`;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph: wfGraphPayload() }),
    });
    if (res.status === 404) return null;
    const data = await res.json();
    if (data.ok === false && !data.diagnostics) return [];
    return data.diagnostics || [];
  } catch (_) { return null; }
}

async function wfRefreshDiagnosticsPanel(checkFallback) {
  let rows = await wfFetchDiagnostics();
  if (rows === null && checkFallback) rows = wfParseCheckDiagnostics(checkFallback);
  if (rows === null) rows = [];
  WF_DIAG_RESULTS = rows;
  wfRenderDiagnosticsRows(rows);
}

function wfZoneGKeydown(e) {
  if (!AUTOMATION_STUDIO_OPEN || STUDIO_TAB !== "graph") return;
  const inField = e.target.closest("input, textarea, select, [contenteditable]");
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    wfOpenGraphSearch();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key >= "1" && e.key <= "5") {
    e.preventDefault();
    e.stopPropagation();
    wfSaveBookmark(Number(e.key));
    wfRefreshBookmarkRail();
    return;
  }
  if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && e.key >= "1" && e.key <= "5") {
    e.preventDefault();
    wfJumpBookmark(Number(e.key));
    return;
  }
  if (e.key === "Escape") {
    if (WF_GRAPH_SEARCH.open) { wfCloseGraphSearch(); e.preventDefault(); return; }
    if (WF_CHAIN_FOCUS || WF_CHAIN_TOOLBAR || WF_ALIGN_TOOLBAR) {
      wfClearChainFocus();
      if (WF_ALIGN_TOOLBAR) { WF_ALIGN_TOOLBAR.remove(); WF_ALIGN_TOOLBAR = null; }
      e.preventDefault();
    }
  }
}

function wfWireZoneGUi() {
  if (!window._wfZoneGKeysWired) {
    window._wfZoneGKeysWired = true;
    document.addEventListener("keydown", wfZoneGKeydown, true);
  }
  const input = document.getElementById("wf-graph-search-input");
  if (input && !input._wfSearchWired) {
    input._wfSearchWired = true;
    input.addEventListener("input", () => wfGraphSearchUpdate(input.value));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); wfGraphSearchStep(-1); }
      else if (e.key === "Enter") { e.preventDefault(); wfGraphSearchStep(1); }
      else if (e.key === "Escape") { e.preventDefault(); wfCloseGraphSearch(); }
    });
  }
  document.getElementById("wf-graph-search-close")?.addEventListener("click", () => wfCloseGraphSearch());
  document.querySelectorAll(".wf-bookmark-slot").forEach(btn => {
    btn.addEventListener("click", () => wfJumpBookmark(Number(btn.dataset.wfBookmark)));
  });
  document.querySelectorAll(".wf-node-bubble").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const nodeId = el.dataset.bubbleNode;
      const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
      if (!n?.bubble) return;
      n.bubble.collapsed = !n.bubble.collapsed;
      el.classList.toggle("wf-bubble-collapsed", n.bubble.collapsed);
    });
  });
  wfRenderBreadcrumbBar();
  wfRefreshWatchesPanel();
  wfToggleAllBubbles(WF_BUBBLES_VISIBLE);
  document.getElementById("studio-tb-straighten-wires")?.addEventListener("click", () => wfStraightenSelectedWires());
  document.getElementById("studio-tb-toggle-bubbles")?.addEventListener("click", () => {
    WF_BUBBLES_VISIBLE = !WF_BUBBLES_VISIBLE;
    wfToggleAllBubbles(WF_BUBBLES_VISIBLE);
  });
}

function wfNodeMeta(n) {
  if (!n.meta) n.meta = {};
  return n.meta;
}

function wfIsNodeDisabled(n) {
  return !!wfNodeMeta(n).disabled;
}

function wfIsBreakpoint(n) {
  return !!wfNodeMeta(n).breakpoint;
}

function wfToggleBreakpoint(nodeId) {
  const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
  if (!n || n.type === "start") return;
  wfPushUndo();
  const meta = wfNodeMeta(n);
  meta.breakpoint = !meta.breakpoint;
  renderAutomationStudioView();
}

function wfToggleNodeDisabled(nodeId) {
  const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
  if (!n || n.type === "start") return;
  wfPushUndo();
  const meta = wfNodeMeta(n);
  meta.disabled = !meta.disabled;
  renderAutomationStudioView();
}

function wfNodeFuncName(node) {
  if (node.funcName) return node.funcName;
  for (const fn of CURRENT_WF.functions || []) {
    const c = (CURRENT_WF.comments || []).find(x => x.id === fn.frameId);
    if (!c) continue;
    if (node.x >= c.x && node.y >= c.y && node.x <= c.x + c.w && node.y <= c.y + c.h) return fn.name;
  }
  return null;
}

function wfFocusedFunction() {
  if (!WF_FOCUS_FUNC) return null;
  return wfFuncByName(WF_FOCUS_FUNC);
}

function wfSetFocusFunction(fnName) {
  if (fnName && fnName !== WF_FOCUS_FUNC) wfSaveScopeViewport();
  WF_FOCUS_FUNC = fnName || null;
}

function wfVarIsLocal(node, varName) {
  const fnName = wfNodeFuncName(node);
  if (!fnName) return false;
  const fn = wfFuncByName(fnName);
  return !!(fn?.locals || []).some(l => l.name === varName);
}

function wfEdgeKey(e) {
  return `${e.from}:${e.fromPort || "next"}->${e.to}:${e.toPort || "exec"}`;
}

function wfTruncateWatch(val) {
  const s = val === null || val === undefined ? "null" : String(val);
  return s.length > 18 ? s.slice(0, 15) + "..." : s;
}

function wfSimCoerceDefault(type, raw) {
  const r = (raw ?? "").toString().trim();
  if (type === "int") { const n = parseInt(r, 10); return Number.isFinite(n) ? n : 0; }
  if (type === "float") { const n = parseFloat(r); return Number.isFinite(n) ? n : 0; }
  if (type === "bool") return ["true", "1", "yes", "on"].includes(r.toLowerCase());
  if (type === "list") {
    try { const p = JSON.parse(r); return Array.isArray(p) ? p : []; } catch (_) { return []; }
  }
  return r;
}

function wfSimBuildMaps() {
  const nodes = {};
  (CURRENT_WF.nodes || []).forEach(n => { nodes[n.id] = n; });
  const execEdges = {};
  (CURRENT_WF.edges || []).forEach(e => {
    if (e.kind === "data") return;
    const port = e.fromPort || "next";
    if (!execEdges[e.from]) execEdges[e.from] = {};
    execEdges[e.from][port] = e.to;
  });
  return { nodes, edges: CURRENT_WF.edges || [], execEdges };
}

function wfSimResolveParam(node, name, nodes, edges, cache, sim) {
  const dataEdge = edges.find(e => e.kind === "data" && e.to === node.id && e.toPort === name);
  if (dataEdge) {
    const val = wfSimDataExpr(dataEdge.from, dataEdge.fromPort || "value", nodes, edges, cache, sim);
    WF_WATCH_VALUES[wfEdgeKey(dataEdge)] = val;
    return val;
  }
  const raw = (node.params || {})[name];
  return raw !== undefined && raw !== "" ? raw : null;
}

function wfSimDataExpr(nodeId, port, nodes, edges, cache, sim) {
  const key = `${nodeId}:${port}`;
  if (cache[key] !== undefined) return cache[key];
  const node = nodes[nodeId];
  if (!node) return null;
  if (node.type === "get_var") {
    const fnName = wfNodeFuncName(node);
    if (wfVarIsLocal(node, node.varName)) {
      if (sim.localStack.length) {
        cache[key] = sim.localStack[sim.localStack.length - 1].vars[node.varName] ?? null;
      } else if (sim._fnLocals?.[fnName]) {
        cache[key] = sim._fnLocals[fnName][node.varName] ?? null;
      } else {
        cache[key] = null;
      }
      return cache[key];
    }
    const loc = sim.localStack.length ? sim.localStack[sim.localStack.length - 1].vars : null;
    if (loc && Object.prototype.hasOwnProperty.call(loc, node.varName)) {
      cache[key] = loc[node.varName];
      return cache[key];
    }
    cache[key] = sim.vars[node.varName] ?? null;
    return cache[key];
  }
  if (node.type === "reroute") {
    const e = edges.find(x => x.kind === "data" && x.to === nodeId && x.toPort === "in");
    cache[key] = e ? wfSimDataExpr(e.from, e.fromPort || "out", nodes, edges, cache, sim) : null;
    return cache[key];
  }
  if (node.type === "func_entry") {
    const loc = sim.localStack.length ? sim.localStack[sim.localStack.length - 1].vars : {};
    cache[key] = loc[port] ?? null;
    return cache[key];
  }
  if (node.type === "call_func" && port === "result") {
    cache[key] = sim._callResults?.[nodeId] ?? null;
    return cache[key];
  }
  if (node.type === "literal_number") {
    cache[key] = Number((node.params || {}).value) || 0;
    return cache[key];
  }
  if (node.type === "literal_bool" || node.type === "circuit_input") {
    cache[key] = wfTruthy((node.params || {}).value);
    return cache[key];
  }
  if (node.type === "literal_string") {
    cache[key] = String((node.params || {}).value ?? "");
    return cache[key];
  }
  if (node.type.startsWith("cast_")) {
    const value = wfSimResolveParam(node, "value", nodes, edges, cache, sim);
    cache[key] = wfCastValue(node.type, value);
    return cache[key];
  }
  const a = wfSimResolveParam(node, "a", nodes, edges, cache, sim);
  const b = wfSimResolveParam(node, "b", nodes, edges, cache, sim);
  if (node.type === "compare") {
    const op = (node.params || {}).operator || "==";
    const av = a, bv = b;
    const res = ({ "==": av == bv, "!=": av != bv, "<": av < bv, ">": av > bv, "<=": av <= bv, ">=": av >= bv })[op];
    cache[key] = !!res;
    return cache[key];
  }
  if (["add", "subtract", "multiply", "divide", "modulo"].includes(node.type)) {
    const na = Number(a) || 0, nb = Number(b) || 0;
    const ops = { add: na + nb, subtract: na - nb, multiply: na * nb, divide: nb ? na / nb : 0, modulo: nb ? na % nb : 0 };
    cache[key] = ops[node.type];
    return cache[key];
  }
  if (node.type === "circuit_and") {
    cache[key] = wfTruthy(a) && wfTruthy(b);
    return cache[key];
  }
  if (node.type === "circuit_resistor" || node.type === "circuit_led") {
    cache[key] = wfTruthy(wfSimResolveParam(node, "signal", nodes, edges, cache, sim));
    return cache[key];
  }
  if (node.type === "concat_text") {
    cache[key] = String(a ?? "") + String(b ?? "");
    return cache[key];
  }
  if (node.type === "length") {
    const v = wfSimResolveParam(node, "value", nodes, edges, cache, sim);
    cache[key] = Array.isArray(v) ? v.length : String(v ?? "").length;
    return cache[key];
  }
  return null;
}

const WF_SIM_SUPPORTED = new Set([
  "start", "print", "print_value", "set_var", "get_var", "if", "endif", "exec_gate",
  "add", "subtract", "multiply", "divide", "modulo", "concat_text", "compare",
  "call_func", "func_entry", "func_return", "reroute", "for",
  "length", "str_upper", "str_lower", "str_strip", "str_split", "str_replace", "str_contains",
  "list_append", "list_get", "list_join", "increment",
  "literal_number", "literal_bool", "literal_string",
  "cast_string", "cast_int", "cast_float", "cast_bool", "cast_list", "cast_json",
  "circuit_input", "circuit_and", "circuit_resistor", "circuit_led",
]);

function wfSimNodeLabel(node) {
  const def = WF_NODE_TYPES[node.type] || {};
  if (node.type === "print") return `Print: ${wfSimResolveParam(node, "message", {}, [], {}, { vars: {}, localStack: [] })}`;
  return def.label || node.type;
}

function wfSimSingleExecOut(node) {
  const def = WF_NODE_TYPES[node.type] || {};
  const outs = node.type === "start" ? ["next"] : (def.outputs || []);
  return outs.length === 1 ? outs[0] : null;
}

function wfNodeCardEl(nodeId) {
  return document.querySelector(`.node-card[data-node-id="${nodeId}"], .wf-reroute[data-node-id="${nodeId}"]`);
}

function wfPrefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function wfNodeFirePulse(nodeId) {
  if (!nodeId) return;
  const el = wfNodeCardEl(nodeId);
  if (!el) return;
  const prev = WF_NODE_FIRE_TIMERS.get(nodeId);
  if (prev) clearTimeout(prev);
  el.classList.remove("wf-node-fired");
  void el.offsetWidth;
  el.classList.add("wf-node-fired");
  const ms = wfPrefersReducedMotion() ? 80 : WF_NODE_FIRE_MS;
  WF_NODE_FIRE_TIMERS.set(nodeId, setTimeout(() => {
    el.classList.remove("wf-node-fired");
    WF_NODE_FIRE_TIMERS.delete(nodeId);
  }, ms));
}

function wfNodeIdsFromTraceKey(key) {
  const ids = new Set();
  const s = String(key);
  const edge = s.match(/^([^:]+):[^-]+->([^:]+):/);
  if (edge) {
    ids.add(edge[1]);
    ids.add(edge[2]);
    return ids;
  }
  const np = s.match(/^([^:]+):/);
  if (np) ids.add(np[1]);
  return ids;
}

function wfEnsureLastRun() {
  if (!CURRENT_WF.meta) CURRENT_WF.meta = {};
  if (!CURRENT_WF.meta.lastRun || typeof CURRENT_WF.meta.lastRun !== "object") CURRENT_WF.meta.lastRun = {};
  return CURRENT_WF.meta.lastRun;
}

function wfRecordLastRunNode(nodeId, outputs) {
  if (!nodeId || !outputs) return;
  const lr = wfEnsureLastRun();
  Object.entries(outputs).forEach(([port, val]) => { lr[`${nodeId}:${port}`] = val; });
}

function wfPulseNodesFromTrace(trace) {
  if (!trace || typeof trace !== "object") return;
  const pulsed = new Set();
  const pulse = (nodeId) => {
    if (!nodeId || pulsed.has(nodeId)) return;
    pulsed.add(nodeId);
    wfNodeFirePulse(nodeId);
  };
  if (Array.isArray(trace.events)) {
    trace.events.forEach(ev => pulse(ev?.node_id || ev?.nodeId));
  }
  Object.keys(trace).forEach(k => {
    if (k === "events" || k === "run_id" || k === "created_at" || k === "exit_code" || k === "stdout_tail") return;
    wfNodeIdsFromTraceKey(k).forEach(pulse);
  });
}

function wfSimClearVisuals() {
  WF_NODE_FIRE_TIMERS.forEach(t => clearTimeout(t));
  WF_NODE_FIRE_TIMERS.clear();
  document.querySelectorAll(".node-card, .wf-reroute").forEach(el => {
    el.classList.remove("wf-sim-ok", "wf-sim-error", "wf-sim-skipped", "wf-sim-paused", "wf-sim-unsupported", "wf-node-fired");
  });
  document.querySelectorAll(".wf-wire").forEach(w => w.classList.remove("wf-sim-active-wire"));
}

function wfSimFlashNode(nodeId, cls) {
  const el = wfNodeCardEl(nodeId);
  if (!el) return;
  el.classList.add(cls);
  wfNodeFirePulse(nodeId);
}

function wfSimPulseWire(fromId, fromPort) {
  document.querySelectorAll(".wf-wire").forEach((w, i) => {
    const e = CURRENT_WF.edges[i];
    if (e && e.from === fromId && (e.fromPort || "next") === (fromPort || "next") && e.kind !== "data") {
      w.classList.add("wf-sim-active-wire");
    }
  });
}

function wfSimLog(line) {
  if (!WF_SIM) return;
  WF_SIM.console.push(line);
  const el = document.getElementById("wf-sim-console");
  if (el) {
    el.textContent = WF_SIM.console.join("\n");
    el.scrollTop = el.scrollHeight;
  }
}

function wfSimRefreshVarPanel() {
  document.querySelectorAll("[data-wf-live-var]").forEach(el => {
    const name = el.dataset.wfLiveVar;
    let val = WF_SIM?.vars?.[name];
    if (WF_SIM?.localStack?.length) {
      const top = WF_SIM.localStack[WF_SIM.localStack.length - 1].vars;
      if (top && Object.prototype.hasOwnProperty.call(top, name)) val = top[name];
    }
    el.textContent = val === undefined ? "—" : wfTruncateWatch(val);
  });
}

function wfSimInitVars() {
  const vars = {};
  (CURRENT_WF.variables || []).forEach(v => { vars[v.name] = wfSimCoerceDefault(v.type, v.default); });
  return vars;
}

function wfSimSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function wfSimExecuteNode(node, nodes, edges, execEdges, sim) {
  const cache = {};
  const t = node.type;
  const outputs = {};
  if (t === "print") {
    const msg = wfSimResolveParam(node, "message", nodes, edges, cache, sim) ?? "";
    outputs.message = msg;
  } else if (t === "print_value") {
    const ex = wfSimResolveParam(node, "expression", nodes, edges, cache, sim);
    outputs.expression = ex;
  } else if (t === "set_var") {
    const val = wfSimResolveParam(node, "value", nodes, edges, cache, sim);
    if (wfVarIsLocal(node, node.varName) && sim.localStack.length) {
      sim.localStack[sim.localStack.length - 1].vars[node.varName] = val;
    } else if (wfVarIsLocal(node, node.varName)) {
      const fnName = wfNodeFuncName(node);
      const fn = wfFuncByName(fnName);
      if (!sim._fnLocals) sim._fnLocals = {};
      if (!sim._fnLocals[fnName]) sim._fnLocals[fnName] = {};
      (fn?.locals || []).forEach(l => {
        if (!sim._fnLocals[fnName][l.name]) sim._fnLocals[fnName][l.name] = wfSimCoerceDefault(l.type, l.default);
      });
      sim._fnLocals[fnName][node.varName] = val;
    } else {
      sim.vars[node.varName] = val;
    }
    outputs.value = val;
  } else if (t === "get_var") {
    outputs.value = wfSimDataExpr(node.id, "value", nodes, edges, cache, sim);
  } else if (t === "if") {
    outputs.condition = wfSimResolveParam(node, "condition", nodes, edges, cache, sim);
  } else if (t === "exec_gate") {
    const rawOpen = wfSimResolveParam(node, "open", nodes, edges, cache, sim);
    outputs.open = rawOpen == null ? true : wfTruthy(rawOpen);
  } else if (t === "for") {
    outputs.iterable = wfSimResolveParam(node, "iterable", nodes, edges, cache, sim);
    outputs.variable = (node.params || {}).variable || "i";
  } else if (t === "increment") {
    const amount = Number(wfSimResolveParam(node, "amount", nodes, edges, cache, sim)) || 0;
    const vname = (node.params || {}).variable || "x";
    const cur = sim.vars[vname] ?? 0;
    sim.vars[vname] = Number(cur) + amount;
  } else if (t === "str_upper" || t === "str_lower" || t === "str_strip") {
    const v = String(wfSimResolveParam(node, "value", nodes, edges, cache, sim) ?? "");
    const res = t === "str_upper" ? v.toUpperCase() : t === "str_lower" ? v.toLowerCase() : v.trim();
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = res;
    outputs.result = res;
  } else if (t === "str_split") {
    const v = String(wfSimResolveParam(node, "value", nodes, edges, cache, sim) ?? "");
    const sep = wfSimResolveParam(node, "separator", nodes, edges, cache, sim) ?? " ";
    const res = v.split(sep);
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = res;
    outputs.result = res;
  } else if (t === "str_replace") {
    let v = String(wfSimResolveParam(node, "value", nodes, edges, cache, sim) ?? "");
    const old = String(wfSimResolveParam(node, "old", nodes, edges, cache, sim) ?? "");
    const neu = String(wfSimResolveParam(node, "new", nodes, edges, cache, sim) ?? "");
    const res = v.split(old).join(neu);
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = res;
    outputs.result = res;
  } else if (t === "str_contains") {
    const v = String(wfSimResolveParam(node, "value", nodes, edges, cache, sim) ?? "");
    const sub = String(wfSimResolveParam(node, "substring", nodes, edges, cache, sim) ?? "");
    const res = v.includes(sub);
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = res;
    outputs.result = res;
  } else if (t === "list_append") {
    const lname = (node.params || {}).list_var || "items";
    const val = wfSimResolveParam(node, "value", nodes, edges, cache, sim);
    if (!Array.isArray(sim.vars[lname])) sim.vars[lname] = [];
    sim.vars[lname].push(val);
  } else if (t === "list_get") {
    const lname = (node.params || {}).list_var || "items";
    const idx = Number(wfSimResolveParam(node, "index", nodes, edges, cache, sim)) || 0;
    const arr = sim.vars[lname];
    const res = Array.isArray(arr) ? arr[idx] : null;
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = res;
    outputs.result = res;
  } else if (t === "list_join") {
    const lname = (node.params || {}).list_var || "items";
    const sep = String(wfSimResolveParam(node, "separator", nodes, edges, cache, sim) ?? ", ");
    const arr = sim.vars[lname];
    const res = Array.isArray(arr) ? arr.join(sep) : "";
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = res;
    outputs.result = res;
  } else if (["add", "subtract", "multiply", "divide", "modulo", "concat_text", "compare", "length"].includes(t)) {
    const port = "result";
    outputs[port] = wfSimDataExpr(node.id, port, nodes, edges, cache, sim);
    const vname = (node.params || {}).variable;
    if (vname) sim.vars[vname] = outputs[port];
  } else if (t === "call_func") {
    const fn = wfFuncByName(node.funcName);
    if (!fn) throw new Error(`Unknown function ${node.funcName}`);
    const localVars = {};
    (fn.params || []).forEach(p => {
      localVars[p.name] = wfSimResolveParam(node, p.name, nodes, edges, cache, sim);
    });
    (fn.locals || []).forEach(l => {
      if (l.name) localVars[l.name] = wfSimCoerceDefault(l.type, l.default);
    });
    sim.localStack.push({ fnName: node.funcName, vars: localVars });
    const entry = CURRENT_WF.nodes.find(n => n.type === "func_entry" && n.funcName === node.funcName);
    if (entry) {
      const ret = await wfSimRunFrom(entry.id, nodes, edges, execEdges, sim, { untilReturn: true, callNodeId: node.id });
      if (!sim._callResults) sim._callResults = {};
      sim._callResults[node.id] = ret;
    }
    sim.localStack.pop();
  }
  const def = WF_NODE_TYPES[t] || {};
  const label = def.label || t;
  const outStr = Object.keys(outputs).length ? ` → ${Object.values(outputs).map(v => wfTruncateWatch(v)).join(", ")}` : "";
  WF_SIM.trace.push(`${label}${outStr}`);
  wfSimLog(`${label}${outStr}`);
  wfRecordLastRunNode(node.id, outputs);
  wfSimRefreshVarPanel();
  wfRefreshWatchesPanel();
  scheduleDrawWfConnectors();
  return outputs;
}

async function wfSimRunFrom(startId, nodes, edges, execEdges, sim, opts) {
  opts = opts || {};
  let cur = startId;
  let lastFrom = null;
  let lastPort = null;
  while (cur && sim.steps < WF_SIM_MAX_STEPS) {
    if (sim.cancel) return null;
    const node = nodes[cur];
    if (!node) return null;
    const t = node.type;
    if (t === "ui_event" && !opts.allowUiEvent) {
      cur = execEdges[cur]?.next;
      continue;
    }
    if (t === "start" || t === "func_entry" || t === "reroute") {
      lastFrom = cur; lastPort = "next";
      cur = execEdges[cur]?.next;
      continue;
    }
    if (t === "endif") return null;
    if (t === "func_return") {
      if (opts.untilReturn) {
        wfNodeFirePulse(cur);
        const retVal = wfSimDataExpr(cur, "return", nodes, edges, {}, sim);
        return retVal;
      }
      return null;
    }
    if (wfIsNodeDisabled(node)) {
      wfSimFlashNode(cur, "wf-sim-skipped");
      const port = wfSimSingleExecOut(node);
      lastFrom = cur; lastPort = port || "next";
      cur = port ? execEdges[cur]?.[port] : null;
      continue;
    }
    if (wfIsBreakpoint(node) && WF_SIM.resumeNodeId !== cur) {
      WF_SIM.status = "paused";
      WF_SIM.pausedAt = cur;
      wfSimFlashNode(cur, "wf-sim-paused");
      return null;
    }
    WF_SIM.resumeNodeId = null;
    if (!WF_SIM_SUPPORTED.has(t)) {
      wfSimLog(`cannot simulate ${t}`);
      wfSimFlashNode(cur, "wf-sim-unsupported");
      const port = wfSimSingleExecOut(node);
      lastFrom = cur; lastPort = port || "next";
      cur = port ? execEdges[cur]?.[port] : null;
      continue;
    }
    if (lastFrom && !WF_SIM.stepOnce) {
      WF_SIM.activeEdgeKey = null;
      CURRENT_WF.edges.forEach(e => {
        if (e.from === lastFrom && (e.fromPort || "next") === (lastPort || "next") && e.kind !== "data") {
          WF_SIM.activeEdgeKey = wfEdgeKey(e);
        }
      });
      wfSimPulseWire(lastFrom, lastPort);
      scheduleDrawWfConnectors();
      await wfSimSleep(WF_SIM_ANIM_MS);
    }
    sim.steps += 1;
    WF_SIM.currentNodeId = cur;
    try {
      const out = await wfSimExecuteNode(node, nodes, edges, execEdges, sim);
      wfSimFlashNode(cur, "wf-sim-ok");
      if (!WF_SIM.stepOnce) await wfSimSleep(WF_SIM_ANIM_MS);
      if (t === "if") {
        const branch = out.condition ? "true" : "false";
        lastFrom = cur; lastPort = branch;
        cur = execEdges[cur]?.[branch];
        continue;
      }
      if (t === "exec_gate") {
        if (!out.open) {
          wfSimLog("Execution Gate blocked");
          return null;
        }
        lastFrom = cur; lastPort = "pass";
        cur = execEdges[cur]?.pass;
        continue;
      }
      if (t === "for") {
        const iterable = Array.isArray(out.iterable) ? out.iterable : [];
        const vname = out.variable;
        for (const item of iterable) {
          if (sim.cancel) return null;
          sim.vars[vname] = item;
          const loopTarget = execEdges[cur]?.loop;
          if (loopTarget) await wfSimRunFrom(loopTarget, nodes, edges, execEdges, sim, opts);
        }
        lastFrom = cur; lastPort = "done";
        cur = execEdges[cur]?.done;
        continue;
      }
      lastFrom = cur; lastPort = "next";
      cur = execEdges[cur]?.next;
      if (WF_SIM.stepOnce) {
        WF_SIM.stepOnce = false;
        WF_SIM.status = "paused";
        WF_SIM.pausedAt = cur;
        if (cur) wfSimFlashNode(cur, "wf-sim-paused");
        return null;
      }
    } catch (err) {
      wfSimFlashNode(cur, "wf-sim-error");
      wfSimLog(`Error: ${err.message || err}`);
      WF_SIM.status = "stopped";
      return null;
    }
  }
  return null;
}

function wfSimFindStart() {
  const selected = [...WF_SELECTED_NODES];
  if (selected.length === 1) {
    const n = CURRENT_WF.nodes.find(nd => nd.id === selected[0]);
    if (n && (n.type === "ui_event" || n.type === "start")) return n.id;
  }
  const start = CURRENT_WF.nodes.find(n => n.type === "start");
  return start?.id || null;
}

async function wfSimPlay(stepOnly) {
  if (WF_SIM?.status === "running") return;
  const { nodes, edges, execEdges } = wfSimBuildMaps();
  const startId = wfSimFindStart();
  if (!startId) { showToast("No Start node to run from", "warn"); return; }
  if (!WF_SIM || WF_SIM.status === "idle" || WF_SIM.status === "stopped") {
    wfSimClearVisuals();
    WF_SIM = {
      status: "running",
      stepOnce: false,
      resumeNodeId: null,
      cancel: false,
      pausedAt: null,
      currentNodeId: null,
      steps: 0,
      vars: wfSimInitVars(),
      localStack: [],
      console: [],
      trace: [],
      _callResults: {},
    };
    const el = document.getElementById("wf-sim-console");
    if (el) el.textContent = "";
  } else if (WF_SIM.status === "paused") {
    WF_SIM.status = "running";
    WF_SIM.resumeNodeId = WF_SIM.pausedAt;
    wfSimClearVisuals();
  }
  if (stepOnly) WF_SIM.stepOnce = true;
  const resumeFrom = WF_SIM.pausedAt || startId;
  if (!stepOnly && WF_SIM.status === "running" && !WF_SIM.pausedAt) {
    WF_SIM.pausedAt = null;
  }
  await wfSimRunFrom(resumeFrom, nodes, edges, execEdges, WF_SIM, { allowUiEvent: selectedUiEvent(startId) });
  if (WF_SIM.status === "running") WF_SIM.status = WF_SIM.pausedAt ? "paused" : "idle";
  wfSimRefreshVarPanel();
  scheduleDrawWfConnectors();
}

function selectedUiEvent(startId) {
  const n = CURRENT_WF.nodes.find(nd => nd.id === startId);
  return n?.type === "ui_event";
}

function wfSimStep() {
  wfSimPlay(true);
}

function wfSimStop() {
  if (!WF_SIM) return;
  WF_SIM.cancel = true;
  WF_SIM.status = "stopped";
  wfSimClearVisuals();
}

function wfCollapseSelectionToFunction() {
  const ids = new Set(WF_SELECTED_NODES);
  if (ids.size < 1) { showToast("Select nodes to collapse", "warn"); return; }
  const selNodes = CURRENT_WF.nodes.filter(n => ids.has(n.id));
  const bad = new Set(["start", "func_entry", "func_return", "endif"]);
  if (selNodes.some(n => bad.has(n.type))) {
    showToast("Cannot collapse boundary nodes (start/endif/function)", "warn");
    return;
  }
  const name = window.prompt("Function name");
  if (!name || !isValidWfVarName(name)) return;
  if (wfFuncByName(name)) { showToast("Function name already exists", "warn"); return; }
  wfPushUndo();
  const execIn = [], execOut = [], dataIn = [], dataOut = [];
  CURRENT_WF.edges.forEach(e => {
    const fi = ids.has(e.from), ti = ids.has(e.to);
    if (e.kind === "exec") {
      if (!fi && ti) execIn.push(e);
      if (fi && !ti) execOut.push(e);
    } else {
      if (!fi && ti) dataIn.push(e);
      if (fi && !ti) dataOut.push(e);
    }
  });
  const params = [];
  const seenPorts = new Set();
  dataIn.forEach(e => {
    const pname = e.toPort || "arg";
    if (!seenPorts.has(pname)) {
      seenPorts.add(pname);
      params.push({ name: pname, type: e.pinType || "any" });
    }
  });
  let returns = null;
  if (dataOut.length === 1) returns = dataOut[0].pinType || "any";
  CURRENT_WF.functions.push({ name, params, returns, locals: [] });
  const fnIdx = CURRENT_WF.functions.length - 1;
  wfSetupFunctionGraph(name, fnIdx);
  const entry = CURRENT_WF.nodes.find(n => n.type === "func_entry" && n.funcName === name);
  const ret = CURRENT_WF.nodes.find(n => n.type === "func_return" && n.funcName === name);
  const minX = Math.min(...selNodes.map(n => n.x));
  const minY = Math.min(...selNodes.map(n => n.y));
  const dx = entry.x + 60 - minX;
  const dy = entry.y + 80 - minY;
  selNodes.forEach(n => { n.x += dx; n.y += dy; });
  const fn = CURRENT_WF.functions[fnIdx];
  if (fn.frameId) {
    const c = (CURRENT_WF.comments || []).find(x => x.id === fn.frameId);
    if (c) {
      c.x = Math.min(c.x, entry.x - 20);
      c.y = Math.min(c.y, entry.y - 40);
      c.w = Math.max(c.w, 420);
      c.h = Math.max(c.h, 180);
    }
  }
  execIn.forEach(e => {
    CURRENT_WF.edges.push({ from: entry.id, fromPort: "next", to: e.to, kind: "exec" });
  });
  execOut.forEach(e => {
    CURRENT_WF.edges.push({ from: e.from, fromPort: e.fromPort || "next", to: ret.id, kind: "exec" });
  });
  dataIn.forEach(e => {
    const pname = e.toPort || "arg";
    CURRENT_WF.edges.push({
      from: entry.id, fromPort: pname, to: e.to, toPort: e.toPort,
      kind: "data", pinType: e.pinType || "any",
    });
  });
  dataOut.forEach(e => {
    CURRENT_WF.edges.push({
      from: e.from, fromPort: e.fromPort || "value", to: ret.id, toPort: "return",
      kind: "data", pinType: e.pinType || "any",
    });
  });
  CURRENT_WF.edges = CURRENT_WF.edges.filter(e => {
    const fi = ids.has(e.from), ti = ids.has(e.to);
    if (fi && ti) return true;
    if (!fi && ti && e.kind === "exec") return false;
    if (fi && !ti && e.kind === "exec") return false;
    if (!fi && ti && e.kind === "data") return false;
    if (fi && !ti && e.kind === "data") return false;
    return true;
  });
  const cx = selNodes.reduce((s, n) => s + n.x, 0) / selNodes.length;
  const cy = selNodes.reduce((s, n) => s + n.y, 0) / selNodes.length;
  wfNodeCounter += 1;
  const callId = `n${Date.now()}_${wfNodeCounter}`;
  CURRENT_WF.nodes.push({ id: callId, type: "call_func", x: Math.round(cx), y: Math.round(cy - 120), params: {}, funcName: name });
  execIn.forEach(e => {
    const ext = CURRENT_WF.edges.find(x => x.kind === "exec" && x.to === e.to && x.from !== entry.id);
    if (ext) {
      ext.to = callId;
    } else {
      CURRENT_WF.edges.push({ from: e.from, fromPort: e.fromPort || "next", to: callId, kind: "exec" });
    }
  });
  execOut.forEach(e => {
    CURRENT_WF.edges.push({ from: callId, fromPort: "next", to: e.to, kind: "exec" });
  });
  dataIn.forEach(e => {
    CURRENT_WF.edges.push({
      from: e.from, fromPort: e.fromPort || "value", to: callId, toPort: e.toPort,
      kind: "data", pinType: e.pinType || "any",
    });
  });
  if (returns && dataOut.length === 1) {
    CURRENT_WF.edges.push({
      from: callId, fromPort: "result", to: dataOut[0].to, toPort: dataOut[0].toPort,
      kind: "data", pinType: dataOut[0].pinType || "any",
    });
  }
  WF_SELECTED_NODES = new Set([callId]);
  WF_FOCUS_FUNC = name;
  renderAutomationStudioView();
}

function wfWireLabelPrompt(edgeIdx) {
  const e = CURRENT_WF.edges[edgeIdx];
  if (!e) return;
  const t = window.prompt("Wire label (empty to clear)", e.label || "");
  if (t === null) return;
  wfPushUndo();
  if (t.trim()) e.label = t.trim();
  else delete e.label;
  renderAutomationStudioView();
}

function wfClearWatchOnEdge(edgeIdx) {
  const e = CURRENT_WF.edges[edgeIdx];
  if (!e) return;
  delete WF_WATCH_VALUES[wfEdgeKey(e)];
  scheduleDrawWfConnectors();
}

const WF_RECENT_KEY = "wfRecentNodes";
const WF_FAV_KEY = "wfFavoriteNodes";
const WF_PORT_LABELS = { true: "True", false: "False", pass: "Pass", loop: "Loop", done: "Done", next: "", exec: "in", result: "result", return: "return" };
const WF_CATEGORY_LABELS = {
  event: "Event", flow: "Flow", utility: "Utility", math: "Math", string: "String",
  collection: "Collection", data: "Data", datetime: "Date/Time", variable: "Variables",
  function: "Functions", io: "Files / I/O", network: "Network", waypoint: "Waypoint",
  macro: "Macros", circuit: "Circuit parts",
};

function wfCloneGraph() {
  return JSON.parse(JSON.stringify(wfGraphPayload()));
}

function wfApplyGraph(data) {
  CURRENT_WF.nodes = data.nodes || [];
  CURRENT_WF.edges = data.edges || [];
  CURRENT_WF.variables = data.variables || [];
  CURRENT_WF.functions = data.functions || [];
  CURRENT_WF.comments = data.comments || [];
  CURRENT_WF.notes = data.notes || [];
  if (data.ui) CURRENT_WF.ui = data.ui;
  if (data.meta) CURRENT_WF.meta = { ...data.meta };
}

function wfPushUndo() {
  const snap = JSON.stringify(wfCloneGraph());
  if (WF_UNDO_STACK.length && WF_UNDO_STACK[WF_UNDO_STACK.length - 1] === snap) return;
  WF_UNDO_STACK.push(snap);
  if (WF_UNDO_STACK.length > WF_UNDO_MAX) WF_UNDO_STACK.shift();
  WF_REDO_STACK = [];
  wfMarkWatchesStale();
}

function wfUndo() {
  if (!WF_UNDO_STACK.length) return;
  WF_REDO_STACK.push(JSON.stringify(wfCloneGraph()));
  wfApplyGraph(JSON.parse(WF_UNDO_STACK.pop()));
  WF_SELECTED_NODES.clear();
  wfClearChainFocus();
  renderAutomationStudioView();
}

function wfRedo() {
  if (!WF_REDO_STACK.length) return;
  WF_UNDO_STACK.push(JSON.stringify(wfCloneGraph()));
  wfApplyGraph(JSON.parse(WF_REDO_STACK.pop()));
  WF_SELECTED_NODES.clear();
  wfClearChainFocus();
  renderAutomationStudioView();
}

function wfCopySelection() {
  if (!WF_SELECTED_NODES.size) return;
  const ids = new Set(WF_SELECTED_NODES);
  const nodes = CURRENT_WF.nodes.filter(n => ids.has(n.id)).map(n => JSON.parse(JSON.stringify(n)));
  const edges = CURRENT_WF.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => JSON.parse(JSON.stringify(e)));
  WF_CLIPBOARD = { nodes, edges };
}

function wfPasteAtCursor() {
  if (!WF_CLIPBOARD?.nodes?.length) return;
  wfPushUndo();
  const idMap = {};
  const offset = 40;
  WF_CLIPBOARD.nodes.forEach(old => {
    if (old.type === "start") return;
    wfNodeCounter += 1;
    const newId = `n${Date.now()}_${wfNodeCounter}`;
    idMap[old.id] = newId;
    const copy = JSON.parse(JSON.stringify(old));
    copy.id = newId;
    copy.x = WF_LAST_MOUSE.worldX + (copy.x - WF_CLIPBOARD.nodes[0].x) + offset;
    copy.y = WF_LAST_MOUSE.worldY + (copy.y - WF_CLIPBOARD.nodes[0].y) + offset;
    if (copy.pairId && !idMap[copy.pairId]) copy.pairId = null;
    CURRENT_WF.nodes.push(copy);
  });
  WF_CLIPBOARD.nodes.forEach(old => {
    if (old.pairId && idMap[old.pairId] && idMap[old.id]) {
      CURRENT_WF.nodes.find(n => n.id === idMap[old.id]).pairId = idMap[old.pairId];
      CURRENT_WF.nodes.find(n => n.id === idMap[old.pairId]).pairId = idMap[old.id];
    }
  });
  const newEdges = [];
  WF_CLIPBOARD.edges.forEach(e => {
    if (idMap[e.from] && idMap[e.to]) {
      newEdges.push({ ...JSON.parse(JSON.stringify(e)), from: idMap[e.from], to: idMap[e.to] });
    }
  });
  CURRENT_WF.edges.push(...newEdges);
  WF_SELECTED_NODES = new Set(Object.values(idMap));
  renderAutomationStudioView();
}

function wfLastRunValue(nodeId, port) {
  const run = (CURRENT_WF.meta || {}).lastRun;
  if (!run || typeof run !== "object") return null;
  const key = `${nodeId}:${port}`;
  if (run[key] !== undefined) return run[key];
  const node = CURRENT_WF.nodes.find(n => n.id === nodeId);
  if (node?.type === "get_var" && node.varName && run[node.varName] !== undefined) return run[node.varName];
  return null;
}

function wfPinAcceptedText(pin) {
  const kind = pin.dataset.pinKind || "exec";
  if (kind === "exec") return "Accepts: execution wires (white)";
  const type = pin.dataset.pinType || "any";
  if (type === "any") return "Accepts: any data type";
  return `Accepts: ${type} (or any with cast warning)`;
}

function wfRerouteWireKind(n) {
  if (!n || n.type !== "reroute") return "data";
  if (n.params?.wireKind === "exec" || n.params?.wireKind === "data") return n.params.wireKind;
  const hasExec = CURRENT_WF.edges.some(e => e.kind !== "data" && (e.to === n.id || e.from === n.id));
  return hasExec ? "exec" : "data";
}

function wfReroutePinType(n) {
  if (!n || n.type !== "reroute") return "any";
  if (n.params?.pinType) return n.params.pinType;
  const inEdge = CURRENT_WF.edges.find(e => e.kind === "data" && e.to === n.id && e.toPort === "in");
  if (inEdge?.pinType) return inEdge.pinType;
  const outEdge = CURRENT_WF.edges.find(e => e.kind === "data" && e.from === n.id && e.fromPort === "out");
  return outEdge?.pinType || "any";
}

function wfNodeConnectionLabel(node) {
  if (!node) return "Unknown";
  if (node.type === "reroute") return wfRerouteWireKind(node) === "exec" ? "Reroute (exec)" : "Reroute";
  return wfNodeHeaderLabel(node);
}

function wfPinConnectionText(pin) {
  if (!pin) return "";
  const nodeId = pin.dataset.pinNode || "";
  const port = pin.dataset.pinPort || "";
  const kind = pin.dataset.pinKind || "exec";
  const isIn = pin.classList.contains("wf-pin-in");
  if (isIn) {
    const edge = kind === "data"
      ? CURRENT_WF.edges.find(e => e.kind === "data" && e.to === nodeId && e.toPort === port)
      : CURRENT_WF.edges.find(e => e.kind !== "data" && e.to === nodeId);
    if (!edge) return "Not connected";
    const src = CURRENT_WF.nodes.find(n => n.id === edge.from);
    if (!src) return "Connected (missing node)";
    const fromPort = edge.fromPort || (kind === "exec" ? "next" : "out");
    return `From: ${wfNodeConnectionLabel(src)} · ${fromPort}`;
  }
  const edges = kind === "data"
    ? CURRENT_WF.edges.filter(e => e.kind === "data" && e.from === nodeId && e.fromPort === port)
    : CURRENT_WF.edges.filter(e => e.kind !== "data" && e.from === nodeId && (e.fromPort || "next") === (port || "next"));
  if (!edges.length) return "Not connected";
  if (edges.length === 1) {
    const dst = CURRENT_WF.nodes.find(n => n.id === edges[0].to);
    if (!dst) return "Connected (missing node)";
    const toPort = edges[0].toPort || (kind === "exec" ? "exec" : "in");
    return `To: ${wfNodeConnectionLabel(dst)} · ${toPort}`;
  }
  return `To: ${edges.length} nodes`;
}

function wfPinTooltipText(pin) {
  if (!pin) return "";
  const kind = pin.dataset.pinKind || "exec";
  const port = pin.dataset.pinPort || "";
  const type = pin.dataset.pinType || "";
  const nodeId = pin.dataset.pinNode || "";
  const isIn = pin.classList.contains("wf-pin-in");
  const lines = [];
  if (kind === "exec") {
    const dir = isIn ? "input" : "output";
    lines.push(`exec · ${dir}`);
    lines.push("Execution flow (left-to-right)");
  } else {
    const dir = isIn ? "input" : "output";
    lines.push(`${type || "any"} · ${dir}${port ? ` · ${port}` : ""}`);
    lines.push(wfPinAcceptedText(pin));
  }
  lines.push(wfPinConnectionText(pin));
  const lastVal = wfLastRunValue(nodeId, port || (kind === "exec" ? "exec" : type));
  if (lastVal !== null && lastVal !== undefined) {
    const shown = typeof lastVal === "string" ? lastVal : JSON.stringify(lastVal);
    lines.push(`Last run: ${shown.length > 48 ? shown.slice(0, 45) + "…" : shown}`);
  }
  const diag = WF_DIAGNOSTICS[nodeId];
  if (diag) lines.push(`⚠ ${diag}`);
  return lines.join("\n");
}

function wfShowPinTooltip(pin, clientX, clientY) {
  wfHidePinTooltip();
  const el = document.createElement("div");
  el.className = "wf-pin-tooltip";
  el.style.whiteSpace = "pre-line";
  el.textContent = wfPinTooltipText(pin);
  el.style.left = (clientX + 12) + "px";
  el.style.top = (clientY + 12) + "px";
  document.body.appendChild(el);
  WF_PIN_TOOLTIP_EL = el;
}

function wfHidePinTooltip() {
  clearTimeout(WF_PIN_TOOLTIP_TIMER);
  WF_PIN_TOOLTIP_TIMER = null;
  if (WF_PIN_TOOLTIP_EL) { WF_PIN_TOOLTIP_EL.remove(); WF_PIN_TOOLTIP_EL = null; }
}

function wfNodeEntryCompatible(entry, wireFrom) {
  if (!wireFrom) return true;
  const type = entry.type;
  if (wireFrom.kind === "exec") {
    // Only nodes that accept an execution input.
    if (wfIsEntryNodeType(type)) return false;
    if (type === "__comment__" || type === "__note__" || type === "__get_var_create__") return false;
    if (type === "get_var") return false;
    if (type === "reroute") return true;
    const def = WF_NODE_TYPES[type];
    if (def?.pure) return false;
    return true;
  }
  const srcType = wireFrom.pinType || "any";
  if (type === "set_var" && entry.varName) {
    const vtype = (wfVarByName(entry.varName) || {}).type || "string";
    return !wfTypesMismatch(srcType, vtype);
  }
  if (type === "__set_var_create__") return true;
  if (type === "__get_var_create__") return false;
  if (type === "get_var") return false;
  if (type === "reroute") return true;
  if (type === "func_return" && entry.funcName) {
    const fn = wfFuncByName(entry.funcName);
    return fn?.returns && !wfTypesMismatch(srcType, fn.returns);
  }
  return wfFirstCompatibleDataIn(srcType, type, entry.funcName) !== null;
}

function wfNodeEntryCompatibleToInput(entry, wireTo) {
  if (!wireTo) return true;
  const type = entry.type;
  if (wireTo.kind === "exec") {
    const def = WF_NODE_TYPES[type] || {};
    const hasExecOut = type === "start" || type === "func_entry" || (def.outputs && def.outputs.length);
    return hasExecOut && type !== "func_return" && type !== "__comment__" && type !== "__note__" && type !== "reroute";
  }
  const dstType = wireTo.pinType || "any";
  if (type === "get_var" && entry.varName) {
    const vtype = (wfVarByName(entry.varName) || {}).type || "string";
    return !wfTypesMismatch(vtype, dstType);
  }
  if (type === "__get_var_create__") return wireTo.kind !== "exec";
  if (type === "__set_var_create__") return false;
  if (type === "set_var") return false;
  if (type === "reroute") return true;
  if (type === "call_func" && entry.funcName) {
    const fn = wfFuncByName(entry.funcName);
    return fn?.returns && !wfTypesMismatch(fn.returns, dstType);
  }
  return wfFirstCompatibleDataOut(dstType, type, entry.funcName, entry.varName) !== null;
}

function wfGetRecentNodes() {
  try { return JSON.parse(localStorage.getItem(WF_RECENT_KEY) || "[]"); } catch (_) { return []; }
}
function wfPushRecentNode(type, varName, funcName) {
  const key = varName ? `${type}:${varName}` : funcName ? `${type}:${funcName}` : type;
  let recent = wfGetRecentNodes().filter(r => r.key !== key);
  recent.unshift({ key, type, varName: varName || null, funcName: funcName || null, label: varName ? `${type === "get_var" ? "Get" : "Set"} ${varName}` : funcName ? `Call ${funcName}` : (WF_NODE_TYPES[type]?.label || type) });
  recent = recent.slice(0, 8);
  try { localStorage.setItem(WF_RECENT_KEY, JSON.stringify(recent)); } catch (_) { /* ignore */ }
}

function wfShowVarGhostNode(varName, varType, isSet, clientX, clientY) {
  wfHideVarGhostNode();
  const world = document.getElementById("wf-world");
  if (!world) return;
  const pt = wfClientToWorld(clientX, clientY);
  const el = document.createElement("div");
  el.className = "wf-var-ghost-node";
  el.innerHTML = `<div class="wf-var-ghost-header">${isSet ? "Set" : "Get"} ${escapeHtml(varName)}</div><div class="wf-var-ghost-type" style="color:var(--type-${escapeHtml(varType || "string")});">${escapeHtml(varType || "string")}</div>`;
  el.style.left = (pt.x - 60) + "px";
  el.style.top = (pt.y - 20) + "px";
  world.appendChild(el);
  WF_VAR_GHOST_EL = el;
}

function wfMoveVarGhostNode(clientX, clientY, isSet) {
  if (!WF_VAR_GHOST_EL) return;
  const pt = wfClientToWorld(clientX, clientY);
  WF_VAR_GHOST_EL.style.left = (pt.x - 60) + "px";
  WF_VAR_GHOST_EL.style.top = (pt.y - 20) + "px";
  WF_VAR_GHOST_EL.classList.toggle("wf-var-ghost-set", !!isSet);
}

function wfHideVarGhostNode() {
  if (WF_VAR_GHOST_EL) { WF_VAR_GHOST_EL.remove(); WF_VAR_GHOST_EL = null; }
}

function wfClearSelectionState() {
  WF_SELECTED_NODES.clear();
  WF_SELECTED_EDGE = null;
  if (WF_ALIGN_TOOLBAR) { WF_ALIGN_TOOLBAR.remove(); WF_ALIGN_TOOLBAR = null; }
  wfClearChainFocus();
}

function wfDisarmSpacePan() {
  WF_SPACE_PAN = false;
  WF_SPACE_ARM = null;
  const c = document.getElementById("node-canvas");
  if (c) c.classList.remove("wf-space-ready", "wf-panning");
}

function wfToggleNodeSelection(nodeId, additive) {
  if (!nodeId) return;
  if (additive) {
    if (WF_SELECTED_NODES.has(nodeId)) WF_SELECTED_NODES.delete(nodeId);
    else WF_SELECTED_NODES.add(nodeId);
  } else {
    WF_SELECTED_NODES.clear();
    WF_SELECTED_NODES.add(nodeId);
  }
  WF_SELECTED_EDGE = null;
  document.querySelectorAll(".node-card, .wf-reroute").forEach(card => {
    card.classList.toggle("wf-selected", WF_SELECTED_NODES.has(card.dataset.nodeId));
  });
  document.querySelectorAll(".wf-wire").forEach(w => w.classList.remove("wf-wire-selected"));
  wfUpdateAlignToolbar();
  wfUpdateChainFocusToolbar();
}

function wfVarChipHtml(v) {
  const t = v.type || "string";
  return `<div class="wf-var-chip" draggable="true" data-var-name="${(v.name || "").replace(/"/g, "&quot;")}" data-var-type="${t}" title="Drag to canvas (Alt=Set)">
    <span class="wf-chip-grip" aria-hidden="true">&#8942;&#8942;</span>
    <span class="wf-chip-dot" style="background:var(--type-${t});"></span>
    <span class="wf-chip-label">${v.name}</span>
  </div>`;
}

function wfNodeChipHtml(entry) {
  const def = WF_NODE_TYPES[entry.type] || {};
  const cat = def.category || "utility";
  return `<div class="wf-node-chip" draggable="true" data-node-type="${entry.type}" title="Drag to canvas · click to place">
    <span class="wf-chip-grip" aria-hidden="true">&#8942;&#8942;</span>
    <span class="wf-cat-dot" style="background:var(--cat-${cat}, ${def.visual?.color || "var(--accent)"});"></span>
    <span class="wf-chip-label">${entry.label}</span>
  </div>`;
}

function wfFnChipHtml(f, i) {
  const ps = (f.params || []).map(p => `${p.name}:${p.type}`).join(", ");
  const ret = f.returns ? ` &rarr; ${f.returns}` : "";
  return `<div class="wf-fn-chip" draggable="true" data-fn-name="${(f.name || "").replace(/"/g, "&quot;")}" data-fn-idx="${i}" title="Drag to canvas to place Call node">
    <span class="wf-chip-grip" aria-hidden="true">&#8942;&#8942;</span>
    <span class="wf-chip-dot" style="background:var(--cat-function);"></span>
    <span class="wf-chip-label">${f.name}(${ps})${ret}</span>
    <button type="button" class="wf-fn-edit" data-fn-idx="${i}" title="Edit function graph">&#9998;</button>
  </div>`;
}

function wfFindClearArea(w, h) {
  const step = 80;
  const occupied = (x, y) => CURRENT_WF.nodes.some(n => {
    const nw = n.type === "reroute" ? 16 : 220;
    const nh = n.type === "reroute" ? 16 : 100;
    return x < n.x + nw + 20 && x + w > n.x - 20 && y < n.y + nh + 20 && y + h > n.y - 20;
  });
  for (let y = 40; y < 2800; y += step) {
    for (let x = 40; x < 3600; x += step) {
      if (!occupied(x, y)) return { x, y };
    }
  }
  return { x: 40 + (CURRENT_WF.functions?.length || 0) * 60, y: 40 + (CURRENT_WF.functions?.length || 0) * 60 };
}

function wfSetupFunctionGraph(fnName, fnIdx) {
  const area = wfFindClearArea(420, 180);
  const entryX = area.x + 20;
  const entryY = area.y + 50;
  wfNodeCounter += 1;
  const entryId = `n${Date.now()}_${wfNodeCounter}`;
  wfNodeCounter += 1;
  const retId = `n${Date.now()}_${wfNodeCounter}`;
  CURRENT_WF.nodes.push({ id: entryId, type: "func_entry", x: entryX, y: entryY, params: {}, funcName: fnName, pairId: retId });
  CURRENT_WF.nodes.push({ id: retId, type: "func_return", x: entryX + 320, y: entryY, params: {}, funcName: fnName, pairId: entryId });
  wfNodeCounter += 1;
  const commentId = `c${Date.now()}_${wfNodeCounter}`;
  CURRENT_WF.comments = CURRENT_WF.comments || [];
  CURRENT_WF.comments.push({
    id: commentId, x: area.x, y: area.y, w: 420, h: 160,
    title: fnName,
    body: `Function zone for ${fnName}. Expand/collapse with ▸.`,
    color: WF_COMMENT_COLORS[3],
    collapsed: false,
  });
  if (CURRENT_WF.functions[fnIdx]) {
    CURRENT_WF.functions[fnIdx].frameId = commentId;
    CURRENT_WF.functions[fnIdx].entryId = entryId;
  }
}

function wfFrameFunction(fnIdx) {
  const fn = CURRENT_WF.functions?.[fnIdx];
  if (!fn) return;
  wfSaveScopeViewport();
  wfSetFocusFunction(fn.name);
  if (wfRestoreScopeViewport(`fn:${fn.name}`)) {
    wfRenderBreadcrumbBar();
    return;
  }
  const c = (CURRENT_WF.comments || []).find(x => x.id === fn.frameId);
  if (c) {
    const canvas = document.getElementById("node-canvas");
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const pad = 24;
    const gw = c.w + pad * 2;
    const gh = c.h + pad * 2;
    const m = wfMeta();
    m.zoom = Math.min(WF_ZOOM_MAX, Math.max(WF_ZOOM_MIN, Math.min(cr.width / gw, cr.height / gh, 1)));
    m.panX = (cr.width - gw * m.zoom) / 2 - (c.x - pad) * m.zoom;
    m.panY = (cr.height - gh * m.zoom) / 2 - (c.y - pad) * m.zoom;
    applyWfCanvasTransform();
    scheduleDrawWfConnectors();
    wfDrawMinimap();
    return;
  }
  const entry = CURRENT_WF.nodes.find(n => n.type === "func_entry" && n.funcName === fn.name);
  if (entry) wfFitNodesBounds([entry.id, entry.pairId].filter(Boolean));
}

function wfFitNodesBounds(nodeIds) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodeIds.forEach(id => {
    const n = CURRENT_WF.nodes.find(nd => nd.id === id);
    if (!n) return;
    const w = n.type === "reroute" ? 16 : 220;
    const h = n.type === "reroute" ? 16 : 80;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
  });
  if (!isFinite(minX)) return;
  const pad = 40;
  const cr = canvas.getBoundingClientRect();
  const gw = maxX - minX + pad * 2;
  const gh = maxY - minY + pad * 2;
  const m = wfMeta();
  m.zoom = Math.min(WF_ZOOM_MAX, Math.max(WF_ZOOM_MIN, Math.min(cr.width / gw, cr.height / gh, 1)));
  m.panX = (cr.width - gw * m.zoom) / 2 - (minX - pad) * m.zoom;
  m.panY = (cr.height - gh * m.zoom) / 2 - (minY - pad) * m.zoom;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
  wfDrawMinimap();
}

function wfHighlightVarRefs(varName) {
  const refs = wfVarNodeRefs(varName);
  refs.forEach(n => {
    const el = document.querySelector(`.node-card[data-node-id="${n.id}"], .wf-reroute[data-node-id="${n.id}"]`);
    if (el) el.classList.add("wf-ref-highlight");
  });
  if (refs.length) wfFitNodesBounds(refs.map(n => n.id));
  setTimeout(() => document.querySelectorAll(".wf-ref-highlight").forEach(el => el.classList.remove("wf-ref-highlight")), 2500);
}

function wfAlignSelection(mode) {
  const ids = Array.from(WF_SELECTED_NODES);
  if (ids.length < 2 && !mode.startsWith("straighten")) return;
  wfPushUndo();
  const items = ids.map(id => {
    const n = CURRENT_WF.nodes.find(nd => nd.id === id);
    const card = document.querySelector(`.node-card[data-node-id="${id}"], .wf-reroute[data-node-id="${id}"]`);
    const w = card ? card.offsetWidth : (n?.type === "reroute" ? 16 : 220);
    const h = card ? card.offsetHeight : (n?.type === "reroute" ? 16 : 80);
    return { n, w, h };
  }).filter(x => x.n);
  if (mode === "left") {
    const minX = Math.min(...items.map(x => x.n.x));
    items.forEach(x => { x.n.x = minX; });
  } else if (mode === "center-h") {
    const centers = items.map(x => x.n.x + x.w / 2);
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
    items.forEach(x => { x.n.x = Math.round(avg - x.w / 2); });
  } else if (mode === "right") {
    const maxR = Math.max(...items.map(x => x.n.x + x.w));
    items.forEach(x => { x.n.x = maxR - x.w; });
  } else if (mode === "top") {
    const minY = Math.min(...items.map(x => x.n.y));
    items.forEach(x => { x.n.y = minY; });
  } else if (mode === "middle") {
    const centers = items.map(x => x.n.y + x.h / 2);
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
    items.forEach(x => { x.n.y = Math.round(avg - x.h / 2); });
  } else if (mode === "bottom") {
    const maxB = Math.max(...items.map(x => x.n.y + x.h));
    items.forEach(x => { x.n.y = maxB - x.h; });
  } else if (mode === "distribute-h") {
    items.sort((a, b) => a.n.x - b.n.x);
    const left = items[0].n.x;
    const right = items[items.length - 1].n.x + items[items.length - 1].w;
    const totalW = items.reduce((s, x) => s + x.w, 0);
    const gap = (right - left - totalW) / (items.length - 1);
    let x = left;
    items.forEach(xt => { xt.n.x = Math.round(x); x += xt.w + gap; });
  } else if (mode === "distribute-v") {
    items.sort((a, b) => a.n.y - b.n.y);
    const top = items[0].n.y;
    const bottom = items[items.length - 1].n.y + items[items.length - 1].h;
    const totalH = items.reduce((s, x) => s + x.h, 0);
    const gap = (bottom - top - totalH) / (items.length - 1);
    let y = top;
    items.forEach(xt => { xt.n.y = Math.round(y); y += xt.h + gap; });
  } else if (mode === "straighten") {
    CURRENT_WF.edges.forEach((e, i) => {
      if (!WF_SELECTED_NODES.has(e.from) && !WF_SELECTED_NODES.has(e.to)) return;
      if (!e.style) e.style = {};
      e.style.straighten = true;
    });
  }
  items.forEach(x => {
    x.n.x = wfSnapCoord(x.n.x);
    x.n.y = wfSnapCoord(x.n.y);
  });
  renderAutomationStudioView();
}

const WF_ALIGN_TITLES = {
  left: "Align left",
  "center-h": "Center horizontally",
  right: "Align right",
  top: "Align top",
  middle: "Center vertically",
  bottom: "Align bottom",
  "distribute-h": "Distribute horizontally",
  "distribute-v": "Distribute vertically",
  straighten: "Straighten selected wires",
  tidy: "Tidy layout",
  group: "Group in comment",
  collapse: "Collapse to function",
};

function wfUpdateAlignToolbar() {
  if (WF_ALIGN_TOOLBAR) { WF_ALIGN_TOOLBAR.remove(); WF_ALIGN_TOOLBAR = null; }
  if (!wfGraphEditorActive() || WF_SELECTED_NODES.size < 2) return;
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity;
  WF_SELECTED_NODES.forEach(id => {
    const n = CURRENT_WF.nodes.find(nd => nd.id === id);
    const card = document.querySelector(`.node-card[data-node-id="${id}"], .wf-reroute[data-node-id="${id}"]`);
    if (!n || !card) return;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + card.offsetWidth);
  });
  if (!isFinite(minX)) return;
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  const screenX = cr.left + m.panX + ((minX + maxX) / 2) * m.zoom;
  const screenY = cr.top + m.panY + minY * m.zoom - 36;
  const bar = document.createElement("div");
  bar.className = "wf-align-toolbar";
  bar.style.left = Math.max(8, screenX - 120) + "px";
  bar.style.top = Math.max(8, screenY) + "px";
  const btns = [
    ["left", "&#8676;"], ["center-h", "&#8596;"], ["right", "&#8677;"],
    ["top", "&#8679;"], ["middle", "&#8597;"], ["bottom", "&#8681;"],
    ["distribute-h", "&#8801;H"], ["distribute-v", "&#8801;V"], ["straighten", "~"],
    ["__tidy", "Tidy"], ["__group", "Group"], ["__collapse", "Collapse"],
  ];
  bar.innerHTML = btns.map(([mode, label]) =>
    mode.startsWith("__")
      ? `<button type="button" class="secondary wf-align-btn" data-align-action="${mode.slice(2)}" title="${WF_ALIGN_TITLES[mode.slice(2)] || mode.slice(2)}">${label}</button>`
      : `<button type="button" class="secondary wf-align-btn" data-align="${mode}" title="${WF_ALIGN_TITLES[mode] || mode}">${label}</button>`
  ).join("");
  document.body.appendChild(bar);
  WF_ALIGN_TOOLBAR = bar;
  bar.querySelectorAll(".wf-align-btn").forEach(btn => {
    if (btn.dataset.alignAction === "tidy") {
      btn.onclick = (e) => { e.stopPropagation(); wfTidyLayout(); };
    } else if (btn.dataset.alignAction === "group") {
      btn.onclick = (e) => { e.stopPropagation(); wfWrapSelectionInComment(); };
    } else if (btn.dataset.alignAction === "collapse") {
      btn.onclick = (e) => { e.stopPropagation(); wfCollapseSelectionToFunction(); };
    } else {
      btn.onclick = (e) => { e.stopPropagation(); wfAlignSelection(btn.dataset.align); };
    }
  });
}

function wfCanvasCssColor(name, fallback) {
  // Canvas 2D ignores CSS vars / color-mix(); resolve against a live element.
  try {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    if (resolved && resolved !== "rgba(0, 0, 0, 0)" && resolved !== "transparent") return resolved;
  } catch (_) { /* fall through */ }
  return fallback;
}

function wfDrawMinimap() {
  const mm = document.getElementById("wf-minimap");
  const mmCanvas = document.getElementById("wf-minimap-canvas");
  const canvas = document.getElementById("node-canvas");
  if (!mm || !mmCanvas || !canvas || !WF_MINIMAP_VISIBLE) return;
  const ctx = mmCanvas.getContext("2d");
  const mw = 160, mh = 100;
  mmCanvas.width = mw; mmCanvas.height = mh;
  const b = wfContentBounds();
  const pad = 80;
  const worldW = Math.max(b.maxX - b.minX + pad * 2, 400);
  const worldH = Math.max(b.maxY - b.minY + pad * 2, 300);
  const ox = b.minX - pad, oy = b.minY - pad;
  const sx = mw / worldW, sy = mh / worldH;
  const shell = wfCanvasCssColor("--bg-shell", "#1a1a1e");
  const accent = wfCanvasCssColor("--accent", "#c9a227");
  ctx.fillStyle = shell;
  ctx.fillRect(0, 0, mw, mh);
  // Slight dim so nodes read against the shell.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, 0, mw, mh);
  ctx.fillStyle = accent;
  (CURRENT_WF.nodes || []).forEach(n => {
    const w = n.type === "reroute" ? 8 : 12;
    const h = n.type === "reroute" ? 8 : 6;
    ctx.fillRect((n.x - ox) * sx, (n.y - oy) * sy, w, h);
  });
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  const vw = cr.width / m.zoom;
  const vh = cr.height / m.zoom;
  const viewX = (-m.panX / m.zoom - ox) * sx;
  const viewY = (-m.panY / m.zoom - oy) * sy;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(viewX, viewY, vw * sx, vh * sy);
  mm._wfMap = { ox, oy, sx, sy, mw, mh, worldW, worldH };
}

function wfMinimapPanTo(clientX, clientY) {
  const mm = document.getElementById("wf-minimap");
  const canvas = document.getElementById("node-canvas");
  if (!mm?._wfMap || !canvas) return;
  const rect = mm.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const { ox, oy, sx, sy } = mm._wfMap;
  const wx = mx / sx + ox;
  const wy = my / sy + oy;
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  m.panX = cr.width / 2 - wx * m.zoom;
  m.panY = cr.height / 2 - wy * m.zoom;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
  wfDrawMinimap();
}

function wfUpdatePinHighlights(from) {
  document.querySelectorAll(".wf-pin-in").forEach(pin => {
    pin.classList.remove("wf-pin-compatible", "wf-pin-incompatible", "wf-pin-target");
    pin.style.removeProperty("--wf-pin-glow");
    if (pin.dataset.pinNode === from.nodeId) {
      pin.classList.add("wf-pin-incompatible");
      return;
    }
    const toPin = wfPinFromElement(pin);
    const check = wfPinsCanConnect(from, "out", toPin, "in");
    if (!check.ok) {
      pin.classList.add("wf-pin-incompatible");
      return;
    }
    if (from.kind === "data") {
      const dstType = pin.dataset.pinType || "string";
      pin.classList.add("wf-pin-compatible");
      pin.style.setProperty("--wf-pin-glow", `var(--type-${dstType}, var(--status-good))`);
    } else {
      pin.classList.add("wf-pin-compatible");
      pin.style.setProperty("--wf-pin-glow", "var(--accent)");
    }
  });
}

function wfUpdatePinHighlightsFromInput(to) {
  document.querySelectorAll(".wf-pin-out").forEach(pin => {
    pin.classList.remove("wf-pin-compatible", "wf-pin-incompatible", "wf-pin-target");
    pin.style.removeProperty("--wf-pin-glow");
    const fromPin = wfPinFromElement(pin);
    const check = wfPinsCanConnect(fromPin, "out", to, "in");
    if (!check.ok) {
      pin.classList.add("wf-pin-incompatible");
      return;
    }
    if (to.kind === "data") {
      const srcType = pin.dataset.pinType || "any";
      pin.classList.add("wf-pin-compatible");
      pin.style.setProperty("--wf-pin-glow", `var(--type-${srcType}, var(--status-good))`);
    } else {
      pin.classList.add("wf-pin-compatible");
      pin.style.setProperty("--wf-pin-glow", "var(--accent)");
    }
  });
}

function wfClearPinHighlights() {
  document.querySelectorAll(".wf-pin-in, .wf-pin-out").forEach(pin => {
    pin.classList.remove("wf-pin-compatible", "wf-pin-incompatible", "wf-pin-target");
    pin.style.removeProperty("--wf-pin-glow");
  });
}

function wfOpenSearchPalette() {
  if (!wfGraphEditorActive() || document.getElementById("wf-context-menu")) return;
  const canvas = document.getElementById("node-canvas");
  canvas.focus();
  wfEnsurePaletteMouseCoords();
  const autoWireFrom = WF_SELECTED_NODES.size === 1 ? wfFirstCompatibleOutput([...WF_SELECTED_NODES][0]) : null;
  const cx = WF_LAST_MOUSE.worldX;
  const cy = WF_LAST_MOUSE.worldY;
  showWfContextMenu(WF_LAST_MOUSE.clientX, WF_LAST_MOUSE.clientY, (type, varName, funcName, autoWire) => {
    wfHandlePalettePick(type, cx, cy, autoWire || null, varName, funcName);
  }, { autoWireFrom });
}

function wfHandlePalettePick(type, cx, cy, wireFrom, varName, funcName, wireTo) {
  if (type === "__comment__") {
    wfAddComment(cx - 120, cy - 40);
    renderAutomationStudioView();
    return;
  }
  if (type === "__note__") {
    wfAddNote(cx, cy);
    renderAutomationStudioView();
    return;
  }
  if (type === "__get_var_create__" || type === "__set_var_create__") {
    const isSet = type === "__set_var_create__";
    const name = window.prompt(isSet ? "Variable name for Set node:" : "Variable name for Get node:");
    if (!name?.trim()) return;
    const trimmed = name.trim();
    if (!isValidWfVarName(trimmed)) { window.alert("Not a valid variable name."); return; }
    wfPushUndo();
    if (!wfVarByName(trimmed)) {
      CURRENT_WF.variables = CURRENT_WF.variables || [];
      CURRENT_WF.variables.push({ name: trimmed, type: "string", default: "" });
    }
    wfPlaceNode(isSet ? "set_var" : "get_var", cx, cy, wireFrom, trimmed, null, wireTo, true);
    return;
  }
  wfPlaceNode(type, cx, cy, wireFrom, varName, funcName, wireTo);
}

function wfNodeIsOrphan(n) {
  if (!n) return true;
  // Entry points can sit unwired as roots; everything else with zero edges is inert.
  if (wfIsEntryNodeType(n.type)) return false;
  const edges = CURRENT_WF?.edges || [];
  return !edges.some(e => e.from === n.id || e.to === n.id);
}

function wfApproxNodeSize(n) {
  if (!n) return { w: 220, h: 90 };
  if (n.type === "reroute") return { w: 16, h: 16 };
  const card = document.querySelector(`.node-card[data-node-id="${n.id}"]`);
  if (card) return { w: card.offsetWidth || 220, h: card.offsetHeight || 90 };
  return { w: 220, h: 90 };
}

function wfCommentMembershipSnapshot() {
  const map = {};
  (CURRENT_WF.comments || []).forEach(c => {
    const h = c.collapsed ? (c.expandedH || c.h || 140) : (c.h || 140);
    map[c.id] = (CURRENT_WF.nodes || []).filter(n => {
      const { w, h: nh } = wfApproxNodeSize(n);
      const cx = n.x + w / 2;
      const cy = n.y + nh / 2;
      return cx >= c.x && cx <= c.x + (c.w || 240) && cy >= c.y && cy <= c.y + h;
    }).map(n => n.id);
  });
  return map;
}

function wfRefitCommentsToMembers(membership) {
  (CURRENT_WF.comments || []).forEach(c => {
    const ids = membership?.[c.id] || [];
    const members = (CURRENT_WF.nodes || []).filter(n => ids.includes(n.id));
    if (!members.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach(n => {
      const { w, h } = wfApproxNodeSize(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });
    c.x = Math.round((minX - 28) / 8) * 8;
    c.y = Math.round((minY - 36) / 8) * 8;
    c.w = Math.max(200, Math.round((maxX - minX + 56) / 8) * 8);
    const nextH = Math.max(100, Math.round((maxY - minY + 56) / 8) * 8);
    if (c.collapsed) c.expandedH = nextH;
    else c.h = nextH;
  });
}

function wfApplyDiagnostics() {
  WF_DIAGNOSTICS = {};
  (CURRENT_WF.nodes || []).forEach(n => {
    if ((n.type === "get_var" || n.type === "set_var") && n.varName && !wfVarExists(n.varName)) {
      WF_DIAGNOSTICS[n.id] = `Variable "${n.varName}" is not declared`;
    }
  });
  CURRENT_WF.edges.filter(e => e.kind === "data" && e.typeMismatch).forEach(e => {
    WF_DIAGNOSTICS[e.to] = WF_DIAGNOSTICS[e.to] || "Type mismatch on data wire (implicit cast)";
  });
  document.querySelectorAll(".node-card, .wf-reroute").forEach(card => {
    const id = card.dataset.nodeId;
    const node = (CURRENT_WF.nodes || []).find(n => n.id === id);
    const orphan = !!(node && wfNodeIsOrphan(node));
    card.classList.toggle("wf-diag-error", !!WF_DIAGNOSTICS[id]);
    card.classList.toggle("wf-orphan", orphan);
    if (WF_DIAGNOSTICS[id]) card.title = WF_DIAGNOSTICS[id];
    else if (orphan) card.title = "No connections — this node does nothing until wired";
    else card.removeAttribute("title");
  });
}

function wfShakeNode(nodeId) {
  const el = document.querySelector(`.node-card[data-node-id="${nodeId}"], .wf-reroute[data-node-id="${nodeId}"]`);
  if (!el) return;
  el.classList.add("wf-shake");
  setTimeout(() => el.classList.remove("wf-shake"), 500);
}
function wfPlaceNode(type, x, y, wireFrom, varName, funcName, wireTo, skipUndo) {
  if (typeof blueprintQuestAllowsNode === "function" && !blueprintQuestAllowsNode(type)) {
    showToast("That node is not in this quest's known-parts palette");
    return null;
  }
  if (!skipUndo) wfPushUndo();
  wfPushRecentNode(type, varName, funcName);
  wfNodeCounter += 1;
  const id = `n${Date.now()}_${wfNodeCounter}`;
  const placed = wfConstrainNodePlacement(type, x, y);
  x = placed.x;
  y = placed.y;
  if (type === "if") {
    x = wfSnapCoord(x);
    y = wfSnapCoord(y);
  }
  const node = { id, type, x, y, params: {} };
  if (varName) node.varName = varName;
  if (funcName) node.funcName = funcName;
  CURRENT_WF.nodes.push(node);
  let endifId = null;
  if (type === "if") {
    wfNodeCounter += 1;
    endifId = `n${Date.now()}_${wfNodeCounter}`;
    CURRENT_WF.nodes.push({ id: endifId, type: "endif", x: x + 280, y, params: {}, pairId: id });
    CURRENT_WF.nodes.find(n => n.id === id).pairId = endifId;
  }
  if (type === "func_entry" && funcName) {
    wfNodeCounter += 1;
    const retId = `n${Date.now()}_${wfNodeCounter}`;
    CURRENT_WF.nodes.push({ id: retId, type: "func_return", x: x + 320, y, params: {}, pairId: id, funcName });
    CURRENT_WF.nodes.find(n => n.id === id).pairId = retId;
  }
  if (wireFrom) {
    if (wireFrom.kind === "data") {
      const target = wfFirstCompatibleDataIn(wireFrom.pinType, type, funcName);
      if (target) wfConnectEdge(wireFrom, id, target.toPort);
    } else if (
      !wfIsEntryNodeType(type)
      && type !== "get_var" && !(WF_NODE_TYPES[type] || {}).pure
    ) {
      wfConnectEdge(wireFrom, id, "exec");
    }
  }
  if (wireTo) {
    if (wireTo.kind === "data") {
      const out = wfFirstCompatibleDataOut(wireTo.pinType, type, funcName, varName);
      if (out) wfConnectEdge({ nodeId: id, port: out.port, kind: "data", pinType: out.type }, wireTo.nodeId, wireTo.port);
    } else if (type === "if" && endifId) {
      wfConnectEdge({ nodeId: endifId, port: "next", kind: "exec" }, wireTo.nodeId, "exec");
    } else {
      const def = WF_NODE_TYPES[type] || {};
      const execOut = type === "start" ? "next" : (def.outputs || [])[0];
      if (execOut) wfConnectEdge({ nodeId: id, port: execOut, kind: "exec" }, wireTo.nodeId, "exec");
    }
  }
  if (type === "if") {
    wfShowCraftTick("Branch (If) + End If placed — wire True/False paths, then End If continues",
      WF_LAST_MOUSE.clientX || wfCanvasScreenCenter().x,
      WF_LAST_MOUSE.clientY || wfCanvasScreenCenter().y);
  }
  WF_SELECTED_NODES = new Set([id]);
  WF_SELECTED_EDGE = null;
  renderAutomationStudioView();
  return id;
}

function wfConstrainNodePlacement(type, x, y) {
  const canvas = document.getElementById("node-canvas");
  const visible = wfCanvasVisibleRect();
  if (!canvas || !visible) return { x, y };
  const cr = canvas.getBoundingClientRect();
  const m = wfMeta();
  const nodeW = type === "reroute" ? 16 : 220;
  const nodeH = type === "reroute" ? 16 : 150;
  const gutter = 12;
  const minX = (visible.left - cr.left - m.panX) / m.zoom + gutter;
  const minY = (visible.top - cr.top - m.panY) / m.zoom + gutter;
  const maxX = (visible.right - cr.left - m.panX) / m.zoom - nodeW - gutter;
  const maxY = (visible.bottom - cr.top - m.panY) / m.zoom - nodeH - gutter;
  const desiredX = x - (type === "reroute" ? 8 : 18);
  const desiredY = y - (type === "reroute" ? 8 : 18);
  return {
    x: Math.round(maxX >= minX ? Math.min(maxX, Math.max(minX, desiredX)) : minX),
    y: Math.round(maxY >= minY ? Math.min(maxY, Math.max(minY, desiredY)) : minY),
  };
}

function wfLiteralNodeTypeForPin(pinType) {
  if (pinType === "bool") return "literal_bool";
  if (pinType === "int" || pinType === "float") return "literal_number";
  return "literal_string";
}

function wfLiteralResultType(litType) {
  if (litType === "literal_bool") return "bool";
  if (litType === "literal_number") return "float";
  return "string";
}

function wfPromoteLiteralToNode(nodeId, param, pinType) {
  const node = CURRENT_WF.nodes.find(n => n.id === nodeId);
  if (!node || wfIsParamWired(nodeId, param)) return;
  const litType = wfLiteralNodeTypeForPin(pinType);
  const raw = ((node.params || {})[param] ?? "").toString();
  wfPushUndo();
  wfNodeCounter += 1;
  const litId = `n${Date.now()}_${wfNodeCounter}`;
  CURRENT_WF.nodes.push({
    id: litId,
    type: litType,
    x: Math.max(0, (node.x || 0) - 170),
    y: (node.y || 0) + 24,
    params: { value: raw },
  });
  if (!node.params) node.params = {};
  node.params[param] = "";
  wfConnectEdge(
    { nodeId: litId, port: "result", kind: "data", pinType: wfLiteralResultType(litType) },
    nodeId,
    param,
  );
  renderAutomationStudioView();
}

function wfPinRejectHint(msg, clientX, clientY, pin) {
  wfFlashPinReject(pin);
  wfShowCraftTick(msg, clientX, clientY);
}

function wfPinsCanConnect(fromPin, fromSide, toPin, toSide) {
  if (!fromPin || !toPin) return { ok: false, reason: "No pin" };
  if (fromSide === toSide) return { ok: false, reason: "Connect input to output" };
  if (fromPin.kind !== toPin.kind) return { ok: false, reason: "Exec and data pins cannot connect" };
  if (fromPin.nodeId === toPin.nodeId) return { ok: false, reason: "Cannot wire a node to itself" };
  if (fromPin.kind === "exec") return { ok: true };
  const srcType = fromSide === "out" ? (fromPin.pinType || "any") : (toPin.pinType || "any");
  const dstType = fromSide === "out" ? (toPin.pinType || "any") : (fromPin.pinType || "any");
  if (wfTypesMismatch(srcType, dstType)) {
    return { ok: false, reason: `Type mismatch: ${srcType} → ${dstType}` };
  }
  return { ok: true };
}

function wfFlashPinReject(pin) {
  if (!pin) return;
  pin.classList.add("wf-pin-reject");
  const prev = { boxShadow: pin.style.boxShadow, borderColor: pin.style.borderColor, background: pin.style.background };
  pin.style.boxShadow = "0 0 10px #c33";
  pin.style.borderColor = "#c33";
  pin.style.background = "#c33";
  setTimeout(() => {
    pin.classList.remove("wf-pin-reject");
    pin.style.boxShadow = prev.boxShadow;
    pin.style.borderColor = prev.borderColor;
    pin.style.background = prev.background;
  }, 350);
}

function wfVarByName(name) {
  return (CURRENT_WF.variables || []).find(v => v.name === name);
}

function wfVarExists(name) {
  return !!(name && wfVarByName(name));
}

function wfVarNodeRefs(name) {
  return (CURRENT_WF.nodes || []).filter(n =>
    (n.type === "get_var" || n.type === "set_var") && n.varName === name);
}

function wfFuncByName(name) {
  return (CURRENT_WF.functions || []).find(f => f.name === name);
}

function wfExecInPin(nodeId, label) {
  return `<div class="wf-pin-row wf-pin-row-in"><div class="wf-pin wf-pin-in" data-pin-node="${nodeId}" data-pin-kind="exec" data-pin-port="exec" title="Execution input"></div><span class="wf-pin-label">${label || "in"}</span></div>`;
}

function wfExecOutPin(nodeId, port, label) {
  const mapped = WF_PORT_LABELS[port];
  const lbl = label !== undefined ? label : (mapped !== undefined ? mapped : port);
  return `<div class="wf-pin-row wf-pin-row-out">${lbl ? `<span class="wf-pin-label">${lbl}</span>` : ""}<div class="wf-pin wf-pin-out port-${port}" data-pin-node="${nodeId}" data-pin-kind="exec" data-pin-port="${port}" title="Execution output"></div></div>`;
}

function wfDataInPin(nodeId, port, type, label, node, wired) {
  const style = wfPinTypeStyle(type);
  const lit = wfLiteralInputHtml(node, port, type);
  const litStyle = wired ? ' style="display:none;"' : "";
  const connCls = wired ? " wf-pin-connected" : "";
  return `<div class="wf-pin-row wf-pin-row-in wf-pin-row-data"><div class="wf-pin wf-pin-in wf-pin-data${connCls}" data-pin-node="${nodeId}" data-pin-kind="data" data-pin-port="${port}" data-pin-type="${type}" style="${style}" title="${type} input"></div><span class="wf-pin-label">${label || port}</span><span class="wf-pin-literal-wrap"${litStyle}>${lit}</span></div>`;
}

function wfLiteralInputHtml(node, param, type) {
  const val = ((node.params || {})[param] || "").toString().replace(/"/g, "&quot;");
  const isLong = param === "code" || param === "content";
  const promote = `<button type="button" class="wf-literal-promote" data-node="${node.id}" data-param="${param}" data-pin-type="${type}" title="Promote to literal node" style="flex:0 0 auto;padding:0 3px 4px;font-size:10px;line-height:1;border:1px solid var(--border);border-radius:3px;background:var(--bg-shell);cursor:pointer;color:var(--ink-muted);">↗</button>`;
  if (isLong) {
    return `${promote}<textarea class="wf-pin-literal" data-node="${node.id}" data-param="${param}" placeholder="${param}" style="min-height:36px;flex:1;font-size:11px;">${val}</textarea>`;
  }
  return `${promote}<input type="text" class="wf-pin-literal" data-node="${node.id}" data-param="${param}" placeholder="${param}" value="${val}" style="flex:1;min-width:48px;max-width:90px;font-size:11px;">`;
}

function wfIdentifierFieldHtml(node, param) {
  const val = ((node.params || {})[param] || "").toString().replace(/"/g, "&quot;");
  return `<div class="wf-id-field" style="padding:4px 8px;font-size:11px;display:flex;gap:4px;align-items:center;"><span style="color:var(--ink-muted);">${param}</span><input type="text" data-node="${node.id}" data-param="${param}" value="${val}" style="flex:1;"></div>`;
}

function wfDataOutPin(nodeId, port, type, label) {
  const style = wfPinTypeStyle(type);
  return `<div class="wf-pin-row wf-pin-row-out"><span class="wf-pin-label">${label || port}</span><div class="wf-pin wf-pin-out wf-pin-data" data-pin-node="${nodeId}" data-pin-kind="data" data-pin-port="${port}" data-pin-type="${type}" style="${style}" title="${type} output"></div></div>`;
}

function wfFunctionMenuEntries() {
  return (CURRENT_WF.functions || []).flatMap(f => ([
    { type: "call_func", label: `Call ${f.name}`, category: "function", funcName: f.name },
    { type: "func_entry", label: `Function ${f.name}`, category: "function", funcName: f.name },
  ]));
}

function wfContextMenuEntries() {
  const nodes = Object.entries(WF_NODE_TYPES)
    .filter(([type]) => type !== "start" && type !== "endif" && type !== "get_var" && type !== "set_var"
      && type !== "func_entry" && type !== "func_return" && type !== "call_func" && type !== "reroute")
    .map(([type, def]) => {
      const paramNames = wfNormalizeParams(def).map(param => param.name);
      return {
        type,
        label: type === "custom" ? "Custom Python (code)" : def.label,
        category: def.category,
        searchKeys: [...(def.searchKeys || []), ...(WF_CATALOG_SEARCH_KEYS[type] || []), def.category || "", ...paramNames],
      };
    });
  // Surface Python coding + comments first so Blueprint feels codeable immediately.
  const pinned = nodes.filter(e => e.type === "custom" || e.type === "print" || e.type === "print_value");
  const rest = nodes.filter(e => !pinned.some(p => p.type === e.type));
  const entries = [{ type: "__comment__", label: "Add comment", category: "utility" },
    { type: "__note__", label: "Add note", category: "utility" }]
    .concat(pinned, rest, wfVariableMenuEntries(), wfFunctionMenuEntries());
  return typeof blueprintQuestFilterEntries === "function"
    ? blueprintQuestFilterEntries(entries)
    : entries;
}

function wfNodePinsHtml(n) {
  const def = WF_NODE_TYPES[n.type] || { outputs: ["next"], params: [] };
  let html = "";

  if (n.type === "reroute") {
    const wireKind = wfRerouteWireKind(n);
    if (wireKind === "exec") {
      html += wfExecInPin(n.id);
      html += wfExecOutPin(n.id, "next", "");
      return html;
    }
    const pinType = wfReroutePinType(n);
    const wired = wfIsParamWired(n.id, "in");
    html += wfDataInPin(n.id, "in", pinType, "", n, wired);
    html += wfDataOutPin(n.id, "out", pinType, "");
    return html;
  }

  if (n.type === "get_var" || wfIsPureNode(n)) {
    wfDataOutputDefs(n).forEach(d => { html += wfDataOutPin(n.id, d.port, d.type, d.label); });
    wfParamDefs(n).filter(p => p.wire).forEach(p => {
      html += wfDataInPin(n.id, p.name, p.type, p.name, n, wfIsParamWired(n.id, p.name));
    });
    return html;
  }
  if (n.type === "set_var") {
    const vtype = (wfVarByName(n.varName) || {}).type || "string";
    html += wfExecInPin(n.id);
    html += wfDataInPin(n.id, "value", vtype, n.varName || "value", n, wfIsParamWired(n.id, "value"));
    html += wfExecOutPin(n.id, "next", "");
    return html;
  }
  if (n.type === "func_entry") {
    wfDataOutputDefs(n).forEach(d => { html += wfDataOutPin(n.id, d.port, d.type, d.label); });
    html += wfExecOutPin(n.id, "next", "");
    return html;
  }
  // Event/function entries are sources (like Start): exec out only — no "in" pin.
  if (wfIsEntryNodeType(n.type) && n.type !== "start" && n.type !== "func_entry") {
    wfDataOutputDefs(n).forEach(d => { html += wfDataOutPin(n.id, d.port, d.type, d.label); });
    html += wfExecOutPin(n.id, "next", "");
    return html;
  }
  if (n.type === "func_return") {
    const fn = wfFuncByName(n.funcName) || {};
    html += wfExecInPin(n.id);
    if (fn.returns) html += wfDataInPin(n.id, "return", fn.returns, "return", n, wfIsParamWired(n.id, "return"));
    return html;
  }
  if (n.type === "call_func") {
    html += wfExecInPin(n.id);
    wfParamDefs(n).forEach(p => {
      html += wfDataInPin(n.id, p.name, p.type, p.name, n, wfIsParamWired(n.id, p.name));
    });
    wfDataOutputDefs(n).forEach(d => { html += wfDataOutPin(n.id, d.port, d.type, d.label); });
    html += wfExecOutPin(n.id, "next", "");
    return html;
  }

  if (!wfIsEntryNodeType(n.type)) html += wfExecInPin(n.id, n.type === "exec_gate" ? "Enter" : undefined);
  wfParamDefs(n).filter(p => p.wire).forEach(p => {
    html += wfDataInPin(n.id, p.name, p.type, p.name, n, wfIsParamWired(n.id, p.name));
  });
  wfDataOutputDefs(n).forEach(d => { html += wfDataOutPin(n.id, d.port, d.type, d.label); });
  (def.outputs || ["next"]).forEach(port => { html += wfExecOutPin(n.id, port); });
  return html;
}

function wfNodeBodyHtml(n) {
  return wfParamDefs(n).filter(p => !p.wire).map(p => {
    if (p.name === "code" || p.name === "content") {
      const val = ((n.params || {})[p.name] || "").toString().replace(/</g, "&lt;");
      return `<div style="padding:3px 6px;"><textarea data-node="${n.id}" data-param="${p.name}" style="width:100%;min-height:44px;font-size:11px;">${val}</textarea></div>`;
    }
    return wfIdentifierFieldHtml(n, p.name);
  }).join("");
}
// context menu -- built fresh from CURRENT_WF.variables each time the menu opens, never
// hardcoded, so a workflow's own variables become real placeable nodes.
// One "Get <name>"/"Set <name>" entry per declared workflow variable, for the node-search
// context menu -- built fresh from CURRENT_WF.variables each time the menu opens, never
// hardcoded, so a workflow's own variables become real placeable nodes.
function wfVariableMenuEntries() {
  const vars = CURRENT_WF.variables || [];
  if (!vars.length) {
    return [
      { type: "__get_var_create__", label: "Get Variable…", category: "variable", searchKeys: ["python", "get", "read", "variable"] },
      { type: "__set_var_create__", label: "Set Variable…", category: "variable", searchKeys: ["python", "set", "assign", "variable"] },
    ];
  }
  return vars.flatMap(v => ([
    { type: "get_var", label: `Get ${v.name}`, category: "variable", varName: v.name, searchKeys: ["python", "get", "read", "variable"] },
    { type: "set_var", label: `Set ${v.name}`, category: "variable", varName: v.name, searchKeys: ["python", "set", "assign", "variable"] },
  ]));
}

// Variables panel: name / type / default / delete per declared workflow variable, plus an
// "Add variable" button. Lives in its own card so it reads like the rest of the Studio's
// side-panel/toolbar cards (node-palette, the top wf-select/name/save bar).
function wfVariablesPanelHtml() {
  const vars = CURRENT_WF.variables || [];
  const rows = vars.map((v, i) => `
    <div class="wf-var-row" data-idx="${i}" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:6px 0; border-bottom:1px solid var(--border);">
      <input type="text" class="wf-var-name" data-idx="${i}" value="${(v.name || "").replace(/"/g, "&quot;")}" placeholder="name" style="width:100px;">
      <select class="wf-var-type" data-idx="${i}" style="width:80px;">
        ${WF_VARIABLE_TYPES.map(t => `<option value="${t}" ${t === v.type ? "selected" : ""}>${t}</option>`).join("")}
      </select>
      <input type="text" class="wf-var-default" data-idx="${i}" value="${(v.default || "").toString().replace(/"/g, "&quot;")}" placeholder="default" style="width:90px;">
      <span data-wf-live-var="${(v.name || "").replace(/"/g, "&quot;")}" style="font-size:10px;color:var(--accent);min-width:48px;" title="Live sim value">—</span>
      <button class="secondary wf-var-delete" data-idx="${i}" style="padding:1px 6px; font-size:11px;" title="Delete variable">x</button>
      <div class="wf-var-error" data-idx="${i}" style="flex-basis:100%; color:var(--status-critical); font-size:11px;"></div>
    </div>`).join("");
  const fn = wfFocusedFunction();
  let localsHtml = "";
  if (fn) {
    fn.locals = fn.locals || [];
    const lrows = fn.locals.map((v, i) => `
      <div class="wf-local-row" data-lidx="${i}" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:4px 0;">
        <input type="text" class="wf-local-name" data-lidx="${i}" value="${(v.name || "").replace(/"/g, "&quot;")}" placeholder="name" style="width:100px;">
        <select class="wf-local-type" data-lidx="${i}" style="width:80px;">
          ${WF_VARIABLE_TYPES.map(t => `<option value="${t}" ${t === v.type ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <input type="text" class="wf-local-default" data-lidx="${i}" value="${(v.default || "").toString().replace(/"/g, "&quot;")}" placeholder="default" style="width:90px;">
        <button class="secondary wf-local-delete" data-lidx="${i}" style="padding:1px 6px; font-size:11px;">x</button>
      </div>`).join("");
    localsHtml = `
      <div class="wf-locals-section">
        <strong style="font-size:11px; color:var(--ink-muted);">Local (${fn.name})</strong>
        ${lrows || `<div class="stub" style="font-size:11px;">No locals — add below.</div>`}
        <button class="secondary" id="wf-local-add" style="margin-top:6px; font-size:11px;">+ Add local</button>
      </div>`;
  }
  return `
    <div class="card" id="wf-variables-panel">
      <div id="wf-variables-toggle" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;">
        <strong style="font-size:12px;">Variables${vars.length ? ` (${vars.length})` : ""}</strong>
        <span style="font-size:11px; color:var(--ink-muted);">${WF_VARIABLES_COLLAPSED ? "Show ▾" : "Hide ▴"}</span>
      </div>
      <div id="wf-variables-body" style="${WF_VARIABLES_COLLAPSED ? "display:none;" : ""} margin-top:8px;">
        ${vars.length ? rows : wfEmptyStub("No variables yet", "Add one below, then place Get/Set nodes from the palette or canvas menu.")}
        ${vars.length ? `<div class="wf-var-chips" style="margin-top:8px;">${vars.map(v => wfVarChipHtml(v)).join("")}</div>` : ""}
        ${localsHtml}
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center;">
          <button class="secondary" id="wf-var-add">+ Add variable</button>
          <button class="secondary" id="wf-fn-add">+ Add function</button>
        </div>
        <div id="wf-var-create-form" style="display:none; margin-top:8px; gap:6px; flex-wrap:wrap; align-items:center;">
          <input type="text" id="wf-var-new-name" placeholder="name" style="width:100px;">
          <select id="wf-var-new-type" style="width:80px;">
            ${WF_VARIABLE_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
          <button class="primary" id="wf-var-new-submit" style="font-size:11px; padding:2px 8px;">Add</button>
          <button class="secondary" id="wf-var-new-cancel" style="font-size:11px; padding:2px 8px;">Cancel</button>
          <div id="wf-var-new-error" style="flex-basis:100%; color:var(--status-critical); font-size:11px;"></div>
        </div>
      </div>
    </div>`;
}

function wfFunctionsPanelHtml() {
  const fns = CURRENT_WF.functions || [];
  const rows = fns.map((f, i) => {
    const paramRows = (f.params || []).map((p, pi) => `
      <div style="display:flex; gap:4px; align-items:center; margin-left:12px; margin-top:4px;">
        <input type="text" class="wf-fn-param-name" data-idx="${i}" data-pidx="${pi}" value="${(p.name || "").replace(/"/g, "&quot;")}" placeholder="param" style="width:80px;">
        <select class="wf-fn-param-type" data-idx="${i}" data-pidx="${pi}" style="width:70px;">
          ${WF_PIN_TYPES.map(t => `<option value="${t}" ${t === p.type ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <button class="secondary wf-fn-param-delete" data-idx="${i}" data-pidx="${pi}" style="padding:1px 4px; font-size:10px;">x</button>
      </div>`).join("");
    return `
    <div class="wf-fn-row" data-idx="${i}" style="padding:6px 0; border-bottom:1px solid var(--border);">
      <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
        <input type="text" class="wf-fn-name" data-idx="${i}" value="${(f.name || "").replace(/"/g, "&quot;")}" placeholder="name" style="width:100px;">
        <label style="font-size:11px; color:var(--ink-muted);">returns</label>
        <select class="wf-fn-returns" data-idx="${i}" style="width:80px;">
          <option value="">none</option>
          ${WF_PIN_TYPES.map(t => `<option value="${t}" ${t === f.returns ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <button class="secondary wf-fn-param-add" data-idx="${i}" style="padding:1px 6px; font-size:11px;">+ param</button>
        <button class="secondary wf-fn-delete" data-idx="${i}" style="padding:1px 6px; font-size:11px;" title="Delete function">x</button>
      </div>
      ${paramRows}
      <div class="wf-fn-error" data-idx="${i}" style="color:var(--status-critical); font-size:11px;"></div>
    </div>`;
  }).join("");
  return `
    <div class="card" id="wf-functions-panel">
      <div id="wf-functions-toggle" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;">
        <strong style="font-size:12px;">Functions${fns.length ? ` (${fns.length})` : ""}</strong>
        <span style="font-size:11px; color:var(--ink-muted);">${WF_FUNCTIONS_COLLAPSED ? "Show ▾" : "Hide ▴"}</span>
      </div>
      <div id="wf-functions-body" style="${WF_FUNCTIONS_COLLAPSED ? "display:none;" : ""} margin-top:8px;">
        ${fns.length ? rows : wfEmptyStub("No functions yet", "Add one below, then use Call/Function nodes from the canvas menu.")}
        <button class="secondary" id="wf-fn-add-panel" style="margin-top:8px;">+ Add function</button>
      </div>
    </div>`;
}

async function renderAutomation() {
  WF_NODE_TYPES = await api("/api/workflows/node-types");
  WF_LIST = await api("/api/workflows");

  const meta = wfMeta();
  const zoomPct = Math.round(meta.zoom * 100);

  const commentBlocks = (CURRENT_WF.comments || []).map(c => {
    const color = c.color || WF_COMMENT_COLORS[0];
    const collapsed = !!c.collapsed;
    const h = collapsed ? 28 : (c.h || 140);
    const body = (c.body || c.text || "").trim();
    const bodyHtml = body
      ? `<div class="wf-comment-body">${escapeHtml(body)}</div>`
      : `<div class="wf-comment-body wf-comment-body-empty">Zone comment — double-click title to rename, click ▸ to expand/collapse</div>`;
    return `
    <div class="wf-comment${collapsed ? " wf-comment-collapsed" : ""}" data-comment-id="${c.id}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${h}px;background:color-mix(in srgb,${color} 28%,transparent);border:1px solid ${color};">
      <div class="wf-comment-title" data-comment-drag="${c.id}" style="background:${color};">
        <button type="button" class="wf-comment-toggle" data-comment-id="${c.id}" title="${collapsed ? "Expand" : "Collapse"}">${collapsed ? "▸" : "▾"}</button>
        <span class="wf-comment-title-text" data-comment-id="${c.id}">${escapeHtml(c.title || "Comment")}</span>
        <button type="button" class="wf-comment-color" data-comment-id="${c.id}" style="background:${color};" title="Change color"></button>
        <button type="button" class="secondary wf-comment-delete" data-comment-id="${c.id}" style="padding:0 4px;font-size:10px;">x</button>
      </div>
      ${collapsed ? "" : bodyHtml}
      ${collapsed ? "" : `<div class="wf-comment-resize" data-comment-resize="${c.id}"></div>`}
    </div>`;
  }).join("");

  const noteBlocks = (CURRENT_WF.notes || []).map(nt => `
    <div class="wf-note" data-note-id="${nt.id}" data-note-drag="${nt.id}" style="left:${nt.x}px;top:${nt.y}px;background:color-mix(in srgb,${nt.color || WF_NOTE_COLORS[0]} 55%,var(--bg-card));border:1px solid ${nt.color || WF_NOTE_COLORS[0]};">
      <span class="wf-note-text" data-note-id="${nt.id}" contenteditable="true">${(nt.text || "Note").replace(/</g, "&lt;")}</span>
      <button type="button" class="wf-note-color" data-note-id="${nt.id}" style="background:${nt.color || WF_NOTE_COLORS[0]};" title="Change color"></button>
      <button type="button" class="secondary wf-note-delete" data-note-id="${nt.id}" style="padding:0 3px;font-size:9px;line-height:1;">x</button>
    </div>`).join("");

  const nodeCards = CURRENT_WF.nodes.map(n => {
    const def = WF_NODE_TYPES[n.type] || { label: n.type, params: [], outputs: ["next"] };
    const headerLabel = wfNodeHeaderLabel(n);
    const vis = wfNodeVisual(n.type);
    const body = wfNodeBodyHtml(n);
    const canDelete = n.type !== "start";
    const brokenVar = (n.type === "get_var" || n.type === "set_var") && n.varName && !wfVarExists(n.varName);
    const brokenCls = brokenVar ? " wf-broken" : "";
    const disabledCls = wfIsNodeDisabled(n) ? " wf-disabled" : "";
    const bpCls = wfIsBreakpoint(n) ? " wf-breakpoint-set" : "";
    if (n.type === "reroute") {
      const rk = wfRerouteWireKind(n);
      const execCls = rk === "exec" ? " wf-reroute-exec" : "";
      const pinType = rk === "data" ? wfReroutePinType(n) : "exec";
      const borderStyle = rk === "data" ? `border-color:var(--type-${pinType},#888);` : "";
      return `<div class="wf-reroute${execCls}" data-node-id="${n.id}" data-drag-handle="${n.id}" data-reroute="1" style="left:${n.x}px;top:${n.y}px;${borderStyle}" title="Reroute (double-click wire to add)">${wfNodePinsHtml(n)}</div>`;
    }
    const pureCls = wfNodeIsCompact(n) ? " wf-pure" : "";
    const cat = def.category || "utility";
    const escLabel = escapeHtml(headerLabel);
    const codeLabel = WF_CODE_LABELS
      ? `<code class="wf-code-x-label" data-wf-code-label="${escapeHtml(n.type)}">${escapeHtml(wfNodeCodeLabel(n))}</code>`
      : "";
    const escInit = escapeHtml(wfNodeInitials(n));
    return `
      <div class="node-card type-${n.type}${brokenCls}${disabledCls}${bpCls}${pureCls}" data-node-id="${n.id}" data-category="${cat}" style="left:${n.x}px; top:${n.y}px;">
        ${wfBubbleHtml(n)}
        <div class="wf-block-lod" data-drag-handle="${n.id}" style="background:color-mix(in srgb, ${vis.color} 65%, var(--bg-card));">${escInit}</div>
        <div class="node-header" data-drag-handle="${n.id}" style="background:${vis.gradient};">
          ${n.type !== "start" ? `<button type="button" class="wf-bp-dot${wfIsBreakpoint(n) ? " wf-bp-on" : ""}" data-bp-node="${n.id}" title="Toggle breakpoint"></button>` : ""}
          <span class="wf-node-icon" aria-hidden="true">${escapeHtml(vis.icon)}</span>
          <span class="wf-node-title">${escLabel}${codeLabel}${brokenVar ? ' <span style="color:var(--status-critical);font-size:10px;">(missing var)</span>' : ""}</span>
          ${canDelete ? `<button class="secondary node-delete" data-node="${n.id}" style="padding:1px 6px; font-size:11px;">x</button>` : ""}
        </div>
        ${wfNodePinsHtml(n)}
        ${body ? `<div class="node-body">${body}</div>` : ""}
      </div>`;
  }).join("");

  const varList = (CURRENT_WF.variables || []).map(v => wfVarChipHtml(v)).join("")
    || wfEmptyStub("No variables", "Declare them in the Variables panel above.");

  const fnList = (CURRENT_WF.functions || []).map((f, i) => wfFnChipHtml(f, i)).join("")
    || wfEmptyStub("No functions", "Add user functions in the Functions panel above.");

  const questPalette = typeof blueprintQuestPaletteEntries === "function"
    ? blueprintQuestPaletteEntries()
    : null;
  const nodeFavList = (questPalette || WF_FAVORITE_NODES).map(n => wfNodeChipHtml(n)).join("");
  const questActive = typeof blueprintQuestIsActive === "function" && blueprintQuestIsActive();

  const workflowOptions = WF_LIST.map(w => `<option value="${w.id}" ${w.id === CURRENT_WF.id ? "selected" : ""}>${w.name}</option>`).join("");

  return `
    <style>
      .wf-world { position:absolute; top:0; left:0; width:4000px; height:3000px; background:transparent; backface-visibility:hidden; }
      #node-canvas { overflow:hidden !important; position:relative; min-height:0; height:auto; cursor:default; touch-action:none; isolation:isolate; contain:paint; background-color:var(--bg-shell) !important; background-clip:padding-box; }
      #node-canvas.wf-panning { cursor:grabbing !important; }
      #node-canvas.wf-space-ready { cursor:grab !important; }
      #node-canvas.wf-marquee-active { cursor:crosshair !important; }
      #node-canvas.wf-empty-hover { cursor:crosshair; }
      #node-canvas.wf-wiring { cursor:crosshair !important; }
      .wf-comment { position:absolute; z-index:0; border-radius:8px; box-sizing:border-box; pointer-events:none; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,.18); }
      .wf-comment-title, .wf-comment-resize, .wf-comment-body, .wf-comment-toggle { pointer-events:auto; }
      .wf-comment-title { display:flex; align-items:center; gap:6px; padding:5px 8px; font-size:11px; font-weight:700; color:#fff; cursor:move; user-select:none; min-height:28px; box-sizing:border-box; }
      .wf-comment-title-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wf-comment-toggle {
        flex:0 0 auto; width:18px; height:18px; padding:0; border:none; border-radius:4px;
        background:rgba(0,0,0,.18); color:#fff; cursor:pointer; font-size:11px; line-height:1;
      }
      .wf-comment-toggle:hover { background:rgba(0,0,0,.32); }
      .wf-comment-body {
        padding:8px 10px 14px; font-size:11px; line-height:1.45; color:var(--ink-primary);
        white-space:pre-wrap; overflow:auto; max-height:calc(100% - 28px);
        background:color-mix(in srgb, var(--bg-card) 55%, transparent);
      }
      .wf-comment-body-empty { color:var(--ink-muted); font-style:italic; }
      .wf-comment-collapsed { height:28px !important; }
      .wf-comment-color { width:12px; height:12px; border-radius:50%; border:1px solid rgba(255,255,255,.5); cursor:pointer; padding:0; flex-shrink:0; }
      .wf-comment-resize { position:absolute; right:2px; bottom:2px; width:12px; height:12px; cursor:se-resize; opacity:.6; }
      .node-card.wf-orphan, .wf-reroute.wf-orphan {
        opacity:.38; filter:grayscale(.55);
        outline:1px dashed color-mix(in srgb, var(--ink-muted) 55%, transparent);
        outline-offset:2px;
      }
      .wf-note { position:absolute; z-index:1; display:inline-flex; align-items:center; gap:4px; padding:3px 6px; border-radius:4px; font-size:11px; max-width:200px; cursor:grab; user-select:none; box-shadow:0 1px 3px rgba(0,0,0,.2); }
      .wf-note .wf-note-text { outline:none; min-width:24px; flex:1; word-break:break-word; cursor:text; user-select:text; }
      .wf-note-color { width:10px; height:10px; border-radius:50%; border:1px solid rgba(255,255,255,.4); cursor:pointer; padding:0; flex-shrink:0; }
      .wf-note.dragging { box-shadow:0 6px 18px rgba(0,0,0,.3); z-index:10; }
      .wf-reroute { width:16px; height:16px; z-index:3; cursor:grab; border-radius:50%; background:var(--bg-card-hover); border:2px solid var(--type-any,#888); box-sizing:border-box; }
      .wf-reroute.wf-reroute-exec { border-radius:3px; border-color:#e8e8e8; background:color-mix(in srgb,#fff 12%,var(--bg-card-hover)); }
      .wf-reroute.wf-selected { outline:2px solid var(--accent); outline-offset:2px; }
      .wf-reroute .wf-pin-row { margin:0; padding:0; }
      .wf-reroute .wf-pin-label, .wf-reroute .wf-pin-literal-wrap { display:none !important; }
      .wf-reroute .wf-pin-in { position:absolute; left:-5px; top:3px; }
      .wf-reroute .wf-pin-out { position:absolute; right:-5px; top:3px; }
      .node-card { cursor:default; }
      .node-header, [data-drag-handle], .wf-block-lod { cursor:grab; }
      .node-card, .wf-reroute { z-index:2; transition:box-shadow 0s, transform 0s; }
      .node-card:not(.dragging):hover, .wf-reroute:not(.dragging):hover {
        box-shadow:0 4px 14px rgba(0,0,0,.22);
        transform:translateY(-1px);
      }
      .node-card.wf-broken { outline:2px dashed var(--status-critical); outline-offset:1px; }
      .node-card.dragging, .wf-reroute.dragging { box-shadow:0 8px 24px rgba(0,0,0,.35); z-index:10; transform:none; }
      .wf-pin {
        --wf-pin-color: var(--ink-primary);
        transition:transform 0s, box-shadow 0s, background 0s, border-color 0s !important;
        position:relative; z-index:3;
        border:2px solid var(--wf-pin-color);
        background:var(--bg-shell);
      }
      .wf-pin::before {
        content:""; position:absolute; left:50%; top:50%; width:22px; height:22px;
        transform:translate(-50%,-50%); border-radius:50%; pointer-events:none;
      }
      .wf-pin:hover {
        transform:scale(1.28);
        box-shadow:0 0 7px 2px color-mix(in srgb, var(--wf-pin-color, var(--accent)) 50%, transparent);
        z-index:5;
        position:relative;
      }
      .wf-pin.wf-pin-connected {
        background:var(--wf-pin-color) !important;
        border-color:var(--wf-pin-color) !important;
        box-shadow:0 0 5px color-mix(in srgb, var(--wf-pin-color) 55%, transparent);
      }
      .wf-pin-row-data { gap:4px; }
      .wf-pin-literal-wrap { display:inline-flex; flex:1; min-width:0; align-items:center; gap:2px; }
      .wf-pin-literal-wrap.wf-literal-wired { display:none !important; }
      .wf-pin[data-pin-kind="exec"] {
        --wf-pin-color:#e8e8e8;
        border-radius:3px;
        border-color:#e8e8e8;
        background:var(--bg-shell);
      }
      .wf-pin[data-pin-kind="exec"].wf-pin-connected {
        background:#f5f5f5 !important;
        border-color:#fff !important;
        --wf-pin-color:#f5f5f5;
      }
      .wf-pin-out.port-true { --wf-pin-color:var(--status-good); border-color:var(--status-good); }
      .wf-pin-out.port-false { --wf-pin-color:var(--status-critical); border-color:var(--status-critical); }
      .wf-pin-out.port-loop { --wf-pin-color:var(--accent); border-color:var(--accent); }
      .wf-pin-out.port-done { --wf-pin-color:var(--status-warning); border-color:var(--status-warning); }
      .wf-pin[data-pin-kind="exec"]:hover {
        border-color:#fff;
        box-shadow:0 0 7px 2px color-mix(in srgb, #fff 45%, transparent);
      }
      .node-card.type-exec_gate .wf-pin[data-pin-kind="exec"] {
        border-radius:1px; transform:rotate(45deg); --wf-pin-color:var(--status-warning);
        border-color:var(--status-warning); background:color-mix(in srgb,var(--status-warning) 12%,var(--bg-shell));
      }
      .node-card.type-exec_gate .wf-pin[data-pin-kind="exec"]:hover { transform:rotate(45deg) scale(1.25); }
      .node-card.type-exec_gate .node-header { border-left-color:var(--status-warning) !important; }
      .wf-pin-out.port-pass { --wf-pin-color:var(--status-good) !important; border-color:var(--status-good) !important; }
      .wf-code-x-label {
        display:block; width:max-content; max-width:100%; margin-top:1px; padding:0 4px;
        border-radius:3px; color:var(--ink-muted); background:color-mix(in srgb,var(--bg-shell) 70%,transparent);
        font:9px/1.35 var(--font-mono, ui-monospace, monospace); overflow:hidden; text-overflow:ellipsis;
      }
      .node-card:not(.wf-pure) .node-header {
        padding: 5px 8px;
        font-size: 11px;
        font-weight: 600;
        border-left-width: 2px;
      }
      .node-card:not(.wf-pure) .node-body { padding: 5px 8px; gap: 4px; }
      .node-card .wf-pin-row {
        min-height: 16px;
        height: auto;
        padding: 1px 4px;
        align-items: center;
      }
      .node-card .wf-pin-row-data { min-height: 18px; }
      .wf-pin-label { font-size: 10px; line-height: 1.2; color: var(--ink-muted); }
      .node-card:not(.wf-pure) .node-header { border-left: 2px solid color-mix(in srgb,#fff 25%,var(--accent)); }
      .node-card.wf-pure .node-header {
        border-left: 2px solid color-mix(in srgb,var(--cat-math,#4a9e5c) 40%,transparent);
        font-weight: 500;
        background: color-mix(in srgb,var(--cat-math,#4a9e5c) 14%,var(--bg-card)) !important;
        padding: 3px 7px;
        font-size: 10px;
      }
      .node-card.wf-pure .wf-pin-row { padding: 0 5px; }
      .wf-empty-stub {
        font-size: 11px;
        color: var(--ink-muted);
        padding: 8px 6px;
        line-height: 1.45;
        border: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
        border-radius: 4px;
        background: color-mix(in srgb, var(--bg-shell) 50%, transparent);
      }
      .wf-empty-hint { font-size: 10px; margin-top: 4px; opacity: 0.85; }
      #node-svg { z-index:1; pointer-events:none; }
      #node-svg .wf-wire { pointer-events:stroke !important; }
      .wf-marquee { position:absolute; border:1px dashed var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); z-index:5; pointer-events:none; }
      #wf-zoom-label { cursor:pointer; text-decoration:underline dotted; }
      #wf-recenter-btn { padding:2px 8px; font-size:13px; line-height:1; min-width:28px; }
      .wf-view-nav { display:grid; grid-template:repeat(2,18px)/repeat(3,25px); gap:2px; align-items:center; }
      .wf-view-nav button { min-width:25px; width:25px; height:18px; padding:0 !important; font-size:9px !important; line-height:1; font-weight:700; }
      .wf-view-nav [data-wf-pan="north"] { grid-column:2; grid-row:1; }
      .wf-view-nav [data-wf-pan="west"] { grid-column:1; grid-row:2; }
      .wf-view-nav [data-wf-pan="south"] { grid-column:2; grid-row:2; }
      .wf-view-nav [data-wf-pan="east"] { grid-column:3; grid-row:2; }
      .wf-var-chip, .wf-fn-chip, .wf-node-chip { display:flex; align-items:center; gap:5px; padding:4px 8px; margin:3px 0; border-radius:12px; font-size:11px; background:var(--bg-card); border:1px solid var(--border); cursor:grab; user-select:none; }
      .wf-var-chip:active, .wf-fn-chip:active, .wf-node-chip:active { cursor:grabbing; }
      .wf-node-chip .wf-cat-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .wf-chip-grip { color:var(--ink-muted); font-size:9px; letter-spacing:-2px; opacity:.7; }
      .wf-chip-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .wf-chip-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wf-fn-edit { padding:0 4px; font-size:10px; border:none; background:transparent; cursor:pointer; color:var(--ink-muted); }
      .wf-fn-edit:hover { color:var(--accent); }
      .wf-chip-ghost { position:fixed; z-index:9999; pointer-events:none; opacity:.85; box-shadow:0 4px 12px rgba(0,0,0,.3); }
      .wf-pin-in.wf-pin-compatible { box-shadow:0 0 8px 2px color-mix(in srgb, var(--wf-pin-glow, var(--status-good)) 65%, transparent); }
      .wf-pin-in.wf-pin-incompatible { opacity:.35; box-shadow:0 0 6px 1px color-mix(in srgb, var(--status-critical) 50%, transparent); }
      .wf-pin-out.wf-pin-compatible { box-shadow:0 0 8px 2px color-mix(in srgb, var(--wf-pin-glow, var(--status-good)) 65%, transparent); }
      .wf-pin-out.wf-pin-incompatible { opacity:.35; box-shadow:0 0 6px 1px color-mix(in srgb, var(--status-critical) 50%, transparent); }
      .wf-pin.wf-pin-target {
        transform:scale(1.5) !important;
        z-index:7 !important;
        opacity:1 !important;
        outline:2px solid var(--accent);
        outline-offset:2px;
        box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent),
          0 0 16px 5px color-mix(in srgb, var(--wf-pin-glow, var(--status-good)) 85%, transparent) !important;
      }
      .wf-pin[data-pin-kind="exec"].wf-pin-target {
        box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent),
          0 0 14px 4px color-mix(in srgb, var(--accent) 75%, transparent) !important;
      }
      .wf-var-ghost-node { position:absolute; z-index:8; width:120px; padding:6px 8px; border-radius:6px; border:2px dashed var(--accent); background:color-mix(in srgb,var(--bg-card) 85%,transparent); pointer-events:none; opacity:.9; font-size:11px; }
      .wf-var-ghost-node.wf-var-ghost-set { border-color:var(--status-warning); }
      .wf-var-ghost-header { font-weight:600; }
      .wf-var-ghost-type { font-size:10px; margin-top:2px; }
      #node-svg .wf-wire.wf-wire-selected { stroke-width:4 !important; opacity:1 !important; filter:drop-shadow(0 0 4px var(--accent)); }
      .node-card.wf-diag-error { outline:2px solid var(--status-critical); outline-offset:1px; }
      @keyframes wf-shake-kf { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      .node-card.wf-shake, .wf-reroute.wf-shake { animation:wf-shake-kf .4s ease; }
      .wf-pin-tooltip { position:fixed; z-index:10001; padding:4px 8px; font-size:11px; background:var(--bg-card); border:1px solid var(--border); border-radius:4px; pointer-events:none; box-shadow:0 2px 8px rgba(0,0,0,.2); }
      .wf-align-toolbar { position:fixed; z-index:10000; display:flex; gap:2px; padding:3px; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; box-shadow:0 2px 10px rgba(0,0,0,.25); }
      .wf-align-toolbar button { padding:2px 6px !important; font-size:10px !important; min-width:24px; }
      .studio-tb-hint { font-size:10px; color:var(--ink-muted); padding:0 4px; white-space:nowrap; }
      .wf-craft-tick {
        position:fixed; z-index:10002; pointer-events:none; font-size:11px; font-variant-numeric:tabular-nums;
        color:var(--ink-secondary); background:color-mix(in srgb, var(--bg-card) 90%, transparent);
        padding:2px 7px; border-radius:4px; border:1px solid color-mix(in srgb, var(--gridline) 70%, transparent);
        opacity:0; transition:opacity 120ms ease; white-space:nowrap;
      }
      .wf-craft-tick--visible { opacity:1; }
      .wf-craft-tick--fade { opacity:0; }
      @media (prefers-reduced-motion: reduce) { .wf-craft-tick { transition:none; } }
      .wf-context-menu-list button.wf-menu-highlight { background:var(--bg-card-hover); outline:1px solid var(--accent); }
      #wf-minimap { position:absolute; right:8px; bottom:8px; width:160px; height:100px; z-index:20; border:1px solid var(--border); border-radius:4px; background:var(--bg-shell); box-shadow:0 2px 8px rgba(0,0,0,.2); cursor:crosshair; ${WF_MINIMAP_VISIBLE ? "" : "display:none;"} }
      #wf-minimap-canvas { width:160px; height:100px; display:block; }
      .node-card.wf-ref-highlight, .wf-reroute.wf-ref-highlight { outline:3px solid var(--status-warning); outline-offset:2px; animation:wf-pulse .6s ease 3; }
      @keyframes wf-pulse { 50% { outline-color: var(--accent); } }
      .node-card.wf-selected { outline:2px solid var(--accent); outline-offset:1px; }
      .node-card.wf-disabled { opacity:.45; filter:grayscale(.7); }
      .node-card.wf-pure { min-width:120px; }
      .node-card.wf-compile-error { outline:3px solid var(--status-critical) !important; animation:wf-pulse .5s ease 4; }
      #wf-code-output .wf-code-line-error { background:color-mix(in srgb,var(--status-critical) 18%,transparent); display:block; margin:0 -8px; padding:0 8px; }
      .wf-console-tabs { display:flex; gap:4px; margin-bottom:6px; }
      .wf-console-tab { padding:3px 10px; font-size:11px; border:1px solid var(--border); border-radius:4px; background:var(--bg-shell); cursor:pointer; }
      .wf-console-tab.wf-console-tab-active { background:var(--accent); color:#fff; border-color:var(--accent); }
      #wf-run-console { font-size:11px; max-height:200px; overflow:auto; margin:0; padding:8px; background:var(--bg-shell); border:1px solid var(--border); border-radius:4px; white-space:pre-wrap; font-family:ui-monospace,monospace; }
      #wf-run-console[hidden] { display:none !important; }
      #wf-code-output[hidden] { display:none !important; }
      .wf-studio-endpoint-disabled { opacity:.45; cursor:not-allowed; }
      .wf-bp-dot { width:8px; height:8px; border-radius:50%; border:1px solid var(--ink-muted); background:transparent; padding:0; flex-shrink:0; cursor:pointer; }
      .wf-bp-dot.wf-bp-on { background:var(--status-critical); border-color:var(--status-critical); }
      .node-card.wf-sim-paused { outline:3px solid var(--status-warning) !important; outline-offset:2px; box-shadow:0 0 12px color-mix(in srgb,var(--status-warning) 50%,transparent); }
      .node-card.wf-sim-ok { box-shadow:0 0 10px color-mix(in srgb,var(--status-good) 55%,transparent); }
      .node-card.wf-sim-error { box-shadow:0 0 10px color-mix(in srgb,var(--status-critical) 55%,transparent); }
      .node-card.wf-sim-skipped { opacity:.5; }
      .node-card.wf-sim-unsupported { outline:2px solid var(--status-warning); }
      @keyframes wf-node-fired-kf { 0% { outline-color:var(--accent); box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent); } 100% { outline-color:transparent; box-shadow:0 0 0 6px transparent; } }
      .node-card.wf-node-fired, .wf-reroute.wf-node-fired { outline:2px solid var(--accent); outline-offset:2px; animation:wf-node-fired-kf ${WF_NODE_FIRE_MS}ms ease-out 1; }
      @media (prefers-reduced-motion: reduce) { .node-card.wf-node-fired, .wf-reroute.wf-node-fired { animation:none; outline:2px solid var(--accent); outline-offset:2px; } }
      #node-svg .wf-wire.wf-sim-active-wire { stroke-width:4 !important; animation:wf-wire-pulse .6s ease infinite; }
      @keyframes wf-wire-pulse { 50% { opacity:.35; } }
      .wf-wire-label { font-size:10px; fill:var(--ink-muted); pointer-events:none; }
      .wf-watch-badge { font-size:9px; fill:var(--ink); pointer-events:all; cursor:pointer; }
      #wf-sim-console { font-size:11px; max-height:120px; overflow:auto; margin:0; padding:8px; background:var(--bg-shell); border:1px solid var(--border); border-radius:4px; white-space:pre-wrap; }
      .wf-locals-section { margin-top:10px; padding-top:8px; border-top:1px dashed var(--border); }
      .node-header { display:flex; align-items:center; gap:5px; }
      .wf-node-icon { font-size:12px; opacity:.9; flex-shrink:0; }
      .wf-node-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .node-card.compact-LOD .node-delete { display:none !important; }
      .node-card.compact-LOD .wf-pin-stub { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--ink-muted); margin:0 2px; }
      .node-card.block-LOD .node-header, .node-card.block-LOD .node-body, .node-card.block-LOD .wf-pin-row, .node-card.block-LOD .wf-node-bubble { display:none !important; }
      .node-card.block-LOD .wf-block-lod { display:flex !important; }
      .wf-block-lod { display:none; align-items:center; justify-content:center; min-height:36px; min-width:48px; border-radius:4px; font-weight:700; font-size:11px; color:#fff; }
      .node-card.wf-chain-dim, .wf-reroute.wf-chain-dim { opacity:0.2 !important; }
      .node-card.wf-chain-focus, .wf-reroute.wf-chain-focus { opacity:1 !important; z-index:4; }
      .wf-chain-toolbar { position:fixed; z-index:10001; display:flex; gap:3px; padding:3px; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; box-shadow:0 2px 10px rgba(0,0,0,.25); }
      .wf-chain-toolbar button { padding:2px 6px !important; font-size:10px !important; }
      .wf-graph-search-pill { position:static; z-index:25; display:flex; align-items:center; gap:6px; margin-left:auto; padding:4px 8px; background:var(--bg-card); border:1px solid var(--accent); border-radius:999px; box-shadow:0 2px 12px rgba(0,0,0,.2); }
      .wf-graph-search-pill[hidden] { display:none !important; pointer-events:none; }
      .wf-graph-search-pill input { border:none; background:transparent; font-size:12px; width:min(280px, 42vw); outline:none; }
      .wf-graph-search-count { font-size:10px; color:var(--ink-muted); min-width:32px; text-align:center; }
      .wf-blueprint-milestones { display:inline-flex; align-items:center; gap:4px; margin-left:6px; flex-shrink:0; }
      .wf-bp-milestone { font-size:9px; padding:2px 6px; border-radius:999px; border:1px solid var(--gridline); color:var(--ink-muted); white-space:nowrap; }
      .wf-bp-milestone--done { color:var(--status-good); border-color:color-mix(in srgb, var(--status-good) 45%, var(--gridline)); background:color-mix(in srgb, var(--status-good) 8%, transparent); }
      .wf-bookmark-rail { display:flex; gap:3px; margin-left:6px; }
      .wf-bookmark-slot { width:18px; height:18px; padding:0; font-size:9px; border-radius:3px; border:1px solid var(--border); background:var(--bg-shell); cursor:pointer; color:var(--ink-muted); }
      .wf-bookmark-slot.wf-bookmark-filled { background:color-mix(in srgb, var(--accent) 35%, var(--bg-shell)); border-color:var(--accent); color:var(--accent); font-weight:700; }
      .wf-fn-breadcrumb { display:flex; align-items:center; gap:4px; font-size:11px; padding:0 4px; }
      .wf-bc-seg { border:none; background:transparent; color:var(--accent); cursor:pointer; font-size:11px; padding:0; text-decoration:underline; }
      .wf-bc-sep, .wf-bc-current { color:var(--ink-muted); }
      .wf-node-bubble { position:absolute; left:0; right:0; bottom:100%; margin-bottom:4px; z-index:3; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:4px 8px; font-size:10px; box-shadow:0 2px 8px rgba(0,0,0,.15); cursor:pointer; max-width:220px; }
      .wf-node-bubble.wf-bubble-collapsed .wf-bubble-body { display:none; }
      .wf-node-bubble:not(.wf-bubble-collapsed) .wf-bubble-preview { display:none; }
      .wf-bubble-preview { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wf-bubble-body { white-space:pre-wrap; word-break:break-word; }
      @keyframes wf-search-pulse-kf { 50% { outline-color: var(--accent); box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 40%, transparent); } }
      .node-card.wf-search-pulse, .wf-reroute.wf-search-pulse { animation:wf-search-pulse-kf .55s ease 3; outline:2px solid var(--status-warning); outline-offset:2px; }
      .wf-smart-guides { position:absolute; inset:0; pointer-events:none; z-index:6; }
      .wf-guide { position:absolute; background:var(--accent); opacity:.75; }
      .wf-guide-v { top:0; bottom:0; width:1px; }
      .wf-guide-h { left:0; right:0; height:1px; }
      .wf-guide span { position:absolute; font-size:9px; color:var(--accent); background:var(--bg-card); padding:0 3px; white-space:nowrap; }
      .wf-guide-v span { left:4px; top:4px; }
      .wf-guide-h span { left:4px; top:-14px; }
      #wf-watches-panel { border-top:1px solid var(--border); padding:6px 10px; font-size:11px; max-height:140px; overflow:auto; }
      .wf-watch-row { display:flex; width:100%; gap:8px; align-items:center; padding:4px 6px; border:none; background:transparent; cursor:pointer; text-align:left; border-radius:4px; font-size:11px; }
      .wf-watch-row:hover { background:var(--bg-card-hover); }
      .wf-watch-label { flex:1; color:var(--ink-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wf-watch-val { font-family:ui-monospace,monospace; color:var(--ink); }
      .wf-watch-stale .wf-watch-val::after { content:" *"; color:var(--status-warning); }
      #wf-results-console { font-size:11px; max-height:200px; overflow:auto; margin:0; padding:0; }
      #wf-results-console[hidden] { display:none !important; }
      .wf-diag-row { display:flex; gap:8px; width:100%; padding:6px 8px; border:none; border-bottom:1px solid var(--border); background:transparent; cursor:pointer; text-align:left; font-size:11px; }
      .wf-diag-row:hover { background:var(--bg-card-hover); }
      .wf-diag-sev { font-weight:700; text-transform:uppercase; min-width:48px; }
      .wf-diag-error .wf-diag-sev { color:var(--status-critical); }
      .wf-diag-warning .wf-diag-sev { color:var(--status-warning); }
      .wf-diag-hint { color:var(--ink-muted); font-size:10px; margin-left:auto; }
      .wf-bp-shell { display:flex; gap:10px; align-items:stretch; height:min(72vh, 820px); min-height:420px; }
      .wf-bp-shell .node-palette { flex:0 0 168px; min-height:0; overflow-y:auto; padding:10px; }
      .wf-bp-main { flex:1; min-width:0; min-height:0; display:flex; gap:0; align-items:stretch; }
      .wf-bp-graph { position:relative; flex:1.35; min-width:0; min-height:0; height:100%; padding:0; overflow:hidden; display:flex; flex-direction:column; }
      .wf-bp-code { flex:1; min-width:0; padding:10px; display:none; flex-direction:column; border-left:1px solid var(--border); }
      .wf-bp-shell.wf-split-on .wf-bp-code { display:flex; }
      .wf-bp-shell:not(.wf-split-on) .wf-bp-code-fallback { display:block; }
      .wf-bp-shell.wf-split-on .wf-bp-code-fallback { display:none; }
      #node-canvas { flex:1 1 0; min-height:0; height:auto; }
      #wf-code-editor, #wf-code-output { flex:1; min-height:240px; max-height:none; margin:0; font-size:12px; }
      .wf-code-lang-toggle { display:flex; gap:4px; }
      .wf-lib-panel { margin-top:10px; padding:10px; border:1px solid var(--gridline); border-radius:8px; background:color-mix(in srgb, var(--accent) 4%, var(--bg-card)); }
    </style>
    <div class="card" style="padding:8px 10px;margin-bottom:8px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <select id="wf-select"><option value="">-- new workflow --</option>${workflowOptions}</select>
        <input type="text" id="wf-name" value="${CURRENT_WF.name.replace(/"/g, "&quot;")}" style="flex:1; min-width:160px;">
        <button class="secondary" id="wf-save">Save</button>
        <button class="secondary" id="wf-delete" ${CURRENT_WF.id ? "" : "disabled"}>Delete</button>
        <span class="stub" style="font-size:11px;margin-left:auto;">Ctrl+wheel zoom · wheel pan · Run plays in Preview</span>
      </div>
    </div>
    ${typeof blueprintQuestPanelHtml === "function" ? blueprintQuestPanelHtml() : ""}
    ${questActive ? "" : wfVariablesPanelHtml()}
    ${questActive ? "" : wfFunctionsPanelHtml()}
    <div class="wf-bp-shell${WF_SPLIT_VIEW ? " wf-split-on" : ""}" id="wf-bp-shell">
      <div class="card node-palette">
        <input type="text" id="wf-palette-search" placeholder="Search: print, len, list, gate, UI…" style="width:100%; margin-bottom:6px;">
        <button class="secondary" id="wf-palette-all-nodes" style="width:100%; margin-bottom:8px;">All nodes…</button>
        <strong style="font-size:10px; color:var(--ink-muted); letter-spacing:.06em; text-transform:uppercase;">${questActive ? "Quest palette" : "Nodes"}</strong>
        <div class="wf-node-chips" style="margin:4px 0 8px;">${nodeFavList}</div>
        ${questActive ? `<div class="stub" style="font-size:10px;">Only nodes known in this quest can be placed.</div>` : `
          <strong style="font-size:10px; color:var(--ink-muted); letter-spacing:.06em; text-transform:uppercase;">Vars</strong>
          <div style="margin:4px 0 8px;">${varList}</div>
          <strong style="font-size:10px; color:var(--ink-muted); letter-spacing:.06em; text-transform:uppercase;">Fns</strong>
          <div style="margin:4px 0 0;">${fnList}</div>`}
      </div>
      <div class="wf-bp-main">
        <div class="card wf-bp-graph">
          <div style="display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border);font-size:11px;flex-wrap:wrap;">
            <span id="wf-zoom-label" style="min-width:42px;color:var(--ink-muted);">${zoomPct}%</span>
            <button type="button" class="secondary" id="wf-recenter-btn" title="Recenter — frame all nodes">&#x2316;</button>
            <button class="secondary" id="wf-fit-view" style="padding:2px 8px;font-size:11px;" title="Frame all (F)">Frame</button>
            <div class="wf-view-nav" role="group" aria-label="Pan Blueprint">
              <button type="button" class="secondary" data-wf-pan="north" title="Pan north">N↑</button>
              <button type="button" class="secondary" data-wf-pan="west" title="Pan west">←W</button>
              <button type="button" class="secondary" data-wf-pan="south" title="Pan south">S↓</button>
              <button type="button" class="secondary" data-wf-pan="east" title="Pan east">E→</button>
            </div>
            ${wfBookmarkRailHtml()}
            <nav class="wf-fn-breadcrumb" id="wf-fn-breadcrumb" hidden aria-label="Function scope"></nav>
            ${wfGraphSearchPillHtml()}
          </div>
          <div class="node-canvas" id="node-canvas" tabindex="0">
            <div class="wf-world" id="wf-world">
              ${commentBlocks}
              ${noteBlocks}
              <svg id="node-svg" style="position:absolute; top:0; left:0; width:4000px; height:3000px; overflow:visible; pointer-events:none;"></svg>
              ${nodeCards}
            </div>
            <div id="wf-minimap" title="Minimap (M to toggle)"><canvas id="wf-minimap-canvas"></canvas></div>
          </div>
          <pre id="wf-sim-console" aria-label="Simulation console"></pre>
          <div id="wf-watches-panel" aria-label="Watches">
            <strong style="font-size:11px;">Watches</strong>
            <div id="wf-watches-list"></div>
          </div>
        </div>
        <div class="card wf-bp-code" id="wf-bp-code-pane">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
            <div class="wf-code-lang-toggle">
              <button type="button" class="secondary${WF_CODE_LANG === "python" ? " studio-tb-toggle-on" : ""}" id="wf-lang-python">Python</button>
            </div>
            <button class="secondary" id="wf-generate" style="padding:2px 8px;font-size:11px;">Generate Python</button>
            <button class="secondary" id="wf-copy-code" style="padding:2px 8px;font-size:11px;">Copy</button>
            <button class="secondary" id="wf-download-code" style="padding:2px 8px;font-size:11px;">Download</button>
            <span id="wf-compile-status" style="font-size:11px;color:var(--ink-muted);margin-left:auto;"></span>
          </div>
          <div class="wf-console-tabs">
            <button type="button" class="wf-console-tab wf-console-tab-active" data-wf-console-tab="code">Code</button>
            <button type="button" class="wf-console-tab" data-wf-console-tab="run">Console</button>
            <button type="button" class="wf-console-tab" data-wf-console-tab="results">Results</button>
          </div>
          <textarea id="wf-code-editor" class="approval-code" spellcheck="false" style="width:100%;box-sizing:border-box;resize:vertical;font-family:ui-monospace,monospace;"></textarea>
          <pre id="wf-code-output" class="approval-code" hidden></pre>
          <pre id="wf-run-console" hidden aria-label="Run console"></pre>
          <div id="wf-results-console" hidden aria-label="Compile results"></div>
        </div>
      </div>
    </div>
    <div class="card wf-bp-code-fallback" style="margin-top:10px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button class="secondary" id="wf-generate-fallback">Generate Python</button>
        <button class="secondary" id="wf-export-md" data-studio-action="export-md">Export .md</button>
        <button class="secondary" id="wf-import-md" data-studio-action="import-md">Import .md</button>
        <button class="secondary" id="wf-save-script">Save .py</button>
        <button class="secondary" id="wf-open-vscode">VS Code</button>
        <button class="secondary" id="wf-reimport-script">Re-import</button>
        <button class="secondary" id="wf-suggest-improvements">Improve</button>
        <button class="secondary" id="wf-explain-selection">Explain</button>
      </div>
      <div class="wf-console-tabs" style="margin-top:10px;">
        <button type="button" class="wf-console-tab wf-console-tab-active" data-wf-console-tab="code">Generated code</button>
        <button type="button" class="wf-console-tab" data-wf-console-tab="run">Console</button>
        <button type="button" class="wf-console-tab" data-wf-console-tab="results">Results</button>
      </div>
      <pre id="wf-code-output-fallback" class="approval-code" style="margin-top:0; max-height:260px;"></pre>
      <div id="wf-improvements-box" class="stub" style="margin-top:8px;"></div>
      <div id="wf-explain-box" class="stub" style="margin-top:8px;"></div>
    </div>
    <div id="wf-library-panel" class="card wf-lib-panel" hidden>
      <strong style="font-size:12px;">App shortcuts</strong>
      <p class="stub" style="margin:6px 0;">Jump to another area of Waypoint.</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <button type="button" class="secondary" data-wf-lib="Code">Code</button>
        <button type="button" class="secondary" data-wf-lib="Projects">Projects</button>
        <button type="button" class="secondary" data-wf-lib="Repository">Repository</button>
        <button type="button" class="secondary" data-wf-lib="Agent">Agent</button>
        <button type="button" class="secondary" data-wf-lib="Settings">Automations</button>
      </div>
    </div>`;
}

function wfClientToWorld(clientX, clientY) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return { x: 0, y: 0 };
  const cr = canvas.getBoundingClientRect();
  const m = wfMeta();
  return {
    x: (clientX - cr.left - m.panX) / m.zoom,
    y: (clientY - cr.top - m.panY) / m.zoom,
  };
}

function applyWfCanvasTransform(opts = {}) {
  const world = document.getElementById("wf-world");
  const canvas = document.getElementById("node-canvas");
  if (!world || !canvas) return;
  const m = wfMeta();
  // Skip hard clamp mid-pan so drag/scroll never "hits a wall" mid-gesture.
  if (opts.clamp !== false && !WF_PAN_ACTIVE) wfClampPan();
  world.style.transform = `translate(${m.panX}px, ${m.panY}px) scale(${m.zoom})`;
  world.style.transformOrigin = "0 0";
  const grid = 18 * m.zoom;
  canvas.style.backgroundSize = `${grid}px ${grid}px`;
  canvas.style.backgroundPosition = `${m.panX}px ${m.panY}px`;
  const lbl = document.getElementById("wf-zoom-label");
  if (lbl) lbl.textContent = `${Math.round(m.zoom * 100)}%`;
  wfUpdateLodClasses();
}

function wfContentBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y, w, h) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  };
  (CURRENT_WF.nodes || []).forEach(n => {
    const w = n.type === "reroute" ? 16 : 220;
    const h = n.type === "reroute" ? 16 : 80;
    add(n.x, n.y, w, h);
  });
  (CURRENT_WF.comments || []).forEach(c => add(c.x, c.y, c.w || 240, c.h || 140));
  (CURRENT_WF.notes || []).forEach(nt => add(nt.x, nt.y, 120, 28));
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  return { minX, minY, maxX, maxY };
}

function wfClampPan() {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  const b = wfContentBounds();
  const pad = 48;
  const margin = WF_SCROLL_PAD;
  // Soft bounds: keep some graph on-screen, but allow generous empty margin.
  const minPanX = cr.width - margin - (b.maxX + pad) * m.zoom;
  const maxPanX = margin - (b.minX - pad) * m.zoom;
  const minPanY = cr.height - margin - (b.maxY + pad) * m.zoom;
  const maxPanY = margin - (b.minY - pad) * m.zoom;
  // When the graph fits inside the viewport, leave pan free (Designer-like).
  if (minPanX > maxPanX && minPanY > maxPanY) return;
  if (minPanX <= maxPanX) m.panX = Math.min(maxPanX, Math.max(minPanX, m.panX));
  if (minPanY <= maxPanY) m.panY = Math.min(maxPanY, Math.max(minPanY, m.panY));
}

function wfApplyWheelPanZoom(e) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  // Never steal wheel from the node search / context menu list.
  if (e.target?.closest?.("#wf-context-menu, .wf-context-menu")) return;
  const m = wfMeta();
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const cr = canvas.getBoundingClientRect();
    const mx = e.clientX - cr.left;
    const my = e.clientY - cr.top;
    const wx = (mx - m.panX) / m.zoom;
    const wy = (my - m.panY) / m.zoom;
    // Cursor-anchored zoom with damped steps (less jumpy than raw trackpad).
    let dy = e.deltaY || 0;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= canvas.clientHeight;
    const factor = Math.exp(-dy * 0.00055);
    const next = Math.min(WF_ZOOM_MAX, Math.max(WF_ZOOM_MIN, m.zoom * factor));
    if (Math.abs(next - m.zoom) < 0.0005) return;
    m.zoom = next;
    m.panX = mx - wx * m.zoom;
    m.panY = my - wy * m.zoom;
    applyWfCanvasTransform();
    scheduleDrawWfConnectors();
    wfDrawMinimap();
    const zl = document.getElementById("wf-zoom-label");
    if (zl) zl.textContent = `${Math.round(m.zoom * 100)}%`;
    return;
  }
  // Trackpad / mouse wheel = pan the graph (Shift forces horizontal).
  e.preventDefault();
  let dx = -(e.deltaX || 0);
  let dy = -(e.deltaY || 0);
  if (e.shiftKey && Math.abs(e.deltaX || 0) < 0.5) {
    dx = -e.deltaY;
    dy = 0;
  }
  // Normalize line-mode wheels (deltaMode 1) to pixel-ish steps.
  if (e.deltaMode === 1) {
    dx *= 16;
    dy *= 16;
  } else if (e.deltaMode === 2) {
    dx *= canvas.clientWidth;
    dy *= canvas.clientHeight;
  }
  // Slight damping so pan feels less twitchy.
  m.panX += dx * 0.92;
  m.panY += dy * 0.92;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
  wfDrawMinimap();
}

function wfResetZoom() {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  const m = wfMeta();
  const cr = canvas.getBoundingClientRect();
  const cx = cr.width / 2;
  const cy = cr.height / 2;
  const wx = (cx - m.panX) / m.zoom;
  const wy = (cy - m.panY) / m.zoom;
  m.zoom = 1;
  m.panX = cx - wx;
  m.panY = cy - wy;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
}

function wfPanView(direction) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return;
  const m = wfMeta();
  const step = Math.max(72, Math.min(canvas.clientWidth, canvas.clientHeight) * 0.18);
  if (direction === "north") m.panY += step;
  else if (direction === "south") m.panY -= step;
  else if (direction === "west") m.panX += step;
  else if (direction === "east") m.panX -= step;
  applyWfCanvasTransform();
  scheduleDrawWfConnectors();
  wfDrawMinimap();
}

let WF_DRAW_RAF = null;
function scheduleDrawWfConnectors() {
  if (WF_DRAW_RAF) return;
  WF_DRAW_RAF = requestAnimationFrame(() => {
    WF_DRAW_RAF = null;
    drawWfConnectors();
  });
}

function wfGraphPayload() {
  return wfSanitizeGraphForEmit({
    nodes: CURRENT_WF.nodes,
    edges: CURRENT_WF.edges,
    variables: CURRENT_WF.variables,
    functions: CURRENT_WF.functions || [],
    comments: CURRENT_WF.comments || [],
    notes: CURRENT_WF.notes || [],
    ui: CURRENT_WF.ui || { widgets: [], device: "phone" },
    meta: wfMeta(),
  });
}

function wfPinCenter(nodeId, port, kind, direction) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas) return null;
  const k = kind || "exec";
  const dir = direction || (k === "exec" && port === "exec" ? "in" : "out");
  let sel;
  if (k === "exec" && dir === "in") {
    sel = `.wf-pin-in[data-pin-node="${nodeId}"][data-pin-kind="exec"]`;
  } else if (k === "exec") {
    sel = `.wf-pin-out[data-pin-node="${nodeId}"][data-pin-port="${port || "next"}"][data-pin-kind="exec"]`;
  } else if (dir === "in") {
    sel = `.wf-pin-in[data-pin-node="${nodeId}"][data-pin-port="${port}"][data-pin-kind="data"]`;
  } else {
    sel = `.wf-pin-out[data-pin-node="${nodeId}"][data-pin-port="${port}"][data-pin-kind="data"]`;
  }
  const pin = document.querySelector(sel);
  if (!pin) return null;
  const pr = pin.getBoundingClientRect();
  return wfClientToWorld(pr.left + pr.width / 2, pr.top + pr.height / 2);
}

function wireBezier(p1, p2) {
  // Horizontal wires: classic Blueprint side curves. Vertical-dominant: soft S-curves
  // so top→bottom tidy layouts look flowing instead of kinked.
  const adx = Math.abs(p2.x - p1.x);
  const ady = Math.abs(p2.y - p1.y);
  if (ady > adx * 1.05) {
    const dy = Math.min(180, Math.max(42, ady * 0.5));
    const pull = Math.min(64, Math.max(12, adx * 0.42 + 10));
    const dir = p2.x >= p1.x ? 1 : -1;
    return `M${p1.x},${p1.y} C${p1.x + dir * pull},${p1.y + dy} ${p2.x - dir * pull},${p2.y - dy} ${p2.x},${p2.y}`;
  }
  const dx = Math.min(220, Math.max(52, adx * 0.52));
  return `M${p1.x},${p1.y} C${p1.x + dx},${p1.y} ${p2.x - dx},${p2.y} ${p2.x},${p2.y}`;
}

function closeWfContextMenu() {
  const existing = document.getElementById("wf-context-menu");
  if (existing) existing.remove();
  document.removeEventListener("pointerdown", wfContextMenuOutsideClick, true);
  document.removeEventListener("mousedown", wfContextMenuOutsideClick, true);
  document.removeEventListener("keydown", wfContextMenuEscape, true);
}
function wfContextMenuOutsideClick(e) {
  const menu = document.getElementById("wf-context-menu");
  if (menu && !menu.contains(e.target)) closeWfContextMenu();
}
function wfContextMenuEscape(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeWfContextMenu();
  }
}

function showWfActionMenu(clientX, clientY, items, onPick) {
  closeWfContextMenu();
  const menu = document.createElement("div");
  menu.id = "wf-context-menu";
  menu.className = "wf-context-menu";
  const maxLeft = window.innerWidth - 200;
  const maxTop = window.innerHeight - 280;
  menu.style.left = Math.min(clientX, Math.max(0, maxLeft)) + "px";
  menu.style.top = Math.min(clientY, Math.max(0, maxTop)) + "px";
  const list = document.createElement("div");
  list.className = "wf-context-menu-list";
  items.forEach(item => {
    if (item.separator) {
      list.innerHTML += `<div style="height:1px;background:var(--border);margin:4px 0;"></div>`;
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.act = item.id;
    btn.textContent = item.label;
    btn.disabled = !!item.disabled;
    if (item.disabled) btn.style.opacity = "0.45";
    btn.onclick = () => {
      closeWfContextMenu();
      if (!item.disabled) onPick(item.id);
    };
    list.appendChild(btn);
  });
  menu.appendChild(list);
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener("pointerdown", wfContextMenuOutsideClick, true);
    document.addEventListener("keydown", wfContextMenuEscape, true);
  }, 180);
}

function wfGridSnapSize() {
  return wfMeta().gridSnap || WF_GRID_SNAP;
}

function wfSnapCoord(v) {
  if (!WF_SNAP_ENABLED) return Math.round(v);
  const snap = wfGridSnapSize();
  return Math.round(v / snap) * snap;
}

function wfNodeCanRename(n) {
  return n && (n.type === "ui_event"
    || ((n.type === "call_func" || n.type === "func_entry" || n.type === "func_return") && n.funcName));
}

function wfEditNode(n) {
  if (!n) return;
  if (n.type === "call_func" && n.funcName) {
    const fn = wfFuncByName(n.funcName);
    const idx = (CURRENT_WF.functions || []).indexOf(fn);
    if (idx >= 0) { wfFrameFunction(idx); return; }
  }
  const codeParam = wfParamDefs(n).find(p => !p.wire && (p.name === "code" || p.name === "content"));
  if (codeParam) { openWfCodeEditorModal(n.id, codeParam.name); return; }
  wfFocusNodePrimaryInput(n);
}

function wfRenameNode(n) {
  if (!n || !wfNodeCanRename(n)) return;
  if (n.type === "ui_event") {
    const t = window.prompt("Rename event label", n.label || "");
    if (t === null) return;
    wfPushUndo();
    n.label = t.trim() || n.label;
    renderAutomationStudioView();
    return;
  }
  const fn = wfFuncByName(n.funcName);
  if (!fn) return;
  const idx = (CURRENT_WF.functions || []).indexOf(fn);
  const t = window.prompt("Rename function", n.funcName);
  if (t === null || !t.trim()) return;
  const name = t.trim();
  if (!isValidWfVarName(name)) { window.alert("Not a valid function name."); return; }
  if (CURRENT_WF.functions.some((f, i) => i !== idx && f.name === name)) {
    window.alert("A function with this name already exists.");
    return;
  }
  wfPushUndo();
  const old = fn.name;
  fn.name = name;
  CURRENT_WF.nodes.forEach(nd => {
    if ((nd.type === "call_func" || nd.type === "func_entry" || nd.type === "func_return") && nd.funcName === old) {
      nd.funcName = name;
    }
  });
  renderAutomationStudioView();
}

function wfDuplicateNode(nodeId) {
  WF_SELECTED_NODES = new Set([nodeId]);
  wfDuplicateSelection();
}

function wfDeleteWire(edgeIdx) {
  if (edgeIdx == null || !CURRENT_WF.edges[edgeIdx]) return;
  wfPushUndo();
  CURRENT_WF.edges.splice(edgeIdx, 1);
  WF_SELECTED_EDGE = null;
  drawWfConnectors();
  wfUpdateLiteralVisibility();
  refreshWfPreview();
}

function wfPinEdgeIndexes(pinEl) {
  const pin = wfPinFromElement(pinEl);
  if (!pin) return [];
  const isIn = pinEl.classList.contains("wf-pin-in");
  return CURRENT_WF.edges.reduce((indexes, edge, index) => {
    const isData = edge.kind === "data";
    if ((pin.kind === "data") !== isData) return indexes;
    const matches = isIn
      ? (isData
        ? edge.to === pin.nodeId && edge.toPort === pin.port
        : edge.to === pin.nodeId)
      : (isData
        ? edge.from === pin.nodeId && edge.fromPort === pin.port
        : edge.from === pin.nodeId && (edge.fromPort || "next") === pin.port);
    if (matches) indexes.push(index);
    return indexes;
  }, []);
}

function wfBreakPinWires(pinEl) {
  const edgeIndexes = new Set(wfPinEdgeIndexes(pinEl));
  if (!edgeIndexes.size) return;
  wfPushUndo();
  CURRENT_WF.edges = CURRENT_WF.edges.filter((_, index) => !edgeIndexes.has(index));
  WF_SELECTED_EDGE = null;
  drawWfConnectors();
  wfUpdateLiteralVisibility();
  refreshWfPreview();
}

function wfShowPinContextMenu(e, pinEl) {
  e.preventDefault();
  e.stopPropagation();
  const pin = wfPinFromElement(pinEl);
  if (!pin) return;
  const edgeIndexes = wfPinEdgeIndexes(pinEl);
  const items = [
    { id: "break", label: "Break wires on this pin", disabled: !edgeIndexes.length },
  ];
  if (pin.kind === "data" && typeof wfPinWatchFromEdge === "function") {
    items.push({ id: "watch", label: "Watch value", disabled: !edgeIndexes.length });
  }
  items.push(
    { separator: true },
    { id: "cancel", label: "Cancel" },
  );
  showWfActionMenu(e.clientX, e.clientY, items, act => {
    if (act === "break") wfBreakPinWires(pinEl);
    else if (act === "watch" && edgeIndexes.length) wfPinWatchFromEdge(edgeIndexes[0]);
  });
}

function wfShowNodeContextMenu(e, nodeId) {
  const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
  if (!n) return;
  if (!WF_SELECTED_NODES.has(nodeId) || WF_SELECTED_NODES.size === 1) {
    WF_SELECTED_NODES = new Set([nodeId]);
  }
  WF_SELECTED_EDGE = null;
  document.querySelectorAll(".node-card, .wf-reroute").forEach(c => {
    c.classList.toggle("wf-selected", WF_SELECTED_NODES.has(c.dataset.nodeId));
  });
  drawWfConnectors();
  const items = [];
  if (n.type === "start") {
    // Start is protected — still show a menu so right-click isn't a silent no-op.
    items.push(
      { id: "edit", label: "Edit Start" },
      { id: "bubble", label: n.bubble?.text ? "Edit bubble comment" : "Add bubble comment" },
      { id: "bp", label: wfIsBreakpoint(n) ? "Remove breakpoint" : "Add breakpoint" },
      { separator: true },
      { id: "delete", label: "Delete (locked)", disabled: true },
    );
    showWfActionMenu(e.clientX, e.clientY, items, (act) => {
      if (act === "edit") wfEditNode(n);
      else if (act === "bubble") wfAddBubbleComment(nodeId);
      else if (act === "bp") wfToggleBreakpoint(nodeId);
    });
    return;
  }
  if (WF_SELECTED_NODES.size >= 2) {
    items.push(
      { id: "align-left", label: "Align left" },
      { id: "align-right", label: "Align right" },
      { id: "align-top", label: "Align top" },
      { id: "align-bottom", label: "Align bottom" },
      { id: "distribute-h", label: "Distribute horizontally" },
      { id: "distribute-v", label: "Distribute vertically" },
      { separator: true },
    );
  }
  items.push({ id: "edit", label: "Edit" });
  if (wfNodeCanRename(n)) items.push({ id: "rename", label: "Rename" });
  items.push(
    { id: "duplicate", label: "Duplicate" },
    { id: "bubble", label: n.bubble?.text ? "Edit bubble comment" : "Add bubble comment" },
    { id: "disable", label: wfIsNodeDisabled(n) ? "Enable" : "Disable" },
    { id: "bp", label: wfIsBreakpoint(n) ? "Remove breakpoint" : "Add breakpoint" },
    { separator: true },
    { id: "delete", label: "Delete" },
  );
  if (n.type === "call_func" && n.funcName) items.splice(items.length - 1, 0, { id: "open", label: "Open function" });
  if ((n.type === "get_var" || n.type === "set_var") && n.varName) {
    items.splice(items.length - 1, 0, { id: "refs", label: "Find variable references" });
  }
  showWfActionMenu(e.clientX, e.clientY, items, act => {
    if (act === "align-left") wfAlignSelection("left");
    else if (act === "align-right") wfAlignSelection("right");
    else if (act === "align-top") wfAlignSelection("top");
    else if (act === "align-bottom") wfAlignSelection("bottom");
    else if (act === "distribute-h") wfAlignSelection("distribute-h");
    else if (act === "distribute-v") wfAlignSelection("distribute-v");
    else if (act === "edit") wfEditNode(n);
    else if (act === "rename") wfRenameNode(n);
    else if (act === "duplicate") wfDuplicateNode(nodeId);
    else if (act === "bubble") wfAddBubbleComment(nodeId);
    else if (act === "disable") wfToggleNodeDisabled(nodeId);
    else if (act === "bp") wfToggleBreakpoint(nodeId);
    else if (act === "open") {
      const fn = wfFuncByName(n.funcName);
      const idx = (CURRENT_WF.functions || []).indexOf(fn);
      if (idx >= 0) wfFrameFunction(idx);
      else renderAutomationStudioView();
    } else if (act === "refs") wfHighlightVarRefs(n.varName);
    else if (act === "delete") { removeWfNode(nodeId); renderAutomationStudioView(); }
  });
}

function wfShowWireContextMenu(e, edgeIdx) {
  const edge = CURRENT_WF.edges[edgeIdx];
  if (!edge) return;
  WF_SELECTED_EDGE = edgeIdx;
  WF_SELECTED_NODES.clear();
  wfClearChainFocus();
  document.querySelectorAll(".node-card, .wf-reroute").forEach(c => c.classList.remove("wf-selected"));
  drawWfConnectors();
  const items = [
    { id: "reroute", label: "Insert reroute" },
    { id: "label", label: "Add label" },
    { id: "straighten", label: "Straighten wire" },
    { id: "pinwatch", label: "Pin to watches", disabled: edge.kind !== "data" },
    { id: "delete", label: "Delete wire" },
  ];
  showWfActionMenu(e.clientX, e.clientY, items, act => {
    if (act === "reroute") wfInsertRerouteOnEdge(edgeIdx);
    else if (act === "label") wfWireLabelPrompt(edgeIdx);
    else if (act === "straighten") {
      wfPushUndo();
      if (!edge.style) edge.style = {};
      edge.style.straighten = true;
      scheduleDrawWfConnectors();
    } else if (act === "pinwatch") wfPinWatchFromEdge(edgeIdx);
    else if (act === "delete") wfDeleteWire(edgeIdx);
  });
}

function showWfContextMenu(clientX, clientY, onPick, options) {
  closeWfContextMenu();
  options = options || {};
  const wireFrom = options.wireFrom || null;
  const wireTo = options.wireTo || null;
  // Wire→empty / research mode: show every node (hundreds) and let search filter.
  // Compatible matches stay pinned at the top under "Compatible".
  let showAll = !!(options.showAllNodes || options.fromWireDrop);
  const allEntries = wfContextMenuEntries();
  let recentEntries = wfGetRecentNodes().map(r => ({
    type: r.type, label: `★ ${r.label}`, category: "recent", varName: r.varName, funcName: r.funcName,
  }));
  if (typeof blueprintQuestFilterEntries === "function") {
    recentEntries = blueprintQuestFilterEntries(recentEntries);
  }
  const entryKey = (e) => `${e.type}\0${e.varName || ""}\0${e.funcName || ""}`;
  const isCompatible = (e) => {
    if (wireFrom) return wfNodeEntryCompatible(e, wireFrom);
    if (wireTo) return wfNodeEntryCompatibleToInput(e, wireTo);
    return true;
  };
  const getEntries = () => {
    if (!wireFrom && !wireTo) {
      return recentEntries.length ? recentEntries.concat(allEntries) : allEntries;
    }
    if (!showAll) {
      return allEntries.filter(isCompatible);
    }
    const compat = [];
    const rest = [];
    const seen = new Set();
    allEntries.forEach(e => {
      const key = entryKey(e);
      if (seen.has(key)) return;
      seen.add(key);
      if (isCompatible(e)) compat.push({ ...e, category: "compatible" });
      else rest.push(e);
    });
    return compat.concat(rest);
  };
  const menu = document.createElement("div");
  menu.id = "wf-context-menu";
  menu.className = "wf-context-menu";
  menu.innerHTML = `
    <input type="text" id="wf-context-search" placeholder="Search: print, len, list, gate, UI…" autofocus>
    ${(wireFrom || wireTo) && !showAll ? `<button type="button" id="wf-context-show-all" class="secondary" style="width:100%;margin-bottom:4px;font-size:11px;">Show all nodes</button>` : ""}
    ${(wireFrom || wireTo) && showAll ? `<div style="font-size:10px;color:var(--ink-muted);margin:0 0 6px;">Compatible first — scroll or search all nodes</div>` : ""}
    <div class="wf-context-menu-list" id="wf-context-list"></div>`;
  document.body.appendChild(menu);
  // Keep the tall menu inside the viewport.
  const menuW = menu.offsetWidth || 320;
  const menuH = Math.min(window.innerHeight * 0.8, 640);
  const left = Math.min(Math.max(8, clientX), Math.max(8, window.innerWidth - menuW - 8));
  const top = Math.min(Math.max(8, clientY), Math.max(8, window.innerHeight - menuH - 8));
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  // Wheel over the menu must scroll the list, not pan the blueprint canvas.
  menu.addEventListener("wheel", (e) => {
    e.stopPropagation();
    const list = document.getElementById("wf-context-list");
    if (!list) return;
    const atTop = list.scrollTop <= 0 && e.deltaY < 0;
    const atBot = list.scrollTop + list.clientHeight >= list.scrollHeight - 1 && e.deltaY > 0;
    if (!atTop && !atBot) e.preventDefault();
  }, { passive: false });

  let highlightedIdx = 0;
  const renderList = (filter) => {
    const list = document.getElementById("wf-context-list");
    if (!list) return;
    const f = filter.toLowerCase().trim();
    const entries = getEntries().filter(e => {
      if (!f) return true;
      const blob = [e.label, e.type, e.funcName, e.varName, ...(e.searchKeys || [])].join(" ").toLowerCase();
      return blob.includes(f);
    });
    const byCat = {};
    entries.forEach(e => {
      const cat = e.category || "utility";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(e);
    });
    const catOrder = ["compatible", "recent", "event", "flow", "function", "variable", "utility", "math", "string", "collection", "data", "datetime", "io", "network", "waypoint", "macro"];
    const cats = [...new Set([...catOrder, ...Object.keys(byCat)])].filter(c => byCat[c]?.length);
    const flatBtns = [];
    const catLabel = (cat) => {
      if (cat === "recent") return "Recent";
      if (cat === "compatible") return "Compatible with wire";
      return WF_CATEGORY_LABELS[cat] || cat;
    };
    list.innerHTML = cats.map(cat => {
      const btns = byCat[cat].map(e => {
        flatBtns.push(e);
        return `<button type="button" data-type="${e.type}" ${e.varName ? `data-var="${e.varName.replace(/"/g, "&quot;")}"` : ""} ${e.funcName ? `data-func="${e.funcName.replace(/"/g, "&quot;")}"` : ""}><span class="wf-cat-dot" style="background:var(--cat-${cat === "compatible" ? "flow" : cat}, var(--accent));"></span>${e.label}</button>`;
      }).join("");
      return `<div style="font-size:10px; font-weight:600; color:var(--ink-muted); padding:6px 8px 2px; text-transform:uppercase; letter-spacing:0.04em; position:sticky; top:0; background:var(--bg-card-hover); z-index:1;">${catLabel(cat)} <span style="font-weight:500;opacity:.7;">(${byCat[cat].length})</span></div>${btns}`;
    }).join("") || wfEmptyStub("No matching nodes", "Clear search or try another keyword (if, print, python…).");
    const buttons = list.querySelectorAll("button[data-type]");
    buttons.forEach((btn, i) => {
      btn.classList.toggle("wf-menu-highlight", i === highlightedIdx);
      btn.onclick = () => {
        closeWfContextMenu();
        onPick(btn.dataset.type, btn.dataset.var, btn.dataset.func, options.autoWireFrom || wireFrom, wireTo);
      };
    });
    if (highlightedIdx >= buttons.length) highlightedIdx = Math.max(0, buttons.length - 1);
    const hi = buttons[highlightedIdx];
    if (hi) hi.scrollIntoView({ block: "nearest" });
    menu._flatBtns = flatBtns;
    menu._buttons = buttons;
  };
  renderList("");

  const search = document.getElementById("wf-context-search");
  search.focus();
  search.select?.();
  search.oninput = () => { highlightedIdx = 0; renderList(search.value); };

  const showAllBtn = document.getElementById("wf-context-show-all");
  if (showAllBtn) {
    showAllBtn.onclick = () => {
      showAll = true;
      showAllBtn.remove();
      const hint = document.createElement("div");
      hint.style.cssText = "font-size:10px;color:var(--ink-muted);margin:0 0 6px;";
      hint.textContent = "Compatible first — scroll or search all nodes";
      search.insertAdjacentElement("afterend", hint);
      renderList(search.value);
    };
  }

  const pickHighlighted = (autoWire) => {
    const btn = menu._buttons?.[highlightedIdx];
    if (!btn) return;
    closeWfContextMenu();
    onPick(btn.dataset.type, btn.dataset.var, btn.dataset.func, autoWire ? (options.autoWireFrom || wireFrom) : wireFrom, wireTo);
  };

  menu.onkeydown = (e) => {
    const btns = menu._buttons || [];
    if (e.key === "ArrowDown") { e.preventDefault(); highlightedIdx = Math.min(highlightedIdx + 1, btns.length - 1); renderList(search.value); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlightedIdx = Math.max(highlightedIdx - 1, 0); renderList(search.value); }
    else if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); pickHighlighted(true); }
    else if (e.key === "Enter") { e.preventDefault(); pickHighlighted(false); }
  };

  // Wire drops fire pointerup just before the menu opens — wait longer before arming outside-dismiss.
  const armDelay = options.fromWireDrop ? 320 : 180;
  setTimeout(() => {
    document.addEventListener("pointerdown", wfContextMenuOutsideClick, true);
    document.addEventListener("keydown", wfContextMenuEscape, true);
  }, armDelay);
}

function drawWfConnectors() {
  const svg = document.getElementById("node-svg");
  if (!svg) return;
  let paths = "";
  const labels = [];
  CURRENT_WF.edges.forEach((edge, i) => {
    const isData = edge.kind === "data";
    const p1 = isData
      ? wfPinCenter(edge.from, edge.fromPort, "data", "out")
      : wfPinCenter(edge.from, edge.fromPort, "exec", "out");
    const p2 = isData
      ? wfPinCenter(edge.to, edge.toPort, "data", "in")
      : wfPinCenter(edge.to, "exec", "exec", "in");
    if (!p1 || !p2) return;
    let color;
    if (isData) {
      color = `var(--type-${edge.pinType || "any"}, #888)`;
    } else {
      color = edge.fromPort === "true" ? "var(--status-good)"
        : edge.fromPort === "false" ? "var(--status-critical)"
        : edge.fromPort === "loop" ? "var(--accent)"
        : edge.fromPort === "done" ? "var(--status-warning)"
        : edge.fromPort === "pass" ? "var(--status-good)"
        : "var(--accent)";
    }
    const mismatch = isData && edge.typeMismatch;
    const dash = mismatch ? ' stroke-dasharray="6 4"' : (isData ? "" : "");
    const title = mismatch ? ' title="&#9888; implicit cast"' : "";
    const activeCls = WF_SIM?.activeEdgeKey === wfEdgeKey(edge) ? " wf-sim-active-wire" : "";
    paths += `<path class="wf-wire${WF_SELECTED_EDGE === i ? " wf-wire-selected" : ""}${activeCls}" data-edge="${i}" d="${wfWirePath(p1, p2, edge)}" stroke="${color}" stroke-width="${isData ? 2 : 2.5}" fill="none" opacity="0.75"${dash}${title} style="pointer-events:stroke;"/>`;
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    if (edge.label) {
      labels.push(`<text class="wf-wire-label" x="${mx}" y="${my - 6}" text-anchor="middle">${edge.label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
    }
    if (isData && WF_WATCH_VALUES[wfEdgeKey(edge)] !== undefined) {
      const wv = wfTruncateWatch(WF_WATCH_VALUES[wfEdgeKey(edge)]);
      labels.push(`<text class="wf-watch-badge" data-watch-edge="${i}" x="${mx}" y="${my + 12}" text-anchor="middle">${wv.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
    }
  });
  svg.innerHTML = paths + labels.join("");

  svg.querySelectorAll(".wf-wire").forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(el.dataset.edge);
      WF_SELECTED_EDGE = WF_SELECTED_EDGE === idx ? null : idx;
      WF_SELECTED_NODES.clear();
      wfClearChainFocus();
      document.querySelectorAll(".node-card, .wf-reroute").forEach(c => c.classList.remove("wf-selected"));
      drawWfConnectors();
    };
    el.ondblclick = (e) => {
      e.stopPropagation();
      const idx = Number(el.dataset.edge);
      if (e.altKey) wfWireLabelPrompt(idx);
      else wfInsertRerouteOnEdge(idx);
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      wfShowWireContextMenu(e, Number(el.dataset.edge));
    };
  });
  svg.querySelectorAll(".wf-watch-badge").forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const idx = Number(el.dataset.watchEdge);
      const edge = CURRENT_WF.edges[idx];
      if (!edge) return;
      const val = WF_WATCH_VALUES[wfEdgeKey(edge)];
      window.alert(String(val));
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      wfClearWatchOnEdge(Number(el.dataset.watchEdge));
    };
  });
  wfUpdatePinConnectionState();
  wfDrawMinimap();
}

function wfUpdateLiteralVisibility() {
  document.querySelectorAll(".wf-pin-row-data").forEach(row => {
    const pin = row.querySelector(".wf-pin-in");
    if (!pin) return;
    const wired = wfIsParamWired(pin.dataset.pinNode, pin.dataset.pinPort);
    const wrap = row.querySelector(".wf-pin-literal-wrap");
    if (wrap) {
      wrap.classList.toggle("wf-literal-wired", wired);
      wrap.style.display = wired ? "none" : "";
    }
  });
}

function wfInsertRerouteOnEdge(edgeIdx) {
  const edge = CURRENT_WF.edges[edgeIdx];
  if (!edge) return;
  wfPushUndo();
  const isData = edge.kind === "data";
  const p1 = isData
    ? wfPinCenter(edge.from, edge.fromPort, "data", "out")
    : wfPinCenter(edge.from, edge.fromPort || "next", "exec", "out");
  const p2 = isData
    ? wfPinCenter(edge.to, edge.toPort, "data", "in")
    : wfPinCenter(edge.to, "exec", "exec", "in");
  if (!p1 || !p2) return;
  wfNodeCounter += 1;
  const id = `n${Date.now()}_${wfNodeCounter}`;
  const x = Math.round((p1.x + p2.x) / 2 - 8);
  const y = Math.round((p1.y + p2.y) / 2 - 8);
  const params = { wireKind: isData ? "data" : "exec" };
  if (isData) params.pinType = edge.pinType || "any";
  CURRENT_WF.nodes.push({ id, type: "reroute", x, y, params });
  if (isData) {
    const pinType = edge.pinType || "any";
    CURRENT_WF.edges.splice(edgeIdx, 1,
      { from: edge.from, fromPort: edge.fromPort, to: id, toPort: "in", kind: "data", pinType, typeMismatch: edge.typeMismatch },
      { from: id, fromPort: "out", to: edge.to, toPort: edge.toPort, kind: "data", pinType, typeMismatch: edge.typeMismatch },
    );
  } else {
    CURRENT_WF.edges.splice(edgeIdx, 1,
      { from: edge.from, fromPort: edge.fromPort || "next", to: id, kind: "exec" },
      { from: id, fromPort: "next", to: edge.to, kind: "exec" },
    );
  }
  renderAutomationStudioView();
}

let WF_PREVIEW_TIMER = null;

function openWfCodeEditorModal(nodeId, paramName) {
  const node = CURRENT_WF.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const overlay = document.createElement("div");
  overlay.className = "wf-code-modal-overlay";
  overlay.innerHTML = `
    <div class="wf-code-modal">
      <strong style="font-size:13px;">Edit Custom Python node source</strong>
      <textarea id="wf-code-modal-textarea" spellcheck="false">${(node.params[paramName] || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="secondary" id="wf-code-modal-cancel">Cancel</button>
        <button type="button" class="primary" id="wf-code-modal-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  document.getElementById("wf-code-modal-cancel").onclick = close;
  document.getElementById("wf-code-modal-save").onclick = () => {
    const value = document.getElementById("wf-code-modal-textarea").value;
    if (value !== (node.params[paramName] || "")) wfPushUndo();
    node.params[paramName] = value;
    const inlineTextarea = document.querySelector(`textarea[data-node="${nodeId}"][data-param="${paramName}"]`);
    if (inlineTextarea) inlineTextarea.value = value;
    refreshWfPreview();
    close();
  };
  document.getElementById("wf-code-modal-textarea").focus();
}

let WF_CONSOLE_TAB = "code";
const WF_ENDPOINT_OK = {};

async function wfEndpointOk(path, method = "GET") {
  const key = `${method}:${path}`;
  if (WF_ENDPOINT_OK[key] !== undefined) return WF_ENDPOINT_OK[key];
  try {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    WF_ENDPOINT_OK[key] = res.status !== 404;
    return WF_ENDPOINT_OK[key];
  } catch {
    WF_ENDPOINT_OK[key] = false;
    return false;
  }
}

function wfDisableIfMissing(btn, ok, tip) {
  if (!btn) return;
  if (ok) {
    btn.disabled = false;
    btn.classList.remove("wf-studio-endpoint-disabled");
    btn.hidden = false;
    btn.title = btn.dataset.origTitle || "";
  } else {
    btn.disabled = true;
    btn.classList.add("wf-studio-endpoint-disabled");
    if (!btn.dataset.origTitle) btn.dataset.origTitle = btn.title || "";
    btn.title = tip || "Endpoint not available yet";
  }
}

function wfTruthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes" || value === "on";
}

function wfIsStrongCloudModel(usage) {
  const model = String(usage?.model || "").toLowerCase();
  if (model.includes("opus") || model.includes("sonnet")) return true;
  const routing = usage?.routing || {};
  return Object.values(routing).some(r => {
    const m = String(r?.model || "").toLowerCase();
    return m.includes("opus") || m.includes("sonnet");
  });
}

function wfOfflineActive(usage, about) {
  return wfTruthy(usage?.offline_mode) || wfTruthy(about?.offline_mode);
}

function wfResolveVibecodeAllowed(usage, about) {
  if (usage && usage.vibecode_allowed != null) return wfTruthy(usage.vibecode_allowed);
  const enabled = wfTruthy(usage?.vibecode_enabled) || wfTruthy(about?.vibecode_enabled);
  if (!enabled) return false;
  if (wfOfflineActive(usage, about)) return false;
  if (!usage?.api_enabled) return false;
  return wfIsStrongCloudModel(usage);
}

function wfVibecodeBlockReason(usage, about, endpointOk) {
  if (!endpointOk) return "Vibecode endpoint not available on this backend build.";
  if (usage?.vibecode_block_reason) return usage.vibecode_block_reason;
  if (usage && usage.vibecode_allowed != null && !wfTruthy(usage.vibecode_allowed)) {
    return usage.vibecode_disabled_reason || "Vibecode is not allowed for the current model or settings.";
  }
  const enabled = wfTruthy(usage?.vibecode_enabled) || wfTruthy(about?.vibecode_enabled);
  if (!enabled) return "Vibecode is off in Settings — enable it there, or edit the graph manually.";
  if (wfOfflineActive(usage, about)) return "Offline mode blocks cloud AI — Vibecode needs a Claude-class cloud model.";
  if (!usage?.api_enabled) return "Cloud API kill switch is off — enable API in Settings to use Vibecode.";
  if (!wfIsStrongCloudModel(usage)) return "Vibecode needs a Claude-class model (Sonnet/Opus) — current route is too weak.";
  return "Vibecode unavailable.";
}

async function wfApplyEndpointGuards() {
  const wfId = CURRENT_WF.id;
  const [runOk, vibOk, impOk, mdExpOk, mdImpOk, appsOk, scriptOk, usage, about] = await Promise.all([
    wfEndpointOk(wfId ? `/api/workflows/${wfId}/run-python` : "/api/workflows/0/run-python", "POST"),
    wfEndpointOk("/api/workflows/vibecode", "POST"),
    wfEndpointOk("/api/workflows/import-python", "POST"),
    wfEndpointOk("/api/workflows/export-markdown", "POST"),
    wfEndpointOk("/api/workflows/import-markdown", "POST"),
    wfEndpointOk("/api/apps", "POST"),
    wfId ? wfEndpointOk(`/api/workflows/${wfId}/script-content`, "GET") : Promise.resolve(false),
    api("/api/usage").catch(() => ({})),
    api("/api/about").catch(() => ({})),
  ]);
  const vibAllowed = wfResolveVibecodeAllowed(usage, about);
  const vibReason = wfVibecodeBlockReason(usage, about, vibOk);
  const vibReady = vibOk && vibAllowed;
  wfDisableIfMissing(document.getElementById("wf-vibecode"), vibReady, vibReason);
  wfDisableIfMissing(document.getElementById("wf-import-python"), impOk, "Import endpoint not available");
  wfDisableIfMissing(document.getElementById("wf-export-md"), mdExpOk, "Export .md endpoint not available");
  wfDisableIfMissing(document.getElementById("wf-import-md"), mdImpOk, "Import .md endpoint not available");
  wfDisableIfMissing(document.getElementById("studio-tb-run-python"), runOk, "Run endpoint not available (backend deploying)");
  wfDisableIfMissing(document.getElementById("studio-tb-vibecode"), vibReady, vibReason);
  wfDisableIfMissing(document.getElementById("studio-tb-import"), impOk, "Import endpoint not available");
  wfDisableIfMissing(document.getElementById("studio-tb-export-md"), mdExpOk, "Export .md endpoint not available");
  wfDisableIfMissing(document.getElementById("studio-tb-import-md"), mdImpOk, "Import .md endpoint not available");
  wfDisableIfMissing(document.getElementById("studio-pin-app"), appsOk, "Publish-app endpoint not available");
  wfDisableIfMissing(document.getElementById("wf-reimport-script"), scriptOk && !!wfId, "Re-import needs saved workflow + script-content endpoint");
}

async function wfFetchGeneratedCode() {
  const result = await api("/api/workflows/preview", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph: wfGraphPayload() }),
  });
  if (WF_LAST_EMIT_GUARD && typeof showToast === "function") {
    showToast(`Safer emit: quoted ${WF_LAST_EMIT_GUARD} unsafe workflow value${WF_LAST_EMIT_GUARD === 1 ? "" : "s"}`, "warn");
  }
  return result.code || "";
}

function wfGetEditableCode() {
  const editor = document.getElementById("wf-code-editor");
  if (editor && !editor.hidden) return editor.value || "";
  const out = document.getElementById("wf-code-output");
  if (out && out.textContent) return out.textContent;
  const fallback = document.getElementById("wf-code-output-fallback");
  return fallback?.textContent || "";
}

function wfRenderCodeOutput(code, errorLine) {
  const editor = document.getElementById("wf-code-editor");
  if (editor) editor.value = code || "";
  const fallback = document.getElementById("wf-code-output-fallback");
  if (fallback) fallback.textContent = code || "";
  const out = document.getElementById("wf-code-output");
  if (!out) return;
  if (!errorLine) {
    out.textContent = code || "";
    return;
  }
  const lines = (code || "").split("\n");
  out.innerHTML = lines.map((ln, i) => {
    const n = i + 1;
    const esc = ln.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    if (n === errorLine) return `<span class="wf-code-line-error">${esc || " "}</span>`;
    return esc;
  }).join("\n");
  if (editor) editor.hidden = true;
  out.hidden = false;
}

function wfFlashNodeFromCode(code, errorLine) {
  if (!errorLine) return;
  const lines = code.split("\n");
  const ln = lines[errorLine - 1] || "";
  const m = ln.match(/# node:([^\s]+)/) || (errorLine > 1 ? (lines[errorLine - 2] || "").match(/# node:([^\s]+)/) : null);
  if (!m) return;
  const nodeId = m[1];
  const card = document.querySelector(`.node-card[data-node-id="${nodeId}"]`);
  if (!card) return;
  card.classList.add("wf-compile-error");
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  setTimeout(() => card.classList.remove("wf-compile-error"), 3000);
}

function wfSetConsoleTab(tab) {
  WF_CONSOLE_TAB = tab;
  const codeEl = document.getElementById("wf-code-output");
  const editor = document.getElementById("wf-code-editor");
  const runEl = document.getElementById("wf-run-console");
  const resEl = document.getElementById("wf-results-console");
  document.querySelectorAll("[data-wf-console-tab]").forEach(btn => {
    btn.classList.toggle("wf-console-tab-active", btn.dataset.wfConsoleTab === tab);
  });
  const showCode = tab === "code";
  if (editor) editor.hidden = !showCode;
  if (codeEl) codeEl.hidden = true; // editor is the live surface; keep pre for error highlighting only
  if (runEl) runEl.hidden = tab !== "run";
  if (resEl) resEl.hidden = tab !== "results";
  if (tab === "results") wfRefreshDiagnosticsPanel();
}

async function wfConvertToCpp() {
  await (async () => {
    if (!CURRENT_WF.id) {
      showToast("Save the workflow first", "warn");
      return;
    }
    try {
      const result = await api(`/api/workflows/${CURRENT_WF.id}/generate-cpp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: wfGraphPayload() }),
      });
      WF_CODE_LANG = "cpp";
      localStorage.setItem("wfCodeLang", "cpp");
      wfRenderCodeOutput(result.code || "");
      wfSetConsoleTab("code");
      document.getElementById("wf-lang-cpp")?.classList.add("studio-tb-toggle-on");
      document.getElementById("wf-lang-python")?.classList.remove("studio-tb-toggle-on");
      showToast("Converted to C++ (review TODOs)", "good");
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  })();
}

function wfToggleSplitView(force) {
  WF_SPLIT_VIEW = force != null ? !!force : !WF_SPLIT_VIEW;
  localStorage.setItem("wfSplitView", WF_SPLIT_VIEW ? "1" : "0");
  const shell = document.getElementById("wf-bp-shell");
  shell?.classList.toggle("wf-split-on", WF_SPLIT_VIEW);
  const tb = document.getElementById("studio-tb-split");
  if (tb) {
    tb.textContent = WF_SPLIT_VIEW ? "Hide code" : "Show code";
    tb.title = WF_SPLIT_VIEW ? "Hide the code pane" : "Show the code pane beside the Blueprint";
    tb.setAttribute("aria-pressed", String(WF_SPLIT_VIEW));
  }
  scheduleDrawWfConnectors();
}

function wfAppendRunConsole(text) {
  const el = document.getElementById("wf-run-console");
  if (!el) return;
  el.textContent = (el.textContent ? el.textContent + "\n" : "") + text;
  el.scrollTop = el.scrollHeight;
}

async function wfCompilePython() {
  const status = document.getElementById("wf-compile-status");
  if (status) status.textContent = "Compiling...";
  try {
    const code = await wfFetchGeneratedCode();
    wfRenderCodeOutput(code);
    wfSetConsoleTab("code");
    let check = { ok: true };
    if (CURRENT_WF.id && WF_ENDPOINT_OK[`POST:/api/workflows/${CURRENT_WF.id}/run-python`] !== false) {
      try {
        check = await api(`/api/workflows/${CURRENT_WF.id}/run-python`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ check_only: true, code }),
        });
      } catch (err) {
        if (status) status.textContent = errorMessage(err);
        return;
      }
    } else {
      if (status) status.textContent = "Save workflow to compile (needs run-python endpoint)";
      return;
    }
    if (check.ok) {
      if (status) { status.textContent = "Compile OK"; status.style.color = "var(--status-good)"; }
      wfUnlockBlueprintMilestone("compileOk", "FIRST COMPILE");
    } else {
      const line = check.line || check.error_line;
      if (status) { status.textContent = check.error || "Syntax error"; status.style.color = "var(--status-critical)"; }
      wfRenderCodeOutput(code, line);
      wfFlashNodeFromCode(code, line);
    }
    await wfRefreshDiagnosticsPanel(check);
  } catch (err) {
    if (status) status.textContent = errorMessage(err);
  }
}

async function wfRunGeneratedPython() {
  const generatePython = WF_CODE_LANG === "cpp";
  if (!window.confirm("This converts the graph to Python (if needed) and runs it on your machine. Continue?")) return;
  if (!CURRENT_WF.id) { showToast("Save the workflow first", "warn"); return; }
  let code = generatePython ? "" : wfGetEditableCode().trim();
  if (!code) {
    try {
      const result = await api(`/api/workflows/${CURRENT_WF.id}/generate`, { method: "POST" });
      code = result.code || "";
      wfRenderCodeOutput(code);
      WF_CODE_LANG = "python";
      localStorage.setItem("wfCodeLang", "python");
    } catch (err) {
      showToast(errorMessage(err), "warn");
      return;
    }
  }
  if (!code) { showToast("No Python to run — add nodes and Generate first", "warn"); return; }
  wfSetConsoleTab("run");
  const runEl = document.getElementById("wf-run-console");
  if (runEl) runEl.textContent = "Running...\n";
  try {
    const result = await api(`/api/workflows/${CURRENT_WF.id}/run-python`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (runEl) {
      runEl.textContent = "";
      if (result.stdout) wfAppendRunConsole(result.stdout);
      if (result.stderr) wfAppendRunConsole(result.stderr);
      if (!result.stdout && !result.stderr) wfAppendRunConsole(`Exit code: ${result.exit_code ?? 0}`);
      else wfAppendRunConsole(`--- exit ${result.exit_code ?? 0} ---`);
    }
    if ((result.exit_code ?? 0) === 0) wfUnlockBlueprintMilestone("runOk", "FIRST RUN");
    else showToast("Run failed — ask the AI companion about the conversion", "warn");
    await wfHydrateWatchesFromTrace();
  } catch (err) {
    if (runEl) runEl.textContent = errorMessage(err);
    showToast("Run error — companion can help fix the Python export", "warn");
  }
}

async function wfPlayBlueprintInPreview() {
  if (typeof uieEnsureUi !== "function" || typeof uiePlayBlueprintInPreview !== "function") {
    showToast("Preview runtime is unavailable", "warn");
    return;
  }
  if (typeof uieStopBlueprintPreview === "function") {
    uieStopBlueprintPreview({ silent: true });
  }
  const ui = uieEnsureUi();
  const hasWidgets = Array.isArray(ui.widgets) && ui.widgets.length > 0;
  STUDIO_TAB = "preview";
  await renderAutomationStudioView();
  uiePlayBlueprintInPreview();
  if (!hasWidgets) {
    uiePreviewToast("This Blueprint has no UI yet — add widgets in Designer. Start-node output still runs here.");
  }
}

function wfShowTextModal(title, placeholder, onSubmit) {
  const overlay = document.createElement("div");
  overlay.className = "wf-modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10002;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div class="card" style="width:min(520px,92vw);padding:14px;">
      <strong style="font-size:13px;">${title}</strong>
      <textarea id="wf-text-modal-area" placeholder="${placeholder}" style="width:100%;min-height:140px;margin:10px 0;font-size:12px;font-family:ui-monospace,monospace;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="secondary" id="wf-text-modal-cancel">Cancel</button>
        <button type="button" class="primary" id="wf-text-modal-ok">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  document.getElementById("wf-text-modal-cancel").onclick = close;
  document.getElementById("wf-text-modal-ok").onclick = async () => {
    const val = document.getElementById("wf-text-modal-area").value;
    await onSubmit(val);
    close();
  };
  document.getElementById("wf-text-modal-area").focus();
}

const WF_BP_MILESTONE_KEY = "blueprintMilestones";

function wfReadBlueprintMilestones() {
  try { return JSON.parse(localStorage.getItem(WF_BP_MILESTONE_KEY) || "{}"); } catch (_) { return {}; }
}

function wfSaveBlueprintMilestones(m) {
  try { localStorage.setItem(WF_BP_MILESTONE_KEY, JSON.stringify(m)); } catch (_) {}
}

function wfUnlockBlueprintMilestone(key, title) {
  const m = wfReadBlueprintMilestones();
  if (m[key]) return false;
  m[key] = true;
  wfSaveBlueprintMilestones(m);
  if (typeof window.momentOfTriumph === "function") {
    window.momentOfTriumph({ title, subtitle: "Blueprint Builder milestone unlocked", workspace: "build" });
  } else if (typeof showToast === "function") showToast(title, "good");
  wfRefreshBlueprintMilestonesStrip();
  return true;
}

function wfCheckBlueprintNodeMilestone() {
  const count = (CURRENT_WF?.nodes || []).length;
  if (count >= 10) wfUnlockBlueprintMilestone("nodes10", "GRAPH ARCHITECT");
}

function wfBlueprintMilestonesStripHtml() {
  const m = wfReadBlueprintMilestones();
  const chip = (key, label) =>
    `<span class="wf-bp-milestone${m[key] ? " wf-bp-milestone--done" : ""}" data-bp-mile="${key}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
  return `<div class="wf-blueprint-milestones" id="wf-blueprint-milestones" aria-label="Blueprint milestones">${chip("nodes10", "10+ nodes")}${chip("runOk", "Run")}</div>`;
}

function wfRefreshBlueprintMilestonesStrip() {
  const el = document.getElementById("wf-blueprint-milestones");
  if (!el) return;
  const m = wfReadBlueprintMilestones();
  el.querySelectorAll("[data-bp-mile]").forEach(chip => {
    chip.classList.toggle("wf-bp-milestone--done", !!m[chip.dataset.bpMile]);
  });
}

function wfGraphForVibecodePayload() {
  const { meta, ...graph } = wfGraphPayload();
  return graph;
}

function wfBuildVibecodeImproveDescription(instruction) {
  const graphJson = JSON.stringify(wfGraphForVibecodePayload());
  const text = (instruction || "").trim();
  return [
    "Here is my current workflow graph JSON:",
    graphJson,
    "",
    `Modify it according to this instruction: ${text}`,
    "",
    "Return the full modified graph with the same schema (nodes, edges, variables, functions, ui, comments).",
    "Preserve existing node ids where unchanged. Add, remove, or rewire nodes as needed.",
  ].join("\n");
}

function wfCountGraphChanges(before, after) {
  const nodeIds = (nodes) => new Set((nodes || []).map(n => n.id));
  const beforeNodeIds = nodeIds(before.nodes);
  const afterNodeIds = nodeIds(after.nodes);
  let count = 0;
  afterNodeIds.forEach(id => { if (!beforeNodeIds.has(id)) count += 1; });
  beforeNodeIds.forEach(id => { if (!afterNodeIds.has(id)) count += 1; });
  const beforeNodeMap = new Map((before.nodes || []).map(n => [n.id, JSON.stringify(n)]));
  (after.nodes || []).forEach(n => {
    if (beforeNodeMap.has(n.id) && beforeNodeMap.get(n.id) !== JSON.stringify(n)) count += 1;
  });
  const edgeSig = (e) => `${e.from}|${e.to}|${e.fromPort || ""}|${e.toPort || ""}|${e.kind || ""}|${e.label || ""}`;
  const beforeEdges = new Set((before.edges || []).map(edgeSig));
  const afterEdges = new Set((after.edges || []).map(edgeSig));
  afterEdges.forEach(sig => { if (!beforeEdges.has(sig)) count += 1; });
  beforeEdges.forEach(sig => { if (!afterEdges.has(sig)) count += 1; });
  const varSig = (v) => JSON.stringify(v);
  const beforeVars = new Set((before.variables || []).map(varSig));
  const afterVars = new Set((after.variables || []).map(varSig));
  afterVars.forEach(sig => { if (!beforeVars.has(sig)) count += 1; });
  beforeVars.forEach(sig => { if (!afterVars.has(sig)) count += 1; });
  return count;
}

function wfShowUndoToast(message, onUndo) {
  if (typeof initToastRoot === "function") initToastRoot();
  const root = document.getElementById("toast-root");
  if (!root) {
    showToast(message, "warn");
    return;
  }
  while (root.children.length >= 3) root.firstChild.remove();
  const toast = document.createElement("div");
  toast.style.cssText = "pointer-events:auto; padding:10px 14px; border-radius:8px; border:1px solid var(--status-warning); background:color-mix(in srgb, var(--status-warning) 14%, var(--bg-card)); color:var(--ink-primary); font-size:13px; line-height:1.4; box-shadow:0 4px 16px rgba(0,0,0,0.25); display:flex; align-items:center; gap:10px; max-width:min(420px, 90vw);";
  const msg = document.createElement("span");
  msg.style.flex = "1";
  msg.textContent = message;
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "secondary";
  undoBtn.textContent = "Undo";
  undoBtn.style.cssText = "font-size:11px; padding:2px 10px; flex-shrink:0;";
  const dismiss = () => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  };
  const timer = setTimeout(dismiss, 12000);
  undoBtn.onclick = (e) => {
    e.stopPropagation();
    clearTimeout(timer);
    onUndo();
    dismiss();
  };
  toast.appendChild(msg);
  toast.appendChild(undoBtn);
  root.appendChild(toast);
}

function wfShowImproveModal(onSubmit) {
  const examples = [
    "fix the broken wire logic",
    "add a branch that emails on completion",
    "optimize this",
  ];
  const overlay = document.createElement("div");
  overlay.className = "wf-modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10002;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = `
    <div class="card" style="width:min(520px,92vw);padding:14px;">
      <strong style="font-size:13px;">${escapeHtml("Continue / Fix (Vibecode)")}</strong>
      <p style="font-size:11px;color:var(--ink-muted);margin:8px 0 6px;">${escapeHtml("Describe what to change in the current graph:")}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        ${examples.map(ex => `<button type="button" class="secondary wf-improve-example" style="font-size:11px;">${escapeHtml(ex)}</button>`).join("")}
      </div>
      <textarea id="wf-improve-modal-area" placeholder="${escapeHtml("e.g. add a print node that says hello")}" style="width:100%;min-height:140px;margin:10px 0;font-size:12px;font-family:ui-monospace,monospace;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="secondary" id="wf-improve-modal-cancel">${escapeHtml("Cancel")}</button>
        <button type="button" class="primary" id="wf-improve-modal-ok">${escapeHtml("Apply")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  overlay.querySelectorAll(".wf-improve-example").forEach(btn => {
    btn.addEventListener("click", () => {
      const ta = document.getElementById("wf-improve-modal-area");
      if (ta) ta.value = btn.textContent || "";
      ta?.focus();
    });
  });
  document.getElementById("wf-improve-modal-cancel").onclick = close;
  document.getElementById("wf-improve-modal-ok").onclick = async () => {
    const val = document.getElementById("wf-improve-modal-area").value;
    const okBtn = document.getElementById("wf-improve-modal-ok");
    if (okBtn) { okBtn.disabled = true; okBtn.textContent = "Working…"; }
    try {
      await onSubmit(val);
      close();
    } catch (_) {
      if (okBtn) { okBtn.disabled = false; okBtn.textContent = "Apply"; }
    }
  };
  document.getElementById("wf-improve-modal-area").focus();
}

async function wfVibecodeImproveFlow() {
  const [usage, about] = await Promise.all([api("/api/usage").catch(() => ({})), api("/api/about").catch(() => ({}))]);
  if (!wfResolveVibecodeAllowed(usage, about)) {
    showToast(wfVibecodeBlockReason(usage, about, true), "warn");
    return;
  }
  wfShowImproveModal(async (instruction) => {
    if (!instruction.trim()) return;
    const snapshot = {
      id: CURRENT_WF.id,
      name: CURRENT_WF.name,
      graph: wfCloneGraph(),
    };
    const before = wfGraphPayload();
    try {
      const description = wfBuildVibecodeImproveDescription(instruction);
      const result = await api("/api/workflows/vibecode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (result.error) {
        showToast(result.error, "warn");
        return;
      }
      const g = result.graph || {};
      wfApplyGraph(g);
      wfClearSelectionState();
      const changeCount = wfCountGraphChanges(before, wfGraphPayload());
      renderAutomationStudioView();
      wfShowUndoToast(
        `Applied ${changeCount} change${changeCount === 1 ? "" : "s"} — review before saving`,
        () => {
          CURRENT_WF.id = snapshot.id;
          CURRENT_WF.name = snapshot.name;
          wfApplyGraph(snapshot.graph);
          wfClearSelectionState();
          renderAutomationStudioView();
          showToast("Reverted vibecode changes", "info");
        },
      );
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  });
}

async function wfVibecodeFlow() {
  const [usage, about] = await Promise.all([api("/api/usage").catch(() => ({})), api("/api/about").catch(() => ({}))]);
  if (!wfResolveVibecodeAllowed(usage, about)) {
    showToast(wfVibecodeBlockReason(usage, about, true), "warn");
    return;
  }
  wfShowTextModal("Vibecode — describe what to build", "e.g. A workflow that fetches tasks and prints each title", async (description) => {
    if (!description.trim()) return;
    try {
      const result = await api("/api/workflows/vibecode", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      const g = result.graph || {};
      CURRENT_WF = freshWorkflow();
      CURRENT_WF.name = result.name || "Vibecoded workflow";
      CURRENT_WF.nodes = g.nodes || [{ id: "start", type: "start", x: 30, y: 30, params: {} }];
      CURRENT_WF.edges = g.edges || [];
      CURRENT_WF.variables = g.variables || [];
      CURRENT_WF.functions = g.functions || [];
      CURRENT_WF.comments = g.comments || [];
      CURRENT_WF.notes = g.notes || [];
      if (g.ui) CURRENT_WF.ui = g.ui;
      wfClearSelectionState();
      showToast("Vibecode loaded — review before saving", "warn");
      renderAutomationStudioView();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  });
}

async function wfImportPythonFlow(prefill) {
  wfShowTextModal("Import Python → graph (best-effort)", "Paste or paste-upload Python code", async (code) => {
    if (!code.trim()) return;
    try {
      const result = await api("/api/workflows/import-python", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const g = result.graph || {};
      CURRENT_WF = freshWorkflow();
      CURRENT_WF.name = "Imported workflow";
      CURRENT_WF.nodes = g.nodes || [];
      CURRENT_WF.edges = g.edges || [];
      CURRENT_WF.variables = g.variables || [];
      CURRENT_WF.functions = g.functions || [];
      if (g.ui) CURRENT_WF.ui = g.ui;
      const unmapped = (result.unmapped || []).join(", ");
      showToast(unmapped ? `Imported (unmapped: ${unmapped})` : "Imported — review before saving", "warn");
      renderAutomationStudioView();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  });
  if (prefill) setTimeout(() => {
    const ta = document.getElementById("wf-text-modal-area");
    if (ta) ta.value = prefill;
  }, 50);
}

function wfApplyImportedGraph(g, name) {
  CURRENT_WF.nodes = g.nodes || [];
  CURRENT_WF.edges = g.edges || [];
  CURRENT_WF.variables = g.variables || [];
  CURRENT_WF.functions = g.functions || [];
  CURRENT_WF.comments = g.comments || [];
  CURRENT_WF.notes = g.notes || [];
  if (g.ui) CURRENT_WF.ui = g.ui;
  if (g.meta) CURRENT_WF.meta = g.meta;
  if (g.macros) CURRENT_WF.macros = g.macros;
  if (name) CURRENT_WF.name = name;
  WF_UNDO_STACK = [];
  WF_REDO_STACK = [];
}

async function wfExportMarkdownFlow() {
  try {
    const result = await api("/api/workflows/export-markdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph: wfGraphPayload(), name: CURRENT_WF.name }),
    });
    const md = result.markdown || "";
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(CURRENT_WF.name || "workflow").replace(/[^\w.-]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Markdown exported", "good");
  } catch (err) {
    showToast(errorMessage(err), "warn");
  }
}

async function wfImportMarkdownFlow(prefill) {
  wfShowTextModal("Import .md → graph", "Paste blueprint markdown (Waypoint export format)", async (md) => {
    if (!md.trim()) return;
    try {
      const result = await api("/api/workflows/import-markdown", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: md }),
      });
      const g = result.graph || {};
      const hasGraph = (CURRENT_WF.nodes || []).length > 1
        || (CURRENT_WF.edges || []).length
        || (CURRENT_WF.variables || []).length;
      if (hasGraph && !window.confirm("Replace current graph with imported markdown?")) return;
      wfApplyImportedGraph(g, result.name || "Imported workflow");
      showToast("Imported from markdown — review before saving", "warn");
      renderAutomationStudioView();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  });
  if (prefill) setTimeout(() => {
    const ta = document.getElementById("wf-text-modal-area");
    if (ta) ta.value = prefill;
  }, 50);
}

async function wfOpenInVsCode() {
  if (!CURRENT_WF.id) { showToast("Save the workflow first", "warn"); return; }
  await api(`/api/workflows/${CURRENT_WF.id}/generate`, { method: "POST" });
  const saved = await api(`/api/workflows/${CURRENT_WF.id}/save-script`, { method: "POST" });
  if (saved.error) { showToast(saved.error, "warn"); return; }
  const rel = (saved.path || "").replace(/\\/g, "/");
  const idx = rel.indexOf("/generated_scripts/");
  const relPath = idx >= 0 ? rel.slice(idx + 1) : `generated_scripts/${CURRENT_WF.name.replace(/[^\w.-]+/g, "_")}.py`;
  try {
    await api("/api/code/open-in-vscode", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relPath }),
    });
    showToast("Opened in VS Code", "good");
  } catch (err) {
    showToast(errorMessage(err), "warn");
  }
}

async function wfReimportFromFile() {
  if (!CURRENT_WF.id) { showToast("Save the workflow first", "warn"); return; }
  try {
    const result = await api(`/api/workflows/${CURRENT_WF.id}/script-content`);
    const code = result.content || result.code || "";
    if (!code.trim()) { showToast("No saved script content", "warn"); return; }
    showToast("Round-trip import is best-effort", "info");
    await wfImportPythonFlow(code);
  } catch (err) {
    showToast(errorMessage(err), "warn");
  }
}

const APP_PUBLISH_EMOJIS = ["📱", "⚡", "🎯", "📊", "🔧", "✨", "🚀", "💡", "📝", "🎨", "🏠", "⭐"];
const APP_PUBLISH_ACCENTS = ["#3987e5", "#e53935", "#43a047", "#fb8c00", "#8e24aa", "#00acc1"];

let CUSTOM_APP_VIEW = false;
let CUSTOM_APP_INFO = null;

async function wfLoadWorkflowById(id) {
  const wf = await api(`/api/workflows/${id}`);
  CURRENT_WF = {
    id: wf.id, name: wf.name,
    nodes: wf.graph.nodes || [], edges: wf.graph.edges || [],
    variables: wf.graph.variables || [], functions: wf.graph.functions || [],
    comments: wf.graph.comments || [],
    notes: wf.graph.notes || [],
    ui: wf.graph.ui || { widgets: [], device: "phone" },
    meta: wf.graph.meta || { zoom: 1, panX: 0, panY: 0 },
  };
  WF_UNDO_STACK = [];
  WF_REDO_STACK = [];
}

async function wfFindAppForWorkflow(wfId) {
  try {
    const apps = await api("/api/apps");
    if (!Array.isArray(apps)) return null;
    return apps.find(a => Number(a.workflow_id) === Number(wfId)) || null;
  } catch (_) {
    return null;
  }
}

async function wfSaveWorkflowQuiet() {
  if (!CURRENT_WF.ui) CURRENT_WF.ui = { widgets: [], device: "phone" };
  const body = { name: CURRENT_WF.name, graph: wfGraphPayload() };
  if (CURRENT_WF.id) {
    await api(`/api/workflows/${CURRENT_WF.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } else {
    const created = await api("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    CURRENT_WF.id = created.id;
  }
}

function wfPublishModalStyles() {
  return `<style>
    .wf-publish-overlay { position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px; }
    .wf-publish-modal { background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;max-width:380px;width:100%;font-size:12px; }
    .wf-publish-modal h3 { margin:0 0 12px;font-size:14px; }
    .wf-publish-row { margin:10px 0; }
    .wf-publish-row label { display:block;font-size:11px;color:var(--ink-muted);margin-bottom:4px; }
    .wf-publish-row input[type=text] { width:100%;font-size:12px; }
    .wf-publish-emoji-grid, .wf-publish-accent-grid { display:grid;grid-template-columns:repeat(6,1fr);gap:6px; }
    .wf-publish-emoji-btn, .wf-publish-accent-btn { padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg-shell);cursor:pointer;font-size:18px;line-height:1; }
    .wf-publish-emoji-btn.uie-picked, .wf-publish-accent-btn.uie-picked { outline:2px solid var(--accent);border-color:var(--accent); }
    .wf-publish-accent-btn { height:28px; }
    .wf-publish-actions { display:flex;gap:8px;margin-top:14px;flex-wrap:wrap; }
    .wf-publish-actions button { flex:1;min-width:80px; }
    .custom-app-shell { --custom-app-accent:#3987e5; }
    .custom-app-bar { display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-card); }
    .custom-app-title { font-weight:600;font-size:13px;flex:1; }
    .custom-app-bar button { font-size:11px;padding:4px 10px; }
  </style>`;
}

function wfOpenPublishModal() {
  document.getElementById("wf-publish-overlay")?.remove();
  const ui = CURRENT_WF.ui || {};
  const existingAppId = ui.publishedAppId || null;
  let pickedEmoji = ui.appEmoji || "⚡";
  let pickedAccent = ui.appAccent || APP_PUBLISH_ACCENTS[0];
  const overlay = document.createElement("div");
  overlay.id = "wf-publish-overlay";
  overlay.className = "wf-publish-overlay";
  overlay.innerHTML = `${wfPublishModalStyles()}
    <div class="wf-publish-modal" role="dialog" aria-label="Publish App">
      <h3>Publish App</h3>
      <div class="wf-publish-row">
        <label for="wf-publish-name">App name</label>
        <input type="text" id="wf-publish-name" value="${escapeHtml(CURRENT_WF.name || "My app")}">
      </div>
      <div class="wf-publish-row">
        <label>Emoji</label>
        <div class="wf-publish-emoji-grid" id="wf-publish-emoji-grid">
          ${APP_PUBLISH_EMOJIS.map(e => `<button type="button" class="wf-publish-emoji-btn${e === pickedEmoji ? " uie-picked" : ""}" data-emoji="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join("")}
        </div>
      </div>
      <div class="wf-publish-row">
        <label>Accent color</label>
        <div class="wf-publish-accent-grid" id="wf-publish-accent-grid">
          ${APP_PUBLISH_ACCENTS.map(c => `<button type="button" class="wf-publish-accent-btn${c === pickedAccent ? " uie-picked" : ""}" data-accent="${escapeHtml(c)}" style="background:${escapeHtml(c)};" title="${escapeHtml(c)}"></button>`).join("")}
        </div>
      </div>
      <div class="wf-publish-actions">
        <button type="button" class="primary" id="wf-publish-submit">Publish</button>
        ${existingAppId ? `<button type="button" class="secondary" id="wf-publish-unpublish" style="color:var(--status-critical);">Unpublish</button>` : ""}
        <button type="button" class="secondary" id="wf-publish-cancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  document.getElementById("wf-publish-cancel").onclick = close;
  overlay.querySelectorAll(".wf-publish-emoji-btn").forEach(btn => {
    btn.onclick = () => {
      pickedEmoji = btn.dataset.emoji;
      overlay.querySelectorAll(".wf-publish-emoji-btn").forEach(b => b.classList.toggle("uie-picked", b === btn));
    };
  });
  overlay.querySelectorAll(".wf-publish-accent-btn").forEach(btn => {
    btn.onclick = () => {
      pickedAccent = btn.dataset.accent;
      overlay.querySelectorAll(".wf-publish-accent-btn").forEach(b => b.classList.toggle("uie-picked", b === btn));
    };
  });
  document.getElementById("wf-publish-submit").onclick = async () => {
    const name = document.getElementById("wf-publish-name").value.trim();
    if (!name) { showToast("App name is required", "warn"); return; }
    try {
      if (!CURRENT_WF.id) await wfSaveWorkflowQuiet();
      if (!CURRENT_WF.id) { showToast("Save the workflow first", "warn"); return; }
      CURRENT_WF.ui = CURRENT_WF.ui || { widgets: [], device: "phone" };
      CURRENT_WF.ui.appAccent = pickedAccent;
      CURRENT_WF.ui.appEmoji = pickedEmoji;
      await wfSaveWorkflowQuiet();
      let appRec = null;
      try {
        appRec = await api("/api/apps", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, emoji: pickedEmoji, workflow_id: CURRENT_WF.id }),
        });
      } catch (err) {
        if (String(err).includes("404") || String(err).includes("Failed to fetch")) {
          showToast("Publish endpoint unavailable — settings saved locally", "warn");
        } else throw err;
      }
      if (appRec && appRec.id) CURRENT_WF.ui.publishedAppId = appRec.id;
      await wfSaveWorkflowQuiet();
      if (typeof refreshCustomApps === "function") refreshCustomApps();
      showToast(`Published “${name}”`, "good");
      close();
    } catch (err) {
      showToast(errorMessage(err), "warn");
    }
  };
  const unpublishBtn = document.getElementById("wf-publish-unpublish");
  if (unpublishBtn) {
    unpublishBtn.onclick = async () => {
      if (!window.confirm("Unpublish this app from the launcher?")) return;
      try {
        await api(`/api/apps/${existingAppId}`, { method: "DELETE" });
      } catch (err) {
        if (!String(err).includes("404")) { showToast(errorMessage(err), "warn"); return; }
      }
      if (CURRENT_WF.ui) delete CURRENT_WF.ui.publishedAppId;
      try { await wfSaveWorkflowQuiet(); } catch (_) { /* noop */ }
      if (typeof refreshCustomApps === "function") refreshCustomApps();
      showToast("App unpublished", "good");
      close();
    };
  }
  wfFindAppForWorkflow(CURRENT_WF.id).then(app => {
    if (!app || !app.id) return;
    CURRENT_WF.ui = CURRENT_WF.ui || { widgets: [], device: "phone" };
    CURRENT_WF.ui.publishedAppId = app.id;
    if (!CURRENT_WF.ui.appEmoji && app.emoji) CURRENT_WF.ui.appEmoji = app.emoji;
    if (!document.getElementById("wf-publish-unpublish")) {
      const actions = overlay.querySelector(".wf-publish-actions");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";
      btn.id = "wf-publish-unpublish";
      btn.style.color = "var(--status-critical)";
      btn.textContent = "Unpublish";
      btn.onclick = async () => {
        if (!window.confirm("Unpublish this app from the launcher?")) return;
        try { await api(`/api/apps/${app.id}`, { method: "DELETE" }); } catch (err) {
          if (!String(err).includes("404")) { showToast(errorMessage(err), "warn"); return; }
        }
        delete CURRENT_WF.ui.publishedAppId;
        try { await wfSaveWorkflowQuiet(); } catch (_) { /* noop */ }
        if (typeof refreshCustomApps === "function") refreshCustomApps();
        showToast("App unpublished", "good");
        close();
      };
      actions.insertBefore(btn, document.getElementById("wf-publish-cancel"));
    }
  }).catch(() => { /* endpoint may not exist yet */ });
}

function refreshWfPreview() {
  const out = document.getElementById("wf-code-output");
  if (!out) return;
  clearTimeout(WF_PREVIEW_TIMER);
  WF_PREVIEW_TIMER = setTimeout(async () => {
    try {
      const result = await api("/api/workflows/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: wfGraphPayload() }),
      });
      if (WF_CODE_LANG === "python") wfRenderCodeOutput(result.code || "");
      else out.textContent = result.code || "";
      if (result.error) {
        showToast(result.error, "error");
      }
    } catch (err) {
      out.textContent = `# Preview failed: ${errorMessage(err)}`;
    }
    wfApplyDiagnostics();
  }, 250);
  wfApplyEndpointGuards();
}

// Wires up the Variables panel built by wfVariablesPanelHtml(). Edits mutate CURRENT_WF.variables
// in place and refresh the live code preview, same pattern as node param inputs just above --
// actual persistence to the DB still goes through the existing "Save workflow" button/ensureSaved(),
// no separate save path for variables.
function wireWfVariablesPanel() {
  const toggle = document.getElementById("wf-variables-toggle");
  if (toggle) {
    toggle.onclick = () => { WF_VARIABLES_COLLAPSED = !WF_VARIABLES_COLLAPSED; renderAutomationStudioView(); };
  }

  const setVarError = (idx, msg) => {
    const el = document.querySelector(`.wf-var-error[data-idx="${idx}"]`);
    if (el) el.textContent = msg || "";
  };

  document.querySelectorAll(".wf-var-name").forEach(inp => {
    inp.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const name = e.target.value.trim();
      if (!isValidWfVarName(name)) {
        setVarError(idx, "Not a valid variable name (must be a Python identifier, not a keyword).");
        return;
      }
      if (CURRENT_WF.variables.some((v, i) => i !== idx && v.name === name)) {
        setVarError(idx, "A variable with this name already exists.");
        return;
      }
      setVarError(idx, "");
      const oldName = CURRENT_WF.variables[idx].name;
      if (oldName !== name) wfPushUndo();
      CURRENT_WF.variables[idx].name = name;
      if (oldName !== name) {
        CURRENT_WF.nodes.forEach(n => {
          if ((n.type === "get_var" || n.type === "set_var") && n.varName === oldName) n.varName = name;
        });
        renderAutomationStudioView();
      } else {
        refreshWfPreview();
      }
    };
  });

  document.querySelectorAll(".wf-var-type").forEach(sel => {
    sel.onchange = (e) => {
      wfPushUndo();
      CURRENT_WF.variables[Number(e.target.dataset.idx)].type = e.target.value;
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-var-default").forEach(inp => {
    inp.onchange = (e) => {
      CURRENT_WF.variables[Number(e.target.dataset.idx)].default = e.target.value;
      refreshWfPreview();
    };
  });

  document.querySelectorAll(".wf-var-delete").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      const v = CURRENT_WF.variables[idx];
      if (!v) return;
      const refs = wfVarNodeRefs(v.name);
      if (refs.length) {
        setVarError(idx, `Cannot delete: ${refs.length} Get/Set node(s) still reference "${v.name}". Remove or rewire them first.`);
        return;
      }
      wfPushUndo();
      CURRENT_WF.variables.splice(idx, 1);
      renderAutomationStudioView();
    };
  });

  const addBtn = document.getElementById("wf-var-add");
  const createForm = document.getElementById("wf-var-create-form");
  const newName = document.getElementById("wf-var-new-name");
  const newType = document.getElementById("wf-var-new-type");
  const newErr = document.getElementById("wf-var-new-error");
  const submitCreate = () => {
    const name = (newName?.value || "").trim();
    const type = newType?.value || "string";
    if (!isValidWfVarName(name)) {
      if (newErr) newErr.textContent = "Not a valid variable name (Python identifier, not a keyword).";
      return;
    }
    if (CURRENT_WF.variables.some(v => v.name === name)) {
      if (newErr) newErr.textContent = "A variable with this name already exists.";
      return;
    }
    if (newErr) newErr.textContent = "";
    wfPushUndo();
    CURRENT_WF.variables = CURRENT_WF.variables || [];
    CURRENT_WF.variables.push({ name, type, default: "" });
    WF_VARIABLES_COLLAPSED = false;
    renderAutomationStudioView();
  };
  if (addBtn && createForm) {
    addBtn.onclick = () => {
      createForm.style.display = "flex";
      WF_VARIABLES_COLLAPSED = false;
      if (newName) {
        const existing = new Set((CURRENT_WF.variables || []).map(v => v.name));
        let n = 1, name = "var1";
        while (existing.has(name)) { n += 1; name = `var${n}`; }
        newName.value = name;
        newName.focus();
        newName.select();
      }
      if (newErr) newErr.textContent = "";
    };
  }
  const cancelCreate = document.getElementById("wf-var-new-cancel");
  if (cancelCreate && createForm) {
    cancelCreate.onclick = () => { createForm.style.display = "none"; if (newErr) newErr.textContent = ""; };
  }
  const submitBtn = document.getElementById("wf-var-new-submit");
  if (submitBtn) submitBtn.onclick = submitCreate;
  if (newName) {
    newName.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitCreate(); }
      else if (e.key === "Escape" && createForm) { createForm.style.display = "none"; }
    };
  }

  const localAdd = document.getElementById("wf-local-add");
  if (localAdd) {
    localAdd.onclick = () => {
      const fn = wfFocusedFunction();
      if (!fn) return;
      wfPushUndo();
      fn.locals = fn.locals || [];
      const existing = new Set(fn.locals.map(l => l.name));
      let n = 1, name = "local1";
      while (existing.has(name)) { n += 1; name = `local${n}`; }
      fn.locals.push({ name, type: "string", default: "" });
      renderAutomationStudioView();
    };
  }
  document.querySelectorAll(".wf-local-name").forEach(inp => {
    inp.onchange = () => {
      const fn = wfFocusedFunction();
      if (!fn) return;
      const i = Number(inp.dataset.lidx);
      fn.locals[i].name = inp.value.trim();
      refreshWfPreview();
    };
  });
  document.querySelectorAll(".wf-local-type").forEach(sel => {
    sel.onchange = () => {
      const fn = wfFocusedFunction();
      if (!fn) return;
      fn.locals[Number(sel.dataset.lidx)].type = sel.value;
    };
  });
  document.querySelectorAll(".wf-local-default").forEach(inp => {
    inp.onchange = () => {
      const fn = wfFocusedFunction();
      if (!fn) return;
      fn.locals[Number(inp.dataset.lidx)].default = inp.value;
    };
  });
  document.querySelectorAll(".wf-local-delete").forEach(btn => {
    btn.onclick = () => {
      const fn = wfFocusedFunction();
      if (!fn) return;
      wfPushUndo();
      fn.locals.splice(Number(btn.dataset.lidx), 1);
      renderAutomationStudioView();
    };
  });

  const fnAddHandler = () => {
    wfPushUndo();
    CURRENT_WF.functions = CURRENT_WF.functions || [];
    const existing = new Set(CURRENT_WF.functions.map(f => f.name));
    let n = 1, name = "func1";
    while (existing.has(name)) { n += 1; name = `func${n}`; }
    CURRENT_WF.functions.push({ name, params: [], returns: null });
    const fnIdx = CURRENT_WF.functions.length - 1;
    wfSetupFunctionGraph(name, fnIdx);
    WF_FUNCTIONS_COLLAPSED = false;
    renderAutomationStudioView();
  };
  document.querySelectorAll("#wf-fn-add, #wf-fn-add-panel").forEach(btn => {
    btn.onclick = fnAddHandler;
  });
}

function wireWfFunctionsPanel() {
  const toggle = document.getElementById("wf-functions-toggle");
  if (toggle) {
    toggle.onclick = () => { WF_FUNCTIONS_COLLAPSED = !WF_FUNCTIONS_COLLAPSED; renderAutomationStudioView(); };
  }

  const setFnError = (idx, msg) => {
    const el = document.querySelector(`.wf-fn-error[data-idx="${idx}"]`);
    if (el) el.textContent = msg || "";
  };

  document.querySelectorAll(".wf-fn-name").forEach(inp => {
    inp.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const name = e.target.value.trim();
      if (!isValidWfVarName(name)) {
        setFnError(idx, "Not a valid function name (Python identifier, not a keyword).");
        return;
      }
      if (CURRENT_WF.functions.some((f, i) => i !== idx && f.name === name)) {
        setFnError(idx, "A function with this name already exists.");
        return;
      }
      setFnError(idx, "");
      const old = CURRENT_WF.functions[idx].name;
      CURRENT_WF.functions[idx].name = name;
      CURRENT_WF.nodes.forEach(n => {
        if ((n.type === "call_func" || n.type === "func_entry" || n.type === "func_return") && n.funcName === old) {
          n.funcName = name;
        }
      });
      refreshWfPreview();
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-fn-returns").forEach(sel => {
    sel.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const val = e.target.value || null;
      CURRENT_WF.functions[idx].returns = val;
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-fn-param-name").forEach(inp => {
    inp.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const pidx = Number(e.target.dataset.pidx);
      CURRENT_WF.functions[idx].params[pidx].name = e.target.value.trim();
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-fn-param-type").forEach(sel => {
    sel.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const pidx = Number(e.target.dataset.pidx);
      CURRENT_WF.functions[idx].params[pidx].type = e.target.value;
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-fn-param-delete").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      const pidx = Number(btn.dataset.pidx);
      CURRENT_WF.functions[idx].params.splice(pidx, 1);
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-fn-param-add").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      const params = CURRENT_WF.functions[idx].params = CURRENT_WF.functions[idx].params || [];
      const existing = new Set(params.map(p => p.name));
      let n = 1, name = "arg1";
      while (existing.has(name)) { n += 1; name = `arg${n}`; }
      params.push({ name, type: "string" });
      renderAutomationStudioView();
    };
  });

  document.querySelectorAll(".wf-fn-delete").forEach(btn => {
    btn.onclick = () => wfDeleteFunction(Number(btn.dataset.idx));
  });
}

function wfDeleteFunction(idx) {
  const fn = CURRENT_WF.functions?.[idx];
  if (!fn) return;
  const name = fn.name;
  const related = CURRENT_WF.nodes.filter(n =>
    (n.type === "call_func" || n.type === "func_entry" || n.type === "func_return") && n.funcName === name);
  const msg = related.length
    ? `Delete function "${name}" and ${related.length} related node(s) on the graph?`
    : `Delete function "${name}"?`;
  if (!window.confirm(msg)) return;
  wfPushUndo();
  const removeIds = new Set(related.map(n => n.id));
  related.forEach(n => { if (n.pairId) removeIds.add(n.pairId); });
  CURRENT_WF.functions.splice(idx, 1);
  CURRENT_WF.nodes = CURRENT_WF.nodes.filter(n => !removeIds.has(n.id));
  CURRENT_WF.edges = CURRENT_WF.edges.filter(e => !removeIds.has(e.from) && !removeIds.has(e.to));
  renderAutomationStudioView();
}

function wfPinFromElement(el) {
  if (!el || !el.classList || !el.classList.contains("wf-pin")) return null;
  return {
    nodeId: el.dataset.pinNode,
    port: el.dataset.pinPort,
    kind: el.dataset.pinKind || "exec",
    pinType: el.dataset.pinType || null,
  };
}

function wfPinNearClient(clientX, clientY, wantIn, maxDist = 40) {
  const selector = wantIn ? ".wf-pin-in" : ".wf-pin-out";
  let best = null;
  let bestD = maxDist;
  document.querySelectorAll(selector).forEach(pin => {
    const r = pin.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(clientX - cx, clientY - cy);
    // Pin pseudo-elements enlarge the mouse target and can overlap adjacent rows.
    // Choose the nearest visible pin center instead of whichever overlap is on top.
    if (d <= bestD) { bestD = d; best = pin; }
  });
  return best;
}

function wfFirstCompatibleDataIn(type, nodeType, funcName) {
  if (nodeType === "set_var") return { toPort: "value" };
  if (nodeType === "reroute") return { toPort: "in" };
  if (nodeType === "call_func" && funcName) {
    const fn = wfFuncByName(funcName);
    const p = (fn?.params || []).find(p => wfTypesCompatible(type, p.type));
    return p ? { toPort: p.name } : null;
  }
  if (nodeType === "func_return" && funcName) {
    const fn = wfFuncByName(funcName);
    if (fn?.returns && wfTypesCompatible(type, fn.returns)) return { toPort: "return" };
  }
  const def = WF_NODE_TYPES[nodeType];
  if (def) {
    const wireable = wfNormalizeParams(def).filter(p => p.wire);
    const p = wireable.find(p => wfTypesCompatible(type, p.type));
    if (p) return { toPort: p.name };
  }
  return null;
}

function wfFirstCompatibleDataOut(dstType, nodeType, funcName, varName) {
  if (nodeType === "literal_number" || nodeType === "literal_string" || nodeType === "literal_bool") {
    const outType = wfLiteralResultType(nodeType);
    if (!wfTypesMismatch(outType, dstType)) return { port: "result", type: outType };
    return null;
  }
  if (nodeType === "get_var" && varName) {
    const vtype = (wfVarByName(varName) || {}).type || "string";
    return !wfTypesMismatch(vtype, dstType) ? { port: "value", type: vtype } : null;
  }
  if (nodeType === "reroute") return { port: "out", type: "any" };
  if (nodeType === "call_func" && funcName) {
    const fn = wfFuncByName(funcName);
    if (fn?.returns && !wfTypesMismatch(fn.returns, dstType)) return { port: "result", type: fn.returns };
    return null;
  }
  const stub = { type: nodeType, funcName, varName, params: {} };
  const outs = wfDataOutputDefs(stub);
  const match = outs.find(d => !wfTypesMismatch(d.type, dstType))
    || outs.find(d => d.type === "any")
    || (dstType === "any" ? outs[0] : null);
  return match ? { port: match.port, type: match.type } : null;
}

function wfFindEdgeToInput(nodeId, port, kind) {
  if (kind === "exec") {
    return CURRENT_WF.edges.find(e => e.kind !== "data" && e.to === nodeId);
  }
  return CURRENT_WF.edges.find(e => e.kind === "data" && e.to === nodeId && e.toPort === port);
}

function wfPinDragAnchor(pinEl) {
  const pin = wfPinFromElement(pinEl);
  if (!pin) return null;
  const side = pinEl.classList.contains("wf-pin-in") ? "in" : "out";
  if (pin.kind === "data") return wfPinCenter(pin.nodeId, pin.port, "data", side);
  return wfPinCenter(pin.nodeId, pin.port, "exec", side);
}

function wfFocusNodePrimaryInput(node) {
  const card = document.querySelector(`.node-card[data-node-id="${node.id}"]`);
  if (!card) return;
  const lit = card.querySelector(".wf-pin-literal");
  if (lit) { lit.focus(); if (lit.select) lit.select(); return; }
  const body = card.querySelector(".node-body input, .node-body textarea");
  if (body) { body.focus(); if (body.select) body.select(); }
}

function wfCommitParamInput(inp) {
  const node = CURRENT_WF.nodes.find(n => n.id === inp.dataset.node);
  if (!node) return;
  if (!node.params) node.params = {};
  node.params[inp.dataset.param] = inp.value;
  refreshWfPreview();
}

function wfDestPinType(nodeId, toPort) {
  const node = CURRENT_WF.nodes.find(n => n.id === nodeId);
  if (!node) return "string";
  const p = wfParamDefs(node).find(pd => pd.name === toPort);
  return p ? p.type : "string";
}

function wfFirstCompatibleOutput(nodeId) {
  const n = CURRENT_WF.nodes.find(nd => nd.id === nodeId);
  if (!n) return null;
  const def = WF_NODE_TYPES[n.type] || {};
  const execOuts = def.outputs || (n.type === "start" ? ["next"] : []);
  if (execOuts.length) return { nodeId, port: execOuts[0], kind: "exec" };
  const dataOuts = wfDataOutputDefs(n);
  if (dataOuts.length) return { nodeId, port: dataOuts[0].port, kind: "data", pinType: dataOuts[0].type };
  return null;
}

function wfConnectEdge(from, toNodeId, toPort) {
  const kind = from.kind || "exec";
  if (kind === "exec") {
    const dest = CURRENT_WF.nodes.find(n => n.id === toNodeId);
    if (dest && wfIsEntryNodeType(dest.type)) return;
    CURRENT_WF.edges = CURRENT_WF.edges.filter(e =>
      e.kind === "data" || e.from !== from.nodeId || e.fromPort !== from.port);
    CURRENT_WF.edges.push({ from: from.nodeId, fromPort: from.port, to: toNodeId, kind: "exec" });
  } else if (toPort) {
    const srcType = from.pinType || "any";
    const dstType = wfDestPinType(toNodeId, toPort);
    CURRENT_WF.edges = CURRENT_WF.edges.filter(e =>
      e.kind !== "data" || e.to !== toNodeId || e.toPort !== toPort);
    CURRENT_WF.edges.push({
      from: from.nodeId, fromPort: from.port, to: toNodeId, toPort,
      kind: "data", pinType: srcType, typeMismatch: wfTypesMismatch(srcType, dstType),
    });
    wfUpdateLiteralVisibility();
  }
}

function removeWfNode(nodeId, skipUndo) {
  if (!skipUndo) wfPushUndo();
  const node = CURRENT_WF.nodes.find(n => n.id === nodeId);
  const idsToRemove = new Set([nodeId]);
  if (node && node.pairId) idsToRemove.add(node.pairId);
  if (node?.type === "reroute") {
    const wireKind = wfRerouteWireKind(node);
    if (wireKind === "exec") {
      const inEdge = CURRENT_WF.edges.find(e => e.kind !== "data" && e.to === nodeId);
      const outEdge = CURRENT_WF.edges.find(e => e.kind !== "data" && e.from === nodeId);
      CURRENT_WF.edges = CURRENT_WF.edges.filter(e => e.to !== nodeId && e.from !== nodeId);
      if (inEdge && outEdge) {
        CURRENT_WF.edges.push({
          from: inEdge.from, fromPort: inEdge.fromPort, to: outEdge.to, kind: "exec",
        });
      }
    } else {
      const inEdge = CURRENT_WF.edges.find(e => e.kind === "data" && e.to === nodeId && e.toPort === "in");
      const outEdge = CURRENT_WF.edges.find(e => e.kind === "data" && e.from === nodeId && e.fromPort === "out");
      CURRENT_WF.edges = CURRENT_WF.edges.filter(e => e.to !== nodeId && e.from !== nodeId);
      if (inEdge && outEdge) {
        CURRENT_WF.edges.push({
          from: inEdge.from, fromPort: inEdge.fromPort, to: outEdge.to, toPort: outEdge.toPort,
          kind: "data", pinType: inEdge.pinType || outEdge.pinType, typeMismatch: inEdge.typeMismatch || outEdge.typeMismatch,
        });
      }
    }
  } else {
    CURRENT_WF.edges = CURRENT_WF.edges.filter(e => !idsToRemove.has(e.from) && !idsToRemove.has(e.to));
  }
  CURRENT_WF.nodes = CURRENT_WF.nodes.filter(n => !idsToRemove.has(n.id));
}

// Bulk-delete a marquee selection with Delete/Backspace, claude_notes' multi-select ask. Declared
// once at module scope (not inside wireAutomation) so repeated addEventListener calls across
// re-renders dedupe automatically instead of stacking duplicate listeners.
function wfSelectionDeleteHandler(e) {
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (!document.getElementById("node-canvas")) return;
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (WF_SELECTED_EDGE !== null && WF_SELECTED_EDGE !== undefined) {
    e.preventDefault();
    wfPushUndo();
    CURRENT_WF.edges.splice(WF_SELECTED_EDGE, 1);
    WF_SELECTED_EDGE = null;
    drawWfConnectors();
    wfUpdateLiteralVisibility();
    refreshWfPreview();
    return;
  }
  if (!WF_SELECTED_NODES.size) return;
  e.preventDefault();
  wfPushUndo();
  Array.from(WF_SELECTED_NODES).forEach(id => {
    if (CURRENT_WF.nodes.find(n => n.id === id)?.type === "start") return;
    removeWfNode(id, true);
  });
  WF_SELECTED_NODES.clear();
  wfClearChainFocus();
  renderAutomationStudioView();
}

function wfAddComment(x, y, w, h, title, body) {
  wfPushUndo();
  CURRENT_WF.comments = CURRENT_WF.comments || [];
  wfNodeCounter += 1;
  CURRENT_WF.comments.push({
    id: `c${Date.now()}_${wfNodeCounter}`,
    x, y, w: w || 240, h: h || 140,
    title: title || "Comment",
    body: body || "",
    color: WF_COMMENT_COLORS[0],
    collapsed: false,
  });
}

function wfToggleCommentCollapsed(commentId) {
  const c = (CURRENT_WF.comments || []).find(x => x.id === commentId);
  if (!c) return;
  wfPushUndo();
  if (!c.collapsed) {
    c.expandedH = c.h || 140;
    c.collapsed = true;
  } else {
    c.collapsed = false;
    c.h = c.expandedH || c.h || 140;
  }
  renderAutomationStudioView();
}

function wfAddNote(x, y, text) {
  wfPushUndo();
  CURRENT_WF.notes = CURRENT_WF.notes || [];
  wfNodeCounter += 1;
  CURRENT_WF.notes.push({
    id: `note${Date.now()}_${wfNodeCounter}`,
    x: Math.round(x / 8) * 8,
    y: Math.round(y / 8) * 8,
    text: text || "Note",
    color: WF_NOTE_COLORS[0],
  });
}

function wfWrapSelectionInComment() {
  if (!WF_SELECTED_NODES.size) return;
  wfPushUndo();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  WF_SELECTED_NODES.forEach(id => {
    const n = CURRENT_WF.nodes.find(nd => nd.id === id);
    if (!n) return;
    const card = document.querySelector(`.node-card[data-node-id="${id}"]`);
    const w = card ? card.offsetWidth : 220;
    const h = card ? card.offsetHeight : 80;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
  });
  if (!isFinite(minX)) return;
  CURRENT_WF.comments = CURRENT_WF.comments || [];
  wfNodeCounter += 1;
  CURRENT_WF.comments.push({
    id: `c${Date.now()}_${wfNodeCounter}`,
    x: minX - 20, y: minY - 28, w: maxX - minX + 40, h: maxY - minY + 48,
    title: "Comment", body: "", color: WF_COMMENT_COLORS[0], collapsed: false,
  });
  renderAutomationStudioView();
}

function wfNodesInComment(c) {
  return CURRENT_WF.nodes.filter(n => {
    if (n.type === "reroute") return n.x >= c.x && n.y >= c.y && n.x <= c.x + c.w && n.y <= c.y + c.h;
    const card = document.querySelector(`.node-card[data-node-id="${n.id}"]`);
    const w = card ? card.offsetWidth : 220;
    const h = card ? card.offsetHeight : 80;
    const cx = n.x + w / 2, cy = n.y + h / 2;
    return cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h;
  });
}

function wfTidyLayout() {
  // Top→bottom flow per connected chain, soft horizontal stagger (stylistic, not mirrored).
  // Orphans (no wires) park aside — they do nothing until connected.
  wfPushUndo();
  const commentMembers = wfCommentMembershipSnapshot();
  const execEdges = CURRENT_WF.edges.filter(e => e.kind !== "data");
  const dataEdges = CURRENT_WF.edges.filter(e => e.kind === "data");
  const nodes = CURRENT_WF.nodes.filter(n => n.type !== "reroute");
  const orphans = nodes.filter(n => wfNodeIsOrphan(n));
  const active = nodes.filter(n => !wfNodeIsOrphan(n));
  const activeIds = new Set(active.map(n => n.id));

  const undirected = {};
  active.forEach(n => { undirected[n.id] = new Set(); });
  [...execEdges, ...dataEdges].forEach(e => {
    if (!activeIds.has(e.from) || !activeIds.has(e.to)) return;
    undirected[e.from].add(e.to);
    undirected[e.to].add(e.from);
  });

  const components = [];
  const seenComp = new Set();
  active.forEach(n => {
    if (seenComp.has(n.id)) return;
    const comp = [];
    const q = [n.id];
    seenComp.add(n.id);
    while (q.length) {
      const id = q.shift();
      const node = active.find(x => x.id === id);
      if (node) comp.push(node);
      (undirected[id] || []).forEach(nb => {
        if (!seenComp.has(nb)) {
          seenComp.add(nb);
          q.push(nb);
        }
      });
    }
    components.push(comp);
  });
  const nodeComment = {};
  Object.entries(commentMembers).forEach(([cid, ids]) => {
    ids.forEach(nid => {
      if (!nodeComment[nid]) nodeComment[nid] = cid;
    });
  });
  function compZoneKey(comp) {
    const counts = {};
    comp.forEach(n => {
      const cid = nodeComment[n.id];
      if (cid) counts[cid] = (counts[cid] || 0) + 1;
    });
    let best = "", bestN = 0;
    Object.entries(counts).forEach(([cid, n]) => {
      if (n > bestN) { best = cid; bestN = n; }
    });
    return best || `solo:${comp[0]?.id || "?"}`;
  }
  components.sort((a, b) => {
    const za = compZoneKey(a);
    const zb = compZoneKey(b);
    if (za !== zb) return za.localeCompare(zb);
    const ax = a.reduce((s, n) => s + (n.x || 0), 0) / Math.max(1, a.length);
    const bx = b.reduce((s, n) => s + (n.x || 0), 0) / Math.max(1, b.length);
    const ay = a.reduce((s, n) => s + (n.y || 0), 0) / Math.max(1, a.length);
    const by = b.reduce((s, n) => s + (n.y || 0), 0) / Math.max(1, b.length);
    return ax - bx || ay - by;
  });

  const adj = {};
  execEdges.forEach(e => { (adj[e.from] = adj[e.from] || []).push(e.to); });
  const parents = {};
  execEdges.forEach(e => { (parents[e.to] = parents[e.to] || []).push(e.from); });

  const LAYER_GAP = 148;
  const NODE_GAP_X = 246;
  const COMP_GAP_X = 56;
  const BAND_GAP_Y = 88;
  const ORIGIN_X = 80;
  const ORIGIN_Y = 70;
  const MAX_COMP_COLS = 5;
  const pos = {};

  let bandY = ORIGIN_Y;
  let colX = ORIGIN_X;
  let col = 0;
  let bandMaxBottom = ORIGIN_Y;
  let prevZone = null;

  components.forEach((comp, ci) => {
    const zone = compZoneKey(comp);
    // New zone comment band → drop to a fresh row so frames stay readable.
    if (prevZone && zone !== prevZone) {
      col = 0;
      colX = ORIGIN_X;
      bandY = bandMaxBottom + BAND_GAP_Y;
      prevZone = zone;
    } else if (!prevZone) {
      prevZone = zone;
    }
    const compSet = new Set(comp.map(n => n.id));
    const indeg = {};
    comp.forEach(n => { indeg[n.id] = 0; });
    execEdges.forEach(e => {
      if (compSet.has(e.to) && compSet.has(e.from)) indeg[e.to] += 1;
    });
    const roots = comp.filter(n =>
      indeg[n.id] === 0
      || wfIsEntryNodeType(n.type)
    );
    const depth = {};
    const q = [];
    roots.forEach(n => {
      depth[n.id] = 0;
      q.push(n.id);
    });
    while (q.length) {
      const id = q.shift();
      (adj[id] || []).forEach(tid => {
        if (!compSet.has(tid)) return;
        depth[tid] = Math.max(depth[tid] ?? 0, (depth[id] || 0) + 1);
        if (!q.includes(tid)) q.push(tid);
      });
    }
    comp.forEach(n => {
      if (depth[n.id] !== undefined) return;
      const asDataTo = dataEdges.find(e => e.to === n.id && compSet.has(e.from));
      const asDataFrom = dataEdges.find(e => e.from === n.id && compSet.has(e.to));
      if (asDataTo && depth[asDataTo.from] !== undefined) depth[n.id] = depth[asDataTo.from];
      else if (asDataFrom && depth[asDataFrom.to] !== undefined) depth[n.id] = depth[asDataFrom.to];
      else depth[n.id] = 0;
    });

    const layers = {};
    comp.forEach(n => {
      if (n.type === "endif") return;
      const d = depth[n.id] || 0;
      (layers[d] = layers[d] || []).push(n);
    });
    const depthKeys = Object.keys(layers).map(Number).sort((a, b) => a - b);
    let maxRowWidth = NODE_GAP_X;
    depthKeys.forEach(d => {
      maxRowWidth = Math.max(maxRowWidth, Math.max(1, layers[d].length) * NODE_GAP_X);
    });

    if (col >= MAX_COMP_COLS) {
      col = 0;
      colX = ORIGIN_X;
      bandY = bandMaxBottom + BAND_GAP_Y;
    }
    const baseX = colX;
    const baseY = bandY;
    // Soft column sway so parallel chains aren't rigidly mirrored.
    const sway = Math.sin(ci * 0.7) * 22;

    depthKeys.forEach(d => {
      const row = layers[d];
      row.sort((a, b) => {
        const pa = (parents[a.id] || []).filter(id => compSet.has(id));
        const pb = (parents[b.id] || []).filter(id => compSet.has(id));
        const ba = pa.length
          ? pa.reduce((s, id) => s + (pos[id]?.x ?? a.x), 0) / pa.length
          : a.x;
        const bb = pb.length
          ? pb.reduce((s, id) => s + (pos[id]?.x ?? b.x), 0) / pb.length
          : b.x;
        return ba - bb || a.y - b.y;
      });
      const rowWidth = Math.max(0, row.length - 1) * NODE_GAP_X;
      const startX = baseX + sway + Math.max(0, (maxRowWidth - NODE_GAP_X - rowWidth) / 2);
      row.forEach((n, i) => {
        const wave = Math.sin(i * 0.95 + d * 0.4 + ci * 0.2) * 16;
        const x = Math.round((startX + i * NODE_GAP_X + wave) / 8) * 8;
        const y = Math.round((baseY + d * LAYER_GAP) / 8) * 8;
        n.x = x;
        n.y = y;
        pos[n.id] = { x, y };
      });
    });

    comp.filter(n => n.type === "endif").forEach(n => {
      const pair = CURRENT_WF.nodes.find(p => p.id === n.pairId);
      if (pair && pos[pair.id]) {
        n.x = pair.x + NODE_GAP_X;
        n.y = pair.y;
        pos[n.id] = { x: n.x, y: n.y };
      }
    });

    let compBottom = baseY;
    let compRight = baseX + maxRowWidth;
    comp.forEach(n => {
      if (!pos[n.id]) return;
      compBottom = Math.max(compBottom, pos[n.id].y + 100);
      compRight = Math.max(compRight, pos[n.id].x + 220);
    });
    bandMaxBottom = Math.max(bandMaxBottom, compBottom);
    colX = Math.max(colX + maxRowWidth + COMP_GAP_X, compRight + COMP_GAP_X);
    col += 1;
  });

  // Pull pure data producers beside their consumers for short, curvy wires.
  dataEdges.forEach(e => {
    const consumer = CURRENT_WF.nodes.find(n => n.id === e.to);
    const producer = CURRENT_WF.nodes.find(n => n.id === e.from);
    if (!consumer || !producer || producer.type === "reroute") return;
    if (wfNodeIsOrphan(producer) || wfNodeIsOrphan(consumer)) return;
    const execOut = execEdges.some(x => x.from === producer.id);
    if (execOut) return;
    producer.x = consumer.x - 168;
    producer.y = consumer.y - 28;
    pos[producer.id] = { x: producer.x, y: producer.y };
  });

  // Park disconnected nodes — they do nothing until wired.
  const parkX = Math.max(ORIGIN_X + 980, colX + 40);
  orphans.forEach((n, i) => {
    n.x = parkX + (i % 2) * 200;
    n.y = ORIGIN_Y + Math.floor(i / 2) * 110;
  });

  wfRefitCommentsToMembers(commentMembers);

  document.querySelectorAll(".node-card, .wf-reroute").forEach(el => {
    el.style.transition = "left 320ms cubic-bezier(.22,.68,.28,1), top 320ms cubic-bezier(.22,.68,.28,1)";
  });
  renderAutomationStudioView();
  setTimeout(() => {
    document.querySelectorAll(".node-card, .wf-reroute").forEach(el => { el.style.transition = ""; });
  }, 340);
  const center = wfCanvasScreenCenter();
  const orphanNote = orphans.length ? ` · ${orphans.length} unused` : "";
  wfShowCraftTick(`tidied ${active.length} nodes${orphanNote}`, center.x, center.y);
}

function wfFrameView() {
  if (WF_SELECTED_NODES.size) {
    wfFitNodesBounds(Array.from(WF_SELECTED_NODES));
    return;
  }
  wfFitView();
}

function wfGraphHasContent() {
  return !!(CURRENT_WF.nodes || []).length
    || !!(CURRENT_WF.comments || []).length
    || !!(CURRENT_WF.notes || []).length;
}

function wfFrameContentBounds(pad = 40) {
  const canvas = document.getElementById("node-canvas");
  if (!canvas || !wfGraphHasContent()) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  CURRENT_WF.nodes.forEach(n => {
    const w = n.type === "reroute" ? 16 : 220;
    const h = n.type === "reroute" ? 16 : 80;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
  });
  (CURRENT_WF.comments || []).forEach(c => {
    minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h);
  });
  (CURRENT_WF.notes || []).forEach(nt => {
    minX = Math.min(minX, nt.x); minY = Math.min(minY, nt.y);
    maxX = Math.max(maxX, nt.x + 120); maxY = Math.max(maxY, nt.y + 28);
  });
  if (!isFinite(minX)) return false;
  const cr = canvas.getBoundingClientRect();
  const gw = maxX - minX + pad * 2;
  const gh = maxY - minY + pad * 2;
  const m = wfMeta();
  m.zoom = Math.min(WF_ZOOM_MAX, Math.max(WF_ZOOM_MIN, Math.min(cr.width / gw, cr.height / gh, 1)));
  m.panX = (cr.width - gw * m.zoom) / 2 - (minX - pad) * m.zoom;
  m.panY = (cr.height - gh * m.zoom) / 2 - (minY - pad) * m.zoom;
  applyWfCanvasTransform();
  drawWfConnectors();
  wfDrawMinimap();
  return true;
}

function wfRecenterView() {
  if (!wfFrameContentBounds()) {
    const m = wfMeta();
    m.panX = 0;
    m.panY = 0;
    m.zoom = 1;
    applyWfCanvasTransform();
    scheduleDrawWfConnectors();
    wfDrawMinimap();
    if (typeof showToast === "function") showToast("Empty graph — view reset", "info");
    return;
  }
}

function wfFitView() {
  wfFrameContentBounds();
}

function wfDuplicateSelection() {
  if (!WF_SELECTED_NODES.size) return;
  wfPushUndo();
  const idMap = {};
  const newEdges = [];
  const sel = Array.from(WF_SELECTED_NODES);
  const offset = 40;
  sel.forEach(oldId => {
    const old = CURRENT_WF.nodes.find(n => n.id === oldId);
    if (!old || old.type === "start") return;
    wfNodeCounter += 1;
    const newId = `n${Date.now()}_${wfNodeCounter}`;
    idMap[oldId] = newId;
    const copy = JSON.parse(JSON.stringify(old));
    copy.id = newId;
    copy.x += offset;
    copy.y += offset;
    if (copy.pairId && sel.includes(copy.pairId)) copy.pairId = null;
    CURRENT_WF.nodes.push(copy);
  });
  sel.forEach(oldId => {
    const old = CURRENT_WF.nodes.find(n => n.id === oldId);
    if (old?.pairId && idMap[old.pairId]) {
      CURRENT_WF.nodes.find(n => n.id === idMap[oldId]).pairId = idMap[old.pairId];
      CURRENT_WF.nodes.find(n => n.id === idMap[old.pairId]).pairId = idMap[oldId];
    }
  });
  CURRENT_WF.edges.forEach(e => {
    if (idMap[e.from] && idMap[e.to]) {
      newEdges.push({ ...JSON.parse(JSON.stringify(e)), from: idMap[e.from], to: idMap[e.to] });
    }
  });
  CURRENT_WF.edges.push(...newEdges);
  WF_SELECTED_NODES = new Set(Object.values(idMap));
  renderAutomationStudioView();
}

function wireAutomation() {
  if (!WF_GRAPH_WIRED) {
    if (WF_CANVAS_MODE === "pan") WF_CANVAS_MODE = "select";
    WF_GRAPH_WIRED = true;
  }
  // A rerender must preserve the user's viewport. Clamping here used to change panY
  // after a menu pick and immediately move the new node below the visible canvas.
  applyWfCanvasTransform({ clamp: false });
  drawWfConnectors();
  const canvas = document.getElementById("node-canvas");
  const svg = document.getElementById("node-svg");
  refreshWfPreview();

  const fitBtn = document.getElementById("wf-fit-view");
  if (fitBtn) fitBtn.onclick = () => wfFrameView();
  const recenterBtn = document.getElementById("wf-recenter-btn");
  if (recenterBtn) recenterBtn.onclick = () => wfRecenterView();
  const zoomLbl = document.getElementById("wf-zoom-label");
  if (zoomLbl) zoomLbl.onclick = () => wfResetZoom();
  document.querySelectorAll("[data-wf-pan]").forEach(btn => {
    btn.onclick = () => wfPanView(btn.dataset.wfPan);
  });

  canvas.addEventListener("mouseenter", () => { WF_CANVAS_HOVER = true; WF_MOUSE_ENTERED_CANVAS = true; });
  canvas.addEventListener("mouseleave", () => { WF_CANVAS_HOVER = false; });

  document.getElementById("wf-select").onchange = async (e) => {
    wfClearSelectionState();
    if (!e.target.value) { CURRENT_WF = freshWorkflow(); renderAutomationStudioView(); return; }
    const wf = await api(`/api/workflows/${e.target.value}`);
    CURRENT_WF = {
      id: wf.id, name: wf.name,
      nodes: wf.graph.nodes || [], edges: wf.graph.edges || [],
      variables: wf.graph.variables || [], functions: wf.graph.functions || [],
      comments: wf.graph.comments || [],
      notes: wf.graph.notes || [],
      ui: wf.graph.ui || { widgets: [], device: "phone" },
      meta: wf.graph.meta || { zoom: 1, panX: 0, panY: 0 },
    };
    WF_UNDO_STACK = [];
    WF_REDO_STACK = [];
    renderAutomationStudioView();
  };

  document.getElementById("wf-name").onchange = (e) => { CURRENT_WF.name = e.target.value; };

  wireWfVariablesPanel();
  wireWfFunctionsPanel();

  const removeNode = removeWfNode;

  const addWfNode = (type, x, y, wireFrom, varName, funcName, wireTo) =>
    wfPlaceNode(type, x, y, wireFrom, varName, funcName, wireTo);

  const openPaletteMenu = (clientX, clientY, wireFrom, cx, cy, menuOpts) => {
    const autoWireFrom = menuOpts?.autoWireFrom || null;
    const wireTo = menuOpts?.wireTo || null;
    const fromWireDrop = !!(menuOpts?.fromWireDrop || wireFrom || wireTo);
    showWfContextMenu(clientX, clientY, (type, varName, funcName, autoWire, toWire) => {
      const wf = autoWire || wireFrom;
      const wt = toWire || wireTo;
      wfHandlePalettePick(type, cx, cy, wf, varName, funcName, wt);
    }, {
      wireFrom,
      wireTo,
      autoWireFrom,
      fromWireDrop,
      showAllNodes: fromWireDrop || !!menuOpts?.showAllNodes,
    });
  };

  const paletteSearch = document.getElementById("wf-palette-search");
  if (paletteSearch) {
    paletteSearch.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const screenCenter = wfCanvasScreenCenter();
      const center = wfClientToWorld(screenCenter.x, screenCenter.y);
      const cx = center.x, cy = center.y;
      const filter = paletteSearch.value.trim();
      showWfContextMenu(screenCenter.x, screenCenter.y, (type, varName, funcName) => {
        addWfNode(type, cx, cy, undefined, varName, funcName);
      });
      requestAnimationFrame(() => {
        const search = document.getElementById("wf-context-search");
        if (search && filter) {
          search.value = filter;
          search.dispatchEvent(new Event("input", { bubbles: true }));
          search.focus();
        }
      });
    };
  }

  const paletteAll = document.getElementById("wf-palette-all-nodes");
  if (paletteAll) {
    paletteAll.onclick = () => {
      const screenCenter = wfCanvasScreenCenter();
      const center = wfClientToWorld(screenCenter.x, screenCenter.y);
      openPaletteMenu(screenCenter.x, screenCenter.y, null, center.x, center.y);
    };
  }

  canvas.addEventListener("mousemove", e => {
    WF_LAST_MOUSE.clientX = e.clientX;
    WF_LAST_MOUSE.clientY = e.clientY;
    const w = wfClientToWorld(e.clientX, e.clientY);
    WF_LAST_MOUSE.worldX = w.x;
    WF_LAST_MOUSE.worldY = w.y;
    const overEmpty = !e.target.closest(".node-card, .wf-reroute, .wf-pin, .wf-wire, .wf-note, .wf-comment-title, .wf-comment-resize, #wf-minimap");
    canvas.classList.toggle("wf-empty-hover", overEmpty && !WF_WIRE_DRAG && !WF_SPACE_PAN && !WF_PAN_ACTIVE);
  });

  const minimap = document.getElementById("wf-minimap");
  if (minimap) {
    let mmDrag = false;
    minimap.addEventListener("pointerdown", e => { mmDrag = true; wfMinimapPanTo(e.clientX, e.clientY); e.preventDefault(); });
    minimap.addEventListener("pointermove", e => { if (mmDrag) wfMinimapPanTo(e.clientX, e.clientY); });
    minimap.addEventListener("pointerup", () => { mmDrag = false; });
    minimap.addEventListener("pointerleave", () => { mmDrag = false; });
  }
  wfDrawMinimap();

  let wfRightDrag = null;

  const wfBeginPan = (e, canvasEl, onDrag) => {
    e.preventDefault();
    WF_PAN_ACTIVE = true;
    canvasEl.classList.add("wf-panning");
    canvasEl.classList.remove("wf-space-ready");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const m = wfMeta();
    const start = { x: e.clientX, y: e.clientY, panX: m.panX, panY: m.panY };
    let dragFired = false;
    if (canvasEl.setPointerCapture && e.pointerId !== undefined) {
      try { canvasEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    const onMove = ev => {
      ev.preventDefault();
      if (!dragFired && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 3) {
        dragFired = true;
        if (onDrag) onDrag();
      }
      m.panX = start.panX + (ev.clientX - start.x);
      m.panY = start.panY + (ev.clientY - start.y);
      applyWfCanvasTransform({ clamp: false });
      scheduleDrawWfConnectors();
    };
    const onUp = ev => {
      WF_PAN_ACTIVE = false;
      canvasEl.classList.remove("wf-panning");
      if (WF_SPACE_PAN) canvasEl.classList.add("wf-space-ready");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (canvasEl.releasePointerCapture && ev.pointerId !== undefined) {
        try { canvasEl.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      }
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      applyWfCanvasTransform({ clamp: true });
      scheduleDrawWfConnectors();
      wfDrawMinimap();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  // Right-click empty canvas → search palette (primary). Right-drag still pans.
  let wfPaletteOpenedByContext = false;
  const wfEmptyContextMenu = (e) => {
    if (!wfIsEmptyPaletteTarget(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (wfRightDrag?.moved || wfPaletteOpenedByContext) return;
    const worldPt = wfClientToWorld(e.clientX, e.clientY);
    wfPaletteOpenedByContext = true;
    openPaletteMenu(e.clientX, e.clientY, null, worldPt.x, worldPt.y);
    setTimeout(() => { wfPaletteOpenedByContext = false; }, 250);
  };
  canvas.addEventListener("contextmenu", wfEmptyContextMenu, { capture: true });
  const wfWorldEl = document.getElementById("wf-world");
  if (wfWorldEl) wfWorldEl.addEventListener("contextmenu", wfEmptyContextMenu, { capture: true });

  // Capture-phase pan wins over node/pin handlers so Space / middle / Pan mode
  // always move the canvas — including when the pointer is over a node.
  canvas.addEventListener("pointerdown", e => {
    const wantPan = e.button === 1
      || (e.button === 0 && WF_SPACE_PAN)
      || (e.button === 0 && WF_CANVAS_MODE === "pan");
    if (!wantPan) return;
    if (e.target.closest("input, textarea, select, button, [contenteditable]")) return;
    e.preventDefault();
    e.stopPropagation();
    if (WF_SPACE_ARM) WF_SPACE_ARM.dragged = false;
    wfBeginPan(e, canvas, () => {
      if (WF_SPACE_ARM) WF_SPACE_ARM.dragged = true;
    });
  }, { capture: true });

  canvas.addEventListener("pointerdown", e => {
    const worldPt = wfClientToWorld(e.clientX, e.clientY);
    if (e.button === 2) {
      if (e.target.closest(".node-card, .wf-reroute, .wf-pin, .wf-wire, .wf-note, .wf-comment-title, .wf-comment-resize")) return;
      wfRightDrag = { x: e.clientX, y: e.clientY, wx: worldPt.x, wy: worldPt.y, moved: false };
      const m = wfMeta();
      const start = { x: e.clientX, y: e.clientY, panX: m.panX, panY: m.panY };
      const onMove = ev => {
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        // Higher threshold so slight jitter still counts as "click → search".
        if (Math.hypot(dx, dy) > 12) {
          if (!wfRightDrag.moved) {
            wfRightDrag.moved = true;
            WF_PAN_ACTIVE = true;
            canvas.classList.add("wf-panning");
            document.body.style.userSelect = "none";
            document.body.style.cursor = "grabbing";
            if (canvas.setPointerCapture && ev.pointerId !== undefined) {
              try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
            }
          }
          m.panX = start.panX + dx;
          m.panY = start.panY + dy;
          applyWfCanvasTransform({ clamp: false });
          scheduleDrawWfConnectors();
        }
      };
      const onUp = ev => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        WF_PAN_ACTIVE = false;
        canvas.classList.remove("wf-panning");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        if (canvas.releasePointerCapture && ev.pointerId !== undefined) {
          try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
        }
        // Fallback when contextmenu doesn't fire (e.g. some trackpads).
        if (wfRightDrag && !wfRightDrag.moved && !wfPaletteOpenedByContext && !document.getElementById("wf-context-menu")) {
          openPaletteMenu(ev.clientX, ev.clientY, null, wfRightDrag.wx, wfRightDrag.wy);
        } else if (wfRightDrag?.moved) {
          applyWfCanvasTransform({ clamp: true });
          scheduleDrawWfConnectors();
          wfDrawMinimap();
        }
        wfRightDrag = null;
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    }
  });

  canvas.addEventListener("dblclick", e => {
    if (e.target.closest(".node-card, .wf-reroute, .wf-pin, .wf-wire, .wf-comment-title, .wf-comment-resize, .wf-note")) return;
    const pt = wfClientToWorld(e.clientX, e.clientY);
    wfAddNote(pt.x, pt.y);
    renderAutomationStudioView();
  });

  canvas.addEventListener("wheel", e => wfApplyWheelPanZoom(e), { passive: false });

  if (!window._wfSpacePanWired) {
    window._wfSpacePanWired = true;
    document.addEventListener("keydown", e => {
      const inField = e.target.closest("input, textarea, select, [contenteditable]");
      const graphActive = wfGraphEditorActive();
      const canvasOpen = graphActive ? document.getElementById("node-canvas") : null;
      if (e.code === "Space" && !e.repeat && !inField && graphActive && !document.getElementById("wf-context-menu")) {
        if (!WF_SPACE_PAN) {
          e.preventDefault();
          WF_SPACE_PAN = true;
          WF_SPACE_ARM = { t0: Date.now(), dragged: false };
          canvasOpen.classList.add("wf-space-ready");
          canvasOpen.focus();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !inField && canvasOpen && WF_SELECTED_NODES.size) {
        e.preventDefault();
        wfCopySelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !inField && canvasOpen && WF_CLIPBOARD) {
        e.preventDefault();
        wfPasteAtCursor();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !inField && canvasOpen) {
        e.preventDefault();
        if (e.shiftKey) wfRedo();
        else wfUndo();
      }
      if (e.key === "m" && !inField && canvasOpen) {
        WF_MINIMAP_VISIBLE = !WF_MINIMAP_VISIBLE;
        const mm = document.getElementById("wf-minimap");
        if (mm) mm.style.display = WF_MINIMAP_VISIBLE ? "" : "none";
        if (WF_MINIMAP_VISIBLE) wfDrawMinimap();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && !inField && canvasOpen) {
        e.preventDefault();
        wfDuplicateSelection();
      }
      if ((e.key === "f" || e.key === "F") && !inField && canvasOpen && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        wfFrameView();
      }
      if (e.key === "Home" && !inField && canvasOpen && (WF_CANVAS_HOVER || document.activeElement === canvasOpen)) {
        e.preventDefault();
        wfRecenterView();
      }
      if ((e.key === "a" || e.key === "A") && !inField && canvasOpen && !e.ctrlKey && !e.metaKey && WF_SELECTED_NODES.size >= 2) {
        e.preventDefault();
        wfUpdateAlignToolbar();
      }
      if ((e.key === "g" || e.key === "G") && !inField && canvasOpen && !e.ctrlKey && !e.metaKey && WF_SELECTED_NODES.size) {
        e.preventDefault();
        wfWrapSelectionInComment();
      }
      if ((e.key === "r" || e.key === "R") && !inField && canvasOpen && !e.ctrlKey && !e.metaKey) {
        if (WF_SELECTED_EDGE !== null && WF_SELECTED_EDGE !== undefined) {
          e.preventDefault();
          wfInsertRerouteOnEdge(WF_SELECTED_EDGE);
        }
      }
      if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey
          && !inField && canvasOpen) {
        wfWrapSelectionInComment();
      }
      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (arrowKeys.includes(e.key) && WF_SELECTED_NODES.size && !inField && canvasOpen) {
        e.preventDefault();
        if (!e.repeat) wfPushUndo();
        const step = e.shiftKey ? 32 : 8;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        WF_SELECTED_NODES.forEach(id => {
          const n = CURRENT_WF.nodes.find(nd => nd.id === id);
          if (!n) return;
          n.x = n.x + dx;
          n.y = n.y + dy;
        });
        const nudgeAt = wfSelectionScreenCenter() || wfCanvasScreenCenter();
        wfShowCraftTick(`+${step}px`, nudgeAt.x, nudgeAt.y);
        renderAutomationStudioView();
      }
    });
    document.addEventListener("keyup", e => {
      const inField = e.target.closest("input, textarea, select, [contenteditable]");
      if (e.code !== "Space" || inField || !wfGraphEditorActive()) return;
      const arm = WF_SPACE_ARM;
      wfDisarmSpacePan();
      if (arm && !arm.dragged && !document.getElementById("wf-context-menu")) {
        wfOpenSearchPalette();
      }
    });
  }

  if (!window._wfSpacePanBlurWired) {
    window._wfSpacePanBlurWired = true;
    window.addEventListener("blur", wfDisarmSpacePan);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) wfDisarmSpacePan();
    });
  }

  document.querySelectorAll(".node-delete").forEach(btn => {
    btn.onclick = () => { removeNode(btn.dataset.node); renderAutomationStudioView(); };
  });

  document.querySelectorAll(".wf-bp-dot").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); wfToggleBreakpoint(btn.dataset.bpNode); };
  });

  document.querySelectorAll(".wf-pin").forEach(pin => {
    pin.addEventListener("contextmenu", e => wfShowPinContextMenu(e, pin));
  });

  document.querySelectorAll(".node-card, .wf-reroute").forEach(card => {
    card.addEventListener("contextmenu", e => {
      if (e.target.closest(".wf-bp-dot, .node-delete, input, textarea, .wf-pin")) return;
      e.preventDefault();
      e.stopPropagation();
      wfShowNodeContextMenu(e, card.dataset.nodeId);
    });
    card.addEventListener("dblclick", e => {
      if (e.target.closest(".wf-bp-dot, .node-delete, .wf-pin")) return;
      if (e.target.closest("input, textarea") && !e.target.closest(".wf-pin-literal-wrap, .node-body")) return;
      e.stopPropagation();
      const n = CURRENT_WF.nodes.find(nd => nd.id === card.dataset.nodeId);
      if (!n) return;
      wfEditNode(n);
    });
  });

  // Marquee (box) multi-select, claude_notes: "Multi-select nodes (marquee/box select)".
  // Mousedown directly on the empty canvas/svg background (not a node, not a pin) starts a
  // drag-rectangle; on mouseup, any node whose card intersects it is selected. Selected nodes:
  // dragging any one of their headers moves the whole group together, and Delete/Backspace
  // removes all of them at once.
  const applyWfSelectionClasses = () => {
    document.querySelectorAll(".node-card, .wf-reroute").forEach(card => {
      card.classList.toggle("wf-selected", WF_SELECTED_NODES.has(card.dataset.nodeId));
    });
  };
  applyWfSelectionClasses();

  const world = document.getElementById("wf-world");
  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0 || WF_PAN_ACTIVE || WF_SPACE_PAN || WF_CANVAS_MODE === "pan") return;
    if (e.target.closest(".node-card") || e.target.closest(".wf-reroute") || e.target.closest(".wf-pin-out")
        || e.target.closest(".wf-pin-in") || e.target.closest(".wf-wire")
        || e.target.closest(".wf-comment-title, .wf-comment-resize") || e.target.closest(".wf-note")) return;
    const start = wfClientToWorld(e.clientX, e.clientY);
    const marquee = document.createElement("div");
    marquee.className = "wf-marquee";
    marquee.style.left = start.x + "px"; marquee.style.top = start.y + "px";
    world.appendChild(marquee);
    canvas.classList.add("wf-marquee-active");
    let moved = false;

    const onMove = ev => {
      moved = true;
      const cur = wfClientToWorld(ev.clientX, ev.clientY);
      const left = Math.min(start.x, cur.x), top = Math.min(start.y, cur.y);
      marquee.style.left = left + "px"; marquee.style.top = top + "px";
      marquee.style.width = Math.abs(cur.x - start.x) + "px";
      marquee.style.height = Math.abs(cur.y - start.y) + "px";
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      canvas.classList.remove("wf-marquee-active");
      const rect = { left: parseFloat(marquee.style.left), top: parseFloat(marquee.style.top), width: parseFloat(marquee.style.width) || 0, height: parseFloat(marquee.style.height) || 0 };
      marquee.remove();
      if (!moved || (rect.width < 4 && rect.height < 4)) {
        if (!e.shiftKey) WF_SELECTED_NODES.clear();
        wfClearChainFocus();
        applyWfSelectionClasses();
        return;
      }
      if (!e.shiftKey) WF_SELECTED_NODES.clear();
      CURRENT_WF.nodes.forEach(n => {
        const cardEl = document.querySelector(`.node-card[data-node-id="${n.id}"], .wf-reroute[data-node-id="${n.id}"]`);
        const w = cardEl ? cardEl.offsetWidth : (n.type === "reroute" ? 16 : 180);
        const h = cardEl ? cardEl.offsetHeight : (n.type === "reroute" ? 16 : 80);
        const overlaps = n.x < rect.left + rect.width && n.x + w > rect.left && n.y < rect.top + rect.height && n.y + h > rect.top;
        if (overlaps) WF_SELECTED_NODES.add(n.id);
      });
      applyWfSelectionClasses();
      wfUpdateChainFocusToolbar();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });

  if (!window._wfSelectionDeleteWired) {
    window._wfSelectionDeleteWired = true;
    document.addEventListener("keydown", wfSelectionDeleteHandler);
  }

  document.querySelectorAll(".node-body input, .node-body textarea, .wf-pin-literal, .wf-id-field input").forEach(inp => {
    inp.onchange = () => wfCommitParamInput(inp);
    inp.onblur = () => wfCommitParamInput(inp);
    inp.onkeydown = (e) => {
      if (e.key === "Enter" && inp.tagName !== "TEXTAREA") { e.preventDefault(); inp.blur(); }
      e.stopPropagation();
    };
  });

  document.querySelectorAll(".wf-literal-promote").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      wfPromoteLiteralToNode(btn.dataset.node, btn.dataset.param, btn.dataset.pinType || "string");
    };
    btn.onmousedown = (e) => e.stopPropagation();
  });

  // claude_notes: "double-click a Custom Python node to dive into/edit its underlying source
  // with comments" -- the "code" param already renders as a plain textarea inline (small), so
  // this opens the same field in a much bigger modal for real editing instead of a cramped box.
  // Plain Python comments already work in that textarea as-is; nothing special needed for those.
  document.querySelectorAll('textarea[data-param="code"]').forEach(ta => {
    ta.ondblclick = () => openWfCodeEditorModal(ta.dataset.node, ta.dataset.param);
  });

  // Click selects; only move after a small drag threshold so nodes don't jump when selecting.
  const WF_NODE_DRAG_THRESHOLD_PX = 5;
  const wfStartNodeDrag = (nodeId, e, captureEl) => {
    if (e.button !== 0 || WF_SPACE_PAN || WF_PAN_ACTIVE || WF_CANVAS_MODE === "pan") return;
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      wfToggleNodeSelection(nodeId, true);
      return;
    }
    // Select immediately on press (without moving). Keep multi-select if clicking an already-selected node.
    if (!WF_SELECTED_NODES.has(nodeId)) wfToggleNodeSelection(nodeId, false);
    else applyWfSelectionClasses();

    const groupIds = WF_SELECTED_NODES.has(nodeId) && WF_SELECTED_NODES.size > 1
      ? Array.from(WF_SELECTED_NODES) : [nodeId];
    const group = groupIds.map(id => ({
      id,
      card: document.querySelector(`.node-card[data-node-id="${id}"], .wf-reroute[data-node-id="${id}"]`),
      node: CURRENT_WF.nodes.find(n => n.id === id),
      origX: 0, origY: 0,
    })).filter(g => g.card && g.node);
    group.forEach(g => { g.origX = g.node.x; g.origY = g.node.y; });
    const startClient = { x: e.clientX, y: e.clientY };
    const startWorld = wfClientToWorld(e.clientX, e.clientY);
    let dragging = false;
    let undoPushed = false;
    if (captureEl?.setPointerCapture) {
      try { captureEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }

    const onMove = (ev) => {
      const dist = Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y);
      if (!dragging) {
        if (dist < WF_NODE_DRAG_THRESHOLD_PX) return;
        dragging = true;
        if (!undoPushed) { wfPushUndo(); undoPushed = true; }
        group.forEach(g => g.card.classList.add("dragging"));
      }
      const cur = wfClientToWorld(ev.clientX, ev.clientY);
      const dx = cur.x - startWorld.x, dy = cur.y - startWorld.y;
      group.forEach(g => {
        const snap = WF_SNAP_ENABLED ? wfGridSnapSize() : 1;
        g.node.x = WF_SNAP_ENABLED ? Math.round((g.origX + dx) / snap) * snap : Math.round(g.origX + dx);
        g.node.y = WF_SNAP_ENABLED ? Math.round((g.origY + dy) / snap) * snap : Math.round(g.origY + dy);
        g.card.style.left = g.node.x + "px";
        g.card.style.top = g.node.y + "px";
      });
      wfApplySmartGuides(group);
      scheduleDrawWfConnectors();
    };
    const onUp = (ev) => {
      group.forEach(g => g.card.classList.remove("dragging"));
      wfClearSmartGuides();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (captureEl?.releasePointerCapture && ev.pointerId !== undefined) {
        try { captureEl.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      }
      // Pure click: selection already applied; do not leave a stale undo frame.
      if (!dragging) {
        applyWfSelectionClasses();
        wfUpdateAlignToolbar();
        wfUpdateChainFocusToolbar();
        return;
      }
      scheduleDrawWfConnectors();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  document.querySelectorAll("[data-drag-handle]").forEach(handle => {
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input, textarea, select, button, a, .wf-pin, .wf-pin-literal, .wf-bp-dot, .node-delete")) return;
      wfStartNodeDrag(handle.dataset.dragHandle, e, handle);
    });
  });

  // Body clicks on node-cards (header already has data-drag-handle). Reroutes are
  // fully covered by the drag-handle listener above — skip them here to avoid double-bind.
  document.querySelectorAll(".node-card").forEach(card => {
    card.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("[data-drag-handle]")) return;
      if (e.target.closest("input, textarea, select, button, a, .wf-pin, .wf-pin-literal, .wf-bp-dot, .node-delete")) return;
      wfStartNodeDrag(card.dataset.nodeId, e, card);
    });
  });

  const wfFinishWireDrag = (ev) => {
    wfCancelWireDraftRaf();
    wfClearPinHighlights();
    const draft = svg.querySelector(".wf-wire-draft");
    if (draft) draft.remove();
    const dragState = WF_WIRE_DRAG;
    WF_WIRE_DRAG = null;
    canvas.classList.remove("wf-wiring");
    if (!dragState) return;
    // Tight snap on release so "drop on empty" reliably opens the search palette
    // (hover targeting during drag still uses the wider radius).
    const SNAP = 18;
    let pinIn = wfPinNearClient(ev.clientX, ev.clientY, true, SNAP);
    let pinOut = wfPinNearClient(ev.clientX, ev.clientY, false, SNAP);
    if (dragState.direction === "out" && !pinIn && dragState.hoveredPin?.classList.contains("wf-pin-in")) {
      const r = dragState.hoveredPin.getBoundingClientRect();
      const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      if (d <= 28) pinIn = dragState.hoveredPin;
    }
    if (dragState.direction === "in" && !pinOut && dragState.hoveredPin?.classList.contains("wf-pin-out")) {
      const r = dragState.hoveredPin.getBoundingClientRect();
      const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      if (d <= 28) pinOut = dragState.hoveredPin;
    }
    if (dragState.direction === "out") {
      if (pinIn) {
        const toPin = wfPinFromElement(pinIn);
        // Never treat the source node's own pins as a drop target for empty-search.
        if (toPin && toPin.nodeId === dragState.from?.nodeId) {
          pinIn = null;
        }
      }
      if (pinIn) {
        const toPin = wfPinFromElement(pinIn);
        const check = wfPinsCanConnect(dragState.from, "out", toPin, "in");
        if (!check.ok) {
          wfPinRejectHint(check.reason, ev.clientX, ev.clientY, pinIn);
          drawWfConnectors();
          return;
        }
        wfPushUndo();
        if (dragState.from.kind === "data") {
          wfConnectEdge(dragState.from, toPin.nodeId, toPin.port);
        } else {
          wfConnectEdge(dragState.from, toPin.nodeId, "exec");
        }
        drawWfConnectors();
        refreshWfPreview();
      } else {
        // Dropped on empty canvas — open searchable all-nodes palette and auto-wire the pick.
        const pt = wfClientToWorld(ev.clientX, ev.clientY);
        openPaletteMenu(ev.clientX, ev.clientY, dragState.from, pt.x, pt.y, { fromWireDrop: true });
        drawWfConnectors();
      }
    } else {
      const to = dragState.to;
      if (pinOut) {
        const fromPin = wfPinFromElement(pinOut);
        if (fromPin && fromPin.nodeId === to?.nodeId) {
          pinOut = null;
        }
      }
      if (pinOut) {
        const fromPin = wfPinFromElement(pinOut);
        const check = wfPinsCanConnect(fromPin, "out", to, "in");
        if (!check.ok) {
          wfPinRejectHint(check.reason, ev.clientX, ev.clientY, pinOut);
          drawWfConnectors();
          wfUpdateLiteralVisibility();
          return;
        }
        if (!dragState.grabbed) wfPushUndo();
        if (fromPin.kind === "data") {
          wfConnectEdge(fromPin, to.nodeId, to.port);
        } else {
          wfConnectEdge(fromPin, to.nodeId, "exec");
        }
        drawWfConnectors();
        refreshWfPreview();
      } else if (dragState.grabbed) {
        drawWfConnectors();
        wfUpdateLiteralVisibility();
        refreshWfPreview();
      } else {
        const pt = wfClientToWorld(ev.clientX, ev.clientY);
        openPaletteMenu(ev.clientX, ev.clientY, null, pt.x, pt.y, { wireTo: to, fromWireDrop: true });
        drawWfConnectors();
        wfUpdateLiteralVisibility();
      }
    }
  };

  const wfBeginWireDrag = (pinEl, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pinEl.setPointerCapture) {
      try { pinEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    const isInput = pinEl.classList.contains("wf-pin-in");
    let dragState;
    if (isInput) {
      const to = wfPinFromElement(pinEl);
      const existing = wfFindEdgeToInput(to.nodeId, to.port, to.kind);
      if (existing) {
        wfPushUndo();
        CURRENT_WF.edges = CURRENT_WF.edges.filter(ed => ed !== existing);
        drawWfConnectors();
        wfUpdateLiteralVisibility();
        dragState = {
          direction: "in",
          from: {
            nodeId: existing.from,
            port: existing.fromPort || (existing.kind === "data" ? "value" : "next"),
            kind: existing.kind || "exec",
            pinType: existing.pinType || null,
          },
          to,
          pAnchor: wfPinDragAnchor(pinEl),
          grabbed: true,
          clientX: e.clientX,
          clientY: e.clientY,
          hoveredPin: null,
        };
      } else {
        dragState = {
          direction: "in",
          from: null,
          to,
          pAnchor: wfPinDragAnchor(pinEl),
          grabbed: false,
          clientX: e.clientX,
          clientY: e.clientY,
          hoveredPin: null,
        };
      }
      wfUpdatePinHighlightsFromInput(to);
    } else {
      const from = wfPinFromElement(pinEl);
      dragState = {
        direction: "out",
        from,
        to: null,
        pAnchor: wfPinDragAnchor(pinEl),
        grabbed: false,
        clientX: e.clientX,
        clientY: e.clientY,
        hoveredPin: null,
      };
      wfUpdatePinHighlights(from);
    }
    WF_WIRE_DRAG = dragState;
    canvas.classList.add("wf-wiring");
    canvas.classList.remove("wf-empty-hover");

    const wfPaintWireDraft = () => {
      WF_WIRE_DRAFT_RAF = null;
      if (!WF_WIRE_DRAG) return;
      const { direction, pAnchor, clientX, clientY } = WF_WIRE_DRAG;
      const cursor = wfClientToWorld(clientX, clientY);
      const start = direction === "out" ? pAnchor : cursor;
      const end = direction === "out" ? cursor : pAnchor;
      const d = wireBezier(start, end);
      const f = WF_WIRE_DRAG.from;
      const t = WF_WIRE_DRAG.to;
      const kind = f?.kind || t?.kind || "exec";
      const pinType = f?.pinType || t?.pinType || "any";
      const stroke = kind === "data" ? `var(--type-${pinType})` : "var(--accent)";
      let draft = svg.querySelector(".wf-wire-draft");
      if (draft) { draft.setAttribute("d", d); draft.setAttribute("stroke", stroke); }
      else svg.insertAdjacentHTML("beforeend", `<path class="wf-wire-draft" d="${d}" stroke="${stroke}" stroke-width="2" fill="none" opacity="0.85" style="pointer-events:none;"/>`);

      const now = performance.now();
      if (!WF_WIRE_DRAG.lastPinCheck || now - WF_WIRE_DRAG.lastPinCheck >= 32) {
        WF_WIRE_DRAG.lastPinCheck = now;
        const hovered = document.elementFromPoint(clientX, clientY);
        const pinHit = hovered?.closest?.(".wf-pin-in, .wf-pin-out")
          || wfPinNearClient(clientX, clientY, direction === "out");
        if (WF_WIRE_DRAG.hoveredPin && WF_WIRE_DRAG.hoveredPin !== pinHit) {
          WF_WIRE_DRAG.hoveredPin.classList.remove("wf-pin-target");
        }
        if (pinHit) {
          const wantIn = direction === "out";
          const okSide = wantIn ? pinHit.classList.contains("wf-pin-in") : pinHit.classList.contains("wf-pin-out");
          const fromPin = f || (pinHit.classList.contains("wf-pin-out") ? wfPinFromElement(pinHit) : null);
          const toPin = t || (pinHit.classList.contains("wf-pin-in") ? wfPinFromElement(pinHit) : null);
          const can = fromPin && toPin
            ? wfPinsCanConnect(fromPin, "out", toPin, "in")
            : (fromPin && wantIn && pinHit.classList.contains("wf-pin-in")
              ? wfPinsCanConnect(fromPin, "out", wfPinFromElement(pinHit), "in")
              : (toPin && !wantIn && pinHit.classList.contains("wf-pin-out")
                ? wfPinsCanConnect(wfPinFromElement(pinHit), "out", toPin, "in")
                : { ok: false }));
          if (okSide && can.ok) {
            pinHit.classList.add("wf-pin-target");
            WF_WIRE_DRAG.hoveredPin = pinHit;
          } else if (okSide && !can.ok) {
            if (WF_WIRE_DRAG.hoveredPin === pinHit) {
              pinHit.classList.remove("wf-pin-target");
            }
            if (WF_WIRE_DRAG.lastRejectPin !== pinHit || now - (WF_WIRE_DRAG.lastRejectAt || 0) > 400) {
              wfFlashPinReject(pinHit);
              WF_WIRE_DRAG.lastRejectPin = pinHit;
              WF_WIRE_DRAG.lastRejectAt = now;
            }
            WF_WIRE_DRAG.hoveredPin = null;
          } else {
            WF_WIRE_DRAG.hoveredPin = null;
          }
        } else {
          WF_WIRE_DRAG.hoveredPin = null;
        }
      }
    };

    const scheduleWireDraft = () => {
      if (!WF_WIRE_DRAFT_RAF) WF_WIRE_DRAFT_RAF = requestAnimationFrame(wfPaintWireDraft);
    };

    const onMove = (ev) => {
      if (!WF_WIRE_DRAG) return;
      WF_WIRE_DRAG.clientX = ev.clientX;
      WF_WIRE_DRAG.clientY = ev.clientY;
      scheduleWireDraft();
    };
    scheduleWireDraft();
    const onUp = (ev) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (pinEl.releasePointerCapture && ev.pointerId !== undefined) {
        try { pinEl.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      }
      wfFinishWireDrag(ev);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  document.querySelectorAll(".wf-pin-out, .wf-pin-in").forEach(pin => {
    pin.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      wfBeginWireDrag(pin, e);
    });
  });

  document.querySelectorAll(".wf-pin").forEach(pin => {
    pin.addEventListener("mouseenter", (e) => {
      clearTimeout(WF_PIN_TOOLTIP_TIMER);
      WF_PIN_TOOLTIP_TIMER = setTimeout(() => wfShowPinTooltip(pin, e.clientX, e.clientY), 300);
    });
    pin.addEventListener("mouseleave", () => wfHidePinTooltip());
    pin.addEventListener("mousemove", (e) => {
      if (WF_PIN_TOOLTIP_EL) {
        WF_PIN_TOOLTIP_EL.style.left = (e.clientX + 12) + "px";
        WF_PIN_TOOLTIP_EL.style.top = (e.clientY + 12) + "px";
      }
    });
  });

  document.querySelectorAll(".wf-node-chip").forEach(chip => {
    chip.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", chip.dataset.nodeType);
      e.dataTransfer.effectAllowed = "copy";
      const ghost = chip.cloneNode(true);
      ghost.classList.add("wf-chip-ghost");
      document.body.appendChild(ghost);
      WF_CHIP_DRAG = { kind: "node", type: chip.dataset.nodeType, ghost };
      e.dataTransfer.setDragImage(ghost, 40, 12);
    });
    chip.addEventListener("drag", e => {
      if (WF_CHIP_DRAG?.ghost) {
        WF_CHIP_DRAG.ghost.style.left = (e.clientX + 8) + "px";
        WF_CHIP_DRAG.ghost.style.top = (e.clientY + 8) + "px";
      }
    });
    chip.addEventListener("dragend", () => {
      if (WF_CHIP_DRAG?.ghost) WF_CHIP_DRAG.ghost.remove();
      WF_CHIP_DRAG = null;
    });
    chip.addEventListener("click", () => {
      const pt = wfPalettePlaceCoords();
      addWfNode(chip.dataset.nodeType, pt.x, pt.y);
    });
  });

  document.querySelectorAll(".wf-var-chip").forEach(chip => {
    chip.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", chip.dataset.varName);
      e.dataTransfer.effectAllowed = "copy";
      const ghost = chip.cloneNode(true);
      ghost.classList.add("wf-chip-ghost");
      document.body.appendChild(ghost);
      const isSet = e.altKey;
      WF_CHIP_DRAG = { kind: "var", name: chip.dataset.varName, varType: chip.dataset.varType, ghost, altKey: isSet };
      wfShowVarGhostNode(chip.dataset.varName, chip.dataset.varType, isSet, e.clientX, e.clientY);
      e.dataTransfer.setDragImage(ghost, 40, 12);
    });
    chip.addEventListener("drag", e => {
      if (WF_CHIP_DRAG?.ghost) {
        WF_CHIP_DRAG.ghost.style.left = (e.clientX + 8) + "px";
        WF_CHIP_DRAG.ghost.style.top = (e.clientY + 8) + "px";
        WF_CHIP_DRAG.altKey = e.altKey;
        wfMoveVarGhostNode(e.clientX, e.clientY, e.altKey);
      }
    });
    chip.addEventListener("dragend", () => {
      if (WF_CHIP_DRAG?.ghost) WF_CHIP_DRAG.ghost.remove();
      wfHideVarGhostNode();
      WF_CHIP_DRAG = null;
    });
    chip.addEventListener("contextmenu", e => {
      e.preventDefault();
      const varName = chip.dataset.varName;
      const v = wfVarByName(varName);
      if (!v) return;
      const idx = (CURRENT_WF.variables || []).findIndex(x => x.name === varName);
      const menu = document.createElement("div");
      menu.className = "wf-context-menu";
      menu.style.left = e.clientX + "px";
      menu.style.top = e.clientY + "px";
      menu.innerHTML = `
        <button type="button" data-act="get">Get</button>
        <button type="button" data-act="set">Set</button>
        <button type="button" data-act="rename">Rename</button>
        <button type="button" data-act="type">Change type</button>
        <button type="button" data-act="refs">Find references</button>
        <button type="button" data-act="delete">Delete</button>`;
      document.body.appendChild(menu);
      const close = () => menu.remove();
      menu.querySelectorAll("button").forEach(btn => {
        btn.style.cssText = "display:block;width:100%;text-align:left;padding:6px 10px;border:none;background:transparent;cursor:pointer;font-size:12px;";
        btn.onmouseenter = () => { btn.style.background = "var(--bg-card-hover)"; };
        btn.onmouseleave = () => { btn.style.background = "transparent"; };
        btn.onclick = () => {
          const act = btn.dataset.act;
          if (act === "get" || act === "set") {
            const pt = wfClientToWorld(WF_LAST_MOUSE.clientX, WF_LAST_MOUSE.clientY);
            addWfNode(act === "get" ? "get_var" : "set_var", pt.x, pt.y, null, varName);
          } else if (act === "rename") {
            const t = window.prompt("Rename variable", varName);
            if (t && isValidWfVarName(t) && !CURRENT_WF.variables.some((x, i) => i !== idx && x.name === t)) {
              wfPushUndo();
              const old = varName;
              CURRENT_WF.variables[idx].name = t;
              CURRENT_WF.nodes.forEach(n => {
                if ((n.type === "get_var" || n.type === "set_var") && n.varName === old) n.varName = t;
              });
              renderAutomationStudioView();
            }
          } else if (act === "type") {
            const types = WF_VARIABLE_TYPES;
            const cur = types.indexOf(v.type);
            wfPushUndo();
            CURRENT_WF.variables[idx].type = types[(cur + 1) % types.length];
            renderAutomationStudioView();
          } else if (act === "refs") {
            wfHighlightVarRefs(varName);
          } else if (act === "delete") {
            const refs = wfVarNodeRefs(varName);
            if (refs.length) window.alert(`${refs.length} node(s) still reference "${varName}".`);
            else { wfPushUndo(); CURRENT_WF.variables.splice(idx, 1); renderAutomationStudioView(); }
          }
          close();
        };
      });
      setTimeout(() => document.addEventListener("mousedown", function outside(ev) {
        if (!menu.contains(ev.target)) { close(); document.removeEventListener("mousedown", outside, true); }
      }, true), 0);
    });
  });

  document.querySelectorAll(".wf-fn-chip").forEach(chip => {
    chip.addEventListener("dragstart", e => {
      if (e.target.closest(".wf-fn-edit")) { e.preventDefault(); return; }
      e.dataTransfer.setData("text/plain", chip.dataset.fnName);
      const ghost = chip.cloneNode(true);
      ghost.classList.add("wf-chip-ghost");
      document.body.appendChild(ghost);
      WF_CHIP_DRAG = { kind: "func", name: chip.dataset.fnName, ghost };
      e.dataTransfer.setDragImage(ghost, 40, 12);
    });
    chip.addEventListener("drag", e => {
      if (WF_CHIP_DRAG?.ghost) {
        WF_CHIP_DRAG.ghost.style.left = (e.clientX + 8) + "px";
        WF_CHIP_DRAG.ghost.style.top = (e.clientY + 8) + "px";
      }
    });
    chip.addEventListener("dragend", () => {
      if (WF_CHIP_DRAG?.ghost) WF_CHIP_DRAG.ghost.remove();
      WF_CHIP_DRAG = null;
    });
  });

  document.querySelectorAll(".wf-fn-edit").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      wfFrameFunction(Number(btn.dataset.fnIdx));
    };
  });

  canvas.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  canvas.addEventListener("drop", e => {
    e.preventDefault();
    const pt = wfClientToWorld(e.clientX, e.clientY);
    if (WF_CHIP_DRAG?.kind === "var") {
      const isSet = e.altKey || WF_CHIP_DRAG.altKey;
      addWfNode(isSet ? "set_var" : "get_var", pt.x, pt.y, null, WF_CHIP_DRAG.name);
    } else if (WF_CHIP_DRAG?.kind === "func") {
      addWfNode("call_func", pt.x, pt.y, null, null, WF_CHIP_DRAG.name);
    } else if (WF_CHIP_DRAG?.kind === "node") {
      addWfNode(WF_CHIP_DRAG.type, pt.x, pt.y);
    }
    if (WF_CHIP_DRAG?.ghost) WF_CHIP_DRAG.ghost.remove();
    wfHideVarGhostNode();
    WF_CHIP_DRAG = null;
  });

  wfUpdateAlignToolbar();
  wfApplyDiagnostics();

  document.querySelectorAll(".wf-comment-delete").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      CURRENT_WF.comments = (CURRENT_WF.comments || []).filter(c => c.id !== btn.dataset.commentId);
      renderAutomationStudioView();
    };
  });
  document.querySelectorAll(".wf-comment-color").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const c = (CURRENT_WF.comments || []).find(x => x.id === btn.dataset.commentId);
      if (!c) return;
      const idx = WF_COMMENT_COLORS.indexOf(c.color);
      c.color = WF_COMMENT_COLORS[(idx + 1) % WF_COMMENT_COLORS.length];
      renderAutomationStudioView();
    };
  });
  document.querySelectorAll(".wf-comment-toggle").forEach(btn => {
    btn.onmousedown = (e) => e.stopPropagation();
    btn.onclick = (e) => {
      e.stopPropagation();
      wfToggleCommentCollapsed(btn.dataset.commentId);
    };
  });
  document.querySelectorAll(".wf-comment-title-text").forEach(el => {
    el.onclick = (e) => {
      // Single click on title toggles expand/collapse (dblclick still renames).
      if (e.detail === 1) {
        const cid = el.dataset.commentId;
        clearTimeout(el._wfToggleTimer);
        el._wfToggleTimer = setTimeout(() => {
          if (el._wfCommentDragged) {
            el._wfCommentDragged = false;
            return;
          }
          wfToggleCommentCollapsed(cid);
        }, 220);
      }
    };
    el.ondblclick = (e) => {
      e.stopPropagation();
      clearTimeout(el._wfToggleTimer);
      const c = (CURRENT_WF.comments || []).find(x => x.id === el.dataset.commentId);
      if (!c) return;
      const t = window.prompt("Comment title", c.title || "Comment");
      if (t === null) return;
      const body = window.prompt("Comment body (zone notes)", c.body || c.text || "");
      wfPushUndo();
      c.title = t;
      if (body !== null) c.body = body;
      renderAutomationStudioView();
    };
  });
  document.querySelectorAll("[data-comment-drag]").forEach(handle => {
    handle.onmousedown = (e) => {
      e.stopPropagation();
      if (e.target.closest(".wf-comment-toggle, .wf-comment-color, .wf-comment-delete")) return;
      const cid = handle.dataset.commentDrag;
      const c = (CURRENT_WF.comments || []).find(x => x.id === cid);
      if (!c) return;
      const titleText = handle.querySelector(".wf-comment-title-text");
      let dragged = false;
      const contained = wfNodesInComment(c);
      const start = wfClientToWorld(e.clientX, e.clientY);
      const orig = { cx: c.x, cy: c.y, nodes: contained.map(n => ({ n, x: n.x, y: n.y })) };
      const onMove = ev => {
        const cur = wfClientToWorld(ev.clientX, ev.clientY);
        const dx = cur.x - start.x, dy = cur.y - start.y;
        if (!dragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          dragged = true;
          if (titleText) titleText._wfCommentDragged = true;
        }
        c.x = Math.round((orig.cx + dx) / 16) * 16;
        c.y = Math.round((orig.cy + dy) / 16) * 16;
        const box = document.querySelector(`.wf-comment[data-comment-id="${cid}"]`);
        if (box) { box.style.left = c.x + "px"; box.style.top = c.y + "px"; }
        orig.nodes.forEach(({ n, x, y }) => {
          n.x = Math.round((x + dx) / 16) * 16;
          n.y = Math.round((y + dy) / 16) * 16;
          const card = document.querySelector(`.node-card[data-node-id="${n.id}"], .wf-reroute[data-node-id="${n.id}"]`);
          if (card) { card.style.left = n.x + "px"; card.style.top = n.y + "px"; }
        });
        scheduleDrawWfConnectors();
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!dragged && titleText) titleText._wfCommentDragged = false;
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  });
  document.querySelectorAll("[data-comment-resize]").forEach(handle => {
    handle.onmousedown = (e) => {
      e.stopPropagation();
      const cid = handle.dataset.commentResize;
      const c = (CURRENT_WF.comments || []).find(x => x.id === cid);
      if (!c) return;
      const start = wfClientToWorld(e.clientX, e.clientY);
      const orig = { w: c.w, h: c.h };
      const onMove = ev => {
        const cur = wfClientToWorld(ev.clientX, ev.clientY);
        c.w = Math.max(120, Math.round(orig.w + (cur.x - start.x)));
        c.h = Math.max(80, Math.round(orig.h + (cur.y - start.y)));
        const box = document.querySelector(`.wf-comment[data-comment-id="${cid}"]`);
        if (box) { box.style.width = c.w + "px"; box.style.height = c.h + "px"; }
        wfShowCraftTick(`${c.w}×${c.h}`, ev.clientX, ev.clientY);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  });

  document.querySelectorAll(".wf-note-delete").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      CURRENT_WF.notes = (CURRENT_WF.notes || []).filter(n => n.id !== btn.dataset.noteId);
      renderAutomationStudioView();
    };
  });
  document.querySelectorAll(".wf-note-color").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const nt = (CURRENT_WF.notes || []).find(n => n.id === btn.dataset.noteId);
      if (!nt) return;
      const idx = WF_NOTE_COLORS.indexOf(nt.color);
      nt.color = WF_NOTE_COLORS[(idx + 1) % WF_NOTE_COLORS.length];
      renderAutomationStudioView();
    };
  });
  document.querySelectorAll(".wf-note-text").forEach(el => {
    el.addEventListener("blur", () => {
      const nt = (CURRENT_WF.notes || []).find(n => n.id === el.dataset.noteId);
      if (nt) nt.text = (el.textContent || "").trim() || "Note";
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
      e.stopPropagation();
    });
  });
  document.querySelectorAll("[data-note-drag]").forEach(noteEl => {
    noteEl.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      if (e.target.closest(".wf-note-text, .wf-note-delete, .wf-note-color, button")) return;
      e.stopPropagation();
      const nid = noteEl.dataset.noteDrag;
      const nt = (CURRENT_WF.notes || []).find(n => n.id === nid);
      if (!nt) return;
      const start = wfClientToWorld(e.clientX, e.clientY);
      const orig = { x: nt.x, y: nt.y };
      noteEl.classList.add("dragging");
      const onMove = ev => {
        const cur = wfClientToWorld(ev.clientX, ev.clientY);
        nt.x = Math.round((orig.x + cur.x - start.x) / 8) * 8;
        nt.y = Math.round((orig.y + cur.y - start.y) / 8) * 8;
        noteEl.style.left = nt.x + "px";
        noteEl.style.top = nt.y + "px";
      };
      const onUp = () => {
        noteEl.classList.remove("dragging");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  });

  const ensureSaved = async () => {
    const body = { name: CURRENT_WF.name, graph: wfGraphPayload() };
    if (CURRENT_WF.id) {
      await api(`/api/workflows/${CURRENT_WF.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      const created = await api("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      CURRENT_WF.id = created.id;
    }
  };

  document.getElementById("wf-save").onclick = async () => { await ensureSaved(); renderAutomationStudioView(); };

  document.getElementById("wf-delete").onclick = async () => {
    if (!CURRENT_WF.id) return;
    if (!window.confirm("Delete this workflow?")) return;
    await api(`/api/workflows/${CURRENT_WF.id}`, { method: "DELETE" });
    wfClearSelectionState();
    CURRENT_WF = freshWorkflow();
    renderAutomationStudioView();
  };

  const generateCode = async () => {
    await ensureSaved();
    if (WF_CODE_LANG === "cpp") {
      await wfConvertToCpp();
      return;
    }
    const result = await api(`/api/workflows/${CURRENT_WF.id}/generate`, { method: "POST" });
    wfRenderCodeOutput(result.code || "");
    refreshWfPreview();
  };
  document.getElementById("wf-generate")?.addEventListener("click", generateCode);
  document.getElementById("wf-generate-fallback")?.addEventListener("click", generateCode);

  document.getElementById("wf-lang-python")?.addEventListener("click", async () => {
    WF_CODE_LANG = "python";
    localStorage.setItem("wfCodeLang", "python");
    document.getElementById("wf-lang-python")?.classList.add("studio-tb-toggle-on");
    document.getElementById("wf-lang-cpp")?.classList.remove("studio-tb-toggle-on");
    await generateCode();
  });
  document.getElementById("wf-lang-cpp")?.addEventListener("click", () => wfConvertToCpp());
  document.getElementById("wf-vibecode")?.addEventListener("click", () => wfVibecodeFlow());
  document.getElementById("wf-import-python")?.addEventListener("click", () => wfImportPythonFlow());
  document.getElementById("wf-export-md")?.addEventListener("click", () => wfExportMarkdownFlow());
  document.getElementById("wf-import-md")?.addEventListener("click", () => wfImportMarkdownFlow());
  document.getElementById("wf-open-vscode")?.addEventListener("click", () => wfOpenInVsCode());
  document.getElementById("wf-reimport-script")?.addEventListener("click", () => wfReimportFromFile());
  document.getElementById("wf-copy-code")?.addEventListener("click", async () => {
    const code = wfGetEditableCode();
    try {
      await navigator.clipboard.writeText(code);
      showToast("Copied to clipboard", "good");
    } catch {
      showToast("Copy failed", "warn");
    }
  });
  document.getElementById("wf-download-code")?.addEventListener("click", () => {
    const code = wfGetEditableCode();
    const ext = WF_CODE_LANG === "cpp" ? "cpp" : "py";
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(CURRENT_WF.name || "workflow").replace(/[^\w.-]+/g, "_")}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.querySelectorAll("[data-wf-lib]").forEach(btn => {
    btn.onclick = () => {
      if (typeof closeAutomationStudio === "function") closeAutomationStudio();
      if (typeof goToTab === "function") goToTab(btn.dataset.wfLib);
    };
  });
  document.querySelectorAll("[data-wf-console-tab]").forEach(btn => {
    btn.onclick = () => wfSetConsoleTab(btn.dataset.wfConsoleTab);
  });

  document.getElementById("wf-save-script").onclick = async () => {
    if (!CURRENT_WF.id) { window.alert("Generate the code first."); return; }
    const result = await api(`/api/workflows/${CURRENT_WF.id}/save-script`, { method: "POST" });
    window.alert(result.error || `Saved to:\n${result.path}`);
  };

  // Both of these are opt-in AI calls (button click, not automatic) and deliberately don't touch
  // any button.disabled state on the rest of the page -- claude_notes asked for the explanation
  // specifically to run "in parallel rather than blocking the editor".
  document.getElementById("wf-suggest-improvements").onclick = async () => {
    const code = document.getElementById("wf-code-output").textContent.trim();
    const box = document.getElementById("wf-improvements-box");
    if (!code) { box.textContent = "Generate the code first."; return; }
    const btn = document.getElementById("wf-suggest-improvements");
    btn.textContent = "Thinking..."; btn.disabled = true;
    box.textContent = "";
    try {
      const result = await api("/api/workflows/suggest-improvements", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      box.textContent = result.error || result.suggestions;
    } finally {
      btn.textContent = "Suggest efficiency improvements"; btn.disabled = false;
    }
  };

  document.getElementById("wf-explain-selection").onclick = async () => {
    const fullCode = document.getElementById("wf-code-output").textContent.trim();
    const selection = (window.getSelection().toString() || "").trim();
    const box = document.getElementById("wf-explain-box");
    if (!fullCode) { box.textContent = "Generate the code first."; return; }
    if (!selection) { box.textContent = "Select some text in the code preview above first."; return; }
    box.textContent = "Explaining...";
    try {
      const result = await api("/api/workflows/explain-selection", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_code: fullCode, selection }),
      });
      box.textContent = result.error || result.explanation;
    } catch (err) {
      box.textContent = errorMessage(err);
    }
  };
  wfWireZoneGUi();
  wfHydrateWatchesFromTrace();
  wfApplyEndpointGuards();
  wfCheckBlueprintNodeMilestone();
  wfRefreshBlueprintMilestonesStrip();
  wfUpdateChainFocusToolbar();
}


let AUTOMATION_STUDIO_OPEN = false;
let STUDIO_TAB = "graph";
let WF_CART_ITEMS = [];
let WF_CART_LOADING = false;
let WF_CART_STATUS = "";
let WF_N8N_STATUS = "";

function wfParseBuyCommand(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  const url = urlMatch ? urlMatch[0] : "";
  let title = text
    .replace(/https?:\/\/[^\s]+/ig, "")
    .replace(/^(please\s+)?(go\s+online\s+and\s+)?(add(\s+to(\s+my)?\s+cart)?|buy|get|order|purchase)\s+/i, "")
    .replace(/\b(to|on|in)\s+(my\s+)?cart\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[""']|[""']$/g, "");
  if (!title && url) {
    try { title = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "item"); }
    catch { title = "item"; }
  }
  if (!title) return null;
  return { title: title.slice(0, 160), url, notes: "Staged from Cart orchestrator — validate only, nothing is purchased." };
}

function wfCartItemHtml(it) {
  const queued = it.status === "queued";
  return `<div class="card wf-cart-item" data-cart-id="${escapeHtml(String(it.id))}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">
      <div>
        <strong>${escapeHtml(it.title || "Untitled")}</strong>
        <span class="pill">${escapeHtml(it.status || "queued")}</span>
        ${it.url ? `<div class="stub"><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.url)}</a></div>` : ""}
        ${it.notes ? `<div class="stub">${escapeHtml(it.notes)}</div>` : ""}
        <div class="stub">${escapeHtml(it.created_by || "user")}${it.created_at ? ` · ${escapeHtml(String(it.created_at).slice(0, 16).replace("T", " "))}` : ""}</div>
      </div>
      ${queued ? `<div style="display:flex;gap:6px;">
        <button type="button" class="primary" data-cart-validate="${it.id}">Validate</button>
        <button type="button" class="ghost" data-cart-reject="${it.id}">Reject</button>
      </div>` : ""}
    </div>
  </div>`;
}

function wfRenderCartPanel() {
  const items = WF_CART_ITEMS || [];
  const queued = items.filter(it => it.status === "queued");
  return `
    <div class="wf-cart-root" id="wf-cart-root" style="max-width:720px;margin:0 auto;padding:18px 16px 40px;">
      <h2 style="margin:0 0 6px;font-size:18px;">Cart orchestrator</h2>
      <p class="stub">Say what to buy. It is staged here for you to validate. Nothing is purchased, scraped, or seen by computer vision — this pairs with the existing cart APIs.</p>
      <form id="wf-cart-form" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
        <input id="wf-cart-cmd" name="command" required placeholder="buy noise-cancelling headphones — or paste a URL"
          style="flex:1;min-width:220px;font-size:14px;padding:8px 10px;">
        <button class="primary" type="submit">Stage</button>
      </form>
      <p class="stub" id="wf-cart-status">${escapeHtml(WF_CART_STATUS || (WF_CART_LOADING ? "Loading cart…" : `${queued.length} waiting · ${items.length} total`))}</p>
      <div id="wf-cart-list">${items.length ? items.map(wfCartItemHtml).join("") : '<p class="stub">Cart is empty. Stage an item or ask the agent: “add X to my cart”.</p>'}</div>
      <hr style="margin:22px 0;border:none;border-top:1px solid var(--border);">
      <h3 style="margin:0 0 6px;font-size:14px;">n8n</h3>
      <p class="stub">Ping the saved n8n token from Settings. Safer workflow emit uses JS-side repr guards; <code>workflow.py</code> still owns server codegen.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="secondary" id="wf-n8n-ping">Ping n8n</button>
        <span class="stub" id="wf-n8n-status">${escapeHtml(WF_N8N_STATUS || "not probed")}</span>
      </div>
    </div>`;
}

async function wfLoadCartItems() {
  WF_CART_LOADING = true;
  try {
    const res = await api("/api/cart");
    WF_CART_ITEMS = res.items || res || [];
  } catch (err) {
    WF_CART_STATUS = `Cart API unavailable: ${errorMessage ? errorMessage(err) : err}`;
    WF_CART_ITEMS = [];
  } finally {
    WF_CART_LOADING = false;
  }
}

async function wfStageCartCommand(raw) {
  const parsed = wfParseBuyCommand(raw);
  if (!parsed) {
    WF_CART_STATUS = "Could not parse that — try “buy espresso machine”.";
    return;
  }
  const res = await api("/api/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: parsed.title, url: parsed.url, notes: parsed.notes, created_by: "orchestrator" }),
  });
  if (res.error) {
    WF_CART_STATUS = res.error;
    return;
  }
  WF_CART_STATUS = `Staged “${parsed.title}” — validate below. Not purchased.`;
  await wfLoadCartItems();
}

async function wfSetCartStatus(id, status) {
  await api(`/api/cart/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (status === "validated") {
    api("/api/achievements/cart-yes", { method: "POST" }).catch(() => {});
  }
  await wfLoadCartItems();
}

function wireCartOrchestrator() {
  const form = document.getElementById("wf-cart-form");
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = document.getElementById("wf-cart-cmd");
      const cmd = input?.value || "";
      try {
        await wfStageCartCommand(cmd);
        if (input) input.value = "";
      } catch (err) {
        WF_CART_STATUS = errorMessage ? errorMessage(err) : String(err);
      }
      const panel = document.getElementById("studio-cart-panel");
      if (panel) {
        panel.innerHTML = wfRenderCartPanel();
        wireCartOrchestrator();
      }
    };
  }
  document.querySelectorAll("[data-cart-validate]").forEach(btn => {
    btn.onclick = async () => {
      await wfSetCartStatus(btn.dataset.cartValidate, "validated");
      const panel = document.getElementById("studio-cart-panel");
      if (panel) { panel.innerHTML = wfRenderCartPanel(); wireCartOrchestrator(); }
    };
  });
  document.querySelectorAll("[data-cart-reject]").forEach(btn => {
    btn.onclick = async () => {
      await wfSetCartStatus(btn.dataset.cartReject, "rejected");
      const panel = document.getElementById("studio-cart-panel");
      if (panel) { panel.innerHTML = wfRenderCartPanel(); wireCartOrchestrator(); }
    };
  });
  const ping = document.getElementById("wf-n8n-ping");
  if (ping) {
    ping.onclick = async () => {
      ping.disabled = true;
      WF_N8N_STATUS = "probing…";
      const st = document.getElementById("wf-n8n-status");
      if (st) st.textContent = WF_N8N_STATUS;
      try {
        const res = await api("/api/integrations/use", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: "n8n", action: "status" }),
        });
        WF_N8N_STATUS = res.ok ? `n8n reachable${res.result?.status ? ` · ${res.result.status}` : ""}` : (res.error || "n8n token missing — paste it in Settings");
      } catch (err) {
        WF_N8N_STATUS = errorMessage ? errorMessage(err) : String(err);
      }
      ping.disabled = false;
      const st2 = document.getElementById("wf-n8n-status");
      if (st2) st2.textContent = WF_N8N_STATUS;
    };
  }
}

function studioTabBtn(id, label) {
  const active = STUDIO_TAB === id ? " studio-tab-active" : "";
  return `<button type="button" class="secondary studio-mode-tab${active}" data-studio-tab="${id}">${label}</button>`;
}

async function studioExportPython() {
  if (typeof uieHasBindingErrors === "function" && uieHasBindingErrors()) {
    showToast("Fix binding errors before export (see Bindings tab)");
    STUDIO_TAB = "bindings";
    renderAutomationStudioView();
    return;
  }
  const graph = wfGraphPayload();
  const result = await api("/api/workflows/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph }),
  });
  const code = result.code || "";
  const blob = new Blob([code], { type: "text/x-python" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(CURRENT_WF.name || "workflow").replace(/[^\w.-]+/g, "_")}.py`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Python exported");
}

function wfStudioGraphToolbarHtml() {
  const snapOn = WF_SNAP_ENABLED !== false;
  const snapSize = wfGridSnapSize();
  const hasArrange = WF_SELECTED_NODES.size >= 2;
  const snapOpts = [8, 12, 16, 24, 32].map(s =>
    `<option value="${s}" ${snapSize === s ? "selected" : ""}>${s}px</option>`
  ).join("");
  const alignBtns = [
    ["left", "L"], ["center-h", "CX"], ["right", "R"],
    ["top", "T"], ["middle", "CY"], ["bottom", "B"],
    ["distribute-h", "DX"], ["distribute-v", "DY"],
  ].map(([m, l]) =>
    `<button type="button" class="secondary studio-tb-btn" data-wf-align="${escapeHtml(m)}" ${hasArrange ? "" : "disabled"} title="${hasArrange ? escapeHtml(WF_ALIGN_TITLES[m] || m) : "Select 2+ nodes to arrange"}">${escapeHtml(l)}</button>`
  ).join("");
  const arrangeHint = hasArrange ? "" : `<span class="wf-arrange-empty studio-tb-hint" title="Select 2+ nodes">Arrange needs 2+</span>`;
  const selOn = WF_CANVAS_MODE === "select" ? " studio-tb-toggle-on" : "";
  const panOn = WF_CANVAS_MODE === "pan" ? " studio-tb-toggle-on" : "";
  return `<div class="studio-grouped-toolbar" id="studio-graph-toolbar" data-studio-toolbar="graph">
    <div class="studio-tb-group" data-studio-group="select">
      <span class="studio-tb-caption">Select</span>
      <div class="studio-tb-items">
        <button type="button" class="secondary studio-tb-btn${selOn}" id="studio-tb-select" title="Select mode">Select</button>
        <button type="button" class="secondary studio-tb-btn${panOn}" id="studio-tb-pan" title="Pan mode">Pan</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="snap">
      <span class="studio-tb-caption">Snap</span>
      <div class="studio-tb-items">
        <button type="button" class="secondary studio-tb-btn${snapOn ? " studio-tb-toggle-on" : ""}" id="studio-tb-snap" title="Grid snap">${snapOn ? "Grid on" : "Grid off"}</button>
        <select id="studio-tb-grid-size" class="studio-tb-select" title="Grid size">${snapOpts}</select>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="view">
      <span class="studio-tb-caption">View</span>
      <div class="studio-tb-items">
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-toggle-bubbles" title="Toggle comment bubbles">Bubbles</button>
        <button type="button" class="secondary studio-tb-btn${WF_CODE_LABELS ? " studio-tb-toggle-on" : ""}" id="studio-tb-code-labels" title="Show code-with-X signatures on nodes" aria-pressed="${WF_CODE_LABELS}">${WF_CODE_LABELS ? "Code labels on" : "Code labels off"}</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="arrange">
      <span class="studio-tb-caption">Arrange</span>
      <div class="studio-tb-items">${alignBtns}${arrangeHint}
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-straighten-wires" title="Straighten selected wires">Straighten</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-tidy" title="Tidy layout">Tidy</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="run">
      <span class="studio-tb-caption">Run</span>
      <div class="studio-tb-items">
        <button type="button" class="primary studio-tb-btn" id="studio-tb-play">Play</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-step">Step</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-stop">Stop</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="build">
      <span class="studio-tb-caption">Build</span>
      <div class="studio-tb-items">
        <button type="button" class="primary studio-tb-btn" id="studio-tb-run" title="Play Blueprint in Preview (in-browser)">Run</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-run-python" title="Convert the Blueprint to Python and run it on this machine">Run as Python</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-cpp" title="Export experimental C++ scaffold (TODOs — not a full compiler)">Export C++ scaffold</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-split" title="${WF_SPLIT_VIEW ? "Hide the code pane" : "Show the code pane beside the Blueprint"}" aria-pressed="${WF_SPLIT_VIEW}">${WF_SPLIT_VIEW ? "Hide code" : "Show code"}</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-export">Export</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-vibecode">Vibecode</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-import" title="Import Python source into graph">Import Python→graph</button>
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-library" title="Show shortcuts to other Waypoint areas" aria-expanded="false">App links</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="quests" data-studio-pinned="1">
      <span class="studio-tb-caption">Quests</span>
      <div class="studio-tb-items">
        <button type="button" class="secondary studio-tb-btn" id="studio-tb-quests" data-studio-action="quests" title="Open Blueprint quests">Quest</button>
        ${typeof blueprintQuestIsActive === "function" && blueprintQuestIsActive()
          ? `<button type="button" class="primary studio-tb-btn" id="studio-tb-grade-quest" data-studio-action="grade-quest" title="Run quest fixtures">Grade</button>`
          : ""}
      </div>
    </div>
    <div class="studio-tb-group studio-tb-md-group" data-studio-group="markdown" data-studio-pinned="1">
      <span class="studio-tb-caption">Markdown</span>
      <div class="studio-tb-items">
        <button type="button" class="secondary studio-tb-btn studio-tb-md-btn" id="studio-tb-export-md" data-studio-action="export-md" title="Export blueprint graph as Markdown">Export .md</button>
        <button type="button" class="secondary studio-tb-btn studio-tb-md-btn" id="studio-tb-import-md" data-studio-action="import-md" title="Import blueprint graph from Markdown">Import .md</button>
      </div>
    </div>
    <button type="button" class="secondary studio-tb-overflow" id="studio-tb-more" title="More tools" hidden>⋯</button>
    ${wfBlueprintMilestonesStripHtml()}
    <div class="studio-tb-overflow-menu wf-context-menu" id="studio-tb-overflow-menu" hidden></div>
  </div>`;
}

function wireStudioToolbarOverflow(toolbarId) {
  const bar = document.getElementById(toolbarId);
  if (!bar || bar._overflowWired) return;
  bar._overflowWired = true;
  const moreBtn = bar.querySelector(".studio-tb-overflow");
  const menu = bar.querySelector(".studio-tb-overflow-menu");
  if (!moreBtn || !menu) return;
  const relayout = () => {
    bar.querySelectorAll(".studio-tb-group.studio-tb-overflowed").forEach(g => {
      g.classList.remove("studio-tb-overflowed");
      g.style.display = "";
    });
    menu.innerHTML = "";
    menu.hidden = true;
    moreBtn.hidden = true;
    const groups = [...bar.querySelectorAll(".studio-tb-group")];
    const pinned = groups.filter(g => g.dataset.studioPinned === "1");
    const unpinned = groups.filter(g => g.dataset.studioPinned !== "1");
    const pinnedWidth = pinned.reduce((w, g) => w + g.offsetWidth + 1, 0);
    const avail = bar.clientWidth - (moreBtn.offsetWidth || 28) - 8 - pinnedWidth;
    let used = 0;
    let overflowed = false;
    unpinned.forEach(g => {
      if (!overflowed) {
        used += g.offsetWidth + 1;
        if (used > avail && unpinned.indexOf(g) > 0) overflowed = true;
      }
      if (overflowed) {
        g.classList.add("studio-tb-overflowed");
        g.style.display = "none";
        const clone = g.cloneNode(true);
        clone.style.display = "";
        clone.classList.remove("studio-tb-overflowed");
        clone.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        menu.appendChild(clone);
      }
    });
    if (overflowed) {
      moreBtn.hidden = false;
      wireStudioToolbarOverflowMenu(bar, menu);
    }
  };
  moreBtn.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) wireStudioToolbarOverflowMenu(bar, menu);
  };
  document.addEventListener("mousedown", e => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== moreBtn) menu.hidden = true;
  });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => relayout());
    ro.observe(bar);
  }
  relayout();
}

function wireStudioToolbarOverflowMenu(bar, menu) {
  menu.querySelectorAll("button[data-wf-align]").forEach(btn => {
    btn.onclick = () => { bar.querySelector(`[data-wf-align="${btn.dataset.wfAlign}"]`)?.click(); menu.hidden = true; };
  });
  menu.querySelectorAll("button[data-uie-align]").forEach(btn => {
    btn.onclick = () => { bar.querySelector(`[data-uie-align="${btn.dataset.uieAlign}"]`)?.click(); menu.hidden = true; };
  });
  menu.querySelectorAll("button[data-uie-z]").forEach(btn => {
    btn.onclick = () => { bar.querySelector(`[data-uie-z="${btn.dataset.uieZ}"]`)?.click(); menu.hidden = true; };
  });
  menu.querySelectorAll("button[data-studio-action]").forEach(btn => {
    const action = btn.dataset.studioAction;
    btn.onclick = () => {
      bar.querySelector(`button[data-studio-action="${action}"]`)?.click()
        || document.getElementById(`wf-${action}`)?.click()
        || document.getElementById(`studio-tb-${action}`)?.click();
      menu.hidden = true;
    };
  });
  menu.querySelectorAll("button").forEach(btn => {
    if (btn.dataset.wfAlign || btn.dataset.uieAlign || btn.dataset.uieZ || btn.dataset.studioAction) return;
    const label = (btn.textContent || "").trim();
    const src = [...bar.querySelectorAll("button")].find(b => (b.textContent || "").trim() === label && b.id);
    if (!src?.id) return;
    const nid = src.id;
    btn.onclick = () => { document.getElementById(nid)?.click(); menu.hidden = true; };
  });
  menu.querySelectorAll("select").forEach(sel => {
    const key = sel.id?.includes("grid") ? "grid-size" : "device";
    sel.onchange = () => {
      const mainSel = bar.querySelector(`select[id*="${key}"]`);
      if (mainSel && mainSel !== sel) { mainSel.value = sel.value; mainSel.dispatchEvent(new Event("change")); }
      menu.hidden = true;
    };
  });
}

async function wireStudioGraphToolbar() {
  const bar = document.getElementById("studio-graph-toolbar");
  if (!bar) return;
  document.getElementById("studio-tb-select")?.addEventListener("click", () => {
    WF_CANVAS_MODE = "select";
    renderAutomationStudioView();
  });
  document.getElementById("studio-tb-pan")?.addEventListener("click", () => {
    WF_CANVAS_MODE = "pan";
    renderAutomationStudioView();
  });
  document.getElementById("studio-tb-snap")?.addEventListener("click", () => {
    WF_SNAP_ENABLED = !WF_SNAP_ENABLED;
    renderAutomationStudioView();
  });
  document.getElementById("studio-tb-code-labels")?.addEventListener("click", () => {
    WF_CODE_LABELS = !WF_CODE_LABELS;
    localStorage.setItem("wfCodeLabels", WF_CODE_LABELS ? "1" : "0");
    renderAutomationStudioView();
  });
  document.getElementById("studio-tb-grid-size")?.addEventListener("change", e => {
    wfMeta().gridSnap = Number(e.target.value) || WF_GRID_SNAP;
    renderAutomationStudioView();
  });
  bar.querySelectorAll("[data-wf-align]").forEach(btn => {
    btn.addEventListener("click", () => { if (!btn.disabled) wfAlignSelection(btn.dataset.wfAlign); });
  });
  document.getElementById("studio-tb-tidy")?.addEventListener("click", () => wfTidyLayout());
  document.getElementById("studio-tb-play")?.addEventListener("click", () => wfSimPlay(false));
  document.getElementById("studio-tb-step")?.addEventListener("click", () => wfSimStep());
  document.getElementById("studio-tb-stop")?.addEventListener("click", () => wfSimStop());
  const ensureSaved = async () => {
    const body = { name: CURRENT_WF.name, graph: wfGraphPayload() };
    if (CURRENT_WF.id) {
      await api(`/api/workflows/${CURRENT_WF.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      const created = await api("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      CURRENT_WF.id = created.id;
    }
  };
  document.getElementById("studio-tb-run")?.addEventListener("click", () => wfPlayBlueprintInPreview());
  document.getElementById("studio-tb-run-python")?.addEventListener("click", () => wfRunGeneratedPython());
  document.getElementById("studio-tb-cpp")?.addEventListener("click", () => wfConvertToCpp());
  document.getElementById("studio-tb-split")?.addEventListener("click", () => wfToggleSplitView());
  document.getElementById("studio-tb-export")?.addEventListener("click", () => studioExportPython());
  document.getElementById("studio-tb-vibecode")?.addEventListener("click", () => wfVibecodeFlow());
  document.getElementById("studio-tb-import")?.addEventListener("click", () => wfImportPythonFlow());
  document.getElementById("studio-tb-export-md")?.addEventListener("click", () => wfExportMarkdownFlow());
  document.getElementById("studio-tb-import-md")?.addEventListener("click", () => wfImportMarkdownFlow());
  document.getElementById("studio-tb-library")?.addEventListener("click", (event) => {
    const panel = document.getElementById("wf-library-panel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
    event.currentTarget.title = panel.hidden ? "Show shortcuts to other Waypoint areas" : "Hide shortcuts to other Waypoint areas";
    if (!panel.hidden) panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  wireStudioToolbarOverflow("studio-graph-toolbar");
  wfApplyEndpointGuards();
  wfCheckBlueprintNodeMilestone();
  wfRefreshBlueprintMilestonesStrip();
  if (typeof blueprintQuestWireToolbar === "function") blueprintQuestWireToolbar();
}

function wireStudioToolbar() {
  if (STUDIO_TAB === "graph") wireStudioGraphToolbar();
  else if (STUDIO_TAB === "designer" && typeof uieWireStudioToolbar === "function") uieWireStudioToolbar();
}

async function renderAutomationStudioView() {
  const shell = document.querySelector(".app-shell");
  const studio = document.getElementById("automation-studio");
  if (!AUTOMATION_STUDIO_OPEN) {
    if (typeof uieStopBlueprintPreview === "function") uieStopBlueprintPreview({ silent: true });
    WF_GRAPH_WIRED = false;
    wfClearSelectionState();
    document.body.classList.remove("automation-studio-open");
    shell.style.display = "";
    studio.style.display = "none";
    CUSTOM_APP_VIEW = false;
    window.CUSTOM_APP_VIEW = false;
    CUSTOM_APP_INFO = null;
    return;
  }
  if (STUDIO_TAB !== "preview" && typeof uieStopBlueprintPreview === "function") {
    uieStopBlueprintPreview({ silent: true });
  }
  document.body.classList.add("automation-studio-open");
  if (window.PENDING_CUSTOM_APP) {
    const wfId = window.PENDING_CUSTOM_APP;
    window.PENDING_CUSTOM_APP = null;
    CUSTOM_APP_VIEW = true;
    STUDIO_TAB = "preview";
    try {
      await wfLoadWorkflowById(wfId);
      const app = await wfFindAppForWorkflow(wfId);
      CUSTOM_APP_INFO = {
        name: app?.name || CURRENT_WF.name || "App",
        emoji: app?.emoji || (CURRENT_WF.ui || {}).appEmoji || "📱",
        accent: (CURRENT_WF.ui || {}).appAccent || APP_PUBLISH_ACCENTS[0],
        appId: app?.id || (CURRENT_WF.ui || {}).publishedAppId || null,
      };
    } catch (_) {
      CUSTOM_APP_INFO = { name: CURRENT_WF.name || "App", emoji: "📱", accent: APP_PUBLISH_ACCENTS[0], appId: null };
    }
  }
  window.CUSTOM_APP_VIEW = CUSTOM_APP_VIEW;
  shell.style.display = "none";
  studio.style.display = "block";

  if (CUSTOM_APP_VIEW) {
    const info = CUSTOM_APP_INFO || {};
    const accent = info.accent || APP_PUBLISH_ACCENTS[0];
    const previewBody = typeof uieRenderPreview === "function" ? uieRenderPreview(true) : "";
    studio.innerHTML = `${wfPublishModalStyles()}
      <div class="automation-studio-shell custom-app-shell" style="--custom-app-accent:${escapeHtml(accent)};">
        <div class="custom-app-bar">
          <span class="custom-app-title">${escapeHtml(info.emoji || "📱")} ${escapeHtml(info.name || "App")}</span>
          <button type="button" class="secondary" id="custom-app-home" title="Back to launcher">⌂</button>
          <button type="button" class="primary" id="custom-app-edit">Edit in Studio</button>
        </div>
        <div class="studio-panel" id="studio-preview-panel">${previewBody}</div>
      </div>`;
    const closeStudio = () => {
      CUSTOM_APP_VIEW = false;
      window.CUSTOM_APP_VIEW = false;
      CUSTOM_APP_INFO = null;
      AUTOMATION_STUDIO_OPEN = false;
      renderAutomationStudioView();
    };
    document.getElementById("custom-app-home").onclick = closeStudio;
    document.getElementById("custom-app-edit").onclick = () => {
      CUSTOM_APP_VIEW = false;
      window.CUSTOM_APP_VIEW = false;
      STUDIO_TAB = "designer";
      renderAutomationStudioView();
    };
    if (typeof uieWirePreview === "function") uieWirePreview();
    if (typeof uiePlayBlueprintInPreview === "function") uiePlayBlueprintInPreview();
    return;
  }

  const graphBody = await renderAutomation();
  const designerBody = STUDIO_TAB === "designer" && typeof uieRenderDesigner === "function" ? uieRenderDesigner() : "";
  const previewBody = STUDIO_TAB === "preview" && typeof uieRenderPreview === "function" ? uieRenderPreview() : "";
  const bindingsBody = STUDIO_TAB === "bindings" && typeof uieRenderBindingsConsole === "function" ? uieRenderBindingsConsole() : "";
  if (STUDIO_TAB === "cart") await wfLoadCartItems();
  const cartBody = STUDIO_TAB === "cart" ? wfRenderCartPanel() : "";
  studio.innerHTML = `
    <style>
      .automation-studio-shell { display:flex; flex-direction:column; height:100dvh; background:var(--bg-shell); }
      .automation-studio-bar { display:flex; gap:10px; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
      .studio-title { font-weight:700; font-size:14px; }
      .studio-title span { font-weight:400; font-size:11px; color:var(--ink-muted); margin-left:6px; }
      .studio-mode-tabs { display:flex; gap:4px; margin:0 auto; }
      .studio-mode-tab.studio-tab-active { background:var(--accent); color:#fff; border-color:var(--accent); }
      .studio-panel { flex:1; min-height:0; overflow:auto; }
      .studio-panel[hidden] { display:none !important; }
      .studio-grouped-toolbar { display:flex; align-items:flex-end; gap:0; padding:3px 8px; border-bottom:1px solid var(--border); font-size:10px; flex-wrap:nowrap; overflow:hidden; position:relative; background:var(--bg-shell); }
      .studio-tb-group { display:flex; flex-direction:column; gap:1px; padding:0 7px; border-right:1px solid color-mix(in srgb, var(--border) 55%, transparent); flex-shrink:0; }
      .studio-tb-caption { font-size:8px; color:var(--ink-muted); text-transform:uppercase; letter-spacing:.05em; line-height:1.1; user-select:none; }
      .studio-tb-items { display:flex; gap:2px; align-items:center; flex-wrap:nowrap; }
      .studio-tb-btn { padding:1px 6px !important; font-size:10px !important; line-height:1.4; }
      .studio-tb-btn.studio-tb-toggle-on { background:color-mix(in srgb, var(--accent) 22%, transparent); border-color:var(--accent); }
      .studio-tb-select { font-size:10px; padding:1px 2px; max-width:52px; }
      .studio-tb-overflow { margin-left:auto; padding:1px 8px !important; font-size:14px !important; flex-shrink:0; }
      .studio-tb-overflow-menu { position:absolute; right:6px; top:100%; z-index:200; min-width:180px; padding:4px; }
      .studio-tb-overflow-menu .studio-tb-group { border-right:none; border-bottom:1px solid var(--border); padding:4px 0; }
      .studio-tb-overflow-menu .studio-tb-group:last-child { border-bottom:none; }
      .studio-tb-md-group { border-right:1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); }
      .studio-tb-md-btn { font-weight:600; }
    </style>
    <div class="automation-studio-shell">
      <div class="automation-studio-bar">
        <button type="button" class="secondary nav-history-btn" id="studio-back" title="Back to Home" aria-label="Back to Home" style="padding:2px 10px;font-size:11px;">← Home</button>
        <div class="studio-title">Automation Studio <span>Blueprint + UI Designer</span></div>
        <div class="studio-mode-tabs">
          ${studioTabBtn("graph", "Graph")}
          ${studioTabBtn("designer", "Designer")}
          ${studioTabBtn("preview", "Preview")}
          ${studioTabBtn("bindings", "Bindings")}
          ${studioTabBtn("cart", "Cart")}
        </div>
        <button class="secondary" id="studio-pin-app" type="button">Publish App</button>
        <button class="secondary" id="exit-automation-studio" type="button" title="Close Automation Studio">Done</button>
      </div>
      ${STUDIO_TAB === "graph" ? wfStudioGraphToolbarHtml() : ""}
      ${STUDIO_TAB === "designer" && typeof uieStudioDesignerToolbarHtml === "function" ? uieStudioDesignerToolbarHtml() : ""}
      <div class="studio-panel" id="studio-graph-panel" ${STUDIO_TAB !== "graph" ? "hidden" : ""}>${graphBody}</div>
      <div class="studio-panel" id="studio-designer-panel" ${STUDIO_TAB !== "designer" ? "hidden" : ""}>${designerBody}</div>
      <div class="studio-panel" id="studio-preview-panel" ${STUDIO_TAB !== "preview" ? "hidden" : ""}>${previewBody}</div>
      <div class="studio-panel" id="studio-bindings-panel" ${STUDIO_TAB !== "bindings" ? "hidden" : ""}>${bindingsBody}</div>
      <div class="studio-panel" id="studio-cart-panel" ${STUDIO_TAB !== "cart" ? "hidden" : ""}>${cartBody}</div>
    </div>`;
  document.querySelectorAll("[data-studio-tab]").forEach(btn => {
    btn.onclick = () => {
      if (STUDIO_TAB === "graph" && btn.dataset.studioTab !== "graph") WF_GRAPH_WIRED = false;
      if (STUDIO_TAB === "preview" && btn.dataset.studioTab !== "preview"
          && typeof uieStopBlueprintPreview === "function") {
        uieStopBlueprintPreview({ silent: true });
      }
      STUDIO_TAB = btn.dataset.studioTab;
      renderAutomationStudioView();
    };
  });
  document.getElementById("studio-pin-app").onclick = () => wfOpenPublishModal();
  const studioExit = () => { AUTOMATION_STUDIO_OPEN = false; renderAutomationStudioView(); };
  document.getElementById("exit-automation-studio").onclick = studioExit;
  const stBack = document.getElementById("studio-back");
  if (stBack) stBack.onclick = async () => {
    AUTOMATION_STUDIO_OPEN = false;
    await renderAutomationStudioView();
    if (typeof goToTab === "function" && typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB !== "Home") {
      await goToTab("Home");
    }
  };
  wireStudioToolbar();
  if (STUDIO_TAB === "graph") {
    wireAutomation();
    if (typeof blueprintQuestWireStudio === "function") blueprintQuestWireStudio();
  }
  else if (STUDIO_TAB === "designer" && typeof uieWireDesigner === "function") uieWireDesigner();
  else if (STUDIO_TAB === "preview" && typeof uieWirePreview === "function") uieWirePreview();
  else if (STUDIO_TAB === "bindings" && typeof uieWireBindingsConsole === "function") uieWireBindingsConsole();
  else if (STUDIO_TAB === "cart") wireCartOrchestrator();
}

if (typeof window !== "undefined") {
  window.wfNodeFirePulse = wfNodeFirePulse;
  window.wfSanitizeGraphForEmit = wfSanitizeGraphForEmit;
  window.wfParseBuyCommand = wfParseBuyCommand;
}
