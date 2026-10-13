# Start Waypoint on Tailscale (Windows).
# Usage:
#   .\run_tailscale.ps1
#   .\run_tailscale.ps1 -Direct
#   .\run_tailscale.ps1 -Trust
param(
  [switch]$Direct,
  [switch]$Trust,
  [switch]$NoServe,
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$argsList = @()
if ($Direct) { $argsList += "--direct" }
if ($Trust) { $argsList += "--trust" }
if ($NoServe) { $argsList += "--no-serve" }
if ($Port -gt 0) { $argsList += @("--port", "$Port") }

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) {
  Write-Error "Python not found on PATH. Install Python 3 and retry."
}

& $python.Source ".\run_tailscale.py" @argsList
