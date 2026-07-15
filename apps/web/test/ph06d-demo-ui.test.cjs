const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const leaveWorkspaceSource = fs.readFileSync("apps/web/src/modules/g03/LeaveWorkspace.tsx", "utf8");
const leaveFormSource = fs.readFileSync("apps/web/src/modules/g03/LeaveApplyForm.tsx", "utf8");
const leaveInboxSource = fs.readFileSync("apps/web/src/modules/g03/LeaveApproverInbox.tsx", "utf8");
const transferWorkspaceSource = fs.readFileSync("apps/web/src/modules/g05/TransferWorkspace.tsx", "utf8");
const transferFormSource = fs.readFileSync("apps/web/src/modules/g05/TransferInitiateForm.tsx", "utf8");
const transferOrdersSource = fs.readFileSync("apps/web/src/modules/g05/TransferOrdersList.tsx", "utf8");

test("PH-06D G03 leave-apply form is a real controlled form submitting through the client", () => {
  for (const marker of [
    "<form",
    "onSubmit={handleFormSubmit}",
    "useForm(",
    "<input",
    "<select",
    "useState",
    "submitLeaveApplication",
    "crypto.randomUUID()",
    "LEAVE_OVERLAP",
    "INSUFFICIENT_BALANCE",
  ]) {
    assert.equal(leaveFormSource.includes(marker), true, `LeaveApplyForm missing ${marker}`);
  }
});

test("PH-06D G03 approver inbox wires Approve/Reject buttons to the decision route", () => {
  for (const marker of ["listLeaveApplications", "decideLeaveApplication", '"APPROVE"', '"REJECT"', "<button", "onClick"]) {
    assert.equal(leaveInboxSource.includes(marker), true, `LeaveApproverInbox missing ${marker}`);
  }
  assert.equal(clientSource.includes("/decision"), true, "client missing the leave decision route");
});

test("PH-06D G05 initiate-transfer form posts /api/v1/transfers/orders through the client", () => {
  for (const marker of [
    "<form",
    "onSubmit={handleFormSubmit}",
    "useForm(",
    "<input",
    "initiateTransferOrder",
    "crypto.randomUUID()",
  ]) {
    assert.equal(transferFormSource.includes(marker), true, `TransferInitiateForm missing ${marker}`);
  }
  for (const marker of ["listTransferOrders", "clearanceItems", "OPEN"]) {
    assert.equal(transferOrdersSource.includes(marker), true, `TransferOrdersList missing ${marker}`);
  }
});

test("PH-06D client binds the interactive G03/G05 routes", () => {
  for (const marker of ["/api/v1/atl/leave-applications", "/api/v1/atl/leave-types", "/api/v1/transfers/orders"]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-06D interactive surfaces render canonical loading/error/empty states", () => {
  for (const [name, source] of [
    ["LeaveApproverInbox", leaveInboxSource],
    ["TransferOrdersList", transferOrdersSource],
  ]) {
    for (const marker of ['"loading"', '"error"', '"empty"', "OperationalState"]) {
      assert.equal(source.includes(marker), true, `${name} missing ${marker}`);
    }
  }
  for (const [name, source] of [
    ["LeaveApplyForm", leaveFormSource],
    ["TransferInitiateForm", transferFormSource],
  ]) {
    for (const marker of ["isSubmitting", '"error"', '"success"', "role=\"alert\""]) {
      assert.equal(source.includes(marker), true, `${name} missing ${marker}`);
    }
  }
});

test("PH-06D workspaces mount the interactive surfaces next to the evidence panels", () => {
  for (const marker of ["LeaveApplyForm", "LeaveApproverInbox", "G03 leave vertical slice"]) {
    assert.equal(leaveWorkspaceSource.includes(marker), true, `LeaveWorkspace missing ${marker}`);
  }
  for (const marker of ["TransferInitiateForm", "TransferOrdersList", "G05 transfer vertical slice"]) {
    assert.equal(transferWorkspaceSource.includes(marker), true, `TransferWorkspace missing ${marker}`);
  }
});

test("PH-06D fixture client implements the interactive methods statefully", () => {
  for (const marker of [
    "listLeaveApplications",
    "submitLeaveApplication",
    "decideLeaveApplication",
    "listLeaveTypes",
    "listTransferOrders",
    "initiateTransferOrder",
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

test("PH-06D submitLeaveApplication POSTs the leave-applications route with an Idempotency-Key", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: JSON.parse(init.body) });
      return jsonResponse(201, {
        application: { applicationNo: "LA/2026/00009", status: "SUBMITTED" },
        balance: { availableBalance: 24 },
      });
    },
  });

  const result = await client.submitLeaveApplication(
    { employeeId: "emp-1", leaveTypeId: "EL", fromDate: "2026-08-03", toDate: "2026-08-05", reason: "Rest" },
    "idem-ph06d-001"
  );
  assert.equal(result.application.applicationNo, "LA/2026/00009");
  assert.equal(calls[0].url, "/api/v1/atl/leave-applications");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("Idempotency-Key"), "idem-ph06d-001");
  assert.equal(calls[0].body.fromDate, "2026-08-03");
});

test("PH-06D decideLeaveApplication POSTs the {id}/decision route with the decision verb", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return jsonResponse(202, { application: { applicationNo: "LA/2026/00009", status: "APPROVED" } });
    },
  });

  await client.decideLeaveApplication("leave-1", "APPROVE", "idem-ph06d-002");
  assert.equal(calls[0].url, "/api/v1/atl/leave-applications/leave-1/decision");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.decision, "APPROVE");
});

test("PH-06D initiateTransferOrder POSTs the transfers/orders route and surfaces the error envelope", async () => {
  const { createHrmsClient, HrmsApiError } = loadHrmsClientModule();
  const calls = [];
  const okClient = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return jsonResponse(201, { order: { orderNo: "TO/2026/00007", status: "PENDING_APPROVAL" } });
    },
  });
  const input = {
    employeeId: "emp-1",
    fromOrgUnitId: "org-1",
    toOrgUnitId: "org-2",
    orderDate: "2026-07-02",
    effectiveDate: "2026-07-20",
  };
  const result = await okClient.initiateTransferOrder(input, "idem-ph06d-003");
  assert.equal(result.order.orderNo, "TO/2026/00007");
  assert.equal(calls[0].url, "/api/v1/transfers/orders");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.toOrgUnitId, "org-2");

  const failingClient = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async () => jsonResponse(422, { error: { code: "VALIDATION_FAILED", message: "bad dates" } }),
  });
  await assert.rejects(
    () => failingClient.initiateTransferOrder(input, "idem-ph06d-004"),
    (error) => {
      assert.equal(error instanceof HrmsApiError, true);
      assert.equal(error.code, "VALIDATION_FAILED");
      return true;
    }
  );
});
