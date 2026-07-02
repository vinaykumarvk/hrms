import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalRecord, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import { ApiContext, ApiResponse } from "../http/apiTypes";
import { SrEvent, SrSourceModule } from "../modules/g12/serviceRegisterService";
import { JOB_G12_ANCHOR, JOB_G12_GAPSCAN, JOB_G12_INTEGRITY } from "../modules/g12/srIntegrityService";
import type { SrAttestationKind, SrExtractScope, SrGapStatus, SrRedactionPolicy, SrRuleStatus, SrSeverity, SrSignatureMethod } from "../modules/g12/srIntegrityRepository";
import { FoundationError } from "../platform/types";

export const g12RouteEvidence = {
  ingest: "/api/v1/sr/ingest",
  reversal: "ingest/reversal",
  timeline: "timeline",
  corrigendum: "corrigendum",
  dispute: "dispute",
  resolve: "resolve",
  headers: ["X-Correlation-Id", "Idempotency-Key"],
  ledger: "append-only reversal semantic dedup idempotency",
  // PH-10B integrity pillars (BRD G12 FR-04/07/10/17)
  integrityVerify: "/api/v1/sr/employees/{id}/integrity/verify",
  integrityJob: JOB_G12_INTEGRITY,
  anchorJob: JOB_G12_ANCHOR,
  gapScanJob: JOB_G12_GAPSCAN,
  attestations: "/api/v1/sr/attestations",
  certifiedExtracts: "/api/v1/sr/extracts",
};

