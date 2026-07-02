const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const packageSource = fs.readFileSync("package.json", "utf8");

test("PH-05A API client binds the PH-04 route families", () => {
  for (const marker of [
    "/api/v1/workflow/tasks",
    "/api/v1/employees",
    "/api/v1/sr/ingest",
    "/api/v1/documents",
    "X-Correlation-Id",
    "Idempotency-Key",
  ]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-05A fixture adapter mirrors the contract envelope shape", () => {
  assert.equal(fixtureSource.includes("fixture"), true);
  assert.equal(fixtureSource.includes("next_cursor"), true);
  assert.equal(fixtureSource.includes("semanticDuplicate"), true);
});

test("PH-05A root package exposes web verification scripts", () => {
  const packageJson = JSON.parse(packageSource);
  assert.equal(typeof packageJson.scripts["web:typecheck"], "string");
  assert.equal(typeof packageJson.scripts["web:build"], "string");
  assert.equal(typeof packageJson.scripts["web:test"], "string");
  assert.equal(typeof packageJson.scripts["web:check"], "string");
});

test("PH-05A App composition root consumes the real client, not the fixture", () => {
  const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
  assert.equal(appSource.includes("createHrmsClient"), true);
  assert.equal(appSource.includes("createFixtureHrmsClient"), false);
});

// --- Behavioural coverage: transpile the real TS client and exercise it against a stubbed fetch ---

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

test("PH-05A client injects Authorization bearer token, correlation id, and config base URL", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    baseUrl: "https://hrms.example.gov/",
    correlationId: "corr-test-001",
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init.headers) });
      return jsonResponse(200, { items: [], limit: 20, next_cursor: null });
    },
  });

  const page = await client.listEmployees();
  assert.equal(page.next_cursor, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hrms.example.gov/api/v1/employees");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer session-token-123");
  assert.equal(calls[0].headers.get("X-Correlation-Id"), "corr-test-001");
});

test("PH-05A client omits Authorization when no session token is available", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => null,
    fetcher: async (url, init) => {
      calls.push({ headers: new Headers(init.headers) });
      return jsonResponse(200, { items: [], limit: 20, next_cursor: null });
    },
  });

  await client.listWorkflowTasks();
  assert.equal(calls[0].headers.has("Authorization"), false);
});

test("PH-05A client throws typed HrmsApiError carrying the envelope code on non-2xx", async () => {
  const { createHrmsClient, HrmsApiError } = loadHrmsClientModule();
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async () => jsonResponse(403, { error: { code: "FORBIDDEN", message: "denied" } }),
  });

  await assert.rejects(
    () => client.listDocuments(),
    (error) => {
      assert.equal(error instanceof HrmsApiError, true);
      assert.equal(error.status, 403);
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.message.includes("FORBIDDEN"), true);
      assert.equal(error.message.includes("denied"), false);
      return true;
    }
  );
});

test("PH-05A client sends Idempotency-Key on unsafe calls", async () => {
  const { createHrmsClient } = loadHrmsClientModule();
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ method: init.method, headers: new Headers(init.headers) });
      return jsonResponse(200, { accepted: true });
    },
  });

  await client.ingestServiceRegister(
    {
      sourceModule: "G03",
      sourceReferenceId: "ref-1",
      sourceEventVersion: 1,
      employeeId: "emp-1",
      eventTypeCode: "LEAVE_APPROVED",
      eventDate: "2026-07-02",
      payload: {},
    },
    "idem-key-001"
  );
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("Idempotency-Key"), "idem-key-001");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer session-token-123");
});
