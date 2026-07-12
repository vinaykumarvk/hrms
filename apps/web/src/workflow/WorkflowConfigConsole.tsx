import { useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
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
  const [feedback, setFeedback] = useState("Draft ready for validation.");
  const [publishOpen, setPublishOpen] = useState(false);
  const publishButtonRef = useRef<HTMLButtonElement>(null);

  function exportEvidence(): void {
    const evidence = JSON.stringify({ draft, validation, simulation, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([evidence], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.status.toLowerCase()}-workflow-evidence.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback("Evidence export prepared from the current non-secret draft.");
  }

  return (
    <section className="workflow-panel" id="workflow-config" aria-label="Workflow Config">
      <h2>Workflow Config</h2>
      <p>YAML backed validate, simulate, submit for review, publish, maker-checker, and evidence export controls.</p>
      <label className="yaml-field">
        YAML
        <textarea value={draft.yaml} onChange={(event) => setDraft({ ...draft, yaml: event.target.value, status: "DRAFT" })} />
      </label>
      <div className="action-row">
        <Button type="button" variant="secondary" onClick={() => setFeedback(validation.valid ? "Validation passed." : `Validation failed: ${validation.messages.join(", ")}`)}>Validate</Button>
        <Button type="button" variant="secondary" onClick={() => setFeedback(`Simulation path: ${simulation.resolverPath.join(" → ")}`)}>Simulate</Button>
        <Button type="button" disabled={!validation.valid} onClick={() => { setDraft(submitForReview(draft)); setFeedback("Draft submitted for checker review."); }}>Submit for review</Button>
        <Button type="button" disabled={draft.status !== "IN_REVIEW"} onClick={() => setPublishOpen(true)} ref={publishButtonRef} variant="destructive">Publish</Button>
        <Button type="button" variant="secondary" onClick={exportEvidence}>Evidence export</Button>
      </div>
      <p aria-live="polite" role="status">{feedback}</p>
      <p>Status: {draft.status}</p>
      <p>Validation: {validation.valid ? "valid" : validation.messages.join(", ")}</p>
      <p>Simulation: {simulation.resolverPath.join(" -> ")}</p>
      <Dialog
        description="Publishing makes this reviewed workflow definition active. This terminal action is recorded under the checker identity."
        onOpenChange={setPublishOpen}
        open={publishOpen}
        returnFocusRef={publishButtonRef}
        title="Publish workflow configuration?"
      >
        <div className="action-row">
          <Button type="button" variant="secondary" onClick={() => setPublishOpen(false)}>Keep in review</Button>
          <Button type="button" variant="destructive" onClick={() => { setDraft(publishWorkflowConfig(draft, "checker-001")); setFeedback("Workflow configuration published by checker."); setPublishOpen(false); }}>Publish configuration</Button>
        </div>
      </Dialog>
    </section>
  );
}
