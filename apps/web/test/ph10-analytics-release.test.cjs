const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// PH-10E: the G14 web surface is a real dashboard bound to the PH-10D KPI engine — live
// KPI tiles through the client, drill-down that keeps k-anonymity suppression applied at
// every level (the NEGATIVE test proves a suppressed cohort renders suppressed and the
// raw small count is absent from the DOM), and a freshness panel from datamart_refresh_logs.
// The audited static marker card (evidence-line / G14_READ_ONLY) is gone.

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g14Source = fs.readFileSync("apps/web/src/modules/g14/AnalyticsWorkspace.tsx", "utf8");

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

const { createHrmsClient, HrmsApiError } = loadTsModule("apps/web/src/api/hrmsClient.ts");
const { createFixtureHrmsClient } = loadTsModule("apps/web/src/api/fixtureHrmsClient.ts");
const {
  AnalyticsWorkspace,
  loadAnalyticsDashboard,
  isMartStale,
  MART_DRILL_DIMENSIONS,
  MART_FRESHNESS_SLA_MINUTES,
} = loadTsModule("apps/web/src/modules/g14/AnalyticsWorkspace.tsx");

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// --- 1) The audited static marker card is gone; the workspace binds the engine routes ---

test("PH-10E static marker card is gone and the workspace fetches live KPI/freshness data", () => {
  assert.equal(g14Source.includes("evidence-line"), false, "AnalyticsWorkspace still carries the evidence-line marker card");
  assert.equal(g14Source.includes("G14_READ_ONLY"), false, "AnalyticsWorkspace still renders the G14_READ_ONLY marker");
  for (const marker of [
    "listAnalyticsKpis",
    "queryKpiAggregate",
    "listMartRefreshLogs",
    "loadAnalyticsDashboard",
    "data-suppressed",
    "Drill-down",
    "Freshness (datamart_refresh_logs)",
    "onSubmit={handleDrillSubmit}",
    'kind === "loading"',
    'kind === "error"',
    '"empty"',
    "no-permission",
    'role="alert"',
  ]) {
    assert.equal(g14Source.includes(marker), true, `AnalyticsWorkspace missing ${marker}`);
  }
  assert.equal(appSource.includes("<AnalyticsWorkspace client={client}"), true, "App no longer injects the client into AnalyticsWorkspace");
});

test("PH-10E client and fixture expose the kpi, aggregate, and refresh-log engine routes", () => {
  for (const route of ["/api/v1/analytics/kpis", "/api/v1/analytics/aggregate", "/api/v1/analytics/datamarts/refresh-logs", "/api/v1/analytics/summary"]) {
    assert.equal(clientSource.includes(route), true, `client missing route ${route}`);
  }
  for (const method of ["listAnalyticsKpis", "queryKpiAggregate", "listMartRefreshLogs"]) {
    assert.equal(clientSource.includes(method), true, `client missing ${method}`);
    assert.equal(fixtureSource.includes(method), true, `fixture missing ${method}`);
  }
});

// --- 2) The real client GETs the engine endpoints and never reshapes suppressed values ---

