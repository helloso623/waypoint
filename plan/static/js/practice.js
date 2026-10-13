// --- Practice tab: cognitive drill minigames ---------------------------------------------------------
// Category A of the Practice/Minigames platform spec'd in Project Plan.md. Scoring happens
// client-side (the round already includes the answers -- single-user local app, nothing
// adversarial to protect them from) and gets POSTed to /submit, which is what actually persists
// the attempt and adjusts difficulty server-side.

let PRACTICE_GAMES = [];
let PRACTICE_CURRENT_KEY = null;
let PRACTICE_STYLES_INJECTED = false;
let RWD_PANEL_EXPANDED = false;
let PRAX_STAGE = null;
let PRAX_LAUNCH_OPTIONS = null;
let PRAX_REDUCE_MOTION = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let PRAX_COIN_RAIN_UNTIL = 0;
let PRAX_CELEBRATE_UNTIL = 0;
const PRAX_COIN_RAIN_GAP_MS = 2200;
const PRAX_COIN_RAIN_CAP = 14;
let ARC_TRAINING_LAB_OPEN = false;
const AIT_GAME_KEY = "neural_net_fix";
let ARC_MATCH_CTX = null;
const ARC_MATCH_POOL = ["logic", "math", "memory", "working_memory", "time_estimation", "spelling", "signal_storm", "focus_pulse", "memory_constellation", "circuit_sprint", "time_forge"];
const ARC_LOCAL_POOL = ARC_MATCH_POOL;
const ARC_CANVAS_KEYS = new Set(["signal_storm", "focus_pulse", "memory_constellation", "circuit_sprint", "time_forge"]);
const ARC_ROTATION_CANVAS = ["signal_storm", "focus_pulse", "memory_constellation", "circuit_sprint", "time_forge"];
const PRAX_GAMEPLAY_LOG_KEY = "gameplayLog";
const PRAX_PLAY_TIME_KEY = "arcadePlayTimeMs";
const PRAX_SEEN_FACTS_KEY = "practiceSeenFactHashes";
const HARDWARE_TRACK_LEVEL_KEY = "hardwareTrackLevel";
const HARDWARE_STAGE_CLEARS_KEY = "hardwareStageClears";
const ARC_RIVAL_ROSTER_KEY = "arcadeRivalRoster";
const ARC_LAB_SESSIONS_KEY = "arcadeLabSessions";
const ARC_ROOM_SKIN_SEEN_KEY = "arcadeRoomSkinSeen";
const ARC_ROOM_UNLOCK_AT = 5;
const HARDWARE_RANK_SEEN_KEY = "hardwareRankSeen";
const HARDWARE_STAGES = [
  { id: "ohm", label: "Ohm" },
  { id: "digital", label: "Digital" },
  { id: "rc", label: "RC" },
  { id: "opamp", label: "Op-amp" },
  { id: "sensors", label: "Sensors" },
  { id: "mcu", label: "MCU" },
  { id: "robot", label: "Robot chain" },
];
const HARDWARE_RANKS = [
  { chevrons: "›", name: "Apprentice" },
  { chevrons: "››", name: "Technician" },
  { chevrons: "›››", name: "Fabricator" },
  { chevrons: "››››", name: "Circuitwright" },
  { chevrons: "◆", name: "Signal Engineer" },
  { chevrons: "◆◆", name: "Embedded Lead" },
  { chevrons: "◆◆◆", name: "Robot Architect" },
];
const HARDWARE_MODE_KEY = "hardwareLastMode";
const HARDWARE_MODES = [
  { key: "ohm_sprint", label: "V=IR Sprint", icon: "⚡", kind: "drill", stageId: "ohm", difficulty: 0,
    desc: "Voltage, current, and resistance at bench speed.",
    info: "Use V = I·R. Convert mA to A before dividing. Fractions like 5/8 work for ratios." },
  { key: "resistor_web", label: "Resistor Web", icon: "🕸️", kind: "drill", stageId: "ohm", difficulty: 1,
    desc: "Series, parallel, and mixed networks.",
    info: "Series adds; parallel inverts: 1/R_eq = 1/R1 + 1/R2. Combine inside-out." },
  { key: "gate_lab", label: "Gate Lab", icon: "⬡", kind: "minigame", stageId: "digital", difficulty: 0,
    desc: "Truth tables and gate spotting.",
    info: "Read the table row by row — one missing output often names the gate." },
  { key: "rc_pulse", label: "RC Pulse", icon: "〰️", kind: "drill", stageId: "rc", difficulty: 0,
    desc: "τ = RC and charge intuition.",
    info: "τ in ms when R is kΩ and C is µF. ~63% per τ; ~86% by 2τ." },
  { key: "opamp_math", label: "Op-amp Math", icon: "△", kind: "drill", stageId: "opamp", difficulty: 1,
    desc: "Gain from resistor ratios — fractions welcome.",
    info: "Inverting: −Rf/Rin. Non-inverting: 1 + Rf/Rg. Enter decimals or fractions." },
  { key: "sensor_scout", label: "Sensor Scout", icon: "📡", kind: "practical", stageId: "sensors", difficulty: 0,
    desc: "Match sensors to real signals.",
    info: "Thermistors change R; encoders pulse; PWM sets average motor voltage." },
  { key: "pin_modes", label: "Pin Modes", icon: "📍", kind: "practical", stageId: "mcu", difficulty: 0,
    desc: "GPIO, debounce, and interrupts.",
    info: "Floating buttons need pull-ups. Fast pulses → edge interrupts." },
  { key: "robot_route", label: "Robot Route", icon: "🤖", kind: "minigame", stageId: "robot", difficulty: 1,
    desc: "Order the sense → actuate chain.",
    info: "Sensor → ADC → control → PWM driver → motor. Safety cuts power first." },
  { key: "divider_drop", label: "Divider Drop", icon: "➗", kind: "practical", stageId: "ohm", difficulty: 1,
    desc: "Voltage-divider math — try 5/8 style answers.",
    info: "V_out = V_in × R_bottom / (R_top + R_bottom). Fractions or decimals OK." },
  { key: "bench_brief", label: "Bench Brief", icon: "💬", kind: "talk", stageId: "mcu", difficulty: -1,
    desc: "Short coach cards — read, reflect, continue.",
    info: "No trick questions — absorb the tip, then continue. Fullscreen available." },
];
const ARC_ROOM_SKINS = {
  memory: { name: "Recall Chamber", color: "#8b5cf6" },
  working_memory: { name: "Digit Vault", color: "#6366f1" },
  math: { name: "Calc Forge", color: "#f59e0b" },
  logic: { name: "Proof Gallery", color: "#14b8a6" },
  spelling: { name: "Lexicon Loft", color: "#ec4899" },
  time_estimation: { name: "Chrono Bay", color: "#06b6d4" },
  signal_storm: { name: "Storm Deck", color: "#f97316" },
  focus_pulse: { name: "Pulse Chamber", color: "#22d3ee" },
  memory_constellation: { name: "Star Loft", color: "#a78bfa" },
  circuit_sprint: { name: "Bench Bay", color: "#22c55e" },
  time_forge: { name: "Anvil Room", color: "#ef4444" },
  hardware: { name: "Hardware Bay", color: "#94a3b8" },
  comprehension: { name: "Reading Nook", color: "#3b82f6" },
  summarizing: { name: "Distill Studio", color: "#0ea5e9" },
  precise_word: { name: "Lex Lab", color: "#d946ef" },
  code_exercise: { name: "Terminal Pod", color: "#10b981" },
  pitch: { name: "Pitch Deck", color: "#fb7185" },
  video_understanding: { name: "Screening Room", color: "#f43f5e" },
  neural_net_fix: { name: "Model Pit", color: "#c084fc" },
  startup_sim: { name: "Founder Floor", color: "#eab308" },
  longterm: { name: "Memory Vault", color: "#64748b" },
};
const PRAX_LOCAL_GAME_CATALOG = {
  memory: { icon: "🧠", desc: "Flash words, then recall what you saw." },
  working_memory: { icon: "🔢", desc: "Memorize digits — answer backwards." },
  math: { icon: "➗", desc: "Rapid mental math under the clock.", objective: "Solve each problem mentally — enter the answer and press Go before the timer expires." },
  logic: { icon: "🧩", desc: "Deduce the answer from clue grids." },
  spelling: { icon: "✏️", desc: "Pick the correctly spelled word before time runs out.", objective: "Read the prompt, then tap the correctly spelled word before time runs out." },
  time_estimation: { icon: "⏱️", desc: "Feel the seconds — stop on the hidden target." },
  signal_storm: { icon: "⚡", desc: "Tap matching symbols in the particle storm." },
  focus_pulse: { icon: "◎", desc: "React when a moving pulse locks onto its target." },
  memory_constellation: { icon: "✨", desc: "Trace the star path from memory." },
  circuit_sprint: { icon: "🔌", desc: "Wire logic gates so the outputs light up.", objective: "Pick chips from the tray and fill every slot so all outputs light the bulb — press Energize when ready." },
  time_forge: { icon: "🔨", desc: "Strike when the power bar hits the sweet zone.", objective: "Watch the needle sweep the bar — click STRIKE when it crosses the green sweet zone. Average your strikes." },
  hardware: {
    icon: "⚙️",
    desc: "Pick a mode — Ohm's law to robot chains. Three focused questions per run.",
    objective: "Choose a Hardware Bay mode, answer three focused questions, and advance the track. Fractions like 5/8 are accepted.",
  },
  comprehension: { icon: "📖", desc: "Read, then answer from the passage." },
  summarizing: { icon: "📝", desc: "Distill the gist in your own words." },
  precise_word: { icon: "🎯", desc: "Choose the most precise vocabulary." },
  code_exercise: { icon: "💻", desc: "Solve a bite-sized coding challenge." },
  pitch: { icon: "🎤", desc: "Pitch an idea clearly and persuasively." },
  video_understanding: { icon: "🎬", desc: "Learn a topic, then ace the quiz." },
  neural_net_fix: { icon: "🧬", desc: "Debug a broken neural network challenge." },
  startup_sim: { icon: "🚀", desc: "Fast entrepreneurship simulation rounds." },
  longterm: { icon: "🌙", desc: "Learn today — recall tomorrow." },
};
const ARC_SIGNAL_SYMBOLS = [
  { id: "tri", shape: "triangle", hue: 0 },
  { id: "sq", shape: "square", hue: 120 },
  { id: "hex", shape: "hexagon", hue: 210 },
  { id: "cir", shape: "circle", hue: 280 },
  { id: "dia", shape: "diamond", hue: 45 },
  { id: "star", shape: "star", hue: 330 },
];
const ARC_LEAGUES = {
  campus: { id: "campus", label: "Campus", min: 0, max: 19, accent: "#14b8a6", accent2: "#3b82f6", glow: "rgba(20,184,166,0.35)" },
  founder: { id: "founder", label: "Founder", min: 20, max: 49, accent: "#f59e0b", accent2: "#8b5cf6", glow: "rgba(245,158,11,0.35)" },
  mythic: { id: "mythic", label: "Mythic", min: 50, max: Infinity, accent: "#dc2626", accent2: "#fbbf24", glow: "rgba(220,38,38,0.4)" },
};
const ARC_RIVAL_POOL = {
  campus: [
    { name: "Mika", epithet: "Volt", taunts: ["Campus circuits fear my reflexes.", "Your streak ends here.", "I've drilled every drill."] },
    { name: "Juno", epithet: "Cipher", taunts: ["Logic is my playground.", "Decode this loss.", "Patterns don't lie — I win."] },
    { name: "Kai", epithet: "Drift", taunts: ["Slow minds sink.", "Catch me if you can.", "Memory lanes? I own them."] },
  ],
  founder: [
    { name: "Mika", epithet: "Volt", taunts: ["Founder League forged me.", "Your trophies are rent.", "Adaptive? So am I."] },
    { name: "Sable", epithet: "Nova", taunts: ["Constellations bow to me.", "Signal lost. Match won.", "I've seen your tells."] },
    { name: "Orion", epithet: "Forge", taunts: ["Campus was practice.", "Founder heat melts excuses.", "Three rounds. Zero mercy."] },
  ],
  mythic: [
    { name: "Myth", epithet: "Crown", taunts: ["Mythic minds don't blink.", "Gold league, iron will.", "You're fodder for legend."] },
    { name: "Vex", epithet: "Eclipse", taunts: ["Shadow your every answer.", "Crimson tier. Clear lane.", "Trophies can't save you."] },
    { name: "Sol", epithet: "Apex", taunts: ["The sun doesn't negotiate.", "Perfection or perish.", "Final boss energy."] },
  ],
};
const ARC_RIVAL_OS_LINES = {
  intro: {
    precision: [
      "Your blueprint runs fail. I train precision.",
      "Exit codes red on your graphs — green on my board.",
      "I read your broken workflow receipts. Perfect practice for me.",
      "Your automation stumbles. My aim doesn't.",
      "Failed runs in the log — I'll exploit every gap.",
      "Blueprint errors are my training data.",
      "Your graphs crash. My patterns won't.",
      "Non-zero exits? I exit with your win streak.",
      "Sloppy runs forge sharp rivals.",
      "I studied your failed blueprint — precision is my counter.",
      "Your nodes fault out. I don't.",
      "Crash receipts filed. Precision loaded.",
    ],
    discipline: [
      "You've been painting your days. Won't save you.",
      "Nice streak on the planner. I streak on wins.",
      "Day after day saved — cute. I save my best for crushing you.",
      "Your calendar glows. My scoreboard will too.",
      "Discipline on paper. Chaos in the arena.",
      "I see those saved days. Still won't slow me down.",
      "Planner streaks burn bright — so do my openings.",
      "You banked days. I'm banking your mistakes.",
      "Saved every day? Save some dignity for after this match.",
      "Your planner remembers. So do I.",
      "Streak intact? Not after this.",
      "Painted days, blank score — let's fix that.",
    ],
    slow_start: [
      "Three days dark on the planner. Slow start, slow finish.",
      "Haven't seen your planner in days. Rust shows.",
      "No planner receipts lately — I trained while you drifted.",
      "Your OS went quiet. I went loud.",
      "Slow start detected. Faster loss incoming.",
      "Planner silence is a tell. I read it.",
      "Days without a saved plan — easy pickings.",
      "You've been away from the planner. I haven't been away from training.",
      "Ghost town in your receipts. I'm not ghosting this win.",
      "No plan, no pace — I set the pace.",
      "Three-day planner gap. I'm filling it with pressure.",
      "I trained your slow starts. Ready?",
    ],
    fallback: [
      "Ready to lose?",
      "Your streak ends here.",
      "I've drilled every drill.",
      "Patterns don't lie — I win.",
      "Adaptive? So am I.",
      "I've seen your tells.",
      "Three rounds. Zero mercy.",
      "Campus circuits fear my reflexes.",
      "Catch me if you can.",
      "Decode this loss.",
      "Your trophies are rent.",
      "Final boss energy.",
    ],
  },
  post: {
    morning_plan: [
      "You plan mornings — I'll strike your afternoons.",
      "Dawn receipts logged. I'll haunt your post-lunch focus.",
      "Morning planner energy — afternoon is mine.",
      "You paint AM blocks; I'll drain your PM.",
      "Early-day discipline noted. Late-day holes are next.",
      "Sunrise plans won't guard your sunset rounds.",
      "I saw the morning saves — afternoons are unguarded.",
      "Your planner wakes early. I wake when you fade.",
      "AM receipts filed. PM pressure loaded.",
      "Morning streaks end when the clock turns.",
      "You schedule dawn — I'll own dusk.",
      "First-half plans, second-half traps.",
    ],
    afternoon_plan: [
      "You plan afternoons — I'll hit your mornings.",
      "Post-lunch receipts mean pre-lunch gaps.",
      "Afternoon blocks logged. Morning reflexes next.",
      "You save days after noon — I'll strike before.",
      "PM planner habits — AM ambush incoming.",
      "Your receipts cluster late; I'll open early.",
      "Afternoon discipline noted. Morning is soft.",
      "You schedule the back half — I'll front-run you.",
      "Late-day saves won't cover early-round losses.",
      "PM patterns mapped. AM feints loaded.",
      "You plan after lunch — I'll spoil breakfast focus.",
      "Second-half habits, first-half counters.",
    ],
    split_plan: [
      "You spread plans all day — I'll isolate your weak hour.",
      "Full-day receipts — I'll find the one dead slot.",
      "Every block planned; one crack is enough.",
      "All-day planner noise — I'll tune to your dip.",
      "You cover morning and afternoon — I hunt the seam.",
      "Receipts all day; fatigue still has a timestamp.",
      "Total coverage? I'll stress the thinnest minute.",
      "Your OS runs wide — I cut narrow.",
      "Planned dawn to dusk — I'll pick off the lull.",
      "Full schedule logged. One gap remains.",
      "You paint the whole canvas — I aim at the smudge.",
      "All-day discipline — I'll test the edges.",
    ],
    blueprint_adapt: [
      "Your blueprint misfires — I'll train cleaner execution.",
      "Failed runs noted. Next match: tighter logic.",
      "Exit codes logged — I'll exploit sloppy nodes.",
      "Broken graphs in your receipts — sharp drills in mine.",
      "Automation faults read — precision counters loaded.",
      "Your workflow stumbles — I'll sprint the gaps.",
      "Non-zero exits become my curriculum.",
      "Blueprint noise in your OS — signal in mine.",
      "Crash receipts filed. I'll drill the weak branch.",
      "Your runs fault — I'll finish clean.",
      "Graph errors mapped. Counter patterns armed.",
      "Workflow slips — I'll tighten the screws.",
    ],
    discipline: [
      "Saved days won't save this score — I'll adapt to your rhythm.",
      "Planner streak noted — I'll break it in the drills.",
      "Your day_saved chain — I'll link it to losses.",
      "Discipline in receipts; pressure in the next rounds.",
      "Streak on the calendar — I'll streak on counters.",
      "Painted days read — I'll paint over your habits.",
      "Saved-day rhythm mapped. Off-beat rounds next.",
      "Your planner streak ends where my training starts.",
      "Day after day saved — I'll save my hardest counters.",
      "Receipt discipline logged — adaptive drills armed.",
      "Your saved days echo — I'll answer louder.",
      "Planner streaks fuel my next adaptation.",
    ],
    slow_start: [
      "Planner silence read — I'll punish slow openings.",
      "No recent saves — I'll force early pressure.",
      "Three-day gap noted. Warm-up ends now.",
      "Quiet OS — loud openers from me next.",
      "Slow-start receipts — fast-start counters loaded.",
      "You drifted from the planner — I'll drift your focus.",
      "Gap days logged. No mercy on round one next time.",
      "Inactive planner — active ambush incoming.",
      "Your OS idled — I didn't.",
      "Missing saves mean missing guardrails — I'll exploit them.",
      "Planner dark streak — spotlight on your weak starts.",
      "No receipts lately — yes, I noticed.",
    ],
    fallback: [
      "Keep training.",
      "I'll be sharper next round.",
      "Patterns logged — adaptation incoming.",
      "Your tells are filed.",
      "Another match, another counter.",
      "I learn faster than you think.",
      "Scoreboard shifts — so do I.",
      "Round over. Homework assigned.",
      "Your move. My counter is ready.",
      "Match logged. Adaptation queued.",
      "Next time hits different.",
      "Training never stops — for either of us.",
    ],
  },
};
const ARC_RIVAL_OS_LAST_INTRO_KEY = "arcadeRivalOsLastIntro";
const ARC_RIVAL_OS_LAST_POST_KEY = "arcadeRivalOsLastPost";
const ARC_LAST_MATCH_KEY = "arcadeLastMatch";
const ARC_TROPHY_ROAD = [
  { node: 1, label: "+50 coins", reward: "coins", amount: 50 },
  { node: 2, label: "Campus rival", reward: "rival_unlock" },
  { node: 3, label: "Signal Storm badge", reward: "badge_signal" },
  { node: 4, label: "+75 coins", reward: "coins", amount: 75 },
  { node: 5, label: "Bronze chest", reward: "cosmetic_bronze" },
  { node: 6, label: "Constellation skin", reward: "skin_constellation" },
  { node: 7, label: "+1 bonus trophy", reward: "bonus_trophy" },
  { node: 8, label: "Rival dialogue pack", reward: "dialogue_pack" },
  { node: 9, label: "+100 coins", reward: "coins", amount: 100 },
  { node: 10, label: "Founder qualifier", reward: "founder_qualifier" },
];
const PRAX_NAMES = ["Amara", "Boris", "Chen", "Dara", "Elan", "Farid", "Gita", "Hana", "Ivo", "Jael"];
const PRAX_WORD_BANK = [
  "river", "mountain", "candle", "whisper", "orbit", "granite", "harbor", "violet", "thunder",
  "lantern", "meadow", "compass", "ember", "glacier", "velvet", "horizon", "cinder", "willow",
  "quartz", "falcon", "marble", "prairie", "citrus", "amber", "canyon", "driftwood", "flint",
  "juniper", "cobalt", "sable", "tundra", "opal", "birch", "cedar", "delta", "ivory", "pebble",
  "reef", "spruce", "tide",
];
const PRAX_RELATIONS = [
  ["is taller than", "the tallest", "the shortest"],
  ["is older than", "the oldest", "the youngest"],
  ["is faster than", "the fastest", "the slowest"],
  ["scored higher than", "the top scorer", "the lowest scorer"],
  ["arrived earlier than", "the first to arrive", "the last to arrive"],
];
const PRAX_ORDINALS = ["first", "second", "third", "fourth", "fifth"];
const PRAX_WM_COLORS = ["#f43f5e", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#06b6d4"];

function praxEnsureStyles() {
  if (PRACTICE_STYLES_INJECTED) return;
  PRACTICE_STYLES_INJECTED = true;
  const el = document.createElement("style");
  el.id = "prax-styles";
  el.textContent = `
    @keyframes prax-xp-fill { from { width: 0%; } }
    @keyframes prax-round-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
    @keyframes prax-celebrate { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,200,50,0); }
      50% { transform: scale(1.03); box-shadow: 0 0 28px rgba(255,200,50,0.45); } }
    @keyframes prax-flame { 0%, 100% { transform: scale(1) rotate(-2deg); } 50% { transform: scale(1.08) rotate(2deg); } }
    .prax-quests-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-bottom: 10px; }
    .prax-hero-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
      background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), rgba(251,191,36,0.08));
      border: 1px solid var(--gridline); border-radius: 10px; padding: 8px 14px; margin-bottom: 14px; font-size: 13px; }
    .prax-hero-strip-item { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .prax-level-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); padding: 3px 8px; border-radius: 999px; }
    .prax-coins-inline { font-weight: 800; color: #fbbf24; font-variant-numeric: tabular-nums; }
    .prax-streak { display: flex; align-items: center; gap: 4px; font-weight: 700; }
    .prax-streak-flame { display: inline-block; animation: prax-flame 1.2s ease-in-out infinite; font-size: 16px; }
    .prax-xp-inline { flex: 1 1 120px; min-width: 100px; max-width: 280px; }
    .prax-xp-track { height: 8px; background: var(--gridline); border-radius: 999px; overflow: hidden; }
    .prax-xp-fill { height: 100%; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #fbbf24), #fbbf24);
      border-radius: 999px; animation: prax-xp-fill 0.9s ease-out forwards; transition: width 0.6s ease; min-width: 2px; }
    .prax-daily { background: linear-gradient(120deg, rgba(251,191,36,0.18), rgba(236,72,153,0.12));
      border: 2px solid rgba(251,191,36,0.45); border-radius: 12px; padding: 12px 14px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .prax-daily-tag { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
      color: #fbbf24; background: rgba(0,0,0,0.2); padding: 3px 8px; border-radius: 4px; }
    .prax-daily-mult { font-size: 18px; font-weight: 900; color: #fbbf24; }
    .prax-section-title { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--ink-muted); margin: 14px 0 8px; }
    .prax-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-bottom: 14px; }
    .prax-tile { background: var(--surface, var(--card)); border: 1px solid var(--gridline); border-radius: 10px;
      padding: 10px; display: flex; flex-direction: column; gap: 6px; position: relative;
      transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s; }
    .prax-tile:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 15%, transparent); }
    .prax-tile-daily { border-color: rgba(251,191,36,0.5); }
    .prax-tile-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; }
    .prax-tile-name { font-size: 13px; font-weight: 700; line-height: 1.2; flex: 1; }
    .prax-tile-info { background: none; border: none; cursor: pointer; font-size: 14px; line-height: 1;
      color: var(--ink-muted); padding: 0 2px; opacity: 0.5; transition: opacity 0.15s; }
    .prax-tile:hover .prax-tile-info, .prax-tile-info:focus { opacity: 1; }
    .prax-tile-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .prax-diff { display: flex; gap: 2px; }
    .prax-diff-seg { width: 6px; height: 10px; border-radius: 2px; background: var(--gridline); }
    .prax-diff-seg.on { background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white)); }
    .prax-medal { font-size: 18px; line-height: 1; }
    .prax-medal-none { font-size: 10px; color: var(--ink-muted); }
    .prax-tile-details { display: none; font-size: 10px; color: var(--ink-muted); gap: 6px; align-items: center; flex-wrap: wrap; }
    .prax-tile:hover .prax-tile-details, .prax-tile.prax-tile-info-open .prax-tile-details { display: flex; }
    .prax-tile-actions { display: flex; gap: 4px; margin-top: auto; }
    .prax-tile-actions .practice-play { flex: 1; padding: 6px 10px; font-size: 13px; }
    .prax-tile-actions .practice-history { flex: 0 0 auto; padding: 4px 8px; font-size: 12px; display: none; }
    .prax-tile:hover .prax-tile-actions .practice-history, .prax-tile.prax-tile-info-open .prax-tile-actions .practice-history { display: inline-flex; }
    html.device-phone .prax-tile-info, html.device-coarse .prax-tile-info { min-width: 40px; min-height: 40px; opacity: 1; }
    html.device-phone .prax-tile-details, html.device-coarse .prax-tile-details { display: flex; }
    html.device-phone .prax-tile-actions .practice-history,
    html.device-coarse .prax-tile-actions .practice-history { display: inline-flex; min-height: 40px; }
    html.device-phone .prax-tile-actions .practice-play,
    html.device-coarse .prax-tile-actions .practice-play { min-height: 40px; }
    @media (max-width:600px), (pointer:coarse), (hover:none) {
      .prax-tile-info { opacity: 1; }
      .prax-tile-details { display: flex; }
      .prax-tile-actions .practice-history { display: inline-flex; min-height: 40px; }
      .prax-tile-actions .practice-play { min-height: 40px; }
    }
    .prax-launch-options { display: none; gap: 7px; padding: 9px; border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--gridline)); border-radius: 9px; background: color-mix(in srgb, var(--accent) 7%, var(--surface, var(--card))); }
    .prax-tile.prax-options-open .prax-launch-options { display: grid; }
    .prax-launch-options label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--ink-secondary); font-size: 10px; font-weight: 700; }
    .prax-launch-options input[type=range] { min-width: 0; width: 100%; accent-color: var(--accent); }
    .prax-launch-diff-value { color: var(--accent); font-weight: 900; min-width: 18px; text-align: right; }
    .prax-launch-mode-note { margin: 0; color: var(--ink-muted); font-size: 9px; line-height: 1.35; }
    .prax-launch-go { width: 100%; padding: 6px 9px; font-size: 11px; }
    .prax-round-enter { animation: prax-round-in 0.45s ease-out; }
    .prax-result { text-align: center; padding: 24px 16px !important; }
    .prax-result-score { font-size: 56px; font-weight: 900; line-height: 1; color: var(--accent);
      font-variant-numeric: tabular-nums; margin: 8px 0; }
    .prax-result-medal { font-size: 48px; margin: 4px 0; }
    .prax-result-coins { font-size: 20px; font-weight: 700; color: #fbbf24; margin: 8px 0; }
    .prax-result-xp { font-size: 14px; font-weight: 600; color: var(--accent); margin: 2px 0 6px; }
    .arc-reward-xp { font-size: 16px; font-weight: 700; color: var(--arc-accent2, var(--accent)); font-variant-numeric: tabular-nums; margin-top: 4px; }
    .prax-result-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
    .prax-flop-panel { max-width: 520px; margin: 16px auto 4px; padding: 14px 16px; text-align: left;
      border: 1px solid color-mix(in srgb, var(--status-warning) 50%, var(--gridline)); border-radius: 12px;
      background: color-mix(in srgb, var(--status-warning) 8%, rgba(0,0,0,0.18)); }
    .prax-flop-panel h3 { margin: 0 0 8px; font-size: 14px; color: var(--ink-primary); }
    .prax-flop-reasons { margin: 0; padding-left: 18px; color: var(--ink-secondary); font-size: 13px; line-height: 1.5; }
    .prax-flop-actions { margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .prax-flop-actions .prax-game-btn { min-width: 0; padding: 8px 12px; font-size: 12px; }
    .prax-flop-offline { color: var(--ink-muted); font-size: 11px; }
    .prax-celebrate { animation: prax-celebrate 1.4s ease-in-out 2; border-color: rgba(251,191,36,0.6) !important; }
    .prax-round-card { border-radius: 12px; }
    @keyframes prax-stage-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
    @keyframes prax-timer-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
    @keyframes prax-combo-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
    @keyframes prax-combo-fire { 0%, 100% { filter: drop-shadow(0 0 6px #f97316); } 50% { filter: drop-shadow(0 0 18px #ef4444); } }
    @keyframes prax-score-pop { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-48px) scale(1.15); } }
    @keyframes prax-wrong-flash { 0% { box-shadow: inset 0 0 0 0 rgba(239,68,68,0); } 40% { box-shadow: inset 0 0 0 6px rgba(239,68,68,0.75); } 100% { box-shadow: inset 0 0 0 0 rgba(239,68,68,0); } }
    @keyframes prax-coin-fall { from { transform: translateY(-20px) rotate(0deg); opacity: 1; } to { transform: translateY(110vh) rotate(360deg); opacity: 0.2; } }
    @keyframes prax-ring-draw { from { stroke-dashoffset: 283; } }
    @keyframes prax-decoy-drift { 0% { transform: translate(0,0) scale(1); opacity: 0.5; } 100% { transform: translate(var(--dx), var(--dy)) scale(1.2); opacity: 0; } }
    .prax-stage-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(6,8,16,0.92); display: flex; align-items: stretch; justify-content: center; backdrop-filter: blur(6px); color: #eee; }
    .prax-stage-panel { flex: 1; display: flex; flex-direction: column; max-width: 960px; margin: 0 auto; width: 100%; color: #eee; }
    .prax-stage-enter { animation: prax-stage-in 0.22s ease-out; }
    .prax-stage-topbar { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap; }
    .prax-stage-title { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; flex: 1 1 140px; }
    .prax-stage-diff { font-size: 11px; font-weight: 700; color: #ccc; text-transform: uppercase; letter-spacing: 0.08em; }
    .prax-stage-timer-wrap { flex: 1 1 120px; height: 10px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; min-width: 80px; }
    .prax-stage-timer-bar { height: 100%; width: 100%; background: linear-gradient(90deg, #22c55e, #84cc16); border-radius: 999px; transform-origin: left center; transition: width 0.1s linear, background 0.2s; }
    .prax-stage-timer-bar.critical { background: linear-gradient(90deg, #ef4444, #f97316); animation: prax-timer-pulse 0.55s ease-in-out infinite; }
    .prax-stage-combo { font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums; min-width: 48px; text-align: center; color: #fbbf24; }
    .prax-stage-combo.x2 { text-shadow: 0 0 12px rgba(251,191,36,0.8); }
    .prax-stage-combo.x3 { animation: prax-combo-shake 0.35s ease-in-out infinite; text-shadow: 0 0 16px rgba(251,191,36,0.9); }
    .prax-stage-combo.x4 { animation: prax-combo-fire 0.5s ease-in-out infinite; color: #fb923c; }
    .prax-stage-quit { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: inherit; padding: 6px 12px; cursor: pointer; font-weight: 700; }
    .prax-stage-quit:hover { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.5); }
    .prax-stage-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 20px 32px; overflow-y: auto; text-align: center; position: relative; }
    .prax-stage-fx { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .prax-stage-wrong-flash { animation: prax-wrong-flash 0.45s ease-out; }
    .prax-game-prompt { font-size: clamp(22px, 4vw, 36px); font-weight: 800; line-height: 1.2; margin-bottom: 16px; }
    .prax-game-sub { font-size: 14px; color: #ddd; margin-bottom: 14px; }
    .prax-game-clues { text-align: left; max-width: 520px; margin: 0 auto 16px; font-size: 17px; line-height: 1.55; color: #eee; }
    .prax-game-clues li { margin: 6px 0; }
    .prax-game-options { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-width: 560px; }
    .prax-game-btn { font-size: 18px; font-weight: 700; padding: 14px 22px; border-radius: 12px; min-width: 120px; cursor: pointer; border: 2px solid var(--gridline); background: var(--surface, var(--card)); transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
    .prax-game-btn:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 28%, transparent); }
    .prax-game-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .prax-game-btn.correct { border-color: #22c55e; box-shadow: 0 0 20px rgba(34,197,94,0.4); }
    .prax-game-btn.wrong { border-color: #ef4444; color: #eee; }
    .prax-game-input { font-size: 28px; font-weight: 800; letter-spacing: 4px; text-align: center; padding: 12px 16px; width: min(320px, 90vw); border-radius: 12px; border: 2px solid var(--gridline); background: var(--surface, var(--card)); font-variant-numeric: tabular-nums; transition: border-color 0.2s, box-shadow 0.2s; }
    .prax-game-input.correct { border-color: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.35); }
    .prax-game-input.wrong { border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.35); }
    .prax-game-progress { font-size: 14px; font-weight: 700; color: #ddd; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px; }
    .prax-flash-word { font-size: clamp(36px, 8vw, 64px); font-weight: 900; letter-spacing: 0.06em; }
    .prax-wm-stage { position: relative; width: min(480px, 92vw); height: 220px; margin: 0 auto; }
    .prax-wm-digit { position: absolute; font-size: 42px; font-weight: 900; font-variant-numeric: tabular-nums; transform: translate(-50%, -50%); }
    .prax-score-popup { position: absolute; left: 50%; top: 45%; transform: translateX(-50%); font-size: 32px; font-weight: 900; color: #fbbf24; pointer-events: none; animation: prax-score-pop 0.85s ease-out forwards; z-index: 5; }
    .prax-result-stage { width: 100%; max-width: 520px; }
    .prax-result-ring-wrap { position: relative; width: 140px; height: 140px; margin: 0 auto 12px; }
    .prax-result-ring { transform: rotate(-90deg); }
    .prax-result-ring-bg { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 10; }
    .prax-result-ring-fg { fill: none; stroke: var(--accent); stroke-width: 10; stroke-linecap: round; stroke-dasharray: 283; animation: prax-ring-draw 1.1s ease-out forwards; }
    .prax-result-ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 900; }
    .prax-result-stat-row { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin: 14px 0; }
    .prax-result-stat { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 10px 16px; min-width: 90px; }
    .prax-result-stat label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #ccc; }
    .prax-result-stat span { font-size: 22px; font-weight: 800; }
    .prax-coin { position: absolute; font-size: 22px; animation: prax-coin-fall linear forwards; pointer-events: none; }
    .prax-decoy { position: absolute; font-size: 28px; animation: prax-decoy-drift 1.4s ease-out forwards; pointer-events: none; }
    .prax-memory-order { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; min-height: 44px; margin: 12px 0; padding: 10px; border: 2px dashed var(--gridline); border-radius: 12px; min-width: min(480px, 90vw); }
    .prax-math-feedback { min-height: 22px; margin-top: 8px; font-weight: 800; font-size: 14px; letter-spacing: 0.04em; }
    .prax-chip { font-size: 16px; font-weight: 700; padding: 10px 14px; border-radius: 10px; cursor: pointer; border: 2px solid var(--gridline); background: var(--surface, var(--card)); }
    .prax-chip.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, transparent); }
    .prax-chip.used { color: #aaa; pointer-events: none; }
    .prax-dcheck { background: linear-gradient(120deg, rgba(34,211,238,0.14), color-mix(in srgb, var(--accent) 10%, transparent));
      border: 2px solid rgba(34,211,238,0.4); border-radius: 12px; padding: 12px 14px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .prax-dcheck-tag { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
      color: #22d3ee; background: rgba(0,0,0,0.2); padding: 3px 8px; border-radius: 4px; }
    .prax-dcheck-score { font-size: 28px; font-weight: 900; color: #22d3ee; font-variant-numeric: tabular-nums; line-height: 1; }
    .prax-dcheck-spark { display: flex; align-items: flex-end; gap: 2px; height: 24px; margin-top: 6px; }
    .prax-dcheck-bar { flex: 1; min-width: 3px; background: rgba(34,211,238,0.25); border-radius: 2px 2px 0 0; }
    .prax-dcheck-bar.on { background: linear-gradient(180deg, #22d3ee, var(--accent)); }
    .prax-dcheck-comp { margin-top: 6px; display: none; }
    .prax-dcheck:hover .prax-dcheck-comp, .prax-dcheck.prax-dcheck-expanded .prax-dcheck-comp { display: block; }
    .prax-dcheck-comp-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; font-size: 10px; }
    .prax-dcheck-comp-row label { width: 52px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-muted); }
    .prax-dcheck-comp-track { flex: 1; height: 5px; background: var(--gridline); border-radius: 999px; overflow: hidden; }
    .prax-dcheck-comp-fill { height: 100%; background: linear-gradient(90deg, #22d3ee, var(--accent)); border-radius: 999px; }
    .prax-dcheck-energy { font-size: 11px; font-weight: 700; color: #a5f3fc; }
    .prax-stroop-word { font-size: clamp(40px, 9vw, 72px); font-weight: 900; letter-spacing: 0.08em; }
    .prax-stroop-ink { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 16px; }
    .prax-stroop-swatch { width: 56px; height: 56px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.2); cursor: pointer; transition: transform 0.12s; }
    .prax-stroop-swatch:hover { transform: scale(1.08); }
    .prax-reaction-stage { width: min(520px, 92vw); height: 200px; border-radius: 16px; border: 2px solid var(--gridline);
      display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; cursor: pointer;
      transition: background 0.08s, border-color 0.08s; user-select: none; }
    .prax-reaction-stage.wait { background: rgba(255,255,255,0.04); color: #ddd; }
    .prax-reaction-stage.go { background: #22c55e; border-color: #4ade80; color: #052e16; box-shadow: 0 0 40px rgba(34,197,94,0.5); }
    .prax-reaction-stage.early { background: #ef4444; border-color: #f87171; color: #fff; }
    .rwd-panel { background: var(--surface, var(--card)); border: 1px solid var(--gridline); border-radius: 10px;
      margin-bottom: 14px; overflow: hidden; }
    .rwd-strip { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px;
      cursor: pointer; font-size: 13px; user-select: none; transition: background 0.15s; }
    .rwd-strip:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
    .rwd-strip-label { font-weight: 600; flex: 1; }
    .rwd-strip-prog { font-variant-numeric: tabular-nums; color: var(--ink-muted); font-size: 12px; }
    .rwd-strip-chevron { color: var(--ink-muted); font-size: 11px; transition: transform 0.2s; }
    .rwd-panel.expanded .rwd-strip-chevron { transform: rotate(180deg); }
    .rwd-panel-body { display: none; padding: 0 14px 14px; border-top: 1px solid var(--gridline); }
    .rwd-panel.expanded .rwd-panel-body { display: block; }
    .rwd-panel-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); margin: 12px 0 10px; }
    .rwd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .rwd-card { border: 2px solid var(--gridline); border-radius: 14px; padding: 12px 10px 10px; text-align: center; min-height: 142px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; position: relative; overflow: hidden;
      transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease; }
    .rwd-card.unlocked { border-color: var(--accent); box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 28%, transparent); }
    .rwd-card.unlocked::after { content: ""; position: absolute; inset: -40% -60%; background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.14) 50%, transparent 58%);
      transform: translateX(-120%); animation: rwd-card-shimmer 4.5s ease-in-out infinite; pointer-events: none; }
    @keyframes rwd-card-shimmer { 0%, 72% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
    .rwd-card.locked { opacity: 0.68; background: linear-gradient(160deg, rgba(255,255,255,0.04), rgba(0,0,0,0.18)); }
    .rwd-card--aurora.unlocked { --rwd-glow: rgba(34,211,238,0.45); background: linear-gradient(155deg, rgba(34,211,238,0.22), rgba(6,78,99,0.1) 55%, rgba(8,12,20,0.5)); border-color: #22d3ee; }
    .rwd-card--confetti.unlocked { --rwd-glow: rgba(236,72,153,0.4); background: linear-gradient(155deg, rgba(168,85,247,0.18), rgba(236,72,153,0.14) 50%, rgba(8,12,20,0.45)); border-color: #e879f9; }
    .rwd-card--ember.unlocked { --rwd-glow: rgba(249,115,22,0.45); background: linear-gradient(155deg, rgba(249,115,22,0.24), rgba(154,52,18,0.12) 55%, rgba(8,12,20,0.5)); border-color: #f97316; }
    .rwd-card--midnight.unlocked { --rwd-glow: rgba(99,102,241,0.45); background: linear-gradient(155deg, rgba(99,102,241,0.26), rgba(30,27,75,0.35) 50%, rgba(3,7,18,0.65)); border-color: #818cf8; }
    .rwd-card--solstice.unlocked { --rwd-glow: rgba(234,179,8,0.42); background: linear-gradient(155deg, rgba(234,179,8,0.22), rgba(180,83,9,0.14) 55%, rgba(8,12,20,0.5)); border-color: #eab308; }
    .rwd-card.unlocked:hover { transform: translateY(-2px); box-shadow: 0 0 22px var(--rwd-glow, color-mix(in srgb, var(--accent) 32%, transparent)); }
    .rwd-earn-hint { font-size: 12px; line-height: 1.45; color: var(--ink-muted); margin: -4px 0 12px; }
    @keyframes rwd-card-applied { 0%, 100% { transform: scale(1); } 35% { transform: scale(1.08); box-shadow: 0 0 32px var(--rwd-glow, color-mix(in srgb, var(--accent) 45%, transparent)); }
      65% { transform: scale(1.04); } }
    .rwd-card.rwd-applied { animation: rwd-card-applied 0.38s ease-out; }
    .rwd-card-icon { font-size: 28px; line-height: 1; }
    .rwd-card-name { font-size: 13px; font-weight: 700; }
    .rwd-card-effect { display: block; font-size: 10px; line-height: 1.35; color: var(--ink-muted); margin: 2px 0 4px; }
    .rwd-card-prog { font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
    .rwd-card.active { outline: 2px solid var(--accent); }
    .rwd-unlock-overlay { position: fixed; inset: 0; z-index: 95000; display: flex; align-items: center; justify-content: center;
      background: rgba(4,6,14,0.88); backdrop-filter: blur(8px); animation: prax-stage-in 0.5s ease-out; }
    .rwd-unlock-card { text-align: center; padding: 40px 32px; border-radius: 20px; border: 2px solid var(--accent);
      background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 20%, transparent), rgba(0,0,0,0.5)); max-width: 420px;
      box-shadow: 0 0 60px color-mix(in srgb, var(--accent) 40%, transparent); }
    .rwd-unlock-card h2 { font-size: 28px; margin: 12px 0 8px; }
    .rwd-unlock-card p { color: var(--ink-muted); margin-bottom: 20px; }
    .rwd-road-wrap { margin: 0 0 14px; }
    .rwd-road-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .rwd-road-title { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #fbbf24; }
    .rwd-road-meta { font-size: 11px; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
    .rwd-road { position: relative; overflow-x: auto; padding: 10px 4px 14px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
    .rwd-road-bar { position: absolute; left: 48px; right: 48px; top: 34px; height: 4px; background: var(--gridline); border-radius: 999px; z-index: 0; pointer-events: none; }
    .rwd-road-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #fbbf24, var(--accent)); transition: width 0.55s ease; min-width: 2px; }
    .rwd-road-track { display: flex; gap: 0; min-width: min-content; position: relative; z-index: 1; padding: 0 32px; }
    .rwd-road-node { flex: 0 0 104px; scroll-snap-align: center; text-align: center; position: relative; }
    .rwd-road-node::before { content: ""; position: absolute; top: 24px; left: -50%; right: 50%; height: 3px; background: rgba(255,255,255,0.1); z-index: 0; }
    .rwd-road-node:first-child::before { display: none; }
    .rwd-road-node.done::before { background: linear-gradient(90deg, #fbbf24, var(--accent)); }
    .rwd-road-dot { width: 50px; height: 50px; border-radius: 50%; margin: 0 auto 6px; border: 2px solid var(--gridline);
      background: var(--surface, var(--card)); display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800; position: relative; z-index: 1; transition: border-color 0.2s, box-shadow 0.2s; }
    .rwd-road-node.current .rwd-road-dot { border-color: #fbbf24; box-shadow: 0 0 18px rgba(251,191,36,0.42); color: #fbbf24; }
    .rwd-road-node.done .rwd-road-dot { border-color: var(--accent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent); }
    .rwd-road-node.locked { opacity: 0.58; }
    .rwd-road-swatch { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 18px; line-height: 1; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18); }
    .rwd-road-coins { font-size: 11px; font-variant-numeric: tabular-nums; font-weight: 800; }
    .rwd-road-lock { font-size: 16px; opacity: 0.7; }
    .rwd-road-label { font-size: 11px; font-weight: 700; line-height: 1.25; }
    .rwd-road-effect { font-size: 9px; line-height: 1.3; color: var(--ink-muted); margin-top: 1px; min-height: 22px; }
    .rwd-road-threshold { font-size: 10px; color: var(--ink-muted); font-variant-numeric: tabular-nums; margin-top: 2px; }
    .rwd-card-swatch { width: 100%; height: 36px; border-radius: 10px; margin-bottom: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), 0 4px 14px rgba(0,0,0,0.25); }
    .rwd-card.locked .rwd-card-swatch { filter: grayscale(0.35); }
    .rwd-card-unlock-reason { font-size: 10px; line-height: 1.35; color: var(--ink-muted); margin-top: 2px; }
    .rwd-loot-overlay { position: fixed; inset: 0; z-index: 95000; display: flex; align-items: center; justify-content: center;
      background: rgba(4,6,14,0.9); backdrop-filter: blur(8px); animation: prax-stage-in 0.45s ease-out; }
    .rwd-loot-panel { text-align: center; padding: 28px 24px; max-width: 380px; width: calc(100% - 32px); }
    .rwd-loot-sub { font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #fbbf24; margin: 0 0 16px; }
    .rwd-loot-chest { position: relative; width: 120px; height: 96px; margin: 0 auto 16px; cursor: pointer; }
    .rwd-loot-chest-body { position: absolute; bottom: 0; left: 10%; right: 10%; height: 58%; border-radius: 8px 8px 12px 12px;
      background: linear-gradient(180deg, #b45309, #78350f); border: 2px solid #fbbf24; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
    .rwd-loot-chest-lid { position: absolute; top: 18%; left: 6%; right: 6%; height: 38%; border-radius: 10px 10px 4px 4px;
      background: linear-gradient(180deg, #f59e0b, #b45309); border: 2px solid #fcd34d; transform-origin: center bottom;
      transition: transform 0.32s cubic-bezier(0.34, 1.2, 0.64, 1); z-index: 2; }
    .rwd-loot-chest-lid::after { content: ""; position: absolute; left: 50%; bottom: -6px; width: 18px; height: 12px; margin-left: -9px;
      background: #fcd34d; border-radius: 3px; }
    .rwd-loot-glow { position: absolute; inset: 20% 0 0; background: radial-gradient(ellipse at 50% 80%, rgba(251,191,36,0.55), transparent 70%);
      opacity: 0; transition: opacity 0.28s ease; pointer-events: none; }
    .rwd-loot-chest.open .rwd-loot-chest-lid { transform: translateY(-28px) rotateX(42deg); }
    .rwd-loot-chest.open .rwd-loot-glow { opacity: 1; }
    .rwd-loot-chest.shake { animation: rwd-chest-shake 0.28s ease-in-out; }
    @keyframes rwd-chest-shake { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } 75% { transform: rotate(-3deg); } }
    .rwd-loot-open-btn { margin-top: 4px; }
    .rwd-loot-reveal { margin-top: 8px; }
    .rwd-loot-reveal[hidden] { display: none !important; }
    .rwd-loot-reveal-in { animation: prax-stage-in 0.3s ease-out; }
    .arc-play-next-reward { margin: -8px auto 6px; max-width: 520px; text-align: center; font-size: 13px; line-height: 1.45;
      color: #ddd; padding: 0 12px; }
    .arc-play-next-reward strong { color: #fbbf24; }
    .arc-match-road-title { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted);
      text-align: center; margin: 0 0 4px; }
    .rwd-loot-skin-preview { width: 88px; height: 88px; border-radius: 50%; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center;
      font-size: 40px; line-height: 1; border: 3px solid rgba(255,255,255,0.25); box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 45%, transparent); }
    .rwd-loot-reveal h2 { font-size: 24px; margin: 0 0 6px; }
    .rwd-loot-reveal p { color: var(--ink-muted); margin: 0 0 8px; font-size: 14px; line-height: 1.45; }
    .rwd-loot-earn { font-size: 12px !important; color: #fbbf24 !important; font-weight: 700; }
    @media (max-width: 520px) {
      .rwd-road { overflow-x: visible; padding: 4px 0 10px; }
      .rwd-road-bar { display: none; }
      .rwd-road-track { flex-direction: column; align-items: stretch; gap: 0; padding: 0 4px; min-width: 0; }
      .rwd-road-node { flex: 0 0 auto; display: grid; grid-template-columns: 50px 1fr; grid-template-rows: auto auto auto auto; gap: 2px 10px; text-align: left; padding: 8px 0; border-left: 3px solid var(--gridline); margin-left: 24px; padding-left: 14px; }
      .rwd-road-node::before { display: none; }
      .rwd-road-node.done { border-left-color: var(--accent); }
      .rwd-road-node.current { border-left-color: #fbbf24; }
      .rwd-road-dot { margin: 0; grid-row: 1 / span 4; }
      .rwd-road-label, .rwd-road-effect, .rwd-road-threshold { grid-column: 2; }
    }
    .prax-vocab-learn { text-align: left; max-width: 480px; margin: 12px auto 0; font-size: 14px; line-height: 1.5; }
    .prax-vocab-learn li { margin: 6px 0; color: #ddd; }
    @keyframes arc-play-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.035); } }
    @keyframes arc-play-click-glow { 0%, 100% { box-shadow: inset 0 0 40px rgba(0,0,0,0.6), 0 0 32px var(--arc-glow); }
      45% { box-shadow: inset 0 0 28px rgba(0,0,0,0.45), 0 0 56px var(--arc-glow), 0 0 80px color-mix(in srgb, var(--arc-accent2) 35%, transparent); } }
    @keyframes arc-rim-spin { to { transform: rotate(360deg); } }
    @keyframes arc-orbit { to { transform: rotate(360deg); } }
    @keyframes arc-snap-black { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
    .arc-hub { --arc-accent: #14b8a6; --arc-accent2: #3b82f6; --arc-glow: rgba(20,184,166,0.35); }
    .arc-hub.league-founder { --arc-accent: #f59e0b; --arc-accent2: #8b5cf6; --arc-glow: rgba(245,158,11,0.35); }
    .arc-hub.league-mythic { --arc-accent: #dc2626; --arc-accent2: #fbbf24; --arc-glow: rgba(220,38,38,0.4); }
    .arc-play-wrap { display: flex; flex-direction: column; align-items: center; gap: 18px; margin: 20px 0 24px; position: relative; }
    .arc-play-btn { position: relative; width: 280px; height: 280px; border: none; background: transparent; cursor: pointer; padding: 0; outline: none; }
    .arc-play-btn:focus-visible .arc-play-core { box-shadow: 0 0 0 3px #fff, 0 0 24px var(--arc-glow); }
    .arc-play-rim { position: absolute; inset: 0; border-radius: 28% / 24%; background: conic-gradient(from 0deg, var(--arc-accent), var(--arc-accent2), var(--arc-accent), transparent 40%, var(--arc-accent2), var(--arc-accent));
      animation: arc-rim-spin 6s linear infinite; filter: blur(1px); opacity: 0.85; transition: opacity 0.18s ease, transform 0.18s ease; }
    .arc-play-orbit { position: absolute; inset: 12px; border-radius: 50%; pointer-events: none; }
    .arc-play-orbit span { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: var(--arc-accent2); top: 50%; left: 50%; margin: -3px 0 0 -3px;
      transform: rotate(0deg) translateX(128px); animation: arc-orbit 4.8s linear infinite; box-shadow: 0 0 8px var(--arc-glow);
      transition: box-shadow 0.18s ease; }
    .arc-play-orbit span:nth-child(2) { animation-duration: 6.2s; animation-direction: reverse; transform: rotate(120deg) translateX(118px); }
    .arc-play-orbit span:nth-child(3) { animation-duration: 5.1s; transform: rotate(240deg) translateX(122px); }
    .arc-play-core { position: absolute; inset: 18px; border-radius: 26% / 22%; background: linear-gradient(145deg, #12141f, #0a0c14);
      border: 2px solid rgba(255,255,255,0.12); display: flex; flex-direction: column; align-items: center; justify-content: center;
      box-shadow: inset 0 0 40px rgba(0,0,0,0.6), 0 0 32px var(--arc-glow);
      animation: arc-play-breathe 2.4s ease-in-out infinite;
      transition: transform 0.18s cubic-bezier(0.34, 1.15, 0.64, 1), box-shadow 0.18s ease, border-color 0.18s ease; }
    .arc-play-btn:hover .arc-play-core { transform: scale(1.04); animation: none;
      border-color: rgba(255,255,255,0.22);
      box-shadow: inset 0 0 36px rgba(0,0,0,0.5), 0 0 44px var(--arc-glow), 0 0 68px color-mix(in srgb, var(--arc-accent) 28%, transparent); }
    .arc-play-btn:hover .arc-play-rim { opacity: 1; filter: blur(0.5px); }
    .arc-play-btn:hover .arc-play-orbit span { box-shadow: 0 0 14px var(--arc-glow); }
    .arc-play-btn:active .arc-play-core, .arc-play-btn.arc-pressed .arc-play-core { transform: translateY(6px) scale(0.96); animation: none;
      transition-duration: 0.1s;
      box-shadow: inset 0 0 48px rgba(0,0,0,0.72), 0 0 52px var(--arc-glow); }
    .arc-play-btn.arc-click-flash .arc-play-core { animation: arc-play-click-glow 0.2s ease-out; }
    .arc-play-btn.arc-pressed .arc-play-rim { transform: scale(0.92); opacity: 0.2; transition: 0.1s; }
    .arc-play-label { font-size: 42px; font-weight: 900; letter-spacing: 0.14em; color: #fff; }
    .arc-play-sub { font-size: 14px; font-weight: 600; color: #ddd; margin-top: 6px; letter-spacing: 0.06em; }
    .arc-play-snap { position: fixed; inset: 0; background: #000; z-index: 9600; pointer-events: none; opacity: 0; }
    .arc-play-snap.on { animation: arc-snap-black 90ms ease-out forwards; }
    .arc-meta-row { display: flex; flex-wrap: wrap; gap: 12px 20px; justify-content: center; align-items: center; font-size: 14px; color: #ddd; }
    .arc-trophy-badge { font-weight: 800; color: var(--arc-accent2); font-variant-numeric: tabular-nums; }
    .arc-league-pill { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px;
      background: color-mix(in srgb, var(--arc-accent) 20%, transparent); border: 1px solid var(--arc-accent); color: #eee; }
    .arc-trophy-road { margin: 8px 0 20px; overflow-x: auto; padding: 12px 8px 16px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
    .arc-road-track { display: flex; gap: 0; min-width: min-content; padding: 0 40vw; position: relative; }
    .arc-road-node { flex: 0 0 88px; scroll-snap-align: center; text-align: center; position: relative; }
    .arc-road-node::before { content: ""; position: absolute; top: 22px; left: -50%; right: 50%; height: 3px; background: rgba(255,255,255,0.12); z-index: 0; }
    .arc-road-node:first-child::before { display: none; }
    .arc-road-dot { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 8px; border: 2px solid rgba(255,255,255,0.2);
      background: #1a1d2e; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #ddd; position: relative; z-index: 1; }
    .arc-road-node.current .arc-road-dot { border-color: var(--arc-accent); box-shadow: 0 0 16px var(--arc-glow); color: #fff; }
    .arc-road-node.done .arc-road-dot { background: color-mix(in srgb, var(--arc-accent) 35%, #1a1d2e); border-color: var(--arc-accent); }
    .arc-road-node.locked { opacity: 0.45; }
    .arc-road-label { font-size: 11px; color: #ddd; line-height: 1.25; min-height: 28px; }
    .arc-lab-toggle { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 10px 0 14px; }
    .arc-lab-toggle button { font-size: 14px; font-weight: 700; padding: 8px 16px; border-radius: 10px; cursor: pointer;
      border: 1px solid var(--gridline); background: var(--surface, var(--card)); color: #ddd; }
    .arc-lab-toggle button.on { border-color: var(--arc-accent); color: #fff; background: color-mix(in srgb, var(--arc-accent) 18%, transparent); }
    .arc-lab-panel { display: none; }
    .arc-lab-panel.open { display: block; }
    .arc-roster-section { margin: 0 0 16px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1); background: rgba(15,18,25,0.55); }
    .arc-roster-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .arc-roster-title { font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #fbbf24; }
    .arc-roster-count { font-size: 11px; color: #aaa; font-variant-numeric: tabular-nums; }
    .arc-roster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
    .arc-roster-card { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); text-align: left; }
    .arc-roster-name { font-size: 14px; font-weight: 800; color: #fff; }
    .arc-roster-stat { font-size: 11px; color: #ccc; line-height: 1.4; }
    .arc-roster-taunt { font-size: 11px; color: #fbbf24; font-style: italic; line-height: 1.35; }
    .arc-roster-rematch { align-self: flex-start; margin-top: 4px; padding: 5px 10px; font-size: 11px; font-weight: 700; }
    .prax-tile-room { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 999px;
      border: 1px solid; margin-top: 2px; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .prax-tile-hw-rank { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800;
      letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; margin-top: 2px; }
    .prax-tile-hw-rank .prax-hw-chevrons { color: #fbbf24; font-size: 11px; letter-spacing: -0.08em; }
    .arc-vs-screen { display: flex; flex-wrap: wrap; gap: 20px; align-items: stretch; justify-content: center; max-width: 720px; margin: 0 auto; }
    .arc-vs-card { flex: 1 1 200px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 20px; text-align: center; }
    .arc-vs-card.you { border-color: var(--arc-accent); }
    .arc-vs-card.rival { border-color: var(--arc-accent2); }
    .arc-vs-name { font-size: 22px; font-weight: 900; color: #fff; }
    .arc-vs-epithet { font-size: 14px; color: #ddd; margin-top: 4px; }
    .arc-vs-taunt { font-size: 15px; color: #ddd; font-style: italic; margin: 16px 0; max-width: 480px; }
    .arc-vs-badge { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
      background: color-mix(in srgb, var(--arc-accent2) 25%, transparent); color: #eee; }
    .arc-avatar-svg { width: 96px; height: 96px; margin: 0 auto 12px; display: block; }
    .arc-match-scoreboard { width: 100%; max-width: 560px; margin: 12px auto; text-align: left; font-size: 14px; color: #ddd; }
    .arc-match-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .arc-skill-bar { height: 8px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden; margin-top: 4px; }
    .arc-skill-fill { height: 100%; background: linear-gradient(90deg, var(--arc-accent), var(--arc-accent2)); border-radius: 999px; }
    .arc-formula-toggle { font-size: 13px; color: #ccc; cursor: pointer; margin-top: 8px; text-decoration: underline; }
    .arc-formula-detail { display: none; font-size: 13px; color: #ddd; margin-top: 8px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; }
    .arc-formula-detail.open { display: block; }
    .arc-canvas-wrap { position: relative; width: min(560px, 92vw); margin: 0 auto; }
    .arc-canvas { display: block; width: 100%; border-radius: 12px; border: 2px solid rgba(255,255,255,0.12); background: #060810; cursor: crosshair; touch-action: none; }
    .arc-canvas-hud { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 14px; font-weight: 700; color: #ddd; }
    .arc-target-symbol { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; vertical-align: middle; margin-left: 8px; }
    .arc-post-banner { font-size: clamp(28px, 5vw, 42px); font-weight: 900; margin: 8px 0; color: #fff; }
    .arc-post-banner.win { color: var(--arc-accent); }
    .arc-post-banner.lose { color: #f87171; }
    .arc-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 97000; background: #1a1d2e; border: 1px solid var(--arc-accent);
      color: #eee; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; box-shadow: 0 8px 32px rgba(0,0,0,0.5); pointer-events: none;
      animation: arc-toast-in 0.22s ease-out; }
    @keyframes arc-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    .arc-rival-card { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; justify-content: center; max-width: 640px; margin: 0 auto 16px;
      padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04); }
    .arc-rival-face { flex: 0 0 auto; transform-origin: center 42%; }
    .arc-rival-face .arc-avatar-svg { width: 80px; height: 80px; margin: 0; }
    @keyframes arc-rival-blink { 0%, 100% { transform: scaleY(1); } 45% { transform: scaleY(0.82); } }
    @keyframes arc-rival-win-react { 0%, 100% { transform: rotate(0deg); } 35% { transform: rotate(-9deg) translateX(-2px); } 70% { transform: rotate(5deg); } }
    @keyframes arc-rival-smirk { 0%, 100% { transform: skewX(0deg); } 55% { transform: skewX(-7deg) rotate(-3deg); } }
    @keyframes arc-rival-glance { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(10px, 5px) rotate(14deg); } }
    .arc-rival-face.load-blink { animation: arc-rival-blink 120ms ease-in-out 1; }
    .arc-rival-face.win-reaction { animation: arc-rival-win-react 300ms ease-out 1; }
    .arc-rival-face.rival-win-reaction { animation: arc-rival-smirk 300ms ease-out 1; }
    .arc-rival-face.idle-glance { animation: arc-rival-glance 200ms ease-out 1; }
    .arc-rival-mood-badge { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
      text-transform: uppercase; padding: 2px 8px; border-radius: 999px; margin-top: 6px;
      border: 1px solid rgba(255,255,255,0.18); color: #ddd; background: rgba(255,255,255,0.06); }
    .arc-rival-mood-badge.wary { border-color: rgba(248,113,113,0.45); color: #fca5a5; }
    .arc-rival-mood-badge.confident { border-color: rgba(251,191,36,0.45); color: #fcd34d; }
    .arc-rival-info { flex: 1 1 220px; text-align: left; }
    .arc-rival-name { font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 6px; }
    .arc-rival-title { font-size: 13px; font-weight: 700; color: #eee; margin: 6px 0; }
    .arc-rival-stat { font-size: 13px; color: #eee; margin: 4px 0; line-height: 1.45; }
    .arc-rival-stat strong { color: #fff; }
    .arc-rival-adapt { font-size: 12px; color: #ddd; margin-top: 8px; font-style: italic; }
    .arc-rival-taunt { font-size: 13px; color: #fbbf24; margin-top: 8px; font-weight: 600; }
    .arc-circuit-tray { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
    .arc-circuit-chip { font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 8px 12px; border-radius: 8px;
      border: 2px solid rgba(255,255,255,0.25); background: #1a2030; color: #fff; cursor: grab; user-select: none; touch-action: none; }
    .arc-circuit-chip.dragging { opacity: 0.5; cursor: grabbing; }
    .arc-circuit-chip.selected { border-color: #22d3ee; box-shadow: 0 0 12px rgba(34,211,238,0.45); }
    .arc-circuit-goal { font-size: 14px; color: #fbbf24; margin: 8px 0 4px; font-weight: 700; }
    .arc-circuit-legend { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 10px 0; max-width: 560px; }
    .arc-circuit-legend-item { font-size: 11px; color: #ccc; padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); }
    .arc-circuit-slot-hint { box-shadow: 0 0 0 3px rgba(251,191,36,0.75) !important; }
    .arc-forge-bar-wrap { width: min(480px, 92vw); height: 48px; margin: 16px auto; position: relative; border-radius: 12px; background: rgba(255,255,255,0.06); border: 2px solid rgba(255,255,255,0.12); overflow: hidden; }
    .arc-forge-sweet { position: absolute; top: 0; bottom: 0; background: rgba(34,197,94,0.35); border-left: 2px solid #22c55e; border-right: 2px solid #22c55e; }
    .arc-forge-needle { position: absolute; top: 4px; bottom: 4px; width: 4px; background: #fff; border-radius: 2px; box-shadow: 0 0 10px rgba(255,255,255,0.8); transform: translateX(-50%); }
    .arc-forge-strike-log { font-size: 13px; color: #ddd; margin-top: 12px; max-width: 480px; text-align: left; }
    .arc-forge-strike-row { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .prax-pregame-card { text-align: center; max-width: 420px; margin: 0 auto; }
    .prax-pregame-icon { font-size: 56px; line-height: 1; margin-bottom: 12px; }
    .prax-pregame-title { font-size: clamp(22px, 4vw, 30px); font-weight: 900; color: #fff; margin-bottom: 8px; }
    .prax-pregame-desc { font-size: 14px; color: #ddd; line-height: 1.5; margin-bottom: 20px; }
    .prax-pregame-count { font-size: 72px; font-weight: 900; color: var(--arc-accent, #14b8a6); font-variant-numeric: tabular-nums; }
    .prax-pregame-skip { font-size: 12px; color: #aaa; margin-top: 12px; }
    @keyframes prax-pregame-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    .prax-pregame-card.prax-pregame-enter { animation: prax-pregame-in 0.48s ease-out; }
    @keyframes prax-answer-pulse-correct { 0%, 100% { box-shadow: 0 0 0 rgba(34,197,94,0); } 45% { box-shadow: 0 0 0 4px rgba(34,197,94,0.55); } }
    @keyframes prax-answer-pulse-wrong { 0%, 100% { box-shadow: 0 0 0 rgba(239,68,68,0); } 45% { box-shadow: 0 0 0 4px rgba(239,68,68,0.55); } }
    .prax-game-btn.prax-answer-pulse-correct { animation: prax-answer-pulse-correct 0.55s ease-out 1; }
    .prax-game-btn.prax-answer-pulse-wrong { animation: prax-answer-pulse-wrong 0.55s ease-out 1; }
    @keyframes prax-stage-clear-in { from { opacity: 0; transform: translateY(-10px) scale(0.96); } to { opacity: 1; transform: none; } }
    .prax-stage-clear-banner { font-size: clamp(18px, 3.5vw, 26px); font-weight: 900; letter-spacing: 0.06em;
      color: #22d3ee; margin: 0 0 14px; padding: 10px 16px; border-radius: 10px;
      border: 1px solid rgba(34,211,238,0.45); background: rgba(34,211,238,0.1);
      animation: prax-stage-clear-in 0.42s ease-out; }
    .prax-hw-track { width: min(560px, 94vw); margin: 0 auto 16px; text-align: left; }
    .prax-hw-track-label { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
    .prax-hw-track-row { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
    .prax-hw-stage { flex: 1 1 56px; min-width: 52px; text-align: center; font-size: 10px; font-weight: 700; color: #888;
      padding: 6px 4px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); transition: border-color 0.2s, color 0.2s; }
    .prax-hw-stage.done { color: #86efac; border-color: rgba(34,197,94,0.35); }
    .prax-hw-stage.current { color: #fff; border-color: #22d3ee; box-shadow: 0 0 12px rgba(34,211,238,0.25); }
    .prax-hw-stage.clickable { cursor: pointer; }
    .prax-hw-stage.clickable:hover { border-color: #67e8f9; color: #fff; }
    .prax-hw-stage.locked { opacity: 0.45; cursor: not-allowed; }
    .prax-hw-stage-name { display: block; margin-top: 2px; line-height: 1.2; }
    .prax-hw-teach { margin: 12px auto 0; max-width: 520px; padding: 12px 14px; border-radius: 10px; text-align: left;
      font-size: 14px; line-height: 1.5; color: #ddd; border: 1px solid rgba(34,211,238,0.35); background: rgba(34,211,238,0.08); }
    .prax-hw-teach label { display: block; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #22d3ee; margin-bottom: 6px; }
    .prax-hw-truth-wrap { max-width: 94vw; overflow-x: auto; margin: 12px auto; -webkit-overflow-scrolling: touch; }
    .prax-hw-truth { border-collapse: collapse; margin: 0 auto; font-size: 15px; font-variant-numeric: tabular-nums; }
    .prax-hw-truth th, .prax-hw-truth td { border: 1px solid rgba(255,255,255,0.18); padding: 6px 12px; }
    .prax-hw-truth th { background: rgba(255,255,255,0.06); font-weight: 800; }
    .prax-hw-order-zone { min-height: 48px; }
    .hw-mode-picker { width: 100%; max-width: 720px; text-align: left; margin: 0 auto; }
    .hw-mode-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
    .hw-mode-title { font-size: clamp(20px, 3.5vw, 28px); font-weight: 800; letter-spacing: 0.04em; }
    .hw-mode-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
    .hw-mode-chip { text-align: left; padding: 12px 14px; border-radius: 12px; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04); color: inherit;
      transition: transform 0.15s, border-color 0.15s; position: relative; }
    .hw-mode-chip:hover { transform: translateY(-2px); border-color: rgba(34,211,238,0.55); }
    .hw-mode-chip-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
    .hw-mode-name { font-size: 14px; font-weight: 800; letter-spacing: 0.04em; margin-bottom: 4px; }
    .hw-mode-desc { font-size: 11px; color: #bbb; line-height: 1.35; margin-bottom: 8px; min-height: 2.4em; }
    .hw-mode-kind { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #22d3ee; }
    .hw-mode-info-btn { background: none; border: none; cursor: pointer; font-size: 15px; line-height: 1; color: #aaa; padding: 2px 4px; }
    .hw-mode-info-btn:hover { color: #22d3ee; }
    .hw-playbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
      width: min(560px, 94vw); margin: 0 auto 12px; }
    .hw-playbar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .hw-mode-badge { font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
      padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(34,211,238,0.45); background: rgba(34,211,238,0.1); color: #ddd; }
    .hw-bar-btn { font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 8px; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); color: inherit; }
    .hw-bar-btn:hover { border-color: rgba(34,211,238,0.5); }
    .hw-info-pop { position: fixed; inset: 0; z-index: 12000; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55); padding: 16px; }
    .hw-info-card { max-width: 420px; width: 100%; padding: 18px 20px; border-radius: 14px;
      border: 1px solid rgba(34,211,238,0.35); background: var(--surface, #1a1a2e); text-align: left; }
    .hw-info-card h3 { margin: 0 0 10px; font-size: 18px; }
    .hw-info-card p { margin: 0; font-size: 14px; line-height: 1.5; color: #ccc; }
    .hw-correction { margin: 12px auto; max-width: 520px; padding: 12px 14px; border-radius: 10px; text-align: left;
      border: 1px solid rgba(248,113,113,0.45); background: rgba(248,113,113,0.12); animation: prax-round-in 0.25s ease-out; }
    .hw-correction strong { color: #fca5a5; }
    .hw-correction-hint { font-size: 13px; color: #ddd; margin-top: 6px; line-height: 1.45; }
    .hw-mini-report { margin: 0; max-width: 420px; padding: 8px 14px; border-radius: 10px;
      border: 1px solid rgba(34,211,238,0.35); background: rgba(34,211,238,0.08); font-size: 13px; line-height: 1.5; }
    .hw-report-sticky { position: sticky; top: 0; z-index: 4; display: flex; justify-content: center; padding: 6px 0 8px;
      margin: 0 auto 8px; max-width: 520px; background: linear-gradient(180deg, rgba(6,8,16,0.92) 70%, transparent); }
    .hw-report-sticky[hidden] { display: none !important; }
    .hw-talk-panel { max-width: 560px; margin: 0 auto; padding: 16px; border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .hw-talk-panel:fullscreen { padding: 28px; background: var(--surface, #111); }
    .hw-talk-tip { font-size: 14px; color: #ccc; margin-top: 12px; line-height: 1.55; white-space: pre-wrap; }
    .prax-loading-cancel { position: relative; display: inline-flex; align-items: center; gap: 10px; }
    .prax-loading-cancel-btn { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1; }
    .prax-loading-cancel-btn:hover { color: #f87171; }
    .arc-match-rival-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; margin-bottom: 12px; border-radius: 10px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: #ddd; max-width: 560px; width: 100%; }
    .arc-match-rival-bar strong { color: #fff; }
    .arc-match-lineup { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 16px 0; }
    .arc-match-lineup-chip { font-size: 12px; font-weight: 700; padding: 8px 12px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); color: #eee; }
    .arc-rival-run { font-size: 12px; color: #bbb; margin-top: 8px; text-align: left; max-width: 560px; }
    .arc-rival-run-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
    .prax-reward-lines { font-size: 13px; color: #ccc; margin: 10px auto; max-width: 320px; text-align: left; }
    .prax-reward-line { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .prax-reward-line.total { font-weight: 800; color: #fbbf24; border-bottom: none; margin-top: 4px; }
    .prax-result-game-name { font-size: 15px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #ddd; margin-bottom: 6px; }
    .arc-skill-sentence { font-size: 14px; color: #eee; margin: 12px 0; padding: 10px 14px; background: rgba(0,0,0,0.25); border-radius: 10px; line-height: 1.5; }
    .arc-reward-beat { margin-bottom: 18px; min-height: 72px; }
    .arc-reward-coins { font-size: 28px; font-weight: 900; color: #fbbf24; font-variant-numeric: tabular-nums; }
    .arc-reward-road { margin: 14px auto 0; max-width: 200px; }
    .arc-reward-road .arc-road-node { flex: 0 0 auto; }
    .arc-reward-road .arc-road-track { padding: 0; justify-content: center; }
    .arc-reward-rival { font-size: 15px; color: #ddd; font-style: italic; margin-top: 14px; opacity: 0; max-width: 420px; margin-left: auto; margin-right: auto; line-height: 1.45; }
    .arc-reward-rival-in { animation: arc-reward-rival-in 0.45s ease-out forwards; }
    @keyframes arc-reward-rival-in { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
    .arc-result-stats { opacity: 0; }
    .arc-result-stats-in { animation: arc-result-fade-in 0.5s ease-out forwards; }
    @keyframes arc-result-fade-in { from { opacity: 0; } to { opacity: 1; } }
    .arc-road-dot-pulse { animation: arc-road-pulse 0.55s ease-in-out 2; }
    @keyframes arc-road-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); box-shadow: 0 0 24px var(--arc-glow); } }
  .ait-picker { width: 100%; max-width: 720px; text-align: left; }
  .ait-picker-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
  .ait-picker-title { font-size: clamp(20px, 3.5vw, 28px); font-weight: 800; letter-spacing: 0.04em; }
  .ait-random-card { width: 100%; text-align: left; padding: 16px 18px; margin-bottom: 16px; border-radius: 14px; cursor: pointer;
    border: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 10%, transparent));
    color: inherit; transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s; }
  .ait-random-card:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 8px 28px color-mix(in srgb, var(--accent) 25%, transparent); }
  .ait-random-title { font-size: 18px; font-weight: 900; letter-spacing: 0.08em; margin-bottom: 6px; }
  .ait-random-desc { font-size: 13px; color: #ccc; line-height: 1.45; margin: 0; }
  .ait-model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .ait-model-chip { text-align: left; padding: 12px 14px; border-radius: 12px; cursor: pointer;
    border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04); color: inherit;
    transition: transform 0.15s, border-color 0.15s; }
  .ait-model-chip:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
  .ait-model-name { font-size: 14px; font-weight: 800; letter-spacing: 0.04em; margin-bottom: 4px; }
  .ait-model-desc { font-size: 11px; color: #bbb; line-height: 1.35; margin-bottom: 8px; min-height: 2.7em; }
  .ait-model-meta { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; color: #aaa; font-variant-numeric: tabular-nums; margin-bottom: 6px; }
  .ait-prob-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden; }
  .ait-prob-fill { height: 100%; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white)); border-radius: 999px; min-width: 2px; }
  .ait-round-header { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; margin-bottom: 12px; }
  .ait-model-badge { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    padding: 5px 10px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 15%, transparent); color: #ddd; }
  .ait-concepts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-bottom: 14px; }
  .ait-concept-chip { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); color: #ddd; }
  .ait-deepen-btn { margin-top: 14px; font-size: 15px; font-weight: 700; padding: 12px 20px; border-radius: 12px; cursor: pointer;
    border: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--ink-primary); }
  .ait-deepen-btn:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .ait-review { width: 100%; max-width: 620px; text-align: left; font-family: Georgia, "Times New Roman", serif; line-height: 1.65; color: #e8e4df; }
  .ait-review-note { font-size: 12px; color: #a8a29e; font-family: system-ui, sans-serif; margin-bottom: 16px; font-style: italic; }
  .ait-review-section { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .ait-review-section:last-child { border-bottom: none; }
  .ait-review-h { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #a8a29e;
    font-family: system-ui, sans-serif; margin-bottom: 10px; }
  .ait-review-body { font-size: 16px; white-space: pre-wrap; }
  .ait-missed-card { border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; margin-bottom: 8px; overflow: hidden; }
  .ait-missed-toggle { width: 100%; text-align: left; padding: 12px 14px; background: rgba(255,255,255,0.04); border: none; color: inherit;
    font-family: Georgia, serif; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .ait-missed-toggle:hover { background: rgba(255,255,255,0.07); }
  .ait-missed-body { display: none; padding: 0 14px 14px; font-size: 14px; }
  .ait-missed-card.open .ait-missed-body { display: block; }
  .ait-missed-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a8a29e;
    font-family: system-ui, sans-serif; margin: 10px 0 4px; }
  .ait-archive-list { width: 100%; max-width: 640px; text-align: left; }
  .ait-archive-item { display: block; width: 100%; text-align: left; padding: 14px 16px; margin-bottom: 8px; border-radius: 12px; cursor: pointer;
    border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: inherit; transition: border-color 0.15s; }
  .ait-archive-item:hover { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
  .ait-archive-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .ait-archive-score { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--accent); }
  .ait-archive-date { font-size: 12px; color: #aaa; }
  .ait-archive-preview { font-size: 13px; color: #ccc; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ait-archive-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .ait-reviews-btn { flex: 0 0 auto; padding: 4px 8px; font-size: 11px; display: none; }
  .prax-tile:hover .prax-tile-actions .ait-reviews-btn,
  .prax-tile.prax-tile-info-open .prax-tile-actions .ait-reviews-btn { display: inline-flex; }
    @media (prefers-reduced-motion: reduce) {
      .arc-reward-rival-in { animation: arc-result-fade-in 0.35s ease-out forwards; transform: none; }
      .arc-road-dot-pulse { animation: none; }
      .arc-rival-face.load-blink, .arc-rival-face.win-reaction, .arc-rival-face.rival-win-reaction,
      .arc-rival-face.idle-glance { animation: none !important; transform: none !important; }
    }
    @media (max-width: 640px) {
      .arc-play-btn { width: 180px; height: 180px; }
      .arc-play-label { font-size: 28px; }
      .arc-play-orbit span { transform: rotate(0deg) translateX(82px); }
      .arc-play-orbit span:nth-child(2) { transform: rotate(120deg) translateX(76px); }
      .arc-play-orbit span:nth-child(3) { transform: rotate(240deg) translateX(78px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .prax-stage-enter, .prax-stage-timer-bar.critical, .prax-stage-combo.x3, .prax-stage-combo.x4,
      .prax-score-popup, .prax-stage-wrong-flash, .prax-coin, .prax-decoy, .prax-result-ring-fg,
      .prax-pregame-card.prax-pregame-enter, .prax-game-btn.prax-answer-pulse-correct, .prax-game-btn.prax-answer-pulse-wrong,
      .prax-stage-clear-banner,
      .rwd-unlock-overlay, .rwd-loot-overlay, .rwd-loot-chest.shake, .rwd-loot-reveal-in, .rwd-loot-chest-lid,
      .rwd-road-bar-fill, .rwd-card.rwd-applied, .rwd-card.unlocked::after, .arc-toast, .arc-play-rim, .arc-play-orbit span, .arc-play-core, .arc-play-snap.on,
      .arc-play-btn.arc-click-flash .arc-play-core { animation: none !important; }
      .arc-toast { transform: translateX(-50%); }
      .arc-play-btn:hover .arc-play-core { transform: none; }
    }
  `;
  document.head.appendChild(el);
}

function praxLevelFromPoints(points) {
  return Math.floor(Math.sqrt((points || 0) / 50)) + 1;
}

function praxXpBounds(level) {
  const start = (level - 1) ** 2 * 50;
  const end = level ** 2 * 50;
  return { start, end, span: end - start };
}

function praxXpProgress(points) {
  const level = praxLevelFromPoints(points);
  const { start, span } = praxXpBounds(level);
  const current = Math.max(0, (points || 0) - start);
  const pct = span > 0 ? Math.min(100, (current / span) * 100) : 0;
  return { level, pct, current, needed: span - current, nextLevel: level + 1 };
}

function praxMedalFromRatio(ratio) {
  if (ratio == null || ratio < 0) return { emoji: "", label: "No best yet", tier: "none" };
  if (ratio >= 0.8) return { emoji: "&#127942;", label: "Gold", tier: "gold" };
  if (ratio >= 0.6) return { emoji: "&#129352;", label: "Silver", tier: "silver" };
  return { emoji: "&#129353;", label: "Bronze", tier: "bronze" };
}

function praxMedalFromScore(score, maxScore) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  return praxMedalFromRatio(ratio);
}

function praxDifficultyMeter(difficulty) {
  const d = Math.max(0, Math.min(10, difficulty || 0));
  return Array.from({ length: 10 }, (_, i) =>
    `<span class="prax-diff-seg${i < d ? " on" : ""}"></span>`).join("");
}

function praxPointsEarned(score, maxScore, difficulty) {
  if (!maxScore) return 0;
  return Math.round((score / maxScore) * 10 * (difficulty || 1));
}

function praxWaypointGame() {
  const wg = window.WaypointGame;
  return wg && typeof wg === "object" ? wg : null;
}

function praxGameFeaturesHidden() {
  if (window.WaypointLoot && typeof window.WaypointLoot.gameFeaturesHidden === "function") {
    return window.WaypointLoot.gameFeaturesHidden();
  }
  try {
    const hide = localStorage.getItem("wp-hide-game");
    if (hide === "1" || hide === "on" || hide === "true") return true;
    if (localStorage.getItem("waypointGameOff") === "on") return true;
  } catch (_) {}
  return !!(document.body && (document.body.classList.contains("wp-hide-game") || document.body.classList.contains("game-off")));
}

function praxNotifyCoinAward(amount) {
  const earned = Math.max(0, Math.floor(Number(amount) || 0));
  if (!earned) return;
  if (window.WaypointLoot && typeof window.WaypointLoot.awardLootCoins === "function") {
    window.WaypointLoot.awardLootCoins(earned, "Practice round", true);
  } else {
    try {
      const key = "waypointLootCoinBonusV1";
      const next = Math.max(0, parseInt(localStorage.getItem(key) || "0", 10) || 0) + earned;
      localStorage.setItem(key, String(next));
    } catch (_) {}
  }
  if (typeof api === "function") {
    api("/api/coins/from-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ painted_hours: 0, played_game: true }),
    }).catch(() => {});
  }
  if (window.WaypointLoot && typeof window.WaypointLoot.coinBurst === "function") {
    window.setTimeout(() => window.WaypointLoot.coinBurst(
      earned,
      document.getElementById("hud-coins-label") || document.getElementById("hud-xp-btn")
    ), 180);
  }
  if (typeof refreshHudData === "function") window.setTimeout(() => refreshHudData(), 260);
}

function praxMatchXpAmount(score, maxScore) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  return 10 + Math.round(ratio * 20);
}

function praxAwardMatchXp(score, maxScore) {
  const wg = praxWaypointGame();
  const base = praxMatchXpAmount(score, maxScore);
  if (wg && typeof wg.awardXp === "function") wg.awardXp(base, "match");
  if (wg && typeof wg.questProgress === "function") wg.questProgress("match1");
  return base;
}

function praxMatchXpDisplay(score, maxScore, isDaily) {
  const base = praxMatchXpAmount(score, maxScore);
  return isDaily ? base * 2 : base;
}

function praxAwardDailyCheckXp() {
  const wg = praxWaypointGame();
  if (wg && typeof wg.awardXp === "function") wg.awardXp(25, "daily check");
}

function praxAwardTrophyRoadXp() {
  const wg = praxWaypointGame();
  if (wg && typeof wg.awardXp === "function") wg.awardXp(40, "trophy road");
}

function praxResultXpLineHtml(displayXp, isDaily, id) {
  if (displayXp == null || displayXp <= 0) return "";
  const numId = id || "prax-result-xp-num";
  const dailyTag = isDaily ? ' <span class="pill" style="font-size:10px;border-color:var(--accent);color:var(--accent);">2&times; daily</span>' : "";
  return `<div class="prax-result-xp">+<span id="${escapeHtml(numId)}">${escapeHtml(displayXp)}</span> XP${dailyTag}</div>`;
}

function praxDailyGameKey(games) {
  const keys = games.map(g => g.key).sort();
  if (!keys.length) return null;
  const today = localYmd();
  let hash = 5381;
  const seed = today + "|" + keys.join(",");
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  return keys[Math.abs(hash) % keys.length];
}

function praxIsDaily(key) {
  return key && key === praxDailyGameKey(PRACTICE_GAMES);
}

function praxWrapRound(html) {
  return `<div class="card prax-round-card prax-round-enter">${html}</div>`;
}

function praxShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function praxSample(arr, n) {
  return praxShuffle(arr).slice(0, Math.min(n, arr.length));
}

function praxGameMeta(key) {
  const api = PRACTICE_GAMES.find(x => x.key === key);
  const canvas = arcCanvasGameMeta().find(x => x.key === key);
  const local = PRAX_LOCAL_GAME_CATALOG[key] || {};
  const label = api?.label || canvas?.label || (key ? key.replace(/_/g, " ") : "Game");
  return {
    key,
    label,
    icon: api?.icon || local.icon || "🎮",
    desc: api?.desc || api?.description || local.desc || label,
    objective: local.objective || api?.objective || api?.desc || local.desc || label,
    mode: api?.mode || canvas?.mode || "local",
  };
}

function praxGameLabel(key) {
  return praxGameMeta(key).label;
}

function praxFlopReasons(opts) {
  const score = Number(opts?.score) || 0;
  const maxScore = Math.max(0, Number(opts?.maxScore) || 0);
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (!maxScore || ratio >= 0.6) return [];
  const missed = Math.max(0, maxScore - score);
  const pct = Math.round(ratio * 100);
  const missedText = Number.isInteger(missed) ? String(missed) : missed.toFixed(1);
  const skillReasons = {
    memory: `Recall or ordering broke on ${missedText} of ${maxScore} items.`,
    working_memory: `The reverse-memory sequence lost ${missedText} of ${maxScore} positions.`,
    math: `${missedText} of ${maxScore} calculations were not correct.`,
    logic: `${missedText} of ${maxScore} relationship deductions were not solved.`,
    spelling: `${missedText} of ${maxScore} spellings were not recognized correctly.`,
    time_estimation: `Timing accuracy earned ${score} of ${maxScore} points.`,
    hardware: `${missedText} of ${maxScore} hardware checks were missed.`,
    neural_net_fix: `${missedText} of ${maxScore} grading points were lost on the model diagnosis or fix.`,
    longterm: `${missedText} of ${maxScore} recall points were missing from the answer.`,
  };
  const reasons = [skillReasons[opts?.key] || `${missedText} of ${maxScore} available points were missed (${pct}% accuracy).`];
  const maxCombo = Number(opts?.stats?.maxCombo ?? opts?.maxCombo);
  if (maxScore > 1 && Number.isFinite(maxCombo) && maxCombo <= 1) {
    reasons.push("No correct streak longer than one answer formed, so errors were consecutive or recurring.");
  }
  const avgTime = Number(opts?.stats?.avgTimeSec ?? opts?.avgTimeSec);
  if (Number.isFinite(avgTime) && avgTime >= 10) {
    reasons.push(`Average response time was ${avgTime.toFixed(1)}s, showing slow retrieval under this round's pressure.`);
  }
  const difficulty = Number(opts?.difficulty);
  if (reasons.length < 3 && Number.isFinite(difficulty) && difficulty >= 4 && ratio < 0.4) {
    reasons.push(`Difficulty ${difficulty}/10 produced ${pct}% accuracy — the current level is outrunning mastery.`);
  }
  if (reasons.length < 2) {
    reasons.push(`Accuracy stayed below the 60% recovery line by ${60 - pct} percentage points.`);
  }
  return reasons.slice(0, 3);
}

function praxOnlineAiAvailable() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (typeof gameIsOfflineMode === "function" && gameIsOfflineMode()) return false;
  return true;
}

function praxFlopPanelHtml(opts) {
  const reasons = praxFlopReasons(opts);
  if (!reasons.length) return "";
  const aiAction = praxOnlineAiAvailable()
    ? '<button type="button" class="secondary prax-game-btn prax-flop-agent">Explain with AI in Agent</button>'
    : '<span class="prax-flop-offline">Local reasons only — AI explanation is unavailable offline.</span>';
  return `<section class="prax-flop-panel" aria-label="Round flop reasons">
    <h3>Why this round flopped</h3>
    <ul class="prax-flop-reasons">${reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
    <div class="prax-flop-actions">${aiAction}</div>
  </section>`;
}

function praxFlopAgentPrompt(opts) {
  const reasons = praxFlopReasons(opts);
  const game = praxGameLabel(opts?.key);
  const lines = [
    "Explain this Practice flop and help me recover.",
    `Game: ${game}`,
    `Score: ${opts?.score}/${opts?.maxScore}`,
    `Difficulty: ${opts?.difficulty}/10`,
    "Local flop reasons:",
    ...reasons.map(reason => `- ${reason}`),
  ];
  if (opts?.round?.model_name) lines.push(`Model: ${opts.round.model_name}`);
  if (Array.isArray(opts?.round?.concepts) && opts.round.concepts.length) {
    lines.push(`Concepts: ${opts.round.concepts.join(", ")}`);
  }
  if (opts?.feedback) lines.push(`Existing feedback: ${String(opts.feedback).slice(0, 800)}`);
  if (opts?.reference) lines.push(`Reference: ${String(opts.reference).slice(0, 500)}`);
  return `${lines.join("\n")}\nGive me a concise explanation and one focused next drill.`;
}

function praxWireFlopAgent(container, opts) {
  const btn = container?.querySelector(".prax-flop-agent");
  if (!btn) return;
  btn.onclick = async () => {
    const prompt = praxFlopAgentPrompt(opts);
    praxCloseStage();
    if (typeof askAgentAbout === "function") await askAgentAbout(prompt);
  };
}

function praxLogGameplay(evt) {
  if (!evt || !evt.game) return;
  try {
    const log = JSON.parse(localStorage.getItem(PRAX_GAMEPLAY_LOG_KEY) || "[]");
    const row = {
      game: evt.game,
      qIdx: evt.qIdx != null ? evt.qIdx : 0,
      correct: !!evt.correct,
      ms: Math.max(0, Math.round(evt.ms || 0)),
      difficulty: evt.difficulty != null ? evt.difficulty : 1,
      at: Date.now(),
    };
    log.push(row);
    while (log.length > 2000) log.shift();
    localStorage.setItem(PRAX_GAMEPLAY_LOG_KEY, JSON.stringify(log));
  } catch (_) {}
}

function praxTrackPlayTime(key, ms) {
  if (!key || !ms) return;
  try {
    const tally = JSON.parse(localStorage.getItem(PRAX_PLAY_TIME_KEY) || "{}");
    tally[key] = (tally[key] || 0) + ms;
    localStorage.setItem(PRAX_PLAY_TIME_KEY, JSON.stringify(tally));
  } catch (_) {}
}

function praxGetSeenFactHashes() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRAX_SEEN_FACTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function praxMarkFactHash(hash) {
  if (!hash) return;
  const seen = praxGetSeenFactHashes();
  if (!seen.includes(hash)) {
    seen.push(hash);
    if (seen.length > 500) seen.splice(0, seen.length - 500);
    localStorage.setItem(PRAX_SEEN_FACTS_KEY, JSON.stringify(seen));
  }
}

function praxRewardBreakdown(score, maxScore, difficulty, stats) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const d = difficulty || 1;
  const baseCoins = Math.round(ratio * 6 * d);
  const accuracyCoins = Math.round(ratio * ratio * 4 * d);
  const speedCoins = stats?.avgTimeSec != null
    ? Math.round(Math.max(0, 1 - Math.min(1, stats.avgTimeSec / 12)) * 3 * d)
    : Math.round(ratio * 2 * d);
  const comboCoins = Math.round((stats?.maxCombo || 1) * 0.5 * d);
  const totalCoins = baseCoins + accuracyCoins + speedCoins + comboCoins;
  const baseXp = 10;
  const accXp = Math.round(ratio * 12);
  const speedXp = Math.round(speedCoins * 0.8);
  const comboXp = Math.round((stats?.maxCombo || 0) * 1.5);
  const totalXp = baseXp + accXp + speedXp + comboXp;
  return {
    coins: { base: baseCoins, accuracy: accuracyCoins, speed: speedCoins, combo: comboCoins, total: totalCoins },
    xp: { base: baseXp, accuracy: accXp, speed: speedXp, combo: comboXp, total: totalXp },
  };
}

function praxRewardLinesHtml(breakdown, kind, totalOverride) {
  if (!breakdown || !breakdown[kind]) return "";
  const b = breakdown[kind];
  const total = totalOverride != null ? totalOverride : b.total;
  const label = kind === "xp" ? "XP" : "coins";
  return `<div class="prax-reward-lines">
    <div class="prax-reward-line"><span>Base</span><span>+${escapeHtml(b.base)}</span></div>
    <div class="prax-reward-line"><span>Accuracy</span><span>+${escapeHtml(b.accuracy)}</span></div>
    <div class="prax-reward-line"><span>Speed</span><span>+${escapeHtml(b.speed)}</span></div>
    <div class="prax-reward-line"><span>Combo</span><span>+${escapeHtml(b.combo)}</span></div>
    <div class="prax-reward-line total"><span>Total ${escapeHtml(label)}</span><span>+${escapeHtml(total)}</span></div>
  </div>`;
}

function praxShowLoadingWithCancel(area, message, abortRef) {
  if (!area) return;
  area.innerHTML = `<div class="prax-loading-cancel">
    <span class="spinner"></span>
    <span>${escapeHtml(message || "Loading...")}</span>
    <button type="button" class="prax-loading-cancel-btn" id="prax-load-cancel" title="Cancel" aria-label="Cancel">&#10005;</button>
  </div>`;
  const btn = document.getElementById("prax-load-cancel");
  if (btn) {
    btn.onclick = () => {
      if (abortRef) abortRef.cancelled = true;
      if (ARC_MATCH_CTX) ARC_MATCH_CTX = null;
      praxCloseStage();
      const hub = document.getElementById("practice-play-area");
      if (hub) hub.innerHTML = "";
      render();
    };
  }
}

function praxShowPreGameCard(key, onReady) {
  const meta = praxGameMeta(key);
  const area = PRAX_STAGE?.body;
  if (!area) { if (onReady) onReady(); return; }
  let skipped = false;
  let timer = null;
  const finish = () => {
    if (timer) clearTimeout(timer);
    if (onReady) onReady();
  };
  const skip = () => {
    if (skipped) return;
    skipped = true;
    finish();
  };
  let count = 3;
  let cardRendered = false;
  const renderCount = () => {
    if (!cardRendered) {
      area.innerHTML = `
      <div class="prax-pregame-card${PRAX_REDUCE_MOTION ? "" : " prax-pregame-enter"}" id="prax-pregame">
        <div class="prax-pregame-icon">${escapeHtml(meta.icon)}</div>
        <div class="prax-pregame-title">${escapeHtml(meta.label)}</div>
        <div class="prax-pregame-desc">${escapeHtml(meta.objective || meta.desc)}</div>
        <div class="prax-pregame-count" id="prax-pregame-count">${escapeHtml(count)}</div>
        <div class="prax-pregame-skip">Tap or press Space to skip</div>
      </div>`;
      const card = document.getElementById("prax-pregame");
      if (card) card.onclick = skip;
      cardRendered = true;
    } else {
      const countEl = document.getElementById("prax-pregame-count");
      if (countEl) countEl.textContent = String(count);
    }
  };
  const keyHandler = (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); skip(); }
  };
  document.addEventListener("keydown", keyHandler);
  praxStageOnCleanup(() => {
    document.removeEventListener("keydown", keyHandler);
    if (timer) clearTimeout(timer);
  });
  const tick = () => {
    if (skipped) return;
    renderCount();
    if (count <= 0) { skip(); return; }
    count -= 1;
    timer = setTimeout(tick, count === 0 ? 200 : 700);
  };
  renderCount();
  timer = setTimeout(tick, 700);
}

async function praxFetchPracticeRound(key, extraBody) {
  const body = { ...(extraBody || {}) };
  const seen = praxGetSeenFactHashes();
  if (seen.length) body.seen_fact_hashes = seen;
  let result = await api(`/api/practice/${key}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const hash = result?.round?.fact_hash;
  if (hash && seen.includes(hash)) {
    result = await api(`/api/practice/${key}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  if (result?.round?.fact_hash) praxMarkFactHash(result.round.fact_hash);
  return result;
}

function praxGenerateSpellingRound(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  const pool = praxShuffle(PRAX_WORD_BANK.slice());
  const count = Math.min(8, 4 + Math.floor(d / 2));
  const words = [];
  for (let i = 0; i < count && i < pool.length; i++) {
    const correct = pool[i];
    const misspellings = [];
    while (misspellings.length < 3) {
      const chars = correct.split("");
      const op = Math.floor(Math.random() * 3);
      let bad = correct;
      if (op === 0 && chars.length > 3) {
        const j = Math.floor(Math.random() * (chars.length - 1));
        [chars[j], chars[j + 1]] = [chars[j + 1], chars[j]];
        bad = chars.join("");
      } else if (op === 1) {
        const j = Math.floor(Math.random() * chars.length);
        chars[j] = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        bad = chars.join("");
      } else {
        const j = Math.floor(Math.random() * chars.length);
        bad = correct.slice(0, j) + correct[j] + correct.slice(j);
      }
      if (bad !== correct && !misspellings.includes(bad)) misspellings.push(bad);
    }
    words.push({ correct, misspellings });
  }
  return { words, time_limit_seconds: Math.max(30, 55 - d * 2) };
}

async function praxResolveSpellingRound(difficulty) {
  try {
    const result = await praxFetchPracticeRound("spelling");
    if (result && !result.error && result.round?.words?.length) return result;
  } catch (_) {}
  return { difficulty: difficulty || 3, round: praxGenerateSpellingRound(difficulty || 3) };
}

function praxLogicTimerSec(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  return Math.max(7, Math.round(20 - (d - 1) * (13 / 9)));
}

function praxMathQuestionTimerSec(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  return Math.max(4, Math.round(14 - d * 0.8));
}

function praxMemoryFlashMs(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  if (d >= 8) return 350;
  if (d >= 5) return 600;
  return Math.max(450, 900 - d * 50);
}

function praxOpenStage(key, difficulty) {
  praxCloseStage();
  const label = praxGameLabel(key);
  const overlay = document.createElement("div");
  overlay.className = "prax-stage-overlay";
  overlay.id = "prax-stage-overlay";
  overlay.innerHTML = `
    <div class="prax-stage-panel${PRAX_REDUCE_MOTION ? "" : " prax-stage-enter"}">
      <div class="prax-stage-topbar">
        <div class="prax-stage-title">${escapeHtml(label)}</div>
        <div class="prax-stage-diff">D${escapeHtml(difficulty)}/10</div>
        <div class="prax-stage-timer-wrap"><div class="prax-stage-timer-bar" id="prax-timer-bar"></div></div>
        <div class="prax-stage-combo" id="prax-combo">x1</div>
        <button type="button" class="prax-stage-quit" id="prax-stage-quit">Quit</button>
      </div>
      <div class="prax-stage-body" id="prax-stage-body"></div>
      <div class="prax-stage-fx" id="prax-stage-fx"></div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  PRAX_STAGE = {
    key, difficulty, overlay,
    body: overlay.querySelector("#prax-stage-body"),
    fx: overlay.querySelector("#prax-stage-fx"),
    timerBar: overlay.querySelector("#prax-timer-bar"),
    comboEl: overlay.querySelector("#prax-combo"),
    midRound: false,
    combo: 0,
    maxCombo: 0,
    cleanups: [],
    timerRaf: null,
    timerEnd: 0,
    timerTotal: 0,
    onTimeout: null,
    timerEnabled: PRAX_LAUNCH_OPTIONS?.timer !== false,
  };
  const timerWrap = overlay.querySelector(".prax-stage-timer-wrap");
  if (timerWrap && !PRAX_STAGE.timerEnabled) timerWrap.hidden = true;
  overlay.querySelector("#prax-stage-quit").onclick = () => {
    if (PRAX_STAGE && PRAX_STAGE.midRound && !window.confirm("Quit mid-round? Progress won't be saved.")) return;
    praxCloseStage();
    const hub = document.getElementById("practice-play-area");
    if (hub) hub.innerHTML = "";
  };
}

function praxCloseStage() {
  if (!PRAX_STAGE) return;
  PRAX_STAGE.cleanups.forEach(fn => { try { fn(); } catch (_) {} });
  if (PRAX_STAGE.timerRaf) cancelAnimationFrame(PRAX_STAGE.timerRaf);
  PRAX_STAGE.overlay.remove();
  document.body.style.overflow = "";
  PRAX_STAGE = null;
  PRAX_LAUNCH_OPTIONS = null;
}

function praxStageOnCleanup(fn) {
  if (PRAX_STAGE) PRAX_STAGE.cleanups.push(fn);
}

function praxStageSetMidRound(v) {
  if (PRAX_STAGE) PRAX_STAGE.midRound = !!v;
}

function praxClearRoundTimer() {
  if (!PRAX_STAGE) return;
  if (PRAX_STAGE.timerRaf) cancelAnimationFrame(PRAX_STAGE.timerRaf);
  PRAX_STAGE.timerRaf = null;
  PRAX_STAGE.onTimeout = null;
  if (PRAX_STAGE.timerBar) {
    PRAX_STAGE.timerBar.style.width = "100%";
    PRAX_STAGE.timerBar.classList.remove("critical");
  }
}

function praxExtendRoundTimer(extraSeconds) {
  if (!PRAX_STAGE || !extraSeconds) return;
  PRAX_STAGE.timerEnd += extraSeconds * 1000;
  PRAX_STAGE.timerTotal += extraSeconds;
}

function praxStartRoundTimer(seconds, onTimeout) {
  if (!PRAX_STAGE || !seconds || PRAX_STAGE.timerEnabled === false) return;
  praxClearRoundTimer();
  PRAX_STAGE.timerTotal = seconds;
  PRAX_STAGE.timerEnd = performance.now() + seconds * 1000;
  PRAX_STAGE.onTimeout = onTimeout;
  const tick = () => {
    if (!PRAX_STAGE) return;
    const left = Math.max(0, PRAX_STAGE.timerEnd - performance.now());
    const pct = (left / (PRAX_STAGE.timerTotal * 1000)) * 100;
    if (PRAX_STAGE.timerBar) {
      PRAX_STAGE.timerBar.style.width = pct + "%";
      PRAX_STAGE.timerBar.classList.toggle("critical", pct <= 25);
    }
    if (left <= 0) {
      PRAX_STAGE.timerRaf = null;
      const cb = PRAX_STAGE.onTimeout;
      PRAX_STAGE.onTimeout = null;
      if (cb) cb();
      return;
    }
    PRAX_STAGE.timerRaf = requestAnimationFrame(tick);
  };
  PRAX_STAGE.timerRaf = requestAnimationFrame(tick);
}

function praxUpdateCombo(correct) {
  if (!PRAX_STAGE) return 1;
  if (correct) {
    PRAX_STAGE.combo += 1;
    PRAX_STAGE.maxCombo = Math.max(PRAX_STAGE.maxCombo, PRAX_STAGE.combo);
  } else {
    PRAX_STAGE.combo = 0;
    praxWrongFlash();
  }
  const mult = Math.min(8, Math.max(1, PRAX_STAGE.combo));
  const el = PRAX_STAGE.comboEl;
  if (el) {
    el.textContent = "x" + mult;
    el.className = "prax-stage-combo" + (mult >= 4 ? " x4" : mult === 3 ? " x3" : mult === 2 ? " x2" : "");
  }
  return mult;
}

function praxWrongFlash() {
  if (!PRAX_STAGE || PRAX_REDUCE_MOTION) return;
  const panel = PRAX_STAGE.overlay.querySelector(".prax-stage-panel");
  panel.classList.remove("prax-stage-wrong-flash");
  void panel.offsetWidth;
  panel.classList.add("prax-stage-wrong-flash");
}

function praxMarkAnswerButtons(selector, correctAnswer, chosen, valueKey) {
  const correctStr = correctAnswer == null ? "" : String(correctAnswer);
  const chosenStr = chosen == null ? "" : String(chosen);
  const key = valueKey || "option";
  document.querySelectorAll(selector).forEach(btn => {
    btn.disabled = true;
    const val = btn.dataset[key] != null ? String(btn.dataset[key]) : "";
    if (val === correctStr) {
      btn.classList.add("correct");
      if (!PRAX_REDUCE_MOTION) btn.classList.add("prax-answer-pulse-correct");
    } else if (chosenStr && val === chosenStr) {
      btn.classList.add("wrong");
      if (!PRAX_REDUCE_MOTION) btn.classList.add("prax-answer-pulse-wrong");
    }
  });
}

function praxShowStageClearBanner(text) {
  if (!PRAX_STAGE) return;
  const existing = PRAX_STAGE.body.querySelector(".prax-stage-clear-banner");
  if (existing) existing.remove();
  const banner = document.createElement("div");
  banner.className = "prax-stage-clear-banner";
  banner.textContent = text || "Stage clear!";
  PRAX_STAGE.body.insertBefore(banner, PRAX_STAGE.body.firstChild);
  praxStageOnCleanup(() => banner.remove());
  if (!PRAX_REDUCE_MOTION) setTimeout(() => banner.remove(), 2600);
}

function praxScorePopup(points) {
  if (!PRAX_STAGE || PRAX_REDUCE_MOTION) return;
  const pop = document.createElement("div");
  pop.className = "prax-score-popup";
  pop.textContent = "+" + points + "!";
  PRAX_STAGE.body.appendChild(pop);
  praxStageOnCleanup(() => pop.remove());
  setTimeout(() => pop.remove(), PRAX_REDUCE_MOTION ? 0 : 900);
}

function praxDisplayPoints(base, timeLeftRatio) {
  const mult = PRAX_STAGE ? Math.min(8, Math.max(1, PRAX_STAGE.combo)) : 1;
  const bonus = Math.round(base * 10 * (timeLeftRatio || 0));
  return Math.round((base * 20 + bonus) * mult);
}

function praxGenerateLogicPuzzle(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  if (d >= 4) {
    const n = d >= 7 ? 5 : 4;
    const names = praxSample(PRAX_NAMES, n);
    const order = praxShuffle(names);
    const relIdx = Math.floor(Math.random() * PRAX_RELATIONS.length);
    const [relation, topLabel, bottomLabel] = PRAX_RELATIONS[relIdx];
    const clues = [];
    for (let i = 0; i < n - 1; i++) clues.push(`${order[i]} ${relation} ${order[i + 1]}.`);
    if (Math.random() < 0.45 && n >= 4) {
      const neg = order[Math.floor(Math.random() * n)];
      const labels = [topLabel, bottomLabel];
      clues.push(`${neg} is NOT ${labels[Math.floor(Math.random() * 2)]}.`);
    }
    if (Math.random() < 0.35 && n >= 5) {
      const a = order[0], b = order[2], c = order[4];
      clues.push(`If ${a} ${relation.replace("is ", "is also ")} ${b}, then ${b} ${relation} ${c}.`);
    }
    const shuffledClues = praxShuffle(clues);
    const pos = Math.floor(Math.random() * n);
    let question, answer;
    if (pos === 0) { question = `Who is ${topLabel}?`; answer = order[0]; }
    else if (pos === n - 1) { question = `Who is ${bottomLabel}?`; answer = order[n - 1]; }
    else { question = `Ranked from ${topLabel} down, who is ${PRAX_ORDINALS[pos]}?`; answer = order[pos]; }
    return { clues: shuffledClues, question, options: praxShuffle(names), answer };
  }
  const templates = [
    { clues: ["{a} is taller than {b}.", "{b} is taller than {c}."], question: "Who is the shortest?", key: "c" },
    { clues: ["{a} finished before {b}.", "{c} finished before {a}."], question: "Who finished first?", key: "c" },
    { clues: ["{a} is older than {b}.", "{c} is older than {a}."], question: "Who is the oldest?", key: "c" },
    { clues: ["{a} is not the tallest.", "{c} is shorter than {b}.", "{a} is taller than {c}."], question: "Who is the tallest?", key: "b" },
  ];
  const t = templates[Math.floor(Math.random() * templates.length)];
  const names = praxSample(PRAX_NAMES, 3);
  const slots = { a: names[0], b: names[1], c: names[2] };
  return {
    clues: t.clues.map(c => c.replace(/\{([abc])\}/g, (_, k) => slots[k])),
    question: t.question,
    options: praxShuffle(names),
    answer: slots[t.key],
  };
}

function praxBuildLogicSession(serverRound, difficulty) {
  const puzzles = [serverRound];
  while (puzzles.length < 5) puzzles.push(praxGenerateLogicPuzzle(difficulty));
  return puzzles;
}

function praxRandomOperand(difficulty) {
  return Math.floor(Math.random() * (5 + difficulty * 5)) + 1;
}

function praxGenerateMathProblem(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  if (d >= 8 && Math.random() < 0.55) {
    const a = Math.floor(Math.random() * 40) + 12;
    const b = Math.floor(Math.random() * 30) + 8;
    const c = Math.floor(Math.random() * 200) + 50;
    const forms = [
      { q: `${a} * ${b} - ${c}`, a: a * b - c },
      { q: `${a} * ${b} + ${c}`, a: a * b + c },
      { q: `(${a} + ${b}) * ${Math.floor(Math.random() * 5) + 2}`, a: (a + b) * (Math.floor(Math.random() * 5) + 2) },
    ];
    const pick = forms[Math.floor(Math.random() * forms.length)];
    return { question: pick.q, answer: pick.a };
  }
  let a = praxRandomOperand(d), b = praxRandomOperand(d);
  if (d <= 2) {
    const op = Math.random() < 0.5 ? "+" : "-";
    if (op === "-" && b > a) [a, b] = [b, a];
    return { question: `${a} ${op} ${b}`, answer: op === "+" ? a + b : a - b };
  }
  if (d <= 5) {
    const op = ["+", "-", "*"][Math.floor(Math.random() * 3)];
    if (op === "-" && b > a) [a, b] = [b, a];
    if (op === "*") { a = Math.floor(Math.random() * 90) + 10; b = Math.floor(Math.random() * 9) + 2; }
    const ans = { "+": a + b, "-": a - b, "*": a * b }[op];
    return { question: `${a} ${op} ${b}`, answer: ans };
  }
  const roll = Math.random();
  if (roll < 0.25) {
    const n = Math.floor(Math.random() * 12) + 11 + d;
    return { question: `${n}^2`, answer: n * n };
  }
  if (roll < 0.45) {
    const pct = [5, 10, 15, 20, 25, 40, 60, 75][Math.floor(Math.random() * 8)];
    const base = (Math.floor(Math.random() * 20) + 2) * 20;
    return { question: `${pct}% of ${base}`, answer: Math.floor(base * pct / 100) };
  }
  const op = ["+", "-", "*", "/"][Math.floor(Math.random() * 4)];
  if (op === "/") { b = Math.max(1, b); a = a * b; return { question: `${a} / ${b}`, answer: Math.floor(a / b) }; }
  if (op === "-" && b > a) [a, b] = [b, a];
  if (op === "*") { a = Math.floor(Math.random() * 400) + 100; b = Math.floor(Math.random() * 90) + 10; }
  const ans = { "+": a + b, "-": a - b, "*": a * b }[op];
  return { question: `${a} ${op} ${b}`, answer: ans };
}

function praxBuildMathSession(serverRound, difficulty) {
  const problems = (serverRound.problems || []).map((p, i) => ({
    question: p.question,
    answer: (serverRound.answers || [])[i],
  }));
  if (problems.length) return problems;
  const d = Math.max(1, Math.min(10, difficulty || 1));
  const count = d <= 5 ? 5 : 6;
  const out = [];
  for (let i = 0; i < count; i++) out.push(praxGenerateMathProblem(d));
  return out;
}

function praxBuildMemorySession(serverRound, difficulty) {
  const words = (serverRound.words || []).slice();
  const glosses = { ...(serverRound.glosses || {}) };
  const target = Math.min(40, 3 + Math.max(0, difficulty - 1));
  const pool = PRAX_WORD_BANK.filter(w => !words.includes(w));
  while (words.length < target) words.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const distractors = (serverRound.distractors || []).slice();
  while (distractors.length < Math.max(4, words.length)) {
    const w = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (w && !words.includes(w) && !distractors.includes(w)) distractors.push(w);
  }
  return { words, distractors, requireOrder: difficulty >= 6, glosses };
}

function praxVocabLearnHtml(words, glosses) {
  if (!words?.length || !glosses) return "";
  return words.filter(w => glosses[w]).map(w =>
    `<li><strong>${escapeHtml(w)}</strong> — ${escapeHtml(glosses[w])}</li>`).join("");
}

function praxCelebrate(opts) {
  if (PRAX_REDUCE_MOTION || typeof window.celebrate !== "function") return;
  const now = performance.now();
  const duration = opts?.duration || 1200;
  if (now < PRAX_CELEBRATE_UNTIL) return;
  PRAX_CELEBRATE_UNTIL = now + Math.max(900, duration);
  window.celebrate({
    duration,
    particleCount: Math.min(opts?.particleCount || 36, 48),
  });
}

function praxCoinRain(count) {
  if (!PRAX_STAGE?.fx || PRAX_REDUCE_MOTION || count <= 0) return;
  const now = performance.now();
  if (now < PRAX_COIN_RAIN_UNTIL) return;
  PRAX_COIN_RAIN_UNTIL = now + PRAX_COIN_RAIN_GAP_MS;
  const fx = PRAX_STAGE.fx;
  const n = Math.min(PRAX_COIN_RAIN_CAP, count);
  for (let i = 0; i < n; i++) {
    const coin = document.createElement("div");
    coin.className = "prax-coin";
    coin.textContent = "\u{1FA99}";
    coin.style.left = (5 + Math.random() * 90) + "%";
    coin.style.top = "-20px";
    coin.style.animationDuration = (1.8 + Math.random() * 1.4) + "s";
    coin.style.animationDelay = (Math.random() * 0.6) + "s";
    fx.appendChild(coin);
    setTimeout(() => coin.remove(), 3500);
  }
}

function praxAnimateCount(el, target, duration) {
  if (!el) return;
  if (PRAX_REDUCE_MOTION) { el.textContent = target; return; }
  const start = performance.now();
  const from = 0;
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(from + (target - from) * t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function praxBindResultKeys(key) {
  const handler = e => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      document.removeEventListener("keydown", handler);
      startPracticeGame(key);
    }
  };
  document.addEventListener("keydown", handler);
  praxStageOnCleanup(() => document.removeEventListener("keydown", handler));
}

function praxHeroHtml(summary, coinsDisplay) {
  const xp = praxXpProgress(summary.points || 0);
  const streak = summary.streak || 0;
  const flame = streak > 0
    ? `<span class="prax-streak-flame">&#128293;</span>`
    : `<span style="color:#888;">&#128293;</span>`;
  const coins = coinsDisplay != null ? coinsDisplay : (summary.points || 0);
  const bonus = arcGetCoinsBonus();
  const bonusTag = bonus > 0 ? ` <span class="prax-supporting-text" style="font-size:11px;color:#ddd;">(+${escapeHtml(bonus)} bonus)</span>` : "";
  return `
    <div class="prax-hero-strip">
      <span class="prax-level-badge">Lv ${escapeHtml(xp.level)}</span>
      <span class="prax-hero-strip-item"><span style="color:#ddd;">Coins</span> <span class="prax-coins-inline">${escapeHtml(coins.toLocaleString())}</span>${bonusTag}</span>
      <span class="prax-streak prax-hero-strip-item">${flame}<span>${escapeHtml(streak)}</span><span style="font-size:11px;color:#ddd;">d</span></span>
      <div class="prax-xp-inline" title="XP to Level ${escapeHtml(xp.nextLevel)}: ${escapeHtml(xp.current)} / ${escapeHtml(xp.current + xp.needed)}">
        <div class="prax-xp-track"><div class="prax-xp-fill" style="width:${escapeHtml(xp.pct.toFixed(1))}%;"></div></div>
      </div>
    </div>`;
}

const PRAX_STROOP_COLORS = [
  { name: "RED", hex: "#ef4444" },
  { name: "BLUE", hex: "#3b82f6" },
  { name: "GREEN", hex: "#22c55e" },
  { name: "YELLOW", hex: "#eab308" },
];

const RWD_TIERS = [
  { id: "aurora", type: "theme", threshold: 200, label: "Aurora", effect: "Cyan accent — paint onto HUD / Main / Nav / Everywhere", icon: "&#127752;" },
  { id: "confetti", type: "perk", threshold: 300, label: "Celebrations", effect: "Confetti on good toasts", icon: "&#127881;" },
  { id: "ember", type: "theme", threshold: 500, label: "Ember", effect: "Orange accent — paint onto HUD / Main / Nav / Everywhere", icon: "&#128293;" },
  { id: "midnight", type: "wallpaper", threshold: 800, label: "Midnight", effect: "Dark indigo wallpaper — paint onto document or any region", icon: "&#127769;" },
  { id: "solstice", type: "theme", threshold: 1000, label: "Solstice", effect: "Gold accent — paint onto HUD / Main / Nav / Everywhere", icon: "&#9728;" },
];

const RWD_THEME_VARS = {
  aurora: { accent: "#22d3ee", glow: "rgba(34, 211, 238, 0.32)" },
  ember: { accent: "#f97316", glow: "rgba(249, 115, 22, 0.32)" },
  solstice: { accent: "#eab308", glow: "rgba(234, 179, 8, 0.28)" },
};

const RWD_SKIN_SWATCH = {
  aurora: "background: linear-gradient(135deg, #22d3ee 0%, #6366f1 100%);",
  confetti: "background: linear-gradient(135deg, #a855f7 0%, #ec4899 55%, #fbbf24 100%);",
  ember: "background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);",
  midnight: "background: radial-gradient(ellipse 80% 70% at 30% 15%, #4338ca, #0f0a1e 55%, #030712 100%);",
  solstice: "background: linear-gradient(135deg, #fef08a 0%, #eab308 45%, #b45309 100%);",
};

function rwdSkinSwatchStyle(tierId) {
  return RWD_SKIN_SWATCH[tierId] || "background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white));";
}

function rwdTierIsUnlocked(t, unlocked) {
  if (t.type === "theme") return unlocked.includes(t.id);
  if (t.id === "confetti") return localStorage.getItem("perkConfetti") === "1";
  return localStorage.getItem("perkMidnight") === "1";
}

function rwdRoadNodeState(tier, points, unlocked) {
  if (rwdTierIsUnlocked(tier, unlocked)) return "done";
  const next = RWD_TIERS.find(t => !rwdTierIsUnlocked(t, unlocked));
  if (next && next.id === tier.id) return "current";
  return "locked";
}

function rwdRoadProgressPct(points) {
  const max = RWD_TIERS[RWD_TIERS.length - 1].threshold;
  return Math.min(100, max > 0 ? (points / max) * 100 : 0);
}

function rwdTierEffect(t) {
  return t?.effect || "";
}

function rwdApplyToastFor(tier, opts = {}) {
  if (!tier) return "Applied";
  if (tier.type === "theme") return `${tier.label} accent applied to HUD & buttons`;
  if (tier.type === "wallpaper") {
    return opts.wallpaperOn === false ? "Default wallpaper restored" : `${tier.label} dark wallpaper applied`;
  }
  if (tier.id === "confetti") return "Celebrations on — confetti on good toasts";
  return `${tier.label} applied`;
}

function rwdPlayBlockHtml(summary) {
  const points = summary?.points || 0;
  const next = rwdNextUnlock(points);
  const caption = next.threshold
    ? `Next skin: <strong>${escapeHtml(next.label)}</strong> · ${escapeHtml(points.toLocaleString())}/${escapeHtml(next.threshold)} coins · ${escapeHtml(Math.max(0, next.threshold - points))} to go`
    : "All skins unlocked";
  return `${arcPlayButtonHtml()}
    <p class="arc-play-next-reward" id="arc-play-next-reward">${caption}</p>`;
}

function rwdRoadHtml(points, unlocked) {
  const pct = rwdRoadProgressPct(points);
  const maxCoins = RWD_TIERS[RWD_TIERS.length - 1].threshold;
  const nodes = RWD_TIERS.map(t => {
    const state = rwdRoadNodeState(t, points, unlocked);
    const isDone = state === "done";
    const inner = isDone
      ? `<span class="rwd-road-swatch" style="${rwdSkinSwatchStyle(t.id)}">${t.icon}</span>`
      : state === "current"
        ? `<span class="rwd-road-coins">${escapeHtml(t.threshold)}</span>`
        : `<span class="rwd-road-lock">&#128274;</span>`;
    return `<div class="rwd-road-node ${state}" data-rwd-tier="${escapeHtml(t.id)}" title="${escapeHtml(t.label)} — ${escapeHtml(rwdTierEffect(t))}">
      <div class="rwd-road-dot">${inner}</div>
      <div class="rwd-road-label">${escapeHtml(t.label)}</div>
      <div class="rwd-road-effect">${escapeHtml(rwdTierEffect(t))}</div>
      <div class="rwd-road-threshold">${isDone ? "&#10003; Unlocked" : `${escapeHtml(t.threshold)} coins`}</div>
    </div>`;
  }).join("");
  return `<div class="rwd-road-wrap">
    <div class="rwd-road-header">
      <span class="rwd-road-title">&#127912; Skin Road</span>
      <span class="rwd-road-meta">${escapeHtml(points.toLocaleString())} / ${escapeHtml(maxCoins)} coins</span>
    </div>
    <div class="rwd-road" id="rwd-trophy-road">
      <div class="rwd-road-bar" aria-hidden="true"><div class="rwd-road-bar-fill" style="width:${escapeHtml(pct.toFixed(1))}%;"></div></div>
      <div class="rwd-road-track">${nodes}</div>
    </div>
  </div>`;
}

function praxTodayKey() {
  return localYmd();
}

function praxLoadDailyCheckHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem("dailyCheckHistory") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function praxSaveDailyCheckEntry(entry) {
  let hist = praxLoadDailyCheckHistory().filter(e => e.date !== entry.date);
  hist.push(entry);
  hist.sort((a, b) => a.date.localeCompare(b.date));
  if (hist.length > 90) hist = hist.slice(-90);
  localStorage.setItem("dailyCheckHistory", JSON.stringify(hist));
}

function praxDailyCheckToday() {
  return praxLoadDailyCheckHistory().find(e => e.date === praxTodayKey()) || null;
}

function praxMemorySpanFromHistory() {
  const hist = praxLoadDailyCheckHistory().slice(-7);
  if (!hist.length) return 7;
  const avg = hist.reduce((s, e) => s + (e.components?.memory || 50), 0) / hist.length;
  if (avg >= 85) return 9;
  if (avg >= 70) return 8;
  if (avg >= 55) return 7;
  return 6;
}

function praxReactionScoreMs(ms) {
  if (ms == null || ms < 0) return 0;
  if (ms <= 220) return 100;
  if (ms >= 600) return 10;
  return Math.round(100 - ((ms - 220) / 380) * 90);
}

function praxSparklineBars(history, days) {
  const today = new Date();
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localYmd(d);
    const entry = history.find(e => e.date === key);
    bars.push({ date: key, score: entry ? entry.score : null });
  }
  return bars;
}

function praxDailyCheckCardHtml() {
  const today = praxDailyCheckToday();
  const hist = praxLoadDailyCheckHistory();
  const spark = praxSparklineBars(hist, 14);
  const maxSpark = Math.max(1, ...spark.map(b => b.score || 0));
  const sparkHtml = spark.map(b => {
    const h = b.score != null ? Math.max(3, Math.round((b.score / maxSpark) * 24)) : 3;
    return `<div class="prax-dcheck-bar${b.score != null ? " on" : ""}" style="height:${escapeHtml(h)}px;" title="${escapeHtml(b.date)}${b.score != null ? ": " + b.score : ""}"></div>`;
  }).join("");
  const comps = today?.components || {};
  const compRows = ["reaction", "memory", "stroop", "math"].map(k => {
    const v = comps[k] != null ? comps[k] : 0;
    const label = k === "stroop" ? "focus" : k;
    return `<div class="prax-dcheck-comp-row"><label>${escapeHtml(label)}</label>
      <div class="prax-dcheck-comp-track"><div class="prax-dcheck-comp-fill" style="width:${escapeHtml(v)}%;"></div></div>
      <span style="width:24px;text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(v)}</span></div>`;
  }).join("");
  return `
    <div class="prax-dcheck">
      <div style="flex:1 1 140px;">
        <span class="prax-dcheck-tag">Daily check</span>
        <div style="font-size:14px; font-weight:800; margin-top:4px;">Day strength</div>
        <div class="prax-dcheck-spark">${sparkHtml}</div>
        <div class="prax-dcheck-comp">${compRows}</div>
      </div>
      <div style="text-align:center; min-width:90px;">
        <div class="prax-dcheck-score">${today ? escapeHtml(today.score) : "—"}</div>
        <div class="prax-supporting-text" style="font-size:10px;">/100</div>
        ${today ? `<div class="prax-dcheck-energy">+${escapeHtml(Math.round(today.score / 10))} energy</div>` : ""}
        <button type="button" class="primary" id="prax-daily-check-start" style="margin-top:8px; padding:6px 12px; font-size:12px;">${today ? "Redo" : "Run"}</button>
      </div>
    </div>`;
}

function rwdGetUnlockedThemes() {
  try {
    const u = JSON.parse(localStorage.getItem("unlockedThemes") || "[]");
    return Array.isArray(u) ? u : [];
  } catch (_) {
    return [];
  }
}

function rwdSetUnlockedThemes(ids) {
  localStorage.setItem("unlockedThemes", JSON.stringify(ids));
}

function rwdSyncUnlocks(points) {
  const unlocked = new Set(rwdGetUnlockedThemes());
  let changed = false;
  RWD_TIERS.forEach(t => {
    if (points >= t.threshold && t.type === "theme" && !unlocked.has(t.id)) {
      unlocked.add(t.id);
      changed = true;
    }
  });
  if (points >= 300 && localStorage.getItem("perkConfetti") !== "1") {
    localStorage.setItem("perkConfetti", "1");
    changed = true;
  }
  if (points >= 800 && localStorage.getItem("perkMidnight") !== "1") {
    localStorage.setItem("perkMidnight", "1");
    changed = true;
  }
  if (changed) rwdSetUnlockedThemes([...unlocked]);
  return [...unlocked];
}

function rwdSeenUnlocks() {
  try {
    const s = JSON.parse(localStorage.getItem("seenUnlocks") || "[]");
    return Array.isArray(s) ? s : [];
  } catch (_) {
    return [];
  }
}

function rwdMarkUnlockSeen(id) {
  const seen = rwdSeenUnlocks();
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem("seenUnlocks", JSON.stringify(seen));
  }
}

function rwdApplyTheme(themeId, target) {
  if (typeof stylePaintSetLayer === "function") {
    stylePaintSetLayer(themeId, target || "document");
  } else {
    const vars = RWD_THEME_VARS[themeId];
    if (!vars) return;
    document.documentElement.style.setProperty("--accent", vars.accent);
    document.documentElement.style.setProperty("--glow-accent", vars.glow);
  }
  localStorage.setItem("activeTheme", themeId);
}

function rwdApplyMidnight(on, target) {
  if (typeof stylePaintSetLayer === "function") {
    if (on) {
      stylePaintSetLayer("midnight", target || "document");
      localStorage.setItem("activeWallpaper", "midnight");
    } else {
      const cfg = typeof stylePaintGetConfig === "function" ? stylePaintGetConfig() : { layers: [] };
      cfg.layers.filter(l => l.effect === "midnight").forEach(l => {
        if (typeof stylePaintRemoveLayer === "function") stylePaintRemoveLayer(l.id);
      });
      localStorage.removeItem("activeWallpaper");
    }
  } else {
    if (on) {
      document.body.style.background = "radial-gradient(ellipse 80% 60% at 50% 0%, #1e1b4b 0%, #0c0a14 45%, #030712 100%)";
      document.body.style.backgroundAttachment = "fixed";
      localStorage.setItem("activeWallpaper", "midnight");
    } else {
      document.body.style.background = "";
      document.body.style.backgroundAttachment = "";
      localStorage.removeItem("activeWallpaper");
    }
  }
}

function rwdGetActivePaintTargets(themeId) {
  if (typeof stylePaintGetConfig !== "function") return [];
  const cfg = stylePaintGetConfig();
  return (cfg.layers || []).filter(l => l.effect === themeId && l.enabled).map(l => l.target);
}

function rwdRefreshActiveCards() {
  const activeTheme = localStorage.getItem("activeTheme") || "";
  const activeWall = localStorage.getItem("activeWallpaper") === "midnight";
  document.querySelectorAll(".rwd-activate").forEach(btn => {
    const id = btn.dataset.rwdId;
    const type = btn.dataset.rwdType;
    const paintTargets = rwdGetActivePaintTargets(id);
    const isActive = paintTargets.length > 0
      || (type === "theme" && activeTheme === id && paintTargets.length === 0 && typeof stylePaintGetConfig !== "function")
      || (type === "wallpaper" && activeWall && id === "midnight" && paintTargets.length === 0 && typeof stylePaintGetConfig !== "function");
    btn.classList.toggle("active", isActive || paintTargets.length > 0);
    const prog = btn.querySelector(".rwd-card-prog");
    if (prog) {
      if (paintTargets.length > 0) {
        prog.textContent = `Active on: ${paintTargets.join(", ")}`;
      } else {
        prog.textContent = isActive ? "Active" : "Tap to apply";
      }
    }
  });
}

const SP_TARGET_LABELS = { document: "Everywhere", hud: "HUD", main: "Main", nav: "Nav", launcher: "Launcher" };

function rwdShowTargetChooser(tier, btn, callback) {
  const existing = document.getElementById("sp-target-chooser");
  if (existing) existing.remove();
  const chooser = document.createElement("div");
  chooser.id = "sp-target-chooser";
  chooser.className = "sp-target-chooser";
  const targets = typeof STYLE_PAINT_TARGETS !== "undefined" ? STYLE_PAINT_TARGETS : ["document", "hud", "main", "nav", "launcher"];
  chooser.innerHTML = `
    <div class="sp-target-chooser-title">Paint <strong>${tier.label}</strong> onto:</div>
    <div class="sp-target-chooser-btns">
      ${targets.map(t => `<button type="button" class="sp-chip" data-sp-tgt="${t}">${SP_TARGET_LABELS[t] || t}</button>`).join("")}
    </div>
    <button type="button" class="sp-target-chooser-close">✕</button>`;
  document.body.appendChild(chooser);
  const dismiss = () => chooser.remove();
  chooser.querySelector(".sp-target-chooser-close").onclick = dismiss;
  chooser.querySelectorAll("[data-sp-tgt]").forEach(b => {
    b.onclick = () => { callback(b.dataset.spTgt); dismiss(); };
  });
  setTimeout(() => document.addEventListener("click", function h(e) {
    if (!chooser.contains(e.target) && e.target !== btn) { dismiss(); document.removeEventListener("click", h); }
  }), 50);
}

function rwdFlashApplied(btn, message) {
  arcShowToast(message || "Applied");
  if (btn) {
    btn.classList.remove("rwd-applied");
    void btn.offsetWidth;
    btn.classList.add("rwd-applied");
    const prog = btn.querySelector(".rwd-card-prog");
    if (prog) {
      const wasActive = prog.textContent === "Active";
      prog.textContent = "\u2713 Applied!";
      setTimeout(() => { prog.textContent = wasActive ? "Active" : "Tap to apply"; }, 1200);
    }
    setTimeout(() => btn.classList.remove("rwd-applied"), 420);
  }
}

function rwdShowLootChest(tier) {
  const overlay = document.createElement("div");
  overlay.className = "rwd-loot-overlay";
  const reduced = PRAX_REDUCE_MOTION;
  overlay.innerHTML = `
    <div class="rwd-loot-panel">
      <p class="rwd-loot-sub">Loot chest ready!</p>
      <div class="rwd-loot-chest${reduced ? " open" : ""}" id="rwd-loot-chest" role="button" tabindex="0" aria-label="Open loot chest">
        <div class="rwd-loot-chest-lid"></div>
        <div class="rwd-loot-chest-body"></div>
        <div class="rwd-loot-glow"></div>
      </div>
      <div class="rwd-loot-reveal${reduced ? " rwd-loot-reveal-in" : ""}" id="rwd-loot-reveal" ${reduced ? "" : "hidden"}>
        <div class="rwd-loot-skin-preview" style="${rwdSkinSwatchStyle(tier.id)}">${tier.icon}</div>
        <h2>${escapeHtml(tier.label)}</h2>
        <p>${escapeHtml(rwdTierEffect(tier))}</p>
        <p class="rwd-loot-earn">Reach ${escapeHtml(tier.threshold)} coins from arcade &amp; practice</p>
        <button type="button" class="primary prax-game-btn" id="rwd-loot-claim">Claim</button>
      </div>
      ${reduced ? "" : `<button type="button" class="primary rwd-loot-open-btn" id="rwd-loot-open">Tap to open</button>`}
    </div>`;
  document.body.appendChild(overlay);

  const dismiss = () => {
    rwdMarkUnlockSeen(tier.id);
    overlay.remove();
  };

  const openChest = () => {
    const chest = overlay.querySelector("#rwd-loot-chest");
    const reveal = overlay.querySelector("#rwd-loot-reveal");
    const openBtn = overlay.querySelector("#rwd-loot-open");
    if (!chest || chest.classList.contains("open")) return;
    const openMs = reduced ? 0 : 280;
    if (!reduced) chest.classList.add("shake");
    setTimeout(() => {
      chest.classList.remove("shake");
      chest.classList.add("open");
      if (openBtn) openBtn.style.display = "none";
      if (!reduced) praxCelebrate({ duration: 1600, particleCount: 48 });
      setTimeout(() => {
        if (reveal) {
          reveal.hidden = false;
          reveal.classList.add("rwd-loot-reveal-in");
        }
      }, reduced ? 0 : 300);
    }, openMs);
  };

  if (!reduced) {
    const openBtn = overlay.querySelector("#rwd-loot-open");
    if (openBtn) openBtn.onclick = openChest;
    const chest = overlay.querySelector("#rwd-loot-chest");
    if (chest) {
      chest.onclick = openChest;
      chest.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChest(); } };
    }
  } else {
    praxCelebrate({ duration: 1200, particleCount: 24 });
  }

  const claimBtn = overlay.querySelector("#rwd-loot-claim");
  if (claimBtn) claimBtn.onclick = dismiss;
  setTimeout(() => { if (overlay.parentNode) dismiss(); }, reduced ? 8000 : 12000);
}

function rwdShowUnlockAnimation(tier) {
  rwdShowLootChest(tier);
}

function rwdCheckNewUnlocks(points) {
  const seen = rwdSeenUnlocks();
  const pending = RWD_TIERS.filter(t => points >= t.threshold && !seen.includes(t.id));
  if (!pending.length) return;
  let i = 0;
  const showNext = () => {
    if (i >= pending.length) return;
    rwdShowUnlockAnimation(pending[i]);
    i += 1;
  };
  showNext();
  document.addEventListener("click", function rwdUnlockChain(e) {
    if (e.target?.id === "rwd-loot-claim" && i < pending.length) {
      setTimeout(showNext, 450);
    }
    if (i >= pending.length) document.removeEventListener("click", rwdUnlockChain);
  });
}

function rwdNextUnlock(points) {
  const locked = RWD_TIERS.filter(t => points < t.threshold);
  if (!locked.length) return { label: "All rewards unlocked", threshold: null, points };
  const next = locked[0];
  return { label: next.label, type: next.type, threshold: next.threshold, points };
}

function rwdRewardsPanelHtml(summary) {
  const points = summary.points || 0;
  const streak = summary.streak || 0;
  const unlocked = rwdSyncUnlocks(points);
  const activeTheme = localStorage.getItem("activeTheme") || "";
  const activeWall = localStorage.getItem("activeWallpaper") === "midnight";
  const next = rwdNextUnlock(points);
  const stripLabel = next.threshold
    ? `Next unlock: ${next.label}${next.type === "theme" ? " theme" : next.type === "wallpaper" ? " wallpaper" : next.type === "perk" ? " perk" : ""} — ${points.toLocaleString()}/${next.threshold}`
    : next.label;
  const cards = RWD_TIERS.map(t => {
    const isUnlocked = rwdTierIsUnlocked(t, unlocked);
    const isActive = (t.type === "theme" && activeTheme === t.id)
      || (t.type === "wallpaper" && activeWall && t.id === "midnight");
    const swatch = `<div class="rwd-card-swatch" style="${rwdSkinSwatchStyle(t.id)}${isUnlocked ? "" : ";opacity:0.4"}"></div>`;
    if (isUnlocked) {
      return `<button type="button" class="rwd-card unlocked rwd-card--${escapeHtml(t.id)} rwd-activate${isActive ? " active" : ""}" data-rwd-id="${escapeHtml(t.id)}" data-rwd-type="${escapeHtml(t.type)}">
        ${swatch}
        <span class="rwd-card-icon">${t.icon}</span>
        <span class="rwd-card-name">${escapeHtml(t.label)}</span>
        <span class="rwd-card-effect">${escapeHtml(rwdTierEffect(t))}</span>
        <span class="rwd-card-prog">${isActive ? "Active" : "Tap to apply"}</span>
      </button>`;
    }
    const coinsLeft = Math.max(0, t.threshold - points);
    return `<div class="rwd-card locked rwd-card--${escapeHtml(t.id)}" title="Reach ${escapeHtml(t.threshold)} coins from arcade &amp; practice">
      ${swatch}
      <span class="rwd-card-icon" style="opacity:0.55;">${t.icon}</span>
      <span class="rwd-card-name">${escapeHtml(t.label)}</span>
      <span class="rwd-card-effect">${escapeHtml(rwdTierEffect(t))}</span>
      <span class="rwd-card-prog">${escapeHtml(points)}/${escapeHtml(t.threshold)} coins</span>
      <span class="rwd-card-unlock-reason">Reach ${escapeHtml(t.threshold)} coins from arcade/practice${coinsLeft > 0 ? ` · ${escapeHtml(coinsLeft)} to go` : ""}</span>
    </div>`;
  }).join("");
  return `
    <div class="rwd-panel${RWD_PANEL_EXPANDED ? " expanded" : ""}" id="rwd-panel">
      <div class="rwd-strip" id="rwd-strip-toggle" role="button" tabindex="0" aria-expanded="${RWD_PANEL_EXPANDED ? "true" : "false"}">
        <span class="rwd-strip-label">${escapeHtml(stripLabel)}</span>
        <span class="rwd-strip-prog">${escapeHtml(points.toLocaleString())} coins · ${escapeHtml(streak)}d streak</span>
        <span class="rwd-strip-chevron">&#9660;</span>
      </div>
      <div class="rwd-panel-body">
        <div class="rwd-panel-title">Reward tiers</div>
        <p class="rwd-earn-hint">Earn coins from arcade matches and practice drills. <strong>Themes</strong> recolor HUD accents; <strong>perks</strong> add effects like confetti; <strong>wallpapers</strong> change the page background.</p>
        ${rwdRoadHtml(points, unlocked)}
        <div class="rwd-grid">${cards}</div>
      </div>
    </div>`;
}

function praxOpenDailyCheckStage() {
  praxCloseStage();
  const overlay = document.createElement("div");
  overlay.className = "prax-stage-overlay";
  overlay.id = "prax-stage-overlay";
  overlay.innerHTML = `
    <div class="prax-stage-panel${PRAX_REDUCE_MOTION ? "" : " prax-stage-enter"}">
      <div class="prax-stage-topbar">
        <div class="prax-stage-title">Daily strength check</div>
        <div class="prax-stage-diff" id="prax-dcheck-phase">Starting</div>
        <button type="button" class="prax-stage-quit" id="prax-stage-quit">Quit</button>
      </div>
      <div class="prax-stage-body" id="prax-stage-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  PRAX_STAGE = {
    key: "__daily_check__", difficulty: 0, overlay,
    body: overlay.querySelector("#prax-stage-body"),
    fx: null, timerBar: null, comboEl: null,
    midRound: true, combo: 0, maxCombo: 0, cleanups: [],
    timerRaf: null, timerEnd: 0, timerTotal: 0, onTimeout: null,
  };
  overlay.querySelector("#prax-stage-quit").onclick = () => {
    if (!window.confirm("Quit daily check? Progress won't be saved.")) return;
    praxCloseStage();
  };
}

function praxRunDailyCheck() {
  praxOpenDailyCheckStage();
  const body = PRAX_STAGE.body;
  const phaseEl = document.getElementById("prax-dcheck-phase");
  const state = { reactionMs: [], memoryCorrect: 0, memoryTotal: 0, stroopCorrect: 0, stroopTotal: 8, mathCorrect: 0, mathTotal: 3 };

  const setPhase = (label) => { if (phaseEl) phaseEl.textContent = label; };

  const finishAll = () => {
    const reactScores = state.reactionMs.map(praxReactionScoreMs);
    const reaction = reactScores.length ? Math.round(reactScores.reduce((a, b) => a + b, 0) / reactScores.length) : 0;
    const memory = state.memoryTotal ? Math.round((state.memoryCorrect / state.memoryTotal) * 100) : 0;
    const stroop = state.stroopTotal ? Math.round((state.stroopCorrect / state.stroopTotal) * 100) : 0;
    const math = state.mathTotal ? Math.round((state.mathCorrect / state.mathTotal) * 100) : 0;
    const score = Math.round(reaction * 0.25 + memory * 0.25 + stroop * 0.30 + math * 0.20);
    const entry = { date: praxTodayKey(), score, components: { reaction, memory, stroop, math } };
    praxSaveDailyCheckEntry(entry);
    praxAwardDailyCheckXp();
    const energy = Math.round(score / 10);
    body.innerHTML = `
      <div class="prax-result-stage">
        <div class="prax-supporting-text" style="letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Day strength</div>
        <div class="prax-result-score">${escapeHtml(score)}<span style="font-size:0.4em;color:var(--ink-muted);">/100</span></div>
        <div class="prax-dcheck-energy">+${escapeHtml(energy)}/10 day energy (display only)</div>
        <div class="prax-result-xp">+25 XP</div>
        <div class="prax-dcheck-comp" style="max-width:360px;margin:16px auto;">
          ${["reaction", "memory", "stroop", "math"].map(k => {
            const v = entry.components[k];
            const label = k === "stroop" ? "focus" : k;
            return `<div class="prax-dcheck-comp-row"><label>${escapeHtml(label)}</label>
              <div class="prax-dcheck-comp-track"><div class="prax-dcheck-comp-fill" style="width:${escapeHtml(v)}%;"></div></div>
              <span style="width:28px;text-align:right;">${escapeHtml(v)}</span></div>`;
          }).join("")}
        </div>
        <div class="prax-result-actions">
          <button type="button" class="primary prax-game-btn" id="prax-dcheck-done">Back to arcade</button>
        </div>
      </div>`;
    document.getElementById("prax-dcheck-done").onclick = () => { praxCloseStage(); render(); };
    praxStageSetMidRound(false);
  };

  const runMath = (idx) => {
    if (idx >= state.mathTotal) { finishAll(); return; }
    setPhase(`Math ${idx + 1}/${state.mathTotal}`);
    const a = Math.floor(Math.random() * 18) + 4;
    const b = Math.floor(Math.random() * 12) + 3;
    const op = Math.random() < 0.5 ? "+" : "×";
    const answer = op === "+" ? a + b : a * b;
    body.innerHTML = `
      <div class="prax-game-prompt">${escapeHtml(String(a))} ${op} ${escapeHtml(String(b))} = ?</div>
      <input type="number" class="prax-game-input" id="dcheck-math" autocomplete="off">
      <button type="button" class="prax-game-btn primary" id="dcheck-math-go" style="margin-top:12px;">Go</button>`;
    const submit = () => {
      const val = Number(document.getElementById("dcheck-math").value);
      if (val === answer) state.mathCorrect += 1;
      runMath(idx + 1);
    };
    document.getElementById("dcheck-math-go").onclick = submit;
    document.getElementById("dcheck-math").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    document.getElementById("dcheck-math").focus();
  };

  const runStroop = (idx) => {
    if (idx >= state.stroopTotal) { runMath(0); return; }
    setPhase(`Focus ${idx + 1}/${state.stroopTotal}`);
    const word = PRAX_STROOP_COLORS[Math.floor(Math.random() * PRAX_STROOP_COLORS.length)];
    let ink = PRAX_STROOP_COLORS[Math.floor(Math.random() * PRAX_STROOP_COLORS.length)];
    while (ink.name === word.name) ink = PRAX_STROOP_COLORS[Math.floor(Math.random() * PRAX_STROOP_COLORS.length)];
    const pool = praxShuffle(PRAX_STROOP_COLORS);
    body.innerHTML = `
      <div class="prax-game-sub">Tap the INK color — not the word</div>
      <div class="prax-stroop-word" style="color:${escapeHtml(ink.hex)};">${escapeHtml(word.name)}</div>
      <div class="prax-stroop-ink">${pool.map(c =>
        `<button type="button" class="prax-stroop-swatch" data-name="${escapeHtml(c.name)}" style="background:${escapeHtml(c.hex)};" title="${escapeHtml(c.name)}"></button>`).join("")}</div>`;
    body.querySelectorAll(".prax-stroop-swatch").forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.name === ink.name) state.stroopCorrect += 1;
        runStroop(idx + 1);
      };
    });
  };

  const runMemory = () => {
    setPhase("Memory");
    const len = praxMemorySpanFromHistory();
    const digits = Array.from({ length: len }, () => Math.floor(Math.random() * 10));
    state.memoryTotal = len;
    body.innerHTML = `
      <div class="prax-game-prompt">Digits backwards</div>
      <div style="font-size:42px;font-weight:900;letter-spacing:10px;font-variant-numeric:tabular-nums;">${escapeHtml(digits.join(" "))}</div>
      <div class="prax-game-sub">Memorize — recall in <strong>reverse</strong></div>`;
    setTimeout(() => {
      body.innerHTML = `
        <div class="prax-game-prompt">Type reversed</div>
        <input type="text" class="prax-game-input" id="dcheck-mem" inputmode="numeric" autocomplete="off" placeholder="???">
        <button type="button" class="prax-game-btn primary" id="dcheck-mem-go" style="margin-top:12px;">Submit</button>`;
      const expected = digits.slice().reverse().map(String);
      const submit = () => {
        const typed = (document.getElementById("dcheck-mem").value.match(/\d/g) || []);
        state.memoryCorrect = expected.filter((d, i) => typed[i] === d).length;
        runStroop(0);
      };
      document.getElementById("dcheck-mem-go").onclick = submit;
      document.getElementById("dcheck-mem").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
      document.getElementById("dcheck-mem").focus();
    }, Math.max(1800, len * 700));
  };

  const runReaction = (trial) => {
    if (trial >= 5) { runMemory(); return; }
    setPhase(`Reaction ${trial + 1}/5`);
    let armed = false;
    let start = 0;
    body.innerHTML = `
      <div class="prax-game-sub">Tap when the panel flashes green</div>
      <div class="prax-reaction-stage wait" id="rx-stage">Wait...</div>`;
    const stage = document.getElementById("rx-stage");
    const delay = 800 + Math.random() * 1700;
    const armTimer = setTimeout(() => {
      armed = true;
      start = performance.now();
      stage.className = "prax-reaction-stage go";
      stage.textContent = "TAP!";
    }, delay);
    praxStageOnCleanup(() => clearTimeout(armTimer));
    stage.onclick = () => {
      if (!armed) {
        stage.className = "prax-reaction-stage early";
        stage.textContent = "Too soon!";
        state.reactionMs.push(650);
        setTimeout(() => runReaction(trial + 1), 700);
        return;
      }
      const ms = Math.round(performance.now() - start);
      state.reactionMs.push(ms);
      runReaction(trial + 1);
    };
  };

  setPhase("Reaction");
  body.innerHTML = `<div class="prax-game-prompt">Daily strength check</div>
    <div class="prax-game-sub">~90 seconds · 4 micro-tests · honest score</div>
    <button type="button" class="prax-game-btn primary" id="dcheck-begin">Begin</button>`;
  document.getElementById("dcheck-begin").onclick = () => runReaction(0);
}

function praxDailyCardHtml(game) {
  if (!game) return "";
  return `
    <div class="prax-daily">
      <div>
        <span class="prax-daily-tag">Daily challenge</span>
        <div style="font-size:14px; font-weight:800; margin-top:4px;">${escapeHtml(game.label)}</div>
        <div class="prax-supporting-text" style="font-size:11px; margin-top:2px;">2&times; coins today</div>
      </div>
      <button class="primary practice-play" data-key="${escapeHtml(game.key)}" style="padding:6px 14px; font-size:12px;">Play</button>
    </div>`;
}

function praxQuestsRowHtml(dailyGame) {
  return `<div class="prax-quests-row">${praxDailyCheckCardHtml()}${praxDailyCardHtml(dailyGame)}</div>`;
}

function praxLaunchOptionsHtml(g) {
  const difficulty = Math.max(1, Math.min(10, Number(g.difficulty) || 1));
  const timed = ["memory", "working_memory", "math", "logic", "spelling", "hardware"].includes(g.key);
  const modeNote = g.key === "hardware"
    ? "Next: choose from the full Hardware Bay mode grid."
    : g.key === AIT_GAME_KEY
      ? "Next: choose a neural model or weighted random mode."
      : "This override applies to one round; adaptive difficulty continues afterward.";
  return `<div class="prax-launch-options" data-options-key="${escapeHtml(g.key)}">
    <label><span>Difficulty</span><input type="range" min="1" max="10" value="${escapeHtml(difficulty)}" data-launch-difficulty><span class="prax-launch-diff-value">${escapeHtml(difficulty)}</span></label>
    ${timed ? `<label><span>Round timer</span><input type="checkbox" data-launch-timer checked></label>` : ""}
    <p class="prax-launch-mode-note">${escapeHtml(modeNote)}</p>
    <button type="button" class="primary prax-launch-go" data-launch-key="${escapeHtml(g.key)}">Start with options</button>
  </div>`;
}

function praxTileHtml(g, isDaily) {
  const meta = praxGameMeta(g.key);
  const medal = praxMedalFromRatio(g.best_ratio);
  const bestPct = g.best_ratio != null ? Math.round(g.best_ratio * 100) : null;
  const medalHtml = medal.tier === "none"
    ? `<span class="prax-medal-none">—</span>`
    : `<span class="prax-medal" title="${escapeHtml(medal.label)}${bestPct != null ? " " + bestPct + "%" : ""}">${medal.emoji}</span>`;
  const modePill = g.mode === "ai"
    ? '<span class="pill" style="font-size:9px;padding:1px 5px;">AI</span>'
    : g.mode === "longterm" ? '<span class="pill" style="font-size:9px;padding:1px 5px;">Recall</span>'
    : g.local_only ? '<span class="pill" style="font-size:9px;padding:1px 5px;">Local</span>' : "";
  const roomSkinHtml = praxTileRoomSkinHtml(g.key);
  const hwInsigniaHtml = g.key === "hardware" ? praxTileHardwareInsigniaHtml() : "";
  return `
    <div class="prax-tile${isDaily ? " prax-tile-daily" : ""}" data-tile-key="${escapeHtml(g.key)}">
      <div class="prax-tile-head">
        <div class="prax-tile-name">${escapeHtml(meta.icon)} ${escapeHtml(meta.label)}${modePill}${isDaily ? ' <span class="pill" style="font-size:9px;border-color:#fbbf24;color:#fbbf24;padding:1px 5px;">2&times;</span>' : ""}</div>
        <button type="button" class="prax-tile-info" title="Show attempts & history" aria-label="Show details">&#9432;</button>
      </div>
      ${roomSkinHtml || hwInsigniaHtml ? `<div class="prax-tile-badges">${roomSkinHtml}${hwInsigniaHtml}</div>` : ""}
      <div class="prax-tile-row">
        ${medalHtml}
        <div class="prax-diff" title="Difficulty ${escapeHtml(g.difficulty)}/10">${praxDifficultyMeter(g.difficulty)}</div>
      </div>
      <div class="prax-tile-details">
        <span>${escapeHtml(g.attempts || 0)} play${(g.attempts || 0) === 1 ? "" : "s"}</span>
        ${bestPct != null ? `<span>best ${escapeHtml(bestPct)}%</span>` : ""}
      </div>
      <div class="prax-tile-actions">
        <button class="secondary practice-history" data-key="${escapeHtml(g.key)}" title="Recent rounds">&#128203;</button>
        ${g.key === AIT_GAME_KEY ? `<button type="button" class="secondary ait-reviews-btn" data-key="${escapeHtml(g.key)}" title="Reviews archive">&#128218; Reviews</button>` : ""}
        <button class="primary practice-play" data-key="${escapeHtml(g.key)}">Play</button>
      </div>
      ${praxLaunchOptionsHtml(g)}
    </div>`;
}

function praxRenderResult(area, opts) {
  const { key, score, maxScore, difficulty, message, feedback, reference, newDifficulty, stats, vocabLearn } = opts;
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const medal = praxMedalFromScore(score, maxScore);
  const baseCoins = praxPointsEarned(score, maxScore, difficulty);
  const isDaily = praxIsDaily(key);
  const displayCoins = isDaily ? baseCoins * 2 : baseCoins;
  const breakdown = praxRewardBreakdown(score, maxScore, difficulty, {
    maxCombo: (stats && stats.maxCombo) || (PRAX_STAGE && PRAX_STAGE.maxCombo) || 0,
    avgTimeSec: stats?.avgTimeSec,
  });
  praxAwardMatchXp(score, maxScore);
  arcBumpLabSession(key);
  const displayXp = praxMatchXpDisplay(score, maxScore, isDaily);
  const pct = maxScore > 0 ? Math.round(ratio * 100) : 0;
  const maxCombo = (stats && stats.maxCombo) || (PRAX_STAGE && PRAX_STAGE.maxCombo) || 0;
  const avgTime = stats && stats.avgTimeSec != null ? stats.avgTimeSec.toFixed(1) + "s" : null;
  const celebrate = ratio >= 0.8;
  const gameMeta = praxGameMeta(key);

  const renderInto = (container) => {
    container.innerHTML = `
      <div class="prax-result-stage">
        <div class="prax-result-game-name">${escapeHtml(gameMeta.icon)} ${escapeHtml(gameMeta.label)}</div>
        <div class="prax-supporting-text" style="letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Round complete</div>
        <div class="prax-result-ring-wrap">
          <svg class="prax-result-ring" width="140" height="140" viewBox="0 0 100 100">
            <circle class="prax-result-ring-bg" cx="50" cy="50" r="45"></circle>
            <circle class="prax-result-ring-fg" cx="50" cy="50" r="45"
              style="stroke-dashoffset:${283 - (283 * pct / 100)};"></circle>
          </svg>
          <div class="prax-result-ring-pct" id="prax-result-pct">0%</div>
        </div>
        <div class="prax-result-score"><span id="prax-result-score-num">0</span><span style="font-size:0.45em;color:var(--ink-muted);">/${escapeHtml(maxScore)}</span></div>
        <div class="prax-result-medal">${medal.emoji || "&#127922;"}</div>
        <div class="prax-supporting-text">${escapeHtml(medal.label)}${medal.tier !== "none" ? " medal" : ""}</div>
        <div class="prax-result-stat-row">
          <div class="prax-result-stat"><label>Combo max</label><span>x${escapeHtml(maxCombo || 1)}</span></div>
          ${avgTime ? `<div class="prax-result-stat"><label>Avg time</label><span>${escapeHtml(avgTime)}</span></div>` : ""}
        </div>
        <div class="prax-result-coins">+<span id="prax-result-coins-num">0</span> coins${isDaily ? ' <span class="pill" style="font-size:11px;border-color:#fbbf24;color:#fbbf24;">2&times; daily</span>' : ""}</div>
        ${praxRewardLinesHtml(breakdown, "coins", displayCoins)}
        ${praxResultXpLineHtml(displayXp, isDaily)}
        ${displayXp > 0 ? praxRewardLinesHtml(breakdown, "xp", displayXp) : ""}
        ${stats?.stageClear ? `<div class="prax-stage-clear-banner" role="status">${escapeHtml(stats.stageClear)}</div>` : ""}
        ${message ? `<div class="prax-supporting-text" style="margin-top:8px;">${escapeHtml(message)}</div>` : ""}
        ${stats?.teachingPoint ? `<div class="prax-hw-teach"><label>Teaching point</label>${escapeHtml(stats.teachingPoint)}</div>` : ""}
        ${feedback ? `<div style="margin-top:10px;white-space:pre-wrap;text-align:left;max-width:520px;margin:0 auto;">${escapeHtml(feedback)}</div>` : ""}
        ${vocabLearn ? `<ul class="prax-vocab-learn">${vocabLearn}</ul>` : ""}
        ${reference ? `<div class="prax-supporting-text" style="margin-top:6px;">Reference: ${escapeHtml(reference)}</div>` : ""}
        ${newDifficulty != null ? `<div class="prax-supporting-text" style="margin-top:6px;">Next difficulty: ${escapeHtml(newDifficulty)}/10</div>` : ""}
        ${praxFlopPanelHtml(opts)}
        <div class="prax-supporting-text" style="margin-top:10px;font-size:12px;">Space / Enter — play again</div>
        <div class="prax-result-actions">
          <button class="primary prax-game-btn" id="prax-play-again">Play again</button>
          <button class="secondary prax-game-btn" id="prax-back-arcade">Back to arcade</button>
        </div>
      </div>`;
    const pctEl = document.getElementById("prax-result-pct");
    const scoreEl = document.getElementById("prax-result-score-num");
    const coinsEl = document.getElementById("prax-result-coins-num");
    if (pctEl) praxAnimateCount(pctEl, pct, 900);
    if (scoreEl) praxAnimateCount(scoreEl, score, 900);
    if (coinsEl) praxAnimateCount(coinsEl, displayCoins, 1100);
    praxNotifyCoinAward(displayCoins);
    const xpNum = document.getElementById("prax-result-xp-num");
    if (xpNum) praxAnimateCount(xpNum, displayXp, 1100);
    if (celebrate) praxCoinRain(Math.min(24, Math.round(displayCoins / 2)));
    const playAgain = document.getElementById("prax-play-again");
    const backArcade = document.getElementById("prax-back-arcade");
    if (playAgain) playAgain.onclick = () => startPracticeGame(key);
    if (backArcade) backArcade.onclick = () => { praxCloseStage(); render(); };
    praxWireFlopAgent(container, opts);
    praxBindResultKeys(key);
    praxStageSetMidRound(false);
  };

  if (PRAX_STAGE) {
    praxClearRoundTimer();
    renderInto(PRAX_STAGE.body);
  } else {
    area.innerHTML = praxWrapRound(`<div class="prax-result">${""}</div>`);
    renderInto(area.querySelector(".prax-result") || area);
    area.classList.add("prax-round-enter");
  }
}

// --- Arcade match system ---------------------------------------------------------------------------

function arcHashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function arcReceiptExitCode(summary) {
  if (summary == null) return null;
  const s = String(summary);
  const m = s.match(/exit_code[=:\s]+(-?\d+)/i) || s.match(/"exit_code"\s*:\s*(-?\d+)/);
  if (m) return parseInt(m[1], 10);
  if (/exit_code[=:\s]+0\b/i.test(s) || /"exit_code"\s*:\s*0\b/.test(s)) return 0;
  return null;
}

function arcReceiptDayKey(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function arcParseReceiptOsSignals(receipts) {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const signals = {
    daySavedStreak: 0,
    blueprintFail: false,
    noPlanner3Days: true,
    morningPlanner: false,
    afternoonPlanner: false,
  };
  const rows = Array.isArray(receipts) ? receipts : [];
  const plannerRows = rows.filter(r => r && r.source === "planner");
  if (plannerRows.some(r => {
    const t = Date.parse(r.created_at);
    return !Number.isNaN(t) && (now - t) <= threeDaysMs;
  })) {
    signals.noPlanner3Days = false;
  }
  const daySavedKeys = new Set();
  plannerRows.forEach(r => {
    if ((r.kind || "") !== "day_saved") return;
    const key = arcReceiptDayKey(r.created_at);
    if (key) daySavedKeys.add(key);
  });
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const key = arcReceiptDayKey(cursor.toISOString());
    if (key && daySavedKeys.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  signals.daySavedStreak = streak;
  signals.blueprintFail = rows.some(r => {
    if (!r || r.source !== "blueprint") return false;
    const kind = String(r.kind || "").toLowerCase();
    if (kind && kind !== "run" && !kind.includes("run")) return false;
    const code = arcReceiptExitCode(r.summary);
    return code != null && code !== 0;
  });
  plannerRows.forEach(r => {
    const t = Date.parse(r.created_at);
    if (Number.isNaN(t)) return;
    const h = new Date(t).getHours();
    if (h >= 5 && h < 12) signals.morningPlanner = true;
    else if (h >= 12 && h < 17) signals.afternoonPlanner = true;
  });
  return signals;
}

async function arcFetchReceipts() {
  try {
    const resp = await fetch("/api/receipts?limit=50");
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function arcPickOsLine(pool, storageKey, seed) {
  const lines = (pool || []).filter(Boolean);
  if (!lines.length) return "";
  const last = localStorage.getItem(storageKey);
  let candidates = lines.filter(line => line !== last);
  if (!candidates.length) candidates = lines;
  const idx = arcHashStr(seed) % candidates.length;
  const line = candidates[idx];
  localStorage.setItem(storageKey, line);
  return line;
}

function arcPickRivalIntroLine(rival, receipts) {
  const signals = arcParseReceiptOsSignals(receipts);
  let category = "fallback";
  if (signals.blueprintFail) category = "precision";
  else if (signals.daySavedStreak >= 2) category = "discipline";
  else if (signals.noPlanner3Days) category = "slow_start";
  let pool = ARC_RIVAL_OS_LINES.intro[category] || ARC_RIVAL_OS_LINES.intro.fallback;
  if (category === "fallback") {
    pool = [...(rival.taunts || []), ...ARC_RIVAL_OS_LINES.intro.fallback];
  }
  const seed = `${rival.name}|intro|${category}|${signals.daySavedStreak}|${signals.blueprintFail}|${signals.noPlanner3Days}|${receipts.length}`;
  return arcPickOsLine(pool, ARC_RIVAL_OS_LAST_INTRO_KEY, seed) || (rival.taunts && rival.taunts[0]) || "Ready to lose?";
}

function arcPickRivalPostLine(rival, receipts) {
  const signals = arcParseReceiptOsSignals(receipts);
  let category = "fallback";
  if (signals.morningPlanner && !signals.afternoonPlanner) category = "morning_plan";
  else if (signals.afternoonPlanner && !signals.morningPlanner) category = "afternoon_plan";
  else if (signals.morningPlanner && signals.afternoonPlanner) category = "split_plan";
  else if (signals.blueprintFail) category = "blueprint_adapt";
  else if (signals.daySavedStreak >= 2) category = "discipline";
  else if (signals.noPlanner3Days) category = "slow_start";
  const pool = ARC_RIVAL_OS_LINES.post[category] || ARC_RIVAL_OS_LINES.post.fallback;
  const seed = `${rival.name}|post|${category}|${signals.daySavedStreak}|${signals.blueprintFail}|${signals.noPlanner3Days}|${receipts.length}`;
  return arcPickOsLine(pool, ARC_RIVAL_OS_LAST_POST_KEY, seed) || "Keep training.";
}

function arcGetTrophies() {
  return Math.max(0, parseInt(localStorage.getItem("arcadeTrophies") || "0", 10) || 0);
}

function arcSetTrophies(n) {
  localStorage.setItem("arcadeTrophies", String(Math.max(0, n)));
}

function arcGetCoinsBonus() {
  return Math.max(0, parseInt(localStorage.getItem("arcadeCoinsBonus") || "0", 10) || 0);
}

function arcAddCoinsBonus(n) {
  if (!n) return;
  localStorage.setItem("arcadeCoinsBonus", String(arcGetCoinsBonus() + n));
}

function arcGetTrophyRoadProgress() {
  return Math.max(0, parseInt(localStorage.getItem("arcadeTrophyRoad") || "0", 10) || 0);
}

function arcSetTrophyRoadProgress(n) {
  localStorage.setItem("arcadeTrophyRoad", String(Math.max(0, Math.min(10, n))));
}

function arcGetUnlocks() {
  try {
    const u = JSON.parse(localStorage.getItem("arcadeUnlocks") || "{}");
    return u && typeof u === "object" ? u : {};
  } catch (_) {
    return {};
  }
}

function arcSetUnlock(key, val) {
  const u = arcGetUnlocks();
  u[key] = val;
  localStorage.setItem("arcadeUnlocks", JSON.stringify(u));
}

function arcGetLeague(trophies) {
  const t = trophies != null ? trophies : arcGetTrophies();
  if (t >= ARC_LEAGUES.mythic.min) return ARC_LEAGUES.mythic;
  if (t >= ARC_LEAGUES.founder.min) return ARC_LEAGUES.founder;
  return ARC_LEAGUES.campus;
}

function arcGetCanvasStats() {
  try {
    const s = JSON.parse(localStorage.getItem("arcadeCanvasStats") || "{}");
    return s && typeof s === "object" ? s : {};
  } catch (_) {
    return {};
  }
}

function arcUpdateCanvasStats(key, score, maxScore) {
  const stats = arcGetCanvasStats();
  const prev = stats[key] || { attempts: 0, best_ratio: 0, difficulty: 3 };
  const ratio = maxScore > 0 ? score / maxScore : 0;
  prev.attempts += 1;
  prev.best_ratio = Math.max(prev.best_ratio || 0, ratio);
  if (ratio >= 0.75) prev.difficulty = Math.min(10, (prev.difficulty || 3) + 1);
  else if (ratio < 0.4) prev.difficulty = Math.max(1, (prev.difficulty || 3) - 1);
  stats[key] = prev;
  localStorage.setItem("arcadeCanvasStats", JSON.stringify(stats));
  return prev;
}

function arcCanvasDifficulty(key) {
  const s = arcGetCanvasStats()[key];
  return s?.difficulty || 3;
}

function arcCanvasGameMeta() {
  const stats = arcGetCanvasStats();
  const keys = [
    ["signal_storm", "Signal Storm"],
    ["focus_pulse", "Focus Pulse"],
    ["memory_constellation", "Memory Constellation"],
    ["circuit_sprint", "Circuit Sprint"],
    ["time_forge", "Time Forge"],
  ];
  return keys.map(([key, label]) => {
    const cat = PRAX_LOCAL_GAME_CATALOG[key] || {};
    return {
      key, label, category: "Arcade canvas", mode: "local",
      icon: cat.icon || "🎮",
      desc: cat.desc || label,
      difficulty: arcCanvasDifficulty(key),
      best_ratio: stats[key]?.best_ratio ?? null,
      attempts: stats[key]?.attempts || 0,
      local_only: true,
    };
  });
}

function arcSeedRival() {
  const trophies = arcGetTrophies();
  const league = arcGetLeague(trophies);
  const pool = ARC_RIVAL_POOL[league.id] || ARC_RIVAL_POOL.campus;
  const unlocks = arcGetUnlocks();
  const idx = (unlocks.rival_index || 0) % pool.length;
  const pick = pool[idx];
  const rival = {
    name: pick.name,
    epithet: pick.epithet,
    title: `${pick.epithet} Challenger`,
    elo: 1000 + trophies * 12 + league.min * 3,
    league: league.label,
    strengths: praxSample(ARC_LOCAL_POOL, 2),
    weaknesses: praxSample(ARC_LOCAL_POOL, 2),
    mood: "focused",
    adaptation_note: "",
    taunts: pick.taunts || [],
  };
  localStorage.setItem("arcadeRival", JSON.stringify(rival));
  return rival;
}

function arcGetRival() {
  try {
    const r = JSON.parse(localStorage.getItem("arcadeRival") || "null");
    if (r && r.name) return r;
  } catch (_) {}
  return arcSeedRival();
}

function arcSaveRival(rival) {
  localStorage.setItem("arcadeRival", JSON.stringify(rival));
}

function arcGetRivalRoster() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARC_RIVAL_ROSTER_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (_) {
    return {};
  }
}

function arcSaveRivalRoster(roster) {
  localStorage.setItem(ARC_RIVAL_ROSTER_KEY, JSON.stringify(roster));
}

function arcRivalId(rival) {
  return `${rival.name}|${rival.epithet || ""}`;
}

function arcRecordRivalDefeat(rival, opts) {
  if (!rival || !rival.name) return;
  const id = arcRivalId(rival);
  const roster = arcGetRivalRoster();
  const prev = roster[id] || {};
  const score = typeof opts?.bestScore === "number" ? opts.bestScore : 0;
  roster[id] = {
    name: rival.name,
    epithet: rival.epithet || "",
    title: rival.title || "",
    elo: rival.elo,
    league: rival.league || "",
    strengths: rival.strengths || [],
    weaknesses: rival.weaknesses || [],
    taunts: rival.taunts || [],
    bestScore: Math.max(prev.bestScore || 0, score),
    lastTaunt: opts?.lastTaunt || prev.lastTaunt || "",
    defeats: (prev.defeats || 0) + 1,
    lastDefeatedAt: Date.now(),
  };
  arcSaveRivalRoster(roster);
}

function arcLoadRivalFromRoster(entry) {
  const rival = {
    name: entry.name,
    epithet: entry.epithet || "",
    title: entry.title || `${entry.epithet || ""} Challenger`.trim(),
    elo: entry.elo || 1000,
    league: entry.league || "",
    strengths: entry.strengths || [],
    weaknesses: entry.weaknesses || [],
    mood: "irritated",
    adaptation_note: entry.lastTaunt || "",
    taunts: entry.taunts?.length ? entry.taunts : (entry.lastTaunt ? [entry.lastTaunt] : []),
  };
  arcSaveRival(rival);
  return rival;
}

function arcStartRematch(entry) {
  arcLoadRivalFromRoster(entry);
  api("/api/practice/summary").then(s => arcPlayButtonPress(s)).catch(() => arcPlayButtonPress({ points: 0 }));
}

function arcRosterPanelHtml() {
  const roster = arcGetRivalRoster();
  const entries = Object.values(roster).sort((a, b) => (b.lastDefeatedAt || 0) - (a.lastDefeatedAt || 0));
  if (!entries.length) {
    return `<div class="arc-roster-section">
      <div class="arc-roster-head">
        <span class="arc-roster-title">Roster</span>
        <span class="arc-roster-count">0 rivals</span>
      </div>
      <p class="prax-supporting-text" style="font-size:12px;margin:0;">No defeated rivals yet — win a match to fill your roster book.</p>
    </div>`;
  }
  const cards = entries.map((e, i) => {
    const best = e.bestScore != null ? e.bestScore.toFixed(2) : "—";
    const taunt = e.lastTaunt ? `"${escapeHtml(e.lastTaunt)}"` : "—";
    return `<div class="arc-roster-card">
      <div class="arc-roster-name">${escapeHtml(e.name)} ${escapeHtml(e.epithet || "")}</div>
      <div class="arc-roster-stat"><strong>Elo</strong> ${escapeHtml(e.elo)} · <strong>Best</strong> ${escapeHtml(best)} · <strong>Wins</strong> ${escapeHtml(e.defeats || 0)}</div>
      <div class="arc-roster-taunt">${taunt}</div>
      <button type="button" class="secondary arc-roster-rematch" data-roster-idx="${i}">Rematch</button>
    </div>`;
  }).join("");
  return `<div class="arc-roster-section" id="arc-roster-section">
    <div class="arc-roster-head">
      <span class="arc-roster-title">Roster</span>
      <span class="arc-roster-count">${escapeHtml(entries.length)} rival${entries.length === 1 ? "" : "s"}</span>
    </div>
    <div class="arc-roster-grid">${cards}</div>
  </div>`;
}

function arcGetLabSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARC_LAB_SESSIONS_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (_) {
    return {};
  }
}

function arcLabSessionsFor(gameKey) {
  return Math.max(0, parseInt(arcGetLabSessions()[gameKey] || "0", 10) || 0);
}

function arcRoomSkinFor(gameKey) {
  if (ARC_ROOM_SKINS[gameKey]) return ARC_ROOM_SKINS[gameKey];
  const h = arcHashStr(gameKey);
  const fallbacks = [
    { name: "Neon Bunker", color: "#14b8a6" },
    { name: "Midnight Lab", color: "#6366f1" },
    { name: "Copper Loft", color: "#d97706" },
    { name: "Aurora Pod", color: "#22d3ee" },
  ];
  return fallbacks[h % fallbacks.length];
}

function arcRoomSkinUnlocked(gameKey) {
  return arcLabSessionsFor(gameKey) >= ARC_ROOM_UNLOCK_AT;
}

function arcBumpLabSession(gameKey) {
  if (!gameKey || ARC_MATCH_CTX) return null;
  const sessions = arcGetLabSessions();
  const prev = arcLabSessionsFor(gameKey);
  const next = prev + 1;
  sessions[gameKey] = next;
  localStorage.setItem(ARC_LAB_SESSIONS_KEY, JSON.stringify(sessions));
  if (prev < ARC_ROOM_UNLOCK_AT && next >= ARC_ROOM_UNLOCK_AT) {
    const skin = arcRoomSkinFor(gameKey);
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(ARC_ROOM_SKIN_SEEN_KEY) || "[]"); } catch (_) { seen = []; }
    if (!seen.includes(gameKey)) {
      seen.push(gameKey);
      localStorage.setItem(ARC_ROOM_SKIN_SEEN_KEY, JSON.stringify(seen));
      const label = praxGameMeta(gameKey).label;
      arcShowToast(`Room unlocked: ${skin.name} (${label})`);
    }
    return { unlocked: true, skin };
  }
  return { unlocked: false, sessions: next };
}

function praxTileRoomSkinHtml(gameKey) {
  if (!arcRoomSkinUnlocked(gameKey)) return "";
  const skin = arcRoomSkinFor(gameKey);
  return `<span class="prax-tile-room" style="border-color:${escapeHtml(skin.color)};color:${escapeHtml(skin.color)};background:color-mix(in srgb, ${escapeHtml(skin.color)} 14%, transparent);">${escapeHtml(skin.name)}</span>`;
}

function hwRankForLevel(level) {
  const idx = Math.max(0, Math.min(HARDWARE_RANKS.length - 1, level));
  const stage = HARDWARE_STAGES[level] || HARDWARE_STAGES[0];
  const rank = HARDWARE_RANKS[idx] || HARDWARE_RANKS[0];
  return { chevrons: rank.chevrons, name: stage.label, rankName: rank.name };
}

function hwCelebrateRankUp(level) {
  const rank = hwRankForLevel(level);
  const msg = `Hardware rank up — ${rank.rankName} (${rank.name})`;
  arcShowToast(msg);
  if (typeof showToast === "function") showToast(msg, "good");
  praxCelebrate({ duration: 1800, particleCount: 40 });
}

function praxTileHardwareInsigniaHtml() {
  const level = hwGetTrackLevel();
  const rank = hwRankForLevel(level);
  return `<span class="prax-tile-hw-rank" title="${escapeHtml(rank.rankName)}"><span class="prax-hw-chevrons">${escapeHtml(rank.chevrons)}</span>${escapeHtml(rank.name)}</span>`;
}

function arcGetLastMatchResult() {
  try {
    const raw = localStorage.getItem(ARC_LAST_MATCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function arcSaveLastMatchResult(playerWon) {
  localStorage.setItem(ARC_LAST_MATCH_KEY, JSON.stringify({ playerWon: !!playerWon, at: Date.now() }));
}

function arcRivalMoodBadgeLabel() {
  const last = arcGetLastMatchResult();
  if (!last || last.playerWon == null) return "";
  return last.playerWon ? "wary" : "confident";
}

function arcPlayerName() {
  return localStorage.getItem("arcadePlayerName") || "You";
}

function arcPlayerLevel(summary) {
  return praxXpProgress(summary?.points || 0).level;
}

function arcMatchDifficulty(rival) {
  const trophies = arcGetTrophies();
  const league = arcGetLeague(trophies);
  const eloFactor = Math.min(10, Math.max(3, Math.round((rival.elo - 900) / 80)));
  const leagueBump = league.id === "mythic" ? 2 : league.id === "founder" ? 1 : 0;
  return Math.min(10, Math.max(3, eloFactor + leagueBump));
}

function arcGenerateSignalStormRound(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty));
  const pool = praxSample(ARC_SIGNAL_SYMBOLS, Math.min(4 + Math.floor(d / 3), ARC_SIGNAL_SYMBOLS.length));
  const target = pool[Math.floor(Math.random() * pool.length)];
  return {
    duration_seconds: 30,
    target,
    symbol_pool: pool,
    spawn_rate: 0.35 + d * 0.04,
    distractor_mimic: Math.max(0, d - 4),
    speed: 0.6 + d * 0.08,
  };
}

function arcGenerateConstellationRound(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty));
  return {
    node_count: Math.min(12, 4 + d),
    reveal_ms: Math.max(180, 520 - d * 32),
    grid_cols: 5 + Math.floor(d / 3),
    grid_rows: 4 + Math.floor(d / 4),
    palette: d >= 6 ? "constellation" : "default",
  };
}

const ARC_CIRCUIT_COMPONENTS = ["wire", "and", "or", "not"];

function arcGenerateCircuitSprintRound(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty));
  const slotCount = Math.min(7, 2 + Math.floor(d / 2));
  const pool = d < 5 ? ["wire", "and", "not"] : ARC_CIRCUIT_COMPONENTS;
  const solution = Array.from({ length: slotCount }, () => pool[Math.floor(Math.random() * pool.length)]);
  const legend = {};
  ARC_CIRCUIT_COMPONENTS.forEach(c => {
    legend[c] = { wire: "Passes signal through", and: "Both inputs must be on", or: "Either input turns on", not: "Flips the signal" }[c];
  });
  const hintSlot = Math.floor(Math.random() * slotCount);
  const extras = praxSample(ARC_CIRCUIT_COMPONENTS.filter(c => !solution.includes(c)), Math.min(3, ARC_CIRCUIT_COMPONENTS.length));
  return {
    slot_count: slotCount,
    solution,
    goal_description: `Light all ${slotCount} output nodes — match the blueprint so the bulb stays lit.`,
    componentsLegend: legend,
    hint: { slot: hintSlot, component: solution[hintSlot], type: solution[hintSlot] },
    tray: praxShuffle([...solution, ...extras]),
    time_limit: Math.max(18, 48 - d * 2),
  };
}

function arcGenerateTimeForgeRound(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty));
  const roundCount = Math.min(6, 3 + Math.floor(d / 2));
  const targets = Array.from({ length: roundCount }, () =>
    Math.round((0.7 + Math.random() * (1.2 + d * 0.22)) * 10) / 10);
  return {
    round_count: roundCount,
    strike_count: roundCount,
    targets,
    tolerance_pct: Math.max(0.07, 0.17 - d * 0.01),
    distraction_level: d,
    sweet_zone_width: Math.max(0.08, 0.22 - d * 0.014),
    sweep_speed: 0.9 + d * 0.08,
  };
}

function arcGenerateFocusPulseRound(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty));
  return {
    rounds: Math.min(12, 5 + Math.floor(d / 2)),
    speed: 0.0014 + d * 0.00012,
    target_width: Math.max(0.08, 0.22 - d * 0.012),
  };
}

function arcGenerateLocalRound(key, difficulty) {
  if (key === "signal_storm") return arcGenerateSignalStormRound(difficulty);
  if (key === "focus_pulse") return arcGenerateFocusPulseRound(difficulty);
  if (key === "memory_constellation") return arcGenerateConstellationRound(difficulty);
  if (key === "circuit_sprint") return arcGenerateCircuitSprintRound(difficulty);
  if (key === "time_forge") return arcGenerateTimeForgeRound(difficulty);
  if (key === "hardware") return hwGenerateLocalRound(hwGetTrackLevel(), difficulty, hwPickMatchMode());
  if (key === "logic") return praxGenerateLogicPuzzle(difficulty);
  if (key === "math") {
    const problems = [];
    for (let i = 0; i < 5; i++) problems.push(praxGenerateMathProblem(difficulty));
    return { problems: problems.map(p => ({ question: p.question })), answers: problems.map(p => p.answer) };
  }
  if (key === "memory") {
    const wc = Math.min(40, 3 + difficulty);
    const words = praxSample(PRAX_WORD_BANK, wc);
    const pool = PRAX_WORD_BANK.filter(w => !words.includes(w));
    return { words, distractors: praxSample(pool, Math.max(4, wc)), glosses: {}, reveal_seconds: Math.max(3, wc - 1) };
  }
  if (key === "working_memory") {
    const len = 3 + difficulty;
    return { digits: Array.from({ length: len }, () => Math.floor(Math.random() * 10)), reveal_seconds: Math.max(2, Math.round(len * 0.8)) };
  }
  if (key === "time_estimation") {
    return { target_seconds: 4 + difficulty + Math.floor(Math.random() * (difficulty * 2)) };
  }
  if (key === "spelling") return praxGenerateSpellingRound(difficulty);
  return {};
}

function arcRivalAccuracy(rival, key, difficulty) {
  const base = Math.min(0.94, Math.max(0.22, (rival.elo - 800) / 1200));
  const strMod = rival.strengths?.includes(key) ? 0.14 : 0;
  const weakMod = rival.weaknesses?.includes(key) ? -0.12 : 0;
  const diffMod = ((difficulty || 5) - 5) * 0.018;
  return Math.min(0.97, Math.max(0.18, base + strMod + weakMod + diffMod));
}

function arcRivalReactionMs(rival, difficulty, correct) {
  const base = 1800 - (rival.elo - 900) * 0.45;
  const jitter = (Math.random() - 0.5) * 600;
  const diffBump = (difficulty || 5) * 40;
  const missBump = correct ? 0 : 400;
  return Math.max(350, Math.round(base + jitter + diffBump + missBump));
}

function arcRivalIsUnscored(key) {
  const meta = PRACTICE_GAMES.find(g => g.key === key);
  return meta && (meta.mode === "ai" || meta.mode === "longterm");
}

function arcSimulateRivalRound(key, difficulty, rival, roundData) {
  if (arcRivalIsUnscored(key)) {
    return { score: 0, maxScore: 0, unscored: true, breakdown: [], perf: 0 };
  }
  const acc = arcRivalAccuracy(rival, key, difficulty);
  const breakdown = [];
  let correct = 0;
  let total = 0;

  const simChoice = (qIdx, options, answer) => {
    total += 1;
    const hit = Math.random() < acc;
    const ms = arcRivalReactionMs(rival, difficulty, hit);
    breakdown.push({ qIdx, correct: hit, ms, pick: hit ? answer : "—" });
    if (hit) correct += 1;
  };

  if (key === "math") {
    const problems = roundData?.problems || roundData?.answers?.map((a, i) => ({ answer: a })) || [];
    const answers = roundData?.answers || problems.map(p => p.answer);
    (problems.length ? problems : answers).forEach((_, i) => simChoice(i, null, answers[i]));
  } else if (key === "logic") {
    const puzzles = roundData?.puzzles || [roundData].filter(Boolean);
    puzzles.forEach((p, i) => simChoice(i, p.options, p.answer));
  } else if (key === "memory") {
    const wc = (roundData?.words || []).length || 5;
    total = wc;
    for (let i = 0; i < wc; i++) {
      const hit = Math.random() < acc;
      const ms = arcRivalReactionMs(rival, difficulty, hit);
      breakdown.push({ qIdx: i, correct: hit, ms });
      if (hit) correct += 1;
    }
  } else if (key === "working_memory") {
    const len = (roundData?.digits || []).length || 4;
    total = len;
    for (let i = 0; i < len; i++) {
      const hit = Math.random() < acc;
      const ms = arcRivalReactionMs(rival, difficulty, hit);
      breakdown.push({ qIdx: i, correct: hit, ms });
      if (hit) correct += 1;
    }
  } else if (key === "time_estimation") {
    total = 1;
    const hit = Math.random() < acc * 0.85;
    breakdown.push({ qIdx: 0, correct: hit, ms: arcRivalReactionMs(rival, difficulty, hit) });
    correct = hit ? 10 : Math.round(acc * 6);
    return { score: hit ? 10 : correct, maxScore: 10, breakdown, perf: acc, unscored: false };
  } else if (key === "spelling") {
    const words = roundData?.words || [];
    words.forEach((_, i) => simChoice(i, null, words[i]?.correct));
  } else if (key === "circuit_sprint") {
    const sol = roundData?.solution || [];
    total = sol.length || 1;
    sol.forEach((ans, i) => simChoice(i, null, ans));
    const accuracy = total > 0 ? correct / total : 0;
    const score = Math.round(accuracy * 100);
    return { score, maxScore: 100, breakdown, perf: acc, unscored: false };
  } else if (key === "time_forge") {
    const strikes = roundData?.strike_count || roundData?.round_count || (roundData?.targets || []).length || 5;
    total = strikes;
    let strikeScore = 0;
    for (let i = 0; i < strikes; i++) {
      const dist = Math.random() * (1 - acc) * 0.5;
      const pts = Math.max(0, Math.round(100 * (1 - dist * 4)));
      const hit = pts >= 70;
      breakdown.push({ qIdx: i, correct: hit, ms: arcRivalReactionMs(rival, difficulty, hit), pts });
      strikeScore += pts;
      if (hit) correct += 1;
    }
    return { score: Math.round(strikeScore / strikes), maxScore: 100, breakdown, perf: acc, unscored: false };
  } else if (key === "hardware") {
    const qs = roundData?.questions || [];
    total = qs.length || 3;
    for (let i = 0; i < total; i++) {
      const hit = Math.random() < acc;
      breakdown.push({ qIdx: i, correct: hit, ms: arcRivalReactionMs(rival, difficulty, hit) });
      if (hit) correct += 1;
    }
    return { score: correct, maxScore: total, breakdown, perf: acc, unscored: false };
  } else if (key === "memory_constellation") {
    const n = roundData?.node_count || 6;
    total = n;
    for (let i = 0; i < n; i++) {
      const hit = Math.random() < acc * 0.9;
      breakdown.push({ qIdx: i, correct: hit, ms: arcRivalReactionMs(rival, difficulty, hit) });
      if (hit) correct += 1;
    }
    const score = Math.round((correct / Math.max(1, n)) * 100);
    return { score, maxScore: 100, breakdown, perf: acc, unscored: false };
  } else if (key === "signal_storm") {
    const hits = Math.round(acc * 20 + Math.random() * 8);
    return { score: Math.min(100, hits), maxScore: 100, breakdown: [{ qIdx: 0, correct: true, ms: 30000 }], perf: acc, unscored: false };
  } else if (ARC_CANVAS_KEYS.has(key)) {
    const score = Math.round(acc * 100);
    return { score, maxScore: 100, breakdown: [{ qIdx: 0, correct: acc > 0.5, ms: 5000 }], perf: acc, unscored: false };
  }

  const maxScore = key === "time_estimation" ? 10 : total || 10;
  const score = Math.round((correct / Math.max(1, total)) * maxScore);
  return { score, maxScore, breakdown, perf: acc, unscored: false };
}

function arcRivalRunHtml(rivalMeta) {
  if (!rivalMeta) return "";
  if (rivalMeta.unscored) return `<div class="arc-rival-run prax-supporting-text">Rival: unscored for this game type</div>`;
  const rows = (rivalMeta.breakdown || []).map(r =>
    `<div class="arc-rival-run-row"><span>Q${escapeHtml((r.qIdx || 0) + 1)} ${r.correct ? "✓" : "✗"}</span><span>${escapeHtml(r.ms)}ms</span></div>`
  ).join("");
  return `<div class="arc-rival-run"><strong>Rival's run</strong>${rows || '<div class="prax-supporting-text">—</div>'}</div>`;
}

function arcPickMatchGames() {
  const canvasPick = praxSample(ARC_ROTATION_CANVAS, 1);
  const backendKeys = ARC_MATCH_POOL.filter(k => !ARC_CANVAS_KEYS.has(k));
  let weights = backendKeys.map(k => {
    try {
      const tally = JSON.parse(localStorage.getItem(PRAX_PLAY_TIME_KEY) || "{}");
      const total = Object.values(tally).reduce((s, v) => s + v, 0) || 1;
      const share = (tally[k] || 0) / total;
      return Math.max(0.15, 1.4 - share * 3);
    } catch (_) {
      return 1;
    }
  });
  const picks = [];
  const pool = backendKeys.slice();
  const w = weights.slice();
  for (let n = 0; n < 2 && pool.length; n++) {
    const sum = w.reduce((a, b) => a + b, 0);
    let roll = Math.random() * sum;
    let idx = 0;
    for (let i = 0; i < w.length; i++) { roll -= w[i]; if (roll <= 0) { idx = i; break; } }
    picks.push(pool[idx]);
    pool.splice(idx, 1);
    w.splice(idx, 1);
  }
  return praxShuffle([...canvasPick, ...picks]);
}

function arcMatchRivalBannerHtml(key) {
  if (!ARC_MATCH_CTX) return "";
  const rival = ARC_MATCH_CTX.rival;
  const game = praxGameMeta(key);
  return `<div class="arc-match-rival-bar">
    <span><strong>${escapeHtml(rival.name)} ${escapeHtml(rival.epithet)}</strong> is playing <strong>${escapeHtml(game.label)}</strong> — same round as you</span>
  </div>`;
}

function arcRivalScoreForRound(key, difficulty, rival, roundData) {
  return arcSimulateRivalRound(key, difficulty, rival, roundData);
}

function arcAvatarSvg(name) {
  const h = arcHashStr(name);
  const shapes = (h % 5) + 3;
  const hue = h % 360;
  let paths = "";
  for (let i = 0; i < shapes; i++) {
    const a = (i / shapes) * Math.PI * 2;
    const r = 28 + (h >> (i * 3)) % 14;
    const cx = 50 + Math.cos(a) * (18 + (h % 12));
    const cy = 50 + Math.sin(a) * (18 + ((h >> 4) % 12));
    paths += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="hsl(${(hue + i * 40) % 360},70%,55%)" opacity="0.85"/>`;
  }
  return `<svg class="arc-avatar-svg" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="18" fill="#0f1219"/>${paths}<polygon points="50,18 62,42 88,46 68,62 74,88 50,74 26,88 32,62 12,46 38,42" fill="none" stroke="hsl(${hue},80%,60%)" stroke-width="2" opacity="0.5"/></svg>`;
}

function arcShowToast(msg) {
  const el = document.createElement("div");
  el.className = "arc-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), PRAX_REDUCE_MOTION ? 1500 : 2800);
}

function arcAwardTrophyRoadNode(nodeIdx) {
  const node = ARC_TROPHY_ROAD[nodeIdx];
  if (!node) return;
  if (node.reward === "coins") {
    arcAddCoinsBonus(node.amount);
    arcShowToast(`+${node.amount} bonus coins!`);
  } else if (node.reward === "rival_unlock") {
    const u = arcGetUnlocks();
    u.rival_index = (u.rival_index || 0) + 1;
    localStorage.setItem("arcadeUnlocks", JSON.stringify(u));
    arcSeedRival();
    arcShowToast("New rival unlocked!");
  } else if (node.reward === "bonus_trophy") {
    arcSetTrophies(arcGetTrophies() + 1);
    arcShowToast("+1 bonus trophy!");
  } else {
    arcSetUnlock(node.reward, true);
    arcShowToast(node.label + " unlocked!");
  }
}

function arcTrophyRoadHtml() {
  const progress = arcGetTrophyRoadProgress();
  const current = Math.min(10, progress + 1);
  const nodes = ARC_TROPHY_ROAD.map((n, i) => {
    const num = i + 1;
    const cls = num < current ? "done" : num === current ? "current" : "locked";
    return `<div class="arc-road-node ${cls}" data-node="${escapeHtml(num)}">
      <div class="arc-road-dot">${num < current ? "&#10003;" : escapeHtml(num)}</div>
      <div class="arc-road-label">${escapeHtml(n.label)}</div>
    </div>`;
  }).join("");
  return `<div class="arc-match-road-title">Match road — win adaptive matches</div>
  <div class="arc-trophy-road" id="arc-trophy-road"><div class="arc-road-track">${nodes}</div></div>`;
}

function arcPlayButtonHtml() {
  return `<div class="arc-play-wrap">
    <button type="button" class="arc-play-btn" id="arc-play-btn" aria-label="Play adaptive match">
      <div class="arc-play-rim"></div>
      <div class="arc-play-orbit"><span></span><span></span><span></span></div>
      <div class="arc-play-core">
        <div class="arc-play-label">PLAY</div>
        <div class="arc-play-sub">Adaptive match</div>
      </div>
    </button>
  </div>`;
}

function arcWireRivalMicroActing() {
  const face = document.querySelector("#arc-rival-card .arc-rival-face");
  if (!face || PRAX_REDUCE_MOTION) return;

  face.classList.add("load-blink");

  const onAnimEnd = (e) => {
    if (e.target !== face) return;
    if (e.animationName === "arc-rival-blink") {
      face.classList.remove("load-blink");
      const last = arcGetLastMatchResult();
      if (last && last.playerWon === true) {
        face.classList.add("win-reaction");
      } else if (last && last.playerWon === false) {
        face.classList.add("rival-win-reaction");
      }
    } else if (e.animationName === "arc-rival-win-react") {
      face.classList.remove("win-reaction");
    } else if (e.animationName === "arc-rival-smirk") {
      face.classList.remove("rival-win-reaction");
    } else if (e.animationName === "arc-rival-glance") {
      face.classList.remove("idle-glance");
    }
  };
  face.addEventListener("animationend", onAnimEnd);

  window.setTimeout(() => {
    if (document.querySelector("#arc-rival-card .arc-rival-face") !== face) return;
    face.classList.add("idle-glance");
  }, 3000);
}

function arcHubMetaHtml(league) {
  const rival = arcGetRival();
  const bonus = arcGetCoinsBonus();
  return `<div class="arc-meta-row">
    <span class="arc-league-pill">${escapeHtml(league.label)} League</span>
    <span class="arc-trophy-badge">&#127942; ${escapeHtml(arcGetTrophies())} trophies</span>
    ${bonus > 0 ? `<span>+${escapeHtml(bonus)} bonus coins</span>` : ""}
  </div>`;
}

function arcRivalCardHtml() {
  const rival = arcGetRival();
  const league = arcGetLeague();
  const taunts = rival.taunts || ["Ready when you are."];
  const taunt = taunts[arcHashStr(rival.name + rival.epithet) % taunts.length];
  const strList = (rival.strengths || []).map(k => praxGameLabel(k)).join(", ") || "—";
  const weakList = (rival.weaknesses || []).map(k => praxGameLabel(k)).join(", ") || "—";
  const adapt = rival.adaptation_note || "Watching your patterns.";
  const title = rival.title || `${rival.epithet} Challenger`;
  const moodLabel = arcRivalMoodBadgeLabel();
  const moodBadge = PRAX_REDUCE_MOTION && moodLabel
    ? `<span class="arc-rival-mood-badge ${escapeHtml(moodLabel)}">${escapeHtml(moodLabel)}</span>`
    : "";
  return `<div class="arc-rival-card" id="arc-rival-card">
    <div class="arc-rival-face">${arcAvatarSvg(rival.name + rival.epithet)}${moodBadge}</div>
    <div class="arc-rival-info">
      <div class="arc-rival-name">${escapeHtml(rival.name)} ${escapeHtml(rival.epithet)}</div>
      <span class="arc-league-pill">${escapeHtml(league.label)} League</span>
      <div class="arc-rival-title">${escapeHtml(title)}</div>
      <div class="arc-rival-stat"><strong>Elo</strong> ${escapeHtml(rival.elo)} · <strong>Mood</strong> ${escapeHtml(rival.mood || "focused")}</div>
      <div class="arc-rival-stat"><strong>Strengths:</strong> ${escapeHtml(strList)}</div>
      <div class="arc-rival-stat"><strong>Weaknesses:</strong> ${escapeHtml(weakList)}</div>
      <div class="arc-rival-adapt">${escapeHtml(adapt)}</div>
      <div class="arc-rival-taunt">"${escapeHtml(taunt)}"</div>
    </div>
  </div>`;
}

const ARC_SKILL_KEYS = ["accuracy", "reaction", "timing", "pattern"];

function arcSkillCategoryForKey(key) {
  if (key === "signal_storm" || key === "focus_pulse" || key === "working_memory" || key === "circuit_sprint") return "reaction";
  if (key === "time_estimation" || key === "time_forge") return "timing";
  if (key === "memory_constellation") return "pattern";
  return "accuracy";
}

function arcGetSkillHistory() {
  try {
    const h = JSON.parse(localStorage.getItem("arcadeSkillHist") || "{}");
    return h && typeof h === "object" ? h : {};
  } catch (_) {
    return {};
  }
}

function arcSaveSkillHistory(hist) {
  localStorage.setItem("arcadeSkillHist", JSON.stringify(hist));
}

function arcComputeSkillBreakdown(rounds) {
  const hist = arcGetSkillHistory();
  const buckets = { accuracy: [], reaction: [], timing: [], pattern: [] };
  rounds.forEach(r => {
    const cat = arcSkillCategoryForKey(r.key);
    const pct = r.playerMax > 0 ? (r.playerScore / r.playerMax) * 100 : 0;
    buckets[cat].push(pct);
  });
  const avg = cat => {
    const arr = buckets[cat];
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  };
  const deltas = [];
  ARC_SKILL_KEYS.forEach(cat => {
    const now = avg(cat);
    if (now == null) return;
    const prev = hist[cat];
    hist[cat] = prev != null ? prev * 0.6 + now * 0.4 : now;
    if (prev != null) {
      const delta = Math.round(now - prev);
      if (delta !== 0) deltas.push({ cat, delta });
    }
  });
  arcSaveSkillHistory(hist);
  const parts = deltas.slice(0, 2).map(d => {
    const label = d.cat.charAt(0).toUpperCase() + d.cat.slice(1);
    return d.delta > 0 ? `${label} rose ${d.delta}%` : `${label} fell ${Math.abs(d.delta)}%`;
  });
  const trainKey = rounds.sort((a, b) => (b.playerScore / b.playerMax) - (a.playerScore / a.playerMax))[0]?.key;
  const trainLabels = {
    signal_storm: "distractors", focus_pulse: "pulse feints", memory_constellation: "star paths", circuit_sprint: "voltage decay",
    time_forge: "timing feints", logic: "constraint grids", math: "mental math",
    memory: "word flashes", working_memory: "digit spans", time_estimation: "clock tricks",
  };
  const train = trainLabels[trainKey] || "your strengths";
  const sentence = parts.length
    ? `${parts.join(", ")}, rival will train ${train} next.`
    : `Baseline logged — rival will train ${train} next.`;
  return sentence;
}

async function arcResolveCoinsDisplay(summary) {
  let base = summary.points || 0;
  try {
    const w = await api("/api/wallet");
    if (w && w.balance != null) base = w.balance;
  } catch (_) {}
  const bonus = arcGetCoinsBonus();
  return { base, bonus, display: base + bonus };
}

function arcAdaptRival(rival, matchResult) {
  const playerElo = 1000 + arcGetTrophies() * 15;
  rival.elo = Math.round(rival.elo * 0.7 + playerElo * 0.3);
  const skillSentence = arcComputeSkillBreakdown(matchResult.rounds);
  if (matchResult.won) {
    const wonKeys = matchResult.rounds.filter(r => r.playerScore > r.rivalScore).map(r => r.key);
    wonKeys.forEach(k => {
      if (!rival.strengths.includes(k)) rival.strengths.push(k);
      rival.weaknesses = rival.weaknesses.filter(x => x !== k);
    });
    if (rival.strengths.length > 3) rival.strengths = rival.strengths.slice(-3);
  }
  rival.adaptation_note = skillSentence;
  rival.mood = matchResult.won ? "irritated" : "confident";
  arcSaveLastMatchResult(matchResult.won);
  arcSaveRival(rival);
}

function arcPickRivalReaction(rival, contextKey) {
  const pool = [];
  if (rival.adaptation_note) pool.push(rival.adaptation_note);
  (rival.taunts || []).forEach(t => pool.push(t));
  if (!pool.length) return "Keep training.";
  return pool[arcHashStr((rival.name || "") + (contextKey || "") + String(Date.now())) % pool.length];
}

function arcRewardRoadSnippet(nodeIdx) {
  const node = ARC_TROPHY_ROAD[nodeIdx];
  if (!node) return "";
  const num = nodeIdx + 1;
  return `<div class="arc-trophy-road arc-reward-road" id="arc-reward-road">
    <div class="arc-road-track">
      <div class="arc-road-node current arc-road-node-advance" data-node="${escapeHtml(num)}">
        <div class="arc-road-dot" id="arc-reward-road-dot">${escapeHtml(num)}</div>
        <div class="arc-road-label">${escapeHtml(node.label)}</div>
      </div>
    </div>
  </div>`;
}

function arcPlayRewardBeat(opts) {
  const { coins, displayXp, roadNodeIdx, onReveal } = opts || {};
  const reduced = PRAX_REDUCE_MOTION;
  const rival = arcGetRival();
  const rivalLine = opts?.rivalLine != null
    ? opts.rivalLine
    : arcPickRivalReaction(rival, opts?.contextKey || "result");
  const rivalEl = document.getElementById("arc-reward-rival");
  if (rivalEl) {
    rivalEl.textContent = `"${rivalLine}"`;
    if (reduced) rivalEl.style.opacity = "1";
    else rivalEl.classList.add("arc-reward-rival-in");
  }
  if (coins > 0) praxCoinRain(reduced ? 0 : Math.min(20, Math.max(6, Math.round(coins / 2))));
  const coinsEl = document.getElementById("arc-reward-coins-num");
  if (coinsEl) {
    if (reduced) coinsEl.textContent = coins;
    else praxAnimateCount(coinsEl, coins, 900);
  }
  const xpEl = document.getElementById("arc-reward-xp-num");
  if (xpEl && displayXp != null && displayXp > 0) {
    if (reduced) xpEl.textContent = displayXp;
    else praxAnimateCount(xpEl, displayXp, 900);
  }
  const roadDot = document.getElementById("arc-reward-road-dot");
  if (roadDot && roadNodeIdx != null) {
    if (reduced) {
      roadDot.textContent = "\u2713";
      roadDot.closest(".arc-road-node")?.classList.replace("current", "done");
    } else {
      roadDot.classList.add("arc-road-dot-pulse");
      setTimeout(() => {
        const node = roadDot.closest(".arc-road-node");
        if (node) {
          node.classList.remove("current");
          node.classList.add("done");
          roadDot.textContent = "\u2713";
        }
      }, 700);
    }
  }
  const delay = reduced ? 380 : 1550;
  setTimeout(() => {
    const stats = document.getElementById("arc-result-stats");
    if (stats) stats.classList.add("arc-result-stats-in");
    if (onReveal) onReveal();
  }, delay);
}

function arcFinishCanvasGame(key, difficulty, score, maxScore, area, message) {
  arcUpdateCanvasStats(key, score, maxScore);
  if (ARC_MATCH_CTX) {
    arcMatchRoundComplete(key, score, maxScore);
    return;
  }
  praxClearRoundTimer();
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const medal = praxMedalFromRatio(ratio);
  const coins = praxPointsEarned(score, maxScore, difficulty);
  const isDaily = praxIsDaily(key);
  praxAwardMatchXp(score, maxScore);
  const displayXp = praxMatchXpDisplay(score, maxScore, isDaily);
  arcBumpLabSession(key);
  area.innerHTML = `
    <div class="prax-result-stage">
      <div class="prax-result-game-name">${escapeHtml(praxGameMeta(key).icon)} ${escapeHtml(praxGameMeta(key).label)}</div>
      <div class="arc-reward-beat" id="arc-reward-beat">
        <div class="arc-reward-coins">+<span id="arc-reward-coins-num">0</span> coins</div>
        ${displayXp > 0 ? `<div class="arc-reward-xp">+<span id="arc-reward-xp-num">0</span> XP${isDaily ? ' <span class="pill" style="font-size:10px;border-color:var(--accent);color:var(--accent);">2&times; daily</span>' : ""}</div>` : ""}
        <div class="arc-reward-rival" id="arc-reward-rival"></div>
      </div>
      <div class="arc-result-stats" id="arc-result-stats">
        <div class="prax-supporting-text" style="color:#ddd;">Round complete</div>
        <div class="prax-result-score">${escapeHtml(score)}<span style="font-size:0.45em;color:#ccc;">/${escapeHtml(maxScore)}</span></div>
        <div class="prax-result-medal">${medal.emoji || "&#127922;"}</div>
        <div style="font-size:14px;color:#ddd;margin:8px 0;">${escapeHtml(message || "")}</div>
        <div class="prax-supporting-text" style="font-size:12px;color:#ccc;">Canvas stats saved locally</div>
        <div class="prax-result-actions" style="margin-top:16px;">
          <button class="primary prax-game-btn" id="arc-canvas-again">Play again</button>
          <button class="secondary prax-game-btn" id="arc-canvas-back">Back</button>
        </div>
      </div>
    </div>`;
  arcPlayRewardBeat({ coins, displayXp, contextKey: key });
  const againBtn = document.getElementById("arc-canvas-again");
  const backBtn = document.getElementById("arc-canvas-back");
  if (againBtn) againBtn.onclick = () => startPracticeGame(key);
  if (backBtn) backBtn.onclick = () => { praxCloseStage(); render(); };
  praxStageSetMidRound(false);
}

function arcDrawSymbol(ctx, sym, x, y, size) {
  const hue = sym.hue ?? 0;
  ctx.fillStyle = `hsl(${hue}, 75%, 58%)`;
  ctx.strokeStyle = `hsl(${hue}, 80%, 72%)`;
  ctx.lineWidth = 2;
  const s = size / 2;
  ctx.beginPath();
  if (sym.shape === "triangle") {
    ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8);
  } else if (sym.shape === "square") {
    ctx.rect(x - s, y - s, s * 2, s * 2);
  } else if (sym.shape === "hexagon") {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else if (sym.shape === "diamond") {
    ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
  } else if (sym.shape === "star") {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 ? s * 0.45 : s;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  } else {
    ctx.arc(x, y, s, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function renderSignalStormGame(area, difficulty, roundIn) {
  const round = roundIn || arcGenerateSignalStormRound(difficulty);
  praxStageSetMidRound(true);
  const W = 560, H = 360;
  area.innerHTML = `
    <div class="arc-canvas-hud">
      <span class="arc-target-symbol" id="arc-ss-target" title="Target symbol"></span>
      <span id="arc-ss-score" style="color:#fff;">0</span>
      <span id="arc-ss-timer" style="color:#eee;">30s</span>
      <span id="arc-ss-combo" style="color:#fbbf24;">x1</span>
    </div>
    <div class="arc-canvas-wrap"><canvas class="arc-canvas" id="arc-ss-canvas" width="${W}" height="${H}"></canvas></div>`;
  const canvas = document.getElementById("arc-ss-canvas");
  const ctx = canvas.getContext("2d");
  const targetEl = document.getElementById("arc-ss-target");
  const mini = document.createElement("canvas");
  mini.width = 36; mini.height = 36;
  arcDrawSymbol(mini.getContext("2d"), round.target, 18, 18, 28);
  targetEl.appendChild(mini);
  let particles = [];
  let bursts = [];
  let hits = 0, falseHits = 0, combo = 0, maxCombo = 0;
  const duration = round.duration_seconds || 30;
  const gameStart = performance.now();
  const mimic = round.distractor_mimic || 0;
  const spawn = () => {
    const sym = round.symbol_pool[Math.floor(Math.random() * round.symbol_pool.length)];
    const isTarget = sym.id === round.target.id;
    const mimicShape = !isTarget && mimic > 0 && Math.random() < mimic * 0.12;
    const mimicColor = !isTarget && mimic > 0 && Math.random() < mimic * 0.15;
    particles.push({
      x: Math.random() * (W - 40) + 20,
      y: Math.random() * (H - 40) + 20,
      vx: (Math.random() - 0.5) * round.speed * 2,
      vy: (Math.random() - 0.5) * round.speed * 2,
      sym: mimicShape ? { ...sym, shape: round.target.shape } : mimicColor ? { ...sym, hue: round.target.hue } : sym,
      r: 14 + Math.random() * 6,
    });
  };
  let lastSpawn = 0;
  let running = true;
  let rafId = null;
  const stopLoop = () => {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  };
  const draw = (ts) => {
    if (!running || !PRAX_STAGE) return;
    if (!lastSpawn) lastSpawn = ts;
    const dt = (ts - lastSpawn) / 1000;
    if (dt > 1 / round.spawn_rate) { spawn(); lastSpawn = ts; }
    const elapsed = (performance.now() - gameStart) / 1000;
    ctx.fillStyle = "#060810";
    ctx.fillRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 20 || p.x > W - 20) p.vx *= -1;
      if (p.y < 20 || p.y > H - 20) p.vy *= -1;
      arcDrawSymbol(ctx, p.sym, p.x, p.y, p.r * 2);
    });
    bursts = bursts.filter(b => {
      b.life -= 0.04;
      ctx.globalAlpha = b.life;
      ctx.fillStyle = b.color;
      b.parts.forEach(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      return b.life > 0;
    });
    if (combo >= 3 && !PRAX_REDUCE_MOTION) {
      ctx.strokeStyle = `rgba(251,191,36,${0.3 + combo * 0.05})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, W - 8, H - 8);
    }
    const left = Math.max(0, duration - elapsed);
    const timerEl = document.getElementById("arc-ss-timer");
    if (timerEl) timerEl.textContent = left.toFixed(1) + "s";
    const scoreEl = document.getElementById("arc-ss-score");
    if (scoreEl) scoreEl.textContent = "Score: " + (hits * Math.max(1, combo) - falseHits);
    const comboEl = document.getElementById("arc-ss-combo");
    if (comboEl) comboEl.textContent = "x" + Math.max(1, combo);
    if (left <= 0) { stopLoop(); finish(); return; }
    rafId = requestAnimationFrame(draw);
  };
  const explode = (x, y, color) => {
    const parts = Array.from({ length: 12 }, () => ({
      x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
    }));
    bursts.push({ parts, life: 1, color: color || "#fbbf24" });
  };
  const finish = () => {
    stopLoop();
    praxStageSetMidRound(false);
    const score = Math.max(0, hits * Math.max(1, maxCombo) - falseHits);
    arcFinishCanvasGame("signal_storm", difficulty, Math.min(100, score), 100, area,
      `${hits} hits, ${falseHits} false taps, max combo x${maxCombo}`);
  };
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const dx = mx - p.x, dy = my - p.y;
      if (dx * dx + dy * dy < p.r * p.r * 2.5) {
        if (p.sym.id === round.target.id) {
          hits++; combo++; maxCombo = Math.max(maxCombo, combo);
          explode(p.x, p.y, `hsl(${round.target.hue},80%,60%)`);
          praxUpdateCombo(true);
        } else {
          falseHits++; combo = 0;
          explode(p.x, p.y, "#ef4444");
          praxUpdateCombo(false);
        }
        particles.splice(i, 1);
        return;
      }
    }
    falseHits++; combo = 0; praxUpdateCombo(false);
  };
  praxStageOnCleanup(() => { stopLoop(); });
  rafId = requestAnimationFrame(draw);
}

function renderFocusPulseGame(area, difficulty, roundIn) {
  const round = roundIn || arcGenerateFocusPulseRound(difficulty);
  praxStageSetMidRound(true);
  const W = 560, H = 260;
  const total = round.rounds || 6;
  let index = 0;
  let scoreTotal = 0;
  let target = 0.2 + Math.random() * 0.6;
  let pulse = 0;
  let rafId = null;
  let running = true;
  area.innerHTML = `
    <div class="arc-canvas-hud"><span>Tap when the pulse enters the cyan zone</span><span id="arc-fp-round">1/${escapeHtml(total)}</span><span id="arc-fp-score">0</span></div>
    <div class="arc-canvas-wrap"><canvas class="arc-canvas" id="arc-fp-canvas" width="${W}" height="${H}"></canvas></div>`;
  const canvas = document.getElementById("arc-fp-canvas");
  const ctx = canvas.getContext("2d");
  const draw = ts => {
    if (!running || !PRAX_STAGE) return;
    pulse = (Math.sin(ts * (round.speed || 0.015)) + 1) / 2;
    const zoneWidth = round.target_width || 0.14;
    ctx.fillStyle = "#060810";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(34,211,238,.18)";
    ctx.fillRect((target - zoneWidth / 2) * W, 24, zoneWidth * W, H - 48);
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 3;
    ctx.strokeRect((target - zoneWidth / 2) * W, 24, zoneWidth * W, H - 48);
    const x = pulse * (W - 40) + 20;
    const glow = ctx.createRadialGradient(x, H / 2, 2, x, H / 2, 34);
    glow.addColorStop(0, "#fff");
    glow.addColorStop(.25, "#a5f3fc");
    glow.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, H / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#67e8f9";
    ctx.beginPath();
    ctx.arc(x, H / 2, 9, 0, Math.PI * 2);
    ctx.fill();
    rafId = requestAnimationFrame(draw);
  };
  const finish = () => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    const score = Math.round(scoreTotal / Math.max(1, total));
    arcFinishCanvasGame("focus_pulse", difficulty, score, 100, area, `${score}% average pulse accuracy`);
  };
  canvas.onclick = () => {
    const error = Math.abs(pulse - target);
    const hitScore = Math.max(0, Math.round(100 - error * 420));
    scoreTotal += hitScore;
    index += 1;
    praxUpdateCombo(hitScore >= 70);
    const scoreEl = document.getElementById("arc-fp-score");
    if (scoreEl) scoreEl.textContent = `${Math.round(scoreTotal / index)}%`;
    if (index >= total) {
      finish();
      return;
    }
    target = 0.2 + Math.random() * 0.6;
    const roundEl = document.getElementById("arc-fp-round");
    if (roundEl) roundEl.textContent = `${index + 1}/${total}`;
  };
  praxStageOnCleanup(() => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  });
  rafId = requestAnimationFrame(draw);
}

function renderMemoryConstellationGame(area, difficulty, roundIn) {
  const round = roundIn || arcGenerateConstellationRound(difficulty);
  praxStageSetMidRound(true);
  const W = 560, H = 400;
  const cols = round.grid_cols || 6, rows = round.grid_rows || 5;
  const nodes = [];
  const pad = 40;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({
        x: pad + (c + 0.5) * (W - pad * 2) / cols + (Math.random() - 0.5) * 12,
        y: pad + (r + 0.5) * (H - pad * 2) / rows + (Math.random() - 0.5) * 12,
        id: r * cols + c,
      });
    }
  }
  const pathLen = Math.min(round.node_count || 6, nodes.length);
  const sequence = praxSample(nodes.map(n => n.id), pathLen).map(id => nodes.find(n => n.id === id));
  const palette = round.palette === "constellation" || arcGetUnlocks().skin_constellation
    ? { bg: "#0a0618", star: "#c4b5fd", line: "#fbbf24", glow: "#a78bfa" }
    : { bg: "#060810", star: "#93c5fd", line: "#22d3ee", glow: "#38bdf8" };
  area.innerHTML = `
    <div class="arc-canvas-hud"><span>Trace the constellation</span><span id="arc-mc-phase">Watch...</span></div>
    <div class="arc-canvas-wrap"><canvas class="arc-canvas" id="arc-mc-canvas" width="${W}" height="${H}"></canvas></div>`;
  const canvas = document.getElementById("arc-mc-canvas");
  const ctx = canvas.getContext("2d");
  let phase = "reveal";
  let revealIdx = 0;
  let traced = [];
  let dragging = false;
  let startTime = 0;
  const draw = () => {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    nodes.forEach(n => {
      const lit = sequence.slice(0, revealIdx).some(s => s.id === n.id) || traced.some(t => t.id === n.id);
      ctx.beginPath();
      ctx.arc(n.x, n.y, lit ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = lit ? palette.star : "rgba(255,255,255,0.45)";
      if (lit) { ctx.shadowColor = palette.glow; ctx.shadowBlur = 12; }
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    if (phase === "reveal" && revealIdx > 0) {
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < revealIdx; i++) {
        const p = sequence[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    if (traced.length > 1) {
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      traced.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    }
    if (phase === "done") {
      ctx.font = "bold 24px system-ui,sans-serif";
      ctx.fillStyle = palette.glow;
      ctx.textAlign = "center";
      ctx.fillText("CONSTELLATION", W / 2, H / 2);
    }
  };
  const revealNext = () => {
    if (revealIdx < sequence.length) {
      revealIdx++;
      draw();
      setTimeout(revealNext, round.reveal_ms || 400);
    } else {
      phase = "trace";
      const phaseEl = document.getElementById("arc-mc-phase");
      if (phaseEl) phaseEl.textContent = "Your turn — drag through stars";
      startTime = performance.now();
    }
  };
  const near = (mx, my) => {
    for (const n of nodes) {
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy < 20 * 20) return n;
    }
    return null;
  };
  const finish = () => {
    phase = "done";
    draw();
    praxStageSetMidRound(false);
    let correct = 0;
    sequence.forEach((s, i) => { if (traced[i] && traced[i].id === s.id) correct++; });
    const accuracy = sequence.length > 0 ? correct / sequence.length : 0;
    const elapsed = (performance.now() - startTime) / 1000;
    const speedBonus = Math.max(0, Math.round((1 - Math.min(1, elapsed / (sequence.length * 2))) * 30));
    const score = Math.round(accuracy * 70 + speedBonus);
    arcFinishCanvasGame("memory_constellation", difficulty, Math.min(100, score), 100, area,
      `${Math.round(accuracy * 100)}% accuracy + ${speedBonus} speed bonus`);
  };
  const onMove = (mx, my) => {
    if (phase !== "trace") return;
    const n = near(mx, my);
    if (!n || !dragging) return;
    const last = traced[traced.length - 1];
    if (!last || last.id !== n.id) {
      traced.push(n);
      draw();
      if (traced.length >= sequence.length) finish();
    }
  };
  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    dragging = true;
    traced = [];
    const n = near((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height));
    if (n) traced.push(n);
    draw();
  };
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    onMove((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height));
  };
  canvas.onmouseup = () => { dragging = false; };
  canvas.ontouchstart = (e) => { e.preventDefault(); canvas.onmousedown(e.touches[0]); };
  canvas.ontouchmove = (e) => { e.preventDefault(); canvas.onmousemove(e.touches[0]); };
  canvas.ontouchend = () => { dragging = false; };
  praxStageOnCleanup(() => { phase = "done"; });
  draw();
  setTimeout(revealNext, 600);
}

function arcCircuitChipLabel(type) {
  return { wire: "WIRE", and: "AND", or: "OR", not: "NOT" }[type] || String(type || "").toUpperCase();
}

function arcCircuitLegendEntries(legendIn) {
  const raw = legendIn || [];
  if (Array.isArray(raw)) {
    return raw.map(e => [e.type, e.meaning || e.desc || e.symbol || e.type]);
  }
  return Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : (v?.meaning || v?.desc || k)]);
}

function renderCircuitSprintGame(area, difficulty, roundIn) {
  const round = roundIn || arcGenerateCircuitSprintRound(difficulty);
  praxStageSetMidRound(true);
  const W = 560, H = 320;
  const solution = round.solution || [];
  const slotCount = round.slot_count || solution.length;
  const legend = round.componentsLegend || round.components_legend || {};
  const goal = round.goal_description || "Place components so every output lights up — press Energize when all slots match.";
  const placed = Array(slotCount).fill(null);
  let selectedChip = null;
  let hintSlot = -1;
  let elapsed = 0;
  let lastTick = performance.now();
  let running = true;
  let rafId = null;
  const trayCounts = {};
  (round.tray || [...solution]).forEach(c => { trayCounts[c] = (trayCounts[c] || 0) + 1; });

  const legendHtml = arcCircuitLegendEntries(legend).map(([k, v]) =>
    `<div class="arc-circuit-legend-item"><strong>${escapeHtml(arcCircuitChipLabel(k))}</strong> — ${escapeHtml(v)}</div>`
  ).join("");

  area.innerHTML = `
    <div class="arc-canvas-hud">
      <span style="color:#fff;">Circuit Sprint</span>
      <span id="arc-cs-timer" style="color:#eee;">${escapeHtml(round.time_limit || 60)}s</span>
      <span id="arc-cs-status" style="color:#fbbf24;">0/${escapeHtml(slotCount)} outputs</span>
    </div>
    <div class="arc-circuit-goal">${escapeHtml(goal)}</div>
    <div class="arc-circuit-legend">${legendHtml}</div>
    <div class="arc-canvas-wrap"><canvas class="arc-canvas" id="arc-cs-canvas" width="${W}" height="${H}"></canvas></div>
    <div class="arc-circuit-tray" id="arc-cs-tray"></div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:10px;flex-wrap:wrap;">
      <button type="button" class="secondary prax-game-btn" id="arc-cs-hint">Hint</button>
      <button type="button" class="prax-game-btn primary" id="arc-cs-check">Energize</button>
    </div>
    <p class="prax-game-sub" style="margin-top:8px;font-size:12px;">Select a chip, click an empty slot to place. Click a filled slot to return it to the tray.</p>`;

  const canvas = document.getElementById("arc-cs-canvas");
  const ctx = canvas.getContext("2d");
  const trayEl = document.getElementById("arc-cs-tray");
  const slots = Array.from({ length: slotCount }, (_, i) => ({
    x: 70 + i * ((W - 140) / Math.max(1, slotCount - 1 || 1)),
    y: H / 2,
    idx: i,
  }));
  if (slotCount === 1) slots[0].x = W / 2;

  const rebuildTray = () => {
    if (!trayEl) return;
    trayEl.innerHTML = "";
    Object.entries(trayCounts).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "arc-circuit-chip" + (selectedChip === type ? " selected" : "");
        el.textContent = arcCircuitChipLabel(type);
        el.dataset.type = type;
        el.onclick = () => {
          selectedChip = selectedChip === type ? null : type;
          syncTraySelection();
        };
        trayEl.appendChild(el);
      }
    });
  };
  const syncTraySelection = () => {
    if (!trayEl) return;
    trayEl.querySelectorAll(".arc-circuit-chip").forEach(el => {
      el.classList.toggle("selected", selectedChip === el.dataset.type);
    });
  };
  rebuildTray();

  const outputsLit = () => placed.filter((p, i) => p === solution[i]).length;
  let lastHudUpdate = 0;

  const drawBoard = (forceHud) => {
    ctx.fillStyle = "#060810";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, H / 2);
    slots.forEach((s, i) => {
      if (i === 0) ctx.lineTo(s.x - 30, s.y);
      else ctx.lineTo(s.x - 30, s.y);
      if (i < slots.length - 1) ctx.lineTo(slots[i + 1].x - 30, slots[i + 1].y);
    });
    ctx.lineTo(W - 24, H / 2);
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 14px system-ui,sans-serif";
    ctx.fillText("+", 12, H / 2 + 5);
    const litCount = outputsLit();
    const bulbLit = litCount === slotCount;
    ctx.fillStyle = bulbLit ? "#fbbf24" : "#444";
    ctx.beginPath();
    ctx.arc(W - 24, H / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    if (bulbLit) { ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0; }
    slots.forEach((s, i) => {
      const correct = placed[i] === solution[i];
      const isHint = i === hintSlot;
      ctx.strokeStyle = correct ? "#22c55e" : placed[i] ? "#f59e0b" : isHint ? "#fbbf24" : "rgba(255,255,255,0.35)";
      ctx.lineWidth = isHint ? 3 : 2;
      ctx.strokeRect(s.x - 28, s.y - 24, 56, 48);
      if (placed[i]) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px system-ui,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(arcCircuitChipLabel(placed[i]), s.x, s.y + 4);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.font = "10px system-ui,sans-serif";
        ctx.fillText(`OUT ${i + 1}`, s.x, s.y + 4);
      }
    });
    const now = performance.now();
    if (forceHud || now - lastHudUpdate >= 250) {
      lastHudUpdate = now;
      const litCount = outputsLit();
      const st = document.getElementById("arc-cs-status");
      if (st) st.textContent = `${litCount}/${slotCount} outputs`;
      const tEl = document.getElementById("arc-cs-timer");
      if (tEl) tEl.textContent = Math.max(0, (round.time_limit || 60) - elapsed).toFixed(0) + "s";
    }
  };

  const slotAt = (mx, my) => {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (mx >= s.x - 28 && mx <= s.x + 28 && my >= s.y - 24 && my <= s.y + 24) return i;
    }
    return -1;
  };

  const stopLoop = () => { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } };

  const finish = () => {
    stopLoop();
    praxStageSetMidRound(false);
    let correct = 0;
    solution.forEach((sol, i) => { if (placed[i] === sol) correct++; });
    const score = Math.min(100, Math.round((correct / Math.max(1, slotCount)) * 100));
    praxLogGameplay({ game: "circuit_sprint", qIdx: 0, correct: correct === slotCount, ms: elapsed * 1000, difficulty });
    arcFinishCanvasGame("circuit_sprint", difficulty, score, 100, area,
      `${correct}/${slotCount} outputs correct`);
  };

  const tick = () => {
    if (!running || !PRAX_STAGE) return;
    const now = performance.now();
    elapsed += (now - lastTick) / 1000;
    lastTick = now;
    drawBoard();
    if (elapsed >= (round.time_limit || 60)) { finish(); return; }
    rafId = requestAnimationFrame(tick);
  };

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    const si = slotAt(mx, my);
    if (si < 0) return;
    if (placed[si]) {
      const removed = placed[si];
      placed[si] = null;
      trayCounts[removed] = (trayCounts[removed] || 0) + 1;
      selectedChip = null;
      rebuildTray();
    } else if (selectedChip && (trayCounts[selectedChip] || 0) > 0) {
      placed[si] = selectedChip;
      trayCounts[selectedChip] -= 1;
      if (trayCounts[selectedChip] <= 0) delete trayCounts[selectedChip];
      selectedChip = null;
      rebuildTray();
    }
    drawBoard(true);
  };

  const hintBtn = document.getElementById("arc-cs-hint");
  if (hintBtn) hintBtn.onclick = () => {
    const hint = round.hint || { slot: 0, component: solution[0] };
    hintSlot = hint.slot != null ? hint.slot : 0;
    const hintType = hint.component || hint.type;
    if (!placed[hintSlot] && hintType) {
      selectedChip = hintType;
      syncTraySelection();
    }
    drawBoard(true);
    setTimeout(() => { hintSlot = -1; drawBoard(true); }, 2500);
  };

  const checkBtn = document.getElementById("arc-cs-check");
  if (checkBtn) checkBtn.onclick = () => {
    const allCorrect = placed.every((p, i) => p === solution[i]);
    if (allCorrect) praxUpdateCombo(true);
    else praxUpdateCombo(false);
    setTimeout(finish, allCorrect ? 700 : 300);
  };

  praxStageOnCleanup(() => stopLoop());
  drawBoard(true);
  rafId = requestAnimationFrame(tick);
}

function renderTimeForgeGame(area, difficulty, roundIn) {
  const round = roundIn || arcGenerateTimeForgeRound(difficulty);
  praxStageSetMidRound(true);
  const strikeCount = round.strike_count || 5;
  const zoneWidth = round.sweet_zone_width || Math.max(0.08, 0.2 - difficulty * 0.012);
  const sweepSpeed = round.sweep_speed || (0.9 + difficulty * 0.08);
  let strikeIdx = 0;
  let strikeScores = [];
  let strikeLog = [];
  let phase = 0;
  let running = true;
  let rafId = null;

  area.innerHTML = `
    <div class="arc-canvas-hud">
      <span style="color:#fff;">Forge Strikes</span>
      <span id="arc-tf-strike" style="color:#eee;">Strike 1/${escapeHtml(strikeCount)}</span>
      <span id="arc-tf-avg" style="color:#fbbf24;">—</span>
    </div>
    <p class="prax-game-sub">Click when the needle hits the green sweet zone.</p>
    <div class="arc-forge-bar-wrap" id="arc-tf-bar">
      <div class="arc-forge-sweet" id="arc-tf-sweet"></div>
      <div class="arc-forge-needle" id="arc-tf-needle"></div>
    </div>
    <button type="button" class="prax-game-btn primary" id="arc-tf-strike-btn">STRIKE</button>
    <div class="arc-forge-strike-log" id="arc-tf-log"></div>`;

  const sweetEl = document.getElementById("arc-tf-sweet");
  const needleEl = document.getElementById("arc-tf-needle");
  const logEl = document.getElementById("arc-tf-log");
  const barEl = document.getElementById("arc-tf-bar");
  const barW = () => barEl?.clientWidth || 480;
  const center = 0.5;
  const half = zoneWidth / 2;
  if (sweetEl) {
    sweetEl.style.left = ((center - half) * 100) + "%";
    sweetEl.style.width = (zoneWidth * 100) + "%";
  }

  const stopLoop = () => { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; };

  const needlePos = () => 0.5 + 0.5 * Math.sin(phase);

  const draw = () => {
    if (!running || !PRAX_STAGE) return;
    phase += 0.016 * sweepSpeed * (1 + difficulty * 0.04);
    const pos = needlePos();
    if (needleEl) needleEl.style.left = (pos * 100) + "%";
    rafId = requestAnimationFrame(draw);
  };

  const doStrike = () => {
    if (strikeIdx >= strikeCount) return;
    const pos = needlePos();
    const dist = Math.abs(pos - center);
    const inZone = dist <= half;
    const pts = Math.max(0, Math.round(100 * (1 - dist / 0.5)));
    strikeScores.push(pts);
    const msg = inZone
      ? `Perfect! ${pts} pts (center ${(dist * 100).toFixed(0)}% off)`
      : `${pts} pts — ${(dist * 100).toFixed(0)}% from center`;
    strikeLog.push(`Strike ${strikeIdx + 1}: ${msg}`);
    if (logEl) {
      const row = document.createElement("div");
      row.className = "arc-forge-strike-row";
      row.textContent = `Strike ${strikeIdx + 1}: ${msg}`;
      logEl.appendChild(row);
    }
    praxLogGameplay({ game: "time_forge", qIdx: strikeIdx, correct: inZone, ms: 0, difficulty });
    if (inZone) { praxUpdateCombo(true); praxScorePopup(pts); }
    else praxUpdateCombo(false);
    strikeIdx += 1;
    const strikeEl = document.getElementById("arc-tf-strike");
    if (strikeEl) strikeEl.textContent = strikeIdx < strikeCount ? `Strike ${strikeIdx + 1}/${strikeCount}` : "Done";
    const avgEl = document.getElementById("arc-tf-avg");
    if (avgEl && strikeScores.length) avgEl.textContent = `Avg ${Math.round(strikeScores.reduce((a, b) => a + b, 0) / strikeScores.length)}`;
    if (strikeIdx >= strikeCount) {
      stopLoop();
      praxStageSetMidRound(false);
      const score = Math.round(strikeScores.reduce((a, b) => a + b, 0) / strikeScores.length);
      arcFinishCanvasGame("time_forge", difficulty, score, 100, area,
        strikeLog.join(" · "));
    }
  };

  const strikeBtn = document.getElementById("arc-tf-strike-btn");
  if (strikeBtn) strikeBtn.onclick = doStrike;
  if (barEl) barEl.onclick = doStrike;
  praxStageOnCleanup(() => stopLoop());
  draw();
}

function renderSpellingGame(area, difficulty, roundIn) {
  const round = roundIn || praxGenerateSpellingRound(difficulty);
  const words = round.words || [];
  const timeLimit = round.time_limit_seconds || 45;
  let idx = 0;
  let correct = 0;
  let streak = 0;
  let maxStreak = 0;
  const times = [];
  praxStageSetMidRound(true);

  const showWord = () => {
    if (idx >= words.length) {
      finishSession();
      return;
    }
    const item = words[idx];
    const correctWord = item.correct || item.word || "";
    const wrongs = item.misspellings || item.options?.filter(o => o !== correctWord) || [];
    const options = praxShuffle([correctWord, ...wrongs.slice(0, 3)]);
    const started = performance.now();
    area.innerHTML = `
      <div class="prax-game-progress">Word ${idx + 1} / ${words.length}</div>
      <div class="prax-game-prompt" style="font-size:clamp(20px,3.5vw,28px);">Which spelling is correct?</div>
      <div class="prax-game-sub">Streak x<span id="spell-streak">${escapeHtml(streak)}</span></div>
      <div class="prax-game-options" id="spell-options">${options.map(o =>
        `<button type="button" class="prax-game-btn spell-opt" data-word="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</div>`;
    praxStartRoundTimer(timeLimit, () => handle(null, true));
    const handle = (chosen, timedOut) => {
      praxClearRoundTimer();
      const isCorrect = !timedOut && chosen === correctWord;
      const ms = performance.now() - started;
      times.push(ms / 1000);
      praxLogGameplay({ game: "spelling", qIdx: idx, correct: isCorrect, ms, difficulty });
      praxMarkAnswerButtons(".spell-opt", correctWord, chosen, "word");
      if (isCorrect) {
        correct += 1;
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
        praxUpdateCombo(true);
        praxScorePopup(praxDisplayPoints(1, 0.5));
      } else {
        streak = 0;
        praxUpdateCombo(false);
      }
      idx += 1;
      setTimeout(showWord, isCorrect ? 350 : 500);
    };
    area.querySelectorAll(".spell-opt").forEach(btn => {
      btn.onclick = () => handle(btn.dataset.word, false);
    });
  };

  const finishSession = async () => {
    praxClearRoundTimer();
    const avgTimeSec = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    await submitPracticeResult("spelling", difficulty, correct, words.length, { correct, streak: maxStreak },
      area, `${correct}/${words.length} correct · streak x${maxStreak}`,
      { maxCombo: PRAX_STAGE.maxCombo, avgTimeSec });
  };
  showWord();
}

function arcMatchRoundComplete(key, score, maxScore) {
  if (!ARC_MATCH_CTX) return;
  const ctx = ARC_MATCH_CTX;
  const roundData = ctx.currentRoundData || {};
  const rivalResult = arcRivalScoreForRound(key, ctx.difficulty, ctx.rival, roundData);
  ctx.rounds.push({
    key, label: praxGameLabel(key) || key.replace(/_/g, " "),
    playerScore: score, playerMax: maxScore,
    rivalScore: rivalResult.unscored ? 0 : rivalResult.score,
    rivalMax: rivalResult.unscored ? 0 : rivalResult.maxScore,
    rivalMeta: rivalResult,
  });
  if (!ARC_CANVAS_KEYS.has(key) && !arcRivalIsUnscored(key)) {
    api(`/api/practice/${key}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, max_score: maxScore, difficulty: ctx.difficulty, details: { match: true } }),
    }).catch(() => {});
  } else if (ARC_CANVAS_KEYS.has(key)) {
    arcUpdateCanvasStats(key, score, maxScore);
  }
  ctx.roundIndex += 1;
  ctx.currentRoundData = null;
  if (ctx.roundIndex >= ctx.gameKeys.length) {
    arcShowMatchPostScreen();
  } else {
    arcPlayMatchRound();
  }
}

async function arcFetchMatchRound(key, difficulty) {
  if (ARC_CANVAS_KEYS.has(key)) {
    if (key === "circuit_sprint" || key === "time_forge" || key === "memory_constellation") {
      return { difficulty, round: arcGenerateLocalRound(key, difficulty) };
    }
    return { difficulty, round: arcGenerateLocalRound(key, difficulty) };
  }
  if (key === "spelling") {
    const res = await praxResolveSpellingRound(difficulty);
    return { difficulty: res.difficulty || difficulty, round: res.round };
  }
  if (key === "hardware") {
    const res = await hwResolveHardwareRound(difficulty, hwPickMatchMode());
    return { difficulty: res.difficulty || difficulty, round: res.round };
  }
  try {
    const result = await praxFetchPracticeRound(key);
    if (result && !result.error) return result;
  } catch (_) {}
  return { difficulty, round: arcGenerateLocalRound(key, difficulty) };
}

function arcLaunchGameRenderer(key, stage, difficulty, round) {
  if (key === "memory") renderMemoryGame(stage, difficulty, round);
  else if (key === "working_memory") renderWorkingMemoryGame(stage, difficulty, round);
  else if (key === "math") renderMathGame(stage, difficulty, round);
  else if (key === "logic") renderLogicGame(stage, difficulty, round);
  else if (key === "time_estimation") renderTimeEstimationGame(stage, difficulty, round);
  else if (key === "spelling") renderSpellingGame(stage, difficulty, round);
  else if (key === "signal_storm") renderSignalStormGame(stage, difficulty, round);
  else if (key === "focus_pulse") renderFocusPulseGame(stage, difficulty, round);
  else if (key === "memory_constellation") renderMemoryConstellationGame(stage, difficulty, round);
  else if (key === "circuit_sprint") renderCircuitSprintGame(stage, difficulty, round);
  else if (key === "time_forge") renderTimeForgeGame(stage, difficulty, round);
  else if (key === "hardware") renderHardwareGame(stage, difficulty, round);
}

async function arcPlayMatchRound() {
  const ctx = ARC_MATCH_CTX;
  if (!ctx) return;
  const key = ctx.gameKeys[ctx.roundIndex];
  const gameMeta = praxGameMeta(key);
  praxOpenStage(key, ctx.difficulty);
  const stage = PRAX_STAGE.body;
  const topbar = PRAX_STAGE.overlay.querySelector(".prax-stage-title");
  if (topbar) topbar.textContent = `Match R${ctx.roundIndex + 1}/${ctx.gameKeys.length} — ${gameMeta.label}`;
  const loadAbort = { cancelled: false };
  praxShowLoadingWithCancel(stage, "Loading round...", loadAbort);
  const loadStart = performance.now();
  const fetched = await arcFetchMatchRound(key, ctx.difficulty);
  if (loadAbort.cancelled || !ARC_MATCH_CTX) return;
  ctx.currentRoundData = fetched.round;
  if (fetched.difficulty) ctx.difficulty = fetched.difficulty;
  praxShowPreGameCard(key, () => {
    if (!ARC_MATCH_CTX || loadAbort.cancelled) return;
    stage.innerHTML = arcMatchRivalBannerHtml(key);
    const mount = document.createElement("div");
    mount.id = "arc-match-game-mount";
    mount.style.width = "100%";
    stage.appendChild(mount);
    const playStart = performance.now();
    praxStageOnCleanup(() => praxTrackPlayTime(key, performance.now() - playStart));
    arcLaunchGameRenderer(key, mount, ctx.difficulty, fetched.round);
    praxTrackPlayTime(key, performance.now() - loadStart);
  });
}

async function arcShowMatchIntro() {
  const rival = arcGetRival();
  const league = arcGetLeague();
  const summary = ARC_MATCH_CTX?.summary || { points: 0 };
  const receipts = ARC_MATCH_CTX?.receipts || await (ARC_MATCH_CTX?.receiptsPromise || arcFetchReceipts());
  if (ARC_MATCH_CTX) ARC_MATCH_CTX.receipts = receipts;
  praxOpenStage("match", arcMatchDifficulty(rival));
  if (!PRAX_STAGE?.overlay || !PRAX_STAGE?.body) return;
  const introTopbar = PRAX_STAGE.overlay.querySelector(".prax-stage-topbar");
  if (introTopbar) introTopbar.style.display = "none";
  const taunt = arcPickRivalIntroLine(rival, receipts);
  const lineup = (ARC_MATCH_CTX?.gameKeys || []).map(k => {
    const m = praxGameMeta(k);
    return `<span class="arc-match-lineup-chip">${escapeHtml(m.icon)} ${escapeHtml(m.label)}</span>`;
  }).join("");
  PRAX_STAGE.body.innerHTML = `
    <div class="arc-vs-screen">
      <div class="arc-vs-card you">
        ${arcAvatarSvg(arcPlayerName())}
        <div class="arc-vs-name">${escapeHtml(arcPlayerName())}</div>
        <div class="arc-vs-epithet">Level ${escapeHtml(arcPlayerLevel(summary))}</div>
      </div>
      <div style="font-size:36px;font-weight:900;color:#fff;align-self:center;">VS</div>
      <div class="arc-vs-card rival">
        ${arcAvatarSvg(rival.name + rival.epithet)}
        <div class="arc-vs-name">${escapeHtml(rival.name)} ${escapeHtml(rival.epithet)}</div>
        <div class="arc-vs-epithet">${escapeHtml(rival.elo)} ELO</div>
        <span class="arc-vs-badge">${escapeHtml(league.label)} League</span>
      </div>
    </div>
    <p class="arc-vs-taunt">"${escapeHtml(taunt)}"</p>
    ${lineup ? `<div class="arc-match-lineup">${lineup}</div><p class="prax-supporting-text" style="font-size:12px;color:#aaa;">Three rounds — you and your rival play the same games.</p>` : ""}
    <button type="button" class="prax-game-btn primary" id="arc-match-go">Fight!</button>`;
  const matchGo = document.getElementById("arc-match-go");
  if (matchGo) matchGo.onclick = () => arcPlayMatchRound();
}

function arcShowMatchPostScreen() {
  const ctx = ARC_MATCH_CTX;
  if (!ctx) return;
  const playerTotal = ctx.rounds.reduce((s, r) => s + (r.playerMax > 0 ? r.playerScore / r.playerMax : 0), 0);
  const rivalTotal = ctx.rounds.reduce((s, r) => {
    if (r.rivalMeta?.unscored) return s;
    return s + (r.rivalMax > 0 ? r.rivalScore / r.rivalMax : 0);
  }, 0);
  const won = playerTotal >= rivalTotal;
  const trophyDelta = won ? 1 : -1;
  const trophiesBefore = arcGetTrophies();
  arcSetTrophies(Math.max(0, trophiesBefore + trophyDelta));
  const coinDelta = won ? 25 : 5;
  arcAddCoinsBonus(coinDelta);
  const roadBefore = arcGetTrophyRoadProgress();
  if (won && roadBefore < 10) {
    arcAwardTrophyRoadNode(roadBefore);
    arcSetTrophyRoadProgress(roadBefore + 1);
    praxAwardTrophyRoadXp();
  }
  const avgRatio = ctx.rounds.length
    ? ctx.rounds.reduce((s, r) => s + (r.playerMax > 0 ? r.playerScore / r.playerMax : 0), 0) / ctx.rounds.length
    : 0;
  const matchScore = Math.round(avgRatio * 100);
  praxAwardMatchXp(matchScore, 100);
  const displayXp = praxMatchXpDisplay(matchScore, 100, false);
  if (won) {
    arcRecordRivalDefeat(ctx.rival, {
      bestScore: playerTotal,
      lastTaunt: arcPickRivalPostLine(ctx.rival, ctx.receipts || []),
    });
  }
  arcAdaptRival(ctx.rival, { won, rounds: ctx.rounds });
  const rival = arcGetRival();
  const rows = ctx.rounds.map(r => {
    const rivalTxt = r.rivalMeta?.unscored
      ? "unscored"
      : `${r.rivalScore}/${r.rivalMax}`;
    return `<div class="arc-match-row">
      <span>${escapeHtml(r.label)}</span>
      <span>${escapeHtml(r.playerScore)}/${escapeHtml(r.playerMax)} vs ${escapeHtml(rivalTxt)}</span>
    </div>${arcRivalRunHtml(r.rivalMeta)}`;
  }).join("");
  const skillBars = ctx.rounds.map(r => {
    const pct = r.playerMax > 0 ? Math.round((r.playerScore / r.playerMax) * 100) : 0;
    return `<div style="margin:8px 0;font-size:14px;color:#ddd;"><span>${escapeHtml(r.label)}</span>
      <div class="arc-skill-bar"><div class="arc-skill-fill" style="width:${escapeHtml(pct)}%;"></div></div></div>`;
  }).join("");
  const postTopbar = PRAX_STAGE.overlay.querySelector(".prax-stage-topbar");
  if (postTopbar) postTopbar.style.display = "";
  const postTitle = PRAX_STAGE.overlay.querySelector(".prax-stage-title");
  if (postTitle) postTitle.textContent = "Match result";
  PRAX_STAGE.body.innerHTML = `
    <div class="arc-reward-beat" id="arc-reward-beat">
      <div class="arc-reward-coins">+<span id="arc-reward-coins-num">0</span> coins</div>
      ${displayXp > 0 ? `<div class="arc-reward-xp">+<span id="arc-reward-xp-num">0</span> XP</div>` : ""}
      ${won && roadBefore < 10 ? arcRewardRoadSnippet(roadBefore) : ""}
      <div class="arc-reward-rival" id="arc-reward-rival"></div>
    </div>
    <div class="arc-result-stats" id="arc-result-stats">
      <div class="arc-post-banner ${won ? "win" : "lose"}">${won ? "VICTORY" : "DEFEAT"}</div>
      <div style="font-size:16px;color:#ddd;">${escapeHtml(playerTotal.toFixed(2))} vs ${escapeHtml(rivalTotal.toFixed(2))} (normalized)</div>
      <div class="arc-match-scoreboard">${rows}</div>
      <div style="margin:12px 0;font-size:14px;color:#ddd;">
        Trophies: ${trophyDelta > 0 ? "+" : ""}${escapeHtml(trophyDelta)} (${escapeHtml(trophiesBefore)} → ${escapeHtml(arcGetTrophies())})
        · Coins: +${escapeHtml(coinDelta)}
      </div>
      ${skillBars}
      ${rival.adaptation_note ? `<p class="arc-skill-sentence">${escapeHtml(rival.adaptation_note)}</p>` : ""}
      <div class="prax-result-actions" style="margin-top:20px;">
        <button class="primary prax-game-btn" id="arc-play-again">PLAY AGAIN</button>
        <button class="secondary prax-game-btn" id="arc-training-lab">Training Lab</button>
      </div>
      <div class="prax-supporting-text" style="margin-top:10px;font-size:12px;color:#ccc;">Space / Enter — play again</div>
    </div>`;
  arcPlayRewardBeat({
    coins: coinDelta,
    displayXp,
    roadNodeIdx: won && roadBefore < 10 ? roadBefore : null,
    contextKey: won ? "match_win" : "match_loss",
    rivalLine: arcPickRivalPostLine(rival, ctx.receipts || []),
  });
  const replay = () => { ARC_MATCH_CTX = null; arcStartMatch(ctx.summary); };
  const playAgainBtn = document.getElementById("arc-play-again");
  const trainingLabBtn = document.getElementById("arc-training-lab");
  if (playAgainBtn) playAgainBtn.onclick = replay;
  if (trainingLabBtn) trainingLabBtn.onclick = () => {
    ARC_MATCH_CTX = null;
    praxCloseStage();
    ARC_TRAINING_LAB_OPEN = true;
    render();
  };
  const keyHandler = (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); document.removeEventListener("keydown", keyHandler); replay(); }
  };
  document.addEventListener("keydown", keyHandler);
  praxStageOnCleanup(() => document.removeEventListener("keydown", keyHandler));
  ARC_MATCH_CTX = null;
  praxStageSetMidRound(false);
}

async function arcStartMatch(summary) {
  const rival = arcGetRival();
  const difficulty = arcMatchDifficulty(rival);
  const gameKeys = arcPickMatchGames();
  const receiptsPromise = arcFetchReceipts();
  ARC_MATCH_CTX = {
    summary, rival, difficulty, gameKeys,
    roundIndex: 0, rounds: [], receiptsPromise, currentRoundData: null,
  };
  await arcShowMatchIntro();
}

function arcPlayButtonPress(summary) {
  const btn = document.getElementById("arc-play-btn");
  if (!btn) return;
  btn.classList.add("arc-pressed");
  if (!PRAX_REDUCE_MOTION) btn.classList.add("arc-click-flash");
  const snap = document.createElement("div");
  snap.className = "arc-play-snap";
  document.body.appendChild(snap);
  if (!PRAX_REDUCE_MOTION) {
    requestAnimationFrame(() => snap.classList.add("on"));
    setTimeout(() => {
      snap.remove();
      btn.classList.remove("arc-pressed", "arc-click-flash");
      arcStartMatch(summary).catch(() => {});
    }, 90);
  } else {
    snap.remove();
    btn.classList.remove("arc-pressed", "arc-click-flash");
    arcStartMatch(summary).catch(() => {});
  }
}

async function renderPractice() {
  praxEnsureStyles();
  if (praxGameFeaturesHidden()) {
    const area = document.getElementById("practice-play-area") || document.getElementById("practice");
    if (area) area.innerHTML = `<p class="prax-supporting-text">Arcade is paused while game features are hidden.</p>`;
    return;
  }
  arcGetRival();
  const [games, summary] = await Promise.all([api("/api/practice/games"), api("/api/practice/summary")]);
  PRACTICE_GAMES = games;
  const coinsInfo = await arcResolveCoinsDisplay(summary);
  const league = arcGetLeague();
  const dailyKey = praxDailyGameKey(PRACTICE_GAMES);
  const dailyGame = PRACTICE_GAMES.find(g => g.key === dailyKey) || null;
  const labGames = [...PRACTICE_GAMES, ...arcCanvasGameMeta()];
  if (!labGames.some(g => g.key === "spelling")) {
    const sp = PRAX_LOCAL_GAME_CATALOG.spelling;
    labGames.push({
      key: "spelling", label: "Spelling challenge", category: "Cognitive drills", mode: "local",
      icon: sp.icon, desc: sp.desc, difficulty: 3, attempts: 0, best_ratio: null,
    });
  }
  if (!labGames.some(g => g.key === "hardware")) {
    const hw = PRAX_LOCAL_GAME_CATALOG.hardware;
    labGames.push({
      key: "hardware", label: "Hardware track", category: "Technical & creative", mode: "local",
      icon: hw.icon, desc: hw.desc, objective: hw.objective, difficulty: 3, attempts: 0, best_ratio: null,
    });
  }
  const byCategory = {};
  labGames.forEach(g => { (byCategory[g.category] = byCategory[g.category] || []).push(g); });
  const sections = Object.entries(byCategory).map(([cat, catGames]) => `
    <div class="prax-section-title">${escapeHtml(cat)}</div>
    <div class="prax-grid">
      ${catGames.map(g => praxTileHtml(g, g.key === dailyKey)).join("")}
    </div>`).join("");
  return `
    ${renderPlayWorkspaceStrip({ streak: summary.streak || 0, trophies: arcGetTrophies() })}
    <div class="arc-hub league-${escapeHtml(league.id)}">
    <p class="page-title">Practice Arcade</p>
    <p class="page-subtitle">One match. Three rounds. Climb the trophy road.</p>
    ${praxQuestsRowHtml(dailyGame)}
    ${praxHeroHtml(summary, coinsInfo.display)}
    ${arcHubMetaHtml(league)}
    ${arcRivalCardHtml()}
    ${rwdPlayBlockHtml(summary)}
    ${arcTrophyRoadHtml()}
    <div class="arc-lab-toggle">
      <button type="button" id="arc-lab-toggle" class="${ARC_TRAINING_LAB_OPEN ? "on" : ""}">Training Lab ${ARC_TRAINING_LAB_OPEN ? "&#9650;" : "&#9660;"}</button>
    </div>
    <div class="arc-lab-panel${ARC_TRAINING_LAB_OPEN ? " open" : ""}" id="arc-lab-panel">
      ${arcRosterPanelHtml()}
      ${rwdRewardsPanelHtml(summary)}
      ${sections}
    </div>
    <div id="practice-play-area"></div>
    </div>`;
}

function wirePractice() {
  const dcheck = document.getElementById("prax-daily-check-start");
  if (dcheck) dcheck.onclick = () => praxRunDailyCheck();
  const playBtn = document.getElementById("arc-play-btn");
  if (playBtn) {
    playBtn.onclick = () => {
      api("/api/practice/summary").then(s => arcPlayButtonPress(s)).catch(() => arcPlayButtonPress({ points: 0 }));
    };
  }
  const labToggle = document.getElementById("arc-lab-toggle");
  if (labToggle) {
    labToggle.onclick = () => {
      ARC_TRAINING_LAB_OPEN = !ARC_TRAINING_LAB_OPEN;
      const panel = document.getElementById("arc-lab-panel");
      if (panel) panel.classList.toggle("open", ARC_TRAINING_LAB_OPEN);
      labToggle.classList.toggle("on", ARC_TRAINING_LAB_OPEN);
      labToggle.innerHTML = `Training Lab ${ARC_TRAINING_LAB_OPEN ? "&#9650;" : "&#9660;"}`;
    };
  }
  const road = document.getElementById("arc-trophy-road");
  if (road) {
    const current = road.querySelector(".arc-road-node.current");
    if (current) current.scrollIntoView({ inline: "center", block: "nearest", behavior: PRAX_REDUCE_MOTION ? "auto" : "smooth" });
  }
  const rwdRoad = document.getElementById("rwd-trophy-road") || document.getElementById("rwd-hub-road");
  if (rwdRoad) {
    const rwdCurrent = rwdRoad.querySelector(".rwd-road-node.current");
    if (rwdCurrent) rwdCurrent.scrollIntoView({ inline: "center", block: "nearest", behavior: PRAX_REDUCE_MOTION ? "auto" : "smooth" });
  }
  const rwdStrip = document.getElementById("rwd-strip-toggle");
  if (rwdStrip) {
    const toggleRwd = () => {
      RWD_PANEL_EXPANDED = !RWD_PANEL_EXPANDED;
      const panel = document.getElementById("rwd-panel");
      if (panel) panel.classList.toggle("expanded", RWD_PANEL_EXPANDED);
      rwdStrip.setAttribute("aria-expanded", RWD_PANEL_EXPANDED ? "true" : "false");
    };
    rwdStrip.onclick = (e) => { e.stopPropagation(); toggleRwd(); };
    rwdStrip.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRwd(); } };
  }
  document.querySelectorAll(".prax-tile-info").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const tile = btn.closest(".prax-tile");
      if (tile) tile.classList.toggle("prax-tile-info-open");
    };
  });
  api("/api/practice/summary").then(s => rwdCheckNewUnlocks(s.points || 0)).catch(() => {});
  document.querySelectorAll(".rwd-activate").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.rwdId;
      const type = btn.dataset.rwdType;
      const tier = RWD_TIERS.find(t => t.id === id);
      if (type === "theme") {
        if (typeof stylePaintSetLayer === "function") {
          rwdShowTargetChooser(tier, btn, (target) => {
            rwdApplyTheme(id, target);
            rwdFlashApplied(btn, `${tier.label} painted onto ${SP_TARGET_LABELS[target] || target}`);
            rwdRefreshActiveCards();
          });
        } else {
          rwdApplyTheme(id);
          if (localStorage.getItem("activeWallpaper") === "midnight") rwdApplyMidnight(true);
          rwdFlashApplied(btn, rwdApplyToastFor(tier));
          rwdRefreshActiveCards();
        }
      } else if (type === "wallpaper") {
        if (typeof stylePaintSetLayer === "function") {
          const existingTargets = rwdGetActivePaintTargets("midnight");
          if (existingTargets.length > 0) {
            rwdApplyMidnight(false);
            rwdFlashApplied(btn, rwdApplyToastFor(tier, { wallpaperOn: false }));
            rwdRefreshActiveCards();
          } else {
            rwdShowTargetChooser(tier, btn, (target) => {
              rwdApplyMidnight(true, target);
              rwdFlashApplied(btn, `${tier.label} painted onto ${SP_TARGET_LABELS[target] || target}`);
              rwdRefreshActiveCards();
            });
          }
        } else {
          const on = localStorage.getItem("activeWallpaper") !== "midnight";
          rwdApplyMidnight(on);
          rwdFlashApplied(btn, rwdApplyToastFor(tier, { wallpaperOn: on }));
          rwdRefreshActiveCards();
        }
      } else if (type === "perk") {
        if (id === "confetti") praxCelebrate({ particleCount: 36, duration: 1000 });
        rwdFlashApplied(btn, rwdApplyToastFor(tier));
      }
    };
  });
  document.querySelectorAll(".practice-play").forEach(btn => {
    btn.onclick = () => {
      const tile = btn.closest(".prax-tile");
      if (!tile) {
        startPracticeGame(btn.dataset.key);
        return;
      }
      document.querySelectorAll(".prax-tile.prax-options-open").forEach(other => {
        if (other !== tile) other.classList.remove("prax-options-open");
      });
      tile.classList.toggle("prax-options-open");
      tile.querySelector("[data-launch-difficulty]")?.focus();
    };
  });
  document.querySelectorAll("[data-launch-difficulty]").forEach(input => {
    input.oninput = () => {
      const output = input.closest(".prax-launch-options")?.querySelector(".prax-launch-diff-value");
      if (output) output.textContent = input.value;
    };
  });
  document.querySelectorAll("[data-launch-key]").forEach(btn => {
    btn.onclick = () => {
      const options = btn.closest(".prax-launch-options");
      startPracticeGame(btn.dataset.launchKey, {
        difficulty: Number(options?.querySelector("[data-launch-difficulty]")?.value) || 1,
        timer: options?.querySelector("[data-launch-timer]")?.checked !== false,
        manual: true,
      });
    };
  });
  document.querySelectorAll(".practice-history").forEach(btn => {
    btn.onclick = () => showPracticeHistory(btn.dataset.key);
  });
  document.querySelectorAll(".ait-reviews-btn").forEach(btn => {
    btn.onclick = () => aitOpenReviewsArchive();
  });
  arcWireRivalMicroActing();
  const rosterEntries = Object.values(arcGetRivalRoster()).sort((a, b) => (b.lastDefeatedAt || 0) - (a.lastDefeatedAt || 0));
  document.querySelectorAll(".arc-roster-rematch").forEach(btn => {
    const idx = parseInt(btn.dataset.rosterIdx || "", 10);
    const entry = rosterEntries[idx];
    if (entry) btn.onclick = () => arcStartRematch(entry);
  });
}

// --- AI Trainer (neural_net_fix): model picker, deepen reviews, archive -----------------------------

const AIT_FALLBACK_MODELS = [
  { key: "perceptron", name: "Perceptron", desc: "Single-layer linear classifier", difficulty: 1, attempts: 0, avg_score: null, probability: 0.04 },
  { key: "mlp", name: "MLP", desc: "Multi-layer feedforward network", difficulty: 2, attempts: 0, avg_score: null, probability: 0.06 },
  { key: "cnn", name: "CNN", desc: "Convolutional spatial features", difficulty: 3, attempts: 0, avg_score: null, probability: 0.08 },
  { key: "resnet", name: "ResNet", desc: "Skip connections for depth", difficulty: 5, attempts: 0, avg_score: null, probability: 0.09 },
  { key: "vae", name: "VAE", desc: "Latent generative modeling", difficulty: 4, attempts: 0, avg_score: null, probability: 0.06 },
  { key: "gan", name: "GAN", desc: "Adversarial image synthesis", difficulty: 6, attempts: 0, avg_score: null, probability: 0.07 },
  { key: "rnn", name: "RNN", desc: "Recurrent sequence modeling", difficulty: 4, attempts: 0, avg_score: null, probability: 0.07 },
  { key: "lstm", name: "LSTM", desc: "Long-range memory gates", difficulty: 5, attempts: 0, avg_score: null, probability: 0.08 },
  { key: "gru", name: "GRU", desc: "Gated recurrent units", difficulty: 5, attempts: 0, avg_score: null, probability: 0.06 },
  { key: "transformer", name: "Transformer", desc: "Self-attention sequence model", difficulty: 6, attempts: 0, avg_score: null, probability: 0.12 },
  { key: "bert", name: "BERT", desc: "Bidirectional pre-trained encoder", difficulty: 7, attempts: 0, avg_score: null, probability: 0.10 },
  { key: "gpt", name: "GPT", desc: "Autoregressive language model", difficulty: 7, attempts: 0, avg_score: null, probability: 0.11 },
  { key: "diffusion", name: "Diffusion", desc: "Iterative denoising generation", difficulty: 8, attempts: 0, avg_score: null, probability: 0.09 },
  { key: "moe", name: "MoE", desc: "Mixture-of-experts routing", difficulty: 8, attempts: 0, avg_score: null, probability: 0.07 },
];

async function aitFetchModels() {
  try {
    const data = await api("/api/practice/ai-models");
    if (Array.isArray(data) && data.length) return data;
  } catch (_) {}
  return AIT_FALLBACK_MODELS.slice();
}

function aitChosenByLabel(chosenBy) {
  if (chosenBy === "requested") return "you chose";
  if (chosenBy === "softmax") return "picked by softmax";
  return chosenBy ? String(chosenBy) : "assigned";
}

function aitModelHeaderText(round) {
  const name = (round && (round.model_name || round.model_key)) || "Model";
  const by = aitChosenByLabel(round && round.chosen_by);
  return `${name} — ${by}`;
}

function aitSetStageHeader(round) {
  if (!PRAX_STAGE) return;
  const titleEl = PRAX_STAGE.overlay.querySelector(".prax-stage-title");
  if (titleEl) titleEl.textContent = aitModelHeaderText(round);
}

function aitModelBadgeHtml(round) {
  if (!round || (!round.model_name && !round.model_key)) return "";
  return `<span class="ait-model-badge">${escapeHtml(round.model_name || round.model_key)} — ${escapeHtml(aitChosenByLabel(round.chosen_by))}</span>`;
}

function aitConceptsHtml(concepts) {
  const list = Array.isArray(concepts) ? concepts : [];
  if (!list.length) return "";
  return `<div class="ait-concepts">${list.map(c =>
    `<span class="ait-concept-chip">${escapeHtml(c)}</span>`).join("")}</div>`;
}

function aitProbBarHtml(probability) {
  const pct = Math.max(0, Math.min(100, Math.round((probability || 0) * 100)));
  return `<div class="ait-prob-bar" title="${escapeHtml(pct)}% pick weight"><div class="ait-prob-fill" style="width:${escapeHtml(pct)}%;"></div></div>`;
}

function aitModelChipHtml(m) {
  const level = Math.max(0, Math.min(10, m.difficulty || 0));
  const attempts = m.attempts || 0;
  return `<button type="button" class="ait-model-chip" data-model-key="${escapeHtml(m.key)}">
    <div class="ait-model-name">${escapeHtml(m.name || m.key)}</div>
    <div class="ait-model-desc">${escapeHtml(m.desc || "")}</div>
    <div class="ait-model-meta">
      <span>Lv ${escapeHtml(level)}/10</span>
      <span>${escapeHtml(attempts)} attempt${attempts === 1 ? "" : "s"}</span>
    </div>
    ${aitProbBarHtml(m.probability)}
  </button>`;
}

function aitRenderModelPicker(area, models, difficulty) {
  praxStageSetMidRound(false);
  area.innerHTML = `
    <div class="ait-picker">
      <div class="ait-picker-top">
        <div class="ait-picker-title">Choose a model</div>
        <button type="button" class="secondary prax-game-btn ait-reviews-btn" id="ait-picker-reviews">&#128218; Reviews</button>
      </div>
      <button type="button" class="ait-random-card" id="ait-random-pick">
        <div class="ait-random-title">RANDOM (weighted)</div>
        <p class="ait-random-desc">picks via softmax over priors + your weak spots — mainstream models more likely, weaknesses boosted</p>
      </button>
      <div class="ait-model-grid">
        ${models.map(aitModelChipHtml).join("")}
      </div>
      <button type="button" class="secondary prax-game-btn" id="ait-picker-back" style="margin-top:16px;">Back to arcade</button>
    </div>`;
  document.getElementById("ait-picker-reviews").onclick = () => aitOpenReviewsArchive();
  document.getElementById("ait-picker-back").onclick = () => { praxCloseStage(); render(); };
  document.getElementById("ait-random-pick").onclick = () => aitBeginRound(null);
  area.querySelectorAll(".ait-model-chip").forEach(chip => {
    chip.onclick = () => aitBeginRound(chip.dataset.modelKey);
  });
}

async function aitLaunchModelPicker(key, launchOptions) {
  praxEnsureStyles();
  PRACTICE_CURRENT_KEY = key;
  const area = document.getElementById("practice-play-area");
  const game = PRACTICE_GAMES.find(g => g.key === key);
  const difficulty = Math.max(1, Math.min(10, Number(launchOptions?.difficulty) || (game && game.difficulty) || 1));
  area.innerHTML = praxWrapRound(`<span class="spinner"></span> Loading models...`);
  area.scrollIntoView({ behavior: "smooth", block: "start" });
  praxOpenStage(key, difficulty);
  const stage = PRAX_STAGE.body;
  stage.innerHTML = `<span class="spinner"></span> Loading models...`;
  const models = await aitFetchModels();
  aitRenderModelPicker(stage, models, difficulty);
}

async function aitBeginRound(modelKey) {
  if (!PRAX_STAGE) return;
  const stage = PRAX_STAGE.body;
  const key = AIT_GAME_KEY;
  stage.innerHTML = `<span class="spinner"></span> Generating a fresh challenge...`;
  const body = modelKey ? { model_key: modelKey } : {};
  if (PRAX_LAUNCH_OPTIONS?.manual) body.difficulty_override = PRAX_STAGE.difficulty;
  let result;
  try {
    result = await api(`/api/practice/${key}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    stage.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">Could not start round. Try again.</span>`;
    return;
  }
  if (result.error) {
    stage.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">${escapeHtml(result.error)}</span>`;
    return;
  }
  const { difficulty, round } = result;
  if (PRAX_STAGE) PRAX_STAGE.difficulty = difficulty;
  aitSetStageHeader(round);
  aitRenderNeuralNetFixRound(stage, key, difficulty, round);
}

function aitRenderNeuralNetFixRound(area, key, difficulty, round) {
  praxStageSetMidRound(true);
  area.innerHTML = `
    <div class="ait-round-header">${aitModelBadgeHtml(round)}</div>
    ${aitConceptsHtml(round.concepts)}
    <div class="prax-game-prompt">${escapeHtml(praxGameLabel(key))}</div>
    <div class="prax-game-sub" style="white-space:pre-wrap; text-align:left; max-width:560px; margin:0 auto 16px;">${escapeHtml(round.challenge || "")}</div>
    <textarea id="ai-game-answer" placeholder="Your answer..." style="width:min(560px,90vw); min-height:140px; font-size:16px; padding:12px; border-radius:12px; border:2px solid var(--gridline); background:var(--surface,var(--card));"></textarea>
    <button type="button" class="prax-game-btn primary" id="ai-game-submit" style="margin-top:14px;">Submit for grading</button>`;
  document.getElementById("ai-game-submit").onclick = async () => {
    const answer = document.getElementById("ai-game-answer").value.trim();
    if (!answer) return;
    const btn = document.getElementById("ai-game-submit");
    btn.innerHTML = '<span class="spinner"></span> Grading...'; btn.disabled = true;
    praxClearRoundTimer();
    const gradeBody = {
      answer, challenge: round.challenge, reference: round.reference, difficulty,
      model_key: round.model_key,
    };
    const result = await api(`/api/practice/${key}/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gradeBody),
    });
    if (result.error) { window.alert(result.error); btn.textContent = "Submit for grading"; btn.disabled = false; return; }
    aitRenderNeuralNetResult(area, {
      key, score: result.score, maxScore: result.max_score,
      difficulty, feedback: result.feedback, newDifficulty: result.new_difficulty,
      reviewId: result.review_id, round,
    });
  };
}

function aitRenderNeuralNetResult(area, opts) {
  const { key, score, maxScore, difficulty, feedback, newDifficulty, reviewId, round } = opts;
  const ratio = maxScore > 0 ? score / maxScore : 0;
  const medal = praxMedalFromScore(score, maxScore);
  const baseCoins = praxPointsEarned(score, maxScore, difficulty);
  const isDaily = praxIsDaily(key);
  const displayCoins = isDaily ? baseCoins * 2 : baseCoins;
  praxAwardMatchXp(score, maxScore);
  const displayXp = praxMatchXpDisplay(score, maxScore, isDaily);
  const pct = maxScore > 0 ? Math.round(ratio * 100) : 0;
  const maxCombo = (PRAX_STAGE && PRAX_STAGE.maxCombo) || 0;
  const celebrate = ratio >= 0.8;

  const renderInto = (container) => {
    container.innerHTML = `
      <div class="prax-result-stage">
        <div class="prax-supporting-text" style="letter-spacing:0.12em;text-transform:uppercase;font-weight:700;">Round complete</div>
        ${round ? `<div class="ait-round-header" style="margin-top:8px;">${aitModelBadgeHtml(round)}</div>` : ""}
        <div class="prax-result-ring-wrap">
          <svg class="prax-result-ring" width="140" height="140" viewBox="0 0 100 100">
            <circle class="prax-result-ring-bg" cx="50" cy="50" r="45"></circle>
            <circle class="prax-result-ring-fg" cx="50" cy="50" r="45"
              style="stroke-dashoffset:${283 - (283 * pct / 100)};"></circle>
          </svg>
          <div class="prax-result-ring-pct" id="prax-result-pct">0%</div>
        </div>
        <div class="prax-result-score"><span id="prax-result-score-num">0</span><span style="font-size:0.45em;color:var(--ink-muted);">/${escapeHtml(maxScore)}</span></div>
        <div class="prax-result-medal">${medal.emoji || "&#127922;"}</div>
        <div class="prax-supporting-text">${escapeHtml(medal.label)}${medal.tier !== "none" ? " medal" : ""}</div>
        <div class="prax-result-stat-row">
          <div class="prax-result-stat"><label>Combo max</label><span>x${escapeHtml(maxCombo || 1)}</span></div>
        </div>
        <div class="prax-result-coins">+<span id="prax-result-coins-num">0</span> coins${isDaily ? ' <span class="pill" style="font-size:11px;border-color:#fbbf24;color:#fbbf24;">2&times; daily</span>' : ""}</div>
        ${praxResultXpLineHtml(displayXp, isDaily)}
        ${feedback ? `<div style="margin-top:10px;white-space:pre-wrap;text-align:left;max-width:520px;margin:0 auto;">${escapeHtml(feedback)}</div>` : ""}
        ${newDifficulty != null ? `<div class="prax-supporting-text" style="margin-top:6px;">Next difficulty: ${escapeHtml(newDifficulty)}/10</div>` : ""}
        ${praxFlopPanelHtml(opts)}
        ${reviewId ? `<button type="button" class="ait-deepen-btn" id="ait-deepen-btn">Browse the correction &rarr;</button>` : ""}
        <div class="prax-supporting-text" style="margin-top:10px;font-size:12px;">Space / Enter — play again</div>
        <div class="prax-result-actions">
          <button class="primary prax-game-btn" id="prax-play-again">Play again</button>
          <button class="secondary prax-game-btn" id="prax-back-arcade">Back to arcade</button>
        </div>
      </div>`;
    const pctEl = document.getElementById("prax-result-pct");
    const scoreEl = document.getElementById("prax-result-score-num");
    const coinsEl = document.getElementById("prax-result-coins-num");
    if (pctEl) praxAnimateCount(pctEl, pct, 900);
    if (scoreEl) praxAnimateCount(scoreEl, score, 900);
    if (coinsEl) praxAnimateCount(coinsEl, displayCoins, 1100);
    praxNotifyCoinAward(displayCoins);
    const xpNum = document.getElementById("prax-result-xp-num");
    if (xpNum) praxAnimateCount(xpNum, displayXp, 1100);
    if (celebrate) praxCoinRain(Math.min(24, Math.round(displayCoins / 2)));
    const playAgain = document.getElementById("prax-play-again");
    const backArcade = document.getElementById("prax-back-arcade");
    if (playAgain) playAgain.onclick = () => startPracticeGame(key);
    if (backArcade) backArcade.onclick = () => { praxCloseStage(); render(); };
    praxWireFlopAgent(container, opts);
    const deepenBtn = document.getElementById("ait-deepen-btn");
    if (deepenBtn && reviewId) {
      deepenBtn.onclick = () => aitLoadDeepReview(area, reviewId);
    }
    praxBindResultKeys(key);
    praxStageSetMidRound(false);
  };

  if (PRAX_STAGE) {
    praxClearRoundTimer();
    renderInto(PRAX_STAGE.body);
  } else {
    area.innerHTML = praxWrapRound(`<div class="prax-result">${""}</div>`);
    renderInto(area.querySelector(".prax-result") || area);
  }
}

function aitMissedCardsHtml(missed) {
  const list = Array.isArray(missed) ? missed : [];
  if (!list.length) return `<p class="ait-review-body prax-supporting-text">Nothing major missed.</p>`;
  return list.map((item, i) => {
    const concept = (item && item.concept) || `Concept ${i + 1}`;
    const why = (item && item.why_it_matters) || "";
    const thinking = (item && item.correct_thinking) || "";
    return `<div class="ait-missed-card" data-idx="${escapeHtml(i)}">
      <button type="button" class="ait-missed-toggle" aria-expanded="false">
        <span>${escapeHtml(concept)}</span><span aria-hidden="true">+</span>
      </button>
      <div class="ait-missed-body">
        ${why ? `<div class="ait-missed-label">Why it matters</div><div>${escapeHtml(why)}</div>` : ""}
        ${thinking ? `<div class="ait-missed-label">Correct thinking</div><div>${escapeHtml(thinking)}</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

function aitRenderDeepReviewContent(deep, reviewId) {
  const savedNote = reviewId
    ? `<div class="ait-review-note">Review saved to your archive.</div>`
    : "";
  return `
    ${savedNote}
    <div class="ait-review">
      <section class="ait-review-section">
        <div class="ait-review-h">Summary</div>
        <div class="ait-review-body">${escapeHtml(deep.summary || "")}</div>
      </section>
      <section class="ait-review-section">
        <div class="ait-review-h">What you got</div>
        <div class="ait-review-body">${escapeHtml(deep.what_you_got || "")}</div>
      </section>
      <section class="ait-review-section">
        <div class="ait-review-h">What you missed</div>
        ${aitMissedCardsHtml(deep.what_you_missed)}
      </section>
      <section class="ait-review-section">
        <div class="ait-review-h">Ideal answer</div>
        <div class="ait-review-body">${escapeHtml(deep.ideal_answer || "")}</div>
      </section>
      <section class="ait-review-section">
        <div class="ait-review-h">Next time</div>
        <div class="ait-review-body">${escapeHtml(deep.next_time || "")}</div>
      </section>
    </div>
    <div class="prax-result-actions" style="margin-top:18px;">
      <button type="button" class="secondary prax-game-btn" id="ait-review-back">Back</button>
    </div>`;
}

function aitWireMissedToggles(root) {
  root.querySelectorAll(".ait-missed-toggle").forEach(btn => {
    btn.onclick = () => {
      const card = btn.closest(".ait-missed-card");
      if (!card) return;
      const open = card.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      const icon = btn.querySelector("[aria-hidden]");
      if (icon) icon.textContent = open ? "−" : "+";
    };
  });
}

async function aitLoadDeepReview(area, reviewId) {
  area.innerHTML = `<span class="spinner"></span> Deepening your review...`;
  let deep;
  try {
    deep = await api(`/api/practice/reviews/${reviewId}/deepen`, { method: "POST" });
  } catch (_) {
    area.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">Could not load correction. Try again later.</span>`;
    return;
  }
  if (deep && deep.error) {
    area.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">${escapeHtml(deep.error)}</span>`;
    return;
  }
  area.innerHTML = aitRenderDeepReviewContent(deep, reviewId);
  aitWireMissedToggles(area);
  const back = document.getElementById("ait-review-back");
  if (back) back.onclick = () => startPracticeGame(AIT_GAME_KEY);
}

function aitFormatReviewDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return String(iso);
  }
}

function aitArchiveItemHtml(r) {
  const score = r.score != null ? r.score : "—";
  const max = r.max_score != null ? r.max_score : "—";
  const preview = r.feedback || r.feedback_preview || r.summary || "";
  const model = r.model_name || r.model_key || "Model";
  return `<button type="button" class="ait-archive-item" data-review-id="${escapeHtml(r.id)}">
    <div class="ait-archive-head">
      <span class="ait-model-badge">${escapeHtml(model)}</span>
      <span class="ait-archive-score">${escapeHtml(score)}/${escapeHtml(max)}</span>
    </div>
    <div class="ait-archive-date">${escapeHtml(aitFormatReviewDate(r.created_at))}</div>
    <div class="ait-archive-preview">${escapeHtml(preview)}</div>
  </button>`;
}

async function aitOpenReviewsArchive() {
  praxEnsureStyles();
  const game = PRACTICE_GAMES.find(g => g.key === AIT_GAME_KEY);
  const difficulty = (game && game.difficulty) || 1;
  if (!PRAX_STAGE) {
    praxOpenStage(AIT_GAME_KEY, difficulty);
  }
  const stage = PRAX_STAGE.body;
  stage.innerHTML = `<span class="spinner"></span> Loading reviews...`;
  praxStageSetMidRound(false);
  let reviews = [];
  try {
    const data = await api(`/api/practice/reviews?game_key=${AIT_GAME_KEY}&limit=30`);
    reviews = Array.isArray(data) ? data : (data && data.reviews) || [];
  } catch (_) {
    reviews = [];
  }
  stage.innerHTML = `
    <div class="ait-archive-list">
      <div class="ait-picker-top">
        <div class="ait-picker-title">&#128218; Reviews</div>
      </div>
      <p class="ait-random-desc" style="margin:0 0 14px;">Your browsable mistake library — tap a review to revisit the correction.</p>
      <div class="ait-archive-actions">
        <button type="button" class="secondary prax-game-btn" id="ait-archive-play">Train again</button>
        <button type="button" class="secondary prax-game-btn" id="ait-archive-close">Back to arcade</button>
      </div>
      ${reviews.length
        ? reviews.map(aitArchiveItemHtml).join("")
        : '<p class="prax-supporting-text">No saved reviews yet — complete a round and browse the correction.</p>'}
    </div>`;
  document.getElementById("ait-archive-play").onclick = () => aitLaunchModelPicker(AIT_GAME_KEY);
  document.getElementById("ait-archive-close").onclick = () => { praxCloseStage(); render(); };
  stage.querySelectorAll(".ait-archive-item").forEach(item => {
    item.onclick = () => aitOpenReviewDetail(item.dataset.reviewId);
  });
}

async function aitOpenReviewDetail(reviewId) {
  if (!PRAX_STAGE || !reviewId) return;
  const stage = PRAX_STAGE.body;
  stage.innerHTML = `<span class="spinner"></span> Loading review...`;
  let detail;
  try {
    detail = await api(`/api/practice/reviews/${reviewId}`);
  } catch (_) {
    stage.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">Could not load review.</span>`;
    return;
  }
  if (detail && detail.error) {
    stage.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">${escapeHtml(detail.error)}</span>`;
    return;
  }
  const hasDeep = detail.summary || detail.what_you_got || detail.ideal_answer;
  if (hasDeep) {
    stage.innerHTML = `
      <div class="ait-archive-actions">
        <button type="button" class="secondary prax-game-btn" id="ait-detail-back">&#8592; Archive</button>
      </div>
      ${aitRenderDeepReviewContent(detail, reviewId)}`;
    aitWireMissedToggles(stage);
    document.getElementById("ait-detail-back").onclick = () => aitOpenReviewsArchive();
    const back = document.getElementById("ait-review-back");
    if (back) back.onclick = () => aitOpenReviewsArchive();
    return;
  }
  const score = detail.score != null ? detail.score : "—";
  const max = detail.max_score != null ? detail.max_score : "—";
  const feedback = detail.feedback || "";
  stage.innerHTML = `
    <div class="ait-archive-list">
      <div class="ait-archive-actions">
        <button type="button" class="secondary prax-game-btn" id="ait-detail-back">&#8592; Archive</button>
      </div>
      <div class="ait-round-header">
        <span class="ait-model-badge">${escapeHtml(detail.model_name || detail.model_key || "Model")}</span>
        <span class="ait-archive-score">${escapeHtml(score)}/${escapeHtml(max)}</span>
      </div>
      <div class="ait-archive-date">${escapeHtml(aitFormatReviewDate(detail.created_at))}</div>
      ${feedback ? `<div class="ait-review-body" style="margin:14px 0;">${escapeHtml(feedback)}</div>` : ""}
      <button type="button" class="ait-deepen-btn" id="ait-detail-deepen">Browse the correction &rarr;</button>
    </div>`;
  document.getElementById("ait-detail-back").onclick = () => aitOpenReviewsArchive();
  document.getElementById("ait-detail-deepen").onclick = () => aitLoadDeepReview(stage, reviewId);
}

async function showPracticeHistory(key) {
  praxEnsureStyles();
  const area = document.getElementById("practice-play-area");
  const game = PRACTICE_GAMES.find(g => g.key === key);
  area.innerHTML = praxWrapRound(`<span class="spinner"></span> Loading recent rounds...`);
  area.scrollIntoView({ behavior: "smooth", block: "start" });
  const rows = await api(`/api/practice/${key}/history`);
  area.innerHTML = praxWrapRound(`
    <strong>${escapeHtml(game ? game.label : key)} — recent rounds</strong>
    <div style="margin-top:8px;">
      ${rows.length ? rows.slice(0, 12).map(r => `<div style="display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--gridline);">
        <span>${escapeHtml(new Date(r.created_at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }))}</span>
        <span class="pill">${escapeHtml(r.score)}/${escapeHtml(r.max_score)}</span>
        <span class="prax-supporting-text">diff ${escapeHtml(r.difficulty)}</span>
      </div>`).join("") : '<p class="prax-supporting-text">No rounds yet — hit Play and claim your first medal!</p>'}
    </div>
    <button class="secondary" id="prax-history-back" style="margin-top:10px;">Back to arcade</button>`);
  document.getElementById("prax-history-back").onclick = () => { area.innerHTML = ""; area.scrollIntoView({ behavior: "smooth", block: "start" }); };
}

async function startPracticeGame(key, launchOptions) {
  if (praxGameFeaturesHidden()) return;
  praxEnsureStyles();
  PRACTICE_CURRENT_KEY = key;
  PRAX_LAUNCH_OPTIONS = launchOptions || null;
  window.WaypointHabits?.observe("practice", key);
  if (praxIsDaily(key)) {
    const waypointGame = praxWaypointGame();
    if (waypointGame && typeof waypointGame.questProgress === "function") waypointGame.questProgress("match1");
  }
  if (key === AIT_GAME_KEY) {
    await aitLaunchModelPicker(key, launchOptions);
    return;
  }
  if (key === "hardware") {
    await hwLaunchModePicker(key, launchOptions);
    return;
  }
  const area = document.getElementById("practice-play-area");
  if (!area) return;
  const game = praxGameMeta(key);
  const difficulty = Math.max(1, Math.min(10, Number(launchOptions?.difficulty)
    || (PRACTICE_GAMES.find(g => g.key === key) || {}).difficulty
    || arcCanvasDifficulty(key) || 1));
  area.innerHTML = praxWrapRound(`<span class="spinner"></span> Loading round...`);
  area.scrollIntoView({ behavior: "smooth", block: "start" });
  praxOpenStage(key, difficulty);
  const stage = PRAX_STAGE.body;
  const loadAbort = { cancelled: false };
  praxShowLoadingWithCancel(stage, game.mode === "ai" ? "Generating a fresh challenge..." : "Loading round...", loadAbort);
  const playStart = performance.now();
  let fetchedDifficulty = difficulty;
  let round = null;

  if (ARC_CANVAS_KEYS.has(key)) {
    round = arcGenerateLocalRound(key, difficulty);
  } else if (key === "spelling") {
    const res = await praxResolveSpellingRound(difficulty);
    if (loadAbort.cancelled) return;
    fetchedDifficulty = res.difficulty || difficulty;
    round = res.round;
  } else {
    const result = await praxFetchPracticeRound(key, launchOptions?.manual ? { difficulty_override: difficulty } : null);
    if (loadAbort.cancelled) return;
    if (result.error) {
      stage.innerHTML = `<span class="prax-supporting-text" style="color:#ddd;">${escapeHtml(result.error)}</span>`;
      return;
    }
    fetchedDifficulty = result.difficulty;
    round = result.round;
  }
  if (PRAX_STAGE) PRAX_STAGE.difficulty = fetchedDifficulty;
  praxShowPreGameCard(key, () => {
    if (loadAbort.cancelled || !PRAX_STAGE) return;
    praxStageOnCleanup(() => praxTrackPlayTime(key, performance.now() - playStart));
    if (key === "memory") renderMemoryGame(stage, fetchedDifficulty, round);
    else if (key === "working_memory") renderWorkingMemoryGame(stage, fetchedDifficulty, round);
    else if (key === "math") renderMathGame(stage, fetchedDifficulty, round);
    else if (key === "logic") renderLogicGame(stage, fetchedDifficulty, round);
    else if (key === "time_estimation") renderTimeEstimationGame(stage, fetchedDifficulty, round);
    else if (key === "spelling") renderSpellingGame(stage, fetchedDifficulty, round);
    else if (key === "longterm") renderLongtermGame(stage, fetchedDifficulty, round);
    else if (key === "signal_storm") renderSignalStormGame(stage, fetchedDifficulty, round);
    else if (key === "focus_pulse") renderFocusPulseGame(stage, fetchedDifficulty, round);
    else if (key === "memory_constellation") renderMemoryConstellationGame(stage, fetchedDifficulty, round);
    else if (key === "circuit_sprint") renderCircuitSprintGame(stage, fetchedDifficulty, round);
    else if (key === "time_forge") renderTimeForgeGame(stage, fetchedDifficulty, round);
    else if (key === AIT_GAME_KEY) aitRenderNeuralNetFixRound(stage, key, fetchedDifficulty, round);
    else renderAiPracticeGame(stage, key, fetchedDifficulty, round);
  });
}

function renderLongtermGame(area, difficulty, round) {
  praxStageSetMidRound(false);
  if (round.phase === "learn") {
    area.innerHTML = `
      <div class="prax-game-prompt">Memorize for tomorrow</div>
      <div style="font-size:20px; line-height:1.55; max-width:520px;">${escapeHtml(round.fact || "")}</div>
      <div class="prax-game-sub">${escapeHtml(round.pending)} fact${round.pending === 1 ? "" : "s"} pending recall. Come back tomorrow.</div>
      <button type="button" class="prax-game-btn" id="practice-play-again">Back to arcade</button>`;
    document.getElementById("practice-play-again").onclick = () => { praxCloseStage(); render(); };
    return;
  }
  praxStageSetMidRound(true);
  area.innerHTML = `
    <div class="prax-game-prompt">Recall time</div>
    <div class="prax-game-sub" style="white-space:pre-wrap;">${escapeHtml(round.challenge || "")}</div>
    <textarea id="ai-game-answer" placeholder="Everything you remember..." style="margin-top:10px; width:min(520px,90vw); min-height:120px; font-size:16px; padding:12px; border-radius:12px; border:2px solid var(--gridline); background:var(--surface,var(--card));"></textarea>
    <button type="button" class="prax-game-btn primary" id="lt-submit" style="margin-top:14px;">Submit</button>`;
  document.getElementById("lt-submit").onclick = async () => {
    const answer = document.getElementById("ai-game-answer").value.trim();
    if (!answer) return;
    const btn = document.getElementById("lt-submit");
    btn.innerHTML = '<span class="spinner"></span> Grading...'; btn.disabled = true;
    const result = await api("/api/practice/longterm/grade", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, challenge: round.challenge, reference: round.reference, difficulty, fact_id: round.fact_id }),
    });
    if (result.error) { window.alert(result.error); btn.textContent = "Submit"; btn.disabled = false; return; }
    praxRenderResult(area, {
      key: "longterm", score: result.score, maxScore: result.max_score,
      difficulty, feedback: result.feedback, reference: result.reference,
      newDifficulty: result.new_difficulty,
    });
  };
}

function renderWorkingMemoryGame(area, difficulty, round) {
  const digits = round.digits || [];
  const useScatter = difficulty >= 5;
  const revealSec = Math.max(2, round.reveal_seconds || Math.round(digits.length * 0.8));
  praxStageSetMidRound(true);
  let answered = false;

  const showRecall = () => {
    praxClearRoundTimer();
    const qTimer = Math.max(12, digits.length * 3);
    praxStartRoundTimer(qTimer, () => {
      if (!answered) finish([], true);
    });
    area.innerHTML = `
      <div class="prax-game-prompt">Type digits backwards</div>
      <div class="prax-game-sub">Last digit first — timer running</div>
      <input type="text" class="prax-game-input" id="wm-answer" inputmode="numeric" autocomplete="off" placeholder="???">
      <button type="button" class="prax-game-btn primary" id="wm-submit" style="margin-top:14px;">Submit</button>`;
    const submit = () => {
      if (answered) return;
      const typed = (document.getElementById("wm-answer").value.match(/\d/g) || []);
      finish(typed, false);
    };
    document.getElementById("wm-submit").onclick = submit;
    document.getElementById("wm-answer").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    document.getElementById("wm-answer").focus();
  };

  const finish = async (typed, timedOut) => {
    if (answered) return;
    answered = true;
    praxClearRoundTimer();
    const expected = digits.slice().reverse().map(String);
    const correct = expected.filter((d, i) => typed[i] === d).length;
    if (correct === expected.length && !timedOut) praxUpdateCombo(true);
    else praxUpdateCombo(false);
    await submitPracticeResult("working_memory", difficulty, correct, expected.length, { typed, timedOut },
      area, `Reversed: ${expected.join(" ")}.`, { maxCombo: PRAX_STAGE.maxCombo });
  };

  if (useScatter) {
    area.innerHTML = `
      <div class="prax-game-prompt">Watch the digits</div>
      <div class="prax-game-sub">Memorize positions &amp; colors — recall backwards</div>
      <div class="prax-wm-stage" id="wm-stage"></div>
      <div class="prax-game-sub">Revealing...</div>`;
    const stage = document.getElementById("wm-stage");
    let i = 0;
    const flashNext = () => {
      if (i >= digits.length) { setTimeout(showRecall, 400); return; }
      stage.innerHTML = "";
      const d = document.createElement("div");
      d.className = "prax-wm-digit";
      d.textContent = digits[i];
      d.style.left = (15 + Math.random() * 70) + "%";
      d.style.top = (20 + Math.random() * 60) + "%";
      d.style.color = PRAX_WM_COLORS[i % PRAX_WM_COLORS.length];
      stage.appendChild(d);
      i += 1;
      setTimeout(flashNext, Math.max(350, 700 - difficulty * 30));
    };
    flashNext();
  } else {
    area.innerHTML = `
      <div class="prax-game-prompt">Memorize</div>
      <div style="font-size:42px; font-weight:900; letter-spacing:10px; font-variant-numeric:tabular-nums;">${escapeHtml(digits.join(" "))}</div>
      <div class="prax-game-sub">Recall backwards in <span id="wm-countdown">${escapeHtml(revealSec)}</span>s</div>`;
    let remaining = revealSec;
    const iv = setInterval(() => {
      remaining -= 1;
      const el = document.getElementById("wm-countdown");
      if (el) el.textContent = remaining;
      if (remaining <= 0) { clearInterval(iv); showRecall(); }
    }, 1000);
    praxStageOnCleanup(() => clearInterval(iv));
  }
}

function renderAiPracticeGame(area, key, difficulty, round) {
  praxStageSetMidRound(true);
  area.innerHTML = `
    <div class="prax-game-prompt">${escapeHtml(praxGameLabel(key))}</div>
    <div class="prax-game-sub" style="white-space:pre-wrap; text-align:left; max-width:560px; margin:0 auto 16px;">${escapeHtml(round.challenge || "")}</div>
    <textarea id="ai-game-answer" placeholder="Your answer..." style="width:min(560px,90vw); min-height:140px; font-size:16px; padding:12px; border-radius:12px; border:2px solid var(--gridline); background:var(--surface,var(--card));"></textarea>
    <button type="button" class="prax-game-btn primary" id="ai-game-submit" style="margin-top:14px;">Submit for grading</button>`;
  document.getElementById("ai-game-submit").onclick = async () => {
    const answer = document.getElementById("ai-game-answer").value.trim();
    if (!answer) return;
    const btn = document.getElementById("ai-game-submit");
    btn.innerHTML = '<span class="spinner"></span> Grading...'; btn.disabled = true;
    praxClearRoundTimer();
    const result = await api(`/api/practice/${key}/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, challenge: round.challenge, reference: round.reference, difficulty }),
    });
    if (result.error) { window.alert(result.error); btn.textContent = "Submit for grading"; btn.disabled = false; return; }
    praxRenderResult(area, {
      key, score: result.score, maxScore: result.max_score,
      difficulty, feedback: result.feedback, newDifficulty: result.new_difficulty,
    });
  };
}

async function submitPracticeResult(key, difficulty, score, maxScore, details, area, message, stats) {
  if (ARC_MATCH_CTX) {
    arcMatchRoundComplete(key, score, maxScore);
    return;
  }
  praxStageSetMidRound(false);
  let result = {};
  if (PRACTICE_GAMES.some(g => g.key === key)) {
    result = await api(`/api/practice/${key}/submit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, max_score: maxScore, difficulty, details }),
    });
  }
  praxRenderResult(area, {
    key, score, maxScore, difficulty, message,
    newDifficulty: result.new_difficulty,
    maxCombo: stats?.maxCombo,
    avgTimeSec: stats?.avgTimeSec,
    vocabLearn: stats?.vocabLearn,
    stats,
  });
}

// --- Hardware track (mode picker + staged continuum) ------------------------------------------------

function hwModeMeta(modeKey) {
  return HARDWARE_MODES.find(m => m.key === modeKey) || HARDWARE_MODES[0];
}

function hwGetLastMode() {
  try {
    const key = localStorage.getItem(HARDWARE_MODE_KEY);
    return HARDWARE_MODES.some(m => m.key === key) ? key : HARDWARE_MODES[0].key;
  } catch (_) {
    return HARDWARE_MODES[0].key;
  }
}

function hwSetLastMode(modeKey) {
  if (HARDWARE_MODES.some(m => m.key === modeKey)) {
    localStorage.setItem(HARDWARE_MODE_KEY, modeKey);
  }
}

function hwPickMatchMode() {
  const level = hwGetTrackLevel();
  const stageId = HARDWARE_STAGES[level]?.id || "ohm";
  const pool = HARDWARE_MODES.filter(m => m.stageId === stageId);
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : HARDWARE_MODES[0];
  return pick.key;
}

function hwEffectiveDifficulty(baseDiff, trackLevel, modeKey) {
  const base = Math.max(1, Math.min(10, baseDiff || 3));
  const track = Math.max(0, Math.min(HARDWARE_STAGES.length - 1, trackLevel || 0));
  const mode = hwModeMeta(modeKey);
  const blended = base * 0.55 + track * 0.65 + (mode.difficulty || 0);
  return Math.max(1, Math.min(10, Math.round(blended)));
}

function hwParseNumericAnswer(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().replace(/,/g, "").replace(
    /\s*(?:[fpnumkMGTµμ]?\s*(?:v|a|w|ω|Ω|Ω)|(?:milli|kilo|mega)?(?:volts?|amperes?|amps?|ohms?|watts?))\s*$/iu,
    "",
  ).trim();
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!den) return null;
    return Number(frac[1]) / den;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function hwFormatAnswer(q) {
  if (!q) return "";
  if (q.answer_display) return String(q.answer_display);
  if (q.type === "numeric" || q.format === "numeric") {
    const val = Number(q.answer);
    if (!Number.isFinite(val)) return String(q.answer);
    if (q.unit) return `${val} ${q.unit}`;
    return String(val);
  }
  if (Array.isArray(q.answer)) return q.answer.join(" → ");
  return String(q.answer ?? "");
}

function hwCorrectionHint(q, round) {
  if (q?.correction) return q.correction;
  if (round?.teaching_point) return round.teaching_point;
  if (q?.type === "numeric") return "Double-check units — fractions like 5/8 are valid.";
  return "";
}

function hwShowInfoModal(title, body, onClose) {
  const existing = document.getElementById("hw-info-pop");
  if (existing) existing.remove();
  const pop = document.createElement("div");
  pop.id = "hw-info-pop";
  pop.className = "hw-info-pop";
  pop.innerHTML = `
    <div class="hw-info-card" role="dialog" aria-modal="true">
      <h3>${escapeHtml(title || "Hardware mode")}</h3>
      <p>${escapeHtml(body || "")}</p>
      <button type="button" class="prax-game-btn primary" id="hw-info-close" style="margin-top:14px;">Got it</button>
    </div>`;
  document.body.appendChild(pop);
  const close = () => { pop.remove(); if (onClose) onClose(); };
  pop.onclick = e => { if (e.target === pop) close(); };
  document.getElementById("hw-info-close").onclick = close;
}

function hwMiniReportHtml(correct, total, maxCombo, avgSec) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avg = avgSec != null ? `${avgSec.toFixed(1)}s` : "—";
  return `<div class="hw-mini-report" role="status">
    <strong>Mini report</strong> — ${escapeHtml(correct)}/${escapeHtml(total)} (${escapeHtml(pct)}%)
    · combo x${escapeHtml(maxCombo || 0)} · avg ${escapeHtml(avg)}</div>`;
}

function hwModeChipHtml(m) {
  return `<div class="hw-mode-chip" data-mode-key="${escapeHtml(m.key)}" role="button" tabindex="0">
    <div class="hw-mode-chip-head">
      <div class="hw-mode-name">${escapeHtml(m.icon)} ${escapeHtml(m.label)}</div>
      <button type="button" class="hw-mode-info-btn" data-mode-info="${escapeHtml(m.key)}" title="Mode info" aria-label="Mode info">&#9432;</button>
    </div>
    <div class="hw-mode-desc">${escapeHtml(m.desc)}</div>
    <div class="hw-mode-kind">${escapeHtml(m.kind)}</div>
  </div>`;
}

function hwRenderModePicker(area, difficulty) {
  if (!area) return;
  praxStageSetMidRound(false);
  const last = hwGetLastMode();
  area.innerHTML = `
    <div class="hw-mode-picker">
      <div class="hw-mode-top">
        <div class="hw-mode-title">Hardware Bay — pick a mode</div>
      </div>
      <div class="hw-mode-grid">
        ${HARDWARE_MODES.map(hwModeChipHtml).join("")}
      </div>
      <button type="button" class="secondary prax-game-btn" id="hw-picker-back" style="margin-top:16px;">Back to arcade</button>
    </div>`;
  const backBtn = document.getElementById("hw-picker-back");
  if (backBtn) backBtn.onclick = () => { praxCloseStage(); render(); };
  area.querySelectorAll(".hw-mode-chip").forEach(chip => {
    const activate = () => hwBeginMode(chip.dataset.modeKey);
    chip.onclick = e => {
      if (e.target.closest(".hw-mode-info-btn")) return;
      activate();
    };
    chip.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    };
  });
  area.querySelectorAll(".hw-mode-info-btn").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const meta = hwModeMeta(btn.dataset.modeInfo);
      hwShowInfoModal(meta.label, meta.info);
    };
  });
  const lastChip = area.querySelector(`[data-mode-key="${last}"]`);
  if (lastChip) lastChip.style.borderColor = "rgba(34,211,238,0.55)";
}

async function hwLaunchModePicker(key, launchOptions) {
  praxEnsureStyles();
  PRACTICE_CURRENT_KEY = key;
  const area = document.getElementById("practice-play-area");
  if (!area) return;
  const difficulty = Math.max(1, Math.min(10, Number(launchOptions?.difficulty)
    || (PRACTICE_GAMES.find(g => g.key === key) || {}).difficulty || 1));
  area.innerHTML = praxWrapRound(`<span class="spinner"></span> Loading...`);
  area.scrollIntoView({ behavior: "smooth", block: "start" });
  praxOpenStage(key, difficulty);
  if (!PRAX_STAGE?.body) return;
  hwRenderModePicker(PRAX_STAGE.body, difficulty);
}

async function hwBeginMode(modeKey) {
  if (!PRAX_STAGE?.body) return;
  hwSetLastMode(modeKey);
  const stage = PRAX_STAGE.body;
  const key = "hardware";
  const mode = hwModeMeta(modeKey);
  const difficulty = PRAX_STAGE.difficulty || 1;
  stage.innerHTML = `<span class="spinner"></span> Loading ${escapeHtml(mode.label)}...`;
  const loadAbort = { cancelled: false };
  const playStart = performance.now();
  const res = await hwResolveHardwareRound(difficulty, modeKey);
  if (loadAbort.cancelled || !PRAX_STAGE) return;
  const fetchedDifficulty = res.difficulty || difficulty;
  const round = res.round;
  if (PRAX_STAGE) PRAX_STAGE.difficulty = fetchedDifficulty;
  praxShowPreGameCard(key, () => {
    if (!PRAX_STAGE) return;
    praxStageOnCleanup(() => praxTrackPlayTime(key, performance.now() - playStart));
    renderHardwareGame(stage, fetchedDifficulty, round, modeKey);
  });
}

function hwGetTrackLevel() {
  try {
    const n = parseInt(localStorage.getItem(HARDWARE_TRACK_LEVEL_KEY) || "0", 10);
    return Math.max(0, Math.min(HARDWARE_STAGES.length - 1, Number.isFinite(n) ? n : 0));
  } catch (_) {
    return 0;
  }
}

function hwSetTrackLevel(level) {
  const clamped = Math.max(0, Math.min(HARDWARE_STAGES.length - 1, level));
  localStorage.setItem(HARDWARE_TRACK_LEVEL_KEY, String(clamped));
  return clamped;
}

function hwGetStageClears() {
  try {
    const n = parseInt(localStorage.getItem(HARDWARE_STAGE_CLEARS_KEY) || "0", 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch (_) {
    return 0;
  }
}

function hwBumpTrackOnWin(score, maxScore) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio < 0.75) return { advanced: false, level: hwGetTrackLevel() };
  let clears = hwGetStageClears() + 1;
  let level = hwGetTrackLevel();
  let advanced = false;
  if (clears >= 2 && level < HARDWARE_STAGES.length - 1) {
    level += 1;
    clears = 0;
    advanced = true;
    hwSetTrackLevel(level);
    hwCelebrateRankUp(level);
  }
  localStorage.setItem(HARDWARE_STAGE_CLEARS_KEY, String(clears));
  return { advanced, level };
}

function hwTrackContinuumHtml(activeLevel) {
  const unlocked = hwGetTrackLevel();
  const level = activeLevel != null ? activeLevel : unlocked;
  const nodes = HARDWARE_STAGES.map((s, i) => {
    const cls = i < level ? "done" : i === level ? "current" : "";
    const canGo = i <= unlocked;
    const extra = canGo ? " clickable" : " locked";
    const clickable = canGo ? ` data-hw-level="${i}" role="button" tabindex="0"` : "";
    const title = canGo
      ? (i === level ? "Current level" : `Go back to ${s.label}`)
      : "Locked — keep playing to unlock";
    return `<div class="prax-hw-stage ${cls}${extra}"${clickable} title="${escapeHtml(title)}"><span>${i + 1}</span><span class="prax-hw-stage-name">${escapeHtml(s.label)}</span></div>`;
  }).join("");
  return `<div class="prax-hw-track"><div class="prax-hw-track-label">Hardware track · tap a cleared level to go back</div><div class="prax-hw-track-row">${nodes}</div></div>`;
}

function hwQuestionTimerSec(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  return Math.max(12, Math.round(28 - d * 1.4));
}

function hwNumericQuestion(prompt, answer, unit, tolerance) {
  return {
    type: "numeric",
    prompt,
    unit: unit || "",
    answer,
    tolerance: tolerance != null ? tolerance : Math.max(0.5, Math.abs(answer) * 0.02),
  };
}

function hwMcqQuestion(prompt, options, answer) {
  return { type: "mcq", prompt, options: options.slice(), answer };
}

function hwOrderQuestion(prompt, steps) {
  return { type: "order_steps", prompt, steps: steps.slice(), answer: steps.slice() };
}

function hwTruthTableQuestion(prompt, headers, rows, options, answer) {
  return { type: "truth_table", prompt, headers, rows, options: options.slice(), answer };
}

function hwDividerQuestion(difficulty) {
  const tops = [2, 3, 3.3, 4.7, 5, 6.8, 10];
  const bots = [1, 2, 2.2, 3.3, 4.7, 5];
  const rTop = tops[Math.floor(Math.random() * tops.length)];
  let rBot = bots[Math.floor(Math.random() * bots.length)];
  if (rBot === rTop) rBot = bots[(bots.indexOf(rBot) + 1) % bots.length];
  const vIn = [3.3, 5, 9, 12][Math.floor(Math.random() * 4)];
  const ratio = rBot / (rTop + rBot);
  const vOut = Math.round(vIn * ratio * 100) / 100;
  if (difficulty >= 6 && Math.random() < 0.5) {
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const den = Math.round((rTop + rBot) * 10);
    const num = Math.round(rBot * 10);
    const g = gcd(num, den);
    const frac = `${num / g}/${den / g}`;
    return hwNumericQuestion(
      `Divider: ${rTop} kΩ over ${rBot} kΩ. Fraction of V_in at the junction?`,
      ratio,
      "of V_in",
      0.02
    );
  }
  return hwNumericQuestion(
    `Divider: ${rTop} kΩ top, ${rBot} kΩ to ground, ${vIn} V in. V_out?`,
    vOut,
    "V",
    0.05
  );
}

function hwBenchBriefQuestion() {
  const cards = [
    hwMcqQuestion(
      "Before probing a live board, safest first check?",
      ["Confirm ground reference and probe rating", "Maximize scope time/div", "Disable decoupling caps", "Float both probe leads"],
      "Confirm ground reference and probe rating"
    ),
    hwMcqQuestion(
      "GPIO reads random values on a floating button. Fix?",
      ["Enable internal pull-up or pull-down", "Set pin OUTPUT HIGH", "Remove the button", "Raise CPU clock"],
      "Enable internal pull-up or pull-down"
    ),
    hwMcqQuestion(
      "Motor inrush at boot — practical mitigation?",
      ["Soft-start PWM ramp", "Wire motor straight to 12 V", "Remove flyback diode", "Stay open-loop forever"],
      "Soft-start PWM ramp"
    ),
  ];
  const q = cards[Math.floor(Math.random() * cards.length)];
  q.kind = "talk";
  q.correction = "Bench tip: bias inputs, ramp outputs, and know your probe ground.";
  return q;
}

function hwStageCurriculum(stageIdx, difficulty, modeKey) {
  const d = Math.max(1, Math.min(10, difficulty || 1));
  const stage = HARDWARE_STAGES[stageIdx] || HARDWARE_STAGES[0];
  const mode = modeKey ? hwModeMeta(modeKey) : null;
  if (mode?.key === "divider_drop") {
    const questions = [hwDividerQuestion(d), hwDividerQuestion(d), hwDividerQuestion(d)];
    return {
      stage: mode.label,
      stage_index: stageIdx,
      mode: mode.key,
      mode_label: mode.label,
      mode_kind: mode.kind,
      mode_info: mode.info,
      questions: praxShuffle(questions).slice(0, 3),
      teaching_point: mode.info,
      time_per_question: hwQuestionTimerSec(d) + 4,
    };
  }
  if (mode?.key === "bench_brief") {
    const questions = [hwBenchBriefQuestion(), hwBenchBriefQuestion(), hwBenchBriefQuestion()];
    return {
      stage: mode.label,
      stage_index: stageIdx,
      mode: mode.key,
      mode_label: mode.label,
      mode_kind: mode.kind,
      mode_info: mode.info,
      questions,
      teaching_point: mode.info,
      time_per_question: 50,
    };
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const r = (lo, hi) => Math.round(lo + Math.random() * (hi - lo));
  const questions = [];

  if (stage.id === "ohm") {
    const v = r(3, 24), i = r(1, 8);
    questions.push(hwNumericQuestion(`A ${v} V source drives ${i} mA through a resistor. Resistance (Ω)?`, Math.round(v / (i / 1000)), "Ω", 1));
    questions.push(hwMcqQuestion("Which color band code is 1 kΩ ±5%?", ["Brown-Black-Red-Gold", "Brown-Black-Orange-Gold", "Red-Red-Brown-Gold"], "Brown-Black-Red-Gold"));
    if (d >= 4) questions.push(hwMcqQuestion("Power dissipated rises when:", ["Voltage doubles at fixed R", "Current halves at fixed R", "Resistance doubles at fixed V"], "Voltage doubles at fixed R"));
  } else if (stage.id === "digital") {
    questions.push(hwTruthTableQuestion(
      "Which gate matches this truth table?",
      ["A", "B", "Y"],
      [["0", "0", "0"], ["0", "1", "1"], ["1", "0", "1"], ["1", "1", "1"]],
      ["AND", "OR", "XOR"],
      "OR"
    ));
    questions.push(hwMcqQuestion("A debounce circuit on a switch primarily:", ["Filters contact bounce", "Amplifies voltage", "Stores charge for hours"], "Filters contact bounce"));
    if (d >= 5) questions.push(hwTruthTableQuestion(
      "Pick the gate:",
      ["A", "B", "Y"],
      [["0", "0", "0"], ["0", "1", "1"], ["1", "0", "1"], ["1", "1", "0"]],
      ["AND", "OR", "XOR"],
      "XOR"
    ));
  } else if (stage.id === "rc") {
    const rK = r(10, 47), cU = r(10, 100);
    const tau = Math.round(rK * cU / 1000 * 10) / 10;
    questions.push(hwNumericQuestion(`RC time constant τ for R=${rK} kΩ and C=${cU} µF? (τ = R·C in ms)`, tau, "ms", 0.5));
    questions.push(hwOrderQuestion("Order a capacitor charging from 0 V:", ["Apply voltage", "Current is highest", "Voltage approaches rail", "Current decays toward zero"]));
    if (d >= 4) questions.push(hwMcqQuestion("A low-pass RC filter attenuates:", ["High frequencies", "DC only", "All frequencies equally"], "High frequencies"));
  } else if (stage.id === "opamp") {
    questions.push(hwMcqQuestion("Negative feedback around an op-amp mainly:", ["Stabilizes gain and linearizes response", "Guarantees oscillation", "Blocks all AC"], "Stabilizes gain and linearizes response"));
    questions.push(hwOrderQuestion("Build a non-inverting amplifier:", ["Set feedback resistors", "Connect + input to signal", "Take output from op-amp out", "Tie − input through Rf to output"]));
    if (d >= 5) questions.push(hwMcqQuestion("Virtual short means:", ["Inputs track each other in closed loop", "Outputs are shorted to ground", "Supply pins are tied"], "Inputs track each other in closed loop"));
  } else if (stage.id === "sensors") {
    questions.push(hwMcqQuestion("An I²C bus needs:", ["Pull-up resistors on SDA/SCL", "A dedicated clock crystal per sensor", "Parallel data bus width of 16"], "Pull-up resistors on SDA/SCL"));
    questions.push(hwOrderQuestion("Typical ADC sampling flow:", ["Sensor produces analog voltage", "Sample-and-hold captures level", "ADC converts to digital code", "Firmware reads register"]));
    if (d >= 4) questions.push(hwMcqQuestion("A thermistor NTC:", ["Resistance drops as temperature rises", "Outputs digital PWM", "Is always linear 0–10 V"], "Resistance drops as temperature rises"));
  } else if (stage.id === "mcu") {
    questions.push(hwMcqQuestion("An ISR should:", ["Stay short and defer heavy work", "Call blocking delays", "Allocate large buffers"], "Stay short and defer heavy work"));
    questions.push(hwOrderQuestion("Boot-to-main on a MCU:", ["Reset vector runs", "Clocks and memory init", "Peripheral setup", "Enter main loop"]));
    if (d >= 5) questions.push(hwMcqQuestion("Watchdog timer purpose:", ["Recover from stuck firmware", "Increase CPU clock", "Disable interrupts"], "Recover from stuck firmware"));
  } else {
    questions.push(hwOrderQuestion("Robot sense-plan-act chain:", ["Read encoders/IMU", "Estimate pose", "Plan motor commands", "Drive actuators", "Log telemetry"]));
    questions.push(hwMcqQuestion("Closing the loop on a wheel requires:", ["Encoder feedback to controller", "Only open-loop PWM", "Removing the IMU"], "Encoder feedback to controller"));
    if (d >= 4) questions.push(hwOrderQuestion("Safe estop handling:", ["Cut motor power", "Assert brake if fitted", "Latch fault until reset", "Notify supervisor stack"]));
  }

  const teachingPoints = {
    ohm: "Ohm's law: V = I·R. Convert mA to A before dividing.",
    digital: "Truth tables define combinatorial logic — name the gate from unique rows.",
    rc: "τ = R·C sets how fast a node charges; same math in ms when R is kΩ and C is µF.",
    opamp: "Negative feedback trades open-loop gain for predictable closed-loop behavior.",
    sensors: "Analog front-ends need reference, filtering, and correct bus pull-ups.",
    mcu: "Keep ISRs lean; initialize clocks before peripherals; pet or configure watchdog.",
    robot: "Reliable robots chain sensing → state estimate → plan → actuate with safety interlocks.",
  };

  const count = 3;
  const stageIdxForMode = mode
    ? Math.max(0, HARDWARE_STAGES.findIndex(s => s.id === mode.stageId))
    : stageIdx;
  const activeIdx = stageIdxForMode >= 0 ? stageIdxForMode : stageIdx;
  return {
    stage: mode ? mode.label : stage.label,
    stage_index: activeIdx,
    mode: mode?.key || null,
    mode_label: mode?.label || null,
    mode_kind: mode?.kind || null,
    mode_info: mode?.info || null,
    questions: praxShuffle(questions).slice(0, count),
    teaching_point: teachingPoints[stage.id] || pick(Object.values(teachingPoints)),
    time_per_question: hwQuestionTimerSec(d) + (mode?.kind === "talk" ? 18 : 0),
  };
}

function hwGenerateLocalRound(trackLevel, difficulty, modeKey) {
  const mode = modeKey ? hwModeMeta(modeKey) : null;
  const stageIdx = mode
    ? Math.max(0, HARDWARE_STAGES.findIndex(s => s.id === mode.stageId))
    : trackLevel;
  const eff = hwEffectiveDifficulty(difficulty, trackLevel, modeKey || hwGetLastMode());
  return hwStageCurriculum(stageIdx >= 0 ? stageIdx : trackLevel, eff, modeKey);
}

function hwMapApiFormatToType(format) {
  const map = {
    numeric: "numeric",
    multiple_choice: "mcq",
    ordering: "order_steps",
  };
  return map[format] || null;
}

function hwNormalizeApiQuestion(apiQ) {
  if (!apiQ) return null;
  if (apiQ.type && apiQ.prompt != null) return apiQ;

  const type = hwMapApiFormatToType(apiQ.format);
  if (!type) return null;

  const prompt = String(apiQ.question || apiQ.prompt || "");
  const clues = Array.isArray(apiQ.clues) ? apiQ.clues.map(String).filter(Boolean) : [];

  if (type === "numeric") {
    const ans = Number(apiQ.answer);
    let tolerance;
    if (apiQ.tolerance != null && apiQ.tolerance > 0 && apiQ.tolerance < 1) {
      tolerance = Math.max(0.5, Math.abs(ans) * apiQ.tolerance);
    } else if (apiQ.tolerance != null) {
      tolerance = apiQ.tolerance;
    } else {
      tolerance = Math.max(0.5, Math.abs(ans) * 0.02);
    }
    return {
      type,
      prompt,
      answer: ans,
      unit: apiQ.unit || "",
      tolerance,
      clues,
      accept_fraction: apiQ.accept_fraction !== false,
      answer_display: apiQ.answer_display || null,
      correction: apiQ.correction || null,
      kind: apiQ.kind || null,
    };
  }

  if (type === "mcq") {
    const options = (apiQ.options || []).map(String).filter(Boolean);
    if (options.length < 2) return null;
    return {
      type,
      prompt,
      answer: String(apiQ.answer),
      options,
      clues,
    };
  }

  if (type === "order_steps") {
    const steps = (apiQ.items || apiQ.steps || []).map(String).filter(Boolean);
    if (steps.length < 2) return null;
    const answer = Array.isArray(apiQ.answer) ? apiQ.answer.map(String) : steps.slice();
    return { type, prompt, steps, answer, clues };
  }

  return null;
}

function hwNormalizeApiRound(rawRound, difficulty) {
  if (!rawRound) return null;

  let questions = [];
  if (Array.isArray(rawRound.questions) && rawRound.questions.length) {
    questions = rawRound.questions.map(q => hwNormalizeApiQuestion(q)).filter(Boolean);
  } else if (rawRound.format && rawRound.question != null) {
    const normalized = hwNormalizeApiQuestion(rawRound);
    if (normalized) questions = [normalized];
  }
  if (!questions.length) return null;

  const stageNum = rawRound.stage != null && typeof rawRound.stage !== "string"
    ? Number(rawRound.stage) : null;
  const apiStageIdx = rawRound.stage_index != null
    ? rawRound.stage_index
    : (stageNum != null && Number.isFinite(stageNum) ? stageNum - 1 : hwGetTrackLevel());
  const stageIdx = Math.max(hwGetTrackLevel(), apiStageIdx);
  const clampedIdx = Math.max(0, Math.min(HARDWARE_STAGES.length - 1, stageIdx));

  const d = Math.max(1, Math.min(10, difficulty || 3));
  if (questions.length < 3) {
    const localRound = hwStageCurriculum(clampedIdx, d, rawRound.mode);
    const apiPrompts = new Set(questions.map(q => q.prompt));
    const extras = praxShuffle((localRound.questions || []).filter(q => !apiPrompts.has(q.prompt)))
      .slice(0, 3 - questions.length);
    questions = [...questions, ...extras].slice(0, 3);
  }

  const stageLabel = rawRound.stage_label
    || (typeof rawRound.stage === "string" ? rawRound.stage : null)
    || HARDWARE_STAGES[clampedIdx]?.label;

  return {
    stage: stageLabel,
    stage_index: clampedIdx,
    mode: rawRound.mode || null,
    mode_label: rawRound.mode_label || null,
    mode_kind: rawRound.mode_kind || rawRound.kind || null,
    mode_info: rawRound.mode_info || null,
    questions,
    teaching_point: rawRound.teaching_point || "",
    time_per_question: rawRound.time_per_question || hwQuestionTimerSec(d),
  };
}

async function hwResolveHardwareRound(difficulty, modeKey) {
  const trackLevel = hwGetTrackLevel();
  const mode = modeKey || hwGetLastMode();
  const eff = hwEffectiveDifficulty(difficulty, trackLevel, mode);
  try {
    const body = { mode, stage: trackLevel + 1 };
    if (PRAX_LAUNCH_OPTIONS?.manual) body.difficulty_override = difficulty;
    const result = await praxFetchPracticeRound("hardware", body);
    const round = result?.round;
    if (result && !result.error && round) {
      const apiStageNum = round.stage != null && typeof round.stage !== "string"
        ? Number(round.stage) : null;
      const apiStageIdx = apiStageNum != null && Number.isFinite(apiStageNum)
        ? apiStageNum - 1
        : (round.stage_index != null ? round.stage_index : 0);
      if (trackLevel > apiStageIdx) {
        const d = result.difficulty || eff;
        return { difficulty: d, round: hwGenerateLocalRound(trackLevel, d, mode) };
      }
      const normalized = hwNormalizeApiRound(round, result.difficulty || eff);
      if (normalized) {
        normalized.mode = normalized.mode || mode;
        normalized.mode_label = normalized.mode_label || hwModeMeta(mode).label;
        normalized.mode_kind = normalized.mode_kind || hwModeMeta(mode).kind;
        normalized.mode_info = normalized.mode_info || hwModeMeta(mode).info;
        if (normalized.questions.length > 3) normalized.questions = normalized.questions.slice(0, 3);
        return {
          difficulty: result.difficulty || eff,
          round: normalized,
        };
      }
    }
  } catch (_) {}
  return { difficulty: eff, round: hwGenerateLocalRound(trackLevel, eff, mode) };
}

function hwGradeNumeric(q, raw) {
  if (raw === "" || raw == null) return false;
  const val = hwParseNumericAnswer(raw);
  if (val == null || !Number.isFinite(val)) return false;
  const expected = hwParseNumericAnswer(q.answer);
  if (expected == null || !Number.isFinite(expected)) return false;
  const tol = q.tolerance != null ? q.tolerance : 0;
  return Math.abs(val - expected) <= tol;
}

function hwGradeQuestion(q, response) {
  if (!q) return false;
  if (q.type === "numeric") return hwGradeNumeric(q, response);
  if (q.type === "mcq" || q.type === "truth_table") return String(response) === String(q.answer);
  if (q.type === "order_steps") {
    const expected = q.answer || q.steps || [];
    const given = Array.isArray(response) ? response : [];
    return expected.length === given.length && expected.every((s, i) => s === given[i]);
  }
  return false;
}

function hwCluesHtml(q) {
  const clues = q?.clues || [];
  if (!clues.length) return "";
  return `<ul class="prax-game-clues">${clues.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;
}

function hwTruthTableHtml(q) {
  const headers = q.headers || [];
  const rows = q.rows || [];
  const head = headers.map(h => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<div class="prax-hw-truth-wrap"><table class="prax-hw-truth"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderHardwareGame(area, difficulty, roundIn, modeKey) {
  const mode = hwModeMeta(modeKey || roundIn?.mode || hwGetLastMode());
  const round = roundIn || hwGenerateLocalRound(hwGetTrackLevel(), difficulty, mode.key);
  const questions = (round.questions || []).slice(0, 3);
  const stageIdx = round.stage_index != null ? round.stage_index : hwGetTrackLevel();
  let index = 0;
  let correct = 0;
  const times = [];
  let locked = false;
  let timerBonus = 0;
  const isTalk = round.mode_kind === "talk" || mode.kind === "talk";
  praxStageSetMidRound(true);

  const playbarHtml = `
    <div class="hw-playbar">
      <div class="hw-playbar-left">
        <span class="hw-mode-badge">${escapeHtml(round.mode_label || mode.label)}</span>
        <button type="button" class="hw-bar-btn" id="hw-play-info" title="Mode info">&#9432; Info</button>
        ${isTalk ? `<button type="button" class="hw-bar-btn" id="hw-fullscreen" title="Fullscreen">&#9974; Fullscreen</button>` : ""}
      </div>
    </div>`;

  area.innerHTML = `
    ${playbarHtml}
    ${hwTrackContinuumHtml(stageIdx)}
    <div class="prax-game-progress" id="hw-progress"></div>
    <div id="hw-report-sticky" class="hw-report-sticky" hidden></div>
    <div id="hw-question-shell"></div>
    <div id="hw-correction-slot"></div>`;

  const infoBtn = document.getElementById("hw-play-info");
  if (infoBtn) {
    infoBtn.onclick = () => {
      hwShowInfoModal(round.mode_label || mode.label, round.mode_info || mode.info);
    };
  }
  const fsBtn = document.getElementById("hw-fullscreen");
  if (fsBtn) {
    fsBtn.onclick = () => {
      const panel = area.querySelector(".hw-talk-panel");
      if (!panel) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else panel.requestFullscreen?.().catch(() => {});
    };
  }
  area.querySelectorAll("[data-hw-level]").forEach(el => {
    const go = () => {
      const i = parseInt(el.dataset.hwLevel, 10);
      if (!Number.isFinite(i) || i > hwGetTrackLevel()) return;
      if (i === stageIdx && !window.confirm("Restart this level?")) return;
      hwSetTrackLevel(i);
      renderHardwareGame(area, difficulty, null, mode.key);
    };
    el.onclick = go;
    el.onkeydown = ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        go();
      }
    };
  });

  const updateStickyReport = () => {
    if (index < 2) return;
    const sticky = document.getElementById("hw-report-sticky");
    if (!sticky) return;
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    sticky.innerHTML = hwMiniReportHtml(correct, index, PRAX_STAGE?.maxCombo || 0, avg);
    sticky.hidden = false;
  };

  const showQuestion = () => {
    if (index >= questions.length) {
      finishSession();
      return;
    }
    locked = false;
    const q = questions[index];
    const baseTimer = round.time_per_question || hwQuestionTimerSec(difficulty);
    const timerSec = baseTimer + timerBonus;
    timerBonus = 0;
    const started = performance.now();
    let bodyHtml = "";
    const talkWrap = isTalk ? "hw-talk-panel" : "";
    const progressEl = document.getElementById("hw-progress");
    const shell = document.getElementById("hw-question-shell");
    const corrSlot = document.getElementById("hw-correction-slot");
    if (progressEl) {
      progressEl.textContent = `${round.stage || HARDWARE_STAGES[stageIdx]?.label || "Hardware"} · ${index + 1} / ${questions.length}`;
    }
    if (corrSlot) corrSlot.innerHTML = "";

    if (q.type === "numeric") {
      bodyHtml = `
        <div class="${talkWrap}">
        <div class="prax-game-prompt" style="font-size:clamp(18px,3.2vw,26px);">${escapeHtml(q.prompt)}</div>
        <input type="text" class="prax-game-input" id="hw-answer" inputmode="decimal" autocomplete="off" placeholder="e.g. 42 or 5/8">
        ${q.unit ? `<div class="prax-game-sub">Answer in ${escapeHtml(q.unit)} — fractions OK</div>` : `<div class="prax-game-sub">Decimals or fractions like 5/8</div>`}
        <button type="button" class="prax-game-btn primary" id="hw-submit" style="margin-top:14px;">Submit</button>
        </div>`;
    } else if (q.type === "mcq" || q.type === "truth_table") {
      const opts = praxShuffle((q.options || []).filter(Boolean));
      const table = q.type === "truth_table" ? hwTruthTableHtml(q) : "";
      if (opts.length < 2) {
        bodyHtml = `<div class="prax-supporting-text">This question has no answer choices — skipping…</div>`;
      } else {
        bodyHtml = `
        <div class="${talkWrap}">
        <div class="prax-game-prompt" style="font-size:clamp(18px,3.2vw,26px);">${escapeHtml(q.prompt)}</div>
        ${hwCluesHtml(q)}
        ${table}
        <div class="prax-game-options">${opts.map(o =>
          `<button type="button" class="prax-game-btn hw-opt" data-option="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</div>
        ${isTalk ? `<div class="hw-talk-tip">${escapeHtml(q.correction || round.teaching_point || mode.info)}</div>` : ""}
        </div>`;
      }
    } else if (q.type === "order_steps") {
      const pool = praxShuffle(q.steps || []);
      bodyHtml = `
        <div class="prax-game-prompt" style="font-size:clamp(18px,3.2vw,26px);">${escapeHtml(q.prompt)}</div>
        <div class="prax-game-sub">Tap steps in order — use the tray to build the sequence</div>
        <div class="prax-memory-order prax-hw-order-zone" id="hw-order"></div>
        <div class="prax-game-options" id="hw-pool">${pool.map(s =>
          `<button type="button" class="prax-chip hw-step" data-step="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}</div>
        <button type="button" class="prax-game-btn primary" id="hw-order-submit" style="margin-top:14px;">Check order</button>`;
    } else {
      bodyHtml = `<div class="prax-supporting-text">Unknown question type</div>`;
    }

    if (shell) shell.innerHTML = bodyHtml;

    const order = [];
    const orderEl = document.getElementById("hw-order");
    const orderSubmit = document.getElementById("hw-order-submit");
    const expectedLen = (q.steps || q.answer || []).length;
    const syncOrderSubmit = () => {
      if (!orderSubmit) return;
      const ready = order.length >= expectedLen;
      orderSubmit.disabled = !ready;
      orderSubmit.setAttribute("aria-disabled", ready ? "false" : "true");
    };
    if (orderEl) {
      document.querySelectorAll("#hw-pool .hw-step").forEach(chip => {
        chip.onclick = () => {
          if (locked || chip.classList.contains("used")) return;
          chip.classList.add("used");
          order.push(chip.dataset.step);
          const tag = document.createElement("span");
          tag.className = "prax-chip selected";
          tag.textContent = chip.dataset.step;
          orderEl.appendChild(tag);
          syncOrderSubmit();
        };
      });
    }

    const skipQuestion = bodyHtml.includes("skipping");

    const advance = (delay) => {
      setTimeout(showQuestion, delay);
    };

    const handle = (response, timedOut) => {
      if (locked) return;
      locked = true;
      praxClearRoundTimer();
      const isCorrect = !timedOut && hwGradeQuestion(q, response);
      const elapsed = (performance.now() - started) / 1000;
      times.push(elapsed);
      praxLogGameplay({ game: "hardware", qIdx: index, correct: isCorrect, ms: elapsed * 1000, difficulty, mode: mode.key });

      if (q.type === "mcq" || q.type === "truth_table") {
        praxMarkAnswerButtons(".hw-opt", q.answer, response, "option");
      } else if (q.type === "numeric") {
        const input = document.getElementById("hw-answer");
        if (input) input.classList.add(isCorrect ? "correct" : "wrong");
      } else if (q.type === "order_steps") {
        const expected = q.answer || q.steps || [];
        document.querySelectorAll("#hw-pool .hw-step").forEach(chip => {
          const step = chip.dataset.step;
          if (expected.includes(step) && order.includes(step) && expected[order.indexOf(step)] === step) {
            chip.classList.add("correct");
          } else if (order.includes(step)) {
            chip.classList.add("wrong");
          }
        });
      }

      if (isCorrect) {
        correct += 1;
        const left = Math.max(0, (PRAX_STAGE?.timerEnd || 0) - performance.now()) / (timerSec * 1000);
        praxUpdateCombo(true);
        praxScorePopup(praxDisplayPoints(1, left));
        index += 1;
        updateStickyReport();
        advance(320);
      } else {
        praxUpdateCombo(false);
        timerBonus = 6;
        if (corrSlot) {
          const hint = hwCorrectionHint(q, round);
          corrSlot.innerHTML = `<div class="hw-correction" role="alert">
            <strong>Correction:</strong> ${escapeHtml(hwFormatAnswer(q))}
            ${hint ? `<div class="hw-correction-hint">${escapeHtml(hint)}</div>` : ""}
            <div class="prax-game-sub" style="margin-top:8px;">+6s on the next question — less time pressure.</div>
          </div>`;
        }
        index += 1;
        updateStickyReport();
        advance(1800);
      }
    };

    if (!isTalk) {
      praxStartRoundTimer(timerSec, () => handle(q.type === "order_steps" ? order.slice() : null, true));
    } else if (timerSec > 0) {
      praxStartRoundTimer(timerSec, () => handle(null, true));
    }

    const submitBtn = document.getElementById("hw-submit");
    if (submitBtn) {
      const input = document.getElementById("hw-answer");
      const go = () => handle(input ? input.value.trim() : "", false);
      submitBtn.onclick = go;
      if (input) {
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
        input.focus();
      }
    }
    document.querySelectorAll(".hw-opt").forEach(btn => {
      btn.onclick = () => handle(btn.dataset.option, false);
    });
    if (orderSubmit) {
      syncOrderSubmit();
      orderSubmit.onclick = () => {
        if (order.length < expectedLen) return;
        handle(order.slice(), false);
      };
    }

    if (skipQuestion) {
      setTimeout(() => handle(null, false), 400);
    }
  };

  const finishSession = async () => {
    praxClearRoundTimer();
    const avgTimeSec = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const ratio = questions.length > 0 ? correct / questions.length : 0;
    const trackResult = ratio >= 0.75 ? hwBumpTrackOnWin(correct, questions.length) : { advanced: false, level: hwGetTrackLevel() };
    const stageName = round.stage || HARDWARE_STAGES[stageIdx]?.label || "Stage";
    const stageClear = ratio >= 0.75
      ? (trackResult.advanced ? `${stageName} cleared — track advanced!` : `${stageName} cleared!`)
      : "";
    await submitPracticeResult("hardware", difficulty, correct, questions.length, {
      correct, stage: round.stage, stage_index: stageIdx, track_level: trackResult.level, mode: mode.key,
    }, area, `${correct}/${questions.length} correct · ${round.mode_label || round.stage || "Hardware"}`,
      {
        maxCombo: PRAX_STAGE?.maxCombo || 0,
        avgTimeSec,
        teachingPoint: round.teaching_point || round.mode_info || mode.info,
        stageClear,
      });
  };
  showQuestion();
}

function renderMemoryGame(area, difficulty, round) {
  const session = praxBuildMemorySession(round, difficulty);
  const flashMs = praxMemoryFlashMs(difficulty);
  praxStageSetMidRound(true);
  let idx = 0;
  area.innerHTML = `
    <div class="prax-game-prompt">Memory flash</div>
    <div class="prax-game-sub">Word ${1} / ${session.words.length}</div>
    <div class="prax-flash-word" id="memory-flash">Ready...</div>
    <button type="button" class="prax-game-btn secondary" id="memory-skip" style="margin-top:12px;">Skip to recall</button>`;
  const flashEl = () => document.getElementById("memory-flash");
  const subEl = () => area.querySelector(".prax-game-sub");
  let skipped = false;
  document.getElementById("memory-skip").onclick = () => {
    skipped = true;
    renderMemoryRecallForm(area, difficulty, session);
  };
  const tick = () => {
    if (skipped) return;
    if (idx >= session.words.length) {
      setTimeout(() => { if (!skipped) renderMemoryRecallForm(area, difficulty, session); }, 500);
      return;
    }
    if (subEl()) subEl().textContent = `Word ${idx + 1} / ${session.words.length}`;
    if (flashEl()) flashEl().textContent = session.words[idx];
    idx += 1;
    setTimeout(tick, flashMs);
  };
  setTimeout(tick, 600);
}

function renderMemoryRecallForm(area, difficulty, session) {
  const recallSec = Math.max(15, session.words.length * 4);
  praxStartRoundTimer(recallSec, () => {
    const btn = document.getElementById("memory-submit");
    if (btn && !btn.disabled) btn.click();
  });
  if (session.requireOrder) {
    const pool = praxShuffle([...session.words, ...session.distractors]);
    const order = [];
    area.innerHTML = `
      <div class="prax-game-prompt">Rebuild the order</div>
      <div class="prax-game-sub">Tap words in the sequence you saw</div>
      <div class="prax-memory-order" id="memory-order"></div>
      <div class="prax-game-options" id="memory-pool">${pool.map(w =>
        `<button type="button" class="prax-chip" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join("")}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;">
        <button type="button" class="prax-game-btn secondary" id="memory-undo">Undo last</button>
        <button type="button" class="prax-game-btn primary" id="memory-submit">Submit</button>
      </div>`;
    const orderEl = document.getElementById("memory-order");
    const chips = [...document.querySelectorAll("#memory-pool .prax-chip")];
    document.querySelectorAll("#memory-pool .prax-chip").forEach(chip => {
      chip.onclick = () => {
        if (chip.classList.contains("used")) return;
        chip.classList.add("used");
        order.push(chip.dataset.word);
        const tag = document.createElement("span");
        tag.className = "prax-chip selected";
        tag.textContent = chip.dataset.word;
        orderEl.appendChild(tag);
      };
    });
    document.getElementById("memory-undo").onclick = () => {
      if (!order.length) return;
      const last = order.pop();
      orderEl.lastElementChild?.remove();
      chips.find(c => c.dataset.word === last && c.classList.contains("used"))?.classList.remove("used");
    };
    document.getElementById("memory-submit").onclick = async () => {
      const btn = document.getElementById("memory-submit");
      btn.disabled = true;
      praxClearRoundTimer();
      let score = 0;
      session.words.forEach((w, i) => { if (order[i] === w) score += 1; });
      const perfect = score === session.words.length;
      if (perfect) {
        praxUpdateCombo(true);
        praxScorePopup(praxDisplayPoints(1, 0.5));
      } else {
        praxUpdateCombo(false);
      }
      await submitPracticeResult("memory", difficulty, score, session.words.length, { picked: order, ordered: true },
        area, `Order was: ${session.words.join(" → ")}.`,
        { maxCombo: PRAX_STAGE.maxCombo, vocabLearn: praxVocabLearnHtml(session.words, session.glosses) });
    };
    return;
  }
  const pool = praxShuffle([...session.words, ...session.distractors]);
  area.innerHTML = `
    <div class="prax-game-prompt">Which words appeared?</div>
    <div class="prax-game-sub">Wrong picks cost a point</div>
    <div class="prax-game-options">${pool.map(w =>
      `<button type="button" class="prax-chip memory-chip" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join("")}</div>
    <button type="button" class="prax-game-btn primary" id="memory-submit" style="margin-top:14px;">Submit</button>`;
  document.querySelectorAll(".memory-chip").forEach(chip => {
    chip.onclick = () => chip.classList.toggle("selected");
  });
  document.getElementById("memory-submit").onclick = async () => {
    const btn = document.getElementById("memory-submit");
    btn.disabled = true;
    praxClearRoundTimer();
    const picked = Array.from(document.querySelectorAll(".memory-chip.selected")).map(c => c.dataset.word);
    const correctSet = new Set(session.words);
    const hits = picked.filter(w => correctSet.has(w)).length;
    const misses = picked.length - hits;
    const score = Math.max(0, hits - misses);
    const perfect = score === session.words.length;
    if (perfect) {
      praxUpdateCombo(true);
      praxScorePopup(praxDisplayPoints(hits, 0.4));
    } else {
      praxUpdateCombo(false);
      if (hits > 0) praxScorePopup(praxDisplayPoints(hits, 0.2));
    }
    await submitPracticeResult("memory", difficulty, score, session.words.length, { picked },
      area, `${hits} right, ${misses} wrong. List: ${session.words.join(", ")}.`,
      { maxCombo: PRAX_STAGE.maxCombo, vocabLearn: praxVocabLearnHtml(session.words, session.glosses) });
  };
}

function renderMathGame(area, difficulty, round) {
  const problems = praxBuildMathSession(round, difficulty);
  let index = 0;
  let correct = 0;
  const times = [];
  let answered = false;
  praxStageSetMidRound(true);

  const showQuestion = () => {
    if (index >= problems.length) {
      finishSession();
      return;
    }
    answered = false;
    const p = problems[index];
    const qSec = praxMathQuestionTimerSec(difficulty);
    const started = performance.now();
    area.innerHTML = `
      <div class="prax-game-progress">Question ${index + 1} / ${problems.length}</div>
      <div class="prax-game-prompt" id="math-prompt">${escapeHtml(p.question)} = ?</div>
      <input type="number" class="prax-game-input" id="math-answer" autocomplete="off">
      <div class="prax-math-feedback" id="math-feedback" hidden></div>
      <button type="button" class="prax-game-btn primary" id="math-submit" style="margin-top:14px;">Go</button>`;
    const submit = (timedOut) => {
      if (answered) return;
      answered = true;
      praxClearRoundTimer();
      const raw = document.getElementById("math-answer").value;
      const val = raw === "" ? null : Number(raw);
      const isCorrect = !timedOut && val === p.answer;
      const elapsed = (performance.now() - started) / 1000;
      times.push(elapsed);
      praxLogGameplay({ game: "math", qIdx: index, correct: isCorrect, ms: elapsed * 1000, difficulty });
      const fb = document.getElementById("math-feedback");
      const prompt = document.getElementById("math-prompt");
      if (fb) {
        fb.hidden = false;
        fb.textContent = isCorrect ? "Clean hit." : `Answer was ${p.answer}`;
        fb.style.color = isCorrect ? "#65a30d" : "#e11d48";
      }
      if (prompt) prompt.style.color = isCorrect ? "#65a30d" : "#e11d48";
      if (isCorrect) {
        correct += 1;
        const left = Math.max(0, PRAX_STAGE.timerEnd - performance.now()) / (qSec * 1000);
        praxUpdateCombo(true);
        praxScorePopup(praxDisplayPoints(1, left));
      } else {
        praxUpdateCombo(false);
      }
      index += 1;
      setTimeout(showQuestion, isCorrect ? 320 : 720);
    };
    praxStartRoundTimer(qSec, () => submit(true));
    document.getElementById("math-submit").onclick = () => submit(false);
    document.getElementById("math-answer").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); submit(false); }
    });
    document.getElementById("math-answer").focus();
  };

  const finishSession = async () => {
    praxClearRoundTimer();
    const avgTimeSec = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    await submitPracticeResult("math", difficulty, correct, problems.length, { correct, total: problems.length },
      area, `${correct}/${problems.length} correct.`, { maxCombo: PRAX_STAGE.maxCombo, avgTimeSec });
  };
  showQuestion();
}

function renderLogicGame(area, difficulty, round) {
  const puzzles = praxBuildLogicSession(round, difficulty);
  let index = 0;
  let correct = 0;
  const times = [];
  let locked = false;
  praxStageSetMidRound(true);

  const showPuzzle = () => {
    if (index >= puzzles.length) {
      finishSession();
      return;
    }
    locked = false;
    const p = puzzles[index];
    const timerSec = praxLogicTimerSec(difficulty);
    const started = performance.now();
    const clueList = p.clues.map(c => `<li>${escapeHtml(c)}</li>`).join("");
    const optionButtons = p.options.map(o =>
      `<button type="button" class="prax-game-btn logic-option" data-option="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("");
    area.innerHTML = `
      <div class="prax-game-progress">Puzzle ${index + 1} / ${puzzles.length}</div>
      <ul class="prax-game-clues">${clueList}</ul>
      <div class="prax-game-prompt" style="font-size:clamp(20px,3.5vw,30px);">${escapeHtml(p.question)}</div>
      <div class="prax-game-options">${optionButtons}</div>`;
    const handle = (chosen, timedOut) => {
      if (locked) return;
      locked = true;
      praxClearRoundTimer();
      const isCorrect = !timedOut && chosen === p.answer;
      const elapsed = (performance.now() - started) / 1000;
      times.push(elapsed);
      praxLogGameplay({ game: "logic", qIdx: index, correct: isCorrect, ms: elapsed * 1000, difficulty });
      praxMarkAnswerButtons(".logic-option", p.answer, chosen, "option");
      if (isCorrect) {
        correct += 1;
        const left = Math.max(0, PRAX_STAGE.timerEnd - performance.now()) / (timerSec * 1000);
        praxUpdateCombo(true);
        praxScorePopup(praxDisplayPoints(1, left));
      } else {
        praxUpdateCombo(false);
      }
      index += 1;
      setTimeout(showPuzzle, isCorrect ? 350 : 550);
    };
    praxStartRoundTimer(timerSec, () => handle(null, true));
    document.querySelectorAll(".logic-option").forEach(btn => {
      btn.onclick = () => handle(btn.dataset.option, false);
    });
  };

  const finishSession = async () => {
    praxClearRoundTimer();
    const avgTimeSec = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    await submitPracticeResult("logic", difficulty, correct, puzzles.length,
      { correct, choices: puzzles.length }, area,
      `${correct}/${puzzles.length} solved.`, { maxCombo: PRAX_STAGE.maxCombo, avgTimeSec });
  };
  showPuzzle();
}

function renderTimeEstimationGame(area, difficulty, round) {
  praxStageSetMidRound(true);
  let decoyIv = null;
  area.innerHTML = `
    <div class="prax-game-prompt">Time estimation</div>
    <div class="prax-game-sub">Target: <strong>${escapeHtml(round.target_seconds)} seconds</strong></div>
    <div class="prax-game-sub">No clock during the wait — trust your gut.</div>
    <button type="button" class="prax-game-btn primary" id="time-start">Start</button>`;
  document.getElementById("time-start").onclick = () => {
    const startedAt = performance.now();
    area.innerHTML = `
      <div class="prax-game-prompt">Feel the time...</div>
      <div class="prax-game-sub">Click Stop when ${escapeHtml(round.target_seconds)}s has passed</div>
      <button type="button" class="prax-game-btn primary" id="time-stop">Stop</button>`;
    if (difficulty >= 5 && PRAX_STAGE && !PRAX_REDUCE_MOTION) {
      const fx = PRAX_STAGE.fx;
      const glyphs = ["\u23F1", "\u23F2", "\u2728", "\u26A1", "\u25CF", "\u25B2"];
      decoyIv = setInterval(() => {
        const d = document.createElement("div");
        d.className = "prax-decoy";
        d.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
        d.style.left = (10 + Math.random() * 80) + "%";
        d.style.top = (15 + Math.random() * 70) + "%";
        d.style.setProperty("--dx", (Math.random() * 80 - 40) + "px");
        d.style.setProperty("--dy", (Math.random() * 60 - 30) + "px");
        fx.appendChild(d);
        setTimeout(() => d.remove(), 1500);
      }, 450 + Math.random() * 350);
      praxStageOnCleanup(() => clearInterval(decoyIv));
    }
    document.getElementById("time-stop").onclick = async () => {
      if (decoyIv) clearInterval(decoyIv);
      praxStageSetMidRound(false);
      const elapsed = (performance.now() - startedAt) / 1000;
      const tolerance = Math.max(1.0, round.target_seconds * 0.15);
      const diff = Math.abs(round.target_seconds - elapsed);
      const score = Math.max(0, Math.round(10 * (1 - Math.min(1, diff / (tolerance * 3)))));
      const great = score >= 8;
      if (great) { praxUpdateCombo(true); praxScorePopup(praxDisplayPoints(score, 0.3)); }
      else praxUpdateCombo(false);
      await submitPracticeResult("time_estimation", difficulty, score, 10,
        { elapsed: Math.round(elapsed * 10) / 10 }, area,
        `Target ${round.target_seconds}s — you stopped at ${elapsed.toFixed(1)}s.`,
        { maxCombo: PRAX_STAGE.maxCombo, avgTimeSec: elapsed });
    };
  };
}
