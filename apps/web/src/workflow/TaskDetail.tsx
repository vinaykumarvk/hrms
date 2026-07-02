import { useState } from "react";
import { HrmsClient, WorkflowTaskSummary } from "../api/hrmsClient";
import { TaskActionPanel } from "./TaskActionPanel";
import { submitTaskAction, TaskActionInput } from "./taskActions";

export interface TaskDetailProps {
  task: WorkflowTaskSummary;
  client: HrmsClient;
  onActionComplete: () => void;
}

export function TaskDetail({ task, client, onActionComplete }: TaskDetailProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);

  async function handleSubmitAction(input: TaskActionInput): Promise<void> {
    setSubmitting(true);
    setSubmitErrorCode(null);
    const result = await submitTaskAction(client, task, input, crypto.randomUUID());
    setSubmitting(false);
    if (result.kind === "failed") {
      setSubmitErrorCode(result.errorCode);
      return;
    }
    if (result.kind === "submitted") {
      onActionComplete();
    }
  }

  return (
    <article className="workflow-panel" aria-label="Task detail">
      <h2>Task detail</h2>
      <dl className="task-facts">
        <div>
          <dt>Task</dt>
          <dd>{task.id}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{task.stage}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{task.status}</dd>
        </div>
      </dl>
      <section className="audit-history" aria-label="audit history">
        <h3>Audit history</h3>
        <p>Created from P01 task evidence and action history.</p>
      </section>
      <TaskActionPanel
        onSubmitAction={(input) => {
          void handleSubmitAction(input);
        }}
        submitErrorCode={submitErrorCode}
        submitting={submitting}
        taskId={task.id}
      />
    </article>
  );
}
