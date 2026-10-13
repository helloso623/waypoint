// Style Paint — multi-layer visual effects on named UI regions.
// Config stored in localStorage + synced to /api/about as style_paint_config (JSON string).

(function () {
  const LS_KEY = "stylePaintConfig";
  const DB_KEY = "style_paint_config";
  const TARGETS = ["document", "hud", "nav", "main", "launcher"];
  const EFFECTS = ["aurora", "ember", "solstice", "midnight", "soft-glow", "dim", "frost"];

  const EFFECT_VARS = {
    aurora:     { accent: "#22d3ee", glow: "rgba(34,211,238,0.32)" },
    ember:      { accent: "#f97316", glow: "rgba(249,115,22,0.32)" },
    solstice:   { accent: "#eab308", glow: "rgba(234,179,8,0.28)" },
  };

  const MIDNIGHT_BG = "radial-gradient(ellipse 80% 60% at 50% 0%, #1e1b4b 0%, #0c0a14 45%, #030712 100%)";

  let _paintModeActive = false;
  let _paintModeEffect = null;
  let _paintBar = null;

  function _targetEl(target) {
    if (target === "document") return document.documentElement;
    if (target === "hud")      return document.getElementById("top-hud");
    if (target === "nav")      return document.getElementById("nav");
    if (target === "main")     return document.getElementById("main");
    if (target === "launcher") return document.querySelector("#launcher-cinematic, .launcher-cinematic");
    return null;
  }

  function _defaultConfig() {
    return { version: 1, layers: [] };
  }

  function stylePaintGetConfig() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg && Array.isArray(cfg.layers)) return cfg;
      }
    } catch (_) {}
    return _defaultConfig();
  }

  function stylePaintSaveConfig(cfg) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    } catch (_) {}
    try {
      if (typeof apiSafe === "function") {
        apiSafe("/api/about", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [DB_KEY]: JSON.stringify(cfg) }),
          _silent: true,
        });
      }
    } catch (_) {}
  }

  function _applyLayer(layer) {
    const el = _targetEl(layer.target);
    if (!el) return;
    const effect = layer.effect;
    el.removeAttribute("data-sp-effect");
    el.style.removeProperty("--sp-accent");
    el.style.removeProperty("--sp-glow");
    el.style.removeProperty("box-shadow");
    el.style.removeProperty("filter");
    el.style.removeProperty("backdrop-filter");

    if (!layer.enabled) return;

    el.dataset.spEffect = effect;

    if (EFFECT_VARS[effect]) {
      const v = EFFECT_VARS[effect];
      if (layer.target === "document") {
        document.documentElement.style.setProperty("--accent", v.accent);
        document.documentElement.style.setProperty("--glow-accent", v.glow);
      } else {
        el.style.setProperty("--sp-accent", v.accent);
        el.style.setProperty("--sp-glow", v.glow);
        el.style.setProperty("box-shadow", `0 0 0 2px ${v.accent}, 0 0 24px ${v.glow}`);
      }
      return;
    }

    if (effect === "midnight") {
      if (layer.target === "document") {
        document.body.style.background = MIDNIGHT_BG;
        document.body.style.backgroundAttachment = "fixed";
      } else {
        el.style.background = MIDNIGHT_BG;
      }
      return;
    }

    if (effect === "soft-glow") {
      el.style.setProperty("box-shadow", "0 0 32px var(--glow-accent, rgba(100,120,255,0.25))");
      return;
    }

    if (effect === "dim") {
      el.style.setProperty("filter", "brightness(0.82)");
      return;
    }

    if (effect === "frost") {
      el.style.setProperty("backdrop-filter", "blur(12px) saturate(1.4)");
      el.style.setProperty("background", "rgba(var(--bg-card-rgb, 20,20,28), 0.55)");
      return;
    }
  }

  function _clearLayer(layer) {
    const el = _targetEl(layer.target);
    if (!el) return;
    el.removeAttribute("data-sp-effect");
    el.style.removeProperty("--sp-accent");
    el.style.removeProperty("--sp-glow");
    el.style.removeProperty("box-shadow");
    el.style.removeProperty("filter");
    el.style.removeProperty("backdrop-filter");
    if (layer.effect === "midnight") {
      if (layer.target === "document") {
        document.body.style.removeProperty("background");
        document.body.style.removeProperty("background-attachment");
      } else {
        el.style.removeProperty("background");
      }
    }
    if (EFFECT_VARS[layer.effect] && layer.target === "document") {
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--glow-accent");
    }
  }

  function stylePaintApply() {
    const cfg = stylePaintGetConfig();
    // Clear all known targets first so removed layers don't linger.
    TARGETS.forEach(t => {
      _clearLayer({ effect: "midnight", target: t, enabled: true });
      _clearLayer({ effect: "aurora", target: t, enabled: true });
      const el = _targetEl(t);
      if (!el) return;
      el.removeAttribute("data-sp-effect");
      el.style.removeProperty("--sp-accent");
      el.style.removeProperty("--sp-glow");
      el.style.removeProperty("box-shadow");
      el.style.removeProperty("filter");
      el.style.removeProperty("backdrop-filter");
    });
    (cfg.layers || []).filter(l => l && l.enabled !== false).forEach(l => _applyLayer(l));
  }

  function stylePaintSetLayer(effect, target, enabled) {
    if (!TARGETS.includes(target)) target = "document";
    if (!EFFECTS.includes(effect)) return;
    const cfg = stylePaintGetConfig();
    const existing = cfg.layers.find(l => l.effect === effect && l.target === target);
    if (existing) {
      existing.enabled = enabled !== false;
    } else {
      cfg.layers.push({
        id: `l${Date.now().toString(36)}`,
        effect,
        target,
        enabled: enabled !== false,
      });
    }
    stylePaintSaveConfig(cfg);
    stylePaintApply();
  }

  function stylePaintRemoveLayer(id) {
    const cfg = stylePaintGetConfig();
    const layer = cfg.layers.find(l => l.id === id);
    if (layer) _clearLayer(layer);
    cfg.layers = cfg.layers.filter(l => l.id !== id);
    stylePaintSaveConfig(cfg);
  }

  function stylePaintToggleMode() {
    if (_paintModeActive) {
      _exitPaintMode();
    } else {
      stylePaintEnterMode(EFFECTS[0]);
    }
  }

  function _exitPaintMode() {
    _paintModeActive = false;
    _paintModeEffect = null;
    document.querySelectorAll("[data-sp-target]").forEach(el => {
      el.classList.remove("sp-hover-outline");
      el.removeEventListener("click", _paintClickHandler);
    });
    if (_paintBar) { _paintBar.remove(); _paintBar = null; }
  }

  function _paintClickHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget.dataset.spTarget;
    if (!_paintModeEffect || !target) return;
    stylePaintSetLayer(_paintModeEffect, target);
    if (typeof showToast === "function") showToast(`✓ ${_paintModeEffect} applied to ${target}`, "good");
  }

  function stylePaintEnterMode(effectId) {
    if (_paintModeActive) _exitPaintMode();
    _paintModeActive = true;
    _paintModeEffect = effectId || EFFECTS[0];

    document.querySelectorAll("[data-sp-target]").forEach(el => {
      el.classList.add("sp-hover-outline");
      el.addEventListener("click", _paintClickHandler);
    });

    _paintBar = document.createElement("div");
    _paintBar.id = "sp-paint-bar";
    _paintBar.className = "sp-paint-bar";
    _paintBar.innerHTML = `
      <span class="sp-paint-bar-label">Paint mode</span>
      <div class="sp-paint-bar-chips">
        ${EFFECTS.map(e => `<button type="button" class="sp-chip${e === _paintModeEffect ? " sp-chip--active" : ""}" data-sp-chip="${e}">${e}</button>`).join("")}
      </div>
      <button type="button" class="sp-paint-bar-done">Done</button>`;
    document.body.appendChild(_paintBar);

    _paintBar.querySelectorAll("[data-sp-chip]").forEach(btn => {
      btn.onclick = () => {
        _paintModeEffect = btn.dataset.spChip;
        _paintBar.querySelectorAll("[data-sp-chip]").forEach(b => b.classList.toggle("sp-chip--active", b.dataset.spChip === _paintModeEffect));
      };
    });
    _paintBar.querySelector(".sp-paint-bar-done").onclick = _exitPaintMode;
  }

  function stylePaintBoot() {
    // Assign data-sp-target attributes to known regions
    const regions = [
      ["#top-hud", "hud"],
      ["#nav", "nav"],
      ["#main", "main"],
      ["#launcher-cinematic, .launcher-cinematic", "launcher"],
    ];
    regions.forEach(([sel, name]) => {
      try {
        const el = document.querySelector(sel);
        if (el && !el.dataset.spTarget) el.dataset.spTarget = name;
      } catch (_) {}
    });
    if (document.documentElement && !document.documentElement.dataset.spTarget) {
      document.documentElement.dataset.spTarget = "document";
    }

    // Load config from DB if not cached
    try {
      if (typeof apiSafe === "function") {
        apiSafe("/api/about", { _silent: true }).then(settings => {
          if (settings && settings[DB_KEY]) {
            try {
              const dbCfg = JSON.parse(settings[DB_KEY]);
              if (dbCfg && Array.isArray(dbCfg.layers)) {
                localStorage.setItem(LS_KEY, JSON.stringify(dbCfg));
              }
            } catch (_) {}
          }
          // Also load hidden_apps
          if (settings && settings.hidden_apps) {
            try {
              const ha = JSON.parse(settings.hidden_apps);
              if (ha && Array.isArray(ha.ids)) {
                localStorage.setItem("hiddenAppIds", JSON.stringify(ha.ids));
                if (typeof renderLauncher === "function" && typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Home") {
                  renderLauncher().then(html => {
                    const main = document.getElementById("main");
                    if (main) main.innerHTML = html;
                  }).catch(() => {});
                }
              }
            } catch (_) {}
          }
          stylePaintApply();
        }).catch(() => stylePaintApply());
      } else {
        stylePaintApply();
      }
    } catch (_) {
      stylePaintApply();
    }
  }

  // Expose globals
  window.stylePaintGetConfig = stylePaintGetConfig;
  window.stylePaintSaveConfig = stylePaintSaveConfig;
  window.stylePaintApply = stylePaintApply;
  window.stylePaintSetLayer = stylePaintSetLayer;
  window.stylePaintRemoveLayer = stylePaintRemoveLayer;
  window.stylePaintToggleMode = stylePaintToggleMode;
  window.stylePaintEnterMode = stylePaintEnterMode;
  window.stylePaintBoot = stylePaintBoot;
  window.STYLE_PAINT_EFFECTS = EFFECTS;
  window.STYLE_PAINT_TARGETS = TARGETS;
})();
