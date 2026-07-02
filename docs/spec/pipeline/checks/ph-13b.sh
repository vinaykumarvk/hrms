#!/usr/bin/env bash
# PH-13B oracle: release-candidate evidence seal.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-13B exit-criteria (release-candidate seal) =="

need_file docs/release/release-candidate-manifest.md 1800
need_file docs/release/evidence-checksum-manifest.json 1000
need_file ops/verify-release-candidate-seal.sh 1500
need_file apps/api/test/ph13-release-candidate-seal.test.cjs 3200

for marker in RELEASE_CANDIDATE_SEALED EVIDENCE_CHECKSUM_MANIFEST SHA256_EVIDENCE_SEAL NO_APPROVAL_IMPLIED GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release ops apps/api/test/ph13-release-candidate-seal.test.cjs && grn "seal marker: $marker" || red "missing seal marker: $marker"
done

if bash ops/verify-release-candidate-seal.sh; then
  grn "PH-13 release-candidate seal verified"
else
  red "PH-13 release-candidate seal verification failed"
fi

if node --test apps/api/test/ph13-release-candidate-seal.test.cjs; then
  grn "PH-13B seal governance tests passed"
else
  red "PH-13B seal governance tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-13B met' || echo 'RED - PH-13B not complete') =="
exit "$fail"

