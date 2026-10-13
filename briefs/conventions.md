# Shared implementation conventions

- Stack: Flask + SQLite backend, one static frontend, vanilla JS/CSS/HTML only; canvas allowed; no build step; no paid external services beyond existing Anthropic/OpenAI keys.
- Use existing frontend helpers when available: `api()`, `escapeHtml()`, `showToast()`, `goToTab()`, `plotlyThemeVars()`, `errorMessage()`, existing render/wire pattern.
- Keep file ownership absolute: touch only files assigned by the parent prompt; do not "clean up" neighboring zones; do not reformat unrelated code.
- Never touch `planner.db`, `.env`, API keys, secrets, or user content stores except through existing app APIs.
- Never commit or push; parent orchestration owns git. Leave a concise verification note in your final response.
- Respect existing dirty tree: do not revert, overwrite, or normalize unrelated user/agent changes.
- Intention system is law: every visible element must serve the page/app intention; lead with one primary action; demote secondary tools behind menus/drawers.
- Demote, do not delete: if an existing feature is still useful but no longer hero-worthy, move it behind a toggle, overflow, or secondary panel.
- Every page must stop looking like SaaS: use game/app identities, strong hierarchy, tactile states, cinematic transitions, and honest status.
- Truth rule: no fake progress, inflated streaks, fake offline AI, fake coins, fake trophies, or manufactured urgency.
- Scoped styles: prefix new CSS classes per zone (`hud-`, `lnch-`, `pln-`, `rpl-`, `arc-`, `wf-`, `doc-`, `lst-`, `off-`, `set-`); avoid global selectors.
- Motion tokens: `instant=90ms`, `quick=160ms`, `standard=260ms`, `cinematic=760ms`, `epic=1050ms`.
- Easing tokens: `easeOut=cubic-bezier(.16,1,.3,1)`, `snap=cubic-bezier(.2,.9,.2,1.2)`, `heavy=cubic-bezier(.76,0,.24,1)`.
- Motion usage: quick for hover/focus, standard for panels, cinematic for app transitions, epic only for major unlocks.
- Reduced motion: honor `prefers-reduced-motion`; replace transform-heavy motion with opacity fades under 160ms; never block functionality behind animation.
- Text-entry stability: never animate layout unpredictably while typing in editor, planner, chat, or node fields.
- Optional sound: WebAudio only, default off, single Settings toggle + volume slider; throttle repeated ticks to max one every 80ms.
- Accessibility: all controls keyboard reachable; visible focus; high-contrast readable text; no meaning conveyed by color alone.
- Data reliability: autosave/explicit save states must be clear; unsaved changes must be visible; destructive actions need confirmation or undo.
- Offline honesty: label AI/source as Claude/OpenAI/Ollama/local deterministic/queued; never imply cloud AI ran offline.
- Backend additions: add guarded migrations only; keep routes small; route AI through established AI/orchestrator patterns when applicable.
- Frontend additions: render pure HTML strings, then `wire*()` handlers; clean timers/listeners on rerender where necessary.
- Verification ritual: run `node --check` on each JS file you changed; run `python3 -m compileall -q plan` if Python changed; curl own static files/routes for HTTP 200 when applicable.
- Verification cleanup: prefix any test data with `ZZTEST`; delete it after verification; do not leave local-only junk in app data.
- Performance: canvas loops pause when hidden; large animations use `requestAnimationFrame`; avoid rereading huge `static/index.html` wholesale.
- Implementation posture: build the smallest reliable slice that still feels spectacular; at least one visible moment per zone must be obviously beyond a normal web app.

Impress the owner: at least one moment in this zone must make him say 'insane'.
