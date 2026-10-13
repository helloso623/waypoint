/* Depth pass: real arcade, napkin layout, Jump gone, voice, upgrades, event drag. */
(function () {
  function apiCall(path, opts) {
    if (typeof api === "function") return api(path, opts);
    return fetch(path, opts).then(r => r.json());
  }
  function esc(v) {
    return typeof escapeHtml === "function" ? escapeHtml(String(v ?? "")) : String(v ?? "");
  }

  function renderFastTravelSwitcher() { return ""; }
  window.renderFastTravelSwitcher = renderFastTravelSwitcher;

  const WAYPOINT_MARKS = {
    agent: ["#c9a227", "#e84a2f"],
    hub: ["#d97706", "#7c2d12"],
    planner: ["#2d7dd2", "#163a6b"],
    capture: ["#c98500", "#7c2d12"],
    studio: ["#64748b", "#1e293b"],
    blueprint: ["#9085e9", "#4c1d95"],
    arcade: ["#e11d48", "#7f1d1d"],
    parallel: ["#8b5cf6", "#1e1b4b"],
    people: ["#199e70", "#14532d"],
    system: ["#94a3b8", "#334155"],
  };

  // Icon system, not ten unrelated doodles:
  //   * 96 grid, soft gradient squircle behind every mark so the set shares a silhouette
  //   * duotone -- a translucent fill carries the shape, a 7px gradient stroke defines it
  //   * exactly one solid accent per icon as the focal point
  //   * nothing thinner than 5px and no detail below ~8 units, so it survives 28px
  const APP_SHAPES = {
    // conversation, with a spark: language in, actions out
    agent: '<path d="M26 28h44a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H50L34 82V70h-8a10 10 0 0 1-10-10V38a10 10 0 0 1 10-10z" fill="FILL" stroke="url(#GID)" stroke-width="7" stroke-linejoin="round"/><path d="M62 30l3.5 8.5L74 42l-8.5 3.5L62 54l-3.5-8.5L50 42l8.5-3.5z" fill="COL"/>',
    // bookmark over a card: the things you keep to hand
    hub: '<rect x="18" y="16" width="60" height="64" rx="12" fill="FILL" stroke="url(#GID)" stroke-width="7"/><path d="M40 16v34l12-9 12 9V16" fill="COL"/>',
    // calendar with one day claimed
    planner: '<rect x="14" y="26" width="68" height="56" rx="12" fill="FILL" stroke="url(#GID)" stroke-width="7"/><path d="M14 44h68" stroke="url(#GID)" stroke-width="7"/><path d="M32 14v18M64 14v18" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><rect x="30" y="54" width="16" height="14" rx="4" fill="COL"/>',
    // bulb: the fast idea
    capture: '<path d="M48 14a26 26 0 0 1 15 47v7H33v-7a26 26 0 0 1 15-47z" fill="FILL" stroke="url(#GID)" stroke-width="7" stroke-linejoin="round"/><rect x="38" y="74" width="20" height="8" rx="4" fill="COL"/><path d="M42 86h12" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    // cube under construction: things you ship
    studio: '<path d="M48 12l32 18v36L48 84 16 66V30z" fill="FILL" stroke="url(#GID)" stroke-width="7" stroke-linejoin="round"/><path d="M16 30l32 18 32-18M48 48v36" stroke="url(#GID)" stroke-width="7" stroke-linejoin="round"/><circle cx="48" cy="48" r="7" fill="COL"/>',
    // node graph: wired logic
    blueprint: '<path d="M30 34l36 34M66 34L30 68" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><circle cx="26" cy="30" r="12" fill="FILL" stroke="url(#GID)" stroke-width="7"/><circle cx="70" cy="30" r="12" fill="FILL" stroke="url(#GID)" stroke-width="7"/><circle cx="48" cy="74" r="12" fill="COL"/>',
    // target, struck: drills and streaks
    arcade: '<circle cx="48" cy="48" r="34" fill="FILL" stroke="url(#GID)" stroke-width="7"/><circle cx="48" cy="48" r="17" fill="none" stroke="url(#GID)" stroke-width="7"/><circle cx="48" cy="48" r="7" fill="COL"/>',
    // orbit: a second life running alongside
    parallel: '<circle cx="48" cy="48" r="30" fill="FILL"/><circle cx="48" cy="48" r="16" fill="COL"/><ellipse cx="48" cy="48" rx="36" ry="15" fill="none" stroke="url(#GID)" stroke-width="7" transform="rotate(-28 48 48)"/><ellipse cx="48" cy="48" rx="36" ry="15" fill="none" stroke="url(#GID)" stroke-width="7" transform="rotate(28 48 48)"/>',
    // address book, not people silhouettes
    people: '<path d="M20 16h54c6 0 10 5 10 11v42c0 6-4 11-10 11H20c-6 0-10-5-10-11V27c0-6 4-11 10-11z" fill="FILL" stroke="url(#GID)" stroke-width="7"/><path d="M20 16h16v64H20c-6 0-10-5-10-11V27c0-6 4-11 10-11z" fill="COL" opacity=".72"/><path d="M46 36h22M46 50h18M46 64h14" stroke="COL" stroke-width="6" stroke-linecap="round"/>',
    // aperture: the control room
    system: '<circle cx="48" cy="48" r="34" fill="FILL" stroke="url(#GID)" stroke-width="7"/><path d="M48 14v26M48 56v26M14 48h26M56 48h26" stroke="url(#GID)" stroke-width="7" stroke-linecap="round"/><circle cx="48" cy="48" r="10" fill="COL"/>',
  };

  function waypointMark(id) {
    const [a, b] = WAYPOINT_MARKS[id] || ["#c9a227", "#e84a2f"];
    const gid = `wp-g-${id}`;
    const fid = `wp-f-${id}`;
    const shape = (APP_SHAPES[id] || APP_SHAPES.system)
      .split("GID").join(gid)
      .split("FILL").join(`url(#${fid})`)
      .split("COL").join(b);
    return `<svg class="ws-mark" width="30" height="30" viewBox="-6 -6 108 108" aria-hidden="true">
      <defs>
        <linearGradient id="${gid}" x1="8" y1="88" x2="88" y2="8">
          <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
        </linearGradient>
        <linearGradient id="${fid}" x1="8" y1="88" x2="88" y2="8">
          <stop offset="0" stop-color="${a}" stop-opacity="0.30"/>
          <stop offset="1" stop-color="${b}" stop-opacity="0.16"/>
        </linearGradient>
      </defs>
      <rect x="-6" y="-6" width="108" height="108" rx="30" fill="url(#${fid})" opacity="0.5"/>
      ${shape}
    </svg>`;
  }

  function patchWorkspaceGlyphs() {
    /* Icon chrome is owned by napkin_issues — do not stamp people figures. */
  }

  const SKIN_POWERS = {
    emberwing: { coin: 1.18, label: "Forge yield +18% coins" },
    ember: { coin: 1.18, label: "Forge yield +18% coins" },
    solar: { coin: 1.1, label: "Solar mint +10% coins" },
    volt: { depth: 2, label: "Arcade thinks deeper" },
    frost: { pity: 2, label: "Pity climbs faster" },
    aurora: { forecast: 3, label: "+3 forecast days" },
    forest: { paint: 0.25, label: "Painted hours mint more" },
    moss: { paint: 0.2, label: "Living yield on paint" },
    tide: { label: "Tidekeeper: cart finds cheaper" },
    void: { rag: 8, label: "Void map: deeper napkin RAG" },
    prism: { coin: 1.25, forecast: 7, label: "Sovereign coins + forecast" },
    neon: { label: "Neon: HUD pulse on complete" },
    gold: { coin: 1.2, label: "Gold standard +20% coins" },
    magma: { chest: 1, label: "Caches drop extra common" },
  };

  function equippedPower() {
    const skin = document.documentElement.dataset.playerSkin || "trailblazer";
    const effect = document.documentElement.dataset.skinEffect || "";
    return SKIN_POWERS[skin] || SKIN_POWERS[effect] || { coin: 1, label: "Starter kit" };
  }

  function applySkinPowerDataset() {
    const power = equippedPower();
    document.documentElement.dataset.skinPower = power.label || "";
    const pill = document.getElementById("hud-status-pill");
    if (pill) pill.title = power.label || "Skin equipped";
    document.querySelectorAll(".loot-skin-card.is-active, .loot-profile-chip").forEach(el => {
      if (el.querySelector(".wp-skin-power")) return;
      const p = document.createElement("p");
      p.className = "wp-skin-power";
      p.textContent = power.label;
      el.appendChild(p);
    });
  }

  function overlay(html) {
    if (gameFeaturesHidden()) return document.createElement("div");
    injectArcadeStyles();
    clearArcadeTimers();
    document.getElementById("wp-arcade-overlay")?.remove();
    const el = document.createElement("div");
    el.id = "wp-arcade-overlay";
    el.className = "wp-arcade-overlay";
    el.innerHTML = html;
    el.addEventListener("click", e => {
      if (e.target === el) {
        clearArcadeTimers();
        el.remove();
      }
    });
    document.body.appendChild(el);
    return el;
  }

  const arcadeTimers = new Set();
  function clearArcadeTimers() {
    arcadeTimers.forEach(id => window.clearInterval(id));
    arcadeTimers.clear();
  }
  function arcadeInterval(fn, ms) {
    const id = window.setInterval(fn, ms);
    arcadeTimers.add(id);
    return id;
  }
  function fmtClock(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function bindArcadeClose(el) {
    if (!el) return;
    el.querySelectorAll("#wp-arcade-close").forEach(btn => {
      btn.onclick = () => { clearArcadeTimers(); el.remove(); };
    });
  }
  function makeDualClocks(seconds, ids, onFlag) {
    let remaining = { w: seconds, b: seconds };
    let side = "w";
    let stopped = false;
    const paint = () => {
      const wEl = document.getElementById(ids.w);
      const bEl = document.getElementById(ids.b);
      if (wEl) {
        wEl.textContent = fmtClock(remaining.w);
        wEl.classList.toggle("active", side === "w" && !stopped);
      }
      if (bEl) {
        bEl.textContent = fmtClock(remaining.b);
        bEl.classList.toggle("active", side === "b" && !stopped);
      }
    };
    arcadeInterval(() => {
      if (stopped) return;
      remaining[side] -= 1;
      if (remaining[side] <= 0) {
        remaining[side] = 0;
        stopped = true;
        paint();
        if (typeof onFlag === "function") onFlag(side);
        return;
      }
      paint();
    }, 1000);
    paint();
    return {
      setSide(next) { side = next; paint(); },
      stop() { stopped = true; paint(); },
      reset() {
        remaining = { w: seconds, b: seconds };
        stopped = false;
        side = "w";
        paint();
      },
    };
  }
  function makeElapsedClock(id) {
    let elapsed = 0;
    let stopped = false;
    const paint = () => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmtClock(elapsed);
    };
    arcadeInterval(() => {
      if (stopped) return;
      elapsed += 1;
      paint();
    }, 1000);
    paint();
    return {
      stop() { stopped = true; },
      reset() { elapsed = 0; stopped = false; paint(); },
    };
  }

  function gameFeaturesHidden() {
    if (window.WaypointLoot?.gameFeaturesHidden) return window.WaypointLoot.gameFeaturesHidden();
    try {
      const hide = localStorage.getItem("wp-hide-game");
      if (hide === "1" || hide === "on" || hide === "true") return true;
      if (localStorage.getItem("waypointGameOff") === "on") return true;
    } catch (_) {}
    return !!(document.body?.classList.contains("wp-hide-game") || document.body?.classList.contains("game-off"));
  }

  function mintGameCoins(amount, reason) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (window.WaypointLoot?.awardLootCoins) window.WaypointLoot.awardLootCoins(n || 6, reason || "Arcade", true);
    apiCall("/api/coins/from-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ painted_hours: 0, played_game: true }),
    }).then(showCoinBreakdown).catch(() => {});
  }

  function injectArcadeStyles() {
    if (document.getElementById("wp-arcade-game-css")) return;
    const el = document.createElement("style");
    el.id = "wp-arcade-game-css";
    el.textContent = `
      .wp-arcade-overlay { position: fixed; inset: 0; z-index: 70; background: radial-gradient(circle at 50% 20%, rgba(40,28,16,.55), rgba(6,4,2,.92)); display: grid; place-items: center; padding: 12px; }
      .wp-arcade-card, .wp-arcade-app { width: min(1080px, 100%); max-height: min(94vh, 920px); overflow: auto; padding: 0; border-radius: 18px; background: color-mix(in srgb, var(--bg-card) 94%, #1a1208); border: 1px solid var(--border); box-shadow: 0 28px 90px rgba(0,0,0,.5); }
      .wp-arcade-app { display: flex; flex-direction: column; overflow: hidden; }
      .wp-arcade-appbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid color-mix(in srgb, #c9a227 35%, var(--border)); background: linear-gradient(180deg, color-mix(in srgb, #3a2a1a 28%, var(--bg-card)), var(--bg-card)); }
      .wp-arcade-brand { font: 800 15px/1.1 var(--font-display, ui-serif, Georgia, serif); letter-spacing: .04em; }
      .wp-arcade-brand small { display: block; font: 700 10px/1.2 var(--font-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-muted); margin-top: 3px; }
      .wp-arcade-clocks { display: flex; gap: 8px; }
      .wp-arcade-clock { min-width: 92px; text-align: center; padding: 8px 10px; border-radius: 10px; background: #1a1208; color: #f0d9b5; font: 800 16px/1 ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .wp-arcade-clock span { display: block; font: 700 9px/1.2 sans-serif; letter-spacing: .12em; text-transform: uppercase; opacity: .7; margin-bottom: 4px; }
      .wp-arcade-clock.active { background: #c9a227; color: #1a1208; }
      .wp-arcade-stage { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 16px; padding: 16px; align-items: start; overflow: auto; }
      .wp-arcade-side { display: grid; gap: 10px; align-content: start; }
      .wp-arcade-toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 16px; }
      .wp-arcade-hub { padding: 22px 18px 16px; }
      .wp-arcade-hub .wp-arcade-toolbar { padding: 12px 0 0; }
      .wp-board { display: grid; gap: 0; width: max-content; margin: 0 auto; border: 4px solid #3a2a1a; box-shadow: inset 0 0 0 2px #c9a227, 0 16px 40px rgba(0,0,0,.28); }
      .wp-board button { width: 48px; height: 48px; border: none; font-size: 28px; cursor: pointer; background: #f0d9b5; color: #1a1208; }
      .wp-board button.dark { background: #b58863; }
      .wp-board button.legal { box-shadow: inset 0 0 0 3px #c9a227; }
      .wp-board button.selected { outline: 3px solid #e8c547; }
      .wp-board.go { background: #d7b899; padding: 10px; gap: 0; background-image: linear-gradient(#c4a574 1px, transparent 1px), linear-gradient(90deg, #c4a574 1px, transparent 1px); background-size: 34px 34px; }
      .wp-board.go button { width: 34px; height: 34px; border-radius: 50%; background: transparent; font-size: 22px; }
      .wp-board.reversi button { width: 44px; height: 44px; border-radius: 50%; margin: 2px; font-size: 26px; background: #166534; color: #f8fafc; box-shadow: inset 0 0 0 1px #14532d; }
      .wp-board.reversi button.legal { background: #15803d; box-shadow: inset 0 0 0 3px #fde047; }
      .wp-klondike { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; min-height: 340px; padding: 8px; background: radial-gradient(circle at 50% 0%, #166534, #052e16); border-radius: 12px; }
      .wp-klondike .col { min-height: 220px; width: 78px; display: flex; flex-direction: column; }
      .wp-card-face { width: 72px; min-height: 96px; border-radius: 8px; border: 1px solid #c9a227; background: #f7f1e3; color: #1a1208; font: 700 13px/1.2 ui-serif, Georgia, serif; }
      .wp-card-face.red { color: #9b1c1c; }
      .wp-card-back { background: repeating-linear-gradient(45deg, #7c2d12, #7c2d12 6px, #9a3412 6px, #9a3412 12px); color: transparent; }
      .wp-arcade-status { margin: 0; color: var(--ink-secondary); font-size: 13px; }
      .wp-move-list { max-height: 240px; overflow: auto; font: 12px/1.45 ui-monospace, monospace; color: var(--ink-muted); background: color-mix(in srgb, var(--bg) 80%, #1a1208); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; min-height: 120px; }
      .wp-move-list ol { margin: 0; padding: 0 0 0 18px; }
      .wp-arcade-files { display: grid; grid-template-columns: repeat(8, 48px); width: max-content; margin: 4px auto 0; font: 700 10px/1 ui-monospace, monospace; color: var(--ink-muted); text-align: center; }
      body.wp-hide-game .wp-arcade-overlay, body.game-off .wp-arcade-overlay { display: none !important; }
      @media (max-width: 820px) { .wp-arcade-stage { grid-template-columns: 1fr; } .wp-move-list { max-height: 110px; } }
    `;
    document.head.appendChild(el);
  }

  const PIECES = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000, p: -100, n: -320, b: -330, r: -500, q: -900, k: -20000 };
  const PST = {
    P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  };

  function startChessBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(""));
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    for (let c = 0; c < 8; c++) {
      b[0][c] = back[c].toLowerCase();
      b[1][c] = "p";
      b[6][c] = "P";
      b[7][c] = back[c];
    }
    return b;
  }

  function chessMovesRaw(board, r, c, meta) {
    const p = board[r][c];
    if (!p) return [];
    const white = p === p.toUpperCase();
    const dir = white ? -1 : 1;
    const enemy = ch => ch && ((ch === ch.toUpperCase()) !== white);
    const empty = ch => !ch;
    const inb = (y, x) => y >= 0 && y < 8 && x >= 0 && x < 8;
    const out = [];
    const slide = (dr, dc) => {
      let y = r + dr, x = c + dc;
      while (inb(y, x)) {
        if (empty(board[y][x])) out.push([y, x]);
        else { if (enemy(board[y][x])) out.push([y, x]); break; }
        y += dr; x += dc;
      }
    };
    const kind = p.toUpperCase();
    if (kind === "P") {
      if (inb(r + dir, c) && empty(board[r + dir][c])) out.push([r + dir, c]);
      const start = white ? 6 : 1;
      if (r === start && empty(board[r + dir][c]) && empty(board[r + 2 * dir][c])) out.push([r + 2 * dir, c]);
      [[dir, -1], [dir, 1]].forEach(([dr, dc]) => {
        if (inb(r + dr, c + dc) && enemy(board[r + dr][c + dc])) out.push([r + dr, c + dc]);
        if (meta?.ep && meta.ep[0] === r + dr && meta.ep[1] === c + dc && empty(board[r + dr][c + dc])) {
          out.push([r + dr, c + dc, "ep"]);
        }
      });
    } else if (kind === "N") {
      [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
        const y = r + dr, x = c + dc;
        if (inb(y, x) && (empty(board[y][x]) || enemy(board[y][x]))) out.push([y, x]);
      });
    } else if (kind === "B") { slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1); }
    else if (kind === "R") { slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1); }
    else if (kind === "Q") { slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1); slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1); }
    else if (kind === "K") {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const y = r + dr, x = c + dc;
        if (inb(y, x) && (empty(board[y][x]) || enemy(board[y][x]))) out.push([y, x]);
      }
      const castle = meta?.castle || {};
      const home = white ? 7 : 0;
      if (r === home && c === 4 && !inCheck(board, white)) {
        const canK = white ? castle.K !== false : castle.k !== false;
        const canQ = white ? castle.Q !== false : castle.q !== false;
        if (canK && empty(board[home][5]) && empty(board[home][6]) && (board[home][7] || "").toUpperCase() === "R") {
          const mid = applyChess(board, { fr: r, fc: c, tr: home, tc: 5 });
          if (!inCheck(mid, white)) out.push([home, 6, "castleK"]);
        }
        if (canQ && empty(board[home][3]) && empty(board[home][2]) && empty(board[home][1]) && (board[home][0] || "").toUpperCase() === "R") {
          const mid = applyChess(board, { fr: r, fc: c, tr: home, tc: 3 });
          if (!inCheck(mid, white)) out.push([home, 2, "castleQ"]);
        }
      }
    }
    return out;
  }

  function kingPos(board, white) {
    const k = white ? "K" : "k";
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return [r, c];
    return null;
  }

  function inCheck(board, white) {
    const k = kingPos(board, white);
    if (!k) return true;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if ((p === p.toUpperCase()) === white) continue;
      if (chessMovesRaw(board, r, c).some(([tr, tc]) => tr === k[0] && tc === k[1])) return true;
    }
    return false;
  }

  function applyChess(board, move) {
    const next = board.map(row => row.slice());
    const piece = next[move.fr][move.fc];
    next[move.tr][move.tc] = piece;
    next[move.fr][move.fc] = "";
    if (move.flag === "ep") next[move.fr][move.tc] = "";
    if (move.flag === "castleK") {
      next[move.tr][5] = next[move.tr][7];
      next[move.tr][7] = "";
    }
    if (move.flag === "castleQ") {
      next[move.tr][3] = next[move.tr][0];
      next[move.tr][0] = "";
    }
    if (next[move.tr][move.tc] === "P" && move.tr === 0) next[move.tr][move.tc] = "Q";
    if (next[move.tr][move.tc] === "p" && move.tr === 7) next[move.tr][move.tc] = "q";
    return next;
  }

  function legalMoves(board, r, c, meta) {
    const p = board[r][c];
    if (!p) return [];
    const white = p === p.toUpperCase();
    return chessMovesRaw(board, r, c, meta).filter(cell => {
      const [tr, tc, flag] = cell;
      const next = applyChess(board, { fr: r, fc: c, tr, tc, flag });
      return !inCheck(next, white);
    });
  }

  function allLegal(board, white, meta) {
    const moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || (p === p.toUpperCase()) !== white) continue;
      legalMoves(board, r, c, meta).forEach(([tr, tc, flag]) => moves.push({ fr: r, fc: c, tr, tc, flag }));
    }
    return moves;
  }

  function scoreBoard(board) {
    let s = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      s += VAL[p] || 0;
      const table = PST[p.toUpperCase()];
      if (table) {
        const idx = p === p.toUpperCase() ? r * 8 + c : (7 - r) * 8 + c;
        s += (p === p.toUpperCase() ? 1 : -1) * (table[idx] || 0) * 0.2;
      }
    }
    if (inCheck(board, false)) s += 40;
    if (inCheck(board, true)) s -= 40;
    return s;
  }

  function arcadeDepth() {
    return Math.max(1, Number(equippedPower().depth || 1));
  }

  function bestBlackMove(board, meta) {
    const depth = arcadeDepth();
    const replies = allLegal(board, false, meta);
    if (!replies.length) return null;
    let best = replies[0];
    let bestScore = Infinity;
    replies.forEach(move => {
      const after = applyChess(board, move);
      let score = scoreBoard(after);
      if (depth >= 2) {
        const answers = allLegal(after, true, meta);
        let whiteBest = -Infinity;
        answers.slice(0, 22).forEach(m2 => {
          whiteBest = Math.max(whiteBest, scoreBoard(applyChess(after, m2)));
        });
        if (answers.length) score = whiteBest;
      }
      if (score < bestScore) { bestScore = score; best = move; }
    });
    return best;
  }

  function updateCastle(meta, move, boardBefore) {
    const piece = boardBefore[move.fr][move.fc];
    const next = { ...meta.castle };
    if (piece === "K") { next.K = false; next.Q = false; }
    if (piece === "k") { next.k = false; next.q = false; }
    if (piece === "R" && move.fr === 7 && move.fc === 0) next.Q = false;
    if (piece === "R" && move.fr === 7 && move.fc === 7) next.K = false;
    if (piece === "r" && move.fr === 0 && move.fc === 0) next.q = false;
    if (piece === "r" && move.fr === 0 && move.fc === 7) next.k = false;
    return next;
  }

  function nextEp(move, boardBefore) {
    const piece = boardBefore[move.fr][move.fc];
    if (piece && piece.toUpperCase() === "P" && Math.abs(move.tr - move.fr) === 2) {
      return [move.fr + (move.tr - move.fr) / 2, move.fc];
    }
    return null;
  }

  function openChess() {
    if (gameFeaturesHidden()) return;
    injectArcadeStyles();
    let board = startChessBoard();
    let selected = null;
    let history = [];
    let over = false;
    let meta = { castle: { K: true, Q: true, k: true, q: true }, ep: null };
    let ply = [];
    const reset = () => {
      board = startChessBoard();
      selected = null;
      history = [];
      over = false;
      meta = { castle: { K: true, Q: true, k: true, q: true }, ep: null };
      ply = [];
    };
    const el = overlay(`<div class="wp-arcade-app" data-game="chess">
      <header class="wp-arcade-appbar">
        <div class="wp-arcade-brand">Chess<small>Standalone · local AI</small></div>
        <div class="wp-arcade-clocks">
          <div class="wp-arcade-clock" id="wp-chess-clock-b"><span>Black</span>10:00</div>
          <div class="wp-arcade-clock active" id="wp-chess-clock-w"><span>White</span>10:00</div>
        </div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </header>
      <div class="wp-arcade-stage">
        <div>
          <div class="wp-board" id="wp-chess-board"></div>
          <div class="wp-arcade-files">a b c d e f g h</div>
        </div>
        <aside class="wp-arcade-side">
          <p class="wp-arcade-status" id="wp-chess-status">White to move. Castling, en passant, checks, and mate are real.</p>
          <div class="wp-move-list" id="wp-chess-moves"></div>
        </aside>
      </div>
      <div class="wp-arcade-toolbar">
        <button type="button" class="secondary" id="wp-chess-undo">Undo</button>
        <button type="button" class="secondary" id="wp-chess-new">New game</button>
        <button type="button" class="ghost" id="wp-chess-resign">Resign</button>
      </div>
    </div>`);
    bindArcadeClose(el);
    const clocks = makeDualClocks(600, { w: "wp-chess-clock-w", b: "wp-chess-clock-b" }, side => {
      if (over) return;
      over = true;
      clocks.stop();
      el.querySelector("#wp-chess-status").textContent = side === "w" ? "White flagged — local AI wins." : "Black flagged — you win.";
      if (side === "b") {
        mintGameCoins(12, "Chess flag");
        grantArcadeTicket();
      }
    });
    el.querySelector("#wp-chess-new").onclick = () => { reset(); clocks.reset(); paint(); };
    el.querySelector("#wp-chess-resign").onclick = () => {
      if (over) return;
      over = true;
      clocks.stop();
      el.querySelector("#wp-chess-status").textContent = "You resigned.";
      paint();
    };
    el.querySelector("#wp-chess-undo").onclick = () => {
      if (!history.length || over) return;
      const snap = history.pop();
      board = snap.board;
      meta = snap.meta;
      ply = snap.ply;
      selected = null;
      over = false;
      clocks.setSide("w");
      paint();
    };
    const file = c => "abcdefgh"[c];
    const playMove = (move, actor) => {
      history.push({
        board: board.map(row => row.slice()),
        meta: { castle: { ...meta.castle }, ep: meta.ep && meta.ep.slice() },
        ply: ply.slice(),
      });
      const captured = board[move.tr][move.tc];
      meta = { castle: updateCastle(meta, move, board), ep: nextEp(move, board) };
      board = applyChess(board, move);
      ply.push(`${actor} ${file(move.fc)}${8 - move.fr}${captured ? "x" : "-"}${file(move.tc)}${8 - move.tr}`);
    };
    const finishIfOver = (whiteToMove) => {
      const moves = allLegal(board, whiteToMove, meta);
      if (moves.length) {
        clocks.setSide(whiteToMove ? "w" : "b");
        el.querySelector("#wp-chess-status").textContent = inCheck(board, whiteToMove)
          ? (whiteToMove ? "Check. Your move." : "Check. AI thinking.")
          : (whiteToMove ? "Your move." : "Black to move.");
        return false;
      }
      over = true;
      clocks.stop();
      const mate = inCheck(board, whiteToMove);
      if (whiteToMove) {
        el.querySelector("#wp-chess-status").textContent = mate ? "Checkmate — local AI wins." : "Stalemate.";
      } else {
        el.querySelector("#wp-chess-status").textContent = mate ? "Checkmate — you win." : "Stalemate.";
        if (mate) {
          apiCall("/api/achievements/chess-mate", { method: "POST" }).catch(() => {});
          mintGameCoins(40, "Chess mate");
          grantArcadeTicket();
        }
      }
      return true;
    };
    const paintMoves = () => {
      const rows = [];
      for (let i = 0; i < ply.length; i += 2) {
        rows.push(`<li>${esc(ply[i] || "")}${ply[i + 1] ? " &nbsp;" + esc(ply[i + 1]) : ""}</li>`);
      }
      el.querySelector("#wp-chess-moves").innerHTML = rows.length ? `<ol>${rows.join("")}</ol>` : "No moves yet.";
    };
    const paint = () => {
      const grid = el.querySelector("#wp-chess-board");
      const legal = selected && !over ? legalMoves(board, selected.r, selected.c, meta) : [];
      const key = legal.map(([r, c]) => `${r},${c}`);
      grid.style.gridTemplateColumns = "repeat(8, 48px)";
      grid.innerHTML = board.map((row, r) => row.map((p, c) => {
        const dark = (r + c) % 2 ? "dark" : "";
        const sel = selected && selected.r === r && selected.c === c ? "selected" : "";
        const ok = key.includes(`${r},${c}`) ? "legal" : "";
        return `<button type="button" class="${dark} ${sel} ${ok}" data-r="${r}" data-c="${c}">${PIECES[p] || ""}</button>`;
      }).join("")).join("");
      paintMoves();
      grid.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          if (over) return;
          const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
          if (selected) {
            const hit = legalMoves(board, selected.r, selected.c, meta).find(([tr, tc]) => tr === r && tc === c);
            if (hit) {
              playMove({ fr: selected.r, fc: selected.c, tr: r, tc: c, flag: hit[2] }, "W");
              selected = null;
              if (finishIfOver(false)) { paint(); return; }
              const reply = bestBlackMove(board, meta);
              if (reply) playMove(reply, "B");
              finishIfOver(true);
              paint();
              return;
            }
          }
          const p = board[r][c];
          selected = p && p === p.toUpperCase() ? { r, c } : null;
          paint();
        };
      });
    };
    paint();
  }

  function snapshotGo(board) {
    return board.map(row => row.join("")).join("/");
  }

  function openGo() {
    if (gameFeaturesHidden()) return;
    injectArcadeStyles();
    const size = 9;
    let board = Array.from({ length: size }, () => Array(size).fill(0));
    let stones = 0;
    let history = [];
    let lastHash = "";
    let passes = 0;
    let over = false;
    let ply = [];
    const el = overlay(`<div class="wp-arcade-app" data-game="go">
      <header class="wp-arcade-appbar">
        <div class="wp-arcade-brand">Go 9×9<small>Standalone · local AI</small></div>
        <div class="wp-arcade-clocks">
          <div class="wp-arcade-clock" id="wp-go-clock-w"><span>White</span>8:00</div>
          <div class="wp-arcade-clock active" id="wp-go-clock-b"><span>Black</span>8:00</div>
        </div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </header>
      <div class="wp-arcade-stage">
        <div class="wp-board go" id="wp-go-board"></div>
        <aside class="wp-arcade-side">
          <p class="wp-arcade-status" id="wp-go-status">Black to play. Suicide illegal. Ko honored. Two passes ends the game.</p>
          <div class="wp-move-list" id="wp-go-moves"></div>
        </aside>
      </div>
      <div class="wp-arcade-toolbar">
        <button type="button" class="secondary" id="wp-go-pass">Pass</button>
        <button type="button" class="secondary" id="wp-go-undo">Undo</button>
        <button type="button" class="secondary" id="wp-go-new">New game</button>
        <button type="button" class="ghost" id="wp-go-resign">Resign</button>
      </div>
    </div>`);
    bindArcadeClose(el);
    const clocks = makeDualClocks(480, { w: "wp-go-clock-w", b: "wp-go-clock-b" }, side => {
      if (over) return;
      over = true;
      clocks.stop();
      el.querySelector("#wp-go-status").textContent = side === "b" ? "Black flagged — White wins." : "White flagged — you win.";
      if (side === "w") {
        mintGameCoins(10, "Go flag");
        grantArcadeTicket();
      }
    });
    clocks.setSide("b");
    const coord = (r, c) => `${"abcdefghj"[c]}${size - r}`;
    const paintMoves = () => {
      el.querySelector("#wp-go-moves").innerHTML = ply.length
        ? `<ol>${ply.map(m => `<li>${esc(m)}</li>`).join("")}</ol>`
        : "No stones yet.";
    };
    const group = (grid, r, c, color, seen) => {
      const key = `${r},${c}`;
      if (seen.has(key) || grid[r]?.[c] !== color) return { stones: [], libs: 0 };
      seen.add(key);
      const stonesHere = [[r, c]];
      let libs = 0;
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        const y = r + dr, x = c + dc;
        if (y < 0 || y >= size || x < 0 || x >= size) return;
        if (grid[y][x] === 0) libs += 1;
        else if (grid[y][x] === color) {
          const more = group(grid, y, x, color, seen);
          stonesHere.push(...more.stones);
          libs += more.libs;
        }
      });
      return { stones: stonesHere, libs };
    };
    const captureOn = (grid, color) => {
      const seen = new Set();
      let n = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (grid[r][c] !== color || seen.has(`${r},${c}`)) continue;
        const g = group(grid, r, c, color, seen);
        if (g.libs === 0) {
          g.stones.forEach(([y, x]) => { grid[y][x] = 0; n += 1; });
        }
      }
      return n;
    };
    const tryPlace = (r, c, color, mutate) => {
      if (board[r][c]) return false;
      const next = board.map(row => row.slice());
      next[r][c] = color;
      captureOn(next, 3 - color);
      const g = group(next, r, c, color, new Set());
      if (g.libs === 0) return false;
      if (snapshotGo(next) === lastHash) return false;
      if (mutate) {
        history.push({ board: board.map(row => row.slice()), lastHash, stones, passes, ply: ply.slice() });
        lastHash = snapshotGo(board);
        board = next;
      }
      return true;
    };
    const scoreSide = (color) => {
      let n = 0;
      const seen = new Set();
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (board[r][c] === color) n += 1;
        if (board[r][c] !== 0 || seen.has(`${r},${c}`)) continue;
        const q = [[r, c]];
        const cells = [];
        let touch1 = false, touch2 = false;
        seen.add(`${r},${c}`);
        while (q.length) {
          const [y, x] = q.pop();
          cells.push([y, x]);
          [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
            const ny = y + dr, nx = x + dc;
            if (ny < 0 || ny >= size || nx < 0 || nx >= size) return;
            if (board[ny][nx] === 1) touch1 = true;
            else if (board[ny][nx] === 2) touch2 = true;
            else if (!seen.has(`${ny},${nx}`)) { seen.add(`${ny},${nx}`); q.push([ny, nx]); }
          });
        }
        if (touch1 && !touch2 && color === 1) n += cells.length;
        if (touch2 && !touch1 && color === 2) n += cells.length;
      }
      return n;
    };
    const endGame = () => {
      over = true;
      clocks.stop();
      const black = scoreSide(1);
      const white = scoreSide(2) + 6.5;
      const win = black > white;
      el.querySelector("#wp-go-status").textContent = win
        ? `Black ${black} vs White ${white.toFixed(1)} — you win.`
        : `Black ${black} vs White ${white.toFixed(1)} — White wins.`;
      if (win) {
        apiCall("/api/achievements/go-stone", { method: "POST" }).catch(() => {});
        mintGameCoins(22, "Go");
        grantArcadeTicket();
      }
    };
    const aiMove = () => {
      clocks.setSide("w");
      const depth = arcadeDepth();
      const candidates = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!tryPlace(y, x, 2, false)) continue;
        const next = board.map(row => row.slice());
        next[y][x] = 2;
        captureOn(next, 1);
        let score = 0;
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          if (next[r][c] === 2) score += 3;
          if (next[r][c] === 1) score -= 2;
        }
        const center = Math.abs(y - 4) + Math.abs(x - 4);
        score += (8 - center);
        if (depth >= 2) score += captureOn(next.map(row => row.slice()), 1);
        candidates.push({ y, x, score });
      }
      if (!candidates.length) { passes += 1; ply.push("W pass"); clocks.setSide("b"); return false; }
      candidates.sort((a, b) => b.score - a.score);
      tryPlace(candidates[0].y, candidates[0].x, 2, true);
      ply.push(`W ${coord(candidates[0].y, candidates[0].x)}`);
      passes = 0;
      clocks.setSide("b");
      return true;
    };
    const paint = () => {
      const grid = el.querySelector("#wp-go-board");
      grid.style.gridTemplateColumns = `repeat(${size}, 34px)`;
      grid.innerHTML = board.map((row, r) => row.map((v, c) => {
        const glyph = v === 1 ? "●" : v === 2 ? "○" : "";
        return `<button type="button" data-r="${r}" data-c="${c}">${glyph}</button>`;
      }).join("")).join("");
      paintMoves();
      grid.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          if (over) return;
          const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
          if (!tryPlace(r, c, 1, true)) return;
          stones += 1;
          passes = 0;
          ply.push(`B ${coord(r, c)}`);
          if (stones >= 20) apiCall("/api/achievements/go-stone", { method: "POST" }).catch(() => {});
          aiMove();
          if (passes >= 2) endGame();
          else el.querySelector("#wp-go-status").textContent = `Black stones ${stones}. Territory scores after two passes.`;
          paint();
        };
      });
    };
    el.querySelector("#wp-go-pass").onclick = () => {
      if (over) return;
      history.push({ board: board.map(row => row.slice()), lastHash, stones, passes, ply: ply.slice() });
      passes += 1;
      ply.push("B pass");
      aiMove();
      if (passes >= 2) endGame();
      paint();
    };
    el.querySelector("#wp-go-undo").onclick = () => {
      if (!history.length) return;
      const snap = history.pop();
      board = snap.board;
      lastHash = snap.lastHash;
      stones = snap.stones;
      passes = snap.passes;
      ply = snap.ply || [];
      over = false;
      clocks.setSide("b");
      paint();
    };
    el.querySelector("#wp-go-new").onclick = () => {
      board = Array.from({ length: size }, () => Array(size).fill(0));
      stones = 0; history = []; lastHash = ""; passes = 0; over = false; ply = [];
      clocks.reset();
      clocks.setSide("b");
      el.querySelector("#wp-go-status").textContent = "Black to play. Suicide illegal. Ko honored.";
      paint();
    };
    el.querySelector("#wp-go-resign").onclick = () => {
      if (over) return;
      over = true;
      clocks.stop();
      el.querySelector("#wp-go-status").textContent = "You resigned.";
      paint();
    };
    paint();
  }

  function cloneSol(state) {
    const copyCard = c => ({ ...c });
    return {
      tableau: state.tableau.map(col => col.map(copyCard)),
      stock: state.stock.map(copyCard),
      waste: state.waste.map(copyCard),
      foundations: state.foundations.map(col => col.map(copyCard)),
    };
  }

  function dealKlondike() {
    const suits = ["♠", "♥", "♦", "♣"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];
    suits.forEach(s => ranks.forEach((r, i) => deck.push({ s, r, n: i + 1, red: s === "♥" || s === "♦", id: s + r + Math.random().toString(36).slice(2, 5), face: false })));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const tableau = Array.from({ length: 7 }, (_, col) => {
      const cards = deck.splice(0, col + 1);
      cards[cards.length - 1].face = true;
      return cards;
    });
    return {
      tableau,
      stock: deck.map(c => ({ ...c, face: false })),
      waste: [],
      foundations: [[], [], [], []],
    };
  }

  function openSolitaire() {
    if (gameFeaturesHidden()) return;
    injectArcadeStyles();
    let game = dealKlondike();
    let selected = null;
    let history = [];
    let won = false;
    let moves = 0;
    let ply = [];
    const el = overlay(`<div class="wp-arcade-app" data-game="solitaire">
      <header class="wp-arcade-appbar">
        <div class="wp-arcade-brand">Klondike<small>Standalone table</small></div>
        <div class="wp-arcade-clocks">
          <div class="wp-arcade-clock active" id="wp-sol-clock"><span>Time</span>0:00</div>
        </div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </header>
      <div class="wp-arcade-stage">
        <div class="wp-klondike" id="wp-sol"></div>
        <aside class="wp-arcade-side">
          <p class="wp-arcade-status" id="wp-sol-status">Draw, build descending reds/blacks, Aces up. Double-click to foundation.</p>
          <div class="wp-move-list" id="wp-sol-moves"></div>
        </aside>
      </div>
      <div class="wp-arcade-toolbar">
        <button type="button" class="secondary" id="wp-sol-undo">Undo</button>
        <button type="button" class="secondary" id="wp-sol-new">New game</button>
        <button type="button" class="ghost" id="wp-sol-resign">Resign</button>
      </div>
    </div>`);
    bindArcadeClose(el);
    const clock = makeElapsedClock("wp-sol-clock");
    const logMove = (label) => {
      moves += 1;
      ply.push(`${moves}. ${label}`);
      el.querySelector("#wp-sol-moves").innerHTML = `<ol>${ply.slice(-40).map(m => `<li>${esc(m)}</li>`).join("")}</ol>`;
    };
    const canStack = (a, b) => a && b && a.red !== b.red && a.n === b.n - 1;
    const toFoundation = (card, dest) => (!dest.length && card.n === 1) || (dest.length && dest[dest.length - 1].s === card.s && dest[dest.length - 1].n + 1 === card.n);
    const pushHist = () => history.push(cloneSol(game));
    const checkWin = () => {
      if (!game.foundations.every(f => f.length === 13) || won) return;
      won = true;
      clock.stop();
      el.querySelector("#wp-sol-status").textContent = "Klondike cleared — you win.";
      apiCall("/api/achievements/solitaire-clear", { method: "POST" }).catch(() => {});
      mintGameCoins(35, "Klondike");
      grantArcadeTicket();
      if (typeof showToast === "function") showToast("Klondike cleared", "good");
    };
    const paint = () => {
      const { tableau, stock, waste, foundations } = game;
      const root = el.querySelector("#wp-sol");
      const cardHtml = (card, extra = "") => {
        if (!card) return `<div class="wp-card-face" style="visibility:hidden;"></div>`;
        const cls = `wp-card-face${card.face ? (card.red ? " red" : "") : " wp-card-back"}`;
        return `<button type="button" class="${cls}" data-id="${card.id}" ${extra}>${card.face ? `${card.r}${card.s}` : ""}</button>`;
      };
      root.innerHTML = `
        <div class="col">${cardHtml(stock[stock.length - 1], 'data-stock="1"')}<div class="stub">${stock.length}</div></div>
        <div class="col">${cardHtml(waste[waste.length - 1], 'data-waste="1"')}</div>
        ${foundations.map((f, i) => `<div class="col">${cardHtml(f[f.length - 1], `data-found="${i}"`)}</div>`).join("")}
        ${tableau.map((col, i) => `<div class="col" data-tab="${i}">${col.map((c, idx) => cardHtml(c, `data-tab="${i}" data-idx="${idx}"`)).join("") || '<div class="wp-card-face" style="opacity:.2" data-tab="' + i + '" data-empty="1"></div>'}</div>`).join("")}
      `;
      root.querySelector("[data-stock]")?.addEventListener("click", () => {
        pushHist();
        if (stock.length) {
          const card = stock.pop();
          card.face = true;
          waste.push(card);
          logMove("draw");
        } else {
          while (waste.length) {
            const card = waste.pop();
            card.face = false;
            stock.push(card);
          }
          logMove("recycle");
        }
        selected = null;
        paint();
      });
      const takeFrom = sel => {
        if (sel.fromWaste) return waste.splice(-1);
        if (sel.tab != null) return tableau[sel.tab].splice(sel.idx);
        return foundations[sel.found].splice(-1);
      };
      const peek = sel => {
        if (sel.fromWaste) return waste[waste.length - 1];
        if (sel.tab != null) return tableau[sel.tab][sel.idx];
        return foundations[sel.found][foundations[sel.found].length - 1];
      };
      root.querySelectorAll("[data-waste], [data-tab], [data-found]").forEach(btn => {
        btn.addEventListener("dblclick", e => {
          e.preventDefault();
          const tab = btn.dataset.tab != null ? Number(btn.dataset.tab) : null;
          const fromWaste = btn.hasAttribute("data-waste");
          const pile = fromWaste ? waste : (tab != null ? tableau[tab] : null);
          const card = pile && pile[pile.length - 1];
          if (!card || !card.face) return;
          const dest = foundations.find(f => toFoundation(card, f));
          if (dest) {
            pushHist();
            dest.push(pile.pop());
            if (tab != null && pile.length) pile[pile.length - 1].face = true;
            selected = null;
            logMove("foundation");
            checkWin();
            paint();
          }
        });
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const fromWaste = btn.hasAttribute("data-waste");
          const tab = btn.dataset.tab != null ? Number(btn.dataset.tab) : null;
          const found = btn.dataset.found != null ? Number(btn.dataset.found) : null;
          const idx = btn.dataset.idx != null ? Number(btn.dataset.idx) : null;
          if (!selected) {
            if (fromWaste && waste.length) selected = { fromWaste: true };
            else if (tab != null && tableau[tab][idx] && tableau[tab][idx].face) selected = { tab, idx };
            else if (found != null && foundations[found].length) selected = { found };
            return;
          }
          const moving = peek(selected);
          if (!moving) { selected = null; return; }
          pushHist();
          let moved = false;
          if (found != null) {
            if (toFoundation(moving, foundations[found]) && (selected.fromWaste || selected.tab == null || selected.idx === tableau[selected.tab].length - 1)) {
              foundations[found].push(...takeFrom(selected));
              moved = true;
            }
          } else if (tab != null) {
            const dest = tableau[tab];
            const top = dest[dest.length - 1];
            if ((!top && moving.n === 13) || canStack(moving, top)) {
              dest.push(...takeFrom(selected));
              moved = true;
            }
          }
          if (!moved) history.pop();
          else logMove(found != null ? "to foundation" : "to column");
          if (selected.tab != null && tableau[selected.tab].length) tableau[selected.tab][tableau[selected.tab].length - 1].face = true;
          selected = null;
          checkWin();
          paint();
        });
      });
    };
    el.querySelector("#wp-sol-undo").onclick = () => {
      if (!history.length) return;
      game = history.pop();
      selected = null;
      won = false;
      paint();
    };
    el.querySelector("#wp-sol-new").onclick = () => {
      game = dealKlondike();
      selected = null;
      history = [];
      won = false;
      moves = 0;
      ply = [];
      clock.reset();
      el.querySelector("#wp-sol-moves").textContent = "No moves yet.";
      el.querySelector("#wp-sol-status").textContent = "New deal. Aces up, kings to empty columns.";
      paint();
    };
    el.querySelector("#wp-sol-resign").onclick = () => {
      if (won) return;
      won = true;
      clock.stop();
      el.querySelector("#wp-sol-status").textContent = "Deal abandoned.";
      logMove("resign");
    };
    paint();
  }

  function openReversi() {
    if (gameFeaturesHidden()) return;
    injectArcadeStyles();
    const size = 8;
    const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const startBoard = () => {
      const b = Array.from({ length: size }, () => Array(size).fill(0));
      b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
      return b;
    };
    let board = startBoard();
    let history = [];
    let over = false;
    let ply = [];
    const coord = (r, c) => `${"abcdefgh"[c]}${8 - r}`;
    const flipsAt = (grid, r, c, color) => {
      if (grid[r][c]) return [];
      const enemy = 3 - color;
      const out = [];
      dirs.forEach(([dr, dc]) => {
        const line = [];
        let y = r + dr, x = c + dc;
        while (y >= 0 && y < size && x >= 0 && x < size && grid[y][x] === enemy) {
          line.push([y, x]);
          y += dr; x += dc;
        }
        if (line.length && y >= 0 && y < size && x >= 0 && x < size && grid[y][x] === color) out.push(...line);
      });
      return out;
    };
    const movesFor = (grid, color) => {
      const moves = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const flips = flipsAt(grid, r, c, color);
        if (flips.length) moves.push({ r, c, flips });
      }
      return moves;
    };
    const applyMove = (grid, move, color) => {
      const next = grid.map(row => row.slice());
      next[move.r][move.c] = color;
      move.flips.forEach(([y, x]) => { next[y][x] = color; });
      return next;
    };
    const count = (grid, color) => grid.flat().filter(v => v === color).length;
    const el = overlay(`<div class="wp-arcade-app" data-game="reversi">
      <header class="wp-arcade-appbar">
        <div class="wp-arcade-brand">Reversi<small>Standalone · local AI</small></div>
        <div class="wp-arcade-clocks">
          <div class="wp-arcade-clock" id="wp-rev-clock-w"><span>White</span>8:00</div>
          <div class="wp-arcade-clock active" id="wp-rev-clock-b"><span>Black</span>8:00</div>
        </div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </header>
      <div class="wp-arcade-stage">
        <div>
          <div class="wp-board reversi" id="wp-rev-board"></div>
          <div class="wp-arcade-files">a b c d e f g h</div>
        </div>
        <aside class="wp-arcade-side">
          <p class="wp-arcade-status" id="wp-rev-status">Black to play. Corners win games.</p>
          <div class="wp-move-list" id="wp-rev-moves"></div>
        </aside>
      </div>
      <div class="wp-arcade-toolbar">
        <button type="button" class="secondary" id="wp-rev-undo">Undo</button>
        <button type="button" class="secondary" id="wp-rev-new">New game</button>
        <button type="button" class="ghost" id="wp-rev-resign">Resign</button>
      </div>
    </div>`);
    bindArcadeClose(el);
    const clocks = makeDualClocks(480, { w: "wp-rev-clock-w", b: "wp-rev-clock-b" }, side => {
      if (over) return;
      over = true;
      clocks.stop();
      el.querySelector("#wp-rev-status").textContent = side === "b" ? "Black flagged — White wins." : "White flagged — you win.";
      if (side === "w") {
        mintGameCoins(12, "Reversi flag");
        grantArcadeTicket();
      }
    });
    clocks.setSide("b");
    const paintMoves = () => {
      el.querySelector("#wp-rev-moves").innerHTML = ply.length
        ? `<ol>${ply.map(m => `<li>${esc(m)}</li>`).join("")}</ol>`
        : "No moves yet.";
    };
    const finish = () => {
      over = true;
      clocks.stop();
      const black = count(board, 1);
      const white = count(board, 2);
      const win = black > white;
      el.querySelector("#wp-rev-status").textContent = win
        ? `Black ${black}–${white} — you win.`
        : black === white ? `Draw ${black}–${white}.` : `White ${white}–${black} — White wins.`;
      if (win) {
        mintGameCoins(28, "Reversi");
        grantArcadeTicket();
      }
    };
    const aiMove = () => {
      clocks.setSide("w");
      const moves = movesFor(board, 2);
      if (!moves.length) {
        ply.push("W pass");
        clocks.setSide("b");
        return false;
      }
      const corners = new Set(["0,0", "0,7", "7,0", "7,7"]);
      moves.sort((a, b) => {
        const ca = corners.has(`${a.r},${a.c}`) ? 80 : 0;
        const cb = corners.has(`${b.r},${b.c}`) ? 80 : 0;
        return (cb + b.flips.length) - (ca + a.flips.length);
      });
      const pick = moves[0];
      history.push({ board: board.map(row => row.slice()), ply: ply.slice() });
      board = applyMove(board, pick, 2);
      ply.push(`W ${coord(pick.r, pick.c)}`);
      clocks.setSide("b");
      return true;
    };
    const paint = () => {
      const legal = over ? [] : movesFor(board, 1);
      const key = new Set(legal.map(m => `${m.r},${m.c}`));
      const grid = el.querySelector("#wp-rev-board");
      grid.style.gridTemplateColumns = "repeat(8, 48px)";
      grid.innerHTML = board.map((row, r) => row.map((v, c) => {
        const glyph = v === 1 ? "●" : v === 2 ? "○" : "";
        const ok = key.has(`${r},${c}`) ? "legal" : "";
        return `<button type="button" class="${ok}" data-r="${r}" data-c="${c}">${glyph}</button>`;
      }).join("")).join("");
      paintMoves();
      if (!over) {
        el.querySelector("#wp-rev-status").textContent = `Black ${count(board, 1)} · White ${count(board, 2)}. Your move.`;
      }
      grid.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          if (over) return;
          const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
          const hit = legal.find(m => m.r === r && m.c === c);
          if (!hit) return;
          history.push({ board: board.map(row => row.slice()), ply: ply.slice() });
          board = applyMove(board, hit, 1);
          ply.push(`B ${coord(r, c)}`);
          const whiteMoves = movesFor(board, 2);
          const blackMoves = movesFor(board, 1);
          if (whiteMoves.length) aiMove();
          else if (!blackMoves.length) { finish(); paint(); return; }
          else ply.push("W pass");
          if (!movesFor(board, 1).length && !movesFor(board, 2).length) finish();
          paint();
        };
      });
    };
    el.querySelector("#wp-rev-undo").onclick = () => {
      if (!history.length) return;
      const snap = history.pop();
      board = snap.board;
      ply = snap.ply || [];
      over = false;
      clocks.setSide("b");
      paint();
    };
    el.querySelector("#wp-rev-new").onclick = () => {
      board = startBoard();
      history = [];
      over = false;
      ply = [];
      clocks.reset();
      clocks.setSide("b");
      el.querySelector("#wp-rev-status").textContent = "Black to play. Corners win games.";
      paint();
    };
    el.querySelector("#wp-rev-resign").onclick = () => {
      if (over) return;
      over = true;
      clocks.stop();
      el.querySelector("#wp-rev-status").textContent = "You resigned.";
      ply.push("B resign");
      paint();
    };
    paint();
  }

  function grantArcadeTicket() {
    try {
      const owned = JSON.parse(localStorage.getItem("waypointLootUpgrades") || "[]");
      const pouch = Array.isArray(owned) && owned.includes("pouch");
      if (pouch && window.WaypointLoot?.grantChest) {
        window.WaypointLoot.grantChest({ rarity: "common", source: "Arcade clear" });
      }
    } catch (_) {}
  }

  function openArcadeHub() {
    if (gameFeaturesHidden()) return;
    overlay(`<div class="wp-arcade-app wp-arcade-hub">
      <header class="wp-arcade-appbar">
        <div class="wp-arcade-brand">Local arcade<small>Standalone tables · caches stay rare</small></div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </header>
      <p class="stub" style="padding:12px 18px 0">Full apps, not widgets. Local AI. Wins mint coins.</p>
      <div class="wp-arcade-toolbar">
        <button type="button" class="primary" data-game="chess">Chess</button>
        <button type="button" class="primary" data-game="go">Go</button>
        <button type="button" class="primary" data-game="solitaire">Solitaire</button>
        <button type="button" class="primary" data-game="reversi">Reversi</button>
      </div>
    </div>`);
    bindArcadeClose(document.getElementById("wp-arcade-overlay"));
    document.querySelectorAll("[data-game]").forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.game === "chess") openChess();
        if (btn.dataset.game === "go") openGo();
        if (btn.dataset.game === "solitaire") openSolitaire();
        if (btn.dataset.game === "reversi") openReversi();
      };
    });
  }

  function hijackArcadeFab() {
    if (gameFeaturesHidden()) {
      document.getElementById("wp-arcade-fab")?.setAttribute("hidden", "");
      return;
    }
    const btn = document.getElementById("wp-arcade-fab");
    if (!btn || btn.dataset.wpDepth) return;
    btn.hidden = false;
    btn.dataset.wpDepth = "1";
    btn.onclick = () => openArcadeHub();
  }

  function showCoinBreakdown(res) {
    if (!res) return;
    document.getElementById("wp-coin-breakdown")?.remove();
    const el = document.createElement("div");
    el.id = "wp-coin-breakdown";
    el.className = "wp-coin-breakdown";
    const parts = (res.parts || []).map(p => `${esc(String(p.signal || "").replace(/_/g, " "))} +${p.coins}`).join(" · ");
    const power = res.power?.label ? `<div class="stub">${esc(res.power.label)}</div>` : "";
    if (!res.coins) {
      el.innerHTML = `<strong>No coins from today</strong><div>Log happiness, energy, or paint hours. Minigames still mint coins.</div>${power}
        <button type="button" class="ghost" style="margin-top:6px;">Got it</button>`;
      if (window.WaypointLoot?.unlockMeme) window.WaypointLoot.unlockMeme("no-data-no-coin");
    } else {
      el.innerHTML = `<strong>+${res.coins} coins from today</strong><div>${parts || "happiness · energy · paint · games"}</div>${power}
        <button type="button" class="ghost" style="margin-top:6px;">Got it</button>`;
      if (typeof showToast === "function") showToast(`+${res.coins} coins · ${parts}`, "good");
    }
    el.querySelector("button").onclick = () => el.remove();
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function patchAwardCoins() {
    document.addEventListener("click", e => {
      if (e.target?.id !== "save-day") return;
      setTimeout(() => {
        const painted = document.querySelectorAll(".tdy-hour-painted, [data-hour].painted").length
          || (typeof countPaintedHours === "function" ? countPaintedHours() : 0);
        apiCall("/api/coins/from-day", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ painted_hours: painted, played_game: false }),
        }).then(showCoinBreakdown).catch(() => {});
      }, 500);
    });
  }

  function weekdaySeasonality(days, values) {
    const buckets = Array.from({ length: 7 }, () => []);
    days.forEach((d, i) => {
      if (values[i] == null || Number.isNaN(values[i])) return;
      const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay();
      const idx = (wd + 6) % 7;
      buckets[idx].push(values[i]);
    });
    return buckets.map(b => (b.length ? b.reduce((a, c) => a + c, 0) / b.length : null));
  }

  function residualBand(values, window = 7) {
    const lo = [];
    const hi = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) { lo.push(null); hi.push(null); continue; }
      const chunk = [];
      for (let j = Math.max(0, i - window); j <= i; j++) if (values[j] != null) chunk.push(values[j]);
      const mean = chunk.reduce((a, c) => a + c, 0) / chunk.length;
      const std = Math.sqrt(chunk.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, chunk.length - 1));
      lo.push(mean - 1.28 * std);
      hi.push(mean + 1.28 * std);
    }
    return { lo, hi };
  }

    function patchTrends() {}

  function importanceColor(value) {
    const n = Math.max(0, Math.min(100, Number(value) || 50));
    if (n >= 75) return "#c0392b";
    if (n >= 50) return "#d97706";
    if (n >= 25) return "#2d7dd2";
    return "#1f7a4d";
  }
  window.importanceColor = importanceColor;

  function paintRailImportance() {
    document.querySelectorAll(".pln-rail-card").forEach(card => {
      const bump = card.querySelector("[data-importance]");
      const value = bump?.dataset.importance || card.dataset.importance;
      if (value == null) return;
      card.style.borderLeftColor = importanceColor(value);
    });
  }

  function wireEventDrag() {
    document.querySelectorAll(".pln-event-badge").forEach(btn => {
      if (btn.dataset.wpDrag) return;
      btn.dataset.wpDrag = "1";
      btn.draggable = true;
      btn.addEventListener("dragstart", e => {
        btn.classList.add("dragging");
        e.dataTransfer.setData("text/plain", JSON.stringify({
          id: btn.dataset.id,
          kind: btn.dataset.kind,
        }));
      });
      btn.addEventListener("dragend", () => btn.classList.remove("dragging"));
    });
    document.querySelectorAll(".tdy-hour, .pln-hour, [data-hour]").forEach(cell => {
      if (cell.dataset.wpDrop) return;
      cell.dataset.wpDrop = "1";
      cell.addEventListener("dragover", e => e.preventDefault());
      cell.addEventListener("drop", async e => {
        e.preventDefault();
        let payload = {};
        try { payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch (_) { return; }
        if (!payload.id) return;
        const hour = Number(cell.dataset.hour ?? cell.getAttribute("data-hour"));
        if (!Number.isFinite(hour)) return;
        const start = `${String(hour).padStart(2, "0")}:00`;
        const endHour = Math.min(23, hour + 1);
        const end = `${String(endHour).padStart(2, "0")}:00`;
        const endpoint = payload.kind === "event" ? `/api/events/${payload.id}` : `/api/calendar/${payload.id}`;
        try {
          await apiCall(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start_time: start, end_time: end }),
          });
          if (typeof render === "function") render();
        } catch (err) {
          if (typeof showToast === "function") showToast(String(err), "warn");
        }
      });
    });
  }

  function keywordChips() {
    const host = document.getElementById("pln-rail") || document.getElementById("tsk-list");
    if (!host || document.getElementById("pln-keyword-row")) return;
    const keys = ["speaking", "writing", "code", "email", "aleks", "meeting"];
    const row = document.createElement("div");
    row.id = "pln-keyword-row";
    row.className = "pln-keyword-row";
    row.innerHTML = keys.map(k => `<button type="button" class="pln-keyword-chip" data-key="${k}">${k}</button>`).join("");
    host.prepend(row);
    row.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        const on = btn.classList.toggle("active");
        const q = on ? btn.dataset.key : "";
        const search = document.getElementById("pln-rail-search") || document.getElementById("tsk-search");
        if (search) {
          search.value = q;
          search.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
    });
  }

  function wireAgentVoice() {
    const zone = document.getElementById("agent-attach-zone");
    if (!zone || document.getElementById("agent-mic")) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "agent-mic";
    btn.className = "secondary agc-mic";
    btn.textContent = SpeechRecognition ? "🎤" : "🎤";
    btn.title = SpeechRecognition ? "Hold to talk, then review and send" : "Voice not supported here";
    btn.disabled = !SpeechRecognition;
    zone.insertBefore(btn, document.getElementById("agent-send"));
    if (!SpeechRecognition) return;
    let rec = null;
    let listening = false;
    const review = text => {
      const input = document.getElementById("agent-input");
      if (input) input.value = text;
      let bar = document.getElementById("agent-voice-review");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "agent-voice-review";
        bar.className = "agent-voice-review";
        zone.parentNode?.insertBefore(bar, zone);
      }
      bar.innerHTML = `<span>Review, then send.</span>
        <button type="button" class="ghost" id="agent-voice-discard">Discard</button>
        <button type="button" class="primary" id="agent-voice-send">Send</button>`;
      bar.hidden = false;
      document.getElementById("agent-voice-discard").onclick = () => { bar.hidden = true; };
      document.getElementById("agent-voice-send").onclick = () => {
        bar.hidden = true;
        document.getElementById("agent-send")?.click();
      };
    };
    btn.onclick = () => {
      if (listening) {
        listening = false;
        btn.classList.remove("agc-mic-active");
        try { rec.stop(); } catch (_) {}
        const text = document.getElementById("agent-input")?.value.trim();
        if (text) review(text);
        return;
      }
      rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = document.documentElement.lang || "en-US";
      rec.onresult = ev => {
        const input = document.getElementById("agent-input");
        if (!input) return;
        let interim = "";
        let final = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += t;
          else interim += t;
        }
        if (final) input.value = `${input.value} ${final}`.trim();
        else if (interim) input.value = interim;
      };
      listening = true;
      btn.classList.add("agc-mic-active");
      rec.start();
    };
  }

  function injectUpgrades() {
    if (gameFeaturesHidden()) return;
    const box = document.getElementById("wp-integrations");
    if (!box || document.getElementById("wp-upgrades")) return;
    const wrap = document.createElement("div");
    wrap.id = "wp-upgrades";
    wrap.innerHTML = `<strong style="font-size:12px;">Powers and upgrades</strong>
      <p class="stub" id="wp-skin-power-label"></p>
      <div class="wp-upgrade-grid" id="wp-upgrade-grid">Loading…</div>
      <button type="button" class="secondary" id="wp-use-integration">Ping saved SDKs</button>`;
    box.appendChild(wrap);
    const power = equippedPower();
    const label = document.getElementById("wp-skin-power-label");
    if (label) label.textContent = power.label;
    apiCall("/api/upgrades").then(res => {
      const grid = document.getElementById("wp-upgrade-grid");
      if (!grid) return;
      grid.innerHTML = (res.upgrades || []).map(u => `<div class="wp-upgrade-card">
        <strong>${esc(u.name)}</strong>
        <p class="stub">${esc(u.note)}</p>
        <button type="button" class="primary" data-up="${esc(u.id)}" ${u.owned ? "disabled" : ""}>${u.owned ? "Owned" : `${u.cost} coins`}</button>
      </div>`).join("");
      grid.querySelectorAll("[data-up]").forEach(btn => {
        btn.onclick = async () => {
          const coins = Number(localStorage.getItem("gameCoins") || 0);
          const result = await apiCall("/api/upgrades", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: btn.dataset.up, coins }),
          });
      if (result?.ok && result.spent) {
            localStorage.setItem("gameCoins", String(Math.max(0, coins - result.spent)));
            // Coins are already spent by this point, so a throw here would charge for an
            // upgrade that never gets recorded. Corrupt storage falls back to an empty list.
            let owned = [];
            try {
              const raw = JSON.parse(localStorage.getItem("waypointLootUpgrades") || "[]");
              if (Array.isArray(raw)) owned = raw;
            } catch (_) {
              owned = [];
            }
            if (!owned.includes(btn.dataset.up)) {
              owned.push(btn.dataset.up);
              localStorage.setItem("waypointLootUpgrades", JSON.stringify(owned));
            }
          }
          if (typeof showToast === "function") showToast(result.error || `Unlocked ${btn.dataset.up}`, result.ok ? "good" : "warn");
          wrap.remove();
          injectUpgrades();
        };
      });
    }).catch(() => {});
    document.getElementById("wp-use-integration")?.addEventListener("click", async () => {
      const list = await apiCall("/api/integrations");
      for (const it of list.integrations || []) {
        if (!it.configured) continue;
        const used = await apiCall("/api/integrations/use", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: it.id, action: "status" }),
        });
        if (typeof showToast === "function") showToast(`${it.label}: ${used.ok ? "live" : used.error || "failed"}`, used.ok ? "good" : "warn");
      }
    });
  }

  function paintTabClass() {
    document.body.classList.toggle("pln-paint-only", typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Paint");
  }

  const obs = new MutationObserver(() => {
    hijackArcadeFab();
    applySkinPowerDataset();
    paintRailImportance();
    wireEventDrag();
    keywordChips();
    wireAgentVoice();
    injectUpgrades();
    paintTabClass();
  });

  document.addEventListener("DOMContentLoaded", () => {
    patchWorkspaceGlyphs();
    patchTrends();
    patchAwardCoins();
    injectArcadeStyles();
    hijackArcadeFab();
    obs.observe(document.body, { childList: true, subtree: true });
  });

  window.wpOpenChess = openChess;
  window.wpOpenGo = openGo;
  window.wpOpenSolitaire = openSolitaire;
  window.wpOpenReversi = openReversi;
  window.wpWeekdaySeasonality = weekdaySeasonality;
  window.inCheck = inCheck;
})();
