// --- Repository tab: local knowledge store, docs workspace, RAG search ---

let REPO_STYLES_INJECTED = false;
let REPO_CATEGORY = "";
let REPO_FILES = [];
let REPO_ALL_FILES = [];
let REPO_KIND = "docs";
let REPO_CATEGORIES = [];
let REPO_SUMMARY = null;
let REPO_SEARCH_Q = "";
let REPO_SEARCH_RESULTS = null;
let REPO_SEARCHING = false;
let REPO_UPLOADING = false;
let REPO_CONV_OPEN = false;
let REPO_META_OPEN = true;
let REPO_CONV_SOURCE = "";
let REPO_CONVERSATIONS = [];
let REPO_SUMMARY_OPEN = false;
let REPO_OPEN_ID = null;
let REPO_CONTENT = null;
let REPO_CONTENT_LOADING = false;
let REPO_DIRTY = false;
let REPO_SAVE_STATE = "";
let REPO_CONSOLE = null;
let REPO_PROPOSALS = null;
let REPO_PROPOSAL_FILE_ID = null;
let REPO_GOOGLE = null;
let REPO_GOOGLE_IMPORTING = false;
let REPO_CSV_ROWS = null;
let REPO_EDITOR_MODE = "docs";
let REPO_DOCS_FULLSCREEN = false;
let REPO_AUTOSAVE_TIMER = null;
let REPO_EXTRACTING = false;
let REPO_ASK_Q = "";
let REPO_ASK_ANSWER = null;
let REPO_ASKING = false;
let REPO_ASK_ERROR = "";
let REPO_ASK_THIS_FILE_ONLY = false;
let REPO_VAULT_NOTES = [];
let REPO_VAULT_STATUS = "";
let REPO_VAULT_LOADING = false;
let REPO_VAULT_ERROR = "";
const REPO_STORAGE_KEY = "repo-open-file-id";
const REPO_MODE_STORAGE_KEY = "repo-editor-mode-by-ext";
const REPO_KINDS = [
  { key: "docs", label: "Docs", singular: "Doc" },
  { key: "sheets", label: "Sheets", singular: "Sheet" },
  { key: "slides", label: "Slides", singular: "Slide" },
  { key: "other", label: "Other", singular: "Other" },
];

function repoEnsureStyles() {
  if (REPO_STYLES_INJECTED) return;
  REPO_STYLES_INJECTED = true;
  const el = document.createElement("style");
  el.id = "repo-styles";
  el.textContent = `
    .repo-root { display: flex; flex-direction: column; gap: 12px; }
    .repo-hero {
      padding: 4px 2px 0;
      text-align: center;
    }
    .repo-hero-title {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .repo-hero-copy {
      margin: 0 auto 4px;
      max-width: 42em;
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink-muted);
    }
    .repo-kind-tabs {
      display: flex; gap: 4px; align-items: center; overflow-x: auto; padding: 4px;
      border: 1px solid var(--gridline); border-radius: 10px; background: var(--surface, var(--card));
    }
    .repo-kind-tab {
      flex: 1 0 auto; display: flex; justify-content: center; align-items: center; gap: 6px;
      padding: 8px 14px; border: none; border-radius: 7px; background: transparent;
      color: var(--ink-muted); font-size: 13px; font-weight: 650; cursor: pointer;
    }
    .repo-kind-tab:hover { background: color-mix(in srgb, var(--accent) 7%, transparent); color: inherit; }
    .repo-kind-tab.active { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
    .repo-kind-count { font-size: 10px; opacity: 0.78; }
    .repo-root.repo-has-open .repo-chrome-compact { opacity: 0.72; }
    .repo-root.repo-has-open .repo-drop { padding: 14px 16px; }
    .repo-root.repo-has-open .repo-drop-hint { display: none; }
    .repo-drop {
      border: 2px dashed var(--gridline); border-radius: 12px; padding: 22px 18px; text-align: center;
      background: var(--bg-card-hover, rgba(255,255,255,0.02)); transition: border-color 0.15s, background 0.15s, padding 0.15s;
      cursor: pointer;
    }
    .repo-drop:hover, .repo-drop.repo-drop-active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
    .repo-drop-title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
    .repo-drop-hint { font-size: 11px; color: var(--ink-muted); margin: 0 0 10px; }
    .repo-drop-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; align-items: center; }
    .repo-create-wrap { position: relative; }
    .repo-create-menu {
      position: absolute; z-index: 30; left: 0; top: calc(100% + 5px); min-width: 150px;
      display: flex; flex-direction: column; gap: 2px; padding: 6px;
      border: 1px solid var(--gridline); border-radius: 9px; background: var(--surface, var(--card));
      box-shadow: 0 10px 28px rgba(0,0,0,0.18); text-align: left;
    }
    .repo-create-menu[hidden] { display: none; }
    .repo-create-option { border: none; background: transparent; color: inherit; padding: 7px 9px; text-align: left; border-radius: 6px; cursor: pointer; }
    .repo-create-option:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .repo-drop-status { font-size: 11px; color: var(--ink-muted); margin-top: 8px; min-height: 1.2em; }
    .repo-google-card {
      border: 1px solid var(--gridline); border-radius: 10px; padding: 12px 14px;
      background: var(--surface, var(--card)); display: flex; flex-direction: column; gap: 8px;
    }
    .repo-google-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .repo-google-title { font-size: 13px; font-weight: 700; margin: 0; }
    .repo-google-note { font-size: 11px; color: var(--ink-muted); margin: 0; line-height: 1.45; }
    .repo-retrieval-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    @media (max-width: 900px) { .repo-retrieval-row { grid-template-columns: 1fr; } }
    .repo-search-wrap { display: flex; flex-direction: column; gap: 6px; }
    .repo-search-row { display: flex; gap: 8px; align-items: stretch; }
    .repo-search-input { flex: 1; font-size: 14px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--gridline); background: var(--surface, var(--card)); }
    .repo-search-hint { font-size: 11px; color: var(--ink-muted); }
    .repo-ask-card {
      border: 1px solid var(--gridline); border-radius: 10px; padding: 12px 14px;
      background: var(--surface, var(--card)); display: flex; flex-direction: column; gap: 8px;
    }
    .repo-ask-title { margin: 0; font-size: 13px; font-weight: 700; }
    .repo-ask-hint { margin: 0; font-size: 11px; color: var(--ink-muted); line-height: 1.45; }
    .repo-ask-row { display: flex; gap: 8px; align-items: stretch; }
    .repo-ask-scope { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-muted); cursor: pointer; }
    .repo-ask-error { font-size: 12px; color: var(--status-bad, #c33); }
    .repo-ask-answer {
      font-size: 13px; line-height: 1.55; white-space: pre-wrap; padding: 10px 12px;
      border-radius: 8px; border: 1px solid var(--gridline); background: color-mix(in srgb, var(--accent) 4%, transparent);
    }
    .repo-ask-ungrounded { margin: 0; font-size: 11px; color: var(--status-warning, #c90); }
    .repo-ask-sources { display: flex; flex-direction: column; gap: 6px; }
    .repo-ask-sources-head { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
    .repo-extract-panel {
      border-bottom: 1px solid var(--gridline); padding: 12px 14px;
      background: color-mix(in srgb, var(--accent) 5%, transparent);
    }
    .repo-extract-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .repo-extract-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
    .repo-extract-wc { font-size: 11px; color: var(--ink-muted); }
    .repo-extract-preview {
      margin: 0 0 10px; max-height: 160px; overflow: auto; padding: 10px 12px; border-radius: 8px;
      border: 1px solid var(--gridline); background: var(--surface, var(--card));
      font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
    }
    .repo-extract-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .repo-summary {
      border: 1px solid var(--gridline); border-radius: 10px; background: var(--surface, var(--card)); overflow: hidden;
    }
    .repo-summary-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px;
      cursor: pointer; user-select: none;
    }
    .repo-summary-head h3 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
    .repo-summary-body { padding: 0 12px 12px; display: none; }
    .repo-summary.repo-summary-open .repo-summary-body { display: block; }
    .repo-summary-text { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    .repo-summary-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; font-size: 11px; color: var(--ink-muted); }
    .repo-summary-stat { padding: 4px 8px; border-radius: 999px; border: 1px solid var(--gridline); }
    .repo-section-toggle {
      display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
      padding: 8px 0; border: none; background: transparent; color: var(--ink-muted); font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; cursor: pointer; text-align: left;
    }
    .repo-workspace {
      display: grid; grid-template-columns: minmax(200px, 260px) minmax(0, 1fr); gap: 0;
      border: 1px solid var(--gridline); border-radius: 12px; overflow: hidden; min-height: 420px;
      background: var(--surface, var(--card));
    }
    @media (max-width: 820px) { .repo-workspace { grid-template-columns: 1fr; min-height: 360px; } }
    .repo-sidebar {
      border-right: 1px solid var(--gridline); display: flex; flex-direction: column; min-height: 0;
      background: color-mix(in srgb, var(--bg-card-hover, rgba(255,255,255,0.02)) 50%, transparent);
    }
    @media (max-width: 820px) { .repo-sidebar { border-right: none; border-bottom: 1px solid var(--gridline); max-height: 220px; } }
    .repo-sidebar-head { padding: 10px 10px 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); }
    .repo-cats { display: flex; flex-direction: column; gap: 3px; padding: 0 8px 8px; max-height: 140px; overflow: auto; }
    .repo-cat-chip {
      display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 8px;
      border-radius: 8px; border: 1px solid transparent; background: transparent; color: inherit;
      font-size: 11px; cursor: pointer; text-align: left;
    }
    .repo-cat-chip:hover { border-color: var(--gridline); }
    .repo-cat-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .repo-cat-count { font-size: 10px; opacity: 0.8; }
    .repo-file-list { flex: 1; overflow: auto; padding: 0 6px 8px; display: flex; flex-direction: column; gap: 2px; }
    .repo-file-row {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%;
      padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; background: transparent;
      color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .repo-file-row:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .repo-file-row.selected { background: color-mix(in srgb, var(--accent) 14%, transparent); border-color: color-mix(in srgb, var(--accent) 35%, var(--gridline)); }
    .repo-file-row-name { font-size: 13px; font-weight: 600; word-break: break-word; line-height: 1.3; }
    .repo-file-row-meta { font-size: 10px; color: var(--ink-muted); }
    .repo-file-row-actions { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
    .repo-file-row-actions button { font-size: 10px; padding: 1px 6px; }
    .repo-viewer { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .repo-viewer-empty {
      flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px 24px;
      color: var(--ink-muted); font-size: 13px; text-align: center; line-height: 1.5;
    }
    .repo-viewer-toolbar {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px;
      border-bottom: 1px solid var(--gridline); background: var(--surface, var(--card));
    }
    .repo-viewer-title-input {
      font-size: 14px; font-weight: 700; flex: 1; min-width: 120px; padding: 5px 7px;
      border: 1px solid var(--gridline); border-radius: 6px; background: var(--bg-shell); color: inherit;
    }
    .repo-viewer-title-label { font-size: 10px; font-weight: 700; color: var(--ink-muted); text-transform: uppercase; letter-spacing: .04em; }
    .repo-viewer-title-input:hover, .repo-viewer-title-input:focus {
      border-color: var(--gridline); background: color-mix(in srgb, var(--accent) 4%, transparent); outline: none;
    }
    .repo-viewer-title-ext { font-size: 10px; color: var(--ink-muted); margin-left: -4px; }
    .repo-viewer-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .repo-saved-indicator { font-size: 11px; color: var(--ink-muted); min-width: 4em; }
    .repo-saved-indicator.repo-saved-dirty { color: var(--status-warning, #c90); }
    .repo-saved-indicator.repo-saved-ok { color: var(--status-good, #3a3); }
    .repo-viewer-body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
    .repo-editor {
      flex: 1; width: 100%; min-height: 280px; padding: 14px 16px; border: none; resize: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px; line-height: 1.5; background: transparent; color: inherit; outline: none;
    }
    .repo-md-preview {
      flex: 1; padding: 14px 18px; font-size: 14px; line-height: 1.55; overflow: auto;
    }
    .repo-md-preview h1, .repo-md-preview h2, .repo-md-preview h3 { margin: 0.6em 0 0.35em; }
    .repo-md-preview pre { background: color-mix(in srgb, var(--gridline) 40%, transparent); padding: 10px; border-radius: 8px; overflow: auto; }
    .repo-md-preview code { font-family: ui-monospace, monospace; font-size: 0.92em; }
    .repo-csv-wrap { flex: 1; overflow: auto; padding: 8px; }
    .repo-csv-table { border-collapse: collapse; font-size: 12px; width: max-content; min-width: 100%; }
    .repo-csv-table th, .repo-csv-table td {
      border: 1px solid var(--gridline); padding: 4px 8px; min-width: 60px; max-width: 280px;
      vertical-align: top; word-break: break-word;
    }
    .repo-csv-table th { background: color-mix(in srgb, var(--gridline) 30%, transparent); font-weight: 600; }
    .repo-csv-table td[contenteditable] { outline: none; }
    .repo-csv-table td:focus { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 50%, transparent); }
    .repo-binary-preview { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; }
    .repo-binary-preview img { max-width: 100%; max-height: 360px; border-radius: 8px; border: 1px solid var(--gridline); }
    .repo-console {
      border-top: 1px solid var(--gridline); background: #0d1117; color: #e6edf3;
      font-family: ui-monospace, monospace; font-size: 12px; max-height: 180px; overflow: auto; padding: 10px 12px;
    }
    .repo-console-stderr { color: #f85149; }
    .repo-console-exit { color: var(--ink-muted); font-size: 11px; margin-top: 6px; }
    .repo-proposals {
      border-top: 1px solid var(--gridline); padding: 12px 14px; background: color-mix(in srgb, var(--accent) 4%, transparent);
    }
    .repo-proposals-head { font-size: 12px; font-weight: 700; margin: 0 0 4px; }
    .repo-proposals-hint { font-size: 11px; color: var(--ink-muted); margin: 0 0 10px; }
    .repo-proposal-item {
      display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--gridline);
      font-size: 12px;
    }
    .repo-proposal-item:last-child { border-bottom: none; }
    .repo-proposal-body { flex: 1; min-width: 0; }
    .repo-proposal-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
    .repo-search-results { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
    .repo-search-hit {
      border: 1px solid var(--gridline); border-radius: 8px; padding: 10px; background: var(--surface, var(--card));
      cursor: pointer;
    }
    .repo-search-hit:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--gridline)); }
    .repo-search-hit-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; margin-bottom: 4px; }
    .repo-search-filename { font-size: 12px; font-weight: 600; }
    .repo-search-score { font-size: 10px; color: var(--ink-muted); }
    .repo-search-snippet { font-size: 12px; line-height: 1.4; color: var(--ink-muted); }
    .repo-hit { background: color-mix(in srgb, var(--accent) 35%, transparent); color: inherit; padding: 0 2px; border-radius: 2px; }
    .repo-empty { font-size: 12px; color: var(--ink-muted); padding: 16px; text-align: center; border: 1px dashed var(--gridline); border-radius: 8px; }
    .repo-conv-panel { border: 1px solid var(--gridline); border-radius: 10px; padding: 10px 12px; background: var(--surface, var(--card)); }
    .repo-conv-filters { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
    .repo-conv-filter { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--gridline); background: transparent; cursor: pointer; }
    .repo-conv-filter.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .repo-conv-group { margin-bottom: 12px; }
    .repo-conv-group-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); margin: 0 0 6px; }
    .repo-conv-item { padding: 8px 0; border-bottom: 1px solid var(--gridline); }
    .repo-conv-item:last-child { border-bottom: none; }
    .repo-conv-meta { font-size: 10px; color: var(--ink-muted); margin-bottom: 4px; }
    .repo-conv-preview { font-size: 12px; line-height: 1.35; white-space: pre-wrap; max-height: 6em; overflow: hidden; }
    .repo-mode-toggle { display: inline-flex; border: 1px solid var(--gridline); border-radius: 8px; overflow: hidden; }
    .repo-mode-toggle button {
      font-size: 11px; padding: 4px 10px; border: none; background: transparent; color: var(--ink-muted); cursor: pointer;
    }
    .repo-mode-toggle button.active { background: var(--accent); color: #fff; }
    .repo-docs-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    .repo-docs-toolbar-slot { padding: 6px 10px; border-bottom: 1px solid var(--gridline); overflow-x: auto; }
    .repo-docs-toolbar-slot .rich-toolbar { flex-wrap: wrap; }
    .repo-compact-toolbar { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .repo-compact-toolbar button { font-size: 11px; padding: 3px 8px; }
    .repo-vault-card {
      border: 1px solid var(--gridline); border-radius: 10px; padding: 12px 14px;
      background: var(--surface, var(--card)); display: flex; flex-direction: column; gap: 8px;
    }
    .repo-vault-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
    .repo-vault-title { margin:0; font-size:13px; font-weight:700; }
    .repo-vault-list { display:flex; flex-direction:column; gap:4px; max-height:180px; overflow:auto; }
    .repo-vault-note {
      display:flex; justify-content:space-between; gap:8px; align-items:center;
      padding:6px 8px; border-radius:7px; border:1px solid transparent; background:transparent;
      cursor:pointer; font-size:12px; text-align:left; color:inherit; width:100%;
    }
    .repo-vault-note:hover { border-color: var(--gridline); background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .repo-vault-ext { font-size:10px; color:var(--ink-muted); }
    .repo-docs-scroll { flex: 1; overflow: auto; padding: 16px 20px; }
    .repo-docs-editor {
      min-height: 260px; outline: none; font-size: 15px; line-height: 1.65;
      max-width: 760px; margin: 0 auto; word-break: break-word;
    }
    .repo-docs-editor:empty::before { content: attr(data-placeholder); color: var(--ink-muted); pointer-events: none; }
    .repo-overleaf-tip {
      margin: 0; padding: 8px 12px; font-size: 11px; color: var(--ink-muted);
      background: color-mix(in srgb, var(--accent) 6%, transparent); border-bottom: 1px solid var(--gridline);
    }
    .repo-docs-fs-overlay {
      position: fixed; inset: 0; z-index: 10050; display: flex; flex-direction: column;
      background: color-mix(in srgb, var(--bg, #0d0d0d) 88%, transparent);
      backdrop-filter: blur(4px);
    }
    .repo-docs-fs-overlay.repo-docs-fs-overlay--default {
      inset: 5vh 7vw;
      border: 1px solid var(--gridline);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 18px 60px rgba(0,0,0,.35);
    }
    .repo-docs-fs-head {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px;
      border-bottom: 1px solid var(--gridline); background: var(--surface, var(--card));
    }
    .repo-docs-fs-title { font-size: 13px; font-weight: 700; flex: 1; min-width: 120px; }
    .repo-docs-fs-hint { font-size: 11px; color: var(--ink-muted); }
    .repo-docs-fs-inner { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 28px 20px 40px; }
    .repo-docs-fs-page {
      width: 100%; max-width: 780px; min-height: min(720px, calc(100vh - 160px));
      background: var(--surface, var(--card)); border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18); padding: 44px 52px;
    }
    .repo-docs-fs-page .repo-docs-editor { max-width: none; min-height: 480px; }
  `;
  document.head.appendChild(el);
}

