#!/usr/bin/env bash
# PH-13D oracle: archive index, handoff memo, and post-board action register.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-13D exit-criteria (evidence archive and handoff) =="

need_file docs/release/evidence-archive-index.md 1700
need_file docs/release/release-handoff-memo.md 1600
need_file docs/release/post-board-action-register.md 1600

for marker in EVIDENCE_ARCHIVE_READY RELEASE_HANDOFF_MEMO POST_BOARD_ACTION_REGISTER OWNER_DATE HUMAN_BOARD_ACTION_REQUIRED; do
  rg -q "$marker" docs/release apps/api/test/ph13-release-candidate-seal.test.cjs && grn "archive marker: $marker" || red "missing archive marker: $marker"
done

if node --test apps/api/test/ph13-release-candidate-seal.test.cjs; then
  grn "PH-13D archive/handoff tests passed"
else
  red "PH-13D archive/handoff tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-13D met' || echo 'RED - PH-13D not complete') =="
exit "$fail"

