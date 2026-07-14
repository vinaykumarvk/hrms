import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import type { SrMappingDisposition, SrMappingEventType, StraddleHandling, QualifyingServiceRule } from "../modules/g04/leaveSrCatalogService";

export const g04RouteEvidence = {
  outbox: "/api/v1/leave-sr/outbox",
  relay: "relay",
  replay: "dead-letter replay",
  discard: "dead-letter discard",
  reconciliation: "reconciliation",
  // PH-16C: FR-G04-02 sr_event_mapping catalog, FR-G04-15 relay_partition_lease +
  // JOB-G04-REAPER, FR-G04-18 prepension_certificate.
  mappings: "/api/v1/leave-sr/mappings",
  partitions: "/api/v1/leave-sr/partitions:claim",
  reaper: "/api/v1/leave-sr/reaper:run",
  certificates: "/api/v1/leave-sr/prepension-certificates",
};

export function registerG04Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "GET",
      path: "/api/v1/leave-sr/outbox",
      operationId: "g04.listLeaveServiceRegisterOutbox",
      protected: true,
      permission: "g04.relay.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = await context.services.leaveSrRelay.list(context.scope);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "GET",
      path: "/api/v1/leave-sr/reconciliation",
      operationId: "g04.getLeaveServiceRegisterReconciliation",
      protected: true,
      permission: "g04.relay.read",
      handler: async (context) => ok({ report: await context.services.leaveSrRelay.reconcile(context.scope) }),
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/outbox/{id}:relay",
      operationId: "g04.relayLeaveServiceRegisterOutbox",
      protected: true,
      permission: "g04.relay.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          outboxEvent: await context.services.leaveSrRelay.relayEvent(context.actor, requiredParam(context.params, "id"), {
            simulateFailure: optionalString(body, "simulateFailure") === "true",
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/outbox/{id}:replay",
      operationId: "g04.replayLeaveServiceRegisterDeadLetter",
      protected: true,
      permission: "g04.relay.replay",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => accepted({ outboxEvent: await context.services.leaveSrRelay.replayDeadLetter(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/outbox/{id}:discard",
      operationId: "g04.discardLeaveServiceRegisterDeadLetter",
      protected: true,
      permission: "g04.relay.discard",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ outboxEvent: await context.services.leaveSrRelay.discardDeadLetter(context.actor, requiredParam(context.params, "id"), requiredString(body, "reason")) });
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-16C — FR-G04-02 versioned sr_event_mapping catalog
    // ---------------------------------------------------------------------------------
    {
      method: "GET",
      path: "/api/v1/leave-sr/mappings",
      operationId: "g04.listSrEventMappings",
      protected: true,
      permission: "g04.mapping.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = await context.services.leaveSrCatalog.listMappings(context.scope);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/mappings",
      operationId: "g04.createSrEventMappingDraft",
      protected: true,
      permission: "g04.mapping.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          mapping: await context.services.leaveSrCatalog.createMappingDraft(context.actor, {
            leaveTypeCode: requiredString(body, "leaveTypeCode"),
            eventType: requiredString(body, "eventType") as SrMappingEventType,
            disposition: requiredString(body, "disposition") as SrMappingDisposition,
            srEntryType: optionalString(body, "srEntryType"),
            qualifyingServiceRule: optionalString(body, "qualifyingServiceRule") as QualifyingServiceRule | undefined,
            statutoryRuleRef: optionalString(body, "statutoryRuleRef"),
            straddleHandling: optionalString(body, "straddleHandling") as StraddleHandling | undefined,
            annotationTemplate: optionalString(body, "annotationTemplate"),
            effectiveFrom: requiredString(body, "effectiveFrom"),
            effectiveTo: optionalString(body, "effectiveTo"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/mappings/{id}:publish",
      operationId: "g04.publishSrEventMapping",
      protected: true,
      permission: "g04.mapping.publish",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => accepted({ mapping: await context.services.leaveSrCatalog.publishMapping(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/mappings/{id}:retire",
      operationId: "g04.retireSrEventMapping",
      protected: true,
      permission: "g04.mapping.publish",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => accepted({ mapping: await context.services.leaveSrCatalog.retireMapping(context.actor, requiredParam(context.params, "id")) }),
    },
    // ---------------------------------------------------------------------------------
    // PH-16C — FR-G04-15 relay_partition_lease claims + JOB-G04-REAPER
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/leave-sr/partitions:claim",
      operationId: "g04.claimRelayPartition",
      protected: true,
      permission: "g04.relay.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.leaveSrCatalog.claimPartition(context.actor, {
            partitionKey: requiredString(body, "partitionKey"),
            workerId: requiredString(body, "workerId"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/reaper:run",
      operationId: "g04.runLeaseReaperSweep",
      protected: true,
      permission: "g04.relay.reap",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(await context.services.leaveSrCatalog.runReaperSweep(context.actor, { runKey: optionalString(body, "runKey") }));
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-16C — FR-G04-18 prepension_certificate (G11 gate input)
    // ---------------------------------------------------------------------------------
    {
      method: "GET",
      path: "/api/v1/leave-sr/prepension-certificates",
      operationId: "g04.listPrepensionCertificates",
      protected: true,
      permission: "g04.prepension.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const employeeId = optionalString(context.request.query ?? {}, "employeeId");
        const items = await context.services.leaveSrCatalog.listCertificates(context.scope, employeeId);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/prepension-certificates",
      operationId: "g04.issuePrepensionCertificate",
      protected: true,
      permission: "g04.prepension.sign",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          certificate: await context.services.leaveSrCatalog.issuePrepensionCertificate(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            runId: requiredString(body, "runId"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/prepension-certificates/{id}:consume",
      operationId: "g04.consumePrepensionCertificate",
      protected: true,
      permission: "g04.prepension.consume",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) =>
        accepted({ certificate: await context.services.leaveSrCatalog.consumeCertificateForG11(context.actor, requiredParam(context.params, "id")) }),
    },
    // PH-51A — G04 X.3 outbound-integration connector lifecycle (register -> send -> conformance; read) +
    // leave->SR relay enqueue/dead-letter reads. Route exposure for tested outboundIntegration / leaveSrRelay.
    {
      method: "POST",
      path: "/api/v1/integration/connectors",
      operationId: "g04.registerConnector",
      protected: true,
      permission: "g04.outbound.register",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          connector: await context.services.outboundIntegration.registerConnector(context.actor, {
            name: requiredString(body, "name"),
            endpoint: requiredString(body, "endpoint"),
            payloadVersion: optionalNumber(body, "payloadVersion"),
            failureThreshold: optionalNumber(body, "failureThreshold"),
            maxAttempts: optionalNumber(body, "maxAttempts"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/integration/connectors/{id}:send",
      operationId: "g04.outboundSend",
      protected: true,
      permission: "g04.outbound.send",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ send: await context.services.outboundIntegration.send(context.actor, requiredParam(context.params, "id"), { payload: body.payload ?? {} }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/integration/connectors/{id}:conformance",
      operationId: "g04.runConformance",
      protected: true,
      permission: "g04.outbound.conformance",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => ok(await context.services.outboundIntegration.runConformance(context.actor, requiredParam(context.params, "id"))),
    },
    {
      method: "GET",
      path: "/api/v1/integration/connectors/{id}",
      operationId: "g04.getConnector",
      protected: true,
      permission: "g04.relay.read",
      handler: async (context) => ok({ connector: await context.services.outboundIntegration.getConnector(context.scope, requiredParam(context.params, "id")) ?? null }),
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/enqueue-approved",
      operationId: "g04.enqueueApprovedLeave",
      protected: true,
      permission: "g04.relay.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          event: await context.services.leaveSrRelay.enqueueApprovedLeave(context.scope, {
            leaveApplicationId: requiredString(body, "leaveApplicationId"),
            employeeId: requiredString(body, "employeeId"),
            eventDate: requiredString(body, "eventDate"),
            payload: (body.payload as Record<string, unknown>) ?? {},
            leaveTypeCode: optionalString(body, "leaveTypeCode"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/enqueue-cancellation",
      operationId: "g04.enqueueLeaveCancellation",
      protected: true,
      permission: "g04.relay.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          event: await context.services.leaveSrRelay.enqueueLeaveCancellation(context.scope, {
            leaveApplicationId: requiredString(body, "leaveApplicationId"),
            employeeId: requiredString(body, "employeeId"),
            eventDate: requiredString(body, "eventDate"),
            payload: (body.payload as Record<string, unknown>) ?? {},
            leaveTypeCode: optionalString(body, "leaveTypeCode"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/leave-sr/dead-letters",
      operationId: "g04.listDeadLetters",
      protected: true,
      permission: "g04.relay.read",
      handler: async (context) => ok({ items: await context.services.leaveSrRelay.listDeadLetters(context.scope) }),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
