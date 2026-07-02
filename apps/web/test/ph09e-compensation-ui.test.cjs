const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// PH-09E: compensation-wave UI — G10 payslip view with masked PAN/account, payroll run
// console driving the full lifecycle (create -> lock-inputs -> compute -> reconcile ->
// approve -> lock -> disburse), G11 pension case console + scheme-branched benefit
// estimator. Source markers pin the wiring; the transpiled real client and fixture
// client are exercised behaviourally; the components render the canonical states; and
// the masked-PAN negative assertion proves no raw PAN reaches the DOM.

const clientSource = fs.readFileSync("apps/web/src/api/hrmsClient.ts", "utf8");
const fixtureSource = fs.readFileSync("apps/web/src/api/fixtureHrmsClient.ts", "utf8");
const appSource = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const g10ConsoleSource = fs.readFileSync("apps/web/src/modules/g10/PayrollRunConsole.tsx", "utf8");
const g10PayslipSource = fs.readFileSync("apps/web/src/modules/g10/PayslipView.tsx", "utf8");
const g11ConsoleSource = fs.readFileSync("apps/web/src/modules/g11/PensionCaseConsole.tsx", "utf8");
const g10WorkspaceSource = fs.readFileSync("apps/web/src/modules/g10/PayrollWorkspace.tsx", "utf8");
const g11WorkspaceSource = fs.readFileSync("apps/web/src/modules/g11/PensionWorkspace.tsx", "utf8");

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
const { PayrollRunConsole } = loadTsModule("apps/web/src/modules/g10/PayrollRunConsole.tsx");
const { PayslipView, maskFailClosed, formatMoneyCents } = loadTsModule("apps/web/src/modules/g10/PayslipView.tsx");
const { PensionCaseConsole } = loadTsModule("apps/web/src/modules/g11/PensionCaseConsole.tsx");

const ALL_PERMISSIONS = [
  "g10.payroll.read",
  "g10.salary.write",
  "g10.payroll.run.create",
  "g10.payroll.input.lock",
  "g10.payroll.compute",
  "g10.payroll.reconcile",
  "g10.payroll.approve",
  "g10.payroll.lock",
  "g10.payroll.disburse",
  "g11.pension.read",
  "g11.case.create",
  "g11.service.verify",
  "g11.pension.compute",
];

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// --- 1) The new surfaces are real controlled forms/actions wired to the client methods ---

test("PH-09E stub marker cards are gone from the G10/G11 workspaces", () => {
  assert.equal(g10WorkspaceSource.includes("evidence-line"), false, "PayrollWorkspace still carries the evidence-line stub card");
  assert.equal(g11WorkspaceSource.includes("evidence-line"), false, "PensionWorkspace still carries the evidence-line stub card");
});

test("PH-09E G10 run console wires the full lifecycle with per-state action gating", () => {
  for (const marker of [
    "<form",
    "onSubmit={handleStructureSubmit}",
    "onSubmit={handleCreateRunSubmit}",
    "onClick={() => handleLifecycleAction(action.verb)}",
    "lock-inputs",
    "compute",
    "reconcile",
    "approve",
    "disburse",
    "createPayrollRun",
    "actOnPayrollRun",
    "crypto.randomUUID()",
    "PAYROLL_SOD",
    'role="alert"',
    "No payroll runs yet",
    "no-permission",
  ]) {
    assert.equal(g10ConsoleSource.includes(marker), true, `PayrollRunConsole missing ${marker}`);
  }
});

test("PH-09E G10 payslip view renders component lines with fail-closed PAN/account masking", () => {
  for (const marker of [
    "Payslip",
    "PAN (masked)",
    "Salary bank account (masked)",
    "maskFailClosed",
    "[HIDDEN]",
    "getEmployeeProfile",
    "trace.map",
    "No payslips",
    'data-state="loading"',
    'role="alert"',
  ]) {
    assert.equal(g10PayslipSource.includes(marker), true, `PayslipView missing ${marker}`);
  }
});

test("PH-09E G11 console wires case intake, SR verification gate, and the estimator form", () => {
  for (const marker of [
    "onSubmit={handleCaseSubmit}",
    "onSubmit={handleVerifySubmit}",
    "onSubmit={handleEstimateSubmit}",
    "createPensionCase",
    "verifyPensionService",
    "estimatePensionBenefits",
    "SR_VERIFICATION_GATE",
    "ERR-G11-SCHEME-MISMATCH",
    "upsOptedIn",
    "npsEvent",
    'role="alert"',
    "no-permission",
  ]) {
    assert.equal(g11ConsoleSource.includes(marker), true, `PensionCaseConsole missing ${marker}`);
  }
});

