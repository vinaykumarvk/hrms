// PH-08A: statutory shared kernels — sanctioned_posts establishment register (G06 FR-015)
// and qualifying_service_ledger + service_exclusion_rules (G06 FR-016).
// Grounded in docs/brd/v3/G06-promotion-posting-progression.md (VAL-G06-QUOTA-SPLIT,
// VAL-G06-VACANCY-RECON, VAL-G06-QUALSVC) and docs/data-model/06-*.sql.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createFoundationServices,
  computeNetQualifyingService,
  FileBackedEstablishmentQslRepository,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph08a-maker",
    actorUserId: "user-ph08a-maker",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08a",
    ...extra,
  };
}

const APPROVER = "user-ph08a-checker";

function statutoryRule(services, overrides = {}) {
  return services.promotion.defineServiceExclusionRule(actor(), {
    ruleCode: overrides.ruleCode ?? `QSL-RULE-${Math.random().toString(36).slice(2, 8)}`,
    eolCountsAsQualifying: false,
    eolMaxCondonableDays: 90,
    diesNonExcluded: true,
    suspensionTreatment: "INCLUDE_IF_EXONERATED",
    adhocServiceCounts: false,
    adhocCountsIfRegularised: true,
    deputationCounts: true,
    breakInServiceResetsClock: false,
    approverActorId: APPROVER,
    ...overrides,
  });
}

function registerPost(services, overrides = {}) {
  return services.promotion.registerSanctionedPost(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    gradeDesignationId: "des-revenue-inspector",
    orgUnitId: ph03Ids.orgRevenue,
    sanctionOrderRef: "SO/EST/2026/0042",
    sanctionedStrength: 20,
    filledCount: 12,
    drQuotaPct: 50,
    promotionQuotaPct: 40,
    ldceQuotaPct: 10,
    anticipatedVacancies: 2,
    carriedForwardVacancies: 0,
    asOnDate: "2026-07-01",
    approverActorId: APPROVER,
    ...overrides,
  });
}

function finalisedSeniorityList(services) {
  const list = services.promotion.createSeniorityList(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    effectiveDate: "2026-08-01",
    entries: [
      { employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" },
      { employeeId: ph03Ids.manager, serviceNo: "GOV-100245", appointmentDate: "2018-01-01" },
    ],
  });
  services.promotion.publishSeniorityList(actor(), list.id);
  return services.promotion.finaliseSeniorityList(actor(), list.id);
}

// ---------------------------------------------------------------------------------------
// FR-016: QSL compute — net qualifying = gross minus rule-driven exclusions
// ---------------------------------------------------------------------------------------

test("PH-08A FR-016 QSL compute: netQualifyingYears = gross - exclusions with itemised breakdown", () => {
  const services = createFoundationServices();
  const rule = statutoryRule(services);
  const { snapshot, supersededSnapshotId } = services.promotion.computeQualifyingService(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: "des-revenue-inspector",
    asOfDate: "2026-07-01",
    grossServiceDays: 7300, // 20 years
    periods: [
      { kind: "EOL", days: 400 }, // 90 condonable -> 310 excluded
      { kind: "DIES_NON", days: 30 }, // excluded -> 30
      { kind: "SUSPENSION", days: 100, exonerated: true }, // INCLUDE_IF_EXONERATED -> counted
      { kind: "DEPUTATION", days: 200 }, // deputation_counts -> counted
      { kind: "ADHOC", days: 90, regularised: true }, // regularised -> counted
    ],
    serviceExclusionRuleId: rule.id,
  });
  assert.equal(supersededSnapshotId, undefined, "first compute supersedes nothing");
  assert.equal(snapshot.grossServiceYears, 20);
  assert.equal(snapshot.totalExclusionDays, 340);
  assert.equal(snapshot.netQualifyingYears, 19.068, "net qualifying years = (7300 - 340) / 365 (VAL-G06-QUALSVC)");
  assert.equal(snapshot.isCurrent, true);
  assert.equal(snapshot.serviceExclusionRuleId, rule.id);
  assert.equal(snapshot.exclusionBreakdownJson.length, 5, "exclusion breakdown is itemised per period");
  const eolItem = snapshot.exclusionBreakdownJson.find((item) => item.periodKind === "EOL");
  assert.equal(eolItem.excludedDays, 310, "EOL excluded beyond the condonable limit");
  const suspensionItem = snapshot.exclusionBreakdownJson.find((item) => item.periodKind === "SUSPENSION");
  assert.equal(suspensionItem.excludedDays, 0, "exonerated suspension counts as qualifying");
});

