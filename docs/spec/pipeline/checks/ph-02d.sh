#!/usr/bin/env bash
# PH-02D oracle: authority-resolution test suite coverage + review packet.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
echo "== PH-02D exit-criteria (resolution tests + review packet) =="
need_file docs/tests/authority-resolution-tests.md 800
need_file docs/spec/ph-02-verdict.md 200
T="$(cat docs/tests/authority-resolution-tests.md 2>/dev/null | tr '[:upper:]' '[:lower:]')"
sc="reporting_chain::reporting.?chain|l1|l2|skip.?level position_as_of::as.?of|effective.?date|point.?in.?time org_unit_head::org.?unit.?head|orgunit|org-unit delegation::delegat acting_charge::acting committee_quorum::quorum committee_recusal::recus no_overlap::overlap|non.?overlapping|exclusion.constraint tenant_scoping::tenant|entity.?scop|isolation|rls sod_self_approval::self.?approv|sod|segregation historical::historic|correction"
for entry in $sc; do
  name="${entry%%::*}"; pat="${entry#*::}"
  echo "$T" | grep -qiE "$pat" && grn "test covers: $name" || red "test suite missing: $name"
done
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-02D met' || echo 'RED — PH-02D not complete') =="; exit $fail
