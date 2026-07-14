import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../audit/auditService";
import { AuthorityResolutionService, ResolverRule, AuthorityResolution } from "../authority-resolution/authorityResolutionService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../types";

/**
 * Roles treated as an org-wide override for the resolved-approver check below (auth-matrix.yaml
 * scope:entity/global tiers — hr_admin, leave_admin, hrbp, sanctioning_authority,
 * transfer_authority — plus the seed/system actor). Holding one of these roles, or the wildcard
 * `*` permission, lets an actor decide a task without being the individually-resolved assignee.
 */
const APPROVAL_OVERRIDE_ROLES = new Set(["hr_admin", "leave_admin", "hrbp", "sanctioning_authority", "transfer_authority", "system"]);

/** Decision actions where auth-matrix.yaml requires "approver != applicant" / team-scoped identity, not just a permission string. */
const IDENTITY_ENFORCED_ACTIONS = new Set<WorkflowAction["action"]>(["APPROVE", "REJECT", "SEND_BACK"]);

function isOverrideActor(actor: ActorContext): boolean {
  if (actor.permissions?.includes("*")) {
    return true;
  }
  return actor.roles?.some((role) => APPROVAL_OVERRIDE_ROLES.has(role)) ?? false;
}

/** True when the resolution didn't name individual employees (ROLE/QUEUE/EXTERNAL routing), or when
 *  the acting user is one of the named employees (matched by convention: ActorContext.userId carries
 *  the employee id for employee-issued sessions, per apps/web/src/app/session.ts). */
function isResolvedAssignee(actor: ActorContext, resolution: AuthorityResolution): boolean {
  const employeeAssignees = resolution.selectedAssignees.filter((assignee) => assignee.type === "EMPLOYEE" && assignee.employeeId);
  if (employeeAssignees.length === 0) {
    return true;
  }
  return employeeAssignees.some((assignee) => assignee.employeeId === actor.userId || assignee.userId === actor.userId);
}

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
  status: "PENDING" | "CLAIMED" | "COMPLETED";
  claimedByUserId?: string;
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
    if (IDENTITY_ENFORCED_ACTIONS.has(input.action)) {
      const actor = scope as ActorContext;
      if (!isOverrideActor(actor) && !isResolvedAssignee(actor, task.resolution)) {
        throw new FoundationError("FORBIDDEN", "Only the resolved approver (or an authorized override role) may decide this task", {
          field: "actor",
          details: { action: input.action, instanceId: instance.id },
        });
      }
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

  /** Task-grain claim: the acting user takes ownership of a pending task (state mutation, audited). */
  claimTask(scope: TenantScope, input: { taskId: string }): WorkflowTask {
    const task = this.getMutableScopedTask(scope, input.taskId);
    if (task.status === "COMPLETED") {
      throw new FoundationError("CONFLICT", "Workflow task is already completed");
    }
    task.status = "CLAIMED";
    task.claimedByUserId = scope.actorUserId;
    this.audit.recordMutation(scope, {
      action: "P01_TASK_CLAIM",
      subjectRef: `workflow_tasks:${task.id}`,
      metadata: { instanceId: task.instanceId, claimedByUserId: scope.actorUserId },
    });
    return this.cloneTask(task);
  }

  /** Task-grain delegate: reassigns an open task to another user with an audited action record. */
  delegateTask(scope: TenantScope, input: { taskId: string; toUserId: string; reason?: string }): { task: WorkflowTask; action: WorkflowAction } {
    if (!input.toUserId) {
      throw new FoundationError("VALIDATION_FAILED", "toUserId is required", { field: "toUserId" });
    }
    const task = this.getMutableScopedTask(scope, input.taskId);
    if (task.status === "COMPLETED") {
      throw new FoundationError("CONFLICT", "Workflow task is already completed");
    }
    task.status = "CLAIMED";
    task.claimedByUserId = input.toUserId;
    const action: WorkflowAction = {
      id: nextId("workflow-action", this.actions.length),
      instanceId: task.instanceId,
      action: "DELEGATE",
      actorUserId: scope.actorUserId,
    };
    this.actions.push(action);
    this.audit.recordMutation(scope, {
      action: "P01_TASK_DELEGATE",
      subjectRef: `workflow_tasks:${task.id}`,
      metadata: { instanceId: task.instanceId, toUserId: input.toUserId, reason: input.reason ?? "" },
    });
    this.notifications.publish(scope, {
      messageId: "WF_TASK_DELEGATE",
      channel: "IN_APP",
      relatedRef: `workflow_tasks:${task.id}`,
      mergeFields: { toUserId: input.toUserId },
    });
    return { task: this.cloneTask(task), action: { ...action } };
  }

  /** Task-grain approve/reject: completes the task and moves the instance via the audited act() path. */
  actOnTask(scope: TenantScope, input: { taskId: string; action: "APPROVE" | "REJECT" }): WorkflowAction {
    this.getMutableScopedTask(scope, input.taskId);
    return this.act(scope, { taskId: input.taskId, action: input.action });
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

  private getMutableScopedTask(scope: TenantScope, taskId: string): WorkflowTask {
    requireTenantScope(scope);
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) {
      throw new FoundationError("NOT_FOUND", "Workflow task not found");
    }
    const instance = this.instances.find(
      (item) => item.id === task.instanceId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
    if (!instance) {
      throw new FoundationError("NOT_FOUND", "Workflow instance not found");
    }
    return task;
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
