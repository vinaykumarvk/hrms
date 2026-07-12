import { WorkspaceId, WorkspaceOption, workspaceOptions } from "./navigation";

export interface WorkspaceSwitcherProps {
  activeWorkspace: WorkspaceId;
  permissions: readonly string[];
  onWorkspaceChange: (workspace: WorkspaceId) => void;
}

export function WorkspaceSwitcher({ activeWorkspace, permissions, onWorkspaceChange }: WorkspaceSwitcherProps) {
  const visible = workspaceOptions.filter((workspace) => permissions.includes(workspace.requiredPermission));
  return (
    <div className="workspace-switcher" aria-label="Workspace switcher">
      {visible.map((workspace: WorkspaceOption) => (
        <button
          aria-current={workspace.id === activeWorkspace ? "page" : undefined}
          className={workspace.id === activeWorkspace ? "workspace-tab active" : "workspace-tab"}
          key={workspace.id}
          onClick={() => onWorkspaceChange(workspace.id)}
          type="button"
        >
          {workspace.label}
        </button>
      ))}
    </div>
  );
}
