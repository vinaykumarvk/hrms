const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const contactsSource = fs.readFileSync("apps/web/src/modules/g01/EmployeeContactsPanel.tsx", "utf8");
const dependentsSource = fs.readFileSync("apps/web/src/modules/g01/EmployeeDependentsPanel.tsx", "utf8");
const editorSource = fs.readFileSync("apps/web/src/modules/g02/ChangeRequestEditor.tsx", "utf8");
const queueSource = fs.readFileSync("apps/web/src/modules/g02/ChangeRequestApproverQueue.tsx", "utf8");
const diffSource = fs.readFileSync("apps/web/src/modules/g02/ChangeRequestDiffView.tsx", "utf8");
const selfServiceSource = fs.readFileSync("apps/web/src/modules/g03/SelfServiceSummary.tsx", "utf8");

test("PH-07E G01 contact and dependent panels are real controlled forms with submit handlers", () => {
  for (const [name, source, method] of [
    ["EmployeeContactsPanel", contactsSource, "addEmployeeContact"],
    ["EmployeeDependentsPanel", dependentsSource, "addEmployeeDependent"],
  ]) {
    for (const marker of ["<form", "<input", "<select", "useState", method, "crypto.randomUUID()"]) {
      assert.equal(source.includes(marker), true, `${name} missing ${marker}`);
    }
    for (const marker of ['"loading"', '"error"', '"empty"', "OperationalState"]) {
      assert.equal(source.includes(marker), true, `${name} missing canonical state ${marker}`);
    }
  }
});

test("PH-07E G02 change-request editor submits through the client and surfaces error envelopes", () => {
  for (const marker of [
    "<form",
    "onSubmit={handleFormSubmit}",
    "useForm(",
    "createPersonalDetailChangeRequest",
    "crypto.randomUUID()",
    '"error"',
    '"success"',
    'role="alert"',
  ]) {
    assert.equal(editorSource.includes(marker), true, `ChangeRequestEditor missing ${marker}`);
  }
});

test("PH-07E G02 approver queue wires approve/reject/send-back with a mandatory comment", () => {
  for (const marker of [
    "listPersonalDetailChangeRequests",
    "decidePersonalDetailChangeRequest",
    '"approve"',
    '"reject"',
    '"send-back"',
    "ERR-REASON-REQ",
    "<button",
    "onClick",
  ]) {
    assert.equal(queueSource.includes(marker), true, `ChangeRequestApproverQueue missing ${marker}`);
  }
  for (const marker of ['"loading"', '"error"', '"empty"', "OperationalState"]) {
    assert.equal(queueSource.includes(marker), true, `ChangeRequestApproverQueue missing canonical state ${marker}`);
  }
});

test("PH-07E G02 diff view renders the masked field-level diff exactly as the API returns it", () => {
  for (const marker of ["getPersonalDetailChangeRequestDiff", "field.masked", "field.oldValue", "field.newValue", '"loading"', '"error"', '"empty"']) {
    assert.equal(diffSource.includes(marker), true, `ChangeRequestDiffView missing ${marker}`);
  }
  assert.equal(queueSource.includes("ChangeRequestDiffView"), true, "approver queue does not mount the diff view");
});

test("PH-07E G03 SelfServiceSummary fetches balances and applications via the client", () => {
  for (const marker of ["SelfServiceSummary", "getLeaveBalance", "listLeaveApplications", '"loading"', '"error"', '"empty"', "OperationalState"]) {
    assert.equal(selfServiceSource.includes(marker), true, `SelfServiceSummary missing ${marker}`);
  }
});

test("PH-07E App mounts the interactive employee-wave surfaces behind route guards", () => {
  for (const marker of [
    "EmployeeContactsPanel",
    "EmployeeDependentsPanel",
    "ChangeRequestEditor",
    "ChangeRequestApproverQueue",
    "SelfServiceSummary",
  ]) {
    assert.equal(appSource.includes(marker), true, `App missing ${marker}`);
  }
});

test("PH-07E fixture client implements the new interactive methods statefully", () => {
  for (const marker of [
    "listEmployeeContacts",
    "addEmployeeContact",
    "listEmployeeDependents",
    "addEmployeeDependent",
    "listPersonalDetailChangeRequests",
    "createPersonalDetailChangeRequest",
    "decidePersonalDetailChangeRequest",
    "getPersonalDetailChangeRequestDiff",
    "getLeaveBalance",
    "ERR-REASON-REQ",
  ]) {
    assert.equal(fixtureSource.includes(marker), true, `fixture missing ${marker}`);
  }
});

// --- Behavioural coverage: transpile the real TS client and exercise the new methods against a stubbed fetch ---

