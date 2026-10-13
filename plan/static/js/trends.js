// --- Trends: unified analysis workspace -------------------------------------------------------------

let TREND_STYLES_INJECTED = false;
let TREND_ANALYSIS_OPEN = false;
let TRD_ANALYSIS_CLICK_WIRED = false;

function trdEnsureStyles() {
  if (TREND_STYLES_INJECTED) return;
  TREND_STYLES_INJECTED = true;
  const el = document.createElement("style");
  el.id = "trd-styles";
  el.textContent = `
    .trd-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
    .trd-controls-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; }
    .trd-analysis-wrap { position: relative; }
    .trd-analysis-btn { padding: 4px 10px; font-size: 12px; cursor: pointer; }
    .trd-analysis-popover { display: none; position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
      min-width: 280px; max-width: 420px; padding: 12px 14px; background: var(--bg-card, var(--surface, var(--card)));
      border: 1px solid var(--gridline); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
    .trd-analysis-popover.open { display: block; }
    .trd-analysis-popover label { font-size: 12px; display: block; margin-bottom: 8px; }
    .trd-details { margin-bottom: 10px; border: 1px solid var(--gridline); border-radius: 10px; overflow: hidden; }
    .trd-details > summary { padding: 10px 14px; cursor: pointer; font-size: 13px; font-weight: 600;
      list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      background: var(--bg-card, var(--surface, var(--card))); user-select: none; }
    .trd-details > summary::-webkit-details-marker { display: none; }
    .trd-details > summary::after { content: "▸"; color: var(--ink-muted); font-size: 11px; transition: transform 0.15s; }
    .trd-details[open] > summary::after { transform: rotate(90deg); }
    .trd-details-body { padding: 0 14px 14px; border-top: 1px solid var(--gridline); }
    .trd-details-summary-sub { font-weight: 400; color: var(--ink-muted); font-size: 12px; }
    .flm-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
    .flm-date-label { font-size: 12px; display: inline-flex; align-items: center; gap: 6px; color: var(--ink-secondary); }
    .flm-date-label input { font-size: 12px; }
    .flm-empty { margin: 0; font-size: 12px; color: var(--ink-muted); }
    .flm-strip {
      display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 10px;
      scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
    }
    .flm-tile {
      flex: 0 0 168px; scroll-snap-align: start; min-height: 112px; padding: 10px 12px;
      border-radius: 10px; border: 1px solid var(--gridline); background: var(--bg-card, var(--surface, var(--card)));
      text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px;
    }
    .flm-tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .flm-tile-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; }
    .flm-tile-glyph { font-size: 14px; line-height: 1; }
    .flm-tile-source { letter-spacing: 0.02em; }
    .flm-tile-summary {
      font-size: 12px; line-height: 1.35; color: var(--ink-secondary); margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .flm-tile-time { margin-top: auto; font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
    .flm-tile--summary {
      cursor: default; border-style: dashed; background: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
    }
    .flm-tile--summary .flm-tile-head { color: var(--ink); }
    .flm-tile--summary .flm-tile-summary { -webkit-line-clamp: 4; color: var(--ink); }
    .flm-engraved-title {
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 1.35rem; font-weight: 400; font-style: italic;
      letter-spacing: 0.02em; color: var(--ink);
      margin: 0 0 10px; line-height: 1.35;
    }
    .flm-engrave-btn { padding: 4px 10px; font-size: 12px; cursor: pointer; }
    .flm-engrave-btn:disabled { opacity: 0.6; cursor: wait; }
    .trd-outlook { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; }
    .trd-outlook-card { padding:12px 14px; border:1px solid var(--gridline); border-radius:10px;
      background: var(--bg-card, var(--surface, var(--card))); }
    .trd-outlook-k { font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-muted); }
    .trd-outlook-v { font-size:22px; font-weight:650; margin:4px 0 2px; font-variant-numeric:tabular-nums; }
    .trd-outlook-d { font-size:12px; color:var(--ink-secondary); line-height:1.4; }
    .trd-honesty { font-size:12px; color:var(--ink-muted); margin:8px 0 0; }
    .trd-season-table { width:100%; border-collapse:collapse; font-size:12px; }
    .trd-season-table th, .trd-season-table td { padding:4px 6px; text-align:left; border-bottom:1px solid var(--gridline); }
    .trd-season-bar { height:6px; border-radius:3px; background:color-mix(in srgb, var(--accent) 55%, transparent); }
    .trd-forecast-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
    .trd-forecast-table { width:100%; border-collapse:collapse; font-size:12px; }
    .trd-forecast-table th, .trd-forecast-table td { padding:5px 6px; text-align:left; border-bottom:1px solid var(--gridline); font-variant-numeric:tabular-nums; }
    .trd-forecast-table th { color:var(--ink-muted); font-weight:600; font-size:11px; letter-spacing:.03em; }
    .trd-forecast-dayrow { display:flex; gap:8px; overflow-x:auto; padding:4px 0 8px; }
    .trd-forecast-pill { flex:0 0 auto; min-width:72px; padding:8px 10px; border:1px solid var(--gridline); border-radius:10px; background:var(--bg-card, var(--surface, var(--card))); }
    .trd-forecast-pill .k { font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-muted); }
    .trd-forecast-pill .v { font-size:16px; font-weight:650; margin-top:2px; }
    .trd-fill-gaps { font-size:12px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
  `;
  document.head.appendChild(el);
}

const TREND_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function trendWeekdayIndex(dateStr) {
  if (!dateStr) return 0;
  return (new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function trendMean(values) {
  const valid = values.filter(v => v != null && !Number.isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function linearGapFill(values) {
  const out = values.slice();
  let prev = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null || Number.isNaN(out[i])) continue;
    if (prev >= 0 && i - prev > 1) {
      const span = i - prev;
      const a = out[prev];
      const b = out[i];
      for (let j = 1; j < span; j++) out[prev + j] = a + (b - a) * (j / span);
    }
    prev = i;
  }
  if (prev >= 0) {
    for (let i = prev + 1; i < out.length; i++) if (out[i] == null) out[i] = out[prev];
  }
  const first = out.findIndex(v => v != null && !Number.isNaN(v));
  if (first > 0) {
    for (let i = 0; i < first; i++) out[i] = out[first];
  }
  return out;
}

function weekdaySeasonalMeans(dates, values) {
  const buckets = Array.from({ length: 7 }, () => []);
  (dates || []).forEach((d, i) => {
    const v = values[i];
    if (v == null || Number.isNaN(v)) return;
    buckets[trendWeekdayIndex(d)].push(v);
  });
  const global = trendMean(values) || 0;
  return buckets.map(b => (b.length ? b.reduce((a, c) => a + c, 0) / b.length : global));
}

function seasonalInterpolateNulls(dates, values) {
  const observed = values.map(v => (v == null || Number.isNaN(v) ? null : v));
  if (!dates || dates.length !== observed.length) return linearGapFill(observed);
  const season = weekdaySeasonalMeans(dates, observed);
  const deseas = observed.map((v, i) => (v == null ? null : v - season[trendWeekdayIndex(dates[i])]));
  return linearGapFill(deseas).map((v, i) => (v == null ? null : v + season[trendWeekdayIndex(dates[i])]));
}

function linearInterpolateNulls(values, dates) {
  // Named for tests. When dates are supplied, in-between gaps use weekday
  // seasonality + linear residual; otherwise a plain linear fill.
  if (dates && dates.length === values.length) return seasonalInterpolateNulls(dates, values);
  return linearGapFill(values);
}

function trendOlsFit(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.[1] || 0, n };
  const meanX = points.reduce((s, p) => s + p[0], 0) / n;
  const meanY = points.reduce((s, p) => s + p[1], 0) / n;
  const denom = points.reduce((s, p) => s + (p[0] - meanX) ** 2, 0);
  const slope = denom === 0 ? 0 : points.reduce((s, p) => s + (p[0] - meanX) * (p[1] - meanY), 0) / denom;
  return { slope, intercept: meanY - slope * meanX, n, meanX, meanY };
}

function trendResidualStd(points, fit) {
  if (!points.length) return 0;
  const sse = points.reduce((s, p) => {
    const yhat = fit.intercept + fit.slope * p[0];
    return s + (p[1] - yhat) ** 2;
  }, 0);
  return Math.sqrt(sse / Math.max(1, points.length - 1));
}

function predictForwardDetailed(values, horizon = 7, dates = null) {
  const known = [];
  values.forEach((v, i) => { if (v != null && !Number.isNaN(v)) known.push([i, v]); });
  if (known.length < 2) {
    return { y: [], lo: [], hi: [], holdoutMae: null, holdoutN: 0, method: "none", season: null };
  }
  const dateAt = (idx) => {
    if (dates && dates[idx]) return dates[idx];
    if (!dates || !dates.length) return null;
    const last = dates[dates.length - 1];
    const d = new Date(`${last}T12:00:00`);
    d.setDate(d.getDate() + (idx - (dates.length - 1)));
    return localYmd(d);
  };
  const season = dates ? weekdaySeasonalMeans(dates, values) : null;
  const deseasKnown = known.map(([i, v]) => {
    const s = season ? season[trendWeekdayIndex(dateAt(i))] : 0;
    return [i, v - s];
  });
  const holdN = Math.min(7, Math.max(0, known.length - 4));
  let holdoutMae = null;
  if (holdN >= 3) {
    const train = deseasKnown.slice(0, -holdN);
    const hold = deseasKnown.slice(-holdN);
    if (train.length >= 2) {
      const fitH = trendOlsFit(train.slice(-Math.min(21, train.length)));
      const err = hold.reduce((s, p) => s + Math.abs((fitH.intercept + fitH.slope * p[0]) - p[1]), 0) / hold.length;
      holdoutMae = err;
    }
  }
  const last = deseasKnown.slice(-Math.min(21, deseasKnown.length));
  const fit = trendOlsFit(last);
  const resid = trendResidualStd(last, fit);
  const start = known[known.length - 1][0];
  const y = [];
  const lo = [];
  const hi = [];
  for (let i = 1; i <= horizon; i++) {
    const idx = start + i;
    const seas = season ? season[trendWeekdayIndex(dateAt(idx))] : 0;
    const yhat = fit.intercept + fit.slope * idx + seas;
    const widen = 1.28 * resid * Math.sqrt(1 + i / Math.max(4, last.length));
    y.push(yhat);
    lo.push(yhat - widen);
    hi.push(yhat + widen);
  }
  return {
    y, lo, hi,
    holdoutMae,
    holdoutN: holdN,
    method: season ? "weekday+trend" : "linear",
    season,
    resid,
  };
}

function predictForward(values, horizon = 7, dates = null) {
  return predictForwardDetailed(values, horizon, dates).y;
}

function movingAverage(values, windowSize) {
  if (windowSize <= 1) return values.slice();
  const halfLo = Math.floor(windowSize / 2);
  const halfHi = Math.ceil(windowSize / 2) - 1;
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) {
      out[i] = null;
      continue;
    }
    const wLo = Math.max(0, i - halfLo);
    const wHi = Math.min(values.length - 1, i + halfHi);
    let lo = i;
    let hi = i;
    while (lo > wLo && values[lo - 1] != null && !Number.isNaN(values[lo - 1])) lo--;
    while (hi < wHi && values[hi + 1] != null && !Number.isNaN(values[hi + 1])) hi++;
    let sum = 0;
    let n = 0;
    for (let j = lo; j <= hi; j++) {
      sum += values[j];
      n++;
    }
    out[i] = n ? sum / n : null;
  }
  return out;
}

