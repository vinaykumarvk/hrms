const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  createFoundationApi,
  createFoundationServices,
  minimumRouteSet,
} = require("../../../dist/apps/api/src");

test("PH-06 route registry exposes G03/G05 vertical-slice surfaces with protected permissions", () => {
  const api = createFoundationApi(createFoundationServices());
  const routes = api.listRoutes();
  for (const expected of [
    "POST /api/v1/atl/leave-applications",
    "POST /api/v1/atl/leave-applications/{id}/decision",
    "GET /api/v1/atl/leave-sr-outbox",
    "POST /api/v1/transfers/orders",
    "POST /api/v1/transfers/orders/{id}/approve",
    "POST /api/v1/transfers/orders/{id}/clearances/{clearance_code}:deem",
    "POST /api/v1/transfers/orders/{id}:relieve-and-join",
  ]) {
    assert.equal(routes.some((route) => `${route.method} ${route.path}` === expected && route.protected && route.permission.length > 0), true, expected);
    assert.equal(minimumRouteSet.includes(expected), true, expected);
  }
});

test("PH-06 docs bind vertical slices to existing state-machine contracts and evidence files", () => {
  const g03 = fs.readFileSync("docs/spec/vertical-slice-g03-leave.yaml", "utf8");
  const g05 = fs.readFileSync("docs/spec/vertical-slice-g05-transfer.yaml", "utf8");
  const plan = fs.readFileSync("docs/spec/ph-06-vertical-slice-implementation-plan.md", "utf8");
  for (const marker of ["REPORTING_CHAIN", "G04", "LEAVE_APPROVED", "P05", "X.2"]) {
    assert.equal(g03.includes(marker), true, marker);
  }
  for (const marker of ["POSITION_AUTHORITY", "PARALLEL_ALL_OF", "DEEMED_CLEARED", "TRANSFER_JOINED", "G13"]) {
    assert.equal(g05.includes(marker), true, marker);
  }
  assert.equal(plan.includes("PH-06E"), true);
  assert.equal(plan.includes("human gate"), true);
});
