// --- Customers ---------------------------------------------------------
// Discovery fields (email, phone, segment, pain, source) have no DB columns — stored as
// structured "key: value" lines in the customers.notes field alongside any freeform notes.

const CUSTOMER_STATUSES = ["lead", "contacted", "negotiating", "customer", "churned"];
const CUSTOMER_DISCOVERY_KEYS = ["email", "phone", "segment", "pain", "source"];
let CUSTOMER_DISCOVERY_OPEN = {};

function parseCustomerDiscovery(notes) {
  const fields = {};
  const other = [];
  for (const line of String(notes || "").split("\n")) {
    const m = line.match(/^(email|phone|segment|pain|source):\s*(.*)$/i);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
    else if (line.trim()) other.push(line);
  }
  return { fields, extra: other.join("\n") };
}

function buildCustomerNotes(fields, extra = "") {
  const lines = CUSTOMER_DISCOVERY_KEYS.filter(k => (fields[k] || "").trim()).map(k => `${k}: ${fields[k].trim()}`);
  const tail = String(extra || "").trim();
  if (tail) lines.push(tail);
  return lines.join("\n");
}

function customerStatusClass(status) {
  const map = {
    lead: "cust-status-lead",
    contacted: "cust-status-contacted",
    negotiating: "cust-status-negotiating",
    customer: "cust-status-customer",
    churned: "cust-status-churned",
  };
  return map[status] || "cust-status-lead";
}

function customersStylesHtml() {
  return `<style>
    .cust-page-header { margin-bottom:14px; }
    .cust-page-header .page-title {
      background: linear-gradient(135deg, var(--ink-primary), color-mix(in srgb, var(--accent) 42%, var(--ink-primary)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .cust-page-header .page-title::after {
      content: ""; display: block; width: 56px; height: 3px; margin-top: 8px;
      background: linear-gradient(90deg, var(--accent), #c9a227, transparent); border-radius: 1px;
    }
    .cust-add-card { border-left: 3px solid color-mix(in srgb, var(--accent) 55%, var(--gridline)); }
    .cust-table-wrap { overflow-x: auto; }
    .cust-table { width: 100%; border-collapse: collapse; }
    .cust-table tbody tr.cust-row { transition: background var(--t-quick) ease; }
    .cust-table tbody tr.cust-row:hover { background: color-mix(in srgb, var(--accent) 5%, var(--bg-card)); }
    .cust-table tbody tr.cust-row td { padding: 8px 10px; border-bottom: 1px solid var(--gridline); vertical-align: middle; }
    .cust-table tbody tr.cust-row td:first-child { border-left: 3px solid var(--cust-accent, var(--gridline)); padding-left: 12px; }
    .cust-row.cust-status-lead { --cust-accent: color-mix(in srgb, var(--cat-flow) 70%, var(--ink-muted)); }
    .cust-row.cust-status-contacted { --cust-accent: var(--status-warning); }
    .cust-row.cust-status-negotiating { --cust-accent: var(--status-serious); }
    .cust-row.cust-status-customer { --cust-accent: var(--status-good); }
    .cust-row.cust-status-churned { --cust-accent: color-mix(in srgb, var(--ink-muted) 80%, var(--status-critical)); }
    .cust-status-select {
      font-size: 11px; padding: 3px 8px; border-radius: 999px; cursor: pointer;
      border: 1px solid var(--gridline); background: var(--bg-shell); color: var(--ink-secondary);
    }
    .cust-status-select.cust-status-lead { color: var(--cat-flow); border-color: color-mix(in srgb, var(--cat-flow) 50%, var(--border)); background: color-mix(in srgb, var(--cat-flow) 10%, var(--bg-shell)); }
    .cust-status-select.cust-status-contacted { color: var(--status-warning); border-color: color-mix(in srgb, var(--status-warning) 55%, var(--border)); background: color-mix(in srgb, var(--status-warning) 10%, var(--bg-shell)); }
    .cust-status-select.cust-status-negotiating { color: var(--status-serious); border-color: color-mix(in srgb, var(--status-serious) 55%, var(--border)); background: color-mix(in srgb, var(--status-serious) 10%, var(--bg-shell)); }
    .cust-status-select.cust-status-customer { color: var(--status-good); border-color: color-mix(in srgb, var(--status-good) 55%, var(--border)); background: color-mix(in srgb, var(--status-good) 10%, var(--bg-shell)); }
    .cust-status-select.cust-status-churned { color: var(--ink-muted); border-color: color-mix(in srgb, var(--ink-muted) 45%, var(--border)); background: color-mix(in srgb, var(--ink-muted) 8%, var(--bg-shell)); }
    .cust-stale-pill { color: var(--status-critical); border-color: color-mix(in srgb, var(--status-critical) 55%, var(--border)); background: color-mix(in srgb, var(--status-critical) 10%, var(--bg-shell)); }
    .cust-discovery-row td { padding: 0 10px 10px 15px !important; border-bottom: 1px solid var(--gridline); }
    .customer-discovery {
      border-radius: 8px; padding: 8px 10px;
      background: color-mix(in srgb, var(--accent) 4%, var(--bg-shell));
      border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--gridline));
    }
    .customer-discovery[open] { background: color-mix(in srgb, var(--accent) 7%, var(--bg-shell)); border-color: color-mix(in srgb, var(--accent) 28%, var(--gridline)); }
    .customer-discovery summary {
      cursor: pointer; font-size: 12px; font-weight: 600; color: var(--ink-secondary);
      list-style: none; display: flex; align-items: center; gap: 8px;
    }
    .customer-discovery summary::before {
      content: ""; width: 3px; height: 14px; border-radius: 1px; background: var(--accent); flex-shrink: 0;
    }
    .customer-discovery summary::-webkit-details-marker { display: none; }
    .customer-discovery-fields label span.stub {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;
      color: color-mix(in srgb, var(--accent) 55%, var(--ink-muted));
    }
    .customer-discovery-fields input { font-size: 12px; }
    .cust-hint { margin-top: 10px; padding: 8px 10px; border-radius: 6px; font-size: 12px;
      color: var(--ink-secondary); border-left: 3px solid var(--status-warning);
      background: color-mix(in srgb, var(--status-warning) 6%, var(--bg-card)); }
  </style>`;
}

function customerDiscoveryHtml(c) {
  const { fields } = parseCustomerDiscovery(c.notes);
  return `
    <details class="customer-discovery" data-id="${c.id}" ${CUSTOMER_DISCOVERY_OPEN[c.id] ? "open" : ""}>
      <summary>Customer discovery</summary>
      <div class="customer-discovery-fields" data-id="${c.id}" style="margin-top:8px; display:grid; gap:6px; grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">
        ${CUSTOMER_DISCOVERY_KEYS.map(k => `
          <label style="font-size:11px; display:flex; flex-direction:column; gap:2px;">
            <span class="stub">${escapeHtml(k)}</span>
            <input type="text" class="customer-discovery-input" data-id="${c.id}" data-field="${escapeHtml(k)}" value="${escapeHtml(fields[k] || "").replace(/"/g, "&quot;")}" placeholder="${escapeHtml(k)}">
          </label>`).join("")}
        <div style="grid-column:1/-1;">
          <button type="button" class="secondary customer-discovery-save" data-id="${c.id}" style="font-size:11px;">Save discovery</button>
        </div>
      </div>
    </details>`;
}

