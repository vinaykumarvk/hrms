const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

// hr_admin capability audit — remaining task: G08 g08.apar.sealed.release (runtime:
// g08.apar.sealed.release + new g08_dual_control flag), G10 g10.fnf.settle (runtime:
// g10.fnf.settle sanction/pay stages, additive thin build), G12 g12.sr.append (verified: maps
// to the existing g12.sr.ingest route/permission, already gated, no change needed), G13
// g13.document.store (verified: maps to g13.document.create + g13.retention.class.define, both
// already exist and gated, no change needed), G13 g13.letter.author/letter_admin (new thin
// LetterTemplateService build), G14 g14.dashboard.view (verified: maps to g14.analytics.read on
// getDashboard(), already built/tested), G14 g14.report.build (new thin report-builder build).

function actor(userId, permissions, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions,
    roles: ["hr_admin"],
    fieldGrants: [],
    ...extra,
  };
}

function boot() {
  return createFoundationServices();
}

// ---- G08 g08.apar.sealed.release / g08_dual_control -----------------------------------------

test("g08.apar.sealed.release (post-hr_admin-goal fix): releasing a sealed cover requires the g08_dual_control capability", async () => {
  const services = boot();
  const opener = actor("hr-admin-g08-opener", ["*"], { roles: ["hr_admin"] });
  const sealed = services.apar.openForm(opener, {
    employeeId: ph03Ids.employee,
    periodStart: "2027-04-01",
    periodEnd: "2028-03-31",
    reportingOfficerId: ph03Ids.manager,
    reviewingOfficerId: ph03Ids.manager,
    acceptingAuthorityId: ph03Ids.manager,
    underCharge: true,
  });
  assert.equal(sealed.status, "SEALED_COVER");

  const hrAdminWithoutFlag = actor("hr-admin-g08-no-flag", ["g08.apar.sealed.release"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.apar.releaseSealedCover(hrAdminWithoutFlag, sealed.id, { reason: "Attempted release without dual-control flag" }),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );

  const dualControl = actor("hr-admin-g08-dual-control", ["g08.apar.sealed.release"], { roles: ["hr_admin", "g08_dual_control"] });
  const released = services.apar.releaseSealedCover(dualControl, sealed.id, { reason: "Vigilance clearance received" });
  assert.equal(released.status, "DISCLOSURE");
  assert.equal(released.sealedCover, false);
});

// ---- G10 g10.fnf.settle (sanction/pay stages) ------------------------------------------------

test("g10.fnf.settle sanction stage: requires the sanctioning_authority/hod capability and blocks creator self-sanction (SoD)", async () => {
  const services = boot();
  const maker = actor("hr-admin-g10-maker", ["g10.fnf.settle"], { roles: ["hr_admin"] });
  const settlement = services.compensationIntegration.settleFnf(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-12-31",
    finalMonthPayPaise: 3100000,
    leaveEncashmentPaise: 500000,
  });

  const hrAdminWithoutFlag = actor("hr-admin-g10-no-flag", ["g10.fnf.settle"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.compensationIntegration.sanctionFnfSettlement(hrAdminWithoutFlag, settlement.id),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );

  assert.throws(
    () => services.compensationIntegration.sanctionFnfSettlement(maker, settlement.id),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );

  const sanctioner = actor("hr-admin-g10-sanctioner", ["g10.fnf.settle"], { roles: ["hr_admin", "hod"] });
  const sanctioned = services.compensationIntegration.sanctionFnfSettlement(sanctioner, settlement.id);
  assert.ok(sanctioned.sanctionedBy);
  assert.ok(sanctioned.sanctionedAt);
});

test("g10.fnf.settle pay stage: requires the payroll_officer capability and only pays an APPROVED settlement", async () => {
  const services = boot();
  const maker = actor("hr-admin-g10-pay-maker", ["g10.fnf.settle"], { roles: ["hr_admin"] });
  const settlement = services.compensationIntegration.settleFnf(maker, {
    employeeId: ph03Ids.employee,
    separationDate: "2026-12-31",
    finalMonthPayPaise: 3100000,
  });

  const payer = actor("hr-admin-g10-payer", ["g10.fnf.settle"], { roles: ["hr_admin", "payroll_officer"] });
  assert.throws(
    () => services.compensationIntegration.payFnfSettlement(payer, settlement.id, { paymentRef: "PAY-REF-001" }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );

  const approver = actor("hr-admin-g10-approver", ["g10.fnf.settle", "g10.fnf.approve"], { roles: ["hr_admin"] });
  services.compensationIntegration.approveFnfSettlement(approver, settlement.id);

  const payerWithoutFlag = actor("hr-admin-g10-pay-no-flag", ["g10.fnf.settle"], { roles: ["hr_admin"] });
  assert.throws(
    () => services.compensationIntegration.payFnfSettlement(payerWithoutFlag, settlement.id, { paymentRef: "PAY-REF-002" }),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );

  const paid = services.compensationIntegration.payFnfSettlement(payer, settlement.id, { paymentRef: "PAY-REF-003" });
  assert.equal(paid.paymentRef, "PAY-REF-003");
  assert.ok(paid.paidBy);
  assert.ok(paid.paidAt);
});

// ---- G12 g12.sr.append (verification only — maps to g12.sr.ingest, already gated) -----------

test("g12.sr.append (verified, no change needed): maps to the existing g12.sr.ingest route, already permission-gated end to end", async () => {
  const services = boot();
  const api = createFoundationApi(services);
  const withoutPermission = actor("hr-admin-g12-no-perm", [], { roles: ["hr_admin"] });
  const forbidden = await api.dispatch({
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "X-Correlation-Id": "corr-hr-admin-g12", "Idempotency-Key": "idem-hr-admin-g12-forbidden-001" },
    actor: withoutPermission,
    body: {
      sourceModule: "G12_MANUAL",
      sourceReferenceId: "hr-admin-g12-audit-001",
      employeeId: ph03Ids.employee,
      eventTypeCode: "MANUAL_CORRECTION",
      eventDate: "2026-07-14",
      payload: { note: "hr_admin G12 capability audit" },
    },
  });
  assert.equal(forbidden.status, 403);

  const withPermission = actor("hr-admin-g12-with-perm", ["g12.sr.ingest"], { roles: ["hr_admin"] });
  const accepted = await api.dispatch({
    method: "POST",
    path: "/api/v1/sr/ingest",
    headers: { "X-Correlation-Id": "corr-hr-admin-g12", "Idempotency-Key": "idem-hr-admin-g12-accepted-001" },
    actor: withPermission,
    body: {
      sourceModule: "G12_MANUAL",
      sourceReferenceId: "hr-admin-g12-audit-002",
      employeeId: ph03Ids.employee,
      eventTypeCode: "MANUAL_CORRECTION",
      eventDate: "2026-07-14",
      payload: { note: "hr_admin G12 capability audit" },
    },
  });
  assert.equal(accepted.status, 201);
});

// ---- G13 g13.document.store (verification only — maps to document.create + retention.class.define)

test("g13.document.store (verified, no change needed): maps to g13.document.create + g13.retention.class.define, both already gated", async () => {
  const services = boot();
  const documentAdmin = actor("hr-admin-g13-doc-store", ["g13.document.create", "g13.retention.class.define"], { roles: ["hr_admin"] });
  const document = services.documentVault.createDocument(documentAdmin, {
    title: "hr_admin G13 document.store capability audit",
    ownerEmployeeId: ph03Ids.employee,
    classification: "INTERNAL",
    content: "Storage/retention profile audit content",
  });
  assert.ok(document.id);
  const retentionClass = services.documentVault.defineRetentionClass(documentAdmin, {
    code: `HR-ADMIN-AUDIT-${document.id}`,
    name: "hr_admin capability audit retention profile",
    retentionPeriodMonths: 60,
    dispositionAction: "REVIEW",
  });
  assert.ok(retentionClass.code);
});

// ---- G13 g13.letter.author / letter_admin (new thin build) -----------------------------------

test("g13.letter.author: author a template, generate a letter, and enforce generator!=certifier SoD", async () => {
  const services = boot();
  const author = actor("hr-admin-g13-letter-author", ["g13.letter.author"], { roles: ["hr_admin"] });
  const template = services.letterTemplate.authorTemplate(author, {
    templateCode: "TRANSFER-ORDER-COVER",
    title: "Transfer Order Cover Letter",
    bodyText: "This is to inform {{employeeName}} of transfer effective {{effectiveDate}}.",
    mergeFields: ["employeeName", "effectiveDate"],
  });
  assert.equal(template.status, "ACTIVE");

  const listed = services.letterTemplate.listTemplates(author);
  assert.ok(listed.some((t) => t.id === template.id));

  const generated = services.letterTemplate.generateLetter(author, {
    templateId: template.id,
    employeeId: ph03Ids.employee,
    mergeValues: { employeeName: "Kiran Patel", effectiveDate: "2026-08-01" },
  });
  assert.ok(generated.renderedText.includes("Kiran Patel"));
  assert.ok(generated.documentId);

  assert.throws(
    () => services.letterTemplate.certifyGeneratedCopy(author, generated.id),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );

  const certifier = actor("hr-admin-g13-letter-certifier", ["g13.letter.author"], { roles: ["hr_admin"] });
  const certified = services.letterTemplate.certifyGeneratedCopy(certifier, generated.id);
  assert.ok(certified.certifiedByUserId);
  assert.ok(certified.certifiedAt);

  const withoutFlag = actor("hr-admin-g13-letter-no-perm", [], { roles: ["hr_admin"] });
  assert.throws(
    () => services.letterTemplate.listTemplates(withoutFlag),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );
});

// ---- G14 g14.dashboard.view (verification only — maps to g14.analytics.read on getDashboard())

test("g14.dashboard.view (verified, no change needed): maps to g14.analytics.read on the existing executive dashboard read", async () => {
  const services = boot();
  const withoutPermission = actor("hr-admin-g14-dash-no-perm", [], { roles: ["hr_admin"] });
  assert.throws(
    () => services.analytics.getDashboard(withoutPermission),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );
  const withPermission = actor("hr-admin-g14-dash-with-perm", ["g14.analytics.read"], { roles: ["hr_admin"] });
  const dashboard = services.analytics.getDashboard(withPermission);
  assert.equal(dashboard.id, "g14-executive-readiness");
});

// ---- G14 g14.report.build (new thin build) ----------------------------------------------------

test("g14.report.build: define a report over mart cards, build JSON/CSV output, and schedule distribution", async () => {
  const services = boot();
  const builder = actor("hr-admin-g14-report-builder", ["g14.report.build"], { roles: ["hr_admin"] });
  const definition = services.analytics.defineReport(builder, {
    name: "Headcount and payroll snapshot",
    cardCodes: ["EMPLOYEE_HEADCOUNT", "PAYROLL_LOCKED"],
    format: "JSON",
  });
  assert.equal(definition.cardCodes.length, 2);

  assert.throws(
    () => services.analytics.defineReport(builder, { name: "Bad report", cardCodes: ["NOT_A_REAL_CARD"], format: "JSON" }),
    (error) => error instanceof FoundationError && error.code === "VALIDATION_FAILED"
  );

  const jsonOutput = services.analytics.buildReport(builder, definition.id);
  const parsed = JSON.parse(jsonOutput.content);
  assert.equal(parsed.length, 2);

  const csvDefinition = services.analytics.defineReport(builder, {
    name: "Headcount CSV export",
    cardCodes: ["EMPLOYEE_HEADCOUNT"],
    format: "CSV",
  });
  const csvOutput = services.analytics.buildReport(builder, csvDefinition.id);
  assert.match(csvOutput.content, /^code,label,value,sourceModules/);

  const schedule = services.analytics.scheduleReport(builder, {
    reportDefinitionId: definition.id,
    cronExpression: "0 6 1 * *",
    recipients: ["hr-desk@example.gov"],
  });
  assert.equal(schedule.active, true);
  const schedules = services.analytics.listScheduledReports(builder);
  assert.ok(schedules.some((s) => s.id === schedule.id));

  const withoutFlag = actor("hr-admin-g14-report-no-perm", [], { roles: ["hr_admin"] });
  assert.throws(
    () => services.analytics.listReportDefinitions(withoutFlag),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );
});
