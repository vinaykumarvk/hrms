// PH-28B — G09 case-evidence list route (route-exposure for the PH-27C evidence-vault UI).
//   GET /api/v1/disciplinary/cases/{id}/evidence returns the case's artefacts (WORM/hold/served).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph28b",
    actorUserId: "user-ph28b",
    permissions: ["*"],
    roles: ["disciplinary_authority"],
    fieldGrants: [],
    correlationId: "corr-ph28b",
    ...extra,
  };
}
function call(api, request) {
  return api.dispatch({ headers: { "X-Correlation-Id": "corr-ph28b", ...(request.headers ?? {}) }, actor: actor(request.actor ?? {}), ...request });
}

test("PH-28B GET /api/v1/disciplinary/cases/{id}/evidence lists the case artefacts", () => {
  const api = createFoundationApi(createFoundationServices());
  const opened = call(api, {
    method: "POST",
    path: "/api/v1/disciplinary/cases",
    headers: { "Idempotency-Key": "idem-ph28b-open" },
    body: { allegations: "Evidence route allegation", confidential: false },
  });
  assert.equal(opened.status, 201);
  const caseId = opened.body.disciplinaryCase.id;
  // No artefacts yet.
  const empty = call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/evidence` });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.items.length, 0);
  // Serve a charge memo -> a CHARGE_MEMO artefact appears.
  call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:charge`,
    headers: { "Idempotency-Key": "idem-ph28b-charge" },
    body: { servedOn: "2026-08-01", articles: ["Article I"] },
  });
  const listed = call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/evidence` });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].artefactType, "CHARGE_MEMO");
  assert.equal(listed.body.items[0].isWorm, true);
});
