const test = require("node:test");
const assert = require("node:assert/strict");

const { FoundationError } = require("../../../dist/apps/api/src");
const { PgPensionRevisionRepository } = require("../../../dist/apps/api/src/modules/g11/pensionRevisionRepository");
const { PgDocumentSecurityRepository } = require("../../../dist/apps/api/src/modules/g13/documentSecurityRepository");
const { PgG09DueProcessRepository } = require("../../../dist/apps/api/src/modules/g09/dueProcessRepository");

// Verifies the remaining money/PII-critical Pg* repositories (G11 pension revision, G13 document
// security, G09 disciplinary due-process) at the SQL/parameter-binding layer via a stub pool —
// no live Postgres needed. Together with g04-pg-outbox-stub-pool and g10-pg-payroll-engine-stub-pool,
// this verifies the production DB persistence layer for every money/PII-critical module.

function capturingPool(rowFactory) {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      const out = rowFactory ? rowFactory(sql, params) : { rows: [{ id: "stub-id" }], rowCount: 1 };
      return out;
    },
  };
  return { pool, calls };
}

// ---- G11 pension revision -----------------------------------------------------------------------

test("G11 PgPensionRevisionRepository.insertBatch: binds the revision header columns (calcTrace JSON, status, createdBy) and returns the revisionId", async () => {
  const { pool, calls } = capturingPool(() => ({ rows: [{ id: "pen-rev-7" }], rowCount: 1 }));
  const repo = new PgPensionRevisionRepository(pool);
  const result = await repo.insertBatch(
    {
      tenantId: "t1", entityId: "e1", revisionNo: "REV-2026-1", revisionType: "PAY_COMMISSION",
      effectiveDate: "2026-01-01", jobRunRef: "job-1", daRateRef: "da-2", fitmentFactorTenThousandths: 10500,
      calcTrace: { rule: "E16" }, status: "DRAFT",
    },
    "pension-officer-1"
  );
  const params = calls[0].params;
  assert.equal(result.revisionId, "pen-rev-7");
  assert.equal(params[3], "PAY_COMMISSION", "revisionType bound");
  assert.equal(params[8], JSON.stringify({ rule: "E16" }), "calcTrace JSON-stringified");
  assert.equal(params[9], "DRAFT", "status bound");
  assert.equal(params[10], "pension-officer-1", "createdBy bound");
  assert.match(calls[0].sql, /revision/i);
});

// ---- G13 document security ----------------------------------------------------------------------

test("G13 PgDocumentSecurityRepository.saveClearance: binds the clearance columns (principal/level/grantedBy/approvedBy) and returns the id", async () => {
  const { pool, calls } = capturingPool(() => ({ rows: [{ id: "clr-9" }], rowCount: 1 }));
  const repo = new PgDocumentSecurityRepository(pool);
  const id = await repo.saveClearance({
    tenantId: "t1", entityId: "e1", principalType: "USER", principalRef: "emp-1",
    clearanceLevel: "CONFIDENTIAL", status: "ACTIVE", justification: "need-to-know",
    grantedBy: "granter-1", approvedBy: "approver-2", validFrom: "2026-01-01", validUntil: "2027-01-01",
  });
  const params = calls[0].params;
  assert.equal(id, "clr-9");
  assert.equal(params[2], "USER", "principalType bound");
  assert.equal(params[3], "emp-1", "principalRef bound");
  assert.equal(params[4], "CONFIDENTIAL", "clearanceLevel bound");
  assert.equal(params[7], "granter-1", "grantedBy bound");
  assert.equal(params[8], "approver-2", "approvedBy bound (DI-16 distinct checker recorded)");
  assert.match(calls[0].sql, /clearance/i);
});

test("G13 PgDocumentSecurityRepository.updateDisposition: binds (id, approvedBy, status, executedAt, evidenceHash)", async () => {
  const { pool, calls } = capturingPool(() => ({ rows: [], rowCount: 1 }));
  const repo = new PgDocumentSecurityRepository(pool);
  await repo.updateDisposition({ id: "disp-1", approvedBy: "approver-2", status: "EXECUTED", executedAt: "2026-07-14", evidenceHash: "abc" });
  const params = calls[0].params;
  assert.equal(params[0], "disp-1");
  assert.equal(params[1], "approver-2");
  assert.equal(params[2], "EXECUTED");
  assert.equal(params[4], "abc");
  assert.match(calls[0].sql, /disposition|UPDATE/i);
});

// ---- G09 disciplinary due-process ---------------------------------------------------------------

test("G09 PgG09DueProcessRepository.reviseSubsistenceRate: binds (tenant, id, newRatePct, nextRevisionDue, updatedBy) and throws when no row is updated", async () => {
  const ok = capturingPool(() => ({ rows: [], rowCount: 1 }));
  const repoOk = new PgG09DueProcessRepository(ok.pool);
  await repoOk.reviseSubsistenceRate({ tenantId: "t1", id: "susp-1", newRatePct: 50, nextRevisionDue: "2026-12-01", updatedBy: "da-1" });
  assert.equal(ok.calls[0].params[2], 50, "newRatePct bound");
  assert.equal(ok.calls[0].params[4], "da-1", "updatedBy bound");

  // rowCount === 0 -> the active-subsistence guard fires (async rejection).
  const empty = capturingPool(() => ({ rows: [], rowCount: 0 }));
  const repoEmpty = new PgG09DueProcessRepository(empty.pool);
  await assert.rejects(
    () => repoEmpty.reviseSubsistenceRate({ tenantId: "t1", id: "susp-missing", newRatePct: 50 }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED"
  );
});
