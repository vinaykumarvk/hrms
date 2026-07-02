import { ReactNode, useMemo, useState } from "react";
import { canAccess, primaryNavigation, WorkspaceId } from "./navigation";
import { StandardOperationalStates } from "./OperationalStates";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export interface AppShellProps {
  /** Session-derived permission grants; never a hardcoded wildcard. */
  permissions: readonly string[];
  /** Display name of the signed-in user, shown in the top bar. */
  sessionUser?: string;
  /** Ends the current session and returns the shell to the sign-in state. */
  onSignOut?: () => void;
  children: ReactNode;
}

export function AppShell({ permissions, sessionUser, onSignOut, children }: AppShellProps) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>("me");
  const visibleNavigation = useMemo(
    () => primaryNavigation.filter((item) => canAccess(permissions, item.requiredPermission)),
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
        {sessionUser ? (
          <div className="session-status">
            <span>Signed in as {sessionUser}</span>
            {onSignOut ? (
              <button type="button" onClick={onSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        ) : null}
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
          {children}
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
