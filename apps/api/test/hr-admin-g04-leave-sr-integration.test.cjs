const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// hr_admin capability audit — G04 Leave-SR Integration: g04.relay.monitor (runtime:
// g04.relay.read, pre-existing), g04.dlq.triage_replay (runtime: g04.relay.replay/discard +
// new g04_dlq_ops flag check on replay/discard/reconciliation-trigger).

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["hr_admin"],
    fieldGrants: [],
    ...extra,
  };
}

function boot() {
  return createFoundationServices();
}

function deadLetteredEvent(services, suffix) {
  const event = services.leaveSrRelay.enqueueApprovedLeave(actor("seed-admin", ["*"]), {
    leaveApplicationId: `leave-app-hr-admin-g04-${suffix}`,
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-14",
    payload: { applicationNo: `LA/2026/9${suffix}`, totalDays: 1 },
  });
  services.leaveSrRelay.relayEvent(actor("seed-admin", ["*"]), event.id, { simulateFailure: true });
  services.leaveSrRelay.relayEvent(actor("seed-admin", ["*"]), event.id, { simulateFailure: true });
  return event;
}

test("g04.relay.monitor (runtime: g04.relay.read): the relay dashboard/reconciliation summary works", () => {
  const services = boot();
  const event = services.leaveSrRelay.enqueueApprovedLeave(actor("hr-admin-monitor-probe", ["g04.relay.write"]), {
    leaveApplicationId: "leave-app-hr-admin-g04-monitor-001",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-14",
    payload: { applicationNo: "LA/2026/91001", totalDays: 1 },
  });
  services.leaveSrRelay.relayEvent(actor("hr-admin-monitor-probe", ["g04.relay.write"]), event.id);
  const report = services.leaveSrRelay.reconcile(actor("hr-admin-monitor-probe", ["g04.relay.read"]));
  assert.equal(report.total, 1);
  assert.equal(report.posted, 1);
});

test("g04.dlq.triage_replay (post-hr_admin-goal fix): replaying/discarding a dead-lettered event requires the g04_dlq_ops capability", () => {
  const services = boot();
  const replayTarget = deadLetteredEvent(services, "1");
  const discardTarget = deadLetteredEvent(services, "2");

  const replayWithoutFlag = actor("hr-admin-no-dlq-flag", ["g04.relay.replay"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.leaveSrRelay.replayDeadLetter(replayWithoutFlag, replayTarget.id),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g04_dlq_ops")
  );

  const replayWithFlag = actor("hr-admin-with-dlq-flag", ["g04.relay.replay", "g04.relay.write"], { roles: ["hr_admin", "g04_dlq_ops"] });
  const replayed = services.leaveSrRelay.replayDeadLetter(replayWithFlag, replayTarget.id);
  assert.equal(replayed.status, "POSTED");

  const discardWithoutFlag = actor("hr-admin-no-dlq-flag-2", ["g04.relay.discard"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.leaveSrRelay.discardDeadLetter(discardWithoutFlag, discardTarget.id, "Source request cancelled"),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g04_dlq_ops")
  );

  const discardWithFlag = actor("hr-admin-with-dlq-flag-2", ["g04.relay.discard"], { roles: ["hr_admin", "g04_dlq_ops"] });
  const discarded = services.leaveSrRelay.discardDeadLetter(discardWithFlag, discardTarget.id, "Source request cancelled before relay");
  assert.equal(discarded.status, "DISCARDED");
});

test("g04.dlq.triage_replay (post-hr_admin-goal fix): triggering a statutory reconciliation run requires the g04_dlq_ops capability", () => {
  const services = boot();
  const withoutFlag = actor("hr-admin-no-dlq-flag-3", ["g04.relay.reconcile"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.leaveSrRelay.runReconciliation(withoutFlag, { ledgerEntries: [] }),
    (error) => error.code === "FORBIDDEN" && error.message.includes("g04_dlq_ops")
  );

  const withFlag = actor("hr-admin-with-dlq-flag-3", ["g04.relay.reconcile"], { roles: ["hr_admin", "g04_dlq_ops"] });
  const result = services.leaveSrRelay.runReconciliation(withFlag, { ledgerEntries: [] });
  assert.ok(result.run.id);
});
