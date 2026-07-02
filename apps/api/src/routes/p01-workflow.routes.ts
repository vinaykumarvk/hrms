import { ResolverRule } from "../platform/authority-resolution/authorityResolutionService";
import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { readBodyRecord, optionalString, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";

export const p01WorkflowRouteEvidence = {
  base: "/api/v1/workflow/instances",
  taskList: "/api/v1/workflow/tasks",
  actions: ["advance", "approve", "reject", "send-back", "delegate", "cancel", "query"],
  taskActions: ["claim", "approve", "reject", "delegate"],
  headers: ["X-Correlation-Id", "Idempotency-Key"],
  permission: "p01.workflow",
};

export function registerP01WorkflowRoutes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/workflow/instances",
      operationId: "p01.startWorkflowInstance",
      protected: true,
      permission: "p01.workflow.start",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        const subjectEmployeeId = optionalString(body, "subjectEmployeeId") ?? ph03Ids.employee;
        const resolverRule = readResolverRule(body, subjectEmployeeId);
        const result = context.services.workflow.start(context.scope, {
          workflowCode: optionalString(body, "workflowCode") ?? "WF-HRMS-GENERIC",
          subjectRef: optionalString(body, "subjectRef") ?? `employees:${subjectEmployeeId}`,
          stage: optionalString(body, "stage") ?? "PENDING_MANAGER",
          resolverRule,
          asOf: optionalString(body, "asOf") ?? "2026-07-01",
        });
        return created(result);
      },
    },
    {
      method: "GET",
      path: "/api/v1/workflow/tasks",
      operationId: "p01.listWorkflowTasks",
      protected: true,
      permission: "p01.workflow.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => {
        const pagination = context.pagination ?? { limit: 25 };
        const items = context.services.workflow.listTasks(context.scope);
        const start = pagination.cursor ? Number.parseInt(pagination.cursor, 10) : 0;
        const selected = items.slice(start, start + pagination.limit);
        return ok({ items: selected, limit: pagination.limit, next_cursor: start + selected.length < items.length ? String(start + selected.length) : null });
      },
    },
    {
      method: "GET",
      path: "/api/v1/workflow/instances/{instance_id}",
      operationId: "p01.getWorkflowInstance",
      protected: true,
      permission: "p01.workflow.read",
      handler: (context) => ok({ instance: context.services.workflow.getInstance(context.scope, requiredParam(context.params, "instance_id")) }),
    },
  ];
  for (const action of p01ActionRoutes()) {
    routes.push(action);
  }
  routes.forEach((route) => kernel.register(route));
  registerP01TaskActionRoutes(kernel);
}

function registerP01TaskActionRoutes(kernel: ApiKernel): void {
  kernel.register({
    method: "POST",
    path: "/api/v1/workflow/tasks/{task_id}/claim",
    operationId: "p01.claimWorkflowTask",
    protected: true,
    permission: "p01.workflow.task.claim",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted({ task: context.services.workflow.claimTask(context.scope, { taskId: requiredParam(context.params, "task_id") }) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/workflow/tasks/{task_id}/approve",
    operationId: "p01.approveWorkflowTask",
    protected: true,
    permission: "p01.workflow.task.approve",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted({ action: context.services.workflow.actOnTask(context.scope, { taskId: requiredParam(context.params, "task_id"), action: "APPROVE" }) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/workflow/tasks/{task_id}/reject",
    operationId: "p01.rejectWorkflowTask",
    protected: true,
    permission: "p01.workflow.task.reject",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted({ action: context.services.workflow.actOnTask(context.scope, { taskId: requiredParam(context.params, "task_id"), action: "REJECT" }) }),
  });
  kernel.register({
    method: "POST",
    path: "/api/v1/workflow/tasks/{task_id}/delegate",
    operationId: "p01.delegateWorkflowTask",
    protected: true,
    permission: "p01.workflow.task.delegate",
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) => {
      const body = readBodyRecord(context.request.body);
      return accepted(
        context.services.workflow.delegateTask(context.scope, {
          taskId: requiredParam(context.params, "task_id"),
          toUserId: requiredString(body, "toUserId"),
          reason: optionalString(body, "reason"),
        })
      );
    },
  });
}

function p01ActionRoutes(): RouteDefinition[] {
  return [
    actionRoute("advance", "ADVANCE"),
    actionRoute("approve", "APPROVE"),
    actionRoute("reject", "REJECT"),
    actionRoute("send-back", "SEND_BACK"),
    actionRoute("delegate", "DELEGATE"),
    actionRoute("cancel", "CANCEL"),
    actionRoute("query", "QUERY"),
  ];
}

function actionRoute(pathAction: string, action: "ADVANCE" | "APPROVE" | "REJECT" | "SEND_BACK" | "DELEGATE" | "CANCEL" | "QUERY"): RouteDefinition {
  return {
    method: "POST",
    path: `/api/v1/workflow/instances/{instance_id}/${pathAction}`,
    operationId: `p01.${pathAction}WorkflowInstance`,
    protected: true,
    permission: `p01.workflow.${pathAction}`,
    unsafe: true,
    requiresIdempotencyKey: true,
    handler: (context) =>
      accepted({
        action: context.services.workflow.actOnInstance(context.scope, { instanceId: requiredParam(context.params, "instance_id"), action }),
      }),
  };
}

function readResolverRule(body: Record<string, unknown>, subjectEmployeeId: string): ResolverRule {
  const mechanism = optionalString(body, "mechanism") ?? "REPORTING_CHAIN";
  if (mechanism === "STATUTORY_AUTHORITY") {
    return {
      mechanism,
      subjectEmployeeId,
      authorityCode: requiredString(body, "authorityCode"),
      orgUnitId: optionalString(body, "orgUnitId"),
    };
  }
  if (mechanism === "ORG_UNIT_HEAD") {
    return { mechanism, orgUnitId: requiredString(body, "orgUnitId") };
  }
  if (mechanism === "COMMITTEE") {
    return { mechanism, committeeCode: requiredString(body, "committeeCode") };
  }
  return { mechanism: "REPORTING_CHAIN", subjectEmployeeId };
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
