const test = require("node:test");
const assert = require("node:assert/strict");

const { PgLeaveSrRelayRepository } = require("../../../dist/apps/api/src");

// Verifies the DB-backed signed outbox (PgLeaveSrRelayRepository.insertOutboxEvent) issues the
// correct parameterised INSERT — HMAC payload_signature, leave_spell_lineage_id, event_sequence,
// JSON payload, dedupe_key — bound at the right positions, WITHOUT a live Postgres (stub pool).
// This is real evidence the CC-001 signed/lineaged/sequenced outbox is correct at the SQL layer,
// not merely that the class exists. The Pg* repos are async and are not wired into the synchronous
// service layer (see production-readiness-final-report §1), so they are verified directly here.

function makeStubPool(capture) {
  return {
    query: async (sql, params) => {
      capture.sql = sql;
      capture.params = params;
      // Echo the bound params back as the RETURNING row (shaped like LeaveEventOutboxRow).
      return {
        rows: [
          {
            id: "outbox-stub-001",
            tenant_id: params[0],
            entity_id: params[1],
            correlation_id: params[2],
            leave_spell_lineage_id: params[3],
            event_sequence: params[4],
            employee_id: params[5],
            partition_key: params[6],
            event_type: params[8],
            payload: params[13],
            payload_signature: params[14],
            status: "PENDING",
            available_at: new Date(),
            attempt_count: 0,
          },
        ],
      };
    },
  };
}

test("PgLeaveSrRelayRepository.insertOutboxEvent: issues the signed/lineaged/sequenced INSERT with correct parameter binding", async () => {
  const capture = {};
  const repo = new PgLeaveSrRelayRepository(makeStubPool(capture));
  const row = await repo.insertOutboxEvent({
    tenantId: "t1",
    entityId: "e1",
    correlationId: "c1",
    leaveSpellLineageId: "lineage-7",
    eventSequence: 3,
    employeeId: "emp-1",
    leaveLedgerEntryId: "ledger-9",
    eventType: "LEAVE_APPROVED",
    leaveTypeCode: "EL",
    spellStart: "2026-07-01",
    spellEnd: "2026-07-03",
    daysCount: 3,
    payload: { leaveType: "EL", days: 3 },
    payloadSignature: "hmac-signature-abc",
    dedupeKey: "dedupe-1",
    availableAt: "2026-07-14T00:00:00Z",
  });

  // SQL targets the leave_event_outbox table and names the signature column.
  assert.match(capture.sql, /INSERT INTO leave_event_outbox/);
  assert.match(capture.sql, /payload_signature/);
  // SQL is parameterised ($N placeholders) — no string-interpolated values.
  assert.ok(capture.params.length === 17, "all 17 columns are parameter-bound");
  assert.equal(typeof capture.sql, "string");
  assert.ok(!/\$\{.*\}/.test(capture.sql), "no template interpolation in SQL");

  // Parameter binding positions (params are 0-indexed; $1..$17):
  //   $4 lineage, $5 sequence, $7 partition_key(=employeeId), $14 payload(JSON), $15 signature, $16 dedupe.
  assert.equal(capture.params[3], "lineage-7", "leave_spell_lineage_id bound at $4");
  assert.equal(capture.params[4], 3, "event_sequence bound at $5");
  assert.equal(capture.params[6], "emp-1", "partition_key bound at $7");
  assert.equal(capture.params[13], JSON.stringify({ leaveType: "EL", days: 3 }), "payload JSON-stringified at $14");
  assert.equal(capture.params[14], "hmac-signature-abc", "HMAC payload_signature bound at $15");
  assert.equal(capture.params[15], "dedupe-1", "dedupe_key bound at $16");

  // The RETURNING row carries signature + lineage + sequence through to the caller.
  assert.equal(row.payload_signature, "hmac-signature-abc");
  assert.equal(row.leave_spell_lineage_id, "lineage-7");
  assert.equal(row.event_sequence, 3);
});
