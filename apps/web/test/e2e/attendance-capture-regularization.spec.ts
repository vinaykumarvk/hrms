import { expect, test } from "@playwright/test";

// Use case: "Mark attendance / regularize punches — clock in/out, request correction for missed
// punches (G03)". Logs in as the real demo employee, clocks in without clocking out (a real missed
// punch, persisted through the actual API — not a hardcoded fixture), then switches to an
// attendance-admin session to regularise that exact record through the regularization queue UI.

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

async function installAttendanceAdminSession(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g03.leave.read", "g03.attendance.regularise"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: "attendance-admin-e2e", name: "Attendance Admin", roles: ["attendance_admin"], permissions })}.local`
    );
  });
}

test("@critical attendance: an employee's real missed punch is regularised by a different attendance-admin session", async ({ page }) => {
  await loginEmployee(page);
  await page.goto("/me/attendance-leave");

  await expect(page.getByRole("heading", { name: "Clock In / Clock Out" })).toBeVisible();
  const capturePanel = page.getByRole("region", { name: "G03 attendance capture" });
  await capturePanel.getByLabel("Date").fill("2026-07-12");
  await capturePanel.getByLabel("Clock in").fill("09:15");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(capturePanel.getByRole("status")).toContainText("saved");
  await expect(capturePanel.getByText(/2026-07-12.*ANOMALY.*MISSING_OUT/)).toBeVisible();

  await installAttendanceAdminSession(page);
  await page.reload();
  const regularizationPanel = page.getByRole("region", { name: "G03 attendance regularization" });
  await expect(page.getByRole("heading", { name: "Regularization Queue" })).toBeVisible();

  const queueRow = regularizationPanel.getByRole("listitem").filter({ hasText: "2026-07-12" });
  await expect(queueRow).toBeVisible();
  await queueRow.getByLabel("Reason").fill("Confirmed with building security exit log");
  await queueRow.getByRole("button", { name: "Regularise" }).click();

  await expect(regularizationPanel.getByRole("listitem").filter({ hasText: "2026-07-12" })).toHaveCount(0);
});
