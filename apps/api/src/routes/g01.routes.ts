import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { readBodyRecord, optionalBoolean, optionalNumber, optionalString, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import type { AddressType, ContactType, DependentRelationship, EmployeeContact } from "../modules/g01/employeeMasterService";
import type { BankAccount } from "../modules/g01/bankAccountService";
import type { BgvRecord, BgvReviewOutcome, BgvStatus, BgvVerificationType } from "../modules/g01/backgroundVerificationService";
import { FoundationError } from "../platform/types";

function toWireBgvRecord(row: BgvRecord): Omit<BgvRecord, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = row;
  return rest;
}

type EmployeeContactVisibility = EmployeeContact["visibility"];

/** submittedByUserId is an internal maker-identity used only for the SOD (maker!=checker) check on
 *  approval; it must never reach a wire response — even a self-service employee with only
 *  g01.employee.read can list bank accounts, and internal actor ids are not for client consumption. */
function toWireBankAccount(account: BankAccount): Omit<BankAccount, "submittedByUserId"> {
  const { submittedByUserId: _submittedByUserId, ...wire } = account;
  return wire;
}

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
  identityOps:
    "PH-16A: /dedup/* queue + 4-eyes alias merge (employee_id_aliases, merge_snapshot, RECORDS_MERGED, windowed undo), /imports/* PROVISIONAL glide path with /remediation-queue and :promote-active, and lifecycle :separate/:reactivate/:archive with §10.1 guards (FR-EPM-015/017/018)",
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
        dob: optionalString(body, "dob"),
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
    path: "/api/v1/employees/{id}:correct-pii",
    operationId: "g01.correctEmployeePii",
    protected: true,
    permission: "g01.employee.pii.correct",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const profile = context.services.employeeMaster.correctPii(context.actor, requiredParam(context.params, "id"), {
        pan: optionalString(body, "pan"),
        dob: optionalString(body, "dob"),
        reason: requiredString(body, "reason"),
      });
      return ok({ profile });
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

  // ===================================================================================
  // PH-16A — FR-EPM-015 duplicate detection & alias-based merge
  // ===================================================================================
  kernel.register({
    method: "POST",
    path: "/api/v1/dedup/scan",
    operationId: "g01.runDedupScan",
    protected: true,
    permission: "g01.dedup.scan",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => created(context.services.employeeIdentityOps.scanForDuplicates(context.actor)),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/dedup/candidates",
    operationId: "g01.listDedupCandidates",
    protected: true,
    permission: "g01.dedup.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) =>
      ok(
        pageItems(
          context.services.employeeIdentityOps.listDedupCandidates(
            context.scope,
            context.request.query?.status as "OPEN" | "MERGED" | "DISMISSED" | undefined
          ),
          context.pagination ?? { limit: 25 }
        )
      ),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dedup/candidates/{id}:merge",
    operationId: "g01.requestDedupMerge",
    protected: true,
    permission: "g01.dedup.merge",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeIdentityOps.requestMerge(context.actor, {
          candidateId: requiredParam(context.params, "id"),
          survivorId: requiredString(body, "survivorId"),
          override: optionalBoolean(body, "override"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dedup/candidates/{id}:merge-approve",
    operationId: "g01.approveDedupMerge",
    protected: true,
    permission: "g01.dedup.merge.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.approveMerge(context.actor, { candidateId: requiredParam(context.params, "id") })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dedup/candidates/{id}:dismiss",
    operationId: "g01.dismissDedupCandidate",
    protected: true,
    permission: "g01.dedup.dismiss",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.dismissCandidate(context.actor, { candidateId: requiredParam(context.params, "id") })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dedup/merges/{aliasId}:undo",
    operationId: "g01.undoDedupMerge",
    protected: true,
    permission: "g01.dedup.undo",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.undoMerge(context.actor, { aliasId: requiredParam(context.params, "aliasId") })),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/resolve",
    operationId: "g01.resolveEmployeeId",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok(context.services.employeeIdentityOps.resolveEmployeeId(context.scope, requiredParam(context.params, "id"))),
  });

  // ===================================================================================
  // PH-16A — FR-EPM-017 bulk import (PROVISIONAL glide path)
  // ===================================================================================
  kernel.register({
    method: "POST",
    path: "/api/v1/imports",
    operationId: "g01.createImportBatch",
    protected: true,
    permission: "g01.import.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.employeeIdentityOps.createImportBatch(context.actor, {
          templateVersion: requiredString(body, "templateVersion"),
          validationProfile: (optionalString(body, "validationProfile") ?? "STRICT") as "STRICT" | "MIGRATION",
          rows: (body.rows ?? []) as Record<string, unknown>[],
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/imports/{batchId}:validate",
    operationId: "g01.validateImportBatch",
    protected: true,
    permission: "g01.import.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.validateImportBatch(context.actor, { batchId: requiredParam(context.params, "batchId") })),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/imports/{batchId}/report",
    operationId: "g01.getImportBatchReport",
    protected: true,
    permission: "g01.import.read",
    handler: (context) => ok(context.services.employeeIdentityOps.getImportReport(context.scope, requiredParam(context.params, "batchId"))),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/imports/{batchId}:commit",
    operationId: "g01.commitImportBatch",
    protected: true,
    permission: "g01.import.commit",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.commitImportBatch(context.actor, { batchId: requiredParam(context.params, "batchId") })),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/remediation-queue",
    operationId: "g01.listRemediationQueue",
    protected: true,
    permission: "g01.import.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) =>
      ok(
        pageItems(
          context.services.employeeIdentityOps.listRemediationQueue(
            context.scope,
            (context.request.query?.state as "QUEUED" | "RESOLVED" | undefined) ?? "QUEUED"
          ),
          context.pagination ?? { limit: 25 }
        )
      ),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:promote-active",
    operationId: "g01.promoteEmployeeActive",
    protected: true,
    permission: "g01.import.commit",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeIdentityOps.promoteActive(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          fixes: {
            dob: optionalString(body, "dob"),
            dateOfJoining: optionalString(body, "dateOfJoining"),
            pan: optionalString(body, "pan"),
          },
        })
      );
    },
  });

  // ===================================================================================
  // PH-16A — FR-EPM-018 lifecycle :separate / :reactivate / :archive
  // ===================================================================================
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:separate",
    operationId: "g01.initiateEmployeeSeparation",
    protected: true,
    permission: "g01.employee.lifecycle",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeIdentityOps.initiateSeparation(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          targetStatus: requiredString(body, "targetStatus") as "RETIRED" | "RESIGNED" | "TERMINATED" | "DECEASED",
          separationDate: requiredString(body, "separationDate"),
          separationReason: requiredString(body, "separationReason"),
          overrideObligations: optionalBoolean(body, "overrideObligations"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/separation:approve",
    operationId: "g01.approveEmployeeSeparation",
    protected: true,
    permission: "g01.employee.lifecycle.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.approveSeparation(context.actor, { employeeId: requiredParam(context.params, "id") })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:reactivate",
    operationId: "g01.reactivateEmployee",
    protected: true,
    permission: "g01.employee.lifecycle",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeIdentityOps.reactivate(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          effectiveDate: requiredString(body, "effectiveDate"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:archive",
    operationId: "g01.archiveEmployee",
    protected: true,
    permission: "g01.employee.lifecycle",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted(context.services.employeeIdentityOps.archive(context.actor, { employeeId: requiredParam(context.params, "id") })),
  });

  // PH-30A — G01 Aadhaar vault capture (Verhoeff + tokenise) and phonetic search (route exposure).
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/aadhaar-vault",
    operationId: "g01.captureAadhaar",
    protected: true,
    permission: "g01.aadhaar.capture",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        vaultEntry: context.services.aadhaarVault.captureAadhaar(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          rawAadhaar: requiredString(body, "rawAadhaar"),
          verifiedAt: optionalString(body, "verifiedAt"),
          expiresAt: optionalString(body, "expiresAt"),
        }),
      });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees:phonetic-search",
    operationId: "g01.phoneticSearch",
    protected: true,
    permission: "g01.phonetic.search",
    handler: (context) => ok(context.services.phoneticSearch.searchPhonetic(context.actor, { query: String(context.request.query?.q ?? "") })),
  });

  // PH-45A — G01 Aadhaar reveal (4-eyes break-glass) + employee legal-hold/blocking-obligation lifecycle +
  // service-no lookup. Route exposure for already-tested aadhaarVault / employeeIdentityOps / employeeMaster.
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/aadhaar-vault/{vaultId}:request-reveal",
    operationId: "g01.requestAadhaarReveal",
    protected: true,
    permission: "g01.aadhaar.reveal.request",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({ reveal: context.services.aadhaarVault.requestReveal(context.actor, requiredParam(context.params, "vaultId"), { purpose: requiredString(body, "purpose") }) });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/aadhaar-reveals/{revealId}:approve",
    operationId: "g01.approveAadhaarReveal",
    protected: true,
    permission: "g01.aadhaar.reveal.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted(context.services.aadhaarVault.approveReveal(context.actor, requiredParam(context.params, "revealId"))),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/aadhaar-vault",
    operationId: "g01.getAadhaarVault",
    protected: true,
    permission: "g01.aadhaar.reveal.request",
    handler: (context) => ok({ vault: context.services.aadhaarVault.getVaultByEmployee(context.scope, requiredParam(context.params, "id")) ?? null }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:place-legal-hold",
    operationId: "g01.placeLegalHold",
    protected: true,
    permission: "g01.legal_hold.place",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.employeeIdentityOps.placeLegalHold(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          holdType: requiredString(body, "holdType") as "DISCIPLINARY" | "LITIGATION" | "PENSION" | "AUDIT" | "RTI",
          reason: requiredString(body, "reason"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/legal-holds/{holdId}:release",
    operationId: "g01.releaseLegalHold",
    protected: true,
    permission: "g01.legal_hold.release",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted(context.services.employeeIdentityOps.releaseLegalHold(context.actor, { holdId: requiredParam(context.params, "holdId") })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:register-obligation",
    operationId: "g01.registerBlockingObligation",
    protected: true,
    permission: "g01.employee.lifecycle",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.employeeIdentityOps.registerBlockingObligation(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          description: requiredString(body, "description"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/obligations/{obligationId}:clear",
    operationId: "g01.clearBlockingObligation",
    protected: true,
    permission: "g01.employee.lifecycle",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted(context.services.employeeIdentityOps.clearBlockingObligation(context.actor, { obligationId: requiredParam(context.params, "obligationId") })),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees:by-service-no",
    operationId: "g01.getByServiceNo",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => {
      const serviceNo = context.request.query?.serviceNo;
      if (!serviceNo) {
        throw new FoundationError("VALIDATION_FAILED", "serviceNo query parameter is required", { field: "serviceNo" });
      }
      return ok({ employee: context.services.employeeMaster.getByServiceNo(context.scope, serviceNo) });
    },
  });

  // PH-55A — G01 governed write-ports (identity change, transfer posting, probation confirmation) + live-
  // record/count reads. Route exposure for already-tested employeeMaster backing.
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:governed-identity-change",
    operationId: "g01.governedIdentityChange",
    protected: true,
    permission: "g01.employee.governed_change",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeMaster.governedIdentityChange(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          newDisplayName: requiredString(body, "newDisplayName"),
          reason: requiredString(body, "reason"),
          effectiveDate: requiredString(body, "effectiveDate"),
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:apply-transfer-posting",
    operationId: "g01.applyTransferPosting",
    protected: true,
    permission: "g01.employee.posting.update",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeMaster.applyTransferPosting(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          toOrgUnitId: requiredString(body, "toOrgUnitId"),
          transferOrderId: requiredString(body, "transferOrderId"),
          orderNo: requiredString(body, "orderNo"),
          effectiveDate: requiredString(body, "effectiveDate"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}:apply-probation-confirmation",
    operationId: "g01.applyProbationConfirmation",
    protected: true,
    permission: "g01.employee.confirmation.update",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.employeeMaster.applyProbationConfirmation(context.actor, {
          employeeId: requiredParam(context.params, "id"),
          confirmationEffectiveDate: requiredString(body, "confirmationEffectiveDate"),
          confirmationRef: requiredString(body, "confirmationRef"),
        })
      );
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/live-record",
    operationId: "g01.getLiveRecordForIdentityOps",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ employee: context.services.employeeMaster.getLiveRecordForIdentityOps(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees:list-live-records",
    operationId: "g01.listLiveRecordsForIdentityOps",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ items: context.services.employeeMaster.listLiveRecordsForIdentityOps(context.scope) }),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees:count",
    operationId: "g01.countEmployees",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ count: context.services.employeeMaster.count(context.scope) }),
  });

  // PH-62A — FR-EPM-004 nominee register (NET-NEW backing): list / add / update / soft-delete with the
  // VAL-NOMINEE share invariant and row_version optimistic locking.
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/nominees",
    operationId: "g01.listNominees",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ items: context.services.nominee.listNominees(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/nominees",
    operationId: "g01.addNominee",
    protected: true,
    permission: "g01.nominee.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        nominee: context.services.nominee.addNominee(context.actor, requiredParam(context.params, "id"), {
          name: requiredString(body, "name"),
          benefitType: requiredString(body, "benefitType"),
          sharePct: readNomineeNumber(body, "sharePct"),
          guardian: optionalString(body, "guardian"),
          isFamilyPensionRecipient: optionalBoolean(body, "isFamilyPensionRecipient"),
        }),
      });
    },
  });
  kernel.register({
    method: "PATCH",
    path: "/api/v1/employees/{id}/nominees/{nomineeId}",
    operationId: "g01.updateNominee",
    protected: true,
    permission: "g01.nominee.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return ok({
        nominee: context.services.nominee.updateNominee(context.actor, requiredParam(context.params, "nomineeId"), {
          rowVersion: readNomineeNumber(body, "rowVersion"),
          sharePct: optionalNumber(body, "sharePct"),
          guardian: optionalString(body, "guardian"),
          isFamilyPensionRecipient: optionalBoolean(body, "isFamilyPensionRecipient"),
        }),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/nominees/{nomineeId}:remove",
    operationId: "g01.removeNominee",
    protected: true,
    permission: "g01.nominee.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      context.services.nominee.removeNominee(context.actor, requiredParam(context.params, "nomineeId"));
      return ok({ removed: true });
    },
  });

  // PH-63A — FR-EPM-005 emergency-contact register (NET-NEW backing): list / add / update / soft-delete with
  // the unique call-order priority invariant and row_version optimistic locking.
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/emergency-contacts",
    operationId: "g01.listEmergencyContacts",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ items: context.services.emergencyContact.listEmergencyContacts(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/emergency-contacts",
    operationId: "g01.addEmergencyContact",
    protected: true,
    permission: "g01.emergency_contact.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        emergencyContact: context.services.emergencyContact.addEmergencyContact(context.actor, requiredParam(context.params, "id"), {
          name: requiredString(body, "name"),
          phone: requiredString(body, "phone"),
          priority: readNomineeNumber(body, "priority"),
        }),
      });
    },
  });
  kernel.register({
    method: "PATCH",
    path: "/api/v1/employees/{id}/emergency-contacts/{contactId}",
    operationId: "g01.updateEmergencyContact",
    protected: true,
    permission: "g01.emergency_contact.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return ok({
        emergencyContact: context.services.emergencyContact.updateEmergencyContact(context.actor, requiredParam(context.params, "contactId"), {
          rowVersion: readNomineeNumber(body, "rowVersion"),
          name: optionalString(body, "name"),
          phone: optionalString(body, "phone"),
          priority: optionalNumber(body, "priority"),
        }),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/emergency-contacts/{contactId}:remove",
    operationId: "g01.removeEmergencyContact",
    protected: true,
    permission: "g01.emergency_contact.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      context.services.emergencyContact.removeEmergencyContact(context.actor, requiredParam(context.params, "contactId"));
      return ok({ removed: true });
    },
  });

  // PH-64A — FR-EPM-006 education register (NET-NEW backing): list / add / update / soft-delete with the
  // single-highest invariant (promoting a record auto-demotes the prior highest) and row_version locking.
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/education",
    operationId: "g01.listEducation",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) => ok({ items: context.services.education.listEducation(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/education",
    operationId: "g01.addEducation",
    protected: true,
    permission: "g01.education.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        education: context.services.education.addEducation(context.actor, requiredParam(context.params, "id"), {
          level: requiredString(body, "level"),
          institution: optionalString(body, "institution"),
          isHighest: optionalBoolean(body, "isHighest"),
          isVerified: optionalBoolean(body, "isVerified"),
          yearOfPassing: optionalNumber(body, "yearOfPassing"),
          gradeType: optionalString(body, "gradeType") as "CGPA" | "GPA" | "PERCENTAGE" | "GRADE" | undefined,
        }),
      });
    },
  });
  kernel.register({
    method: "PATCH",
    path: "/api/v1/employees/{id}/education/{educationId}",
    operationId: "g01.updateEducation",
    protected: true,
    permission: "g01.education.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return ok({
        education: context.services.education.updateEducation(context.actor, requiredParam(context.params, "educationId"), {
          rowVersion: readNomineeNumber(body, "rowVersion"),
          level: optionalString(body, "level"),
          institution: optionalString(body, "institution"),
          isHighest: optionalBoolean(body, "isHighest"),
          isVerified: optionalBoolean(body, "isVerified"),
          yearOfPassing: optionalNumber(body, "yearOfPassing"),
          gradeType: optionalString(body, "gradeType") as "CGPA" | "GPA" | "PERCENTAGE" | "GRADE" | undefined,
        }),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/education/{educationId}:remove",
    operationId: "g01.removeEducation",
    protected: true,
    permission: "g01.education.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      context.services.education.removeEducation(context.actor, requiredParam(context.params, "educationId"));
      return ok({ removed: true });
    },
  });

  // PH-65A — FR-EPM-008 bank-account register (NET-NEW backing): list / add (VAL-IFSC, PENDING) / update
  // (re-enters PENDING) / approve / penny-drop / soft-delete, with the single primary-salary invariant.
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/bank-accounts",
    operationId: "g01.listBankAccounts",
    protected: true,
    permission: "g01.employee.read",
    handler: (context) =>
      ok({ items: context.services.bankAccount.listBankAccounts(context.scope, requiredParam(context.params, "id")).map(toWireBankAccount) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/bank-accounts",
    operationId: "g01.addBankAccount",
    protected: true,
    permission: "g01.bank.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        bankAccount: toWireBankAccount(
          context.services.bankAccount.addBankAccount(context.actor, requiredParam(context.params, "id"), {
            bankName: requiredString(body, "bankName"),
            ifsc: requiredString(body, "ifsc"),
            accountNumberMasked: requiredString(body, "accountNumberMasked"),
            isPrimarySalary: optionalBoolean(body, "isPrimarySalary"),
          })
        ),
      });
    },
  });
  kernel.register({
    method: "PATCH",
    path: "/api/v1/employees/{id}/bank-accounts/{accountId}",
    operationId: "g01.updateBankAccount",
    protected: true,
    permission: "g01.bank.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return ok({
        bankAccount: toWireBankAccount(
          context.services.bankAccount.updateBankAccount(context.actor, requiredParam(context.params, "accountId"), {
            rowVersion: readNomineeNumber(body, "rowVersion"),
            bankName: optionalString(body, "bankName"),
            ifsc: optionalString(body, "ifsc"),
            accountNumberMasked: optionalString(body, "accountNumberMasked"),
            isPrimarySalary: optionalBoolean(body, "isPrimarySalary"),
          })
        ),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/bank-accounts/{accountId}:approve",
    operationId: "g01.approveBankAccount",
    protected: true,
    permission: "g01.bank.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted({ bankAccount: toWireBankAccount(context.services.bankAccount.approveBankAccount(context.actor, requiredParam(context.params, "accountId"))) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/bank-accounts/{accountId}:penny-drop",
    operationId: "g01.recordBankPennyDrop",
    protected: true,
    permission: "g01.bank.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({
        bankAccount: toWireBankAccount(
          context.services.bankAccount.recordPennyDrop(context.actor, requiredParam(context.params, "accountId"), {
            result: requiredString(body, "result") as "VERIFIED" | "FAILED",
          })
        ),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/bank-accounts/{accountId}:remove",
    operationId: "g01.removeBankAccount",
    protected: true,
    permission: "g01.bank.write",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      context.services.bankAccount.removeBankAccount(context.actor, requiredParam(context.params, "accountId"));
      return ok({ removed: true });
    },
  });
  // Post-hr_admin-goal thin build: bgv_review capability (view verification reports/vendor BGV
  // results/discrepancy alerts).
  kernel.register({
    method: "POST",
    path: "/api/v1/employees/{id}/bgv-records",
    operationId: "g01.recordBgvResult",
    protected: true,
    permission: "g01.bgv.record",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        bgvRecord: toWireBgvRecord(
          context.services.backgroundVerification.recordBgvResult(context.actor, {
            employeeId: requiredParam(context.params, "id"),
            vendorName: requiredString(body, "vendorName"),
            verificationType: requiredString(body, "verificationType") as BgvVerificationType,
            status: requiredString(body, "status") as BgvStatus,
            reportDate: requiredString(body, "reportDate"),
            discrepancyNotes: optionalString(body, "discrepancyNotes"),
          })
        ),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/bgv-records/{id}:review",
    operationId: "g01.reviewBgvResult",
    protected: true,
    permission: "g01.bgv.review",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return ok({
        bgvRecord: toWireBgvRecord(
          context.services.backgroundVerification.reviewBgvResult(context.actor, requiredParam(context.params, "id"), {
            outcome: requiredString(body, "outcome") as BgvReviewOutcome,
            notes: requiredString(body, "notes"),
          })
        ),
      });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/employees/{id}/bgv-records",
    operationId: "g01.listBgvRecords",
    protected: true,
    permission: "g01.bgv.read",
    handler: (context) =>
      ok({ items: context.services.backgroundVerification.listBgvRecords(context.actor, requiredParam(context.params, "id")).map(toWireBgvRecord) }),
  });
}

/** A required numeric body field accepting a JSON number or a numeric string. */
function readNomineeNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new FoundationError("VALIDATION_FAILED", `${key} must be a number`, { field: key });
  }
  return n;
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
