export type WorkflowConfigStatus = "DRAFT" | "VALIDATED" | "IN_REVIEW" | "PUBLISHED";

export interface WorkflowConfigDraft {
  yaml: string;
  makerUserId: string;
  checkerUserId?: string;
  status: WorkflowConfigStatus;
}

export interface WorkflowValidationResult {
  valid: boolean;
  messages: string[];
}

export interface WorkflowSimulationResult {
  resolverPath: string[];
  evidence: string[];
}

export function validateWorkflowYaml(draft: WorkflowConfigDraft): WorkflowValidationResult {
  const messages: string[] = [];
  if (!draft.yaml.includes("workflowCode:")) {
    messages.push("YAML must include workflowCode");
  }
  if (!draft.yaml.includes("stages:")) {
    messages.push("YAML must include stages");
  }
  if (!draft.yaml.includes("resolver:")) {
    messages.push("YAML must include resolver");
  }
  return { valid: messages.length === 0, messages };
}

export function simulateWorkflowConfig(draft: WorkflowConfigDraft): WorkflowSimulationResult {
  const validation = validateWorkflowYaml(draft);
  return {
    resolverPath: validation.valid ? ["employee", "reporting-manager", "authority"] : ["blocked"],
    evidence: validation.valid ? ["simulate resolver", "audit history", "evidence export"] : validation.messages,
  };
}

export function submitForReview(draft: WorkflowConfigDraft): WorkflowConfigDraft {
  const validation = validateWorkflowYaml(draft);
  return validation.valid ? { ...draft, status: "IN_REVIEW" } : draft;
}

export function canPublish(draft: WorkflowConfigDraft, actorUserId: string): boolean {
  return draft.status === "IN_REVIEW" && Boolean(draft.checkerUserId) && draft.makerUserId !== actorUserId && draft.checkerUserId === actorUserId;
}

export function publishWorkflowConfig(draft: WorkflowConfigDraft, actorUserId: string): WorkflowConfigDraft {
  if (!canPublish(draft, actorUserId)) {
    return draft;
  }
  return { ...draft, status: "PUBLISHED" };
}