function loadHrmsClientModule() {
  const ts = require("typescript");
  const transpiled = ts.transpileModule(clientSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleShim = { exports: {} };
  new Function("exports", "module", "require", transpiled)(moduleShim.exports, moduleShim, require);
  return moduleShim.exports;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("PH-07E addEmployeeContact POSTs the PH-07A contacts route with an Idempotency-Key", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: JSON.parse(init.body) });
      return jsonResponse(201, { contact: { id: "cont-1", contactType: "MOBILE", contactValue: "+91-1", isPrimary: true } });
    },
  });

  const result = await client.addEmployeeContact("emp-1", { contactType: "MOBILE", contactValue: "+91-1", isPrimary: true }, "idem-ph07e-001");
  assert.equal(result.contact.id, "cont-1");
  assert.equal(calls[0].url, "/api/v1/employees/emp-1/contacts");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("Idempotency-Key"), "idem-ph07e-001");
  assert.equal(calls[0].body.contactType, "MOBILE");
});

test("PH-07E addEmployeeDependent POSTs the PH-07A dependents route", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return jsonResponse(201, { dependent: { id: "dep-1", fullName: "Meera Rao", relationship: "SPOUSE" } });
    },
  });

  const result = await client.addEmployeeDependent("emp-1", { fullName: "Meera Rao", relationship: "SPOUSE", isLegalHeir: true }, "idem-ph07e-002");
  assert.equal(result.dependent.fullName, "Meera Rao");
  assert.equal(calls[0].url, "/api/v1/employees/emp-1/dependents");
  assert.equal(calls[0].body.isLegalHeir, true);
});

test("PH-07E createPersonalDetailChangeRequest POSTs the G02 create route", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return jsonResponse(201, { request: { id: "g02-1", requestNo: "G02/00002", status: "IN_REVIEW", sensitivity: "LOW" } });
    },
  });

  const result = await client.createPersonalDetailChangeRequest(
    { employeeId: "emp-1", fieldCode: "displayName", newValue: "Ananya R. Rao", reason: "Gazette correction" },
    "idem-ph07e-003"
  );
  assert.equal(result.request.requestNo, "G02/00002");
  assert.equal(calls[0].url, "/api/v1/personal-details/change-requests");
  assert.equal(calls[0].body.fieldCode, "displayName");
});

test("PH-07E decidePersonalDetailChangeRequest POSTs :send-back with the mandatory comment", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return jsonResponse(202, { request: { id: "g02-1", requestNo: "G02/00002", status: "RETURNED" } });
    },
  });

  const result = await client.decidePersonalDetailChangeRequest("g02-1", "send-back", "Attach the gazette copy", "idem-ph07e-004");
  assert.equal(result.request.status, "RETURNED");
  assert.equal(calls[0].url, "/api/v1/personal-details/change-requests/g02-1:send-back");
  assert.equal(calls[0].body.comment, "Attach the gazette copy");
});

test("PH-07E a missing decision comment surfaces the ERR-REASON-REQ envelope via messageId", async () => {
  const { createHrmsClient, HrmsApiError } = loadHrmsClientModule();
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async () =>
      jsonResponse(400, {
        error: { code: "VALIDATION_FAILED", message: "A decision comment is required", details: { messageId: "ERR-REASON-REQ" } },
      }),
  });

  await assert.rejects(
    () => client.decidePersonalDetailChangeRequest("g02-1", "reject", undefined, "idem-ph07e-005"),
    (error) => {
      assert.equal(error instanceof HrmsApiError, true);
      assert.equal(error.code, "VALIDATION_FAILED");
      assert.equal(error.messageId, "ERR-REASON-REQ");
      assert.equal(error.displayCode, "ERR-REASON-REQ");
      return true;
    }
  );
});

test("PH-07E getPersonalDetailChangeRequestDiff GETs the diff route and keeps masked values as returned", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init?.method });
      return jsonResponse(200, {
        changeRequestId: "g02-1",
        requestNo: "G02/00002",
        status: "IN_REVIEW",
        revisionNo: 1,
        fields: [{ fieldCode: "pan", displayLabel: "PAN", sensitivity: "HIGH", oldValue: "[HIDDEN]", newValue: "[HIDDEN]", masked: true }],
      });
    },
  });

  const diff = await client.getPersonalDetailChangeRequestDiff("g02-1");
  assert.equal(calls[0].url, "/api/v1/change-requests/g02-1/diff");
  assert.equal(diff.fields[0].masked, true);
  assert.equal(diff.fields[0].oldValue, "[HIDDEN]");
  assert.equal(diff.fields[0].newValue, "[HIDDEN]");
});

test("PH-07E getLeaveBalance GETs the leave-balances route with query filters", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url) => {
      calls.push({ url: String(url) });
      return jsonResponse(200, { balance: { employeeId: "emp-1", leaveTypeId: "EL", leaveYear: 2026, availableBalance: 27 } });
    },
  });

  const balance = await client.getLeaveBalance("emp-1", "EL");
  assert.equal(calls[0].url, "/api/v1/atl/leave-balances?employeeId=emp-1&leaveTypeId=EL");
  assert.equal(balance.availableBalance, 27);
});
