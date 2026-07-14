import { expect, test } from "@playwright/test";

// Use case: "Access service register / employment history — postings, promotions, service record
// timeline (G12)". Builds one real SR event (a submitted-and-approved leave application, relayed
// G04 -> G12 as LEAVE_APPROVED) for the demo employee (Kiran) directly via API calls — mirroring
// the G10 payslip e2e test's approach, avoiding the shared seed flag (see
// docs/reviews/brd-coverage-g10-payslip-self-service-2026-07-13.md for why) — then views it as
// Kiran through the real ServiceRegisterTimeline UI.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const MANAGER_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999901";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function actorToken(userId: string, permissions: string[]): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: userId, roles: ["employee"], permissions })}.local`;
}

async function seedOneApprovedLeave(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const kiranToken = actorToken(KIRAN_EMPLOYEE_ID, ["g03.leave.submit"]);
  const managerToken = actorToken(MANAGER_EMPLOYEE_ID, ["g03.leave.approve", "g04.relay.write"]);

  const existing = await request.get(`/api/v1/sr/employees/${KIRAN_EMPLOYEE_ID}/timeline`, {
    headers: { Authorization: `Bearer ${actorToken(KIRAN_EMPLOYEE_ID, ["g12.sr.read"])}` },
  });
  if (((await existing.json()).items ?? []).length > 0) {
    return; // already seeded by a prior run in this worker
  }

  const submitted = await request.post("/api/v1/atl/leave-applications", {
    headers: { Authorization: `Bearer ${kiranToken}`, "Idempotency-Key": "idem-e2e-sr-submit-001" },
    data: { employeeId: KIRAN_EMPLOYEE_ID, leaveTypeId: "CL", fromDate: "2026-07-15", toDate: "2026-07-15", reason: "Personal work" },
  });
  const applicationId = (await submitted.json()).application.id;
  await request.post(`/api/v1/atl/leave-applications/${applicationId}/decision`, {
    headers: { Authorization: `Bearer ${managerToken}`, "Idempotency-Key": "idem-e2e-sr-approve-001" },
    data: { decision: "APPROVE" },
  });
}

async function installKiranSession(page: import("@playwright/test").Page) {
  await page.addInitScript((employeeId) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g12.sr.read"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: employeeId, name: "Kiran Patel", roles: ["employee"], permissions })}.local`
    );
  }, KIRAN_EMPLOYEE_ID);
}

test("@critical service register: an employee views their own real service-register timeline", async ({ page, request }) => {
  await seedOneApprovedLeave(request);
  await installKiranSession(page);
  await page.goto("/me/service-register");

  const panel = page.getByRole("region", { name: "Service Register timeline" });
  await expect(panel.getByRole("heading", { name: "Service Register" })).toBeVisible();
  await expect(panel.getByText("LEAVE_APPROVED")).toBeVisible();
});

test("@critical service register: an employee cannot view another employee's timeline through the API even if they try", async ({ request }) => {
  await seedOneApprovedLeave(request);
  // actorToken() always issues roles: ["employee"] — a plain employee session for the manager's own
  // user id, holding only the read permission and no override role, so this must 403.
  const forbidden = await request.get(`/api/v1/sr/employees/${KIRAN_EMPLOYEE_ID}/timeline`, {
    headers: { Authorization: `Bearer ${actorToken(MANAGER_EMPLOYEE_ID, ["g12.sr.read"])}` },
  });
  expect(forbidden.status()).toBe(403);
});
