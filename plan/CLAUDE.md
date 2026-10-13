# Waypoint (personal life-OS app)

Flask + SQLite + vanilla JS, no build step. One HTML file (`static/index.html`) is the entire
frontend. Single-user app that runs locally on its owner's machine.

## Map
- `app.py` — all Flask routes, one section per tab
- `db.py` — SQLite CRUD (`planner.db`, gitignored); schema migrations are `ALTER TABLE` guards in `init_db()`
- `ai.py` — every AI prompt; Claude default, OpenAI (`_cheap_json`) for high-volume/low-stakes, Ollama offline fallback
- `orchestrator.py` — the ONLY place app.py dispatches AI subagents through (logs every run)
- `agent.py` — Agent-tab chat with self-coding tools (staged, approval-gated, never direct)
- `workflow.py` — Automation Studio node-graph → Python codegen
- `practice_games.py` — Practice-tab minigames (local generators + AI-game registry)
- `code_backends.py` — Code-tab routing (claude/openai/ollama)
- `backup.py` — project snapshots; also enforces self-coding path restrictions
- Living roadmap + session log: `obsidian_vault/Project Plan.md`. User's raw feature queue:
  `settings.claude_notes` in planner.db (read it at session start; messy freeform, needs triage)
- `NAPKIN.md` — the user's quick-capture backlog, written automatically from the app's Napkin
  airlock by `napkin_sync.py` and auto-committed. READ IT at the start of any "large pass" or
  broad improvement request: it is the list of things he wants fixed, in his own words. Treat
  each entry as a request to triage, not a spec. Never hand-edit it (the app owns the file);
  when an entry is done, say so and let him crumple it in the app.
- `ISSUES.md` — accepted napkin notes + agent bugs, compiled on quit (and on Accept). `WORK.md`
  is the instruction: when the user says **work**, implement that queue.
- `NAPKIN_COMPILED.md` — the same backlog split into discrete items and grouped by theme
  (fix-first, data safety, AI/chat, tasks, calendar, napkin, game, UI). START A LARGE PASS
  HERE: the raw notes bundle five or six requests per sentence, and this is where they are
  already separated. Hand-maintained; re-compile from NAPKIN.md when it drifts.

## Run / verify
- Run: `python app.py` (port 5099) or `pythonw desktop.py` (native window, what the user uses)
- Frontend edits: user just reloads the window. Backend edits: full process restart required
- Restart by PID only: `netstat -ano | findstr :5099` then `taskkill /PID <pid> /F`.
  NEVER `taskkill /IM python.exe` (kills unrelated processes; happened once)
- JS check: extract `<script>` block → `node --check`. Python: `python -c "import ast; ast.parse(...)"`
- Verify features with one real HTTP round-trip; prefix test data `ZZTEST`, always delete it after
- Playwright + Chromium are installed for UI-interaction verification when an API call can't cover it

## Conventions
- One commit per shipped item, verification notes in the commit message
- New deletable entities: hook into `record_deletion()` (undo/trash system) + `RESTORE_TABLES`
- New AI work: register a subagent in orchestrator.py, never call ai.py from app.py directly
- Charts: use `plotlyThemeVars()`, never hardcoded hex (light/dark theme)
- `.env` holds real API keys — never print, log, or commit them
- Ask before deleting/pruning any of the user's content (standing rule after a bad prune)

## Agent org structure (owner directive 2026-07-22 — applies to ALL project work)
- **Fable/Claude = ideator + general control**: sets vision, defines zones, tells agents what
  to do, reviews outcomes. Never writes code itself.
- **Grok = middle manager**: injects/tightens prompts, keeps coders on track mid-flight,
  carries them through blockers, and owns cost-cutting — efficiency improvements must never
  lower the vision.
- **Director** (vision agent): proposes ONLY novel features — never restates already-built or
  already-directed ones (assumed done; repeating them is worthless). Before a final pass, run
  a few tester agents that actually exercise the app and feed the director their findings.
- **Chat (GPT) + Composer = coders**: all implementation. Disjoint file ownership per agent.
- Spawn as many agents as useful, as long as it doesn't create clutter.
- Model effort: high or below, never max/xhigh. Results > cost, bounded by the daily cap.
- Standing docs: `obsidian_vault/Director Brief.md` (vision + restraint law),
  `agent_briefs.md` (zone briefs), `obsidian_vault/Design Constitution.md` (intentions).

## Token-cost rules (for Claude Code sessions on this repo)
- `static/index.html` is 5000+ lines: NEVER read it whole. Grep for the function name, read ±30 lines
- Trust Edit/Write results; don't re-read files after editing, don't re-verify what a tool confirmed
- Batch independent edits back-to-back; one consolidated syntax check per batch, not per edit
- Don't re-list tables/schema — this file + `grep "CREATE TABLE"` answers structure questions
- Prefer one targeted end-to-end test over exhaustive per-path tests unless the user asks
- In-app AI: route high-volume/low-stakes calls through `ai._cheap_json` (OpenAI gpt-5-mini),
  keep Claude for judgment-heavy work; default in-app model is Haiku via CLAUDE_MODEL in .env
