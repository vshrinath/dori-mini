#!/usr/bin/env bash
# Bootstraps dori for a new machine: checks/reports dependencies,
# installs the one npm dependency, offers to install the two external CLI
# tools if missing, and creates an empty vault skeleton if the user doesn't
# have a Dori vault yet.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "== dori setup =="
echo

# --- Node.js 24+ (required for node:sqlite) ---
node_major() { node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0; }
NODE_MAJOR=$(node_major)
if [ "${NODE_MAJOR:-0}" -lt 24 ] 2>/dev/null; then
  echo "✗ Node.js 24+ required (found: $(node --version 2>/dev/null || echo 'not installed'))."
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    read -r -p "  Install with nvm ('nvm install 24 && nvm use 24')? [y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      # shellcheck disable=SC1091
      . "$HOME/.nvm/nvm.sh"
      nvm install 24 && nvm use 24
    fi
  elif command -v brew >/dev/null 2>&1; then
    read -r -p "  Install with 'brew install node'? [y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      brew install node
    fi
  fi
  NODE_MAJOR=$(node_major)
  if [ "${NODE_MAJOR:-0}" -lt 24 ] 2>/dev/null; then
    echo "  Still need Node 24+ — install nvm (https://github.com/nvm-sh/nvm) or from"
    echo "  https://nodejs.org, then re-run this script."
    exit 1
  fi
fi
echo "✓ Node.js $(node --version)"

# --- npm dependency (local embeddings model runtime) ---
echo
echo "Installing npm dependencies (@huggingface/transformers — this pulls in an ONNX"
echo "runtime, a few hundred MB, one-time)..."
npm install --silent
echo "✓ npm dependencies installed"

# --- external CLI tools ---
check_or_offer() {
  local cmd="$1" pip_pkg="$2" brew_pkg="$3" purpose="$4"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "✓ $cmd found ($purpose)"
    return
  fi
  echo "✗ $cmd not found ($purpose)"
  local install_cmd=""
  if command -v brew >/dev/null 2>&1; then
    install_cmd="brew install $brew_pkg"
  elif command -v pip3 >/dev/null 2>&1; then
    install_cmd="pip3 install --user $pip_pkg"
  fi
  if [ -n "$install_cmd" ]; then
    read -r -p "  Install with '$install_cmd'? [y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      eval "$install_cmd"
    else
      echo "  Skipped — $cmd-dependent features won't work until installed."
    fi
  else
    echo "  No brew or pip3 found — install $cmd manually to use YouTube/document capture."
  fi
}
echo
check_or_offer yt-dlp yt-dlp yt-dlp "YouTube transcript/download"
check_or_offer markitdown markitdown markitdown "document → Markdown conversion"

# --- vault path ---
echo
DEFAULT_VAULT="$HOME/dori-vault"
read -r -p "Path to your Dori vault (blank = create a fresh empty one at $DEFAULT_VAULT): " VAULT_INPUT
VAULT_PATH="${VAULT_INPUT:-$DEFAULT_VAULT}"
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

if [ ! -d "$VAULT_PATH" ]; then
  echo "Creating empty vault skeleton at $VAULT_PATH ..."
  mkdir -p "$VAULT_PATH"/{inbox,entities/people,entities/projects,projects,yt,references/clippings}
  echo "✓ vault skeleton created"
else
  echo "✓ using existing vault at $VAULT_PATH"
fi

read -r -p "Your name, as it appears in meeting attendee lists (used to skip yourself when matching attendees, optional): " SELF_NAME

# --- optional API keys (Fathom sync, Tavily person-research) ---
echo
echo "Optional — skip either by pressing Enter. Without them, fetch-fathom.mjs /"
echo "research-person.mjs just won't work; everything else is unaffected."
read -r -p "Fathom API key (Settings > API Access in Fathom, optional): " FATHOM_KEY_INPUT
read -r -p "Tavily API key (app.tavily.com, optional): " TAVILY_KEY_INPUT
if [ -n "$FATHOM_KEY_INPUT" ] || [ -n "$TAVILY_KEY_INPUT" ]; then
  ENV_FILE="$(pwd)/.env"
  { [ -n "$FATHOM_KEY_INPUT" ] && echo "FATHOM_API_KEY=$FATHOM_KEY_INPUT"; \
    [ -n "$TAVILY_KEY_INPUT" ] && echo "TAVILY_API_KEY=$TAVILY_KEY_INPUT"; } >> "$ENV_FILE"
  echo "✓ wrote $ENV_FILE (gitignored, never committed)"
fi

