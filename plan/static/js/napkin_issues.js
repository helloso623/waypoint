/*
 * NAPKIN PRODUCT / VARIETY CHECK — 2026-09-20
 * DONE: quick capture defaults to feedback instead of task.
 * DONE: quick capture has one large scribble field and spellcheck.
 * DONE: image paste accepts clipboard files, HTML images, drops, and file pickers.
 * DONE: paste upload falls back to blob and data URLs when the server is unavailable.
 * DONE: empty image placeholders are hidden instead of leaving a visual void.
 * DONE: Docs, Sheets, and Slides share a local BOARD_KEY store.
 * DONE: Sheets retain formulas, multiple tabs, A–Z columns, and row labels.
 * DONE: Slides retain multiple slides, text boxes, and speaker notes.
 * DONE: napkin notes can be searched, copied, accepted, and compiled.
 * DONE: alarm drills include quick math and a memory matching game.
 * DONE: app icons already react to the equipped skin palette.
 * DONE: game-off already hides arcade and other game chrome.
 * STILL-GAP: app marks used one repeated rounded-square corporate plate.
 * STILL-GAP: several app glyphs described a generic tile, not the app itself.
 * STILL-GAP: the three focus buttons were wired to only one old HUD location.
 * STILL-GAP: the focus dock needed explicit game-off visibility handling.
 * STILL-GAP: quick capture stopped short vertically and wasted lower screen space.
 * STILL-GAP: the napkin airlock became a tall stack instead of a horizontal tray.
 * STILL-GAP: capture actions sat too far below the writing and notes.
 * STILL-GAP: Docs read as a rich-text dialog, without page margins or a ruler.
 * STILL-GAP: Sheets needed stronger formula/name chrome and frozen-looking headers.
 * STILL-GAP: Slides needed a real 16:9 canvas, thicker filmstrip, and notes well.
 * STILL-GAP: broader skin-specific motion/texture systems remain outside these files.
 * STILL-GAP: AI image generation, event intelligence, sync merge, and task AI remain.
 * THIS PASS: owns icon silhouettes, focus wiring, capture layout, and board polish.
 */