async function renderCustomers() {
  const customers = await api("/api/customers");
  const rows = customers.map(c => {
    const statusCls = customerStatusClass(c.status || "lead");
    return `
    <tr class="cust-row ${statusCls}" data-id="${c.id}" data-status="${escapeHtml(c.status || "lead")}">
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.company || "—")}</td>
      <td>
        <select class="customer-status cust-status-select ${statusCls}" data-id="${c.id}">
          ${CUSTOMER_STATUSES.map(s => `<option value="${escapeHtml(s)}" ${c.status === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
      </td>
      <td>${c.stale ? '<span class="pill cust-stale-pill">needs update</span>' : '<span class="stub">—</span>'}</td>
      <td><button type="button" class="secondary icon-circle icon-circle--sm customer-delete" data-id="${c.id}" title="Delete customer" aria-label="Delete customer">×</button></td>
    </tr>
    <tr class="cust-discovery-row" data-discovery-for="${c.id}"><td colspan="5">${customerDiscoveryHtml(c)}</td></tr>`;
  }).join("");

  return `
    ${customersStylesHtml()}
    <div class="cust-page-header">
      <p class="page-title">Customers</p>
      <p class="page-subtitle">Pipeline at a glance — status colors show where each relationship stands.</p>
    </div>
    <div class="card cust-add-card">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="text" id="new-customer-name" placeholder="Name">
        <input type="text" id="new-customer-company" placeholder="Company">
        <button class="primary" id="add-customer">Add</button>
      </div>
    </div>
    <div class="card">
      <div class="cust-table-wrap">
        <table class="cust-table">
          <thead><tr><th>Name</th><th>Company</th><th>Status</th><th></th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="stub" style="padding:16px;">No customers yet — add your first lead above.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <p class="cust-hint">Flags <span class="pill cust-stale-pill" style="font-size:10px; padding:1px 6px;">needs update</span> after 14 days without a status change — change status (e.g. lead → contacted) to clear it.</p>`;
}

function wireCustomers() {
  document.getElementById("add-customer").onclick = async () => {
    const name = document.getElementById("new-customer-name").value.trim();
    const company = document.getElementById("new-customer-company").value.trim();
    if (!name) return;
    await api("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, company }),
    });
    render();
  };

  document.querySelectorAll(".customer-status").forEach(sel => {
    const syncStatusClass = () => {
      sel.classList.remove(...CUSTOMER_STATUSES.map(s => customerStatusClass(s)));
      sel.classList.add(customerStatusClass(sel.value));
      const row = sel.closest(".cust-row");
      if (row) {
        row.classList.remove(...CUSTOMER_STATUSES.map(s => customerStatusClass(s)));
        row.classList.add(customerStatusClass(sel.value));
        row.dataset.status = sel.value;
      }
    };
    syncStatusClass();
    sel.onchange = async () => {
      syncStatusClass();
      await api(`/api/customers/${sel.dataset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: sel.value }),
      });
      render();
    };
  });

  document.querySelectorAll(".customer-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this customer?")) return;
      await api(`/api/customers/${btn.dataset.id}`, { method: "DELETE" });
      render();
    };
  });

  document.querySelectorAll(".customer-discovery").forEach(det => {
    det.ontoggle = () => {
      CUSTOMER_DISCOVERY_OPEN[det.dataset.id] = det.open;
    };
  });

  document.querySelectorAll(".customer-discovery-save").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const customer = (await api("/api/customers")).find(c => String(c.id) === String(id));
      if (!customer) return;
      const { extra } = parseCustomerDiscovery(customer.notes);
      const fields = {};
      document.querySelectorAll(`.customer-discovery-input[data-id="${id}"]`).forEach(inp => {
        fields[inp.dataset.field] = inp.value.trim();
      });
      await api(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: buildCustomerNotes(fields, extra) }),
      });
      render();
    };
  });
}

// --- Contacts ---------------------------------------------------------

const CONTACT_CLOSENESS_OPTIONS = [
  { value: "friend", label: "friend" },
  { value: "acquaintance", label: "acquaintance" },
  { value: "contact", label: "contact" },
  { value: "cofounder", label: "possible cofounder" },
];
const WORKED_LINK_RE = /^\[worked:\s*(project|competition):(\d+)\](?:\s+(.*))?$/i;
const CONTACT_UI_STORAGE_KEY = "waypointContactUi";
const CONTACT_SEARCH_STOPWORDS = new Set([
  "a", "an", "the", "that", "this", "who", "whom", "which", "what", "where", "when",
  "guy", "girl", "person", "people", "someone", "somebody", "dude", "lady", "man",
  "know", "knew", "met", "from", "with", "about", "into", "like", "really", "very",
]);
let CONTACT_CLOSENESS_FILTER = "all";
let CONTACT_SEARCH_QUERY = "";
let CONTACT_SEARCH_RENDER_TIMER = null;

function loadContactUiPrefs() {
  try {
    const raw = localStorage.getItem(CONTACT_UI_STORAGE_KEY);
    if (!raw) return { pinned: [], order: [] };
    const data = JSON.parse(raw);
    return {
      pinned: Array.isArray(data.pinned) ? data.pinned.map(Number).filter(n => !Number.isNaN(n)) : [],
      order: Array.isArray(data.order) ? data.order.map(Number).filter(n => !Number.isNaN(n)) : [],
    };
  } catch (_) {
    return { pinned: [], order: [] };
  }
}

function saveContactUiPrefs(prefs) {
  localStorage.setItem(CONTACT_UI_STORAGE_KEY, JSON.stringify({
    pinned: prefs.pinned || [],
    order: prefs.order || [],
  }));
}

function contactSearchBlob(c, projects, competitions) {
  const { links, extra } = parseContactWorkedLinks(c.notes);
  const closenessLabel = CONTACT_CLOSENESS_OPTIONS.find(o => o.value === (c.closeness || "contact"))?.label || "";
  const workedLabels = links.map(l => contactWorkedLinkLabel(l, projects, competitions));
  const descText = String(c.description || "").replace(/<[^>]+>/g, " ");
  return [
    c.name, c.what_they_do, descText, c.met_where, c.met_when,
    c.email, c.phone, c.linkedin_url, c.closeness, closenessLabel,
    extra, ...links.map(l => l.note), ...workedLabels,
  ].filter(Boolean).join(" ").toLowerCase();
}

function contactSearchTokens(query) {
  return String(query || "").toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !CONTACT_SEARCH_STOPWORDS.has(t));
}

function contactMatchesSearch(c, query, projects, competitions) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const blob = contactSearchBlob(c, projects, competitions);
  if (blob.includes(q)) return true;
  const tokens = contactSearchTokens(q);
  if (!tokens.length) return blob.includes(q);
  return tokens.every(t => blob.includes(t));
}

function contactSearchScore(c, query, projects, competitions) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return 0;
  const name = String(c.name || "").toLowerCase();
  let score = 0;
  if (name === q) score += 120;
  else if (name.startsWith(q)) score += 90;
  else if (name.includes(q)) score += 70;
  const blob = contactSearchBlob(c, projects, competitions);
  if (blob.includes(q)) score += 40;
  const tokens = contactSearchTokens(q);
  for (const t of tokens) {
    if (name.includes(t)) score += 18;
    else if (blob.includes(t)) score += 8;
  }
  return score;
}

function sortContactsForDisplay(contacts, prefs) {
  const { pinned, order } = prefs;
  const pinRank = id => {
    const idx = pinned.indexOf(Number(id));
    return idx >= 0 ? idx : 9999;
  };
  const orderRank = id => {
    const idx = order.indexOf(Number(id));
    return idx >= 0 ? idx : 9999;
  };
  return [...contacts].sort((a, b) => {
    const pa = pinRank(a.id);
    const pb = pinRank(b.id);
    if (pa !== pb) return pa - pb;
    const oa = orderRank(a.id);
    const ob = orderRank(b.id);
    if (oa !== ob) return oa - ob;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  });
}

function filterContactsForView(contacts, projects, competitions) {
  let rows = contacts;
  if (CONTACT_CLOSENESS_FILTER !== "all") {
    rows = rows.filter(c => (c.closeness || "contact") === CONTACT_CLOSENESS_FILTER);
  }
  if (CONTACT_SEARCH_QUERY.trim()) {
    rows = rows.filter(c => contactMatchesSearch(c, CONTACT_SEARCH_QUERY, projects, competitions));
    rows.sort((a, b) => contactSearchScore(b, CONTACT_SEARCH_QUERY, projects, competitions)
      - contactSearchScore(a, CONTACT_SEARCH_QUERY, projects, competitions));
    return rows;
  }
  return sortContactsForDisplay(rows, loadContactUiPrefs());
}

// Five mutually exclusive views of one list, so it reads as a segmented capsule track (the shared
// .seg-pill primitive) rather than five loose chips that each look independently toggleable.
function contactCategoryChipsHtml() {
  const chips = [{ value: "all", label: "all" }, ...CONTACT_CLOSENESS_OPTIONS];
  const buttons = chips.map(o => {
    const active = CONTACT_CLOSENESS_FILTER === o.value;
    return `<button type="button" class="seg-pill-btn contact-cat-chip${active ? " active" : ""}" data-cat="${escapeHtml(o.value)}"${active ? ` aria-current="true"` : ""}>${escapeHtml(o.label)}</button>`;
  }).join("");
  return `<div class="seg-pill contacts-cat-chips" role="group" aria-label="Filter by closeness">${buttons}</div>`;
}

