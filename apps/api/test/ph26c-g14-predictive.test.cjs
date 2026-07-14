// PH-26C — G14 probabilistic predictive analytics + fairness (FR-18).
//   scoreAttrition computes a risk score from job features, EXCLUDING protected features (a protected
//   feature input is rejected); fairnessReport computes a disparity metric over a monitored
//   protected attribute for oversight only.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const ANALYST = "user-ph26c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: ANALYST,
    actorUserId: ANALYST,
    permissions: ["*"],
    roles: ["analytics_viewer"],
    fieldGrants: ["*"],
    correlationId: "corr-ph26c",
    ...extra,
  };
}

test("G14 attrition: risk is scored from job features and banded", async () => {
  const s = createFoundationServices();
  const high = s.predictiveAnalytics.scoreAttrition(actor(), {
    employeeId: "emp-1",
    features: { tenureMonths: 6, recentTransfers: 3, leaveUtilisationPct: 90, promotionGapMonths: 60 },
  });
  const low = s.predictiveAnalytics.scoreAttrition(actor(), {
    employeeId: "emp-2",
    features: { tenureMonths: 240, recentTransfers: 0, leaveUtilisationPct: 20, promotionGapMonths: 6 },
  });
  assert.ok(high.riskScore > low.riskScore);
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(high.band));
});

test("G14 attrition: a protected feature as a model input is rejected", async () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.predictiveAnalytics.scoreAttrition(actor(), {
      employeeId: "emp-3",
      features: { tenureMonths: 12, recentTransfers: 1, leaveUtilisationPct: 50, promotionGapMonths: 24, gender: "F" },
    }),
    (err) => err.code === "VALIDATION_FAILED" && /protected/.test(String(err.message))
  );
});

test("G14 fairness: disparity across a monitored protected attribute is computed and flagged", async () => {
  const s = createFoundationServices();
  const fair = s.predictiveAnalytics.fairnessReport(actor(), {
    attribute: "gender",
    observations: [
      { group: "A", riskScore: 0.40 },
      { group: "A", riskScore: 0.42 },
      { group: "B", riskScore: 0.41 },
    ],
  });
  assert.ok(fair.disparityRatio <= 1.25);
  assert.equal(fair.flagged, false);
  const skewed = s.predictiveAnalytics.fairnessReport(actor(), {
    attribute: "gender",
    observations: [
      { group: "A", riskScore: 0.20 },
      { group: "B", riskScore: 0.80 },
    ],
  });
  assert.ok(skewed.disparityRatio > 1.25);
  assert.equal(skewed.flagged, true);
});
