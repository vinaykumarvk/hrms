import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { PenaltyType } from "../modules/g09/disciplinaryService";
import { ph03Ids } from "../seed/ph03Seed";

export const g09RouteEvidence = {
  cases: "/api/v1/disciplinary/cases",
  charge: "/api/v1/disciplinary/cases/{id}:charge",
  inquiry: "/api/v1/disciplinary/cases/{id}:inquiry-report",
  penalty: "/api/v1/disciplinary/cases/{id}:penalty",
  appeal: "/api/v1/disciplinary/cases/{id}:appeal",
  markers: ["G09_AUTHORITY_COMPETENCE", "CHARGE_MEMO_SERVED", "INQUIRY_REPORT", "MAJOR_PENALTY", "APPEAL_DECIDED"],
};

export function registerG09Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases",
      operationId: "g09.openCase",
      protected: true,
      permission: "g09.case.open",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          disciplinaryCase: context.services.disciplinary.openCase(context.actor, {
            chargedEmployeeId: optionalString(body, "chargedEmployeeId") ?? ph03Ids.employee,
            disciplinaryAuthorityId: optionalString(body, "disciplinaryAuthorityId") ?? ph03Ids.manager,
            allegations: requiredString(body, "allegations"),
            confidential: optionalBoolean(body, "confidential"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:charge",
      operationId: "g09.serveChargeMemo",
      protected: true,
      permission: "g09.charge.serve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          disciplinaryCase: context.services.disciplinary.serveChargeMemo(context.actor, requiredParam(context.params, "id"), {
            articles: optionalStringArray(body, "articles") ?? ["Article I"],
            servedOn: requiredString(body, "servedOn"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:inquiry-report",
      operationId: "g09.recordInquiryReport",
      protected: true,
      permission: "g09.inquiry.report",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          disciplinaryCase: context.services.disciplinary.recordInquiryReport(context.actor, requiredParam(context.params, "id"), {
            findings: readFindings(body),
            reportDate: requiredString(body, "reportDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:penalty",
      operationId: "g09.imposePenalty",
      protected: true,
      permission: "g09.penalty.impose",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.disciplinary.imposePenalty(context.actor, requiredParam(context.params, "id"), {
            penaltyType: readPenaltyType(body),
            orderDate: requiredString(body, "orderDate"),
            reason: requiredString(body, "reason"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:appeal",
      operationId: "g09.decideAppeal",
      protected: true,
      permission: "g09.appeal.decide",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.disciplinary.decideAppeal(context.actor, requiredParam(context.params, "id"), {
            appellateAuthorityId: optionalString(body, "appellateAuthorityId") ?? "appellate-authority-001",
            decision: readAppealDecision(body),
            decidedOn: requiredString(body, "decidedOn"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/summary",
      operationId: "g09.summary",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok(context.services.disciplinary.summary(context.scope)),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function readPenaltyType(body: Record<string, unknown>): PenaltyType {
  const value = optionalString(body, "penaltyType") ?? "MAJOR_PENALTY";
  if (value !== "CENSURE" && value !== "MINOR_PENALTY" && value !== "MAJOR_PENALTY") {
    throw new Error(`Unsupported penalty type ${value}`);
  }
  return value;
}

function readFindings(body: Record<string, unknown>): "PROVED" | "NOT_PROVED" | "PARTLY_PROVED" {
  const value = optionalString(body, "findings") ?? "PROVED";
  if (value !== "PROVED" && value !== "NOT_PROVED" && value !== "PARTLY_PROVED") {
    throw new Error(`Unsupported findings ${value}`);
  }
  return value;
}

function readAppealDecision(body: Record<string, unknown>): "UPHELD" | "MODIFIED" | "SET_ASIDE" {
  const value = optionalString(body, "decision") ?? "UPHELD";
  if (value !== "UPHELD" && value !== "MODIFIED" && value !== "SET_ASIDE") {
    throw new Error(`Unsupported appeal decision ${value}`);
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
