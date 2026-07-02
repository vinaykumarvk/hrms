const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const files = [
  "apps/web/src/workflow/Inbox.tsx",
  "apps/web/src/workflow/TaskDetail.tsx",
  "apps/web/src/workflow/TaskActionPanel.tsx",
  "apps/web/src/workflow/WorkflowWorkspace.tsx",
  "apps/web/src/workflow/WorkflowConfigConsole.tsx",
  "apps/web/src/workflow/workflowConfigModel.ts",
  "apps/web/src/workflow/taskActions.ts",
  "apps/web/src/workflow/inboxState.ts",
];

const workflowSource = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

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

function recordingClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    client: {
      listWorkflowTasks: () => Promise.resolve({ items: [], limit: 25, next_cursor: null }),
      actOnWorkflowTask: (taskId, verb, body, idempotencyKey) => {
        calls.push({ grain: "task", targetId: taskId, verb, body, idempotencyKey });
        return Promise.resolve({ accepted: true });
      },
      actOnWorkflowInstance: (instanceId, verb, body, idempotencyKey) => {
        calls.push({ grain: "instance", targetId: instanceId, verb, body, idempotencyKey });
        return Promise.resolve({ accepted: true });
      },
      ...overrides,
    },
  };
}

const fixtureTask = { id: "task-000001", instanceId: "workflow-000001", stage: "PENDING_MANAGER", status: "PENDING" };

// --- Static conformance (PH-05C baseline markers) ---

test("PH-05C workflow action panel exposes all P01 actions including claim", () => {
  for (const marker of ["claim", "approve", "reject", "send-back", "delegate", "cancel", "query", "advance"]) {
    assert.equal(workflowSource.toLowerCase().includes(marker), true, marker);
  }
});

test("PH-05C workflow task UI enforces reason and history evidence", () => {
  for (const marker of ["mandatory reason", "audit history", "Task detail", "Inbox"]) {
    assert.equal(workflowSource.includes(marker), true, marker);
  }
});

test("PH-05C workflow config supports YAML lifecycle commands", () => {
  for (const marker of ["YAML", "validate", "simulate", "submit for review", "publish", "maker-checker", "evidence export"]) {
    assert.equal(workflowSource.includes(marker), true, marker);
  }
});

test("PH-05C task actions are a real form submitting through the client, not a CustomEvent hack", () => {
  const panelSource = fs.readFileSync("apps/web/src/workflow/TaskActionPanel.tsx", "utf8");
  assert.equal(panelSource.includes("<form"), true, "TaskActionPanel renders a <form>");
  assert.equal(panelSource.includes("onSubmit"), true, "TaskActionPanel wires onSubmit");
  assert.equal(workflowSource.includes("CustomEvent"), false, "the window CustomEvent dispatch hack is gone");
});

// --- Behavioural: mandatory comment refusal on the submit path ---

test("PH-05C reject refuses to submit without a mandatory comment and never calls the API", async () => {
  const { validateTaskAction, submitTaskAction } = loadTsModule("apps/web/src/workflow/taskActions.ts");
  for (const action of ["reject", "send-back", "cancel"]) {
    const fieldError = validateTaskAction({ action, reason: "   " });
    assert.equal(typeof fieldError, "string", `${action} without reason yields a field error`);
    assert.equal(fieldError.includes("mandatory"), true, `${action} error names the mandatory rule`);
    const { calls, client } = recordingClient();
    const result = await submitTaskAction(client, fixtureTask, { action, reason: "" }, "idem-refuse");
    assert.equal(result.kind, "invalid", `${action} submission is refused`);
    assert.equal(calls.length, 0, `${action} refusal never reaches the client`);
  }
  assert.equal(validateTaskAction({ action: "approve", reason: "" }), null, "approve does not demand a reason");
});

// --- Behavioural: form submission invokes the PH-04B task action routes through the client ---

test("PH-05C submit path calls the task-grain PH-04B routes with idempotency key", async () => {
  const { submitTaskAction } = loadTsModule("apps/web/src/workflow/taskActions.ts");
  const { calls, client } = recordingClient();

  assert.deepEqual(await submitTaskAction(client, fixtureTask, { action: "claim", reason: "" }, "idem-1"), { kind: "submitted" });
  assert.deepEqual(await submitTaskAction(client, fixtureTask, { action: "approve", reason: "ok to approve" }, "idem-2"), { kind: "submitted" });
  assert.deepEqual(await submitTaskAction(client, fixtureTask, { action: "reject", reason: "missing evidence" }, "idem-3"), { kind: "submitted" });
  assert.deepEqual(
    await submitTaskAction(client, fixtureTask, { action: "delegate", reason: "on leave", delegateTo: "user-77" }, "idem-4"),
    { kind: "submitted" }
  );

  assert.deepEqual(
    calls.map((call) => [call.grain, call.targetId, call.verb, call.idempotencyKey]),
    [
      ["task", "task-000001", "claim", "idem-1"],
      ["task", "task-000001", "approve", "idem-2"],
      ["task", "task-000001", "reject", "idem-3"],
      ["task", "task-000001", "delegate", "idem-4"],
    ]
  );
  assert.equal(calls[2].body.reason, "missing evidence");
  assert.equal(calls[3].body.toUserId, "user-77");
});

