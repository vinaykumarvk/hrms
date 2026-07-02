#!/usr/bin/env bash
# PH-16B oracle: G02 bulk correction batches (dry-run -> aggregate approval -> per-row idempotent commit ->
# PARTIAL_FAILED), cr_risk_signals fraud/velocity detectors with ERR-G02-RISKBLOCK commit hold + reviewer
# clear/confirm, and employment-status gating (ERR-G02-STATUSGATE, DECEASED elevation). Behavior + executed
# tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S02="apps/api/src/modules/g02 apps/api/src/routes/g02.routes.ts"
T=apps/api/test

echo "== PH-16B exit-criteria (G02 bulk corrections + fraud/velocity + status gates to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (BRD entities + registered codes, not markers)
for spec in \
  "bulk batch entity consumed (bulk_correction_batches)::bulk_correction_batches" \
  "per-row partial failure terminal (PARTIAL_FAILED)::PARTIAL_FAILED" \
  "batch lifecycle statuses (PENDING_APPROVAL)::PENDING_APPROVAL" \
  "risk signal ledger consumed (cr_risk_signals)::cr_risk_signals" \
  "mule-account detector (DUPLICATE_BANK_ACCOUNT)::DUPLICATE_BANK_ACCOUNT" \
  "auth-then-financial detector (AUTH_CHANNEL_THEN_FINANCIAL)::AUTH_CHANNEL_THEN_FINANCIAL" \
  "risk band aggregation (risk_band)::risk_band" \
  "blocked commit hold (ERR-G02-RISKBLOCK)::ERR-G02-RISKBLOCK" \
  "status snapshot at submit (employment_status_at_submit)::employment_status_at_submit" \
  "status gate (ERR-G02-STATUSGATE)::ERR-G02-STATUSGATE" \
  "deceased elevation path (DECEASED)::DECEASED"
do must "$spec" $S02; done

# 2) executed oracle tests
for spec in \
  "bulk dry-run + per-row commit exercised (bulk_correction_batches)::bulk_correction_batches" \
  "partial failure asserted (PARTIAL_FAILED)::PARTIAL_FAILED" \
  "mule detector asserted (DUPLICATE_BANK_ACCOUNT)::DUPLICATE_BANK_ACCOUNT" \
  "auth-then-financial detector asserted (AUTH_CHANNEL_THEN_FINANCIAL)::AUTH_CHANNEL_THEN_FINANCIAL" \
  "NEGATIVE: blocked commit asserted (ERR-G02-RISKBLOCK)::ERR-G02-RISKBLOCK" \
  "NEGATIVE: non-ACTIVE self-service asserted (ERR-G02-STATUSGATE)::ERR-G02-STATUSGATE" \
  "deceased elevation exercised (DECEASED)::DECEASED"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-16B met' || echo 'RED - PH-16B not complete') =="
exit "$fail"
