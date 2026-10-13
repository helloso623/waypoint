// --- Ideas: 3D semantic map ---------------------------------------------------------

let LAST_IDEAS = [];
let LAST_NOTE_ITEMS = [];
let OPEN_IDEA_EVAL = new Set();
let OPEN_IDEA_SIMILAR = new Set();

let IDEA_SELECTED_ID = null;

let IDEA_SEARCH = "";
let IDEA_SORT = "manual";
let IDEAS_VIEW = localStorage.ideasView || "list";
if (IDEAS_VIEW !== "list" && IDEAS_VIEW !== "map") IDEAS_VIEW = "list";

function ideaBodyPreview(body, maxLen = 200) {
  const text = (body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function ideasViewSwitcherHtml() {
  return `
    <div class="card" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <span class="stub" style="margin:0;">View:</span>
      <div class="seg-pill" role="group" aria-label="Ideas view">
        <button type="button" class="seg-pill-btn${IDEAS_VIEW === "list" ? " active" : ""}" data-ideas-view="list">List</button>
        <button type="button" class="seg-pill-btn${IDEAS_VIEW === "map" ? " active" : ""}" data-ideas-view="map">3D map</button>
      </div>
    </div>`;
}

function ideasAddRowHtml() {
  return `
    <div class="card">
      <div class="ideas-add-row" style="display:flex; gap:8px;">
        <input type="text" id="new-idea-title" placeholder="Idea title" style="flex:1;">
        <input type="text" id="new-idea-body" placeholder="Details (optional)" style="flex:2;">
        <button class="primary" id="add-idea">Add idea</button>
      </div>
    </div>`;
}

function ideasMapDetailHtml(idea) {
  if (!idea) {
    return `<div id="ideas-map-detail" style="display:none;"></div>`;
  }
  return `
    <div class="card" id="ideas-map-detail">
      <strong>${escapeHtml(idea.title || "Untitled")}</strong>
      <div class="stub" style="margin-top:4px;">${escapeHtml(ideaBodyPreview(idea.body)) || "No details yet."}</div>
      <div style="margin-top:8px;">
        <button type="button" class="primary" id="ideas-open-in-list" data-idea="${idea.id}">Open in list</button>
      </div>
    </div>`;
}

function updateIdeasMapDetail(idea) {
  const slot = document.getElementById("ideas-map-detail");
  if (!slot) return;
  if (!idea) {
    slot.style.display = "none";
    slot.innerHTML = "";
    return;
  }
  slot.outerHTML = ideasMapDetailHtml(idea);
  const openBtn = document.getElementById("ideas-open-in-list");
  if (openBtn) wireIdeasOpenInList(openBtn);
}

function wireIdeasOpenInList(btn) {
  btn.onclick = () => {
    const id = Number(btn.dataset.idea);
    if (!id) return;
    IDEA_SELECTED_ID = id;
    IDEAS_VIEW = "list";
    localStorage.ideasView = "list";
    render();
  };
}

async function renderIdeas() {
  const [ideas, projects] = await Promise.all([api("/api/ideas"), api("/api/projects")]);
  const linkedProjectByIdea = {};
  projects.forEach(p => { if (p.source_idea_id) linkedProjectByIdea[p.source_idea_id] = p; });

  const sorted = ideas.slice().sort((a, b) => {
    if (IDEA_SORT === "manual") return 0;
    if (IDEA_SORT === "az") return (a.title || "").localeCompare(b.title || "");
    if (IDEA_SORT === "oldest") return a.id - b.id;
    return b.id - a.id; // newest
  });
  LAST_IDEAS = sorted;

  const cards = sorted.map(idea => {
    const linkedProject = linkedProjectByIdea[idea.id];
    const projectOptions = `<option value="">${linkedProject ? "Unlink project" : "Link existing project..."}</option>` +
      projects.map(p => `<option value="${p.id}" ${linkedProject && p.id === linkedProject.id ? "selected" : ""}>${escapeHtml(p.name || "")}</option>`).join("");
    const searchable = `${idea.title || ""} ${(idea.body || "").replace(/<[^>]+>/g, " ")}`.toLowerCase();
    return `
    <div class="card idea-card ${idea.id === IDEA_SELECTED_ID ? "idea-card-selected" : ""}" id="idea-card-${idea.id}" data-idea="${idea.id}" data-search="${escapeHtml(searchable).replace(/"/g, "&quot;")}">
      <div style="display:flex; justify-content:space-between; align-items:start; gap:8px;">
        <span class="drag-handle" draggable="true" title="Drag to reorder ideas">&#10247;</span>
        <input type="text" class="idea-title-edit" data-idea="${idea.id}" value="${escapeHtml(idea.title || "").replace(/"/g, "&quot;")}" style="font-weight:600; flex:1;">
        <span>
          ${idea.source === "ai" ? '<span class="pill">ai</span>' : ""}
          ${linkedProject ? `<span class="pill status-good" title="Linked project">&rarr; ${escapeHtml(linkedProject.name)}</span>` : ""}
          <button class="secondary idea-locate" data-idea="${idea.id}" title="Show this idea in the 3D map">Locate in map</button>
          <button class="secondary idea-ask-agent" data-idea="${idea.id}" title="Ask the Agent about this">&#129302;</button>
          <button class="secondary idea-delete" data-idea="${idea.id}">Delete</button>
        </span>
      </div>
      <div data-rich-for="idea-body-${idea.id}" style="margin-top:6px;">${RICH_TOOLBAR_HTML}</div>
      <div id="idea-body-${idea.id}" class="rich-editable idea-body-edit" data-idea="${idea.id}" contenteditable="true">${idea.body || ""}</div>
      <div style="margin-top:6px;">
        <button class="primary idea-save" data-idea="${idea.id}">Save</button>
        ${fieldHistoryWidgetHtml("idea", idea.id, "body")}
      </div>
      <div style="margin-top:8px; border-top:1px solid var(--gridline); padding-top:8px;">
        <button class="secondary idea-eval-toggle" data-idea="${idea.id}">${OPEN_IDEA_EVAL.has(idea.id) ? "Hide" : "Evaluate"}</button>
        <button class="secondary idea-promote" data-idea="${idea.id}">Create new project from idea</button>
        <select class="idea-link-project" data-idea="${idea.id}" style="margin-left:4px;">${projectOptions}</select>
        <div id="idea-eval-${idea.id}" style="margin-top:8px; ${OPEN_IDEA_EVAL.has(idea.id) ? "" : "display:none;"}"></div>
      </div>
      <div style="margin-top:8px; border-top:1px solid var(--gridline); padding-top:8px;">
        <button class="secondary idea-similar-toggle" data-idea="${idea.id}">${OPEN_IDEA_SIMILAR.has(idea.id) ? "Hide" : "Show"} similar ideas online</button>
        <div id="idea-similar-${idea.id}" style="margin-top:8px; ${OPEN_IDEA_SIMILAR.has(idea.id) ? "" : "display:none;"}"></div>
      </div>
    </div>`;
  }).join("");

  const listViewHtml = `
    <div class="card" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <input type="text" id="idea-search" placeholder="Search ideas..." value="${escapeHtml(IDEA_SEARCH).replace(/"/g, "&quot;")}" style="flex:1; min-width:160px;">
      <select id="idea-sort">
        <option value="manual" ${IDEA_SORT === "manual" ? "selected" : ""}>Manual order</option>
        <option value="newest" ${IDEA_SORT === "newest" ? "selected" : ""}>Newest first</option>
        <option value="oldest" ${IDEA_SORT === "oldest" ? "selected" : ""}>Oldest first</option>
        <option value="az" ${IDEA_SORT === "az" ? "selected" : ""}>A-Z</option>
      </select>
    </div>
    <div id="idea-cards">${cards || '<p class="stub">No ideas yet.</p>'}</div>
    <p class="stub" id="idea-no-match" style="display:none;">No ideas match "<span id="idea-no-match-text"></span>".</p>`;

  const selectedIdea = IDEA_SELECTED_ID ? LAST_IDEAS.find(i => i.id === IDEA_SELECTED_ID) : null;
  const mapViewHtml = `
    <div class="card">
      <div style="display:flex; justify-content:flex-end; margin-bottom:4px;">
        <button class="secondary" id="ideas-reset-view">Reset view</button>
      </div>
      <div id="ideas-plot" style="height:520px;"></div>
      ${LAST_IDEAS.length < 2 ? '<p class="stub">Add at least 2 ideas to see the 3D map -- position is based on text similarity (TF-IDF), so it needs something to compare against.</p>' : ""}
    </div>
    ${ideasMapDetailHtml(selectedIdea)}`;

  const dumpSwitcher = typeof renderNtsListSwitcher === "function"
    ? renderNtsListSwitcher("Ideas")
    : "";
  const switcherStyles = typeof notesScopedStyles === "function" ? notesScopedStyles() : "";
  const connect = typeof renderNtsCaptureConnect === "function"
    ? renderNtsCaptureConnect("Ideas")
    : "";
  return `
    ${switcherStyles}
    ${dumpSwitcher}
    ${ideasViewSwitcherHtml()}
    ${ideasAddRowHtml()}
    ${IDEAS_VIEW === "list" ? listViewHtml : mapViewHtml}
    ${connect}`;
}

const IDEAS_DEFAULT_CAMERA = { eye: { x: 1.5, y: 1.5, z: 1.5 } };

function wireIdeasViewSwitcher() {
  document.querySelectorAll("[data-ideas-view]").forEach(btn => {
    btn.onclick = () => {
      const view = btn.dataset.ideasView;
      if (view !== "list" && view !== "map") return;
      if (view === IDEAS_VIEW) return;
      IDEAS_VIEW = view;
      localStorage.ideasView = view;
      render();
    };
  });
}

function wireIdeasAddRow() {
  const addBtn = document.getElementById("add-idea");
  if (!addBtn) return;
  addBtn.onclick = async () => {
    const titleEl = document.getElementById("new-idea-title");
    const bodyEl = document.getElementById("new-idea-body");
    if (!titleEl) return;
    const title = titleEl.value.trim();
    const body = bodyEl ? bodyEl.value.trim() : "";
    if (!title) return;
    await api("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    render();
  };
}

function wireIdeasListControls() {
  const searchEl = document.getElementById("idea-search");
  if (!searchEl) return;

  const applyIdeaSearch = () => {
    const q = searchEl.value.trim().toLowerCase();
    IDEA_SEARCH = q;
    let anyVisible = false;
    document.querySelectorAll(".idea-card").forEach(card => {
      const match = !q || (card.dataset.search || "").includes(q);
      card.style.display = match ? "" : "none";
      if (match) anyVisible = true;
    });
    const noMatch = document.getElementById("idea-no-match");
    if (noMatch) {
      noMatch.style.display = (q && !anyVisible) ? "" : "none";
      const noMatchText = document.getElementById("idea-no-match-text");
      if (noMatchText) noMatchText.textContent = q;
    }
  };
  searchEl.oninput = applyIdeaSearch;
  if (IDEA_SEARCH) applyIdeaSearch();

  const sortEl = document.getElementById("idea-sort");
  if (sortEl) {
    sortEl.onchange = (e) => {
      IDEA_SORT = e.target.value;
      render();
    };
  }
}

function wireIdeasListCards() {
  LAST_IDEAS.forEach(idea => {
    wireRichToolbar(`idea-body-${idea.id}`);
    wireFieldHistory("idea", idea.id, "body", `idea-body-${idea.id}`);
  });

  document.querySelectorAll(".idea-save").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.idea;
      const title = document.querySelector(`.idea-title-edit[data-idea="${id}"]`)?.value.trim();
      const body = document.getElementById(`idea-body-${id}`)?.innerHTML.trim();
      await api(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      render();
    };
  });

  document.querySelectorAll(".idea-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Delete this idea?")) return;
      await api(`/api/ideas/${btn.dataset.idea}`, { method: "DELETE" });
      render();
    };
  });

  document.querySelectorAll(".idea-promote").forEach(btn => {
    btn.onclick = async () => {
      await api(`/api/ideas/${btn.dataset.idea}/promote-to-project`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      goToTab("Projects");
    };
  });

  document.querySelectorAll(".idea-link-project").forEach(sel => {
    sel.onchange = async () => {
      await api(`/api/ideas/${sel.dataset.idea}/link-project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: sel.value || null }),
      });
      render();
    };
  });

  document.querySelectorAll(".idea-ask-agent").forEach(btn => {
    btn.onclick = () => {
      const idea = LAST_IDEAS.find(i => i.id === Number(btn.dataset.idea));
      if (!idea) return;
      const bodyText = (idea.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      askAgentAbout(`About the idea "${idea.title}"${bodyText ? ` (${bodyText})` : ""}: `);
    };
  });

  document.querySelectorAll(".idea-eval-toggle").forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.idea);
      const box = document.getElementById(`idea-eval-${id}`);
      if (!box) return;
      if (OPEN_IDEA_EVAL.has(id)) {
        OPEN_IDEA_EVAL.delete(id);
        box.style.display = "none";
        btn.textContent = "Evaluate";
      } else {
        OPEN_IDEA_EVAL.add(id);
        box.style.display = "";
        btn.textContent = "Hide";
        await loadIdeaEval(id);
      }
    };
  });

  document.querySelectorAll(".idea-similar-toggle").forEach(btn => {
    btn.onclick = async () => {
      const id = Number(btn.dataset.idea);
      const box = document.getElementById(`idea-similar-${id}`);
      if (!box) return;
      if (OPEN_IDEA_SIMILAR.has(id)) {
        OPEN_IDEA_SIMILAR.delete(id);
        box.style.display = "none";
        btn.textContent = "Show similar ideas online";
      } else {
        OPEN_IDEA_SIMILAR.add(id);
        box.style.display = "";
        btn.textContent = "Hide";
        await loadIdeaSimilar(id);
      }
    };
  });

  document.querySelectorAll(".idea-locate").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.idea);
      IDEA_SELECTED_ID = id;
      IDEAS_VIEW = "map";
      localStorage.ideasView = "map";
      render();
    };
  });

  wireIdeaDragReorder();

  if (IDEA_SELECTED_ID) {
    const card = document.getElementById(`idea-card-${IDEA_SELECTED_ID}`);
    if (card) {
      card.classList.add("idea-card-selected");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function wireIdeasMapPlot() {
  const resetBtn = document.getElementById("ideas-reset-view");
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (window.Plotly) Plotly.relayout("ideas-plot", { "scene.camera": IDEAS_DEFAULT_CAMERA });
    };
  }

  const openBtn = document.getElementById("ideas-open-in-list");
  if (openBtn) wireIdeasOpenInList(openBtn);

  if (LAST_IDEAS.length < 2 || !window.Plotly) return;
  const plotHost = document.getElementById("ideas-plot");
  if (!plotHost) return;

  Plotly.newPlot("ideas-plot", [{
    x: LAST_IDEAS.map(i => i.x || 0),
    y: LAST_IDEAS.map(i => i.y || 0),
    z: LAST_IDEAS.map(i => i.z || 0),
    text: LAST_IDEAS.map(i => i.title),
    mode: "markers+text",
    type: "scatter3d",
    marker: { size: ideaMarkerSizes(), color: ideaMarkerColors() },
    textposition: "top center",
    textfont: { color: plotlyThemeVars().inkPrimary, size: 10 },
  }], {
    paper_bgcolor: plotlyThemeVars().card,
    plot_bgcolor: plotlyThemeVars().card,
    font: { color: plotlyThemeVars().inkPrimary },
    scene: {
      xaxis: { visible: false }, yaxis: { visible: false }, zaxis: { visible: false },
      bgcolor: plotlyThemeVars().card, camera: IDEAS_DEFAULT_CAMERA,
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
  }, { displayModeBar: true, modeBarButtonsToRemove: ["toImage", "resetCameraLastSave3d"], displaylogo: false });

  plotHost.on("plotly_click", ev => {
    const idea = LAST_IDEAS[ev.points[0].pointNumber];
    if (!idea) return;
    IDEA_SELECTED_ID = idea.id;
    Plotly.restyle("ideas-plot", { "marker.size": [ideaMarkerSizes()], "marker.color": [ideaMarkerColors()] });
    updateIdeasMapDetail(idea);
  });
}

function wireIdeas() {
  if (typeof wireNtsListSwitcher === "function") wireNtsListSwitcher();
  wireIdeasViewSwitcher();
  wireIdeasAddRow();
  if (IDEAS_VIEW === "list") {
    wireIdeasListControls();
    wireIdeasListCards();
  } else {
    wireIdeasMapPlot();
  }
}

function wireIdeaDragReorder() {
  let draggedId = null;
  document.querySelectorAll(".idea-card").forEach(row => {
    const handle = row.querySelector(".drag-handle");
    if (!handle) return;
    handle.addEventListener("dragstart", e => {
      draggedId = row.dataset.idea;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId);
    });
    handle.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggedId = null;
    });
    row.addEventListener("dragover", e => {
      if (draggedId === null || row.dataset.idea === draggedId) return;
      const dragging = document.querySelector(".idea-card.dragging");
      if (!dragging) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.parentElement.insertBefore(dragging, before ? row : row.nextSibling);
    });
    row.addEventListener("drop", async e => {
      e.preventDefault();
      if (draggedId === null) return;
      IDEA_SORT = "manual";
      const ids = Array.from(document.querySelectorAll("#idea-cards .idea-card")).map(r => Number(r.dataset.idea));
      try {
        await api("/api/ideas/reorder", {
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

function ideaMarkerSizes() {
  return LAST_IDEAS.map(i => i.id === IDEA_SELECTED_ID ? 12 : 6);
}

function ideaMarkerColors() {
  return LAST_IDEAS.map(i => i.id === IDEA_SELECTED_ID ? "#ffb74d" : "#64b5f6");
}

// --- Ideas: AI evaluation + investor role-play ---------------------------------------------------------

let IDEA_EVAL_DATA = {}; // id -> { score, strengths, weaknesses, questions, answers: {qIdx: [{reply, investorReply}]} }

async function loadIdeaEval(id) {
  const box = document.getElementById(`idea-eval-${id}`);
  if (!box) return;
  box.innerHTML = '<span class="spinner"></span><span class="stub" style="font-size:12px;">Evaluating...</span>';
  try {
    const result = await api(`/api/ideas/${id}/evaluate`, { method: "POST" });
    IDEA_EVAL_DATA[id] = { ...result, answers: {} };
  } catch (err) {
    box.innerHTML = '<p class="stub">Could not evaluate this idea.</p>';
    return;
  }
  renderIdeaEvalBox(id);
}

function renderIdeaEvalBox(id) {
  const box = document.getElementById(`idea-eval-${id}`);
  if (!box) return;
  const data = IDEA_EVAL_DATA[id];
  if (!data) return;
  const list = (items) => items.length ? `<ul style="margin:4px 0 0 18px; padding:0;">${items.map(i => `<li>${i}</li>`).join("")}</ul>` : '<p class="stub" style="margin:2px 0;">None noted.</p>';
  const questions = (data.questions || []).map((q, qi) => {
    const turns = data.answers[qi] || [];
    const turnsHtml = turns.map(t => `
      <div class="agent-msg user" style="margin-top:6px;"><div class="agent-bubble">${t.reply}</div></div>
      <div class="agent-msg assistant" style="margin-top:6px;"><div class="agent-bubble">${t.investorReply}</div></div>
    `).join("");
    return `
      <div class="card" style="margin-top:8px;">
        <strong style="font-size:13px;">${q}</strong>
        ${turnsHtml}
        <div style="display:flex; gap:6px; margin-top:6px;">
          <input type="text" class="idea-eval-reply" data-idea="${id}" data-qidx="${qi}" placeholder="Your answer..." style="flex:1;">
          <button class="secondary idea-eval-ask" data-idea="${id}" data-qidx="${qi}">Reply</button>
        </div>
      </div>`;
  }).join("");
  box.innerHTML = `
    <div class="card">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="pill" style="font-size:16px; font-weight:600;">${data.score}/10</span>
        <strong style="font-size:13px;">Investor read</strong>
      </div>
      <div style="margin-top:8px;"><strong style="font-size:12px;">Strengths</strong>${list(data.strengths || [])}</div>
      <div style="margin-top:8px;"><strong style="font-size:12px;">Weaknesses</strong>${list(data.weaknesses || [])}</div>
      ${(data.questions || []).length ? '<p class="stub" style="margin-top:8px;">Questions an investor would ask -- reply to role-play the pitch:</p>' : ""}
    </div>
    ${questions}`;
  wireIdeaEvalBox(id);
}

function wireIdeaEvalBox(id) {
  document.querySelectorAll(`.idea-eval-ask[data-idea="${id}"]`).forEach(btn => {
    btn.onclick = async () => {
      const qi = Number(btn.dataset.qidx);
      const input = document.querySelector(`.idea-eval-reply[data-idea="${id}"][data-qidx="${qi}"]`);
      const reply = input.value.trim();
      if (!reply) return;
      const question = IDEA_EVAL_DATA[id].questions[qi];
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const { reply: investorReply } = await api(`/api/ideas/${id}/pitch-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, reply }),
        });
        const answers = IDEA_EVAL_DATA[id].answers;
        answers[qi] = (answers[qi] || []).concat([{ reply, investorReply }]);
        renderIdeaEvalBox(id);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Reply";
      }
    };
  });
}

