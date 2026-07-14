const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Request a transfer or view transfer orders — submit preferences, track status
// (G05)". Exercised over HTTP against seedTestEmployees:true real data (Priya's real seeded
// PENDING_APPROVAL transfer order, routed to the real G05_TRANSFER_REVENUE authority), not
// mocked/hard-coded records.

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
  const rohan = services.employeeMaster.getByServiceNo(admin, "GOV-100301");
  const arjun = services.employeeMaster.getByServiceNo(admin, "GOV-100302");
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  const priya = services.employeeMaster.getByServiceNo(admin, "GOV-100306");
  return { services, api, admin, rohan, arjun, sunita, priya };
}

async function call(api, actorCtx, request) {
  return await api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g05-transfer-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G05 transfers: the seed produces a real PENDING_APPROVAL transfer order for Priya", async () => {
  const { api, priya } = boot();
  const result = await call(api, actor(priya.id, ["g05.transfer.read"]), { method: "GET", path: `/api/v1/transfers/employees/${priya.id}` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].status, "PENDING_APPROVAL");
  assert.equal(result.body.items[0].fromOrgUnitId, ph03Ids.orgRevenue);
});

test("G05 transfers: wire responses never leak internal tenantId/entityId/workflowInstanceId fields", async () => {
  const { api, priya } = boot();
  const orders = (await call(api, actor(priya.id, ["g05.transfer.read"]), { method: "GET", path: `/api/v1/transfers/employees/${priya.id}` })).body.items;
  for (const order of orders) {
    assert.equal("tenantId" in order, false);
    assert.equal("entityId" in order, false);
    assert.equal("workflowInstanceId" in order, false);
    assert.equal("workflowTaskId" in order, false);
    assert.equal("orderNumberSequenceId" in order, false);
  }
});

test("G05 transfers: an employee can list their own transfer orders, but not another employee's", async () => {
  const { api, priya, sunita } = boot();
  const own = await call(api, actor(priya.id, ["g05.transfer.read"]), { method: "GET", path: `/api/v1/transfers/employees/${priya.id}` });
  assert.equal(own.status, 200);

  const strangerReads = await call(api, actor(sunita.id, ["g05.transfer.read"]), { method: "GET", path: `/api/v1/transfers/employees/${priya.id}` });
  assert.equal(strangerReads.status, 403);
});

