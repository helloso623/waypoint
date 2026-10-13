/* Remaining napkin items: recovery, paste, observe-off, voice review, HUD, game, calendar polish. */
(function () {
  const PREF = {
    gameOff: "waypointGameOff",
    spell: "waypointSpellcheck",
    density: "napkinDensity",
    hourDiv: "hourSplitMinutes",
    paletteBlock: "waypointBlockAutoPalette",
    splashSeen: "waypointSplashSeen",
  };

  function pref(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }
  function setPref(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function bootSplash() {
    if (document.getElementById("wp-boot-splash")) return;
    const el = document.createElement("div");
    el.id = "wp-boot-splash";
    el.className = "wp-boot-splash";
    el.innerHTML = `<div class="wp-boot-mark" aria-hidden="true">
      <svg width="56" height="56" viewBox="0 0 96 96"><path d="M16 72 L48 24 L80 72" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="24" r="8" fill="currentColor"/></svg>
    </div><p>Waypoint</p><span>Loading…</span>`;
    document.body.appendChild(el);
    const hide = () => {
      el.classList.add("wp-boot-splash-out");
      setTimeout(() => el.remove(), 420);
    };
    window.addEventListener("load", () => setTimeout(hide, 480));
    setTimeout(hide, 2200);
  }

  function closeStrayPalettes() {
    document.querySelectorAll(".command-palette-overlay").forEach(node => {
      const label = node.querySelector("[role=dialog]")?.getAttribute("aria-label") || "";
      if (/command palette/i.test(label) && !node.dataset.userOpened) node.remove();
    });
  }

  function snapshotRecovery() {
    const payload = {
      tab: typeof ACTIVE_TAB !== "undefined" ? ACTIVE_TAB : "",
      agent: document.getElementById("agent-input")?.value || "",
      companion: document.getElementById("companion-input")?.value || "",
      napkin: pref("waypointNapkin", ""),
      captureDraft: pref("waypointCaptureDraftV1", ""),
      boards: pref("waypointBoardsV1", ""),
      hourDiv: pref(PREF.hourDiv, "30"),
      todayWeekMode: pref("todayWeekMode", ""),
      at: Date.now(),
    };
    try { localStorage.setItem("waypointRecoveryV1", JSON.stringify(payload)); } catch (_) {}
    if (typeof api === "function") {
      api("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "ui", payload }),
      }).catch(() => {});
    }
  }

  async function offerRestore() {
    let snap = null;
    try { snap = JSON.parse(localStorage.getItem("waypointRecoveryV1") || "null"); } catch (_) {}
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem("waypointCaptureDraftV1") || "null"); } catch (_) {}
    const hasWriting = !!(snap && (snap.agent || snap.companion));
    const hasDraft = !!(draft && (draft.title || draft.details) && Date.now() - (draft.at || 0) < 36 * 3600 * 1000);
    if ((!hasWriting && !hasDraft) || (snap && Date.now() - (snap.at || 0) > 36 * 3600 * 1000 && !hasDraft)) return;
    if (document.getElementById("wp-restore-banner")) return;
    const bar = document.createElement("div");
    bar.id = "wp-restore-banner";
    bar.className = "wp-restore-banner";
    bar.innerHTML = `<span>Recover in-progress writing from last session?</span>
      <button type="button" class="primary" id="wp-restore-yes">Restore</button>
      <button type="button" class="ghost" id="wp-restore-no">Dismiss</button>`;
    document.body.appendChild(bar);
    document.getElementById("wp-restore-yes").onclick = () => {
      const agent = document.getElementById("agent-input");
      const companion = document.getElementById("companion-input");
      if (agent && snap?.agent) agent.value = snap.agent;
      if (companion && snap?.companion) companion.value = snap.companion;
      if (hasDraft && typeof openQuickCapture === "function") {
        openQuickCapture({
          type: draft.type || "feedback",
          title: draft.title || "",
          details: draft.details || "",
        });
      }
      bar.remove();
      if (typeof showToast === "function") showToast("Restored unsaved writing", "good");
    };
    document.getElementById("wp-restore-no").onclick = () => {
      bar.remove();
      try { localStorage.removeItem("waypointRecoveryV1"); } catch (_) {}
    };
  }

  function hideObserve() {
    document.getElementById("obs-fab")?.setAttribute("hidden", "hidden");
    document.getElementById("obs-fab")?.classList.add("wp-observe-hidden");
    const panel = document.getElementById("obs-panel");
    if (panel) panel.hidden = true;
  }

  function applySpellcheck() {
    const on = pref(PREF.spell, "on") !== "off";
    document.documentElement.dataset.spellcheck = on ? "on" : "off";
    document.querySelectorAll("textarea, input[type=text], [contenteditable=true]").forEach(el => {
      if (el.closest(".code, .repo-editor, #code-file-view, #wf-code-editor")) return;
      el.setAttribute("spellcheck", on ? "true" : "false");
    });
  }

  function applyGameOff() {
    const off = pref(PREF.gameOff, "off") === "on" || pref(PREF.gameOff, "0") === "1";
    document.body.classList.toggle("game-off", pref(PREF.gameOff, "off") === "on");
    if (pref(PREF.gameOff, "off") === "on") {
      document.body.classList.add("game-off");
    }
  }

  function applyNapkinDensity() {
    const density = pref(PREF.density, "comfortable");
    document.documentElement.dataset.napkinDensity = density;
  }

  async function pasteImage(file, targetHint) {
    if (!file || !file.type.startsWith("image/")) return false;
    let url = "";
    if (typeof window.wpResolvePastedImage === "function") {
      url = await window.wpResolvePastedImage(file);
    } else {
      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", targetHint || "napkin");
      form.append("entity_id", "0");
      try {
        const res = await fetch("/api/attachments", { method: "POST", body: form });
        const data = await res.json();
        url = data?.url || (data?.id ? `/api/attachments/${data.id}/file` : "");
      } catch (_) {}
      if (!url) {
        url = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }).catch(() => "");
      }
    }
    const md = url ? `![pasted](${url})` : "";
    if (!md) {
      if (typeof showToast === "function") showToast("Could not save pasted image", "warn");
      return false;
    }
    const details = document.getElementById("quick-capture-details");
    if (details) {
      details.value = (details.value ? details.value + "\n" : "") + md;
      details.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (typeof openQuickCapture === "function") {
      openQuickCapture({ type: "feedback", details: md });
    }
    return true;
  }

  function wirePasteAnywhere() {
    document.addEventListener("paste", async (e) => {
      if (window.__wpPasteAnywhere) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          await pasteImage(file, "capture");
          if (typeof openQuickCapture === "function") openQuickCapture({ type: "feedback" });
          return;
        }
      }
    });
  }

  function wireEnterAsDone() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (!t) return;
      if (t.closest("#agent-input, #companion-input, textarea, [contenteditable=true]")) return;
      const questBtn = t.closest("[data-quest-select], .loot-quest-card, .game-quest-claim, #game-claim-daily");
      if (questBtn) {
        e.preventDefault();
        questBtn.click();
        return;
      }
      const happyBtn = t.closest(".pls-h-btn");
      if (happyBtn) {
        e.preventDefault();
        happyBtn.click();
        const submit = document.getElementById("pls-compact-submit") || document.getElementById("pls-submit");
        submit?.click();
        return;
      }
      if (t.id === "metric-notes" || t.classList.contains("happiness-input") || t.closest(".tdy-pulse, #pulse-log, .rit-happiness, .pls-h-row, .pln-pulse-compact")) {
        const done = document.getElementById("pls-compact-submit")
          || document.getElementById("pls-submit")
          || document.getElementById("save-day")
          || document.querySelector("[data-happiness-done], .tdy-pulse-save, #pulse-save");
        if (done) {
          e.preventDefault();
          done.click();
        }
      }
    }, true);
  }

  function wireComposerEnter() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const id = e.target?.id;
      if (id === "agent-input") {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById("agent-send")?.click();
      }
      if (id === "companion-input") {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById("companion-send")?.click();
      }
    }, true);
  }

  function wireRightClickStopPaint() {
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".tdy-hour-cell, .tdy-week-paint-cell, .tdy-canvas, #tdy-week-paint-sheet")) return;
      e.preventDefault();
      if (typeof resetPaintState === "function") resetPaintState();
      if (typeof TDY_PAINT_PHASE !== "undefined") {
        try { TDY_PAINT_PHASE = "idle"; } catch (_) {}
      }
      if (typeof TDY_ARMED_CAT !== "undefined") {
        try { TDY_ARMED_CAT = null; } catch (_) {}
      }
      if (typeof showToast === "function") showToast("Painting stopped", "info");
    });
  }

  function injectTimeMarker() {
    const canvas = document.querySelector(".tdy-hour-canvas, #tdy-hour-canvas, .tdy-canvas");
    if (!canvas || canvas.querySelector(".tdy-now-marker")) return;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const marker = document.createElement("div");
    marker.className = "tdy-now-marker";
    marker.style.top = `${(hour / 24) * 100}%`;
    marker.title = "Now";
    canvas.style.position = canvas.style.position || "relative";
    canvas.appendChild(marker);
  }

  function injectWeekNav() {
    const surface = document.getElementById("tdy-week-surface") || document.querySelector(".tdy-week-surface");
    if (!surface || surface.querySelector(".tdy-week-nav")) return;
    const head = surface.querySelector(".tdy-week-surface-head");
    if (!head) return;
    const nav = document.createElement("div");
    nav.className = "tdy-week-nav";
    nav.innerHTML = `<button type="button" class="secondary" data-week-dir="-1">← Prev week</button>
      <button type="button" class="secondary" data-week-dir="1">Next week →</button>`;
    head.appendChild(nav);
    nav.querySelectorAll("[data-week-dir]").forEach(btn => {
      btn.onclick = async () => {
        const dir = Number(btn.dataset.weekDir);
        if (typeof tryNavigateTodayDate === "function" && typeof CURRENT_DATE !== "undefined") {
          const d = new Date(`${CURRENT_DATE}T12:00:00`);
          d.setDate(d.getDate() + dir * 7);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          await tryNavigateTodayDate(`${y}-${m}-${day}`);
        }
      };
    });
  }

  function injectHourDivisionControl() {
    const palette = document.querySelector(".tdy-cat-palette, #tdy-cat-palette");
    if (!palette || document.getElementById("tdy-hour-div")) return;
    const wrap = document.createElement("label");
    wrap.className = "tdy-hour-div";
    wrap.innerHTML = `Hour split <select id="tdy-hour-div">
      <option value="15">15 min</option>
      <option value="20">20 min</option>
      <option value="30">30 min</option>
      <option value="60">60 min</option>
    </select>`;
    palette.appendChild(wrap);
    const sel = wrap.querySelector("select");
    sel.value = pref(PREF.hourDiv, "30");
    sel.onchange = () => {
      setPref(PREF.hourDiv, sel.value);
      applyHourSplitTicks();
      if (typeof api === "function") {
        api("/api/about", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hour_split_minutes: sel.value }),
        }).catch(() => {});
      }
    };
  }

  function applyHourSplitTicks() {
    const split = pref(PREF.hourDiv, "30");
    document.querySelectorAll(".tdy-hour-cell, .tdy-week-paint-cell").forEach(cell => {
      cell.dataset.split = split;
    });
    document.documentElement.dataset.hourSplit = split;
  }

  function compactHud() {
    document.body.classList.add("wp-hud-compact");
    const metrics = document.getElementById("hud-metrics-detail");
    if (metrics && !metrics.hidden) {
      /* keep collapsed by default — user expands the status pill */
    }
  }

  async function autoQuests() {
    const game = window.WaypointGame;
    if (!game || typeof game.selectQuest !== "function") return;
    const state = typeof game.getState === "function" ? game.getState() : null;
    const selected = state?.questsToday || state?.selected || [];
    const keys = new Set((Array.isArray(selected) ? selected : []).map(item => item.key || item));
    const daily = ["estimate1", "actual1"];
    if (!selected.length) daily.unshift("paint6", "tasks3", "pulse2");
    daily.forEach(key => {
      if (keys.has(key)) return;
      try { game.selectQuest(key); } catch (_) {}
    });
    if (document.querySelector(".wp-quest-banner")) return;
    const toast = document.createElement("div");
    toast.className = "wp-quest-banner";
    toast.textContent = "Daily quests are on — paint, estimate time, log how long it took.";
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("wp-quest-banner-out"), 3200);
    setTimeout(() => toast.remove(), 3800);
  }

  function openTimeGame(kind) {
    document.getElementById("wp-time-game")?.remove();
    const modal = document.createElement("div");
    modal.id = "wp-time-game";
    modal.className = "wp-time-game";
    const actualField = kind === "actual"
      ? `<label>Minutes it actually took <input type="number" id="wp-time-actual" min="1" step="1" required></label>`
      : "";
    modal.innerHTML = `<form class="wp-time-game-card">
      <strong>${kind === "actual" ? "Time-taken game" : "Estimate game"}</strong>
      <p class="stub">Daily minigame — recorded so estimates get sharper.</p>
      <label>Task <input type="text" id="wp-time-title" required placeholder="Which task?"></label>
      <label>Estimate (minutes) <input type="number" id="wp-time-est" min="1" step="1" required></label>
      ${actualField}
      <div class="wp-time-game-actions">
        <button type="submit" class="primary">Log</button>
        <button type="button" class="ghost" id="wp-time-cancel">Cancel</button>
      </div>
    </form>`;
    document.body.appendChild(modal);
    modal.querySelector("#wp-time-cancel").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
    modal.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const title = modal.querySelector("#wp-time-title").value.trim();
      const estimated = Number(modal.querySelector("#wp-time-est").value);
      const actual = kind === "actual" ? Number(modal.querySelector("#wp-time-actual").value) : null;
      try {
        await api("/api/tasks/time-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            estimated_minutes: estimated || null,
            actual_minutes: actual || null,
            kind,
          }),
        });
        if (window.WaypointGame?.questProgress) {
          window.WaypointGame.questProgress(kind === "actual" ? "actual1" : "estimate1");
        }
        if (typeof showToast === "function") showToast("Logged — estimates get sharper over time", "good");
        modal.remove();
      } catch (err) {
        if (typeof showToast === "function") showToast(errorMessage(err), "warn");
      }
    };
    modal.querySelector("#wp-time-title")?.focus();
  }

  function scribbleToPlace(details) {
    const text = String(details || "").trim();
    if (!text) return false;
    return /^(doodle|scribble|sketch|drawing)\b/i.test(text) || text.length < 12;
  }

  window.WaypointNapkinComplete = {
    snapshotRecovery,
    applySpellcheck,
    applyGameOff,
    applyNapkinDensity,
    goBackLevel,
    scribbleToPlace,
    hideObserve,
    openTimeGame,
    PREF,
    pref,
    setPref,
  };

  function compactRarityFilters() {
    const nav = document.querySelector(".loot-skin-filters");
    if (!nav || nav.dataset.compact === "1") return;
    nav.dataset.compact = "1";
    const buttons = [...nav.querySelectorAll("button[data-locker-filter]")];
    if (buttons.length < 3) return;
    const select = document.createElement("select");
    select.className = "loot-skin-filter-select";
    select.setAttribute("aria-label", "Filter skins");
    buttons.forEach(btn => {
      const opt = document.createElement("option");
      opt.value = btn.dataset.lockerFilter;
      opt.textContent = btn.textContent;
      if (btn.classList.contains("active")) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => {
      const match = buttons.find(b => b.dataset.lockerFilter === select.value);
      match?.click();
    };
    nav.innerHTML = "";
    nav.appendChild(select);
  }

  function goBackLevel() {
    const game = window.WaypointGame;
    if (!game) return;
    const xp = Number(localStorage.getItem("gameXp") || 0);
    if (typeof gameXpForLevel === "function" && typeof gameLevelFromXp === "function") {
      const level = gameLevelFromXp(xp);
      if (level <= 1) return;
      const prev = gameXpForLevel(level) - 1;
      localStorage.setItem("gameXp", String(Math.max(0, prev)));
      if (typeof gameUpdateHud === "function") gameUpdateHud();
      if (typeof showToast === "function") showToast("Stepped back one level", "info");
    }
  }

  function enhanceAgentBugs() {
    const box = document.getElementById("agent-bugs-box");
    if (box) box.classList.add("agc-bugs-inbox");
  }

  function wireTaskBarVisibility() {
    const rail = document.querySelector(".pln-rail, #pln-rail, .tsk-list-shell");
    if (rail) rail.classList.add("tsk-bar-visible");
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootSplash();
    setPref(PREF.paletteBlock, "1");
    closeStrayPalettes();
    hideObserve();
    applySpellcheck();
    applyGameOff();
    applyNapkinDensity();
    compactHud();
    applyHourSplitTicks();
    wirePasteAnywhere();
    wireEnterAsDone();
    wireComposerEnter();
    wireRightClickStopPaint();
    offerRestore();
    setInterval(snapshotRecovery, 8000);
    window.addEventListener("beforeunload", snapshotRecovery);
    setTimeout(autoQuests, 1200);
    const obs = new MutationObserver(() => {
      hideObserve();
      applySpellcheck();
      injectTimeMarker();
      injectWeekNav();
      injectHourDivisionControl();
      applyHourSplitTicks();
      compactRarityFilters();
      enhanceAgentBugs();
      wireTaskBarVisibility();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();
