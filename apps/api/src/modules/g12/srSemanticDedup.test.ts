// PH-03B G12 SR semantic-dedup unit tests. Authored as typed cases so the suite typechecks and compiles
// with the project build; executed under `npm test` via apps/api/test/srSemanticDedup.test.cjs, which requires
// the compiled module and wraps each case in node:test. Black-box against the ServiceRegisterService contract
// obtained from the public foundation factory (real ph03 seed fixtures).
import { createFoundationServices } from "../../platform/foundationServices";
import { ph03Ids } from "../../seed/ph03Seed";
import { ActorContext } from "../../platform/types";
import { SrIngestRequest } from "./serviceRegisterService";

interface DedupCase {
  name: string;
  run: () => void;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  try {
    fn();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!pattern.test(text)) {
      throw new Error(`${message}: thrown "${text}" did not match ${pattern.toString()}`);
    }
    return;
  }
  throw new Error(`${message}: expected a throw matching ${pattern.toString()}`);
}

function actor(): ActorContext {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-hr-admin",
    actorUserId: "user-hr-admin",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph03b-dedup",
  };
}

function baseFact(): SrIngestRequest {
  return {
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
}

export const srSemanticDedupCases: DedupCase[] = [
  {
    name: "posting the same real fact twice is idempotent: exactly one ledger row is appended",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const fact = baseFact();

      const first = services.serviceRegister.ingest(scope, "idem-dedup-1", fact);
      assertEqual(first.replayed, false, "first post is not a replay");
      assertEqual(first.semanticDuplicate, false, "first post is not a semantic duplicate");
      assertEqual(first.event.sequenceNo, 1, "first event takes sequence 1");
      assertEqual(services.serviceRegister.count(scope), 1, "one ledger row after first post");

      // Same idempotency key + identical payload -> replay of the SAME row, not a second append.
      const replay = services.serviceRegister.ingest(scope, "idem-dedup-1", fact);
      assertEqual(replay.replayed, true, "identical idempotency-key replay flagged");
      assertEqual(replay.event.id, first.event.id, "replay returns the original event id");
      assertEqual(services.serviceRegister.count(scope), 1, "replay appends no new row");
    },
  },
  {
    name: "dedup tuple (source_module + source_reference_id + version) collapses to one ledger row",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const fact = baseFact();

      const first = services.serviceRegister.ingest(scope, "idem-dedup-tuple-a", fact);
      // Different idempotency key, but the same source dedup tuple -> semantic duplicate, no new append.
      const again = services.serviceRegister.ingest(scope, "idem-dedup-tuple-b", fact);
      assertEqual(again.semanticDuplicate, true, "same dedup tuple flagged as semantic duplicate");
      assertEqual(again.event.id, first.event.id, "dedup tuple returns the original event id");
      assertEqual(services.serviceRegister.count(scope), 1, "dedup tuple appends no new row");
    },
  },
  {
    name: "fact_key enforces semantic dedup across differing source references",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const fact = baseFact();

      const first = services.serviceRegister.ingest(scope, "idem-factkey-a", fact);
      // A different source reference but the SAME fact_key/employee/event-type is the same real fact.
      const semantic = services.serviceRegister.ingest(scope, "idem-factkey-b", {
        ...fact,
        sourceReferenceId: "employees:identity:2",
      });
      assertEqual(semantic.semanticDuplicate, true, "matching fact_key flagged as semantic duplicate");
      assertEqual(semantic.event.id, first.event.id, "fact_key dedup returns the original event id");
      assertEqual(services.serviceRegister.count(scope), 1, "fact_key dedup appends no new row");
    },
  },
  {
    name: "idempotency-key reuse with a divergent payload is rejected (never silently overwrites the ledger)",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const fact = baseFact();

      services.serviceRegister.ingest(scope, "idem-conflict-1", fact);
      assertThrows(
        () => services.serviceRegister.ingest(scope, "idem-conflict-1", { ...fact, payload: { displayName: "Different" } }),
        /Idempotency key reused/,
        "conflicting payload under a reused key is rejected"
      );
      assertEqual(services.serviceRegister.count(scope), 1, "rejected conflict appends no new row");
    },
  },
  {
    name: "append-only: reversal supersedes-not-deletes and the ledger exposes no update/delete mutators",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const first = services.serviceRegister.ingest(scope, "idem-append-1", baseFact());

      const reversal = services.serviceRegister.reverseFromSource(scope, "idem-append-reversal-1", first.event.id, "Entered in error");
      assertEqual(reversal.event.sequenceNo, 2, "reversal appends a new sequence rather than editing in place");
      assertEqual(reversal.event.reversalOfEventId, first.event.id, "reversal references the original event");
      assertEqual(services.serviceRegister.count(scope), 2, "reversal is an append, so the ledger grows");

      // The original event is still present and unchanged in the timeline (supersede, never delete).
      const timeline = services.serviceRegister.getTimeline(scope, ph03Ids.employee);
      assertEqual(timeline.length, 2, "both the original and the reversal remain in the timeline");
      assertEqual(timeline[0]?.id, first.event.id, "original event is retained");

      const asRecord = services.serviceRegister as unknown as Record<string, unknown>;
      assertEqual(typeof asRecord.updateEvent, "undefined", "no updateEvent mutator on the ledger");
      assertEqual(typeof asRecord.deleteEvent, "undefined", "no deleteEvent mutator on the ledger");
    },
  },
];
