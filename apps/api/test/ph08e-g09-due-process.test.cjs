const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  createFoundationApi,
  createFoundationServices,
  FileBackedG09DueProcessRepository,
  FoundationError,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph08e-g09",
    actorUserId: "user-ph08e-g09",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08e-g09",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph08e-g09", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

/** Drives a case to INQUIRY_REPORT so show-cause / finalise gates can be exercised. */
function caseAtInquiryReport(services, suffix) {
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: `PH-08E due-process chain ${suffix}`,
  });
  services.disciplinary.serveChargeMemo(actor(), opened.id, { articles: ["Article I"], servedOn: "2026-08-01" });
  services.disciplinary.recordInquiryReport(actor(), opened.id, { findings: "PROVED", reportDate: "2026-08-20" });
  return opened;
}

test("PH-08E preliminary inquiry runs ORDERED -> IN_PROGRESS -> SUBMITTED with a recommendation", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Complaint requiring fact-finding",
  });
  const ordered = services.disciplinary.orderPreliminaryInquiry(actor(), opened.id, {
    piOfficerId: "pi-officer-001",
    orderedDate: "2026-07-03",
    dueDate: "2026-08-02",
  });
  assert.equal(ordered.status, "ORDERED");
  const inProgress = services.disciplinary.beginPreliminaryInquiry(actor(), ordered.id);
  assert.equal(inProgress.status, "IN_PROGRESS");
  const submitted = services.disciplinary.submitPreliminaryInquiry(actor(), ordered.id, {
    findingsSummary: "Prima facie case made out",
    recommendation: "PROCEED_MAJOR",
    submittedAt: "2026-07-20",
  });
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.recommendation, "PROCEED_MAJOR");

  // DI-2 SoD: the charged officer can never be the preliminary inquiry officer.
  assert.throws(
    () =>
      services.disciplinary.orderPreliminaryInquiry(actor(), opened.id, {
        piOfficerId: ph03Ids.employee,
        orderedDate: "2026-07-03",
        dueDate: "2026-08-02",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ACTOR-CONFLICT"
  );
});

