#!/usr/bin/env bash
# PH-13 approval-intake validator. It confirms approvals are still external and pending.
set -uo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

fail=0
red(){ echo "RED $*"; fail=1; }
grn(){ echo "ok  $*"; }

echo "== PH-13 human approval intake guard =="
echo "state=HUMAN_APPROVAL_INTAKE_PENDING"
echo "credentials=NO_PRODUCTION_CREDENTIALS"

for file in docs/release/human-approval-intake.md docs/release/change-ticket-template.md docs/release/release-candidate-manifest.md; do
  [ -s "$file" ] && grn "$file exists" || red "$file missing"
done

for marker in \
  HUMAN_APPROVAL_INTAKE_PENDING \
  CHANGE_TICKET_TEMPLATE \
  APPROVAL_DOCUMENTS_NOT_PRESENT \
  GO_LIVE_HUMAN_APPROVAL_PENDING \
  NO_PRODUCTION_CREDENTIALS; do
  rg -q "$marker" docs/release ops && grn "marker $marker" || red "missing marker $marker"
done

approval_dir="docs/release/approvals"
if [ -d "$approval_dir" ] && find "$approval_dir" -type f | grep -q .; then
  red "approval documents are present; PH-13 must remain pending"
else
  grn "APPROVAL_DOCUMENTS_NOT_PRESENT"
fi

for var_name in PROD_DATABASE_URL PRODUCTION_DATABASE_URL PROD_API_TOKEN TARGET_API_TOKEN; do
  if [ -n "${!var_name:-}" ]; then
    red "$var_name is set; approval-intake guard refuses production credentials"
  else
    grn "$var_name unset"
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "PH13_APPROVAL_INTAKE_PENDING_GREEN"
else
  echo "PH13_APPROVAL_INTAKE_PENDING_RED"
fi

exit "$fail"

