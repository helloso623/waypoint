# A. SHELL

## OWNED FILES
- `/workspace/plan/static/js/core.js`
- `/workspace/plan/static/js/misc.js`
- `/workspace/plan/static/index.html`
- `/workspace/plan/static/css/app.css`

## CURRENT STATE
- `core.js` owns global navigation contracts: `NAV_GROUPS`, `PAGE_INTENTS`, `WORKSPACE_APPS`, `renderTabBody()`, `render()`, `goToTab()`, `navBack()`, `navForward()`, `renderNav()`, `pageIntentHtml()`, `escapeHtml()`.
- `core.js` already has launcher primitives: `renderLauncher()`, `wireLauncher()`, `wireLauncherParallax()`, `startLauncherAmbient()`, `playLaunchTransition()`, `playHomeExitTransition()`, `refreshLauncherBadges()`, `launcherStatHtml()`.
- `core.js` already has HUD data plumbing: `refreshHudData()` lives in `misc.js`; `core.js` updates HUD context via `updateHudContext()` and top nav via `renderNav()`.
- `misc.js` owns shell behavior: `initHudInteractions()`, `showToast()`, `initGlobalKeyboard()`, `initCommandPalette()`, `openQuickCapture()`, `initQuickCaptureFab()`, `initPomodoroWidget()`, `wireTab()`, and the boot `init()` IIFE.
- `index.html` already contains `#top-hud`, `#nav`, `#main`, `#launch-overlay`, HUD buttons (`#hud-home`, `#nav-back`, `#nav-forward`, `#hud-tokens-btn`, `#hud-budget-btn`, `#hud-coins-btn`, `#hud-model-chip`, `#open-command-palette`), and script order ending with `misc.js`.
- `RICH_TOOLBAR_HTML` and `wireRichToolbar(editableId)` live in `core.js`; keep them exported as globals exactly as-is because Zone F and Obsidian depend on them.

## BUILD
- Replace any leftover sidebar/tab-navigation feel with the persistent top HUD: left-to-right `Waypoint logo/app switcher -> Back/Forward -> current app title + intention -> spacer -> tokens -> budget -> coins -> trophies -> streak -> offline/model state -> settings gear`.
- Use real data sources only: `/api/usage` for tokens/routing/model state, `/api/budget/report` for daily cap/spend and model split, `/api/practice/summary` for coins/streak/trophies unless later `/api/coins` exists; do not invent fake counters.
- Tokens format: `18.2k / 120k tokens`; dropdown shows today, 7-day, model split, largest 5 calls when available. Budget format: `$0.41 / $3.00` with 2px depletion bar, green under 50%, amber 50-80%, red over 80%.
- Coins format: `◉ 1,240`; dropdown explains earned from practice, spent in Parallel, pending bonuses. Trophies format `🏆 37`; streak format `🔥 12d` with truth panel (counted apps, missed days, no fake extensions).
- Offline/model chip labels are truthful: `Claude`, `OpenAI`, `Ollama`, `Offline`, or `Queued`, derived from current usage/routing/local availability.
- Home is a full-screen game launcher: cinematic dark background, ambient canvas, oversized app cards, controller-like focus ring, arrow-key navigation, Enter launch, `/` app search, `Esc` close/back to Home.
- App cards have identities: Planner calendar command center, Parallel fantasy RPG, Arcade neon arena, Blueprint Unreal-style graph, Docs/Lists capture identities, People relationship context, Settings/System control room. Each card shows 2-3 live stats from available endpoints only.
- Hover/focus: mouse parallax tilt, edge light, intention reveal, live-stat preview. At rest: one hero launcher stage and calm negative space.
- Launch transition beats: 0ms depress 4px+bloom; 80ms darken; 160ms scale 1.08; 260ms expand; 420ms glyph center sigil; 600ms color wash; 760ms app shell renders behind; 900ms wash wipes up; 1050ms HUD settles.
- Exit transition beats: 0ms app dims; 120ms snapshot shrinks; 300ms lands into launcher card; 480ms launcher cards re-parallax.
- Keyboard map: `Alt+H` Home, `Alt+Left/Right` history, `Cmd/Ctrl+K` palette, arrows launcher focus, Enter launch, Esc overlay/back, `/` app search. Preserve existing palette, quick capture, toast, Pomodoro, and `wireTab()` behavior.
- Motion tokens in CSS/JS: `instant 90ms`, `quick 160ms`, `standard 260ms`, `cinematic 760ms`, `epic 1050ms`; easing `easeOut`, `snap`, `heavy`. Respect `prefers-reduced-motion` with opacity fades under 160ms.
- Optional if time: WebAudio sound system default off, throttled, settings-controlled. This is optional only; all visual shell work is required.
- Apply RESTRAINT law: one hero element per screen, controls hidden until intent, max two accent colors at rest, spectacle only for launch/unlock/save/reward/warning, typography over borders, every animation must orient/confirm/warn/reward.
- Escape all dynamic content with `escapeHtml()`; keep global entry-point names unchanged; use scoped style prefixes (`hud-`, `launcher-`, `launch-`, `shell-`) for new classes; every HUD/dropdown/launcher panel needs graceful empty/error states.

