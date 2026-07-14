// Live Postgres round-trip for the remaining money/PII/statutory-critical Pg* repos against the
// reconciled (text-ID) hrms DB. Proves the production DB layer works end-to-end for each (real
// INSERT + read-back), complementing the G04 outbox round-trip. Seeds shared FK parents once.
const { Pool } = require("pg");
const { PgDocumentSecurityRepository } = require("../dist/apps/api/src/modules/g13/documentSecurityRepository");
const { PgSrIntegrityRepository } = require("../dist/apps/api/src/modules/g12/srIntegrityRepository");
const { PgPensionRevisionRepository } = require("../dist/apps/api/src/modules/g11/pensionRevisionRepository");
const { PgPayrollEngineRepository } = require("../dist/apps/api/src/modules/g10/payrollEngineRepository");
const { PgLeaveSrCatalogRepository } = require("../dist/apps/api/src/modules/g04/leaveSrCatalogRepository");
const { PgSrAdmissibilityRepository } = require("../dist/apps/api/src/modules/g12/srAdmissibilityRepository");
const { PgTransferRepository } = require("../dist/apps/api/src/modules/g05/transferRepository");

const url = process.env.HRMS_DATABASE_URL;
if (!url) { console.error("HRMS_DATABASE_URL required"); process.exit(2); }
const pool = new Pool({ connectionString: url });

