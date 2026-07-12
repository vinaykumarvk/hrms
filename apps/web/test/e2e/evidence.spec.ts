import { expect, test } from "@playwright/test";

const viewports = [
  { name: "360x800", width: 360, height: 800 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
];

async function login(page: import("@playwright/test").Page) {
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

for (const viewport of viewports) {
  test(`evidence screenshot matrix ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await page.screenshot({ fullPage: true, path: `docs/evidence/ui-remediation/screenshot-matrix/login-${viewport.name}.png` });
    await login(page);
    await page.screenshot({ fullPage: true, path: `docs/evidence/ui-remediation/screenshot-matrix/shell-${viewport.name}.png` });
  });
}
