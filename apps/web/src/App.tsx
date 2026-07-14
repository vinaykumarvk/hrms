import { createHrmsClient } from "./api/hrmsClient";
import { AppShell } from "./app/AppShell";
import { LoginPanel } from "./app/LoginPanel";
import { RouteGuard } from "./app/RouteGuard";
import { endSession, HrmsSession, readSessionMessage, readStoredSession, startEmployeeSession } from "./app/session";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { primaryNavigation, workspaceForPath, WorkspaceId } from "./app/navigation";
import { WorkflowWorkspace } from "./workflow/WorkflowWorkspace";
import { WorkflowConfigConsole } from "./workflow/WorkflowConfigConsole";
import { EmployeeProfile } from "./modules/g01/EmployeeProfile";
import { EmployeeContactsPanel } from "./modules/g01/EmployeeContactsPanel";
import { EmployeeDependentsPanel } from "./modules/g01/EmployeeDependentsPanel";
import { EmployeeAddressesPanel } from "./modules/g01/EmployeeAddressesPanel";
import { EmployeeNomineesPanel } from "./modules/g01/EmployeeNomineesPanel";
import { EmployeeEmergencyContactsPanel } from "./modules/g01/EmployeeEmergencyContactsPanel";
import { EmployeeBankAccountsPanel } from "./modules/g01/EmployeeBankAccountsPanel";
import { PrivacyConsole } from "./modules/g01/PrivacyConsole";
import { PersonalDetailsWorkspace } from "./modules/g02/PersonalDetailsWorkspace";
import { ChangeRequestEditor } from "./modules/g02/ChangeRequestEditor";
import { ChangeRequestApproverQueue } from "./modules/g02/ChangeRequestApproverQueue";
import { LeaveWorkspace } from "./modules/g03/LeaveWorkspace";
import { SelfServiceSummary } from "./modules/g03/SelfServiceSummary";
import { AttendanceCapturePanel } from "./modules/g03/AttendanceCapturePanel";
import { AttendanceRegularizationPanel } from "./modules/g03/AttendanceRegularizationPanel";
import { LeaveSrRelayWorkspace } from "./modules/g04/LeaveSrRelayWorkspace";
import { TransferWorkspace } from "./modules/g05/TransferWorkspace";
import { CounsellingConsole } from "./modules/g05/CounsellingConsole";
import { MyTransfersPanel } from "./modules/g05/MyTransfersPanel";
import { MyPromotionPanel } from "./modules/g06/MyPromotionPanel";
import { MyDisciplinaryCasePanel } from "./modules/g09/MyDisciplinaryCasePanel";
import { TransferInitiateForm } from "./modules/g05/TransferInitiateForm";
import { PromotionWorkspace } from "./modules/g06/PromotionWorkspace";
import { DpcConvenePanel } from "./modules/g06/DpcConvenePanel";
import { SealedCoverReview } from "./modules/g06/SealedCoverReview";
import { TrainingWorkspace } from "./modules/g07/TrainingWorkspace";
import { TrainingNominationForm } from "./modules/g07/TrainingNominationForm";
import { MyTrainingPanel } from "./modules/g07/MyTrainingPanel";
import { MyAppraisalPanel } from "./modules/g08/MyAppraisalPanel";
import { AparWorkspace } from "./modules/g08/AparWorkspace";
import { AparTierForms } from "./modules/g08/AparTierForms";
import { DisciplinaryWorkspace } from "./modules/g09/DisciplinaryWorkspace";
import { DisciplinaryCaseWorkbench } from "./modules/g09/DisciplinaryCaseWorkbench";
import { EvidenceVaultList } from "./modules/g09/EvidenceVaultList";
import { PayrollWorkspace } from "./modules/g10/PayrollWorkspace";
import { MyPayslipsPanel } from "./modules/g10/MyPayslipsPanel";
import { PayrollRunConsole } from "./modules/g10/PayrollRunConsole";
import { PensionWorkspace } from "./modules/g11/PensionWorkspace";
import { PensionCaseConsole } from "./modules/g11/PensionCaseConsole";
import { MyPensionEstimatePanel } from "./modules/g11/MyPensionEstimatePanel";
import { MyDashboardPanel } from "./modules/g14/MyDashboardPanel";
import { AnalyticsWorkspace } from "./modules/g14/AnalyticsWorkspace";
import { EmbeddedBiDashboard } from "./modules/g14/EmbeddedBiDashboard";
import { ServiceRegisterTimeline } from "./modules/g12/ServiceRegisterTimeline";
import { MyDocumentsPanel } from "./modules/g13/MyDocumentsPanel";
import { DataSubjectRequestConsole } from "./modules/g13/DataSubjectRequestConsole";

