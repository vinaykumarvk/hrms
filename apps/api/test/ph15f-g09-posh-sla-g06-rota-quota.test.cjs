// PH-15F: G09 POSH/ICC route + personal hearings + SLA pause/resume (docs/brd/v3/
// G09-disciplinary-cases-punishment.md FR-G09-023/024/025) and G06 multi-stream rota-quota
// seniority construction (docs/brd/v3/G06-promotion-posting-progression.md FR-PPP-020,
// Appendix D.4). Covers: inquiry_route ICC_POSH resolution with composition validation
// (ERR-G09-ICC-PROCEDURE-REQUIRED), personal_hearings grant/deny-with-recorded-reason
// (ERR-G09-PERSONAL-HEARING-DENIED), sla_pause_events pause/resume with numeric SLA
// recompute and coalesced overlaps (ERR-G09-SLA-PAUSE-INVALID), and seniority_quota_rules
// driving a deterministic interleave with quota_slot_label/rotation_cycle_no, carry-forward
// and the STREAM_TAG_MISSING / QUOTA_RULE_INVALID input guards.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  FoundationError,
  InMemoryG09DueProcessRepository,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const GRADE = "des-revenue-inspector";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph15f",
    actorUserId: "user-ph15f",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph15f",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph15f", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

/** Local mirror of the service date arithmetic so recompute is asserted numerically. */
function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const VALID_ICC_MEMBERS = [
  { roleType: "ICC_PRESIDING", officerId: "icc-presiding-001", isWoman: true, isSeniorLevel: true },
  { roleType: "ICC_MEMBER", officerId: "icc-member-001", isWoman: true },
  { roleType: "ICC_EXTERNAL_MEMBER", externalName: "NGO Expert Member", isWoman: true },
];

// -----------------------------------------------------------------------------------------
// FR-G09-023: POSH route resolution + ICC composition validation
// -----------------------------------------------------------------------------------------

test("PH-15F FR-G09-023: HARASSMENT resolves the ICC template and sets inquiry_route=ICC_POSH", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Sexual-harassment complaint",
    misconductCategory: "HARASSMENT",
  });
  assert.equal(opened.isPoshCase, true);
  assert.equal(opened.inquiryRoute, "ICC_POSH");
  assert.equal(opened.procedureTemplateCode, "POSH_ICC");
  // AC-5: heightened confidentiality + anti-retaliation flag on the case.
  assert.equal(opened.confidential, true);
  assert.equal(opened.antiRetaliationFlag, true);
  // POSH timelines (90-day inquiry) feed SLA tracking.
  assert.equal(opened.slaTargetAt, addDays(opened.openedOn, 90));

  // An ordinary case stays on the IO route.
  const ordinary = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Unauthorised absence",
  });
  assert.equal(ordinary.isPoshCase, false);
  assert.equal(ordinary.inquiryRoute, "ORDINARY_IO");
});

