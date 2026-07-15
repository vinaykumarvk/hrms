const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const files = [
  "apps/web/src/modules/g01/EmployeeProfile.tsx",
  "apps/web/src/modules/g12/ServiceRegisterTimeline.tsx",
  "apps/web/src/modules/g13/DocumentVaultView.tsx",
];

const recordsSource = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

// --- Transpiling module loader so the real TS/TSX sources are exercised, not re-implemented ---

const moduleCache = new Map();

function resolveTsPath(candidate) {
  for (const suffix of ["", ".ts", ".tsx"]) {
    const withSuffix = `${candidate}${suffix}`;
    if (fs.existsSync(withSuffix) && fs.statSync(withSuffix).isFile()) {
      return withSuffix;
    }
  }
  throw new Error(`Cannot resolve TS module ${candidate}`);
}

function loadTsModule(candidate) {
  const resolved = path.resolve(resolveTsPath(candidate));
  if (moduleCache.has(resolved)) {
    return moduleCache.get(resolved).exports;
  }
  const source = fs.readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const moduleShim = { exports: {} };
  moduleCache.set(resolved, moduleShim);
  const localRequire = (specifier) =>
    specifier.startsWith(".") ? loadTsModule(path.join(path.dirname(resolved), specifier)) : require(specifier);
  new Function("exports", "module", "require", transpiled)(moduleShim.exports, moduleShim, localRequire);
  return moduleShim.exports;
}

const { HrmsApiError } = loadTsModule("apps/web/src/api/hrmsClient.ts");

const fixtureProfile = {
  id: "emp-000001",
  serviceNo: "GOV-100245",
  displayName: "Ananya Rao",
  employmentStatus: "ACTIVE",
  orgUnitId: "org-unit-0001",
  designation: "Deputy Collector",
  dateOfJoining: "2014-06-16",
  pan: "[HIDDEN]",
  aadhaarMasked: "xxxx-xxxx-1234",
  category: "[HIDDEN]",
  rowVersion: 3,
};

const timelinePages = {
  first: {
    items: [
      timelineEntry(1, "IDENTITY_CHANGE", "aaaa1111bbbb2222", "0000000000000000"),
      timelineEntry(2, "TRANSFER_JOINED", "cccc3333dddd4444", "aaaa1111bbbb2222"),
    ],
    limit: 2,
    next_cursor: "2",
  },
  second: {
    items: [timelineEntry(3, "PROMOTION_EFFECTED", "eeee5555ffff6666", "cccc3333dddd4444")],
    limit: 2,
    next_cursor: null,
  },
};

function timelineEntry(sequenceNo, eventTypeCode, entryHash, previousHash) {
  return {
    id: `sr-00000${sequenceNo}`,
    sequenceNo,
    employeeId: "emp-000001",
    sourceModule: "G01",
    eventTypeCode,
    eventDate: "2026-07-02",
    entryHash,
    previousHash,
    status: "ACTIVE",
  };
}

const fixtureDocuments = [
  {
    id: "doc-000001",
    docNo: "DOC/2026/0001001",
    title: "Aadhaar Proof - GOV-100245",
    status: "ACTIVE",
    classification: "CONFIDENTIAL",
    currentVersionNo: 4,
    isWorm: true,
    legalHold: true,
  },
  {
    id: "doc-000002",
    docNo: "DOC/2026/0001002",
    title: "Joining Report - GOV-100245",
    status: "ACTIVE",
    classification: "INTERNAL",
    currentVersionNo: 1,
    isWorm: false,
    legalHold: false,
  },
];

function recordingClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    client: {
      listEmployees: () => {
        calls.push({ method: "listEmployees" });
        return Promise.resolve({ items: [{ id: "emp-000001", serviceNo: "GOV-100245", displayName: "Ananya Rao", employmentStatus: "ACTIVE" }], limit: 25, next_cursor: null });
      },
      getEmployeeProfile: (employeeId) => {
        calls.push({ method: "getEmployeeProfile", employeeId });
        return Promise.resolve({ ...fixtureProfile });
      },
      getServiceRegisterTimeline: (employeeId, page = {}) => {
        calls.push({ method: "getServiceRegisterTimeline", employeeId, page });
        return Promise.resolve(page.cursor ? timelinePages.second : timelinePages.first);
      },
      listDocuments: () => {
        calls.push({ method: "listDocuments" });
        return Promise.resolve({ items: fixtureDocuments.map((document) => ({ ...document })), limit: 25, next_cursor: null });
      },
      ...overrides,
    },
  };
}

