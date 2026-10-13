// --- UI Designer (UMG-style) for Automation Studio -----------------------------------------------

const UIE_GRID = 8;
const UIE_DEVICES = {
  desktop: { label: "Desktop", width: 1024, height: 768 },
  phone: { label: "Phone", width: 375, height: 667 },
  tablet: { label: "Tablet", width: 768, height: 1024 },
};

const UIE_WAYPOINT_WIDGETS = [
  { type: "wp_add_task", label: "Add Task", w: 140, h: 32 },
  { type: "wp_log_pulse", label: "Log Pulse", w: 140, h: 32 },
  { type: "wp_open_app", label: "Open App", w: 140, h: 32 },
  { type: "wp_run_blueprint", label: "Run Blueprint", w: 160, h: 32 },
  { type: "wp_data_list", label: "Data List", w: 220, h: 160 },
];

const UIE_DATA_FIELD_TYPES = ["text", "number", "checkbox"];

let UIE_WORKFLOW_LIST = [];

const UIE_WIDGET_TYPES = [
  { type: "button", label: "Button", w: 120, h: 32 },
  { type: "label", label: "Label", w: 120, h: 24 },
  { type: "entry", label: "Entry", w: 160, h: 28 },
  { type: "scale", label: "Scale", w: 160, h: 32 },
  { type: "checkbutton", label: "Checkbutton", w: 140, h: 24 },
  { type: "combobox", label: "Combobox", w: 140, h: 28 },
  { type: "progressbar", label: "Progressbar", w: 160, h: 20 },
  { type: "frame", label: "Frame", w: 200, h: 120 },
  { type: "canvas", label: "Canvas", w: 200, h: 120 },
  { type: "image", label: "Image", w: 80, h: 80 },
];

const UIE_WIDGET_EVENTS = {
  button: ["clicked"],
  entry: ["changed", "return_pressed"],
  scale: ["changed"],
  checkbutton: ["toggled"],
  combobox: ["selected"],
  label: [],
  progressbar: [],
  frame: [],
  canvas: [],
  image: [],
};

UIE_WAYPOINT_WIDGETS.forEach(w => { UIE_WIDGET_EVENTS[w.type] = []; });

const UIE_BEHAVIOR_EVENTS = { dropZone: ["dropped"], detectHover: ["hover_enter", "hover_exit"] };

const UIE_ASSETS = {
  paper: { label: "Paper", css: "linear-gradient(135deg,#f5f0e6 0%,#e8dcc8 100%)" },
  carbon: { label: "Carbon", css: "repeating-linear-gradient(45deg,#1a1a1a 0,#1a1a1a 2px,#252525 2px,#252525 4px)" },
  brushed_metal: { label: "Brushed Metal", css: "linear-gradient(90deg,#666 0%,#aaa 25%,#666 50%,#aaa 75%,#666 100%)" },
  dots: { label: "Dots", css: "radial-gradient(circle,#555 1px,transparent 1px),#2a2a2a", size: "10px 10px" },
  stripes: { label: "Stripes", css: "repeating-linear-gradient(0deg,#3a3a3a,#3a3a3a 3px,#4a4a4a 3px,#4a4a4a 6px)" },
  glow_blue: { label: "Glow Blue", css: "radial-gradient(ellipse at center,#1e5a8a 0%,#0a1628 70%)" },
  glow_purple: { label: "Glow Purple", css: "radial-gradient(ellipse at center,#5a2d8a 0%,#1a0a28 70%)" },
  sunset: { label: "Sunset", css: "linear-gradient(180deg,#ff6b35 0%,#f7c59f 45%,#2e294e 100%)" },
  ocean: { label: "Ocean", css: "linear-gradient(180deg,#006994 0%,#001f3f 100%)" },
  forest: { label: "Forest", css: "linear-gradient(180deg,#3d6b1e 0%,#1a2f0d 100%)" },
  marble: { label: "Marble", css: "linear-gradient(135deg,#ececec 0%,#c8c8c8 50%,#ececec 100%)" },
  slate: { label: "Slate", css: "linear-gradient(180deg,#4a5568 0%,#2d3748 100%)" },
};

const UIE_BG_FIT_MODES = ["cover", "contain", "fill", "tile"];
const UIE_BG_POSITIONS = [
  { id: "top left", label: "↖" }, { id: "top center", label: "↑" }, { id: "top right", label: "↗" },
  { id: "center left", label: "←" }, { id: "center", label: "●" }, { id: "center right", label: "→" },
  { id: "bottom left", label: "↙" }, { id: "bottom center", label: "↓" }, { id: "bottom right", label: "↘" },
];
const UIE_IMAGE_FIT_MODES = ["cover", "contain", "fill"];
const UIE_IMAGE_FILTER_PRESETS = {
  grayscale: { brightness: 1, contrast: 1, saturate: 0, hueRotate: 0, sepia: 0 },
  sepia: { brightness: 1, contrast: 1, saturate: 1, hueRotate: 0, sepia: 1 },
  bright: { brightness: 1.35, contrast: 1.05, saturate: 1, hueRotate: 0, sepia: 0 },
};

function uieWorkflowEntityId() {
  const id = CURRENT_WF && CURRENT_WF.id;
  return id != null && id !== "" ? Number(id) || 0 : 0;
}

function uieEnsureAssets() {
  if (!CURRENT_WF.ui) CURRENT_WF.ui = { widgets: [], device: "phone" };
  if (!Array.isArray(CURRENT_WF.ui.assets)) CURRENT_WF.ui.assets = [];
  return CURRENT_WF.ui.assets;
}

function uieAssetUrlFromId(id) {
  return `/api/attachments/${id}/file`;
}

function uieRegisterAsset(id, name, url) {
  const assets = uieEnsureAssets();
  const urlStr = url || uieAssetUrlFromId(id);
  const existing = assets.find(a => a.id === id || a.url === urlStr);
  if (existing) {
    existing.id = id;
    existing.url = urlStr;
    if (name) existing.name = name;
    return existing;
  }
  const entry = { id, name: name || `asset_${id}`, url: urlStr };
  assets.push(entry);
  return entry;
}

function uieUnregisterAsset(id) {
  const assets = uieEnsureAssets();
  const idx = assets.findIndex(a => a.id === id);
  if (idx >= 0) assets.splice(idx, 1);
}

function uieFindAssetByUrl(url) {
  return uieEnsureAssets().find(a => a.url === url) || null;
}

async function uieUploadAttachment(file, entityType) {
  const form = new FormData();
  form.append("file", file);
  form.append("entity_type", entityType || "ui_asset");
  form.append("entity_id", String(uieWorkflowEntityId()));
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const uploaded = await res.json();
  uieRegisterAsset(uploaded.id, uploaded.filename || file.name, uieAssetUrlFromId(uploaded.id));
  return uploaded;
}

async function uieDeleteAttachment(id) {
  const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
  uieUnregisterAsset(id);
}

async function uieSyncUploadedAssetsFromServer() {
  const wfId = uieWorkflowEntityId();
  if (!wfId) return uieEnsureAssets();
  try {
    const res = await fetch(`/api/attachments?entity_type=ui_asset&entity_id=${wfId}`);
    if (!res.ok) return uieEnsureAssets();
    const rows = await res.json();
    (rows || []).forEach(row => {
      uieRegisterAsset(row.id, row.filename || `asset_${row.id}`, uieAssetUrlFromId(row.id));
    });
  } catch (_) { /* offline / unsaved workflow */ }
  return uieEnsureAssets();
}

function uieDefaultBgTexture() {
  return { fit: "cover", position: "center", opacity: 1, tint: "", tintStrength: 0.5, blur: 0 };
}

function uieEnsureBgTexture(p) {
  if (!p.bgTexture || typeof p.bgTexture !== "object") p.bgTexture = uieDefaultBgTexture();
  return p.bgTexture;
}

function uieBgAssetBuiltinKey(bgAsset) {
  if (!bgAsset) return "";
  if (typeof bgAsset === "string") return UIE_ASSETS[bgAsset] ? bgAsset : "";
  if (typeof bgAsset === "object" && bgAsset.builtin && UIE_ASSETS[bgAsset.builtin]) return bgAsset.builtin;
  return "";
}

function uieBgAssetUploadUrl(bgAsset) {
  if (!bgAsset) return "";
  if (typeof bgAsset === "object" && bgAsset.assetUrl) return bgAsset.assetUrl;
  if (typeof bgAsset === "string" && bgAsset.startsWith("/api/attachments/")) return bgAsset;
  return "";
}

function uieBgAssetSelectValue(bgAsset) {
  const key = uieBgAssetBuiltinKey(bgAsset);
  if (key) return key;
  if (uieBgAssetUploadUrl(bgAsset)) return "__uploaded__";
  return "";
}

function uieParseBgAsset(bgAsset) {
  const key = uieBgAssetBuiltinKey(bgAsset);
  if (key) return { kind: "builtin", key, asset: UIE_ASSETS[key] };
  const url = uieBgAssetUploadUrl(bgAsset);
  if (url) return { kind: "upload", url };
  return null;
}

function uieBgPositionCss(position) {
  const map = {
    "top left": "left top", "top center": "center top", "top right": "right top",
    "center left": "left center", center: "center center", "center right": "right center",
    "bottom left": "left bottom", "bottom center": "center bottom", "bottom right": "right bottom",
  };
  return map[position] || position || "center center";
}

function uieBgTextureCss(texture, imageUrl, builtinAsset) {
  const tex = { ...uieDefaultBgTexture(), ...(texture || {}) };
  const parts = [];
  if (builtinAsset) {
    parts.push(`background:${builtinAsset.css}`);
    if (builtinAsset.size) parts.push(`background-size:${builtinAsset.size}`);
    if (tex.fit === "tile" && builtinAsset.size) parts.push(`background-repeat:repeat`);
    else if (tex.fit !== "tile") parts.push("background-repeat:no-repeat");
    if (tex.fit !== "tile") {
      const size = tex.fit === "fill" ? "100% 100%" : tex.fit === "contain" ? "contain" : "cover";
      parts.push(`background-size:${size}`);
    }
    parts.push(`background-position:${uieBgPositionCss(tex.position)}`);
  } else if (imageUrl) {
    parts.push(`background-image:url("${imageUrl.replace(/"/g, "%22")}")`);
    if (tex.fit === "tile") {
      parts.push("background-repeat:repeat");
      parts.push("background-size:auto");
    } else {
      parts.push("background-repeat:no-repeat");
      const size = tex.fit === "fill" ? "100% 100%" : tex.fit === "contain" ? "contain" : "cover";
      parts.push(`background-size:${size}`);
    }
    parts.push(`background-position:${uieBgPositionCss(tex.position)}`);
  }
  if (tex.opacity != null && tex.opacity !== 1) parts.push(`opacity:${Number(tex.opacity)}`);
  if (tex.blur) parts.push(`filter:blur(${Number(tex.blur)}px)`);
  if (tex.tint && Number(tex.tintStrength) > 0) {
    const strength = Math.min(1, Math.max(0, Number(tex.tintStrength)));
    parts.push(`box-shadow:inset 0 0 0 9999px color-mix(in srgb, ${tex.tint} ${Math.round(strength * 100)}%, transparent)`);
  }
  return parts;
}

function uieScreenBackgroundCss(screen) {
  const bg = screen && screen.background;
  if (!bg) return "";
  const tex = { fit: bg.fit || "cover", position: "center", tint: bg.tint || "", tintStrength: bg.tint ? 0.35 : 0 };
  if (bg.builtin && UIE_ASSETS[bg.builtin]) {
    return uieBgTextureCss(tex, null, UIE_ASSETS[bg.builtin]).join(";");
  }
  if (bg.assetUrl) return uieBgTextureCss(tex, bg.assetUrl, null).join(";");
  return "";
}

function uieScreenBackgroundLayerHtml(screen) {
  const style = uieScreenBackgroundCss(screen);
  if (!style) return "";
  return `<div class="uie-screen-bg" style="position:absolute;inset:0;z-index:0;pointer-events:none;${style}"></div>`;
}

function uieImageFitStyle(fit) {
  const f = fit || "cover";
  if (f === "fill") return "width:100%;height:100%;object-fit:fill";
  if (f === "contain") return "width:100%;height:100%;object-fit:contain";
  return "width:100%;height:100%;object-fit:cover";
}

function uieImageCornerRadiusCss(w) {
  const effects = uieEffectiveEffects(w);
  const cr = effects.find(fx => fx && fx.enabled !== false && fx.type === "cornerRadius");
  if (!cr) return "";
  const p = cr.params || {};
  const tl = Number(p.tl) || 0, tr = Number(p.tr) || 0, br = Number(p.br) || 0, bl = Number(p.bl) || 0;
  return `border-radius:${tl}px ${tr}px ${br}px ${bl}px;overflow:hidden;`;
}

function uieRenderImageWidgetInner(w, p, esc) {
  const src = p.imageSrc || "";
  const alt = p.imageAlt || p.name || p.text || "Image";
  const fit = p.imageFit || "cover";
  const clip = uieImageCornerRadiusCss(w);
  if (src) {
    return `<img class="uie-w-image-img" src="${esc(src)}" alt="${esc(alt)}" title="${esc(alt)}" style="display:block;${uieImageFitStyle(fit)};${clip}">`;
  }
  return `<div class="uie-w-image" style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;${clip}">${esc(p.text || "Image")}</div>`;
}

function uieEnsureImageFilterEffect(w, presetKey) {
  const preset = UIE_IMAGE_FILTER_PRESETS[presetKey];
  if (!preset) return;
  const effects = uieEnsureEffects(w);
  let fx = effects.find(e => e.type === "colorFilter");
  if (!fx) {
    fx = { id: uieNextEffectId(), type: "colorFilter", enabled: true, order: effects.length, params: { ...UIE_EFFECT_TYPES.find(t => t.type === "colorFilter").defaults } };
    effects.push(fx);
  }
  fx.enabled = true;
  fx.params = { ...(fx.params || {}), ...preset };
}

function uieEmptyStub(message, hint) {
  const msg = escapeHtml(message);
  const sub = hint ? `<div class="uie-empty-hint">${escapeHtml(hint)}</div>` : "";
  return `<div class="uie-empty-stub"><div>${msg}</div>${sub}</div>`;
}

function uieImageUrlFieldHtml(label, propKey, value, w) {
  const url = value || "";
  const thumb = url
    ? `<img src="${escapeHtml(url)}" alt="" class="uie-asset-thumb" style="width:36px;height:36px;object-fit:cover;border-radius:3px;border:1px solid var(--border);">`
    : "";
  return `<div class="uie-inspector-row uie-image-url-row">
    <label>${escapeHtml(label)}</label>
    <span style="display:flex;gap:4px;align-items:center;flex:1;">
      <input type="text" data-uie-prop="${escapeHtml(propKey)}" value="${escapeHtml(url)}" placeholder="https://… or /api/attachments/…" style="flex:1;">
      <button type="button" class="secondary uie-upload-btn" data-uie-upload-prop="${escapeHtml(propKey)}" style="font-size:9px;white-space:nowrap;">Upload</button>
      ${thumb}
      ${url ? `<button type="button" class="secondary" data-uie-clear-prop="${escapeHtml(propKey)}" title="Clear" style="font-size:9px;padding:1px 5px;">✕</button>` : ""}
    </span>
  </div>`;
}

function uieBgTextureControlsHtml(w, p) {
  const tex = uieEnsureBgTexture(p);
  const parsed = uieParseBgAsset(p.bgAsset);
  if (!parsed) return "";
  const fitOpts = UIE_BG_FIT_MODES.map(f =>
    `<option value="${escapeHtml(f)}" ${tex.fit === f ? "selected" : ""}>${escapeHtml(f)}</option>`
  ).join("");
  const posBtns = UIE_BG_POSITIONS.map(pos =>
    `<button type="button" class="secondary${tex.position === pos.id ? " uie-active" : ""}" data-uie-bg-texture="position" data-uie-bg-pos="${escapeHtml(pos.id)}" title="${escapeHtml(pos.id)}">${escapeHtml(pos.label)}</button>`
  ).join("");
  return `
    <div class="uie-inspector-row"><label>Texture fit</label><select data-uie-bg-texture="fit">${fitOpts}</select></div>
    <div class="uie-inspector-row uie-row-span"><label>Texture position</label></div>
    <div class="uie-anchor-grid" style="margin-bottom:6px;">${posBtns}</div>
    <div class="uie-inspector-row"><label>Texture opacity</label><input type="range" min="0" max="1" step="0.05" data-uie-bg-texture="opacity" value="${Number(tex.opacity ?? 1)}"></div>
    <div class="uie-inspector-row"><label>Tint</label><input type="color" data-uie-bg-texture="tint" value="${escapeHtml(tex.tint && tex.tint.startsWith("#") ? tex.tint : "#000000")}"></div>
    <div class="uie-inspector-row"><label>Tint mix</label><input type="range" min="0" max="1" step="0.05" data-uie-bg-texture="tintStrength" value="${Number(tex.tintStrength ?? 0.5)}"></div>
    <div class="uie-inspector-row"><label>Texture blur</label><input type="number" min="0" max="48" data-uie-bg-texture="blur" value="${Number(tex.blur) || 0}"></div>`;
}

function uieUploadedAssetsGridHtml() {
  const assets = uieEnsureAssets();
  if (!assets.length) return uieEmptyStub("No uploaded images", "Use Upload to add images for widgets and backgrounds.");
  return `<div class="uie-uploaded-grid" id="uie-uploaded-grid">${assets.map(a => `
    <div class="uie-uploaded-item" draggable="true" data-uie-uploaded-asset="${a.id}" data-uie-uploaded-url="${escapeHtml(a.url)}" title="${escapeHtml(a.name)}">
      <img src="${escapeHtml(a.url)}" alt="">
      <input type="text" class="uie-uploaded-name" data-uie-asset-rename="${a.id}" value="${escapeHtml(a.name)}">
      <button type="button" class="secondary" data-uie-asset-del="${a.id}" title="Delete">×</button>
    </div>`).join("")}</div>`;
}

function uieInspectorScreenHtml() {
  const scr = uieActiveScreen();
  if (!scr) return uieEmptyStub("No screen selected", "Add a screen from the screen switcher.");
  const bg = scr.background || {};
  const assetOpts = Object.entries(UIE_ASSETS).map(([k, a]) =>
    `<option value="${escapeHtml(k)}" ${bg.builtin === k ? "selected" : ""}>${escapeHtml(a.label)}</option>`
  ).join("");
  const fitOpts = UIE_BG_FIT_MODES.map(f =>
    `<option value="${escapeHtml(f)}" ${(bg.fit || "cover") === f ? "selected" : ""}>${escapeHtml(f)}</option>`
  ).join("");
  const url = bg.assetUrl || "";
  const thumb = url ? `<img src="${escapeHtml(url)}" alt="" class="uie-asset-thumb" style="width:36px;height:36px;object-fit:cover;border-radius:3px;">` : "";
  return uieInspectorSection("Screen", `
    <div style="font-size:10px;color:var(--ink-muted);margin-bottom:6px;">${escapeHtml(scr.name)} (${escapeHtml(scr.id)})</div>
    <div class="uie-inspector-row"><label>Built-in</label><select data-uie-screen-bg="builtin"><option value="">—</option>${assetOpts}</select></div>
    <div class="uie-inspector-row"><label>Image URL</label><span style="display:flex;gap:4px;align-items:center;flex:1;">
      <input type="text" data-uie-screen-bg="assetUrl" value="${escapeHtml(url)}" placeholder="/api/attachments/…" style="flex:1;">
      <button type="button" class="secondary" data-uie-screen-bg-upload style="font-size:9px;">Upload</button>
      ${thumb}
      ${url ? `<button type="button" class="secondary" data-uie-screen-bg-clear title="Clear">✕</button>` : ""}
    </span></div>
    <div class="uie-inspector-row"><label>Fit</label><select data-uie-screen-bg="fit">${fitOpts}</select></div>
    <div class="uie-inspector-row"><label>Tint</label><input type="color" data-uie-screen-bg="tint" value="${escapeHtml(bg.tint && bg.tint.startsWith("#") ? bg.tint : "#000000")}"></div>
  `, false);
}

function uieApplyUploadedAssetToWidget(w, url, mode) {
  if (!w || !url) return;
  uieDesignerRecordUndo();
  w.props = w.props || {};
  if (mode === "image" || w.type === "image") {
    w.props.imageSrc = url;
  } else {
    w.props.bg = "";
    w.props.bgAsset = { assetUrl: url };
    uieEnsureBgTexture(w.props);
  }
}

function uieApplyUploadedAssetAtPoint(url, x, y) {
  if (!url) return;
  const w = uieAddWidget("image", x, y);
  w.props.imageSrc = url;
  w.width = 120;
  w.height = 120;
}

let UIE_SELECTED = null;
let UIE_SELECTED_IDS = [];
let UIE_PREVIEW_STATE = {};
let UIE_PREVIEW_LOG = [];
let UIE_PREVIEW_WIDGET_STATE = {};
let UIE_PREVIEW_TICK_HANDLES = [];
let UIE_PREVIEW_RUNNING = false;
let UIE_PLACE_ARMED = null;
let UIE_STATE_PREVIEW = null;
let UIE_PALETTE_TAB = "widgets";
let UIE_FOLDER_RENAME = null;
let UIE_BINDING_SEARCH = "";
let UIE_BINDINGS_OVERLAY = false;
let UIE_ISOLATE_MODE = false;
let UIE_CLIPBOARD = null;
let UIE_STYLE_CLIPBOARD = null;
let UIE_CANVAS_MODE = "select";
let UIE_INSPECTOR_CODE_TAB = "python";
let UIE_UNDO_STACK = [];
let UIE_REDO_STACK = [];
const UIE_UNDO_MAX = 40;
const UIE_SCROLL_PAD = 200;
let UIE_CANVAS_HOVER = false;

let UIE_SELECTED_STYLE_CLASS = null;
let UIE_PREVIEW_SCREEN_ID = null;
let UIE_RESPONSIVE_SCRUB = null;

const UIE_LAYOUT_MODES = [
  { id: "free", label: "Free" },
  { id: "vstack", label: "VStack" },
  { id: "hstack", label: "HStack" },
];

const UIE_STACK_ALIGNS = [
  { id: "start", label: "Start" },
  { id: "center", label: "Center" },
  { id: "end", label: "End" },
  { id: "stretch", label: "Stretch" },
];

const UIE_EFFECT_TYPES = [
  { type: "blur", label: "Blur", defaults: { radius: 8 } },
  { type: "dropShadow", label: "Drop Shadow", defaults: { color: "#00000080", x: 2, y: 2, blur: 8 } },
  { type: "glow", label: "Glow", defaults: { color: "#4a9eff", size: 12, intensity: 0.8 } },
  { type: "colorFilter", label: "Color Filter", defaults: { brightness: 1, contrast: 1, saturate: 1, hueRotate: 0 } },
  { type: "opacity", label: "Opacity", defaults: { value: 0.85 } },
  { type: "backdropBlur", label: "Backdrop Blur", defaults: { radius: 8, tint: "#00000040" } },
  { type: "cornerRadius", label: "Corner Radius", defaults: { tl: 8, tr: 8, br: 8, bl: 8, linked: true } },
  { type: "gradientFill", label: "Gradient Fill", defaults: { angle: 135, stops: [{ color: "#4a9eff", pos: 0 }, { color: "#1a1a2e", pos: 100 }] } },
  { type: "border", label: "Border", defaults: { width: 1, style: "solid", color: "#666" } },
  { type: "innerShadow", label: "Inner Shadow", defaults: { color: "#00000060", x: 0, y: 2, blur: 6 } },
];

const UIE_ANIM_TRIGGERS = ["on_show", "on_hide", "hover", "press", "state_change", "value_change", "event_success"];
const UIE_ANIM_PROPERTIES = ["opacity", "x", "y", "scale", "rotation", "bg", "border", "shadow", "blur"];
const UIE_ANIM_DURATIONS = { 90: "90ms", 160: "160ms", 260: "260ms", 760: "760ms" };
const UIE_ANIM_EASINGS = { easeOut: "cubic-bezier(0.16, 1, 0.3, 1)", snap: "cubic-bezier(0.34, 1.56, 0.64, 1)", heavy: "cubic-bezier(0.4, 0, 0.2, 1)", linear: "linear" };
const UIE_GRID_SIZES = [4, 8, 12, 16, 24, 32];

function uieSyncSelection() {
  UIE_SELECTED = UIE_SELECTED_IDS[0] || null;
}

function uieGetSelection() {
  if (UIE_SELECTED_IDS.length) return [...UIE_SELECTED_IDS];
  return UIE_SELECTED ? [UIE_SELECTED] : [];
}

function uieSetSelection(ids, opts) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (opts?.toggle && unique.length === 1) {
    const id = unique[0];
    if (UIE_SELECTED_IDS.includes(id)) UIE_SELECTED_IDS = UIE_SELECTED_IDS.filter(x => x !== id);
    else UIE_SELECTED_IDS.push(id);
  } else {
    UIE_SELECTED_IDS = unique;
  }
  uieSyncSelection();
  if (opts?.scrollIntoView && UIE_SELECTED && uieFindWidget(UIE_SELECTED)) {
    requestAnimationFrame(() => uieScrollWidgetIntoView(UIE_SELECTED));
  }
}

function uieIsSelected(id) {
  return uieGetSelection().includes(id);
}

function uieEnsureCanvas() {
  const ui = uieEnsureUi();
  if (!ui.canvas || typeof ui.canvas !== "object") {
    ui.canvas = { gridSize: UIE_GRID, showGrid: true, showRulers: true, showGuides: true, wireframe: false, dimOthers: false, guides: [] };
  }
  if (!Array.isArray(ui.canvas.guides)) ui.canvas.guides = [];
  return ui.canvas;
}

function uieGridSize() {
  return uieEnsureCanvas().gridSize || UIE_GRID;
}

function uieNextEffectId() {
  return `fx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uieNextAnimId() {
  return `anim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uieNextGuideId() {
  return `guide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uieEnsureEffects(w) {
  if (!Array.isArray(w.effects)) w.effects = [];
  w.effects.forEach((fx, i) => { if (fx.order == null) fx.order = i; });
  w.effects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return w.effects;
}

function uieEnsureAnimations(w) {
  if (!Array.isArray(w.animations)) w.animations = [];
  return w.animations;
}

function uieWidgetZ(w) {
  const ui = uieEnsureUi();
  if (w.z != null) return w.z;
  return ui.widgets.indexOf(w);
}

function uieSortWidgetsByZ(widgets) {
  return [...widgets].sort((a, b) => uieWidgetZ(a) - uieWidgetZ(b));
}

function uieDesignerSnapshot() {
  return JSON.stringify({ ui: uieEnsureUi(), selected: uieGetSelection() });
}

function uieDesignerPushUndo() {
  UIE_UNDO_STACK.push(uieDesignerSnapshot());
  if (UIE_UNDO_STACK.length > UIE_UNDO_MAX) UIE_UNDO_STACK.shift();
  UIE_REDO_STACK = [];
}

function uieDesignerUndo() {
  if (!UIE_UNDO_STACK.length) return false;
  UIE_REDO_STACK.push(uieDesignerSnapshot());
  const snap = JSON.parse(UIE_UNDO_STACK.pop());
  CURRENT_WF.ui = snap.ui;
  uieSetSelection(snap.selected || []);
  return true;
}

function uieDesignerRedo() {
  if (!UIE_REDO_STACK.length) return false;
  UIE_UNDO_STACK.push(uieDesignerSnapshot());
  const snap = JSON.parse(UIE_REDO_STACK.pop());
  CURRENT_WF.ui = snap.ui;
  uieSetSelection(snap.selected || []);
  return true;
}

function uieDesignerRecordUndo() {
  if (typeof wfPushUndo === "function") wfPushUndo();
  uieDesignerPushUndo();
}

function uieSnapAxis(v, axis) {
  const canvas = uieEnsureCanvas();
  if (canvas.showGuides !== false) {
    for (const g of (canvas.guides || [])) {
      if (g.locked || g.axis !== axis) continue;
      if (Math.abs(v - g.position) <= 6) return g.position;
    }
  }
  const size = uieGridSize();
  if (canvas.showGrid !== false) return Math.round(v / size) * size;
  return v;
}

function uieApplyEffectsCss(w) {
  const parts = [];
  const filters = [];
  let opacityMul = 1;
  let bgOverride = null;
  let borderOverride = null;
  let radiusOverride = null;
  let boxShadows = [];
  const effects = uieEffectiveEffects(w);
  effects.forEach(fx => {
    if (!fx || fx.enabled === false) return;
    const p = fx.params || {};
    if (fx.type === "blur") filters.push(`blur(${Number(p.radius) || 0}px)`);
    else if (fx.type === "dropShadow") boxShadows.push(`${Number(p.x) || 0}px ${Number(p.y) || 0}px ${Number(p.blur) || 0}px ${p.color || "#000"}`);
    else if (fx.type === "glow") {
      const sz = Number(p.size) || 8;
      const col = p.color || "#4a9eff";
      boxShadows.push(`0 0 ${sz}px ${col}`);
    }
    else if (fx.type === "colorFilter") {
      const f = [];
      if (p.brightness != null && p.brightness !== 1) f.push(`brightness(${p.brightness})`);
      if (p.contrast != null && p.contrast !== 1) f.push(`contrast(${p.contrast})`);
      if (p.saturate != null && p.saturate !== 1) f.push(`saturate(${p.saturate})`);
      if (p.hueRotate) f.push(`hue-rotate(${p.hueRotate}deg)`);
      if (p.sepia) f.push(`sepia(${p.sepia})`);
      if (f.length) filters.push(f.join(" "));
    }
    else if (fx.type === "opacity") opacityMul *= Number(p.value) ?? 1;
    else if (fx.type === "backdropBlur") {
      filters.push(`blur(${Number(p.radius) || 0}px)`);
      if (p.tint) bgOverride = p.tint;
    }
    else if (fx.type === "cornerRadius") {
      const tl = Number(p.tl) || 0, tr = Number(p.tr) || 0, br = Number(p.br) || 0, bl = Number(p.bl) || 0;
      radiusOverride = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
    else if (fx.type === "gradientFill") {
      const stops = (p.stops || []).map(s => `${s.color || "#000"} ${Number(s.pos) || 0}%`).join(", ");
      const ang = Number(p.angle) || 0;
      bgOverride = `linear-gradient(${ang}deg, ${stops})`;
    }
    else if (fx.type === "border") borderOverride = `${Number(p.width) || 1}px ${p.style || "solid"} ${p.color || "#666"}`;
    else if (fx.type === "innerShadow") boxShadows.push(`inset ${Number(p.x) || 0}px ${Number(p.y) || 0}px ${Number(p.blur) || 0}px ${p.color || "#000"}`);
  });
  if (filters.length) parts.push(`filter:${filters.join(" ")}`);
  if (opacityMul !== 1) parts.push(`opacity:${opacityMul}`);
  if (bgOverride) parts.push(`background:${bgOverride}`);
  if (borderOverride) parts.push(`border:${borderOverride}`);
  if (radiusOverride) parts.push(`border-radius:${radiusOverride}`);
  if (boxShadows.length) parts.push(`box-shadow:${boxShadows.join(",")}`);
  return parts;
}

function uieAnimationCss(anim) {
  if (!anim || anim.enabled === false) return "";
  const dur = anim.duration === "custom" ? `${Number(anim.customDuration) || 260}ms` : (UIE_ANIM_DURATIONS[anim.duration] || `${anim.duration || 260}ms`);
  const ease = UIE_ANIM_EASINGS[anim.easing] || anim.easing || "ease";
  const prop = anim.property || "opacity";
  const cssProp = { opacity: "opacity", x: "transform", y: "transform", scale: "transform", rotation: "transform", bg: "background-color", border: "border-color", shadow: "box-shadow", blur: "filter" }[prop] || prop;
  let fromVal = anim.from, toVal = anim.to;
  if (prop === "scale") { fromVal = `scale(${anim.from ?? 1})`; toVal = `scale(${anim.to ?? 1})`; }
  else if (prop === "x") { fromVal = `translateX(${anim.from ?? 0}px)`; toVal = `translateX(${anim.to ?? 0}px)`; }
  else if (prop === "y") { fromVal = `translateY(${anim.from ?? 0}px)`; toVal = `translateY(${anim.to ?? 0}px)`; }
  else if (prop === "rotation") { fromVal = `rotate(${anim.from ?? 0}deg)`; toVal = `rotate(${anim.to ?? 0}deg)`; }
  return { cssProp, fromVal, toVal, dur, ease, delay: `${Number(anim.delay) || 0}ms`, repeat: anim.repeat ? "infinite" : "1" };
}

// Mirrors workflow.py _generate_ui_app per-widget emission — keep in sync manually (divergence risk).
function uieCodegenWidgetFragment(w) {
  if (!w) return "# Select one widget...";
  const wid = w.id;
  const wtype = w.type || "label";
  const props = uieEffectiveWidgetProps(w);
  const x = w.x ?? 0, y = w.y ?? 0, ww = w.width ?? 80, wh = w.height ?? 24;
  const tkMap = { button: "tk.Button", label: "tk.Label", entry: "tk.Entry", scale: "tk.Scale", checkbutton: "tk.Checkbutton", combobox: "ttk.Combobox", progressbar: "ttk.Progressbar", frame: "tk.Frame", canvas: "tk.Canvas", image: "tk.Label" };
  const tkCls = tkMap[wtype] || "tk.Label";
  const varName = `self._w_${wid.replace(/-/g, "_")}`;
  const kwargs = [];
  const text = props.text || "";
  if (["button", "label", "checkbutton", "image"].includes(wtype)) kwargs.push(`text=${JSON.stringify(text)}`);
  if (wtype === "entry") kwargs.push(`textvariable=tk.StringVar(value=${JSON.stringify(text)})`);
  if (wtype === "scale") { kwargs.push(`from_=${props.min ?? 0}`); kwargs.push(`to=${props.max ?? 100}`); }
  if (wtype === "combobox") { kwargs.push(`values=${JSON.stringify(props.values || [])}`); if (text) kwargs.push(`text=${JSON.stringify(text)}`); }
  if (wtype === "progressbar") { kwargs.push("mode='determinate'"); kwargs.push(`maximum=${props.max ?? 100}`); kwargs.push(`value=${props.value ?? 0}`); }
  if (props.bg) kwargs.push(`bg=${JSON.stringify(uiePropToCss(props.bg))}`);
  if (props.fg) kwargs.push(`fg=${JSON.stringify(uiePropToCss(props.fg))}`);
  const kw = kwargs.join(", ");
  const lines = [`${varName} = ${tkCls}(self${kw ? `, ${kw}` : ""})  # designer id: ${wid}`, `${varName}.place(x=${x}, y=${y}, width=${ww}, height=${wh})`];
  const evs = w.events || {};
  Object.entries(evs).forEach(([ev, b]) => {
    if (!b || !b.nodeId || b.binding === "none") return;
    const tkEv = { clicked: "<Button-1>", toggled: "<Button-1>", changed: "<<Changed>>", selected: "<<ComboboxSelected>>", return_pressed: "<Return>" }[ev] || `<${ev}>`;
    lines.push(`${varName}.bind(${JSON.stringify(tkEv)}, lambda e: _on_${wid}_${ev}())`);
  });
  uieEnsureEffects(w).forEach(fx => {
    if (fx.enabled === false) return;
    if (!["opacity", "border", "cornerRadius", "gradientFill"].includes(fx.type) || (fx.type === "gradientFill" && fx.params?.stops)) {
      if (["glow", "blur", "dropShadow", "backdropBlur", "colorFilter", "innerShadow"].includes(fx.type)) {
        lines.push(`# unsupported effect ${fx.type} on widget ${wid}`);
      }
    }
  });
  uieEnsureAnimations(w).forEach(anim => {
    if (anim.enabled !== false) lines.push(`# animation omitted: ${anim.trigger || "on_show"} ${anim.property || "opacity"} on widget ${wid}`);
  });
  return lines.join("\n");
}

function uieCodegenWidgetJson(w) {
  if (!w) return "{}";
  return JSON.stringify({ id: w.id, type: w.type, x: w.x, y: w.y, width: w.width, height: w.height, props: w.props, events: w.events, effects: w.effects, animations: w.animations, z: w.z }, null, 2);
}

function uieSelectionBounds(ids) {
  const ws = ids.map(id => uieFindWidget(id)).filter(Boolean);
  if (!ws.length) return null;
  const xs = ws.map(w => w.x), ys = ws.map(w => w.y);
  const rights = ws.map(w => w.x + w.width), bottoms = ws.map(w => w.y + w.height);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...rights) - x, height: Math.max(...bottoms) - y, widgets: ws };
}

