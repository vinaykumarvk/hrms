export type WorkspaceId = "me" | "team" | "admin";

export interface WorkspaceOption {
  id: WorkspaceId;
  label: "Me" | "My Team" | "Admin";
  requiredPermission: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  requiredPermission: string;
}

export const workspaceOptions: WorkspaceOption[] = [
  { id: "me", label: "Me", requiredPermission: "workspace.me" },
  { id: "team", label: "My Team", requiredPermission: "workspace.team" },
  { id: "admin", label: "Admin", requiredPermission: "workspace.admin" },
];

// One navigation entry per BRD module workspace (G01-G14), plus the workflow
// inbox and configuration console. Each entry carries the module's read
// permission from the API permission families (gNN.* prefixes) so the shell
// only shows destinations the session actually grants.
export const primaryNavigation: NavItem[] = [
  { id: "inbox", label: "Inbox", href: "#inbox", requiredPermission: "p01.workflow.read" },
  { id: "employees", label: "Employees", href: "#employees", requiredPermission: "g01.employee.read" },
  { id: "personal-details", label: "Personal Details", href: "#personal-details", requiredPermission: "g02.change.read" },
  { id: "attendance-leave", label: "Attendance & Leave", href: "#attendance-leave", requiredPermission: "g03.leave.read" },
  { id: "leave-sr-relay", label: "Leave-SR Relay", href: "#leave-sr-relay", requiredPermission: "g04.relay.read" },
  { id: "transfers", label: "Transfers", href: "#transfers", requiredPermission: "g05.transfer.read" },
  { id: "promotions", label: "Promotions", href: "#promotions", requiredPermission: "g06.promotion.read" },
  { id: "training", label: "Training", href: "#training", requiredPermission: "g07.training.read" },
  { id: "apar", label: "APAR", href: "#apar", requiredPermission: "g08.apar.read" },
  { id: "disciplinary", label: "Disciplinary", href: "#disciplinary", requiredPermission: "g09.case.read" },
  { id: "payroll", label: "Payroll", href: "#payroll", requiredPermission: "g10.payroll.read" },
  { id: "pension-retirement", label: "Pension & Retirement", href: "#pension-retirement", requiredPermission: "g11.pension.read" },
  { id: "service-register", label: "Service Register", href: "#service-register", requiredPermission: "g12.sr.read" },
  { id: "documents", label: "Documents", href: "#documents", requiredPermission: "g13.document.read" },
  { id: "analytics", label: "Analytics", href: "#analytics", requiredPermission: "g14.analytics.read" },
  { id: "workflow-config", label: "Workflow Config", href: "#workflow-config", requiredPermission: "p01.workflow.config.review" },
];

export function canAccess(permissions: readonly string[], requiredPermission: string): boolean {
  return permissions.includes("*") || permissions.includes(requiredPermission);
}
