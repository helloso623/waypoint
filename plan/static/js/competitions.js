// --- Achievements (competitions / hackathons / grades) ---------------------------------

const COMPETITION_STATUS_LABELS = {
  found: "found by scan", interested: "want to attend", attended: "attended",
  won: "won something", grade_only: "grade only",
};

const ACH_COMPETITION_STATUSES = new Set(["found", "interested", "attended", "won"]);
const ACH_TEAM_SUFFIX_RE = /\|\s*team:(\d+)\s*$/i;
const ACH_TEAMMATE_LINK_RE = /^\[teammate:(\d+)\]\s*$/i;

let ACH_FILTER = "all";
let ACH_SEARCH = "";

function parseCompetitionTeammates(description) {
  const ids = [];
  const other = [];
  for (const line of String(description || "").split("\n")) {
    const m = line.trim().match(ACH_TEAMMATE_LINK_RE);
    if (m) ids.push(parseInt(m[1], 10));
    else if (line.trim()) other.push(line);
  }
  return { teammateIds: [...new Set(ids.filter(n => n > 0))], extra: other.join("\n") };
}

function buildCompetitionDescription(teammateIds, extra = "") {
  const lines = teammateIds.map(id => `[teammate:${id}]`);
  const tail = String(extra || "").trim();
  if (tail) lines.push(tail);
  return lines.join("\n");
}

function stripTeammateLinesFromDescription(description) {
  return parseCompetitionTeammates(description).extra;
}

