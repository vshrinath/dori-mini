# irm https://mini.mydori.app/install.ps1 | iex
#
# Clones vshrinath/dori-mini and hands off to its own setup.ps1 -- this script
# does nothing else. Read it before piping it into a shell, same as you would
# any install script: https://github.com/vshrinath/dori-mini/blob/main/site/install.ps1
#
# Windows PowerShell 5.1 compatible (no ?:, ??, &&/|| operators) -- that's
# what ships by default on Windows 10/11, see tech-constraints.yaml
# (constraint.windows.powershell-5.1-compatible).
$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/vshrinath/dori-mini'
$Dest = $env:DORI_MINI_DIR
if (-not $Dest) { $Dest = Join-Path $HOME 'dori' }

# git isn't preinstalled on Windows the way it is on macOS (Xcode CLT stub) -- install
# it via winget rather than erroring out immediately, matching setup.ps1's own
# auto-install treatment of Node. Also needed to keep the clone that follows -- update.sh
# later does `git pull` inside it, so this has to be a real repo, not a one-time zip.
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host 'git not found -- installing...'
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    # winget doesn't update this session's PATH -- re-read it from the registry (Machine +
    # User scope) so `git` is usable in this same script right after installing it, not
    # only after a new shell.
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error 'Could not install git automatically -- install it from https://git-scm.com/downloads, then re-run this script.'
    exit 1
  }
  Write-Host 'OK git installed'
}

if (Test-Path $Dest) {
  Write-Error "$Dest already exists. Set `$env:DORI_MINI_DIR to install elsewhere, or remove it first."
  exit 1
}

Write-Host "Cloning $Repo to $Dest ..."
# --no-cone sparse-checkout excludes site/ -- that's this landing page and its own copy of
# this script, not something an install needs to carry around.
# $ErrorActionPreference only governs PowerShell errors, not a native exe's exit code --
# check $LASTEXITCODE after each git call so a failed clone/checkout doesn't silently
# fall through to running setup.ps1 against a broken checkout.
git clone --depth 1 --filter=blob:none --no-checkout $Repo $Dest
if ($LASTEXITCODE -ne 0) { throw "git clone failed (exit $LASTEXITCODE)" }
Push-Location $Dest
git sparse-checkout init --no-cone
if ($LASTEXITCODE -ne 0) { throw "git sparse-checkout init failed (exit $LASTEXITCODE)" }
git sparse-checkout set --no-cone '/*' '!/site'
if ($LASTEXITCODE -ne 0) { throw "git sparse-checkout set failed (exit $LASTEXITCODE)" }
git checkout main
if ($LASTEXITCODE -ne 0) { throw "git checkout failed (exit $LASTEXITCODE)" }
Pop-Location

# A default Windows client's execution policy ('Restricted') blocks running a .ps1
# FILE from disk, even one we just created ourselves -- it does not affect this
# script, since irm|iex evaluates downloaded text in-memory, never as a file. Bypass
# it for just this one child-process invocation (not a permanent policy change) by
# re-invoking whichever host is currently running (powershell.exe or pwsh.exe) with
# -ExecutionPolicy Bypass, so setup.ps1 still runs with $PSScriptRoot intact.
$SetupPath = Join-Path $Dest 'setup.ps1'
$HostExe = (Get-Process -Id $PID).Path
& $HostExe -NoProfile -ExecutionPolicy Bypass -File $SetupPath
if ($LASTEXITCODE -ne 0) { throw "setup.ps1 failed (exit $LASTEXITCODE)" }
