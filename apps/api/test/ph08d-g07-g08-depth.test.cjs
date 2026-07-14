// PH-08D: G07 training + G08 APAR to BRD depth.
// G07 (docs/brd/v3/G07-training-skill-development.md): skills/competencies taxonomy + role
// competency models + employee skill inventory + gap analysis (skill_gap_analyses/items), the
// versioned READ-ONLY Gap Contract route consumed by G06/G08 (FR-G07-024), certification
// validity/renewal with the JOB-G07-CERTEXPIRY lapsed_mandatory flip, and campaign engine
// basics (waves + escalation_level, FR-G07-017).
// G08 (docs/brd/v3/G08-performance-appraisal-management.md): appraisal_cycles/templates/
// rating_scales masters, goal lock under the NAMED VAL-WEIGHTAGE/WSUM validation
// (ERR-G08-WEIGHTAGE), disclosure + representation window (ERR-G08-REPWINDOW), multi-RO
// part-period supervision-weighted aggregation with No-Report (VAL-G08-SUPV), and SLA
// escalation transferring authoring rights (is_escalated_author). Every negative asserts the
// thrown error.code directly — no marker-string indirection.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph08d-maker",
    actorUserId: "user-ph08d-maker",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08d",
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------
// G07 fixtures
// ---------------------------------------------------------------------------------------

/** Taxonomy + role competency model: two competencies, one critical, targets L3/L2. */
function taxonomyFixture(services) {
  const category = services.training.defineSkillCategory(actor(), { code: "CAT-DIGITAL", name: "Digital Governance" });
  const skillGis = services.training.defineSkill(actor(), { skillCategoryId: category.id, code: "SKL-GIS", name: "GIS Mapping" });
  const skillCyber = services.training.defineSkill(actor(), {
    skillCategoryId: category.id,
    code: "SKL-CYBER",
    name: "Cyber Hygiene",
    isComplianceSkill: true,
    defaultValidityMonths: 12,
  });
  const compGis = services.training.defineCompetency(actor(), {
    code: "CMP-GIS",
    name: "Geospatial Analysis",
    competencyType: "FUNCTIONAL",
    linkedSkillIds: [skillGis.id],
  });
  const compCyber = services.training.defineCompetency(actor(), {
    code: "CMP-CYBER",
    name: "Cyber Awareness",
    competencyType: "DIGITAL",
    linkedSkillIds: [skillCyber.id],
  });
  const model = services.training.defineCompetencyModel(actor(), {
    code: "MODEL-REV-INSPECTOR",
    name: "Revenue Inspector Competency Model",
    scopeType: "ROLE",
    scopeRef: "role-revenue-inspector",
    ownerEmployeeId: ph03Ids.manager,
    reviewDueDate: "2027-01-01",
    items: [
      { competencyId: compGis.id, targetProficiencyLevel: 3, isCritical: true },
      { competencyId: compCyber.id, targetProficiencyLevel: 2 },
    ],
  });
  return { category, skillGis, skillCyber, compGis, compCyber, model };
}

/** Completed nomination producing a certification (optionally mandatory with validity). */
function issueCertification(services, options = {}) {
  const session = services.training.createSession(actor(), {
    programCode: options.programCode ?? "PRG-CYBER",
    title: "Mandatory Cyber Hygiene",
    capacity: 5,
  });
  const nomination = services.training.nominate(actor(), { sessionId: session.id, employeeId: ph03Ids.employee });
  services.training.approveNomination(actor(), nomination.id);
  const completed = services.training.completeNomination(actor(), nomination.id, {
    passed: true,
    significantForSr: false,
    completionDate: options.completionDate ?? "2026-07-01",
    idempotencyKey: options.idempotencyKey ?? `idem-ph08d-cert-${Math.random().toString(36).slice(2, 10)}`,
    validUntil: options.validUntil,
    isMandatory: options.isMandatory,
    renewalOfCertificationId: options.renewalOfCertificationId,
  });
  return completed.certification;
}

// ---------------------------------------------------------------------------------------
// (1) G07 taxonomy -> inventory -> gap analysis: skill_gap_items from model vs validated skills
// ---------------------------------------------------------------------------------------