// --- Static conformance (PH-05A baseline markers stay in place) ---

test("PH-05D employee view records profile and masking evidence", () => {
  for (const marker of ["profile-360", "masked", "PII", "fieldGrants"]) {
    assert.equal(recordsSource.includes(marker), true, marker);
  }
});

test("PH-05D Service Register view exposes append-only chain cues", () => {
  for (const marker of ["append-only", "hash", "sequence", "provenance"]) {
    assert.equal(recordsSource.includes(marker), true, marker);
  }
});

test("PH-05D document view exposes retention and hold states", () => {
  for (const marker of ["legal hold", "retention", "Disposal disabled"]) {
    assert.equal(recordsSource.includes(marker), true, marker);
  }
});

// --- Behavioural: G01 profile is API-backed and renders masked PII ---

test("PH-05D profile view loads through the API client and renders the BRD field list with masked Aadhaar", async () => {
  const { loadEmployeeProfile, EmployeeProfile } = loadTsModule("apps/web/src/modules/g01/EmployeeProfile.tsx");
  const { calls, client } = recordingClient();

  const state = await loadEmployeeProfile(client);
  assert.equal(state.kind, "ready", "profile load resolves to the ready state");
  assert.deepEqual(
    calls.map((call) => call.method),
    ["listEmployees", "getEmployeeProfile"],
    "the view fetches through the client: employees list then profile-360"
  );
  assert.equal(calls[1].employeeId, "emp-000001");

  const markup = renderToStaticMarkup(React.createElement(EmployeeProfile, { client, initialState: state }));
  for (const field of ["GOV-100245", "Ananya Rao", "Deputy Collector", "org-unit-0001", "ACTIVE", "2014-06-16"]) {
    assert.equal(markup.includes(field), true, `profile renders ${field}`);
  }
  assert.equal(markup.includes("XXXX-XXXX-1234"), true, "Aadhaar renders in the masked XXXX-XXXX-1234 display form");
  assert.equal(markup.includes("[HIDDEN]"), true, "ungranted PAN renders the server-masked value verbatim");
  assert.equal(markup.includes("fieldGrants"), true, "masking is presented as fieldGrants-governed");
});

test("PH-05D profile view renders loading first and the sanitized envelope code on failure", async () => {
  const { loadEmployeeProfile, EmployeeProfile } = loadTsModule("apps/web/src/modules/g01/EmployeeProfile.tsx");
  const { client } = recordingClient();

  const loadingMarkup = renderToStaticMarkup(React.createElement(EmployeeProfile, { client }));
  assert.equal(loadingMarkup.includes('data-state="loading"'), true, "initial fetch renders the loading state");

  const { client: failing } = recordingClient({
    getEmployeeProfile: () => Promise.reject(new HrmsApiError(403, { error: { code: "FORBIDDEN", message: "denied" } })),
  });
  const errorState = await loadEmployeeProfile(failing);
  assert.deepEqual(errorState, { kind: "error", errorCode: "FORBIDDEN" });
  const errorMarkup = renderToStaticMarkup(React.createElement(EmployeeProfile, { client: failing, initialState: errorState }));
  assert.equal(errorMarkup.includes('data-state="error"'), true, "failed fetch renders the error state");
  assert.equal(errorMarkup.includes("FORBIDDEN"), true, "error state shows the envelope code, never a stack");
});

// --- Behavioural: G12 timeline pages by cursor with a load-more affordance ---

test("PH-05D timeline fetches cursor pages via the client and load-more appends the next window", async () => {
  const { loadTimelineFirstPage, loadTimelineNextPage, ServiceRegisterTimeline } = loadTsModule(
    "apps/web/src/modules/g12/ServiceRegisterTimeline.tsx"
  );
  const { calls, client } = recordingClient();

  const first = await loadTimelineFirstPage(client, undefined, 2);
  assert.equal(first.kind, "ready");
  assert.equal(first.items.length, 2, "first window holds one page of entries");
  assert.equal(first.nextCursor, "2", "next_cursor from PH-04C paging is retained");

  const firstMarkup = renderToStaticMarkup(React.createElement(ServiceRegisterTimeline, { client, initialState: first }));
  assert.equal(firstMarkup.includes("Load more"), true, "a further page exposes the load-more affordance");
  assert.equal(firstMarkup.includes("aaaa1111"), true, "hash-chain evidence (entryHash) stays visible");
  assert.equal(firstMarkup.includes("append-only"), true, "ledger semantics stay visible");

  const second = await loadTimelineNextPage(client, first, 2);
  assert.equal(second.kind, "ready");
  assert.equal(second.items.length, 3, "load-more appends the next window to the loaded entries");
  assert.equal(second.nextCursor, null, "the final window clears the cursor");

  const timelineCalls = calls.filter((call) => call.method === "getServiceRegisterTimeline");
  assert.deepEqual(
    timelineCalls.map((call) => call.page),
    [{ limit: 2 }, { limit: 2, cursor: "2" }],
    "the client is called with limit then limit+cursor"
  );

  const secondMarkup = renderToStaticMarkup(React.createElement(ServiceRegisterTimeline, { client, initialState: second }));
  assert.equal(secondMarkup.includes("Load more"), false, "no load-more once the ledger is exhausted");
  assert.equal(secondMarkup.includes("PROMOTION_EFFECTED"), true, "appended entries render");
});

