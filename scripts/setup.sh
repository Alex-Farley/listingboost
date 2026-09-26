#!/usr/bin/env bash
# One-command, idempotent development setup for humans, CI and cloud coding agents.
# Installs the pinned Bun, dependencies, a local .dev.vars secret and the local D1 schema.
set -euo pipefail
cd "$(dirname "$0")/.."

BUN_VERSION="$(cat .bun-version)"
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version)" != "$BUN_VERSION" ]; then
  echo "Installing Bun $BUN_VERSION"
  curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION" >/dev/null
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

bun install --frozen-lockfile

if [ ! -f .dev.vars ]; then
  # Local-only secret; never committed (.gitignore).
  printf 'MEDIA_SIGNING_SECRET=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=')" > .dev.vars
  echo "Created .dev.vars with a random local signing secret"
fi

CI=1 bunx wrangler d1 migrations apply DB --local >/dev/null
echo "Setup complete. Run 'bun run verify' to check everything."
