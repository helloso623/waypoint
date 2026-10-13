# Ultimate Planner

A personal life-OS app: hour-by-hour day tracking, a searchable to-do list, goals, a 3D idea map,
project/competitor tracking, a customer CRM, a calendar, and an in-app AI agent with real tool
access (including staged, approval-gated self-coding) -- all behind one orchestrator so more
subagents can be dropped in later.

Developer notes for the app's internals. For installing it or a project overview, see the
[README at the repo root](../README.md).

## Quick start

```
cd Desktop\Planner
pip install -r requirements.txt
copy .env.example .env      # then fill in ANTHROPIC_API_KEY at minimum
python desktop.py           # native window (or: python app.py for a browser tab)
```

Keys and local-AI URLs live in the durable `.env` under `WAYPOINT_DATA_DIR` (or `plan/.env` if that is unset). After a `git pull`, run:

```
python plan/scripts/post_pull.py
```

That fast-forwards git, reinstalls `plan/requirements.txt`, and writes `LOCAL_MODEL_*` / `OLLAMA_URL` so Ollama still resolves. Then restart `desktop.py`. The HUD AI chip (top bar) switches Cloud / Local / Custom; Settings → **Models & routing** is the same control. **Set up local AI** in Settings, or:

```
python plan/scripts/setup_local_ai.py
```

