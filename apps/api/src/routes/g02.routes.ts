import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { PersonalDetailFieldCode } from "../modules/g02/personalDetailsService";

export const g02RouteEvidence = {
  base: "/api/v1/personal-details/change-requests",
  commit: "commit-through-G01",
  reversal: "reverse-through-G01",
  resolver: "REPORTING_CHAIN",
  evidenceDocs: "G13 evidence documents",
  // PH-07C BRD-contract lifecycle routes (docs/brd/v3/G02 §8): withdraw, resubmit, masked diff.
  lifecycle: "/api/v1/change-requests/{id}/withdraw|resubmit|diff",
  // PH-16B FR-G02-009/018/019: bulk corrections, risk signals + fraud review, status gate.
  bulk: "/api/v1/bulk-corrections|{id}/validate|submit|approve|report",
  risk: "/api/v1/change-requests/{id}/risk|{signalId}/review + /api/v1/fraud/queue",
};

export function registerG02Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/personal-details/change-requests",
      operationId: "g02.createPersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.personalDetails.createRequest(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            fieldCode: readFieldCode(body),
            newValue: requiredString(body, "newValue"),
            reason: requiredString(body, "reason"),
            evidenceTitle: optionalString(body, "evidenceTitle"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/personal-details/change-requests",
      operationId: "g02.listPersonalDetailChangeRequests",
      protected: true,
      permission: "g02.change.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = context.services.personalDetails.list(context.scope);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    actionRoute("approve", "g02.change.approve", (context, requestId) => accepted({ request: context.services.personalDetails.approve(context.actor, requestId) })),
    actionRoute("reject", "g02.change.reject", (context, requestId) =>
      accepted({ request: context.services.personalDetails.reject(context.actor, requestId, optionalString(readBodyRecord(context.request.body), "comment")) })
    ),
    // FR-G02-006 return-for-correction: P01 sendBack -> RETURNED with a mandatory comment (ERR-REASON-REQ).
    actionRoute("send-back", "g02.change.reject", (context, requestId) =>
      accepted({ request: context.services.personalDetails.sendBack(context.actor, requestId, optionalString(readBodyRecord(context.request.body), "comment")) })
    ),
    {
      method: "POST",
      path: "/api/v1/change-requests/{id}/resubmit",
      operationId: "g02.resubmitPersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          request: context.services.personalDetails.resubmit(context.actor, requiredParam(context.params, "id"), {
            newValue: optionalString(body, "newValue"),
            reason: requiredString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/change-requests/{id}/withdraw",
      operationId: "g02.withdrawPersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          request: context.services.personalDetails.withdraw(context.actor, requiredParam(context.params, "id"), optionalString(body, "reason")),
        });
      },
    },
    {
      // FR-G02-005: P02-aware per-field diff; sensitive values are masked for readers without the field grant.
      method: "GET",
      path: "/api/v1/change-requests/{id}/diff",
      operationId: "g02.getPersonalDetailChangeRequestDiff",
      protected: true,
      permission: "g02.change.read",
      handler: (context) => ok(context.services.personalDetails.getDiff(context.actor, requiredParam(context.params, "id"))),
    },
    {
      method: "POST",
      path: "/api/v1/personal-details/change-requests/{id}:commit",
      operationId: "g02.commitPersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.commit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          request: context.services.personalDetails.commit(
            context.actor,
            requiredParam(context.params, "id"),
            requiredString({ key: context.idempotencyKey }, "key"),
            optionalString(body, "effectiveDate") ?? "2026-07-02"
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/personal-details/change-requests/{id}:reverse",
      operationId: "g02.reversePersonalDetailChangeRequest",
      protected: true,
      permission: "g02.change.reverse",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          request: context.services.personalDetails.reverse(
            context.actor,
            requiredParam(context.params, "id"),
            requiredString({ key: context.idempotencyKey }, "key"),
            optionalString(body, "effectiveDate") ?? "2026-07-03"
          ),
        });
      },
    },
    // ------------------------------------------------------------------------------
    // PH-16B — FR-G02-018/019 governed change with status gate + risk evaluation
    // ------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/change-requests",
      operationId: "g02.submitGovernedChangeRequest",
      protected: true,
      permission: "g02.change.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          request: context.services.changeGovernance.submitChange(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            fieldKey: requiredString(body, "fieldKey"),
            newValue: requiredString(body, "newValue"),
            reason: requiredString(body, "reason"),
            origin: readOrigin(body),
            changeType: readChangeType(body),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/change-requests/{id}:approve",
      operationId: "g02.approveGovernedChangeRequest",
      protected: true,
      permission: "g02.change.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({ request: context.services.changeGovernance.approveChange(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/change-requests/{id}:commit",
      operationId: "g02.commitGovernedChangeRequest",
      protected: true,
      permission: "g02.change.commit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({
          request: context.services.changeGovernance.commitChange(
            context.actor,
            requiredParam(context.params, "id"),
            requiredString({ key: context.idempotencyKey }, "key")
          ),
        }),
    },
    {
      // FR-G02-019: risk signals + aggregated score/band for one change request.
      method: "GET",
      path: "/api/v1/change-requests/{id}/risk",
      operationId: "g02.getChangeRequestRisk",
      protected: true,
      permission: "g02.change.read",
      handler: (context) => ok(context.services.changeGovernance.getRisk(context.scope, requiredParam(context.params, "id"))),
    },
    {
      // FR-G02-019 AC6: Fraud Reviewer clear/confirm/escalate (capability-flag permission).
      method: "POST",
      path: "/api/v1/change-requests/{id}/risk/{signalId}/review",
      operationId: "g02.reviewChangeRequestRiskSignal",
      protected: true,
      permission: "g02.risk.review",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.changeGovernance.reviewRiskSignal(
            context.actor,
            requiredParam(context.params, "id"),
            requiredParam(context.params, "signalId"),
            { outcome: readReviewOutcome(body), comment: optionalString(body, "comment") }
          )
        );
      },
    },
    {
      // FR-G02-019 AC6: fraud-review queue (HIGH/BLOCKED bands), cursor-bounded.
      method: "GET",
      path: "/api/v1/fraud/queue",
      operationId: "g02.listFraudQueue",
      protected: true,
      permission: "g02.risk.review",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = context.services.changeGovernance.listFraudQueue(context.scope);
        return ok({ items: items.slice(0, pagination.limit), limit: pagination.limit, next_cursor: null });
      },
    },
    // ------------------------------------------------------------------------------
    // PH-16B — FR-G02-009 bulk HR-initiated corrections (E12 lifecycle verbatim)
    // ------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/bulk-corrections",
      operationId: "g02.createBulkCorrectionBatch",
      protected: true,
      permission: "g02.bulk.manage",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          batch: context.services.changeGovernance.createBatch(context.actor, {
            rows: readBulkRows(body),
            reason: optionalString(body, "reason"),
          }),
        });
      },
    },
    bulkActionRoute("validate", "g02.bulk.manage", (context, batchId) =>
      ok(context.services.changeGovernance.validateBatch(context.actor, batchId))
    ),
    bulkActionRoute("submit", "g02.bulk.manage", (context, batchId) =>
      accepted({ batch: context.services.changeGovernance.submitBatch(context.actor, batchId) })
    ),
    bulkActionRoute("approve", "g02.change.approve", (context, batchId) =>
      accepted({ batch: context.services.changeGovernance.approveBatch(context.actor, batchId) })
    ),
    bulkActionRoute("commit", "g02.change.commit", (context, batchId) =>
      accepted({ batch: context.services.changeGovernance.commitBatch(context.actor, batchId) })
    ),
    {
      // FR-G02-009 AC1: validation/commit report with row-level reasons.
      method: "GET",
      path: "/api/v1/bulk-corrections/{id}/report",
      operationId: "g02.getBulkCorrectionBatchReport",
      protected: true,
      permission: "g02.change.read",
      handler: (context) => ok({ batch: context.services.changeGovernance.getBatchReport(context.scope, requiredParam(context.params, "id")) }),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function bulkActionRoute(
  action: "validate" | "submit" | "approve" | "commit",
  permission: string,
  handler: (context: Parameters<RouteDefinition["handler"]>[0], batchId: string) => ReturnType<RouteDefinition["handler"]>
): RouteDefinition {
  return {
    method: "POST",
    path: `/api/v1/bulk-corrections/{id}/${action}`,
    operationId: `g02.${action}BulkCorrectionBatch`,
    protected: true,
    permission,
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => handler(context, requiredParam(context.params, "id")),
  };
}

function readOrigin(body: Record<string, unknown>): "SELF_SERVICE" | "HR_ON_BEHALF" {
  const value = optionalString(body, "origin") ?? "SELF_SERVICE";
  if (value === "SELF_SERVICE" || value === "HR_ON_BEHALF") {
    return value;
  }
  throw new Error(`Unsupported origin ${value}`);
}

function readChangeType(body: Record<string, unknown>): "UPDATE" | "CORRECTION" | undefined {
  const value = optionalString(body, "changeType");
  if (value === undefined || value === "UPDATE" || value === "CORRECTION") {
    return value;
  }
  throw new Error(`Unsupported changeType ${value}`);
}

function readReviewOutcome(body: Record<string, unknown>): "CLEARED" | "CONFIRMED_FRAUD" | "ESCALATED" {
  const value = requiredString(body, "outcome");
  if (value === "CLEARED" || value === "CONFIRMED_FRAUD" || value === "ESCALATED") {
    return value;
  }
  throw new Error(`Unsupported review outcome ${value}`);
}

/** FR-G02-009 VAL-FILE: the CSV-shaped row set arrives parsed as an array of row objects. */
function readBulkRows(body: Record<string, unknown>): Array<{ employeeId: string; fieldKey: string; newValue: string; changeType?: "UPDATE" | "CORRECTION"; reason?: string }> {
  const rows = body.rows;
  if (!Array.isArray(rows)) {
    throw new Error("rows must be an array");
  }
  return rows.map((row) => {
    const record = readBodyRecord(row);
    return {
      employeeId: requiredString(record, "employeeId"),
      fieldKey: requiredString(record, "fieldKey"),
      newValue: requiredString(record, "newValue"),
      changeType: readChangeType(record),
      reason: optionalString(record, "reason"),
    };
  });
}

function actionRoute(
  action: "approve" | "reject" | "send-back",
  permission: string,
  handler: (context: Parameters<RouteDefinition["handler"]>[0], requestId: string) => ReturnType<RouteDefinition["handler"]>
): RouteDefinition {
  return {
    method: "POST",
    path: `/api/v1/personal-details/change-requests/{id}:${action}`,
    operationId: `g02.${action === "send-back" ? "sendBack" : action}PersonalDetailChangeRequest`,
    protected: true,
    permission,
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => handler(context, requiredParam(context.params, "id")),
  };
}

function readFieldCode(body: Record<string, unknown>): PersonalDetailFieldCode {
  const value = requiredString(body, "fieldCode");
  if (value === "displayName" || value === "pan" || value === "aadhaarMasked") {
    return value;
  }
  throw new Error(`Unsupported fieldCode ${value}`);
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
