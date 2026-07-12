export type UiPersonaId = "employee" | "manager" | "admin" | "denied_user";

export interface UiPersona {
  id: UiPersonaId;
  userId: string;
  displayName: string;
  workspaces: readonly ("me" | "team" | "admin")[];
  permissions: readonly string[];
}

export const UI_PERSONAS: Readonly<Record<UiPersonaId, UiPersona>> = {
  employee: {
    id: "employee",
    userId: "10000000-0000-4000-8000-000000000001",
    displayName: "Employee Fixture",
    workspaces: ["me"],
    permissions: ["workspace.me", "p01.workflow.read", "g01.employee.read", "g02.change.read", "g03.leave.read", "g03.leave.apply", "g12.sr.read", "g13.document.read"],
  },
  manager: {
    id: "manager",
    userId: "10000000-0000-4000-8000-000000000002",
    displayName: "Manager Fixture",
    workspaces: ["me", "team"],
    permissions: ["workspace.me", "workspace.team", "p01.workflow.read", "g01.employee.read", "g02.change.read", "g03.leave.read", "g05.transfer.read", "g06.promotion.read", "g07.training.read", "g08.apar.read", "g09.case.read"],
  },
  admin: {
    id: "admin",
    userId: "10000000-0000-4000-8000-000000000003",
    displayName: "Administrator Fixture",
    workspaces: ["me", "team", "admin"],
    permissions: ["workspace.me", "workspace.team", "workspace.admin", "p01.workflow.read", "p01.workflow.config.review", "g01.employee.read", "g04.relay.read", "g10.payroll.read", "g10.payroll.run.create", "g11.pension.read", "g14.analytics.read"],
  },
  denied_user: {
    id: "denied_user",
    userId: "10000000-0000-4000-8000-000000000004",
    displayName: "Denied Fixture",
    workspaces: ["me"],
    permissions: ["workspace.me"],
  },
};

