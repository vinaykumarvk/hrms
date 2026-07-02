#!/usr/bin/env bash
# PH-06A oracle: persistence substrate — Postgres-backed repositories for G03 + G05 owned entities.
# REAL-outcome oracle: pg client wired and consumed, repository layer imported by the services,
# migration DDL for the owned tables under apps/api, the in-memory arrays for those entities GONE,
# green typecheck + full API suite, and a repo/schema integration test that genuinely executes
# (skip-only = RED) against a throwaway initdb/pg_ctl cluster. No plan-file or marker assertions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
echo "== PH-06A exit-criteria (G03/G05 Postgres persistence substrate) =="

[ -d node_modules ] || red "node_modules absent — typecheck/test oracle cannot run (npm install required)"

# 1) pg client is a real, consumed dependency
grep -qE '"pg"[[:space:]]*:' package.json && grn "pg declared in package.json" || red "pg not declared in package.json"
grep -rqE 'from "pg"|require\("pg"\)' apps/api/src 2>/dev/null && grn "pg client imported in apps/api/src" || red "pg client not imported anywhere in apps/api/src"

# 2) repository layer exists and is consumed by the services
find apps/api/src -not -path '*node_modules*' -iname '*repositor*.ts' 2>/dev/null | grep -qi 'leave' && grn "G03 leave repository file present" || red "no G03 leave repository file under apps/api/src"
find apps/api/src -not -path '*node_modules*' -iname '*repositor*.ts' 2>/dev/null | grep -qi 'transfer' && grn "G05 transfer repository file present" || red "no G05 transfer repository file under apps/api/src"
grep -qiE 'repositor' apps/api/src/modules/g03/leaveService.ts 2>/dev/null && grn "leaveService consumes a repository" || red "leaveService.ts does not reference a repository"
grep -qiE 'repositor' apps/api/src/modules/g05/transferService.ts 2>/dev/null && grn "transferService consumes a repository" || red "transferService.ts does not reference a repository"

# 3) migration DDL under apps/api covers every owned table (frozen data-model names)
sqlhit(){ find apps/api -path '*node_modules*' -prune -o -iname '*.sql' -print0 2>/dev/null | xargs -0 grep -liE "create table (if not exists )?[a-z0-9_]*$1" 2>/dev/null | grep -q .; }
for t in leave_types leave_accrual_policies leave_ledger leave_reservations transfer_requests transfer_orders clearance_checklists clearance_items; do
  sqlhit "$t" && grn "migration DDL present: $t" || red "no migration DDL under apps/api for owned table: $t"
done

# 4) fail-closed negatives: owned entities may no longer live in bare in-memory service arrays
grep -qF 'private readonly applications: LeaveApplication[] = []' apps/api/src/modules/g03/leaveService.ts 2>/dev/null \
  && red "NEGATIVE: g03 leave applications still a bare in-memory array" || grn "negative ok: g03 applications array removed"
grep -qF 'private readonly ledger: LeaveLedgerEntry[] = []' apps/api/src/modules/g03/leaveService.ts 2>/dev/null \
  && red "NEGATIVE: g03 leave ledger still a bare in-memory array" || grn "negative ok: g03 ledger array removed"
grep -qF 'private readonly balances: LeaveBalance[] = []' apps/api/src/modules/g03/leaveService.ts 2>/dev/null \
  && red "NEGATIVE: g03 leave balances still a bare in-memory array" || grn "negative ok: g03 balances array removed"
grep -qF 'private readonly orders: TransferOrder[] = []' apps/api/src/modules/g05/transferService.ts 2>/dev/null \
  && red "NEGATIVE: g05 transfer orders still a bare in-memory array" || grn "negative ok: g05 orders array removed"

# 5) fail-closed negative: parameterised queries only (no ${} interpolation into SQL)
if find apps/api/src -name '*.ts' -not -path '*node_modules*' -print0 2>/dev/null | xargs -0 grep -nE '(SELECT |INSERT INTO |UPDATE |DELETE FROM )[^;]*\$\{' 2>/dev/null | grep -q .; then
  red "NEGATIVE: SQL built with \${} string interpolation found in apps/api/src (parameterised queries only)"
else grn "negative ok: no SQL string interpolation in apps/api/src"; fi

# 6) toolchain oracles — RED on failure
npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "npm run typecheck FAILED"
npm test --silent >/dev/null 2>&1 && grn "npm test green (full API suite)" || red "npm test FAILED"

# 7) repo/schema integration test against a throwaway postgres cluster (skip-only run = RED)
PTEST=apps/api/test/ph06-persistence.test.cjs
if [ ! -f "$PTEST" ]; then
  red "missing repo/schema integration test: $PTEST"
elif ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
  red "initdb/pg_ctl unavailable — persistence integration oracle cannot run (fail-closed)"
else
  TMP="$(mktemp -d)"; PORT=55476
  initdb -D "$TMP/d" -U postgres --no-locale --encoding=UTF8 >/dev/null 2>&1
  pg_ctl -D "$TMP/d" -o "-k $TMP -p $PORT -c listen_addresses=127.0.0.1" -w start >/dev/null 2>&1
  createdb -h 127.0.0.1 -p "$PORT" -U postgres hrms_ph06 >/dev/null 2>&1
  if DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/hrms_ph06" node --test "$PTEST" >"$TMP/out" 2>&1; then
    pass="$(awk '/^# pass /{print $3; exit}' "$TMP/out")"; skipped="$(awk '/^# skipped /{print $3; exit}' "$TMP/out")"
    if [ "${pass:-0}" -ge 3 ] 2>/dev/null && [ "${skipped:-1}" = "0" ]; then
      grn "persistence integration test GREEN on throwaway postgres (pass=$pass skipped=0)"
    else
      red "persistence test did not genuinely execute (pass=${pass:-0} skipped=${skipped:-?}) — skip-only is RED"
    fi
  else
    red "persistence integration test FAILED against throwaway postgres"; tail -5 "$TMP/out" | sed 's/^/       /'
  fi
  pg_ctl -D "$TMP/d" -w stop >/dev/null 2>&1; rm -rf "$TMP"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN — PH-06A met' || echo 'RED — PH-06A not complete') =="
exit "$fail"