let LAST_TRENDS = [];
let LAST_HOURS_HISTORY = [];
let LAST_CORRELATIONS = [];
let LAST_PULSE_SUMMARY = [];
let LAST_PULSE_COVERAGE = 0;
let LAST_TREND_EVENTS = [];
let LAST_FORECAST_HOLDOUT = null;
let LAST_SEASON_ROWS = [];

const TREND_METRICS = [
  { key: "happiness", label: "Happiness", color: "#199e70", group: "mood" },
  { key: "motivation", label: "Motivation", color: "#7850dc", group: "mood" },
  { key: "focus", label: "Focus", color: "#c98500", group: "mood" },
  { key: "volatility", label: "Volatility", color: "#e04f5f", group: "mood" },
  { key: "eating", label: "Eating", color: "#8c5a2b", group: "mood" },
  { key: "work_time", label: "Work time (h)", color: "#2d7dd2", group: "work" },
  { key: "effective_work_time", label: "Effective work (h)", color: "#0d9488", group: "work" },
  { key: "sports", label: "Sports (min)", color: "#c026a0", group: "sports" },
];
let TREND_VISIBLE = new Set(TREND_METRICS.map(m => m.key));
let TREND_CORR_METHOD = "pearson";
let TREND_CUSTOM_SELECTED = new Set(["happiness", "work_time"]);

let TREND_RANGE_PRESET = "90d";
let TREND_CUSTOM_FROM = "";
let TREND_CUSTOM_TO = "";
let TREND_SMOOTH_WINDOW = 1;
let TREND_NORMALIZE = false;
let TREND_CUT_GAPS = false;
let TREND_FILL_GAPS = true;
let TREND_Y_TRANSFORM = "none";
let TREND_TRANSFORMS = Object.fromEntries(TREND_METRICS.map(m => [m.key, "raw"]));
let TREND_EXPANDED_DATE = null;
let TREND_PULSE_OVERLAY = false;
let TREND_CHART_ZOOM_RANGE = null;
let TREND_PRIMARY_CHART_WIRED = false;

let FLM_DATE = "";
let FLM_RECEIPTS = [];
let FLM_LOADED_DATE = "";
let FLM_NOT_FOUND = false;
let FLM_LOADING = false;
let FLM_ENGRAVED_TITLE = "";
let FLM_ENGRAVE_LOADING = false;
let FLM_ENGRAVE_CACHED = false;

const FLM_SOURCES = {
  planner: { color: "#3987e5", glyph: "&#128197;", label: "Planner" },
  arcade: { color: "#d55181", glyph: "&#127919;", label: "Arcade" },
  blueprint: { color: "#9085e9", glyph: "&#11041;", label: "Blueprint" },
  parallel: { color: "#c98500", glyph: "&#127756;", label: "Parallel" },
  docs: { color: "#199e70", glyph: "&#128221;", label: "Docs" },
  system: { color: "#7a7a88", glyph: "&#9881;&#65039;", label: "System" },
};

const TREND_RANGE_PRESETS = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "1y", label: "1y", days: 365 },
  { id: "all", label: "All", days: null },
  { id: "custom", label: "Custom", days: null },
];

const TREND_TRANSFORM_OPTIONS = [
  { id: "raw", label: "Raw" },
  { id: "zscore", label: "Z-score" },
  { id: "cumsum", label: "Cumulative sum" },
  { id: "delta", label: "Delta (day-over-day)" },
];

const TREND_Y_TRANSFORM_OPTIONS = [
  { id: "none", label: "None" },
  { id: "log", label: "Log₁₀" },
  { id: "square", label: "Square (y²)" },
];

function trendMetric(key) {
  return TREND_METRICS.find(m => m.key === key);
}

