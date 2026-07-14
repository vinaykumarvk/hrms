import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalRecord, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import type {
  ChargeHandover,
  ChargePhase,
  ChargeType,
  DeemedServiceBasis,
  DeliveryChannel,
  JoiningReport,
  OrderAcknowledgement,
  RelievingOrder,
  TransferOrder,
  TransferRepresentation,
} from "../modules/g05/transferService";
import type { CounsellingChoiceAction, TransferPreference, TurnOrderMethod } from "../modules/g05/counsellingVacancyService";
import { FoundationError } from "../platform/types";
import { ph03Ids } from "../seed/ph03Seed";

function toWireOrder(order: TransferOrder): Omit<TransferOrder, "tenantId" | "entityId" | "workflowInstanceId" | "workflowTaskId" | "clearanceWorkflowInstanceId" | "orderNumberSequenceId"> {
  const {
    tenantId: _tenantId,
    entityId: _entityId,
    workflowInstanceId: _workflowInstanceId,
    workflowTaskId: _workflowTaskId,
    clearanceWorkflowInstanceId: _clearanceWorkflowInstanceId,
    orderNumberSequenceId: _orderNumberSequenceId,
    ...wire
  } = order;
  return wire;
}

function toWireAcknowledgement(acknowledgement: OrderAcknowledgement): Omit<OrderAcknowledgement, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = acknowledgement;
  return wire;
}

function toWirePreference(preference: TransferPreference): Omit<TransferPreference, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = preference;
  return wire;
}

function toWireRepresentation(representation: TransferRepresentation): Omit<TransferRepresentation, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = representation;
  return wire;
}

function toWireRelievingOrder(relievingOrder: RelievingOrder): Omit<RelievingOrder, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = relievingOrder;
  return wire;
}

function toWireJoiningReport(joiningReport: JoiningReport): Omit<JoiningReport, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = joiningReport;
  return wire;
}

