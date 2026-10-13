// Waypoint game shell: Coin Road, gem unlocks, daily pursuit picker, loot, and skins.
// Coins remain server-backed practice points. This layer only persists claims/unlocks locally.
(function waypointLootShell() {
  "use strict";

  const STORAGE_KEY = "waypointLootStateV1";
  const LOOT_RESET_ACK_KEY = "waypointLootResetAck";

  function lootResetAck() {
    try { return localStorage.getItem(LOOT_RESET_ACK_KEY) || ""; } catch (_) { return ""; }
  }
  const COIN_HIGH_WATER_KEY = "waypointCoinHighWater";
  const COIN_SOURCE_HIGH_WATER_KEY = "waypointCoinSourceHighWaterV2";
  const COIN_SCALE_VERSION_KEY = "waypointCoinRoadScaleVersion";
  const DAILY_META_KEY = "waypointDailyMetaV1";
  const CUSTOM_SKINS_KEY = "waypointCustomSkinsV1";
  const SKIN_TUTORIAL_KEY = "lootSkinTutorialSeen";
  const LOOT_COIN_KEY = "waypointLootCoinBonusV1";
  const SOUND_MUTE_KEY = "waypointLootSoundsMuted";
  const PITY_LIMITS = { rare: 20, epic: 50, legendary: 80, world: 150 };
  const GEM_CAP_KEY = "waypointGemCapV1";
  const GEM_DAILY_CAP = 12;
  const GEM_WEEKLY_CAP = 40;
  const CUSTOM_SKIN_LIMIT = 30;
  const COIN_ROAD_SCALE = 20;
  const COIN_ROAD_SCALE_VERSION = 3;
  const MYTHIC_PIECE_IDS = ["phantom", "royal", "prism", "moon"];
  const MYTHIC_PIECES_REQUIRED = 8;
  const SKIN_EFFECTS = ["none", "glow", "ember", "frost", "aurora", "volt", "prism", "tide", "void", "bloom", "sand", "signal", "pulse", "sparkle", "magma", "chrome"];
  const SKIN_PATTERNS = ["none", "dots", "grid", "stripes", "diagonal", "rings", "hex", "waves", "stars"];
  const CHEST_RARITIES = ["common", "rare", "epic", "legendary"];
  const CHEST_TAPS = { common: 3, rare: 4, epic: 5, legendary: 8 };
  const CUSTOM_SKIN_EFFECTS = ["bloom", "glow", "aurora", "pulse", "tide", "prism"];
  const LOCKER_FILTERS = [
    ["all", "All"],
    ["common", "Common"],
    ["rare", "Rare"],
    ["epic", "Epic"],
    ["legendary", "Legendary"],
    ["mythic", "Mythic"],
    ["world", "World"],
    ["custom", "Custom"],
  ];
  const REDUCED_MOTION = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const LOOT_POWERS = {
    trailblazer: { coin: 1, label: "Starter kit — play to mint coins" },
    emberwing: { coin: 1.18, label: "Forge yield +18% coins from play" },
    ember: { coin: 1.18, label: "Forge yield +18% coins from play" },
    solar: { coin: 1.1, label: "Solar mint +10% coins from play" },
    volt: { depth: 2, label: "Arcade thinks a ply deeper" },
    frost: { pity: 2, label: "Pity climbs a little faster" },
    aurora: { forecast: 3, label: "+3 forecast days" },
    forest: { paint: 0.25, label: "Painted hours mint more" },
    moss: { paint: 0.2, label: "Living yield on paint" },
    tide: { label: "Tidekeeper: cart finds cheaper" },
    void: { rag: 8, label: "Void map: deeper napkin RAG" },
    prism: { coin: 1.25, forecast: 7, label: "Sovereign coins + forecast" },
    neon: { label: "Neon: HUD pulse on complete" },
    gold: { coin: 1.2, label: "Gold standard +20% coins" },
    magma: { extraPrize: 1, label: "Caches drop an extra common prize" },
    chrome: { label: "Chrome: HUD stays quiet" },
  };
  let lootSyncPulling = false;
  let lootFormulaCache = null;
  let memeUnlocks = {};

  function gameFeaturesHidden() {
    try {
      const hide = localStorage.getItem("wp-hide-game");
      if (hide === "1" || hide === "on" || hide === "true") return true;
      if (localStorage.getItem("waypointGameOff") === "on") return true;
    } catch (_) {}
    const root = document.documentElement;
    const body = document.body;
    if (root?.hasAttribute("wp-hide-game") || body?.hasAttribute("wp-hide-game")) return true;
    if (root?.dataset?.hideGame === "1" || root?.dataset?.hideGame === "on") return true;
    if (body?.classList?.contains("wp-hide-game") || body?.classList?.contains("game-off")) return true;
    return false;
  }

  function lootQuietCfg() {
    return window.WaypointNapkinIssues?.lootQuiet || {
      max_daily_chests: 1,
      hide_ticket_window: true,
      road_chest_every: 5,
    };
  }

  function hideTicketWindow() {
    return lootQuietCfg().hide_ticket_window !== false;
  }

  const SKINS = {
    trailblazer: { id: "trailblazer", name: "Trailblazer", glyph: "🧭", rarity: "starter", note: "The original Waypoint field kit.", colorA: "#d97706", colorB: "#7c2d12", effect: "none" },
    moss: { id: "moss", name: "Mossbound", glyph: "🌿", rarity: "common", note: "A living green shell found in caches.", colorA: "#65a30d", colorB: "#14532d", effect: "bloom" },
    solar: { id: "solar", name: "Solar Vanguard", glyph: "☀️", rarity: "rare", note: "Claimed from the long Coin Road.", colorA: "#facc15", colorB: "#ea580c", effect: "glow" },
    void: { id: "void", name: "Void Cartographer", glyph: "🌌", rarity: "epic", note: "A mapmaker from beyond the last waypoint.", colorA: "#8b5cf6", colorB: "#1e1b4b", effect: "void" },
    aurora: { id: "aurora", name: "Aurora Scout", glyph: "🌈", rarity: "rare", note: "A teal curtain over arctic night. One light, not a rainbow.", colorA: "#2dd4bf", colorB: "#0b1220", effect: "aurora" },
    tide: { id: "tide", name: "Tidekeeper", glyph: "🌊", rarity: "epic", note: "A deep-water navigator earned on the outer road.", colorA: "#38bdf8", colorB: "#164e63", effect: "tide" },
    emberwing: { id: "emberwing", name: "Emberwing", glyph: "🦅", rarity: "rare", note: "Forge-born wings for a relentless route.", colorA: "#fb923c", colorB: "#991b1b", effect: "ember" },
    frost: { id: "frost", name: "Frost Relay", glyph: "❄️", rarity: "epic", note: "Recovered with the mixed expedition pack.", colorA: "#bae6fd", colorB: "#1d4ed8", effect: "frost" },
    prism: { id: "prism", name: "Prism Sovereign", glyph: "🔷", rarity: "mythic", note: "The final signal at the edge of Coin Road.", colorA: "#e879f9", colorB: "#0e7490", effect: "prism" },
    cobalt: { id: "cobalt", name: "Cobalt Courier", glyph: "🛰️", rarity: "rare", note: "A clean blue signal carried across the long route.", colorA: "#38bdf8", colorB: "#1e3a8a", effect: "signal" },
    sakura: { id: "sakura", name: "Sakura Pathfinder", glyph: "🌸", rarity: "rare", note: "Soft petals, sharp bearings, steady progress.", colorA: "#f9a8d4", colorB: "#9d174d", effect: "bloom" },
    dune: { id: "dune", name: "Dune Surveyor", glyph: "🏜️", rarity: "common", note: "Sun-warmed field gear for long expeditions.", colorA: "#fbbf24", colorB: "#92400e", effect: "sand" },
    volt: { id: "volt", name: "Volt Runner", glyph: "⚡", rarity: "epic", note: "A live-wire profile forged from focused practice.", colorA: "#a3e635", colorB: "#0f766e", effect: "volt" },
    moon: { id: "moon", name: "Moon Archive", glyph: "🌙", rarity: "mythic", note: "A quiet midnight map of every waypoint crossed.", colorA: "#c4b5fd", colorB: "#312e81", effect: "pulse" },
    forest: { id: "forest", name: "Canopy Ranger", glyph: "🌲", rarity: "common", note: "Reads every trail beneath the green canopy.", colorA: "#22c55e", colorB: "#166534", effect: "bloom" },
    cinder: { id: "cinder", name: "Ashen Pilot", glyph: "🔥", rarity: "rare", note: "Keeps a bright bearing through drifting ash.", colorA: "#f59e0b", colorB: "#1c1917", effect: "ember" },
    glacier: { id: "glacier", name: "Glacier Warden", glyph: "🧊", rarity: "epic", note: "Guards a route cut through ancient blue ice.", colorA: "#7dd3fc", colorB: "#1e40af", effect: "frost" },
    neon: { id: "neon", name: "Neon Drifter", glyph: "💡", rarity: "rare", note: "One cyan tube on wet brick. No second chroma.", colorA: "#22d3ee", colorB: "#1a1412", effect: "signal" },
    copper: { id: "copper", name: "Copper Scout", glyph: "⚙️", rarity: "common", note: "A burnished field rig built to age well.", colorA: "#d97706", colorB: "#78350f", effect: "glow" },
    ivory: { id: "ivory", name: "Ivory Atlas", glyph: "🕊️", rarity: "common", note: "A calm, bright chart with timeless lines.", colorA: "#fef3c7", colorB: "#a16207", effect: "none" },
    obsidian: { id: "obsidian", name: "Obsidian Rift", glyph: "🪨", rarity: "epic", note: "Black glass armor from a lightless crossing.", colorA: "#64748b", colorB: "#020617", effect: "void" },
    jade: { id: "jade", name: "Jade Sentinel", glyph: "🐉", rarity: "rare", note: "A patient guardian tuned to living currents.", colorA: "#34d399", colorB: "#065f46", effect: "aurora" },
    ruby: { id: "ruby", name: "Ruby Vanguard", glyph: "♦️", rarity: "rare", note: "A red-hot standard for decisive expeditions.", colorA: "#fb7185", colorB: "#881337", effect: "glow" },
    sapphire: { id: "sapphire", name: "Sapphire Signal", glyph: "🔹", rarity: "rare", note: "A deep-blue beacon that never loses range.", colorA: "#60a5fa", colorB: "#1e3a8a", effect: "signal" },
    amber: { id: "amber", name: "Amber Nomad", glyph: "🟠", rarity: "common", note: "Carries a pocket sunset across open ground.", colorA: "#f59e0b", colorB: "#92400e", effect: "sand" },
    slate: { id: "slate", name: "Slate Mechanic", glyph: "🔩", rarity: "common", note: "Practical plating for routes that need repair.", colorA: "#94a3b8", colorB: "#334155", effect: "none" },
    coral: { id: "coral", name: "Coral Voyager", glyph: "🪸", rarity: "rare", note: "Charts bright reefs and hidden blue channels.", colorA: "#f43f5e", colorB: "#155e75", effect: "tide" },
    midnight: { id: "midnight", name: "Midnight Crown", glyph: "🌃", rarity: "mythic", note: "Rules the quiet hour when every path glows.", colorA: "#6366f1", colorB: "#111827", effect: "void" },
    sunrise: { id: "sunrise", name: "Sunrise Herald", glyph: "🌅", rarity: "rare", note: "Announces a fresh route in gold and rose.", colorA: "#fbbf24", colorB: "#e11d48", effect: "glow" },
    storm: { id: "storm", name: "Storm Chaser", glyph: "🌩️", rarity: "epic", note: "Gold fork over open grassland. A chase, not a forecast.", colorA: "#e6c35a", colorB: "#15253c", effect: "volt" },
    orchard: { id: "orchard", name: "Orchard Keeper", glyph: "🍎", rarity: "common", note: "Tends patient progress one harvest at a time.", colorA: "#84cc16", colorB: "#9f1239", effect: "bloom" },
    magma: { id: "magma", name: "Magma Delver", glyph: "🌋", rarity: "epic", note: "Maps the molten roads beneath the mountain.", colorA: "#ef4444", colorB: "#7c2d12", effect: "ember" },
    mist: { id: "mist", name: "Mist Walker", glyph: "🌫️", rarity: "common", note: "Finds the next marker before the fog lifts.", colorA: "#cbd5e1", colorB: "#475569", effect: "frost" },
    quartz: { id: "quartz", name: "Quartz Lens", glyph: "🔮", rarity: "rare", note: "Splits a single intention into clear directions.", colorA: "#e9d5ff", colorB: "#7e22ce", effect: "prism" },
    iris: { id: "iris", name: "Iris Seeker", glyph: "🪻", rarity: "epic", note: "Tracks shifting color over the horizon.", colorA: "#c084fc", colorB: "#4f46e5", effect: "aurora" },
    bronze: { id: "bronze", name: "Bronze Pathfinder", glyph: "🥉", rarity: "common", note: "Old-world metal made for a new expedition.", colorA: "#b45309", colorB: "#713f12", effect: "sand" },
    silver: { id: "silver", name: "Silver Relay", glyph: "🥈", rarity: "rare", note: "Passes a cool signal from waypoint to waypoint.", colorA: "#cbd5e1", colorB: "#334155", effect: "pulse" },
    gold: { id: "gold", name: "Gold Standard", glyph: "🥇", rarity: "epic", note: "A radiant marker earned far down the road.", colorA: "#fde047", colorB: "#a16207", effect: "glow" },
    carbon: { id: "carbon", name: "Carbon Runner", glyph: "🏁", rarity: "rare", note: "Light, fast, and built for repeated routes.", colorA: "#475569", colorB: "#111827", effect: "pulse" },
    kelp: { id: "kelp", name: "Kelp Diver", glyph: "🐚", rarity: "common", note: "Moves with the green current below the surface.", colorA: "#2dd4bf", colorB: "#134e4a", effect: "tide" },
    prairie: { id: "prairie", name: "Prairie Scout", glyph: "🌾", rarity: "common", note: "Keeps a low horizon across endless grass.", colorA: "#a3e635", colorB: "#4d7c0f", effect: "sand" },
    canyon: { id: "canyon", name: "Canyon Guide", glyph: "🧗", rarity: "rare", note: "Knows every switchback in the red stone.", colorA: "#fb923c", colorB: "#9a3412", effect: "sand" },
    polar: { id: "polar", name: "Polar Beacon", glyph: "🐻‍❄️", rarity: "epic", note: "Burns ice-blue at the top of the world.", colorA: "#e0f2fe", colorB: "#0369a1", effect: "frost" },
    tropic: { id: "tropic", name: "Tropic Courier", glyph: "🥥", rarity: "rare", note: "Carries warm dispatches across island routes.", colorA: "#4ade80", colorB: "#0f766e", effect: "tide" },
    metro: { id: "metro", name: "Metro Pulse", glyph: "🚇", rarity: "common", note: "Times every transfer to the city heartbeat.", colorA: "#f43f5e", colorB: "#312e81", effect: "pulse" },
    arcade: { id: "arcade", name: "Arcade Specter", glyph: "🕹️", rarity: "epic", note: "A chromatic ghost from a cabinet after dark.", colorA: "#22d3ee", colorB: "#9333ea", effect: "prism" },
    zen: { id: "zen", name: "Zen Wayfinder", glyph: "🪷", rarity: "epic", note: "Finds momentum inside a moment of stillness.", colorA: "#f0abfc", colorB: "#0f766e", effect: "bloom" },
    scrap: { id: "scrap", name: "Scrap Tinkerer", glyph: "🛠️", rarity: "common", note: "Builds a working compass from spare parts.", colorA: "#c4b5a5", colorB: "#3f3a36", effect: "signal" },
    royal: { id: "royal", name: "Royal Meridian", glyph: "👑", rarity: "mythic", note: "Marks the line every grand expedition follows.", colorA: "#facc15", colorB: "#6b21a8", effect: "prism" },
    phantom: { id: "phantom", name: "Phantom Compass", glyph: "👻", rarity: "mythic", note: "Points toward paths that appear only at dusk.", colorA: "#a5b4fc", colorB: "#312e81", effect: "void" },
    linen: { id: "linen", name: "Linen Ledger", glyph: "🧻", rarity: "common", note: "A paper-quiet field journal.", colorA: "#f5e6cc", colorB: "#8a7048", effect: "none", pattern: "dots", place: "hud,page" },
    ink: { id: "ink", name: "Ink Courier", glyph: "🖋️", rarity: "common", note: "Leaves a wet-black trail on every chip.", colorA: "#1e293b", colorB: "#334155", effect: "signal", pattern: "stripes", place: "hud,chip" },
    honey: { id: "honey", name: "Honey Route", glyph: "🍯", rarity: "common", note: "Warm amber that sticks to the page.", colorA: "#f59e0b", colorB: "#b45309", effect: "sand", pattern: "hex", place: "page,chip" },
    pine: { id: "pine", name: "Pine Marker", glyph: "🎄", rarity: "common", note: "A resin-scented forest heading.", colorA: "#166534", colorB: "#14532d", effect: "bloom", pattern: "grid", place: "hud,page,companion" },
    pebble: { id: "pebble", name: "Pebble Survey", glyph: "🪨", rarity: "common", note: "Small stones, honest bearings.", colorA: "#a8a29e", colorB: "#57534e", effect: "none", pattern: "rings", place: "hud,page" },
    lagoon: { id: "lagoon", name: "Lagoon Pilot", glyph: "🚤", rarity: "rare", note: "Cuts a teal wake across Today.", colorA: "#22d3ee", colorB: "#0f766e", effect: "tide", pattern: "waves", place: "hud,page,companion" },
    emberglass: { id: "emberglass", name: "Emberglass", glyph: "🪟", rarity: "rare", note: "Hot glass windows for the HUD.", colorA: "#fb7185", colorB: "#9a3412", effect: "ember", pattern: "diagonal", place: "hud,chip" },
    comet: { id: "comet", name: "Comet Thread", glyph: "☄️", rarity: "rare", note: "A sparkle that actually trails the cursor chip.", colorA: "#fde68a", colorB: "#7c3aed", effect: "sparkle", pattern: "stars", place: "hud,page,chip" },
    rust: { id: "rust", name: "Rust Cart", glyph: "🚃", rarity: "common", note: "Oxidized iron for long hauls.", colorA: "#c2410c", colorB: "#7c2d12", effect: "sand", pattern: "stripes", place: "page" },
    lilac: { id: "lilac", name: "Lilac Watch", glyph: "💜", rarity: "rare", note: "Soft petals on the companion orb.", colorA: "#d8b4fe", colorB: "#6d28d9", effect: "bloom", pattern: "dots", place: "companion,chip" },
    basil: { id: "basil", name: "Basil Scout", glyph: "🥗", rarity: "common", note: "Kitchen-green notes on the page.", colorA: "#bbf7d0", colorB: "#3f6212", effect: "bloom", pattern: "hex", place: "page,chip" },
    thunder: { id: "thunder", name: "Thunder Kite", glyph: "🪁", rarity: "epic", note: "Steps the HUD in storm-yellow bursts.", colorA: "#facc15", colorB: "#1e3a8a", effect: "volt", pattern: "diagonal", place: "hud,page,chip" },
    opal: { id: "opal", name: "Opal Lens", glyph: "🪩", rarity: "rare", note: "Splits calendar days into mineral fire.", colorA: "#fbcfe8", colorB: "#0ea5e9", effect: "prism", pattern: "rings", place: "calendar,hud" },
    merlot: { id: "merlot", name: "Merlot Archive", glyph: "🍷", rarity: "rare", note: "A late-room red for quiet work.", colorA: "#9f1239", colorB: "#4c0519", effect: "glow", pattern: "none", place: "hud,page" },
    frostbite: { id: "frostbite", name: "Frostbite Relay", glyph: "🥶", rarity: "epic", note: "Ice crystals collect on the pulse row.", colorA: "#e0f2fe", colorB: "#1d4ed8", effect: "frost", pattern: "grid", place: "hud,pulse" },
    sunflower: { id: "sunflower", name: "Sunflower Post", glyph: "🌻", rarity: "common", note: "A bright facing for morning HUD.", colorA: "#fde047", colorB: "#ca8a04", effect: "glow", pattern: "dots", place: "hud,chip" },
    abyssal: { id: "abyssal", name: "Abyssal Chart", glyph: "🐙", rarity: "epic", note: "The page goes lightless except the route.", colorA: "#312e81", colorB: "#020617", effect: "void", pattern: "waves", place: "page,companion" },
    candyfloss: { id: "candyfloss", name: "Candyfloss Drift", glyph: "🍭", rarity: "rare", note: "Sugar-sparkle on chips and companion.", colorA: "#f9a8d4", colorB: "#db2777", effect: "sparkle", pattern: "stars", place: "chip,companion" },
    brass: { id: "brass", name: "Brass Bell", glyph: "🔔", rarity: "common", note: "A warm metal rim around the HUD.", colorA: "#eab308", colorB: "#854d0e", effect: "glow", pattern: "rings", place: "hud" },
    onyx: { id: "onyx", name: "Onyx Gate", glyph: "⬛", rarity: "epic", note: "Black stone that swallows page glare.", colorA: "#0f172a", colorB: "#111827", effect: "void", pattern: "grid", place: "page,hud" },
    seafoam: { id: "seafoam", name: "Seafoam Courier", glyph: "🫧", rarity: "rare", note: "Foam rings ride the companion orb.", colorA: "#99f6e4", colorB: "#0f766e", effect: "tide", pattern: "rings", place: "companion,page" },
    paprika: { id: "paprika", name: "Paprika Mile", glyph: "🌶️", rarity: "common", note: "A spice-red tick on every chip.", colorA: "#ea580c", colorB: "#9a3412", effect: "ember", pattern: "diagonal", place: "chip,page" },
    nimbus: { id: "nimbus", name: "Nimbus Walk", glyph: "☁️", rarity: "rare", note: "Soft cloud banding across Today.", colorA: "#f1f5f9", colorB: "#7dd3fc", effect: "frost", pattern: "waves", place: "page,pulse" },
    voltage: { id: "voltage", name: "Voltage Spine", glyph: "🔌", rarity: "epic", note: "The HUD flickers like a live rail.", colorA: "#bef264", colorB: "#365314", effect: "volt", pattern: "stripes", place: "hud,chip" },
    cherry: { id: "cherry", name: "Cherry Beacon", glyph: "🍒", rarity: "rare", note: "A candy-red pulse on quest chips.", colorA: "#fb7185", colorB: "#be123c", effect: "glow", pattern: "dots", place: "chip,hud" },
    eucalyptus: { id: "eucalyptus", name: "Eucalyptus Fold", glyph: "🍃", rarity: "common", note: "Cool green paper for long reading.", colorA: "#6ee7b7", colorB: "#047857", effect: "bloom", pattern: "hex", place: "page" },
    marble: { id: "marble", name: "Marble Terminal", glyph: "🏛️", rarity: "rare", note: "Chrome-veined stone on the calendar.", colorA: "#f8fafc", colorB: "#94a3b8", effect: "chrome", pattern: "grid", place: "calendar,hud" },
    magmaheart: { id: "magmaheart", name: "Magmaheart", glyph: "🫀", rarity: "legendary", note: "A rare core that paints the whole page lava.", colorA: "#f97316", colorB: "#7f1d1d", effect: "magma", pattern: "waves", place: "hud,page,chip,companion" },
    starlit: { id: "starlit", name: "Starlit Archive", glyph: "✨", rarity: "legendary", note: "Night-sky sparkle reserved for true finds.", colorA: "#c4b5fd", colorB: "#1e1b4b", effect: "sparkle", pattern: "stars", place: "hud,page,companion,chip" },
    chrome: { id: "chrome", name: "Chrome Runner", glyph: "🪞", rarity: "epic", note: "Mirror plating on HUD and chips.", colorA: "#e2e8f0", colorB: "#475569", effect: "chrome", pattern: "stripes", place: "hud,chip" },
    wisteria: { id: "wisteria", name: "Wisteria Span", glyph: "🌺", rarity: "rare", note: "Violet curtains over the companion.", colorA: "#ddd6fe", colorB: "#6d28d9", effect: "aurora", pattern: "diagonal", place: "companion,page" },
    terracotta: { id: "terracotta", name: "Terracotta Mile", glyph: "🧱", rarity: "common", note: "Baked clay borders on the page.", colorA: "#fdba74", colorB: "#9a3412", effect: "sand", pattern: "grid", place: "page,chip" },
    iceberg: { id: "iceberg", name: "Iceberg Crown", glyph: "🧊", rarity: "epic", note: "A cold halo around the top HUD.", colorA: "#bae6fd", colorB: "#0c4a6e", effect: "frost", pattern: "hex", place: "hud,page" },
    venom: { id: "venom", name: "Venom Signal", glyph: "🦂", rarity: "epic", note: "Acid-green ticks that bite the HUD.", colorA: "#a3e635", colorB: "#365314", effect: "volt", pattern: "dots", place: "hud,chip" },
    pearl: { id: "pearl", name: "Pearl Switch", glyph: "⚪", rarity: "rare", note: "Soft chrome sheen on calendar cells.", colorA: "#f8fafc", colorB: "#cbd5e1", effect: "chrome", pattern: "rings", place: "calendar,chip" },
    eclipse: { id: "eclipse", name: "Eclipse Meridian", glyph: "🌑", rarity: "legendary", note: "Rare total dark with a gold rim.", colorA: "#facc15", colorB: "#020617", effect: "void", pattern: "rings", place: "hud,page,chip,companion" },
    harvest: { id: "harvest", name: "Harvest Flag", glyph: "🌽", rarity: "common", note: "Autumn gold along the page edge.", colorA: "#fbbf24", colorB: "#b45309", effect: "sand", pattern: "stripes", place: "page" },
    reef: { id: "reef", name: "Reef Cartographer", glyph: "🐠", rarity: "rare", note: "Living color on the companion orb.", colorA: "#2dd4bf", colorB: "#155e75", effect: "tide", pattern: "hex", place: "companion,page,chip" },
    nova: { id: "nova", name: "Nova Key", glyph: "🌟", rarity: "legendary", note: "A prism burst almost never found in caches.", colorA: "#fde68a", colorB: "#db2777", effect: "prism", pattern: "stars", place: "hud,page,chip,companion,calendar" },
    incense: { id: "incense", name: "Incense Hall", glyph: "🎐", rarity: "rare", note: "Smoke-bloom along Hub chips.", colorA: "#f5d0fe", colorB: "#86198f", effect: "bloom", pattern: "waves", place: "chip,page" },
    tungsten: { id: "tungsten", name: "Tungsten Rail", glyph: "🚂", rarity: "epic", note: "Heavy chrome for a serious HUD.", colorA: "#cbd5e1", colorB: "#1e293b", effect: "chrome", pattern: "stripes", place: "hud,page" },
    blizzard: { id: "blizzard", name: "Blizzard Post", glyph: "🌨️", rarity: "epic", note: "Whiteout frost over pulse and page.", colorA: "#f8fafc", colorB: "#38bdf8", effect: "frost", pattern: "dots", place: "pulse,page,hud" },
    lotus: { id: "lotus", name: "Lotus Relay", glyph: "🪷", rarity: "rare", note: "Still water bloom on the companion.", colorA: "#fbcfe8", colorB: "#9d174d", effect: "bloom", pattern: "rings", place: "companion,chip" },
    cinderfall: { id: "cinderfall", name: "Cinderfall", glyph: "🧨", rarity: "epic", note: "Magma specks fall through the page.", colorA: "#f97316", colorB: "#7c2d12", effect: "magma", pattern: "diagonal", place: "page,hud" },
    auroraveil: { id: "auroraveil", name: "Aurora Veil", glyph: "🎆", rarity: "legendary", note: "A polar curtain almost never in stock.", colorA: "#67e8f9", colorB: "#c084fc", effect: "aurora", pattern: "waves", place: "hud,page,companion,chip" },
    inkstorm: { id: "inkstorm", name: "Inkstorm", glyph: "🌪️", rarity: "epic", note: "A void squall over the whole page.", colorA: "#1e1b4b", colorB: "#0f172a", effect: "void", pattern: "stripes", place: "page,hud" },
    honeycomb: { id: "honeycomb", name: "Honeycomb Plot", glyph: "🐝", rarity: "common", note: "Hex paper for planning hours.", colorA: "#facc15", colorB: "#a16207", effect: "sand", pattern: "hex", place: "page,calendar" },
    satellite: { id: "satellite", name: "Satellite Ping", glyph: "📡", rarity: "rare", note: "A blinking signal on the HUD cluster.", colorA: "#f8fafc", colorB: "#0369a1", effect: "signal", pattern: "grid", place: "hud,chip" },
    relic: { id: "relic", name: "Relic Compass", glyph: "📿", rarity: "legendary", note: "Old gold that remints every surface.", colorA: "#fde047", colorB: "#78350f", effect: "glow", pattern: "rings", place: "hud,page,chip,companion,calendar,pulse" },
    wildfire: { id: "wildfire", name: "Wildfire Map", glyph: "🔥", rarity: "epic", note: "Magma edges crawl the page margin.", colorA: "#fbbf24", colorB: "#7f1d1d", effect: "magma", pattern: "waves", place: "page,hud,chip" },
    cabinet: { id: "cabinet", name: "Cabinet Night", glyph: "🕹️", rarity: "legendary", note: "A full arcade world. Every page becomes a cabinet, not a recolor.", colorA: "#22d3ee", colorB: "#7c3aed", effect: "prism", world: true, pattern: "grid", place: "hud,page,chip,companion,calendar,pulse" },
    parchment: { id: "parchment", name: "Paper Kingdom", glyph: "📜", rarity: "legendary", note: "Torn ledgers, tape, and wax. Home is cork. Today is ruled paper.", colorA: "#f5e6cc", colorB: "#92400e", effect: "sand", world: true, pattern: "dots", place: "hud,page,chip,companion,calendar,pulse" },
    harbor: { id: "harbor", name: "Deep Harbor", glyph: "⚓", rarity: "legendary", note: "Portholes, rope HUD, tide tables. Companion is a lighthouse.", colorA: "#67e8f9", colorB: "#164e63", effect: "tide", world: true, pattern: "waves", place: "hud,page,chip,companion,calendar,pulse" },
    nightmarket: { id: "nightmarket", name: "Night Market", glyph: "🏮", rarity: "mythic", note: "Lantern stalls, steam, hanging signs. A different street on every tab.", colorA: "#fb923c", colorB: "#7f1d1d", effect: "ember", world: true, pattern: "hex", place: "hud,page,chip,companion,calendar,pulse" },
    signalbox: { id: "signalbox", name: "Signal Station", glyph: "📡", rarity: "legendary", note: "Radar Home, phosphor Agent, Morse ticks. The whole desk is a radio.", colorA: "#4ade80", colorB: "#052e16", effect: "signal", world: true, pattern: "grid", place: "hud,page,chip,companion,calendar,pulse" },
    glasshouse: { id: "glasshouse", name: "Glasshouse", glyph: "🌿", rarity: "legendary", note: "Greenhouse panes and fireflies. Each page is a different bed.", colorA: "#86efac", colorB: "#166534", effect: "bloom", world: true, pattern: "hex", place: "hud,page,chip,companion,calendar,pulse" },
    velvet: { id: "velvet", name: "Opera House", glyph: "🎭", rarity: "mythic", note: "Velvet playbills, spotlight Agent, cue-sheet Tasks.", colorA: "#fde68a", colorB: "#4c0519", effect: "glow", world: true, pattern: "rings", place: "hud,page,chip,companion,calendar,pulse" },
    isobar: { id: "isobar", name: "Storm Atlas", glyph: "🌩️", rarity: "legendary", note: "Isobars, lightning, forecast desk. Today is a weather chart.", colorA: "#93c5fd", colorB: "#0b1220", effect: "volt", world: true, pattern: "waves", place: "hud,page,chip,companion,calendar,pulse" },
    retro: { id: "retro", name: "CRT Terminal", glyph: "🖥️", rarity: "legendary", note: "Amber-on-black terminals, scanlines, and a blinking caret. Every page is a 1982 workstation — not a recolor.", colorA: "#fbbf24", colorB: "#1c1917", effect: "signal", world: true, pattern: "grid", place: "hud,page,chip,companion,calendar,pulse" },
    linocut: { id: "linocut", name: "Linocut Press", glyph: "🖨️", rarity: "common", note: "Carved block ink, cream paper, a studio that smells like linseed.", colorA: "#7f1d1d", colorB: "#fef3c7", effect: "sand", pattern: "stripes", place: "hud,page,chip" },
    risograph: { id: "risograph", name: "Risograph Desk", glyph: "📑", rarity: "rare", note: "One fluorescent pink pass on cream stock. The drum still warm.", colorA: "#d63d8a", colorB: "#f4efe6", effect: "bloom", pattern: "dots", place: "page,chip,companion" },
    enamel: { id: "enamel", name: "Enamel Pin", glyph: "🧷", rarity: "rare", note: "Kiln-gloss gold over navy, like a locker badge.", colorA: "#fbbf24", colorB: "#1e3a8a", effect: "glow", pattern: "rings", place: "hud,chip,companion" },
    brutalist: { id: "brutalist", name: "Brutalist Plinth", glyph: "🏢", rarity: "common", note: "Raw concrete, ochre formwork marks, no apology.", colorA: "#a8a29e", colorB: "#44403c", effect: "chrome", pattern: "grid", place: "hud,page" },
    ukiyo: { id: "ukiyo", name: "Ukiyo Wave", glyph: "🌊", rarity: "rare", note: "Indigo woodblock. One vermilion seal. Nothing else.", colorA: "#8f2a1f", colorB: "#1a2a4a", effect: "tide", pattern: "waves", place: "page,companion,chip" },
    bauhaus: { id: "bauhaus", name: "Bauhaus Studio", glyph: "◼️", rarity: "rare", note: "Cadmium red on cream. One primary, not a flag.", colorA: "#c41e3a", colorB: "#f3ead8", effect: "signal", pattern: "hex", place: "hud,page,chip" },
    noir: { id: "noir", name: "Noir Cut", glyph: "🎬", rarity: "epic", note: "Silver halide, hard key light, a city that never dries.", colorA: "#e5e7eb", colorB: "#111827", effect: "void", pattern: "diagonal", place: "hud,page,chip" },
    celadon: { id: "celadon", name: "Celadon Bowl", glyph: "🍵", rarity: "rare", note: "Crackled jade glaze over a quiet kiln green.", colorA: "#a7f3d0", colorB: "#115e59", effect: "frost", pattern: "rings", place: "page,companion,chip" },
    vermilion: { id: "vermilion", name: "Vermilion Lacquer", glyph: "🧧", rarity: "epic", note: "Cinnabar coats the HUD like a temple door.", colorA: "#ef4444", colorB: "#7f1d1d", effect: "ember", pattern: "none", place: "hud,page,chip" },
    kiln: { id: "kiln", name: "Kiln Fire", glyph: "🔥", rarity: "epic", note: "Orange soak, black brick, the last firing of the night.", colorA: "#fb923c", colorB: "#431407", effect: "magma", pattern: "waves", place: "hud,page,companion" },
    fresco: { id: "fresco", name: "Fresco Wall", glyph: "🖼️", rarity: "common", note: "Wet plaster and burnt sienna. No sky competing.", colorA: "#9a4a2a", colorB: "#efe6d4", effect: "sand", pattern: "dots", place: "page,calendar" },
    lacquer: { id: "lacquer", name: "Black Lacquer", glyph: "⬛", rarity: "epic", note: "Mirror-black urushi with a gold dust edge.", colorA: "#facc15", colorB: "#0f172a", effect: "chrome", pattern: "stripes", place: "hud,page,chip" },
    sumi: { id: "sumi", name: "Sumi Wash", glyph: "🖌️", rarity: "legendary", note: "Rice paper and ink. One vermilion seal. A scroll, not a recolor.", colorA: "#8f2a1f", colorB: "#efe6d4", effect: "sand", world: true, pattern: "waves", place: "hud,page,chip,companion,calendar,pulse" },
    kintsugi: { id: "kintsugi", name: "Kintsugi Vault", glyph: "🏺", rarity: "mythic", note: "Black ceramic. Gold lives only in the cracks.", colorA: "#c9a227", colorB: "#14110e", effect: "chrome", world: true, pattern: "diagonal", place: "hud,page,chip,companion,calendar,pulse" },
    cyanotype: { id: "cyanotype", name: "Cyanotype Lab", glyph: "📷", rarity: "legendary", note: "Prussian-blue photograms on a single pale ink.", colorA: "#d6e4f0", colorB: "#0b3a6a", effect: "frost", world: true, pattern: "grid", place: "hud,page,chip,companion,calendar,pulse" },
    gesso: { id: "gesso", name: "Gesso Gallery", glyph: "🖼️", rarity: "rare", note: "Plaster and charcoal. No second chroma.", colorA: "#3f3a34", colorB: "#f4efe6", effect: "none", world: true, pattern: "dots", place: "hud,page,chip,companion,calendar,pulse" },
    stained: { id: "stained", name: "Stained Glass", glyph: "⛪", rarity: "mythic", note: "Night chapel. Gold leading. Jewels stay in the glass.", colorA: "#c9a227", colorB: "#1a1030", effect: "prism", world: true, pattern: "hex", place: "hud,page,chip,companion,calendar,pulse" },
    tatami: { id: "tatami", name: "Tatami Room", glyph: "🍵", rarity: "rare", note: "Straw and indigo. Two colors, a tea room.", colorA: "#c4b183", colorB: "#1e3a5f", effect: "bloom", world: true, pattern: "stripes", place: "hud,page,chip,companion,calendar,pulse" },
    letterpress: { id: "letterpress", name: "Letterpress Shop", glyph: "🔤", rarity: "rare", note: "Wine ink on cream stock. Deep impression.", colorA: "#6b2a22", colorB: "#efe6d6", effect: "sand", world: true, pattern: "stripes", place: "hud,page,chip,companion,calendar,pulse" },
    mosaic: { id: "mosaic", name: "Mosaic Atrium", glyph: "🧩", rarity: "legendary", note: "Dark teal ground, gold tesserae. No extra hues.", colorA: "#c9a227", colorB: "#0c2f2c", effect: "sparkle", world: true, pattern: "hex", place: "hud,page,chip,companion,calendar,pulse" },
    splatter: { id: "splatter", name: "Splatter Studio", glyph: "🎨", rarity: "legendary", note: "Cobalt paint on cream canvas. Paint tins, not gore. Each page is a studio.", colorA: "#2f5fbf", colorB: "#f3eee4", effect: "bloom", world: true, pattern: "stars", place: "hud,page,chip,companion,calendar,pulse" },
    chalkboard: { id: "chalkboard", name: "Chalkboard", glyph: "✏️", rarity: "rare", note: "Slate board and chalk. A classroom, not a recolor.", colorA: "#e8e4d8", colorB: "#1a2a22", effect: "sand", world: true, pattern: "grid", place: "hud,page,chip,companion,calendar,pulse" },
    terrazzo: { id: "terrazzo", name: "Terrazzo Floor", glyph: "🪨", rarity: "rare", note: "Cream ground, sage chips. A poured floor, not a tint.", colorA: "#6b7e5e", colorB: "#efe6d4", effect: "frost", world: true, pattern: "dots", place: "hud,page,chip,companion,calendar,pulse" },
    shoji: { id: "shoji", name: "Shoji Room", glyph: "🪟", rarity: "legendary", note: "Paper light and charcoal lattice. A room that glows.", colorA: "#2a2420", colorB: "#f4efe6", effect: "glow", world: true, pattern: "grid", place: "hud,page,chip,companion,calendar,pulse" },
    beeswax: { id: "beeswax", name: "Beeswax Bench", glyph: "🐝", rarity: "legendary", note: "Walnut bench, honeycomb, honey gold. A wax studio.", colorA: "#c9a227", colorB: "#3a2a18", effect: "ember", world: true, pattern: "hex", place: "hud,page,chip,companion,calendar,pulse" },
    cork: { id: "cork", name: "Cork Pinboard", glyph: "📌", rarity: "rare", note: "Cork wall and cream cards. Brass tacks, not chrome.", colorA: "#8a6a3a", colorB: "#efe6d4", effect: "sand", world: true, pattern: "dots", place: "hud,page,chip,companion,calendar,pulse" },
    shibori: { id: "shibori", name: "Shibori Cloth", glyph: "🪢", rarity: "legendary", note: "Indigo cloth, cream stitch. Folded fabric, not a wash.", colorA: "#d6cfc2", colorB: "#1a2c4a", effect: "tide", world: true, pattern: "waves", place: "hud,page,chip,companion,calendar,pulse" },
    solarium: { id: "solarium", name: "Solarium", glyph: "☀️", rarity: "legendary", note: "Glass-roof sun. Caustics on limestone. Clarity, not a beach.", colorA: "#c9a227", colorB: "#efe6d4", effect: "glow", world: true, pattern: "rings", place: "hud,page,chip,companion,calendar,pulse" },
    foundry: { id: "foundry", name: "Steel Foundry", glyph: "⛓️", rarity: "legendary", note: "Brushed ingots. Specular mill light. Metal, not grey paint.", colorA: "#cfd6de", colorB: "#1a1d22", effect: "chrome", world: true, pattern: "stripes", place: "hud,page,chip,companion,calendar,pulse" },
  };

  const ROAD = [
    { id: "road-25", threshold: 500, title: "First steps", reward: { kind: "gems", amount: 3 }, icon: "💎" },
    { id: "road-75", threshold: 1500, title: "Supply drop", reward: { kind: "chest", rarity: "common" }, icon: "📦" },
    { id: "road-110", threshold: 2200, title: "Canopy marker", reward: { kind: "skin", id: "forest" }, icon: "🌲" },
    { id: "road-150", threshold: 3000, title: "Solar signal", reward: { kind: "skin", id: "solar" }, icon: "☀️" },
    { id: "road-225", threshold: 4500, title: "Copper bearing", reward: { kind: "skin", id: "copper" }, icon: "⚙️" },
    { id: "road-300", threshold: 6000, title: "Gem seam", reward: { kind: "gems", amount: 5 }, icon: "💎" },
    { id: "road-400", threshold: 8000, title: "Jade watch", reward: { kind: "skin", id: "jade" }, icon: "🐉" },
    { id: "road-500", threshold: 10000, title: "Royal cache", reward: { kind: "chest", rarity: "rare" }, icon: "👑" },
    { id: "road-650", threshold: 13000, title: "Sunrise call", reward: { kind: "skin", id: "sunrise" }, icon: "🌅" },
    { id: "road-800", threshold: 16000, title: "Void map", reward: { kind: "skin", id: "void" }, icon: "🌌" },
    { id: "road-1000", threshold: 20000, title: "Glacier watch", reward: { kind: "skin", id: "glacier" }, icon: "🧊" },
    { id: "road-1200", threshold: 24000, title: "Mythic vault", reward: { kind: "chest", rarity: "epic" }, icon: "⚡" },
    { id: "road-1400", threshold: 28000, title: "Storm front", reward: { kind: "skin", id: "storm" }, icon: "🌩️" },
    { id: "road-1700", threshold: 34000, title: "Northern signal", reward: { kind: "skin", id: "aurora" }, icon: "🌈" },
    { id: "road-2000", threshold: 40000, title: "Midnight crown", reward: { kind: "skin", id: "midnight" }, icon: "🌃" },
    { id: "road-2300", threshold: 46000, title: "Cobalt relay", reward: { kind: "skin", id: "cobalt" }, icon: "🛰️" },
    { id: "road-2600", threshold: 52000, title: "Gold standard", reward: { kind: "skin", id: "gold" }, icon: "🥇" },
    { id: "road-3000", threshold: 60000, title: "Captain's cache", reward: { kind: "chest", rarity: "rare" }, icon: "🗝️" },
    { id: "road-3400", threshold: 68000, title: "Polar beacon", reward: { kind: "skin", id: "polar" }, icon: "🐻‍❄️" },
    { id: "road-3800", threshold: 76000, title: "Tidal gate", reward: { kind: "skin", id: "tide" }, icon: "🌊" },
    { id: "road-4250", threshold: 85000, title: "Royal meridian", reward: { kind: "skin", id: "royal" }, icon: "👑" },
    { id: "road-4750", threshold: 95000, title: "Storm vault", reward: { kind: "chest", rarity: "epic" }, icon: "🌩️" },
    { id: "road-5250", threshold: 105000, title: "Phantom heading", reward: { kind: "skin", id: "phantom" }, icon: "👻" },
    { id: "road-6000", threshold: 120000, title: "Prism horizon", reward: { kind: "skin", id: "prism" }, icon: "🔷" },
    { id: "road-6750", threshold: 135000, title: "Still horizon", reward: { kind: "skin", id: "zen" }, icon: "🪷" },
    { id: "road-7500", threshold: 150000, title: "Summit treasury", reward: { kind: "bundle", gems: 15, chest: "epic" }, icon: "🏆" },
    { id: "road-8250", threshold: 165000, title: "Phantom puzzle", reward: { kind: "pieces", id: "phantom", amount: 2 }, icon: "🧩" },
    { id: "road-9000", threshold: 180000, title: "Royal puzzle", reward: { kind: "pieces", id: "royal", amount: 2 }, icon: "🧩" },
    { id: "road-10000", threshold: 200000, title: "Moon puzzle", reward: { kind: "pieces", id: "moon", amount: 3 }, icon: "🌙" },
    { id: "road-11250", threshold: 225000, title: "Prism puzzle", reward: { kind: "pieces", id: "prism", amount: 3 }, icon: "🔷" },
    { id: "road-12500", threshold: 250000, title: "Gilded vault", reward: { kind: "chest", rarity: "legendary" }, icon: "🏆" },
    { id: "road-14000", threshold: 280000, title: "Chrome runner", reward: { kind: "skin", id: "chrome" }, icon: "🪞" },
    { id: "road-16000", threshold: 320000, title: "Deep gem seam", reward: { kind: "gems", amount: 12 }, icon: "💎" },
    { id: "road-18000", threshold: 360000, title: "Starlit archive", reward: { kind: "skin", id: "starlit" }, icon: "✨" },
    { id: "road-20000", threshold: 400000, title: "Magmaheart", reward: { kind: "skin", id: "magmaheart" }, icon: "🫀" },
    { id: "road-22500", threshold: 450000, title: "Eclipse meridian", reward: { kind: "skin", id: "eclipse" }, icon: "🌑" },
    { id: "road-25000", threshold: 500000, title: "Nova horizon", reward: { kind: "bundle", gems: 20, chest: "legendary" }, icon: "🌟" },
    { id: "road-27500", threshold: 550000, title: "Cyanotype tray", reward: { kind: "skin", id: "cyanotype" }, icon: "📷" },
    { id: "road-30000", threshold: 600000, title: "Kintsugi vault", reward: { kind: "skin", id: "kintsugi" }, icon: "🏺" },
  ];

  const SHOP = [
    {
      id: "cache_pair",
      name: "Cache convoy",
      icon: "📦",
      cost: 10, standing: false, weight: 6,
      badge: "PACK",
      description: "Adds one common and one rare cache to your real loot inventory.",
      grants: [{ kind: "chest", rarity: "common" }, { kind: "chest", rarity: "rare" }],
    },
    {
      id: "emberwing_pack",
      name: "Emberwing skin pack",
      icon: "🦅",
      cost: 16, standing: false, weight: 5,
      badge: "SKIN PACK",
      description: "Permanently unlocks and equips the forge-exclusive Emberwing skin.",
      grants: [{ kind: "skin", id: "emberwing" }],
    },
    {
      id: "expedition_mix",
      name: "Polar expedition",
      icon: "🧊",
      cost: 24, standing: false, weight: 2, rare: true,
      badge: "MIXED PACK",
      featured: true,
      description: "Unlocks Frost Relay, adds a rare cache, and returns 3 gems.",
      grants: [{ kind: "skin", id: "frost" }, { kind: "chest", rarity: "rare" }, { kind: "gems", amount: 3 }],
    },
    {
      id: "epic_cache_pack",
      name: "Epic vault",
      icon: "⚡",
      cost: 20, standing: false, weight: 3,
      badge: "CHEST PACK",
      description: "Adds one epic cache with the strongest gem, XP, and skin table.",
      grants: [{ kind: "chest", rarity: "epic" }],
    },
    {
      id: "sakura_pack",
      name: "Sakura field kit",
      icon: "🌸",
      cost: 14, standing: false, weight: 5,
      badge: "SKIN PACK",
      description: "Permanently unlocks Sakura Pathfinder and adds a common cache.",
      grants: [{ kind: "skin", id: "sakura" }, { kind: "chest", rarity: "common" }],
    },
    {
      id: "volt_pack",
      name: "Volt conductor",
      icon: "⚡",
      cost: 22, standing: false, weight: 4,
      badge: "SKIN PACK",
      description: "Permanently unlocks Volt Runner and adds a rare cache.",
      grants: [{ kind: "skin", id: "volt" }, { kind: "chest", rarity: "rare" }],
    },
    {
      id: "neon_pack",
      name: "Neon night kit",
      icon: "💡",
      cost: 12, standing: false, weight: 6,
      badge: "SKIN PACK",
      description: "Unlocks Neon Drifter and adds a common cache.",
      grants: [{ kind: "skin", id: "neon" }, { kind: "chest", rarity: "common" }],
    },
    {
      id: "coral_pack",
      name: "Coral current",
      icon: "🪸",
      cost: 16, standing: false, weight: 5,
      badge: "SKIN PACK",
      description: "Unlocks Coral Voyager and returns two gems for the next route.",
      grants: [{ kind: "skin", id: "coral" }, { kind: "gems", amount: 2 }],
    },
    {
      id: "arcade_pack",
      name: "Chromatic cabinet",
      icon: "🕹️",
      cost: 26, standing: false, weight: 2, rare: true,
      badge: "EPIC SKIN",
      featured: true,
      description: "Unlocks Arcade Specter and adds a rare cache.",
      grants: [{ kind: "skin", id: "arcade" }, { kind: "chest", rarity: "rare" }],
    },
    {
      id: "obsidian_pack",
      name: "Obsidian crossing",
      icon: "🪨",
      cost: 32, standing: false, weight: 1, rare: true,
      badge: "EPIC PACK",
      description: "Unlocks Obsidian Rift and adds an epic cache.",
      grants: [{ kind: "skin", id: "obsidian" }, { kind: "chest", rarity: "epic" }],
    },
    {
      id: "puzzle_cache_pack",
      name: "Puzzle cache map",
      icon: "🧩",
      cost: 18, standing: false, weight: 3,
      badge: "CACHE PACK",
      description: "Adds a rare cache and one Phantom Compass puzzle piece.",
      grants: [{ kind: "chest", rarity: "rare" }, { kind: "pieces", id: "phantom", amount: 1 }],
    },
    {
      id: "extra_pin",
      name: "Seventh Home pin",
      icon: "📌",
      cost: 8, standing: true,
      description: "Adds one real customizable metric slot to Home.",
    },
    {
      id: "festival",
      name: "Grand celebrations",
      icon: "🎉",
      cost: 8, standing: true,
      description: "Doubles particles on earned celebrations without slowing the UI.",
    },
    {
      id: "companion_nebula",
      name: "Nebula companion",
      icon: "🔮",
      cost: 10, standing: true,
      description: "Applies a violet/cyan live theme to the companion orb and panel.",
      theme: "nebula",
    },
    {
      id: "companion_ember",
      name: "Ember companion",
      icon: "🔥",
      cost: 10, standing: true,
      description: "Applies a warm ember live theme to the companion orb and panel.",
      theme: "ember",
    },
    {
      id: "quest_dense",
      name: "Four-pursuit day",
      icon: "⚔️",
      cost: 14, standing: true,
      description: "Lets you actively pursue a fourth daily quest for another XP reward roll.",
    },
    {
      id: "legendary_vault",
      name: "Gilded vault key",
      icon: "🏆",
      cost: 40,
      badge: "RARE",
      rare: true,
      weight: 1,
      description: "Almost never in today's Forge. Adds one legendary cache with the scarce skin table.",
      grants: [{ kind: "chest", rarity: "legendary" }],
    },
    {
      id: "nova_lead",
      name: "Nova puzzle lead",
      icon: "🌟",
      cost: 36,
      badge: "RARE",
      rare: true,
      weight: 1,
      description: "A scarce mythic puzzle lead. Only some days find it on the caravan.",
      grants: [{ kind: "pieces", id: "prism", amount: 2 }],
    },
  ];

  const DAY_BAZAAR_PACKS = [
    { id: "scout", name: "Scout cache", icon: "📦", cost: 5, weight: 8, description: "One common cache for a quick daily resupply.", grants: [{ kind: "chest", rarity: "common" }] },
    { id: "relay", name: "Relay pair", icon: "🛰️", cost: 10, weight: 6, description: "A common and rare cache bundled for today.", grants: [{ kind: "chest", rarity: "common" }, { kind: "chest", rarity: "rare" }] },
    { id: "royal", name: "Royal signal", icon: "👑", cost: 14, weight: 5, description: "One rare cache with a stronger skin table.", grants: [{ kind: "chest", rarity: "rare" }] },
    { id: "storm", name: "Storm reserve", icon: "🌩️", cost: 20, weight: 3, description: "One epic cache from the rotating reserve.", grants: [{ kind: "chest", rarity: "epic" }] },
    { id: "trail", name: "Trail bundle", icon: "🧭", cost: 12, weight: 6, description: "Two common caches and one gem returned.", grants: [{ kind: "chest", rarity: "common" }, { kind: "chest", rarity: "common" }, { kind: "gems", amount: 1 }] },
    { id: "grove", name: "Grove field cache", icon: "🌲", cost: 11, weight: 5, description: "Canopy Ranger plus a common daily cache.", grants: [{ kind: "skin", id: "forest" }, { kind: "chest", rarity: "common" }] },
    { id: "metro", name: "Metro dispatch", icon: "🚇", cost: 15, weight: 5, description: "Metro Pulse plus two gems from today's circuit.", grants: [{ kind: "skin", id: "metro" }, { kind: "gems", amount: 2 }] },
    { id: "canyon", name: "Canyon expedition", icon: "🧗", cost: 20, weight: 3, description: "Canyon Guide and one rare daily cache.", grants: [{ kind: "skin", id: "canyon" }, { kind: "chest", rarity: "rare" }] },
    { id: "cache_trio", name: "Cache trail", icon: "🗺️", cost: 18, weight: 4, description: "Two common caches and one rare cache for a longer route.", grants: [{ kind: "chest", rarity: "common" }, { kind: "chest", rarity: "common" }, { kind: "chest", rarity: "rare" }] },
    { id: "puzzle_scout", name: "Puzzle scout", icon: "🧩", cost: 16, weight: 3, description: "A rare cache plus one rotating mythic puzzle lead.", grants: [{ kind: "chest", rarity: "rare" }, { kind: "pieces", id: "moon", amount: 1 }] },
    { id: "legend", name: "Gilded reserve", icon: "🏆", cost: 28, weight: 1, rare: true, rareEvery: 7, description: "A legendary cache. Most days the caravan does not carry it.", grants: [{ kind: "chest", rarity: "legendary" }] },
    { id: "stray", name: "Stray map-dog bag", icon: "🐶", cost: 1, weight: 1, rare: true, rareEvery: 5, description: "A cheap leftover. The dog would not say where it came from.", grants: [{ kind: "gems", amount: 1 }] },
    { id: "veil", name: "Aurora veil kit", icon: "🎆", cost: 34, weight: 1, rare: true, rareEvery: 9, description: "Unlocks Aurora Veil if you find this stall at all.", grants: [{ kind: "skin", id: "auroraveil" }] },
    { id: "cabinetkit", name: "Cabinet Night kit", icon: "🕹️", cost: 38, weight: 1, rare: true, rareEvery: 11, description: "A world skin. Most days the stall is empty.", grants: [{ kind: "skin", id: "cabinet" }] },
  ];

  const CHEST_SKIN_POOLS = {
    common: ["moss", "dune", "forest", "copper", "ivory", "amber", "slate", "orchard", "mist", "bronze", "kelp", "prairie", "metro", "scrap", "linen", "ink", "honey", "pine", "pebble", "rust", "basil", "sunflower", "brass", "paprika", "eucalyptus", "terracotta", "harvest", "honeycomb", "linocut", "brutalist", "fresco"],
    rare: ["solar", "aurora", "emberwing", "cobalt", "sakura", "cinder", "neon", "jade", "ruby", "sapphire", "coral", "sunrise", "quartz", "silver", "carbon", "canyon", "tropic", "lagoon", "emberglass", "comet", "lilac", "opal", "merlot", "candyfloss", "seafoam", "nimbus", "cherry", "marble", "wisteria", "pearl", "reef", "incense", "lotus", "satellite", "risograph", "enamel", "ukiyo", "bauhaus", "celadon", "gesso", "tatami", "letterpress", "chalkboard", "terrazzo", "cork"],
    epic: ["void", "tide", "frost", "volt", "glacier", "obsidian", "storm", "magma", "iris", "gold", "polar", "arcade", "zen", "thunder", "frostbite", "abyssal", "onyx", "voltage", "chrome", "iceberg", "venom", "tungsten", "blizzard", "cinderfall", "inkstorm", "wildfire", "noir", "vermilion", "kiln", "lacquer"],
    legendary: ["prism", "moon", "midnight", "royal", "phantom", "magmaheart", "starlit", "eclipse", "nova", "auroraveil", "relic", "cabinet", "parchment", "harbor", "nightmarket", "signalbox", "glasshouse", "velvet", "isobar", "retro", "sumi", "kintsugi", "cyanotype", "stained", "mosaic", "splatter", "shoji", "beeswax", "shibori", "solarium", "foundry"],
  };

  const PINS = {
    star: { id: "star", name: "Star pin", glyph: "⭐", rarity: "common", note: "A tiny field star from a common cache." },
    leaf: { id: "leaf", name: "Leaf pin", glyph: "🍃", rarity: "common", note: "Pressed on the road and still green." },
    bolt: { id: "bolt", name: "Bolt pin", glyph: "⚡", rarity: "rare", note: "A live spark that never cools." },
    fish: { id: "fish", name: "Fish pin", glyph: "🐟", rarity: "rare", note: "Keeps a wet heading in your locker." },
    mask: { id: "mask", name: "Mask pin", glyph: "🎭", rarity: "epic", note: "A face for the rare night you dress up." },
    coin: { id: "coin", name: "Coin pin", glyph: "🪙", rarity: "common", note: "Looks spendable. It is not." },
    comet: { id: "comet", name: "Comet pin", glyph: "☄️", rarity: "epic", note: "Caught mid-arc and pinned still." },
    lantern: { id: "lantern", name: "Lantern pin", glyph: "🏮", rarity: "legendary", note: "A stall light that survived the close." },
  };
  const STAMPS = {
    wax: { id: "wax", name: "Wax stamp", glyph: "🦭", rarity: "common", note: "Seals a page that wanted to stay open." },
    visa: { id: "visa", name: "Visa stamp", glyph: "🛂", rarity: "rare", note: "Proof you crossed a quiet border." },
    tide: { id: "tide", name: "Tide stamp", glyph: "🌊", rarity: "rare", note: "Ink that still smells like salt." },
    pixel: { id: "pixel", name: "Pixel stamp", glyph: "👾", rarity: "epic", note: "A cabinet mark from after hours." },
    fern: { id: "fern", name: "Fern stamp", glyph: "🪴", rarity: "common", note: "A greenhouse visa for small plants." },
    thunder: { id: "thunder", name: "Thunder stamp", glyph: "⛈️", rarity: "epic", note: "Pressed during a real storm." },
  };
  const CHARMS = {
    beetle: { id: "beetle", name: "Beetle charm", glyph: "🪲", rarity: "rare", note: "Hangs on the companion like a lucky shell." },
    shell: { id: "shell", name: "Shell charm", glyph: "🐚", rarity: "common", note: "A pocket echo of the harbor." },
    dice: { id: "dice", name: "Dice charm", glyph: "🎲", rarity: "epic", note: "Loaded only with hope." },
    moth: { id: "moth", name: "Moth charm", glyph: "🦋", rarity: "rare", note: "Follows the companion light." },
    bell: { id: "bell", name: "Bell charm", glyph: "🔔", rarity: "common", note: "Rings once when a cache opens." },
    kite: { id: "kite", name: "Kite charm", glyph: "🪁", rarity: "legendary", note: "Holds a high wind without leaving." },
  };
  const TITLES = {
    scout: { id: "scout", name: "Field Scout", glyph: "🧭", rarity: "common", note: "A modest heading under your name." },
    skipper: { id: "skipper", name: "Skipper", glyph: "⛵", rarity: "rare", note: "For people who keep a wet log." },
    maestro: { id: "maestro", name: "Maestro", glyph: "🎻", rarity: "epic", note: "Cue the room when you enter." },
    static: { id: "static", name: "Static Lead", glyph: "📻", rarity: "rare", note: "You still come in loud." },
    keeper: { id: "keeper", name: "Glass Keeper", glyph: "🪴", rarity: "common", note: "Tends a greenhouse of unfinished work." },
    nightowl: { id: "nightowl", name: "Night Owl", glyph: "🦉", rarity: "legendary", note: "The stall stays open because you do." },
  };
  const BOOSTS = {
    confetti: { id: "confetti", name: "Festival hour", hours: 24, note: "Doubles celebration particles for a day." },
    pursuit: { id: "pursuit", name: "Extra pursuit", hours: 20, note: "A fourth quest slot until tomorrow." },
    lucky: { id: "lucky", name: "Lucky hour", hours: 4, note: "The next caches lean a little rarer." },
  };
  const CHEST_KIND_TABLES = {
    common: [
      { kind: "coins", weight: 48 }, { kind: "gems", weight: 14 }, { kind: "ticket", weight: 12 },
      { kind: "stamp", weight: 10 }, { kind: "pin", weight: 7 }, { kind: "charm", weight: 3 },
      { kind: "title", weight: 2 }, { kind: "boost", weight: 2 }, { kind: "skin", weight: 2 },
    ],
    rare: [
      { kind: "coins", weight: 34 }, { kind: "gems", weight: 12 }, { kind: "ticket", weight: 12 },
      { kind: "stamp", weight: 10 }, { kind: "pin", weight: 10 }, { kind: "charm", weight: 6 },
      { kind: "title", weight: 4 }, { kind: "boost", weight: 5 }, { kind: "skin", weight: 5 },
    ],
    epic: [
      { kind: "coins", weight: 20 }, { kind: "gems", weight: 10 }, { kind: "ticket", weight: 7 },
      { kind: "pin", weight: 12 }, { kind: "charm", weight: 12 }, { kind: "title", weight: 10 },
      { kind: "boost", weight: 12 }, { kind: "stamp", weight: 5 }, { kind: "skin", weight: 12 },
    ],
    legendary: [
      { kind: "coins", weight: 8 }, { kind: "gems", weight: 8 }, { kind: "charm", weight: 10 },
      { kind: "title", weight: 12 }, { kind: "boost", weight: 12 }, { kind: "pin", weight: 8 },
      { kind: "skin", weight: 42 },
    ],
  };
  const SKIN_RARITY_GIVEN_DROP = {
    common: { common: 80, rare: 16, epic: 3.2, legendary: 0.7, world: 0.1 },
    rare: { common: 8, rare: 62, epic: 24, legendary: 5, world: 1 },
    epic: { rare: 10, epic: 55, legendary: 25, world: 10 },
    legendary: { epic: 12, legendary: 48, world: 25, mythic: 15 },
  };
  const WORLD_SOUNDS = {
    "": { click: [440, 0.06, "sine", 0.02], nav: [520, 0.08, "triangle", 0.02], success: [660, 0.18, "sine", 0.03], chest: [480, 0.1, "square", 0.03] },
    cabinet: { click: [880, 0.05, "square", 0.03], nav: [196, 0.09, "square", 0.03], success: [1318, 0.16, "square", 0.035], chest: [110, 0.16, "sawtooth", 0.04] },
    parchment: { click: [210, 0.08, "triangle", 0.03], nav: [174, 0.12, "sine", 0.025], success: [330, 0.2, "triangle", 0.03], chest: [140, 0.14, "sine", 0.03] },
    harbor: { click: [98, 0.12, "sine", 0.04], nav: [130, 0.16, "triangle", 0.03], success: [196, 0.28, "sine", 0.035], chest: [73, 0.22, "sine", 0.04] },
    nightmarket: { click: [784, 0.07, "triangle", 0.03], nav: [523, 0.1, "sine", 0.03], success: [659, 0.2, "triangle", 0.03], chest: [392, 0.14, "sine", 0.03] },
    signalbox: { click: [800, 0.04, "square", 0.025], nav: [600, 0.05, "square", 0.02], success: [1000, 0.08, "square", 0.03], chest: [240, 0.1, "square", 0.03] },
    glasshouse: { click: [659, 0.07, "sine", 0.02], nav: [523, 0.1, "sine", 0.02], success: [784, 0.18, "triangle", 0.03], chest: [349, 0.14, "sine", 0.025] },
    velvet: { click: [196, 0.1, "triangle", 0.03], nav: [246, 0.14, "sine", 0.03], success: [392, 0.28, "triangle", 0.035], chest: [130, 0.2, "sine", 0.035] },
    isobar: { click: [90, 0.08, "sawtooth", 0.02], nav: [140, 0.1, "triangle", 0.025], success: [220, 0.16, "sawtooth", 0.03], chest: [60, 0.2, "sawtooth", 0.03] },
  };

  const DAILY_MILESTONES = [
    { count: 1, label: "First mark", icon: "📦", reward: { kind: "chest", rarity: "common" } },
    { count: 2, label: "Momentum", icon: "💎", reward: { kind: "gems", amount: 3 } },
    { count: 3, label: "Full route", icon: "🎟️", reward: { kind: "ticket", amount: 1 } },
    { count: 4, label: "Overdrive", icon: "💎", reward: { kind: "gems", amount: 4 } },
  ];

  let initialized = false;
  let shell = null;
  let activeTab = "road";
  let lockerFilter = "all";
  let coinBurstSeq = 0;
  let audioContext = null;
  const coinAwardAnimations = new WeakMap();
  const chestTimers = new Set();
  const chestAnimations = new Set();
  const shellTimers = new Set();

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeCustomSkin(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || "");
    const name = String(raw.name || "").trim().slice(0, 24);
    const glyph = Array.from(String(raw.glyph || "✦").trim()).slice(0, 2).join("") || "✦";
    const colorA = /^#[0-9a-f]{6}$/i.test(raw.colorA || "") ? raw.colorA : "#22d3ee";
    const colorB = /^#[0-9a-f]{6}$/i.test(raw.colorB || "") ? raw.colorB : "#7c3aed";
    const effect = CUSTOM_SKIN_EFFECTS.includes(raw.effect) ? raw.effect : "bloom";
    if (!/^custom-[a-z0-9-]+$/i.test(id) || !name) return null;
    return { id, name, glyph, colorA, colorB, effect, rarity: "custom", note: "Your custom Waypoint profile.", custom: true };
  }

  function readCustomSkins() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_SKINS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeCustomSkin).filter(Boolean).slice(0, CUSTOM_SKIN_LIMIT) : [];
    } catch (_) {
      return [];
    }
  }

  function allSkins() {
    return [...Object.values(SKINS), ...readCustomSkins()];
  }

  function skinById(id) {
    return SKINS[id] || readCustomSkins().find(skin => skin.id === id) || null;
  }

  function skinStyle(skin) {
    return ` style="--skin-a:${esc(skin?.colorA || SKINS.trailblazer.colorA)};--skin-b:${esc(skin?.colorB || SKINS.trailblazer.colorB)}"`;
  }

  function effectLabel(effect) {
    const value = SKIN_EFFECTS.includes(effect) ? effect : "none";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function skinPattern(skin) {
    if (skin?.pattern && SKIN_PATTERNS.includes(skin.pattern)) return skin.pattern;
    const id = String(skin?.id || "");
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    return SKIN_PATTERNS[Math.abs(hash) % SKIN_PATTERNS.length];
  }

  function skinPlace(skin) {
    if (typeof skin?.place === "string" && skin.place.trim()) return skin.place.split(",").map(part => part.trim()).filter(Boolean).join(" ");
    return "hud page chip";
  }

  function chestTapsFor(rarity, explicit) {
    const taps = Math.floor(Number(explicit) || 0);
    if (taps > 0) return taps;
    return CHEST_TAPS[rarity] || 4;
  }

  function rarityTitle(rarity) {
    if (rarity === "legendary") return "Legendary";
    if (rarity === "epic") return "Epic";
    if (rarity === "rare") return "Rare";
    return "Common";
  }

  function skinCollectionStatus(state, customSkins) {
    const current = state || readState();
    const custom = customSkins || readCustomSkins();
    const unlockedCatalog = Object.keys(SKINS).filter(id => current.unlockedSkins.includes(id)).length;
    return `${unlockedCatalog}/${Object.keys(SKINS).length} · ${custom.length} custom`;
  }

  function scheduleChestTimer(callback, delay) {
    const timer = window.setTimeout(() => {
      chestTimers.delete(timer);
      callback();
    }, delay);
    chestTimers.add(timer);
    return timer;
  }

  function clearChestTimers() {
    chestTimers.forEach(timer => window.clearTimeout(timer));
    chestTimers.clear();
    chestAnimations.forEach(animation => animation.cancel());
    chestAnimations.clear();
  }

  function scheduleShellTimer(callback, delay) {
    const timer = window.setTimeout(() => {
      shellTimers.delete(timer);
      callback();
    }, delay);
    shellTimers.add(timer);
    return timer;
  }

  function clearShellTimers() {
    shellTimers.forEach(timer => window.clearTimeout(timer));
    shellTimers.clear();
  }

  function playChestAnimation(element, keyframes, options) {
    if (!element || typeof element.animate !== "function" || REDUCED_MOTION()) return null;
    const animation = element.animate(keyframes, options);
    chestAnimations.add(animation);
    animation.finished.catch(() => {}).finally(() => chestAnimations.delete(animation));
    return animation;
  }

  function sprayChestSparks(host, count) {
    if (!host || REDUCED_MOTION()) return;
    const n = Math.max(4, Math.min(18, Number(count) || 8));
    for (let i = 0; i < n; i++) {
      const spark = document.createElement("span");
      spark.className = "loot-chest-fly";
      spark.textContent = ["✦", "✧", "◆", "★", "•"][i % 5];
      spark.style.setProperty("--fly-x", `${-90 + Math.random() * 180}px`);
      spark.style.setProperty("--fly-y", `${-40 - Math.random() * 90}px`);
      spark.style.left = `${36 + Math.random() * 28}%`;
      spark.style.top = `${42 + Math.random() * 18}%`;
      host.appendChild(spark);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
    }
  }

  function burstChestOpen(overlay, rarity) {
    if (!overlay || REDUCED_MOTION()) return;
    overlay.classList.add("loot-chest-overlay--burst");
    const layer = document.createElement("div");
    layer.className = "loot-chest-burst";
    const glyphs = rarity === "legendary"
      ? ["✦", "★", "◈", "✧", "♛"]
      : rarity === "epic"
        ? ["◆", "✦", "◇", "★"]
        : ["✦", "•", "✧", "◆"];
    const n = rarity === "legendary" ? 36 : rarity === "epic" ? 28 : 22;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.textContent = glyphs[i % glyphs.length];
      p.style.setProperty("--burst-x", `${-160 + Math.random() * 320}px`);
      p.style.setProperty("--burst-y", `${-220 - Math.random() * 80}px`);
      p.style.setProperty("--burst-rot", `${Math.random() * 640}deg`);
      p.style.animationDelay = `${i * 14}ms`;
      layer.appendChild(p);
    }
    overlay.appendChild(layer);
    scheduleChestTimer(() => layer.remove(), 1600);
  }

  function freshState() {
    return {
      version: 4,
      claims: [],
      unlocks: [],
      unlockedSkins: ["trailblazer"],
      activeSkin: "trailblazer",
      companionTheme: "",
      pity: { rare: 0, epic: 0, legendary: 0, world: 0 },
      pieces: { prism: 0, moon: 0, phantom: 0, royal: 0 },
      pieceCursor: 0,
      pins: [],
      stamps: [],
      charms: [],
      titles: [],
      activeTitle: "",
      activeCharm: "",
      tickets: 0,
      boosts: {},
      chests: [
        { id: uid("welcome"), rarity: "common", source: "Welcome cache", taps: 4, starter: true },
      ],
      activeOpening: null,
    };
  }

  function readState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) { state = null; }
    if (!state || typeof state !== "object") state = freshState();
    state.version = 4;
    if (!Array.isArray(state.claims)) state.claims = [];
    if (!Array.isArray(state.unlocks)) state.unlocks = [];
    if (!Array.isArray(state.unlockedSkins)) state.unlockedSkins = ["trailblazer"];
    if (!state.unlockedSkins.includes("trailblazer")) state.unlockedSkins.unshift("trailblazer");
    if (!skinById(state.activeSkin) || !state.unlockedSkins.includes(state.activeSkin)) state.activeSkin = "trailblazer";
    const pity = state.pity && typeof state.pity === "object" ? state.pity : {};
    state.pity = {
      rare: Math.max(0, Math.floor(Number(pity.rare) || 0)),
      epic: Math.max(0, Math.floor(Number(pity.epic) || 0)),
      legendary: Math.max(0, Math.floor(Number(pity.legendary) || 0)),
      world: Math.max(0, Math.floor(Number(pity.world) || 0)),
    };
    ["pins", "stamps", "charms", "titles"].forEach(key => {
      if (!Array.isArray(state[key])) state[key] = [];
    });
    state.activeTitle = TITLES[state.activeTitle] ? state.activeTitle : "";
    state.activeCharm = CHARMS[state.activeCharm] ? state.activeCharm : "";
    state.tickets = Math.max(0, Math.floor(Number(state.tickets) || 0));
    const boosts = state.boosts && typeof state.boosts === "object" ? state.boosts : {};
    state.boosts = {};
    Object.keys(BOOSTS).forEach(id => {
      const until = Math.max(0, Math.floor(Number(boosts[id]) || 0));
      if (until > Date.now()) state.boosts[id] = until;
    });
    const pieces = state.pieces && typeof state.pieces === "object" ? state.pieces : {};
    state.pieces = {
      prism: Math.max(0, Math.floor(Number(pieces.prism) || 0)),
      moon: Math.max(0, Math.floor(Number(pieces.moon) || 0)),
      phantom: Math.max(0, Math.floor(Number(pieces.phantom) || 0)),
      royal: Math.max(0, Math.floor(Number(pieces.royal) || 0)),
    };
    state.pieceCursor = Math.max(0, Math.floor(Number(state.pieceCursor) || 0)) % MYTHIC_PIECE_IDS.length;
    if (!Array.isArray(state.chests)) state.chests = [];
    if (!Object.prototype.hasOwnProperty.call(state, "activeOpening")) state.activeOpening = null;
    return state;
  }

  function writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    window.dispatchEvent(new CustomEvent("waypoint:loot-state", { detail: publicState(state) }));
    if (lootSyncPulling) return;
    if (typeof api === "function") {
      window.clearTimeout(window.__waypointLootSyncTimer);
      window.__waypointLootSyncTimer = window.setTimeout(() => {
        api("/api/loot/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The ack tells the server this client has already adopted its latest reset; without
          // it the server refuses the payload rather than letting a stale copy undo the reset.
          body: JSON.stringify({ state: { ...state, resetAck: lootResetAck() } }),
        }).catch(() => {});
      }, 450);
    }
  }

  function mergeLootArrays(local, remote) {
    const left = Array.isArray(local) ? local : [];
    const right = Array.isArray(remote) ? remote : [];
    const seen = [];
    const ids = new Set();
    left.concat(right).forEach(item => {
      const marker = typeof item === "string" ? item : JSON.stringify(item);
      if (ids.has(marker)) return;
      ids.add(marker);
      seen.push(item);
    });
    return seen;
  }

  function pullLootSync() {
    if (typeof api !== "function" || lootSyncPulling) return;
    lootSyncPulling = true;
    Promise.resolve(api("/api/loot/state")).then(res => {
      const remote = res && res.state && typeof res.state === "object" ? res.state : null;
      if (!remote) return;
      // A server reset wins outright. Merging instead would restore every skin and chest it
      // just cleared, because these arrays only ever grow on the server side.
      let ack = "";
      try { ack = localStorage.getItem(LOOT_RESET_ACK_KEY) || ""; } catch (_) {}
      if (remote.resetAt && remote.resetAt > ack) {
        try { localStorage.setItem(LOOT_RESET_ACK_KEY, remote.resetAt); } catch (_) {}
        writeState({ ...remote });
        applyUnlockEffects();
        refreshHud();
        return;
      }
      const local = readState();
      const merged = { ...remote, ...local };
      ["chests", "claims", "unlocks", "unlockedSkins", "pins", "stamps", "charms", "titles"].forEach(key => {
        merged[key] = mergeLootArrays(local[key], remote[key]);
      });
      if (remote.pity && typeof remote.pity === "object") {
        merged.pity = {
          rare: Math.max(local.pity.rare, Number(remote.pity.rare) || 0),
          epic: Math.max(local.pity.epic, Number(remote.pity.epic) || 0),
          legendary: Math.max(local.pity.legendary, Number(remote.pity.legendary) || 0),
          world: Math.max(local.pity.world, Number(remote.pity.world) || 0),
        };
      }
      if (remote.activeSkin && local.unlockedSkins.includes(remote.activeSkin) && !local.activeSkin) {
        merged.activeSkin = remote.activeSkin;
      }
      writeState(merged);
      applyUnlockEffects();
      refreshHud();
    }).catch(() => {}).finally(() => { lootSyncPulling = false; });
  }

  function publicState(input) {
    const state = input || readState();
    return {
      gems: getGems(),
      claims: state.claims.slice(),
      unlocks: state.unlocks.slice(),
      unlockedSkins: state.unlockedSkins.slice(),
      activeSkin: state.activeSkin,
      companionTheme: state.companionTheme || "",
      pity: { ...state.pity },
      pieces: { ...state.pieces },
      pins: state.pins.slice(),
      stamps: state.stamps.slice(),
      charms: state.charms.slice(),
      titles: state.titles.slice(),
      activeTitle: state.activeTitle || "",
      activeCharm: state.activeCharm || "",
      tickets: state.tickets || 0,
      chestCount: state.chests.length + (state.activeOpening ? 1 : 0),
      worldSkin: !!(skinById(state.activeSkin) || {}).world,
    };
  }

  function getGems() {
    const n = parseInt(localStorage.getItem("gameGems") || "0", 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function setGems(amount) {
    const next = Math.max(0, Math.floor(Number(amount) || 0));
    try { localStorage.setItem("gameGems", String(next)); } catch (_) {}
    if (typeof gameUpdateHud === "function") gameUpdateHud();
    refreshHud();
    window.dispatchEvent(new CustomEvent("waypoint:gems", { detail: { gems: next } }));
    return next;
  }

  function localWeekKey(date) {
    const value = new Date((date || new Date()).getTime());
    value.setHours(12, 0, 0, 0);
    value.setDate(value.getDate() - value.getDay());
    return localDayKey(value);
  }

  function readGemCap() {
    const date = localDayKey();
    const week = localWeekKey();
    let state = null;
    try { state = JSON.parse(localStorage.getItem(GEM_CAP_KEY) || "null"); } catch (_) { state = null; }
    if (!state || typeof state !== "object" || state.week !== week) {
      state = { date, week, daily: 0, weekly: 0 };
    } else {
      state.week = week;
      state.weekly = Math.max(0, Math.min(GEM_WEEKLY_CAP, Math.floor(Number(state.weekly) || 0)));
      if (state.date !== date) {
        state.date = date;
        state.daily = 0;
      } else {
        state.daily = Math.max(0, Math.min(GEM_DAILY_CAP, Math.floor(Number(state.daily) || 0)));
      }
    }
    try { localStorage.setItem(GEM_CAP_KEY, JSON.stringify(state)); } catch (_) {}
    return state;
  }

  function writeGemCap(state) {
    try { localStorage.setItem(GEM_CAP_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function awardGems(amount, reason) {
    const requested = Math.max(0, Math.floor(Number(amount) || 0));
    if (!requested) return getGems();
    const cap = readGemCap();
    const allowed = Math.min(
      requested,
      Math.max(0, GEM_DAILY_CAP - cap.daily),
      Math.max(0, GEM_WEEKLY_CAP - cap.weekly),
    );
    if (!allowed) {
      if (typeof showToast === "function") showToast("Gem vault full for today", "info");
      return getGems();
    }

    const before = getGems();
    let usedGameLayer = false;
    if (window.WaypointGame && typeof window.WaypointGame.awardGems === "function") {
      try {
        window.WaypointGame.awardGems(allowed, reason || "Loot reward");
        usedGameLayer = true;
      } catch (_) {
        usedGameLayer = false;
      }
    }
    let next = getGems();
    if (!usedGameLayer || next - before !== allowed) {
      next = setGems(before + allowed);
    }
    cap.daily += allowed;
    cap.weekly += allowed;
    writeGemCap(cap);
    if (typeof showToast === "function") {
      if (allowed < requested) showToast("Gem vault full for today", "info");
      else showToast(`+${allowed} gems · ${reason || "Loot reward"}`, "good");
    }
    return next;
  }

  function spendGems(amount, reason) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n || getGems() < n) return false;
    if (window.WaypointGame && typeof window.WaypointGame.spendGems === "function") {
      return window.WaypointGame.spendGems(n, reason || "Gem unlock");
    }
    setGems(getGems() - n);
    return true;
  }

  function hasUnlock(id) {
    return readState().unlocks.includes(id);
  }

  function questLimit() {
    return hasUnlock("quest_dense") || activeBoost("pursuit") ? 4 : 3;
  }

  function getConfettiMultiplier() {
    const base = hasUnlock("festival") ? 2 : 1;
    return activeBoost("confetti") ? base * 2 : base;
  }

  function rawCoinsEarned() {
    let coins = 0;
    try {
      const data = typeof HUD_DATA !== "undefined" ? HUD_DATA : null;
      if (data && data.coins && data.coins.points != null) coins = Number(data.coins.points) || 0;
      else if (data && data.practice && data.practice.points != null) coins = Number(data.practice.points) || 0;
    } catch (_) {}
    const label = document.getElementById("hud-coins-label");
    if (!coins && label) {
      const match = label.textContent.match(/([\d,]+)/);
      if (match) coins = parseInt(match[1].replace(/,/g, ""), 10) || 0;
    }
    return Math.max(0, Math.floor(coins));
  }

  function coinsEarned() {
    const source = rawCoinsEarned();
    let roadHighWater = 0;
    let sourceHighWater = 0;
    let scaleVersion = 0;
    try {
      roadHighWater = Math.max(0, parseInt(localStorage.getItem(COIN_HIGH_WATER_KEY) || "0", 10) || 0);
      sourceHighWater = Math.max(0, parseInt(localStorage.getItem(COIN_SOURCE_HIGH_WATER_KEY) || "0", 10) || 0);
      scaleVersion = Math.max(0, parseInt(localStorage.getItem(COIN_SCALE_VERSION_KEY) || "0", 10) || 0);
    } catch (_) {}

    // Crates come from what you actually do, not from a lifetime total credited backwards.
    // V2 multiplied the legacy practice points by 20 and called that the road score, which put
    // a long-standing total (1626 points -> 32520) past 13 of the 39 nodes at once, so the
    // shell opened with a pile of claimable crates that were never earned on the road.
    // V3 baselines the road at zero and starts counting from where the player stands now.
    if (scaleVersion < COIN_ROAD_SCALE_VERSION) {
      roadHighWater = 0;
      sourceHighWater = source;
      try {
        localStorage.setItem(COIN_HIGH_WATER_KEY, String(roadHighWater));
        localStorage.setItem(COIN_SOURCE_HIGH_WATER_KEY, String(sourceHighWater));
        localStorage.setItem(COIN_SCALE_VERSION_KEY, String(COIN_ROAD_SCALE_VERSION));
      } catch (_) {}
    }

    if (source > sourceHighWater) {
      roadHighWater += (source - sourceHighWater) * COIN_ROAD_SCALE;
      sourceHighWater = source;
      try {
        localStorage.setItem(COIN_HIGH_WATER_KEY, String(roadHighWater));
        localStorage.setItem(COIN_SOURCE_HIGH_WATER_KEY, String(sourceHighWater));
      } catch (_) {}
    }
    // Only genuinely earned progress counts. The old max() against source * SCALE meant the
    // lifetime practice total kept re-satisfying the road even after a reset.
    return roadHighWater + lootCoinBonus();
  }

  function lootCoinBonus() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(LOOT_COIN_KEY) || "0", 10) || 0);
    } catch (_) {
      return 0;
    }
  }

  function awardLootCoins(amount, reason, silent) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return lootCoinBonus();
    const next = lootCoinBonus() + n;
    try { localStorage.setItem(LOOT_COIN_KEY, String(next)); } catch (_) {}
    if (!silent && typeof showToast === "function") showToast(`+${n} coins · ${reason || "cache"}`, "good");
    return next;
  }

  function soundsMuted() {
    try {
      const raw = localStorage.getItem(SOUND_MUTE_KEY);
      if (raw == null) return true;
      return raw === "1";
    } catch (_) {
      return true;
    }
  }

  function setSoundsMuted(muted) {
    try { localStorage.setItem(SOUND_MUTE_KEY, muted ? "1" : "0"); } catch (_) {}
  }

  function activeBoost(id) {
    const until = readState().boosts?.[id] || 0;
    return until > Date.now();
  }

  function worldSkinIds() {
    return Object.values(SKINS).filter(skin => skin.world).map(skin => skin.id);
  }

  function collectibleCatalog(kind) {
    if (kind === "pin") return PINS;
    if (kind === "stamp") return STAMPS;
    if (kind === "charm") return CHARMS;
    if (kind === "title") return TITLES;
    return null;
  }

  function collectibleBag(state, kind) {
    if (kind === "pin") return state.pins;
    if (kind === "stamp") return state.stamps;
    if (kind === "charm") return state.charms;
    if (kind === "title") return state.titles;
    return [];
  }

  function activeSkin() {
    const state = readState();
    return skinById(state.activeSkin) || SKINS.trailblazer;
  }

  function equippedLootPower() {
    const skin = activeSkin();
    return LOOT_POWERS[skin.id] || LOOT_POWERS[skin.effect] || LOOT_POWERS.trailblazer;
  }

  function equippedPityBonus() {
    const power = equippedLootPower();
    let extra = Math.max(0, Math.floor(Number(power.pity) || 0));
    try {
      const owned = JSON.parse(localStorage.getItem("waypointLootUpgrades") || "[]");
      if (Array.isArray(owned) && owned.includes("luck")) extra += 2;
    } catch (_) {}
    return extra;
  }

  function unlockMeme(id) {
    if (!id || memeUnlocks[id]) return;
    memeUnlocks[id] = true;
    const call = typeof api === "function" ? api : null;
    if (!call) return;
    Promise.resolve(call(`/api/achievements/${id}`, { method: "POST" })).then(res => {
      if (!res || res.error) return;
      if (res.already) return;
      if (res.coins) awardLootCoins(res.coins, res.title || "Odd feat");
      if (res.title && typeof showToast === "function") showToast(res.title, "good");
    }).catch(() => {});
  }

  function unlockSkin(id, reason) {
    const skin = skinById(id);
    if (!skin) return false;
    const state = readState();
    const isNew = !state.unlockedSkins.includes(id);
    if (isNew) state.unlockedSkins.push(id);
    state.activeSkin = id;
    writeState(state);
    updateProfileChip();
    if (isNew && typeof showToast === "function") showToast(`${skin.name} skin unlocked · ${reason || "reward"}`, "good");
    return isNew;
  }

  function addPieces(id, amount, reason) {
    if (!MYTHIC_PIECE_IDS.includes(id)) return false;
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return false;
    const state = readState();
    state.pieces[id] = Math.min(MYTHIC_PIECES_REQUIRED, (state.pieces[id] || 0) + n);
    writeState(state);
    const skin = skinById(id);
    if (typeof showToast === "function") {
      showToast(`+${n} ${skin?.name || "Mythic"} puzzle piece${n === 1 ? "" : "s"} · ${reason || "reward"}`, "good");
    }
    return true;
  }

  function assembleSkin(id) {
    if (!MYTHIC_PIECE_IDS.includes(id)) return false;
    const state = readState();
    if (state.unlockedSkins.includes(id)) return false;
    if ((state.pieces[id] || 0) < MYTHIC_PIECES_REQUIRED) {
      if (typeof showToast === "function") showToast(`Need ${MYTHIC_PIECES_REQUIRED - (state.pieces[id] || 0)} more puzzle pieces`, "info");
      return false;
    }
    const skin = skinById(id);
    if (!skin) return false;
    state.pieces[id] -= MYTHIC_PIECES_REQUIRED;
    state.unlockedSkins.push(id);
    state.activeSkin = id;
    writeState(state);
    updateProfileChip();
    if (typeof showToast === "function") showToast(`${skin.name} assembled and equipped`, "good");
    return true;
  }

  function equipSkin(id) {
    const state = readState();
    const skin = skinById(id);
    if (!skin || !state.unlockedSkins.includes(id)) return false;
    state.activeSkin = id;
    writeState(state);
    updateProfileChip();
    window.WaypointHabits?.observe("skin", id);
    window.dispatchEvent(new CustomEvent("waypoint:loot-event", { detail: { kind: "equip", id } }));
    if (skin.world) playWorldSting();
    else playCue("success");
    if (typeof showToast === "function") showToast(`${skin.name} equipped`, "good");
    return true;
  }

  function createCustomSkin(form) {
    const custom = readCustomSkins();
    if (custom.length >= CUSTOM_SKIN_LIMIT) {
      if (typeof showToast === "function") showToast(`Custom skin limit reached (${CUSTOM_SKIN_LIMIT})`, "info");
      return false;
    }
    const data = new FormData(form);
    const skin = normalizeCustomSkin({
      id: `custom-${Date.now().toString(36)}`,
      name: data.get("name"),
      glyph: data.get("glyph"),
      colorA: data.get("colorA"),
      colorB: data.get("colorB"),
      effect: data.get("effect"),
    });
    if (!skin) {
      if (typeof showToast === "function") showToast("Give your custom skin a name", "info");
      return false;
    }
    custom.push(skin);
    try { localStorage.setItem(CUSTOM_SKINS_KEY, JSON.stringify(custom)); } catch (_) { return false; }
    const state = readState();
    if (!state.unlockedSkins.includes(skin.id)) state.unlockedSkins.push(skin.id);
    state.activeSkin = skin.id;
    writeState(state);
    updateProfileChip();
    if (typeof showToast === "function") showToast(`${skin.name} created and equipped`, "good");
    window.dispatchEvent(new CustomEvent("waypoint:loot-event", { detail: { kind: "custom-skin", name: skin.name } }));
    return true;
  }

  function deleteCustomSkin(id) {
    const custom = readCustomSkins();
    const skin = custom.find(entry => entry.id === id);
    if (!skin) return false;
    try {
      localStorage.setItem(CUSTOM_SKINS_KEY, JSON.stringify(custom.filter(entry => entry.id !== id)));
    } catch (_) {
      return false;
    }
    const state = readState();
    state.unlockedSkins = state.unlockedSkins.filter(skinId => skinId !== id);
    if (state.activeSkin === id) state.activeSkin = "trailblazer";
    writeState(state);
    updateProfileChip();
    if (typeof showToast === "function") showToast(`${skin.name} deleted`, "info");
    return true;
  }

  function applyUnlockEffects() {
    const state = readState();
    document.body.classList.toggle("loot-confetti-grand", state.unlocks.includes("festival"));
    document.body.classList.toggle("loot-companion-nebula", state.companionTheme === "nebula");
    document.body.classList.toggle("loot-companion-ember", state.companionTheme === "ember");
    const skin = activeSkin();
    const root = document.documentElement;
    const effect = SKIN_EFFECTS.includes(skin.effect) ? skin.effect : "none";
    const pattern = skinPattern(skin);
    const place = skinPlace(skin);
    // Trailblazer is the old copperplate default: emojis, no player-skin chrome.
    if (skin.id === "trailblazer") {
      delete root.dataset.playerSkin;
      delete root.dataset.skinFamily;
      delete root.dataset.skinEffect;
      delete root.dataset.skinPattern;
      delete root.dataset.skinPlace;
      delete root.dataset.worldSkin;
      root.classList.remove("loot-world-skin");
      root.style.removeProperty("--skin-a");
      root.style.removeProperty("--skin-b");
      delete root.dataset.skinRarity;
    } else {
      root.dataset.playerSkin = skin.id;
      root.dataset.skinRarity = skin.rarity || "common";
      root.dataset.skinEffect = effect;
      root.dataset.skinPattern = pattern;
      root.dataset.skinPlace = place;
      root.dataset.skinFamily = (typeof window.wpSkinFamily === "function" && window.wpSkinFamily(skin.id)) || "compass";
      if (skin.world) root.dataset.worldSkin = skin.id;
      else delete root.dataset.worldSkin;
      root.classList.toggle("loot-world-skin", !!skin.world);
      root.style.setProperty("--skin-a", skin.colorA);
      root.style.setProperty("--skin-b", skin.colorB);
    }
    root.dataset.companionCharm = state.activeCharm || "";
    root.dataset.playerTitle = state.activeTitle || "";
    syncWorldLayer(skin);
    Array.from(document.body.classList)
      .filter(name => name.startsWith("loot-skin-fx-"))
      .forEach(name => document.body.classList.remove(name));
    document.body.classList.add(`loot-skin-fx-${effect}`);
    document.documentElement.dataset.skinPower = equippedLootPower().label || skin.effect || "none";
    const topHud = document.getElementById("top-hud");
    if (topHud) {
      Array.from(topHud.classList)
        .filter(name => name.startsWith("hud-skin-fx-"))
        .forEach(name => topHud.classList.remove(name));
      topHud.classList.add(`hud-skin-fx-${effect}`);
    }
    if (typeof window.wpRefreshSkinChrome === "function") window.wpRefreshSkinChrome();
  }

  function updateProfileChip() {
    const skin = activeSkin();
    const complete = !!getQuestState().todayComplete;
    document.querySelectorAll("[data-loot-profile]").forEach(chip => {
      chip.dataset.skin = skin.id;
      Array.from(chip.classList).filter(name => name.startsWith("loot-skin-")).forEach(name => chip.classList.remove(name));
      chip.classList.add(`loot-skin-${skin.id}`);
      chip.style.setProperty("--skin-a", skin.colorA || "");
      chip.style.setProperty("--skin-b", skin.colorB || "");
      chip.classList.toggle("loot-profile-chip--complete", complete);
      const glyph = chip.querySelector(".loot-profile-glyph");
      const name = chip.querySelector(".loot-profile-name");
      const status = chip.querySelector(".loot-profile-copy small");
      if (glyph) glyph.innerHTML = (window.wpSkinMark && window.wpSkinMark(skin)) || esc(skin.glyph);
      if (name) name.textContent = skin.name;
      const title = TITLES[readState().activeTitle];
      if (status) status.textContent = complete ? "TODAY COMPLETE" : (title ? title.name : skinCollectionStatus());
      chip.title = `${title ? `${title.name} · ` : ""}${skin.name} · open skin locker`;
    });
    applyUnlockEffects();
  }

  function profileHtml() {
    const skin = activeSkin();
    const state = readState();
    const questState = getQuestState();
    const complete = !!questState.todayComplete;
    return `<button type="button" class="loot-profile-chip loot-skin-${esc(skin.id)}${complete ? " loot-profile-chip--complete" : ""}"${skinStyle(skin)} data-loot-profile data-skin="${esc(skin.id)}" title="${esc(skin.name)} · open skin locker">
      <span class="loot-profile-glyph" aria-hidden="true">${(window.wpSkinMark && window.wpSkinMark(skin)) || esc(skin.glyph)}</span>
      <span class="loot-profile-copy"><strong class="loot-profile-name">${esc(skin.name)}</strong><small>${complete ? "TODAY COMPLETE" : skinCollectionStatus(state)}</small></span>
    </button>`;
  }

  function refreshHud() {
    const clusterBtn = document.getElementById("hud-xp-btn");
    if (clusterBtn) {
      clusterBtn.title = "Open rewards · Coin Road, level, and gems";
    }

    const gems = document.getElementById("hud-gems-count");
    if (gems) {
      gems.hidden = false;
      gems.textContent = `💎 ${getGems().toLocaleString()}`;
      gems.setAttribute("title", "Open Gem Forge");
      gems.setAttribute("aria-label", `${getGems()} gems — open Gem Forge`);
    }

    const cluster = document.getElementById("hud-game-cluster");
    if (cluster) {
      let inventory = document.getElementById("loot-inventory-btn");
      if (!inventory) {
        inventory = document.createElement("button");
        inventory.type = "button";
        inventory.id = "loot-inventory-btn";
        inventory.className = "loot-inventory-btn";
        cluster.appendChild(inventory);
      }
      const state = readState();
      const remaining = state.chests.length + (state.activeOpening ? 1 : 0);
      inventory.innerHTML = `<span aria-hidden="true">📦</span><span>${escapeHtml(String(remaining))}</span>`;
      inventory.title = remaining ? `${remaining} loot ${remaining === 1 ? "cache" : "caches"} ready` : "Loot inventory";
      inventory.setAttribute("aria-label", inventory.title);
      inventory.classList.toggle("loot-inventory-btn--ready", remaining > 0);
    }
    updateProfileChip();
    refreshDailyHud();
  }

  function coinBurst(amount, anchor) {
    const n = Math.max(1, Math.floor(Number(amount) || 1)) * COIN_ROAD_SCALE;
    const target = anchor && anchor.nodeType === 1
      ? anchor
      : (document.getElementById("hud-coins-label") || document.getElementById("hud-xp-btn"));
    if (!target) return;
    coinsEarned();
    if (REDUCED_MOTION()) return;
    const previous = coinAwardAnimations.get(target);
    if (previous) previous.cancel();
    const award = target.animate([
      { transform: "translateZ(0) scale(1) rotate(0)" },
      { transform: "translateZ(0) scale(1.42) rotate(-3deg)", offset: 0.24 },
      { transform: "translateZ(0) scale(0.94) rotate(2deg)", offset: 0.52 },
      { transform: "translateZ(0) scale(1.1) rotate(0)", offset: 0.76 },
      { transform: "translateZ(0) scale(1) rotate(0)" },
    ], { duration: 720, easing: "cubic-bezier(.2,.9,.25,1)", fill: "none" });
    coinAwardAnimations.set(target, award);
    award.finished.catch(() => {}).finally(() => {
      if (coinAwardAnimations.get(target) === award) coinAwardAnimations.delete(target);
    });

    const rect = target.getBoundingClientRect();
    const burst = document.createElement("div");
    burst.className = "loot-coin-burst";
    burst.id = `loot-coin-burst-${++coinBurstSeq}`;
    burst.style.setProperty("--coin-origin-x", `${rect.left + rect.width / 2}px`);
    burst.style.setProperty("--coin-origin-y", `${rect.top + rect.height / 2}px`);
    const particleCount = getConfettiMultiplier() > 1 ? 32 : 24;
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.2;
      const distance = 48 + Math.random() * 72;
      const size = 15 + Math.round(Math.random() * 6);
      return `<i style="--coin-x:${(Math.cos(angle) * distance).toFixed(1)}px;--coin-y:${(Math.sin(angle) * distance).toFixed(1)}px;--coin-r:${Math.round(Math.random() * 300 - 150)}deg;--coin-delay:${Math.round(Math.random() * 90)}ms;--coin-size:${size}px"></i>`;
    }).join("");
    burst.innerHTML = `${particles}<strong>+${n.toLocaleString()}</strong>`;
    document.querySelectorAll(".loot-coin-burst").forEach((oldBurst, index, bursts) => {
      if (index < bursts.length - 2) oldBurst.remove();
    });
    document.body.appendChild(burst);
    burst.querySelector("strong")?.addEventListener("animationend", () => burst.remove(), { once: true });
  }

  function playTone(frequency, duration, volume) {
    playVoice(frequency, duration, "sine", volume);
  }

  function playVoice(frequency, duration, type, volume) {
    if (soundsMuted()) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume || 0.025, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function playNoise(duration, volume) {
    if (soundsMuted()) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      const length = Math.max(1, Math.floor(audioContext.sampleRate * duration));
      const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      gain.gain.setValueAtTime(volume || 0.03, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      source.connect(filter).connect(gain).connect(audioContext.destination);
      source.start();
    } catch (_) {}
  }

  function playCue(name) {
    const world = document.documentElement.dataset.worldSkin || "";
    const pack = WORLD_SOUNDS[world] || WORLD_SOUNDS[""];
    const cue = pack[name] || WORLD_SOUNDS[""][name];
    if (!cue) return;
    playVoice(cue[0], cue[1], cue[2], cue[3]);
    if (world === "parchment" || world === "isobar" || world === "signalbox") {
      if (name === "nav" || name === "chest") playNoise(world === "signalbox" ? 0.05 : 0.12, 0.02);
    }
  }

  function playWorldSting() {
    const world = document.documentElement.dataset.worldSkin || "";
    const pack = WORLD_SOUNDS[world] || WORLD_SOUNDS[""];
    playVoice(pack.success[0], 0.12, pack.success[2], pack.success[3]);
    window.setTimeout(() => playVoice(pack.nav[0], 0.14, pack.nav[2], pack.nav[3]), 90);
    window.setTimeout(() => playVoice(pack.chest[0], 0.2, pack.chest[2], pack.chest[3]), 180);
  }

  function syncWorldLayer(skin) {
    let layer = document.getElementById("loot-world-layer");
    if (!skin?.world) {
      layer?.remove();
      return;
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "loot-world-layer";
      layer.setAttribute("aria-hidden", "true");
      const shell = document.querySelector(".app-shell");
      if (shell) shell.insertBefore(layer, document.getElementById("main") || shell.firstChild);
      else document.body.appendChild(layer);
    }
    layer.className = `loot-world-layer loot-world-layer--${skin.id}`;
    if (skin.id === "nightmarket" || skin.id === "glasshouse" || skin.id === "parchment") {
      const count = skin.id === "glasshouse" ? 10 : 6;
      layer.innerHTML = Array.from({ length: count }, (_, i) => `<i style="left:${8 + i * 14}%;top:${10 + (i % 4) * 18}%;animation-delay:${i * 0.35}s"></i>`).join("");
    } else {
      layer.innerHTML = "";
    }
  }

  function rewardLabel(reward) {
    if (reward.kind === "gems") return `${reward.amount} gems`;
    if (reward.kind === "xp") return `${reward.amount} XP`;
    if (reward.kind === "coins") return `${reward.amount} coins`;
    if (reward.kind === "ticket") return `${reward.amount || 1} cache ticket${Number(reward.amount || 1) === 1 ? "" : "s"}`;
    if (reward.kind === "skin") return `${skinById(reward.id)?.name || "Mystery"} ${skinById(reward.id)?.world ? "world" : "skin"}`;
    if (reward.kind === "pieces") return `${reward.amount} ${skinById(reward.id)?.name || "Mythic"} puzzle piece${Number(reward.amount) === 1 ? "" : "s"}`;
    if (reward.kind === "chest") return `${reward.rarity || "common"} cache`;
    if (reward.kind === "bundle") return `${reward.gems || 0} gems + ${reward.chest || "common"} cache`;
    if (reward.kind === "pin") return `${PINS[reward.id]?.name || "Pin"}`;
    if (reward.kind === "stamp") return `${STAMPS[reward.id]?.name || "Stamp"}`;
    if (reward.kind === "charm") return `${CHARMS[reward.id]?.name || "Charm"}`;
    if (reward.kind === "title") return `${TITLES[reward.id]?.name || "Title"}`;
    if (reward.kind === "boost") return `${BOOSTS[reward.id]?.name || "Boost"}`;
    return "Reward";
  }

  function grantChest(options) {
    const opts = options || {};
    if (gameFeaturesHidden()) return;
    const state = readState();
    const quiet = lootQuietCfg();
    const today = new Date().toISOString().slice(0, 10);
    if (!state.quietGrantDay || state.quietGrantDay !== today) {
      state.quietGrantDay = today;
      state.quietGrantCount = 0;
    }
    const source = String(opts.source || "");
    const isRoad = /road|coin road/i.test(source);
    if (isRoad) {
      state.quietRoadTicks = (state.quietRoadTicks || 0) + 1;
      if (state.quietRoadTicks % Math.max(1, quiet.road_chest_every || 5) !== 0) {
        writeState(state);
        return;
      }
    } else if (!opts.starter && source !== "Ticket window") {
      if ((state.quietGrantCount || 0) >= (quiet.max_daily_chests || 1)) {
        writeState(state);
        return;
      }
      state.quietGrantCount = (state.quietGrantCount || 0) + 1;
    }
    const rarity = CHEST_RARITIES.includes(opts.rarity) ? opts.rarity : "common";
    state.chests.push({
      id: uid("cache"),
      rarity,
      source: opts.source || "Waypoint reward",
      taps: chestTapsFor(rarity, opts.taps),
      starter: !!opts.starter,
    });
    writeState(state);
    refreshHud();
    if (typeof showToast === "function") showToast(`${rarityTitle(rarity)} cache added`, "good");
  }

  function nextDuplicatePieceReward(state, duplicateId) {
    const pieceId = MYTHIC_PIECE_IDS[state.pieceCursor % MYTHIC_PIECE_IDS.length];
    state.pieceCursor = (state.pieceCursor + 1) % MYTHIC_PIECE_IDS.length;
    return {
      kind: "pieces",
      id: pieceId,
      amount: 1,
      icon: skinById(pieceId)?.glyph || "🧩",
      duplicateOf: duplicateId,
    };
  }

  function chestSkinReward(state, pool, forceLocked = false) {
    const ids = Array.isArray(pool) ? pool.filter(id => !!skinById(id)) : [];
    if (!ids.length) return null;
    const locked = ids.filter(id => !state.unlockedSkins.includes(id));
    const choices = forceLocked && locked.length ? locked : ids;
    const id = choices[Math.floor(Math.random() * choices.length)];
    if (state.unlockedSkins.includes(id)) return nextDuplicatePieceReward(state, id);
    return { kind: "skin", id, icon: skinById(id).glyph };
  }

  function weightedPick(entries) {
    const list = Array.isArray(entries) ? entries.filter(entry => entry && entry.weight > 0) : [];
    const total = list.reduce((sum, entry) => sum + entry.weight, 0);
    if (!list.length || total <= 0) return list[0] || null;
    let cursor = Math.random() * total;
    for (const entry of list) {
      cursor -= entry.weight;
      if (cursor <= 0) return entry;
    }
    return list[list.length - 1];
  }

  function pickCollectibleId(kind, state) {
    const catalog = collectibleCatalog(kind);
    if (!catalog) return null;
    const ids = Object.keys(catalog);
    const owned = collectibleBag(state, kind);
    const locked = ids.filter(id => !owned.includes(id));
    const pool = locked.length ? locked : ids;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function skinPoolForRarity(rarity) {
    if (rarity === "world") return worldSkinIds();
    if (rarity === "mythic") return Object.values(SKINS).filter(skin => skin.rarity === "mythic").map(skin => skin.id);
    return CHEST_SKIN_POOLS[rarity] || CHEST_SKIN_POOLS.common;
  }

  function rollSkinRarity(chestRarity) {
    const table = SKIN_RARITY_GIVEN_DROP[chestRarity] || SKIN_RARITY_GIVEN_DROP.common;
    const picked = weightedPick(Object.entries(table).map(([rarity, weight]) => ({ rarity, weight })));
    return picked?.rarity || "common";
  }

  function rollNonSkinReward(kind, chestRarity, state) {
    const roll = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    if (kind === "coins") {
      const spans = { common: [20, 80], rare: [80, 200], epic: [200, 500], legendary: [500, 1200] };
      const span = spans[chestRarity] || spans.common;
      return { kind: "coins", amount: roll(span[0], span[1]), icon: "◉" };
    }
    if (kind === "gems") {
      const spans = { common: [1, 2], rare: [2, 4], epic: [4, 7], legendary: [8, 12] };
      const span = spans[chestRarity] || spans.common;
      return { kind: "gems", amount: roll(span[0], span[1]), icon: "💎" };
    }
    if (kind === "ticket") return { kind: "ticket", amount: chestRarity === "legendary" ? 2 : 1, icon: "🎟️" };
    if (kind === "boost") {
      const ids = Object.keys(BOOSTS);
      const id = ids[Math.floor(Math.random() * ids.length)];
      return { kind: "boost", id, icon: "⏱️" };
    }
    if (kind === "pin" || kind === "stamp" || kind === "charm" || kind === "title") {
      const id = pickCollectibleId(kind, state);
      const item = collectibleCatalog(kind)?.[id];
      return { kind, id, icon: item?.glyph || "✦" };
    }
    if (kind === "xp") {
      const spans = { common: [60, 110], rare: [140, 220], epic: [260, 380], legendary: [420, 620] };
      const span = spans[chestRarity] || spans.common;
      return { kind: "xp", amount: roll(span[0], span[1]), icon: "✦" };
    }
    return { kind: "coins", amount: roll(20, 60), icon: "◉" };
  }

  function rollSkinSlot(state, chestRarity, forceRarity) {
    const rarity = forceRarity || rollSkinRarity(chestRarity);
    const pool = skinPoolForRarity(rarity);
    const forceLocked = !!forceRarity;
    if (rarity === "common") return chestSkinReward(state, CHEST_SKIN_POOLS.common);
    if (rarity === "rare") return chestSkinReward(state, CHEST_SKIN_POOLS.rare, forceLocked);
    if (rarity === "epic") return chestSkinReward(state, CHEST_SKIN_POOLS.epic, forceLocked);
    if (rarity === "legendary" || rarity === "world" || rarity === "mythic") {
      return chestSkinReward(state, pool, forceLocked) || chestSkinReward(state, CHEST_SKIN_POOLS.legendary, forceLocked);
    }
    return chestSkinReward(state, CHEST_SKIN_POOLS.common);
  }

  function resetPityFor(state, reward) {
    if (reward?.kind !== "skin") return;
    const skin = skinById(reward.id);
    if (!skin) return;
    if (skin.world) state.pity.world = 0;
    if (skin.rarity === "legendary" || skin.world) state.pity.legendary = 0;
    if (skin.rarity === "epic" || skin.rarity === "legendary" || skin.world) state.pity.epic = 0;
    if (skin.rarity !== "common" && skin.rarity !== "starter") state.pity.rare = 0;
  }

  function chestRewards(chest, existingState) {
    const state = existingState || readState();
    const persistGeneratedState = () => {
      if (!existingState) writeState(state);
    };
    if (chest.starter) {
      const skinReward = state.unlockedSkins.includes("moss")
        ? nextDuplicatePieceReward(state, "moss")
        : { kind: "skin", id: "moss", icon: SKINS.moss.glyph };
      persistGeneratedState();
      return [
        { kind: "gems", amount: 3, icon: "💎" },
        { kind: "xp", amount: 90, icon: "✦" },
        skinReward,
      ];
    }
    const rarity = CHEST_RARITIES.includes(chest.rarity) ? chest.rarity : "common";
    state.pity.rare += 1;
    state.pity.epic += 1;
    state.pity.legendary += 1;
    state.pity.world += 1;
    const pityExtra = equippedPityBonus();
    if (pityExtra) {
      state.pity.rare += pityExtra;
      state.pity.epic += pityExtra;
      state.pity.legendary += pityExtra;
      state.pity.world += pityExtra;
    }
    let forceRarity = "";
    if (state.pity.world >= PITY_LIMITS.world) forceRarity = "world";
    else if (state.pity.legendary >= PITY_LIMITS.legendary) forceRarity = "legendary";
    else if (state.pity.epic >= PITY_LIMITS.epic) forceRarity = "epic";
    else if (state.pity.rare >= PITY_LIMITS.rare) forceRarity = "rare";
    const table = (CHEST_KIND_TABLES[rarity] || CHEST_KIND_TABLES.common).map(entry => {
      if (entry.kind === "skin" && activeBoost("lucky")) return { ...entry, weight: entry.weight * 2 };
      return entry;
    });
    const slots = rarity === "common" ? 2 : 3;
    const rewards = [];
    rewards.push(rollNonSkinReward(rarity === "legendary" ? "gems" : "coins", rarity, state));
    if (slots > 2) rewards.push(rollNonSkinReward("xp", rarity, state));
    let kind = forceRarity ? "skin" : (weightedPick(table)?.kind || "coins");
    if (forceRarity) kind = "skin";
    const last = kind === "skin"
      ? (rollSkinSlot(state, rarity, forceRarity) || rollNonSkinReward("coins", rarity, state))
      : rollNonSkinReward(kind, rarity, state);
    rewards.push(last);
    resetPityFor(state, last);
    if (equippedLootPower().extraPrize) {
      rewards.push(rollNonSkinReward("coins", "common", state));
    }
    persistGeneratedState();
    return rewards;
  }

  function openNextChest() {
    if (gameFeaturesHidden()) return;
    closeShell();
    const state = readState();
    let opening = state.activeOpening;
    if (!opening) {
      const next = state.chests.shift();
      if (!next) {
        openShell("road");
        if (typeof showToast === "function") showToast("No loot caches waiting — quests and Coin Road award more", "info");
        window.dispatchEvent(new CustomEvent("waypoint:loot-event", { detail: { kind: "empty-cache" } }));
        refreshHud();
        return;
      }
      opening = { chest: next, tapsLeft: chestTapsFor(next.rarity, next.taps), phase: "tap", rewards: [], revealIndex: 0 };
      state.activeOpening = opening;
      writeState(state);
    }
    renderChestOverlay();
  }

  function renderChestOverlay() {
    document.getElementById("loot-chest-overlay")?.remove();
    const state = readState();
    const opening = state.activeOpening;
    if (!opening) return;
    // A close/reload during the charge should resume at rewards, never leave an
    // untappable chest waiting on a timer that no longer exists.
    if (opening.phase === "opening") {
      opening.phase = "reveal";
      writeState(state);
    }
    document.body.classList.add("loot-chest-open");
    const chest = opening.chest;
    const overlay = document.createElement("div");
    overlay.id = "loot-chest-overlay";
    overlay.className = `loot-chest-overlay loot-rarity-${esc(chest.rarity)} loot-chest-phase-${esc(opening.phase)}`;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `${chest.rarity} loot cache`);
    const remaining = state.chests.length;
    overlay.innerHTML = `
      <div class="loot-chest-aurora" aria-hidden="true"></div>
      <div class="loot-chest-vignette" aria-hidden="true"></div>
      <header class="loot-chest-head">
        <span>${esc(chest.rarity.toUpperCase())} CACHE</span>
        <span>${remaining} remaining</span>
      </header>
      <button type="button" class="loot-chest-close" aria-label="Close loot cache">×</button>
      <main class="loot-chest-main">
        <p class="loot-chest-source">${esc(chest.source)}</p>
        <div class="loot-chest-light" aria-hidden="true"></div>
        <div class="loot-chest-orbit" aria-hidden="true"></div>
        <div class="loot-chest-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <button type="button" class="loot-chest-object" id="loot-chest-object" aria-label="Tap cache to open">
          <span class="loot-chest-glow" aria-hidden="true"></span>
          <span class="loot-chest-lid"></span>
          <span class="loot-chest-body"><i></i></span>
          <span class="loot-chest-lock">W</span>
          <span class="loot-chest-shine" aria-hidden="true"></span>
        </button>
        <div class="loot-chest-counter" id="loot-chest-counter"><strong>${opening.tapsLeft}</strong><span>${opening.tapsLeft === 1 ? "TAP" : "TAPS"} TO BREAK THE SEAL</span></div>
        <p class="loot-chest-pity" id="loot-chest-pity">Pity ${state.pity.rare}/${PITY_LIMITS.rare} rare · climbs slowly</p>
        <button type="button" class="loot-brawl-btn" id="loot-brawl-btn">Brawl tap <span>×2</span></button>
        <section class="loot-reveal-stage" id="loot-reveal-stage" hidden></section>
      </main>`;
    document.body.appendChild(overlay);

    overlay.querySelector(".loot-chest-close").onclick = closeChestOverlay;
    overlay.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && opening.phase === "tap") {
        event.preventDefault();
        hitChest(1);
      }
      if (event.key === "Escape") closeChestOverlay();
    });
    overlay.querySelector("#loot-chest-object").onpointerdown = event => {
      event.preventDefault();
      const touchHits = event.pointerType === "touch" && event.isPrimary === false ? 2 : 1;
      hitChest(touchHits);
    };
    overlay.querySelector("#loot-brawl-btn").onclick = event => {
      event.preventDefault();
      hitChest(2);
    };
    if (opening.phase === "reveal" || opening.phase === "done") renderRevealStage();
    else overlay.querySelector("#loot-chest-object").focus({ preventScroll: true });
  }

  function hitChest(hits) {
    const state = readState();
    const opening = state.activeOpening;
    if (!opening || opening.phase !== "tap") return;
    const count = Math.max(1, Math.floor(Number(hits) || 1));
    opening.tapsLeft = Math.max(0, opening.tapsLeft - count);
    const overlay = document.getElementById("loot-chest-overlay");
    const object = document.getElementById("loot-chest-object");
    if (object) {
      const hit = (opening.chest.taps - opening.tapsLeft) / Math.max(1, opening.chest.taps);
      const wobble = 6 + hit * 10;
      playChestAnimation(object, [
        { transform: "scale(1) rotate(0) translateY(0)" },
        { transform: `scale(0.88) rotate(-${wobble}deg) translateY(8px)`, offset: 0.28 },
        { transform: `scale(1.16) rotate(${wobble * 0.6}deg) translateY(-10px)`, offset: 0.58 },
        { transform: "scale(1) rotate(0) translateY(0)" },
      ], { duration: 320, easing: "cubic-bezier(.18,1.4,.28,1)" });
      object.classList.add("loot-chest-object--hit");
      scheduleChestTimer(() => object.classList.remove("loot-chest-object--hit"), 280);
      if (!REDUCED_MOTION()) {
        const sparks = 5 + Math.floor(hit * 4);
        for (let i = 0; i < sparks; i++) {
          const impact = document.createElement("i");
          impact.className = "loot-chest-impact";
          impact.style.setProperty("--impact-x", `${18 + Math.random() * 64}%`);
          impact.style.setProperty("--impact-y", `${16 + Math.random() * 58}%`);
          object.appendChild(impact);
          impact.addEventListener("animationend", () => impact.remove(), { once: true });
        }
        sprayChestSparks(overlay || object, 8);
      }
    }
    if (overlay && !REDUCED_MOTION()) {
      overlay.classList.remove("loot-chest-overlay--flash");
      void overlay.offsetWidth;
      overlay.classList.add("loot-chest-overlay--flash");
    }
    playCue("chest");
    playTone(170 + (opening.chest.taps - opening.tapsLeft) * 40, 0.08, 0.02);
    const counter = document.getElementById("loot-chest-counter");
    if (counter) counter.innerHTML = `<strong>${escapeHtml(String(opening.tapsLeft))}</strong><span>${opening.tapsLeft === 1 ? "TAP" : "TAPS"} TO BREAK THE SEAL</span>`;
    if (opening.tapsLeft > 0) {
      writeState(state);
      return;
    }
    opening.phase = "opening";
    opening.rewards = chestRewards(opening.chest, state).map(reward => ({ ...reward, applied: false }));
    writeState(state);
    overlay?.classList.add("loot-chest-overlay--opening");
    object?.classList.add("loot-chest-object--open");
    document.getElementById("loot-brawl-btn")?.setAttribute("hidden", "");
    playCue("success");
    playTone(opening.chest.rarity === "legendary" ? 740 : opening.chest.rarity === "epic" ? 660 : 480, 0.5, 0.04);
    playTone(opening.chest.rarity === "legendary" ? 980 : 620, 0.22, 0.03);
    burstChestOpen(overlay, opening.chest.rarity);
    if (!REDUCED_MOTION() && overlay) {
      playChestAnimation(overlay, [
        { transform: "translateX(0) scale(1)" },
        { transform: "translateX(-9px) scale(1.02)" },
        { transform: "translateX(10px) scale(1.04)" },
        { transform: "translateX(-5px) scale(1.01)" },
        { transform: "translateX(0) scale(1)" },
      ], { duration: 520, easing: "cubic-bezier(.18,1.4,.28,1)" });
    }
    if (typeof api === "function") {
      api("/api/loot/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rarity: opening.chest.rarity,
          pity: state.pity,
          owned_count: state.unlockedSkins.length,
        }),
      }).catch(() => {});
    }
    scheduleChestTimer(() => {
      const latest = readState();
      if (!latest.activeOpening) return;
      latest.activeOpening.phase = "reveal";
      writeState(latest);
      renderRevealStage();
    }, REDUCED_MOTION() ? 180 : 820);
  }

  function renderRevealStage() {
    const state = readState();
    const opening = state.activeOpening;
    const overlay = document.getElementById("loot-chest-overlay");
    const stage = document.getElementById("loot-reveal-stage");
    if (!opening || !overlay || !stage) return;
    opening.phase = opening.revealIndex >= opening.rewards.length ? "done" : "reveal";
    writeState(state);
    overlay.className = `loot-chest-overlay loot-rarity-${esc(opening.chest.rarity)} loot-chest-phase-${esc(opening.phase)} loot-chest-overlay--opened`;
    stage.hidden = false;
    document.getElementById("loot-chest-object")?.setAttribute("hidden", "");
    document.getElementById("loot-chest-counter")?.setAttribute("hidden", "");
    document.getElementById("loot-brawl-btn")?.setAttribute("hidden", "");
    const revealed = opening.rewards.slice(0, opening.revealIndex);
    const cards = revealed.map((reward, index) => `
      <article class="loot-reward-card${index === revealed.length - 1 ? " loot-reward-card--new" : ""}" style="animation-delay:${index * 70}ms">
        <span>${esc(reward.icon || "✦")}</span><strong>${esc(rewardLabel(reward))}</strong>
      </article>`).join("");
    const done = opening.revealIndex >= opening.rewards.length;
    stage.innerHTML = `
      <p class="loot-reveal-kicker">${done ? "CACHE CLEARED" : `REWARD ${opening.revealIndex + 1} OF ${opening.rewards.length}`}</p>
      <div class="loot-reward-list">${cards || '<div class="loot-reward-mystery">?</div>'}</div>
      <button type="button" class="primary loot-reveal-next" id="loot-reveal-next">${done ? (state.chests.length ? "Open next cache" : "Collect & close") : "Reveal"}</button>`;
    stage.querySelector("#loot-reveal-next").onclick = () => {
      if (done) finishChest();
      else revealNextReward();
    };
    stage.querySelector("#loot-reveal-next").focus({ preventScroll: true });
  }

  function applyReward(reward, source) {
    if (reward.kind === "gems") awardGems(reward.amount, source);
    else if (reward.kind === "xp" && window.WaypointGame && typeof window.WaypointGame.awardXp === "function") {
      window.WaypointGame.awardXp(reward.amount, source);
    } else if (reward.kind === "coins") {
      awardLootCoins(reward.amount, source);
    } else if (reward.kind === "ticket") {
      addTickets(reward.amount, source);
    } else if (reward.kind === "skin") {
      unlockSkin(reward.id, source);
    } else if (reward.kind === "pieces") {
      addPieces(reward.id, reward.amount, source);
    } else if (reward.kind === "chest") {
      grantChest({ rarity: reward.rarity, source });
    } else if (reward.kind === "bundle") {
      if (reward.gems) awardGems(reward.gems, source);
      if (reward.chest) grantChest({ rarity: reward.chest, source });
    } else if (reward.kind === "pin" || reward.kind === "stamp" || reward.kind === "charm" || reward.kind === "title") {
      unlockCollectible(reward.kind, reward.id, source);
    } else if (reward.kind === "boost") {
      grantBoost(reward.id, source);
    }
  }

  function addTickets(amount, reason) {
    const n = Math.max(1, Math.floor(Number(amount) || 1));
    const state = readState();
    state.tickets = (state.tickets || 0) + n;
    writeState(state);
    if (typeof showToast === "function") showToast(`+${n} cache ticket${n === 1 ? "" : "s"} · ${reason || "reward"}`, "good");
  }

  function redeemTicket() {
    const state = readState();
    if ((state.tickets || 0) < 1) {
      if (typeof showToast === "function") showToast("No cache tickets left", "info");
      return false;
    }
    state.tickets -= 1;
    writeState(state);
    grantChest({ rarity: "common", source: "Ticket window" });
    playCue("success");
    return true;
  }

  function unlockCollectible(kind, id, reason) {
    const catalog = collectibleCatalog(kind);
    const item = catalog?.[id];
    if (!item) return false;
    const state = readState();
    const bag = collectibleBag(state, kind);
    if (bag.includes(id)) {
      awardLootCoins(kind === "title" || kind === "charm" ? 80 : 30, `Duplicate ${item.name}`);
      return false;
    }
    bag.push(id);
    if (kind === "title" && !state.activeTitle) state.activeTitle = id;
    if (kind === "charm" && !state.activeCharm) state.activeCharm = id;
    writeState(state);
    updateProfileChip();
    if (typeof showToast === "function") showToast(`${item.name} collected · ${reason || "cache"}`, "good");
    return true;
  }

  function grantBoost(id, reason) {
    const boost = BOOSTS[id];
    if (!boost) return false;
    const state = readState();
    const until = Date.now() + boost.hours * 60 * 60 * 1000;
    state.boosts[id] = Math.max(state.boosts[id] || 0, until);
    writeState(state);
    if (typeof showToast === "function") showToast(`${boost.name} armed · ${reason || "cache"}`, "good");
    return true;
  }

  function equipTitle(id) {
    const state = readState();
    if (id && !state.titles.includes(id)) return false;
    state.activeTitle = id || "";
    writeState(state);
    updateProfileChip();
    playCue("click");
    return true;
  }

  function equipCharm(id) {
    const state = readState();
    if (id && !state.charms.includes(id)) return false;
    state.activeCharm = id || "";
    writeState(state);
    updateProfileChip();
    playCue("click");
    return true;
  }

  function revealNextReward() {
    const state = readState();
    const opening = state.activeOpening;
    if (!opening || opening.revealIndex >= opening.rewards.length) return;
    const reward = opening.rewards[opening.revealIndex];
    if (!reward.applied) {
      reward.applied = true;
      opening.revealIndex += 1;
      writeState(state);
      applyReward(reward, `${opening.chest.rarity} cache`);
    }
    playCue("success");
    playTone(520 + opening.revealIndex * 100, 0.22, 0.035);
    renderRevealStage();
  }

  function finishChest() {
    const state = readState();
    const hasNext = state.chests.length > 0;
    state.activeOpening = null;
    writeState(state);
    closeChestOverlay();
    refreshHud();
    if (hasNext) openNextChest();
    else if (typeof showToast === "function") showToast("All cache rewards collected", "good");
  }

  function closeChestOverlay() {
    const overlay = document.getElementById("loot-chest-overlay");
    if (!overlay) return;
    if (overlay.dataset.closing === "1") return;
    overlay.dataset.closing = "1";
    clearChestTimers();
    const state = readState();
    if (state.activeOpening?.phase === "opening") {
      state.activeOpening.phase = "reveal";
      writeState(state);
    }
    document.body.classList.remove("loot-chest-open");
    if (REDUCED_MOTION() || typeof overlay.animate !== "function") {
      overlay.remove();
    } else {
      const closing = overlay.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 180, easing: "ease", fill: "forwards" },
      );
      closing.finished.catch(() => {}).finally(() => overlay.remove());
    }
    refreshHud();
  }

  function roadRewardApply(node) {
    applyReward(node.reward, `Coin Road · ${node.title}`);
  }

  function claimRoad(id, button) {
    const node = ROAD.find(item => item.id === id);
    if (!node || coinsEarned() < node.threshold) return;
    const state = readState();
    if (state.claims.includes(id)) return;
    state.claims.push(id);
    writeState(state);
    roadRewardApply(node);
    if (typeof showToast === "function") showToast(`${node.title} claimed · ${rewardLabel(node.reward)}`, "good");
    const card = button?.closest(".loot-road-node");
    if (!card || REDUCED_MOTION()) {
      renderShell();
      return;
    }
    button.disabled = true;
    button.textContent = "Claimed ✓";
    card.classList.remove("ready");
    card.classList.add("claimed", "claiming");
    playTone(720, 0.25, 0.035);
    scheduleShellTimer(renderShell, 560);
  }

  function purchaseGemItem(item, source, beforeGrant) {
    if (!item || !spendGems(item.cost, item.name)) {
      if (item && typeof showToast === "function") showToast(`Need ${item.cost - getGems()} more gems`, "info");
      return false;
    }
    if (beforeGrant) beforeGrant();
    (item.grants || []).forEach(reward => applyReward(reward, `${source} · ${item.name}`));
    return true;
  }

  function buyUnlock(id) {
    const item = SHOP.find(entry => entry.id === id);
    if (!item) return;
    if (!item.standing && !item.theme) {
      buyForgeDaily(id);
      return;
    }
    if (!shopItemOnSale(id) && !readState().unlocks.includes(id)) {
      if (typeof showToast === "function") showToast("That pack left with yesterday's caravan", "info");
      return;
    }
    const state = readState();
    if (state.unlocks.includes(id)) {
      if (item.theme) {
        state.companionTheme = item.theme;
        writeState(state);
        applyUnlockEffects();
        renderShell();
      }
      return;
    }
    if (!purchaseGemItem(item, "Gem Forge", () => {
      state.unlocks.push(id);
      if (item.theme) state.companionTheme = item.theme;
      writeState(state);
    })) return;
    applyUnlockEffects();
    if (id === "extra_pin" && typeof render === "function" && typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "Home") {
      render();
    }
    if (typeof showToast === "function") showToast(`${item.name} unlocked`, "good");
    renderShell();
  }

  function getQuestState() {
    if (window.WaypointGame && typeof window.WaypointGame.getState === "function") {
      try { return window.WaypointGame.getState() || {}; } catch (_) {}
    }
    return {};
  }

  function localDayKey(date) {
    const value = date || new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function readDailyMeta() {
    const today = localDayKey();
    let state = null;
    try { state = JSON.parse(localStorage.getItem(DAILY_META_KEY) || "null"); } catch (_) { state = null; }
    if (!state || state.date !== today) {
      state = { date: today, completedQuestKeys: [], claims: [], bazaarClaims: [], forgeClaims: [] };
      try { localStorage.setItem(DAILY_META_KEY, JSON.stringify(state)); } catch (_) {}
    }
    if (!Array.isArray(state.completedQuestKeys)) state.completedQuestKeys = [];
    if (!Array.isArray(state.claims)) state.claims = [];
    if (!Array.isArray(state.bazaarClaims)) state.bazaarClaims = [];
    if (!Array.isArray(state.forgeClaims)) state.forgeClaims = [];
    return state;
  }

  function writeDailyMeta(state) {
    try { localStorage.setItem(DAILY_META_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickWeighted(items, count, rng) {
    const pool = items.slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      const total = pool.reduce((sum, item) => sum + Math.max(1, Number(item.weight) || 1), 0);
      let roll = rng() * total;
      let idx = 0;
      while (idx < pool.length - 1) {
        const weight = Math.max(1, Number(pool[idx].weight) || 1);
        if (roll < weight) break;
        roll -= weight;
        idx += 1;
      }
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function standingShopItems() {
    return SHOP.filter(item => item.standing);
  }

  function dayForgeItems() {
    const day = localDayKey();
    const rng = seededRng(hashString(`forge:${day}`));
    const rotating = SHOP.filter(item => !item.standing);
    const rare = rotating.filter(item => item.rare);
    const regular = rotating.filter(item => !item.rare);
    const stock = pickWeighted(regular, 4, rng);
    const dayHash = hashString(day);
    if (rare.length && dayHash % 7 === 0) {
      stock[Math.max(0, stock.length - 1)] = rare[dayHash % rare.length];
    } else if (rare.length && dayHash % 11 === 0) {
      stock.push(rare[dayHash % rare.length]);
    }
    return stock;
  }

  function shopItemOnSale(id) {
    const item = SHOP.find(entry => entry.id === id);
    if (!item) return null;
    if (item.standing) return item;
    if (readState().unlocks.includes(id)) return item;
    if (dayForgeItems().some(entry => entry.id === id)) return item;
    return null;
  }

  function dayBazaarItems() {
    const day = localDayKey();
    const seed = hashString(`bazaar:${day}`);
    const rng = seededRng(seed);
    const eligible = DAY_BAZAAR_PACKS.filter(item => {
      if (!item.rare) return true;
      return seed % Math.max(2, Number(item.rareEvery) || 7) === 0;
    });
    return pickWeighted(eligible, 3, rng);
  }

  function buyForgeDaily(id) {
    const item = dayForgeItems().find(entry => entry.id === id);
    const daily = readDailyMeta();
    if (!item) {
      if (typeof showToast === "function") showToast("That pack left with yesterday's caravan", "info");
      return;
    }
    if (daily.forgeClaims.includes(id)) return;
    if (!purchaseGemItem(item, "Gem Forge", () => {
      daily.forgeClaims.push(id);
      writeDailyMeta(daily);
    })) return;
    if (typeof showToast === "function") showToast(`${item.name} collected`, "good");
    window.dispatchEvent(new CustomEvent("waypoint:loot-event", { detail: { kind: "forge", id } }));
    renderShell();
  }

  function buyDayBazaar(id) {
    const item = dayBazaarItems().find(entry => entry.id === id);
    const daily = readDailyMeta();
    if (!item || daily.bazaarClaims.includes(id)) return;
    if (!purchaseGemItem(item, "Day Bazaar", () => {
      daily.bazaarClaims.push(id);
      writeDailyMeta(daily);
    })) return;
    if (typeof showToast === "function") showToast(`${item.name} collected`, "good");
    window.dispatchEvent(new CustomEvent("waypoint:loot-event", { detail: { kind: "bazaar", id } }));
    renderShell();
  }

  function dailyMetaSnapshot() {
    const state = readDailyMeta();
    const q = getQuestState();
    const total = Math.max(3, Math.min(4, Number(q.questLimit) || (q.questsToday || []).length || 3));
    return {
      date: state.date,
      completed: Math.min(total, state.completedQuestKeys.length),
      total,
      claims: state.claims.slice(),
    };
  }

  function refreshDailyHud() {
    const button = document.getElementById("hud-quests-btn");
    if (!button) return;
    const daily = dailyMetaSnapshot();
    let meter = document.getElementById("loot-daily-hud-meter");
    if (!meter) {
      meter = document.createElement("span");
      meter.id = "loot-daily-hud-meter";
      meter.className = "loot-daily-hud-meter";
      meter.setAttribute("aria-hidden", "true");
      meter.innerHTML = "<i></i>";
      button.appendChild(meter);
    }
    const pct = daily.total ? Math.min(100, (daily.completed / daily.total) * 100) : 0;
    meter.querySelector("i")?.style.setProperty("width", `${pct.toFixed(1)}%`);
    meter.classList.toggle("complete", daily.completed >= daily.total);
    button.title = `Daily quests · meta rewards ${daily.completed}/${daily.total}`;
  }

  function syncDailyMeta() {
    const q = getQuestState();
    const selected = Array.isArray(q.questsToday) ? q.questsToday : [];
    if (!selected.length) {
      refreshDailyHud();
      return dailyMetaSnapshot();
    }
    const state = readDailyMeta();
    let changed = false;
    selected.forEach(quest => {
      if (!quest?.done || !quest.key || state.completedQuestKeys.includes(quest.key)) return;
      state.completedQuestKeys.push(quest.key);
      changed = true;
    });
    const completed = state.completedQuestKeys.length;
    const pending = DAILY_MILESTONES.filter(milestone => (
      milestone.count <= completed && !state.claims.includes(milestone.count)
    ));
    pending.forEach(milestone => state.claims.push(milestone.count));
    if (changed || pending.length) writeDailyMeta(state);
    pending.forEach(milestone => {
      applyReward(milestone.reward, `Daily route · ${milestone.label}`);
      if (typeof showToast === "function") {
        showToast(`Daily route ${milestone.count}/${dailyMetaSnapshot().total} · ${rewardLabel(milestone.reward)}`, "good");
      }
    });
    refreshDailyHud();
    return dailyMetaSnapshot();
  }

  function selectQuest(key) {
    if (!window.WaypointGame || typeof window.WaypointGame.selectQuest !== "function") return;
    const result = window.WaypointGame.selectQuest(key);
    if (result === false && typeof showToast === "function") showToast(`Choose up to ${questLimit()} pursuits`, "info");
    renderShell();
    refreshHud();
  }

  function claimDailyReward() {
    if (!window.WaypointGame || typeof window.WaypointGame.claimDailyReward !== "function") return false;
    if (!window.WaypointGame.claimDailyReward()) return false;
    const q = getQuestState();
    const rarity = (q.questsToday || []).length >= 4 ? "rare" : "common";
    grantChest({ rarity, source: "Daily pursuits" });
    closeShell();
    openNextChest();
    return true;
  }

  function shellTabButton(id, label, icon) {
    return `<button type="button" class="loot-shell-tab${activeTab === id ? " active" : ""}" data-loot-tab="${id}" role="tab" aria-selected="${activeTab === id ? "true" : "false"}"><span aria-hidden="true">${icon}</span>${label}</button>`;
  }

  function roadHtml() {
    const state = readState();
    const earned = coinsEarned();
    const max = ROAD[ROAD.length - 1].threshold;
    const progress = Math.min(100, (earned / max) * 100);
    const upcoming = ROAD.filter(node => !state.claims.includes(node.id)).slice(0, 5);
    const power = equippedLootPower();
    const formula = lootFormulaCache;
    const formulaParts = (formula?.parts || []).map(p =>
      `<li><strong>${esc(p.signal.replace(/_/g, " "))}</strong><span>+${esc(p.coins)}</span></li>`
    ).join("");
    const formulaBody = !formula
      ? "<p class=\"stub\">Log today, then this ledger fills.</p>"
      : formula.coins
        ? `<ul class="loot-formula-parts">${formulaParts}</ul><p class="loot-formula-total">Today mints <strong>${formula.coins}</strong> coins${formula.power?.label ? ` · ${esc(formula.power.label)}` : ""}.</p>`
        : "<p class=\"loot-formula-empty\">No day data yet — no coins. Paint hours, log a pulse, or play a minigame to mint.</p>";
    return `<section class="loot-road-panel">
      <header class="loot-panel-hero">
        <div><span class="loot-eyebrow">20× LIFETIME PRACTICE POWER</span><h2>Coin Road</h2><p>Road score magnifies each honestly earned practice coin. Your spendable wallet stays unchanged.</p></div>
        <strong class="loot-hero-balance"><small>ROAD SCORE</small>◉ ${earned.toLocaleString()}</strong>
      </header>
      <section class="loot-coin-formula" id="loot-coin-formula" aria-label="How coins are minted">
        <div><span class="loot-eyebrow">TODAY'S MINT</span><h3>Coin formula</h3>
          <p>Happiness, energy, painted hours, and games. Empty day log stays at zero.</p></div>
        <div class="loot-formula-body">${formulaBody}</div>
        <p class="loot-power-chip">${esc(power.label)}</p>
      </section>
      <div class="loot-road-next">
        <div><span class="loot-eyebrow">NEXT REWARDS</span><small>Scroll to scout ahead →</small></div>
        <div class="loot-road-next-strip">${upcoming.length ? upcoming.map(node => {
          const ready = earned >= node.threshold;
          return `<article class="${ready ? "ready" : ""}"><span>${node.icon}</span><div><strong>${esc(node.title)}</strong><small>${ready ? "READY TO CLAIM" : `◉ ${Math.max(0, node.threshold - earned).toLocaleString()} AWAY`}</small></div></article>`;
        }).join("") : '<article class="complete"><span>🏆</span><div><strong>Road cleared</strong><small>EVERY REWARD CLAIMED</small></div></article>'}</div>
      </div>
      <div class="loot-road-map" aria-label="${progress.toFixed(0)} percent of Coin Road">
        <div class="loot-road-track" aria-hidden="true"><i style="height:${progress.toFixed(2)}%"></i></div>
        <div class="loot-road-nodes">${ROAD.map((node, index) => {
          const claimed = state.claims.includes(node.id);
          const ready = earned >= node.threshold && !claimed;
          const previous = index ? ROAD[index - 1].threshold : 0;
          const legProgress = Math.min(100, Math.max(0, ((earned - previous) / Math.max(1, node.threshold - previous)) * 100));
          return `<article class="loot-road-node${claimed ? " claimed" : ready ? " ready" : " locked"}">
            <span class="loot-road-icon">${node.icon}</span>
            <div class="loot-road-copy"><small>MILESTONE ◉ ${node.threshold.toLocaleString()}</small><strong>${esc(node.title)}</strong><span>${esc(rewardLabel(node.reward))}</span>
              ${!claimed && !ready ? `<span class="loot-road-distance"><i style="width:${legProgress.toFixed(1)}%"></i></span><em>${Math.max(0, node.threshold - earned).toLocaleString()} road score to go</em>` : ""}
            </div>
            <button type="button" data-road-claim="${esc(node.id)}" ${ready ? "" : "disabled"}>${claimed ? "Claimed ✓" : ready ? "Claim reward" : "Locked"}</button>
          </article>`;
        }).join("")}</div>
      </div>
    </section>`;
  }

  function shopHtml() {
    const state = readState();
    const gems = getGems();
    const daily = readDailyMeta();
    const bazaar = dayBazaarItems();
    const forgeToday = dayForgeItems();
    const standing = standingShopItems();
    const renderItem = (item, dailyPack) => {
      const owned = dailyPack ? daily.forgeClaims.includes(item.id) : state.unlocks.includes(item.id);
      const activeTheme = item.theme && state.companionTheme === item.theme;
      let action = `Unlock · ${item.cost} 💎`;
      if (dailyPack && owned) action = "Collected ✓";
      else if (!dailyPack && owned) action = item.theme ? (activeTheme ? "Active ✓" : "Use theme") : "Unlocked ✓";
      const rare = !!item.rare;
      return `<article class="loot-shop-item${owned ? " owned" : ""}${item.featured ? " featured" : ""}${rare ? " loot-shop-item--rare" : ""}">
          <span class="loot-shop-icon">${item.icon}</span>
          <div>${item.badge ? `<small class="loot-shop-badge">${esc(item.badge)}</small>` : ""}${rare ? '<small class="loot-shop-badge loot-shop-badge--rare">RARE TODAY</small>' : ""}<h3>${esc(item.name)}</h3><p>${esc(item.description)}</p></div>
          <button type="button" data-shop-buy="${esc(item.id)}" ${(owned && !item.theme) || activeTheme ? "disabled" : ""}>${esc(action)}</button>
        </article>`;
    };
    return `<section class="loot-shop-panel">
      <header class="loot-panel-hero">
        <div><span class="loot-eyebrow">RESETS EACH LOCAL MIDNIGHT</span><h2>Gem Forge</h2><p>Gems buy less, and today's caravan is not yesterday's. Rare stalls appear only on some days.</p></div>
        <strong class="loot-hero-balance">💎 ${gems.toLocaleString()}</strong>
      </header>
      <section class="loot-day-bazaar">
        <header><div><span class="loot-eyebrow">NEW STOCK AT MIDNIGHT</span><h3>Day Bazaar</h3></div><small>${esc(daily.date)} · one of each per day</small></header>
        <div class="loot-day-bazaar-grid">${bazaar.map(item => {
          const claimed = daily.bazaarClaims.includes(item.id);
          return `<article class="${item.rare ? "loot-bazaar-rare" : ""}"><span>${item.icon}</span><div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p></div><button type="button" data-bazaar-buy="${esc(item.id)}" ${claimed ? "disabled" : ""}>${claimed ? "Collected ✓" : `${item.cost} 💎`}</button></article>`;
        }).join("")}</div>
      </section>
      <section class="loot-day-bazaar">
        <header><div><span class="loot-eyebrow">TODAY'S CARAVAN</span><h3>Forge packs</h3></div><small>Four rotating packs · rares are scarce</small></header>
        <div class="loot-shop-grid">${forgeToday.map(item => renderItem(item, true)).join("")}</div>
      </section>
      <div class="loot-shop-grid">${standing.map(item => renderItem(item, false)).join("")}</div>
    </section>`;
  }

  function collectionHtml(state) {
    const renderBag = (kind, catalog, owned, active, equipAttr) => {
      return Object.values(catalog).map(item => {
        const have = owned.includes(item.id);
        const on = active === item.id;
        return `<button type="button" class="loot-collection-card${on ? " active" : ""}" data-collect-equip="${equipAttr}" data-collect-id="${esc(item.id)}" ${have ? "" : "disabled"}>
          <span>${esc(item.glyph)}</span><strong>${esc(item.name)}</strong><small>${have ? (on ? "EQUIPPED" : item.rarity.toUpperCase()) : "LOCKED"}</small>
        </button>`;
      }).join("");
    };
    const boostLine = Object.keys(BOOSTS).map(id => {
      const until = state.boosts[id] || 0;
      const live = until > Date.now();
      return `<span>${esc(BOOSTS[id].name)} · ${live ? "armed" : "idle"}</span>`;
    }).join("");
    return `<section class="loot-collection-panel">
      <header class="loot-panel-hero">
        <div><span class="loot-eyebrow">NOT SKINS</span><h3>Pins, stamps, titles, charms</h3><p>Most caches drop these. World skins stay in the long tail, like a Brawl Stars legendary.</p></div>
        <button type="button" class="loot-sound-toggle" data-sound-toggle>${soundsMuted() ? "Sounds off · tap to enable" : "Sounds on"}</button>
      </header>
      <p class="waypoint-fun-line loot-ticket-window"${hideTicketWindow() ? " hidden" : ""}>🎟️ ${state.tickets || 0} cache tickets · redeem one for a common box.</p>
      <button type="button" class="pill loot-ticket-window" data-ticket-redeem ${(state.tickets || 0) < 1 || hideTicketWindow() ? "disabled" : ""} ${hideTicketWindow() ? "hidden" : ""}>Redeem ticket</button>
      <div class="loot-collection-grid">${renderBag("pin", PINS, state.pins, "", "pin")}</div>
      <div class="loot-collection-grid">${renderBag("stamp", STAMPS, state.stamps, "", "stamp")}</div>
      <div class="loot-collection-grid">${renderBag("title", TITLES, state.titles, state.activeTitle, "title")}</div>
      <div class="loot-collection-grid">${renderBag("charm", CHARMS, state.charms, state.activeCharm, "charm")}</div>
      <p class="waypoint-fun-line">${boostLine}</p>
    </section>`;
  }

  function lockerHtml() {
    const state = readState();
    const custom = readCustomSkins();
    const visibleSkins = allSkins().filter(skin => {
      if (lockerFilter === "all") return true;
      if (lockerFilter === "world") return !!skin.world;
      const rarity = skin.rarity === "starter" ? "common" : skin.rarity;
      return rarity === lockerFilter;
    });
    let tutorialSeen = false;
    try { tutorialSeen = localStorage.getItem(SKIN_TUTORIAL_KEY) === "true"; } catch (_) {}
    return `<section class="loot-locker-panel">
      <header class="loot-panel-hero">
        <div><span class="loot-eyebrow">PLAYER PROFILE</span><h2>Skin locker</h2><p>Color skins tint the kit. World skins rebuild every page — chrome, motion, and sound. Caches mostly drop coins, pins, and tickets now. Skins are scarce.</p></div>
        <strong class="loot-hero-balance">${skinCollectionStatus(state, custom)}</strong>
      </header>
      ${tutorialSeen ? "" : `<aside class="loot-skin-tutorial" role="dialog" aria-modal="false" aria-label="Skin locker tutorial">
        <span class="loot-skin-tutorial-glyph">🧭</span>
        <div><strong>Make Waypoint yours</strong><ol>
          <li>Unlock skins from Coin Road / caches / Gem Forge</li>
          <li>Click a card here to equip</li>
          <li>Your HUD, page, chips, and companion update immediately</li>
        </ol><div class="loot-skin-tutorial-actions"><button type="button" data-tutorial-demo>Try equip Trailblazer</button><button type="button" class="primary" data-tutorial-dismiss>Got it</button></div></div>
      </aside>`}
      <nav class="loot-skin-filters loot-skin-filters--compact" aria-label="Filter skins">
        <label class="loot-skin-filter-label">Rarity
          <select class="loot-skin-filter-select" aria-label="Filter skins" data-locker-filter-select>
            ${LOCKER_FILTERS.map(([id, label]) =>
              `<option value="${esc(id)}" ${lockerFilter === id ? "selected" : ""}>${esc(label)}</option>`
            ).join("")}
          </select>
        </label>
        <div class="loot-skin-filter-sr">${LOCKER_FILTERS.map(([id, label]) =>
        `<button type="button" class="${lockerFilter === id ? "active" : ""}" data-locker-filter="${id}" aria-pressed="${lockerFilter === id}">${label}</button>`
      ).join("")}${window.WaypointEggs?.secretFilterButton?.(lockerFilter) || ""}</div>
      </nav>
      <div class="loot-skin-grid">${visibleSkins.map(skin => {
        const unlocked = state.unlockedSkins.includes(skin.id);
        const active = state.activeSkin === skin.id;
        const rarity = skin.rarity === "starter" ? "common" : skin.rarity;
        const puzzle = !unlocked && MYTHIC_PIECE_IDS.includes(skin.id);
        const pieceCount = puzzle ? Math.min(MYTHIC_PIECES_REQUIRED, state.pieces[skin.id] || 0) : 0;
        const power = LOOT_POWERS[skin.id] || LOOT_POWERS[skin.effect];
        return `<article class="loot-skin-card loot-skin-${esc(skin.id)}${active ? " active" : ""}${unlocked ? "" : " locked"}${puzzle ? " loot-skin-card--puzzle" : ""}"${skinStyle(skin)} data-skin-rarity="${esc(rarity)}">
          <button type="button" class="loot-skin-equip" data-skin-equip="${esc(skin.id)}" ${unlocked ? "" : "disabled"}>
            ${skin.world ? '<span class="loot-world-badge">WORLD</span>' : ""}
            <span class="loot-skin-effect-badge" data-effect="${esc(skin.effect)}">${esc(effectLabel(skin.effect))}</span>
            <span class="loot-skin-avatar">${(window.wpSkinMark && window.wpSkinMark(skin)) || esc(skin.glyph)}</span>
            <strong>${esc(skin.name)}</strong>
            <small>${active ? `EQUIPPED · ${esc((power && power.label) || effectLabel(skin.effect).toUpperCase())}` : unlocked ? esc(skin.rarity.toUpperCase()) : "LOCKED"}</small>
            ${power && unlocked ? `<p class="wp-skin-power">${esc(power.label)}</p>` : ""}
            <p>${esc(skin.note)}</p>
          </button>
          ${puzzle ? `<div class="loot-puzzle-progress"><span>Puzzle ${pieceCount}/${MYTHIC_PIECES_REQUIRED}</span><button type="button" data-piece-assemble="${esc(skin.id)}" ${pieceCount >= MYTHIC_PIECES_REQUIRED ? "" : "disabled"}>Assemble</button></div>` : ""}
          ${skin.custom ? `<button type="button" class="loot-custom-delete" data-custom-skin-delete="${esc(skin.id)}" aria-label="Delete ${esc(skin.name)}">Delete</button>` : ""}
        </article>`;
      }).join("")}${window.WaypointEggs?.lockerSecretHtml?.(lockerFilter) || ""}</div>
      ${collectionHtml(state)}
      <section class="loot-custom-skin">
        <div><span class="loot-eyebrow">CUSTOM PROFILE</span><h3>Custom <small>${custom.length}/${CUSTOM_SKIN_LIMIT}</small></h3><p>Name a skin, choose two colors, pick a short glyph, and add an effect. Up to ${CUSTOM_SKIN_LIMIT} custom skins stay on this device.</p></div>
        <form id="loot-custom-skin-form">
          <label>Name<input name="name" maxlength="24" required placeholder="My Waypoint"></label>
          <label>Glyph<input name="glyph" maxlength="4" value="✦" aria-label="Custom skin glyph"></label>
          <label>Color one<input name="colorA" type="color" value="#22d3ee"></label>
          <label>Color two<input name="colorB" type="color" value="#7c3aed"></label>
          <label>Effect<select name="effect">${CUSTOM_SKIN_EFFECTS.map(effect => `<option value="${effect}"${effect === "bloom" ? " selected" : ""}>${effectLabel(effect)}</option>`).join("")}</select></label>
          <button type="submit" class="primary" ${custom.length >= CUSTOM_SKIN_LIMIT ? "disabled" : ""}>${custom.length >= CUSTOM_SKIN_LIMIT ? "Limit reached" : "Create & equip"}</button>
        </form>
      </section>
    </section>`;
  }

  function autoArmQuests() {
    const game = window.WaypointGame;
    if (!game || typeof game.selectQuest !== "function") return;
    const q = getQuestState();
    const selected = Array.isArray(q.questsToday) ? q.questsToday : [];
    const keys = new Set(selected.map(item => item.key || item));
    const limit = questLimit();
    const pool = Array.isArray(q.availableQuests) && q.availableQuests.length
      ? q.availableQuests
      : [{ key: "paint6" }, { key: "tasks3" }, { key: "pulse2" }, { key: "estimate1" }, { key: "actual1" }];
    pool.forEach(item => {
      const key = item.key || item;
      if (!key || keys.has(key) || keys.size >= limit) return;
      try {
        if (game.selectQuest(key) !== false) keys.add(key);
      } catch (_) {}
    });
    if (!document.getElementById("wp-quest-banner") && keys.size) {
      const toast = document.createElement("div");
      toast.id = "wp-quest-banner";
      toast.className = "wp-quest-banner";
      toast.textContent = "Daily quests are on — no accept needed.";
      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add("wp-quest-banner-out"), 2800);
      setTimeout(() => toast.remove(), 3400);
    }
  }

  function goBackALevel() {
    const xpKey = "gameXp";
    let xp = 0;
    try { xp = Math.max(0, parseInt(localStorage.getItem(xpKey) || "0", 10) || 0); } catch (_) { xp = 0; }
    if (window.WaypointGame && typeof window.WaypointGame.getState === "function") {
      const g = window.WaypointGame.getState() || {};
      if (Number.isFinite(g.xp)) xp = g.xp;
    }
    const levelFrom = typeof gameLevelFromXp === "function"
      ? gameLevelFromXp
      : (value) => Math.floor(Math.sqrt(Math.max(0, value) / 60)) + 1;
    const xpFor = typeof gameXpForLevel === "function"
      ? gameXpForLevel
      : (level) => 60 * (Math.max(1, level) - 1) * (Math.max(1, level) - 1);
    const level = levelFrom(xp);
    if (level <= 1) {
      if (typeof showToast === "function") showToast("Already at the first level", "info");
      return false;
    }
    const prev = Math.max(0, xpFor(level) - 1);
    try { localStorage.setItem(xpKey, String(prev)); } catch (_) {}
    if (typeof gameUpdateHud === "function") gameUpdateHud();
    window.dispatchEvent(new CustomEvent("waypoint:game-state"));
    if (typeof showToast === "function") showToast("Stepped back one level", "info");
    refreshHud();
    if (shell) renderShell();
    return true;
  }

  function questsHtml() {
    autoArmQuests();
    const q = getQuestState();
    const selected = q.questsToday || [];
    const candidates = selected.length ? selected : (q.availableQuests || []);
    const done = selected.filter(item => item.done).length;
    const total = selected.length;
    const daily = dailyMetaSnapshot();
    const dailyProgress = daily.total ? Math.min(100, (daily.completed / daily.total) * 100) : 0;
    const questTabs = {
      pulse2: "Today", tasks3: "Tasks", addtask2: "Tasks", reflect1: "Thinking",
      contract1: "Today", contact1: "Contacts", match1: "Practice", paint6: "Today",
      showup1: "Today", estimate1: "Tasks", actual1: "Tasks", book1: "Hub",
      blueprint1: "Practice", capture3: "Hub", overdue1: "Tasks", talk1: "Home",
    };
    const linkedTabs = [...new Set(selected.map(item => questTabs[item.key]).filter(Boolean))];
    const pursuitSubtitle = selected.length
      ? `${selected.length} live pursuit${selected.length === 1 ? "" : "s"} on ${linkedTabs.join(", ") || "your tabs"} — armed automatically.`
      : "Today's pursuits arm themselves. Play, paint, or log — no accept step.";
    return `<section class="loot-quests-panel">
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button type="button" class="ghost" id="loot-level-back" title="Step back one XP level">Go back a level</button>
      </div>
      <header class="loot-panel-hero">
        <div><span class="loot-eyebrow">AUTO TODAY</span><h2>Daily pursuits</h2><p>${esc(pursuitSubtitle)}</p></div>
        <strong class="loot-hero-balance">${done}/${total}</strong>
      </header>
      <section class="loot-daily-meta${daily.completed >= daily.total ? " complete" : ""}" aria-label="Daily route rewards ${daily.completed} of ${daily.total}">
        <div class="loot-daily-meta-head"><div><span class="loot-eyebrow">DAILY ROUTE</span><strong>${daily.completed >= daily.total ? "Route cleared" : `${daily.completed}/${daily.total} pursuit marks`}</strong></div><small>Resets each local day</small></div>
        <div class="loot-daily-meta-bar"><i style="width:${dailyProgress.toFixed(1)}%"></i></div>
        <div class="loot-daily-milestones">${DAILY_MILESTONES.slice(0, daily.total).map(milestone => {
          const claimed = daily.claims.includes(milestone.count);
          const reached = daily.completed >= milestone.count;
          return `<article class="${claimed ? "claimed" : reached ? "reached" : "locked"}"><span>${milestone.icon}</span><div><strong>${milestone.count} mark${milestone.count === 1 ? "" : "s"}</strong><small>${esc(rewardLabel(milestone.reward))}</small></div><b>${claimed ? "✓" : milestone.count}</b></article>`;
        }).join("")}</div>
      </section>
      <div class="loot-quest-summary${q.todayComplete ? " complete" : ""}">
        <div><strong>${q.todayComplete ? "TODAY COMPLETE" : "Pursuit board"}</strong><span>${q.todayComplete ? "A selected quest landed. Home and Today are marked." : "Complete any selected pursuit to light Today yellow."}</span></div>
        ${q.allQuestsDone && !q.dailyRewardClaimed ? '<button type="button" class="primary" id="loot-daily-claim">Claim daily cache</button>' : ""}
      </div>
      <div class="loot-quest-list">${candidates.map(item => {
        const chosen = selected.some(pursuit => pursuit.key === item.key);
        const pct = Math.min(100, item.target ? (item.progress / item.target) * 100 : 0);
        return `<button type="button" class="loot-quest-card${chosen ? " selected" : ""}${item.done ? " done" : ""}" data-quest-select="${esc(item.key)}" aria-pressed="${chosen ? "true" : "false"}">
          <span class="loot-quest-check">${item.done ? "✓" : chosen ? "●" : "○"}</span>
          <span class="loot-quest-copy"><strong>${esc(item.label)}</strong><small>${Math.min(item.target, item.progress)}/${item.target} · +${item.rewardXp || 40} XP</small><i><b style="width:${pct.toFixed(1)}%"></b></i></span>
          <span class="loot-quest-choice">${item.done ? "Done" : "Live"}</span>
        </button>`;
      }).join("")}</div>
    </section>`;
  }

  function renderShell() {
    if (!shell || !shell.isConnected) return;
    const state = readState();
    const panel = activeTab === "shop" ? shopHtml()
      : activeTab === "locker" ? lockerHtml()
      : activeTab === "quests" ? questsHtml()
      : activeTab === "feats" && window.WaypointEggs ? window.WaypointEggs.featsHtml()
      : roadHtml();
    shell.innerHTML = `
      <div class="loot-shell-backdrop" data-loot-close></div>
      <div class="loot-shell-dialog" role="dialog" aria-modal="true" aria-label="Waypoint rewards">
        <header class="loot-shell-head">
          <div class="loot-shell-brand"><span>W</span><strong>WAYPOINT REWARDS</strong></div>
          <div class="loot-shell-wallets"><span title="Coin Road lifetime score">◉ ${coinsEarned().toLocaleString()}</span><span>💎 ${getGems().toLocaleString()}</span><button type="button" id="loot-shell-inventory">📦 ${state.chests.length + (state.activeOpening ? 1 : 0)}</button></div>
          <button type="button" class="loot-shell-close" data-loot-close aria-label="Close">×</button>
        </header>
        <nav class="loot-shell-tabs" role="tablist">
          ${shellTabButton("road", "Coin Road", "◉")}
          ${shellTabButton("shop", "Gem Forge", "💎")}
          ${shellTabButton("quests", "Quests", "⚔")}
          ${window.WaypointEggs ? shellTabButton("feats", "Feats", "★") : ""}
          ${shellTabButton("locker", "Locker", activeSkin().glyph)}
        </nav>
        <div class="loot-shell-content">${panel}</div>
      </div>`;
    shell.querySelectorAll("[data-loot-close]").forEach(btn => { btn.onclick = closeShell; });
    shell.querySelectorAll("[data-loot-tab]").forEach(btn => {
      btn.onclick = () => {
        activeTab = btn.dataset.lootTab;
        renderShell();
      };
    });
    shell.querySelectorAll("[data-road-claim]").forEach(btn => { btn.onclick = () => claimRoad(btn.dataset.roadClaim, btn); });
    shell.querySelectorAll("[data-shop-buy]").forEach(btn => { btn.onclick = () => buyUnlock(btn.dataset.shopBuy); });
    shell.querySelectorAll("[data-bazaar-buy]").forEach(btn => { btn.onclick = () => buyDayBazaar(btn.dataset.bazaarBuy); });
    shell.querySelectorAll("[data-skin-equip]").forEach(btn => {
      btn.onclick = () => {
        equipSkin(btn.dataset.skinEquip);
        renderShell();
      };
    });
    shell.querySelectorAll("[data-piece-assemble]").forEach(btn => {
      btn.onclick = () => {
        if (assembleSkin(btn.dataset.pieceAssemble)) renderShell();
      };
    });
    shell.querySelectorAll("[data-locker-filter]").forEach(btn => {
      btn.onclick = () => {
        lockerFilter = btn.dataset.lockerFilter;
        renderShell();
      };
    });
    shell.querySelector("[data-locker-filter-select]")?.addEventListener("change", event => {
      lockerFilter = event.currentTarget.value || "all";
      renderShell();
    });
    shell.querySelectorAll("[data-custom-skin-delete]").forEach(btn => {
      btn.onclick = () => {
        if (deleteCustomSkin(btn.dataset.customSkinDelete)) renderShell();
      };
    });
    shell.querySelectorAll("[data-quest-select]").forEach(btn => {
      btn.onclick = () => {};
    });
    shell.querySelector("#loot-level-back")?.addEventListener("click", () => {
      goBackALevel();
    });
    shell.querySelector("#loot-daily-claim")?.addEventListener("click", claimDailyReward);
    shell.querySelector("#loot-shell-inventory")?.addEventListener("click", openNextChest);
    shell.querySelector("#loot-custom-skin-form")?.addEventListener("submit", event => {
      event.preventDefault();
      if (createCustomSkin(event.currentTarget)) renderShell();
    });
    shell.querySelector("[data-tutorial-demo]")?.addEventListener("click", () => {
      equipSkin("trailblazer");
      renderShell();
    });
    shell.querySelector("[data-tutorial-dismiss]")?.addEventListener("click", () => {
      try { localStorage.setItem(SKIN_TUTORIAL_KEY, "true"); } catch (_) {}
      renderShell();
    });
    shell.querySelector("[data-sound-toggle]")?.addEventListener("click", () => {
      setSoundsMuted(!soundsMuted());
      playCue("click");
      renderShell();
    });
    shell.querySelector("[data-ticket-redeem]")?.addEventListener("click", () => {
      if (redeemTicket()) renderShell();
    });
    shell.querySelectorAll("[data-collect-equip]").forEach(btn => {
      btn.onclick = () => {
        const kind = btn.dataset.collectEquip;
        const id = btn.dataset.collectId;
        if (kind === "title") equipTitle(id === readState().activeTitle ? "" : id);
        else if (kind === "charm") equipCharm(id === readState().activeCharm ? "" : id);
        renderShell();
      };
    });
    shell.querySelector("[data-egg-feats]")?.addEventListener("click", event => {
      const id = event.target.closest("[data-egg-feats]")?.dataset.eggFeats;
      if (id && window.WaypointEggs?.inspect) window.WaypointEggs.inspect(id);
    });
    shell.querySelector(".loot-shell-close")?.focus({ preventScroll: true });
    if (activeTab === "road") {
      scheduleShellTimer(() => {
        const list = shell?.querySelector(".loot-road-nodes");
        const target = list?.querySelector(".loot-road-node.ready, .loot-road-node.locked");
        if (list && target) list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 16);
      }, 0);
    }
  }

  function refreshCoinFormula() {
    if (typeof api !== "function") return;
    const painted = document.querySelectorAll(".tdy-hour-painted, [data-hour].painted").length
      || (typeof countPaintedHours === "function" ? countPaintedHours() : 0);
    Promise.resolve(api("/api/coins/from-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ painted_hours: painted, played_game: false }),
    })).then(res => {
      const next = res || { coins: 0, parts: [], reason: "no_data" };
      const same = JSON.stringify(lootFormulaCache || {}) === JSON.stringify(next);
      lootFormulaCache = next;
      if (!next.coins) unlockMeme("no-data-no-coin");
      if (!same && shell && activeTab === "road") renderShell();
    }).catch(() => {});
  }

  function injectLootGameStyles() {
    if (document.getElementById("loot-game-atelier")) return;
    const el = document.createElement("style");
    el.id = "loot-game-atelier";
    el.textContent = `
      html[wp-hide-game], html[data-hide-game="1"], html[data-hide-game="on"],
      body.wp-hide-game .hud-game-cluster, body.wp-hide-game #loot-shell,
      body.wp-hide-game #loot-inventory-btn, body.wp-hide-game #loot-chest-overlay,
      body.wp-hide-game .wp-arcade-fab, body.wp-hide-game .wp-arcade-overlay { display: none !important; }
      .loot-skin-filters--compact { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; padding: 0; border: none; background: transparent; backdrop-filter: none; }
      .loot-skin-filter-label { display: inline-flex; align-items: center; gap: 8px; font: 700 10px/1 var(--font-ui); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); }
      .loot-skin-filter-select { min-height: 32px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-card); color: var(--ink-primary); font: 800 12px/1 var(--font-ui); }
      .loot-skin-filter-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .loot-coin-formula { margin: 0 0 16px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 16px; background: color-mix(in srgb, var(--bg-card) 88%, var(--skin-a, #d97706) 6%); display: grid; gap: 8px; }
      .loot-formula-parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
      .loot-formula-parts li { display: flex; justify-content: space-between; font-size: 13px; }
      .loot-formula-total, .loot-formula-empty, .loot-power-chip { margin: 0; font-size: 13px; }
      .loot-power-chip { color: color-mix(in srgb, var(--skin-a, #d97706) 70%, var(--ink-primary)); font-weight: 700; }
      .wp-skin-power { margin: 4px 0 0; font-size: 11px; color: var(--ink-secondary); }
      .loot-chest-object--open .loot-chest-lid { transform: rotateX(-78deg) translateY(-28px) rotate(-8deg); transition: transform 620ms cubic-bezier(.18,1.2,.22,1); }
      .loot-chest-object--open .loot-chest-lock { opacity: 0; transform: translate(-50%, 18px) scale(.6); transition: 420ms ease; }
      .loot-chest-glow { position: absolute; inset: 8% 12% 18%; border-radius: 40%; background: radial-gradient(circle, color-mix(in srgb, var(--loot-a) 55%, #fff), transparent 70%); opacity: .35; pointer-events: none; animation: loot-chest-breathe 1.8s ease-in-out infinite; }
      .loot-chest-shine { position: absolute; inset: 18% 20% 40%; border-radius: 50%; pointer-events: none; background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,.45), transparent 70%); animation: loot-chest-shine 2.4s ease-in-out infinite; mix-blend-mode: screen; }
      .loot-chest-orbit { position: absolute; left: 50%; top: 46%; width: 280px; height: 280px; margin: -140px 0 0 -140px; border-radius: 50%; border: 1px dashed color-mix(in srgb, var(--loot-a) 45%, transparent); pointer-events: none; animation: loot-orbit-spin 9s linear infinite; opacity: .55; }
      .loot-chest-orbit::after { content: "✦"; position: absolute; top: -8px; left: 50%; color: var(--loot-a); text-shadow: 0 0 12px var(--loot-a); }
      .loot-chest-overlay--opening .loot-chest-glow { opacity: 1; transform: scale(1.4); }
      .loot-chest-overlay--burst .loot-chest-orbit { animation-duration: 1.2s; opacity: 1; }
      .loot-chest-pity { margin: 8px 0 0; color: rgba(255,255,255,.55); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
      .loot-reward-card { animation: loot-reward-pop 420ms cubic-bezier(.18,1.3,.22,1) both; }
      .loot-chest-fly { position: absolute; z-index: 9; pointer-events: none; font-size: 14px; color: #fff; text-shadow: 0 0 10px var(--loot-a); animation: loot-chest-fly 520ms ease-out forwards; }
      .loot-chest-burst { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
      .loot-chest-burst span { position: absolute; left: 50%; top: 48%; font-size: 18px; color: #fff; text-shadow: 0 0 14px var(--loot-a); animation: loot-chest-burst 1100ms cubic-bezier(.18,1.3,.22,1) both; }
      @keyframes loot-chest-breathe { 50% { transform: scale(1.08); opacity: .55; } }
      @keyframes loot-chest-shine { 0%, 100% { opacity: .15; transform: translateX(-12%) rotate(-8deg); } 50% { opacity: .7; transform: translateX(18%) rotate(8deg); } }
      @keyframes loot-orbit-spin { to { transform: rotate(360deg); } }
      @keyframes loot-chest-fly { to { transform: translate(var(--fly-x), var(--fly-y)) scale(.4); opacity: 0; } }
      @keyframes loot-chest-burst { from { opacity: 1; transform: translate(-50%, -50%) scale(.4); } to { opacity: 0; transform: translate(calc(-50% + var(--burst-x)), calc(-50% + var(--burst-y))) rotate(var(--burst-rot)) scale(1.15); } }
      @keyframes loot-reward-pop { from { opacity: 0; transform: translateY(16px) scale(.86); } to { opacity: 1; transform: none; } }
      .wp-quest-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 80; padding: 10px 16px; border-radius: 999px; background: color-mix(in srgb, var(--bg-card) 88%, #c9a227 12%); border: 1px solid color-mix(in srgb, #c9a227 40%, var(--border)); font: 700 12px/1.3 var(--font-ui); animation: wp-quest-in 420ms ease both; }
      .wp-quest-banner-out { opacity: 0; transform: translate(-50%, -8px); transition: 400ms ease; }
      @keyframes wp-quest-in { from { opacity: 0; transform: translate(-50%, -12px); } }
      @media (prefers-reduced-motion: reduce) {
        .loot-chest-glow, .loot-chest-shine, .loot-chest-orbit, .loot-reward-card, .wp-quest-banner, .loot-chest-fly, .loot-chest-burst span { animation: none !important; }
      }
    `;
    document.head.appendChild(el);
  }

  function applyHideGameChrome() {
    const hide = gameFeaturesHidden();
    document.body?.classList.toggle("wp-hide-game", hide);
    if (hide) {
      closeChestOverlay();
      closeShell();
      document.getElementById("loot-inventory-btn")?.setAttribute("hidden", "");
    } else {
      document.getElementById("loot-inventory-btn")?.removeAttribute("hidden");
    }
  }

  function openShell(tab) {
    if (gameFeaturesHidden()) return;
    closeHudDropdownSafe();
    activeTab = tab || activeTab || "road";
    if (!shell || !shell.isConnected) {
      shell = document.createElement("div");
      shell.id = "loot-shell";
      shell.className = "loot-shell";
      document.body.appendChild(shell);
    }
    if (window.WaypointEggs && typeof window.WaypointEggs.note === "function") {
      window.WaypointEggs.note("shell", tab || activeTab);
    }
    document.body.classList.add("loot-shell-open");
    renderShell();
    if (activeTab === "road") refreshCoinFormula();
    if (activeTab === "road" && typeof refreshHudData === "function") {
      Promise.resolve(refreshHudData()).then(() => {
        coinsEarned();
        if (shell && activeTab === "road") renderShell();
      }).catch(() => {});
    }
  }

  function closeShell() {
    clearShellTimers();
    if (!shell) return;
    shell.remove();
    shell = null;
    document.body.classList.remove("loot-shell-open");
  }

  function closeHudDropdownSafe() {
    try {
      if (typeof closeHudDropdown === "function") closeHudDropdown();
    } catch (_) {}
  }

  function globalCapture(event) {
    if (gameFeaturesHidden()) return;
    const coinsLabel = event.target.closest("#hud-coins-label, .hud-loot-coins");
    if (coinsLabel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openShell("road");
      return;
    }
    const gems = event.target.closest("#hud-gems-count");
    if (gems) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openShell("shop");
      return;
    }
    const inventory = event.target.closest("#loot-inventory-btn");
    if (inventory) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openNextChest();
      return;
    }
    const oldDailyReward = event.target.closest("#hud-chest-btn");
    if (oldDailyReward) {
      event.preventDefault();
      event.stopImmediatePropagation();
      claimDailyReward();
      return;
    }
    const quest = event.target.closest("#hud-quests-btn, #launcher-quest-radar");
    if (quest) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (quest.dataset.questDestination === "Practice" && typeof goToTab === "function") {
        closeShell();
        goToTab("Practice");
        return;
      }
      openShell("quests");
      return;
    }
    const profile = event.target.closest("[data-loot-profile]");
    if (profile) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openShell("locker");
    }
  }

  function init() {
    injectLootGameStyles();
    applyHideGameChrome();
    if (!initialized) {
      initialized = true;
      document.addEventListener("click", globalCapture, true);
      document.addEventListener("keydown", event => {
        if (gameFeaturesHidden()) return;
        if (event.key !== "Escape") return;
        if (document.getElementById("loot-chest-overlay")) closeChestOverlay();
        else if (shell) closeShell();
      });
      window.addEventListener("waypoint:gems", () => {
        if (gameFeaturesHidden()) return;
        refreshHud();
        if (shell) renderShell();
      });
      window.addEventListener("waypoint:game-state", () => {
        if (gameFeaturesHidden()) return;
        syncDailyMeta();
        refreshHud();
        if (shell && activeTab === "quests") renderShell();
      });
      window.addEventListener("pagehide", () => {
        clearChestTimers();
        clearShellTimers();
        document.querySelectorAll(".loot-coin-burst").forEach(burst => burst.remove());
      });
      window.addEventListener("waypoint:tab", event => {
        if (gameFeaturesHidden()) return;
        const tab = event.detail?.tab || "";
        if (!document.documentElement.dataset.worldSkin) return;
        if (tab && tab === playCue.lastTab) return;
        playCue.lastTab = tab;
        playCue("nav");
      });
      document.addEventListener("click", event => {
        if (gameFeaturesHidden()) return;
        if (!document.documentElement.dataset.worldSkin) return;
        if (event.target.closest(".tab-chip, .app-subnav-pill, [data-fast-tab], [data-tab]")) return;
        if (!event.target.closest("button, [role='button'], .launcher-card")) return;
        playCue("click");
      }, true);
      window.addEventListener("storage", event => {
        if (event.key === "wp-hide-game" || event.key === "waypointGameOff") {
          applyHideGameChrome();
          if (!gameFeaturesHidden()) init();
        }
      });
    }
    if (gameFeaturesHidden()) return;
    readState();
    applyUnlockEffects();
    syncDailyMeta();
    refreshHud();
    pullLootSync();
    refreshCoinFormula();
    autoArmQuests();
  }

  window.WaypointLoot = {
    init,
    open: openShell,
    openRoad: () => openShell("road"),
    openShop: () => openShell("shop"),
    openQuests: () => openShell("quests"),
    openFeats: () => openShell("feats"),
    openLocker: () => openShell("locker"),
    openNextChest,
    grantChest,
    coinBurst,
    awardLootCoins,
    hasUnlock,
    questLimit,
    getConfettiMultiplier,
    activeSkin,
    equippedPower: equippedLootPower,
    profileHtml,
    getState: () => publicState(readState()),
    getDailyMeta: dailyMetaSnapshot,
    refreshHud,
    playCue,
    redeemTicket,
    goBackALevel,
    gameFeaturesHidden,
    unlockMeme,
  };
})();