test("PH-15F FR-G09-023 NEGATIVE: ICC constitution without an external member throws ERR-G09-ICC-PROCEDURE-REQUIRED", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "POSH case for composition validation",
    misconductCategory: "HARASSMENT",
  });

  // BR-1: the external member is mandatory for ICC quorum.
  assert.throws(
    () =>
      services.disciplinary.constituteIcc(actor(), opened.id, {
        appointedDate: "2026-07-05",
        members: [
          { roleType: "ICC_PRESIDING", officerId: "icc-presiding-001", isWoman: true, isSeniorLevel: true },
          { roleType: "ICC_MEMBER", officerId: "icc-member-001", isWoman: true },
        ],
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ICC-PROCEDURE-REQUIRED"
  );

  // Presiding officer must be a senior-level woman.
  assert.throws(
    () =>
      services.disciplinary.constituteIcc(actor(), opened.id, {
        appointedDate: "2026-07-05",
        members: [
          { roleType: "ICC_PRESIDING", officerId: "icc-presiding-002", isWoman: false, isSeniorLevel: true },
          { roleType: "ICC_MEMBER", officerId: "icc-member-001", isWoman: true },
          { roleType: "ICC_EXTERNAL_MEMBER", externalName: "NGO Expert Member", isWoman: true },
        ],
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ICC-PROCEDURE-REQUIRED"
  );

  // At least half the members must be women (POSH Act 2013 s.4(2)).
  assert.throws(
    () =>
      services.disciplinary.constituteIcc(actor(), opened.id, {
        appointedDate: "2026-07-05",
        members: [
          { roleType: "ICC_PRESIDING", officerId: "icc-presiding-001", isWoman: true, isSeniorLevel: true },
          { roleType: "ICC_MEMBER", officerId: "icc-member-002", isWoman: false },
          { roleType: "ICC_MEMBER", officerId: "icc-member-003", isWoman: false },
          { roleType: "ICC_EXTERNAL_MEMBER", externalName: "NGO Expert Member", isWoman: false },
        ],
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ICC-PROCEDURE-REQUIRED"
  );

  // Fail closed: no partial committee was persisted by the rejected constitutions.
  assert.equal(services.disciplinary.listIccAppointments(actor(), opened.id).length, 0);
});

test("PH-15F FR-G09-023: a POSH case cannot proceed to inquiry without a valid ICC; a valid ICC unblocks it", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "POSH case routed to ICC",
    misconductCategory: "HARASSMENT",
  });
  services.disciplinary.serveChargeMemo(actor(), opened.id, { articles: ["Article I"], servedOn: "2026-07-10" });

  // NEGATIVE: no ICC on record — the ordinary IO route is not available to a POSH case.
  assert.throws(
    () => services.disciplinary.recordInquiryReport(actor(), opened.id, { findings: "PROVED", reportDate: "2026-09-20" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ICC-PROCEDURE-REQUIRED"
  );

  const appointments = services.disciplinary.constituteIcc(actor(), opened.id, { appointedDate: "2026-07-12", members: VALID_ICC_MEMBERS });
  assert.equal(appointments.length, 3);
  assert.ok(appointments.some((row) => row.roleType === "ICC_EXTERNAL_MEMBER" && row.isExternalMember));

  // The ICC report now feeds the penalty stage in place of the ordinary IO route (AC-4).
  const reported = services.disciplinary.recordInquiryReport(actor(), opened.id, { findings: "PROVED", reportDate: "2026-09-20" });
  assert.equal(reported.stage, "INQUIRY_REPORT");
});

// -----------------------------------------------------------------------------------------
// FR-G09-025: personal_hearings — grant / deny-with-recorded-reason (DI-29)
// -----------------------------------------------------------------------------------------

test("PH-15F FR-G09-025 NEGATIVE: reasonless denial of a requested hearing throws ERR-G09-PERSONAL-HEARING-DENIED", async () => {
  const repository = new InMemoryG09DueProcessRepository();
  const services = createFoundationServices({ g09DueProcessRepository: repository });
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Case with a show-cause personal hearing",
  });
  services.disciplinary.serveChargeMemo(actor(), opened.id, { articles: ["Article I"], servedOn: "2026-07-10" });
  services.disciplinary.recordInquiryReport(actor(), opened.id, { findings: "PROVED", reportDate: "2026-08-20" });
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["WITHHOLD_INCREMENT"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });

  // AC-1: the charged officer's request is recorded.
  const hearing = services.disciplinary.requestPersonalHearing(actor(), opened.id, {
    stage: "SHOW_CAUSE",
    requestedOn: "2026-08-27",
    showCauseNoticeId: notice.id,
  });
  assert.equal(hearing.requested, true);
  assert.equal(hearing.status, "REQUESTED");

  // DI-29 NEGATIVE: the BRD requires a hearing before adverse action — denial without a
  // recorded denial_reason fails closed.
  assert.throws(
    () => services.disciplinary.decidePersonalHearing(actor(), hearing.id, { decision: "DENY", decidedOn: "2026-08-28" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-PERSONAL-HEARING-DENIED"
  );

  // AC-2/AC-3: grant records the schedule and links personal_hearing_id on the show-cause.
  const granted = services.disciplinary.decidePersonalHearing(actor(), hearing.id, {
    decision: "GRANT",
    decidedOn: "2026-08-28",
    scheduledDate: "2026-09-02",
  });
  assert.equal(granted.status, "GRANTED");
  assert.equal(granted.granted, true);
  assert.equal(granted.scheduledDate, "2026-09-02");
  const linkedNotice = repository.findShowCauseNotice(actor(), notice.id);
  assert.equal(linkedNotice.personalHearingId, hearing.id); // AC-4: referencing record carries personal_hearing_id

  // Minutes recorded once; immutable thereafter (BR-2).
  const held = services.disciplinary.recordPersonalHearingMinutes(actor(), hearing.id, {
    heldDate: "2026-09-02",
    minutesText: "Respondent heard in person on the proposed penalty",
  });
  assert.equal(held.heldDate, "2026-09-02");
  assert.throws(
    () => services.disciplinary.recordPersonalHearingMinutes(actor(), hearing.id, { heldDate: "2026-09-03", minutesText: "rewrite" }),
    (error) => error instanceof FoundationError && error.code === "PRECONDITION_FAILED"
  );

  // A denial WITH a recorded reason is valid (APPEAL stage) and challengeable, not blocked.
  const appealHearing = services.disciplinary.requestPersonalHearing(actor(), opened.id, { stage: "APPEAL", requestedOn: "2026-09-15" });
  const denied = services.disciplinary.decidePersonalHearing(actor(), appealHearing.id, {
    decision: "DENY",
    decidedOn: "2026-09-16",
    denialReason: "Written representation already covers all appeal grounds",
  });
  assert.equal(denied.status, "DENIED");
  assert.equal(denied.denialReason, "Written representation already covers all appeal grounds");
});

// -----------------------------------------------------------------------------------------
// FR-G09-024: sla_pause_events pause/resume with recompute (DI-18)
// -----------------------------------------------------------------------------------------

test("PH-15F FR-G09-024: sla_pause_events pause suppresses breach, resume recomputes targets by the paused duration", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Case with a lawful clock pause",
  });
  const baseTarget = opened.slaTargetAt;
  const baseClosure = opened.expectedClosureDate;

  // AC-1: the pause records stage, reason and paused_from.
  const pause = services.disciplinary.pauseSla(actor(), opened.id, { stage: "INQUIRY", reason: "CRIMINAL_STAY", pausedFrom: "2026-08-01" });
  assert.equal(pause.reason, "CRIMINAL_STAY");
  assert.equal(pause.resumedAt, undefined);

  // AC-2 (DI-18): while paused the evaluator raises NO breach even past the target date.
  const whilePaused = services.disciplinary.evaluateSlaBreach(actor(), opened.id, { stage: "INQUIRY", asOf: "2027-01-15" });
  assert.equal(whilePaused.paused, true);
  assert.equal(whilePaused.breached, false);

  // AC-3: resume sets resumed_at and recomputes sla_target_at / expected_closure_date by
  // adding the paused duration — asserted numerically (10 paused days).
  const resumed = services.disciplinary.resumeSla(actor(), opened.id, { stage: "INQUIRY", resumedAt: "2026-08-11" });
  assert.equal(resumed.totalPausedDays, 10);
  assert.equal(resumed.slaTargetAt, addDays(baseTarget, 10));
  assert.equal(resumed.expectedClosureDate, addDays(baseClosure, 10));
  assert.equal(resumed.pause.resumedAt, "2026-08-11");
  assert.equal(resumed.pause.recomputeApplied, true);

  // Append-only: the resumed row is still on the ledger with resumed_at set — never deleted.
  const ledger = services.disciplinary.listSlaPauses(actor(), opened.id);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].resumedAt, "2026-08-11");

  // AC-5: an overlapping second pause coalesces for recompute — union [08-01..08-15] = 14 days,
  // never 10 + 10 double-counted.
  services.disciplinary.pauseSla(actor(), opened.id, { stage: "INQUIRY", reason: "CONSULTATION", pausedFrom: "2026-08-05" });
  const secondResume = services.disciplinary.resumeSla(actor(), opened.id, { stage: "INQUIRY", resumedAt: "2026-08-15" });
  assert.equal(secondResume.totalPausedDays, 14);
  assert.equal(secondResume.slaTargetAt, addDays(baseTarget, 14));

  // Past the recomputed target with no open pause the breach evaluator fires again.
  const afterResume = services.disciplinary.evaluateSlaBreach(actor(), opened.id, { stage: "INQUIRY", asOf: "2027-06-30" });
  assert.equal(afterResume.paused, false);
  assert.equal(afterResume.breached, true);

  // AC-4: pause/resume landed on the hash-chained case timeline and the chain still verifies.
  const timeline = services.disciplinary.listCaseTimeline(actor(), opened.id);
  assert.ok(timeline.some((event) => event.eventType === "SLA_PAUSE"));
  assert.ok(timeline.some((event) => event.eventType === "SLA_RESUME"));
  assert.equal(services.disciplinary.verifyCaseTimeline(actor(), opened.id).verified, true);
});

