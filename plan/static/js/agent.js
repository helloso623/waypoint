// --- Agent chat ---------------------------------------------------------

const SUBAGENT_COLORS = {
  goal_chunker: "#3987e5",      // blue
  daily_reflector: "#199e70",   // aqua
  contact_scout: "#c98500",     // yellow
  event_scout: "#008300",       // green
  vibecode_category: "#9085e9", // violet
  competition_scout: "#e66767", // red
  task_validator: "#d55181",    // magenta
  assistant: "#6366f1",         // indigo — in-chat actions
};
function subagentColor(name) { return SUBAGENT_COLORS[name] || "#898781"; }

let LAST_ACTIVITY = [];
let LAST_ACTIVITY_ERROR = null;
let AGENT_HIDDEN_AGENTS = new Set();
let AGENT_EXPANDED_ROWS = new Set();
let AGENT_ACTIVITY_VIEW = localStorage.agentActivityView || "timeline";
let AGENT_MANAGER_TAB = ["running", "activity", "bugs"].includes(localStorage.agentManagerTab)
  ? localStorage.agentManagerTab
  : "activity";
let AGENT_CHAT_MESSAGES = [];
let AGENT_QUICK_EDIT = false;
const AGENT_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const AGENT_PENDING_POLL_MS = 4000;
let AGENT_PENDING_POLL = null;
let AGENT_SEND_IN_FLIGHT = false;
let AGENT_CHAT_IN_FLIGHT = 0;
let AGENT_PENDING_FILES = [];
let AGENT_LOCAL_ACTIVITY = [];
let AGENT_SELF_CODING_ENABLED = false;
let AGENT_WORKING_TRACE_TIMER = null;
let AGENT_BG_TOAST_FOR_TURN = false;
let AGENT_BG_LEAVE_WATCH = null;
let AGENT_CHOICE_FOLLOWUP_PENDING = "";
let AGENT_CHAT_ABORT_CONTROLLER = null;
let AGENT_STOP_REQUESTED = false;

const AGENT_CANCELLED_ITEMS_STORAGE = "waypointCancelledChatItems";

const AGENT_CHAT_SUBAGENT = "assistant";
const AGENT_ATTACHMENT_TEXT_CAP = 250000;

const AGENT_WORKING_PLACEHOLDERS = [
  "Understanding your request…",
  "Looking up your overdue tasks…",
  "Checking your calendar and events…",
  "Searching your projects and notes…",
  "Searching your repository…",
  "Planning what to do next…",
];

const DEFAULT_QUICK_PROMPTS = [
  "What should I focus on today?",
  "Summarize my open tasks",
  "What's overdue?",
  "What have I not touched in a while?",
  "List my repository files",
  "Read the latest dump file about my goals",
];

const REPO_AGENT_TOOLS = new Set([
  "search_repository",
  "list_repository_files",
  "read_repository_file",
]);
const AGENT_TOOL_CATALOG_GROUPS = [
  {
    label: "Plan & schedule",
    tools: ["add_task", "batch_add_tasks", "preview_bulk_import", "preview_schedule_import", "import_course_schedule", "list_tasks", "update_task", "complete_task", "add_goal", "add_calendar_event", "update_calendar_event", "complete_calendar_event", "delete_calendar_event", "add_recurring_class", "list_classes", "grade_class_item"],
  },
  {
    label: "People & projects",
    tools: ["add_contact", "list_contacts", "update_contact", "add_customer", "add_project", "list_projects", "update_project", "create_situation"],
  },
  {
    label: "Capture & knowledge",
    tools: ["add_idea", "add_note", "classify_into_lists", "list_repository_files", "read_repository_file", "search_repository", "local_rag_ask", "web_search", "propose_bug"],
  },
  {
    label: "Automate & customize",
    tools: ["create_automation_rule", "apply_style_paint", "set_hidden_apps", "read_project_file", "use_integration", "spawn_agent", "stop_agent"],
  },
];
const REPO_AGENT_LINK_LIMIT = 5;
let AGENT_CHAT_DENSITY = localStorage.agentChatDensity === "compact" ? "compact" : "comfortable";
let AGENT_ACTIVE_CONVERSATION_ID = Number(localStorage.agentActiveConversationId) || null;
let AGENT_CONVERSATIONS = [];

function agentPersistActiveConversation(id) {
  AGENT_ACTIVE_CONVERSATION_ID = id ? Number(id) : null;
  if (AGENT_ACTIVE_CONVERSATION_ID) {
    localStorage.agentActiveConversationId = String(AGENT_ACTIVE_CONVERSATION_ID);
  } else {
    try { localStorage.removeItem("agentActiveConversationId"); } catch (_) { /* ignore */ }
  }
}

function agentConversationLabel(c) {
  const title = String(c?.title || "New chat").trim() || "New chat";
  return title.length > 42 ? `${title.slice(0, 41)}…` : title;
}

function agentConversationsForPicker(list) {
  return (Array.isArray(list) ? list : []).filter(c => {
    const title = String(c?.title || "");
    return title !== "Companion" && !title.startsWith("Companion · ");
  });
}

function agentConversationPreview(c) {
  const raw = String(c?.last_user_preview || "").replace(/\s+/g, " ").trim();
  if (!raw) return "No messages yet";
  return raw.length > 72 ? `${raw.slice(0, 71)}…` : raw;
}

function agentConversationItemHtml(c, activeId) {
  const selected = Number(c.id) === Number(activeId);
  const count = Number(c.message_count || 0);
  return `<button type="button" class="agc-conv-item${selected ? " active" : ""}" data-conv-id="${c.id}"${selected ? ' aria-current="true"' : ""}>
      <span class="agc-conv-item-title">${escapeHtml(agentConversationLabel(c))}</span>
      <span class="agc-conv-item-preview">${escapeHtml(agentConversationPreview(c))}</span>
      <span class="agc-conv-item-meta">${count} msg${count === 1 ? "" : "s"}</span>
    </button>`;
}

async function agentRefreshConversationList() {
  try {
    const convs = await api("/api/agent/conversations");
    AGENT_CONVERSATIONS = Array.isArray(convs) ? convs : [];
  } catch (_) {
    return;
  }
  const items = agentConversationsForPicker(AGENT_CONVERSATIONS);
  const active = Number(AGENT_ACTIVE_CONVERSATION_ID);
  const select = document.getElementById("agent-conversation-select");
  if (select) {
    select.innerHTML = items.map(c => {
      const selected = Number(c.id) === active ? " selected" : "";
      return `<option value="${c.id}"${selected}>${escapeHtml(agentConversationLabel(c))}</option>`;
    }).join("");
    if (active && items.some(c => Number(c.id) === active)) {
      select.value = String(active);
    }
  }
  const current = document.getElementById("agent-conv-current-title");
  if (current) {
    const row = items.find(c => Number(c.id) === active) || items[0];
    current.textContent = agentConversationLabel(row || { title: "New chat" });
  }
  const list = document.getElementById("agent-conv-list");
  if (list) {
    const q = (document.getElementById("agent-conv-search")?.value || "").trim().toLowerCase();
    const filtered = q
      ? items.filter(c => `${c.title || ""} ${c.last_user_preview || ""}`.toLowerCase().includes(q))
      : items;
    list.innerHTML = filtered.length
      ? filtered.map(c => agentConversationItemHtml(c, active)).join("")
      : '<p class="stub" style="padding:8px;">No matching chats</p>';
  }
}

function agentConversationPickerHtml(conversations, activeId) {
  const items = agentConversationsForPicker(conversations);
  const active = items.find(c => Number(c.id) === Number(activeId)) || items[0];
  const options = items.map(c => {
    const selected = Number(c.id) === Number(activeId) ? " selected" : "";
    return `<option value="${c.id}"${selected}>${escapeHtml(agentConversationLabel(c))}</option>`;
  }).join("");
  const list = items.map(c => agentConversationItemHtml(c, activeId)).join("");
  return `<div class="agc-conv-bar">
    <button type="button" class="agc-conv-current" id="agent-conv-toggle" aria-expanded="false" aria-controls="agent-conv-popover">
      <span class="agc-conv-current-label">Chat</span>
      <span class="agc-conv-current-title" id="agent-conv-current-title">${escapeHtml(agentConversationLabel(active || { title: "New chat" }))}</span>
      <span class="agc-conv-caret" aria-hidden="true">▾</span>
    </button>
    <div class="agc-conv-actions">
      <button type="button" class="secondary agc-conv-new" id="agent-new-chat" title="New chat — fresh context, memories kept">＋ New</button>
      <button type="button" class="secondary agc-conv-rename" id="agent-rename-chat" title="Rename this chat"${items.length ? "" : " disabled"}>Rename</button>
      <button type="button" class="secondary agc-conv-delete" id="agent-delete-chat" title="Delete this chat"${items.length ? "" : " disabled"}>Delete</button>
    </div>
    <div class="agc-conv-popover" id="agent-conv-popover" hidden>
      <input type="search" id="agent-conv-search" class="agc-conv-search" placeholder="Search chats…" autocomplete="off">
      <div class="agc-conv-list" id="agent-conv-list">${list || '<p class="stub" style="padding:8px;">No chats yet</p>'}</div>
    </div>
    <select id="agent-conversation-select" class="agc-conv-select" hidden aria-hidden="true">${options}</select>
  </div>`;
}

function agentCancelledItems() {
  try {
    const stored = JSON.parse(localStorage.getItem(AGENT_CANCELLED_ITEMS_STORAGE) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch (_) {
    return {};
  }
}

function agentCancellationKey(kind, identity, options = {}) {
  const scope = options.scope || "agent";
  const conversationId = options.conversationId
    || (scope === "agent" ? AGENT_ACTIVE_CONVERSATION_ID : "unknown");
  return `${scope}:${conversationId || "none"}:${kind}:${JSON.stringify(identity)}`;
}

function agentIsItemCancelled(key) {
  return !!agentCancelledItems()[key];
}

function agentCancelItem(key) {
  if (!key) return;
  const items = agentCancelledItems();
  items[key] = new Date().toISOString();
  const entries = Object.entries(items);
  const trimmed = entries.length > 600 ? Object.fromEntries(entries.slice(-500)) : items;
  try { localStorage.setItem(AGENT_CANCELLED_ITEMS_STORAGE, JSON.stringify(trimmed)); } catch (_) { /* ignore */ }
}

function agentCancelledStatusHtml(cancelled) {
  return `<span class="agc-cancelled-status"${cancelled ? "" : " hidden"}>Cancelled</span>`;
}

function wireAgentCancelledItems(root) {
  const scope = root || document;
  scope.querySelectorAll(".agc-cancel-item").forEach(btn => {
    if (btn.dataset.cancelWired === "1") return;
    btn.dataset.cancelWired = "1";
    btn.onclick = () => {
      const key = btn.dataset.cancelKey || "";
      if (!key) return;
      agentCancelItem(key);
      const item = btn.closest(".agc-cancellable-item");
      if (!item) return;
      item.classList.add("agc-item-cancelled");
      item.querySelectorAll(".agent-confirm-tool, .companion-confirm-tool").forEach(confirm => {
        confirm.disabled = true;
      });
      const status = item.querySelector(".agc-cancelled-status");
      if (status) status.hidden = false;
      btn.disabled = true;
      btn.setAttribute("aria-label", "Cancelled");
    };
  });
}

function agentSetComposerBusy(on) {
  const sendBtn = document.getElementById("agent-send");
  const stopBtn = document.getElementById("agent-stop");
  const instantBtn = document.getElementById("agent-instant");
  const input = document.getElementById("agent-input");
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.classList.toggle("agc-send-busy", on);
    sendBtn.setAttribute("aria-busy", on ? "true" : "false");
    sendBtn.textContent = on ? "Steer" : "Send";
    sendBtn.title = on ? "Steer the current response" : "Send on the expert brain";
  }
  if (instantBtn) instantBtn.disabled = on;
  if (stopBtn) stopBtn.hidden = !on;
  if (input) input.disabled = false;
}

async function stopAgentChatTurn() {
  if (!AGENT_SEND_IN_FLIGHT) return;
  AGENT_STOP_REQUESTED = true;
  if (AGENT_CHAT_ABORT_CONTROLLER) AGENT_CHAT_ABORT_CONTROLLER.abort();
  clearAgentPendingMarkers();
  stopAgentPendingPoll();
  removeAgentPendingBubble();
  try {
    await api("/api/agent/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: "chat" }),
    });
  } catch (_) { /* the browser abort is still immediate */ }
  showToast("Stopped this response", "success");
}

/** Tab the user was on before Agent (or current tab) — for page-intention context injection. */
function agentContextTab() {
  if (typeof NAV_HISTORY !== "undefined" && NAV_HISTORY.length) {
    for (let i = NAV_HISTORY.length - 1; i >= 0; i--) {
      const t = NAV_HISTORY[i];
      if (t && t !== "Agent" && t !== "Home") return t;
    }
  }
  return typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "Agent";
}

/** Prepended to Agent chat messages so the backend knows page intention (see Page Intentions.md). */
function agentPageContextPrefix() {
  const tab = agentContextTab();
  const label = (typeof TAB_LABELS !== "undefined" && TAB_LABELS[tab]) || tab;
  const meta = typeof PAGE_INTENTS !== "undefined" ? PAGE_INTENTS[tab] : null;
  if (!meta) return `[User context: ${label} page] `;
  const actions = (meta.actions || []).slice(0, 4).join(", ");
  const bits = [
    `[User context: ${label}`,
    meta.title ? `— ${meta.title}` : "",
    meta.primary ? `. Primary job: ${meta.primary}` : "",
    meta.loss ? `. Why it exists: ${meta.loss}` : "",
    actions ? `. Key actions: ${actions}` : "",
    "] ",
  ];
  return bits.join("");
}

function loadQuickPrompts() {
  try {
    const raw = localStorage.agentQuickPrompts;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(String);
    }
  } catch (_) { /* ignore */ }
  return DEFAULT_QUICK_PROMPTS.slice();
}

function saveQuickPrompts(prompts) {
  localStorage.agentQuickPrompts = JSON.stringify(prompts);
}

function buildAgentAttachmentNoteBlock(file, data) {
  const name = file.name;
  const id = data.id;
  if (data.readable === false || !(data.extracted_text || "").trim()) {
    return `[Attached file: ${name} | attachment_id=${id} | no extractable text — binary/image]`;
  }
  let text = data.extracted_text;
  if (text.length > AGENT_ATTACHMENT_TEXT_CAP) {
    text = text.slice(0, AGENT_ATTACHMENT_TEXT_CAP);
  }
  return `[Attached file: ${name} | attachment_id=${id}]\n--- BEGIN FILE CONTENT ---\n${text}\n--- END FILE CONTENT ---`;
}

function agentIconSvg(name) {
  const paths = {
    copy: '<path d="M7 3h8a2 2 0 0 1 2 2v8h-2V5H7V3zm-3 4h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm0 2v8h8v-8H4z"/>',
    quote: '<path d="M4 6h6v6H7.2A3.2 3.2 0 0 0 4 15.2V6zm8 0h6v6h-2.8A3.2 3.2 0 0 0 12 15.2V6z"/>',
    mic: '<path d="M8 2a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V5a3 3 0 0 1 3-3zm7 8a7 7 0 0 1-14 0h2a5 5 0 1 0 10 0h2zM7 16h2v3H7z"/>',
    stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    paperclip: '<path d="M6.5 11.5 12 6a3 3 0 0 1 4.2 4.2l-7.1 7.1a4.5 4.5 0 1 1-6.4-6.4L10 3.6"/>',
  };
  return `<svg class="agc-icon" viewBox="0 0 16 16" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function agentCopyButtonHtml(title = "Copy message") {
  return `<button type="button" class="agc-copy-btn" title="${escapeHtml(title)}" aria-label="Copy message">${agentIconSvg("copy")}</button>`;
}

function agentConfirmCost(usd) {
  return new Promise(resolve => {
    document.getElementById("agc-cost-overlay")?.remove();
    const el = document.createElement("div");
    el.id = "agc-cost-overlay";
    el.className = "agc-cost-overlay";
    const amount = Number(usd || 0).toFixed(2);
    el.innerHTML = `<div class="agc-cost-card" role="dialog" aria-modal="true" aria-labelledby="agc-cost-title">
      <h2 id="agc-cost-title">About $${amount} this turn</h2>
      <p>Predicted over $0.10 in tokens on the expert brain. Send to continue, or cancel and shorten the prompt.</p>
      <div class="agc-cost-actions">
        <button type="button" class="agc-cost-no" id="agc-cost-no">Cancel</button>
        <button type="button" class="agc-cost-yes" id="agc-cost-yes">Send anyway</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const done = ok => { el.remove(); resolve(!!ok); };
    el.querySelector("#agc-cost-yes").onclick = () => done(true);
    el.querySelector("#agc-cost-no").onclick = () => done(false);
    el.addEventListener("click", e => { if (e.target === el) done(false); });
    el.querySelector("#agc-cost-yes").focus();
  });
}
window.agentConfirmCost = agentConfirmCost;
if (typeof window.wpConfirmCost !== "function") window.wpConfirmCost = agentConfirmCost;

function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value)
        .then(() => showToast("Copied to clipboard", "success"))
        .catch(() => fallbackCopyToClipboard(value));
      return;
    }
  } catch (_) { /* fall through */ }
  fallbackCopyToClipboard(value);
}

function fallbackCopyToClipboard(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("Copied to clipboard", "success");
  } catch (_) {
    showToast("Could not copy", "error");
  }
}

