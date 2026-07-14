const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createApiKernel,
  createFoundationServices,
  ok,
  created,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph04-kernel",
    actorUserId: "user-ph04-kernel",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph04-kernel",
    ...extra,
  };
}

function kernelWithProbeRoutes() {
  const kernel = createApiKernel(createFoundationServices());
  kernel.register({
    method: "GET",
    path: "/api/v1/kernel/items",
    operationId: "kernel.listItems",
    protected: true,
    permission: "kernel.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok({ limit: context.pagination.limit, next_cursor: null, items: [] }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/kernel/items",
    operationId: "kernel.createItem",
    protected: true,
    permission: "kernel.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => created({ idempotencyKey: context.idempotencyKey }),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/kernel/failure",
    operationId: "kernel.failure",
    protected: true,
    permission: "kernel.read",
    handler: () => {
      throw new Error("secret filesystem path /tmp/hrms");
    },
  });
  return kernel;
}

test("PH-04A kernel rejects missing actor with canonical envelope", async () => {
  const response = await kernelWithProbeRoutes().dispatch({ method: "GET", path: "/api/v1/kernel/items" });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
  assert.equal(response.headers["X-Correlation-Id"].startsWith("corr-"), true);
});

test("PH-04A kernel echoes correlation header and enforces permission", async () => {
  const kernel = kernelWithProbeRoutes();
  const allowed = await kernel.dispatch({
    method: "GET",
    path: "/api/v1/kernel/items",
    query: { limit: "250" },
    headers: { "X-Correlation-Id": "corr-client-001" },
    actor: actor(),
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers["X-Correlation-Id"], "corr-client-001");
  assert.equal(allowed.body.limit, 100);
  assert.equal(allowed.body.next_cursor, null);

  const denied = await kernel.dispatch({
    method: "GET",
    path: "/api/v1/kernel/items",
    actor: actor({ permissions: [] }),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");
});

test("PH-04A kernel requires idempotency key for unsafe routes", async () => {
  const kernel = kernelWithProbeRoutes();
  const missing = await kernel.dispatch({
    method: "POST",
    path: "/api/v1/kernel/items",
    actor: actor(),
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, "VALIDATION_FAILED");
  assert.equal(missing.body.error.field, "Idempotency-Key");

  const createdResponse = await kernel.dispatch({
    method: "POST",
    path: "/api/v1/kernel/items",
    headers: { "Idempotency-Key": "idem-kernel-001" },
    actor: actor(),
  });
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.body.idempotencyKey, "idem-kernel-001");
});

test("PH-04A kernel replays stored response for repeated Idempotency-Key without re-executing", async () => {
  const kernel = createApiKernel(createFoundationServices());
  let executions = 0;
  kernel.register({
    method: "POST",
    path: "/api/v1/kernel/replay-items",
    operationId: "kernel.createReplayItem",
    protected: true,
    permission: "kernel.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      executions += 1;
      return created({ executions, idempotencyKey: context.idempotencyKey });
    },
  });

  const requestShape = {
    method: "POST",
    path: "/api/v1/kernel/replay-items",
    headers: { "Idempotency-Key": "idem-replay-001" },
    body: { amount: 10 },
  };
  const first = await kernel.dispatch({ ...requestShape, actor: actor() });
  const second = await kernel.dispatch({ ...requestShape, actor: actor() });

  assert.equal(first.status, 201);
  assert.equal(second.status, first.status);
  assert.deepEqual(second.body, first.body);
  assert.equal(executions, 1, "handler side-effect must execute exactly once for a replayed key");

  const conflicting = await kernel.dispatch({ ...requestShape, body: { amount: 999 }, actor: actor() });
  assert.equal(conflicting.status, 409);
  assert.equal(conflicting.body.error.code, "CONFLICT");
  assert.equal(executions, 1);

  const freshKey = await kernel.dispatch({
    ...requestShape,
    headers: { "Idempotency-Key": "idem-replay-002" },
    actor: actor(),
  });
  assert.equal(freshKey.status, 201);
  assert.equal(executions, 2);
});

test("PH-04A kernel sanitizes internal failure output", async () => {
  const response = await kernelWithProbeRoutes().dispatch({
    method: "GET",
    path: "/api/v1/kernel/failure",
    actor: actor(),
  });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL");
  assert.equal(response.body.error.message, "Request failed");
  assert.equal(JSON.stringify(response.body).includes("/tmp/hrms"), false);
});
