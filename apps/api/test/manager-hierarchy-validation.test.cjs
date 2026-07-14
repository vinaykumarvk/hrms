const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, FoundationError, ph03Ids } = require("../../../dist/apps/api/src");

// Manager-hierarchy role validation. The 9 roles l1_manager..l5_manager, hod, uag_head,
// skip_level_manager, dotted_line_manager are exercised against the REAL runtime (in-memory backend
// with a seeded 5-level reporting chain). Each test asserts the ACTUAL runtime behaviour and is
// tagged ENFORCED (behaviour matches auth-matrix intent) or DRIFT (runtime diverges from the
// matrix's level/subtree/dotted-line model). The drift is documented, not "fixed", per the agreed
// validation-only scope; the enforcement builds are deferred to separate standard-path goals.

const SERVICE_NUMBERS = {
  leaf: "GOV-100501",
  l1: "GOV-100502",
  l2: "GOV-100503",
  l3: "GOV-100504",
  l4: "GOV-100505",
  l5: "GOV-100506",
};

function boot() {
  return createFoundationServices({ seedManagerHierarchy: true });
}

function sysActor() {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId: "mh-lookup", actorUserId: "mh-lookup", permissions: ["*"], roles: ["system"], fieldGrants: [] };
}

/** Look up the seeded chain employee ids by service number. */
function chainIds(services) {
  const sys = sysActor();
  const ids = {};
  for (const [key, serviceNo] of Object.entries(SERVICE_NUMBERS)) {
    const employee = services.employeeMaster.getByServiceNo(sys, serviceNo);
    ids[key] = employee.id;
  }
  return ids;
}

function actor(userId, roles, permissions) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, userId, actorUserId: userId, permissions, roles, fieldGrants: [] };
}

const LEAVE_PERMS = ["g03.leave.submit", "g03.leave.approve", "g03.leave.reject", "g03.leave.read", "g04.relay.write"];

function forbidden(error) {
  return error instanceof FoundationError && error.code === "FORBIDDEN";
}

// ---- G03 leave: the one surface where manager identity IS enforced (via workflow.act) -----------