function getFilteredDays() {
  if (!LAST_TRENDS.length) return [];
  const all = LAST_TRENDS;
  const lastDate = all[all.length - 1].date;

  if (TREND_RANGE_PRESET === "custom") {
    const from = TREND_CUSTOM_FROM || all[0].date;
    const to = TREND_CUSTOM_TO || lastDate;
    return all.filter(d => d.date >= from && d.date <= to);
  }
  if (TREND_RANGE_PRESET === "all") return all.slice();

  const preset = TREND_RANGE_PRESETS.find(p => p.id === TREND_RANGE_PRESET);
  const days = preset?.days ?? 90;
  const end = new Date(lastDate + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const startStr = localYmd(start);
  return all.filter(d => d.date >= startStr);
}

function getSelectedRangeDays() {
  const filtered = getFilteredDays();
  if (filtered.length) {
    const first = filtered[0].date;
    const last = filtered[filtered.length - 1].date;
    const a = new Date(first + "T12:00:00");
    const b = new Date(last + "T12:00:00");
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  }
  const preset = TREND_RANGE_PRESETS.find(p => p.id === TREND_RANGE_PRESET);
  if (TREND_RANGE_PRESET === "all") return 366;
  return preset?.days ?? 90;
}

function getFilteredPulseSummary() {
  const daySet = new Set(getFilteredDays().map(d => d.date));
  return LAST_PULSE_SUMMARY.filter(row => daySet.has(row.date));
}

function computePulseCoverageInRange() {
  return getFilteredPulseSummary().filter(row => row.count >= 2).length;
}

async function refreshPulseSummaryData() {
  const rangeDays = getSelectedRangeDays();
  try {
    const resp = await api(`/api/pulses/summary?days=${Math.min(rangeDays, 366)}`);
    LAST_PULSE_SUMMARY = resp.days || [];
    LAST_PULSE_COVERAGE = resp.pulse_coverage ?? 0;
  } catch {
    /* keep prior summary on fetch failure */
  }
}

function getFilteredHoursHistory() {
  const daySet = new Set(getFilteredDays().map(d => d.date));
  return LAST_HOURS_HISTORY.filter(h => daySet.has(h.date));
}

function extractValues(days, key) {
  return days.map(d => {
    const raw = d[key];
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  });
}

function applyYTransform(values, transform) {
  if (!transform || transform === "none") return values;
  if (transform === "log") {
    return values.map(v => {
      if (v == null || Number.isNaN(v) || v <= 0) return null;
      return Math.log10(v);
    });
  }
  if (transform === "square") {
    return values.map(v => (v == null || Number.isNaN(v) ? null : v * v));
  }
  return values;
}

function trendCutSeriesGaps(x, y) {
  // Kept for compatibility. "Cut gaps" no longer drops points — it uses connectgaps.
  return { x, y };
}

function trendYAxisTitle() {
  if (TREND_NORMALIZE) return "0 – 1 (normalized)";
  if (TREND_Y_TRANSFORM === "log") return "log₁₀(y)";
  if (TREND_Y_TRANSFORM === "square") return "y²";
  return "";
}

function applyTransform(values, transform) {
  const nums = values.map(v => (v == null || Number.isNaN(v) ? null : v));
  if (transform === "raw") return nums;
  if (transform === "zscore") {
    const valid = nums.filter(v => v != null);
    if (!valid.length) return nums.map(() => null);
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    const variance = valid.reduce((a, v) => a + (v - mean) ** 2, 0) / valid.length;
    const std = Math.sqrt(variance) || 1;
    return nums.map(v => (v == null ? null : (v - mean) / std));
  }
  if (transform === "cumsum") {
    let sum = 0;
    return nums.map(v => {
      if (v == null) {
        sum = 0;
        return null;
      }
      sum += v;
      return sum;
    });
  }
  if (transform === "delta") {
    return nums.map((v, i) => {
      if (i === 0 || v == null || nums[i - 1] == null) return null;
      return v - nums[i - 1];
    });
  }
  return nums;
}

function normalize01(values) {
  const valid = values.filter(v => v != null && !Number.isNaN(v));
  if (!valid.length) return values;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  return values.map(v => (v == null || Number.isNaN(v) ? null : (v - min) / span));
}

function trendVisibleDayCount(days) {
  if (!TREND_CHART_ZOOM_RANGE) return days.length;
  const x0 = String(TREND_CHART_ZOOM_RANGE[0]).slice(0, 10);
  const x1 = String(TREND_CHART_ZOOM_RANGE[1]).slice(0, 10);
  return days.filter(d => d.date >= x0 && d.date <= x1).length;
}

function trendEffectiveSmoothWindow(days) {
  if (TREND_SMOOTH_WINDOW <= 1) return 1;
  const visible = trendVisibleDayCount(days);
  if (visible >= days.length) return TREND_SMOOTH_WINDOW;
  return Math.max(1, Math.min(TREND_SMOOTH_WINDOW, Math.floor(visible / 7) || 1));
}

function buildSeriesForMetric(days, metric, smoothOverride) {
  let values = extractValues(days, metric.key);
  values = applyTransform(values, TREND_TRANSFORMS[metric.key] || "raw");
  const smooth = smoothOverride ?? trendEffectiveSmoothWindow(days);
  if (smooth > 1) values = movingAverage(values, smooth);
  const dates = days.map(d => d.date);
  if (TREND_FILL_GAPS) values = linearInterpolateNulls(values, dates);
  if (TREND_NORMALIZE) values = normalize01(values);
  values = applyYTransform(values, TREND_Y_TRANSFORM);
  return values;
}

function paintedHoursByDate() {
  const map = {};
  for (const h of getFilteredHoursHistory()) {
    const total = Object.values(h.counts || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    map[h.date] = total;
  }
  return map;
}

function trendProductAnnotations(days, metrics) {
  const notes = [];
  if (!days.length) return notes;
  const hap = extractValues(days, "happiness");
  const knownH = hap.map((v, i) => (v == null ? null : { i, v, date: days[i].date })).filter(Boolean);
  if (knownH.length >= 3) {
    const hi = knownH.reduce((a, b) => (b.v > a.v ? b : a));
    const lo = knownH.reduce((a, b) => (b.v < a.v ? b : a));
    notes.push({ date: hi.date, text: `Peak happiness ${formatStat(hi.v)}`, color: "#199e70" });
    if (lo.date !== hi.date) notes.push({ date: lo.date, text: `Low happiness ${formatStat(lo.v)}`, color: "#e04f5f" });
  }
  const paint = paintedHoursByDate();
  const paintDays = days.map(d => ({ date: d.date, h: paint[d.date] || 0 })).filter(d => d.h > 0);
  if (paintDays.length) {
    const heavy = paintDays.reduce((a, b) => (b.h > a.h ? b : a));
    if (heavy.h >= 4) notes.push({ date: heavy.date, text: `${heavy.h.toFixed(0)}h painted`, color: "#c98500" });
  }
  const range = new Set(days.map(d => d.date));
  const events = (LAST_TREND_EVENTS || []).filter(ev => range.has(ev.date || ev.start_date));
  events.slice(0, 4).forEach(ev => {
    const date = ev.date || ev.start_date;
    const title = String(ev.title || "event").slice(0, 28);
    const time = ev.all_day || !ev.start_time ? "" : ` ${String(ev.start_time).slice(0, 5)}`;
    notes.push({ date, text: `${title}${time}`, color: "var(--ink-muted)" });
  });
  return notes.slice(0, 8);
}

function buildLocalMonthOutlook(days) {
  const n = days.length;
  if (n < 5) return null;
  const paint = paintedHoursByDate();
  const take = (key, start, end) => {
    const slice = days.slice(Math.max(0, start), end);
    if (key === "paint") return trendMean(slice.map(d => paint[d.date] ?? null));
    return trendMean(extractValues(slice, key));
  };
  const recentN = Math.min(14, Math.max(4, Math.floor(n / 3)));
  const recent = { start: n - recentN, end: n };
  const prior = { start: Math.max(0, n - recentN * 2), end: n - recentN };
  const hapR = take("happiness", recent.start, recent.end);
  const hapP = take("happiness", prior.start, prior.end);
  const energyR = take("motivation", recent.start, recent.end);
  const energyP = take("motivation", prior.start, prior.end);
  const paintR = take("paint", recent.start, recent.end);
  const paintP = take("paint", prior.start, prior.end);
  const hapDates = days.map(d => d.date);
  const hapSeries = extractValues(days, "happiness");
  const energySeries = extractValues(days, "motivation");
  const paintSeries = days.map(d => (paint[d.date] != null ? paint[d.date] : null));
  const hapF = predictForwardDetailed(hapSeries, 30, hapDates);
  const energyF = predictForwardDetailed(energySeries, 30, hapDates);
  const paintF = predictForwardDetailed(paintSeries, 30, hapDates);
  const nextHap = hapF.y.length ? trendMean(hapF.y) : hapR;
  const nextEnergy = energyF.y.length ? trendMean(energyF.y) : energyR;
  const nextPaint = paintF.y.length ? trendMean(paintF.y) : paintR;
  const delta = (a, b) => (a == null || b == null ? null : a - b);
  const dH = delta(hapR, hapP);
  const dE = delta(energyR, energyP);
  const dP = delta(paintR, paintP);
  const votes = [dH, dE, dP].filter(v => v != null);
  const tilt = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
  const label = tilt > 0.12 ? "brighter" : tilt < -0.12 ? "softer" : "steady";
  LAST_FORECAST_HOLDOUT = hapF.holdoutMae;
  return {
    label,
    happiness: { recent: hapR, prior: hapP, next: nextHap, delta: dH },
    energy: { recent: energyR, prior: energyP, next: nextEnergy, delta: dE },
    paint: { recent: paintR, prior: paintP, next: nextPaint, delta: dP },
    holdoutMae: hapF.holdoutMae,
    holdoutN: hapF.holdoutN,
    method: hapF.method,
  };
}

function interpolatedGapPoints(days, metric) {
  const dates = days.map(d => d.date);
  let raw = extractValues(days, metric.key);
  raw = applyTransform(raw, TREND_TRANSFORMS[metric.key] || "raw");
  const smooth = trendEffectiveSmoothWindow(days);
  if (smooth > 1) raw = movingAverage(raw, smooth);
  const filled = linearInterpolateNulls(raw, dates);
  let shownFilled = filled;
  if (TREND_NORMALIZE) shownFilled = normalize01(filled);
  shownFilled = applyYTransform(shownFilled, TREND_Y_TRANSFORM);
  const x = [];
  const y = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] == null && filled[i] != null) {
      x.push(dates[i]);
      y.push(shownFilled[i]);
    }
  }
  return { x, y, filledCount: x.length, observed: raw, filled };
}

function trendGapStats(days, key) {
  const dates = days.map(d => d.date);
  const observed = extractValues(days, key);
  const filled = linearInterpolateNulls(observed, dates);
  const interior = [];
  for (let i = 0; i < observed.length; i++) {
    if (observed[i] == null && filled[i] != null) {
      interior.push({
        date: dates[i],
        value: filled[i],
        weekday: TREND_WEEKDAY_LABELS[trendWeekdayIndex(dates[i])],
      });
    }
  }
  return { gaps: interior.length, interior, filled, observed };
}

function trendBuildTrace(x, y, spec) {
  // Cut gaps = draw lines through missing/null points while keeping every date.
  return { ...spec, x, y, connectgaps: !!TREND_CUT_GAPS };
}

function trendPrimaryTraceSpecs(days, metrics) {
  const x = days.map(d => d.date);
  const lineWidth = trendLineWidthForZoom(days);
  const traces = metrics.map(m => trendBuildTrace(x, buildSeriesForMetric(days, m), {
    name: m.label,
    type: "scatter",
    mode: "lines",
    line: { color: m.color, width: lineWidth },
  }));
  LAST_SEASON_ROWS = [];
  let bestHoldout = null;
  metrics.forEach(m => {
    const series = buildSeriesForMetric(days, m);
    const observed = extractValues(days, m.key);
    const forecast = predictForwardDetailed(observed, 7, x);
    if (forecast.holdoutMae != null && (bestHoldout == null || forecast.holdoutMae < bestHoldout.mae)) {
      bestHoldout = { mae: forecast.holdoutMae, n: forecast.holdoutN, label: m.label };
    }
    const lastDate = days.length ? days[days.length - 1].date : null;
    if (forecast.y.length && lastDate) {
      const fx = [lastDate];
      const fy = [series[series.length - 1]];
      const flo = [series[series.length - 1]];
      const fhi = [series[series.length - 1]];
      const start = new Date(`${lastDate}T12:00:00`);
      forecast.y.forEach((value, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i + 1);
        fx.push(localYmd(d));
        fy.push(value);
        flo.push(forecast.lo[i]);
        fhi.push(forecast.hi[i]);
      });
      traces.push({
        name: `${m.label} 80% band`,
        type: "scatter",
        x: fx.concat(fx.slice().reverse()),
        y: fhi.concat(flo.slice().reverse()),
        fill: "toself",
        fillcolor: "rgba(120,140,160,0.12)",
        line: { color: "transparent" },
        hoverinfo: "skip",
        showlegend: false,
      });
      traces.push({
        name: `${m.label} forecast`,
        type: "scatter",
        mode: "lines",
        x: fx,
        y: fy,
        line: { color: m.color, width: Math.max(1, lineWidth - 0.5), dash: "dot" },
        opacity: 0.7,
        hovertemplate: "%{x}<br>predicted %{y:.2f}<extra></extra>",
      });
    }
    traces.push({
      name: `${m.label} observed`,
      type: "scatter",
      mode: "markers",
      x,
      y: observed,
      marker: { color: m.color, size: 5 },
      hovertemplate: "%{x}<br>logged %{y:.2f}<extra></extra>",
    });
    if (TREND_FILL_GAPS) {
      const gaps = interpolatedGapPoints(days, m);
      if (gaps.x.length) {
        traces.push({
          name: `${m.label} interpolated`,
          type: "scatter",
          mode: "markers",
          x: gaps.x,
          y: gaps.y,
          marker: { color: m.color, size: 7, symbol: "circle-open", line: { width: 1.5, color: m.color } },
          hovertemplate: "%{x}<br>in-between %{y:.2f}<extra></extra>",
        });
      }
    }
    const lo = [];
    const hi = [];
    for (let i = 0; i < observed.length; i++) {
      if (observed[i] == null) { lo.push(null); hi.push(null); continue; }
      const chunk = [];
      for (let j = Math.max(0, i - 7); j <= i; j++) if (observed[j] != null) chunk.push(observed[j]);
      const mean = chunk.reduce((a, c) => a + c, 0) / chunk.length;
      const std = Math.sqrt(chunk.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, chunk.length - 1)) || 0;
      lo.push(mean - 1.28 * std);
      hi.push(mean + 1.28 * std);
    }
    traces.push({
      name: `${m.label} residual band`,
      type: "scatter",
      x: x.concat(x.slice().reverse()),
      y: hi.concat(lo.slice().reverse()),
      fill: "toself",
      fillcolor: "rgba(120,140,160,0.08)",
      line: { color: "transparent" },
      hoverinfo: "skip",
      showlegend: false,
    });
    const buckets = Array.from({ length: 7 }, () => []);
    days.forEach((d, i) => {
      if (observed[i] == null) return;
      buckets[trendWeekdayIndex(d.date)].push(observed[i]);
    });
    LAST_SEASON_ROWS.push({
      key: m.key,
      label: m.label,
      color: m.color,
      means: buckets.map(b => (b.length ? b.reduce((a, c) => a + c, 0) / b.length : null)),
      n: buckets.map(b => b.length),
    });
  });
  LAST_FORECAST_HOLDOUT = bestHoldout ? bestHoldout.mae : LAST_FORECAST_HOLDOUT;
  if (TREND_PULSE_OVERLAY) {
    const pulseByDate = Object.fromEntries(
      getFilteredPulseSummary().map(row => [row.date, row])
    );
    const pulseY = days.map(d => pulseByDate[d.date]?.avg_happiness ?? null);
    const pulseCustom = days.map(d => pulseByDate[d.date]?.count ?? 0);
    const pulseTrace = trendBuildTrace(x, pulseY, {
      name: "Mood pulses (avg)",
      type: "scatter",
      mode: "lines+markers",
      line: { color: "#e04f5f", width: lineWidth, dash: "dash" },
      marker: { size: 6, color: "#e04f5f" },
      customdata: pulseCustom,
      hovertemplate: "%{x}<br>Avg happiness: %{y:.1f}<br>Pulses: %{customdata}<extra></extra>",
    });
    traces.push(pulseTrace);
  }
  return traces;
}