async function repoFetchJson(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function repoGetStoredOpenId() {
  try {
    const v = localStorage.getItem(REPO_STORAGE_KEY);
    return v ? String(v) : null;
  } catch (_) {
    return null;
  }
}

function repoSetStoredOpenId(id) {
  try {
    if (id == null) localStorage.removeItem(REPO_STORAGE_KEY);
    else localStorage.setItem(REPO_STORAGE_KEY, String(id));
  } catch (_) { /* ignore */ }
}

function repoFormatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function repoFormatStamp(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch (_) {
    return String(iso);
  }
}

function repoHighlightSnippet(text, query) {
  const safe = escapeHtml(text || "");
  const q = (query || "").trim();
  if (!q) return safe;
  const terms = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return safe;
  try {
    const re = new RegExp(`(${terms.join("|")})`, "gi");
    return safe.replace(re, '<mark class="repo-hit">$1</mark>');
  } catch (_) {
    return safe;
  }
}

function repoFileById(id) {
  const sid = String(id);
  return REPO_ALL_FILES.find(f => String(f.id) === sid)
    || REPO_FILES.find(f => String(f.id) === sid)
    || null;
}

function repoFlatFiles() {
  return [...REPO_FILES].sort((a, b) => {
    const at = Date.parse(a.created_at || "") || 0;
    const bt = Date.parse(b.created_at || "") || 0;
    if (at !== bt) return bt - at;
    const an = (a.filename || a.name || "").toLowerCase();
    const bn = (b.filename || b.name || "").toLowerCase();
    return an.localeCompare(bn);
  });
}

function repoWorkspaceKind(file) {
  const explicit = String(file?.kind || "").toLowerCase();
  if (REPO_KINDS.some(item => item.key === explicit)) return explicit;
  const name = (file?.filename || file?.name || "").toLowerCase();
  if (name.endsWith(".slides.md") || /\.(ppt|pptx|odp|key)$/.test(name)) return "slides";
  if (/\.(csv|tsv|xls|xlsx|ods|numbers)$/.test(name)) return "sheets";
  if (name.endsWith(".other.md")) return "other";
  if (/\.(md|markdown|txt|rst|log|tex|pdf|doc|docx|rtf|odt)$/.test(name)) return "docs";
  return "other";
}

function repoApplyKindFilter() {
  REPO_FILES = REPO_ALL_FILES.filter(file => repoWorkspaceKind(file) === REPO_KIND);
}

function repoKindMeta(kind = REPO_KIND) {
  return REPO_KINDS.find(item => item.key === kind) || REPO_KINDS[0];
}

function repoManagedExtension(file) {
  const name = file?.filename || file?.name || "";
  const lower = name.toLowerCase();
  if (lower.endsWith(".slides.md")) return name.slice(-10);
  if (lower.endsWith(".other.md")) return name.slice(-9);
  const match = name.match(/(\.[^.]+)$/);
  return match ? match[1] : "";
}

function repoDisplayName(file) {
  const name = file?.filename || file?.name || "Untitled";
  const suffix = repoManagedExtension(file);
  return suffix ? name.slice(0, -suffix.length) : name;
}

function repoIsPython(file) {
  const name = (file?.filename || file?.name || "").toLowerCase();
  return name.endsWith(".py");
}

function repoIsImage(file, content) {
  const kind = (content?.kind || "").toLowerCase();
  if (kind === "image") return true;
  const mime = (file?.mime_type || file?.mime || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = (file?.filename || file?.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(name);
}

function repoIsMarkdown(file, content) {
  const kind = (content?.kind || "").toLowerCase();
  if (kind === "markdown" || kind === "md") return true;
  const name = (file?.filename || file?.name || "").toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown");
}

function repoIsCsv(file, content) {
  const kind = (content?.kind || "").toLowerCase();
  if (kind === "csv" || kind === "tsv") return true;
  const name = (file?.filename || file?.name || "").toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".tsv");
}

function repoCsvDelimiter(file, content) {
  const kind = (content?.kind || "").toLowerCase();
  if (kind === "tsv") return "\t";
  const name = (file?.filename || file?.name || "").toLowerCase();
  return name.endsWith(".tsv") ? "\t" : ",";
}

function repoFileExtension(file) {
  const name = (file?.filename || file?.name || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
}

function repoIsTex(file) {
  const ext = repoFileExtension(file);
  if (ext === "tex") return true;
  const name = (file?.filename || file?.name || "").toLowerCase();
  return name.endsWith(".tex");
}

function repoIsHtmlLike(file) {
  const ext = repoFileExtension(file);
  return ext === "html" || ext === "htm" || ext === "xhtml";
}

function repoGetWordCount(file, content) {
  const raw = content?.word_count ?? file?.word_count;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function repoGetExtractedText(file, content) {
  return String(content?.extracted_text ?? file?.extracted_text ?? "").trim();
}

function repoIsLowWordCount(wc) {
  return wc == null || wc < 10;
}

function repoIsExtractableType(file, content) {
  const name = (file?.filename || file?.name || "").toLowerCase();
  const mime = (file?.mime_type || file?.mime || content?.mime || "").toLowerCase();
  if (/\.(pdf|docx?|png|jpe?g|gif|webp|svg|bmp|ico|mp3|mp4|wav|webm|mov|avi|heic|tiff?)$/.test(name)) return true;
  if (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")) return true;
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("document")) return true;
  const kind = (content?.kind || "").toLowerCase();
  return kind === "image" || kind === "pdf" || kind === "binary" || repoIsImage(file, content);
}

function repoShowExtractPanel(file) {
  if (!file || !REPO_CONTENT || REPO_CONTENT_LOADING) return false;
  if (!REPO_CONTENT.editable) return true;
  return repoIsLowWordCount(repoGetWordCount(file, REPO_CONTENT));
}

function repoSortedCategories() {
  return [...REPO_CATEGORIES].sort((a, b) => {
    const an = (a.name || "").toLowerCase();
    const bn = (b.name || "").toLowerCase();
    if (an === "docs") return -1;
    if (bn === "docs") return 1;
    return an.localeCompare(bn);
  });
}

function repoSupportsDocsMode(file, content) {
  if (!content?.editable) return false;
  if (repoIsCsv(file, content) || repoIsImage(file, content)) return false;
  const ext = repoFileExtension(file);
  if (["md", "markdown", "txt", "text", "tex", "html", "htm", "py"].includes(ext)) return true;
  if (repoIsMarkdown(file, content)) return true;
  const kind = (content?.kind || "").toLowerCase();
  return kind === "text" || kind === "markdown" || kind === "html";
}

function repoDefaultEditorMode(file) {
  if (repoIsTex(file) || repoIsPython(file)) return "code";
  return "docs";
}

function repoLoadModePreference(ext) {
  try {
    const raw = localStorage.getItem(REPO_MODE_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[ext] === "code" || map[ext] === "docs" ? map[ext] : null;
  } catch (_) {
    return null;
  }
}

function repoSaveModePreference(ext, mode) {
  try {
    const raw = localStorage.getItem(REPO_MODE_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[ext] = mode;
    localStorage.setItem(REPO_MODE_STORAGE_KEY, JSON.stringify(map));
  } catch (_) { /* ignore */ }
}

function repoResolveEditorMode(file) {
  const ext = repoFileExtension(file) || "txt";
  return repoLoadModePreference(ext) || repoDefaultEditorMode(file);
}

function repoCompactToolbarHtml(editableId) {
  return `
    <div class="repo-compact-toolbar" data-rich-for="${escapeHtml(editableId)}">
      <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
      <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
      <button type="button" data-cmd="formatBlock" data-value="h1" title="Heading 1">H1</button>
      <button type="button" data-cmd="formatBlock" data-value="h2" title="Heading 2">H2</button>
      <button type="button" data-cmd="insertUnorderedList" title="Bullet list">&bull; list</button>
      <button type="button" data-cmd="createLink" title="Insert link">Link</button>
    </div>`;
}

function repoDocsToolbarHtml(editableId) {
  if (typeof RICH_TOOLBAR_HTML !== "undefined") {
    return `<div class="repo-docs-toolbar-slot" data-rich-for="${escapeHtml(editableId)}">${RICH_TOOLBAR_HTML}</div>`;
  }
  return `<div class="repo-docs-toolbar-slot">${repoCompactToolbarHtml(editableId)}</div>`;
}

function repoTextToDocsContent(text, file) {
  const t = text || "";
  if (repoIsHtmlLike(file)) return t;
  if (repoIsMarkdown(file, REPO_CONTENT)) return repoSimpleMarkdown(t);
  return escapeHtml(t).replace(/\n/g, "<br>");
}

function repoDocsContentToText(el, file) {
  if (!el) return "";
  if (repoIsHtmlLike(file)) return el.innerHTML;
  return el.innerText || el.textContent || "";
}

function repoMarkDirty() {
  REPO_DIRTY = true;
  REPO_SAVE_STATE = "dirty";
  const saveBtn = document.getElementById("repo-save-btn");
  const indicator = document.getElementById("repo-saved-indicator");
  if (saveBtn) saveBtn.disabled = false;
  if (indicator) {
    indicator.textContent = repoSavedLabel();
    indicator.className = "repo-saved-indicator repo-saved-dirty";
  }
  repoScheduleAutosave();
}

function repoScheduleAutosave() {
  clearTimeout(REPO_AUTOSAVE_TIMER);
  REPO_AUTOSAVE_TIMER = setTimeout(() => {
    if (REPO_DIRTY && REPO_OPEN_ID && REPO_CONTENT?.editable) repoSaveFile();
  }, 800);
}

async function repoFlushAutosave({ keepalive = false } = {}) {
  clearTimeout(REPO_AUTOSAVE_TIMER);
  REPO_AUTOSAVE_TIMER = null;
  if (REPO_DIRTY && REPO_OPEN_ID && REPO_CONTENT?.editable) {
    await repoSaveFile({ keepalive });
  }
}

function repoEnsureAutosaveGuards() {
  if (window._repoAutosaveGuardsWired) return;
  window._repoAutosaveGuardsWired = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && REPO_DIRTY) repoFlushAutosave({ keepalive: true }).catch(() => {});
  });
  window.addEventListener("pagehide", () => {
    if (REPO_DIRTY) repoFlushAutosave({ keepalive: true }).catch(() => {});
  });
  window.addEventListener("beforeunload", () => {
    if (REPO_DIRTY) repoFlushAutosave({ keepalive: true }).catch(() => {});
  });
}

function repoParseCsv(text, delimiter) {
  const rows = [];
  const src = String(text || "");
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = "";
    } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (ch === "\r") i++;
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows.length ? rows : [[""]];
}

function repoSerializeCsv(rows, delimiter) {
  const delim = delimiter || ",";
  return (rows || []).map(r => (r || []).map(cell => {
    const s = String(cell ?? "");
    if (/[",\n\r\t]/.test(s) || (delim === "\t" && s.includes("\t"))) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(delim)).join("\n");
}

function repoSimpleMarkdown(text) {
  let html = escapeHtml(text || "");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^(?:-|\*) (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;
  return html;
}

function repoSavedLabel() {
  if (REPO_SAVE_STATE === "saving") return "Saving…";
  if (REPO_DIRTY || REPO_SAVE_STATE === "dirty") return "Unsaved";
  if (REPO_SAVE_STATE === "saved") return "Saved";
  return "";
}

function repoTotalCount() {
  return REPO_ALL_FILES.length || REPO_CATEGORIES.reduce((sum, c) => sum + (Number(c.count) || 0), 0);
}

function repoRenderKindTabs() {
  return `
    <nav class="repo-kind-tabs" id="repo-kind-tabs" aria-label="Repository file types">
      ${REPO_KINDS.map(item => {
        const count = REPO_ALL_FILES.filter(file => repoWorkspaceKind(file) === item.key).length;
        return `<button type="button" class="repo-kind-tab${REPO_KIND === item.key ? " active" : ""}" data-repo-kind="${item.key}" aria-selected="${REPO_KIND === item.key ? "true" : "false"}">${item.label}<span class="repo-kind-count">${count}</span></button>`;
      }).join("")}
    </nav>`;
}

function repoRenderCategoryRail() {
  const total = repoTotalCount();
  const allActive = !REPO_CATEGORY;
  const chips = [
    `<button type="button" class="repo-cat-chip${allActive ? " active" : ""}" data-repo-cat="">All <span class="repo-cat-count">${escapeHtml(String(total))}</span></button>`,
    ...repoSortedCategories().map(c => {
      const name = c.name || "Uncategorized";
      const active = REPO_CATEGORY === name;
      const docsHint = name === "Docs" ? ' title="Markdown &amp; text docs"' : "";
      return `<button type="button" class="repo-cat-chip${active ? " active" : ""}" data-repo-cat="${escapeHtml(name)}"${docsHint}>${escapeHtml(name)} <span class="repo-cat-count">${escapeHtml(String(c.count ?? 0))}</span></button>`;
    }),
  ];
  return `<div class="repo-cats" id="repo-cats">${chips.join("")}</div>`;
}

function repoRenderFileList() {
  const files = repoFlatFiles();
  if (!files.length) {
    return `<div class="repo-file-list" id="repo-file-list"><div class="repo-empty" style="margin:8px;">No ${escapeHtml(repoKindMeta().label.toLowerCase())} yet — create one or drop a file above.</div></div>`;
  }
  return `<div class="repo-file-list" id="repo-file-list">${files.map(file => {
    const id = file.id;
    const name = repoDisplayName(file);
    const category = file.category || "Uncategorized";
    const selected = String(REPO_OPEN_ID) === String(id);
    const wc = repoGetWordCount(file, null);
    const wcPart = wc != null ? ` · ${wc} words` : "";
    const stamp = file.created_at ? ` · ${repoFormatStamp(file.created_at)}` : "";
    return `
      <button type="button" class="repo-file-row${selected ? " selected" : ""}" data-repo-open="${escapeHtml(String(id))}">
        <span class="repo-file-row-name">${escapeHtml(name)}</span>
        <span class="repo-file-row-meta">${escapeHtml(category)} · ${escapeHtml(repoFormatSize(file.size_bytes ?? file.size))}${escapeHtml(wcPart)}${escapeHtml(stamp)}</span>
        <span class="repo-file-row-actions" onclick="event.stopPropagation()">
          <button type="button" class="secondary" data-repo-refile="${escapeHtml(String(id))}">Category</button>
          <button type="button" class="secondary" data-repo-delete="${escapeHtml(String(id))}">Delete</button>
        </span>
      </button>`;
  }).join("")}</div>`;
}

function repoRenderCsvTable(file) {
  const delim = repoCsvDelimiter(file, REPO_CONTENT);
  if (!REPO_CSV_ROWS) REPO_CSV_ROWS = repoParseCsv(REPO_CONTENT?.text || "", delim);
  const rows = REPO_CSV_ROWS;
  const head = rows[0] || [];
  const body = rows.slice(1);
  return `
    <div class="repo-csv-wrap" id="repo-csv-wrap">
      <table class="repo-csv-table" id="repo-csv-table">
        <thead><tr>${head.map((h, ci) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${body.map((row, ri) => `
          <tr>${head.map((_, ci) => `<td contenteditable="true" data-repo-csv-r="${ri + 1}" data-repo-csv-c="${ci}">${escapeHtml(row[ci] ?? "")}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function repoRenderExtractPanel(file) {
  if (!repoShowExtractPanel(file)) return "";
  const extracted = repoGetExtractedText(file, REPO_CONTENT);
  const wc = repoGetWordCount(file, REPO_CONTENT);
  const previewCap = 12000;
  const previewText = extracted
    ? extracted.slice(0, previewCap) + (extracted.length > previewCap ? `\n… (${extracted.length - previewCap} more characters — full text is indexed/available to Ask & Agent)` : "")
    : "(No extracted text yet — click Convert to text.)";
  const wcLabel = wc != null ? `${wc} words` : "—";
  return `
    <div class="repo-extract-panel" id="repo-extract-panel">
      <div class="repo-extract-head">
        <span class="repo-extract-title">Extracted text</span>
        <span class="repo-extract-wc">${escapeHtml(wcLabel)}</span>
      </div>
      <pre class="repo-extract-preview">${escapeHtml(previewText)}</pre>
      <div class="repo-extract-actions">
        <button type="button" class="primary" id="repo-extract-btn" ${REPO_EXTRACTING ? "disabled" : ""}>${REPO_EXTRACTING ? "Converting…" : "Convert to text"}</button>
        <button type="button" class="secondary" id="repo-promote-docs-btn" ${!extracted || REPO_EXTRACTING ? "disabled" : ""}>Promote to Docs</button>
      </div>
    </div>`;
}

function repoRenderDocsEditor(file, editorId, placeholder) {
  const html = repoTextToDocsContent(REPO_CONTENT?.text || "", file);
  return `
    <div class="repo-docs-wrap" id="repo-docs-wrap">
      ${repoDocsToolbarHtml(editorId)}
      <div class="repo-docs-scroll">
        <div id="${escapeHtml(editorId)}" class="rich-editable repo-docs-editor" contenteditable="true" spellcheck="true" data-placeholder="${escapeHtml(placeholder)}">${html}</div>
      </div>
    </div>`;
}

function repoRenderViewerBody(file) {
  if (REPO_CONTENT_LOADING) {
    return `<div class="repo-viewer-empty">Loading…</div>`;
  }
  if (!file) {
    return `<div class="repo-viewer-empty">Drop or pick a file — <strong>Docs</strong> mode is your writing surface for notes and markdown.<br><span style="font-size:11px;margin-top:8px;display:block;">Use <strong>Convert to text</strong> on PDFs, DOCX, and images · <strong>Ask your docs</strong> for grounded answers over extracted text.</span></div>`;
  }
  if (!REPO_CONTENT) {
    return `<div class="repo-viewer-empty">Could not load this file.<br><a class="secondary" href="/api/repo/files/${encodeURIComponent(file.id)}/raw" target="_blank" rel="noopener">Open raw</a></div>`;
  }
  const extractPanel = repoRenderExtractPanel(file);
  if (!REPO_CONTENT.editable) {
    let main = "";
    if (repoIsImage(file, REPO_CONTENT)) {
      main = `<div class="repo-binary-preview">
        <img src="/api/repo/files/${encodeURIComponent(file.id)}/raw" alt="${escapeHtml(file.filename || "")}">
        <a class="secondary" href="/api/repo/files/${encodeURIComponent(file.id)}/raw" target="_blank" rel="noopener">Open / download raw</a>
      </div>`;
    } else {
      main = `<div class="repo-binary-preview">
        <p style="margin:0;color:var(--ink-muted);font-size:13px;">Preview not available for this file type.</p>
        <a class="primary" href="/api/repo/files/${encodeURIComponent(file.id)}/raw" target="_blank" rel="noopener">Download / open raw</a>
      </div>`;
    }
    return extractPanel + main;
  }
  if (repoIsCsv(file, REPO_CONTENT)) {
    return extractPanel + repoRenderCsvTable(file);
  }
  const texTip = repoIsTex(file)
    ? `<p class="repo-overleaf-tip">Overleaf export — edit in <strong>Docs</strong> or <strong>Code</strong>; Code preserves LaTeX source best.</p>`
    : "";
  const showDocs = repoSupportsDocsMode(file, REPO_CONTENT) && REPO_EDITOR_MODE === "docs";
  if (showDocs) {
    return extractPanel + `${texTip}${repoRenderDocsEditor(file, "repo-docs-editor", "Start writing…")}`;
  }
  return extractPanel + `${texTip}<textarea class="repo-editor" id="repo-editor" spellcheck="false">${escapeHtml(REPO_CONTENT.text || "")}</textarea>`;
}

function repoRenderViewerToolbar(file) {
  if (!file) return "";
  const name = repoDisplayName(file);
  const extension = repoManagedExtension(file);
  const showSave = REPO_CONTENT?.editable;
  const showRun = repoIsPython(file);
  const showMode = repoSupportsDocsMode(file, REPO_CONTENT);
  const savedCls = REPO_DIRTY ? "repo-saved-dirty" : (REPO_SAVE_STATE === "saved" ? "repo-saved-ok" : "");
  const modeDocsActive = REPO_EDITOR_MODE === "docs" ? " active" : "";
  const modeCodeActive = REPO_EDITOR_MODE === "code" ? " active" : "";
  const extractLabel = REPO_EXTRACTING ? "Converting…" : "Convert to text";
  return `
    <div class="repo-viewer-toolbar" id="repo-viewer-toolbar">
      <span class="repo-viewer-title-label">Title</span>
      <input class="repo-viewer-title-input" id="repo-rename-input" value="${escapeHtml(name)}" aria-label="Rename file" title="Rename inline; Enter or blur to save">
      ${extension ? `<span class="repo-viewer-title-ext">${escapeHtml(extension)}</span>` : ""}
      <div class="repo-viewer-actions">
        ${showSave ? `<span class="repo-saved-indicator ${savedCls}" id="repo-saved-indicator">${escapeHtml(repoSavedLabel())}</span>` : ""}
        ${showMode ? `
          <div class="repo-mode-toggle" id="repo-mode-toggle">
            <button type="button" class="${modeDocsActive.trim()}" data-repo-mode="docs">Docs</button>
            <button type="button" class="${modeCodeActive.trim()}" data-repo-mode="code">Code</button>
          </div>` : ""}
        <button type="button" class="secondary" id="repo-extract-toolbar-btn" ${REPO_EXTRACTING ? "disabled" : ""} title="Extract or re-extract searchable text from this file">${extractLabel}</button>
        ${showMode && REPO_EDITOR_MODE === "docs" ? `<button type="button" class="secondary" id="repo-fullscreen-btn" title="Fullscreen writing mode">Fullscreen</button>` : ""}
        ${showSave ? `<button type="button" class="primary" id="repo-save-btn">Save</button>` : ""}
        ${showRun ? `<button type="button" class="secondary" id="repo-run-btn">Run</button>` : ""}
        ${showSave ? `<button type="button" class="secondary" id="repo-copy-btn" title="Copy all text">Copy all</button>` : ""}
        <button type="button" class="secondary" id="repo-ask-agent-btn" title="Open Agent tab with a prompt about this file">Ask Agent</button>
        <button type="button" class="secondary" id="repo-open-extension-btn" title="Treat this file as an agent extension surface">Open as extension</button>
        <button type="button" class="secondary" id="repo-plan-btn">Use for planning</button>
        ${showSave
          ? `<button type="button" class="secondary" id="repo-download-btn" title="Download current editor text">Download</button>`
          : `<a class="secondary" id="repo-download-btn" href="/api/repo/files/${encodeURIComponent(file.id)}/raw" download="${escapeHtml(name)}" target="_blank" rel="noopener">Download</a>`}
      </div>
    </div>`;
}

function repoRenderConsole() {
  if (!REPO_CONSOLE) return "";
  const { stdout, stderr, exit_code: code } = REPO_CONSOLE;
  return `
    <div class="repo-console" id="repo-console">
      ${stdout ? `<div>${escapeHtml(stdout)}</div>` : ""}
      ${stderr ? `<div class="repo-console-stderr">${escapeHtml(stderr)}</div>` : ""}
      ${!stdout && !stderr ? `<div style="color:var(--ink-muted);">(no output)</div>` : ""}
      ${code != null ? `<div class="repo-console-exit">exit ${escapeHtml(String(code))}</div>` : ""}
    </div>`;
}

function repoRenderProposals() {
  if (!REPO_PROPOSALS || !REPO_PROPOSALS.length) return "";
  const items = REPO_PROPOSALS.map((p, i) => {
    const type = (p.type || p.kind || "task").toLowerCase();
    const title = p.title || p.name || p.summary || "(untitled)";
    const detail = p.notes || p.description || p.date || "";
    return `
      <label class="repo-proposal-item">
        <input type="checkbox" class="repo-proposal-check" data-repo-proposal-idx="${i}" checked>
        <div class="repo-proposal-body">
          <div class="repo-proposal-type">${escapeHtml(type)}</div>
          <div>${escapeHtml(title)}</div>
          ${detail ? `<div style="font-size:11px;color:var(--ink-muted);margin-top:2px;">${escapeHtml(detail)}</div>` : ""}
        </div>
      </label>`;
  }).join("");
  return `
    <div class="repo-proposals" id="repo-proposals">
      <p class="repo-proposals-head">Proposals from this file</p>
      <p class="repo-proposals-hint">Nothing is added until you confirm.</p>
      ${items}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="primary" id="repo-proposals-confirm">Add selected</button>
        <button type="button" class="secondary" id="repo-proposals-dismiss">Dismiss</button>
      </div>
    </div>`;
}

function repoRenderViewer() {
  const file = REPO_OPEN_ID ? repoFileById(REPO_OPEN_ID) : null;
  return `
    <div class="repo-viewer" id="repo-viewer">
      ${repoRenderViewerToolbar(file)}
      <div class="repo-viewer-body" id="repo-viewer-body">${repoRenderViewerBody(file)}</div>
      ${repoRenderConsole()}
      ${repoRenderProposals()}
    </div>`;
}

function repoRenderWorkspace() {
  return `
    <div class="repo-workspace" id="repo-workspace">
      <aside class="repo-sidebar">
        <div class="repo-sidebar-head" id="repo-sidebar-head">Recent ${escapeHtml(repoKindMeta().label)}</div>
        ${repoRenderFileList()}
      </aside>
      ${repoRenderViewer()}
    </div>`;
}

function repoRenderGoogleCard() {
  const g = REPO_GOOGLE;
  const connected = g?.connected === true;
  const status = connected
    ? `<span class="pill status-good">Connected</span>`
    : `<span class="pill">${escapeHtml(g?.reason || "Not connected")}</span>`;
  return `
    <section class="repo-google-card" id="repo-google-card">
      <div class="repo-google-head">
        <h3 class="repo-google-title">Connect &amp; import from Google</h3>
        ${status}
      </div>
      ${connected
        ? `<p class="repo-google-note">Copies your Drive, Docs, and Sheets locally — originals untouched.</p>
           <button type="button" class="primary" id="repo-google-import" ${REPO_GOOGLE_IMPORTING ? "disabled" : ""}>${REPO_GOOGLE_IMPORTING ? "Importing…" : "Import from Google"}</button>`
        : `<p class="repo-google-note">Connect Google in <button type="button" class="secondary" id="repo-google-settings" style="font-size:11px;padding:2px 8px;">Settings → Integrations</button> to import Drive, Docs, and Sheets.</p>`}
    </section>`;
}

function repoRenderSearchResults() {
  if (REPO_SEARCHING) return `<div class="repo-empty">Searching…</div>`;
  if (!REPO_SEARCH_Q.trim()) return "";
  if (!REPO_SEARCH_RESULTS) return "";
  if (!REPO_SEARCH_RESULTS.length) return `<div class="repo-empty">No matches for "${escapeHtml(REPO_SEARCH_Q)}".</div>`;
  return `
    <div class="repo-search-results" id="repo-search-results">
      ${REPO_SEARCH_RESULTS.map(hit => `
        <div class="repo-search-hit" data-repo-search-open="${escapeHtml(String(hit.file_id ?? hit.id ?? ""))}" role="button" tabindex="0">
          <div class="repo-search-hit-head">
            <span class="repo-search-filename">${escapeHtml(hit.filename || "Untitled")}</span>
            <span class="repo-search-score">${hit.score != null ? escapeHtml(String(Math.round(hit.score * 100) / 100)) : ""}</span>
          </div>
          <div class="repo-search-snippet">${repoHighlightSnippet(hit.snippet || "", REPO_SEARCH_Q)}</div>
          <div style="margin-top:6px;"><span class="repo-badge" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid var(--gridline);">${escapeHtml(hit.category || "Uncategorized")}</span></div>
        </div>`).join("")}
    </div>`;
}

function repoRenderAskCard() {
  const answer = REPO_ASK_ANSWER;
  const results = Array.isArray(answer?.results) ? answer.results : [];
  return `
    <section class="repo-ask-card" id="repo-ask-card">
      <h3 class="repo-ask-title">Ask your docs</h3>
      <p class="repo-ask-hint">Grounded answers from extracted text in your repository — not just keyword hits. For a bigger private index (notes, Obsidian, days, chat) answered by local Ollama, use Settings → Local knowledge (RAG).</p>
      <div class="repo-ask-row">
        <input type="text" class="repo-search-input" id="repo-ask-input" placeholder="Ask a question about your files…" value="${escapeHtml(REPO_ASK_Q).replace(/"/g, "&quot;")}">
        <button type="button" class="primary" id="repo-ask-btn" ${REPO_ASKING ? "disabled" : ""}>${REPO_ASKING ? "Asking…" : "Ask"}</button>
      </div>
      ${REPO_OPEN_ID ? `
        <label class="repo-ask-scope">
          <input type="checkbox" id="repo-ask-this-file" ${REPO_ASK_THIS_FILE_ONLY ? "checked" : ""}>
          This file only
        </label>` : ""}
      ${REPO_ASK_ERROR ? `<div class="repo-ask-error">${escapeHtml(REPO_ASK_ERROR)}</div>` : ""}
      ${REPO_ASKING ? `<div class="repo-empty">Thinking…</div>` : ""}
      ${!REPO_ASKING && answer?.answer ? `
        <div class="repo-ask-answer">${escapeHtml(answer.answer)}</div>
        ${answer.grounded === false ? `<p class="repo-ask-ungrounded">Answer may not be fully grounded in your files.</p>` : ""}` : ""}
      ${!REPO_ASKING && results.length ? `
        <div class="repo-ask-sources">
          <div class="repo-ask-sources-head">Sources</div>
          ${results.map(hit => `
            <div class="repo-search-hit" data-repo-ask-open="${escapeHtml(String(hit.file_id ?? hit.id ?? ""))}" role="button" tabindex="0">
              <div class="repo-search-hit-head">
                <span class="repo-search-filename">${escapeHtml(hit.filename || "Untitled")}</span>
                <span class="repo-search-score">${hit.score != null ? escapeHtml(String(Math.round(hit.score * 100) / 100)) : ""}</span>
              </div>
              ${hit.snippet ? `<div class="repo-search-snippet">${escapeHtml(hit.snippet)}</div>` : ""}
            </div>`).join("")}
        </div>` : ""}
    </section>`;
}

function repoRenderVaultCard() {
  const notes = REPO_VAULT_NOTES || [];
  const list = notes.length
    ? `<div class="repo-vault-list">${notes.map(path => `
        <button type="button" class="repo-vault-note" data-repo-vault="${escapeHtml(path)}">
          <span>${escapeHtml(path)}</span>
          <span class="repo-vault-ext">open</span>
        </button>`).join("")}</div>`
    : `<p class="stub" style="margin:0;">${escapeHtml(REPO_VAULT_ERROR || "No vault notes listed yet — ping Obsidian or paste a vault path in Settings.")}</p>`;
  return `
    <section class="repo-vault-card" id="repo-vault-card">
      <div class="repo-vault-head">
        <h3 class="repo-vault-title">Obsidian extension</h3>
        <button type="button" class="secondary" id="repo-vault-refresh" ${REPO_VAULT_LOADING ? "disabled" : ""}>
          ${REPO_VAULT_LOADING ? "listing…" : "List vault"}
        </button>
      </div>
      <p class="stub" style="margin:0;line-height:1.45;">The vault is an extension the agent can open — same surface as this repository, not a separate app. Ask the agent to graph, search, or read a note.</p>
      ${REPO_VAULT_STATUS ? `<p class="stub" style="margin:0;">${escapeHtml(REPO_VAULT_STATUS)}</p>` : ""}
      ${list}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="secondary" id="repo-vault-ask">Ask agent to open vault</button>
      </div>
    </section>`;
}

function repoRenderSummary() {
  const s = REPO_SUMMARY || {};
  const summaryText = s.summary || "No overview yet — store a few files, then regenerate.";
  const cats = (s.categories || REPO_CATEGORIES || []).map(c =>
    `<span class="repo-summary-stat">${escapeHtml(c.name || "?")}: ${escapeHtml(String(c.count ?? 0))}</span>`
  ).join("");
  const stamp = s.generated_at ? repoFormatStamp(s.generated_at) : "—";
  return `
    <section class="repo-summary${REPO_SUMMARY_OPEN ? " repo-summary-open" : ""}" id="repo-summary-panel">
      <div class="repo-summary-head" id="repo-summary-toggle">
        <h3>Master overview</h3>
        <span class="stub" style="margin:0; font-size:11px;">${escapeHtml(stamp)}</span>
      </div>
      <div class="repo-summary-body">
        <div class="repo-summary-text">${escapeHtml(summaryText)}</div>
        <div class="repo-summary-stats">
          <span class="repo-summary-stat">${escapeHtml(String(s.total_files ?? repoTotalCount()))} files</span>
          ${s.total_words != null ? `<span class="repo-summary-stat">${escapeHtml(String(s.total_words))} words</span>` : ""}
          ${cats}
        </div>
        <div style="margin-top:10px;">
          <button type="button" class="secondary" id="repo-summary-regen">Regenerate</button>
        </div>
      </div>
    </section>`;
}

function repoRenderConversations() {
  if (!REPO_CONV_OPEN) {
    return `<button type="button" class="repo-section-toggle" id="repo-conv-toggle">Conversation archive <span>▸</span></button>`;
  }
  const sources = ["", "agent", "code"];
  const filterChips = sources.map(src => {
    const label = src ? src : "All";
    const active = REPO_CONV_SOURCE === src;
    return `<button type="button" class="repo-conv-filter${active ? " active" : ""}" data-repo-conv-src="${escapeHtml(src)}">${escapeHtml(label)}</button>`;
  }).join("");
  const grouped = {};
  for (const c of REPO_CONVERSATIONS) {
    const src = c.source || "unknown";
    if (!grouped[src]) grouped[src] = [];
    grouped[src].push(c);
  }
  const srcKeys = Object.keys(grouped).sort();
  const body = srcKeys.length
    ? srcKeys.map(src => `
        <div class="repo-conv-group">
          <h4 class="repo-conv-group-title">${escapeHtml(src)}</h4>
          ${grouped[src].map(c => `
            <div class="repo-conv-item">
              <div class="repo-conv-meta">${escapeHtml(repoFormatStamp(c.created_at || c.updated_at))}${c.title ? ` · ${escapeHtml(c.title)}` : ""}</div>
              <div class="repo-conv-preview">${escapeHtml(c.preview || c.summary || c.last_message || "")}</div>
            </div>`).join("")}
        </div>`).join("")
    : `<div class="repo-empty">No conversations recorded yet.</div>`;
  return `
    <div>
      <button type="button" class="repo-section-toggle" id="repo-conv-toggle">Conversation archive <span>▾</span></button>
      <div class="repo-conv-panel" id="repo-conv-panel">
        <p class="stub" style="margin:0 0 8px;">Every conversation is recorded locally.</p>
        <div class="repo-conv-filters">${filterChips}</div>
        ${body}
      </div>
    </div>`;
}

async function repoRefreshData() {
  await Promise.all([
    repoLoadCategories(),
    repoLoadFiles(),
    repoLoadSummary(false),
    repoLoadGoogle(),
  ]);
  if (REPO_CONV_OPEN) await repoLoadConversations();
}

async function repoLoadCategories() {
  try {
    const data = await repoFetchJson("/api/repo/categories");
    if (Array.isArray(data)) REPO_CATEGORIES = data;
  } catch (_) { /* keep prior */ }
}

async function repoLoadFiles() {
  try {
    const params = new URLSearchParams({ limit: "500" });
    if (REPO_CATEGORY) params.set("category", REPO_CATEGORY);
    const data = await repoFetchJson(`/api/repo/files?${params}`);
    REPO_ALL_FILES = Array.isArray(data) ? data : [];
    repoApplyKindFilter();
  } catch (_) {
    REPO_ALL_FILES = [];
    REPO_FILES = [];
  }
}

async function repoLoadSummary(force) {
  try {
    const data = await repoFetchJson(`/api/repo/summary?force=${force ? 1 : 0}`);
    if (data && typeof data === "object") REPO_SUMMARY = data;
  } catch (_) { /* keep prior */ }
}

async function repoLoadConversations() {
  try {
    const params = new URLSearchParams({ limit: "100" });
    if (REPO_CONV_SOURCE) params.set("source", REPO_CONV_SOURCE);
    const data = await repoFetchJson(`/api/conversations?${params}`);
    REPO_CONVERSATIONS = Array.isArray(data) ? data : [];
  } catch (_) {
    REPO_CONVERSATIONS = [];
  }
}

async function repoLoadGoogle() {
  try {
    const data = await repoFetchJson("/api/repo/google/available");
    REPO_GOOGLE = data && typeof data === "object" ? data : { connected: false, reason: "Not available" };
  } catch (_) {
    REPO_GOOGLE = { connected: false, reason: "Could not check status" };
  }
}

async function repoLoadContent(fileId) {
  REPO_CONTENT_LOADING = true;
  REPO_CONTENT = null;
  REPO_CSV_ROWS = null;
  REPO_CONSOLE = null;
  const file = repoFileById(fileId);
  REPO_EDITOR_MODE = file ? repoResolveEditorMode(file) : "docs";
  repoPatchViewer();
  try {
    const data = await repoFetchJson(`/api/repo/files/${encodeURIComponent(fileId)}/content`);
    if (!data) {
      const file = repoFileById(fileId);
      const fallback = await repoFetchJson(`/api/repo/files/${encodeURIComponent(fileId)}`);
      if (fallback?.text_preview != null) {
        REPO_CONTENT = { text: fallback.text_preview, editable: false, kind: "text" };
      } else if (file) {
        REPO_CONTENT = null;
      }
    } else {
      REPO_CONTENT = data;
    }
    REPO_DIRTY = false;
    REPO_SAVE_STATE = "";
    if (repoIsCsv(repoFileById(fileId), REPO_CONTENT)) {
      REPO_CSV_ROWS = repoParseCsv(REPO_CONTENT?.text || "", repoCsvDelimiter(repoFileById(fileId), REPO_CONTENT));
    }
  } catch (_) {
    REPO_CONTENT = null;
  } finally {
    REPO_CONTENT_LOADING = false;
    repoPatchViewer();
  }
}

async function repoOpenFile(fileId, opts = {}) {
  const id = fileId != null ? String(fileId) : null;
  if (!id) return;
  if (!opts.force && REPO_DIRTY) {
    await repoFlushAutosave();
    if (REPO_DIRTY && !confirm("Save failed. Open another file anyway?")) return;
  }
  if (REPO_DOCS_FULLSCREEN) repoCloseDocsFullscreen();
  clearTimeout(REPO_AUTOSAVE_TIMER);
  const opening = repoFileById(id);
  if (opening) {
    REPO_KIND = repoWorkspaceKind(opening);
    repoApplyKindFilter();
  }
  REPO_OPEN_ID = id;
  REPO_DIRTY = false;
  REPO_SAVE_STATE = "";
  REPO_PROPOSALS = null;
  REPO_PROPOSAL_FILE_ID = null;
  repoSetStoredOpenId(id);
  repoPatchFileList();
  repoPatchRootClass();
  repoPatchAskCard();
  await repoLoadContent(id);
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-repo-open="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function repoCollectEditorText() {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file || !REPO_CONTENT?.editable) return REPO_CONTENT?.text || "";
  if (repoIsCsv(file, REPO_CONTENT)) {
    const table = document.getElementById("repo-csv-table");
    if (!table) return REPO_CONTENT.text || "";
    const delim = repoCsvDelimiter(file, REPO_CONTENT);
    const headCells = [...table.querySelectorAll("thead th")].map(th => th.textContent);
    const bodyRows = [...table.querySelectorAll("tbody tr")].map(tr =>
      [...tr.querySelectorAll("td")].map(td => td.textContent)
    );
    return repoSerializeCsv([headCells, ...bodyRows], delim);
  }
  if (repoSupportsDocsMode(file, REPO_CONTENT) && REPO_EDITOR_MODE === "docs") {
    const fsEl = document.getElementById("repo-docs-fullscreen-editor");
    const docsEl = document.getElementById("repo-docs-editor");
    const el = (REPO_DOCS_FULLSCREEN && fsEl) ? fsEl : docsEl;
    if (el) return repoDocsContentToText(el, file);
  }
  const editor = document.getElementById("repo-editor");
  if (editor) return editor.value;
  return REPO_CONTENT.text || "";
}

function repoSyncDocsEditors(fromId, toId) {
  const from = document.getElementById(fromId);
  const to = document.getElementById(toId);
  if (from && to && from.innerHTML !== to.innerHTML) to.innerHTML = from.innerHTML;
}

function repoCloseDocsFullscreen() {
  if (!REPO_DOCS_FULLSCREEN) return;
  repoSyncDocsEditors("repo-docs-fullscreen-editor", "repo-docs-editor");
  REPO_DOCS_FULLSCREEN = false;
  const overlay = document.getElementById("repo-docs-fs-overlay");
  overlay?.remove();
  document.body.style.overflow = "";
  repoPatchViewerToolbar();
  repoFlushAutosave().catch(() => {});
}

function repoOpenDocsFullscreen() {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file || REPO_EDITOR_MODE !== "docs") return;
  if (REPO_DOCS_FULLSCREEN) return;
  REPO_DOCS_FULLSCREEN = true;
  const inline = document.getElementById("repo-docs-editor");
  const content = inline ? inline.innerHTML : repoTextToDocsContent(REPO_CONTENT?.text || "", file);
  const name = file.filename || file.name || "Untitled";
  const overlay = document.createElement("div");
  overlay.id = "repo-docs-fs-overlay";
  overlay.className = "repo-docs-fs-overlay";
  overlay.innerHTML = `
    <div class="repo-docs-fs-head">
      <div class="repo-docs-fs-title">${escapeHtml(name)}</div>
      <span class="repo-saved-indicator${REPO_DIRTY ? " repo-saved-dirty" : (REPO_SAVE_STATE === "saved" ? " repo-saved-ok" : "")}" id="repo-fs-saved-indicator">${escapeHtml(repoSavedLabel())}</span>
      <span class="repo-docs-fs-hint">Esc to exit · unsaved edits sync when you close</span>
      <button type="button" class="secondary" id="repo-fs-copy-btn" title="Copy current editor text">Copy all</button>
      <button type="button" class="secondary" id="repo-fs-download-btn" title="Download current editor text">Download</button>
      <button type="button" class="secondary" id="repo-fs-size-btn">Default size</button>
      <button type="button" class="primary" id="repo-fs-save-btn">Save</button>
      <button type="button" class="secondary" id="repo-fs-close-btn">Exit</button>
    </div>
    ${repoDocsToolbarHtml("repo-docs-fullscreen-editor")}
    <div class="repo-docs-fs-inner">
      <div class="repo-docs-fs-page">
        <div id="repo-docs-fullscreen-editor" class="rich-editable repo-docs-editor" contenteditable="true" spellcheck="true">${content}</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  wireRepositoryDocsEditor("repo-docs-fullscreen-editor");
  document.getElementById("repo-fs-close-btn")?.addEventListener("click", () => repoCloseDocsFullscreen());
  document.getElementById("repo-fs-copy-btn")?.addEventListener("click", () => repoCopyOpenFile());
  document.getElementById("repo-fs-download-btn")?.addEventListener("click", () => repoDownloadCurrentText());
  document.getElementById("repo-fs-size-btn")?.addEventListener("click", e => {
    const isDefault = overlay.classList.toggle("repo-docs-fs-overlay--default");
    e.currentTarget.textContent = isDefault ? "Full screen" : "Default size";
  });
  document.getElementById("repo-fs-save-btn")?.addEventListener("click", () => repoSaveFile());
  if (!window._repoFsEscBound) {
    window._repoFsEscBound = true;
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && REPO_DOCS_FULLSCREEN) {
        e.preventDefault();
        repoCloseDocsFullscreen();
      }
    });
  }
  document.getElementById("repo-docs-fullscreen-editor")?.focus();
}

async function repoCopyOpenFile() {
  const text = repoCollectEditorText();
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "good");
  } catch (_) {
    showToast("Could not copy", "bad");
  }
}

function repoDownloadCurrentText() {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file) return;
  const text = repoCollectEditorText();
  const name = file.filename || file.name || "download.txt";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function repoSaveFile({ keepalive = false } = {}) {
  if (!REPO_OPEN_ID || !REPO_CONTENT?.editable) return;
  const text = repoCollectEditorText();
  if (!REPO_DIRTY && text === (REPO_CONTENT.text || "")) {
    REPO_SAVE_STATE = "saved";
    repoPatchViewerToolbar();
    return;
  }
  REPO_SAVE_STATE = "saving";
  repoPatchViewerToolbar();
  try {
    const res = await fetch(`/api/repo/files/${encodeURIComponent(REPO_OPEN_ID)}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      keepalive,
    });
    if (res.status === 404) {
      showToast("Save not available yet", "info");
      REPO_SAVE_STATE = "";
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    REPO_CONTENT = { ...REPO_CONTENT, text };
    REPO_DIRTY = false;
    REPO_SAVE_STATE = "saved";
    showToast("Saved", "good");
    repoPatchViewerToolbar();
    const fsInd = document.getElementById("repo-fs-saved-indicator");
    if (fsInd) {
      fsInd.textContent = repoSavedLabel();
      fsInd.className = "repo-saved-indicator repo-saved-ok";
    }
    setTimeout(() => {
      if (!REPO_DIRTY && REPO_SAVE_STATE === "saved") {
        REPO_SAVE_STATE = "";
        repoPatchViewerToolbar();
      }
    }, 2000);
  } catch (err) {
    REPO_SAVE_STATE = "dirty";
    showToast(`Save failed: ${errorMessage(err)}`, "bad");
    repoPatchViewerToolbar();
  }
}

async function repoRenameOpenFile(title) {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file) return;
  const next = String(title || "").trim();
  if (!next || next === repoDisplayName(file)) {
    repoPatchViewerToolbar();
    return;
  }
  try {
    const res = await fetch(`/api/repo/files/${encodeURIComponent(file.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated = await res.json();
    const idx = REPO_ALL_FILES.findIndex(item => String(item.id) === String(file.id));
    if (idx >= 0) REPO_ALL_FILES[idx] = { ...REPO_ALL_FILES[idx], ...updated };
    if (REPO_CONTENT) REPO_CONTENT = { ...REPO_CONTENT, filename: updated.filename };
    repoApplyKindFilter();
    repoPatchFileList();
    repoPatchViewerToolbar();
    showToast("Renamed", "good");
  } catch (err) {
    repoPatchViewerToolbar();
    showToast(`Rename failed: ${errorMessage(err)}`, "bad");
  }
}

async function repoRunFile() {
  if (!REPO_OPEN_ID || !repoIsPython(repoFileById(REPO_OPEN_ID))) return;
  if (!confirm("Run this Python file locally?")) return;
  const btn = document.getElementById("repo-run-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Running…"; }
  try {
    const res = await fetch(`/api/repo/files/${encodeURIComponent(REPO_OPEN_ID)}/run`, { method: "POST" });
    if (res.status === 404) {
      showToast("Run not available yet", "info");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    REPO_CONSOLE = await res.json();
    repoPatchConsole();
  } catch (err) {
    showToast(`Run failed: ${errorMessage(err)}`, "bad");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Run"; }
  }
}

async function repoRequestPlanning() {
  if (!REPO_OPEN_ID) return;
  const intent = prompt("What should this file help you plan?", "Turn notes into tasks and schedule");
  if (intent == null || !intent.trim()) return;
  const btn = document.getElementById("repo-plan-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Thinking…"; }
  try {
    const res = await fetch(`/api/repo/files/${encodeURIComponent(REPO_OPEN_ID)}/use-for-planning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: intent.trim() }),
    });
    if (res.status === 404) {
      showToast("Planning from files is not available yet", "info");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const proposals = Array.isArray(data?.proposals) ? data.proposals : (Array.isArray(data) ? data : []);
    REPO_PROPOSALS = proposals;
    REPO_PROPOSAL_FILE_ID = REPO_OPEN_ID;
    repoPatchProposals();
    if (!proposals.length) showToast("No proposals returned", "info");
  } catch (err) {
    showToast(`Planning failed: ${errorMessage(err)}`, "bad");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Use for planning"; }
  }
}

async function repoConfirmProposals() {
  if (!REPO_PROPOSALS?.length) return;
  const checks = [...document.querySelectorAll(".repo-proposal-check:checked")];
  const selected = checks.map(cb => REPO_PROPOSALS[Number(cb.dataset.repoProposalIdx)]).filter(Boolean);
  if (!selected.length) {
    showToast("Select at least one proposal", "info");
    return;
  }
  let added = 0;
  for (const p of selected) {
    const type = (p.type || p.kind || "task").toLowerCase();
    try {
      if (type === "day") {
        const date = p.date || p.day || localYmd();
        await api(`/api/day/${date}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quiet: true,
            metrics: p.metrics || { notes: p.title || p.notes || "" },
            hours: p.hours || {},
          }),
        });
      } else {
        await api("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: p.title || p.name || "New task",
            urgency: p.urgency || "medium",
            due_date: p.due_date || null,
            notes: p.notes || p.description || null,
            category: p.category || null,
          }),
        });
      }
      added++;
    } catch (err) {
      showToast(`Could not add: ${errorMessage(err)}`, "bad");
    }
  }
  if (added) {
    showToast(`Added ${added} item${added === 1 ? "" : "s"}`, "good");
    REPO_PROPOSALS = null;
    REPO_PROPOSAL_FILE_ID = null;
    repoPatchProposals();
  }
}

