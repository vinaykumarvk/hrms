import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalRecord, optionalString, readBodyRecord, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import { DocumentFetchIntent, DocumentRecord } from "../modules/g13/documentVaultService";
import { FoundationError } from "../platform/types";

export const g13RouteEvidence = {
  base: "/api/v1/documents",
  attach: "documents:attach",
  versions: "versions",
  checkin: "checkin",
  supersede: "supersede",
  legalHolds: "legal-holds",
  retention: "retention",
  headers: ["X-Correlation-Id", "Idempotency-Key"],
  retentionSafety: "legal-hold WORM retention fail-closed PRECONDITION",
};

export function registerG13Routes(kernel: ApiKernel): void {
  kernel.register({
    method: "POST",
    path: "/api/v1/documents",
    operationId: "g13.createDocument",
    protected: true,
    permission: "g13.document.create",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      // FR-G13-005/007: `content` is the gated byte-ingest path (server-side SHA-256 +
      // PENDING_SCAN); `contentHash` alone is the pre-scanned registration seam.
      return created({
        document: context.services.documentVault.createDocument(context.scope, {
          title: requiredString(body, "title"),
          ownerEmployeeId: optionalString(body, "ownerEmployeeId"),
          classification: readClassification(body),
          contentHash: optionalString(body, "contentHash"),
          content: optionalString(body, "content"),
          isWorm: optionalBoolean(body, "isWorm"),
        }),
      });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/documents",
    operationId: "g13.listDocuments",
    protected: true,
    permission: "g13.document.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok(pageItems(context.services.documentVault.list(context.scope), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/documents:attach",
    operationId: "g13.attachDocument",
    protected: true,
    permission: "g13.document.attach",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const link = optionalRecord(body, "link") ?? body;
      return accepted({
        document: context.services.documentVault.attach(context.scope, requiredString(body, "documentId"), {
          moduleCode: requiredString(link, "moduleCode"),
          entityName: requiredString(link, "entityName"),
          entityRefId: requiredString(link, "entityRefId"),
          linkRole: requiredString(link, "linkRole"),
        }),
      });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/documents/{id}/versions",
    operationId: "g13.listDocumentVersions",
    protected: true,
    permission: "g13.document.read",
    handler: (context) => ok({ items: context.services.documentVault.listVersions(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/documents/{id}:checkin",
    operationId: "g13.checkInDocument",
    protected: true,
    permission: "g13.document.checkin",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({
        document: context.services.documentVault.checkIn(context.scope, requiredParam(context.params, "id"), {
          contentHash: optionalString(body, "contentHash"),
          content: optionalString(body, "content"),
          title: optionalString(body, "title"),
        }),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/documents/{id}:supersede",
    operationId: "g13.supersedeDocument",
    protected: true,
    permission: "g13.document.supersede",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({ document: context.services.documentVault.supersede(context.scope, requiredParam(context.params, "id"), optionalString(body, "replacementDocumentId")) });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/documents/{id}/retention",
    operationId: "g13.getDocumentRetention",
    protected: true,
    permission: "g13.document.read",
    handler: (context) => ok({ retention: context.services.documentVault.getRetention(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/documents/{id}:extend-retention",
    operationId: "g13.extendDocumentRetention",
    protected: true,
    permission: "g13.document.retention.extend",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({
        retention: context.services.documentVault.extendRetention(
          context.scope,
          requiredParam(context.params, "id"),
          requiredString(body, "retentionUntil"),
          requiredString(body, "reason")
        ),
      });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/documents/{id}:fetch",
    operationId: "g13.fetchDocument",
    protected: true,
    permission: "g13.document.read",
    handler: (context) => {
      // FR-G13-016 R2 (VAL-G13-FETCH-INTENT): intent=VIEW|DOWNLOAD is mandatory on :fetch.
      const intent = readFetchIntent(context.request.query?.intent);
      if (intent === "DOWNLOAD") {
        // FR-G13-016 AC6: the file grant is served ONLY with the distinct DOWNLOAD right.
        context.services.authorization.check(context.actor, "g13.document.download", context.scope);
      }
      // FR-G13-006/015: the actor (with roles) feeds the deny-by-default clearance gate and the
      // VIEW/DOWNLOAD access-audit event on the E12 document_audit ledger.
      return ok({ fetch: context.services.documentVault.fetch(context.actor, requiredParam(context.params, "id"), intent) });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/documents/{id}",
    operationId: "g13.getDocument",
    protected: true,
    permission: "g13.document.read",
    handler: (context) => {
      const document = context.services.documentVault.get(context.scope, requiredParam(context.params, "id"));
      if (!document) {
        throw new FoundationError("NOT_FOUND", "Document not found");
      }
      return ok({ document });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/legal-holds",
    operationId: "g13.placeLegalHold",
    protected: true,
    permission: "g13.legal_hold.place",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({ document: context.services.documentVault.placeLegalHold(context.scope, requiredString(body, "documentId"), requiredString(body, "reason")) });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/legal-holds/{id}:approve-placement",
    operationId: "g13.approveLegalHoldPlacement",
    protected: true,
    permission: "g13.legal_hold.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({ document: context.services.documentVault.placeLegalHold(context.scope, requiredParam(context.params, "id"), optionalString(body, "reason") ?? "Approved") });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/legal-holds/{id}:release",
    operationId: "g13.releaseLegalHold",
    protected: true,
    permission: "g13.legal_hold.release",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({ document: context.services.documentVault.releaseLegalHold(context.scope, requiredParam(context.params, "id"), optionalString(body, "reason") ?? "Released") });
    },
  });
  // FR-G13-006/017 (E21 security_clearances): grant path for the deny-by-default gate.
  kernel.register({
    method: "POST",
    path: "/api/v1/security-clearances",
    operationId: "g13.grantSecurityClearance",
    protected: true,
    permission: "g13.clearance.grant",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        clearance: context.services.documentVault.grantSecurityClearance(context.scope, {
          principalType: readPrincipalType(body),
          principalRef: requiredString(body, "principalRef"),
          clearanceLevel: readClearanceLevel(body),
          justification: requiredString(body, "justification"),
          approvedBy: optionalString(body, "approvedBy"),
          validUntil: optionalString(body, "validUntil"),
        }),
      });
    },
  });
  // FR-G13-009 (E8 document_retention_policies): tenant retention classes.
  kernel.register({
    method: "POST",
    path: "/api/v1/retention-classes",
    operationId: "g13.defineRetentionClass",
    protected: true,
    permission: "g13.retention.class.define",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        retentionClass: context.services.documentVault.defineRetentionClass(context.scope, {
          code: requiredString(body, "code"),
          name: requiredString(body, "name"),
          retentionPeriodMonths: optionalNumber(body, "retentionPeriodMonths"),
          isPermanent: optionalBoolean(body, "isPermanent"),
          dispositionAction: readDispositionAction(body),
        }),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/documents/{id}:assign-retention-class",
    operationId: "g13.assignRetentionClass",
    protected: true,
    permission: "g13.retention.assign",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted({
        document: context.services.documentVault.assignRetentionClass(
          context.scope,
          requiredParam(context.params, "id"),
          requiredString(body, "retentionClassCode")
        ),
      });
    },
  });
  // FR-G13-009 (E18 disposition_records): maker proposes; a DIFFERENT checker approves (DI-10).
  kernel.register({
    method: "POST",
    path: "/api/v1/documents/{id}:propose-disposition",
    operationId: "g13.proposeDisposition",
    protected: true,
    permission: "g13.disposition.propose",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        disposition: context.services.documentVault.proposeDisposition(
          context.scope,
          requiredParam(context.params, "id"),
          optionalString(body, "action") ? readDispositionAction(body, "action") : undefined
        ),
      });
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dispositions/{id}:approve",
    operationId: "g13.approveDisposition",
    protected: true,
    permission: "g13.disposition.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted({ disposition: context.services.documentVault.approveDisposition(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dispositions/{id}:execute",
    operationId: "g13.executeDisposition",
    protected: true,
    permission: "g13.disposition.execute",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted({ disposition: context.services.documentVault.executeDisposition(context.scope, requiredParam(context.params, "id")) }),
  });
  // FR-G13-005 AC4 (JOB-G13-KEYROTATE): rotate the master key and re-wrap every stored
  // wrapped_dek under the new kms_key_id — object ciphertext is never rewritten.
  kernel.register({
    method: "POST",
    path: "/api/v1/admin/keys:rotate",
    operationId: "g13.rotateEncryptionKeys",
    protected: true,
    permission: "g13.key.rotate",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => accepted({ rotation: context.services.documentVault.rotateEncryptionKeys(context.scope) }),
  });
  // FR-G13-018 (E22 data_subject_requests): DPDP DSR lifecycle — register (statutory clock),
  // adjudicate against VAL-G13-LATTICE (DPO), execute (dual-control custodian, SoD).
  kernel.register({
    method: "POST",
    path: "/api/v1/dsr",
    operationId: "g13.registerDataSubjectRequest",
    protected: true,
    permission: "g13.dsr.register",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        dataSubjectRequest: context.services.documentVault.registerDataSubjectRequest(context.scope, {
          dataSubjectEmployeeId: requiredString(body, "dataSubjectEmployeeId"),
          requestType: readDsrType(body),
          consentRefId: optionalString(body, "consentRefId"),
        }),
      });
    },
  });
  // PH-28A — DPDP DSR list surface (consumed by the G13 DSR console UI, PH-27A).
  kernel.register({
    method: "GET",
    path: "/api/v1/dsr",
    operationId: "g13.listDataSubjectRequests",
    protected: true,
    permission: "g13.dsr.read",
    handler: (context) => ok(pageItems(context.services.documentVault.listDataSubjectRequests(context.scope), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/dsr/{id}",
    operationId: "g13.getDataSubjectRequest",
    protected: true,
    permission: "g13.dsr.read",
    handler: (context) => ok({ dataSubjectRequest: context.services.documentVault.getDataSubjectRequest(context.scope, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/dsr/{id}:adjudicate",
    operationId: "g13.adjudicateDataSubjectRequest",
    protected: true,
    permission: "g13.dsr.adjudicate",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body ?? {});
      return accepted({
        dataSubjectRequest: context.services.documentVault.adjudicateDataSubjectRequest(context.scope, requiredParam(context.params, "id"), {
          decision: readDsrDecision(body),
          resolutionNote: optionalString(body, "resolutionNote"),
        }),
      });
    },
  });
  // Erasure attempted against a held/retained/WORM document is blocked with 409
  // ERR-G13-ERASURE_EXEMPTED (pass body.documentId for the single-document attempt).
  kernel.register({
    method: "POST",
    path: "/api/v1/dsr/{id}:execute",
    operationId: "g13.executeDataSubjectRequest",
    protected: true,
    permission: "g13.dsr.execute",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body ?? {});
      return accepted({
        dataSubjectRequest: context.services.documentVault.executeDataSubjectRequest(
          context.scope,
          requiredParam(context.params, "id"),
          optionalString(body, "documentId")
        ),
      });
    },
  });

  // PH-32C — G13 certified true copies + OCR permission-aware search (route exposure).
  kernel.register({
    method: "POST",
    path: "/api/v1/documents/{id}/certified-copies",
    operationId: "g13.issueCertifiedCopy",
    protected: true,
    permission: "g13.certifiedcopy.issue",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created({
        certifiedCopy: context.services.certifiedCopy.issueCertifiedCopy(context.actor, {
          sourceDocumentId: requiredParam(context.params, "id"),
          sourceStatus: requiredString(body, "sourceStatus"),
          issuingAuthority: requiredString(body, "issuingAuthority"),
          purpose: requiredString(body, "purpose"),
          issuedAt: requiredString(body, "issuedAt"),
        }),
      });
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/documents:ocr-search",
    operationId: "g13.ocrSearch",
    protected: true,
    permission: "g13.ocr.search",
    handler: (context) =>
      ok(
        context.services.ocrSearch.search(context.actor, {
          query: String(context.request.query?.q ?? ""),
          clearance: (String(context.request.query?.clearance ?? "PUBLIC") as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET"),
        })
      ),
  });
}

function readDsrType(body: Record<string, unknown>): "ACCESS" | "ERASURE" | "RECTIFICATION" | "PORTABILITY" {
  const value = requiredString(body, "requestType");
  switch (value) {
    case "ACCESS":
    case "ERASURE":
    case "RECTIFICATION":
    case "PORTABILITY":
      return value;
    default:
      throw new FoundationError("VALIDATION_FAILED", "Unsupported data-subject request type", { field: "requestType" });
  }
}

function readDsrDecision(body: Record<string, unknown>): "PROCEED" | "REJECT" | undefined {
  const value = optionalString(body, "decision");
  if (value === undefined || value === "PROCEED" || value === "REJECT") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", "decision must be PROCEED or REJECT", { field: "decision" });
}

function readPrincipalType(body: Record<string, unknown>): "USER" | "ROLE" {
  const value = optionalString(body, "principalType") ?? "USER";
  if (value === "USER" || value === "ROLE") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", "principalType must be USER or ROLE", { field: "principalType" });
}

function readClearanceLevel(body: Record<string, unknown>): DocumentRecord["classification"] {
  const value = requiredString(body, "clearanceLevel");
  switch (value) {
    case "PUBLIC":
    case "INTERNAL":
    case "CONFIDENTIAL":
    case "SECRET":
    case "TOP_SECRET":
      return value;
    default:
      throw new FoundationError("VALIDATION_FAILED", "Unsupported clearance level", { field: "clearanceLevel" });
  }
}

function readDispositionAction(body: Record<string, unknown>, field = "dispositionAction"): "DESTROY" | "ARCHIVE_TRANSFER" | "REVIEW" {
  const value = requiredString(body, field);
  switch (value) {
    case "DESTROY":
    case "ARCHIVE_TRANSFER":
    case "REVIEW":
      return value;
    default:
      throw new FoundationError("VALIDATION_FAILED", "Unsupported disposition action", { field });
  }
}

function readFetchIntent(value: string | undefined): DocumentFetchIntent {
  if (value === "VIEW" || value === "DOWNLOAD") {
    return value;
  }
  // Taxonomy ERR-G13-FETCH_INTENT_REQUIRED: :fetch without intent=VIEW|DOWNLOAD (FR-G13-016 R2).
  throw new FoundationError("VALIDATION_FAILED", "Specify intent=VIEW or intent=DOWNLOAD.", {
    field: "intent",
    details: { messageId: "ERR-G13-FETCH_INTENT_REQUIRED" },
  });
}

function readClassification(body: Record<string, unknown>): DocumentRecord["classification"] {
  const value = optionalString(body, "classification") ?? "INTERNAL";
  switch (value) {
    case "PUBLIC":
    case "INTERNAL":
    case "CONFIDENTIAL":
    case "SECRET":
    case "TOP_SECRET":
      return value;
    default:
      throw new FoundationError("VALIDATION_FAILED", "Unsupported document classification", { field: "classification" });
  }
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
