import { expect, test } from "@playwright/test";

// Use case: "Access personal documents — payslips, certificates, ID proofs, appointment letters
// in a secure vault (G13)". PH-03 fixture identity: Kiran Patel (GOV-100246, employee id
// ph03Ids.employee). Builds one real document owned by Kiran via a direct API call (document
// creation is an upload/records action with no self-service ingestion UI, matching the pattern
// in this session's other e2e specs), classified INTERNAL so it's viewable/downloadable without
// a separate clearance-grant step, then logs in as Kiran through the real UI to list, view, and
// download it — and confirms a stranger's document never appears in Kiran's own list.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const STRANGER_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999901";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-documents-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedOneDocument(request: import("@playwright/test").APIRequestContext, ownerEmployeeId: string, title: string): Promise<void> {
  const existing = await request.get(`/api/v1/documents/employees/${ownerEmployeeId}`, { headers: { Authorization: `Bearer ${adminToken()}` } });
  const items = (await existing.json()).items ?? [];
  if (items.some((document: { title: string }) => document.title === title)) {
    return;
  }
  await request.post("/api/v1/documents", {
    headers: { Authorization: `Bearer ${adminToken()}`, "Idempotency-Key": `idem-e2e-doc-${ownerEmployeeId}-001` },
    data: { title, ownerEmployeeId, classification: "INTERNAL", content: `Synthetic e2e content for ${title}` },
  });
}

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

test("@critical personal-documents: an employee lists, views, and downloads only their own real document", async ({ page, request }) => {
  await seedOneDocument(request, KIRAN_EMPLOYEE_ID, "Appointment Letter — Kiran Patel (E2E)");
  await seedOneDocument(request, STRANGER_EMPLOYEE_ID, "Appointment Letter — Ananya Rao (E2E)");
  await loginEmployee(page);
  await page.goto("/me/documents");

  const documentsPanel = page.getByRole("region", { name: "G13 my documents" });
  await expect(documentsPanel.getByText(/Appointment Letter — Kiran Patel \(E2E\)/)).toBeVisible();
  await expect(documentsPanel.getByText(/Appointment Letter — Ananya Rao \(E2E\)/)).toHaveCount(0);

  const row = documentsPanel.getByRole("listitem").filter({ hasText: "Appointment Letter — Kiran Patel (E2E)" });
  await row.getByRole("button", { name: "View" }).click();
  await expect(row.getByRole("status")).toContainText("Ready to view");

  await row.getByRole("button", { name: "Download" }).click();
  await expect(row.getByRole("status")).toContainText("Ready to download");
});
