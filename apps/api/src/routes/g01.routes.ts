import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { readBodyRecord, optionalBoolean, optionalNumber, optionalString, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import type { AddressType, ContactType, DependentRelationship, EmployeeContact } from "../modules/g01/employeeMasterService";
import { FoundationError } from "../platform/types";

type EmployeeContactVisibility = EmployeeContact["visibility"];

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
  satellites:
    "PH-07A: /employees/{id}/contacts|addresses|dependents CRUD + /attribute-history timeline; every satellite mutation appends employee_attribute_history and an outbox row in the same unit of work (FR-EPM-003/004/011)",
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
    method: "GET",
    path: "/api/v1/employees/{id}/contacts",
    operationId: "g01.listEmployeeContacts",
    protected: true,
    permission: "g01.employee.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) =>
      ok(pageItems(context.services.employeeMaster.listContacts(context.actor, requiredParam(context.params, "id")), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/contacts",
    operationId: "g01.addEmployeeContact",
    protected: true,
    permission: "g01.employee.contact.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const result = context.services.employeeMaster.addContact(context.actor, {
        employeeId: requiredParam(context.params, "id"),
        contactType: requiredString(body, "contactType") as ContactType,
        contactValue: requiredString(body, "contactValue"),
        isPrimary: optionalBoolean(body, "isPrimary") ?? false,
        visibility: optionalString(body, "visibility") as EmployeeContactVisibility | undefined,
        effectiveDate: optionalString(body, "effectiveDate"),
      });
      return created(result);
    },
  });
  kernel.register({
    method: "PATCH",
    path: "/api/v1/employees/{id}/contacts/{contactId}",
    operationId: "g01.updateEmployeeContact",
    protected: true,
    permission: "g01.employee.contact.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const expectedRowVersion = optionalNumber(body, "expectedRowVersion");
      if (expectedRowVersion === undefined || !Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) {
        throw new FoundationError("VALIDATION_FAILED", "expectedRowVersion is required", { field: "expectedRowVersion" });
      }
      const result = context.services.employeeMaster.updateContact(context.actor, {
        employeeId: requiredParam(context.params, "id"),
        contactId: requiredParam(context.params, "contactId"),
        contactValue: optionalString(body, "contactValue"),
        isPrimary: optionalBoolean(body, "isPrimary"),
        expectedRowVersion,
        effectiveDate: optionalString(body, "effectiveDate"),
      });
      return accepted(result);
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/addresses",
    operationId: "g01.listEmployeeAddresses",
    protected: true,
    permission: "g01.employee.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) =>
      ok(pageItems(context.services.employeeMaster.listAddresses(context.actor, requiredParam(context.params, "id")), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/addresses",
    operationId: "g01.addEmployeeAddress",
    protected: true,
    permission: "g01.employee.address.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const result = context.services.employeeMaster.addAddress(context.actor, {
        employeeId: requiredParam(context.params, "id"),
        addressType: requiredString(body, "addressType") as AddressType,
        line1: requiredString(body, "line1"),
        line2: optionalString(body, "line2"),
        city: requiredString(body, "city"),
        district: optionalString(body, "district"),
        state: requiredString(body, "state"),
        country: optionalString(body, "country"),
        pincode: requiredString(body, "pincode"),
        validFrom: requiredString(body, "validFrom"),
      });
      return created(result);
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/dependents",
    operationId: "g01.listEmployeeDependents",
    protected: true,
    permission: "g01.employee.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) =>
      ok(pageItems(context.services.employeeMaster.listDependents(context.actor, requiredParam(context.params, "id")), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/dependents",
    operationId: "g01.addEmployeeDependent",
    protected: true,
    permission: "g01.employee.dependent.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const result = context.services.employeeMaster.addDependent(context.actor, {
        employeeId: requiredParam(context.params, "id"),
        fullName: requiredString(body, "fullName"),
        relationship: requiredString(body, "relationship") as DependentRelationship,
        dob: optionalString(body, "dob"),
        isLegalHeir: optionalBoolean(body, "isLegalHeir") ?? false,
        heirSuccessionRank: optionalNumber(body, "heirSuccessionRank"),
        nationalIdMasked: optionalString(body, "nationalIdMasked"),
        effectiveDate: optionalString(body, "effectiveDate"),
      });
      return created(result);
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/attribute-history",
    operationId: "g01.listEmployeeAttributeHistory",
    protected: true,
    permission: "g01.employee.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => {
      const employeeId = requiredParam(context.params, "id");
      return ok({
        employeeId,
        ...pageItems(context.services.employeeMaster.listAttributeHistory(context.actor, employeeId), context.pagination ?? { limit: 25 }),
      });
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