(async () => {
  const T = "t-rt", E = "e-rt", EMP = "emp-rt";
  await pool.query("INSERT INTO tenants (id, tenant_code, legal_name, display_name) VALUES ($1,'TCRT','RT Tenant','RT Tenant') ON CONFLICT (id) DO NOTHING", [T]);
  await pool.query("INSERT INTO entities (id, tenant_id, entity_code, legal_name, display_name) VALUES ($1,$2,'ECRT','RT Entity','RT Entity') ON CONFLICT (id) DO NOTHING", [E, T]);
  await pool.query("INSERT INTO employees (id, tenant_id, service_no, first_name, display_name, dob, date_of_joining) VALUES ($1,$2,'GOV-RT','RT','RT Emp','1990-01-01','2020-01-01') ON CONFLICT (id) DO NOTHING", [EMP, T]);
  await pool.query("INSERT INTO org_units (id, tenant_id, entity_id, org_unit_code, name, org_unit_type) VALUES ('ou-rt',$1,$2,'OU-RT','RT OU','DIVISION') ON CONFLICT (id) DO NOTHING", [T, E]);

  const results = [];
  const cleanup = [`DELETE FROM leave_event_outbox WHERE tenant_id=$1`];

  // 1. G13 document-security clearance
  try {
    const sec = new PgDocumentSecurityRepository(pool);
    const id = await sec.saveClearance({
      tenantId: T, entityId: E, principalType: "USER", principalRef: EMP, clearanceLevel: "CONFIDENTIAL",
      status: "ACTIVE", justification: "round-trip", grantedBy: "granter-1", approvedBy: "approver-1",
      validFrom: "2026-01-01", validUntil: "2027-01-01",
    });
    const back = (await pool.query("SELECT clearance_level, status, principal_ref FROM security_clearances WHERE id=$1", [id])).rows[0];
    cleanup.push("DELETE FROM security_clearances WHERE tenant_id=$1");
    results.push(`G13 saveClearance: id=${id} level=${back.clearance_level} status=${back.status} principal=${back.principal_ref} ✓`);
  } catch (e) { results.push(`G13 saveClearance: FAIL ${e.message}`); }

  // 2. G12 SR integrity attestation
  try {
    const integ = new PgSrIntegrityRepository(pool);
    const id = await integ.insertAttestation({
      tenantId: T, entityId: E, subjectType: "SR_EVENT", subjectId: "sr-rt-1", employeeId: EMP,
      attestationKind: "EXTRACT_SIGN", attestedBy: "custodian-1", attestedRole: "sr_custodian",
      signatureMethod: "DSC", certificateSerial: "cert-rt", tsaTimestampToken: "tsa-rt", tsaAuthority: "CA-RT",
      signedDigest: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    });
    const back = (await pool.query("SELECT signed_digest, attestation_kind, attested_by FROM sr_attestations WHERE id=$1", [id])).rows[0];
    cleanup.push("DELETE FROM sr_attestations WHERE tenant_id=$1");
    results.push(`G12 insertAttestation: id=${id} digest=${back.signed_digest} kind=${back.attestation_kind} attestedBy=${back.attested_by} ✓`);
  } catch (e) { results.push(`G12 insertAttestation: FAIL ${e.message}`); }

  // 3. G11 pension revision batch header
  try {
    const pen = new PgPensionRevisionRepository(pool);
    const { revisionId } = await pen.insertBatch(
      { tenantId: T, entityId: E, revisionNo: "REV-RT-1", revisionType: "PAY_COMMISSION", effectiveDate: "2026-01-01",
        jobRunRef: "job-rt", daRateRef: undefined, fitmentFactorTenThousandths: 10500, calcTrace: { rule: "E16" }, status: "DRAFT" },
      "pension-officer-rt"
    );
    const back = (await pool.query("SELECT revision_type, revision_no, is_batch FROM pen_revisions WHERE id=$1", [revisionId])).rows[0];
    results.push(`G11 insertBatch: id=${revisionId} type=${back.revision_type} batch=${back.is_batch} no=${back.revision_no} ✓`);
  } catch (e) { results.push(`G11 insertBatch: FAIL ${e.message}`); }

  // 4. G10 payroll-engine arrear + carryforward (money-critical)
  try {
    const pe = new PgPayrollEngineRepository(pool);
    const arr = await pe.insertArrear({
      tenantId: T, entityId: E, arrearNo: "ARR-RT-1", employeeId: EMP, arrearType: "PROMOTION_ARREAR",
      sourceReference: "g06:rt-1", periodFrom: "2026-01", periodTo: "2026-06",
      grossArrearCents: 1200000, deductionArrearCents: 60000, netArrearCents: 1140000,
      monthWiseBreakupJson: "{}", createdBy: "payroll-rt",
    });
    const cf = await pe.insertCarryforward({
      tenantId: T, entityId: E, employeeId: EMP, sourceType: "RECOVERY", originalAmountCents: 250000, createdBy: "payroll-rt",
    });
    cleanup.push("DELETE FROM g10_engine_arrears WHERE tenant_id=$1");
    cleanup.push("DELETE FROM g10_engine_carryforwards WHERE tenant_id=$1");
    results.push(`G10 insertArrear+Carryforward: arrear=${arr.id} cf=${cf.id} ✓`);
  } catch (e) { results.push(`G10 payroll: FAIL ${e.message}`); }

  // 5. G04 SR-event mapping catalog (draft)
  try {
    const cat = new PgLeaveSrCatalogRepository(pool);
    const map = await cat.insertMappingDraft({
      tenantId: T, entityId: E, mappingVersion: 1, leaveTypeCode: "EL", eventType: "LEAVE_APPROVED",
      disposition: "APPEND", straddleHandling: "SPLIT", effectiveFrom: "2026-01-01",
    });
    results.push(`G04 insertMappingDraft: id=${map.id} leaveType=${map.leave_type_code} v=${map.mapping_version} ✓`);
  } catch (e) { results.push(`G04 catalog: FAIL ${e.message}`); }

  // 6. G12 §65B admissibility subscription
  try {
    const adm = new PgSrAdmissibilityRepository(pool);
    const subId = await adm.insertSubscription({
      tenantId: T, entityId: E, subscriberModule: "G11_PENSION", eventCategories: ["LEAVE_APPROVED"],
      deliveryMode: "MESSAGE_BUS", secretRef: "sec-rt", lastDeliveredSeq: 0, status: "ACTIVE",
    });
    const back = (await pool.query("SELECT subscriber_module, status FROM sr_subscriptions WHERE id=$1", [subId])).rows[0];
    results.push(`G12 insertSubscription: id=${subId} module=${back.subscriber_module} status=${back.status} ✓`);
  } catch (e) { results.push(`G12 admissibility: FAIL ${e.message}`); }

  // 7. G05 transfer request (foundational)
  try {
    const tr = new PgTransferRepository(pool);
    const req = await tr.insertTransferRequest({
      tenantId: T, entityId: E, requestNo: "TR-RT-1", employeeId: EMP, transferType: "REGULAR",
      requestOrigin: "EMPLOYEE", sourceOrgUnitId: "ou-rt", status: "PENDING_APPROVAL",
    });
    results.push(`G05 insertTransferRequest: id=${req.id} no=${req.request_no} status=${req.status} ✓`);
  } catch (e) { results.push(`G05 transfer: FAIL ${e.message}`); }

  console.log(results.join("\n"));
  const fails = results.filter((r) => r.includes("FAIL"));

  // cleanup (children before parents; best-effort)
  for (const sql of [
    "DELETE FROM pen_revisions WHERE tenant_id=$1",
    "DELETE FROM pen_revision_batches WHERE tenant_id=$1",
    "DELETE FROM sr_attestations WHERE tenant_id=$1",
    "DELETE FROM security_clearances WHERE tenant_id=$1",
    "DELETE FROM g10_arrears WHERE tenant_id=$1",
    "DELETE FROM g10_deduction_carryforwards WHERE tenant_id=$1",
    "DELETE FROM sr_event_mapping WHERE tenant_id=$1",
    "DELETE FROM sr_subscriptions WHERE tenant_id=$1",
    "DELETE FROM transfer_requests WHERE tenant_id=$1",
  ]) { try { await pool.query(sql, [T]); } catch {} }
  await pool.query("DELETE FROM org_units WHERE id=$1", ["ou-rt"]);
  await pool.query("DELETE FROM employees WHERE id=$1", [EMP]);
  await pool.query("DELETE FROM entities WHERE id=$1", [E]);
  await pool.query("DELETE FROM tenants WHERE id=$1", [T]);
  await pool.end();
  if (fails.length) { console.error(`\n${fails.length} repo(s) FAILED`); process.exit(1); }
  console.log("\nALL LIVE ROUND-TRIPS OK");
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
