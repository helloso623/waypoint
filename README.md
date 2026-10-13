<p align="center">
  <img src="Waypoint.ico" width="88" alt="Waypoint icon">
</p>

<h1 align="center">Waypoint</h1>

<p align="center">
  A personal life-OS for your desktop: plan your day, capture ideas, track projects,<br>
  and talk to an AI assistant that can actually act on your planner. Everything stays on your computer.
</p>

---

## Install it (no coding needed)

1. Go to the **[Releases](../../releases)** page and download **`Waypoint-Setup.exe`**.
2. Double-click it. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway**.
   The installer is not code-signed yet, so Windows warns about every unsigned download.
3. Click **Next → Install → Finish**. Waypoint opens on its own.
4. On first launch, paste an AI key and press **Connect**. Waypoint works out which provider the key
   is from, checks that it works, and sets itself up. You can also press **Skip for now**: the
   planner works fully without AI, and you can add a key later in **System → Settings**.

Where to get a key (you only need **one**):

| Assistant | Get a key at |
|---|---|
| Claude (Anthropic) | <https://console.anthropic.com/settings/keys> |
| ChatGPT (OpenAI) | <https://platform.openai.com/api-keys> |
| Grok (xAI) | <https://console.x.ai> |

**Requirements:** Windows 10 or 11 (64-bit). Nothing else: Python and everything the app needs
are bundled inside the installer. It installs for your user only, so there is no admin prompt.

**Uninstalling** is done from *Settings → Apps*. Your planner data is kept, so reinstalling picks up
where you left off. To erase it too, delete `%LOCALAPPDATA%\Waypoint`.

---

## Your data stays on your computer

- Your tasks, calendar, notes and progress are saved in **`%LOCALAPPDATA%\Waypoint`**, on your PC only.
- Your API key is saved in that same folder. It is only ever sent to the AI provider it belongs to,
  and only when you use an AI feature.
- The app runs a small server that is only reachable **from your own computer** (`127.0.0.1`).
  Nothing on your network can connect to it.
- There are no accounts, analytics or telemetry. The installed app never contacts anyone except
  the AI provider you chose.

---

## What's inside

| App | What it does |
|---|---|
| **Planner** | Today hour by hour, tasks, goals, calendar, events, a paint-your-day view and trends |
| **Agent** | An AI assistant with real tools: it can add tasks, schedule events and search your notes, and it stages bigger changes for your approval |
| **Hub** | Pinned links, apps and an at-a-glance view of today |
| **Capture** | Ideas, skills, problems, essays and a file dump the agent can search |
| **Studio** | Projects, competitions, code, notes and classes |
| **Blueprint** | A node-graph editor for building small automations visually |
| **Arcade & Parallel** | Practice drills and a fantasy side-life game, with quests, a coin road, loot and skins earned by actually using the planner |
| **People** | Contacts, team and follow-ups |
| **System** | Settings, AI models and budget, data paths |

---

## For developers

Flask + SQLite + vanilla JavaScript, no frontend build step. `plan/static/index.html` is the whole
frontend shell and `plan/app.py` holds the routes.

### Run from source

```bash
git clone https://github.com/helloso623/waypoint.git
cd waypoint/plan
python -m pip install -r requirements-desktop.txt
python desktop.py          # native window
# or: python app.py        # serve in a browser at http://127.0.0.1:5099
```

Python 3.12 is what it's developed on. Set `WAYPOINT_DATA_DIR` to keep your data outside the
checkout (recommended). Otherwise it is written next to the code and is gitignored.

### Build the installer

```bat
:: one-time setup
python -m venv packaging\.buildenv
packaging\.buildenv\Scripts\python -m pip install -r plan\requirements-desktop.txt pyinstaller
winget install JRSoftware.InnoSetup

:: every release
packaging\build.bat        :: -> packaging\output\Waypoint-Setup.exe
```

Build from the clean `.buildenv`, not your global Python. PyInstaller bundles whatever it can
reach, and a global environment with ML libraries installed turns a ~90 MB installer into several GB.
The packaged entry point is `plan/waypoint_app.py`. It moves data to `%LOCALAPPDATA%\Waypoint`,
binds to `127.0.0.1`, turns off all git features and logs to `waypoint.log` in the data folder.

### Tests

```bash
cd plan
python -m pytest tests -q
```

### Project layout

```
plan/
  app.py              Flask routes, one section per tab
  desktop.py          native window (pywebview) around the same Flask app
  waypoint_app.py     entry point for the packaged installer
  agent.py, ai.py     AI agent loop and model routing (Claude / OpenAI / Grok, with fallback)
  db.py               SQLite schema and queries
  static/             the entire frontend (index.html + js/ + css/)
  tests/              pytest suite
packaging/            PyInstaller spec, Inno Setup script, build.bat
```

### Napkin (optional, for the repo owner's workflow)

When run from a git checkout, Waypoint can commit **Napkin** feedback notes to `plan/NAPKIN.md` and
`plan/ISSUES.md` as a running improvement list. Notes marked private never leave the machine, and
IPs, email addresses, user paths and API keys are masked before anything is written to those files.
The installed app has this turned off.

---

## License

[MIT](LICENSE): free to use, modify and share, as long as the copyright notice stays with it.
Provided as is, with no warranty.