## DO NOT
- Do not touch any file outside OWNED FILES.
- Do not rename/remove `renderTabBody()`, `render()`, `goToTab()`, `wireTab()`, `RICH_TOOLBAR_HTML`, `wireRichToolbar()`, `escapeHtml()`, command palette, quick capture, toasts, or keyboard entry points.
- Do not reintroduce old sidebar navigation furniture; compact in-app tab chips are allowed only when the current app needs mode switching.
- Do not fake usage, budget, coins, trophies, streak, or offline state.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/core.js
node --check plan/static/js/misc.js
curl -sf http://127.0.0.1:5099/api/usage | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/budget/report | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/practice/summary | python3 -m json.tool >/dev/null
```

# B. PLANNER

## OWNED FILES
- `/workspace/plan/static/js/today.js`
- `/workspace/plan/static/js/calendar.js`
- `/workspace/plan/static/js/tasks.js`

## CURRENT STATE
- `today.js` already has a partial hour-canvas state machine: `TDY_MODE`, `TDY_PAINT_PHASE`, `setTodayDirty()`, `resetTodayDirty()`, `initTodayHoursFromDay()`, `getHourCell()`, `setHourCell()`, `refreshHourCanvas()`, `updatePaintGhost()`, `wireTodayHourCanvas()`, `tdyHotkeyHandler()`.
- `today.js` renders `/api/day/<date>` in `renderToday()` and saves via `POST /api/day/<date>` in `wireToday()`; `navigateToPlannerDay()` and `tryNavigateTodayDate()` update `CURRENT_DATE`.
- `calendar.js` has month/list editing: `renderCalendar()`, `renderCalendarMonthGrid()`, `wireCalendarSharedControls()`, `wireCalendarMonthView()`, using `/api/calendar`, `/api/events`, Google sync/import endpoints.
- `tasks.js` has the urgency math already started: `taskProximityScore()`, `taskOverduePressure()`, `computeTaskUrgency()`, `urgencyChipHtml()`, plus views in `renderTasks()` and handlers in `wireTasks()`.
- Task endpoints already used: `GET/POST /api/tasks`, `PATCH /api/tasks/<id>`, `PATCH /api/tasks/reorder`, `POST /api/tasks/parse-freeform`, plus existing check/suggest/estimate endpoints.
- All three tabs are rendered by global `renderTabBody()` calling `renderToday()`, `renderTasks()`, or `renderCalendar()` and wired by `wireTab()`.

## BUILD
- Fuse Today, Calendar, and Tasks into one Planner experience. Today is the main entry; Calendar and Tasks may render the same fused shell with focused defaults.
- Three panes: left day/month/week strip, center hour canvas, right task rail. Clicking any day loads `/api/day/<date>` instantly; past days remain fully editable and show an honest historical-editing state.
- Center timeline uses drag-paint state machine exactly: `idle -> armed` on mousedown over hour cell, `painting` after pointer moves 4px or enters another hour, `committed` on mouseup.
- On mousedown capture start day/hour, show translucent ghost block, and lock page scrolling until mouseup. On pointer entering another hour/day, extend contiguous or rectangular ghost.
- On mouseup open compact category radial/menu at cursor unless category hotkey already selected. Hotkeys `1-9` preview category color while dragging and apply on commit.
- Fill handle: 9x9 bottom-right square, white border, category-colored center, cursor `crosshair`; drag repeats selected block across hours/days with dashed ghost copies and `repeat x3` label.
- Select-mode toolbar: `Done`, `Clear`, `Paint category`, `Assign task`, `Set project`, `Set energy`, `Copy`, `Paste`, `Repeat`, `Delete`, `Save`. Show spreadsheet blue outlines, row/day header highlight, and `12 cells selected`.
- Task rail filters per day: All, Due Today, Scheduled Today, Overdue, Project, Context, Energy, Estimated Time, Completed. Use existing tasks data; store unsaved frontend scheduling state until user saves or PATCHes task metadata.
- Urgency formula must be visible and exact: `urgency = 100 * (0.55 * importance^2 + 0.35 * deadline_proximity^2 + 0.10 * overdue_pressure)`, normalized 0-100. `deadline_proximity` = 1.0 today/overdue, taper quadratically to 0 over 14 days; overdue pressure grows but caps.
- Each task card shows `Urgency 84`; click expands `importance² 49 + deadline² 31 + overdue 4 = 84` and proximity text like `Due tomorrow: +31`, `Due in 9d: +6`, `Overdue 3d: capped +10`.
- Task-to-hour drag scheduling: dragging task makes valid hour blocks glow, timeline insertion line appears, rail says `Drop to schedule 2h`. Drop creates badge inside block; if estimate exceeds block show `needs 90m, block 60m`.
- Empty states exact: center `No hours painted — drag across the timeline to make the day honest.`; rail `No pressure captured — add one task or pull from backlog.`; strip `No commitments imported for this day. Manual planning still works.`
- Unsaved state: HUD title gets amber dot if accessible through existing globals; local Save button says `Save 18 changes`.
- Use existing endpoints only: `/api/day/<date>` for day hours, `/api/calendar` for commitments, `/api/tasks` and `PATCH /api/tasks/<id>` for task changes/reorder. No backend edits.
- Apply RESTRAINT law: the hour canvas is the hero; filters/tools recede until hover/selection/drag; animations clarify time and never decorate text entry.
- Escape all dynamic content with `escapeHtml()`; keep `renderToday()`, `wireToday()`, `renderCalendar()`, `wireCalendar()`, `renderTasks()`, `wireTasks()` entry points; use scoped style prefixes (`pln-`, or extend existing `tdy-`, `cal-`, `tsk-` without collisions); graceful empty/error states everywhere.

## DO NOT
- Do not touch backend files or any file outside OWNED FILES.
- Do not break current task creation/editing, calendar event CRUD/import/sync controls, day save, mood pulse, templates, attachments, freeform task parsing, or manual reorder.
- Do not make past days read-only.
- Do not fake scheduled task persistence beyond clear frontend-only state unless using existing `PATCH /api/tasks/<id>` fields.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/today.js
node --check plan/static/js/calendar.js
node --check plan/static/js/tasks.js
curl -sf http://127.0.0.1:5099/api/day/$(date +%F) | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/calendar | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/tasks | python3 -m json.tool >/dev/null
```

# C1. PARALLEL BACKEND

## OWNED FILES
- `/workspace/plan/parallel_life.py`
- `/workspace/plan/app.py`
- `/workspace/plan/db.py`

## CURRENT STATE
- `parallel_life.py` already owns state and engine: `ensure_initialized()`, `daily_tick()`, `state_summary()`, `_complete_play()`, `_apply_tick_result()`, `start_play()`, `play()`, `parallel_status()`.
- Structured RPG extraction is already partially prompted in `_complete_play()` and migrated in `_migrate_rpg_state()` for `inventory`, `characters`, `quests`, and `map`; extend this instead of starting over.
- Existing image infra: `illustrate_scene()`, `list_scene_urls()`, `illustrate_portrait()`, `list_portrait_urls()`, `get_map_info()`, `generate_map()`, `_generate_openai_image()`, image budget guards, `SCENES_DIR`, `PORTRAITS_DIR`, `WORLD_MAP_PATH`.
- Existing Bend Reality backend: `_compute_bend_price()`, `_fallback_bend_classification()`, `price_bend()`, `confirm_bend()`, `_run_bend_background()`, and app routes `/api/parallel/bend`, `/api/parallel/bend/confirm`.
- Existing app routes include `/api/parallel/state`, `/api/parallel/messages`, `/api/parallel/status`, `/api/parallel/say`, `/api/parallel/illustrate`, `/api/parallel/scenes`, `/api/parallel/journal`, `/api/parallel/portrait`, `/api/parallel/portraits`, `/api/parallel/map`, `/api/parallel/map/generate`, and legacy `/api/wallet`.
- `db.py` has `rp_messages`, `rp_state`, `rp_journal`, lazy `rp_scenes`, `rp_portraits`, and a legacy `wallet_transactions` helper set; practice points come from `practice_totals()`.

## BUILD
- Make `rp_state` extraction and migration maintain this structured shape at all times: `{ inventory: [], characters: [], quests: {active: [], rumors: [], consequences: [], completed: []}, map: {locations: [], discovered: []} }`, while preserving existing player/meta fields.
- Extraction prompt must stay conservative: only add/modify what the GM narration clearly established; never invent items, quests, map reveals, relationships, or progress.
- Inventory items: `{id, name, qty, rarity, effect, origin}`. Characters: stable `id`, name, role/archetype, traits, wounds/status, relationships, objective. Quests: objective, stakes, last_event, next_move, risk.
- Map state: locations with stable ids, coordinates, known/discovered flags, current position, routes, quest markers/recent event pulses. Persist fog/discovery data as JSON in `rp_state`.
- Portrait generation endpoint must reuse current illustrate infra. Keep `/api/parallel/portrait` and `/api/parallel/portraits`; cache by stable character id plus prompt hash. Prompt style: `painted fantasy character portrait, expressive face, 3/4 view, dramatic rim light, parchment UI compatible, no text, no watermark.`
- Map image endpoint must keep `/api/parallel/map/generate` and use prompt style: `top-down fantasy parchment map, readable regions, roads, coastlines, landmarks, blank label spaces, no text, no watermark.`
- Add explicit shared currency endpoint: `GET /api/coins` returns `{points, ledger_sum, balance, ledger:[...]}` where `points` is `/api/practice/summary` points via `db.practice_totals()`, `ledger_sum` is sum of coin ledger deltas, and `balance = points + ledger_sum`.
- Add `coin_ledger` table in `db.init_db()` with `id`, `delta`, `reason`, `created_at`; add helpers such as `coin_ledger_insert(delta, reason)`, `coin_ledger_recent(limit)`, `coin_ledger_sum()`. Do not print secrets in migrations/logs.
- Spending must be recorded in `coin_ledger`, not hidden in story state. Bend Reality confirm inserts negative delta reason like `Bend Reality: <trimmed request>` only after checking balance.
- Bend Reality pricing must match directive: cosmetic `10 + 2 * scene_age`; minor `30 + 5 * scene_age`; relationship/quest `80 + 10 * scene_age`; major survival/outcome `180 + 25 * scene_age`; block impossible contradictions. Multipliers: `1.5` affects another character, `2.0` removes consequence, `0.5` only clarifies ambiguity.
- Bend Reality preview response includes requested change, affected scenes, coin price, fairness warning, before/after summary, blocked status/block reason. Confirm applies as a canon-priced retcon message to the GM flow and journal kind `bend`.
- Keep `/api/wallet` working if current frontend still calls it, but its balance should reconcile to the new shared currency or clearly delegate to `/api/coins`.
- Apply RESTRAINT law through data: backend should support earned consequence, not fake progress. Return plain structured JSON, no HTML; frontend must escape. Preserve route names above; any new response fields must be additive. Scoped style prefix expectation for frontend consumers is `rpl-`; backend must not inject styles. Graceful `{ready:false, reason}` and `{error}` states on every route.