test("G05 transfers: the general order list never surfaces another employee's order to a plain employee", async () => {
  const { api, priya } = boot();
  const priyaGeneralList = await call(api, actor(priya.id, ["g05.transfer.read"]), { method: "GET", path: "/api/v1/transfers/orders" });
  assert.equal(priyaGeneralList.status, 200);
  assert.ok(priyaGeneralList.body.items.every((order) => order.employeeId === priya.id));

  const hrAdminGeneralList = await call(api, actor("hr-admin-general-list-probe", ["g05.transfer.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: "/api/v1/transfers/orders",
  });
  assert.equal(hrAdminGeneralList.status, 200);
  assert.ok(hrAdminGeneralList.body.items.some((order) => order.employeeId === priya.id));
});

test("G05 transfers: an employee can raise their own transfer request; a random unrelated employee cannot raise it for them; their real resolved manager can", async () => {
  const { api, rohan, arjun, sunita } = boot();

  const selfInitiate = await call(api, actor(rohan.id, ["g05.transfer.initiate"]), {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-g05-self-initiate-001" },
    body: {
      employeeId: rohan.id,
      fromOrgUnitId: ph03Ids.orgRevenue,
      toOrgUnitId: ph03Ids.orgAssessment,
      orderDate: "2026-07-05",
      effectiveDate: "2026-07-20",
      reason: "Employee-requested posting",
    },
  });
  assert.equal(selfInitiate.status, 201);
  assert.equal(selfInitiate.body.order.status, "PENDING_APPROVAL");

  const strangerInitiate = await call(api, actor("unrelated-employee", ["g05.transfer.initiate"]), {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-g05-stranger-initiate-001" },
    body: {
      employeeId: rohan.id,
      fromOrgUnitId: ph03Ids.orgRevenue,
      toOrgUnitId: ph03Ids.orgAssessment,
      orderDate: "2026-07-05",
      effectiveDate: "2026-07-20",
    },
  });
  assert.equal(strangerInitiate.status, 403);

  // Arjun IS Rohan's real resolved reporting-chain manager, so he may raise a request on
  // Rohan's behalf (BRD "Raise transfer request: C (team)" for the reporting manager).
  const managerInitiate = await call(api, actor(arjun.id, ["g05.transfer.initiate"]), {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-g05-manager-initiate-001" },
    body: {
      employeeId: rohan.id,
      fromOrgUnitId: ph03Ids.orgRevenue,
      toOrgUnitId: ph03Ids.orgAssessment,
      orderDate: "2026-07-05",
      effectiveDate: "2026-07-20",
    },
  });
  assert.equal(managerInitiate.status, 201);

  // Sunita is not Rohan's manager and holds no override role.
  const nonManagerInitiate = await call(api, actor(sunita.id, ["g05.transfer.initiate"]), {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-g05-non-manager-initiate-001" },
    body: {
      employeeId: rohan.id,
      fromOrgUnitId: ph03Ids.orgRevenue,
      toOrgUnitId: ph03Ids.orgAssessment,
      orderDate: "2026-07-05",
      effectiveDate: "2026-07-20",
    },
  });
  assert.equal(nonManagerInitiate.status, 403);
});

test("G05 transfers: only the transferee (or an override role) may acknowledge a served order — never an unrelated employee", async () => {
  const { services, api, priya, sunita } = boot();
  const admin = actor("test-admin-serve", ["*"]);
  const orders = services.transfer.listMyOrders(admin, priya.id);
  const orderId = orders[0].id;
  // approve() auto-serves via the default IN_APP delivery channel (a "system" channel per
  // FR-G05-020 AC1), so no separate serveOrder() call is needed before acknowledging.
  services.transfer.approve(admin, orderId, { idempotencyKey: "idem-g05-test-approve-001" });

  const strangerAck = await call(api, actor(sunita.id, ["g05.transfer.acknowledge"]), {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/acknowledge`,
    headers: { "Idempotency-Key": "idem-g05-stranger-ack-001" },
    body: { acknowledgedAt: "2026-07-07T09:00:00.000Z" },
  });
  assert.equal(strangerAck.status, 403);

  const selfAck = await call(api, actor(priya.id, ["g05.transfer.acknowledge"]), {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/acknowledge`,
    headers: { "Idempotency-Key": "idem-g05-self-ack-001" },
    body: { acknowledgedAt: "2026-07-07T09:00:00.000Z" },
  });
  assert.equal(selfAck.status, 202);
  assert.equal(selfAck.body.acknowledgement.acknowledgementStatus, "ACKNOWLEDGED");
  assert.equal("tenantId" in selfAck.body.acknowledgement, false);
});

test("G05 transfers: an employee can submit their own counselling preferences; nobody else can submit or view them for a different employee", async () => {
  const { api, rohan, sunita } = boot();
  const driveId = "drive-g05-self-service-001";
  const preferences = [
    { preferenceRank: 1, preferredOrgUnitId: ph03Ids.orgAssessment },
    { preferenceRank: 2, preferredOrgUnitId: ph03Ids.orgRevenue },
  ];

  const strangerSubmits = await call(api, actor(sunita.id, ["g05.preference.submit"]), {
    method: "PUT",
    path: `/api/v1/transfers/drives/${driveId}/preferences`,
    headers: { "Idempotency-Key": "idem-g05-stranger-preference-001" },
    body: { employeeId: rohan.id, preferences },
  });
  assert.equal(strangerSubmits.status, 403);

  const selfSubmits = await call(api, actor(rohan.id, ["g05.preference.submit"]), {
    method: "PUT",
    path: `/api/v1/transfers/drives/${driveId}/preferences`,
    headers: { "Idempotency-Key": "idem-g05-self-preference-001" },
    body: { employeeId: rohan.id, preferences },
  });
  assert.equal(selfSubmits.status, 202);
  assert.equal(selfSubmits.body.preferences.length, 2);
  assert.equal("tenantId" in selfSubmits.body.preferences[0], false);

  const strangerReads = await call(api, actor(sunita.id, ["g05.counselling.read", "g05.transfer.read"]), {
    method: "GET",
    path: `/api/v1/transfers/drives/${driveId}/employees/${rohan.id}/preferences`,
  });
  assert.equal(strangerReads.status, 403);

  const selfReads = await call(api, actor(rohan.id, ["g05.counselling.read", "g05.transfer.read"]), {
    method: "GET",
    path: `/api/v1/transfers/drives/${driveId}/employees/${rohan.id}/preferences`,
  });
  assert.equal(selfReads.status, 200);
  assert.equal(selfReads.body.items.length, 2);
});

test("G05 transfers: post-full-review fix — approve/cancel/clearance/relieve-and-join responses never leak internal tenantId/entityId/workflowInstanceId fields", async () => {
  const { services, api, priya } = boot();
  const admin = actor("test-admin-lifecycle", ["*"]);
  const orders = services.transfer.listMyOrders(admin, priya.id);
  const orderId = orders[0].id;

  const approve = await call(api, admin, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/approve`,
    headers: { "Idempotency-Key": "idem-g05-lifecycle-approve-001" },
    body: { idempotencyKey: "idem-g05-lifecycle-approve-001" },
  });
  assert.equal(approve.status, 202);
  assert.equal("tenantId" in approve.body.order, false);
  assert.equal("workflowInstanceId" in approve.body.order, false);
  assert.equal("orderNumberSequenceId" in approve.body.order, false);

  for (const code of approve.body.order.clearanceItems.slice(1).map((item) => item.code)) {
    await call(api, admin, {
      method: "POST",
      path: `/api/v1/transfers/orders/${orderId}/clearances/${code}:complete`,
      headers: { "Idempotency-Key": `idem-g05-lifecycle-clear-${code}` },
      body: { completedOn: "2026-07-08" },
    });
  }
  // Clearance due date is the order's effectiveDate (2026-07-20); deeming requires a genuine
  // SLA breach, so deemedOn must be strictly after it.
  const firstCode = approve.body.order.clearanceItems[0].code;
  const deemClearance = await call(api, admin, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/clearances/${firstCode}:deem`,
    headers: { "Idempotency-Key": "idem-g05-lifecycle-deem-clearance-001" },
    body: { deemedOn: "2026-07-21" },
  });
  assert.equal("tenantId" in deemClearance.body.order, false);

  const relieveAndJoin = await call(api, admin, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}:relieve-and-join`,
    headers: { "Idempotency-Key": "idem-g05-lifecycle-relieve-join-001" },
    body: { relievingDate: "2026-07-25", joiningDate: "2026-07-26" },
  });
  assert.equal(relieveAndJoin.status, 202);
  assert.equal("tenantId" in relieveAndJoin.body.order, false);
  assert.equal("tenantId" in relieveAndJoin.body.relievingOrder, false);
  assert.equal("tenantId" in relieveAndJoin.body.joiningReport, false);
});

test("G05 transfers: post-full-review fix — an unrelated employee cannot see another employee's relieving orders or joining reports via the general list routes", async () => {
  const { services, api, priya, sunita } = boot();
  const admin = actor("test-admin-relieve-list", ["*"]);
  const orders = services.transfer.listMyOrders(admin, priya.id);
  const orderId = orders[0].id;
  services.transfer.approve(admin, orderId, { idempotencyKey: "idem-g05-relieve-list-approve-001" });
  const order = services.transfer.getOrder(admin, orderId);
  for (const item of order.clearanceItems.slice(1)) {
    services.transfer.completeClearance(admin, orderId, item.code, "2026-07-08");
  }
  // Clearance due date is the order's effectiveDate (2026-07-20); deeming requires a genuine SLA breach.
  services.transfer.deemClearance(admin, orderId, order.clearanceItems[0].code, "2026-07-21");
  services.transfer.relieveAndJoin(admin, orderId, {
    relievingDate: "2026-07-25",
    joiningDate: "2026-07-26",
    idempotencyKey: "idem-g05-relieve-list-join-001",
  });

  const priyaRelievingOrders = await call(api, actor(priya.id, ["g05.transfer.read"]), { method: "GET", path: "/api/v1/transfers/relieving-orders" });
  assert.equal(priyaRelievingOrders.status, 200);
  assert.ok(priyaRelievingOrders.body.items.some((row) => row.transferOrderId === orderId));

  const sunitaRelievingOrders = await call(api, actor(sunita.id, ["g05.transfer.read"]), { method: "GET", path: "/api/v1/transfers/relieving-orders" });
  assert.equal(sunitaRelievingOrders.status, 200);
  assert.ok(
    sunitaRelievingOrders.body.items.every((row) => row.employeeId !== priya.id),
    "an unrelated employee's GET /relieving-orders must never include Priya's relieving order"
  );

  const priyaJoiningReports = await call(api, actor(priya.id, ["g05.transfer.read"]), { method: "GET", path: "/api/v1/transfers/joining-reports" });
  assert.ok(priyaJoiningReports.body.items.some((row) => row.transferOrderId === orderId));

  const sunitaJoiningReports = await call(api, actor(sunita.id, ["g05.transfer.read"]), { method: "GET", path: "/api/v1/transfers/joining-reports" });
  assert.ok(
    sunitaJoiningReports.body.items.every((row) => row.employeeId !== priya.id),
    "an unrelated employee's GET /joining-reports must never include Priya's joining report"
  );

  // hr_admin override still sees everything via both general list routes.
  const hrAdminRelievingOrders = await call(api, actor("hr-admin-relieving-probe", ["g05.transfer.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: "/api/v1/transfers/relieving-orders",
  });
  assert.ok(hrAdminRelievingOrders.body.items.some((row) => row.employeeId === priya.id));
});

test("G05 transfers: an hr_admin override role may initiate for, list, and acknowledge on behalf of any employee", async () => {
  const { services, api } = boot();
  const admin = actor("test-admin-meera", ["*"]);
  const meeraEmployee = services.employeeMaster.getByServiceNo(admin, "GOV-100304");

  const hrAdminInitiate = await call(api, actor("hr-admin-probe", ["g05.transfer.initiate"], { roles: ["hr_admin"] }), {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-g05-hr-admin-initiate-001" },
    body: {
      employeeId: meeraEmployee.id,
      fromOrgUnitId: ph03Ids.orgRevenue,
      toOrgUnitId: ph03Ids.orgAssessment,
      orderDate: "2026-07-05",
      effectiveDate: "2026-07-20",
    },
  });
  assert.equal(hrAdminInitiate.status, 201);
});

test("G05 transfers: post-full-review fix — service-record read is ownership-gated, not any g05.transfer.read holder", async () => {
  const { api, priya, sunita } = boot();
  const orderId = (await call(api, actor(priya.id, ["g05.transfer.read"]), {
    method: "GET",
    path: `/api/v1/transfers/employees/${priya.id}`,
  })).body.items[0].id;

  const owner = await call(api, actor(priya.id, ["g05.transfer.read"]), {
    method: "GET",
    path: `/api/v1/transfers/orders/${orderId}/service-record`,
  });
  assert.equal(owner.status, 200);

  const stranger = await call(api, actor(sunita.id, ["g05.transfer.read"]), {
    method: "GET",
    path: `/api/v1/transfers/orders/${orderId}/service-record`,
  });
  assert.equal(stranger.status, 403);

  const hrAdmin = await call(api, actor("hr-admin-service-record-probe", ["g05.transfer.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/transfers/orders/${orderId}/service-record`,
  });
  assert.equal(hrAdmin.status, 200);
});
