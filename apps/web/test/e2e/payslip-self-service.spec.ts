import { expect, test } from "@playwright/test";

// Use case: "View payslips and payroll history — download payslips, check salary breakdowns, tax
// deductions (G10)". There is no self-service "create a payslip" UI action (payroll is an admin
// engine-run lifecycle), so this test builds one real payslip for the demo employee (Kiran,
// GOV-100246) directly through the same admin API calls apps/api/src/seed/testEmployeesSeed.ts
// uses (createPayComponent/createPayRule/addRateRow/enrolEmployee/createEngineRun/
// snapshotRunInputs/computeEngineRun/approveEngineRun/lockEngineRun), then views it through the
// real MyPayslipsPanel UI as the employee. Deliberately does NOT rely on HRMS_SEED_TEST_EMPLOYEES
// (would pull in the whole 6-employee fixture just for this one payslip, and was found to widen
// the shared workflow inbox in ways that destabilize an unrelated pre-existing responsive-layout
// test at the tablet breakpoint).

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const PERIOD = "2026-05";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(userId: string): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: userId, roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedOnePayslip(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const maker = adminToken("e2e-payroll-maker");
  const approver = adminToken("e2e-payroll-approver");
  const idem = (suffix: string) => ({ "Idempotency-Key": `idem-e2e-payslip-${suffix}` });

  const existing = await request.get(`/api/v1/payroll/employees/${KIRAN_EMPLOYEE_ID}/payslips`, { headers: { Authorization: `Bearer ${maker}` } });
  const existingBody = await existing.json();
  if (existingBody.items?.some((entry: { payslip: { period: string } }) => entry.payslip.period === PERIOD)) {
    return; // already seeded by a prior run in this worker
  }

  await request.post("/api/v1/payroll/pay-components", {
    headers: { Authorization: `Bearer ${maker}`, ...idem("comp-basic") },
    data: { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" },
  });
  await request.post("/api/v1/payroll/pay-components", {
    headers: { Authorization: `Bearer ${maker}`, ...idem("comp-pt") },
    data: { componentCode: "PT", name: "Professional Tax", category: "DEDUCTION", calcMethod: "SLAB" },
  });
  await request.post("/api/v1/payroll/pay-rules", {
    headers: { Authorization: `Bearer ${maker}`, ...idem("rule-basic") },
    data: { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" },
  });
  await request.post("/api/v1/payroll/pay-rules", {
    headers: { Authorization: `Bearer ${maker}`, ...idem("rule-pt") },
    data: { componentCode: "PT", calcMethod: "SLAB", computationOrder: 2, effectiveFrom: "2026-01-01" },
  });
  await request.post("/api/v1/payroll/rate-tables", {
    headers: { Authorization: `Bearer ${maker}`, ...idem("rate-1") },
    data: { tableType: "PT_SLAB", state: "KA", slabMinCents: 0, slabMaxCents: 1500000, flatAmountCents: 20000, effectiveFrom: "2026-01-01" },
  });
  await request.post("/api/v1/payroll/rate-tables", {
    headers: { Authorization: `Bearer ${maker}`, ...idem("rate-2") },
    data: { tableType: "PT_SLAB", state: "KA", slabMinCents: 1500001, flatAmountCents: 30000, effectiveFrom: "2026-01-01" },
  });
  await request.post(`/api/v1/payroll/employees/${KIRAN_EMPLOYEE_ID}/enrolments`, {
    headers: { Authorization: `Bearer ${maker}`, ...idem("enrol") },
    data: { stateOfPosting: "KA", componentAmountsCents: { BASIC: 5000000 }, effectiveFrom: "2026-01-01" },
  });

  const run = await (
    await request.post("/api/v1/payroll/engine-runs", { headers: { Authorization: `Bearer ${maker}`, ...idem("run") }, data: { period: PERIOD, runMode: "FINAL" } })
  ).json();
  const runId = run.run.id;
  await request.post(`/api/v1/payroll/engine-runs/${runId}:snapshot`, { headers: { Authorization: `Bearer ${maker}`, ...idem("snap") } });
  await request.post(`/api/v1/payroll/engine-runs/${runId}:compute`, { headers: { Authorization: `Bearer ${maker}`, ...idem("compute") } });
  await request.post(`/api/v1/payroll/engine-runs/${runId}:approve`, { headers: { Authorization: `Bearer ${approver}`, ...idem("approve") } });
  await request.post(`/api/v1/payroll/engine-runs/${runId}:lock`, { headers: { Authorization: `Bearer ${maker}`, ...idem("lock") } });
}

async function installKiranSession(page: import("@playwright/test").Page) {
  await page.addInitScript((employeeId) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g10.payroll.read"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: employeeId, name: "Kiran Patel", roles: ["employee"], permissions })}.local`
    );
  }, KIRAN_EMPLOYEE_ID);
}

test("@critical payslips: an employee views their own real payslip history and YTD breakdown", async ({ page, request }) => {
  await seedOnePayslip(request);
  await installKiranSession(page);
  await page.goto("/me/payslips");

  await expect(page.getByRole("heading", { name: "My Payslips" })).toBeVisible();
  const panel = page.getByRole("region", { name: "G10 my payslips" });
  await expect(panel.getByText(new RegExp(`PS-${PERIOD}`))).toBeVisible();
  await expect(panel.getByText("50000.00")).toBeVisible();

  await panel.getByRole("button", { name: "View breakdown" }).click();
  await expect(panel.getByText(/BASIC \(EARNING\)/)).toBeVisible();
  await expect(panel.getByText(/PT \(DEDUCTION\)/)).toBeVisible();
});

test("@critical payslips: an employee cannot view another employee's payslips through the API even if they try", async ({ request }) => {
  await seedOnePayslip(request);
  const otherEmployeeToken = `${encodeSegment({ alg: "none" })}.${encodeSegment({
    sub: "99999999-9999-9999-9999-999999999901",
    roles: ["employee"],
    permissions: ["g10.payroll.read"],
  })}.local`;
  const forbidden = await request.get(`/api/v1/payroll/employees/${KIRAN_EMPLOYEE_ID}/payslips`, {
    headers: { Authorization: `Bearer ${otherEmployeeToken}` },
  });
  expect(forbidden.status()).toBe(403);
});
