import { ReactNode, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight, BadgeCheck, BookOpen, CalendarDays, ChartNoAxesCombined,
  ClipboardCheck, FolderLock, GraduationCap, Inbox, IndianRupee, Landmark,
  Menu, RefreshCw, Scale, UserRoundPen, Users, Workflow,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Drawer } from "../components/ui/Drawer";
import { canAccess, NavItem, primaryNavigation, WorkspaceId } from "./navigation";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const icons = {
  "arrow-left-right": ArrowLeftRight,
  "badge-up": BadgeCheck,
  "book-open": BookOpen,
  "calendar-days": CalendarDays,
  "chart-no-axes-combined": ChartNoAxesCombined,
  "clipboard-check": ClipboardCheck,
  "folder-lock": FolderLock,
  "graduation-cap": GraduationCap,
  inbox: Inbox,
  "indian-rupee": IndianRupee,
  landmark: Landmark,
  "refresh-cw": RefreshCw,
  scale: Scale,
  "user-round-pen": UserRoundPen,
  users: Users,
  workflow: Workflow,
};

export interface AppShellProps {
  permissions: readonly string[];
  sessionUser?: string;
  activeWorkspace: WorkspaceId;
  activePath: string;
  onNavigate: (path: string) => void;
  onWorkspaceChange: (workspace: WorkspaceId) => void;
  onSignOut?: () => void;
  children: ReactNode;
}

export function AppShell({ permissions, sessionUser, activeWorkspace, activePath, onNavigate, onWorkspaceChange, onSignOut, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocusRef = useRef(true);
  const visibleNavigation = useMemo(
    () => primaryNavigation.filter((item) => item.workspace === activeWorkspace && canAccess(permissions, item.requiredPermission)),
    [activeWorkspace, permissions]
  );

  const navigate = (path: string) => {
    restoreMenuFocusRef.current = false;
    setMenuOpen(false);
    onNavigate(path);
  };

  return (
    <main className="hrms-app" aria-label="HRMS shell">
      <header className="hrms-topbar">
        <Button aria-expanded={menuOpen} aria-label="Open menu" className="mobile-menu-button" onClick={() => { restoreMenuFocusRef.current = true; setMenuOpen(true); }} ref={menuButtonRef} type="button" variant="secondary">
          <Menu aria-hidden="true" className="size-5" />
        </Button>
        <div className="app-heading">
          <p className="eyebrow">Government HRMS</p>
          <h1>Operations Workspace</h1>
        </div>
        <WorkspaceSwitcher activeWorkspace={activeWorkspace} permissions={permissions} onWorkspaceChange={onWorkspaceChange} />
        {sessionUser ? (
          <div className="session-status">
            <span>Signed in as {sessionUser}</span>
            {onSignOut ? <Button type="button" variant="secondary" onClick={onSignOut}>Sign out</Button> : null}
          </div>
        ) : null}
      </header>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} returnFocusRef={restoreMenuFocusRef.current ? menuButtonRef : undefined} title={`${labelForWorkspace(activeWorkspace)} navigation`}>
        <Navigation activePath={activePath} items={visibleNavigation} onNavigate={navigate} />
      </Drawer>

      <div className="layout-grid">
        <aside className="sidebar" aria-label="Primary navigation">
          <Navigation activePath={activePath} items={visibleNavigation} onNavigate={navigate} />
        </aside>
        <section className="content-surface" aria-label={`${labelForWorkspace(activeWorkspace)} workspace content`}>
          <p className="workspace-label">Workspace: {labelForWorkspace(activeWorkspace)}</p>
          {children}
        </section>
      </div>
    </main>
  );
}

function Navigation({ activePath, items, onNavigate }: { activePath: string; items: readonly NavItem[]; onNavigate: (path: string) => void }) {
  return (
    <nav aria-label="Main navigation">
      {items.map((item) => {
        const Icon = icons[item.icon as keyof typeof icons] ?? BookOpen;
        return (
          <a
            aria-current={item.href === activePath ? "page" : undefined}
            className={item.href === activePath ? "nav-link active" : "nav-link"}
            href={item.href}
            key={item.id}
            onClick={(event) => { event.preventDefault(); onNavigate(item.href); }}
          >
            <Icon aria-hidden="true" className="nav-icon" />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function labelForWorkspace(workspace: WorkspaceId): string {
  if (workspace === "team") return "My Team";
  if (workspace === "admin") return "Admin";
  return "Me";
}