## DO NOT
- Do not touch `static/js/parallel.js`; Zone C2 owns it.
- Do not call cloud AI when budget/offline guards block it; return honest reason.
- Do not regenerate cached portraits/maps unless explicitly requested or prompt hash changed.
- Do not erase existing `rp_state`, messages, journal, scenes, portraits, or practice attempts.
- Do not let Bend Reality bypass causality or create free progress.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
python3 -m compileall -q plan
tmux -f /exec-daemon/tmux.portal.conf has-session -t =waypoint-local-server 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s waypoint-local-server -c /workspace/plan
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 C-c
sleep 1
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 'cd /workspace/plan && FLASK_HOST=0.0.0.0 PORT=5099 /workspace/.venv/bin/python app.py' C-m
sleep 3
curl -sf http://127.0.0.1:5099/api/parallel/state | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/parallel/status | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/coins | python3 -m json.tool >/dev/null
curl -sf -X POST http://127.0.0.1:5099/api/parallel/bend -H 'Content-Type: application/json' -d '{"request":"Clarify what I meant in the last scene without changing outcomes."}' | python3 -m json.tool >/dev/null
```

# C2. PARALLEL FRONTEND

## OWNED FILES
- `/workspace/plan/static/js/parallel.js`

## CURRENT STATE
- `parallel.js` already uses RPG globals and polling: `RPL_STATE`, `RPL_MESSAGES`, `RPL_JOURNAL`, `RPL_POLL_TIMER`, `RPL_API`, `parallelFetch()`, `rplPollStatus()`, `rplStartPolling()`, `rplRefreshAfterResolve()`.
- Existing route consumers include `/api/parallel/state`, `/api/parallel/messages?limit=50`, `/api/parallel/status`, `/api/parallel/say`, `/api/parallel/journal`, `/api/parallel/illustrate`, `/api/parallel/map`, `/api/parallel/portraits`, and legacy `/api/wallet`.
- The screen already has many RPG pieces: `rplGameShell()`, `rplHudStrip()`, `rplLeftRail()`, `rplRightRail()`, `rplRenderCharacterPanel()`, `rplRenderInventoryPanel()`, `rplRenderQuestsPanel()`, `rplRenderChroniclePanel()`, `rplOverlaysHtml()`, `rplAnimateCoins()`.
- Map/portrait helpers already exist: `rplFetchMap()`, `rplFetchPortraits()`, `rplPortraitUrl()`, `rplSilhouetteSvg()`, `rplSceneUrl()`, `rplSetBackdrop()`.
- Main entry points are `renderParallel()` and `wireParallel()`, called by global render/wire flow.

## BUILD
- Complete the tabletop RPG screen using the directive layout grid: top HUD 7%, main scene 63%, bottom command bar 14%, left rail 18% width, right rail 24% width, scene center remaining 58%.
- Six panels with exact empty states:
  1. Scene: generated/placeholder art, location, date, weather/mood, latest GM narration; empty `The world has not formed yet — begin with one action.`
  2. Character: portrait, name, class/archetype, traits, wounds, relationships, current objective; empty silhouette + `Character unknown.`
  3. Inventory: 5x4 parchment slot grid, deterministic/generated icon, rarity edge, quantity, effect tooltip, origin; empty `Your pack is empty. Earn or discover items.`
  4. Map: illustrated map image, fog overlay canvas, markers, current location pulse, route lines; empty parchment grid + `No map drawn yet.`
  5. Quests: tabs Active/Rumors/Consequences/Completed, objective, stakes, next move, risk; empty `No active quest is pulling on you.`
  6. Chronicle: paged book view of scenes, dates, choices, outcomes, thumbnails; empty `The chronicle begins after the first turn.`
- Top-right coins always visible. Prefer new `/api/coins` when available; gracefully fall back to `/api/wallet` or `/api/practice/summary`. Earn animation: 8-16 sprites arc to top-right over 700ms, counter ticks in final 200ms. Spend animation: red-gold flash, coins fall/fade, reason label like `-35 Bend Reality`.
- Bend Reality modal: requested change textarea, affected scenes, coin price, fairness warning, before/after summary, blocked state, confirm button `Pay and bend`; call `/api/parallel/bend` then `/api/parallel/bend/confirm`.
- Chronicle replaces generic chat-history feel: two-page spread, left page narration, right page choice/outcome/loot, page numbers, bookmark ribbon for major events. Keep raw history accessible only as a quiet secondary affordance if needed.
- Fog-of-war: draw canvas blobs over unknown map regions; discovered location erases radial mask based on persisted map discovered data; markers clickable with popovers.
- Portrait gallery: cards for player, allies, rivals, mentors; show cached AI portrait URL when present, deterministic stylized SVG silhouette fallback, `Regenerate portrait` only as intentional action.
- Poll-based UI only: status endpoint exists; avoid websockets. Keep `rplResumeBusyIfNeeded()` and status polling resilient.
- Rails collapse to icon stacks, never disappear. Calm at rest; spectacle only for dice suspense, consequence banners, coin changes, scene reveal, and Bend Reality.
- Escape all dynamic content with `escapeHtml()`; keep `renderParallel()` and `wireParallel()` entry points; use only `rpl-` scoped classes; every API failure gets graceful empty/error state, never a broken panel.

## DO NOT
- Do not touch backend files; Zone C1 owns routes/state/schema.
- Do not assume new backend fields are always present; preserve current fallback behavior.
- Do not remove command input, polling, message submission, illustration, or existing scene image support.
- Do not fake coins, quests, map discovery, portraits, or consequences.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/parallel.js
curl -sf http://127.0.0.1:5099/api/parallel/state | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/parallel/status | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/parallel/messages?limit=5 | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/parallel/map | python3 -m json.tool >/dev/null
```

# D. ARCADE

## OWNED FILES
- `/workspace/plan/static/js/practice.js`
- `/workspace/plan/practice_games.py`