function agentChatStylesHtml() {
  return `<style>
.agent-pane-chat #agent-log.agc-compact { gap:4px; padding:2px; }
.agent-pane-chat #agent-log.agc-compact .agent-bubble { padding:6px 10px; font-size:12px; line-height:1.45; }
.agent-pane-chat #agent-log.agc-compact .agc-ts { font-size:9px !important; margin-top:1px !important; }
.agent-pane-chat .agc-bubble-wrap {
  position:relative; max-width:75%; min-width:0; box-sizing:border-box;
}
.agent-pane-chat .agc-bubble-wrap .agent-bubble { max-width:100%; }
.agent-pane-chat .agc-copy-btn {
  position:absolute; top:2px; right:2px; z-index:1;
  width:22px; height:22px; padding:0; border:1px solid var(--border); border-radius:4px;
  background:var(--bg-card); color:var(--ink-secondary); font-size:12px; line-height:1; cursor:pointer;
  opacity:0.85; transition:opacity 120ms ease, color 120ms ease, background 120ms ease;
}
.agent-pane-chat .agent-msg:hover .agc-copy-btn,
.agent-pane-chat .agc-copy-btn:focus-visible { opacity:1; }
.agent-pane-chat .agc-copy-btn:hover { color:var(--ink-primary); background:var(--bg-card-hover); }
.agent-pane-chat .agent-bubble { user-select:text; -webkit-user-select:text; }
.agent-pane-chat #agent-quick-edit.active { border-color:var(--status-warning); color:var(--status-warning); }
.agent-pane-chat .agent-quick-remove {
  background:none; border:none; color:var(--ink-secondary); cursor:pointer;
  font-size:14px; line-height:1; padding:0 2px;
}
.agent-pane-chat .agent-quick-remove:hover { color:var(--status-critical); }
.agc-page-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
.agc-page-head-text { flex:1; min-width:0; }
.agc-page-title { margin:0; font-size:1.25rem; }
.agc-page-subtitle { margin:4px 0 0; font-size:13px; line-height:1.45; color:var(--ink-secondary); max-width:42rem; }
.agc-tool-catalog {
  position:sticky; top:0; z-index:5; margin:0 0 10px; border:1px solid var(--gridline);
  border-radius:10px; background:color-mix(in srgb, var(--bg-card) 96%, var(--accent) 4%);
  box-shadow:0 4px 16px color-mix(in srgb, #000 10%, transparent);
}
.agc-tool-catalog-summary {
  display:flex; align-items:center; gap:8px; padding:8px 12px; cursor:pointer; list-style:none;
  font-size:12px; font-weight:700; color:var(--ink-primary);
}
.agc-tool-catalog-summary::-webkit-details-marker { display:none; }
.agc-tool-catalog-summary::before { content:"▸"; font-size:10px; transition:transform 120ms ease; }
.agc-tool-catalog[open] .agc-tool-catalog-summary::before { transform:rotate(90deg); }
.agc-tool-catalog-summary-note { margin-left:auto; font-size:10px; font-weight:500; color:var(--ink-secondary); }
.agc-tool-catalog-grid {
  display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px;
  padding:0 10px 10px;
}
.agc-tool-group { min-width:0; padding:8px; border-radius:8px; background:var(--bg-card); border:1px solid var(--gridline); }
.agc-tool-group-title { display:block; margin-bottom:6px; font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-secondary); }
.agc-tool-list { display:flex; flex-wrap:wrap; gap:4px; }
.agc-tool-name {
  display:inline-flex; padding:3px 6px; border-radius:6px; font:500 10px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace;
  color:var(--ink-primary); background:var(--bg-card-hover); border:1px solid var(--border);
}
.agc-tool-safety { margin:0; padding:0 12px 9px; font-size:10px; color:var(--ink-secondary); }
@media (max-width:900px) {
  .agc-tool-catalog-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
}
@media (max-width:560px) {
  .agc-tool-catalog-grid { grid-template-columns:1fr; max-height:230px; overflow:auto; }
  .agc-tool-catalog-summary-note { display:none; }
}
.agc-pane { display:flex; flex-direction:column; min-height:0; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card); padding:10px 12px; }
.agc-pane-stub { margin:0 0 8px; font-size:12px; line-height:1.45; color:var(--ink-secondary); }
.agc-history-section { margin-top:4px; padding-top:8px; border-top:1px solid var(--gridline); flex:1; display:flex; flex-direction:column; min-height:0; }
.agc-history-label { font-size:10px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-secondary); margin:0 0 6px; }
.agc-status-pill { font-size:10px; font-weight:600; letter-spacing:0.02em; }
.agc-mode-group { display:flex; gap:4px; }
.agc-mode-btn {
  font-size:10px; padding:4px 9px; opacity:0.55; color:var(--ink-secondary);
  transition:opacity 120ms ease, color 120ms ease;
}
.agc-mode-btn:not(.active):hover { opacity:1; color:var(--ink-primary); }
.agc-mode-btn.active { opacity:1; }
.agc-approvals { margin-bottom:10px; }
.agc-approvals-note { font-size:12px; color:var(--status-warning); margin:0 0 8px; }
.agc-chat-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; gap:8px; }
.agc-chat-label { font-size:12px; font-weight:600; color:var(--ink-secondary); }
.agc-conv-bar {
  position:relative; display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 8px;
  padding:4px 0; max-width:100%;
}
.agc-conv-current {
  flex:1; min-width:160px; display:flex; align-items:center; gap:8px; text-align:left;
  padding:8px 10px; border-radius:10px; border:1px solid var(--border); background:var(--bg-card);
  color:var(--ink-primary); cursor:pointer;
}
.agc-conv-current:hover, .agc-conv-current[aria-expanded="true"] {
  border-color:var(--accent, #6366f1);
}
.agc-conv-current-label {
  font-size:10px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;
  color:var(--ink-secondary); flex-shrink:0;
}
.agc-conv-current-title { flex:1; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agc-conv-caret { color:var(--ink-secondary); font-size:11px; }
.agc-conv-actions { display:flex; gap:4px; flex-wrap:wrap; }
.agc-conv-popover {
  position:absolute; z-index:8; top:calc(100% - 2px); left:0; right:0;
  max-height:280px; overflow:hidden; display:flex; flex-direction:column;
  border:1px solid var(--border); border-radius:10px; background:var(--bg-card);
  box-shadow:0 10px 28px color-mix(in srgb, #000 18%, transparent);
}
.agc-conv-search {
  margin:8px 8px 0; font-size:12px; padding:7px 9px; border-radius:8px;
  border:1px solid var(--border); background:var(--bg);
  color:var(--ink-primary);
}
.agc-conv-list { overflow:auto; padding:6px; display:flex; flex-direction:column; gap:4px; }
.agc-conv-item {
  display:flex; flex-direction:column; gap:2px; text-align:left; padding:8px 9px;
  border:1px solid transparent; border-radius:8px; background:transparent; color:inherit; cursor:pointer;
}
.agc-conv-item:hover { background:var(--bg-card-hover); }
.agc-conv-item.active { border-color:var(--accent, #6366f1); background:color-mix(in srgb, var(--accent, #6366f1) 10%, transparent); }
.agc-conv-item-title { font-size:13px; font-weight:600; }
.agc-conv-item-preview { font-size:11px; color:var(--ink-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agc-conv-item-meta { font-size:10px; color:var(--ink-secondary); }
.agc-conv-select { display:none; }
.agc-conv-new, .agc-conv-rename, .agc-conv-delete { font-size:10px; padding:3px 8px; flex-shrink:0; }
.agc-bug-card {
  padding:10px; border:1px solid var(--border); border-radius:10px; background:var(--bg-card);
  margin:0 0 8px;
}
.agc-bug-title { font-size:13px; font-weight:650; }
.agc-bug-details { font-size:12px; color:var(--ink-secondary); margin:6px 0 8px; white-space:pre-wrap; }
.agc-bug-actions { display:flex; gap:6px; flex-wrap:wrap; }
.agc-menu-btn {
  font-size:16px; line-height:1; padding:2px 8px; min-width:28px;
  color:var(--ink-secondary); background:transparent; border:1px solid transparent; border-radius:6px;
}
.agc-menu-btn:hover, .agc-menu-btn.agc-open { border-color:var(--border); background:var(--bg-card-hover); color:var(--ink-primary); }
.agc-toolbar {
  display:none; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:6px;
  padding:6px 8px; border-radius:8px; background:var(--bg-card-hover); border:1px solid var(--gridline);
}
.agc-toolbar.agc-open { display:flex; }
.agc-toolbar input[type="search"] { font-size:11px; padding:3px 8px; max-width:140px; min-width:90px; flex:1; }
.agc-toolbar-count { font-size:10px; color:var(--ink-secondary); }
.agc-toolbar .secondary { font-size:10px; padding:3px 8px; }
.agc-input-zone { margin-top:auto; padding-top:6px; border-top:1px solid var(--gridline); }
.agc-quick-row { display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-bottom:6px; }
.agc-quick-row .agent-quick-prompt, .agc-quick-row .secondary { font-size:10px; padding:2px 8px; border-radius:999px; }
.agc-compose-row { display:flex; gap:6px; align-items:flex-end; flex-wrap:wrap; }
.agc-file-chips { display:flex; flex-wrap:wrap; gap:4px; align-items:center; max-width:100%; }
.agc-file-chip { display:inline-flex; align-items:center; gap:4px; max-width:160px; font-size:10px; }
.agc-file-chip-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agc-quiet-btn {
  font-size:10px; padding:4px 8px; color:var(--ink-secondary); opacity:0.5;
  border:1px solid var(--border); border-radius:6px; background:transparent; cursor:pointer;
  transition:opacity 120ms ease, color 120ms ease, border-color 120ms ease;
}
.agc-quiet-btn:hover { opacity:1; color:var(--ink-primary); border-color:var(--ink-secondary); }
.agc-input {
  flex:1; min-width:160px; font-size:15px; padding:10px 12px; border-radius:8px;
  border:1px solid var(--border); background:var(--bg-card);
  resize:vertical; min-height:44px; max-height:160px; line-height:1.4; font-family:inherit;
}
.agc-input:focus { outline:none; border-color:var(--accent, #6366f1); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent, #6366f1) 18%, transparent); }
.agc-send { padding:10px 16px; font-size:14px; }
.agc-activity-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
.agc-activity-label { font-size:12px; font-weight:600; color:var(--ink-secondary); }
.agc-running-label { font-size:10px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-secondary); margin:0 0 4px; }
.agc-running-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.agc-running-chip {
  display:inline-flex; align-items:center; gap:5px; font-size:11px;
  padding:3px 6px 3px 8px; border-radius:999px; border:1px solid var(--border);
  background:var(--bg-card-hover);
}
.agc-running-dot {
  width:6px; height:6px; border-radius:50%; flex-shrink:0;
  animation:livepulse 1.2s ease-in-out infinite;
}
.agc-running-name { font-size:10px; padding:1px 6px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.agc-running-age { color:var(--ink-secondary); font-size:10px; flex-shrink:0; }
.agc-running-kill {
  border:1px solid var(--border); background:transparent; color:var(--ink-secondary); cursor:pointer;
  font-size:10px; line-height:1.2; padding:2px 6px; border-radius:4px; flex-shrink:0;
}
.agc-running-kill:hover { color:var(--status-critical); border-color:color-mix(in srgb, var(--status-critical) 40%, var(--border)); background:color-mix(in srgb, var(--status-critical) 8%, transparent); }
.agc-running-idle { line-height:1.55; padding:8px 4px; margin:0; font-size:12px; color:var(--ink-secondary); }
.agc-manager-tabs { display:flex; gap:4px; margin:0 0 8px; }
.agc-manager-tab { font-size:10px; padding:4px 10px; opacity:0.55; color:var(--ink-secondary); }
.agc-manager-tab:not(.active):hover { opacity:1; color:var(--ink-primary); }
.agc-manager-tab.active { opacity:1; }
.agc-manager-panel { display:flex; flex-direction:column; min-height:0; flex:1; }
.agc-manager-panel[hidden] { display:none !important; }
.agc-history-controls {
  display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin:8px 0 4px;
  padding:4px 0; border-top:1px solid var(--gridline);
}
.agc-history-controls .secondary { font-size:10px; padding:2px 7px; }
.agc-history-controls .agent-filter-chip { font-size:10px; padding:2px 8px; }
.agc-filter-wrap { display:flex; flex-wrap:wrap; gap:4px; flex:1; min-width:0; }
.agc-chat-head-actions { display:flex; align-items:center; gap:4px; }
.agc-help-btn {
  font-size:12px; font-weight:700; line-height:1; width:22px; height:22px; padding:0;
  border-radius:50%; border:1px solid var(--border); background:var(--bg-card-hover);
  color:var(--ink-secondary); cursor:pointer;
}
.agc-help-btn:hover, .agc-help-btn.agc-open { color:var(--ink-primary); border-color:var(--ink-secondary); }
.agc-cap-panel {
  display:none; margin:0 0 8px; padding:10px 12px; border-radius:8px;
  border:1px solid var(--gridline); background:var(--bg-card-hover); font-size:12px; line-height:1.55;
}
.agc-cap-panel.agc-open { display:block; }
.agc-cap-panel h4 { margin:0 0 6px; font-size:12px; font-weight:600; color:var(--ink-primary); }
.agc-cap-panel ul { margin:0 0 8px 16px; padding:0; color:var(--ink-secondary); }
.agc-cap-panel ul:last-child { margin-bottom:0; }
.agc-cap-note { margin:8px 0 0; font-size:11px; color:var(--ink-secondary); }
.agc-trace-card { min-width:min(100%, 280px); }
.agc-trace-head { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; margin-bottom:8px; }
.agc-trace-steps { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:4px; }
.agc-trace-step {
  font-size:12px; color:var(--ink-secondary); padding:4px 8px; border-radius:6px;
  border-left:2px solid transparent; transition:color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.agc-trace-step.agc-trace-active {
  color:var(--ink-primary); border-left-color:var(--accent, #6366f1);
  background:color-mix(in srgb, var(--accent, #6366f1) 8%, transparent);
}
.agc-what-i-did { margin-top:8px; font-size:11px; max-width:100%; min-width:0; }
.agc-what-i-did-summary {
  cursor:pointer; color:var(--ink-secondary); font-weight:600; user-select:none;
  list-style:none; display:flex; align-items:center; gap:4px; max-width:100%;
  overflow-wrap:anywhere; word-break:break-word;
}
.agc-what-i-did-summary::-webkit-details-marker { display:none; }
.agc-what-i-did-summary::before { content:"▸"; font-size:10px; transition:transform 120ms ease; flex-shrink:0; }
.agc-what-i-did[open] .agc-what-i-did-summary::before { transform:rotate(90deg); }
.agc-step-list { margin:6px 0 0; padding:0 0 0 4px; list-style:none; display:flex; flex-direction:column; gap:3px; max-width:100%; min-width:0; }
.agc-step-line {
  font-size:11px; line-height:1.45; color:var(--ink-secondary); padding-left:8px;
  border-left:2px solid var(--gridline); max-width:100%; min-width:0;
  overflow-wrap:anywhere; word-break:break-word;
}
.agc-fact-check {
  margin-top:8px; padding:6px 8px; border-radius:6px; font-size:10px; line-height:1.4;
  color:var(--ink-secondary); border:1px solid color-mix(in srgb, var(--status-warning) 35%, var(--gridline));
  background:color-mix(in srgb, var(--status-warning) 8%, var(--bg-card));
  max-width:100%; overflow-wrap:anywhere; word-break:break-word;
}
.agc-fact-check-label { font-weight:700; letter-spacing:0.03em; text-transform:uppercase; margin-right:4px; }
.agc-thinking { margin-top:8px; font-size:11px; max-width:100%; min-width:0; }
.agc-thinking-summary {
  cursor:pointer; color:var(--ink-secondary); font-weight:600; user-select:none;
  list-style:none; display:flex; align-items:center; gap:4px; max-width:100%;
}
.agc-thinking-summary::-webkit-details-marker { display:none; }
.agc-thinking-summary::before { content:"▸"; font-size:10px; transition:transform 120ms ease; flex-shrink:0; }
.agc-thinking[open] .agc-thinking-summary::before { transform:rotate(90deg); }
.agc-thinking-body {
  display:block; margin:6px 0 0; padding:8px 10px; border-radius:6px; background:var(--bg-card-hover);
  border:1px solid var(--gridline); font-size:11px; line-height:1.45; font-family:inherit;
  white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word;
  color:var(--ink-secondary); max-height:240px; max-width:100%; min-width:0;
  box-sizing:border-box; overflow-x:auto; overflow-y:auto;
}
.agent-bubble .agc-thinking, .agent-bubble .agc-what-i-did { max-width:100%; min-width:0; }
.agc-followups {
  margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:7px;
}
.agc-choice-label {
  grid-column:1 / -1; font-size:10px; font-weight:700; letter-spacing:.06em;
  text-transform:uppercase; color:var(--ink-secondary);
}
.agc-followup-chip {
  display:flex; align-items:center; gap:8px; min-height:40px; width:100%; font-size:11px;
  padding:8px 10px; border-radius:12px; cursor:pointer;
  border:1px solid color-mix(in srgb, var(--accent, #6366f1) 22%, var(--border));
  background:linear-gradient(145deg, color-mix(in srgb, var(--accent, #6366f1) 8%, var(--bg-card)), var(--bg-card-hover));
  color:var(--ink-primary); max-width:100%; text-align:left; line-height:1.35;
  box-shadow:0 2px 8px color-mix(in srgb, #000 8%, transparent);
  transition:transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.agc-followup-chip:hover {
  transform:translateY(-1px); border-color:var(--accent, #6366f1);
  box-shadow:0 5px 14px color-mix(in srgb, var(--accent, #6366f1) 16%, transparent);
}
.agc-followup-chip.agc-choice-working {
  opacity:.72; cursor:wait; transform:none; box-shadow:none;
}
.agc-choice-index {
  display:grid; place-items:center; width:22px; height:22px; flex:0 0 22px; border-radius:8px;
  background:color-mix(in srgb, var(--accent, #6366f1) 14%, var(--bg-card));
  color:var(--accent, #6366f1); font-size:10px; font-weight:800;
}
.agc-choice-text { flex:1; overflow-wrap:anywhere; }
.agc-choice-arrow { color:var(--ink-secondary); font-size:14px; }
.agc-staged-edits { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
.agc-repo-links { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
.agc-repo-links-label { font-size:10px; font-weight:600; color:var(--ink-secondary); margin-right:2px; }
.agc-repo-open {
  font-size:10px; padding:2px 8px; border-radius:999px; cursor:pointer;
  border:1px solid var(--border); background:var(--bg-card-hover); color:var(--ink-primary);
}
.agc-repo-open:hover { border-color:var(--accent, #6366f1); color:var(--accent, #6366f1); }
.agc-confirm-card {
  margin-top:10px; padding:12px 14px; border-radius:12px;
  border:1px solid color-mix(in srgb, var(--status-warning) 45%, var(--gridline));
  background:linear-gradient(145deg, color-mix(in srgb, var(--status-warning) 9%, var(--bg-card)), var(--bg-card));
  box-shadow:0 4px 14px color-mix(in srgb, #000 9%, transparent);
}
.agc-confirm-title { margin:0 0 6px; font-size:12px; font-weight:700; color:var(--ink-primary); display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.agc-confirm-tool-name {
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size:11px; font-weight:650; letter-spacing:0; color:var(--accent, #c45c26);
}
.agc-confirm-summary { margin:0 0 8px; font-size:12px; line-height:1.45; color:var(--ink-secondary); }
.agc-confirm-list { margin:0 0 10px 16px; padding:0; font-size:12px; line-height:1.45; color:var(--ink-secondary); }
.agc-confirm-warning, .agc-action-warning {
  margin:0 0 10px; padding:8px 10px; border-radius:8px; font-size:11px; line-height:1.45;
  color:var(--status-warning); border:1px solid color-mix(in srgb, var(--status-warning) 45%, var(--gridline));
  background:color-mix(in srgb, var(--status-warning) 10%, var(--bg-card));
}
.agc-action-warning { margin-top:10px; margin-bottom:0; color:var(--ink-primary); }
.agc-confirm-duplicates { margin:5px 0 0; color:var(--ink-secondary); }
.agc-confirm-recall { margin:0 0 10px; padding:8px 10px; border-radius:6px; border:1px solid color-mix(in srgb, var(--accent) 28%, var(--gridline)); background:color-mix(in srgb, var(--accent) 7%, var(--bg-card)); }
.agc-confirm-recall-label { margin:0 0 4px; font-size:10px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-muted); }
.agc-confirm-recall .agc-confirm-list { margin-bottom:0; }
.agc-confirm-actions { display:flex; gap:8px; flex-wrap:wrap; }
.agent-pane-chat { --agc-mark: color-mix(in srgb, var(--skin-a, var(--accent, #c45c26)) 80%, #8a5a12); }
.agent-pane-chat #agent-log {
  gap:14px; padding:8px 4px 18px;
  background:
    radial-gradient(1200px 280px at 10% 0%, color-mix(in srgb, var(--skin-a, var(--accent)) 7%, transparent), transparent 70%),
    var(--bg-card);
}
.agent-pane-chat .agent-msg { display:flex; width:100%; }
.agent-pane-chat .agent-msg.user { justify-content:flex-end; }
.agent-pane-chat .agent-msg.assistant { justify-content:flex-start; }
.agent-pane-chat .agc-bubble-wrap { max-width:min(72%, 42rem); }
.agent-pane-chat .agent-bubble {
  user-select:text; -webkit-user-select:text; cursor:text;
  padding:12px 38px 12px 14px; border-radius:2px 16px 16px 16px;
  border:1px solid color-mix(in srgb, var(--gridline) 80%, var(--skin-b, #c9a227) 20%);
  background:color-mix(in srgb, var(--bg-card) 92%, var(--skin-b, #c9a227) 8%);
  color:var(--ink-primary); font-size:14px; line-height:1.55;
  box-shadow:none;
}
.agent-pane-chat .agent-msg.user .agent-bubble {
  border-radius:16px 2px 16px 16px;
  background:color-mix(in srgb, var(--bg) 88%, var(--skin-a, var(--accent)) 12%);
}
.agent-pane-chat .agc-copy-btn, .agent-pane-chat .agc-quote-obs {
  position:absolute; top:6px; width:26px; height:26px; padding:0;
  border:1px solid color-mix(in srgb, var(--border) 70%, var(--skin-b, #c9a227) 30%);
  border-radius:8px; background:color-mix(in srgb, var(--bg-card) 88%, transparent);
  color:var(--ink-secondary); cursor:pointer; opacity:.7;
  display:grid; place-items:center;
}
.agent-pane-chat .agc-copy-btn { right:6px; }
.agent-pane-chat .agc-quote-obs { right:36px; }
.agent-pane-chat .agc-copy-btn:hover, .agent-pane-chat .agc-quote-obs:hover {
  opacity:1; color:var(--ink-primary);
  border-color:var(--skin-a, var(--accent));
  background:color-mix(in srgb, var(--skin-a, var(--accent)) 12%, var(--bg-card));
}
.agent-pane-chat .agc-icon { width:13px; height:13px; display:block; fill:currentColor; }
.agc-followup-chip, .agc-confirm-actions .agc-act, .agc-bug-actions .agc-act,
.agc-spawn-btn, .agc-send, .agc-mic, .agc-stop-rec {
  min-height:40px; border-radius:999px; font-weight:650; letter-spacing:.02em;
  border:1px solid color-mix(in srgb, var(--skin-a, var(--accent)) 35%, var(--border));
  background:linear-gradient(180deg, color-mix(in srgb, var(--skin-b, #c9a227) 14%, var(--bg-card)), var(--bg-card));
  box-shadow:inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent);
}
.agc-confirm-actions .agc-act-primary, .agc-send, .agc-spawn-btn, .agc-voice-send, .agc-cost-yes {
  background:linear-gradient(180deg, color-mix(in srgb, var(--skin-a, var(--accent)) 78%, #fff 8%), color-mix(in srgb, var(--skin-a, var(--accent)) 88%, #111 12%));
  color:#f7efe4; border-color:transparent;
}
.agc-confirm-actions .agc-act-ghost, .agc-stop, .agc-voice-discard, .agc-cost-no {
  background:transparent; color:var(--ink-primary);
}
.agc-preview-table { width:100%; border-collapse:collapse; font-size:11px; margin:0 0 10px; }
.agc-preview-table th, .agc-preview-table td {
  text-align:left; padding:6px 8px; border-bottom:1px solid var(--gridline);
  user-select:text; -webkit-user-select:text;
}
.agc-preview-table th { font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-secondary); }
.agc-preview-dup { color:var(--status-warning); }
.agc-result-ids {
  margin-top:8px; font:500 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  color:var(--ink-secondary); user-select:text;
}
.agc-compose-row { align-items:flex-end; gap:8px; }
.agc-send { padding:10px 18px; font-size:13px; }
.agc-mic, .agc-stop-rec, .agc-quiet-btn {
  width:40px; height:40px; display:grid; place-items:center; padding:0;
}
.agc-mic-active, .agc-stop-rec {
  color:var(--status-critical); border-color:color-mix(in srgb, var(--status-critical) 50%, var(--border));
}
.agc-voice-review {
  display:flex; flex-direction:column; gap:8px; margin:0 0 8px; padding:10px 12px;
  border-radius:12px; border:1px solid color-mix(in srgb, var(--skin-b, #c9a227) 40%, var(--border));
  background:color-mix(in srgb, var(--bg-card) 90%, var(--skin-b, #c9a227) 10%);
}
.agc-voice-review textarea {
  width:100%; min-height:72px; resize:vertical; font:inherit; line-height:1.45;
  padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg);
  color:var(--ink-primary); user-select:text;
}
.agc-voice-review-actions { display:flex; gap:8px; justify-content:flex-end; }
.agc-spawn-form { display:flex; flex-direction:column; gap:6px; margin:8px 0 12px; }
.agc-spawn-form input, .agc-spawn-form textarea {
  font:inherit; font-size:12px; padding:8px 10px; border-radius:8px;
  border:1px solid var(--border); background:var(--bg); color:var(--ink-primary);
}
.agc-websearch-chip {
  font-size:10px; letter-spacing:.04em; text-transform:uppercase; padding:2px 8px; border-radius:999px;
  border:1px solid var(--border); color:var(--ink-secondary);
}
.agc-websearch-chip.off { color:var(--status-warning); border-color:color-mix(in srgb, var(--status-warning) 40%, var(--border)); }
.agc-cost-overlay {
  position:fixed; inset:0; z-index:100080; display:grid; place-items:center;
  background:color-mix(in srgb, #120c08 62%, transparent);
}
.agc-cost-card {
  width:min(420px, calc(100vw - 32px)); padding:22px 22px 18px; border-radius:18px;
  border:1px solid color-mix(in srgb, var(--skin-b, #c9a227) 55%, var(--border));
  background:linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 92%, var(--skin-b, #c9a227) 8%), var(--bg-card));
  box-shadow:0 24px 60px color-mix(in srgb, #000 35%, transparent);
}
.agc-cost-card h2 { margin:0 0 8px; font-size:18px; letter-spacing:.02em; }
.agc-cost-card p { margin:0; font-size:13px; line-height:1.5; color:var(--ink-secondary); }
.agc-cost-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }
.agc-cost-actions button { min-height:40px; padding:8px 16px; border-radius:999px; cursor:pointer; }
.agc-stream-cursor::after {
  content:""; display:inline-block; width:.55em; height:1em; margin-left:2px; vertical-align:-2px;
  background:currentColor; animation:agc-caret 1s steps(1) infinite;
}
@keyframes agc-caret { 50% { opacity:0; } }
.agent-working-trace .agent-bubble { opacity:.85; }
</style>`;
}