// Composition root: the real fetch client. Base URL comes from Vite env
// configuration (empty string = same-origin). The token provider reads the
// session token persisted by the PH-05B login flow (app/session.ts); requests
// go out unauthenticated when no session exists. Every module workspace
// receives this client and resolves its own loading/error/empty/ready state
// (the canonical PH-05E pattern).
const client = createHrmsClient({
  baseUrl: (import.meta.env.VITE_HRMS_API_BASE_URL as string | undefined) ?? "",
  tokenProvider: () => window.sessionStorage.getItem("hrms.session.token"),
  onUnauthorized: () => window.dispatchEvent(new Event("hrms:unauthorized")),
});

export function App() {
  const [session, setSession] = useState<HrmsSession | null>(() => readStoredSession(window.sessionStorage));
  const [loginMessage, setLoginMessage] = useState<string | null>(() => readSessionMessage(window.sessionStorage));
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  // PH-07E: the G02 editor and approver queue share a refresh token so a newly
  // created change request appears in the queue without a full reload.
  const [g02QueueRefresh, setG02QueueRefresh] = useState(0);
  const bumpG02Queue = useCallback(() => setG02QueueRefresh((token) => token + 1), []);

  const handleSignIn = useCallback((employeeId: string, password: string): boolean => {
    const nextSession = startEmployeeSession(window.sessionStorage, employeeId, password);
    if (nextSession) {
      setSession(nextSession);
      setLoginMessage(null);
    }
    return nextSession !== null;
  }, []);

  const handleSignOut = useCallback(() => {
    endSession(window.sessionStorage);
    setSession(null);
  }, []);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!session) return;
    const expire = () => {
      endSession(window.sessionStorage);
      window.sessionStorage.setItem("hrms.session.message", "Your session ended. Sign in again to continue safely.");
      setSession(null);
      setLoginMessage("Your session ended. Sign in again to continue safely.");
    };
    const handleUnauthorized = () => expire();
    window.addEventListener("hrms:unauthorized", handleUnauthorized);
    const delay = session.expiresAt === undefined ? undefined : Math.max(0, session.expiresAt - Date.now());
    const timer = delay === undefined ? undefined : window.setTimeout(expire, delay);
    return () => {
      window.removeEventListener("hrms:unauthorized", handleUnauthorized);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [session]);

  const permissions = session?.permissions ?? [];

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  const changeWorkspace = (workspace: WorkspaceId) => {
    const destination = primaryNavigation.find((item) => item.workspace === workspace && permissions.includes(item.requiredPermission));
    if (destination) navigate(destination.href);
  };

  const effectivePath = currentPath === "/" && session ? defaultPath(permissions) : currentPath;

  useEffect(() => {
    if (session && currentPath === "/" && effectivePath !== "/") window.history.replaceState({}, "", effectivePath);
  }, [currentPath, effectivePath, session]);

  useEffect(() => {
    if (session && currentPath !== "/") document.getElementById("route-heading")?.focus();
  }, [currentPath, session]);

  if (!session) {
    return <LoginPanel message={loginMessage} onSignIn={handleSignIn} />;
  }

  return (
    <AppShell
      activePath={effectivePath}
      activeWorkspace={workspaceForPath(effectivePath)}
      onNavigate={navigate}
      onSignOut={handleSignOut}
      onWorkspaceChange={changeWorkspace}
      permissions={permissions}
      sessionUser={session.displayName}
    >
      {renderRoute(effectivePath, permissions, g02QueueRefresh, bumpG02Queue, navigate, session.userId)}
    </AppShell>
  );
}

function defaultPath(permissions: readonly string[]): string {
  return primaryNavigation.find((item) => permissions.includes(item.requiredPermission))?.href ?? "/no-permission";
}

function routePage(label: string, permission: string, permissions: readonly string[], content: ReactNode): ReactNode {
  return (
    <section aria-labelledby="route-heading" className="route-page">
      <h2 className="route-title" id="route-heading" tabIndex={-1}>{label}</h2>
      <RouteGuard permissions={permissions} requiredPermission={permission} routeLabel={label}>
        <div className="workspace-grid">{content}</div>
      </RouteGuard>
    </section>
  );
}

