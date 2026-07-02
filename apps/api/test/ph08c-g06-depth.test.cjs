// PH-08C: G06 promotion depth to BRD level (docs/brd/v3/G06-promotion-posting-progression.md).
// Covers: eligibility driven by the FR-016 qualifying_service_ledger snapshot + APAR-usability
// gate (VAL-G06-APAR-USABLE), zone of consideration via the pinned slab (Appendix D.1),
// reservation rosters + roster points with own-merit migration (§5.6-6), refusal consequences
// with the debarment window (§5.6-18), probation auto-creation on order effect (§5.6-11), the
// sub-judice guard (§5.6-20), and BRD §9.4 domain codes thrown as error.code — no
// marker-string indirection.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, FoundationError, ph03Ids, zoneOfConsiderationSlab } = require("../../../dist/apps/api/src");

const APPROVER = "user-ph08c-checker";
const GRADE = "des-revenue-inspector";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph08c-maker",
    actorUserId: "user-ph08c-maker",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08c",
    ...extra,
  };
}

/** FR-016 setup: pinned exclusion rule + one current QSL snapshot for the employee/grade. */
function computeQslSnapshot(services, employeeId, grossServiceDays) {
  const rule = services.promotion.defineServiceExclusionRule(actor(), {
    ruleCode: `QSL-RULE-${Math.random().toString(36).slice(2, 8)}`,
    eolCountsAsQualifying: false,
    eolMaxCondonableDays: 90,
    diesNonExcluded: true,
    suspensionTreatment: "INCLUDE_IF_EXONERATED",
    adhocServiceCounts: false,
    adhocCountsIfRegularised: true,
    deputationCounts: true,
    breakInServiceResetsClock: false,
    approverActorId: APPROVER,
  });
  return services.promotion.computeQualifyingService(actor(), {
    employeeId,
    gradeDesignationId: GRADE,
    asOfDate: "2026-08-01",
    grossServiceDays,
    periods: [],
    serviceExclusionRuleId: rule.id,
  }).snapshot;
}

function finalisedList(services, entries) {
  const list = services.promotion.createSeniorityList(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    effectiveDate: "2026-08-01",
    entries,
  });
  services.promotion.publishSeniorityList(actor(), list.id);
  return services.promotion.finaliseSeniorityList(actor(), list.id);
}

function singleCandidateCase(services) {
  const list = finalisedList(services, [{ employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" }]);
  return services.promotion.createPromotionCase(actor(), {
    seniorityListId: list.id,
    vacancies: 1,
    fromDesignation: "Assistant Section Officer",
    toDesignation: "Section Officer",
  });
}

function heldDpc(services, promotionCase) {
  return services.promotion.holdDpc(actor(), promotionCase.id, {
    panelMembers: [
      { employeeId: ph03Ids.manager, role: "CHAIRPERSON" },
      { externalName: "External PSC Nominee", role: "EXPERT" },
    ],
    quorumRequired: 2,
  });
}

// ---------------------------------------------------------------------------------------
// (1) Eligibility engine: qualifying service is CITED from the QSL snapshot (FR-016 AC-4)
//     and the APAR-usability gate excludes uncommunicated adverse years (§5.6-16)
// ---------------------------------------------------------------------------------------

test("PH-08C eligibility cites the current qualifying_service_ledger (QSL) snapshot — no re-derivation in G06", () => {
  const services = createFoundationServices();
  const snapshot = computeQslSnapshot(services, ph03Ids.employee, 3650); // 10.0 net qualifying years
  const eligible = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: GRADE,
    minQualifyingServiceYears: 8,
  });
  assert.equal(eligible.citedQslSnapshotId, snapshot.id, "eligibility cites the QSL snapshot id");
  assert.equal(eligible.netQualifyingYears, snapshot.netQualifyingYears, "net qualifying service read from the QSL, not recomputed");
  assert.equal(eligible.qualifyingServiceMet, true);
  assert.equal(eligible.eligible, true);

  const short = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: GRADE,
    minQualifyingServiceYears: 12,
  });
  assert.equal(short.eligible, false, "below the qualifying-service floor is ineligible");
});