## CURRENT STATE
- `practice.js` owns the tab entry points `renderPractice()` and `wirePractice()` plus shared stage helpers `praxOpenStage()`, `praxCloseStage()`, `praxStartRoundTimer()`, `praxRenderResult()`, `startPracticeGame()`.
- Existing local/AI game flow uses `/api/practice/games`, `/api/practice/<game_key>/start`, `/api/practice/<game_key>/submit`, `/api/practice/<game_key>/grade`, `/api/practice/summary`, `/api/practice/<game_key>/history`.
- Arcade layer already exists with localStorage state: `arcGetRival()`, `arcSaveRival()`, `arcGetLeague()`, `arcGetTrophies()`, `arcGetTrophyRoadProgress()`, `arcTrophyRoadHtml()`, `arcPlayButtonHtml()`, `arcStartMatch()`, `arcPlayMatchRound()`, `arcFinishCanvasGame()`.
- Canvas games already partially exist for `signal_storm` and `memory_constellation`: `arcGenerateSignalStormRound()`, `arcGenerateConstellationRound()`, `renderSignalStormGame()`, `renderMemoryConstellationGame()`.
- `practice_games.py` currently defines local generators/graders and `GAMES`, including `generate_signal_storm_round()` and `generate_memory_constellation_round()`, but `PRACTICE_GENERATORS` in `app.py` is not owned here.

## BUILD
- Primary Arcade view is one giant centered PLAY button; game grid becomes secondary `Training Lab`. Keep all existing games reachable in Training Lab.
- PLAY button: rounded hex/circle, min 280x280 desktop, 180x180 mobile, label `PLAY`, sublabel `Adaptive match`, 2.4s breathing scale, rotating neon rim, particle orbit; press depresses 8px, rim collapses, 90ms black snap, match intro.
- Pressing PLAY starts a random adaptive match against persistent rival. Rival state can be localStorage because backend ownership does not include DB/app routes. Include name, face/silhouette, league, title, Elo, mood, strengths, weaknesses, last adaptation, taunt.
- Rival "trains as you play": adjust speed/accuracy/distractor/logic profile after each match based on user history; post-match adaptation says exactly what changed.
- Leagues: Campus (blue/teal/white, lower stakes), Founder (amber/violet/black, higher confidence/difficulty), Mythic (crimson/gold/deep navy, highest stakes). Difficulty range and trophy stakes change by league.
- Trophy road: horizontal 10-node chunks, current node centered, locked visible/faded. First 10 nodes exactly: `1 +50 coins`, `2 Campus rival unlock`, `3 Signal Storm badge`, `4 +75 coins`, `5 bronze chest`, `6 Memory Constellation skin`, `7 +1 trophy`, `8 rival dialogue pack`, `9 +100 coins`, `10 Founder League qualifier`.
- Implement at least four named real canvas games, minimum: Signal Storm, Memory Constellation, Circuit Sprint, Time Forge. Signal and Memory may extend existing; Circuit and Time must be added as real canvas interactions.
- Signal Storm: target symbol top-left; click/drag matching moving symbols only while distractors mimic color/shape; score = hits * combo - false hits; juice = target explosions, combo lightning.
- Memory Constellation: nodes flash across star map; user redraws path under time pressure; score = path accuracy + speed; juice = stars ignite and constellation stamp.
- Circuit Sprint: drag logic/circuit components onto board before voltage decays; score = correctness + remaining voltage; juice = board lights up, voltage wave.
- Time Forge: hold/release to match hidden durations under distractions; score = timing accuracy streak; juice = anvil strike, molten perfect ring.
- Optional extra if time: Factory Routing and Pitch Dodge from directive, but do not cut the required four.
- Post-match anatomy: winner banner, user score, rival score, trophy delta, coin delta, skill breakdown, rival adaptation note, replay button, next PLAY. Include sentence form like `Accuracy rose 8%, reaction fell 3%, rival will train distractors next.`
- Fix all low-contrast text: game surfaces use `--ink-primary` or explicit high contrast; no grey-on-dark unreadable labels.
- Raise logic difficulty meaningfully: harder grids/clues/timers as difficulty increases, while preserving honest scoring.
- Because `app.py` is not owned, new purely frontend canvas games should submit results through existing `/api/practice/<game_key>/submit` only if `game_key` is already known by backend; otherwise keep local Arcade stats for those games and label local-only honestly. If adding keys in `practice_games.py`, document that app route wiring may be needed by another owner, but do not edit `app.py`.
- Apply RESTRAINT law: PLAY is the hero; Training Lab, stats, and road recede until intent; spectacle only for battle start, perfects, near misses, coins, trophies.
- Escape all dynamic content with `escapeHtml()`; keep `renderPractice()`, `wirePractice()`, and existing training entry points; use scoped `arc-` and existing `prax-` classes; empty/error states for no games, failed starts, local-only games.

## DO NOT
- Do not touch `app.py`, `db.py`, settings, or shell files.
- Do not remove existing games, daily check, long-term recall, AI-graded paths, reward themes, or existing `/api/practice/*` compatibility.
- Do not fake backend persistence; localStorage-only rival/trophy/canvas stats must be honest.
- Do not leave low-contrast text on canvas/stage surfaces.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/practice.js
python3 -m compileall -q plan
tmux -f /exec-daemon/tmux.portal.conf has-session -t =waypoint-local-server 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s waypoint-local-server -c /workspace/plan
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 C-c
sleep 1
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 'cd /workspace/plan && FLASK_HOST=0.0.0.0 PORT=5099 /workspace/.venv/bin/python app.py' C-m
sleep 3
curl -sf http://127.0.0.1:5099/api/practice/games | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/practice/summary | python3 -m json.tool >/dev/null
curl -sf -X POST http://127.0.0.1:5099/api/practice/logic/start | python3 -m json.tool >/dev/null
```

# E. BLUEPRINT

## OWNED FILES
- `/workspace/plan/static/js/automation.js`
- `/workspace/plan/workflow.py`

## CURRENT STATE
- `automation.js` owns entry points `renderAutomation()`, `wireAutomation()`, and `renderAutomationStudioView()`; routes used are `/api/workflows/node-types`, `/api/workflows`, `/api/workflows/<id>`, `/api/workflows/preview`, generate/suggest/explain/save-script.
- Graph state already contains nodes, edges, variables, functions, comments, notes via `freshWorkflow()`, `wfCloneGraph()`, `wfApplyGraph()`, `CURRENT_WF`.
- Many requested primitives exist partially: variables panel `wfVariablesPanelHtml()`, variable chips `wfVarChipHtml()`, context entries `wfVariableMenuEntries()`, undo/redo `wfPushUndo()`, `wfUndo()`, `wfRedo()`, copy/paste `wfCopySelection()`, `wfPasteAtCursor()`, minimap `wfDrawMinimap()`, `wfMinimapPanTo()`.
- Wire/pin helpers exist: `wfConnectEdge()`, `wfUpdatePinHighlights()`, `wfClearPinHighlights()`, `wfFlashPinReject()`, `wfPinTooltipText()`, `wfShowPinTooltip()`, `wfHidePinTooltip()`, `wfTypesMismatch()`, `wfPinTypeStyle()`.
- `workflow.py` defines `NODE_TYPES`, `P()`, `generate_code(graph)`, `_emit()`, `_data_in_value()`, `_data_out_expr()`, `_emit_function_defs()`, and variable node codegen for `get_var`/`set_var`.

## BUILD
- Variables panel: chips drag to graph with visible ghost node; drop creates `Get variable`; Alt-drop creates `Set variable`. Right-click chip menu: `Get`, `Set`, `Rename`, `Change type`, `Find references`, `Delete`.
- Search palette: pressing Space or right-click canvas opens palette at cursor with categories, signatures, docs, recent/favorites. Enter places highlighted node. Shift+Enter places and starts wire-through from first compatible pin/source.
- Wire ergonomics: mousedown output pin starts live bezier preview following cursor; compatible pins glow green/type color, incompatible pins glow red; invalid drop rejects clearly; empty drop opens action menu filtered by source type.
- Separate execution and data wires visually and mechanically: exec left-to-right, data wires type-colored; preserve `kind: "exec"|"data"` semantics for `workflow.py`.
- Reroute nodes: double-click wire adds reroute at cursor; dragging reroute moves segments; Delete removes reroute and reconnects if safe.
- Alignment mini-toolbar floats on selection: align left/center/right/top/bottom, distribute horizontal/vertical, tidy, group. `wfAlignSelection()` can be extended.
- Selection operations: marquee, group move, Shift add/remove, Delete, copy, paste, duplicate, undo/redo. Undo stack is simple graph snapshots capped at 30.
- Node comments/groups: colored frames, titles, collapse/expand, drag-to-contain behavior. Store in graph JSON `comments`/`notes`/`meta`; `workflow.py` must tolerate and ignore them in codegen.
- Diagnostics: inline compile/runtime errors appear on exact node/pin with hover explanation and generated-code location where known; clicking error toast zooms to node, shakes once, opens drawer.
- Minimap: small canvas already present or add one, click-to-jump via `wfMinimapPanTo()`. Frame-all on `F`; zoom-to-selection if selection exists, otherwise all.
- Full keyboard map: Space search, Delete delete, Ctrl/Cmd+C copy, Ctrl/Cmd+V paste, Ctrl/Cmd+D duplicate, Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo, F frame all, A align menu, G group comment, R reroute selected wire.
- Pin tooltip after 300ms: name, type, accepted connections, current value if last run data exists.
- `workflow.py` changes should only support frontend graph semantics/codegen tolerance: keep `generate_code(graph)` stable, ignore comments/meta, maintain variable/default handling, no new external dependencies.
- Apply RESTRAINT law: graph canvas is hero; controls hide in palette/toolbars until selection/hover/key intent; glow only during wire/diagnostic moments.
- Escape all dynamic content with `escapeHtml()` in JS; keep `renderAutomation()`, `wireAutomation()`, `renderAutomationStudioView()` entry points; use scoped `wf-` classes; graceful empty/error states for no workflow, failed save, invalid graph.

## DO NOT
- Do not touch `app.py`, `db.py`, shell, or unrelated tabs.
- Do not break existing workflow CRUD, generate, preview, function graph, variables, comments, notes, code save, or AI suggestion/explain routes.
- Do not make graph JSON incompatible with existing saved workflows.
- Do not execute generated scripts from frontend.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/automation.js
python3 -m compileall -q plan
tmux -f /exec-daemon/tmux.portal.conf has-session -t =waypoint-local-server 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s waypoint-local-server -c /workspace/plan
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 C-c
sleep 1
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 'cd /workspace/plan && FLASK_HOST=0.0.0.0 PORT=5099 /workspace/.venv/bin/python app.py' C-m
sleep 3
curl -sf http://127.0.0.1:5099/api/workflows/node-types | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/workflows | python3 -m json.tool >/dev/null
curl -sf -X POST http://127.0.0.1:5099/api/workflows/preview -H 'Content-Type: application/json' -d '{"graph":{"nodes":[{"id":"start","type":"start","x":0,"y":0,"params":{}}],"edges":[],"variables":[],"comments":[],"meta":{}}}' | python3 -m json.tool >/dev/null
```

