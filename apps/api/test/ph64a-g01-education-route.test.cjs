const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph64a",
    actorUserId: "user-ph64a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph64a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph64a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function addEducation(api, key, body) {
  return call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/education`, headers: { "Idempotency-Key": key }, body });
}

function highestCount(api) {
  const list = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/education` });
  assert.equal(list.status, 200);
  return list.body.items.filter((e) => e.status === "ACTIVE" && e.isHighest).length;
}

test("PH-64A G01 education: at most one record is is_highest (promoting auto-demotes the prior)", () => {
  const api = createFoundationApi(createFoundationServices());

  const masters = addEducation(api, "ed-1", { level: "MASTERS", institution: "JNU", isHighest: true, yearOfPassing: 2015 });
  assert.equal(masters.status, 201);
  assert.equal(masters.body.education.isHighest, true);

  // Adding a new highest demotes the prior one.
  const phd = addEducation(api, "ed-2", { level: "PHD", institution: "IISc", isHighest: true, yearOfPassing: 2020 });
  assert.equal(phd.status, 201);
  assert.equal(highestCount(api), 1);

  // Adding PHD auto-demoted MASTERS, bumping its row_version — re-read the current version before promoting.
  const current = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/education` });
  const mastersNow = current.body.items.find((e) => e.id === masters.body.education.id);
  assert.equal(mastersNow.isHighest, false);

  // Promote MASTERS back to highest -> PHD demoted; still exactly one highest.
  const promoted = call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/education/${masters.body.education.id}`,
    headers: { "Idempotency-Key": "ed-p" },
    body: { rowVersion: mastersNow.rowVersion, isHighest: true },
  });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.education.isHighest, true);
  assert.equal(highestCount(api), 1);
});

test("PH-64A G01 education validates year_of_passing and row_version", () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = addEducation(api, "ey-1", { level: "MASTERS", yearOfPassing: 1800 });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");

  const created = addEducation(api, "ey-2", { level: "MASTERS", yearOfPassing: 2015 });
  const id = created.body.education.id;
  const stale = call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/education/${id}`,
    headers: { "Idempotency-Key": "ey-s" },
    body: { rowVersion: 99, isVerified: true },
  });
  assert.equal(stale.status, 409);
});

test("PH-64A G01 education soft-delete retains the row and clears is_highest", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = addEducation(api, "er-1", { level: "PHD", isHighest: true, yearOfPassing: 2020 });
  const id = created.body.education.id;
  assert.equal(highestCount(api), 1);

  const removed = call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/education/${id}:remove`, headers: { "Idempotency-Key": "er-r" }, body: {} });
  assert.equal(removed.status, 200);
  assert.equal(highestCount(api), 0);
});
