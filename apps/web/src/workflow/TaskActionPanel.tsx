import { useMemo, useState } from "react";

export type TaskAction = "approve" | "reject" | "send-back" | "delegate" | "cancel" | "query" | "advance";

export interface TaskActionPanelProps {
  taskId: string;
  onAction: (action: TaskAction, reason: string) => void;
}

const actions: TaskAction[] = ["approve", "reject", "send-back", "delegate", "cancel", "query", "advance"];
const reasonRequired: TaskAction[] = ["reject", "send-back", "cancel"];

export function TaskActionPanel({ taskId, onAction }: TaskActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<TaskAction>("approve");
  const [reason, setReason] = useState("");
  const mandatoryReason = reasonRequired.includes(selectedAction);
  const blocked = mandatoryReason && reason.trim().length === 0;
  const helperText = useMemo(
    () => (mandatoryReason ? "mandatory reason required for reject, send-back, and cancel" : "reason optional for this workflow action"),
    [mandatoryReason]
  );

  return (
    <section className="workflow-panel" aria-label={`Task action panel ${taskId}`}>
      <h2>Task actions</h2>
      <div className="action-row" role="group" aria-label="Workflow actions">
        {actions.map((action) => (
          <button
            className={selectedAction === action ? "action-button active" : "action-button"}
            key={action}
            onClick={() => setSelectedAction(action)}
            type="button"
          >
            {action}
          </button>
        ))}
      </div>
      <label className="reason-field">
        Reason
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <p className={blocked ? "validation-message blocked" : "validation-message"}>{helperText}</p>
      <button disabled={blocked} onClick={() => onAction(selectedAction, reason)} type="button">
        Submit action
      </button>
    </section>
  );
}