# F. DOCS EDITOR

## OWNED FILES
- `/workspace/plan/static/js/notes.js`

## CURRENT STATE
- `notes.js` already owns Skills/Problems/Thinking/Funny/Essays generic lists with `renderNotesList()`, `wireNotesList()` lower in the file, plus card/table helpers `renderNoteToolbar()`, `renderNoteCards()`, `renderNoteCardList()`, `renderNoteSheet()`.
- A local rich editor already exists under `nts` names: `ntsRichToolbarHtml()`, `wireNtsRichToolbar()`, `ntsExec()`, `ntsApplyFontFamily()`, `ntsApplyFontSize()`, `ntsInsertTable()`, `ntsShowTablePopover()`, `ntsRenderOutline()`, `openNtsFullscreenEditor()`.
- Current list endpoints are `/api/lists/<list_type>`, `POST /api/lists/<list_type>`, `PATCH /api/lists/<list_type>/<id>`, `DELETE /api/lists/<list_type>/<id>`, `PATCH /api/lists/<list_type>/reorder`; document classify endpoints also exist.
- `notes.js` already has table/sheet mode pieces: `renderNoteSheet()`, `ntsSheetSortKey()`, `NOTE_BULK_STATE`, note bulk checkboxes, local preferences via `getNotePref()`/`setNotePref()`.
- Do not use or modify `core.js` toolbar globals; Zone A owns them and they must remain stable for Obsidian.

## BUILD
- Define local `NOTES_TOOLBAR_HTML` and `wireNotesToolbar(editableId, options)` in `notes.js`. It may reuse existing `nts*` execCommand patterns, but must not require modifying `core.js`.
- Toolbar v2 grouped controls: File, Undo, Text, Paragraph, Insert, Layout, Review, Export.
- File group: document title, save state, version history placeholder/disabled if no endpoint, duplicate, move/archive where existing endpoints support it; label unavailable honestly.
- Undo group: undo, redo, restore deleted block if local editor history supports it.
- Text group: font family dropdown, numeric font-size stepper, bold, italic, underline, strikethrough, code, clear formatting.
- Heading/paragraph controls: Normal, Title, Subtitle, H1/H2/H3, quote, code block, align left/center/right/justify, line height, paragraph spacing, bulleted/numbered/checklist, indent/outdent, horizontal rule.
- Color controls: labeled swatches `Text color` and `Highlight color`; no ambiguous color-only buttons.
- Insert group: link chips with favicon fallback/title/edit/remove/open modifier, image UX with resize handles/caption/align/replace/remove, table, checkbox, divider, date, attachment where existing upload endpoint supports it.
- Table controls: insert/delete rows/columns, merge cells if feasible, cell background, sort column, resize columns. Existing `ntsShowTablePopover()` is the anchor.
- Outline panel for essays: collapsible right panel from headings; click jumps; drag headings to reorder only if safe, otherwise omit drag and label unavailable.
- Word count bar: words, characters, reading time, selected word count, always updated on input/selection.
- Export: plain text, Markdown, HTML, PDF via print flow; DOCX only if backend/library exists, otherwise disabled with honest label.
- Sheets-mode for lists: sortable columns, filters, frozen title column, multi-select rows, batch edit using existing `PATCH /api/lists/<type>/<id>` endpoints. No backend changes.
- Lists-as-apps identities: Skills -> Skill Atlas (topographic terrain, drag nodes closer/farther only if feasible locally), Problems -> War Room (tactical constraints/hypotheses/attacks/experiments), Thinking -> Mind Inbox (quiet dump stream before classification), Funny -> Spark Deck (shuffle one spark/copy/save reaction), Essays -> Writing Studio (outline/version/export). Apply as distinct header/accent/signature interaction without changing backend schema.
- Apply RESTRAINT law: editor body is hero; toolbar groups collapse/reveal by focus/selection; list identities are calm at rest with one accent and one signature interaction.
- Escape all dynamic content with `escapeHtml()` except trusted existing rich body HTML already stored by the app; sanitize/escape attributes. Keep existing render/wire entry points and list APIs; use scoped `nts-` or `notes-` classes; graceful empty/error states.

