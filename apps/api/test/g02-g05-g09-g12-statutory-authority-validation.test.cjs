const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

// Statutory-authority & SR-custodian role validation (G02/G05/G09/G12). Exercises the regulated
// statutory roles — appointing_authority, transfer_authority, disciplinary_authority, sr_custodian,
// sr_second_custodian, and adjacent (vigilance_officer, inquiry_officer, icc_member, medical_board)
// — against the real runtime. Tests are tagged ENFORCED (matches auth-matrix intent) or DRIFT.
//
// Per the agreed scope this is validation + drift docs only: the cheap capability-flag gaps in this
// cluster (fraud_reviewer, grievance_officer, dpo_governance, g05_clearance/estate, g08_dual_control)
// were already closed by the hr_admin audit, and the money/identity SoD is enforced inline + via the
// P01 identity gate. The one unbuilt capability — sr_second_custodian corrigenda/FULL_SR-extract SoD
// (g12.correction.approve / g12.extract.certify) — is documented as DEFERRED, not built here.

function actor(userId, roles, permissions) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId, actorUserId: userId, permissions, roles, fieldGrants: [] };
}
function forbidden(error) {
  return error instanceof FoundationError && error.code === "FORBIDDEN";
}

// ---- G02: statutory personal-detail change — maker!=checker SoD + P01 resolved-assignee identity ----

test("ENFORCED G02: the change-request maker cannot approve (ERR-G02-SOD) and only the resolved reporting authority can", () => {
  const services = createFoundationServices();
  const maker = actor("g02-maker", ["hr_officer"], ["g02.change.submit", "g02.change.approve"]);
  const request = services.personalDetails.createRequest(maker, {
    employeeId: ph03Ids.employee,
    fieldCode: "displayName",
    newValue: "Kiran Statutory Validated",
    reason: "Statutory-authority validation",
  });
  assert.equal(request.request.status, "IN_REVIEW");

  // ERR-G02-SOD: the maker cannot decide on their own request.
  assert.throws(
    () => services.personalDetails.approve(maker, request.request.id),
    (error) => forbidden(error) && error.details?.messageId === "ERR-G02-SOD"
  );

  // P01 identity gate: an actor who is neither the resolved reporting authority (ph03.manager) nor
  // an override role is rejected even with the approve permission.
  const nonAssignee = actor("g02-nonassignee", ["hr_officer"], ["g02.change.approve"]);
  assert.throws(() => services.personalDetails.approve(nonAssignee, request.request.id), forbidden);

  // The resolved reporting authority (Kiran's reportingManagerId = ph03.manager) approves.
  const resolvedAuthority = actor(ph03Ids.manager, ["hod"], ["g02.change.approve"]);
  const approved = services.personalDetails.approve(resolvedAuthority, request.request.id);
  assert.equal(approved.status, "APPROVED");
});

// ---- G05: transfer sanction — only the resolved transfer authority (POSITION_AUTHORITY) can approve --

test("ENFORCED G05: a transfer order can only be approved by the resolved transfer authority, not any holder of the permission", () => {
  // seedTestEmployees seeds Devika in orgRevenue; the seeded G05_TRANSFER_REVENUE POSITION_AUTHORITY
  // (scope orgRevenue, authorityEmployeeId = ph03.manager) resolves her transfer's approver.
  const services = createFoundationServices({ seedTestEmployees: true });
  const devika = services.employeeMaster.getByServiceNo(actor("lookup", ["system"], ["*"]), "GOV-100305").id;

  // An override role (hr_admin) initiates so the initiator!=resolved-authority tangle is avoided.
  // orderDate is before the seeded July acting-charge delegation (Ananya->Kiran) so the transfer
  // authority resolves to ph03.manager, not the delegate.
  const initiator = actor("g05-initiator", ["hr_admin"], ["g05.transfer.initiate"]);
  const initiated = services.transfer.initiate(initiator, {
    employeeId: devika,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-06-15",
    effectiveDate: "2026-06-20",
    reason: "Statutory-authority validation",
  });
  assert.equal(initiated.order.status, "PENDING_APPROVAL");

  // Non-assignee, non-override actor with the approve permission is rejected by the P01 identity gate.
  const nonAssignee = actor("g05-nonassignee", ["hr_officer"], ["g05.transfer.approve"]);
  assert.throws(
    () => services.transfer.approve(nonAssignee, initiated.order.id, { idempotencyKey: "idem-g05-nonassignee" }),
    forbidden
  );

  // The resolved transfer authority (ph03.manager) approves.
  const transferAuthority = actor(ph03Ids.manager, ["hod"], ["g05.transfer.approve"]);
  const approved = services.transfer.approve(transferAuthority, initiated.order.id, { idempotencyKey: "idem-g05-authority" });
  assert.equal(approved.order.status, "APPROVED");
});

// ---- G09: disciplinary due process — actor-conflict SoD (DI-2) -------------------------------------

