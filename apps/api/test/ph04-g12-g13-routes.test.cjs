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
  // PH-04A kernel replay: the same Idempotency-Key + payload returns the stored
  // first response verbatim without re-executing the ingest handler.
  assert.equal(replay.status, first.status);
  assert.deepEqual(replay.body, first.body);
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

test("PH-04C G12 timeline pages through the cursor helper with a computed next_cursor", () => {
  const api = createFoundationApi(createFoundationServices());
  for (let index = 1; index <= 3; index += 1) {
    const ingested = call(api, {
      method: "POST",
      path: "/api/v1/sr/ingest",
      headers: { "Idempotency-Key": `idem-g12-page-00${index}` },
      body: {
        ...srBody(`employee:identity:page:${index}`),
        factKey: `EMP:${ph03Ids.employee}|IDENTITY|page-${index}`,
      },
    });
    assert.equal(ingested.status, 201);
  }

  const pageOne = call(api, {
    method: "GET",
    path: `/api/v1/sr/employees/${ph03Ids.employee}/timeline`,
    query: { limit: "2" },
  });
  assert.equal(pageOne.status, 200);
  assert.equal(pageOne.body.items.length, 2);
  assert.equal(pageOne.body.limit, 2);
  assert.notEqual(pageOne.body.next_cursor, null);
  assert.deepEqual(
    pageOne.body.items.map((item) => item.sequenceNo),
    [1, 2]
  );

  const pageTwo = call(api, {
    method: "GET",
    path: `/api/v1/sr/employees/${ph03Ids.employee}/timeline`,
    query: { limit: "2", cursor: pageOne.body.next_cursor },
  });
  assert.equal(pageTwo.status, 200);
  assert.equal(pageTwo.body.items.length, 1);
  assert.equal(pageTwo.body.items[0].sequenceNo, 3);
  assert.equal(pageTwo.body.next_cursor, null);
});

test("PH-04C G12 reversal consumes the is_reversal envelope and appends without mutating the ledger", () => {
  const api = createFoundationApi(createFoundationServices());
  const original = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "Idempotency-Key": "idem-g12-rev-src-001" },
    body: srBody("employee:identity:rev:1"),
  });
  assert.equal(original.status, 201);

  const reversal = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest/reversal",
    headers: { "Idempotency-Key": "idem-g12-rev-env-001" },
    body: {
      is_reversal: true,
      reverses_source_reference_id: "employee:identity:rev:1",
      reason: "Order quashed by tribunal",
    },
  });
  assert.equal(reversal.status, 201);
  assert.equal(reversal.body.event.eventTypeCode, "REVERSAL");
  assert.equal(reversal.body.event.reversalOfEventId, original.body.event.id);
  assert.equal(reversal.body.event.payload.reverses_source_reference_id, "employee:identity:rev:1");

  // Append-only: the original event's CONTENT is untouched (entryHash unchanged) and both entries
  // remain on the timeline. Its status is a projection of the hash-chained sr_status_events
  // sub-ledger (PH-10A), where the reversal appended a SUPERSESSION transition — no field update.
  const originalAfter = call(api, { method: "GET", path: `/api/v1/sr/events/${original.body.event.id}` });
  assert.equal(originalAfter.status, 200);
  assert.equal(originalAfter.body.event.status, "SUPERSEDED");
  assert.equal(originalAfter.body.event.entryHash, original.body.event.entryHash);
  const timeline = call(api, { method: "GET", path: `/api/v1/sr/employees/${ph03Ids.employee}/timeline` });
  assert.equal(timeline.body.items.length, 2);

  const unknown = call(api, {
    method: "POST",
    path: "/api/v1/sr/ingest/reversal",
    headers: { "Idempotency-Key": "idem-g12-rev-env-002" },
    body: {
      is_reversal: true,
      reverses_source_reference_id: "employee:identity:rev:missing",
      reason: "No such source",
    },
  });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, "NOT_FOUND");
  assert.equal(unknown.body.error.details.messageId, "SR_REVERSAL_TARGET_NOT_FOUND");
});