test("PH-08E suspension enforces subsistence bounds and the non-employment certificate gate", async () => {
  const services = createFoundationServices();
  const opened = services.disciplinary.openCase(actor(), {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Grave misconduct warranting suspension",
  });

  // Out-of-bounds rates (template floor/ceiling default 25/75) are refused.
  assert.throws(
    () => services.disciplinary.orderSuspension(actor(), opened.id, { effectiveFrom: "2026-07-05", subsistenceRatePct: 90 }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS"
  );
  assert.throws(
    () => services.disciplinary.orderSuspension(actor(), opened.id, { effectiveFrom: "2026-07-05", subsistenceRatePct: 10 }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS"
  );

  const suspension = services.disciplinary.orderSuspension(actor(), opened.id, { effectiveFrom: "2026-07-05", subsistenceRatePct: 50 });
  assert.equal(suspension.status, "ACTIVE");
  assert.equal(suspension.subsistenceRatePct, 50);
  assert.equal(suspension.chargeMemoDueDate, "2026-10-03"); // 90-day charge-memo window

  // DI-16: subsistence revision without the non-employment certificate is refused.
  assert.throws(
    () => services.disciplinary.reviseSubsistenceRate(actor(), suspension.id, { newRatePct: 75, revisionDate: "2027-01-05" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED"
  );
  services.disciplinary.recordNonEmploymentCertificate(actor(), suspension.id, { receivedDate: "2026-12-30" });
  const revised = services.disciplinary.reviseSubsistenceRate(actor(), suspension.id, { newRatePct: 75, revisionDate: "2027-01-05" });
  assert.equal(revised.subsistenceRatePct, 75);

  // Revised rate must still sit inside the bounds.
  assert.throws(
    () => services.disciplinary.reviseSubsistenceRate(actor(), suspension.id, { newRatePct: 80, revisionDate: "2027-01-06" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS"
  );

  const reviewed = services.disciplinary.reviewSuspension(actor(), suspension.id, { outcome: "REVOKE", reviewDate: "2027-02-01", reason: "Charge memo issued; suspension no longer necessary" });
  assert.equal(reviewed.status, "REVOKED");
});

test("PH-08E DI-4: final penalty beyond the show-cause proposed set is refused, subset succeeds end-to-end", async () => {
  const services = createFoundationServices();
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "appointing-authority-001", authorityLevel: "APPOINTING_AUTHORITY" });
  const opened = caseAtInquiryReport(services, "DI-4 subset");
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["REDUCTION_IN_RANK", "RECOVERY"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });
  assert.deepEqual(notice.proposedPenaltyJson, ["REDUCTION_IN_RANK", "RECOVERY"]);
  services.disciplinary.respondToShowCause(actor(), notice.id, { representationText: "Penalty disproportionate", respondedAt: "2026-09-05" });

  // Negative: "DISMISSAL" was never proposed — enhancement past the proposed set is blocked.
  assert.throws(
    () =>
      services.disciplinary.finaliseOrder(actor(), opened.id, {
        showCauseNoticeId: notice.id,
        penalties: ["DISMISSAL"],
        passedBy: "appointing-authority-001",
        orderDate: "2026-09-20",
        reasoningText: "Charges proved",
        proportionalityReasoning: "Gravity of proved charges",
        idempotencyKey: "idem-ph08e-di4-neg-001",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-PENALTY-EXCEEDS-PROPOSED"
  );
  // A blocked gate leaves no partial order state.
  assert.equal(services.disciplinary.summary(actor()).penalties, 0);

  const finalised = services.disciplinary.finaliseOrder(actor(), opened.id, {
    showCauseNoticeId: notice.id,
    penalties: ["REDUCTION_IN_RANK"],
    passedBy: "appointing-authority-001",
    orderDate: "2026-09-20",
    reasoningText: "Charges proved on all articles",
    proportionalityReasoning: "Reduction proportionate to proved charges",
    idempotencyKey: "idem-ph08e-di4-pos-001",
  });
  assert.equal(finalised.penaltyOrder.status, "FINALISED");
  assert.deepEqual(finalised.penaltyOrder.penaltyItems, ["REDUCTION_IN_RANK"]);
  assert.match(finalised.srEventId, /^sr-/);
});

test("PH-08E Art. 311(1) NEGATIVE: DISMISSAL finalised by a subordinate authority throws ERR-G09-AUTHORITY-NOT-COMPETENT", async () => {
  const services = createFoundationServices();
  // The passing authority sits BELOW the appointing authority on the ladder (subordinate).
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "subordinate-authority-001", authorityLevel: "HEAD_OF_OFFICE" });
  const opened = caseAtInquiryReport(services, "Art. 311 guard");
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["DISMISSAL"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });
  services.disciplinary.respondToShowCause(actor(), notice.id, { representationText: "Representation on proposed DISMISSAL", respondedAt: "2026-09-05" });

  assert.throws(
    () =>
      services.disciplinary.finaliseOrder(actor(), opened.id, {
        showCauseNoticeId: notice.id,
        penalties: ["DISMISSAL"],
        passedBy: "subordinate-authority-001",
        orderDate: "2026-09-20",
        reasoningText: "Charges proved",
        proportionalityReasoning: "Gravest penalty for gravest charge",
        idempotencyKey: "idem-ph08e-art311-neg-001",
      }),
    (error) =>
      error instanceof FoundationError &&
      error.code === "ERR-G09-AUTHORITY-NOT-COMPETENT" &&
      error.details.penaltyType === "DISMISSAL"
  );
  // Fail-closed: nothing persisted, the case did not move.
  assert.equal(services.disciplinary.summary(actor()).penalties, 0);

  // The same DISMISSAL passes when the authority is NOT subordinate to the appointing authority.
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "appointing-authority-002", authorityLevel: "APPOINTING_AUTHORITY" });
  const finalised = services.disciplinary.finaliseOrder(actor(), opened.id, {
    showCauseNoticeId: notice.id,
    penalties: ["DISMISSAL"],
    passedBy: "appointing-authority-002",
    orderDate: "2026-09-21",
    reasoningText: "Charges proved",
    proportionalityReasoning: "Gravest penalty for gravest charge",
    idempotencyKey: "idem-ph08e-art311-pos-001",
  });
  assert.deepEqual(finalised.penaltyOrder.penaltyItems, ["DISMISSAL"]);
});

