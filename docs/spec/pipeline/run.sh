#!/usr/bin/env bash
###############################################################################
# HRMS pipeline driver — the EXTERNAL orchestrator prescribed by the council.
#
#   - Runs ONE phase per FRESH agent session (context never spans phases).
#   - Verifies each phase's exit_criteria OUTSIDE the model (independent oracle).
#   - gate:auto  -> advance automatically on GREEN.
#   - gate:human -> after GREEN, PARK and wait for approvals/<id>.approved.
#   - Resumable: phases with a `.done` marker are skipped; never restarts.
#   - Hard-stop on RED (no retry-loop → no budget runaway).
#   - Safe by default: prints a plan and previews checks; does NOTHING to code
#     unless you pass --execute (and you are on a non-main sandbox branch).
#
# Usage:
#   ./run.sh                 # dry-run: show state + preview the next phase's check
#   ./run.sh --status        # print the state of every phase and exit
#   ./run.sh --execute       # actually run phases (requires a non-main branch)
#   ./run.sh --from PH-00B    # resume/force-start at a phase
#   ./run.sh --reset PH-00A   # clear a phase's state marker (does not touch files)
#
# Env overrides:
#   CLAUDE_CMD    (default: claude)          the agent CLI
#   CLAUDE_FLAGS  (default: --permission-mode acceptEdits)   headless perms; see README/SAFETY
#   CLAUDE_MODEL  (optional)                  passed as --model
#   NOTIFY_CMD    (optional)                  run on park/red, e.g. a curl to Slack; receives a message arg
###############################################################################
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || echo "$HERE/../../..")"
cd "$ROOT"
MANIFEST="docs/spec/pipeline/phases.yaml"
STATE="docs/spec/pipeline/.state"
APPROVALS="docs/spec/pipeline/approvals"
LOGS="docs/spec/pipeline/logs"
mkdir -p "$STATE" "$APPROVALS" "$LOGS"

CLAUDE_CMD="${CLAUDE_CMD:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---permission-mode acceptEdits}"
[ -n "${CLAUDE_MODEL:-}" ] && CLAUDE_FLAGS="$CLAUDE_FLAGS --model $CLAUDE_MODEL"
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"

EXECUTE=0; STATUS=0; FROM=""; RESET=""
while [ $# -gt 0 ]; do case "$1" in
  --execute) EXECUTE=1;;
  --status)  STATUS=1;;
  --from)    FROM="$2"; shift;;
  --reset)   RESET="$2"; shift;;
  -h|--help) sed -n '2,40p' "$0"; exit 0;;
  *) echo "unknown arg: $1"; exit 2;;
esac; shift; done

notify(){ echo ">> $*"; [ -n "${NOTIFY_CMD:-}" ] && "$NOTIFY_CMD" "$*" || true; }
state_of(){ cat "$STATE/$1.status" 2>/dev/null || echo pending; }
set_state(){ echo "$2" > "$STATE/$1.status"; }
approved(){ [ -f "$APPROVALS/$1.approved" ]; }

# --reset
if [ -n "$RESET" ]; then rm -f "$STATE/$RESET.status"; echo "reset $RESET"; exit 0; fi

# Read the manifest into tab-delimited lines: id \t name \t prompt \t exit \t gate \t deps
read_phases(){
python3 - "$MANIFEST" <<'PY'
import sys,yaml
m=yaml.safe_load(open(sys.argv[1]))
for p in m.get("phases",[]):
    deps=",".join(p.get("depends_on") or [])
    print("\t".join([p["id"],p.get("name",""),p["prompt"],str(p.get("exit_criteria","false")),p.get("gate","human"),deps]))
PY
}
timeout_secs(){ python3 - "$MANIFEST" <<'PY'
import sys,yaml;print(yaml.safe_load(open(sys.argv[1])).get("defaults",{}).get("phase_timeout_seconds",3600))
PY
}
PHASE_TIMEOUT="$(timeout_secs)"

