import { createHrmsClient } from "./api/hrmsClient";
import { AppShell } from "./app/AppShell";
import { LoginPanel } from "./app/LoginPanel";
import { RouteGuard } from "./app/RouteGuard";
import { endSession, HrmsSession, readStoredSession, startSession } from "./app/session";
import { useCallback, useState } from "react";
import { WorkflowWorkspace } from "./workflow/WorkflowWorkspace";
import { WorkflowConfigConsole } from "./workflow/WorkflowConfigConsole";
import { EmployeeProfile } from "./modules/g01/EmployeeProfile";
import { EmployeeContactsPanel } from "./modules/g01/EmployeeContactsPanel";
import { EmployeeDependentsPanel } from "./modules/g01/EmployeeDependentsPanel";
import { PersonalDetailsWorkspace } from "./modules/g02/PersonalDetailsWorkspace";
import { ChangeRequestEditor } from "./modules/g02/ChangeRequestEditor";
import { ChangeRequestApproverQueue } from "./modules/g02/ChangeRequestApproverQueue";
import { LeaveWorkspace } from "./modules/g03/LeaveWorkspace";
import { SelfServiceSummary } from "./modules/g03/SelfServiceSummary";
import { LeaveSrRelayWorkspace } from "./modules/g04/LeaveSrRelayWorkspace";
import { TransferWorkspace } from "./modules/g05/TransferWorkspace";
import { PromotionWorkspace } from "./modules/g06/PromotionWorkspace";
import { DpcConvenePanel } from "./modules/g06/DpcConvenePanel";
import { TrainingWorkspace } from "./modules/g07/TrainingWorkspace";
import { TrainingNominationForm } from "./modules/g07/TrainingNominationForm";
import { AparWorkspace } from "./modules/g08/AparWorkspace";
import { AparTierForms } from "./modules/g08/AparTierForms";
import { DisciplinaryWorkspace } from "./modules/g09/DisciplinaryWorkspace";
import { DisciplinaryCaseWorkbench } from "./modules/g09/DisciplinaryCaseWorkbench";
import { PayrollWorkspace } from "./modules/g10/PayrollWorkspace";
import { PensionWorkspace } from "./modules/g11/PensionWorkspace";
import { AnalyticsWorkspace } from "./modules/g14/AnalyticsWorkspace";
import { ServiceRegisterTimeline } from "./modules/g12/ServiceRegisterTimeline";
import { DocumentVaultView } from "./modules/g13/DocumentVaultView";

// Composition root: the real fetch client. Base URL comes from Vite env
// configuration (empty string = same-origin). The token provider reads the
// session token persisted by the PH-05B login flow (app/session.ts); requests
// go out unauthenticated when no session exists. Every module workspace
// receives this client and resolves its own loading/error/empty/ready state
// (the canonical PH-05E pattern).
const client = createHrmsClient({
  baseUrl: (import.meta.env.VITE_HRMS_API_BASE_URL as string | undefined) ?? "",
  tokenProvider: () => window.sessionStorage.getItem("hrms.session.token"),
});

export function App() {
  const [session, setSession] = useState<HrmsSession | null>(() => readStoredSession(window.sessionStorage));
  // PH-07E: the G02 editor and approver queue share a refresh token so a newly
  // created change request appears in the queue without a full reload.
  const [g02QueueRefresh, setG02QueueRefresh] = useState(0);
  const bumpG02Queue = useCallback(() => setG02QueueRefresh((token) => token + 1), []);

  const handleSignIn = useCallback((token: string): boolean => {
    const nextSession = startSession(window.sessionStorage, token);
    if (nextSession) {
      setSession(nextSession);
    }
    return nextSession !== null;
  }, []);

  const handleSignOut = useCallback(() => {
    endSession(window.sessionStorage);
    setSession(null);
  }, []);

  if (!session) {
    return (
      <main className="hrms-app hrms-login" aria-label="HRMS sign in">
        <header className="hrms-topbar">
          <div>
            <p className="eyebrow">Government HRMS</p>
            <h1>Operations Workspace</h1>
          </div>
        </header>
        <LoginPanel onSignIn={handleSignIn} />
      </main>
    );
  }

  const permissions = session.permissions;

  return (
    <AppShell permissions={permissions} sessionUser={session.displayName} onSignOut={handleSignOut}>
      <RouteGuard permissions={permissions} requiredPermission="p01.workflow.read" routeLabel="Workflow inbox">
        <div className="workflow-grid">
          <WorkflowWorkspace client={client} />
          <WorkflowConfigConsole />
        </div>
      </RouteGuard>
      <section className="workspace-grid" aria-label="Phase 06 vertical slices">
        <RouteGuard permissions={permissions} requiredPermission="g02.change.read" routeLabel="Personal Details workspace (G02)">
          <PersonalDetailsWorkspace client={client} />
          <ChangeRequestEditor client={client} onCreated={bumpG02Queue} />
          <ChangeRequestApproverQueue client={client} refreshToken={g02QueueRefresh} onDecided={bumpG02Queue} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g03.leave.read" routeLabel="Attendance & Leave workspace (G03)">
          <LeaveWorkspace client={client} />
          <SelfServiceSummary client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g04.relay.read" routeLabel="Leave-SR Relay workspace (G04)">
          <LeaveSrRelayWorkspace client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g05.transfer.read" routeLabel="Transfers workspace (G05)">
          <TransferWorkspace client={client} />
        </RouteGuard>
      </section>
      <section className="workspace-grid" aria-label="Phase 08 statutory administration wave">
        <RouteGuard permissions={permissions} requiredPermission="g06.promotion.read" routeLabel="Promotions workspace (G06)">
          <PromotionWorkspace client={client} />
          <DpcConvenePanel client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g07.training.read" routeLabel="Training workspace (G07)">
          <TrainingWorkspace client={client} />
          <TrainingNominationForm client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g08.apar.read" routeLabel="APAR workspace (G08)">
          <AparWorkspace client={client} />
          <AparTierForms client={client} permissions={permissions} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g09.case.read" routeLabel="Disciplinary workspace (G09)">
          <DisciplinaryWorkspace client={client} />
          <DisciplinaryCaseWorkbench client={client} />
        </RouteGuard>
      </section>
      <section className="workspace-grid" aria-label="Phase 09 compensation wave">
        <RouteGuard permissions={permissions} requiredPermission="g10.payroll.read" routeLabel="Payroll workspace (G10)">
          <PayrollWorkspace client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g11.pension.read" routeLabel="Pension & Retirement workspace (G11)">
          <PensionWorkspace client={client} />
        </RouteGuard>
      </section>
      <section className="workspace-grid" aria-label="Phase 10 analytics and release readiness">
        <RouteGuard permissions={permissions} requiredPermission="g14.analytics.read" routeLabel="Analytics workspace (G14)">
          <AnalyticsWorkspace client={client} />
        </RouteGuard>
      </section>
      <section className="workspace-grid" aria-label="Phase 05D foundation record views">
        <RouteGuard permissions={permissions} requiredPermission="g01.employee.read" routeLabel="Employees workspace (G01)">
          <EmployeeProfile client={client} />
          <EmployeeContactsPanel client={client} />
          <EmployeeDependentsPanel client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g12.sr.read" routeLabel="Service Register workspace (G12)">
          <ServiceRegisterTimeline client={client} />
        </RouteGuard>
        <RouteGuard permissions={permissions} requiredPermission="g13.document.read" routeLabel="Documents workspace (G13)">
          <DocumentVaultView client={client} />
        </RouteGuard>
      </section>
    </AppShell>
  );
}