test("PH-15F FR-G09-024 NEGATIVE: resume without an open pause throws ERR-G09-SLA-PAUSE-INVALID", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Resume-before-pause edge case",
  });
  // Edge case pinned by the BRD: "Resume before pause (rejected)".
  assert.throws(
    () => services.disciplinary.resumeSla(actor(), opened.id, { stage: "INQUIRY", resumedAt: "2026-08-11" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-SLA-PAUSE-INVALID"
  );
  // A closed pause does not satisfy a second resume either (the field is written once).
  services.disciplinary.pauseSla(actor(), opened.id, { stage: "INQUIRY", reason: "STAY", pausedFrom: "2026-08-01" });
  services.disciplinary.resumeSla(actor(), opened.id, { stage: "INQUIRY", resumedAt: "2026-08-05" });
  assert.throws(
    () => services.disciplinary.resumeSla(actor(), opened.id, { stage: "INQUIRY", resumedAt: "2026-08-11" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-SLA-PAUSE-INVALID"
  );
});

test("PH-15F routes surface the FR-G09-023/024/025 codes on the wire", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);

  const opened = await call(api, {
    method: "POST",
    path: "/api/v1/disciplinary/cases",
    headers: { "Idempotency-Key": "idem-ph15f-open-001" },
    body: { allegations: "POSH case over the wire", misconductCategory: "HARASSMENT" },
  });
  assert.equal(opened.status, 201);
  assert.equal(opened.body.disciplinaryCase.inquiryRoute, "ICC_POSH");
  const caseId = opened.body.disciplinaryCase.id;

  // FR-023 over the wire: missing external member is a 409 with the BRD code.
  const badIcc = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:constitute-icc`,
    headers: { "Idempotency-Key": "idem-ph15f-icc-001" },
    body: {
      appointedDate: "2026-07-05",
      members: [{ roleType: "ICC_PRESIDING", officerId: "icc-presiding-001", isWoman: true, isSeniorLevel: true }],
    },
  });
  assert.equal(badIcc.status, 409);
  assert.equal(badIcc.body.error.code, "ERR-G09-ICC-PROCEDURE-REQUIRED");

  // FR-025 over the wire: reasonless denial is a 422 with the BRD code.
  const hearing = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:personal-hearing`,
    headers: { "Idempotency-Key": "idem-ph15f-ph-001" },
    body: { stage: "SHOW_CAUSE", requestedOn: "2026-08-27" },
  });
  assert.equal(hearing.status, 201);
  const reasonlessDenial = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/personal-hearings/${hearing.body.personalHearing.id}:decision`,
    headers: { "Idempotency-Key": "idem-ph15f-ph-002" },
    body: { decision: "DENY", decidedOn: "2026-08-28" },
  });
  assert.equal(reasonlessDenial.status, 422);
  assert.equal(reasonlessDenial.body.error.code, "ERR-G09-PERSONAL-HEARING-DENIED");

  // FR-024 over the wire: resume without an open pause is a 409 with the BRD code.
  const badResume = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}/sla:resume`,
    headers: { "Idempotency-Key": "idem-ph15f-sla-001" },
    body: { stage: "INQUIRY", resumedAt: "2026-08-11" },
  });
  assert.equal(badResume.status, 409);
  assert.equal(badResume.body.error.code, "ERR-G09-SLA-PAUSE-INVALID");

  const paused = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}/sla:pause`,
    headers: { "Idempotency-Key": "idem-ph15f-sla-002" },
    body: { stage: "INQUIRY", reason: "STAY", pausedFrom: "2026-08-01" },
  });
  assert.equal(paused.status, 201);
  const pauses = await call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/sla/pauses` });
  assert.equal(pauses.status, 200);
  assert.equal(pauses.body.slaPauses.length, 1);
});

