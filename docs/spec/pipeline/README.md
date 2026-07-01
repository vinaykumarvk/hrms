# HRMS pipeline runner

An **external driver** that sequences the AI Dev Pipeline phases — the safe alternative to a single master
`/goal` looping in one session (see the council verdict:
`doc/evaluations/autonomous-master-goal-loop-council-report-20260701.md`).

**What it does:** runs **one phase per fresh agent session**, then verifies that phase's `exit_criteria`
**outside the model**. `gate:auto` advances on GREEN; `gate:human` **parks** for an approval token. It's
**resumable** (done phases are skipped, never re-run) and **hard-stops on RED** (no retry-loop → no runaway).

## Files
- `phases.yaml` — the manifest: `{id, name, prompt, exit_criteria (shell → 0/1), gate: auto|human, depends_on}`.
- `run.sh` — the driver.
- `prompts/PH-00A.md … PH-00E.md` — the `/goal` prompt fed to each phase's session.
- `checks/ph-00a.sh` — PH-00A's exit-criteria (the independent oracle). B–E: add `checks/ph-00b.sh…` as built.
- `.state/` — per-phase status markers (resume). `approvals/` — human gate tokens. `logs/` — session logs. (all gitignored)

## Usage
```bash
cd /Users/n15318/hrms/docs/spec/pipeline

./run.sh                 # DRY-RUN: show state + preview the next phase's check (does nothing)
./run.sh --status        # print every phase's state
git checkout -b pipeline-run   # sandbox branch (driver refuses --execute on main/master)
./run.sh --execute       # run for real, one phase at a time

# at a human gate the driver parks and prints:
touch approvals/PH-00A.approved   # after you review the evidence
./run.sh --execute                # resumes, advances past the gate

./run.sh --from PH-00C   # resume/force-start at a phase
./run.sh --reset PH-00A  # clear a state marker (files untouched)
```

## Safety (the harness the council said was missing)
- **Sandbox branch:** the driver refuses `--execute` on `main`/`master`. Each phase logs a git snapshot with a
  `git reset --hard <rev>` rollback line so a bad phase is reversible.
- **Blast-radius limits:** one phase per session; per-phase wall-clock timeout (`defaults.phase_timeout_seconds`);
  hard-stop on the first RED; human gates for anything not machine-verifiable — including the **DB-change approval**.
- **Permissions:** `CLAUDE_FLAGS` defaults to `--permission-mode acceptEdits`. Fully-unattended tool use (bash/network)
  may require a stronger flag — **only add that consciously, on a throwaway branch, with least-privilege creds and a
  spend cap.** Do not point this at production credentials.
- **Verify the manifest content first:** a wrong prompt executes faithfully to a wrong result. Read `prompts/*` and
  the `exit_criteria` before `--execute`.
- **If a phase's success can't be written as a shell command, keep `exit_criteria: "true"` + `gate: human` (trivially green -> parks)** — the
  driver will always park for human verification (that is the correct, honest default).

## Env overrides
`CLAUDE_CMD` (default `claude`) · `CLAUDE_FLAGS` (default `--permission-mode acceptEdits`) · `CLAUDE_MODEL` ·
`NOTIFY_CMD` (invoked on park/red with a message arg — wire to Slack/email for pings).

## Status now
Only **PH-00A** has a real machine check (`checks/ph-00a.sh`); it currently reports RED because the remaining
PH-00A deliverables (inventory yaml, provenance map, golden baseline, verdict, manifest) aren't written yet — which
is correct: the gate stays shut until they exist. PH-00B–E are `gate: human` stubs until their checks are authored.
