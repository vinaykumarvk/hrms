// PH-18B — G03 WFH / on-duty attendance exceptions (FR-07 / FR-08).
//   attendance_exceptions record WFH and ON_DUTY/TOUR ranges. Overlap is rejected
//   (EXCEPTION_OVERLAP); WFH is capped per cycle (WFH_CAP_EXCEEDED); a tour needs an order
//   document (DOCUMENT_REQUIRED).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const EMP = "user-ph18b";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: EMP,
    actorUserId: EMP,
    permissions: ["*"],
    roles: ["employee"],
    fieldGrants: ["*"],
    correlationId: "corr-ph18b",
    ...extra,
  };
}

test("G03 attendance_exceptions: a WFH exception is filed and an overlapping one is rejected", () => {
  const s = createFoundationServices();
  const wfh = s.attendanceException.fileException(actor(), {
    employeeId: ph03Ids.employee,
    exceptionType: "WFH",
    fromDate: "2026-07-06",
    toDate: "2026-07-08",
  });
  assert.equal(wfh.exceptionType, "WFH");
  assert.equal(wfh.days, 3);
  assert.throws(
    () => s.attendanceException.fileException(actor(), {
      employeeId: ph03Ids.employee,
      exceptionType: "WFH",
      fromDate: "2026-07-08",
      toDate: "2026-07-09",
    }),
    (err) => err.code === "EXCEPTION_OVERLAP"
  );
});

test("G03 attendance_exceptions: WFH honours the per-cycle cap (WFH_CAP_EXCEEDED)", () => {
  const s = createFoundationServices();
  // Cap is 8 days; 6 approved then a 4-day request breaches it.
  s.attendanceException.fileException(actor(), { employeeId: ph03Ids.manager, exceptionType: "WFH", fromDate: "2026-07-06", toDate: "2026-07-11" });
  assert.throws(
    () => s.attendanceException.fileException(actor(), { employeeId: ph03Ids.manager, exceptionType: "WFH", fromDate: "2026-07-13", toDate: "2026-07-16" }),
    (err) => err.code === "WFH_CAP_EXCEEDED"
  );
});

test("G03 attendance_exceptions: an on-duty/tour exception requires an order document (DOCUMENT_REQUIRED)", () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.attendanceException.fileException(actor(), {
      employeeId: ph03Ids.employee,
      exceptionType: "TOUR",
      fromDate: "2026-08-01",
      toDate: "2026-08-03",
      location: "Field HQ",
    }),
    (err) => err.code === "DOCUMENT_REQUIRED"
  );
  const tour = s.attendanceException.fileException(actor(), {
    employeeId: ph03Ids.employee,
    exceptionType: "TOUR",
    fromDate: "2026-08-01",
    toDate: "2026-08-03",
    orderDocumentId: "doc-tour-771",
    location: "Field HQ",
  });
  assert.equal(tour.exceptionType, "TOUR");
  assert.equal(tour.orderDocumentId, "doc-tour-771");
});