(function () {
  const apiCall = (path, opts) => (typeof api === "function" ? api(path, opts) : fetch(path, opts).then(r => r.json()));
  const esc = (v) => (typeof escapeHtml === "function" ? escapeHtml(String(v ?? "")) : String(v ?? ""));

  window.WaypointNapkinIssues = window.WaypointNapkinIssues || {
    lootQuiet: { max_daily_chests: 1, hide_ticket_window: true, road_chest_every: 3 },
  };

  function iconSvg(name) {
    const paths = {
      back: '<path d="M13.6 5.2 6.4 12l7.2 6.8a1.6 1.6 0 0 1-2.2 2.3L2.8 13a1.5 1.5 0 0 1 0-2L11.4 3a1.6 1.6 0 0 1 2.2 2.2z" fill="currentColor"/><path d="M8.2 12H21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
      forward: '<path d="M10.4 5.2 17.6 12l-7.2 6.8a1.6 1.6 0 0 0 2.2 2.3L21.2 13a1.5 1.5 0 0 0 0-2L12.6 3a1.6 1.6 0 0 0-2.2 2.2z" fill="currentColor"/><path d="M15.8 12H3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
      command: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4" fill="currentColor" opacity="0.18"/><rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.4 12h7.2M12 8.4v7.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
      settings: '<path d="M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6z" fill="currentColor" opacity="0.22"/><circle cx="12" cy="12" r="2.7" fill="currentColor"/><path d="M12 3.1v2.1M12 18.8v2.1M3.1 12h2.1M18.8 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7 5.8 18.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      timer: '<path d="M12 6.2a7.4 7.4 0 1 1 0 14.8 7.4 7.4 0 0 1 0-14.8z" fill="currentColor" opacity="0.18"/><circle cx="12" cy="13.4" r="6.1" fill="none" stroke="currentColor" stroke-width="1.95"/><path d="M12 13.4V9.6M8.4 3.3h7.2" stroke="currentColor" stroke-width="2.05" stroke-linecap="round"/><circle cx="12" cy="13.4" r="1.6" fill="currentColor"/>',
      graph: '<path d="M4 18.6h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.2 16.2 10 9.8l3.2 2.8 4.8-7.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="5.4" r="1.7" fill="currentColor"/>',
    };
    return `<svg class="hud-icon-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.graph}</svg>`;
  }

  /* Pre-emoji-change launcher glyphs. Starter + common keep these. */
  const APP_EMOJI = {
    agent: "🤖",
    hub: "📌",
    planner: "📅",
    capture: "💡",
    studio: "🛠️",
    blueprint: "⬢",
    arcade: "🎯",
    parallel: "🌌",
    people: "👥",
    system: "⚙️",
  };

  const TAB_EMOJI = {
    Today: "☀️", Tasks: "✅", Goals: "🚩", Calendar: "📅", Events: "🎟️",
    Paint: "🖌️", Trends: "📈", Ideas: "💡", Skills: "📘", Problems: "⚠️",
    Thinking: "💭", Funny: "😄", Essays: "📄", Repository: "📦", Projects: "🧊",
    Competitions: "🏅", Code: "</>", Obsidian: "📓", Classes: "🎓", Practice: "🎯",
    Parallel: "🌌", Contacts: "📇", Team: "🤝", Customers: "⭐", Settings: "⚙️",
    Prompts: "💬", About: "ℹ️", Hub: "📌", Agent: "🤖",
  };

  /* Rare+ silhouettes. Skin owns color. No people figures. */
  const APP_ICONS = {
    agent: {
      a: "#c56a4a", b: "#6b3a2a",
      d: '<path d="M22 26h48a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10H48L32 84V70H22a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><path d="M62 22l4 9 10 4-10 4-4 9-4-9-10-4 10-4z" fill="COL"/>' },
    hub: {
      a: "#b98245", b: "#615039",
      d: '<path d="M48 10c16 0 28 12 28 28 0 22-28 48-28 48S20 60 20 38c0-16 12-28 28-28z" fill="FILL" stroke="url(#GID)" stroke-width="6"/><circle cx="48" cy="36" r="11" fill="COL"/>' },
    planner: {
      a: "#76909a", b: "#344e57",
      d: '<rect x="14" y="24" width="68" height="56" rx="10" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M14 42h68" stroke="url(#GID)" stroke-width="6"/><path d="M30 14v20M66 14v20" stroke="url(#GID)" stroke-width="6" stroke-linecap="round"/><rect x="30" y="54" width="16" height="14" rx="3" fill="COL"/>' },
    capture: {
      a: "#c18a52", b: "#76452f",
      d: '<path d="M48 12a26 26 0 0 1 16 47v8H32v-8A26 26 0 0 1 48 12z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><rect x="36" y="74" width="24" height="8" rx="3" fill="COL"/><path d="M40 86h16" stroke="COL" stroke-width="6" stroke-linecap="round"/>' },
    studio: {
      a: "#8c8073", b: "#403b38",
      d: '<path d="M48 12l32 18v36L48 84 16 66V30z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><path d="M16 30l32 18 32-18M48 48v36" stroke="url(#GID)" stroke-width="6"/><circle cx="48" cy="48" r="7" fill="COL"/>' },
    blueprint: {
      a: "#6f82a2", b: "#343e61",
      d: '<path d="M30 34l36 34M66 34L30 68" stroke="url(#GID)" stroke-width="6" stroke-linecap="round"/><circle cx="26" cy="30" r="12" fill="FILL" stroke="url(#GID)" stroke-width="6"/><circle cx="70" cy="30" r="12" fill="FILL" stroke="url(#GID)" stroke-width="6"/><circle cx="48" cy="74" r="12" fill="COL"/>' },
    arcade: {
      a: "#a95d62", b: "#5d303d",
      d: '<circle cx="48" cy="48" r="34" fill="FILL" stroke="url(#GID)" stroke-width="6"/><circle cx="48" cy="48" r="18" fill="none" stroke="url(#GID)" stroke-width="6"/><circle cx="48" cy="48" r="7" fill="COL"/>' },
    parallel: {
      a: "#81719a", b: "#403653",
      d: '<circle cx="48" cy="48" r="16" fill="COL"/><ellipse cx="48" cy="48" rx="38" ry="14" fill="none" stroke="url(#GID)" stroke-width="6" transform="rotate(-28 48 48)"/><ellipse cx="48" cy="48" rx="38" ry="14" fill="none" stroke="FILL" stroke-width="6" transform="rotate(28 48 48)"/>' },
    people: {
      a: "#6f927b", b: "#355844",
      d: '<path d="M20 16h54c6 0 10 5 10 11v42c0 6-4 11-10 11H20c-6 0-10-5-10-11V27c0-6 4-11 10-11z" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M20 16h16v64H20c-6 0-10-5-10-11V27c0-6 4-11 10-11z" fill="url(#GID)" opacity=".7"/><path d="M46 36h22M46 50h18M46 64h14" stroke="COL" stroke-width="5.5" stroke-linecap="round"/><circle cx="28" cy="34" r="5" fill="COL"/>' },
    system: {
      a: "#85898c", b: "#41474b",
      d: '<circle cx="48" cy="48" r="32" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M48 16v24M48 56v24M16 48h24M56 48h24" stroke="url(#GID)" stroke-width="6" stroke-linecap="round"/><circle cx="48" cy="48" r="9" fill="COL"/>' },
  };

  const TAB_ICONS = {
    Today: "sun", Tasks: "check", Goals: "flag", Calendar: "cal", Events: "ticket",
    Paint: "brush", Trends: "spark", Ideas: "idea", Skills: "book", Problems: "alert",
    Thinking: "think", Funny: "smile", Essays: "page", Repository: "box", Projects: "cube",
    Competitions: "medal", Code: "code", Obsidian: "vault", Classes: "cap", Practice: "target",
    Parallel: "orbit", Contacts: "card", Team: "cards", Customers: "star", Settings: "cog",
    Prompts: "quote", About: "info", Hub: "pin", Agent: "chat",
  };

  const TAB_SHAPES = {
    sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 3.2v1.8M12 19v1.8M3.2 12h1.8M19 12h1.8M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1 5.6 18.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" opacity="0.16"/><path d="M7.2 12.2 10.4 15.4 17 8.6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
    flag: '<path d="M6.4 4.4v15.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.8 5.2h11.2l-2.4 4.2 2.4 4.2H6.8z" fill="currentColor"/>',
    cal: '<rect x="4" y="6" width="16" height="14" rx="3" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.8v4M16 3.8v4M4 11h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="8" y="13.2" width="3.2" height="3.2" rx="0.8" fill="currentColor"/>',
    ticket: '<path d="M4.4 8.2h15.2v8.2a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.7"/><path d="M9 8.2v10.2M15 8.2v10.2" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1.6 1.8"/>',
    brush: '<path d="M14.6 4.2 8 14.4c-1.4 2.2.6 4.8 3 3.6L17.8 8z" fill="currentColor"/><path d="M15.4 5.2c1.8-1.4 4.2.4 3.2 2.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    spark: '<path d="M4.4 17.4h15.2M6.4 14.6 10.2 8.6l3 2.6 4.6-6.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    idea: '<path d="M12 4.2a5.4 5.4 0 0 1 3.2 9.8v1.6H8.8v-1.6A5.4 5.4 0 0 1 12 4.2z" fill="currentColor"/><path d="M9.6 18.4h4.8M10.4 20.4h3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    book: '<path d="M6 5.2h5.2c1.6 0 2.8 1 2.8 2.6v11H8.2A2.2 2.2 0 0 1 6 16.6z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.6"/><path d="M18 5.2h-5.2c-1.6 0-2.8 1-2.8 2.6v11h5.8A2.2 2.2 0 0 0 18 16.6z" fill="currentColor"/>',
    alert: '<path d="M12 4.4 20.2 19H3.8z" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.4v4.6M12 16.6v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    think: '<circle cx="11" cy="10.4" r="5.4" fill="currentColor" opacity="0.18" stroke="currentColor" stroke-width="1.7"/><path d="M8.4 16.4 7 20.2h8.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    smile: '<circle cx="12" cy="12" r="7.2" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7"/><path d="M8.6 13.6c1 1.6 2.4 2.4 3.4 2.4s2.4-.8 3.4-2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9.4" cy="10" r="1" fill="currentColor"/><circle cx="14.6" cy="10" r="1" fill="currentColor"/>',
    page: '<path d="M7 4.6h7.2L17.8 8.2V19.4H7z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.4 12h5.2M9.4 15h3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    box: '<path d="M4.8 8.4 12 4.6l7.2 3.8v8.8L12 20.8 4.8 17.2z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4.8 8.4 12 12.2 19.2 8.4M12 12.2V20.8" stroke="currentColor" stroke-width="1.6"/>',
    cube: '<path d="M12 4.4 19.4 8.4v8.2L12 20.6 4.6 16.6V8.4z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    medal: '<circle cx="12" cy="13.6" r="5.4" fill="currentColor"/><path d="M8.2 4.4 12 8l3.8-3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    code: '<path d="M8.4 8.2 4.6 12l3.8 3.8M15.6 8.2 19.4 12l-3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    vault: '<path d="M6 6.2h12v12.6H6z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12.4" r="3.2" fill="currentColor"/>',
    cap: '<path d="M3.8 10.4 12 6.4l8.2 4-8.2 4z" fill="currentColor"/><path d="M7.2 12.2v4.2c1.6 1 3.2 1.4 4.8 1.4s3.2-.4 4.8-1.4v-4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    target: '<circle cx="12" cy="12" r="7.2" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
    orbit: '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><ellipse cx="12" cy="12" rx="8" ry="3.2" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-24 12 12)"/>',
    card: '<rect x="5" y="5.4" width="14" height="13.2" rx="2" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.6"/><path d="M7.4 9.4h5.4M7.4 12.8h3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    cards: '<rect x="3.4" y="7.2" width="11.6" height="10" rx="1.8" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.5"/><rect x="8.8" y="5.2" width="11.6" height="10" rx="1.8" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.5"/>',
    person: '<rect x="5" y="5.4" width="14" height="13.2" rx="2" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.6"/><path d="M7.4 9.4h5.4M7.4 12.8h3.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    people: '<rect x="3.4" y="7.2" width="11.6" height="10" rx="1.8" fill="currentColor" opacity="0.14" stroke="currentColor" stroke-width="1.5"/><rect x="8.8" y="5.2" width="11.6" height="10" rx="1.8" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.5"/>',
    star: '<path d="M12 3.8 14.2 9l5.6.6-4.2 3.8 1.2 5.6L12 16.4 7.2 19l1.2-5.6L4.2 9.6 9.8 9z" fill="currentColor"/>',
    cog: '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 5.2 13.2 7.6 15.8 7l.4 2.6 2.4 1L17.2 12l1.4 1.8-2.4 1 .4 2.6-2.6-.6L12 18.8l-1.2-2.4-2.6.6.4-2.6-2.4-1L7.8 12 6.4 10.2l2.4-1L9.2 6.6l2.6.6z" fill="currentColor" opacity="0.22" stroke="currentColor" stroke-width="1.2"/>',
    quote: '<path d="M6.2 8.2h5v5.4c0 2.2-1.6 3.8-3.6 3.8H6.2zM12.8 8.2h5v5.4c0 2.2-1.6 3.8-3.6 3.8h-1.4z" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="7.2" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.7"/><path d="M12 10.6v6M12 7.6v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    pin: '<path d="M12 4.2a5.2 5.2 0 0 1 3.4 9.1L12 20.4 8.6 13.3A5.2 5.2 0 0 1 12 4.2z" fill="currentColor"/><circle cx="12" cy="9.2" r="1.8" fill="#0c0a08"/>',
    chat: '<path d="M5.2 6.2h13.6v9.2H12L7.4 18.8V15.4H5.2z" fill="currentColor"/>',
  };

  function equippedSkinId() {
    return document.documentElement.dataset.playerSkin || "trailblazer";
  }

  function isTrailblazer() {
    const id = equippedSkinId();
    return !document.documentElement.dataset.playerSkin || id === "trailblazer";
  }

  function equippedRarity() {
    const raw = (document.documentElement.dataset.skinRarity || "").trim();
    if (raw) return raw;
    return isTrailblazer() ? "starter" : "common";
  }

  function usesEmojiIcons() {
    return isTrailblazer();
  }

  function trailblazerEmoji(glyph) {
    return `<span class="wp-skin-emoji" aria-hidden="true">${glyph || "🧭"}</span>`;
  }

  function tabMark(tab) {
    if (usesEmojiIcons()) {
      const emoji = TAB_EMOJI[tab] || "•";
      return `<span class="tab-chip-emoji" aria-hidden="true">${emoji}</span>`;
    }
    const key = TAB_ICONS[tab] || "info";
    return `<svg class="tab-chip-mark" viewBox="0 0 24 24" aria-hidden="true">${TAB_SHAPES[key] || TAB_SHAPES.info}</svg>`;
  }

  function parseHex(hex) {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) return [0, 1, 2].map(i => parseInt(h[i] + h[i], 16));
    if (h.length >= 6) return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return [201, 162, 39];
  }

  function mixHex(base, skin, t) {
    const a = parseHex(base);
    const b = parseHex(skin);
    const w = Math.max(0, Math.min(1, Number(t) || 0));
    const m = (i) => Math.round(a[i] * (1 - w) + b[i] * w);
    return `#${[m(0), m(1), m(2)].map(n => n.toString(16).padStart(2, "0")).join("")}`;
  }

  function equippedSkinColors() {
    const root = document.documentElement;
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(root) : { getPropertyValue: () => "" };
    return {
      a: (cs.getPropertyValue("--skin-a") || "").trim() || "#c56a4a",
      b: (cs.getPropertyValue("--skin-b") || "").trim() || "#6b3a2a",
      id: root.dataset.playerSkin || "trailblazer",
    };
  }

  function markSvg(id) {
    const spec = APP_ICONS[id] || APP_ICONS.system;
    const skin = equippedSkinColors();
    const rarity = equippedRarity();
    const colA = mixHex(spec.a, skin.a, 0.88);
    const colB = mixHex(spec.b, skin.b, 0.88);
    const token = String(skin.id || "x").replace(/[^a-z0-9-]/gi, "");
    const gid = `iss-g-${id}-${token}`;
    const fid = `iss-f-${id}-${token}`;
    const shape = spec.d.split("GID").join(gid).split("FILL").join(`url(#${fid})`).split("COL").join(colB);
    const plate = (rarity === "epic" || rarity === "mythic")
      ? `<rect x="4" y="4" width="88" height="88" rx="${rarity === "mythic" ? 8 : 20}" fill="url(#${fid})" opacity="0.5"/>`
      : "";
    const frame = rarity === "mythic"
      ? `<rect x="8" y="8" width="80" height="80" rx="6" fill="none" stroke="${colA}" stroke-width="3" opacity="0.55"/>`
      : "";
    return `<svg class="ws-mark wp-icon-refined" width="36" height="36" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="12" y1="84" x2="84" y2="12"><stop offset="0" stop-color="${colA}"/><stop offset="1" stop-color="${colB}"/></linearGradient>
        <radialGradient id="${fid}" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="${colA}" stop-opacity="0.5"/><stop offset="1" stop-color="${colB}" stop-opacity="0.14"/></radialGradient>
      </defs>
      ${plate}${frame}
      ${shape}
    </svg>`;
  }

  function appGlyphHtml(id) {
    if (usesEmojiIcons()) {
      return `<span class="wp-app-emoji" aria-hidden="true">${APP_EMOJI[id] || "●"}</span>`;
    }
    return markSvg(id);
  }

  const SKIN_FAMILY = {
    trailblazer: "compass", copper: "compass", bronze: "compass", relic: "compass", scrap: "scrap",
    moss: "leaf", forest: "leaf", pine: "leaf", orchard: "leaf", basil: "leaf", eucalyptus: "leaf", jade: "leaf", prairie: "leaf",
    solar: "sun", sunrise: "sun", sunflower: "sun", gold: "sun", amber: "sun", brass: "sun", honey: "sun", honeycomb: "cells",
    void: "void", midnight: "void", phantom: "void", inkstorm: "void", abyssal: "void", onyx: "void", eclipse: "void", obsidian: "void", moon: "moon", starlit: "moon",
    tide: "wave", kelp: "wave", lagoon: "wave", tropic: "wave", reef: "wave", seafoam: "wave", harbor: "harbor", glacier: "frost", frost: "frost", polar: "frost", frostbite: "frost", iceberg: "frost", blizzard: "frost", nimbus: "frost", mist: "frost",
    emberwing: "flame", cinder: "flame", magma: "flame", magmaheart: "flame", wildfire: "flame", cinderfall: "flame", ruby: "flame", paprika: "flame", cherry: "flame",
    aurora: "curtain", auroraveil: "curtain", prism: "prism", quartz: "prism", nova: "prism", opal: "prism", iris: "prism", comet: "prism",
    cobalt: "signal", satellite: "signal", neon: "signal", signalbox: "signal", sapphire: "signal", volt: "bolt", thunder: "bolt", voltage: "bolt", storm: "bolt", venom: "bolt", emberglass: "flame",
    sakura: "blossom", lotus: "blossom", wisteria: "blossom", lilac: "blossom", zen: "blossom", incense: "blossom", candyfloss: "blossom",
    dune: "dune", canyon: "dune", terracotta: "dune", harvest: "dune", rust: "dune",
    royal: "crown", ivory: "paper", linen: "paper", parchment: "paper", marble: "chrome", chrome: "chrome", silver: "chrome", tungsten: "chrome", pearl: "chrome",
    arcade: "cabinet", cabinet: "cabinet", retro: "retro", nightmarket: "lantern", glasshouse: "glass", velvet: "velvet", isobar: "storm",
    metro: "metro", carbon: "metro", slate: "scrap", pebble: "scrap", ink: "signal", coral: "wave", merlot: "cellar",
    linocut: "press", risograph: "press", enamel: "chrome", brutalist: "metro", ukiyo: "scroll", bauhaus: "gallery",
    noir: "void", celadon: "leaf", vermilion: "flame", kiln: "dune", fresco: "gallery", lacquer: "chrome",
    sumi: "scroll", kintsugi: "ceramic", cyanotype: "photogram", gesso: "gallery", stained: "chapel", tatami: "mat", letterpress: "press", mosaic: "tessera", splatter: "studio", chalkboard: "slate", terrazzo: "chip", shoji: "lattice", beeswax: "comb", cork: "board", shibori: "fold", solarium: "dial", foundry: "ingot",
  };

  const FAMILY_PATHS = {
    compass: '<circle cx="48" cy="48" r="28" fill="none" stroke="url(#GID)" stroke-width="7"/><path d="M48 16v16M48 64v16M16 48h16M64 48h16" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="48" r="8" fill="COL"/>',
    leaf: '<path d="M48 16c22 10 30 30 24 52-16-6-28-18-32-36C36 46 24 58 18 72 12 48 26 24 48 16z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M42 30c2 16 10 28 22 38" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    sun: '<circle cx="48" cy="48" r="16" fill="COL"/><path d="M48 12v10M48 74v10M12 48h10M74 48h10M22 22l7 7M67 67l7 7M74 22l-7 7M29 67l-7 7" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/>',
    void: '<circle cx="48" cy="48" r="30" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><path d="M48 22 56 44l24 4-20 14 6 24-18-12-18 12 6-24-20-14 24-4z" fill="COL"/>',
    wave: '<path d="M12 58c10-16 18-16 28 0s18 16 28 0 18-16 16-8" fill="none" stroke="url(#GID)" stroke-width="8" stroke-linecap="round"/><path d="M12 40c10-16 18-16 28 0s18 16 28 0 18-16 16-8" fill="none" stroke="COL" stroke-width="7" stroke-linecap="round"/>',
    flame: '<path d="M48 14c18 18 26 30 26 46a26 26 0 1 1-52 0c0-12 8-24 14-32 2 10 10 16 16 16-2-12 0-22-4-30z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M48 46c6 6 8 12 8 18a8 8 0 1 1-16 0c0-6 4-12 8-18z" fill="COL"/>',
    frost: '<path d="M48 14v68M20 31l56 34M20 65l56-34" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="48" r="8" fill="COL"/>',
    prism: '<path d="M48 14 80 74H16z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M48 30 66 66H30z" fill="COL"/>',
    signal: '<path d="M24 62a24 24 0 0 1 48 0" fill="none" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><path d="M34 70a14 14 0 0 1 28 0" fill="none" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="78" r="6" fill="COL"/>',
    blossom: '<circle cx="48" cy="48" r="10" fill="COL"/><circle cx="48" cy="24" r="12" fill="FILL" stroke="url(#GID)" stroke-width="5"/><circle cx="70" cy="40" r="12" fill="FILL" stroke="url(#GID)" stroke-width="5"/><circle cx="62" cy="66" r="12" fill="FILL" stroke="url(#GID)" stroke-width="5"/><circle cx="34" cy="66" r="12" fill="FILL" stroke="url(#GID)" stroke-width="5"/><circle cx="26" cy="40" r="12" fill="FILL" stroke="url(#GID)" stroke-width="5"/>',
    dune: '<path d="M8 70c16-22 28-22 40 0 12-20 24-20 40 0v10H8z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><circle cx="70" cy="28" r="10" fill="COL"/>',
    bolt: '<path d="M54 12 28 52h18L40 84l30-46H52z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/>',
    moon: '<path d="M58 16a30 30 0 1 0 18 50 24 24 0 1 1-18-50z" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><circle cx="70" cy="28" r="5" fill="COL"/>',
    crown: '<path d="M16 70h64L72 38 48 54 24 34z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><circle cx="24" cy="30" r="6" fill="COL"/><circle cx="48" cy="22" r="7" fill="COL"/><circle cx="72" cy="30" r="6" fill="COL"/>',
    cabinet: '<rect x="20" y="16" width="56" height="64" rx="8" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><rect x="28" y="26" width="40" height="22" rx="4" fill="COL"/><circle cx="36" cy="64" r="6" fill="url(#GID)"/><circle cx="60" cy="64" r="6" fill="url(#GID)"/>',
    paper: '<path d="M26 16h32l16 16v48a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M58 16v16h16" fill="none" stroke="url(#GID)" stroke-width="6"/><path d="M34 52h28" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    harbor: '<circle cx="48" cy="48" r="30" fill="FILL" stroke="url(#GID)" stroke-width="8"/><circle cx="48" cy="48" r="16" fill="none" stroke="url(#GID)" stroke-width="6"/><path d="M48 18v60M18 48h60" stroke="COL" stroke-width="6"/>',
    lantern: '<path d="M36 18h24v8H36z" fill="COL"/><path d="M30 26h36l-6 44H36z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><path d="M48 18V10" stroke="url(#GID)" stroke-width="6" stroke-linecap="round"/>',
    glass: '<path d="M20 20h56v56H20z" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><path d="M20 48h56M48 20v56" stroke="url(#GID)" stroke-width="6"/><circle cx="34" cy="34" r="6" fill="COL"/>',
    velvet: '<path d="M16 28c20 8 28 8 32-8 4 16 12 16 32 8v48H16z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><circle cx="48" cy="52" r="8" fill="COL"/>',
    storm: '<path d="M18 40c8-18 52-18 60 0 8 16-8 28-20 24l-8 16-10-20c-16 4-30-4-22-20z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><path d="M50 46 38 68h12l-4 14 18-24H52z" fill="COL"/>',
    chrome: '<circle cx="48" cy="48" r="30" fill="FILL" stroke="url(#GID)" stroke-width="7"/><path d="M22 40c10-6 42-6 52 0" fill="none" stroke="#fff8f0" stroke-width="5" stroke-linecap="round" opacity="0.45"/><circle cx="48" cy="48" r="8" fill="COL"/>',
    metro: '<rect x="14" y="28" width="68" height="40" rx="12" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><circle cx="30" cy="68" r="8" fill="COL"/><circle cx="66" cy="68" r="8" fill="COL"/><path d="M24 40h48" stroke="url(#GID)" stroke-width="6" stroke-linecap="round"/>',
    scrap: '<rect x="22" y="22" width="52" height="52" rx="10" fill="FILL" stroke="url(#GID)" stroke-width="6.5" transform="rotate(12 48 48)"/><path d="M34 48h28M48 34v28" stroke="COL" stroke-width="7" stroke-linecap="round"/>',
    retro: '<rect x="16" y="18" width="64" height="48" rx="4" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><rect x="24" y="26" width="48" height="32" fill="COL"/><path d="M36 74h24M48 66v8" stroke="url(#GID)" stroke-width="6" stroke-linecap="round"/>',
    scroll: '<rect x="22" y="14" width="52" height="68" rx="4" fill="FILL" stroke="url(#GID)" stroke-width="6"/><rect x="18" y="10" width="60" height="10" rx="4" fill="COL"/><path d="M34 40h28M34 54h20" stroke="COL" stroke-width="5" stroke-linecap="round"/>',
    ceramic: '<circle cx="48" cy="50" r="28" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><path d="M28 42 42 56 70 30" fill="none" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    photogram: '<rect x="16" y="16" width="64" height="64" rx="0" fill="FILL" stroke="url(#GID)" stroke-width="6"/><circle cx="48" cy="48" r="14" fill="none" stroke="COL" stroke-width="6"/>',
    gallery: '<rect x="14" y="18" width="68" height="60" rx="0" fill="FILL" stroke="url(#GID)" stroke-width="7"/><rect x="24" y="28" width="48" height="36" fill="COL"/>',
    chapel: '<path d="M48 10 78 40v38H18V40z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M48 28 64 52H32z" fill="COL"/>',
    mat: '<rect x="10" y="24" width="76" height="48" rx="2" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M10 36h76M10 60h76" stroke="COL" stroke-width="6"/>',
    press: '<rect x="18" y="18" width="60" height="60" rx="0" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><path d="M30 40h36M30 52h24" stroke="COL" stroke-width="7" stroke-linecap="round"/>',
    tessera: '<path d="M48 12 84 48 48 84 12 48z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M48 28 68 48 48 68 28 48z" fill="COL"/>',
    studio: '<path d="M30 18c16-10 40 4 42 22 10 8 2 30-12 38-16 12-40 4-48-12-10-18-2-38 18-48z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><circle cx="42" cy="46" r="8" fill="COL"/>',
    slate: '<rect x="14" y="18" width="68" height="48" rx="2" fill="FILL" stroke="url(#GID)" stroke-width="6"/><rect x="14" y="66" width="68" height="10" rx="2" fill="COL"/>',
    chip: '<path d="M28 20 72 16 84 48 64 78 22 72 12 40z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><path d="M36 36 58 30 66 50 42 58z" fill="COL"/>',
    lattice: '<rect x="16" y="16" width="64" height="64" rx="1" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M16 37h64M16 58h64M37 16v64M58 16v64" stroke="COL" stroke-width="5"/>',
    comb: '<path d="M48 12 76 28v32L48 76 20 60V28z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M48 28 64 38v20L48 68 32 58V38z" fill="COL"/>',
    board: '<rect x="12" y="16" width="72" height="64" rx="8" fill="FILL" stroke="url(#GID)" stroke-width="6"/><rect x="28" y="30" width="28" height="20" rx="2" fill="COL"/><circle cx="34" cy="34" r="4" fill="url(#GID)"/>',
    fold: '<path d="M18 28c10-16 50-16 60 0 8 12 8 28 0 40-10 16-50 16-60 0-8-12-8-28 0-40z" fill="FILL" stroke="url(#GID)" stroke-width="6" stroke-linejoin="round"/><path d="M30 40c8 6 28 6 36 0" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    dial: '<circle cx="48" cy="48" r="30" fill="FILL" stroke="url(#GID)" stroke-width="6.5"/><path d="M48 22v26l14 10" stroke="COL" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="48" r="5" fill="COL"/>',
    ingot: '<path d="M20 36h56l-8 28H28z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M28 48h40" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    curtain: '<path d="M18 12h60v72H18z" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M30 12v72M48 12v72M66 12v72" stroke="COL" stroke-width="5"/><path d="M18 84c10 8 20 8 30 0s20-8 30 0" fill="none" stroke="url(#GID)" stroke-width="5"/>',
    cells: '<path d="M48 12 74 27v30L48 72 22 57V27z" fill="FILL" stroke="url(#GID)" stroke-width="6.5" stroke-linejoin="round"/><path d="M48 28 62 36v16L48 60 34 52V36z" fill="COL"/>',
    cellar: '<rect x="18" y="20" width="60" height="56" rx="4" fill="FILL" stroke="url(#GID)" stroke-width="6"/><path d="M26 32h44M26 44h32" stroke="COL" stroke-width="6" stroke-linecap="round"/><circle cx="66" cy="60" r="6" fill="COL"/>',
  };

  function skinFamily(id) {
    return SKIN_FAMILY[id] || "compass";
  }

  const FAMILY_PLATE = {
    scroll: '<rect x="20" y="8" width="56" height="80" rx="4" fill="url(#FID)"/>',
    ceramic: '<circle cx="48" cy="48" r="36" fill="url(#FID)"/>',
    photogram: '<rect x="12" y="12" width="72" height="72" rx="0" fill="url(#FID)"/>',
    gallery: '<rect x="10" y="10" width="76" height="76" rx="0" fill="url(#FID)"/>',
    chapel: '<path d="M48 4 88 42 V90 H8 V42 Z" fill="url(#FID)"/>',
    mat: '<rect x="6" y="22" width="84" height="52" rx="2" fill="url(#FID)"/>',
    press: '<rect x="14" y="14" width="68" height="68" rx="0" fill="url(#FID)"/>',
    tessera: '<path d="M48 4 92 48 48 92 4 48 Z" fill="url(#FID)"/>',
    studio: '<path d="M26 12c20-10 48 4 50 24 12 10 4 34-10 44-18 14-46 6-56-12C-2 48 8 22 26 12z" fill="url(#FID)"/>',
    slate: '<rect x="8" y="14" width="80" height="68" rx="4" fill="url(#FID)"/>',
    chip: '<path d="M22 12 84 18 90 54 62 88 14 78 6 38z" fill="url(#FID)"/>',
    lattice: '<rect x="10" y="10" width="76" height="76" rx="1" fill="url(#FID)"/>',
    comb: '<path d="M48 6 86 28v40L48 90 10 68V28z" fill="url(#FID)"/>',
    board: '<rect x="8" y="12" width="80" height="72" rx="8" fill="url(#FID)"/>',
    fold: '<path d="M12 30c12-20 60-20 72 0 10 14 10 32 0 46-12 20-60 20-72 0-10-14-10-32 0-46z" fill="url(#FID)"/>',
    dial: '<circle cx="48" cy="48" r="38" fill="url(#FID)"/>',
    ingot: '<path d="M14 30h68l-10 36H24z" fill="url(#FID)"/>',
    curtain: '<rect x="14" y="6" width="68" height="84" rx="2" fill="url(#FID)"/>',
    cells: '<path d="M48 4 88 26v44L48 92 8 70V26z" fill="url(#FID)"/>',
    cellar: '<rect x="12" y="14" width="72" height="68" rx="6" fill="url(#FID)"/>',
  };

  function skinMark(colorA, colorB, id) {
    const family = skinFamily(id);
    const gid = `skin-g-${(id || "x").replace(/[^a-z0-9-]/gi, "")}`;
    const fid = `skin-f-${(id || "x").replace(/[^a-z0-9-]/gi, "")}`;
    const d = (FAMILY_PATHS[family] || FAMILY_PATHS.compass)
      .split("GID").join(gid)
      .split("FILL").join(`url(#${fid})`)
      .split("COL").join(colorB);
    const plate = (FAMILY_PLATE[family] || '<rect x="6" y="6" width="84" height="84" rx="26" fill="url(#FID)"/>').split("FID").join(fid);
    return `<svg class="wp-skin-mark" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="16" y1="80" x2="80" y2="16"><stop offset="0" stop-color="${colorA}"/><stop offset="1" stop-color="${colorB}"/></linearGradient>
        <radialGradient id="${fid}" cx="36%" cy="28%" r="70%"><stop offset="0" stop-color="${colorA}" stop-opacity="0.55"/><stop offset="1" stop-color="${colorB}" stop-opacity="0.18"/></radialGradient>
      </defs>
      ${plate}
      ${d}
    </svg>`;
  }

  function skinMarkFrom(skin) {
    const id = (skin && skin.id) || equippedSkinId();
    if (!id || id === "trailblazer") return trailblazerEmoji((skin && skin.glyph) || "🧭");
    if (!skin) {
      const a = getComputedStyle(document.documentElement).getPropertyValue("--skin-a").trim() || "#c9a227";
      const b = getComputedStyle(document.documentElement).getPropertyValue("--skin-b").trim() || "#e84a2f";
      return skinMark(a, b, id);
    }
    return skinMark(skin.colorA || "#c9a227", skin.colorB || "#e84a2f", id);
  }

  function upgradeAppIcons() {
    if (typeof WORKSPACE_APPS === "undefined") return;
    const skinId = document.documentElement.dataset.playerSkin || "trailblazer";
    const mode = usesEmojiIcons() ? "emoji" : "mark";
    WORKSPACE_APPS.forEach(app => {
      if (app && APP_EMOJI[app.id]) app.glyph = appGlyphHtml(app.id);
    });
    document.querySelectorAll(".launcher-card[data-app] .launcher-tile-glyph").forEach(el => {
      const id = el.closest("[data-app]")?.dataset.app;
      const key = `${id}:${skinId}:${mode}`;
      if (!id || !APP_EMOJI[id] || el.dataset.iconMark === key) return;
      el.dataset.iconMark = key;
      el.innerHTML = appGlyphHtml(id);
    });
    upgradeSkinGlyphs();
    retintBrandMark();
  }

  function upgradeSkinGlyphs() {
    const a = getComputedStyle(document.documentElement).getPropertyValue("--skin-a").trim() || "#c9a227";
    const b = getComputedStyle(document.documentElement).getPropertyValue("--skin-b").trim() || "#e84a2f";
    const id = equippedSkinId();
    document.querySelectorAll(".loot-profile-glyph").forEach(el => {
      const mark = id === "trailblazer" ? trailblazerEmoji("🧭") : skinMark(a, b, id);
      if (el.dataset.skinMark === id && el.innerHTML === mark) return;
      el.dataset.skinMark = id;
      el.innerHTML = mark;
    });
    document.querySelectorAll(".loot-skin-avatar").forEach(el => {
      const card = el.closest("[data-skin-equip], .loot-skin-card, [data-skin]");
      const skinId = card?.getAttribute("data-skin-equip") || card?.dataset?.skin || id;
      if (skinId === "trailblazer") {
        el.dataset.skinMark = skinId;
        el.innerHTML = trailblazerEmoji("🧭");
        return;
      }
      if (el.dataset.skinMark === skinId && el.querySelector(".wp-skin-mark")) return;
      const host = el.closest(".loot-skin-card, .loot-skin-equip, [data-skin]");
      let ca = a;
      let cb = b;
      if (host) {
        const cs = getComputedStyle(host);
        ca = cs.getPropertyValue("--skin-a").trim() || a;
        cb = cs.getPropertyValue("--skin-b").trim() || b;
      }
      el.dataset.skinMark = skinId;
      el.innerHTML = skinMark(ca, cb, skinId);
    });
  }

  const BRAND_ORIGINALS = new Map();

  function retintBrandMark() {
    const root = document.querySelector(".brand-mark");
    if (!root) return;
    if (!BRAND_ORIGINALS.size) {
      root.querySelectorAll("stop").forEach((stop, i) => {
        BRAND_ORIGINALS.set(`stop-${i}`, stop.getAttribute("stop-color"));
      });
      root.querySelectorAll(".wp-brand-core, .wp-brand-jewel").forEach((el, i) => {
        BRAND_ORIGINALS.set(`fill-${i}`, el.getAttribute("fill"));
      });
    }
    if (isTrailblazer()) {
      root.querySelectorAll("stop").forEach((stop, i) => {
        const orig = BRAND_ORIGINALS.get(`stop-${i}`);
        if (orig) stop.setAttribute("stop-color", orig);
      });
      root.querySelectorAll(".wp-brand-core, .wp-brand-jewel").forEach((el, i) => {
        const orig = BRAND_ORIGINALS.get(`fill-${i}`);
        if (orig) el.setAttribute("fill", orig);
      });
      return;
    }
    const { a, b } = equippedSkinColors();
    root.querySelectorAll("stop").forEach((stop, i) => {
      stop.setAttribute("stop-color", i % 2 === 0 ? a : b);
    });
    root.querySelectorAll(".wp-brand-core, .wp-brand-jewel").forEach(el => {
      el.setAttribute("fill", b);
    });
  }

  const HUD_ORIGINALS = new Map();

  function upgradeHudIcons() {
    const skinId = document.documentElement.dataset.playerSkin || "trailblazer";
    const mode = usesEmojiIcons() ? "emoji" : "mark";
    const map = [
      ["#nav-back", "back"],
      ["#nav-forward", "forward"],
      ["#open-command-palette", "command"],
      ["#hud-settings-btn", "settings"],
      ["#hud-pomodoro-btn", "timer"],
      ["#launch-automation-studio", "graph"],
    ];
    map.forEach(([sel, name]) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (!HUD_ORIGINALS.has(sel)) HUD_ORIGINALS.set(sel, el.innerHTML);
      const key = `${skinId}:${mode}`;
      if (el.dataset.iconUpgraded === key) return;
      el.dataset.iconUpgraded = key;
      el.innerHTML = mode === "emoji" ? HUD_ORIGINALS.get(sel) : iconSvg(name);
    });
  }

  function upgradeTabIcons() {
    const skinId = document.documentElement.dataset.playerSkin || "trailblazer";
    const mode = usesEmojiIcons() ? "emoji" : "mark";
    document.querySelectorAll(".tab-chip[data-tab]").forEach(btn => {
      const tab = btn.dataset.tab;
      if (!tab || (!TAB_ICONS[tab] && !TAB_EMOJI[tab])) return;
      const key = `${skinId}:${mode}`;
      const existing = btn.querySelector(".tab-chip-mark, .tab-chip-emoji");
      if (existing && btn.dataset.tabMark === key) return;
      if (existing) existing.remove();
      btn.dataset.tabMark = key;
      btn.insertAdjacentHTML("afterbegin", tabMark(tab));
    });
  }

  function refreshSkinChrome() {
    document.querySelectorAll(".launcher-card[data-app] .launcher-tile-glyph").forEach(el => {
      delete el.dataset.iconMark;
    });
    document.querySelectorAll("[data-icon-upgraded]").forEach(el => delete el.dataset.iconUpgraded);
    document.querySelectorAll(".tab-chip[data-tab-mark]").forEach(el => delete el.dataset.tabMark);
    document.querySelectorAll(".loot-profile-glyph, .loot-skin-avatar").forEach(el => delete el.dataset.skinMark);
    if (typeof WORKSPACE_APPS !== "undefined") {
      WORKSPACE_APPS.forEach(app => { if (app && APP_EMOJI[app.id]) delete app.glyph; });
    }
    upgradeHudIcons();
    upgradeAppIcons();
    upgradeTabIcons();
    retintBrandMark();
  }

  async function loadQuiet() {
    try {
      const quiet = await apiCall("/api/loot/quiet");
      window.WaypointNapkinIssues.lootQuiet = quiet;
      document.body.classList.toggle("loot-quiet", !!quiet.hide_ticket_window);
    } catch (_) {}
  }

  const BOARD_KEY = "waypointBoardsV1";
  window.__wpPasteAnywhere = true;

  function ensureBoardStyles() {
    if (document.getElementById("wp-board-app-styles")) return;
    const style = document.createElement("style");
    style.id = "wp-board-app-styles";
    style.textContent = `
      .wp-board-overlay { z-index: 100080; padding: 8px; }
      .wp-board-overlay .wp-board-app {
        width: min(1360px, calc(100vw - 16px));
        height: min(96vh, 940px);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        background: var(--bg-card);
        border: 1px solid color-mix(in srgb, var(--border) 78%, var(--accent));
        border-radius: 12px;
        overflow: hidden;
        color: var(--ink-primary);
        box-shadow: 0 24px 70px rgba(12, 9, 7, .32);
      }
      .wp-board-chrome {
        display: grid; grid-template-rows: auto auto;
        border-bottom: 1px solid var(--border);
        background: color-mix(in srgb, var(--bg-shell) 92%, var(--accent) 5%);
      }
      .wp-board-titlebar {
        min-height: 48px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        padding: 7px 10px 5px;
      }
      .wp-board-product {
        display: inline-grid; place-items: center; min-width: 52px; height: 30px; padding: 0 10px;
        border-radius: 4px; background: color-mix(in srgb, var(--accent) 18%, var(--bg-card));
        color: var(--ink-primary); font: 800 12px/1 var(--font-ui); letter-spacing: .02em;
      }
      .wp-board-menubar {
        min-height: 28px; display: flex; align-items: center; gap: 2px; padding: 0 10px 5px;
        color: var(--ink-secondary); font: 11px/1 var(--font-ui);
      }
      .wp-board-menubar span { padding: 5px 8px; border-radius: 4px; cursor: default; }
      .wp-board-menubar span:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--ink-primary); }
      .wp-board-chrome input[type="text"] {
        flex: 1; min-width: 160px; border: none; border-bottom: 1px solid transparent; border-radius: 0;
        background: transparent; padding: 5px 4px;
        font: 600 15px/1.3 var(--font-ui); color: inherit;
      }
      .wp-board-chrome input[type="text"]:focus { border-bottom-color: var(--accent); box-shadow: none; }
      .wp-board-chrome .wp-board-tabs { display: flex; gap: 4px; }
      .wp-board-chrome [data-board] { min-height: 30px; padding: 4px 9px; font-size: 11px; }
      .wp-board-chrome [data-board].active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--bg-card)); }
      .wp-board-app-body { min-height: 0; overflow: hidden; }
      .wp-docs-shell { display: grid; grid-template-columns: 190px minmax(0, 1fr); height: 100%; }
      .wp-docs-pages { overflow: auto; border-right: 1px solid var(--border); padding: 12px 10px; background: var(--bg-shell); }
      .wp-docs-pages::before { content: "DOCUMENT OUTLINE"; display: block; margin: 0 4px 10px; color: var(--ink-muted); font: 800 9px/1 var(--font-ui); letter-spacing: .12em; }
      .wp-docs-page-btn { display: block; width: 100%; text-align: left; margin: 0 0 6px; padding: 9px 10px; border-radius: 5px; }
      .wp-docs-page-btn.active { background: color-mix(in srgb, var(--accent) 16%, var(--bg-card)); }
      .wp-docs-paper {
        overflow: auto; background: color-mix(in srgb, var(--bg-shell) 55%, #dad6cf);
        padding: 0 8px 48px;
      }
      .wp-board-doc {
        box-sizing: border-box; width: min(8.5in, calc(100% - 18px)); min-height: 11in;
        margin: 0 auto; padding: .82in .88in;
        background: #fffdf8; color: #201d19; box-shadow: 0 8px 30px rgba(20,14,8,.16);
        font-family: "Iowan Old Style", Palatino, Georgia, serif;
        font-size: 17px; line-height: 1.68; outline: none;
      }
      .wp-board-doc img { max-width: 100%; }
      .wp-docs-toolbar {
        position: sticky; top: 0; z-index: 4; display: flex; gap: 3px; flex-wrap: wrap;
        width: min(8.5in, calc(100% - 18px)); box-sizing: border-box; margin: 0 auto;
        padding: 7px 8px; border: 1px solid var(--border); border-top: none;
        background: color-mix(in srgb, var(--bg-card) 96%, var(--accent) 4%);
        box-shadow: 0 2px 8px rgba(20,14,8,.08);
      }
      .wp-docs-toolbar button { font-size: 11px; min-width: 30px; min-height: 28px; padding: 3px 7px; border-radius: 4px; }
      .wp-docs-page-title {
        width: min(8.5in, calc(100% - 18px)) !important; box-sizing: border-box;
        margin: 9px auto 0 !important; padding: 7px 10px !important;
      }
      .wp-docs-ruler {
        position: relative; width: min(8.5in, calc(100% - 18px)); height: 24px; margin: 0 auto;
        border: 1px solid #cbc6bc; border-bottom: none; box-sizing: border-box;
        background:
          repeating-linear-gradient(90deg, transparent 0 11px, #928c82 11px 12px, transparent 12px 24px),
          #f5f1e9;
      }
      .wp-docs-ruler::before, .wp-docs-ruler::after {
        content: ""; position: absolute; top: 0; bottom: 0; width: 10.4%;
        background: rgba(121,114,103,.18);
      }
      .wp-docs-ruler::before { left: 0; border-right: 2px solid #827c72; }
      .wp-docs-ruler::after { right: 0; border-left: 2px solid #827c72; }
      .wp-sheet-shell { display: grid; grid-template-rows: auto auto minmax(0,1fr) auto; height: 100%; background: var(--bg-card); }
      .wp-sheet-toolbar { display: flex; align-items: center; gap: 3px; padding: 5px 9px; border-bottom: 1px solid var(--border); }
      .wp-sheet-toolbar button { min-width: 30px; min-height: 27px; padding: 3px 7px; border-radius: 3px; font-size: 11px; }
      .wp-sheet-formula { display: grid; grid-template-columns: 72px 26px minmax(0, 1fr) auto auto; gap: 6px; align-items: center; padding: 5px 9px; border-bottom: 1px solid var(--border); font-size: 12px; }
      .wp-sheet-cell-name { text-align: center; border-right: 1px solid var(--border); font: 700 11px/1 ui-monospace, monospace; }
      .wp-sheet-fx { color: var(--ink-muted); font: italic 700 15px/1 Georgia, serif; text-align: center; }
      .wp-sheet-formula input { min-width: 0; font-family: ui-monospace, monospace; border-radius: 2px; border-color: transparent; background: transparent; }
      .wp-sheet-formula input:focus { border-color: var(--accent); background: var(--bg-card); }
      .wp-sheet-scroll { overflow: auto; background: color-mix(in srgb, var(--bg-card) 96%, var(--bg-shell)); }
      .wp-sheet { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-variant-numeric: tabular-nums; background: var(--bg-card); }
      .wp-sheet th, .wp-sheet td { box-sizing: border-box; border: 0; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); min-width: 96px; width: 96px; height: 28px; padding: 1px 6px; }
      .wp-sheet th { background: color-mix(in srgb, var(--bg-shell) 94%, var(--accent) 4%); font: 700 10px/1 var(--font-ui); color: var(--ink-muted); position: sticky; top: 0; z-index: 3; text-align: center; }
      .wp-sheet th:first-child { left: 0; min-width: 46px; width: 46px; z-index: 5; }
      .wp-sheet tr:not(:first-child) th:first-child { position: sticky; left: 0; z-index: 2; }
      .wp-sheet td[contenteditable] { outline: none; }
      .wp-sheet td.selected { position: relative; outline: 2px solid var(--accent); outline-offset: -2px; z-index: 1; }
      .wp-sheet-tabs { display: flex; align-items: center; gap: 2px; padding: 5px 8px; border-top: 1px solid var(--border); overflow: auto; background: var(--bg-shell); }
      .wp-sheet-tabs button { border-radius: 2px; border-bottom: 2px solid transparent; }
      .wp-sheet-tabs button.active { border-bottom-color: var(--accent); color: var(--ink-primary); }
      .wp-slides-shell { display: grid; grid-template-columns: 210px minmax(0,1fr); grid-template-rows: auto minmax(0,1fr) 140px; height: 100%; }
      .wp-slide-film { overflow: auto; border-right: 1px solid var(--border); background: var(--bg-shell); padding: 12px 10px; grid-row: 1 / span 3; }
      .wp-slide-film::before { content: "SLIDES"; display: block; margin: 0 4px 10px; color: var(--ink-muted); font: 800 9px/1 var(--font-ui); letter-spacing: .12em; }
      .wp-slide-tools { display: flex; align-items: center; gap: 4px; padding: 7px 10px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg-card) 92%, var(--bg-shell)); }
      .wp-slide-tools button { min-height: 28px; border-radius: 4px; font-size: 11px; }
      .wp-slide-canvas { min-height: 0; overflow: auto; display: grid; place-items: center; padding: 28px; background: color-mix(in srgb, var(--bg-shell) 90%, #9c978e); }
      .wp-slide-frame {
        position: relative; aspect-ratio: 16 / 9; width: min(100%, calc((100vh - 330px) * 16 / 9));
        min-width: 520px; overflow: hidden; background: var(--bg-card);
        box-shadow: 0 12px 36px rgba(16,12,9,.24);
      }
      .wp-slide-thumb { display: grid; grid-template-columns: 22px minmax(0,1fr); align-items: start; gap: 5px; width: 100%; margin: 0 0 10px; padding: 0; border: none; background: transparent; text-align: left; font-size: 10px; }
      .wp-slide-thumb-number { padding-top: 4px; color: var(--ink-muted); text-align: right; }
      .wp-slide-thumb-preview {
        aspect-ratio: 16 / 9; overflow: hidden; padding: 9px; border: 1px solid var(--border); border-radius: 2px;
        background: var(--bg-card); color: var(--ink-primary); box-shadow: 0 2px 8px rgba(12,9,7,.1);
        font: 600 10px/1.25 var(--font-ui);
      }
      .wp-slide-thumb.active { outline: 2px solid var(--accent); }
      .wp-slide-stage {
        position: absolute; inset: 0; box-sizing: border-box; padding: 8% 9%; font-size: clamp(22px, 3vw, 38px); line-height: 1.3; outline: none;
        font-family: "Iowan Old Style", Palatino, Georgia, serif; overflow: auto;
        background: radial-gradient(circle at 20% 0, color-mix(in srgb, var(--accent) 10%, transparent), transparent 42%), var(--bg-card);
      }
      .wp-slide-stage h1, .wp-slide-stage h2 { line-height: 1.08; margin-top: 0; }
      .wp-slide-stage img { max-width: 100%; max-height: 70%; }
      .wp-slide-box {
        position: absolute; min-width: 96px; min-height: 36px; padding: 8px 10px;
        border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
        background: color-mix(in srgb, var(--bg-card) 92%, transparent);
        font-size: 18px; line-height: 1.4; outline: none; overflow: auto; z-index: 2;
      }
      .wp-slide-notes { grid-column: 2; display: grid; grid-template-rows: auto minmax(0,1fr); border-top: 1px solid var(--border); padding: 8px 14px 10px; background: var(--bg-card); }
      .wp-slide-notes .stub { margin-bottom: 5px; font-size: 9px; letter-spacing: .09em; text-transform: uppercase; }
      .wp-slide-notes textarea { box-sizing: border-box; width: 100%; height: 100%; border: none; border-left: 3px solid color-mix(in srgb, var(--accent) 36%, var(--border)); border-radius: 0; resize: none; padding: 7px 10px; background: transparent; color: inherit; }
      img.wp-paste-void, .wp-paste-void, img[src=""], img:not([src]) {
        display: none !important; visibility: hidden !important;
        width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important;
        padding: 0 !important; margin: 0 !important; border: none !important; background: none !important;
      }
      @media (max-width: 820px) {
        .wp-board-titlebar { gap: 5px; }
        .wp-board-product { display: none; }
        .wp-board-menubar { overflow-x: auto; }
        .wp-docs-shell, .wp-slides-shell { grid-template-columns: 1fr; }
        .wp-docs-pages, .wp-slide-film { display: none; }
        .wp-board-doc { width: calc(100% - 8px); min-height: 100%; padding: 34px 28px; }
        .wp-docs-toolbar, .wp-docs-ruler, .wp-docs-page-title { width: calc(100% - 8px) !important; }
        .wp-sheet-formula { grid-template-columns: 52px 20px minmax(120px, 1fr); }
        .wp-sheet-formula button { display: none; }
        .wp-slide-canvas { grid-column: 1; padding: 14px; }
        .wp-slide-frame { min-width: 460px; }
        .wp-slide-notes { grid-column: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function insertAtCursor(el, text) {
    if (!el) return;
    if (el.isContentEditable) {
      document.execCommand("insertHTML", false, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const value = el.value || "";
    el.value = value.slice(0, start) + text + value.slice(end);
    try { el.selectionStart = el.selectionEnd = start + text.length; } catch (_) {}
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const PASTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

  function isPastedImageType(type) {
    const t = String(type || "").toLowerCase();
    if (PASTE_IMAGE_TYPES.includes(t)) return true;
    return t.startsWith("image/");
  }

  function ensurePasteVoidStyles() {
    if (document.getElementById("wp-paste-void-styles")) return;
    const style = document.createElement("style");
    style.id = "wp-paste-void-styles";
    style.textContent = `
      img.wp-paste-void, .wp-paste-void, img[src=""], img:not([src]) {
        display: none !important; visibility: hidden !important;
        width: 0 !important; height: 0 !important; min-width: 0 !important; min-height: 0 !important;
        padding: 0 !important; margin: 0 !important; border: none !important; background: none !important;
      }
      .nts-image-figure:has(img.wp-paste-void),
      .nts-image-figure:has(img[src=""]),
      .nts-image-figure:has(img:not([src])),
      #quick-capture-image-preview:empty,
      #quick-capture-image-preview.wp-paste-void { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function hideEmptyPasteVoids(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("img").forEach(img => {
      const src = (img.getAttribute("src") || "").trim();
      const empty = !src || src === "undefined" || src === "null";
      img.classList.toggle("wp-paste-void", empty);
      if (empty) {
        img.hidden = true;
        img.style.display = "none";
        const wrap = img.closest(".nts-image-figure, .wp-paste-frame, #quick-capture-image-preview");
        if (wrap) {
          wrap.classList.add("wp-paste-void");
          wrap.hidden = true;
          wrap.style.display = "none";
        }
      }
    });
    scope.querySelectorAll(".wp-paste-void").forEach(el => {
      const img = el.tagName === "IMG" ? el : el.querySelector("img");
      const src = img ? (img.getAttribute("src") || "").trim() : "";
      if (!src) {
        el.hidden = true;
        el.style.display = "none";
      }
    });
  }

  function showCaptureImagePreview(url) {
    const preview = document.getElementById("quick-capture-image-preview");
    if (!preview) return;
    if (!url) {
      preview.innerHTML = "";
      preview.hidden = true;
      preview.classList.add("wp-paste-void");
      preview.style.display = "none";
      return;
    }
    preview.hidden = false;
    preview.classList.remove("wp-paste-void");
    preview.style.display = "";
    preview.innerHTML = `<img src="${esc(url)}" alt="pasted" class="wp-pasted-image">`;
    hideEmptyPasteVoids(preview);
  }

  async function uploadImage(file) {
    const form = new FormData();
    form.append("file", file);
    form.append("entity_type", "capture");
    form.append("entity_id", "0");
    const res = await fetch("/api/attachments", { method: "POST", body: form });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.url || (data?.id ? `/api/attachments/${data.id}/file` : "");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function resolvePastedImage(file) {
    if (!file) return "";
    try {
      const url = await uploadImage(file);
      if (url) return url;
    } catch (_) {}
    try {
      const blobUrl = URL.createObjectURL(file);
      if (blobUrl) return blobUrl;
    } catch (_) {}
    try {
      return await fileToDataUrl(file);
    } catch (_) {
      return "";
    }
  }

  async function fileFromDataUrl(src, name) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const type = blob.type || "image/png";
      return new File([blob], name || "paste.png", { type });
    } catch (_) {
      return null;
    }
  }

  async function imageFromHtml(html) {
    const match = String(html || "").match(/<img[^>]+src=["']([^"']+)["']/i);
    if (!match) return null;
    const src = match[1].replace(/&amp;/g, "&").trim();
    if (!src) return null;
    if (/^data:image\/(png|jpeg|jpg|webp)/i.test(src)) {
      const file = await fileFromDataUrl(src, "paste.png");
      return file || src;
    }
    if (/^(blob:|https?:|\/)/i.test(src)) return src;
    return null;
  }

  async function fileFromClipboard(e) {
    const items = e?.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type && isPastedImageType(item.type)) {
          const file = item.getAsFile();
          if (file) return file;
        }
      }
    }
    const files = e?.clipboardData?.files;
    if (files) {
      for (const file of files) {
        if (isPastedImageType(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || "")) return file;
      }
    }
    const html = e?.clipboardData?.getData?.("text/html") || e?.dataTransfer?.getData?.("text/html") || "";
    if (html) {
      const extracted = await imageFromHtml(html);
      if (extracted) return extracted;
    }
    if (navigator.clipboard?.read) {
      try {
        const clip = await navigator.clipboard.read();
        for (const item of clip) {
          const type = (item.types || []).find(t => isPastedImageType(t));
          if (!type) continue;
          const blob = await item.getType(type);
          const mime = type === "image/jpg" ? "image/jpeg" : type;
          return new File([blob], "paste.png", { type: mime });
        }
      } catch (_) {}
    }
    return null;
  }

  function focusedEditor() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    if (el.matches("textarea, input[type=text], input:not([type]), [contenteditable='true'], [contenteditable='']")) return el;
    return el.closest("[contenteditable='true'], [contenteditable='']");
  }

  function pastedImageHtml(url) {
    if (!url) return "";
    return `<img src="${esc(url)}" alt="pasted" class="wp-pasted-image">`;
  }

  function placePastedImage(url) {
    if (!url) {
      hideEmptyPasteVoids();
      showCaptureImagePreview("");
      return false;
    }
    const md = `![pasted](${url})`;
    const html = pastedImageHtml(url);
    const target = focusedEditor();
    let placed = false;
    if (typeof window.wpInsertPastedImage === "function" && window.wpInsertPastedImage(url, target)) placed = true;
    else if (target?.isContentEditable) {
      insertAtCursor(target, html);
      placed = true;
    } else if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
      insertAtCursor(target, md);
      placed = true;
    } else {
      if (typeof openQuickCapture === "function") openQuickCapture({ type: "feedback" });
      const details = document.getElementById("quick-capture-details");
      if (details) {
        details.value = (details.value ? `${details.value}\n` : "") + md;
        details.dispatchEvent(new Event("input", { bubbles: true }));
        details.focus();
        placed = true;
      }
    }
    showCaptureImagePreview(url);
    hideEmptyPasteVoids();
    return placed;
  }

  async function ingestImageFile(fileOrUrl) {
    if (!fileOrUrl) return false;
    if (typeof fileOrUrl === "string") {
      if (!fileOrUrl.trim()) return false;
      return placePastedImage(fileOrUrl);
    }
    const type = (fileOrUrl.type || "").toLowerCase();
    if (type && !type.startsWith("image/")) return false;
    const url = await resolvePastedImage(fileOrUrl);
    if (!url) {
      if (typeof showToast === "function") showToast("Could not save pasted image", "warn");
      hideEmptyPasteVoids();
      return false;
    }
    return placePastedImage(url);
  }

  function pickImageFallback(onPicked) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/*";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (onPicked) {
        const url = await resolvePastedImage(file);
        if (url) onPicked(url);
        else hideEmptyPasteVoids();
        return;
      }
      await ingestImageFile(file);
    };
    input.click();
  }

  function wireRobustPaste() {
    if (document.documentElement.dataset.wpPasteWired === "1") return;
    document.documentElement.dataset.wpPasteWired = "1";
    window.__wpPasteAnywhere = true;
    ensurePasteVoidStyles();
    hideEmptyPasteVoids();
    const onPaste = async (e) => {
      const payload = await fileFromClipboard(e);
      if (!payload) return;
      e.preventDefault();
      e.stopPropagation();
      await ingestImageFile(payload);
    };
    document.addEventListener("paste", onPaste, true);
    window.addEventListener("paste", onPaste, true);
    document.addEventListener("dragover", (e) => {
      const types = e.dataTransfer?.types;
      if (!types) return;
      const list = [...types];
      if (list.includes("Files") || list.includes("text/html")) e.preventDefault();
    }, true);
    document.addEventListener("drop", async (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      const file = files.find(f => isPastedImageType(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name || ""));
      if (file) {
        e.preventDefault();
        await ingestImageFile(file);
        return;
      }
      const html = e.dataTransfer?.getData("text/html") || "";
      const extracted = html ? await imageFromHtml(html) : null;
      if (!extracted) return;
      e.preventDefault();
      await ingestImageFile(extracted);
    }, true);
  }

  function defaultBoards() {
    return {
      docs: {
        title: "Untitled document",
        pages: [{ id: "p1", title: "Page 1", html: "<p>Write here. Pages stay on this machine.</p>" }],
        active: 0,
      },
      sheets: {
        tabs: [{ id: "s1", name: "Sheet 1", rows: 80, cols: 26, cells: {} }],
        active: 0,
      },
      slides: {
        title: "Untitled presentation",
        slides: [
          { id: "sl1", title: "Title", html: "<h1>Title slide</h1><p>Click to edit</p>", notes: "", boxes: [] },
          { id: "sl2", title: "What changed", html: "<h2>What changed</h2>", notes: "", boxes: [] },
          { id: "sl3", title: "Next", html: "<h2>Next</h2>", notes: "", boxes: [] },
        ],
        active: 0,
      },
    };
  }

  function readBoards() {
    try {
      const raw = JSON.parse(localStorage.getItem(BOARD_KEY) || "null");
      if (raw && raw.docs && raw.sheets && raw.slides) return raw;
    } catch (_) {}
    return defaultBoards();
  }

  function writeBoards(data) {
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function colLabel(index) {
    let n = index;
    let out = "";
    do {
      out = String.fromCharCode(65 + (n % 26)) + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
  }

  function parseCellRef(ref) {
    const m = String(ref || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { r: Number(m[2]) - 1, c: col - 1 };
  }

  function numericCell(sheet, r, c, visiting) {
    const key = `${r}:${c}`;
    const raw = sheet.cells[key] || "";
    if (!String(raw).trim()) return 0;
    const val = evaluateSheetFormula(sheet, raw, visiting);
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }

  function evaluateSheetFormula(sheet, raw, visiting) {
    const text = String(raw ?? "").trim();
    if (!text.startsWith("=")) {
      const n = Number(text);
      return text === "" ? 0 : (Number.isFinite(n) ? n : text);
    }
    const expr = text.slice(1).trim();
    const visitKey = `${sheet.id || "s"}:${expr}`;
    const seen = visiting || new Set();
    if (seen.has(visitKey)) return "#CYCLE!";
    seen.add(visitKey);
    const sumMatch = expr.match(/^SUM\(\s*([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\s*\)$/i);
    if (sumMatch) {
      const start = parseCellRef(sumMatch[1]);
      const end = parseCellRef(sumMatch[2]);
      if (!start || !end) return "#REF!";
      let total = 0;
      for (let r = Math.min(start.r, end.r); r <= Math.max(start.r, end.r); r++) {
        for (let c = Math.min(start.c, end.c); c <= Math.max(start.c, end.c); c++) {
          total += numericCell(sheet, r, c, seen);
        }
      }
      return total;
    }
    const replaced = expr.replace(/[A-Z]+\d+/gi, (ref) => {
      const parsed = parseCellRef(ref);
      if (!parsed) return "0";
      return String(numericCell(sheet, parsed.r, parsed.c, seen));
    });
    if (!/^[\d+\-*/().\s]+$/.test(replaced)) return "#VALUE!";
    try {
      return Function(`"use strict"; return (${replaced});`)();
    } catch (_) {
      return "#VALUE!";
    }
  }

  function cellDisplayValue(sheet, key, editing) {
    const raw = sheet.cells[key] || "";
    if (editing === key) return raw;
    if (String(raw).startsWith("=")) return String(evaluateSheetFormula(sheet, raw));
    return raw;
  }

  function openBoard(kind) {
    ensureBoardStyles();
    document.getElementById("wp-board-overlay")?.remove();
    const state = readBoards();
    let tab = kind === "sheets" || kind === "slides" ? kind : "docs";
    const overlay = document.createElement("div");
    overlay.id = "wp-board-overlay";
    overlay.className = "wp-board-overlay";
    overlay.innerHTML = `<div class="wp-board-app" role="dialog" aria-label="Workspace board">
      <div class="wp-board-chrome">
        <div class="wp-board-titlebar">
          <strong class="wp-board-product" id="wp-board-product">Docs</strong>
          <div class="wp-board-tabs">
            <button type="button" class="secondary" data-board="docs">Docs</button>
            <button type="button" class="secondary" data-board="sheets">Sheets</button>
            <button type="button" class="secondary" data-board="slides">Slides</button>
          </div>
          <input type="text" id="wp-board-title" spellcheck="true" aria-label="Board title">
          <label class="stub" style="display:flex;align-items:center;gap:4px;font-size:11px;">
            <input type="checkbox" id="wp-board-spell"> Spelling
          </label>
          <button type="button" class="ghost" id="wp-board-image">Image</button>
          <button type="button" class="secondary" id="wp-board-close">Close</button>
        </div>
        <div class="wp-board-menubar" aria-label="Application menu">
          <span>File</span><span>Edit</span><span>View</span><span>Insert</span>
          <span>Format</span><span>Tools</span><span>Help</span>
        </div>
      </div>
      <div class="wp-board-app-body" id="wp-board-body"></div>
    </div>`;
    document.body.appendChild(overlay);
    const body = overlay.querySelector("#wp-board-body");
    const titleInput = overlay.querySelector("#wp-board-title");
    const spellBox = overlay.querySelector("#wp-board-spell");
    const spellOn = () => {
      try { return localStorage.getItem("waypointSpellcheck") !== "off"; } catch (_) { return true; }
    };
    spellBox.checked = spellOn();
    spellBox.onchange = () => {
      try { localStorage.setItem("waypointSpellcheck", spellBox.checked ? "on" : "off"); } catch (_) {}
      window.WaypointNapkinComplete?.applySpellcheck?.();
      overlay.querySelectorAll("[contenteditable], textarea, input[type=text]").forEach(el => {
        el.setAttribute("spellcheck", spellBox.checked ? "true" : "false");
      });
    };

    const persist = () => writeBoards(state);

    function renderDocs() {
      const doc = state.docs;
      titleInput.value = doc.title || "";
      titleInput.oninput = () => { doc.title = titleInput.value; persist(); };
      if (!doc.pages.length) doc.pages.push({ id: `p${Date.now()}`, title: "Page 1", html: "<p></p>" });
      doc.active = Math.max(0, Math.min(doc.active || 0, doc.pages.length - 1));
      const page = doc.pages[doc.active];
      body.innerHTML = `<div class="wp-docs-shell">
        <aside class="wp-docs-pages">
          ${doc.pages.map((p, i) => `<button type="button" class="wp-docs-page-btn ${i === doc.active ? "active" : ""}" data-page="${i}">${esc(p.title || `Page ${i + 1}`)}</button>`).join("")}
          <button type="button" class="ghost" id="wp-docs-add">New page</button>
        </aside>
        <div class="wp-docs-paper">
          <div class="wp-docs-toolbar">
            <button type="button" class="ghost" data-doc-cmd="undo" title="Undo">↶</button>
            <button type="button" class="ghost" data-doc-cmd="redo" title="Redo">↷</button>
            <button type="button" class="ghost" data-doc-cmd="bold" title="Bold"><strong>B</strong></button>
            <button type="button" class="ghost" data-doc-cmd="italic" title="Italic"><em>I</em></button>
            <button type="button" class="ghost" data-doc-block="H1" title="Heading 1">H1</button>
            <button type="button" class="ghost" data-doc-block="H2" title="Heading 2">H2</button>
            <button type="button" class="ghost" data-doc-cmd="insertUnorderedList" title="Bulleted list">• List</button>
            <button type="button" class="ghost" data-doc-cmd="insertOrderedList" title="Numbered list">1. List</button>
            <button type="button" class="ghost" data-doc-cmd="justifyLeft" title="Align left">≡</button>
            <button type="button" class="ghost" data-doc-cmd="justifyCenter" title="Align center">≣</button>
            <button type="button" class="ghost" id="wp-docs-link" title="Link">Link</button>
          </div>
          <input class="wp-docs-page-title" type="text" id="wp-docs-page-title" value="${esc(page.title || "")}" placeholder="Page title" style="display:block;border:none;background:transparent;font:600 13px var(--font-ui);">
          <div class="wp-docs-ruler" aria-hidden="true"></div>
          <div class="wp-board-doc" id="wp-docs-editor" contenteditable="true" spellcheck="${spellBox.checked ? "true" : "false"}">${page.html || "<p></p>"}</div>
        </div>
      </div>`;
      body.querySelectorAll("[data-page]").forEach(btn => {
        btn.onclick = () => { doc.active = Number(btn.dataset.page); persist(); renderDocs(); };
      });
      body.querySelector("#wp-docs-add").onclick = () => {
        doc.pages.push({ id: `p${Date.now()}`, title: `Page ${doc.pages.length + 1}`, html: "<p></p>" });
        doc.active = doc.pages.length - 1;
        persist();
        renderDocs();
      };
      const editor = body.querySelector("#wp-docs-editor");
      const pageTitle = body.querySelector("#wp-docs-page-title");
      pageTitle.oninput = () => {
        page.title = pageTitle.value;
        persist();
        const thumb = body.querySelector(`[data-page="${doc.active}"]`);
        if (thumb) thumb.textContent = page.title || `Page ${doc.active + 1}`;
      };
      editor.oninput = () => { page.html = editor.innerHTML; persist(); hideEmptyPasteVoids(editor); };
      body.querySelectorAll("[data-doc-cmd]").forEach(btn => {
        btn.onclick = () => {
          editor.focus();
          document.execCommand(btn.dataset.docCmd, false, null);
          page.html = editor.innerHTML;
          persist();
        };
      });
      body.querySelectorAll("[data-doc-block]").forEach(btn => {
        btn.onclick = () => {
          editor.focus();
          document.execCommand("formatBlock", false, btn.dataset.docBlock);
          page.html = editor.innerHTML;
          persist();
        };
      });
      body.querySelector("#wp-docs-link").onclick = () => {
        const href = window.prompt("Link URL", "https://");
        if (!href) return;
        editor.focus();
        document.execCommand("createLink", false, href);
        page.html = editor.innerHTML;
        persist();
      };
      hideEmptyPasteVoids(editor);
    }

    function renderSheets() {
      const book = state.sheets;
      if (!book.tabs.length) book.tabs.push({ id: `s${Date.now()}`, name: "Sheet 1", rows: 80, cols: 26, cells: {} });
      book.active = Math.max(0, Math.min(book.active || 0, book.tabs.length - 1));
      const sheet = book.tabs[book.active];
      if (sheet.rows < 80) sheet.rows = 80;
      if (sheet.cols < 26) sheet.cols = 26;
      titleInput.value = sheet.name || "";
      titleInput.oninput = () => { sheet.name = titleInput.value; persist(); renderSheetTabs(); };
      let selected = "0:0";
      let editing = null;
      const cellKey = (r, c) => `${r}:${c}`;
      const refreshComputed = () => {
        body.querySelectorAll("[data-cell]").forEach(td => {
          if (editing === td.dataset.cell) return;
          td.textContent = cellDisplayValue(sheet, td.dataset.cell, editing);
        });
      };
      const paintGrid = () => {
        const rows = [];
        rows.push(`<tr><th></th>${Array.from({ length: sheet.cols }, (_, c) => `<th>${colLabel(c)}</th>`).join("")}</tr>`);
        for (let r = 0; r < sheet.rows; r++) {
          rows.push(`<tr><th>${r + 1}</th>${Array.from({ length: sheet.cols }, (_, c) => {
            const key = cellKey(r, c);
            return `<td contenteditable="true" spellcheck="false" data-cell="${key}">${esc(cellDisplayValue(sheet, key, editing))}</td>`;
          }).join("")}</tr>`);
        }
        body.querySelector("#wp-sheet-table").innerHTML = rows.join("");
        body.querySelectorAll("[data-cell]").forEach(td => {
          td.onfocus = () => {
            selected = td.dataset.cell;
            editing = selected;
            body.querySelectorAll("td.selected").forEach(el => el.classList.remove("selected"));
            td.classList.add("selected");
            td.textContent = sheet.cells[selected] || "";
            const formula = body.querySelector("#wp-sheet-formula-input");
            if (formula) formula.value = sheet.cells[selected] || "";
            const label = body.querySelector("#wp-sheet-cell-label");
            if (label) {
              const [r, c] = selected.split(":").map(Number);
              label.textContent = `${colLabel(c)}${r + 1}`;
            }
          };
          td.onblur = () => {
            if (editing === td.dataset.cell) editing = null;
            refreshComputed();
          };
          td.oninput = () => {
            sheet.cells[td.dataset.cell] = td.textContent;
            persist();
            const formula = body.querySelector("#wp-sheet-formula-input");
            if (formula && selected === td.dataset.cell) formula.value = td.textContent;
          };
        });
      };
      const renderSheetTabs = () => {
        const host = body.querySelector("#wp-sheet-tabs");
        if (!host) return;
        host.innerHTML = book.tabs.map((t, i) => `<button type="button" class="ghost ${i === book.active ? "active" : ""}" data-sheet="${i}">${esc(t.name || `Sheet ${i + 1}`)}</button>`).join("")
          + `<button type="button" class="ghost" id="wp-sheet-add">+</button>`;
        host.querySelectorAll("[data-sheet]").forEach(btn => {
          btn.onclick = () => { book.active = Number(btn.dataset.sheet); persist(); renderSheets(); };
        });
        host.querySelector("#wp-sheet-add").onclick = () => {
          book.tabs.push({ id: `s${Date.now()}`, name: `Sheet ${book.tabs.length + 1}`, rows: 80, cols: 26, cells: {} });
          book.active = book.tabs.length - 1;
          persist();
          renderSheets();
        };
      };
      body.innerHTML = `<div class="wp-sheet-shell">
        <div class="wp-sheet-toolbar" aria-label="Sheet tools">
          <button type="button" class="ghost" title="Undo">↶</button>
          <button type="button" class="ghost" title="Redo">↷</button>
          <button type="button" class="ghost" title="Currency">$</button>
          <button type="button" class="ghost" title="Percent">%</button>
          <button type="button" class="ghost" title="Decrease decimals">.0←</button>
          <button type="button" class="ghost" title="Increase decimals">→.00</button>
        </div>
        <div class="wp-sheet-formula">
          <strong class="wp-sheet-cell-name" id="wp-sheet-cell-label">A1</strong>
          <span class="wp-sheet-fx" aria-hidden="true">fx</span>
          <input id="wp-sheet-formula-input" spellcheck="false" aria-label="Formula bar" placeholder="Enter a value or formula, e.g. =A1+B1 or =SUM(A1:A3)">
          <button type="button" class="ghost" id="wp-sheet-add-row">+ rows</button>
          <button type="button" class="ghost" id="wp-sheet-add-col">+ cols</button>
        </div>
        <div class="wp-sheet-scroll"><table class="wp-sheet" id="wp-sheet-table"></table></div>
        <div class="wp-sheet-tabs" id="wp-sheet-tabs"></div>
      </div>`;
      paintGrid();
      renderSheetTabs();
      body.querySelector("#wp-sheet-add-row").onclick = () => { sheet.rows += 20; persist(); paintGrid(); };
      body.querySelector("#wp-sheet-add-col").onclick = () => { sheet.cols += 4; persist(); paintGrid(); };
      const formulaInput = body.querySelector("#wp-sheet-formula-input");
      const applyFormula = (value) => {
        sheet.cells[selected] = value;
        persist();
        const td = body.querySelector(`[data-cell="${selected}"]`);
        if (td) td.textContent = cellDisplayValue(sheet, selected, editing);
        refreshComputed();
      };
      formulaInput.oninput = (e) => {
        sheet.cells[selected] = e.target.value;
        const td = body.querySelector(`[data-cell="${selected}"]`);
        if (td && editing === selected) td.textContent = e.target.value;
        persist();
      };
      formulaInput.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        editing = null;
        applyFormula(formulaInput.value);
      };
      formulaInput.onchange = () => {
        editing = null;
        applyFormula(formulaInput.value);
      };
    }

    function renderSlides() {
      const deck = state.slides;
      titleInput.value = deck.title || "";
      titleInput.oninput = () => { deck.title = titleInput.value; persist(); };
      if (!deck.slides.length) deck.slides.push({ id: `sl${Date.now()}`, title: "Slide", html: "<h1></h1>", notes: "", boxes: [] });
      deck.active = Math.max(0, Math.min(deck.active || 0, deck.slides.length - 1));
      const slide = deck.slides[deck.active];
      if (!Array.isArray(slide.boxes)) slide.boxes = [];
      const boxesHtml = slide.boxes.map((box, i) =>
        `<div class="wp-slide-box" data-box="${i}" contenteditable="true" spellcheck="${spellBox.checked ? "true" : "false"}" style="left:${Number(box.x) || 12}%;top:${Number(box.y) || 18}%;width:${Number(box.w) || 40}%;height:${Number(box.h) || 18}%;">${box.html || "Text"}</div>`
      ).join("");
      const slidePreview = (item) => {
        const text = String(item.html || item.title || "Untitled")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return esc(text.slice(0, 72) || "Untitled slide");
      };
      body.innerHTML = `<div class="wp-slides-shell">
        <aside class="wp-slide-film">
          ${deck.slides.map((s, i) => `<button type="button" class="wp-slide-thumb ${i === deck.active ? "active" : ""}" data-slide="${i}"><span class="wp-slide-thumb-number">${i + 1}</span><span class="wp-slide-thumb-preview">${slidePreview(s)}</span></button>`).join("")}
          <button type="button" class="ghost" id="wp-slide-add">New slide</button>
          <button type="button" class="ghost" id="wp-slide-del">Delete</button>
        </aside>
        <div class="wp-slide-tools">
          <button type="button" class="ghost" id="wp-slide-new">New slide</button>
          <button type="button" class="ghost" id="wp-slide-duplicate">Duplicate</button>
          <button type="button" class="ghost" id="wp-slide-textbox">Text box</button>
          <button type="button" class="ghost" id="wp-slide-present">Present</button>
          <span class="stub" style="margin-left:auto;">16:9 · Slide ${deck.active + 1} of ${deck.slides.length}</span>
        </div>
        <div class="wp-slide-canvas">
          <div class="wp-slide-frame">
            <div class="wp-slide-stage" id="wp-slide-stage" contenteditable="true" spellcheck="${spellBox.checked ? "true" : "false"}">${slide.html || ""}</div>
            ${boxesHtml}
          </div>
        </div>
        <div class="wp-slide-notes">
          <div class="stub">Speaker notes</div>
          <textarea id="wp-slide-notes" placeholder="Notes for this slide">${esc(slide.notes || "")}</textarea>
        </div>
      </div>`;
      body.querySelectorAll("[data-slide]").forEach(btn => {
        btn.onclick = () => { deck.active = Number(btn.dataset.slide); persist(); renderSlides(); };
      });
      const addSlide = () => {
        deck.slides.push({ id: `sl${Date.now()}`, title: `Slide ${deck.slides.length + 1}`, html: "<h2>New slide</h2>", notes: "", boxes: [] });
        deck.active = deck.slides.length - 1;
        persist();
        renderSlides();
      };
      body.querySelector("#wp-slide-add").onclick = addSlide;
      body.querySelector("#wp-slide-new").onclick = addSlide;
      body.querySelector("#wp-slide-del").onclick = () => {
        if (deck.slides.length <= 1) return;
        deck.slides.splice(deck.active, 1);
        deck.active = Math.max(0, deck.active - 1);
        persist();
        renderSlides();
      };
      body.querySelector("#wp-slide-duplicate").onclick = () => {
        const duplicate = JSON.parse(JSON.stringify(slide));
        duplicate.id = `sl${Date.now()}`;
        duplicate.title = `${slide.title || "Slide"} copy`;
        deck.slides.splice(deck.active + 1, 0, duplicate);
        deck.active += 1;
        persist();
        renderSlides();
      };
      body.querySelector("#wp-slide-present").onclick = () => {
        const canvas = body.querySelector(".wp-slide-canvas");
        if (canvas?.requestFullscreen) canvas.requestFullscreen().catch(() => {});
      };
      body.querySelector("#wp-slide-textbox").onclick = () => {
        const n = slide.boxes.length;
        slide.boxes.push({
          id: `tb${Date.now()}`,
          x: 14 + (n % 4) * 6,
          y: 28 + (n % 3) * 10,
          w: 42,
          h: 18,
          html: "Text",
        });
        persist();
        renderSlides();
      };
      const stage = body.querySelector("#wp-slide-stage");
      const notes = body.querySelector("#wp-slide-notes");
      stage.oninput = () => {
        slide.html = stage.innerHTML;
        const text = stage.innerText.trim().split("\n")[0] || slide.title;
        slide.title = text.slice(0, 48);
        persist();
        hideEmptyPasteVoids(stage);
      };
      notes.oninput = () => { slide.notes = notes.value; persist(); };
      body.querySelectorAll(".wp-slide-box").forEach(boxEl => {
        boxEl.oninput = () => {
          const idx = Number(boxEl.dataset.box);
          if (slide.boxes[idx]) slide.boxes[idx].html = boxEl.innerHTML;
          persist();
        };
      });
      hideEmptyPasteVoids(body);
    }

    function render(next) {
      tab = next;
      overlay.dataset.boardKind = tab;
      const product = overlay.querySelector("#wp-board-product");
      if (product) product.textContent = tab === "sheets" ? "Sheets" : tab === "slides" ? "Slides" : "Docs";
      overlay.querySelectorAll("[data-board]").forEach(btn => btn.classList.toggle("active", btn.dataset.board === tab));
      if (tab === "sheets") renderSheets();
      else if (tab === "slides") renderSlides();
      else renderDocs();
    }

    overlay.querySelectorAll("[data-board]").forEach(btn => {
      btn.onclick = () => render(btn.dataset.board);
    });
    overlay.querySelector("#wp-board-close").onclick = () => overlay.remove();
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#wp-board-image").onclick = () => {
      pickImageFallback((url) => {
        if (!url) {
          hideEmptyPasteVoids(overlay);
          return;
        }
        const editor = overlay.querySelector("[contenteditable='true']");
        if (editor) {
          editor.focus();
          insertAtCursor(editor, pastedImageHtml(url));
          hideEmptyPasteVoids(overlay);
        }
      });
    };
    render(tab);
  }

  function injectBoardLaunch() {
    if (document.getElementById("wp-board-launch")) return;
    const host = document.querySelector(".hud-metrics") || document.getElementById("top-hud");
    if (!host) return;
    const btn = document.createElement("button");
    btn.id = "wp-board-launch";
    btn.type = "button";
    btn.className = "hud-icon-btn";
    btn.title = "Docs / Sheets / Slides";
    btn.innerHTML = iconSvg("graph");
    btn.onclick = () => openBoard("docs");
    host.appendChild(btn);
  }

  function mathChallenge() {
    const a = 4 + Math.floor(Math.random() * 12);
    const b = 3 + Math.floor(Math.random() * 9);
    return { prompt: `${a} + ${b}`, answer: String(a + b) };
  }

  function memoryTiles() {
    const glyphs = ["▲", "●", "■", "◆", "★", "✚", "☾", "☀"];
    const pair = glyphs.slice(0, 6).flatMap(g => [g, g]).sort(() => Math.random() - 0.5);
    return pair;
  }

  function showAlarm(alarm) {
    document.getElementById("wp-alarm-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "wp-alarm-overlay";
    overlay.className = "wp-alarm-overlay";
    if (alarm.kind === "memory") {
      const tiles = memoryTiles();
      overlay.innerHTML = `<div class="wp-alarm-card">
        <strong>${esc(alarm.title || "Alarm")}</strong>
        <p class="stub">Match the pairs to dismiss.</p>
        <div class="wp-memory-grid">${tiles.map((g, i) => `<button type="button" class="wp-memory-tile" data-g="${esc(g)}" data-i="${i}"></button>`).join("")}</div>
      </div>`;
      let open = [];
      let matched = 0;
      overlay.querySelectorAll(".wp-memory-tile").forEach(btn => {
        btn.onclick = () => {
          if (btn.classList.contains("matched") || open.includes(btn)) return;
          btn.textContent = btn.dataset.g;
          btn.classList.add("open");
          open.push(btn);
          if (open.length === 2) {
            const [a, b] = open;
            if (a.dataset.g === b.dataset.g) {
              a.classList.add("matched");
              b.classList.add("matched");
              matched += 1;
              open = [];
              if (matched >= 6) overlay.remove();
            } else {
              setTimeout(() => {
                open.forEach(el => { el.textContent = ""; el.classList.remove("open"); });
                open = [];
              }, 420);
            }
          }
        };
      });
    } else {
      const q = mathChallenge();
      overlay.innerHTML = `<div class="wp-alarm-card">
        <strong>${esc(alarm.title || "Alarm")}</strong>
        <div class="wp-alarm-math">${esc(q.prompt)}</div>
        <input type="text" id="wp-alarm-answer" inputmode="numeric" placeholder="answer">
        <button type="button" class="primary" id="wp-alarm-ok">Dismiss</button>
      </div>`;
      const dismissIfSolved = () => {
        if (overlay.querySelector("#wp-alarm-answer").value.trim() === q.answer) overlay.remove();
        else if (typeof showToast === "function") showToast("Solve it to dismiss", "warn");
      };
      overlay.querySelector("#wp-alarm-ok").onclick = dismissIfSolved;
      overlay.querySelector("#wp-alarm-answer").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dismissIfSolved(); }
      });
    }
    document.body.appendChild(overlay);
    overlay.querySelector("#wp-alarm-answer")?.focus();
  }

  async function pollAlarms() {
    try {
      const res = await apiCall("/api/alarms");
      (res.due || []).forEach((alarm, i) => {
        const key = `wp-alarm-seen-${alarm.id}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        setTimeout(() => showAlarm(alarm), i * 200);
      });
    } catch (_) {}
  }

  function injectMiniDock() {
    // HUD cluster already exists as #wp-focus-dock (bottom-left). Never recreate a body footer.
    document.getElementById("wp-mini-dock")?.remove();
    const dock = document.getElementById("wp-focus-dock");
    const hideGame = document.documentElement.classList.contains("wp-hide-game")
      || document.body?.classList.contains("wp-hide-game")
      || document.documentElement.getAttribute("data-wp-hide-game") === "on";
    if (dock) dock.hidden = !!hideGame;
    const mathBtn = document.getElementById("wp-mini-math");
    const memoryBtn = document.getElementById("wp-mini-memory");
    const alarmBtn = document.getElementById("wp-set-alarm");
    if (!mathBtn || mathBtn.dataset.wired === "1") return;
    mathBtn.dataset.wired = "1";
    mathBtn.onclick = () => showAlarm({ title: "Quick math", kind: "math" });
    memoryBtn.onclick = () => showAlarm({ title: "Memory", kind: "memory" });
    alarmBtn.onclick = async () => {
      const title = window.prompt("Alarm title", "Focus check");
      if (!title) return;
      const mins = Number(window.prompt("Minutes from now", "25") || "25");
      const fire = new Date(Date.now() + Math.max(1, mins) * 60000).toISOString();
      const kind = window.confirm("OK = math, Cancel = memory") ? "math" : "memory";
      await apiCall("/api/alarms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, fire_at: fire, kind }),
      });
      if (typeof showToast === "function") showToast(`Alarm in ${mins}m`, "good");
    };
  }

  function injectSyncCard() {
    if (typeof ACTIVE_TAB === "undefined" || ACTIVE_TAB !== "Settings") return;
    if (document.getElementById("wp-sync-card")) return;
    const host = document.getElementById("wp-integrations") || document.querySelector("#main .card");
    if (!host) return;
    const card = document.createElement("div");
    card.id = "wp-sync-card";
    card.className = "wp-sync-card";
    card.innerHTML = `<strong>Instance sync</strong>
      <p class="stub">Snapshot this machine as a peer, then pull the same planner bundle on another Tailscale host. Bind never uses 0.0.0.0.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button type="button" class="primary" id="wp-sync-push">Push snapshot</button>
        <button type="button" class="secondary" id="wp-sync-pull">Pull snapshot</button>
      </div>
      <code id="wp-sync-meta"></code>`;
    host.appendChild(card);
    card.querySelector("#wp-sync-push").onclick = async () => {
      const bundle = await apiCall("/api/sync/bundle");
      const saved = await apiCall("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: bundle, role: "server" }),
      });
      card.querySelector("#wp-sync-meta").textContent = saved.updated_at || "pushed";
    };
    card.querySelector("#wp-sync-pull").onclick = async () => {
      const snap = await apiCall("/api/sync");
      card.querySelector("#wp-sync-meta").textContent = JSON.stringify(snap.role || "peer") + " · " + (snap.updated_at || "empty");
      if (typeof showToast === "function") showToast("Snapshot loaded — merge is additive", "info");
    };
  }

  function restyleParallel() {
    if (typeof ACTIVE_TAB === "undefined" || ACTIVE_TAB !== "Parallel") return;
    document.body.classList.add("wp-parallel-restyle");
  }

  function paintBlockedTasks() {
    document.querySelectorAll("[data-prerequisite], [data-blocked]").forEach(() => {});
  }

  // Every one of these callbacks writes to the DOM (innerHTML, appendChild, remove,
  // classList, style). Running them straight from a subtree MutationObserver fed their own
  // writes back in as new mutations, which re-ran them, forever. Rendering anything large --
  // the skin locker's card grid above all -- lit that fuse and killed the renderer outright:
  // no JS exception to catch, just a dead tab. That is the skin window "crash".
  //
  // So: disconnect while the pass runs, so our own writes cannot re-trigger it, and coalesce
  // a burst of mutations into one pass per frame instead of one per mutation record.
  let upgradePending = false;
  function runUpgradePass() {
    upgradePending = false;
    obs.disconnect();
    try {
      upgradeHudIcons();
      upgradeAppIcons();
      upgradeTabIcons();
      injectBoardLaunch();
      injectMiniDock();
      injectSyncCard();
      restyleParallel();
      paintBlockedTasks();
      hideEmptyPasteVoids();
    } finally {
      // Always reconnect, or one throw would silently kill every icon upgrade for the session.
      if (document.body) obs.observe(document.body, OBSERVER_OPTIONS);
    }
  }

  const OBSERVER_OPTIONS = { childList: true, subtree: true };
  const obs = new MutationObserver(() => {
    if (upgradePending) return;
    upgradePending = true;
    requestAnimationFrame(runUpgradePass);
  });

  document.addEventListener("DOMContentLoaded", () => {
    upgradeHudIcons();
    upgradeAppIcons();
    upgradeTabIcons();
    injectBoardLaunch();
    injectMiniDock();
    wireRobustPaste();
    hideEmptyPasteVoids();
    loadQuiet();
    pollAlarms();
    setInterval(pollAlarms, 30000);
    obs.observe(document.body, OBSERVER_OPTIONS);
  });

  window.wpOpenBoard = openBoard;
  window.wpShowAlarm = showAlarm;
  window.wpSkinMark = skinMarkFrom;
  window.wpAppMark = appGlyphHtml;
  window.wpUsesEmojiIcons = usesEmojiIcons;
  window.wpIsTrailblazer = isTrailblazer;
  window.wpAppEmoji = (id) => APP_EMOJI[id] || "";
  window.wpSkinFamily = skinFamily;
  window.wpRefreshSkinChrome = refreshSkinChrome;
  window.wpResolvePastedImage = resolvePastedImage;
  window.wpPickImageFile = pickImageFallback;
  window.wpPlacePastedImage = placePastedImage;
  window.wpHidePasteVoids = hideEmptyPasteVoids;
  window.wpEvalSheetFormula = evaluateSheetFormula;
  window.fileToDataUrl = fileToDataUrl;
})();
