const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// PH-08F: statutory-wave UI — G09 case workbench, G06 DPC per-member verdicts,
// G08 APAR self/RO/RvO tier forms, G07 training nomination. Source-marker checks
// pin the submit handlers to the client methods; the transpiled real client and
// fixture client are then exercised behaviourally, including error envelopes;
// finally the components are rendered to markup for the canonical states.

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g09WorkbenchSource = fs.readFileSync("apps/web/src/modules/g09/DisciplinaryCaseWorkbench.tsx", "utf8");
const g06DpcSource = fs.readFileSync("apps/web/src/modules/g06/DpcConvenePanel.tsx", "utf8");
const g08TierSource = fs.readFileSync("apps/web/src/modules/g08/AparTierForms.tsx", "utf8");
const g07NominationSource = fs.readFileSync("apps/web/src/modules/g07/TrainingNominationForm.tsx", "utf8");

// --- Transpiling module loader so the real TS/TSX sources are exercised, not re-implemented ---

const moduleCache = new Map();

function resolveTsPath(candidate) {
  for (const suffix of ["", ".ts", ".tsx"]) {
    const withSuffix = `${candidate}${suffix}`;
    if (fs.existsSync(withSuffix) && fs.statSync(withSuffix).isFile()) {
      return withSuffix;
    }
  }
  throw new Error(`Cannot resolve TS module ${candidate}`);
}

function loadTsModule(candidate) {
  const resolved = path.resolve(resolveTsPath(candidate));
  if (moduleCache.has(resolved)) {
    return moduleCache.get(resolved).exports;
  }
  const source = fs.readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const moduleShim = { exports: {} };
  moduleCache.set(resolved, moduleShim);
  const localRequire = (specifier) =>
    specifier.startsWith(".") ? loadTsModule(path.join(path.dirname(resolved), specifier)) : require(specifier);
  new Function("exports", "module", "require", transpiled)(moduleShim.exports, moduleShim, localRequire);
  return moduleShim.exports;
}

const { createHrmsClient, HrmsApiError } = loadTsModule("apps/web/src/api/hrmsClient.ts");
const { createFixtureHrmsClient } = loadTsModule("apps/web/src/api/fixtureHrmsClient.ts");
const { DisciplinaryCaseWorkbench } = loadTsModule("apps/web/src/modules/g09/DisciplinaryCaseWorkbench.tsx");
const { DpcConvenePanel } = loadTsModule("apps/web/src/modules/g06/DpcConvenePanel.tsx");
const { AparTierForms } = loadTsModule("apps/web/src/modules/g08/AparTierForms.tsx");
const { TrainingNominationForm } = loadTsModule("apps/web/src/modules/g07/TrainingNominationForm.tsx");

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// --- 1) The new surfaces are real controlled forms wired to the client submit methods ---

test("PH-08F G09 workbench has intake + charge forms submitting through the client", () => {
  for (const marker of [
    "<form",
    "onSubmit={handleIntakeSubmit}",
    "onSubmit={handleChargeSubmit}",
    "event.preventDefault()",
    "openDisciplinaryCase",
    "serveDisciplinaryCharge",
    "crypto.randomUUID()",
    "allegations",
    "articles",
    'role="alert"',
    "G09_AUTHORITY_COMPETENCE",
    "ERR-G09-AUTHORITY-NOT-COMPETENT",
  ]) {
    assert.equal(g09WorkbenchSource.includes(marker), true, `DisciplinaryCaseWorkbench missing ${marker}`);
  }
});

test("PH-08F G06 DPC panel captures each member's verdict individually with quorum visible", () => {
  for (const marker of [
    "<form",
    "onSubmit={handleSubmit}",
    "holdDpc",
    "memberVerdict",
    "RECUSE",
    "recusedEmployeeIds",
    "quorumRequired",
    "QUORUM_NOT_MET",
    "PANEL_CONFLICT_OF_INTEREST",
    "Quorum position",
    'role="alert"',
  ]) {
    assert.equal(g06DpcSource.includes(marker), true, `DpcConvenePanel missing ${marker}`);
  }
});

test("PH-08F G08 tier forms are gated by the actor's tier permission (SoD)", () => {
  for (const marker of [
    "g08.apar.self.submit",
    "g08.apar.report",
    "g08.apar.review",
    "submitAparSelf",
    "recordAparReporting",
    "recordAparReview",
    "canSubmitSelf",
    "canReport",
    "canReview",
    'role="alert"',
  ]) {
    assert.equal(g08TierSource.includes(marker), true, `AparTierForms missing ${marker}`);
  }
});