## DO NOT
- Do not touch `core.js`, `RICH_TOOLBAR_HTML`, or `wireRichToolbar()`.
- Do not touch backend files or invent endpoints.
- Do not break existing list CRUD, reorder, note status, skill proficiency, Thinking classification, document classify, attachments, Markdown export, or compact/table views.
- Do not silently claim unavailable version history/DOCX/export features work.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/notes.js
curl -sf http://127.0.0.1:5099/api/lists/thinking | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/lists/essay | python3 -m json.tool >/dev/null
```

# G1. OFFLINE

## OWNED FILES
- `/workspace/plan/ai.py`
- `/workspace/plan/code_backends.py`

## CURRENT STATE
- `ai.py` already has `local_model_available()`, `_call_local_model()`, `route_text(role, prompt, max_tokens)`, `route_json(role, prompt, max_tokens)`, `_cheap_json()`, `LAST_SOURCE`, and daily budget guard `check_daily_budget()`.
- `ai.py` currently falls back to Ollama on connectivity errors in some paths but does not expose a structured `source` field for every caller.
- `code_backends.py` already has `list_ollama_models()`, `available_backends()`, `ask_openai()`, `ask_claude()`, `ask_ollama()`, `ask_cursor()`, and `ask(backend, prompt, ollama_model, selection)`.
- `code_backends.ask("auto", ...)` already routes to Ollama when `ai.local_model_available()` and `_cloud_reachable()` is false.
- Settings are available through `db.get_settings()` without schema changes; arbitrary keys can be saved by existing `/api/about` route in app.py, but app.py is not owned here.

## BUILD
- Implement honest model-source labeling on every AI path you can touch. For cheap/internal calls, set `LAST_SOURCE` reliably to `claude`, `openai`, `ollama`, or `local_deterministic`.
- Where return shape is already a dict (or can be safely additive), include `"source": <source>` without breaking existing callers. Where a function must return plain text/list for compatibility, keep return type stable and update `LAST_SOURCE`.
- Add/centralize helpers such as `offline_mode_enabled()` reading env (`WAYPOINT_OFFLINE_MODE` or similar) and settings key `offline_mode` from `db.get_settings()`.
- Server-side cannot know browser navigator offline; use `local_model_available()` reachability plus env/settings offline flag. When offline mode is true, route all text AI through Ollama if reachable.
- When offline mode is true and Ollama is unavailable, block paid/cloud calls with friendly errors such as `Offline mode is on and no local model is reachable. Start Ollama or turn offline mode off in Settings.`
- In offline mode, `route_text()` must not call Claude/OpenAI. `route_json()` should call Ollama and parse JSON when feasible; if impossible/unavailable, return an honest degraded error shape compatible with current callers.
- Never pretend cloud AI ran offline. Offline/local responses include clear degraded labeling in text when appropriate, e.g. `(offline: generated locally via llama3.2)`, and set `LAST_SOURCE = "ollama"`.
- `code_backends.ask()` must return `{"response", "actions", "source"/"backend"}` labeling actual backend. In offline mode, auto/claude/openai requests route to Ollama if model chosen/reachable or raise `BackendUnavailable` friendly error; paid calls blocked.
- `available_backends()` should honestly expose Ollama availability from `list_ollama_models()` and should not claim cloud availability if offline mode blocks it.
- Apply RESTRAINT law in errors: one clear status sentence, no noisy stack traces to users. No HTML in backend responses; frontend must escape. Preserve all public function names; no CSS here, but frontend consumers use scoped status classes. Graceful degraded states over exceptions where current app expects JSON.

## DO NOT
- Do not touch `app.py`, `db.py`, settings UI, or orchestrator.
- Do not change existing function return types unless the caller already expects dict/JSON or the addition is strictly additive and compatible.
- Do not log prompts, secrets, API keys, `.env`, or full exception bodies that might contain secrets.
- Do not make paid calls while offline mode is true.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
python3 -m compileall -q plan
tmux -f /exec-daemon/tmux.portal.conf has-session -t =waypoint-local-server 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s waypoint-local-server -c /workspace/plan
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 C-c
sleep 1
tmux -f /exec-daemon/tmux.portal.conf send-keys -t waypoint-local-server:0.0 'cd /workspace/plan && FLASK_HOST=0.0.0.0 PORT=5099 /workspace/.venv/bin/python app.py' C-m
sleep 3
curl -sf http://127.0.0.1:5099/api/usage | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/code/backends | python3 -m json.tool >/dev/null
```

# G2. SETTINGS+HUD-STATUS

## OWNED FILES
- `/workspace/plan/static/js/settings.js`

## CURRENT STATE
- `settings.js` owns `renderSettings()` and `wireSettings()`, using `/api/about`, `/api/usage`, `/api/budget/report`, `/api/google/status`, `/api/system/security`, `/api/version`.
- Existing Settings already has budget UI (`runBudgetOptimizer()`, `drawBudgetSpendChart()`, `renderBudgetRecommendations()`), model routing rows, API toggle, theme button, and an `#offline-command-center` card.
- Offline card already reads `usage.local_model_available` and `usage.local_model_name`; refresh button calls `/api/usage`.
- Code backend status is available through existing `/api/code/backends`, returning `backends` and `ollama_models`.
- There is no generic `/api/settings` route; persist settings via existing `POST /api/about` (`db.save_settings`) and read via `GET /api/about`.

## BUILD
- Expand offline command center card: model availability, Ollama reachability, Ollama models list from `/api/code/backends`, offline_mode toggle persisted via `POST /api/about`, and `what won't work` list.
- Offline mode toggle writes a settings key such as `{offline_mode: "true"|"false"}` through `/api/about`, then refreshes `/api/usage`/`/api/code/backends`. Label honestly if backend code does not yet enforce it.
- Add five highest-value pure-frontend/existing-endpoint settings items from Part 2 section 7:
  1. Privacy dashboard from `/api/usage.routing`: task type -> backend/model -> what data leaves device.
  2. Key health/status from `/api/usage` and `/api/code/backends`: Claude/API enabled, OpenAI configured, Ollama reachable/models. Redact; never show key values.
  3. Keyboard shortcuts list/search with current global maps (`Alt+H`, `Alt+Left/Right`, `Cmd/Ctrl+K`, `/`, launcher arrows/Enter/Esc, Planner hotkeys, Blueprint hotkeys).
  4. Theme density/motion controls writing CSS variables/classes/localStorage: density comfortable/compact, motion full/reduced, contrast mode; no backend needed.
  5. Audit note/card explaining what is currently logged: API usage totals, budget report, settings changes not yet fully audited unless backend exists.
- Preserve existing budget caps/charts, routing matrix, API toggle, theme toggle, backup/export/security cards.
- Use `/api/code/backends` to list installed Ollama models; show empty state `No local models found — install Ollama and pull a model.`.
- What-won't-work list must be truthful: cloud AI, web-backed research, image generation, Google sync, and any uncached remote action may fail offline; planner/tasks/notes/local arcade remain usable.
- HUD-status support from settings side: store user preferences for density/motion/offline_mode so Zone A can read later; do not edit HUD files.
- Apply RESTRAINT law: System is a control room, not a SaaS settings maze; one clear status sentence per card, details behind disclosure, no more than three buttons visible per card at rest.
- Escape all dynamic content with `escapeHtml()`; keep `renderSettings()` and `wireSettings()` entry points; use scoped `settings-`/`set-` classes; graceful empty/error states for failed `/api/usage`, `/api/code/backends`, or `/api/about`.

## DO NOT
- Do not touch `ai.py`, `code_backends.py`, `app.py`, `db.py`, HUD/shell files, or CSS files.
- Do not invent endpoints; use `/api/about`, `/api/usage`, `/api/budget/report`, `/api/code/backends`, `/api/usage/toggle`, `/api/backup` only.
- Do not display, log, or test-print raw API keys. Only show configured/not configured or redacted labels.
- Do not remove existing budget/routing/security/theme functionality.
- Do not commit, push, amend, merge, create PRs, or print/log API keys or `.env` contents.

