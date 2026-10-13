// Local-only feats and quiet secrets. Inspired by the *feeling* of hidden
// Undertale routes — original writing, no copied lines or names as rewards.
(function waypointEggs() {
  "use strict";

  const STORAGE_KEY = "waypointEggsV1";
  const ACHIEVE_KEY = "waypointAchievementsV1";
  const REDUCED = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function gameOff() {
    if (typeof isGameFeaturesHidden === "function") return isGameFeaturesHidden();
    try {
      const keys = ["wp-hide-game", "waypointGameOff", "waypointHideGame"];
      for (const key of keys) {
        const raw = String(localStorage.getItem(key) || "").trim().toLowerCase();
        if (raw === "1" || raw === "on" || raw === "true" || raw === "yes") return true;
      }
    } catch (_) {}
    return false;
  }

  function applyEggsGameOff() {
    const off = gameOff();
    document.querySelectorAll(".waypoint-feats-panel, .loot-quests-panel").forEach(el => {
      el.hidden = off;
    });
  }

  const ACHIEVEMENTS = [
    { id: "empty_cache", name: "The quiet cache", hint: "Ask a cache for treasure when none are waiting.", toast: "The cache was empty. The silence waved back." },
    { id: "tab_whirlwind", name: "Wrong elevator", hint: "Ride too many pages in a hurry.", toast: "You felt like walking. The river kept its own map." },
    { id: "midnight_paint", name: "2 a.m. route", hint: "Paint when honest people are asleep.", toast: "The route still wants you. That's enough." },
    { id: "skin_fidget", name: "Costume box", hint: "Try on more skins than a locker should allow.", toast: "You kept changing coats. The map remembered every one." },
    { id: "escape_artist", name: "Leave quietly", hint: "Press Escape until the UI gets the hint.", toast: "You closed the door so often it learned your name." },
    { id: "w_worship", name: "The letter W", hint: "The brand is not a button. Unless it is.", toast: "The W rang like a save-star. Nothing was saved. That was the point." },
    { id: "konami_route", name: "Old code", hint: "A sequence older than this app.", toast: "A dusty code still worked. Thirty lives were not granted." },
    { id: "pacifist_cache", name: "Mercy taps", hint: "Open a cache without the brawl button.", toast: "Mercy looks like a waypoint. The lid agreed." },
    { id: "brawl_only", name: "No mercy", hint: "Only brawl a cache open.", toast: "You hit the same stone. It remembered your hands." },
    { id: "empty_pockets", name: "Window shopper", hint: "Open the Gem Forge with nothing to spend.", toast: "You checked again. It was still a gem shop." },
    { id: "stray_dog", name: "Stray bag", hint: "Buy something a dog left behind.", toast: "A small dog inspected the stall, then left a sticker." },
    { id: "spoken_for", name: "Spoken for", hint: "Name a custom skin after someone already walking.", toast: "That name is already spoken for." },
    { id: "piano_route", name: "Four notes", hint: "Equip four old coats in the first order.", toast: "Trail, moss, solar, void. The locker hummed a bar and stopped." },
    { id: "gaster_follow", name: "Missing entry", hint: "Type a name that does not want to be typed.", toast: "You named the darkness, and it declined to answer." },
    { id: "stare", name: "Long look", hint: "Stay in the locker without touching it.", toast: "You stared until the coats stared back." },
    { id: "flowey_check", name: "Again?", hint: "Poke the same pursuit until it notices.", toast: "You asked the same stone six times. It did not bloom." },
    { id: "true_lab", name: "Filter lab", hint: "All, custom, mythic, all.", toast: "The filters clicked like lab lights coming on." },
    { id: "hotland", name: "Overheat", hint: "Swap skins faster than the page can blush.", toast: "The HUD ran hot. You did not slow down." },
    { id: "snowed_in", name: "Snowed in", hint: "Open Waypoint and do nothing at all.", toast: "You waited. The town stayed snowed in. That counted." },
    { id: "spare_lid", name: "Walk away", hint: "Close a cache before it opens.", toast: "You spared the lid. It will still be here." },
    { id: "fun_sixty_six", name: "Water song", hint: "Some days the fun value is just so.", toast: "You felt like walking. Water kept its own counsel." },
    { id: "atlas_follow", name: "W.P. Atlas", hint: "Type the cartographer who isn't on the masthead.", toast: "The entry was crossed out. The pencil kept moving." },
    { id: "zero_gem_stare", name: "Counting zero", hint: "Tap the gem count when it is nothing.", toast: "Zero gems. You counted them anyway." },
    { id: "quest_nag", name: "One more", hint: "Select and unselect the same pursuit like a habit.", toast: "You put it back. You picked it up. The board sighed." },
    { id: "despite", name: "It's you", hint: "Open the locker while today is already complete.", toast: "Despite the finished day, the locker still showed you." },
  ];

  const FORBIDDEN_NAMES = ["frisk", "chara", "gaster", "sans", "papyrus", "undyne", "alphys", "asriel", "toriel", "asgore", "temmie", "flowey"];
  const PIANO = ["trailblazer", "moss", "solar", "void"];
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

  function loadEggs() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) { state = null; }
    if (!state || typeof state !== "object") {
      state = {
        fun: 1 + Math.floor(Math.random() * 100),
        wClicks: 0,
        emptyCache: 0,
        esc: 0,
        shopEmpty: 0,
        piano: [],
        konami: [],
        filters: [],
        questPokes: {},
        buffer: "",
        secretDog: false,
      };
    }
    if (!Number.isFinite(state.fun)) state.fun = 1 + Math.floor(Math.random() * 100);
    if (!Array.isArray(state.piano)) state.piano = [];
    if (!Array.isArray(state.konami)) state.konami = [];
    if (!Array.isArray(state.filters)) state.filters = [];
    if (!state.questPokes || typeof state.questPokes !== "object") state.questPokes = {};
    if (typeof state.buffer !== "string") state.buffer = "";
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    return state;
  }

  function saveEggs(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function loadUnlocked() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACHIEVE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(id => typeof id === "string") : [];
    } catch (_) {
      return [];
    }
  }

  function saveUnlocked(ids) {
    try { localStorage.setItem(ACHIEVE_KEY, JSON.stringify(ids)); } catch (_) {}
  }

  function achievementById(id) {
    return ACHIEVEMENTS.find(item => item.id === id) || null;
  }

  function unlock(id, extraToast) {
    const meta = achievementById(id);
    if (!meta) return false;
    const unlocked = loadUnlocked();
    if (unlocked.includes(id)) return false;
    unlocked.push(id);
    saveUnlocked(unlocked);
    const message = extraToast || meta.toast;
    if (typeof showToast === "function") showToast(`★ ${meta.name} — ${message}`, "good");
    renderSecretOverlay(meta, message);
    return true;
  }

  function renderSecretOverlay(meta, message) {
    if (REDUCED()) return;
    document.getElementById("waypoint-egg-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "waypoint-egg-overlay";
    overlay.className = "waypoint-egg-overlay";
    overlay.innerHTML = `<button type="button" class="waypoint-egg-star" aria-label="Dismiss secret"><svg class="ws-mark wp-tile-mark" viewBox="0 0 96 96" width="22" height="22" aria-hidden="true"><defs><linearGradient id="wp-egg-mark" x1="48" y1="40" x2="48" y2="61" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c44226"/><stop offset="1" stop-color="#d3ba46"/></linearGradient></defs><rect x="5" y="5" width="86" height="86" rx="24" fill="#17181a" stroke="#2a2c30" stroke-width="2"/><path d="M27.5 61 L48 40 L68 61" fill="none" stroke="url(#wp-egg-mark)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27.5" cy="61" r="6" fill="#d3ba46"/><circle cx="68" cy="61" r="6" fill="#b9a13a"/><circle cx="48" cy="40" r="8" fill="#c44226"/></svg></button><p>${escapeText(meta.name)}</p><small>${escapeText(message)}</small>`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
    window.setTimeout(() => overlay.remove(), 3200);
  }

  function escapeText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function featsHtml() {
    const unlocked = new Set(loadUnlocked());
    const eggs = loadEggs();
    const rows = ACHIEVEMENTS.map(item => {
      const got = unlocked.has(item.id);
      return `<button type="button" class="loot-quest-card${got ? " done" : ""}" data-egg-feats="${escapeText(item.id)}">
        <span class="loot-quest-check">${got ? "★" : "?"}</span>
        <span class="loot-quest-copy"><strong>${escapeText(got ? item.name : "???")}</strong><small>${escapeText(got ? item.toast : item.hint)}</small></span>
        <span class="loot-quest-choice">${got ? "Found" : "Hidden"}</span>
      </button>`;
    }).join("");
    return `<section class="loot-quests-panel waypoint-feats-panel">
      <header class="loot-panel-hero">
        <div><span class="loot-eyebrow">WEIRD USE · QUIET SECRETS</span><h2>Feats</h2><p>Most of these only fire if you use Waypoint strangely. None of them are chores.</p></div>
        <strong class="loot-hero-balance">${unlocked.size}/${ACHIEVEMENTS.length}</strong>
      </header>
      <p class="waypoint-fun-line">Fun value ${eggs.fun}. The river person may or may not be working today.</p>
      <div class="loot-quest-list">${rows}</div>
    </section>`;
  }

  function inspect(id) {
    const meta = achievementById(id);
    const unlocked = loadUnlocked();
    if (!meta) return;
    if (typeof showToast === "function") {
      showToast(unlocked.includes(id) ? meta.toast : meta.hint, "info");
    }
  }

  function secretFilterButton(active) {
    const eggs = loadEggs();
    if (!eggs.secretDog && !loadUnlocked().includes("stray_dog") && eggs.fun !== 2 && eggs.fun !== 66) return "";
    return `<button type="button" class="${active === "dog" ? "active" : ""}" data-locker-filter="dog" aria-pressed="${active === "dog"}">???</button>`;
  }

  function lockerSecretHtml(filter) {
    const eggs = loadEggs();
    const show = filter === "dog" || eggs.secretDog;
    if (!show) return "";
    return `<article class="loot-skin-card loot-skin-card--dog">
      <button type="button" class="loot-skin-equip" data-egg-dog="1">
        <span class="loot-skin-effect-badge">SECRET</span>
        <span class="loot-skin-avatar">🐶</span>
        <strong>Map dog</strong>
        <small>NOT A SKIN</small>
        <p>It does not work here. It is just visiting.</p>
      </button>
    </article>`;
  }

  function note(kind, detail) {
    if (gameOff()) return;
    if (kind === "shell" && detail === "shop") {
      const gems = parseInt(localStorage.getItem("gameGems") || "0", 10) || 0;
      if (gems <= 0) {
        const eggs = loadEggs();
        eggs.shopEmpty = (eggs.shopEmpty || 0) + 1;
        saveEggs(eggs);
        if (eggs.shopEmpty >= 2) unlock("empty_pockets");
      }
    }
    if (kind === "shell" && detail === "locker") {
      try {
        const game = window.WaypointGame?.getState?.();
        if (game?.todayComplete) unlock("despite");
      } catch (_) {}
      watchStare();
    }
  }

  let stareTimer = 0;
  function watchStare() {
    window.clearTimeout(stareTimer);
    stareTimer = window.setTimeout(() => unlock("stare"), 90000);
  }

  let idleTimer = 0;
  function armSnowedIn() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => unlock("snowed_in"), 180000);
  }

  const tabTimes = [];
  const skinTimes = [];
  let brawlUsed = false;
  let singleUsed = false;
  let chestOpen = false;

  function onLootEvent(event) {
    if (gameOff()) return;
    const detail = event.detail || {};
    if (detail.kind === "empty-cache") {
      const eggs = loadEggs();
      eggs.emptyCache = (eggs.emptyCache || 0) + 1;
      saveEggs(eggs);
      if (eggs.emptyCache >= 3) unlock("empty_cache");
    }
    if (detail.kind === "bazaar" && detail.id === "stray") {
      const eggs = loadEggs();
      eggs.secretDog = true;
      saveEggs(eggs);
      unlock("stray_dog");
    }
    if (detail.kind === "equip" && detail.id) {
      const eggs = loadEggs();
      const next = eggs.piano.slice();
      if (PIANO[next.length] === detail.id) next.push(detail.id);
      else next.splice(0, next.length, ...(detail.id === PIANO[0] ? [detail.id] : []));
      eggs.piano = next.slice(-4);
      saveEggs(eggs);
      if (eggs.piano.join("|") === PIANO.join("|")) unlock("piano_route");
      skinTimes.push(Date.now());
      while (skinTimes.length && Date.now() - skinTimes[0] > 8000) skinTimes.shift();
      if (skinTimes.length >= 8) unlock("skin_fidget");
      if (skinTimes.length >= 3 && Date.now() - skinTimes[skinTimes.length - 3] < 5000) unlock("hotland");
    }
    if (detail.kind === "custom-skin") {
      const name = String(detail.name || "").trim().toLowerCase();
      if (FORBIDDEN_NAMES.includes(name) || name === "waypoint") unlock("spoken_for");
    }
  }

  function wrapHabits() {
    const habits = window.WaypointHabits;
    if (!habits || habits.__eggsWrapped) return;
    const prev = habits.observe;
    habits.observe = function observeEggs(kind, detail) {
      const result = prev.apply(this, arguments);
      const name = String(kind || "").toLowerCase();
      if (name === "tab") {
        tabTimes.push(Date.now());
        while (tabTimes.length && Date.now() - tabTimes[0] > 120000) tabTimes.shift();
        if (tabTimes.length >= 30) unlock("tab_whirlwind");
      }
      if (name === "paint") {
        const hour = new Date().getHours();
        if (hour >= 2 && hour < 5) unlock("midnight_paint");
      }
      return result;
    };
    habits.__eggsWrapped = true;
  }

  function onKeydown(event) {
    const eggs = loadEggs();
    if (event.key === "Escape") {
      eggs.esc = (eggs.esc || 0) + 1;
      saveEggs(eggs);
      if (eggs.esc >= 15) unlock("escape_artist");
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const expect = KONAMI[eggs.konami.length];
    if (key === expect || (expect && expect.length === 1 && key === expect)) {
      eggs.konami.push(key);
      if (eggs.konami.length >= KONAMI.length) {
        eggs.konami = [];
        saveEggs(eggs);
        unlock("konami_route");
      } else saveEggs(eggs);
    } else if (key === KONAMI[0]) {
      eggs.konami = [key];
      saveEggs(eggs);
    } else if (eggs.konami.length) {
      eggs.konami = [];
      saveEggs(eggs);
    }

    if (event.key.length === 1 && /[a-z.]/i.test(event.key)) {
      eggs.buffer = (eggs.buffer + event.key.toLowerCase()).slice(-24);
      saveEggs(eggs);
      if (eggs.buffer.includes("gaster") || eggs.buffer.includes("w.d.gaster")) unlock("gaster_follow");
      if (eggs.buffer.includes("w.p.atlas") || eggs.buffer.includes("wpatlas")) unlock("atlas_follow");
    }
  }

  function onClick(event) {
    armSnowedIn();
    applyEggsGameOff();
    if (gameOff()) return;
    const brand = event.target.closest?.(".loot-shell-brand span, .loot-shell-brand");
    if (brand && event.target.closest(".loot-shell-brand")) {
      const eggs = loadEggs();
      eggs.wClicks = (eggs.wClicks || 0) + 1;
      saveEggs(eggs);
      if (eggs.wClicks >= 10) unlock("w_worship");
    }
    if (event.target.closest?.("#hud-gems-count")) {
      const gems = parseInt(localStorage.getItem("gameGems") || "0", 10) || 0;
      if (gems <= 0) unlock("zero_gem_stare");
    }
    if (event.target.closest?.("[data-egg-dog]")) {
      const eggs = loadEggs();
      eggs.secretDog = true;
      saveEggs(eggs);
      unlock("stray_dog");
      if (typeof showToast === "function") showToast("The dog does not work here. It is just visiting.", "info");
    }
    if (event.target.closest?.("[data-locker-filter]")) {
      const eggs = loadEggs();
      const id = event.target.closest("[data-locker-filter]").dataset.lockerFilter;
      eggs.filters = [...eggs.filters, id].slice(-6);
      saveEggs(eggs);
      const seq = eggs.filters.slice(-4).join(">");
      if (seq === "all>custom>mythic>all") unlock("true_lab");
      if (id === "dog") {
        eggs.secretDog = true;
        saveEggs(eggs);
      }
    }
    if (event.target.closest?.("[data-quest-select]")) {
      const key = event.target.closest("[data-quest-select]").dataset.questSelect;
      const eggs = loadEggs();
      eggs.questPokes[key] = (eggs.questPokes[key] || 0) + 1;
      saveEggs(eggs);
      if (eggs.questPokes[key] >= 6) unlock("flowey_check");
      if (eggs.questPokes[key] >= 4) unlock("quest_nag");
    }
    if (event.target.closest?.("#loot-brawl-btn")) {
      brawlUsed = true;
      chestOpen = true;
    }
    if (event.target.closest?.("#loot-chest-object")) {
      singleUsed = true;
      chestOpen = true;
    }
    if (event.target.closest?.(".loot-chest-close") && chestOpen) {
      unlock("spare_lid");
    }
  }

  function onChestPhase() {
    if (gameOff()) return;
    const overlay = document.getElementById("loot-chest-overlay");
    if (!overlay) {
      if (chestOpen && singleUsed && !brawlUsed) unlock("pacifist_cache");
      if (chestOpen && brawlUsed && !singleUsed) unlock("brawl_only");
      chestOpen = false;
      brawlUsed = false;
      singleUsed = false;
    }
  }

  function bootFun() {
    const eggs = loadEggs();
    if (eggs.fun === 66) {
      window.setTimeout(() => unlock("fun_sixty_six"), 2400);
    }
    if (eggs.fun === 2) {
      eggs.secretDog = true;
      saveEggs(eggs);
    }
  }

  function init() {
    wrapHabits();
    bootFun();
    armSnowedIn();
    applyEggsGameOff();
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("waypoint:loot-event", onLootEvent);
    window.addEventListener("waypoint:habits", wrapHabits);
    window.addEventListener("storage", applyEggsGameOff);
    window.addEventListener("waypoint:tab", applyEggsGameOff);
    const observer = new MutationObserver(() => {
      onChestPhase();
      applyEggsGameOff();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.WaypointEggs = {
    init,
    unlock,
    note,
    inspect,
    featsHtml,
    secretFilterButton,
    lockerSecretHtml,
    list: () => ACHIEVEMENTS.slice(),
    unlocked: loadUnlocked,
  };
})();