function toWireChargeHandover(chargeHandover: ChargeHandover): Omit<ChargeHandover, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = chargeHandover;
  return wire;
}

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
  // PH-16D counselling/vacancy/mutual depth (FR-G05-003/019 + BRD rules 5/6).
  vacancies: "/api/v1/transfers/drives/{id}/vacancies",
  preferences: "/api/v1/transfers/drives/{id}/preferences",
  allot: "/api/v1/transfers/drives/{id}/allot",
  reservationVacate: "/api/v1/transfers/reservations/{id}:vacate-on-relief",
  reservationFill: "/api/v1/transfers/reservations/{id}:fill-on-join",
  counsellingSessions: "/api/v1/transfers/drives/{id}/counselling-sessions",
  counsellingRecordChoice: "/api/v1/counselling-sessions/{id}/record-choice",
  counsellingChoices: "/api/v1/counselling-sessions/{id}/choices",
  mutualRequests: "/api/v1/transfers/mutual-requests",
  mutualPairApprove: "/api/v1/transfers/mutual-pairs/{id}:approve",
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const result = await context.services.transfer.initiate(context.actor, {
          employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
          fromOrgUnitId: optionalString(body, "fromOrgUnitId") ?? ph03Ids.orgRevenue,
          toOrgUnitId: requiredString(body, "toOrgUnitId"),
          orderDate: requiredString(body, "orderDate"),
          effectiveDate: requiredString(body, "effectiveDate"),
          reason: optionalString(body, "reason"),
        });
        return created({ ...result, order: toWireOrder(result.order) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/employees/{id}",
      operationId: "g05.listMyTransferOrders",
      protected: true,
      permission: "g05.transfer.read",
      handler: async (context) => ok({ items: await context.services.transfer.listMyOrders(context.actor, requiredParam(context.params, "id")).map(toWireOrder) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders",
      operationId: "g05.listTransferOrders",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const orders = await context.services.transfer.listOrders(context.actor).map(toWireOrder);
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
      handler: async (context) => {
        const result = await context.services.transfer.approve(context.actor, requiredParam(context.params, "id"), {
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        });
        return accepted({ ...result, order: toWireOrder(result.order) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders/{id}/clearance",
      operationId: "g05.getTransferClearance",
      protected: true,
      permission: "g05.transfer.read",
      handler: async (context) => ok({ clearanceItems: await context.services.transfer.getOrder(context.actor, requiredParam(context.params, "id")).clearanceItems }),
    },
    {
      method: "POST",
      path: "/api/v1/transfers/orders/{id}/clearances/{clearance_code}:complete",
      operationId: "g05.completeTransferClearance",
      protected: true,
      permission: "g05.transfer.clearance",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          order: toWireOrder(
            await context.services.transfer.completeClearance(
              context.actor,
              requiredParam(context.params, "id"),
              requiredParam(context.params, "clearance_code"),
              optionalString(body, "completedOn") ?? "2026-07-11"
            )
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          order: toWireOrder(
            await context.services.transfer.deemClearance(
              context.actor,
              requiredParam(context.params, "id"),
              requiredParam(context.params, "clearance_code"),
              optionalString(body, "deemedOn") ?? "2026-07-12"
            )
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const result = await context.services.transfer.relieveAndJoin(context.actor, requiredParam(context.params, "id"), {
          relievingDate: requiredString(body, "relievingDate"),
          joiningDate: requiredString(body, "joiningDate"),
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        });
        return accepted({
          ...result,
          order: toWireOrder(result.order),
          relievingOrder: toWireRelievingOrder(result.relievingOrder),
          joiningReport: toWireJoiningReport(result.joiningReport),
        });
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          representation: toWireRepresentation(
            await context.services.transfer.fileRepresentation(context.actor, requiredParam(context.params, "id"), {
              grounds: requiredString(body, "grounds"),
              evidenceTitle: optionalString(body, "evidenceTitle"),
            })
          ),
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
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const representations = await context.services.transfer.listRepresentations(context.actor).map(toWireRepresentation);
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const result = await context.services.transfer.retainOnRepresentation(context.actor, requiredParam(context.params, "id"), {
          decisionDate: requiredString(body, "decisionDate"),
          reason: requiredString(body, "reason"),
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        });
        return accepted({ ...result, representation: toWireRepresentation(result.representation), order: toWireOrder(result.order) });
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const result = await context.services.transfer.cancel(context.actor, requiredParam(context.params, "id"), {
          cancellationDate: requiredString(body, "cancellationDate"),
          reason: requiredString(body, "reason"),
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        });
        return accepted({ ...result, order: toWireOrder(result.order) });
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const result = await context.services.transfer.deemRelieved(context.actor, requiredParam(context.params, "id"), {
          deemedRelievingDate: requiredString(body, "deemedRelievingDate"),
          reason: requiredString(body, "reason"),
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        });
        return accepted({ ...result, order: toWireOrder(result.order) });
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          acknowledgement: toWireAcknowledgement(
            await context.services.transfer.serveOrder(context.actor, requiredParam(context.params, "id"), {
              servedOnDate: requiredString(body, "servedOnDate"),
              deliveryChannel: requiredString(body, "deliveryChannel") as DeliveryChannel,
              proofDocumentTitle: optionalString(body, "proofDocumentTitle"),
            })
          ),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          acknowledgement: toWireAcknowledgement(
            await context.services.transfer.acknowledgeOrder(context.actor, requiredParam(context.params, "id"), {
              acknowledgedAt: requiredString(body, "acknowledgedAt"),
            })
          ),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          acknowledgement: toWireAcknowledgement(
            await context.services.transfer.deemOrderServed(context.actor, requiredParam(context.params, "id"), {
              asOf: requiredString(body, "asOf"),
              basis: requiredString(body, "basis") as DeemedServiceBasis,
              reason: requiredString(body, "reason"),
            })
          ),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders/{id}/service-record",
      operationId: "g05.getTransferServiceRecord",
      protected: true,
      permission: "g05.transfer.read",
      handler: async (context) => {
        const record = await context.services.transfer.getServiceRecord(context.actor, requiredParam(context.params, "id"));
        return ok({ acknowledgement: record ? toWireAcknowledgement(record) : null });
      },
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          chargeHandover: toWireChargeHandover(
            await context.services.transfer.recordChargeHandover(context.actor, requiredParam(context.params, "id"), {
              receivingEmployeeId: requiredString(body, "receivingEmployeeId"),
              handoverDate: requiredString(body, "handoverDate"),
              phase: optionalString(body, "phase") as ChargePhase | undefined,
              chargeType: optionalString(body, "chargeType") as ChargeType | undefined,
              cashImprestAmount: optionalNumber(body, "cashImprestAmount"),
              pendingFilesCount: optionalNumber(body, "pendingFilesCount"),
              noteTitle: optionalString(body, "noteTitle"),
            })
          ),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          chargeHandover: toWireChargeHandover(
            await context.services.transfer.acceptChargeHandover(context.actor, requiredParam(context.params, "id"), {
              acceptedAt: requiredString(body, "acceptedAt"),
            })
          ),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          chargeHandover: toWireChargeHandover(
            await context.services.transfer.disputeChargeHandover(context.actor, requiredParam(context.params, "id"), {
              remarks: requiredString(body, "remarks"),
              disputedAt: requiredString(body, "disputedAt"),
            })
          ),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          chargeHandover: toWireChargeHandover(
            await context.services.transfer.certifyHandoverUnderProtest(context.actor, requiredParam(context.params, "id"), {
              asOf: requiredString(body, "asOf"),
              reason: requiredString(body, "reason"),
            })
          ),
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.transfer.computeJoiningTime(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          deputation: await context.services.transfer.createDeputationRecord(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const deputations = await context.services.transfer.listDeputationRecords(context.scope);
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          deputation: await context.services.transfer.extendDeputation(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.transfer.repatriateDeputation(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          quarterAllotment: await context.services.transfer.requestQuarterRetention(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          quarterAllotment: await context.services.transfer.approveQuarterRetention(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          quarterAllotment: await context.services.transfer.flagQuarterOverstay(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          quarterAllotment: await context.services.transfer.recordQuarterVacation(context.actor, requiredParam(context.params, "id"), {
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
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const allotments = await context.services.transfer.listQuarterAllotments(context.scope);
        return ok({ items: allotments.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    // --- PH-16D — FR-G05-003 vacancy publication (strength read-through) + preferences -----
    {
      method: "POST",
      path: "/api/v1/transfers/drives/{id}/vacancies",
      operationId: "g05.publishVacancyPosition",
      protected: true,
      permission: "g05.vacancy.publish",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          vacancyPosition: await context.services.transferCounselling.publishVacancyPosition(context.actor, {
            sanctionedPostId: requiredString(body, "sanctionedPostId"),
            driveId: requiredParam(context.params, "id"),
            cadre: optionalString(body, "cadre"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/transfers/drives/{id}/vacancies",
      operationId: "g05.listVacancyPositions",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = await context.services.transferCounselling.listVacancyPositions(context.actor, requiredParam(context.params, "id"));
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    {
      method: "PUT",
      path: "/api/v1/transfers/drives/{id}/preferences",
      operationId: "g05.capturePreferences",
      protected: true,
      permission: "g05.preference.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          preferences: await context.services.transferCounselling
            .capturePreferences(context.actor, {
              driveId: requiredParam(context.params, "id"),
              employeeId: requiredString(body, "employeeId"),
              preferences: readPreferenceRows(body.preferences),
            })
            .map(toWirePreference),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/drives/{id}/allot",
      operationId: "g05.allotVacancy",
      protected: true,
      permission: "g05.vacancy.allot",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          reservation: await context.services.transferCounselling.allotVacancy(context.actor, {
            vacancyPositionId: requiredString(body, "vacancyPositionId"),
            employeeId: requiredString(body, "employeeId"),
            driveId: requiredParam(context.params, "id"),
          }),
        });
      },
    },
    // --- PH-16D — BRD rule 6 vacancy_reservations lifecycle ---------------------------------
    {
      method: "POST",
      path: "/api/v1/transfers/reservations/{id}:vacate-on-relief",
      operationId: "g05.vacateReservationOnRelief",
      protected: true,
      permission: "g05.vacancy.lifecycle",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          reservation: await context.services.transferCounselling.markReservationVacatedOnRelief(context.actor, requiredParam(context.params, "id"), {
            vacatedOn: requiredString(body, "vacatedOn"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/reservations/{id}:fill-on-join",
      operationId: "g05.fillReservationOnJoin",
      protected: true,
      permission: "g05.vacancy.lifecycle",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          reservation: await context.services.transferCounselling.markReservationFilledOnJoin(context.actor, requiredParam(context.params, "id"), {
            joinedOn: requiredString(body, "joinedOn"),
          }),
        });
      },
    },
    // --- PH-16D — FR-G05-019 interactive counselling turn engine ----------------------------
    {
      method: "POST",
      path: "/api/v1/transfers/drives/{id}/counselling-sessions",
      operationId: "g05.scheduleCounsellingSession",
      protected: true,
      permission: "g05.counselling.schedule",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          session: await context.services.transferCounselling.scheduleCounsellingSession(context.actor, {
            sessionCode: requiredString(body, "sessionCode"),
            driveId: requiredParam(context.params, "id"),
            scheduledAt: requiredString(body, "scheduledAt"),
            turnOrderMethod: (optionalString(body, "turnOrderMethod") ?? "SENIORITY") as TurnOrderMethod,
            presidingOfficerId: requiredString(body, "presidingOfficerId"),
            turnTimeoutSeconds: optionalNumber(body, "turnTimeoutSeconds"),
            candidates: readCandidateRows(body.candidates),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/counselling-sessions/{id}:start",
      operationId: "g05.startCounsellingSession",
      protected: true,
      permission: "g05.counselling.conduct",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) =>
        accepted({ session: await context.services.transferCounselling.startCounsellingSession(context.actor, requiredParam(context.params, "id")) }),
    },
    // PH-28C — counselling session read (consumed by the G05 counselling console UI, PH-27B).
    {
      method: "GET",
      path: "/api/v1/counselling-sessions/{id}",
      operationId: "g05.getCounsellingSession",
      protected: true,
      permission: "g05.counselling.read",
      handler: async (context) => ok({ session: await context.services.transferCounselling.getCounsellingSession(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/counselling-sessions/{id}/record-choice",
      operationId: "g05.recordCounsellingChoice",
      protected: true,
      permission: "g05.counselling.choice",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.transferCounselling.recordChoice(context.actor, requiredParam(context.params, "id"), {
            employeeId: requiredString(body, "employeeId"),
            choiceAction: requiredString(body, "choiceAction") as Exclude<CounsellingChoiceAction, "AUTO_PASS_TIMEOUT">,
            vacancyPositionId: optionalString(body, "vacancyPositionId"),
            remarks: optionalString(body, "remarks"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/counselling-sessions/{id}:sweep-timeout",
      operationId: "g05.sweepCounsellingTurnTimeout",
      protected: true,
      permission: "g05.counselling.conduct",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) =>
        accepted(await context.services.transferCounselling.sweepTurnTimeout(context.actor, requiredParam(context.params, "id"))),
    },
    {
      method: "GET",
      path: "/api/v1/counselling-sessions/{id}/choices",
      operationId: "g05.listCounsellingChoices",
      protected: true,
      permission: "g05.transfer.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = await context.services.transferCounselling.listChoices(context.actor, requiredParam(context.params, "id"));
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    // --- PH-16D — BRD rule 5 MUTUAL_TRANSFER coupled pairing ---------------------------------
    {
      method: "POST",
      path: "/api/v1/transfers/mutual-requests",
      operationId: "g05.fileMutualRequest",
      protected: true,
      permission: "g05.mutual.request",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          request: await context.services.transferCounselling.fileMutualRequest(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            mutualCounterpartEmployeeId: requiredString(body, "mutualCounterpartEmployeeId"),
            fromOrgUnitId: requiredString(body, "fromOrgUnitId"),
            toOrgUnitId: requiredString(body, "toOrgUnitId"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/mutual-requests:pair",
      operationId: "g05.pairMutualRequests",
      protected: true,
      permission: "g05.mutual.pair",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.transferCounselling.pairMutualRequests(context.actor, {
            requestId: requiredString(body, "requestId"),
            counterpartRequestId: requiredString(body, "counterpartRequestId"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/mutual-pairs/{id}:approve",
      operationId: "g05.approveMutualPair",
      protected: true,
      permission: "g05.mutual.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.transferCounselling.approveMutualPair(context.actor, requiredParam(context.params, "id"), {
            orderDate: requiredString(body, "orderDate"),
            effectiveDate: requiredString(body, "effectiveDate"),
            idempotencyKey: context.idempotencyKey ?? "",
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/mutual-orders/{id}:relieve",
      operationId: "g05.recordMutualRelief",
      protected: true,
      permission: "g05.mutual.progress",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          order: await context.services.transferCounselling.recordMutualRelief(context.actor, requiredParam(context.params, "id"), {
            relievedOn: requiredString(body, "relievedOn"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/transfers/mutual-orders/{id}:join",
      operationId: "g05.recordMutualJoin",
      protected: true,
      permission: "g05.mutual.progress",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          order: await context.services.transferCounselling.recordMutualJoin(context.actor, requiredParam(context.params, "id"), {
            joinedOn: requiredString(body, "joinedOn"),
          }),
        });
      },
    },
    // PH-31B — G05 joining-sequence + inter-se seniority (route exposure for the PH-18C engine).
    {
      method: "POST",
      path: "/api/v1/transfers/joining-sequence",
      operationId: "g05.assignJoiningSequence",
      protected: true,
      permission: "g05.joining.sequence",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          sequence: await context.services.joiningSequence.assignJoiningSequence(context.actor, {
            batchId: requiredString(body, "batchId"),
            joiners: Array.isArray(body.joiners) ? (body.joiners as Array<{ employeeId: string; orderDate: string; serviceNo: string }>) : [],
          }),
        });
      },
    },
    // PH-54A — G05 transfer/counselling reads (vacancy position, reservations, preferences, mutual orders,
    // charge-handovers, relieving orders, joining reports). Route exposure for tested transfer/counselling.
    {
      method: "GET",
      path: "/api/v1/transfers/vacancy-positions/{id}",
      operationId: "g05.getVacancyPosition",
      protected: true,
      permission: "g05.counselling.read",
      handler: async (context) => ok({ vacancyPosition: await context.services.transferCounselling.getVacancyPosition(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/reservations/{id}",
      operationId: "g05.getReservation",
      protected: true,
      permission: "g05.counselling.read",
      handler: async (context) => ok({ reservation: await context.services.transferCounselling.getReservation(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/reservations",
      operationId: "g05.listReservations",
      protected: true,
      permission: "g05.counselling.read",
      handler: async (context) => ok({ items: await context.services.transferCounselling.listReservations(context.actor, context.request.query?.vacancyPositionId) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/drives/{driveId}/employees/{employeeId}/preferences",
      operationId: "g05.listPreferences",
      protected: true,
      permission: "g05.counselling.read",
      handler: async (context) =>
        ok({
          items: await context.services.transferCounselling
            .listPreferences(context.actor, requiredParam(context.params, "driveId"), requiredParam(context.params, "employeeId"))
            .map(toWirePreference),
        }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/mutual-orders/{id}",
      operationId: "g05.getMutualOrder",
      protected: true,
      permission: "g05.mutual.progress",
      handler: async (context) => ok({ mutualOrder: await context.services.transferCounselling.getMutualOrder(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/mutual-orders",
      operationId: "g05.listMutualOrders",
      protected: true,
      permission: "g05.mutual.progress",
      handler: async (context) => ok({ items: await context.services.transferCounselling.listMutualOrders(context.actor, context.request.query?.pairId) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/orders/{id}/charge-handovers",
      operationId: "g05.listChargeHandovers",
      protected: true,
      permission: "g05.transfer.read",
      handler: async (context) => ok({ items: await context.services.transfer.listChargeHandovers(context.actor, requiredParam(context.params, "id")).map(toWireChargeHandover) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/relieving-orders",
      operationId: "g05.listRelievingOrders",
      protected: true,
      permission: "g05.transfer.read",
      handler: async (context) => ok({ items: await context.services.transfer.listRelievingOrders(context.actor).map(toWireRelievingOrder) }),
    },
    {
      method: "GET",
      path: "/api/v1/transfers/joining-reports",
      operationId: "g05.listJoiningReports",
      protected: true,
      permission: "g05.transfer.read",
      handler: async (context) => ok({ items: await context.services.transfer.listJoiningReports(context.actor).map(toWireJoiningReport) }),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

/** Parses the ranked preference rows for PUT /transfers/drives/{id}/preferences. */
function readPreferenceRows(value: unknown): { preferenceRank: number; preferredOrgUnitId: string; vacancyPositionId?: string; seniorityScore?: number }[] {
  if (!Array.isArray(value)) {
    throw new FoundationError("VALIDATION_FAILED", "preferences must be an array", { field: "preferences" });
  }
  return value.map((entry) => {
    const row = readBodyRecord(entry);
    return {
      preferenceRank: Number(row.preferenceRank),
      preferredOrgUnitId: requiredString(row, "preferredOrgUnitId"),
      vacancyPositionId: optionalString(row, "vacancyPositionId"),
      seniorityScore: optionalNumber(row, "seniorityScore"),
    };
  });
}

/** Parses the counselling candidate rows for POST /transfers/drives/{id}/counselling-sessions. */
function readCandidateRows(value: unknown): { employeeId: string; seniorityScore?: number; meritScore?: number }[] {
  if (!Array.isArray(value)) {
    throw new FoundationError("VALIDATION_FAILED", "candidates must be an array", { field: "candidates" });
  }
  return value.map((entry) => {
    const row = readBodyRecord(entry);
    return {
      employeeId: requiredString(row, "employeeId"),
      seniorityScore: optionalNumber(row, "seniorityScore"),
      meritScore: optionalNumber(row, "meritScore"),
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
