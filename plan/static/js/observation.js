// Observation widget: quote a slice of an answer, attach images, send to GitHub.

let OBS_OPEN = false;
let OBS_QUOTE = "";
let OBS_DRAFT_IDS = [];
let OBS_STYLES = false;

function observationEnsureDom() {
  if (document.getElementById("obs-fab")) return;
  const fab = document.createElement("button");
  fab.type = "button";
  fab.id = "obs-fab";
  fab.className = "obs-fab";
  fab.title = "Quote a slice of the UI or an answer and send a fix to GitHub";
  fab.textContent = "Observe";
  fab.addEventListener("click", () => {
    OBS_OPEN = !OBS_OPEN;
    if (OBS_OPEN && !OBS_QUOTE) {
      const selected = String(window.getSelection?.()?.toString() || "").trim();
      if (selected) OBS_QUOTE = selected;
    }
    observationRenderPanel();
  });
  const panel = document.createElement("div");
  panel.id = "obs-panel";
  panel.className = "obs-panel";
  panel.hidden = true;
  document.body.appendChild(panel);
  document.body.appendChild(fab);
}

function observationRenderPanel() {
  observationEnsureDom();
  const panel = document.getElementById("obs-panel");
  if (!panel) return;
  panel.hidden = !OBS_OPEN;
  if (!OBS_OPEN) return;
  const quote = OBS_QUOTE || "";
  panel.innerHTML = `
    <h3>Send an observation</h3>
    <p class="stub" style="margin:0 0 8px;">Quote one part of an answer or the UI, describe the fix, attach a screenshot, then send. Waypoint opens a GitHub issue (and creates it if a GitHub token is saved in Settings).</p>
    <label class="stub" for="obs-title">Title</label>
    <input id="obs-title" type="text" maxlength="180" placeholder="Short fix title" value="">
    <div class="stub" style="margin:8px 0 4px;">Quoted slice</div>
    <div class="obs-quote" id="obs-quote">${quote ? escapeHtml(quote) : "Select text in an answer, or paste below."}</div>
    <textarea id="obs-quote-edit" rows="3" placeholder="Or paste the slice here">${escapeHtml(quote)}</textarea>
    <label class="stub" for="obs-note" style="display:block;margin-top:8px;">What should change</label>
    <textarea id="obs-note" rows="4" placeholder="The fix you want relayed"></textarea>
    <div class="obs-actions">
      <input id="obs-files" type="file" accept="image/*" multiple aria-label="Attach images">
      <button type="button" class="secondary" id="obs-use-selection">Use current selection</button>
    </div>
    <div class="obs-thumbs" id="obs-thumbs"></div>
    <div class="obs-actions">
      <button type="button" class="primary" id="obs-send">Send to GitHub</button>
      <button type="button" class="secondary" id="obs-copy">Copy quote</button>
      <button type="button" class="secondary" id="obs-close">Close</button>
    </div>
    <p class="stub" id="obs-status" style="margin:8px 0 0;"></p>
  `;
  document.getElementById("obs-close").onclick = () => { OBS_OPEN = false; observationRenderPanel(); };
  document.getElementById("obs-copy").onclick = () => {
    const text = document.getElementById("obs-quote-edit")?.value || OBS_QUOTE;
    if (typeof copyToClipboard === "function") copyToClipboard(text);
    else navigator.clipboard?.writeText(text);
  };
  document.getElementById("obs-use-selection").onclick = () => {
    const selected = String(window.getSelection?.()?.toString() || "").trim();
    if (!selected) {
      showToast("Select some text first", "warn");
      return;
    }
    OBS_QUOTE = selected;
    const edit = document.getElementById("obs-quote-edit");
    const box = document.getElementById("obs-quote");
    if (edit) edit.value = selected;
    if (box) box.textContent = selected;
  };
  document.getElementById("obs-send").onclick = () => observationSend();
}

async function observationUploadFiles(observationId, files) {
  const ids = [];
  for (const file of files) {
    if (!file || !file.size) continue;
    const form = new FormData();
    form.append("file", file);
    form.append("entity_type", "observation");
    form.append("entity_id", String(observationId));
    const uploaded = await api("/api/attachments", { method: "POST", body: form });
    if (uploaded?.id) ids.push(uploaded.id);
  }
  return ids;
}

async function observationSend() {
  const title = (document.getElementById("obs-title")?.value || "").trim() || "Waypoint observation";
  const quote = (document.getElementById("obs-quote-edit")?.value || OBS_QUOTE || "").trim();
  const note = (document.getElementById("obs-note")?.value || "").trim();
  const files = [...(document.getElementById("obs-files")?.files || [])];
  const status = document.getElementById("obs-status");
  if (!quote && !note) {
    showToast("Add a quote or a fix note", "warn");
    return;
  }
  const sendBtn = document.getElementById("obs-send");
  if (sendBtn) sendBtn.disabled = true;
  if (status) status.textContent = "Sending…";
  try {
    const created = await api("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        quote,
        note,
        tab: typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "",
      }),
    });
    if (files.length && created?.id) {
      await observationUploadFiles(created.id, files);
    }
    const url = created.github_url;
    if (url) {
      window.open(url, "_blank", "noopener");
    }
    const msg = created.opened_existing_issue
      ? `Opened GitHub issue #${created.github_issue}`
      : (created.github_create_error
        ? `Saved locally — GitHub API: ${created.github_create_error}. Opened the new-issue form.`
        : "Saved and opened GitHub new-issue form");
    showToast(msg, created.opened_existing_issue ? "good" : "success");
    if (status) status.textContent = msg;
    OBS_QUOTE = "";
    OBS_OPEN = false;
    observationRenderPanel();
  } catch (err) {
    showToast(errorMessage(err), "error");
    if (status) status.textContent = errorMessage(err);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function observationQuote(text) {
  OBS_QUOTE = String(text || "").trim();
  OBS_OPEN = true;
  observationRenderPanel();
  const edit = document.getElementById("obs-quote-edit");
  if (edit) edit.value = OBS_QUOTE;
}

function observationBoot() {
  /* Napkin stays; Observe FAB is retired. */
}

window.WaypointObservation = { quote: () => {}, open: () => {} };
document.addEventListener("DOMContentLoaded", observationBoot);
