' Launches the planner desktop app with no console window.
' Double-clicking desktop.py directly would flash a black cmd window; this avoids that.
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' pythonw.exe from PATH rather than a hardcoded install path, so it works on any machine.
' Show-state 1, not 0: the GUI window inherits it, and 0 would create the window hidden.
shell.Run "pythonw.exe desktop.py", 1, False
