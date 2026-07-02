# PUDA Workflow Provenance Map (PH-00A)

Pinned source under review: `/Users/n15318/PUDA_workflow_engine` at commit `cadf39739e6f27c17d44767ca61d1a362034ac64`.

No PUDA files were moved, copied, extracted, or edited. The PUDA worktree was dirty before this pass (`10` modified files, `14` untracked files); those changes are treated as existing source context and must be frozen or branched before any extraction.

## Repository Provenance

| Check | Result | Evidence |
|---|---|---|
| Commit pin | Pinned | `git -C /Users/n15318/PUDA_workflow_engine rev-parse HEAD` -> `cadf39739e6f27c17d44767ca61d1a362034ac64` |
| Worktree cleanliness | Dirty | `git -C /Users/n15318/PUDA_workflow_engine status --short` showed 10 modified and 14 untracked files |
| Repository license | UNCLEAR | `find /Users/n15318/PUDA_workflow_engine -maxdepth 2 -iname '*license*'` found only `service-packs/license_to_develop_colony`, not a repository license |
| Package license fields | UNCLEAR | `rg '"license"' ... package.json` returned no package-level license fields |
| Third-party workflow engine | No evidence found | Source scan found PUDA-owned workflow runtime files (`apps/api/src/workflow.ts`, `workflow.route-model.ts`, `work-queues.ts`), not a BPMN/Temporal/Camunda-style engine |

## Asset Provenance Classes

| Asset group | Provenance | Third-party engine? | Reuse disposition | Evidence |
|---|---|---|---|---|
| Workflow runtime core | PUDA application code | No evidence | Reuse behind facade | `apps/api/src/workflow.ts:1158-1266`, `apps/api/src/workflow.route-model.ts:1-10` |
| Queue/routing model | PUDA application code | No evidence | Reuse with HRMS resolver replacement | `apps/api/src/work-queues.ts:34-82`, `apps/api/src/officer-routing-reconciliation.ts:50-80` |
| Fork/join/wait/SLA schema | PUDA migrations | No evidence | Reuse concepts/schema patterns | `apps/api/migrations/046_workflow_fork_join.sql:6-24`, `apps/api/migrations/043_workflow_waits_and_waiting_states.sql:6-40` |
| Config governance | PUDA application code/schema | No evidence | Reuse behind facade | `apps/api/migrations/096_workflow_config_publish_review.sql:1-38`, `apps/api/src/workflow-config-validation.ts:1-72` |
| Officer workflow UI | PUDA frontend code | No evidence | Reference/port selectively | Focused officer test: 2 files, 22 tests passed |
| LAC/LoI/payment/service-pack domain hooks | PUDA domain code | No evidence | Adapter-only/exclude from core | `apps/api/src/workflow.ts:1296-1319`, `apps/api/src/workflow.ts:1926-2025`, `apps/api/src/workflow-action-catalog.ts:60-103` |

## Provenance Gate

Extraction into a reusable cross-application package must not start until the repository-level license/ownership position is clarified. Internal reuse in the same organization can proceed as a facade/wrapper design exercise, but shared distribution or separate productization needs a legal/source approval checkpoint.
