#!/usr/bin/env bash
# Pulls the latest dori-mini scripts into an existing install. install.sh/setup.sh only
# handle a fresh clone (install.sh refuses outright if $DEST already exists) — this is
# the missing other half: an existing user's way to get new scripts/fixes.
#
# Usage: ./update.sh   (run from inside the cloned repo, e.g. ~/dori)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -d .git ]; then
  echo "Not a git checkout ($(pwd)) — can't update. If you're not sure where dori-mini" >&2
  echo "was installed, re-run the curl install line from https://mini.mydori.app instead." >&2
  exit 1
fi

# Never silently discard local edits — if something's uncommitted, stop and say so
# rather than pulling over it (same discipline as everywhere else here: never guess).
if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted local changes in $(pwd):" >&2
  git status --short >&2
  echo >&2
  echo "Commit, stash, or discard them first, then re-run ./update.sh." >&2
  exit 1
fi

OLD_HEAD=$(git rev-parse HEAD)

echo "Pulling latest..."
# --ff-only: refuses rather than creating a surprise merge commit on what should
# always be a clean linear history for an install like this.
if ! git pull --ff-only; then
  echo >&2
  echo "Pull didn't fast-forward — your local branch has diverged from origin/main." >&2
  echo "That shouldn't normally happen for an install directory; if you've been editing" >&2
  echo "files here directly, move your changes elsewhere and re-clone instead." >&2
  exit 1
fi

NEW_HEAD=$(git rev-parse HEAD)

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  echo "Already up to date ($(git rev-parse --short HEAD))."
  exit 0
fi

echo
echo "Updated $(git rev-parse --short "$OLD_HEAD") → $(git rev-parse --short "$NEW_HEAD"):"
git log --oneline "$OLD_HEAD..$NEW_HEAD"

if git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -q '^package\.json$'; then
  echo
  echo "package.json changed — reinstalling npm dependencies..."
  npm install --silent
  echo "✓ npm dependencies updated"
fi

echo
echo "Done. Most updates need nothing further — new/changed scripts are picked up"
echo "automatically next time your agent calls them. The exception is a launchd-"
echo "scheduled feature (WhatsApp, digests, the watched inbox): to newly opt into one"
echo "that showed up above, re-run ./setup.sh — that's safe (it won't touch your vault's"
echo "own files), but it re-asks EVERY prompt from scratch, including your vault path —"
echo "re-enter your real vault path there, don't just hit Enter, or it'll point at a new"
echo "default one instead of the vault you're already using."