test("PH-09E App mounts the compensation consoles behind the G10/G11 route guards", () => {
  for (const marker of ["PayrollRunConsole", "PensionCaseConsole"]) {
    assert.equal(appSource.includes(marker), true, `App missing ${marker}`);
  }
});

test("PH-09E client and fixture bind the run-lifecycle, payslip, and estimator routes", () => {
  for (const marker of ["/api/v1/payroll/runs", "/api/v1/payroll/salary-structures", "/api/v1/pension/cases"]) {
    assert.equal(clientSource.includes(marker), true, `client missing ${marker}`);
  }
  for (const marker of ["createPayrollRun", "actOnPayrollRun", "createSalaryStructure", "createPensionCase", "verifyPensionService", "estimatePensionBenefits"]) {
    assert.equal(clientSource.includes(marker), true, `client missing ${marker}`);
    assert.equal(fixtureSource.includes(marker), true, `fixture missing ${marker}`);
  }
});

// --- 2) The real client POSTs the PH-09 routes with an Idempotency-Key ---

test("PH-09E createPayrollRun and actOnPayrollRun POST the run lifecycle routes", async () => {
  const calls = [];
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, headers: new Headers(init.headers), body: JSON.parse(init.body) });
      return jsonResponse(202, {
        payrollRun: { id: "run-1", period: "2026-07", status: "COMPUTED", makerUserId: "usr-1", lines: [], totals: { grossCents: 0, deductionsCents: 0, netPayCents: 0 } },
      });
    },
  });
  await client.createPayrollRun("2026-07", "idem-ph09e-001");
  await client.actOnPayrollRun("run-1", "compute", "idem-ph09e-002");
  await client.actOnPayrollRun("run-1", "disburse", "idem-ph09e-003");
  assert.equal(calls[0].url, "/api/v1/payroll/runs");
  assert.equal(calls[0].body.period, "2026-07");
  assert.equal(calls[0].headers.get("Idempotency-Key"), "idem-ph09e-001");
  assert.equal(calls[1].url, "/api/v1/payroll/runs/run-1:compute");
  assert.equal(calls[2].url, "/api/v1/payroll/runs/run-1:disburse");
});

test("PH-09E estimatePensionBenefits POSTs :compute and round-trips the server figures untouched", async () => {
  const calls = [];
  const serverCalculation = {
    calculationId: "calc-1",
    scheme: "OPS",
    benefitOutcome: "FULL_PENSION",
    pensionCents: 5000000,
    trace: {
      marker: "PENSION_CALC_TRACE",
      ruleVersion: "PENSION-RULE-2026-01",
      ruleVersionRef: "limit-row-1",
      formula: "OPS: basic_pension=flat 50% of emoluments_base, E35 min/max clamped (FR-05 AC1/AC3)",
      inputs: { lastBasicPayCents: 10000000, qualifyingServiceMonths: 360 },
    },
  };
  const client = createHrmsClient({
    tokenProvider: () => "session-token-123",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return jsonResponse(202, {
        pensionCase: { id: "case-1", caseNo: "PEN/2026/00001", employeeId: "emp-1", separationDate: "2026-09-30", scheme: "OPS", status: "PENDING_SANCTION", calculation: serverCalculation },
      });
    },
  });
  const result = await client.estimatePensionBenefits("case-1", { asOf: "2026-09-30" }, "idem-ph09e-004");
  assert.equal(calls[0].url, "/api/v1/pension/cases/case-1:compute");
  assert.equal(calls[0].body.asOf, "2026-09-30");
  // The estimate is server-computed; the client returns the figures verbatim.
  assert.deepEqual(result.pensionCase.calculation, serverCalculation);
});

// --- 3) The fixture client honours the run state machine and scheme branching ---

