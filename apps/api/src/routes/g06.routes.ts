import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";
import { DpcPanelMember, PromotionOrder, QualifyingServiceComputeInput, SanctionedPostInput, SenioritySeed } from "../modules/g06/promotionService";
import { SuccessionReadiness } from "../modules/g06/careerSuccessionService";
import { LegalForum, LegalLinkedEntityType, MacpClockEffect, ProbationRecord, PromotionRefusal, ReservationCategory, RotationMethod, RotationStartSlot } from "../modules/g06/promotionDepthRepository";
import { SealedCoverCase } from "../modules/g06/sealedCoverService";

function toWirePromotionOrder(order: PromotionOrder): Omit<PromotionOrder, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = order;
  return rest;
}

function toWireProbationRecord(record: ProbationRecord): Omit<ProbationRecord, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = record;
  return rest;
}

function toWirePromotionRefusal(refusal: PromotionRefusal): Omit<PromotionRefusal, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = refusal;
  return rest;
}

function toWireSealedCover(cover: SealedCoverCase): Omit<SealedCoverCase, "tenantId" | "entityId"> {
  const { tenantId, entityId, ...rest } = cover;
  return rest;
}

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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          seniorityList: await context.services.promotion.createSeniorityList(context.actor, {
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
      handler: async (context) => accepted({ seniorityList: await context.services.promotion.publishSeniorityList(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/seniority-lists/{id}:finalise",
      operationId: "g06.finaliseSeniorityList",
      protected: true,
      permission: "g06.seniority.finalise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => accepted({ seniorityList: await context.services.promotion.finaliseSeniorityList(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/cases",
      operationId: "g06.createPromotionCase",
      protected: true,
      permission: "g06.promotion.case.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          promotionCase: await context.services.promotion.createPromotionCase(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          promotionCase: await context.services.promotion.holdDpc(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => accepted({ orders: await context.services.promotion.issuePromotionOrders(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/orders/{id}:effect",
      operationId: "g06.effectPromotionOrder",
      protected: true,
      permission: "g06.promotion.order.effect",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.promotion.effectPromotionOrder(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.promotion.effectMacp(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.promotion.declinePromotionOrder(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          await context.services.promotion.createReservationRoster(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          rosterPoint: await context.services.promotion.fillRosterPoint(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => ok(await context.services.promotion.getRosterCompliance(context.scope, requiredParam(context.params, "id"))),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/probation-records",
      operationId: "g06.listProbationRecords",
      protected: true,
      permission: "g06.promotion.read",
      handler: async (context) =>
        ok({
          probationRecords: await context.services.promotion
            .listProbationRecords(context.actor, optionalString(context.request.query ?? {}, "employeeId") ?? ph03Ids.employee)
            .map(toWireProbationRecord),
        }),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/refusals",
      operationId: "g06.listPromotionRefusals",
      protected: true,
      permission: "g06.promotion.read",
      handler: async (context) =>
        ok({
          refusals: await context.services.promotion
            .listPromotionRefusals(context.actor, optionalString(context.request.query ?? {}, "employeeId") ?? ph03Ids.employee)
            .map(toWirePromotionRefusal),
        }),
    },
    {
      method: "POST",
      path: "/api/v1/legal-case-links",
      operationId: "g06.attachLegalCaseLink",
      protected: true,
      permission: "g06.legal.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          legalCaseLink: await context.services.promotion.attachLegalCaseLink(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          legalCaseLink: await context.services.promotion.vacateInterimStay(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => ok(await context.services.promotion.summary(context.scope)),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          seniorityQuotaRule: await context.services.promotion.defineSeniorityQuotaRule(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          construction: await context.services.promotion.constructCombinedSeniority(context.actor, {
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
      handler: async (context) => ok(await context.services.promotion.getRotationTrace(context.scope, requiredParam(context.params, "id"))),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          careerPath: await context.services.careerSuccession.defineCareerPath(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          list: await context.services.correctionCascade.finaliseList(context.actor, {
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
      handler: async (context) =>
        ok({ items: await context.services.sealedCover.listSealedCovers(context.actor).map(toWireSealedCover) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/sealed-covers",
      operationId: "g06.placeSealedCover",
      protected: true,
      permission: "g06.sealedcover.place",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          sealedCover: await context.services.sealedCover.placeSealedCover(context.actor, {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return ok({
          sealedCover: await context.services.sealedCover.releaseSealedCover(
            context.actor,
            requiredParam(context.params, "id"),
            { reason: requiredString(body, "reason") }
          ),
        });
      },
    },
    // PH-52A — FR-015 sanctioned-posts establishment lifecycle (register/revise with maker!=checker;
    // reconcile with STRENGTH_INCONSISTENT guard; reads + vacancy computation). Tested promotion backing.
    {
      method: "POST",
      path: "/api/v1/promotions/sanctioned-posts",
      operationId: "g06.registerSanctionedPost",
      protected: true,
      permission: "g06.establishment.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({ sanctionedPost: await context.services.promotion.registerSanctionedPost(context.actor, readSanctionedPostInput(body)) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/sanctioned-posts/{id}:revise",
      operationId: "g06.reviseSanctionedPost",
      protected: true,
      permission: "g06.establishment.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          sanctionedPost: await context.services.promotion.reviseSanctionedPost(context.actor, requiredParam(context.params, "id"), {
            approverActorId: requiredString(body, "approverActorId"),
            sanctionedStrength: optionalNumber(body, "sanctionedStrength"),
            filledCount: optionalNumber(body, "filledCount"),
            drQuotaPct: optionalNumber(body, "drQuotaPct"),
            promotionQuotaPct: optionalNumber(body, "promotionQuotaPct"),
            ldceQuotaPct: optionalNumber(body, "ldceQuotaPct"),
            anticipatedVacancies: optionalNumber(body, "anticipatedVacancies"),
            carriedForwardVacancies: optionalNumber(body, "carriedForwardVacancies"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/sanctioned-posts/{id}:reconcile",
      operationId: "g06.reconcileSanctionedPost",
      protected: true,
      permission: "g06.establishment.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ sanctionedPost: await context.services.promotion.reconcileSanctionedPost(context.actor, requiredParam(context.params, "id"), { filledCount: readRequiredNumber(body, "filledCount") }) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/promotions/sanctioned-posts/{id}",
      operationId: "g06.getSanctionedPost",
      protected: true,
      permission: "g06.establishment.read",
      handler: async (context) => ok({ sanctionedPost: await context.services.promotion.getSanctionedPost(context.scope, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/sanctioned-posts",
      operationId: "g06.listSanctionedPosts",
      protected: true,
      permission: "g06.establishment.read",
      handler: async (context) => ok({ items: await context.services.promotion.listSanctionedPosts(context.scope) }),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/sanctioned-posts/{id}/vacancy",
      operationId: "g06.getVacancyComputation",
      protected: true,
      permission: "g06.establishment.read",
      handler: async (context) => ok(await context.services.promotion.getVacancyComputation(context.scope, requiredParam(context.params, "id"))),
    },
    // PH-59A — G06 succession-planning + qualifying-service route exposure (tested careerSuccession /
    // promotion backing).
    {
      method: "POST",
      path: "/api/v1/promotions/succession-plans",
      operationId: "g06.createSuccessionPlan",
      protected: true,
      permission: "g06.succession.plan",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({ plan: await context.services.careerSuccession.createSuccessionPlan(context.actor, { positionId: requiredString(body, "positionId"), incumbentEmployeeId: optionalString(body, "incumbentEmployeeId") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/promotions/succession-plans/{id}:add-candidate",
      operationId: "g06.addSuccessionCandidate",
      protected: true,
      permission: "g06.succession.candidate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          plan: await context.services.careerSuccession.addSuccessionCandidate(context.actor, requiredParam(context.params, "id"), {
            employeeId: requiredString(body, "employeeId"),
            rank: optionalNumber(body, "rank") ?? 1,
            readiness: requiredString(body, "readiness") as SuccessionReadiness,
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/promotions/succession-plans/{id}",
      operationId: "g06.getSuccessionPlan",
      protected: true,
      permission: "g06.succession.read",
      handler: async (context) => ok({ plan: await context.services.careerSuccession.getSuccessionPlan(context.scope, requiredParam(context.params, "id")) ?? null }),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/career-paths/{id}",
      operationId: "g06.getCareerPath",
      protected: true,
      permission: "g06.succession.read",
      handler: async (context) => ok({ careerPath: await context.services.careerSuccession.getCareerPath(context.scope, requiredParam(context.params, "id")) ?? null }),
    },
    {
      method: "GET",
      path: "/api/v1/promotions/orders",
      operationId: "g06.listPromotionOrders",
      protected: true,
      permission: "g06.promotion.read",
      handler: async (context) => ok({ items: await context.services.promotion.listPromotionOrders(context.actor).map(toWirePromotionOrder) }),
    },
    {
      method: "POST",
      path: "/api/v1/promotions/qualifying-service:compute",
      operationId: "g06.computeQualifyingService",
      protected: true,
      permission: "g06.qsl.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const input: QualifyingServiceComputeInput = {
          employeeId: requiredString(body, "employeeId"),
          gradeDesignationId: requiredString(body, "gradeDesignationId"),
          asOfDate: requiredString(body, "asOfDate"),
          grossServiceDays: optionalNumber(body, "grossServiceDays") ?? 0,
          periods: Array.isArray(body.periods) ? (body.periods as QualifyingServiceComputeInput["periods"]) : [],
          serviceExclusionRuleId: requiredString(body, "serviceExclusionRuleId"),
        };
        return created(await context.services.promotion.computeQualifyingService(context.actor, input));
      },
    },
    {
      method: "GET",
      path: "/api/v1/promotions/qualifying-service/{snapshotId}",
      operationId: "g06.getQualifyingServiceSnapshot",
      protected: true,
      permission: "g06.establishment.read",
      handler: async (context) => ok({ snapshot: await context.services.promotion.getQualifyingServiceSnapshot(context.scope, requiredParam(context.params, "snapshotId")) }),
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

/** A required numeric body field accepting a JSON number or a numeric string. */
function readRequiredNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new Error(`${key} must be a number`);
  }
  return n;
}

/** FR-015 sanctioned-post registration input (P01 checker must differ from the maker). */
function readSanctionedPostInput(body: Record<string, unknown>): SanctionedPostInput {
  return {
    cadreId: requiredString(body, "cadreId"),
    gradeDesignationId: requiredString(body, "gradeDesignationId"),
    orgUnitId: requiredString(body, "orgUnitId"),
    sanctionOrderRef: requiredString(body, "sanctionOrderRef"),
    sanctionedStrength: readRequiredNumber(body, "sanctionedStrength"),
    filledCount: readRequiredNumber(body, "filledCount"),
    drQuotaPct: readRequiredNumber(body, "drQuotaPct"),
    promotionQuotaPct: readRequiredNumber(body, "promotionQuotaPct"),
    ldceQuotaPct: readRequiredNumber(body, "ldceQuotaPct"),
    anticipatedVacancies: optionalNumber(body, "anticipatedVacancies"),
    carriedForwardVacancies: optionalNumber(body, "carriedForwardVacancies"),
    asOnDate: requiredString(body, "asOnDate"),
    approverActorId: requiredString(body, "approverActorId"),
  };
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
