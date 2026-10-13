# PyInstaller recipe for the installable Waypoint.  Build with:  packaging\build.bat
#
# Only app code and app assets go in. Personal content (obsidian_vault, the xlsx, NAPKIN*.md,
# ISSUES.md, .env, planner.db) is deliberately NOT bundled: the person installing this starts
# with an empty planner of their own, and none of your data leaves your machine.
import pathlib

PLAN = pathlib.Path(SPECPATH).parent / "plan"

# Every app module, listed explicitly. Lots of them are imported lazily inside functions
# (runtime_errors, tailscale_net, ...), which the static scanner cannot see -- a missed one
# would only fail when that feature is first used, on someone else's PC.
SKIP = {"waypoint_app", "desktop", "conftest", "run_tailscale", "fixtures", "import_history"}
app_modules = sorted(
    p.stem for p in PLAN.glob("*.py")
    if p.stem not in SKIP and not p.stem.startswith("test_") and not p.stem.startswith("verify_")
)

datas = [
    (str(PLAN / "static"), "static"),
    (str(PLAN / ".env.example"), "."),
    (str(PLAN / "game_seed.json"), "."),
]

a = Analysis(
    [str(PLAN / "waypoint_app.py")],
    pathex=[str(PLAN)],
    datas=datas,
    hiddenimports=app_modules + ["desktop"],
    hookspath=[str(pathlib.Path(SPECPATH) / "hooks")],
    excludes=["playwright", "pytest", "tkinter", "matplotlib", "IPython", "notebook"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="Waypoint",
    icon=str(PLAN / "static" / "icons" / "waypoint.ico"),
    console=False,          # no black console window for the person using it
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Waypoint", upx=False)
