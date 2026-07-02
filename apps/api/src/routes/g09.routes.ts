import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { PenaltyType } from "../modules/g09/disciplinaryService";
import { G09PenaltyType, PreliminaryInquiryRecommendation } from "../modules/g09/dueProcessRepository";
import { ph03Ids } from "../seed/ph03Seed";

export const g09RouteEvidence = {
  cases: "/api/v1/disciplinary/cases",
  charge: "/api/v1/disciplinary/cases/{id}:charge",
  inquiry: "/api/v1/disciplinary/cases/{id}:inquiry-report",
  penalty: "/api/v1/disciplinary/cases/{id}:penalty",
  appeal: "/api/v1/disciplinary/cases/{id}:appeal",
  // PH-08E natural-justice chain surfaces.
  preliminaryInquiry: "/api/v1/disciplinary/cases/{id}:preliminary-inquiry",
  suspend: "/api/v1/disciplinary/cases/{id}:suspend",
  showCause: "/api/v1/disciplinary/cases/{id}:show-cause",
  consultation: "/api/v1/disciplinary/cases/{id}:consultation",
  disagreementMemo: "/api/v1/disciplinary/cases/{id}:disagreement-memo",
  abate: "/api/v1/disciplinary/cases/{id}:abate",
  finaliseOrder: "/api/v1/disciplinary/cases/{id}:finalise-order",
  timelineVerify: "/api/v1/disciplinary/cases/{id}/timeline-verify",
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
    // ---------------------------------------------------------------------------------
    // PH-08E natural-justice chain (FR-G09-002/003/018/019/027/028)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:preliminary-inquiry",
      operationId: "g09.orderPreliminaryInquiry",
      protected: true,
      permission: "g09.preliminary-inquiry.order",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          preliminaryInquiry: context.services.disciplinary.orderPreliminaryInquiry(context.actor, requiredParam(context.params, "id"), {
            piOfficerId: requiredString(body, "piOfficerId"),
            orderedDate: requiredString(body, "orderedDate"),
            dueDate: requiredString(body, "dueDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/preliminary-inquiries/{id}:submit",
      operationId: "g09.submitPreliminaryInquiry",
      protected: true,
      permission: "g09.preliminary-inquiry.update",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          preliminaryInquiry: context.services.disciplinary.submitPreliminaryInquiry(context.actor, requiredParam(context.params, "id"), {
            findingsSummary: requiredString(body, "findingsSummary"),
            recommendation: readPiRecommendation(body),
            submittedAt: requiredString(body, "submittedAt"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:suspend",
      operationId: "g09.orderSuspension",
      protected: true,
      permission: "g09.suspension.order",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          suspension: context.services.disciplinary.orderSuspension(context.actor, requiredParam(context.params, "id"), {
            effectiveFrom: requiredString(body, "effectiveFrom"),
            subsistenceRatePct: optionalNumber(body, "subsistenceRatePct"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/suspensions/{id}:revise-subsistence",
      operationId: "g09.reviseSubsistenceRate",
      protected: true,
      permission: "g09.suspension.update",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          suspension: context.services.disciplinary.reviseSubsistenceRate(context.actor, requiredParam(context.params, "id"), {
            newRatePct: optionalNumber(body, "newRatePct") ?? 50,
            revisionDate: requiredString(body, "revisionDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:show-cause",
      operationId: "g09.issueShowCauseNotice",
      protected: true,
      permission: "g09.show-cause.issue",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          showCauseNotice: context.services.disciplinary.issueShowCauseNotice(context.actor, requiredParam(context.params, "id"), {
            proposedPenalties: readPenaltyItems(body, "proposedPenalties"),
            issuedDate: requiredString(body, "issuedDate"),
            responseDueDate: requiredString(body, "responseDueDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:consultation",
      operationId: "g09.requireConsultation",
      protected: true,
      permission: "g09.consultation.require",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          consultation: context.services.disciplinary.requireConsultation(context.actor, requiredParam(context.params, "id"), {
            consultationType: readConsultationType(body),
            isMandatory: optionalBoolean(body, "isMandatory"),
            requestedDate: optionalString(body, "requestedDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:disagreement-memo",
      operationId: "g09.recordDisagreementMemo",
      protected: true,
      permission: "g09.disagreement-memo.issue",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          disagreementMemo: context.services.disciplinary.recordDisagreementMemo(context.actor, requiredParam(context.params, "id"), {
            tentativeDisagreement: requiredString(body, "tentativeDisagreement"),
            articlesAffected: optionalStringArray(body, "articlesAffected"),
            servedDate: requiredString(body, "servedDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:abate",
      operationId: "g09.recordRespondentDeath",
      protected: true,
      permission: "g09.case.abate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          disciplinaryCase: context.services.disciplinary.recordRespondentDeath(context.actor, requiredParam(context.params, "id"), {
            deathDate: requiredString(body, "deathDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:finalise-order",
      operationId: "g09.finaliseOrder",
      protected: true,
      permission: "g09.order.finalise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.disciplinary.finaliseOrder(context.actor, requiredParam(context.params, "id"), {
            showCauseNoticeId: requiredString(body, "showCauseNoticeId"),
            penalties: readPenaltyItems(body, "penalties"),
            passedBy: requiredString(body, "passedBy"),
            orderDate: requiredString(body, "orderDate"),
            reasoningText: requiredString(body, "reasoningText"),
            proportionalityReasoning: requiredString(body, "proportionalityReasoning"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/timeline-verify",
      operationId: "g09.verifyCaseTimeline",
      protected: true,
      permission: "g09.timeline.verify",
      handler: (context) => ok(context.services.disciplinary.verifyCaseTimeline(context.actor, requiredParam(context.params, "id"))),
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

const G09_PENALTY_TYPES: G09PenaltyType[] = [
  "CENSURE",
  "WITHHOLD_INCREMENT",
  "WITHHOLD_PROMOTION",
  "RECOVERY",
  "REDUCTION_IN_RANK",
  "COMPULSORY_RETIREMENT",
  "REMOVAL",
  "DISMISSAL",
  "FINE",
  "WARNING",
];

/** Statutory penalty menu for the show-cause proposal (DI-4 subset ceiling) and the final order. */
function readPenaltyItems(body: Record<string, unknown>, field: string): G09PenaltyType[] {
  const values = optionalStringArray(body, field) ?? [];
  return values.map((value) => {
    if (!(G09_PENALTY_TYPES as string[]).includes(value)) {
      throw new Error(`Unsupported penalty ${value}`);
    }
    return value as G09PenaltyType;
  });
}

function readPiRecommendation(body: Record<string, unknown>): PreliminaryInquiryRecommendation {
  const value = optionalString(body, "recommendation") ?? "PROCEED_MAJOR";
  if (value !== "PROCEED_MAJOR" && value !== "PROCEED_MINOR" && value !== "DROP" && value !== "ADMIN_ADVICE") {
    throw new Error(`Unsupported preliminary inquiry recommendation ${value}`);
  }
  return value;
}

function readConsultationType(body: Record<string, unknown>): "UPSC" | "CVC_FIRST_STAGE" | "CVC_SECOND_STAGE" | "ICC" | "LEGAL" {
  const value = optionalString(body, "consultationType") ?? "UPSC";
  if (value !== "UPSC" && value !== "CVC_FIRST_STAGE" && value !== "CVC_SECOND_STAGE" && value !== "ICC" && value !== "LEGAL") {
    throw new Error(`Unsupported consultation type ${value}`);
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
