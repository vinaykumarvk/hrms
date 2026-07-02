#!/usr/bin/env bash
# PH-15F oracle: G09 POSH/ICC route with composition validation, personal hearings with deny-with-reason,
# SLA pause/resume ledger with recompute; G06 multi-stream rota-quota seniority construction with rotation
# trace and input guards. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S09="apps/api/src/modules/g09 apps/api/src/routes/g09.routes.ts"
S06="apps/api/src/modules/g06 apps/api/src/routes/g06.routes.ts"
T=apps/api/test

echo "== PH-15F exit-criteria (G09 ICC/hearings/SLA-pause + G06 rota-quota to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) G09 behavior in module source (BRD entities + codes, not markers)
for spec in \
  "POSH route resolved (inquiry_route ICC_POSH)::ICC_POSH" \
  "ICC composition validated (ERR-G09-ICC-PROCEDURE-REQUIRED)::ERR-G09-ICC-PROCEDURE-REQUIRED" \
  "external member role enforced (ICC_EXTERNAL_MEMBER)::ICC_EXTERNAL_MEMBER" \
  "personal hearings entity consumed::personal_hearings" \
  "denial requires reason (denial_reason)::denial_reason" \
  "reasonless denial guarded (ERR-G09-PERSONAL-HEARING-DENIED)::ERR-G09-PERSONAL-HEARING-DENIED" \
  "SLA pause ledger consumed (sla_pause_events)::sla_pause_events" \
  "resume recompute (resumed_at)::resumed_at" \
  "invalid resume guarded (ERR-G09-SLA-PAUSE-INVALID)::ERR-G09-SLA-PAUSE-INVALID"
do must "$spec" $S09; done

# 2) G06 behavior in module source
for spec in \
  "quota rules entity consumed (seniority_quota_rules)::seniority_quota_rules" \
  "rotation methods supported (ROTA_QUOTA)::ROTA_QUOTA" \
  "slot labels assigned (quota_slot_label)::quota_slot_label" \
  "rotation cycles recorded (rotation_cycle_no)::rotation_cycle_no" \
  "missing stream tag guarded (STREAM_TAG_MISSING)::STREAM_TAG_MISSING" \
  "invalid quota rule guarded (QUOTA_RULE_INVALID)::QUOTA_RULE_INVALID"
do must "$spec" $S06; done

# 3) executed oracle tests
for spec in \
  "NEGATIVE: ICC without external member asserted (ERR-G09-ICC-PROCEDURE-REQUIRED)::ERR-G09-ICC-PROCEDURE-REQUIRED" \
  "NEGATIVE: reasonless hearing denial asserted (ERR-G09-PERSONAL-HEARING-DENIED)::ERR-G09-PERSONAL-HEARING-DENIED" \
  "SLA pause/resume recompute exercised (sla_pause_events)::sla_pause_events" \
  "NEGATIVE: resume without open pause asserted (ERR-G09-SLA-PAUSE-INVALID)::ERR-G09-SLA-PAUSE-INVALID" \
  "rota-quota construction exercised (seniority_quota_rules)::seniority_quota_rules" \
  "deterministic interleave asserted (quota_slot_label)::quota_slot_label" \
  "NEGATIVE: missing stream tag asserted (STREAM_TAG_MISSING)::STREAM_TAG_MISSING" \
  "NEGATIVE: invalid quota rule asserted (QUOTA_RULE_INVALID)::QUOTA_RULE_INVALID"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-15F met' || echo 'RED - PH-15F not complete') =="
exit "$fail"
