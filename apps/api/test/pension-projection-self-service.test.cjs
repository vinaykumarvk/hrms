const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Check pension/retirement projections — for employees nearing retirement, view
// estimated benefits (G11)". Exercised over HTTP against seedTestEmployees:true real data
// (Arjun's real seeded G10 last-drawn-pay feed via PayrollService, plus real E30-E36 pension
// rule rows), not mocked/hard-coded records. FR-G11-15 AC1: estimates are non-binding and never
// write to a live pension case.

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["employee"],
    fieldGrants: ["*"],
    ...extra,
  };
}

function boot() {
  const services = createFoundationServices({ seedTestEmployees: true });
  const api = createFoundationApi(services);
  const admin = actor("test-admin", ["*"]);
  const arjun = services.employeeMaster.getByServiceNo(admin, "GOV-100302");
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  return { services, api, admin, arjun, sunita };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g11-pension-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G11 pension: an employee can run a non-binding OPS estimate for themselves using their real seeded last-drawn pay", () => {
  const { api, arjun } = boot();
  const result = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-self-estimate-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05" },
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.estimate.isBinding, false);
  assert.equal(result.body.estimate.employeeId, arjun.id);
  assert.ok(result.body.estimate.qualifyingServiceMonths > 0);
  assert.ok(result.body.estimate.pensionCents > 0);
  assert.equal("tenantId" in result.body.estimate, false);
});

test("G11 pension: an estimate never persists a pension case (AC1 non-binding)", () => {
  const { services, api, arjun } = boot();
  call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-non-binding-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05" },
  });
  const admin = actor("test-admin-check", ["*"]);
  assert.equal(services.pension.listMyCases(admin, arjun.id).length, 0, "an estimate must never create a pension case");
});

test("G11 pension: a what-if can vary qualifying service, emoluments, and date, and a stranger cannot estimate for another employee", () => {
  const { api, arjun, sunita } = boot();
  const baseline = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-whatif-baseline-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05" },
  });
  assert.equal(baseline.status, 201);

  const whatIf = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-whatif-varied-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05", qualifyingServiceMonths: 420, emolumentsBaseCents: 12000000 },
  });
  assert.equal(whatIf.status, 201);
  assert.equal(whatIf.body.estimate.qualifyingServiceMonths, 420);
  assert.equal(whatIf.body.estimate.emolumentsBaseCents, 12000000);
  assert.notEqual(whatIf.body.estimate.pensionCents, baseline.body.estimate.pensionCents);

  const strangerEstimate = call(api, actor(sunita.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-stranger-estimate-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05" },
  });
  assert.equal(strangerEstimate.status, 403);
});

test("G11 pension: an employee can list their own pension cases, but not another employee's; the pension_officer override may (hr_admin may not — SoD boundary)", () => {
  const { services, api, admin, arjun, sunita } = boot();
  // Give Arjun a real (admin-created) pension case so "track status" has something to list.
  const created = services.pension.createCase(admin, { employeeId: arjun.id, separationDate: "2050-11-30", scheme: "OPS" });
  assert.ok(created.id);

  const own = call(api, actor(arjun.id, ["g11.pension.self.read"]), { method: "GET", path: `/api/v1/pension/employees/${arjun.id}/cases` });
  assert.equal(own.status, 200);
  assert.equal(own.body.items.length, 1);
  assert.equal("tenantId" in own.body.items[0], false);

  const strangerReads = call(api, actor(sunita.id, ["g11.pension.self.read"]), { method: "GET", path: `/api/v1/pension/employees/${arjun.id}/cases` });
  assert.equal(strangerReads.status, 403);

  const hrAdminReads = call(api, actor("hr-admin-probe", ["g11.pension.self.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/pension/employees/${arjun.id}/cases`,
  });
  assert.equal(hrAdminReads.status, 403);

  const pensionOfficerReads = call(api, actor("pension-officer-probe", ["g11.pension.self.read"], { roles: ["pension_officer"] }), {
    method: "GET",
    path: `/api/v1/pension/employees/${arjun.id}/cases`,
  });
  assert.equal(pensionOfficerReads.status, 200);
  assert.equal(pensionOfficerReads.body.items.length, 1);
});

test("G11 pension: an estimate requires the asOf date and rejects a malformed one", () => {
  const { api, arjun } = boot();
  const missingAsOf = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-missing-asof-001" },
    body: { employeeId: arjun.id, scheme: "OPS" },
  });
  assert.equal(missingAsOf.status, 400);

  const malformedAsOf = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-malformed-asof-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "not-a-date" },
  });
  assert.equal(malformedAsOf.status, 400);
});

test("G11 pension: post-full-review fix — a nonsensical what-if (negative emoluments, out-of-range service) is rejected, not silently clamped", () => {
  const { api, arjun } = boot();
  const negativeEmoluments = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-negative-emoluments-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05", emolumentsBaseCents: -8500000 },
  });
  assert.equal(negativeEmoluments.status, 400);

  const zeroEmoluments = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-zero-emoluments-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05", emolumentsBaseCents: 0 },
  });
  assert.equal(zeroEmoluments.status, 400);

  const negativeService = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-negative-service-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05", qualifyingServiceMonths: -12 },
  });
  assert.equal(negativeService.status, 400);

  const absurdService = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-absurd-service-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05", qualifyingServiceMonths: 999999999 },
  });
  assert.equal(absurdService.status, 400);

  const nonIntegerService = call(api, actor(arjun.id, ["g11.pension.self.read"]), {
    method: "POST",
    path: "/api/v1/pension/estimates",
    headers: { "Idempotency-Key": "idem-g11-non-integer-service-001" },
    body: { employeeId: arjun.id, scheme: "OPS", asOf: "2050-08-05", qualifyingServiceMonths: 12.5 },
  });
  assert.equal(nonIntegerService.status, 400);
});
