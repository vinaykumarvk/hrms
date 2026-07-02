#!/usr/bin/env bash
# Exit-criteria for PH-00D (persistence, config governance, resolver/hook SPIs).
# GREEN only if workflow-platform packages build/test, durable snapshot schema loads through all 00->14 data-model
# files in a disposable PostgreSQL instance, PH-00D manifest/evidence is present, and PUDA core runtime files remain clean.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

PUDA="/Users/n15318/PUDA_workflow_engine"
WFP="/Users/n15318/workflow-platform"
PIN="cadf39739e6f27c17d44767ca61d1a362034ac64"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-00D exit-criteria =="

need_file "$WFP/packages/workflow-postgres/src/index.ts" 20
need_file "$WFP/packages/workflow-config/src/index.ts" 20
need_file "$WFP/packages/workflow-resolvers/src/index.ts" 20
need_file "$WFP/packages/adapters-hrms/src/index.ts" 20
need_file docs/spec/workflow-platform-governance.md 300
need_file docs/spec/workflow-platform-gap-analysis.yaml 300
need_file docs/spec/ph-00d-verdict.md 200

if [ -d "$WFP" ]; then
  echo "  .. running workflow-platform check"
  if ( cd "$WFP" && npm run check ); then
    grn "workflow-platform typecheck/build/tests passed"
  else
    red "workflow-platform check failed"
  fi

  if rg -n "PUDA|LAC|LOI|letter of intent|Letter of Intent|allottee|lac_" \
    "$WFP/packages/workflow-core/src" "$WFP/packages/workflow-postgres/src" \
    "$WFP/packages/workflow-config/src" "$WFP/packages/workflow-resolvers/src" >/tmp/ph00d-domain-leaks.txt 2>/dev/null; then
    red "domain leakage scan found blocked terms:"
    sed -n '1,40p' /tmp/ph00d-domain-leaks.txt
  else
    grn "domain leakage scan clean for reusable packages"
  fi
fi

if command -v initdb >/dev/null 2>&1 && command -v pg_ctl >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  echo "  .. running disposable PostgreSQL full schema load"
  export LC_ALL=C
  TMPDIR="$(mktemp -d /tmp/hrms-ph00d-schema.XXXXXX)"
  DBDIR="$TMPDIR/db"
  LOG="$TMPDIR/postgres.log"
  PORT="$(python3 - <<'PY'
import socket
s=socket.socket()
s.bind(("127.0.0.1",0))
print(s.getsockname()[1])
s.close()
PY
)"
  if initdb -D "$DBDIR" >/tmp/ph00d-initdb.log 2>&1; then
    if pg_ctl -D "$DBDIR" -o "-p $PORT -k $TMPDIR" -l "$LOG" start >/tmp/ph00d-pg-start.log 2>&1; then
      if createdb -h "$TMPDIR" -p "$PORT" hrms_ph00d >/tmp/ph00d-createdb.log 2>&1; then
        load_ok=1
        : > /tmp/ph00d-schema-load.log
        for f in docs/data-model/[0-9][0-9]-*.sql; do
          if psql -h "$TMPDIR" -p "$PORT" -d hrms_ph00d -v ON_ERROR_STOP=1 -f "$f" >/tmp/ph00d-load-"$(basename "$f")".log 2>&1; then
            echo "loaded $(basename "$f")" >> /tmp/ph00d-schema-load.log
          else
            load_ok=0
            red "schema load failed at $(basename "$f")"
            sed -n '1,80p' /tmp/ph00d-load-"$(basename "$f")".log
            break
          fi
        done
        if [ "$load_ok" = 1 ]; then
          grn "full 00->14 schema load passed"
        fi
      else
        red "createdb failed"
      fi
      pg_ctl -D "$DBDIR" -m fast stop >/tmp/ph00d-pg-stop.log 2>&1 || true
    else
      red "pg_ctl start failed"
      sed -n '1,80p' "$LOG" 2>/dev/null || true
    fi
  else
    red "initdb failed"
    sed -n '1,80p' /tmp/ph00d-initdb.log
  fi
else
  red "PostgreSQL client/server tools not available for full schema load"
fi

if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json contains structural PH-00D phase record" || red "manifest.json missing structural PH-00D phase record"
import json,sys
try:
    m=json.load(open("docs/spec/manifest.json"))
except Exception:
    sys.exit(1)
phase=m.get("phases",{}).get("PH-00D")
if not isinstance(phase, dict):
    sys.exit(1)
required={"status","gate_verdict","artifacts","tests"}
sys.exit(0 if required.issubset(phase.keys()) else 1)
PY
fi

if [ -d "$PUDA/.git" ]; then
  head="$(git -C "$PUDA" rev-parse HEAD 2>/dev/null || true)"
  if [ "$head" = "$PIN" ]; then
    grn "PUDA pinned commit ${PIN:0:12}"
  else
    red "PUDA HEAD is ${head:-unknown}, expected ${PIN:0:12}"
  fi
  if git -C "$PUDA" status --porcelain -- apps/api/src/workflow.ts apps/api/src/tasks.ts 2>/dev/null | grep -q .; then
    red "PUDA core workflow.ts/tasks.ts show local changes"
  else
    grn "PUDA core workflow files unmodified"
  fi
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-00D exit-criteria met' || echo 'RED — PH-00D not complete') =="
exit $fail
