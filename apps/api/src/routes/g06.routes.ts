import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";
import { DpcPanelMember, SenioritySeed } from "../modules/g06/promotionService";
import { LegalForum, LegalLinkedEntityType, MacpClockEffect, ReservationCategory, RotationMethod, RotationStartSlot } from "../modules/g06/promotionDepthRepository";

export const g06RouteEvidence = {
  seniorityLists: "/api/v1/promotions/seniority-lists",
  promotionCases: "/api/v1/promotions/cases",
  dpc: "/api/v1/promotions/cases/{id}:hold-dpc",
  effectOrder: "/api/v1/promotions/orders/{id}:effect",
  declineOrder: "/api/v1/promotions/orders/{id}:decline",
  rosters: "/api/v1/promotions/rosters",
  legalCaseLinks: "/api/v1/legal-case-links",
  macp: "/api/v1/promotions/macp",
  // PH-15F FR-PPP-020 surfaces (seniority_quota_rules + rota-quota combined construction + trace).
  seniorityQuotaRules: "/api/v1/promotions/seniority-quota-rules",
  constructCombined: "/api/v1/promotions/combined-seniority:construct",
  rotationTrace: "/api/v1/promotions/combined-seniority/{id}/rotation-trace",
  /** BRD §9.4 domain codes thrown by the G06 surface (no marker-string indirection). */
  domainCodes: [
    "SENIORITY_LIST_NOT_FINAL",
    "QUORUM_NOT_MET",
    "PANEL_CONFLICT_OF_INTEREST",
    "APAR_NOT_USABLE",
    "OWN_MERIT_MIGRATION_REQUIRED",
    "ROSTER_POINT_OCCUPIED",
    "ROSTER_CATEGORY_MISMATCH",
    "EMPLOYEE_DEBARRED",
    "ENTITY_SUB_JUDICE",
    "STREAM_TAG_MISSING",
    "QUOTA_RULE_INVALID",
  ],
};