test("PH-08D G07 gap analysis diffs the role competency model against the validated employee skill inventory", () => {
  const services = createFoundationServices();
  const { skillGis, compGis, compCyber, model } = taxonomyFixture(services);

  // Inventory: GIS validated at L1 (gap 2 vs target 3); cyber skill absent (gap 2 vs target 2).
  services.training.recordEmployeeSkill(actor(), {
    employeeId: ph03Ids.employee,
    skillId: skillGis.id,
    currentProficiencyLevel: 1,
    source: "ASSESSMENT",
    validatedBy: ph03Ids.manager,
  });

  const run = services.training.runSkillGapAnalysis(actor(), {
    employeeId: ph03Ids.employee,
    competencyModelId: model.id,
    generatedOn: "2026-07-02",
  });
  assert.equal(run.analysis.status, "FINALIZED");
  assert.equal(run.items.length, 2, "one skill_gap_item per competency_model_item");
  const gisItem = run.items.find((item) => item.competencyId === compGis.id);
  assert.equal(gisItem.gapSize, 2, "VAL-G07-GAPSIZE: gap = max(0, target 3 - current 1)");
  assert.equal(gisItem.isCritical, true);
  const cyberItem = run.items.find((item) => item.competencyId === compCyber.id);
  assert.equal(cyberItem.currentProficiencyLevel, undefined, "no inventory row = no current level");
  assert.equal(cyberItem.gapSize, 2);
  assert.equal(run.analysis.criticalGapCount, 1);
});

test("PH-08D G07 unvalidated/self-declared skills do not close a gap (discounted, FR-G07-008)", () => {
  const services = createFoundationServices();
  const { skillGis, compGis, model } = taxonomyFixture(services);
  // Self-declared, never validated — must not count toward the model target.
  services.training.recordEmployeeSkill(actor(), { employeeId: ph03Ids.employee, skillId: skillGis.id, currentProficiencyLevel: 3, source: "SELF" });
  const run = services.training.runSkillGapAnalysis(actor(), {
    employeeId: ph03Ids.employee,
    competencyModelId: model.id,
    generatedOn: "2026-07-02",
  });
  const gisItem = run.items.find((item) => item.competencyId === compGis.id);
  assert.equal(gisItem.gapSize, 3, "unvalidated level is excluded from the reckoning");
  assert.equal(gisItem.discountedForStaleness, true, "the unusable declaration is flagged as discounted");
});

// ---------------------------------------------------------------------------------------
// (2) FR-G07-024: versioned READ-ONLY Gap Contract published by G07, consumed by G06/G08
// ---------------------------------------------------------------------------------------

test("PH-08D G07 Gap Contract is published versioned and read-only; recompute supersedes v1 with v2", () => {
  const services = createFoundationServices();
  const { skillGis, skillCyber, compGis, model } = taxonomyFixture(services);
  services.training.recordEmployeeSkill(actor(), {
    employeeId: ph03Ids.employee,
    skillId: skillGis.id,
    currentProficiencyLevel: 1,
    validatedBy: ph03Ids.manager,
  });

  const first = services.training.runSkillGapAnalysis(actor(), {
    employeeId: ph03Ids.employee,
    competencyModelId: model.id,
    generatedOn: "2026-07-02",
  });
  assert.equal(first.gapContract.contractVersion, 1, "first publication is Gap Contract v1");
  assert.equal(first.gapContract.status, "CURRENT");

  // §10.6 contract shape: the guaranteed primitive G06/G08 consume.
  const contract = services.training.getGapContract(actor(), { employeeId: ph03Ids.employee, competencyModelId: model.id });
  assert.equal(contract.employeeId, ph03Ids.employee);
  assert.equal(contract.competencyModelId, model.id);
  assert.equal(contract.generatedOn, "2026-07-02");
  assert.equal(contract.scoringMode, "BINARY");
  assert.equal(contract.modelStaleFlag, false);
  assert.equal(contract.items.length, 2, "every positive gap appears as {competencyId,isCritical,gapSize}");
  assert.ok(contract.items.every((item) => item.gapSize > 0 && typeof item.isCritical === "boolean"));
  // READ-ONLY for consumers: the projection is frozen — G06/G08 cannot mutate G07 state through it.
  assert.equal(Object.isFrozen(contract), true, "Gap Contract is served frozen (read-only)");
  assert.ok(contract.items.every((item) => Object.isFrozen(item)));

  // Skill improves and validation lands -> recompute publishes v2 and supersedes v1.
  services.training.recordEmployeeSkill(actor(), {
    employeeId: ph03Ids.employee,
    skillId: skillGis.id,
    currentProficiencyLevel: 3,
    validatedBy: ph03Ids.manager,
  });
  services.training.recordEmployeeSkill(actor(), {
    employeeId: ph03Ids.employee,
    skillId: skillCyber.id,
    currentProficiencyLevel: 2,
    validatedBy: ph03Ids.manager,
  });
  const second = services.training.runSkillGapAnalysis(actor(), {
    employeeId: ph03Ids.employee,
    competencyModelId: model.id,
    generatedOn: "2026-07-15",
  });
  assert.equal(second.gapContract.contractVersion, 2, "recompute publishes the next contract version");
  assert.equal(second.gapContract.items.length, 0, "all gaps closed by fresh validated skills");
  const current = services.training.getGapContract(actor(), { employeeId: ph03Ids.employee, competencyModelId: model.id });
  assert.equal(current.contractVersion, 2, "consumers always read the CURRENT version");
  assert.equal(current.items.find((item) => item.competencyId === compGis.id), undefined);
});

