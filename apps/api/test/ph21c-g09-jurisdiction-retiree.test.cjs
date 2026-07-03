// PH-21C — G09 jurisdiction transfer + retiree Rule-9 bar (FR-026).
//   A case's jurisdiction can be transferred (re-resolved) with an audited chain; a proceeding
//   against a retiree beyond the Rule-9 four-year bar (no sanction) is barred.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const DA = "user-ph21c";
function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: DA,
    actorUserId: DA,
    permissions: ["*"],
    roles: ["disciplinary_authority"],
    fieldGrants: ["*"],
    correlationId: "corr-ph21c",
    ...extra,
  };
}

test("G09 jurisdiction transfer: re-resolves the authority and records the chain", () => {
  const s = createFoundationServices();
  s.jurisdictionRetiree.setInitialJurisdiction(actor(), { caseId: "case-1", authorityId: "auth-A" });
  const moved = s.jurisdictionRetiree.transferJurisdiction(actor(), { caseId: "case-1", toAuthorityId: "auth-B", reason: "Officer transferred to a new circle." });
  assert.equal(moved.currentAuthorityId, "auth-B");
  assert.equal(moved.transferChain.length, 1);
  assert.equal(moved.transferChain[0].fromAuthorityId, "auth-A");
});

test("G09 retiree Rule-9: a proceeding beyond four years without sanction is barred", () => {
  const s = createFoundationServices();
  // Event 2019, institution 2026 => >4 years, retiree, no sanction -> barred.
  assert.throws(
    () => s.jurisdictionRetiree.assertRetireeProceedingPermitted(actor(), {
      isRetiree: true,
      eventDate: "2019-01-10",
      institutionDate: "2026-01-10",
      hasSanction: false,
    }),
    (err) => err.code === "ERR-G09-RETIREE-PROCEEDING-BARRED"
  );
  // With sanction on record -> permitted.
  const ok = s.jurisdictionRetiree.assertRetireeProceedingPermitted(actor(), {
    isRetiree: true,
    eventDate: "2019-01-10",
    institutionDate: "2026-01-10",
    hasSanction: true,
  });
  assert.equal(ok.permitted, true);
  // Within four years -> permitted without sanction.
  const recent = s.jurisdictionRetiree.assertRetireeProceedingPermitted(actor(), {
    isRetiree: true,
    eventDate: "2024-06-01",
    institutionDate: "2026-06-01",
    hasSanction: false,
  });
  assert.equal(recent.yearsSinceEvent, 2);
});
