# BRD Coverage — hr_admin G04 Leave-SR Integration Capabilities

## Scope

Per the `hr_admin` role-capability audit's 2 named G04 capabilities. No new web UI was built.

| Capability (user's naming) | Runtime | Status |
|---|---|---|
| `g04.relay.monitor` | `g04.relay.read` (`LeaveSrRelayService.reconcile()`) | Pre-existing, tested |
| `g04.dlq.triage_replay` (needs `g04_dlq_ops` flag) | `g04.relay.replay`/`g04.relay.discard`/`g04.relay.reconcile` | Flag-enforcement gap fixed on all 3 write actions |

## Findings

`replayDeadLetter`, `discardDeadLetter`, and `runReconciliation` (statutory reconciliation trigger
— matches "trigger replay/backfill/reconciliation" in the user's description) each checked only
their individual permission string (`g04.relay.replay`/`.discard`/`.reconcile`) — the `g04_dlq_ops`
capability flag named in the audit was never checked on any of the three. Fixed all three with the
established capability-flag-as-role-string convention. `reconcile()` (the read-only dashboard
summary, matching `g04.relay.monitor`) was correctly left unchanged — it's a read, not a DLQ
operation.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/hr-admin-g04-leave-sr-integration.test.cjs` — 3/3 pass.
- `node --test apps/api/test/*.test.cjs` — full backend suite 694/695 (1 pre-existing unrelated
  skip) — including `ph07-g04-relay.test.cjs` (wildcard actors, unaffected).

## Verdict

**GAPS-FOUND → remediated.** Three real capability-flag enforcement gaps found and fixed on the
DLQ-ops write actions.