test("PH-08A FR-016 exclusion-rule treatments: EOL / dies-non / suspension / break-in-service flags drive the engine", () => {
  const baseRule = {
    id: "rule-inline",
    tenantId: ph03Ids.tenant,
    ruleCode: "INLINE",
    eolCountsAsQualifying: false,
    eolMaxCondonableDays: 0,
    diesNonExcluded: true,
    suspensionTreatment: "EXCLUDE",
    adhocServiceCounts: false,
    adhocCountsIfRegularised: true,
    deputationCounts: true,
    breakInServiceResetsClock: false,
    isActive: true,
    makerActorId: "m",
    approverActorId: "a",
  };

  // eol_counts_as_qualifying=true -> EOL fully counted
  const eolCounted = computeNetQualifyingService(
    { ...baseRule, eolCountsAsQualifying: true },
    { grossServiceDays: 3650, periods: [{ kind: "EOL", days: 400 }] }
  );
  assert.equal(eolCounted.totalExclusionDays, 0);
  assert.equal(eolCounted.netQualifyingYears, 10);

  // dies_non_excluded=false -> dies-non counted; true -> excluded
  const diesNonCounted = computeNetQualifyingService(
    { ...baseRule, diesNonExcluded: false },
    { grossServiceDays: 3650, periods: [{ kind: "DIES_NON", days: 365 }] }
  );
  assert.equal(diesNonCounted.totalExclusionDays, 0);
  const diesNonExcluded = computeNetQualifyingService(baseRule, { grossServiceDays: 3650, periods: [{ kind: "DIES_NON", days: 365 }] });
  assert.equal(diesNonExcluded.totalExclusionDays, 365);
  assert.equal(diesNonExcluded.netQualifyingYears, 9);

  // suspension_treatment=EXCLUDE -> excluded even when exonerated; INCLUDE_IF_EXONERATED honours the outcome
  const suspensionHard = computeNetQualifyingService(baseRule, {
    grossServiceDays: 3650,
    periods: [{ kind: "SUSPENSION", days: 100, exonerated: true }],
  });
  assert.equal(suspensionHard.totalExclusionDays, 100);
  const suspensionNotExonerated = computeNetQualifyingService(
    { ...baseRule, suspensionTreatment: "INCLUDE_IF_EXONERATED" },
    { grossServiceDays: 3650, periods: [{ kind: "SUSPENSION", days: 100, exonerated: false }] }
  );
  assert.equal(suspensionNotExonerated.totalExclusionDays, 100);

  // break_in_service_resets_clock=true forfeits prior service too
  const clockReset = computeNetQualifyingService(
    { ...baseRule, breakInServiceResetsClock: true },
    { grossServiceDays: 3650, periods: [{ kind: "BREAK_IN_SERVICE", days: 10, priorServiceDays: 1000 }] }
  );
  assert.equal(clockReset.totalExclusionDays, 1010, "break-in-service clock reset excludes the break and prior service");

  // adhoc counted only when regularised (or rule counts adhoc outright)
  const adhocUnregularised = computeNetQualifyingService(baseRule, { grossServiceDays: 3650, periods: [{ kind: "ADHOC", days: 200 }] });
  assert.equal(adhocUnregularised.totalExclusionDays, 200);
});

// ---------------------------------------------------------------------------------------
// FR-016: immutable snapshots with supersede lineage
// ---------------------------------------------------------------------------------------

test("PH-08A FR-016 recompute supersedes the prior snapshot: lineage flip only, history never mutated", () => {
  const services = createFoundationServices();
  const rule = statutoryRule(services);
  const computeInput = {
    employeeId: ph03Ids.employee,
    gradeDesignationId: "des-revenue-inspector",
    asOfDate: "2026-07-01",
    grossServiceDays: 7300,
    periods: [{ kind: "EOL", days: 400 }],
    serviceExclusionRuleId: rule.id,
  };
  const first = services.promotion.computeQualifyingService(actor(), computeInput).snapshot;
  // Correction event changes service facts -> fresh snapshot supersedes the prior (FR-016 AC-2/AC-5).
  const second = services.promotion.computeQualifyingService(actor(), {
    ...computeInput,
    asOfDate: "2026-07-02",
    periods: [{ kind: "EOL", days: 400, }, { kind: "DIES_NON", days: 30 }],
  });
  assert.equal(second.supersededSnapshotId, first.id, "recompute reports which snapshot it superseded");

  const supersededView = services.promotion.getQualifyingServiceSnapshot(actor(), first.id);
  assert.equal(supersededView.isCurrent, false);
  assert.equal(supersededView.supersedingSnapshotId, second.snapshot.id, "superseded snapshot points at its successor");
  assert.equal(supersededView.netQualifyingYears, first.netQualifyingYears, "superseded snapshot values are immutable");
  assert.equal(supersededView.grossServiceYears, first.grossServiceYears);

  const current = services.promotion.getCurrentQualifyingService(actor(), ph03Ids.employee, "des-revenue-inspector");
  assert.equal(current.id, second.snapshot.id, "current pointer follows the superseding snapshot");
  assert.equal(current.isCurrent, true);
  assert.equal(current.supersedingSnapshotId, undefined);
});

