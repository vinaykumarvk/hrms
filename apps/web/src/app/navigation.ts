export type WorkspaceId = "me" | "team" | "admin";

export interface WorkspaceOption {
  id: WorkspaceId;
  label: "Me" | "My Team" | "Admin";
  requiredPermission: string;
}

export interface NavItem {
  id: string;
  label: "Inbox" | "Employees" | "Service Register" | "Documents" | "Workflow Config";
  href: string;
  requiredPermission: string;
}

export const workspaceOptions: WorkspaceOption[] = [
  { id: "me", label: "Me", requiredPermission: "workspace.me" },
  { id: "team", label: "My Team", requiredPermission: "workspace.team" },
  { id: "admin", label: "Admin", requiredPermission: "workspace.admin" },
];

export const primaryNavigation: NavItem[] = [
  { id: "inbox", label: "Inbox", href: "#inbox", requiredPermission: "p01.workflow.read" },
  { id: "employees", label: "Employees", href: "#employees", requiredPermission: "g01.employee.read" },
  { id: "service-register", label: "Service Register", href: "#service-register", requiredPermission: "g12.sr.read" },
  { id: "documents", label: "Documents", href: "#documents", requiredPermission: "g13.document.read" },
  { id: "workflow-config", label: "Workflow Config", href: "#workflow-config", requiredPermission: "p01.workflow.config.review" },
];

export function canAccess(permissions: readonly string[], requiredPermission: string): boolean {
  return permissions.includes("*") || permissions.includes(requiredPermission);
}
