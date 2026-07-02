import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalRecord, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { ApiContext, ApiResponse } from "../http/apiTypes";
import { SrEvent, SrSourceModule } from "../modules/g12/serviceRegisterService";
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
      return created(
        context.services.serviceRegister.reverseFromSource(
          context.scope,
          requiredString({ key: context.idempotencyKey }, "key"),
          requiredString(body, "originalEventId"),
          requiredString(body, "reason")
        )
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
      const timeline = context.services.serviceRegister.getTimeline(context.scope, requiredParam(context.params, "id"));
      return ok({ items: timeline, limit: context.pagination?.limit ?? 25, next_cursor: null });
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
