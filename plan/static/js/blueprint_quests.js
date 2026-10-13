// Blueprint quest shell: registry, constrained palette, grading, and local part specs.

let BLUEPRINT_QUESTS = [];
let BLUEPRINT_QUEST_ACTIVE = null;
let BLUEPRINT_QUEST_PANEL_OPEN = false;
let BLUEPRINT_QUEST_RESULT = null;
let BLUEPRINT_QUEST_PART = null;

async function blueprintQuestLoadRegistry() {
  if (!BLUEPRINT_QUESTS.length) {
    BLUEPRINT_QUESTS = await api("/api/workflows/quests");
  }
  const questId = CURRENT_WF?.meta?.questId;
  BLUEPRINT_QUEST_ACTIVE = questId
    ? BLUEPRINT_QUESTS.find(q => q.id === questId) || null
    : null;
  return BLUEPRINT_QUESTS;
}

function blueprintQuestActive() {
  const questId = CURRENT_WF?.meta?.questId;
  if (!questId) return null;
  if (BLUEPRINT_QUEST_ACTIVE?.id === questId) return BLUEPRINT_QUEST_ACTIVE;
  return BLUEPRINT_QUESTS.find(q => q.id === questId) || null;
}

function blueprintQuestIsActive() {
  return !!blueprintQuestActive();
}

function blueprintQuestAllowsNode(type) {
  const quest = blueprintQuestActive();
  return !quest || quest.allowedNodeTypes.includes(type);
}

function blueprintQuestFilterEntries(entries) {
  const quest = blueprintQuestActive();
  if (!quest) return entries;
  return entries.filter(entry => quest.allowedNodeTypes.includes(entry.type));
}

function blueprintQuestPaletteEntries() {
  const quest = blueprintQuestActive();
  if (!quest || typeof WF_NODE_TYPES === "undefined") return null;
  return quest.allowedNodeTypes
    .filter(type => type !== "start" && WF_NODE_TYPES[type])
    .map(type => ({ type, label: WF_NODE_TYPES[type].label || type }));
}

function blueprintQuestResultHtml(result) {
  if (!result) return "";
  const checks = (result.checks || []).map(check => `
    <li class="bpq-check ${check.passed ? "bpq-pass" : "bpq-fail"}">
      <span aria-hidden="true">${check.passed ? "✓" : "×"}</span>
      <div><strong>${escapeHtml(check.name)}</strong><small>${escapeHtml(check.detail)}</small></div>
    </li>`).join("");
  const fixtures = (result.fixtures || []).map(item => {
    const inputs = Object.entries(item.inputs || {}).map(([key, value]) => `${key}=${value}`).join(", ");
    return `<tr class="${item.passed ? "bpq-pass" : "bpq-fail"}">
      <td>${escapeHtml(inputs)}</td><td>${escapeHtml(String(item.expected))}</td>
      <td>${item.actual == null ? "—" : escapeHtml(String(item.actual))}</td>
      <td>${item.passed ? "Pass" : "Fail"}</td>
    </tr>`;
  }).join("");
  return `<section class="bpq-results" id="blueprint-quest-results" aria-live="polite">
    <h4>${result.passed ? "Quest complete" : "Keep wiring"}</h4>
    <ul>${checks}</ul>
    ${fixtures ? `<details><summary>Fixture evidence</summary>
      <table><thead><tr><th>Inputs</th><th>Expected</th><th>Actual</th><th></th></tr></thead>
      <tbody>${fixtures}</tbody></table></details>` : ""}
  </section>`;
}

function blueprintQuestSpecHtml(quest) {
  if (!quest || !BLUEPRINT_QUEST_PART) return "";
  const part = quest.parts?.[BLUEPRINT_QUEST_PART];
  if (!part) return "";
  return `<aside class="bpq-spec" id="blueprint-part-spec" aria-live="polite">
    <div class="bpq-kicker">Local datasheet</div>
    <h4>${escapeHtml(part.name)}</h4>
    <p>${escapeHtml(part.summary)}</p>
    <ul>${(part.specs || []).map(spec => `<li>${escapeHtml(spec)}</li>`).join("")}</ul>
    <small>${escapeHtml(part.source || "Curated local specification")}</small>
  </aside>`;
}

