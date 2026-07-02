import { useMemo, useState } from "react";
import {
  WorkflowConfigDraft,
  publishWorkflowConfig,
  simulateWorkflowConfig,
  submitForReview,
  validateWorkflowYaml,
} from "./workflowConfigModel";

const initialYaml = `workflowCode: WF-G03-LEAVE
stages:
  - PENDING_MANAGER
resolver: REPORTING_CHAIN
`;

export function WorkflowConfigConsole() {
  const [draft, setDraft] = useState<WorkflowConfigDraft>({
    yaml: initialYaml,
    makerUserId: "maker-001",
    checkerUserId: "checker-001",
    status: "DRAFT",
  });
  const validation = useMemo(() => validateWorkflowYaml(draft), [draft]);
  const simulation = useMemo(() => simulateWorkflowConfig(draft), [draft]);

  return (
    <section className="workflow-panel" id="workflow-config" aria-label="Workflow Config">
      <h2>Workflow Config</h2>
      <p>YAML backed validate, simulate, submit for review, publish, maker-checker, and evidence export controls.</p>
      <label className="yaml-field">
        YAML
        <textarea value={draft.yaml} onChange={(event) => setDraft({ ...draft, yaml: event.target.value, status: "DRAFT" })} />
      </label>
      <div className="action-row">
        <button type="button" onClick={() => validateWorkflowYaml(draft)}>
          validate
        </button>
        <button type="button" onClick={() => simulateWorkflowConfig(draft)}>
          simulate
        </button>
        <button type="button" disabled={!validation.valid} onClick={() => setDraft(submitForReview(draft))}>
          submit for review
        </button>
        <button type="button" disabled={draft.status !== "IN_REVIEW"} onClick={() => setDraft(publishWorkflowConfig(draft, "checker-001"))}>
          publish
        </button>
        <button type="button">evidence export</button>
      </div>
      <p>Status: {draft.status}</p>
      <p>Validation: {validation.valid ? "valid" : validation.messages.join(", ")}</p>
      <p>Simulation: {simulation.resolverPath.join(" -> ")}</p>
    </section>
  );
}
