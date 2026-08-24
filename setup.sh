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
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)
if [ "$NODE_MAJOR" -lt 24 ] 2>/dev/null; then
  echo "✗ Node.js 24+ required (found: $(node --version 2>/dev/null || echo 'not installed'))."
  echo "  Install via nvm:  nvm install 24 && nvm use 24"
  echo "  Or download from: https://nodejs.org"
  exit 1
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

echo
echo "== Setup complete =="
echo "Add this to your shell profile so VAULT_ROOT is set in new terminals:"
echo "  echo 'source $CONFIG_FILE' >> ~/.zshrc   # or ~/.bashrc"
echo
echo "Then in this shell:"
echo "  source $CONFIG_FILE"
echo "  node route-destination.mjs youtube"
