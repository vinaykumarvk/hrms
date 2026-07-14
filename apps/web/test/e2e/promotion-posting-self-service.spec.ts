import { expect, test } from "@playwright/test";

// Use case: "View promotion & posting history / track promotion case status; view sealed-cover
// status concerning me (G06)". Builds one real EFFECTED promotion order (and its auto-created
// probation record) plus one real SEALED cover for the demo employee (Kiran) directly via API
// calls — mirroring the G12 service-register e2e test's approach, avoiding the shared seed flag
// (the local dev API server does not set HRMS_SEED_TEST_EMPLOYEES) — then views them as Kiran
// through the real MyPromotionPanel UI.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const MANAGER_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999901";
const CADRE_REVENUE = "44444444-4444-4444-4444-444444444401";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-promotion-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedPromotionAndSealedCover(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const headers = { Authorization: `Bearer ${adminToken()}` };

  const existing = await request.get("/api/v1/promotions/orders", { headers });
  const existingOrder = ((await existing.json()).items ?? []).find((item: { employeeId: string }) => item.employeeId === KIRAN_EMPLOYEE_ID);
  if (!existingOrder) {
    const list = await request.post("/api/v1/promotions/seniority-lists", {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-list-001" },
      data: {
        cadreId: CADRE_REVENUE,
        effectiveDate: "2026-06-01",
        entries: [{ employeeId: KIRAN_EMPLOYEE_ID, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" }],
      },
    });
    const listId = (await list.json()).seniorityList.id;
    await request.post(`/api/v1/promotions/seniority-lists/${listId}:publish`, {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-publish-001" },
      data: {},
    });
    await request.post(`/api/v1/promotions/seniority-lists/${listId}:finalise`, {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-finalise-001" },
      data: {},
    });
    const promotionCase = await request.post("/api/v1/promotions/cases", {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-case-001" },
      data: { seniorityListId: listId, vacancies: 1, fromDesignation: "Assistant Section Officer", toDesignation: "Section Officer" },
    });
    const caseId = (await promotionCase.json()).promotionCase.id;
    const dpc = await request.post(`/api/v1/promotions/cases/${caseId}:hold-dpc`, {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-dpc-001" },
      data: {
        panelMembers: [
          { employeeId: MANAGER_EMPLOYEE_ID, role: "CHAIRPERSON" },
          { externalName: "External PSC Nominee", role: "EXPERT" },
        ],
        quorumRequired: 2,
      },
    });
    expect((await dpc.json()).promotionCase.status).toBe("DPC_HELD");
    const orders = await request.post(`/api/v1/promotions/cases/${caseId}:issue-orders`, {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-issue-001" },
      data: {},
    });
    const orderId = (await orders.json()).orders[0].id;
    await request.post(`/api/v1/promotions/orders/${orderId}:effect`, {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-effect-001" },
      data: { effectDate: "2026-06-15", idempotencyKey: "idem-e2e-promotion-effect-001", probationMonths: 24 },
    });
  }

  const existingSealedCovers = await request.get("/api/v1/promotions/sealed-covers", { headers });
  const alreadySealed = ((await existingSealedCovers.json()).items ?? []).some((item: { employeeId: string }) => item.employeeId === KIRAN_EMPLOYEE_ID);
  if (!alreadySealed) {
    await request.post("/api/v1/promotions/sealed-covers", {
      headers: { ...headers, "Idempotency-Key": "idem-e2e-promotion-sealed-001" },
      data: { employeeId: KIRAN_EMPLOYEE_ID, reason: "Pending vigilance inquiry" },
    });
  }
}

async function installKiranSession(page: import("@playwright/test").Page) {
  await page.addInitScript((employeeId) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g06.promotion.read", "g06.sealedcover.read"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: employeeId, name: "Kiran Patel", roles: ["employee"], permissions })}.local`
    );
  }, KIRAN_EMPLOYEE_ID);
}

test("@critical promotion-posting: an employee views their own real promotion order, probation record, and sealed-cover status (redacted)", async ({
  page,
  request,
}) => {
  await seedPromotionAndSealedCover(request);
  await installKiranSession(page);
  await page.goto("/me/promotions");

  const panel = page.getByRole("region", { name: "G06 my promotion history" });
  await expect(panel.getByRole("heading", { name: "My Promotion & Posting History", exact: true })).toBeVisible();

  await expect(panel.getByText(/Assistant Section Officer.*Section Officer.*EFFECTED/)).toBeVisible();
  await expect(panel.getByText(/ON_PROBATION/)).toBeVisible();

  // Sealed-cover status is visible, but the confidential reason ("Pending vigilance inquiry") must
  // never appear on the self-service wire — only the status and a generic confidentiality note.
  await expect(panel.getByText(/SEALED/)).toBeVisible();
  await expect(page.getByText("Pending vigilance inquiry")).toHaveCount(0);
});

test("@critical promotion-posting: another employee cannot see Kiran's promotion order through the API even if they try", async ({ request }) => {
  await seedPromotionAndSealedCover(request);
  const strangerToken = `${encodeSegment({ alg: "none" })}.${encodeSegment({
    sub: MANAGER_EMPLOYEE_ID,
    roles: ["employee"],
    permissions: ["g06.promotion.read"],
  })}.local`;
  const response = await request.get("/api/v1/promotions/orders", { headers: { Authorization: `Bearer ${strangerToken}` } });
  const items = (await response.json()).items ?? [];
  expect(items.some((item: { employeeId: string }) => item.employeeId === KIRAN_EMPLOYEE_ID)).toBe(false);
});
