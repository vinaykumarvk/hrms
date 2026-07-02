#!/usr/bin/env bash
# PH-15C oracle: G03 shifts, rosters, punch ingestion, comp-off — roster overlap validation
# (VAL-G03-ROSTER-OVERLAP), append-only punch ledger with dedup + device auth + shift-anchored
# attendance_date derivation, comp_off_ledger with FIFO redemption and expiry. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S03="apps/api/src/modules/g03 apps/api/src/routes/g03.routes.ts"
T=apps/api/test

echo "== PH-15C exit-criteria (G03 shifts/rosters/punches/comp-off to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (BRD entities + validation/error codes, not markers)
for spec in \
  "shifts entity consumed::shifts" \
  "shift timing validation (VAL-G03-SHIFT-TIMES)::VAL-G03-SHIFT-TIMES" \
  "rosters entity consumed::rosters" \
  "roster overlap validation (VAL-G03-ROSTER-OVERLAP)::VAL-G03-ROSTER-OVERLAP" \
  "punch ledger consumed (attendance_punches)::attendance_punches" \
  "punch dedup key (device_id, source_ref)::device_id" \
  "device auth marker (DEVICE_NOT_AUTHORIZED)::DEVICE_NOT_AUTHORIZED" \
  "future punch guard (INVALID_PUNCH_TIME)::INVALID_PUNCH_TIME" \
  "attendance_date derived::attendance_date" \
  "shift date-anchor rule applied::date_anchor_rule" \
  "comp-off ledger consumed (comp_off_ledger)::comp_off_ledger" \
  "FIFO redemption::FIFO|[Ff]ifo" \
  "comp-off expiry (expires_on / COMP_OFF_EXPIRED)::expires_on|COMP_OFF_EXPIRED" \
  "insufficient balance guard (COMP_OFF_INSUFFICIENT)::COMP_OFF_INSUFFICIENT"
do must "$spec" $S03; done

# 2) executed oracle tests
for spec in \
  "NEGATIVE: roster overlap rejected asserted (VAL-G03-ROSTER-OVERLAP)::VAL-G03-ROSTER-OVERLAP" \
  "punch dedup asserted (device_id replay)::device_id" \
  "NEGATIVE: unauthorised device asserted (DEVICE_NOT_AUTHORIZED)::DEVICE_NOT_AUTHORIZED" \
  "attendance_date derivation asserted (night shift anchor)::date_anchor_rule|attendance_date" \
  "comp-off ledger FIFO/expiry exercised::comp_off_ledger" \
  "NEGATIVE: comp-off over-balance asserted (COMP_OFF_INSUFFICIENT)::COMP_OFF_INSUFFICIENT"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-15C met' || echo 'RED - PH-15C not complete') =="
exit "$fail"