export function registerG12Routes(kernel: ApiKernel): void {
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/ingest",
    operationId: "g12.ingestServiceRegisterEvent",
    protected: true,
    permission: "g12.sr.ingest",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.serviceRegister.ingest(context.scope, requiredString({ key: context.idempotencyKey }, "key"), {
          sourceModule: readSourceModule(body),
          sourceReferenceId: requiredString(body, "sourceReferenceId"),
          sourceEventVersion: optionalNumber(body, "sourceEventVersion") ?? 1,
          employeeId: requiredString(body, "employeeId"),
          eventTypeCode: requiredString(body, "eventTypeCode"),
          eventDate: requiredString(body, "eventDate"),
          factKey: optionalString(body, "factKey"),
          orderNo: optionalString(body, "orderNo"),
          payload: optionalRecord(body, "payload") ?? {},
          documentIds: optionalStringArray(body, "documentIds") ?? [],
          reversalOfEventId: optionalString(body, "reversalOfEventId"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/ingest/reversal",
    operationId: "g12.reverseServiceRegisterEvent",
    protected: true,
    permission: "g12.sr.ingest.reversal",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      const idempotencyKey = requiredString({ key: context.idempotencyKey }, "key");
      const reason = requiredString(body, "reason");
      // BRD G12 FR-02 v2 reversal envelope: is_reversal + reverses_source_reference_id locate the
      // reversed ledger entry by its source_reference_id; unknown targets raise SR_REVERSAL_TARGET_NOT_FOUND.
      if (optionalBoolean(body, "is_reversal")) {
        return created(
          context.services.serviceRegister.reverseBySourceReference(
            context.scope,
            idempotencyKey,
            requiredString(body, "reverses_source_reference_id"),
            reason
          )
        );
      }
      return created(
        context.services.serviceRegister.reverseFromSource(context.scope, idempotencyKey, requiredString(body, "originalEventId"), reason)
      );
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/ingest/{ingestion_request_id}",
    operationId: "g12.getIngestResult",
    protected: true,
    permission: "g12.sr.read",
    handler: (context) => ok({ event: requireSrEvent(context, requiredParam(context.params, "ingestion_request_id")) }),
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/employees/{id}/timeline",
    operationId: "g12.getEmployeeServiceRegisterTimeline",
    protected: true,
    permission: "g12.sr.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => {
      // Cursor paging via the kernel helper: stable sequenceNo ordering from getTimeline,
      // limit clamped to 100 by parsePagination, next_cursor computed from the window end.
      const timeline = context.services.serviceRegister.getTimeline(context.scope, requiredParam(context.params, "id"));
      return ok(pageItems(timeline, context.pagination ?? { limit: 25 }));
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/events/{id}",
    operationId: "g12.getServiceRegisterEvent",
    protected: true,
    permission: "g12.sr.read",
    handler: (context) => ok({ event: requireSrEvent(context, requiredParam(context.params, "id")) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/events/{id}/corrigendum",
    operationId: "g12.createServiceRegisterCorrigendum",
    protected: true,
    permission: "g12.sr.corrigendum",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => appendAnnotation(context, requiredParam(context.params, "id"), "CORRIGENDUM"),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/events/{id}/dispute",
    operationId: "g12.createServiceRegisterDispute",
    protected: true,
    permission: "g12.sr.dispute",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => appendAnnotation(context, requiredParam(context.params, "id"), "DISPUTE"),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/disputes/{id}/resolve",
    operationId: "g12.resolveServiceRegisterDispute",
    protected: true,
    permission: "g12.sr.dispute.resolve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => appendAnnotation(context, requiredParam(context.params, "id"), "DISPUTE_RESOLUTION"),
  });

  // ------------------------------------------------------------------------------------
  // PH-10B integrity pillars (BRD G12 FR-04/07/10/17)
  // ------------------------------------------------------------------------------------
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/employees/{id}/integrity/verify",
    operationId: "g12.verifyServiceRegisterIntegrity",
    protected: true,
    permission: "g12.sr.integrity.verify",
    handler: (context) =>
      // FR-04: recompute the content chain + status sub-chain from stored content and
      // report OK/FAIL with the first broken link.
      ok(context.services.srIntegrity.verifyEmployee(context.scope, requiredParam(context.params, "id"))),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/integrity/run",
    operationId: "g12.runServiceRegisterIntegrityJob",
    protected: true,
    permission: "g12.sr.integrity.run",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      // JOB-G12-INTEGRITY: the scheduled recompute drives the same verify code path.
      accepted(context.services.srIntegrity.runIntegrityJob(context.scope, requiredString({ key: context.idempotencyKey }, "key"))),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/anchors/run",
    operationId: "g12.runServiceRegisterAnchorJob",
    protected: true,
    permission: "g12.sr.anchor.run",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.srIntegrity.runAnchorJob(context.scope, requiredString({ key: context.idempotencyKey }, "key"), {
          periodFrom: optionalString(body, "periodFrom"),
          periodTo: optionalString(body, "periodTo"),
        })
      );
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/anchors",
    operationId: "g12.listServiceRegisterAnchors",
    protected: true,
    permission: "g12.sr.anchor.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) => ok(pageItems(context.services.srIntegrity.listAnchors(context.scope), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/expected-event-rules",
    operationId: "g12.createSrExpectedEventRule",
    protected: true,
    permission: "g12.sr.gap.rule.manage",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.srIntegrity.createExpectedEventRule(context.scope, {
          ruleCode: requiredString(body, "ruleCode"),
          expectedEventCategory: requiredString(body, "expectedEventCategory"),
          cadence: optionalRecord(body, "cadence"),
          suppressedByCategories: optionalStringArray(body, "suppressedByCategories"),
          appliesToCadre: optionalStringArray(body, "appliesToCadre"),
          sourceRuleRef: optionalString(body, "sourceRuleRef"),
          severity: optionalString(body, "severity") as SrSeverity | undefined,
          status: optionalString(body, "status") as SrRuleStatus | undefined,
          effectiveFrom: requiredString(body, "effectiveFrom"),
          effectiveTo: optionalString(body, "effectiveTo"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/gap-scan/run",
    operationId: "g12.runSrGapScanJob",
    protected: true,
    permission: "g12.sr.gap.scan",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      // JOB-G12-GAPSCAN: expected-vs-recorded reconciliation appends GAP_FLAGGED rows.
      return accepted(
        context.services.srIntegrity.runGapScan(context.scope, requiredString({ key: context.idempotencyKey }, "key"), {
          periodFrom: requiredString(body, "periodFrom"),
          periodTo: requiredString(body, "periodTo"),
        })
      );
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/employees/{id}/gaps",
    operationId: "g12.listSrGapRegister",
    protected: true,
    permission: "g12.sr.gap.read",
    list: { defaultLimit: 25, maxLimit: 100 },
    handler: (context) =>
      ok(pageItems(context.services.srIntegrity.listGaps(context.scope, requiredParam(context.params, "id")), context.pagination ?? { limit: 25 })),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/gaps/{id}/resolve",
    operationId: "g12.resolveSrGap",
    protected: true,
    permission: "g12.sr.gap.resolve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return ok(
        context.services.srIntegrity.resolveGap(context.scope, requiredParam(context.params, "id"), {
          gapStatus: requiredString(body, "gapStatus") as SrGapStatus,
          explanationCode: optionalString(body, "explanationCode"),
          resolvedEventId: optionalString(body, "resolvedEventId"),
          corroboratedBy: optionalString(body, "corroboratedBy"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/attestations",
    operationId: "g12.createSrAttestation",
    protected: true,
    permission: "g12.sr.attest",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return created(
        context.services.srIntegrity.attestChainHead(context.scope, {
          employeeId: requiredString(body, "employeeId"),
          attestationKind: requiredString(body, "attestationKind") as SrAttestationKind,
          attestedRole: requiredString(body, "attestedRole"),
          signatureMethod: requiredString(body, "signatureMethod") as SrSignatureMethod,
          certificateSerial: optionalString(body, "certificateSerial"),
        })
      );
    },
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/sr/extracts",
    operationId: "g12.issueSrCertifiedExtract",
    protected: true,
    permission: "g12.sr.extract.issue",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      // FR-10: certified extract with purpose-driven redaction via the P02 field mask.
      return created(
        context.services.srIntegrity.issueCertifiedExtract(context.actor, context.scope, {
          employeeId: requiredString(body, "employeeId"),
          scope: optionalString(body, "scope") as SrExtractScope | undefined,
          redactionPolicy: optionalString(body, "redactionPolicy") as SrRedactionPolicy | undefined,
          issuedTo: requiredString(body, "issuedTo"),
          purpose: optionalString(body, "purpose"),
          periodFrom: optionalString(body, "periodFrom"),
          periodTo: optionalString(body, "periodTo"),
        })
      );
    },
  });
  kernel.register({
    method: "GET",
    path: "/api/v1/sr/extracts/{id}",
    operationId: "g12.getSrCertifiedExtract",
    protected: true,
    permission: "g12.sr.extract.read",
    handler: (context) => {
      const extract = context.services.srIntegrity.getExtract(context.scope, requiredParam(context.params, "id"));
      if (!extract) {
        throw new FoundationError("NOT_FOUND", "Certified extract not found");
      }
      return ok({ extract });
    },
  });
}

function appendAnnotation(context: ApiContext, eventId: string, eventTypeCode: string): ApiResponse {
  const original = requireSrEvent(context, eventId);
  const body = readBodyRecord(context.request.body);
  const reason = requiredString(body, "reason");
  return created(
    context.services.serviceRegister.ingest(context.scope, requiredString({ key: context.idempotencyKey }, "key"), {
      sourceModule: "G12_MANUAL",
      sourceReferenceId: `sr:${original.id}:${eventTypeCode}`,
      sourceEventVersion: original.sourceEventVersion + 1,
      employeeId: original.employeeId,
      eventTypeCode,
      eventDate: optionalString(body, "eventDate") ?? original.eventDate,
      factKey: `SR:${original.id}|${eventTypeCode}|${requiredString({ key: context.idempotencyKey }, "key")}`,
      payload: { reason, originalEventId: original.id, details: optionalRecord(body, "details") ?? {} },
      documentIds: optionalStringArray(body, "documentIds") ?? [],
    })
  );
}

function readSourceModule(body: Record<string, unknown>): SrSourceModule {
  const value = requiredString(body, "sourceModule");
  switch (value) {
    case "G01":
    case "G04":
    case "G05":
    case "G06":
    case "G08":
    case "G09":
    case "G10":
    case "G11":
    case "G12_MANUAL":
      return value;
    default:
      throw new FoundationError("VALIDATION_FAILED", "Unsupported SR source module", { field: "sourceModule" });
  }
}

function requireSrEvent(context: ApiContext, eventId: string): SrEvent {
  const event = context.services.serviceRegister.getEvent(context.scope, eventId);
  if (!event) {
    throw new FoundationError("NOT_FOUND", "SR event not found");
  }
  return event;
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
