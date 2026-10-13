const NAV_GROUPS = [
  { label: null, tabs: ["Agent", "Hub"] },
  { label: "Plan", tabs: ["Today", "Tasks", "Goals", "Calendar", "Events", "Trends"] },
  { label: "Capture", tabs: ["Ideas", "Skills", "Problems", "Thinking", "Funny", "Essays", "Repository"] },
  { label: "Work", tabs: ["Projects", "Competitions", "Code", "Obsidian", "Classes"] },
  { label: "Play", tabs: ["Practice", "Parallel"] },
  { label: "People", tabs: ["Customers", "Contacts", "Team"] },
  { label: "System", tabs: ["About", "Settings", "Prompts"] },
];
const TAB_LABELS = { Obsidian: "Notes", Paint: "Paint" };
const TABS = NAV_GROUPS.flatMap(g => g.tabs || []);

function emptyStateHtml({ title, body, cta, ctaId, hint } = {}) {
  const heading = title || "Nothing here yet";
  const copy = body || "This page is ready when you are.";
  const button = cta
    ? `<button type="button" class="primary empty-state-cta"${ctaId ? ` id="${escapeHtml(ctaId)}"` : ""}>${escapeHtml(cta)}</button>`
    : "";
  const extra = hint ? `<p class="empty-state-hint">${escapeHtml(hint)}</p>` : "";
  return `<div class="empty-state">
    <p class="empty-state-title">${escapeHtml(heading)}</p>
    <p class="empty-state-body">${escapeHtml(copy)}</p>
    ${button}${extra}
  </div>`;
}

function setMainBusy(busy) {
  const main = document.getElementById("main");
  const progress = document.getElementById("main-progress");
  if (main) {
    if (busy) main.setAttribute("aria-busy", "true");
    else main.removeAttribute("aria-busy");
  }
  if (progress) {
    progress.hidden = !busy;
    progress.setAttribute("aria-hidden", busy ? "false" : "true");
  }
}

function tabLabel(tab) {
  if (typeof t === "function") {
    const translated = t("tab." + tab);
    if (translated && translated !== "tab." + tab) return translated;
  }
  return TAB_LABELS[tab] || tab;
}

function renderAppSubnavPills(tabs, options = {}) {
  const activeTab = options.activeTab || ACTIVE_TAB;
  const label = options.label || "Related views";
  const extraClass = options.className ? ` ${options.className}` : "";
  const pills = tabs.map(tab => {
    const active = tab === activeTab;
    return `<button type="button" class="nts-pill app-subnav-pill${active ? " nts-pill--active" : ""}" data-tab="${escapeHtml(tab)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(tabLabel(tab))}</button>`;
  }).join("");
  return `<div class="app-subnav-pills${extraClass}" role="navigation" aria-label="${escapeHtml(label)}"><div class="app-subnav-rail">${pills}</div></div>`;
}

function wireAppSubnavPills(root = document) {
  root.querySelectorAll(".app-subnav-pills [data-tab]").forEach(pill => {
    pill.onclick = () => {
      const tab = pill.dataset.tab;
      if (tab && tab !== ACTIVE_TAB) goToTab(tab);
    };
  });
}

const FAST_TRAVEL_TABS = ["Today", "Tasks", "Goals", "Calendar", "Repository", "Agent"];

function renderFastTravelSwitcher() {
  return "";
}

function wireFastTravelSwitcher(root = document) {
  root.querySelectorAll("[data-fast-tab]").forEach(button => {
    button.onclick = () => {
      if (button.dataset.fastTab !== ACTIVE_TAB) goToTab(button.dataset.fastTab);
    };
  });
}

// Capture proved the shape: one in-page capsule rail is the single selector for a group of
// sibling pages. People and System opt in here. The rail is rendered from render() rather than
// from each page function so it is also present when a page fails to load -- if it were part of
// the page body, an error card would strand you on a workspace whose tab-chip bar is hidden.
// Every multi-tab workspace keeps its rail, so the app's own icons stay reachable from any of
// its views instead of disappearing once you move off the default tab. `plan` and `play`
// render their own rail inside the page body, so they are excluded here to avoid two rails.
const SUBNAV_RAIL_WORKSPACES = new Set(["people", "system", "build", "capture", "plan"]);

// Planner pages that build the rail into their own body via replacePlannerModeChipsWithSubnav.
// The persistent rail skips these so they do not end up with two identical rails stacked; the
// remaining Planner tabs (Today, Paint) had no rail at all and are the reason `plan` is in the
// set above -- without it those two pages stranded you with no way back to the other views.
const SELF_RAILED_TABS = new Set(["Tasks", "Goals", "Calendar", "Events", "Trends"]);
// Set when a rail pill is reached by keyboard, so focus can follow to the newly active pill.
let SUBNAV_RAIL_KEY_NAV = false;

function subnavRailTabs(tab) {
  if (!tab || tab === "Home") return [];
  if (SELF_RAILED_TABS.has(tab)) return [];
  if (!SUBNAV_RAIL_WORKSPACES.has(workspaceForTab(tab))) return [];
  const app = appForTab(tab);
  const tabs = (app && app.tabs) || [];
  return tabs.length > 1 && tabs.includes(tab) ? tabs : [];
}

function renderWorkspaceSubnavRail(tab) {
  const tabs = subnavRailTabs(tab);
  if (!tabs.length) return "";
  return renderAppSubnavPills(tabs, {
    activeTab: tab,
    label: `${appForTab(tab).name} views`,
    className: "app-subnav-pills--workspace",
  });
}

// ArrowLeft/ArrowRight walk the rail, matching the Capture rail and the tab-chip bar this
// replaces, so the group stays reachable without a mouse.
function wireWorkspaceSubnavRail(root = document) {
  const rail = root.querySelector(".app-subnav-pills--workspace");
  if (!rail) return;
  const tabs = subnavRailTabs(ACTIVE_TAB);
  const activePill = rail.querySelector(".nts-pill--active");
  if (SUBNAV_RAIL_KEY_NAV) {
    SUBNAV_RAIL_KEY_NAV = false;
    activePill?.focus({ preventScroll: true });
  }
  rail.onkeydown = e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const from = tabs.indexOf(e.target.closest("[data-tab]")?.dataset.tab || ACTIVE_TAB);
    if (from < 0) return;
    const to = from + (e.key === "ArrowLeft" ? -1 : 1);
    if (to < 0 || to >= tabs.length) return;
    e.preventDefault();
    SUBNAV_RAIL_KEY_NAV = true;
    goToTab(tabs[to]);
  };
}

// Read the tab list off the app definition rather than repeating it. The hardcoded copies
// this replaces had drifted: they were missing Today and Paint, so those two icons vanished
// from the rail as soon as you moved to Trends (or any other Planner view) and there was no
// way back to them without going via Home.
function plannerRailTabs() {
  const app = WORKSPACE_APPS.find(a => a.id === "planner");
  return (app && app.tabs) || ["Today", "Tasks", "Goals", "Calendar", "Events", "Paint", "Trends"];
}

function replacePlannerModeChipsWithSubnav(html) {
  const rail = renderAppSubnavPills(plannerRailTabs(), { label: "Planner views" });
  const marker = '<div class="pln-mode-chips"';
  const start = html.indexOf(marker);
  if (start < 0) return `${rail}${html}`;
  const end = html.indexOf("</div>", start);
  if (end < 0) return html;
  return html.slice(0, start) + rail + html.slice(end + 6);
}

function appQuestProgressLabel() {
  const game = window.WaypointGame;
  if (!game || typeof game.getState !== "function") return "—";
  let quests;
  try {
    quests = game.getState()?.questsToday;
  } catch (_) {
    return "—";
  }
  if (typeof quests === "number") return String(quests);
  if (Array.isArray(quests)) {
    const done = quests.filter(q => q && (q.done || q.complete)).length;
    return `${done}/${quests.length}`;
  }
  if (quests && typeof quests === "object") {
    const total = quests.total ?? quests.count;
    const done = quests.done ?? quests.completed ?? 0;
    if (total != null) return `${done}/${total}`;
    if (quests.label) return String(quests.label);
  }
  return "—";
}

function renderPlayWorkspaceStrip({ streak = 0, trophies = 0, quests = null } = {}) {
  const questLabel = quests == null ? appQuestProgressLabel() : quests;
  return `<section class="play-workspace-strip" aria-label="Play workspace">
    ${renderAppSubnavPills(["Practice", "Parallel"], { label: "Play views", className: "play-subnav-pills" })}
    <div class="play-status-chips" aria-label="Play status">
      <span class="play-status-chip" title="Practice streak"><span aria-hidden="true">🔥</span> ${escapeHtml(streak)} streak</span>
      <span class="play-status-chip" title="Arcade trophies"><span aria-hidden="true">🏆</span> ${escapeHtml(trophies)} trophies</span>
      <span class="play-status-chip" title="Daily quests"><span aria-hidden="true">⚔</span> ${escapeHtml(questLabel)} quests</span>
    </div>
  </section>`;
}

function appLabel(app) {
  if (app && typeof t === "function" && app.id) {
    const translated = t("app." + app.id);
    if (translated && translated !== "app." + app.id) return translated;
  }
  return app ? app.name : "";
}

function intentTitle(tab) {
  if (typeof t === "function") {
    const translated = t("intent." + String(tab || "").toLowerCase());
    if (translated && translated !== "intent." + String(tab || "").toLowerCase()) return translated;
  }
  return PAGE_INTENTS[tab]?.title || "";
}

function launcherGreeting() {
  const hour = new Date().getHours();
  const key = hour < 12 ? "greeting.morning" : hour < 17 ? "greeting.afternoon" : "greeting.evening";
  return typeof t === "function" ? t(key) : (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
}
const NOTE_LIST_TABS = { Skills: "skill", Problems: "problem", Thinking: "thinking", Funny: "funny", Essays: "essay" };
const CAPTURE_QUICK_TABS = ["Ideas", "Skills", "Problems", "Thinking", "Funny", "Essays", "Repository"];
let CAPTURE_LIST_COUNTS = {};
const PAGE_INTENTS = {
  Agent: { title: "Command the system in language, not clicks", primary: "Ask", loss: "Describe outcomes, review staged actions, approve execution — minimize manual navigation.", actions: ["Ask", "Approve", "Observe"] },
  Hub: { title: "Your command deck — save links for later, pin your apps and sites, glance at today", primary: "Save", loss: "Surface everything worth capturing or resurfacing without hunting tabs.", actions: ["Save", "Pin", "Glance"] },
  Today: { title: "Make today legible hour by hour", primary: "Paint hours", loss: "Maximize honest time signal with least friction so trends and planning improve.", actions: ["Paint hours", "Save", "Reflect"] },
  Tasks: { title: "Turn pressure into one ordered next action", primary: "Prioritize", loss: "Critical work impossible to miss; reorderable, searchable flow for everything else.", actions: ["Capture", "Prioritize", "Assign"] },
  Goals: { title: "Chunk ambition into editable next moves", primary: "Chunk", loss: "Milestones reveal what remains and what is blocked — no vague ambition.", actions: ["Chunk", "Check off", "Replan"] },
  Calendar: { title: "Coordinate commitments before they surprise you", primary: "Edit", loss: "Time blocks editable, syncable, and visible before they become crises.", actions: ["Import", "Edit", "Sync"] },
  Events: { title: "Separate signal events from noise", primary: "Scan", loss: "Useful meetings linked to plan; noise ignorable without guilt.", actions: ["Scan", "Track", "Follow up"] },
  Trends: { title: "Close the loop on how you actually live", primary: "Interpret", loss: "Correlations, moving averages, and anomalies become planning adjustments.", actions: ["Compare", "Smooth", "Interpret"] },
  Ideas: { title: "Map raw possibility without premature cleanup", primary: "Capture", loss: "Capture fast; similarity and project potential emerge later.", actions: ["Capture", "Map", "Promote"] },
  Skills: { title: "Model ability as terrain, not checklists", primary: "Add", loss: "Track growth and adjacent transfer — not flat completion ticks.", actions: ["Add", "Reorder", "Inspect"] },
  Problems: { title: "Analyze constraints before solutions", primary: "Frame", loss: "Problems, candidate solutions, weaknesses, and advantages stay visible together.", actions: ["Frame", "Compare", "Resolve"] },
  Thinking: { title: "Preserve thought before classification", primary: "Dump", loss: "Zero loss on import; sort and classify only after everything is safe.", actions: ["Dump", "Sort", "Keep"] },
  Funny: { title: "Keep humor and social sparks alive", primary: "Add", loss: "Jokes and odd thoughts preserved without forcing them formal.", actions: ["Add", "Reorder", "Use"] },
  Essays: { title: "Store long-form work safely and findably", primary: "Draft", loss: "Essays editable, discoverable, exportable — no silent data loss.", actions: ["Draft", "Review", "Archive"] },
  Repository: { title: "Dump zone — drop any files; the Agent reads them when you ask", primary: "Drop files", loss: "Your file dump and local knowledge store — drop anything here, search it, and let the Agent answer from what you've stored.", actions: ["Drop", "Search", "Ask Agent"] },
  Projects: { title: "Connect narrative to shipped artifacts", primary: "Ship", loss: "State, README context, team links, and what remains in one honest view.", actions: ["Describe", "Link", "Ship"] },
  Competitions: { title: "Track prizes, grades, and wins distinctly", primary: "Classify", loss: "Attended, wanted, won, and grade-only records separated and project-linked.", actions: ["Classify", "Link", "Credit"] },
  Code: { title: "Code with context and human-approved execution", primary: "Ask", loss: "Ask with repo context, stage edits, approve runs — no surprise execution.", actions: ["Select", "Ask", "Approve"] },
  Classes: { title: "Keep learning commitments and coursework in one rhythm", primary: "Plan", loss: "Recurring classes, materials, and homework deadlines remain connected to the calendar and tasks.", actions: ["Schedule", "Attach", "Sync"] },
  Practice: { title: "Make deliberate learning feel rewardingly addictive", primary: "Train", loss: "Adaptive drills, honest streaks, feedback that builds real competence.", actions: ["Train", "Score", "Level up"] },
  Parallel: { title: "Live your parallel life", loss: "a second life that is brutally fair: the world moves without you, progress is earned by real understanding", primary: "Act", actions: ["Act", "Observe", "Advance"] },
  Customers: { title: "Keep demand visible; stale leads obvious", primary: "Follow up", loss: "Outreach ties back to tasks; neglect surfaces without shame theater.", actions: ["Update", "Flag", "Follow up"] },
  Contacts: { title: "Maintain people as context, not automation", primary: "Reach out", loss: "Closeness, origin, and next touch tracked without CRM performance.", actions: ["Categorize", "Promote", "Reach out"] },
  Team: { title: "Coordinate collaborators from one place", primary: "Message", loss: "Roles, messages, and project links editable without hunting.", actions: ["Edit", "Invite", "Message"] },
  About: { title: "Keep identity and integrations truthful for you and agents", primary: "Connect", loss: "Bio, integrations, and setup context accurate — agents inherit reality.", actions: ["Connect", "Explain", "Configure"] },
  Settings: { title: "Govern models, money, data, and integrations", primary: "Route", loss: "Transparent control: routing, budget, data paths you understand.", actions: ["Route", "Budget", "Protect"] },
  Prompts: { title: "Shape agent behavior deliberately", primary: "Write", loss: "Reusable instructions replace accidental defaults in AI behavior.", actions: ["Write", "Save", "Reuse"] },
  Obsidian: { title: "Mirror memory into Markdown; app stays source of truth", primary: "Review", loss: "Durable reflection layer — review, export, sync without silent drift.", actions: ["Review", "Export", "Sync"] },
  Home: { title: "Choose your world", primary: "Open", loss: "Separate apps for separate modes — open the workspace that matches what you're doing right now.", actions: ["Open", "Glance", "Switch"] },
};
const WORKSPACE_APPS = [
  { id: "agent", name: "Agent", glyph: "&#129302;", workspace: "agent", defaultTab: "Agent", tabs: ["Agent"], badgeTab: "Agent", intention: "Command the system in language — describe outcomes, review staged actions, approve execution." },
  { id: "hub", name: "Hub", glyph: "&#128204;", workspace: "agent", defaultTab: "Hub", tabs: ["Hub"], intention: "Your command deck — save links for later, pin your apps and sites, glance at today." },
  { id: "planner", name: "Planner", glyph: "&#128197;", workspace: "plan", defaultTab: "Today", tabs: ["Today", "Tasks", "Goals", "Calendar", "Events", "Paint", "Trends"], badgeKey: "plannerOverdue", intention: "Calendar command center — make today legible hour by hour, honest and editable." },
  { id: "capture", name: "Capture", glyph: "&#128161;", workspace: "capture", defaultTab: "Ideas", tabs: ["Ideas", "Skills", "Problems", "Thinking", "Funny", "Essays", "Repository"], subtitle: "Ideas · File dump", intention: "Fast capture — ideas, skills, problems, essays, and a file dump the Agent can search." },
  { id: "studio", name: "Studio", glyph: "&#128736;&#65039;", workspace: "build", defaultTab: "Projects", tabs: ["Projects", "Competitions", "Code", "Obsidian", "Classes"], subtitle: "Projects · Code · Notes · Classes", intention: "Ship projects, track competitions, code with human-approved execution, and keep learning next to the work it supports." },
  { id: "blueprint", name: "Blueprint", glyph: "&#11041;", workspace: "build", action: "automation-studio", tabs: [], intention: "Unreal-style graph — wire logic as nodes, variables, and execution flow you can see and edit.", statsKey: "blueprint" },
  { id: "arcade", name: "Arcade", glyph: "&#127919;", workspace: "play", defaultTab: "Practice", tabs: ["Practice"], intention: "Neon arena — adaptive drills, honest streaks, rival matches that train as you play.", statsKey: "arcade" },
  { id: "parallel", name: "Parallel", glyph: "&#127756;", workspace: "play", defaultTab: "Parallel", tabs: ["Parallel"], intention: "Fantasy RPG — live a second life that is brutally fair; progress is earned.", statsKey: "parallel" },
  { id: "people", name: "People", glyph: "&#128101;", workspace: "people", defaultTab: "Contacts", tabs: ["Contacts", "Team", "Customers"], intention: "Relationship context — follow-ups, contacts, and team without CRM theater.", statsKey: "people" },
  { id: "system", name: "System", glyph: "&#9881;&#65039;", workspace: "system", defaultTab: "Settings", tabs: ["Settings", "Prompts", "About"], intention: "Control room — models, budget, data paths, and integrations you understand.", statsKey: "system" },
];
function getHiddenAppIds() {
  try {
    const raw = localStorage.getItem("hiddenAppIds");
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) return ids.filter(id => id !== "system");
    }
  } catch (_) {}
  return [];
}

function isAppHidden(appId) {
  if (appId === "system") return false;
  return getHiddenAppIds().includes(appId);
}

function isGameFeaturesHidden() {
  try {
    const keys = ["wp-hide-game", "waypointGameOff", "waypointHideGame", "hideGameFeatures"];
    for (const key of keys) {
      const raw = String(localStorage.getItem(key) || "").trim().toLowerCase();
      if (raw === "1" || raw === "on" || raw === "true" || raw === "yes") return true;
    }
  } catch (_) {}
  return false;
}

function applyGameFeatureChrome() {
  const off = isGameFeaturesHidden();
  document.documentElement.classList.toggle("wp-hide-game", off);
  document.body.classList.toggle("game-off", off);
  document.body.classList.toggle("wp-hide-game", off);
  document.documentElement.dataset.hideGame = off ? "1" : "0";
  document.querySelectorAll('.launcher-card[data-app="arcade"], .launcher-card[data-app="parallel"]').forEach(card => {
    card.hidden = off;
    card.classList.toggle("launcher-card--game-hidden", off);
  });
  const loot = document.getElementById("hud-game-cluster") || document.querySelector(".hud-loot-cluster");
  if (loot) loot.hidden = off;
  const radar = document.getElementById("launcher-quest-radar");
  if (radar) radar.hidden = off;
  const banner = document.getElementById("wp-quest-auto-banner");
  if (banner) banner.hidden = off;
  const focusCluster = document.getElementById("hud-focus-cluster");
  if (focusCluster) {
    focusCluster.hidden = off;
    focusCluster.setAttribute("aria-hidden", off ? "true" : "false");
  }
  const focusDock = document.getElementById("wp-focus-dock");
  if (focusDock) {
    focusDock.hidden = off;
    focusDock.setAttribute("aria-hidden", off ? "true" : "false");
  }
  if (off && ACTIVE_TAB === "Home") {
    document.querySelectorAll(".loot-profile, .launcher-loot-profile").forEach(el => { el.hidden = true; });
  }
}

