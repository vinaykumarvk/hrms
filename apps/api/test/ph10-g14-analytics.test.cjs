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
    userId: "user-ph10-g14",
    actorUserId: "user-ph10-g14",
    permissions: ["*"],
    roles: ["analytics_admin"],
    fieldGrants: [],
    correlationId: "corr-ph10-g14",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph10-g14", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-10 G14 refresh is G14_READ_ONLY and MART_REFRESH_IDEMPOTENT", async () => {
  const services = createFoundationServices();
  const beforeSr = services.serviceRegister.count(actor());
  const beforeAudit = services.audit.listAudit(actor()).length;
  const first = services.analytics.refreshMart(actor());
  const second = services.analytics.refreshMart(actor());
  assert.equal(first.marker, "MART_REFRESH_IDEMPOTENT");
  assert.equal(first.readOnlyMarker, "G14_READ_ONLY");
  assert.equal(second.id, first.id);
  assert.equal(services.analytics.summary(actor()).martRefreshes, 1);
  assert.equal(services.serviceRegister.count(actor()), beforeSr);
  assert.ok(services.audit.listAudit(actor()).length > beforeAudit);
});

test("PH-10 G14 dashboard applies P02_SCOPE_FILTER, PII_SUPPRESSION, and ANALYTICS_READ_AUDITED for read-only users", async () => {
  const services = createFoundationServices();
  const readOnlyActor = actor({
    permissions: ["g14.analytics.read"],
    roles: ["analytics_viewer"],
  });
  const dashboard = services.analytics.getDashboard(readOnlyActor);
  assert.equal(dashboard.marker, "G14_READ_ONLY");
  assert.equal(dashboard.scopeMarker, "P02_SCOPE_FILTER");
  assert.equal(dashboard.auditMarker, "ANALYTICS_READ_AUDITED");
  assert.equal(dashboard.piiMarker, "PII_SUPPRESSION");
  const serialized = JSON.stringify(dashboard);
  assert.equal(serialized.includes("ABCDE1234F"), false);
  assert.equal(serialized.includes("xxxx-xxxx-5678"), false);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G14_ANALYTICS_READ" && entry.metadata.marker === "ANALYTICS_READ_AUDITED"));
});

test("PH-10 G14 scope-leak matrix blocks out-of-entity dashboard rows", async () => {
  const services = createFoundationServices();
  const visible = services.analytics.getDashboard(actor());
  const hidden = services.analytics.getDashboard(actor({ entityId: "22222222-2222-2222-2222-222222222299" }));
  const visibleHeadcount = visible.mart.cards.find((card) => card.code === "EMPLOYEE_HEADCOUNT");
  const hiddenHeadcount = hidden.mart.cards.find((card) => card.code === "EMPLOYEE_HEADCOUNT");
  assert.equal(visibleHeadcount.value, 2);
  assert.equal(hiddenHeadcount.value, 0);
  assert.equal(hidden.scopeMarker, "P02_SCOPE_FILTER");
});

test("PH-10 G14 drill-through requires DRILL_THROUGH_AUTHZ and suppresses PII", async () => {
  const services = createFoundationServices();
  const drill = services.analytics.drillThrough(actor(), "EMPLOYEE_HEADCOUNT");
  assert.equal(drill.marker, "DRILL_THROUGH_AUTHZ");
  assert.equal(drill.scopeMarker, "P02_SCOPE_FILTER");
  assert.equal(drill.piiMarker, "PII_SUPPRESSION");
  assert.equal(drill.rows.length, 2);
  assert.equal(JSON.stringify(drill).includes("aadhaar"), false);
  assert.equal(JSON.stringify(drill).includes("pan"), false);
});

test("PH-10 G14 routes expose dashboard, mart refresh, drill-through, and data-health", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const refresh = await call(api, {
    method: "POST",
    path: "/api/v1/analytics/marts:refresh",
    headers: { "Idempotency-Key": "idem-ph10-g14-refresh-001" },
    body: {},
  });
  assert.equal(refresh.status, 202);
  assert.equal(refresh.body.mart.marker, "MART_REFRESH_IDEMPOTENT");
  const dashboard = await call(api, { method: "GET", path: "/api/v1/analytics/dashboards/executive-readiness" });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.dashboard.marker, "G14_READ_ONLY");
  const drill = await call(api, {
    method: "GET",
    path: "/api/v1/analytics/drill-through",
    query: { widgetCode: "EMPLOYEE_HEADCOUNT" },
  });
  assert.equal(drill.status, 200);
  assert.equal(drill.body.marker, "DRILL_THROUGH_AUTHZ");
  const health = await call(api, { method: "GET", path: "/api/v1/analytics/data-health" });
  assert.equal(health.status, 200);
  assert.equal(health.body.reconciliationStatus, "RECONCILED");
});