function renderWeekdaySeasonalityHtml() {
  if (!LAST_SEASON_ROWS.length) {
    return `<p class="stub" style="margin:0;">Log a few weekdays to see seasonality.</p>`;
  }
  const rows = LAST_SEASON_ROWS.map(row => {
    const cells = TREND_WEEKDAY_LABELS.map((lab, i) => {
      const v = row.means[i];
      return `<td>${v == null ? "—" : formatStat(v)}<span class="stub"> n=${row.n[i]}</span></td>`;
    }).join("");
    return `<tr><th style="color:${row.color};">${escapeHtml(row.label)}</th>${cells}</tr>`;
  }).join("");
  const headline = LAST_SEASON_ROWS.map(row => {
    const pairs = TREND_WEEKDAY_LABELS.map((lab, i) => row.means[i] == null ? null : `${lab} ${formatStat(row.means[i])}`).filter(Boolean);
    return pairs.length ? `${row.label}: ${pairs.join(" · ")}` : null;
  }).filter(Boolean);
  return `
    <p class="stub" id="trd-weekday-note" style="margin:0 0 8px;">Weekday seasonality · ${escapeHtml(headline[0] || "not enough overlapping weekdays yet")}</p>
    <table class="trd-season-table">
      <thead><tr><th></th>${TREND_WEEKDAY_LABELS.map(l => `<th>${l}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderOutlookHtml() {
  const outlook = buildLocalMonthOutlook(getFilteredDays());
  if (!outlook) {
    return `<p class="stub" style="margin:0;">Log happiness, motivation, and a few painted days to unlock a next-month outlook.</p>`;
  }
  const deltaTxt = (d) => d == null ? "—" : `${d > 0 ? "+" : ""}${formatStat(d)} vs prior fortnight`;
  const hold = outlook.holdoutMae == null
    ? "Hold-out needs more logged days."
    : `Hold-out MAE ${formatStat(outlook.holdoutMae)} on the last ${outlook.holdoutN} logged days — in-sample fit is not the score.`;
  return `
    <p class="stub" style="margin:0 0 10px;">Next-month outlook from happiness, energy (motivation), and painted hours. Local model only — ${escapeHtml(outlook.method)} with weekday seasonality.</p>
    <div class="trd-outlook">
      <div class="trd-outlook-card">
        <div class="trd-outlook-k">Outlook</div>
        <div class="trd-outlook-v">${escapeHtml(outlook.label)}</div>
        <div class="trd-outlook-d">Composite of recent fortnights, not a deadline score.</div>
      </div>
      <div class="trd-outlook-card">
        <div class="trd-outlook-k">Happiness</div>
        <div class="trd-outlook-v">${formatStat(outlook.happiness.next)}</div>
        <div class="trd-outlook-d">Recent ${formatStat(outlook.happiness.recent)} · ${deltaTxt(outlook.happiness.delta)}</div>
      </div>
      <div class="trd-outlook-card">
        <div class="trd-outlook-k">Energy</div>
        <div class="trd-outlook-v">${formatStat(outlook.energy.next)}</div>
        <div class="trd-outlook-d">Motivation as energy · recent ${formatStat(outlook.energy.recent)} · ${deltaTxt(outlook.energy.delta)}</div>
      </div>
      <div class="trd-outlook-card">
        <div class="trd-outlook-k">Paint</div>
        <div class="trd-outlook-v">${formatStat(outlook.paint.next)}h</div>
        <div class="trd-outlook-d">Typical painted hours / day · ${deltaTxt(outlook.paint.delta)}</div>
      </div>
    </div>
    <p class="trd-honesty">${escapeHtml(hold)}</p>`;
}

function renderFillGapsControl(id) {
  return `<label class="trd-fill-gaps">
      <input type="checkbox" class="trend-fill-gaps" id="${id}" ${TREND_FILL_GAPS ? "checked" : ""}>
      <span>Fill gaps</span>
    </label>`;
}

function renderLocalForecastHtml() {
  const days = getFilteredDays();
  const metrics = TREND_METRICS.filter(m => TREND_VISIBLE.has(m.key));
  if (!days.length || !metrics.length) {
    return `<p class="stub" style="margin:0;">Log a few days — this panel interpolates the in-between, then projects 7 days with hold-out MAE.</p>`;
  }
  const dates = days.map(d => d.date);
  const lastDate = dates[dates.length - 1];
  const start = lastDate ? new Date(`${lastDate}T12:00:00`) : null;
  const horizonLabels = [];
  if (start) {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const ymd = localYmd(d);
      horizonLabels.push(`${TREND_WEEKDAY_LABELS[trendWeekdayIndex(ymd)]} ${ymd.slice(5)}`);
    }
  }
  const rows = [];
  let bestMae = null;
  let totalGaps = 0;
  metrics.forEach(m => {
    const observed = extractValues(days, m.key);
    const gaps = trendGapStats(days, m.key);
    totalGaps += gaps.gaps;
    const forecast = predictForwardDetailed(observed, 7, dates);
    if (forecast.holdoutMae != null && (bestMae == null || forecast.holdoutMae < bestMae.mae)) {
      bestMae = { mae: forecast.holdoutMae, n: forecast.holdoutN, label: m.label };
    }
    const cells = (forecast.y.length ? forecast.y : Array(7).fill(null))
      .slice(0, 7)
      .map(v => `<td>${formatStat(v)}</td>`)
      .join("");
    rows.push(`<tr>
      <th style="color:${m.color};">${escapeHtml(m.label)}</th>
      <td>${gaps.gaps}</td>
      ${cells}
      <td>${forecast.holdoutMae == null ? "—" : formatStat(forecast.holdoutMae)}</td>
    </tr>`);
  });
  const primary = metrics[0] || TREND_METRICS[0];
  const primaryForecast = predictForwardDetailed(extractValues(days, primary.key), 7, dates);
  const pills = (primaryForecast.y || []).slice(0, 7).map((v, i) => `
      <div class="trd-forecast-pill">
        <div class="k">${escapeHtml(horizonLabels[i] || `d+${i + 1}`)}</div>
        <div class="v">${formatStat(v)}</div>
      </div>`).join("");
  const maeLine = bestMae
    ? `Hold-out MAE ${formatStat(bestMae.mae)} on the last ${bestMae.n} logged days (${escapeHtml(bestMae.label)}). In-sample fit is not the score.`
    : "Hold-out MAE needs more logged days (train on earlier points, score the last week).";
  const fillNote = TREND_FILL_GAPS
    ? `${totalGaps} in-between day${totalGaps === 1 ? "" : "s"} filled with weekday-seasonal residuals (open circles on the chart).`
    : "Fill gaps is off — the line leaves holes. Turn it on to draw the in-between.";
  return `
    <div class="trd-forecast-head">
      <p class="stub" style="margin:0; flex:1;">Local model only — weekday means stripped, linear residual interpolated, weekday restored. No scipy. 7-day outlook is OLS on the last 21 deseasonalized points with an 80% residual band.</p>
      ${renderFillGapsControl("trend-fill-gaps-panel")}
    </div>
    <div class="trd-forecast-dayrow" id="trend-forecast-7day">${pills || '<p class="stub" style="margin:0;">Need at least two logged points for a 7-day outlook.</p>'}</div>
    <table class="trd-forecast-table">
      <thead><tr><th>Metric</th><th>Gaps filled</th>${horizonLabels.map(l => `<th>${escapeHtml(l)}</th>`).join("")}<th>MAE</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <p class="trd-honesty">${escapeHtml(fillNote)} ${escapeHtml(maeLine)}</p>`;
}

function trendLineWidthForZoom(days) {
  const visible = trendVisibleDayCount(days);
  if (visible < 30) return 2.5;
  if (visible < 90) return 2;
  return 1.5;
}

function trendRestylePrimaryChart(el) {
  if (!el || !window.Plotly || !el.data) return;
  if (TREND_CUT_GAPS || TREND_Y_TRANSFORM !== "none") {
    drawPrimaryChart();
    return;
  }
  const days = getFilteredDays();
  const metrics = TREND_METRICS.filter(m => TREND_VISIBLE.has(m.key));
  if (!days.length || !metrics.length) return;
  const traces = trendPrimaryTraceSpecs(days, metrics);
  if (traces.length !== (el.data || []).length) {
    drawPrimaryChart();
    return;
  }
  const indices = traces.map((_, i) => i);
  try {
    Plotly.restyle(el, {
      y: traces.map(t => t.y),
      connectgaps: traces.map(t => !!t.connectgaps),
      "line.width": traces.map(t => t.line?.width),
    }, indices);
  } catch {
    drawPrimaryChart();
  }
}

