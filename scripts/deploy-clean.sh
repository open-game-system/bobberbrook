#!/bin/zsh
# Deploys HEAD from a clean worktree, so another agent's uncommitted edits never ship.
set -euo pipefail
cd "${0:A:h}/.."
DIR=$(mktemp -d)/bobberbrook-deploy
git worktree add -q --detach "$DIR" HEAD
trap 'git worktree remove --force "$DIR"' EXIT
cd "$DIR"
pnpm install --frozen-lockfile > /dev/null
pnpm run deploy 2>&1 | grep -E "Deployed|https://|ERROR|Version ID"
