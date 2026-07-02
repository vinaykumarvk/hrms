#!/usr/bin/env bash
# PH-12C oracle: target-environment readiness dry-run.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-12C exit-criteria (target-environment dry-run readiness) =="

need_file docs/release/target-environment-readiness.md 1800
need_file docs/release/environment-evidence-manifest.md 1500
need_file ops/target-environment-readiness-check.sh 1400

for marker in TARGET_ENVIRONMENT_READINESS_DRY_RUN TARGET_SMOKE_HUMAN_RUN_REQUIRED NO_TARGET_ENV_MUTATION PRODUCTION_CREDENTIALS_NOT_REQUIRED PH12_TARGET_READINESS_DRY_RUN_GREEN; do
  rg -q "$marker" docs/release ops && grn "target marker: $marker" || red "missing target marker: $marker"
done

if bash ops/target-environment-readiness-check.sh --dry-run; then
  grn "PH-12 target readiness dry-run passed"
else
  red "PH-12 target readiness dry-run failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-12C met' || echo 'RED - PH-12C not complete') =="
exit "$fail"