test("PH-10E real client binds kpis, aggregate (paged cells flattened, nulls verbatim), and refresh logs", async () => {
  const calls = [];
  const responses = new Map([
    ["/api/v1/analytics/kpis", { items: [{ kpiCode: "KPI_X", status: "ACTIVE" }], limit: 25, next_cursor: null }],
    [
      "/api/v1/analytics/aggregate?martCode=MART_ESTABLISHMENT&dimension=cadreId",
      {
        martCode: "MART_ESTABLISHMENT",
        dimension: "cadreId",
        minCellSizeK: 5,
        cells: {
          items: [
            { key: "CADRE_A", value: 12, suppressed: false },
            { key: "CADRE_B", value: null, suppressed: true, suppressionReason: "ERR-G14-SMALL-CELL" },
          ],
          limit: 25,
          next_cursor: null,
        },
        total: null,
        suppressedCells: 1,
      },
    ],
    ["/api/v1/analytics/datamarts/refresh-logs", { items: [{ id: "mrl-1", martCode: "MART_LEAVE", status: "SUCCESS" }], limit: 25, next_cursor: null }],
  ]);
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      return jsonResponse(200, responses.get(String(url)));
    },
  });
  const kpis = await client.listAnalyticsKpis();
  const aggregate = await client.queryKpiAggregate("MART_ESTABLISHMENT", "cadreId");
  const logs = await client.listMartRefreshLogs();
  assert.deepEqual(
    calls.map((call) => call.url),
    ["/api/v1/analytics/kpis", "/api/v1/analytics/aggregate?martCode=MART_ESTABLISHMENT&dimension=cadreId", "/api/v1/analytics/datamarts/refresh-logs"]
  );
  assert.equal(calls.every((call) => call.method === "GET"), true, "engine reads must be GETs");
  assert.equal(kpis.items[0].kpiCode, "KPI_X");
  // Paged cells are flattened onto the engine aggregate shape; suppressed nulls stay null.
  assert.equal(Array.isArray(aggregate.cells), true);
  assert.equal(aggregate.cells[1].value, null);
  assert.equal(aggregate.cells[1].suppressed, true);
  assert.equal(aggregate.total, null);
  assert.equal(logs.items[0].martCode, "MART_LEAVE");
});

// --- 3) The fixture mirrors the engine's fail-closed k-anonymity boundary ---

test("PH-10E fixture aggregate suppresses small cohorts, applies complementary suppression, and withholds the total", async () => {
  const fixture = createFixtureHrmsClient();
  const suppressedAggregate = await fixture.queryKpiAggregate("MART_ESTABLISHMENT", "cadreId");
  const reserved = suppressedAggregate.cells.find((cell) => cell.key === "CADRE_RESERVED");
  assert.equal(reserved.suppressed, true);
  assert.equal(reserved.value, null, "the raw small count must never leave the fixture");
  assert.equal(reserved.suppressionReason, "ERR-G14-SMALL-CELL");
  // A lone suppressed cell would be recoverable by subtraction — the smallest visible
  // cohort is complementarily suppressed and the total withheld.
  const field = suppressedAggregate.cells.find((cell) => cell.key === "CADRE_FIELD");
  assert.equal(field.suppressed, true);
  assert.equal(field.value, null);
  assert.equal(field.suppressionReason, "ERR-G14-COMP-SUPPRESS");
  assert.equal(suppressedAggregate.total, null);
  assert.equal(suppressedAggregate.suppressedCells, 2);

  const openAggregate = await fixture.queryKpiAggregate("MART_LEAVE", "leaveTypeId");
  assert.equal(openAggregate.cells.every((cell) => !cell.suppressed), true);
  assert.equal(openAggregate.total, 16);

  await assert.rejects(
    () => fixture.queryKpiAggregate("MART_UNKNOWN", "status"),
    (error) => error instanceof HrmsApiError && error.code === "NOT_FOUND"
  );
});

test("PH-10E dashboard load binds ACTIVE KPIs to live aggregates and refresh logs to freshness", async () => {
  const fixture = createFixtureHrmsClient();
  const state = await loadAnalyticsDashboard(fixture);
  assert.equal(state.kind, "ready");
  // Only ACTIVE KPI definitions become tiles — the DRAFT appraisal KPI is filtered out.
  assert.deepEqual(
    state.tiles.map((tile) => tile.kpi.kpiCode),
    ["KPI_LEAVE_APPLICATIONS", "KPI_ATTENDANCE_DAYS", "KPI_SANCTIONED_POSTS"]
  );
  const leaveTile = state.tiles.find((tile) => tile.kpi.kpiCode === "KPI_LEAVE_APPLICATIONS");
  assert.equal(leaveTile.aggregate.total, 16, "leave KPI tile must carry the engine-computed value");
  const postsTile = state.tiles.find((tile) => tile.kpi.kpiCode === "KPI_SANCTIONED_POSTS");
  assert.equal(postsTile.aggregate.total, null, "the suppressed establishment aggregate withholds its total");

  // Freshness derives from datamart_refresh_logs: FAILED run and SLA-breach both flag stale.
  const byMart = new Map(state.freshness.map((mart) => [mart.martCode, mart]));
  assert.equal(byMart.get("MART_LEAVE").stale, false);
  assert.equal(byMart.get("MART_ATTENDANCE").stale, false);
  assert.equal(byMart.get("MART_APPRAISAL").stale, true, "a FAILED refresh must flag the mart stale");
  assert.equal(byMart.get("MART_ESTABLISHMENT").stale, true, "an SLA-breaching refresh must flag the mart stale");
  assert.equal(typeof byMart.get("MART_LEAVE").lastRefreshAt, "string");
});

