const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph04-g12-g13",
    actorUserId: "user-ph04-g12-g13",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph04-g12-g13",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph04-g12-g13", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function srBody(sourceReferenceId) {
  return {
    sourceModule: "G01",
    sourceReferenceId,
    sourceEventVersion: 1,
    employeeId: ph03Ids.employee,
    eventTypeCode: "IDENTITY_CHANGE",
    eventDate: "2026-07-02",
    factKey: `EMP:${ph03Ids.employee}|IDENTITY|2026-07-02`,
    payload: { displayName: "Kiran Route" },
    documentIds: [],
  };
}

test("PH-04C G12 routes preserve idempotent append and semantic dedup behavior", () => {
  const api = createFoundationApi(createFoundationServices());
  const first = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "Idempotency-Key": "idem-g12-ingest-001" },
    body: srBody("employee:identity:route:1"),
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.event.sequenceNo, 1);

  const replay = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "Idempotency-Key": "idem-g12-ingest-001" },
    body: srBody("employee:identity:route:1"),
  });
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.event.id, first.body.event.id);

  const semantic = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "Idempotency-Key": "idem-g12-ingest-002" },
    body: srBody("employee:identity:route:2"),
  });
  assert.equal(semantic.body.semanticDuplicate, true);
  assert.equal(semantic.body.event.id, first.body.event.id);

  const reversal = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest/reversal",
    headers: { "Idempotency-Key": "idem-g12-reversal-001" },
    body: { originalEventId: first.body.event.id, reason: "Entered in error" },
  });
  assert.equal(reversal.status, 201);
  assert.equal(reversal.body.event.sequenceNo, 2);

  const timeline = call(api, { method: "GET", path: `/api/v1/sr/employees/${ph03Ids.employee}/timeline` });
  assert.equal(timeline.status, 200);
  assert.equal(timeline.body.items.length, 2);
});

test("PH-04C G12 corrigendum and dispute routes append manual SR annotations", () => {
  const api = createFoundationApi(createFoundationServices());
  const first = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "Idempotency-Key": "idem-g12-anno-source-001" },
    body: srBody("employee:identity:annotation:1"),
  });
  const corrigendum = call(api, {
    method: "POST",
    path: `/api/v1/sr/events/${first.body.event.id}/corrigendum`,
    headers: { "Idempotency-Key": "idem-g12-corrigendum-001" },
    body: { reason: "Correct spelling" },
  });
  assert.equal(corrigendum.status, 201);
  assert.equal(corrigendum.body.event.eventTypeCode, "CORRIGENDUM");

  const dispute = call(api, {
    method: "POST",
    path: `/api/v1/sr/events/${first.body.event.id}/dispute`,
    headers: { "Idempotency-Key": "idem-g12-dispute-001" },
    body: { reason: "Employee objection" },
  });
  assert.equal(dispute.status, 201);

  const resolved = call(api, {
    method: "POST",
    path: `/api/v1/sr/disputes/${dispute.body.event.id}/resolve`,
    headers: { "Idempotency-Key": "idem-g12-resolve-001" },
    body: { reason: "Accepted authority note" },
  });
  assert.equal(resolved.status, 201);
  assert.equal(resolved.body.event.eventTypeCode, "DISPUTE_RESOLUTION");
});

test("PH-04C G13 routes cover create, attach, legal hold, retention, and fail-closed checkin", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-g13-create-001" },
    body: {
      title: "Transfer order API",
      ownerEmployeeId: ph03Ids.employee,
      classification: "CONFIDENTIAL",
      contentHash: "bbbb1111bbbb2222bbbb3333bbbb4444bbbb5555bbbb6666bbbb7777bbbb8888",
    },
  });
  assert.equal(created.status, 201);

  const attached = call(api, {
    method: "POST",
    path: "/api/v1/documents:attach",
    headers: { "Idempotency-Key": "idem-g13-attach-001" },
    body: {
      documentId: created.body.document.id,
      link: { moduleCode: "G05", entityName: "transfer_orders", entityRefId: "TRF-API-001", linkRole: "ORDER" },
    },
  });
  assert.equal(attached.status, 202);
  assert.equal(attached.body.document.links.length, 1);

  const hold = call(api, {
    method: "POST",
    path: "/api/v1/legal-holds",
    headers: { "Idempotency-Key": "idem-g13-hold-001" },
    body: { documentId: created.body.document.id, reason: "Pending inquiry" },
  });
  assert.equal(hold.status, 202);
  assert.equal(hold.body.document.legalHold, true);

  const retention = call(api, { method: "GET", path: `/api/v1/documents/${created.body.document.id}/retention` });
  assert.equal(retention.body.retention.failClosed, true);

  const blocked = call(api, {
    method: "POST",
    path: `/api/v1/documents/${created.body.document.id}:checkin`,
    headers: { "Idempotency-Key": "idem-g13-checkin-001" },
    body: { contentHash: "cccc1111cccc2222cccc3333cccc4444cccc5555cccc6666cccc7777cccc8888" },
  });
  assert.equal(blocked.status, 412);
  assert.equal(blocked.body.error.code, "PRECONDITION_FAILED");
});
