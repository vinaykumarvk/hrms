// PH-25B — G02 retro-impact downstream fan-out (FR-022).
//   A past-dated change fans out retro_impact_events to each affected target (G10/G11/G06); each
//   dispatches idempotently (PENDING -> SENT -> ACKED); a retryable failure retries up to a cap and
//   then DEAD_LETTERs.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const HR = "user-ph25b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: HR,
    actorUserId: HR,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph25b",
    ...extra,
  };
}

test("G02 retro_impact_events: fan-out is per-target and idempotent; dispatch acks", async () => {
  const s = createFoundationServices();
  const events = s.retroImpact.fanOut(actor(), { changeRequestId: "cr-25b-1", effectiveDate: "2026-01-01", targets: ["G10", "G11", "G06"] });
  assert.equal(events.length, 3);
  // Re-running fan-out does not duplicate.
  const again = s.retroImpact.fanOut(actor(), { changeRequestId: "cr-25b-1", effectiveDate: "2026-01-01", targets: ["G10", "G11", "G06"] });
  assert.equal(s.retroImpact.listForChange(actor(), "cr-25b-1").length, 3);
  const g10 = events.find((e) => e.target === "G10");
  const acked = s.retroImpact.dispatch(actor(), g10.id, { success: true, ackRef: "G10-ACK-1" });
  assert.equal(acked.status, "ACKED");
  // Dispatching an ACKED event again is a no-op.
  assert.equal(s.retroImpact.dispatch(actor(), g10.id, { success: true }).status, "ACKED");
});

test("G02 retro_impact_events: retryable failures exhaust into DEAD_LETTER", async () => {
  const s = createFoundationServices();
  const events = s.retroImpact.fanOut(actor(), { changeRequestId: "cr-25b-2", effectiveDate: "2026-01-01", targets: ["G11"], maxAttempts: 2 });
  const e = events[0];
  const r1 = s.retroImpact.dispatch(actor(), e.id, { success: false });
  assert.equal(r1.status, "SENT"); // attempt 1 -> re-queued/in-flight
  const r2 = s.retroImpact.dispatch(actor(), e.id, { success: false });
  assert.equal(r2.status, "DEAD_LETTER"); // attempt 2 exhausts the cap
  // A dead-lettered event cannot be silently dispatched.
  assert.throws(
    () => s.retroImpact.dispatch(actor(), e.id, { success: true }),
    (err) => err.code === "PRECONDITION_FAILED"
  );
});
