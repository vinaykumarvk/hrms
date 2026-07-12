import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`UIR-05 login foundation renders without document overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByRole("main", { name: "Employee sign in" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
}

test("UIR-05 login has no axe violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("UIR-05 visible login controls expose a focus indicator", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const indicator = await focused.evaluate((element) => ({
    outline: getComputedStyle(element).outlineStyle,
    ownShadow: getComputedStyle(element).boxShadow,
    parentShadow: element.parentElement ? getComputedStyle(element.parentElement).boxShadow : "none",
  }));
  expect(indicator.outline !== "none" || indicator.ownShadow !== "none" || indicator.parentShadow !== "none").toBe(true);
});