function renderRoute(
  path: string,
  permissions: readonly string[],
  refresh: number,
  bump: () => void,
  navigate: (path: string) => void,
  sessionEmployeeId: string
): ReactNode {
  const workspace = workspaceForPath(path);
  const workspacePermission = `workspace.${workspace}`;
  if (!permissions.includes(workspacePermission)) {
    return routePage("Restricted workspace", workspacePermission, permissions, null);
  }
  switch (path) {
    case "/me/inbox": return routePage("Workflow inbox", "p01.workflow.read", permissions, <WorkflowWorkspace client={client} />);
    case "/me/employees": return routePage("Employees", "g01.employee.read", permissions, <><EmployeeProfile client={client} /><PrivacyConsole client={client} /><EmployeeContactsPanel client={client} /><EmployeeAddressesPanel client={client} /><EmployeeDependentsPanel client={client} /><EmployeeNomineesPanel client={client} /><EmployeeEmergencyContactsPanel client={client} /><EmployeeBankAccountsPanel client={client} /></>);
    case "/me/personal-details": return routePage("Personal Details", "g02.change.read", permissions, <><PersonalDetailsWorkspace client={client} /><ChangeRequestEditor client={client} onCreated={bump} /><ChangeRequestApproverQueue client={client} refreshToken={refresh} onDecided={bump} /></>);
    case "/me/attendance-leave": return routePage("Attendance & Leave", "g03.leave.read", permissions, <><AttendanceCapturePanel client={client} /><AttendanceRegularizationPanel client={client} refreshToken={refresh} onRegularised={bump} /><LeaveWorkspace client={client} /><SelfServiceSummary client={client} /></>);
    case "/me/payslips": return routePage("Payslips", "g10.payroll.read", permissions, <MyPayslipsPanel client={client} employeeId={sessionEmployeeId} />);
    case "/me/service-register": return routePage("Service Register", "g12.sr.read", permissions, <ServiceRegisterTimeline client={client} employeeId={sessionEmployeeId} />);
    case "/me/documents": return routePage("Documents", "g13.document.read", permissions, <><MyDocumentsPanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} /><DataSubjectRequestConsole client={client} /></>);
    case "/me/transfers": return routePage("My Transfers", "g05.transfer.read", permissions, <><MyTransfersPanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} /><TransferInitiateForm client={client} defaultEmployeeId={sessionEmployeeId} onInitiated={bump} /></>);
    case "/me/promotions": return routePage("My Promotion History", "g06.promotion.read", permissions, <MyPromotionPanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} />);
    case "/me/disciplinary": return routePage("My Disciplinary Case", "g09.case.read", permissions, <MyDisciplinaryCasePanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} />);
    case "/team/transfers": return routePage("Transfers", "g05.transfer.read", permissions, <><TransferWorkspace client={client} /><CounsellingConsole client={client} /></>);
    case "/team/promotions": return routePage("Promotions", "g06.promotion.read", permissions, <><PromotionWorkspace client={client} /><DpcConvenePanel client={client} /><SealedCoverReview client={client} /></>);
    case "/me/training": return routePage("My Training", "g07.training.read", permissions, <><MyTrainingPanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} /><TrainingNominationForm client={client} defaultEmployeeId={sessionEmployeeId} onSubmitted={bump} /></>);
    case "/me/apar": return routePage("My Appraisal", "g08.apar.read", permissions, <MyAppraisalPanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} />);
    case "/team/training": return routePage("Training", "g07.training.read", permissions, <><TrainingWorkspace client={client} /><TrainingNominationForm client={client} /></>);
    case "/team/apar": return routePage("APAR", "g08.apar.read", permissions, <><AparWorkspace client={client} /><AparTierForms client={client} permissions={permissions} /></>);
    case "/team/disciplinary": return routePage("Disciplinary", "g09.case.read", permissions, <><DisciplinaryWorkspace client={client} /><DisciplinaryCaseWorkbench client={client} /><EvidenceVaultList client={client} /></>);
    case "/admin/leave-sr-relay": return routePage("Leave-SR Relay", "g04.relay.read", permissions, <LeaveSrRelayWorkspace client={client} />);
    case "/admin/payroll": return routePage("Payroll", "g10.payroll.read", permissions, <><PayrollWorkspace client={client} /><PayrollRunConsole client={client} permissions={permissions} /></>);
    case "/me/pension": return routePage("My Pension Projection", "g11.pension.self.read", permissions, <MyPensionEstimatePanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} />);
    case "/me/dashboard": return routePage("My Dashboard", "g14.analytics.read.self", permissions, <MyDashboardPanel client={client} employeeId={sessionEmployeeId} refreshToken={refresh} />);
    case "/admin/pension-retirement": return routePage("Pension & Retirement", "g11.pension.read", permissions, <><PensionWorkspace client={client} /><PensionCaseConsole client={client} permissions={permissions} /></>);
    case "/admin/analytics": return routePage("Analytics", "g14.analytics.read", permissions, <><AnalyticsWorkspace client={client} /><EmbeddedBiDashboard client={client} /></>);
    case "/admin/workflow-config": return routePage("Workflow Config", "p01.workflow.config.review", permissions, <WorkflowConfigConsole />);
    default:
      return <section className="not-found" aria-labelledby="route-heading"><h2 id="route-heading" tabIndex={-1}>Page not found</h2><p>The requested HRMS destination does not exist.</p><button type="button" onClick={() => navigate(defaultPath(permissions))}>Go to your workspace</button></section>;
  }
}
