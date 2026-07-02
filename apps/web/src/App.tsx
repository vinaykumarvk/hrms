import { createFixtureHrmsClient } from "./api/fixtureHrmsClient";
import {
  AnalyticsSliceSummary,
  AparSliceSummary,
  DisciplinarySliceSummary,
  DocumentSummary,
  EmployeeSummary,
  LeaveSliceSummary,
  LeaveSrRelaySliceSummary,
  PageResult,
  PayrollSliceSummary,
  PensionSliceSummary,
  PersonalDetailsSliceSummary,
  PromotionSliceSummary,
  TrainingSliceSummary,
  TransferSliceSummary,
  WorkflowTaskSummary,
} from "./api/hrmsClient";
import { AppShell } from "./app/AppShell";
import { useEffect, useState } from "react";
import { Inbox } from "./workflow/Inbox";
import { TaskDetail } from "./workflow/TaskDetail";
import { WorkflowConfigConsole } from "./workflow/WorkflowConfigConsole";
import { EmployeeProfile } from "./modules/g01/EmployeeProfile";
import { PersonalDetailsWorkspace } from "./modules/g02/PersonalDetailsWorkspace";
import { LeaveWorkspace } from "./modules/g03/LeaveWorkspace";
import { LeaveSrRelayWorkspace } from "./modules/g04/LeaveSrRelayWorkspace";
import { TransferWorkspace } from "./modules/g05/TransferWorkspace";
import { PromotionWorkspace } from "./modules/g06/PromotionWorkspace";
import { TrainingWorkspace } from "./modules/g07/TrainingWorkspace";
import { AparWorkspace } from "./modules/g08/AparWorkspace";
import { DisciplinaryWorkspace } from "./modules/g09/DisciplinaryWorkspace";
import { PayrollWorkspace } from "./modules/g10/PayrollWorkspace";
import { PensionWorkspace } from "./modules/g11/PensionWorkspace";
import { AnalyticsWorkspace } from "./modules/g14/AnalyticsWorkspace";
import { ServiceRegisterTimeline } from "./modules/g12/ServiceRegisterTimeline";
import { DocumentVaultView } from "./modules/g13/DocumentVaultView";

const client = createFixtureHrmsClient();

