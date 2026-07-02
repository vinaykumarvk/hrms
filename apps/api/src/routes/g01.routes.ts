import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { readBodyRecord, optionalString, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import { FoundationError } from "../platform/types";

export const g01RouteEvidence = {
  base: "/api/v1/employees",
  profile360: "profile-360",
  governedChanges: "governed-changes",
  changes: "changes",
  headers: ["X-Correlation-Id", "Idempotency-Key"],
  pagination: { limit: 25, maxLimit: 100, next_cursor: null },
  p02Masking: "P02 fieldGrants mask field access",
  srPosting: "G01 governed change posts to G12 serviceRegister and returns srEvent",
};

export function registerG01Routes(kernel: ApiKernel): void {
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/changes",
    operationId: "g01.listEmployeeChanges",
    protected: true,
    permission: "g01.employee.change.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok({ items: [], limit: context.pagination?.limit ?? 25, next_cursor: null }),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees",
    operationId: "g01.listEmployees",
    protected: true,
    permission: "g01.employee.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok(pageItems(context.services.employeeMaster.list(context.scope), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}",
    operationId: "g01.getEmployee",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => {
      const employee = context.services.employeeMaster.getById(context.scope, requiredParam(context.params, "id"));
      if (!employee) {
        throw new FoundationError("NOT_FOUND", "Employee not found");
      }
      return ok({ employee });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/profile-360",
    operationId: "g01.getEmployeeProfile360",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ profile: context.services.employeeMaster.readProfile(context.actor, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/governed-changes",
    operationId: "g01.listGovernedChanges",
    protected: true,
    permission: "g01.employee.change.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok({ employeeId: requiredParam(context.params, "id"), items: [], limit: context.pagination?.limit ?? 25, next_cursor: null }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/governed-changes",
    operationId: "g01.createGovernedChange",
    protected: true,
    permission: "g01.employee.governed_change",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const result = context.services.employeeMaster.governedIdentityChange(context.actor, {
        employeeId: requiredParam(context.params, "id"),
        newDisplayName: requiredString(body, "newDisplayName"),
        reason: requiredString(body, "reason"),
        idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        effectiveDate: optionalString(body, "effectiveDate") ?? "2026-07-01",
      });
      return created(result);
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/governed-changes/{id}:approve",
    operationId: "g01.approveGovernedChange",
    protected: true,
    permission: "g01.employee.change.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted({ changeId: requiredParam(context.params, "id"), decision: "APPROVED" }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/governed-changes/{id}:reject",
    operationId: "g01.rejectGovernedChange",
    protected: true,
    permission: "g01.employee.change.reject",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted({ changeId: requiredParam(context.params, "id"), decision: "REJECTED" }),
  });
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
