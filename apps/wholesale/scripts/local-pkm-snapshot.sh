#!/bin/zsh
# Wrapper for the residential Pokémon price lane (kingdom-039).
# launchd calls this daily; it can also be run by hand.
# Logs go to ~/Library/Logs/cambridgetcg-pkm-snapshot.log (via the plist).

set -euo pipefail

# Resolve the repo from this script's location so the agent survives moves.
SCRIPT_DIR="${0:A:h}"
APP_DIR="${SCRIPT_DIR:h}"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$APP_DIR"
exec npx -y tsx scripts/local-pkm-snapshot.ts
