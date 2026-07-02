import { FormEvent, useId, useState } from "react";
import { requiresReason, TASK_ACTIONS, TaskAction, TaskActionInput, validateTaskAction } from "./taskActions";

export interface TaskActionPanelProps {
  taskId: string;
  submitting: boolean;
  submitErrorCode: string | null;
  onSubmitAction: (input: TaskActionInput) => void;
}

export function TaskActionPanel({ taskId, submitting, submitErrorCode, onSubmitAction }: TaskActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<TaskAction>("approve");
  const [reason, setReason] = useState("");
  const [delegateTo, setDelegateTo] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const reasonErrorId = useId();
  const mandatoryReason = requiresReason(selectedAction);
  const helperText = mandatoryReason
    ? "mandatory reason required for reject, send-back, and cancel"
    : "reason optional for this workflow action";

  function selectAction(action: TaskAction): void {
    setSelectedAction(action);
    setFieldError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const input: TaskActionInput = { action: selectedAction, reason, delegateTo };
    const validation = validateTaskAction(input);
    if (validation) {
      setFieldError(validation);
      return;
    }
    setFieldError(null);
    onSubmitAction(input);
  }

  return (
    <section className="workflow-panel" aria-label={`Task action panel ${taskId}`}>
      <h2>Task actions</h2>
      <form onSubmit={handleSubmit} aria-label="Workflow task action form">
        <div className="action-row" role="group" aria-label="Workflow actions">
          {TASK_ACTIONS.map((action) => (
            <button
              aria-pressed={selectedAction === action}
              className={selectedAction === action ? "action-button active" : "action-button"}
              key={action}
              onClick={() => selectAction(action)}
              type="button"
            >
              {action}
            </button>
          ))}
        </div>
        <label className="reason-field" htmlFor={`${reasonErrorId}-reason`}>
          Reason / comment
        </label>
        <textarea
          aria-describedby={reasonErrorId}
          aria-invalid={fieldError !== null || undefined}
          aria-required={mandatoryReason}
          id={`${reasonErrorId}-reason`}
          onChange={(event) => setReason(event.target.value)}
          required={mandatoryReason}
          value={reason}
        />
        {selectedAction === "delegate" ? (
          <>
            <label htmlFor={`${reasonErrorId}-delegate`}>Delegate to (user id)</label>
            <input
              id={`${reasonErrorId}-delegate`}
              onChange={(event) => setDelegateTo(event.target.value)}
              required
              type="text"
              value={delegateTo}
            />
          </>
        ) : null}
        <p className={fieldError ? "validation-message blocked" : "validation-message"} id={reasonErrorId} role={fieldError ? "alert" : undefined}>
          {fieldError ?? helperText}
        </p>
        {submitErrorCode ? (
          <p className="submit-error" role="alert">
            The workflow action failed with error code <code>{submitErrorCode}</code>. The task was not actioned; try again.
          </p>
        ) : null}
        <button disabled={submitting} type="submit">
          {submitting ? "Submitting action…" : "Submit action"}
        </button>
      </form>
    </section>
  );
}