// -----------------------------------------------------------------------------------------
// FR-PPP-020: seniority_quota_rules -> deterministic rota-quota construction (Appendix D.4)
// -----------------------------------------------------------------------------------------

function rotaQuotaRule(services, overrides = {}) {
  return services.promotion.defineSeniorityQuotaRule(actor(), {
    ruleCode: `SQR-${Math.random().toString(36).slice(2, 8)}`,
    gradeDesignationId: GRADE,
    drQuotaRatio: 1,
    promoteeQuotaRatio: 1,
    rotationMethod: "ROTA_QUOTA",
    rotationStartSlot: "DR_FIRST",
    ...overrides,
  });
}

const D4_POPULATION = [
  { employeeId: "D1", recruitmentStream: "DIRECT", streamSeniorityNo: 1 },
  { employeeId: "D2", recruitmentStream: "DIRECT", streamSeniorityNo: 2 },
  { employeeId: "D3", recruitmentStream: "DIRECT", streamSeniorityNo: 3 },
  { employeeId: "P1", recruitmentStream: "PROMOTEE", streamSeniorityNo: 1 },
  { employeeId: "P2", recruitmentStream: "PROMOTEE", streamSeniorityNo: 2 },
  { employeeId: "P3", recruitmentStream: "PROMOTEE", streamSeniorityNo: 3 },
];

