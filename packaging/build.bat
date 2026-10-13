@echo off
rem Builds packaging\output\Waypoint-Setup.exe -- the one file you send to someone.
rem Needs: Python with requirements installed, PyInstaller, and Inno Setup 6.
rem Re-run after every update to ship a new version.
setlocal
cd /d "%~dp0"

echo [1/2] Bundling the app with PyInstaller...
python -m PyInstaller waypoint.spec --noconfirm --clean --distpath dist --workpath build > build.log 2>&1
if errorlevel 1 (
  echo PyInstaller failed. See packaging\build.log
  exit /b 1
)

echo [2/2] Wrapping it in an installer with Inno Setup...
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo Inno Setup 6 not found. Install it with:  winget install JRSoftware.InnoSetup
  exit /b 1
)
"%ISCC%" /Q waypoint.iss
if errorlevel 1 (
  echo Inno Setup failed.
  exit /b 1
)

echo.
echo Done: packaging\output\Waypoint-Setup.exe
endlocal
