import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalRecord, optionalString, readBodyRecord, requiredString } from "../http/body";
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
      return created({
        document: context.services.documentVault.createDocument(context.scope, {
          title: requiredString(body, "title"),
          ownerEmployeeId: optionalString(body, "ownerEmployeeId"),
          classification: readClassification(body),
          contentHash: requiredString(body, "contentHash"),
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
          contentHash: requiredString(body, "contentHash"),
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
      return ok({ fetch: context.services.documentVault.fetch(context.scope, requiredParam(context.params, "id"), intent) });
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
