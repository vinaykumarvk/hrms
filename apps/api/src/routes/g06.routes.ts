import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";
import { DpcPanelMember, SenioritySeed } from "../modules/g06/promotionService";

export const g06RouteEvidence = {
  seniorityLists: "/api/v1/promotions/seniority-lists",
  promotionCases: "/api/v1/promotions/cases",
  dpc: "/api/v1/promotions/cases/{id}:hold-dpc",
  effectOrder: "/api/v1/promotions/orders/{id}:effect",
  macp: "/api/v1/promotions/macp",
  markers: ["DPC_QUORUM", "DPC_RECUSAL", "PROMOTION_EFFECTED", "MACP_EFFECTED", "G06_PAY_IMPACT_SIGNAL"],
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
      method: "GET",
      path: "/api/v1/promotions/summary",
      operationId: "g06.summary",
      protected: true,
      permission: "g06.promotion.read",
      handler: (context) => ok(context.services.promotion.summary(context.scope)),
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

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