function contactPinButtonHtml(c, prefs) {
  const pinned = (prefs.pinned || []).includes(Number(c.id));
  return `<button type="button" class="secondary icon-circle contact-pin ${pinned ? "contact-pin-on" : ""}" data-id="${c.id}" title="${pinned ? "Unpin" : "Pin to top"}" aria-label="${pinned ? "Unpin contact" : "Pin contact to top"}">${pinned ? "★" : "☆"}</button>`;
}

function closenessClass(value) {
  const map = {
    friend: "close-friend",
    acquaintance: "close-acquaintance",
    contact: "close-contact",
    cofounder: "close-cofounder",
  };
  return map[value] || "close-contact";
}

function contactsStylesHtml() {
  return `<style>
    .contacts-page-header { margin-bottom: 14px; }
    .contacts-page-header .page-title::after {
      content: ""; display: block; width: 48px; height: 3px; margin-top: 8px;
      background: linear-gradient(90deg, var(--accent), transparent); border-radius: 1px;
    }
    .contacts-section-title {
      font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--ink-secondary); margin: 18px 0 10px; display: flex; align-items: center; gap: 8px;
    }
    .contacts-section-title::before {
      content: ""; width: 3px; height: 14px; border-radius: 1px; background: var(--accent); flex-shrink: 0;
    }
    .contact-card { transition: border-color var(--t-quick) ease, box-shadow var(--t-quick) ease; }
    .contact-card:hover {
      border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent);
    }
    .contact-closeness, .new-contact-closeness {
      font-size: 11px; padding: 3px 10px; border-radius: 999px; cursor: pointer;
      border: 1px solid var(--gridline); background: var(--bg-shell);
    }
    .contact-closeness.close-friend, .new-contact-closeness.close-friend {
      color: var(--status-good); border-color: color-mix(in srgb, var(--status-good) 55%, var(--border));
      background: color-mix(in srgb, var(--status-good) 10%, var(--bg-shell));
    }
    .contact-closeness.close-acquaintance, .new-contact-closeness.close-acquaintance {
      color: var(--cat-flow); border-color: color-mix(in srgb, var(--cat-flow) 55%, var(--border));
      background: color-mix(in srgb, var(--cat-flow) 10%, var(--bg-shell));
    }
    .contact-closeness.close-contact, .new-contact-closeness.close-contact {
      color: var(--ink-secondary); border-color: color-mix(in srgb, var(--ink-muted) 40%, var(--border));
      background: color-mix(in srgb, var(--ink-muted) 8%, var(--bg-shell));
    }
    .contact-closeness.close-cofounder, .new-contact-closeness.close-cofounder {
      color: #c9a227; border-color: color-mix(in srgb, #c9a227 55%, var(--border));
      background: color-mix(in srgb, #c9a227 12%, var(--bg-shell));
    }
    .contact-worked-pill {
      background: color-mix(in srgb, var(--accent) 10%, var(--bg-shell)) !important;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)) !important;
      color: color-mix(in srgb, var(--accent) 75%, var(--ink-primary)) !important;
    }
    .contact-worked-pill:hover { background: color-mix(in srgb, var(--accent) 16%, var(--bg-shell)) !important; }
    .contacts-empty {
      padding: 20px; text-align: center; border-radius: 8px; color: var(--ink-secondary);
      border: 1px dashed color-mix(in srgb, var(--accent) 30%, var(--gridline));
      background: color-mix(in srgb, var(--accent) 4%, var(--bg-card));
    }
    .contacts-toolbar { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
    .contacts-search-wrap { display:flex; flex-direction:column; gap:4px; }
    .contacts-search {
      width: 100%; font-size: 13px; padding: 8px 10px; border-radius: 8px;
      border: 1px solid var(--gridline); background: var(--bg-shell);
    }
    .contacts-search:focus { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); outline: none; }
    .contacts-search-hint { font-size: 11px; color: var(--ink-muted); }
    /* The toolbar is a stretching column; keep the track as wide as its options, not the card. */
    .contacts-cat-chips { align-self: flex-start; flex-wrap: wrap; max-width: 100%; }
    .contact-pin { font-size: 14px; }
    .contact-pin-on { color: #c9a227; border-color: color-mix(in srgb, #c9a227 55%, var(--border)); background: color-mix(in srgb, #c9a227 12%, var(--bg-shell)); }
    .contacts-pinned-title { color: #c9a227; }
  </style>`;
}

