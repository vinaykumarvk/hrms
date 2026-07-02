import { HrmsApiError, HrmsClient, WorkflowInstanceActionVerb, WorkflowTaskActionVerb, WorkflowTaskSummary } from "../api/hrmsClient";

export type TaskAction = "claim" | "approve" | "reject" | "send-back" | "delegate" | "cancel" | "query" | "advance";

export const TASK_ACTIONS: TaskAction[] = ["claim", "approve", "reject", "send-back", "delegate", "cancel", "query", "advance"];

/** Actions that must not submit without a reason/comment. Client-side guard only — the server remains the authority. */
export const REASON_REQUIRED_ACTIONS: TaskAction[] = ["reject", "send-back", "cancel"];

/** Verbs served by the task-grain PH-04B routes; every other verb acts on the parent workflow instance. */
const TASK_GRAIN_ACTIONS: TaskAction[] = ["claim", "approve", "reject", "delegate"];

export interface TaskActionInput {
  action: TaskAction;
  reason: string;
  delegateTo?: string;
}

export type TaskActionResult =
  | { kind: "submitted" }
  | { kind: "invalid"; fieldError: string }
  | { kind: "failed"; errorCode: string };

export function requiresReason(action: TaskAction): boolean {
  return REASON_REQUIRED_ACTIONS.includes(action);
}

/** Returns a field-level validation message, or null when the input may be submitted. */
export function validateTaskAction(input: TaskActionInput): string | null {
  if (requiresReason(input.action) && input.reason.trim().length === 0) {
    return `A reason/comment is mandatory before ${input.action} can be submitted.`;
  }
  if (input.action === "delegate" && (input.delegateTo ?? "").trim().length === 0) {
    return "A delegate user id is required before delegate can be submitted.";
  }
  return null;
}

/**
 * Submits one task action through the injected API client. Refuses invalid input,
 * maps the verb to the task-grain or instance-grain route, and converts API
 * failures into the sanitized envelope error code — never a raw stack.
 */
export async function submitTaskAction(
  client: HrmsClient,
  task: WorkflowTaskSummary,
  input: TaskActionInput,
  idempotencyKey: string
): Promise<TaskActionResult> {
  const fieldError = validateTaskAction(input);
  if (fieldError) {
    return { kind: "invalid", fieldError };
  }
  const reason = input.reason.trim().length > 0 ? input.reason.trim() : undefined;
  try {
    if (TASK_GRAIN_ACTIONS.includes(input.action)) {
      await client.actOnWorkflowTask(
        task.id,
        input.action as WorkflowTaskActionVerb,
        { reason, toUserId: input.action === "delegate" ? input.delegateTo?.trim() : undefined },
        idempotencyKey
      );
    } else {
      await client.actOnWorkflowInstance(task.instanceId, input.action as WorkflowInstanceActionVerb, { reason }, idempotencyKey);
    }
    return { kind: "submitted" };
  } catch (error) {
    return { kind: "failed", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}