test("PH-08C APAR-usability gate (VAL-G06-APAR-USABLE): adverse counts only if communicated and representation disposed", () => {
  const services = createFoundationServices();
  computeQslSnapshot(services, ph03Ids.employee, 3650);
  // Uncommunicated adverse APAR (Dev Dutt line): unusable, excluded from the reckoning.
  const gated = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: GRADE,
    minQualifyingServiceYears: 8,
    aparYears: [
      { year: "2024-25", grading: "ADVERSE", communicated: false },
      { year: "2025-26", grading: "MEETS_BENCHMARK", communicated: true },
    ],
  });
  assert.deepEqual(gated.aparGate.unusableAdverseYears, ["2024-25"], "uncommunicated adverse year is unusable");
  assert.equal(gated.eligible, true, "an unusable adverse APAR cannot be relied upon against the employee");

  // Communicated adverse with representation DISPOSED: usable, defeats the benchmark.
  const usable = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: GRADE,
    minQualifyingServiceYears: 8,
    aparYears: [{ year: "2024-25", grading: "ADVERSE", communicated: true, representationStatus: "DISPOSED" }],
  });
  assert.deepEqual(usable.aparGate.usableAdverseYears, ["2024-25"]);
  assert.equal(usable.eligible, false, "a usable adverse APAR defeats the benchmark");

  // Representation still PENDING keeps the entry unusable even when communicated.
  const pending = services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: GRADE,
    minQualifyingServiceYears: 8,
    aparYears: [{ year: "2023-24", grading: "BELOW_BENCHMARK", communicated: true, representationStatus: "PENDING" }],
  });
  assert.deepEqual(pending.aparGate.unusableAdverseYears, ["2023-24"]);
  assert.equal(pending.eligible, true);
});

test("PH-08C DPC supersession citing an unusable APAR year fails closed with APAR_NOT_USABLE", () => {
  const services = createFoundationServices();
  computeQslSnapshot(services, ph03Ids.employee, 3650);
  services.promotion.assessPromotionEligibility(actor(), {
    employeeId: ph03Ids.employee,
    gradeDesignationId: GRADE,
    minQualifyingServiceYears: 8,
    aparYears: [{ year: "2024-25", grading: "ADVERSE", communicated: false }],
  });
  const promotionCase = singleCandidateCase(services);
  assert.throws(
    () =>
      services.promotion.holdDpc(actor(), promotionCase.id, {
        panelMembers: [
          { employeeId: ph03Ids.manager, role: "CHAIRPERSON" },
          { externalName: "External PSC Nominee", role: "EXPERT" },
        ],
        quorumRequired: 2,
        supersessions: [{ employeeId: ph03Ids.employee, citedAparYear: "2024-25" }],
      }),
    (error) => error instanceof FoundationError && error.code === "APAR_NOT_USABLE"
  );
});

// ---------------------------------------------------------------------------------------
// (2) Zone of consideration: pinned non-linear slab (Appendix D.1) on the crucial date
// ---------------------------------------------------------------------------------------

