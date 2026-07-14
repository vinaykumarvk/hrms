const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

// Use case: "Access personal documents — payslips, certificates, ID proofs, appointment letters
// in a secure vault (G13)". Exercised over HTTP against seedTestEmployees:true real data (Rohan's
// real seeded "Educational Certificate" document, CONFIDENTIAL, plus his real seeded security
// clearance), not mocked/hard-coded records.

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
  const sunita = services.employeeMaster.getByServiceNo(admin, "GOV-100303");
  return { services, api, admin, rohan, sunita };
}

function call(api, actorCtx, request) {
  return api.dispatch({ ...request, headers: { "X-Correlation-Id": "corr-g13-documents-self-service", ...(request.headers ?? {}) }, actor: actorCtx });
}

test("G13 documents: the seed produces a real CONFIDENTIAL certificate owned by Rohan", () => {
  const { api, rohan } = boot();
  const result = call(api, actor(rohan.id, ["g13.document.read"]), { method: "GET", path: `/api/v1/documents/employees/${rohan.id}` });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.items[0].classification, "CONFIDENTIAL");
  assert.match(result.body.items[0].title, /Educational Certificate/);
});

test("G13 documents: wire responses never leak internal tenantId/entityId fields", () => {
  const { api, rohan } = boot();
  const documents = call(api, actor(rohan.id, ["g13.document.read"]), { method: "GET", path: `/api/v1/documents/employees/${rohan.id}` }).body.items;
  for (const document of documents) {
    assert.equal("tenantId" in document, false);
    assert.equal("entityId" in document, false);
  }
});

test("G13 documents: an employee can list their own documents, but not another employee's", () => {
  const { api, rohan, sunita } = boot();
  const own = call(api, actor(rohan.id, ["g13.document.read"]), { method: "GET", path: `/api/v1/documents/employees/${rohan.id}` });
  assert.equal(own.status, 200);

  const strangerReads = call(api, actor(sunita.id, ["g13.document.read"]), { method: "GET", path: `/api/v1/documents/employees/${rohan.id}` });
  assert.equal(strangerReads.status, 403);
});

test("G13 documents: an hr_admin override role may list any employee's documents", () => {
  const { api, rohan } = boot();
  const hrAdminReads = call(api, actor("hr-admin-probe", ["g13.document.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: `/api/v1/documents/employees/${rohan.id}`,
  });
  assert.equal(hrAdminReads.status, 200);
  assert.equal(hrAdminReads.body.items.length, 1);
});

test("G13 documents: the seeded clearance lets Rohan view and download his own CONFIDENTIAL certificate", () => {
  const { api, rohan } = boot();
  const documents = call(api, actor(rohan.id, ["g13.document.read"]), { method: "GET", path: `/api/v1/documents/employees/${rohan.id}` }).body.items;
  const documentId = documents[0].id;

  const view = call(api, actor(rohan.id, ["g13.document.read"]), {
    method: "GET",
    path: `/api/v1/documents/${documentId}:fetch`,
    query: { intent: "VIEW" },
  });
  assert.equal(view.status, 200);
  assert.equal(view.body.fetch.render.watermarked, true);

  const download = call(api, actor(rohan.id, ["g13.document.read", "g13.document.download"]), {
    method: "GET",
    path: `/api/v1/documents/${documentId}:fetch`,
    query: { intent: "DOWNLOAD" },
  });
  assert.equal(download.status, 200);
  assert.equal(download.body.fetch.grant.right, "DOWNLOAD");
});

test("G13 documents: the general document list never surfaces another employee's owned documents to a plain employee (post-full-review CRITICAL fix)", () => {
  const { api, rohan, sunita } = boot();
  const rohanGeneralList = call(api, actor(rohan.id, ["g13.document.read"]), { method: "GET", path: "/api/v1/documents" });
  assert.equal(rohanGeneralList.status, 200);
  assert.ok(
    rohanGeneralList.body.items.every((document) => !document.ownerEmployeeId || document.ownerEmployeeId === rohan.id),
    "a plain employee's GET /api/v1/documents must never include another employee's owned document"
  );
  assert.ok(
    rohanGeneralList.body.items.some((document) => document.title.includes("Educational Certificate")),
    "Rohan's own certificate must still be visible through the general list"
  );

  // An hr_admin override role still sees every employee's documents through the same route.
  const hrAdminGeneralList = call(api, actor("hr-admin-general-list-probe", ["g13.document.read"], { roles: ["hr_admin"] }), {
    method: "GET",
    path: "/api/v1/documents",
  });
  assert.equal(hrAdminGeneralList.status, 200);
  assert.ok(hrAdminGeneralList.body.items.some((document) => document.ownerEmployeeId === sunita.id));
});

test("G13 documents: a CONFIDENTIAL clearance grant unlocks only the grantee's own documents, never another employee's at the same classification (post-full-review CRITICAL fix)", () => {
  const { api, rohan, sunita } = boot();
  const sunitaDocuments = call(api, actor(sunita.id, ["g13.document.read"]), {
    method: "GET",
    path: `/api/v1/documents/employees/${sunita.id}`,
  }).body.items;
  const sunitaDocumentId = sunitaDocuments[0].id;
  assert.equal(sunitaDocuments[0].classification, "CONFIDENTIAL");

  // Rohan holds a real seeded ACTIVE CONFIDENTIAL clearance (proven in the test above), but that
  // clearance must never unlock a document he does not own.
  const rohanFetchesSunitasDoc = call(api, actor(rohan.id, ["g13.document.read"]), {
    method: "GET",
    path: `/api/v1/documents/${sunitaDocumentId}:fetch`,
    query: { intent: "VIEW" },
  });
  assert.equal(rohanFetchesSunitasDoc.status, 403);
  assert.equal(rohanFetchesSunitasDoc.body.error.code, "FORBIDDEN");

  const rohanGetsSunitasDoc = call(api, actor(rohan.id, ["g13.document.read"]), {
    method: "GET",
    path: `/api/v1/documents/${sunitaDocumentId}`,
  });
  assert.equal(rohanGetsSunitasDoc.status, 403);
});

test("G13 documents: without a clearance grant, a CONFIDENTIAL document is denied even to a plain employee holding read/download permission", () => {
  const { api, sunita } = boot();
  const documents = call(api, actor(sunita.id, ["g13.document.read"]), { method: "GET", path: `/api/v1/documents/employees/${sunita.id}` }).body.items;
  const documentId = documents[0].id;

  const view = call(api, actor(sunita.id, ["g13.document.read"]), {
    method: "GET",
    path: `/api/v1/documents/${documentId}:fetch`,
    query: { intent: "VIEW" },
  });
  assert.equal(view.status, 403);
  assert.equal(view.body.error.code, "ERR-G13-CLEARANCE_INSUFFICIENT");
});
