; Inno Setup script: turns the PyInstaller folder into one Waypoint-Setup.exe.
; Build with packaging\build.bat (which runs PyInstaller first, then this).
;
; Per-user install, so no admin prompt -- someone who does not know what UAC is should never
; see one. Their planner data lives in %LOCALAPPDATA%\Waypoint, which uninstalling leaves alone,
; so removing and reinstalling never loses their tasks.

#define AppName "Waypoint"
#define AppVersion "1.0.0"

[Setup]
AppId={{6B4398A7-A1FF-4E0A-8C25-BCE553DBCE41}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Waypoint
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=Waypoint-Setup
SetupIconFile=..\plan\static\icons\waypoint.ico
UninstallDisplayIcon={app}\Waypoint.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "Put a Waypoint icon on my desktop"; GroupDescription: "Shortcuts:"

[Files]
Source: "dist\Waypoint\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\Waypoint.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Waypoint.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Waypoint.exe"; Description: "Open Waypoint now"; Flags: nowait postinstall skipifsilent
