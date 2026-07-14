# BRD Coverage — hr_admin G05 Transfer/Relieving/Joining Capabilities

## Scope

Per the `hr_admin` role-capability audit's 3 named G05 capabilities. No new web UI was built. Note:
this session already ran a full G05 transfer-request self-service goal earlier (which fixed a HIGH
cross-employee leak in `getServiceRecord`); this task is scoped to the 3 *admin* capabilities named
in the new audit, distinct from that earlier self-service work.

| Capability (user's naming) | Runtime | Status |
|---|---|---|
| `g05.transfer.initiate` | `g05.transfer.initiate` (exact match) | Pre-existing, tested |
| `g05.clearance.grant` (needs `g05_clearance_officer` flag) | `g05.transfer.clearance` (complete) / `g05.transfer.clearance.deem` | Flag-enforcement gap fixed on both |
| `g05.estate.record` (needs `g05_estate_officer` flag) | `g05.quarter.approve`/`.overstay`/`.vacate` | Flag-enforcement gap fixed on the 3 administrative actions |

## Findings

### `g05.clearance.grant` and `g05.estate.record` — capability-flag enforcement gaps, fixed

Both capabilities already had working, tested service methods and routes (confirmed by the initial
survey and this session's earlier G05 work), but neither of the named capability flags
(`g05_clearance_officer`, `g05_estate_officer`) was ever checked — only the individual runtime
permission strings were. Fixed all 5 affected methods
(`completeClearance`/`deemClearance`/`approveQuarterRetention`/`flagQuarterOverstay`/
`recordQuarterVacation`) with the established capability-flag-as-role-string convention.

**Deliberately left unguarded**: `requestQuarterRetention()` (the employee-initiated retention
*request*) was **not** given the `g05_estate_officer` flag check — it's the self-service half of
the flow (an employee/HR-officer-on-their-behalf requesting to retain accommodation), not an
estate-officer administrative decision. Only the three dispositioning actions (approve/flag-overstay/
record-vacation) require the flag, matching the capability's "record accommodation retention/
vacation; raise licence-fee-recovery signal" framing (the *recording/deciding* side, not the
*requesting* side).

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/hr-admin-g05-transfer-relieving-joining.test.cjs` — 3/3 pass.
- `node --test apps/api/test/*.test.cjs` — full backend suite 697/698 (1 pre-existing unrelated
  skip) — including `ph08b-g05-administration.test.cjs` (wildcard actors, unaffected).

## Verdict

**GAPS-FOUND → remediated.** Two real capability-flag enforcement gaps found and fixed across 5
methods; `g05.transfer.initiate` re-verified as already correct.
