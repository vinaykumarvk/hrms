import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { DisciplinaryCase, MisconductCategory, PenaltyType, PenaltyOrder } from "../modules/g09/disciplinaryService";
import { G09PenaltyType, IccRoleType, PersonalHearing, PersonalHearingStage, PreliminaryInquiryRecommendation, ShowCauseNotice, SlaPauseReason } from "../modules/g09/dueProcessRepository";
import { ph03Ids } from "../seed/ph03Seed";

function toWireDisciplinaryCase(row: DisciplinaryCase): Omit<DisciplinaryCase, "tenantId" | "entityId" | "workflowInstanceId"> {
  const { tenantId, entityId, workflowInstanceId, ...rest } = row;
  return rest;
}

function toWireShowCauseNotice(row: ShowCauseNotice): Omit<ShowCauseNotice, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = row;
  return rest;
}

function toWirePersonalHearing(row: PersonalHearing): Omit<PersonalHearing, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = row;
  return rest;
}

function toWirePenaltyOrder(row: PenaltyOrder): Omit<PenaltyOrder, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = row;
  return rest;
}

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
  // PH-15F FR-G09-023/024/025 surfaces (inquiry_route ICC_POSH, personal_hearings, sla_pause_events).
  constituteIcc: "/api/v1/disciplinary/cases/{id}:constitute-icc",
  personalHearing: "/api/v1/disciplinary/cases/{id}:personal-hearing",
  personalHearingDecision: "/api/v1/disciplinary/personal-hearings/{id}:decision",
  slaPause: "/api/v1/disciplinary/cases/{id}/sla:pause",
  slaResume: "/api/v1/disciplinary/cases/{id}/sla:resume",
  slaPauses: "/api/v1/disciplinary/cases/{id}/sla/pauses",
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
            misconductCategory: readMisconductCategory(body),
            openedOn: optionalString(body, "openedOn"),
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
    // Self-service "view my disciplinary case status" (own cases only, self-or-override).
    {
      method: "GET",
      path: "/api/v1/disciplinary/employees/{id}/cases",
      operationId: "g09.listMyCases",
      protected: true,
      permission: "g09.case.read",
      handler: (context) =>
        ok({ items: context.services.disciplinary.listMyCases(context.actor, requiredParam(context.params, "id")).map(toWireDisciplinaryCase) }),
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/show-cause-notices",
      operationId: "g09.listMyShowCauseNotices",
      protected: true,
      permission: "g09.case.read",
      handler: (context) =>
        ok({ items: context.services.disciplinary.listMyShowCauseNotices(context.actor, requiredParam(context.params, "id")).map(toWireShowCauseNotice) }),
    },
    // PH-28B — case evidence-vault listing (consumed by the G09 evidence-vault UI, PH-27C).
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/evidence",
      operationId: "g09.listCaseEvidence",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ items: context.services.disciplinary.listCaseEvidence(context.actor, requiredParam(context.params, "id")), limit: 25, next_cursor: null }),
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
    // ---------------------------------------------------------------------------------
    // PH-15F FR-G09-023: ICC constitution on the ICC_POSH route (composition validated).
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:constitute-icc",
      operationId: "g09.constituteIcc",
      protected: true,
      permission: "g09.icc.constitute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          iccAppointments: context.services.disciplinary.constituteIcc(context.actor, requiredParam(context.params, "id"), {
            appointedDate: requiredString(body, "appointedDate"),
            members: readIccMembers(body),
          }),
        });
      },
    },
    // PH-15F FR-G09-025: personal hearings (request -> grant/deny-with-reason -> minutes).
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:personal-hearing",
      operationId: "g09.requestPersonalHearing",
      protected: true,
      permission: "g09.personal-hearing.request",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          personalHearing: toWirePersonalHearing(
            context.services.disciplinary.requestPersonalHearing(context.actor, requiredParam(context.params, "id"), {
              stage: readHearingStage(body),
              requestedOn: requiredString(body, "requestedOn"),
              showCauseNoticeId: optionalString(body, "showCauseNoticeId"),
            })
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/personal-hearings/{id}:decision",
      operationId: "g09.decidePersonalHearing",
      protected: true,
      permission: "g09.personal-hearing.decide",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          personalHearing: context.services.disciplinary.decidePersonalHearing(context.actor, requiredParam(context.params, "id"), {
            decision: readHearingDecision(body),
            decidedOn: requiredString(body, "decidedOn"),
            denialReason: optionalString(body, "denialReason"),
            scheduledDate: optionalString(body, "scheduledDate"),
            presidedBy: optionalString(body, "presidedBy"),
          }),
        });
      },
    },
    // PH-15F FR-G09-024: sla_pause_events pause/resume + ledger read.
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}/sla:pause",
      operationId: "g09.pauseSla",
      protected: true,
      permission: "g09.sla.pause",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          slaPause: context.services.disciplinary.pauseSla(context.actor, requiredParam(context.params, "id"), {
            stage: requiredString(body, "stage"),
            reason: readSlaPauseReason(body),
            pausedFrom: requiredString(body, "pausedFrom"),
            sourceRefId: optionalString(body, "sourceRefId"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}/sla:resume",
      operationId: "g09.resumeSla",
      protected: true,
      permission: "g09.sla.pause",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.disciplinary.resumeSla(context.actor, requiredParam(context.params, "id"), {
            stage: requiredString(body, "stage"),
            resumedAt: requiredString(body, "resumedAt"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/sla/pauses",
      operationId: "g09.listSlaPauses",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ slaPauses: context.services.disciplinary.listSlaPauses(context.scope, requiredParam(context.params, "id")) }),
    },
    // PH-36A FR-G09-023 BR-2: POSH conciliation (opted by complainant, before inquiry, never monetary).
    {
      method: "POST",
      path: "/api/v1/disciplinary/cases/{id}:conciliation",
      operationId: "g09.recordConciliation",
      protected: true,
      permission: "g09.conciliation.record",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.disciplinary.recordConciliation(context.actor, requiredParam(context.params, "id"), {
            opted: optionalBoolean(body, "opted") ?? true,
            outcome: (requiredString(body, "outcome") as "SETTLED" | "FAILED"),
            settlementBasis: requiredString(body, "settlementBasis"),
            recordedOn: requiredString(body, "recordedOn"),
            summary: optionalString(body, "summary") ?? "",
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/conciliations",
      operationId: "g09.listConciliations",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ items: context.services.disciplinary.listConciliations(context.scope, requiredParam(context.params, "id")) }),
    },
    // PH-53A — G09 suspension review + show-cause response + consultation close/waive + hearing minutes +
    // case reads (timeline / ICC appointments / personal hearings / penalty order). Tested disciplinary backing.
    {
      method: "POST",
      path: "/api/v1/disciplinary/suspensions/{id}:review",
      operationId: "g09.reviewSuspension",
      protected: true,
      permission: "g09.suspension.order",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          suspension: context.services.disciplinary.reviewSuspension(context.actor, requiredParam(context.params, "id"), {
            outcome: requiredString(body, "outcome") as "CONTINUE" | "REVOKE",
            reviewDate: requiredString(body, "reviewDate"),
            reason: optionalString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/show-cause-notices/{id}:respond",
      operationId: "g09.respondToShowCause",
      protected: true,
      permission: "g09.show-cause.respond",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          notice: toWireShowCauseNotice(
            context.services.disciplinary.respondToShowCause(context.actor, requiredParam(context.params, "id"), {
              representationText: requiredString(body, "representationText"),
              respondedAt: requiredString(body, "respondedAt"),
            })
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/consultations/{id}:close",
      operationId: "g09.closeConsultation",
      protected: true,
      permission: "g09.consultation.require",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          consultation: context.services.disciplinary.closeConsultation(context.actor, requiredParam(context.params, "id"), {
            receivedDate: requiredString(body, "receivedDate"),
            adviceSummary: optionalString(body, "adviceSummary"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/consultations/{id}:waive",
      operationId: "g09.waiveConsultation",
      protected: true,
      permission: "g09.consultation.require",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          consultation: context.services.disciplinary.waiveConsultation(context.actor, requiredParam(context.params, "id"), {
            waiverReason: requiredString(body, "waiverReason"),
            waivedOn: requiredString(body, "waivedOn"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/disciplinary/personal-hearings/{id}:minutes",
      operationId: "g09.recordPersonalHearingMinutes",
      protected: true,
      permission: "g09.personal-hearing.request",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          personalHearing: context.services.disciplinary.recordPersonalHearingMinutes(context.actor, requiredParam(context.params, "id"), {
            heldDate: requiredString(body, "heldDate"),
            minutesText: requiredString(body, "minutesText"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/case-timeline",
      operationId: "g09.listCaseTimeline",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ items: context.services.disciplinary.listCaseTimeline(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/icc-appointments",
      operationId: "g09.listIccAppointments",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ items: context.services.disciplinary.listIccAppointments(context.scope, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/cases/{id}/personal-hearings",
      operationId: "g09.listPersonalHearings",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ items: context.services.disciplinary.listPersonalHearings(context.actor, requiredParam(context.params, "id")).map(toWirePersonalHearing) }),
    },
    {
      method: "GET",
      path: "/api/v1/disciplinary/penalty-orders/{id}",
      operationId: "g09.getPenaltyOrder",
      protected: true,
      permission: "g09.case.read",
      handler: (context) => ok({ penaltyOrder: toWirePenaltyOrder(context.services.disciplinary.getPenaltyOrder(context.actor, requiredParam(context.params, "id"))) }),
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

function readMisconductCategory(body: Record<string, unknown>): MisconductCategory | undefined {
  const value = optionalString(body, "misconductCategory");
  if (value === undefined) {
    return undefined;
  }
  if (value !== "GENERAL" && value !== "HARASSMENT" && value !== "CORRUPTION" && value !== "INSUBORDINATION" && value !== "ABSENCE") {
    throw new Error(`Unsupported misconduct category ${value}`);
  }
  return value;
}

/** FR-G09-023 ICC member payloads (role, internal id or external name, composition attributes). */
function readIccMembers(body: Record<string, unknown>): Array<{
  roleType: IccRoleType;
  officerId?: string;
  externalName?: string;
  isWoman: boolean;
  isSeniorLevel?: boolean;
}> {
  const value = body.members;
  if (!Array.isArray(value)) {
    throw new Error("members must be an array of ICC appointments");
  }
  return value.map((item) => {
    const record = readBodyRecord(item);
    const roleType = requiredString(record, "roleType");
    if (roleType !== "ICC_PRESIDING" && roleType !== "ICC_MEMBER" && roleType !== "ICC_EXTERNAL_MEMBER") {
      throw new Error(`Unsupported ICC role ${roleType}`);
    }
    return {
      roleType,
      officerId: optionalString(record, "officerId"),
      externalName: optionalString(record, "externalName"),
      isWoman: optionalBoolean(record, "isWoman") ?? false,
      isSeniorLevel: optionalBoolean(record, "isSeniorLevel"),
    };
  });
}

function readHearingStage(body: Record<string, unknown>): PersonalHearingStage {
  const value = optionalString(body, "stage") ?? "SHOW_CAUSE";
  if (value !== "SHOW_CAUSE" && value !== "APPEAL") {
    throw new Error(`Unsupported personal-hearing stage ${value}`);
  }
  return value;
}

function readHearingDecision(body: Record<string, unknown>): "GRANT" | "DENY" {
  const value = requiredString(body, "decision");
  if (value !== "GRANT" && value !== "DENY") {
    throw new Error(`Unsupported personal-hearing decision ${value}`);
  }
  return value;
}

function readSlaPauseReason(body: Record<string, unknown>): SlaPauseReason {
  const value = requiredString(body, "reason");
  if (value !== "STAY" && value !== "REMIT" && value !== "CONDONATION" && value !== "CONSULTATION" && value !== "CRIMINAL_STAY") {
    throw new Error(`Unsupported SLA pause reason ${value}`);
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
