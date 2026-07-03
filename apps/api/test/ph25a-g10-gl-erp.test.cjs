// PH-25A — G10 GL->ERP posting export (FR-19).
//   gl_export_batches post a balanced batch to the ERP idempotently (repeat = no-op replay) and
//   run POSTED -> ACKNOWLEDGED on a matching control total, or MISMATCH when totals disagree.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const FIN = "user-ph25a";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: FIN,
    actorUserId: FIN,
    permissions: ["*"],
    roles: ["finance_officer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph25a",
    ...extra,
  };
}

test("G10 gl_export_batches: idempotent ERP post then ACKNOWLEDGED on matching total", () => {
  const s = createFoundationServices();
  const first = s.glErpPosting.postToErp(actor(), { exportKey: "GLX-2026-07", totalDebitPaise: 50_000_00, totalCreditPaise: 50_000_00, erpReference: "ERP-DOC-1" });
  assert.equal(first.replayed, false);
  assert.equal(first.batch.status, "POSTED");
  // Re-posting the same export key is a no-op replay (no double post).
  const replay = s.glErpPosting.postToErp(actor(), { exportKey: "GLX-2026-07", totalDebitPaise: 50_000_00, totalCreditPaise: 50_000_00, erpReference: "ERP-DOC-1" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.batch.id, first.batch.id);
  const acked = s.glErpPosting.acknowledge(actor(), first.batch.id, { ackedTotalPaise: 50_000_00 });
  assert.equal(acked.status, "ACKNOWLEDGED");
});

test("G10 gl_export_batches: an unbalanced batch is rejected and an ACK mismatch is flagged", () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.glErpPosting.postToErp(actor(), { exportKey: "GLX-BAD", totalDebitPaise: 10, totalCreditPaise: 9, erpReference: "x" }),
    (err) => err.code === "VALIDATION_FAILED"
  );
  const b = s.glErpPosting.postToErp(actor(), { exportKey: "GLX-2026-08", totalDebitPaise: 100_00, totalCreditPaise: 100_00, erpReference: "ERP-2" });
  const mism = s.glErpPosting.acknowledge(actor(), b.batch.id, { ackedTotalPaise: 90_00 });
  assert.equal(mism.status, "MISMATCH");
});