function competitionStatusOptionsHtml(current) {
  return Object.entries(COMPETITION_STATUS_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function achScopedStyles() {
  return `
<style>
.ach-stats-strip { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
.ach-stat-card { flex:1; min-width:130px; padding:10px 12px; }
.ach-stat-label { font-size:11px; color:var(--ink-secondary); }
.ach-stat-value { font-size:18px; font-weight:600; margin-top:4px; font-variant-numeric:tabular-nums; }
.ach-stat-value.ach-stat-wins { color:#c9a227; }
.ach-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; }
.ach-search { flex:1; min-width:160px; }
.ach-filter-chips { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
.ach-chip {
  font-size:12px; padding:4px 10px; border-radius:999px; cursor:pointer;
  border:1px solid var(--gridline); background:var(--bg-card); color:var(--ink-secondary);
}
.ach-chip.active {
  border-color:var(--accent); color:var(--accent);
  background:color-mix(in srgb, var(--accent) 10%, var(--bg-card));
}
.ach-section-title {
  font-size:13px; font-weight:600; margin:16px 0 8px; display:flex; align-items:center; gap:8px;
}
.ach-section-count { font-weight:400; }
.ach-card { position:relative; overflow:hidden; }
.ach-card-won {
  border-color:color-mix(in srgb, #c9a227 55%, var(--gridline));
  background:color-mix(in srgb, #c9a227 4%, var(--bg-card));
}
.ach-card-won::after {
  content:""; position:absolute; inset:0; pointer-events:none; opacity:0.35;
  background:linear-gradient(105deg, transparent 40%, rgba(255,220,120,0.45) 50%, transparent 60%);
  background-size:200% 100%; animation:ach-shine 4s ease-in-out infinite;
}
@keyframes ach-shine {
  0%, 100% { background-position:200% center; }
  50% { background-position:-200% center; }
}
.ach-card-attended { border-left:3px solid var(--status-success, #3d9970); }
.ach-card-interested { border-left:3px solid var(--accent); }
.ach-card-grade { border-left:3px solid color-mix(in srgb, var(--ink-secondary) 40%, var(--gridline)); }
.ach-status-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
.ach-status-pill {
  font-size:11px; padding:2px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:4px;
  border:1px solid var(--gridline); color:var(--ink-secondary); background:var(--bg-shell);
}
.ach-status-pill.active { font-weight:600; }
.ach-status-pill-won.active {
  border-color:#c9a227; color:#a8860f;
  background:color-mix(in srgb, #c9a227 12%, var(--bg-card));
}
.ach-status-pill-attended.active {
  border-color:var(--status-success, #3d9970); color:var(--status-success, #3d9970);
  background:color-mix(in srgb, var(--status-success, #3d9970) 10%, var(--bg-card));
}
.ach-status-pill-interested.active {
  border-color:var(--accent); color:var(--accent);
  background:color-mix(in srgb, var(--accent) 10%, var(--bg-card));
}
.ach-card-head { display:flex; justify-content:space-between; align-items:start; gap:8px; flex-wrap:wrap; }
.ach-card-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:6px; font-size:11px; }
.ach-prize-row { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.ach-prize-hint { font-size:11px; color:var(--ink-secondary); font-style:italic; }
.ach-team-input { width:72px; }
.ach-empty-section { margin:0; }
</style>`;
}

function splitPersonalCredit(raw) {
  const s = String(raw || "").trim();
  const m = s.match(ACH_TEAM_SUFFIX_RE);
  if (m) {
    return { text: s.replace(ACH_TEAM_SUFFIX_RE, "").trim(), teamSize: parseInt(m[1], 10) };
  }
  return { text: s, teamSize: null };
}

function joinPersonalCredit(text, teamSize) {
  let t = String(text || "").trim().replace(ACH_TEAM_SUFFIX_RE, "").trim();
  const n = parseInt(teamSize, 10);
  if (n > 0) return t ? `${t} | team:${n}` : `| team:${n}`;
  return t;
}

function parsePrizeAmount(text) {
  if (!text) return null;
  const m = String(text).match(/(?:[$£€]|USD|EUR|GBP)\s*([\d,]+(?:\.\d+)?)|(?:^|\s)([\d,]+(?:\.\d+)?)(?:\s*(?:USD|EUR|GBP|dollars?))?/i);
  const raw = m ? (m[1] || m[2]) : null;
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function detectTeamSizeFromText(text) {
  if (!text) return null;
  let m = String(text).match(/(\d+)\s*people/i);
  if (m) return parseInt(m[1], 10);
  m = String(text).match(/team\s+of\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = String(text).match(/\/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function prizeCurrencySymbol(text) {
  const m = String(text || "").match(/[$£€]/);
  return m ? m[0] : "$";
}

function computePersonalShareHint(creditText, explicitTeamSize) {
  const amount = parsePrizeAmount(creditText);
  if (amount == null) return null;
  const team = explicitTeamSize || detectTeamSizeFromText(creditText);
  if (!team || team < 1) return null;
  const share = amount / team;
  const sym = prizeCurrencySymbol(creditText);
  const formatted = share.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: share % 1 ? 2 : 0 });
  return `≈ ${sym}${formatted} personal share`;
}

function achievementPrizeContribution(comp) {
  const { text, teamSize } = splitPersonalCredit(comp.personal_credit);
  const amount = parsePrizeAmount(text);
  if (amount == null) return null;
  const team = teamSize || detectTeamSizeFromText(text);
  if (team && team > 0) return amount / team;
  return amount;
}

function computeAchStats(results) {
  const total = results.length;
  const wins = results.filter(r => r.status === "won").length;
  const attended = results.filter(r => r.status === "attended" || r.status === "won").length;
  let prizeTotal = 0;
  let prizeParsed = 0;
  results.forEach(r => {
    const v = achievementPrizeContribution(r);
    if (v != null) { prizeTotal += v; prizeParsed += 1; }
  });
  return { total, wins, attended, prizeTotal, prizeParsed };
}

function achIsAttended(status) {
  return status === "attended" || status === "won";
}

function achMatchesFilter(comp, filter, search) {
  if (filter === "won" && comp.status !== "won") return false;
  if (filter === "attended" && !achIsAttended(comp.status)) return false;
  if (filter === "interested" && comp.status !== "interested") return false;
  if (filter === "grades" && comp.status !== "grade_only") return false;
  if (search) {
    const q = search.toLowerCase();
    const hay = [comp.title, comp.description, comp.type, comp.url, comp.personal_credit]
      .map(v => String(v || "")).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function achStatusPillsHtml(status) {
  const pills = [
    { key: "won", label: "Won", icon: "&#127942;", cls: "ach-status-pill-won" },
    { key: "attended", label: "Attended", icon: "&#10003;", cls: "ach-status-pill-attended" },
    { key: "interested", label: "Interested", icon: "&#128278;", cls: "ach-status-pill-interested" },
  ];
  return pills.map(p => `
    <span class="ach-status-pill ${p.cls} ${status === p.key ? "active" : ""}" title="${escapeHtml(COMPETITION_STATUS_LABELS[p.key] || p.key)}">
      ${p.icon} ${escapeHtml(p.label)}
    </span>`).join("");
}

function achTeammatePillsHtml(teammateIds, contacts) {
  if (!teammateIds.length) return "";
  const pills = teammateIds.map(id => {
    const c = contacts.find(x => x.id === id);
    const label = c ? (c.name || `Contact #${id}`) : `Contact #${id}`;
    return `<span class="pill ach-teammate-pill" data-contact-id="${id}">${escapeHtml(label)}</span>`;
  }).join("");
  return `<div class="ach-teammate-pills" style="display:flex; gap:4px; flex-wrap:wrap; margin-top:6px;">${pills}</div>`;
}

function achievementCardHtml(comp, projectOptionsHtml, contacts) {
  const status = comp.status || "found";
  const cardCls = [
    "card", "ach-card",
    status === "won" ? "ach-card-won" : "",
    status === "attended" ? "ach-card-attended" : "",
    status === "interested" ? "ach-card-interested" : "",
    status === "grade_only" ? "ach-card-grade" : "",
  ].filter(Boolean).join(" ");

  const { text: creditText, teamSize } = splitPersonalCredit(comp.personal_credit);
  const shareHint = computePersonalShareHint(creditText, teamSize);
  const dateStr = (comp.created_at || "").slice(0, 10);
  const url = (comp.url || "").trim();
  const { teammateIds } = parseCompetitionTeammates(comp.description);
  const descText = stripTeammateLinesFromDescription(comp.description);

  const teammateOptions = contacts
    .filter(c => !teammateIds.includes(c.id))
    .map(c => `<option value="${c.id}">${escapeHtml(c.name || `Contact #${c.id}`)}</option>`)
    .join("");
  const teammateSelect = teammateOptions
    ? `<select class="ach-teammate-add" data-id="${comp.id}" style="font-size:11px; max-width:180px;">
        <option value="">+ teammate…</option>${teammateOptions}
      </select>`
    : "";

  const prizeBlock = status === "won" ? `
      <div class="ach-prize-row">
        <input type="text" class="competition-credit" data-id="${comp.id}" value="${escapeHtml(creditText).replace(/"/g, "&quot;")}" placeholder="Prize (e.g. $500, team of 3)" style="flex:1; min-width:160px;">
        <label class="stub" style="margin:0; white-space:nowrap;">Team
          <input type="number" class="competition-team ach-team-input" data-id="${comp.id}" min="1" value="${teamSize != null ? teamSize : ""}" placeholder="—">
        </label>
        ${shareHint ? `<span class="ach-prize-hint">${escapeHtml(shareHint)}</span>` : ""}
      </div>` : "";

  return `
    <div class="${cardCls}" data-ach-id="${comp.id}" data-ach-status="${escapeHtml(status)}">
      <div class="ach-status-pills">${achStatusPillsHtml(status)}</div>
      <div class="ach-card-head">
        <input type="text" class="competition-title" data-id="${comp.id}" value="${escapeHtml(comp.title || "").replace(/"/g, "&quot;")}" style="font-weight:600; flex:1; min-width:140px;">
        <input type="text" class="competition-type" data-id="${comp.id}" value="${escapeHtml(comp.type || "").replace(/"/g, "&quot;")}" placeholder="type" style="width:140px;">
        <span style="display:flex; gap:6px; align-items:center;">
          <select class="competition-status" data-id="${comp.id}">${competitionStatusOptionsHtml(status)}</select>
          <button type="button" class="secondary icon-circle competition-delete" data-id="${comp.id}" title="Delete entry" aria-label="Delete entry">×</button>
        </span>
      </div>
      <textarea class="competition-desc" data-id="${comp.id}" placeholder="Notes" style="margin-top:6px; width:100%;">${escapeHtml(descText)}</textarea>
      ${achTeammatePillsHtml(teammateIds, contacts)}
      <div style="margin-top:6px;">${teammateSelect}</div>
      <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <input type="text" class="competition-url" data-id="${comp.id}" value="${escapeHtml(url).replace(/"/g, "&quot;")}" placeholder="URL" style="flex:1; min-width:160px;">
        <select class="competition-project" data-id="${comp.id}">${projectOptionsHtml(comp)}</select>
      </div>
      <div class="ach-card-meta">
        ${dateStr ? `<span class="stub">${escapeHtml(dateStr)}</span>` : ""}
        ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="stub">Open link</a>` : ""}
      </div>
      ${prizeBlock}
    </div>`;
}

function renderAchStatsStrip(stats) {
  const prizeLabel = stats.prizeParsed
    ? `$${stats.prizeTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "—";
  return `
    <div class="ach-stats-strip">
      <div class="card ach-stat-card">
        <div class="ach-stat-label">Total achievements</div>
        <div class="ach-stat-value">${stats.total}</div>
      </div>
      <div class="card ach-stat-card">
        <div class="ach-stat-label">Wins</div>
        <div class="ach-stat-value ach-stat-wins">${stats.wins}</div>
      </div>
      <div class="card ach-stat-card">
        <div class="ach-stat-label">Prize value${stats.prizeParsed ? " (est.)" : ""}</div>
        <div class="ach-stat-value">${escapeHtml(prizeLabel)}</div>
      </div>
      <div class="card ach-stat-card">
        <div class="ach-stat-label">Attended</div>
        <div class="ach-stat-value">${stats.attended}</div>
      </div>
    </div>`;
}

function renderAchToolbar() {
  const filters = [
    { key: "all", label: "All" },
    { key: "won", label: "Won" },
    { key: "attended", label: "Attended" },
    { key: "interested", label: "Interested" },
    { key: "grades", label: "Grades" },
  ];
  return `
    <div class="card ach-toolbar">
      <input type="search" class="ach-search" placeholder="Search achievements…" value="${escapeHtml(ACH_SEARCH).replace(/"/g, "&quot;")}">
      <div class="ach-filter-chips">
        ${filters.map(f => `<button type="button" class="ach-chip ${ACH_FILTER === f.key ? "active" : ""}" data-ach-filter="${escapeHtml(f.key)}">${escapeHtml(f.label)}</button>`).join("")}
      </div>
    </div>`;
}

function renderAchSection(title, items, projectOptionsHtml, contacts) {
  const cards = items.map(r => achievementCardHtml(r, projectOptionsHtml, contacts)).join("");
  return `
    <div class="ach-section-title">${escapeHtml(title)} <span class="pill ach-section-count">${items.length}</span></div>
    ${cards || `<p class="stub ach-empty-section">Nothing here yet.</p>`}`;
}

async function renderCompetitions() {
  const [results, projects, contacts] = await Promise.all([
    api("/api/competitions"),
    api("/api/projects"),
    api("/api/contacts"),
  ]);
  const projectOptionsHtml = comp => `<option value="">Link to project...</option>` +
    projects.map(pr => `<option value="${pr.id}" ${pr.id === comp.project_id ? "selected" : ""}>${escapeHtml(pr.name || "Untitled")}</option>`).join("");

  const filtered = results.filter(r => achMatchesFilter(r, ACH_FILTER, ACH_SEARCH));
  const competitions = filtered.filter(r => ACH_COMPETITION_STATUSES.has(r.status || "found"));
  const grades = filtered.filter(r => r.status === "grade_only");
  const stats = computeAchStats(results);

  return `
    ${achScopedStyles()}
    ${renderAchStatsStrip(stats)}
    ${renderAchToolbar()}
    <div class="card">
      <strong style="font-size:13px;">Add one yourself</strong>
      <p class="stub" style="margin:4px 0 8px;">Already did it, or found one on your own -- doesn't need the AI scan.</p>
      <div class="card-grid">
        <input type="text" id="new-competition-title" placeholder="Name">
        <input type="text" id="new-competition-type" placeholder="Type (hackathon, competitor...)">
        <select id="new-competition-status">
          <option value="interested">Want to attend</option>
          <option value="attended">Attended</option>
          <option value="won">Won something</option>
          <option value="grade_only">Grade only</option>
        </select>
        <input type="text" id="new-competition-url" placeholder="URL (optional)">
      </div>
      <textarea id="new-competition-desc" placeholder="Notes" style="margin-top:8px;"></textarea>
      <button class="secondary" id="add-competition" style="margin-top:8px;">Add</button>
    </div>
    <div class="card">
      <strong style="font-size:13px;">Scan for more</strong>
      <textarea id="competition-desc" placeholder="Describe your main project..." style="margin-top:6px;"></textarea>
      <button class="primary" id="scan-competitions" style="margin-top:8px;">Scan for hackathons + competitors</button>
    </div>
    ${ACH_FILTER === "grades" ? "" : renderAchSection("Competitions & hackathons", competitions, projectOptionsHtml, contacts)}
    ${ACH_FILTER === "interested" || ACH_FILTER === "attended" || ACH_FILTER === "won" ? "" : renderAchSection("Grades & records", grades, projectOptionsHtml, contacts)}
    ${!filtered.length && results.length ? '<p class="stub">No achievements match your filter.</p>' : ""}
    ${!results.length ? '<p class="stub">Nothing yet -- add one above, or describe your project and scan.</p>' : ""}`;
}

function savePersonalCredit(compId) {
  const creditInp = document.querySelector(`.competition-credit[data-id="${compId}"]`);
  const teamInp = document.querySelector(`.competition-team[data-id="${compId}"]`);
  if (!creditInp) return;
  const text = creditInp.value.trim();
  const teamVal = teamInp ? teamInp.value : "";
  const merged = joinPersonalCredit(text, teamVal);
  return api(`/api/competitions/${compId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personal_credit: merged }),
  });
}

function wireCompetitions() {
  const searchInput = document.querySelector(".ach-search");
  if (searchInput) {
    searchInput.oninput = () => {
      ACH_SEARCH = searchInput.value.trim();
      render();
    };
  }

  document.querySelectorAll(".ach-chip").forEach(chip => {
    chip.onclick = () => {
      ACH_FILTER = chip.dataset.achFilter || "all";
      render();
    };
  });

  const btn = document.getElementById("scan-competitions");
  if (btn) {
    btn.onclick = async () => {
      const description = document.getElementById("competition-desc").value.trim();
      if (!description) return;
      btn.textContent = "Scanning...";
      btn.disabled = true;
      try {
        await api("/api/competitions/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
        });
        render();
      } finally {
        btn.textContent = "Scan for hackathons + competitors";
        btn.disabled = false;
      }
    };
  }

  const addBtn = document.getElementById("add-competition");
  if (addBtn) {
    addBtn.onclick = async () => {
      const title = document.getElementById("new-competition-title").value.trim();
      if (!title) return;
      await api("/api/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type: document.getElementById("new-competition-type").value,
          status: document.getElementById("new-competition-status").value,
          url: document.getElementById("new-competition-url").value,
          description: document.getElementById("new-competition-desc").value,
        }),
      });
      render();
    };
  }

  document.querySelectorAll(".competition-status").forEach(sel => {
    sel.onchange = async () => {
      await api(`/api/competitions/${sel.dataset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: sel.value }),
      });
      render();
    };
  });

  document.querySelectorAll(".competition-title").forEach(inp => {
    inp.onchange = () => api(`/api/competitions/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: inp.value.trim() }),
    });
  });
  document.querySelectorAll(".competition-type").forEach(inp => {
    inp.onchange = () => api(`/api/competitions/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: inp.value.trim() }),
    });
  });
  document.querySelectorAll(".competition-desc").forEach(ta => {
    ta.onchange = async () => {
      const compId = ta.dataset.id;
      const all = await api("/api/competitions");
      const comp = all.find(c => String(c.id) === String(compId));
      const { teammateIds } = parseCompetitionTeammates(comp?.description);
      await api(`/api/competitions/${compId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: buildCompetitionDescription(teammateIds, ta.value) }),
      });
    };
  });
  document.querySelectorAll(".competition-url").forEach(inp => {
    inp.onchange = () => api(`/api/competitions/${inp.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: inp.value.trim() }),
    });
  });
  document.querySelectorAll(".competition-project").forEach(sel => {
    sel.onchange = () => api(`/api/competitions/${sel.dataset.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: sel.value ? Number(sel.value) : null }),
    });
  });
  document.querySelectorAll(".competition-credit").forEach(inp => {
    inp.onchange = () => savePersonalCredit(inp.dataset.id);
  });
  document.querySelectorAll(".competition-team").forEach(inp => {
    inp.onchange = () => savePersonalCredit(inp.dataset.id);
  });

  document.querySelectorAll(".competition-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this entry?")) return;
      await api(`/api/competitions/${btn.dataset.id}`, { method: "DELETE" });
      render();
    };
  });

  document.querySelectorAll(".ach-teammate-add").forEach(sel => {
    sel.onchange = async () => {
      const contactId = parseInt(sel.value, 10);
      if (!contactId) return;
      const compId = sel.dataset.id;
      const all = await api("/api/competitions");
      const comp = all.find(c => String(c.id) === String(compId));
      if (!comp) return;
      const { teammateIds, extra } = parseCompetitionTeammates(comp.description);
      if (!teammateIds.includes(contactId)) teammateIds.push(contactId);
      await api(`/api/competitions/${compId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: buildCompetitionDescription(teammateIds, extra) }),
      });
      render();
    };
  });
}
