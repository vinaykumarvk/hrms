import { expect, test } from "@playwright/test";

// PH-03 fixture identities (apps/api/src/seed/ph03Seed.ts): Kiran Patel (GOV-100246) reports to
// Ananya Rao (the PH-03 manager) via REPORTING_CHAIN. This proves the full leave lifecycle through
// the real running app: log in as the applicant, submit through LeaveApplyForm, switch identity to
// the resolved supervisor (the P01 workflow platform now enforces that only the resolved approver —
// or an override role — may decide a task), and approve through LeaveApproverInbox.
const MANAGER_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999901";

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

async function installManagerSession(page: import("@playwright/test").Page) {
  await page.addInitScript((managerEmployeeId) => {
    const encode = (value: object) =>
      btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "workspace.team", "p01.workflow.read", "g03.leave.read", "g03.leave.approve", "g04.relay.write"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: managerEmployeeId, name: "Ananya Rao", roles: ["l1_manager"], permissions })}.local`
    );
  }, MANAGER_EMPLOYEE_ID);
}

test("@critical leave: an employee's submitted application is approved by their real resolved supervisor", async ({ page }) => {
  await loginEmployee(page);
  await page.goto("/me/attendance-leave");
  await expect(page.getByRole("heading", { name: "Apply for Leave" })).toBeVisible();

  await page.getByLabel("Employee id").fill("99999999-9999-9999-9999-999999999902");
  await page.getByLabel("Leave type").selectOption("EL");
  await page.getByLabel("From date").fill("2026-08-24");
  await page.getByLabel("To date").fill("2026-08-25");
  await page.getByLabel("Reason (optional)").fill("Playwright leave lifecycle proof");
  await page.getByRole("button", { name: "Submit application" }).click();

  const successStatus = page.getByRole("status");
  await expect(successStatus).toContainText("submitted");
  const applicationNo = (await successStatus.textContent())?.match(/LA\/\d{4}\/\d+/)?.[0];
  expect(applicationNo, "the success message must surface the application number").toBeTruthy();

  await installManagerSession(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Approver Inbox" })).toBeVisible();

  const approverInbox = page.getByRole("region", { name: "G03 approver inbox" });
  const inboxRow = approverInbox.getByRole("listitem").filter({ hasText: applicationNo! });
  await expect(inboxRow).toBeVisible();
  await inboxRow.getByRole("button", { name: "Approve" }).click();

  await expect(approverInbox.getByRole("listitem").filter({ hasText: applicationNo! })).toHaveCount(0);
});
