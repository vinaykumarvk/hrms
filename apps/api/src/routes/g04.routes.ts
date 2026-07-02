import { ApiKernel, accepted, ok } from "../http/apiKernel";
import { optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";

export const g04RouteEvidence = {
  outbox: "/api/v1/leave-sr/outbox",
  relay: "relay",
  replay: "dead-letter replay",
  discard: "dead-letter discard",
  reconciliation: "reconciliation",
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
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = context.services.leaveSrRelay.list(context.scope);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "GET",
      path: "/api/v1/leave-sr/reconciliation",
      operationId: "g04.getLeaveServiceRegisterReconciliation",
      protected: true,
      permission: "g04.relay.read",
      handler: (context) => ok({ report: context.services.leaveSrRelay.reconcile(context.scope) }),
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/outbox/{id}:relay",
      operationId: "g04.relayLeaveServiceRegisterOutbox",
      protected: true,
      permission: "g04.relay.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          outboxEvent: context.services.leaveSrRelay.relayEvent(context.actor, requiredParam(context.params, "id"), {
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
      handler: (context) => accepted({ outboxEvent: context.services.leaveSrRelay.replayDeadLetter(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/leave-sr/outbox/{id}:discard",
      operationId: "g04.discardLeaveServiceRegisterDeadLetter",
      protected: true,
      permission: "g04.relay.discard",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ outboxEvent: context.services.leaveSrRelay.discardDeadLetter(context.actor, requiredParam(context.params, "id"), requiredString(body, "reason")) });
      },
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
