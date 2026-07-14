import { expect, test } from "@playwright/test";

// Use case: "Check my personal dashboard — own leave balance and attendance summary at a glance
// (G14)". Builds a real leave balance and a real attendance record for the demo employee (Kiran)
// directly via API calls — mirroring the other self-service e2e specs' approach, avoiding the
// shared seed flag (the local dev API server does not set HRMS_SEED_TEST_EMPLOYEES) — then views
// the composed dashboard as Kiran through the real MyDashboardPanel UI.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function actorToken(userId: string, permissions: string[]): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: userId, roles: ["employee"], permissions })}.local`;
}

async function seedAttendanceRecord(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const kiranToken = actorToken(KIRAN_EMPLOYEE_ID, ["g03.attendance.capture"]);
  await request.post("/api/v1/atl/attendance-captures", {
    headers: { Authorization: `Bearer ${kiranToken}`, "Idempotency-Key": "idem-e2e-dashboard-attendance-001" },
    data: { employeeId: KIRAN_EMPLOYEE_ID, attendanceDate: "2026-07-10", inTime: "09:05", outTime: "17:30" },
  });
}

async function installKiranSession(page: import("@playwright/test").Page) {
  await page.addInitScript((employeeId) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g14.analytics.read.self", "g03.leave.read"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: employeeId, name: "Kiran Patel", roles: ["employee"], permissions })}.local`
    );
  }, KIRAN_EMPLOYEE_ID);
}

test("@critical personal-dashboard: an employee views their own real leave balance and attendance summary", async ({ page, request }) => {
  await seedAttendanceRecord(request);
  await installKiranSession(page);
  await page.goto("/me/dashboard");

  const panel = page.getByRole("region", { name: "G14 my dashboard" });
  await expect(panel.getByRole("heading", { name: "My Personal Dashboard", exact: true })).toBeVisible();
  await expect(panel.getByText(/days available of/)).toBeVisible();
  await expect(panel.getByText(/recorded days/)).toBeVisible();
});

test("@critical personal-dashboard: an unrelated employee cannot view Kiran's dashboard through the API even if they try", async ({ request }) => {
  await seedAttendanceRecord(request);
  // Deliberately NOT Kiran's real manager (Ananya) — she is a legitimate reporting-chain viewer.
  // This is a fully unrelated actor id with no reporting relationship to Kiran at all.
  const strangerToken = actorToken("99999999-9999-9999-9999-999999999999", ["g14.analytics.read.self"]);
  const response = await request.get(`/api/v1/analytics/employees/${KIRAN_EMPLOYEE_ID}/dashboard`, {
    headers: { Authorization: `Bearer ${strangerToken}` },
  });
  expect(response.status()).toBe(403);
});