function agentFormatSnippetValue(v) {
  if (v == null || v === "") return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (Array.isArray(v)) return v.map(agentFormatSnippetValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const parts = [
      v.name, v.title, v.summary, v.what_they_do, v.company,
      v.email, v.notes, v.description, v.path, v.query, v.filename,
    ].map(x => (x != null && x !== "" ? String(x).trim() : "")).filter(Boolean);
    if (parts.length) return parts.slice(0, 3).join(" · ");
    try { return JSON.stringify(v).slice(0, 100); } catch (_) { return ""; }
  }
  return String(v).trim();
}

function agentToolInputSnippet(tool, input) {
  const i = input || {};
  const pick = (...keys) => {
    for (const k of keys) {
      const v = i[k];
      const formatted = agentFormatSnippetValue(v);
      if (formatted) return formatted;
    }
    return "";
  };
  switch (tool) {
    case "update_task": {
      const bits = [];
      if (pick("title")) bits.push(pick("title"));
      if (pick("urgency")) bits.push(`urgency ${pick("urgency")}`);
      if (pick("status")) bits.push(`status ${pick("status")}`);
      if (pick("due_date")) bits.push(`due ${pick("due_date")}`);
      if (!bits.length && pick("task_id")) bits.push(`#${pick("task_id")}`);
      return bits.join(" → ");
    }
    case "add_task":
      return pick("title") || pick("urgency") || "";
    case "list_tasks":
      return pick("search", "status") || "all open";
    case "complete_task":
    case "delete_task":
      return pick("task_id") ? `#${pick("task_id")}` : "";
    case "add_calendar_event":
      return [pick("title"), pick("date")].filter(Boolean).join(" · ");
    case "add_goal":
      return [pick("title"), pick("deadline")].filter(Boolean).join(" · ");
    case "add_idea":
      return pick("title");
    case "add_project":
      return pick("name");
    case "add_customer":
      return pick("name", "company");
    case "add_contact":
    case "update_contact": {
      const bits = [
        pick("name") || (pick("contact_id") ? `#${pick("contact_id")}` : ""),
        pick("what_they_do"),
        pick("email"),
        pick("met_where"),
        pick("closeness"),
      ].filter(Boolean);
      if (pick("notes") && bits.length < 3) bits.push(pick("notes").slice(0, 60));
      return bits.join(" · ");
    }
    case "list_contacts":
    case "list_customers":
      return pick("search") || "all";
    case "update_customer":
      return [pick("customer_id") ? `#${pick("customer_id")}` : "", pick("name", "company", "status")].filter(Boolean).join(" · ");
    case "update_project":
      return [pick("project_id") ? `#${pick("project_id")}` : "", pick("name", "status")].filter(Boolean).join(" · ");
    case "update_idea":
      return [pick("idea_id") ? `#${pick("idea_id")}` : "", pick("title")].filter(Boolean).join(" · ");
    case "update_note":
      return [pick("note_id") ? `#${pick("note_id")}` : "", pick("title", "status")].filter(Boolean).join(" · ");
    case "update_calendar_event":
    case "complete_calendar_event":
    case "delete_calendar_event":
    case "complete_event":
    case "delete_event":
      return [pick("event_id") ? `#${pick("event_id")}` : "", pick("title", "date", "status", "kind")].filter(Boolean).join(" · ");
    case "create_situation": {
      const bits = [pick("summary")].filter(Boolean);
      if (i.contact) bits.push(`contact ${agentFormatSnippetValue(i.contact)}`);
      if (i.task) bits.push(`task ${agentFormatSnippetValue(i.task)}`);
      if (i.project_note) bits.push(`project note`);
      if (i.calendar_event) bits.push(`event ${agentFormatSnippetValue(i.calendar_event)}`);
      if (i.note) bits.push(`note ${agentFormatSnippetValue(i.note)}`);
      return bits.join(" · ") || "linked records";
    }
    case "add_note":
      return pick("title", "body");
    case "list_repository_files":
      return pick("category") || "all files";
    case "read_repository_file": {
      const name = pick("filename");
      const id = pick("file_id");
      if (name) return name;
      if (id) return `#${id}`;
      return "";
    }
    case "classify_into_lists":
      return pick("filename", "file_id", "bias_list") || "document";
    case "search_repository":
      return pick("query", "search");
    case "summarize_repository":
      return pick("path", "query") || "repository";
    case "get_state":
      return "planner overview";
    case "scan_competitions":
      return pick("project_description").slice(0, 80);
    case "read_project_file":
      return pick("path");
    case "propose_file_edit":
      return pick("path");
    case "propose_command":
      return pick("command");
    case "web_search":
      return pick("query");
    default:
      return Object.values(i).slice(0, 3).map(agentFormatSnippetValue).filter(Boolean).join(" · ");
  }
}

function friendlyActionLine(action) {
  const tool = action?.tool || "";
  const input = action?.input || {};
  const snippet = agentToolInputSnippet(tool, input);
  const labels = {
    update_task: "✎ Updated task",
    add_task: "＋ Added task",
    list_tasks: "☰ Listed tasks",
    complete_task: "✓ Completed task",
    delete_task: "✕ Deleted task",
    add_calendar_event: "📅 Added event",
    add_goal: "🎯 Added goal",
    add_idea: "💡 Saved idea",
    add_project: "📁 Added project",
    add_customer: "👤 Added customer",
    add_contact: "👥 Added contact",
    list_contacts: "☰ Listed contacts",
    update_contact: "✎ Updated contact",
    list_customers: "☰ Listed customers",
    update_customer: "✎ Updated customer",
    update_project: "✎ Updated project",
    update_idea: "✎ Updated idea",
    update_note: "✎ Updated note",
    update_calendar_event: "✎ Updated event",
    complete_calendar_event: "✓ Completed event",
    delete_calendar_event: "✕ Deleted event",
    complete_event: "✓ Completed event",
    delete_event: "✕ Deleted event",
    create_situation: "📋 Recorded situation",
    add_note: "📝 Added note",
    list_repository_files: "📚 Listed repository files",
    read_repository_file: "📖 Read repository file",
    classify_into_lists: "🗂 Classified into lists",
    search_repository: "🔍 Searched repository",
    summarize_repository: "📄 Summarized repository",
    get_state: "📊 Read planner state",
    scan_competitions: "🏆 Scanned competitions",
    read_project_file: "📂 Read file",
    propose_file_edit: "✎ Proposed file edit",
    propose_command: "⌘ Proposed command",
    web_search: "🌐 Web search",
  };
  const label = labels[tool] || `⚙ ${tool.replace(/_/g, " ")}`;
  return snippet ? `${label}: ${snippet}` : label;
}

function agentStepText(step) {
  if (step == null) return "";
  if (typeof step === "string") return step.trim();
  if (typeof step === "object") {
    const text = step.description || step.text;
    const formatted = agentFormatSnippetValue(text);
    if (formatted) return formatted;
    if (step.tool) return friendlyActionLine(step);
    return agentFormatSnippetValue(step);
  }
  return String(step).trim();
}

/** After the agent mutates data, refresh the live tab so changes actually show. */
function agentRefreshAffectedViews(actions) {
  const completed = (Array.isArray(actions) ? actions : []).filter(action => {
    if (!action?.tool) return false;
    const result = action.result;
    if (!result || typeof result !== "object") return true;
    return !result.error && !result.needs_confirmation && result.ok !== false;
  });
  const tools = completed.map(a => a.tool);
  if (!tools.length) return;
  const tab = typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "";
  const touches = {
    Tasks: ["add_task", "update_task", "complete_task", "delete_task", "create_situation"],
    Contacts: ["add_contact", "update_contact", "delete_contact", "create_situation"],
    Customers: ["add_customer", "update_customer", "create_situation"],
    Goals: ["add_goal", "delete_goal"],
    Ideas: ["add_idea", "update_idea", "delete_idea"],
    Projects: ["add_project", "update_project", "add_project_note", "delete_project", "create_situation"],
    Calendar: ["add_calendar_event", "update_calendar_event", "complete_calendar_event", "delete_calendar_event", "delete_event", "create_situation"],
    Events: ["add_calendar_event", "update_calendar_event", "complete_calendar_event", "delete_calendar_event", "delete_event"],
    Skills: ["add_note", "update_note", "delete_note", "classify_into_lists"],
    Problems: ["add_note", "update_note", "delete_note", "classify_into_lists"],
    Thinking: ["add_note", "update_note", "delete_note", "classify_into_lists"],
    Funny: ["add_note", "update_note", "delete_note", "classify_into_lists"],
    Essays: ["add_note", "update_note", "delete_note", "classify_into_lists"],
    Repository: ["search_repository", "read_repository_file", "delete_repository_file", "classify_into_lists"],
    Today: ["add_task", "update_task", "add_calendar_event", "update_calendar_event", "complete_calendar_event", "delete_calendar_event", "create_situation"],
  };
  const needsRender = Object.entries(touches).some(([t, list]) =>
    t === tab && list.some(name => tools.includes(name))
  );
  if (needsRender && typeof render === "function") {
    try { Promise.resolve(render()).catch(() => {}); } catch (_) { /* ignore */ }
  }
  if (typeof refreshHudData === "function") {
    try { refreshHudData(); } catch (_) { /* ignore */ }
  }
  try {
    window.dispatchEvent(new CustomEvent("waypoint:data-changed", { detail: { tools } }));
  } catch (_) { /* ignore */ }
}

function agentStepLines(result) {
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const lines = steps.map(agentStepText).filter(Boolean);
  if (lines.length) return lines;
  const actions = Array.isArray(result?.actions) ? result.actions : [];
  return actions.map(friendlyActionLine).filter(Boolean);
}

function agentMessageStepLines(m) {
  if (Array.isArray(m?.steps) && m.steps.length) {
    return m.steps.map(agentStepText).filter(Boolean);
  }
  if (Array.isArray(m?.actions) && m.actions.length) {
    return m.actions.map(friendlyActionLine).filter(Boolean);
  }
  return [];
}

function agentRepoFileRefsFromAction(action) {
  const tool = action?.tool || "";
  if (!REPO_AGENT_TOOLS.has(tool)) return [];
  const input = action?.input || {};
  const result = action?.result;
  const refs = [];
  const seen = new Set();
  const add = (id, label) => {
    if (id == null || id === "") return;
    const sid = String(id);
    if (seen.has(sid)) return;
    seen.add(sid);
    const name = String(label || "").trim();
    refs.push({ id: sid, label: name || `File #${sid}` });
  };

  if (tool === "read_repository_file") {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      add(result.id ?? result.file_id, result.filename || result.name);
    }
    add(input.file_id, input.filename);
    return refs.slice(0, REPO_AGENT_LINK_LIMIT);
  }

  if (tool === "list_repository_files") {
    const files = Array.isArray(result?.files) ? result.files : [];
    for (const f of files) {
      add(f.id ?? f.file_id, f.filename || f.name);
      if (refs.length >= REPO_AGENT_LINK_LIMIT) break;
    }
    return refs;
  }

  if (tool === "search_repository") {
    const hits = Array.isArray(result?.results) ? result.results : [];
    for (const h of hits) {
      add(h.file_id ?? h.id, h.filename || h.name);
      if (refs.length >= REPO_AGENT_LINK_LIMIT) break;
    }
    return refs;
  }

  return refs;
}

function agentRepoFileRefsFromActions(actions) {
  const refs = [];
  const seen = new Set();
  for (const action of actions || []) {
    for (const ref of agentRepoFileRefsFromAction(action)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      refs.push(ref);
      if (refs.length >= REPO_AGENT_LINK_LIMIT) return refs;
    }
  }
  return refs;
}

function agentRepoLinksHtml(actions) {
  const refs = agentRepoFileRefsFromActions(actions);
  if (!refs.length) return "";
  const links = refs.map(ref =>
    `<button type="button" class="agc-repo-open" data-repo-file-id="${escapeHtml(ref.id)}" title="Open in Repository">Open in Repository: ${escapeHtml(ref.label)}</button>`
  ).join("");
  return `<div class="agc-repo-links"><span class="agc-repo-links-label">Repository</span>${links}</div>`;
}

async function agentEnrichRepositoryActions(actions) {
  if (!Array.isArray(actions) || !actions.length) return [];
  const enriched = [];
  for (const action of actions) {
    const copy = { ...action };
    if (!REPO_AGENT_TOOLS.has(copy.tool)) {
      enriched.push(copy);
      continue;
    }
    if (copy.result == null) {
      const input = copy.input || {};
      try {
        if (copy.tool === "list_repository_files") {
          const category = input.category ? `?category=${encodeURIComponent(input.category)}` : "";
          const files = await api(`/api/repo/files${category}`);
          if (Array.isArray(files)) copy.result = { files };
        } else if (copy.tool === "search_repository") {
          const query = String(input.query || input.search || "").trim();
          if (query) {
            const data = await api("/api/repo/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, k: REPO_AGENT_LINK_LIMIT }),
            });
            copy.result = { results: Array.isArray(data?.results) ? data.results : [] };
          }
        } else if (copy.tool === "read_repository_file" && input.file_id != null) {
          copy.result = { id: input.file_id, filename: input.filename };
        }
      } catch (_) { /* keep action without result */ }
    }
    enriched.push(copy);
  }
  return enriched;
}

async function agentOpenRepositoryFile(fileId) {
  const id = fileId != null ? String(fileId) : "";
  if (!id) return;
  if (typeof repoSetStoredOpenId === "function") repoSetStoredOpenId(id);
  if (typeof goToTab === "function") {
    await goToTab("Repository");
  } else if (typeof navigateToTab === "function") {
    await navigateToTab("Repository");
  }
  if (typeof repoOpenFile === "function") {
    await repoOpenFile(id, { force: true });
  }
}

function agentProposedActionLine(action) {
  const a = action || {};
  const label = a.title || a.name || a.filename || a.project_name || a.summary;
  const kind = String(a.action || "change").replace(/_/g, " ");
  const extras = [
    a.what_they_do, a.met_where, a.email, a.closeness, a.notes_preview,
  ].map(v => (v != null && String(v).trim() ? String(v).trim() : "")).filter(Boolean);
  if (label && extras.length) return `${kind}: ${label} · ${extras.slice(0, 3).join(" · ")}`;
  if (label) return `${kind}: ${label}`;
  if (a.date && a.title) return `${kind}: ${a.title} on ${a.date}`;
  if (a.list_type && a.title) return `${kind}: ${a.list_type} — ${a.title}`;
  if (extras.length) return `${kind}: ${extras.slice(0, 3).join(" · ")}`;
  return kind;
}

