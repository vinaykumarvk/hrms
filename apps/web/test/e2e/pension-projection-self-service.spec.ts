import { expect, test } from "@playwright/test";

// Use case: "Check pension/retirement projections — for employees nearing retirement, view
// estimated benefits (G11)". PH-03 fixture identity: Kiran Patel (GOV-100246, employee id
// ph03Ids.employee). Seeds the tenant-wide E35/E36 pension rule rows via a direct API call (rule
// administration is an HR/pension-officer action with no self-service UI, matching the pattern in
// this session's other e2e specs), then logs in as Kiran and runs a real what-if estimate through
// the UI, supplying emoluments/qualifying-service directly (FR-G11-15 AC2) — so the test needs no
// pre-existing G10 last-drawn-pay feed for Kiran, matching the estimator's own non-binding design.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-pension-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedPensionRules(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const resolveCheck = await request.get("/api/v1/pension/rules/pension-limit-rules/resolve?asOf=2026-01-01", {
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  if (resolveCheck.ok()) {
    return;
  }
  await request.post("/api/v1/pension/rules/pension-limit-rules", {
    headers: { Authorization: `Bearer ${adminToken()}`, "Idempotency-Key": "idem-e2e-pension-limit-001" },
    data: { ruleCode: "E35-E2E", minPensionCents: 900000, maxPensionCents: 12500000, minQualifyingYearsForPension: 10, effectiveFrom: "2026-01-01" },
  });
  await request.post("/api/v1/pension/rules/rounding-rules", {
    headers: { Authorization: `Bearer ${adminToken()}`, "Idempotency-Key": "idem-e2e-rounding-001" },
    data: { ruleCode: "E36-E2E", effectiveFrom: "2026-01-01" },
  });
}

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

test("@critical pension-projection: an employee runs a non-binding what-if pension estimate for themselves", async ({ page, request }) => {
  await seedPensionRules(request);
  await loginEmployee(page);
  await page.goto("/me/pension");

  const pensionPanel = page.getByRole("region", { name: "G11 my pension estimate" });
  await expect(pensionPanel.getByRole("heading", { name: "My Pension Projection" })).toBeVisible();

  await pensionPanel.getByLabel("Scheme").selectOption("OPS");
  await pensionPanel.getByLabel("Projection date").fill("2050-08-05");
  await pensionPanel.getByLabel("Qualifying service months (optional what-if)").fill("300");
  await pensionPanel.getByLabel("Emoluments in cents (optional what-if)").fill("8000000");
  await pensionPanel.getByRole("button", { name: "Run estimate" }).click();

  const status = pensionPanel.getByRole("status");
  await expect(status).toContainText("Non-binding estimate");
  await expect(status).toContainText("FULL_PENSION");
  await expect(status).toContainText("300 months");
});

test("@critical pension-projection: the pre-existing admin pension console remains inaccessible to a plain employee session", async ({ page }) => {
  // Regression guard: /admin/pension-retirement must stay fully separate from the new
  // self-service surface — granting g11.pension.self.read must not widen admin access.
  await loginEmployee(page);
  await page.goto("/admin/pension-retirement");
  await expect(page.getByRole("heading", { name: "No permission" })).toBeVisible();
  await expect(page.getByText("Pension & Retirement", { exact: true })).toHaveCount(0);
});
