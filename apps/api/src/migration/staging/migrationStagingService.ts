import { EmployeeMasterService } from "../../modules/g01/employeeMasterService";
import { FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

export interface StagedEmployeeIdentity {
  id: string;
  tenantId: string;
  serviceNo: string;
  displayName: string;
  sourceSystem: string;
  status: "STAGED" | "PROMOTED";
}

export interface MigrationReconciliationReport {
  totalStaged: number;
  matchedEmployees: number;
  missingEmployees: number;
  duplicateServiceNos: string[];
  productionEmployeeCountBefore: number;
  productionEmployeeCountAfter: number;
  reconciled: boolean;
}

export interface MigrationPromotionResult {
  promoted: number;
  report: MigrationReconciliationReport;
}

export class MigrationStagingService {
  private readonly stagedEmployees: StagedEmployeeIdentity[] = [];

  constructor(private readonly employees: EmployeeMasterService) {}

  stageEmployeeIdentity(
    scope: TenantScope,
    input: Omit<StagedEmployeeIdentity, "id" | "tenantId" | "status">
  ): StagedEmployeeIdentity {
    requireTenantScope(scope);
    const row: StagedEmployeeIdentity = {
      id: nextId("staged-employee", this.stagedEmployees.length),
      tenantId: scope.tenantId,
      status: "STAGED",
      ...input,
    };
    this.stagedEmployees.push(row);
    return { ...row };
  }

  listStaged(scope: TenantScope): StagedEmployeeIdentity[] {
    requireTenantScope(scope);
    return this.stagedEmployees.filter((row) => row.tenantId === scope.tenantId).map((row) => ({ ...row }));
  }

  reconcileEmployeeIdentity(scope: TenantScope): MigrationReconciliationReport {
    requireTenantScope(scope);
    const productionBefore = this.employees.count(scope);
    const staged = this.stagedEmployees.filter((row) => row.tenantId === scope.tenantId);
    const serviceNoCounts = new Map<string, number>();
    for (const row of staged) {
      serviceNoCounts.set(row.serviceNo, (serviceNoCounts.get(row.serviceNo) ?? 0) + 1);
    }
    const duplicateServiceNos = [...serviceNoCounts.entries()].filter((entry) => entry[1] > 1).map((entry) => entry[0]);
    const matchedEmployees = staged.filter((row) => this.employees.getByServiceNo(scope, row.serviceNo)).length;
    const productionAfter = this.employees.count(scope);
    const missingEmployees = staged.length - matchedEmployees;
    return {
      totalStaged: staged.length,
      matchedEmployees,
      missingEmployees,
      duplicateServiceNos,
      productionEmployeeCountBefore: productionBefore,
      productionEmployeeCountAfter: productionAfter,
      reconciled: missingEmployees === 0 && duplicateServiceNos.length === 0,
    };
  }

  // Read-only-until-reconciled promotion gate. Promotion is the ONLY path by which staged legacy
  // identities may be confirmed against the system of record, and it is BLOCKED unless reconciliation
  // is clean (no missing employees, no duplicate service numbers). The staging service holds no write
  // handle into the employee master, so a blocked promotion cannot mutate production either partially
  // or fully — production counts are identical before and after a blocked call.
  promote(scope: TenantScope): MigrationPromotionResult {
    requireTenantScope(scope);
    const report = this.reconcileEmployeeIdentity(scope);
    if (!report.reconciled) {
      throw new FoundationError(
        "PRECONDITION_FAILED",
        "Migration promotion blocked: unresolved reconciliation mismatch must be cleared before promotion",
        { details: { missingEmployees: report.missingEmployees, duplicateServiceNos: report.duplicateServiceNos } }
      );
    }
    let promoted = 0;
    for (const row of this.stagedEmployees) {
      if (row.tenantId === scope.tenantId && row.status === "STAGED") {
        row.status = "PROMOTED";
        promoted += 1;
      }
    }
    return { promoted, report };
  }
}