CONFIG_FILE="$HOME/.dori-env"
cat > "$CONFIG_FILE" <<EOF
export VAULT_ROOT="$VAULT_PATH"
export DORI_SELF_NAME="$SELF_NAME"
EOF
echo "✓ wrote $CONFIG_FILE (VAULT_ROOT=$VAULT_PATH)"

# --- wire into whichever agent tools are installed ---
echo
SCRIPT_DIR="$(pwd)"
ROUTER_AGENTS_MD="$SCRIPT_DIR/AGENTS.md"

wire_global() {
  local target="$1" label="$2"
  mkdir -p "$(dirname "$target")"
  if [ -L "$target" ] || [ ! -e "$target" ]; then
    ln -sf "$ROUTER_AGENTS_MD" "$target"
    echo "✓ $label: linked $target -> $ROUTER_AGENTS_MD"
  elif ! grep -qE "dori:start|$ROUTER_AGENTS_MD" "$target" 2>/dev/null; then
    { printf '\n<!-- dori:start -->\n'; cat "$ROUTER_AGENTS_MD"; printf '<!-- dori:end -->\n'; } >> "$target"
    echo "✓ $label: appended pointer to existing $target"
  else
    echo "✓ $label: already wired ($target)"
  fi
}

[ -d "$HOME/.claude" ] && wire_global "$HOME/.claude/CLAUDE.md" "Claude Code"
[ -d "$HOME/.codex" ] && wire_global "$HOME/.codex/AGENTS.md" "Codex CLI"
[ -d "$HOME/.grok" ] && wire_global "$HOME/.grok/AGENTS.md" "Grok Build"
# Antigravity's config directory isn't independently confirmed (it's a very new tool) —
# best-effort guess, harmless no-op if wrong since wire_global only acts when the dir exists.
[ -d "$HOME/.antigravity" ] && wire_global "$HOME/.antigravity/AGENTS.md" "Antigravity"

# --- morning/evening digest schedule (macOS only — launchd) ---
if [ "$(uname)" = "Darwin" ]; then
  echo
  read -r -p "Set up automatic morning/evening digests (desktop notification + local summary page)? [y/N] " DIGEST_REPLY
  if [[ "$DIGEST_REPLY" =~ ^[Yy]$ ]]; then
    read -r -p "  Morning digest time (HH:MM, 24h, default 07:00): " MORNING_TIME
    MORNING_TIME="${MORNING_TIME:-07:00}"
    read -r -p "  Evening digest time (HH:MM, 24h, default 18:00): " EVENING_TIME
    EVENING_TIME="${EVENING_TIME:-18:00}"

    NODE_ABS="$(command -v node)"
    LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$LAUNCH_AGENTS_DIR"

    install_digest_job() {
      local period="$1" time="$2"
      local hour minute plist
      hour=$((10#${time%%:*}))
      minute=$((10#${time##*:}))
      plist="$LAUNCH_AGENTS_DIR/com.dori.digest-$period.plist"
      sed -e "s|__NODE_PATH__|$NODE_ABS|g" \
          -e "s|__REPO_PATH__|$SCRIPT_DIR|g" \
          -e "s|__PERIOD__|$period|g" \
          -e "s|__HOUR__|$hour|g" \
          -e "s|__MINUTE__|$minute|g" \
          -e "s|__HOME__|$HOME|g" \
          "$SCRIPT_DIR/digest-schedule.plist.template" > "$plist"
      launchctl unload "$plist" >/dev/null 2>&1 || true
      launchctl load "$plist"
      echo "✓ $period digest scheduled for $time (edit $plist + \`launchctl unload/load\` it to change the time)"
    }
    install_digest_job morning "$MORNING_TIME"
    install_digest_job evening "$EVENING_TIME"
  else
    echo "  Skipped — run 'node digest.mjs morning' by hand any time, or install it later"
    echo "  yourself following digest-schedule.plist.template."
  fi
fi

echo
echo "== Setup complete =="
echo "Add this to your shell profile so VAULT_ROOT is set in new terminals:"
echo "  echo 'source $CONFIG_FILE' >> ~/.zshrc   # or ~/.bashrc"
echo
echo "Then in this shell:"
echo "  source $CONFIG_FILE"
echo "  node route-destination.mjs youtube"

# --- open the start-here guide, since a silent finish leaves you not knowing what to do next ---
GUIDE="$(pwd)/docs/getting-started.html"
if [ -f "$GUIDE" ]; then
  echo
  echo "Opening the guide — see it for what to try first..."
  if command -v open >/dev/null 2>&1; then open "$GUIDE"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$GUIDE"
  else echo "  (couldn't auto-open — open $GUIDE yourself)"
  fi
fi