test("PH-15F FR-PPP-020: seniority_quota_rules drive the Appendix D.4 interleave with quota_slot_label + rotation_cycle_no, deterministically", async () => {
  const services = createFoundationServices();
  const rule = rotaQuotaRule(services);
  assert.equal(rule.rotationMethod, "ROTA_QUOTA");
  assert.equal(rule.unfilledQuotaCarryForward, true);

  const construction = services.promotion.constructCombinedSeniority(actor(), { quotaRuleId: rule.id, population: D4_POPULATION });
  // Worked vector (Appendix D.4): D1, P1, D2, P2, D3, P3 with DR-n/PR-n slots and cycle numbers.
  assert.deepEqual(
    construction.entries.map((entry) => [entry.employeeId, entry.rank, entry.quotaSlotLabel, entry.rotationCycleNo]),
    [
      ["D1", 1, "DR-1", 1],
      ["P1", 2, "PR-1", 1],
      ["D2", 3, "DR-2", 2],
      ["P2", 4, "PR-2", 2],
      ["D3", 5, "DR-3", 3],
      ["P3", 6, "PR-3", 3],
    ]
  );

  // AC-4 determinism: the same population + quota rule yields the same interleave, slot labels
  // and cycle numbers on recompute (deep-equal).
  const recomputed = services.promotion.constructCombinedSeniority(actor(), { quotaRuleId: rule.id, population: [...D4_POPULATION].reverse() });
  assert.deepEqual(recomputed.entries, construction.entries);
  assert.deepEqual(recomputed.trace, construction.trace);

  // The rotation trace is retrievable and shows which slot each entry consumed.
  const trace = services.promotion.getRotationTrace(actor(), construction.id);
  assert.equal(trace.quotaRuleId, rule.id);
  assert.equal(trace.trace.length, 6);
  assert.ok(trace.trace.every((slot) => slot.carriedForward === false && slot.filledByEmployeeId));

  // PROMOTEE_FIRST start slot flips the interleave head — configuration, not code.
  const prFirst = rotaQuotaRule(services, { rotationStartSlot: "PROMOTEE_FIRST" });
  const flipped = services.promotion.constructCombinedSeniority(actor(), { quotaRuleId: prFirst.id, population: D4_POPULATION });
  assert.deepEqual(
    flipped.entries.slice(0, 2).map((entry) => entry.employeeId),
    ["P1", "D1"]
  );
});