function agentConfirmationCardsHtml(confirmations, options = {}) {
  const items = Array.isArray(confirmations) ? confirmations : [];
  if (!items.length) return "";
  return items.map((c, idx) => {
    const tool = c.tool || "";
    const summary = String(c.summary || "").trim();
    const proposed = Array.isArray(c.proposed_actions) ? c.proposed_actions : [];
    const lines = proposed.map(agentProposedActionLine).filter(Boolean);
    const recalled = Array.isArray(c.recalled_memories) ? c.recalled_memories : [];
    const nestedDuplicates = proposed.flatMap(action =>
      Array.isArray(action?.duplicate_tasks) ? action.duplicate_tasks : []
    );
    const duplicates = Array.isArray(c.duplicate_tasks) && c.duplicate_tasks.length
      ? c.duplicate_tasks
      : nestedDuplicates;
    const isRepeated = !!c.repeated || proposed.some(action => action?.repeated);
    const warning = String(c.warning || proposed.find(a => a?.warning)?.warning || "").trim();
    const cancelKey = agentCancellationKey("confirmation", { tool, input: c.input || {}, idx }, options);
    const cancelled = agentIsItemCancelled(cancelKey);
    const recallLines = recalled.map(m => {
      const title = String(m?.title || "").trim();
      const body = String(m?.body || "").trim();
      const speaker = String(m?.speaker || "").trim();
      if (speaker && title && body) return `${speaker}: ${title} — ${body}`;
      if (title && body) return `${title} — ${body}`;
      return title || body;
    }).filter(Boolean);
    const payload = encodeURIComponent(JSON.stringify({ tool, input: c.input || {} }));
    const listHtml = lines.length && !(c.classes || []).length && !(c.items || []).length
      ? `<ul class="agc-confirm-list">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      : "";
    const tableHtml = agentPreviewTableHtml(c);
    const recallHtml = recallLines.length
      ? `<div class="agc-confirm-recall"><p class="agc-confirm-recall-label">Recalled before this action</p><ul class="agc-confirm-list">${recallLines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>`
      : "";
    const duplicateHtml = duplicates.length
      ? `<div class="agc-confirm-duplicates">Existing: ${duplicates.map(task => {
        const status = task?.status ? ` · ${task.status}` : "";
        return `<strong>${escapeHtml(task?.title || `Task #${task?.id || "?"}`)}</strong>${escapeHtml(status)}`;
      }).join(", ")}</div>`
      : "";
    const warningHtml = warning
      ? `<div class="agc-confirm-warning"><strong>Check before repeating</strong><br>${escapeHtml(warning)}${duplicateHtml}</div>`
      : "";
    const applyLabel = tool ? `Apply ${tool}` : "Apply these rows";
    const toolNameHtml = tool
      ? `<code class="agc-confirm-tool-name" title="Tool that will run">${escapeHtml(tool)}</code>`
      : "";
    return `<div class="agc-confirm-card agc-cancellable-item${cancelled ? " agc-item-cancelled" : ""}" data-confirm-idx="${idx}" data-cancel-key="${escapeHtml(cancelKey)}" data-confirm-tool="${escapeHtml(tool)}">
      <p class="agc-confirm-title">${isRepeated ? "Repeat this task?" : (c.preview ? "Preview — nothing added yet" : "Confirm before applying")}${toolNameHtml}</p>
      ${summary ? `<p class="agc-confirm-summary">${escapeHtml(summary)}</p>` : ""}
      ${warningHtml}
      ${tableHtml}
      ${listHtml}
      ${recallHtml}
      <div class="agc-confirm-actions">
        <button type="button" class="agc-act agc-act-primary agent-confirm-tool" data-confirm-payload="${payload}" data-confirm-tool="${escapeHtml(tool)}"${cancelled ? " disabled" : ""}>${escapeHtml(applyLabel)}</button>
        <button type="button" class="agc-act agc-act-ghost agent-dismiss-confirm agc-cancel-item" data-cancel-key="${escapeHtml(cancelKey)}"${cancelled ? " disabled" : ""}>Cancel</button>
        ${agentCancelledStatusHtml(cancelled)}
      </div>
    </div>`;
  }).join("");
}

function agentPreviewTableHtml(c) {
  const rows = Array.isArray(c?.classes) && c.classes.length
    ? c.classes
    : (Array.isArray(c?.items) && c.items.length ? c.items : []);
  if (!rows.length) return "";
  const cols = rows[0].name != null
    ? [["name", "Class"], ["weekday", "Day"], ["start_time", "Start"], ["end_time", "End"], ["end_date", "Until"]]
    : [["title", "Title"], ["date", "Date"], ["start_time", "Start"], ["notes", "Notes"]];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const head = cols.map(([_, label]) => `<th>${escapeHtml(label)}</th>`).join("") + "<th></th>";
  const body = rows.map(row => {
    const cells = cols.map(([key]) => {
      let val = row[key];
      if (key === "weekday" && val != null && days[val] != null) val = days[val];
      return `<td>${escapeHtml(val == null || val === "" ? "—" : val)}</td>`;
    }).join("");
    const flag = row.duplicate ? `<td class="agc-preview-dup">duplicate</td>` : "<td></td>";
    return `<tr>${cells}${flag}</tr>`;
  }).join("");
  const count = Number(c.count || rows.length);
  const dups = Number(c.duplicates || rows.filter(r => r.duplicate).length);
  return `<div class="agc-preview-wrap"><table class="agc-preview-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><p class="agc-confirm-summary">${count} row${count === 1 ? "" : "s"}${dups ? ` · ${dups} already exist` : ""} — confirm to apply unique rows only.</p></div>`;
}

function agentResultIdsHtml(actions) {
  const bits = [];
  for (const action of actions || []) {
    const result = action?.result;
    if (!result || result.error || result.needs_confirmation || result.preview || result.ok === false) continue;
    const ids = [];
    const push = value => { if (value != null && value !== "") ids.push(String(value)); };
    push(result.id);
    push(result.bug_id);
    if (Array.isArray(result.ids)) result.ids.forEach(push);
    for (const key of ["task", "contact", "event", "idea", "project", "customer", "class", "goal"]) {
      if (result[key]?.id != null) push(result[key].id);
    }
    if (Array.isArray(result.created)) {
      result.created.forEach(row => {
        if (row?.id != null) push(row.id);
        if (row?.class?.id != null) push(row.class.id);
      });
    }
    const count = result.count;
    const tool = (action.tool || "tool").replace(/_/g, " ");
    if (!ids.length && (count == null || count === 0)) {
      bits.push(`${tool}: nothing saved`);
      continue;
    }
    bits.push(`${tool}${count != null ? ` × ${count}` : ""} · ids ${ids.slice(0, 12).join(", ") || "—"}`);
  }
  if (!bits.length) return "";
  return `<div class="agc-result-ids">${bits.map(b => escapeHtml(b)).join(" · ")}</div>`;
}

const CONFIRM_TOOL_PREFIX = "[CONFIRM_TOOL]";

async function sendAgentToolConfirmation(payload) {
  const tool = payload?.tool;
  const input = payload?.input || {};
  if (!tool) return;

  const message = `${CONFIRM_TOOL_PREFIX}${JSON.stringify({ tool, input })}`;
  const sendBtn = document.getElementById("agent-send");
  const inputEl = document.getElementById("agent-input");
  const liveLog = getAgentLog();

  AGENT_CHAT_MESSAGES.push({ role: "user", content: "Confirmed.", created_at: new Date().toISOString() });
  if (liveLog) {
    liveLog.insertAdjacentHTML("beforeend", `<div class="agent-msg user"><div class="agc-bubble-wrap">${agentCopyButtonHtml()}<div class="agent-bubble">${escapeHtml("Confirmed.")}</div></div></div>`);
    applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
    refreshChatActionButtons();
  }
  const workingTrace = insertAgentWorkingTrace(liveLog);

  AGENT_CHAT_IN_FLIGHT += 1;
  AGENT_SEND_IN_FLIGHT = true;
  AGENT_STOP_REQUESTED = false;
  const controller = new AbortController();
  AGENT_CHAT_ABORT_CONTROLLER = controller;
  agentSetComposerBusy(true);

  try {
    const result = await api("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: AGENT_ACTIVE_CONVERSATION_ID || undefined,
      }),
      signal: controller.signal,
    });
    stopAgentWorkingTraceAnimation();
    if (workingTrace && workingTrace.isConnected && workingTrace.parentNode) workingTrace.remove();
    if (result.conversation_id) agentPersistActiveConversation(result.conversation_id);
    agentRefreshConversationList();

    const replyLog = getAgentLog();
    const stepLines = agentStepLines(result);
    const enrichedActions = await agentEnrichRepositoryActions(result.actions || []);
    const replyExtras = agentReplyExtrasFromParts({
      stepLines,
      thinking: result.thinking,
      actions: enrichedActions,
      confirmations: result.confirmations,
      followups: agentChoiceItems(result),
      factCheck: result.fact_check,
    });

    if (result.actions && result.actions.length) {
      recordChatActionsInActivity(result.actions, stepLines);
      if (replyLog) {
        updateActivityTimelineDom();
        refreshActivityFilterChips();
      }
      const toolNames = result.actions.map(a => a.tool);
      if (toolNames.includes("apply_style_paint") || toolNames.includes("set_hidden_apps")) {
        if (typeof stylePaintBoot === "function") stylePaintBoot();
      }
      agentRefreshAffectedViews(result.actions);
    }

    const reply = result.error ? `Error: ${result.error}` : (result.reply || "");
    AGENT_CHAT_MESSAGES.push({
      role: "assistant",
      content: reply,
      created_at: new Date().toISOString(),
      ...agentAssistantMessageFields(result, enrichedActions, stepLines),
    });
    if (replyLog) {
      replyLog.insertAdjacentHTML("beforeend", agentAssistantBubbleHtml(reply, replyExtras, result));
      agentRememberLiveProvider(result);
      wireAgentConfirmationCards(replyLog);
      wireApprovalButtons(replyLog);
      wireAgentFollowupChips(replyLog);
      applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
      refreshChatActionButtons();
      replyLog.scrollTop = replyLog.scrollHeight;
      await refreshPendingApprovals();
      await refreshAgentActivityPanel();
      refreshRunningAgents();
    }
  } catch (err) {
    stopAgentWorkingTraceAnimation();
    if (workingTrace && workingTrace.isConnected && workingTrace.parentNode) workingTrace.remove();
    const replyLog = getAgentLog();
    const stopped = controller.signal.aborted || AGENT_STOP_REQUESTED || err?.name === "AbortError";
    const errText = stopped ? "Stopped by you." : (chatApiJsonError(err) || errorMessage(err));
    if (replyLog) {
      replyLog.insertAdjacentHTML("beforeend", `<div class="agent-msg assistant"><div class="agc-bubble-wrap">${agentCopyButtonHtml()}<div class="agent-bubble">${stopped ? "" : "Error: "}${escapeHtml(errText)}</div></div></div>`);
      replyLog.scrollTop = replyLog.scrollHeight;
    }
  } finally {
    AGENT_CHAT_IN_FLIGHT = Math.max(0, AGENT_CHAT_IN_FLIGHT - 1);
    AGENT_SEND_IN_FLIGHT = false;
    if (AGENT_CHAT_ABORT_CONTROLLER === controller) AGENT_CHAT_ABORT_CONTROLLER = null;
    agentSetComposerBusy(false);
    if (typeof refreshHudData === "function") refreshHudData();
  }
}

function wireAgentConfirmationCards(root) {
  const scope = root || document;
  scope.querySelectorAll(".agent-confirm-tool").forEach(btn => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.onclick = async () => {
      let payload;
      try {
        payload = JSON.parse(decodeURIComponent(btn.dataset.confirmPayload || "%7B%7D"));
      } catch (_) {
        showToast("Could not confirm — invalid payload", "error");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Confirming…";
      try {
        await sendAgentToolConfirmation(payload);
      } catch (_) {
        btn.disabled = false;
        btn.textContent = "Confirm";
      }
    };
  });
  scope.querySelectorAll(".agent-dismiss-confirm").forEach(btn => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.onclick = () => {
      const card = btn.closest(".agc-confirm-card");
      const key = btn.dataset.cancelKey || card?.dataset.cancelKey || "";
      agentCancelItem(key);
      if (card) {
        card.classList.add("agc-item-cancelled");
        card.querySelectorAll(".agent-confirm-tool").forEach(confirm => { confirm.disabled = true; });
        const status = card.querySelector(".agc-cancelled-status");
        if (status) status.hidden = false;
      }
      btn.disabled = true;
    };
  });
  wireAgentCancelledItems(scope);
}

function agentThinkingHtml(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  return `<details class="agc-thinking"><summary class="agc-thinking-summary">Thoughts</summary><pre class="agc-thinking-body">${escapeHtml(t)}</pre></details>`;
}

function agentChoiceItems(source) {
  const raw = Array.isArray(source)
    ? source
    : (
      source?.followups
      || source?.choices
      || source?.choice_options
      || source?.options
      || []
    );
  return (Array.isArray(raw) ? raw : []).map(item => {
    if (item && typeof item === "object") {
      return String(item.label || item.title || item.text || item.value || "").trim();
    }
    return String(item || "").trim();
  }).filter(Boolean).slice(0, 3);
}

function agentApplyChoiceNoToolFallback(result, isChoiceFollowup) {
  if (!isChoiceFollowup || !result || result.error) return result;
  const actions = Array.isArray(result.actions) ? result.actions : [];
  const confirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
  if (actions.length || confirmations.length) return result;
  const nudge = "I described the plan, but did not run a tool — choose “Do it now” to ask me to act.";
  const reply = String(result.reply || "").trim();
  const followups = agentChoiceItems(result).filter(item => item.toLowerCase() !== "do it now");
  return {
    ...result,
    reply: reply ? `${reply}\n\n${nudge}` : nudge,
    followups: ["Do it now", ...followups].slice(0, 3),
  };
}

function agentFollowupsHtml(items) {
  const list = agentChoiceItems(items);
  if (!list.length) return "";
  return `<div class="agc-followups" role="group" aria-label="Suggested choices">
    <div class="agc-choice-label">Choose a next action</div>${list.map((q, idx) =>
    `<button type="button" class="agc-followup-chip" data-followup="${escapeHtml(q)}"><span class="agc-choice-index">${idx + 1}</span><span class="agc-choice-text">${escapeHtml(q)}</span><span class="agc-choice-arrow" aria-hidden="true">→</span></button>`
  ).join("")}</div>`;
}

function wireAgentFollowupChips(root) {
  const scope = root || document;
  scope.querySelectorAll(".agc-followup-chip").forEach(btn => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.onclick = () => {
      const q = btn.dataset.followup || btn.textContent || "";
      const input = document.getElementById("agent-input");
      const sendBtn = document.getElementById("agent-send");
      if (input) input.value = q;
      if (!sendBtn || sendBtn.disabled) {
        if (input) input.focus();
        return;
      }
      AGENT_CHOICE_FOLLOWUP_PENDING = q.trim();
      btn.disabled = true;
      btn.classList.add("agc-choice-working");
      btn.setAttribute("aria-busy", "true");
      const arrow = btn.querySelector(".agc-choice-arrow");
      if (arrow) arrow.textContent = "…";
      sendBtn.click();
    };
  });
}

function agentStagedActionsFromResult(actions) {
  const staged = [];
  for (const action of actions || []) {
    const tool = action?.tool || "";
    if (tool !== "propose_file_edit" && tool !== "propose_command") continue;
    const result = action?.result || {};
    const actionId = result.action_id;
    if (!actionId && !result.staged && !result.pending) continue;
    const input = action.input || {};
    staged.push({
      id: actionId,
      action_type: tool === "propose_command" ? "command" : "file_edit",
      payload: tool === "propose_command"
        ? { command: input.command, reason: input.reason }
        : {
          path: input.path,
          old_string: input.old_string,
          new_string: input.new_string,
          reason: input.reason,
        },
      risk_summary: null,
    });
  }
  return staged;
}

function agentStagedEditCardsHtml(actions) {
  const items = agentStagedActionsFromResult(actions);
  if (!items.length) return "";
  return `<div class="agc-staged-edits">${items.map(approvalCardHtml).join("")}</div>`;
}

async function refreshPendingApprovals() {
  let pending = [];
  try {
    const fetched = await api("/api/actions?status=pending");
    pending = Array.isArray(fetched) ? fetched : [];
  } catch (_) {
    return;
  }
  const existing = document.querySelector(".agc-approvals");
  if (!pending.length) {
    if (existing) existing.remove();
    return;
  }
  const html = `<div class="agc-approvals"><p class="agc-approvals-note">${pending.length} action(s) waiting for approval</p>${pending.map(approvalCardHtml).join("")}</div>`;
  if (existing) {
    existing.outerHTML = html;
    wireApprovalButtons(document.querySelector(".agc-approvals"));
    return;
  }
  const anchor = document.getElementById("agent-load-warnings") || document.querySelector(".agc-page-head");
  if (anchor && anchor.parentNode) {
    anchor.insertAdjacentHTML("afterend", html);
    wireApprovalButtons(document.querySelector(".agc-approvals"));
  }
}

function wireApprovalButtons(root) {
  const scope = root || document;
  scope.querySelectorAll(".approve-action").forEach(btn => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.onclick = async () => {
      const card = btn.closest(".approval-card");
      const rejectBtn = card ? card.querySelector(".reject-action") : null;
      btn.innerHTML = '<span class="spinner"></span>Running...';
      btn.disabled = true;
      if (rejectBtn) rejectBtn.disabled = true;
      try {
        const result = await api(`/api/actions/${btn.dataset.id}/approve`, { method: "POST" });
        window.alert(result.output || result.error || "done");
        if (card) card.remove();
        await refreshPendingApprovals();
        if (typeof refreshHudData === "function") refreshHudData();
      } catch (err) {
        window.alert(errorMessage(err));
        btn.innerHTML = "Approve & run";
        btn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
      }
    };
  });
  scope.querySelectorAll(".reject-action").forEach(btn => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.onclick = async () => {
      if (!window.confirm("Reject this action? It will not run.")) return;
      const card = btn.closest(".approval-card");
      const approveBtn = card ? card.querySelector(".approve-action") : null;
      btn.textContent = "Rejecting...";
      btn.disabled = true;
      if (approveBtn) approveBtn.disabled = true;
      try {
        await api(`/api/actions/${btn.dataset.id}/reject`, { method: "POST" });
        if (card) card.remove();
        await refreshPendingApprovals();
        if (typeof refreshHudData === "function") refreshHudData();
      } catch (err) {
        window.alert(errorMessage(err));
        btn.textContent = "Reject";
        btn.disabled = false;
        if (approveBtn) approveBtn.disabled = false;
      }
    };
  });
}

function agentFactCheckHtml(factCheck) {
  const fc = factCheck && typeof factCheck === "object" ? factCheck : null;
  if (!fc || fc.skipped) return "";
  if (fc.ok && !(fc.issues || []).length) return "";
  const issues = (Array.isArray(fc.issues) ? fc.issues : []).map(x => String(x || "").trim()).filter(Boolean);
  const label = fc.corrected ? "Fact-check corrected reply" : "Fact-check";
  const detail = issues.length ? ` — ${issues.slice(0, 2).join("; ")}` : "";
  return `<div class="agc-fact-check"><span class="agc-fact-check-label">${escapeHtml(label)}</span>${escapeHtml(detail)}</div>`;
}

function agentReplyExtrasFromParts({ stepLines, thinking, actions, confirmations, followups, factCheck, cancellationOptions }) {
  const whatIDid = agentWhatIDidHtml(stepLines, { open: false, ...(cancellationOptions || {}) });
  const thoughts = agentThinkingHtml(thinking);
  const repoLinks = agentRepoLinksHtml(actions);
  const warnings = agentActionWarningsHtml(actions);
  const confirmCards = agentConfirmationCardsHtml(confirmations, cancellationOptions);
  const stagedCards = agentStagedEditCardsHtml(actions);
  const chips = agentFollowupsHtml(followups);
  const fact = agentFactCheckHtml(factCheck);
  const ids = agentResultIdsHtml(actions);
  return `${whatIDid}${thoughts}${repoLinks}${warnings}${confirmCards}${stagedCards}${chips}${ids}${fact}`;
}

function agentActionWarningsHtml(actions) {
  const repeated = (Array.isArray(actions) ? actions : []).filter(action =>
    action?.result?.repeated && !action.result.needs_confirmation
  );
  if (!repeated.length) return "";
  return repeated.map(action => {
    const task = action.result.task || {};
    const warning = action.result.warning || "This task repeats an existing title.";
    return `<div class="agc-action-warning"><strong>Repeated task${task.title ? `: ${escapeHtml(task.title)}` : ""}</strong><br>${escapeHtml(warning)}</div>`;
  }).join("");
}

function agentAssistantMessageFields(result, enrichedActions, stepLines) {
  const staged = agentStagedActionsFromResult(enrichedActions);
  return {
    steps: result.steps || stepLines,
    actions: enrichedActions,
    confirmations: result.confirmations || [],
    thinking: result.thinking || "",
    followups: agentChoiceItems(result),
    fact_check: result.fact_check || null,
    staged_action_ids: staged.map(a => a.id).filter(Boolean),
    source: result.source || "",
    rerouted_from: result.rerouted_from || "",
    model: result.model || "",
  };
}
function agentReplyExtrasHtml(message) {
  const stepLines = agentMessageStepLines(message);
  return agentReplyExtrasFromParts({
    stepLines,
    thinking: message?.thinking,
    actions: message?.actions,
    confirmations: message?.confirmations,
    followups: agentChoiceItems(message),
    factCheck: message?.fact_check,
  });
}

function agentWhatIDidHtml(lines, { open = false, scope = "agent", conversationId = null } = {}) {
  const items = (lines || []).map(l => String(l || "").trim()).filter(Boolean);
  if (!items.length) return "";
  const rows = items.map((line, idx) => {
    const cancelKey = agentCancellationKey("step", { line, idx }, { scope, conversationId });
    const cancelled = agentIsItemCancelled(cancelKey);
    return `<li class="agc-step-line agc-cancellable-item${cancelled ? " agc-item-cancelled" : ""}" data-cancel-key="${escapeHtml(cancelKey)}">
      <span class="agc-step-text">${escapeHtml(line)}</span>
      <button type="button" class="agc-cancel-item" data-cancel-key="${escapeHtml(cancelKey)}"${cancelled ? " disabled" : ""}>Cancel</button>
      ${agentCancelledStatusHtml(cancelled)}
    </li>`;
  }
  ).join("");
  return `<details class="agc-what-i-did"${open ? " open" : ""}>
    <summary class="agc-what-i-did-summary">What I did <span class="agc-step-count">(${items.length})</span></summary>
    <ul class="agc-step-list">${rows}</ul>
  </details>`;
}

function agentWorkingTraceHtml(placeholderSteps) {
  return `<div class="agent-msg assistant agent-pending-bubble agent-working-trace">
    <div class="agent-bubble agc-trace-card">
      <div class="agc-trace-head"><span class="spinner"></span>${escapeHtml("Working…")}</div>
    </div>
  </div>`;
}

function stopAgentWorkingTraceAnimation() {
  if (AGENT_WORKING_TRACE_TIMER) {
    clearInterval(AGENT_WORKING_TRACE_TIMER);
    AGENT_WORKING_TRACE_TIMER = null;
  }
}

function startAgentWorkingTraceAnimation(root) {
  stopAgentWorkingTraceAnimation();
  if (!root) return;
  const steps = root.querySelectorAll(".agc-trace-step");
  if (steps.length < 2) return;
  let idx = 0;
  AGENT_WORKING_TRACE_TIMER = setInterval(() => {
    steps.forEach((el, i) => el.classList.toggle("agc-trace-active", i === idx));
    idx = (idx + 1) % steps.length;
  }, 1400);
}

function insertAgentWorkingTrace(log, placeholders) {
  if (!log) return null;
  log.insertAdjacentHTML("beforeend", agentWorkingTraceHtml(placeholders));
  const trace = log.querySelector(".agent-working-trace:last-child");
  startAgentWorkingTraceAnimation(trace);
  log.scrollTop = log.scrollHeight;
  return trace;
}

function agentProviderPillHtml(result) {
  const source = result?.source || "";
  if (!source) return "";
  const labels = { openai: "ChatGPT", grok: "Grok", claude: "Claude", ollama: "Ollama" };
  const name = labels[source] || source;
  const reroute = result.rerouted_from
    ? ` · fallback from ${labels[result.rerouted_from] || result.rerouted_from}`
    : "";
  return `<div class="agc-provider-pill" data-source="${escapeHtml(source)}">${escapeHtml(name)}${escapeHtml(reroute)}</div>`;
}