test("PH-08E fail-safe deny: an unassigned authority level cannot finalise any penalty", async () => {
  const services = createFoundationServices();
  const opened = caseAtInquiryReport(services, "fail-safe deny");
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["CENSURE"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });
  assert.throws(
    () =>
      services.disciplinary.finaliseOrder(actor(), opened.id, {
        showCauseNoticeId: notice.id,
        penalties: ["CENSURE"],
        passedBy: "unregistered-authority-001",
        orderDate: "2026-09-20",
        reasoningText: "Charges proved",
        proportionalityReasoning: "Censure proportionate",
        idempotencyKey: "idem-ph08e-failsafe-001",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-AUTHORITY-NOT-COMPETENT"
  );
});

test("PH-08E DI-14: pending mandatory consultation blocks finalise until CLOSED or WAIVED", async () => {
  const services = createFoundationServices();
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "appointing-authority-003", authorityLevel: "APPOINTING_AUTHORITY" });
  const opened = caseAtInquiryReport(services, "consultation gate");
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["COMPULSORY_RETIREMENT"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });
  const upsc = services.disciplinary.requireConsultation(actor(), opened.id, { consultationType: "UPSC", isMandatory: true, requestedDate: "2026-08-26" });
  const legal = services.disciplinary.requireConsultation(actor(), opened.id, { consultationType: "LEGAL", isMandatory: true });

  const finaliseInput = {
    showCauseNoticeId: notice.id,
    penalties: ["COMPULSORY_RETIREMENT"],
    passedBy: "appointing-authority-003",
    orderDate: "2026-09-20",
    reasoningText: "Charges proved",
    proportionalityReasoning: "Compulsory retirement proportionate",
    idempotencyKey: "idem-ph08e-consult-001",
  };
  assert.throws(
    () => services.disciplinary.finaliseOrder(actor(), opened.id, finaliseInput),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-CONSULTATION-PENDING"
  );

  services.disciplinary.closeConsultation(actor(), upsc.id, { adviceSummary: "UPSC concurs", receivedDate: "2026-09-15" });
  // Still blocked: the LEGAL consultation is neither CLOSED nor WAIVED.
  assert.throws(
    () => services.disciplinary.finaliseOrder(actor(), opened.id, finaliseInput),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-CONSULTATION-PENDING"
  );
  services.disciplinary.waiveConsultation(actor(), legal.id, { waiverReason: "Legal advice already on record from PI stage", waivedOn: "2026-09-16" });
  const finalised = services.disciplinary.finaliseOrder(actor(), opened.id, finaliseInput);
  assert.equal(finalised.penaltyOrder.status, "FINALISED");
});

test("PH-08E disagreement memo must be served AND responded before the order can be finalised", async () => {
  const services = createFoundationServices();
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "appointing-authority-004", authorityLevel: "APPOINTING_AUTHORITY" });
  const opened = caseAtInquiryReport(services, "disagreement memo");
  const memo = services.disciplinary.recordDisagreementMemo(actor(), opened.id, {
    tentativeDisagreement: "DA tentatively disagrees with the IO's NOT PROVED finding on Article II",
    articlesAffected: ["Article II"],
    servedDate: "2026-08-22",
  });
  assert.equal(memo.status, "SERVED");
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["WITHHOLD_INCREMENT"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });
  const finaliseInput = {
    showCauseNoticeId: notice.id,
    penalties: ["WITHHOLD_INCREMENT"],
    passedBy: "appointing-authority-004",
    orderDate: "2026-09-20",
    reasoningText: "Charges proved on DA's reasoned disagreement",
    proportionalityReasoning: "Increment withholding proportionate",
    idempotencyKey: "idem-ph08e-memo-001",
  };
  assert.throws(
    () => services.disciplinary.finaliseOrder(actor(), opened.id, finaliseInput),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-DUE-PROCESS-INCOMPLETE"
  );
  const responded = services.disciplinary.respondToDisagreementMemo(actor(), memo.id, {
    representationText: "Respondent's representation on the disagreement",
    respondedAt: "2026-09-01",
  });
  assert.equal(responded.status, "RESPONDED");
  const finalised = services.disciplinary.finaliseOrder(actor(), opened.id, finaliseInput);
  assert.equal(finalised.penaltyOrder.status, "FINALISED");
});

