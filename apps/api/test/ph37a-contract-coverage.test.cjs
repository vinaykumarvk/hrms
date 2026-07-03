const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const { createFoundationApi, createFoundationServices } = require("../../../dist/apps/api/src");

const TOOL = path.join(__dirname, "../../../tools/contract-coverage.mjs");

function coverage() {
  const out = execFileSync("node", [TOOL, "--json"], { encoding: "utf8" });
  return JSON.parse(out);
}

test("PH-37A coverage tool: implemented total ties to the live kernel route registry", () => {
  const routes = createFoundationApi(createFoundationServices()).listRoutes();
  const record = coverage();
  assert.equal(record.implementedTotal, routes.length);
  // Per-module implemented counts sum to the total (no route dropped/double-counted).
  const summed = record.rows.reduce((acc, r) => acc + r.implemented, 0);
  assert.equal(summed, record.implementedTotal);
});

test("PH-37A coverage tool: contract total sums per-module and coverage is the ratio", () => {
  const record = coverage();
  const summedContract = record.rows.reduce((acc, r) => acc + r.contract, 0);
  assert.equal(summedContract, record.contractTotal);
  assert.equal(record.totalPct, Math.round((record.implementedTotal / record.contractTotal) * 1000) / 10);
});

test("PH-37A ratchet floor: coverage does not regress below the recorded baseline", () => {
  const record = coverage();
  // Ratchet floor recorded in docs/reviews/contract-coverage-20260703.md (PH-38A raised it to 397 / 30%).
  assert.ok(record.implementedTotal >= 397, `implemented routes ${record.implementedTotal} < floor 397`);
  assert.ok(record.totalPct >= 30, `coverage ${record.totalPct}% < floor 30%`);
});
