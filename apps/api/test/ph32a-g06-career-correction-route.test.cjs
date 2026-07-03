// PH-32A — G06 career-path + correction-cascade routes (route exposure for PH-19C/PH-24B engines).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");
function actor(extra = {}) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "user-ph32a", actorUserId: "user-ph32a", permissions: ["*"], roles: ["establishment_officer"], fieldGrants: [], correlationId: "corr-ph32a", ...extra };
}
function call(api, request) { return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph32a", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request }); }
test("PH-32A POST /api/v1/promotions/career-paths defines an ordered path", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/promotions/career-paths",
    headers: { "Idempotency-Key": "idem-ph32a-cp" },
    body: { pathCode: "REV-LADDER", name: "Revenue ladder", stages: [ { stageNo: 1, gradeDesignationId: "d1", typicalYears: 5 }, { stageNo: 2, gradeDesignationId: "d2", typicalYears: 6 } ] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.careerPath.stages.length, 2);
});
test("PH-32A POST /api/v1/promotions/seniority-lists:finalise finalises a ranked list", () => {
  const api = createFoundationApi(createFoundationServices());
  const res = call(api, {
    method: "POST",
    path: "/api/v1/promotions/seniority-lists:finalise",
    headers: { "Idempotency-Key": "idem-ph32a-sl" },
    body: { listCode: "REV-2026", entries: [ { employeeId: "e-a", appointmentDate: "2020-01-10", serviceNo: "S1" } ] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.list.status, "FINALISED");
});