function agentUpdateWebSearchChip(result) {
  const chip = document.getElementById("agent-websearch-chip");
  if (!chip) return;
  if (result && Object.prototype.hasOwnProperty.call(result, "web_search_enabled")) {
    chip.hidden = false;
    const on = !!result.web_search_enabled;
    chip.textContent = on ? "Web search on" : "Web search off";
    chip.classList.toggle("off", !on);
    chip.title = on
      ? "Live web_search is available on this backend"
      : "No Brave/Tavily/SerpAPI key — web search is disabled on the fallback path";
  }
}

function agentRememberLiveProvider(result) {
  const live = document.getElementById("agent-live-provider");
  if (live && result?.source) live.innerHTML = agentProviderPillHtml(result);
  agentUpdateWebSearchChip(result);
}

function agentAssistantBubbleHtml(reply, extras, result) {
  return `<div class="agent-msg assistant"><div class="agc-bubble-wrap">${agentCopyButtonHtml("Copy message or current selection")}<button type="button" class="agc-copy-btn agc-quote-obs" title="Quote in Observation" aria-label="Quote in Observation">${agentIconSvg("quote")}</button><div class="agent-bubble">${agentProviderPillHtml(result)}${escapeHtml(reply)}${extras || ""}</div></div></div>`;
}

function agentCapabilitiesPanelHtml(selfCodingOn) {
  const codingItems = selfCodingOn
    ? `<li>Propose code edits or shell commands (you approve before anything runs)</li>`
    : `<li>Can read project source files anytime; proposing edits requires Developer / self-coding mode in Settings</li>`;
  return `<div id="agent-capabilities-panel" class="agc-cap-panel" hidden role="region" aria-label="Assistant capabilities">
    <p class="agc-cap-intro" style="margin:0 0 10px; color:var(--ink-primary);">Chat on the left tells Waypoint what to do; the agent manager on the right shows live runs and finished jobs.</p>
    <h4>What the assistant can do</h4>
    <ul>
      <li><strong>Tasks</strong> — add, list, update, complete, or delete to-dos</li>
      <li><strong>Classes</strong> — add recurring weekly slots (they land on Calendar) and auto-grade homework</li>
      <li><strong>Batch writes</strong> — add many tasks in one turn</li>
      <li><strong>Observations</strong> — read quoted UI/answer fixes you sent from the Observe widget</li>
      <li><strong>Notes &amp; ideas</strong> — save ideas and notes; classify attached file text into skill / problem / thinking / funny / essay</li>
      <li><strong>Projects</strong> — register software or hardware projects</li>
      <li><strong>Situations</strong> — log a meeting or update across contact, project, task, and calendar in one go</li>
      <li><strong>Repository</strong> — list files, read full file contents, and search or summarize what you've stored (Capture → Repository)</li>
      <li><strong>Project code</strong> — read planner source files with read_project_file (always)</li>
      <li><strong>Attachments</strong> — chat file drops include extractable text so the assistant can read them (no need to paste)</li>
      <li><strong>Planner state</strong> — read goals, tasks, contacts, and more for context</li>
      <li><strong>Web search</strong> — look up competitions and external info when needed</li>
    </ul>
    <h4>Developer mode</h4>
    <ul>${codingItems}</ul>
    <p class="agc-cap-note">Ask in plain language — it picks the right action. Each turn shows what it did under the reply.</p>
  </div>`;
}

function agentToolCatalogHtml(selfCodingOn) {
  const groups = AGENT_TOOL_CATALOG_GROUPS.map(group => {
    let tools = group.tools.slice();
    if (group.label === "Automate & customize" && selfCodingOn) {
      tools = tools.concat(["propose_file_edit", "propose_command"]);
    }
    return `<div class="agc-tool-group">
      <span class="agc-tool-group-title">${escapeHtml(group.label)}</span>
      <div class="agc-tool-list">${tools.map(tool => `<span class="agc-tool-name">${escapeHtml(tool)}</span>`).join("")}</div>
    </div>`;
  }).join("");
  return `<details class="agc-tool-catalog">
    <summary class="agc-tool-catalog-summary">Available tools <span class="agc-tool-catalog-summary-note">live data access · exact tool names</span></summary>
    <div class="agc-tool-catalog-grid">${groups}</div>
    <p class="agc-tool-safety">Reads run immediately. Writes can be staged for confirmation; destructive actions always keep their safety confirmation.</p>
  </details>`;
}

function recordChatActionsInActivity(actions, stepLines) {
  const lines = (stepLines && stepLines.length)
    ? stepLines
    : (actions || []).map(friendlyActionLine);
  const now = new Date().toISOString();
  lines.forEach((summary, i) => {
    AGENT_LOCAL_ACTIVITY.unshift({
      subagent: AGENT_CHAT_SUBAGENT,
      summary: String(summary || "").trim() || "Assistant action",
      created_at: new Date(Date.now() - i).toISOString(),
      _local: true,
    });
  });
  if (AGENT_LOCAL_ACTIVITY.length > 80) AGENT_LOCAL_ACTIVITY.length = 80;
}

function mergedActivityRows() {
  const remote = LAST_ACTIVITY.map(a => ({ ...a, _local: false }));
  const local = AGENT_LOCAL_ACTIVITY.slice();
  return [...local, ...remote].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getAgentLog() {
  const el = document.getElementById("agent-log");
  return el && el.isConnected ? el : null;
}

function isTransientAgentError(err) {
  if (!err) return false;
  const name = String(err.name || "");
  if (/abort/i.test(name)) return true;
  const msg = String(err.message || err);
  if (/not connected|detached|removed from/i.test(msg)) return true;
  try {
    JSON.parse(msg);
    return false;
  } catch (_) { /* not API JSON */ }
  if (/failed to fetch|networkerror|network error|load failed/i.test(msg)) return true;
  return false;
}

function chatApiJsonError(err) {
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && parsed.error) return String(parsed.error);
  } catch (_) { /* ignore */ }
  return null;
}

function stopAgentBackgroundLeaveWatch() {
  if (AGENT_BG_LEAVE_WATCH) {
    clearInterval(AGENT_BG_LEAVE_WATCH);
    AGENT_BG_LEAVE_WATCH = null;
  }
}

function startAgentBackgroundLeaveWatch() {
  stopAgentBackgroundLeaveWatch();
  AGENT_BG_TOAST_FOR_TURN = false;
  AGENT_BG_LEAVE_WATCH = setInterval(() => {
    if (!AGENT_SEND_IN_FLIGHT) {
      stopAgentBackgroundLeaveWatch();
      return;
    }
    if (!getAgentLog() && !AGENT_BG_TOAST_FOR_TURN && typeof showToast === "function") {
      AGENT_BG_TOAST_FOR_TURN = true;
      showToast("Agent keeps working in the background", "info");
    }
  }, 400);
}

function showAgentPendingUi() {
  const log = getAgentLog();
  if (log && !log.querySelector(".agent-pending-bubble, .agent-working-trace")) {
    insertAgentWorkingTrace(log, ["Still working…", ...AGENT_WORKING_PLACEHOLDERS.slice(1, 4)]);
  }
}

async function syncAgentPendingFromServer() {
  try {
    const data = await api("/api/agent/running");
    if (!data || !data.in_flight) return;
    if (!isAgentPendingActive()) {
      let baseline = AGENT_CHAT_MESSAGES.length;
      try {
        const messages = await api("/api/agent/messages");
        AGENT_CHAT_MESSAGES = messages.slice();
        baseline = messages.length;
      } catch (_) { /* keep local count */ }
      setAgentPendingMarkers(baseline);
    }
    showAgentPendingUi();
    startAgentPendingPoll();
  } catch (_) { /* ignore */ }
}

function clearAgentPendingMarkers() {
  delete localStorage.agentPendingSince;
  delete localStorage.agentPendingBaseline;
}

function getAgentPendingBaseline() {
  const n = Number(localStorage.agentPendingBaseline);
  return Number.isFinite(n) ? n : 0;
}

function setAgentPendingMarkers(baseline) {
  localStorage.agentPendingSince = new Date().toISOString();
  localStorage.agentPendingBaseline = String(baseline);
}

function isAgentPendingActive() {
  const since = localStorage.agentPendingSince;
  if (!since) return false;
  const age = Date.now() - new Date(since).getTime();
  if (age > AGENT_PENDING_MAX_AGE_MS || Number.isNaN(age)) {
    clearAgentPendingMarkers();
    return false;
  }
  return true;
}

function agentWorkingBubbleHtml(text) {
  return agentWorkingTraceHtml([text || "Still working…", ...AGENT_WORKING_PLACEHOLDERS.slice(1, 4)]);
}

function removeAgentPendingBubble() {
  stopAgentWorkingTraceAnimation();
  const log = getAgentLog();
  if (!log) return;
  log.querySelectorAll(".agent-pending-bubble, .agent-working-trace").forEach(el => el.remove());
}

function rerenderAgentChatLog(messages) {
  const log = getAgentLog();
  if (!log) return;
  const bubbles = messages.map(agentMsgBubbleHtml).join("");
  log.innerHTML = bubbles || '<p class="stub" style="font-size:12px;">Tell it what to track in one sentence — goals, tasks, meetings, contacts.</p>';
  applyChatDensity(AGENT_CHAT_DENSITY);
  wireAgentConfirmationCards(log);
  wireApprovalButtons(log);
  wireAgentFollowupChips(log);
  refreshChatActionButtons();
  log.scrollTop = log.scrollHeight;
}

function stopAgentPendingPoll() {
  if (AGENT_PENDING_POLL) {
    clearInterval(AGENT_PENDING_POLL);
    AGENT_PENDING_POLL = null;
  }
}

async function pollAgentPending() {
  if (!isAgentPendingActive()) {
    stopAgentPendingPoll();
    removeAgentPendingBubble();
    return;
  }

  try {
    const messages = await api("/api/agent/messages");
    const baseline = getAgentPendingBaseline();
    if (messages.length > baseline) {
      clearAgentPendingMarkers();
      stopAgentPendingPoll();
      AGENT_CHAT_MESSAGES = messages.slice();
      const log = getAgentLog();
      if (log) {
        removeAgentPendingBubble();
        rerenderAgentChatLog(AGENT_CHAT_MESSAGES);
        applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
        refreshChatActionButtons();
      }
      if (typeof showToast === "function") showToast("Agent finished while you were away", "success");
    }
  } catch (_) { /* keep polling */ }

  try {
    await refreshAgentActivityPanel();
    refreshRunningAgents();
  } catch (_) { /* ignore activity refresh errors while polling */ }
}

function startAgentPendingPoll() {
  stopAgentPendingPoll();
  if (!isAgentPendingActive()) return;
  pollAgentPending();
  AGENT_PENDING_POLL = setInterval(pollAgentPending, AGENT_PENDING_POLL_MS);
}

function agentMsgBubbleHtml(m) {
  const content = m.content || "";
  const extras = agentReplyExtrasHtml(m);
  const ts = m.created_at
    ? `<div class="stub agc-ts" style="font-size:10px; margin-top:2px; text-align:${m.role === "user" ? "right" : "left"};">${escapeHtml(new Date(m.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</div>`
    : "";
  return `<div class="agent-msg ${escapeHtml(m.role)}">
    <div class="agc-bubble-wrap">
      ${agentCopyButtonHtml()}
      <div class="agent-bubble">${agentProviderPillHtml(m)}${escapeHtml(content)}${extras}</div>
      ${ts}
    </div>
  </div>`;
}

function quickPromptsHtml(prompts, editMode) {
  if (editMode) {
    return prompts.map((q, i) => `<span class="agent-quick-chip-edit" style="display:inline-flex; align-items:center; gap:2px;">
      <span class="secondary" style="font-size:11px; padding:4px 9px; border-radius:6px; border:1px solid var(--border);">${escapeHtml(q)}</span>
      <button type="button" class="agent-quick-remove" data-idx="${i}" title="Remove" aria-label="Remove prompt">&times;</button>
    </span>`).join("") + `<input type="text" id="agent-quick-add" placeholder="+ add" style="font-size:11px; padding:4px 8px; width:88px; border:1px dashed var(--border); border-radius:6px; background:transparent;">`;
  }
  return prompts.map(q => `<button type="button" class="secondary agent-quick-prompt" data-prompt="${escapeHtml(q)}" style="font-size:11px; padding:4px 9px;">${escapeHtml(q)}</button>`).join("");
}

function applyChatSearch(query) {
  const log = document.getElementById("agent-log");
  const countEl = document.getElementById("agent-chat-search-count");
  if (!log) return;
  const q = String(query || "").trim().toLowerCase();
  const msgs = log.querySelectorAll(".agent-msg");
  let shown = 0;
  msgs.forEach(msg => {
    const bubble = msg.querySelector(".agent-bubble");
    const text = (bubble ? bubble.textContent : "").toLowerCase();
    const match = !q || text.includes(q);
    msg.style.display = match ? "" : "none";
    if (match) shown += 1;
  });
  if (countEl) {
    if (q && msgs.length) {
      countEl.textContent = `${shown} of ${msgs.length} shown`;
      countEl.style.display = "";
    } else {
      countEl.textContent = "";
      countEl.style.display = "none";
    }
  }
}

