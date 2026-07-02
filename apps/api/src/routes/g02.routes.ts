import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { PersonalDetailFieldCode } from "../modules/g02/personalDetailsService";

export const g02RouteEvidence = {
  base: "/api/v1/personal-details/change-requests",
  commit: "commit-through-G01",
  reversal: "reverse-through-G01",
  resolver: "REPORTING_CHAIN",
  evidenceDocs: "G13 evidence documents",
};

export function registerG02Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/personal-details/change-requests",
      operationId: "g02.createPersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.personalDetails.createRequest(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            fieldCode: readFieldCode(body),
            newValue: requiredString(body, "newValue"),
            reason: requiredString(body, "reason"),
            evidenceTitle: optionalString(body, "evidenceTitle"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/personal-details/change-requests",
      operationId: "g02.listPersonalDetailChangeRequests",
      protected: true,
      permission: "g02.change.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = context.services.personalDetails.list(context.scope);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    actionRoute("approve", "g02.change.approve", (context, requestId) => accepted({ request: context.services.personalDetails.approve(context.actor, requestId) })),
    actionRoute("reject", "g02.change.reject", (context, requestId) => accepted({ request: context.services.personalDetails.reject(context.actor, requestId) })),
    {
      method: "POST",
      path: "/api/v1/personal-details/change-requests/{id}:commit",
      operationId: "g02.commitPersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.commit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          request: context.services.personalDetails.commit(
            context.actor,
            requiredParam(context.params, "id"),
            requiredString({ key: context.idempotencyKey }, "key"),
            optionalString(body, "effectiveDate") ?? "2026-07-02"
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/personal-details/change-requests/{id}:reverse",
      operationId: "g02.reversePersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.reverse",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          request: context.services.personalDetails.reverse(
            context.actor,
            requiredParam(context.params, "id"),
            requiredString({ key: context.idempotencyKey }, "key"),
            optionalString(body, "effectiveDate") ?? "2026-07-03"
          ),
        });
      },
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function actionRoute(
  action: "approve" | "reject",
  permission: string,
  handler: (context: Parameters<RouteDefinition["handler"]>[0], requestId: string) => ReturnType<RouteDefinition["handler"]>
): RouteDefinition {
  return {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/{id}:${action}`,
    operationId: `g02.${action}PersonalDetailChangeRequest`,
    protected: true,
    permission,
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => handler(context, requiredParam(context.params, "id")),
  };
}

function readFieldCode(body: Record<string, unknown>): PersonalDetailFieldCode {
  const value = requiredString(body, "fieldCode");
  if (value === "displayName" || value === "pan" || value === "aadhaarMasked") {
    return value;
  }
  throw new Error(`Unsupported fieldCode ${value}`);
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