async function repoImportGoogle() {
  REPO_GOOGLE_IMPORTING = true;
  repoPatchGoogleCard();
  try {
    const res = await fetch("/api/repo/google/import", { method: "POST" });
    if (res.status === 404) {
      showToast("Google import not available yet", "info");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || data?.needs_auth) {
      showToast("Reconnect Google in Settings → Integrations", "info");
      return;
    }
    if (!res.ok) throw new Error(data?.error || await res.text());
    const counts = data?.counts;
    const msg = counts
      ? `Imported ${counts.files ?? counts.total ?? "?"} file(s) from Google`
      : "Import complete";
    showToast(msg, "good");
    await repoRefreshData();
    repoPatchDom();
  } catch (err) {
    showToast(`Import failed: ${errorMessage(err)}`, "bad");
  } finally {
    REPO_GOOGLE_IMPORTING = false;
    repoPatchGoogleCard();
  }
}

async function repoUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;
  REPO_UPLOADING = true;
  const statusEl = document.getElementById("repo-drop-status");
  if (statusEl) statusEl.textContent = `Storing ${files.length} file${files.length === 1 ? "" : "s"}…`;
  const form = new FormData();
  files.forEach(f => form.append("files", f));
  try {
    const res = await fetch("/api/repo/files", { method: "POST", body: form });
    if (res.status === 404) {
      showToast("Repository storage is not available yet", "info");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    showToast(`Stored ${files.length} file${files.length === 1 ? "" : "s"}`, "good");
    await repoRefreshData();
    repoPatchDom();
    const uploaded = data?.files?.[0] || data?.results?.find(r => r.ok)?.row;
    if (uploaded?.id != null) await repoOpenFile(uploaded.id, { force: true });
  } catch (err) {
    showToast(`Upload failed: ${errorMessage(err)}`, "bad");
  } finally {
    REPO_UPLOADING = false;
    if (statusEl) statusEl.textContent = "";
  }
}