test("PH-09E fixture drives the full run lifecycle and rejects out-of-order verbs", async () => {
  const fixture = createFixtureHrmsClient();
  const created = await fixture.createPayrollRun("2026-07", "idem-1");
  assert.equal(created.payrollRun.status, "OPEN");
  const runId = created.payrollRun.id;

  // compute before lock-inputs is invalid — the console never offers it, the API rejects it.
  await assert.rejects(
    () => fixture.actOnPayrollRun(runId, "compute", "idem-2"),
    (error) => error instanceof HrmsApiError && error.code === "PRECONDITION_FAILED"
  );
  // lock-inputs without a salary structure fails closed.
  await assert.rejects(
    () => fixture.actOnPayrollRun(runId, "lock-inputs", "idem-3"),
    (error) => error instanceof HrmsApiError && error.code === "PRECONDITION_FAILED"
  );

  await fixture.createSalaryStructure({ employeeId: "99999999-9999-9999-9999-999999999901", effectiveFrom: "2026-07-01", basicPayCents: 10000000 }, "idem-4");
  const locked = await fixture.actOnPayrollRun(runId, "lock-inputs", "idem-5");
  assert.equal(locked.payrollRun.status, "INPUT_LOCKED");
  assert.equal(typeof locked.payrollRun.ruleVersionSnapshot, "string");

  const computed = await fixture.actOnPayrollRun(runId, "compute", "idem-6");
  assert.equal(computed.payrollRun.status, "COMPUTED");
  assert.equal(computed.payrollRun.lines.length, 1);
  const line = computed.payrollRun.lines[0];
  assert.deepEqual(
    line.trace.map((step) => step.code),
    ["BASIC", "DA", "HRA", "NPS", "PT"]
  );
  assert.equal(line.grossCents - line.deductionsCents, line.netPayCents);

  const reconciled = await fixture.actOnPayrollRun(runId, "reconcile", "idem-7");
  assert.equal(reconciled.payrollRun.status, "RECONCILED");
  const approved = await fixture.actOnPayrollRun(runId, "approve", "idem-8");
  assert.equal(approved.payrollRun.status, "APPROVED");
  const lockedRun = await fixture.actOnPayrollRun(runId, "lock", "idem-9");
  assert.equal(lockedRun.payrollRun.status, "LOCKED");
  const disbursed = await fixture.actOnPayrollRun(runId, "disburse", "idem-10");
  assert.equal(disbursed.payrollRun.status, "DISBURSED");
  assert.equal(disbursed.payrollRun.bankBatch.marker, "BANK_X3_EXPORT");
  // A disbursed run accepts no further lifecycle verbs.
  await assert.rejects(
    () => fixture.actOnPayrollRun(runId, "disburse", "idem-11"),
    (error) => error instanceof HrmsApiError && error.code === "PRECONDITION_FAILED"
  );
});

test("PH-09E fixture estimator is scheme-branched and gated by service verification", async () => {
  const fixture = createFixtureHrmsClient();
  const opened = await fixture.createPensionCase({ employeeId: "emp-1", separationDate: "2026-09-30", scheme: "OPS" }, "idem-20");
  assert.equal(opened.pensionCase.status, "DRAFT");

  // Estimating before SR_VERIFICATION_GATE fails closed.
  await assert.rejects(
    () => fixture.estimatePensionBenefits(opened.pensionCase.id, {}, "idem-21"),
    (error) => error instanceof HrmsApiError && error.code === "PRECONDITION_FAILED"
  );

  const verified = await fixture.verifyPensionService(opened.pensionCase.id, { totalServiceMonths: 372, penaltyExclusionMonths: 12, srCertified: true }, "idem-22");
  assert.equal(verified.pensionCase.serviceVerification.qualifyingServiceMonths, 360);

  const ops = await fixture.estimatePensionBenefits(opened.pensionCase.id, {}, "idem-23");
  assert.equal(ops.pensionCase.calculation.benefitOutcome, "FULL_PENSION");
  assert.equal(ops.pensionCase.calculation.pensionCents, 5000000);

  // UPS without the opt-in flag fails with the scheme-mismatch code the form surfaces.
  const upsCase = await fixture.createPensionCase({ employeeId: "emp-2", separationDate: "2026-09-30", scheme: "UPS" }, "idem-24");
  await fixture.verifyPensionService(upsCase.pensionCase.id, { totalServiceMonths: 360, srCertified: true }, "idem-25");
  await assert.rejects(
    () => fixture.estimatePensionBenefits(upsCase.pensionCase.id, {}, "idem-26"),
    (error) => error instanceof HrmsApiError && error.code === "ERR-G11-SCHEME-MISMATCH"
  );
  const ups = await fixture.estimatePensionBenefits(upsCase.pensionCase.id, { upsOptedIn: true }, "idem-27");
  assert.equal(ups.pensionCase.calculation.benefitOutcome, "UPS_ASSURED");

  // NPS superannuation fabricates NO defined-benefit pension (indicative only).
  const npsCase = await fixture.createPensionCase({ employeeId: "emp-3", separationDate: "2026-09-30", scheme: "NPS" }, "idem-28");
  await fixture.verifyPensionService(npsCase.pensionCase.id, { totalServiceMonths: 360, srCertified: true }, "idem-29");
  const nps = await fixture.estimatePensionBenefits(npsCase.pensionCase.id, { npsEvent: "SUPERANNUATION" }, "idem-30");
  assert.equal(nps.pensionCase.calculation.benefitOutcome, "NPS_INDICATIVE");
  assert.equal(nps.pensionCase.calculation.pensionCents, 0);
  const npsDeath = await fixture.estimatePensionBenefits(npsCase.pensionCase.id, { npsEvent: "DEATH_IN_SERVICE" }, "idem-31");
  assert.equal(npsDeath.pensionCase.calculation.benefitOutcome, "NPS_DEFAULT_FAMILY");
});