export function App() {
  const [tasks, setTasks] = useState<PageResult<WorkflowTaskSummary> | null>(null);
  const [employees, setEmployees] = useState<PageResult<EmployeeSummary> | null>(null);
  const [documents, setDocuments] = useState<PageResult<DocumentSummary> | null>(null);
  const [leaveSlice, setLeaveSlice] = useState<LeaveSliceSummary | null>(null);
  const [personalDetailsSlice, setPersonalDetailsSlice] = useState<PersonalDetailsSliceSummary | null>(null);
  const [leaveSrRelaySlice, setLeaveSrRelaySlice] = useState<LeaveSrRelaySliceSummary | null>(null);
  const [transferSlice, setTransferSlice] = useState<TransferSliceSummary | null>(null);
  const [promotionSlice, setPromotionSlice] = useState<PromotionSliceSummary | null>(null);
  const [trainingSlice, setTrainingSlice] = useState<TrainingSliceSummary | null>(null);
  const [aparSlice, setAparSlice] = useState<AparSliceSummary | null>(null);
  const [disciplinarySlice, setDisciplinarySlice] = useState<DisciplinarySliceSummary | null>(null);
  const [payrollSlice, setPayrollSlice] = useState<PayrollSliceSummary | null>(null);
  const [pensionSlice, setPensionSlice] = useState<PensionSliceSummary | null>(null);
  const [analyticsSlice, setAnalyticsSlice] = useState<AnalyticsSliceSummary | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      client.listWorkflowTasks(),
      client.listEmployees(),
      client.listDocuments(),
      client.getLeaveSlice(),
      client.getPersonalDetailsSlice(),
      client.getLeaveSrRelaySlice(),
      client.getTransferSlice(),
      client.getPromotionSlice(),
      client.getTrainingSlice(),
      client.getAparSlice(),
      client.getDisciplinarySlice(),
      client.getPayrollSlice(),
      client.getPensionSlice(),
      client.getAnalyticsSlice(),
    ]).then(
      ([
        nextTasks,
        nextEmployees,
        nextDocuments,
        nextLeaveSlice,
        nextPersonalDetailsSlice,
        nextLeaveSrRelaySlice,
        nextTransferSlice,
        nextPromotionSlice,
        nextTrainingSlice,
        nextAparSlice,
        nextDisciplinarySlice,
        nextPayrollSlice,
        nextPensionSlice,
        nextAnalyticsSlice,
      ]) => {
        if (mounted) {
          setTasks(nextTasks);
          setEmployees(nextEmployees);
          setDocuments(nextDocuments);
          setLeaveSlice(nextLeaveSlice);
          setPersonalDetailsSlice(nextPersonalDetailsSlice);
          setLeaveSrRelaySlice(nextLeaveSrRelaySlice);
          setTransferSlice(nextTransferSlice);
          setPromotionSlice(nextPromotionSlice);
          setTrainingSlice(nextTrainingSlice);
          setAparSlice(nextAparSlice);
          setDisciplinarySlice(nextDisciplinarySlice);
          setPayrollSlice(nextPayrollSlice);
          setPensionSlice(nextPensionSlice);
          setAnalyticsSlice(nextAnalyticsSlice);
        }
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppShell permissions={["*"]}>
      <div className="workflow-grid">
        <Inbox tasks={tasks?.items ?? []} selectedTaskId={tasks?.items[0]?.id} onSelectTask={() => undefined} />
        {tasks?.items[0] ? <TaskDetail task={tasks.items[0]} /> : null}
        <WorkflowConfigConsole />
      </div>
      <section className="workspace-grid" aria-label="Phase 06 vertical slices">
        {personalDetailsSlice ? <PersonalDetailsWorkspace slice={personalDetailsSlice} /> : null}
        {leaveSlice ? <LeaveWorkspace slice={leaveSlice} /> : null}
        {leaveSrRelaySlice ? <LeaveSrRelayWorkspace slice={leaveSrRelaySlice} /> : null}
        {transferSlice ? <TransferWorkspace slice={transferSlice} /> : null}
      </section>
      <section className="workspace-grid" aria-label="Phase 08 statutory administration wave">
        {promotionSlice ? <PromotionWorkspace slice={promotionSlice} /> : null}
        {trainingSlice ? <TrainingWorkspace slice={trainingSlice} /> : null}
        {aparSlice ? <AparWorkspace slice={aparSlice} /> : null}
        {disciplinarySlice ? <DisciplinaryWorkspace slice={disciplinarySlice} /> : null}
      </section>
      <section className="workspace-grid" aria-label="Phase 09 compensation wave">
        {payrollSlice ? <PayrollWorkspace slice={payrollSlice} /> : null}
        {pensionSlice ? <PensionWorkspace slice={pensionSlice} /> : null}
      </section>
      <section className="workspace-grid" aria-label="Phase 10 analytics and release readiness">
        {analyticsSlice ? <AnalyticsWorkspace slice={analyticsSlice} /> : null}
      </section>
      <section className="workspace-grid" aria-label="Phase 05A contract smoke">
        {employees?.items[0] ? <EmployeeProfile employee={employees.items[0]} fieldGrants={[]} /> : null}
        <ServiceRegisterTimeline
          items={[
            {
              id: "sr-fixture-000001",
              sequenceNo: 1,
              eventTypeCode: "IDENTITY_CHANGE",
              eventDate: "2026-07-02",
              sourceModule: "G01",
              entryHash: "aaaa1111bbbb2222",
              previousHash: "0000000000000000",
            },
          ]}
        />
        <DocumentVaultView documents={documents?.items ?? []} legalHold={true} retentionUntil="2031-07-02" />
      </section>
    </AppShell>
  );
}