test("PH-05C send-back routes to the parent instance action endpoint", async () => {
  const { submitTaskAction } = loadTsModule("apps/web/src/workflow/taskActions.ts");
  const { calls, client } = recordingClient();
  const result = await submitTaskAction(client, fixtureTask, { action: "send-back", reason: "needs correction" }, "idem-5");
  assert.deepEqual(result, { kind: "submitted" });
  assert.deepEqual(calls, [
    { grain: "instance", targetId: "workflow-000001", verb: "send-back", body: { reason: "needs correction" }, idempotencyKey: "idem-5" },
  ]);
});

test("PH-05C API failure on submit surfaces the sanitized envelope error code", async () => {
  const { HrmsApiError } = loadTsModule("apps/web/src/api/hrmsClient.ts");
  const { submitTaskAction } = loadTsModule("apps/web/src/workflow/taskActions.ts");
  const { client } = recordingClient({
    actOnWorkflowTask: () => Promise.reject(new HrmsApiError(403, { error: { code: "FORBIDDEN", message: "denied" } })),
  });
  const result = await submitTaskAction(client, fixtureTask, { action: "approve", reason: "" }, "idem-6");
  assert.deepEqual(result, { kind: "failed", errorCode: "FORBIDDEN" });
});

// --- Behavioural: inbox loading / error / empty states ---

test("PH-05C inbox load catches HrmsApiError into the canonical error state", async () => {
  const { HrmsApiError } = loadTsModule("apps/web/src/api/hrmsClient.ts");
  const { loadInboxTasks } = loadTsModule("apps/web/src/workflow/inboxState.ts");
  const failing = { listWorkflowTasks: () => Promise.reject(new HrmsApiError(500, { error: { code: "INTERNAL_ERROR", message: "boom" } })) };
  assert.deepEqual(await loadInboxTasks(failing), { kind: "error", errorCode: "INTERNAL_ERROR" });
  const succeeding = { listWorkflowTasks: () => Promise.resolve({ items: [fixtureTask], limit: 25, next_cursor: null }) };
  assert.deepEqual(await loadInboxTasks(succeeding), { kind: "ready", tasks: [fixtureTask] });
});

test("PH-05C workspace renders OperationalState loading, error with retry, and empty inbox", () => {
  const { WorkflowWorkspace } = loadTsModule("apps/web/src/workflow/WorkflowWorkspace.tsx");
  const { Inbox } = loadTsModule("apps/web/src/workflow/Inbox.tsx");
  const { client } = recordingClient();

  const loadingMarkup = renderToStaticMarkup(React.createElement(WorkflowWorkspace, { client }));
  assert.equal(loadingMarkup.includes('data-state="loading"'), true, "initial fetch renders the loading state");

  const errorMarkup = renderToStaticMarkup(
    React.createElement(WorkflowWorkspace, { client, initialState: { kind: "error", errorCode: "FORBIDDEN" } })
  );
  assert.equal(errorMarkup.includes('data-state="error"'), true, "failed fetch renders the error state");
  assert.equal(errorMarkup.includes("FORBIDDEN"), true, "error state shows the envelope code");
  assert.equal(errorMarkup.includes("Retry"), true, "error state offers a retry affordance");

  const emptyMarkup = renderToStaticMarkup(React.createElement(Inbox, { tasks: [], onSelectTask: () => undefined }));
  assert.equal(emptyMarkup.includes('data-state="empty"'), true, "clear queue renders the empty state");
});

test("PH-05C ready workspace renders the task action form with mandatory-reason semantics", () => {
  const { WorkflowWorkspace } = loadTsModule("apps/web/src/workflow/WorkflowWorkspace.tsx");
  const { client } = recordingClient();
  const markup = renderToStaticMarkup(
    React.createElement(WorkflowWorkspace, { client, initialState: { kind: "ready", tasks: [fixtureTask] } })
  );
  assert.equal(markup.includes("<form"), true, "task actions render inside a real <form>");
  assert.equal(markup.includes("Submit action"), true, "form has a submit control");
  assert.equal(markup.includes("Reason / comment"), true, "reason field is labelled");
  assert.equal(markup.includes("mandatory reason"), false, "approve default keeps reason optional");
  assert.equal(markup.includes("Task detail"), true, "selected task detail renders");
});