test("PH-08F G07 nomination form renders capacity/eligibility feedback from the server", () => {
  for (const marker of ["<form", "onSubmit={handleFormSubmit}", "useForm(", "nominateForTraining", "WAITLISTED", "waitlistPosition", 'role="alert"']) {
    assert.equal(g07NominationSource.includes(marker), true, `TrainingNominationForm missing ${marker}`);
  }
});

test("PH-08F App mounts the statutory-wave interactive surfaces behind route guards", () => {
  for (const marker of ["DisciplinaryCaseWorkbench", "DpcConvenePanel", "AparTierForms", "TrainingNominationForm"]) {
    assert.equal(appSource.includes(marker), true, `App missing ${marker}`);
  }
});

test("PH-08F client and fixture bind the statutory action routes", () => {
  for (const marker of [
    "/api/v1/disciplinary/cases",
    "/api/v1/promotions/cases",
    "/api/v1/apar/forms",
    "/api/v1/training/nominations",
  ]) {
    assert.equal(clientSource.includes(marker), true, `client missing ${marker}`);
  }
  for (const marker of ["openDisciplinaryCase", "serveDisciplinaryCharge", "holdDpc", "submitAparSelf", "recordAparReporting", "recordAparReview", "nominateForTraining"]) {
    assert.equal(fixtureSource.includes(marker), true, `fixture missing ${marker}`);
  }
});

// --- 2) The real client POSTs the PH-08A..E routes with an Idempotency-Key ---

test("PH-08F openDisciplinaryCase POSTs /api/v1/disciplinary/cases with the intake body", async () => {
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: JSON.parse(init.body) });
      return jsonResponse(201, { disciplinaryCase: { id: "case-1", caseNo: "DCP/00001", stage: "INTAKE", caseStatus: "OPEN" } });
    },
  });
  const result = await client.openDisciplinaryCase(
    { chargedEmployeeId: "emp-1", disciplinaryAuthorityId: "emp-2", allegations: "Complaint text", confidential: true },
    "idem-ph08f-001"
  );
  assert.equal(result.disciplinaryCase.caseNo, "DCP/00001");
  assert.equal(calls[0].url, "/api/v1/disciplinary/cases");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("Idempotency-Key"), "idem-ph08f-001");
  assert.equal(calls[0].body.allegations, "Complaint text");
});

test("PH-08F serveDisciplinaryCharge POSTs the :charge action route", async () => {
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return jsonResponse(202, { disciplinaryCase: { id: "case-1", caseNo: "DCP/00001", stage: "CHARGE", caseStatus: "OPEN" } });
    },
  });
  const result = await client.serveDisciplinaryCharge("case-1", { articles: ["Article I"], servedOn: "2026-07-02" }, "idem-ph08f-002");
  assert.equal(result.disciplinaryCase.stage, "CHARGE");
  assert.equal(calls[0].url, "/api/v1/disciplinary/cases/case-1:charge");
  assert.deepEqual(calls[0].body.articles, ["Article I"]);
});

test("PH-08F holdDpc POSTs :hold-dpc and surfaces QUORUM_NOT_MET as a readable envelope (error state)", async () => {
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return jsonResponse(422, { error: { code: "QUORUM_NOT_MET", message: "DPC quorum is not met" } });
    },
  });
  await assert.rejects(
    () =>
      client.holdDpc(
        "case-1",
        { panelMembers: [{ employeeId: "emp-9", role: "CHAIRPERSON" }], recusedEmployeeIds: [], quorumRequired: 2 },
        "idem-ph08f-003"
      ),
    (error) => {
      assert.equal(error instanceof HrmsApiError, true);
      assert.equal(error.code, "QUORUM_NOT_MET");
      assert.equal(error.displayCode, "QUORUM_NOT_MET");
      return true;
    }
  );
  assert.equal(calls[0].url, "/api/v1/promotions/cases/case-1:hold-dpc");
  assert.equal(calls[0].body.quorumRequired, 2);
});

