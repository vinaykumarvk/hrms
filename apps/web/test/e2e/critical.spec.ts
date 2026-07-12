import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

async function installAdminSession(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "workspace.team", "workspace.admin", "p01.workflow.read", "p01.workflow.config.review", "g01.employee.read", "g04.relay.read", "g10.payroll.read", "g10.payroll.run.create", "g10.payroll.input.lock", "g10.payroll.compute", "g10.payroll.reconcile", "g10.payroll.approve", "g10.payroll.lock", "g10.payroll.disburse", "g11.pension.read", "g14.analytics.read"];
    sessionStorage.setItem("hrms.session.token", `${encode({ alg: "none" })}.${encode({ sub: "admin-fixture", name: "Admin Fixture", roles: ["hr_admin"], permissions })}.local`);
  });
}

test("@critical employee navigation and mobile drawer are operable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginEmployee(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Me navigation" })).toBeVisible();
  await page.getByRole("link", { name: "Employees" }).click();
  await expect(page).toHaveURL(/\/me\/employees$/);
  await expect(page.getByRole("heading", { name: "Employees", exact: true })).toBeFocused();
});

test("@critical employee direct admin route fails closed", async ({ page }) => {
  await loginEmployee(page);
  await page.goto("/admin/payroll");
  await expect(page.getByRole("heading", { name: "No permission" })).toBeVisible();
  await expect(page.getByText("Payroll Run Console")).toHaveCount(0);
});

test("@critical workflow configuration controls have outcomes and publish confirmation", async ({ page }) => {
  await installAdminSession(page);
  await page.goto("/admin/workflow-config");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByRole("status")).toContainText("Validation passed");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Publish workflow configuration?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep in review" }).click();
  await expect(page.getByRole("dialog", { name: "Publish workflow configuration?" })).toHaveCount(0);
});

test("@critical authenticated shell has no axe violations", async ({ page }) => {
  await loginEmployee(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("@critical authenticated shell is reachable without horizontal overflow across viewports", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await loginEmployee(page);
  for (const viewport of [{ width: 320, height: 720 }, { width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
  }
});

test("@critical drawer and dialog support keyboard open close and focus return", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginEmployee(page);
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Me navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Me navigation" })).toHaveCount(0);
  await expect(menu).toBeFocused();

  await installAdminSession(page);
  await page.goto("/admin/workflow-config");
  await page.getByRole("button", { name: "Submit for review" }).click();
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Publish workflow configuration?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Publish workflow configuration?" })).toHaveCount(0);
  await expect(publish).toBeFocused();
});

test("@critical workflow network failure is recoverable", async ({ page }) => {
  await page.route("**/api/v1/workflow/tasks", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "LOAD_FAILED" } }) }));
  await loginEmployee(page);
  await expect(page.getByRole("heading", { name: "Could not load the inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("@critical expired session clears protected state and shows a generic message", async ({ page }) => {
  await page.addInitScript(() => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    sessionStorage.setItem("hrms.session.token", `${encode({ alg: "none" })}.${encode({ sub: "expired", permissions: ["workspace.admin"], exp: 1 })}.local`);
  });
  await page.goto("/admin/payroll");
  await expect(page.getByRole("main", { name: "Employee sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Your session ended");
  await expect(page.getByText("Payroll Run Console")).toHaveCount(0);
});