test("PH-08E DI-26: death of the respondent abates the case and blocks penalty finalise", async () => {
  const services = createFoundationServices();
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "appointing-authority-005", authorityLevel: "APPOINTING_AUTHORITY" });
  const opened = caseAtInquiryReport(services, "abatement");
  const notice = services.disciplinary.issueShowCauseNotice(actor(), opened.id, {
    proposedPenalties: ["DISMISSAL"],
    issuedDate: "2026-08-25",
    responseDueDate: "2026-09-10",
  });
  const abated = services.disciplinary.recordRespondentDeath(actor(), opened.id, { deathDate: "2026-09-12" });
  assert.equal(abated.caseStatus, "ABATED");
  assert.throws(
    () =>
      services.disciplinary.finaliseOrder(actor(), opened.id, {
        showCauseNoticeId: notice.id,
        penalties: ["DISMISSAL"],
        passedBy: "appointing-authority-005",
        orderDate: "2026-09-20",
        reasoningText: "Charges proved",
        proportionalityReasoning: "Gravest penalty",
        idempotencyKey: "idem-ph08e-abate-001",
      }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-CASE-ABATED"
  );
});

test("PH-08E DI-21: every action appends a chained timeline row (seq_no, prev_hash, row_hash) and verify passes", async () => {
  const services = createFoundationServices();
  const opened = caseAtInquiryReport(services, "timeline chain");
  services.disciplinary.orderSuspension(actor(), opened.id, { effectiveFrom: "2026-07-05", subsistenceRatePct: 50 });
  const timeline = services.disciplinary.listCaseTimeline(actor(), opened.id);
  assert.ok(timeline.length >= 4); // open, charge, inquiry report, suspension
  assert.equal(timeline[0].seqNo, 1);
  assert.equal(timeline[0].prevHash, undefined);
  for (let index = 1; index < timeline.length; index += 1) {
    assert.equal(timeline[index].seqNo, index + 1);
    assert.equal(timeline[index].prevHash, timeline[index - 1].rowHash); // prev_hash links to prior row_hash
    assert.match(timeline[index].rowHash, /^[0-9a-f]{64}$/);
  }
  const verified = services.disciplinary.verifyCaseTimeline(actor(), opened.id);
  assert.equal(verified.verified, true);
  assert.equal(verified.eventCount, timeline.length);
});

test("PH-08E DI-21 tamper: a DB-layer mutation of a timeline row is detected as ERR-G09-AUDIT-CHAIN-BROKEN", async () => {
  const stateFile = join(mkdtempSync(join(tmpdir(), "ph08e-g09-")), "g09-due-process.json");
  const repository = new FileBackedG09DueProcessRepository(stateFile);
  const services = createFoundationServices({ g09DueProcessRepository: repository });
  const opened = caseAtInquiryReport(services, "tamper detection");
  assert.equal(services.disciplinary.verifyCaseTimeline(actor(), opened.id).verified, true);

  // Tamper with the durable store directly — the application layer is not complicit.
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.ok(state.timelineEvents.length >= 3);
  state.timelineEvents[1].notes = "Falsified history entry"; // stored row_hash no longer matches content
  writeFileSync(stateFile, JSON.stringify(state), "utf8");

  const rehydrated = createFoundationServices({ g09DueProcessRepository: new FileBackedG09DueProcessRepository(stateFile) });
  assert.throws(
    () => rehydrated.disciplinary.verifyCaseTimeline(actor(), opened.id),
    (error) =>
      error instanceof FoundationError &&
      error.code === "ERR-G09-AUDIT-CHAIN-BROKEN" &&
      error.details.firstBrokenSeqNo === 2
  );
});

