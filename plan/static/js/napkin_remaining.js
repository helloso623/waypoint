/* Remaining napkin UI: metrics guard, arcade games, cart, agents, loot hydrate. */
(function () {
  function apiCall(path, opts) {
    if (typeof api === "function") return api(path, opts);
    return fetch(path, opts).then(r => r.json());
  }

  function metricEl(target) {
    return target?.closest?.("input[type=number][id^='metric-'], .tdy-metrics-grid input[type=number], .metrics-grid input[type=number]");
  }

  function guardMetricInputs(root) {
    if (!document.getElementById("wp-metric-guard-styles")) {
      const style = document.createElement("style");
      style.id = "wp-metric-guard-styles";
      style.textContent = `
        input[id^="metric-"], .tdy-metrics-grid input[type="number"], .metrics-grid input[type="number"] {
          appearance: textfield !important;
          -moz-appearance: textfield !important;
        }
        input[id^="metric-"]::-webkit-inner-spin-button,
        input[id^="metric-"]::-webkit-outer-spin-button,
        .tdy-metrics-grid input[type="number"]::-webkit-inner-spin-button,
        .tdy-metrics-grid input[type="number"]::-webkit-outer-spin-button,
        .metrics-grid input[type="number"]::-webkit-inner-spin-button,
        .metrics-grid input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none !important;
          pointer-events: none !important;
          margin: 0 !important;
        }
      `;
      document.head.appendChild(style);
    }
    (root || document).querySelectorAll(".tdy-metrics-grid input[type=number], .metrics-grid input[type=number], input[id^='metric-']").forEach(el => {
      if (el.dataset.wpMetricGuard) return;
      el.dataset.wpMetricGuard = "1";
      el.addEventListener("wheel", e => e.preventDefault(), { passive: false });
      el.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        if (el.dataset.wpMetricLock != null) el.value = el.dataset.wpMetricLock;
      });
      el.addEventListener("mousedown", e => {
        el.dataset.wpMetricLock = el.value;
        if (e.button !== 0) e.preventDefault();
      });
      el.addEventListener("keydown", e => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") e.stopPropagation();
      });
    });
  }

  function wireMetricRightClickGuard() {
    if (document.documentElement.dataset.wpMetricGuard === "1") return;
    document.documentElement.dataset.wpMetricGuard = "1";
    const restore = (el) => {
      if (!el || el.dataset.wpMetricLock == null) return;
      if (el.value !== el.dataset.wpMetricLock) {
        el.value = el.dataset.wpMetricLock;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    document.addEventListener("pointerdown", e => {
      const el = metricEl(e.target);
      if (!el) return;
      el.dataset.wpMetricLock = el.value;
      if (e.button !== 0) {
        e.preventDefault();
        e.stopPropagation();
        requestAnimationFrame(() => restore(el));
      }
    }, true);
    document.addEventListener("contextmenu", e => {
      const el = metricEl(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      restore(el);
    }, true);
    document.addEventListener("auxclick", e => {
      const el = metricEl(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      restore(el);
    }, true);
    document.addEventListener("wheel", e => {
      const el = metricEl(e.target);
      if (!el) return;
      e.preventDefault();
    }, { capture: true, passive: false });
  }

  function hideNapkinTitleWhenScribbling() {
    const overlay = document.querySelector(".napkin-capture-dialog");
    if (!overlay) return;
    const type = overlay.querySelector(".quick-capture-chip.active")?.dataset.type
      || localStorage.getItem("quickCaptureType") || "feedback";
    const title = overlay.querySelector("#quick-capture-title");
    if (!title) return;
    const scribble = type === "napkin" || type === "scribble" || type === "feedback";
    title.classList.toggle("napkin-title-hidden", scribble);
    title.placeholder = scribble ? "Title (auto from first line)" : "Title or name...";
  }

  function wireCompileEnter() {
    document.addEventListener("keydown", e => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const overlay = e.target?.closest?.(".napkin-capture-dialog");
      if (!overlay) return;
      if (e.ctrlKey || e.metaKey || e.target?.id === "napkin-compile-git") {
        e.preventDefault();
        overlay.querySelector("#napkin-compile-git")?.click();
      }
    }, true);
  }

  function hydrateLoot() {
    apiCall("/api/loot/state").then(res => {
      const remote = res?.state;
      if (!remote || typeof remote !== "object" || !Object.keys(remote).length) return;
      try {
        const local = JSON.parse(localStorage.getItem("waypointLootStateV1") || "null") || {};
        const merged = { ...local, ...remote };
        ["chests", "claims", "unlocks", "unlockedSkins"].forEach(key => {
          const a = Array.isArray(local[key]) ? local[key] : [];
          const b = Array.isArray(remote[key]) ? remote[key] : [];
          const seen = new Set();
          merged[key] = [];
          [...a, ...b].forEach(item => {
            const marker = typeof item === "string" ? item : JSON.stringify(item);
            if (seen.has(marker)) return;
            seen.add(marker);
            merged[key].push(item);
          });
        });
        localStorage.setItem("waypointLootStateV1", JSON.stringify(merged));
      } catch (_) {}
    }).catch(() => {});
  }

  function injectArcadeFab() {
    if (document.getElementById("wp-arcade-fab") || document.body.classList.contains("game-off")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "wp-arcade-fab";
    btn.className = "primary wp-arcade-fab";
    btn.textContent = "Arcade";
    btn.title = "Chess, Go, Solitaire — local standalone games";
    btn.onclick = () => openArcadeHub();
    document.body.appendChild(btn);
  }

  function overlay(className, html) {
    document.getElementById("wp-arcade-overlay")?.remove();
    const el = document.createElement("div");
    el.id = "wp-arcade-overlay";
    el.className = className;
    el.innerHTML = html;
    el.addEventListener("click", e => { if (e.target === el) el.remove(); });
    document.body.appendChild(el);
    return el;
  }

  function openArcadeHub() {
    overlay("wp-arcade-overlay", `<div class="wp-arcade-card">
      <strong>Local arcade</strong>
      <p class="stub">Full standalone games. Local AI only — no cloud tokens.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <button type="button" class="primary" data-game="chess">Chess</button>
        <button type="button" class="primary" data-game="go">Go</button>
        <button type="button" class="primary" data-game="solitaire">Solitaire</button>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </div>
    </div>`);
    document.getElementById("wp-arcade-close").onclick = () => document.getElementById("wp-arcade-overlay")?.remove();
    document.querySelectorAll("[data-game]").forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.game === "chess") openChess();
        if (btn.dataset.game === "go") openGo();
        if (btn.dataset.game === "solitaire") openSolitaire();
      };
    });
  }

  const PIECES = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

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

  function chessMoves(board, r, c) {
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
    }
    return out;
  }

  function allChessMoves(board, white) {
    const moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if ((p === p.toUpperCase()) !== white) continue;
      chessMoves(board, r, c).forEach(([tr, tc]) => moves.push({ fr: r, fc: c, tr, tc }));
    }
    return moves;
  }

  function applyChess(board, move) {
    const next = board.map(row => row.slice());
    next[move.tr][move.tc] = next[move.fr][move.fc];
    next[move.fr][move.fc] = "";
    if (next[move.tr][move.tc] === "P" && move.tr === 0) next[move.tr][move.tc] = "Q";
    if (next[move.tr][move.tc] === "p" && move.tr === 7) next[move.tr][move.tc] = "q";
    return next;
  }

  function scoreChess(board) {
    const val = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0, p: -1, n: -3, b: -3, r: -5, q: -9, k: 0 };
    let s = 0;
    for (const row of board) for (const p of row) if (p) s += val[p] || 0;
    return s;
  }

  function openChess() {
    let board = startChessBoard();
    let selected = null;
    const el = overlay("wp-arcade-overlay", `<div class="wp-arcade-card">
      <strong>Chess vs local AI</strong>
      <p class="stub" id="wp-chess-status">You are white. Click a piece, then a square.</p>
      <div class="wp-board" id="wp-chess-board"></div>
      <button type="button" class="ghost" id="wp-arcade-close">Close</button>
    </div>`);
    el.querySelector("#wp-arcade-close").onclick = () => el.remove();
    const paint = () => {
      const grid = el.querySelector("#wp-chess-board");
      grid.style.gridTemplateColumns = "repeat(8, 36px)";
      grid.innerHTML = board.map((row, r) => row.map((p, c) => {
        const dark = (r + c) % 2 ? "dark" : "";
        return `<button type="button" class="${dark}" data-r="${r}" data-c="${c}">${PIECES[p] || ""}</button>`;
      }).join("")).join("");
      grid.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
          if (selected) {
            const ok = chessMoves(board, selected.r, selected.c).some(([tr, tc]) => tr === r && tc === c);
            if (ok) {
              board = applyChess(board, { fr: selected.r, fc: selected.c, tr: r, tc: c });
              selected = null;
              paint();
              if (!board.flat().includes("k")) {
                el.querySelector("#wp-chess-status").textContent = "You win.";
                apiCall("/api/achievements/chess-mate", { method: "POST" }).catch(() => {});
                return;
              }
              const replies = allChessMoves(board, false);
              if (!replies.length) {
                el.querySelector("#wp-chess-status").textContent = "Black has no moves.";
                return;
              }
              replies.sort((a, b) => scoreChess(applyChess(board, a)) - scoreChess(applyChess(board, b)));
              board = applyChess(board, replies[0]);
              paint();
              if (!board.flat().includes("K")) el.querySelector("#wp-chess-status").textContent = "Checkmate — local AI.";
              else el.querySelector("#wp-chess-status").textContent = "Your move.";
              return;
            }
          }
          const p = board[r][c];
          selected = p && p === p.toUpperCase() ? { r, c } : null;
        };
      });
    };
    paint();
  }

  function openGo() {
    const size = 9;
    const board = Array.from({ length: size }, () => Array(size).fill(0));
    let stones = 0;
    const el = overlay("wp-arcade-overlay", `<div class="wp-arcade-card">
      <strong>Go 9×9 vs local AI</strong>
      <p class="stub" id="wp-go-status">Black to play. Captures count. 20 stones unlocks an achievement.</p>
      <div class="wp-board go" id="wp-go-board"></div>
      <button type="button" class="ghost" id="wp-arcade-close">Close</button>
    </div>`);
    el.querySelector("#wp-arcade-close").onclick = () => el.remove();
    const group = (r, c, color, seen) => {
      const key = `${r},${c}`;
      if (seen.has(key) || board[r]?.[c] !== color) return { stones: [], libs: 0 };
      seen.add(key);
      const stones = [[r, c]];
      let libs = 0;
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        const y = r + dr, x = c + dc;
        if (y < 0 || y >= size || x < 0 || x >= size) return;
        if (board[y][x] === 0) libs += 1;
        else if (board[y][x] === color) {
          const more = group(y, x, color, seen);
          stones.push(...more.stones);
          libs += more.libs;
        }
      });
      return { stones, libs };
    };
    const capture = (color) => {
      const seen = new Set();
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (board[r][c] !== color || seen.has(`${r},${c}`)) continue;
        const g = group(r, c, color, seen);
        if (g.libs === 0) g.stones.forEach(([y, x]) => { board[y][x] = 0; });
      }
    };
    const paint = () => {
      const grid = el.querySelector("#wp-go-board");
      grid.style.gridTemplateColumns = `repeat(${size}, 28px)`;
      grid.innerHTML = board.map((row, r) => row.map((v, c) => {
        const glyph = v === 1 ? "●" : v === 2 ? "○" : "";
        return `<button type="button" data-r="${r}" data-c="${c}">${glyph}</button>`;
      }).join("")).join("");
      grid.querySelectorAll("button").forEach(btn => {
        btn.onclick = () => {
          const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
          if (board[r][c]) return;
          board[r][c] = 1;
          capture(2);
          stones += 1;
          if (stones >= 20) apiCall("/api/achievements/go-stone", { method: "POST" }).catch(() => {});
          const empties = [];
          for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!board[y][x]) empties.push([y, x]);
          if (empties.length) {
            const [y, x] = empties[Math.floor(Math.random() * empties.length)];
            board[y][x] = 2;
            capture(1);
          }
          paint();
        };
      });
    };
    paint();
  }

  function openSolitaire() {
    const suits = ["♠", "♥", "♦", "♣"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];
    suits.forEach(s => ranks.forEach((r, i) => deck.push({ s, r, n: i + 1, red: s === "♥" || s === "♦", id: s + r, face: false })));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const tableau = Array.from({ length: 7 }, (_, col) => {
      const cards = deck.splice(0, col + 1);
      cards[cards.length - 1].face = true;
      return cards;
    });
    const stock = deck.map(c => ({ ...c, face: false }));
    const waste = [];
    const foundations = [[], [], [], []];
    let selected = null;
    const el = overlay("wp-arcade-overlay", `<div class="wp-arcade-card">
      <strong>Klondike solitaire</strong>
      <p class="stub">Click stock to draw. Build descending reds/blacks. Aces up.</p>
      <div class="wp-klondike" id="wp-sol"></div>
      <button type="button" class="ghost" id="wp-arcade-close">Close</button>
    </div>`);
    el.querySelector("#wp-arcade-close").onclick = () => el.remove();
    const canStack = (a, b) => a && b && a.red !== b.red && a.n === b.n - 1;
    const paint = () => {
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
        ${tableau.map((col, i) => `<div class="col" data-tab="${i}">${col.map(c => cardHtml(c, `data-tab="${i}"`)).join("") || '<div class="wp-card-face" style="opacity:.2"></div>'}</div>`).join("")}
      `;
      root.querySelector("[data-stock]")?.addEventListener("click", () => {
        if (stock.length) {
          const card = stock.pop();
          card.face = true;
          waste.push(card);
        } else {
          while (waste.length) {
            const card = waste.pop();
            card.face = false;
            stock.push(card);
          }
        }
        paint();
      });
      root.querySelectorAll("[data-waste], [data-tab], [data-found]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const fromWaste = btn.hasAttribute("data-waste");
          const tab = btn.dataset.tab != null ? Number(btn.dataset.tab) : null;
          const found = btn.dataset.found != null ? Number(btn.dataset.found) : null;
          const pile = fromWaste ? waste : (tab != null ? tableau[tab] : foundations[found]);
          const card = pile[pile.length - 1];
          if (!selected) {
            if (card && card.face) selected = { fromWaste, tab, found, id };
            return;
          }
          const src = selected.fromWaste ? waste : (selected.tab != null ? tableau[selected.tab] : foundations[selected.found]);
          const moving = src[src.length - 1];
          if (found != null) {
            const dest = foundations[found];
            const ok = (!dest.length && moving.n === 1) || (dest.length && dest[dest.length - 1].s === moving.s && dest[dest.length - 1].n + 1 === moving.n);
            if (ok) dest.push(src.pop());
          } else if (tab != null) {
            const dest = tableau[tab];
            const top = dest[dest.length - 1];
            if ((!top && moving.n === 13) || canStack(moving, top)) dest.push(src.pop());
          }
          if (src.length && selected.tab != null) src[src.length - 1].face = true;
          selected = null;
          if (foundations.every(f => f.length === 13)) {
            apiCall("/api/achievements/solitaire-clear", { method: "POST" }).catch(() => {});
            if (typeof showToast === "function") showToast("Klondike cleared", "good");
          }
          paint();
        });
      });
    };
    paint();
  }

  function openCart() {
    apiCall("/api/cart").then(res => {
      const items = res.items || [];
      const el = overlay("wp-cart-overlay", `<div class="wp-cart-card">
        <strong>Cart orchestrator</strong>
        <p class="stub">The agent queues things. You validate. Nothing is purchased automatically.</p>
        <form id="wp-cart-add" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
          <input name="title" required placeholder="Item" style="flex:1;min-width:140px;">
          <input name="url" placeholder="URL">
          <button class="primary" type="submit">Queue</button>
        </form>
        <div>${items.map(it => `<div class="card" style="margin:6px 0;padding:8px;">
          <strong>${escapeHtml(it.title)}</strong>
          <span class="pill">${escapeHtml(it.status)}</span>
          ${it.url ? `<div class="stub">${escapeHtml(it.url)}</div>` : ""}
          ${it.status === "queued" ? `<button class="primary" data-validate="${it.id}">Validate</button>
            <button class="ghost" data-reject="${it.id}">Reject</button>` : ""}
        </div>`).join("") || '<p class="stub">Cart is empty.</p>'}</div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </div>`);
      el.querySelector("#wp-arcade-close").onclick = () => el.remove();
      el.querySelector("#wp-cart-add").onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await apiCall("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: fd.get("title"), url: fd.get("url") }),
        });
        el.remove();
        openCart();
      };
      el.querySelectorAll("[data-validate]").forEach(btn => {
        btn.onclick = async () => {
          await apiCall(`/api/cart/${btn.dataset.validate}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "validated" }),
          });
          apiCall("/api/achievements/cart-yes", { method: "POST" }).catch(() => {});
          el.remove();
          openCart();
        };
      });
      el.querySelectorAll("[data-reject]").forEach(btn => {
        btn.onclick = async () => {
          await apiCall(`/api/cart/${btn.dataset.reject}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "rejected" }),
          });
          el.remove();
          openCart();
        };
      });
    });
  }

  function openAgents() {
    apiCall("/api/agents").then(res => {
      const spawned = res.spawned || [];
      const el = overlay("wp-agent-overlay", `<div class="wp-agent-card">
        <strong>Multi-agent</strong>
        <p class="stub">Spawn a parallel expert job. Stop any in-flight run.</p>
        <form id="wp-spawn" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
          <input name="prompt" required placeholder="What should the other agent do?" style="flex:1;min-width:180px;">
          <button class="primary" type="submit">Spawn</button>
        </form>
        <div>${spawned.map(j => `<div class="card" style="margin:6px 0;padding:8px;">
          <strong>${escapeHtml(j.title || j.id)}</strong>
          <span class="pill">${escapeHtml(j.status)}</span>
          ${j.status === "running" ? `<button class="ghost" data-stop="${j.id}">Stop</button>` : ""}
        </div>`).join("") || '<p class="stub">No spawned agents yet.</p>'}</div>
        <button type="button" class="ghost" id="wp-arcade-close">Close</button>
      </div>`);
      el.querySelector("#wp-arcade-close").onclick = () => el.remove();
      el.querySelector("#wp-spawn").onsubmit = async e => {
        e.preventDefault();
        const prompt = new FormData(e.target).get("prompt");
        await apiCall("/api/agents/spawn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        el.remove();
        openAgents();
      };
      el.querySelectorAll("[data-stop]").forEach(btn => {
        btn.onclick = async () => {
          await apiCall(`/api/agents/${btn.dataset.stop}/stop`, { method: "POST" });
          el.remove();
          openAgents();
        };
      });
    });
  }

  function injectSettingsExtras() {
    const host = document.getElementById("settings-export-me")?.closest(".card");
    if (!host || document.getElementById("wp-integrations")) return;
    const box = document.createElement("div");
    box.id = "wp-integrations";
    box.innerHTML = `
      <hr style="margin:14px 0;border:none;border-top:1px solid var(--border);">
      <strong style="font-size:12px;">SDKs and extensions</strong>
      <p class="stub">Cursor, Claude, ChatGPT, Codex, VS Code, Hugging Face, n8n, Obsidian — paste a token or path. The agent can use them as extra tools.</p>
      <div id="wp-int-list" class="stub">Loading…</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <button type="button" class="secondary" id="wp-open-cart">Cart</button>
        <button type="button" class="secondary" id="wp-open-agents">Multi-agent</button>
        <button type="button" class="secondary" id="wp-open-arcade">Arcade games</button>
        <button type="button" class="secondary" id="wp-open-achievements">Meme achievements</button>
      </div>
      <div id="wp-usage-split" class="stub" style="margin-top:10px;"></div>`;
    host.appendChild(box);
    apiCall("/api/integrations").then(res => {
      const list = document.getElementById("wp-int-list");
      if (!list) return;
      list.innerHTML = (res.integrations || []).map(it => `
        <label style="display:flex;gap:6px;align-items:center;margin:4px 0;font-size:12px;">
          <span style="min-width:110px;">${escapeHtml(it.label)} ${it.configured ? "✓" : ""}</span>
          <input data-int="${escapeHtml(it.id)}" placeholder="token / path" style="flex:1;">
        </label>`).join("");
      list.querySelectorAll("input[data-int]").forEach(inp => {
        inp.onchange = () => apiCall("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inp.dataset.int, token: inp.value }),
        });
      });
    }).catch(() => {});
    apiCall("/api/usage").then(u => {
      const el = document.getElementById("wp-usage-split");
      if (!el) return;
      const day = u.day || {};
      const month = u.month_total || {};
      el.textContent = `API usage — today ${Number(day.tokens || 0).toLocaleString()} tok / $${Number(day.estimated_cost_usd || 0).toFixed(2)} · this month ${Number(month.tokens || 0).toLocaleString()} tok / $${Number(month.estimated_cost_usd || 0).toFixed(2)}`;
    }).catch(() => {});
    document.getElementById("wp-open-cart").onclick = openCart;
    document.getElementById("wp-open-agents").onclick = openAgents;
    document.getElementById("wp-open-arcade").onclick = openArcadeHub;
    document.getElementById("wp-open-achievements").onclick = () => {
      apiCall("/api/achievements").then(res => {
        const rows = (res.achievements || []).map(a => `${a.unlocked ? "✓" : "○"} ${a.title} — ${a.hint} (+${a.coins})`).join("\n");
        window.alert(rows || "No achievements yet.");
      });
    };
  }

  function confirmCost(usd) {
    return new Promise(resolve => {
      document.getElementById("wp-confirm-cost")?.remove();
      const el = document.createElement("div");
      el.id = "wp-confirm-cost";
      el.className = "wp-confirm-cost";
      el.innerHTML = `<div class="wp-confirm-cost-card" role="dialog" aria-modal="true" aria-labelledby="wp-cost-title">
        <strong id="wp-cost-title">This turn may cost about $${Number(usd || 0).toFixed(2)}</strong>
        <p class="stub">Predicted over $0.10 in tokens. Confirm to send, or cancel and shorten the prompt.</p>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
          <button type="button" class="ghost" id="wp-cost-no">Cancel</button>
          <button type="button" class="primary" id="wp-cost-yes">Send anyway</button>
        </div>
      </div>`;
      document.body.appendChild(el);
      const done = ok => { el.remove(); resolve(!!ok); };
      el.querySelector("#wp-cost-yes").onclick = () => done(true);
      el.querySelector("#wp-cost-no").onclick = () => done(false);
      el.addEventListener("click", e => { if (e.target === el) done(false); });
      const onKey = e => {
        if (e.key === "Escape") { document.removeEventListener("keydown", onKey, true); done(false); }
      };
      document.addEventListener("keydown", onKey, true);
      el.querySelector("#wp-cost-yes").focus();
    });
  }
  window.wpConfirmCost = confirmCost;

  function awardDayCoins() {
    const painted = document.querySelectorAll(".tdy-hour-painted").length;
    apiCall("/api/coins/from-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ painted_hours: painted, played_game: false }),
    }).then(res => {
      if (res?.coins) {
        const cur = Number(localStorage.getItem("gameCoins") || 0);
        localStorage.setItem("gameCoins", String(cur + res.coins));
      }
    }).catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireCompileEnter();
    hydrateLoot();
    injectArcadeFab();
    guardMetricInputs();
    wireMetricRightClickGuard();
    const obs = new MutationObserver(() => {
      guardMetricInputs();
      hideNapkinTitleWhenScribbling();
      injectArcadeFab();
      injectSettingsExtras();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", e => {
      if (e.target?.id === "save-day") setTimeout(awardDayCoins, 400);
    });
  });
})();
