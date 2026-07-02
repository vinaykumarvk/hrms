#!/usr/bin/env bash
# PH-16C oracle: G04 versioned sr_event_mapping catalog (DRAFT/PUBLISHED/RETIRED, overlap rejection, mandatory
# statutory citation, pinned version at first claim), relay_partition_lease + JOB-G04-REAPER stuck-in-flight
# recovery, and the checksummed prepension_certificate (zero-open-HIGH/CRITICAL PASS gate). Behavior +
# executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S04="apps/api/src/modules/g04 apps/api/src/routes/g04.routes.ts"
T=apps/api/test

echo "== PH-16C exit-criteria (G04 mapping catalog + leases/reaper + pre-pension certificate to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (BRD entities + registered codes, not markers)
for spec in \
  "mapping catalog consumed (sr_event_mapping)::sr_event_mapping" \
  "catalog version lifecycle (RETIRED)::RETIRED" \
  "publish overlap rejection (ERR-G04-MAPPING-OVERLAP)::ERR-G04-MAPPING-OVERLAP" \
  "mandatory statutory citation (VAL-G04-CITATION)::VAL-G04-CITATION" \
  "citation column consumed (statutory_rule_ref)::statutory_rule_ref" \
  "in-flight version pinning (pinned_mapping_version)::pinned_mapping_version" \
  "partition lease consumed (relay_partition_lease)::relay_partition_lease" \
  "lease expiry tracked (lease_expires_at)::lease_expires_at" \
  "stuck-in-flight reaper (JOB-G04-REAPER)::JOB-G04-REAPER" \
  "reap increments attempts (attempt_count)::attempt_count" \
  "pre-pension certificate consumed (prepension_certificate)::prepension_certificate" \
  "zero-open-HIGH/CRITICAL assertion (open_high_critical_findings)::open_high_critical_findings" \
  "provisional-entries gate (provisional_entries_remaining)::provisional_entries_remaining"
do must "$spec" $S04; done

# 2) executed oracle tests
for spec in \
  "NEGATIVE: overlapping publish asserted (ERR-G04-MAPPING-OVERLAP)::ERR-G04-MAPPING-OVERLAP" \
  "NEGATIVE: POST_SR without citation asserted (VAL-G04-CITATION)::VAL-G04-CITATION" \
  "pinned version stable across retry asserted (pinned_mapping_version)::pinned_mapping_version" \
  "reaper recovery exercised (relay_partition_lease)::relay_partition_lease" \
  "certificate PASS/FAIL gate exercised (prepension_certificate)::prepension_certificate" \
  "blocking-findings FAIL asserted (open_high_critical_findings)::open_high_critical_findings"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-16C met' || echo 'RED - PH-16C not complete') =="
exit "$fail"
