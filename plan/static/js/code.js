let CODE_CURRENT_FILE = null; // { path, content } -- currently loaded in the Code tab's file viewer
let CODE_SELECTION = null;    // { path, start_line, end_line, content } -- active text selection within it
let CODE_LAST_RESPONSE = "";
let CODE_BACKENDS_STATUS = null;
let CODE_SESSION_BACKEND_TOUCHED = false;
let CODE_EDIT_FIRST_ENTRY_DONE = false;

const CODE_RECENT_MAX = 8;
const CODE_PROMPT_HISTORY_MAX = 15;
const CODE_MODE_STORAGE_KEY = "codeMode";

function loadCodeMode() {
  try {
    const m = localStorage.getItem(CODE_MODE_STORAGE_KEY);
    return m === "edit" ? "edit" : "talk";
  } catch {
    return "talk";
  }
}

function saveCodeMode(mode) {
  try {
    localStorage.setItem(CODE_MODE_STORAGE_KEY, mode === "edit" ? "edit" : "talk");
  } catch { /* ignore */ }
}

function codeAskButtonLabel(mode) {
  return mode === "edit" ? "Propose edit" : "Ask";
}

function codePromptPlaceholder(mode) {
  if (mode === "edit") {
    return "Ask to fix, refactor, or add something — changes are proposed for your approval.";
  }
  return "Ask a question, request an explanation, or get a code review…";
}

function codeSelectionContextLabel(mode) {
  if (!CODE_SELECTION) return "";
  const range = `${CODE_SELECTION.path}:${CODE_SELECTION.start_line}-${CODE_SELECTION.end_line}`;
  return mode === "edit" ? `Context for edit: ${range}` : `Asking about ${range}`;
}

function codeBackendDefs(mode) {
  const talk = {
    auto: "Auto (Q&A route)",
    claude: "Claude (answers only in Talk)",
    openai: "OpenAI/GPT code Q&A",
    grok: "Grok / xAI code Q&A",
    ollama: "Ollama local Q&A",
    cursor: "Cursor (not wired up yet)",
  };
  const edit = {
    auto: "Auto professional route",
    claude: "Claude (stages edits)",
    openai: "OpenAI/GPT (Q&A only — no staged edits)",
    grok: "Grok / xAI (Q&A only — no staged edits)",
    ollama: "Ollama local (Q&A only)",
    cursor: "Cursor (not wired up yet)",
  };
  const labels = mode === "edit" ? edit : talk;
  const order = mode === "edit"
    ? ["claude", "auto", "openai", "grok", "ollama", "cursor"]
    : ["auto", "openai", "grok", "ollama", "claude", "cursor"];
  return order.map(key => ({ key, label: labels[key] }));
}

function codePreferredBackend(status, mode) {
  const backendEl = document.getElementById("code-backend");
  if (backendEl && CODE_SESSION_BACKEND_TOUCHED) return backendEl.value;
  if (mode === "edit" && !CODE_EDIT_FIRST_ENTRY_DONE && status.backends.includes("claude")) {
    CODE_EDIT_FIRST_ENTRY_DONE = true;
    return "claude";
  }
  return "auto";
}

function codeModeToggleHtml(mode) {
  const talkActive = mode === "talk";
  const editActive = mode === "edit";
  return `<div class="cod-mode-toggle seg-pill" role="group" aria-label="Code mode">
    <button type="button" class="cod-mode-seg cod-mode-seg-talk seg-pill-btn${talkActive ? " active" : ""}" data-code-mode="talk" aria-pressed="${talkActive}">Talk</button>
    <button type="button" class="cod-mode-seg cod-mode-seg-edit seg-pill-btn${editActive ? " active" : ""}" data-code-mode="edit" aria-pressed="${editActive}">Edit</button>
  </div>`;
}

function codeModeNoteHtml(mode) {
  if (mode === "edit") {
    return `<p class="cod-mode-note cod-mode-note-edit stub" style="margin:8px 0 0;">Edits are staged for approval — nothing writes until you Approve.</p>`;
  }
  return `<p class="cod-mode-note cod-mode-note-talk stub" style="margin:8px 0 0;">Answers only — no staged edits in Talk.</p>`;
}

