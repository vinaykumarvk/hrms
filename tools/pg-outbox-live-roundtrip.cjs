// Live Postgres round-trip for PgLeaveSrRelayRepository — the headline CC-001 signed outbox —
// against the reconciled (text-ID) hrms DB. Seeds the FK parents, inserts a real outbox event
// through the repository, reads it back, and cleans up. Proves the production DB layer now works
// end-to-end (not just stub-pool parameter order).
const { Pool } = require("pg");
const { PgLeaveSrRelayRepository } = require("../dist/apps/api/src/modules/g04/leaveSrRelayRepository");

const url = process.env.HRMS_DATABASE_URL;
if (!url) {
  console.error("HRMS_DATABASE_URL required");
  process.exit(2);
}
const pool = new Pool({ connectionString: url });

(async () => {
  // 1. seed the outbox's FK parents (tenant, entity, employee) with text ids
  await pool.query("INSERT INTO tenants (id, tenant_code, legal_name, display_name) VALUES ('t1','TC1','Test Tenant','Test Tenant') ON CONFLICT (id) DO NOTHING");
  await pool.query("INSERT INTO entities (id, tenant_id, entity_code, legal_name, display_name) VALUES ('e1','t1','EC1','Test Entity','Test Entity') ON CONFLICT (id) DO NOTHING");
  await pool.query("INSERT INTO employees (id, tenant_id, service_no, first_name, display_name, dob, date_of_joining) VALUES ('emp-1','t1','GOV-RT-1','Test','Test Emp','1990-01-01','2020-01-01') ON CONFLICT (id) DO NOTHING");

  // 2. insert a signed outbox event through the repository
  const repo = new PgLeaveSrRelayRepository(pool);
  const row = await repo.insertOutboxEvent({
    tenantId: "t1",
    entityId: "e1",
    correlationId: "corr-1",
    leaveSpellLineageId: "lin-1",
    eventSequence: 1,
    employeeId: "emp-1",
    leaveLedgerEntryId: "led-1",
    eventType: "LEAVE_APPROVED",
    leaveTypeCode: "EL",
    spellStart: "2026-07-01",
    spellEnd: "2026-07-03",
    daysCount: 3,
    payload: { leaveType: "EL", days: 3 },
    payloadSignature: "hmac-sig-abc",
    dedupeKey: "dedupe-1",
    availableAt: "2026-07-14T00:00:00Z",
  });
  console.log("INSERTED id=" + row.id + " status=" + row.status + " signature=" + row.payload_signature);

  // 3. read it back
  const sel = await pool.query(
    "SELECT event_sequence, payload_signature, status, leave_spell_lineage_id, event_type FROM leave_event_outbox WHERE tenant_id=$1",
    ["t1"]
  );
  const back = sel.rows[0];
  console.log("READ BACK seq=" + back.event_sequence + " sig=" + back.payload_signature + " status=" + back.status + " lineage=" + back.leave_spell_lineage_id + " type=" + back.event_type);
  if (back.payload_signature !== "hmac-sig-abc" || back.event_sequence !== 1 || back.status !== "PENDING") {
    throw new Error("round-trip data mismatch");
  }
  console.log("ROUND-TRIP OK: signed outbox persists + reads back against live Postgres");

  // 4. cleanup
  await pool.query("DELETE FROM leave_event_outbox WHERE tenant_id='t1'");
  await pool.query("DELETE FROM employees WHERE id='emp-1'");
  await pool.query("DELETE FROM entities WHERE id='e1'");
  await pool.query("DELETE FROM tenants WHERE id='t1'");
  await pool.end();
})().catch((err) => {
  console.error("ROUND-TRIP FAILED:", err.message);
  process.exit(1);
});