async function repoRunSearch(query) {
  const q = (query || "").trim();
  REPO_SEARCH_Q = q;
  REPO_SEARCH_RESULTS = null;
  if (!q) {
    repoPatchSearchResults();
    return;
  }
  REPO_SEARCHING = true;
  repoPatchSearchResults();
  try {
    const data = await repoFetchJson("/api/repo/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    REPO_SEARCH_RESULTS = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
  } catch (_) {
    REPO_SEARCH_RESULTS = [];
  } finally {
    REPO_SEARCHING = false;
    repoPatchSearchResults();
  }
}

async function repoCreateNewFile(kind = REPO_KIND) {
  const meta = repoKindMeta(kind);
  try {
    const res = await fetch("/api/repo/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: meta.key, title: `Untitled ${meta.singular}` }),
    });
    if (res.status === 404) {
      showToast("Create is not available yet", "info");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));
    const row = data?.row;
    if (!row?.id) {
      showToast(`Could not create ${meta.singular.toLowerCase()}`, "bad");
      return;
    }
    REPO_KIND = meta.key;
    showToast(`New ${meta.singular.toLowerCase()} created`, "good");
    await repoRefreshData();
    repoPatchDom();
    await repoOpenFile(row.id, { force: true });
    const rename = document.getElementById("repo-rename-input");
    rename?.focus();
    rename?.select();
  } catch (err) {
    showToast(`Create failed: ${errorMessage(err)}`, "bad");
  }
}