Install [Ollama](https://ollama.com), leave it running, then `ollama pull llama3.2:3b`.

### Tailscale (phone / other devices on your Tailnet)

1. Install Tailscale and run `tailscale up` on this machine.
2. Start Waypoint with Serve (HTTPS MagicDNS URL, Flask stays on localhost):

```
python run_tailscale.py
# Windows: .\run_tailscale.ps1
```

3. Open the printed `https://<machine>.<tailnet>.ts.net` URL on your phone or another Tailnet device.

Direct bind (no Serve) if you prefer `http://100.x.x.x:5099`:

```
python run_tailscale.py --direct --trust
```

`--trust` sets `APP_TRUST_TAILSCALE=true` so Tailnet peers skip the access token. Otherwise set `APP_ACCESS_TOKEN` in `.env` for a login gate.

Or double-click the `Planner` shortcut on your Desktop. Or from VS Code: Run Task -> "Run Planner
App" (desktop) or "Run Planner App (browser)", same names in the F5 debug dropdown.

Data lives in `planner.db` (SQLite, gitignored) -- persists across restarts, never dropped by any
code path in the app. Click "Backup all data now" in the sidebar any time for a full timestamped
project snapshot under `backups/` (also happens automatically before any self-coding change is
applied -- see below).

## What's actually working right now

- **Agent tab (default tab)** -- chat with real tool access: add calendar events, goals, ideas,
  projects, customers, contacts, tasks; read/propose edits to the app's own code; propose shell
  commands; scan for hackathons/competitors (asks you to confirm what it's about to search for
  first). Conversation history persists across restarts. A side panel shows a live 2D map of every
  subagent run across the *whole app*, not just this chat -- hover a point to see what it said.
  Independent subagents (e.g. daily summary + task check on save) run concurrently, not sequentially.
- **Self-coding, safely gated**: `propose_file_edit` and `propose_command` never take effect
  immediately -- both are staged for you to Approve or Reject in the UI. Approving takes an
  automatic full-project backup first. File edits are hard-blocked outside the project directory
  (it can only modify itself). Commands run in the project directory but aren't sandboxed beyond
  that + your review.
- **Cost controls**: default model is Haiku 4.5 (cheap tier). A kill switch in the sidebar stops
  every AI call in the app instantly. Running token count + estimated cost always visible there too.
- **Today tab** -- 24h grid, click a category per hour (colors live in the DB, editable via
  "vibecode a category" -- type e.g. `add Gym, teal color` and an AI subagent structures it), a
  note per hour, plus happiness/volatility/motivation/focus/work time/effective work time/sports/
  eating/notes. Saving triggers an AI daily summary *and* auto-validates related open tasks against
  what you wrote (see Tasks).
- **Tasks tab** -- searchable to-do list. Urgency (low/medium/high/critical, color-coded; critical
  emails you immediately), optional due date and category, partial progress as `done/total unit`
  (e.g. `2/5h`, editable after creation), optional link to a contact or project. An opt-in
  "Suggest" button asks AI to classify urgency (not automatic, so it doesn't cost anything unless
  you ask). Adding a task checks it against your other open tasks for near-duplicates first --
  pure local text similarity, no API call.
- **Goals tab** -- add a goal + deadline, an AI subagent splits it into dated chunks you can check
  off, retitle, or redate inline.
- **Calendar tab** -- spreadsheet-style editable event grid. No external sync yet.
- **Trends tab** -- charts (mood/motivation/focus, work vs. effective-work time) over your full
  history, plus a real correlation panel (Pearson, local numpy math, zero API cost) across every
  metric pair -- e.g. work_time/effective_work_time correlate at 0.78 in the imported data.
- **Ideas tab** -- add freeform ideas (title optional, just write); a 3D map positions them so
  similar ideas cluster together (TF-IDF + SVD, no neural embedding needed), rendered with Plotly,
  reset-able view.
- **Skills / Problems / Thinking tabs** -- freeform lists, no title required. Entries the Agent
  creates are tagged "ai", entries you type are tagged "human".
- **Projects tab** -- register software/hardware projects with progress. New projects are checked
  against existing ones by description similarity and flagged live. Set a folder `path` +
  `run_command` per project to Run or Open Folder it directly from here.
- **Competitions tab** -- describe your project (or ask the Agent to do it conversationally), an AI
  subagent web-searches for relevant hackathons and existing competitors.
- **Customers tab** -- track potential customers; auto-flags "needs update" after 14 days without a
  status change.
- **Contacts tab** -- name, description, where/when you met them, what they do. No manually-
  maintained warmth/last-contact fields -- "+ task: reach out" turns follow-up into a to-do instead.
- **About tab** -- project description / why you're doing this / bio, pre-filled from what's known,
  editable.
- **Light mode** -- toggle in the sidebar, persisted.
- **Daily email** -- background scheduler sends a link to fill in today's grid plus yesterday's AI
  summary, at `DAILY_EMAIL_HOUR` (default 7am). Needs SMTP configured in `.env`.
- **Obsidian mirror** -- de-prioritized in favor of the Agent tab, but still runs passively: every
  saved day/goal/subagent run is written to Markdown under `obsidian_vault/`. `Project Plan.md` in
  there is the living roadmap (has a "Scratch" section + a `|||locked|||` convention for text that
  must never be reworded); `Agent Activity.md` is a plain-text version of the same feed the Agent
  tab's graph shows.

## Events / Team / Code tabs

Visible in the nav but stubbed -- they explain what's planned when you open them.
See `obsidian_vault/Project Plan.md` for the full roadmap, priority list, and what's explicitly
deferred (and why).

## What needs external setup before it can be real (not built)

- **Google Calendar / Gmail / Meet sync**: needs a Google Cloud project + OAuth credentials for
  *this app* (Claude's own Gmail/Calendar access in chat can't be reached by the deployed app).
- **Screenshot-OCR contact-warmth agent** and a **LinkedIn-watcher agent** -- need their own
  capture/scraping pipeline (and a look at LinkedIn's ToS for the latter).
- **University schedule import** -- needs to know the source (ICS export, an API, or manual entry).
- **OpenAI/GPT routing**: optional `OPENAI_API_KEY` powers high-volume task/practice helpers and
  Code-tab Q&A through the model-role router; unset keys fall back to Claude. Cursor is detected in
  the Code tab but still deliberately not wired until its background-agent API contract is confirmed.

## Architecture

Page intentions (what each tab is for, primary user job, key features) live in
[`obsidian_vault/Page Intentions.md`](obsidian_vault/Page%20Intentions.md). UI copy mirrors
`PAGE_INTENTS` in `static/js/core.js`; Agent and Companion chat prepend that context on send.

- `app.py` -- Flask routes, one group per tab's API.
- `db.py` -- SQLite (`planner.db`, gitignored), all CRUD. `categories` table seeded once from
  `categories.py`, then the DB is the live source of truth.
- `embeddings.py` -- TF-IDF + SVD helpers used by the Ideas 3D map, Projects/Tasks similarity
  checks, and the Agent Activity 2D graph -- all zero-cost, no API calls.
- `ai.py` -- raw Anthropic API calls, one function per prompt, all usage logged for the cost widget.
- `orchestrator.py` -- the only thing app.py calls for single-purpose AI work (goal chunking, daily
  summaries, task validation, vibecode, competitor research, codebase summaries). Routes to a named
  subagent and logs every run. This indirection exists so a local distilled model (e.g. Qwen/Gemma
  via Ollama, see `LOCAL_MODEL_*` in `.env.example`) can replace Claude per-
  subagent later without touching app.py.
- `agent.py` -- separate from orchestrator: the multi-turn, tool-using Agent-tab chat. Holds its
  own tool list (including the self-coding tools) and conversation history.
- `backup.py` -- full-project snapshot before any self-coding change is applied, plus the manual
  "Backup now" button. Also enforces "self-coding can only touch this project" via path checks.
- `email_sender.py` / `scheduler.py` -- daily email send, background thread loop.
- `obsidian_sync.py` -- writes DB state to Markdown in the vault (one-way, DB -> Markdown only).
- `static/index.html` -- entire frontend, vanilla JS, no build step. Sidebar nav grouped by
  function, dark/light theme via CSS variables, Plotly loaded from CDN for the 3D/2D graphs.
- `import_history.py` -- one-off script that pulled 612 days of real history from
  `MASTER_planning_v3.xlsx` into `planner.db` (already run; see Historical data below).

## Deploying to a VM (for 24/7 uptime -- daily emails/agent work even when your PC is off)

I don't have cloud credentials, so provisioning the VM itself is on you; everything after that is
copy-paste. Any small Ubuntu box works (DigitalOcean, Hetzner, Lightsail, etc, ~$5-6/mo):

```
# on the VM
curl -fsSL https://get.docker.com | sh
git clone <your repo>   # or scp this folder over
cd Planner
cp .env.example .env && nano .env   # fill in ANTHROPIC_API_KEY, real SMTP creds, etc.
touch planner.db                    # avoid a Docker bind-mount gotcha (see below)
docker compose up -d --build
```

Then open port 5099 in the VM's firewall (or put a reverse proxy like Caddy/nginx in front for a
real domain + HTTPS -- recommended if this is reachable from the internet). `planner.db` and
`obsidian_vault/` are bind-mounted so `docker compose up -d --build` on future updates never loses
data. `touch planner.db` first is required once -- Docker turns a bind-mount target into a
directory if the file doesn't already exist on the host.

**Not done yet**: pointing `desktop.py` at the remote server instead of `127.0.0.1`. Once you have
a real VM IP/domain, that's a one-line change -- tell me the URL and I'll wire it in.

**Security note**: `FLASK_DEBUG` defaults to `false` on purpose -- Flask's debug mode allows remote
code execution if left on and reachable from the internet. Never set it to `true` on the VM.

## Historical data

`MASTER_planning_v3.xlsx` in the project root has 612 days of real tracking since Jan 2024, in
almost exactly this app's schema (confirms the category/color scheme matches your real usage).
**Already imported** into `planner.db` via `import_history.py` -- the Trends tab charts it. Only
daily metrics were backfilled, not the hour-by-hour grid (the old sheet only stored per-day counts
per category, not which hour got which category).
