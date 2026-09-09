#!/usr/bin/env bash
# One-shot setup: clean install, sanity check, and start the tracker.
# Safe to re-run at any time.

set -uo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; }

say "Charlevoix Flight Tracker — setup"

# --- Node version -----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed."
  echo "Download the LTS version from https://nodejs.org and run this again."
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then
  fail "Node $(node -v) is too old; this needs version 20 or newer."
  echo "Update from https://nodejs.org and run this again."
  exit 1
fi
echo "Node $(node -v) — OK"

# --- Clean out anything left by a failed previous install -------------------
if [ -d node_modules ]; then
  echo "Clearing the previous install..."
  rm -rf node_modules package-lock.json
fi

# --- Install ----------------------------------------------------------------
say "Installing (a minute or so)..."
install_log=$(mktemp)
if ! npm install >"$install_log" 2>&1; then
  if grep -q 'EACCES' "$install_log"; then
    fail "npm cannot write to its own cache folder."
    echo "This is a known npm bug that leaves root-owned files behind. Fix it with:"
    echo
    echo "    sudo chown -R \$(id -u):\$(id -g) \"\$HOME/.npm\""
    echo
    echo "then run this script again."
  else
    fail "The install failed. Last 20 lines:"
    tail -20 "$install_log"
  fi
  rm -f "$install_log"
  exit 1
fi
rm -f "$install_log"

# better-sqlite3 is optional; a failed native build is expected on newer Node.
driver=$(node -e "import('./server/sqlite.js').then(m => { m.createDatabase(':memory:'); console.log(m.driverName()); })" 2>/dev/null)
echo "Installed. Database driver: ${driver:-unknown}"

# --- Prove it works before claiming it does ---------------------------------
say "Checking everything runs..."
if npm test >/dev/null 2>&1; then
  echo "All tests pass."
else
  fail "Some tests failed. The app may still run, but something is off."
  echo "Run 'npm test' to see the details."
fi

# --- Owner lookups ----------------------------------------------------------
if [ ! -f data/flights.db ] || [ "$(node -e "
  try {
    const { getDb } = await import('./server/db.js');
    console.log(getDb().prepare('SELECT COUNT(*) n FROM registry').get().n);
  } catch { console.log(0); }
" 2>/dev/null)" = "0" ]; then
  say "Aircraft owner names are not loaded yet."
  echo "To get them, run this once (about a 90 MB download from the FAA):"
  echo
  echo "    npm run import-registry"
  echo
  echo "The tracker works without it — you just get tail numbers, not owners."
fi

# --- Go ---------------------------------------------------------------------
say "Starting. Your browser should open at http://localhost:4903"
echo "Press Control-C to stop."
exec npm start