## VERIFY
```bash
cd /workspace
node --check plan/static/js/settings.js
curl -sf http://127.0.0.1:5099/api/about | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/usage | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/code/backends | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/budget/report | python3 -m json.tool >/dev/null
```

## GROK INJECTION NOTES

Binding: Director Brief RESTRAINT law (calm-at-rest; one hero; spectacle only at launch/unlock/save/reward/warning). Append-only manager notes — do not lower vision; prefer cheapest correct reuse.

### A. SHELL
- Own only `core.js` / `misc.js` / `index.html` / `app.css`. Immutable globals: `renderTabBody()`, `render()`, `goToTab()`, `wireTab()`, `escapeHtml()`, `RICH_TOOLBAR_HTML`, `wireRichToolbar()`, `showToast()`, `navBack()`, `navForward()`, `renderNav()`, `pageIntentHtml()`, launcher suite (`renderLauncher`, `wireLauncher`, `playLaunchTransition`, `playHomeExitTransition`, …).
- `refreshHudData()` + `initHudInteractions()` live in **misc.js** (not core.js). Keep `setInterval(refreshHudData, 60000)` and boot `init()` IIFE wiring (`#nav-back`/`#nav-forward` → `navBack`/`navForward`, `#launch-automation-studio` → `AUTOMATION_STUDIO_OPEN=true; renderAutomationStudioView()`).
- **Correct trophies source:** `GET /api/practice/summary` returns only `{points, streak, total_attempts}` — **no trophies**. Coins HUD today uses `practice.points`. Trophies are Zone D localStorage key `arcadeTrophies` (`arcGetTrophies`/`arcSetTrophies`). Read that key honestly or show `—`; do not invent `/api/trophies`. Prefer `GET /api/coins` when C1 ships, else practice summary / wallet fallback.
- Blueprint is **not** a tab: open via existing `#automation-studio` + global `renderAutomationStudioView()` / `AUTOMATION_STUDIO_OPEN`. Do **not** invent `goToTab("Automation")` or `goToTab("Blueprint")`. Studio launcher card ≠ Projects tab.
- Do not break `wireTab()` dispatch branches for Today/Calendar/Tasks/Practice/Parallel/Settings/NOTE_LIST_TABS — Zone B/F/C2/D/G2 depend on them. Compact in-app chips via `renderNav()` only.
- Cost guardrail: finish HUD metrics + launcher transitions + keyboard map; optional WebAudio stays optional. Put new shell CSS in `app.css` with `hud-`/`launcher-`/`launch-`/`shell-` prefixes; do not restyle other zones' `rpl-`/`tdy-`/`wf-` surfaces.

### B. PLANNER
- You do **not** own `core.js`/`misc.js`. `renderTabBody()` still calls `renderToday` / `renderCalendar` / `renderTasks` separately; `wireTab()` still calls `wireToday` / `wireCalendar` / `wireTasks`. Fuse by making **all three** renderers share one fused shell with focused defaults — never remove/rename those six entry points.
- Reuse paint SM already in `today.js`: `TDY_MODE`, `TDY_PAINT_PHASE` (`idle`→`armed`→`painting`), `wireTodayHourCanvas()`, `updatePaintGhost()`, `tdyHotkeyHandler()`, `setTodayDirty()`/`resetTodayDirty()`, `navigateToPlannerDay()`/`tryNavigateTodayDate()`. Urgency already in `tasks.js`: `taskProximityScore`, `taskOverduePressure`, `computeTaskUrgency`, `urgencyChipHtml` — surface the existing formula, do not rewrite math.
- Endpoints only: `GET/POST /api/day/<date>`, `GET /api/calendar` (+ existing events/Google routes already used), `GET/POST /api/tasks`, `PATCH /api/tasks/<id>`, `PATCH /api/tasks/reorder`, `POST /api/tasks/parse-freeform`. No backend edits.
- Styles: inject scoped `<style>` in owned JS (`tdy-`/`cal-`/`tsk-`/`pln-`); **do not** edit `app.css` (Zone A).
- Cost guardrail: one fused three-pane shell + paint/select/fill + task-rail urgency + drag-schedule. Do not rebuild calendar Google sync UI or task freeform parser; keep past days editable.

### C1. PARALLEL BACKEND
- Extend `_migrate_rpg_state()`, `_complete_play()`, `illustrate_portrait()`, `list_portrait_urls()`, `get_map_info()`, `generate_map()`, `price_bend()`, `confirm_bend()`, `_compute_bend_price()`. Keep routes: `/api/parallel/state|messages|status|say|illustrate|scenes|journal|portrait|portraits|map|map/generate|bend|bend/confirm` and legacy `/api/wallet`.
- **Currency correction:** `wallet_transactions` + `db.wallet_insert` / `wallet_balance` / `wallet_recent` + `parallel_life.sync_wallet()` / `get_wallet()` already power coins and Bend spends. Implement `GET /api/coins` as the shared facade (`points` from `db.practice_totals()`, ledger from wallet/coin ledger, `balance = points + ledger_sum` **or** reconcile to current wallet semantics) — **do not** run a second competing ledger that double-charges Bend. If adding `coin_ledger`, migrate/alias `wallet_*` writers so Bend confirm has one debit path.
- `/api/coins` does **not** exist yet — you add it (Zone A/C2 will prefer it). Keep `/api/wallet` working.
- Do not touch `static/js/parallel.js`. No cloud AI when budget/offline blocks; additive JSON only.
- Cost guardrail: structured RPG shape + coins endpoint + Bend pricing/fairness + portrait/map cache-by-hash. Skip greenfield world engine rewrites.

### C2. PARALLEL FRONTEND
- Keep `renderParallel()` / `wireParallel()`, `parallelFetch()`, `rplStartPolling()` / `rplPollStatus()` / `rplResumeBusyIfNeeded()`, `rplRefreshAfterResolve()`, `rplGameShell` / rails / panels, `rplAnimateCoins()`, `rplFetchWallet()` / `rplFetchMap()` / `rplFetchPortraits()`. Poll only (`RPL_POLL_TIMER`, `RPL_POLL_MS`); no websockets.
- Prefer `GET /api/coins` when present; else existing `/api/wallet` via `rplFetchWallet()` then `/api/practice/summary`. Bend: `POST /api/parallel/bend` then `POST /api/parallel/bend/confirm`. Tolerate missing additive fields.
- Styles stay in `rplStylesHtml()` / `rpl-` classes inside `parallel.js` — do not edit `app.css`/`app.py`.
- Cost guardrail: complete six-panel layout + chronicle + fog + Bend modal + coin juice on existing shell. Do not rewrite polling or invent realtime.

### D. ARCADE
- Keep `renderPractice()` / `wirePractice()`, `startPracticeGame()`, `praxOpenStage` / `praxCloseStage` / `praxStartRoundTimer` / `praxRenderResult`, rival/trophy helpers (`arcGetRival`, `arcStartMatch`, `arcPlayMatchRound`, `arcFinishCanvasGame`, `arcGetTrophies` → localStorage `arcadeTrophies`).
- **Correct game registry fact:** `generate_signal_storm_round` / `generate_memory_constellation_round` exist in `practice_games.py` but are **not** in `GAMES` and **not** in `app.py` `PRACTICE_GENERATORS` (only `memory|working_memory|math|logic|time_estimation`). Frontend already treats canvas keys via `ARC_CANVAS_KEYS` / `ARC_LOCAL_POOL` as local-only. **Do not** add `signal_storm`/`memory_constellation`/`circuit_sprint`/`time_forge` to `GAMES` without `PRACTICE_GENERATORS` wiring (you cannot edit `app.py`) — start would KeyError. Extend `ARC_CANVAS_KEYS` + local generators/renderers instead.
- Persist trophies/rival/trophy-road in existing localStorage keys so Zone A HUD can read `arcadeTrophies` honestly.
- Cost guardrail: PLAY hero + rival/leagues/trophy road + four canvas games + contrast fix. Optional Factory Routing / Pitch Dodge only after the four. No `app.py`/`db.py` edits.

