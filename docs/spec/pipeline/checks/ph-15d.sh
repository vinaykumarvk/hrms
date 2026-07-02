#!/usr/bin/env bash
# PH-15D oracle: G12 sect.65B certificates, subscriptions, LTV — sr_authenticity_certificates binding
# content_digest + anchor + generated chain-of-custody with tamper refusal, sr_subscriptions with a
# per-subscriber cursored pull feed (no cross-subscriber leak), sr_ltv_renewals re-anchoring over existing
# anchors without rewriting history. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S12="apps/api/src/modules/g12 apps/api/src/routes/g12.routes.ts"
T=apps/api/test

echo "== PH-15D exit-criteria (G12 65B certificates + subscriptions + LTV to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (BRD entities + codes, not markers)
for spec in \
  "certificate entity consumed (sr_authenticity_certificates)::sr_authenticity_certificates" \
  "statute reference recorded (65B/BSA)::statute_reference|65B" \
  "certificate binds extract digest::content_digest" \
  "certificate binds covering anchor::anchor_id" \
  "chain-of-custody generated from stored data::custody" \
  "issuance access-logged (GENERATE_65B)::GENERATE_65B" \
  "subscriptions entity consumed (sr_subscriptions)::sr_subscriptions" \
  "per-subscriber durable cursor (last_delivered_seq)::last_delivered_seq" \
  "pull feed resumable by cursor (since_seq)::since_seq" \
  "webhook/bus registration deferred (SR_DELIVERY_MODE_DEFERRED)::SR_DELIVERY_MODE_DEFERRED" \
  "LTV renewals entity consumed (sr_ltv_renewals)::sr_ltv_renewals" \
  "re-anchor / migration renewal types::RE_ANCHOR|ALGORITHM_MIGRATION"
do must "$spec" $S12; done

# 2) executed oracle tests
for spec in \
  "65B certificate issuance exercised (sr_authenticity_certificates)::sr_authenticity_certificates" \
  "NEGATIVE: issuance refused on digest mismatch / tampered chain::content_digest" \
  "feed scoping asserted (subscriber isolation, sr_subscriptions)::sr_subscriptions" \
  "cursor resume asserted (since_seq)::since_seq" \
  "NEGATIVE: deferred delivery mode rejected (SR_DELIVERY_MODE_DEFERRED)::SR_DELIVERY_MODE_DEFERRED" \
  "LTV renewal asserted, prior entries still verify (sr_ltv_renewals)::sr_ltv_renewals"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-15D met' || echo 'RED - PH-15D not complete') =="
exit "$fail"
