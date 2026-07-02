import { WorkflowTaskSummary } from "../api/hrmsClient";

export interface InboxProps {
  tasks: WorkflowTaskSummary[];
  selectedTaskId?: string;
  onSelectTask: (taskId: string) => void;
}

export function Inbox({ tasks, selectedTaskId, onSelectTask }: InboxProps) {
  const pendingCount = tasks.filter((task) => task.status === "PENDING").length;

  return (
    <section className="workflow-panel" id="inbox" aria-label="Inbox">
      <div className="panel-heading">
        <div>
          <h2>Inbox</h2>
          <p>P01 workflow tasks routed to the selected workspace.</p>
        </div>
        <strong>{pendingCount} pending</strong>
      </div>
      {tasks.length === 0 ? (
        <p>No workflow task is pending in this workspace.</p>
      ) : (
        <ul className="inbox-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                aria-current={task.id === selectedTaskId ? "true" : undefined}
                className={task.id === selectedTaskId ? "inbox-item active" : "inbox-item"}
                onClick={() => onSelectTask(task.id)}
                type="button"
              >
                <span>
                  <strong>{task.stage}</strong>
                  <small>{task.instanceId}</small>
                </span>
                <em>{task.status}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="inbox-note">Select a task to open action controls, comments, delegation, query, and audit history.</p>
    </section>
  );
}
