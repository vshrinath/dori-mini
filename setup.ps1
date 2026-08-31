# Bootstraps dori for a new Windows machine: auto-installs Node 24+ (via winget),
# npm deps, and yt-dlp/markitdown if missing, asks only for a vault path (defaulted)
# and a name (required, for meeting-attendee matching), and creates an empty vault
# skeleton if the user doesn't have one yet. Mirrors setup.sh's install steps only --
# WhatsApp pairing, watched inbox, and the digest/update/Fathom schedules are
# separate not-yet-built requirements (see docs/features/windows-native-support),
# and print a "not yet on Windows" note below instead of silently doing nothing.
#
# Windows PowerShell 5.1 compatible (no ?:, ??, &&/|| operators) -- that's
# what ships by default on Windows 10/11, see tech-constraints.yaml
# (constraint.windows.powershell-5.1-compatible).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host '== dori setup (Windows) =='
Write-Host ''

# --- Node.js 24+ (required for node:sqlite) --- no prompt: just get it the best way available.
function Get-NodeMajor {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
  $v = & node --version 2>$null
  if (-not $v) { return 0 }
  $m = [regex]::Match($v, '^v(\d+)')
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return 0
}

$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 24) {
  Write-Host "Node.js 24+ required (found: $(if (Get-Command node -ErrorAction SilentlyContinue) { node --version } else { 'not installed' })) -- installing..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id OpenJS.NodeJS -e --silent --accept-package-agreements --accept-source-agreements
  }
  $nodeMajor = Get-NodeMajor
  if ($nodeMajor -lt 24) {
    Write-Host '  Could not install Node 24+ automatically -- install it from https://nodejs.org'
    Write-Host '  then re-run this script.'
    exit 1
  }
}
Write-Host "OK Node.js $(node --version)"

# --- npm dependency (local embeddings model runtime) ---
Write-Host ''
Write-Host 'Installing npm dependencies (@huggingface/transformers -- this pulls in an ONNX'
Write-Host 'runtime, a few hundred MB, one-time)...'
npm install --silent
if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
Write-Host 'OK npm dependencies installed'

# --- external CLI tools --- no prompt: install automatically via winget, falling back
# to pip3 for a tool with no winget package (markitdown), matching setup.sh's own
# fallback order (see tech-constraints.yaml, constraint.windows.tool-install-fallback-order).
function Install-Tool {
  param([string]$Cmd, [string]$PipPkg, [string]$WingetId, [string]$Purpose)
  if (Get-Command $Cmd -ErrorAction SilentlyContinue) {
    Write-Host "OK $Cmd found ($Purpose)"
    return
  }
  Write-Host "$Cmd not found ($Purpose) -- installing..."
  if ($WingetId -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    winget install --id $WingetId -e --silent --accept-package-agreements --accept-source-agreements
  } elseif (Get-Command pip3 -ErrorAction SilentlyContinue) {
    pip3 install --user $PipPkg
  } else {
    Write-Host "  No winget package or pip3 found -- install $Cmd manually to use YouTube/document capture."
    return
  }
  if (Get-Command $Cmd -ErrorAction SilentlyContinue) {
    Write-Host "OK $Cmd installed"
  } else {
    Write-Host '  Install may need a new shell to be on PATH -- re-run this script after.'
  }
}
Write-Host ''
Install-Tool -Cmd 'yt-dlp' -PipPkg 'yt-dlp' -WingetId 'yt-dlp.yt-dlp' -Purpose 'YouTube transcript/download'
# markitdown has no winget package -- straight to pip3, same precedent as setup.sh's
# pacman branch (setup.sh:69-71).
Install-Tool -Cmd 'markitdown' -PipPkg 'markitdown' -WingetId '' -Purpose 'document -> Markdown conversion'

# --- vault path ---
Write-Host ''
$DefaultVault = Join-Path $HOME 'dori-vault'
$VaultInput = Read-Host "Path to your Dori vault (blank = create a fresh empty one at $DefaultVault)"
$VaultPath = if ($VaultInput) { $VaultInput } else { $DefaultVault }

if (-not (Test-Path $VaultPath)) {
  Write-Host "Creating empty vault skeleton at $VaultPath ..."
  $subdirs = @('inbox', 'entities\people', 'entities\projects', 'projects', 'yt', 'references\clippings')
  foreach ($d in $subdirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $VaultPath $d) | Out-Null
  }
  Write-Host 'OK vault skeleton created'
} else {
  Write-Host "OK using existing vault at $VaultPath"
}

Write-Host ''
Write-Host "Your name, exactly as it shows up in meeting attendee lists -- used so meeting notes"
Write-Host 'can automatically recognize and skip you when matching who is who.'
$SelfName = ''
while (-not $SelfName) {
  $SelfName = Read-Host 'Your name'
}