test("PH-08A FR-016/FR-003 eligibility cites the current QSL snapshot instead of recomputing", () => {
  const services = createFoundationServices();
  const rule = statutoryRule(services);
  const { snapshot } = services.promotion.computeQualifyingService(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: "des-revenue-inspector",
    asOfDate: "2026-07-01",
    grossServiceDays: 7300,
    periods: [{ kind: "EOL", days: 400 }],
    serviceExclusionRuleId: rule.id,
  });
  const eligible = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: "des-revenue-inspector",
    minQualifyingServiceYears: 15,
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.citedQslSnapshotId, snapshot.id, "eligibility cites qsl_snapshot_id");
  assert.equal(eligible.netQualifyingYears, snapshot.netQualifyingYears);

  const notEligible = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: "des-revenue-inspector",
    minQualifyingServiceYears: 25,
  });
  assert.equal(notEligible.eligible, false);

  assert.throws(
    () =>
      services.promotion.assessPromotionEligibility(actor(), {
        employeeId: ph03Ids.manager,
        gradeDesignationId: "des-revenue-inspector",
        minQualifyingServiceYears: 15,
      }),
    (error) => error.code === "PRECONDITION_FAILED",
    "no snapshot -> eligibility fails closed rather than silently recomputing"
  );
});

// ---------------------------------------------------------------------------------------
// Persistence durability: rehydrate the file-backed store
// ---------------------------------------------------------------------------------------

