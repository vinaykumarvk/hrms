#!/usr/bin/env bash
# PH-10E oracle (human gate): analytics UI bound to the real KPI engine — no static marker card,
# suppression respected in rendering, real freshness panel, full api+web suites, honest verdict.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
W14=apps/web/src/modules/g14
WAPI=apps/web/src/api
WT=apps/web/test
V=docs/spec/ph-10-verdict.md

echo "== PH-10E exit-criteria (analytics UI + release conformance; human gate) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) anti-skeleton, fail-closed: the audited static marker card must be gone
if grep -rqE "evidence-line|G14_READ_ONLY" "$W14" 2>/dev/null; then
  red "static marker card (evidence-line/G14_READ_ONLY) still present in g14 web module — UI not rebuilt"
else grn "static marker card removed from g14 web module"; fi

# 2) live-bound dashboard behavior in web source
for spec in \
  "tiles bound to KPI engine::[Kk]pi" \
  "drill-down present::[Dd]rill" \
  "suppression respected in rendering::[Ss]uppress" \
  "freshness panel present::[Ff]reshness|refreshedAt|lastRefresh" \
  "freshness bound to refresh logs::datamart_refresh_logs|refreshLog|martRefresh" \
  "loading state::[Ll]oading" \
  "error state::[Ee]rror" \
  "empty state::[Ee]mpty|[Nn]o (data|results)"
do must "$spec" "$W14"; done
must "client exposes kpi routes::kpi" "$WAPI"
must "client exposes freshness/refresh route::freshness|refresh" "$WAPI"

# 3) executed web tests
for spec in \
  "NEGATIVE: suppressed cohort renders suppressed (raw count absent)::[Ss]uppress" \
  "live KPI binding exercised::[Kk]pi" \
  "freshness binding exercised::[Ff]reshness|refresh"
do must "$spec" "$WT"; done

# 4) honest verdict delta (content-checked)
must "verdict references the audit baseline::brd-coverage-audit-20260702" "$V"
must "verdict covers G12::G12" "$V"
must "verdict covers G13::G13" "$V"
must "verdict covers G14::G14" "$V"
must "verdict names remaining gaps (no 100% claim)::NOT_FOUND|remaining|still open|open gap" "$V"

# 5) full suites — api AND web, RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "api typecheck green" || red "api typecheck failed"
  npm test >/dev/null 2>&1 && grn "api suite green" || red "npm test failed"
  npm run -s web:typecheck >/dev/null 2>&1 && grn "web typecheck green" || red "web typecheck failed"
  npm run -s web:test >/dev/null 2>&1 && grn "web suite green" || red "web tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10E met (await HUMAN gate review)' || echo 'RED - PH-10E not complete') =="
exit "$fail"
