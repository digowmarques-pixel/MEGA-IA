#!/usr/bin/env bash
# Mac / Linux: instala (se preciso) e inicia o hub. Use ./iniciar.sh --tunnel para o túnel HTTPS.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Instale o Node.js LTS: https://nodejs.org"; exit 1; }
if [ ! -f .next/BUILD_ID ]; then npm ci --no-audit --no-fund && npm run build; fi
( sleep 8; (command -v open >/dev/null && open http://localhost:3100) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3100) || true ) &
exec node server.mjs "$@"