function codePageSubtitleHtml(mode) {
  if (mode === "edit") {
    return `Request fixes, refactors, or new code. Claude can stage edits for your approval below — nothing writes until you click Approve. Pick a file and select text to narrow the edit scope.`;
  }
  return `Ask questions, get explanations, or request reviews about this codebase. Pick a file and select text to focus your question on a specific region.`;
}

function codeBrowseHelpHtml(mode) {
  if (mode === "edit") {
    return `Pick a file, then select some of its text below — the selection narrows what the next edit proposal can touch.`;
  }
  return `Pick a file, then select some of its text below — the selection gets attached to your next question so the AI answers about that region specifically, not the whole file.`;
}

function codeAskCardTitle(mode) {
  return mode === "edit" ? "Propose an edit" : "Ask a question";
}

function buildCodeBackendOptions(status, mode, selectedKey) {
  return codeBackendDefs(mode).map(b => {
    const available = status.backends.includes(b.key);
    const suffix = available ? "" : " -- unavailable";
    const selected = b.key === selectedKey ? " selected" : "";
    const disabled = available ? "" : " disabled";
    return `<option value="${b.key}"${selected}${disabled}>${escapeHtml(b.label)}${suffix}</option>`;
  }).join("");
}

function loadCodeRecentFiles() {
  try {
    const raw = localStorage.getItem("codeRecentFiles");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(p => typeof p === "string").slice(0, CODE_RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushCodeRecentFile(path) {
  if (!path) return;
  const list = loadCodeRecentFiles().filter(p => p !== path);
  list.unshift(path);
  localStorage.setItem("codeRecentFiles", JSON.stringify(list.slice(0, CODE_RECENT_MAX)));
}

function loadCodePromptHistory() {
  try {
    const raw = localStorage.getItem("codePromptHistory");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(p => typeof p === "string").slice(0, CODE_PROMPT_HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function pushCodePromptHistory(prompt) {
  if (!prompt) return;
  const list = loadCodePromptHistory();
  if (list[0] === prompt) return;
  list.unshift(prompt);
  localStorage.setItem("codePromptHistory", JSON.stringify(list.slice(0, CODE_PROMPT_HISTORY_MAX)));
}

function formatCodeResponse(text) {
  const escaped = escapeHtml(text ?? "");
  const fences = [];
  let html = escaped.replace(/```([\s\S]*?)```/g, (_, body) => {
    const i = fences.length;
    fences.push(`<pre class="cod-fence">${body}</pre>`);
    return `\x00FENCE${i}\x00`;
  });
  html = html.replace(/`([^`\n]+)`/g, "<code class=\"cod-inline\">$1</code>");
  html = html.replace(/\x00FENCE(\d+)\x00/g, (_, i) => fences[Number(i)]);
  return html;
}

function codeRecentChipsHtml() {
  const recent = loadCodeRecentFiles();
  if (!recent.length) {
    return `<div id="code-recent-files" class="cod-recent" style="display:none; margin-bottom:8px;"></div>`;
  }
  const chips = recent.map(p => {
    const safe = p.replace(/"/g, "&quot;");
    return `<button type="button" class="secondary cod-recent-chip" data-path="${safe}" style="padding:2px 8px; font-size:11px;">${escapeHtml(p)}</button>`;
  }).join("");
  return `<div id="code-recent-files" class="cod-recent" style="margin-bottom:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
    <span class="stub" style="font-size:11px;">Recent:</span>${chips}
  </div>`;
}

function codeSelectionContextHtml(mode) {
  const resolvedMode = mode || loadCodeMode();
  if (!CODE_SELECTION) {
    return `<div id="code-selection-context-wrap" class="cod-selection-context-wrap" style="display:none; margin-top:8px;"></div>`;
  }
  const label = codeSelectionContextLabel(resolvedMode);
  return `<div id="code-selection-context-wrap" class="cod-selection-context-wrap" style="margin-top:8px; display:flex;">
    <span class="pill status-good cod-selection-context">${escapeHtml(label)}
      <button type="button" class="cod-selection-dismiss" id="code-selection-context-dismiss" title="Clear selection">&#10005;</button>
    </span>
  </div>`;
}

async function renderCode() {
  const [status, pending, about, filesResult, version] = await Promise.all([
    api("/api/code/backends"),
    api("/api/actions?status=pending"),
    api("/api/about"),
    api("/api/code/files"),
    api("/api/system/version"),
  ]);
  CODE_BACKENDS_STATUS = status;
  const codeMode = loadCodeMode();
  const preferredBackend = codePreferredBackend(status, codeMode);
  const backendOptions = buildCodeBackendOptions(status, codeMode, preferredBackend);
  const modelOptions = status.ollama_models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  const ollamaVisible = status.backends.includes("ollama") && preferredBackend === "ollama";

  const summaryBody = about.code_self_summary
    ? `<div class="stub">Generated ${new Date(about.code_self_summary_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
       <div style="margin-top:6px; white-space:pre-wrap;">${about.code_self_summary.replace(/</g, "&lt;")}</div>`
    : `<p class="stub">Not generated yet -- click Summarize to sample this app's own source files.</p>`;

  const fileOptions = filesResult.files.map(f => {
    const safe = f.replace(/"/g, "&quot;");
    return `<option value="${safe}" ${CODE_CURRENT_FILE && CODE_CURRENT_FILE.path === f ? "selected" : ""}>${safe}</option>`;
  }).join("");
  const selectionPillText = CODE_SELECTION
    ? escapeHtml(`Selected: ${CODE_SELECTION.path} lines ${CODE_SELECTION.start_line}-${CODE_SELECTION.end_line}`) : "";
  const versionLabel = version.hash
    ? `${escapeHtml(version.hash)}${version.branch ? ` · ${escapeHtml(version.branch)}` : ""}`
    : "unknown";

  return `
    <style>
      .cod-version-strip { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-card); font-size:12px; }
      .cod-recent-chip { cursor: pointer; }
      .cod-viewer-toolbar label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
      .cod-selection-context { display: inline-flex; align-items: center; gap: 6px; }
      .cod-selection-dismiss { border: none; background: transparent; color: inherit; cursor: pointer; padding: 0 2px; font-size: 12px; line-height: 1; opacity: 0.75; }
      .cod-selection-dismiss:hover { opacity: 1; }
      .cod-response { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, monospace; font-size: 12px; margin: 0; padding: 10px; border-radius: 6px; background: var(--bg-inset, rgba(0,0,0,0.15)); overflow: auto; }
      .cod-fence { display: block; margin: 8px 0; padding: 8px 10px; border-radius: 6px; background: var(--bg-inset, rgba(0,0,0,0.2)); overflow: auto; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px; }
      .cod-inline { font-family: ui-monospace, monospace; font-size: 0.92em; padding: 1px 4px; border-radius: 3px; background: var(--bg-inset, rgba(0,0,0,0.2)); }
      .cod-prompt-history-menu { display: none; position: absolute; top: 100%; right: 0; margin-top: 4px; min-width: 220px; max-width: min(420px, 90vw); max-height: 240px; overflow: auto; z-index: 20; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
      .cod-prompt-history-item { display: block; width: 100%; text-align: left; border: none; background: transparent; color: var(--ink-primary); padding: 8px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cod-prompt-history-item:hover { background: var(--bg-inset, rgba(0,0,0,0.08)); }
      .cod-response-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
      .cod-mode-ask-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
    </style>
    <div class="cod-version-strip">
      <span><strong>Version</strong> <code id="code-version-label">${versionLabel}</code></span>
      <button type="button" class="secondary" id="code-update-git" style="padding:4px 10px; font-size:11px;">Update from git</button>
    </div>
    <p class="page-title">Code</p>
    <p class="page-subtitle" id="code-page-subtitle">${escapeHtml(codePageSubtitleHtml(codeMode))}</p>
    ${pending.length ? `<p class="page-subtitle" style="color:var(--status-warning);">${pending.length} action(s) waiting for your approval -- nothing runs until you click Approve.</p>${pending.map(approvalCardHtml).join("")}` : ""}
    <div class="card">
      <strong style="font-size:13px;">Waypoint's own codebase</strong>
      <p class="stub" style="margin:4px 0 8px;">Samples this app's own source and summarizes what it does, so new
        projects can be checked against what already exists here -- same idea as the Projects tab's code-similarity
        flag, pointed at Waypoint itself.</p>
      <button class="secondary" id="code-summarize">Summarize this codebase</button>
      <div id="code-summary-box" style="margin-top:8px;">${summaryBody}</div>
    </div>
    <div class="card">
      <strong style="font-size:13px;">Browse a file &amp; select code</strong>
      <p class="stub cod-mode-browse-help" id="code-browse-help" style="margin:4px 0 8px;">${escapeHtml(codeBrowseHelpHtml(codeMode))}</p>
      ${codeRecentChipsHtml()}
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
        <select id="code-file-picker" style="flex:1;">
          <option value="">-- pick a file --</option>
          ${fileOptions}
        </select>
        <button class="secondary" id="code-open-vscode" title="Opens the real VS Code app on this project (or the picked file)">Open in VS Code</button>
      </div>
      <div class="cod-viewer-toolbar" style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
        <label style="font-size:12px;">Go to line</label>
        <input type="number" id="code-goto-line" min="1" placeholder="n" style="width:4.5em; font-size:12px;" />
        <button type="button" class="secondary" id="code-goto-btn" style="padding:2px 8px; font-size:11px;">Go</button>
        <label style="font-size:12px; margin-left:auto;"><input type="checkbox" id="code-wrap-toggle" /> wrap</label>
      </div>
      <textarea id="code-file-view" readonly spellcheck="false"
        placeholder="Pick a file above, then select a range of its text to attach as context."
        style="min-height:260px; font-family:ui-monospace, monospace; font-size:12px; white-space:pre; overflow:auto; resize:vertical;"
      ></textarea>
      <div id="code-selection-pill-wrap" style="margin-top:8px; display:${CODE_SELECTION ? "flex" : "none"}; align-items:center; gap:8px;">
        <span class="pill status-good" id="code-selection-pill">${selectionPillText}</span>
        <button class="secondary" id="code-selection-clear" style="padding:2px 8px; font-size:11px;">Clear selection</button>
      </div>
    </div>
    <div class="card cod-mode-ask-card" id="code-ask-card">
      <div class="cod-mode-ask-header">
        <strong style="font-size:13px;" id="code-ask-card-title">${escapeHtml(codeAskCardTitle(codeMode))}</strong>
        <div id="code-mode-toggle-wrap">${codeModeToggleHtml(codeMode)}</div>
      </div>
      <div id="code-mode-note-wrap">${codeModeNoteHtml(codeMode)}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
        <select id="code-backend">${backendOptions}</select>
        <select id="code-ollama-model" style="${ollamaVisible ? "" : "display:none;"}">${modelOptions}</select>
      </div>
      ${codeSelectionContextHtml(codeMode)}
      <textarea id="code-prompt" placeholder="${escapeHtml(codePromptPlaceholder(codeMode))}" style="min-height:100px; margin-top:8px;"></textarea>
      <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
        <button class="primary cod-mode-submit" id="code-ask">${escapeHtml(codeAskButtonLabel(codeMode))}</button>
        <div style="position:relative;">
          <button type="button" class="secondary" id="code-prompt-history-btn" style="font-size:12px; padding:6px 10px;">history &#9662;</button>
          <div id="code-prompt-history-menu" class="cod-prompt-history-menu"></div>
        </div>
      </div>
      <div id="code-response-wrap" style="margin-top:10px; display:none;">
        <div class="cod-response-header">
          <strong style="font-size:12px;">Response</strong>
          <button type="button" class="secondary" id="code-response-copy" style="padding:2px 10px; font-size:11px;">Copy</button>
        </div>
        <div id="code-response" class="cod-response approval-code" style="max-height:360px;"></div>
      </div>
    </div>
    <div class="card stub">
      <strong>Still coming</strong><br><br>
      Cursor routing is detected (key found in .env) but not implemented -- see Project Plan.md.
    </div>`;
}

function refreshCodeModeChrome() {
  const mode = loadCodeMode();
  const status = CODE_BACKENDS_STATUS;
  const subtitle = document.getElementById("code-page-subtitle");
  if (subtitle) subtitle.textContent = codePageSubtitleHtml(mode);

  const browseHelp = document.getElementById("code-browse-help");
  if (browseHelp) browseHelp.textContent = codeBrowseHelpHtml(mode);

  const askTitle = document.getElementById("code-ask-card-title");
  if (askTitle) askTitle.textContent = codeAskCardTitle(mode);

  const toggleWrap = document.getElementById("code-mode-toggle-wrap");
  if (toggleWrap) toggleWrap.innerHTML = codeModeToggleHtml(mode);

  const noteWrap = document.getElementById("code-mode-note-wrap");
  if (noteWrap) noteWrap.innerHTML = codeModeNoteHtml(mode);

  const backendEl = document.getElementById("code-backend");
  if (backendEl && status) {
    const selected = backendEl.value;
    backendEl.innerHTML = buildCodeBackendOptions(status, mode, selected);
    backendEl.value = selected;
  }

  const promptEl = document.getElementById("code-prompt");
  if (promptEl) promptEl.placeholder = codePromptPlaceholder(mode);

  const askBtn = document.getElementById("code-ask");
  if (askBtn && !askBtn.disabled) askBtn.textContent = codeAskButtonLabel(mode);

  const askCard = document.getElementById("code-ask-card");
  if (askCard) {
    askCard.classList.toggle("cod-mode-talk", mode === "talk");
    askCard.classList.toggle("cod-mode-edit", mode === "edit");
  }

  updateCodeSelectionContextChip();
  wireCodeModeToggle();
}

function setCodeMode(mode) {
  const next = mode === "edit" ? "edit" : "talk";
  saveCodeMode(next);
  if (next === "edit" && !CODE_EDIT_FIRST_ENTRY_DONE && !CODE_SESSION_BACKEND_TOUCHED
      && CODE_BACKENDS_STATUS?.backends.includes("claude")) {
    const backendEl = document.getElementById("code-backend");
    const ollamaEl = document.getElementById("code-ollama-model");
    if (backendEl) backendEl.value = "claude";
    if (ollamaEl) ollamaEl.style.display = "none";
    CODE_EDIT_FIRST_ENTRY_DONE = true;
  }
  refreshCodeModeChrome();
}

function wireCodeModeToggle() {
  document.querySelectorAll(".cod-mode-seg").forEach(btn => {
    btn.onclick = () => {
      const next = btn.dataset.codeMode;
      if (next && next !== loadCodeMode()) setCodeMode(next);
    };
  });
}

function wireCode() {
  const askCard = document.getElementById("code-ask-card");
  if (askCard) {
    const mode = loadCodeMode();
    askCard.classList.toggle("cod-mode-talk", mode === "talk");
    askCard.classList.toggle("cod-mode-edit", mode === "edit");
  }
  wireCodeModeToggle();

  document.getElementById("code-backend").onchange = (e) => {
    CODE_SESSION_BACKEND_TOUCHED = true;
    document.getElementById("code-ollama-model").style.display = e.target.value === "ollama" ? "" : "none";
  };

  const updateGitBtn = document.getElementById("code-update-git");
  if (updateGitBtn) updateGitBtn.onclick = async () => {
    updateGitBtn.disabled = true;
    updateGitBtn.innerHTML = '<span class="spinner"></span> Pulling...';
    try {
      const result = await api("/api/system/update-from-git", { method: "POST" });
      const summary = result.updated ? "Updated from git" : "Already up to date";
      showToast(`${summary} — restart the app to apply backend changes`, result.updated ? "good" : "info");
      if (result.output) console.log(result.output);
      const ver = await api("/api/system/version");
      const label = document.getElementById("code-version-label");
      if (label && ver.hash) {
        label.textContent = ver.branch ? `${ver.hash} · ${ver.branch}` : ver.hash;
      }
    } catch (err) {
      showToast(errorMessage(err), "warn");
    } finally {
      updateGitBtn.disabled = false;
      updateGitBtn.textContent = "Update from git";
    }
  };

  document.getElementById("code-open-vscode").onclick = async () => {
    const picked = document.getElementById("code-file-picker").value;
    const result = await api("/api/code/open-in-vscode", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(picked ? { path: picked } : {}),
    });
    if (result.error) window.alert(result.error);
  };

  document.querySelectorAll(".approve-action").forEach(btn => {
    btn.onclick = async () => {
      btn.innerHTML = '<span class="spinner"></span>Running...'; btn.disabled = true;
      const result = await api(`/api/actions/${btn.dataset.id}/approve`, { method: "POST" });
      window.alert(result.output || result.error || "done");
      render();
    };
  });
  document.querySelectorAll(".reject-action").forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/actions/${btn.dataset.id}/reject`, { method: "POST" });
      render();
    };
  });

  document.getElementById("code-summarize").onclick = async () => {
    const btn = document.getElementById("code-summarize");
    const box = document.getElementById("code-summary-box");
    btn.innerHTML = '<span class="spinner"></span>Summarizing...'; btn.disabled = true;
    try {
      const result = await api("/api/code/summarize-codebase", { method: "POST" });
      if (result.error) { window.alert(result.error); return; }
      box.innerHTML = `<div class="stub">Generated just now -- ${escapeHtml(String(result.files_scanned))} file(s) scanned</div>
        <div style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(result.summary || "")}</div>`;
    } finally {
      btn.textContent = "Summarize this codebase"; btn.disabled = false;
    }
  };

  wireCodeFileViewer();
  wireCodePromptHistory();
  wireCodeResponseCopy();

  const promptEl = document.getElementById("code-prompt");
  promptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById("code-ask").click();
    }
  });

  document.getElementById("code-ask").onclick = async () => {
    const prompt = document.getElementById("code-prompt").value.trim();
    if (!prompt) return;
    const backend = document.getElementById("code-backend").value;
    const ollamaModel = document.getElementById("code-ollama-model").value;
    const btn = document.getElementById("code-ask");
    const wrap = document.getElementById("code-response-wrap");
    const out = document.getElementById("code-response");
    const mode = loadCodeMode();
    const busyLabel = mode === "edit" ? "Proposing..." : "Asking...";
    const idleLabel = codeAskButtonLabel(mode);
    btn.innerHTML = `<span class="spinner"></span>${busyLabel}`; btn.disabled = true;
    wrap.style.display = "block";
    CODE_LAST_RESPONSE = "";
    out.innerHTML = "";
    try {
      const result = await api("/api/code/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, backend, ollama_model: ollamaModel, selection: CODE_SELECTION, mode }),
      });
      let text = result.error || result.response || "(no text response)";
      if (result.actions && result.actions.length) {
        text += `\n\n[staged: ${result.actions.map(a => a.tool).join(", ")} -- see approval card above, awaiting your approval]`;
        pushCodePromptHistory(prompt);
        CODE_LAST_RESPONSE = text;
        out.innerHTML = formatCodeResponse(text);
        render();
        return;
      }
      pushCodePromptHistory(prompt);
      CODE_LAST_RESPONSE = text;
      out.innerHTML = formatCodeResponse(text);
    } finally {
      btn.textContent = idleLabel; btn.disabled = false;
    }
  };
}

function wireCodeResponseCopy() {
  const btn = document.getElementById("code-response-copy");
  if (!btn) return;
  btn.onclick = async () => {
    const text = CODE_LAST_RESPONSE || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard", "good");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("Copied to clipboard", "good");
      } catch {
        showToast("Copy failed", "warn");
      }
      ta.remove();
    }
  };
}

function wireCodePromptHistory() {
  const btn = document.getElementById("code-prompt-history-btn");
  const menu = document.getElementById("code-prompt-history-menu");
  const promptEl = document.getElementById("code-prompt");
  if (!btn || !menu || !promptEl) return;

  const closeMenu = () => { menu.style.display = "none"; };

  const renderMenu = () => {
    const history = loadCodePromptHistory();
    if (!history.length) {
      menu.innerHTML = `<div class="stub" style="padding:8px 10px; font-size:12px;">No history yet</div>`;
      return;
    }
    menu.innerHTML = history.map((p, i) =>
      `<button type="button" class="cod-prompt-history-item" data-idx="${i}" title="${escapeHtml(p)}">${escapeHtml(p)}</button>`
    ).join("");
    menu.querySelectorAll(".cod-prompt-history-item").forEach(item => {
      item.onclick = () => {
        promptEl.value = history[Number(item.dataset.idx)];
        closeMenu();
        promptEl.focus();
      };
    });
  };

  const onDocClick = () => {
    closeMenu();
    document.removeEventListener("click", onDocClick);
  };

  btn.onclick = (e) => {
    e.stopPropagation();
    const open = menu.style.display === "block";
    if (open) {
      closeMenu();
      document.removeEventListener("click", onDocClick);
      return;
    }
    renderMenu();
    menu.style.display = "block";
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
  };

  menu.addEventListener("click", (e) => e.stopPropagation());
}

function refreshCodeRecentChips() {
  const container = document.getElementById("code-recent-files");
  if (!container) return;
  const recent = loadCodeRecentFiles();
  if (!recent.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }
  container.style.display = "flex";
  container.innerHTML = `<span class="stub" style="font-size:11px;">Recent:</span>` +
    recent.map(p => {
      const safe = p.replace(/"/g, "&quot;");
      return `<button type="button" class="secondary cod-recent-chip" data-path="${safe}" style="padding:2px 8px; font-size:11px;">${escapeHtml(p)}</button>`;
    }).join("");
  container.querySelectorAll(".cod-recent-chip").forEach(chip => {
    chip.onclick = () => loadCodeFile(chip.dataset.path);
  });
}

async function loadCodeFile(path) {
  const picker = document.getElementById("code-file-picker");
  const fileView = document.getElementById("code-file-view");
  if (!picker || !fileView) return;

  CODE_SELECTION = null;
  updateCodeSelectionPill();
  updateCodeSelectionContextChip();

  if (!path) {
    CODE_CURRENT_FILE = null;
    picker.value = "";
    fileView.value = "";
    return;
  }

  if (picker.value !== path) picker.value = path;
  pushCodeRecentFile(path);
  refreshCodeRecentChips();

  fileView.value = "Loading...";
  try {
    const result = await api(`/api/code/file?path=${encodeURIComponent(path)}`);
    if (result.error) { window.alert(result.error); CODE_CURRENT_FILE = null; fileView.value = ""; return; }
    CODE_CURRENT_FILE = { path: result.path, content: result.content };
    fileView.value = result.content + (result.truncated ? "\n\n... (truncated, file is large)" : "");
  } catch (err) {
    CODE_CURRENT_FILE = null;
    fileView.value = "";
    window.alert(String(err));
  }
}

function scrollCodeViewerToLine(lineNum) {
  const fileView = document.getElementById("code-file-view");
  if (!fileView || !Number.isFinite(lineNum) || lineNum < 1) return;
  const style = getComputedStyle(fileView);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 14;
  fileView.scrollTop = Math.max(0, (lineNum - 1) * lineHeight);
}

// File picker + textarea selection capture for the Code tab: lets a question be grounded in a
// specific file+line-range instead of the whole file (or nothing). Uses a readonly <textarea>
// rather than a rendered <pre>/getSelection() so selectionStart/selectionEnd give exact character
// offsets for free -- converted to 1-based line numbers by counting newlines up to each offset.
function wireCodeFileViewer() {
  const picker = document.getElementById("code-file-picker");
  const fileView = document.getElementById("code-file-view");
  if (!picker || !fileView) return;

  if (CODE_CURRENT_FILE) fileView.value = CODE_CURRENT_FILE.content;

  picker.onchange = () => loadCodeFile(picker.value);

  document.querySelectorAll(".cod-recent-chip").forEach(chip => {
    chip.onclick = () => loadCodeFile(chip.dataset.path);
  });

  const gotoInput = document.getElementById("code-goto-line");
  const gotoBtn = document.getElementById("code-goto-btn");
  const wrapToggle = document.getElementById("code-wrap-toggle");
  if (gotoBtn && gotoInput) {
    const doGoto = () => scrollCodeViewerToLine(Number(gotoInput.value));
    gotoBtn.onclick = doGoto;
    gotoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doGoto(); }
    });
  }
  if (wrapToggle) {
    wrapToggle.onchange = () => {
      fileView.style.whiteSpace = wrapToggle.checked ? "pre-wrap" : "pre";
    };
  }

  const captureSelection = () => {
    if (!CODE_CURRENT_FILE) return;
    const start = fileView.selectionStart, end = fileView.selectionEnd;
    if (start === end) return; // a bare caret click, not a range -- leave any existing selection as-is
    const value = fileView.value;
    CODE_SELECTION = {
      path: CODE_CURRENT_FILE.path,
      start_line: value.slice(0, start).split("\n").length,
      end_line: value.slice(0, end).split("\n").length,
      content: value.slice(start, end),
    };
    updateCodeSelectionPill();
    updateCodeSelectionContextChip();
  };
  fileView.addEventListener("mouseup", captureSelection);
  fileView.addEventListener("keyup", captureSelection);
  fileView.addEventListener("select", captureSelection);

  document.getElementById("code-selection-clear").onclick = () => {
    CODE_SELECTION = null;
    fileView.setSelectionRange(fileView.selectionStart, fileView.selectionStart);
    updateCodeSelectionPill();
    updateCodeSelectionContextChip();
  };

  const contextDismiss = document.getElementById("code-selection-context-dismiss");
  if (contextDismiss) {
    contextDismiss.onclick = () => {
      CODE_SELECTION = null;
      fileView.setSelectionRange(fileView.selectionStart, fileView.selectionStart);
      updateCodeSelectionPill();
      updateCodeSelectionContextChip();
    };
  }

  updateCodeSelectionPill();
  updateCodeSelectionContextChip();
}

function updateCodeSelectionPill() {
  const wrap = document.getElementById("code-selection-pill-wrap");
  const pill = document.getElementById("code-selection-pill");
  if (!wrap || !pill) return;
  if (CODE_SELECTION) {
    wrap.style.display = "flex";
    pill.textContent = `Selected: ${CODE_SELECTION.path} lines ${CODE_SELECTION.start_line}-${CODE_SELECTION.end_line}`;
  } else {
    wrap.style.display = "none";
    pill.textContent = "";
  }
}

function updateCodeSelectionContextChip() {
  const wrap = document.getElementById("code-selection-context-wrap");
  if (!wrap) return;
  const mode = loadCodeMode();
  if (CODE_SELECTION) {
    const label = codeSelectionContextLabel(mode);
    wrap.style.display = "flex";
    wrap.innerHTML = `<span class="pill status-good cod-selection-context">${escapeHtml(label)}
      <button type="button" class="cod-selection-dismiss" id="code-selection-context-dismiss" title="Clear selection">&#10005;</button>
    </span>`;
    document.getElementById("code-selection-context-dismiss").onclick = () => {
      CODE_SELECTION = null;
      const fileView = document.getElementById("code-file-view");
      if (fileView) fileView.setSelectionRange(fileView.selectionStart, fileView.selectionStart);
      updateCodeSelectionPill();
      updateCodeSelectionContextChip();
    };
  } else {
    wrap.style.display = "none";
    wrap.innerHTML = "";
  }
}