// --- 4) Rendered canonical states + the masked-PAN negative assertion ---

test("PH-09E payslip view renders masked PAN and bank account; no raw PAN reaches the DOM", async () => {
  const fixture = createFixtureHrmsClient();
  await fixture.createSalaryStructure({ employeeId: "99999999-9999-9999-9999-999999999901", effectiveFrom: "2026-07-01", basicPayCents: 10000000 }, "idem-40");
  const created = await fixture.createPayrollRun("2026-07", "idem-41");
  await fixture.actOnPayrollRun(created.payrollRun.id, "lock-inputs", "idem-42");
  const computed = await fixture.actOnPayrollRun(created.payrollRun.id, "compute", "idem-43");

  const markup = renderToStaticMarkup(React.createElement(PayslipView, { client: fixture, run: computed.payrollRun }));
  // POSITIVE: the masked placeholders are shown for PAN and bank account.
  assert.match(markup, /PAN \(masked\)/);
  assert.match(markup, /Salary bank account \(masked\)/);
  assert.match(markup, /\[HIDDEN\]/);
  assert.match(markup, /data-masked="true"/);
  // NEGATIVE: no raw PAN (AAAAA9999A) ever reaches the DOM, and every masked identity
  // field renders exactly the fail-closed placeholder — never digits of a real value.
  assert.doesNotMatch(markup, /[A-Z]{5}[0-9]{4}[A-Z]/, "raw PAN pattern leaked into the payslip markup");
  const maskedFields = [...markup.matchAll(/<dd data-masked="true">([^<]*)<\/dd>/g)].map((match) => match[1]);
  assert.equal(maskedFields.length, 2, "expected exactly two masked identity fields (PAN + bank account)");
  for (const value of maskedFields) {
    assert.equal(value, "[HIDDEN]", `masked identity field leaked a value: ${value}`);
  }
  // The component lines and totals render from the computed run.
  for (const code of ["BASIC", "DA", "HRA", "NPS", "PT"]) {
    assert.equal(markup.includes(`<td>${code}</td>`), true, `payslip missing component line ${code}`);
  }
  assert.match(markup, /Net pay/);
  assert.equal(markup.includes(formatMoneyCents(computed.payrollRun.lines[0].netPayCents)), true, "net pay figure not rendered");
});

test("PH-09E maskFailClosed denies by default and never fabricates an unmasked value", () => {
  assert.equal(maskFailClosed(undefined), "[HIDDEN]");
  assert.equal(maskFailClosed(""), "[HIDDEN]");
  assert.equal(maskFailClosed("   "), "[HIDDEN]");
  assert.equal(maskFailClosed("xxxx-xxxx-1234"), "xxxx-xxxx-1234");
});

test("PH-09E run console renders empty state, forms, and the no-permission state", () => {
  const fixture = createFixtureHrmsClient();
  const markup = renderToStaticMarkup(React.createElement(PayrollRunConsole, { client: fixture, permissions: ALL_PERMISSIONS }));
  assert.match(markup, /Payroll Run Console/);
  assert.match(markup, /Salary structure form/);
  assert.match(markup, /Create payroll run form/);
  assert.match(markup, /No payroll runs yet/);
  assert.match(markup, /data-state="empty"/);
  assert.match(markup, /No payslips/);

  const denied = renderToStaticMarkup(React.createElement(PayrollRunConsole, { client: fixture, permissions: [] }));
  assert.match(denied, /data-state="no-permission"/);
  assert.doesNotMatch(denied, /Create payroll run form/);
});

test("PH-09E pension console renders case intake, verification, estimator, and states", () => {
  const fixture = createFixtureHrmsClient();
  const markup = renderToStaticMarkup(React.createElement(PensionCaseConsole, { client: fixture, permissions: ALL_PERMISSIONS }));
  assert.match(markup, /Pension Case Console/);
  assert.match(markup, /Pension case intake form/);
  assert.match(markup, /Service verification form/);
  assert.match(markup, /Pension benefit estimator form/);
  assert.match(markup, /No pension cases yet/);
  assert.match(markup, /No estimate yet/);
  assert.match(markup, /data-state="empty"/);

  const denied = renderToStaticMarkup(React.createElement(PensionCaseConsole, { client: fixture, permissions: [] }));
  assert.match(denied, /data-state="no-permission"/);
  assert.doesNotMatch(denied, /estimator form/);
});
