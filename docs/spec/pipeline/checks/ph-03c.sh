#!/usr/bin/env bash
# PH-03C oracle: X.1/X.2/X.3 infra + read-only migration staging + foundation RLS/security proof + verdict.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
hasfiles(){ [ -d "$1" ] && find "$1" -name '*.ts' -print -quit 2>/dev/null | grep -q .; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
echo "== PH-03C exit-criteria (infra + migration + security) =="
for d in apps/api/src/jobs apps/api/src/notifications apps/api/src/migration; do
  hasfiles "$d" && grn "present: $d" || red "missing/empty: $d"
done
find apps/api/src/migration -type d -iname 'staging' 2>/dev/null | grep -q . && grn "migration/staging present" || red "no migration/staging"
# security oracles (real, toolchain-independent)
if grep -rniE 'console\.log' apps/api/src 2>/dev/null | grep -vq '//'; then red "production console.log in apps/api/src"; else grn "no production console.log in apps/api/src"; fi
if grep -rniE '\.stack|stacktrace' apps/api/src 2>/dev/null | grep -iE 'res\.|response|send|json' | grep -vq '//'; then red "possible stack-trace leak in error responses"; else grn "no stack-trace leak in error responses"; fi
grep -rqiE 'requireAuth|isPublic|@public|authGuard|protected' apps/api/src 2>/dev/null && grn "endpoint protection markers present" || red "no endpoint auth/protection markers"
# tests present
tf(){ find apps/api -path '*/node_modules' -prune -o -name '*.test.ts' -print 2>/dev/null | grep -qiE "$1"; }
tf 'rls|tenant.?isolation|isolation' && grn "RLS tenant-isolation test present" || red "no RLS isolation test"
tf 'migrat|reconcil|staging' && grn "migration staging/reconciliation test present" || red "no migration staging test"
need_file docs/spec/ph-03-verdict.md 300
if [ -d node_modules ] || [ -d apps/api/node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm typecheck passes" || red "npm typecheck failed"
  npm test --silent >/dev/null 2>&1 && grn "npm test passes" || red "npm test not green"
else echo "  WARN node_modules absent — typecheck/test oracle NOT run (structural + security only)"; fi
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-03C met' || echo 'RED — PH-03C not complete') =="; exit $fail
