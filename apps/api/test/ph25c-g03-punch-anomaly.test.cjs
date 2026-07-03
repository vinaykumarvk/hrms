// PH-25C — G03 punch anomaly review (FR-20).
//   punch_anomaly_reviews flag impossible-travel between two punches; a reviewer resolves FLAGGED ->
//   CONFIRMED_FRAUD / VALID, and the subject cannot review their own case (SoD).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const REVIEWER = "user-ph25c-reviewer";
const SUBJECT = "user-ph25c-subject";
function actor(userId, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["*"],
    roles: ["attendance_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph25c",
    ...extra,
  };
}

// Delhi and Chennai ~1760 km apart; 10 minutes between punches is impossible.
const DELHI = { lat: 28.6139, lon: 77.209 };
const CHENNAI = { lat: 13.0827, lon: 80.2707 };
const t0 = 1_760_000_000_000;

test("G03 punch_anomaly_reviews: impossible travel is FLAGGED and resolves to CONFIRMED_FRAUD", () => {
  const s = createFoundationServices();
  const flagged = s.punchAnomaly.screenPunchPair(actor(REVIEWER), {
    employeeId: SUBJECT,
    punchA: { ...DELHI, atEpochMs: t0 },
    punchB: { ...CHENNAI, atEpochMs: t0 + 10 * 60 * 1000 },
  });
  assert.ok(flagged);
  assert.equal(flagged.anomalyType, "IMPOSSIBLE_TRAVEL");
  assert.equal(flagged.status, "FLAGGED");
  const resolved = s.punchAnomaly.resolveReview(actor(REVIEWER), flagged.id, { decision: "CONFIRMED_FRAUD", note: "No approved tour; buddy punch suspected." });
  assert.equal(resolved.status, "CONFIRMED_FRAUD");
});

test("G03 punch_anomaly_reviews: a plausible commute is not flagged", () => {
  const s = createFoundationServices();
  const near = s.punchAnomaly.screenPunchPair(actor(REVIEWER), {
    employeeId: SUBJECT,
    punchA: { ...DELHI, atEpochMs: t0 },
    punchB: { lat: 28.7041, lon: 77.1025, atEpochMs: t0 + 60 * 60 * 1000 }, // ~15km in 1h
  });
  assert.equal(near, null);
});

test("G03 punch_anomaly_reviews: the subject cannot review their own case (SoD)", () => {
  const s = createFoundationServices();
  const flagged = s.punchAnomaly.screenPunchPair(actor(REVIEWER), {
    employeeId: SUBJECT,
    punchA: { ...DELHI, atEpochMs: t0 },
    punchB: { ...CHENNAI, atEpochMs: t0 + 5 * 60 * 1000 },
  });
  assert.throws(
    () => s.punchAnomaly.resolveReview(actor(SUBJECT), flagged.id, { decision: "VALID", note: "self" }),
    (err) => err.code === "FORBIDDEN"
  );
});