test("PH-15F FR-PPP-020 AC-3: an exhausted stream's quota slot carries forward — never silently lost", async () => {
  const services = createFoundationServices();
  const rule = rotaQuotaRule(services);
  // Appendix D.4 carry-forward vector: PR has only [P1]; slot PR-2 carries forward and D3 takes rank 4.
  const construction = services.promotion.constructCombinedSeniority(actor(), {
    quotaRuleId: rule.id,
    population: D4_POPULATION.filter((entry) => entry.employeeId !== "P2" && entry.employeeId !== "P3"),
  });
  assert.deepEqual(
    construction.entries.map((entry) => [entry.employeeId, entry.rank, entry.quotaSlotLabel]),
    [
      ["D1", 1, "DR-1"],
      ["P1", 2, "PR-1"],
      ["D2", 3, "DR-2"],
      ["D3", 4, "DR-3"],
    ]
  );
  const carried = construction.trace.find((slot) => slot.slotLabel === "PR-2");
  assert.ok(carried, "the unfilled PR-2 slot must be recorded in the rotation trace");
  assert.equal(carried.carriedForward, true);
  assert.equal(carried.filledByEmployeeId, undefined);
});

test("PH-15F FR-PPP-020 NEGATIVE: a population entry missing its stream tag fails with STREAM_TAG_MISSING", async () => {
  const services = createFoundationServices();
  const rule = rotaQuotaRule(services);
  assert.throws(
    () =>
      services.promotion.constructCombinedSeniority(actor(), {
        quotaRuleId: rule.id,
        population: [
          { employeeId: "D1", recruitmentStream: "DIRECT", streamSeniorityNo: 1 },
          // Legacy record with no stream/quota history — flagged for manual tagging.
          { employeeId: "X-legacy", streamSeniorityNo: 2 },
        ],
      }),
    (error) => error instanceof FoundationError && error.code === "STREAM_TAG_MISSING" && error.details.employeeId === "X-legacy"
  );
});

test("PH-15F FR-PPP-020 NEGATIVE: an invalid ratio or rotation method fails with QUOTA_RULE_INVALID", async () => {
  const services = createFoundationServices();
  // Negative ratio.
  assert.throws(
    () => rotaQuotaRule(services, { drQuotaRatio: -1 }),
    (error) => error instanceof FoundationError && error.code === "QUOTA_RULE_INVALID"
  );
  // All-zero ratios build nothing — rejected, never a silent empty rotation.
  assert.throws(
    () => rotaQuotaRule(services, { drQuotaRatio: 0, promoteeQuotaRatio: 0, ldceQuotaRatio: 0 }),
    (error) => error instanceof FoundationError && error.code === "QUOTA_RULE_INVALID"
  );
  // Unknown rotation method.
  assert.throws(
    () => rotaQuotaRule(services, { rotationMethod: "COIN_TOSS" }),
    (error) => error instanceof FoundationError && error.code === "QUOTA_RULE_INVALID"
  );
});

