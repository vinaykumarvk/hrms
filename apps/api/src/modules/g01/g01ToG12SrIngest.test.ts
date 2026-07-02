// PH-03B G01 -> G12 integration tests: a governed G01 identity event drives a single G12 SR ingest with
// correct provenance. Authored as typed cases so the suite typechecks and compiles with the project build;
// executed under `npm test` via apps/api/test/g01ToG12SrIngest.test.cjs. Black-box across both service
// contracts wired by the public foundation factory (real ph03 seed fixtures).
import { createFoundationServices } from "../../platform/foundationServices";
import { ph03Ids } from "../../seed/ph03Seed";
import { ActorContext } from "../../platform/types";

interface IntegrationCase {
  name: string;
  run: () => void;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertMatch(actual: string, pattern: RegExp, message: string): void {
  if (!pattern.test(actual)) {
    throw new Error(`${message}: "${actual}" did not match ${pattern.toString()}`);
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
    correlationId: "corr-ph03b-g01-g12",
  };
}

export const g01ToG12SrIngestCases: IntegrationCase[] = [
  {
    name: "a governed G01 identity change appends exactly one SR row with G01 provenance",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      assertEqual(services.serviceRegister.count(scope), 0, "ledger empty before the identity event");

      const changed = services.employeeMaster.governedIdentityChange(scope, {
        employeeId: ph03Ids.employee,
        newDisplayName: "Kiran Patel Updated",
        reason: "Gazette correction",
        idempotencyKey: "idem-g01-g12-change-1",
        effectiveDate: "2026-07-01",
      });
      assertMatch(changed.srEventId, /^sr-/, "G01 change returns the driven SR event id");

      const timeline = services.serviceRegister.getTimeline(scope, ph03Ids.employee);
      assertEqual(timeline.length, 1, "exactly one SR row appended by the identity event");

      const event = timeline[0];
      assertEqual(event?.id, changed.srEventId, "timeline row matches the returned SR event id");
      assertEqual(event?.sourceModule, "G01", "provenance: source module is G01");
      assertEqual(event?.employeeId, ph03Ids.employee, "provenance: SR row bound to the subject employee");
      assertEqual(event?.eventTypeCode, "IDENTITY_CHANGE", "provenance: event type is IDENTITY_CHANGE");
      assertEqual(event?.sourceReferenceId, `employees:${ph03Ids.employee}:identity`, "provenance: source reference points back to the G01 record");
      assertEqual(event?.sequenceNo, 1, "SR row takes the first sequence for the employee");
    },
  },
  {
    name: "a governed change is an atomic multi-step write: a reused idempotency key never partially mutates the master",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const input = {
        employeeId: ph03Ids.employee,
        newDisplayName: "Kiran Patel Updated",
        reason: "Gazette correction",
        idempotencyKey: "idem-g01-g12-atomic-1",
        effectiveDate: "2026-07-01",
      };

      services.employeeMaster.governedIdentityChange(scope, input);
      const afterFirst = services.employeeMaster.readProfile(scope, ph03Ids.employee);
      assertEqual(afterFirst.displayName, "Kiran Patel Updated", "first change committed to the master");
      assertEqual(services.serviceRegister.count(scope), 1, "first change appended exactly one SR row");

      // Re-submitting under the same idempotency key is rejected by the ledger. The master mutation must NOT
      // be applied on the rejected path (no bumped row version, no orphaned change without an SR fact).
      assertThrows(
        () => services.employeeMaster.governedIdentityChange(scope, input),
        /Idempotency key reused/,
        "reused idempotency key is rejected"
      );
      const afterConflict = services.employeeMaster.readProfile(scope, ph03Ids.employee);
      assertEqual(afterConflict.rowVersion, afterFirst.rowVersion, "row version unchanged after the rejected retry (no partial write)");
      assertEqual(services.serviceRegister.count(scope), 1, "rejected retry appended no additional SR row");
    },
  },
];
