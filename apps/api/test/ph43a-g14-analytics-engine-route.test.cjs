const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const MAKER_ID = "user-ph43a-maker";
const CHECKER_ID = "user-ph43a-checker";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: MAKER_ID,
    actorUserId: MAKER_ID,
    permissions: ["*"],
    roles: ["analytics_admin"],
    fieldGrants: [],
    correlationId: "corr-ph43a",
    ...extra,
  };
}

function checker() {
  return actor({ userId: CHECKER_ID, actorUserId: CHECKER_ID });
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph43a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function defineActiveKpi(services, kpiCode) {
  services.analyticsEngine.defineKpi(actor(), {
    kpiCode,
    name: "Attendance days captured",
    description: "Count of captured attendance day records",
    domain: "ATTENDANCE",
    sourceMartCode: "MART_ATTENDANCE",
    expression: "COUNT(*)",
    unit: "COUNT",
    grain: "ORG_UNIT",
  });
  services.analyticsEngine.activateKpi(checker(), { kpiCode, version: 1 });
}

test("PH-43A G14 set KPI target + read KPI series through the kernel", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  defineActiveKpi(services, "ATT_DAYS");

  const target = call(api, {
    method: "POST",
    path: "/api/v1/analytics/kpis/ATT_DAYS/targets",
    headers: { "Idempotency-Key": "kpi-tgt-1" },
    body: { targetValue: 20, effectiveFrom: "2026-07-01" },
  });
  assert.equal(target.status, 201);
  assert.equal(target.body.target.targetValue, 20);
  assert.equal(target.body.target.status, "ACTIVE");

  const series = call(api, { method: "GET", path: "/api/v1/analytics/kpis/ATT_DAYS/series", query: { periodKeys: "2026-06,2026-07" } });
  assert.equal(series.status, 200);
  assert.equal(series.body.kpiCode, "ATT_DAYS");
  assert.ok(Array.isArray(series.body.points));
});

test("PH-43A G14 analytics-engine read endpoints respond through the kernel", () => {
  const api = createFoundationApi(createFoundationServices());
  for (const path of ["/api/v1/analytics/datamarts", "/api/v1/analytics/scope-policies", "/api/v1/analytics/attrition-scores"]) {
    const res = call(api, { method: "GET", path });
    assert.equal(res.status, 200, path);
    assert.ok(Array.isArray(res.body.items), path);
  }
});

test("PH-43A G14 drill-cohort route requires dimension and key (VALIDATION_FAILED)", () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = call(api, { method: "GET", path: "/api/v1/analytics/datamarts/MART_ATTENDANCE/cohort", query: { dimension: "orgUnit" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");
});
