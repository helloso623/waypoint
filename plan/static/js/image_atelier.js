// --- Image atelier: infinite local generation, optional remote try-once ----------

const WP_ATELIER_CAPTURE_TABS = new Set([
  "Ideas", "Skills", "Problems", "Thinking", "Funny", "Essays", "Repository",
]);

function wpAtelierHash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function wpAtelierPalette(prompt) {
  const words = String(prompt || "waypoint atelier").toLowerCase().match(/[a-z0-9]+/g) || ["waypoint"];
  const colors = [];
  words.slice(0, 8).forEach((w, i) => {
    const h = wpAtelierHash(`${w}:${i}`);
    const hue = h % 360;
    const sat = 42 + (h % 38);
    const lit = 28 + ((h >>> 8) % 36);
    colors.push(`hsl(${hue} ${sat}% ${lit}%)`);
  });
  while (colors.length < 4) colors.push(colors[colors.length - 1] || "hsl(220 30% 22%)");
  return { words, colors, seed: wpAtelierHash(words.join("|")) };
}

function wpAtelierRng(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function wpLocalSvgDataUrl(prompt, width, height) {
  const w = width || 640;
  const h = height || 400;
  const pal = wpAtelierPalette(prompt);
  const state = { seed: pal.seed };
  const blobs = [];
  for (let i = 0; i < 6; i++) {
    const cx = (wpAtelierRng(state) * w).toFixed(1);
    const cy = (wpAtelierRng(state) * h).toFixed(1);
    const r = (50 + wpAtelierRng(state) * 140).toFixed(1);
    blobs.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pal.colors[i % pal.colors.length]}" opacity="0.55"/>`);
  }
  const label = (pal.words.slice(0, 3).join(" ") || "waypoint")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${pal.colors[0]}"/>
        <stop offset="1" stop-color="${pal.colors[1]}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${blobs.join("")}
    <text x="24" y="${h - 28}" fill="rgba(255,255,255,0.82)" font-family="Georgia,serif" font-size="22">${label}</text>
  </svg>`;
  const encoded = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(svg)))
    : "";
  return encoded ? `data:image/svg+xml;base64,${encoded}` : `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function wpLocalCanvasDataUrl(prompt, width, height) {
  const w = width || 640;
  const h = height || 400;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const pal = wpAtelierPalette(prompt);
  const state = { seed: pal.seed };
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, pal.colors[0]);
  g.addColorStop(1, pal.colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    const cx = wpAtelierRng(state) * w;
    const cy = wpAtelierRng(state) * h;
    const r = 40 + wpAtelierRng(state) * 140;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, pal.colors[i % pal.colors.length]);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "600 22px Georgia, serif";
  ctx.fillText((pal.words.slice(0, 3).join(" ") || "waypoint").slice(0, 36), 24, h - 28);
  return canvas.toDataURL("image/png");
}

function wpLocalImage(prompt) {
  try {
    if (typeof document !== "undefined" && document.createElement) {
      return wpLocalCanvasDataUrl(prompt, 640, 400);
    }
  } catch {
    /* fall through to SVG */
  }
  return wpLocalSvgDataUrl(prompt, 640, 400);
}

window.wpLocalImage = wpLocalImage;

async function wpGenerateImage(prompt, options) {
  const text = String(prompt == null ? "" : prompt).trim() || "waypoint abstract atelier";
  const provider = (options && options.provider) || "local";
  try {
    const res = await fetch("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text, provider }),
    });
    const data = await res.json().catch(() => ({}));
    const url = data.image || data.data_url;
    if (url) return url;
  } catch {
    /* local never runs out */
  }
  return wpLocalImage(text);
}

window.wpGenerateImage = wpGenerateImage;

function wpAtelierEnsureStyles() {
  if (document.getElementById("wp-atelier-styles")) return;
  const el = document.createElement("style");
  el.id = "wp-atelier-styles";
  el.textContent = `
    #wp-atelier-capture-slot { margin: 0 0 10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .wp-atelier-overlay { position:fixed; inset:0; z-index:80; background:rgba(0,0,0,0.35);
      display:flex; align-items:center; justify-content:center; padding:16px; }
    .wp-atelier-card { width:min(440px, 100%); background:var(--bg-card, var(--surface, #fff));
      color:var(--ink, #222); border:1px solid var(--gridline, #ddd); border-radius:12px; padding:14px 16px;
      box-shadow:0 12px 32px rgba(0,0,0,0.22); }
    .wp-atelier-card h3 { margin:0 0 8px; font-size:15px; }
    .wp-atelier-card textarea { width:100%; min-height:64px; font-size:13px; margin:6px 0 10px; }
    .wp-atelier-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .wp-atelier-preview { margin-top:10px; width:100%; border-radius:8px; border:1px solid var(--gridline, #ddd); display:block; }
    .wp-atelier-status { font-size:12px; color:var(--ink-muted, #666); margin:6px 0 0; }
  `;
  document.head.appendChild(el);
}

