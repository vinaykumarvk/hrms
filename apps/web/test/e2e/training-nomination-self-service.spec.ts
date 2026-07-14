import { expect, test } from "@playwright/test";

// Use case: "Apply for training / view nominations — browse available programs, nominate or get
// nominated, track completion (G07)". Builds one real open session via a direct API call (session
// creation is an L&D/admin action with no self-service UI, matching the pattern in this session's
// other e2e specs), then logs in as the demo employee (Kiran) to browse it, self-nominate through
// the real UI, and see the nomination appear in "My Nominations".

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-training-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedOneOpenSession(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const existing = await request.get("/api/v1/training/sessions", { headers: { Authorization: `Bearer ${adminToken()}` } });
  const found = ((await existing.json()).items ?? []).find((session: { programCode: string }) => session.programCode === "PROG-E2E-101");
  if (found) {
    return found.id;
  }
  const created = await request.post("/api/v1/training/sessions", {
    headers: { Authorization: `Bearer ${adminToken()}`, "Idempotency-Key": "idem-e2e-training-session-001" },
    data: { programCode: "PROG-E2E-101", title: "E2E Test Program", capacity: 10 },
  });
  return (await created.json()).session.id;
}

async function installKiranSession(page: import("@playwright/test").Page) {
  await page.addInitScript((employeeId) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g07.training.read", "g07.nomination.submit"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: employeeId, name: "Kiran Patel", roles: ["employee"], permissions })}.local`
    );
  }, KIRAN_EMPLOYEE_ID);
}

test("@critical training: an employee browses a real session, self-nominates, and sees it in My Nominations", async ({ page, request }) => {
  const sessionId = await seedOneOpenSession(request);
  await installKiranSession(page);
  await page.goto("/me/training");

  const trainingPanel = page.getByRole("region", { name: "G07 my training" });
  await expect(trainingPanel.getByText("E2E Test Program")).toBeVisible();

  await page.getByLabel("Training session id").fill(sessionId);
  await page.getByLabel("Employee id").fill(KIRAN_EMPLOYEE_ID);
  await page.getByRole("button", { name: "Submit nomination" }).click();

  const nominationForm = page.getByRole("region", { name: "G07 training nomination" });
  await expect(nominationForm.getByRole("status")).toBeVisible();

  await expect(trainingPanel.getByRole("heading", { name: "My Nominations" })).toBeVisible();
  await expect(trainingPanel.getByText(/TN\/\d+/)).toBeVisible();
});
