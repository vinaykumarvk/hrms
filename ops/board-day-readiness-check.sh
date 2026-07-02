#!/usr/bin/env bash
# PH-14 board-day readiness checker. Local/non-mutating only.
set -uo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

fail=0
red(){ echo "RED $*"; fail=1; }
grn(){ echo "ok  $*"; }

echo "== PH-14 board-day readiness =="
echo "scope=BOARD_DAY_RUN_CARD"
echo "execution=NO_PRODUCTION_EXECUTION"

for var_name in TARGET_ENV_URL TARGET_DATABASE_URL TARGET_API_TOKEN PROD_DATABASE_URL PRODUCTION_DATABASE_URL; do
  value="${!var_name:-}"
  if printf '%s' "$value" | grep -Eiq 'prod|production|live|\\.gov\\.in|\\.nic\\.in'; then
    red "$var_name looks production-like"
  else
    grn "$var_name non-production or unset"
  fi
done

for file in \
  docs/release/board-day-run-card.md \
  docs/release/no-go-quarantine-plan.md \
  docs/release/release-candidate-drift-watch.md \
  docs/release/post-seal-drift-report.md; do
  [ -s "$file" ] && grn "$file exists" || red "$file missing"
done

for marker in \
  BOARD_DAY_RUN_CARD \
  NO_GO_QUARANTINE_PLAN \
  BOARD_DAY_READINESS_GREEN \
  NO_PRODUCTION_EXECUTION \
  HUMAN_BOARD_ACTION_REQUIRED \
  GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release ops && grn "marker $marker" || red "missing marker $marker"
done

if bash ops/check-release-candidate-drift.sh >/tmp/ph14-board-drift.log; then
  grn "drift watch green"
else
  red "drift watch failed"
fi

if [ "$fail" -eq 0 ]; then
  echo "BOARD_DAY_READINESS_GREEN"
else
  echo "BOARD_DAY_READINESS_RED"
fi

exit "$fail"