function blueprintQuestPanelHtml() {
  if (!BLUEPRINT_QUEST_PANEL_OPEN) return "";
  const quest = blueprintQuestActive();
  const styles = `<style>
    .bpq-panel { margin-bottom:8px; padding:12px; border:1px solid color-mix(in srgb,var(--accent) 55%,var(--border)); background:color-mix(in srgb,var(--accent) 5%,var(--bg-card)); }
    .bpq-head { display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap; }
    .bpq-head>div:first-child { flex:1;min-width:260px; }
    .bpq-kicker { color:var(--accent);font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase; }
    .bpq-panel h3,.bpq-panel h4 { margin:2px 0 6px; }
    .bpq-panel p { margin:4px 0 8px;color:var(--ink-secondary);font-size:12px;line-height:1.45; }
    .bpq-actions { display:flex;gap:6px;flex-wrap:wrap; }
    .bpq-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:10px; }
    .bpq-card { padding:10px;border:1px solid var(--border);border-radius:7px;background:var(--bg-shell); }
    .bpq-card p { min-height:34px; }
    .bpq-layout { display:grid;grid-template-columns:minmax(240px,1fr) minmax(220px,.8fr);gap:12px;margin-top:10px; }
    .bpq-hints { margin:5px 0;padding-left:18px;font-size:11px;color:var(--ink-secondary); }
    .bpq-known { display:flex;gap:5px;flex-wrap:wrap;margin-top:7px; }
    .bpq-known button { font-size:10px;padding:3px 7px; }
    .bpq-spec { padding:10px;border-left:3px solid var(--accent);background:var(--bg-shell);border-radius:4px; }
    .bpq-spec ul { margin:6px 0;padding-left:18px;font-size:11px;line-height:1.5; }
    .bpq-results { padding:9px;border:1px solid var(--border);border-radius:6px;background:var(--bg-shell); }
    .bpq-results ul { list-style:none;margin:5px 0;padding:0; }
    .bpq-check { display:flex;gap:7px;padding:4px 0;font-size:11px; }
    .bpq-check>span { font-weight:800;width:14px; }
    .bpq-check small { display:block;color:var(--ink-muted);margin-top:1px; }
    .bpq-pass>span,.bpq-pass td:last-child { color:var(--status-good); }
    .bpq-fail>span,.bpq-fail td:last-child { color:var(--status-critical); }
    .bpq-results table { width:100%;font-size:10px;border-collapse:collapse;margin-top:6px; }
    .bpq-results th,.bpq-results td { padding:3px 5px;text-align:left;border-bottom:1px solid var(--border); }
    @media(max-width:760px){.bpq-layout{grid-template-columns:1fr;}}
  </style>`;
  if (!quest) {
    const cards = BLUEPRINT_QUESTS.length
      ? BLUEPRINT_QUESTS.map(item => `<article class="bpq-card" data-blueprint-quest="${escapeHtml(item.id)}">
          <div class="bpq-kicker">${item.kind === "circuit" ? "Circuit lab" : "Blueprint build"}</div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.description)}</p>
          <button type="button" class="primary bpq-start" data-quest-id="${escapeHtml(item.id)}">Start quest</button>
        </article>`).join("")
      : `<div class="stub">Loading quests…</div>`;
    return `${styles}<section class="card bpq-panel" id="blueprint-quest-panel">
      <div class="bpq-head"><div><div class="bpq-kicker">Blueprint quests</div>
      <h3>Build against a real specification</h3>
      <p>Choose a constrained lab. Grading runs deterministic fixtures and reports each failed wire or behavior.</p></div>
      <button type="button" class="secondary" id="bpq-close">Close</button></div>
      <div class="bpq-grid">${cards}</div>
    </section>`;
  }
  const knownParts = Object.entries(quest.parts || {}).map(([partId, part]) =>
    `<button type="button" class="secondary bpq-part" data-part-id="${escapeHtml(partId)}">${escapeHtml(part.name)}</button>`
  ).join("");
  return `${styles}<section class="card bpq-panel" id="blueprint-quest-panel" data-active-quest="${escapeHtml(quest.id)}">
    <div class="bpq-head">
      <div><div class="bpq-kicker">${quest.kind === "circuit" ? "Circuit quest" : "Blueprint quest"}</div>
        <h3>${escapeHtml(quest.title)}</h3><p>${escapeHtml(quest.description)}</p>
        <div class="bpq-actions">
          <button type="button" class="primary" id="bpq-grade">Grade quest</button>
          <button type="button" class="secondary" id="bpq-restart">Reload starter</button>
          <button type="button" class="secondary" id="bpq-leave">Leave constraints</button>
          <button type="button" class="secondary" id="bpq-close">Hide panel</button>
        </div>
        <ul class="bpq-hints">${(quest.hints || []).map(hint => `<li>${escapeHtml(hint)}</li>`).join("")}</ul>
        ${knownParts ? `<div class="bpq-kicker">Known parts — click for specs</div><div class="bpq-known">${knownParts}</div>` : ""}
      </div>
      <div><strong style="font-size:11px;">Allowed palette</strong>
        <p>${quest.allowedNodeTypes.filter(type => type !== "start").map(type => escapeHtml(WF_NODE_TYPES[type]?.label || type)).join(" · ")}</p>
      </div>
    </div>
    <div class="bpq-layout">
      ${blueprintQuestResultHtml(BLUEPRINT_QUEST_RESULT) || `<div class="stub">Wire the graph, then Grade quest. Every fixture must pass.</div>`}
      ${blueprintQuestSpecHtml(quest) || `<aside class="bpq-spec"><div class="bpq-kicker">Part specs</div><p>${knownParts ? "Click a circuit part to inspect its curated local datasheet." : "This quest uses standard Blueprint nodes."}</p></aside>`}
    </div>
  </section>`;
}

