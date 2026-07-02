// PH-03C read-only migration staging + reconciliation proof. Black-box tests against the migration
// staging service proving the coexistence guarantee:
//   - staged legacy records load into staging (read-only import, isolated from the system of record),
//   - a reconciliation report is produced (matched / missing / duplicate),
//   - promotion is BLOCKED on each reconciliation mismatch and NEVER writes the system of record,
//   - only a CLEAN reconciliation permits promotion, and even then the production employee master
//     count is unchanged (staging is not a back-door writer into the SoR).
// Authored as typed cases so the suite typechecks and compiles with the project build; executed under
// `npm test` via apps/api/test/migrationStagingReconciliation.test.cjs.
import { MigrationStagingService } from "./migrationStagingService";
import { EmployeeMasterService, EmployeeRecord } from "../../modules/g01/employeeMasterService";
import { ServiceRegisterService } from "../../modules/g12/serviceRegisterService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { TenantScope } from "../../platform/types";

interface StagingCase {
  name: string;
  run: () => void;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

const tenant = "tenant-mig-0000-0000-000000000001";
const entity = "entity-mig-0000-0000-000000000001";
const scope: TenantScope = { tenantId: tenant, entityId: entity };

function productionEmployee(serviceNo: string, id: string): EmployeeRecord {
  return {
    id,
    tenantId: tenant,
    entityId: entity,
    serviceNo,
    displayName: `Prod ${serviceNo}`,
    firstName: "Prod",
    employmentStatus: "ACTIVE",
    orgUnitId: "org-mig-1",
    rowVersion: 1,
  };
}

// System of record: two production employees already exist. Migration staging must never grow or
// shrink this master set — that is the read-only guarantee under test.
function stagingService(): { staging: MigrationStagingService; employees: EmployeeMasterService } {
  const audit = new AuditService();
  const employees = new EmployeeMasterService(
    [productionEmployee("GOV-1", "emp-mig-1"), productionEmployee("GOV-2", "emp-mig-2")],
    new AuthorizationService(),
    audit,
    new ServiceRegisterService(audit)
  );
  return { staging: new MigrationStagingService(employees), employees };
}

export const migrationStagingReconciliationCases: StagingCase[] = [
  {
    name: "staged legacy records load into staging without touching the system of record",
    run: () => {
      const { staging, employees } = stagingService();
      const before = employees.count(scope);
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One", sourceSystem: "legacy" });
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-2", displayName: "Legacy Two", sourceSystem: "legacy" });
      const staged = staging.listStaged(scope);
      assertEqual(staged.length, 2, "both legacy records land in staging");
      assertEqual(staged.every((row) => row.status === "STAGED"), true, "staged rows start in STAGED status");
      assertEqual(employees.count(scope), before, "staging import does not write the system of record");
    },
  },
  {
    name: "reconciliation report classifies matched / missing / duplicate legacy identities",
    run: () => {
      const { staging } = stagingService();
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One", sourceSystem: "legacy" });
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-404", displayName: "Legacy Missing", sourceSystem: "legacy" });
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-404", displayName: "Legacy Missing Dup", sourceSystem: "legacy" });
      const report = staging.reconcileEmployeeIdentity(scope);
      assertEqual(report.totalStaged, 3, "all staged rows reconciled");
      assertEqual(report.matchedEmployees, 1, "one legacy identity matches production");
      assertEqual(report.missingEmployees, 2, "two legacy identities are missing from production");
      assertDeepEqual(report.duplicateServiceNos, ["GOV-404"], "duplicate service number flagged");
      assertEqual(report.reconciled, false, "report is not reconciled while mismatches exist");
      assertEqual(report.productionEmployeeCountBefore, report.productionEmployeeCountAfter, "reconcile is read-only");
    },
  },
  {
    name: "promotion is BLOCKED on a reconciliation mismatch and does NOT write the system of record",
    run: () => {
      const { staging, employees } = stagingService();
      const before = employees.count(scope);
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One", sourceSystem: "legacy" });
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-404", displayName: "Legacy Missing", sourceSystem: "legacy" });
      assertThrows(
        () => staging.promote(scope),
        /promotion blocked/i,
        "promotion blocked while reconciliation shows a missing legacy identity"
      );
      assertEqual(employees.count(scope), before, "blocked promotion left the system of record untouched");
      assertEqual(
        staging.listStaged(scope).every((row) => row.status === "STAGED"),
        true,
        "blocked promotion did not promote a staged row"
      );
    },
  },
  {
    name: "a duplicate-only mismatch also BLOCKS promotion (fail-closed on each reconciliation defect)",
    run: () => {
      const { staging, employees } = stagingService();
      const before = employees.count(scope);
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One", sourceSystem: "legacy" });
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One Dup", sourceSystem: "legacy" });
      assertThrows(() => staging.promote(scope), /promotion blocked/i, "duplicate service number blocks promotion");
      assertEqual(employees.count(scope), before, "blocked promotion left the system of record untouched");
    },
  },
  {
    name: "only a CLEAN reconciliation permits promotion, and promotion still does not grow the system of record",
    run: () => {
      const { staging, employees } = stagingService();
      const before = employees.count(scope);
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One", sourceSystem: "legacy" });
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-2", displayName: "Legacy Two", sourceSystem: "legacy" });
      const result = staging.promote(scope);
      assertEqual(result.report.reconciled, true, "clean reconciliation permits promotion");
      assertEqual(result.promoted, 2, "both matched legacy identities are promoted");
      assertEqual(
        staging.listStaged(scope).every((row) => row.status === "PROMOTED"),
        true,
        "staged rows are marked PROMOTED after a clean promotion",
      );
      assertEqual(employees.count(scope), before, "even a clean promotion does not insert into the system of record");
    },
  },
  {
    name: "cross-tenant staging cannot reconcile or leak another tenant's staged rows",
    run: () => {
      const { staging } = stagingService();
      staging.stageEmployeeIdentity(scope, { serviceNo: "GOV-1", displayName: "Legacy One", sourceSystem: "legacy" });
      const otherTenant: TenantScope = { tenantId: "tenant-other", entityId: "entity-other" };
      assert(staging.listStaged(otherTenant).length === 0, "other tenant sees no staged rows");
      const report = staging.reconcileEmployeeIdentity(otherTenant);
      assertEqual(report.totalStaged, 0, "other tenant reconciles an empty staging set");
    },
  },
];