test("PH-08C zone of consideration uses the pinned DoPT slab (5 if v=1; 8 if v=2; 3xV if v>=3), never a flat multiplier", () => {
  assert.equal(zoneOfConsiderationSlab(1), 5);
  assert.equal(zoneOfConsiderationSlab(2), 8);
  assert.equal(zoneOfConsiderationSlab(3), 9);
  assert.equal(zoneOfConsiderationSlab(4), 12);

  const services = createFoundationServices();
  const entries = [
    { employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" },
    { employeeId: ph03Ids.manager, serviceNo: "GOV-100245", appointmentDate: "2018-02-01" },
    { employeeId: "emp-zone-3", serviceNo: "GOV-100247", appointmentDate: "2018-03-01" },
    { employeeId: "emp-zone-4", serviceNo: "GOV-100248", appointmentDate: "2018-04-01" },
    { employeeId: "emp-zone-5", serviceNo: "GOV-100249", appointmentDate: "2018-05-01" },
    { employeeId: "emp-zone-6", serviceNo: "GOV-100250", appointmentDate: "2018-06-01" },
  ];
  const list = finalisedList(services, entries);
  const promotionCase = services.promotion.createPromotionCase(actor(), {
    seniorityListId: list.id,
    vacancies: 1,
    fromDesignation: "Assistant Section Officer",
    toDesignation: "Section Officer",
    crucialDate: "2026-08-01",
  });
  assert.equal(promotionCase.zoneSize, 5, "one vacancy pins a zone of five (Appendix D.1)");
  assert.equal(promotionCase.crucialDate, "2026-08-01", "zone is pinned on the crucial date");
  assert.equal(promotionCase.candidates.length, 5, "rank 6 falls OUT_OF_ZONE and is excluded from the field");
  assert.ok(promotionCase.candidates.every((candidate) => candidate.zoneOfConsideration === "IN_ZONE"));

  // Reserved-category extended zone admits a reserved candidate beyond the base slab.
  const extendedCase = services.promotion.createPromotionCase(actor(), {
    seniorityListId: list.id,
    vacancies: 1,
    fromDesignation: "Assistant Section Officer",
    toDesignation: "Section Officer",
    reservedCategoryEmployeeIds: ["emp-zone-6"],
    extendedZoneSlots: 1,
  });
  const extended = extendedCase.candidates.find((candidate) => candidate.employeeId === "emp-zone-6");
  assert.equal(extended.zoneOfConsideration, "EXTENDED_ZONE", "reserved-category candidate enters the extended zone");
});

// ---------------------------------------------------------------------------------------
// (3) Reservation roster: roster_points occupation with own-merit migration (§5.6-6)
// ---------------------------------------------------------------------------------------

test("PH-08C roster own-merit migration: reserved candidate on own merit occupies a GEN point with adjusted_against_category=GEN", () => {
  const services = createFoundationServices();
  const { roster, points } = services.promotion.createReservationRoster(actor(), {
    rosterNo: "ROSTER/REV/2026/01",
    cadreId: ph03Ids.cadreRevenue,
    gradeDesignationId: GRADE,
    enablingProvisionRef: "Nagaraj-QD/2025/17",
    approverActorId: APPROVER,
    points: [
      { pointNumber: 1, reservedFor: "GEN" },
      { pointNumber: 2, reservedFor: "SC" },
      { pointNumber: 3, reservedFor: "GEN" },
    ],
  });
  assert.equal(points.length, 3);

  // §5.6-6: own-merit reserved candidate must NOT consume the reserved point ...
  assert.throws(
    () =>
      services.promotion.fillRosterPoint(actor(), roster.id, {
        pointNumber: 2,
        employeeId: ph03Ids.employee,
        candidateCategory: "SC",
        selectedOnOwnMerit: true,
      }),
    (error) => error instanceof FoundationError && error.code === "OWN_MERIT_MIGRATION_REQUIRED"
  );

  // ... they migrate to an unreserved point, counted against GEN; the SC point is preserved.
  const migrated = services.promotion.fillRosterPoint(actor(), roster.id, {
    pointNumber: 1,
    employeeId: ph03Ids.employee,
    candidateCategory: "SC",
    selectedOnOwnMerit: true,
  });
  assert.equal(migrated.status, "FILLED");
  assert.equal(migrated.adjustedAgainstCategory, "GEN", "own-merit fill is adjusted against GEN, not the reserved category");
  const preservedScPoint = services.promotion.getRosterCompliance(actor(), roster.id).points.find((point) => point.pointNumber === 2);
  assert.equal(preservedScPoint.status, "VACANT", "reserved point is not consumed by the own-merit candidate");

  // Double-fill and category mismatch fail closed with BRD codes.
  assert.throws(
    () => services.promotion.fillRosterPoint(actor(), roster.id, { pointNumber: 1, employeeId: ph03Ids.manager, candidateCategory: "GEN" }),
    (error) => error instanceof FoundationError && error.code === "ROSTER_POINT_OCCUPIED"
  );
  assert.throws(
    () => services.promotion.fillRosterPoint(actor(), roster.id, { pointNumber: 2, employeeId: ph03Ids.manager, candidateCategory: "OBC" }),
    (error) => error instanceof FoundationError && error.code === "ROSTER_CATEGORY_MISMATCH"
  );

  // Regular reserved fill is counted against its own category; compliance itemises the migration.
  const scFill = services.promotion.fillRosterPoint(actor(), roster.id, { pointNumber: 2, employeeId: ph03Ids.manager, candidateCategory: "SC" });
  assert.equal(scFill.adjustedAgainstCategory, "SC");
  const compliance = services.promotion.getRosterCompliance(actor(), roster.id);
  assert.equal(compliance.filledByAdjustedCategory.GEN, 1);
  assert.equal(compliance.filledByAdjustedCategory.SC, 1);
  assert.equal(compliance.ownMeritMigrations.length, 1, "compliance report itemises own-merit migrations");
});

// ---------------------------------------------------------------------------------------
// (4) Refusal consequences: debarment window bars re-consideration (§5.6-18)
// ---------------------------------------------------------------------------------------

test("PH-08C refusal creates the debarment window and re-consideration inside it throws EMPLOYEE_DEBARRED", () => {
  const services = createFoundationServices();
  const promotionCase = singleCandidateCase(services);
  heldDpc(services, promotionCase);
  const [order] = services.promotion.issuePromotionOrders(actor(), promotionCase.id);

  const declined = services.promotion.declinePromotionOrder(actor(), order.id, {
    refusalDate: "2026-08-20",
    refusalReason: "Declined for personal reasons",
    debarmentMonths: 12,
    macpClockEffect: "STOP",
  });
  assert.equal(declined.order.status, "DECLINED");
  assert.equal(declined.refusal.debarmentUntil, "2027-08-20", "debarment_until = refusal_date + debarment_months");
  assert.equal(declined.refusal.status, "ACTIVE");
  assert.equal(declined.refusal.macpClockEffect, "STOP");
  const refusals = services.promotion.listPromotionRefusals(actor(), ph03Ids.employee);
  assert.equal(refusals.length, 1, "promotion_refusals row persisted for the debarment window");

  // Field assembly excludes the debarred employee: re-consideration inside the window fails closed.
  const relist = finalisedList(services, [{ employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" }]);
  assert.throws(
    () =>
      services.promotion.createPromotionCase(actor(), {
        seniorityListId: relist.id,
        vacancies: 1,
        fromDesignation: "Assistant Section Officer",
        toDesignation: "Section Officer",
        crucialDate: "2027-01-01",
      }),
    (error) => error instanceof FoundationError && error.code === "EMPLOYEE_DEBARRED"
  );

  // §5.6-18: the ACTIVE refusal's MACP-clock effect blocks a MACP sanction in the window.
  assert.throws(
    () =>
      services.promotion.effectMacp(actor(), {
        employeeId: ph03Ids.employee,
        level: "MACP-1",
        dueDate: "2026-09-01",
        effectDate: "2026-09-15",
        idempotencyKey: "idem-ph08c-macp-refusal-001",
      }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );
});

// ---------------------------------------------------------------------------------------
// (5) Probation lifecycle: auto-created on order effect (§5.6-11)
// ---------------------------------------------------------------------------------------

test("PH-08C effecting a promotion order auto-creates the probation record (ON_PROBATION, scheduled_end = start + months)", () => {
  const services = createFoundationServices();
  const promotionCase = singleCandidateCase(services);
  heldDpc(services, promotionCase);
  const [order] = services.promotion.issuePromotionOrders(actor(), promotionCase.id);
  const effected = services.promotion.effectPromotionOrder(actor(), order.id, {
    effectDate: "2026-08-15",
    idempotencyKey: "idem-ph08c-effect-probation-001",
    probationMonths: 24,
  });
  assert.equal(effected.order.status, "EFFECTED");
  assert.equal(effected.probation.status, "ON_PROBATION", "probation lifecycle starts automatically on effect");
  assert.equal(effected.probation.probationStart, "2026-08-15");
  assert.equal(effected.probation.scheduledEnd, "2028-08-15", "scheduled_end = probation_start + probation_months (§5.6-11)");
  const probationRecords = services.promotion.listProbationRecords(actor(), ph03Ids.employee);
  assert.equal(probationRecords.length, 1, "probation_records row persisted with the order linkage");
  assert.equal(probationRecords[0].promotionOrderId, order.id);
});

// ---------------------------------------------------------------------------------------
// (6) Sub-judice guard: an active interim stay blocks effecting (§5.6-20)
// ---------------------------------------------------------------------------------------

test("PH-08C an active interim stay blocks effecting with ENTITY_SUB_JUDICE; a vacated stay restores effecting", () => {
  const services = createFoundationServices();
  const promotionCase = singleCandidateCase(services);
  heldDpc(services, promotionCase);
  const [order] = services.promotion.issuePromotionOrders(actor(), promotionCase.id);

  const link = services.promotion.attachLegalCaseLink(actor(), {
    linkedEntityType: "PROMOTION_ORDER",
    linkedEntityRefId: order.id,
    forum: "HIGH_COURT",
    caseReference: "OA/1234/2026",
    petitioner: "Superseded Senior",
    interimStay: true,
    stayFromDate: "2026-08-10",
  });
  assert.equal(link.status, "INTERIM_STAYED");

  assert.throws(
    () =>
      services.promotion.effectPromotionOrder(actor(), order.id, {
        effectDate: "2026-08-15",
        idempotencyKey: "idem-ph08c-effect-stayed-001",
      }),
    (error) => error instanceof FoundationError && error.code === "ENTITY_SUB_JUDICE"
  );

  // Vacating the stay restores the prior state and effecting proceeds.
  const vacated = services.promotion.vacateInterimStay(actor(), link.id, { stayToDate: "2026-08-25" });
  assert.equal(vacated.interimStay, false);
  const effected = services.promotion.effectPromotionOrder(actor(), order.id, {
    effectDate: "2026-09-01",
    idempotencyKey: "idem-ph08c-effect-vacated-001",
  });
  assert.equal(effected.order.status, "EFFECTED");
});

// ---------------------------------------------------------------------------------------
// (7) BRD §9.4 domain codes thrown as error.code — QUORUM_NOT_MET, PANEL_CONFLICT_OF_INTEREST,
//     SENIORITY_LIST_NOT_FINAL — every negative asserts the thrown error.code directly
// ---------------------------------------------------------------------------------------

test("PH-08C DPC quorum failure throws error.code QUORUM_NOT_MET", () => {
  const services = createFoundationServices();
  const promotionCase = singleCandidateCase(services);
  assert.throws(
    () =>
      services.promotion.holdDpc(actor(), promotionCase.id, {
        panelMembers: [{ employeeId: ph03Ids.manager, role: "CHAIRPERSON" }],
        quorumRequired: 2,
      }),
    (error) => error instanceof FoundationError && error.code === "QUORUM_NOT_MET"
  );
});

test("PH-08C a candidate sitting on the panel without recusal throws error.code PANEL_CONFLICT_OF_INTEREST (SoD)", () => {
  const services = createFoundationServices();
  const promotionCase = singleCandidateCase(services);
  assert.throws(
    () =>
      services.promotion.holdDpc(actor(), promotionCase.id, {
        panelMembers: [
          { employeeId: ph03Ids.employee, role: "MEMBER" },
          { externalName: "External PSC Nominee", role: "EXPERT" },
        ],
        quorumRequired: 2,
      }),
    (error) => error instanceof FoundationError && error.code === "PANEL_CONFLICT_OF_INTEREST"
  );
  // Recusal clears the conflict and the DPC proceeds.
  const held = services.promotion.holdDpc(actor(), promotionCase.id, {
    panelMembers: [
      { employeeId: ph03Ids.employee, role: "MEMBER" },
      { employeeId: ph03Ids.manager, role: "CHAIRPERSON" },
      { externalName: "External PSC Nominee", role: "EXPERT" },
    ],
    recusedEmployeeIds: [ph03Ids.employee],
    quorumRequired: 2,
  });
  assert.equal(held.status, "DPC_HELD");
});

test("PH-08C a promotion case on a non-finalised list throws error.code SENIORITY_LIST_NOT_FINAL", () => {
  const services = createFoundationServices();
  const draft = services.promotion.createSeniorityList(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    effectiveDate: "2026-08-01",
    entries: [{ employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" }],
  });
  assert.throws(
    () =>
      services.promotion.createPromotionCase(actor(), {
        seniorityListId: draft.id,
        vacancies: 1,
        fromDesignation: "Assistant Section Officer",
        toDesignation: "Section Officer",
      }),
    (error) => error instanceof FoundationError && error.code === "SENIORITY_LIST_NOT_FINAL"
  );
});

// ---------------------------------------------------------------------------------------
// (8) Wire conformance: the sub-judice block surfaces as 412 ENTITY_SUB_JUDICE over the API
// ---------------------------------------------------------------------------------------

test("PH-08C route: effecting a stayed order returns 412 with error.code ENTITY_SUB_JUDICE", () => {
  const { createFoundationApi } = require("../../../dist/apps/api/src");
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const promotionCase = singleCandidateCase(services);
  heldDpc(services, promotionCase);
  const [order] = services.promotion.issuePromotionOrders(actor(), promotionCase.id);
  services.promotion.attachLegalCaseLink(actor(), {
    linkedEntityType: "PROMOTION_ORDER",
    linkedEntityRefId: order.id,
    forum: "CAT",
    caseReference: "OA/9876/2026",
    interimStay: true,
  });
  const response = api.dispatch({
    method: "POST",
    path: `/api/v1/promotions/orders/${order.id}:effect`,
    headers: { "X-Correlation-Id": "corr-ph08c-route", "Idempotency-Key": "idem-ph08c-route-effect-001" },
    body: { effectDate: "2026-09-01" },
    actor: actor(),
  });
  assert.equal(response.status, 412, "BRD §9.4: ENTITY_SUB_JUDICE is a 412 precondition failure");
  assert.equal(response.body.error.code, "ENTITY_SUB_JUDICE");
  assert.equal(response.body.error.details.legalCaseLinkId != null, true, "details cite the legal_case_link, not internals");
});