test("PH-05D timeline renders loading and error branches", async () => {
  const { loadTimelineFirstPage, ServiceRegisterTimeline } = loadTsModule("apps/web/src/modules/g12/ServiceRegisterTimeline.tsx");
  const { client } = recordingClient();
  const loadingMarkup = renderToStaticMarkup(React.createElement(ServiceRegisterTimeline, { client }));
  assert.equal(loadingMarkup.includes('data-state="loading"'), true);

  const { client: failing } = recordingClient({
    getServiceRegisterTimeline: () => Promise.reject(new HrmsApiError(500, { error: { code: "INTERNAL_ERROR", message: "boom" } })),
  });
  const errorState = await loadTimelineFirstPage(failing);
  assert.deepEqual(errorState, { kind: "error", errorCode: "INTERNAL_ERROR" });
  const errorMarkup = renderToStaticMarkup(React.createElement(ServiceRegisterTimeline, { client: failing, initialState: errorState }));
  assert.equal(errorMarkup.includes('data-state="error"'), true);
  assert.equal(errorMarkup.includes("INTERNAL_ERROR"), true);
});

// --- Behavioural: G13 vault lists documents from the API with hold/retention/version state ---

test("PH-05D vault lists GET /api/v1/documents results with legal-hold, retention, and versions", async () => {
  const { loadDocumentVault, DocumentVaultView } = loadTsModule("apps/web/src/modules/g13/DocumentVaultView.tsx");
  const { calls, client } = recordingClient();

  const state = await loadDocumentVault(client);
  assert.equal(state.kind, "ready");
  assert.deepEqual(calls.map((call) => call.method), ["listDocuments"], "the vault fetches through the client");

  const markup = renderToStaticMarkup(React.createElement(DocumentVaultView, { client, initialState: state }));
  assert.equal(markup.includes("DOC/2026/0001001"), true, "API documents render");
  assert.equal(markup.includes("LEGAL HOLD"), true, "legal-hold state renders per document");
  assert.equal(markup.includes("WORM retention"), true, "retention state renders per document");
  assert.equal(markup.includes(">v4<"), true, "document version renders from the API");
});

test("PH-05D vault renders loading, error, and empty branches", async () => {
  const { loadDocumentVault, DocumentVaultView } = loadTsModule("apps/web/src/modules/g13/DocumentVaultView.tsx");
  const { client } = recordingClient();
  const loadingMarkup = renderToStaticMarkup(React.createElement(DocumentVaultView, { client }));
  assert.equal(loadingMarkup.includes('data-state="loading"'), true);

  const { client: failing } = recordingClient({
    listDocuments: () => Promise.reject(new HrmsApiError(403, { error: { code: "FORBIDDEN", message: "denied" } })),
  });
  const errorState = await loadDocumentVault(failing);
  assert.deepEqual(errorState, { kind: "error", errorCode: "FORBIDDEN" });
  const errorMarkup = renderToStaticMarkup(React.createElement(DocumentVaultView, { client: failing, initialState: errorState }));
  assert.equal(errorMarkup.includes('data-state="error"'), true);

  const { client: empty } = recordingClient({
    listDocuments: () => Promise.resolve({ items: [], limit: 25, next_cursor: null }),
  });
  const emptyState = await loadDocumentVault(empty);
  const emptyMarkup = renderToStaticMarkup(React.createElement(DocumentVaultView, { client: empty, initialState: emptyState }));
  assert.equal(emptyMarkup.includes('data-state="empty"'), true);
});
