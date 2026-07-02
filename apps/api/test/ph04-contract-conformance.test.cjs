const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  minimumRouteSet,
  apiContractSnapshot,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph04-conformance",
    actorUserId: "user-ph04-conformance",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph04-conformance",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph04-conformance", ...(request.headers ?? {}) },
    actor: request.includeActor === false ? undefined : actor(request.actor ?? {}),
  });
}

test("PH-04D route registry covers the frozen minimum contract set", () => {
  const routes = createFoundationApi(createFoundationServices()).listRoutes();
  const actual = new Set(routes.map((route) => `${route.method} ${route.path}`));
  for (const expected of minimumRouteSet) {
    assert.equal(actual.has(expected), true, expected);
  }
  assert.equal(apiContractSnapshot.basePath, "/api/v1");
  assert.equal(apiContractSnapshot.authHook, "Authorization.check");
  assert.equal(apiContractSnapshot.idempotencyHeader, "Idempotency-Key");
  assert.equal(apiContractSnapshot.correlationHeader, "X-Correlation-Id");
  assert.equal(apiContractSnapshot.pagination.next_cursor, null);
});

test("PH-04D route metadata is protected, permissioned, idempotent, and paginated where needed", () => {
  const routes = createFoundationApi(createFoundationServices()).listRoutes();
  assert.equal(routes.every((route) => route.protected === true), true);
  assert.equal(routes.every((route) => route.permission.length > 0), true);
  assert.equal(routes.filter((route) => route.unsafe).every((route) => route.requiresIdempotencyKey), true);
  assert.equal(
    routes
      .filter((route) => route.method === "GET" && (route.path === "/api/v1/employees" || route.path.endsWith("/timeline")))
      .every((route) => route.paginated),
    true
  );
});

test("PH-04D canonical error, auth, idempotency, pagination, and correlation behavior is stable", () => {
  const api = createFoundationApi(createFoundationServices());
  const noActor = call(api, { method: "GET", path: "/api/v1/employees", includeActor: false });
  assert.equal(noActor.status, 401);
  assert.equal(noActor.body.error.code, "UNAUTHENTICATED");
  assert.equal(noActor.headers["X-Correlation-Id"], "corr-ph04-conformance");

  const forbidden = call(api, { method: "GET", path: "/api/v1/employees", actor: { permissions: [] } });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, "FORBIDDEN");

  const missingIdem = call(api, {
    method: "POST",
    path: "/api/v1/documents",
    body: { title: "Missing key", classification: "INTERNAL", contentHash: "dddd1111dddd2222dddd3333dddd4444dddd5555dddd6666dddd7777dddd8888" },
  });
  assert.equal(missingIdem.status, 400);
  assert.equal(missingIdem.body.error.code, "VALIDATION_FAILED");

  const list = call(api, { method: "GET", path: "/api/v1/employees", query: { limit: "250" } });
  assert.equal(list.status, 200);
  assert.equal(list.body.limit, 100);
  assert.equal(list.body.next_cursor, null);
});