test("PH-04C G13 :fetch requires intent and returns structurally different VIEW vs DOWNLOAD bodies", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-g13-fetch-doc-001" },
    body: {
      title: "Service book scan",
      ownerEmployeeId: ph03Ids.employee,
      classification: "CONFIDENTIAL",
      contentHash: "dddd1111dddd2222dddd3333dddd4444dddd5555dddd6666dddd7777dddd8888",
    },
  });
  assert.equal(created.status, 201);
  const documentId = created.body.document.id;

  // PH-10C FR-006: fetching a CONFIDENTIAL document now requires an ACTIVE security clearance
  // (deny-by-default). Grant one to the fixture actor; the DI-16 checker differs from the granter.
  const clearance = call(api, {
    method: "POST",
    path: "/api/v1/security-clearances",
    headers: { "Idempotency-Key": "idem-g13-fetch-clearance-001" },
    body: {
      principalType: "USER",
      principalRef: "user-ph04-g12-g13",
      clearanceLevel: "CONFIDENTIAL",
      justification: "Route-conformance fixture clearance",
      approvedBy: "user-ph04-clearance-checker",
    },
  });
  assert.equal(clearance.status, 201);
  assert.equal(clearance.body.clearance.status, "ACTIVE");

  const missingIntent = call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch` });
  assert.equal(missingIntent.status, 400);
  assert.equal(missingIntent.body.error.code, "VALIDATION_FAILED");
  assert.equal(missingIntent.body.error.field, "intent");
  assert.equal(missingIntent.body.error.details.messageId, "ERR-G13-FETCH_INTENT_REQUIRED");

  const invalidIntent = call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "PRINT" } });
  assert.equal(invalidIntent.status, 400);
  assert.equal(invalidIntent.body.error.details.messageId, "ERR-G13-FETCH_INTENT_REQUIRED");

  const view = call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(view.status, 200);
  assert.equal(view.body.fetch.intent, "VIEW");
  assert.ok(view.body.fetch.render.renderToken);
  assert.equal(view.body.fetch.render.watermarked, true);
  assert.equal(view.body.fetch.render.sessionBound, true);
  assert.ok(view.body.fetch.render.expiresInSeconds > 0);
  assert.equal(view.body.fetch.grant, undefined);

  const download = call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "DOWNLOAD" } });
  assert.equal(download.status, 200);
  assert.equal(download.body.fetch.intent, "DOWNLOAD");
  assert.equal(download.body.fetch.grant.right, "DOWNLOAD");
  assert.ok(download.body.fetch.grant.grantToken);
  assert.equal(download.body.fetch.render, undefined);
});

test("PH-04C G13 attach rejects DELETED/DISPOSED/ORPHANED targets (DI-14)", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const created = call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-g13-di14-doc-001" },
    body: {
      title: "Disposable memo",
      classification: "INTERNAL",
      contentHash: "eeee1111eeee2222eeee3333eeee4444eeee5555eeee6666eeee7777eeee8888",
    },
  });
  assert.equal(created.status, 201);
  const documentId = created.body.document.id;

  const scope = {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    actorUserId: "user-ph04-g12-g13",
    correlationId: "corr-ph04-g12-g13",
  };
  const disposed = services.documentVault.dispose(scope, documentId);
  assert.equal(disposed.status, "DISPOSED");

  const attach = call(api, {
    method: "POST",
    path: "/api/v1/documents:attach",
    headers: { "Idempotency-Key": "idem-g13-di14-attach-001" },
    body: {
      documentId,
      link: { moduleCode: "G09", entityName: "disciplinary_cases", entityRefId: "DC-DI14-001", linkRole: "EVIDENCE" },
    },
  });
  assert.equal(attach.status, 409);
  assert.equal(attach.body.error.code, "CONFLICT");
  assert.equal(attach.body.error.details.messageId, "ERR-G13-DOCUMENT_NOT_ATTACHABLE");
  assert.equal(attach.body.error.details.status, "DISPOSED");

  // No link was written on the rejected attach.
  const after = call(api, { method: "GET", path: `/api/v1/documents/${documentId}` });
  assert.equal(after.body.document.links.length, 0);
});