function computeMetricStats(days, key) {
  const values = extractValues(days, key).filter(v => v != null && !Number.isNaN(v));
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const half = Math.max(1, Math.floor(values.length / 2));
  const firstMean = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondMean = values.slice(values.length - half).reduce((a, b) => a + b, 0) / half;
  const diff = secondMean - firstMean;
  const threshold = Math.max(0.05, Math.abs(mean) * 0.02);
  const trend = diff > threshold ? "up" : diff < -threshold ? "down" : "flat";
  return { mean, min, max, trend, n: values.length };
}

function trendArrow(trend) {
  if (trend === "up") return { glyph: "&#9650;", color: "var(--status-good)" };
  if (trend === "down") return { glyph: "&#9660;", color: "var(--status-critical)" };
  return { glyph: "&#9644;", color: "var(--ink-muted)" };
}

function formatStat(v) {
  if (v == null || Number.isNaN(v)) return "--";
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
}

function notesPreview(notes) {
  if (!notes) return "";
  const flat = String(notes).replace(/\s+/g, " ").trim();
  if (flat.length <= 72) return flat;
  return flat.slice(0, 72) + "…";
}

function trendCorrelationsSummary(correlations) {
  if (!correlations.length) return "not enough overlapping data yet";
  const top = correlations.reduce((a, b) => Math.abs(b.correlation) > Math.abs(a.correlation) ? b : a);
  const sign = top.correlation > 0 ? "+" : "";
  return `strongest: ${top.a} × ${top.b} ${sign}${top.correlation}`;
}

function trendHoursSummary() {
  const hoursData = getFilteredHoursHistory();
  if (!hoursData.length) return "no hour breakdown in range";
  const totalDays = hoursData.length;
  const totalH = hoursData.reduce((s, h) => {
    const counts = h.counts || {};
    return s + Object.values(counts).reduce((a, v) => a + (Number(v) || 0), 0);
  }, 0);
  return `${totalDays} day${totalDays === 1 ? "" : "s"} · ${totalH.toFixed(0)}h categorized`;
}

function trendSpreadsheetSummary() {
  const days = getFilteredDays();
  if (!days.length) return "no rows in range";
  return `${days.length} day${days.length === 1 ? "" : "s"} · click row to expand notes`;
}

function flmTodayDate() {
  return localYmd();
}

function flmEnsureDate() {
  if (!FLM_DATE) FLM_DATE = flmTodayDate();
}

function flmSourceMeta(source) {
  const key = String(source || "system").toLowerCase();
  return FLM_SOURCES[key] || FLM_SOURCES.system;
}

function flmFormatTime(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return String(createdAt);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function flmKindPhrase(source, kind, count) {
  const src = String(source || "system").toLowerCase();
  const k = String(kind || "").toLowerCase();
  const n = count;
  const one = (s, p) => (n === 1 ? s : p);
  if (src === "planner") {
    if (/hour|paint|block/.test(k)) return `${n} ${one("hour painted", "hours painted")}`;
    if (/task/.test(k)) return `${n} ${one("task", "tasks")}`;
    return `${n} planner ${one("moment", "moments")}`;
  }
  if (src === "arcade") {
    if (/match|game|play/.test(k)) return `${n} ${one("match", "matches")}`;
    return `${n} arcade ${one("play", "plays")}`;
  }
  if (src === "blueprint") {
    if (/run|exec|workflow/.test(k)) return `${n} blueprint ${one("run", "runs")}`;
    return `${n} blueprint ${one("change", "changes")}`;
  }
  if (src === "parallel") {
    if (/turn|act|scene|move/.test(k)) return `${n} ${one("turn", "turns")}`;
    return `${n} parallel ${one("moment", "moments")}`;
  }
  if (src === "docs") {
    if (/edit|save|draft|essay/.test(k)) return `${n} ${one("edit", "edits")}`;
    return `${n} doc ${one("update", "updates")}`;
  }
  if (src === "system") return `${n} system ${one("change", "changes")}`;
  return `${n} ${src} ${one("event", "events")}`;
}

function flmFallbackTitle(receipts) {
  const srcCounts = {};
  for (const r of receipts) {
    const s = String(r.source || "system").toLowerCase();
    srcCounts[s] = (srcCounts[s] || 0) + 1;
  }
  const top = Object.entries(srcCounts).sort((a, b) => b[1] - a[1])[0];
  const topSource = top ? (flmSourceMeta(top[0]).label) : "mixed";
  const n = receipts.length;
  return `A day of ${n} move${n === 1 ? "" : "s"} — mostly ${topSource}`;
}

function flmEngravedTitleHtml() {
  if (!FLM_ENGRAVED_TITLE) return "";
  return `<h3 class="flm-engraved-title" id="flm-engraved-title">${escapeHtml(FLM_ENGRAVED_TITLE)}</h3>`;
}

async function flmEngraveTitle() {
  flmEnsureDate();
  if (FLM_ENGRAVE_LOADING) return;
  if (!FLM_RECEIPTS.length || FLM_RECEIPTS.length < 2) {
    FLM_ENGRAVED_TITLE = FLM_RECEIPTS.length ? flmFallbackTitle(FLM_RECEIPTS) : "";
    refreshDayReplayFilmstrip();
    return;
  }
  FLM_ENGRAVE_LOADING = true;
  refreshDayReplayFilmstrip();
  try {
    const res = await fetch("/api/trends/engrave-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: FLM_DATE }),
    });
    const data = await res.json().catch(() => ({}));
    FLM_ENGRAVE_CACHED = !!data.cached;
    FLM_ENGRAVED_TITLE = data.title || flmFallbackTitle(FLM_RECEIPTS);
  } catch {
    FLM_ENGRAVED_TITLE = flmFallbackTitle(FLM_RECEIPTS);
    FLM_ENGRAVE_CACHED = false;
  } finally {
    FLM_ENGRAVE_LOADING = false;
    refreshDayReplayFilmstrip();
  }
}

