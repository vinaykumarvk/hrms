import { expect, test } from "@playwright/test";

// Use case: "View/respond to a disciplinary or vigilance case against you (G09)". Builds one real
// disciplinary case for the demo employee (Kiran) directly via API calls, run through the real
// due-process lifecycle (open -> serve charge -> record inquiry -> issue show-cause) — mirroring
// the G06 promotion e2e test's approach, avoiding the shared seed flag (the local dev API server
// does not set HRMS_SEED_TEST_EMPLOYEES) — then views it, responds to the show-cause notice, and
// requests a personal hearing as Kiran through the real MyDisciplinaryCasePanel UI.

const KIRAN_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999902";
const MANAGER_EMPLOYEE_ID = "99999999-9999-9999-9999-999999999901";

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function adminToken(): string {
  return `${encodeSegment({ alg: "none" })}.${encodeSegment({ sub: "e2e-disciplinary-admin", roles: ["hr_admin"], permissions: ["*"] })}.local`;
}

async function seedDisciplinaryCase(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const headers = { Authorization: `Bearer ${adminToken()}` };

  const existing = await request.get(`/api/v1/disciplinary/employees/${KIRAN_EMPLOYEE_ID}/cases`, { headers });
  if (((await existing.json()).items ?? []).length > 0) {
    return; // already seeded by a prior run in this worker
  }

  const opened = await request.post("/api/v1/disciplinary/cases", {
    headers: { ...headers, "Idempotency-Key": "idem-e2e-disciplinary-open-001" },
    data: {
      chargedEmployeeId: KIRAN_EMPLOYEE_ID,
      disciplinaryAuthorityId: MANAGER_EMPLOYEE_ID,
      allegations: "Unauthorised absence from duty station without leave",
      openedOn: "2026-05-01",
    },
  });
  const caseId = (await opened.json()).disciplinaryCase.id;

  await request.post(`/api/v1/disciplinary/cases/${caseId}:charge`, {
    headers: { ...headers, "Idempotency-Key": "idem-e2e-disciplinary-charge-001" },
    data: { articles: ["Article I: Unauthorised absence"], servedOn: "2026-05-05" },
  });
  await request.post(`/api/v1/disciplinary/cases/${caseId}:inquiry-report`, {
    headers: { ...headers, "Idempotency-Key": "idem-e2e-disciplinary-inquiry-001" },
    data: { findings: "PROVED", reportDate: "2026-06-10" },
  });
  await request.post(`/api/v1/disciplinary/cases/${caseId}:show-cause`, {
    headers: { ...headers, "Idempotency-Key": "idem-e2e-disciplinary-show-cause-001" },
    data: { proposedPenalties: ["CENSURE", "WITHHOLD_INCREMENT"], issuedDate: "2026-06-15", responseDueDate: "2026-07-15" },
  });
}

async function installKiranSession(page: import("@playwright/test").Page) {
  await page.addInitScript((employeeId) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const permissions = ["workspace.me", "g09.case.read", "g09.show-cause.respond", "g09.personal-hearing.request"];
    sessionStorage.setItem(
      "hrms.session.token",
      `${encode({ alg: "none" })}.${encode({ sub: employeeId, name: "Kiran Patel", roles: ["employee"], permissions })}.local`
    );
  }, KIRAN_EMPLOYEE_ID);
}

test("@critical disciplinary-case: an employee views their own real case, responds to the show-cause notice, and requests a personal hearing", async ({
  page,
  request,
}) => {
  await seedDisciplinaryCase(request);
  await installKiranSession(page);
  await page.goto("/me/disciplinary");

  const panel = page.getByRole("region", { name: "G09 my disciplinary case" });
  await expect(panel.getByRole("heading", { name: "My Disciplinary Case", exact: true })).toBeVisible();

  await expect(panel.getByText(/DCP\/\d+.*INQUIRY_REPORT/)).toBeVisible();
  await expect(panel.getByText(/CENSURE, WITHHOLD_INCREMENT.*SERVED/)).toBeVisible();

  const responseForm = panel.getByRole("form", { name: "Respond to show-cause notice" });
  await responseForm.getByLabel("Your representation").fill("The absence was due to a documented medical emergency, evidence attached.");
  await responseForm.getByRole("button", { name: "Submit response" }).click();
  await expect(panel.getByText(/Your response: The absence was due to a documented medical emergency/)).toBeVisible();

  await panel.getByRole("button", { name: "Request a personal hearing" }).click();
  await expect(panel.getByText(/SHOW_CAUSE.*REQUESTED/)).toBeVisible();
});

test("@critical disciplinary-case: another employee cannot see Kiran's case through the API even if they try", async ({ request }) => {
  await seedDisciplinaryCase(request);
  const strangerToken = `${encodeSegment({ alg: "none" })}.${encodeSegment({
    sub: MANAGER_EMPLOYEE_ID,
    roles: ["employee"],
    permissions: ["g09.case.read"],
  })}.local`;
  const response = await request.get(`/api/v1/disciplinary/employees/${KIRAN_EMPLOYEE_ID}/cases`, {
    headers: { Authorization: `Bearer ${strangerToken}` },
  });
  expect(response.status()).toBe(403);
});
