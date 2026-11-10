#!/bin/sh
# Publish the wiki from docs/ (roadmap M7-T7). Idempotent: clones the wiki repo, replaces the mirrored
# pages, commits only when something changed, pushes.
#
# GitHub creates the wiki repository only after the first page is created in the web UI
# (Wiki tab → "Create the first page"). Until then this script stops with a message.
set -eu

REPO=${REPO:-adam-hanna/launchpad-lead-sheet}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if ! git ls-remote "git@github.com:$REPO.wiki.git" >/dev/null 2>&1; then
  echo "The wiki repository does not exist yet. Create the first page at https://github.com/$REPO/wiki, then rerun." >&2
  exit 2
fi

git clone -q "git@github.com:$REPO.wiki.git" "$WORK/wiki"
cp "$ROOT/docs/wiki/Home.md" "$WORK/wiki/Home.md"
cp "$ROOT/docs/wiki/Troubleshooting.md" "$WORK/wiki/Troubleshooting.md"
cp "$ROOT/docs/live-setup.md" "$WORK/wiki/Setup.md"
cp "$ROOT/docs/launchpad-protocol.md" "$WORK/wiki/Protocol.md"

cd "$WORK/wiki"
git add -A
if git diff --cached --quiet; then
  echo "Wiki already up to date."
  exit 0
fi
git -c user.name="${GIT_AUTHOR_NAME:-$(git -C "$ROOT" config user.name)}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-$(git -C "$ROOT" config user.email)}" \
    commit -q -m "Mirror docs from $(git -C "$ROOT" rev-parse --short HEAD)"
git push -q origin HEAD
echo "Wiki published."