function uieExtractStyle(w) {
  const p = w.props || {};
  return {
    effects: JSON.parse(JSON.stringify(w.effects || [])),
    fontSize: p.fontSize,
    fg: p.fg,
    bg: p.bg,
    bgAsset: p.bgAsset,
  };
}

function uieCopyStyle(w) {
  if (!w) return;
  UIE_STYLE_CLIPBOARD = uieExtractStyle(w);
}

function uiePasteStyle(w) {
  if (!w || !UIE_STYLE_CLIPBOARD) return;
  uieDesignerRecordUndo();
  w.effects = JSON.parse(JSON.stringify(UIE_STYLE_CLIPBOARD.effects || []));
  w.props = w.props || {};
  if (UIE_STYLE_CLIPBOARD.fontSize != null) w.props.fontSize = UIE_STYLE_CLIPBOARD.fontSize;
  if (UIE_STYLE_CLIPBOARD.fg != null) w.props.fg = UIE_STYLE_CLIPBOARD.fg;
  if (UIE_STYLE_CLIPBOARD.bg != null) w.props.bg = UIE_STYLE_CLIPBOARD.bg;
  if (UIE_STYLE_CLIPBOARD.bgAsset != null) w.props.bgAsset = UIE_STYLE_CLIPBOARD.bgAsset;
  renderAutomationStudioView();
}

function uieFocusInspector() {
  const panel = document.getElementById("uie-inspector");
  if (!panel) return;
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const first = panel.querySelector("input:not([type=hidden]), select, textarea, summary");
  if (first) {
    if (first.tagName === "SUMMARY") first.parentElement?.setAttribute("open", "");
    (panel.querySelector("input:not([type=hidden]), select, textarea") || first).focus?.();
  }
}

function uieShowWidgetContextMenu(e, widgetId) {
  const w = uieFindWidget(widgetId);
  if (!w) return;
  if (!uieIsSelected(widgetId)) uieSetSelection([widgetId]);
  const items = [
    { id: "edit", label: "Edit" },
    { id: "duplicate", label: "Duplicate" },
    { id: "copyStyle", label: "Copy style" },
    { id: "pasteStyle", label: "Paste style", disabled: !UIE_STYLE_CLIPBOARD },
    { id: "saveTemplate", label: "Save as Template" },
    { separator: true },
    { id: "front", label: "Bring to front" },
    { id: "back", label: "Send to back" },
    { separator: true },
    { id: "delete", label: "Delete" },
  ];
  if (typeof showWfActionMenu === "function") {
    showWfActionMenu(e.clientX, e.clientY, items, act => {
      if (act === "edit") { renderAutomationStudioView(); setTimeout(() => uieFocusInspector(), 50); }
      else if (act === "duplicate") {
        UIE_CLIPBOARD = uieCopyWidgets([widgetId]);
        const newIds = uiePasteWidgets(UIE_CLIPBOARD, 16, 16);
        uieSetSelection(newIds);
        renderAutomationStudioView();
      } else if (act === "copyStyle") uieCopyStyle(w);
      else if (act === "pasteStyle") uiePasteStyle(w);
      else if (act === "saveTemplate") { uieSaveAsTemplate(widgetId); renderAutomationStudioView(); }
      else if (act === "front") { uieZOrder([widgetId], "front"); renderAutomationStudioView(); }
      else if (act === "back") { uieZOrder([widgetId], "backmost"); renderAutomationStudioView(); }
      else if (act === "delete") { uieDeleteWidget(widgetId); renderAutomationStudioView(); }
    });
  }
}

function uieStudioDesignerToolbarHtml() {
  const canvas = uieEnsureCanvas();
  const dev = uieGetDeviceSize();
  const toggle = (key, label, val) =>
    `<button type="button" class="secondary studio-tb-btn${val ? " studio-tb-toggle-on" : ""}" data-uie-studio-toggle="${escapeHtml(key)}">${escapeHtml(label)}</button>`;
  const gridOpts = UIE_GRID_SIZES.map(s =>
    `<option value="${s}" ${canvas.gridSize === s ? "selected" : ""}>${s}px</option>`
  ).join("");
  const hasArrange = uieGetSelection().length >= 2;
  const hasZSel = uieGetSelection().length > 0;
  const alignBtns = [["left", "L"], ["centerX", "CX"], ["right", "R"], ["top", "T"], ["centerY", "CY"], ["bottom", "B"], ["distX", "DX"], ["distY", "DY"]]
    .map(([m, l]) => `<button type="button" class="secondary studio-tb-btn" data-uie-align="${escapeHtml(m)}" ${hasArrange ? "" : "disabled"} title="${hasArrange ? escapeHtml(m) : "Select 2+ widgets to arrange"}">${escapeHtml(l)}</button>`).join("");
  const arrangeHint = hasArrange ? "" : `<span class="studio-tb-hint uie-arrange-empty" title="Select 2+ widgets">Arrange needs 2+</span>`;
  const deviceOpts = Object.entries(UIE_DEVICES).map(([k, d]) =>
    `<option value="${escapeHtml(k)}" ${dev.preset === k ? "selected" : ""}>${escapeHtml(d.label)}</option>`
  ).join("");
  const selOn = UIE_CANVAS_MODE === "select" ? " studio-tb-toggle-on" : "";
  const panOn = UIE_CANVAS_MODE === "pan" ? " studio-tb-toggle-on" : "";
  return `<div class="studio-grouped-toolbar" id="studio-designer-toolbar" data-studio-toolbar="designer">
    <div class="studio-tb-group" data-studio-group="select">
      <span class="studio-tb-caption">Select</span>
      <div class="studio-tb-items">
        <button type="button" class="secondary studio-tb-btn${selOn}" id="uie-studio-select">Select</button>
        <button type="button" class="secondary studio-tb-btn${panOn}" id="uie-studio-pan">Pan</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="snap">
      <span class="studio-tb-caption">Snap</span>
      <div class="studio-tb-items">
        ${toggle("showGrid", "Grid", canvas.showGrid !== false)}
        <select id="uie-studio-grid-size" class="studio-tb-select">${gridOpts}</select>
        ${toggle("showGuides", "Guides", canvas.showGuides !== false)}
        ${toggle("showRulers", "Rulers", canvas.showRulers !== false)}
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="arrange">
      <span class="studio-tb-caption">Arrange</span>
      <div class="studio-tb-items">${alignBtns}${arrangeHint}
        <button type="button" class="secondary studio-tb-btn" data-uie-z="forward" ${hasZSel ? "" : "disabled"} title="${hasZSel ? "Bring forward" : "Select a widget"}">↑</button>
        <button type="button" class="secondary studio-tb-btn" data-uie-z="back" ${hasZSel ? "" : "disabled"} title="${hasZSel ? "Send backward" : "Select a widget"}">↓</button>
        <button type="button" class="secondary studio-tb-btn" data-uie-z="front" ${hasZSel ? "" : "disabled"} title="${hasZSel ? "Bring to front" : "Select a widget"}">Front</button>
        <button type="button" class="secondary studio-tb-btn" data-uie-z="backmost" ${hasZSel ? "" : "disabled"} title="${hasZSel ? "Send to back" : "Select a widget"}">Back</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="view">
      <span class="studio-tb-caption">View</span>
      <div class="studio-tb-items">
        ${toggle("wireframe", "Wire", canvas.wireframe)}
        ${toggle("dimOthers", "Dim", canvas.dimOthers)}
        <button type="button" class="secondary studio-tb-btn${UIE_ISOLATE_MODE ? " studio-tb-toggle-on" : ""}" id="uie-studio-isolate">Isolate</button>
        <button type="button" class="secondary studio-tb-btn${UIE_BINDINGS_OVERLAY ? " studio-tb-toggle-on" : ""}" data-uie-studio-toggle="bindingsOverlay">Bind</button>
      </div>
    </div>
    <div class="studio-tb-group" data-studio-group="device">
      <span class="studio-tb-caption">Device</span>
      <div class="studio-tb-items">
        <select id="uie-studio-device" class="studio-tb-select" style="max-width:88px;"><option value="custom" ${dev.preset === "custom" ? "selected" : ""}>Custom</option>${deviceOpts}</select>
        <input type="number" id="uie-studio-device-w" min="100" max="4096" value="${dev.width}" style="width:44px;font-size:10px;" title="Width">
        <span style="color:var(--ink-muted);">×</span>
        <input type="number" id="uie-studio-device-h" min="100" max="4096" value="${dev.height}" style="width:44px;font-size:10px;" title="Height">
      </div>
    </div>
    <button type="button" class="secondary studio-tb-overflow" id="uie-studio-tb-more" title="More tools" hidden>⋯</button>
    <div class="studio-tb-overflow-menu wf-context-menu" id="uie-studio-tb-overflow-menu" hidden></div>
  </div>`;
}

function uieWireStudioToolbar() {
  const canvas = uieEnsureCanvas();
  document.getElementById("uie-studio-select")?.addEventListener("click", () => { UIE_CANVAS_MODE = "select"; renderAutomationStudioView(); });
  document.getElementById("uie-studio-pan")?.addEventListener("click", () => { UIE_CANVAS_MODE = "pan"; renderAutomationStudioView(); });
  document.querySelectorAll("[data-uie-studio-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.uieStudioToggle;
      if (key === "bindingsOverlay") { UIE_BINDINGS_OVERLAY = !UIE_BINDINGS_OVERLAY; window.UIE_BINDINGS_OVERLAY = UIE_BINDINGS_OVERLAY; }
      else canvas[key] = !canvas[key];
      renderAutomationStudioView();
    });
  });
  document.getElementById("uie-studio-grid-size")?.addEventListener("change", e => {
    canvas.gridSize = Number(e.target.value) || UIE_GRID;
    renderAutomationStudioView();
  });
  document.getElementById("uie-studio-isolate")?.addEventListener("click", () => {
    UIE_ISOLATE_MODE = !UIE_ISOLATE_MODE;
    renderAutomationStudioView();
  });
  document.querySelectorAll("#studio-designer-toolbar [data-uie-align]").forEach(btn => {
    btn.addEventListener("click", () => { if (!btn.disabled) uieAlignSelection(btn.dataset.uieAlign); });
  });
  document.querySelectorAll("#studio-designer-toolbar [data-uie-z]").forEach(btn => {
    btn.addEventListener("click", () => { if (!btn.disabled) uieZOrder(uieGetSelection(), btn.dataset.uieZ); });
  });
  document.getElementById("uie-studio-device")?.addEventListener("change", e => {
    wfPushUndo();
    const ui = uieEnsureUi();
    if (e.target.value === "custom") ui.device = { preset: "custom", w: uieGetDeviceSize().width, h: uieGetDeviceSize().height };
    else ui.device = uieNormalizeDevice(e.target.value);
    renderAutomationStudioView();
  });
  const applyDevice = () => { if (typeof wfPushUndo === "function") wfPushUndo(); uieApplyDeviceDimensions(); };
  document.getElementById("uie-studio-device-w")?.addEventListener("change", applyDevice);
  document.getElementById("uie-studio-device-h")?.addEventListener("change", applyDevice);
  document.getElementById("uie-studio-device-w")?.addEventListener("blur", applyDevice);
  document.getElementById("uie-studio-device-h")?.addEventListener("blur", applyDevice);
  if (typeof wireStudioToolbarOverflow === "function") wireStudioToolbarOverflow("studio-designer-toolbar");
}

function uieCopyWidgets(ids) {
  const ws = ids.map(id => uieFindWidget(id)).filter(Boolean);
  if (!ws.length) return null;
  const idSet = new Set(ws.map(w => w.id));
  const copies = ws.map(w => JSON.parse(JSON.stringify(w)));
  const childMap = uieEnsureUi().widgets.filter(w => w.parent && idSet.has(w.parent));
  return { widgets: copies, children: childMap.map(w => JSON.parse(JSON.stringify(w))) };
}

function uiePasteWidgets(clip, offsetX, offsetY) {
  if (!clip?.widgets?.length) return [];
  uieDesignerRecordUndo();
  const idMap = {};
  const newIds = [];
  clip.widgets.forEach(w => {
    const copy = JSON.parse(JSON.stringify(w));
    const oldId = copy.id;
    copy.id = uieNextId(copy.type);
    copy.x = (copy.x || 0) + (offsetX ?? 16);
    copy.y = (copy.y || 0) + (offsetY ?? 16);
    idMap[oldId] = copy.id;
    uieEnsureUi().widgets.push(copy);
    newIds.push(copy.id);
  });
  (clip.children || []).forEach(w => {
    const copy = JSON.parse(JSON.stringify(w));
    copy.id = uieNextId(copy.type);
    if (copy.parent && idMap[copy.parent]) copy.parent = idMap[copy.parent];
    copy.x = (copy.x || 0) + (offsetX ?? 16);
    copy.y = (copy.y || 0) + (offsetY ?? 16);
    uieEnsureUi().widgets.push(copy);
    newIds.push(copy.id);
  });
  return newIds;
}

function uieAlignSelection(mode) {
  const ids = uieGetSelection();
  const b = uieSelectionBounds(ids);
  if (!b || b.widgets.length < 2) return;
  uieDesignerRecordUndo();
  b.widgets.forEach(w => {
    if (mode === "left") w.x = b.x;
    else if (mode === "centerX") w.x = b.x + (b.width - w.width) / 2;
    else if (mode === "right") w.x = b.x + b.width - w.width;
    else if (mode === "top") w.y = b.y;
    else if (mode === "centerY") w.y = b.y + (b.height - w.height) / 2;
    else if (mode === "bottom") w.y = b.y + b.height - w.height;
    else if (mode === "sameW") w.width = b.width;
    else if (mode === "sameH") w.height = b.height;
    w.x = uieSnapAxis(w.x, "v");
    w.y = uieSnapAxis(w.y, "h");
  });
  if (mode === "distX" || mode === "distY") {
    const sorted = [...b.widgets].sort((a, c) => mode === "distX" ? a.x - c.x : a.y - c.y);
    const total = mode === "distX" ? b.width : b.height;
    const span = sorted.reduce((s, w) => s + (mode === "distX" ? w.width : w.height), 0);
    const gap = (total - span) / (sorted.length - 1);
    let pos = mode === "distX" ? b.x : b.y;
    sorted.forEach((w, i) => {
      if (i === 0) { pos += mode === "distX" ? w.width : w.height; return; }
      if (mode === "distX") { w.x = uieSnapAxis(pos + gap, "v"); pos = w.x + w.width; }
      else { w.y = uieSnapAxis(pos + gap, "h"); pos = w.y + w.height; }
    });
  }
  uieRefreshDesigner();
}

function uieZOrder(ids, action) {
  const ui = uieEnsureUi();
  const ws = ids.map(id => uieFindWidget(id)).filter(Boolean);
  if (!ws.length) return;
  uieDesignerRecordUndo();
  const all = uieSortWidgetsByZ(ui.widgets);
  const maxZ = all.length;
  ws.forEach(w => {
    if (action === "forward") w.z = (uieWidgetZ(w) + 1);
    else if (action === "back") w.z = Math.max(0, uieWidgetZ(w) - 1);
    else if (action === "front") w.z = maxZ + 1;
    else if (action === "backmost") w.z = -1;
  });
  ui.widgets.forEach((w, i) => { if (w.z == null) w.z = i; });
  ui.widgets.sort((a, b) => uieWidgetZ(a) - uieWidgetZ(b));
  ui.widgets.forEach((w, i) => { w.z = i; });
  uieRefreshDesigner();
}

function uieNormalizeDevice(device) {
  if (typeof device === "string") {
    const d = UIE_DEVICES[device] || UIE_DEVICES.phone;
    return { preset: device, w: d.width, h: d.height };
  }
  if (device && typeof device === "object") {
    const preset = device.preset || "custom";
    if (preset !== "custom" && UIE_DEVICES[preset]) {
      const d = UIE_DEVICES[preset];
      return { preset, w: d.width, h: d.height };
    }
    return { preset: "custom", w: Number(device.w) || 375, h: Number(device.h) || 667 };
  }
  return { preset: "phone", w: 375, h: 667 };
}

function uieGetDeviceSize() {
  const dev = uieNormalizeDevice(uieEnsureUi().device);
  if (dev.preset !== "custom" && UIE_DEVICES[dev.preset]) {
    const d = UIE_DEVICES[dev.preset];
    return { label: d.label, width: d.width, height: d.height, preset: dev.preset };
  }
  return { label: "Custom", width: dev.w, height: dev.h, preset: "custom" };
}

function uieEnsureDataSchema() {
  const ui = uieEnsureUi();
  if (!Array.isArray(ui.dataSchema)) ui.dataSchema = [];
  return ui.dataSchema;
}

function uieGetPublishedAppId() {
  return (uieEnsureUi().publishedAppId) || null;
}

function uieDataStorageKey() {
  return `uie_app_data_wf_${CURRENT_WF.id || "draft"}`;
}

async function uieDataFetchRows() {
  const appId = uieGetPublishedAppId();
  if (appId) {
    try {
      const res = await fetch(`/api/apps/${appId}/data`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.rows || []);
      }
    } catch (_) { /* backend may not exist yet */ }
  }
  try {
    return JSON.parse(localStorage.getItem(uieDataStorageKey()) || "[]");
  } catch (_) {
    return [];
  }
}

async function uieDataSaveRowsLocal(rows) {
  try {
    localStorage.setItem(uieDataStorageKey(), JSON.stringify(rows));
  } catch (_) { /* noop */ }
}