test("PH-10E staleness rule follows the 60-minute SLA and fails closed on non-success runs", () => {
  const now = Date.parse("2026-07-03T12:00:00.000Z");
  const fresh = { id: "l1", martCode: "M", runType: "SCHEDULED", startedAt: "", finishedAt: "2026-07-03T11:30:00.000Z", status: "SUCCESS" };
  const breached = { ...fresh, finishedAt: "2026-07-03T10:30:00.000Z" };
  const failed = { ...fresh, status: "FAILED" };
  const running = { ...fresh, status: "RUNNING", finishedAt: undefined };
  assert.equal(MART_FRESHNESS_SLA_MINUTES, 60);
  assert.equal(isMartStale(fresh, now), false);
  assert.equal(isMartStale(breached, now), true);
  assert.equal(isMartStale(failed, now), true);
  assert.equal(isMartStale(running, now), true);
});

// --- 4) Rendered dashboard: live KPI binding, freshness, and the suppression NEGATIVE ---

test("PH-10E dashboard renders live KPI values and the freshness panel from refresh logs", async () => {
  const fixture = createFixtureHrmsClient();
  const state = await loadAnalyticsDashboard(fixture);
  const markup = renderToStaticMarkup(React.createElement(AnalyticsWorkspace, { client: fixture, initialState: state }));
  // Live KPI binding: engine-computed values, not hardcoded figures or marker strings.
  assert.match(markup, /Leave applications/);
  assert.match(markup, /16 applications/);
  assert.match(markup, /28 days/);
  assert.equal(markup.includes("G14_READ_ONLY"), false, "marker strings must not reach the DOM");
  // The suppressed establishment tile renders the suppression notice, never a number.
  assert.match(markup, /Sanctioned posts/);
  assert.match(markup, /data-suppressed="true"/);
  // Freshness panel: bound rows with stale flags for FAILED and SLA-breaching marts.
  assert.match(markup, /Freshness \(datamart_refresh_logs\)/);
  for (const mart of ["MART_LEAVE", "MART_ATTENDANCE", "MART_APPRAISAL", "MART_ESTABLISHMENT"]) {
    assert.equal(markup.includes(mart), true, `freshness panel missing ${mart}`);
  }
  const staleFlags = [...markup.matchAll(/data-stale="true"/g)];
  assert.equal(staleFlags.length, 2, "exactly MART_APPRAISAL and MART_ESTABLISHMENT must be flagged stale");
  assert.match(markup, /STALE/);
  assert.match(markup, /FAILED — Source contract g08\.v_apar_forms_v3 fetch failed/);
});

test("PH-10E NEGATIVE: a suppressed cohort renders suppressed and the raw small count is absent", async () => {
  const fixture = createFixtureHrmsClient();
  const state = await loadAnalyticsDashboard(fixture);
  const drillAggregate = await fixture.queryKpiAggregate("MART_ESTABLISHMENT", "cadreId");
  const markup = renderToStaticMarkup(
    React.createElement(AnalyticsWorkspace, { client: fixture, initialState: state, initialDrill: { kind: "ready", aggregate: drillAggregate } })
  );
  // POSITIVE: the suppressed cohorts appear with the suppression notice.
  assert.match(markup, /CADRE_RESERVED/);
  assert.match(markup, /Suppressed — cohort below k=5/);
  assert.match(markup, /complementary suppression/);
  assert.match(markup, /Withheld — 2 suppressed cohort\(s\)/);
  // NEGATIVE: the raw member counts of the suppressed cohorts (3 and 8) never reach the
  // DOM — not as a cell value anywhere, and not inside any suppressed rendering.
  assert.doesNotMatch(markup, />3</, "raw suppressed count 3 leaked into the drill-down markup");
  assert.doesNotMatch(markup, />8</, "raw complementary-suppressed count 8 leaked into the drill-down markup");
  const suppressedTexts = [...markup.matchAll(/data-suppressed="true"[^>]*>([^<]*)</g)].map((match) => match[1]);
  assert.equal(suppressedTexts.length >= 3, true, "expected suppressed tile + two suppressed drill cells");
  for (const text of suppressedTexts) {
    assert.doesNotMatch(text, /\b(3|8)\b/, `a suppressed rendering leaked a raw count: ${text}`);
  }
  // The visible cohort still renders its true value, so suppression is per-cell, not blanket.
  assert.match(markup, /CADRE_SECRETARIAT/);
  assert.match(markup, />12</);
  // And the wire shape itself never carried the raw counts.
  assert.equal(JSON.stringify(drillAggregate).includes('"value":3'), false);
  assert.equal(JSON.stringify(drillAggregate).includes('"value":8'), false);
});