// --- Ideas: similar ideas already out there (opt-in web search) ---------------------------------------------------------

async function loadIdeaSimilar(id) {
  const box = document.getElementById(`idea-similar-${id}`);
  if (!box) return;
  box.innerHTML = '<span class="spinner"></span><span class="stub" style="font-size:12px;">Loading...</span>';
  let results = [];
  try {
    results = await api(`/api/ideas/${id}/similar`);
  } catch (err) {
    results = [];
  }
  renderIdeaSimilarBox(id, results);
}

function renderIdeaSimilarBox(id, results) {
  const box = document.getElementById(`idea-similar-${id}`);
  if (!box) return;
  const cards = (results || []).map(r => `
    <div class="card" style="margin-top:6px;">
      <strong style="font-size:13px;">${r.title || "Untitled"}</strong>
      <div class="stub" style="margin-top:2px;">${r.description || ""}</div>
      ${r.similarity_note ? `<div class="stub" style="margin-top:2px;"><em>${r.similarity_note}</em></div>` : ""}
      ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.url}</a>` : ""}
    </div>`).join("");
  box.innerHTML = `
    <div class="card">
      <p class="stub">Web search for existing products/projects/discussions similar to this idea -- costs a real API call, only runs when you click.</p>
      <button class="primary idea-similar-scan" data-idea="${id}">Scan the web</button>
    </div>
    ${cards || (results && results.length === 0 ? '<p class="stub">No scan yet -- click "Scan the web" above.</p>' : "")}`;
  wireIdeaSimilarBox(id);
}

function wireIdeaSimilarBox(id) {
  const btn = document.querySelector(`.idea-similar-scan[data-idea="${id}"]`);
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Scanning...';
    try {
      const { results } = await api(`/api/ideas/${id}/scan-similar`, { method: "POST" });
      renderIdeaSimilarBox(id, results || []);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Scan the web";
    }
  };
}
