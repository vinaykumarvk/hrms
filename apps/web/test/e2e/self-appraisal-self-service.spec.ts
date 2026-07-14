import { expect, test } from "@playwright/test";

// Use case: "Submit self-appraisal (APAR/PMS) — annual performance review self-assessment (G08)".
// PH-03 fixture identities: Kiran Patel (GOV-100246, employee id ph03Ids.employee) reports to
// Ananya Rao (ph03Ids.manager). Builds one real open APAR form via a direct API call (opening a
// form is an HR/APAR-Cell admin action with no self-service UI, matching the pattern in this
// session's other e2e specs), then logs in as Kiran through the real UI to submit self-appraisal.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const MANAGER_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999901";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-apar-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedOneOpenForm(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const existing = await request.get(`/api/v1/apar/employees/${KIRAN_EMPLOYEE_ID}/forms`, {
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  const items = (await existing.json()).items ?? [];
  if (items.some((form: { status: string }) => form.status === "GOALS_PENDING")) {
    return;
  }
  await request.post("/api/v1/apar/forms", {
    headers: { Authorization: `Bearer ${adminToken()}`, "Idempotency-Key": "idem-e2e-apar-open-001" },
    data: {
      employeeId: KIRAN_EMPLOYEE_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      reportingOfficerId: MANAGER_EMPLOYEE_ID,
      reviewingOfficerId: MANAGER_EMPLOYEE_ID,
      acceptingAuthorityId: MANAGER_EMPLOYEE_ID,
    },
  });
}

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

test("@critical self-appraisal: an employee submits their own real open APAR form", async ({ page, request }) => {
  await seedOneOpenForm(request);
  await loginEmployee(page);
  await page.goto("/me/apar");

  const appraisalPanel = page.getByRole("region", { name: "G08 my appraisal" });
  await expect(appraisalPanel.getByText(/APAR\/\d{4}\/\d+.*GOALS_PENDING/)).toBeVisible();

  await appraisalPanel.getByLabel("Achievements narrative").fill("Delivered the Q2 migration ahead of schedule.");
  await appraisalPanel.getByRole("button", { name: "Submit self-appraisal" }).click();
  await expect(appraisalPanel.getByText(/APAR\/\d{4}\/\d+.*RO_ASSESSMENT/)).toBeVisible();
  await expect(appraisalPanel.getByText("Achievements: Delivered the Q2 migration ahead of schedule.")).toBeVisible();
});
