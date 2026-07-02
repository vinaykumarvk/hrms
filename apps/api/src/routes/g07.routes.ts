import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";

export const g07RouteEvidence = {
  sessions: "/api/v1/training/sessions",
  nominations: "/api/v1/training/nominations",
  approve: "/api/v1/training/nominations/{id}:approve",
  complete: "/api/v1/training/nominations/{id}:complete",
  workflow: "WF-G07-NOMINATION",
  srMarker: "TRAINING_CERTIFICATION_POSTED",
};

export function registerG07Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/training/sessions",
      operationId: "g07.createSession",
      protected: true,
      permission: "g07.training.session.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          session: context.services.training.createSession(context.actor, {
            programCode: requiredString(body, "programCode"),
            title: requiredString(body, "title"),
            capacity: optionalNumber(body, "capacity") ?? 1,
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/nominations",
      operationId: "g07.nominate",
      protected: true,
      permission: "g07.nomination.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          nomination: context.services.training.nominate(context.actor, {
            sessionId: requiredString(body, "sessionId"),
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/nominations/{id}:approve",
      operationId: "g07.approveNomination",
      protected: true,
      permission: "g07.nomination.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ nomination: context.services.training.approveNomination(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/nominations/{id}:complete",
      operationId: "g07.completeNomination",
      protected: true,
      permission: "g07.nomination.complete",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.training.completeNomination(context.actor, requiredParam(context.params, "id"), {
            passed: optionalBoolean(body, "passed") ?? true,
            significantForSr: optionalBoolean(body, "significantForSr") ?? false,
            completionDate: requiredString(body, "completionDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/training/summary",
      operationId: "g07.summary",
      protected: true,
      permission: "g07.training.read",
      handler: (context) => ok(context.services.training.summary(context.scope)),
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
