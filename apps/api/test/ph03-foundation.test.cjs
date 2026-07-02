const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationServices,
  foundationServiceRegistry,
  ph03Ids,
  FoundationError,
  toPublicError,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-hr-admin",
    actorUserId: "user-hr-admin",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph03-test",
    ...extra,
  };
}

test("authority resolver covers hierarchy, delegation precedence, SoD block, committees, and ambiguous authority fail-closed", () => {
  const services = createFoundationServices();
  const scope = actor();

  const manager = services.authorityResolution.resolve(
    scope,
    { mechanism: "REPORTING_CHAIN", subjectEmployeeId: ph03Ids.employee },
    "2026-07-01"
  );
  assert.equal(manager.selectedAssignees[0].employeeId, ph03Ids.manager);
  assert.equal(manager.evidence.source, "employee_job_assignments.reporting_manager_id");

  const delegated = services.authorityResolution.resolve(
    scope,
    { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue, subjectEmployeeId: ph03Ids.manager },
    "2026-07-01"
  );
  assert.equal(delegated.selectedAssignees[0].employeeId, ph03Ids.employee);
  assert.equal(delegated.evidence.delegatedBy, "d1000000-0000-0000-0000-000000000001");

  const sodBlocked = services.authorityResolution.resolve(
    scope,
    { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue, subjectEmployeeId: ph03Ids.employee },
    "2026-07-01"
  );
  assert.equal(sodBlocked.selectedAssignees[0].employeeId, ph03Ids.manager);
  assert.equal(sodBlocked.evidence.sodBlockedDelegation, true);

  const committee = services.authorityResolution.resolve(scope, { mechanism: "COMMITTEE", committeeCode: "PH02-DPC-REVENUE" }, "2026-07-01");
  assert.equal(committee.selectedAssignees.length, 2);
  assert.equal(committee.evidence.quorumCount, 2);

  services.authorityResolution.registerAuthorityAssignment({
    id: "a1000000-0000-0000-0000-000000009999",
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    authorityType: "TRANSFER_AUTHORITY",
    authorityCode: "G05_TRANSFER_REVENUE",
    scopeType: "ORG_UNIT",
    scopeOrgUnitId: ph03Ids.orgRevenue,
    authorityEmployeeId: ph03Ids.manager,
    priority: 10,
    effectiveFrom: "2026-01-01",
    status: "ACTIVE",
  });
  assert.throws(
    () =>
      services.authorityResolution.resolve(
        scope,
        { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue },
        "2026-07-01"
      ),
    /Ambiguous statutory authority/
  );
});

test("G12 SR ingest is idempotent, semantically deduplicated, source-reversible, and append-only by API shape", () => {
  const services = createFoundationServices();
  const scope = actor();
  const request = {
    sourceModule: "G01",
    sourceReferenceId: "employees:identity:1",
    sourceEventVersion: 1,
    employeeId: ph03Ids.employee,
    eventTypeCode: "IDENTITY_CHANGE",
    eventDate: "2026-07-01",
    factKey: `EMP:${ph03Ids.employee}|IDENTITY|2026-07-01`,
    payload: { displayName: "Kiran P." },
    documentIds: [],
  };

  const first = services.serviceRegister.ingest(scope, "idem-identity-1", request);
  assert.equal(first.event.sequenceNo, 1);
  assert.equal(first.event.previousHash, "0".repeat(64));

  const replay = services.serviceRegister.ingest(scope, "idem-identity-1", request);
  assert.equal(replay.replayed, true);
  assert.equal(replay.event.id, first.event.id);

  const semantic = services.serviceRegister.ingest(scope, "idem-identity-2", { ...request, sourceReferenceId: "employees:identity:2" });
  assert.equal(semantic.semanticDuplicate, true);
  assert.equal(semantic.event.id, first.event.id);

  assert.throws(
    () => services.serviceRegister.ingest(scope, "idem-identity-1", { ...request, payload: { displayName: "Different" } }),
    /Idempotency key reused/
  );

  const reversal = services.serviceRegister.reverseFromSource(scope, "idem-reversal-1", first.event.id, "Entered in error");
  assert.equal(reversal.event.sequenceNo, 2);
  assert.equal(reversal.event.reversalOfEventId, first.event.id);
  assert.equal(typeof services.serviceRegister.updateEvent, "undefined");
});

