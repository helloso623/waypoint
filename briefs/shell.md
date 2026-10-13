# Shell, top HUD, launcher, transitions

- Kill the left sidebar entirely; replace with persistent top HUD and full-screen game launcher.
- HUD left-to-right: Waypoint logo/app switcher, Back, Forward, current app title, intention strip, spacer, tokens, budget, coins, trophies, streak, model/offline state, settings gear.
- Current app title format: `Planner - Make the day legible`; intention strip shows one sentence + one primary verb button + one truthful status.
- Tokens counter: `18.2k / 120k tokens`; click opens dropdown with today, 7-day, model split, largest 5 calls.
- Budget counter: `$0.41 / $3.00`; add 2px depletion bar under text; green <50%, amber 50-80%, red >80%; click opens model budget controls.
- Coins counter: `coins 1,240`; click opens ledger: practice earned, planner earned, Parallel spent, pending bonuses.
- Trophies counter: `trophies 37`; click opens achievements/trophy-road overlay.
- Streak counter: `streak 12d`; click opens truth panel: counted apps, missed days, no fake extensions; flame grows subtly with real consecutive days only.
- Model/offline badge: `Claude`, `OpenAI`, `Ollama`, `Offline`, or `Queued`; click opens routing/fallback status.
- Home launcher: full viewport, dark cinematic canvas ambience, oversized animated app cards, parallax, controller-like focus ring, arrow-key navigation.
- Card hover/focus: mouse tilt, edge light, 1.035 scale, depth shadow, intention reveal, 2-3 live stats, live-pulse dot for fresh activity.
- Card content: Planner shows overdue count, today hour coverage %, next calendar block.
- Card content: Parallel shows coins, active quests, current location.
- Card content: Arcade shows league, trophies, rival name.
- Card content: Blueprint shows current workflow, node count, last run status.
- Card content: Docs shows recent doc, word count, unsynced edits.
- Card content: Lists shows inbox count, newest thought, active problem count.
- Card content: People shows follow-ups due, stale contacts, next birthday/event.
- Card content: Settings shows model route, budget %, backup status.
- App launch beats: 0ms card depresses 4px + bloom; 80ms background darkens; 160ms card scales to 1.08; 260ms card expands toward viewport; 420ms glyph becomes center sigil; 600ms full-screen color wash; 760ms target app renders behind wash; 900ms wash wipes upward; 1050ms HUD settles.
- Exit beats: 0ms app dims; 120ms app snapshot shrinks; 300ms snapshot lands into launcher card; 480ms launcher cards re-parallax in.
- Transition identity: each app uses its accent color and glyph as the screen-covering wipe; no generic fade-only transition except reduced-motion.
- Motion tokens: `instant=90ms`, `quick=160ms`, `standard=260ms`, `cinematic=760ms`, `epic=1050ms`.
- Easing tokens: `easeOut=cubic-bezier(.16,1,.3,1)`, `snap=cubic-bezier(.2,.9,.2,1.2)`, `heavy=cubic-bezier(.76,0,.24,1)`.
- Motion usage: quick for hover/focus, standard for panels, cinematic for app launch/exit, epic for unlocks only.
- Reduced motion: preserve hierarchy; replace card expansion with <=160ms opacity/scale fade; no moving canvas particles.
- Keyboard map: `Alt+H` home, `Alt+Left/Right` history, `Ctrl/Cmd+K` command palette, arrows move launcher focus, `Enter` launch, `Esc` close/back, `/` launcher search.
- Delighter: coins earned in any app fly into HUD counter with sprite arc and counter tick.
- Delighter: recently touched launcher cards glow for one hour.
- Delighter: daily recap overlay shows planned hours, actual hours, practice, coins, budget, and one suggested adjustment.
- Delighter: global command palette understands active app context and offers primary actions first.
- Optional sound map for shell: hover soft tick, app launch low whoosh, save warm chime, error muted thunk; default off in Settings.

Impress the owner: at least one moment in this zone must make him say 'insane'.