export function registerG06Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/promotions/seniority-lists",
      operationId: "g06.createSeniorityList",
      protected: true,
      permission: "g06.seniority.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          seniorityList: context.services.promotion.createSeniorityList(context.actor, {
            cadreId: optionalString(body, "cadreId") ?? ph03Ids.cadreRevenue,
            effectiveDate: requiredString(body, "effectiveDate"),
            entries: readSeniorityEntries(body),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/seniority-lists/{id}:publish",
      operationId: "g06.publishSeniorityList",
      protected: true,
      permission: "g06.seniority.publish",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ seniorityList: context.services.promotion.publishSeniorityList(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/seniority-lists/{id}:finalise",
      operationId: "g06.finaliseSeniorityList",
      protected: true,
      permission: "g06.seniority.finalise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ seniorityList: context.services.promotion.finaliseSeniorityList(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/cases",
      operationId: "g06.createPromotionCase",
      protected: true,
      permission: "g06.promotion.case.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          promotionCase: context.services.promotion.createPromotionCase(context.actor, {
            seniorityListId: requiredString(body, "seniorityListId"),
            vacancies: optionalNumber(body, "vacancies") ?? 1,
            fromDesignation: optionalString(body, "fromDesignation") ?? "Assistant Section Officer",
            toDesignation: optionalString(body, "toDesignation") ?? "Section Officer",
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/cases/{id}:hold-dpc",
      operationId: "g06.holdDpc",
      protected: true,
      permission: "g06.dpc.hold",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          promotionCase: context.services.promotion.holdDpc(context.actor, requiredParam(context.params, "id"), {
            panelMembers: readPanelMembers(body),
            recusedEmployeeIds: optionalStringArray(body, "recusedEmployeeIds"),
            quorumRequired: optionalNumber(body, "quorumRequired"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/cases/{id}:issue-orders",
      operationId: "g06.issuePromotionOrders",
      protected: true,
      permission: "g06.promotion.order.issue",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ orders: context.services.promotion.issuePromotionOrders(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/orders/{id}:effect",
      operationId: "g06.effectPromotionOrder",
      protected: true,
      permission: "g06.promotion.order.effect",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.promotion.effectPromotionOrder(context.actor, requiredParam(context.params, "id"), {
            effectDate: requiredString(body, "effectDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/macp",
      operationId: "g06.effectMacp",
      protected: true,
      permission: "g06.macp.effect",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.promotion.effectMacp(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            level: requiredString(body, "level"),
            dueDate: requiredString(body, "dueDate"),
            effectDate: requiredString(body, "effectDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/orders/{id}:decline",
      operationId: "g06.declinePromotionOrder",
      protected: true,
      permission: "g06.promotion.order.effect",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.promotion.declinePromotionOrder(context.actor, requiredParam(context.params, "id"), {
            refusalDate: requiredString(body, "refusalDate"),
            refusalReason: optionalString(body, "refusalReason"),
            debarmentMonths: optionalNumber(body, "debarmentMonths"),
            macpClockEffect: optionalString(body, "macpClockEffect") as MacpClockEffect | undefined,
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/rosters",
      operationId: "g06.createReservationRoster",
      protected: true,
      permission: "g06.roster.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.promotion.createReservationRoster(context.actor, {
            rosterNo: requiredString(body, "rosterNo"),
            cadreId: optionalString(body, "cadreId") ?? ph03Ids.cadreRevenue,
            gradeDesignationId: requiredString(body, "gradeDesignationId"),
            enablingProvisionRef: optionalString(body, "enablingProvisionRef"),
            quantifiableDataDocId: optionalString(body, "quantifiableDataDocId"),
            approverActorId: requiredString(body, "approverActorId"),
            points: readRosterPoints(body),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/rosters/{id}/points/{pointNumber}:fill",
      operationId: "g06.fillRosterPoint",
      protected: true,
      permission: "g06.roster.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          rosterPoint: context.services.promotion.fillRosterPoint(context.actor, requiredParam(context.params, "id"), {
            pointNumber: Number.parseInt(requiredParam(context.params, "pointNumber"), 10),
            employeeId: requiredString(body, "employeeId"),
            candidateCategory: requiredString(body, "candidateCategory") as ReservationCategory,
            selectedOnOwnMerit: optionalBoolean(body, "selectedOnOwnMerit"),
            promotionCaseId: optionalString(body, "promotionCaseId"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/promotions/rosters/{id}/compliance",
      operationId: "g06.getRosterCompliance",
      protected: true,
      permission: "g06.promotion.read",
      handler: (context) => ok(context.services.promotion.getRosterCompliance(context.scope, requiredParam(context.params, "id"))),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/probation-records",
      operationId: "g06.listProbationRecords",
      protected: true,
      permission: "g06.promotion.read",
      handler: (context) =>
        ok({ probationRecords: context.services.promotion.listProbationRecords(context.scope, optionalString(context.request.query ?? {}, "employeeId") ?? ph03Ids.employee) }),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/refusals",
      operationId: "g06.listPromotionRefusals",
      protected: true,
      permission: "g06.promotion.read",
      handler: (context) =>
        ok({ refusals: context.services.promotion.listPromotionRefusals(context.scope, optionalString(context.request.query ?? {}, "employeeId") ?? ph03Ids.employee) }),
    },
    {
      method: "POST",
      path: "/api/v1/legal-case-links",
      operationId: "g06.attachLegalCaseLink",
      protected: true,
      permission: "g06.legal.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          legalCaseLink: context.services.promotion.attachLegalCaseLink(context.actor, {
            linkedEntityType: requiredString(body, "linkedEntityType") as LegalLinkedEntityType,
            linkedEntityRefId: requiredString(body, "linkedEntityRefId"),
            forum: requiredString(body, "forum") as LegalForum,
            caseReference: requiredString(body, "caseReference"),
            petitioner: optionalString(body, "petitioner"),
            interimStay: optionalBoolean(body, "interimStay"),
            stayFromDate: optionalString(body, "stayFromDate"),
            subjectToOutcome: optionalBoolean(body, "subjectToOutcome"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/legal-case-links/{id}:vacate-stay",
      operationId: "g06.vacateInterimStay",
      protected: true,
      permission: "g06.legal.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          legalCaseLink: context.services.promotion.vacateInterimStay(context.actor, requiredParam(context.params, "id"), {
            stayToDate: requiredString(body, "stayToDate"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/promotions/summary",
      operationId: "g06.summary",
      protected: true,
      permission: "g06.promotion.read",
      handler: (context) => ok(context.services.promotion.summary(context.scope)),
    },
    // ---------------------------------------------------------------------------------
    // PH-15F FR-PPP-020: seniority_quota_rules + multi-stream rota-quota construction.
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/promotions/seniority-quota-rules",
      operationId: "g06.defineSeniorityQuotaRule",
      protected: true,
      permission: "g06.seniority.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          seniorityQuotaRule: context.services.promotion.defineSeniorityQuotaRule(context.actor, {
            ruleCode: requiredString(body, "ruleCode"),
            cadreId: optionalString(body, "cadreId") ?? ph03Ids.cadreRevenue,
            gradeDesignationId: requiredString(body, "gradeDesignationId"),
            drQuotaRatio: optionalNumber(body, "drQuotaRatio") ?? 1,
            promoteeQuotaRatio: optionalNumber(body, "promoteeQuotaRatio") ?? 1,
            ldceQuotaRatio: optionalNumber(body, "ldceQuotaRatio"),
            rotationMethod: (optionalString(body, "rotationMethod") ?? "ROTA_QUOTA") as RotationMethod,
            rotationStartSlot: optionalString(body, "rotationStartSlot") as RotationStartSlot | undefined,
            unfilledQuotaCarryForward: optionalBoolean(body, "unfilledQuotaCarryForward"),
            policyReference: optionalString(body, "policyReference"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/combined-seniority:construct",
      operationId: "g06.constructCombinedSeniority",
      protected: true,
      permission: "g06.seniority.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          construction: context.services.promotion.constructCombinedSeniority(context.actor, {
            quotaRuleId: requiredString(body, "quotaRuleId"),
            cadreId: optionalString(body, "cadreId"),
            population: readQuotaPopulation(body),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/promotions/combined-seniority/{id}/rotation-trace",
      operationId: "g06.getRotationTrace",
      protected: true,
      permission: "g06.promotion.read",
      handler: (context) => ok(context.services.promotion.getRotationTrace(context.scope, requiredParam(context.params, "id"))),
    },
    // PH-32A — G06 career-path/succession + correction cascade (route exposure).
    {
      method: "POST",
      path: "/api/v1/promotions/career-paths",
      operationId: "g06.defineCareerPath",
      protected: true,
      permission: "g06.careerpath.define",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          careerPath: context.services.careerSuccession.defineCareerPath(context.actor, {
            pathCode: requiredString(body, "pathCode"),
            name: requiredString(body, "name"),
            stages: Array.isArray(body.stages) ? (body.stages as Array<{ stageNo: number; gradeDesignationId: string; typicalYears: number }>) : [],
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/seniority-lists:finalise",
      operationId: "g06.finaliseSeniorityList",
      protected: true,
      permission: "g06.seniority.finalise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          list: context.services.correctionCascade.finaliseList(context.actor, {
            listCode: requiredString(body, "listCode"),
            entries: Array.isArray(body.entries) ? (body.entries as Array<{ employeeId: string; appointmentDate: string; serviceNo: string }>) : [],
          }),
        });
      },
    },
    // PH-35C FR-008 — sealed-cover register (backs the PH-34B sealed-cover review UI).
    {
      method: "GET",
      path: "/api/v1/promotions/sealed-covers",
      operationId: "g06.listSealedCovers",
      protected: true,
      permission: "g06.sealedcover.read",
      handler: (context) =>
        ok({ items: context.services.sealedCover.listSealedCovers(context.scope) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/sealed-covers",
      operationId: "g06.placeSealedCover",
      protected: true,
      permission: "g06.sealedcover.place",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          sealedCover: context.services.sealedCover.placeSealedCover(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            reason: requiredString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/sealed-covers/{id}:release",
      operationId: "g06.releaseSealedCover",
      protected: true,
      permission: "g06.sealedcover.release",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return ok({
          sealedCover: context.services.sealedCover.releaseSealedCover(
            context.actor,
            requiredParam(context.params, "id"),
            { reason: requiredString(body, "reason") }
          ),
        });
      },
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function readSeniorityEntries(body: Record<string, unknown>): SenioritySeed[] {
  const value = body.entries;
  if (!Array.isArray(value)) {
    return [
      { employeeId: ph03Ids.manager, serviceNo: "GOV-100245", appointmentDate: "2018-01-01" },
      { employeeId: ph03Ids.employee, serviceNo: "GOV-100246", appointmentDate: "2018-01-01" },
    ];
  }
  return value.map((item) => {
    const record = readBodyRecord(item);
    return {
      employeeId: requiredString(record, "employeeId"),
      serviceNo: requiredString(record, "serviceNo"),
      appointmentDate: requiredString(record, "appointmentDate"),
      dateOfBirth: optionalString(record, "dateOfBirth"),
    };
  });
}

function readPanelMembers(body: Record<string, unknown>): DpcPanelMember[] {
  const value = body.panelMembers;
  if (!Array.isArray(value)) {
    return [
      { employeeId: ph03Ids.manager, role: "CHAIRPERSON" },
      { externalName: "External PSC Nominee", role: "EXPERT" },
    ];
  }
  return value.map((item) => {
    const record = readBodyRecord(item);
    return {
      employeeId: optionalString(record, "employeeId"),
      externalName: optionalString(record, "externalName"),
      role: requiredString(record, "role"),
    };
  });
}

function readRosterPoints(body: Record<string, unknown>): Array<{ pointNumber: number; reservedFor: ReservationCategory }> {
  const value = body.points;
  if (!Array.isArray(value)) {
    return [
      { pointNumber: 1, reservedFor: "GEN" },
      { pointNumber: 2, reservedFor: "SC" },
    ];
  }
  return value.map((item) => {
    const record = readBodyRecord(item);
    return {
      pointNumber: optionalNumber(record, "pointNumber") ?? 1,
      reservedFor: requiredString(record, "reservedFor") as ReservationCategory,
    };
  });
}

/** FR-PPP-020 population entries — the stream tag is validated by the service (STREAM_TAG_MISSING). */
function readQuotaPopulation(body: Record<string, unknown>): Array<{ employeeId: string; recruitmentStream?: string; streamSeniorityNo?: number }> {
  const value = body.population;
  if (!Array.isArray(value)) {
    throw new Error("population must be an array of stream-tagged entries");
  }
  return value.map((item) => {
    const record = readBodyRecord(item);
    return {
      employeeId: requiredString(record, "employeeId"),
      recruitmentStream: optionalString(record, "recruitmentStream"),
      streamSeniorityNo: optionalNumber(record, "streamSeniorityNo"),
    };
  });
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
