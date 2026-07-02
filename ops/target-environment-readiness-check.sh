#!/usr/bin/env bash
# PH-12 target-environment readiness dry-run. This script is non-mutating.
set -uo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

mode="dry-run"
if [ "${1:-}" = "--dry-run" ]; then
  mode="dry-run"
elif [ "${1:-}" != "" ]; then
  echo "RED unsupported argument: $1"
  exit 1
fi

fail=0
red(){ echo "RED $*"; fail=1; }
grn(){ echo "ok  $*"; }

echo "== PH-12 target-environment readiness =="
echo "mode=$mode"
echo "scope=NO_TARGET_ENV_MUTATION"
echo "credentials=PRODUCTION_CREDENTIALS_NOT_REQUIRED"

for var_name in TARGET_ENV_URL TARGET_DATABASE_URL TARGET_API_TOKEN DATABASE_URL API_BASE_URL HRMS_BASE_URL VITE_API_BASE_URL; do
  value="${!var_name:-}"
  if printf '%s' "$value" | grep -Eiq 'prod|production|live|\\.gov\\.in|\\.nic\\.in'; then
    red "$var_name looks production-like; dry-run refuses it"
  else
    grn "$var_name non-production or unset"
  fi
done

node -e "JSON.parse(require('fs').readFileSync('docs/spec/manifest.json','utf8'))" \
  && grn "manifest JSON parses" || red "manifest JSON failed"

node -e "const p=require('./package.json'); if(!p.scripts.check||!p.scripts['web:check']) process.exit(1)" \
  && grn "full regression scripts available" || red "missing full regression scripts"

for file in \
  docs/release/release-board-dossier.md \
  docs/release/human-approval-checklist.md \
  docs/release/target-environment-readiness.md \
  docs/release/environment-evidence-manifest.md; do
  [ -s "$file" ] && grn "$file exists" || red "$file missing"
done

for marker in \
  TARGET_ENVIRONMENT_READINESS_DRY_RUN \
  TARGET_SMOKE_HUMAN_RUN_REQUIRED \
  NO_TARGET_ENV_MUTATION \
  PRODUCTION_CREDENTIALS_NOT_REQUIRED \
  GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release ops && grn "marker $marker" || red "missing marker $marker"
done

if [ "$fail" -eq 0 ]; then
  echo "PH12_TARGET_READINESS_DRY_RUN_GREEN"
else
  echo "PH12_TARGET_READINESS_DRY_RUN_RED"
fi

exit "$fail"