test("G13 document vault supports module attachment and legal hold blocks disposal", () => {
  const services = createFoundationServices();
  const scope = actor();
  const document = services.documentVault.createDocument(scope, {
    title: "Transfer order",
    ownerEmployeeId: ph03Ids.employee,
    classification: "CONFIDENTIAL",
    contentHash: "abcd".repeat(16),
  });
  const attached = services.documentVault.attach(scope, document.id, {
    moduleCode: "G05",
    entityName: "transfer_orders",
    entityRefId: "TRF-001",
    linkRole: "ORDER",
  });
  assert.equal(attached.links.length, 1);
  assert.equal(services.documentVault.listByModuleRef(scope, "G05", "TRF-001").length, 1);

  services.documentVault.placeLegalHold(scope, document.id, "Pending inquiry");
  assert.throws(() => services.documentVault.dispose(scope, document.id), /Legal hold or WORM retention blocks disposal/);
});

test("G01 read masking and governed identity change post an SR event with audit evidence", () => {
  const services = createFoundationServices();
  const masked = services.employeeMaster.readProfile(actor({ fieldGrants: [] }), ph03Ids.manager);
  assert.equal(masked.pan, "[HIDDEN]");
  assert.equal(masked.aadhaarMasked, "[HIDDEN]");

  const visible = services.employeeMaster.readProfile(actor({ fieldGrants: ["employee.pan", "employee.aadhaar", "employee.category"] }), ph03Ids.manager);
  assert.equal(visible.pan, "ABCDE1234F");
  assert.equal(visible.aadhaarMasked, "xxxx-xxxx-1234");

  const changed = services.employeeMaster.governedIdentityChange(actor(), {
    employeeId: ph03Ids.employee,
    newDisplayName: "Kiran Patel Updated",
    reason: "Gazette correction",
    idempotencyKey: "idem-g01-change-1",
    effectiveDate: "2026-07-01",
  });
  assert.match(changed.srEventId, /^sr-/);
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 1);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G01_GOVERNED_IDENTITY_CHANGE"));
});

test("synthetic P01 HRMS workflow writes task, action, resolution evidence, audit, and notification", () => {
  const services = createFoundationServices();
  const result = services.workflow.runSyntheticHrmsFlow(actor(), ph03Ids.employee);
  assert.equal(result.instance.status, "RUNNING");
  assert.equal(result.task.resolution.resolverType, "REPORTING_CHAIN");
  assert.equal(result.task.resolution.selectedAssignees[0].employeeId, ph03Ids.manager);
  assert.equal(result.action.action, "APPROVE");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "P01_APPROVE"));
  assert.equal(services.notifications.list(actor()).filter((message) => message.messageId === "WF_APPROVE").length, 1);
});

test("foundation services enforce tenant isolation", () => {
  const services = createFoundationServices();
  const otherTenant = actor({ tenantId: "tenant-other", entityId: "entity-other" });
  assert.equal(services.employeeMaster.getById(otherTenant, ph03Ids.manager), null);
  assert.equal(services.documentVault.get(otherTenant, ph03Ids.documentAadhaar), null);
  assert.equal(services.serviceRegister.count(otherTenant), 0);
});

test("migration staging reconciliation does not mutate production employee records", () => {
  const services = createFoundationServices();
  const scope = actor();
  services.migrationStaging.stageEmployeeIdentity(scope, { serviceNo: "GOV-100245", displayName: "Ananya Rao", sourceSystem: "legacy" });
  services.migrationStaging.stageEmployeeIdentity(scope, { serviceNo: "GOV-404", displayName: "Missing Employee", sourceSystem: "legacy" });
  services.migrationStaging.stageEmployeeIdentity(scope, { serviceNo: "GOV-404", displayName: "Missing Employee Duplicate", sourceSystem: "legacy" });
  const report = services.migrationStaging.reconcileEmployeeIdentity(scope);
  assert.equal(report.totalStaged, 3);
  assert.equal(report.matchedEmployees, 1);
  assert.equal(report.missingEmployees, 2);
  assert.deepEqual(report.duplicateServiceNos, ["GOV-404"]);
  assert.equal(report.productionEmployeeCountBefore, report.productionEmployeeCountAfter);
});

test("PH-03 service registry is protected and error sanitization hides internal failures", () => {
  assert.equal(foundationServiceRegistry.every((entry) => entry.protected && entry.permission.length > 0), true);
  assert.deepEqual(toPublicError(new FoundationError("FORBIDDEN", "Permission denied")).error.code, "FORBIDDEN");
  const publicError = toPublicError(new Error("database stack trace /tmp/secret"));
  assert.equal(publicError.error.code, "INTERNAL");
  assert.equal(publicError.error.message, "Request failed");
});
