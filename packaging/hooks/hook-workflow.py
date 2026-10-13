# Waypoint has its own plan/workflow.py. pyinstaller-hooks-contrib ships a hook for an
# unrelated PyPI package that is also called "workflow" (Alfred-Workflow), and PyInstaller
# applies it to ours by name, which fails the build. Hooks in our own hookspath take priority,
# so this empty one stands in for it: our module needs no special handling.
