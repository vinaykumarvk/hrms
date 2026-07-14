const test = require("node:test");
const assert = require("node:assert/strict");

const { PgPayrollEngineRepository } = require("../../../dist/apps/api/src/modules/g10/payrollEngineRepository");

// Verifies the DB-backed G10 payroll-engine repository (the production persistence layer) issues
// correct parameterised SQL and interprets results correctly — WITHOUT a live Postgres (stub pool).
// Complements the G04 outbox stub-pool test: together they verify the money-critical Pg* repos at
// the SQL layer. The Pg* repos are async and unwired into the sync service layer (see final report),
// so they are unit-verified directly here against a capturing stub pool.

function capturingPool() {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 7, rows: [{ id: "stub-row-id", status: "COMPUTED", arrear_no: "ARR-1" }] };
    },
  };
  return { pool, calls };
}

test("PgPayrollEngineRepository.reverseRunPayslips: binds (tenant, run, supersededByPayslipId) and returns rowCount", async () => {
  const { pool, calls } = capturingPool();
  const repo = new PgPayrollEngineRepository(pool);
  const count = await repo.reverseRunPayslips("t1", "run-9", "payslip-3");
  assert.equal(count, 7, "returns the rowCount from the UPDATE");
  assert.equal(calls[0].params[0], "t1");
  assert.equal(calls[0].params[1], "run-9");
  assert.equal(calls[0].params[2], "payslip-3");
  assert.match(calls[0].sql, /payslip/i);
});

test("PgPayrollEngineRepository.insertArrear: binds the arrear columns (gross/net cents, status='COMPUTED') and returns the row", async () => {
  const { pool, calls } = capturingPool();
  const repo = new PgPayrollEngineRepository(pool);
  const row = await repo.insertArrear({
    tenantId: "t1", entityId: "e1", arrearNo: "ARR-2026-001", employeeId: "emp-1",
    arrearType: "PROMOTION_ARREAR", sourceReference: "g06:order-1", periodFrom: "2026-01",
    periodTo: "2026-06", grossArrearCents: 1200000, deductionArrearCents: 60000, netArrearCents: 1140000,
    monthWiseBreakupJson: "{}", createdBy: "payroll-officer-1",
  });
  const params = calls[0].params;
  assert.equal(params[0], "t1");
  assert.equal(params[2], "ARR-2026-001", "arrearNo bound");
  assert.equal(params[3], "emp-1", "employeeId bound");
  assert.equal(params[4], "PROMOTION_ARREAR", "arrearType bound");
  assert.equal(params[8], 1200000, "grossArrearCents bound");
  assert.equal(params[10], 1140000, "netArrearCents bound");
  assert.equal(params[12], "COMPUTED", "status defaults to COMPUTED");
  assert.equal(params[13], "payroll-officer-1", "createdBy bound");
  assert.ok(row && row.id, "returns the inserted row");
  assert.match(calls[0].sql, /arrear/i);
});

test("PgPayrollEngineRepository.insertCarryforward: binds carryforward columns (original/outstanding cents, status='OPEN')", async () => {
  const { pool, calls } = capturingPool();
  const repo = new PgPayrollEngineRepository(pool);
  await repo.insertCarryforward({
    tenantId: "t1", entityId: "e1", employeeId: "emp-1", sourceType: "RECOVERY",
    originalAmountCents: 250000, createdBy: "payroll-officer-1",
  });
  const params = calls[0].params;
  assert.equal(params[3], "RECOVERY", "sourceType bound");
  assert.equal(params[4], 250000, "originalAmountCents bound");
  assert.equal(params[5], 0, "recovered-to-date starts at 0");
  assert.equal(params[6], 250000, "outstanding starts at originalAmount");
  assert.equal(params[7], "OPEN", "status defaults to OPEN");
  assert.match(calls[0].sql, /carryforward/i);
});

test("PgPayrollEngineRepository.ytdFromPayslipLines: binds (tenant, employee) and returns the rows", async () => {
  const stubRows = [{ component_code: "BASIC", ytd_cents: 5000000 }];
  const pool = { query: async (sql, params) => {
    assert.equal(params[0], "t1");
    assert.equal(params[1], "emp-1");
    assert.match(sql, /payslip_line/i);
    return { rows: stubRows };
  } };
  const repo = new PgPayrollEngineRepository(pool);
  const rows = await repo.ytdFromPayslipLines("t1", "emp-1");
  assert.equal(rows, stubRows, "returns the YTD rows from payslip_lines");
});
