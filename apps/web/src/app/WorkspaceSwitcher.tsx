import { WorkspaceId, WorkspaceOption, workspaceOptions } from "./navigation";

export interface WorkspaceSwitcherProps {
  activeWorkspace: WorkspaceId;
  onWorkspaceChange: (workspace: WorkspaceId) => void;
}

export function WorkspaceSwitcher({ activeWorkspace, onWorkspaceChange }: WorkspaceSwitcherProps) {
  return (
    <div className="workspace-switcher" role="tablist" aria-label="Workspace switcher">
      {workspaceOptions.map((workspace: WorkspaceOption) => (
        <button
          aria-selected={workspace.id === activeWorkspace}
          className={workspace.id === activeWorkspace ? "workspace-tab active" : "workspace-tab"}
          key={workspace.id}
          onClick={() => onWorkspaceChange(workspace.id)}
          role="tab"
          type="button"
        >
          {workspace.label}
        </button>
      ))}
    </div>
  );
}