test("PH-15F FR-PPP-020: RUNNING_ACCOUNT and SEPARATE_STREAM methods are supported per policy", async () => {
  const services = createFoundationServices();
  const runningAccount = rotaQuotaRule(services, { rotationMethod: "RUNNING_ACCOUNT" });
  const ra = services.promotion.constructCombinedSeniority(actor(), { quotaRuleId: runningAccount.id, population: D4_POPULATION });
  assert.equal(ra.entries.length, 6);
  assert.ok(ra.entries.every((entry) => entry.quotaSlotLabel && entry.rotationCycleNo >= 1));

  const separate = rotaQuotaRule(services, { rotationMethod: "SEPARATE_STREAM" });
  const ss = services.promotion.constructCombinedSeniority(actor(), { quotaRuleId: separate.id, population: D4_POPULATION });
  // No interleave: DR block then PR block.
  assert.deepEqual(
    ss.entries.map((entry) => entry.employeeId),
    ["D1", "D2", "D3", "P1", "P2", "P3"]
  );
});

test("PH-15F FR-PPP-020 routes: quota rules and construction over the wire", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const rule = await call(api, {
    method: "POST",
    path: "/api/v1/promotions/seniority-quota-rules",
    headers: { "Idempotency-Key": "idem-ph15f-sqr-001" },
    body: { ruleCode: "SQR-WIRE-001", gradeDesignationId: GRADE, drQuotaRatio: 1, promoteeQuotaRatio: 1, rotationMethod: "ROTA_QUOTA" },
  });
  assert.equal(rule.status, 201);

  // NEGATIVE over the wire: the invalid ratio surfaces QUOTA_RULE_INVALID (422, fail closed).
  const badRule = await call(api, {
    method: "POST",
    path: "/api/v1/promotions/seniority-quota-rules",
    headers: { "Idempotency-Key": "idem-ph15f-sqr-002" },
    body: { ruleCode: "SQR-WIRE-002", gradeDesignationId: GRADE, drQuotaRatio: -2, promoteeQuotaRatio: 1, rotationMethod: "ROTA_QUOTA" },
  });
  assert.equal(badRule.status, 422);
  assert.equal(badRule.body.error.code, "QUOTA_RULE_INVALID");

  const constructed = await call(api, {
    method: "POST",
    path: "/api/v1/promotions/combined-seniority:construct",
    headers: { "Idempotency-Key": "idem-ph15f-csc-001" },
    body: { quotaRuleId: rule.body.seniorityQuotaRule.id, population: D4_POPULATION },
  });
  assert.equal(constructed.status, 201);
  assert.equal(constructed.body.construction.entries.length, 6);

  const trace = await call(api, {
    method: "GET",
    path: `/api/v1/promotions/combined-seniority/${constructed.body.construction.id}/rotation-trace`,
  });
  assert.equal(trace.status, 200);
  assert.equal(trace.body.trace.length, 6);

  // NEGATIVE over the wire: the missing stream tag surfaces STREAM_TAG_MISSING (422).
  const untagged = await call(api, {
    method: "POST",
    path: "/api/v1/promotions/combined-seniority:construct",
    headers: { "Idempotency-Key": "idem-ph15f-csc-002" },
    body: { quotaRuleId: rule.body.seniorityQuotaRule.id, population: [{ employeeId: "X-legacy" }] },
  });
  assert.equal(untagged.status, 422);
  assert.equal(untagged.body.error.code, "STREAM_TAG_MISSING");
});
