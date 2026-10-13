// Lightweight, local-only behavior signals used to keep daily pursuits relevant.
(function initWaypointHabits(global) {
  "use strict";

  const STORAGE_KEY = "waypointHabitsV1";
  const EMA_ALPHA = 0.22;
  const EMA_DECAY = 1 - EMA_ALPHA;
  const QUEST_TABS = {
    pulse2: ["Today"],
    tasks3: ["Tasks"],
    addtask2: ["Tasks"],
    reflect1: ["Thinking"],
    contract1: ["Today"],
    contact1: ["Contacts"],
    match1: ["Practice"],
    paint6: ["Today"],
    showup1: ["Today"],
    book1: ["Hub"],
    blueprint1: ["Practice"],
    capture3: ["Hub"],
    overdue1: ["Tasks"],
    estimate1: ["Tasks"],
    actual1: ["Tasks"],
    talk1: ["Home"],
  };

  function emptyState() {
    return {
      version: 1,
      updatedAt: null,
      counts: {
        tabs: {},
        questCompleted: {},
        questSelected: {},
        pulse: 0,
        paintHours: 0,
        practice: {},
        skins: {},
      },
      ema: {
        tabs: {},
        questCompleted: {},
        questSelected: {},
        pulse: 0,
        paintHours: 0,
        practice: {},
        skins: {},
      },
    };
  }

  function objectMap(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function loadState() {
    let parsed = null;
    try {
      parsed = JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null");
    } catch (_) {
      parsed = null;
    }
    const base = emptyState();
    if (!parsed || typeof parsed !== "object") return base;
    const counts = objectMap(parsed.counts);
    const ema = objectMap(parsed.ema);
    Object.keys(base.counts).forEach(key => {
      if (typeof base.counts[key] === "object") {
        base.counts[key] = objectMap(counts[key]);
        base.ema[key] = objectMap(ema[key]);
      } else {
        base.counts[key] = Math.max(0, Number(counts[key]) || 0);
        base.ema[key] = Math.max(0, Number(ema[key]) || 0);
      }
    });
    base.updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    return base;
  }

  function saveState(state) {
    state.updatedAt = new Date().toISOString();
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Private browsing and locked-down webviews may reject storage.
    }
  }

  function bumpMap(state, bucket, key, amount) {
    if (!key) return false;
    const counts = state.counts[bucket];
    const ema = state.ema[bucket];
    Object.keys(ema).forEach(name => {
      ema[name] = Number((Math.max(0, Number(ema[name]) || 0) * EMA_DECAY).toFixed(6));
    });
    counts[key] = Math.max(0, Number(counts[key]) || 0) + amount;
    ema[key] = Number(((Math.max(0, Number(ema[key]) || 0)) + EMA_ALPHA * amount).toFixed(6));
    return true;
  }

  function bumpScalar(state, bucket, amount) {
    state.counts[bucket] = Math.max(0, Number(state.counts[bucket]) || 0) + amount;
    state.ema[bucket] = Number((
      Math.max(0, Number(state.ema[bucket]) || 0) * EMA_DECAY + EMA_ALPHA * amount
    ).toFixed(6));
    return true;
  }

  function observe(kind, detail) {
    const state = loadState();
    const name = String(kind || "").toLowerCase().replace(/[_\s]+/g, "-");
    const key = typeof detail === "string" ? detail.trim() : String(detail?.key || "").trim();
    let changed = false;
    if (name === "tab") changed = bumpMap(state, "tabs", key, 1);
    else if (name === "quest-completed" || name === "questcomplete" || name === "quest-complete") {
      changed = bumpMap(state, "questCompleted", key, 1);
    } else if (name === "quest-selected" || name === "questselect" || name === "quest-select") {
      changed = bumpMap(state, "questSelected", key, 1);
    } else if (name === "pulse") changed = bumpScalar(state, "pulse", 1);
    else if (name === "paint") changed = bumpScalar(state, "paintHours", Math.max(0, Number(detail) || 0));
    else if (name === "practice") changed = bumpMap(state, "practice", key, 1);
    else if (name === "skin") changed = bumpMap(state, "skins", key, 1);
    if (changed) saveState(state);
  }

  function signal(map, key) {
    return Math.log1p(Math.max(0, Number(map?.[key]) || 0));
  }

  function questScore(state, key) {
    let score = 0;
    score += signal(state.counts.questSelected, key) * 5 + signal(state.counts.questCompleted, key) * 4;
    score += (Number(state.ema.questSelected[key]) || 0) * 8;
    score += (Number(state.ema.questCompleted[key]) || 0) * 7;
    (QUEST_TABS[key] || []).forEach(tab => {
      score += signal(state.counts.tabs, tab) * 1.4 + (Number(state.ema.tabs[tab]) || 0) * 3;
    });
    if (key === "paint6" || key === "showup1") score += Math.log1p(state.counts.paintHours) * 2 + state.ema.paintHours * 2;
    if (key === "pulse2" || key === "showup1" || key === "reflect1") score += Math.log1p(state.counts.pulse) * 2 + state.ema.pulse * 3;
    if (key === "match1") {
      score += Object.values(state.counts.practice).reduce((sum, n) => sum + Math.log1p(Number(n) || 0), 0);
    }
    return score;
  }

  function suggestQuestKeys(poolKeys, n) {
    const pool = [...new Set((Array.isArray(poolKeys) ? poolKeys : []).filter(key => typeof key === "string"))];
    const take = Math.max(0, Math.min(pool.length, Number(n) || 0));
    const state = loadState();
    const ranked = pool.map((key, index) => ({ key, index, score: questScore(state, key) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return ranked.slice(0, take).map(item => item.key);
  }

  function suggestDefaultTab() {
    const state = loadState();
    const entries = Object.keys(state.counts.tabs).map((tab, index) => ({
      tab,
      index,
      score: signal(state.counts.tabs, tab) + (Number(state.ema.tabs[tab]) || 0) * 3,
    }));
    entries.sort((a, b) => b.score - a.score || a.index - b.index);
    return entries[0]?.tab || "Home";
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(loadState()));
  }

  global.WaypointHabits = { observe, suggestQuestKeys, suggestDefaultTab, snapshot };
})(window);
