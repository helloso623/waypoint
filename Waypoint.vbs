' Waypoint launcher -- double-click opens the app window straight away.
' wscript runs this with no console at all, so nothing flashes on screen.
' The app is started FIRST and the git pull happens afterwards in the
' background: waiting on the network before showing a window is what made the
' old .cmd feel slow, and code pulled now would only take effect next launch
' anyway.
Option Explicit
Dim sh, fso, base
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' Derived from this script's own location, so moving or renaming the Waypoint
' folder doesn't silently break the shortcut.
base = fso.GetParentFolderName(WScript.ScriptFullName)

' Show-state 1, NOT 0: a launched GUI process inherits this as its initial
' window state, so 0 creates pywebview's window hidden and nothing ever appears.
' pythonw has no console of its own, so 1 shows the app window and nothing else.
sh.CurrentDirectory = base & "\plan"
sh.Run "pythonw.exe desktop.py", 1, False

' Update in the background so the next double-click runs the newest code.
' --ff-only ON PURPOSE: it either fast-forwards cleanly or does nothing at all.
' Write a timestamped header first so an empty log cannot masquerade as success.
Dim logPath
logPath = base & "\plan\last-git-pull.log"
Dim log
Set log = fso.CreateTextFile(logPath, True)
log.WriteLine "starting git pull --ff-only at " & Now
log.Close
sh.CurrentDirectory = base
sh.Run "cmd /c git pull --ff-only >> """ & logPath & """ 2>&1 & echo EXIT=%ERRORLEVEL%>> """ & logPath & """", 0, False
