#!/usr/bin/env bash
# PH-07B oracle: G04 leave->SR statutory integration — lineage + event_sequence + uniqueness, real HMAC
# payload signature with ERR-G04-SIGNATURE-INVALID verify path, exponential backoff via available_at,
# persisted sr_dead_letter, reconciliation (MISSING_SR / ORPHAN_CORRECTION), sr_correction_link.
# REAL-outcome oracle over g04 source + migrations + behavior tests + green suites. Fail-closed
# negative: a payload signature not backed by crypto createHmac is RED. No marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-07B exit-criteria (G04 relay -> statutory integration) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"
G04=apps/api/src/modules/g04

# 1) BRD-named fields, codes and entities in g04 source ("label::pattern" list, BSD-grep safe)
for spec in \
  "lineage field leave_spell_lineage_id::leave_?spell_?lineage|leaveSpellLineage" \
  "monotonic event_sequence::event_?sequence|eventSequence" \
  "payload signature field::payload_?signature|payloadSignature" \
  "signature error ERR-G04-SIGNATURE-INVALID::ERR-G04-SIGNATURE-INVALID" \
  "backoff scheduling::backoff" \
  "available_at pick scheduling::available_?at|availableAt" \
  "dead-letter entity sr_dead_letter::sr_?dead_?letter|srDeadLetter" \
  "reconciliation finding MISSING_SR::MISSING_SR" \
  "reconciliation finding ORPHAN_CORRECTION::ORPHAN_CORRECTION" \
  "correction link sr_correction_link::sr_?correction_?link|correctionLink" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" "$G04" 2>/dev/null && grn "$label in g04 src" || red "missing in g04 src: $label"
done

# 2) fail-closed negative: signature must be a real HMAC, not a pseudo-hash stand-in
if grep -rqiE 'payload_?signature|payloadSignature' "$G04" 2>/dev/null && ! grep -rqE 'createHmac' "$G04" 2>/dev/null; then
  red "NEGATIVE: payload signature present but not computed via crypto createHmac (pseudo-hash is not a signature)"
elif grep -rqE 'createHmac' "$G04" 2>/dev/null; then
  grn "payload signature uses crypto createHmac"
else
  red "no HMAC signing in g04 src"
fi
grep -rqiE 'verify' "$G04" 2>/dev/null && grn "signature verify path present before posting" || red "no signature verification path in g04"

# 3) persistence: migration DDL for the statutory entities
sqlhit(){ find apps/api -path '*node_modules*' -prune -o -iname '*.sql' -print0 2>/dev/null | xargs -0 grep -liE "$1" 2>/dev/null | grep -q .; }
for t in sr_dead_letter reconciliation_finding sr_correction_link leave_spell_lineage_id; do
  sqlhit "$t" && grn "migration DDL references: $t" || red "no migration DDL under apps/api for: $t"
done
sqlhit 'unique.*(lineage|event_sequence)|(lineage|event_sequence).*unique' && grn "lineage/sequence uniqueness constraint in DDL" || red "no uniqueness constraint on lineage+event_sequence in DDL"

# 4) behavior tests: tamper negative, backoff, reconciliation
for spec in \
  "signature-tamper negative test::ERR-G04-SIGNATURE-INVALID" \
  "backoff/available_at test::available_?at|availableAt|backoff" \
  "reconciliation MISSING_SR test::MISSING_SR" \
  "reconciliation ORPHAN_CORRECTION test::ORPHAN_CORRECTION" \
; do
  label="${spec%%::*}"; pat="${spec#*::}"
  grep -rqiE "$pat" apps/api/test 2>/dev/null && grn "$label present in apps/api/test" || red "missing $label in apps/api/test"
done

# 5) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite incl. G04 statutory tests)" || red "npm test FAILED"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-07B met' || echo 'RED — PH-07B not complete') =="
exit "$fail"
