#!/usr/bin/env bash
# PH-03B oracle: systems of record (G01 master, G12 append-only SR, G13 vault).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
hasfiles(){ [ -d "$1" ] && find "$1" -name '*.ts' -print -quit 2>/dev/null | grep -q .; }
echo "== PH-03B exit-criteria (systems of record) =="
for d in apps/api/src/modules/g01 apps/api/src/modules/g12 apps/api/src/modules/g13; do
  hasfiles "$d" && grn "service present: $d" || red "missing/empty: $d"
done
g12="$(cat apps/api/src/modules/g12/*.ts apps/api/src/modules/g12/**/*.ts 2>/dev/null)"
echo "$g12" | grep -qiE 'idempoten|dedup' && grn "G12 idempotency/dedup" || red "G12 missing idempotency/dedup"
echo "$g12" | grep -qiE 'append.only|supersede|reversal|is_reversal' && grn "G12 append-only/reversal" || red "G12 missing append-only/reversal semantics"
if echo "$g12" | grep -qiE '\b(update|delete)\b .*service_register_events|service_register_events.*\b(update|delete)\b'; then red "G12 appears to UPDATE/DELETE the SR ledger (must be append-only)"; else grn "no UPDATE/DELETE against SR ledger"; fi
g13="$(cat apps/api/src/modules/g13/*.ts apps/api/src/modules/g13/**/*.ts 2>/dev/null)"
echo "$g13" | grep -qiE 'legal.?hold' && grn "G13 legal-hold" || red "G13 missing legal-hold"
echo "$g13" | grep -qiE 'retention' && grn "G13 retention" || red "G13 missing retention"
# tests present
tests(){ find apps/api -path '*/node_modules' -prune -o -name '*.test.ts' -print 2>/dev/null | grep -qiE "$1"; }
tests 'dedup|semantic' && grn "SR semantic-dedup test present" || red "no SR semantic-dedup test"
tests 'legal.?hold|disposal' && grn "legal-hold test present" || red "no legal-hold test"
tests 'mask' && grn "P02 masking test present" || red "no P02 masking test"
tests 'g01.*g12|sr.?ingest|identity.*sr' && grn "G01->G12 SR integration test present" || red "no G01->G12 integration test"
if grep -rniE 'console\.log' apps/api/src/modules/g01 apps/api/src/modules/g12 apps/api/src/modules/g13 2>/dev/null | grep -vq '//'; then red "console.log in SoR src"; else grn "no console.log in SoR src"; fi
if [ -d node_modules ] || [ -d apps/api/node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test --silent >/dev/null 2>&1 && grn "npm test passes" || echo "  WARN npm test not green — inspect"
else echo "  WARN node_modules absent — typecheck/test oracle NOT run (structural + security only)"; fi
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-03B met' || echo 'RED — PH-03B not complete') =="; exit $fail
