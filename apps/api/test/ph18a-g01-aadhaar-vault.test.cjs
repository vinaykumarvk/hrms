// PH-18A — G01 Aadhaar vault (FR-EPM-007).
//   aadhaar_vault stores only a one-way token + last-4 (never the raw 12 digits). Capture runs the
//   Verhoeff checksum (INVALID_AADHAAR on failure). Reveal is 4-eyes: the requester cannot approve
//   their own reveal; a distinct second principal approves and receives the masked last-4.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const CLERK = "user-ph18a-clerk";
const OFFICER = "user-ph18a-officer";
function actor(userId, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph18a",
    ...extra,
  };
}

const VALID_AADHAAR = "412345678900"; // Verhoeff-valid
const INVALID_AADHAAR = "412345678901"; // fails Verhoeff

test("G01 aadhaar_vault: capture tokenises and stores only the last-4, never the raw number", async () => {
  const s = createFoundationServices();
  const entry = s.aadhaarVault.captureAadhaar(actor(CLERK), { employeeId: ph03Ids.employee, rawAadhaar: VALID_AADHAAR });
  assert.equal(entry.lastFour, "8900");
  // The vault entry must not carry the raw Aadhaar anywhere.
  assert.ok(!JSON.stringify(entry).includes(VALID_AADHAAR));
  assert.ok(entry.token && entry.token.length === 64); // one-way SHA-256 token
});

test("G01 aadhaar_vault: an invalid Aadhaar (Verhoeff) is rejected fail-closed", async () => {
  const s = createFoundationServices();
  assert.throws(
    () => s.aadhaarVault.captureAadhaar(actor(CLERK), { employeeId: ph03Ids.employee, rawAadhaar: INVALID_AADHAAR }),
    (err) => err.code === "VALIDATION_FAILED" && /INVALID_AADHAAR|VERHOEFF/.test(String(err.message) + JSON.stringify(err.details || {}))
  );
});

test("G01 aadhaar_vault: reveal is 4-eyes — the requester cannot approve their own reveal", async () => {
  const s = createFoundationServices();
  const entry = s.aadhaarVault.captureAadhaar(actor(CLERK), { employeeId: ph03Ids.employee, rawAadhaar: VALID_AADHAAR });
  const req = s.aadhaarVault.requestReveal(actor(CLERK), entry.id, { purpose: "Pension KYC verification." });
  // Self-approval is blocked (dual authorisation).
  assert.throws(
    () => s.aadhaarVault.approveReveal(actor(CLERK), req.id),
    (err) => err.code === "FORBIDDEN"
  );
  // A distinct second principal approves and receives the masked last-4 only.
  const out = s.aadhaarVault.approveReveal(actor(OFFICER), req.id);
  assert.equal(out.request.status, "APPROVED");
  assert.equal(out.maskedAadhaar, "XXXX-XXXX-8900");
});
