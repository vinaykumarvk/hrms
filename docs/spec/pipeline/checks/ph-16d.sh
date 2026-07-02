#!/usr/bin/env bash
# PH-16D oracle: G05 vacancy lifecycle with sanctioned-strength read-through (RESERVED/VACATED_ON_RELIEF/
# FILLED_ON_JOIN, transactional over-allotment guard), interactive counselling turn engine with vacancy lock
# and append-only choice ledger, and MUTUAL_TRANSFER coupled pairing. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S05="apps/api/src/modules/g05 apps/api/src/routes/g05.routes.ts"
T=apps/api/test

echo "== PH-16D exit-criteria (G05 counselling + vacancy lifecycle + mutual transfer to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (BRD entities + registered codes, not markers)
for spec in \
  "vacancy positions consumed (vacancy_positions)::vacancy_positions" \
  "reservation lifecycle consumed (vacancy_reservations)::vacancy_reservations" \
  "lifecycle states (VACATED_ON_RELIEF / FILLED_ON_JOIN)::VACATED_ON_RELIEF|FILLED_ON_JOIN" \
  "strength read-through (sanctioned)::sanctioned" \
  "over-allotment guard (ERR-G05-VACANCY-FULL)::ERR-G05-VACANCY-FULL" \
  "preferences consumed (transfer_preferences)::transfer_preferences" \
  "counselling sessions consumed (counselling_sessions)::counselling_sessions" \
  "append-only choice ledger (counselling_choices)::counselling_choices" \
  "vacancy lock holder (current_turn_employee_id)::current_turn_employee_id" \
  "turn guard (ERR-G05-COUNSEL-TURN)::ERR-G05-COUNSEL-TURN" \
  "timeout auto-pass (AUTO_PASS_TIMEOUT)::AUTO_PASS_TIMEOUT" \
  "mutual SR code posted (MUTUAL_TRANSFER)::MUTUAL_TRANSFER" \
  "mutual coupling guard (ERR-G05-MUTUAL-PAIR)::ERR-G05-MUTUAL-PAIR"
do must "$spec" $S05; done

# 2) executed oracle tests
for spec in \
  "NEGATIVE: out-of-turn choice asserted (ERR-G05-COUNSEL-TURN)::ERR-G05-COUNSEL-TURN" \
  "NEGATIVE: vacancy over-allotment asserted (ERR-G05-VACANCY-FULL)::ERR-G05-VACANCY-FULL" \
  "choice ledger + reservation conversion exercised (counselling_choices)::counselling_choices" \
  "timeout auto-pass asserted (AUTO_PASS_TIMEOUT)::AUTO_PASS_TIMEOUT" \
  "mutual coupled orders exercised (MUTUAL_TRANSFER)::MUTUAL_TRANSFER" \
  "NEGATIVE: asymmetric mutual completion asserted (ERR-G05-MUTUAL-PAIR)::ERR-G05-MUTUAL-PAIR"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-16D met' || echo 'RED - PH-16D not complete') =="
exit "$fail"
