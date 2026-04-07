#!/usr/bin/env bash
# Fetches example and addon repos so VitePress can include real code snippets.
# Run before `docs:dev` or `docs:build`.

set -euo pipefail

REPOS=(
  "git@github.com:encryption4all/postguard-examples.git|docs/snippets/postguard-examples"
  "git@github.com:encryption4all/postguard-tb-addon.git|docs/snippets/postguard-tb-addon"
  "git@github.com:encryption4all/postguard-outlook-addon.git|docs/snippets/postguard-outlook-addon"
)

for entry in "${REPOS[@]}"; do
  REPO="${entry%%|*}"
  TARGET="${entry##*|}"
  NAME="$(basename "$TARGET")"

  if [ -d "$TARGET/.git" ]; then
    echo "Updating $NAME..."
    git -C "$TARGET" pull --ff-only
  else
    echo "Cloning $NAME..."
    mkdir -p "$(dirname "$TARGET")"
    git clone --depth 1 "$REPO" "$TARGET"
  fi
done

echo "All snippets ready."
