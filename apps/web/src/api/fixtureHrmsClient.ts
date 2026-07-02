import {
  DocumentSummary,
  EmployeeProfileView,
  EmployeeSummary,
  AnalyticsSliceSummary,
  AparSliceSummary,
  DisciplinarySliceSummary,
  HrmsClient,
  LeaveApplicationRecord,
  LeaveApplicationSubmitInput,
  LeaveSliceSummary,
  LeaveSrRelaySliceSummary,
  LeaveTypeOption,
  PageResult,
  TransferInitiateInput,
  TransferOrderRecord,
  PayrollSliceSummary,
  PensionSliceSummary,
  PersonalDetailsSliceSummary,
  PromotionSliceSummary,
  ServiceRegisterIngestInput,
  SrTimelineEntry,
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
    currentVersionNo: 2,
    isWorm: true,
    legalHold: true,
  },
];

const employeeProfile: EmployeeProfileView = {
  id: "99999999-9999-9999-9999-999999999901",
  serviceNo: "GOV-100245",
  displayName: "Ananya Rao",
  employmentStatus: "ACTIVE",
  orgUnitId: "org-unit-0001",
  designation: "Deputy Collector",
  dateOfJoining: "2014-06-16",
  pan: "[HIDDEN]",
  aadhaarMasked: "xxxx-xxxx-1234",
  category: "[HIDDEN]",
  rowVersion: 1,
};

const srTimeline: SrTimelineEntry[] = [
  {
    id: "sr-fixture-000001",
    sequenceNo: 1,
    employeeId: employeeProfile.id,
    sourceModule: "G01",
    eventTypeCode: "IDENTITY_CHANGE",
    eventDate: "2026-07-02",
    entryHash: "aaaa1111bbbb2222",
    previousHash: "0000000000000000",
    status: "ACTIVE",
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

const fixtureLeaveTypes: LeaveTypeOption[] = [
  { leaveTypeId: "EL", name: "Earned Leave", status: "ACTIVE" },
  { leaveTypeId: "CL", name: "Casual Leave", status: "ACTIVE" },
];

export function createFixtureHrmsClient(): HrmsClient {
  // Interactive PH-06D fixtures are stateful per client so submitted applications
  // and initiated orders show up in subsequent list calls, like the real API.
  const leaveApplications: LeaveApplicationRecord[] = [
    {
      id: "leave-fixture-000001",
      applicationNo: "LA/2026/00002",
      employeeId: employees[0].id,
      leaveTypeId: "EL",
      fromDate: "2026-08-03",
      toDate: "2026-08-05",
      totalDays: 3,
      status: "SUBMITTED",
      resolverType: "REPORTING_CHAIN",
    },
  ];
  const transferOrders: TransferOrderRecord[] = [
    {
      id: "transfer-fixture-000001",
      orderNo: transferSlice.orderNo,
      employeeId: employees[0].id,
      fromOrgUnitId: "org-unit-0001",
      toOrgUnitId: "org-unit-0002",
      orderDate: "2026-07-01",
      effectiveDate: "2026-07-15",
      status: "JOINED",
      resolverType: "POSITION_AUTHORITY",
      clearanceItems: transferSlice.clearances.map((clearance) => ({ ...clearance })),
    },
  ];
  let fixtureSequence = 2;

  return {
    listLeaveApplications: () => Promise.resolve(page(leaveApplications.map((application) => ({ ...application })))),
    submitLeaveApplication: (input: LeaveApplicationSubmitInput) => {
      const application: LeaveApplicationRecord = {
        id: `leave-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        applicationNo: `LA/2026/${String(fixtureSequence + 1).padStart(5, "0")}`,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        totalDays: 1,
        status: "SUBMITTED",
        resolverType: "REPORTING_CHAIN",
      };
      fixtureSequence += 1;
      leaveApplications.push(application);
      return Promise.resolve({ application: { ...application }, balance: { availableBalance: leaveSlice.balanceAvailable } });
    },
    decideLeaveApplication: (applicationId, decision) => {
      const application = leaveApplications.find((candidate) => candidate.id === applicationId);
      if (!application) {
        return Promise.reject(new Error(`Fixture leave application ${applicationId} not found`));
      }
      application.status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      return Promise.resolve({ application: { ...application } });
    },
    listLeaveTypes: () => Promise.resolve(page(fixtureLeaveTypes.map((leaveType) => ({ ...leaveType })))),
    listTransferOrders: () =>
      Promise.resolve(
        page(transferOrders.map((order) => ({ ...order, clearanceItems: order.clearanceItems.map((item) => ({ ...item })) })))
      ),
    initiateTransferOrder: (input: TransferInitiateInput) => {
      const order: TransferOrderRecord = {
        id: `transfer-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        orderNo: `TO/2026/${String(fixtureSequence + 1).padStart(5, "0")}`,
        employeeId: input.employeeId,
        fromOrgUnitId: input.fromOrgUnitId,
        toOrgUnitId: input.toOrgUnitId,
        orderDate: input.orderDate,
        effectiveDate: input.effectiveDate,
        status: "PENDING_APPROVAL",
        resolverType: "POSITION_AUTHORITY",
        clearanceItems: [
          { code: "HR", status: "OPEN" },
          { code: "VIGILANCE", status: "OPEN" },
          { code: "ESTATE", status: "OPEN" },
        ],
      };
      fixtureSequence += 1;
      transferOrders.push(order);
      return Promise.resolve({ order: { ...order, clearanceItems: order.clearanceItems.map((item) => ({ ...item })) } });
    },
    listWorkflowTasks: () => Promise.resolve(page(workflowTasks)),
    actOnWorkflowTask: (taskId, verb, body, idempotencyKey) =>
      Promise.resolve({ accepted: true, fixture: true, taskId, verb, reason: body.reason ?? null, toUserId: body.toUserId ?? null, idempotencyKey }),
    actOnWorkflowInstance: (instanceId, verb, body, idempotencyKey) =>
      Promise.resolve({ accepted: true, fixture: true, instanceId, verb, reason: body.reason ?? null, idempotencyKey }),
    listEmployees: () => Promise.resolve(page(employees)),
    getEmployeeProfile: () => Promise.resolve({ ...employeeProfile }),
    getServiceRegisterTimeline: () => Promise.resolve(page(srTimeline)),
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
