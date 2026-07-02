import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";

export const g05RouteEvidence = {
  transferOrders: "/api/v1/transfers/orders",
  approval: "/api/v1/transfers/orders/{id}/approve",
  clearances: "/api/v1/transfers/orders/{id}/clearances/{clearance_code}:deem",
  relieveJoin: "/api/v1/transfers/orders/{id}:relieve-and-join",
  representations: "/api/v1/transfers/orders/{id}/representations",
  retain: "/api/v1/transfers/representations/{id}:retain",
  cancel: "/api/v1/transfers/orders/{id}:cancel",
  deemRelieved: "/api/v1/transfers/orders/{id}:deem-relieved",
  resolver: "POSITION_AUTHORITY",
  parallel: "PARALLEL_ALL_OF",
};

export function registerG05Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/transfers/orders",
      operationId: "g05.initiateTransferOrder",
      protected: true,
      permission: "g05.transfer.initiate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.transfer.initiate(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            fromOrgUnitId: optionalString(body, "fromOrgUnitId") ?? ph03Ids.orgRevenue,
            toOrgUnitId: requiredString(body, "toOrgUnitId"),
            orderDate: requiredString(body, "orderDate"),
            effectiveDate: requiredString(body, "effectiveDate"),
            reason: optionalString(body, "reason"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders",
      operationId: "g05.listTransferOrders",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const orders = context.services.transfer.listOrders(context.scope);
        return ok({ items: orders.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/approve",
      operationId: "g05.approveTransferOrder",
      protected: true,
      permission: "g05.transfer.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted(
          context.services.transfer.approve(context.actor, requiredParam(context.params, "id"), {
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        ),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders/{id}/clearance",
      operationId: "g05.getTransferClearance",
      protected: true,
      permission: "g05.transfer.read",
      handler: (context) => ok({ clearanceItems: context.services.transfer.getOrder(context.scope, requiredParam(context.params, "id")).clearanceItems }),
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/clearances/{clearance_code}:complete",
      operationId: "g05.completeTransferClearance",
      protected: true,
      permission: "g05.transfer.clearance",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          order: context.services.transfer.completeClearance(
            context.actor,
            requiredParam(context.params, "id"),
            requiredParam(context.params, "clearance_code"),
            optionalString(body, "completedOn") ?? "2026-07-11"
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/clearances/{clearance_code}:deem",
      operationId: "g05.deemTransferClearance",
      protected: true,
      permission: "g05.transfer.clearance.deem",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          order: context.services.transfer.deemClearance(
            context.actor,
            requiredParam(context.params, "id"),
            requiredParam(context.params, "clearance_code"),
            optionalString(body, "deemedOn") ?? "2026-07-12"
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}:relieve-and-join",
      operationId: "g05.relieveAndJoinTransferOrder",
      protected: true,
      permission: "g05.transfer.join",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.transfer.relieveAndJoin(context.actor, requiredParam(context.params, "id"), {
            relievingDate: requiredString(body, "relievingDate"),
            joiningDate: requiredString(body, "joiningDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/representations",
      operationId: "g05.fileTransferRepresentation",
      protected: true,
      permission: "g05.transfer.representation.file",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          representation: context.services.transfer.fileRepresentation(context.actor, requiredParam(context.params, "id"), {
            grounds: requiredString(body, "grounds"),
            evidenceTitle: optionalString(body, "evidenceTitle"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/representations",
      operationId: "g05.listTransferRepresentations",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const representations = context.services.transfer.listRepresentations(context.scope);
        return ok({ items: representations.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/representations/{id}:retain",
      operationId: "g05.retainTransferOnRepresentation",
      protected: true,
      permission: "g05.transfer.representation.decide",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.transfer.retainOnRepresentation(context.actor, requiredParam(context.params, "id"), {
            decisionDate: requiredString(body, "decisionDate"),
            reason: requiredString(body, "reason"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}:cancel",
      operationId: "g05.cancelTransferOrder",
      protected: true,
      permission: "g05.transfer.cancel",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.transfer.cancel(context.actor, requiredParam(context.params, "id"), {
            cancellationDate: requiredString(body, "cancellationDate"),
            reason: requiredString(body, "reason"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}:deem-relieved",
      operationId: "g05.deemTransferRelieved",
      protected: true,
      permission: "g05.transfer.deem_relieved",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.transfer.deemRelieved(context.actor, requiredParam(context.params, "id"), {
            deemedRelievingDate: requiredString(body, "deemedRelievingDate"),
            reason: requiredString(body, "reason"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
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