test("PH-08F APAR tier actions POST :submit-self, :report, and :review", async () => {
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return jsonResponse(202, { form: { id: "apar-1", formNo: "APAR/2026/00001", status: "RO_ASSESSMENT", sealedCover: false } });
    },
  });
  await client.submitAparSelf("apar-1", { narrative: "Consistent output" }, "idem-ph08f-004");
  await client.recordAparReporting("apar-1", { grade: "VERY_GOOD", narrative: "Consistent output" }, "idem-ph08f-005");
  await client.recordAparReview("apar-1", { concur: true, remarks: "Concur" }, "idem-ph08f-006");
  assert.equal(calls[0].url, "/api/v1/apar/forms/apar-1:submit-self");
  assert.equal(calls[0].body.narrative, "Consistent output");
  assert.equal(calls[1].url, "/api/v1/apar/forms/apar-1:report");
  assert.equal(calls[1].body.grade, "VERY_GOOD");
  assert.equal(calls[2].url, "/api/v1/apar/forms/apar-1:review");
  assert.equal(calls[2].body.concur, true);
});

test("PH-08F nominateForTraining POSTs /api/v1/training/nominations", async () => {
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return jsonResponse(201, { nomination: { id: "nom-1", nominationNo: "TN/00001", sessionId: "sess-1", employeeId: "emp-1", status: "PENDING_L1" } });
    },
  });
  const result = await client.nominateForTraining({ sessionId: "sess-1", employeeId: "emp-1" }, "idem-ph08f-007");
  assert.equal(result.nomination.status, "PENDING_L1");
  assert.equal(calls[0].url, "/api/v1/training/nominations");
});

// --- 3) The fixture client honours the same submit paths and failure semantics ---

test("PH-08F fixture drives the G09 submit path intake -> charge and fails closed on re-charge", async () => {
  const fixture = createFixtureHrmsClient();
  const opened = await fixture.openDisciplinaryCase(
    { chargedEmployeeId: "emp-1", disciplinaryAuthorityId: "emp-2", allegations: "Complaint", confidential: false },
    "idem-1"
  );
  assert.equal(opened.disciplinaryCase.stage, "INTAKE");
  const charged = await fixture.serveDisciplinaryCharge(opened.disciplinaryCase.id, { articles: ["Article I"], servedOn: "2026-07-02" }, "idem-2");
  assert.equal(charged.disciplinaryCase.stage, "CHARGE");
  await assert.rejects(
    () => fixture.serveDisciplinaryCharge(opened.disciplinaryCase.id, { articles: ["Article II"], servedOn: "2026-07-03" }, "idem-3"),
    (error) => error instanceof HrmsApiError && error.code === "PRECONDITION_FAILED"
  );
  await assert.rejects(
    () => fixture.openDisciplinaryCase({ chargedEmployeeId: "emp-1", disciplinaryAuthorityId: "emp-1", allegations: "Self", confidential: false }, "idem-4"),
    (error) => error instanceof HrmsApiError && error.code === "CONFLICT"
  );
});

test("PH-08F fixture enforces DPC quorum and per-member recusal before returning the panel verdict", async () => {
  const fixture = createFixtureHrmsClient();
  await assert.rejects(
    () =>
      fixture.holdDpc(
        "promotion-case-fixture-000001",
        { panelMembers: [{ externalName: "Sole Member", role: "CHAIRPERSON" }], recusedEmployeeIds: [], quorumRequired: 2 },
        "idem-5"
      ),
    (error) => error instanceof HrmsApiError && error.code === "QUORUM_NOT_MET"
  );
  const held = await fixture.holdDpc(
    "promotion-case-fixture-000001",
    {
      panelMembers: [
        { externalName: "External PSC Nominee", role: "CHAIRPERSON" },
        { externalName: "Second Member", role: "MEMBER" },
      ],
      recusedEmployeeIds: [],
      quorumRequired: 2,
    },
    "idem-6"
  );
  assert.equal(held.promotionCase.dpc.verdict, "FIT_PANEL");
  assert.equal(held.promotionCase.dpc.participatingMembers, 2);
});

test("PH-08F fixture enforces the APAR tier ordering self -> RO -> RvO", async () => {
  const fixture = createFixtureHrmsClient();
  await assert.rejects(
    () => fixture.recordAparReporting("apar-fixture-000001", { grade: "GOOD", narrative: "Too early" }, "idem-7"),
    (error) => error instanceof HrmsApiError && error.code === "PRECONDITION_FAILED"
  );
  const self = await fixture.submitAparSelf("apar-fixture-000001", { narrative: "Delivered the statutory targets" }, "idem-8");
  assert.equal(self.form.status, "RO_ASSESSMENT");
  const reported = await fixture.recordAparReporting("apar-fixture-000001", { grade: "VERY_GOOD", narrative: "Solid year" }, "idem-9");
  assert.equal(reported.form.status, "RVO_REVIEW");
  const reviewed = await fixture.recordAparReview("apar-fixture-000001", { concur: true, remarks: "Concur" }, "idem-10");
  assert.equal(reviewed.form.status, "AA_ACCEPTANCE");
});

