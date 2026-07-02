import { WorkflowTaskSummary } from "../api/hrmsClient";
import { TaskAction, TaskActionPanel } from "./TaskActionPanel";

export interface TaskDetailProps {
  task: WorkflowTaskSummary;
}

export function TaskDetail({ task }: TaskDetailProps) {
  function recordAction(action: TaskAction, reason: string): void {
    window.dispatchEvent(
      new CustomEvent("hrms-task-action", {
        detail: { taskId: task.id, action, reason },
      })
    );
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
      <TaskActionPanel taskId={task.id} onAction={recordAction} />
    </article>
  );
}