async function repoCreateNewDoc() {
  return repoCreateNewFile("docs");
}

async function repoExtractText() {
  if (!REPO_OPEN_ID || REPO_EXTRACTING) return;
  REPO_EXTRACTING = true;
  repoPatchViewerToolbar();
  const panel = document.getElementById("repo-extract-panel");
  if (panel) {
    const btn = document.getElementById("repo-extract-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Converting…"; }
  }
  try {
    const res = await fetch(`/api/repo/files/${encodeURIComponent(REPO_OPEN_ID)}/extract`, { method: "POST" });
    if (res.status === 404) {
      showToast("Convert to text not available yet", "info");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));
    if (data?.ok === false) throw new Error(data?.error || "Extract failed");
    const row = data?.row;
    if (row) {
      const idx = REPO_FILES.findIndex(f => String(f.id) === String(REPO_OPEN_ID));
      if (idx >= 0) REPO_FILES[idx] = { ...REPO_FILES[idx], ...row };
    }
    await repoLoadContent(REPO_OPEN_ID);
    await repoLoadFiles();
    repoPatchFileList();
    const wc = repoGetWordCount(repoFileById(REPO_OPEN_ID), REPO_CONTENT);
    showToast(`Extracted${wc != null ? ` — ${wc} words` : ""}`, "good");
  } catch (err) {
    showToast(`Convert failed: ${errorMessage(err)}`, "bad");
  } finally {
    REPO_EXTRACTING = false;
    repoPatchViewer();
  }
}