function exportAgentConversation() {
  if (!AGENT_CHAT_MESSAGES.length) return;
  const date = localYmd();
  let md = `# Waypoint Agent Conversation\n\nExported: ${new Date().toLocaleString()}\n\n`;
  AGENT_CHAT_MESSAGES.forEach(m => {
    const ts = m.created_at ? new Date(m.created_at).toLocaleString() : "";
    md += `## ${m.role}${ts ? ` — ${ts}` : ""}\n\n${m.content || ""}\n\n`;
  });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `waypoint-agent-${date}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Conversation exported", "success");
}

function copyAgentConversation() {
  if (!AGENT_CHAT_MESSAGES.length) return;
  const text = AGENT_CHAT_MESSAGES.map(m => {
    const who = m.role === "user" ? "You" : "Agent";
    return `${who}: ${m.content || ""}`.trim();
  }).join("\n\n");
  copyToClipboard(text);
}

function refreshChatActionButtons() {
  const hasMessages = AGENT_CHAT_MESSAGES.length > 0;
  const clearBtn = document.getElementById("agent-clear");
  const exportBtn = document.getElementById("agent-export");
  const copyBtn = document.getElementById("agent-copy-chat");
  if (clearBtn) clearBtn.disabled = !hasMessages;
  if (exportBtn) exportBtn.disabled = !hasMessages;
  if (copyBtn) copyBtn.disabled = !hasMessages;
}

function applyChatDensity(density) {
  AGENT_CHAT_DENSITY = density === "compact" ? "compact" : "comfortable";
  localStorage.agentChatDensity = AGENT_CHAT_DENSITY;
  const log = document.getElementById("agent-log");
  if (log) log.classList.toggle("agc-compact", AGENT_CHAT_DENSITY === "compact");
  const btn = document.getElementById("agent-density-toggle");
  if (btn) btn.textContent = AGENT_CHAT_DENSITY === "compact" ? "Compact" : "Comfortable";
}

function rerenderQuickPrompts() {
  const container = document.getElementById("agent-quick-prompts");
  const editBtn = document.getElementById("agent-quick-edit");
  if (!container) return;
  container.innerHTML = quickPromptsHtml(loadQuickPrompts(), AGENT_QUICK_EDIT);
  if (editBtn) editBtn.classList.toggle("active", AGENT_QUICK_EDIT);
  wireQuickPromptInteractions();
}

function wireQuickPromptInteractions() {
  document.querySelectorAll(".agent-quick-prompt").forEach(btn => {
    btn.onclick = () => {
      if (AGENT_QUICK_EDIT) return;
      const input = document.getElementById("agent-input");
      input.value = btn.dataset.prompt || btn.textContent;
      document.getElementById("agent-send").click();
    };
  });
  document.querySelectorAll(".agent-quick-remove").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const prompts = loadQuickPrompts();
      const idx = Number(btn.dataset.idx);
      if (idx >= 0 && idx < prompts.length) {
        prompts.splice(idx, 1);
        saveQuickPrompts(prompts.length ? prompts : DEFAULT_QUICK_PROMPTS.slice());
        rerenderQuickPrompts();
      }
    };
  });
  const addInput = document.getElementById("agent-quick-add");
  if (addInput) {
    addInput.onkeydown = e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const text = addInput.value.trim();
      if (!text) return;
      const prompts = loadQuickPrompts();
      prompts.push(text);
      saveQuickPrompts(prompts);
      rerenderQuickPrompts();
      const next = document.getElementById("agent-quick-add");
      if (next) next.focus();
    };
  }
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatRelativeTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  if (isSameDay(d, now)) return `${Math.floor(min / 60)}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return "yesterday";
  const days = Math.floor(sec / 86400);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateHeaderLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatExactTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatElapsed(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function distinctSubagents(activity) {
  const seen = new Set();
  const names = [];
  activity.forEach(a => {
    if (a.subagent && !seen.has(a.subagent)) {
      seen.add(a.subagent);
      names.push(a.subagent);
    }
  });
  return names.sort();
}

function filteredActivity() {
  return mergedActivityRows().filter(a => !AGENT_HIDDEN_AGENTS.has(a.subagent));
}

function agentFilterChipsHtml(subagents) {
  if (!subagents.length) return "";
  return `<div id="agent-filter-chips" class="agc-filter-wrap">
    ${subagents.map(name => {
      const active = !AGENT_HIDDEN_AGENTS.has(name);
      const color = subagentColor(name);
      const style = active
        ? `border-color:${color}; color:${color}; background:color-mix(in srgb, ${color} 12%, transparent);`
        : "opacity:0.45;";
      return `<button type="button" class="secondary agent-filter-chip" data-agent="${escapeHtml(name)}" style="${style}">${escapeHtml(name)}</button>`;
    }).join("")}
  </div>`;
}

function timelineRowHtml(a, key) {
  const expanded = AGENT_EXPANDED_ROWS.has(key);
  const color = subagentColor(a.subagent);
  const summary = a.summary || "No summary captured.";
  return `<div class="agent-timeline-row" data-key="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}" style="cursor:pointer; padding:10px 10px; border-bottom:1px solid var(--gridline); transition:background 120ms ease;">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span class="pill" style="border-color:${color}; color:${color}; flex-shrink:0;">${escapeHtml(a.subagent)}</span>
      <span style="font-size:11px; color:var(--ink-secondary); flex-shrink:0;">${escapeHtml(formatRelativeTime(a.created_at))}</span>
      <span style="margin-left:auto; font-size:10px; color:var(--ink-secondary);">${expanded ? "▾" : "▸"}</span>
    </div>
    <div style="margin-top:8px; font-size:13px; line-height:1.55; white-space:pre-wrap; word-break:break-word; color:var(--ink-primary);">${escapeHtml(summary)}</div>
    ${expanded ? `<div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--gridline); font-size:12px; line-height:1.5;">
      <div style="color:var(--ink-secondary);">${escapeHtml(formatExactTimestamp(a.created_at))}</div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
        <span style="width:12px; height:12px; border-radius:3px; background:${color}; flex-shrink:0;"></span>
        <span style="color:var(--ink-secondary);">${escapeHtml(a.subagent)}</span>
      </div>
    </div>` : ""}
  </div>`;
}

function renderActivityTimelineHtml(activity) {
  const merged = mergedActivityRows();
  const rows = merged.filter(a => !AGENT_HIDDEN_AGENTS.has(a.subagent));
  if (!rows.length) {
    const idleMsg = activity.length || AGENT_LOCAL_ACTIVITY.length
      ? "No finished jobs match the selected agents."
      : "No finished jobs yet. When agents complete work, they appear here grouped by day.";
    return `<p class="stub" style="padding:12px 4px;">${escapeHtml(idleMsg)}</p>`;
  }
  let html = "";
  let currentHeader = null;
  rows.forEach((a, i) => {
    const header = dateHeaderLabel(a.created_at);
    if (header !== currentHeader) {
      currentHeader = header;
      html += `<div style="position:sticky; top:0; z-index:1; padding:10px 8px 6px; margin-top:${i ? "6px" : "0"}; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-secondary); background:var(--bg-card); border-bottom:1px solid var(--gridline);">${escapeHtml(header)}</div>`;
    }
    html += timelineRowHtml(a, `row-${i}`);
  });
  return html;
}

function updateActivityTimelineDom() {
  const timeline = document.getElementById("agent-timeline");
  if (timeline) timeline.innerHTML = renderActivityTimelineHtml(LAST_ACTIVITY);
}

function trunc(s, n) { return s.length > n ? s.slice(0, n) + "\n... (truncated preview)" : s; }

function approvalCardHtml(a) {
  const p = a.payload;
  let body;
  if (a.action_type === "command") {
    body = `<div class="approval-code">$ ${(p.command || "").replace(/</g, "&lt;")}</div>`;
  } else if (p.old_string) {
    body = `<div class="stub">${p.path}</div>
      <div class="stub diff-label-remove" style="margin-top:4px; font-weight:600;">- remove:</div>
      <div class="approval-code diff-remove">${trunc(p.old_string, 400).replace(/</g, "&lt;")}</div>
      <div class="stub diff-label-add" style="margin-top:4px; font-weight:600;">+ add:</div>
      <div class="approval-code diff-add">${trunc(p.new_string, 400).replace(/</g, "&lt;")}</div>`;
  } else {
    body = `<div class="stub">${p.path} (new file)</div><div class="approval-code diff-add">${trunc(p.new_string || "", 500).replace(/</g, "&lt;")}</div>`;
  }
  const risk = a.risk_summary;
  let riskHtml = "";
  let approveRiskStyle = "";
  if (risk && risk.risk) {
    const cls = risk.risk === "high" ? "status-critical" : risk.risk === "medium" ? "status-warning" : "status-good";
    const emphasize = risk.risk === "high" || risk.risk === "medium";
    const concerns = (risk.concerns || []).map(c => `<li>${String(c).replace(/</g, "&lt;")}</li>`).join("");
    riskHtml = `
      <div style="margin-top:6px; ${emphasize ? `padding:6px 8px; border-left:3px solid var(--${cls});` : ""}">
        <span class="pill ${cls}" style="font-size:10px;">${risk.risk} risk -- 2nd opinion</span>
        <div class="stub" style="margin-top:4px;">${(risk.summary || "").replace(/</g, "&lt;")}</div>
        ${concerns ? `<ul style="margin:4px 0 0 16px; padding:0; font-size:12px;">${concerns}</ul>` : ""}
      </div>`;
    if (emphasize) approveRiskStyle = ` style="box-shadow:0 0 0 2px var(--${cls}); border-radius:var(--radius-control);"`;
  }
  return `
    <div class="card approval-card">
      <span class="pill status-warning">${a.action_type === "command" ? "command" : "file edit"}</span>
      <strong style="margin-left:6px;">${p.reason || "(no reason given)"}</strong>
      ${body}
      ${riskHtml}
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="primary approve-action" data-id="${a.id}"${approveRiskStyle}>Approve & run</button>
        <button class="secondary reject-action" data-id="${a.id}">Reject</button>
      </div>
    </div>`;
}

function activityPaneHistoryHtml(activity, activityError) {
  const subagents = distinctSubagents(mergedActivityRows());
  const isMap = AGENT_ACTIVITY_VIEW === "map";
  const errorHtml = activityError
    ? `<div id="agent-activity-error" style="margin:6px 0; padding:6px 8px; border-radius:6px; border:1px solid var(--status-warning); background:color-mix(in srgb, var(--status-warning) 10%, transparent);"><p class="stub" style="color:var(--status-warning); margin:0; font-size:11px;">Could not load activity history: ${escapeHtml(activityError)}</p></div>`
    : `<div id="agent-activity-error" style="display:none;"></div>`;

  return `
    <div class="agc-history-section">
      <p class="agc-history-label">Finished jobs</p>
      ${errorHtml}
      <div class="agc-history-controls">
        <div class="seg-pill" role="group" aria-label="Agent activity view">
          <button type="button" class="seg-pill-btn agent-history-view-btn ${isMap ? "" : "active"}" data-view="timeline">Timeline</button>
          <button type="button" class="seg-pill-btn agent-history-view-btn ${isMap ? "active" : ""}" data-view="map">Map</button>
        </div>
        <button type="button" class="icon-circle" id="agent-refresh-activity" title="Refresh history" aria-label="Refresh history">↻</button>
        ${agentFilterChipsHtml(subagents)}
      </div>
      <div id="agent-history-area" style="flex:1; overflow-y:auto; min-height:0;">
        <div id="agent-timeline" style="display:${isMap ? "none" : "block"};">${renderActivityTimelineHtml(activity)}</div>
        <div id="agent-graph" style="display:${isMap ? "block" : "none"}; height:${isMap ? "100%" : "0"}; min-height:${isMap ? "280px" : "0"}; flex-shrink:0;"></div>
      </div>
    </div>`;
}

function agentLoadWarningsBannerHtml(warnings) {
  if (!warnings || !warnings.length) return "";
  const items = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("");
  return `<div id="agent-load-warnings" class="agc-load-warnings" style="margin-bottom:12px; padding:8px 10px; border-radius:6px; border:1px solid var(--status-warning); background:color-mix(in srgb, var(--status-warning) 10%, transparent);">
    <ul class="stub" style="color:var(--status-warning); margin:0; padding-left:18px; font-size:12px; line-height:1.45;">${items}</ul>
  </div>`;
}

async function renderAgent() {
  const loadWarnings = [];

  try {
    const convs = await api("/api/agent/conversations");
    AGENT_CONVERSATIONS = Array.isArray(convs) ? convs : [];
  } catch (_) {
    AGENT_CONVERSATIONS = AGENT_CONVERSATIONS || [];
    loadWarnings.push("Chat list unavailable");
  }
  const pickerConvs = agentConversationsForPicker(AGENT_CONVERSATIONS);
  if (!AGENT_ACTIVE_CONVERSATION_ID || !pickerConvs.some(c => Number(c.id) === Number(AGENT_ACTIVE_CONVERSATION_ID))) {
    agentPersistActiveConversation(pickerConvs[0]?.id || null);
  }

  let messages = AGENT_CHAT_MESSAGES.slice();
  try {
    const q = AGENT_ACTIVE_CONVERSATION_ID
      ? `?conversation_id=${encodeURIComponent(AGENT_ACTIVE_CONVERSATION_ID)}`
      : "";
    const fetched = await api(`/api/agent/messages${q}`);
    if (Array.isArray(fetched)) {
      messages = fetched;
    } else {
      messages = Array.isArray(fetched?.messages) ? fetched.messages : [];
      if (fetched?.conversation_id) agentPersistActiveConversation(fetched.conversation_id);
    }
  } catch (err) {
    if (AGENT_CHAT_MESSAGES.length) {
      loadWarnings.push("Could not refresh chat — showing cached messages");
    } else {
      loadWarnings.push("Chat history unavailable");
    }
    messages = AGENT_CHAT_MESSAGES.slice();
  }

  let pending = [];
  try {
    const fetched = await api("/api/actions?status=pending");
    pending = Array.isArray(fetched) ? fetched : [];
  } catch (_) {
    loadWarnings.push("Pending approvals unavailable");
    pending = [];
  }

  try {
    const usage = await api("/api/usage");
    AGENT_SELF_CODING_ENABLED = !!(usage && (usage.self_coding_enabled === true || String(usage.self_coding_enabled).toLowerCase() === "true"));
  } catch (_) {
    AGENT_SELF_CODING_ENABLED = false;
  }

  let activity = LAST_ACTIVITY;
  let activityError = LAST_ACTIVITY_ERROR;
  try {
    const fetched = await api("/api/agent/activity");
    activity = Array.isArray(fetched) ? fetched : [];
    LAST_ACTIVITY = activity;
    LAST_ACTIVITY_ERROR = null;
    activityError = null;
  } catch (err) {
    activityError = errorMessage(err);
    LAST_ACTIVITY_ERROR = activityError;
    activity = LAST_ACTIVITY;
    loadWarnings.push("Activity history unavailable");
  }

  AGENT_CHAT_MESSAGES = messages.slice();
  const bubbles = messages.map(agentMsgBubbleHtml).join("");
  const quickPrompts = loadQuickPrompts();
  const logDensityClass = AGENT_CHAT_DENSITY === "compact" ? " agc-compact" : "";

  return `
    ${agentChatStylesHtml()}
    ${renderAppSubnavPills(["Agent", "Hub"], { label: "Agent workspace views" })}
    <div class="agc-page-head">
      <div class="agc-page-head-text">
        <h1 class="page-title agc-page-title">Agent</h1>
        <p class="agc-page-subtitle">Ask in one sentence. Tools and the agent manager stay out of the way until you need them.</p>
      </div>
      <div class="agc-mode-group seg-pill" role="group" aria-label="Agent workspace layout">
        <button type="button" class="seg-pill-btn agc-mode-btn agent-mode-btn${AGENT_VIEW_MODE === "split" ? " active" : ""}" data-mode="split">Chat + manager</button>
        <button type="button" class="seg-pill-btn agc-mode-btn agent-mode-btn${AGENT_VIEW_MODE === "chat" ? " active" : ""}" data-mode="chat">Chat only</button>
        <button type="button" class="seg-pill-btn agc-mode-btn agent-mode-btn${AGENT_VIEW_MODE === "activity" ? " active" : ""}" data-mode="activity">Manager only</button>
      </div>
    </div>
    ${agentLoadWarningsBannerHtml(loadWarnings)}
    ${agentToolCatalogHtml(AGENT_SELF_CODING_ENABLED)}
    ${pending.length ? `<div class="agc-approvals"><p class="agc-approvals-note">${pending.length} action(s) waiting for approval</p>${pending.map(approvalCardHtml).join("")}</div>` : ""}
    <div id="agent-workspace" class="agent-workspace">
      <div class="agc-pane agent-pane agent-pane-chat">
        <div class="agc-chat-head">
          <span class="agc-chat-label">Chat</span>
          <span class="agc-live-provider" id="agent-live-provider"></span>
          <span class="agc-websearch-chip" id="agent-websearch-chip" hidden>Web search</span>
          <div class="agc-chat-head-actions">
            <button type="button" class="agc-help-btn secondary" id="agent-capabilities-btn" title="What can the assistant do?" aria-label="What can the assistant do?" aria-expanded="false">?</button>
            <button type="button" class="agc-menu-btn secondary" id="agent-chat-menu" title="Chat options" aria-label="Chat options" aria-expanded="false">⋯</button>
          </div>
        </div>
        ${agentConversationPickerHtml(AGENT_CONVERSATIONS, AGENT_ACTIVE_CONVERSATION_ID)}
        ${agentCapabilitiesPanelHtml(AGENT_SELF_CODING_ENABLED)}
        <div class="agc-toolbar" id="agent-chat-toolbar">
          <input type="search" id="agent-chat-search" placeholder="Search…" autocomplete="off">
          <span id="agent-chat-search-count" class="agc-toolbar-count" style="display:none;"></span>
          <button type="button" class="secondary" id="agent-density-toggle" title="Toggle density">${AGENT_CHAT_DENSITY === "compact" ? "Compact" : "Comfortable"}</button>
          <button type="button" class="secondary" id="agent-copy-chat" ${messages.length ? "" : "disabled"} title="Copy this conversation">Copy chat</button>
          <button type="button" class="secondary" id="agent-export" ${messages.length ? "" : "disabled"}>Export</button>
          <button type="button" class="secondary" id="agent-clear" ${messages.length ? "" : "disabled"} title="Clear messages in this chat only">Clear</button>
          <button type="button" class="secondary${AGENT_QUICK_EDIT ? " active" : ""}" id="agent-quick-edit" title="Edit quick prompts">Edit prompts</button>
        </div>
        <div id="agent-log" class="${logDensityClass.trim()}" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:4px; min-height:0;">
          ${bubbles || emptyStateHtml({
            title: "Ask Waypoint",
            body: "Goals, tasks, meetings, contacts — one sentence is enough.",
            cta: "Focus the composer",
            ctaId: "agent-empty-cta",
            hint: "Or tap a prompt below.",
          })}
        </div>
        <div class="agc-input-zone">
          <div class="agc-quick-row" id="agent-quick-prompts-wrap"${messages.length && !AGENT_QUICK_EDIT ? " hidden" : ""}>
            <div id="agent-quick-prompts">${quickPromptsHtml(quickPrompts, AGENT_QUICK_EDIT)}</div>
          </div>
          <div id="agent-voice-review" class="agc-voice-review" hidden></div>
          <div class="agc-compose-row agc-attach-zone" id="agent-attach-zone">
            <label class="agc-quiet-btn" for="agent-file-input" title="Attach files">
              ${agentIconSvg("paperclip")}
              <input type="file" id="agent-file-input" multiple style="display:none;">
            </label>
            <span id="agent-file-chips" class="agc-file-chips"></span>
            <span id="agent-file-status" class="stub" style="font-size:10px; display:none;"></span>
            <textarea id="agent-input" class="agc-input" rows="2" placeholder="Tell it what to do… Enter to send, Shift+Enter for a new line" autofocus></textarea>
            <button type="button" class="agc-mic" id="agent-mic" title="Voice input — review then send" aria-label="Voice input">${agentIconSvg("mic")}</button>
            <button type="button" class="agc-stop-rec" id="agent-mic-stop" hidden title="Stop recording" aria-label="Stop recording">${agentIconSvg("stop")}</button>
            <button type="button" class="secondary agc-instant" id="agent-instant" title="Fast, lower-cost answer">Instant</button>
            <button type="button" class="secondary agc-stop" id="agent-stop" hidden>Stop</button>
            <button type="button" class="primary agc-send" id="agent-send" title="Send on the expert brain">Send</button>
          </div>
        </div>
      </div>
      <div id="agent-splitter" class="agent-splitter" role="separator" aria-orientation="vertical" aria-label="Resize chat and agent activity panes" tabindex="0"></div>
      <div class="agc-pane agent-pane agent-pane-activity">
        <div class="agc-activity-head">
          <span class="agc-activity-label">Agent manager</span>
          <span class="pill agc-status-pill" id="agent-live-status"><span class="agent-live-dot"></span> Idle</span>
        </div>
        <p class="agc-pane-stub">Track other agents — live runs and finished jobs, separate from chat.</p>
        <div class="agc-manager-tabs seg-pill" role="tablist" aria-label="Agent manager views">
          <button type="button" class="seg-pill-btn agc-manager-tab agent-manager-tab${AGENT_MANAGER_TAB === "running" ? " active" : ""}" data-manager-tab="running" role="tab" aria-selected="${AGENT_MANAGER_TAB === "running" ? "true" : "false"}">Running</button>
          <button type="button" class="seg-pill-btn agc-manager-tab agent-manager-tab${AGENT_MANAGER_TAB === "activity" ? " active" : ""}" data-manager-tab="activity" role="tab" aria-selected="${AGENT_MANAGER_TAB === "activity" ? "true" : "false"}">Activity</button>
          <button type="button" class="seg-pill-btn agc-manager-tab agent-manager-tab${AGENT_MANAGER_TAB === "bugs" ? " active" : ""}" data-manager-tab="bugs" role="tab" aria-selected="${AGENT_MANAGER_TAB === "bugs" ? "true" : "false"}">Bugs</button>
        </div>
        <div id="agent-manager-running" class="agc-manager-panel"${AGENT_MANAGER_TAB === "running" ? "" : " hidden"}>
          <div class="agc-running-label">Running now</div>
          <form id="agent-spawn-form" class="agc-spawn-form" autocomplete="off">
            <input id="agent-spawn-title" type="text" placeholder="Job title" maxlength="80">
            <textarea id="agent-spawn-prompt" rows="2" placeholder="Spawn a parallel agent — uses the same cancel_event stop as chat."></textarea>
            <button type="submit" class="agc-spawn-btn">Spawn agent</button>
          </form>
          <div id="agent-running-box" style="margin:0 0 4px;"><p class="stub agc-running-idle">${escapeHtml(AGENT_IDLE_COPY)}</p></div>
        </div>
        <div id="agent-manager-activity" class="agc-manager-panel"${AGENT_MANAGER_TAB === "activity" ? "" : " hidden"}>
        ${activityPaneHistoryHtml(activity, activityError)}
        </div>
        <div id="agent-manager-bugs" class="agc-manager-panel"${AGENT_MANAGER_TAB === "bugs" ? "" : " hidden"}>
          <div class="agc-running-label">Proposed bugs</div>
          <p class="agc-pane-stub">The assistant can mark bugs here. Accept one to pin it on your Napkin.</p>
          <div id="agent-bugs-box"><p class="stub">Loading…</p></div>
        </div>
      </div>
    </div>`;
}

let AGENT_RUNNING_POLL = null;
let AGENT_VIEW_MODE = localStorage.agentViewMode || "chat";

const AGENT_IDLE_COPY = "Nothing running right now. Send a message in chat to start work.";

function normalizeRunningAgentsFromState(data) {
  if (!data || typeof data !== "object") return [];
  const list = Array.isArray(data.running_agents) ? data.running_agents : [];
  return list.map(a => ({
    id: a.id || a.name || "",
    name: a.name || a.title || a.id || "agent",
    age_seconds: a.age_seconds ?? 0,
    kind: a.kind || (a.cancel_event ? "spawned" : "orchestrator"),
  })).filter(a => a.id || a.name);
}

function normalizeRunningAgentsFromActivity(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter(a => a.status === "running" || !a.status)
    .map(a => ({
      id: String(a.id ?? a.subagent ?? a.name ?? ""),
      name: a.subagent || a.name || "agent",
      age_seconds: a.age_seconds ?? 0,
    }))
    .filter(a => a.name);
}

async function fetchRunningAgents() {
  let agents = [];
  try {
    const data = await api("/api/agent/running");
    agents = normalizeRunningAgentsFromState(data);
    agentUpdateWebSearchChip(data);
  } catch (_) { /* fall through */ }
  try {
    const extra = await api("/api/agents");
    const spawned = Array.isArray(extra?.spawned) ? extra.spawned : [];
    const orch = Array.isArray(extra?.orchestrator) ? extra.orchestrator : [];
    const extraRows = [
      ...spawned.map(a => ({
        id: a.id || "",
        name: a.title || a.name || a.id || "spawned",
        age_seconds: a.age_seconds ?? 0,
        kind: "spawned",
      })),
      ...orch.map(a => ({
        id: a.id || a.name || "",
        name: a.name || a.id || "agent",
        age_seconds: a.age_seconds ?? 0,
        kind: "orchestrator",
      })),
    ];
    const seen = new Set(agents.map(a => String(a.id)));
    extraRows.forEach(row => {
      if (row.id && !seen.has(String(row.id))) {
        seen.add(String(row.id));
        agents.push(row);
      }
    });
  } catch (_) { /* optional */ }
  if (agents.length) return agents;
  try {
    const activity = await api("/api/agent/activity/running");
    return normalizeRunningAgentsFromActivity(activity);
  } catch (_) {
    return [];
  }
}

function runningAgentChipHtml(a) {
  const name = a.name || a.subagent || "agent";
  const color = subagentColor(name);
  const agentId = a.id != null ? String(a.id) : "";
  const ageLabel = formatElapsed(a.age_seconds);
  return `<span class="agc-running-chip" data-agent-id="${escapeHtml(agentId)}" data-agent-name="${escapeHtml(name)}" data-agent-kind="${escapeHtml(a.kind || "")}" style="border-color:color-mix(in srgb, ${color} 35%, var(--border));">
    <span class="agc-running-dot" style="background:${color};"></span>
    <span class="agc-running-name" style="color:${color}; font-weight:600;">${escapeHtml(name)}</span>
    <span class="agc-running-age" title="Elapsed time">${escapeHtml(ageLabel)}</span>
    <button type="button" class="agc-running-kill" title="Stop ${escapeHtml(name)}" aria-label="Stop ${escapeHtml(name)}">Stop</button>
  </span>`;
}

async function cancelRunningAgent(agentId, name, kind) {
  const id = String(agentId || "").trim();
  const label = String(name || "agent");
  if (!id) {
    showToast("Cannot stop this agent", "error");
    return;
  }
  if (!window.confirm(`Stop ${label}? This sets the running cancel_event.`)) return;
  let result = null;
  if (kind === "spawned") {
    try {
      result = await api(`/api/agents/${encodeURIComponent(id)}/stop`, { method: "POST" });
    } catch (_) { /* try the chat cancel path next */ }
  }
  if (!result?.ok) {
    try {
      result = await api("/api/agent/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: id }),
      });
    } catch (err) {
      showToast(`Cancel failed: ${errorMessage(err)}`, "error");
      refreshRunningAgents();
      return;
    }
  }
  if (result?.ok) showToast(`Stopped ${label}`, "success");
  else showToast(result?.error || "Cancel failed", "error");
  refreshRunningAgents();
}

function wireAgentSpawnForm() {
  const form = document.getElementById("agent-spawn-form");
  if (!form || form.dataset.wired === "1") return;
  form.dataset.wired = "1";
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const promptEl = document.getElementById("agent-spawn-prompt");
    const titleEl = document.getElementById("agent-spawn-title");
    const prompt = promptEl?.value.trim() || "";
    const title = titleEl?.value.trim() || "";
    if (!prompt) {
      promptEl?.focus();
      return;
    }
    const btn = form.querySelector("button[type='submit']");
    if (btn) btn.disabled = true;
    try {
      const result = await api("/api/agents/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, title }),
      });
      if (result?.ok || result?.id) {
        showToast(`Spawned ${result.title || "agent"}`, "success");
        if (promptEl) promptEl.value = "";
        if (titleEl) titleEl.value = "";
      } else {
        showToast(result?.error || "Could not spawn agent", "error");
      }
    } catch (err) {
      showToast(errorMessage(err) || "Could not spawn agent", "error");
    }
    if (btn) btn.disabled = false;
    refreshRunningAgents();
  });
}

