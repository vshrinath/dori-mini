#!/usr/bin/env bash
# Bootstraps dori for a new machine, minimal prompts: auto-installs Node 24+, npm deps,
# and yt-dlp/markitdown if missing (no y/n gate — just picks the best available method),
# asks only for a vault path (defaulted) and a name (required, for meeting-attendee
# matching), and creates an empty vault skeleton if the user doesn't have one yet.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "== dori setup =="
echo

# --- Node.js 24+ (required for node:sqlite) --- no prompt: just get it the best way available.
node_major() { node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0; }
NODE_MAJOR=$(node_major)
if [ "${NODE_MAJOR:-0}" -lt 24 ] 2>/dev/null; then
  echo "Node.js 24+ required (found: $(node --version 2>/dev/null || echo 'not installed')) — installing..."
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm install 24 && nvm use 24
  elif command -v brew >/dev/null 2>&1; then
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nodejs npm
  fi
  NODE_MAJOR=$(node_major)
  if [ "${NODE_MAJOR:-0}" -lt 24 ] 2>/dev/null; then
    echo "  Couldn't install Node 24+ automatically — install it from https://nodejs.org"
    echo "  (or nvm: https://github.com/nvm-sh/nvm), then re-run this script."
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

# --- external CLI tools --- no prompt: install automatically via whichever of
# brew/pacman/pip3 is actually present (pip3 is the one most non-coder Mac/Linux setups
# have even without Homebrew, since Python usually ships preinstalled).
install_tool() {
  local cmd="$1" pip_pkg="$2" brew_pkg="$3" pacman_pkg="$4" purpose="$5"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "✓ $cmd found ($purpose)"
    return
  fi
  echo "$cmd not found ($purpose) — installing..."
  if command -v brew >/dev/null 2>&1; then
    brew install "$brew_pkg"
  elif [ -n "$pacman_pkg" ] && command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm "$pacman_pkg"
  elif command -v pip3 >/dev/null 2>&1; then
    pip3 install --user "$pip_pkg"
  else
    echo "  No brew, pacman package, or pip3 found — install $cmd manually to use YouTube/document capture."
    return
  fi
  command -v "$cmd" >/dev/null 2>&1 && echo "✓ $cmd installed" || echo "  Install may need a new shell to be on PATH — re-run this script after."
}
echo
install_tool yt-dlp yt-dlp yt-dlp yt-dlp "YouTube transcript/download"
# markitdown isn't in Arch's official repos — no safe non-interactive AUR install path,
# so this one skips straight to pip3 there (empty pacman_pkg).
install_tool markitdown markitdown markitdown "" "document → Markdown conversion"

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

echo
echo "Your name, exactly as it shows up in meeting attendee lists — used so meeting notes"
echo "can automatically recognize and skip you when matching who's who."
SELF_NAME=""
while [ -z "$SELF_NAME" ]; do
  read -r -p "Your name: " SELF_NAME
done

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

# --- WhatsApp channel (pair inline, then run in the background — macOS only) ---
if [ "$(uname)" = "Darwin" ]; then
  echo
  echo "WhatsApp channel: text a dedicated number and Dori files whatever you send"
  echo "(links, photos, notes) straight into your vault — no chat session needed."
  echo "Needs a SPARE WhatsApp number, not your main one (see docs/guide.html for why)."
  read -r -p "Set this up now? [y/N] " WA_REPLY
  if [[ "$WA_REPLY" =~ ^[Yy]$ ]]; then
    echo
    echo "On the SPARE number's phone: WhatsApp > Settings > Linked Devices > Link a Device."
    echo "A QR code will appear below — scan it now."
    echo
    if node listen-whatsapp.mjs --pair-only; then
      echo "✓ WhatsApp paired"
      WA_PLIST="$HOME/Library/LaunchAgents/com.dori.whatsapp-listener.plist"
      sed -e "s|__NODE_PATH__|$(command -v node)|g" \
          -e "s|__REPO_PATH__|$SCRIPT_DIR|g" \
          -e "s|__HOME__|$HOME|g" \
          "$SCRIPT_DIR/whatsapp-listener.plist.template" > "$WA_PLIST"
      launchctl unload "$WA_PLIST" >/dev/null 2>&1 || true
      launchctl load "$WA_PLIST"
      echo "✓ WhatsApp listener running in the background (logs: ~/.dori/whatsapp-listener.log)"
    else
      echo "  Pairing didn't complete — skipped. Re-run 'node listen-whatsapp.mjs --pair-only' any time to retry."
    fi
  else
    echo "  Skipped — set it up later: node listen-whatsapp.mjs --pair-only, then see"
    echo "  whatsapp-listener.plist.template to run it in the background."
  fi
else
  echo
  echo "  (WhatsApp channel needs launchd — macOS only, skipped on $(uname))"
fi

# --- watched inbox folder (macOS only — launchd) ---
if [ "$(uname)" = "Darwin" ]; then
  echo
  echo "Watched inbox: point it at a real dropbox folder (Downloads, a scanner's save"
  echo "folder) and it'll notice new files once they stop changing, without you having"
  echo "to paste or attach anything — 'Dori, anything new in my inbox?' lists them."
  read -r -p "Set this up now? [y/N] " WATCH_REPLY
  if [[ "$WATCH_REPLY" =~ ^[Yy]$ ]]; then
    DEFAULT_WATCH_DIR="$HOME/Dori Inbox"
    read -r -p "  Folder to watch (blank = $DEFAULT_WATCH_DIR): " WATCH_DIR_INPUT
    WATCH_DIR="${WATCH_DIR_INPUT:-$DEFAULT_WATCH_DIR}"
    WATCH_DIR="${WATCH_DIR/#\~/$HOME}"
    mkdir -p "$WATCH_DIR"
    WATCH_PLIST="$HOME/Library/LaunchAgents/com.dori.watch-inbox.plist"
    sed -e "s|__NODE_PATH__|$(command -v node)|g" \
        -e "s|__REPO_PATH__|$SCRIPT_DIR|g" \
        -e "s|__WATCH_DIR__|$WATCH_DIR|g" \
        -e "s|__HOME__|$HOME|g" \
        "$SCRIPT_DIR/watch-inbox.plist.template" > "$WATCH_PLIST"
    launchctl unload "$WATCH_PLIST" >/dev/null 2>&1 || true
    launchctl load "$WATCH_PLIST"
    echo "✓ Watching $WATCH_DIR in the background (logs: ~/.dori/watch-inbox.log)"
  else
    echo "  Skipped — set it up later: DORI_WATCH_DIR=<folder> node watch-inbox.mjs watch,"
    echo "  or see watch-inbox.plist.template to run it in the background."
  fi
else
  echo
  echo "  (Watched inbox needs launchd — macOS only, skipped on $(uname))"
fi

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
else
  echo "  (Automatic digest scheduling needs launchd — macOS only, skipped on $(uname))"
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
# Hosted at mini.mydori.app (same content as docs/getting-started.html, kept there as one
# canonical copy) so links out to the rest of the guide always resolve, online or off a clone.
GUIDE="https://mini.mydori.app/docs/getting-started"
echo
echo "Opening the guide — see it for what to try first..."
if command -v open >/dev/null 2>&1; then open "$GUIDE"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$GUIDE"
else echo "  (couldn't auto-open — open $GUIDE yourself, or docs/getting-started.html in this repo)"
fi