async function repoPromoteToDocs() {
  if (!REPO_OPEN_ID) return;
  const btn = document.getElementById("repo-promote-docs-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Promoting…"; }
  try {
    const res = await fetch(`/api/repo/files/${encodeURIComponent(REPO_OPEN_ID)}/promote-docs`, { method: "POST" });
    if (res.status === 404) {
      showToast("Promote to Docs not available yet", "info");
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));
    const row = data?.row;
    if (!row?.id) throw new Error("No doc returned");
    showToast("Promoted to Docs", "good");
    await repoRefreshData();
    repoPatchDom();
    REPO_EDITOR_MODE = "docs";
    await repoOpenFile(row.id, { force: true });
  } catch (err) {
    showToast(`Promote failed: ${errorMessage(err)}`, "bad");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Promote to Docs"; }
  }
}

async function repoRunAsk(query) {
  const q = (query || "").trim();
  REPO_ASK_Q = q;
  REPO_ASK_ERROR = "";
  if (!q) {
    REPO_ASK_ANSWER = null;
    repoPatchAskCard();
    return;
  }
  REPO_ASKING = true;
  REPO_ASK_ANSWER = null;
  repoPatchAskCard();
  try {
    const body = { query: q, k: 8 };
    if (REPO_ASK_THIS_FILE_ONLY && REPO_OPEN_ID) body.file_id = REPO_OPEN_ID;
    const res = await fetch("/api/repo/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 404) {
      REPO_ASK_ERROR = "Ask your docs is not available yet.";
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));
    REPO_ASK_ANSWER = {
      answer: data?.answer ?? "",
      results: Array.isArray(data?.results) ? data.results : [],
      grounded: data?.grounded,
    };
  } catch (err) {
    REPO_ASK_ERROR = errorMessage(err);
    REPO_ASK_ANSWER = null;
  } finally {
    REPO_ASKING = false;
    repoPatchAskCard();
  }
}

function repoPatchRootClass() {
  const root = document.querySelector(".repo-root");
  if (root) root.classList.toggle("repo-has-open", !!REPO_OPEN_ID);
}

function repoPatchFileList() {
  const list = document.getElementById("repo-file-list");
  if (list) list.outerHTML = repoRenderFileList();
  const tabs = document.getElementById("repo-kind-tabs");
  if (tabs) tabs.outerHTML = repoRenderKindTabs();
  const head = document.getElementById("repo-sidebar-head");
  if (head) head.textContent = `Recent ${repoKindMeta().label}`;
  wireRepositoryFileActions();
  wireRepositoryKindTabs();
}

function repoPatchViewerToolbar() {
  const viewer = document.getElementById("repo-viewer");
  const file = REPO_OPEN_ID ? repoFileById(REPO_OPEN_ID) : null;
  const html = file ? repoRenderViewerToolbar(file) : "";
  const tb = document.getElementById("repo-viewer-toolbar");
  if (!html) {
    if (tb) tb.remove();
    wireRepositoryViewerToolbar();
    return;
  }
  if (tb) tb.outerHTML = html;
  else if (viewer) {
    const body = document.getElementById("repo-viewer-body");
    if (body) body.insertAdjacentHTML("beforebegin", html);
    else viewer.insertAdjacentHTML("afterbegin", html);
  }
  wireRepositoryViewerToolbar();
}

function repoPatchViewerBody() {
  const body = document.getElementById("repo-viewer-body");
  const file = REPO_OPEN_ID ? repoFileById(REPO_OPEN_ID) : null;
  if (body) body.innerHTML = repoRenderViewerBody(file);
  wireRepositoryEditor();
  wireRepositoryExtractPanel();
}

function repoPatchViewer() {
  repoPatchViewerToolbar();
  repoPatchViewerBody();
  repoPatchConsole();
  repoPatchProposals();
}

function repoPatchConsole() {
  const viewer = document.getElementById("repo-viewer");
  const existing = document.getElementById("repo-console");
  if (REPO_CONSOLE) {
    const html = repoRenderConsole();
    if (existing) existing.outerHTML = html;
    else {
      const proposals = document.getElementById("repo-proposals");
      if (proposals) proposals.insertAdjacentHTML("beforebegin", html);
      else viewer?.insertAdjacentHTML("beforeend", html);
    }
  } else if (existing) existing.remove();
}

function repoPatchProposals() {
  const viewer = document.getElementById("repo-viewer");
  const existing = document.getElementById("repo-proposals");
  if (REPO_PROPOSALS?.length) {
    const html = repoRenderProposals();
    if (existing) existing.outerHTML = html;
    else viewer?.insertAdjacentHTML("beforeend", html);
    wireRepositoryProposals();
  } else if (existing) existing.remove();
}

function repoPatchGoogleCard() {
  const card = document.getElementById("repo-google-card");
  if (card) card.outerHTML = repoRenderGoogleCard();
  wireRepositoryGoogle();
}

function repoPatchSearchResults() {
  const slot = document.getElementById("repo-search-slot");
  if (slot) slot.innerHTML = repoRenderSearchResults();
  wireRepositorySearchHits();
}

function repoPatchAskCard() {
  const card = document.getElementById("repo-ask-card");
  if (card) card.outerHTML = repoRenderAskCard();
  wireRepositoryAsk();
}

