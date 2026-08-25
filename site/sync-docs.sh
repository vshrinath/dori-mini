#!/usr/bin/env sh
# Re-run before every deploy — docs/ here is a copy, not a symlink (Vercel
# deploys don't reliably follow symlinks), so it can drift from the real
# source at ../docs until this is re-run.
set -eu
cd "$(dirname "$0")"
cp ../docs/*.html docs/
echo "synced $(ls docs/*.html | wc -l | tr -d ' ') doc pages"
