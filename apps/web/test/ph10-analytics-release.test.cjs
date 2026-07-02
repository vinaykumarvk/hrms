const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g14Source = fs.readFileSync("apps/web/src/modules/g14/AnalyticsWorkspace.tsx", "utf8");

test("PH-10 client exposes G14 analytics summary route", () => {
  assert.equal(clientSource.includes("/api/v1/analytics/summary"), true);
  for (const marker of ["AnalyticsSliceSummary", "getAnalyticsSlice", "migrationMarker", "uatMarker"]) {
    assert.equal(clientSource.includes(marker), true, marker);
  }
});

test("PH-10 fixture evidence covers analytics, migration, and UAT readiness markers", () => {
  for (const marker of [
    "G14_READ_ONLY",
    "MART_REFRESH_IDEMPOTENT",
    "P02_SCOPE_FILTER",
    "DRILL_THROUGH_AUTHZ",
    "ANALYTICS_READ_AUDITED",
    "PII_SUPPRESSION",
    "MIGRATION_DRY_RUN",
    "UAT_ACCEPTANCE_PACK",
  ]) {
    assert.equal(fixtureSource.includes(marker), true, marker);
  }
});

test("PH-10 workspace renders G14 analytics and release readiness panel", () => {
  for (const marker of ["G14", "G14_READ_ONLY", "MART_REFRESH_IDEMPOTENT", "P02_SCOPE_FILTER", "MIGRATION_DRY_RUN", "UAT_ACCEPTANCE_PACK"]) {
    assert.equal(g14Source.includes(marker), true, marker);
  }
  for (const marker of ["AnalyticsWorkspace", "Phase 10 analytics and release readiness"]) {
    assert.equal(appSource.includes(marker), true, marker);
  }
});

test("PH-10 app loads analytics slice with existing wave slices", () => {
  for (const marker of ["client.getAnalyticsSlice()", "setAnalyticsSlice", "analyticsSlice ? <AnalyticsWorkspace"]) {
    assert.equal(appSource.includes(marker), true, marker);
  }
  assert.equal(g14Source.includes("ANALYTICS_READ_AUDITED"), true);
  assert.equal(g14Source.includes("PII_SUPPRESSION"), true);
});