# --status
if [ "$STATUS" = 1 ]; then
  echo "== pipeline state =="
  while IFS=$'\t' read -r id name prompt ex gate deps; do
    printf "  %-8s %-12s %s\n" "$id" "[$(state_of "$id")]" "$name"
  done < <(read_phases)
  exit 0
fi

# Safety preflight for execute mode
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
if [ "$EXECUTE" = 1 ]; then
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    echo "REFUSING to --execute on '$branch'. Create a sandbox branch first:  git checkout -b pipeline-run"
    exit 3
  fi
  echo "== EXECUTE mode on branch '$branch' =="
  echo "   agent: $CLAUDE_CMD $CLAUDE_FLAGS   | per-phase timeout: ${PHASE_TIMEOUT}s | timeout bin: ${TIMEOUT_BIN:-<none>}"
  echo "   SAFETY: one phase per fresh session, verified externally, hard-stop on red, human gates park."
else
  echo "== DRY-RUN (no changes). Pass --execute on a sandbox branch to run for real. Branch: '$branch' =="
fi

started=0
while IFS=$'\t' read -r id name prompt exit_cmd gate deps; do
  # honor --from
  if [ -n "$FROM" ] && [ "$started" = 0 ]; then
    [ "$id" = "$FROM" ] && started=1 || { echo "  skip $id (before --from $FROM)"; continue; }
  fi
  st="$(state_of "$id")"

  if [ "$st" = done ]; then echo "  ✓ $id done — skip"; continue; fi

  # human-gate resume: GREEN previously, waiting for approval token
  if [ "$st" = awaiting-approval ]; then
    if approved "$id"; then set_state "$id" done; echo "  ✓ $id approved → done"; continue; fi
    notify "PARKED at human gate: $id ($name). Approve with:  touch $APPROVALS/$id.approved  then re-run."
    exit 0
  fi

  # dependency check
  for d in $(echo "$deps" | tr ',' ' '); do
    [ -n "$d" ] && [ "$(state_of "$d")" != done ] && { echo "  ⏸ $id blocked on $d (state: $(state_of "$d"))"; exit 0; }
  done

  echo ""
  echo "── $id : $name ──"
  echo "   prompt: $prompt"
  echo "   verify: $exit_cmd"
  echo "   gate:   $gate"

  if [ "$EXECUTE" = 0 ]; then
    echo "   [dry-run] would run a fresh agent session on the prompt above, then verify."
    echo "   [dry-run] previewing exit_criteria now (read-only):"
    ( eval "$exit_cmd" ) 2>&1 | sed 's/^/     /' || true
    echo "   → stop (dry-run shows the NEXT actionable phase only)."
    exit 0
  fi

  # ---- EXECUTE ----
  set_state "$id" running
  snap="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  log="$LOGS/${id}-$(date +%Y%m%d-%H%M%S 2>/dev/null || echo run).log"
  echo "   git snapshot before phase: $snap   (rollback: git reset --hard $snap)"
  echo "   running fresh agent session → $log"
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$PHASE_TIMEOUT" $CLAUDE_CMD -p "$(cat "$prompt")" $CLAUDE_FLAGS 2>&1 | tee "$log"
  else
    echo "   (no timeout binary; running without wall-clock cap — install coreutils for 'gtimeout')"
    $CLAUDE_CMD -p "$(cat "$prompt")" $CLAUDE_FLAGS 2>&1 | tee "$log"
  fi

  echo "   verifying exit_criteria (external oracle)…"
  if eval "$exit_cmd"; then
    if [ "$gate" = auto ]; then
      set_state "$id" done; echo "   ✓ GREEN + gate:auto → advancing"; continue
    else
      set_state "$id" awaiting-approval
      notify "GREEN — $id ($name) passed checks and is PARKED at a human gate. Review, then:  touch $APPROVALS/$id.approved  and re-run."
      exit 0
    fi
  else
    set_state "$id" failed
    notify "RED — $id ($name) failed exit_criteria. HARD STOP (no retry). Log: $log. Inspect, fix, then re-run (or --reset $id)."
    exit 1
  fi
done < <(read_phases)

echo ""
echo "🎉 all phases done."