function closenessSelectHtml(cls, id, current, { selectId } = {}) {
  const htmlId = selectId || (cls.startsWith("new-") ? cls : "");
  const idAttr = htmlId ? ` id="${escapeHtml(htmlId)}"` : "";
  const closeCls = closenessClass(current || "contact");
  return `<select class="${escapeHtml(cls)} ${closeCls}"${idAttr} data-id="${escapeHtml(id)}">
    ${CONTACT_CLOSENESS_OPTIONS.map(o => `<option value="${escapeHtml(o.value)}" ${current === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
  </select>`;
}

function parseContactWorkedLinks(notes) {
  const links = [];
  const other = [];
  for (const line of String(notes || "").split("\n")) {
    const m = line.trim().match(WORKED_LINK_RE);
    if (m) links.push({ type: m[1].toLowerCase(), id: parseInt(m[2], 10), note: (m[3] || "").trim() });
    else if (line.trim()) other.push(line);
  }
  return { links, extra: other.join("\n") };
}

function buildContactNotes(links, extra = "") {
  const lines = links.map(l => {
    const base = `[worked: ${l.type}:${l.id}]`;
    const note = (l.note || "").trim();
    return note ? `${base} ${note}` : base;
  });
  const tail = String(extra || "").trim();
  if (tail) lines.push(tail);
  return lines.join("\n");
}

function contactWorkedLinkLabel(link, projects, competitions) {
  let label = `${link.type} #${link.id}`;
  if (link.type === "project") {
    const p = projects.find(x => x.id === link.id);
    if (p) label = p.name || label;
  } else {
    const c = competitions.find(x => x.id === link.id);
    if (c) label = c.title || label;
  }
  return label;
}

function contactWorkedEditOptionsHtml(link, projects, competitions) {
  const opts = [];
  projects.forEach(p => {
    const sel = link.type === "project" && link.id === p.id ? " selected" : "";
    opts.push(`<option value="project:${p.id}"${sel}>${escapeHtml(p.name || "Project")}</option>`);
  });
  competitions.forEach(c => {
    const sel = link.type === "competition" && link.id === c.id ? " selected" : "";
    opts.push(`<option value="competition:${c.id}"${sel}>${escapeHtml(c.title || "Competition")}</option>`);
  });
  return opts.join("");
}

function contactWorkedPillsHtml(contactId, links, projects, competitions) {
  if (!links.length) return "";
  const rows = links.map((l, index) => {
    const label = contactWorkedLinkLabel(l, projects, competitions);
    const noteVal = escapeHtml(l.note || "").replace(/"/g, "&quot;");
    return `<div class="contact-worked-row" data-contact-id="${contactId}" data-index="${index}" style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
      <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="pill contact-worked-pill" data-contact-id="${contactId}" data-index="${index}" title="Click to change project/competition" style="cursor:pointer; border:none;">${escapeHtml(label)}</button>
        <button type="button" class="secondary icon-circle icon-circle--sm contact-worked-remove" data-contact-id="${contactId}" data-index="${index}" title="Remove" aria-label="Remove this worked-together link">×</button>
        <select class="contact-worked-edit" data-contact-id="${contactId}" data-index="${index}" style="display:none; font-size:11px; max-width:220px;">${contactWorkedEditOptionsHtml(l, projects, competitions)}</select>
      </div>
      <input type="text" class="contact-worked-note-input" data-contact-id="${contactId}" data-index="${index}" value="${noteVal}" placeholder="What you did together (optional)" style="font-size:11px; width:100%; max-width:360px;">
    </div>`;
  }).join("");
  const openAttr = links.length <= 3 ? " open" : "";
  return `<details class="contact-worked-history"${openAttr} style="margin-top:6px;">
    <summary style="cursor:pointer; font-size:12px; color:var(--ink-secondary);">Worked together history (${links.length})</summary>
    <div class="contact-worked-list" style="margin-top:6px;">${rows}</div>
  </details>`;
}

async function patchContactWorkedLinks(contactId, mutateFn) {
  const contacts = await api("/api/contacts");
  const c = contacts.find(x => String(x.id) === String(contactId));
  if (!c) return;
  const parsed = parseContactWorkedLinks(c.notes);
  mutateFn(parsed);
  await api(`/api/contacts/${contactId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: buildContactNotes(parsed.links, parsed.extra) }),
  });
  render();
}

function contactShareCardText(c) {
  const lines = [`${c.name || "Contact"}`];
  if (c.what_they_do) lines.push(`Role: ${c.what_they_do}`);
  if (c.email) lines.push(`Email: ${c.email}`);
  if (c.phone) lines.push(`Phone: ${c.phone}`);
  if (c.linkedin_url) lines.push(`LinkedIn: ${c.linkedin_url}`);
  if (c.met_where || c.met_when) lines.push(`Met: ${[c.met_where, c.met_when].filter(Boolean).join(", ")}`);
  if (c.closeness) lines.push(`Closeness: ${c.closeness}`);
  const desc = (c.description || "").replace(/<[^>]+>/g, "").trim();
  if (desc) lines.push(`Notes: ${desc}`);
  return lines.join("\n");
}

function contactAlreadyOnTeam(contact, teamMembers) {
  const email = (contact.email || "").trim().toLowerCase();
  const name = (contact.name || "").trim().toLowerCase();
  return teamMembers.some(m => {
    if (email && (m.email || "").trim().toLowerCase() === email) return true;
    return name && (m.name || "").trim().toLowerCase() === name;
  });
}

async function renderContacts() {
  const [allContacts, teamMembers, projects, competitions] = await Promise.all([
    api("/api/contacts"),
    api("/api/team"),
    api("/api/projects"),
    api("/api/competitions"),
  ]);
  const uiPrefs = loadContactUiPrefs();
  const contacts = filterContactsForView(allContacts, projects, competitions);
  const searchActive = !!CONTACT_SEARCH_QUERY.trim();
  const groupByCategory = CONTACT_CLOSENESS_FILTER === "all" && !searchActive;
  const pinnedIds = new Set((uiPrefs.pinned || []).map(Number));
  const pinnedContacts = groupByCategory ? contacts.filter(c => pinnedIds.has(Number(c.id))) : [];
  const unpinnedContacts = groupByCategory ? contacts.filter(c => !pinnedIds.has(Number(c.id))) : contacts;

  const workedOptionsHtml = (contactId, currentLinks) => {
    const linked = new Set(currentLinks.map(l => `${l.type}:${l.id}`));
    const opts = [];
    projects.forEach(p => {
      const key = `project:${p.id}`;
      if (!linked.has(key)) opts.push(`<option value="${escapeHtml(key)}">${escapeHtml(p.name || "Project")}</option>`);
    });
    competitions.forEach(c => {
      const key = `competition:${c.id}`;
      if (!linked.has(key)) opts.push(`<option value="${escapeHtml(key)}">${escapeHtml(c.title || "Competition")}</option>`);
    });
    if (!opts.length) return "";
    return `<div class="contact-worked-add-row" data-id="${contactId}" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
      <select class="contact-worked-add" data-id="${contactId}" style="font-size:11px; max-width:200px;">
        <option value="">+ worked together…</option>${opts.join("")}
      </select>
      <input type="text" class="contact-worked-add-note" data-id="${contactId}" placeholder="What you did (optional)" style="font-size:11px; max-width:200px; display:none;">
    </div>`;
  };

  const contactCardHtml = c => {
    const { links: workedLinks } = parseContactWorkedLinks(c.notes);
    return `
    <div class="card contact-card" data-contact-id="${c.id}">
      <div style="display:flex; justify-content:space-between; align-items:start;">
        <strong>${escapeHtml(c.name)}</strong>
        <span style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          ${contactPinButtonHtml(c, uiPrefs)}
          ${closenessSelectHtml("contact-closeness", c.id, c.closeness || "contact")}
          <button type="button" class="secondary contact-share" data-id="${c.id}" title="Copy contact card to clipboard">Share contact</button>
          <button type="button" class="secondary contact-reach-out" data-id="${c.id}" data-name="${escapeHtml(c.name).replace(/"/g, "&quot;")}">+ task: reach out</button>
          ${contactAlreadyOnTeam(c, teamMembers) ? "" : `<button type="button" class="secondary contact-to-team" data-id="${c.id}" data-name="${escapeHtml(c.name).replace(/"/g, "&quot;")}" data-email="${escapeHtml(c.email || "").replace(/"/g, "&quot;")}" title="Add to Team tab">→ team</button>`}
          <button type="button" class="secondary icon-circle contact-delete" data-id="${c.id}" title="Delete contact" aria-label="Delete contact">×</button>
        </span>
      </div>
      <div class="stub" style="margin-top:4px;">
        ${c.what_they_do ? `${escapeHtml(c.what_they_do)}<br>` : ""}
        ${c.met_where || c.met_when ? `Met: ${escapeHtml([c.met_where, c.met_when].filter(Boolean).join(", "))}<br>` : ""}
        ${[c.email, c.phone, c.linkedin_url].filter(Boolean).map(v => escapeHtml(v)).join(" | ")}
      </div>
      ${contactWorkedPillsHtml(c.id, workedLinks, projects, competitions)}
      <div style="margin-top:6px;">${workedOptionsHtml(c.id, workedLinks)}</div>
      <div data-rich-for="contact-desc-${c.id}" style="margin-top:6px;">${RICH_TOOLBAR_HTML}</div>
      <div id="contact-desc-${c.id}" class="rich-editable contact-desc-edit" data-id="${c.id}" contenteditable="true">${c.description || ""}</div>
      <div style="margin-top:6px;"><button type="button" class="secondary contact-desc-save" data-id="${c.id}">Save notes</button></div>
    </div>`;
  };

  const cardsForList = list => list.map(contactCardHtml).join("");

  let cardsBody = "";
  if (!contacts.length) {
    cardsBody = '<p class="contacts-empty">No contacts match this filter.</p>';
  } else if (groupByCategory) {
    const sections = [];
    if (pinnedContacts.length) {
      sections.push(`<div class="contacts-section-title contacts-pinned-title">Pinned (${pinnedContacts.length})</div>${cardsForList(pinnedContacts)}`);
    }
    for (const opt of CONTACT_CLOSENESS_OPTIONS) {
      const group = unpinnedContacts.filter(c => (c.closeness || "contact") === opt.value);
      if (!group.length) continue;
      sections.push(`<div class="contacts-section-title">${escapeHtml(opt.label)} (${group.length})</div>${cardsForList(group)}`);
    }
    cardsBody = sections.join("");
  } else {
    cardsBody = cardsForList(contacts);
  }

  const cards = cardsBody;

  return `
    ${contactsStylesHtml()}
    <div class="contacts-page-header">
      <p class="page-title">Contacts</p>
      <p class="page-subtitle">Staying in touch is a task, not a field to maintain — use "+ task: reach out" instead of tracking last-contact dates.</p>
    </div>
    <div class="card">
      <div class="card-grid">
        <input type="text" id="new-contact-name" placeholder="Name">
        <input type="text" id="new-contact-what" placeholder="What they do">
        <input type="text" id="new-contact-where" placeholder="Where you met">
        <input type="text" id="new-contact-when" placeholder="When you met">
        <input type="text" id="new-contact-email" placeholder="Email">
        <input type="text" id="new-contact-phone" placeholder="Phone">
        <input type="text" id="new-contact-linkedin" placeholder="LinkedIn URL">
        ${closenessSelectHtml("new-contact-closeness", "", "contact", { selectId: "new-contact-closeness" })}
      </div>
      <textarea id="new-contact-desc" placeholder="Description / notes" style="margin-top:8px;"></textarea>
      <div class="contacts-toolbar">
        <div class="contacts-search-wrap">
          <input type="search" id="contact-search" class="contacts-search" placeholder="Search by name or notes — e.g. &quot;the guy who does blockchain&quot;" value="${escapeHtml(CONTACT_SEARCH_QUERY).replace(/"/g, "&quot;")}">
          <span class="contacts-search-hint">Matches name, role, notes, closeness, and worked-together tags. Filler words like &quot;the guy that&quot; are ignored.</span>
        </div>
        ${contactCategoryChipsHtml()}
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button type="button" class="secondary" id="add-contact">Add contact</button>
          <button type="button" class="primary" id="get-suggestions">Who to reach out to</button>
        </div>
      </div>
      <div id="suggestions-box" class="stub"></div>
    </div>
    ${contacts.length ? `<div class="contacts-section-title">Your contacts (${contacts.length}${allContacts.length !== contacts.length ? ` of ${allContacts.length}` : ""})</div>` : ""}
    ${cards}`;
}

function wireContacts() {
  document.querySelectorAll(".contact-desc-edit").forEach(el => wireRichToolbar(`contact-desc-${el.dataset.id}`));

  document.querySelectorAll(".contact-desc-save").forEach(btn => {
    btn.onclick = async () => {
      const description = document.getElementById(`contact-desc-${btn.dataset.id}`).innerHTML.trim();
      await api(`/api/contacts/${btn.dataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      render();
    };
  });

  const addContactBtn = document.getElementById("add-contact");
  if (addContactBtn) addContactBtn.onclick = async () => {
    const name = document.getElementById("new-contact-name").value.trim();
    if (!name) return;
    const closenessEl = document.getElementById("new-contact-closeness");
    await api("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        what_they_do: document.getElementById("new-contact-what").value,
        met_where: document.getElementById("new-contact-where").value,
        met_when: document.getElementById("new-contact-when").value,
        description: document.getElementById("new-contact-desc").value,
        email: document.getElementById("new-contact-email").value,
        phone: document.getElementById("new-contact-phone").value,
        linkedin_url: document.getElementById("new-contact-linkedin").value,
        closeness: closenessEl ? closenessEl.value : "contact",
      }),
    });
    if (window.WaypointGame && typeof window.WaypointGame.questProgress === "function") {
      window.WaypointGame.questProgress("contact1");
    }
    render();
  };

  const searchInput = document.getElementById("contact-search");
  if (searchInput) {
    searchInput.oninput = () => {
      const start = searchInput.selectionStart;
      const end = searchInput.selectionEnd;
      CONTACT_SEARCH_QUERY = searchInput.value;
      clearTimeout(CONTACT_SEARCH_RENDER_TIMER);
      CONTACT_SEARCH_RENDER_TIMER = setTimeout(async () => {
        await render();
        const el = document.getElementById("contact-search");
        if (!el) return;
        el.focus();
        try { el.setSelectionRange(start, end); } catch (_) { /* ignore */ }
      }, 180);
    };
  }

  document.querySelectorAll(".contact-cat-chip").forEach(chip => {
    chip.onclick = () => {
      CONTACT_CLOSENESS_FILTER = chip.dataset.cat || "all";
      render();
    };
  });

  document.querySelectorAll(".contact-pin").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const prefs = loadContactUiPrefs();
      const idx = prefs.pinned.indexOf(id);
      if (idx >= 0) prefs.pinned.splice(idx, 1);
      else prefs.pinned.unshift(id);
      if (!prefs.order.includes(id)) prefs.order.unshift(id);
      else {
        prefs.order = prefs.order.filter(x => x !== id);
        prefs.order.unshift(id);
      }
      saveContactUiPrefs(prefs);
      render();
    };
  });

  document.querySelectorAll(".contact-closeness").forEach(sel => {
    const syncClosenessClass = () => {
      sel.classList.remove("close-friend", "close-acquaintance", "close-contact", "close-cofounder");
      sel.classList.add(closenessClass(sel.value));
    };
    syncClosenessClass();
    sel.onchange = () => {
      syncClosenessClass();
      api(`/api/contacts/${sel.dataset.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closeness: sel.value }),
      });
    };
  });

  const suggestionsBtn = document.getElementById("get-suggestions");
  if (suggestionsBtn) suggestionsBtn.onclick = async () => {
    const box = document.getElementById("suggestions-box");
    box.textContent = "Thinking...";
    const { suggestions, error } = await api("/api/contacts/suggestions");
    if (error) { box.textContent = `(${error})`; return; }
    box.innerHTML = suggestions.length
      ? suggestions.map(s => `<div>- contact #${s.contact_id}: ${s.reason}</div>`).join("")
      : "No suggestions yet.";
  };

  document.querySelectorAll(".contact-reach-out").forEach(btn => {
    btn.onclick = async () => {
      await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Reach out to ${btn.dataset.name}`, urgency: "medium", contact_id: btn.dataset.id }),
      });
      if (window.WaypointGame && typeof window.WaypointGame.questProgress === "function") {
        window.WaypointGame.questProgress("contact1");
        window.WaypointGame.questProgress("addtask2");
      }
      goToTab("Tasks");
    };
  });

  document.querySelectorAll(".contact-to-team").forEach(btn => {
    btn.onclick = async () => {
      await api("/api/team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: btn.dataset.name, email: btn.dataset.email || null }),
      });
      goToTab("Team");
    };
  });

  document.querySelectorAll(".contact-delete").forEach(btn => {
    btn.onclick = async () => {
      if (!window.confirm("Delete this contact?")) return;
      await api(`/api/contacts/${btn.dataset.id}`, { method: "DELETE" });
      render();
    };
  });

  document.querySelectorAll(".contact-share").forEach(btn => {
    btn.onclick = async () => {
      const contacts = await api("/api/contacts");
      const c = contacts.find(x => String(x.id) === String(btn.dataset.id));
      if (!c) return;
      const text = contactShareCardText(c);
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Share contact"; }, 1500);
      } catch (_) {
        window.prompt("Copy contact card:", text);
      }
    };
  });

  document.querySelectorAll(".contact-worked-add").forEach(sel => {
    sel.onchange = async () => {
      const val = sel.value;
      const contactId = sel.dataset.id;
      const noteInput = document.querySelector(`.contact-worked-add-note[data-id="${contactId}"]`);
      if (!val) {
        delete sel.dataset.pendingValue;
        if (noteInput) noteInput.style.display = "none";
        return;
      }
      if (noteInput) {
        noteInput.style.display = "";
        const note = noteInput.value.trim();
        if (note) {
          const [type, idStr] = val.split(":");
          const newId = parseInt(idStr, 10);
          await patchContactWorkedLinks(contactId, parsed => {
            if (!parsed.links.some(l => l.type === type && l.id === newId)) {
              parsed.links.push({ type, id: newId, note });
            }
          });
          return;
        }
        noteInput.focus();
      }
      sel.dataset.pendingValue = val;
    };
  });

  document.querySelectorAll(".contact-worked-add-note").forEach(inp => {
    const saveAdd = async () => {
      const contactId = inp.dataset.id;
      const sel = document.querySelector(`.contact-worked-add[data-id="${contactId}"]`);
      const val = sel?.dataset.pendingValue || sel?.value;
      if (!val) return;
      const [type, idStr] = val.split(":");
      const newId = parseInt(idStr, 10);
      const note = inp.value.trim();
      await patchContactWorkedLinks(contactId, parsed => {
        if (!parsed.links.some(l => l.type === type && l.id === newId)) {
          parsed.links.push({ type, id: newId, note });
        }
      });
    };
    inp.onblur = saveAdd;
    inp.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
    };
  });

  document.querySelectorAll(".contact-worked-remove").forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const contactId = btn.dataset.contactId;
      const index = parseInt(btn.dataset.index, 10);
      await patchContactWorkedLinks(contactId, parsed => {
        parsed.links.splice(index, 1);
      });
    };
  });

  document.querySelectorAll(".contact-worked-pill").forEach(btn => {
    btn.onclick = () => {
      const contactId = btn.dataset.contactId;
      const index = btn.dataset.index;
      const editSel = document.querySelector(`.contact-worked-edit[data-contact-id="${contactId}"][data-index="${index}"]`);
      if (!editSel) return;
      btn.style.display = "none";
      editSel.style.display = "";
      editSel.focus();
    };
  });

  document.querySelectorAll(".contact-worked-edit").forEach(sel => {
    sel.onchange = async () => {
      const contactId = sel.dataset.contactId;
      const index = parseInt(sel.dataset.index, 10);
      const [type, idStr] = sel.value.split(":");
      const newId = parseInt(idStr, 10);
      await patchContactWorkedLinks(contactId, parsed => {
        const link = parsed.links[index];
        if (!link) return;
        link.type = type;
        link.id = newId;
      });
    };
    sel.onblur = () => {
      const contactId = sel.dataset.contactId;
      const index = sel.dataset.index;
      const pill = document.querySelector(`.contact-worked-pill[data-contact-id="${contactId}"][data-index="${index}"]`);
      sel.style.display = "none";
      if (pill) pill.style.display = "";
    };
  });

  document.querySelectorAll(".contact-worked-note-input").forEach(inp => {
    const saveNote = async () => {
      const contactId = inp.dataset.contactId;
      const index = parseInt(inp.dataset.index, 10);
      const note = inp.value.trim();
      await patchContactWorkedLinks(contactId, parsed => {
        const link = parsed.links[index];
        if (!link) return;
        link.note = note;
      });
    };
    inp.onblur = saveNote;
    inp.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
    };
  });
}

// --- Team (Slack-style workspace) -----------------------------------------

const TEAM_PERMISSIONS = ["viewer", "editor", "admin"];
let TEAM_UI = { showInvite: false, showAddChannel: false, showEditMember: false };

// UI-only role enforcement. The local API is single-user and does not authenticate —
// these checks mirror intended permissions but are not a security boundary.
function teamOwnerMember(members) {
  const admins = members.filter(m => m.permission === "admin")
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return admins[0] || null;
}

function teamCurrentMember(members) {
  return teamOwnerMember(members) || members[0] || null;
}

function teamPermissionBadge(permission) {
  const p = permission || "viewer";
  const colors = { admin: "#7c4dff", editor: "#1976d2", viewer: "#757575" };
  return `<span class="pill" style="font-size:11px; border-color:${colors[p] || colors.viewer}; color:${colors[p] || colors.viewer};">${escapeHtml(p)}</span>`;
}

function teamCanChangePermission(editor, target, members) {
  if (!editor || editor.permission !== "admin") return false;
  const owner = teamOwnerMember(members);
  if (owner && target.id === owner.id) return false;
  return editor.id !== target.id || editor.permission === "admin";
}

function teamPermissionSelectTitle(editor, target, members) {
  if (!editor || editor.permission !== "admin") {
    return "Only admins can change permissions";
  }
  const owner = teamOwnerMember(members);
  if (owner && target.id === owner.id) {
    return "The workspace owner cannot be demoted";
  }
  return "";
}

function teamAccountHeaderHtml(members) {
  const me = teamCurrentMember(members);
  if (!me) return "";
  return `<div class="team-account-header card" style="margin-bottom:10px; padding:10px 14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
    ${teamAvatarHtml(me.name, { size: 36 })}
    <div style="flex:1; min-width:0;">
      <div style="font-weight:600; font-size:14px;">${escapeHtml(me.name)}</div>
      <div class="stub" style="font-size:12px;">${escapeHtml(me.email || "no email")} · ${escapeHtml(me.role || "Teammate")}</div>
    </div>
    ${teamPermissionBadge(me.permission)}
    <span class="stub" style="font-size:11px;">Your account</span>
  </div>`;
}

function teamIsSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function teamFormatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  if (teamIsSameDay(d, now)) return `${Math.floor(min / 60)}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (teamIsSameDay(d, yesterday)) return "yesterday";
  const days = Math.floor(sec / 86400);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function teamHashColor(name) {
  let hash = 0;
  const s = String(name || "?");
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 52%, 42%)`;
}

function teamInitials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function teamGetSelection(members, channels) {
  try {
    const raw = localStorage.getItem("teamSelection");
    if (!raw) return null;
    const sel = JSON.parse(raw);
    if (sel.type === "channel" && channels.some(c => c.id === sel.id)) return sel;
    if (sel.type === "dm" && members.some(m => m.id === sel.id)) return sel;
  } catch (_) { /* ignore */ }
  return null;
}

function teamSetSelection(sel) {
  localStorage.setItem("teamSelection", JSON.stringify(sel));
}

function teamDefaultSelection(members, channels) {
  if (channels.length) return { type: "channel", id: channels[0].id };
  if (members.length) return { type: "dm", id: members[0].id };
  return null;
}

function teamResolveSelection(members, channels) {
  return teamGetSelection(members, channels) || teamDefaultSelection(members, channels);
}

function teamMemberById(members, id) {
  return members.find(m => m.id === id) || null;
}

function teamChannelById(channels, id) {
  return channels.find(c => c.id === id) || null;
}

function teamMessageBodyHtml(body) {
  return escapeHtml(body || "").replace(/\n/g, "<br>");
}

function teamAvatarHtml(name, { size = 28, dot = true } = {}) {
  const color = teamHashColor(name);
  return `<span class="team-avatar" style="width:${size}px;height:${size}px;background:${color};" title="${escapeHtml(name)}">
    ${dot ? `<span class="team-presence-dot"></span>` : ""}
    <span class="team-avatar-initials">${escapeHtml(teamInitials(name))}</span>
  </span>`;
}

function teamMessagesHtml(messages) {
  if (!messages.length) {
    return `<div class="team-empty-messages">
      <div class="team-empty-messages-title">No messages yet</div>
      <p class="stub">Say hello, log a decision, or share a plan link below.</p>
    </div>`;
  }
  let html = "";
  let lastSender = null;
  for (const msg of messages) {
    const sender = msg.sender || "you";
    const grouped = sender === lastSender;
    lastSender = sender;
    html += grouped
      ? `<div class="team-msg team-msg-grouped">
          <div class="team-msg-body">${teamMessageBodyHtml(msg.body)}</div>
        </div>`
      : `<div class="team-msg">
          <div class="team-msg-meta">
            <strong>${escapeHtml(sender)}</strong>
            <span class="stub">${escapeHtml(teamFormatRelativeTime(msg.created_at))}</span>
          </div>
          <div class="team-msg-body">${teamMessageBodyHtml(msg.body)}</div>
        </div>`;
  }
  return html;
}

function teamWorkspaceStyles() {
  return `<style>
    .team-workspace { display:flex; gap:0; min-height:520px; border:1px solid var(--gridline); border-radius:10px; overflow:hidden; background:var(--bg-card); }
    .team-rail { width:240px; flex-shrink:0; border-right:1px solid var(--gridline); display:flex; flex-direction:column; background:color-mix(in srgb, var(--bg-shell) 70%, var(--bg-card)); }
    .team-rail-section {
      padding:10px 10px 6px; font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase;
      color:var(--ink-secondary); display:flex; align-items:center; gap:8px;
    }
    .team-rail-section::before {
      content:""; width:3px; height:12px; border-radius:1px; background:var(--accent); flex-shrink:0;
    }
    .team-rail-list { overflow-y:auto; flex:1; padding:0 6px 8px; }
    .team-rail-item { display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:none; background:transparent; padding:6px 8px; border-radius:8px; cursor:pointer; font-size:13px; color:var(--ink-primary); }
    .team-rail-item:hover { background:color-mix(in srgb, var(--accent) 8%, transparent); }
    .team-rail-item-active { background:color-mix(in srgb, var(--accent) 14%, transparent); font-weight:600; }
    .team-rail-item .team-channel-hash { color:var(--ink-muted); margin-right:2px; }
    .team-rail-actions { padding:8px; border-top:1px solid var(--gridline); }
    .team-inline-form { padding:8px; border-top:1px solid var(--gridline); display:flex; flex-direction:column; gap:6px; }
    .team-inline-form input, .team-inline-form select { font-size:12px; width:100%; }
    .team-main { flex:1; display:flex; flex-direction:column; min-width:0; }
    .team-header { padding:10px 14px; border-bottom:1px solid var(--gridline); display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .team-header-title { font-weight:600; font-size:15px; }
    .team-header-meta { font-size:12px; color:var(--ink-secondary); }
    .team-header-actions { margin-left:auto; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .team-edit-panel { width:100%; margin-top:8px; padding-top:8px; border-top:1px solid var(--gridline); display:flex; flex-direction:column; gap:6px; }
    .team-edit-panel input, .team-edit-panel select { font-size:12px; }
    .team-messages { flex:1; overflow-y:auto; padding:12px 14px; display:flex; flex-direction:column; gap:2px; }
    .team-msg { padding:2px 0 6px; }
    .team-msg-grouped { padding-top:0; margin-top:-2px; }
    .team-msg-meta { display:flex; align-items:baseline; gap:8px; margin-bottom:2px; font-size:13px; }
    .team-msg-body { font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .team-composer { border-top:1px solid var(--gridline); padding:10px 12px; display:flex; gap:8px; align-items:flex-end; }
    .team-composer textarea { flex:1; min-height:44px; max-height:140px; resize:vertical; font-size:13px; line-height:1.45; }
    .team-composer-tools { display:flex; flex-direction:column; gap:6px; }
    .team-avatar { position:relative; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; flex-shrink:0; color:#fff; font-size:10px; font-weight:700; letter-spacing:0.02em; }
    .team-presence-dot { position:absolute; bottom:-1px; right:-1px; width:8px; height:8px; border-radius:50%; background:#3dd68c; border:2px solid var(--bg-card); }
    .team-empty-messages { margin:auto; text-align:center; padding:24px 16px; max-width:320px; }
    .team-empty-messages-title { font-weight:600; margin-bottom:4px; }
    .team-hero { text-align:center; padding:36px 20px 28px; }
    .team-hero h2 { margin:0 0 8px; font-size:22px; }
    .team-hero p { margin:0 auto 18px; max-width:420px; }
    .team-hero-form { max-width:360px; margin:0 auto; text-align:left; display:flex; flex-direction:column; gap:8px; }
  </style>`;
}

function teamInviteFormHtml({ idPrefix = "team-invite", compact = false } = {}) {
  const sendRow = compact
    ? `<label style="font-size:12px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="${idPrefix}-send-invite" checked> Send invite email</label>`
    : `<label style="font-size:13px; display:flex; gap:6px; align-items:center; justify-content:center;"><input type="checkbox" id="${idPrefix}-send-invite" checked> Send invite email if address provided</label>`;
  return `
    <input type="text" id="${idPrefix}-name" placeholder="Name">
    <input type="email" id="${idPrefix}-email" placeholder="Email">
    <input type="text" id="${idPrefix}-role" placeholder="Role (optional)">
    ${sendRow}
    <div style="display:flex; gap:6px;">
      <button class="primary ${idPrefix}-submit" type="button" style="flex:1;">Add teammate</button>
      ${compact ? `<button class="secondary ${idPrefix}-cancel" type="button">Cancel</button>` : ""}
    </div>`;
}

function teamHeroHtml() {
  return `
    ${teamWorkspaceStyles()}
    <div class="card team-hero">
      <h2>Build your team</h2>
      <p class="stub">Invite collaborators to chat in channels, swap direct messages, and share planning links — all in one workspace.</p>
      <div class="team-hero-form card" style="padding:14px;">
        ${teamInviteFormHtml({ idPrefix: "team-hero-invite" })}
      </div>
    </div>`;
}

function teamLeftRailHtml(members, channels, selection) {
  const channelItems = channels.map(c => {
    const active = selection?.type === "channel" && selection.id === c.id;
    return `<button type="button" class="team-rail-item team-select-channel ${active ? "team-rail-item-active" : ""}" data-id="${c.id}">
      <span class="team-channel-hash">#</span><span>${escapeHtml(c.name)}</span>
    </button>`;
  }).join("");

  const dmItems = members.map(m => {
    const active = selection?.type === "dm" && selection.id === m.id;
    return `<button type="button" class="team-rail-item team-select-dm ${active ? "team-rail-item-active" : ""}" data-id="${m.id}">
      ${teamAvatarHtml(m.name, { size: 24 })}
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(m.name)}</span>
    </button>`;
  }).join("");

  const addChannelForm = TEAM_UI.showAddChannel
    ? `<div class="team-inline-form team-add-channel-form">
        <input type="text" id="team-new-channel-name" placeholder="Channel name">
        <div class="stub" style="font-size:11px;">Members (optional):</div>
        <div style="display:flex; flex-direction:column; gap:4px; max-height:100px; overflow-y:auto;">
          ${members.map(m => `<label style="font-size:12px; display:flex; gap:6px; align-items:center;"><input type="checkbox" class="team-new-channel-member" value="${m.id}"> ${escapeHtml(m.name)}</label>`).join("")}
        </div>
        <div style="display:flex; gap:6px;">
          <button class="primary" type="button" id="team-create-channel" style="flex:1;">Create</button>
          <button class="secondary" type="button" id="team-cancel-channel">Cancel</button>
        </div>
      </div>`
    : "";

  const inviteForm = TEAM_UI.showInvite
    ? `<div class="team-inline-form">${teamInviteFormHtml({ idPrefix: "team-rail-invite", compact: true })}</div>`
    : "";

  return `
    <aside class="team-rail">
      <div class="team-rail-section">Channels</div>
      <div class="team-rail-list">${channelItems || '<p class="stub" style="padding:6px 8px; font-size:12px;">No channels yet.</p>'}</div>
      <div class="team-rail-actions">
        <button type="button" class="secondary" id="team-toggle-add-channel" style="width:100%; font-size:12px;">+ add channel</button>
      </div>
      ${addChannelForm}
      <div class="team-rail-section" style="margin-top:4px;">Direct messages</div>
      <div class="team-rail-list">${dmItems}</div>
      <div class="team-rail-actions">
        <button type="button" class="secondary" id="team-toggle-invite" style="width:100%; font-size:12px;">+ invite teammate</button>
      </div>
      ${inviteForm}
    </aside>`;
}

function teamHeaderHtml(selection, members, channels) {
  if (!selection) return `<div class="team-header"><span class="stub">Select a conversation</span></div>`;

  const me = teamCurrentMember(members);

  if (selection.type === "channel") {
    const channel = teamChannelById(channels, selection.id);
    if (!channel) return `<div class="team-header"><span class="stub">Channel not found</span></div>`;
    const count = (channel.members || []).length;
    return `<div class="team-header">
      <div>
        <div class="team-header-title"><span class="team-channel-hash">#</span>${escapeHtml(channel.name)}</div>
        <div class="team-header-meta">${count} member${count === 1 ? "" : "s"}</div>
      </div>
    </div>`;
  }

  const member = teamMemberById(members, selection.id);
  if (!member) return `<div class="team-header"><span class="stub">Member not found</span></div>`;
  const canEditPerm = teamCanChangePermission(me, member, members);
  const permTitle = teamPermissionSelectTitle(me, member, members);
  const editPanel = TEAM_UI.showEditMember
    ? `<div class="team-edit-panel">
        <input type="text" id="team-edit-name" value="${escapeHtml(member.name || "").replace(/"/g, "&quot;")}" placeholder="Name">
        <input type="email" id="team-edit-email" value="${escapeHtml(member.email || "").replace(/"/g, "&quot;")}" placeholder="Email">
        <input type="text" id="team-edit-role" value="${escapeHtml(member.role || "").replace(/"/g, "&quot;")}" placeholder="Role">
        <select id="team-edit-permission" ${canEditPerm ? "" : `disabled title="${escapeHtml(permTitle)}"`}>
          ${TEAM_PERMISSIONS.map(p => `<option value="${escapeHtml(p)}" ${member.permission === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
        ${!canEditPerm ? `<p class="stub" style="font-size:11px; margin:0;">${escapeHtml(permTitle)}</p>` : ""}
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="primary" type="button" id="team-save-member">Save</button>
          <button class="secondary" type="button" id="team-invite-member" ${member.email ? "" : "disabled title=\"add an email first\""}>Send invite</button>
          <button class="secondary" type="button" id="team-remove-member" style="color:#e53935;">Remove member</button>
          <button class="secondary" type="button" id="team-cancel-edit">Cancel</button>
        </div>
      </div>`
    : "";

  return `<div class="team-header">
    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; flex-wrap:wrap;">
      ${teamAvatarHtml(member.name, { size: 32 })}
      <div style="min-width:0;">
        <div class="team-header-title">${escapeHtml(member.name)}</div>
        <div class="team-header-meta">${escapeHtml(member.role || "Teammate")}</div>
      </div>
      <div class="team-header-actions">
        <button type="button" class="secondary" id="team-toggle-edit-member" style="font-size:12px;">Edit member</button>
      </div>
    </div>
    ${editPanel}
  </div>`;
}

function teamComposerHtml() {
  const today = localYmd();
  const shareTitle = `Inserts a link to today's plan (?date=${today}) that opens that day when shared`;
  return `<div class="team-composer">
    <textarea id="team-composer-input" placeholder="Message… (Enter to send, Shift+Enter for newline)" rows="2"></textarea>
    <div class="team-composer-tools">
      <button type="button" class="secondary" id="team-share-plan" title="${escapeHtml(shareTitle)}" style="font-size:11px; padding:4px 8px;">Share today's plan (link)</button>
      <button type="button" class="primary" id="team-send-message" style="font-size:12px;">Send</button>
    </div>
  </div>`;
}

function teamMainPaneHtml(messages, selection, members, channels) {
  return `<section class="team-main">
    ${teamHeaderHtml(selection, members, channels)}
    <div class="team-messages" id="team-messages-scroll">${teamMessagesHtml(messages)}</div>
    ${selection ? teamComposerHtml() : ""}
  </section>`;
}

async function teamFetchMessages(selection) {
  if (!selection) return [];
  if (selection.type === "channel") return api(`/api/team/channels/${selection.id}/messages`);
  return api(`/api/team/${selection.id}/messages`);
}

async function teamSubmitInvite(idPrefix, { onSuccess } = {}) {
  const name = document.getElementById(`${idPrefix}-name`)?.value.trim();
  const email = document.getElementById(`${idPrefix}-email`)?.value.trim();
  const role = document.getElementById(`${idPrefix}-role`)?.value.trim();
  const sendInvite = document.getElementById(`${idPrefix}-send-invite`)?.checked;
  if (!name) return;
  const result = await api("/api/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email: email || null, role: role || null }),
  });
  if (sendInvite && email && result.id) {
    try {
      await api(`/api/team/${result.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: "viewer" }),
      });
    } catch (err) {
      window.alert(errorMessage(err));
    }
  }
  teamSetSelection({ type: "dm", id: result.id });
  TEAM_UI.showInvite = false;
  if (onSuccess) onSuccess();
  else render();
}

function teamScrollToBottom() {
  const box = document.getElementById("team-messages-scroll");
  if (box) box.scrollTop = box.scrollHeight;
}

async function teamRefreshMessages(selection) {
  const box = document.getElementById("team-messages-scroll");
  if (!box || !selection) return;
  const messages = await teamFetchMessages(selection);
  box.innerHTML = teamMessagesHtml(messages);
  teamScrollToBottom();
}

async function renderTeam() {
  const [members, channels] = await Promise.all([
    api("/api/team"),
    api("/api/team/channels"),
  ]);

  if (!members.length) {
    TEAM_UI.showInvite = false;
    TEAM_UI.showAddChannel = false;
    TEAM_UI.showEditMember = false;
    return teamHeroHtml();
  }

  const selection = teamResolveSelection(members, channels);
  if (selection) teamSetSelection(selection);
  const messages = await teamFetchMessages(selection);

  return `
    ${teamWorkspaceStyles()}
    ${teamAccountHeaderHtml(members)}
    <div class="team-workspace" data-selection-type="${selection?.type || ""}" data-selection-id="${selection?.id || ""}">
      ${teamLeftRailHtml(members, channels, selection)}
      ${teamMainPaneHtml(messages, selection, members, channels)}
    </div>`;
}

function wireTeam() {
  const workspace = document.querySelector(".team-workspace");
  if (!workspace) {
    const heroSubmit = document.querySelector(".team-hero-invite-submit");
    if (heroSubmit) {
      heroSubmit.onclick = () => teamSubmitInvite("team-hero-invite");
      document.getElementById("team-hero-invite-name")?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); teamSubmitInvite("team-hero-invite"); }
      });
    }
    return;
  }

  const selection = {
    type: workspace.dataset.selectionType,
    id: Number(workspace.dataset.selectionId),
  };

  teamScrollToBottom();

  document.querySelectorAll(".team-select-channel").forEach(btn => {
    btn.onclick = () => {
      teamSetSelection({ type: "channel", id: Number(btn.dataset.id) });
      TEAM_UI.showEditMember = false;
      render();
    };
  });

  document.querySelectorAll(".team-select-dm").forEach(btn => {
    btn.onclick = () => {
      teamSetSelection({ type: "dm", id: Number(btn.dataset.id) });
      TEAM_UI.showEditMember = false;
      render();
    };
  });

  const toggleInvite = document.getElementById("team-toggle-invite");
  if (toggleInvite) {
    toggleInvite.onclick = () => {
      TEAM_UI.showInvite = !TEAM_UI.showInvite;
      TEAM_UI.showAddChannel = false;
      render();
    };
  }

  const toggleChannel = document.getElementById("team-toggle-add-channel");
  if (toggleChannel) {
    toggleChannel.onclick = () => {
      TEAM_UI.showAddChannel = !TEAM_UI.showAddChannel;
      TEAM_UI.showInvite = false;
      render();
    };
  }

  document.getElementById("team-cancel-channel")?.addEventListener("click", () => {
    TEAM_UI.showAddChannel = false;
    render();
  });

  document.getElementById("team-create-channel")?.addEventListener("click", async () => {
    const name = document.getElementById("team-new-channel-name")?.value.trim();
    if (!name) return;
    const memberIds = Array.from(document.querySelectorAll(".team-new-channel-member:checked")).map(cb => Number(cb.value));
    const channel = await api("/api/team/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, member_ids: memberIds }),
    });
    TEAM_UI.showAddChannel = false;
    teamSetSelection({ type: "channel", id: channel.id });
    render();
  });

  document.querySelector(".team-rail-invite-submit")?.addEventListener("click", () => {
    teamSubmitInvite("team-rail-invite");
  });
  document.querySelector(".team-rail-invite-cancel")?.addEventListener("click", () => {
    TEAM_UI.showInvite = false;
    render();
  });

  const toggleEdit = document.getElementById("team-toggle-edit-member");
  if (toggleEdit) {
    toggleEdit.onclick = () => {
      TEAM_UI.showEditMember = !TEAM_UI.showEditMember;
      render();
    };
  }

  document.getElementById("team-cancel-edit")?.addEventListener("click", () => {
    TEAM_UI.showEditMember = false;
    render();
  });

  document.getElementById("team-save-member")?.addEventListener("click", async () => {
    if (selection.type !== "dm") return;
    const members = await api("/api/team");
    const me = teamCurrentMember(members);
    const target = teamMemberById(members, selection.id);
    const payload = {
      name: document.getElementById("team-edit-name")?.value.trim(),
      email: document.getElementById("team-edit-email")?.value.trim() || null,
      role: document.getElementById("team-edit-role")?.value.trim() || null,
    };
    const permSel = document.getElementById("team-edit-permission");
    if (permSel && !permSel.disabled && teamCanChangePermission(me, target, members)) {
      payload.permission = permSel.value;
    }
    await api(`/api/team/${selection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    TEAM_UI.showEditMember = false;
    render();
  });

  document.getElementById("team-invite-member")?.addEventListener("click", async () => {
    if (selection.type !== "dm") return;
    const btn = document.getElementById("team-invite-member");
    const permission = document.getElementById("team-edit-permission")?.value || "viewer";
    try {
      const result = await runCancellable(btn, "Sending...", signal => api(`/api/team/${selection.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission }),
        signal,
      }));
      if (result.error) window.alert(result.error);
      else window.alert(`Invite sent via ${result.sent_via}.`);
      await teamRefreshMessages(selection);
    } catch (err) {
      window.alert(errorMessage(err));
    }
  });

  document.getElementById("team-remove-member")?.addEventListener("click", async () => {
    if (selection.type !== "dm") return;
    if (!window.confirm("Remove this team member? Their message log goes with them.")) return;
    localStorage.removeItem("teamSelection");
    await api(`/api/team/${selection.id}`, { method: "DELETE" });
    TEAM_UI.showEditMember = false;
    render();
  });

  const composer = document.getElementById("team-composer-input");
  const sendBtn = document.getElementById("team-send-message");
  const shareBtn = document.getElementById("team-share-plan");

  async function teamSendMessage() {
    if (!composer || !selection?.type || !selection.id) return;
    const body = composer.value.trim();
    if (!body) return;
    if (selection.type === "channel") {
      await api(`/api/team/channels/${selection.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, sender: "you" }),
      });
    } else {
      await api(`/api/team/${selection.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    }
    composer.value = "";
    await teamRefreshMessages(selection);
  }

  if (sendBtn) sendBtn.onclick = teamSendMessage;

  if (composer) {
    composer.onkeydown = e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        teamSendMessage();
      }
    };
  }

  if (shareBtn) {
    shareBtn.onclick = () => {
      if (!composer) return;
      const today = localYmd();
      const base = window.location.origin || "";
      const link = `${base}/?date=${today}`;
      const snippet = `Here's my plan for today — take a look:\n${link}`;
      composer.value = composer.value ? `${composer.value}\n\n${snippet}` : snippet;
      composer.focus();
    };
  }
}
