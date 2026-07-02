#!/usr/bin/env bash
# PH-10D oracle: G14 analytics engine — versioned/activated KPI definitions, mart refresh that
# consumes the 24-table SQL DDL (counted, not asserted by marker), k-anonymity suppression with a
# 4-member-cohort negative test, scope-policy maker-checker, bitemporal as-of-knowledge snapshots.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S14="apps/api/src/modules/g14 apps/api/src/routes/g14.routes.ts apps/api/src/jobs"
G14SRC=apps/api/src/modules/g14
DDL=docs/data-model/14-G14-dashboard-analytics.sql
T=apps/api/test

echo "== PH-10D exit-criteria (G14 analytics engine) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) DDL-consumption assertion: count how many of the DDL's CREATE TABLE names the runtime references
if [ -f "$DDL" ]; then
  total=0; consumed=0; missing=""
  for t in $(grep -E '^CREATE TABLE' "$DDL" | sed -E 's/^CREATE TABLE ([a-z0-9_]+).*/\1/'); do
    total=$((total+1))
    if grep -rq "$t" "$G14SRC" 2>/dev/null; then consumed=$((consumed+1)); else missing="$missing $t"; fi
  done
  if [ "$consumed" -ge 8 ]; then grn "runtime consumes $consumed/$total DDL tables (>=8 required)"
  else red "runtime consumes only $consumed/$total DDL tables (>=8 required); unreferenced:$missing"; fi
else red "DDL file missing: $DDL"; fi

# 2) engine behavior in module source
for spec in \
  "governed KPI definitions (kpi_definitions)::kpi_definitions" \
  "KPI versioning (kpi_version)::kpi_version|kpiVersion" \
  "explicit activation step::activat" \
  "cross-version aggregation blocked (ERR-G14-XVER-AGG)::ERR-G14-XVER-AGG" \
  "mart refresh logs (datamart_refresh_logs)::datamart_refresh_logs" \
  "mart refresh job registered (JOB-G14-MART)::JOB-G14-MART" \
  "suppression policy entity (suppression_policies)::suppression_policies" \
  "k threshold (min_cell_size)::min_cell_size|minCellSize" \
  "small cells suppressed (ERR-G14-SMALL-CELL)::ERR-G14-SMALL-CELL" \
  "complementary suppression::complementary|ERR-G14-COMP-SUPPRESS" \
  "scope policy entity (analytics_scope_policies)::analytics_scope_policies" \
  "scope maker-checker (ERR-G14-SCOPE-CHECKER)::ERR-G14-SCOPE-CHECKER" \
  "bitemporal valid_time::valid_time|validTime" \
  "bitemporal knowledge_time::knowledge_time|knowledgeTime" \
  "restatement supersedes (is_superseded)::is_superseded|isSuperseded"
do must "$spec" $S14; done

# 3) executed oracle tests
for spec in \
  "NEGATIVE: 4-member cohort suppressed (ERR-G14-SMALL-CELL)::ERR-G14-SMALL-CELL" \
  "bitemporal as-of-knowledge query asserted::knowledge_time|knowledgeTime" \
  "as-of comparison exercised (asOf)::asOf|as_of" \
  "NEGATIVE: maker==checker scope activation rejected (ERR-G14-SCOPE-CHECKER)::ERR-G14-SCOPE-CHECKER" \
  "mart refresh logged (datamart_refresh_logs)::datamart_refresh_logs"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10D met' || echo 'RED - PH-10D not complete') =="
exit "$fail"
