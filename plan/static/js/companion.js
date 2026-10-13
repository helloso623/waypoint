/**
 * Per-page floating AI companion — compact chat scoped to ACTIVE_TAB.
 * Depends on globals from core.js: goToTab, ACTIVE_TAB, api, escapeHtml, showToast, errorMessage.
 */
(function () {
  const STORAGE_OPEN = "companionOpen";
  const STORAGE_ORACLE_DAY = "companionOracleDay";
  const STORAGE_CHAT = "companionChatHistory";
  const STORAGE_ACTIVE_CONVERSATION = "companionActiveConversationId";
  const STORAGE_MEMORIES = "companionMemories";
  const STYLE_ID = "companion-extra-styles";
  const POLL_MS = 2000;
  const MAX_STORED_MESSAGES = 160;
  const MAX_MEMORIES = 300;
  const CONTEXT_MEMORY_LIMIT = 20;

  const ORACLE_HINTS = {
    paint6: "Save Today with more paint hours — the day receipt counts toward Paint 6.",
    tasks3: "Mark tasks done on the Tasks tab; three completions finish this quest.",
    pulse2: "Log mood pulses from Today — two honest check-ins unlock it.",
    match1: "Play an Arcade match in Practice; win or play counts.",
    book1: "Log reading on Today to tick this quest.",
    blueprint1: "Run any blueprint in Automation Studio.",
    capture3: "Quick-capture three items today (tasks, ideas, links).",
    overdue1: "Finish a task that is already past due.",
    talk1: "Send the companion one honest follow-up.",
  };

  const MOOD_LABELS = {
    cold: "Quiet — no streak yet today",
    warm: "Active day",
    urgent: "One quest left today",
    ready: "Quest chest ready to open",
  };

  let panelOpen = false;
  let inFlight = false;
  let steering = false;
  let pollTimer = null;
  let cachedStreak = 0;
  let lastMood = "";
  let recognition = null;
  let listening = false;
  let voiceFinal = "";
  let messages = [];
  let conversations = [];
  let activeConversationId = Number(localStorage.getItem(STORAGE_ACTIVE_CONVERSATION)) || null;
  let conversationStore = {};
  let legacyMessages = [];
  let memories = [];
  let memoryPanelOpen = false;
  let historySyncTimer = null;
  let chatAbortController = null;
  let stopRequested = false;
  let fullscreen = false;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceSupported = !!SpeechRecognition;

  function companionIconSvg(name) {
    const paths = {
      copy: '<path d="M7 3h8a2 2 0 0 1 2 2v8h-2V5H7V3zm-3 4h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm0 2v8h8v-8H4z"/>',
      mic: '<path d="M8 2a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V5a3 3 0 0 1 3-3zm7 8a7 7 0 0 1-14 0h2a5 5 0 1 0 10 0h2zM7 16h2v3H7z"/>',
      stop: '<rect x="4" y="4" width="8" height="8" rx="1"/>',
    };
    return `<svg class="companion-icon" viewBox="0 0 16 16" aria-hidden="true">${paths[name] || ""}</svg>`;
  }

  const ROUTE_FAST_HINTS = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure)\b/i,
    /^(what is|who is|when is|where is)\b/i,
  ];
  const ROUTE_STRONG_HINTS = [
    /\b(analy[sz]e|debug|refactor|architect|compare|brainstorm|review)\b/i,
    /\b(explain in detail|step[- ]by[- ]step|deep dive|trade[- ]offs?)\b/i,
    /\b(implement|write (a |the )?(code|script|function|plan)|code review)\b/i,
    /\b(root cause|optimize|design pattern|migration plan)\b/i,
  ];
  const ROUTE_TOOL_HINTS = [
    /\b(add|create|schedule|remind|delete|remove|mark|complete|update|save|log|track|set up|recreate|retry|undo|book|grade)\b/i,
    /\b(task|event|note|idea|project|contact|customer|calendar|goal|meeting|situation|class|classes|homework|assignment)\b/i,
  ];
  // Force tools when user wants a DB write or says a prior write failed.
  const ROUTE_WRITE_FORCE_HINTS = [
    /\b(add|create|save|update|delete|remove|schedule|log|track|recreate|retry|book|grade)\b.{0,40}\b(contact|customer|task|event|note|idea|project|goal|meeting|situation|class|homework|assignment)\b/i,
    /\b(contact|customer|task|event|note|idea|project|goal|class(?:es)?|homework)s?\b.{0,48}\b(add|create|save|update|delete|weren'?t|wasn'?t|were not|didn'?t|did not|not (actually )?(added|saved|created|updated))\b/i,
    /\b(weren'?t|wasn'?t|were not|didn'?t|did not|never)\b.{0,40}\b(add|save|creat|updat|writ)/i,
    /\b(do it|just (do|save|add|create)|go ahead|apply (it|that)|confirm|not done|use the tool|with the tool|call the tool)\b/i,
    /\ba{3,}d+\b/i,
    /\bt+o{2,}l+/i,
  ];
  const CONFIRM_TOOL_PREFIX = "[CONFIRM_TOOL]";

  function companionPageContextPrefix() {
    if (typeof agentPageContextPrefix === "function") return agentPageContextPrefix();
    const tab = typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "Home";
    const label = (typeof TAB_LABELS !== "undefined" && TAB_LABELS[tab]) || tab;
    const meta = typeof PAGE_INTENTS !== "undefined" ? PAGE_INTENTS[tab] : null;
    if (!meta) return `[User is on the ${label} page] `;
    const actions = (meta.actions || []).slice(0, 3).join(", ");
    const bits = [
      `[User context: ${label}`,
      meta.title ? ` — ${meta.title}` : "",
      meta.primary ? `. Primary: ${meta.primary}` : "",
      meta.loss ? `. Why: ${meta.loss}` : "",
      actions ? `. Actions: ${actions}` : "",
      "] ",
    ];
    return bits.join("");
  }

  function scoreRouteStrength(message) {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();
    // Writes need tools. Normal/strong both auto-apply ordinary writes; deletes still confirm.
    if (ROUTE_WRITE_FORCE_HINTS.some(re => re.test(text))) return "normal";
    const looksLikeWrite = /\b(add|create|save|schedule|delete|remove|book|grade|remind|log|track)\b/i.test(text);
    let score = 0;
    if (text.length < 35) score -= 1;
    if (text.length > 100) score += 1;
    if (text.length > 220) score += 1;
    if (/\b(and|also|then|because|however)\b/i.test(text) && text.length > 60) score += 1;
    for (const re of ROUTE_STRONG_HINTS) {
      if (re.test(lower)) score += 2;
    }
    for (const re of ROUTE_TOOL_HINTS) {
      if (re.test(lower)) score += 1;
    }
    for (const re of ROUTE_FAST_HINTS) {
      if (re.test(lower)) score -= 1;
    }
    // Pure short questions can stay fast; questions that mention entities still prefer tools.
    if (/\?$/.test(text) && score < 2) score -= 1;
    // Short "add a class Tuesday 9am" must not fall through to fast (no tools).
    if (score <= 0) return looksLikeWrite ? "normal" : "fast";
    if (score >= 2) return "strong";
    return "normal";
  }

  function routeSystemPrefix(strength) {
    if (strength === "fast") {
      return "[Route: fast — prefer a short, direct answer; skip heavy tool use unless essential] ";
    }
    if (strength === "strong") {
      return "[Route: strong — reason carefully, take concrete tool actions when supported, and return the real Thoughts/steps; destructive actions still need confirm] ";
    }
    return "[Route: normal — use concrete tools and apply ordinary writes immediately; only wait for confirm on deletes, repeats, and situations; return the real Thoughts/steps plus concrete choices] ";
  }

  function routeChipTitle(strength) {
    if (strength === "fast") return "Fast — chat only";
    if (strength === "strong") return "Strong — tools auto-apply safe writes";
    return "Normal — tools auto-apply; deletes still confirm";
  }

  function memoryTokens(text) {
    const stop = new Set([
      "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it", "my", "me",
      "you", "we", "i", "this", "that", "with", "at", "as", "be", "by", "from", "are", "was",
      "do", "if", "not", "your", "can", "will", "just", "have", "has", "please", "thanks",
      "add", "create", "update", "set", "help", "page", "route", "fast", "normal", "strong",
    ]);
    return new Set(
      String(text || "").toLowerCase().match(/[a-z0-9_]{2,}/g)?.filter(w => !stop.has(w) && !/^\d+$/.test(w)) || [],
    );
  }

  function scoreMemoryRelevance(memory, queryTokens) {
    const weight = Number(memory?.recall_weight ?? 1) || 0;
    const coreBonus = memory?.core ? 0.4 : 0;
    if (!queryTokens || !queryTokens.size) return weight + coreBonus;
    const blob = `${memory?.title || ""} ${memory?.body || ""} ${memory?.speaker || ""}`.toLowerCase();
    const memTokens = memoryTokens(blob);
    let overlap = 0;
    for (const t of queryTokens) {
      if (memTokens.has(t)) overlap += 1;
    }
    let soft = 0;
    if (!overlap) {
      for (const t of queryTokens) {
        if (t.length >= 3 && blob.includes(t)) soft += 0.55;
      }
      if (!soft) return 0;
    }
    return overlap * 1.75 + soft + weight + coreBonus;
  }

  function memoryContextPrefix(queryText) {
    if (!memories.length) return "";
    const qTokens = memoryTokens(queryText || "");
    const ranked = memories
      .slice()
      .filter(m => (m.recall_weight ?? 1) >= 0.08)
      .map(m => ({ m, score: scoreMemoryRelevance(m, qTokens) }))
      .filter(row => (qTokens.size ? row.score >= 0.55 : true))
      .sort((a, b) => b.score - a.score || (b.m.recall_weight ?? 0) - (a.m.recall_weight ?? 0))
      .slice(0, CONTEXT_MEMORY_LIMIT)
      .map(row => row.m);
    const bits = ranked.map(m => {
      const title = String(m.title || "").trim();
      const body = String(m.body || "").trim();
      const speaker = String(m.speaker || "").trim();
      if (speaker && title && body) return `${speaker} said: ${title}: ${body}`;
      if (speaker && title) return `${speaker} said: ${title}`;
      return body ? `${title}: ${body}` : title;
    }).filter(Boolean);
    if (!bits.length) return "";
    return `[Companion memories — auto-recalled for this turn/action; apply before acting when relevant; do not wait for the user to ask: ${bits.join("; ")}] `;
  }

  function memoryTs(entry) {
    return Date.parse(entry?.updated_at || entry?.created_at || 0) || 0;
  }

  function mergeMemories(local, remote) {
    const byId = new Map();
    for (const item of local || []) {
      if (item?.id) byId.set(item.id, item);
    }
    for (const item of remote || []) {
      if (!item?.id) continue;
      const prev = byId.get(item.id);
      if (!prev || memoryTs(item) >= memoryTs(prev)) byId.set(item.id, item);
    }
    return Array.from(byId.values())
      .sort((a, b) => memoryTs(a) - memoryTs(b))
      .slice(-MAX_MEMORIES);
  }

  function normalizeStoredMessages(items) {
    return (Array.isArray(items) ? items : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
      .map(m => ({
        role: m.role,
        content: String(m.content || ""),
        steps: Array.isArray(m.steps) ? m.steps : [],
        confirmations: Array.isArray(m.confirmations) ? m.confirmations : [],
        thinking: String(m.thinking || ""),
        followups: Array.isArray(m.followups) ? m.followups : [],
        fact_check: m.fact_check || null,
        route_strength: m.route_strength || "",
      }))
      .slice(-MAX_STORED_MESSAGES);
  }

  function mergeChatMessages(local, remote) {
    const localList = Array.isArray(local) ? local : [];
    const remoteList = Array.isArray(remote) ? remote : [];
    if (!remoteList.length) return localList.slice(-MAX_STORED_MESSAGES);
    if (!localList.length) return remoteList.slice(-MAX_STORED_MESSAGES);
    if (remoteList.length === localList.length) {
      return remoteList.map((remoteMessage, idx) => {
        const localMessage = localList[idx];
        const sameTurn = localMessage
          && localMessage.role === remoteMessage.role
          && localMessage.content === remoteMessage.content;
        return sameTurn ? { ...remoteMessage, ...localMessage } : remoteMessage;
      }).slice(-MAX_STORED_MESSAGES);
    }
    return remoteList.length > localList.length
      ? remoteList.slice(-MAX_STORED_MESSAGES)
      : localList.slice(-MAX_STORED_MESSAGES);
  }

  function serializeMessagesForStore(sourceMessages) {
    return (sourceMessages || messages)
      .filter(m => !m.pending && (m.role === "user" || m.role === "assistant"))
      .map(m => ({
        role: m.role,
        content: String(m.content || "").slice(0, 8000),
        steps: Array.isArray(m.steps) ? m.steps.slice(0, 20) : [],
        confirmations: Array.isArray(m.confirmations) ? m.confirmations.slice(0, 8) : [],
        thinking: String(m.thinking || "").slice(0, 12000),
        followups: Array.isArray(m.followups) ? m.followups.slice(0, 8) : [],
        fact_check: m.fact_check || null,
        route_strength: m.route_strength || "",
      }))
      .slice(-MAX_STORED_MESSAGES);
  }

  function loadChatHistoryLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_CHAT) || "null");
      if (!raw) return [];
      if (raw.conversations && typeof raw.conversations === "object") {
        conversationStore = raw.conversations;
        const storedActive = Number(raw.activeConversationId);
        if (!activeConversationId && storedActive) activeConversationId = storedActive;
        const stored = conversationStore[String(activeConversationId)]?.messages;
        return normalizeStoredMessages(stored);
      }
      if (Array.isArray(raw.messages)) {
        legacyMessages = normalizeStoredMessages(raw.messages);
        return legacyMessages.slice();
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  function saveChatHistoryLocal() {
    if (activeConversationId) {
      const active = conversations.find(c => Number(c.id) === Number(activeConversationId));
      conversationStore[String(activeConversationId)] = {
        title: active?.title || "New chat",
        updatedAt: Date.now(),
        messages: serializeMessagesForStore(),
      };
    }
    try {
      localStorage.setItem(STORAGE_CHAT, JSON.stringify({
        updatedAt: Date.now(),
        activeConversationId,
        conversations: conversationStore,
      }));
      if (activeConversationId) {
        localStorage.setItem(STORAGE_ACTIVE_CONVERSATION, String(activeConversationId));
      }
    } catch (_) { /* ignore */ }
    scheduleHistorySync();
  }

  function scheduleHistorySync() {
    if (historySyncTimer) clearTimeout(historySyncTimer);
    historySyncTimer = setTimeout(syncChatHistoryApi, 1200);
  }

  async function syncChatHistoryApi() {
    const payload = serializeMessagesForStore();
    if (!activeConversationId) return;
    await apiSafe("/api/companion/history", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeConversationId, messages: payload }),
      _silent: true,
    });
  }

  function companionConversationLabel(conversation) {
    const title = String(conversation?.title || "New chat").trim() || "New chat";
    return title.length > 34 ? `${title.slice(0, 33).trimEnd()}…` : title;
  }

  function renderConversationPicker() {
    const select = document.getElementById("companion-conversation-select");
    if (!select) return;
    select.innerHTML = conversations.map(conversation => {
      const selected = Number(conversation.id) === Number(activeConversationId) ? " selected" : "";
      return `<option value="${escapeHtml(String(conversation.id))}"${selected}>${escapeHtml(companionConversationLabel(conversation))}</option>`;
    }).join("");
  }

  async function hydrateConversationMessages(conversationId, fallbackMessages) {
    const local = normalizeStoredMessages(
      conversationStore[String(conversationId)]?.messages || fallbackMessages || []
    );
    messages = local;
    renderMessages();
    const remote = await apiSafe(
      `/api/companion/history?conversation_id=${encodeURIComponent(conversationId)}`,
      { _silent: true },
    );
    if (!remote._missing && !remote._error && Array.isArray(remote.messages)) {
      messages = mergeChatMessages(local, normalizeStoredMessages(remote.messages));
    }
    renderMessages();
    saveChatHistoryLocal();
  }

  async function hydrateCompanionConversations() {
    const local = loadChatHistoryLocal();
    const remote = await apiSafe("/api/companion/conversations", { _silent: true });
    if (!remote._missing && !remote._error && Array.isArray(remote.conversations)) {
      conversations = remote.conversations;
    }
    if (!conversations.length) {
      const created = await apiSafe("/api/companion/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        _silent: true,
      });
      if (created?.id) conversations = [created];
    }
    if (!conversations.some(c => Number(c.id) === Number(activeConversationId))) {
      activeConversationId = Number(conversations[0]?.id) || null;
    }
    renderConversationPicker();
    if (activeConversationId) {
      await hydrateConversationMessages(activeConversationId, legacyMessages);
    } else if (local.length) {
      messages = local;
      renderMessages();
    }
  }

  async function activateCompanionConversation(conversationId) {
    const id = Number(conversationId);
    if (!id || id === Number(activeConversationId) || inFlight) return;
    saveChatHistoryLocal();
    activeConversationId = id;
    messages = normalizeStoredMessages(conversationStore[String(id)]?.messages || []);
    renderConversationPicker();
    renderMessages();
    await hydrateConversationMessages(id);
  }

  async function createCompanionConversation() {
    if (inFlight) return;
    saveChatHistoryLocal();
    const created = await apiSafe("/api/companion/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!created?.id) {
      toast("Could not start a new chat", "error");
      return;
    }
    conversations = [created, ...conversations.filter(c => Number(c.id) !== Number(created.id))];
    activeConversationId = Number(created.id);
    messages = [];
    conversationStore[String(activeConversationId)] = {
      title: created.title || "New chat",
      updatedAt: Date.now(),
      messages: [],
    };
    renderConversationPicker();
    renderMessages();
    saveChatHistoryLocal();
    document.getElementById("companion-input")?.focus();
    toast("New Companion chat", "success");
  }

  async function renameCompanionConversation() {
    if (!activeConversationId || inFlight) return;
    const current = conversations.find(c => Number(c.id) === Number(activeConversationId));
    const title = window.prompt("Rename Companion chat", String(current?.title || "New chat"));
    if (title === null) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast("Chat title cannot be empty", "error");
      return;
    }
    const updated = await apiSafe(`/api/companion/conversations/${activeConversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
      _silent: true,
    });
    if (updated?._error || !updated?.id) {
      toast(updated?._error || updated?.error || "Could not rename chat", "error");
      return;
    }
    conversations = conversations.map(c =>
      Number(c.id) === Number(activeConversationId) ? { ...c, ...updated } : c
    );
    if (conversationStore[String(activeConversationId)]) {
      conversationStore[String(activeConversationId)].title = updated.title;
    }
    renderConversationPicker();
    saveChatHistoryLocal();
    toast("Chat renamed", "success");
  }

  async function deleteCompanionConversation() {
    if (!activeConversationId || inFlight) return;
    const deletingId = Number(activeConversationId);
    const current = conversations.find(c => Number(c.id) === deletingId);
    const label = companionConversationLabel(current || { title: "this chat" });
    if (!window.confirm(`Delete “${label}”? Messages in this chat are removed. Memories stay.`)) return;
    const result = await apiSafe(`/api/companion/conversations/${deletingId}`, {
      method: "DELETE",
      _silent: true,
    });
    if (result?._error || !result?.ok) {
      toast(result?._error || result?.error || "Could not delete chat", "error");
      return;
    }
    delete conversationStore[String(deletingId)];
    conversations = Array.isArray(result.conversations)
      ? result.conversations
      : conversations.filter(c => Number(c.id) !== deletingId);
    activeConversationId = Number(result.active_id || conversations[0]?.id) || null;
    messages = normalizeStoredMessages(conversationStore[String(activeConversationId)]?.messages || []);
    renderConversationPicker();
    renderMessages();
    saveChatHistoryLocal();
    if (activeConversationId) await hydrateConversationMessages(activeConversationId);
    toast("Chat deleted", "success");
  }

  function applyConversationMetadata(result) {
    const pill = document.getElementById("companion-provider-pill");
    if (pill && result?.source && typeof agentProviderPillHtml === "function") {
      pill.hidden = false;
      pill.innerHTML = agentProviderPillHtml(result);
    }
    if (!result?.conversation_id) return;
    activeConversationId = Number(result.conversation_id);
    const title = String(result.conversation_title || "").trim();
    const idx = conversations.findIndex(c => Number(c.id) === activeConversationId);
    if (idx >= 0 && title) {
      conversations[idx] = { ...conversations[idx], title };
    }
    renderConversationPicker();
  }

  function loadMemoriesLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_MEMORIES) || "null");
      if (!raw || !Array.isArray(raw.memories)) return [];
      return raw.memories.slice(-MAX_MEMORIES);
    } catch (_) {
      return [];
    }
  }

  function saveMemoriesLocal() {
    try {
      localStorage.setItem(STORAGE_MEMORIES, JSON.stringify({
        updatedAt: Date.now(),
        memories: memories.slice(-MAX_MEMORIES),
      }));
    } catch (_) { /* ignore */ }
  }

  async function hydrateMemories() {
    memories = loadMemoriesLocal();
    const remote = await apiSafe("/api/companion/memories", { _silent: true });
    if (!remote._missing && !remote._error && Array.isArray(remote.memories)) {
      const merged = mergeMemories(memories, remote.memories);
      const changed = merged.length !== memories.length
        || merged.some((m, i) => m.id !== memories[i]?.id || memoryTs(m) !== memoryTs(memories[i]));
      memories = merged;
      if (changed) saveMemoriesLocal();
    }
    renderMemoryPanel();
  }

  function companionAddMemory(title, body, opts) {
    const t = String(title || "").trim();
    if (!t) return null;
    const core = !!(opts && opts.core);
    const speaker = (opts && opts.speaker) ? String(opts.speaker).trim() : null;
    const entry = {
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: t.slice(0, 200),
      body: String(body || "").trim().slice(0, 2000),
      created_at: new Date().toISOString(),
      recall_weight: 1,
      core,
    };
    if (speaker) entry.speaker = speaker;
    memories.push(entry);
    if (memories.length > MAX_MEMORIES) memories = memories.slice(-MAX_MEMORIES);
    saveMemoriesLocal();
    renderMemoryPanel();
    const path = core ? "/api/companion/add_core_memory" : "/api/companion/memories";
    const payload = { title: entry.title, body: entry.body };
    if (speaker) payload.speaker = speaker;
    apiSafe(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      _silent: true,
    }).then((res) => {
      if (res?.memory?.id) {
        entry.id = res.memory.id;
        if (res.memory.recall_weight != null) entry.recall_weight = res.memory.recall_weight;
        if (res.memory.core != null) entry.core = res.memory.core;
      }
      saveMemoriesLocal();
      renderMemoryPanel();
    });
    toast(`Remembered: ${entry.title}`, "info");
    return entry;
  }

  async function updateMemory(memoryId, title, body) {
    const idx = memories.findIndex(m => m.id === memoryId);
    if (idx < 0) return;
    memories[idx] = {
      ...memories[idx],
      title: String(title || "Untitled").trim().slice(0, 200),
      body: String(body || "").trim().slice(0, 2000),
      recall_weight: Math.min(1, (memories[idx].recall_weight ?? 0.8) + 0.2),
    };
    saveMemoriesLocal();
    renderMemoryPanel();
    const res = await apiSafe(`/api/companion/memories/${encodeURIComponent(memoryId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: memories[idx].title, body: memories[idx].body, reinforce: true }),
      _silent: true,
    });
    if (res?.memory) {
      memories[idx] = { ...memories[idx], ...res.memory };
      saveMemoriesLocal();
      renderMemoryPanel();
    }
  }

  function promptEditMemory(memoryId) {
    const item = memories.find(m => m.id === memoryId);
    if (!item) return;
    const title = window.prompt("Memory title", item.title || "");
    if (title == null) return;
    const body = window.prompt("Memory detail (optional)", item.body || "");
    if (body == null) return;
    updateMemory(memoryId, title, body);
  }

  function promptAddMemory() {
    const title = window.prompt("Core memory title", "");
    if (!title || !title.trim()) return;
    const body = window.prompt("Detail (optional)", "") || "";
    companionAddMemory(title.trim(), body.trim(), { core: true });
  }

  async function removeMemory(memoryId) {
    memories = memories.filter(m => m.id !== memoryId);
    saveMemoriesLocal();
    renderMemoryPanel();
    await apiSafe(`/api/companion/memories/${encodeURIComponent(memoryId)}`, {
      method: "DELETE",
      _silent: true,
    });
  }

  function renderMemoryPanel() {
    const list = document.getElementById("companion-memory-list");
    const btn = document.getElementById("companion-memory-btn");
    if (btn) btn.classList.toggle("companion-memory-btn--active", memoryPanelOpen);
    if (!list) return;
    if (!memories.length) {
      list.innerHTML = `<p class="companion-memory-empty">No memories yet. The companion can save rare facts here.</p>`;
      return;
    }
    list.innerHTML = memories.slice().reverse().map(m => {
      const weight = Math.round((m.recall_weight ?? 1) * 100);
      const faded = (m.recall_weight ?? 1) < 0.2 ? " companion-memory-item--faded" : "";
      return `
      <article class="companion-memory-item${faded}" data-memory-id="${escapeHtml(String(m.id || ""))}">
        <div class="companion-memory-item-head">
          <strong class="companion-memory-title">${escapeHtml(m.title || "Untitled")}</strong>
          <span class="companion-memory-weight" title="Recall strength">${weight}%</span>
          <button type="button" class="companion-memory-edit" title="Edit memory" aria-label="Edit memory">✎</button>
          <button type="button" class="companion-memory-del" title="Remove memory" aria-label="Remove memory">✕</button>
        </div>
        ${m.body ? `<p class="companion-memory-body">${escapeHtml(m.body)}</p>` : ""}
      </article>`;
    }).join("");
    list.querySelectorAll(".companion-memory-edit").forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const item = el.closest(".companion-memory-item");
        const id = item?.dataset.memoryId;
        if (id) promptEditMemory(id);
      };
    });
    list.querySelectorAll(".companion-memory-del").forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const item = el.closest(".companion-memory-item");
        const id = item?.dataset.memoryId;
        if (id) removeMemory(id);
      };
    });
  }

  function setMemoryPanelOpen(open) {
    memoryPanelOpen = open;
    const panel = document.getElementById("companion-memory-panel");
    const btn = document.getElementById("companion-memory-btn");
    if (panel) panel.hidden = !open;
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("companion-memory-btn--active", open);
    }
    renderMemoryPanel();
  }

  function toggleMemoryPanel() {
    setMemoryPanelOpen(!memoryPanelOpen);
  }

  function pageContextPrefix() {
    return companionPageContextPrefix();
  }

  function companionFormatValue(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
    if (Array.isArray(v)) return v.map(companionFormatValue).filter(Boolean).join(", ");
    if (typeof v === "object") {
      if (v.description || v.text) return companionFormatValue(v.description || v.text);
      if (v.name || v.title) {
        const bits = [v.name || v.title, v.notes || v.what_they_do || v.summary].map(companionFormatValue).filter(Boolean);
        return bits.join(" — ");
      }
      try {
        return JSON.stringify(v).slice(0, 120);
      } catch (_) {
        return "";
      }
    }
    return String(v).trim();
  }

  function companionStepText(step) {
    if (typeof agentStepText === "function") return agentStepText(step);
    if (step == null) return "";
    if (typeof step === "string") return step.trim();
    if (typeof step === "object") {
      const text = step.description || step.text;
      if (text != null && companionFormatValue(text)) return companionFormatValue(text);
      if (step.tool) return companionActionLine(step);
    }
    return companionFormatValue(step);
  }

  function companionStepLines(result) {
    if (typeof agentStepLines === "function") {
      const lines = agentStepLines(result);
      if (lines.length) return lines;
    }
    const steps = Array.isArray(result?.steps) ? result.steps : [];
    const fromSteps = steps.map(companionStepText).filter(Boolean);
    if (fromSteps.length) return fromSteps;
    const actions = Array.isArray(result?.actions) ? result.actions : [];
    return actions.map(companionActionLine).filter(Boolean);
  }

  function companionActionLine(action) {
    if (typeof friendlyActionLine === "function") return friendlyActionLine(action);
    const tool = action?.tool || action?.name || "";
    const input = action?.input || {};
    let snippet = "";
    for (const v of Object.values(input)) {
      const formatted = companionFormatValue(v);
      if (formatted) { snippet = formatted.slice(0, 100); break; }
    }
    const label = tool ? tool.replace(/_/g, " ") : "action";
    return snippet ? `${label}: ${snippet}` : label;
  }

  function companionConfirmationCardsHtml(confirmations) {
    if (typeof agentConfirmationCardsHtml === "function") {
      return agentConfirmationCardsHtml(confirmations, {
        scope: "companion",
        conversationId: activeConversationId,
      })
        .replace(/agent-confirm-tool/g, "companion-confirm-tool")
        .replace(/agent-dismiss-confirm/g, "companion-dismiss-confirm");
    }
    const items = Array.isArray(confirmations) ? confirmations : [];
    if (!items.length) return "";
    return items.map((c, idx) => {
      const tool = c.tool || "";
      const summary = String(c.summary || "").trim();
      const warning = String(c.warning || "").trim();
      const payload = encodeURIComponent(JSON.stringify({ tool, input: c.input || {} }));
      const cancelKey = `companion:${activeConversationId || "none"}:confirmation:${JSON.stringify({ tool, input: c.input || {}, idx })}`;
      const cancelled = typeof agentIsItemCancelled === "function" && agentIsItemCancelled(cancelKey);
      return `<div class="agc-confirm-card companion-confirm-card agc-cancellable-item${cancelled ? " agc-item-cancelled" : ""}" data-confirm-idx="${idx}" data-cancel-key="${escapeHtml(cancelKey)}">
        <p class="agc-confirm-title">${c.repeated ? "Repeat this task?" : "Confirm before applying"}</p>
        ${summary ? `<p class="agc-confirm-summary">${escapeHtml(summary)}</p>` : ""}
        ${warning ? `<div class="agc-confirm-warning">${escapeHtml(warning)}</div>` : ""}
        <div class="agc-confirm-actions">
          <button type="button" class="primary companion-confirm-tool" data-confirm-payload="${payload}"${cancelled ? " disabled" : ""}>Confirm</button>
          <button type="button" class="secondary companion-dismiss-confirm agc-cancel-item" data-cancel-key="${escapeHtml(cancelKey)}"${cancelled ? " disabled" : ""}>Cancel</button>
          <span class="agc-cancelled-status"${cancelled ? "" : " hidden"}>Cancelled</span>
        </div>
      </div>`;
    }).join("");
  }

  function wireCompanionConfirmationCards(scope) {
    const root = scope || document.getElementById("companion-log");
    if (!root) return;
    root.querySelectorAll(".companion-confirm-tool").forEach(btn => {
      if (btn.dataset.companionConfirmWired) return;
      btn.dataset.companionConfirmWired = "1";
      btn.onclick = async () => {
        let payload;
        try {
          payload = JSON.parse(decodeURIComponent(btn.dataset.confirmPayload || "%7B%7D"));
        } catch (_) {
          toast("Could not confirm — invalid payload", "error");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Confirming…";
        try {
          await sendToolConfirmation(payload);
        } finally {
          btn.disabled = false;
          btn.textContent = "Confirm";
        }
      };
    });
    root.querySelectorAll(".companion-dismiss-confirm").forEach(btn => {
      if (btn.dataset.companionDismissWired) return;
      btn.dataset.companionDismissWired = "1";
      btn.onclick = () => {
        const card = btn.closest(".companion-confirm-card, .agc-confirm-card");
        const key = btn.dataset.cancelKey || card?.dataset.cancelKey || "";
        if (typeof agentCancelItem === "function") agentCancelItem(key);
        if (card) {
          card.classList.add("agc-item-cancelled");
          card.querySelectorAll(".companion-confirm-tool").forEach(confirm => { confirm.disabled = true; });
          const status = card.querySelector(".agc-cancelled-status");
          if (status) status.hidden = false;
        }
        btn.disabled = true;
        saveChatHistoryLocal();
      };
    });
    if (typeof wireAgentCancelledItems === "function") wireAgentCancelledItems(root);
  }

  async function sendToolConfirmation(payload) {
    const tool = payload?.tool;
    const input = payload?.input || {};
    if (!tool || inFlight) return;
    const message = `${CONFIRM_TOOL_PREFIX}${JSON.stringify({ tool, input })}`;
    const payloadKey = JSON.stringify({ tool, input });
    const removedConfirmations = [];
    messages.forEach(chatMessage => {
      if (!Array.isArray(chatMessage.confirmations)) return;
      const kept = [];
      chatMessage.confirmations.forEach(confirmation => {
        const key = JSON.stringify({
          tool: confirmation?.tool || "",
          input: confirmation?.input || {},
        });
        if (key === payloadKey) removedConfirmations.push([chatMessage, confirmation]);
        else kept.push(confirmation);
      });
      chatMessage.confirmations = kept;
    });
    messages.push({ role: "user", content: "Confirmed." });
    const pendingIdx = messages.length;
    messages.push({ role: "assistant", content: "", pending: true, steps: [] });
    renderMessages();
    stopRequested = false;
    const controller = new AbortController();
    chatAbortController = controller;
    setInFlight(true);
    let confirmed = false;
    try {
      const result = await apiSafe("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          route_strength: "normal",
          source: "companion",
          conversation_id: activeConversationId,
        }),
        signal: controller.signal,
      });
      messages.splice(pendingIdx, 1);
      applyConversationMetadata(result);
      if (result._missing) {
        messages.push({ role: "assistant", content: "Companion chat is not available yet.", steps: [] });
      } else if (result.error) {
        messages.push({ role: "assistant", content: `Error: ${result.error}`, steps: [] });
      } else {
        messages.push({
          role: "assistant",
          content: result.reply || "",
          steps: companionStepLines(result),
          confirmations: Array.isArray(result.confirmations) ? result.confirmations : [],
          thinking: result.thinking || "",
          followups: companionChoiceItems(result),
          fact_check: result.fact_check || null,
          route_strength: result.route_strength || "normal",
          source: result.source || "",
          rerouted_from: result.rerouted_from || "",
        });
        confirmed = true;
        maybeCaptureMemoryFromReply(result.reply || "");
        if (typeof agentRefreshAffectedViews === "function") {
          agentRefreshAffectedViews(result.actions || []);
        }
      }
    } catch (err) {
      messages.splice(pendingIdx, 1);
      const stopped = controller.signal.aborted || stopRequested || err?.name === "AbortError";
      messages.push({
        role: "assistant",
        content: stopped ? "Stopped by you." : `Error: ${errorMessage(err)}`,
        steps: [],
      });
    } finally {
      if (!confirmed) {
        removedConfirmations.forEach(([chatMessage, confirmation]) => {
          chatMessage.confirmations = chatMessage.confirmations || [];
          chatMessage.confirmations.push(confirmation);
        });
      }
      if (chatAbortController === controller) chatAbortController = null;
      setInFlight(false);
      renderMessages();
      saveChatHistoryLocal();
      refreshRunningStrip();
      if (typeof refreshHudData === "function") refreshHudData();
    }
  }

  function whatIDidHtml(lines, confirmations) {
    const items = (lines || []).map(l => companionStepText(l)).filter(Boolean);
    const confirmHtml = companionConfirmationCardsHtml(confirmations);
    if (!items.length && !confirmHtml) return "";
    const rows = items.map((line, idx) => {
      const cancelKey = typeof agentCancellationKey === "function"
        ? agentCancellationKey("step", { line, idx }, { scope: "companion", conversationId: activeConversationId })
        : `companion:${activeConversationId || "none"}:step:${JSON.stringify({ line, idx })}`;
      const cancelled = typeof agentIsItemCancelled === "function" && agentIsItemCancelled(cancelKey);
      return `<li class="companion-step-line agc-cancellable-item${cancelled ? " agc-item-cancelled" : ""}" data-cancel-key="${escapeHtml(cancelKey)}">
        <span class="agc-step-text">${escapeHtml(line)}</span>
        <button type="button" class="agc-cancel-item" data-cancel-key="${escapeHtml(cancelKey)}"${cancelled ? " disabled" : ""}>Cancel</button>
        <span class="agc-cancelled-status"${cancelled ? "" : " hidden"}>Cancelled</span>
      </li>`;
    }).join("");
    const stepsBlock = items.length
      ? `<details class="companion-what-i-did" open>
      <summary class="companion-what-i-did-summary">What I did <span class="companion-step-count">(${items.length})</span></summary>
      <ul class="companion-step-list">${rows}</ul>
    </details>`
      : "";
    return `${stepsBlock}${confirmHtml}`;
  }

  function toast(msg, kind) {
    if (typeof showToast === "function") showToast(msg, kind);
  }

  function todayYmd() {
    if (typeof localYmd === "function") return localYmd();
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function readXpToday() {
    try {
      const raw = JSON.parse(localStorage.getItem("gameXpToday") || "null");
      if (raw && raw.date === todayYmd()) return Math.max(0, parseInt(raw.amount, 10) || 0);
    } catch (_) { /* ignore */ }
    return 0;
  }

  function readQuestClaimed() {
    try {
      const state = JSON.parse(localStorage.getItem("gameQuests") || "null");
      if (state && state.date === todayYmd()) return !!state.claimed;
    } catch (_) { /* ignore */ }
    return false;
  }

  function readGameSnapshot() {
    const wg = window.WaypointGame;
    if (wg && typeof wg.getState === "function") {
      try {
        const s = wg.getState();
        const claimed = readQuestClaimed();
        return {
          questsToday: Array.isArray(s.questsToday) ? s.questsToday : [],
          allQuestsDone: !!s.allQuestsDone,
          chestClaimable: !!s.allQuestsDone && !claimed,
          streak: cachedStreak,
          xpToday: readXpToday(),
        };
      } catch (_) { /* fall through */ }
    }
    return {
      questsToday: [],
      allQuestsDone: false,
      chestClaimable: false,
      streak: cachedStreak,
      xpToday: readXpToday(),
    };
  }

  function computeMoodState(snapshot) {
    if (snapshot.chestClaimable) return "ready";
    const quests = snapshot.questsToday || [];
    const incomplete = quests.filter(q => !q.done);
    if (incomplete.length === 1) return "urgent";
    const doneCount = quests.filter(q => q.done).length;
    const hasProgress = quests.some(q => (q.progress || 0) > 0);
    const active = (snapshot.streak || 0) > 0
      || (snapshot.xpToday || 0) > 0
      || hasProgress
      || doneCount > 0;
    return active ? "warm" : "cold";
  }

  function weakestIncompleteQuest(questsToday) {
    const incomplete = (questsToday || []).filter(q => !q.done);
    if (!incomplete.length) return null;
    return incomplete.reduce((weakest, q) => {
      const ratio = (q.progress || 0) / Math.max(1, q.target || 1);
      const wRatio = (weakest.progress || 0) / Math.max(1, weakest.target || 1);
      return ratio < wRatio ? q : weakest;
    });
  }

  function oracleHintForQuest(quest) {
    if (!quest) return "All daily quests are done — open the chest on the HUD chip if you haven't yet.";
    const base = ORACLE_HINTS[quest.key]
      || `Focus on "${quest.label}" — ${quest.progress || 0}/${quest.target || 1} so far.`;
    const left = Math.max(0, (quest.target || 1) - (quest.progress || 0));
    if (left > 0 && quest.key === "paint6") {
      return `${base} (${left} hour${left === 1 ? "" : "s"} left).`;
    }
    if (left > 0 && left <= 5) {
      return `${base} (${left} left).`;
    }
    return base;
  }

  function oracleUsedToday() {
    try {
      return localStorage.getItem(STORAGE_ORACLE_DAY) === todayYmd();
    } catch (_) {
      return false;
    }
  }

  function markOracleUsed() {
    try {
      localStorage.setItem(STORAGE_ORACLE_DAY, todayYmd());
    } catch (_) { /* ignore */ }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .companion-launcher {
        background: transparent !important;
        border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent) !important;
        box-shadow: none !important;
        border-radius: 14px !important;
      }
      .companion-launcher-orb {
        width: 28px; height: 28px; border-radius: 0;
        background: none !important; box-shadow: none !important; animation: none !important;
        display: grid; place-items: center;
      }
      .companion-launcher-orb svg { width: 28px; height: 28px; display: block; }
      .companion-launcher-orb--cold {
        background: none !important; box-shadow: none !important;
        animation: companion-orb-pulse-cold 4.2s ease-in-out infinite;
      }
      .companion-launcher-orb--cold svg { filter: grayscale(0.35) saturate(0.75); }
      .companion-launcher-orb--warm {
        background: none !important; box-shadow: none !important;
        animation: companion-orb-pulse 2.8s ease-in-out infinite;
      }
      .companion-launcher-orb--urgent {
        background: none !important; box-shadow: none !important;
        animation: companion-orb-pulse-urgent 1.4s ease-in-out infinite;
      }
      .companion-launcher-orb--urgent svg { filter: hue-rotate(-12deg) saturate(1.25); }
      .companion-launcher-orb--ready {
        background: none !important; box-shadow: none !important;
        animation: companion-orb-pulse-ready 1.8s ease-in-out infinite;
      }
      .companion-launcher-orb--ready svg { filter: saturate(1.35) brightness(1.08); }
      @keyframes companion-orb-pulse-cold {
        0%, 100% { transform: scale(1); opacity: 0.82; }
        50% { transform: scale(1.04); opacity: 1; }
      }
      @keyframes companion-orb-pulse-urgent {
        0%, 100% { transform: scale(1); box-shadow: 0 0 10px color-mix(in srgb, #ea580c 45%, transparent); }
        50% { transform: scale(1.1); box-shadow: 0 0 18px color-mix(in srgb, #ea580c 70%, transparent); }
      }
      @keyframes companion-orb-pulse-ready {
        0%, 100% { transform: scale(1); filter: brightness(1); }
        50% { transform: scale(1.08); filter: brightness(1.15); }
      }
      .companion-msg { position: relative; }
      .companion-voice-review {
        display: flex; flex-direction: column; gap: 8px;
        padding: 10px 12px; border-top: 1px solid var(--border);
        background: color-mix(in srgb, var(--bg-card) 90%, var(--accent) 10%);
        flex-shrink: 0;
      }
      .companion-voice-review-head { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-secondary); }
      .companion-voice-text {
        width: 100%; min-height: 72px; resize: vertical; font: inherit; line-height: 1.45;
        padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border);
        background: var(--bg); color: var(--ink-primary); user-select: text;
      }
      .companion-voice-review-actions { display: flex; gap: 8px; justify-content: flex-end; }
      .companion-voice-send, .companion-voice-discard {
        min-height: 36px; padding: 6px 14px; border-radius: 999px; cursor: pointer; font-weight: 650;
        border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
      }
      .companion-voice-send {
        background: color-mix(in srgb, var(--accent) 82%, #111 18%); color: #f7efe4; border-color: transparent;
      }
      .companion-mic-stop {
        min-height: 36px; padding: 6px 12px; border-radius: 999px; cursor: pointer;
        border: 1px solid color-mix(in srgb, var(--status-critical, #c45c26) 45%, var(--border));
        color: var(--status-critical, #c45c26); background: transparent;
        display: inline-flex; align-items: center; gap: 6px; font-weight: 650;
      }
      .companion-mic { width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border-radius: 999px; cursor: pointer; }
      .companion-icon { width: 13px; height: 13px; display: block; fill: currentColor; }
      .companion-copy-btn {
        position: absolute; top: 2px; right: 2px; z-index: 1;
        width: 26px; height: 26px; padding: 0; border: 1px solid var(--border); border-radius: 8px;
        background: var(--bg-card); color: var(--ink-secondary); font-size: 12px; line-height: 1; cursor: pointer;
        opacity: 0.85; display: grid; place-items: center;
      }
      .companion-msg:hover .companion-copy-btn { opacity: 1; color: var(--ink-primary); }
      .companion-bubble { user-select: text; -webkit-user-select: text; padding-right: 28px; }
      .companion-oracle-row {
        display: flex; flex-direction: column; gap: 6px;
        padding: 8px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
      }
      .companion-oracle-actions { display: flex; align-items: center; gap: 8px; }
      .companion-oracle-btn {
        font-size: 11px; padding: 4px 10px; border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
        background: color-mix(in srgb, var(--bg-card) 90%, var(--accent) 10%);
        color: var(--ink-primary); cursor: pointer; white-space: nowrap;
      }
      .companion-oracle-btn:hover:not(:disabled) {
        border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
        background: color-mix(in srgb, var(--bg-card) 82%, var(--accent) 18%);
      }
      .companion-oracle-btn:disabled {
        opacity: 0.55; cursor: not-allowed; color: var(--ink-muted);
      }
      .companion-oracle-hint {
        font-size: 11px; line-height: 1.45; color: var(--ink-secondary);
        min-height: 0;
      }
      .companion-oracle-hint--visible { color: var(--ink-primary); }
      .companion-head-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .companion-conversation-row {
        display: flex; align-items: center; gap: 6px; padding: 6px 10px;
        border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--bg-card) 96%, var(--accent) 4%);
        flex-shrink: 0;
      }
      .companion-conversation-select {
        flex: 1; min-width: 0; padding: 5px 8px; border-radius: 8px;
        border: 1px solid var(--border); background: var(--bg-card); color: var(--ink-primary);
        font-size: 11px;
      }
      .companion-new-chat {
        flex: 0 0 auto; padding: 5px 9px; border-radius: 8px; cursor: pointer;
        border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
        background: color-mix(in srgb, var(--accent) 8%, var(--bg-card));
        color: var(--ink-primary); font-size: 11px; font-weight: 650;
      }
      .companion-new-chat:hover {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 14%, var(--bg-card));
      }
      .companion-memory-btn,
      .companion-fullscreen,
      .companion-close,
      .companion-rename-chat,
      .companion-delete-chat {
        font-size: 11px; padding: 3px 8px; border-radius: 999px;
        border: 1px solid transparent; background: transparent;
        color: var(--ink-secondary); cursor: pointer;
      }
      .companion-memory-btn:hover,
      .companion-memory-btn--active {
        color: var(--ink-primary);
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
        background: color-mix(in srgb, var(--bg-card) 85%, var(--accent) 15%);
      }
      .companion-memory-panel {
        display: flex; flex-direction: column; gap: 8px;
        max-height: 160px; overflow: auto;
        padding: 8px 12px; border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
        flex-shrink: 0;
      }
      .companion-memory-panel[hidden] { display: none !important; }
      .companion-memory-panel-head {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 11px; color: var(--ink-secondary);
      }
      .companion-memory-panel-actions {
        display: flex; align-items: center; gap: 8px;
      }
      .companion-memory-list { display: flex; flex-direction: column; gap: 6px; }
      .companion-memory-empty { margin: 0; font-size: 11px; color: var(--ink-muted); }
      .companion-memory-item {
        padding: 6px 8px; border-radius: 8px;
        border: 1px solid var(--border); background: var(--bg-card);
      }
      .companion-memory-item--faded { opacity: 0.55; }
      .companion-memory-item-head {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .companion-memory-title { font-size: 11px; flex: 1; }
      .companion-memory-weight {
        font-size: 9px; color: var(--ink-muted); min-width: 28px; text-align: right;
      }
      .companion-memory-edit,
      .companion-memory-del {
        border: none; background: transparent; color: var(--ink-muted);
        cursor: pointer; font-size: 11px; padding: 0 4px;
      }
      .companion-memory-edit:hover { color: var(--ink-primary); }
      .companion-memory-body {
        margin: 4px 0 0; font-size: 10px; line-height: 1.4; color: var(--ink-secondary);
      }
      .companion-memory-del:hover { color: var(--status-bad, #e84a2f); }
      .companion-memory-add {
        font-size: 10px; padding: 3px 8px; border-radius: 999px;
        border: 1px dashed var(--border); background: transparent;
        color: var(--ink-secondary); cursor: pointer;
      }
      .companion-memory-add:hover {
        color: var(--ink-primary);
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
      }
      .companion-route-chip {
        font-size: 10px; padding: 1px 6px; border-radius: 999px;
        border: 1px solid var(--border); color: var(--ink-muted);
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .companion-bubble .agc-thinking,
      .companion-bubble .companion-what-i-did {
        margin-top: 9px; font-size: 11px; white-space: normal;
      }
      .companion-bubble .agc-thinking-summary,
      .companion-bubble .companion-what-i-did-summary {
        cursor: pointer; color: var(--ink-secondary); font-weight: 700;
      }
      .companion-bubble .agc-thinking-body {
        display: block; margin: 6px 0 0; padding: 8px 10px; border-radius: 8px;
        border: 1px solid var(--gridline); background: var(--bg-card);
        color: var(--ink-secondary); font: 11px/1.45 inherit; white-space: pre-wrap;
      }
      .companion-bubble .companion-step-list {
        margin: 6px 0 0; padding: 0; list-style: none;
      }
      .companion-bubble .companion-step-line {
        margin: 0 0 4px; padding-left: 8px; border-left: 2px solid var(--gridline);
        color: var(--ink-secondary); font-size: 11px; line-height: 1.45;
      }
      .companion-bubble .agc-followups {
        margin-top: 12px; display: grid; grid-template-columns: 1fr; gap: 7px; white-space: normal;
      }
      .companion-bubble .agc-choice-label {
        font-size: 9px; font-weight: 750; letter-spacing: .06em;
        text-transform: uppercase; color: var(--ink-secondary);
      }
      .companion-bubble .agc-followup-chip {
        display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px;
        padding: 8px 10px; border-radius: 12px; cursor: pointer; text-align: left;
        border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
        background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 9%, var(--bg-card)), var(--bg-card-hover));
        color: var(--ink-primary); font-size: 11px; line-height: 1.35;
        box-shadow: 0 2px 8px color-mix(in srgb, #000 9%, transparent);
      }
      .companion-bubble .agc-followup-chip:hover {
        border-color: var(--accent); transform: translateY(-1px);
      }
      .companion-bubble .agc-followup-chip.agc-choice-working {
        opacity: .72; cursor: wait; transform: none; box-shadow: none;
      }
      .companion-bubble .agc-choice-index {
        display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 22px;
        border-radius: 8px; background: color-mix(in srgb, var(--accent) 14%, var(--bg-card));
        color: var(--accent); font-size: 10px; font-weight: 800;
      }
      .companion-bubble .agc-choice-text { flex: 1; overflow-wrap: anywhere; }
      .companion-bubble .agc-choice-arrow { color: var(--ink-secondary); font-size: 14px; }
      .companion-bubble .agc-confirm-card {
        margin-top: 10px; padding: 11px 12px; border-radius: 12px; white-space: normal;
        border: 1px solid color-mix(in srgb, var(--status-warning) 45%, var(--border));
        background: linear-gradient(145deg, color-mix(in srgb, var(--status-warning) 9%, var(--bg-card)), var(--bg-card));
        box-shadow: 0 4px 14px color-mix(in srgb, #000 9%, transparent);
      }
      .companion-bubble .agc-confirm-title { margin: 0 0 6px; font-size: 12px; font-weight: 750; }
      .companion-bubble .agc-confirm-summary,
      .companion-bubble .agc-confirm-list { font-size: 11px; line-height: 1.45; color: var(--ink-secondary); }
      .companion-bubble .agc-confirm-list { margin: 0 0 9px 16px; padding: 0; }
      .companion-bubble .agc-confirm-warning {
        margin: 0 0 9px; padding: 8px; border-radius: 8px; font-size: 11px; line-height: 1.4;
        color: var(--status-warning); border: 1px solid color-mix(in srgb, var(--status-warning) 45%, var(--border));
        background: color-mix(in srgb, var(--status-warning) 10%, var(--bg-card));
      }
      .companion-bubble .agc-confirm-actions { display: flex; gap: 7px; flex-wrap: wrap; }
      .companion-bubble .agc-confirm-actions button { min-height: 34px; padding: 6px 12px; border-radius: 9px; }
      @media (prefers-reduced-motion: reduce) {
        .companion-launcher-orb--cold,
        .companion-launcher-orb--warm,
        .companion-launcher-orb--urgent,
        .companion-launcher-orb--ready { animation: none !important; }
      }`;
    document.head.appendChild(style);
  }

  async function fetchPracticeStreak() {
    const data = await apiSafe("/api/practice/summary", { _silent: true });
    if (data && !data._missing && !data._error) {
      cachedStreak = Math.max(0, parseInt(data.streak, 10) || 0);
    }
  }

  function updateMoodOrb() {
    const orb = document.querySelector(".companion-launcher-orb");
    const launcher = document.getElementById("companion-launcher");
    if (!orb) return;
    const mood = computeMoodState(readGameSnapshot());
    if (mood === lastMood) return;
    lastMood = mood;
    orb.classList.remove("companion-launcher-orb--cold", "companion-launcher-orb--warm",
      "companion-launcher-orb--urgent", "companion-launcher-orb--ready");
    orb.classList.add(`companion-launcher-orb--${mood}`);
    if (launcher) launcher.title = MOOD_LABELS[mood] || "AI companion";
  }

  function refreshOracleUi() {
    const btn = document.getElementById("companion-oracle-btn");
    const hintEl = document.getElementById("companion-oracle-hint");
    if (!btn) return;
    const used = oracleUsedToday();
    btn.disabled = used;
    btn.title = used ? "Daily oracle returns at midnight" : "One hint about today's weakest quest";
    if (hintEl && !hintEl.dataset.revealed && used) {
      hintEl.textContent = "Oracle spent for today — check back after midnight.";
      hintEl.classList.add("companion-oracle-hint--visible");
    }
  }

  function revealOracle() {
    if (oracleUsedToday()) {
      refreshOracleUi();
      return;
    }
    const snapshot = readGameSnapshot();
    const quest = weakestIncompleteQuest(snapshot.questsToday);
    const hint = oracleHintForQuest(quest);
    markOracleUsed();
    const hintEl = document.getElementById("companion-oracle-hint");
    const btn = document.getElementById("companion-oracle-btn");
    if (hintEl) {
      hintEl.textContent = hint;
      hintEl.classList.add("companion-oracle-hint--visible");
      hintEl.dataset.revealed = "1";
    }
    if (btn) {
      btn.disabled = true;
      btn.title = "Daily oracle returns at midnight";
    }
    toast("Daily oracle revealed", "info");
  }

  async function apiSafe(path, opts) {
    try {
      const res = await fetch(path, opts);
      if (res.status === 404) return { _missing: true };
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    } catch (err) {
      if (opts?._silent) return { _error: errorMessage(err || new Error("request failed")) };
      throw err;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_OPEN, panelOpen ? "1" : "0");
    } catch (_) { /* ignore */ }
  }

  function loadOpenState() {
    try {
      return localStorage.getItem(STORAGE_OPEN) === "1";
    } catch (_) {
      return false;
    }
  }

  function companionThinkingHtml(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    if (typeof agentThinkingHtml === "function") return agentThinkingHtml(t);
    return `<details class="agc-thinking"><summary class="agc-thinking-summary">Thoughts</summary><pre class="agc-thinking-body">${escapeHtml(t)}</pre></details>`;
  }

  function companionChoiceItems(source) {
    if (typeof agentChoiceItems === "function") return agentChoiceItems(source);
    const raw = Array.isArray(source)
      ? source
      : (source?.followups || source?.choices || source?.choice_options || source?.options || []);
    return (Array.isArray(raw) ? raw : []).map(item => {
      if (item && typeof item === "object") {
        return String(item.label || item.title || item.text || item.value || "").trim();
      }
      return String(item || "").trim();
    }).filter(Boolean).slice(0, 3);
  }

  function companionFollowupsHtml(items) {
    const list = companionChoiceItems(items);
    if (!list.length) return "";
    return `<div class="agc-followups companion-followups" role="group" aria-label="Suggested choices">
      <div class="agc-choice-label">Choose a next action</div>${list.map((q, idx) =>
      `<button type="button" class="agc-followup-chip" data-followup="${escapeHtml(q)}"><span class="agc-choice-index">${idx + 1}</span><span class="agc-choice-text">${escapeHtml(q)}</span><span class="agc-choice-arrow" aria-hidden="true">→</span></button>`
    ).join("")}</div>`;
  }

  function companionApplyChoiceNoToolFallback(result, isChoiceFollowup) {
    if (typeof agentApplyChoiceNoToolFallback === "function") {
      return agentApplyChoiceNoToolFallback(result, isChoiceFollowup);
    }
    if (!isChoiceFollowup || !result || result.error) return result;
    const actions = Array.isArray(result.actions) ? result.actions : [];
    const confirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
    if (actions.length || confirmations.length) return result;
    const nudge = "I described the plan, but did not run a tool — choose “Do it now” to ask me to act.";
    const reply = String(result.reply || "").trim();
    const followups = companionChoiceItems(result).filter(item => item.toLowerCase() !== "do it now");
    return {
      ...result,
      reply: reply ? `${reply}\n\n${nudge}` : nudge,
      followups: ["Do it now", ...followups].slice(0, 3),
    };
  }

  function wireCompanionFollowups(root) {
    (root || document).querySelectorAll(".agc-followup-chip").forEach(btn => {
      if (btn.dataset.wired === "1") return;
      btn.dataset.wired = "1";
      btn.onclick = () => {
        const q = btn.dataset.followup || "";
        const input = document.getElementById("companion-input");
        if (input) input.value = q;
        if (!q || inFlight) {
          if (input) input.focus();
          return;
        }
        btn.disabled = true;
        btn.classList.add("agc-choice-working");
        btn.setAttribute("aria-busy", "true");
        const arrow = btn.querySelector(".agc-choice-arrow");
        if (arrow) arrow.textContent = "…";
        sendChat(q, { choiceFollowup: true });
      };
    });
  }

  function companionStarterPrompts() {
    const tab = typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "Home";
    const meta = typeof PAGE_INTENTS !== "undefined" ? PAGE_INTENTS[tab] : null;
    const label = (typeof TAB_LABELS !== "undefined" && TAB_LABELS[tab]) || tab;
    const primary = meta?.primary || "Help";
    return [
      `${primary} on ${label}`,
      "What is the one thing I should do here?",
      "Summarize this page in one sentence",
    ];
  }

  function companionEmptyHtml() {
    const chips = companionStarterPrompts().map(prompt =>
      `<button type="button" class="companion-starter" data-companion-starter="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`
    ).join("");
    return `<div class="empty-state empty-state--compact companion-empty">
      <p class="empty-state-title">Ask about this page</p>
      <p class="empty-state-body">Companion already knows where you are. Start with a line, or tap a starter.</p>
      <div class="companion-starters">${chips}</div>
    </div>`;
  }

  function wireCompanionStarters(log) {
    log.querySelectorAll("[data-companion-starter]").forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById("companion-input");
        if (!input) return;
        input.value = btn.dataset.companionStarter || "";
        input.focus();
      };
    });
  }

  function renderMessages() {
    const log = document.getElementById("companion-log");
    if (!log) return;
    if (!messages.length) {
      log.innerHTML = companionEmptyHtml();
      wireCompanionStarters(log);
      return;
    }
    log.innerHTML = messages.map(m => {
      if (m.role === "user") {
        return `<div class="companion-msg companion-msg-user"><button type="button" class="companion-copy-btn" title="Copy message" aria-label="Copy message">${companionIconSvg("copy")}</button><div class="companion-bubble">${escapeHtml(m.content)}</div></div>`;
      }
      const steps = whatIDidHtml(m.steps, m.confirmations);
      const thoughts = companionThinkingHtml(m.thinking);
      const followups = companionFollowupsHtml(m.followups);
      const fact = typeof agentFactCheckHtml === "function" ? agentFactCheckHtml(m.fact_check) : "";
      const pending = m.pending
        ? `<div class="companion-pending"><span class="companion-spinner"></span> ${m.choiceWorking ? "Turning your choice into an action…" : "Working…"}</div>`
        : "";
      const provider = (typeof agentProviderPillHtml === "function") ? agentProviderPillHtml(m) : "";
      return `<div class="companion-msg companion-msg-assistant"><button type="button" class="companion-copy-btn" title="Copy message" aria-label="Copy message">${companionIconSvg("copy")}</button><div class="companion-bubble">${provider}${pending || escapeHtml(m.content || "")}${thoughts}${steps}${followups}${fact}</div></div>`;
    }).join("");
    wireCompanionConfirmationCards(log);
    wireCompanionFollowups(log);
    log.querySelectorAll(".companion-copy-btn").forEach(btn => {
      btn.onclick = () => {
        const bubble = btn.parentElement?.querySelector(".companion-bubble");
        const selected = String(window.getSelection?.()?.toString() || "").trim();
        const inBubble = selected && bubble && window.getSelection()?.anchorNode && bubble.contains(window.getSelection().anchorNode);
        const text = inBubble ? selected : (bubble ? bubble.textContent : "");
        if (typeof copyToClipboard === "function") copyToClipboard(text);
        else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text || "");
      };
    });
    log.scrollTop = log.scrollHeight;
  }

  function setSteering(on) {
    steering = on;
    const el = document.getElementById("companion-steer-indicator");
    if (el) el.hidden = !on;
  }

  function setInFlight(on) {
    inFlight = on;
    const sendBtn = document.getElementById("companion-send");
    const stopBtn = document.getElementById("companion-stop");
    const instantBtn = document.getElementById("companion-instant");
    const input = document.getElementById("companion-input");
    if (sendBtn) {
      sendBtn.classList.toggle("companion-in-flight", on);
      sendBtn.setAttribute("aria-busy", on ? "true" : "false");
      sendBtn.textContent = on ? "Steer" : "Send";
      sendBtn.title = on ? "Steer the current response" : "Send";
    }
    if (stopBtn) stopBtn.hidden = !on;
    if (instantBtn) instantBtn.disabled = on;
    if (input) input.disabled = false;
  }

  async function stopCompanionTurn() {
    if (!inFlight) return;
    stopRequested = true;
    if (chatAbortController) chatAbortController.abort();
    try {
      await apiSafe("/api/agent/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: "chat" }),
        _silent: true,
      });
    } catch (_) { /* browser cancellation is already immediate */ }
    toast("Stopped this response", "info");
  }

  async function sendChat(message, options) {
    if (!activeConversationId) {
      await createCompanionConversation();
      if (!activeConversationId) return;
    }
    const isChoiceFollowup = !!options?.choiceFollowup;
    // Choice cards stay on normal so they get tools; ordinary writes auto-apply server-side.
    const forcedRoute = options?.routeStrength;
    const routeStrength = forcedRoute === "fast"
      ? "fast"
      : (isChoiceFollowup ? "normal" : (forcedRoute || "strong"));
    if (!options?.skipCostConfirm && routeStrength !== "fast") {
      try {
        const pre = await apiSafe("/api/ai/preflight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: message, history_len: messages.length }),
        });
        if (pre && !pre._missing && pre.needs_confirm) {
          const confirmCost = window.agentConfirmCost || window.wpConfirmCost;
          const ok = confirmCost
            ? await confirmCost(pre.estimated_usd)
            : window.confirm(`This turn looks like about $${Number(pre.estimated_usd || 0).toFixed(2)}. Send anyway?`);
          if (!ok) return;
        }
      } catch (_) { /* send anyway if preflight is down */ }
    }
    // Memories are relevance-ranked and injected server-side before answering/tools.
    const full = routeSystemPrefix(routeStrength)
      + pageContextPrefix()
      + message;
    messages.push({ role: "user", content: message });
    if (window.WaypointGame && typeof window.WaypointGame.questProgress === "function") {
      window.WaypointGame.questProgress("talk1");
    }
    const pendingIdx = messages.length;
    messages.push({ role: "assistant", content: "", pending: true, choiceWorking: isChoiceFollowup, steps: [] });
    renderMessages();
    stopRequested = false;
    const controller = new AbortController();
    chatAbortController = controller;
    setInFlight(true);
    updateRouteChip(routeStrength);

    try {
      let result = await apiSafe("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: full,
          route_strength: routeStrength,
          source: "companion",
          conversation_id: activeConversationId,
        }),
        signal: controller.signal,
      });
      result = companionApplyChoiceNoToolFallback(result, isChoiceFollowup);
      messages.splice(pendingIdx, 1);
      applyConversationMetadata(result);
      if (result._missing) {
        messages.push({
          role: "assistant",
          content: "Companion chat is not available yet.",
          steps: [],
        });
      } else if (result.error) {
        messages.push({ role: "assistant", content: `Error: ${result.error}`, steps: [] });
      } else {
        const stepLines = companionStepLines(result);
        const reply = result.reply || "";
        messages.push({
          role: "assistant",
          content: reply,
          steps: stepLines,
          confirmations: Array.isArray(result.confirmations) ? result.confirmations : [],
          thinking: result.thinking || "",
          followups: companionChoiceItems(result),
          fact_check: result.fact_check || null,
          route_strength: result.route_strength || routeStrength,
          source: result.source || "",
          rerouted_from: result.rerouted_from || "",
        });
        maybeCaptureMemoryFromReply(reply);
        if (typeof agentRefreshAffectedViews === "function") {
          agentRefreshAffectedViews(result.actions || []);
        }
      }
    } catch (err) {
      messages.splice(pendingIdx, 1);
      const stopped = controller.signal.aborted || stopRequested || err?.name === "AbortError";
      messages.push({
        role: "assistant",
        content: stopped ? "Stopped by you." : `Error: ${errorMessage(err)}`,
        steps: [],
      });
    } finally {
      if (chatAbortController === controller) chatAbortController = null;
      setInFlight(false);
      setSteering(false);
      renderMessages();
      saveChatHistoryLocal();
      refreshRunningStrip();
      if (typeof refreshHudData === "function") refreshHudData();
    }
  }

  function updateRouteChip(strength) {
    const chip = document.getElementById("companion-route-chip");
    if (chip) {
      chip.textContent = strength || "normal";
      chip.title = routeChipTitle(strength);
    }
  }

  function maybeCaptureMemoryFromReply(reply) {
    const str = String(reply || "");
    const m3 = str.match(/\[remember:\s*([^|\]]+)\|\s*([^|\]]+)\|\s*([^\]]+)\]/i);
    if (m3) {
      companionAddMemory(m3[2].trim(), m3[3].trim(), { core: true, speaker: m3[1].trim() });
      return;
    }
    const m2 = str.match(/\[remember:\s*([^|\]]+)\|\s*([^\]]+)\]/i);
    if (m2) companionAddMemory(m2[1].trim(), m2[2].trim(), { core: true });
  }

  async function sendSteer(message) {
    setSteering(true);
    try {
      const result = await apiSafe("/api/agent/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        _silent: true,
      });
      if (result._missing || result.queued === false) {
        setSteering(false);
        await sendChat(message);
        return;
      }
      messages.push({ role: "user", content: message, steer: true });
      renderMessages();
      toast("Steering message queued", "info");
    } catch (err) {
      setSteering(false);
      toast(`Steer failed: ${errorMessage(err)}`, "bad");
    }
  }

  async function handleSend() {
    const input = document.getElementById("companion-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    if (inFlight) {
      await sendSteer(text);
    } else {
      await sendChat(text);
    }
  }

  async function handleInstantAnswer() {
    if (inFlight) return;
    const input = document.getElementById("companion-input");
    const text = input?.value.trim();
    if (!text) {
      input?.focus();
      return;
    }
    input.value = "";
    await sendChat(text, { routeStrength: "fast" });
  }

  function showVoiceReview(text) {
    const input = document.getElementById("companion-input");
    let bar = document.getElementById("companion-voice-review");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "companion-voice-review";
      bar.className = "companion-voice-review";
      const foot = document.querySelector(".companion-foot");
      foot?.parentNode?.insertBefore(bar, foot);
    }
    bar.hidden = false;
    bar.innerHTML = `<div class="companion-voice-review-head">Review transcript, then send.</div>
      <textarea id="companion-voice-text" class="companion-voice-text">${escapeHtml(text)}</textarea>
      <div class="companion-voice-review-actions">
        <button type="button" class="companion-voice-discard" id="companion-voice-discard">Discard</button>
        <button type="button" class="companion-voice-send" id="companion-voice-send">Send</button>
      </div>`;
    const area = document.getElementById("companion-voice-text");
    area?.focus();
    document.getElementById("companion-voice-discard").onclick = () => {
      bar.hidden = true;
      if (input) input.value = "";
    };
    document.getElementById("companion-voice-send").onclick = () => {
      const compiled = (area?.value || "").trim();
      bar.hidden = true;
      if (input) input.value = compiled;
      handleSend();
    };
  }

  function stopListening(sendAfter) {
    if (!recognition || !listening) return;
    listening = false;
    const mic = document.getElementById("companion-mic");
    const stopBtn = document.getElementById("companion-mic-stop");
    if (mic) mic.classList.remove("companion-mic-active");
    if (stopBtn) stopBtn.hidden = true;
    try { recognition.stop(); } catch (_) { /* ignore */ }
    const input = document.getElementById("companion-input");
    const text = (input?.value.trim() || voiceFinal || "").trim();
    if (sendAfter && text) showVoiceReview(text);
  }

  function startListening() {
    if (!voiceSupported) return;
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = document.documentElement.lang || "en-US";

      recognition.onresult = (ev) => {
        const input = document.getElementById("companion-input");
        if (!input) return;
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) voiceFinal = `${voiceFinal} ${t}`.replace(/\s+/g, " ").trim();
          else interim += t;
        }
        input.value = `${voiceFinal}${interim ? ` ${interim}` : ""}`.replace(/\s+/g, " ").trim();
      };

      recognition.onerror = (ev) => {
        listening = false;
        const mic = document.getElementById("companion-mic");
        const stopBtn = document.getElementById("companion-mic-stop");
        if (mic) mic.classList.remove("companion-mic-active");
        if (stopBtn) stopBtn.hidden = true;
        const msg = ev.error === "not-allowed"
          ? "Microphone permission denied"
          : `Voice error: ${ev.error}`;
        toast(msg, "bad");
      };

      recognition.onend = () => {
        const mic = document.getElementById("companion-mic");
        const stopBtn = document.getElementById("companion-mic-stop");
        const wasListening = listening;
        listening = false;
        if (mic) mic.classList.remove("companion-mic-active");
        if (stopBtn) stopBtn.hidden = true;
        if (wasListening) {
          const input = document.getElementById("companion-input");
          if (input?.value.trim()) showVoiceReview(input.value.trim());
        }
      };
    }

    if (listening) {
      stopListening(true);
      return;
    }

    listening = true;
    voiceFinal = (document.getElementById("companion-input")?.value || "").trim();
    const mic = document.getElementById("companion-mic");
    const stopBtn = document.getElementById("companion-mic-stop");
    if (mic) mic.classList.add("companion-mic-active");
    if (stopBtn) stopBtn.hidden = false;
    try {
      recognition.start();
    } catch (err) {
      listening = false;
      if (mic) mic.classList.remove("companion-mic-active");
      if (stopBtn) stopBtn.hidden = true;
      toast(`Voice unavailable: ${errorMessage(err)}`, "bad");
    }
  }

  function normalizeRunningAgents(data) {
    if (!data || data._missing || data._error) return [];
    if (Array.isArray(data)) {
      return data
        .filter(a => a.status === "running" || !a.status)
        .map(a => ({
          id: a.id || a.subagent || a.name || "agent",
          name: a.name || a.subagent || "agent",
          age_seconds: a.age_seconds ?? 0,
          kind: a.kind || (a.cancel_event ? "spawned" : "orchestrator"),
        }));
    }
    const list = Array.isArray(data.running_agents) ? data.running_agents : [];
    return list.map(a => ({
      id: a.id || a.name || "agent",
      name: a.name || a.id || "agent",
      age_seconds: a.age_seconds ?? 0,
      kind: a.kind || (a.cancel_event ? "spawned" : "orchestrator"),
    }));
  }

  async function fetchRunningAgents() {
    let data = await apiSafe("/api/agent/running", { _silent: true });
    if (data._missing || data._error) {
      data = await apiSafe("/api/agent/activity/running", { _silent: true });
    }
    const rows = normalizeRunningAgents(data);
    const extra = await apiSafe("/api/agents", { _silent: true });
    if (!extra._missing && !extra._error) {
      const seen = new Set(rows.map(a => String(a.id)));
      (extra.spawned || []).forEach(a => {
        const id = a.id || "";
        if (!id || seen.has(String(id))) return;
        seen.add(String(id));
        rows.push({ id, name: a.title || a.name || id, age_seconds: a.age_seconds || 0, kind: "spawned" });
      });
    }
    return rows;
  }

  function formatAge(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  async function cancelAgent(agentId, name, kind) {
    let result = { _missing: true };
    if (kind === "spawned") {
      result = await apiSafe(`/api/agents/${encodeURIComponent(agentId)}/stop`, {
        method: "POST",
        _silent: true,
      });
    }
    if (result._missing || result._error || !result.ok) {
      result = await apiSafe("/api/agent/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
        _silent: true,
      });
    }
    if (result._missing) {
      const input = document.getElementById("companion-input");
      if (input) input.value = `stop the agent named ${name}`;
      handleSend();
      refreshRunningStrip();
      return;
    }
    if (result._error) {
      toast(`Cancel failed: ${result._error}`, "bad");
    } else if (result.ok) {
      toast(`Stopped ${name}`, "info");
    } else {
      toast(result.error || "Cancel failed", "bad");
    }
    refreshRunningStrip();
  }

  async function refreshRunningStrip() {
    const strip = document.getElementById("companion-activity-strip");
    if (!strip || !panelOpen) return;
    try {
      const agents = await fetchRunningAgents();
      if (!agents.length) {
        strip.hidden = true;
        strip.innerHTML = `<span class="companion-activity-idle">No agents running</span>`;
        return;
      }
      strip.hidden = false;
      strip.innerHTML = agents.map(a => `
        <span class="companion-activity-chip" data-agent-id="${escapeHtml(String(a.id))}" data-agent-name="${escapeHtml(String(a.name))}" data-agent-kind="${escapeHtml(String(a.kind || ""))}">
          <span class="companion-activity-dot"></span>
          <span class="companion-activity-name">${escapeHtml(a.name)}</span>
          <span class="companion-activity-age">${escapeHtml(formatAge(a.age_seconds))}</span>
          <button type="button" class="companion-activity-kill" title="Stop agent" aria-label="Stop ${escapeHtml(a.name)}">Stop</button>
        </span>
      `).join("");
      strip.querySelectorAll(".companion-activity-kill").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const chip = btn.closest(".companion-activity-chip");
          const id = chip?.dataset.agentId || "";
          const name = chip?.dataset.agentName || chip?.dataset.agentId || "agent";
          cancelAgent(id, name, chip?.dataset.agentKind || "");
        };
      });
    } catch (_) {
      strip.innerHTML = `<span class="companion-activity-idle">Activity unavailable</span>`;
    }
  }

  async function refreshCompanionPoll() {
    await fetchPracticeStreak();
    updateMoodOrb();
    refreshOracleUi();
    await refreshRunningStrip();
  }

  function startPolling() {
    stopPolling();
    refreshCompanionPoll();
    pollTimer = setInterval(refreshCompanionPoll, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setPanelOpen(open) {
    panelOpen = open;
    const panel = document.getElementById("companion-panel");
    const launcher = document.getElementById("companion-launcher");
    if (panel) {
      panel.hidden = !open;
      panel.classList.toggle("companion-panel-open", open);
    }
    if (launcher) launcher.setAttribute("aria-expanded", open ? "true" : "false");
    saveState();
    if (open) {
      document.getElementById("companion-input")?.focus();
    } else {
      stopListening(false);
      if (fullscreen) setCompanionFullscreen(false);
    }
  }

  function setCompanionFullscreen(on) {
    fullscreen = !!on;
    const panel = document.getElementById("companion-panel");
    const btn = document.getElementById("companion-fullscreen");
    panel?.classList.toggle("companion-panel-fullscreen", fullscreen);
    document.body.classList.toggle("companion-immersive-open", fullscreen);
    if (btn) {
      btn.textContent = fullscreen ? "Exit full" : "Full screen";
      btn.setAttribute("aria-pressed", fullscreen ? "true" : "false");
      btn.title = fullscreen ? "Exit full screen" : "Open full screen";
    }
    if (fullscreen) document.getElementById("companion-input")?.focus();
  }

  function togglePanel() {
    setPanelOpen(!panelOpen);
  }

  function buildDom() {
    if (document.getElementById("companion-launcher")) return;

    const launcher = document.createElement("button");
    launcher.id = "companion-launcher";
    launcher.type = "button";
    launcher.className = "companion-launcher";
    launcher.title = "AI companion";
    launcher.setAttribute("aria-label", "Open AI companion");
    launcher.setAttribute("aria-expanded", "false");
    launcher.innerHTML = `<span class="companion-launcher-orb" aria-hidden="true"><svg class="ws-mark wp-tile-mark" viewBox="0 0 96 96" width="28" height="28" aria-hidden="true"><defs><linearGradient id="wp-companion-mark" x1="48" y1="40" x2="48" y2="61" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c44226"/><stop offset="1" stop-color="#d3ba46"/></linearGradient></defs><rect x="5" y="5" width="86" height="86" rx="24" fill="#17181a" stroke="#2a2c30" stroke-width="2"/><path d="M27.5 61 L48 40 L68 61" fill="none" stroke="url(#wp-companion-mark)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27.5" cy="61" r="6" fill="#d3ba46"/><circle cx="68" cy="61" r="6" fill="#b9a13a"/><circle cx="48" cy="40" r="8" fill="#c44226"/></svg></span>`;
    launcher.onclick = togglePanel;

    const panel = document.createElement("div");
    panel.id = "companion-panel";
    panel.className = "companion-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI companion");
    panel.innerHTML = `
      <header class="companion-head">
        <span class="companion-head-title">Companion</span>
        <span class="companion-head-context" id="companion-page-label"></span>
        <span class="companion-route-chip" id="companion-route-chip" hidden title="Normal — tools auto-apply; deletes still confirm">normal</span>
        <span class="companion-provider-pill" id="companion-provider-pill" hidden></span>
        <div class="companion-head-actions">
          <button type="button" class="companion-memory-btn" id="companion-memory-btn" aria-expanded="false" title="Core memories">Memory</button>
          <button type="button" class="companion-fullscreen" id="companion-fullscreen" aria-pressed="false" title="Open full screen">Full screen</button>
          <button type="button" class="companion-close" id="companion-close" aria-label="Close companion">✕</button>
        </div>
      </header>
      <div class="companion-conversation-row">
        <select id="companion-conversation-select" class="companion-conversation-select" aria-label="Companion conversation"></select>
        <button type="button" id="companion-new-chat" class="companion-new-chat" title="New chat — fresh context, memories kept">＋ New</button>
        <button type="button" id="companion-rename-chat" class="companion-rename-chat" title="Rename this chat">Rename</button>
        <button type="button" id="companion-delete-chat" class="companion-delete-chat" title="Delete this chat">Delete</button>
      </div>
      <div class="companion-memory-panel" id="companion-memory-panel" hidden>
        <div class="companion-memory-panel-head">
          <span>Core memories</span>
          <div class="companion-memory-panel-actions">
            <button type="button" class="companion-memory-add" id="companion-memory-add" title="Add core memory">+ Add</button>
            <span>${MAX_MEMORIES} max</span>
          </div>
        </div>
        <div class="companion-memory-list" id="companion-memory-list"></div>
      </div>
      <div class="companion-activity" id="companion-activity-strip" hidden aria-live="polite">
        <span class="companion-activity-idle">No agents running</span>
      </div>
      <div class="companion-oracle-row" id="companion-oracle-row">
        <div class="companion-oracle-actions">
          <button type="button" class="companion-oracle-btn" id="companion-oracle-btn">Daily oracle</button>
        </div>
        <div class="companion-oracle-hint" id="companion-oracle-hint" aria-live="polite"></div>
      </div>
      <div class="companion-log" id="companion-log" role="log" aria-live="polite"></div>
      <div class="companion-steer-indicator" id="companion-steer-indicator" hidden>steering…</div>
      <footer class="companion-foot">
        <textarea id="companion-input" class="companion-input" rows="1" placeholder="Ask about this page…" aria-label="Companion message"></textarea>
        <div class="companion-foot-actions">
          <button type="button" id="companion-instant" class="companion-instant" title="Fast, lower-cost answer without tools">Instant</button>
          ${voiceSupported
            ? `<button type="button" id="companion-mic" class="companion-mic" title="Voice input — tap to record, stop to review" aria-label="Voice input">${companionIconSvg("mic")}</button>
               <button type="button" id="companion-mic-stop" class="companion-mic-stop" hidden title="Stop recording" aria-label="Stop recording">${companionIconSvg("stop")} Stop recording</button>`
            : `<button type="button" id="companion-mic" class="companion-mic companion-mic-hidden" hidden title="voice not supported in this browser." aria-label="Voice not supported" tabindex="-1">${companionIconSvg("mic")}</button>`}
          <button type="button" id="companion-stop" class="companion-stop" title="Stop this response" aria-label="Stop this response" hidden>Stop</button>
          <button type="button" id="companion-send" class="companion-send" title="Send" aria-label="Send">Send</button>
        </div>
      </footer>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    document.getElementById("companion-close").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPanelOpen(false);
    };
    document.getElementById("companion-memory-btn").onclick = () => toggleMemoryPanel();
    document.getElementById("companion-fullscreen").onclick = () => setCompanionFullscreen(!fullscreen);
    document.getElementById("companion-memory-add")?.addEventListener("click", () => promptAddMemory());
    document.getElementById("companion-new-chat").onclick = () => createCompanionConversation();
    document.getElementById("companion-rename-chat").onclick = () => renameCompanionConversation();
    document.getElementById("companion-delete-chat").onclick = () => deleteCompanionConversation();
    document.getElementById("companion-conversation-select").onchange = (event) => {
      activateCompanionConversation(event.target.value);
    };
    document.getElementById("companion-oracle-btn").onclick = () => revealOracle();
    document.getElementById("companion-send").onclick = () => handleSend();
    document.getElementById("companion-stop").onclick = () => stopCompanionTurn();
    document.getElementById("companion-instant").onclick = () => handleInstantAnswer();
    const input = document.getElementById("companion-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        if (fullscreen) setCompanionFullscreen(false);
        else setPanelOpen(false);
      }
    });

    const mic = document.getElementById("companion-mic");
    if (mic && voiceSupported) mic.onclick = () => {
      if (listening) stopListening(true);
      else startListening();
    };
    document.getElementById("companion-mic-stop")?.addEventListener("click", () => stopListening(true));

    updatePageLabel();
  }

  function updatePageLabel() {
    const el = document.getElementById("companion-page-label");
    if (el) {
      const tab = typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "Home";
      el.textContent = tab;
    }
    if (!messages.length) renderMessages();
  }

  function watchTabChanges() {
    const nav = document.getElementById("nav");
    if (nav) {
      new MutationObserver(updatePageLabel).observe(nav, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
      });
    }
    const origGo = window.goToTab;
    if (typeof origGo === "function" && !origGo._companionWrapped) {
      window.goToTab = async function (...args) {
        const r = await origGo.apply(this, args);
        updatePageLabel();
        return r;
      };
      window.goToTab._companionWrapped = true;
    }
  }

  function initCompanion() {
    ensureStyles();
    buildDom();
    watchTabChanges();
    startPolling();
    refreshOracleUi();
    hydrateMemories();
    hydrateCompanionConversations();
    if (loadOpenState()) setPanelOpen(true);
    window.companionAddMemory = companionAddMemory;
    window.companionAddCoreMemory = (title, body) => companionAddMemory(title, body, { core: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCompanion);
  } else {
    initCompanion();
  }
})();