function repoPatchDom() {
  repoPatchFileList();
  const summary = document.getElementById("repo-summary-panel");
  if (summary) summary.outerHTML = repoRenderSummary();
  const google = document.getElementById("repo-google-card");
  if (google) google.outerHTML = repoRenderGoogleCard();
  repoPatchViewer();
  repoPatchRootClass();
  wireRepository();
}

async function renderRepository() {
  repoEnsureStyles();
  const stored = repoGetStoredOpenId();
  if (stored) REPO_OPEN_ID = stored;
  await repoRefreshData();
  if (REPO_OPEN_ID && repoFileById(REPO_OPEN_ID)) {
    REPO_KIND = repoWorkspaceKind(repoFileById(REPO_OPEN_ID));
    repoApplyKindFilter();
  }
  if (REPO_OPEN_ID && !repoFileById(REPO_OPEN_ID)) {
    try {
      const all = await repoFetchJson("/api/repo/files");
      if (Array.isArray(all)) {
        const hit = all.find(f => String(f.id) === String(REPO_OPEN_ID));
        if (hit) REPO_FILES = all;
        else REPO_OPEN_ID = null;
      }
    } catch (_) {
      REPO_OPEN_ID = null;
    }
  }
  const html = `
    <div class="repo-root${REPO_OPEN_ID ? " repo-has-open" : ""}">
      <header class="repo-hero">
        <h2 class="repo-hero-title">Repository</h2>
        <p class="repo-hero-copy">Create and reopen recent docs, sheets, and slides — or drop any file. Obsidian is an extension of this workspace the agent can open.</p>
      </header>
      ${repoRenderKindTabs()}
      <div class="repo-chrome-compact">
        <div class="repo-drop" id="repo-drop-zone">
          <p class="repo-drop-title">Drop files here</p>
          <p class="repo-drop-hint">Any file type — PDFs, DOCX, images, Overleaf <strong>.tex</strong> — stored locally for Docs, search, and RAG.</p>
          <div class="repo-drop-actions">
            <div class="repo-create-wrap">
              <button type="button" class="primary" id="repo-create-btn" aria-haspopup="menu" aria-expanded="false">+ Create</button>
              <div class="repo-create-menu" id="repo-create-menu" role="menu" hidden>
                ${REPO_KINDS.map(item => `<button type="button" class="repo-create-option" data-repo-create-kind="${item.key}" role="menuitem">${item.singular}</button>`).join("")}
              </div>
            </div>
            <button type="button" class="secondary" id="repo-choose-files">Upload files</button>
            <input type="file" id="repo-file-input" multiple hidden>
          </div>
          <div class="repo-drop-status" id="repo-drop-status">${REPO_UPLOADING ? "Storing files…" : ""}</div>
        </div>
        ${repoRenderGoogleCard()}
        ${repoRenderVaultCard()}
        <div class="repo-retrieval-row">
          <div class="repo-search-wrap">
            <div class="repo-search-row">
              <input type="search" class="repo-search-input" id="repo-search-input" placeholder="Search everything you've stored…" value="${escapeHtml(REPO_SEARCH_Q).replace(/"/g, "&quot;")}">
              <button type="button" class="primary" id="repo-search-btn">Search</button>
            </div>
            <span class="repo-search-hint">Keyword retrieval over extracted text — use <strong>Ask your docs</strong> for a synthesized answer.</span>
            <div id="repo-search-slot">${repoRenderSearchResults()}</div>
          </div>
          ${repoRenderAskCard()}
        </div>
        ${repoRenderSummary()}
      </div>
      ${repoRenderWorkspace()}
      <div id="repo-conv-wrap">${repoRenderConversations()}</div>
      ${typeof renderNtsCaptureConnect === "function" ? renderNtsCaptureConnect("Repository") : ""}
    </div>`;
  if (REPO_OPEN_ID) {
    setTimeout(() => repoLoadContent(REPO_OPEN_ID), 0);
  }
  return html;
}

function repoNavigateFile(delta) {
  const files = repoFlatFiles();
  if (!files.length) return;
  let idx = files.findIndex(f => String(f.id) === String(REPO_OPEN_ID));
  if (idx < 0) idx = 0;
  else idx = Math.max(0, Math.min(files.length - 1, idx + delta));
  repoOpenFile(files[idx].id);
}

function repoSwitchEditorMode(mode) {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file || !REPO_CONTENT?.editable || !repoSupportsDocsMode(file, REPO_CONTENT)) return;
  if (mode !== "docs" && mode !== "code") return;
  if (mode === REPO_EDITOR_MODE) return;
  const text = repoCollectEditorText();
  REPO_CONTENT = { ...REPO_CONTENT, text };
  if (REPO_DOCS_FULLSCREEN) repoCloseDocsFullscreen();
  REPO_EDITOR_MODE = mode;
  repoSaveModePreference(repoFileExtension(file) || "txt", mode);
  repoPatchViewer();
}

function repoInsertSheetBlock(editable) {
  const html = `<table class="repo-sheet" data-sheet="1" data-compat="csv,gsheet" style="width:100%;border-collapse:collapse;margin:8px 0;">
    <thead><tr><th contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;">A</th><th contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;">B</th><th contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;">C</th></tr></thead>
    <tbody>
      <tr><td contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;"></td><td contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;"></td><td contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;"></td></tr>
      <tr><td contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;"></td><td contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;"></td><td contenteditable="true" style="border:1px solid var(--border);padding:4px 6px;"></td></tr>
    </tbody>
  </table><p><br></p>`;
  editable.focus();
  document.execCommand("insertHTML", false, html);
}

function repoInsertGraphBlock(editable) {
  const html = `<figure class="repo-graph" data-graph="bars" data-values="3,7,5,9" contenteditable="false" style="margin:10px 0;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-shell);">
    <figcaption style="font-size:11px;color:var(--ink-muted);margin-bottom:6px;">Graph · edit data-values</figcaption>
    <div style="display:flex;align-items:flex-end;gap:6px;height:72px;">
      <div style="flex:1;background:var(--accent);height:33%;border-radius:3px 3px 0 0;" title="3"></div>
      <div style="flex:1;background:var(--accent);height:77%;border-radius:3px 3px 0 0;" title="7"></div>
      <div style="flex:1;background:var(--accent);height:55%;border-radius:3px 3px 0 0;" title="5"></div>
      <div style="flex:1;background:var(--accent);height:100%;border-radius:3px 3px 0 0;" title="9"></div>
    </div>
  </figure><p><br></p>`;
  editable.focus();
  document.execCommand("insertHTML", false, html);
}

function repoInsertColorState(editable, color) {
  const html = `<span data-color-state="${color}" style="background:${color};color:#fff;padding:1px 6px;border-radius:4px;">color</span>&nbsp;`;
  editable.focus();
  document.execCommand("insertHTML", false, html);
}

function wireRepositoryDocsEditor(editableId) {
  const editable = document.getElementById(editableId);
  if (!editable) return;
  document.querySelectorAll(`[data-rich-for="${editableId}"] [data-repo-insert], .repo-docs-extras[data-rich-for="${editableId}"] [data-repo-insert]`).forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.repoInsert === "table") repoInsertSheetBlock(editable);
      else if (btn.dataset.repoInsert === "graph") repoInsertGraphBlock(editable);
      repoMarkDirty();
    };
  });
  document.querySelectorAll(`[data-rich-for="${editableId}"] [data-repo-color], .repo-docs-extras[data-rich-for="${editableId}"] [data-repo-color]`).forEach(inp => {
    inp.onchange = () => {
      repoInsertColorState(editable, inp.value);
      repoMarkDirty();
    };
  });
  document.querySelectorAll(`[data-rich-for="${editableId}"] [data-repo-fullscreen], .repo-docs-extras[data-rich-for="${editableId}"] [data-repo-fullscreen]`).forEach(btn => {
    btn.onclick = () => repoOpenDocsFullscreen();
  });
  if (typeof wireRichToolbar === "function") {
    wireRichToolbar(editableId);
    document.querySelector(`[data-rich-for="${editableId}"] .rich-fullscreen-btn`)?.remove();
    document.querySelectorAll(`[data-rich-for="${editableId}"] [data-cmd]`).forEach(el => {
      if (el.tagName === "BUTTON") {
        const prior = el.onclick;
        el.onclick = (e) => {
          if (prior) prior.call(el, e);
          repoMarkDirty();
          if (editableId === "repo-docs-fullscreen-editor") {
            repoSyncDocsEditors("repo-docs-fullscreen-editor", "repo-docs-editor");
          } else if (REPO_DOCS_FULLSCREEN) {
            repoSyncDocsEditors("repo-docs-editor", "repo-docs-fullscreen-editor");
          }
        };
      } else {
        const prior = el.onchange;
        el.onchange = (e) => {
          if (prior) prior.call(el, e);
          repoMarkDirty();
          if (editableId === "repo-docs-fullscreen-editor") {
            repoSyncDocsEditors("repo-docs-fullscreen-editor", "repo-docs-editor");
          } else if (REPO_DOCS_FULLSCREEN) {
            repoSyncDocsEditors("repo-docs-editor", "repo-docs-fullscreen-editor");
          }
        };
      }
    });
  } else {
    document.querySelectorAll(`[data-rich-for="${editableId}"] [data-cmd]`).forEach(el => {
      if (el.tagName !== "BUTTON") return;
      el.onclick = () => {
        editable.focus();
        if (el.dataset.cmd === "createLink") {
          const url = window.prompt("Link URL:");
          if (!url) return;
          document.execCommand("createLink", false, url);
        } else {
          document.execCommand(el.dataset.cmd, false, el.dataset.value || null);
        }
        repoMarkDirty();
        if (editableId === "repo-docs-fullscreen-editor") {
          repoSyncDocsEditors("repo-docs-fullscreen-editor", "repo-docs-editor");
        } else if (REPO_DOCS_FULLSCREEN) {
          repoSyncDocsEditors("repo-docs-editor", "repo-docs-fullscreen-editor");
        }
      };
    });
  }
  editable.oninput = () => {
    repoMarkDirty();
    if (editableId === "repo-docs-fullscreen-editor") {
      repoSyncDocsEditors("repo-docs-fullscreen-editor", "repo-docs-editor");
      const fsInd = document.getElementById("repo-fs-saved-indicator");
      if (fsInd) {
        fsInd.textContent = repoSavedLabel();
        fsInd.className = "repo-saved-indicator repo-saved-dirty";
      }
    } else if (REPO_DOCS_FULLSCREEN) {
      repoSyncDocsEditors("repo-docs-editor", "repo-docs-fullscreen-editor");
    }
  };
  editable.addEventListener("blur", () => {
    if (REPO_DIRTY) repoFlushAutosave().catch(() => {});
  });
}

function wireRepositoryEditor() {
  const editor = document.getElementById("repo-editor");
  if (editor) {
    editor.oninput = () => repoMarkDirty();
    editor.addEventListener("blur", () => {
      if (REPO_DIRTY) repoFlushAutosave().catch(() => {});
    });
  }
  wireRepositoryDocsEditor("repo-docs-editor");
  const csvTable = document.getElementById("repo-csv-table");
  if (csvTable) {
    csvTable.addEventListener("input", () => repoMarkDirty());
  }
}

function repoAskAgentAboutOpenFile() {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file) return;
  const name = file.filename || file.name || "Untitled";
  askAgentAbout(`Read repository file id ${file.id} ("${name}") and summarize the key points. If this is also in the Obsidian vault, use_integration obsidian to open the matching note.`);
}

function repoOpenAsExtension() {
  const file = repoFileById(REPO_OPEN_ID);
  if (!file) return;
  const name = file.filename || file.name || "Untitled";
  askAgentAbout(
    `Open this as an extension surface: repository file id ${file.id} ("${name}"). ` +
    `use_integration obsidian if a vault note matches. Search the repository, then do the long task I describe next. Stay in this file unless I name another.`
  );
}

async function repoRefreshVaultNotes() {
  REPO_VAULT_LOADING = true;
  REPO_VAULT_ERROR = "";
  repoPatchVaultCard();
  try {
    const res = await (typeof api === "function"
      ? api("/api/integrations/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "obsidian", action: "list" }),
      })
      : (await fetch("/api/integrations/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "obsidian", action: "list" }),
      })).json());
    if (res.error && !res.ok) {
      REPO_VAULT_NOTES = [];
      REPO_VAULT_ERROR = res.error;
      REPO_VAULT_STATUS = "";
    } else {
      REPO_VAULT_NOTES = res.files || [];
      REPO_VAULT_STATUS = `${REPO_VAULT_NOTES.length} note${REPO_VAULT_NOTES.length === 1 ? "" : "s"} listed`;
    }
  } catch (err) {
    REPO_VAULT_NOTES = [];
    REPO_VAULT_ERROR = errorMessage ? errorMessage(err) : String(err);
  } finally {
    REPO_VAULT_LOADING = false;
    repoPatchVaultCard();
  }
}

function repoFindFileByName(name) {
  const needle = String(name || "").toLowerCase();
  if (!needle) return null;
  const files = REPO_ALL_FILES.length ? REPO_ALL_FILES : REPO_FILES;
  return files.find(f => {
    const fn = String(f.filename || f.name || "").toLowerCase();
    return fn === needle || fn.endsWith("/" + needle) || fn.endsWith(needle);
  }) || null;
}