function visibleWorkspaceApps() {
  return WORKSPACE_APPS.filter(a => {
    if (isAppHidden(a.id)) return false;
    if (isGameFeaturesHidden() && (a.id === "arcade" || a.id === "parallel")) return false;
    return true;
  });
}

window.isGameFeaturesHidden = isGameFeaturesHidden;
window.applyGameFeatureChrome = applyGameFeatureChrome;

const TAB_WORKSPACE = {
  Agent: "agent", Hub: "agent",
  Today: "plan", Tasks: "plan", Goals: "plan", Calendar: "plan", Events: "plan", Paint: "plan", Trends: "plan",
  Ideas: "capture", Skills: "capture", Problems: "capture", Thinking: "capture", Funny: "capture", Essays: "capture", Repository: "capture",
  Projects: "build", Competitions: "build", Code: "build", Obsidian: "build", Classes: "build",
  Practice: "play", Parallel: "play",
  Customers: "people", Contacts: "people", Team: "people",
  About: "system", Settings: "system", Prompts: "system",
};
const qs = new URLSearchParams(location.search);
let NAV_BADGES = {};
let LAUNCHER_BADGES = { plannerOverdue: null };
let ACTIVE_TAB = qs.get("date") ? "Today" : "Home";
let LAST_RENDER_TAB = null;
// Browser-style back/forward history between tabs. NAV_HISTORY holds tabs visited before the
// current one (top of stack = most recent); NAV_FORWARD holds tabs abandoned by going back, so
// Forward can restore them -- until a fresh navigation happens, which truncates it (same as a
// real browser tab).
let NAV_HISTORY = [];
let NAV_FORWARD = [];
const SCROLL_POS = {};
let RENDER_TOKEN = 0;
let SPA_HISTORY_GUARD_INSTALLED = false;
// Slight lateral motion for tab switches: "forward" | "back" | "none". Consumed by render().
let NAV_DIR = "none";

function observeActiveTab() {
  window.WaypointHabits?.observe("tab", ACTIVE_TAB);
}

function installSpaHistoryGuard() {
  if (SPA_HISTORY_GUARD_INSTALLED) return;
  SPA_HISTORY_GUARD_INSTALLED = true;
  history.replaceState({ waypointGuard: "root" }, "", location.href);
  history.pushState({ waypointGuard: "app" }, "", location.href);
  window.addEventListener("popstate", () => {
    history.pushState({ waypointGuard: "app" }, "", location.href);
    if (NAV_HISTORY.length) void navBack();
  });
}

function tabNavDirection(fromTab, toTab) {
  if (!fromTab || !toTab || fromTab === toTab) return "none";
  if (fromTab === "Home" || toTab === "Home") return "none";
  const from = TABS.indexOf(fromTab);
  const to = TABS.indexOf(toTab);
  if (from < 0 || to < 0) return "forward";
  return to >= from ? "forward" : "back";
}

// Use this instead of setting ACTIVE_TAB directly whenever a NEW navigation happens (nav bar
// clicks, "jump to Team/Tasks" shortcuts, etc). Back/Forward themselves bypass this on purpose --
// they don't count as new navigations.
async function goToTab(tab) {
  if (tab === ACTIVE_TAB || LAUNCH_ANIMATING) return;
  if (ACTIVE_TAB === "Repository" && typeof repoFlushAutosave === "function") {
    await repoFlushAutosave({ keepalive: true });
  }
  if (tab === "Home" && ACTIVE_TAB !== "Home" && await playHomeExitTransition() === false) return;
  await navigateToTab(tab);
}

async function forceGoHome() {
  if (typeof closeLauncherSearch === "function") closeLauncherSearch();
  const overlay = document.getElementById("launch-overlay");
  cancelLaunchTransition();
  if (overlay && (LAUNCH_ANIMATING || overlay.classList.contains("launch-overlay--active") || overlay.classList.contains("launch-overlay--exit"))) {
    resetLaunchOverlay(overlay);
  }
  if (ACTIVE_TAB === "Home") return;
  if (ACTIVE_TAB === "Repository" && typeof repoFlushAutosave === "function") {
    await repoFlushAutosave({ keepalive: true });
  }
  if (await playHomeExitTransition() === false) return;
  await navigateToTab("Home");
}

// "Agent buttons on lists": jumps to the Agent tab and pre-fills (doesn't auto-send -- you still
// click Send) a message referencing whatever list item you clicked from, so you don't have to
// re-type context to ask the agent about something you're already looking at.
async function askAgentAbout(promptText) {
  if (ACTIVE_TAB !== "Agent") {
    if (ACTIVE_TAB === "Today" && typeof flushTodayAutosave === "function") {
      try {
        await flushTodayAutosave({ keepalive: true });
      } catch (exc) {
        console.warn("[today] askAgentAbout leave save failed:", exc);
      }
    }
    if (ACTIVE_TAB === "Repository" && typeof repoFlushAutosave === "function") {
      await repoFlushAutosave({ keepalive: true });
    }
    SCROLL_POS[ACTIVE_TAB] = window.scrollY;
    NAV_DIR = tabNavDirection(ACTIVE_TAB, "Agent");
    NAV_HISTORY.push(ACTIVE_TAB);
    NAV_FORWARD = [];
    ACTIVE_TAB = "Agent";
    observeActiveTab();
    await render();
  }
  const input = document.getElementById("agent-input");
  if (input) { input.value = promptText; input.focus(); }
}

async function navBack() {
  if (!NAV_HISTORY.length) return;
  if (ACTIVE_TAB === "Today" && typeof flushTodayAutosave === "function") {
    try {
      await flushTodayAutosave({ keepalive: true });
    } catch (exc) {
      console.warn("[today] navBack leave save failed:", exc);
    }
  }
  if (ACTIVE_TAB === "Repository" && typeof repoFlushAutosave === "function") {
    await repoFlushAutosave({ keepalive: true });
  }
  SCROLL_POS[ACTIVE_TAB] = window.scrollY;
  NAV_FORWARD.push(ACTIVE_TAB);
  NAV_DIR = "back";
  ACTIVE_TAB = NAV_HISTORY.pop();
  observeActiveTab();
  return render();
}

async function navForward() {
  if (!NAV_FORWARD.length) return;
  if (ACTIVE_TAB === "Today" && typeof flushTodayAutosave === "function") {
    try {
      await flushTodayAutosave({ keepalive: true });
    } catch (exc) {
      console.warn("[today] navForward leave save failed:", exc);
    }
  }
  if (ACTIVE_TAB === "Repository" && typeof repoFlushAutosave === "function") {
    await repoFlushAutosave({ keepalive: true });
  }
  SCROLL_POS[ACTIVE_TAB] = window.scrollY;
  NAV_HISTORY.push(ACTIVE_TAB);
  NAV_DIR = "forward";
  ACTIVE_TAB = NAV_FORWARD.pop();
  observeActiveTab();
  return render();
}

function updateNavHistoryButtons() {
  const back = document.getElementById("nav-back");
  const fwd = document.getElementById("nav-forward");
  if (back) back.disabled = !NAV_HISTORY.length;
  if (fwd) fwd.disabled = !NAV_FORWARD.length;
}
let CONFIG = null;
// Format a Date as YYYY-MM-DD in the *local* timezone. Never use
// `d.toISOString().slice(0, 10)` for calendar dates: toISOString is UTC, so
// local midnights east of UTC shift back one calendar day (e.g. Paris UTC+2
// sees Thursday under "Saturday" after week-column reserialization).
function localYmd(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
let CURRENT_DATE = qs.get("date") || localYmd();

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 409) {
    let body = {};
    try { body = await res.json(); } catch (_) {}
    if (body.error === "calendar_conflict") {
      const overlap = (body.overlaps || []).map(e => e.title).join(", ");
      const dup = (body.duplicates || []).map(e => e.title).join(", ");
      const msg = [
        overlap ? `Overlaps: ${overlap}` : "",
        dup ? `Same slot: ${dup}` : "",
        "Add anyway?",
      ].filter(Boolean).join("\n");
      if (typeof window !== "undefined" && window.confirm(msg)) {
        const next = { ...(opts || {}) };
        let payload = {};
        try { payload = JSON.parse(next.body || "{}"); } catch (_) {}
        payload.force = true;
        next.body = JSON.stringify(payload);
        next.headers = { ...(next.headers || {}), "Content-Type": "application/json" };
        return api(path, next);
      }
      throw new Error(JSON.stringify({ error: "cancelled overlap" }));
    }
    throw new Error(JSON.stringify(body));
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// api() throws on non-2xx responses (the body is the raw JSON error text) instead of
// resolving to a normal { error } object. Handlers that skip try/catch around await api(...)
// end up with an unhandled rejection -- no alert, and any "reset button state" code after the
// await never runs. Wrap those awaits in try/catch and pass the caught error through this to
// get the same readable message a successful-but-erroring call would have produced.
function errorMessage(err) {
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && parsed.error) return parsed.error;
  } catch (_) { /* not JSON -- fall through to raw message */ }
  return err.message || String(err);
}

// --- Activity trail ----------------------------------------------------------------------
// "Save as much as possible" without turning the DB into a firehose: only short TEXTUAL
// context is recorded (which tab, which action, a truncated label) -- never keystrokes or
// pointer paths -- it is buffered rather than sent per event, and the server collapses
// consecutive repeats into a counter.
const ACTIVITY_BUFFER = [];
const ACTIVITY_FLUSH_MS = 20000;
const ACTIVITY_MAX_BUFFER = 50;
let activityFlushTimer = null;

function recordActivity(kind, tab, label, detail) {
  try {
    ACTIVITY_BUFFER.push({
      kind,
      tab: tab || ACTIVE_TAB || "",
      label: (label || "").slice(0, 120),
      detail: (detail || "").slice(0, 400),
      at: new Date().toISOString(),
    });
    if (ACTIVITY_BUFFER.length >= ACTIVITY_MAX_BUFFER) {
      flushActivity();
    } else if (!activityFlushTimer) {
      activityFlushTimer = setTimeout(() => flushActivity(), ACTIVITY_FLUSH_MS);
    }
  } catch (_) {
    // Recording must never be able to break the action it is describing.
  }
}

function flushActivity(useBeacon) {
  if (activityFlushTimer) { clearTimeout(activityFlushTimer); activityFlushTimer = null; }
  if (!ACTIVITY_BUFFER.length) return;
  const events = ACTIVITY_BUFFER.splice(0, ACTIVITY_BUFFER.length);
  const body = JSON.stringify({ events });
  // On page-hide a normal fetch gets killed mid-flight, which is precisely when the last
  // events of a session would be lost. sendBeacon survives teardown.
  if (useBeacon && navigator.sendBeacon) {
    try {
      navigator.sendBeacon("/api/activity", new Blob([body], { type: "application/json" }));
      return;
    } catch (_) { /* fall through to fetch */ }
  }
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => { /* offline: drop rather than retry forever and stack up memory */ });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushActivity(true);
});
window.addEventListener("pagehide", () => flushActivity(true));

// One row per app open gives the trail session boundaries, which is what makes a run of nav
// events readable later ("this is one sitting", not a continuous smear).
recordActivity("session", "", "app open");

// --- Cash and achievements sync ---------------------------------------------------------
// All of this lived in localStorage only, so it was lost when browser data was cleared and
// never matched between the laptop and the phone. The whole blob is mirrored to the server,
// which MERGES per key (trophies union, counters max, balances last-write-wins) and hands back
// the merged values for this device to adopt. Hooking every writer would have meant touching
// dozens of call sites; syncing the blob on load, on hide and on change catches all of them.
// Loot, eggs and habits store under constant-named keys (STORAGE_KEY, GEM_CAP_KEY and so on),
// so they are easy to miss when scanning for localStorage string literals. They are listed
// explicitly here; the server refuses any key it has no merge rule for.
const GAME_SYNC_KEYS = [
  // cash
  "gameGems", "arcadeCoinsBonus", "gameXpToday",
  "waypointCoinHighWater", "waypointCoinSourceHighWaterV2", "waypointCoinRoadScaleVersion",
  "waypointLootCoinBonusV1",
  // loot boxes and skins
  "waypointLootStateV1", "waypointGemCapV1", "waypointDailyMetaV1", "waypointCustomSkinsV1",
  "lootSkinTutorialSeen", "waypointLootSoundsMuted",
  // eggs and achievements
  "waypointEggsV1", "waypointAchievementsV1", "seenUnlocks", "triumphSeen", "unlockedThemes",
  "arcadeTrophies", "arcadeTrophyRoad", "arcadeUnlocks", "seenLevels", "seenStreakMilestones",
  // other earned progress
  "waypointHabitsV1", "gameQuestRotationV1", "founderOpsStreak", "arcadePlayTimeMs",
  "hardwareTrackLevel", "hardwareStageClears", "pulseHonestyDates",
  "goalProgressToday", "dailyContract", "lateLogs", "perkConfetti", "perkMidnight",
  "tskDoneToday", "tskPowerCaptureDay",
  // quests and arcade identity
  "gameQuests", "gameTodayCompleteDate", "arcadeSkillHist", "arcadeCanvasStats",
  "arcadePlayerName", "arcadeRival", "dailyCheckHistory",
  // look and view preferences: losing these on a cache clear, or having them differ between
  // laptop and phone, is the same store-everything complaint. No quoted strings in comments
  // inside this array -- the client/server key parity check reads it with a regex.
  "activeTheme", "activeWallpaper", "stylePaintConfig", "style_paint_config",
  "homeSpots", "hubPins", "hubReading", "taskSortMode", "todayWeekMode", "todayWeekOpen",
  "calendarView", "calendarWeekStart", "settings_density", "hiddenAppIds", "calmMode",
  "quickCaptureType", "dayTemplates", "wfSplitView",
];
let lastGameStateSent = "";

function readGameState() {
  const out = {};
  for (const key of GAME_SYNC_KEYS) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) { continue; }
    if (raw === null) continue;
    try { out[key] = JSON.parse(raw); } catch (_) { out[key] = raw; }
  }
  return out;
}

function applyGameState(values) {
  if (!values) return;
  for (const [key, value] of Object.entries(values)) {
    if (!GAME_SYNC_KEYS.includes(key) || value === null || value === undefined) continue;
    try {
      localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    } catch (_) { /* private mode: keep going, the server copy is still authoritative */ }
  }
}

async function syncGameState(useBeacon) {
  const values = readGameState();
  const body = JSON.stringify({ values, updatedAt: new Date().toISOString() });
  const fingerprint = JSON.stringify(values);
  if (!useBeacon && fingerprint === lastGameStateSent) return;
  lastGameStateSent = fingerprint;
  if (useBeacon && navigator.sendBeacon) {
    try {
      navigator.sendBeacon("/api/game-state/sync", new Blob([body], { type: "application/json" }));
      return;
    } catch (_) { /* fall through */ }
  }
  try {
    const res = await fetch("/api/game-state/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true,
    });
    if (!res.ok) return;
    const merged = await res.json();
    // A reset wins over whatever this browser still holds. Without clearing first, the local
    // copy would simply be re-sent and the MAX merge rules would put the old totals back.
    try {
      const seen = localStorage.getItem("wpGameResetEpoch") || "";
      if (merged.resetEpoch && merged.resetEpoch > seen) {
        (merged.resetKeys || []).forEach(key => {
          try { localStorage.removeItem(key); } catch (_) {}
        });
        localStorage.setItem("wpGameResetEpoch", merged.resetEpoch);
      }
    } catch (_) { /* private mode: the server copy still governs */ }
    // Adopt the merged result: this is how a trophy earned on the phone shows up here.
    applyGameState(merged.values);
    lastGameStateSent = JSON.stringify(readGameState());
  } catch (_) { /* offline: the local copy still works, next sync will catch up */ }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") syncGameState(true);
});
window.addEventListener("pagehide", () => syncGameState(true));
setInterval(() => syncGameState(false), 60000);
syncGameState(false);

// For actions that can genuinely take a while (email send, Google OAuth connect) -- shows a
// Stop button next to the trigger so you're never just stuck staring at a spinner. Stopping
// only cancels the client's wait, not necessarily whatever's happening server-side.
function runCancellable(btn, label, fn) {
  const controller = new AbortController();
  btn.style.display = "none";
  const wrap = document.createElement("span");
  wrap.style.cssText = "display:inline-flex; align-items:center; gap:6px;";
  wrap.innerHTML = `<span class="spinner"></span><span class="stub" style="font-size:12px;">${label}</span>`;
  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.className = "secondary";
  stopBtn.textContent = "Stop";
  stopBtn.style.cssText = "padding:2px 8px; font-size:11px;";
  wrap.appendChild(stopBtn);
  btn.insertAdjacentElement("afterend", wrap);

  let cancelled = false;
  stopBtn.onclick = () => { cancelled = true; controller.abort(); };

  return fn(controller.signal)
    .catch(err => {
      if (cancelled) return { error: "Stopped waiting -- note the action may still finish in the background on its own, this only stopped waiting for it here." };
      throw err;
    })
    .finally(() => { wrap.remove(); btn.style.display = ""; });
}

function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#0b0b0b" : "#ffffff";
}

function colorSelect(hex) {
  return `background:${hex}; color:${contrastText(hex)};`;
}

function appForTab(tab) {
  if (!tab || tab === "Home") return null;
  return WORKSPACE_APPS.find(a => (a.tabs || []).includes(tab)) || null;
}

function workspaceForTab(tab) {
  if (tab === "Home") return "home";
  return TAB_WORKSPACE[tab] || "agent";
}

let LAUNCH_ANIMATING = false;
let LAUNCHER_STATS = {};
let LAUNCHER_SPOT_DATA = {};
let LAUNCHER_SPOTS_CUSTOMIZE = false;
let CUSTOM_APPS = [];
let LAUNCHER_AMBIENT_RAF = null;
let LAUNCHER_AMBIENT_CLEANUP = null;
let LAUNCHER_AMBIENT_PAUSED = false;
let LAUNCHER_SEARCH_OPEN = false;
let LAUNCHER_DOCK_TAB = localStorage.launcherDockTab === "myapps" ? "myapps" : "workspace";
let LAUNCHER_FOCUS = { index: 0, cards: [], setFocus: null };

const HOME_SPOT_BASE_COUNT = 6;
function homeSpotCount() {
  return HOME_SPOT_BASE_COUNT + (window.WaypointLoot && window.WaypointLoot.hasUnlock("extra_pin") ? 1 : 0);
}
const HOME_SPOT_OPTIONS = [
  { key: "most_urgent_task", label: "Urgent task" },
  { key: "overdue_count", label: "Overdue" },
  { key: "due_today", label: "Due today" },
  { key: "today_pulse", label: "Today pulse" },
  { key: "practice_streak", label: "Streak" },
  { key: "trophies", label: "Trophies" },
  { key: "coins", label: "Coins" },
  { key: "next_calendar", label: "Next up" },
  { key: "active_project", label: "Project" },
  { key: "inbox_thoughts", label: "Inbox" },
  { key: "open_problems", label: "Problems" },
  { key: "parallel_quests", label: "Quests" },
  { key: "contacts_stale", label: "Stale contacts" },
  { key: "workflows", label: "Workflows" },
  { key: "daily_quests", label: "Daily quests" },
  { key: "agent_pending", label: "Agent" },
  { key: "blank", label: "—" },
];
const HOME_SPOT_DEFAULTS = ["most_urgent_task", "overdue_count", "practice_streak", "next_calendar", "today_pulse", "coins"];

