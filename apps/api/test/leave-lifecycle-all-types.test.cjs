const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Full submit -> decide lifecycle across every configured leave type (EL, CL, HPL, SL, CCL),
// exercised against the seeded supervisor/leave-calendar/entitlement data (seedTestEmployees:true;
// see apps/api/src/seed/testEmployeesSeed.ts) with the actual resolved reporting-chain approver
// deciding each application (required since the P01 workflow platform now enforces approver
// identity — see apps/api/test/workflow-approver-identity.test.cjs).

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const admin = {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "test-lifecycle-admin",
    actorUserId: "test-lifecycle-admin",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
  };
  const byServiceNo = (serviceNo) => services.employeeMaster.getByServiceNo(admin, serviceNo);
  const employees = {
    kiran: { id: ph03Ids.employee, actor: actorFor(ph03Ids.employee) },
    manager: { id: ph03Ids.manager, actor: actorFor(ph03Ids.manager) },
    rohan: withActor(byServiceNo("GOV-100301")),
    arjun: withActor(byServiceNo("GOV-100302")),
    sunita: withActor(byServiceNo("GOV-100303")),
    meera: withActor(byServiceNo("GOV-100304")),
    devika: withActor(byServiceNo("GOV-100305")),
    priya: withActor(byServiceNo("GOV-100306")),
  };
  return { services, admin, employees };

  function withActor(employee) {
    return { id: employee.id, record: employee, actor: actorFor(employee.id) };
  }
}

function actorFor(userId) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: [
      "g03.leave.submit",
      "g03.leave.approve",
      "g03.leave.reject",
      "g03.leave.read",
      "g03.leave.withdraw",
      "g03.leave.cancel",
      "g04.relay.write",
    ],
    roles: ["l1_manager"],
    fieldGrants: [],
  };
}

test("EL: countsHolidays=true includes the seeded 2026-08-15 holiday in the day count; approved by the real resolved manager", async () => {
  const { services, employees } = boot();
  const submitted = services.leave.submit(employees.devika.actor, {
    employeeId: employees.devika.id,
    leaveTypeId: "EL",
    fromDate: "2026-08-14",
    toDate: "2026-08-16",
    reason: "Family event",
  });
  assert.equal(submitted.application.totalDays, 3, "EL counts the holiday inside the spell");

  const approved = services.leave.approve(employees.manager.actor, submitted.application.id, "idem-el-devika-001");
  assert.equal(approved.application.status, "APPROVED");
  const balance = services.leave.getBalance(employees.manager.actor, employees.devika.id, "EL", 2026);
  assert.equal(balance.debited, 3);
});

test("CL: countsHolidays=false excludes the seeded 2026-08-15 holiday from the day count; approved by the real resolved manager", async () => {
  const { services, employees } = boot();
  const submitted = services.leave.submit(employees.sunita.actor, {
    employeeId: employees.sunita.id,
    leaveTypeId: "CL",
    fromDate: "2026-08-14",
    toDate: "2026-08-16",
    reason: "Personal work",
  });
  assert.equal(submitted.application.totalDays, 2, "CL excludes the holiday inside the spell");

  const approved = services.leave.approve(employees.manager.actor, submitted.application.id, "idem-cl-sunita-001");
  assert.equal(approved.application.status, "APPROVED");
  const balance = services.leave.getBalance(employees.manager.actor, employees.sunita.id, "CL", 2026);
  assert.equal(balance.debited, 2);
});

test("CL: rejected by the real resolved manager releases the reservation without debiting the balance", async () => {
  const { services, employees } = boot();
  const before = services.leave.getBalance(employees.manager.actor, employees.kiran.id, "CL", 2026);
  const submitted = services.leave.submit(employees.kiran.actor, {
    employeeId: employees.kiran.id,
    leaveTypeId: "CL",
    fromDate: "2026-07-24",
    toDate: "2026-07-24",
    reason: "Errand",
  });
  assert.equal(submitted.balance.reserved, before.reserved + 1);

  const { application } = services.leave.reject(employees.manager.actor, submitted.application.id);
  assert.equal(application.status, "REJECTED");
  const after = services.leave.getBalance(employees.manager.actor, employees.kiran.id, "CL", 2026);
  assert.equal(after.reserved, before.reserved, "rejection releases the reservation");
  assert.equal(after.debited, before.debited, "a rejected application never debits the balance");
});

test("HPL: submit and approve by the real resolved manager", async () => {
  const { services, employees } = boot();
  const submitted = services.leave.submit(employees.arjun.actor, {
    employeeId: employees.arjun.id,
    leaveTypeId: "HPL",
    fromDate: "2026-07-27",
    toDate: "2026-07-28",
    reason: "Medical",
  });
  assert.equal(submitted.application.totalDays, 2);

  const approved = services.leave.approve(employees.manager.actor, submitted.application.id, "idem-hpl-arjun-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("SL: the seeded eligibility-cleared application (Priya, ~9yr tenure) can be approved by the real resolved manager", async () => {
  const { services, employees } = boot();
  const seeded = services.leave
    .listApplications(employees.manager.actor)
    .find((application) => application.employeeId === employees.priya.id && application.leaveTypeId === "SL");
  assert.ok(seeded, "the seed must have produced an SL application for Priya");
  assert.equal(seeded.status, "SUBMITTED");

  const approved = services.leave.approve(employees.manager.actor, seeded.id, "idem-sl-priya-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("CCL: entitlement cap (15 days) is enforced across successive applications even though the opening balance (60) is far larger", async () => {
  const { services, employees } = boot();
  const first = services.leave.submit(employees.meera.actor, {
    employeeId: employees.meera.id,
    leaveTypeId: "CCL",
    fromDate: "2026-08-03",
    toDate: "2026-08-12",
    reason: "Child care",
  });
  assert.equal(first.application.totalDays, 10);
  const approved = services.leave.approve(employees.manager.actor, first.application.id, "idem-ccl-meera-001");
  assert.equal(approved.application.status, "APPROVED");

  assert.throws(
    () =>
      services.leave.submit(employees.meera.actor, {
        employeeId: employees.meera.id,
        leaveTypeId: "CCL",
        fromDate: "2026-08-17",
        toDate: "2026-08-22",
        reason: "Child care continuation",
      }),
    (error) => error.code === "ENTITLEMENT_EXCEEDED",
    "10 already debited + 6 more exceeds the 15-day CCL entitlement cap"
  );
});