async function blueprintQuestOpenPanel() {
  BLUEPRINT_QUEST_PANEL_OPEN = true;
  try {
    await blueprintQuestLoadRegistry();
  } catch (error) {
    showToast(`Could not load quests: ${error.message || error}`);
  }
  await renderAutomationStudioView();
}

async function blueprintQuestStart(questId) {
  await blueprintQuestLoadRegistry();
  const quest = BLUEPRINT_QUESTS.find(item => item.id === questId);
  if (!quest) return;
  const graph = JSON.parse(JSON.stringify(quest.starterGraph));
  BLUEPRINT_QUEST_ACTIVE = quest;
  BLUEPRINT_QUEST_RESULT = null;
  BLUEPRINT_QUEST_PART = null;
  BLUEPRINT_QUEST_PANEL_OPEN = true;
  CURRENT_WF = { id: null, name: `Quest: ${quest.title}`, ...graph };
  CURRENT_WF.meta = { ...(CURRENT_WF.meta || {}), questId: quest.id };
  STUDIO_TAB = "graph";
  WF_GRAPH_WIRED = false;
  await renderAutomationStudioView();
  showToast(`${quest.title} loaded`);
}

async function blueprintQuestGrade() {
  const quest = blueprintQuestActive();
  if (!quest) return;
  try {
    BLUEPRINT_QUEST_RESULT = await api(`/api/workflows/quests/${encodeURIComponent(quest.id)}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph: wfGraphPayload() }),
    });
  } catch (error) {
    BLUEPRINT_QUEST_RESULT = {
      passed: false,
      checks: [{ name: "Grader", passed: false, detail: error.message || String(error) }],
      fixtures: [],
    };
  }
  if (BLUEPRINT_QUEST_RESULT?.passed
      && window.WaypointGame
      && typeof window.WaypointGame.questProgress === "function") {
    window.WaypointGame.questProgress("blueprint1");
  }
  BLUEPRINT_QUEST_PANEL_OPEN = true;
  await renderAutomationStudioView();
}

async function blueprintQuestLeave() {
  if (CURRENT_WF?.meta) delete CURRENT_WF.meta.questId;
  BLUEPRINT_QUEST_ACTIVE = null;
  BLUEPRINT_QUEST_RESULT = null;
  BLUEPRINT_QUEST_PART = null;
  BLUEPRINT_QUEST_PANEL_OPEN = false;
  await renderAutomationStudioView();
  showToast("Quest constraints removed");
}

async function blueprintQuestShowPart(partId) {
  BLUEPRINT_QUEST_PART = partId;
  BLUEPRINT_QUEST_PANEL_OPEN = true;
  await renderAutomationStudioView();
}

function blueprintQuestWireToolbar() {
  document.getElementById("studio-tb-quests")?.addEventListener("click", () => blueprintQuestOpenPanel());
  document.getElementById("studio-tb-grade-quest")?.addEventListener("click", () => blueprintQuestGrade());
}

function blueprintQuestWireStudio() {
  document.getElementById("bpq-close")?.addEventListener("click", async () => {
    BLUEPRINT_QUEST_PANEL_OPEN = false;
    await renderAutomationStudioView();
  });
  document.querySelectorAll(".bpq-start").forEach(button => {
    button.addEventListener("click", () => blueprintQuestStart(button.dataset.questId));
  });
  document.getElementById("bpq-grade")?.addEventListener("click", () => blueprintQuestGrade());
  document.getElementById("bpq-restart")?.addEventListener("click", () => blueprintQuestStart(blueprintQuestActive()?.id));
  document.getElementById("bpq-leave")?.addEventListener("click", () => blueprintQuestLeave());
  document.querySelectorAll(".bpq-part").forEach(button => {
    button.addEventListener("click", () => blueprintQuestShowPart(button.dataset.partId));
  });
  const quest = blueprintQuestActive();
  if (quest?.kind === "circuit") {
    document.querySelectorAll(".node-card").forEach(card => {
      const node = (CURRENT_WF.nodes || []).find(item => item.id === card.dataset.nodeId);
      const partId = node?.meta?.partId;
      if (!partId) return;
      card.querySelector(".node-header")?.addEventListener("click", event => {
        if (event.target.closest("button,input,textarea,select")) return;
        blueprintQuestShowPart(partId);
      });
      card.classList.add("bpq-part-node");
      card.title = "Click the part header for specs";
    });
  }
}
