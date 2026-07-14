import { expect, test } from "@playwright/test";

// Use case: "Request a transfer or view transfer orders — submit preferences, track status
// (G05)". PH-03 fixture identity: Kiran Patel (GOV-100246, employee id ph03Ids.employee) reports
// to Ananya Rao (ph03Ids.manager). Kiran raises his own transfer request through the real UI
// (this IS the self-service action, unlike other features where seeding needed an admin API
// call); an admin token then approves it (an HR/Transfer-Authority action with no self-service
// UI, matching the pattern in this session's other e2e specs) — approval auto-serves via the
// IN_APP delivery channel — and Kiran acknowledges the served order through the real UI.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const ORG_REVENUE = "33333333-3333-3333-3333-333333333301";
const ORG_ASSESSMENT = "33333333-3333-3333-3333-333333333302";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-transfer-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function loginEmployee(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Employee ID", { exact: true }).fill("GOV-100246");
  await page.getByLabel("Password", { exact: true }).fill("Welcome@123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Workflow inbox" })).toBeVisible();
}

test("@critical transfer-request: an employee raises their own transfer request, it is approved and served, and they acknowledge it", async ({
  page,
  request,
}) => {
  await loginEmployee(page);
  await page.goto("/me/transfers");

  const transfersPanel = page.getByRole("region", { name: "G05 my transfers" });
  const initiateForm = page.getByRole("region", { name: "G05 initiate transfer" });
  await expect(initiateForm.getByRole("heading", { name: "Initiate Transfer" })).toBeVisible();

  await initiateForm.getByLabel("From org unit").fill(ORG_REVENUE);
  await initiateForm.getByLabel("To org unit").fill(ORG_ASSESSMENT);
  await initiateForm.getByLabel("Order date").fill("2026-07-13");
  await initiateForm.getByLabel("Effective date").fill("2026-07-27");
  await initiateForm.getByLabel("Reason (optional)").fill("Playwright transfer-request lifecycle proof");
  await initiateForm.getByRole("button", { name: "Initiate transfer" }).click();

  const successStatus = initiateForm.getByRole("status");
  await expect(successStatus).toContainText("initiated");
  const orderNo = (await successStatus.textContent())?.match(/TO\/\d{4}\/\d+/)?.[0];
  expect(orderNo, "the success message must surface the order number").toBeTruthy();

  await expect(transfersPanel.getByText(new RegExp(`${orderNo}.*PENDING_APPROVAL`))).toBeVisible();

  const listed = await request.get(`/api/v1/transfers/employees/${KIRAN_EMPLOYEE_ID}`, {
    headers: { Authorization: `Bearer ${adminToken()}` },
  });
  const order = ((await listed.json()).items ?? []).find((item: { orderNo: string }) => item.orderNo === orderNo);
  expect(order, "the order raised through the UI must be discoverable via the admin API").toBeTruthy();

  await request.post(`/api/v1/transfers/orders/${order.id}/approve`, {
    headers: { Authorization: `Bearer ${adminToken()}`, "Idempotency-Key": "idem-e2e-transfer-approve-001" },
    data: { idempotencyKey: "idem-e2e-transfer-approve-001" },
  });

  await page.reload();
  await expect(transfersPanel.getByText(new RegExp(`${orderNo}.*served, awaiting acknowledgement`))).toBeVisible();

  await transfersPanel.getByRole("button", { name: "Acknowledge" }).click();
  await expect(transfersPanel.getByText(new RegExp(`${orderNo}.*acknowledged`))).toBeVisible();
});