const AGENT_SPEECH = window.SpeechRecognition || window.webkitSpeechRecognition;
let AGENT_RECOGNITION = null;
let AGENT_LISTENING = false;
let AGENT_VOICE_FINAL = "";

function agentShowVoiceReview(text) {
  const input = document.getElementById("agent-input");
  const bar = document.getElementById("agent-voice-review");
  if (!bar) {
    if (input) input.value = text;
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `<div class="agc-voice-review-head">Review transcript, then send.</div>
    <textarea id="agent-voice-text">${escapeHtml(text)}</textarea>
    <div class="agc-voice-review-actions">
      <button type="button" class="agc-voice-discard" id="agent-voice-discard">Discard</button>
      <button type="button" class="agc-voice-send" id="agent-voice-send">Send</button>
    </div>`;
  const area = document.getElementById("agent-voice-text");
  area?.focus();
  document.getElementById("agent-voice-discard").onclick = () => {
    bar.hidden = true;
    bar.innerHTML = "";
  };
  document.getElementById("agent-voice-send").onclick = () => {
    const compiled = (area?.value || "").trim();
    bar.hidden = true;
    bar.innerHTML = "";
    if (input) input.value = compiled;
    document.getElementById("agent-send")?.click();
  };
}

function agentStopListening(showReview) {
  AGENT_LISTENING = false;
  document.getElementById("agent-mic")?.classList.remove("agc-mic-active");
  const stopBtn = document.getElementById("agent-mic-stop");
  if (stopBtn) stopBtn.hidden = true;
  try { AGENT_RECOGNITION?.stop(); } catch (_) { /* ignore */ }
  const input = document.getElementById("agent-input");
  const text = (input?.value.trim() || AGENT_VOICE_FINAL || "").trim();
  if (showReview && text) agentShowVoiceReview(text);
}

function agentStartListening() {
  if (!AGENT_SPEECH) {
    showToast("Voice is not supported in this browser", "error");
    return;
  }
  if (!AGENT_RECOGNITION) {
    AGENT_RECOGNITION = new AGENT_SPEECH();
    AGENT_RECOGNITION.continuous = true;
    AGENT_RECOGNITION.interimResults = true;
    AGENT_RECOGNITION.lang = document.documentElement.lang || "en-US";
    AGENT_RECOGNITION.onresult = ev => {
      const input = document.getElementById("agent-input");
      if (!input) return;
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) {
          AGENT_VOICE_FINAL = `${AGENT_VOICE_FINAL} ${t}`.replace(/\s+/g, " ").trim();
        } else {
          interim += t;
        }
      }
      input.value = `${AGENT_VOICE_FINAL}${interim ? ` ${interim}` : ""}`.replace(/\s+/g, " ").trim();
    };
    AGENT_RECOGNITION.onerror = ev => {
      AGENT_LISTENING = false;
      document.getElementById("agent-mic")?.classList.remove("agc-mic-active");
      const stopBtn = document.getElementById("agent-mic-stop");
      if (stopBtn) stopBtn.hidden = true;
      showToast(ev.error === "not-allowed" ? "Microphone permission denied" : `Voice error: ${ev.error}`, "error");
    };
    AGENT_RECOGNITION.onend = () => {
      const was = AGENT_LISTENING;
      AGENT_LISTENING = false;
      document.getElementById("agent-mic")?.classList.remove("agc-mic-active");
      const stopBtn = document.getElementById("agent-mic-stop");
      if (stopBtn) stopBtn.hidden = true;
      if (was) {
        const input = document.getElementById("agent-input");
        if (input?.value.trim()) agentShowVoiceReview(input.value.trim());
      }
    };
  }
  if (AGENT_LISTENING) {
    agentStopListening(true);
    return;
  }
  AGENT_LISTENING = true;
  AGENT_VOICE_FINAL = (document.getElementById("agent-input")?.value || "").trim();
  document.getElementById("agent-mic")?.classList.add("agc-mic-active");
  const stopBtn = document.getElementById("agent-mic-stop");
  if (stopBtn) stopBtn.hidden = false;
  try {
    AGENT_RECOGNITION.start();
  } catch (err) {
    AGENT_LISTENING = false;
    if (stopBtn) stopBtn.hidden = true;
    showToast(`Voice unavailable: ${errorMessage(err)}`, "error");
  }
}

function wireAgentVoice() {
  const mic = document.getElementById("agent-mic");
  const stopBtn = document.getElementById("agent-mic-stop");
  if (mic) {
    if (!AGENT_SPEECH) {
      mic.hidden = true;
      mic.title = "Voice not supported in this browser";
    } else {
      mic.onclick = () => {
        if (AGENT_LISTENING) agentStopListening(true);
        else agentStartListening();
      };
    }
  }
  if (stopBtn) stopBtn.onclick = () => agentStopListening(true);
}

function wireAgentRunningBox() {
  const box = document.getElementById("agent-running-box");
  if (!box || box.dataset.wired === "1") return;
  box.dataset.wired = "1";
  box.addEventListener("click", e => {
    const btn = e.target.closest(".agc-running-kill");
    if (!btn) return;
    e.stopPropagation();
    const chip = btn.closest(".agc-running-chip");
    if (!chip) return;
    cancelRunningAgent(chip.dataset.agentId || "", chip.dataset.agentName || "agent", chip.dataset.agentKind || "");
  });
}

async function refreshRunningAgents() {
  const box = document.getElementById("agent-running-box");
  const status = document.getElementById("agent-live-status");
  if (!box) { if (AGENT_RUNNING_POLL) { clearInterval(AGENT_RUNNING_POLL); AGENT_RUNNING_POLL = null; } return; }
  try {
    const agents = await fetchRunningAgents();
    box.innerHTML = agents.length
      ? `<div class="agc-running-chips">${agents.map(runningAgentChipHtml).join("")}</div>`
      : `<p class="stub agc-running-idle">${escapeHtml(AGENT_IDLE_COPY)}</p>`;
    if (status) status.innerHTML = agents.length
      ? `<span class="agent-live-dot running"></span> Live`
      : '<span class="agent-live-dot"></span> Idle';
    document.querySelectorAll('.agent-manager-tab[data-manager-tab="running"]').forEach(btn => {
      btn.textContent = agents.length ? `Running (${agents.length})` : "Running";
    });
  } catch (err) {
    box.innerHTML = `<p class="stub" style="color:var(--status-warning); line-height:1.5;">Could not load running agents: ${escapeHtml(errorMessage(err))}</p>`;
    if (status) status.innerHTML = '<span class="agent-live-dot running"></span> Unavailable';
  }
}

function setActivityErrorMessage(message) {
  const errEl = document.getElementById("agent-activity-error");
  if (!errEl) return;
  if (message) {
    errEl.style.display = "block";
    errEl.innerHTML = `<p class="stub" style="color:var(--status-warning); margin:0;">Could not load activity history: ${escapeHtml(message)}</p>`;
  } else {
    errEl.style.display = "none";
    errEl.innerHTML = "";
  }
}

function refreshActivityFilterChips() {
  const chips = document.getElementById("agent-filter-chips");
  if (!chips) return;
  chips.outerHTML = agentFilterChipsHtml(distinctSubagents(mergedActivityRows()));
  wireAgentFilterChips();
}

async function refreshAgentActivityPanel() {
  const btn = document.getElementById("agent-refresh-activity");
  if (btn) { btn.disabled = true; btn.textContent = "…"; }
  try {
    LAST_ACTIVITY = await api("/api/agent/activity");
    LAST_ACTIVITY_ERROR = null;
    setActivityErrorMessage(null);
    updateActivityTimelineDom();
    refreshActivityFilterChips();
    if (AGENT_ACTIVITY_VIEW === "map") drawAgentGraph();
  } catch (err) {
    LAST_ACTIVITY_ERROR = errorMessage(err);
    setActivityErrorMessage(LAST_ACTIVITY_ERROR);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "↻"; }
  }
}

function applyAgentManagerTab(tab) {
  AGENT_MANAGER_TAB = ["running", "activity", "bugs"].includes(tab) ? tab : "activity";
  localStorage.agentManagerTab = AGENT_MANAGER_TAB;
  const runningPanel = document.getElementById("agent-manager-running");
  const activityPanel = document.getElementById("agent-manager-activity");
  const bugsPanel = document.getElementById("agent-manager-bugs");
  document.querySelectorAll(".agent-manager-tab").forEach(btn => {
    const active = btn.dataset.managerTab === AGENT_MANAGER_TAB;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (runningPanel) runningPanel.hidden = AGENT_MANAGER_TAB !== "running";
  if (activityPanel) activityPanel.hidden = AGENT_MANAGER_TAB !== "activity";
  if (bugsPanel) bugsPanel.hidden = AGENT_MANAGER_TAB !== "bugs";
  if (AGENT_MANAGER_TAB === "bugs") refreshAgentBugs();
  if (AGENT_MANAGER_TAB === "activity" && AGENT_ACTIVITY_VIEW === "map") {
    setTimeout(() => {
      if (window.Plotly && document.getElementById("agent-graph")) Plotly.Plots.resize("agent-graph");
    }, 50);
  }
}

function wireAgentManagerTabs() {
  document.querySelectorAll(".agent-manager-tab").forEach(btn => {
    btn.onclick = () => {
      applyAgentManagerTab(btn.dataset.managerTab);
      if (btn.dataset.managerTab === "activity" && AGENT_ACTIVITY_VIEW === "map") drawAgentGraph();
      if (btn.dataset.managerTab === "bugs") refreshAgentBugs();
    };
  });
}

function applyAgentActivityView(view) {
  AGENT_ACTIVITY_VIEW = view === "map" ? "map" : "timeline";
  localStorage.agentActivityView = AGENT_ACTIVITY_VIEW;
  const timeline = document.getElementById("agent-timeline");
  const graph = document.getElementById("agent-graph");
  document.querySelectorAll(".agent-history-view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === AGENT_ACTIVITY_VIEW);
  });
  if (timeline) timeline.style.display = AGENT_ACTIVITY_VIEW === "timeline" ? "block" : "none";
  if (graph) {
    const isMap = AGENT_ACTIVITY_VIEW === "map";
    graph.style.display = isMap ? "block" : "none";
    graph.style.height = isMap ? "100%" : "0";
    graph.style.minHeight = isMap ? "280px" : "0";
  }
  if (AGENT_ACTIVITY_VIEW === "map") {
    drawAgentGraph();
    setTimeout(() => {
      if (window.Plotly && document.getElementById("agent-graph")) Plotly.Plots.resize("agent-graph");
    }, 50);
  }
}

function wireAgentFilterChips() {
  document.querySelectorAll(".agent-filter-chip").forEach(chip => {
    chip.onclick = () => {
      const name = chip.dataset.agent;
      if (!name) return;
      if (AGENT_HIDDEN_AGENTS.has(name)) AGENT_HIDDEN_AGENTS.delete(name);
      else AGENT_HIDDEN_AGENTS.add(name);
      refreshActivityFilterChips();
      updateActivityTimelineDom();
    };
  });
}

function toggleTimelineRow(key) {
  if (!key) return;
  if (AGENT_EXPANDED_ROWS.has(key)) AGENT_EXPANDED_ROWS.delete(key);
  else AGENT_EXPANDED_ROWS.add(key);
  updateActivityTimelineDom();
}

function wireAgentTimelineRows() {
  const timeline = document.getElementById("agent-timeline");
  if (!timeline || timeline.dataset.wired === "1") return;
  timeline.dataset.wired = "1";
  timeline.addEventListener("click", e => {
    const row = e.target.closest(".agent-timeline-row");
    if (!row) return;
    toggleTimelineRow(row.dataset.key);
  });
  timeline.addEventListener("keydown", e => {
    const row = e.target.closest(".agent-timeline-row");
    if (!row || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggleTimelineRow(row.dataset.key);
  });
}

function wireAgentActivityPanel() {
  wireAgentManagerTabs();
  document.querySelectorAll(".agent-history-view-btn").forEach(btn => {
    btn.onclick = () => applyAgentActivityView(btn.dataset.view);
  });
  wireAgentFilterChips();
  wireAgentTimelineRows();
}

function applyAgentViewMode(mode) {
  AGENT_VIEW_MODE = ["split", "chat", "activity"].includes(mode) ? mode : "chat";
  localStorage.agentViewMode = AGENT_VIEW_MODE;
  const workspace = document.getElementById("agent-workspace");
  if (workspace) {
    workspace.classList.toggle("agent-focus-chat", AGENT_VIEW_MODE === "chat");
    workspace.classList.toggle("agent-focus-activity", AGENT_VIEW_MODE === "activity");
  }
  document.querySelectorAll(".agent-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === AGENT_VIEW_MODE);
  });
  setTimeout(() => {
    if (AGENT_ACTIVITY_VIEW === "map" && document.getElementById("agent-graph") && window.Plotly) Plotly.Plots.resize("agent-graph");
  }, 50);
}

function wireAgentSplitter() {
  const workspace = document.getElementById("agent-workspace");
  const splitter = document.getElementById("agent-splitter");
  if (!workspace || !splitter) return;
  const saved = Number(localStorage.agentChatFr || 2);
  workspace.style.setProperty("--agent-chat-fr", Math.min(4, Math.max(1, saved)));
  let dragging = false;
  const update = (clientX) => {
    const rect = workspace.getBoundingClientRect();
    const pct = Math.min(0.78, Math.max(0.36, (clientX - rect.left) / rect.width));
    const chatFr = pct / (1 - pct);
    workspace.style.setProperty("--agent-chat-fr", chatFr.toFixed(2));
    localStorage.agentChatFr = chatFr.toFixed(2);
    if (AGENT_ACTIVITY_VIEW === "map" && window.Plotly && document.getElementById("agent-graph")) Plotly.Plots.resize("agent-graph");
  };
  splitter.addEventListener("mousedown", e => { dragging = true; document.body.style.cursor = "col-resize"; e.preventDefault(); });
  document.addEventListener("mousemove", e => { if (dragging) update(e.clientX); });
  document.addEventListener("mouseup", () => { if (dragging) { dragging = false; document.body.style.cursor = ""; } });
  splitter.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const current = Number(localStorage.agentChatFr || 2);
    const next = current + (e.key === "ArrowRight" ? 0.15 : -0.15);
    const clamped = Math.min(4, Math.max(1, next));
    workspace.style.setProperty("--agent-chat-fr", clamped.toFixed(2));
    localStorage.agentChatFr = clamped.toFixed(2);
  });
}

function drawAgentGraph() {
  if (!window.Plotly || !document.getElementById("agent-graph")) return;
  if (AGENT_ACTIVITY_VIEW !== "map") return;
  if (!mergedActivityRows().length) {
    document.getElementById("agent-graph").innerHTML = '<p class="stub" style="padding:12px;">Idle — the assistant acts when you ask it to.</p>';
    return;
  }
  const bySubagent = {};
  filteredActivity().filter(a => a.x != null && a.y != null).forEach(a => { (bySubagent[a.subagent] = bySubagent[a.subagent] || []).push(a); });
  if (!Object.keys(bySubagent).length) {
    document.getElementById("agent-graph").innerHTML = '<p class="stub" style="padding:12px;">No runs match the selected agents.</p>';
    return;
  }

  const traces = Object.keys(bySubagent).map(name => ({
    x: bySubagent[name].map(a => a.x),
    y: bySubagent[name].map(a => a.y),
    text: bySubagent[name].map(a => a.summary),
    name,
    mode: "markers",
    type: "scatter",
    marker: { size: 9, color: subagentColor(name) },
    hovertemplate: "%{text}<extra>" + name + "</extra>",
  }));

  const agentTheme = plotlyThemeVars();
  Plotly.newPlot("agent-graph", traces, {
    paper_bgcolor: agentTheme.card, plot_bgcolor: agentTheme.card,
    font: { color: agentTheme.ink, size: 11 },
    xaxis: { visible: false, autorange: true }, yaxis: { visible: false, autorange: true },
    legend: { orientation: "h", y: -0.15, font: { size: 10, color: agentTheme.ink } },
    margin: { l: 10, r: 10, t: 10, b: 10 },
    hovermode: "closest",
  }, { displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["toImage", "select2d", "lasso2d"] });
  document.getElementById("agent-graph").on("plotly_doubleclick", () => Plotly.relayout("agent-graph", { "xaxis.autorange": true, "yaxis.autorange": true }));
}

function agentBugCardHtml(bug) {
  const id = Number(bug.id);
  return `<div class="agc-bug-card" data-bug-id="${id}">
    <div class="agc-bug-title">${escapeHtml(bug.title || "Untitled")}</div>
    ${bug.details ? `<p class="agc-bug-details">${escapeHtml(bug.details)}</p>` : ""}
    <div class="agc-bug-actions">
      <button type="button" class="agc-act agc-act-primary agc-bug-accept" data-bug-id="${id}">Accept to Napkin</button>
      <button type="button" class="agc-act agc-act-ghost agc-bug-dismiss" data-bug-id="${id}">Dismiss</button>
    </div>
  </div>`;
}

