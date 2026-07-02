import { HrmsApiError, HrmsClient, WorkflowTaskSummary } from "../api/hrmsClient";

export type InboxViewState =
  | { kind: "loading" }
  | { kind: "error"; errorCode: string }
  | { kind: "ready"; tasks: WorkflowTaskSummary[] };

/** Loads the inbox task queue, catching API failures into the canonical error state. */
export async function loadInboxTasks(client: HrmsClient): Promise<InboxViewState> {
  try {
    const result = await client.listWorkflowTasks();
    return { kind: "ready", tasks: result.items };
  } catch (error) {
    return { kind: "error", errorCode: error instanceof HrmsApiError ? error.code : "UNKNOWN_ERROR" };
  }
}