test("ENFORCED G09 ERR-G09-ACTOR-CONFLICT: the preliminary-inquiry officer must be distinct from the charged officer and the disciplinary authority", () => {
  const services = createFoundationServices();
  const da = actor("g09-da", ["disciplinary_authority"], ["g09.case.open", "g09.preliminary-inquiry.order"]);
  const opened = services.disciplinary.openCase(da, {
    chargedEmployeeId: ph03Ids.employee,
    disciplinaryAuthorityId: ph03Ids.manager,
    allegations: "Statutory-authority validation allegation",
    openedOn: "2026-07-01",
  });

  // PI officer == charged officer -> rejected (DI-2).
  assert.throws(
    () => services.disciplinary.orderPreliminaryInquiry(da, opened.id, { piOfficerId: ph03Ids.employee, orderedDate: "2026-07-02", dueDate: "2026-08-02" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ACTOR-CONFLICT"
  );
  // PI officer == disciplinary authority -> rejected (DI-2).
  assert.throws(
    () => services.disciplinary.orderPreliminaryInquiry(da, opened.id, { piOfficerId: ph03Ids.manager, orderedDate: "2026-07-02", dueDate: "2026-08-02" }),
    (error) => error instanceof FoundationError && error.code === "ERR-G09-ACTOR-CONFLICT"
  );
  // A distinct third person is accepted.
  const inquiry = services.disciplinary.orderPreliminaryInquiry(da, opened.id, {
    piOfficerId: "g09-io-distinct",
    orderedDate: "2026-07-02",
    dueDate: "2026-08-02",
  });
  assert.equal(inquiry.status, "ORDERED");
});

// ---- G12: SR custodian — sr_custodian override for cross-employee timeline access -------------------

test("ENFORCED G12: an sr_custodian can view any employee's service-register timeline; a non-override actor cannot view another's", () => {
  const services = createFoundationServices();
  const custodian = actor("g12-custodian", ["sr_custodian"], []);
  // Override: sr_custodian reads another employee's timeline without error.
  const asCustodian = services.serviceRegister.getTimeline(custodian, ph03Ids.employee);
  assert.ok(Array.isArray(asCustodian));

  // Self: the employee reads their own timeline.
  const self = actor(ph03Ids.employee, ["employee"], []);
  assert.ok(Array.isArray(services.serviceRegister.getTimeline(self, ph03Ids.employee)));

  // Non-override, non-self actor is rejected.
  const other = actor("g12-other", ["employee"], []);
  assert.throws(() => services.serviceRegister.getTimeline(other, ph03Ids.employee), forbidden);
});

// ---- DRIFT: sr_second_custodian second-custodian SoD is an unbuilt capability ----------------------

test("ENFORCED G12: sr_second_custodian corrigendum SoD — sr_custodian proposes, an independent sr_second_custodian approves (proposer!=approver), and the correction commits to the chain only on approval", () => {
  const services = createFoundationServices();
  const sys = actor("g12-sys", ["system"], ["*"]);
  const target = services.serviceRegister.ingest(sys, "idem-g12-corr-target-001", {
    sourceModule: "G10",
    sourceReferenceId: "g12-corr-target-ref-001",
    sourceEventVersion: 1,
    employeeId: ph03Ids.employee,
    eventTypeCode: "PAY_EVENT",
    eventDate: "2026-07-01",
    payload: { note: "original entry" },
  }).event;
  assert.equal(services.serviceRegister.count(sys), 1);

  // Only sr_custodian can propose.
  const nonCustodian = actor("g12-noncustodian", ["employee"], ["g12.correction.approve"]);
  assert.throws(() => services.serviceRegister.proposeCorrigendum(nonCustodian, { targetEventId: target.id, correctionNote: "Fix designation" }), forbidden);

  // sr_custodian proposes (PENDING — writes nothing to the chain yet).
  const custodian = actor("g12-custodian", ["sr_custodian"], ["g12.correction.approve"]);
  const corrigendum = services.serviceRegister.proposeCorrigendum(custodian, { targetEventId: target.id, correctionNote: "Fix designation" });
  assert.equal(corrigendum.status, "PENDING");
  assert.equal(corrigendum.proposedByUserId, "g12-custodian");
  assert.equal(services.serviceRegister.count(sys), 1, "a pending corrigendum writes nothing to the chain");

  // Only sr_second_custodian can approve (sr_custodian cannot self-approve).
  const custodianApprover = actor("g12-custodian", ["sr_custodian"], ["g12.correction.approve"]);
  assert.throws(() => services.serviceRegister.approveCorrigendum(custodianApprover, corrigendum.id), forbidden);

  // 3-way SoD: even with the sr_second_custodian role, the proposing custodian cannot approve their own proposal.
  const proposerAsSecond = actor("g12-custodian", ["sr_second_custodian"], ["g12.correction.approve"]);
  assert.throws(
    () => services.serviceRegister.approveCorrigendum(proposerAsSecond, corrigendum.id),
    (error) => forbidden(error) && error.details?.marker === "SR_CORRIGENDUM_SOD"
  );

  // An independent sr_second_custodian approves -> commits a CORRIGENDUM annotation to the chain.
  const secondCustodian = actor("g12-second", ["sr_second_custodian"], ["g12.correction.approve"]);
  const approved = services.serviceRegister.approveCorrigendum(secondCustodian, corrigendum.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedByUserId, "g12-second");
  assert.ok(approved.corrigendumEventId);
  assert.equal(services.serviceRegister.count(sys), 2, "approval commits the corrigendum annotation");
  // The committed corrigendum annotated the target entry (status projection ANNOTATED).
  assert.equal(services.serviceRegister.getEvent(sys, target.id)?.status, "ANNOTATED");
});
