import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalRecord, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import type { ChargePhase, ChargeType, DeemedServiceBasis, DeliveryChannel } from "../modules/g05/transferService";
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
  // PH-08B administration depth (FR-G05-007/009/011/020/022).
  serve: "/api/v1/transfers/orders/{id}/serve",
  acknowledge: "/api/v1/transfers/orders/{id}/acknowledge",
  deemServed: "/api/v1/transfers/orders/{id}/deem-served",
  serviceRecord: "/api/v1/transfers/orders/{id}/service-record",
  chargeHandover: "/api/v1/transfers/orders/{id}/charge-handover",
  chargeHandoverUnderProtest: "/api/v1/charge-handovers/{id}/under-protest",
  joiningTime: "/api/v1/transfers/orders/{id}/joining-time",
  deputations: "/api/v1/deputations",
  repatriate: "/api/v1/deputations/{id}/repatriate",
  quarterRetention: "/api/v1/transfers/orders/{id}/quarter-retention",
  quarterAllotments: "/api/v1/quarter-allotments",
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
    // --- PH-08B: proof-of-service & acknowledgement (FR-G05-020) -------------------------
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/serve",
      operationId: "g05.serveTransferOrder",
      protected: true,
      permission: "g05.transfer.serve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          acknowledgement: context.services.transfer.serveOrder(context.actor, requiredParam(context.params, "id"), {
            servedOnDate: requiredString(body, "servedOnDate"),
            deliveryChannel: requiredString(body, "deliveryChannel") as DeliveryChannel,
            proofDocumentTitle: optionalString(body, "proofDocumentTitle"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/acknowledge",
      operationId: "g05.acknowledgeTransferOrder",
      protected: true,
      permission: "g05.transfer.acknowledge",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          acknowledgement: context.services.transfer.acknowledgeOrder(context.actor, requiredParam(context.params, "id"), {
            acknowledgedAt: requiredString(body, "acknowledgedAt"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/deem-served",
      operationId: "g05.deemTransferOrderServed",
      protected: true,
      permission: "g05.transfer.deem_served",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          acknowledgement: context.services.transfer.deemOrderServed(context.actor, requiredParam(context.params, "id"), {
            asOf: requiredString(body, "asOf"),
            basis: requiredString(body, "basis") as DeemedServiceBasis,
            reason: requiredString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders/{id}/service-record",
      operationId: "g05.getTransferServiceRecord",
      protected: true,
      permission: "g05.transfer.read",
      handler: (context) =>
        ok({ acknowledgement: context.services.transfer.getServiceRecord(context.scope, requiredParam(context.params, "id")) ?? null }),
    },
    // --- PH-08B: charge handover incl. under-protest (FR-G05-007) ------------------------
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/charge-handover",
      operationId: "g05.recordChargeHandover",
      protected: true,
      permission: "g05.transfer.handover.record",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          chargeHandover: context.services.transfer.recordChargeHandover(context.actor, requiredParam(context.params, "id"), {
            receivingEmployeeId: requiredString(body, "receivingEmployeeId"),
            handoverDate: requiredString(body, "handoverDate"),
            phase: optionalString(body, "phase") as ChargePhase | undefined,
            chargeType: optionalString(body, "chargeType") as ChargeType | undefined,
            cashImprestAmount: optionalNumber(body, "cashImprestAmount"),
            pendingFilesCount: optionalNumber(body, "pendingFilesCount"),
            noteTitle: optionalString(body, "noteTitle"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/charge-handovers/{id}/accept",
      operationId: "g05.acceptChargeHandover",
      protected: true,
      permission: "g05.transfer.handover.accept",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          chargeHandover: context.services.transfer.acceptChargeHandover(context.actor, requiredParam(context.params, "id"), {
            acceptedAt: requiredString(body, "acceptedAt"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/charge-handovers/{id}/dispute",
      operationId: "g05.disputeChargeHandover",
      protected: true,
      permission: "g05.transfer.handover.dispute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          chargeHandover: context.services.transfer.disputeChargeHandover(context.actor, requiredParam(context.params, "id"), {
            remarks: requiredString(body, "remarks"),
            disputedAt: requiredString(body, "disputedAt"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/charge-handovers/{id}/under-protest",
      operationId: "g05.certifyChargeHandoverUnderProtest",
      protected: true,
      permission: "g05.transfer.handover.protest",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          chargeHandover: context.services.transfer.certifyHandoverUnderProtest(context.actor, requiredParam(context.params, "id"), {
            asOf: requiredString(body, "asOf"),
            reason: requiredString(body, "reason"),
          }),
        });
      },
    },
    // --- PH-08B: joining time by distance band (FR-G05-009 / VAL-G05-JTIME) --------------
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/joining-time",
      operationId: "g05.computeJoiningTime",
      protected: true,
      permission: "g05.transfer.joining_time.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.transfer.computeJoiningTime(context.actor, requiredParam(context.params, "id"), {
            distanceKm: optionalNumber(body, "distanceKm"),
            sameStation: body.sameStation === true,
          })
        );
      },
    },
    // --- PH-08B: deputation records with tenure caps + repatriation (FR-G05-011) ---------
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/deputation",
      operationId: "g05.createDeputationRecord",
      protected: true,
      permission: "g05.deputation.manage",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          deputation: context.services.transfer.createDeputationRecord(context.actor, requiredParam(context.params, "id"), {
            startDate: requiredString(body, "startDate"),
            initialTenureMonths: optionalNumber(body, "initialTenureMonths") ?? 12,
            maxTenureMonths: optionalNumber(body, "maxTenureMonths"),
            borrowingOrgUnitId: optionalString(body, "borrowingOrgUnitId"),
            lendingOrgUnitId: optionalString(body, "lendingOrgUnitId"),
            deputationTerms: optionalRecord(body, "deputationTerms"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/deputations",
      operationId: "g05.listDeputations",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const deputations = context.services.transfer.listDeputationRecords(context.scope);
        return ok({ items: deputations.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "POST",
      path: "/api/v1/deputations/{id}/extend",
      operationId: "g05.extendDeputation",
      protected: true,
      permission: "g05.deputation.extend",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          deputation: context.services.transfer.extendDeputation(context.actor, requiredParam(context.params, "id"), {
            extensionMonths: optionalNumber(body, "extensionMonths") ?? 0,
            reason: optionalString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/deputations/{id}/repatriate",
      operationId: "g05.repatriateDeputation",
      protected: true,
      permission: "g05.deputation.repatriate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.transfer.repatriateDeputation(context.actor, requiredParam(context.params, "id"), {
            repatriationDate: requiredString(body, "repatriationDate"),
            reason: requiredString(body, "reason"),
          })
        );
      },
    },
    // --- PH-08B: quarters / estate retention + penal-rate flip (FR-G05-022) --------------
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/quarter-retention",
      operationId: "g05.requestQuarterRetention",
      protected: true,
      permission: "g05.quarter.request",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          quarterAllotment: context.services.transfer.requestQuarterRetention(context.actor, requiredParam(context.params, "id"), {
            quarterRef: requiredString(body, "quarterRef"),
            orgUnitId: optionalString(body, "orgUnitId"),
            vacateByDate: requiredString(body, "vacateByDate"),
            licenceFeeRate: optionalNumber(body, "licenceFeeRate") ?? 0,
            penalLicenceFeeRate: optionalNumber(body, "penalLicenceFeeRate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/quarter-allotments/{id}/approve-retention",
      operationId: "g05.approveQuarterRetention",
      protected: true,
      permission: "g05.quarter.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          quarterAllotment: context.services.transfer.approveQuarterRetention(context.actor, requiredParam(context.params, "id"), {
            approvedOn: requiredString(body, "approvedOn"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/quarter-allotments/{id}/flag-overstay",
      operationId: "g05.flagQuarterOverstay",
      protected: true,
      permission: "g05.quarter.overstay",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          quarterAllotment: context.services.transfer.flagQuarterOverstay(context.actor, requiredParam(context.params, "id"), {
            asOf: requiredString(body, "asOf"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/quarter-allotments/{id}/record-vacation",
      operationId: "g05.recordQuarterVacation",
      protected: true,
      permission: "g05.quarter.vacate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          quarterAllotment: context.services.transfer.recordQuarterVacation(context.actor, requiredParam(context.params, "id"), {
            vacatedOn: requiredString(body, "vacatedOn"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/quarter-allotments",
      operationId: "g05.listQuarterAllotments",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const allotments = context.services.transfer.listQuarterAllotments(context.scope);
        return ok({ items: allotments.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
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