function flmDayTagline(receipts) {
  const srcCounts = {};
  for (const r of receipts) {
    const s = String(r.source || "system").toLowerCase();
    srcCounts[s] = (srcCounts[s] || 0) + 1;
  }
  const top = Object.entries(srcCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const tags = {
    planner: "a building day",
    arcade: "a competitive day",
    blueprint: "a wiring day",
    parallel: "a story day",
    docs: "a writing day",
    system: "a tuning day",
  };
  return tags[top] || "a mixed day";
}

function flmWhatChangedSummary(receipts) {
  if (!receipts.length) return "Nothing logged yet — a quiet day.";
  const groups = new Map();
  for (const r of receipts) {
    const src = String(r.source || "system").toLowerCase();
    const kind = String(r.kind || "default").toLowerCase();
    const key = `${src}\0${kind}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const parts = [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [src, kind] = key.split("\0");
      return flmKindPhrase(src, kind, count);
    });
  return `${parts.join(" · ")} — ${flmDayTagline(receipts)}.`;
}

function flmReplaySummarySub() {
  if (FLM_LOADING) return "loading…";
  if (FLM_LOADED_DATE && FLM_LOADED_DATE === FLM_DATE) {
    if (FLM_NOT_FOUND || !FLM_RECEIPTS.length) return "no receipts for this day";
    return `${FLM_RECEIPTS.length} moment${FLM_RECEIPTS.length === 1 ? "" : "s"}`;
  }
  return "pick a date";
}

async function flmFetchReceipts(date) {
  FLM_LOADING = true;
  FLM_ENGRAVED_TITLE = "";
  FLM_ENGRAVE_CACHED = false;
  refreshDayReplayFilmstrip();
  try {
    const res = await fetch(`/api/receipts?date=${encodeURIComponent(date)}`);
    if (res.status === 404) {
      FLM_RECEIPTS = [];
      FLM_NOT_FOUND = true;
      FLM_LOADED_DATE = date;
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    FLM_RECEIPTS = (Array.isArray(data) ? data : []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return ta - tb;
    });
    FLM_NOT_FOUND = false;
    FLM_LOADED_DATE = date;
  } catch {
    FLM_RECEIPTS = [];
    FLM_NOT_FOUND = false;
    FLM_LOADED_DATE = date;
  } finally {
    FLM_LOADING = false;
    refreshDayReplayFilmstrip();
  }
}

function flmNavigate(source) {
  const key = String(source || "system").toLowerCase();
  if (key === "planner") {
    if (typeof goToTab === "function") goToTab("Today");
    return;
  }
  if (key === "arcade") {
    if (typeof goToTab === "function") goToTab("Practice");
    return;
  }
  if (key === "blueprint") {
    AUTOMATION_STUDIO_OPEN = true;
    if (typeof renderAutomationStudioView === "function") renderAutomationStudioView();
    return;
  }
  if (key === "parallel") {
    if (typeof goToTab === "function") goToTab("Parallel");
    return;
  }
  if (key === "docs") {
    if (typeof goToTab === "function") goToTab("Essays");
    return;
  }
  if (typeof goToTab === "function") goToTab("Settings");
}

function renderFilmstripHtml(receipts) {
  if (FLM_LOADING) {
    return `<p class="flm-empty">Loading receipts…</p>`;
  }
  if (FLM_NOT_FOUND || !receipts.length) {
    return `<p class="flm-empty">No receipts for this day yet — activity will appear here as you use the apps.</p>`;
  }
  const tiles = receipts.map(r => {
    const meta = flmSourceMeta(r.source);
    const srcKey = String(r.source || "system").toLowerCase();
    return `<button type="button" class="flm-tile flm-tile--${escapeHtml(srcKey)}" data-flm-source="${escapeHtml(srcKey)}"
      style="border-left: 3px solid ${meta.color};">
      <div class="flm-tile-head">
        <span class="flm-tile-glyph" aria-hidden="true">${meta.glyph}</span>
        <span class="flm-tile-source" style="color:${meta.color};">${escapeHtml(meta.label)}</span>
      </div>
      <p class="flm-tile-summary">${escapeHtml(r.summary || r.kind || "Activity")}</p>
      <span class="flm-tile-time">${escapeHtml(flmFormatTime(r.created_at))}</span>
    </button>`;
  }).join("");
  const summaryText = flmWhatChangedSummary(receipts);
  return `<div class="flm-strip" role="list">${tiles}<div class="flm-tile flm-tile--summary" role="listitem">
    <div class="flm-tile-head"><span class="flm-tile-source">What changed today?</span></div>
    <p class="flm-tile-summary">${escapeHtml(summaryText)}</p>
  </div></div>`;
}

function renderDayReplaySection() {
  flmEnsureDate();
  return `
    <details class="trd-details" id="flm-details">
      <summary>Day replay <span class="trd-details-summary-sub" id="flm-summary-sub">${escapeHtml(flmReplaySummarySub())}</span></summary>
      <div class="trd-details-body">
        <div class="flm-controls">
          <label class="flm-date-label">
            Date
            <input type="date" id="flm-date" value="${escapeHtml(FLM_DATE)}">
          </label>
          <button type="button" class="secondary flm-engrave-btn" id="flm-engrave-btn"
            ${FLM_ENGRAVE_LOADING ? "disabled" : ""} title="Engrave an evocative title for this day">
            ${FLM_ENGRAVE_LOADING ? "engraving…" : "engrave title"}
          </button>
        </div>
        ${flmEngravedTitleHtml()}
        <div id="flm-filmstrip-wrap">${renderFilmstripHtml(FLM_RECEIPTS)}</div>
      </div>
    </details>`;
}

function refreshDayReplayFilmstrip() {
  const sub = document.getElementById("flm-summary-sub");
  if (sub) sub.textContent = flmReplaySummarySub();
  const engraveBtn = document.getElementById("flm-engrave-btn");
  if (engraveBtn) {
    engraveBtn.disabled = FLM_ENGRAVE_LOADING;
    engraveBtn.textContent = FLM_ENGRAVE_LOADING ? "engraving…" : "engrave title";
  }
  let titleEl = document.getElementById("flm-engraved-title");
  if (FLM_ENGRAVED_TITLE) {
    if (!titleEl) {
      const wrap = document.getElementById("flm-filmstrip-wrap");
      if (wrap) {
        titleEl = document.createElement("h3");
        titleEl.id = "flm-engraved-title";
        titleEl.className = "flm-engraved-title";
        wrap.parentNode.insertBefore(titleEl, wrap);
      }
    }
    if (titleEl) titleEl.textContent = FLM_ENGRAVED_TITLE;
  } else if (titleEl) {
    titleEl.remove();
  }
  const wrap = document.getElementById("flm-filmstrip-wrap");
  if (wrap) {
    wrap.innerHTML = renderFilmstripHtml(FLM_RECEIPTS);
    wireDayReplayTiles();
  }
}

function wireDayReplayTiles() {
  document.querySelectorAll(".flm-tile[data-flm-source]").forEach(tile => {
    tile.onclick = () => flmNavigate(tile.dataset.flmSource);
  });
}

function wireDayReplay() {
  const details = document.getElementById("flm-details");
  const dateEl = document.getElementById("flm-date");
  const engraveBtn = document.getElementById("flm-engrave-btn");
  if (engraveBtn) engraveBtn.onclick = () => flmEngraveTitle();
  if (dateEl) {
    dateEl.onchange = async () => {
      FLM_DATE = dateEl.value || flmTodayDate();
      await flmFetchReceipts(FLM_DATE);
    };
  }
  if (details) {
    details.ontoggle = async () => {
      if (!details.open) return;
      flmEnsureDate();
      if (FLM_LOADED_DATE !== FLM_DATE) await flmFetchReceipts(FLM_DATE);
    };
  }
  wireDayReplayTiles();
}

function renderAnalysisControls() {
  const smoothOpts = [
    { v: 1, label: "None" },
    { v: 7, label: "7-day MA" },
    { v: 30, label: "30-day MA" },
  ].map(o => `<option value="${o.v}" ${TREND_SMOOTH_WINDOW === o.v ? "selected" : ""}>${o.label}</option>`).join("");
  const yTransformOpts = TREND_Y_TRANSFORM_OPTIONS.map(o =>
    `<option value="${o.id}" ${TREND_Y_TRANSFORM === o.id ? "selected" : ""}>${o.label}</option>`
  ).join("");
  return `
    <div class="trd-analysis-wrap">
      <button type="button" class="secondary trd-analysis-btn" id="trd-analysis-toggle" aria-expanded="${TREND_ANALYSIS_OPEN ? "true" : "false"}">&#9881; analysis</button>
      <div class="trd-analysis-popover${TREND_ANALYSIS_OPEN ? " open" : ""}" id="trd-analysis-popover">
        <label>
          <span class="stub">Smoothing</span><br>
          <select id="trend-smooth" style="font-size:12px; margin-top:4px; width:100%;">${smoothOpts}</select>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="trend-normalize" ${TREND_NORMALIZE ? "checked" : ""}>
          <span>Normalize 0–1 <span class="stub">(per series)</span></span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="trend-cut-gaps" ${TREND_CUT_GAPS ? "checked" : ""}>
          <span>Cut gaps <span class="stub">(draw lines through missing points — keep dates)</span></span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" class="trend-fill-gaps" id="trend-fill-gaps" ${TREND_FILL_GAPS ? "checked" : ""}>
          <span>Fill gaps <span class="stub">(interpolate the in-between with weekday seasonality)</span></span>
        </label>
        <label>
          <span class="stub">Y-axis transform</span><br>
          <select id="trend-y-transform" style="font-size:12px; margin-top:4px; width:100%;">${yTransformOpts}</select>
        </label>
        <div>
          <span class="stub" style="font-size:11px;">Series transforms (per metric)</span>
          <div style="margin-top:6px;" id="trend-transform-wrap">${renderTransformControls()}</div>
        </div>
      </div>
    </div>`;
}

function renderChartControls() {
  return `
    <div class="trd-controls">
      <div class="trd-controls-row">
        <strong style="font-size:12px; margin-right:4px;">Metrics</strong>
        ${renderMetricChips()}
      </div>
      <div class="trd-controls-row">
        <strong style="font-size:12px; margin-right:4px;">Range</strong>
        ${renderRangeControls()}
        <span class="stub" style="margin:0 4px;">|</span>
        <label style="font-size:12px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="trend-pulse-overlay" ${TREND_PULSE_OVERLAY ? "checked" : ""}>
          <span>Mood pulses</span>
        </label>
        ${renderAnalysisControls()}
      </div>
    </div>`;
}

function renderMetricChips() {
  return TREND_METRICS.map(m => {
    const on = TREND_VISIBLE.has(m.key);
    return `<button type="button" class="trend-metric-chip pill ${on ? "trend-chip-on" : ""}" data-key="${m.key}"
      style="cursor:pointer; margin:0 6px 6px 0; border-color:${on ? m.color : "var(--border)"}; color:${on ? m.color : "var(--ink-secondary)"}; background:${on ? `color-mix(in srgb, ${m.color} 14%, var(--bg-card))` : "var(--bg-shell)"};">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:4px;"></span>${escapeHtml(m.label)}
    </button>`;
  }).join("");
}

function renderRangeControls() {
  const presets = TREND_RANGE_PRESETS.map(p => `
    <button type="button" class="seg-pill-btn trend-range-preset${TREND_RANGE_PRESET === p.id ? " active" : ""}" data-preset="${p.id}">${p.label}</button>
  `).join("");
  const customStyle = TREND_RANGE_PRESET === "custom" ? "" : "opacity:0.65;";
  return `
    <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
      <div class="seg-pill" role="group" aria-label="Trend range">${presets}</div>
      <span class="stub" style="margin:0 4px;">|</span>
      <label class="stub" style="font-size:12px; display:inline-flex; align-items:center; gap:4px; ${customStyle}">
        From <input type="date" id="trend-date-from" value="${escapeHtml(TREND_CUSTOM_FROM)}" style="font-size:12px;">
      </label>
      <label class="stub" style="font-size:12px; display:inline-flex; align-items:center; gap:4px; ${customStyle}">
        To <input type="date" id="trend-date-to" value="${escapeHtml(TREND_CUSTOM_TO)}" style="font-size:12px;">
      </label>
    </div>`;
}

function renderTransformControls() {
  const selected = TREND_METRICS.filter(m => TREND_VISIBLE.has(m.key));
  if (!selected.length) return `<p class="stub" style="margin:0;">Select metrics above to configure transforms.</p>`;
  return selected.map(m => {
    const cur = TREND_TRANSFORMS[m.key] || "raw";
    const opts = TREND_TRANSFORM_OPTIONS.map(o =>
      `<option value="${o.id}" ${cur === o.id ? "selected" : ""}>${o.label}</option>`
    ).join("");
    return `<label style="font-size:12px; display:inline-flex; align-items:center; gap:6px; margin:0 12px 6px 0; color:${m.color};">
      <span style="white-space:nowrap;">${escapeHtml(m.label)}</span>
      <select class="trend-transform-select" data-key="${m.key}" style="font-size:12px;">${opts}</select>
    </label>`;
  }).join("");
}

function renderStatsStripHtml() {
  const days = getFilteredDays();
  const selected = TREND_METRICS.filter(m => TREND_VISIBLE.has(m.key));
  if (!days.length || !selected.length) {
    return `<p class="stub" style="margin:0;">No data in this range — try a wider window or log more days.</p>`;
  }
  return `<div style="display:flex; flex-wrap:wrap; gap:10px;">${selected.map(m => {
    const stats = computeMetricStats(days, m.key);
    if (!stats) {
      return `<div class="card" style="flex:1; min-width:150px; padding:10px 12px;">
        <div class="stub" style="font-size:11px; color:${m.color};">${escapeHtml(m.label)}</div>
        <div style="font-size:13px; margin-top:4px;">No values</div>
      </div>`;
    }
    const arrow = trendArrow(stats.trend);
    return `<div class="card" style="flex:1; min-width:150px; padding:10px 12px;">
      <div class="stub" style="font-size:11px; color:${m.color};">${escapeHtml(m.label)} <span class="stub">(n=${stats.n})</span></div>
      <div style="display:flex; gap:12px; margin-top:6px; font-size:12px; flex-wrap:wrap;">
        <span title="Mean">μ <strong style="color:${m.color};">${formatStat(stats.mean)}</strong></span>
        <span title="Min">min ${formatStat(stats.min)}</span>
        <span title="Max">max ${formatStat(stats.max)}</span>
        <span style="color:${arrow.color};" title="First half vs second half">${arrow.glyph}</span>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function renderCorrelationsHtml(correlations) {
  if (!correlations.length) {
    return `<p class="stub" style="margin:0;">Not enough overlapping data yet.</p>`;
  }
  const rows = correlations.map(c => {
    const absR = Math.abs(c.correlation);
    const barColor = c.correlation >= 0 ? "var(--status-good)" : "var(--status-critical)";
    const strength = absR > 0.5 ? "status-serious" : absR > 0.3 ? "status-warning" : "";
    return `<div style="display:grid; grid-template-columns:minmax(140px,1fr) 1fr auto; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid var(--gridline); font-size:13px;">
      <span>${escapeHtml(c.a)} <span class="stub">vs</span> ${escapeHtml(c.b)}</span>
      <div style="height:8px; background:var(--bg-shell); border-radius:4px; overflow:hidden; border:1px solid var(--gridline);">
        <div style="height:100%; width:${(absR * 100).toFixed(1)}%; background:${barColor}; border-radius:3px;"></div>
      </div>
      <span class="pill ${strength}" style="min-width:72px; text-align:center;">${c.correlation > 0 ? "+" : ""}${c.correlation}</span>
    </div>`;
  }).join("");
  return `
    <p class="stub" style="margin:0 0 8px; font-size:12px;">Correlation shows association, not causation — stronger bars mean a tighter linear/monotonic link in your history.</p>
    <div style="max-height:280px; overflow-y:auto;">${rows}</div>`;
}

function renderSpreadsheetHtml() {
  const days = getFilteredDays().slice().reverse();
  const headers = ["date", ...TREND_METRICS.map(m => m.key), "notes"];
  if (!days.length) {
    return `<table style="width:100%; border-collapse:collapse;">
      <thead><tr>${headers.map(h => `<th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--gridline);">${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody><tr><td colspan="${headers.length}" class="stub" style="padding:12px;">No rows in this range.</td></tr></tbody>
    </table>`;
  }
  const rows = days.map(d => {
    const expanded = TREND_EXPANDED_DATE === d.date;
    const preview = notesPreview(d.notes);
    const notesCell = expanded
      ? `<td colspan="1" style="padding:6px 8px; white-space:pre-wrap; font-size:12px; color:var(--ink-secondary);">${escapeHtml(d.notes || "")}</td>`
      : `<td class="stub" style="padding:6px 8px; font-size:12px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(preview)}</td>`;
    return `<tr class="trend-sheet-row" data-date="${escapeHtml(d.date)}" style="cursor:pointer; ${expanded ? "background:color-mix(in srgb, var(--accent) 8%, var(--bg-card));" : ""}">
      <td style="padding:6px 8px; font-variant-numeric:tabular-nums; border-bottom:1px solid var(--gridline);">${escapeHtml(d.date)}</td>
      ${TREND_METRICS.map(m => `<td style="padding:6px 8px; font-variant-numeric:tabular-nums; border-bottom:1px solid var(--gridline);">${d[m.key] == null ? "" : escapeHtml(d[m.key])}</td>`).join("")}
      ${notesCell}
    </tr>
    ${expanded && d.notes ? "" : ""}`;
  }).join("");
  return `<table style="width:100%; border-collapse:collapse;">
    <thead style="position:sticky; top:0; z-index:2; background:var(--bg-card);">
      <tr>${headers.map(h => `<th style="padding:8px; text-align:left; border-bottom:2px solid var(--gridline); font-size:12px; background:var(--bg-card);">${escapeHtml(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function renderTrends() {
  trdEnsureStyles();
  const rangeDays = getSelectedRangeDays();
  const [days, correlations, hoursHistory, pulseSummaryResp, eventsResp] = await Promise.all([
    api("/api/days?limit=800"),
    api(`/api/trends/correlations?method=${TREND_CORR_METHOD}`),
    api("/api/trends/hours-history?limit=800"),
    api(`/api/pulses/summary?days=${Math.min(rangeDays, 366)}`),
    api("/api/events").catch(() => []),
  ]);
  LAST_TRENDS = days.slice().reverse();
  LAST_CORRELATIONS = correlations;
  LAST_HOURS_HISTORY = hoursHistory;
  LAST_PULSE_SUMMARY = pulseSummaryResp.days || [];
  LAST_PULSE_COVERAGE = pulseSummaryResp.pulse_coverage ?? 0;
  LAST_TREND_EVENTS = Array.isArray(eventsResp) ? eventsResp : (eventsResp.events || []);

  if (!TREND_CUSTOM_FROM && LAST_TRENDS.length) TREND_CUSTOM_FROM = LAST_TRENDS[0].date;
  if (!TREND_CUSTOM_TO && LAST_TRENDS.length) TREND_CUSTOM_TO = LAST_TRENDS[LAST_TRENDS.length - 1].date;

  const corrSummary = trendCorrelationsSummary(LAST_CORRELATIONS);
  const hoursSummary = trendHoursSummary();
  const sheetSummary = trendSpreadsheetSummary();

  const content = `
    <p class="stub" style="margin:0 0 10px; font-size:13px;">See what's actually happening in your life — read the chart first.</p>

    <div class="card" style="margin-bottom:12px;">
      ${renderChartControls()}
      <div id="trend-pulse-coverage" class="stub" style="font-size:12px; margin-bottom:6px;"></div>
      <div id="trend-primary-chart" style="height:380px;"></div>
    </div>

    <div id="trend-stats-strip" style="margin-bottom:12px;">${renderStatsStripHtml()}</div>

    <div class="card" style="margin-bottom:12px;" id="trend-outlook-card">
      <strong style="font-size:13px;">Next-month outlook</strong>
      <div id="trend-outlook-body">${renderOutlookHtml()}</div>
    </div>

    <div class="card" style="margin-bottom:12px;" id="trend-forecast-card">
      <strong style="font-size:13px;">Local forecast</strong>
      <div id="trend-forecast-body">${renderLocalForecastHtml()}</div>
    </div>

    <details class="trd-details" open>
      <summary>Weekday seasonality <span class="trd-details-summary-sub">observed days only</span></summary>
      <div class="trd-details-body" id="trend-season-body">${renderWeekdaySeasonalityHtml()}</div>
    </details>

    <details class="trd-details">
      <summary>Where the hours went <span class="trd-details-summary-sub">${escapeHtml(hoursSummary)}</span></summary>
      <div class="trd-details-body">
        <div id="trend-hours-chart" style="height:300px;"></div>
      </div>
    </details>

    <details class="trd-details">
      <summary>Correlations <span class="trd-details-summary-sub">${escapeHtml(corrSummary)}</span></summary>
      <div class="trd-details-body">
        <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
          <select id="trend-corr-method" style="font-size:12px;">
            <option value="pearson" ${TREND_CORR_METHOD === "pearson" ? "selected" : ""}>Pearson (linear)</option>
            <option value="spearman" ${TREND_CORR_METHOD === "spearman" ? "selected" : ""}>Spearman (rank)</option>
          </select>
        </div>
        <div id="trend-corr-panel">${renderCorrelationsHtml(LAST_CORRELATIONS)}</div>
      </div>
    </details>

    <details class="trd-details">
      <summary>Day-by-day grid <span class="trd-details-summary-sub">${escapeHtml(sheetSummary)}</span></summary>
      <div class="trd-details-body">
        <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
          <button class="secondary" id="trend-export-csv">Export CSV</button>
        </div>
        <div id="trend-spreadsheet-wrap" style="overflow:auto; max-height:420px;">${renderSpreadsheetHtml()}</div>
      </div>
    </details>

    ${renderDayReplaySection()}

    ${LAST_TRENDS.length === 0 ? '<p class="stub" style="margin-top:12px;">No day data yet — fill in a few days on the Today tab.</p>' : ""}`;

  PLN_SHELL_FOCUS = "strip";
  const shell = await renderPlannerFusedShell();
  return replacePlannerModeChipsWithSubnav(shell)
    .replace('<div id="pln-tab-extras"></div>', `<div id="pln-tab-extras">${content}</div>`);
}

function refreshTrendsPanels() {
  const stats = document.getElementById("trend-stats-strip");
  if (stats) stats.innerHTML = renderStatsStripHtml();

  const transforms = document.getElementById("trend-transform-wrap");
  if (transforms) transforms.innerHTML = renderTransformControls();
  wireTransformSelects();

  const corrPanel = document.getElementById("trend-corr-panel");
  if (corrPanel) corrPanel.innerHTML = renderCorrelationsHtml(LAST_CORRELATIONS);

  const sheet = document.getElementById("trend-spreadsheet-wrap");
  if (sheet) sheet.innerHTML = renderSpreadsheetHtml();
  wireSpreadsheetRows();

  const outlook = document.getElementById("trend-outlook-body");
  if (outlook) outlook.innerHTML = renderOutlookHtml();

  const forecast = document.getElementById("trend-forecast-body");
  if (forecast) forecast.innerHTML = renderLocalForecastHtml();
  wireFillGapsControls();

  updatePulseCoverageStat();
  drawPrimaryChart();
  drawHoursChart();
}

function updatePulseCoverageStat() {
  const el = document.getElementById("trend-pulse-coverage");
  if (!el) return;
  if (!TREND_PULSE_OVERLAY) {
    el.textContent = "";
    return;
  }
  const coverage = computePulseCoverageInRange();
  const total = getFilteredDays().length;
  el.textContent = `Pulse coverage: ${coverage} day${coverage === 1 ? "" : "s"} with ≥2 pulses in range (${total} day${total === 1 ? "" : "s"} shown)`;
}

function wireMetricChips() {
  document.querySelectorAll(".trend-metric-chip").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      if (TREND_VISIBLE.has(key)) TREND_VISIBLE.delete(key);
      else TREND_VISIBLE.add(key);
      document.querySelectorAll(".trend-metric-chip").forEach(b => {
        const m = trendMetric(b.dataset.key);
        const on = TREND_VISIBLE.has(b.dataset.key);
        b.classList.toggle("trend-chip-on", on);
        b.style.borderColor = on ? m.color : "var(--border)";
        b.style.color = on ? m.color : "var(--ink-secondary)";
        b.style.background = on ? `color-mix(in srgb, ${m.color} 14%, var(--bg-card))` : "var(--bg-shell)";
      });
      refreshTrendsPanels();
    };
  });
}

function wireRangeControls() {
  document.querySelectorAll(".trend-range-preset").forEach(btn => {
    btn.onclick = async () => {
      TREND_RANGE_PRESET = btn.dataset.preset;
      document.querySelectorAll(".trend-range-preset").forEach(b => {
        b.classList.toggle("active", b.dataset.preset === TREND_RANGE_PRESET);
      });
      await refreshPulseSummaryData();
      refreshTrendsPanels();
    };
  });
  const fromEl = document.getElementById("trend-date-from");
  const toEl = document.getElementById("trend-date-to");
  const onCustomDate = async () => {
    TREND_RANGE_PRESET = "custom";
    TREND_CUSTOM_FROM = fromEl.value;
    TREND_CUSTOM_TO = toEl.value;
    document.querySelectorAll(".trend-range-preset").forEach(b => {
      b.classList.toggle("active", b.dataset.preset === "custom");
    });
    await refreshPulseSummaryData();
    refreshTrendsPanels();
  };
  if (fromEl) fromEl.onchange = onCustomDate;
  if (toEl) toEl.onchange = onCustomDate;
}

function wireTransformSelects() {
  document.querySelectorAll(".trend-transform-select").forEach(sel => {
    sel.onchange = () => {
      TREND_TRANSFORMS[sel.dataset.key] = sel.value;
      refreshTrendsPanels();
    };
  });
}

function wireSpreadsheetRows() {
  document.querySelectorAll(".trend-sheet-row").forEach(row => {
    row.onclick = () => {
      const date = row.dataset.date;
      TREND_EXPANDED_DATE = TREND_EXPANDED_DATE === date ? null : date;
      const sheet = document.getElementById("trend-spreadsheet-wrap");
      if (sheet) sheet.innerHTML = renderSpreadsheetHtml();
      wireSpreadsheetRows();
    };
  });
}

function wireTrends() {
  trdEnsureStyles();
  wirePlannerShell();
  if (typeof wirePlannerStripStayOnTab === "function") wirePlannerStripStayOnTab();
  wireMetricChips();
  wireRangeControls();
  wireTransformSelects();

  const analysisToggle = document.getElementById("trd-analysis-toggle");
  const analysisPopover = document.getElementById("trd-analysis-popover");
  if (analysisToggle && analysisPopover) {
    analysisToggle.onclick = (e) => {
      e.stopPropagation();
      TREND_ANALYSIS_OPEN = !TREND_ANALYSIS_OPEN;
      analysisPopover.classList.toggle("open", TREND_ANALYSIS_OPEN);
      analysisToggle.setAttribute("aria-expanded", TREND_ANALYSIS_OPEN ? "true" : "false");
    };
    if (!TRD_ANALYSIS_CLICK_WIRED) {
      TRD_ANALYSIS_CLICK_WIRED = true;
      document.addEventListener("click", (e) => {
        if (!TREND_ANALYSIS_OPEN) return;
        const pop = document.getElementById("trd-analysis-popover");
        const btn = document.getElementById("trd-analysis-toggle");
        if (pop && btn && !pop.contains(e.target) && e.target !== btn) {
          TREND_ANALYSIS_OPEN = false;
          pop.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
        }
      });
    }
  }

  const smoothEl = document.getElementById("trend-smooth");
  if (smoothEl) {
    smoothEl.onchange = (e) => {
      TREND_SMOOTH_WINDOW = parseInt(e.target.value, 10) || 1;
      refreshTrendsPanels();
    };
  }

  const normEl = document.getElementById("trend-normalize");
  if (normEl) {
    normEl.onchange = (e) => {
      TREND_NORMALIZE = e.target.checked;
      refreshTrendsPanels();
    };
  }

  const cutGapsEl = document.getElementById("trend-cut-gaps");
  if (cutGapsEl) {
    cutGapsEl.onchange = (e) => {
      TREND_CUT_GAPS = e.target.checked;
      refreshTrendsPanels();
    };
  }

  wireFillGapsControls();

  const yTransformEl = document.getElementById("trend-y-transform");
  if (yTransformEl) {
    yTransformEl.onchange = (e) => {
      TREND_Y_TRANSFORM = e.target.value || "none";
      refreshTrendsPanels();
    };
  }

  const pulseOverlayEl = document.getElementById("trend-pulse-overlay");
  if (pulseOverlayEl) {
    pulseOverlayEl.onchange = (e) => {
      TREND_PULSE_OVERLAY = e.target.checked;
      refreshTrendsPanels();
    };
  }

  const corrMethodEl = document.getElementById("trend-corr-method");
  if (corrMethodEl) {
    corrMethodEl.onchange = (e) => {
      TREND_CORR_METHOD = e.target.value;
      render();
    };
  }

  const exportBtn = document.getElementById("trend-export-csv");
  if (exportBtn) exportBtn.onclick = exportTrendsCsv;

  wireSpreadsheetRows();
  wireDayReplay();
  updatePulseCoverageStat();
  drawPrimaryChart();
  drawHoursChart();
}

function wireFillGapsControls() {
  document.querySelectorAll(".trend-fill-gaps").forEach(el => {
    el.checked = !!TREND_FILL_GAPS;
    el.onchange = (e) => {
      TREND_FILL_GAPS = !!e.target.checked;
      document.querySelectorAll(".trend-fill-gaps").forEach(other => {
        if (other !== e.target) other.checked = TREND_FILL_GAPS;
      });
      refreshTrendsPanels();
    };
  });
}

function exportTrendsCsv() {
  const headers = ["date", ...TREND_METRICS.map(m => m.key), "notes"];
  const escapeCsv = (value) => {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = getFilteredDays().slice().reverse().map(d => headers.map(h => escapeCsv(d[h])).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `waypoint-trends-${localYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function plotlyLayoutBase(theme, extra = {}) {
  return {
    paper_bgcolor: theme.card,
    plot_bgcolor: theme.card,
    font: { color: theme.ink, size: 12, family: "system-ui, sans-serif" },
    xaxis: { gridcolor: theme.gridline, linecolor: theme.gridline, tickfont: { color: theme.inkMuted } },
    yaxis: { gridcolor: theme.gridline, linecolor: theme.gridline, tickfont: { color: theme.inkMuted } },
    legend: { orientation: "h", y: 1.12, font: { color: theme.ink } },
    margin: { l: 48, r: 20, t: 30, b: 40 },
    hovermode: "x unified",
    ...extra,
  };
}

function drawPrimaryChart() {
  const el = document.getElementById("trend-primary-chart");
  if (!el || !window.Plotly) return;

  const days = getFilteredDays();
  const metrics = TREND_METRICS.filter(m => TREND_VISIBLE.has(m.key));

  if (!days.length || !metrics.length) {
    el.innerHTML = `<p class="stub" style="padding:40px 0; text-align:center;">${!days.length ? "No data in this range." : "Select at least one metric above."}</p>`;
    TREND_PRIMARY_CHART_WIRED = false;
    return;
  }

  const theme = plotlyThemeVars();
  const traces = trendPrimaryTraceSpecs(days, metrics);

  const hasAnyPoint = traces.some(t => t.y.some(v => v != null));
  if (!hasAnyPoint) {
    el.innerHTML = `<p class="stub" style="padding:40px 0; text-align:center;">Selected metrics have no values in this range.</p>`;
    TREND_PRIMARY_CHART_WIRED = false;
    return;
  }

  el.innerHTML = "";
  TREND_CHART_ZOOM_RANGE = null;
  TREND_PRIMARY_CHART_WIRED = false;
  const annotations = trendProductAnnotations(days, metrics).map(note => ({
    x: note.date,
    y: 1,
    yref: "paper",
    text: note.text,
    showarrow: false,
    textangle: -40,
    font: { size: 10, color: theme.inkMuted },
    xanchor: "left",
  }));
  Plotly.newPlot(el, traces, plotlyLayoutBase(theme, {
    yaxis: { gridcolor: theme.gridline, linecolor: theme.gridline, tickfont: { color: theme.inkMuted }, title: trendYAxisTitle() },
    annotations,
  }), { displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] });
  wirePrimaryChartZoom(el);
  const season = document.getElementById("trend-season-body");
  if (season) season.innerHTML = renderWeekdaySeasonalityHtml();
}

function wirePrimaryChartZoom(el) {
  if (!el || TREND_PRIMARY_CHART_WIRED) return;
  TREND_PRIMARY_CHART_WIRED = true;
  el.on("plotly_relayout", (ev) => {
    if (ev["xaxis.autorange"]) {
      TREND_CHART_ZOOM_RANGE = null;
    } else if (ev["xaxis.range[0]"] != null && ev["xaxis.range[1]"] != null) {
      TREND_CHART_ZOOM_RANGE = [ev["xaxis.range[0]"], ev["xaxis.range[1]"]];
    } else {
      return;
    }
    trendRestylePrimaryChart(el);
  });
}

function drawHoursChart() {
  const el = document.getElementById("trend-hours-chart");
  if (!el || !window.Plotly) return;

  const hoursData = getFilteredHoursHistory();
  const categories = (typeof CONFIG !== "undefined" && CONFIG?.categories) ? CONFIG.categories : [];

  if (!hoursData.length || !categories.length) {
    el.innerHTML = `<p class="stub" style="padding:30px 0; text-align:center;">${!hoursData.length ? "No hour breakdown for this range — paint hours on the Today tab." : "Category config not loaded."}</p>`;
    return;
  }

  const x = hoursData.map(h => h.date);
  const traces = categories.map(cat => ({
    x,
    y: hoursData.map(h => h.counts?.[cat.key] ?? 0),
    name: cat.label,
    type: "bar",
    marker: { color: cat.color },
  })).filter(t => t.y.some(v => v > 0));

  if (!traces.length) {
    el.innerHTML = `<p class="stub" style="padding:30px 0; text-align:center;">No categorized hours in this range.</p>`;
    return;
  }

  const theme = plotlyThemeVars();
  el.innerHTML = "";
  Plotly.newPlot(el, traces, plotlyLayoutBase(theme, {
    barmode: "stack",
    yaxis: { ...plotlyLayoutBase(theme).yaxis, title: "Hours", rangemode: "tozero" },
    margin: { l: 48, r: 20, t: 20, b: 60 },
  }), { displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] });
}
