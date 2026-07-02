#!/usr/bin/env bash
# PH-08A oracle (re-baselined 2026-07-02 after docs/reviews/brd-coverage-audit-20260702.md):
# statutory wave shared kernels — persisted sanctioned_posts establishment register and
# qualifying_service_ledger + service_exclusion_rules, consumed by services, with compute,
# snapshot lineage, reconcile, durability, and negative-path tests. Replaces the prior rubber
# stamp (prompt-file existence, phases.yaml wiring, x- marker greps). RED unless real behavior exists.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
# case-insensitive grep over files/dirs: srcq <label> <ERE> <path...>
srcq(){ _l="$1"; _p="$2"; shift 2; if grep -rqiE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }
# case-sensitive grep (string-literal domain codes): codeq <label> <ERE> <path...>
codeq(){ _l="$1"; _p="$2"; shift 2; if grep -rqE "$_p" "$@" 2>/dev/null; then grn "$_l"; else red "$_l (pattern: $_p)"; fi; }

API=apps/api/src
T=apps/api/test/ph08a-establishment-qsl.test.cjs
echo "== PH-08A exit-criteria (persisted establishment register + qualifying-service ledger) =="

# 0) toolchain must exist — fail closed, never WARN
[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (install deps first)"

# 1) BRD-named kernel entities and fields exist in source
ENTITIES=(
  'sanctioned posts register::sanctioned.?posts?'
  'establishment strength field::sanctioned.?strength'
  'vacancy derivation field::current.?vacanc'
  'promotion quota split::promotion.?quota'
  'qualifying service ledger::qualifying.?service.?ledger'
  'service exclusion rules::service.?exclusion.?rule'
  'QSL net qualifying output::net.?qualifying'
  'QSL exclusion breakdown::exclusion.?breakdown'
  'QSL snapshot lineage::superseding.?snapshot'
)
for item in "${ENTITIES[@]}"; do
  srcq "src: ${item%%::*}" "${item##*::}" "$API"
done

# 2) durable persistence layer, not in-memory arrays (audit cross-cutting gap)
if find "$API" -type f \( -iname '*repositor*' -o -iname '*persist*' -o -iname '*store*' \) 2>/dev/null | grep -q .; then
  grn "repository/persistence layer present under $API"
else
  red "no repository/persistence layer under $API (kernels must not live in service arrays)"
fi
srcq "durable medium wired (fs/sqlite/postgres), not memory-only" 'node:fs|writeFileSync|readFileSync|sqlite|postgres' "$API"

# 3) kernels consumed by services
srcq "g06 consumes QSL (eligibility reads qualifying service)" 'qualifying.?service|[^a-zA-Z]qsl' "$API/modules/g06"
srcq "g06 consumes sanctioned-posts vacancy position" 'sanctioned.?post|current.?vacanc' "$API/modules/g06"
srcq "vacancy reconciliation behaviour present" 'reconcil' "$API"

# 4) BRD domain codes thrown as real `code` values (audit: only generic codes + marker strings before)
for c in STRENGTH_INCONSISTENT QUOTA_SPLIT_INVALID VACANCY_NOT_RECONCILED; do
  codeq "src carries domain code literal $c" "\"$c\"" "$API"
done

# 5) behavioural tests — named suite that `npm test` must run green
if [ -s "$T" ]; then grn "test file: $T"; else red "missing test file: $T"; fi
TESTS=(
  'QSL compute (gross - exclusions = net)::net.?qualifying'
  'exclusion-rule treatments exercised::eol|dies.?non|suspension'
  'snapshot supersede lineage::supersed'
  'persistence durability (rehydrate store, data survives)::rehydrat'
  'vacancy reconcile exercised::reconcil'
)
for item in "${TESTS[@]}"; do
  srcq "test: ${item%%::*}" "${item##*::}" "$T"
done
codeq "negative: quota split rejected via error.code" 'code === "QUOTA_SPLIT_INVALID"' "$T"
codeq "negative: strength inconsistency rejected via error.code" 'code === "STRENGTH_INCONSISTENT"' "$T"
grep -q 'assert\.throws' "$T" 2>/dev/null && grn "fail-closed negatives use assert.throws" || red "no assert.throws negative in $T"
if grep -q 'details\.marker' "$T" 2>/dev/null; then red "marker-string assertion regression in $T (assert error.code, not details.marker)"; else grn "no marker-string indirection in $T"; fi

# 6) strong oracle: typecheck + full API suite (RED on failure, never WARN)
if [ -d node_modules ]; then
  if npm run -s typecheck >/tmp/ph08a-typecheck.log 2>&1; then grn "npm run typecheck"; else red "npm run typecheck FAILED (/tmp/ph08a-typecheck.log)"; fi
  if npm test >/tmp/ph08a-test.log 2>&1; then grn "npm test green (API suite incl. $T)"; else red "npm test FAILED (/tmp/ph08a-test.log)"; fi
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08A met' || echo 'RED - PH-08A not complete') =="
exit "$fail"