function wpAtelierActiveTab() {
  return typeof ACTIVE_TAB === "string" ? ACTIVE_TAB : "";
}

function wpAtelierShouldShowButton() {
  const tab = wpAtelierActiveTab();
  return tab === "Agent" || WP_ATELIER_CAPTURE_TABS.has(tab);
}

function wpAtelierMaybeInject() {
  wpAtelierEnsureStyles();
  const main = document.getElementById("main");
  if (!main) return;
  let slot = document.getElementById("wp-atelier-capture-slot");
  if (!wpAtelierShouldShowButton()) {
    if (slot) slot.remove();
    return;
  }
  if (slot && main.contains(slot)) return;
  slot = document.createElement("div");
  slot.id = "wp-atelier-capture-slot";
  slot.innerHTML = `<button type="button" class="secondary compact" data-wp-generate-image="1">Generate image</button>
    <span class="stub" style="font-size:11px;">Local, infinite — never hits a paid cap</span>`;
  main.insertBefore(slot, main.firstChild);
}

function wpAtelierClose() {
  document.getElementById("wp-atelier-overlay")?.remove();
}

function wpAtelierOpen(seedPrompt) {
  wpAtelierEnsureStyles();
  wpAtelierClose();
  const overlay = document.createElement("div");
  overlay.id = "wp-atelier-overlay";
  overlay.className = "wp-atelier-overlay";
  overlay.innerHTML = `
    <div class="wp-atelier-card" role="dialog" aria-label="Generate image">
      <h3>Generate image</h3>
      <p class="stub" style="margin:0;">Seeded local art from the prompt words. Optional remote try-once, then this same local fallback.</p>
      <textarea id="wp-atelier-prompt" placeholder="a quiet studio at dusk">${String(seedPrompt || "").replace(/</g, "")}</textarea>
      <div class="wp-atelier-actions">
        <button type="button" class="primary compact" id="wp-atelier-run">Generate</button>
        <button type="button" class="ghost compact" id="wp-atelier-close">Close</button>
      </div>
      <p class="wp-atelier-status" id="wp-atelier-status"></p>
      <img class="wp-atelier-preview" id="wp-atelier-preview" alt="Generated" hidden>
    </div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) wpAtelierClose();
  });
  document.body.appendChild(overlay);
  overlay.querySelector("#wp-atelier-close").onclick = wpAtelierClose;
  overlay.querySelector("#wp-atelier-run").onclick = async () => {
    const prompt = overlay.querySelector("#wp-atelier-prompt").value;
    const status = overlay.querySelector("#wp-atelier-status");
    const img = overlay.querySelector("#wp-atelier-preview");
    status.textContent = "Generating locally…";
    const url = wpLocalImage(prompt);
    img.src = url;
    img.hidden = false;
    status.textContent = "Local (infinite). Asking the server only if you need a remote try…";
    try {
      const remote = await wpGenerateImage(prompt, { provider: "local" });
      if (remote) {
        img.src = remote;
        status.textContent = "Ready — local procedural image, no paid cap.";
      }
    } catch {
      status.textContent = "Ready — local procedural image.";
    }
  };
  overlay.querySelector("#wp-atelier-prompt")?.focus();
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest?.("[data-wp-generate-image]");
  if (!trigger) return;
  e.preventDefault();
  wpAtelierOpen(trigger.getAttribute("data-wp-generate-image") === "1" ? "" : (trigger.getAttribute("data-wp-generate-image") || ""));
});

function wpAtelierBoot() {
  wpAtelierMaybeInject();
  const main = document.getElementById("main");
  if (main && !main._wpAtelierObserved) {
    main._wpAtelierObserved = true;
    const mo = new MutationObserver(() => wpAtelierMaybeInject());
    mo.observe(main, { childList: true, subtree: false });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wpAtelierBoot);
} else {
  wpAtelierBoot();
}
