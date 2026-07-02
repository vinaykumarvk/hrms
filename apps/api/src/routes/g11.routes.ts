import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { PensionScheme } from "../modules/g11/pensionService";
import { ph03Ids } from "../seed/ph03Seed";

export const g11RouteEvidence = {
  cases: "/api/v1/pension/cases",
  verifyService: "/api/v1/pension/cases/{id}:verify-service",
  compute: "/api/v1/pension/cases/{id}:compute",
  sanction: "/api/v1/pension/cases/{id}:sanction",
  issuePpo: "/api/v1/pension/cases/{id}:issue-ppo",
  markers: ["SR_VERIFICATION_GATE", "QUALIFYING_SERVICE_LOCKED", "PENSION_CALC_TRACE", "PPO_ISSUED", "G11_SR_POSTED"],
};

export function registerG11Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/pension/cases",
      operationId: "g11.createCase",
      protected: true,
      permission: "g11.case.create",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          pensionCase: context.services.pension.createCase(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            separationDate: requiredString(body, "separationDate"),
            scheme: readPensionScheme(body),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:verify-service",
      operationId: "g11.verifyService",
      protected: true,
      permission: "g11.service.verify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          pensionCase: context.services.pension.verifyService(context.actor, requiredParam(context.params, "id"), {
            totalServiceMonths: optionalNumber(body, "totalServiceMonths") ?? 360,
            penaltyExclusionMonths: optionalNumber(body, "penaltyExclusionMonths"),
            srCertified: readBoolean(body, "srCertified", true),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:compute",
      operationId: "g11.computeBenefits",
      protected: true,
      permission: "g11.pension.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ pensionCase: context.services.pension.computeBenefits(context.actor, requiredParam(context.params, "id"), { ruleVersion: optionalString(body, "ruleVersion") ?? "PENSION-RULE-2026-01" }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:sanction",
      operationId: "g11.sanction",
      protected: true,
      permission: "g11.pension.sanction",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ pensionCase: context.services.pension.sanction(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:issue-ppo",
      operationId: "g11.issuePpo",
      protected: true,
      permission: "g11.ppo.issue",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({
          pensionCase: context.services.pension.issuePpo(context.actor, requiredParam(context.params, "id"), {
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          }),
        }),
    },
    {
      method: "GET",
      path: "/api/v1/pension/summary",
      operationId: "g11.summary",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok(context.services.pension.summary(context.scope)),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function readPensionScheme(body: Record<string, unknown>): PensionScheme {
  const value = optionalString(body, "scheme") ?? "OPS";
  if (value === "OPS" || value === "NPS" || value === "UPS") {
    return value;
  }
  throw new Error(`Unsupported pension scheme ${value}`);
}

function readBoolean(body: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = body[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
