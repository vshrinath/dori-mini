#!/usr/bin/env sh
# curl -fsSL https://mini.mydori.app/install.sh | sh
#
# Clones vshrinath/dori-mini and hands off to its own setup.sh — this script
# does nothing else. Read it before piping it into a shell, same as you would
# any install script: https://github.com/vshrinath/dori-mini/blob/main/site/install.sh
set -eu

REPO="https://github.com/vshrinath/dori-mini"
DEST="${DORI_MINI_DIR:-$HOME/dori}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required — install it first." >&2
  exit 1
fi

if [ -d "$DEST" ]; then
  echo "✗ $DEST already exists. Set DORI_MINI_DIR to install elsewhere, or remove it first." >&2
  exit 1
fi

echo "Cloning $REPO to $DEST ..."
git clone --depth 1 "$REPO" "$DEST"

cd "$DEST"
exec ./setup.sh