async function repoOpenVaultNote(path) {
  const base = String(path || "").split("/").pop() || path;
  const hit = repoFindFileByName(path) || repoFindFileByName(base);
  if (hit) {
    await waypointOpenRepository({ id: hit.id });
    return;
  }
  if (typeof askAgentAbout === "function") {
    askAgentAbout(`use_integration obsidian and open vault note "${path}". If it is also in the repository, read that file and keep it as the working surface.`);
  }
}

function repoPatchVaultCard() {
  const card = document.getElementById("repo-vault-card");
  if (card) card.outerHTML = repoRenderVaultCard();
  wireRepositoryVault();
}

function wireRepositoryVault() {
  document.getElementById("repo-vault-refresh")?.addEventListener("click", () => repoRefreshVaultNotes());
  document.getElementById("repo-vault-ask")?.addEventListener("click", () => {
    if (typeof askAgentAbout === "function") {
      askAgentAbout("use_integration obsidian to list my vault, then open the note I name. Treat the vault as an extension of the Repository tab.");
    }
  });
  document.querySelectorAll("[data-repo-vault]").forEach(btn => {
    btn.addEventListener("click", () => repoOpenVaultNote(btn.dataset.repoVault));
  });
}

async function waypointOpenRepository(spec = {}) {
  const id = spec.id != null ? String(spec.id) : "";
  const name = spec.name || spec.path || spec.filename || spec.vaultPath || "";
  if (typeof goToTab === "function") await goToTab("Repository");
  else if (typeof navigateToTab === "function") await navigateToTab("Repository");
  if (id) {
    repoSetStoredOpenId(id);
    if (typeof repoOpenFile === "function") await repoOpenFile(id, { force: true });
    return repoFileById(id);
  }
  if (name) {
    const hit = repoFindFileByName(name);
    if (hit) {
      repoSetStoredOpenId(hit.id);
      await repoOpenFile(hit.id, { force: true });
      return hit;
    }
    await repoOpenVaultNote(name);
  }
  return null;
}

function wireRepositoryViewerToolbar() {
  const toolbar = document.getElementById("repo-viewer-toolbar");
  if (!toolbar || toolbar.dataset.repoWired === "1") return;
  toolbar.dataset.repoWired = "1";
  const rename = document.getElementById("repo-rename-input");
  if (rename) {
    rename.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        rename.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        rename.value = repoDisplayName(repoFileById(REPO_OPEN_ID));
        rename.blur();
      }
    });
    rename.addEventListener("blur", () => repoRenameOpenFile(rename.value));
  }
  document.getElementById("repo-save-btn")?.addEventListener("click", () => repoSaveFile());
  document.getElementById("repo-run-btn")?.addEventListener("click", () => repoRunFile());
  document.getElementById("repo-ask-agent-btn")?.addEventListener("click", () => repoAskAgentAboutOpenFile());
  document.getElementById("repo-open-extension-btn")?.addEventListener("click", () => repoOpenAsExtension());
  document.getElementById("repo-plan-btn")?.addEventListener("click", () => repoRequestPlanning());
  document.getElementById("repo-copy-btn")?.addEventListener("click", () => repoCopyOpenFile());
  document.getElementById("repo-extract-toolbar-btn")?.addEventListener("click", () => repoExtractText());
  const dlBtn = document.getElementById("repo-download-btn");
  if (dlBtn?.tagName === "BUTTON") dlBtn.addEventListener("click", () => repoDownloadCurrentText());
  document.getElementById("repo-fullscreen-btn")?.addEventListener("click", () => repoOpenDocsFullscreen());
  document.getElementById("repo-mode-toggle")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-repo-mode]");
    if (!btn) return;
    repoSwitchEditorMode(btn.dataset.repoMode);
  });
}

function wireRepositoryExtractPanel() {
  document.getElementById("repo-extract-btn")?.addEventListener("click", () => repoExtractText());
  document.getElementById("repo-promote-docs-btn")?.addEventListener("click", () => repoPromoteToDocs());
}

function wireRepositoryAskHits() {
  document.querySelectorAll("[data-repo-ask-open]").forEach(hit => {
    const open = () => {
      const id = hit.dataset.repoAskOpen;
      if (id) repoOpenFile(id);
    };
    hit.addEventListener("click", open);
    hit.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

function wireRepositoryAsk() {
  document.getElementById("repo-ask-btn")?.addEventListener("click", () => {
    const q = document.getElementById("repo-ask-input")?.value || "";
    repoRunAsk(q);
  });
  const askInput = document.getElementById("repo-ask-input");
  if (askInput) {
    askInput.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        repoRunAsk(askInput.value);
      }
    };
  }
  document.getElementById("repo-ask-this-file")?.addEventListener("change", e => {
    REPO_ASK_THIS_FILE_ONLY = !!e.target.checked;
  });
  wireRepositoryAskHits();
}

function wireRepositoryProposals() {
  document.getElementById("repo-proposals-confirm")?.addEventListener("click", () => repoConfirmProposals());
  document.getElementById("repo-proposals-dismiss")?.addEventListener("click", () => {
    REPO_PROPOSALS = null;
    repoPatchProposals();
  });
}

function wireRepositoryGoogle() {
  document.getElementById("repo-google-import")?.addEventListener("click", () => repoImportGoogle());
  document.getElementById("repo-google-settings")?.addEventListener("click", () => {
    if (typeof goToTab === "function") goToTab("Settings");
  });
}

function wireRepositorySearchHits() {
  document.querySelectorAll("[data-repo-search-open]").forEach(hit => {
    const open = () => {
      const id = hit.dataset.repoSearchOpen;
      if (id) repoOpenFile(id);
    };
    hit.addEventListener("click", open);
    hit.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

function wireRepositoryKindTabs() {
  const tabs = document.getElementById("repo-kind-tabs");
  if (!tabs || tabs.dataset.repoWired === "1") return;
  tabs.dataset.repoWired = "1";
  tabs.addEventListener("click", e => {
    const tab = e.target.closest("[data-repo-kind]");
    if (!tab || tab.dataset.repoKind === REPO_KIND) return;
    if (REPO_DIRTY && !window.confirm("Save or finish your current edits before switching file types?")) return;
    clearTimeout(REPO_AUTOSAVE_TIMER);
    REPO_KIND = tab.dataset.repoKind;
    repoApplyKindFilter();
    const open = repoFileById(REPO_OPEN_ID);
    if (open && repoWorkspaceKind(open) !== REPO_KIND) {
      REPO_OPEN_ID = null;
      REPO_CONTENT = null;
      REPO_DIRTY = false;
      repoSetStoredOpenId(null);
    }
    repoPatchFileList();
    repoPatchViewer();
    repoPatchRootClass();
    repoPatchAskCard();
  });
}

function wireRepositoryFileActions() {
  const list = document.getElementById("repo-file-list");
  if (!list || list.dataset.repoWired === "1") return;
  list.dataset.repoWired = "1";
  list.addEventListener("click", async e => {
    const openBtn = e.target.closest("[data-repo-open]");
    if (openBtn && !e.target.closest("[data-repo-delete],[data-repo-refile]")) {
      repoOpenFile(openBtn.dataset.repoOpen);
      return;
    }
    const del = e.target.closest("[data-repo-delete]");
    if (del) {
      const id = del.dataset.repoDelete;
      const file = repoFileById(id);
      const name = file?.filename || file?.name || "this file";
      if (!id || !window.confirm(`Delete "${name}" from the repository? This cannot be undone.`)) return;
      try {
        const res = await fetch(`/api/repo/files/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (res.status === 404) { showToast("Delete not available", "info"); return; }
        if (!res.ok) throw new Error(await res.text());
        showToast("File deleted", "good");
        if (String(REPO_OPEN_ID) === String(id)) {
          REPO_OPEN_ID = null;
          REPO_CONTENT = null;
          repoSetStoredOpenId(null);
        }
        await repoRefreshData();
        repoPatchDom();
      } catch (err) {
        showToast(`Delete failed: ${errorMessage(err)}`, "bad");
      }
      return;
    }
    const refile = e.target.closest("[data-repo-refile]");
    if (refile) {
      const id = refile.dataset.repoRefile;
      const file = repoFileById(id);
      const current = file?.category || "Uncategorized";
      const next = prompt("Category:", current);
      if (next == null || next === current) return;
      try {
        const res = await fetch(`/api/repo/files/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: next }),
        });
        if (res.status === 404) { showToast("Refile not available", "info"); return; }
        if (!res.ok) throw new Error(await res.text());
        showToast("Category updated", "good");
        await repoRefreshData();
        repoPatchDom();
      } catch (err) {
        showToast(`Refile failed: ${errorMessage(err)}`, "bad");
      }
    }
  });

}

function wireRepository() {
  repoEnsureAutosaveGuards();
  wireRepositoryKindTabs();
  wireRepositoryFileActions();
  wireRepositoryViewerToolbar();
  wireRepositoryEditor();
  wireRepositoryExtractPanel();
  wireRepositoryProposals();
  wireRepositoryGoogle();
  wireRepositorySearchHits();
  wireRepositoryAsk();
  wireRepositoryVault();

  const drop = document.getElementById("repo-drop-zone");
  const input = document.getElementById("repo-file-input");
  const choose = document.getElementById("repo-choose-files");
  const create = document.getElementById("repo-create-btn");
  const createMenu = document.getElementById("repo-create-menu");

  if (create && createMenu) {
    create.onclick = e => {
      e.stopPropagation();
      createMenu.hidden = !createMenu.hidden;
      create.setAttribute("aria-expanded", createMenu.hidden ? "false" : "true");
    };
    createMenu.onclick = e => {
      e.stopPropagation();
      const option = e.target.closest("[data-repo-create-kind]");
      if (!option) return;
      createMenu.hidden = true;
      create.setAttribute("aria-expanded", "false");
      repoCreateNewFile(option.dataset.repoCreateKind);
    };
  }

  if (choose && input) {
    input.removeAttribute("accept");
    choose.onclick = e => { e.stopPropagation(); input.click(); };
    input.onchange = () => {
      if (input.files?.length) repoUploadFiles(input.files);
      input.value = "";
    };
  }
  if (drop) {
    drop.onclick = e => {
      if (e.target.closest("button, a, input")) return;
      input?.click();
    };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("repo-drop-active"); };
    drop.ondragleave = () => drop.classList.remove("repo-drop-active");
    drop.ondrop = e => {
      e.preventDefault();
      drop.classList.remove("repo-drop-active");
      if (e.dataTransfer?.files?.length) repoUploadFiles(e.dataTransfer.files);
    };
  }

  document.getElementById("repo-search-btn")?.addEventListener("click", () => {
    const q = document.getElementById("repo-search-input")?.value || "";
    repoRunSearch(q);
  });
  const searchInput = document.getElementById("repo-search-input");
  if (searchInput) {
    searchInput.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        repoRunSearch(searchInput.value);
      }
    };
  }

  document.getElementById("repo-summary-toggle")?.addEventListener("click", () => {
    REPO_SUMMARY_OPEN = !REPO_SUMMARY_OPEN;
    document.getElementById("repo-summary-panel")?.classList.toggle("repo-summary-open", REPO_SUMMARY_OPEN);
  });
  document.getElementById("repo-summary-regen")?.addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Regenerating…";
    try {
      await repoLoadSummary(true);
      const panel = document.getElementById("repo-summary-panel");
      if (panel) panel.outerHTML = repoRenderSummary();
      wireRepository();
      showToast("Overview regenerated", "good");
    } catch (err) {
      showToast(`Regenerate failed: ${errorMessage(err)}`, "bad");
    } finally {
      btn.disabled = false;
      btn.textContent = "Regenerate";
    }
  });

  document.getElementById("repo-conv-toggle")?.addEventListener("click", async () => {
    REPO_CONV_OPEN = !REPO_CONV_OPEN;
    const wrap = document.getElementById("repo-conv-wrap");
    if (wrap) {
      wrap.innerHTML = repoRenderConversations();
      if (REPO_CONV_OPEN) await repoLoadConversations();
      wireRepository();
    }
  });

  document.getElementById("repo-conv-panel")?.addEventListener("click", async e => {
    const chip = e.target.closest("[data-repo-conv-src]");
    if (!chip) return;
    REPO_CONV_SOURCE = chip.dataset.repoConvSrc || "";
    await repoLoadConversations();
    const wrap = document.getElementById("repo-conv-wrap");
    if (wrap) {
      wrap.innerHTML = repoRenderConversations();
      wireRepository();
    }
  });

  if (!window._repoKeyNavBound) {
    window._repoKeyNavBound = true;
    document.addEventListener("keydown", e => {
      if (ACTIVE_TAB !== "Repository") return;
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowDown") { e.preventDefault(); repoNavigateFile(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); repoNavigateFile(-1); }
    });
  }
}

if (typeof window !== "undefined") {
  window.waypointOpenRepository = waypointOpenRepository;
  window.WaypointRepository = {
    open: waypointOpenRepository,
    openFile: (id) => waypointOpenRepository({ id }),
    openByName: (name) => waypointOpenRepository({ name }),
    openVaultNote: repoOpenVaultNote,
    listVault: repoRefreshVaultNotes,
    listFiles: () => (REPO_ALL_FILES.length ? REPO_ALL_FILES : REPO_FILES).slice(),
  };
}
