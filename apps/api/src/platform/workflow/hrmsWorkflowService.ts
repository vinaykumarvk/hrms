import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../audit/auditService";
import { AuthorityResolutionService, ResolverRule, AuthorityResolution } from "../authority-resolution/authorityResolutionService";
import { FoundationError, TenantScope, nextId, requireTenantScope } from "../types";

export interface WorkflowInstance {
  id: string;
  tenantId: string;
  entityId?: string;
  workflowCode: string;
  subjectRef: string;
  status: "RUNNING" | "APPROVED" | "REJECTED" | "SENT_BACK" | "CANCELLED";
}

export interface WorkflowTask {
  id: string;
  instanceId: string;
  stage: string;
  status: "PENDING" | "COMPLETED";
  resolution: AuthorityResolution;
}

export interface WorkflowAction {
  id: string;
  instanceId: string;
  action: "ADVANCE" | "APPROVE" | "REJECT" | "SEND_BACK" | "DELEGATE" | "CANCEL" | "QUERY";
  actorUserId?: string;
}

export class HrmsWorkflowService {
  private readonly instances: WorkflowInstance[] = [];
  private readonly tasks: WorkflowTask[] = [];
  private readonly actions: WorkflowAction[] = [];

  constructor(private readonly resolver: AuthorityResolutionService, private readonly audit: AuditService, private readonly notifications: NotificationService) {}

  start(
    scope: TenantScope,
    input: { workflowCode: string; subjectRef: string; stage: string; resolverRule: ResolverRule; asOf: string }
  ): { instance: WorkflowInstance; task: WorkflowTask } {
    requireTenantScope(scope);
    const resolution = this.resolver.resolve(scope, input.resolverRule, input.asOf);
    const instance: WorkflowInstance = {
      id: nextId("workflow", this.instances.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      workflowCode: input.workflowCode,
      subjectRef: input.subjectRef,
      status: "RUNNING",
    };
    const task: WorkflowTask = {
      id: nextId("task", this.tasks.length),
      instanceId: instance.id,
      stage: input.stage,
      status: "PENDING",
      resolution,
    };
    this.instances.push(instance);
    this.tasks.push(task);
    this.audit.recordMutation(scope, {
      action: "P01_WORKFLOW_START",
      subjectRef: `workflow_instances:${instance.id}`,
      metadata: { workflowCode: instance.workflowCode, resolverType: resolution.resolverType },
    });
    return { instance: { ...instance }, task: this.cloneTask(task) };
  }

  act(scope: TenantScope, input: { taskId: string; action: WorkflowAction["action"] }): WorkflowAction {
    const task = this.tasks.find((item) => item.id === input.taskId);
    if (!task) {
      throw new FoundationError("NOT_FOUND", "Workflow task not found");
    }
    const instance = this.instances.find((item) => item.id === task.instanceId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
    if (!instance) {
      throw new FoundationError("NOT_FOUND", "Workflow instance not found");
    }
    task.status = "COMPLETED";
    instance.status = this.statusForAction(input.action);
    const action: WorkflowAction = {
      id: nextId("workflow-action", this.actions.length),
      instanceId: instance.id,
      action: input.action,
      actorUserId: scope.actorUserId,
    };
    this.actions.push(action);
    this.audit.recordMutation(scope, { action: `P01_${input.action}`, subjectRef: `workflow_actions:${action.id}`, metadata: { instanceId: instance.id } });
    this.notifications.publish(scope, {
      messageId: `WF_${input.action}`,
      channel: "IN_APP",
      relatedRef: `workflow_instances:${instance.id}`,
      mergeFields: { workflowCode: instance.workflowCode },
    });
    return { ...action };
  }

  runSyntheticHrmsFlow(scope: TenantScope, subjectEmployeeId: string): { instance: WorkflowInstance; task: WorkflowTask; action: WorkflowAction } {
    const started = this.start(scope, {
      workflowCode: "WF-PH03-SYNTHETIC-G03-LEAVE",
      subjectRef: `employees:${subjectEmployeeId}`,
      stage: "PENDING_MANAGER",
      resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId },
      asOf: "2026-07-01",
    });
    const action = this.act(scope, { taskId: started.task.id, action: "APPROVE" });
    return { instance: started.instance, task: started.task, action };
  }

  listTasks(scope: TenantScope): WorkflowTask[] {
    return this.tasks
      .filter((task) => this.instances.some((instance) => instance.id === task.instanceId && instance.tenantId === scope.tenantId && (!scope.entityId || instance.entityId === scope.entityId)))
      .map((task) => this.cloneTask(task));
  }

  getInstance(scope: TenantScope, instanceId: string): WorkflowInstance {
    requireTenantScope(scope);
    const instance = this.instances.find((item) => item.id === instanceId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
    if (!instance) {
      throw new FoundationError("NOT_FOUND", "Workflow instance not found");
    }
    return { ...instance };
  }

  actOnInstance(scope: TenantScope, input: { instanceId: string; action: WorkflowAction["action"] }): WorkflowAction {
    this.getInstance(scope, input.instanceId);
    const task = this.tasks
      .filter((item) => item.instanceId === input.instanceId)
      .sort((left, right) => right.id.localeCompare(left.id))[0];
    if (!task) {
      throw new FoundationError("NOT_FOUND", "Workflow task not found");
    }
    return this.act(scope, { taskId: task.id, action: input.action });
  }

  private statusForAction(action: WorkflowAction["action"]): WorkflowInstance["status"] {
    switch (action) {
      case "APPROVE":
        return "APPROVED";
      case "REJECT":
        return "REJECTED";
      case "SEND_BACK":
        return "SENT_BACK";
      case "CANCEL":
        return "CANCELLED";
      case "ADVANCE":
      case "DELEGATE":
      case "QUERY":
        return "RUNNING";
    }
  }

  private cloneTask(task: WorkflowTask): WorkflowTask {
    return {
      ...task,
      resolution: {
        ...task.resolution,
        selectedAssignees: task.resolution.selectedAssignees.map((assignee) => ({ ...assignee })),
        candidates: task.resolution.candidates.map((assignee) => ({ ...assignee })),
        evidence: { ...task.resolution.evidence },
      },
    };
  }
}
