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
  srPosting: "G01 approved governed change posts to G12 serviceRegister and returns srEvent",
  create: "POST /api/v1/employees creates via employeeMaster.create with PROFILE_CREATED outbox emission (FR-EPM-001)",
  outboxFeed: "GET /api/v1/employees/changes reads the g01 outbox through pageItems cursor pagination",
};

export function registerG01Routes(kernel: ApiKernel): void {
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/changes",
    operationId: "g01.listEmployeeChanges",
    protected: true,
    permission: "g01.employee.change.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok(pageItems(context.services.employeeMaster.listChanges(context.scope), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees",
    operationId: "g01.createEmployee",
    protected: true,
    permission: "g01.employee.create",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const result = context.services.employeeMaster.create(context.actor, {
        firstName: requiredString(body, "firstName"),
        lastName: optionalString(body, "lastName"),
        displayName: optionalString(body, "displayName"),
        orgUnitId: requiredString(body, "orgUnitId"),
        designation: optionalString(body, "designation"),
        dateOfJoining: requiredString(body, "dateOfJoining"),
        serviceNo: optionalString(body, "serviceNo"),
        category: optionalString(body, "category"),
        pan: optionalString(body, "pan"),
        aadhaarMasked: optionalString(body, "aadhaarMasked"),
      });
      return created(result);
    },
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
    handler: (context) => {
      const employeeId = requiredParam(context.params, "id");
      return ok({
        employeeId,
        ...pageItems(context.services.employeeMaster.listGovernedChanges(context.scope, employeeId), context.pagination ?? { limit: 25 }),
      });
    },
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
      const result = context.services.employeeMaster.requestGovernedChange(context.actor, {
        employeeId: requiredParam(context.params, "id"),
        newDisplayName: requiredString(body, "newDisplayName"),
        reason: requiredString(body, "reason"),
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
    handler: (context) => {
      const result = context.services.employeeMaster.approveGovernedChange(context.actor, {
        changeId: requiredParam(context.params, "id"),
        idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
      });
      return accepted(result);
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/governed-changes/{id}:reject",
    operationId: "g01.rejectGovernedChange",
    protected: true,
    permission: "g01.employee.change.reject",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const result = context.services.employeeMaster.rejectGovernedChange(context.actor, {
        changeId: requiredParam(context.params, "id"),
        reason: requiredString(body, "reason"),
      });
      return accepted(result);
    },
  });
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