async function uieDataCreateRow(fields) {
  const appId = uieGetPublishedAppId();
  if (appId) {
    try {
      const res = await fetch(`/api/apps/${appId}/data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.ok) return await res.json();
    } catch (_) { /* fall through to local */ }
  }
  const rows = await uieDataFetchRows();
  const row = { id: `local_${Date.now()}`, ...fields };
  rows.push(row);
  await uieDataSaveRowsLocal(rows);
  return row;
}

async function uieDataUpdateRow(rowId, fields) {
  const appId = uieGetPublishedAppId();
  if (appId) {
    try {
      const res = await fetch(`/api/apps/${appId}/data/${encodeURIComponent(rowId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.ok) return await res.json();
    } catch (_) { /* fall through */ }
  }
  const rows = await uieDataFetchRows();
  const idx = rows.findIndex(r => String(r.id) === String(rowId));
  if (idx >= 0) rows[idx] = { ...rows[idx], ...fields };
  await uieDataSaveRowsLocal(rows);
  return rows[idx];
}

async function uieDataDeleteRow(rowId) {
  const appId = uieGetPublishedAppId();
  if (appId) {
    try {
      const res = await fetch(`/api/apps/${appId}/data/${encodeURIComponent(rowId)}`, { method: "DELETE" });
      if (res.ok) return true;
    } catch (_) { /* fall through */ }
  }
  const rows = (await uieDataFetchRows()).filter(r => String(r.id) !== String(rowId));
  await uieDataSaveRowsLocal(rows);
  return true;
}

function uieIsWaypointWidget(w) {
  return w && String(w.type || "").startsWith("wp_");
}

async function uieLoadWorkflowList() {
  try {
    const list = await api("/api/workflows");
    UIE_WORKFLOW_LIST = Array.isArray(list) ? list : [];
  } catch (_) {
    UIE_WORKFLOW_LIST = [];
  }
  return UIE_WORKFLOW_LIST;
}

function uieNextScreenId() {
  const ui = uieEnsureUi();
  let n = (ui.screens || []).length + 1;
  let id = `screen_${n}`;
  while ((ui.screens || []).some(s => s.id === id)) { n += 1; id = `screen_${n}`; }
  return id;
}

function uieNextStyleId() {
  const ui = uieEnsureUi();
  let n = (ui.styles || []).length + 1;
  let id = `style_${n}`;
  while ((ui.styles || []).some(s => s.id === id)) { n += 1; id = `style_${n}`; }
  return id;
}

function uieNextTemplateId() {
  const ui = uieEnsureUi();
  let n = (ui.templates || []).length + 1;
  let id = `tpl_${n}`;
  while ((ui.templates || []).some(t => t.id === id)) { n += 1; id = `tpl_${n}`; }
  return id;
}

function uieNextTokenId(kind) {
  const ui = uieEnsureUi();
  const list = kind === "font" ? (ui.tokens?.fonts || []) : (ui.tokens?.colors || []);
  let n = list.length + 1;
  let id = `${kind}_${n}`;
  while (list.some(t => t.id === id)) { n += 1; id = `${kind}_${n}`; }
  return id;
}

function uieEnsureTokens() {
  const ui = CURRENT_WF.ui || (CURRENT_WF.ui = { widgets: [], device: "phone" });
  if (!ui.tokens || typeof ui.tokens !== "object") ui.tokens = { colors: [], fonts: [] };
  if (!Array.isArray(ui.tokens.colors)) ui.tokens.colors = [];
  if (!Array.isArray(ui.tokens.fonts)) ui.tokens.fonts = [];
  return ui.tokens;
}

function uieEnsureStyles() {
  const ui = CURRENT_WF.ui || (CURRENT_WF.ui = { widgets: [], device: "phone" });
  if (!Array.isArray(ui.styles)) ui.styles = [];
  return ui.styles;
}

function uieEnsureTemplates() {
  const ui = CURRENT_WF.ui || (CURRENT_WF.ui = { widgets: [], device: "phone" });
  if (!Array.isArray(ui.templates)) ui.templates = [];
  return ui.templates;
}

function uieEnsurePreviewMeta() {
  const ui = CURRENT_WF.ui || (CURRENT_WF.ui = { widgets: [], device: "phone" });
  if (!ui.preview || typeof ui.preview !== "object") ui.preview = {};
  if (!ui.preview.responsivePreview || typeof ui.preview.responsivePreview !== "object") {
    ui.preview.responsivePreview = { width: null, height: null };
  }
  return ui.preview;
}

function uieMigrateScreens(ui) {
  if (Array.isArray(ui.screens) && ui.screens.length) {
    if (!ui.activeScreenId) ui.activeScreenId = ui.screens[0].id;
    ui.widgets.forEach(w => {
      if (!w.screenId) w.screenId = ui.activeScreenId;
    });
    return;
  }
  const homeId = "screen_home";
  const roots = ui.widgets.filter(w => !w.parent).map(w => w.id);
  ui.screens = [{ id: homeId, name: "Home", rootWidgetIds: roots }];
  ui.activeScreenId = homeId;
  ui.widgets.forEach(w => { w.screenId = homeId; });
}

function uieActiveScreen() {
  const ui = uieEnsureUi();
  return (ui.screens || []).find(s => s.id === ui.activeScreenId) || ui.screens[0] || null;
}

function uieFindScreen(id) {
  return (uieEnsureUi().screens || []).find(s => s.id === id) || null;
}

function uieScreenWidgets(screenId) {
  const sid = screenId || uieEnsureUi().activeScreenId;
  return uieEnsureUi().widgets.filter(w => w.screenId === sid);
}

function uieSetActiveScreen(screenId) {
  const ui = uieEnsureUi();
  if (!uieFindScreen(screenId)) return;
  ui.activeScreenId = screenId;
  uieDeselect();
}

function uiePreviewActiveScreenId() {
  return UIE_PREVIEW_SCREEN_ID || uieEnsureUi().activeScreenId;
}

function uiePreviewSetScreen(screenId) {
  if (!uieFindScreen(screenId)) return;
  UIE_PREVIEW_SCREEN_ID = screenId;
}

function uieResolveTokenRef(ref) {
  if (!ref || typeof ref !== "string") return "";
  const tokens = uieEnsureTokens();
  const m = ref.match(/^(color|font)\.(.+)$/);
  if (!m) return ref;
  const [, kind, name] = m;
  const list = kind === "font" ? tokens.fonts : tokens.colors;
  const tok = list.find(t => t.name === name || t.id === name);
  return tok ? (tok.value || "") : "";
}

function uieIsTokenRef(val) {
  return val && typeof val === "object" && typeof val.token === "string";
}

function uieResolvePropValue(val) {
  if (uieIsTokenRef(val)) {
    const resolved = uieResolveTokenRef(val.token);
    return { raw: val, value: resolved, token: val.token, isToken: true };
  }
  return { raw: val, value: val, isToken: false };
}

function uiePropToCss(val) {
  const r = uieResolvePropValue(val);
  const v = r.value;
  if (v == null || v === "") return "";
  return String(v);
}

function uieStorePropWithResolve(propVal, tokenRef) {
  if (tokenRef) {
    const resolved = uieResolveTokenRef(tokenRef);
    return { token: tokenRef, _resolved: resolved };
  }
  return propVal;
}

function uieRefreshTokenReferences() {
  const walk = obj => {
    if (!obj || typeof obj !== "object") return;
    if (uieIsTokenRef(obj)) {
      obj._resolved = uieResolveTokenRef(obj.token);
      return;
    }
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(obj).forEach(walk);
  };
  const ui = uieEnsureUi();
  ui.widgets.forEach(w => {
    walk(w.props);
    walk(w.styleOverrides);
  });
  (ui.styles || []).forEach(s => walk(s.props));
}

function uieFindStyleClass(id) {
  return uieEnsureStyles().find(s => s.id === id) || null;
}

function uieDefaultStyleProps() {
  return {
    appearance: { bg: "", fg: "", bgAsset: "", visible: true, enabled: true },
    typography: { fontSize: 12, fontFamily: "" },
    effects: [],
  };
}

function uieEnsureStyleClass(id) {
  const sc = uieFindStyleClass(id);
  if (!sc) return null;
  sc.props = sc.props || uieDefaultStyleProps();
  if (!sc.props.appearance) sc.props.appearance = { ...uieDefaultStyleProps().appearance };
  if (!sc.props.typography) sc.props.typography = { ...uieDefaultStyleProps().typography };
  if (!Array.isArray(sc.props.effects)) sc.props.effects = [];
  return sc;
}

function uieEffectiveWidgetProps(w) {
  const p = JSON.parse(JSON.stringify(w.props || {}));
  const sc = w.styleClassId ? uieEnsureStyleClass(w.styleClassId) : null;
  if (sc) {
    const ov = w.styleOverrides || {};
    const merge = (base, over) => ({ ...base, ...(over || {}) });
    const app = merge(sc.props.appearance || {}, ov.appearance || {});
    const typ = merge(sc.props.typography || {}, ov.typography || {});
    Object.assign(p, app, typ);
    if (!ov.effects && sc.props.effects?.length) {
      w._styleEffects = JSON.parse(JSON.stringify(sc.props.effects));
    }
  }
  return p;
}

function uieEffectiveEffects(w) {
  const ov = w.styleOverrides || {};
  if (Array.isArray(ov.effects) && ov.effects.length) return ov.effects;
  const sc = w.styleClassId ? uieEnsureStyleClass(w.styleClassId) : null;
  if (sc?.props?.effects?.length) return sc.props.effects;
  return w.effects || [];
}

function uieStyleOverrideKeys(w, section) {
  const ov = (w.styleOverrides || {})[section] || {};
  return Object.keys(ov).filter(k => ov[k] !== undefined && ov[k] !== "");
}

function uieIsStylePropOverridden(w, section, key) {
  const ov = (w.styleOverrides || {})[section] || {};
  return Object.prototype.hasOwnProperty.call(ov, key);
}

function uieResetStyleOverride(w, section, key) {
  w.styleOverrides = w.styleOverrides || {};
  if (w.styleOverrides[section]) {
    delete w.styleOverrides[section][key];
    if (!Object.keys(w.styleOverrides[section]).length) delete w.styleOverrides[section];
  }
  if (key === "effects" && section === "effects") delete w.styleOverrides.effects;
}

function uieSetStyleOverride(w, section, key, val) {
  w.styleOverrides = w.styleOverrides || {};
  if (section === "effects") {
    w.styleOverrides.effects = val;
    return;
  }
  w.styleOverrides[section] = w.styleOverrides[section] || {};
  w.styleOverrides[section][key] = val;
}

function uieApplyStyleClassToWidget(w, styleId) {
  w.styleClassId = styleId || null;
  if (!styleId) return;
  w.styleOverrides = w.styleOverrides || {};
}

function uieEnsureWidgetLayout(w) {
  if (!w.layout || typeof w.layout !== "object") {
    w.layout = { mode: "free", spacing: 8, padding: 0, align: "start" };
  }
  if (!w.layout.mode) w.layout.mode = "free";
  if (w.layout.spacing == null) w.layout.spacing = 8;
  if (w.layout.padding == null) w.layout.padding = 0;
  if (!w.layout.align) w.layout.align = "start";
  return w.layout;
}

function uieStackChildren(parent) {
  const ui = uieEnsureUi();
  return uieSortWidgetsByZ(ui.widgets.filter(w => w.parent === parent.id && w.screenId === parent.screenId));
}

/** Frames/canvases (and any marked container) can host children on the Designer canvas. */
function uieCanHostChildren(w) {
  return !!(w && (w.type === "frame" || w.type === "canvas" || w.type === "wp_data_list"));
}

function uieWidgetDescendantIds(rootId) {
  const ui = uieEnsureUi();
  const out = [];
  const walk = (pid) => {
    ui.widgets.forEach(w => {
      if (w.parent === pid) {
        out.push(w.id);
        walk(w.id);
      }
    });
  };
  walk(rootId);
  return out;
}

function uieWouldCreateParentCycle(childId, parentId) {
  if (!parentId) return false;
  if (childId === parentId) return true;
  return uieWidgetDescendantIds(childId).includes(parentId);
}

function uieComputeStackLayout(parent) {
  const layout = uieEnsureWidgetLayout(parent);
  if (layout.mode === "free") return null;
  const children = uieStackChildren(parent);
  const pad = Number(layout.padding) || 0;
  const gap = Number(layout.spacing) || 0;
  const innerW = Math.max(0, parent.width - pad * 2);
  const innerH = Math.max(0, parent.height - pad * 2);
  const positions = {};
  let cursor = layout.mode === "vstack" ? pad : pad;
  children.forEach(ch => {
    let x = ch.x, y = ch.y, width = ch.width, height = ch.height;
    if (layout.mode === "vstack") {
      x = pad;
      y = cursor;
      if (layout.align === "center") x = pad + Math.max(0, (innerW - ch.width) / 2);
      else if (layout.align === "end") x = pad + Math.max(0, innerW - ch.width);
      else if (layout.align === "stretch") { x = pad; width = innerW; }
      cursor += ch.height + gap;
    } else {
      x = cursor;
      y = pad;
      if (layout.align === "center") y = pad + Math.max(0, (innerH - ch.height) / 2);
      else if (layout.align === "end") y = pad + Math.max(0, innerH - ch.height);
      else if (layout.align === "stretch") { y = pad; height = innerH; }
      cursor += ch.width + gap;
    }
    // Local to parent — absolute offset applied in uieGetWidgetRenderRect.
    positions[ch.id] = { x, y, width, height };
  });
  return positions;
}

function uieGetWidgetRenderRect(w, stackPositions, _seen) {
  if (!w) return { x: 0, y: 0, width: 0, height: 0 };
  const seen = _seen || new Set();
  if (seen.has(w.id)) return { x: w.x, y: w.y, width: w.width, height: w.height };
  seen.add(w.id);
  const local = (stackPositions && stackPositions[w.id])
    ? stackPositions[w.id]
    : { x: w.x, y: w.y, width: w.width, height: w.height };
  if (!w.parent) return { x: local.x, y: local.y, width: local.width, height: local.height };
  const parent = uieFindWidget(w.parent);
  if (!parent) return { x: local.x, y: local.y, width: local.width, height: local.height };
  const origin = uieGetWidgetRenderRect(parent, stackPositions, seen);
  return { x: origin.x + local.x, y: origin.y + local.y, width: local.width, height: local.height };
}

function uieCollectStackPositions(widgets) {
  const map = {};
  widgets.forEach(w => {
    if (uieCanHostChildren(w) && uieEnsureWidgetLayout(w).mode !== "free") {
      const pos = uieComputeStackLayout(w);
      if (pos) Object.assign(map, pos);
    }
  });
  return map;
}

/** Reparent widget; x/y are canvas-absolute and converted to parent-local storage. */
function uieReparentWidget(child, parentOrNull, absX, absY) {
  if (!child) return false;
  const parent = parentOrNull ? (typeof parentOrNull === "string" ? uieFindWidget(parentOrNull) : parentOrNull) : null;
  if (parent && uieWouldCreateParentCycle(child.id, parent.id)) return false;
  const screenWidgets = uieScreenWidgets(uieEnsureUi().activeScreenId);
  const stack = uieCollectStackPositions(screenWidgets);
  const cur = uieGetWidgetRenderRect(child, stack);
  const ax = absX != null ? absX : cur.x;
  const ay = absY != null ? absY : cur.y;
  const scr = uieActiveScreen();
  if (parent) {
    const pAbs = uieGetWidgetRenderRect(parent, stack);
    child.parent = parent.id;
    child.folderId = null;
    child.x = uieSnapAxis(ax - pAbs.x, "v");
    child.y = uieSnapAxis(ay - pAbs.y, "h");
    if (scr?.rootWidgetIds) scr.rootWidgetIds = scr.rootWidgetIds.filter(id => id !== child.id);
  } else {
    child.parent = null;
    child.x = uieSnapAxis(ax, "v");
    child.y = uieSnapAxis(ay, "h");
    if (scr) {
      scr.rootWidgetIds = scr.rootWidgetIds || [];
      if (!scr.rootWidgetIds.includes(child.id)) scr.rootWidgetIds.push(child.id);
    }
  }
  return true;
}

function uieIsStackChild(w) {
  if (!w.parent) return false;
  const p = uieFindWidget(w.parent);
  return p && uieEnsureWidgetLayout(p).mode !== "free";
}

function uieGetResponsivePreviewSize(baseDev) {
  const rp = uieEnsurePreviewMeta().responsivePreview;
  const scrub = UIE_RESPONSIVE_SCRUB;
  const w = scrub?.width ?? rp.width ?? baseDev.width;
  const h = scrub?.height ?? rp.height ?? baseDev.height;
  return { width: Math.max(100, Number(w) || baseDev.width), height: Math.max(100, Number(h) || baseDev.height) };
}

function uieDeepCloneTemplateWidgets(rootWidget, allWidgets) {
  const idMap = {};
  const cloneIds = new Set();
  const collect = id => {
    if (cloneIds.has(id)) return;
    cloneIds.add(id);
    allWidgets.filter(w => w.parent === id).forEach(c => collect(c.id));
  };
  collect(rootWidget.id);
  const clones = [];
  cloneIds.forEach(oldId => {
    const src = allWidgets.find(w => w.id === oldId);
    if (!src) return;
    const nw = JSON.parse(JSON.stringify(src));
    const newId = uieNextId(nw.type);
    idMap[oldId] = newId;
    nw.id = newId;
    clones.push(nw);
  });
  clones.forEach(nw => {
    if (nw.parent && idMap[nw.parent]) nw.parent = idMap[nw.parent];
    else if (nw.parent && !idMap[nw.parent]) nw.parent = null;
    nw.events = nw.events || {};
    Object.entries(nw.events).forEach(([ev, b]) => {
      if (b?.binding === "navigate" && b.targetScreenId) { /* keep */ }
      else if (b?.nodeId) {
        const node = (CURRENT_WF.nodes || []).find(n => n.id === b.nodeId);
        if (!node) delete nw.events[ev];
      }
    });
  });
  return { widgets: clones, rootId: idMap[rootWidget.id] };
}

function uieSaveAsTemplate(widgetId) {
  const w = uieFindWidget(widgetId);
  if (!w) return null;
  const ui = uieEnsureUi();
  const subtree = [];
  const collect = id => {
    const wd = ui.widgets.find(x => x.id === id);
    if (!wd) return;
    subtree.push(JSON.parse(JSON.stringify(wd)));
    ui.widgets.filter(x => x.parent === id).forEach(c => collect(c.id));
  };
  collect(widgetId);
  const tpl = {
    id: uieNextTemplateId(),
    name: uieWidgetDisplayName(w),
    widgets: subtree,
    rootId: widgetId,
    styleClassId: w.styleClassId || null,
  };
  uieEnsureTemplates().push(tpl);
  return tpl;
}

function uiePlaceTemplate(tplId, x, y) {
  const tpl = uieEnsureTemplates().find(t => t.id === tplId);
  if (!tpl) return null;
  uieDesignerRecordUndo();
  const ui = uieEnsureUi();
  const idMap = {};
  const clones = (tpl.widgets || []).map(src => {
    const nw = JSON.parse(JSON.stringify(src));
    const newId = uieNextId(nw.type);
    idMap[src.id] = newId;
    nw.id = newId;
    nw.screenId = ui.activeScreenId;
    return nw;
  });
  clones.forEach(nw => {
    if (nw.parent && idMap[nw.parent]) nw.parent = idMap[nw.parent];
    else nw.parent = null;
    if (!nw.parent) {
      nw.x = uieSnapAxis(x, "v");
      nw.y = uieSnapAxis(y, "h");
    }
    nw.z = ui.widgets.length + clones.indexOf(nw);
    ui.widgets.push(nw);
  });
  const rootNewId = idMap[tpl.rootId];
  const screen = uieActiveScreen();
  if (screen && rootNewId && !clones.find(c => c.id === rootNewId)?.parent) {
    screen.rootWidgetIds = screen.rootWidgetIds || [];
    screen.rootWidgetIds.push(rootNewId);
  }
  uieSetSelection([rootNewId]);
  return rootNewId;
}

function uieAddScreen(name) {
  uieDesignerRecordUndo();
  const ui = uieEnsureUi();
  const id = uieNextScreenId();
  ui.screens.push({ id, name: name || "Screen", rootWidgetIds: [] });
  ui.activeScreenId = id;
  return id;
}

function uieDuplicateScreen(screenId) {
  uieDesignerRecordUndo();
  const ui = uieEnsureUi();
  const src = uieFindScreen(screenId);
  if (!src) return null;
  const newId = uieNextScreenId();
  const idMap = {};
  const clones = [];
  ui.widgets.filter(w => w.screenId === screenId).forEach(w => {
    const nw = JSON.parse(JSON.stringify(w));
    const nid = uieNextId(nw.type);
    idMap[w.id] = nid;
    nw.id = nid;
    nw.screenId = newId;
    clones.push(nw);
  });
  clones.forEach(nw => {
    if (nw.parent && idMap[nw.parent]) nw.parent = idMap[nw.parent];
    else nw.parent = null;
  });
  const rootIds = (src.rootWidgetIds || []).map(rid => idMap[rid]).filter(Boolean);
  ui.screens.push({ id: newId, name: `${src.name} Copy`, rootWidgetIds: rootIds });
  ui.widgets.push(...clones);
  ui.activeScreenId = newId;
  return newId;
}

function uieDeleteScreen(screenId) {
  const ui = uieEnsureUi();
  if ((ui.screens || []).length <= 1) return false;
  uieDesignerRecordUndo();
  ui.widgets = ui.widgets.filter(w => w.screenId !== screenId);
  ui.screens = ui.screens.filter(s => s.id !== screenId);
  if (ui.activeScreenId === screenId) ui.activeScreenId = ui.screens[0].id;
  uieDeselect();
  return true;
}

function uieBindingLabel(b) {
  if (!b || b.binding === "none") return "";
  if (b.type === "navigate" || b.binding === "navigate") {
    const scr = uieFindScreen(b.targetScreenId);
    return `→ ${scr?.name || b.targetScreenId || "?"}`;
  }
  return "";
}

function uieEnsureUi() {
  if (!CURRENT_WF.ui) CURRENT_WF.ui = { widgets: [], device: "phone" };
  if (!Array.isArray(CURRENT_WF.ui.widgets)) CURRENT_WF.ui.widgets = [];
  if (!Array.isArray(CURRENT_WF.ui.folders)) CURRENT_WF.ui.folders = [];
  if (!Array.isArray(CURRENT_WF.ui.keybinds)) CURRENT_WF.ui.keybinds = [];
  if (!CURRENT_WF.ui.view) CURRENT_WF.ui.view = { zoom: 1, panX: 0, panY: 0 };
  CURRENT_WF.ui.device = uieNormalizeDevice(CURRENT_WF.ui.device);
  uieEnsureStyles();
  uieEnsureTemplates();
  uieEnsureTokens();
  uieEnsureAssets();
  uieEnsurePreviewMeta();
  uieMigrateScreens(CURRENT_WF.ui);
  return CURRENT_WF.ui;
}

function uieWidgetEventNames(w) {
  const base = [...(UIE_WIDGET_EVENTS[w.type] || [])];
  const b = (w.props || {}).behavior || {};
  if (b.dropZone) base.push(...UIE_BEHAVIOR_EVENTS.dropZone);
  if (b.detectHover) base.push(...UIE_BEHAVIOR_EVENTS.detectHover);
  return [...new Set(base)];
}

function uieWidgetDisplayName(w) {
  return (w.props && w.props.name) || w.id;
}

function uieNextFolderId() {
  const ui = uieEnsureUi();
  let n = ui.folders.length + 1;
  let id = `folder_${n}`;
  while (ui.folders.some(f => f.id === id)) { n += 1; id = `folder_${n}`; }
  return id;
}

function uieAssetCss(key) {
  const a = UIE_ASSETS[key];
  if (!a) return "";
  return a.css;
}

function uieStateStyle(w, stateKey) {
  const st = ((w.props || {}).states || {})[stateKey] || {};
  const parts = [];
  if (st.bg) parts.push(`background:${st.bg}`);
  if (st.fg) parts.push(`color:${st.fg}`);
  if (st.opacity != null && st.opacity !== "") parts.push(`opacity:${Number(st.opacity)}`);
  if (st.scale != null && st.scale !== "" && Number(st.scale) !== 1) parts.push(`transform:scale(${Number(st.scale)})`);
  return parts.join(";");
}

function uieStateCodegenComments(w) {
  const states = (w.props || {}).states || {};
  const lines = [];
  if (w.type === "button") {
    if (states.hover && states.hover.bg) lines.push(`activebackground=${states.hover.bg}  # hover bg`);
    if (states.pressed && states.pressed.bg) lines.push(`activebackground=${states.pressed.bg}  # pressed bg`);
    if (states.disabled) lines.push("# disabled: use state=tk.DISABLED");
  } else if (Object.keys(states).length) {
    lines.push("# tkinter has limited per-state styling for " + w.type);
  }
  return lines;
}

function uieInDesigner() {
  return (typeof STUDIO_TAB !== "undefined" && STUDIO_TAB === "designer") || !!document.getElementById("uie-designer-root");
}

function uieRefreshDesigner() {
  if (typeof renderAutomationStudioView === "function") renderAutomationStudioView();
  else {
    const root = document.getElementById("studio-designer-panel") || document.getElementById("uie-designer-root")?.parentElement;
    if (root && typeof uieRenderDesigner === "function") {
      root.innerHTML = uieRenderDesigner();
      uieWireDesigner();
    }
  }
}
function uieDeselect() {
  UIE_SELECTED = null;
  UIE_SELECTED_IDS = [];
  UIE_FOLDER_RENAME = null;
  uieCancelPlacement();
}

function uieCancelPlacement() {
  UIE_PLACE_ARMED = null;
  document.getElementById("uie-place-ghost")?.remove();
  document.body.classList.remove("uie-place-mode");
  const wrap = document.getElementById("uie-canvas-wrap");
  if (wrap) wrap.classList.remove("uie-place-mode");
}

function uieSnap(v, axis) {
  if (axis === "v" || axis === "h") return uieSnapAxis(v, axis);
  const size = uieGridSize();
  return Math.round(v / size) * size;
}

function uieFindWidget(id) {
  return uieEnsureUi().widgets.find(w => w.id === id);
}

function uieDefaultProps(type) {
  const base = {
    text: "", bg: "", fg: "", fontSize: 12, visible: true, enabled: true,
    behavior: { draggable: false, dropZone: false, detectHover: false },
    states: {},
  };
  if (type === "button") return { ...base, text: "Button" };
  if (type === "label") return { ...base, text: "Label", textVariable: "" };
  if (type === "entry") return { ...base, text: "" };
  if (type === "scale") return { ...base, min: 0, max: 100, value: 50 };
  if (type === "checkbutton") return { ...base, text: "Check", checked: false };
  if (type === "combobox") return { ...base, values: ["A", "B", "C"], text: "A" };
  if (type === "progressbar") return { ...base, value: 40, max: 100 };
  if (type === "image") return { ...base, text: "Image", imageSrc: "", imageAlt: "", imageFit: "cover" };
  if (type === "wp_add_task") return { ...base, text: "Add Task", titleTemplate: "New task", urgency: "medium" };
  if (type === "wp_log_pulse") return { ...base, text: "Log Pulse", happiness: 5 };
  if (type === "wp_open_app") return { ...base, text: "Open Tab", targetTab: "Today" };
  if (type === "wp_run_blueprint") return { ...base, text: "Run Blueprint", workflowId: "" };
  if (type === "wp_data_list") return { ...base, text: "Data" };
  return base;
}

function uieNextId(type) {
  const ui = uieEnsureUi();
  let n = ui.widgets.length + 1;
  let id = `${type}_${n}`;
  while (ui.widgets.some(w => w.id === id)) { n += 1; id = `${type}_${n}`; }
  return id;
}

function uieAddWidget(type, x, y, parent) {
  uieDesignerRecordUndo();
  const spec = UIE_WIDGET_TYPES.find(t => t.type === type)
    || UIE_WAYPOINT_WIDGETS.find(t => t.type === type)
    || { w: 100, h: 32 };
  const ui = uieEnsureUi();
  const screenId = ui.activeScreenId;
  let parentId = null;
  let lx = x;
  let ly = y;
  if (parent) {
    const p = typeof parent === "string" ? uieFindWidget(parent) : parent;
    if (p && uieCanHostChildren(p)) {
      parentId = p.id;
      const stack = uieCollectStackPositions(uieScreenWidgets(screenId));
      const pr = uieGetWidgetRenderRect(p, stack);
      lx = x - pr.x;
      ly = y - pr.y;
    }
  }
  const w = {
    id: uieNextId(type),
    type,
    parent: parentId,
    screenId,
    x: uieSnapAxis(lx, "v"),
    y: uieSnapAxis(ly, "h"),
    width: spec.w,
    height: spec.h,
    props: uieDefaultProps(type),
    events: {},
    effects: [],
    animations: [],
    layout: (type === "frame" || type === "canvas")
      ? { mode: "free", spacing: 8, padding: 0, align: "start" }
      : undefined,
    z: ui.widgets.length,
  };
  ui.widgets.push(w);
  if (!parentId) {
    const scr = uieActiveScreen();
    if (scr) {
      scr.rootWidgetIds = scr.rootWidgetIds || [];
      if (!scr.rootWidgetIds.includes(w.id)) scr.rootWidgetIds.push(w.id);
    }
  }
  uieSetSelection([w.id], { scrollIntoView: true });
  return w;
}

function uieDeleteWidget(id, skipConfirm) {
  const w = uieFindWidget(id);
  if (!w) return;
  const evs = w.events || {};
  const hasBindings = Object.values(evs).some(b => b && b.binding && b.binding !== "none" && (b.nodeId || b.type === "navigate" || b.binding === "navigate"));
  if (hasBindings && !skipConfirm && !window.confirm(`Delete widget "${uieWidgetDisplayName(w)}" with bindings?`)) return;
  uieDesignerRecordUndo();
  const ui = uieEnsureUi();
  const removeIds = new Set([id, ...uieWidgetDescendantIds(id)]);
  ui.widgets = ui.widgets.filter(wd => !removeIds.has(wd.id));
  (ui.screens || []).forEach(s => {
    if (s.rootWidgetIds) s.rootWidgetIds = s.rootWidgetIds.filter(rid => !removeIds.has(rid));
  });
  UIE_SELECTED_IDS = UIE_SELECTED_IDS.filter(sid => !removeIds.has(sid));
  uieSyncSelection();
}

function uieStylesHtml() {
  return `<style>
    .uie-root { display:flex; flex-direction:column; height:calc(100vh - 52px); min-height:480px; }
    .uie-toolbar { display:flex; gap:8px; align-items:center; padding:6px 10px; border-bottom:1px solid var(--border); font-size:11px; flex-wrap:wrap; }
    .uie-main { display:flex; flex:1; min-height:0; }
    .uie-palette, .uie-hierarchy { width:240px; flex-shrink:0; border-right:1px solid var(--border); overflow:auto; padding:8px; font-size:11px; }
    .uie-center { flex:1; display:flex; flex-direction:column; min-width:0; }
    .uie-canvas-wrap { flex:1; overflow:hidden; background:var(--bg-shell); position:relative; cursor:default; }
    .uie-canvas-wrap.uie-panning { cursor:grabbing; }
    .uie-canvas-wrap.uie-place-mode { cursor:crosshair; }
    .uie-viewport { position:absolute; top:50%; left:50%; transform-origin:0 0; will-change:transform; }
    .uie-viewport-pad { box-sizing:content-box; }
    .uie-device-frame { position:relative; background:#1a1a1a; border:2px solid var(--border); box-shadow:0 4px 24px rgba(0,0,0,.35); }
    .uie-canvas { position:relative; background:#2b2b2b; overflow:hidden; color:#f2f2f2; }
    .uie-inspector { width:320px; flex-shrink:0; border-left:1px solid var(--border); overflow:auto; padding:8px; font-size:11px; position:relative; z-index:20; }
    .uie-palette { position:relative; z-index:20; }
    .uie-palette-tabs { display:flex; gap:4px; margin-bottom:8px; }
    .uie-palette-tabs button { flex:1; font-size:10px; padding:4px 6px; }
    .uie-palette-tabs button.uie-tab-active { background:color-mix(in srgb,var(--accent) 25%,transparent); border-color:var(--accent); }
    .uie-palette-item { padding:6px 8px; margin:2px 0; border:1px solid var(--border); border-radius:4px; cursor:grab; background:var(--bg-card); user-select:none; }
    .uie-palette-item.uie-armed { outline:2px solid var(--accent); background:color-mix(in srgb,var(--accent) 15%,transparent); }
    .uie-palette-item:active { cursor:grabbing; }
    .uie-asset-swatch { width:100%; height:28px; border-radius:3px; margin-top:4px; border:1px solid var(--border); }
    .uie-hierarchy-item { padding:4px 6px; margin:1px 0; border-radius:3px; cursor:pointer; display:flex; gap:4px; align-items:center; }
    .uie-hierarchy-item.uie-selected { background:color-mix(in srgb,var(--accent) 20%,transparent); outline:1px solid var(--accent); }
    .uie-hierarchy-item.uie-folder { font-weight:600; }
    .uie-hierarchy-rename { flex:1; min-width:0; font-size:11px; padding:1px 4px; }
    .uie-widget { position:absolute; box-sizing:border-box; border:1px solid transparent; cursor:move; user-select:none; overflow:hidden; font-size:12px; }
    .uie-widget.uie-design-mode { border:1px solid #666; }
    .uie-widget.uie-design-mode.uie-selected { border-color:var(--accent); outline:2px solid var(--accent); outline-offset:0; z-index:5; box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent); }
    .uie-widget.uie-selected { outline:2px solid var(--accent); z-index:5; }
    .uie-widget.uie-design-mode > * { pointer-events:none !important; }
    .uie-widget.uie-design-mode .uie-binding-chip { pointer-events:auto; }
    .uie-w-btn-design { display:inline-flex; align-items:center; justify-content:center; width:100%; height:100%; border:1px solid #666; border-radius:3px; background:#444; color:#f2f2f2; box-sizing:border-box; }
    .uie-w-entry-design, .uie-w-combo-design { display:block; width:100%; height:100%; border:1px solid #666; border-radius:3px; background:#333; padding:2px 6px; box-sizing:border-box; color:#f2f2f2; }
    .uie-w-label, .uie-w-check { display:block; width:100%; height:100%; color:#f2f2f2; box-sizing:border-box; }
    .uie-w-progress { width:100%; height:100%; box-sizing:border-box; background:#2a2a2a; border:1px solid #666; border-radius:2px; overflow:hidden; }
    .uie-selection-layer { position:absolute; inset:0; pointer-events:none; z-index:8; overflow:visible; }
    .uie-selection-box { box-sizing:border-box; outline-offset:0; transform:translateZ(0); }
    .uie-group-box { box-sizing:border-box; transform:translateZ(0); }
    .uie-resize-handle { position:absolute; width:8px; height:8px; background:var(--accent); border:1px solid #fff; z-index:9; pointer-events:auto; box-sizing:border-box; transform:translateZ(0); }
    .uie-resize-nw { top:0; left:0; cursor:nwse-resize; }
    .uie-resize-n { top:0; left:50%; margin-left:-4px; cursor:ns-resize; }
    .uie-resize-ne { top:0; right:0; cursor:nesw-resize; }
    .uie-resize-e { top:50%; right:0; margin-top:-4px; cursor:ew-resize; }
    .uie-resize-se { bottom:0; right:0; cursor:nwse-resize; }
    .uie-resize-s { bottom:0; left:50%; margin-left:-4px; cursor:ns-resize; }
    .uie-resize-sw { bottom:0; left:0; cursor:nesw-resize; }
    .uie-resize-w { top:50%; left:0; margin-top:-4px; cursor:ew-resize; }
    .uie-bounds-label { position:absolute; top:-18px; left:0; font-size:10px; color:var(--accent); white-space:nowrap; pointer-events:none; }
    .uie-guide { position:absolute; background:cyan; opacity:.7; pointer-events:none; z-index:4; }
    .uie-guide-h { height:1px; left:0; right:0; }
    .uie-guide-v { width:1px; top:0; bottom:0; }
    .uie-distance { position:absolute; font-size:10px; color:cyan; background:rgba(0,0,0,.6); padding:1px 4px; pointer-events:none; z-index:4; }
    .uie-binding-chip { position:absolute; top:2px; right:2px; font-size:9px; padding:1px 4px; background:var(--accent); color:#fff; border-radius:3px; cursor:pointer; z-index:7; pointer-events:auto; }
    .uie-events-drawer { border-top:1px solid var(--border); padding:8px; max-height:160px; min-height:0; flex-shrink:0; overflow:auto; font-size:11px; }
    .uie-inspector-section { margin-bottom:8px; border:1px solid var(--border); border-radius:4px; }
    .uie-inspector-section summary { padding:6px 8px; cursor:pointer; font-size:11px; font-weight:600; color:var(--ink-muted); text-transform:uppercase; letter-spacing:.04em; list-style:none; }
    .uie-inspector-section summary::-webkit-details-marker { display:none; }
    .uie-inspector-section[open] summary { border-bottom:1px solid var(--border); }
    .uie-inspector-body { padding:6px 8px; }
    .uie-inspector-row { display:grid; grid-template-columns:72px 1fr; gap:6px; align-items:center; margin:4px 0; }
    .uie-inspector-row label { color:var(--ink-muted); font-size:11px; }
    .uie-inspector-row input, .uie-inspector-row select { min-width:0; font-size:11px; width:100%; }
    .uie-inspector-row input:disabled, .uie-inspector-row select:disabled, .uie-inspector-row button:disabled { opacity: 0.45; cursor: not-allowed; }
    .uie-empty-stub {
      font-size: 11px;
      color: var(--ink-muted);
      padding: 8px 6px;
      line-height: 1.45;
      border: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
      border-radius: 4px;
      background: color-mix(in srgb, var(--bg-shell) 50%, transparent);
    }
    .uie-empty-hint { font-size: 10px; margin-top: 4px; opacity: 0.85; }
    .uie-inspector-row.uie-row-span { grid-template-columns:1fr; }
    .uie-anchor-grid { display:grid; grid-template-columns:repeat(3,24px); gap:2px; margin-top:4px; }
    .uie-anchor-grid button { width:24px; height:24px; padding:0; font-size:9px; }
    .uie-preview-root { display:flex; height:calc(100vh - 52px); min-height:480px; }
    .uie-preview-main { flex:1; display:flex; flex-direction:column; min-width:0; }
    .uie-preview-canvas-wrap { flex:1; overflow:auto; display:flex; align-items:center; justify-content:center; padding:16px; background:var(--bg-shell); }
    .uie-state-panel { width:220px; border-left:1px solid var(--border); padding:8px; font-size:11px; overflow:auto; flex-shrink:0; }
    .uie-keys-panel { border-top:1px solid var(--border); margin-top:8px; padding-top:8px; }
    .uie-key-row { display:grid; grid-template-columns:1fr 1fr auto; gap:4px; margin:4px 0; align-items:center; }
    .uie-state-row { display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border); }
    .uie-bindings-table { width:100%; border-collapse:collapse; font-size:11px; }
    .uie-bindings-table th, .uie-bindings-table td { border:1px solid var(--border); padding:6px 8px; text-align:left; }
    .uie-bindings-table tr.uie-bind-error { background:color-mix(in srgb,var(--status-critical) 15%,transparent); }
    .uie-ghost, .uie-place-ghost { position:fixed; pointer-events:none; opacity:.7; z-index:9999; border:1px dashed var(--accent); background:color-mix(in srgb,var(--accent) 20%,transparent); }
    .uie-zoom-badge { font-size:10px; padding:2px 6px; border:1px solid var(--border); border-radius:3px; min-width:42px; text-align:center; }
    #uie-recenter-btn { padding:2px 8px; font-size:13px; line-height:1; min-width:28px; }
    .uie-search-box { flex:1; min-width:120px; max-width:220px; font-size:11px; padding:3px 6px; }
    .uie-state-preview-btns { display:flex; gap:4px; flex-wrap:wrap; }
    .uie-state-preview-btns button { font-size:10px; padding:2px 6px; }
    .uie-state-preview-btns button.uie-active { background:color-mix(in srgb,var(--accent) 25%,transparent); }
    .uie-widget.uie-drop-highlight { outline:2px dashed #4ade80; outline-offset:1px; }
    .uie-widget[data-uie-host="1"] { box-shadow: inset 0 0 0 1px rgba(74,222,128,.25); }
    .uie-hier-root { opacity:0.85; border:1px dashed var(--border); margin-bottom:6px; }
    .uie-hier-root.uie-drop-hover, .uie-hierarchy-item.uie-drop-hover { outline:1px dashed var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); }
    .uie-widget.uie-state-hover { }
    .uie-widget.uie-state-pressed { }
    .uie-widget.uie-state-disabled { opacity:.5; filter:grayscale(.4); }
    .uie-wp-btn { display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;border:1px solid #666;border-radius:3px;background:#444;color:inherit;box-sizing:border-box;font-size:12px;cursor:pointer; }
    .uie-wp-data { width:100%;height:100%;overflow:auto;font-size:10px;padding:4px;box-sizing:border-box;background:rgba(0,0,0,.2); }
    .uie-wp-data-row { display:flex;gap:4px;align-items:center;padding:2px 0;border-bottom:1px solid var(--border); }
    .uie-wp-data-form { margin-top:4px;padding:4px;border:1px dashed var(--border);border-radius:3px; }
    .uie-wp-data-form label { display:block;font-size:9px;color:var(--ink-muted); }
    .uie-wp-data-form input { width:100%;font-size:10px;margin-bottom:4px; }
    .uie-wp-data-note { font-size:9px;color:var(--ink-muted);margin-bottom:4px;font-style:italic; }
    .uie-data-schema-row { display:grid;grid-template-columns:1fr 80px auto;gap:4px;margin:4px 0;align-items:center; }
    .uie-canvas-toolbar { display:flex;gap:6px;align-items:center;padding:4px 8px;border-bottom:1px solid var(--border);font-size:10px;flex-wrap:wrap;background:var(--bg-card); }
    .uie-canvas-toolbar label { display:flex;align-items:center;gap:3px; }
    .uie-canvas-toolbar button.uie-toggle-on { background:color-mix(in srgb,var(--accent) 25%,transparent); border-color:var(--accent); }
    .uie-canvas-area { flex:1; display:flex; flex-direction:column; min-height:0; position:relative; }
    .uie-ruler-corner { width:20px; height:20px; flex-shrink:0; background:var(--bg-card); border-right:1px solid var(--border); border-bottom:1px solid var(--border); }
    .uie-ruler-h { height:20px; flex-shrink:0; position:relative; overflow:hidden; background:var(--bg-card); border-bottom:1px solid var(--border); }
    .uie-ruler-v { width:20px; flex-shrink:0; position:relative; overflow:hidden; background:var(--bg-card); border-right:1px solid var(--border); }
    .uie-ruler-tick { position:absolute; font-size:8px; color:var(--ink-muted); pointer-events:none; }
    .uie-ruler-h .uie-ruler-tick { border-left:1px solid var(--border); height:100%; padding-left:2px; }
    .uie-ruler-v .uie-ruler-tick { border-top:1px solid var(--border); width:100%; padding-top:1px; text-align:right; padding-right:2px; }
    .uie-canvas-row { display:flex; flex:1; min-height:0; }
    .uie-canvas-col { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
    .uie-guide-line { position:absolute; background:cyan; opacity:.75; z-index:6; pointer-events:auto; }
    .uie-guide-line.uie-guide-h { height:1px; left:0; right:0; cursor:ns-resize; }
    .uie-guide-line.uie-guide-v { width:1px; top:0; bottom:0; cursor:ew-resize; }
    .uie-guide-line.uie-guide-locked { opacity:.4; cursor:not-allowed; }
    .uie-guide-label { position:absolute; font-size:9px; color:#0ff; background:rgba(0,0,0,.7); padding:1px 3px; border-radius:2px; pointer-events:auto; cursor:text; z-index:7; white-space:nowrap; }
    .uie-marquee { position:absolute; border:1px dashed var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); z-index:10; pointer-events:none; }
    .uie-group-box { position:absolute; border:1px dashed #f59e0b; pointer-events:none; z-index:7; }
    .uie-group-outline { position:absolute; outline:1px solid color-mix(in srgb,var(--accent) 55%,transparent); outline-offset:0; pointer-events:none; z-index:6; box-sizing:border-box; }
    .studio-tb-hint { font-size:10px; color:var(--ink-muted); padding:0 4px; white-space:nowrap; }
    .uie-align-toolbar { display:flex;gap:2px;flex-wrap:wrap; }
    .uie-align-toolbar button { font-size:9px; padding:2px 4px; min-width:22px; }
    .uie-effect-row { border:1px solid var(--border); border-radius:4px; margin:4px 0; background:var(--bg-card); }
    .uie-effect-row.uie-effect-disabled { opacity:.5; }
    .uie-effect-header { display:flex; align-items:center; gap:4px; padding:4px 6px; cursor:grab; font-size:10px; }
    .uie-effect-body { padding:4px 8px 8px; border-top:1px solid var(--border); }
    .uie-effect-add-menu { position:relative; }
    .uie-effect-add-dropdown { position:absolute; top:100%; left:0; z-index:30; background:var(--bg-card); border:1px solid var(--border); border-radius:4px; min-width:160px; max-height:200px; overflow:auto; }
    .uie-effect-add-dropdown button { display:block; width:100%; text-align:left; font-size:10px; padding:4px 8px; border:none; background:transparent; cursor:pointer; }
    .uie-effect-add-dropdown button:hover { background:color-mix(in srgb,var(--accent) 15%,transparent); }
    .uie-anim-row { border:1px solid var(--border); border-radius:4px; margin:4px 0; padding:6px; font-size:10px; }
    .uie-code-block { font-family:monospace; font-size:10px; background:var(--bg-shell); border:1px solid var(--border); border-radius:4px; padding:8px; max-height:200px; overflow:auto; white-space:pre-wrap; word-break:break-all; }
    .uie-code-tabs { display:flex; gap:4px; margin-bottom:6px; }
    .uie-code-tabs button.uie-tab-active { background:color-mix(in srgb,var(--accent) 25%,transparent); border-color:var(--accent); }
    .uie-bindings-overlay { position:absolute; inset:0; pointer-events:none; z-index:12; overflow:visible; }
    .uie-bind-connector { stroke-width:2; fill:none; pointer-events:stroke; }
    .uie-bind-connector.uie-bind-event { stroke:#3b82f6; }
    .uie-bind-connector.uie-bind-data { stroke:#a855f7; }
    .uie-bind-connector.uie-bind-cmd { stroke:#eab308; }
    .uie-bind-connector.uie-bind-missing { stroke:#ef4444; stroke-dasharray:6 4; }
    .uie-bind-chip-strip { position:absolute; right:4px; top:0; width:100px; display:flex; flex-direction:column; gap:4px; pointer-events:auto; z-index:13; }
    .uie-bind-chip-item { font-size:9px; padding:3px 6px; border-radius:4px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border:1px solid var(--border); background:var(--bg-card); }
    .uie-bind-chip-item.uie-bind-event { border-color:#3b82f6; }
    .uie-bind-chip-item.uie-bind-data { border-color:#a855f7; }
    .uie-bind-chip-item.uie-bind-cmd { border-color:#eab308; }
    .uie-bind-chip-item.uie-bind-missing { border-color:#ef4444; color:#ef4444; }
    .uie-bind-chip-item:hover, .uie-bind-chip-item.uie-bind-hover { background:color-mix(in srgb,var(--accent) 20%,transparent); }
    .uie-hierarchy-z { font-size:8px; color:var(--ink-muted); margin-left:2px; }
    .uie-widget.uie-wireframe { background:transparent !important; border:1px dashed #888 !important; }
    .uie-widget.uie-wireframe::after { content:attr(data-uie-name); position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:9px; color:#aaa; pointer-events:none; }
    .uie-widget.uie-dimmed { opacity:.25 !important; }
    .uie-widget.uie-isolate-hidden { display:none !important; }
    .uie-generated-console { border-top:1px solid var(--border); max-height:180px; overflow:auto; font-size:10px; font-family:monospace; padding:8px; background:var(--bg-shell); }
    .uie-generated-console .uie-code-highlight { background:color-mix(in srgb,var(--accent) 25%,transparent); }
    .uie-screen-switcher { width:120px; flex-shrink:0; border-right:1px solid var(--border); padding:8px 6px; font-size:10px; overflow:auto; background:var(--bg-card); }
    .uie-screen-switcher-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
    .uie-screen-item { padding:4px 6px; margin:2px 0; border-radius:3px; cursor:pointer; border:1px solid transparent; }
    .uie-screen-item.uie-screen-active { background:color-mix(in srgb,var(--accent) 20%,transparent); border-color:var(--accent); }
    .uie-screen-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .uie-screen-actions { display:flex; gap:2px; margin-top:2px; }
    .uie-screen-actions button { font-size:8px; padding:0 3px; }
    .uie-canvas-with-screens { display:flex; flex:1; min-height:0; min-width:0; }
    .uie-token-badge { font-size:8px; color:var(--accent); margin-left:2px; }
    .uie-override-badge { font-size:8px; padding:0 4px; border-radius:3px; border:1px solid var(--accent); background:color-mix(in srgb,var(--accent) 15%,transparent); cursor:pointer; }
    .uie-binding-navigate { background:#10b981; }
    .uie-responsive-handle { position:absolute; background:var(--accent); opacity:.85; z-index:15; pointer-events:auto; }
    .uie-responsive-handle-e, .uie-responsive-handle-w { top:50%; width:6px; height:32px; margin-top:-16px; cursor:ew-resize; }
    .uie-responsive-handle-e { right:-3px; }
    .uie-responsive-handle-w { left:-3px; }
    .uie-responsive-handle-n, .uie-responsive-handle-s { left:50%; height:6px; width:32px; margin-left:-16px; cursor:ns-resize; }
    .uie-responsive-handle-n { top:-3px; }
    .uie-responsive-handle-s { bottom:-3px; }
    .uie-responsive-bar { display:flex; gap:6px; align-items:center; padding:4px 8px; font-size:10px; border-bottom:1px solid var(--border); background:var(--bg-card); }
    .uie-uploaded-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:6px; margin-top:6px; }
    .uie-uploaded-item { border:1px solid var(--border); border-radius:4px; padding:4px; background:var(--bg-card); cursor:grab; position:relative; }
    .uie-uploaded-item img { width:100%; height:56px; object-fit:cover; border-radius:3px; display:block; }
    .uie-uploaded-name { width:100%; font-size:9px; margin-top:4px; border:1px solid var(--border); border-radius:2px; background:var(--bg-shell); color:inherit; }
    .uie-uploaded-item button[data-uie-asset-del] { position:absolute; top:2px; right:2px; font-size:9px; padding:0 4px; line-height:1.2; }
    .uie-asset-section-label { font-size:10px; color:var(--ink-muted); margin:10px 0 4px; font-weight:600; }
    .uie-screen-bg { pointer-events:none; }
  </style>`;
}

function uieWidgetInnerHtml(w, preview, designMode) {
  const p = designMode || preview ? uieEffectiveWidgetProps(w) : (w.props || {});
  const esc = escapeHtml;
  if (designMode) {
    if (w.type === "button") return `<span class="uie-w-btn uie-w-btn-design">${esc(p.text || "Button")}</span>`;
    if (w.type === "label") return `<span class="uie-w-label">${esc(p.text || "Label")}</span>`;
    if (w.type === "entry") return `<span class="uie-w-entry-design">${esc(p.text || "")}</span>`;
    if (w.type === "scale") return `<span class="uie-w-entry-design">Scale ${p.value ?? 50}</span>`;
    if (w.type === "checkbutton") return `<span class="uie-w-check">${p.checked ? "☑" : "☐"} ${esc(p.text || "Check")}</span>`;
    if (w.type === "combobox") return `<span class="uie-w-combo-design">${esc(p.text || "A")}</span>`;
    if (w.type === "progressbar") {
      const pct = Math.round(100 * (p.value || 0) / (p.max || 100));
      return `<div class="uie-w-progress"><div style="width:${pct}%;height:100%;background:var(--accent);"></div></div>`;
    }
    if (w.type === "frame") return `<div class="uie-w-frame" style="width:100%;height:100%;border:1px solid #666;"></div>`;
    if (w.type === "canvas") return `<canvas class="uie-w-canvas" width="${w.width}" height="${w.height}" style="width:100%;height:100%;background:#111;"></canvas>`;
    if (w.type === "image") return uieRenderImageWidgetInner(w, p, esc);
    if (w.type === "wp_add_task" || w.type === "wp_log_pulse" || w.type === "wp_open_app" || w.type === "wp_run_blueprint") {
      return `<span class="uie-w-btn uie-w-btn-design">${esc(p.text || w.type)}</span>`;
    }
    if (w.type === "wp_data_list") return `<div class="uie-wp-data"><span class="stub">Data List</span></div>`;
    return "";
  }
  if (w.type === "wp_add_task") return `<button type="button" class="uie-wp-btn" data-uie-wp-action="add_task" data-uie-wp-id="${esc(w.id)}">${esc(p.text || "Add Task")}</button>`;
  if (w.type === "wp_log_pulse") return `<button type="button" class="uie-wp-btn" data-uie-wp-action="log_pulse" data-uie-wp-id="${esc(w.id)}">${esc(p.text || "Log Pulse")} (${Number(p.happiness) || 5})</button>`;
  if (w.type === "wp_open_app") return `<button type="button" class="uie-wp-btn" data-uie-wp-action="open_app" data-uie-wp-id="${esc(w.id)}">${esc(p.text || "Open Tab")}</button>`;
  if (w.type === "wp_run_blueprint") return `<button type="button" class="uie-wp-btn" data-uie-wp-action="run_blueprint" data-uie-wp-id="${esc(w.id)}">${esc(p.text || "Run Blueprint")}</button>`;
  if (w.type === "wp_data_list") return `<div class="uie-wp-data" data-uie-wp-data="${esc(w.id)}"><div class="stub">Loading…</div></div>`;
  if (w.type === "button") return `<button type="button" class="uie-w-btn" ${p.enabled === false ? "disabled" : ""}>${esc(p.text || "Button")}</button>`;
  if (w.type === "label") {
    let txt = p.text || "Label";
    if (preview && p.textVariable) {
      const v = UIE_PREVIEW_STATE[p.textVariable];
      if (v !== undefined) txt = String(v);
    }
    return `<span class="uie-w-label">${esc(txt)}</span>`;
  }
  if (w.type === "entry") return `<input type="text" class="uie-w-entry" value="${esc(p.text || "")}" ${p.enabled === false ? "disabled" : ""}>`;
  if (w.type === "scale") return `<input type="range" class="uie-w-scale" min="${p.min || 0}" max="${p.max || 100}" value="${p.value || 0}" ${p.enabled === false ? "disabled" : ""}>`;
  if (w.type === "checkbutton") return `<label class="uie-w-check"><input type="checkbox" ${p.checked ? "checked" : ""} ${p.enabled === false ? "disabled" : ""}> ${esc(p.text || "Check")}</label>`;
  if (w.type === "combobox") {
    const vals = p.values || [];
    return `<select class="uie-w-combo" ${p.enabled === false ? "disabled" : ""}>${vals.map(v => `<option ${v === p.text ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
  }
  if (w.type === "progressbar") {
    const pct = Math.round(100 * (p.value || 0) / (p.max || 100));
    return `<div class="uie-w-progress"><div style="width:${pct}%;height:100%;background:var(--accent);"></div></div>`;
  }
  if (w.type === "frame") return `<div class="uie-w-frame" style="width:100%;height:100%;border:1px solid #666;"></div>`;
  if (w.type === "canvas") return `<canvas class="uie-w-canvas" width="${w.width}" height="${w.height}" style="width:100%;height:100%;background:#111;"></canvas>`;
  if (w.type === "image") return uieRenderImageWidgetInner(w, p, esc);
  return "";
}

function uieWidgetStyleExtra(w, preview) {
  const p = uieEffectiveWidgetProps(w);
  const extra = [];
  const parsedBg = uieParseBgAsset(p.bgAsset);
  if (parsedBg) {
    const tex = p.bgTexture || uieDefaultBgTexture();
    const bgParts = uieBgTextureCss(tex, parsedBg.kind === "upload" ? parsedBg.url : null, parsedBg.kind === "builtin" ? parsedBg.asset : null);
    extra.push(...bgParts);
  } else if (p.bg) {
    const bgCss = uiePropToCss(p.bg);
    if (bgCss) extra.push(`background:${escapeHtml(bgCss)}`);
  }
  if (p.fg) {
    const fgCss = uiePropToCss(p.fg);
    if (fgCss) extra.push(`color:${escapeHtml(fgCss)}`);
  }
  if (p.fontSize) extra.push(`font-size:${Number(p.fontSize)}px`);
  if (p.fontFamily) {
    const ff = uiePropToCss(p.fontFamily);
    if (ff) extra.push(`font-family:${escapeHtml(ff)}`);
  }
  if (p.visible === false) extra.push(preview ? "display:none" : "opacity:.35");
  extra.push(...uieApplyEffectsCss(w));
  if (preview) {
    const b = p.behavior || {};
    if (b.draggable) extra.push("cursor:grab");
    if (b.dropZone) extra.push("outline:1px dashed rgba(74,222,128,.35)");
  }
  if (preview && UIE_STATE_PREVIEW) {
    const st = uieStateStyle(w, UIE_STATE_PREVIEW);
    if (st) extra.push(st);
  }
  if (!preview && UIE_STATE_PREVIEW && uieIsSelected(w.id)) {
    const st = uieStateStyle(w, UIE_STATE_PREVIEW);
    if (st) extra.push(st);
  }
  return extra;
}

function uieSelectionHandlesHtml(w) {
  return `
    <span class="uie-bounds-label">${w.width}×${w.height} @ ${w.x},${w.y}</span>
    <span class="uie-resize-handle uie-resize-nw" data-uie-handle="nw"></span>
    <span class="uie-resize-handle uie-resize-n" data-uie-handle="n"></span>
    <span class="uie-resize-handle uie-resize-ne" data-uie-handle="ne"></span>
    <span class="uie-resize-handle uie-resize-e" data-uie-handle="e"></span>
    <span class="uie-resize-handle uie-resize-se" data-uie-handle="se"></span>
    <span class="uie-resize-handle uie-resize-s" data-uie-handle="s"></span>
    <span class="uie-resize-handle uie-resize-sw" data-uie-handle="sw"></span>
    <span class="uie-resize-handle uie-resize-w" data-uie-handle="w"></span>`;
}

function uieBindingChip(w) {
  const evs = w.events || {};
  const navigate = Object.entries(evs).find(([, b]) => b && (b.type === "navigate" || b.binding === "navigate"));
  if (navigate) {
    const [evName, b] = navigate;
    return `<span class="uie-binding-chip uie-binding-navigate" data-uie-chip="${escapeHtml(w.id)}" data-uie-ev="${escapeHtml(evName)}" title="Navigate binding">🧭 ${escapeHtml(uieBindingLabel(b))}</span>`;
  }
  const bound = Object.entries(evs).find(([, b]) => b && b.binding && b.binding !== "none" && b.nodeId);
  if (!bound) return "";
  const [evName, b] = bound;
  return `<span class="uie-binding-chip" data-uie-chip="${escapeHtml(w.id)}" data-uie-ev="${escapeHtml(evName)}" title="Go to graph event">⚡ ${escapeHtml(evName)}</span>`;
}

function uieRenderWidgetOnCanvas(w, selected, preview, stackPositions, renderRect) {
  const p = uieEffectiveWidgetProps(w);
  const designMode = !preview;
  const canvas = uieEnsureCanvas();
  const rect = renderRect || uieGetWidgetRenderRect(w, stackPositions);
  const style = `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:${uieWidgetZ(w)};`;
  const extra = uieWidgetStyleExtra(w, preview);
  const stateCls = preview && UIE_STATE_PREVIEW ? ` uie-state-${UIE_STATE_PREVIEW}` : "";
  const sel = selected ? " uie-selected" : "";
  const designCls = designMode ? " uie-design-mode" : "";
  const wireCls = !preview && canvas.wireframe ? " uie-wireframe" : "";
  const dimCls = !preview && canvas.dimOthers && !uieIsSelected(w.id) ? " uie-dimmed" : "";
  const isoCls = UIE_ISOLATE_MODE && !uieIsSelected(w.id) ? " uie-isolate-hidden" : "";
  const handles = "";
  const name = uieWidgetDisplayName(w);
  const hostAttr = !preview && uieCanHostChildren(w) ? ' data-uie-host="1"' : "";
  return `<div class="uie-widget${sel}${designCls}${stateCls}${wireCls}${dimCls}${isoCls}" data-uie-widget="${escapeHtml(w.id)}" data-uie-name="${escapeHtml(name)}"${hostAttr} style="${style}${extra.join(";")}" ${p.enabled === false ? 'data-disabled="1"' : ""}>
    ${uieWidgetInnerHtml(w, preview, designMode)}${preview ? uieBindingChip(w) : ""}${handles}
  </div>`;
}

function uieRenderSelectionLayer(w) {
  if (!w) return "";
  const style = `left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;`;
  return `<div class="uie-selection-box" data-uie-sel-box="${escapeHtml(w.id)}" style="position:absolute;${style}outline:2px solid var(--accent);outline-offset:0;pointer-events:none;box-sizing:border-box;">
    ${uieSelectionHandlesHtml(w)}${uieBindingChip(w)}
  </div>`;
}

function uieHierarchyHtml() {
  const ui = uieEnsureUi();
  const folders = ui.folders || [];
  const widgets = uieScreenWidgets(ui.activeScreenId);
  const childWidgets = pid => widgets.filter(w => w.parent === pid && !w.folderId);
  const folderChildren = pid => folders.filter(f => (f.parent || null) === pid);
  const widgetsInFolder = fid => widgets.filter(w => w.folderId === fid && !w.parent);

  const folderRow = (f, depth) => {
    const sel = uieIsSelected(f.id) ? " uie-selected" : "";
    const renaming = UIE_FOLDER_RENAME === f.id;
    const nameEl = renaming
      ? `<input class="uie-hierarchy-rename" data-uie-folder-rename="${escapeHtml(f.id)}" value="${escapeHtml(f.name || f.id)}">`
      : `<span>${escapeHtml(f.name || f.id)}</span>`;
    return `<div class="uie-hierarchy-item uie-folder${sel}" data-uie-folder="${escapeHtml(f.id)}" style="padding-left:${depth * 12 + 4}px;" draggable="true">
      <span>📁</span>${nameEl}
      <button type="button" class="secondary" data-uie-folder-del="${escapeHtml(f.id)}" style="margin-left:auto;font-size:9px;padding:1px 4px;">×</button>
    </div>
    ${folderChildren(f.id).map(c => folderRow(c, depth + 1)).join("")}
    ${widgetsInFolder(f.id).map(w => widgetRow(w, depth + 1)).join("")}`;
  };

  const widgetRow = (w, depth) => {
    const sel = uieIsSelected(w.id) ? " uie-selected" : "";
    const renaming = UIE_FOLDER_RENAME === w.id;
    const label = uieWidgetDisplayName(w);
    const nameEl = renaming
      ? `<input class="uie-hierarchy-rename" data-uie-widget-rename="${escapeHtml(w.id)}" value="${escapeHtml(label)}">`
      : `<span style="margin-left:auto;color:var(--ink-muted);">${escapeHtml(label)}</span>`;
    const host = uieCanHostChildren(w) ? " data-uie-host=\"1\"" : "";
    const kids = childWidgets(w.id);
    const childMark = kids.length ? `<span class="uie-hierarchy-z" title="Children">${kids.length}▾</span>` : "";
    return `<div class="uie-hierarchy-item${sel}" data-uie-hier="${escapeHtml(w.id)}" data-uie-z="${uieWidgetZ(w)}"${host} style="padding-left:${depth * 12 + 4}px;" draggable="true">
      <span>${uieCanHostChildren(w) ? "▣" : "▸"}</span><span>${escapeHtml(w.type)}</span><span class="uie-hierarchy-z">z${uieWidgetZ(w)}</span>${childMark}${nameEl}
    </div>${kids.map(c => widgetRow(c, depth + 1)).join("")}`;
  };

  const rootFolders = folderChildren(null);
  const rootWidgets = widgets.filter(w => !w.parent && !w.folderId);
  const html = [
    `<div class="uie-hierarchy-item uie-hier-root" data-uie-hier-root="1" title="Drop here to unparent (canvas root)">🖥 Canvas root</div>`,
    ...rootFolders.map(f => folderRow(f, 0)),
    ...rootWidgets.map(w => widgetRow(w, 0)),
  ].join("");
  return html || `${`<div class="uie-hierarchy-item uie-hier-root" data-uie-hier-root="1">🖥 Canvas root</div>`}${uieEmptyStub("No widgets on screen", "Drag widgets from the palette onto the canvas, or double-click the canvas.")}`;
}

function uieInspectorSection(title, body, open) {
  return `<details class="uie-inspector-section" ${open !== false ? "open" : ""}>
    <summary>${escapeHtml(title)}</summary>
    <div class="uie-inspector-body">${body}</div>
  </details>`;
}

function uieInspectorEventsHtml(w, compact) {
  const evNames = uieWidgetEventNames(w);
  if (!evNames.length) return "";
  const nodes = (CURRENT_WF.nodes || []).filter(n => n.type === "ui_event");
  const noEventNodes = !nodes.length;
  const screens = uieEnsureUi().screens || [];
  const evRows = evNames.map(ev => {
    const b = (w.events || {})[ev] || { binding: "none" };
    const isNav = b.type === "navigate" || b.binding === "navigate";
    const opts = nodes.map(n => {
      const lbl = n.label || `On_${(n.params || {}).widget_id}_${(n.params || {}).event}`;
      return `<option value="${escapeHtml(n.id)}" ${b.nodeId === n.id ? "selected" : ""}>${escapeHtml(lbl)}</option>`;
    }).join("");
    return `<div class="uie-inspector-row">
      <label>${escapeHtml(ev)}</label>
      <select data-uie-ev-bind="${escapeHtml(ev)}">
        <option value="none" ${b.binding === "none" || !b.binding ? "selected" : ""}>Unbound</option>
        <option value="existing" ${b.binding === "existing" ? "selected" : ""} ${noEventNodes ? "disabled" : ""}>Bind existing</option>
        <option value="graph" ${b.binding === "graph" ? "selected" : ""}>Create graph event</option>
        <option value="navigate" ${isNav ? "selected" : ""} ${screens.length < 2 ? "disabled" : ""}>Go to screen…</option>
      </select>
    </div>
    <div class="uie-inspector-row" data-uie-ev-node-row="${escapeHtml(ev)}" style="${b.binding === "existing" ? "" : "display:none;"}">
      <label>Node</label>
      <select data-uie-ev-node="${escapeHtml(ev)}" ${noEventNodes ? "disabled" : ""} title="${noEventNodes ? "No ui_event nodes in graph — use Create graph event" : ""}">
        <option value="">— node —</option>${opts}
      </select>
    </div>
    ${noEventNodes ? `<div style="font-size:10px;color:var(--ink-muted);margin:-2px 0 4px 78px;">No graph events yet — use Create graph event.</div>` : ""}
    <div class="uie-inspector-row" data-uie-ev-nav-row="${escapeHtml(ev)}" style="${isNav ? "" : "display:none;"}">
      <label>Screen</label>
      <select data-uie-ev-nav="${escapeHtml(ev)}">
        <option value="">— screen —</option>${screens.map(s => `<option value="${escapeHtml(s.id)}" ${b.targetScreenId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
      </select>
    </div>`;
  }).join("");
  if (compact) return evRows;
  return uieInspectorSection("Events", evRows);
}

function uieInspectorStatesHtml(w) {
  const states = (w.props || {}).states || {};
  const keys = ["hover", "pressed", "disabled"];
  const rows = keys.map(sk => {
    const st = states[sk] || {};
    return `<div class="uie-inspector-row"><label>${escapeHtml(sk)}</label><span style="font-size:10px;color:var(--ink-muted);">colors / scale / opacity</span></div>
      <div class="uie-inspector-row"><label>BG</label><input type="text" data-uie-state="${escapeHtml(sk)}:bg" value="${escapeHtml(st.bg || "")}"></div>
      <div class="uie-inspector-row"><label>FG</label><input type="text" data-uie-state="${escapeHtml(sk)}:fg" value="${escapeHtml(st.fg || "")}"></div>
      <div class="uie-inspector-row"><label>Scale</label><input type="number" step="0.05" data-uie-state="${escapeHtml(sk)}:scale" value="${st.scale ?? ""}"></div>
      <div class="uie-inspector-row"><label>Opacity</label><input type="number" step="0.05" min="0" max="1" data-uie-state="${escapeHtml(sk)}:opacity" value="${st.opacity ?? ""}"></div>`;
  }).join("");
  const hints = uieStateCodegenComments(w).map(h => `<div style="font-size:10px;color:var(--ink-muted);">${escapeHtml(h)}</div>`).join("");
  return uieInspectorSection("States", rows + hints);
}

function uieInspectorBehaviorHtml(w) {
  const b = (w.props || {}).behavior || {};
  const row = (key, label) => `<div class="uie-inspector-row"><label>${escapeHtml(label)}</label><input type="checkbox" data-uie-behavior="${escapeHtml(key)}" ${b[key] ? "checked" : ""}></div>`;
  return uieInspectorSection("Behavior", row("draggable", "Draggable") + row("dropZone", "Drop zone") + row("detectHover", "Detect hover"));
}

function uieInspectorEffectsHtml(widgets) {
  if (!widgets.length) return "";
  const isMulti = widgets.length > 1;
  const commonTypes = isMulti ? UIE_EFFECT_TYPES.filter(et => widgets.every(w => uieEnsureEffects(w).some(fx => fx.type === et.type))) : UIE_EFFECT_TYPES;
  const rows = (isMulti ? commonTypes : UIE_EFFECT_TYPES).map(et => {
    const fxList = isMulti ? widgets.map(w => uieEnsureEffects(w).find(f => f.type === et.type)).filter(Boolean) : [];
    const mixed = isMulti && fxList.length > 0 && fxList.length < widgets.length;
    const sample = isMulti ? fxList[0] : uieEnsureEffects(widgets[0]).find(f => f.type === et.type);
    if (isMulti && !sample && !mixed) return "";
    const fx = sample || { id: uieNextEffectId(), type: et.type, enabled: true, params: { ...et.defaults }, order: 0 };
    return uieEffectRowHtml(fx, et, mixed);
  }).join("");
  const stackRows = !isMulti ? uieEnsureEffects(widgets[0]).map(fx => {
    const et = UIE_EFFECT_TYPES.find(t => t.type === fx.type) || { label: fx.type, defaults: {} };
    return uieEffectRowHtml(fx, et, false);
  }).join("") : rows;
  const addMenu = UIE_EFFECT_TYPES.map(et =>
    `<button type="button" data-uie-effect-add="${escapeHtml(et.type)}">${escapeHtml(et.label)}</button>`
  ).join("");
  return uieInspectorSection("Effects", `
    ${isMulti ? `<div style="font-size:10px;color:var(--ink-muted);margin-bottom:4px;">${widgets.length} widgets — common effects only${rows.includes("Mixed") ? " (Mixed)" : ""}</div>` : ""}
    <div id="uie-effect-stack" data-uie-effect-target="${escapeHtml(widgets.map(w => w.id).join(","))}">${stackRows || uieEmptyStub("No effects", "Add blur, shadow, or other visual effects.")}</div>
    <div class="uie-effect-add-menu" style="margin-top:6px;">
      <button type="button" class="secondary" id="uie-effect-add-btn" style="width:100%;font-size:10px;">+ Add Effect</button>
      <div class="uie-effect-add-dropdown" id="uie-effect-add-menu" hidden>${addMenu}</div>
    </div>`, false);
}

function uieEffectRowHtml(fx, et, mixed) {
  const p = fx.params || {};
  const body = uieEffectParamsHtml(fx.type, p, fx.id);
  return `<div class="uie-effect-row${fx.enabled === false ? " uie-effect-disabled" : ""}" data-uie-effect-row="${escapeHtml(fx.id)}" draggable="true">
    <div class="uie-effect-header">
      <input type="checkbox" data-uie-effect-enable="${escapeHtml(fx.id)}" ${fx.enabled !== false ? "checked" : ""}>
      <span style="flex:1;">${escapeHtml(et.label)}${mixed ? " (Mixed)" : ""}</span>
      <button type="button" class="secondary" data-uie-effect-dup="${escapeHtml(fx.id)}" style="font-size:8px;padding:1px 3px;">⧉</button>
      <button type="button" class="secondary" data-uie-effect-del="${escapeHtml(fx.id)}" style="font-size:8px;padding:1px 3px;">×</button>
      <button type="button" class="secondary" data-uie-effect-toggle="${escapeHtml(fx.id)}" style="font-size:8px;padding:1px 3px;">▼</button>
    </div>
    <div class="uie-effect-body" data-uie-effect-body="${escapeHtml(fx.id)}">${body}</div>
  </div>`;
}

function uieEffectParamsHtml(type, p, fxId) {
  const row = (label, field, val, inputType) => `<div class="uie-inspector-row"><label>${escapeHtml(label)}</label><input type="${inputType || "text"}" data-uie-effect-param="${escapeHtml(fxId)}:${escapeHtml(field)}" value="${escapeHtml(String(val ?? ""))}"></div>`;
  if (type === "blur") return row("Radius", "radius", p.radius ?? 8, "number");
  if (type === "dropShadow") return row("Color", "color", p.color ?? "#00000080") + row("X", "x", p.x ?? 2, "number") + row("Y", "y", p.y ?? 2, "number") + row("Blur", "blur", p.blur ?? 8, "number");
  if (type === "glow") return row("Color", "color", p.color ?? "#4a9eff") + row("Size", "size", p.size ?? 12, "number") + row("Intensity", "intensity", p.intensity ?? 0.8, "number");
  if (type === "colorFilter") return row("Brightness", "brightness", p.brightness ?? 1, "number") + row("Contrast", "contrast", p.contrast ?? 1, "number") + row("Saturate", "saturate", p.saturate ?? 1, "number") + row("Hue", "hueRotate", p.hueRotate ?? 0, "number");
  if (type === "opacity") return row("Value", "value", p.value ?? 0.85, "number");
  if (type === "backdropBlur") return row("Radius", "radius", p.radius ?? 8, "number") + row("Tint", "tint", p.tint ?? "#00000040");
  if (type === "cornerRadius") return row("TL", "tl", p.tl ?? 8, "number") + row("TR", "tr", p.tr ?? 8, "number") + row("BR", "br", p.br ?? 8, "number") + row("BL", "bl", p.bl ?? 8, "number") + `<div class="uie-inspector-row"><label>Link</label><input type="checkbox" data-uie-effect-param="${escapeHtml(fxId)}:linked" ${p.linked !== false ? "checked" : ""}></div>`;
  if (type === "gradientFill") {
    const stops = (p.stops || []).map((s, i) => row(`Stop ${i + 1} color`, `stopColor${i}`, s.color) + row(`Stop ${i + 1} pos`, `stopPos${i}`, s.pos, "number")).join("");
    return row("Angle", "angle", p.angle ?? 135, "number") + stops;
  }
  if (type === "border") return row("Width", "width", p.width ?? 1, "number") + row("Style", "style", p.style ?? "solid") + row("Color", "color", p.color ?? "#666");
  if (type === "innerShadow") return row("Color", "color", p.color ?? "#00000060") + row("X", "x", p.x ?? 0, "number") + row("Y", "y", p.y ?? 2, "number") + row("Blur", "blur", p.blur ?? 6, "number");
  return "";
}

function uieInspectorCodeHtml(w) {
  if (!w) return uieInspectorSection("Code", uieEmptyStub("Select one widget", "Click a widget on the canvas to inspect it."), false);
  const py = escapeHtml(uieCodegenWidgetFragment(w));
  const json = escapeHtml(uieCodegenWidgetJson(w));
  const tab = UIE_INSPECTOR_CODE_TAB;
  return uieInspectorSection("Code", `
    <div class="uie-code-tabs">
      <button type="button" class="secondary ${tab === "python" ? "uie-tab-active" : ""}" data-uie-code-tab="python">Python</button>
      <button type="button" class="secondary ${tab === "json" ? "uie-tab-active" : ""}" data-uie-code-tab="json">JSON</button>
    </div>
    <pre class="uie-code-block" id="uie-inspector-code-python" ${tab !== "python" ? "hidden" : ""}>${py}</pre>
    <pre class="uie-code-block" id="uie-inspector-code-json" ${tab !== "json" ? "hidden" : ""}>${json}</pre>
    <div style="display:flex;gap:4px;margin-top:6px;">
      <button type="button" class="secondary" data-uie-code-copy="python" style="flex:1;font-size:10px;">Copy Python</button>
      <button type="button" class="secondary" data-uie-code-copy="json" style="flex:1;font-size:10px;">Copy JSON</button>
    </div>
    <button type="button" class="secondary" id="uie-open-full-code" style="width:100%;margin-top:4px;font-size:10px;">Open full generated code</button>`, false);
}

function uieInspectorAnimationHtml(w) {
  if (!w) return "";
  const rows = uieEnsureAnimations(w).map(anim => {
    const trigOpts = UIE_ANIM_TRIGGERS.map(t => `<option value="${escapeHtml(t)}" ${anim.trigger === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("");
    const propOpts = UIE_ANIM_PROPERTIES.map(t => `<option value="${escapeHtml(t)}" ${anim.property === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("");
    const durOpts = Object.keys(UIE_ANIM_DURATIONS).map(d => `<option value="${escapeHtml(d)}" ${String(anim.duration) === d ? "selected" : ""}>${escapeHtml(d)}ms</option>`).join("") + `<option value="custom" ${anim.duration === "custom" ? "selected" : ""}>Custom</option>`;
    const easeOpts = Object.keys(UIE_ANIM_EASINGS).map(e => `<option value="${escapeHtml(e)}" ${anim.easing === e ? "selected" : ""}>${escapeHtml(e)}</option>`).join("");
    return `<div class="uie-anim-row" data-uie-anim-row="${escapeHtml(anim.id)}">
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">
        <input type="checkbox" data-uie-anim-enable="${escapeHtml(anim.id)}" ${anim.enabled !== false ? "checked" : ""}>
        <select data-uie-anim-trigger="${escapeHtml(anim.id)}" style="flex:1;">${trigOpts}</select>
        <button type="button" class="secondary" data-uie-anim-del="${escapeHtml(anim.id)}" style="font-size:8px;padding:1px 3px;">×</button>
      </div>
      <div class="uie-inspector-row"><label>Property</label><select data-uie-anim-prop="${escapeHtml(anim.id)}">${propOpts}</select></div>
      <div class="uie-inspector-row"><label>From</label><input type="text" data-uie-anim-from="${escapeHtml(anim.id)}" value="${escapeHtml(String(anim.from ?? ""))}"></div>
      <div class="uie-inspector-row"><label>To</label><input type="text" data-uie-anim-to="${escapeHtml(anim.id)}" value="${escapeHtml(String(anim.to ?? ""))}"></div>
      <div class="uie-inspector-row"><label>Duration</label><select data-uie-anim-dur="${escapeHtml(anim.id)}">${durOpts}</select></div>
      <div class="uie-inspector-row"><label>Easing</label><select data-uie-anim-ease="${escapeHtml(anim.id)}">${easeOpts}</select></div>
      <div class="uie-inspector-row"><label>Delay</label><input type="number" data-uie-anim-delay="${escapeHtml(anim.id)}" value="${anim.delay ?? 0}"></div>
      <div class="uie-inspector-row"><label>Repeat</label><input type="checkbox" data-uie-anim-repeat="${escapeHtml(anim.id)}" ${anim.repeat ? "checked" : ""}></div>
      <button type="button" class="secondary" data-uie-anim-preview="${escapeHtml(anim.id)}" style="width:100%;font-size:10px;margin-top:4px;">Preview Animation</button>
    </div>`;
  }).join("");
  return uieInspectorSection("Animation", `
    <div id="uie-anim-stack">${rows || uieEmptyStub("No animations", "Add motion triggered by hover, click, or load.")}</div>
    <button type="button" class="secondary" id="uie-anim-add" style="width:100%;margin-top:6px;font-size:10px;">+ Add Animation</button>`, false);
}

function uieTokenIndicator(propVal) {
  if (!uieIsTokenRef(propVal)) return "";
  return `<span class="uie-token-badge" title="${escapeHtml(propVal.token)}">◆</span>`;
}

function uieOverrideBadge(w, section, key) {
  if (!w.styleClassId || !uieIsStylePropOverridden(w, section, key)) return "";
  return `<button type="button" class="uie-override-badge" data-uie-reset-override="${escapeHtml(section)}:${escapeHtml(key)}" title="Reset to class">↺</button>`;
}

function uiePropInputRow(label, propKey, value, w, section, inputType, extraAttrs) {
  const tokenized = uieIsTokenRef(value);
  const displayVal = tokenized ? (value._resolved ?? uieResolveTokenRef(value.token)) : (value ?? "");
  const tokenAttr = tokenized ? ` data-uie-token-ref="${escapeHtml(value.token)}"` : "";
  return `<div class="uie-inspector-row">
    <label>${escapeHtml(label)}${uieTokenIndicator(value)}</label>
    <span style="display:flex;gap:2px;align-items:center;">
      <input type="${inputType || "text"}" data-uie-prop="${escapeHtml(propKey)}" data-uie-style-section="${escapeHtml(section || "")}" value="${escapeHtml(String(displayVal ?? ""))}"${tokenAttr}${extraAttrs || ""}>
      ${w ? uieOverrideBadge(w, section, propKey) : ""}
    </span>
  </div>`;
}

function uieInspectorLayoutSectionHtml(w) {
  if (w.type !== "frame") return "";
  const layout = uieEnsureWidgetLayout(w);
  const modeOpts = UIE_LAYOUT_MODES.map(m =>
    `<option value="${escapeHtml(m.id)}" ${layout.mode === m.id ? "selected" : ""}>${escapeHtml(m.label)}</option>`
  ).join("");
  const alignOpts = UIE_STACK_ALIGNS.map(a =>
    `<option value="${escapeHtml(a.id)}" ${layout.align === a.id ? "selected" : ""}>${escapeHtml(a.label)}</option>`
  ).join("");
  const stackMode = layout.mode !== "free";
  return uieInspectorSection("Stack layout", `
    <div class="uie-inspector-row"><label>Mode</label><select data-uie-layout="mode">${modeOpts}</select></div>
    <div class="uie-inspector-row" data-uie-layout-stack-fields style="${stackMode ? "" : "display:none;"}">
      <label>Spacing</label><input type="number" data-uie-layout="spacing" value="${layout.spacing ?? 8}" min="0">
    </div>
    <div class="uie-inspector-row" data-uie-layout-stack-fields style="${stackMode ? "" : "display:none;"}">
      <label>Padding</label><input type="number" data-uie-layout="padding" value="${layout.padding ?? 0}" min="0">
    </div>
    <div class="uie-inspector-row" data-uie-layout-stack-fields style="${stackMode ? "" : "display:none;"}">
      <label>Align</label><select data-uie-layout="align">${alignOpts}</select>
    </div>
    ${stackMode ? `<div style="font-size:10px;color:var(--ink-muted);">Children auto-arrange by hierarchy order.</div>` : ""}`, false);
}

function uieInspectorStyleClassHtml(w) {
  const styles = uieEnsureStyles();
  const opts = styles.map(s =>
    `<option value="${escapeHtml(s.id)}" ${w.styleClassId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
  ).join("");
  return uieInspectorSection("Style class", `
    <div class="uie-inspector-row"><label>Class</label><select data-uie-style-class-id><option value="">— none —</option>${opts}</select></div>`, false);
}

function uieStylesPanelHtml() {
  const styles = uieEnsureStyles();
  const sel = UIE_SELECTED_STYLE_CLASS;
  const rows = styles.map(s => {
    const active = sel === s.id ? " uie-selected" : "";
    return `<div class="uie-hierarchy-item${active}" data-uie-style-class="${escapeHtml(s.id)}">
      <span>🎨</span><span>${escapeHtml(s.name)}</span>
      <button type="button" class="secondary" data-uie-style-del="${escapeHtml(s.id)}" style="margin-left:auto;font-size:9px;padding:1px 4px;">×</button>
    </div>`;
  }).join("");
  const sc = sel ? uieEnsureStyleClass(sel) : null;
  const editor = sc ? `
    <div class="uie-inspector-row"><label>Name</label><input type="text" data-uie-style-name value="${escapeHtml(sc.name || "")}"></div>
    <div class="uie-inspector-row"><label>BG</label><input type="text" data-uie-style-prop="appearance:bg" value="${escapeHtml(uiePropToCss(sc.props.appearance?.bg) || "")}"></div>
    <div class="uie-inspector-row"><label>FG</label><input type="text" data-uie-style-prop="appearance:fg" value="${escapeHtml(uiePropToCss(sc.props.appearance?.fg) || "")}"></div>
    <div class="uie-inspector-row"><label>Font</label><input type="number" data-uie-style-prop="typography:fontSize" value="${sc.props.typography?.fontSize ?? 12}"></div>
  ` : uieEmptyStub("Select a style class", "Create one with + Class, then edit properties here.");
  return `
    <div style="display:flex;gap:4px;margin-bottom:6px;">
      <button type="button" class="secondary" id="uie-style-add" style="flex:1;font-size:10px;">+ Class</button>
    </div>
    <div id="uie-style-list">${rows || uieEmptyStub("No style classes", "Create a class to reuse appearance across widgets.")}</div>
    <div id="uie-style-editor" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">${editor}</div>`;
}

function uieTokensPanelHtml() {
  const tokens = uieEnsureTokens();
  const colorRows = tokens.colors.map((t, i) => `
    <div class="uie-inspector-row">
      <label>${escapeHtml(t.name)}</label>
      <input type="text" data-uie-token-color-val="${escapeHtml(t.id)}" value="${escapeHtml(t.value || "")}" placeholder="#hex">
      <button type="button" class="secondary" data-uie-token-color-del="${escapeHtml(t.id)}" style="font-size:9px;padding:1px 4px;">×</button>
    </div>`).join("");
  const fontRows = tokens.fonts.map(t => `
    <div class="uie-inspector-row">
      <label>${escapeHtml(t.name)}</label>
      <input type="text" data-uie-token-font-val="${escapeHtml(t.id)}" value="${escapeHtml(t.value || "")}" placeholder="font-family">
      <button type="button" class="secondary" data-uie-token-font-del="${escapeHtml(t.id)}" style="font-size:9px;padding:1px 4px;">×</button>
    </div>`).join("");
  return `
    <strong style="font-size:10px;color:var(--ink-muted);">Colors</strong>
    ${colorRows || uieEmptyStub("No color tokens", "Add tokens to reference colors from widgets.")}
    <button type="button" class="secondary" id="uie-token-color-add" style="width:100%;margin:4px 0;font-size:10px;">+ Color</button>
    <strong style="font-size:10px;color:var(--ink-muted);display:block;margin-top:8px;">Fonts</strong>
    ${fontRows || uieEmptyStub("No font tokens", "Add font tokens for shared typography.")}
    <button type="button" class="secondary" id="uie-token-font-add" style="width:100%;margin-top:4px;font-size:10px;">+ Font</button>`;
}

function uieTemplatesPanelHtml() {
  const templates = uieEnsureTemplates();
  return templates.map(t =>
    `<div class="uie-palette-item" draggable="true" data-uie-template="${escapeHtml(t.id)}">${escapeHtml(t.name)}</div>`
  ).join("") || uieEmptyStub("No templates saved", "Right-click a widget → Save as Template.");
}

function uieScreenSwitcherHtml() {
  const ui = uieEnsureUi();
  const screens = ui.screens || [];
  const rows = screens.map(s => {
    const active = s.id === ui.activeScreenId ? " uie-screen-active" : "";
    return `<div class="uie-screen-item${active}" data-uie-screen="${escapeHtml(s.id)}" title="${escapeHtml(s.name)}">
      <span class="uie-screen-name">${escapeHtml(s.name)}</span>
      <span class="uie-screen-actions">
        <button type="button" class="secondary" data-uie-screen-dup="${escapeHtml(s.id)}" title="Duplicate">⧉</button>
        <button type="button" class="secondary" data-uie-screen-ren="${escapeHtml(s.id)}" title="Rename">✎</button>
        ${screens.length > 1 ? `<button type="button" class="secondary" data-uie-screen-del="${escapeHtml(s.id)}" title="Delete">×</button>` : ""}
      </span>
    </div>`;
  }).join("");
  return `<div class="uie-screen-switcher">
    <div class="uie-screen-switcher-head">
      <strong>Screens</strong>
      <button type="button" class="secondary" id="uie-screen-add" style="font-size:9px;padding:1px 4px;">+</button>
    </div>
    <div class="uie-screen-list">${rows}</div>
  </div>`;
}

function uieInspectorHtml(w) {
  const selIds = uieGetSelection();
  const widgets = selIds.map(id => uieFindWidget(id)).filter(Boolean);
  if (!widgets.length) return uieInspectorScreenHtml();
  if (widgets.length > 1) {
    return [
      `<div style="font-size:10px;color:var(--ink-muted);margin-bottom:8px;">${widgets.length} widgets selected</div>`,
      uieInspectorEffectsHtml(widgets),
      uieInspectorSection("Multi-select", `<div class="uie-align-toolbar">
        ${[["left","L"],["centerX","CX"],["right","R"],["top","T"],["centerY","CY"],["bottom","B"],["distX","DX"],["distY","DY"],["sameW","=W"],["sameH","=H"]].map(([m,l]) => `<button type="button" class="secondary" data-uie-align="${escapeHtml(m)}">${escapeHtml(l)}</button>`).join("")}
      </div>
      <div style="display:flex;gap:4px;margin-top:6px;">
        <button type="button" class="secondary" data-uie-z="forward" style="flex:1;font-size:9px;">Forward</button>
        <button type="button" class="secondary" data-uie-z="back" style="flex:1;font-size:9px;">Back</button>
        <button type="button" class="secondary" data-uie-z="front" style="flex:1;font-size:9px;">Front</button>
        <button type="button" class="secondary" data-uie-z="backmost" style="flex:1;font-size:9px;">Back</button>
      </div>`, false),
      uieInspectorSection("Code", uieEmptyStub("Select one widget", "Multi-select does not show per-widget code."), false),
    ].join("");
  }
  w = widgets[0];
  const p = w.props || {};
  const eff = uieEffectiveWidgetProps(w);
  const stackChild = uieIsStackChild(w);
  const posLocked = stackChild;
  const posTitle = posLocked ? "Position is managed by the parent stack layout" : "";
  const varOpts = (CURRENT_WF.variables || []).map(v =>
    `<option value="${escapeHtml(v.name)}" ${p.textVariable === v.name ? "selected" : ""}>${escapeHtml(v.name)}</option>`
  ).join("");
  const assetOpts = Object.entries(UIE_ASSETS).map(([k, a]) =>
    `<option value="${escapeHtml(k)}" ${uieBgAssetSelectValue(p.bgAsset) === k ? "selected" : ""}>${escapeHtml(a.label)}</option>`
  ).join("");
  const uploadedBgUrl = uieBgAssetUploadUrl(p.bgAsset);
  const uploadedBgThumb = uploadedBgUrl
    ? `<img src="${escapeHtml(uploadedBgUrl)}" alt="" class="uie-asset-thumb" style="width:36px;height:36px;object-fit:cover;border-radius:3px;">`
    : "";
  const styleOpts = uieEnsureStyles().map(s =>
    `<option value="${escapeHtml(s.id)}" ${w.styleClassId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
  ).join("");
  const colorTokens = uieEnsureTokens().colors;
  const fontTokens = uieEnsureTokens().fonts;
  const tokenPick = (kind, propKey) => {
    const list = kind === "font" ? fontTokens : colorTokens;
    if (!list.length) return "";
    const opts = list.map(t => `<option value="${escapeHtml(kind)}.${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");
    return `<select data-uie-token-pick="${escapeHtml(propKey)}" style="width:52px;font-size:9px;" title="Use token"><option value="">◇</option>${opts}</select>`;
  };

  const layout = `
    <div class="uie-inspector-row"><label>Name</label><input type="text" data-uie-prop="name" value="${escapeHtml(p.name || "")}" placeholder="${escapeHtml(w.id)}"></div>
    <div class="uie-inspector-row"><label>X</label><input type="number" data-uie-prop="x" value="${w.x}" ${posLocked ? "disabled" : ""} title="${escapeHtml(posTitle)}"></div>
    <div class="uie-inspector-row"><label>Y</label><input type="number" data-uie-prop="y" value="${w.y}" ${posLocked ? "disabled" : ""} title="${escapeHtml(posTitle)}"></div>
    <div class="uie-inspector-row"><label>Width</label><input type="number" data-uie-prop="width" value="${w.width}"></div>
    <div class="uie-inspector-row"><label>Height</label><input type="number" data-uie-prop="height" value="${w.height}"></div>
    <div class="uie-inspector-row uie-row-span"><label>Anchors</label></div>
    <div class="uie-anchor-grid" title="${posLocked ? escapeHtml(posTitle) : "Anchor presets"}">
      ${["↖","↑","↗","←","●","→","↙","↓","↘"].map((g, i) => `<button type="button" class="secondary" data-uie-anchor="${i}" ${posLocked ? "disabled" : ""} title="${posLocked ? escapeHtml(posTitle) : "Anchor preset"}">${g}</button>`).join("")}
    </div>`;

  const appearance = `
    <div class="uie-inspector-row"><label>Class</label><select data-uie-style-class-id><option value="">— none —</option>${styleOpts}</select></div>
    <div class="uie-inspector-row"><label>Asset</label><select data-uie-prop="bgAsset"><option value="">—</option>${assetOpts}<option value="__uploaded__" ${uieBgAssetSelectValue(p.bgAsset) === "__uploaded__" ? "selected" : ""}>Uploaded image</option></select></div>
    <div class="uie-inspector-row" id="uie-bg-upload-row" style="${uploadedBgUrl ? "" : "display:none;"}"><label>BG image</label><span style="display:flex;gap:4px;align-items:center;flex:1;">
      <input type="text" data-uie-prop="bgAssetUrl" value="${escapeHtml(uploadedBgUrl)}" readonly style="flex:1;">
      <button type="button" class="secondary uie-upload-btn" data-uie-upload-bg style="font-size:9px;">Upload</button>
      ${uploadedBgThumb}
      <button type="button" class="secondary" data-uie-clear-bg-asset title="Clear">✕</button>
    </span></div>
    ${uieBgTextureControlsHtml(w, p)}
    ${uiePropInputRow("BG", "bg", eff.bg, w, "appearance")}
    <div class="uie-inspector-row"><label></label>${tokenPick("color", "bg")}</div>
    ${uiePropInputRow("FG", "fg", eff.fg, w, "appearance")}
    <div class="uie-inspector-row"><label></label>${tokenPick("color", "fg")}</div>
    ${uiePropInputRow("Font size", "fontSize", eff.fontSize, w, "typography", "number")}
    <div class="uie-inspector-row"><label>Font family</label><span style="display:flex;gap:2px;align-items:center;flex:1;"><input type="text" data-uie-prop="fontFamily" value="${escapeHtml(uiePropToCss(eff.fontFamily) || "")}">${tokenPick("font", "fontFamily")}${uieOverrideBadge(w, "typography", "fontFamily")}</span></div>
    <div class="uie-inspector-row"><label>Visible</label><input type="checkbox" data-uie-prop="visible" ${eff.visible !== false ? "checked" : ""}></div>
    <div class="uie-inspector-row"><label>Enabled</label><input type="checkbox" data-uie-prop="enabled" ${eff.enabled !== false ? "checked" : ""}></div>`;

  let content = `<div class="uie-inspector-row"><label>Text</label><input type="text" data-uie-prop="text" value="${escapeHtml(p.text || "")}"></div>`;
  if (w.type === "label") content += `<div class="uie-inspector-row"><label>Var</label><select data-uie-prop="textVariable"><option value="">—</option>${varOpts}</select></div>`;
  if (w.type === "combobox") content += `<div class="uie-inspector-row"><label>Values</label><input type="text" data-uie-prop="values" value="${escapeHtml((p.values || []).join(","))}"></div>`;
  if (w.type === "scale") {
    content += `<div class="uie-inspector-row"><label>Min</label><input type="number" data-uie-prop="min" value="${p.min ?? 0}"></div>`;
    content += `<div class="uie-inspector-row"><label>Max</label><input type="number" data-uie-prop="max" value="${p.max ?? 100}"></div>`;
    content += `<div class="uie-inspector-row"><label>Value</label><input type="number" data-uie-prop="value" value="${p.value ?? 50}"></div>`;
  }
  if (w.type === "checkbutton") content += `<div class="uie-inspector-row"><label>Checked</label><input type="checkbox" data-uie-prop="checked" ${p.checked ? "checked" : ""}></div>`;
  if (w.type === "progressbar") {
    content += `<div class="uie-inspector-row"><label>Value</label><input type="number" data-uie-prop="value" value="${p.value ?? 40}"></div>`;
    content += `<div class="uie-inspector-row"><label>Max</label><input type="number" data-uie-prop="max" value="${p.max ?? 100}"></div>`;
  }
  if (w.type === "wp_add_task") {
    content += `<div class="uie-inspector-row"><label>Title tpl</label><input type="text" data-uie-prop="titleTemplate" value="${escapeHtml(p.titleTemplate || "New task")}"></div>`;
    content += `<div class="uie-inspector-row"><label>Urgency</label><select data-uie-prop="urgency">
      ${["low", "medium", "high", "critical"].map(u => `<option value="${escapeHtml(u)}" ${p.urgency === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}
    </select></div>`;
  }
  if (w.type === "wp_log_pulse") {
    content += `<div class="uie-inspector-row"><label>Happiness</label><input type="number" min="1" max="10" data-uie-prop="happiness" value="${Number(p.happiness) || 5}"></div>`;
  }
  if (w.type === "wp_open_app") {
    const tabs = (typeof TABS !== "undefined" ? TABS : ["Today", "Tasks", "Hub"]);
    content += `<div class="uie-inspector-row"><label>Target tab</label><select data-uie-prop="targetTab">
      ${tabs.map(t => `<option value="${escapeHtml(t)}" ${p.targetTab === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
    </select></div>`;
  }
  if (w.type === "wp_run_blueprint") {
    const wfOpts = (UIE_WORKFLOW_LIST || []).map(wf =>
      `<option value="${escapeHtml(String(wf.id))}" ${String(p.workflowId) === String(wf.id) ? "selected" : ""}>${escapeHtml(wf.name || wf.id)}</option>`
    ).join("");
    content += `<div class="uie-inspector-row"><label>Workflow</label><select data-uie-prop="workflowId"><option value="">— select —</option>${wfOpts}</select></div>`;
  }
  if (w.type === "image") {
    const fitOpts = UIE_IMAGE_FIT_MODES.map(f =>
      `<option value="${escapeHtml(f)}" ${(p.imageFit || "cover") === f ? "selected" : ""}>${escapeHtml(f)}</option>`
    ).join("");
    content = `
      ${uieImageUrlFieldHtml("Image src", "imageSrc", p.imageSrc || "", w)}
      <div class="uie-inspector-row"><label>Alt / name</label><input type="text" data-uie-prop="imageAlt" value="${escapeHtml(p.imageAlt || "")}" placeholder="Accessible label"></div>
      <div class="uie-inspector-row"><label>Fit</label><select data-uie-prop="imageFit">${fitOpts}</select></div>
      <div class="uie-inspector-row uie-row-span"><label>Quick filters</label></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
        <button type="button" class="secondary" data-uie-image-filter="grayscale" style="font-size:9px;">Grayscale</button>
        <button type="button" class="secondary" data-uie-image-filter="sepia" style="font-size:9px;">Sepia</button>
        <button type="button" class="secondary" data-uie-image-filter="bright" style="font-size:9px;">Brightness</button>
      </div>`;
  }

  const meta = `
    <div class="uie-inspector-row"><label>ID</label><input type="text" value="${escapeHtml(w.id)}" readonly></div>
    <div class="uie-inspector-row"><label>Type</label><input type="text" value="${escapeHtml(w.type)}" readonly></div>
    <button type="button" class="secondary" data-uie-delete style="width:100%;margin-top:6px;">Delete widget</button>`;

  return [
    uieInspectorSection("Layout", layout),
    uieInspectorLayoutSectionHtml(w),
    uieInspectorSection("Appearance", appearance),
    w.type !== "frame" && w.type !== "canvas" && w.type !== "image" ? uieInspectorSection("Content", content) : "",
    w.type === "image" ? uieInspectorSection("Image", content) : "",
    uieInspectorEffectsHtml([w]),
    uieInspectorStatesHtml(w),
    uieInspectorBehaviorHtml(w),
    uieInspectorAnimationHtml(w),
    uieIsWaypointWidget(w) ? "" : uieInspectorEventsHtml(w, false),
    uieInspectorCodeHtml(w),
    uieInspectorSection("Widget", meta, false),
  ].join("");
}

function uieDataSchemaRowHtml(field, idx) {
  const typeOpts = UIE_DATA_FIELD_TYPES.map(t =>
    `<option value="${escapeHtml(t)}" ${field.type === t ? "selected" : ""}>${escapeHtml(t)}</option>`
  ).join("");
  return `<div class="uie-data-schema-row" data-uie-data-field="${idx}">
    <input type="text" data-uie-data-name="${idx}" value="${escapeHtml(field.name || "")}" placeholder="field_name">
    <select data-uie-data-type="${idx}">${typeOpts}</select>
    <button type="button" class="secondary" data-uie-data-del="${idx}" style="font-size:9px;padding:1px 4px;">×</button>
  </div>`;
}

function uieDataTabHtml() {
  const schema = uieEnsureDataSchema();
  const rows = schema.map((f, i) => uieDataSchemaRowHtml(f, i)).join("");
  return `
    <p style="font-size:10px;color:var(--ink-muted);margin:0 0 8px;">One table per app — fields stored in workflow UI meta.</p>
    <div id="uie-data-schema-list">${rows || uieEmptyStub("No data fields", "Add fields to define your app data schema.")}</div>
    <button type="button" class="secondary" id="uie-data-field-add" style="width:100%;margin-top:6px;font-size:11px;">+ Add field</button>`;
}

function uiePaletteHtml() {
  const tab = UIE_PALETTE_TAB;
  const widgetItems = UIE_WIDGET_TYPES.map(t => {
    const armed = UIE_PLACE_ARMED === t.type ? " uie-armed" : "";
    return `<div class="uie-palette-item${armed}" draggable="true" data-uie-palette="${escapeHtml(t.type)}">${escapeHtml(t.label)}</div>`;
  }).join("");
  const waypointItems = UIE_WAYPOINT_WIDGETS.map(t => {
    const armed = UIE_PLACE_ARMED === t.type ? " uie-armed" : "";
    return `<div class="uie-palette-item${armed}" draggable="true" data-uie-palette="${escapeHtml(t.type)}">${escapeHtml(t.label)}</div>`;
  }).join("");
  const assetItems = `
    <div class="uie-asset-section-label">Built-in textures</div>
    ${Object.entries(UIE_ASSETS).map(([k, a]) =>
    `<div class="uie-palette-item" data-uie-asset="${escapeHtml(k)}">${escapeHtml(a.label)}<div class="uie-asset-swatch" style="background:${a.css};${a.size ? `background-size:${a.size};` : ""}"></div></div>`
  ).join("")}
    <div class="uie-asset-section-label">Uploaded</div>
    <button type="button" class="secondary" id="uie-asset-upload-btn" style="width:100%;font-size:10px;margin-bottom:4px;">+ Upload image</button>
    <input type="file" id="uie-asset-upload-input" accept="image/*" hidden>
    ${uieUploadedAssetsGridHtml()}`;
  const tabBtn = (id, label) => `<button type="button" class="secondary ${tab === id ? "uie-tab-active" : ""}" data-uie-palette-tab="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
  return `
    <div class="uie-palette-tabs" style="flex-wrap:wrap;">
      ${tabBtn("widgets", "Widgets")}
      ${tabBtn("waypoint", "Waypoint")}
      ${tabBtn("templates", "Templates")}
      ${tabBtn("styles", "Styles")}
      ${tabBtn("tokens", "Tokens")}
      ${tabBtn("data", "Data")}
      ${tabBtn("assets", "Assets")}
    </div>
    <div id="uie-palette-widgets" ${tab === "widgets" ? "" : "hidden"}>${widgetItems}</div>
    <div id="uie-palette-waypoint" ${tab === "waypoint" ? "" : "hidden"}>${waypointItems}</div>
    <div id="uie-palette-templates" ${tab === "templates" ? "" : "hidden"}>${uieTemplatesPanelHtml()}</div>
    <div id="uie-palette-styles" ${tab === "styles" ? "" : "hidden"}>${uieStylesPanelHtml()}</div>
    <div id="uie-palette-tokens" ${tab === "tokens" ? "" : "hidden"}>${uieTokensPanelHtml()}</div>
    <div id="uie-palette-data" ${tab === "data" ? "" : "hidden"}>${uieDataTabHtml()}</div>
    <div id="uie-palette-assets" ${tab === "assets" ? "" : "hidden"}>${assetItems}</div>`;
}

function uieBindingSearchResults(q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return [];
  const rows = [];
  uieEnsureUi().widgets.forEach(w => {
    const name = uieWidgetDisplayName(w).toLowerCase();
    if (name.includes(needle) || w.id.toLowerCase().includes(needle)) {
      rows.push({ kind: "widget", id: w.id, label: uieWidgetDisplayName(w) });
    }
    Object.entries(w.events || {}).forEach(([ev, b]) => {
      if (!b || !b.nodeId) return;
      const node = (CURRENT_WF.nodes || []).find(n => n.id === b.nodeId);
      const nodeLbl = (node && (node.label || node.id)) || b.nodeId;
      if (nodeLbl.toLowerCase().includes(needle) || b.nodeId.toLowerCase().includes(needle)) {
        rows.push({ kind: "binding", widgetId: w.id, event: ev, nodeId: b.nodeId, label: `${uieWidgetDisplayName(w)} · ${ev} → ${nodeLbl}` });
      }
    });
  });
  return rows.slice(0, 30);
}

function uieBindingSearchHtml(q) {
  const rows = uieBindingSearchResults(q);
  if (!rows.length) return uieEmptyStub("No matches", "Try a widget name, id, or binding label.");
  return rows.map(r => {
    if (r.kind === "widget") {
      return `<div class="uie-hierarchy-item" data-uie-search-widget="${escapeHtml(r.id)}">${escapeHtml(r.label)}</div>`;
    }
    return `<div class="uie-hierarchy-item" data-uie-search-binding="${escapeHtml(r.widgetId)}" data-uie-search-node="${escapeHtml(r.nodeId)}">${escapeHtml(r.label)}</div>`;
  }).join("");
}

function uieViewportTransform() {
  const v = uieEnsureUi().view || { zoom: 1, panX: 0, panY: 0 };
  const zoom = Math.min(2, Math.max(0.25, Number(v.zoom) || 1));
  const panX = Number(v.panX) || 0;
  const panY = Number(v.panY) || 0;
  return { zoom, panX, panY, css: `translate(${panX}px, ${panY}px) scale(${zoom})` };
}

function uieRulerTicksHtml(axis, length, zoom) {
  const major = 100, minor = 10;
  let html = "";
  for (let px = 0; px <= length; px += minor) {
    const isMajor = px % major === 0;
    if (axis === "h") {
      html += `<div class="uie-ruler-tick" style="left:${px * zoom}px;${isMajor ? "" : "opacity:.4;"}">${isMajor ? `<span>${px}</span>` : ""}</div>`;
    } else {
      html += `<div class="uie-ruler-tick" style="top:${px * zoom}px;${isMajor ? "" : "opacity:.4;"}">${isMajor ? `<span>${px}</span>` : ""}</div>`;
    }
  }
  return html;
}

function uieGuidesHtml() {
  const canvas = uieEnsureCanvas();
  if (canvas.showGuides === false) return "";
  return (canvas.guides || []).map(g => {
    const locked = g.locked ? " uie-guide-locked" : "";
    const style = g.axis === "h" ? `top:${g.position}px;` : `left:${g.position}px;`;
    const labelStyle = g.axis === "h" ? `top:${g.position - 14}px;left:4px;` : `left:${g.position + 4}px;top:4px;`;
    return `<div class="uie-guide-line uie-guide-${g.axis === "h" ? "h" : "v"}${locked}" data-uie-guide="${escapeHtml(g.id)}" style="${style}"></div>
      <span class="uie-guide-label" data-uie-guide-label="${escapeHtml(g.id)}" style="${labelStyle}">${g.position}px</span>`;
  }).join("");
}

function uieGridBgStyle(dev, canvas) {
  if (canvas.showGrid === false) return "";
  const sz = canvas.gridSize || UIE_GRID;
  return `background-image:linear-gradient(to right,rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.06) 1px,transparent 1px);background-size:${sz}px ${sz}px;`;
}

function uieBindingsOverlayHtml(widgets, dev) {
  if (!UIE_BINDINGS_OVERLAY) return "";
  const chips = [];
  let svgPaths = "";
  widgets.forEach(w => {
    const evs = w.events || {};
    Object.entries(evs).forEach(([ev, b]) => {
      if (!b || b.binding === "none") return;
      if (b.type === "navigate" || b.binding === "navigate") {
        const label = `${uieWidgetDisplayName(w)} · ${ev} ${uieBindingLabel(b)}`;
        const wx = w.x + w.width, wy = w.y + w.height / 2;
        const chipY = chips.length * 28 + 8;
        const cx = dev.width - 8, cy = chipY + 12;
        svgPaths += `<path class="uie-bind-connector uie-bind-event" data-uie-bind-from="${escapeHtml(w.id)}" data-uie-bind-ev="${escapeHtml(ev)}" d="M ${wx} ${wy} C ${wx + 40} ${wy}, ${cx - 40} ${cy}, ${cx} ${cy}"/>`;
        chips.push(`<div class="uie-bind-chip-item uie-bind-event" data-uie-bind-chip="${escapeHtml(w.id)}" data-uie-bind-ev="${escapeHtml(ev)}" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`);
        return;
      }
      const nodes = (CURRENT_WF.nodes || []).reduce((m, n) => { m[n.id] = n; return m; }, {});
      const node = b.nodeId ? nodes[b.nodeId] : null;
      const missing = !node || node.type !== "ui_event";
      const kind = uieIsWaypointWidget(w) ? "cmd" : (missing ? "missing" : "event");
      const label = missing ? "Missing target" : `${uieWidgetDisplayName(w)} · ${ev}`;
      const wx = w.x + w.width, wy = w.y + w.height / 2;
      const chipY = chips.length * 28 + 8;
      const cx = dev.width - 8, cy = chipY + 12;
      const cls = missing ? "uie-bind-missing" : `uie-bind-${kind}`;
      const pathCls = missing ? "uie-bind-missing" : `uie-bind-${kind}`;
      svgPaths += `<path class="uie-bind-connector ${pathCls}" data-uie-bind-from="${escapeHtml(w.id)}" data-uie-bind-ev="${escapeHtml(ev)}" d="M ${wx} ${wy} C ${wx + 40} ${wy}, ${cx - 40} ${cy}, ${cx} ${cy}"/>`;
      chips.push(`<div class="uie-bind-chip-item ${cls}" data-uie-bind-chip="${escapeHtml(w.id)}" data-uie-bind-ev="${escapeHtml(ev)}" data-uie-bind-node="${escapeHtml(b.nodeId || "")}" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`);
    });
  });
  return `<svg class="uie-bindings-overlay" width="${dev.width}" height="${dev.height}" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none;">
    ${svgPaths}
  </svg>
  <div class="uie-bind-chip-strip" style="position:absolute;right:4px;top:0;width:100px;height:${dev.height}px;">${chips.join("")}</div>`;
}

function uieRenderSelectionLayers() {
  const ids = uieGetSelection();
  if (!ids.length) return "";
  const screenWidgets = uieScreenWidgets(uieEnsureUi().activeScreenId);
  const stackPositions = uieCollectStackPositions(screenWidgets);
  const bounds = ids.length > 1 ? uieSelectionBounds(ids) : null;
  let html = ids.map(id => {
    const w = uieFindWidget(id);
    if (!w) return "";
    const rect = uieGetWidgetRenderRect(w, stackPositions);
    if (ids.length > 1) return `<div class="uie-group-outline" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;"></div>`;
    const style = `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;`;
    return `<div class="uie-selection-box" data-uie-sel-box="${escapeHtml(w.id)}" style="position:absolute;${style}outline:2px solid var(--accent);outline-offset:0;pointer-events:none;box-sizing:border-box;">
    ${uieSelectionHandlesHtml({ ...w, x: rect.x, y: rect.y, width: rect.width, height: rect.height })}${uieBindingChip(w)}
  </div>`;
  }).join("");
  if (bounds && ids.length > 1) {
    html += `<div class="uie-group-box" data-uie-group-box="1" style="left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px;">
      <span class="uie-resize-handle uie-resize-nw" data-uie-handle="nw"></span>
      <span class="uie-resize-handle uie-resize-ne" data-uie-handle="ne"></span>
      <span class="uie-resize-handle uie-resize-se" data-uie-handle="se"></span>
      <span class="uie-resize-handle uie-resize-sw" data-uie-handle="sw"></span>
    </div>`;
  }
  return `<div class="uie-selection-layer">${html}</div>`;
}

function uieCanvasToolbarHtml(canvas) {
  return "";
}

function uieRenderDesigner() {
  const ui = uieEnsureUi();
  const canvasCfg = uieEnsureCanvas();
  const dev = uieGetDeviceSize();
  const screenWidgets = uieScreenWidgets(ui.activeScreenId);
  const stackPositions = uieCollectStackPositions(screenWidgets);
  const widgets = uieSortWidgetsByZ(screenWidgets);
  const selIds = uieGetSelection();
  const sel = selIds.length === 1 ? uieFindWidget(selIds[0]) : null;
  const canvasWidgets = widgets.map(w => uieRenderWidgetOnCanvas(w, uieIsSelected(w.id), false, stackPositions, uieGetWidgetRenderRect(w, stackPositions))).join("");
  const selectionLayer = uieRenderSelectionLayers();
  const vt = uieViewportTransform();
  const zoomPct = Math.round(vt.zoom * 100);
  const stateBtns = ["", "hover", "pressed", "disabled"].map(s => {
    const lbl = s || "Default";
    const active = UIE_STATE_PREVIEW === s || (!UIE_STATE_PREVIEW && !s) ? " uie-active" : "";
    return `<button type="button" class="secondary${active}" data-uie-state-preview="${escapeHtml(s)}">${escapeHtml(lbl)}</button>`;
  }).join("");
  const showRulers = canvasCfg.showRulers !== false;
  const rulerH = showRulers ? `<div class="uie-ruler-h" id="uie-ruler-h" style="width:${dev.width * vt.zoom}px;margin-left:20px;">${uieRulerTicksHtml("h", dev.width, vt.zoom)}</div>` : "";
  const rulerV = showRulers ? `<div class="uie-ruler-v" id="uie-ruler-v" style="height:${dev.height * vt.zoom}px;">${uieRulerTicksHtml("v", dev.height, vt.zoom)}</div>` : "";
  const gridStyle = uieGridBgStyle(dev, canvasCfg);

  return `${uieStylesHtml()}
    <div class="uie-root" id="uie-designer-root" tabindex="-1">
      <div class="uie-toolbar">
        <span class="uie-zoom-badge" id="uie-zoom-label">${zoomPct}%</span>
        <button type="button" class="secondary" id="uie-recenter-btn" title="Recenter — center device frame">&#x2316;</button>
        <button type="button" class="secondary" id="uie-zoom-fit">Fit</button>
        <input type="search" class="uie-search-box" id="uie-binding-search" placeholder="Find bindings…" value="${escapeHtml(UIE_BINDING_SEARCH)}">
        <div id="uie-binding-search-results" style="position:absolute;top:36px;right:340px;z-index:30;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;max-height:180px;overflow:auto;min-width:220px;${UIE_BINDING_SEARCH ? "" : "display:none;"}">${uieBindingSearchHtml(UIE_BINDING_SEARCH)}</div>
        ${sel ? `<div class="uie-state-preview-btns">State: ${stateBtns}</div>` : ""}
        <span style="color:var(--ink-muted);margin-left:auto;">Drag palette onto canvas · Drop on Frame for children · Hierarchy drop to nest · Wheel pan · Ctrl+zoom</span>
      </div>
      <div class="uie-main">
        <div class="uie-palette" id="uie-palette">
          ${uiePaletteHtml()}
          <div style="display:flex;gap:4px;margin:12px 0 6px;align-items:center;">
            <strong style="font-size:11px;color:var(--ink-muted);flex:1;">Hierarchy</strong>
            <button type="button" class="secondary" id="uie-folder-add" style="font-size:10px;padding:2px 6px;">+ Folder</button>
          </div>
          <div id="uie-hierarchy">${uieHierarchyHtml()}</div>
        </div>
        <div class="uie-center">
          ${uieCanvasToolbarHtml(canvasCfg)}
          <div class="uie-canvas-area">
            <div class="uie-canvas-col">
              ${showRulers ? `<div style="display:flex;"><div class="uie-ruler-corner"></div>${rulerH}</div>` : ""}
              <div class="uie-canvas-row">
                ${uieScreenSwitcherHtml()}
                ${rulerV}
                <div class="uie-canvas-wrap${UIE_PLACE_ARMED ? " uie-place-mode" : ""}" id="uie-canvas-wrap" style="flex:1;">
                  <div class="uie-viewport" id="uie-viewport">
                    <div class="uie-viewport-pad" style="padding:${UIE_SCROLL_PAD}px;">
                      <div class="uie-device-frame" id="uie-device-frame" style="width:${dev.width}px;height:${dev.height}px;position:relative;">
                        <div class="uie-canvas" id="uie-canvas" data-uie-canvas="1" style="width:${dev.width}px;height:${dev.height}px;${gridStyle}">
                          ${uieScreenBackgroundLayerHtml(uieActiveScreen())}
                          <div id="uie-guides">${uieGuidesHtml()}</div>
                          ${canvasWidgets}
                          ${selectionLayer}
                          ${uieBindingsOverlayHtml(widgets, dev)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="uie-events-drawer" id="uie-events-drawer" style="${sel ? "" : "display:none;"}">
            ${sel ? `<strong>Events — ${escapeHtml(uieWidgetDisplayName(sel))}</strong>
              <input type="search" id="uie-drawer-search" placeholder="Search bindings…" style="width:100%;margin:6px 0;font-size:11px;" value="${escapeHtml(UIE_BINDING_SEARCH)}">
              ${uieInspectorEventsHtml(sel, true)}` : ""}
          </div>
          <div class="uie-generated-console" id="uie-generated-console" hidden></div>
        </div>
        <div class="uie-inspector" id="uie-inspector">${uieInspectorHtml(sel)}</div>
      </div>
    </div>`;
}

function uieInitPreviewState() {
  UIE_PREVIEW_STATE = {};
  UIE_PREVIEW_WIDGET_STATE = {};
  UIE_PREVIEW_SCREEN_ID = uieEnsureUi().activeScreenId;
  (CURRENT_WF.variables || []).forEach(v => {
    const d = v.default ?? "";
    if (v.type === "int") UIE_PREVIEW_STATE[v.name] = parseInt(d, 10) || 0;
    else if (v.type === "float") UIE_PREVIEW_STATE[v.name] = parseFloat(d) || 0;
    else if (v.type === "bool") UIE_PREVIEW_STATE[v.name] = ["true", "1", "yes", "on"].includes(String(d).toLowerCase());
    else UIE_PREVIEW_STATE[v.name] = d;
  });
  UIE_PREVIEW_LOG = [];
}

function uiePreviewRuntimeWidget(w) {
  const runtime = UIE_PREVIEW_WIDGET_STATE[w.id] || {};
  return {
    ...w,
    z: w.z ?? uieEnsureUi().widgets.indexOf(w),
    x: runtime.x ?? w.x,
    y: runtime.y ?? w.y,
    width: runtime.width ?? w.width,
    height: runtime.height ?? w.height,
    props: { ...(w.props || {}), ...(runtime.props || {}) },
  };
}

function uiePreviewRerenderCanvas() {
  const canvas = document.getElementById("uie-preview-canvas");
  if (!canvas) return;
  const baseDev = uieGetDeviceSize();
  const dev = uieGetResponsivePreviewSize(baseDev);
  const screenId = uiePreviewActiveScreenId();
  const screenWidgets = uieScreenWidgets(screenId);
  const stackPositions = uieCollectStackPositions(screenWidgets);
  const widgets = uieSortWidgetsByZ(screenWidgets).map(uiePreviewRuntimeWidget);
  const screenBg = uieScreenBackgroundLayerHtml(uieFindScreen(screenId));
  canvas.style.width = `${dev.width}px`;
  canvas.style.height = `${dev.height}px`;
  const frame = canvas.closest(".uie-device-frame");
  if (frame) {
    frame.style.width = `${dev.width}px`;
    frame.style.height = `${dev.height}px`;
  }
  canvas.innerHTML = screenBg + widgets.map(w => uieRenderWidgetOnCanvas(w, false, true, stackPositions, uieGetWidgetRenderRect(w, stackPositions))).join("");
  uieWireWaypointPreview(canvas);
  uieEnsureUi().widgets.filter(w => w.type === "wp_data_list" && w.screenId === screenId).forEach(w => {
    const container = canvas.querySelector(`[data-uie-wp-data="${w.id}"]`);
    if (container) uieRenderDataListContent(w.id, container);
  });
}

function uieRenderPreview(customAppMode) {
  uieInitPreviewState();
  const ui = uieEnsureUi();
  const baseDev = uieGetDeviceSize();
  const dev = uieGetResponsivePreviewSize(baseDev);
  const screenId = uiePreviewActiveScreenId();
  const screenWidgets = uieScreenWidgets(screenId);
  const stackPositions = uieCollectStackPositions(screenWidgets);
  const widgets = uieSortWidgetsByZ(screenWidgets).map(uiePreviewRuntimeWidget)
    .map(w => uieRenderWidgetOnCanvas(w, false, true, stackPositions, uieGetWidgetRenderRect(w, stackPositions))).join("");
  const screenBg = uieScreenBackgroundLayerHtml(uieFindScreen(screenId));
  const responsiveBar = customAppMode || window.CUSTOM_APP_VIEW ? "" : `
    <div class="uie-responsive-bar">
      <span>Preview ${dev.width}×${dev.height}</span>
      <button type="button" class="secondary" id="uie-responsive-apply">Apply as preset</button>
    </div>`;
  const responsiveHandles = customAppMode || window.CUSTOM_APP_VIEW ? "" : `
    <span class="uie-responsive-handle uie-responsive-handle-e" data-uie-rhandle="e"></span>
    <span class="uie-responsive-handle uie-responsive-handle-w" data-uie-rhandle="w"></span>
    <span class="uie-responsive-handle uie-responsive-handle-n" data-uie-rhandle="n"></span>
    <span class="uie-responsive-handle uie-responsive-handle-s" data-uie-rhandle="s"></span>`;
  const isCustomApp = customAppMode || window.CUSTOM_APP_VIEW;
  if (isCustomApp) {
    return `${uieStylesHtml()}
      <div class="uie-preview-root uie-custom-app-preview" id="uie-preview-root" style="height:calc(100vh - 44px);">
        <div class="uie-preview-canvas-wrap" style="flex:1;">
          <div class="uie-device-frame" style="width:${dev.width}px;height:${dev.height}px;position:relative;">
            <div class="uie-canvas" id="uie-preview-canvas" tabindex="0" style="width:${dev.width}px;height:${dev.height}px;">${screenBg}${widgets}</div>
          </div>
        </div>
      </div>`;
  }
  const stateRows = Object.entries(UIE_PREVIEW_STATE).map(([k, v]) =>
    `<div class="uie-state-row"><span>${escapeHtml(k)}</span><span data-uie-state-val="${escapeHtml(k)}">${escapeHtml(String(v))}</span></div>`
  ).join("") || `<div class="stub">No variables</div>`;
  const keybinds = ui.keybinds || [];
  const eventNodes = (CURRENT_WF.nodes || []).filter(n => n.type === "ui_event");
  const keyRows = keybinds.map((kb, i) => {
    const opts = eventNodes.map(n => {
      const lbl = n.label || n.id;
      return `<option value="${escapeHtml(n.id)}" ${kb.event_node_id === n.id ? "selected" : ""}>${escapeHtml(lbl)}</option>`;
    }).join("");
    return `<div class="uie-key-row">
      <input type="text" data-uie-keybind-key="${i}" value="${escapeHtml(kb.key || "")}" placeholder="Key">
      <select data-uie-keybind-node="${i}"><option value="">— event —</option>${opts}</select>
      <button type="button" class="secondary" data-uie-keybind-del="${i}">×</button>
    </div>`;
  }).join("");

  return `${uieStylesHtml()}
    <div class="uie-preview-root" id="uie-preview-root">
      <div class="uie-preview-main">
        <div class="uie-toolbar">
          <strong>Preview</strong>
          <span style="color:var(--ink-muted);margin-left:8px;">Screen: ${escapeHtml(uieFindScreen(screenId)?.name || screenId)}</span>
          <span id="uie-preview-run-status" style="color:var(--ink-muted);margin-left:auto;">Ready</span>
          <button type="button" class="primary" id="uie-preview-run" title="Restart Blueprint in Preview">Run</button>
          <button type="button" class="secondary" id="uie-preview-stop" title="Stop Blueprint timers">Stop</button>
        </div>
        ${responsiveBar}
        <div class="uie-preview-canvas-wrap">
          <div class="uie-device-frame" id="uie-preview-device-frame" style="width:${dev.width}px;height:${dev.height}px;position:relative;">
            ${responsiveHandles}
            <div class="uie-canvas" id="uie-preview-canvas" tabindex="0" style="width:${dev.width}px;height:${dev.height}px;">${screenBg}${widgets}</div>
          </div>
        </div>
      </div>
      <div class="uie-state-panel">
        <strong>State</strong>
        <div id="uie-state-list" style="margin-top:8px;">${stateRows}</div>
        <div class="uie-keys-panel">
          <strong>Keys</strong>
          <div id="uie-keybind-list">${keyRows || `<div class="stub">No key bindings</div>`}</div>
          <button type="button" class="secondary" id="uie-keybind-add" style="width:100%;margin-top:6px;font-size:11px;">+ Add key binding</button>
        </div>
        <strong style="display:block;margin-top:12px;">Console</strong>
        <pre id="uie-preview-console" style="font-size:10px;max-height:120px;overflow:auto;margin-top:4px;"></pre>
      </div>
    </div>`;
}

function uieCollectBindings() {
  const rows = [];
  const nodes = { ...(CURRENT_WF.nodes || []).reduce((m, n) => { m[n.id] = n; return m; }, {}) };
  uieEnsureUi().widgets.forEach(w => {
    const evs = w.events || {};
    Object.entries(evs).forEach(([ev, b]) => {
      if (!b || !b.binding || b.binding === "none") return;
      let ok = true;
      let msg = "";
      if (!b.nodeId) { ok = false; msg = "Missing node"; }
      else if (!nodes[b.nodeId]) { ok = false; msg = "Node not found"; }
      else if (nodes[b.nodeId].type !== "ui_event") { ok = false; msg = "Not a UI event node"; }
      rows.push({ widgetId: w.id, event: ev, nodeId: b.nodeId, ok, msg });
    });
  });
  return rows;
}

function uieHasBindingErrors() {
  return uieCollectBindings().some(r => !r.ok);
}

function uieRenderBindingsConsole() {
  const rows = uieCollectBindings();
  const body = rows.length ? rows.map(r => `
    <tr class="${r.ok ? "" : "uie-bind-error"}">
      <td>${escapeHtml(r.widgetId)}</td>
      <td>${escapeHtml(r.event)}</td>
      <td>${escapeHtml(r.nodeId || "—")}</td>
      <td>${r.ok ? "OK" : escapeHtml(r.msg)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="stub">No bindings yet</td></tr>`;

  return `${uieStylesHtml()}
    <div style="padding:12px;">
      <h3 style="margin:0 0 8px;">Bindings Console</h3>
      <p class="page-subtitle" style="margin:0 0 12px;">Export requires all bindings to resolve to valid UI event nodes.</p>
      <table class="uie-bindings-table">
        <thead><tr><th>Widget</th><th>Event</th><th>Node</th><th>Status</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function uieCreateGraphEvent(widgetId, eventName) {
  wfPushUndo();
  wfNodeCounter += 1;
  const nodeId = `n${Date.now()}_${wfNodeCounter}`;
  const label = `On_${widgetId}_${eventName}`;
  // Stack new event nodes under existing ui_event nodes so they land in view.
  const peers = (CURRENT_WF.nodes || []).filter(n => n.type === "ui_event");
  const baseX = peers.length ? Math.max(...peers.map(n => n.x || 80)) : 120;
  const baseY = peers.length ? Math.max(...peers.map(n => n.y || 80)) + 140 : 120;
  const node = {
    id: nodeId,
    type: "ui_event",
    x: baseX,
    y: baseY,
    params: { event: eventName, widget_id: widgetId },
    label,
  };
  CURRENT_WF.nodes.push(node);
  const w = uieFindWidget(widgetId);
  if (w) {
    w.events = w.events || {};
    w.events[eventName] = { binding: "graph", nodeId };
  }
  return nodeId;
}

function uieFrameEventNode(nodeId) {
  STUDIO_TAB = "graph";
  renderAutomationStudioView().then(() => {
    setTimeout(() => {
      WF_SELECTED_NODES = new Set([nodeId]);
      document.querySelectorAll(".node-card").forEach(c => {
        c.classList.toggle("wf-selected", c.dataset.nodeId === nodeId);
      });
      if (typeof wfFrameSearchMatch === "function") wfFrameSearchMatch(nodeId);
      else if (typeof wfFitNodesBounds === "function") wfFitNodesBounds([nodeId]);
    }, 80);
  });
}

function uiePreviewToast(msg) {
  if (typeof showToast === "function") showToast(msg);
  UIE_PREVIEW_LOG.push(msg);
  const el = document.getElementById("uie-preview-console");
  if (el) el.textContent = UIE_PREVIEW_LOG.slice(-20).join("\n");
}

function uiePreviewResolveParam(node, name, nodes, edges, cache) {
  const dataEdge = edges.find(e => e.kind === "data" && e.to === node.id && e.toPort === name);
  if (dataEdge) return uiePreviewDataExpr(dataEdge.from, dataEdge.fromPort || "value", nodes, edges, cache);
  const raw = (node.params || {})[name];
  return raw !== undefined && raw !== "" ? raw : null;
}

function uiePreviewDataExpr(nodeId, port, nodes, edges, cache) {
  const key = `${nodeId}:${port}`;
  if (cache[key] !== undefined) return cache[key];
  const node = nodes[nodeId];
  if (!node) return null;
  if (node.type === "get_var") {
    cache[key] = UIE_PREVIEW_STATE[node.varName] ?? null;
    return cache[key];
  }
  if (node.type === "literal_string") {
    cache[key] = (node.params || {}).value ?? "";
    return cache[key];
  }
  if (node.type === "literal_bool") {
    const raw = String((node.params || {}).value ?? "").toLowerCase();
    cache[key] = ["true", "1", "yes", "on"].includes(raw);
    return cache[key];
  }
  if (node.type === "literal_number") {
    cache[key] = parseFloat((node.params || {}).value) || 0;
    return cache[key];
  }
  if (node.type === "reroute") {
    const e = edges.find(x => x.kind === "data" && x.to === nodeId && x.toPort === "in");
    cache[key] = e ? uiePreviewDataExpr(e.from, e.fromPort || "out", nodes, edges, cache) : null;
    return cache[key];
  }
  if (node.type.startsWith("cast_")) {
    const value = uiePreviewResolveParam(node, "value", nodes, edges, cache);
    cache[key] = typeof wfCastValue === "function" ? wfCastValue(node.type, value) : value;
    return cache[key];
  }
  const a = uiePreviewResolveParam(node, "a", nodes, edges, cache);
  const b = uiePreviewResolveParam(node, "b", nodes, edges, cache);
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
  if (node.type === "concat_text") {
    cache[key] = String(a ?? "") + String(b ?? "");
    return cache[key];
  }
  return null;
}

const UIE_PREVIEW_SUPPORTED = new Set([
  "ui_event", "print", "print_value", "set_var", "get_var", "if", "endif", "exec_gate",
  "add", "subtract", "multiply", "divide", "modulo", "concat_text", "compare",
  "call_func", "func_entry", "func_return", "reroute", "start", "custom",
  "keyboard_event", "on_tick", "increment", "set_widget", "stop_preview",
  "cast_string", "cast_int", "cast_float", "cast_bool", "cast_list", "cast_json",
]);

function uiePreviewExecCustomCode(code) {
  const state = UIE_PREVIEW_STATE;
  const float = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const int = v => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const prelude = Object.keys(state).map(k => `let ${k} = state[${JSON.stringify(k)}];`).join("\n");
  const epilogue = Object.keys(state).map(k => `state[${JSON.stringify(k)}] = ${k};`).join("\n");
  const fn = new Function("state", "float", "int", `${prelude}\n${code}\n${epilogue}`);
  fn(state, float, int);
}

function uiePreviewExecFrom(nodeId, nodes, edges, execEdges) {
  let cur = nodeId;
  const cache = {};
  let steps = 0;
  while (cur && steps < 500) {
    steps += 1;
    const node = nodes[cur];
    if (!node) return;
    const t = node.type;
    if (t === "ui_event" || t === "keyboard_event" || t === "on_tick"
        || t === "start" || t === "func_entry" || t === "reroute") {
      cur = execEdges[cur]?.next;
      continue;
    }
    if (t === "endif" || t === "func_return") return;
    if (!UIE_PREVIEW_SUPPORTED.has(t)) {
      uiePreviewToast(`Preview cannot execute: ${t}`);
      return;
    }
    if (t === "print") {
      const msg = uiePreviewResolveParam(node, "message", nodes, edges, cache) ?? "";
      uiePreviewToast(String(msg));
      console.log(msg);
    } else if (t === "print_value") {
      const ex = uiePreviewResolveParam(node, "expression", nodes, edges, cache);
      uiePreviewToast(String(ex));
      console.log(ex);
    } else if (t === "set_var") {
      const val = uiePreviewResolveParam(node, "value", nodes, edges, cache);
      UIE_PREVIEW_STATE[node.varName] = val;
      uiePreviewRefreshState();
    } else if (t === "increment") {
      const name = String((node.params || {}).variable || "");
      const amount = Number(uiePreviewResolveParam(node, "amount", nodes, edges, cache)) || 0;
      if (name) UIE_PREVIEW_STATE[name] = (Number(UIE_PREVIEW_STATE[name]) || 0) + amount;
      uiePreviewRefreshState();
    } else if (t === "set_widget") {
      const widgetId = String((node.params || {}).widget_id || "");
      const property = String((node.params || {}).property || "");
      const value = uiePreviewResolveParam(node, "value", nodes, edges, cache);
      if (!uiePreviewSetWidgetProperty(widgetId, property, value)) {
        uiePreviewToast(`Set Widget could not update ${widgetId || "?"}.${property || "?"}`);
      }
    } else if (t === "if") {
      const cond = uiePreviewResolveParam(node, "condition", nodes, edges, cache);
      const branch = cond ? "true" : "false";
      cur = execEdges[cur]?.[branch];
      continue;
    } else if (t === "exec_gate") {
      const rawOpen = uiePreviewResolveParam(node, "open", nodes, edges, cache);
      const gateOpen = rawOpen == null
        ? true
        : (typeof wfTruthy === "function" ? wfTruthy(rawOpen) : !!rawOpen);
      if (!gateOpen) {
        uiePreviewToast("Execution Gate blocked");
        return;
      }
      cur = execEdges[cur]?.pass;
      continue;
    } else if (t === "call_func") {
      uiePreviewToast(`Preview cannot execute: call_func (stub)`);
    } else if (t === "custom") {
      const code = String((node.params || {}).code || "").trim();
      if (!code) {
        cur = execEdges[cur]?.next;
        continue;
      }
      try {
        uiePreviewExecCustomCode(code);
      } catch (err) {
        uiePreviewToast(`Custom node error: ${err.message}`);
        return;
      }
    } else if (t === "stop_preview") {
      const message = uiePreviewResolveParam(node, "message", nodes, edges, cache);
      if (message !== null && message !== "") uiePreviewToast(String(message));
      uieStopBlueprintPreview({ silent: true });
      return;
    }
    cur = execEdges[cur]?.next;
    uiePreviewRefreshWidgets();
  }
}

function uiePreviewSetWidgetProperty(widgetId, property, value) {
  const widget = uieFindWidget(widgetId);
  if (!widget || !["x", "y", "width", "height", "text", "visible"].includes(property)) return false;
  const runtime = UIE_PREVIEW_WIDGET_STATE[widgetId] || (UIE_PREVIEW_WIDGET_STATE[widgetId] = { props: {} });
  runtime.props = runtime.props || {};
  if (["x", "y", "width", "height"].includes(property)) {
    const number = Number(value);
    if (!Number.isFinite(number)) return false;
    runtime[property] = number;
  } else if (property === "visible") {
    runtime.props.visible = typeof value === "string"
      ? !["false", "0", "no", "off", ""].includes(value.trim().toLowerCase())
      : !!value;
  } else {
    runtime.props.text = String(value ?? "");
  }
  return true;
}

function uiePreviewBuildMaps() {
  const nodes = (CURRENT_WF.nodes || []).reduce((map, node) => {
    map[node.id] = node;
    return map;
  }, {});
  const edges = CURRENT_WF.edges || [];
  const execEdges = {};
  edges.filter(edge => edge.kind !== "data").forEach(edge => {
    execEdges[edge.from] = execEdges[edge.from] || {};
    execEdges[edge.from][edge.fromPort || "next"] = edge.to;
  });
  return { nodes, edges, execEdges };
}

function uieStopBlueprintPreview(options) {
  UIE_PREVIEW_TICK_HANDLES.forEach(handle => clearInterval(handle));
  UIE_PREVIEW_TICK_HANDLES = [];
  const wasRunning = UIE_PREVIEW_RUNNING;
  UIE_PREVIEW_RUNNING = false;
  const status = document.getElementById("uie-preview-run-status");
  if (status) status.textContent = "Stopped";
  document.getElementById("uie-preview-root")?.removeAttribute("data-blueprint-running");
  if (wasRunning && !options?.silent) uiePreviewToast("Blueprint stopped");
}

function uiePlayBlueprintInPreview() {
  uieStopBlueprintPreview({ silent: true });
  uieInitPreviewState();
  uiePreviewRerenderCanvas();
  uiePreviewRefreshState();
  uiePreviewRefreshWidgets();

  const { nodes, edges, execEdges } = uiePreviewBuildMaps();
  UIE_PREVIEW_RUNNING = true;
  const status = document.getElementById("uie-preview-run-status");
  if (status) status.textContent = "Running";
  document.getElementById("uie-preview-root")?.setAttribute("data-blueprint-running", "true");

  const start = (CURRENT_WF.nodes || []).find(node => node.type === "start");
  if (start) uiePreviewExecFrom(start.id, nodes, edges, execEdges);
  if (!UIE_PREVIEW_RUNNING) return;

  (CURRENT_WF.nodes || []).filter(node => node.type === "on_tick").forEach(node => {
    const raw = Number((node.params || {}).interval_ms);
    const interval = Math.max(16, Number.isFinite(raw) && raw > 0 ? raw : 50);
    const handle = setInterval(() => {
      if (!UIE_PREVIEW_RUNNING || (typeof STUDIO_TAB !== "undefined" && STUDIO_TAB !== "preview")) {
        uieStopBlueprintPreview({ silent: true });
        return;
      }
      uiePreviewExecFrom(node.id, nodes, edges, execEdges);
    }, interval);
    UIE_PREVIEW_TICK_HANDLES.push(handle);
  });

  const eventCount = (CURRENT_WF.nodes || []).filter(node =>
    node.type === "ui_event" || node.type === "keyboard_event" || node.type === "on_tick"
  ).length;
  uiePreviewToast(eventCount ? "Blueprint running — Preview events are live" : "Blueprint finished its Start flow");
}

function uiePreviewRefreshState() {
  document.querySelectorAll("[data-uie-state-val]").forEach(el => {
    const k = el.dataset.uieStateVal;
    if (k && UIE_PREVIEW_STATE[k] !== undefined) el.textContent = String(UIE_PREVIEW_STATE[k]);
  });
}

function uiePreviewRefreshWidgets() {
  const canvas = document.getElementById("uie-preview-canvas");
  if (!canvas) return;
  const screenId = uiePreviewActiveScreenId();
  uieScreenWidgets(screenId).map(uiePreviewRuntimeWidget).forEach(w => {
    const el = canvas.querySelector(`[data-uie-widget="${w.id}"]`);
    if (!el) return;
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
    el.style.width = `${w.width}px`;
    el.style.height = `${w.height}px`;
    const props = uieEffectiveWidgetProps(w);
    el.style.display = props.visible === false ? "none" : "";
    if (w.type === "label") {
      const value = props.textVariable && UIE_PREVIEW_STATE[props.textVariable] !== undefined
        ? UIE_PREVIEW_STATE[props.textVariable]
        : (props.text || "Label");
      const label = el.querySelector(".uie-w-label");
      if (label && label.textContent !== String(value)) label.textContent = String(value);
    } else if (w.type === "button") {
      const button = el.querySelector(".uie-w-btn");
      const value = String(props.text || "Button");
      if (button && button.textContent !== value) button.textContent = value;
    }
  });
}

function uiePreviewFireEvent(widgetId, eventName) {
  const w = uieFindWidget(widgetId);
  if (!w) return;
  const b = (w.events || {})[eventName];
  if (!b) return;
  if (b.type === "navigate" || b.binding === "navigate") {
    if (b.targetScreenId) {
      uiePreviewSetScreen(b.targetScreenId);
      uiePreviewRerenderCanvas();
      uiePreviewToast(`Navigate → ${uieFindScreen(b.targetScreenId)?.name || b.targetScreenId}`);
    }
    return;
  }
  if (!b.nodeId) return;
  const { nodes, edges, execEdges } = uiePreviewBuildMaps();
  uiePreviewExecFrom(b.nodeId, nodes, edges, execEdges);
}

function uiePreviewKeyMatches(configured, key, code) {
  const wanted = String(configured || "").trim().toLowerCase();
  if (!wanted) return false;
  const pressed = [key, code].map(value => String(value || "").trim().toLowerCase());
  if (wanted === "space" || wanted === "spacebar") {
    return key === " " || pressed.includes("space");
  }
  return pressed.includes(wanted);
}

function uiePreviewFireKeyboard(key, code) {
  const { nodes, edges, execEdges } = uiePreviewBuildMaps();
  (CURRENT_WF.nodes || []).filter(node =>
    node.type === "keyboard_event"
      && uiePreviewKeyMatches((node.params || {}).key, key, code)
  ).forEach(node => uiePreviewExecFrom(node.id, nodes, edges, execEdges));

  (uieEnsureUi().keybinds || []).filter(binding =>
    binding.event_node_id && uiePreviewKeyMatches(binding.key, key, code)
  ).forEach(binding => uiePreviewExecFrom(binding.event_node_id, nodes, edges, execEdges));
}

function uieViewportOffset() {
  const wrap = document.getElementById("uie-canvas-wrap");
  const vt = uieViewportTransform();
  const dev = uieGetDeviceSize();
  const pad = UIE_SCROLL_PAD;
  if (!wrap) return { ox: 0, oy: 0, zoom: vt.zoom, pad };
  const cx = wrap.clientWidth / 2;
  const cy = wrap.clientHeight / 2;
  const totalW = dev.width + pad * 2;
  const totalH = dev.height + pad * 2;
  return {
    ox: cx - (totalW * vt.zoom) / 2 + vt.panX,
    oy: cy - (totalH * vt.zoom) / 2 + vt.panY,
    zoom: vt.zoom,
    pad,
  };
}

function uieApplyViewportCss() {
  const vp = document.getElementById("uie-viewport");
  const label = document.getElementById("uie-zoom-label");
  if (!vp) return;
  const { ox, oy, zoom } = uieViewportOffset();
  vp.style.transform = `translate(${ox}px, ${oy}px) scale(${zoom})`;
  vp.style.transformOrigin = "0 0";
  if (label) label.textContent = `${Math.round(zoom * 100)}%`;
}

function uieCanvasPointFromEvent(e) {
  const wrap = document.getElementById("uie-canvas-wrap");
  const { ox, oy, zoom, pad } = uieViewportOffset();
  const rect = wrap.getBoundingClientRect();
  return { x: (e.clientX - rect.left - ox) / zoom - pad, y: (e.clientY - rect.top - oy) / zoom - pad };
}

function uieRecenterView() {
  const ui = uieEnsureUi();
  const vt = uieViewportTransform();
  ui.view = { zoom: vt.zoom, panX: 0, panY: 0 };
  uieApplyViewportCss();
}

function uieScrollWidgetIntoView(widgetId, opts) {
  const w = uieFindWidget(widgetId);
  const wrap = document.getElementById("uie-canvas-wrap");
  if (!w || !wrap) return;
  const screenWidgets = uieScreenWidgets(uieEnsureUi().activeScreenId);
  const stackPositions = uieCollectStackPositions(screenWidgets);
  const rect = uieGetWidgetRenderRect(w, stackPositions);
  const { ox, oy, zoom, pad } = uieViewportOffset();
  const margin = opts?.margin ?? 24;
  const left = ox + (pad + rect.x) * zoom;
  const top = oy + (pad + rect.y) * zoom;
  const right = ox + (pad + rect.x + rect.width) * zoom;
  const bottom = oy + (pad + rect.y + rect.height) * zoom;
  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;
  let dPanX = 0;
  let dPanY = 0;
  if (left < margin) dPanX = margin - left;
  else if (right > vw - margin) dPanX = (vw - margin) - right;
  if (top < margin) dPanY = margin - top;
  else if (bottom > vh - margin) dPanY = (vh - margin) - bottom;
  if (!dPanX && !dPanY) return;
  const ui = uieEnsureUi();
  ui.view.panX = (ui.view.panX || 0) + dPanX;
  ui.view.panY = (ui.view.panY || 0) + dPanY;
  uieApplyViewportCss();
}

function uieApplyWheelPanZoom(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const ui = uieEnsureUi();
    const vt = uieViewportTransform();
    // Damped exponential zoom — matches Blueprint feel.
    let dyZoom = e.deltaY || 0;
    if (e.deltaMode === 1) dyZoom *= 16;
    const factor = Math.exp(-dyZoom * 0.00055);
    ui.view.zoom = Math.min(2, Math.max(0.25, vt.zoom * factor));
    uieApplyViewportCss();
    const zl = document.getElementById("uie-zoom-label");
    if (zl) zl.textContent = `${Math.round(ui.view.zoom * 100)}%`;
    return;
  }
  e.preventDefault();
  const ui = uieEnsureUi();
  let dx = 0;
  let dy = 0;
  if (e.shiftKey) {
    dx = -e.deltaY;
    if (e.deltaX) dx -= e.deltaX;
  } else {
    dy = -e.deltaY;
    if (e.deltaX) dx -= e.deltaX;
  }
  ui.view.panX = (ui.view.panX || 0) + dx * 0.92;
  ui.view.panY = (ui.view.panY || 0) + dy * 0.92;
  uieApplyViewportCss();
}

function uieFitZoom() {
  const wrap = document.getElementById("uie-canvas-wrap");
  if (!wrap) return;
  const dev = uieGetDeviceSize();
  const pad = 32;
  const zoom = Math.min(2, Math.max(0.25, Math.min((wrap.clientWidth - pad) / dev.width, (wrap.clientHeight - pad) / dev.height)));
  uieEnsureUi().view = { zoom, panX: 0, panY: 0 };
  uieApplyViewportCss();
}

function uieArmPlacement(type) {
  uieCancelPlacement();
  UIE_PLACE_ARMED = type;
  const wrap = document.getElementById("uie-canvas-wrap");
  wrap?.classList.add("uie-place-mode");
  let ghost = document.getElementById("uie-place-ghost");
  if (!ghost) {
    ghost = document.createElement("div");
    ghost.id = "uie-place-ghost";
    ghost.className = "uie-place-ghost";
    document.body.appendChild(ghost);
  }
  const spec = UIE_WIDGET_TYPES.find(t => t.type === type)
    || UIE_WAYPOINT_WIDGETS.find(t => t.type === type)
    || { w: 100, h: 32, label: type };
  ghost.textContent = spec.label || type;
  ghost.style.width = `${spec.w}px`;
  ghost.style.height = `${spec.h}px`;
  document.querySelectorAll("[data-uie-palette]").forEach(el => {
    el.classList.toggle("uie-armed", el.dataset.uiePalette === type);
  });
}

function uieMovePlaceGhost(e) {
  const ghost = document.getElementById("uie-place-ghost");
  if (!ghost || !UIE_PLACE_ARMED) return;
  const spec = UIE_WIDGET_TYPES.find(t => t.type === UIE_PLACE_ARMED)
    || UIE_WAYPOINT_WIDGETS.find(t => t.type === UIE_PLACE_ARMED)
    || { w: 100, h: 32 };
  ghost.style.left = `${e.clientX - spec.w / 2}px`;
  ghost.style.top = `${e.clientY - spec.h / 2}px`;
}

function uiePlaceAtCanvasPoint(pt) {
  if (!UIE_PLACE_ARMED) return;
  const type = UIE_PLACE_ARMED;
  uieCancelPlacement();
  uieAddWidget(type, pt.x, pt.y);
  renderAutomationStudioView();
}

function uieUpdateDeviceFromInputs() {
  const ui = uieEnsureUi();
  const w = Number(document.getElementById("uie-device-w")?.value) || 375;
  const h = Number(document.getElementById("uie-device-h")?.value) || 667;
  const preset = document.getElementById("uie-device-select")?.value || "custom";
  if (preset === "custom") ui.device = { preset: "custom", w, h };
  else ui.device = uieNormalizeDevice(preset);
}

function uieApplyDeviceDimensions() {
  uieUpdateDeviceFromInputs();
  const dev = uieGetDeviceSize();
  const frame = document.getElementById("uie-device-frame");
  const canvas = document.getElementById("uie-canvas");
  if (frame) {
    frame.style.width = `${dev.width}px`;
    frame.style.height = `${dev.height}px`;
  }
  if (canvas) {
    canvas.style.width = `${dev.width}px`;
    canvas.style.height = `${dev.height}px`;
  }
  uieApplyViewportCss();
}

function uieSetWidgetAppearanceProp(w, key, val, tokenRef) {
  const section = ["fontSize", "fontFamily"].includes(key) ? "typography" : "appearance";
  const stored = tokenRef ? uieStorePropWithResolve(val, tokenRef) : val;
  if (w.styleClassId) {
    uieSetStyleOverride(w, section, key, stored);
  } else {
    w.props = w.props || {};
    w.props[key] = stored;
  }
}

function uieWireZoneI() {
  document.getElementById("uie-screen-add")?.addEventListener("click", () => {
    const name = window.prompt("Screen name:", "Screen");
    if (name == null) return;
    uieAddScreen(name.trim() || "Screen");
    renderAutomationStudioView();
  });
  document.querySelectorAll("[data-uie-screen]").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-uie-screen-dup], [data-uie-screen-ren], [data-uie-screen-del]")) return;
      uieSetActiveScreen(el.dataset.uieScreen);
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-screen-dup]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      uieDuplicateScreen(btn.dataset.uieScreenDup);
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-screen-ren]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const scr = uieFindScreen(btn.dataset.uieScreenRen);
      if (!scr) return;
      const name = window.prompt("Rename screen:", scr.name);
      if (name == null) return;
      uieDesignerRecordUndo();
      scr.name = name.trim() || scr.name;
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-screen-del]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (window.confirm("Delete this screen and its widgets?")) {
        uieDeleteScreen(btn.dataset.uieScreenDel);
        renderAutomationStudioView();
      }
    });
  });

  document.getElementById("uie-style-add")?.addEventListener("click", () => {
    uieDesignerRecordUndo();
    const id = uieNextStyleId();
    uieEnsureStyles().push({ id, name: "New Style", props: uieDefaultStyleProps() });
    UIE_SELECTED_STYLE_CLASS = id;
    renderAutomationStudioView();
  });
  document.querySelectorAll("[data-uie-style-class]").forEach(el => {
    el.addEventListener("click", () => {
      UIE_SELECTED_STYLE_CLASS = el.dataset.uieStyleClass;
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-style-del]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      uieDesignerRecordUndo();
      const id = btn.dataset.uieStyleDel;
      const ui = uieEnsureUi();
      ui.styles = ui.styles.filter(s => s.id !== id);
      ui.widgets.forEach(w => { if (w.styleClassId === id) w.styleClassId = null; });
      if (UIE_SELECTED_STYLE_CLASS === id) UIE_SELECTED_STYLE_CLASS = null;
      renderAutomationStudioView();
    });
  });
  const wireStyleEditor = () => {
    document.querySelector("[data-uie-style-name]")?.addEventListener("input", e => {
      const sc = uieEnsureStyleClass(UIE_SELECTED_STYLE_CLASS);
      if (!sc) return;
      uieDesignerRecordUndo();
      sc.name = e.target.value;
      renderAutomationStudioView();
    });
    document.querySelectorAll("[data-uie-style-prop]").forEach(inp => {
      const handler = () => {
        const sc = uieEnsureStyleClass(UIE_SELECTED_STYLE_CLASS);
        if (!sc) return;
        const [section, key] = inp.dataset.uieStyleProp.split(":");
        uieDesignerRecordUndo();
        sc.props[section] = sc.props[section] || {};
        sc.props[section][key] = inp.type === "number" ? Number(inp.value) : inp.value;
        uieRefreshTokenReferences();
        renderAutomationStudioView();
      };
      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });
  };
  wireStyleEditor();

  document.getElementById("uie-token-color-add")?.addEventListener("click", () => {
    uieDesignerRecordUndo();
    const id = uieNextTokenId("color");
    const n = uieEnsureTokens().colors.length + 1;
    uieEnsureTokens().colors.push({ id, name: `primary${n > 1 ? n : ""}`, value: "#4a9eff" });
    uieRefreshTokenReferences();
    renderAutomationStudioView();
  });
  document.getElementById("uie-token-font-add")?.addEventListener("click", () => {
    uieDesignerRecordUndo();
    const id = uieNextTokenId("font");
    const n = uieEnsureTokens().fonts.length + 1;
    uieEnsureTokens().fonts.push({ id, name: `body${n > 1 ? n : ""}`, value: "sans-serif" });
    uieRefreshTokenReferences();
    renderAutomationStudioView();
  });
  document.querySelectorAll("[data-uie-token-color-val]").forEach(inp => {
    inp.addEventListener("input", () => {
      const tok = uieEnsureTokens().colors.find(t => t.id === inp.dataset.uieTokenColorVal);
      if (!tok) return;
      uieDesignerRecordUndo();
      tok.value = inp.value;
      uieRefreshTokenReferences();
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-token-font-val]").forEach(inp => {
    inp.addEventListener("input", () => {
      const tok = uieEnsureTokens().fonts.find(t => t.id === inp.dataset.uieTokenFontVal);
      if (!tok) return;
      uieDesignerRecordUndo();
      tok.value = inp.value;
      uieRefreshTokenReferences();
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-token-color-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      uieDesignerRecordUndo();
      uieEnsureTokens().colors = uieEnsureTokens().colors.filter(t => t.id !== btn.dataset.uieTokenColorDel);
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-token-font-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      uieDesignerRecordUndo();
      uieEnsureTokens().fonts = uieEnsureTokens().fonts.filter(t => t.id !== btn.dataset.uieTokenFontDel);
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-template]").forEach(item => {
    item.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/uie-template", item.dataset.uieTemplate);
    });
    item.addEventListener("click", () => {
      UIE_PLACE_ARMED = `template:${item.dataset.uieTemplate}`;
      renderAutomationStudioView();
    });
  });

  document.getElementById("uie-responsive-apply")?.addEventListener("click", () => {
    const baseDev = uieGetDeviceSize();
    const dev = uieGetResponsivePreviewSize(baseDev);
    const ui = uieEnsureUi();
    ui.device = { preset: "custom", w: dev.width, h: dev.height };
    ui.preview.responsivePreview = { width: null, height: null };
    UIE_RESPONSIVE_SCRUB = null;
    if (typeof showToast === "function") showToast(`Device preset set to ${dev.width}×${dev.height}`);
    renderAutomationStudioView();
  });

  const frame = document.getElementById("uie-preview-device-frame");
  if (frame) {
    let rdrag = null;
    frame.querySelectorAll("[data-uie-rhandle]").forEach(handle => {
      handle.addEventListener("pointerdown", e => {
        const baseDev = uieGetDeviceSize();
        const cur = uieGetResponsivePreviewSize(baseDev);
        rdrag = { axis: handle.dataset.uieRhandle, sx: e.clientX, sy: e.clientY, w: cur.width, h: cur.height };
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });
    });
    frame.addEventListener("pointermove", e => {
      if (!rdrag) return;
      const dx = e.clientX - rdrag.sx;
      const dy = e.clientY - rdrag.sy;
      let w = rdrag.w, h = rdrag.h;
      if (rdrag.axis === "e") w = Math.max(100, rdrag.w + dx);
      if (rdrag.axis === "w") w = Math.max(100, rdrag.w - dx);
      if (rdrag.axis === "s") h = Math.max(100, rdrag.h + dy);
      if (rdrag.axis === "n") h = Math.max(100, rdrag.h - dy);
      UIE_RESPONSIVE_SCRUB = { width: Math.round(w), height: Math.round(h) };
      uieEnsurePreviewMeta().responsivePreview.width = UIE_RESPONSIVE_SCRUB.width;
      uieEnsurePreviewMeta().responsivePreview.height = UIE_RESPONSIVE_SCRUB.height;
      uiePreviewRerenderCanvas();
    });
    frame.addEventListener("pointerup", () => { rdrag = null; });
  }
}

function uieWireDesigner() {
  const canvas = document.getElementById("uie-canvas");
  const wrap = document.getElementById("uie-canvas-wrap");
  if (!canvas || !wrap) return;
  uieApplyViewportCss();

  document.getElementById("uie-zoom-fit")?.addEventListener("click", () => { uieFitZoom(); });
  document.getElementById("uie-recenter-btn")?.addEventListener("click", () => { uieRecenterView(); });

  wrap.addEventListener("mouseenter", () => { UIE_CANVAS_HOVER = true; });
  wrap.addEventListener("mouseleave", () => { UIE_CANVAS_HOVER = false; });

  const setBindingSearch = q => {
    UIE_BINDING_SEARCH = q;
    const box = document.getElementById("uie-binding-search-results");
    if (box) {
      box.style.display = q ? "" : "none";
      box.innerHTML = uieBindingSearchHtml(q);
      uieWireBindingSearch(box);
    }
  };
  document.getElementById("uie-binding-search")?.addEventListener("input", e => setBindingSearch(e.target.value));
  document.getElementById("uie-drawer-search")?.addEventListener("input", e => setBindingSearch(e.target.value));
  uieWireBindingSearch(document.getElementById("uie-binding-search-results"));

  document.querySelectorAll("[data-uie-palette-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      UIE_PALETTE_TAB = btn.dataset.uiePaletteTab;
      renderAutomationStudioView();
    });
  });

  uieLoadWorkflowList();
  document.getElementById("uie-data-field-add")?.addEventListener("click", () => {
    wfPushUndo();
    const schema = uieEnsureDataSchema();
    schema.push({ name: `field_${schema.length + 1}`, type: "text" });
    renderAutomationStudioView();
  });
  uieWireDataSchema();

  let paletteDragged = false;
  document.querySelectorAll("[data-uie-palette]").forEach(item => {
    item.addEventListener("dragstart", e => {
      paletteDragged = true;
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/uie-type", item.dataset.uiePalette);
      e.dataTransfer.setData("text/plain", item.dataset.uiePalette);
      const ghost = document.createElement("div");
      ghost.className = "uie-ghost";
      ghost.textContent = item.textContent.trim();
      ghost.style.width = "80px";
      ghost.style.height = "28px";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 40, 14);
      setTimeout(() => ghost.remove(), 0);
    });
    item.addEventListener("dragend", () => {
      document.querySelectorAll(".uie-drop-highlight").forEach(el => el.classList.remove("uie-drop-highlight"));
      setTimeout(() => { paletteDragged = false; }, 0);
    });
    item.addEventListener("click", () => {
      if (paletteDragged) return;
      uieArmPlacement(item.dataset.uiePalette);
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-asset]").forEach(item => {
    item.addEventListener("click", () => {
      const w = UIE_SELECTED ? uieFindWidget(UIE_SELECTED) : null;
      if (!w) return;
      wfPushUndo();
      w.props = w.props || {};
      w.props.bgAsset = item.dataset.uieAsset;
      w.props.bg = "";
      uieEnsureBgTexture(w.props);
      renderAutomationStudioView();
    });
  });

  uieWireAssetManager();

  document.getElementById("uie-folder-add")?.addEventListener("click", () => {
    wfPushUndo();
    const ui = uieEnsureUi();
    const id = uieNextFolderId();
    ui.folders.push({ id, name: "New Folder", parent: null });
    UIE_FOLDER_RENAME = id;
    renderAutomationStudioView();
  });

  document.querySelectorAll("[data-uie-state-preview]").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.uieStatePreview;
      UIE_STATE_PREVIEW = v || null;
      renderAutomationStudioView();
    });
  });

  const clearDropHighlights = () => {
    document.querySelectorAll(".uie-drop-highlight").forEach(el => el.classList.remove("uie-drop-highlight"));
  };

  const acceptPaletteDragOver = (e) => {
    const types = e.dataTransfer?.types || [];
    const ok = [...types].some(t => t === "text/uie-type" || t === "text/uie-template" || t === "text/uie-asset-url" || t === "text/plain");
    if (!ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    clearDropHighlights();
    const hostEl = e.target.closest?.("[data-uie-widget][data-uie-host]");
    if (hostEl) hostEl.classList.add("uie-drop-highlight");
  };

  const placeFromPaletteDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDropHighlights();
    const assetUrl = e.dataTransfer.getData("text/uie-asset-url");
    if (assetUrl) {
      const pt = uieCanvasPointFromEvent(e);
      const target = e.target.closest("[data-uie-widget]");
      if (target) {
        const w = uieFindWidget(target.dataset.uieWidget);
        if (w) {
          uieApplyUploadedAssetToWidget(w, assetUrl, w.type === "image" ? "image" : "bg");
          renderAutomationStudioView();
          return;
        }
      }
      if (UIE_SELECTED) {
        const w = uieFindWidget(UIE_SELECTED);
        if (w) {
          uieApplyUploadedAssetToWidget(w, assetUrl, w.type === "image" ? "image" : "bg");
          renderAutomationStudioView();
          return;
        }
      }
      uieApplyUploadedAssetAtPoint(assetUrl, pt.x, pt.y);
      renderAutomationStudioView();
      return;
    }
    const tplId = e.dataTransfer.getData("text/uie-template");
    if (tplId) {
      const pt = uieCanvasPointFromEvent(e);
      uiePlaceTemplate(tplId, pt.x, pt.y);
      renderAutomationStudioView();
      return;
    }
    const type = e.dataTransfer.getData("text/uie-type") || e.dataTransfer.getData("text/plain");
    if (!type || !/^[a-z0-9_]+$/i.test(type.replace(/^template:/, ""))) return;
    const pt = uieCanvasPointFromEvent(e);
    const hostEl = e.target.closest("[data-uie-widget][data-uie-host]");
    const host = hostEl ? uieFindWidget(hostEl.dataset.uieWidget) : null;
    if (type.startsWith("template:")) {
      uiePlaceTemplate(type.slice(9), pt.x, pt.y);
    } else {
      // Drop on a Frame/Canvas → create as child so it appears nested on screen.
      uieAddWidget(type, pt.x, pt.y, host && uieCanHostChildren(host) ? host.id : null);
    }
    renderAutomationStudioView();
  };

  // dragover must hit canvas AND widgets (HTML5 drop does not bubble).
  [wrap, canvas].forEach(el => {
    el.addEventListener("dragover", acceptPaletteDragOver);
    el.addEventListener("dragleave", e => {
      if (!e.currentTarget.contains(e.relatedTarget)) clearDropHighlights();
    });
    el.addEventListener("drop", placeFromPaletteDrop);
  });
  canvas.addEventListener("dragover", e => {
    const hostEl = e.target.closest?.("[data-uie-widget][data-uie-host]");
    if (hostEl) {
      e.preventDefault();
      clearDropHighlights();
      hostEl.classList.add("uie-drop-highlight");
    }
  }, true);

  wrap.addEventListener("mousemove", e => uieMovePlaceGhost(e));
  wrap.addEventListener("click", e => {
    if (!UIE_PLACE_ARMED) return;
    if (e.target.closest("[data-uie-widget]") || e.target.closest(".uie-selection-layer")) return;
    const pt = uieCanvasPointFromEvent(e);
    if (String(UIE_PLACE_ARMED).startsWith("template:")) {
      uiePlaceTemplate(UIE_PLACE_ARMED.slice(9), pt.x, pt.y);
      UIE_PLACE_ARMED = null;
      renderAutomationStudioView();
      return;
    }
    uiePlaceAtCanvasPoint(pt);
  });

  // Double-click empty canvas → place widget (armed type or Button).
  canvas.addEventListener("dblclick", e => {
    if (e.target.closest("[data-uie-widget], .uie-selection-layer, .uie-resize-handle, input, textarea, button")) return;
    const pt = uieCanvasPointFromEvent(e);
    const type = UIE_PLACE_ARMED && !String(UIE_PLACE_ARMED).startsWith("template:")
      ? UIE_PLACE_ARMED
      : "button";
    uieCancelPlacement();
    const hostEl = e.target.closest("[data-uie-widget][data-uie-host]");
    const host = hostEl ? uieFindWidget(hostEl.dataset.uieWidget) : null;
    uieAddWidget(type, pt.x, pt.y, host && uieCanHostChildren(host) ? host.id : null);
    renderAutomationStudioView();
  });

  document.querySelectorAll("[data-uie-hier]").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-uie-folder-del]") || e.target.closest(".uie-hierarchy-rename")) return;
      const id = el.dataset.uieHier;
      if (e.shiftKey) uieSetSelection([id], { toggle: true });
      else uieSetSelection([id], { scrollIntoView: true });
      renderAutomationStudioView();
    });
    el.addEventListener("dblclick", e => {
      e.stopPropagation();
      UIE_FOLDER_RENAME = el.dataset.uieHier;
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-folder]").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-uie-folder-del]") || e.target.closest(".uie-hierarchy-rename")) return;
      uieSetSelection([el.dataset.uieFolder]);
      renderAutomationStudioView();
    });
    el.addEventListener("dblclick", e => {
      e.stopPropagation();
      UIE_FOLDER_RENAME = el.dataset.uieFolder;
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-folder-del]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      wfPushUndo();
      const fid = btn.dataset.uieFolderDel;
      const ui = uieEnsureUi();
      ui.folders = ui.folders.filter(f => f.id !== fid && f.parent !== fid);
      ui.widgets.forEach(w => { if (w.folderId === fid) w.folderId = null; });
      if (uieIsSelected(fid)) uieSetSelection(uieGetSelection().filter(x => x !== fid));
      renderAutomationStudioView();
    });
  });
  uieWireHierarchyDnD();

  document.querySelectorAll("[data-uie-chip]").forEach(chip => {
    chip.addEventListener("click", e => {
      e.stopPropagation();
      const w = uieFindWidget(chip.dataset.uieChip);
      const ev = chip.dataset.uieEv;
      const b = w?.events?.[ev];
      if (b?.nodeId) uieFrameEventNode(b.nodeId);
    });
  });

  uieWireInspector();
  uieWireEffects();
  uieWireAnimations();
  uieWireCodeInspector();
  uieWireCanvasToolbar();
  uieWireCanvasInteraction(canvas, wrap);
  uieWireDesignerKeys();
  uieWireRulers();
  uieWireZoneI();
}

function uieWireBindingSearch(container) {
  if (!container) return;
  container.querySelectorAll("[data-uie-search-widget]").forEach(el => {
    el.addEventListener("click", () => {
      uieSetSelection([el.dataset.uieSearchWidget], { scrollIntoView: true });
      UIE_BINDING_SEARCH = "";
      renderAutomationStudioView();
    });
  });
  container.querySelectorAll("[data-uie-search-binding]").forEach(el => {
    el.addEventListener("click", () => {
      uieSetSelection([el.dataset.uieSearchBinding], { scrollIntoView: true });
      UIE_BINDING_SEARCH = "";
      renderAutomationStudioView();
      setTimeout(() => uieFrameEventNode(el.dataset.uieSearchNode), 50);
    });
  });
}

function uieWireHierarchyDnD() {
  document.querySelectorAll("[data-uie-hier-root]").forEach(el => {
    el.addEventListener("dragover", e => {
      e.preventDefault();
      el.classList.add("uie-drop-hover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("uie-drop-hover"));
    el.addEventListener("drop", e => {
      el.classList.remove("uie-drop-hover");
      e.preventDefault();
      const id = e.dataTransfer.getData("text/uie-hier-id");
      const kind = e.dataTransfer.getData("text/uie-hier-kind");
      if (kind !== "widget" || !id) return;
      const dragged = uieFindWidget(id);
      if (!dragged) return;
      uieDesignerRecordUndo();
      uieReparentWidget(dragged, null);
      dragged.folderId = null;
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-hier], [data-uie-folder]").forEach(el => {
    el.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/uie-hier-id", el.dataset.uieHier || el.dataset.uieFolder);
      e.dataTransfer.setData("text/uie-hier-kind", el.dataset.uieFolder ? "folder" : "widget");
      if (el.dataset.uieHier) e.dataTransfer.setData("text/uie-hier-z", el.dataset.uieZ || "0");
    });
    el.addEventListener("dragover", e => {
      if (el.dataset.uieFolder || el.dataset.uieHier) {
        e.preventDefault();
        el.classList.add("uie-drop-hover");
      }
    });
    el.addEventListener("dragleave", () => { el.classList.remove("uie-drop-hover"); el.style.outline = ""; });
    el.addEventListener("drop", e => {
      el.classList.remove("uie-drop-hover");
      el.style.outline = "";
      e.preventDefault();
      const id = e.dataTransfer.getData("text/uie-hier-id");
      const kind = e.dataTransfer.getData("text/uie-hier-kind");
      if (!id) return;
      if (el.dataset.uieFolder && kind === "widget") {
        uieDesignerRecordUndo();
        const w = uieFindWidget(id);
        if (w) {
          uieReparentWidget(w, null);
          w.folderId = el.dataset.uieFolder;
        }
        renderAutomationStudioView();
        return;
      }
      if (kind === "widget" && el.dataset.uieHier && id !== el.dataset.uieHier) {
        uieDesignerRecordUndo();
        const dragged = uieFindWidget(id);
        const target = uieFindWidget(el.dataset.uieHier);
        if (dragged && target) {
          // Drop on a container → make child. Shift → z-reorder only.
          if (!e.shiftKey && uieCanHostChildren(target) && !uieWouldCreateParentCycle(dragged.id, target.id)) {
            uieReparentWidget(dragged, target);
          } else {
            const tz = uieWidgetZ(target);
            uieEnsureUi().widgets.forEach(w => { if (uieWidgetZ(w) >= tz && w.id !== dragged.id) w.z = uieWidgetZ(w) + 1; });
            dragged.z = tz;
            uieEnsureUi().widgets.sort((a, b) => uieWidgetZ(a) - uieWidgetZ(b));
            uieEnsureUi().widgets.forEach((w, i) => { w.z = i; });
          }
        }
        renderAutomationStudioView();
      }
    });
  });
  document.querySelectorAll("[data-uie-widget-rename]").forEach(inp => {
    inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", () => {
      const w = uieFindWidget(inp.dataset.uieWidgetRename);
      if (!w) return;
      wfPushUndo();
      w.props = w.props || {};
      w.props.name = inp.value.trim();
      UIE_FOLDER_RENAME = null;
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-folder-rename]").forEach(inp => {
    inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", () => {
      const ui = uieEnsureUi();
      const f = ui.folders.find(x => x.id === inp.dataset.uieFolderRename);
      if (!f) return;
      wfPushUndo();
      f.name = inp.value.trim() || f.id;
      UIE_FOLDER_RENAME = null;
      renderAutomationStudioView();
    });
  });
}

function uieWireDesignerKeys() {
  if (window._uieDesignerKeysWired) return;
  window._uieDesignerKeysWired = true;
  document.addEventListener("keydown", e => {
    const root = document.getElementById("uie-designer-root");
    if (!root) return;
    const designerFocused = root.contains(document.activeElement) || STUDIO_TAB === "designer";
    if (!designerFocused && !uieInDesigner()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "z" && !e.shiftKey) {
      if (e.target.closest("#uie-designer-root, #studio-designer-panel")) {
        e.preventDefault();
        if (uieDesignerUndo()) uieRefreshDesigner();
        return;
      }
    }
    if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      if (e.target.closest("#uie-designer-root, #studio-designer-panel")) {
        e.preventDefault();
        if (uieDesignerRedo()) uieRefreshDesigner();
        return;
      }
    }
    if (mod && e.key.toLowerCase() === "c") {
      if (e.target.closest("input, textarea, select")) return;
      const ids = uieGetSelection();
      if (!ids.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      UIE_CLIPBOARD = uieCopyWidgets(ids);
      return;
    }
    if (mod && e.key.toLowerCase() === "v") {
      if (e.target.closest("input, textarea, select")) return;
      if (!UIE_CLIPBOARD) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const newIds = uiePasteWidgets(UIE_CLIPBOARD, 16, 16);
      uieSetSelection(newIds);
      renderAutomationStudioView();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      if (e.target.closest("input, textarea, select")) return;
      const ids = uieGetSelection();
      if (!ids.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      UIE_CLIPBOARD = uieCopyWidgets(ids);
      const newIds = uiePasteWidgets(UIE_CLIPBOARD, 16, 16);
      uieSetSelection(newIds);
      renderAutomationStudioView();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (e.target.closest("input, textarea, select")) return;
      const ids = [...uieGetSelection()];
      if (!ids.length) return;
      e.preventDefault();
      ids.forEach(id => uieDeleteWidget(id));
      renderAutomationStudioView();
      return;
    }
    if (e.key === "i" || e.key === "I") {
      if (e.target.closest("input, textarea, select")) return;
      if (uieGetSelection().length) { UIE_ISOLATE_MODE = true; uieRefreshDesigner(); }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (UIE_ISOLATE_MODE) { UIE_ISOLATE_MODE = false; uieRefreshDesigner(); return; }
      if (UIE_PLACE_ARMED) uieCancelPlacement();
      else uieDeselect();
      uieRefreshDesigner();
      return;
    }
    if (UIE_FOLDER_RENAME) return;
    const ids = uieGetSelection();
    if (!ids.length) return;
    const w = uieFindWidget(ids[0]);
    if (!w) return;
    const k = e.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
    if (e.target.closest("input, textarea, select")) return;
    e.preventDefault();
    uieDesignerRecordUndo();
    const step = e.shiftKey ? uieGridSize() * 2 : uieGridSize();
    ids.forEach(id => {
      const wd = uieFindWidget(id);
      if (!wd) return;
      if (k === "ArrowLeft") wd.x -= step;
      if (k === "ArrowRight") wd.x += step;
      if (k === "ArrowUp") wd.y -= step;
      if (k === "ArrowDown") wd.y += step;
      wd.x = uieSnapAxis(wd.x, "v");
      wd.y = uieSnapAxis(wd.y, "h");
    });
    renderAutomationStudioView();
  }, true);
}

function uiePickImageFile(onFile) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "image/*";
  inp.addEventListener("change", () => {
    const file = inp.files && inp.files[0];
    if (file) onFile(file);
  });
  inp.click();
}

function uieWireAssetManager() {
  uieSyncUploadedAssetsFromServer().then(() => {
    const grid = document.getElementById("uie-uploaded-grid");
    if (grid) grid.outerHTML = uieUploadedAssetsGridHtml();
    uieWireAssetManagerItems();
  }).catch(() => uieWireAssetManagerItems());

  document.getElementById("uie-asset-upload-btn")?.addEventListener("click", () => {
    document.getElementById("uie-asset-upload-input")?.click();
  });
  document.getElementById("uie-asset-upload-input")?.addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      uieDesignerRecordUndo();
      await uieUploadAttachment(file, "ui_asset");
      renderAutomationStudioView();
    } catch (err) {
      window.alert(err.message || "Upload failed");
    }
  });
  uieWireAssetManagerItems();
}

function uieWireAssetManagerItems() {
  document.querySelectorAll("[data-uie-uploaded-asset]").forEach(item => {
    item.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/uie-asset-url", item.dataset.uieUploadedUrl || "");
      const img = item.querySelector("img");
      if (img) e.dataTransfer.setDragImage(img, 24, 24);
    });
    item.addEventListener("click", e => {
      if (e.target.closest("[data-uie-asset-del], .uie-uploaded-name")) return;
      const url = item.dataset.uieUploadedUrl;
      const w = UIE_SELECTED ? uieFindWidget(UIE_SELECTED) : null;
      if (!w || !url) return;
      uieApplyUploadedAssetToWidget(w, url, w.type === "image" ? "image" : "bg");
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-asset-rename]").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = Number(inp.dataset.uieAssetRename);
      const asset = uieEnsureAssets().find(a => a.id === id);
      if (asset) {
        uieDesignerRecordUndo();
        asset.name = inp.value.trim() || asset.name;
      }
    });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
  });
  document.querySelectorAll("[data-uie-asset-del]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = Number(btn.dataset.uieAssetDel);
      if (!window.confirm("Delete this uploaded image?")) return;
      try {
        uieDesignerRecordUndo();
        await uieDeleteAttachment(id);
        uieEnsureUi().widgets.forEach(w => {
          const p = w.props || {};
          if (p.imageSrc && p.imageSrc.includes(`/api/attachments/${id}/`)) p.imageSrc = "";
          const url = uieBgAssetUploadUrl(p.bgAsset);
          if (url && url.includes(`/api/attachments/${id}/`)) p.bgAsset = "";
        });
        (uieEnsureUi().screens || []).forEach(s => {
          if (s.background && s.background.assetUrl && s.background.assetUrl.includes(`/api/attachments/${id}/`)) {
            s.background.assetUrl = "";
          }
        });
        renderAutomationStudioView();
      } catch (err) {
        window.alert(err.message || "Delete failed");
      }
    });
  });
}

function uieWireScreenInspector() {
  const scr = uieActiveScreen();
  if (!scr) return;
  const ensureBg = () => {
    scr.background = scr.background || {};
    return scr.background;
  };
  document.querySelectorAll("[data-uie-screen-bg]").forEach(inp => {
    const field = inp.dataset.uieScreenBg;
    const handler = () => {
      uieDesignerRecordUndo();
      const bg = ensureBg();
      if (field === "builtin") {
        bg.builtin = inp.value || "";
        if (bg.builtin) bg.assetUrl = "";
      } else if (field === "assetUrl") {
        bg.assetUrl = inp.value.trim();
        if (bg.assetUrl) bg.builtin = "";
      } else if (field === "fit") bg.fit = inp.value;
      else if (field === "tint") bg.tint = inp.value;
      renderAutomationStudioView();
    };
    inp.addEventListener("change", handler);
    if (inp.type === "text") inp.addEventListener("input", handler);
  });
  document.querySelector("[data-uie-screen-bg-upload]")?.addEventListener("click", () => {
    uiePickImageFile(async file => {
      try {
        uieDesignerRecordUndo();
        const uploaded = await uieUploadAttachment(file, "ui_asset");
        const bg = ensureBg();
        bg.assetUrl = uieAssetUrlFromId(uploaded.id);
        bg.builtin = "";
        renderAutomationStudioView();
      } catch (err) {
        window.alert(err.message || "Upload failed");
      }
    });
  });
  document.querySelector("[data-uie-screen-bg-clear]")?.addEventListener("click", () => {
    uieDesignerRecordUndo();
    scr.background = {};
    renderAutomationStudioView();
  });
}

function uieWireImageUploadControls(w) {
  document.querySelectorAll("[data-uie-upload-prop]").forEach(btn => {
    btn.addEventListener("click", () => {
      const prop = btn.dataset.uieUploadProp;
      uiePickImageFile(async file => {
        try {
          uieDesignerRecordUndo();
          const uploaded = await uieUploadAttachment(file, "ui_asset");
          w.props = w.props || {};
          w.props[prop] = uieAssetUrlFromId(uploaded.id);
          renderAutomationStudioView();
        } catch (err) {
          window.alert(err.message || "Upload failed");
        }
      });
    });
  });
  document.querySelectorAll("[data-uie-clear-prop]").forEach(btn => {
    btn.addEventListener("click", () => {
      uieDesignerRecordUndo();
      w.props = w.props || {};
      w.props[btn.dataset.uieClearProp] = "";
      renderAutomationStudioView();
    });
  });
  document.querySelector("[data-uie-upload-bg]")?.addEventListener("click", () => {
    uiePickImageFile(async file => {
      try {
        uieDesignerRecordUndo();
        const uploaded = await uieUploadAttachment(file, "ui_asset");
        w.props = w.props || {};
        w.props.bg = "";
        w.props.bgAsset = { assetUrl: uieAssetUrlFromId(uploaded.id) };
        uieEnsureBgTexture(w.props);
        renderAutomationStudioView();
      } catch (err) {
        window.alert(err.message || "Upload failed");
      }
    });
  });
  document.querySelector("[data-uie-clear-bg-asset]")?.addEventListener("click", () => {
    uieDesignerRecordUndo();
    w.props.bgAsset = "";
    renderAutomationStudioView();
  });
  document.querySelectorAll("[data-uie-bg-texture]").forEach(inp => {
    const handler = () => {
      uieDesignerRecordUndo();
      const tex = uieEnsureBgTexture(w.props);
      const field = inp.dataset.uieBgTexture;
      if (field === "position") tex.position = inp.dataset.uieBgPos;
      else if (field === "fit") tex.fit = inp.value;
      else if (field === "opacity") tex.opacity = Number(inp.value);
      else if (field === "tintStrength") tex.tintStrength = Number(inp.value);
      else if (field === "tint") tex.tint = inp.value;
      else if (field === "blur") tex.blur = Number(inp.value) || 0;
      renderAutomationStudioView();
    };
    if (inp.tagName === "BUTTON") inp.addEventListener("click", handler);
    else {
      inp.addEventListener("change", handler);
      inp.addEventListener("input", handler);
    }
  });
  document.querySelectorAll("[data-uie-image-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      uieDesignerRecordUndo();
      uieEnsureImageFilterEffect(w, btn.dataset.uieImageFilter);
      renderAutomationStudioView();
    });
  });
}

function uieWireInspector() {
  if (!UIE_SELECTED) {
    uieWireScreenInspector();
    return;
  }
  const w = UIE_SELECTED ? uieFindWidget(UIE_SELECTED) : null;
  if (!w) return;

  uieWireImageUploadControls(w);

  document.querySelectorAll("[data-uie-style-class-id]").forEach(sel => {
    sel.addEventListener("change", () => {
      uieDesignerRecordUndo();
      uieApplyStyleClassToWidget(w, sel.value || null);
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-layout]").forEach(inp => {
    const handler = () => {
      uieDesignerRecordUndo();
      const layout = uieEnsureWidgetLayout(w);
      const field = inp.dataset.uieLayout;
      if (field === "mode") layout.mode = inp.value;
      else if (field === "spacing") layout.spacing = Number(inp.value) || 0;
      else if (field === "padding") layout.padding = Number(inp.value) || 0;
      else if (field === "align") layout.align = inp.value;
      renderAutomationStudioView();
    };
    inp.addEventListener("change", handler);
    if (inp.type === "number") inp.addEventListener("input", handler);
  });

  document.querySelectorAll("[data-uie-reset-override]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [section, key] = btn.dataset.uieResetOverride.split(":");
      uieDesignerRecordUndo();
      uieResetStyleOverride(w, section, key);
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-token-pick]").forEach(sel => {
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      const prop = sel.dataset.uieTokenPick;
      uieDesignerRecordUndo();
      uieSetWidgetAppearanceProp(w, prop, null, sel.value);
      uieRefreshTokenReferences();
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-prop]").forEach(inp => {
    const prop = inp.dataset.uieProp;
    const section = inp.dataset.uieStyleSection || (["fontSize", "fontFamily"].includes(prop) ? "typography" : "appearance");
    const handler = () => {
      uieDesignerRecordUndo();
      if (prop === "x") { if (!uieIsStackChild(w)) w.x = uieSnapAxis(Number(inp.value) || 0, "v"); }
      else if (prop === "y") { if (!uieIsStackChild(w)) w.y = uieSnapAxis(Number(inp.value) || 0, "h"); }
      else if (prop === "width") w.width = Math.max(uieGridSize(), uieSnap(Number(inp.value) || uieGridSize()));
      else if (prop === "height") w.height = Math.max(uieGridSize(), uieSnap(Number(inp.value) || uieGridSize()));
      else if (prop === "values") w.props.values = inp.value.split(",").map(s => s.trim()).filter(Boolean);
      else if (prop === "bgAsset") {
        if (inp.value === "__uploaded__") {
          if (!uieBgAssetUploadUrl(w.props.bgAsset)) {
            w.props.bgAsset = { assetUrl: "" };
            uieEnsureBgTexture(w.props);
          }
        } else if (inp.value) {
          w.props.bgAsset = inp.value;
          w.props.bg = "";
          uieEnsureBgTexture(w.props);
        } else {
          w.props.bgAsset = "";
        }
      }
      else if (prop === "bgAssetUrl") { /* readonly */ }
      else if (inp.type === "checkbox") {
        if (w.styleClassId && ["visible", "enabled"].includes(prop)) uieSetStyleOverride(w, "appearance", prop, inp.checked);
        else w.props[prop] = inp.checked;
      } else if (["bg", "fg", "fontSize", "fontFamily"].includes(prop)) {
        const val = inp.type === "number" ? Number(inp.value) : inp.value;
        if (w.styleClassId) uieSetStyleOverride(w, section, prop, val);
        else w.props[prop] = val;
      } else if (inp.type === "number") w.props[prop] = Number(inp.value);
      else w.props[prop] = inp.value;
      uieUpdateCodeInspector();
      renderAutomationStudioView();
    };
    inp.addEventListener("change", handler);
    if (inp.type === "text" || inp.type === "number") inp.addEventListener("input", handler);
  });

  document.querySelectorAll("[data-uie-state]").forEach(inp => {
    const [sk, field] = inp.dataset.uieState.split(":");
    const handler = () => {
      wfPushUndo();
      w.props.states = w.props.states || {};
      w.props.states[sk] = w.props.states[sk] || {};
      const val = inp.type === "number" ? (inp.value === "" ? undefined : Number(inp.value)) : inp.value;
      if (val === undefined || val === "") delete w.props.states[sk][field];
      else w.props.states[sk][field] = val;
      renderAutomationStudioView();
    };
    inp.addEventListener("change", handler);
    inp.addEventListener("input", handler);
  });

  document.querySelectorAll("[data-uie-behavior]").forEach(inp => {
    inp.addEventListener("change", () => {
      wfPushUndo();
      w.props.behavior = w.props.behavior || {};
      w.props.behavior[inp.dataset.uieBehavior] = inp.checked;
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-anchor]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const dev = uieGetDeviceSize();
      const anchors = [
        [0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1],
      ];
      const [ax, ay] = anchors[Number(btn.dataset.uieAnchor)] || [0, 0];
      wfPushUndo();
      w.x = uieSnap(ax * (dev.width - w.width));
      w.y = uieSnap(ay * (dev.height - w.height));
      renderAutomationStudioView();
    });
  });

  document.querySelector("[data-uie-delete]")?.addEventListener("click", () => {
    uieDeleteWidget(w.id);
    renderAutomationStudioView();
  });

  document.querySelectorAll("[data-uie-ev-bind]").forEach(sel => {
    sel.addEventListener("change", () => {
      const ev = sel.dataset.uieEvBind;
      w.events = w.events || {};
      const mode = sel.value;
      const nodeRow = document.querySelector(`[data-uie-ev-node-row="${ev}"]`);
      const navRow = document.querySelector(`[data-uie-ev-nav-row="${ev}"]`);
      if (nodeRow) nodeRow.style.display = mode === "existing" ? "" : "none";
      if (navRow) navRow.style.display = mode === "navigate" ? "" : "none";
      if (mode === "graph") {
        const nid = uieCreateGraphEvent(w.id, ev);
        w.events[ev] = { binding: "graph", nodeId: nid };
        // Jump to Blueprint and frame the new event node so the box is visible.
        uieFrameEventNode(nid);
        return;
      }
      if (mode === "existing") {
        w.events[ev] = { binding: "existing", nodeId: "" };
        renderAutomationStudioView();
        return;
      }
      if (mode === "navigate") {
        const screens = uieEnsureUi().screens || [];
        w.events[ev] = { binding: "navigate", type: "navigate", event: ev, targetScreenId: screens[0]?.id || "" };
        renderAutomationStudioView();
        return;
      }
      w.events[ev] = { binding: "none" };
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-ev-nav]").forEach(sel => {
    sel.addEventListener("change", () => {
      const ev = sel.dataset.uieEvNav;
      w.events = w.events || {};
      w.events[ev] = { binding: "navigate", type: "navigate", event: ev, targetScreenId: sel.value };
      renderAutomationStudioView();
    });
  });

  document.querySelectorAll("[data-uie-ev-node]").forEach(sel => {
    sel.addEventListener("change", () => {
      const ev = sel.dataset.uieEvNode;
      w.events = w.events || {};
      w.events[ev] = { binding: "existing", nodeId: sel.value };
      renderAutomationStudioView();
    });
  });
}

function uieGetEffectTargets() {
  const stack = document.getElementById("uie-effect-stack");
  const ids = (stack?.dataset.uieEffectTarget || uieGetSelection().join(",")).split(",").filter(Boolean);
  return ids.map(id => uieFindWidget(id)).filter(Boolean);
}

function uieWireEffects() {
  const targets = uieGetEffectTargets();
  if (!targets.length) return;
  document.getElementById("uie-effect-add-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    const menu = document.getElementById("uie-effect-add-menu");
    if (menu) menu.hidden = !menu.hidden;
  });
  document.querySelectorAll("[data-uie-effect-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.uieEffectAdd;
      const et = UIE_EFFECT_TYPES.find(t => t.type === type);
      if (!et) return;
      uieDesignerRecordUndo();
      targets.forEach(w => {
        const fx = { id: uieNextEffectId(), type, enabled: true, params: { ...et.defaults }, order: uieEnsureEffects(w).length };
        uieEnsureEffects(w).push(fx);
      });
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-effect-enable]").forEach(inp => {
    inp.addEventListener("change", () => {
      uieDesignerRecordUndo();
      const fxId = inp.dataset.uieEffectEnable;
      targets.forEach(w => {
        const fx = uieEnsureEffects(w).find(f => f.id === fxId);
        if (fx) fx.enabled = inp.checked;
      });
      uieRefreshDesigner();
    });
  });
  document.querySelectorAll("[data-uie-effect-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      uieDesignerRecordUndo();
      const fxId = btn.dataset.uieEffectDel;
      targets.forEach(w => { w.effects = uieEnsureEffects(w).filter(f => f.id !== fxId); });
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-effect-dup]").forEach(btn => {
    btn.addEventListener("click", () => {
      uieDesignerRecordUndo();
      const fxId = btn.dataset.uieEffectDup;
      targets.forEach(w => {
        const fx = uieEnsureEffects(w).find(f => f.id === fxId);
        if (!fx) return;
        const copy = JSON.parse(JSON.stringify(fx));
        copy.id = uieNextEffectId();
        copy.order = uieEnsureEffects(w).length;
        uieEnsureEffects(w).push(copy);
      });
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-effect-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = document.querySelector(`[data-uie-effect-body="${btn.dataset.uieEffectToggle}"]`);
      if (body) body.hidden = !body.hidden;
    });
  });
  document.querySelectorAll("[data-uie-effect-param]").forEach(inp => {
    const handler = () => {
      const [fxId, field] = inp.dataset.uieEffectParam.split(":");
      uieDesignerRecordUndo();
      targets.forEach(w => {
        const fx = uieEnsureEffects(w).find(f => f.id === fxId);
        if (!fx) return;
        fx.params = fx.params || {};
        if (inp.type === "checkbox") fx.params[field] = inp.checked;
        else if (inp.type === "number") fx.params[field] = Number(inp.value);
        else if (field.startsWith("stopColor")) {
          const i = Number(field.replace("stopColor", ""));
          fx.params.stops = fx.params.stops || [];
          fx.params.stops[i] = fx.params.stops[i] || {};
          fx.params.stops[i].color = inp.value;
        } else if (field.startsWith("stopPos")) {
          const i = Number(field.replace("stopPos", ""));
          fx.params.stops = fx.params.stops || [];
          fx.params.stops[i] = fx.params.stops[i] || {};
          fx.params.stops[i].pos = Number(inp.value);
        } else fx.params[field] = inp.value;
        if (fx.type === "cornerRadius" && fx.params.linked && ["tl", "tr", "br", "bl"].includes(field)) {
          const v = fx.params[field];
          fx.params.tl = fx.params.tr = fx.params.br = fx.params.bl = v;
        }
      });
      uieRefreshDesigner();
      uieUpdateCodeInspector();
    };
    inp.addEventListener("change", handler);
    inp.addEventListener("input", handler);
  });
  const stack = document.getElementById("uie-effect-stack");
  if (stack) {
    let dragFx = null;
    stack.querySelectorAll("[data-uie-effect-row]").forEach(row => {
      row.addEventListener("dragstart", e => { dragFx = row.dataset.uieEffectRow; e.dataTransfer.effectAllowed = "move"; });
      row.addEventListener("dragover", e => { e.preventDefault(); });
      row.addEventListener("drop", e => {
        e.preventDefault();
        const targetId = row.dataset.uieEffectRow;
        if (!dragFx || dragFx === targetId) return;
        uieDesignerRecordUndo();
        targets.forEach(w => {
          const fxs = uieEnsureEffects(w);
          const fromIdx = fxs.findIndex(f => f.id === dragFx);
          const toIdx = fxs.findIndex(f => f.id === targetId);
          if (fromIdx < 0 || toIdx < 0) return;
          const [item] = fxs.splice(fromIdx, 1);
          fxs.splice(toIdx, 0, item);
          fxs.forEach((f, i) => { f.order = i; });
        });
        renderAutomationStudioView();
      });
    });
  }
}

function uieUpdateCodeInspector() {
  const w = uieGetSelection().length === 1 ? uieFindWidget(uieGetSelection()[0]) : null;
  const py = document.getElementById("uie-inspector-code-python");
  const json = document.getElementById("uie-inspector-code-json");
  if (py) py.textContent = uieCodegenWidgetFragment(w);
  if (json) json.textContent = uieCodegenWidgetJson(w);
}

function uieWireCodeInspector() {
  document.querySelectorAll("[data-uie-code-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      UIE_INSPECTOR_CODE_TAB = btn.dataset.uieCodeTab;
      document.querySelectorAll("[data-uie-code-tab]").forEach(b => b.classList.toggle("uie-tab-active", b.dataset.uieCodeTab === UIE_INSPECTOR_CODE_TAB));
      const py = document.getElementById("uie-inspector-code-python");
      const json = document.getElementById("uie-inspector-code-json");
      if (py) py.hidden = UIE_INSPECTOR_CODE_TAB !== "python";
      if (json) json.hidden = UIE_INSPECTOR_CODE_TAB !== "json";
    });
  });
  document.querySelectorAll("[data-uie-code-copy]").forEach(btn => {
    btn.addEventListener("click", () => {
      const w = uieGetSelection().length === 1 ? uieFindWidget(uieGetSelection()[0]) : null;
      const text = btn.dataset.uieCodeCopy === "json" ? uieCodegenWidgetJson(w) : uieCodegenWidgetFragment(w);
      navigator.clipboard?.writeText(text);
    });
  });
  document.getElementById("uie-open-full-code")?.addEventListener("click", async () => {
    const w = uieGetSelection().length === 1 ? uieFindWidget(uieGetSelection()[0]) : null;
    if (!w) return;
    const consoleEl = document.getElementById("uie-generated-console");
    if (consoleEl) {
      consoleEl.hidden = false;
      try {
        const result = await api("/api/workflows/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graph: typeof wfGraphPayload === "function" ? wfGraphPayload() : CURRENT_WF }) });
        const code = result.code || "";
        const lines = code.split("\n");
        const wid = w.id;
        consoleEl.innerHTML = lines.map(ln => {
          const esc = escapeHtml(ln);
          return ln.includes(wid) ? `<span class="uie-code-highlight">${esc}</span>` : esc;
        }).join("\n");
        const hl = consoleEl.querySelector(".uie-code-highlight");
        hl?.scrollIntoView({ block: "center" });
      } catch (err) {
        consoleEl.textContent = uieCodegenWidgetFragment(w);
      }
    }
    if (typeof wfSetConsoleTab === "function") {
      try {
        const code = await (typeof wfFetchGeneratedCode === "function" ? wfFetchGeneratedCode() : api("/api/workflows/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graph: CURRENT_WF }) }).then(r => r.code));
        if (typeof wfRenderCodeOutput === "function") wfRenderCodeOutput(code);
        wfSetConsoleTab("code");
        STUDIO_TAB = "graph";
        const out = document.getElementById("wf-code-output");
        if (out) {
          const idx = code.split("\n").findIndex(l => l.includes(w.id));
          if (idx >= 0) out.querySelectorAll("span, div").forEach(() => {});
          out.scrollTop = Math.max(0, idx * 14 - 60);
        }
      } catch (_) { /* noop */ }
    }
  });
}

function uieWireAnimations() {
  const w = uieGetSelection().length === 1 ? uieFindWidget(uieGetSelection()[0]) : null;
  if (!w) return;
  document.getElementById("uie-anim-add")?.addEventListener("click", () => {
    uieDesignerRecordUndo();
    uieEnsureAnimations(w).push({ id: uieNextAnimId(), enabled: true, trigger: "hover", property: "scale", from: 1, to: 1.05, duration: 160, easing: "easeOut", delay: 0, repeat: false });
    renderAutomationStudioView();
  });
  const wireAnimField = (sel, field, parse) => {
    document.querySelectorAll(sel).forEach(inp => {
      const handler = () => {
        const anim = uieEnsureAnimations(w).find(a => a.id === inp.dataset[Object.keys(inp.dataset)[0].replace(/-/g, "")]);
        const animId = inp.dataset.uieAnimEnable || inp.dataset.uieAnimTrigger || inp.dataset.uieAnimProp || inp.dataset.uieAnimFrom || inp.dataset.uieAnimTo || inp.dataset.uieAnimDur || inp.dataset.uieAnimEase || inp.dataset.uieAnimDelay || inp.dataset.uieAnimRepeat || inp.dataset.uieAnimPreview;
        const a = uieEnsureAnimations(w).find(x => x.id === (inp.dataset.uieAnimEnable || inp.dataset.uieAnimTrigger || inp.dataset.uieAnimProp || inp.dataset.uieAnimFrom || inp.dataset.uieAnimTo || inp.dataset.uieAnimDur || inp.dataset.uieAnimEase || inp.dataset.uieAnimDelay || inp.dataset.uieAnimRepeat || inp.dataset.uieAnimPreview));
        if (!a) return;
        uieDesignerRecordUndo();
        if (inp.type === "checkbox") a[field] = inp.checked;
        else a[field] = parse ? parse(inp.value) : inp.value;
        uieUpdateCodeInspector();
      };
      inp.addEventListener("change", handler);
      if (inp.type === "text") inp.addEventListener("input", handler);
    });
  };
  document.querySelectorAll("[data-uie-anim-enable]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimEnable); if (a) a.enabled = inp.checked; }));
  document.querySelectorAll("[data-uie-anim-trigger]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimTrigger); if (a) a.trigger = inp.value; }));
  document.querySelectorAll("[data-uie-anim-prop]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimProp); if (a) a.property = inp.value; }));
  document.querySelectorAll("[data-uie-anim-from]").forEach(inp => inp.addEventListener("input", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimFrom); if (a) a.from = inp.value; uieUpdateCodeInspector(); }));
  document.querySelectorAll("[data-uie-anim-to]").forEach(inp => inp.addEventListener("input", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimTo); if (a) a.to = inp.value; uieUpdateCodeInspector(); }));
  document.querySelectorAll("[data-uie-anim-dur]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimDur); if (a) a.duration = inp.value; }));
  document.querySelectorAll("[data-uie-anim-ease]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimEase); if (a) a.easing = inp.value; }));
  document.querySelectorAll("[data-uie-anim-delay]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimDelay); if (a) a.delay = Number(inp.value); }));
  document.querySelectorAll("[data-uie-anim-repeat]").forEach(inp => inp.addEventListener("change", () => { const a = uieEnsureAnimations(w).find(x => x.id === inp.dataset.uieAnimRepeat); if (a) a.repeat = inp.checked; }));
  document.querySelectorAll("[data-uie-anim-del]").forEach(btn => btn.addEventListener("click", () => { uieDesignerRecordUndo(); w.animations = uieEnsureAnimations(w).filter(a => a.id !== btn.dataset.uieAnimDel); renderAutomationStudioView(); }));
  document.querySelectorAll("[data-uie-anim-preview]").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = uieEnsureAnimations(w).find(x => x.id === btn.dataset.uieAnimPreview);
      if (!a) return;
      const el = document.querySelector(`[data-uie-widget="${w.id}"]`);
      if (!el) return;
      const css = uieAnimationCss(a);
      el.style.transition = `${css.cssProp} ${css.dur} ${css.ease} ${css.delay}`;
      if (css.cssProp === "transform") el.style.transform = css.toVal;
      else el.style[css.cssProp] = css.toVal;
      setTimeout(() => { el.style.transform = ""; el.style.transition = ""; }, Number(css.dur.replace("ms", "")) + 50);
    });
  });
}

function uieWireCanvasToolbar() {
  document.querySelectorAll("[data-uie-bind-chip]").forEach(chip => {
    chip.addEventListener("click", () => {
      const nodeId = chip.dataset.uieBindNode;
      STUDIO_TAB = "graph";
      if (nodeId && typeof uieFrameEventNode === "function") uieFrameEventNode(nodeId);
      else if (typeof renderAutomationStudioView === "function") renderAutomationStudioView();
    });
    chip.addEventListener("mouseenter", () => {
      const wid = chip.dataset.uieBindChip;
      document.querySelector(`[data-uie-widget="${wid}"]`)?.classList.add("uie-selected");
      chip.classList.add("uie-bind-hover");
    });
    chip.addEventListener("mouseleave", () => {
      chip.classList.remove("uie-bind-hover");
    });
  });
}

function uieWireRulers() {
  const canvasCfg = uieEnsureCanvas();
  const rulerH = document.getElementById("uie-ruler-h");
  const rulerV = document.getElementById("uie-ruler-v");
  const addGuide = (axis, position) => {
    uieDesignerRecordUndo();
    canvasCfg.guides.push({ id: uieNextGuideId(), axis, position: Math.round(position), locked: false });
    renderAutomationStudioView();
  };
  rulerH?.addEventListener("pointerdown", e => {
    const rect = rulerH.getBoundingClientRect();
    const zoom = uieViewportTransform().zoom;
    addGuide("v", (e.clientX - rect.left) / zoom);
  });
  rulerV?.addEventListener("pointerdown", e => {
    const rect = rulerV.getBoundingClientRect();
    const zoom = uieViewportTransform().zoom;
    addGuide("h", (e.clientY - rect.top) / zoom);
  });
  document.querySelectorAll("[data-uie-guide]").forEach(gEl => {
    let drag = null;
    gEl.addEventListener("pointerdown", e => {
      const g = canvasCfg.guides.find(x => x.id === gEl.dataset.uieGuide);
      if (!g || g.locked) return;
      drag = { id: g.id, axis: g.axis, start: g.axis === "h" ? e.clientY : e.clientX };
      gEl.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    gEl.addEventListener("pointermove", e => {
      if (!drag) return;
      const g = canvasCfg.guides.find(x => x.id === drag.id);
      if (!g) return;
      const pt = uieCanvasPointFromEvent(e);
      g.position = Math.round(g.axis === "h" ? pt.y : pt.x);
      const label = document.querySelector(`[data-uie-guide-label="${g.id}"]`);
      if (label) { label.textContent = `${g.position}px`; label.style[g.axis === "h" ? "top" : "left"] = g.axis === "h" ? `${g.position - 14}px` : `${g.position + 4}px`; }
      gEl.style[g.axis === "h" ? "top" : "left"] = `${g.position}px`;
    });
    gEl.addEventListener("pointerup", e => {
      if (!drag) return;
      const g = canvasCfg.guides.find(x => x.id === drag.id);
      const wrap = document.getElementById("uie-canvas-wrap");
      const rect = wrap?.getBoundingClientRect();
      if (g && rect) {
        const off = g.axis === "h" ? e.clientY < rect.top - 10 || e.clientY > rect.bottom + 10 : e.clientX < rect.left - 10 || e.clientX > rect.right + 10;
        if (off) canvasCfg.guides = canvasCfg.guides.filter(x => x.id !== g.id);
      }
      drag = null;
      renderAutomationStudioView();
    });
  });
  document.querySelectorAll("[data-uie-guide-label]").forEach(lbl => {
    lbl.addEventListener("dblclick", e => {
      e.stopPropagation();
      const g = canvasCfg.guides.find(x => x.id === lbl.dataset.uieGuideLabel);
      if (!g) return;
      const val = window.prompt("Guide position (px):", String(g.position));
      if (val == null) return;
      g.position = Math.round(Number(val) || 0);
      renderAutomationStudioView();
    });
  });
}

function uieWireCanvasInteraction(canvas, wrap) {
  let drag = null;
  let pan = null;
  let marquee = null;

  const layoutStackPositions = () =>
    uieCollectStackPositions(uieScreenWidgets(uieEnsureUi().activeScreenId));

  const showGuides = (w, others) => {
    const gEl = document.getElementById("uie-guides");
    if (!gEl) return;
    const existing = gEl.querySelectorAll(".uie-guide:not(.uie-guide-line)");
    gEl.querySelectorAll(".uie-guide-h, .uie-guide-v").forEach(el => {
      if (!el.classList.contains("uie-guide-line")) el.remove();
    });
    const cx = w.x + w.width / 2;
    const cy = w.y + w.height / 2;
    others.forEach(o => {
      const ocx = o.x + o.width / 2;
      const ocy = o.y + o.height / 2;
      if (Math.abs(cx - ocx) < 4) gEl.innerHTML += `<div class="uie-guide uie-guide-v" style="left:${ocx}px;"></div>`;
      if (Math.abs(cy - ocy) < 4) gEl.innerHTML += `<div class="uie-guide uie-guide-h" style="top:${ocy}px;"></div>`;
    });
  };

  const updateSelectionBox = (w, stackPositions) => {
    if (!w) return;
    const rect = uieGetWidgetRenderRect(w, stackPositions);
    const box = canvas.querySelector(`[data-uie-sel-box="${w.id}"]`);
    if (box) {
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }
  };

  const updateGroupOutlines = (stackPositions) => {
    const selIds = uieGetSelection();
    selIds.forEach(id => {
      const w = uieFindWidget(id);
      const rect = w ? uieGetWidgetRenderRect(w, stackPositions) : null;
      const el = canvas.querySelector(`[data-uie-widget="${id}"]`);
      if (w && el && rect) {
        el.style.left = `${rect.x}px`;
        el.style.top = `${rect.y}px`;
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
      }
      updateSelectionBox(w, stackPositions);
    });
    const bounds = uieSelectionBounds(selIds);
    const gb = canvas.querySelector("[data-uie-group-box]");
    if (gb && bounds) {
      gb.style.left = `${bounds.x}px`;
      gb.style.top = `${bounds.y}px`;
      gb.style.width = `${bounds.width}px`;
      gb.style.height = `${bounds.height}px`;
    }
    const outlines = canvas.querySelectorAll(".uie-group-outline");
    selIds.forEach((id, i) => {
      const w = uieFindWidget(id);
      const rect = w ? uieGetWidgetRenderRect(w, stackPositions) : null;
      if (rect && outlines[i]) {
        outlines[i].style.left = `${rect.x}px`;
        outlines[i].style.top = `${rect.y}px`;
        outlines[i].style.width = `${rect.width}px`;
        outlines[i].style.height = `${rect.height}px`;
      }
    });
  };

  wrap.addEventListener("wheel", e => uieApplyWheelPanZoom(e), { passive: false });

  wrap.addEventListener("pointerdown", e => {
    const isMiddle = e.button === 1;
    const panMode = UIE_CANVAS_MODE === "pan";
    if ((isMiddle || window._uieSpaceDown || (panMode && e.button === 0)) && !e.target.closest("[data-uie-widget]") && !e.target.closest("[data-uie-handle]")) {
      pan = { sx: e.clientX, sy: e.clientY, panX: uieEnsureUi().view.panX, panY: uieEnsureUi().view.panY };
      wrap.classList.add("uie-panning");
      wrap.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (UIE_PLACE_ARMED) return;
    if (panMode && e.button === 0) return;
    if (e.target.closest("[data-uie-widget]") || e.target.closest("[data-uie-handle]") || e.target.closest("[data-uie-group-box]")) return;
    if (!e.target.closest("#uie-canvas-wrap")) return;
    if (!e.shiftKey) uieDeselect();
    const pt = uieCanvasPointFromEvent(e);
    const mEl = document.createElement("div");
    mEl.className = "uie-marquee";
    canvas.appendChild(mEl);
    marquee = { sx: pt.x, sy: pt.y, el: mEl };
    wrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  wrap.addEventListener("pointermove", e => {
    if (pan) {
      const ui = uieEnsureUi();
      ui.view.panX = pan.panX + (e.clientX - pan.sx);
      ui.view.panY = pan.panY + (e.clientY - pan.sy);
      uieApplyViewportCss();
    }
    if (marquee) {
      const pt = uieCanvasPointFromEvent(e);
      const left = Math.min(marquee.sx, pt.x);
      const top = Math.min(marquee.sy, pt.y);
      const w = Math.abs(pt.x - marquee.sx);
      const h = Math.abs(pt.y - marquee.sy);
      marquee.el.style.left = `${left}px`;
      marquee.el.style.top = `${top}px`;
      marquee.el.style.width = `${w}px`;
      marquee.el.style.height = `${h}px`;
    }
  });

  wrap.addEventListener("pointerup", e => {
    if (pan) {
      pan = null;
      wrap.classList.remove("uie-panning");
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    }
    if (marquee) {
      const pt = uieCanvasPointFromEvent(e);
      const left = Math.min(marquee.sx, pt.x);
      const top = Math.min(marquee.sy, pt.y);
      const rect = { left, top, width: Math.abs(pt.x - marquee.sx), height: Math.abs(pt.y - marquee.sy) };
      marquee.el.remove();
      const screenWidgets = uieScreenWidgets(uieEnsureUi().activeScreenId);
      const stackPositions = uieCollectStackPositions(screenWidgets);
      const hits = screenWidgets.filter(w => {
        const r = uieGetWidgetRenderRect(w, stackPositions);
        return r.x < rect.left + rect.width && r.x + r.width > rect.left
          && r.y < rect.top + rect.height && r.y + r.height > rect.top;
      }).map(w => w.id);
      if (hits.length) uieSetSelection(hits);
      else if (!e.shiftKey) uieDeselect();
      marquee = null;
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      renderAutomationStudioView();
    }
  });

  if (!window._uieSpacePanWired) {
    window._uieSpacePanWired = true;
    window.addEventListener("keydown", e => {
      if (e.code === "Space" && uieInDesigner() && !e.target.closest("input, textarea, select")) {
        window._uieSpaceDown = true;
        e.preventDefault();
      }
      const inField = e.target.closest("input, textarea, select, [contenteditable]");
      const wrapOpen = document.getElementById("uie-canvas-wrap");
      if (e.key === "Home" && !inField && wrapOpen && uieInDesigner()
          && (UIE_CANVAS_HOVER || wrapOpen.contains(document.activeElement))) {
        e.preventDefault();
        uieRecenterView();
      }
    });
    window.addEventListener("keyup", e => {
      if (e.code === "Space") window._uieSpaceDown = false;
    });
  }

  canvas.addEventListener("contextmenu", e => {
    const widgetEl = e.target.closest("[data-uie-widget]");
    if (!widgetEl) return;
    e.preventDefault();
    e.stopPropagation();
    uieShowWidgetContextMenu(e, widgetEl.dataset.uieWidget);
  });

  canvas.addEventListener("pointerdown", e => {
    if (UIE_PLACE_ARMED) return;
    const widgetEl = e.target.closest("[data-uie-widget]");
    const handle = e.target.closest("[data-uie-handle]");
    const groupBox = e.target.closest("[data-uie-group-box]");
    if (!widgetEl && !handle && !groupBox) {
      return;
    }
    const id = widgetEl?.dataset.uieWidget || (groupBox ? uieGetSelection()[0] : UIE_SELECTED);
    const selIds = uieGetSelection();
    if (widgetEl && !selIds.includes(id)) {
      if (e.shiftKey) uieSetSelection([id], { toggle: true });
      else uieSetSelection([id]);
    }
    const activeIds = uieGetSelection();
    const primary = uieFindWidget(id) || uieFindWidget(activeIds[0]);
    if (!primary) return;
    const pt = uieCanvasPointFromEvent(e);
    const isGroupDrag = activeIds.length > 1 && !handle;
    const startPositions = isGroupDrag ? activeIds.map(sid => {
      const wd = uieFindWidget(sid);
      return wd ? { id: sid, x: wd.x, y: wd.y, w: wd.width, h: wd.height } : null;
    }).filter(Boolean) : null;
    drag = {
      w: primary, handle: handle?.dataset.uieHandle || null,
      ox: primary.x, oy: primary.y, ow: primary.width, oh: primary.height,
      sx: pt.x, sy: pt.y,
      altDup: e.altKey,
      isGroupDrag, startPositions,
      groupBounds: isGroupDrag ? uieSelectionBounds(activeIds) : null,
      stackPositions: layoutStackPositions(),
    };
    if (drag.altDup) {
      uieDesignerRecordUndo();
      const newIds = uiePasteWidgets(uieCopyWidgets(activeIds), 0, 0);
      uieSetSelection(newIds);
      drag.w = uieFindWidget(newIds[0]);
      drag.startPositions = newIds.map(sid => { const wd = uieFindWidget(sid); return { id: sid, x: wd.x, y: wd.y, w: wd.width, h: wd.height }; });
    } else uieDesignerRecordUndo();
    (handle || widgetEl || groupBox)?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const pt = uieCanvasPointFromEvent(e);
    const dx = pt.x - drag.sx;
    const dy = pt.y - drag.sy;
    const w = drag.w;
    const shift = e.shiftKey;
    const stackPositions = drag.stackPositions;
    if (drag.isGroupDrag && !drag.handle) {
      (drag.startPositions || []).forEach(sp => {
        const wd = uieFindWidget(sp.id);
        if (!wd) return;
        let nx = uieSnapAxis(sp.x + dx, "v");
        let ny = uieSnapAxis(sp.y + dy, "h");
        if (shift) {
          if (Math.abs(dx) > Math.abs(dy)) ny = sp.y;
          else nx = sp.x;
        }
        wd.x = nx;
        wd.y = ny;
      });
      updateGroupOutlines(stackPositions);
      return;
    }
    if (drag.handle) {
      const h = drag.handle;
      if (drag.isGroupDrag && drag.groupBounds) {
        const scaleX = (drag.groupBounds.width + (h.includes("e") ? dx : h.includes("w") ? -dx : 0)) / drag.groupBounds.width;
        const scaleY = (drag.groupBounds.height + (h.includes("s") ? dy : h.includes("n") ? -dy : 0)) / drag.groupBounds.height;
        let sx = shift ? Math.max(scaleX, scaleY) : scaleX;
        let sy = shift ? sx : scaleY;
        (drag.startPositions || []).forEach(sp => {
          const wd = uieFindWidget(sp.id);
          if (!wd) return;
          const relX = sp.x - drag.groupBounds.x;
          const relY = sp.y - drag.groupBounds.y;
          wd.x = uieSnapAxis(drag.groupBounds.x + relX * sx, "v");
          wd.y = uieSnapAxis(drag.groupBounds.y + relY * sy, "h");
          wd.width = Math.max(uieGridSize(), uieSnap(sp.w * sx));
          wd.height = Math.max(uieGridSize(), uieSnap(sp.h * sy));
        });
        updateGroupOutlines(stackPositions);
        return;
      }
      if (h.includes("e")) w.width = Math.max(uieGridSize(), uieSnap(drag.ow + dx));
      if (h.includes("w")) { w.x = uieSnapAxis(drag.ox + dx, "v"); w.width = Math.max(uieGridSize(), uieSnap(drag.ow - dx)); }
      if (h.includes("s")) w.height = Math.max(uieGridSize(), uieSnap(drag.oh + dy));
      if (h.includes("n")) { w.y = uieSnapAxis(drag.oy + dy, "h"); w.height = Math.max(uieGridSize(), uieSnap(drag.oh - dy)); }
      if (shift) { const s = Math.max(w.width, w.height); w.width = s; w.height = s; }
    } else {
      let nx = uieSnapAxis(drag.ox + dx, "v");
      let ny = uieSnapAxis(drag.oy + dy, "h");
      if (shift) {
        if (Math.abs(dx) > Math.abs(dy)) ny = drag.oy;
        else nx = drag.ox;
      }
      w.x = nx;
      w.y = ny;
      showGuides(w, uieEnsureUi().widgets.filter(o => o.id !== w.id));
    }
    const rect = uieGetWidgetRenderRect(w, stackPositions);
    const el = canvas.querySelector(`[data-uie-widget="${w.id}"]`);
    if (el && rect) {
      el.style.left = `${rect.x}px`;
      el.style.top = `${rect.y}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    }
    updateSelectionBox(w, stackPositions);
  });

  canvas.addEventListener("pointerup", () => {
    if (drag) renderAutomationStudioView();
    drag = null;
    document.getElementById("uie-designer-root")?.focus();
  });
}

function uiePreviewApplyStateClass(el, w, stateKey) {
  const st = uieStateStyle(w, stateKey);
  if (!st) return;
  const prev = el.getAttribute("data-uie-prev-style") || "";
  if (!el.hasAttribute("data-uie-prev-style")) el.setAttribute("data-uie-prev-style", el.getAttribute("style") || "");
  el.setAttribute("style", `${el.getAttribute("data-uie-prev-style")};${st}`);
  el.classList.add(`uie-state-${stateKey}`);
}

function uiePreviewClearStateClass(el) {
  const prev = el.getAttribute("data-uie-prev-style");
  if (prev != null) el.setAttribute("style", prev);
  el.classList.remove("uie-state-hover", "uie-state-pressed", "uie-state-disabled");
}

function uiePreviewFireDropped(targetId, sourceId) {
  const w = uieFindWidget(targetId);
  if (!w) return;
  const b = (w.events || {}).dropped;
  if (!b || !b.nodeId) return;
  uiePreviewToast(`dropped: ${sourceId} → ${targetId}`);
  uiePreviewFireEvent(targetId, "dropped");
}

function uieWpFieldInputHtml(field, value) {
  const esc = escapeHtml;
  if (field.type === "checkbox") {
    return `<label><input type="checkbox" data-uie-wp-field="${esc(field.name)}" ${value ? "checked" : ""}> ${esc(field.name)}</label>`;
  }
  const inputType = field.type === "number" ? "number" : "text";
  return `<label>${esc(field.name)}</label><input type="${inputType}" data-uie-wp-field="${esc(field.name)}" value="${esc(value != null ? String(value) : "")}">`;
}

function uieWpCollectForm(container) {
  const fields = {};
  container.querySelectorAll("[data-uie-wp-field]").forEach(inp => {
    const name = inp.dataset.uieWpField;
    if (inp.type === "checkbox") fields[name] = inp.checked;
    else if (inp.type === "number") fields[name] = Number(inp.value) || 0;
    else fields[name] = inp.value;
  });
  return fields;
}

async function uieRenderDataListContent(widgetId, container) {
  const schema = uieEnsureDataSchema();
  const appId = uieGetPublishedAppId();
  const localNote = !appId ? `<div class="uie-wp-data-note">Local until published — stored in browser only.</div>` : "";
  if (!schema.length) {
    container.innerHTML = `${localNote}<div class="stub">Define fields in Data tab</div>`;
    return;
  }
  const rows = await uieDataFetchRows();
  const esc = escapeHtml;
  const rowHtml = rows.map(row => {
    const cells = schema.map(f => `<span>${esc(String(row[f.name] ?? ""))}</span>`).join("");
    return `<div class="uie-wp-data-row" data-uie-wp-row="${esc(String(row.id))}">
      ${cells}
      <button type="button" class="secondary" data-uie-wp-edit="${esc(String(row.id))}" style="font-size:8px;padding:1px 3px;margin-left:auto;">✎</button>
      <button type="button" class="secondary" data-uie-wp-del="${esc(String(row.id))}" style="font-size:8px;padding:1px 3px;">×</button>
    </div>`;
  }).join("");
  const formFields = schema.map(f => uieWpFieldInputHtml(f, f.type === "checkbox" ? false : "")).join("");
  container.innerHTML = `${localNote}
    <div class="uie-wp-data-rows">${rowHtml || `<div class="stub">No rows</div>`}</div>
    <div class="uie-wp-data-form" data-uie-wp-form="${esc(widgetId)}">${formFields}
      <button type="button" class="secondary" data-uie-wp-add="${esc(widgetId)}" style="width:100%;margin-top:4px;font-size:10px;">+ Add row</button>
    </div>`;
  container.querySelector(`[data-uie-wp-add="${widgetId}"]`)?.addEventListener("click", async () => {
    const form = container.querySelector(`[data-uie-wp-form="${widgetId}"]`);
    if (!form) return;
    const fields = uieWpCollectForm(form);
    await uieDataCreateRow(fields);
    uiePreviewToast("Row added");
    uieRenderDataListContent(widgetId, container);
  });
  container.querySelectorAll("[data-uie-wp-del]").forEach(delBtn => {
    delBtn.addEventListener("click", async () => {
      await uieDataDeleteRow(delBtn.dataset.uieWpDel);
      uiePreviewToast("Row deleted");
      uieRenderDataListContent(widgetId, container);
    });
  });
  container.querySelectorAll("[data-uie-wp-edit]").forEach(editBtn => {
    editBtn.addEventListener("click", async () => {
      const rowId = editBtn.dataset.uieWpEdit;
      const rows = await uieDataFetchRows();
      const row = rows.find(r => String(r.id) === String(rowId));
      if (!row) return;
      const form = container.querySelector(`[data-uie-wp-form="${widgetId}"]`);
      if (!form) return;
      schema.forEach(f => {
        const inp = form.querySelector(`[data-uie-wp-field="${f.name}"]`);
        if (!inp) return;
        if (inp.type === "checkbox") inp.checked = !!row[f.name];
        else inp.value = row[f.name] != null ? String(row[f.name]) : "";
      });
      const addBtn = form.querySelector(`[data-uie-wp-add="${widgetId}"]`);
      if (addBtn) {
        addBtn.textContent = "Save changes";
        addBtn.onclick = async () => {
          await uieDataUpdateRow(rowId, uieWpCollectForm(form));
          uiePreviewToast("Row updated");
          addBtn.textContent = "+ Add row";
          uieRenderDataListContent(widgetId, container);
        };
      }
    });
  });
}

async function uieWpExecuteAction(w, action) {
  const p = w.props || {};
  try {
    if (action === "add_task") {
      await api("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: p.titleTemplate || "New task", urgency: p.urgency || "medium" }) });
      uiePreviewToast("Task created");
    } else if (action === "log_pulse") {
      const happiness = Math.min(10, Math.max(1, Number(p.happiness) || 5));
      await api("/api/pulses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ happiness }) });
      uiePreviewToast(`Pulse logged (${happiness})`);
    } else if (action === "open_app") {
      const tab = p.targetTab || "Today";
      if (typeof AUTOMATION_STUDIO_OPEN !== "undefined") AUTOMATION_STUDIO_OPEN = false;
      if (typeof CUSTOM_APP_VIEW !== "undefined") { CUSTOM_APP_VIEW = false; window.CUSTOM_APP_VIEW = false; }
      if (typeof renderAutomationStudioView === "function") await renderAutomationStudioView();
      if (typeof goToTab === "function") goToTab(tab);
    } else if (action === "run_blueprint") {
      const wfId = p.workflowId;
      if (!wfId) { uiePreviewToast("No workflow selected"); return; }
      if (!window.confirm(`Run blueprint workflow ${wfId}?`)) return;
      await api(`/api/workflows/${wfId}/run-python`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      uiePreviewToast("Blueprint run started");
    }
  } catch (err) {
    uiePreviewToast(typeof errorMessage === "function" ? errorMessage(err) : String(err));
  }
}

function uieWireWaypointPreview(canvas) {
  canvas.querySelectorAll("[data-uie-wp-action]").forEach(btn => {
    const w = uieFindWidget(btn.dataset.uieWpId);
    if (!w) return;
    btn.addEventListener("click", () => uieWpExecuteAction(w, btn.dataset.uieWpAction));
  });
  uieEnsureUi().widgets.filter(w => w.type === "wp_data_list").forEach(w => {
    const container = canvas.querySelector(`[data-uie-wp-data="${w.id}"]`);
    if (container) uieRenderDataListContent(w.id, container);
  });
}

function uieWireDataSchema() {
  document.querySelectorAll("[data-uie-data-name]").forEach(inp => {
    const handler = () => {
      const idx = Number(inp.dataset.uieDataName);
      const schema = uieEnsureDataSchema();
      if (schema[idx]) { wfPushUndo(); schema[idx].name = inp.value.trim(); }
    };
    inp.addEventListener("change", handler);
    inp.addEventListener("blur", handler);
  });
  document.querySelectorAll("[data-uie-data-type]").forEach(sel => {
    sel.addEventListener("change", () => {
      const idx = Number(sel.dataset.uieDataType);
      const schema = uieEnsureDataSchema();
      if (schema[idx]) { wfPushUndo(); schema[idx].type = sel.value; }
    });
  });
  document.querySelectorAll("[data-uie-data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      wfPushUndo();
      uieEnsureDataSchema().splice(Number(btn.dataset.uieDataDel), 1);
      renderAutomationStudioView();
    });
  });
}

function uieWirePreview() {
  const canvas = document.getElementById("uie-preview-canvas");
  if (!canvas) return;
  let previewDrag = null;
  document.getElementById("uie-preview-run")?.addEventListener("click", () => uiePlayBlueprintInPreview());
  document.getElementById("uie-preview-stop")?.addEventListener("click", () => uieStopBlueprintPreview());

  if (!canvas.dataset.uieDelegated) {
    canvas.dataset.uieDelegated = "1";
    canvas.addEventListener("click", e => {
      const btn = e.target.closest(".uie-w-btn");
      if (btn) {
        const wid = btn.closest("[data-uie-widget]")?.dataset?.uieWidget;
        if (wid) uiePreviewFireEvent(wid, "clicked");
        return;
      }
      uiePreviewFireKeyboard("click", "pointer");
    });
    canvas.addEventListener("change", e => {
      const el = e.target;
      const wid = el.closest("[data-uie-widget]")?.dataset?.uieWidget;
      if (!wid) return;
      const w = uieFindWidget(wid);
      if (!w) return;
      if (el.classList.contains("uie-w-check") || (el.type === "checkbox" && el.closest(".uie-w-check"))) uiePreviewFireEvent(wid, "toggled");
      if (el.classList.contains("uie-w-entry")) uiePreviewFireEvent(wid, "changed");
      if (el.classList.contains("uie-w-combo")) uiePreviewFireEvent(wid, "selected");
    });
    canvas.addEventListener("input", e => {
      const el = e.target;
      if (el.classList.contains("uie-w-scale")) {
        const wid = el.closest("[data-uie-widget]")?.dataset?.uieWidget;
        if (wid) uiePreviewFireEvent(wid, "changed");
      }
    });
    canvas.addEventListener("keydown", e => {
      const el = e.target;
      if (el.classList.contains("uie-w-entry") && e.key === "Enter") {
        const wid = el.closest("[data-uie-widget]")?.dataset?.uieWidget;
        if (wid) uiePreviewFireEvent(wid, "return_pressed");
      }
    });
  }

  uieEnsureUi().widgets.forEach(w => {
    if (w.screenId !== uiePreviewActiveScreenId()) return;
    const el = canvas.querySelector(`[data-uie-widget="${w.id}"]`);
    if (!el) return;
    const p = w.props || {};
    const b = p.behavior || {};
    const states = p.states || {};
    if (b.detectHover) {
      el.addEventListener("mouseenter", () => uiePreviewFireEvent(w.id, "hover_enter"));
      el.addEventListener("mouseleave", () => uiePreviewFireEvent(w.id, "hover_exit"));
    }
    if (w.type === "button") {
      const btn = el.querySelector(".uie-w-btn");
      if (states.hover) btn?.addEventListener("mouseenter", () => uiePreviewApplyStateClass(el, w, "hover"));
      if (states.hover) btn?.addEventListener("mouseleave", () => uiePreviewClearStateClass(el));
      if (states.pressed) {
        btn?.addEventListener("mousedown", () => uiePreviewApplyStateClass(el, w, "pressed"));
        btn?.addEventListener("mouseup", () => uiePreviewClearStateClass(el));
      }
    }
    if (b.draggable) {
      el.style.cursor = "grab";
      el.addEventListener("pointerdown", e => {
        previewDrag = { id: w.id, sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y };
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
    }
    if (b.dropZone) {
      el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("uie-drop-highlight"); });
      el.addEventListener("dragleave", () => el.classList.remove("uie-drop-highlight"));
      el.addEventListener("drop", e => {
        e.preventDefault();
        el.classList.remove("uie-drop-highlight");
        const src = e.dataTransfer.getData("text/uie-widget-id") || previewDrag?.id;
        if (src) uiePreviewFireDropped(w.id, src);
      });
    }
    if (p.enabled === false && states.disabled) uiePreviewApplyStateClass(el, w, "disabled");
  });

  uieWireWaypointPreview(canvas);

  canvas.addEventListener("pointermove", e => {
    if (!previewDrag) return;
    const w = uieFindWidget(previewDrag.id);
    if (!w) return;
    w.x = uieSnap(previewDrag.ox + (e.clientX - previewDrag.sx));
    w.y = uieSnap(previewDrag.oy + (e.clientY - previewDrag.sy));
    const el = canvas.querySelector(`[data-uie-widget="${w.id}"]`);
    if (el) { el.style.left = `${w.x}px`; el.style.top = `${w.y}px`; }
  });
  canvas.addEventListener("pointerup", e => {
    if (!previewDrag) return;
    const w = uieFindWidget(previewDrag.id);
    previewDrag = null;
    if (!w) return;
    uieEnsureUi().widgets.forEach(t => {
      const b = (t.props || {}).behavior || {};
      if (!b.dropZone || t.id === w.id) return;
      const tel = canvas.querySelector(`[data-uie-widget="${t.id}"]`);
      if (!tel) return;
      const r = tel.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        uiePreviewFireDropped(t.id, w.id);
      }
    });
  });

  document.getElementById("uie-keybind-add")?.addEventListener("click", () => {
    uieEnsureUi().keybinds.push({ key: "", event_node_id: "" });
    renderAutomationStudioView();
  });
  (uieEnsureUi().keybinds || []).forEach((kb, i) => {
    document.querySelector(`[data-uie-keybind-key="${i}"]`)?.addEventListener("change", e => { kb.key = e.target.value; });
    document.querySelector(`[data-uie-keybind-node="${i}"]`)?.addEventListener("change", e => { kb.event_node_id = e.target.value; });
    document.querySelector(`[data-uie-keybind-del="${i}"]`)?.addEventListener("click", () => {
      uieEnsureUi().keybinds.splice(i, 1);
      renderAutomationStudioView();
    });
  });

  if (!window._uiePreviewKeysWired) {
    window._uiePreviewKeysWired = true;
    document.addEventListener("keydown", e => {
      if (STUDIO_TAB !== "preview") return;
      if (e.target.closest("input, textarea, select")) return;
      const configured = (CURRENT_WF.nodes || []).some(node =>
        node.type === "keyboard_event"
          && uiePreviewKeyMatches((node.params || {}).key, e.key, e.code)
      ) || (uieEnsureUi().keybinds || []).some(binding =>
        binding.event_node_id && uiePreviewKeyMatches(binding.key, e.key, e.code)
      );
      if (!configured) return;
      e.preventDefault();
      uiePreviewFireKeyboard(e.key, e.code);
    });
  }
}

function uieWireBindingsConsole() {
  /* static table — no extra wiring */
}

function uieBuildT5Fixture() {
  CURRENT_WF = freshWorkflow();
  uieEnsureUi();
  CURRENT_WF.variables = [{ name: "msg", type: "string", default: "Hello" }];
  const lbl = uieAddWidget("label", 16, 16);
  lbl.props.textVariable = "msg";
  lbl.props.text = "Hello";
  const btn = uieAddWidget("button", 16, 56);
  btn.props.text = "Go";
  const nodeId = uieCreateGraphEvent(btn.id, "clicked");
  const setId = `n${Date.now()}_set`;
  CURRENT_WF.nodes.push({
    id: setId, type: "set_var", x: 300, y: 80, varName: "msg",
    params: { value: "Updated!" },
  });
  CURRENT_WF.edges.push({ from: nodeId, fromPort: "next", to: setId, kind: "exec" });
  return { lbl, btn, nodeId };
}