### E. BLUEPRINT
- Keep `renderAutomation()` / `wireAutomation()` / `renderAutomationStudioView()` / `AUTOMATION_STUDIO_OPEN` / `CURRENT_WF`. Reuse `wfPushUndo`/`wfUndo`/`wfRedo`, `wfCopySelection`/`wfPasteAtCursor`, `wfConnectEdge`, pin highlight/tooltip helpers, `wfVariablesPanelHtml`/`wfVarChipHtml`/`wfVariableMenuEntries`, `wfAlignSelection`, `wfDrawMinimap`/`wfMinimapPanTo`.
- **Reroute already exists** in `workflow.py` `NODE_TYPES["reroute"]` and frontend `.wf-reroute` — extend double-click-wire UX; do not invent a parallel type. Preserve `kind: "exec"|"data"` and `generate_code(graph)` stability; ignore `comments`/`notes`/`meta` in codegen.
- Studio is overlay (`#automation-studio`), not a `wireTab` branch — do not require a new tab name.
- Styles: continue inline `<style>` / `wf-` in `automation.js`; avoid drive-by `app.css` edits (A owns CSS).
- Cost guardrail: variables drag + Space palette + wire preview + selection/align + diagnostics on existing graph. No new Python deps; no frontend script execution.

### F. DOCS EDITOR
- **Name correction:** entry points are `renderNoteList(listType)` and `wireNoteList(listType)` — **not** `renderNotesList` / `wireNotesList`. Dispatched via `NOTE_LIST_TABS` in `core.js` (`Skills→skill`, `Problems→problem`, `Thinking→thinking`, `Funny→funny`, `Essays→essay`). Verify curls use `/api/lists/essay` (singular).
- Define local `NOTES_TOOLBAR_HTML` + `wireNotesToolbar` in `notes.js`; reuse `ntsRichToolbarHtml` / `wireNtsRichToolbar` / `ntsExec` / `ntsShowTablePopover` / `openNtsFullscreenEditor`. **Do not** touch `core.js` `RICH_TOOLBAR_HTML` / `wireRichToolbar` (Obsidian + Zone A).
- Lists APIs only: `/api/lists/<list_type>` CRUD + reorder. No backend. Identity skins are presentation-only.
- Cost guardrail: toolbar v2 + word count + sheets mode + five list identities. Disable version history/DOCX honestly; no `core.js` edits.

### G1. OFFLINE
- Touch only `ai.py` + `code_backends.py`. Preserve `route_text` / `route_json` / `_cheap_json` / `local_model_available` / `_call_local_model` / `check_daily_budget` / `LAST_SOURCE`, and `ask` / `available_backends` / `list_ollama_models` / `BackendUnavailable`.
- Add `offline_mode_enabled()` reading env + `db.get_settings()` key `offline_mode` (G2 writes via `POST /api/about`). Do not edit `app.py` — `/api/usage` already exposes `local_model_available` / `local_model_name`.
- `code_backends.ask()` today returns `{response, actions}` **without** `source`; add `"source"`/`"backend"` **additively**. Keep return types stable for text callers; set `LAST_SOURCE` (`claude`|`openai`|`ollama`|`local_deterministic`).
- Cost guardrail: centralized offline gate + honest labeling on paths you own. No schema migrations; no prompt/secret logging; no paid calls when offline_mode true.

### G2. SETTINGS+HUD-STATUS
- Keep `renderSettings()` / `wireSettings()`. **Endpoint correction:** version is `GET /api/system/version` — **not** `/api/version` (no such route). Already used in `renderSettings` Promise.all. Also: `/api/about`, `/api/usage`, `/api/budget/report`, `/api/google/status`, `/api/system/security`, `/api/code/backends`, `/api/usage/toggle`, `POST /api/backup`.
- Persist `offline_mode` via `POST /api/about` (`db.save_settings`); label enforcement as dependent on Zone G1. Density/motion/contrast: CSS vars + `localStorage` only (do not edit `app.css` — set vars/classes from JS).
- Do not touch `ai.py` / `code_backends.py` / HUD files. Never display raw keys.
- Cost guardrail: offline command center + five high-value cards; preserve budget/routing/security. No new endpoints; no settings maze.

### Cross-zone contracts

**Shared-file ownership (exclusive write):**
| Zone | Owns |
|------|------|
| A | `static/js/core.js`, `static/js/misc.js`, `static/index.html`, `static/css/app.css` |
| B | `static/js/today.js`, `static/js/calendar.js`, `static/js/tasks.js` |
| C1 | `parallel_life.py`, `app.py`, `db.py` |
| C2 | `static/js/parallel.js` |
| D | `static/js/practice.js`, `practice_games.py` |
| E | `static/js/automation.js`, `workflow.py` |
| F | `static/js/notes.js` |
| G1 | `ai.py`, `code_backends.py` |
| G2 | `static/js/settings.js` |

**Immutable global contracts (other files call these — do not rename/remove):**
- Shell: `escapeHtml`, `showToast`, `RICH_TOOLBAR_HTML`, `wireRichToolbar`, `render` / `renderTabBody` / `goToTab` / `wireTab`, `navBack` / `navForward`, `renderNav`, `pageIntentHtml`, `refreshHudData`, launcher + HUD entry points, boot `init()` side effects.
- Planner: `renderToday` / `wireToday`, `renderCalendar` / `wireCalendar`, `renderTasks` / `wireTasks`.
- Parallel: `renderParallel` / `wireParallel`.
- Arcade: `renderPractice` / `wirePractice` (+ existing `startPracticeGame` / prax stage helpers).
- Blueprint: `renderAutomation` / `wireAutomation` / `renderAutomationStudioView` / `AUTOMATION_STUDIO_OPEN`.
- Docs: `renderNoteList` / `wireNoteList` (via `NOTE_LIST_TABS`).
- Settings: `renderSettings` / `wireSettings`.
- Currency bridge: C1 owns `/api/coins` + wallet reconciliation; A/C2/D consume only — no second balance inventing.
- Offline bridge: G2 writes `offline_mode` via `/api/about`; G1 enforces in `ai.py`/`code_backends.py`; A labels HUD from `/api/usage` (+ backends when needed).

**Verification everyone runs (zone VERIFY blocks still apply; minimum shared gate):**
```bash
cd /workspace
node --check plan/static/js/core.js
node --check plan/static/js/misc.js
node --check plan/static/js/today.js
node --check plan/static/js/calendar.js
node --check plan/static/js/tasks.js
node --check plan/static/js/parallel.js
node --check plan/static/js/practice.js
node --check plan/static/js/automation.js
node --check plan/static/js/notes.js
node --check plan/static/js/settings.js
python3 -m compileall -q plan
curl -sf http://127.0.0.1:5099/api/usage | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/budget/report | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/practice/summary | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/day/$(date +%F) | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/tasks | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/parallel/state | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/about | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/code/backends | python3 -m json.tool >/dev/null
curl -sf http://127.0.0.1:5099/api/system/version | python3 -m json.tool >/dev/null
# After C1: curl -sf http://127.0.0.1:5099/api/coins | python3 -m json.tool >/dev/null
```
