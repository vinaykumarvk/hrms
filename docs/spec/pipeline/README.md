# HRMS pipeline runner

An **external driver** that sequences the AI Dev Pipeline phases — the safe alternative to a single master
`/goal` looping in one session (see the council verdict:
`doc/evaluations/autonomous-master-goal-loop-council-report-20260701.md`).

**What it does:** runs **one phase per fresh agent session**, then verifies that phase's `exit_criteria`
**outside the model**. The default is now an **agentic gate**: `gate:auto` advances on GREEN. `gate:human`
is reserved for critical decisions and **parks** for an approval token. It's
**resumable** (done phases are skipped, never re-run) and **hard-stops on RED** (no retry-loop → no runaway).

## Files
- `phases.yaml` — the manifest: `{id, name, prompt, exit_criteria (shell → 0/1), gate: auto|human, depends_on}`.
- `run.sh` — the driver.
- `prompts/PH-00A.md … PH-04D.md` — the `/goal` prompt fed to each phase's session.
- `checks/ph-00a.sh` … `checks/ph-04d.sh` — independent oracles for PH-00A through PH-04D.
- `.state/` — per-phase status markers (resume). `approvals/` — human gate tokens. `logs/` — session logs. (all gitignored)

## Usage
```bash
cd /Users/n15318/hrms/docs/spec/pipeline

./run.sh                 # DRY-RUN: show state + preview the next phase's check (does nothing)
./run.sh --status        # print every phase's state
git checkout -b pipeline-run   # sandbox branch (driver refuses --execute on main/master)
./run.sh --execute       # run for real, one phase at a time

# at the rare human gate the driver parks and prints:
touch approvals/PH-00A.approved   # after you review the evidence
./run.sh --execute                # resumes, advances past the gate

./run.sh --from PH-00C   # resume/force-start at a phase
./run.sh --reset PH-00A  # clear a state marker (files untouched)
```

## Safety (the harness the council said was missing)
- **Sandbox branch:** the driver refuses `--execute` on `main`/`master`. Each phase logs a git snapshot. Do not use
  destructive rollback commands while unrelated local work exists; isolate each run in a branch/worktree first.
- **Blast-radius limits:** one phase per session; per-phase wall-clock timeout (`defaults.phase_timeout_seconds`);
  hard-stop on the first RED; agentic gates auto-advance only after executable checks pass.
- **Permissions:** `CLAUDE_FLAGS` defaults to `--permission-mode acceptEdits`. Fully-unattended tool use (bash/network)
  may require a stronger flag — **only add that consciously, on a throwaway branch, with least-privilege creds and a
  spend cap.** Do not point this at production credentials.
- **Verify the manifest content first:** a wrong prompt executes faithfully to a wrong result. Read `prompts/*` and
  the `exit_criteria` before `--execute`.
- **If a phase's success can't be written as a shell command, keep `gate: human`.** Markdown evidence can support
  review, but it must not be treated as an auto-advance proof.
- **Human gates remain for critical decisions:** architecture strategy changes; copying, distribution, or productization
  of code with unresolved legal/provenance/IP risk; destructive data operations; material security/auth/RBAC policy
  changes; production/UAT/go-live/cutover approval; prose-only gates; or explicit risk acceptance after repeated RED
  gates.

## Env overrides
`CLAUDE_CMD` (default `claude`) · `CLAUDE_FLAGS` (default `--permission-mode acceptEdits`) · `CLAUDE_MODEL` ·
`NOTIFY_CMD` (invoked on park/red with a message arg — wire to Slack/email for pings).

The current driver is Claude-CLI oriented. If running the phases with another agent, set `CLAUDE_CMD`/`CLAUDE_FLAGS`
to the equivalent command or use a dedicated driver variant.

## Status now
PH-00A through PH-03 have real machine checks and are GREEN. The earlier PH-00 human approvals are recorded in the
phase evidence; future reruns use the agentic gate unless a critical-decision trigger fires.

PH-04 is wired as PH-04A..PH-04D and is **planned, not executed**. PH-04A/B/C use agentic gates with real
oracles. PH-04D parks after GREEN for human API-freeze approval before PH-05 UI work.
PH-05 is split into PH-05A..E: web scaffold/API client, shell/workspaces, workflow operations,
foundation record views, and the UI conformance packet. PH-05E parks after GREEN for human
UI/demo freeze approval before PH-06 vertical slices.
