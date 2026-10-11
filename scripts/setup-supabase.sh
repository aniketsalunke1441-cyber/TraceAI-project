#!/usr/bin/env bash
# =====================================================================
#  FindBack — one-command Supabase setup (macOS / Linux)
#
#    cd ~/Desktop/FindBack
#    npm run setup:supabase
#
#  What it does (safe to run again):
#   1. checks Node.js 20+
#   2. installs the project packages, including the Supabase CLI (npm package "supabase")
#   3. logs you in to Supabase            -> your browser opens; approve the login
#   4. finds your project "FindBack"
#   5. links this folder to it            -> asks for your DATABASE password once
#   6. creates all tables, functions, triggers, RLS policies and the photo bucket
#      (supabase/migrations/*.sql, via `supabase db push`)
#   7. writes .env with the project URL + PUBLISHABLE key (never the secret key)
#   8. checks "Confirm email", verifies the connection (npm run check:db),
#      loads the demo data (npm run seed) and builds the app (npm run build)
#
#  Options (environment variables):
#   SUPABASE_PROJECT_REF=<ref>   use this project instead of looking up "FindBack"
#   FINDBACK_PROJECT_NAME=<name> look up a project with a different name
#   FINDBACK_SKIP_SEED=1         do not load demo data
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SB="${SUPABASE_CLI:-npx --no-install supabase}"
PROJECT_NAME="${FINDBACK_PROJECT_NAME:-FindBack}"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n\n' "$1"; exit 1; }

step "1/8  Checking Node.js"
command -v node >/dev/null 2>&1 || die "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' || die "Node.js 20 or newer is needed (you have $(node -v)). Install the LTS version from https://nodejs.org"
ok "Node.js $(node -v)"

step "2/8  Installing project packages (React, Vite, Supabase CLI …)"
if [ "${FINDBACK_SKIP_INSTALL:-}" != "1" ]; then
  npm install --no-fund --no-audit || die "npm install failed. Check your internet connection and run again."
fi
$SB --version >/dev/null 2>&1 || die "The Supabase CLI did not install. Try: npm install --save-dev supabase"
ok "Supabase CLI $($SB --version 2>/dev/null | tail -1)"

step "3/8  Logging in to Supabase"
if $SB projects list -o json >/dev/null 2>&1; then
  ok "Already logged in"
else
  echo "Your browser will open. Log in to Supabase and approve the CLI, then come back here."
  $SB login || die "Login did not complete. Run: npx supabase login"
  ok "Logged in"
fi

step "4/8  Finding your project \"$PROJECT_NAME\""
REF="${SUPABASE_PROJECT_REF:-}"
if [ -z "$REF" ]; then
  REF="$($SB projects list -o json | node scripts/supabase-helpers.mjs project-ref "$PROJECT_NAME")" || die "Could not pick the project automatically (see above)."
fi
ok "Project reference: $REF"

step "5/8  Linking this folder to the project"
if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "Enter your Supabase DATABASE password (the one you chose when creating the project)."
  echo "Forgot it? Supabase dashboard → Project Settings → Database → Reset database password."
  read -r -s -p "Database password: " SUPABASE_DB_PASSWORD; echo
fi
export SUPABASE_DB_PASSWORD   # read by the Supabase CLI; never written to any file
$SB link --project-ref "$REF" || die "Linking failed. Check the database password and try again."
ok "Linked"

step "6/8  Creating tables, functions, triggers, security rules and the photo bucket"
echo "Migrations to apply: $(ls supabase/migrations | tr '\n' ' ')"
if ! $SB db push --yes 2>/dev/null; then
  $SB db push || die "Creating the database failed (see the message above)."
fi
ok "Database is up to date"

step "7/8  Writing .env (publishable key only)"
$SB projects api-keys --project-ref "$REF" -o json | node scripts/supabase-helpers.mjs write-env "$REF" || die "Could not read the project's API keys."

step "8/8  Verifying and loading demo data"
if [ "${FINDBACK_SKIP_VERIFY:-}" != "1" ]; then
  AUTO="$(node scripts/supabase-helpers.mjs auth-settings || echo 'autoconfirm=unknown')"
  if [ "$AUTO" = "autoconfirm=off" ]; then
    echo
    echo "\"Confirm email\" is ON. New accounts (and the demo accounts) cannot log in until they click an email link."
    echo "Please open: https://supabase.com/dashboard/project/$REF/auth/providers  → Email → turn OFF \"Confirm email\" → Save"
    read -r -p "Press Enter when done (or type skip to continue without demo data): " ANSWER
    [ "$ANSWER" = "skip" ] && FINDBACK_SKIP_SEED=1
  fi
  npm run --silent check:db || die "The connection check failed (see above)."
  if [ "${FINDBACK_SKIP_SEED:-}" != "1" ]; then
    npm run --silent seed || die "Loading demo data failed (see above)."
  fi
  if [ "${FINDBACK_SKIP_BUILD:-}" != "1" ]; then
    npm run build || die "The production build failed (see above)."
  fi
fi

if [ "${FINDBACK_SKIP_VERIFY:-}" = "1" ]; then
  printf '\n\033[1;33mSetup steps finished for project %s, but the connection was NOT verified (FINDBACK_SKIP_VERIFY=1). Run: npm run check:db\033[0m\n' "$REF"
else
  printf '\n\033[1;32m✅ FindBack is connected to Supabase project %s (verified by npm run check:db).\033[0m\n' "$REF"
fi
echo "   Start the app:            npm run dev        → http://localhost:5173"
echo "   Optional Python API:      see README §5"