test("PH-08D G07 route: G06/G08 consume the Gap Contract via GET /api/v1/gap-contract/v1, never G07 internals", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const { skillGis, model } = taxonomyFixture(services);
  services.training.recordEmployeeSkill(actor(), {
    employeeId: ph03Ids.employee,
    skillId: skillGis.id,
    currentProficiencyLevel: 1,
    validatedBy: ph03Ids.manager,
  });
  services.training.runSkillGapAnalysis(actor(), { employeeId: ph03Ids.employee, competencyModelId: model.id, generatedOn: "2026-07-02" });

  const response = api.dispatch({
    method: "GET",
    path: "/api/v1/gap-contract/v1",
    headers: { "X-Correlation-Id": "corr-ph08d-gap-contract" },
    query: { employeeId: ph03Ids.employee, modelId: model.id },
    actor: actor(),
  });
  assert.equal(response.status, 200, "the gap-contract route serves the versioned projection");
  assert.equal(response.body.gapContract.contractVersion, 1);
  assert.equal(response.body.gapContract.employeeId, ph03Ids.employee);
  assert.ok(Array.isArray(response.body.gapContract.items));

  // An unpublished (employee, model) pair fails closed — consumers cannot infer G07 internals.
  const missing = api.dispatch({
    method: "GET",
    path: "/api/v1/gap-contract/v1",
    headers: { "X-Correlation-Id": "corr-ph08d-gap-contract-miss" },
    query: { employeeId: ph03Ids.manager, modelId: model.id },
    actor: actor(),
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});

// ---------------------------------------------------------------------------------------
// (3) FR-G07-012 AC.6-8: cert validity/renewal — JOB-G07-CERTEXPIRY flips lapsed_mandatory
// ---------------------------------------------------------------------------------------

test("PH-08D G07 JOB-G07-CERTEXPIRY flips lapsed_mandatory on an un-renewed mandatory cert from valid_until evidence", () => {
  const services = createFoundationServices();
  const cert = issueCertification(services, { validUntil: "2026-12-31", isMandatory: true });
  assert.equal(cert.lapsedMandatory, false, "a live mandatory cert is not lapsed");

  // Before valid_until the job is a no-op for this cert.
  const early = services.training.runCertExpiryJob(actor(), { asOf: "2026-08-01" });
  assert.equal(early.expired, 0);
  assert.equal(services.training.getCertification(actor(), cert.id).status, "ACTIVE");

  // After valid_until, un-renewed: EXPIRED + lapsed_mandatory=true (consumed by G06).
  const run = services.training.runCertExpiryJob(actor(), { asOf: "2027-01-15" });
  assert.equal(run.expired, 1);
  assert.equal(run.lapsedMandatory, 1);
  const lapsed = services.training.getCertification(actor(), cert.id);
  assert.equal(lapsed.status, "EXPIRED");
  assert.equal(lapsed.lapsedMandatory, true, "mandatory cert expired un-renewed -> lapsed_mandatory flips true");
});

test("PH-08D G07 a renewed mandatory cert expires WITHOUT the lapsed_mandatory flag (renewal keeps currency)", () => {
  const services = createFoundationServices();
  const original = issueCertification(services, { validUntil: "2026-12-31", isMandatory: true, programCode: "PRG-CYBER-A" });
  const renewal = issueCertification(services, {
    validUntil: "2027-12-31",
    isMandatory: true,
    programCode: "PRG-CYBER-B",
    completionDate: "2026-11-01",
    renewalOfCertificationId: original.id,
  });
  assert.equal(renewal.renewalOfCertificationId, original.id, "renewal chain recorded");

  const run = services.training.runCertExpiryJob(actor(), { asOf: "2027-01-15" });
  assert.equal(run.expired, 1, "only the outdated original expires");
  const expired = services.training.getCertification(actor(), original.id);
  assert.equal(expired.status, "EXPIRED");
  assert.equal(expired.renewedByCertificationId, renewal.id);
  assert.equal(expired.lapsedMandatory, false, "renewed mandatory cert never flips lapsed_mandatory");
  assert.equal(services.training.getCertification(actor(), renewal.id).status, "ACTIVE");
});

// ---------------------------------------------------------------------------------------
// (4) FR-G07-017 campaign engine: wave assignment + escalation_level
// ---------------------------------------------------------------------------------------

test("PH-08D G07 campaign assigns capacity-bounded waves and escalates overdue targets (escalation_level)", () => {
  const services = createFoundationServices();
  const campaign = services.training.createCampaign(actor(), {
    code: "CAMP-CYBER-2026",
    name: "Annual Cyber Hygiene Campaign",
    programCode: "PRG-CYBER",
    windowStart: "2026-07-01",
    windowEnd: "2026-09-30",
    waveSize: 1,
  });
  assert.equal(campaign.status, "LAUNCHED");

  const targets = services.training.addCampaignTargets(actor(), campaign.id, {
    employeeIds: [ph03Ids.employee, ph03Ids.manager],
    dueDate: "2026-08-15",
  });
  assert.equal(targets.length, 2, "one campaign_targets row per employee");
  assert.equal(targets[0].waveNo, 1, "wave_size=1: first target lands in wave 1");
  assert.equal(targets[1].waveNo, 2, "second target auto-waves into wave 2");
  assert.ok(targets.every((target) => target.escalationLevel === 0 && target.targetStatus === "PENDING"));

  // Re-adding the same employee is idempotent — no duplicate target line.
  const repeat = services.training.addCampaignTargets(actor(), campaign.id, { employeeIds: [ph03Ids.employee], dueDate: "2026-08-15" });
  assert.equal(repeat.length, 0);

  // Before the due date nothing escalates; after it every incomplete target gains a level.
  assert.equal(services.training.escalateCampaignTargets(actor(), campaign.id, { asOf: "2026-08-10" }).length, 0);
  const escalated = services.training.escalateCampaignTargets(actor(), campaign.id, { asOf: "2026-08-20" });
  assert.equal(escalated.length, 2);
  assert.ok(escalated.every((target) => target.escalationLevel === 1 && target.targetStatus === "OVERDUE"));
  const again = services.training.escalateCampaignTargets(actor(), campaign.id, { asOf: "2026-09-20" });
  assert.ok(again.every((target) => target.escalationLevel === 2), "each escalation pass raises escalation_level");
});

// ---------------------------------------------------------------------------------------
// G08 fixtures
// ---------------------------------------------------------------------------------------

function aparMasters(services, overrides = {}) {
  const scale = services.apar.defineRatingScale(actor(), {
    scaleCode: "SCALE-10",
    name: "APAR 1-10",
    minValue: 1,
    maxValue: 10,
    benchmarkGrade: 6,
    adverseThreshold: 4,
  });
  const template = services.apar.defineAppraisalTemplate(actor(), { templateCode: "TPL-APAR-STD", name: "Standard APAR Template" });
  const cycle = services.apar.defineAppraisalCycle(actor(), {
    cycleCode: "CY-2026-27",
    name: "APAR Cycle 2026-27",
    fiscalYear: "2026-27",
    appraisalPeriodStart: "2026-04-01",
    appraisalPeriodEnd: "2027-03-31",
    templateId: template.id,
    ratingScaleId: scale.id,
    representationWindowDays: overrides.representationWindowDays ?? 30,
    minSupervisionMonths: overrides.minSupervisionMonths ?? 3,
  });
  return { scale, template, cycle };
}

function openCycleForm(services, cycle) {
  return services.apar.openForm(actor(), {
    employeeId: ph03Ids.employee,
    periodStart: "2026-04-01",
    periodEnd: "2027-03-31",
    reportingOfficerId: ph03Ids.manager,
    reviewingOfficerId: ph03Ids.manager,
    acceptingAuthorityId: ph03Ids.manager,
    cycleId: cycle.id,
  });
}

function finalisedForm(services, cycle) {
  const form = openCycleForm(services, cycle);
  services.apar.submitSelf(actor(), form.id, { narrative: "Achievements recorded for this cycle" });
  services.apar.recordReporting(actor(), form.id, { grade: "8", narrative: "Consistently exceeds targets" });
  services.apar.recordReview(actor(), form.id, { concur: true, remarks: "Concur" });
  return services.apar.accept(actor(), form.id, { finalGrade: "8" });
}

// ---------------------------------------------------------------------------------------
// (5) G08 masters: appraisal_cycles + appraisal_templates + rating_scales persisted
// ---------------------------------------------------------------------------------------

test("PH-08D G08 appraisal cycle/template/rating scale masters persist with window + SUPV thresholds", () => {
  const services = createFoundationServices();
  const { scale, template, cycle } = aparMasters(services);
  assert.equal(scale.status, "ACTIVE");
  assert.equal(template.weightagePolicy.performanceSum, 100, "R21: performance goals sum to 100");
  assert.equal(template.weightagePolicy.developmentInSum, false, "DEVELOPMENT sits outside the performance sum");
  assert.equal(cycle.representationWindowDays, 30, "E1 representation_window_days (VAL-G08-REPWINDOW)");
  assert.equal(cycle.minSupervisionMonths, 3, "E1 min_supervision_months (VAL-G08-SUPV)");

  // A cycle must cite real persisted masters — dangling refs fail closed.
  assert.throws(
    () =>
      services.apar.defineAppraisalCycle(actor(), {
        cycleCode: "CY-BAD",
        name: "Dangling",
        fiscalYear: "2026-27",
        appraisalPeriodStart: "2026-04-01",
        appraisalPeriodEnd: "2027-03-31",
        templateId: "missing-template",
        ratingScaleId: scale.id,
      }),
    (error) => error instanceof FoundationError && error.code === "NOT_FOUND"
  );
});

// ---------------------------------------------------------------------------------------
// (6) VAL-WEIGHTAGE/WSUM at goal lock: != 100 rejected with ERR-G08-WEIGHTAGE (negative)
// ---------------------------------------------------------------------------------------

test("PH-08D G08 goal lock enforces VAL-WEIGHTAGE/WSUM: performance weightages != 100 throw ERR-G08-WEIGHTAGE", () => {
  const services = createFoundationServices();
  const { cycle } = aparMasters(services);
  const form = openCycleForm(services, cycle);

  services.apar.addGoal(actor(), form.id, { title: "Revenue collection drive", goalType: "PERFORMANCE", weightage: 60 });
  services.apar.addGoal(actor(), form.id, { title: "Survey digitisation", goalType: "PERFORMANCE", weightage: 30 });
  // DEVELOPMENT goals are EXCLUDED from the 100% performance sum (R21).
  services.apar.addGoal(actor(), form.id, { title: "Attend GIS training", goalType: "DEVELOPMENT", weightage: 50 });

  // 60 + 30 = 90 != 100 -> the named WSUM validation fails closed; nothing locks, no snapshot.
  assert.throws(
    () => services.apar.lockGoals(actor(), form.id, { lockedAt: "2026-05-01" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G08-WEIGHTAGE"
  );
  assert.equal(services.apar.listGoalSnapshots(actor(), form.id).length, 0, "failed lock writes no E20 snapshot");

  // Topping performance up to exactly 100 locks and snapshots all goals (snapshot-on-lock, E20).
  services.apar.addGoal(actor(), form.id, { title: "Grievance disposal", goalType: "PERFORMANCE", weightage: 10 });
  const locked = services.apar.lockGoals(actor(), form.id, { lockedAt: "2026-05-01" });
  assert.equal(locked.form.goalsLocked, true);
  assert.equal(locked.snapshots.length, 4, "snapshot covers performance AND development goals");
  assert.equal(
    locked.snapshots.filter((snapshot) => snapshot.goalType === "PERFORMANCE").reduce((sum, snapshot) => sum + snapshot.weightage, 0),
    100
  );

  // The snapshot is immutable: adding goals after lock fails closed.
  assert.throws(
    () => services.apar.addGoal(actor(), form.id, { title: "Late goal", goalType: "PERFORMANCE", weightage: 5 }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
});

test("PH-08D G08 route: locking unbalanced goals returns 422 with error.code ERR-G08-WEIGHTAGE on the wire", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const { cycle } = aparMasters(services);
  const form = openCycleForm(services, cycle);
  services.apar.addGoal(actor(), form.id, { title: "Only goal", goalType: "PERFORMANCE", weightage: 55 });

  const response = api.dispatch({
    method: "POST",
    path: `/api/v1/apar/forms/${form.id}:lock-goals`,
    headers: { "X-Correlation-Id": "corr-ph08d-wsum", "Idempotency-Key": "idem-ph08d-lock-001" },
    body: { lockedAt: "2026-05-01" },
    actor: actor(),
  });
  assert.equal(response.status, 422, "BRD §9: ERR-G08-WEIGHTAGE is 422 VALIDATION_FAILED");
  assert.equal(response.body.error.code, "ERR-G08-WEIGHTAGE");
  assert.equal(response.body.error.details.validation, "VAL-WEIGHTAGE/WSUM", "the validation is named, not anonymous");
});

// ---------------------------------------------------------------------------------------
// (7) Disclosure + representation window: elapsed window throws ERR-G08-REPWINDOW (negative)
// ---------------------------------------------------------------------------------------

test("PH-08D G08 disclosure starts the representation-window clock; in-window representation files cleanly", () => {
  const services = createFoundationServices();
  const { cycle } = aparMasters(services);
  const form = finalisedForm(services, cycle);

  const disclosed = services.apar.discloseToEmployee(actor(), form.id, { dispatchedOn: "2026-07-10" });
  assert.equal(disclosed.form.disclosedOn, "2026-07-10");
  assert.equal(disclosed.form.representationDueBy, "2026-08-09", "due = dispatch + representation_window_days (30)");
  assert.equal(disclosed.disclosure.eventType, "DISPATCHED");
  assert.equal(disclosed.disclosure.seqNo, 1, "disclosure ledger is append-only with monotonic seq_no");

  const representation = services.apar.fileRepresentation(actor(), form.id, {
    filedOn: "2026-08-05",
    grounds: "Adverse remark not substantiated by cited evidence",
  });
  assert.equal(representation.status, "FILED");
  assert.equal(representation.isLate, false);
  assert.equal(representation.slaDueAt, "2026-08-09");
});

test("PH-08D G08 a representation after the window elapsed throws ERR-G08-REPWINDOW; condonation admits it as late", () => {
  const services = createFoundationServices();
  const { cycle } = aparMasters(services);
  const form = finalisedForm(services, cycle);
  services.apar.discloseToEmployee(actor(), form.id, { dispatchedOn: "2026-07-10" });

  // Window elapsed (due 2026-08-09): fail-closed with the BRD code as error.code.
  assert.throws(
    () =>
      services.apar.fileRepresentation(actor(), form.id, {
        filedOn: "2026-09-15",
        grounds: "Filed after the window",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G08-REPWINDOW"
  );

  // Condonation (flag g08.condonation) is the only path in after the window — recorded as late+condoned.
  const condoned = services.apar.fileRepresentation(actor(), form.id, {
    filedOn: "2026-09-15",
    grounds: "Condoned late filing on medical grounds",
    condoned: true,
  });
  assert.equal(condoned.isLate, true);
  assert.equal(condoned.condoned, true);

  // Representation before disclosure is impossible — the clock starts at dispatch.
  const undisclosed = finalisedForm(services, cycle);
  assert.throws(
    () => services.apar.fileRepresentation(actor(), undisclosed.id, { filedOn: "2026-07-01", grounds: "No disclosure yet" }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
});

// ---------------------------------------------------------------------------------------
// (8) Multi-RO part-period: No-Report below min_supervision_months; supervision-weighted aggregate
// ---------------------------------------------------------------------------------------

test("PH-08D G08 multi-RO part-periods aggregate supervision-weighted; below-threshold supervision yields No-Report", () => {
  const services = createFoundationServices();
  const { cycle } = aparMasters(services, { minSupervisionMonths: 3 });
  const form = openCycleForm(services, cycle);

  const first = services.apar.addReportPeriod(actor(), form.id, {
    sequenceNo: 1,
    periodStart: "2026-04-01",
    periodEnd: "2026-08-31",
    reportingOfficerId: ph03Ids.manager,
    supervisionMonths: 5,
    partPeriodGrade: 8,
  });
  assert.equal(first.status, "ASSESSED");
  const second = services.apar.addReportPeriod(actor(), form.id, {
    sequenceNo: 2,
    periodStart: "2026-09-01",
    periodEnd: "2026-12-31",
    reportingOfficerId: ph03Ids.manager,
    supervisionMonths: 4,
    partPeriodGrade: 6,
  });
  assert.equal(second.status, "ASSESSED");
  // VAL-G08-SUPV: 2 months < min_supervision_months 3 -> No-Report Certificate, never a grade.
  const short = services.apar.addReportPeriod(actor(), form.id, {
    sequenceNo: 3,
    periodStart: "2027-01-01",
    periodEnd: "2027-02-28",
    reportingOfficerId: ph03Ids.manager,
    supervisionMonths: 2,
    partPeriodGrade: 10,
  });
  assert.equal(short.noReportCertificate, true, "supervision below threshold yields a No-Report Certificate");
  assert.equal(short.status, "NO_REPORT");
  assert.equal(short.partPeriodGrade, undefined, "a No-Report period carries no grade");

  // FR-G08-18: provisional grade = (5x8 + 4x6) / 9 = 7.11 — NO_REPORT period excluded.
  const aggregated = services.apar.aggregateProvisionalGrade(actor(), form.id);
  assert.equal(aggregated.provisionalGrade, 7.11, "supervision-weighted aggregate excludes No-Report periods");
  const periods = services.apar.listReportPeriods(actor(), form.id);
  assert.equal(periods.find((period) => period.sequenceNo === 1).weightInAggregate, 55.56, "5/9 supervision share");
  assert.equal(periods.find((period) => period.sequenceNo === 2).weightInAggregate, 44.44, "4/9 supervision share");
  assert.equal(periods.find((period) => period.sequenceNo === 3).weightInAggregate, 0, "No-Report weighs nothing");

  // P02 SoD: the appraisee can never author their own part-period.
  assert.throws(
    () =>
      services.apar.addReportPeriod(actor(), form.id, {
        sequenceNo: 4,
        periodStart: "2027-03-01",
        periodEnd: "2027-03-31",
        reportingOfficerId: ph03Ids.employee,
        supervisionMonths: 4,
        partPeriodGrade: 10,
      }),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );
});

// ---------------------------------------------------------------------------------------
// (9) SLA escalation: authoring right transfers and is_escalated_author is recorded (R9)
// ---------------------------------------------------------------------------------------

test("PH-08D G08 SLA escalation transfers the authoring right and marks is_escalated_author=true", () => {
  const services = createFoundationServices();
  const { cycle } = aparMasters(services);
  const form = openCycleForm(services, cycle);
  services.apar.addReportPeriod(actor(), form.id, {
    sequenceNo: 1,
    periodStart: "2026-04-01",
    periodEnd: "2027-03-31",
    reportingOfficerId: ph03Ids.manager,
    supervisionMonths: 12,
    partPeriodGrade: 7,
  });

  const escalated = services.apar.escalateReportPeriodAuthor(actor(), form.id, {
    sequenceNo: 1,
    escalatedToEmployeeId: ph03Ids.manager,
    reason: "RO tier SLA missed beyond reminder grace",
  });
  assert.equal(escalated.isEscalatedAuthor, true, "escalated assessment records is_escalated_author=true");
  assert.equal(escalated.escalatedAuthorId, ph03Ids.manager);
  assert.equal(escalated.reportingOfficerId, ph03Ids.manager, "authoring right transferred to the higher authority");
  const persisted = services.apar.listReportPeriods(actor(), form.id).find((period) => period.sequenceNo === 1);
  assert.equal(persisted.isEscalatedAuthor, true, "escalation is persisted on the report period");

  // SoD holds through escalation: the appraisee can never receive the authoring right.
  assert.throws(
    () =>
      services.apar.escalateReportPeriodAuthor(actor(), form.id, {
        sequenceNo: 1,
        escalatedToEmployeeId: ph03Ids.employee,
        reason: "Invalid transfer",
      }),
    (error) => error instanceof FoundationError && error.code === "FORBIDDEN"
  );
});