test("ENFORCED+DRIFT leave: only the DIRECT manager (L1) is the resolved approver; L2..L5 are FORBIDDEN even with the leave-approve permission", async () => {
  const services = boot();
  const ids = chainIds(services);
  const leaf = actor(ids.leaf, ["employee"], ["g03.leave.submit", "g03.leave.read"]);
  const submitted = services.leave.submit(leaf, { employeeId: ids.leaf, leaveTypeId: "CL", fromDate: "2026-08-03", toDate: "2026-08-03" });
  assert.equal(submitted.workflow.instance.status, "RUNNING");

  // DRIFT: auth-matrix maps g03.leave.approve to L1..L5, but AuthorityResolutionService resolves
  // only the subject's single reportingManagerId (L1). L2..L5 carry the permission string yet are
  // never the resolved assignee, so workflow.act()'s identity gate rejects them.
  for (const level of ["l2", "l3", "l4", "l5"]) {
    const upChain = actor(ids[level], [`${level}_manager`], LEAVE_PERMS);
    assert.throws(() => services.leave.approve(upChain, submitted.application.id, `idem-mh-${level}-001`), forbidden);
  }
  // The application must remain SUBMITTED — none of the rejected attempts mutated state.
  const stillSubmitted = services.leave.listApplications(actor(ids.l1, ["l1_manager"], LEAVE_PERMS)).find((item) => item.id === submitted.application.id);
  assert.equal(stillSubmitted.status, "SUBMITTED");

  // ENFORCED: the direct reporting manager (L1) is the resolved assignee and can approve.
  const l1 = actor(ids.l1, ["l1_manager"], LEAVE_PERMS);
  const approved = services.leave.approve(l1, submitted.application.id, "idem-mh-l1-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("ENFORCED self-approve SoD: a manager is never their own resolved approver and cannot approve their own leave", async () => {
  const services = boot();
  const ids = chainIds(services);
  // L1 submits their own leave; the resolver returns L1's reportingManagerId (L2), not L1.
  const l1 = actor(ids.l1, ["l1_manager"], LEAVE_PERMS);
  const submitted = services.leave.submit(l1, { employeeId: ids.l1, leaveTypeId: "CL", fromDate: "2026-08-10", toDate: "2026-08-10" });
  assert.throws(() => services.leave.approve(l1, submitted.application.id, "idem-mh-self-001"), forbidden);

  // L1's own manager (L2) is the resolved assignee and can approve.
  const l2 = actor(ids.l2, ["l2_manager"], LEAVE_PERMS);
  const approved = services.leave.approve(l2, submitted.application.id, "idem-mh-self-l2-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("ENFORCED override regression: hr_admin (an APPROVAL_OVERRIDE_ROLE) can still decide a manager-routed task over the resolved chain", async () => {
  const services = boot();
  const ids = chainIds(services);
  const leaf = actor(ids.leaf, ["employee"], ["g03.leave.submit", "g03.leave.read"]);
  const submitted = services.leave.submit(leaf, { employeeId: ids.leaf, leaveTypeId: "CL", fromDate: "2026-08-17", toDate: "2026-08-17" });

  const hrAdmin = actor("mh-hr-admin", ["hr_admin"], LEAVE_PERMS);
  const approved = services.leave.approve(hrAdmin, submitted.application.id, "idem-mh-override-001");
  assert.equal(approved.application.status, "APPROVED");
});

test("DRIFT non-override roles: hod, uag_head, skip_level_manager and dotted_line_manager hold NO override power and are FORBIDDEN on another team's task", async () => {
  const services = boot();
  const ids = chainIds(services);
  const leaf = actor(ids.leaf, ["employee"], ["g03.leave.submit", "g03.leave.read"]);
  const submitted = services.leave.submit(leaf, { employeeId: ids.leaf, leaveTypeId: "CL", fromDate: "2026-08-24", toDate: "2026-08-24" });

  // None of these are in APPROVAL_OVERRIDE_ROLES and none is the leaf's resolved assignee (L1), so
  // all are rejected. ENFORCED that they cannot approve; DRIFT that skip/dotted have no read-only
  // subtree alternative either (no subtree model exists).
  const cases = [
    { userId: "mh-hod", roles: ["hod"] },
    { userId: "mh-uag-head", roles: ["uag_head"] },
    { userId: ids.l2, roles: ["skip_level_manager"] }, // two levels above the leaf
    { userId: ids.l3, roles: ["dotted_line_manager"] },
  ];
  let n = 0;
  for (const { userId, roles } of cases) {
    n += 1;
    const candidate = actor(userId, roles, LEAVE_PERMS);
    assert.throws(() => services.leave.approve(candidate, submitted.application.id, `idem-mh-nonoverride-${n}`), forbidden);
  }
});

// ---- G08 APAR: the surface where manager level/identity is NOT enforced --------------------------

test("DRIFT apar: the reporting-officer assessment is permission-only — no g08_appraiser_roles level check and no RO-identity check", async () => {
  const services = boot();
  const ids = chainIds(services);
  // Open a non-sealed APAR for the leaf, naming L1 as reporting officer and L2 as reviewing officer.
  const opener = actor("mh-apar-opener", ["g08_apar_custodian"], ["g08.apar.form.open"]);
  const form = services.apar.openForm(opener, {
    employeeId: ids.leaf,
    periodStart: "2026-04-01",
    periodEnd: "2027-03-31",
    reportingOfficerId: ids.l1,
    reviewingOfficerId: ids.l2,
    acceptingAuthorityId: ph03Ids.manager,
  });
  assert.equal(form.status, "GOALS_PENDING");

  // Appraisee self-submits to advance to RO_ASSESSMENT.
  const leafSelf = actor(ids.leaf, ["employee"], ["g08.apar.self.submit"]);
  services.apar.submitSelf(leafSelf, form.id, { narrative: "Manager-hierarchy validation appraisee narrative." });
  const atRoAssessment = services.apar.listMyForms(leafSelf, ids.leaf).find((item) => item.id === form.id);
  assert.equal(atRoAssessment.status, "RO_ASSESSMENT");

  // DRIFT: an L3 actor — who is NOT the named reporting officer (L1) and carries no g08_appraiser_roles
  // capability flag — records the reporting assessment using only the g08.apar.report permission.
  // recordReporting() checks the permission + status, never the actor's level or RO identity, and it
  // bypasses workflow.act() so the P01 identity gate never fires for APAR assessment.
  const l3Impostor = actor(ids.l3, ["l3_manager"], ["g08.apar.report"]);
  const recorded = services.apar.recordReporting(l3Impostor, form.id, { grade: "VERY_GOOD", narrative: "Assessment recorded by a non-reporting-officer L3 actor." });
  assert.equal(recorded.status, "RVO_REVIEW");
});

// ---- G10: a HOD-only capability that IS role-gated ------------------------------------------------

test("ENFORCED g10 FnF sanction: requires hod/sanctioning_authority; l1_manager and uag_head are FORBIDDEN; maker cannot self-sanction (SoD)", async () => {
  const services = boot();
  const ids = chainIds(services);
  const maker = actor("mh-fnf-maker", ["hr_admin"], ["g10.fnf.settle"]);
  const settlement = services.compensationIntegration.settleFnf(maker, {
    employeeId: ids.leaf,
    separationDate: "2026-12-31",
    finalMonthPayPaise: 2500000,
  });

  // An L1 manager and a UAG head both hold the g10.fnf.settle permission but neither role satisfies
  // the sanctioning_authority/hod role gate — confirming uag_head does NOT inherit HOD sanction
  // power (the UAG "hard ceiling" manifests at the role-string level).
  const l1Manager = actor(ids.l1, ["l1_manager"], ["g10.fnf.settle"]);
  assert.throws(() => services.compensationIntegration.sanctionFnfSettlement(l1Manager, settlement.id), forbidden);
  const uagHead = actor("mh-uag-head-fnf", ["uag_head"], ["g10.fnf.settle"]);
  assert.throws(() => services.compensationIntegration.sanctionFnfSettlement(uagHead, settlement.id), forbidden);

  // SoD: a HOD actor who is also the settlement creator is still blocked from self-sanction.
  const makerAsHod = actor("mh-fnf-maker", ["hod"], ["g10.fnf.settle"]);
  assert.throws(() => services.compensationIntegration.sanctionFnfSettlement(makerAsHod, settlement.id), forbidden);

  // ENFORCED: a distinct HOD actor sanctions the settlement.
  const hod = actor("mh-hod-fnf", ["hod"], ["g10.fnf.settle"]);
  const sanctioned = services.compensationIntegration.sanctionFnfSettlement(hod, settlement.id);
  assert.ok(sanctioned.sanctionedBy);
  assert.ok(sanctioned.sanctionedAt);
});

// ---- Manager hierarchy platform capabilities: subtree, dotted-line, skip-level (CC-007) ----------

test("ENFORCED manager hierarchy: reporting subtree (transitive + dotted-line), dotted-line manager, and skip-level resolution", async () => {
  const services = createFoundationServices({ seedManagerHierarchy: true });
  const ids = chainIds(services);
  const resolver = services.authorityResolution;
  const scope = { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity };

  // Subtree is transitive over the primary reporting line: L2's subtree = {L1, leaf}.
  const l2Subtree = resolver.resolveReportingSubtree(scope, ids.l2);
  assert.equal(l2Subtree.length, 2);
  assert.ok(l2Subtree.includes(ids.leaf) && l2Subtree.includes(ids.l1));

  // Dotted-line: leaf's dotted-line manager is L3, so leaf also appears in L3's subtree.
  const l3Subtree = resolver.resolveReportingSubtree(scope, ids.l3);
  assert.ok(l3Subtree.includes(ids.leaf), "dotted-line reportee appears in the dotted-line manager's subtree");

  // Dotted-line resolution returns the secondary manager.
  const dotted = resolver.resolveDottedLineManager(scope, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: ids.leaf });
  assert.equal(dotted.selectedAssignees[0].employeeId, ids.l3);

  // An employee with no dotted-line manager fails closed.
  assert.throws(
    () => resolver.resolveDottedLineManager(scope, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: ids.l1 }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  // Skip-level: leaf's chain is L1(direct), L2, L3, L4, L5 — skip-level excludes the direct L1.
  const skip = resolver.resolveSkipLevelManagers(scope, ids.leaf);
  assert.ok(!skip.includes(ids.l1), "the direct reporting manager is not skip-level");
  assert.ok(skip.includes(ids.l2) && skip.includes(ids.l5));
});