async function refreshAgentBugs() {
  const box = document.getElementById("agent-bugs-box");
  try {
    const data = await api("/api/agent/bugs");
    const bugs = Array.isArray(data?.bugs) ? data.bugs : [];
    if (box) {
      box.innerHTML = bugs.length
        ? bugs.map(agentBugCardHtml).join("")
        : '<p class="stub">No proposed bugs. Ask the assistant to mark one when it finds a real issue.</p>';
    }
    document.querySelectorAll('.agent-manager-tab[data-manager-tab="bugs"]').forEach(btn => {
      btn.textContent = bugs.length ? `Bugs (${bugs.length})` : "Bugs";
    });
  } catch (err) {
    if (box) {
      box.innerHTML = `<p class="stub" style="color:var(--status-warning);">Could not load bugs: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }
}

function wireAgentBugsBox() {
  const box = document.getElementById("agent-bugs-box");
  if (!box || box.dataset.wired === "1") return;
  box.dataset.wired = "1";
  box.addEventListener("click", async e => {
    const btn = e.target.closest(".agc-bug-accept, .agc-bug-dismiss");
    if (!btn) return;
    const id = Number(btn.dataset.bugId);
    if (!id) return;
    const action = btn.classList.contains("agc-bug-accept") ? "accept" : "dismiss";
    btn.disabled = true;
    try {
      const result = await api("/api/agent/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (result?.ok) {
        if (action === "accept") {
          const bug = result.bug || {};
          const napkinId = `agent-bug-${id}`;
          try {
            await api("/api/napkin/accept", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: napkinId,
                title: bug.title || "Agent bug",
                details: bug.details || "",
                flush: false,
              }),
            });
            await api("/api/napkin/compile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ flush: false }),
            });
          } catch (_) { /* backend already synced; compile is best-effort */ }
          showToast("Accepted to Napkin", "success");
        } else {
          showToast("Bug dismissed", "success");
        }
      } else {
        showToast(result?.error || "Could not update bug", "error");
      }
    } catch (err) {
      showToast(errorMessage(err) || "Could not update bug", "error");
    }
    refreshAgentBugs();
  });
}

function wireAgentConversationPicker() {
  const toggle = document.getElementById("agent-conv-toggle");
  const popover = document.getElementById("agent-conv-popover");
  const search = document.getElementById("agent-conv-search");
  const list = document.getElementById("agent-conv-list");
  const select = document.getElementById("agent-conversation-select");
  const setOpen = open => {
    if (!toggle || !popover) return;
    popover.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) search?.focus();
  };
  if (toggle && popover && toggle.dataset.wired !== "1") {
    toggle.dataset.wired = "1";
    toggle.onclick = e => {
      e.stopPropagation();
      setOpen(popover.hidden);
    };
    document.addEventListener("click", e => {
      if (!popover.hidden && !e.target.closest(".agc-conv-bar")) setOpen(false);
    });
  }
  if (search && search.dataset.wired !== "1") {
    search.dataset.wired = "1";
    search.addEventListener("input", () => agentRefreshConversationList());
  }
  if (list && list.dataset.wired !== "1") {
    list.dataset.wired = "1";
    list.addEventListener("click", e => {
      const item = e.target.closest("[data-conv-id]");
      if (!item) return;
      const id = Number(item.dataset.convId);
      if (!id || id === Number(AGENT_ACTIVE_CONVERSATION_ID)) {
        setOpen(false);
        return;
      }
      if (select) select.value = String(id);
      agentPersistActiveConversation(id);
      AGENT_CHAT_MESSAGES = [];
      setOpen(false);
      render();
    });
  }
}

function wireAgent() {
  const emptyCta = document.getElementById("agent-empty-cta");
  if (emptyCta) {
    emptyCta.onclick = () => document.getElementById("agent-input")?.focus();
  }
  const log = getAgentLog();
  if (log) log.scrollTop = log.scrollHeight;
  applyAgentActivityView(AGENT_ACTIVITY_VIEW);
  wireAgentActivityPanel();
  applyAgentViewMode(AGENT_VIEW_MODE);
  wireAgentSplitter();

  stopAgentPendingPoll();
  if (isAgentPendingActive()) {
    showAgentPendingUi();
    startAgentPendingPoll();
  } else {
    removeAgentPendingBubble();
  }
  syncAgentPendingFromServer();

  const capBtn = document.getElementById("agent-capabilities-btn");
  const capPanel = document.getElementById("agent-capabilities-panel");
  if (capBtn && capPanel) {
    capBtn.onclick = () => {
      const open = capPanel.classList.toggle("agc-open");
      capPanel.hidden = !open;
      capBtn.classList.toggle("agc-open", open);
      capBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };
  }

  const chatMenuBtn = document.getElementById("agent-chat-menu");
  const chatToolbar = document.getElementById("agent-chat-toolbar");
  if (chatMenuBtn && chatToolbar) {
    chatMenuBtn.onclick = () => {
      const open = chatToolbar.classList.toggle("agc-open");
      chatMenuBtn.classList.toggle("agc-open", open);
      chatMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };
  }

  document.querySelectorAll(".agent-mode-btn").forEach(btn => {
    btn.onclick = () => applyAgentViewMode(btn.dataset.mode);
  });
  const refreshActivityBtn = document.getElementById("agent-refresh-activity");
  if (refreshActivityBtn) refreshActivityBtn.onclick = refreshAgentActivityPanel;

  wireAgentRunningBox();
  wireAgentSpawnForm();
  wireAgentConversationPicker();
  wireAgentBugsBox();
  refreshAgentBugs();
  if (AGENT_RUNNING_POLL) clearInterval(AGENT_RUNNING_POLL);
  refreshRunningAgents();
  AGENT_RUNNING_POLL = setInterval(refreshRunningAgents, 1500);

  const fileChipInput = document.getElementById("agent-file-input");
  const fileChipsEl = document.getElementById("agent-file-chips");
  const fileStatusEl = document.getElementById("agent-file-status");
  const attachZone = document.getElementById("agent-attach-zone");

  const syncAgentPendingToInput = () => {
    setFileInputFiles(fileChipInput, AGENT_PENDING_FILES);
  };

  const renderAgentFileChips = () => {
    if (!fileChipsEl) return;
    if (!AGENT_PENDING_FILES.length) {
      fileChipsEl.innerHTML = "";
      return;
    }
    fileChipsEl.innerHTML = AGENT_PENDING_FILES.map((file, idx) => `
      <span class="pill agc-file-chip" title="${escapeHtml(file.name)}">
        <span class="agc-file-chip-name">${escapeHtml(file.name)}</span>
        <button type="button" class="agent-file-remove" data-idx="${idx}" title="Remove" style="background:none; border:none; color:inherit; cursor:pointer; font-size:12px; line-height:1; padding:0;">&times;</button>
      </span>`).join("");
    fileChipsEl.querySelectorAll(".agent-file-remove").forEach(btn => {
      btn.onclick = () => {
        AGENT_PENDING_FILES.splice(Number(btn.dataset.idx), 1);
        syncAgentPendingToInput();
        renderAgentFileChips();
      };
    });
  };

  const addAgentPendingFiles = fileList => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    AGENT_PENDING_FILES.push(...incoming);
    syncAgentPendingToInput();
    renderAgentFileChips();
  };

  if (fileChipInput) {
    fileChipInput.addEventListener("change", () => {
      addAgentPendingFiles(fileChipInput.files);
      fileChipInput.value = "";
      syncAgentPendingToInput();
    });
  }
  if (attachZone) {
    wireAttachDropZone(attachZone, { onFiles: addAgentPendingFiles });
  }

  wireApprovalButtons(document);

  const send = async (sendOpts = {}) => {
    const input = document.getElementById("agent-input");
    const sendBtn = document.getElementById("agent-send");
    const message = input ? input.value.trim() : "";
    if (!message) return;
    if (AGENT_SEND_IN_FLIGHT) {
      if (input) input.value = "";
      try {
        await api("/api/agent/steer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        showToast("Steering queued", "success");
      } catch (err) {
        showToast(errorMessage(err) || "Could not steer", "error");
      }
      return;
    }
    const isChoiceFollowup = AGENT_CHOICE_FOLLOWUP_PENDING === message;
    AGENT_CHOICE_FOLLOWUP_PENDING = "";
    const forcedRoute = sendOpts?.routeStrength;
    // Instant may force fast; choice followups stay on normal so Confirm chips still appear.
    const routeStrength = forcedRoute === "fast"
      ? "fast"
      : (isChoiceFollowup ? "normal" : (forcedRoute || "strong"));
    if (!sendOpts?.skipCostConfirm && forcedRoute !== "fast") {
      try {
        const pre = await api("/api/ai/preflight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: message, history_len: (window.AGENT_MESSAGES || AGENT_CHAT_MESSAGES || []).length || 8 }),
        });
        if (pre?.needs_confirm) {
          const confirmCost = window.agentConfirmCost || window.wpConfirmCost;
          const ok = confirmCost
            ? await confirmCost(pre.estimated_usd)
            : window.confirm(`This turn looks like about $${Number(pre.estimated_usd || 0).toFixed(2)}. Send anyway?`);
          if (!ok) return;
        }
      } catch (_) {}
    }
    if (input) input.value = "";

    let attachmentNote = "";
    let attachmentChip = "";
    let attachmentIds = [];
    const pendingFiles = AGENT_PENDING_FILES.slice();
    if (pendingFiles.length) {
      if (fileStatusEl) {
        fileStatusEl.style.display = "";
        fileStatusEl.textContent = pendingFiles.length === 1
          ? `Uploading ${escapeHtml(pendingFiles[0].name)}…`
          : `Uploading 1/${pendingFiles.length}…`;
      }
      const { successes, failures } = await uploadAttachmentFiles(pendingFiles, {
        entity_type: "agent_message",
        entity_id: "0",
        onProgress: (cur, total, file) => {
          if (fileStatusEl) {
            fileStatusEl.textContent = total === 1
              ? `Uploading ${escapeHtml(file.name)}…`
              : `Uploading ${cur}/${total}…`;
          }
        },
      });
      if (fileStatusEl) fileStatusEl.style.display = "none";
      if (successes.length) {
        attachmentNote = "\n\n" + successes.map(({ file, data }) =>
          buildAgentAttachmentNoteBlock(file, data)
        ).join("\n");
        attachmentIds = successes.map(({ data }) => data.id);
        attachmentChip = successes.map(({ file, data }) =>
          ` <a href="/api/attachments/${data.id}/file" target="_blank" rel="noopener" class="pill">${escapeHtml(file.name)}</a>`
        ).join("");
      }
      if (failures.length) {
        const msg = formatUploadResultMessage(successes, failures);
        if (typeof showToast === "function") showToast(msg, successes.length ? "warning" : "error");
        else window.alert(msg);
      }
      AGENT_PENDING_FILES = failures.map(f => f.file);
      syncAgentPendingToInput();
      renderAgentFileChips();
    }

    AGENT_CHAT_MESSAGES.push({ role: "user", content: message, created_at: new Date().toISOString() });
    const pendingBaseline = isAgentPendingActive()
      ? getAgentPendingBaseline() + 2
      : AGENT_CHAT_MESSAGES.length;
    setAgentPendingMarkers(pendingBaseline);

    const liveLog = getAgentLog();
    if (liveLog) {
      liveLog.insertAdjacentHTML("beforeend", `<div class="agent-msg user"><div class="agc-bubble-wrap">${agentCopyButtonHtml()}<div class="agent-bubble">${escapeHtml(message)}${attachmentChip}</div></div></div>`);
      applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
      refreshChatActionButtons();
    }

    const workingTrace = insertAgentWorkingTrace(liveLog, isChoiceFollowup
      ? ["Turning your choice into an action…", "Selecting the right tool…", "Applying it safely…"]
      : undefined);
    if (workingTrace) {
      const bubble = workingTrace.querySelector(".agent-bubble");
      if (bubble) bubble.classList.add("agc-stream-cursor");
    }

    AGENT_CHAT_IN_FLIGHT += 1;
    AGENT_SEND_IN_FLIGHT = true;
    AGENT_STOP_REQUESTED = false;
    const controller = new AbortController();
    AGENT_CHAT_ABORT_CONTROLLER = controller;
    startAgentPendingPoll();
    startAgentBackgroundLeaveWatch();
    agentSetComposerBusy(true);

    try {
      let result = await api("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: agentPageContextPrefix() + message + attachmentNote,
          attachment_ids: attachmentIds,
          conversation_id: AGENT_ACTIVE_CONVERSATION_ID || undefined,
          route_strength: routeStrength,
        }),
        signal: controller.signal,
      });
      result = agentApplyChoiceNoToolFallback(result, isChoiceFollowup);
      stopAgentWorkingTraceAnimation();
      if (workingTrace && workingTrace.isConnected && workingTrace.parentNode) workingTrace.remove();
      if (result.conversation_id) agentPersistActiveConversation(result.conversation_id);
      agentRefreshConversationList();

      const replyLog = getAgentLog();
      const stepLines = agentStepLines(result);
      const enrichedActions = await agentEnrichRepositoryActions(result.actions || []);
      const replyExtras = agentReplyExtrasFromParts({
        stepLines,
        thinking: result.thinking,
        actions: enrichedActions,
        confirmations: result.confirmations,
        followups: agentChoiceItems(result),
        factCheck: result.fact_check,
      });
      if (result.actions && result.actions.length) {
        recordChatActionsInActivity(result.actions, stepLines);
        if (replyLog) {
          updateActivityTimelineDom();
          refreshActivityFilterChips();
        }
        const toolNames = result.actions.map(a => a.tool);
        if (toolNames.includes("apply_style_paint") || toolNames.includes("set_hidden_apps")) {
          if (typeof stylePaintBoot === "function") stylePaintBoot();
        }
        agentRefreshAffectedViews(result.actions);
        if (toolNames.includes("propose_bug")) refreshAgentBugs();
      }

      if (result.error) {
        if (AGENT_CHAT_IN_FLIGHT === 1) {
          clearAgentPendingMarkers();
          stopAgentPendingPoll();
          if (replyLog) removeAgentPendingBubble();
        }
        const reply = `Error: ${result.error}`;
        if (replyLog && AGENT_CHAT_MESSAGES.length <= pendingBaseline) {
          AGENT_CHAT_MESSAGES.push({
            role: "assistant",
            content: reply,
            created_at: new Date().toISOString(),
            ...agentAssistantMessageFields(result, enrichedActions, stepLines),
          });
          replyLog.insertAdjacentHTML("beforeend", agentAssistantBubbleHtml(reply, replyExtras, result));
          agentRememberLiveProvider(result);
          wireAgentConfirmationCards(replyLog);
          wireApprovalButtons(replyLog);
          wireAgentFollowupChips(replyLog);
          applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
          refreshChatActionButtons();
          replyLog.scrollTop = replyLog.scrollHeight;
        }
      } else if (!replyLog) {
        if (AGENT_CHAT_IN_FLIGHT === 1) {
          setAgentPendingMarkers(pendingBaseline);
          startAgentPendingPoll();
        }
      } else {
        if (AGENT_CHAT_IN_FLIGHT === 1) {
          clearAgentPendingMarkers();
          stopAgentPendingPoll();
          removeAgentPendingBubble();
        }
        const reply = result.reply;
        if (AGENT_CHAT_MESSAGES.length <= pendingBaseline) {
          AGENT_CHAT_MESSAGES.push({
            role: "assistant",
            content: reply,
            created_at: new Date().toISOString(),
            ...agentAssistantMessageFields(result, enrichedActions, stepLines),
          });
          replyLog.insertAdjacentHTML("beforeend", agentAssistantBubbleHtml(reply || "", replyExtras, result));
          agentRememberLiveProvider(result);
          wireAgentConfirmationCards(replyLog);
          wireApprovalButtons(replyLog);
          wireAgentFollowupChips(replyLog);
          applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
          refreshChatActionButtons();
          replyLog.scrollTop = replyLog.scrollHeight;
        } else {
          applyChatSearch(document.getElementById("agent-chat-search")?.value || "");
          refreshChatActionButtons();
          replyLog.scrollTop = replyLog.scrollHeight;
        }
      }
      if (replyLog) {
        await refreshPendingApprovals();
        await refreshAgentActivityPanel();
        refreshRunningAgents();
      }
    } catch (err) {
      stopAgentWorkingTraceAnimation();
      if (workingTrace && workingTrace.isConnected && workingTrace.parentNode) workingTrace.remove();

      const replyLog = getAgentLog();
      const stopped = controller.signal.aborted || AGENT_STOP_REQUESTED || err?.name === "AbortError";
      if (stopped) {
        clearAgentPendingMarkers();
        stopAgentPendingPoll();
        if (replyLog) {
          removeAgentPendingBubble();
          const stoppedMessage = {
            role: "assistant",
            content: "Stopped by you.",
            created_at: new Date().toISOString(),
          };
          AGENT_CHAT_MESSAGES.push(stoppedMessage);
          replyLog.insertAdjacentHTML("beforeend", agentMsgBubbleHtml(stoppedMessage));
          replyLog.scrollTop = replyLog.scrollHeight;
        }
        return;
      }
      const apiErr = chatApiJsonError(err);
      const transient = isTransientAgentError(err);
      const shouldClearPending = !transient && (apiErr || replyLog);

      if (AGENT_CHAT_IN_FLIGHT === 1) {
        if (shouldClearPending) {
          clearAgentPendingMarkers();
          stopAgentPendingPoll();
          if (replyLog) removeAgentPendingBubble();
        } else {
          const keepBaseline = isAgentPendingActive() ? getAgentPendingBaseline() : pendingBaseline;
          setAgentPendingMarkers(keepBaseline);
          startAgentPendingPoll();
        }
      }

      const errText = apiErr || errorMessage(err);
      if (replyLog && !transient) {
        replyLog.insertAdjacentHTML("beforeend", `<div class="agent-msg assistant"><div class="agc-bubble-wrap">${agentCopyButtonHtml()}<div class="agent-bubble">Error: ${escapeHtml(errText)}</div></div></div>`);
        replyLog.scrollTop = replyLog.scrollHeight;
      }
    } finally {
      AGENT_CHAT_IN_FLIGHT = Math.max(0, AGENT_CHAT_IN_FLIGHT - 1);
      AGENT_SEND_IN_FLIGHT = false;
      stopAgentBackgroundLeaveWatch();
      if (AGENT_CHAT_ABORT_CONTROLLER === controller) AGENT_CHAT_ABORT_CONTROLLER = null;
      agentSetComposerBusy(false);
      if (typeof refreshHudData === "function") refreshHudData();
    }
  };

  const sendBtnEl = document.getElementById("agent-send");
  if (sendBtnEl) sendBtnEl.onclick = () => send();
  const instantBtnEl = document.getElementById("agent-instant");
  if (instantBtnEl) {
    instantBtnEl.onclick = () => {
      if (AGENT_SEND_IN_FLIGHT) return;
      send({ routeStrength: "fast" });
    };
  }
  const stopBtnEl = document.getElementById("agent-stop");
  if (stopBtnEl) stopBtnEl.onclick = stopAgentChatTurn;
  wireAgentVoice();
  const agentInput = document.getElementById("agent-input");
  if (agentInput) {
    setTimeout(() => { agentInput.focus(); }, 0);
    const resizeComposer = () => {
      agentInput.style.height = "auto";
      agentInput.style.height = `${Math.min(agentInput.scrollHeight, 160)}px`;
    };
    agentInput.addEventListener("input", resizeComposer);
    resizeComposer();
    agentInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        send();
      }
      if (e.key === "ArrowUp" && !agentInput.value.trim() && !e.shiftKey) {
        const lastUser = [...AGENT_CHAT_MESSAGES].reverse().find(m => m.role === "user");
        if (lastUser) {
          e.preventDefault();
          agentInput.value = lastUser.content || "";
          resizeComposer();
        }
      }
    }, true);
  }

  const copyLog = getAgentLog();
  if (copyLog && copyLog.dataset.agcBubbleClick !== "1") {
    copyLog.dataset.agcBubbleClick = "1";
    copyLog.addEventListener("click", e => {
      const repoBtn = e.target.closest(".agc-repo-open");
      if (repoBtn) {
        e.preventDefault();
        const fileId = repoBtn.dataset.repoFileId;
        if (fileId) agentOpenRepositoryFile(fileId);
        return;
      }
      const copyBtn = e.target.closest(".agc-copy-btn");
      if (copyBtn) {
        const msg = copyBtn.closest(".agent-msg");
        const bubble = msg ? msg.querySelector(".agent-bubble") : null;
        const selected = String(window.getSelection?.()?.toString() || "").trim();
        const inBubble = selected && bubble && window.getSelection()?.anchorNode && bubble.contains(window.getSelection().anchorNode);
        copyToClipboard(inBubble ? selected : (bubble ? bubble.textContent : ""));
        return;
      }
      const quoteBtn = e.target.closest(".agc-quote-obs");
      if (quoteBtn) {
        const msg = quoteBtn.closest(".agent-msg");
        const bubble = msg ? msg.querySelector(".agent-bubble") : null;
        const selected = String(window.getSelection?.()?.toString() || "").trim();
        const text = selected || (bubble ? bubble.textContent : "");
        window.WaypointObservation?.quote(text);
        return;
      }
    });
  }

  const searchInput = document.getElementById("agent-chat-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => applyChatSearch(searchInput.value));
  }

  const densityBtn = document.getElementById("agent-density-toggle");
  if (densityBtn) {
    densityBtn.onclick = () => {
      applyChatDensity(AGENT_CHAT_DENSITY === "compact" ? "comfortable" : "compact");
    };
  }
  applyChatDensity(AGENT_CHAT_DENSITY);

  const exportBtn = document.getElementById("agent-export");
  if (exportBtn) exportBtn.onclick = exportAgentConversation;
  const copyChatBtn = document.getElementById("agent-copy-chat");
  if (copyChatBtn) copyChatBtn.onclick = copyAgentConversation;

  const quickEditBtn = document.getElementById("agent-quick-edit");
  if (quickEditBtn) {
    quickEditBtn.onclick = () => {
      AGENT_QUICK_EDIT = !AGENT_QUICK_EDIT;
      rerenderQuickPrompts();
    };
  }
  wireQuickPromptInteractions();
  wireAgentConfirmationCards(document);
  wireAgentFollowupChips(document);

  const clearBtn = document.getElementById("agent-clear");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!window.confirm("Clear messages in this chat? Memories stay. This can't be undone.")) return;
      await api("/api/agent/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: AGENT_ACTIVE_CONVERSATION_ID }),
      });
      AGENT_CHAT_MESSAGES = [];
      render();
    };
  }

  const convSelect = document.getElementById("agent-conversation-select");
  if (convSelect) {
    convSelect.onchange = async () => {
      const id = Number(convSelect.value);
      if (!id || id === Number(AGENT_ACTIVE_CONVERSATION_ID)) return;
      agentPersistActiveConversation(id);
      AGENT_CHAT_MESSAGES = [];
      render();
    };
  }

  const newChatBtn = document.getElementById("agent-new-chat");
  if (newChatBtn) {
    newChatBtn.onclick = async () => {
      try {
        const created = await api("/api/agent/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New chat" }),
        });
        if (created?.id) {
          agentPersistActiveConversation(created.id);
          AGENT_CHAT_MESSAGES = [];
          showToast("New chat — fresh context, memories kept", "success");
          render();
        }
      } catch (err) {
        showToast(errorMessage(err) || "Could not create chat", "error");
      }
    };
  }

  const renameChatBtn = document.getElementById("agent-rename-chat");
  if (renameChatBtn) {
    renameChatBtn.onclick = async () => {
      const id = AGENT_ACTIVE_CONVERSATION_ID;
      if (!id || AGENT_SEND_IN_FLIGHT) return;
      const current = AGENT_CONVERSATIONS.find(c => Number(c.id) === Number(id));
      const title = window.prompt("Rename chat", String(current?.title || "New chat"));
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed) {
        showToast("Chat title cannot be empty", "error");
        return;
      }
      try {
        const updated = await api(`/api/agent/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        AGENT_CONVERSATIONS = AGENT_CONVERSATIONS.map(c =>
          Number(c.id) === Number(id) ? { ...c, ...updated } : c
        );
        await agentRefreshConversationList();
        showToast("Chat renamed", "success");
      } catch (err) {
        showToast(errorMessage(err) || "Could not rename chat", "error");
      }
    };
  }

  const deleteChatBtn = document.getElementById("agent-delete-chat");
  if (deleteChatBtn) {
    deleteChatBtn.onclick = async () => {
      if (AGENT_SEND_IN_FLIGHT) return;
      const id = AGENT_ACTIVE_CONVERSATION_ID;
      if (!id) return;
      const label = agentConversationLabel(
        AGENT_CONVERSATIONS.find(c => Number(c.id) === Number(id)) || { title: "this chat" }
      );
      if (!window.confirm(`Delete “${label}”? Messages in this chat are removed. Memories stay.`)) return;
      try {
        const result = await api(`/api/agent/conversations/${id}`, { method: "DELETE" });
        agentPersistActiveConversation(result?.active_id || null);
        AGENT_CHAT_MESSAGES = [];
        render();
      } catch (err) {
        showToast(errorMessage(err) || "Could not delete chat", "error");
      }
    };
  }
}