test("PH-08A durability: kernel state survives re-opening (rehydrate) the file-backed persistence layer", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph08a-kernel-"));
  const storePath = path.join(dir, "g06-kernel-state.json");
  try {
    const repoA = new FileBackedEstablishmentQslRepository(storePath);
    const post = {
      id: "sanctioned-post-000001",
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      cadreId: ph03Ids.cadreRevenue,
      gradeDesignationId: "des-revenue-inspector",
      orgUnitId: ph03Ids.orgRevenue,
      sanctionOrderRef: "SO/EST/2026/0042",
      sanctionedStrength: 20,
      filledCount: 12,
      drQuotaPct: 50,
      promotionQuotaPct: 40,
      ldceQuotaPct: 10,
      currentVacancies: 8,
      anticipatedVacancies: 2,
      carriedForwardVacancies: 0,
      asOnDate: "2026-07-01",
      status: "ACTIVE",
      version: 1,
      makerActorId: "user-ph08a-maker",
      approverActorId: APPROVER,
    };
    repoA.saveSanctionedPost(post);
    repoA.insertSnapshotSuperseding({
      id: "qsl-snapshot-000001",
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      employeeId: ph03Ids.employee,
      gradeDesignationId: "des-revenue-inspector",
      asOfDate: "2026-07-01",
      grossServiceYears: 20,
      totalExclusionDays: 340,
      netQualifyingYears: 19.068,
      exclusionBreakdownJson: [{ periodKind: "EOL", periodDays: 400, excludedDays: 310, countedDays: 90, treatment: "eol_excluded_beyond_condonable_limit" }],
      serviceExclusionRuleId: "service-exclusion-rule-000001",
      computedByVersion: "qsl-engine-1.0",
      isCurrent: true,
      computedAt: "2026-07-01T00:00:00.000Z",
    });
    assert.ok(fs.existsSync(storePath), "write-through persisted kernel state to disk");

    // Re-open the persistence layer: a brand-new repository instance rehydrates from disk.
    const rehydrated = new FileBackedEstablishmentQslRepository(storePath);
    const scope = { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity };
    const survivedPost = rehydrated.findSanctionedPost(scope, "sanctioned-post-000001");
    assert.ok(survivedPost, "sanctioned post survives store rehydration");
    assert.equal(survivedPost.currentVacancies, 8);
    assert.equal(survivedPost.sanctionedStrength, 20);
    const survivedSnapshot = rehydrated.findCurrentSnapshot(scope, ph03Ids.employee, "des-revenue-inspector");
    assert.ok(survivedSnapshot, "current QSL snapshot survives store rehydration");
    assert.equal(survivedSnapshot.netQualifyingYears, 19.068);
    assert.equal(survivedSnapshot.exclusionBreakdownJson.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------
// FR-015: establishment register — vacancy computation, reconcile, quota split
// ---------------------------------------------------------------------------------------

test("PH-08A FR-015 register derives vacancies and reconciles strength; promotion case vacancy is register-validated", () => {
  const services = createFoundationServices();
  const post = registerPost(services);
  assert.equal(post.currentVacancies, 8, "current_vacancies = sanctioned_strength - filled_count, never free-entered");
  assert.equal(post.makerActorId, "user-ph08a-maker");
  assert.equal(post.approverActorId, APPROVER, "maker and checker recorded distinctly (SoD)");

  const computation = services.promotion.getVacancyComputation(actor(), post.id);
  assert.equal(computation.promotionQuotaVacancies, 4, "(current 8 + anticipated 2 + carried 0) x 40% = 4");

  const list = finalisedSeniorityList(services);
  // VAL-G06-VACANCY-RECON: case vacancies must equal the register-computed promotion-quota figure.
  const reconciledCase = services.promotion.createPromotionCase(actor(), {
    seniorityListId: list.id,
    vacancies: 4,
    fromDesignation: "Revenue Inspector",
    toDesignation: "Revenue Officer",
    sanctionedPostId: post.id,
  });
  assert.equal(reconciledCase.sanctionedPostId, post.id);

  assert.throws(
    () =>
      services.promotion.createPromotionCase(actor(), {
        seniorityListId: list.id,
        vacancies: 5,
        fromDesignation: "Revenue Inspector",
        toDesignation: "Revenue Officer",
        sanctionedPostId: post.id,
      }),
    (error) => error.code === "VACANCY_NOT_RECONCILED",
    "free-typed vacancy figure is blocked with VACANCY_NOT_RECONCILED"
  );

  // Strength reconciliation against incumbents re-derives vacancies.
  const reconciled = services.promotion.reconcileSanctionedPost(actor(), post.id, { filledCount: 15 });
  assert.equal(reconciled.filledCount, 15);
  assert.equal(reconciled.currentVacancies, 5, "reconcile re-derives current_vacancies");
});

test("PH-08A FR-015 negative: quota split above 100 is rejected with QUOTA_SPLIT_INVALID", () => {
  const services = createFoundationServices();
  assert.throws(
    () => registerPost(services, { drQuotaPct: 60, promotionQuotaPct: 50, ldceQuotaPct: 10 }),
    (error) => error.code === "QUOTA_SPLIT_INVALID" && error.name === "FoundationError",
    "VAL-G06-QUOTA-SPLIT: dr + promotion + ldce must not exceed 100"
  );
  // Revision path enforces the same invariant.
  const post = registerPost(services);
  assert.throws(
    () => services.promotion.reviseSanctionedPost(actor(), post.id, { promotionQuotaPct: 90, approverActorId: APPROVER }),
    (error) => error.code === "QUOTA_SPLIT_INVALID"
  );
});

test("PH-08A FR-015 negative: filled_count above sanctioned_strength is rejected with STRENGTH_INCONSISTENT", () => {
  const services = createFoundationServices();
  assert.throws(
    () => registerPost(services, { sanctionedStrength: 20, filledCount: 25 }),
    (error) => error.code === "STRENGTH_INCONSISTENT" && error.name === "FoundationError",
    "register blocks filled > sanctioned"
  );
  const post = registerPost(services);
  assert.throws(
    () => services.promotion.reconcileSanctionedPost(actor(), post.id, { filledCount: 25 }),
    (error) => error.code === "STRENGTH_INCONSISTENT",
    "reconcile blocks filled > sanctioned"
  );
});

test("PH-08A FR-015/FR-016 SoD: the same actor may not both propose and approve", () => {
  const services = createFoundationServices();
  assert.throws(
    () => registerPost(services, { approverActorId: "user-ph08a-maker" }),
    (error) => error.code === "FORBIDDEN",
    "register amendment requires a distinct checker"
  );
  assert.throws(
    () => statutoryRule(services, { approverActorId: "user-ph08a-maker" }),
    (error) => error.code === "FORBIDDEN",
    "exclusion-rule change requires a distinct checker"
  );
});
