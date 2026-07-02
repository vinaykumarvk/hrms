#!/usr/bin/env bash
# PH-16F oracle: G10 loans/advances instalment recovery (closure invariant, foreclosure, insufficient-net
# carryforward), Rule-3 concessional perquisites, balanced gl_journals (POSTED/ACKNOWLEDGED), bank-file
# positive-pay hold (SUSPECTED_PROCESSED); G11 PDA registry (pda_disbursement_model, sandbox gate),
# pen_grievances intake/SLA, pen_audit_objections. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S10="apps/api/src/modules/g10 apps/api/src/routes/g10.routes.ts"
S11="apps/api/src/modules/g11 apps/api/src/routes/g11.routes.ts"
T=apps/api/test

echo "== PH-16F exit-criteria (G10 loans/perquisites/GL/bank-file + G11 PDA/grievances/objections to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) G10 behavior in module source (BRD entities + registered codes, not markers)
for spec in \
  "instalment ledger consumed (loan_repayments)::loan_repayments" \
  "foreclosure supported::foreclos" \
  "insufficient-net guard (ERR-G10-RECOVERY-NET)::ERR-G10-RECOVERY-NET" \
  "shortfall carryforward consumed (deduction_carryforwards)::deduction_carryforwards" \
  "concessional flag consumed (is_concessional)::is_concessional" \
  "Rule-3 perquisite rows (perquisites)::perquisites" \
  "missing reference rate guard (ERR-G10-PERQ-REFRATE)::ERR-G10-PERQ-REFRATE" \
  "GL journal consumed (gl_journals)::gl_journals" \
  "balance invariant fields (total_debit / total_credit)::total_debit" \
  "posting lifecycle (ACKNOWLEDGED)::ACKNOWLEDGED" \
  "ambiguous-ack hold (SUSPECTED_PROCESSED)::SUSPECTED_PROCESSED" \
  "positive-pay confirmation gate::positive[_-]?pay|positivePay" \
  "holds ledger consumed (disbursement_holds)::disbursement_holds"
do must "$spec" $S10; done

# 2) G11 behavior in module source
for spec in \
  "PDA registry consumed (pen_disbursing_authorities)::pen_disbursing_authorities" \
  "disbursement model branch (pda_disbursement_model)::pda_disbursement_model" \
  "model values (PDA_APPLIES_RELIEF)::PDA_APPLIES_RELIEF" \
  "sandbox go-live gate (sandbox_certified)::sandbox_certified" \
  "grievances consumed (pen_grievances)::pen_grievances" \
  "grievance SLA tracked (sla_due_at)::sla_due_at" \
  "audit objections consumed (pen_audit_objections)::pen_audit_objections" \
  "calc trace linkage (calc_trace_ref)::calc_trace_ref" \
  "objection outcome recorded (ACCEPTED_CORRECTED)::ACCEPTED_CORRECTED"
do must "$spec" $S11; done

# 3) executed oracle tests. ERR-G10-RECOVERY-NET is already asserted by the PH-09 payroll recovery tests,
# so the loan-recovery negative must live in this phase's own executed test file (ph16f-*.test.cjs, run by
# npm test) — a repo-wide grep would rubber-stamp it.
for spec in \
  "NEGATIVE: loan insufficient net asserted in ph16f tests (ERR-G10-RECOVERY-NET)::ERR-G10-RECOVERY-NET"
do must "$spec" "$T"/ph16f-*.test.cjs; done
for spec in \
  "loan closure invariant + foreclosure exercised (loan_repayments)::loan_repayments" \
  "concessional Rule-3 perquisite asserted (is_concessional)::is_concessional" \
  "NEGATIVE: unbalanced journal rejected asserted (total_debit)::total_debit" \
  "GL posting lifecycle exercised (gl_journals)::gl_journals" \
  "positive-pay resend block exercised (SUSPECTED_PROCESSED)::SUSPECTED_PROCESSED" \
  "PDA sandbox gate exercised (sandbox_certified)::sandbox_certified" \
  "NEGATIVE: grievance close without resolution asserted (VAL-COMMENT)::VAL-COMMENT" \
  "audit objection outcome exercised (pen_audit_objections)::pen_audit_objections"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-16F met' || echo 'RED - PH-16F not complete') =="
exit "$fail"
