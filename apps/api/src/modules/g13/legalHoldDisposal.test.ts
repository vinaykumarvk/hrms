// PH-03B G13 legal-hold / disposal unit tests. Authored as typed cases so the suite typechecks and compiles
// with the project build; executed under `npm test` via apps/api/test/legalHoldDisposal.test.cjs. Black-box
// against the DocumentVaultService contract from the public foundation factory (real ph03 seed fixtures).
import { createFoundationServices } from "../../platform/foundationServices";
import { ph03Ids } from "../../seed/ph03Seed";
import { ActorContext } from "../../platform/types";

interface HoldCase {
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
    userId: "user-records-officer",
    actorUserId: "user-records-officer",
    permissions: ["*"],
    roles: ["records_officer"],
    fieldGrants: [],
    correlationId: "corr-ph03b-hold",
  };
}

export const legalHoldDisposalCases: HoldCase[] = [
  {
    name: "a document under legal hold blocks disposal / retention-delete and is retained intact",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const document = services.documentVault.createDocument(scope, {
        title: "Charge memorandum",
        ownerEmployeeId: ph03Ids.employee,
        classification: "CONFIDENTIAL",
        contentHash: "1111".repeat(16),
      });

      const held = services.documentVault.placeLegalHold(scope, document.id, "Pending departmental inquiry");
      assertEqual(held.legalHold, true, "legal hold recorded on the document");

      assertThrows(
        () => services.documentVault.dispose(scope, document.id),
        /Legal hold or WORM retention blocks disposal/,
        "disposal blocked while a legal hold is in force"
      );

      // Retention-delete must NOT have removed or disposed the document — it is retained intact.
      const after = services.documentVault.get(scope, document.id);
      assertEqual(after === null, false, "document still present after blocked disposal");
      assertEqual(after?.status, "ACTIVE", "document status unchanged (not DISPOSED) under hold");
      assertEqual(after?.legalHold, true, "legal hold remains in force");
    },
  },
  {
    name: "disposal proceeds only when no legal hold or WORM retention applies",
    run: () => {
      const services = createFoundationServices();
      const scope = actor();
      const document = services.documentVault.createDocument(scope, {
        title: "Routine acknowledgement",
        ownerEmployeeId: ph03Ids.employee,
        classification: "INTERNAL",
        contentHash: "2222".repeat(16),
      });

      const disposed = services.documentVault.dispose(scope, document.id);
      assertEqual(disposed.status, "DISPOSED", "unheld document can be disposed");
    },
  },
];
