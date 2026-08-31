#!/usr/bin/env sh
# curl -fsSL https://mini.mydori.app/install.sh | sh
#
# Clones vshrinath/dori-mini and hands off to its own setup.sh — this script
# does nothing else. Read it before piping it into a shell, same as you would
# any install script: https://github.com/vshrinath/dori-mini/blob/main/site/install.sh
set -eu

# Installs under ~/.claude/skills/dori by default -- AGENTS.md's own routing text
# ("check ~/.claude/skills/dori/ first") assumes this exact path, and it's also the
# path Claude Code's own Skill auto-discovery scans (~/.claude/skills/*/SKILL.md).
# git clone creates missing parent directories on its own, so this works even if
# ~/.claude doesn't exist yet (e.g. Claude Code has never been opened).
REPO="https://github.com/vshrinath/dori-mini"
DEST="${DORI_MINI_DIR:-$HOME/.claude/skills/dori}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required — install it first." >&2
  exit 1
fi

if [ -d "$DEST" ]; then
  echo "✗ $DEST already exists. Set DORI_MINI_DIR to install elsewhere, or remove it first." >&2
  exit 1
fi

echo "Cloning $REPO to $DEST ..."
# --no-cone sparse-checkout excludes site/ — that's this landing page and its own copy of
# this script, not something an install needs to carry around.
git clone --depth 1 --filter=blob:none --no-checkout "$REPO" "$DEST"
cd "$DEST"
git sparse-checkout init --no-cone
git sparse-checkout set --no-cone '/*' '!/site'
git checkout main

exec ./setup.sh