test("PH-08E routes drive the due-process chain and surface BRD codes on the wire", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  services.disciplinary.registerAuthorityLevel(actor(), { employeeId: "appointing-authority-006", authorityLevel: "APPOINTING_AUTHORITY" });

  const opened = await call(api, {
    method: "POST",
    path: "/api/v1/disciplinary/cases",
    headers: { "Idempotency-Key": "idem-ph08e-route-open-001" },
    body: { allegations: "Route-level due-process chain" },
  });
  assert.equal(opened.status, 201);
  const caseId = opened.body.disciplinaryCase.id;

  const pi = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:preliminary-inquiry`,
    headers: { "Idempotency-Key": "idem-ph08e-route-pi-001" },
    body: { piOfficerId: "pi-officer-777", orderedDate: "2026-07-03", dueDate: "2026-08-02" },
  });
  assert.equal(pi.status, 201);
  assert.equal(
    (await call(api, {
      method: "POST",
      path: `/api/v1/disciplinary/preliminary-inquiries/${pi.body.preliminaryInquiry.id}:submit`,
      headers: { "Idempotency-Key": "idem-ph08e-route-pi-002" },
      body: { findingsSummary: "Prima facie", recommendation: "PROCEED_MAJOR", submittedAt: "2026-07-20" },
    })).status,
    202
  );

  // Out-of-bounds subsistence over the wire is a 422 with the BRD code.
  const badSuspension = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:suspend`,
    headers: { "Idempotency-Key": "idem-ph08e-route-susp-001" },
    body: { effectiveFrom: "2026-07-05", subsistenceRatePct: 95 },
  });
  assert.equal(badSuspension.status, 422);
  assert.equal(badSuspension.body.error.code, "ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS");

  await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:charge`,
    headers: { "Idempotency-Key": "idem-ph08e-route-charge-001" },
    body: { servedOn: "2026-08-01", articles: ["Article I"] },
  });
  await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:inquiry-report`,
    headers: { "Idempotency-Key": "idem-ph08e-route-inq-001" },
    body: { findings: "PROVED", reportDate: "2026-08-20" },
  });
  const notice = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:show-cause`,
    headers: { "Idempotency-Key": "idem-ph08e-route-scn-001" },
    body: { proposedPenalties: ["REMOVAL"], issuedDate: "2026-08-25", responseDueDate: "2026-09-10" },
  });
  assert.equal(notice.status, 201);

  // DI-4 over the wire: DISMISSAL was not proposed -> 409 ERR-G09-PENALTY-EXCEEDS-PROPOSED.
  const exceeds = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:finalise-order`,
    headers: { "Idempotency-Key": "idem-ph08e-route-fin-001" },
    body: {
      showCauseNoticeId: notice.body.showCauseNotice.id,
      penalties: ["DISMISSAL"],
      passedBy: "appointing-authority-006",
      orderDate: "2026-09-20",
      reasoningText: "Charges proved",
      proportionalityReasoning: "Removal proportionate",
    },
  });
  assert.equal(exceeds.status, 409);
  assert.equal(exceeds.body.error.code, "ERR-G09-PENALTY-EXCEEDS-PROPOSED");

  const finalised = await call(api, {
    method: "POST",
    path: `/api/v1/disciplinary/cases/${caseId}:finalise-order`,
    headers: { "Idempotency-Key": "idem-ph08e-route-fin-002" },
    body: {
      showCauseNoticeId: notice.body.showCauseNotice.id,
      penalties: ["REMOVAL"],
      passedBy: "appointing-authority-006",
      orderDate: "2026-09-20",
      reasoningText: "Charges proved",
      proportionalityReasoning: "Removal proportionate",
    },
  });
  assert.equal(finalised.status, 202);
  assert.deepEqual(finalised.body.penaltyOrder.penaltyItems, ["REMOVAL"]);

  const verify = await call(api, { method: "GET", path: `/api/v1/disciplinary/cases/${caseId}/timeline-verify` });
  assert.equal(verify.status, 200);
  assert.equal(verify.body.verified, true);
});
