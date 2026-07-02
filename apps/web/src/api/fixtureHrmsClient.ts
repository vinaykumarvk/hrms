import {
  DocumentSummary,
  EmployeeSummary,
  AnalyticsSliceSummary,
  AparSliceSummary,
  DisciplinarySliceSummary,
  HrmsClient,
  LeaveSliceSummary,
  LeaveSrRelaySliceSummary,
  PageResult,
  PayrollSliceSummary,
  PensionSliceSummary,
  PersonalDetailsSliceSummary,
  PromotionSliceSummary,
  ServiceRegisterIngestInput,
  TrainingSliceSummary,
  TransferSliceSummary,
  WorkflowTaskSummary,
} from "./hrmsClient";

const workflowTasks: WorkflowTaskSummary[] = [
  {
    id: "task-000001",
    instanceId: "workflow-000001",
    stage: "PENDING_MANAGER",
    status: "PENDING",
  },
];

const employees: EmployeeSummary[] = [
  {
    id: "99999999-9999-9999-9999-999999999901",
    serviceNo: "GOV-100245",
    displayName: "Ananya Rao",
    employmentStatus: "ACTIVE",
    designation: "Deputy Collector",
  },
];

const documents: DocumentSummary[] = [
  {
    id: "d0c00000-0000-0000-0000-000000001001",
    docNo: "DOC/2026/0001001",
    title: "Aadhaar Proof - GOV-100245",
    status: "ACTIVE",
    classification: "CONFIDENTIAL",
  },
];

const leaveSlice: LeaveSliceSummary = {
  applicationNo: "LA/2026/00001",
  status: "APPROVED",
  resolver: "REPORTING_CHAIN",
  action: "APPROVE",
  balanceAvailable: 27,
  g04OutboxStatus: "POSTED",
  srEventType: "LEAVE_APPROVED",
  payrollSignalStatus: "READY_FOR_G10",
  payrollSignalsReady: 3,
};

const personalDetailsSlice: PersonalDetailsSliceSummary = {
  requestNo: "G02/00001",
  fieldCode: "displayName",
  status: "COMMITTED",
  sensitivity: "LOW",
  ownerModule: "G01",
  documentCount: 1,
};

const leaveSrRelaySlice: LeaveSrRelaySliceSummary = {
  total: 3,
  posted: 2,
  deadLettered: 1,
  discarded: 0,
  relayOwner: "G04",
};

const transferSlice: TransferSliceSummary = {
  orderNo: "TO/2026/00001",
  status: "JOINED",
  resolver: "POSITION_AUTHORITY",
  clearancePattern: "PARALLEL_ALL_OF",
  clearances: [
    { code: "HR", status: "CLEARED" },
    { code: "VIGILANCE", status: "DEEMED_CLEARED" },
    { code: "ESTATE", status: "CLEARED" },
  ],
  documentCount: 2,
  srEventType: "TRANSFER_JOINED",
};

const promotionSlice: PromotionSliceSummary = {
  seniorityLists: 1,
  promotionOrders: 1,
  macpEffected: 1,
  paySignalsReady: 2,
  dpcMarker: "DPC_QUORUM",
  recusalMarker: "DPC_RECUSAL",
  srEventType: "PROMOTION_EFFECTED",
};

const trainingSlice: TrainingSliceSummary = {
  sessions: 1,
  approved: 1,
  completed: 1,
  srPosted: 1,
  workflowCode: "WF-G07-NOMINATION",
  srEventType: "TRAINING_CERTIFICATION_POSTED",
};

const aparSlice: AparSliceSummary = {
  forms: 2,
  posted: 1,
  sealedCover: 1,
  g06FeedSuppressed: 1,
  srEventType: "APAR_FINAL_GRADE",
  sealedMarker: "SEALED_COVER",
  feedMarker: "G08_G06_FEED_SUPPRESSED",
};

const disciplinarySlice: DisciplinarySliceSummary = {
  cases: 1,
  penalties: 1,
  confidential: 1,
  impactSignals: 1,
  competenceMarker: "G09_AUTHORITY_COMPETENCE",
  penaltyEventType: "MAJOR_PENALTY",
  appealMarker: "APPEAL_DECIDED",
};

const payrollSlice: PayrollSliceSummary = {
  salaryStructures: 1,
  runs: 1,
  lockedRuns: 1,
  disbursedRuns: 1,
  lastPayDrawnFeeds: 1,
  calculationMarker: "PAYROLL_TRACE",
  ruleSnapshotMarker: "RULE_VERSION_SNAPSHOT",
  inputLockMarker: "INPUT_LOCKED",
  x3Marker: "BANK_X3_EXPORT",
  lastPayMarker: "LAST_PAY_DRAWN",
};

const pensionSlice: PensionSliceSummary = {
  cases: 1,
  serviceVerified: 1,
  sanctioned: 1,
  pposIssued: 1,
  srPosted: 2,
  serviceGateMarker: "SR_VERIFICATION_GATE",
  qualifyingServiceMarker: "QUALIFYING_SERVICE_LOCKED",
  calculationMarker: "PENSION_CALC_TRACE",
  ppoMarker: "PPO_ISSUED",
  srMarker: "G11_SR_POSTED",
};

const analyticsSlice: AnalyticsSliceSummary = {
  dashboards: 1,
  cards: 8,
  sourceModules: 7,
  martRefreshes: 1,
  readOnlyMarker: "G14_READ_ONLY",
  martMarker: "MART_REFRESH_IDEMPOTENT",
  scopeMarker: "P02_SCOPE_FILTER",
  drillMarker: "DRILL_THROUGH_AUTHZ",
  auditMarker: "ANALYTICS_READ_AUDITED",
  piiMarker: "PII_SUPPRESSION",
  migrationMarker: "MIGRATION_DRY_RUN",
  uatMarker: "UAT_ACCEPTANCE_PACK",
};

export function createFixtureHrmsClient(): HrmsClient {
  return {
    listWorkflowTasks: () => Promise.resolve(page(workflowTasks)),
    listEmployees: () => Promise.resolve(page(employees)),
    listDocuments: () => Promise.resolve(page(documents)),
    getLeaveSlice: () => Promise.resolve({ ...leaveSlice }),
    getPersonalDetailsSlice: () => Promise.resolve({ ...personalDetailsSlice }),
    getLeaveSrRelaySlice: () => Promise.resolve({ ...leaveSrRelaySlice }),
    getTransferSlice: () => Promise.resolve({ ...transferSlice, clearances: transferSlice.clearances.map((clearance) => ({ ...clearance })) }),
    getPromotionSlice: () => Promise.resolve({ ...promotionSlice }),
    getTrainingSlice: () => Promise.resolve({ ...trainingSlice }),
    getAparSlice: () => Promise.resolve({ ...aparSlice }),
    getDisciplinarySlice: () => Promise.resolve({ ...disciplinarySlice }),
    getPayrollSlice: () => Promise.resolve({ ...payrollSlice }),
    getPensionSlice: () => Promise.resolve({ ...pensionSlice }),
    getAnalyticsSlice: () => Promise.resolve({ ...analyticsSlice }),
    ingestServiceRegister: (input: ServiceRegisterIngestInput, idempotencyKey: string) =>
      Promise.resolve({
        event: {
          id: "sr-fixture-000001",
          employeeId: input.employeeId,
          eventTypeCode: input.eventTypeCode,
        },
        idempotencyKey,
        fixture: true,
        replayed: false,
        semanticDuplicate: false,
      }),
  };
}

function page<TItem>(items: TItem[]): PageResult<TItem> {
  return {
    items,
    limit: 25,
    next_cursor: null,
  };
}
