#!/usr/bin/env bash
# PH-14B oracle: post-seal drift-watch evidence.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-14B exit-criteria (post-seal drift watch) =="

need_file docs/release/release-candidate-drift-watch.md 1600
need_file docs/release/post-seal-drift-report.md 1500
need_file ops/check-release-candidate-drift.sh 1300
need_file apps/api/test/ph14-post-seal-drift-watch.test.cjs 3200

for marker in POST_SEAL_DRIFT_WATCH DRIFT_STATUS_GREEN SEALED_ARTIFACTS_UNCHANGED PH13_SEAL_VERIFIED HUMAN_APPROVALS_STILL_PENDING; do
  rg -q "$marker" docs/release ops apps/api/test/ph14-post-seal-drift-watch.test.cjs && grn "drift marker: $marker" || red "missing drift marker: $marker"
done

if bash ops/check-release-candidate-drift.sh; then
  grn "PH-14 drift check passed"
else
  red "PH-14 drift check failed"
fi

if node --test apps/api/test/ph14-post-seal-drift-watch.test.cjs; then
  grn "PH-14B drift governance tests passed"
else
  red "PH-14B drift governance tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-14B met' || echo 'RED - PH-14B not complete') =="
exit "$fail"

