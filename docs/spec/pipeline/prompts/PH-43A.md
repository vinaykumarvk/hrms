# PH-43A — Raise contract coverage: G14 analytics-engine route exposure

## Objective
Continue the coverage workstream into G14 (22.2%): expose analytics-engine reads (KPI series, datamarts,
scope-policies), KPI target-setting, cohort drill, and predictive attrition-score reads as kernel routes over
already-tested backing; ratchet the floor.

## Context
- Backing (`apps/api/src/modules/g14/`): `analyticsEngineService.kpiSeries/listDatamarts/setKpiTarget/
  drillCohort/listScopePolicies`, `predictiveAnalyticsService.listScores`.
- Coverage gate: `tools/contract-coverage.mjs` + `docs/reviews/contract-coverage-20260703.md` + `ph-37a.sh`.

## Constraints
- **No skeleton routes.** Every route wires a real, tested method and is exercised via kernel dispatch.
- Preserve guards: `setKpiTarget` requires an ACTIVE KPI; `kpiSeries` cross-version aggregation needs
  acknowledgement (ERR-G14-XVER-AGG); `drillCohort` enforces the min-cell suppression policy.
- `kpiSeries.periodKeys` arrives comma-separated in the query; `drillCohort` needs dimension+key (400 if absent).
- Raise the ratchet floor (report + `ph37a` test + `ph-37a.sh`) 430/32.5% → 436/33%.

## Evidence required
- 6 routes in `g14.routes.ts`; `apps/api/test/ph43a-*.test.cjs` covering set-target + series (active KPI set
  up via services), the read endpoints, and the drill-cohort validation guard.
- `bash docs/spec/pipeline/checks/ph-43a.sh` GREEN and `bash docs/spec/pipeline/checks/ph-37a.sh` GREEN at
  the raised floor; typecheck + full suite green.

## Escalate when
- A candidate method is a stub, or a guard's setup is too heavy to exercise cleanly (test the guard path and
  note the happy path is covered by the engine's own tests).