const APP_LAST_CONTEXT_KEY = "appLastContext";
let HUD_PREV_VALUES = { coins: null, trophies: null, streak: null, budget: null, model: null };
let HUD_TRUTH_WRAPPED = false;
const HUD_NUMBER_RAF = new WeakMap();

function readAppLastContext() {
  try {
    const raw = localStorage.getItem(APP_LAST_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function writeAppLastContext(obj) {
  try { localStorage.setItem(APP_LAST_CONTEXT_KEY, JSON.stringify(obj)); } catch (_) {}
}

const LAUNCHER_LAST_APP_KEY = "launcherLastApp";

function rememberLauncherLastApp(appId) {
  if (!appId) return;
  try { localStorage.setItem(LAUNCHER_LAST_APP_KEY, appId); } catch (_) {}
}

function readLauncherLastApp() {
  try { return localStorage.getItem(LAUNCHER_LAST_APP_KEY) || ""; } catch (_) { return ""; }
}

function saveAppLastContext(tab) {
  if (!tab || tab === "Home") return;
  const app = appForTab(tab);
  if (!app) return;
  let label = TAB_LABELS[tab] || tab;
  if (tab === "Parallel") label = "the world awaits";
  else if ((app.id === "studio" || app.id === "blueprint") && typeof CURRENT_WF !== "undefined" && CURRENT_WF && CURRENT_WF.name) {
    label = CURRENT_WF.name;
  }
  const store = readAppLastContext();
  store[app.id] = { label, restore: { tab }, at: Date.now() };
  writeAppLastContext(store);
  rememberLauncherLastApp(app.id);
}

function launcherContextAgo(ts) {
  const n = Number(ts) || 0;
  if (!n) return "";
  const s = Math.max(0, Math.round((Date.now() - n) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function launcherLastContextHtml(app) {
  const ctx = readAppLastContext()[app.id];
  if (!ctx || !ctx.label || !ctx.restore || !ctx.restore.tab) return "";
  const label = ctx.label.length > 28 ? ctx.label.slice(0, 26) + "…" : ctx.label;
  const ago = launcherContextAgo(ctx.at);
  const copy = ago ? `${label} · ${ago}` : label;
  return `<span class="launcher-card-context" role="button" tabindex="0" data-restore-tab="${escapeHtml(ctx.restore.tab)}" title="Left off here — ${escapeHtml(label)}">${escapeHtml(copy)}</span>`;
}

function ensureHudTruthBreathStyles() {
  if (document.getElementById("hud-truth-breath-styles")) return;
  const style = document.createElement("style");
  style.id = "hud-truth-breath-styles";
  style.textContent = `
    .launcher-card-context {
      display: block;
      width: 100%;
      margin: 2px 0 0;
      padding: 0;
      border: none;
      background: none;
      font-family: var(--font-body, var(--font-ui));
      color: var(--ink-secondary);
      font-size: 11px;
      font-weight: 550;
      line-height: 1.25;
      letter-spacing: 0.02em;
      text-align: left;
      opacity: 0.92;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .launcher-card-context:hover { opacity: 1; color: var(--ink-primary); }
    .hud-truth-breath { position: relative; }
    .hud-truth-breath::after {
      content: "";
      position: absolute;
      left: 8%;
      right: 8%;
      bottom: 2px;
      height: 1px;
      background: color-mix(in srgb, var(--accent, #e84a2f) 85%, transparent);
      box-shadow: 0 0 6px color-mix(in srgb, var(--accent, #e84a2f) 55%, transparent);
      opacity: 0;
      pointer-events: none;
      animation: hud-truth-underline 220ms ease forwards;
    }
    .hud-truth-breath .hud-truth-tick {
      display: inline-block;
      animation: hud-truth-tick 220ms ease;
    }
    @keyframes hud-truth-underline {
      0% { opacity: 0; transform: scaleX(0.35); }
      45% { opacity: 1; transform: scaleX(1); }
      100% { opacity: 0; transform: scaleX(1); }
    }
    @keyframes hud-truth-tick {
      0% { opacity: 0.55; transform: translateY(1px); }
      40% { opacity: 1; transform: translateY(0); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .hud-truth-breath::after, .hud-truth-breath .hud-truth-tick { animation: none !important; }
    }
    body.wp-hud-extra-collapsed #hud-metrics-detail { display: none !important; }
    body.wp-hud-extra-collapsed .hud-xp-bar,
    body.wp-hud-extra-collapsed .hud-xp-level,
    body.wp-hud-extra-collapsed .hud-gems-count,
    body.wp-hud-extra-collapsed .hud-loot-divider,
    body.wp-hud-extra-collapsed #hud-quests-btn,
    body.wp-hud-extra-collapsed #hud-chest-btn { display: none !important; }
    body.wp-hud-extra-collapsed #hud-xp-btn { gap: 0; min-width: 0; padding-inline: 8px; }
    body.wp-hud-compact .top-hud { min-height: 40px; padding-block: 2px; }
    body.wp-hud-compact .hud-intention { display: none !important; }
    body.wp-hud-extra-collapsed #hud-now-focus { display: none !important; }
    body.wp-hud-compact #launch-automation-studio { display: none !important; }
    body.wp-hud-compact .hud-chip,
    body.wp-hud-compact .hud-icon-btn,
    body.wp-hud-compact .hud-status-pill {
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }
    body.wp-hud-compact #hud-agent-chip {
      width: 8px; min-width: 8px; height: 8px; padding: 0; overflow: hidden;
      font-size: 0; line-height: 0; border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 72%, transparent) !important;
    }
    body.wp-hud-compact #hud-agent-chip::before { display: none; }
    .hud-focus-cluster {
      display: inline-flex; align-items: center; gap: 0;
      margin: 0 4px; padding: 0 6px;
      border-left: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      border-right: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      background: transparent;
    }
    .hud-focus-cluster .hud-icon-btn {
      width: 28px; height: 28px; color: color-mix(in srgb, var(--accent) 58%, var(--ink-secondary));
    }
    .hud-focus-cluster .hud-icon-btn:hover { color: var(--accent); }
    html.wp-hide-game #hud-focus-cluster,
    body.wp-hide-game #hud-focus-cluster,
    html.wp-hide-game .hud-focus-cluster,
    body.wp-hide-game .hud-focus-cluster { display: none !important; }
    .wp-mini-dock { display: none !important; }
    body.wp-hide-game .launcher-card[data-app="arcade"],
    body.wp-hide-game .launcher-card[data-app="parallel"],
    body.game-off .launcher-card[data-app="arcade"],
    body.game-off .launcher-card[data-app="parallel"] { display: none !important; }
    .launcher-card.launcher-tile {
      min-height: 176px; border-radius: 16px; box-shadow: none; filter: none;
      background: linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--tile-accent, var(--accent)) 6%), var(--bg-card));
    }
    .launcher-card-intention { display: none; }
    .launcher-card-glyph, .launcher-tile-glyph {
      width: 44px; height: 44px; font-size: 0; background: transparent; box-shadow: none;
    }
    .wp-tile-mark { width: 36px; height: 36px; display: block; }
    .wp-quest-auto-banner {
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%) translateY(-18px);
      z-index: 90050; display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
      border-radius: 999px; background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
      box-shadow: 0 10px 28px rgba(0,0,0,.28); font-size: 12px; opacity: 0; pointer-events: none;
    }
    .wp-quest-auto-banner--in { opacity: 1; transform: translateX(-50%) translateY(0); transition: opacity 280ms ease, transform 320ms var(--ease-spring, cubic-bezier(.2,.8,.2,1)); }
    .wp-quest-auto-banner--out { opacity: 0; transform: translateX(-50%) translateY(-10px); transition: opacity 220ms ease, transform 220ms ease; }
    .launcher-share-app, .hub-share-app {
      appearance: none; border: 1px solid var(--border); background: transparent;
      color: var(--ink-secondary); font: inherit; font-size: 11px; letter-spacing: .04em;
      text-transform: uppercase; border-radius: 999px; padding: 6px 12px; cursor: pointer;
    }
    .launcher-share-app:hover, .hub-share-app:hover { color: var(--ink-primary); border-color: var(--ink-secondary); }
    .launch-precalc {
      position: absolute; inset: 0; display: grid; place-items: center; z-index: 3;
      color: var(--ink-primary); pointer-events: none;
    }
    .launch-precalc-mark {
      width: 56px; height: 56px; border-radius: 18px;
      border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
      background: radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 62%);
      animation: launch-precalc-pulse 900ms ease-in-out infinite;
    }
    .launch-precalc-copy { margin-top: 12px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); text-align: center; }
    @keyframes launch-precalc-pulse {
      0%, 100% { transform: scale(.96); opacity: .7; }
      50% { transform: scale(1); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .wp-quest-auto-banner, .launch-precalc-mark { animation: none !important; transition: none !important; }
    }`;
  document.head.appendChild(style);
}

function applyHudChrome() {
  document.body.classList.add("wp-hud-compact");
  const expanded = document.getElementById("hud-status-pill")?.getAttribute("aria-expanded") === "true";
  document.body.classList.toggle("wp-hud-extra-collapsed", !expanded);
  const detail = document.getElementById("hud-metrics-detail");
  if (detail && !expanded) detail.hidden = true;
  applyGameFeatureChrome();
  const cluster = document.getElementById("hud-focus-cluster");
  if (cluster) {
    const hide = isGameFeaturesHidden()
      || document.documentElement.classList.contains("wp-hide-game")
      || document.body.classList.contains("wp-hide-game")
      || document.documentElement.hasAttribute("wp-hide-game")
      || document.body.hasAttribute("wp-hide-game");
    cluster.hidden = hide;
    cluster.setAttribute("aria-hidden", hide ? "true" : "false");
  }
}

function parseHudCoins(text) {
  const m = String(text || "").match(/◉\s*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

function parseHudTrophies(text) {
  const m = String(text || "").match(/([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
}

function parseHudStreak(text) {
  const m = String(text || "").match(/([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
}

function parseHudBudget(text) {
  const m = String(text || "").match(/\$([\d.]+)\s*\/\s*\$([\d.]+)/);
  if (!m) return { spent: null, cap: null };
  return { spent: parseFloat(m[1]), cap: parseFloat(m[2]) };
}

function snapshotHudCounters() {
  const coinsEl = document.getElementById("hud-coins-label");
  const trophiesEl = document.getElementById("hud-trophies-label");
  const streakEl = document.getElementById("hud-streak-label");
  const budgetText = document.getElementById("hud-budget-text");
  const modelChip = document.getElementById("hud-model-chip");
  const budget = parseHudBudget(budgetText ? budgetText.textContent : "");
  return {
    coins: coinsEl ? parseHudCoins(coinsEl.textContent) : null,
    trophies: trophiesEl ? parseHudTrophies(trophiesEl.textContent) : null,
    streak: streakEl ? parseHudStreak(streakEl.textContent) : null,
    budget: budget.spent,
    budgetCap: budget.cap,
    model: modelChip ? modelChip.textContent.trim() : null,
  };
}

function hudTruthTooltip(key, snap) {
  if (key === "coins") return "Coins come from real actions only";
  if (key === "trophies") return "Arcade trophies — honest local tally from real matches";
  if (key === "streak") return "Practice streak from real sessions — missed days reset it";
  if (key === "budget") {
    const spent = snap.budget != null ? snap.budget.toFixed(2) : "—";
    const cap = snap.budgetCap != null ? snap.budgetCap.toFixed(2) : "—";
    return `Today: $${spent} of $${cap}`;
  }
  if (key === "model") return "Tap to switch Cloud, Local, or Custom AI";
  return "";
}

function animateHudNumberTick(labelEl, from, to, formatter, duration) {
  if (from === to || from == null || to == null) return;
  const previousRaf = HUD_NUMBER_RAF.get(labelEl);
  if (previousRaf) cancelAnimationFrame(previousRaf);
  const ms = duration || 180;
  const start = performance.now();
  const span = labelEl.querySelector(".hud-truth-tick") || labelEl;
  const step = now => {
    if (!span.isConnected) {
      HUD_NUMBER_RAF.delete(labelEl);
      return;
    }
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 2);
    const val = Math.round(from + (to - from) * eased);
    span.textContent = formatter(val);
    if (t < 1) HUD_NUMBER_RAF.set(labelEl, requestAnimationFrame(step));
    else {
      span.textContent = formatter(to);
      HUD_NUMBER_RAF.delete(labelEl);
    }
  };
  span.textContent = formatter(from);
  HUD_NUMBER_RAF.set(labelEl, requestAnimationFrame(step));
}

function triggerHudTruthBreath(btnEl, labelEl, prevVal, nextVal, formatFn) {
  if (!btnEl) return;
  if (!btnEl.classList.contains("hud-truth-breath")) {
    btnEl.classList.add("hud-truth-breath");
    setTimeout(() => btnEl.classList.remove("hud-truth-breath"), 240);
  }
  if (labelEl && formatFn && typeof prevVal === "number" && typeof nextVal === "number" && prevVal !== nextVal) {
    const tickHost = labelEl.querySelector(".hud-truth-tick");
    const target = tickHost || labelEl;
    if (!target.classList.contains("hud-truth-tick")) {
      target.classList.add("hud-truth-tick");
      setTimeout(() => target.classList.remove("hud-truth-tick"), 240);
    }
    animateHudNumberTick(labelEl, prevVal, nextVal, formatFn);
  }
}

function applyHudTruthBreaths(prev) {
  ensureHudTruthBreathStyles();
  const snap = snapshotHudCounters();
  const reduced = prefersReducedMotion();
  const specs = [
    { key: "coins", btn: "hud-xp-btn", label: "hud-coins-label", format: v => `◉ ${v.toLocaleString()}` },
    { key: "trophies", btn: "hud-trophies-btn", label: "hud-trophies-label", format: v => (v ? `🏆 ${v.toLocaleString()}` : "🏆 —") },
    { key: "streak", btn: "hud-streak-btn", label: "hud-streak-label", format: v => `🔥 ${v}d` },
    { key: "budget", btn: "hud-budget-btn", label: "hud-budget-text", format: null },
    { key: "model", btn: "hud-model-chip", label: null, format: null },
  ];
  specs.forEach(spec => {
    const btnEl = document.getElementById(spec.btn);
    if (!btnEl) return;
    const labelEl = spec.label ? document.getElementById(spec.label) : null;
    // Keep coin truth on the coins span so it does not fight the loot-cluster title.
    if (spec.key === "coins" && labelEl) labelEl.title = hudTruthTooltip(spec.key, snap);
    else btnEl.title = hudTruthTooltip(spec.key, snap);
    const p = prev[spec.key];
    const n = snap[spec.key];
    if (p !== null && p !== undefined && p !== n && !reduced) {
      if (spec.key === "coins" && typeof p === "number" && typeof n === "number" && n > p
          && window.WaypointLoot && typeof window.WaypointLoot.coinBurst === "function") {
        window.WaypointLoot.coinBurst(n - p, labelEl || btnEl);
      }
      if (spec.key === "budget" && labelEl && typeof p === "number" && typeof n === "number") {
        triggerHudTruthBreath(btnEl, labelEl, p, n, (v) => `$${v.toFixed(2)} / $${(snap.budgetCap || 0).toFixed(2)}`);
      } else if (spec.format) {
        triggerHudTruthBreath(btnEl, labelEl, p, n, spec.format);
      } else {
        triggerHudTruthBreath(btnEl, null, null, null, null);
      }
    }
  });
  HUD_PREV_VALUES = {
    coins: snap.coins,
    trophies: snap.trophies,
    streak: snap.streak,
    budget: snap.budget,
    model: snap.model,
  };
}

function installHudTruthBreathWrapper() {
  if (HUD_TRUTH_WRAPPED || typeof refreshHudData !== "function") return;
  const orig = refreshHudData;
  refreshHudData = async function hudRefreshWithTruthBreath() {
    const prev = { ...HUD_PREV_VALUES };
    await orig();
    applyHudTruthBreaths(prev);
  };
  HUD_TRUTH_WRAPPED = true;
}

// misc.js loads after core.js and calls refreshHudData at init — defer wrap to catch it on next tick.
if (typeof queueMicrotask === "function") queueMicrotask(installHudTruthBreathWrapper);
else setTimeout(installHudTruthBreathWrapper, 0);

async function fetchCustomApps() {
  try {
    const res = await fetch("/api/apps");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

async function openCustomApp(workflowId) {
  const id = workflowId != null ? String(workflowId).trim() : "";
  if (!id) {
    if (typeof showToast === "function") showToast("App not found", "error");
    return;
  }
  window.PENDING_CUSTOM_APP = id;
  AUTOMATION_STUDIO_OPEN = true;
  if (typeof renderAutomationStudioView !== "function") {
    if (typeof showToast === "function") showToast("Automation Studio is not available", "error");
    return;
  }
  try {
    await renderAutomationStudioView();
  } catch (err) {
    AUTOMATION_STUDIO_OPEN = false;
    window.PENDING_CUSTOM_APP = null;
    if (typeof showToast === "function") showToast(`Could not open app: ${errorMessage(err)}`, "error");
  }
}
window.openCustomApp = openCustomApp;

async function refreshCustomApps() {
  CUSTOM_APPS = await fetchCustomApps();
  return CUSTOM_APPS;
}

function hudReadTrophies() {
  try {
    return Math.max(0, parseInt(localStorage.getItem("arcadeTrophies") || "0", 10) || 0);
  } catch (_) { return 0; }
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function launchAnimEnabled() {
  if (!motionAllowed()) return false;
  return !(window.WaypointDevice?.phone || document.documentElement.classList.contains("device-phone"));
}

let LAUNCH_PRECALC_TIMER = 0;
let LAUNCH_PRECALC_VISIBLE = false;

function showLaunchPrecalcOverlay() {
  if (LAUNCH_ANIMATING || LAUNCH_PRECALC_VISIBLE) return;
  const overlay = document.getElementById("launch-overlay");
  if (!overlay || overlay.classList.contains("launch-overlay--active") || overlay.classList.contains("launch-overlay--exit")) return;
  if (!launchAnimEnabled()) return;
  LAUNCH_PRECALC_VISIBLE = true;
  overlay.innerHTML = `<div class="launch-backdrop"></div>
    <div class="launch-precalc" role="status" aria-live="polite">
      <div>
        <div class="launch-precalc-mark" aria-hidden="true"></div>
        <div class="launch-precalc-copy">Preparing</div>
      </div>
    </div>`;
  overlay.className = "launch-overlay launch-overlay--active launch-phase-darken";
  overlay.setAttribute("aria-hidden", "false");
}

function hideLaunchPrecalcOverlay() {
  if (LAUNCH_PRECALC_TIMER) { clearTimeout(LAUNCH_PRECALC_TIMER); LAUNCH_PRECALC_TIMER = 0; }
  if (!LAUNCH_PRECALC_VISIBLE) return;
  LAUNCH_PRECALC_VISIBLE = false;
  const overlay = document.getElementById("launch-overlay");
  if (!overlay || LAUNCH_ANIMATING) return;
  resetLaunchOverlay(overlay);
}

async function withLaunchPrecalc(work) {
  if (typeof work !== "function") return;
  if (!launchAnimEnabled() || LAUNCH_ANIMATING) return work();
  LAUNCH_PRECALC_TIMER = setTimeout(showLaunchPrecalcOverlay, 90);
  try {
    return await work();
  } finally {
    hideLaunchPrecalcOverlay();
  }
}

function motionAllowed() {
  if (prefersReducedMotion()) return false;
  try {
    if (document.documentElement.classList.contains("settings-motion-reduced")) return false;
  } catch (_) {}
  return true;
}

/** Soft top/bottom wash when the user keeps scrolling past the document edge. */
function initScrollEdgeCues() {
  if (document.getElementById("scroll-edge-top")) return;
  const top = document.createElement("div");
  top.id = "scroll-edge-top";
  top.className = "scroll-edge scroll-edge--top";
  top.setAttribute("aria-hidden", "true");
  const bot = document.createElement("div");
  bot.id = "scroll-edge-bottom";
  bot.className = "scroll-edge scroll-edge--bottom";
  bot.setAttribute("aria-hidden", "true");
  document.body.appendChild(top);
  document.body.appendChild(bot);

  let coolTop = 0;
  let coolBot = 0;
  let touchY = null;

  function atTop() {
    return window.scrollY <= 1;
  }
  function atBottom() {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return max <= 2 || window.scrollY >= max - 2;
  }
  function pulse(el, side) {
    if (!motionAllowed()) return;
    const now = Date.now();
    if (side === "top") {
      if (now < coolTop) return;
      coolTop = now + 720;
    } else {
      if (now < coolBot) return;
      coolBot = now + 720;
    }
    el.classList.remove("scroll-edge--pulse");
    void el.offsetWidth;
    el.classList.add("scroll-edge--pulse");
  }

  window.addEventListener("wheel", (e) => {
    if (e.deltaY < -2 && atTop()) pulse(top, "top");
    else if (e.deltaY > 2 && atBottom()) pulse(bot, "bottom");
  }, { passive: true });

  window.addEventListener("touchstart", (e) => {
    touchY = e.touches[0] ? e.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (touchY == null || !e.touches[0]) return;
    const dy = e.touches[0].clientY - touchY;
    if (dy > 14 && atTop()) pulse(top, "top");
    else if (dy < -14 && atBottom()) pulse(bot, "bottom");
  }, { passive: true });
  window.addEventListener("touchend", () => { touchY = null; }, { passive: true });
}

function workspaceAccent(workspace) {
  const map = { agent: "#e84a2f", plan: "#3a9ec8", capture: "#d4a03a", build: "#2a9d8f", play: "#9b6dff", people: "#e07a5f", system: "#7a8a9a", home: "#9a8ec8" };
  return map[workspace] || "#e84a2f";
}

let LAUNCH_TRANSITION_CONTROLLER = null;

function restoreLaunchSourceTiles(tile) {
  if (tile) tile.classList.remove("launcher-card--pressed", "launcher-card--launch-source-hidden");
  document.querySelectorAll(".launcher-card--pressed, .launcher-card--launch-source-hidden").forEach(card => {
    card.classList.remove("launcher-card--pressed", "launcher-card--launch-source-hidden");
  });
}

function beginLaunchTransition() {
  if (LAUNCH_TRANSITION_CONTROLLER) {
    LAUNCH_TRANSITION_CONTROLLER.abort();
    restoreLaunchSourceTiles();
  }
  LAUNCH_TRANSITION_CONTROLLER = new AbortController();
  return LAUNCH_TRANSITION_CONTROLLER;
}

function cancelLaunchTransition() {
  if (LAUNCH_TRANSITION_CONTROLLER) LAUNCH_TRANSITION_CONTROLLER.abort();
  restoreLaunchSourceTiles();
  LAUNCH_TRANSITION_CONTROLLER = null;
  LAUNCH_ANIMATING = false;
}

function launchDelay(ms, signal) {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function resetLaunchOverlay(overlay, tile) {
  if (overlay) {
    overlay.className = "launch-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = "";
    overlay.style.removeProperty("--launch-accent");
    overlay.style.removeProperty("--exit-target");
  }
  restoreLaunchSourceTiles(tile);
}

function navigateToTab(tab) {
  if (tab === ACTIVE_TAB) return Promise.resolve();
  recordActivity("nav", tab, `from ${ACTIVE_TAB}`);
  saveAppLastContext(ACTIVE_TAB);
  SCROLL_POS[ACTIVE_TAB] = window.scrollY;
  NAV_DIR = tabNavDirection(ACTIVE_TAB, tab);
  NAV_HISTORY.push(ACTIVE_TAB);
  NAV_FORWARD = [];
  ACTIVE_TAB = tab;
  observeActiveTab();
  return render();
}

async function playHomeExitTransition() {
  const overlay = document.getElementById("launch-overlay");
  if (!overlay || !launchAnimEnabled()) return true;
  const controller = beginLaunchTransition();
  const signal = controller.signal;
  try {
    overlay.style.setProperty("--launch-accent", workspaceAccent(workspaceForTab(ACTIVE_TAB)));
    overlay.innerHTML = `
      <div class="launch-backdrop launch-exit-backdrop"></div>
      <div class="launch-wash launch-wash--exit"></div>`;
    overlay.className = "launch-overlay launch-overlay--exit launch-exit-phase-dim";
    overlay.setAttribute("aria-hidden", "false");
    if (!await launchDelay(200, signal)) return false;
    return true;
  } finally {
    if (LAUNCH_TRANSITION_CONTROLLER === controller) {
      resetLaunchOverlay(overlay);
      LAUNCH_TRANSITION_CONTROLLER = null;
    }
  }
}

async function playLaunchTransition(app, tile, targetTab) {
  const destTab = targetTab || app.defaultTab;
  const overlay = document.getElementById("launch-overlay");
  if (!overlay || !tile || !launchAnimEnabled()) {
    if (app.action === "automation-studio") {
      AUTOMATION_STUDIO_OPEN = true;
      renderAutomationStudioView();
      return;
    }
    await navigateToTab(destTab);
    return;
  }
  const controller = beginLaunchTransition();
  const signal = controller.signal;
  LAUNCH_ANIMATING = true;
  const rect = tile.getBoundingClientRect();
  const targetWidth = Math.max(rect.width, Math.min(window.innerWidth * 0.92, 520));
  const targetHeight = Math.max(rect.height, Math.min(window.innerHeight * 0.72, 420));
  const launchDx = (window.innerWidth - targetWidth) / 2 - rect.left;
  const launchDy = (window.innerHeight - targetHeight) / 2 - rect.top;
  overlay.style.setProperty("--launch-accent", workspaceAccent(app.workspace));
  overlay.innerHTML = `
    <div class="launch-backdrop"></div>
    <div class="launch-ghost" style="width:${rect.width}px;height:${rect.height}px;--launch-x:${rect.left}px;--launch-y:${rect.top}px;--launch-dx:${launchDx}px;--launch-dy:${launchDy}px;--launch-width:${targetWidth}px;--launch-height:${targetHeight}px">
      <div class="launch-ghost-inner">${tile.innerHTML}</div>
    </div>
    <div class="launch-wash"></div>`;
  try {
    tile.classList.add("launcher-card--pressed", "launcher-card--launch-source-hidden");
    overlay.className = "launch-overlay launch-overlay--active launch-phase-darken";
    overlay.setAttribute("aria-hidden", "false");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (signal.aborted) return;
    overlay.classList.add("launch-phase-expand");
    if (!await launchDelay(280, signal)) return;
    saveAppLastContext(ACTIVE_TAB);
    SCROLL_POS[ACTIVE_TAB] = window.scrollY;
    NAV_HISTORY.push(ACTIVE_TAB);
    NAV_FORWARD = [];
    if (app.action === "automation-studio") {
      AUTOMATION_STUDIO_OPEN = true;
      await renderAutomationStudioView();
    } else {
      ACTIVE_TAB = destTab;
      observeActiveTab();
      await render();
    }
    if (signal.aborted) return;
    overlay.classList.add("launch-overlay--inert", "launch-phase-out");
    if (!await launchDelay(180, signal)) return;
  } finally {
    restoreLaunchSourceTiles(tile);
    if (LAUNCH_TRANSITION_CONTROLLER === controller) {
      resetLaunchOverlay(overlay, tile);
      LAUNCH_TRANSITION_CONTROLLER = null;
      LAUNCH_ANIMATING = false;
    }
  }
}

async function openApp(appId, sourceEl, targetTab) {
  const app = WORKSPACE_APPS.find(a => a.id === appId);
  if (!app || LAUNCH_ANIMATING) return;
  rememberLauncherLastApp(appId);
  if (isAppHidden(appId) && !targetTab) {
    if (typeof showToast === "function") showToast("App is hidden — unhide it in Settings → Apps & appearance", "info");
    return;
  }
  const destTab = targetTab || app.defaultTab;
  if (app.action === "automation-studio") {
    const tile = sourceEl || document.querySelector(`.launcher-card[data-app="${appId}"]`);
    if (ACTIVE_TAB === "Home" && tile) { await playLaunchTransition(app, tile, destTab); return; }
    AUTOMATION_STUDIO_OPEN = true;
    renderAutomationStudioView();
    return;
  }
  if (ACTIVE_TAB === "Home") {
    const tile = sourceEl || document.querySelector(`.launcher-card[data-app="${appId}"]`);
    if (tile) { await playLaunchTransition(app, tile, destTab); return; }
  }
  await navigateToTab(destTab);
}

function launcherBadgeHtml(app) {
  let count = 0;
  if (app.badgeTab && NAV_BADGES[app.badgeTab]) count = NAV_BADGES[app.badgeTab];
  else if (app.badgeKey === "plannerOverdue" && LAUNCHER_BADGES.plannerOverdue) count = LAUNCHER_BADGES.plannerOverdue;
  let ember = "";
  if (app.id === "hub") {
    const quests = launcherReadQuestRadar();
    const chestReady = !!(quests && (quests.chestReady || quests.rewardReady));
    const unfinished = !!(quests && quests.total > 0 && quests.done < quests.total);
    if (chestReady || unfinished) {
      const title = chestReady ? "Daily chest ready to claim" : "Daily pursuits unfinished";
      ember = `<span class="launcher-card-ember${chestReady ? " launcher-card-ember--chest" : ""}${count ? " launcher-card-ember--with-badge" : ""}" title="${title}" aria-label="${title}"></span>`;
    }
  } else if (app.id === "planner") {
    let paintedToday = false;
    try {
      const state = JSON.parse(localStorage.getItem("gameQuests") || "null");
      paintedToday = !!(state && state.date === localYmd() && Number(state.counters?.paint6 || 0) > 0);
    } catch (_) {}
    if (!paintedToday) {
      ember = `<span class="launcher-card-ember${count ? " launcher-card-ember--with-badge" : ""}" title="Today is not painted yet" aria-label="Today is not painted yet"></span>`;
    }
  }
  return `${count ? `<span class="launcher-tile-badge">${count}</span>` : ""}${ember}`;
}

function normalizeHomeSpots(raw) {
  const count = homeSpotCount();
  const valid = new Set(HOME_SPOT_OPTIONS.map(o => o.key));
  const spots = (Array.isArray(raw) ? raw : [])
    .map(k => String(k))
    .filter(k => valid.has(k))
    .slice(0, count);
  while (spots.length < count) spots.push("blank");
  return spots;
}

function readHomeSpots() {
  try {
    const raw = JSON.parse(localStorage.getItem("homeSpots") || "null");
    if (Array.isArray(raw) && raw.length >= 4) return normalizeHomeSpots(raw);
  } catch (_) {}
  return normalizeHomeSpots(HOME_SPOT_DEFAULTS);
}

function saveHomeSpots(spots) {
  try { localStorage.setItem("homeSpots", JSON.stringify(normalizeHomeSpots(spots))); } catch (_) {}
}

function resetHomeSpots() {
  saveHomeSpots(HOME_SPOT_DEFAULTS);
  updateLauncherSpotDisplays();
}

function launcherSpotTruncate(text, max = 22) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function launcherNextCalendarEvent(calEvents, scoutEvents, today) {
  const candidates = [];
  (calEvents || []).forEach(ev => {
    if (ev.date && ev.date >= today) {
      candidates.push({ title: ev.title || "Event", date: ev.date, time: ev.time || ev.start_time || "" });
    }
  });
  (scoutEvents || []).forEach(ev => {
    const start = ev.date || "";
    const end = ev.end_date || start;
    if (start && end >= today) candidates.push({ title: ev.title || "Event", date: start, time: "" });
  });
  candidates.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return candidates[0] || null;
}

function launcherSpotValue(key) {
  const d = LAUNCHER_SPOT_DATA;
  const planner = LAUNCHER_STATS.planner || {};
  const arcade = LAUNCHER_STATS.arcade || {};
  const opt = HOME_SPOT_OPTIONS.find(o => o.key === key) || HOME_SPOT_OPTIONS[HOME_SPOT_OPTIONS.length - 1];
  switch (key) {
    case "most_urgent_task": {
      const t = d.mostUrgentTask;
      return {
        label: opt.label,
        value: t ? launcherSpotTruncate(t.title) : "All clear",
        tab: "Tasks",
      };
    }
    case "overdue_count": {
      const n = planner.overdue || 0;
      return { label: opt.label, value: n ? String(n) : "None", tab: "Tasks" };
    }
    case "due_today": {
      const n = planner.dueToday || 0;
      return { label: opt.label, value: n ? String(n) : "None", tab: "Tasks" };
    }
    case "today_pulse": {
      const count = d.pulseCount || 0;
      let value = "Not yet";
      if (count && d.pulseLast != null) value = `${count} · ${d.pulseLast}/10`;
      else if (count) value = `${count} logged`;
      return { label: opt.label, value, tab: "Today" };
    }
    case "practice_streak":
      return { label: opt.label, value: arcade.streak ? `${arcade.streak}d` : "—", tab: "Practice" };
    case "trophies": {
      const n = arcade.trophies || 0;
      return { label: opt.label, value: n ? `🏆 ${n}` : "—", tab: "Practice" };
    }
    case "coins": {
      const coins = d.coins != null ? d.coins : (arcade.points || 0);
      return { label: opt.label, value: `◉ ${Number(coins).toLocaleString()}`, tab: "Practice" };
    }
    case "next_calendar":
      return {
        label: opt.label,
        value: d.nextEvent ? launcherSpotTruncate(d.nextEvent.title) : "Clear",
        tab: "Calendar",
      };
    case "active_project":
      return {
        label: opt.label,
        value: d.activeProject ? launcherSpotTruncate(d.activeProject.name) : "None",
        tab: "Projects",
      };
    case "inbox_thoughts": {
      const capture = LAUNCHER_STATS.capture || {};
      const n = capture.inbox || 0;
      return { label: opt.label, value: n ? String(n) : "Empty", tab: "Thinking" };
    }
    case "open_problems": {
      const capture = LAUNCHER_STATS.capture || {};
      const n = capture.problems || 0;
      return { label: opt.label, value: n ? String(n) : "None", tab: "Problems" };
    }
    case "parallel_quests": {
      const parallel = LAUNCHER_STATS.parallel || {};
      const n = parallel.quests || 0;
      return { label: opt.label, value: n ? String(n) : "—", tab: "Parallel" };
    }
    case "contacts_stale": {
      const people = LAUNCHER_STATS.people || {};
      const n = people.stale || 0;
      return { label: opt.label, value: n ? String(n) : "None", tab: "Contacts" };
    }
    case "workflows": {
      const blueprint = LAUNCHER_STATS.blueprint || {};
      const n = blueprint.count || 0;
      return { label: opt.label, value: n ? String(n) : "—", tab: "Projects" };
    }
    case "daily_quests": {
      const q = launcherReadQuestRadar();
      return { label: opt.label, value: q ? launcherQuestRadarLabel(q) : "—", tab: "Hub" };
    }
    case "agent_pending": {
      const pending = NAV_BADGES.Agent || 0;
      return { label: opt.label, value: pending ? `${pending} pending` : "Clear", tab: "Agent" };
    }
    case "blank":
    default:
      return { label: "—", value: "", tab: null };
  }
}

function launcherSpotCellHtml(key, index) {
  const info = launcherSpotValue(key);
  const blank = key === "blank";
  return `<button type="button" class="launcher-spot${blank ? " launcher-spot--blank" : ""}${LAUNCHER_SPOTS_CUSTOMIZE ? " launcher-spot--customize" : ""}"
    data-spot-index="${index}" data-spot-key="${escapeHtml(key)}" data-spot-tab="${info.tab || ""}"
    ${blank ? 'aria-hidden="true" tabindex="-1"' : `aria-label="${escapeHtml(info.label)}: ${escapeHtml(info.value || "empty")}"`}>
    <span class="launcher-spot-label">${escapeHtml(info.label)}</span>
    <span class="launcher-spot-value">${escapeHtml(info.value)}</span>
  </button>`;
}

function ensureLauncherSpotsStyles() {
  if (document.getElementById("launcher-spots-styles")) return;
  const style = document.createElement("style");
  style.id = "launcher-spots-styles";
  style.textContent = `
    .launcher-spots-grid--count-6, .launcher-spots-grid--count-7 { grid-template-columns: repeat(var(--home-pin-count, 6), minmax(0, 1fr)); }
    @media (max-width: 900px) {
      .launcher-spots-grid--count-6, .launcher-spots-grid--count-7 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
      .launcher-spots-grid--count-6, .launcher-spots-grid--count-7 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .launcher-spots-actions {
      display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
      margin-top: 8px;
    }
    .launcher-spots-hint {
      margin: 0; font-size: 11px; color: var(--ink-secondary); text-align: center;
      width: 100%;
    }
    .launcher-spots-reset {
      font-size: 11px; font-weight: 600; color: var(--ink-secondary); background: none; border: none;
      cursor: pointer; text-decoration: underline; text-underline-offset: 2px; padding: 4px 6px;
    }
    .launcher-spots-reset:hover { color: var(--ink-primary); }
    .launcher-spots-actions .launcher-spots-customize,
    .launcher-spots-actions .launcher-spots-reset {
      opacity: 0.42;
      transition: opacity 140ms ease, color 120ms ease, background 120ms ease;
    }
    .launcher-spots-actions:hover .launcher-spots-customize,
    .launcher-spots-actions:hover .launcher-spots-reset,
    .launcher-spots-actions:focus-within .launcher-spots-customize,
    .launcher-spots-actions:focus-within .launcher-spots-reset,
    .launcher-spots-customize[aria-pressed="true"] {
      opacity: 1;
    }
    html.device-coarse .launcher-spots-actions .launcher-spots-customize,
    html.device-coarse .launcher-spots-actions .launcher-spots-reset {
      opacity: 1;
    }
    @media (hover:none), (pointer:coarse) {
      .launcher-spots-actions .launcher-spots-customize,
      .launcher-spots-actions .launcher-spots-reset { opacity: 1; }
    }
    .launcher-spot--customize::after {
      content: "↻"; position: absolute; top: 4px; right: 6px; font-size: 10px; opacity: 0.55;
    }
    .launcher-spot { position: relative; }
    .launcher-my-apps-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px; width: 100%; max-width: min(900px, 100%); margin: 0 auto;
    }
    .launcher-custom-app {
      min-height: 108px; border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
      background: linear-gradient(165deg, color-mix(in srgb, var(--bg-card) 94%, var(--accent) 6%), var(--bg-card));
      box-shadow: var(--plate-shadow);
    }
    .launcher-custom-app:hover,
    .launcher-custom-app:focus-visible {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
      transform: translateY(-3px);
    }
    .launcher-custom-app-emoji { font-size: 32px; }
    .launcher-custom-app-name { max-width: 12ch; font-size: 12px; color: var(--ink-primary); }
    .launcher-custom-app-sub {
      font-size: 10px; font-weight: 500; color: var(--ink-secondary); line-height: 1.2;
    }
    .launcher-custom-app--disabled { opacity: 0.45; cursor: not-allowed; }
    .launcher-custom-app--hidden { display: none !important; }
    .launcher-dock-tab--pulse::after {
      content: ""; display: inline-block; width: 6px; height: 6px; margin-left: 5px;
      border-radius: 50%; background: var(--accent); vertical-align: middle;
    }`;
  document.head.appendChild(style);
}

function launcherSpotsHtml() {
  ensureLauncherSpotsStyles();
  const spots = readHomeSpots();
  const customizeHint = LAUNCHER_SPOTS_CUSTOMIZE
    ? `<p class="launcher-spots-hint" id="launcher-spots-hint">Tap a spot to cycle metrics — blank hides it</p>`
    : "";
  return `<div class="launcher-spots-bar" id="launcher-spots">
    <div class="launcher-spots-grid launcher-spots-grid--count-${spots.length}${LAUNCHER_SPOTS_CUSTOMIZE ? " launcher-spots-grid--customize" : ""}" style="--home-pin-count:${spots.length}" role="group" aria-label="Home shortcuts">
      ${spots.map((key, i) => launcherSpotCellHtml(key, i)).join("")}
    </div>
    <div class="launcher-spots-actions">
      ${customizeHint}
      <button type="button" class="launcher-spots-customize" id="launcher-spots-customize" aria-pressed="${LAUNCHER_SPOTS_CUSTOMIZE ? "true" : "false"}">${LAUNCHER_SPOTS_CUSTOMIZE ? "Done" : "Customize pins"}</button>
      ${LAUNCHER_SPOTS_CUSTOMIZE ? `<button type="button" class="launcher-spots-reset" id="launcher-spots-reset" title="Reset pins to defaults">Reset</button>` : ""}
    </div>
  </div>`;
}

function updateLauncherSpotDisplays() {
  if (ACTIVE_TAB !== "Home") return;
  const bar = document.getElementById("launcher-spots");
  if (!bar) return;
  const spots = readHomeSpots();
  bar.querySelectorAll(".launcher-spot").forEach((btn, i) => {
    const key = spots[i] || "blank";
    const info = launcherSpotValue(key);
    btn.dataset.spotKey = key;
    btn.dataset.spotTab = info.tab || "";
    btn.classList.toggle("launcher-spot--blank", key === "blank");
    btn.classList.toggle("launcher-spot--customize", LAUNCHER_SPOTS_CUSTOMIZE);
    if (key === "blank") {
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
    } else {
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
      btn.setAttribute("aria-label", `${info.label}: ${info.value || "empty"}`);
    }
    const label = btn.querySelector(".launcher-spot-label");
    const value = btn.querySelector(".launcher-spot-value");
    if (label) label.textContent = info.label;
    if (value) value.textContent = info.value;
  });
}

function updateLauncherSpotCustomizeUi() {
  const customizeBtn = document.getElementById("launcher-spots-customize");
  const grid = document.querySelector(".launcher-spots-grid");
  const bar = document.getElementById("launcher-spots");
  if (!bar || !grid) return;
  const actions = bar.querySelector(".launcher-spots-actions");
  if (customizeBtn) {
    customizeBtn.textContent = LAUNCHER_SPOTS_CUSTOMIZE ? "Done" : "Customize pins";
    customizeBtn.setAttribute("aria-pressed", LAUNCHER_SPOTS_CUSTOMIZE ? "true" : "false");
  }
  grid.classList.toggle("launcher-spots-grid--customize", LAUNCHER_SPOTS_CUSTOMIZE);
  grid.querySelectorAll(".launcher-spot").forEach(btn => {
    btn.classList.toggle("launcher-spot--customize", LAUNCHER_SPOTS_CUSTOMIZE);
  });
  let hint = document.getElementById("launcher-spots-hint");
  let resetBtn = document.getElementById("launcher-spots-reset");
  if (LAUNCHER_SPOTS_CUSTOMIZE) {
    if (!hint && actions) {
      actions.insertAdjacentHTML("afterbegin", `<p class="launcher-spots-hint" id="launcher-spots-hint">Tap a spot to cycle metrics — blank hides it</p>`);
    }
    if (!resetBtn && actions) {
      actions.insertAdjacentHTML("beforeend", `<button type="button" class="launcher-spots-reset" id="launcher-spots-reset" title="Reset pins to defaults">Reset</button>`);
      resetBtn = document.getElementById("launcher-spots-reset");
      if (resetBtn) {
        resetBtn.onclick = () => {
          resetHomeSpots();
          if (typeof showToast === "function") showToast("Home pins reset", "info", 1200);
        };
      }
    }
  } else {
    if (hint) hint.remove();
    if (resetBtn) resetBtn.remove();
  }
}

function cycleHomeSpot(index) {
  const spots = readHomeSpots();
  const keys = HOME_SPOT_OPTIONS.map(o => o.key);
  const cur = spots[index] || "blank";
  const nextIdx = (keys.indexOf(cur) + 1) % keys.length;
  spots[index] = keys[nextIdx];
  saveHomeSpots(spots);
  updateLauncherSpotDisplays();
  const label = (HOME_SPOT_OPTIONS.find(o => o.key === spots[index]) || {}).label || spots[index];
  if (typeof showToast === "function") showToast(`Pinned: ${label}`, "info", 1200);
}

function wireLauncherSpots() {
  const customizeBtn = document.getElementById("launcher-spots-customize");
  const resetBtn = document.getElementById("launcher-spots-reset");
  const grid = document.querySelector(".launcher-spots-grid");
  if (!grid) return;
  if (customizeBtn) {
    customizeBtn.onclick = () => {
      LAUNCHER_SPOTS_CUSTOMIZE = !LAUNCHER_SPOTS_CUSTOMIZE;
      updateLauncherSpotCustomizeUi();
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      resetHomeSpots();
      if (typeof showToast === "function") showToast("Home pins reset", "info", 1200);
    };
  }
  grid.querySelectorAll(".launcher-spot").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.spotIndex);
      if (LAUNCHER_SPOTS_CUSTOMIZE) {
        cycleHomeSpot(idx);
        return;
      }
      const tab = btn.dataset.spotTab;
      if (tab) goToTab(tab);
    };
  });
}

async function refreshLauncherBadges() {
  const today = localYmd();
  if (LAUNCHER_BADGES.plannerOverdue === null) {
    try {
      const tasks = await api("/api/tasks");
      const open = tasks.filter(t => t.status === "todo" || t.status === "partial");
      LAUNCHER_BADGES.plannerOverdue = open.filter(t => t.due_date && t.due_date < today).length;
      const dueToday = open.filter(t => t.due_date === today).length;
      LAUNCHER_STATS.planner = { overdue: LAUNCHER_BADGES.plannerOverdue, dueToday };
      if (open.length) {
        const sorted = [...open].sort((a, b) => {
          const sa = typeof taskFocusMeta === "function" ? taskFocusMeta(a, today).score : 0;
          const sb = typeof taskFocusMeta === "function" ? taskFocusMeta(b, today).score : 0;
          return sb - sa;
        });
        LAUNCHER_SPOT_DATA.mostUrgentTask = sorted[0];
      } else {
        LAUNCHER_SPOT_DATA.mostUrgentTask = null;
      }
    } catch (_) { /* lazy — skip on failure */ }
  }
  try {
    const s = await api("/api/practice/summary");
    LAUNCHER_STATS.arcade = { points: s.points, streak: s.streak, attempts: s.total_attempts };
  } catch (_) {}
  try {
    const p = await api("/api/parallel/state");
    if (p.ready && p.state_summary) {
      const sum = p.state_summary;
      const quests = (sum.quests && sum.quests.active) ? sum.quests.active.length : 0;
      LAUNCHER_STATS.parallel = {
        location: sum.player && sum.player.location ? sum.player.location : null,
        quests,
      };
    }
  } catch (_) {}
  try {
    const wfs = await api("/api/workflows");
    const list = Array.isArray(wfs) ? wfs : [];
    const latest = list[0];
    LAUNCHER_STATS.blueprint = {
      count: list.length,
      name: latest ? (latest.name || latest.title || "Untitled") : null,
      nodes: latest && latest.graph && latest.graph.nodes ? latest.graph.nodes.length : null,
    };
  } catch (_) {}
  try {
    const thinking = await api("/api/lists/thinking");
    const problems = await api("/api/lists/problem").catch(() => []);
    LAUNCHER_STATS.capture = {
      inbox: Array.isArray(thinking) ? thinking.length : 0,
      problems: Array.isArray(problems) ? problems.filter(p => p.status !== "done").length : 0,
    };
  } catch (_) {}
  try {
    const contacts = await api("/api/contacts");
    const today = localYmd();
    const stale = contacts.filter(c => c.last_contact && c.last_contact < today).length;
    LAUNCHER_STATS.people = { total: contacts.length, stale };
  } catch (_) {}
  LAUNCHER_STATS.arcade = LAUNCHER_STATS.arcade || {};
  LAUNCHER_STATS.arcade.trophies = hudReadTrophies();
  try {
    const pulses = await api(`/api/pulses?date=${encodeURIComponent(today)}`);
    LAUNCHER_SPOT_DATA.pulseCount = Array.isArray(pulses) ? pulses.length : 0;
    LAUNCHER_SPOT_DATA.pulseLast = pulses && pulses.length ? pulses[pulses.length - 1].happiness : null;
  } catch (_) {}
  try {
    const coinsRes = await fetch("/api/coins").then(r => r.ok ? r.json() : null).catch(() => null);
    LAUNCHER_SPOT_DATA.coins = coinsRes && coinsRes.balance != null ? coinsRes.balance : null;
  } catch (_) {}
  try {
    const [calEvents, scoutEvents] = await Promise.all([
      api("/api/calendar").catch(() => []),
      api("/api/events").catch(() => []),
    ]);
    LAUNCHER_SPOT_DATA.nextEvent = launcherNextCalendarEvent(calEvents, scoutEvents, today);
  } catch (_) {}
  try {
    const projects = await api("/api/projects");
    const active = (Array.isArray(projects) ? projects : []).filter(p => p.status === "active");
    let proj = null;
    try {
      const detailId = localStorage.getItem("projectDetailId");
      if (detailId) proj = active.find(p => String(p.id) === detailId);
    } catch (_) {}
    LAUNCHER_SPOT_DATA.activeProject = proj || active[0] || null;
  } catch (_) {}
  updateLauncherStatDisplays();
  updateLauncherSpotDisplays();
  updateLauncherQuestRadar();
}

const LAUNCHER_QUEST_POOL = {
  pulse2: { target: 3 },
  tasks3: { target: 2 },
  addtask2: { target: 2 },
  reflect1: { target: 1 },
  contract1: { target: 1 },
  contact1: { target: 1 },
  match1: { target: 1 },
  paint6: { target: 2 },
  showup1: { target: 1 },
  estimate1: { target: 1 },
  actual1: { target: 1 },
  book1: { target: 1 },
  blueprint1: { target: 1 },
  capture3: { target: 2 },
  overdue1: { target: 1 },
  talk1: { target: 1 },
};

function launcherQuestHashDate(dateStr) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = ((h << 5) - h + dateStr.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function launcherSelectDailyQuests(dateStr) {
  const keys = Object.keys(LAUNCHER_QUEST_POOL);
  let seed = launcherQuestHashDate(dateStr);
  const pool = keys.slice();
  const picked = [];
  while (picked.length < 3 && pool.length) {
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
    seed = Math.imul(seed, 1103515245) + 12345;
  }
  return picked;
}

function launcherReadQuestRadar() {
  if (window.WaypointGame && typeof window.WaypointGame.getState === "function") {
    try {
      const game = window.WaypointGame.getState();
      const quests = Array.isArray(game.questsToday) ? game.questsToday : [];
      const done = quests.filter(q => q.done).length;
      const nextQuest = quests.find(q => !q.done);
      return {
        done,
        total: quests.length,
        rewardReady: !!game.allQuestsDone && !game.dailyRewardClaimed,
        allDone: !!game.allQuestsDone,
        claimed: !!game.dailyRewardClaimed,
        todayComplete: !!game.todayComplete,
        nextKey: nextQuest ? nextQuest.key : "",
      };
    } catch (_) {}
  }
  const today = localYmd();
  let state = null;
  try { state = JSON.parse(localStorage.getItem("gameQuests") || "null"); } catch (_) { state = null; }
  if (!state || state.date !== today) return null;
  const keys = launcherSelectDailyQuests(today);
  const counters = state.counters || {};
  const done = keys.filter(k => (counters[k] || 0) >= (LAUNCHER_QUEST_POOL[k]?.target || 1)).length;
  const allDone = keys.length === 3 && keys.every(k => (counters[k] || 0) >= (LAUNCHER_QUEST_POOL[k]?.target || 1));
  return { done, total: 3, chestReady: allDone && !state.claimed, allDone, claimed: !!state.claimed };
}

function launcherQuestRadarLabel(q) {
  if (!q) return "";
  let label = `${q.done}/${q.total}`;
  if (q.chestReady || q.rewardReady) label += " · chest";
  else if (q.allDone && q.claimed) label += " · opened";
  return label;
}

function ensureDailyQuestsAuto() {
  if (isGameFeaturesHidden()) return;
  const game = window.WaypointGame;
  if (!game || typeof game.selectQuest !== "function") return;
  let selected = [];
  try {
    const state = typeof game.getState === "function" ? game.getState() : null;
    const raw = state?.questsToday || state?.selected || [];
    selected = Array.isArray(raw) ? raw.map(item => item && (item.key || item)).filter(Boolean) : [];
  } catch (_) { selected = []; }
  if (selected.length) return;
  const keys = launcherSelectDailyQuests(localYmd());
  keys.forEach(key => {
    try { game.selectQuest(key); } catch (_) {}
  });
}

function showQuestAutoBanner() {
  if (isGameFeaturesHidden()) return;
  if (document.getElementById("wp-quest-auto-banner") || document.querySelector(".wp-quest-banner")) return;
  ensureHudTruthBreathStyles();
  const q = launcherReadQuestRadar();
  if (!q || !q.total) return;
  const el = document.createElement("div");
  el.id = "wp-quest-auto-banner";
  el.className = "wp-quest-auto-banner wp-quest-banner";
  el.setAttribute("role", "status");
  el.textContent = q.todayComplete || q.allDone
    ? "Daily quests complete"
    : `Daily quests live · ${q.done}/${q.total}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("wp-quest-auto-banner--in"));
  setTimeout(() => el.classList.add("wp-quest-auto-banner--out"), 3400);
  setTimeout(() => el.remove(), 3900);
}

function launcherQuestRadarHtml() {
  if (isGameFeaturesHidden()) return "";
  ensureDailyQuestsAuto();
  const q = launcherReadQuestRadar();
  if (!q) return "";
  const label = launcherQuestRadarLabel(q);
  const complete = q.todayComplete || q.allDone;
  const destination = q.nextKey === "match1" ? "Practice" : "quests";
  const detail = complete
    ? `All ${q.total} live and finished`
    : `${label} · already on`;
  const signature = `${q.done}-${q.total}-${complete ? 1 : 0}-${q.claimed ? 1 : 0}-${destination}`;
  return `<div class="launcher-quest-radar launcher-quest-radar--auto${complete ? " launcher-quest-radar--complete" : ""}" id="launcher-quest-radar" role="status" data-quest-destination="${destination}" data-quest-signature="${signature}"><span class="launcher-quest-radar-icon" aria-hidden="true"><i></i></span><span class="launcher-quest-radar-copy"><strong>Today's pursuits</strong><span class="launcher-quest-radar-text">${escapeHtml(detail)}</span></span><span class="launcher-quest-radar-status">${complete ? "DAY COMPLETE" : `${q.done}/${q.total}`}</span></div>`;
}

function ensureLauncherQuestRadarStyles() {
  // The full pursuit bar is styled in app.css; retained as a stable hook for older callers.
}

function updateLauncherQuestRadar() {
  if (ACTIVE_TAB !== "Home") return;
  ensureLauncherQuestRadarStyles();
  const q = launcherReadQuestRadar();
  const html = launcherQuestRadarHtml();
  const existing = document.getElementById("launcher-quest-radar");
  if (html) {
    const complete = q.todayComplete || q.allDone;
    const destination = q.nextKey === "match1" ? "Practice" : "quests";
    const signature = `${q.done}-${q.total}-${complete ? 1 : 0}-${q.claimed ? 1 : 0}-${destination}`;
    if (existing && existing.dataset.questSignature !== signature) existing.outerHTML = html;
    else {
      const stage = document.getElementById("launcher-stage");
      if (!existing && stage) stage.insertAdjacentHTML("afterend", html);
    }
  } else if (existing) existing.remove();
  const hubCard = document.querySelector('.launcher-card[data-app="hub"]');
  if (hubCard && q) {
    const host = hubCard.querySelector(".launcher-card-main") || hubCard;
    let stat = host.querySelector(".launcher-card-stat--quest");
    const label = launcherQuestRadarLabel(q);
    if (!stat) {
      const statsWrap = host.querySelector(".launcher-card-stats");
      const chip = `<span class="launcher-card-stat launcher-card-stat--quest">${escapeHtml(label)}</span>`;
      if (statsWrap) statsWrap.insertAdjacentHTML("afterbegin", chip);
      else {
        const intention = host.querySelector(".launcher-card-intention");
        const wrap = `<div class="launcher-card-stats">${chip}</div>`;
        if (intention) intention.insertAdjacentHTML("beforebegin", wrap);
        else host.insertAdjacentHTML("beforeend", wrap);
      }
    } else stat.textContent = label;
  }
}

function launcherStatHtml(app) {
  const stats = [];
  if (app.id === "planner") {
    const p = LAUNCHER_STATS.planner || {};
    if (p.overdue) stats.push(`<span class="launcher-card-stat launcher-card-stat--warn">${p.overdue} overdue</span>`);
    if (p.dueToday) stats.push(`<span class="launcher-card-stat">${p.dueToday} due today</span>`);
  }
  if (app.id === "arcade" && LAUNCHER_STATS.arcade) {
    const a = LAUNCHER_STATS.arcade;
    if (a.trophies) stats.push(`<span class="launcher-card-stat">&#127942; ${a.trophies}</span>`);
    stats.push(`<span class="launcher-card-stat">&#9673; ${(a.points || 0).toLocaleString()}</span>`);
    if (a.streak) stats.push(`<span class="launcher-card-stat">&#128293; ${a.streak}d</span>`);
  }
  if (app.id === "parallel" && LAUNCHER_STATS.parallel) {
    const p = LAUNCHER_STATS.parallel;
    if (p.quests) stats.push(`<span class="launcher-card-stat">${p.quests} quest${p.quests === 1 ? "" : "s"}</span>`);
    if (p.location) {
      const loc = p.location;
      stats.push(`<span class="launcher-card-stat">${escapeHtml(loc.length > 22 ? loc.slice(0, 20) + "…" : loc)}</span>`);
    }
  }
  if (app.id === "blueprint" && LAUNCHER_STATS.blueprint) {
    const b = LAUNCHER_STATS.blueprint;
    if (b.count) stats.push(`<span class="launcher-card-stat">${b.count} workflow${b.count === 1 ? "" : "s"}</span>`);
    if (b.nodes) stats.push(`<span class="launcher-card-stat">${b.nodes} nodes</span>`);
    else if (b.name) stats.push(`<span class="launcher-card-stat">${escapeHtml(b.name.length > 18 ? b.name.slice(0, 16) + "…" : b.name)}</span>`);
  }
  if (app.id === "capture" && LAUNCHER_STATS.capture) {
    const c = LAUNCHER_STATS.capture;
    if (c.inbox) stats.push(`<span class="launcher-card-stat">${c.inbox} thoughts</span>`);
    if (c.problems) stats.push(`<span class="launcher-card-stat">${c.problems} problems</span>`);
  }
  if (app.id === "people" && LAUNCHER_STATS.people) {
    const p = LAUNCHER_STATS.people;
    if (p.stale) stats.push(`<span class="launcher-card-stat launcher-card-stat--warn">${p.stale} stale</span>`);
    if (p.total) stats.push(`<span class="launcher-card-stat">${p.total} contacts</span>`);
  }
  if ((app.id === "agent" || app.badgeTab === "Agent") && NAV_BADGES.Agent) {
    stats.push(`<span class="launcher-card-stat launcher-card-stat--warn">${NAV_BADGES.Agent} pending</span>`);
  }
  if (app.id === "hub") {
    const q = launcherReadQuestRadar();
    if (q) stats.unshift(`<span class="launcher-card-stat launcher-card-stat--quest">${escapeHtml(launcherQuestRadarLabel(q))}</span>`);
  }
  if (!stats.length) return "";
  const primary = stats[0];
  const extra = stats.slice(1);
  return `<div class="launcher-card-stats">${primary}${extra.length ? `<span class="launcher-card-stats-extra">${extra.join("")}</span>` : ""}</div>`;
}

function updateLauncherStatDisplays() {
  if (ACTIVE_TAB !== "Home") return;
  WORKSPACE_APPS.forEach(app => {
    const card = document.querySelector(`.launcher-card[data-app="${app.id}"]`);
    if (!card) return;
    const host = card.querySelector(".launcher-card-main") || card;
    const existing = host.querySelector(".launcher-card-stats");
    const html = launcherStatHtml(app);
    if (existing) existing.remove();
    if (html) {
      const intention = host.querySelector(".launcher-card-intention");
      if (intention) intention.insertAdjacentHTML("beforebegin", html);
      else host.insertAdjacentHTML("beforeend", html);
    }
    const badge = launcherBadgeHtml(app);
    card.querySelectorAll(".launcher-tile-badge, .launcher-card-ember").forEach(el => el.remove());
    if (badge) card.insertAdjacentHTML("beforeend", badge);
  });
}

function ensureLauncherDockStyles() {
  if (document.getElementById("launcher-dock-styles")) return;
  const style = document.createElement("style");
  style.id = "launcher-dock-styles";
  style.textContent = `
    .launcher-dock { width: 100%; max-width: min(1400px, 100vw); margin: 0 auto; }
    .launcher-dock-tabs {
      display: flex; justify-content: center; gap: 6px; margin: 0 0 14px; flex-wrap: wrap;
    }
    .launcher-dock-tab {
      font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border);
      background: transparent; color: var(--ink-secondary); cursor: pointer;
      transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
    }
    .launcher-dock-tab:hover { color: var(--ink-primary); border-color: var(--ink-secondary); background: transparent; }
    .launcher-dock-tab.active {
      color: var(--accent-ink, #fff); background: var(--accent); border-color: var(--accent);
    }
    .launcher-dock-panel { width: 100%; }
    .launcher-dock-panel[hidden] { display: none !important; }
    .launcher-my-apps-empty {
      margin: 0; padding: 28px 16px; text-align: center; font-size: 13px; line-height: 1.55;
      color: var(--ink-secondary); border: 1px dashed var(--border); border-radius: 14px;
      background: color-mix(in srgb, var(--bg-card) 92%, var(--accent) 8%);
    }
    .launcher-my-apps-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.45; color: var(--ink-secondary); text-align: center; }`;
  document.head.appendChild(style);
}

function setLauncherDockTab(tab) {
  LAUNCHER_DOCK_TAB = tab === "myapps" ? "myapps" : "workspace";
  localStorage.launcherDockTab = LAUNCHER_DOCK_TAB;
  const workspacePanel = document.getElementById("launcher-dock-workspace");
  const myAppsPanel = document.getElementById("launcher-dock-myapps");
  document.querySelectorAll(".launcher-dock-tab").forEach(btn => {
    const active = btn.dataset.dock === LAUNCHER_DOCK_TAB;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (workspacePanel) workspacePanel.hidden = LAUNCHER_DOCK_TAB !== "workspace";
  if (myAppsPanel) myAppsPanel.hidden = LAUNCHER_DOCK_TAB !== "myapps";
}

function launcherAppMark(id) {
  if (typeof window.wpAppMark === "function") return window.wpAppMark(id);
  const apps = typeof WORKSPACE_APPS !== "undefined" ? WORKSPACE_APPS : [];
  const app = apps.find(item => item && item.id === id);
  return (app && app.glyph) || "●";
}

function renderCustomAppsSection(apps) {
  const list = Array.isArray(apps) ? apps : [];
  const tiles = list.length
    ? `<div class="launcher-my-apps-grid" role="list">
        ${list.map(app => {
          const wfId = app.workflow_id != null ? String(app.workflow_id).trim() : "";
          const disabled = !wfId;
          return `
          <button type="button" class="launcher-custom-app${disabled ? " launcher-custom-app--disabled" : ""}"
            data-workflow-id="${escapeHtml(wfId)}"
            data-app-name="${escapeHtml((app.name || "").toLowerCase())}"
            role="listitem"
            ${disabled ? 'disabled title="No workflow linked — republish from Blueprint"' : `title="Open ${escapeHtml(app.name || "app")}"`}>
            <span class="launcher-custom-app-emoji" aria-hidden="true">${escapeHtml(app.emoji || "📱")}</span>
            <span class="launcher-custom-app-name">${escapeHtml(app.name || "Untitled")}</span>
            <span class="launcher-custom-app-sub">${disabled ? "Needs republish" : "Open app"}</span>
          </button>`;
        }).join("")}
      </div>`
    : `<p class="launcher-my-apps-empty">No published apps yet.<br>Publish from Blueprint to appear here.</p>`;
  return `
        <div class="launcher-my-apps" aria-label="My apps">
          <p class="launcher-my-apps-hint">Published Blueprint apps — Python workflows you ship as tabs. Click to open.</p>
          ${tiles}
        </div>`;
}

async function renderLauncher() {
  ensureLauncherDockStyles();
  ensureHudTruthBreathStyles();
  applyGameFeatureChrome();
  const customApps = await withLaunchPrecalc(async () => {
    refreshLauncherBadges();
    return refreshCustomApps();
  });
  const now = new Date();
  const greeting = launcherGreeting();
  // Hide My apps tab when empty — never strand the dock on a blank panel.
  if (!customApps.length && LAUNCHER_DOCK_TAB === "myapps") {
    LAUNCHER_DOCK_TAB = "workspace";
    localStorage.launcherDockTab = "workspace";
  }
  const isWorkspace = LAUNCHER_DOCK_TAB !== "myapps" || !customApps.length;
  const myAppsTab = customApps.length
    ? `<button type="button" class="launcher-dock-tab${!isWorkspace ? " active" : ""} launcher-dock-tab--pulse" data-dock="myapps" role="tab" aria-selected="${!isWorkspace ? "true" : "false"}">${escapeHtml(`${typeof t === "function" ? t("launcher.myApps") : "My apps"} (${customApps.length})`)}</button>`
    : "";
  const apps = visibleWorkspaceApps();
  const lastApp = readLauncherLastApp();
  const lastIdx = Math.max(0, apps.findIndex(a => a.id === lastApp));
  return `
    <section class="launcher-cinematic" id="launcher-cinematic" aria-label="App launcher">
      <canvas class="launcher-ambient" id="launcher-ambient" aria-hidden="true"></canvas>
      <div class="launcher-cinematic-vignette" aria-hidden="true"></div>
      <div class="launcher-cinematic-inner">
        <header class="launcher-header launcher-cinematic-header">
          ${!isGameFeaturesHidden() && window.WaypointLoot && typeof window.WaypointLoot.profileHtml === "function" ? window.WaypointLoot.profileHtml() : ""}
          <h1 class="launcher-title">${escapeHtml(greeting)}</h1>
          <p class="launcher-subtitle" data-i18n="launcher.subtitle">Choose a world — search or tap a tile to launch.</p>
          <div class="launcher-search-bar" role="search">
            <input type="search" id="app-search-input" class="app-search-input launcher-search-input" data-i18n-placeholder="launcher.searchPlaceholder" placeholder="Search apps…" autocomplete="off" spellcheck="false" data-i18n-aria="launcher.searchAria" aria-label="Search apps" />
            <button type="button" class="launcher-share-app" id="launcher-share-app" title="Copy a local or Tailscale link">Send app</button>
          </div>
        </header>
        ${launcherSpotsHtml()}
        <div class="launcher-dock">
          <div class="launcher-dock-tabs" role="tablist" aria-label="Launcher views">
            <button type="button" class="launcher-dock-tab${isWorkspace ? " active" : ""}" data-dock="workspace" role="tab" aria-selected="${isWorkspace ? "true" : "false"}">${escapeHtml(typeof t === "function" ? t("launcher.apps") : "Apps")}</button>
            ${myAppsTab}
          </div>
          <div id="launcher-dock-workspace" class="launcher-dock-panel"${!isWorkspace ? " hidden" : ""}>
        <div class="launcher-stage" id="launcher-stage" role="listbox" aria-label="Apps">
          ${apps.map((app, i) => `
            <button type="button" class="launcher-card launcher-tile" data-app="${app.id}" data-workspace="${app.workspace}"
              tabindex="${i === lastIdx ? "0" : "-1"}" role="option" aria-selected="${i === lastIdx ? "true" : "false"}"
              style="--tile-accent: ${workspaceAccent(app.workspace)}; animation-delay: ${(i * 0.05).toFixed(2)}s"
              title="Open ${escapeHtml(appLabel(app))}${app.id === "blueprint" ? " (Automation Studio)" : ""}"
              data-intention="${escapeHtml(app.intention || PAGE_INTENTS[app.defaultTab]?.title || "")}">
              <div class="launcher-card-main">
                <span class="launcher-tile-glyph launcher-card-glyph" aria-hidden="true">${launcherAppMark(app.id)}</span>
                <span class="launcher-tile-name launcher-card-name">${escapeHtml(appLabel(app))}</span>
                ${launcherLastContextHtml(app)}
                ${launcherStatHtml(app)}
                ${app.subtitle ? `<span class="launcher-tile-sub launcher-card-sub">${escapeHtml(app.subtitle)}</span>` : ""}
                <span class="launcher-card-intention">${escapeHtml(app.intention || "")}</span>
              </div>
              ${launcherBadgeHtml(app)}
            </button>
          `).join("")}
        </div>
        ${launcherQuestRadarHtml()}
          </div>
          <div id="launcher-dock-myapps" class="launcher-dock-panel"${isWorkspace ? " hidden" : ""}>
        ${renderCustomAppsSection(customApps)}
          </div>
        </div>
      </div>
    </section>`;
}

function stopLauncherAmbient() {
  if (LAUNCHER_AMBIENT_RAF) { cancelAnimationFrame(LAUNCHER_AMBIENT_RAF); LAUNCHER_AMBIENT_RAF = null; }
  if (LAUNCHER_AMBIENT_CLEANUP) {
    LAUNCHER_AMBIENT_CLEANUP();
    LAUNCHER_AMBIENT_CLEANUP = null;
  }
}

function startLauncherAmbient() {
  stopLauncherAmbient();
  if (prefersReducedMotion() || LAUNCHER_AMBIENT_PAUSED) return;
  const canvas = document.getElementById("launcher-ambient");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const particles = Array.from({ length: 48 }, () => ({
    x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.5,
    vx: (Math.random() - 0.5) * 0.00035, vy: (Math.random() - 0.5) * 0.00028,
    hue: 20 + Math.random() * 280, a: 0.08 + Math.random() * 0.22,
  }));
  const draw = () => {
    if (!canvas.isConnected || ACTIVE_TAB !== "Home") {
      stopLauncherAmbient();
      return;
    }
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(120, 180, 220, 0.06)");
    g.addColorStop(0.5, "rgba(154, 142, 200, 0.05)");
    g.addColorStop(1, "rgba(232, 74, 47, 0.04)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
      if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 70%, 68%, ${p.a})`;
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    LAUNCHER_AMBIENT_RAF = requestAnimationFrame(draw);
  };
  draw();
  window.addEventListener("resize", resize);
  LAUNCHER_AMBIENT_CLEANUP = () => window.removeEventListener("resize", resize);
}

function setLauncherAmbientPaused(paused) {
  LAUNCHER_AMBIENT_PAUSED = Boolean(paused);
  if (LAUNCHER_AMBIENT_PAUSED) {
    stopLauncherAmbient();
    const canvas = document.getElementById("launcher-ambient");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  } else if (ACTIVE_TAB === "Home") {
    startLauncherAmbient();
  }
}

window.setLauncherAmbientPaused = setLauncherAmbientPaused;

function wireLauncherParallax() {
  const stage = document.getElementById("launcher-stage");
  if (!stage || prefersReducedMotion()) return;
  stage.addEventListener("mousemove", e => {
    const card = e.target.closest(".launcher-card");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--tilt-x", `${(-py * 10).toFixed(2)}deg`);
    card.style.setProperty("--tilt-y", `${(px * 10).toFixed(2)}deg`);
  });
  stage.addEventListener("mouseleave", () => {
    stage.querySelectorAll(".launcher-card").forEach(card => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  });
}

function wireLauncherCustomApps() {
  document.querySelectorAll(".launcher-custom-app:not(.launcher-custom-app--disabled)").forEach(btn => {
    btn.onclick = () => openCustomApp(btn.dataset.workflowId);
  });
}

function wireLauncher() {
  const cards = Array.from(document.querySelectorAll(".launcher-card"));
  const stage = document.getElementById("launcher-stage");
  let focusIndex = 0;

  const setFocus = idx => {
    if (!cards.length) return;
    focusIndex = ((idx % cards.length) + cards.length) % cards.length;
    LAUNCHER_FOCUS.index = focusIndex;
    cards.forEach((c, i) => {
      c.tabIndex = i === focusIndex ? 0 : -1;
      c.setAttribute("aria-selected", i === focusIndex ? "true" : "false");
      c.classList.toggle("launcher-card--focused", i === focusIndex);
      c.classList.toggle("launcher-card--dimmed", LAUNCHER_SEARCH_OPEN && c.classList.contains("launcher-card--filtered-out"));
    });
    cards[focusIndex].focus();
  };

  LAUNCHER_FOCUS.cards = cards;
  LAUNCHER_FOCUS.setFocus = setFocus;
  const lastApp = readLauncherLastApp();
  const lastIdx = Math.max(0, cards.findIndex(c => c.dataset.app === lastApp));
  LAUNCHER_FOCUS.index = lastIdx;
  focusIndex = lastIdx;
  cards.forEach((c, i) => {
    c.tabIndex = i === lastIdx ? 0 : -1;
    c.setAttribute("aria-selected", i === lastIdx ? "true" : "false");
  });

  cards.forEach((card, i) => {
    const press = () => card.classList.add("launcher-card--pressed");
    const unpress = () => card.classList.remove("launcher-card--pressed");
    card.addEventListener("pointerdown", press);
    card.addEventListener("pointerup", unpress);
    card.addEventListener("pointercancel", unpress);
    card.addEventListener("pointerleave", unpress);
    card.onclick = e => {
      if (e.target.closest(".launcher-card-context")) return;
      openApp(card.dataset.app, card);
    };
    card.querySelectorAll(".launcher-card-context").forEach(ctxBtn => {
      ctxBtn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        openApp(card.dataset.app, card, ctxBtn.dataset.restoreTab);
      };
      ctxBtn.onkeydown = e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          openApp(card.dataset.app, card, ctxBtn.dataset.restoreTab);
        }
      };
    });
    card.onfocus = () => {
      focusIndex = i;
      LAUNCHER_FOCUS.index = i;
      card.setAttribute("aria-selected", "true");
      card.classList.add("launcher-card--focused");
    };
    card.onblur = () => { card.classList.remove("launcher-card--focused"); };
  });

  if (stage) {
    stage.onkeydown = e => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setFocus(focusIndex + 1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setFocus(focusIndex - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openApp(cards[focusIndex].dataset.app, cards[focusIndex]); }
      else if (e.key === "Home") { e.preventDefault(); setFocus(0); }
      else if (e.key === "End") { e.preventDefault(); setFocus(cards.length - 1); }
    };
  }

  wireLauncherParallax();
  wireLauncherSearch(cards, setFocus);
  document.querySelectorAll(".launcher-dock-tab").forEach(btn => {
    btn.onclick = () => {
      setLauncherDockTab(btn.dataset.dock);
      wireLauncherCustomApps();
    };
  });
  wireLauncherCustomApps();
  wireLauncherSpots();
  startLauncherAmbient();
  updateLauncherQuestRadar();
  document.getElementById("launcher-share-app")?.addEventListener("click", () => copyShareAppLink());
  if (!isGameFeaturesHidden()) {
    ensureDailyQuestsAuto();
    showQuestAutoBanner();
  }
  applyGameFeatureChrome();
  if (!window.__launcherQuestRadarListener) {
    window.__launcherQuestRadarListener = true;
    window.addEventListener("waypoint:game-state", () => {
      if (ACTIVE_TAB === "Home") updateLauncherQuestRadar();
    });
  }
}

function filterLauncherCustomApps(query) {
  const q = query.toLowerCase().trim();
  const buttons = Array.from(document.querySelectorAll(".launcher-custom-app"));
  buttons.forEach(btn => {
    const hay = `${btn.dataset.appName || ""} ${btn.querySelector(".launcher-custom-app-name")?.textContent || ""}`.toLowerCase();
    const match = !q || hay.includes(q) || (q.includes("my") && q.includes("app"));
    btn.classList.toggle("launcher-custom-app--hidden", !!q && !match);
  });
  return { anyVisible: buttons.some(b => !b.classList.contains("launcher-custom-app--hidden")) };
}

function wireLauncherSearch(cards, setFocus) {
  const searchInput = document.getElementById("app-search-input");
  let dockBeforeSearch = LAUNCHER_DOCK_TAB;
  const filter = query => {
    const q = query.toLowerCase().trim();
    let firstVisible = -1;
    let bestScore = -1;
    cards.forEach((card, i) => {
      const app = WORKSPACE_APPS.find(a => a.id === card.dataset.app);
      const ctx = readAppLastContext()[card.dataset.app] || {};
      const hay = `${app?.name || ""} ${app?.subtitle || ""} ${app?.intention || ""} ${card.dataset.app} ${ctx.label || ""} ${card.dataset.workspace || ""}`.toLowerCase();
      const starts = !q || (app?.name || "").toLowerCase().startsWith(q) || (card.dataset.app || "").startsWith(q);
      const match = !q || hay.includes(q);
      card.classList.toggle("launcher-card--filtered-out", !match);
      card.classList.toggle("launcher-card--hidden", !match);
      if (match) {
        const score = starts ? 2 : 1;
        if (firstVisible < 0 || score > bestScore) {
          firstVisible = i;
          bestScore = score;
        }
      }
    });
    const custom = filterLauncherCustomApps(q);
    const workspaceHits = firstVisible >= 0;
    const customHits = custom.anyVisible && q;
    if (q && !LAUNCHER_SEARCH_OPEN) dockBeforeSearch = LAUNCHER_DOCK_TAB;
    LAUNCHER_SEARCH_OPEN = !!q;
    if (customHits && (!workspaceHits || q.length <= 2)) {
      setLauncherDockTab("myapps");
    } else if (!q) {
      setLauncherDockTab(dockBeforeSearch);
    } else if (workspaceHits) {
      setLauncherDockTab("workspace");
    }
    if (q && workspaceHits) setFocus(firstVisible);
  };
  const close = () => {
    LAUNCHER_SEARCH_OPEN = false;
    cards.forEach(c => c.classList.remove("launcher-card--filtered-out", "launcher-card--hidden", "launcher-card--dimmed"));
    document.querySelectorAll(".launcher-custom-app").forEach(b => b.classList.remove("launcher-custom-app--hidden"));
    if (searchInput) searchInput.value = "";
  };
  const open = () => {
    const input = searchInput || document.querySelector(".launcher-search-input");
    if (!input) return;
    input.focus();
    input.select();
  };
  if (searchInput) {
    searchInput.addEventListener("input", () => filter(searchInput.value));
    searchInput.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); close(); searchInput.blur(); }
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        const visible = cards.filter(c => !c.classList.contains("launcher-card--hidden"));
        if (visible.length) {
          const idx = cards.indexOf(visible[0]);
          if (idx >= 0) setFocus(idx);
        }
      }
      else if (e.key === "Enter") {
        e.preventDefault();
        const q = searchInput.value.toLowerCase().trim();
        const visibleCustom = Array.from(document.querySelectorAll(".launcher-custom-app:not(.launcher-custom-app--hidden):not(.launcher-custom-app--disabled)"));
        if (visibleCustom.length === 1 && q) {
          close();
          openCustomApp(visibleCustom[0].dataset.workflowId);
          return;
        }
        const focused = cards.find(c => c.classList.contains("launcher-card--focused") && !c.classList.contains("launcher-card--hidden"));
        if (focused) { close(); openApp(focused.dataset.app, focused); }
      }
    });
  }
  window.openLauncherSearch = open;
  window.closeLauncherSearch = close;
}

function updateHudContext() {
  const nameEl = document.getElementById("hud-app-name");
  const intentEl = document.getElementById("hud-intention");
  const nowFocus = document.getElementById("hud-now-focus");
  const nowFocusText = document.getElementById("hud-now-focus-text");
  document.body.dataset.workspace = workspaceForTab(ACTIVE_TAB);
  if (!nameEl || !intentEl) return;
  if (ACTIVE_TAB === "Home") {
    nameEl.textContent = "Waypoint";
    intentEl.textContent = intentTitle("home") || PAGE_INTENTS.Home?.title || "Choose your world";
    if (nowFocus) nowFocus.hidden = true;
    return;
  }
  const app = appForTab(ACTIVE_TAB);
  const meta = PAGE_INTENTS[ACTIVE_TAB];
  nameEl.textContent = app ? appLabel(app) : tabLabel(ACTIVE_TAB);
  intentEl.textContent = intentTitle(ACTIVE_TAB) || meta?.title || "";
  if (nowFocus && nowFocusText) {
    const primary = meta?.primary || (meta?.actions && meta.actions[0]) || null;
    if (primary) {
      nowFocus.hidden = false;
      nowFocusText.textContent = primary;
      nowFocus.title = `Focus: ${primary}`;
    } else {
      nowFocus.hidden = true;
    }
  }
}

function renderNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  updateHudContext();

  if (ACTIVE_TAB === "Home") {
    nav.innerHTML = "";
    nav.classList.add("tab-chip-bar--hidden");
    return;
  }
  nav.classList.remove("tab-chip-bar--hidden");

  const hadFocus = nav.contains(document.activeElement);
  const app = appForTab(ACTIVE_TAB);
  const appTabs = app ? (app.tabs || []) : TABS;
  let tabShortcut = 0;

  nav.innerHTML = appTabs.map(t => {
    const label = tabLabel(t);
    const shortcut = tabShortcut < 9 ? `Alt+${tabShortcut + 1}` : null;
    tabShortcut += 1;
    const title = shortcut ? `${label} (${shortcut})` : label;
    return `<button type="button" data-tab="${t}" class="tab-chip ${t === ACTIVE_TAB ? "active" : ""}" title="${escapeHtml(title)}">
      <span>${escapeHtml(label)}</span>${NAV_BADGES[t] ? `<span class="nav-badge">${NAV_BADGES[t]}</span>` : ""}
    </button>`;
  }).join("");

  const navButtons = Array.from(nav.querySelectorAll("button[data-tab]"));
  navButtons.forEach((b, i) => {
    b.onclick = () => goToTab(b.dataset.tab);
    b.onkeydown = e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const next = e.key === "ArrowRight" ? (i + 1) % navButtons.length
        : e.key === "ArrowLeft" ? (i - 1 + navButtons.length) % navButtons.length
        : e.key === "Home" ? 0 : navButtons.length - 1;
      navButtons[next].focus();
    };
  });
  if (hadFocus) {
    const active = nav.querySelector("button.active");
    if (active) active.focus();
  }
  if (typeof applyI18n === "function") applyI18n(nav);
}

function groupForTab(tab) {
  if (tab === "Home") return "Home";
  const app = appForTab(tab);
  if (app) return app.name;
  const group = NAV_GROUPS.find(g => (g.tabs || []).includes(tab));
  return group && group.label ? group.label : "Core";
}

function pageIntentHtml(tab) {
  const meta = PAGE_INTENTS[tab] || { title: tab, primary: "Act", loss: "Make this page useful, readable, and fast to act on.", actions: ["Review", "Act"] };
  const expanded = localStorage.getItem(`intentExpanded:${tab}`) === "1";
  const group = escapeHtml(typeof t === "function" ? (t("group." + groupForTab(tab)) !== "group." + groupForTab(tab) ? t("group." + groupForTab(tab)) : groupForTab(tab)) : groupForTab(tab));
  const label = escapeHtml(tabLabel(tab));
  return `<section class="page-intent page-intent-compact" aria-label="Page intention">
    <div class="page-intent-compact-row">
      <span class="page-intent-label">${group} / ${label}</span>
      <span class="page-intent-sep" aria-hidden="true">—</span>
      <span class="page-intent-title">${escapeHtml(intentTitle(tab) || meta.title)}</span>
      <button type="button" class="pill page-intent-primary" title="${escapeHtml(meta.primary || "Act")}">${escapeHtml(meta.primary || (meta.actions && meta.actions[0]) || "Act")}</button>
      <button type="button" class="secondary page-intent-toggle" title="Page intention details" aria-expanded="${expanded ? "true" : "false"}">ⓘ</button>
    </div>
    <div class="page-intent-details"${expanded ? "" : " hidden"}>
      <div class="page-intent-loss">Loss function: ${escapeHtml(meta.loss)}</div>
      <div class="page-intent-actions">
        ${(meta.actions || []).map(a => `<button type="button" class="pill page-intent-action" data-intent-action="${escapeHtml(a)}">${escapeHtml(a)}</button>`).join("")}
        <button type="button" class="secondary page-ask-agent">Ask agent about this page</button>
      </div>
    </div>
  </section>`;
}

async function renderTabBody() {
  if (ACTIVE_TAB === "Home") return await renderLauncher();
  if (ACTIVE_TAB === "Agent") return await renderAgent();
  else if (ACTIVE_TAB === "Hub") return await renderHub();
  else if (ACTIVE_TAB === "Today" || ACTIVE_TAB === "Paint") return await renderToday();
  else if (NOTE_LIST_TABS[ACTIVE_TAB]) return await renderNoteList(NOTE_LIST_TABS[ACTIVE_TAB]);
  else if (ACTIVE_TAB === "Goals") return await renderGoals();
  else if (ACTIVE_TAB === "Calendar") return await renderCalendar();
  else if (ACTIVE_TAB === "Trends") return await renderTrends();
  else if (ACTIVE_TAB === "Tasks") return await renderTasks();
  else if (ACTIVE_TAB === "Ideas") return await renderIdeas();
  else if (ACTIVE_TAB === "Repository") return await renderRepository();
  else if (ACTIVE_TAB === "Projects") return await renderProjects();
  else if (ACTIVE_TAB === "Competitions") return await renderCompetitions();
  else if (ACTIVE_TAB === "Classes") return await renderClasses();
  else if (ACTIVE_TAB === "Customers") return await renderCustomers();
  else if (ACTIVE_TAB === "Contacts") return await renderContacts();
  else if (ACTIVE_TAB === "Events") return await renderEvents();
  else if (ACTIVE_TAB === "Team") return await renderTeam();
  else if (ACTIVE_TAB === "Code") return await renderCode();
  else if (ACTIVE_TAB === "Practice") return await renderPractice();
  else if (ACTIVE_TAB === "Parallel") return await renderParallel();
  else if (ACTIVE_TAB === "Prompts") return await renderPromptsPage();
  else if (ACTIVE_TAB === "About") return await renderAbout();
  else if (ACTIVE_TAB === "Settings") return await renderSettings();
  else if (ACTIVE_TAB === "Obsidian") return await renderObsidian();
  return `<div class="card stub">Unknown tab.</div>`;
}

async function refreshNavBadges() {
  let pendingCount = 0;
  try {
    pendingCount = (await api("/api/actions?status=pending")).length;
  } catch (e) { return; }
  NAV_BADGES.Agent = pendingCount;
  const nav = document.getElementById("nav");
  const btn = nav && nav.querySelector('button[data-tab="Agent"]');
  if (btn) {
    const existing = btn.querySelector(".nav-badge");
    if (pendingCount) {
      if (existing) existing.textContent = pendingCount;
      else btn.insertAdjacentHTML("beforeend", `<span class="nav-badge">${pendingCount}</span>`);
    } else if (existing) {
      existing.remove();
    }
  }
  if (ACTIVE_TAB === "Home") {
    const tile = document.querySelector('.launcher-card[data-app="agent"]');
    if (tile) {
      const existing = tile.querySelector(".launcher-tile-badge");
      if (pendingCount) {
        if (existing) existing.textContent = pendingCount;
        else tile.insertAdjacentHTML("beforeend", `<span class="launcher-tile-badge">${pendingCount}</span>`);
      } else if (existing) {
        existing.remove();
      }
    }
  }
  updateLauncherStatDisplays();
  updateLauncherSpotDisplays();
}

async function render() {
  const renderToken = ++RENDER_TOKEN;
  const tabForScroll = ACTIVE_TAB;
  const crossingHome = (LAST_RENDER_TAB === "Home") !== (ACTIVE_TAB === "Home");
  const navDir = NAV_DIR;
  NAV_DIR = "none";
  const reduced = prefersReducedMotion();
  const phone = !!window.WaypointDevice?.phone || document.documentElement.classList.contains("device-phone");
  const directional = !phone && !reduced && !crossingHome && (navDir === "forward" || navDir === "back");
  document.documentElement.dataset.appTab = ACTIVE_TAB;
  document.body.classList.toggle("wp-nonplan", !["Today", "Calendar"].includes(ACTIVE_TAB));
  window.dispatchEvent(new CustomEvent("waypoint:tab", { detail: { tab: ACTIVE_TAB } }));
  renderNav();
  updateNavHistoryButtons();
  const main = document.getElementById("main");
  main.classList.toggle("launcher-view", ACTIVE_TAB === "Home");
  main.classList.remove("main-painted");
  if (directional) {
    main.dataset.navDir = navDir;
    main.style.setProperty("--enter-x", navDir === "forward" ? "14px" : "-14px");
    main.style.setProperty("--enter-y", "7px");
  } else {
    delete main.dataset.navDir;
    main.style.setProperty("--enter-x", "0px");
    main.style.setProperty("--enter-y", "10px");
  }
  setMainBusy(true);
  const intentHtml = ACTIVE_TAB === "Home" ? "" : pageIntentHtml(ACTIVE_TAB);
  const planChrome = ["Today", "Tasks", "Goals", "Calendar", "Events", "Paint", "Trends"].includes(ACTIVE_TAB);
  const travelHtml = planChrome ? "" : renderFastTravelSwitcher();
  let bodyHtml;
  try {
    bodyHtml = await renderTabBody();
  } catch (err) {
    if (renderToken !== RENDER_TOKEN) return;
    bodyHtml = `<div class="card stub">Could not load this page: ${escapeHtml(errorMessage(err))}</div>`;
  }
  // Guard BEFORE mutating DOM so a raced render never leaves unwired buttons behind.
  if (renderToken !== RENDER_TOKEN) return;
  main.innerHTML = intentHtml + travelHtml + renderWorkspaceSubnavRail(ACTIVE_TAB) + bodyHtml;
  if (renderToken !== RENDER_TOKEN) return;
  const scrollY = SCROLL_POS[tabForScroll];
  if (phone) {
    window.scrollTo({ top: scrollY != null ? scrollY : 0, left: 0, behavior: "instant" });
  }
  wireTab();
  wireAppSubnavPills(main);
  wireFastTravelSwitcher(main);
  wireWorkspaceSubnavRail(main);
  const intentToggle = main.querySelector(".page-intent-toggle");
  const intentDetails = main.querySelector(".page-intent-details");
  if (intentToggle && intentDetails) {
    intentToggle.onclick = () => {
      const open = !intentDetails.hidden;
      intentDetails.hidden = open;
      intentToggle.setAttribute("aria-expanded", open ? "false" : "true");
      localStorage.setItem(`intentExpanded:${ACTIVE_TAB}`, open ? "0" : "1");
    };
  }
  const primaryBtn = main.querySelector(".page-intent-primary");
  if (primaryBtn && typeof focusPrimaryControl === "function") {
    primaryBtn.onclick = () => focusPrimaryControl();
  }
  main.querySelectorAll(".page-intent-action").forEach(btn => {
    btn.onclick = () => {
      if (typeof focusPrimaryControl === "function") focusPrimaryControl();
    };
  });
  const askBtn = main.querySelector(".page-ask-agent");
  if (askBtn) askBtn.onclick = () => askAgentAbout(`Help me improve/use the ${ACTIVE_TAB} page. Page intention: ${PAGE_INTENTS[ACTIVE_TAB]?.loss || ""}`);
  if (!phone && crossingHome) {
    main.style.transition = "opacity 180ms ease, transform 280ms var(--ease-spring)";
    main.style.transform = "scale(1.04)";
    main.style.opacity = "0";
    requestAnimationFrame(() => {
      if (renderToken !== RENDER_TOKEN) return;
      main.style.opacity = "1";
      main.style.transform = "scale(1)";
    });
  } else if (directional) {
    main.style.transition = "none";
    main.style.transform = navDir === "forward" ? "translateX(12px)" : "translateX(-12px)";
    main.style.opacity = "0";
    requestAnimationFrame(() => {
      if (renderToken !== RENDER_TOKEN) return;
      main.style.transition = "opacity 160ms ease, transform 220ms var(--ease-spring)";
      main.style.opacity = "1";
      main.style.transform = "translateX(0)";
    });
  } else {
    main.style.transition = "opacity 120ms ease";
    main.style.transform = "";
    main.style.opacity = "1";
  }
  // Mark painted after enter animation window so card-rise plays once, then never replays.
  const paintDelay = phone ? 0 : (crossingHome ? 320 : (directional ? 240 : 160));
  setTimeout(() => {
    if (renderToken !== RENDER_TOKEN) return;
    main.classList.add("main-painted");
  }, paintDelay);
  setMainBusy(false);
  LAST_RENDER_TAB = ACTIVE_TAB;
  if (typeof applyI18n === "function") applyI18n(main);
  if (ACTIVE_TAB !== "Home") stopLauncherAmbient();
  installHudTruthBreathWrapper();
  applyHudChrome();
  if (typeof initGameLayerInteractions === "function") initGameLayerInteractions();
  if (typeof gameUpdateHud === "function") gameUpdateHud();
  if (typeof refreshHudData === "function") refreshHudData();
  if (!isGameFeaturesHidden() && (ACTIVE_TAB === "Home" || LAST_RENDER_TAB == null)) {
    ensureDailyQuestsAuto();
    if (ACTIVE_TAB === "Home") showQuestAutoBanner();
  }
  if (!phone) {
    setTimeout(() => {
      if (renderToken !== RENDER_TOKEN) return;
      window.scrollTo(0, scrollY != null ? scrollY : 0);
    }, 0);
  }
}


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

// Upload one or more files to POST /api/attachments (one request per file).
// onProgress(current, total, file) fires before each upload starts.
async function uploadAttachmentFiles(files, opts = {}) {
  const list = Array.from(files || []).filter(Boolean);
  const { entity_type, entity_id, onProgress, concurrency = 3 } = opts;
  const successes = [];
  const failures = [];
  if (!list.length) return { successes, failures };

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < list.length) {
      const i = nextIndex++;
      const file = list[i];
      if (onProgress) onProgress(i + 1, list.length, file);
      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", entity_type);
      form.append("entity_id", String(entity_id ?? "0"));
      try {
        const res = await fetch("/api/attachments", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "upload failed");
        successes.push({ file, data });
      } catch (err) {
        failures.push({ file, error: errorMessage(err) });
      }
    }
  }
  const workers = Math.min(Math.max(1, concurrency), list.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { successes, failures };
}

function formatUploadResultMessage(successes, failures) {
  const parts = [];
  if (successes.length) parts.push(`${successes.length} file${successes.length === 1 ? "" : "s"} uploaded`);
  if (failures.length) {
    const detail = failures.map(f => `${escapeHtml(f.file.name)}: ${escapeHtml(f.error)}`).join("; ");
    parts.push(`${failures.length} failed (${detail})`);
  }
  return parts.join(". ");
}

function ensureAttachDropZoneStyles() {
  if (document.getElementById("attach-drop-zone-styles")) return;
  const style = document.createElement("style");
  style.id = "attach-drop-zone-styles";
  style.textContent = `
    .attach-drop-zone { transition: background 120ms ease, box-shadow 120ms ease; }
    .attach-drop-zone--over {
      background: color-mix(in srgb, var(--accent, #e84a2f) 8%, var(--bg-card));
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent, #e84a2f) 45%, transparent);
    }`;
  document.head.appendChild(style);
}

function wireAttachDropZone(zoneEl, { onFiles, accept } = {}) {
  if (!zoneEl || zoneEl.dataset.attachDropWired === "1") return;
  ensureAttachDropZoneStyles();
  zoneEl.dataset.attachDropWired = "1";
  zoneEl.classList.add("attach-drop-zone");

  const matchesAccept = file => {
    if (!accept) return true;
    const name = file.name.toLowerCase();
    return accept.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).some(token => {
      if (token.startsWith(".")) return name.endsWith(token);
      if (token.endsWith("/*")) return file.type.startsWith(token.slice(0, -1));
      return file.type === token;
    });
  };

  zoneEl.addEventListener("dragover", e => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    zoneEl.classList.add("attach-drop-zone--over");
  });
  zoneEl.addEventListener("dragleave", e => {
    if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove("attach-drop-zone--over");
  });
  zoneEl.addEventListener("drop", e => {
    e.preventDefault();
    zoneEl.classList.remove("attach-drop-zone--over");
    const files = Array.from(e.dataTransfer?.files || []).filter(matchesAccept);
    if (files.length && onFiles) onFiles(files);
  });
}

function setFileInputFiles(input, files) {
  if (!input) return;
  const dt = new DataTransfer();
  Array.from(files || []).forEach(f => dt.items.add(f));
  input.files = dt.files;
}

let MOMENT_OF_TRIUMPH_ACTIVE = false;
const MOMENT_OF_TRIUMPH_QUEUE = [];

function ensureMomentOfTriumphStyles() {
  if (document.getElementById("moment-of-triumph-styles")) return;
  const style = document.createElement("style");
  style.id = "moment-of-triumph-styles";
  style.textContent = `
    .moment-of-triumph {
      position: fixed;
      inset: 0;
      z-index: 200000;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      cursor: pointer;
      opacity: 0;
      transition: opacity 420ms ease;
      background: rgba(6, 8, 12, 0.72);
    }
    .moment-of-triumph--in { opacity: 1; }
    .moment-of-triumph--out { opacity: 0; pointer-events: none; }
    .moment-of-triumph--passive,
    .moment-of-triumph--passive * { pointer-events: none; }
    .moment-of-triumph--reduced { transition-duration: 280ms; }
    .moment-of-triumph-wash {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 42%, var(--mot-accent-wash, rgba(155, 109, 255, 0.42)) 0%, transparent 62%);
      opacity: 0;
      transform: scale(0.88);
      transition: opacity 520ms ease, transform 900ms var(--ease-spring, cubic-bezier(0.22, 1, 0.36, 1));
    }
    .moment-of-triumph--in .moment-of-triumph-wash {
      opacity: 1;
      transform: scale(1);
    }
    .moment-of-triumph-inner {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 24px 32px;
      max-width: min(92vw, 920px);
      transform: translateY(12px) scale(0.96);
      opacity: 0;
      transition: opacity 480ms ease 80ms, transform 680ms var(--ease-spring, cubic-bezier(0.22, 1, 0.36, 1)) 60ms;
    }
    .moment-of-triumph--in .moment-of-triumph-inner {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .moment-of-triumph-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(2.4rem, 8vw, 5.2rem);
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.05;
      color: var(--mot-accent, var(--accent));
      text-shadow: 0 0 48px color-mix(in srgb, var(--mot-accent, var(--accent)) 45%, transparent);
    }
    .moment-of-triumph-sub {
      margin: 14px 0 0;
      font-family: var(--font-body, var(--font-ui));
      font-size: clamp(0.95rem, 2.2vw, 1.15rem);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--ink-primary, #f5f5f5) 72%, transparent);
    }
    .moment-of-triumph-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }`;
  document.head.appendChild(style);
}

function momentOfTriumphBurst(canvas, accent, duration) {
  const ctx = canvas.getContext("2d");
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const cx = w * 0.5;
  const cy = h * 0.42;
  const base = accent.startsWith("#") && accent.length >= 7
    ? [accent, "#fbbf24", "#22d3ee", "#f97316"]
    : ["#fbbf24", "#22d3ee", "#a78bfa", "#f97316"];
  const particles = Array.from({ length: 56 }, (_, i) => {
    const angle = (i / 56) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const speed = 4 + Math.random() * 10;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 3 + Math.random() * 5,
      color: base[i % base.length],
      life: 1,
    };
  });
  const start = performance.now();
  let raf = null;
  let stopped = false;
  const frame = now => {
    if (stopped || !canvas.isConnected) return;
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    particles.forEach(p => {
      p.life = 1 - t / duration;
      if (p.life <= 0) return;
      alive += 1;
      p.vy += 0.18;
      p.x += p.vx;
      p.y += p.vy;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (t < duration && alive > 0) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

function momentOfTriumph(opts = {}) {
  if (MOMENT_OF_TRIUMPH_ACTIVE) {
    // Never drop a cue — especially DAY COMPLETE after a LEVEL overlay.
    MOMENT_OF_TRIUMPH_QUEUE.push({ ...opts });
    return;
  }
  ensureMomentOfTriumphStyles();
  const reduced = prefersReducedMotion();
  const title = opts.title || "Triumph";
  const subtitle = opts.subtitle || "";
  const accent = opts.accent || workspaceAccent(opts.workspace || "home");
  const totalMs = reduced ? 600 : 1800;
  const fadeMs = reduced ? 280 : 420;

  MOMENT_OF_TRIUMPH_ACTIVE = true;
  const overlay = document.createElement("div");
  overlay.className = "moment-of-triumph"
    + (reduced ? " moment-of-triumph--reduced" : "")
    + (opts.nonBlocking ? " moment-of-triumph--passive" : "");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.style.setProperty("--mot-accent", accent);
  overlay.style.setProperty("--mot-accent-wash", `color-mix(in srgb, ${accent} 38%, transparent)`);

  let canvasHtml = "";
  if (!reduced) canvasHtml = `<canvas class="moment-of-triumph-canvas" aria-hidden="true"></canvas>`;
  overlay.innerHTML = `
    <div class="moment-of-triumph-wash" aria-hidden="true"></div>
    ${canvasHtml}
    <div class="moment-of-triumph-inner">
      <h2 class="moment-of-triumph-title">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="moment-of-triumph-sub">${escapeHtml(subtitle)}</p>` : ""}
    </div>`;
  document.body.appendChild(overlay);

  let dismissed = false;
  let autoTimer = null;
  let entryRaf = null;
  let cancelBurst = null;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (autoTimer) clearTimeout(autoTimer);
    if (entryRaf) cancelAnimationFrame(entryRaf);
    if (cancelBurst) cancelBurst();
    overlay.classList.remove("moment-of-triumph--in");
    overlay.classList.add("moment-of-triumph--out");
    setTimeout(() => {
      overlay.remove();
      MOMENT_OF_TRIUMPH_ACTIVE = false;
      const next = MOMENT_OF_TRIUMPH_QUEUE.shift();
      if (next) momentOfTriumph(next);
    }, fadeMs + 40);
  };

  overlay.addEventListener("click", dismiss);

  entryRaf = requestAnimationFrame(() => {
    entryRaf = null;
    if (dismissed || !overlay.isConnected) return;
    overlay.classList.add("moment-of-triumph--in");
    if (!reduced) {
      const canvas = overlay.querySelector(".moment-of-triumph-canvas");
      if (canvas) {
        canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
        canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        const ctx = canvas.getContext("2d");
        ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
        cancelBurst = momentOfTriumphBurst(canvas, accent, 900);
      }
    }
  });

  autoTimer = setTimeout(dismiss, totalMs);
}

window.momentOfTriumph = momentOfTriumph;

// Early no-op stub — misc.js replaces with full WaypointGame after load.
window.WaypointGame = window.WaypointGame || {
  awardXp() {},
  questProgress() {},
  getState() {
    return { xp: 0, level: 1, gems: 0, questsToday: [], allQuestsDone: false };
  },
};

async function refreshCaptureListCounts() {
  const listTabs = CAPTURE_QUICK_TABS.filter(t => NOTE_LIST_TABS[t]);
  const results = await Promise.all(
    listTabs.map(t => api(`/api/lists/${NOTE_LIST_TABS[t]}`).catch(() => []))
  );
  CAPTURE_LIST_COUNTS = {};
  listTabs.forEach((tab, i) => {
    CAPTURE_LIST_COUNTS[tab] = Array.isArray(results[i]) ? results[i].length : 0;
  });
  try {
    const ideas = await api("/api/ideas").catch(() => null);
    if (Array.isArray(ideas)) CAPTURE_LIST_COUNTS.Ideas = ideas.length;
  } catch (_) { /* ignore */ }
  try {
    const cats = await api("/api/repo/categories").catch(() => null);
    if (Array.isArray(cats)) {
      CAPTURE_LIST_COUNTS.Repository = cats.reduce((n, c) => n + (c.count || 0), 0);
    } else if (cats && typeof cats === "object") {
      CAPTURE_LIST_COUNTS.Repository = Object.values(cats).reduce((n, v) => n + (Number(v) || 0), 0);
    }
  } catch (_) { /* ignore */ }
}

function renderCaptureQuickSwitch(activeTab) {
  const chips = CAPTURE_QUICK_TABS.map(tab => {
    const count = CAPTURE_LIST_COUNTS[tab];
    const countHtml = count != null ? `<span class="list-quick-count">${count}</span>` : "";
    const active = tab === activeTab ? " list-quick-chip--active" : "";
    return `<button type="button" class="list-quick-chip${active}" data-tab="${escapeHtml(tab)}">${escapeHtml(TAB_LABELS[tab] || tab)}${countHtml}</button>`;
  }).join("");
  return `<nav class="list-quick-switch" aria-label="Switch list">${chips}</nav>`;
}

function wireCaptureQuickSwitch() {
  document.querySelectorAll(".list-quick-switch .list-quick-chip").forEach(btn => {
    btn.onclick = () => goToTab(btn.dataset.tab);
  });
}

// Reads the live theme's actual CSS custom properties instead of hardcoded hex values, so charts
// stop rendering a dark box when the sidebar's light/dark toggle is set to light.
function plotlyThemeVars() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    card: v("--bg-card"), gridline: v("--gridline"), ink: v("--ink-secondary"),
    inkMuted: v("--ink-muted"), inkPrimary: v("--ink-primary"),
  };
}

const RICH_TOOLBAR_HTML = `
  <div class="rich-toolbar">
    <span class="rich-toolbar-group-label">Appearance</span>
    <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
    <input type="number" data-rich-style="fontSize" title="Font size in pixels" aria-label="Font size in pixels" min="8" max="72" value="14" style="width:58px;">
    <select data-rich-style="fontFamily" title="Font family" aria-label="Font family">
      <option value="">Font</option>
      <option value="Arial, sans-serif">Arial</option>
      <option value="Georgia, serif">Georgia</option>
      <option value="'Courier New', monospace">Mono</option>
      <option value="system-ui, sans-serif">System</option>
    </select>
    <button type="button" data-rich-action="rotate" title="Rotate selected text">Rotate</button>
    <label class="rich-toolbar-color"><span>Text</span><input type="color" data-cmd="foreColor" title="Text color" value="#e8663d"></label>
    <label class="rich-toolbar-color"><span>Mark</span><input type="color" data-cmd="hiliteColor" title="Highlight color" value="#fff59d"></label>
    <button type="button" data-cmd="removeFormat" title="Clear formatting">Clear</button>
    <span class="rich-toolbar-divider"></span>
    <button type="button" data-cmd="justifyLeft" title="Align left">Left</button>
    <button type="button" data-cmd="justifyCenter" title="Align center">Center</button>
    <button type="button" data-cmd="justifyRight" title="Align right">Right</button>
    <span class="rich-toolbar-divider"></span>
    <span class="rich-toolbar-group-label">Add</span>
    <button type="button" data-cmd="insertUnorderedList" title="Bullet list">&bull; list</button>
    <button type="button" data-cmd="createLink" title="Insert link">Link</button>
    <button type="button" data-cmd="unlink" title="Remove link">Unlink</button>
    <button type="button" data-cmd="insertImage" title="Insert image (URL)">Image</button>
    <button type="button" data-rich-action="graph" title="Insert a lightweight graph placeholder">Graph</button>
    <span class="rich-toolbar-divider"></span>
    <span class="rich-toolbar-group-label">View</span>
    <button type="button" class="rich-fullscreen-btn" title="Full screen">&#9974; Full screen</button>
  </div>`;

// "add on long text a full screen [...] view where i can edit stuff" -- a bigger writing surface
// for any rich-editable field, same modal-overlay pattern as the Automation Studio code editor.
// Syncs back into the original field live (oninput), not just on close, so nothing is lost if
// the modal is dismissed unexpectedly.
function openFullscreenEditor(editableId) {
  const original = document.getElementById(editableId);
  if (!original) return;
  const overlay = document.createElement("div");
  overlay.className = "wf-code-modal-overlay rich-fs-overlay--true";
  overlay.innerHTML = `
    <div class="wf-code-modal rich-fs-modal" role="dialog" aria-modal="true" aria-label="Full-screen rich text editor">
      <div data-rich-for="fullscreen-editable">${RICH_TOOLBAR_HTML}</div>
      <div id="fullscreen-editable" class="rich-editable" contenteditable="true" style="flex:1; overflow-y:auto; font-size:15px; line-height:1.6;">${original.innerHTML}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="secondary" id="fullscreen-default-size">Default size</button>
        <button type="button" class="primary" id="fullscreen-close">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const fsEditable = document.getElementById("fullscreen-editable");
  wireRichToolbar("fullscreen-editable");
  overlay.querySelector(".rich-fullscreen-btn")?.remove();
  fsEditable.oninput = () => { original.innerHTML = fsEditable.innerHTML; };
  const close = () => overlay.remove();
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
  document.getElementById("fullscreen-default-size").onclick = e => {
    const isTrueFullscreen = overlay.classList.toggle("rich-fs-overlay--true");
    e.currentTarget.textContent = isTrueFullscreen ? "Default size" : "Full screen";
  };
  document.getElementById("fullscreen-close").onclick = close;
  fsEditable.focus();
}

function richSelectionRange(editable) {
  const selection = window.getSelection?.();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;
  return editable.contains(container) ? range.cloneRange() : null;
}

function richRestoreRange(range) {
  if (!range) return;
  const selection = window.getSelection?.();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function richApplySelectionStyle(editable, range, styles) {
  const needsSelection = Object.prototype.hasOwnProperty.call(styles, "transform")
    || Object.prototype.hasOwnProperty.call(styles, "display");
  if (!range || range.collapsed) {
    if (needsSelection) {
      if (typeof showToast === "function") showToast("Select some text first", "info");
      editable.focus();
      return;
    }
    Object.assign(editable.style, styles);
    editable.focus();
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const span = document.createElement("span");
  Object.assign(span.style, styles);
  span.appendChild(range.extractContents());
  range.insertNode(span);
  const selection = window.getSelection?.();
  if (selection) {
    const next = document.createRange();
    next.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(next);
  }
  editable.dispatchEvent(new Event("input", { bubbles: true }));
}

function wireRichToolbar(editableId) {
  const editable = document.getElementById(editableId);
  if (!editable) return;
  const toolbar = document.querySelector(`[data-rich-for="${editableId}"] .rich-toolbar`);
  let savedRange = richSelectionRange(editable);
  const rememberRange = () => {
    const range = richSelectionRange(editable);
    if (range) savedRange = range;
  };
  editable.addEventListener("mouseup", rememberRange);
  editable.addEventListener("keyup", rememberRange);
  toolbar?.addEventListener("pointerdown", rememberRange, true);
  document.querySelectorAll(`[data-rich-for="${editableId}"] [data-cmd]`).forEach(el => {
    if (el.tagName === "BUTTON") {
      el.onclick = () => {
        editable.focus();
        richRestoreRange(savedRange);
        if (el.dataset.cmd === "createLink") {
          const url = window.prompt("Link URL:");
          if (!url) return;
          document.execCommand("createLink", false, url);
          return;
        }
        if (el.dataset.cmd === "insertImage") {
          const url = window.prompt("Paste an image URL, or leave blank to upload local image(s):");
          if (url) {
            document.execCommand("insertImage", false, url);
            return;
          }
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.multiple = true;
          input.onchange = async () => {
            const picked = Array.from(input.files || []);
            if (!picked.length) return;
            editable.focus();
            const { successes, failures } = await uploadAttachmentFiles(picked, {
              entity_type: "rich_image",
              entity_id: "0",
              onProgress: (cur, total) => {
                if (typeof showToast === "function") showToast(`Uploading image ${cur}/${total}…`, "info");
              },
            });
            successes.forEach(({ data }) => {
              document.execCommand("insertImage", false, `/api/attachments/${data.id}/file`);
            });
            if (failures.length) window.alert(formatUploadResultMessage(successes, failures));
          };
          input.click();
          return;
        }
        document.execCommand(el.dataset.cmd, false, el.dataset.value || null);
      };
    } else {
      el.onchange = () => {
        if (!el.value) return;
        editable.focus();
        richRestoreRange(savedRange);
        const value = el.type === "number"
          ? String(Math.min(7, Math.max(1, Math.round(Number(el.value)))))
          : el.value;
        document.execCommand(el.dataset.cmd, false, value);
        if (el.tagName === "SELECT") el.value = "";
      };
    }
  });
  document.querySelectorAll(`[data-rich-for="${editableId}"] [data-rich-style]`).forEach(el => {
    el.onchange = () => {
      if (!el.value) return;
      const property = el.dataset.richStyle;
      const value = property === "fontSize"
        ? `${Math.max(8, Math.min(72, Math.round(Number(el.value) || 14)))}px`
        : el.value;
      richApplySelectionStyle(editable, savedRange, { [property]: value });
      rememberRange();
      if (el.tagName === "SELECT") el.value = "";
    };
  });
  document.querySelectorAll(`[data-rich-for="${editableId}"] [data-rich-action]`).forEach(button => {
    button.onclick = () => {
      editable.focus();
      richRestoreRange(savedRange);
      if (button.dataset.richAction === "rotate") {
        richApplySelectionStyle(editable, savedRange, { display: "inline-block", transform: "rotate(-2deg)" });
      } else if (button.dataset.richAction === "graph") {
        document.execCommand("insertHTML", false,
          '<pre class="rich-graph-placeholder" contenteditable="true">Graph\n▃ ▆ ▄ █\n3 7 5 9</pre><p><br></p>');
        editable.dispatchEvent(new Event("input", { bubbles: true }));
      }
      rememberRange();
    };
  });

  if (editableId !== "fullscreen-editable") {
    const fsBtn = document.querySelector(`[data-rich-for="${editableId}"] .rich-fullscreen-btn`);
    if (fsBtn) fsBtn.onclick = () => openFullscreenEditor(editableId);
  }
}

// --- Field history: generic "History" widget for tracked rich-editable fields ---------------------------------------------------------
// Server snapshots the OLD value of a field right before a save overwrites it (see e.g. the
// idea PATCH route), keeping up to 3 prior versions per (entity_type, entity_id, field_name).
// This widget shows those versions and lets the user stage one back into the editable field --
// nothing is auto-saved; the field's own Save button still has to be clicked.
//
// Usage: place `fieldHistoryWidgetHtml(entityType, entityId, fieldName)` near a rich-editable
// field's toolbar/save button, then call `wireFieldHistory(entityType, entityId, fieldName, editableId)`
// after the markup is in the DOM. Currently wired up only for the Ideas tab body field
// (see renderIdeas/wireIdeas) -- extending to other rich-editable fields is a drop-in follow-up.

function fieldHistoryWidgetHtml(entityType, entityId, fieldName) {
  const key = `${entityType}-${entityId}-${fieldName}`;
  return `
    <button type="button" class="secondary field-history-toggle" id="field-history-toggle-${key}" title="View previous saved versions">History</button>
    <div class="field-history-panel card" id="field-history-panel-${key}" style="display:none; margin-top:6px;"></div>`;
}

function renderFieldHistoryPanel(entries, editableId, panelEl) {
  if (!entries.length) {
    panelEl.innerHTML = '<p class="stub">No previous versions saved yet.</p>';
    return;
  }
  panelEl.innerHTML = entries.map((entry, idx) => {
    const text = (entry.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const preview = text.slice(0, 140) + (text.length > 140 ? "..." : "");
    const when = new Date(entry.created_at).toLocaleString();
    return `
      <div class="field-history-entry" style="border-top:1px solid var(--gridline); padding:6px 0;">
        <div class="stub">${when}</div>
        <div style="margin:4px 0; font-size:12px;">${preview || "(empty)"}</div>
        <button type="button" class="secondary field-history-restore" data-idx="${idx}">Restore this version</button>
      </div>`;
  }).join("");
  panelEl.querySelectorAll(".field-history-restore").forEach(btn => {
    btn.onclick = () => {
      const entry = entries[Number(btn.dataset.idx)];
      const editable = document.getElementById(editableId);
      if (editable) editable.innerHTML = entry.content || "";
      panelEl.style.display = "none";
    };
  });
}

function wireFieldHistory(entityType, entityId, fieldName, editableId) {
  const key = `${entityType}-${entityId}-${fieldName}`;
  const toggle = document.getElementById(`field-history-toggle-${key}`);
  const panel = document.getElementById(`field-history-panel-${key}`);
  if (!toggle || !panel) return;
  toggle.onclick = async () => {
    if (panel.style.display !== "none") {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "";
    panel.innerHTML = '<p class="stub">Loading...</p>';
    try {
      const entries = await api(`/api/field-history/${entityType}/${entityId}/${fieldName}`);
      renderFieldHistoryPanel(entries, editableId, panel);
    } catch (err) {
      panel.innerHTML = `<p class="stub">Could not load history (${errorMessage(err)})</p>`;
    }
  };
}

async function copyShareAppLink() {
  const origin = (typeof location !== "undefined" && location.origin) ? location.origin : "http://127.0.0.1:5099";
  let localUrl = origin.replace("0.0.0.0", "127.0.0.1").replace("[::]", "127.0.0.1");
  let tailscaleUrl = "";
  let clone = "";
  try {
    const sec = await api("/api/system/security");
    const urls = Array.isArray(sec?.tailscale_urls) ? sec.tailscale_urls.filter(Boolean) : [];
    tailscaleUrl = urls[0] || "";
  } catch (_) {}
  try {
    const share = await api("/api/share/app");
    clone = share?.message || share?.url || "";
  } catch (_) {}
  const lines = [
    "Waypoint — send this app",
    `This machine: ${localUrl}`,
  ];
  if (tailscaleUrl) lines.push(`Tailscale: ${tailscaleUrl}`);
  lines.push("", "How to: keep Waypoint running on this computer. On another device, open the Tailscale URL if you share a tailnet, or the local URL on this same machine. Data stays here.");
  if (clone) lines.push("", clone);
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === "function") showToast("Share link copied", "good");
  } catch (_) {
    if (typeof showToast === "function") showToast(text, "info");
  }
  return text;
}

window.copyShareAppLink = copyShareAppLink;

(function killAutoCommandPalette() {
  window.__wpPaletteUserOpened = false;
  const markUser = () => { window.__wpPaletteUserOpened = true; };
  const sweep = () => {
    if (window.__wpPaletteUserOpened) return;
    document.querySelectorAll(".command-palette-overlay").forEach(node => {
      const label = node.querySelector("[role=dialog]")?.getAttribute("aria-label") || "";
      if (/^command palette$/i.test(label.trim()) && !node.dataset.userOpened) node.remove();
    });
  };
  document.addEventListener("pointerdown", e => {
    if (e.target.closest?.("#open-command-palette, .command-launch")) markUser();
  }, true);
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) markUser();
  }, true);
  const obs = new MutationObserver(sweep);
  const start = () => {
    sweep();
    if (document.documentElement) obs.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

(function wireHudChromeListeners() {
  const boot = () => {
    applyHudChrome();
    ensureHudTruthBreathStyles();
    document.getElementById("hud-status-pill")?.addEventListener("click", () => {
      setTimeout(applyHudChrome, 0);
    });
    document.addEventListener("change", e => {
      const id = e.target && e.target.id;
      if (id === "settings-game-off" || id === "wp-hide-game" || id === "settings-hide-game") {
        setTimeout(applyHudChrome, 0);
      }
    });
    window.addEventListener("storage", e => {
      if (!e.key) return;
      if (/hide-game|GameOff|HideGame|hideGame/i.test(e.key)) applyHudChrome();
    });
    window.addEventListener("waypoint:tab", applyHudChrome);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