test("PH-10E drill-down offers only cohort-grain dimensions the scope policy allows", () => {
  assert.deepEqual(MART_DRILL_DIMENSIONS.MART_LEAVE, ["leaveTypeId", "status"]);
  assert.deepEqual(MART_DRILL_DIMENSIONS.MART_ATTENDANCE, ["status"]);
  assert.deepEqual(MART_DRILL_DIMENSIONS.MART_ESTABLISHMENT, ["cadreId", "orgUnitId", "status"]);
  // Identifying grains are never offered as drill dimensions.
  for (const dimensions of Object.values(MART_DRILL_DIMENSIONS)) {
    assert.equal(dimensions.includes("employeeId"), false, "employeeId must not be a drill dimension");
    assert.equal(dimensions.includes("attendanceDate"), false, "attendanceDate must not be a drill dimension");
  }
  assert.equal(g14Source.includes("MART_APPRAISAL:"), false, "the PII appraisal mart must not offer drill dimensions");
});

// --- 5) Canonical states ---

test("PH-10E workspace renders the canonical loading, error, empty, and no-permission states", () => {
  const fixture = createFixtureHrmsClient();
  const loading = renderToStaticMarkup(React.createElement(AnalyticsWorkspace, { client: fixture }));
  assert.match(loading, /data-state="loading"/);
  const error = renderToStaticMarkup(
    React.createElement(AnalyticsWorkspace, { client: fixture, initialState: { kind: "error", errorCode: "INTERNAL_ERROR" } })
  );
  assert.match(error, /data-state="error"/);
  assert.match(error, /INTERNAL_ERROR/);
  const empty = renderToStaticMarkup(React.createElement(AnalyticsWorkspace, { client: fixture, initialState: { kind: "empty" } }));
  assert.match(empty, /data-state="empty"/);
  const noPermission = renderToStaticMarkup(
    React.createElement(AnalyticsWorkspace, { client: fixture, initialState: { kind: "no-permission", errorCode: "FORBIDDEN" } })
  );
  assert.match(noPermission, /data-state="no-permission"/);
  assert.match(noPermission, /g14\.analytics\.read/);
});

test("PH-10E dashboard load maps FORBIDDEN to no-permission and NOT_FOUND to empty", async () => {
  const forbiddenClient = {
    listAnalyticsKpis: () => Promise.reject(new HrmsApiError(403, { error: { code: "FORBIDDEN", message: "denied" } })),
  };
  const forbidden = await loadAnalyticsDashboard(forbiddenClient);
  assert.equal(forbidden.kind, "no-permission");
  const notFoundClient = {
    listAnalyticsKpis: () => Promise.reject(new HrmsApiError(404, { error: { code: "NOT_FOUND", message: "none" } })),
  };
  const notFound = await loadAnalyticsDashboard(notFoundClient);
  assert.equal(notFound.kind, "empty");
  const brokenClient = {
    listAnalyticsKpis: () => Promise.reject(new HrmsApiError(500, { error: { code: "INTERNAL_ERROR", message: "boom" } })),
  };
  const broken = await loadAnalyticsDashboard(brokenClient);
  assert.equal(broken.kind, "error");
  assert.equal(broken.errorCode, "INTERNAL_ERROR");
});