test("PH-08F fixture waitlists nominations past session capacity (capacity feedback)", async () => {
  const fixture = createFixtureHrmsClient();
  const first = await fixture.nominateForTraining({ sessionId: "training-session-fixture-000001", employeeId: "emp-1" }, "idem-11");
  const second = await fixture.nominateForTraining({ sessionId: "training-session-fixture-000001", employeeId: "emp-2" }, "idem-12");
  const third = await fixture.nominateForTraining({ sessionId: "training-session-fixture-000001", employeeId: "emp-3" }, "idem-13");
  assert.equal(first.nomination.status, "PENDING_L1");
  assert.equal(second.nomination.status, "PENDING_L1");
  assert.equal(third.nomination.status, "WAITLISTED");
  assert.equal(third.nomination.waitlistPosition, 1);
  await assert.rejects(
    () => fixture.nominateForTraining({ sessionId: "no-such-session", employeeId: "emp-1" }, "idem-14"),
    (error) => error instanceof HrmsApiError && error.code === "NOT_FOUND"
  );
});

// --- 4) Rendered canonical states: empty list, quorum status, error envelopes as alerts ---

test("PH-08F G09 workbench renders both forms and the empty case list", () => {
  const markup = renderToStaticMarkup(React.createElement(DisciplinaryCaseWorkbench, { client: createFixtureHrmsClient() }));
  assert.match(markup, /Complaint and case intake form/);
  assert.match(markup, /Article of charge form/);
  assert.match(markup, /data-state="empty"/);
  assert.match(markup, /No cases yet/);
});

test("PH-08F G06 DPC panel renders the quorum position and the QUORUM_NOT_MET error state as an alert", () => {
  const client = createFixtureHrmsClient();
  const idleMarkup = renderToStaticMarkup(React.createElement(DpcConvenePanel, { client }));
  assert.match(idleMarkup, /Quorum position/);
  assert.match(idleMarkup, /verdict/i);
  const errorMarkup = renderToStaticMarkup(
    React.createElement(DpcConvenePanel, {
      client,
      initialPhase: { kind: "error", errorCode: "QUORUM_NOT_MET", message: "The DPC quorum is not met: too few participating members after recusals (DPC_QUORUM)." },
    })
  );
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /QUORUM_NOT_MET/);
});

test("PH-08F G08 tier forms render only the tiers the actor holds (SoD in the UI)", () => {
  const client = createFixtureHrmsClient();
  const appraiseeMarkup = renderToStaticMarkup(React.createElement(AparTierForms, { client, permissions: ["g08.apar.self.submit"] }));
  assert.match(appraiseeMarkup, /Self-appraisal/);
  assert.doesNotMatch(appraiseeMarkup, /Reporting officer assessment/);
  assert.doesNotMatch(appraiseeMarkup, /Reviewing officer review/);
  const roMarkup = renderToStaticMarkup(React.createElement(AparTierForms, { client, permissions: ["g08.apar.report", "g08.apar.review"] }));
  assert.match(roMarkup, /Reporting officer assessment/);
  assert.match(roMarkup, /Reviewing officer review/);
  assert.doesNotMatch(roMarkup, /Self-appraisal \(appraisee tier\)/);
  const noTierMarkup = renderToStaticMarkup(React.createElement(AparTierForms, { client, permissions: [] }));
  assert.match(noTierMarkup, /data-state="empty"/);
});

test("PH-08F G07 nomination form renders eligibility errors and waitlist capacity feedback", () => {
  const client = createFixtureHrmsClient();
  const errorMarkup = renderToStaticMarkup(
    React.createElement(TrainingNominationForm, {
      client,
      initialPhase: { kind: "error", errorCode: "NOT_FOUND", message: "The training session or employee could not be found (eligibility check failed)." },
    })
  );
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /NOT_FOUND/);
  const waitlistMarkup = renderToStaticMarkup(
    React.createElement(TrainingNominationForm, {
      client,
      initialPhase: {
        kind: "success",
        nomination: { id: "nom-1", nominationNo: "TN/00009", sessionId: "sess-1", employeeId: "emp-9", status: "WAITLISTED", waitlistPosition: 2 },
      },
    })
  );
  assert.match(waitlistMarkup, /waitlisted at position 2/);
});
