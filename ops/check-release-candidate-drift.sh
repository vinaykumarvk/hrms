#!/usr/bin/env bash
# PH-14 post-seal drift checker. Read-only local evidence check.
set -uo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

fail=0
red(){ echo "RED $*"; fail=1; }
grn(){ echo "ok  $*"; }

echo "== PH-14 release-candidate drift check =="
echo "scope=POST_SEAL_DRIFT_WATCH"
echo "mode=read-only"
echo "approval=HUMAN_APPROVALS_STILL_PENDING"

if bash ops/verify-release-candidate-seal.sh; then
  grn "PH13_SEAL_VERIFIED"
else
  red "PH13_SEAL_VERIFIED failed"
fi

if bash ops/validate-human-approval-intake.sh; then
  grn "HUMAN_APPROVALS_STILL_PENDING"
else
  red "approval-intake guard failed"
fi

for file in \
  docs/release/release-candidate-drift-watch.md \
  docs/release/post-seal-drift-report.md \
  docs/release/release-candidate-manifest.md \
  docs/release/human-approval-intake.md \
  docs/release/evidence-checksum-manifest.json; do
  [ -s "$file" ] && grn "$file exists" || red "$file missing"
done

for marker in \
  POST_SEAL_DRIFT_WATCH \
  DRIFT_STATUS_GREEN \
  SEALED_ARTIFACTS_UNCHANGED \
  PH13_SEAL_VERIFIED \
  APPROVAL_DOCUMENTS_NOT_PRESENT \
  HUMAN_APPROVALS_STILL_PENDING \
  GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release ops && grn "marker $marker" || red "missing marker $marker"
done

if [ -d docs/release/approvals ] && find docs/release/approvals -type f | grep -q .; then
  red "unexpected approval documents found in repository"
else
  grn "approval documents absent from repository"
fi

if [ "$fail" -eq 0 ]; then
  echo "PH14_DRIFT_WATCH_GREEN"
else
  echo "PH14_DRIFT_WATCH_RED"
fi

exit "$fail"
