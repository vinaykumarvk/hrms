#!/usr/bin/env bash
# PH-13C oracle: human approval intake and change-ticket guardrails.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-13C exit-criteria (approval intake guardrails) =="

need_file docs/release/human-approval-intake.md 1700
need_file docs/release/change-ticket-template.md 1500
need_file ops/validate-human-approval-intake.sh 1300

for marker in HUMAN_APPROVAL_INTAKE_PENDING CHANGE_TICKET_TEMPLATE APPROVAL_DOCUMENTS_NOT_PRESENT GO_LIVE_HUMAN_APPROVAL_PENDING NO_PRODUCTION_CREDENTIALS; do
  rg -q "$marker" docs/release ops && grn "intake marker: $marker" || red "missing intake marker: $marker"
done

if bash ops/validate-human-approval-intake.sh; then
  grn "PH-13 approval-intake guard passed"
else
  red "PH-13 approval-intake guard failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-13C met' || echo 'RED - PH-13C not complete') =="
exit "$fail"

