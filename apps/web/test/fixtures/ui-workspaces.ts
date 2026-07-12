import type { UiPersonaId } from "./ui-personas";

export interface UiWorkspaceFixture {
  workspace: "me" | "team" | "admin";
  ownerPersona: UiPersonaId;
  recordIds: readonly string[];
}

export const UI_WORKSPACE_FIXTURES: readonly UiWorkspaceFixture[] = [
  { workspace: "me", ownerPersona: "employee", recordIds: ["ME-EMP-001", "ME-LV-001"] },
  { workspace: "team", ownerPersona: "manager", recordIds: ["TEAM-TASK-001", "TEAM-EMP-001"] },
  { workspace: "admin", ownerPersona: "admin", recordIds: ["ADMIN-WF-001", "ADMIN-PAY-001"] },
];

export function fixturesForWorkspace(workspace: UiWorkspaceFixture["workspace"]): readonly UiWorkspaceFixture[] {
  return UI_WORKSPACE_FIXTURES.filter((fixture) => fixture.workspace === workspace);
}

