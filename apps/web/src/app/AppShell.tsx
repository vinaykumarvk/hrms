import { ReactNode, useMemo, useState } from "react";
import { primaryNavigation, WorkspaceId } from "./navigation";
import { RouteGuard } from "./RouteGuard";
import { StandardOperationalStates } from "./OperationalStates";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export interface AppShellProps {
  permissions: readonly string[];
  children: ReactNode;
}

export function AppShell({ permissions, children }: AppShellProps) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>("me");
  const visibleNavigation = useMemo(
    () => primaryNavigation.filter((item) => permissions.includes("*") || permissions.includes(item.requiredPermission)),
    [permissions]
  );

  return (
    <main className="hrms-app" aria-label="HRMS shell">
      <header className="hrms-topbar">
        <div>
          <p className="eyebrow">Government HRMS</p>
          <h1>Operations Workspace</h1>
        </div>
        <WorkspaceSwitcher activeWorkspace={activeWorkspace} onWorkspaceChange={setActiveWorkspace} />
      </header>

      <div className="layout-grid">
        <aside className="sidebar" aria-label="Primary navigation">
          <nav>
            {visibleNavigation.map((item) => (
              <a href={item.href} key={item.id}>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>
        <section className="content-surface">
          <p className="workspace-label">Workspace: {labelForWorkspace(activeWorkspace)}</p>
          <RouteGuard permissions={permissions} requiredPermission="p01.workflow.read">
            {children}
          </RouteGuard>
          <StandardOperationalStates />
        </section>
      </div>
    </main>
  );
}

function labelForWorkspace(workspace: WorkspaceId): string {
  switch (workspace) {
    case "me":
      return "Me";
    case "team":
      return "My Team";
    case "admin":
      return "Admin";
  }
}
