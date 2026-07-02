#!/usr/bin/env bash
# PH-09D oracle: compensation integration — disbursement tie-out equation, holds, recon SoD,
# G09 recovery caps, FnF consolidation, G10->G12 SR provenance with fact_key dedup, and the
# pension pre-credit account-verification gate. Behavior + executed negative tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
SM="apps/api/src/modules/g10 apps/api/src/modules/g11 apps/api/src/routes/g10.routes.ts apps/api/src/routes/g11.routes.ts"
T=apps/api/test

echo "== PH-09D exit-criteria (compensation integration, SoD, provenance) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) integration behavior in module source
for spec in \
  "bank disbursement ledger (bank_disbursements)::bank_disbursements" \
  "suspense ledger (disbursement_holds)::disbursement_holds" \
  "tie-out equation gate (ERR-G10-RECON-TIEOUT)::ERR-G10-RECON-TIEOUT" \
  "reconciliation sign-off SoD (ERR-G10-RECON-UNSIGNED)::ERR-G10-RECON-UNSIGNED" \
  "recovery bar: floor + CPC s.60 cap (ERR-G10-RECOVERY-BARRED)::ERR-G10-RECOVERY-BARRED" \
  "FnF consolidated settlement (fnf_settlements)::fnf_settlements" \
  "FnF pulls loans (loans_advances)::loans_advances" \
  "FnF pulls carryforwards (deduction_carryforwards)::deduction_carryforwards" \
  "SR posting: PAY_FIXATION::PAY_FIXATION" \
  "SR posting: ANNUAL_INCREMENT::ANNUAL_INCREMENT" \
  "SR provenance uses fact_key::fact_key|factKey" \
  "pre-credit verification store (pen_bank_account_verifications)::pen_bank_account_verifications" \
  "disbursement blocked unverified (ERR-G11-ACCOUNT-VERIFY)::ERR-G11-ACCOUNT-VERIFY"
do must "$spec" $SM; done

# 2) provenance discipline: G10/G11 must not append to the SR ledger directly
if grep -rqE 'service_register_events' apps/api/src/modules/g10 apps/api/src/modules/g11 2>/dev/null; then
  red "g10/g11 references service_register_events directly — must post via the G12 ingest contract"
else grn "no direct service_register_events writes from g10/g11 (ingest contract respected)"; fi

# 3) executed oracle tests
for spec in \
  "tie-out equation exercised (disbursed+held+failed=net)::ERR-G10-RECON-TIEOUT" \
  "NEGATIVE: same-actor/unsigned recon asserted (ERR-G10-RECON-UNSIGNED)::ERR-G10-RECON-UNSIGNED" \
  "NEGATIVE: barred recovery asserted (ERR-G10-RECOVERY-BARRED)::ERR-G10-RECOVERY-BARRED" \
  "SR dedup: replayed fact_key is semantic duplicate::semanticDuplicate|SEMANTIC_DUPLICATE" \
  "SR dedup exercised on PAY_FIXATION::PAY_FIXATION" \
  "NEGATIVE: unverified account blocks disbursement (ERR-G11-ACCOUNT-VERIFY)::ERR-G11-ACCOUNT-VERIFY" \
  "FnF settlement exercised::fnf_settlements|FnF|full.and.final"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09D met' || echo 'RED - PH-09D not complete') =="
exit "$fail"