# --- optional API keys (Fathom sync, Tavily person-research) ---
Write-Host ''
Write-Host "Optional -- skip either by pressing Enter. Without them, fetch-fathom.mjs /"
Write-Host 'research-person.mjs just will not work; everything else is unaffected.'
$FathomKeyInput = Read-Host 'Fathom API key (Settings > API Access in Fathom, optional)'
$TavilyKeyInput = Read-Host 'Tavily API key (app.tavily.com, optional)'
if ($FathomKeyInput -or $TavilyKeyInput) {
  $EnvFile = Join-Path (Get-Location) '.env'
  $lines = @()
  if ($FathomKeyInput) { $lines += "FATHOM_API_KEY=$FathomKeyInput" }
  if ($TavilyKeyInput) { $lines += "TAVILY_API_KEY=$TavilyKeyInput" }
  Add-Content -Path $EnvFile -Value $lines
  Write-Host "OK wrote $EnvFile (gitignored, never committed)"
}

# --- persist VAULT_ROOT / DORI_SELF_NAME --- User-scope env vars, not a dot-sourced
# file: Windows has no single shell-profile convention every new terminal reads
# (see tech-constraints.yaml, constraint.windows.env-vars-via-user-scope-not-dotfile).
[Environment]::SetEnvironmentVariable('VAULT_ROOT', $VaultPath, 'User')
[Environment]::SetEnvironmentVariable('DORI_SELF_NAME', $SelfName, 'User')
$env:VAULT_ROOT = $VaultPath
$env:DORI_SELF_NAME = $SelfName
Write-Host "OK set VAULT_ROOT and DORI_SELF_NAME (User environment variables; new terminals pick these up automatically)"

# --- wire into whichever agent tools are installed ---
Write-Host ''
$ScriptDir = $PSScriptRoot
$RouterAgentsMd = Join-Path $ScriptDir 'AGENTS.md'
$RouterAgentsContent = Get-Content -Raw $RouterAgentsMd

function Wire-Global {
  param([string]$Target, [string]$Label)
  $targetDir = Split-Path -Parent $Target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  if (-not (Test-Path $Target)) {
    Set-Content -Path $Target -Value "`n<!-- dori:start -->`n$RouterAgentsContent<!-- dori:end -->`n"
    Write-Host "OK $Label`: created $Target"
    return
  }
  $existing = Get-Content -Raw $Target
  if ($existing -notmatch 'dori:start') {
    Add-Content -Path $Target -Value "`n<!-- dori:start -->`n$RouterAgentsContent<!-- dori:end -->`n"
    Write-Host "OK $Label`: appended pointer to existing $Target"
  } else {
    Write-Host "OK $Label`: already wired ($Target)"
  }
}

if (Test-Path (Join-Path $HOME '.claude')) { Wire-Global (Join-Path $HOME '.claude\CLAUDE.md') 'Claude Code' }
if (Test-Path (Join-Path $HOME '.codex')) { Wire-Global (Join-Path $HOME '.codex\AGENTS.md') 'Codex CLI' }
if (Test-Path (Join-Path $HOME '.grok')) { Wire-Global (Join-Path $HOME '.grok\AGENTS.md') 'Grok Build' }
# Antigravity's config directory isn't independently confirmed (it's a very new tool) --
# best-effort guess, harmless no-op if wrong since Wire-Global only acts when the dir exists.
if (Test-Path (Join-Path $HOME '.antigravity')) { Wire-Global (Join-Path $HOME '.antigravity\AGENTS.md') 'Antigravity' }

# --- not yet ported to Windows: background daemons and scheduled jobs ---
# See docs/features/windows-native-support/verification-record.yaml -- each of these
# is its own not_done requirement, not silently skipped.
Write-Host ''
Write-Host '  (WhatsApp channel needs a background-daemon equivalent to launchd -- not yet on Windows)'
Write-Host '  (Watched inbox needs a background-daemon equivalent to launchd -- not yet on Windows)'
Write-Host '  (Automatic digest scheduling needs a Task Scheduler port -- not yet on Windows)'
Write-Host '  (Automatic update checks need a Task Scheduler port -- not yet on Windows)'
if ($FathomKeyInput) {
  Write-Host '  (Automatic Fathom polling needs a Task Scheduler port -- not yet on Windows)'
  Write-Host ''
  $FathomBacklogReply = Read-Host 'File every past Fathom meeting not already in the vault now? [y/N]'
  if ($FathomBacklogReply -match '^[Yy]$') {
    node file-meetings-backlog.mjs
    if ($LASTEXITCODE -ne 0) { Write-Host '  Backlog filing failed -- run "node file-meetings-backlog.mjs --dry-run" to see why.' }
  } else {
    Write-Host '  Skipped -- "node file-meetings-backlog.mjs --dry-run" shows what it would file.'
  }
}

Write-Host ''
Write-Host '== Setup complete =='
Write-Host 'VAULT_ROOT and DORI_SELF_NAME are set for new terminals already -- open a new'
Write-Host 'PowerShell window, then:'
Write-Host '  node route-destination.mjs youtube'

# --- open the start-here guide, since a silent finish leaves you not knowing what to do next ---
# Hosted at mini.mydori.app (same content as docs/getting-started.html, kept there as one
# canonical copy) so links out to the rest of the guide always resolve, online or off a clone.
$Guide = 'https://mini.mydori.app/docs/getting-started'
Write-Host ''
Write-Host 'Opening the guide -- see it for what to try first...'
try {
  Start-Process $Guide
} catch {
  Write-Host "  (could not auto-open -- open $Guide yourself, or docs/getting-started.html in this repo)"
}
