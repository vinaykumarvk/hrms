#!/usr/bin/env bash
# PH-11 local release smoke. Non-production evidence check only.
set -uo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

fail=0
red(){ echo "RED $*"; fail=1; }
grn(){ echo "ok  $*"; }

echo "== PH-11 local release smoke =="
echo "scope=NO_PRODUCTION_MUTATION"

environment_name="${APP_ENV:-${NODE_ENV:-local}}"
case "$environment_name" in
  prod|production|live)
    red "production-like environment refused: $environment_name"
    ;;
  *)
    grn "environment accepted: $environment_name"
    ;;
esac

for var_name in DATABASE_URL API_BASE_URL HRMS_BASE_URL VITE_API_BASE_URL; do
  value="${!var_name:-}"
  if printf '%s' "$value" | grep -Eiq 'prod|production|live|\\.gov\\.in|\\.nic\\.in'; then
    red "$var_name looks production-like"
  else
    grn "$var_name non-production or unset"
  fi
done

node -e "JSON.parse(require('fs').readFileSync('docs/spec/manifest.json','utf8'))" \
  && grn "manifest JSON parses" || red "manifest JSON failed"

node -e "const p=require('./package.json'); if(!p.scripts.check||!p.scripts['web:check']) process.exit(1)" \
  && grn "package release check scripts exist" || red "missing package release scripts"

for file in \
  docs/release/uat-execution-journal.md \
  docs/release/uat-defect-triage.md \
  docs/release/cutover-control-board.md \
  ops/cutover-rehearsal-runbook.md; do
  [ -s "$file" ] && grn "$file exists" || red "$file missing"
done

for marker in \
  RELEASE_FREEZE_CHECK \
  ROLLBACK_AUTHORITY_ASSIGNED \
  NO_PRODUCTION_MUTATION \
  CUTOVER_REHEARSAL_COMPLETED \
  GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release ops && grn "marker $marker" || red "missing marker $marker"
done

if [ "$fail" -eq 0 ]; then
  echo "PH11_LOCAL_RELEASE_SMOKE_GREEN"
else
  echo "PH11_LOCAL_RELEASE_SMOKE_RED"
fi

exit "$fail"
