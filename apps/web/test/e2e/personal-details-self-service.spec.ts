import { expect, test } from "@playwright/test";

// Use case: "View and update personal details — contact info, address, bank account,
// dependents/nominees, emergency contacts (G01/G02)". Logs in as the real demo employee
// (GOV-100246, ph03Ids.employee — no PH-03 seed contacts/addresses/nominees/etc. yet), adds one row
// through each satellite panel, then switches to a finance-officer session (g01.bank.approve) to
// approve the bank account the employee just added.

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

async function installFinanceOfficerSession(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g01.employee.read", "g01.bank.approve", "g01.bank.write"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: "finance-officer-e2e", name: "Finance Officer", roles: ["finance_officer"], permissions })}.local`
    );
  });
}

test("@critical personal-details: an employee adds address, nominee, emergency contact, and bank account; finance approves the bank account", async ({ page }) => {
  await loginEmployee(page);
  await page.goto("/me/employees");

  await expect(page.getByRole("heading", { name: "Addresses", exact: true })).toBeVisible();
  await page.getByLabel("Line 1").fill("221B Residency Road");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("State").fill("Karnataka");
  await page.getByLabel("Pincode").fill("560025");
  await page.getByLabel("Valid from").fill("2026-07-13");
  await page.getByRole("button", { name: "Add address" }).click();
  await expect(page.getByRole("region", { name: "G01 employee addresses" }).getByRole("status")).toContainText("added");

  await expect(page.getByRole("heading", { name: "Nominees", exact: true })).toBeVisible();
  const nomineePanel = page.getByRole("region", { name: "G01 employee nominees" });
  await nomineePanel.getByLabel("Name", { exact: true }).fill("Priya Kiran");
  await nomineePanel.getByLabel("Share percent").fill("100");
  await nomineePanel.getByRole("button", { name: "Add nominee" }).click();
  await expect(nomineePanel.getByRole("status")).toContainText("added");

  await expect(page.getByRole("heading", { name: "Emergency Contacts", exact: true })).toBeVisible();
  const ecPanel = page.getByRole("region", { name: "G01 employee emergency contacts" });
  await ecPanel.getByLabel("Name").fill("Priya Kiran (Spouse)");
  await ecPanel.getByLabel("Phone").fill("+919000012345");
  await page.getByRole("button", { name: "Add emergency contact" }).click();
  await expect(ecPanel.getByRole("status")).toContainText("added");

  await expect(page.getByRole("heading", { name: "Bank Accounts", exact: true })).toBeVisible();
  const bankPanel = page.getByRole("region", { name: "G01 employee bank accounts" });
  await bankPanel.getByLabel("Bank name").fill("Sample Public Bank");
  await bankPanel.getByLabel("IFSC").fill("SAMP0001234");
  await bankPanel.getByLabel("Account number").fill("XXXXXXXX7001");
  await page.getByRole("button", { name: "Add bank account" }).click();
  await expect(bankPanel.getByRole("status")).toContainText("pending approval");
  await expect(bankPanel.getByText(/PENDING, penny-drop PENDING/)).toBeVisible();

  await installFinanceOfficerSession(page);
  await page.reload();
  const financeBankPanel = page.getByRole("region", { name: "G01 employee bank accounts" });
  await expect(financeBankPanel.getByRole("button", { name: "Approve" })).toBeVisible();
  await financeBankPanel.getByRole("button", { name: "Approve" }).click();
  await expect(financeBankPanel.getByText(/APPROVED, penny-drop PENDING/)).toBeVisible();
});
