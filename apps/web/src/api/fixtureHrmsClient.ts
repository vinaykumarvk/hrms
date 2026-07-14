import {
  BiKpiTile,
  MyRightsRequest,
  SealedCoverCase,
  PromotionOrderView,
  ProbationRecordView,
  PromotionRefusalView,
  CaseEvidenceItem,
  CounsellingChoiceResult,
  CounsellingSessionView,
  DsrRecord,
  AparFormActionResult,
  AparFormView,
  AparReportingInput,
  AparReviewInput,
  AparSelfAppraisalInput,
  ChangeRequestDiffResult,
  ChargeMemoInput,
  DisciplinaryCaseOpenInput,
  DisciplinaryCaseView,
  MyDisciplinaryCaseView,
  ShowCauseNoticeView,
  RespondToShowCauseInput,
  PersonalHearingView,
  RequestPersonalHearingInput,
  DocumentSummary,
  DpcHoldInput,
  AttendanceCaptureInput,
  AttendanceRecordView,
  EmployeeAddressAddInput,
  EmployeeAddressRecord,
  EmployeeContactAddInput,
  EmployeeContactRecord,
  EmployeeDependentAddInput,
  EmployeeDependentRecord,
  EmployeeProfileView,
  EmergencyContactAddInput,
  EmergencyContactRecord,
  NomineeAddInput,
  NomineeRecord,
  BankAccountAddInput,
  BankAccountRecord,
  EmployeeSummary,
  AnalyticsAggregateCell,
  AnalyticsAggregateResult,
  AnalyticsKpiDefinitionView,
  AnalyticsSliceSummary,
  MartRefreshLogView,
  AparSliceSummary,
  DisciplinarySliceSummary,
  HrmsApiError,
  HrmsClient,
  PromotionCaseView,
  TrainingNominationInput,
  TrainingNominationView,
  TrainingSessionView,
  LeaveApplicationRecord,
  LeaveApplicationSubmitInput,
  LeaveBalanceView,
  LeaveSliceSummary,
  LeaveSrRelaySliceSummary,
  LeaveTypeOption,
  PageResult,
  PersonalDetailChangeCreateInput,
  PersonalDetailChangeRecord,
  TransferAcknowledgeInput,
  TransferInitiateInput,
  TransferOrderRecord,
  PayrollRunActionResult,
  PayrollRunLifecycleVerb,
  PayrollRunStatus,
  PayrollRunView,
  PayrollSliceSummary,
  PensionCaseActionResult,
  PensionCaseCreateInput,
  PensionCaseView,
  PensionEstimateInput,
  PensionSelfEstimateInput,
  PensionSelfEstimateResult,
  PensionServiceVerifyInput,
  PensionSliceSummary,
  SalaryStructureCreateInput,
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

// ---- PH-10E: G14 analytics engine fixtures (KPIs, suppression-aware aggregates, refresh logs) ----

const FIXTURE_MIN_CELL_SIZE_K = 5;

/** Governed E03 kpi_definitions rows: ACTIVE versions compute; the DRAFT row must be filtered out. */
const analyticsKpis: AnalyticsKpiDefinitionView[] = [
  {
    id: "kpi-fixture-000001",
    kpiCode: "KPI_LEAVE_APPLICATIONS",
    name: "Leave applications",
    description: "Leave applications recorded in the leave read model",
    domain: "LEAVE",
    version: 2,
    definitionHash: "f1x7u4e-kpi-leave-hash",
    sourceMartCode: "MART_LEAVE",
    expression: "COUNT(*)",
    unit: "applications",
    grain: "ORG_UNIT",
    sensitivity: "INTERNAL",
    status: "ACTIVE",
  },
  {
    id: "kpi-fixture-000002",
    kpiCode: "KPI_ATTENDANCE_DAYS",
    name: "Attendance days",
    description: "Attendance day records in the attendance read model",
    domain: "ATTENDANCE",
    version: 1,
    definitionHash: "f1x7u4e-kpi-attendance-hash",
    sourceMartCode: "MART_ATTENDANCE",
    expression: "COUNT(*)",
    unit: "days",
    grain: "ORG_UNIT",
    sensitivity: "INTERNAL",
    status: "ACTIVE",
  },
  {
    id: "kpi-fixture-000003",
    kpiCode: "KPI_SANCTIONED_POSTS",
    name: "Sanctioned posts",
    description: "Sanctioned posts in the establishment read model",
    domain: "ESTABLISHMENT",
    version: 1,
    definitionHash: "f1x7u4e-kpi-establishment-hash",
    sourceMartCode: "MART_ESTABLISHMENT",
    expression: "COUNT(*)",
    unit: "posts",
    grain: "ORG_UNIT",
    sensitivity: "INTERNAL",
    status: "ACTIVE",
  },
  {
    id: "kpi-fixture-000004",
    kpiCode: "KPI_APPRAISAL_FORMS",
    name: "Appraisal forms",
    description: "APAR forms in the appraisal read model (not yet activated)",
    domain: "APPRAISAL",
    version: 1,
    definitionHash: "f1x7u4e-kpi-appraisal-hash",
    sourceMartCode: "MART_APPRAISAL",
    expression: "COUNT(*)",
    unit: "forms",
    grain: "ORG_UNIT",
    sensitivity: "RESTRICTED",
    status: "DRAFT",
  },
];

/**
 * Raw cohort member counts per mart/dimension. These stay INTERNAL to the fixture: the
 * aggregate read applies the same fail-closed k-anonymity mirror as the engine, so any
 * count below k leaves this module only as a suppressed cell with value=null.
 * MART_ESTABLISHMENT/cadreId carries the deliberate small cohort (CADRE_RESERVED = 3 < k)
 * used by the PH-10E negative rendering test.
 */
const martDimensionCounts: Record<string, Record<string, Record<string, number>>> = {
  MART_LEAVE: {
    leaveTypeId: { CL: 7, EL: 9 },
    status: { APPROVED: 9, SUBMITTED: 7 },
  },
  MART_ATTENDANCE: {
    status: { ON_LEAVE: 6, PRESENT: 22 },
  },
  MART_ESTABLISHMENT: {
    cadreId: { CADRE_FIELD: 8, CADRE_RESERVED: 3, CADRE_SECRETARIAT: 12 },
    orgUnitId: { "org-unit-0001": 14, "org-unit-0002": 9 },
    status: { SANCTIONED: 18, VACANT: 5 },
  },
  MART_APPRAISAL: {},
};

/**
 * Mirror of AnalyticsEngineService.queryAggregate (FR-17): cells below k are suppressed
 * (ERR-G14-SMALL-CELL, value null); a lone suppressed cell pulls the smallest visible cell
 * with it (ERR-G14-COMP-SUPPRESS); any suppression withholds the total.
 */
function suppressFixtureCells(groups: Record<string, number>): { cells: AnalyticsAggregateCell[]; total: number | null; suppressedCells: number } {
  const entries = Object.entries(groups).sort((left, right) => left[0].localeCompare(right[0]));
  const cells: AnalyticsAggregateCell[] = entries.map(([key, count]) =>
    count < FIXTURE_MIN_CELL_SIZE_K
      ? { key, value: null, suppressed: true, suppressionReason: "ERR-G14-SMALL-CELL" as const }
      : { key, value: count, suppressed: false }
  );
  const primarySuppressed = cells.filter((cell) => cell.suppressed).length;
  if (primarySuppressed === 1) {
    const visible = cells.filter((cell) => !cell.suppressed);
    if (visible.length > 0) {
      const smallest = visible.reduce((min, cell) => ((cell.value ?? 0) < (min.value ?? 0) ? cell : min));
      smallest.value = null;
      smallest.suppressed = true;
      smallest.suppressionReason = "ERR-G14-COMP-SUPPRESS";
    }
  }
  const suppressedCells = cells.filter((cell) => cell.suppressed).length;
  const total = suppressedCells > 0 ? null : entries.reduce((sum, [, count]) => sum + count, 0);
  return { cells, total, suppressedCells };
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

/**
 * Append-only E10 datamart_refresh_logs rows: MART_LEAVE/MART_ATTENDANCE are fresh,
 * MART_APPRAISAL FAILED its last run, and MART_ESTABLISHMENT last succeeded well past
 * the 60-minute freshness SLA — both must surface as stale in the freshness panel.
 */
function buildMartRefreshLogs(): MartRefreshLogView[] {
  return [
    {
      id: "mrl-fixture-000001",
      martCode: "MART_LEAVE",
      runType: "SCHEDULED",
      startedAt: isoMinutesAgo(6),
      finishedAt: isoMinutesAgo(5),
      rowsRead: 16,
      rowsWritten: 16,
      status: "SUCCESS",
    },
    {
      id: "mrl-fixture-000002",
      martCode: "MART_ATTENDANCE",
      runType: "SCHEDULED",
      startedAt: isoMinutesAgo(12),
      finishedAt: isoMinutesAgo(10),
      rowsRead: 28,
      rowsWritten: 28,
      status: "SUCCESS",
    },
    {
      id: "mrl-fixture-000003",
      martCode: "MART_APPRAISAL",
      runType: "SCHEDULED",
      startedAt: isoMinutesAgo(31),
      finishedAt: isoMinutesAgo(30),
      rowsRead: 0,
      rowsWritten: 0,
      status: "FAILED",
      errorDetail: "Source contract g08.v_apar_forms_v3 fetch failed",
    },
    {
      id: "mrl-fixture-000004",
      martCode: "MART_ESTABLISHMENT",
      runType: "MANUAL",
      startedAt: isoMinutesAgo(26 * 60 + 2),
      finishedAt: isoMinutesAgo(26 * 60),
      rowsRead: 23,
      rowsWritten: 23,
      status: "SUCCESS",
    },
  ];
}

const fixtureLeaveTypes: LeaveTypeOption[] = [
  { leaveTypeId: "EL", name: "Earned Leave", status: "ACTIVE" },
  { leaveTypeId: "CL", name: "Casual Leave", status: "ACTIVE" },
];

export function createFixtureHrmsClient(): HrmsClient {
  // Interactive PH-06D fixtures are stateful per client so submitted applications
  // and initiated orders show up in subsequent list calls, like the real API.
  const counsellingSession: CounsellingSessionView = {
    id: "counsel-1",
    currentTurnEmployeeId: "emp-1",
    vacancies: [
      { vacancyId: "vac-a", postLabel: "Revenue Inspector — Circle A", open: true },
      { vacancyId: "vac-b", postLabel: "Revenue Inspector — Circle B", open: true },
    ],
  };
  const rightsRequests: MyRightsRequest[] = [
    { id: "rr-1", rightType: "ACCESS", status: "FULFILLED", raisedOn: "2026-06-01" },
  ];
  const sealedCovers: SealedCoverCase[] = [
    { id: "sc-1", employeeId: "emp-1", reason: "Disciplinary case pending", status: "SEALED" },
    { id: "sc-2", employeeId: "emp-2", reason: "Vigilance case pending", status: "SEALED" },
  ];
  const promotionOrders: PromotionOrderView[] = [
    {
      id: "promo-order-1",
      orderNo: "PROM/2026/00001",
      promotionCaseId: "promo-case-1",
      employeeId: employees[0].id,
      fromDesignation: "Assistant Section Officer",
      toDesignation: "Section Officer",
      status: "EFFECTED",
      documentId: "doc-promo-1",
      srEventId: "sr-event-promo-1",
    },
  ];
  const probationRecords: ProbationRecordView[] = [
    {
      id: "probation-1",
      promotionOrderId: "promo-order-1",
      employeeId: employees[0].id,
      probationStart: "2026-06-15",
      probationMonths: 24,
      scheduledEnd: "2028-06-15",
      status: "ON_PROBATION",
    },
  ];
  const promotionRefusals: PromotionRefusalView[] = [];
  const dsrRows: DsrRecord[] = [
    { id: "dsr-1", subjectEmployeeId: "emp-1", requestType: "ERASE", status: "RECEIVED", legalBasis: undefined },
    { id: "dsr-2", subjectEmployeeId: "emp-2", requestType: "ACCESS", status: "UNDER_REVIEW", legalBasis: undefined },
  ];
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
  const employeeContacts: EmployeeContactRecord[] = [
    {
      id: "cont-fixture-000001",
      employeeId: employees[0].id,
      contactType: "MOBILE",
      contactValue: "+91-98450-00001",
      isPrimary: true,
      isVerified: true,
      visibility: "INTERNAL",
      rowVersion: 1,
    },
  ];
  const employeeDependents: EmployeeDependentRecord[] = [
    {
      id: "dep-fixture-000001",
      employeeId: employees[0].id,
      fullName: "Meera Rao",
      relationship: "SPOUSE",
      dob: "1988-02-14",
      isLegalHeir: true,
      heirSuccessionRank: 1,
      nationalIdMasked: "xxxx-xxxx-5678",
    },
  ];
  const employeeAddresses: EmployeeAddressRecord[] = [
    {
      id: "addr-fixture-000001",
      employeeId: employees[0].id,
      addressType: "PERMANENT",
      line1: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pincode: "560001",
      isCurrent: true,
      validFrom: "2019-06-01",
      rowVersion: 1,
    },
  ];
  const employeeNominees: NomineeRecord[] = [
    {
      id: "nom-fixture-000001",
      employeeId: employees[0].id,
      name: "Meera Rao",
      benefitType: "GRATUITY",
      sharePct: 100,
      isFamilyPensionRecipient: true,
      status: "ACTIVE",
      rowVersion: 1,
    },
  ];
  const employeeEmergencyContacts: EmergencyContactRecord[] = [
    {
      id: "ec-fixture-000001",
      employeeId: employees[0].id,
      name: "Meera Rao (Spouse)",
      phone: "+91-98450-00099",
      priority: 1,
      status: "ACTIVE",
      rowVersion: 1,
    },
  ];
  const employeeBankAccounts: BankAccountRecord[] = [
    {
      id: "bank-fixture-000001",
      employeeId: employees[0].id,
      bankName: "State Public Bank",
      ifsc: "SPBK0001234",
      accountNumberMasked: "XXXXXXXX9001",
      isPrimarySalary: true,
      isVerified: true,
      status: "APPROVED",
      pennyDropStatus: "VERIFIED",
      lifecycle: "ACTIVE",
      rowVersion: 1,
    },
  ];
  const attendanceRecords: AttendanceRecordView[] = [
    {
      id: "att-fixture-000001",
      employeeId: employees[0].id,
      attendanceDate: "2026-07-10",
      inTime: "09:05",
      outTime: "17:35",
      status: "PRESENT",
    },
    {
      id: "att-fixture-000002",
      employeeId: employees[0].id,
      attendanceDate: "2026-07-11",
      inTime: "09:10",
      status: "ANOMALY",
      anomalyCode: "MISSING_OUT",
    },
  ];
  const changeRequests: PersonalDetailChangeRecord[] = [
    {
      id: "g02-fixture-000001",
      requestNo: "G02/00001",
      employeeId: employees[0].id,
      fieldCode: "displayName",
      oldValue: "Ananya Rao",
      newValue: "Ananya R. Rao",
      sensitivity: "LOW",
      status: "IN_REVIEW",
      revisionNo: 1,
      documentIds: ["d0c00000-0000-0000-0000-000000001001"],
    },
  ];
  const leaveBalance: LeaveBalanceView = {
    employeeId: employees[0].id,
    leaveTypeId: "EL",
    leaveYear: 2026,
    currentBalance: 30,
    reserved: 3,
    debited: 0,
    availableBalance: 27,
  };
  let fixtureSequence = 2;

  function fixtureError(status: number, code: string, message: string, messageId?: string): HrmsApiError {
    return new HrmsApiError(status, { error: { code, message, details: messageId ? { messageId } : undefined } });
  }

  // --- PH-08F statutory-wave interactive fixtures (stateful per client, like the real API) ---
  const disciplinaryCases: DisciplinaryCaseView[] = [];
  const myDisciplinaryCases: MyDisciplinaryCaseView[] = [
    {
      id: "disciplinary-case-fixture-000001",
      caseNo: "DCP/00001",
      chargedEmployeeId: employees[0].id,
      disciplinaryAuthorityId: employees[1]?.id ?? "emp-manager-fixture",
      stage: "INQUIRY_REPORT",
      caseStatus: "OPEN",
      isUnderSuspension: false,
      misconductCategory: "GENERAL",
      isPoshCase: false,
      openedOn: "2026-05-01",
      chargeMemoDocumentId: "doc-fixture-charge-memo-000001",
    },
  ];
  const myShowCauseNotices: ShowCauseNoticeView[] = [
    {
      id: "g09-show-cause-fixture-000001",
      caseId: "disciplinary-case-fixture-000001",
      noticeNo: "SCN/DCP-00001/001",
      proposedPenaltyJson: ["CENSURE", "WITHHOLD_INCREMENT"],
      issuedDate: "2026-06-15",
      servedDate: "2026-06-15",
      responseDueDate: "2026-07-15",
      status: "SERVED",
    },
  ];
  const myPersonalHearings: PersonalHearingView[] = [];
  const promotionCase: PromotionCaseView = {
    id: "promotion-case-fixture-000001",
    caseNo: "PC/2026/00001",
    status: "OPEN",
    vacancies: 1,
    candidates: [
      { employeeId: employees[0].id, rank: 1, fitness: "PENDING", isSelected: false },
      { employeeId: "99999999-9999-9999-9999-999999999902", rank: 2, fitness: "PENDING", isSelected: false },
    ],
  };
  const aparForms: AparFormView[] = [
    {
      id: "apar-fixture-000001",
      formNo: "APAR/2026/00001",
      employeeId: employees[0].id,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      status: "SELF_APPRAISAL",
      reportingOfficerId: "99999999-9999-9999-9999-999999999903",
      reviewingOfficerId: "99999999-9999-9999-9999-999999999904",
      sealedCover: false,
    },
  ];
  const trainingSessions: TrainingSessionView[] = [
    { id: "training-session-fixture-000001", programCode: "PROG-LEAD-101", title: "Leadership Fundamentals", capacity: 2, enrolled: 0, status: "OPEN" },
  ];
  const trainingNominations: TrainingNominationView[] = [];

  // --- PH-09E compensation-wave interactive fixtures (stateful, mirroring the API state machines) ---
  interface FixtureSalaryStructure {
    id: string;
    employeeId: string;
    basicPayCents: number;
    daRateBps: number;
    hraRateBps: number;
    npsRateBps: number;
    professionalTaxCents: number;
    ruleVersion: string;
    effectiveFrom: string;
  }
  const salaryStructures: FixtureSalaryStructure[] = [];
  const payrollRuns: PayrollRunView[] = [];
  /** Mirrors the g10 route state machine: each lifecycle verb is legal from exactly one status. */
  const runVerbTransitions: Record<PayrollRunLifecycleVerb, { from: PayrollRunStatus; to: PayrollRunStatus }> = {
    "lock-inputs": { from: "OPEN", to: "INPUT_LOCKED" },
    compute: { from: "INPUT_LOCKED", to: "COMPUTED" },
    reconcile: { from: "COMPUTED", to: "RECONCILED" },
    approve: { from: "RECONCILED", to: "APPROVED" },
    lock: { from: "APPROVED", to: "LOCKED" },
    disburse: { from: "LOCKED", to: "DISBURSED" },
  };

  function cloneRun(run: PayrollRunView): PayrollRunView {
    return {
      ...run,
      lines: run.lines.map((line) => ({ ...line, trace: line.trace.map((step) => ({ ...step })) })),
      totals: { ...run.totals },
      bankBatch: run.bankBatch ? { ...run.bankBatch } : undefined,
    };
  }

  /** Deterministic fixture payslip lines from the salary structure — same shape as PAYROLL_TRACE. */
  function computeFixtureLines(run: PayrollRunView): void {
    run.lines = salaryStructures.map((structure) => {
      const daCents = Math.floor((structure.basicPayCents * structure.daRateBps) / 10000);
      const hraCents = Math.floor((structure.basicPayCents * structure.hraRateBps) / 10000);
      const npsCents = Math.floor((structure.basicPayCents * structure.npsRateBps) / 10000);
      const grossCents = structure.basicPayCents + daCents + hraCents;
      const deductionsCents = npsCents + structure.professionalTaxCents;
      return {
        employeeId: structure.employeeId,
        salaryStructureId: structure.id,
        basicPayCents: structure.basicPayCents,
        earnedBasicCents: structure.basicPayCents,
        daCents,
        hraCents,
        grossCents,
        deductionsCents,
        netPayCents: grossCents - deductionsCents,
        trace: [
          { code: "BASIC", amountCents: structure.basicPayCents, marker: "PAYROLL_TRACE" },
          { code: "DA", amountCents: daCents, marker: "PAYROLL_TRACE" },
          { code: "HRA", amountCents: hraCents, marker: "PAYROLL_TRACE" },
          { code: "NPS", amountCents: -npsCents, marker: "PAYROLL_TRACE" },
          { code: "PT", amountCents: -structure.professionalTaxCents, marker: "PAYROLL_TRACE" },
        ],
      };
    });
    run.totals = run.lines.reduce(
      (totals, line) => ({
        grossCents: totals.grossCents + line.grossCents,
        deductionsCents: totals.deductionsCents + line.deductionsCents,
        netPayCents: totals.netPayCents + line.netPayCents,
      }),
      { grossCents: 0, deductionsCents: 0, netPayCents: 0 }
    );
  }

  const pensionCases: PensionCaseView[] = [];
  /** Fixture E35 limits mirroring the seeded pension-limit rule row. */
  const fixturePensionLimits = { minQualifyingYearsForPension: 10, minPensionCents: 900000, maxPensionCents: 12500000, upsMinGuaranteeCents: 1000000 };
  const fixtureLastBasicPayCents = 10000000;

  function clonePensionCase(pensionCase: PensionCaseView): PensionCaseView {
    return {
      ...pensionCase,
      serviceVerification: pensionCase.serviceVerification ? { ...pensionCase.serviceVerification } : undefined,
      calculation: pensionCase.calculation
        ? { ...pensionCase.calculation, trace: { ...pensionCase.calculation.trace, inputs: { ...pensionCase.calculation.trace.inputs } } }
        : undefined,
    };
  }

  /** Mirrors the API's APAR state machine: each tier action is legal only from its expected status. */
  function aparTierAction(
    formId: string,
    expected: AparFormView["status"],
    next: AparFormView["status"],
    mutate?: (form: AparFormView) => void
  ): Promise<AparFormActionResult> {
    const form = aparForms.find((candidate) => candidate.id === formId);
    if (!form) {
      return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture APAR form ${formId} not found`));
    }
    if (form.status !== expected) {
      return Promise.reject(
        fixtureError(409, "PRECONDITION_FAILED", `APAR form is in ${form.status}; this tier action requires ${expected}`)
      );
    }
    form.status = next;
    mutate?.(form);
    return Promise.resolve({ form: { ...form } });
  }

  return {
    listEmployeeContacts: () => Promise.resolve(page(employeeContacts.map((contact) => ({ ...contact })))),
    addEmployeeContact: (employeeId: string, input: EmployeeContactAddInput) => {
      const contact: EmployeeContactRecord = {
        id: `cont-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId,
        contactType: input.contactType,
        contactValue: input.contactValue,
        isPrimary: Boolean(input.isPrimary),
        isVerified: false,
        visibility: input.visibility ?? "INTERNAL",
        rowVersion: 1,
      };
      fixtureSequence += 1;
      if (contact.isPrimary) {
        for (const existing of employeeContacts) {
          if (existing.contactType === contact.contactType) {
            existing.isPrimary = false;
          }
        }
      }
      employeeContacts.push(contact);
      return Promise.resolve({ contact: { ...contact } });
    },
    listEmployeeDependents: () => Promise.resolve(page(employeeDependents.map((dependent) => ({ ...dependent })))),
    addEmployeeDependent: (employeeId: string, input: EmployeeDependentAddInput) => {
      if (input.relationship === "SPOUSE" && employeeDependents.some((dependent) => dependent.relationship === "SPOUSE")) {
        return Promise.reject(fixtureError(409, "CONFLICT", "An active spouse is already recorded", "ERR-G01-STATE"));
      }
      const dependent: EmployeeDependentRecord = {
        id: `dep-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId,
        fullName: input.fullName,
        relationship: input.relationship,
        dob: input.dob,
        isLegalHeir: Boolean(input.isLegalHeir),
        heirSuccessionRank: input.heirSuccessionRank,
      };
      fixtureSequence += 1;
      employeeDependents.push(dependent);
      return Promise.resolve({ dependent: { ...dependent } });
    },
    listEmployeeAddresses: () => Promise.resolve(page(employeeAddresses.map((address) => ({ ...address })))),
    addEmployeeAddress: (employeeId: string, input: EmployeeAddressAddInput) => {
      const address: EmployeeAddressRecord = {
        id: `addr-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId,
        addressType: input.addressType,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        district: input.district,
        state: input.state,
        country: input.country ?? "India",
        pincode: input.pincode,
        isCurrent: true,
        validFrom: input.validFrom,
        rowVersion: 1,
      };
      fixtureSequence += 1;
      employeeAddresses.push(address);
      return Promise.resolve({ address: { ...address } });
    },
    listEmployeeNominees: () => Promise.resolve({ items: employeeNominees.map((nominee) => ({ ...nominee })) }),
    addEmployeeNominee: (employeeId: string, input: NomineeAddInput) => {
      // VAL-NOMINEE caps share_pct per (employee, benefit_type), not globally — see nomineeService.ts activeShareTotal.
      const totalShare =
        employeeNominees.filter((n) => n.status === "ACTIVE" && n.benefitType === input.benefitType).reduce((sum, n) => sum + n.sharePct, 0) +
        input.sharePct;
      if (totalShare > 100) {
        return Promise.reject(fixtureError(422, "VALIDATION_FAILED", "Total nominee share for this benefit type cannot exceed 100%", "ERR-G01-NOMINEE-SHARE"));
      }
      const nominee: NomineeRecord = {
        id: `nom-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId,
        name: input.name,
        benefitType: input.benefitType,
        sharePct: input.sharePct,
        guardian: input.guardian,
        isFamilyPensionRecipient: Boolean(input.isFamilyPensionRecipient),
        status: "ACTIVE",
        rowVersion: 1,
      };
      fixtureSequence += 1;
      employeeNominees.push(nominee);
      return Promise.resolve({ nominee: { ...nominee } });
    },
    listEmployeeEmergencyContacts: () => Promise.resolve({ items: employeeEmergencyContacts.map((contact) => ({ ...contact })) }),
    addEmergencyContact: (employeeId: string, input: EmergencyContactAddInput) => {
      if (employeeEmergencyContacts.some((contact) => contact.priority === input.priority && contact.status === "ACTIVE")) {
        return Promise.reject(fixtureError(409, "CONFLICT", "That priority is already assigned to another emergency contact", "ERR-G01-EC-PRIORITY"));
      }
      const contact: EmergencyContactRecord = {
        id: `ec-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId,
        name: input.name,
        phone: input.phone,
        priority: input.priority,
        status: "ACTIVE",
        rowVersion: 1,
      };
      fixtureSequence += 1;
      employeeEmergencyContacts.push(contact);
      return Promise.resolve({ emergencyContact: { ...contact } });
    },
    listEmployeeBankAccounts: () => Promise.resolve({ items: employeeBankAccounts.map((account) => ({ ...account })) }),
    addBankAccount: (employeeId: string, input: BankAccountAddInput) => {
      const account: BankAccountRecord = {
        id: `bank-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId,
        bankName: input.bankName,
        ifsc: input.ifsc,
        accountNumberMasked: input.accountNumberMasked,
        isPrimarySalary: Boolean(input.isPrimarySalary),
        isVerified: false,
        status: "PENDING",
        pennyDropStatus: "PENDING",
        lifecycle: "ACTIVE",
        rowVersion: 1,
      };
      fixtureSequence += 1;
      employeeBankAccounts.push(account);
      return Promise.resolve({ bankAccount: { ...account } });
    },
    // NOTE: this fixture client has no notion of the calling actor's identity (unlike the real
    // HrmsClient over HTTP, its methods are not actor-scoped), so it cannot model the real backend's
    // maker!=checker SOD_VIOLATION gate (bankAccountService.ts approveBankAccount). Any test that
    // needs to verify SOD behavior must use the real API (createFoundationApi), not this fixture —
    // see apps/api/test/personal-details-self-service.test.cjs and the Playwright e2e spec, both of
    // which correctly exercise SOD against the live service, not this mock.
    approveBankAccount: (_employeeId: string, accountId: string) => {
      const account = employeeBankAccounts.find((item) => item.id === accountId);
      if (!account) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", "Bank account not found"));
      }
      account.status = "APPROVED";
      account.rowVersion += 1;
      return Promise.resolve({ bankAccount: { ...account } });
    },
    recordBankPennyDrop: (_employeeId: string, accountId: string, result: "VERIFIED" | "FAILED") => {
      const account = employeeBankAccounts.find((item) => item.id === accountId);
      if (!account) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", "Bank account not found"));
      }
      account.pennyDropStatus = result;
      account.isVerified = result === "VERIFIED";
      account.rowVersion += 1;
      return Promise.resolve({ bankAccount: { ...account } });
    },
    listPersonalDetailChangeRequests: () => Promise.resolve(page(changeRequests.map((request) => ({ ...request })))),
    createPersonalDetailChangeRequest: (input: PersonalDetailChangeCreateInput) => {
      const request: PersonalDetailChangeRecord = {
        id: `g02-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        requestNo: `G02/${String(fixtureSequence + 1).padStart(5, "0")}`,
        employeeId: input.employeeId,
        fieldCode: input.fieldCode,
        oldValue: input.fieldCode === "displayName" ? employees[0].displayName : "[HIDDEN]",
        newValue: input.newValue,
        sensitivity: input.fieldCode === "displayName" ? "LOW" : "HIGH",
        status: "IN_REVIEW",
        revisionNo: 1,
        documentIds: [],
      };
      fixtureSequence += 1;
      changeRequests.push(request);
      return Promise.resolve({ request: { ...request } });
    },
    decidePersonalDetailChangeRequest: (requestId, verb, comment) => {
      const request = changeRequests.find((candidate) => candidate.id === requestId);
      if (!request) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture change request ${requestId} not found`));
      }
      if ((verb === "reject" || verb === "send-back") && !comment?.trim()) {
        // Mirrors the API's VAL-COMMENT rule: reject/return decisions need a mandatory comment.
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "A decision comment is required", "ERR-REASON-REQ"));
      }
      request.status = verb === "approve" ? "APPROVED" : verb === "reject" ? "REJECTED" : "RETURNED";
      request.decisionComment = comment;
      return Promise.resolve({ request: { ...request } });
    },
    getPersonalDetailChangeRequestDiff: (requestId) => {
      const request = changeRequests.find((candidate) => candidate.id === requestId);
      if (!request) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture change request ${requestId} not found`));
      }
      const masked = request.sensitivity === "HIGH";
      const diff: ChangeRequestDiffResult = {
        changeRequestId: request.id,
        requestNo: request.requestNo,
        status: request.status,
        revisionNo: request.revisionNo,
        fields: [
          {
            fieldCode: request.fieldCode,
            displayLabel: request.fieldCode,
            sensitivity: request.sensitivity,
            oldValue: masked ? "[HIDDEN]" : request.oldValue,
            newValue: masked ? "[HIDDEN]" : request.newValue,
            masked,
          },
        ],
      };
      return Promise.resolve(diff);
    },
    listAttendance: () => Promise.resolve(page(attendanceRecords.map((record) => ({ ...record })))),
    captureAttendance: (input: AttendanceCaptureInput) => {
      const record: AttendanceRecordView = {
        id: `att-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId: input.employeeId,
        attendanceDate: input.attendanceDate,
        inTime: input.inTime,
        outTime: input.outTime,
        status: input.inTime && input.outTime ? "PRESENT" : "ANOMALY",
        anomalyCode: input.inTime && input.outTime ? undefined : input.inTime ? "MISSING_OUT" : "MISSING_IN",
      };
      fixtureSequence += 1;
      attendanceRecords.push(record);
      return Promise.resolve({ attendance: { ...record } });
    },
    // NOTE: like approveBankAccount above, this fixture has no notion of caller identity and
    // cannot model the real backend's maker!=checker SOD_VIOLATION gate (leaveService.ts
    // regulariseAttendance). Tests needing to verify that gate must use the real API — see
    // apps/api/test/attendance-capture-regularization.test.cjs and the Playwright e2e spec.
    regulariseAttendance: (attendanceId: string, _reason: string) => {
      const record = attendanceRecords.find((item) => item.id === attendanceId);
      if (!record) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", "Attendance record not found"));
      }
      record.status = "REGULARISED";
      record.anomalyCode = undefined;
      record.isRegularised = true;
      return Promise.resolve({ attendance: { ...record } });
    },
    getLeaveBalance: () => Promise.resolve({ ...leaveBalance }),
    listMyRightsRequests: () => Promise.resolve(page(rightsRequests.map((r) => ({ ...r })))),
    raiseRightsRequest: (input) => {
      const row: MyRightsRequest = { id: `rr-${rightsRequests.length + 1}`, rightType: input.rightType, status: "RECEIVED", raisedOn: "2026-07-03" };
      rightsRequests.push(row);
      return Promise.resolve({ ...row });
    },
    listSealedCovers: () => Promise.resolve(page(sealedCovers.map((r) => ({ ...r })))),
    releaseSealedCover: (id, input) => {
      const row = sealedCovers.find((r) => r.id === id);
      if (!row) return Promise.reject(new Error("NOT_FOUND"));
      if (!input.reason) return Promise.reject(new Error("VALIDATION_FAILED"));
      row.status = "RELEASED";
      return Promise.resolve({ ...row });
    },
    listBiKpis: () =>
      Promise.resolve(
        page([
          { kpiCode: "HEADCOUNT", label: "Employee headcount", value: 12480, trend: "UP" },
          { kpiCode: "ATTRITION", label: "Attrition rate (%)", value: 4, trend: "DOWN" },
          { kpiCode: "PENDING_PROMOTIONS", label: "Pending promotions", value: 37, trend: "FLAT" },
        ])
      ),
    listCaseEvidence: (caseId) =>
      Promise.resolve(
        page(
          caseId
            ? [
                { documentId: "cdoc-1", artefactType: "CHARGE_MEMO", isWorm: true, legalHold: false, isServed: true },
                { documentId: "cdoc-2", artefactType: "INQUIRY_REPORT", isWorm: true, legalHold: true, isServed: false },
              ]
            : []
        )
      ),
    getCounsellingSession: () => Promise.resolve({ ...counsellingSession, vacancies: counsellingSession.vacancies.map((v) => ({ ...v })) }),
    submitCounsellingChoice: (input) => {
      const v = counsellingSession.vacancies.find((x) => x.vacancyId === input.vacancyId);
      if (!v || !v.open) return Promise.reject(new Error("ERR-G05-VACANCY-FULL"));
      v.open = false;
      counsellingSession.currentTurnEmployeeId = "emp-2";
      return Promise.resolve({ reservationId: "resv-1", nextTurnEmployeeId: counsellingSession.currentTurnEmployeeId });
    },
    listDataSubjectRequests: () => Promise.resolve(page(dsrRows.map((r) => ({ ...r })))),
    adjudicateDsr: (id, input) => {
      const row = dsrRows.find((r) => r.id === id);
      if (!row) return Promise.reject(new Error("NOT_FOUND"));
      row.status = input.decision;
      row.legalBasis = input.decision === "EXEMPTED" ? "STATUTORY_RETENTION" : row.legalBasis;
      return Promise.resolve({ ...row });
    },
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
    listMyTransferOrders: (employeeId: string) =>
      Promise.resolve({
        items: transferOrders
          .filter((order) => order.employeeId === employeeId)
          .map((order) => ({ ...order, clearanceItems: order.clearanceItems.map((item) => ({ ...item })) })),
      }),
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
    acknowledgeTransferOrder: (transferOrderId: string, input: TransferAcknowledgeInput) => {
      const order = transferOrders.find((candidate) => candidate.id === transferOrderId);
      if (!order) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture transfer order ${transferOrderId} not found`));
      }
      order.acknowledgedAt = input.acknowledgedAt;
      return Promise.resolve({
        acknowledgement: {
          id: `transfer-ack-fixture-${transferOrderId}`,
          transferOrderId,
          employeeId: order.employeeId,
          servedOnDate: order.servedOnDate ?? input.acknowledgedAt,
          acknowledgementStatus: "ACKNOWLEDGED" as const,
          acknowledgedAt: input.acknowledgedAt,
        },
      });
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
    listMyDocuments: () => Promise.resolve({ items: documents.map((document) => ({ ...document })) }),
    fetchDocument: (documentId: string, intent: "VIEW" | "DOWNLOAD") => {
      if (!documents.some((document) => document.id === documentId)) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture document ${documentId} not found`));
      }
      if (intent === "VIEW") {
        return Promise.resolve({
          fetch: { documentId, intent: "VIEW" as const, render: { renderToken: "fixture-render-token", expiresInSeconds: 300, watermarked: true, sessionBound: true, disposition: "inline" } },
        });
      }
      return Promise.resolve({
        fetch: { documentId, intent: "DOWNLOAD" as const, grant: { grantToken: "fixture-grant-token", right: "DOWNLOAD", versionNo: 1, contentHash: "fixture-hash", disposition: "attachment" } },
      });
    },
    getLeaveSlice: () => Promise.resolve({ ...leaveSlice }),
    getPersonalDetailsSlice: () => Promise.resolve({ ...personalDetailsSlice }),
    getLeaveSrRelaySlice: () => Promise.resolve({ ...leaveSrRelaySlice }),
    getTransferSlice: () => Promise.resolve({ ...transferSlice, clearances: transferSlice.clearances.map((clearance) => ({ ...clearance })) }),
    getPromotionSlice: () => Promise.resolve({ ...promotionSlice }),
    listMyPromotionOrders: () => Promise.resolve(page(promotionOrders.map((order) => ({ ...order })))),
    listMyProbationRecords: (employeeId: string) =>
      Promise.resolve({ probationRecords: probationRecords.filter((record) => record.employeeId === employeeId).map((record) => ({ ...record })) }),
    listMyPromotionRefusals: (employeeId: string) =>
      Promise.resolve({ refusals: promotionRefusals.filter((refusal) => refusal.employeeId === employeeId).map((refusal) => ({ ...refusal })) }),
    getTrainingSlice: () => Promise.resolve({ ...trainingSlice }),
    getAparSlice: () => Promise.resolve({ ...aparSlice }),
    listMyAparForms: (employeeId: string) => Promise.resolve({ items: aparForms.filter((form) => form.employeeId === employeeId).map((form) => ({ ...form })) }),
    getDisciplinarySlice: () => Promise.resolve({ ...disciplinarySlice }),
    getPayrollSlice: () => Promise.resolve({ ...payrollSlice }),
    listMyPayslips: () =>
      Promise.resolve({
        items: [
          {
            payslip: {
              id: "payslip-fixture-000001",
              payslipNo: "PS-2026-06-fixture-V1",
              employeeId: employees[0].id,
              period: "2026-06",
              version: 1,
              status: "PUBLISHED",
              grossCents: 8500000,
              deductionsCents: 30000,
              netPayCents: 8470000,
            },
            lines: [
              { componentCode: "BASIC", lineType: "EARNING", amountCents: 8500000, sequenceNo: 1 },
              { componentCode: "PT", lineType: "DEDUCTION", amountCents: 30000, sequenceNo: 2 },
            ],
          },
        ],
      }),
    getMyYtdStatement: () =>
      Promise.resolve({
        ytd: { employeeId: employees[0].id, byComponent: { BASIC: 8500000, PT: 30000 }, grossCents: 8500000, deductionsCents: 30000, netCents: 8470000, lineCount: 2 },
      }),
    createSalaryStructure: (input: SalaryStructureCreateInput) => {
      const structure: FixtureSalaryStructure = {
        id: `salary-structure-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        employeeId: input.employeeId,
        basicPayCents: input.basicPayCents ?? fixtureLastBasicPayCents,
        daRateBps: input.daRateBps ?? 4200,
        hraRateBps: input.hraRateBps ?? 800,
        npsRateBps: input.npsRateBps ?? 1000,
        professionalTaxCents: input.professionalTaxCents ?? 20000,
        ruleVersion: input.ruleVersion ?? "PAY-RULE-2026-01",
        effectiveFrom: input.effectiveFrom,
      };
      if (structure.basicPayCents <= 0) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "basicPayCents must be positive"));
      }
      fixtureSequence += 1;
      salaryStructures.push(structure);
      return Promise.resolve({
        salaryStructure: {
          id: structure.id,
          employeeId: structure.employeeId,
          basicPayCents: structure.basicPayCents,
          ruleVersion: structure.ruleVersion,
          effectiveFrom: structure.effectiveFrom,
        },
      });
    },
    createPayrollRun: (period: string) => {
      const run: PayrollRunView = {
        id: `payroll-run-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        period,
        status: "OPEN",
        makerUserId: "usr-payroll-maker",
        lines: [],
        totals: { grossCents: 0, deductionsCents: 0, netPayCents: 0 },
      };
      fixtureSequence += 1;
      payrollRuns.push(run);
      return Promise.resolve<PayrollRunActionResult>({ payrollRun: cloneRun(run) });
    },
    actOnPayrollRun: (runId: string, verb: PayrollRunLifecycleVerb) => {
      const run = payrollRuns.find((candidate) => candidate.id === runId);
      if (!run) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture payroll run ${runId} not found`));
      }
      const transition = runVerbTransitions[verb];
      if (run.status !== transition.from) {
        return Promise.reject(
          fixtureError(409, "PRECONDITION_FAILED", `Run is ${run.status}; ${verb} requires ${transition.from}`)
        );
      }
      if (verb === "lock-inputs" && salaryStructures.length === 0) {
        return Promise.reject(
          fixtureError(409, "PRECONDITION_FAILED", "At least one salary structure is required before payroll lock")
        );
      }
      if (verb === "lock-inputs") {
        run.ruleVersionSnapshot = salaryStructures[0]?.ruleVersion ?? "PAY-RULE-2026-01";
        run.inputSnapshotHash = `fixture-snapshot-${run.id}`;
      }
      if (verb === "compute") {
        computeFixtureLines(run);
      }
      if (verb === "disburse") {
        run.bankBatch = {
          id: `bank-batch-fixture-${String(fixtureSequence).padStart(6, "0")}`,
          adapter: "X3_BANK_SANDBOX",
          marker: "BANK_X3_EXPORT",
          status: "RECONCILED",
          totalNetCents: run.totals.netPayCents,
        };
        fixtureSequence += 1;
      }
      run.status = transition.to;
      return Promise.resolve<PayrollRunActionResult>({ payrollRun: cloneRun(run) });
    },
    getPensionSlice: () => Promise.resolve({ ...pensionSlice }),
    createPensionCase: (input: PensionCaseCreateInput) => {
      const pensionCase: PensionCaseView = {
        id: `pension-case-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        caseNo: `PEN/${input.separationDate.slice(0, 4)}/${String(fixtureSequence).padStart(5, "0")}`,
        employeeId: input.employeeId,
        separationDate: input.separationDate,
        scheme: input.scheme,
        status: "DRAFT",
      };
      fixtureSequence += 1;
      pensionCases.push(pensionCase);
      return Promise.resolve<PensionCaseActionResult>({ pensionCase: clonePensionCase(pensionCase) });
    },
    verifyPensionService: (caseId: string, input: PensionServiceVerifyInput) => {
      const pensionCase = pensionCases.find((candidate) => candidate.id === caseId);
      if (!pensionCase) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture pension case ${caseId} not found`));
      }
      if (!input.srCertified) {
        return Promise.reject(
          fixtureError(409, "PRECONDITION_FAILED", "SR_VERIFICATION_GATE requires certified Service Register facts")
        );
      }
      if (!Number.isInteger(input.totalServiceMonths) || input.totalServiceMonths <= 0) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "totalServiceMonths must be positive"));
      }
      const penaltyExclusionMonths = input.penaltyExclusionMonths ?? 0;
      pensionCase.status = "SR_VERIFICATION";
      pensionCase.serviceVerification = {
        srVerified: true,
        totalServiceMonths: input.totalServiceMonths,
        penaltyExclusionMonths,
        qualifyingServiceMonths: Math.max(0, input.totalServiceMonths - penaltyExclusionMonths),
        status: "QUALIFYING_SERVICE_LOCKED",
      };
      return Promise.resolve<PensionCaseActionResult>({ pensionCase: clonePensionCase(pensionCase) });
    },
    estimatePensionBenefits: (caseId: string, input: PensionEstimateInput) => {
      const pensionCase = pensionCases.find((candidate) => candidate.id === caseId);
      if (!pensionCase) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture pension case ${caseId} not found`));
      }
      const verification = pensionCase.serviceVerification;
      if (!verification || verification.status !== "QUALIFYING_SERVICE_LOCKED") {
        return Promise.reject(
          fixtureError(409, "PRECONDITION_FAILED", "QUALIFYING_SERVICE_LOCKED verification is required before pension calculation")
        );
      }
      // Scheme-BRANCHED fixture mirror of computeSchemeBenefit (FR-G11-05): distinct
      // OPS / UPS / NPS outcomes, never a silent default.
      let benefitOutcome: string;
      let pensionCents: number;
      let formula: string;
      if (verification.qualifyingServiceMonths < fixturePensionLimits.minQualifyingYearsForPension * 12) {
        benefitOutcome = "SERVICE_GRATUITY_ONLY";
        pensionCents = 0;
        formula = "qualifying<E35.min_qualifying_years_for_pension => SERVICE_GRATUITY route (FR-05 AC1a; no monthly pension)";
      } else if (pensionCase.scheme === "OPS") {
        benefitOutcome = "FULL_PENSION";
        pensionCents = Math.min(
          fixturePensionLimits.maxPensionCents,
          Math.max(fixturePensionLimits.minPensionCents, Math.floor(fixtureLastBasicPayCents / 2))
        );
        formula = "OPS: basic_pension=flat 50% of emoluments_base, E35 min/max clamped (FR-05 AC1/AC3)";
      } else if (pensionCase.scheme === "UPS") {
        if (!input.upsOptedIn) {
          return Promise.reject(
            fixtureError(409, "ERR-G11-SCHEME-MISMATCH", "UPS assured payout requires ups_opted_in on the case")
          );
        }
        benefitOutcome = "UPS_ASSURED";
        pensionCents = Math.max(fixturePensionLimits.upsMinGuaranteeCents, Math.floor(fixtureLastBasicPayCents / 2));
        formula = "UPS: assured_payout=50% of 12-month average pay with E35 ups_min_guarantee (FR-05 AC4b)";
      } else if ((input.npsEvent ?? "SUPERANNUATION") === "SUPERANNUATION") {
        benefitOutcome = "NPS_INDICATIVE";
        pensionCents = 0;
        formula = "NPS superannuation: corpus/PRAN + indicative annuity only — excluded from determinism (FR-05 AC4)";
      } else {
        benefitOutcome = input.npsEvent === "DEATH_IN_SERVICE" ? "NPS_DEFAULT_FAMILY" : "NPS_DEFAULT_INVALID";
        pensionCents = Math.floor(fixtureLastBasicPayCents / 2);
        formula = "NPS death/invalidation: CCS-NPS Rules 2021 OPS-equivalent default benefit (FR-05 AC4a)";
      }
      pensionCase.status = "PENDING_SANCTION";
      pensionCase.calculation = {
        calculationId: `pen-pension-calc-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        scheme: pensionCase.scheme,
        benefitOutcome,
        pensionCents,
        trace: {
          marker: "PENSION_CALC_TRACE",
          ruleVersion: input.ruleVersion ?? "PENSION-RULE-2026-01",
          ruleVersionRef: "pen-limit-rule-fixture-000001",
          formula,
          inputs: { lastBasicPayCents: fixtureLastBasicPayCents, qualifyingServiceMonths: verification.qualifyingServiceMonths },
        },
      };
      fixtureSequence += 1;
      return Promise.resolve<PensionCaseActionResult>({ pensionCase: clonePensionCase(pensionCase) });
    },
    runMyPensionEstimate: (input: PensionSelfEstimateInput) => {
      if (!input.asOf) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "asOf must use YYYY-MM-DD"));
      }
      const qualifyingServiceMonths = input.qualifyingServiceMonths ?? 240;
      const emolumentsBaseCents = input.emolumentsBaseCents ?? fixtureLastBasicPayCents;
      const belowThreshold = qualifyingServiceMonths < fixturePensionLimits.minQualifyingYearsForPension * 12;
      const pensionCents = belowThreshold
        ? 0
        : Math.min(fixturePensionLimits.maxPensionCents, Math.max(fixturePensionLimits.minPensionCents, Math.floor(emolumentsBaseCents / 2)));
      return Promise.resolve<PensionSelfEstimateResult>({
        estimate: {
          isBinding: false,
          employeeId: input.employeeId,
          scheme: input.scheme,
          asOf: input.asOf,
          qualifyingServiceMonths,
          emolumentsBaseCents,
          benefitOutcome: belowThreshold ? "SERVICE_GRATUITY_ONLY" : "FULL_PENSION",
          pensionCents,
          formula: "Fixture non-binding estimate mirror of OPS flat-50% (FR-G11-15 AC1/AC2)",
          ruleVersionRef: "pen-limit-rule-fixture-000001",
        },
      });
    },
    listMyPensionCases: (employeeId: string) =>
      Promise.resolve({ items: pensionCases.filter((pensionCase) => pensionCase.employeeId === employeeId).map(clonePensionCase) }),
    getAnalyticsSlice: () => Promise.resolve({ ...analyticsSlice }),
    getMyDashboard: (employeeId: string) =>
      Promise.resolve({
        dashboard: {
          employeeId,
          leaveBalance: { leaveTypeId: "EL", leaveYear: 2026, currentBalance: 18, reserved: 0, debited: 12, availableBalance: 18 },
          attendanceSummary: { totalRecords: 20, presentDays: 18, regularisedDays: 1 },
        },
      }),
    listAnalyticsKpis: (kpiCode?: string) =>
      Promise.resolve(page(analyticsKpis.filter((kpi) => !kpiCode || kpi.kpiCode === kpiCode).map((kpi) => ({ ...kpi })))),
    queryKpiAggregate: (martCode: string, dimension: string) => {
      const dimensions = martDimensionCounts[martCode];
      if (!dimensions) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture datamart ${martCode} is not registered`));
      }
      const groups = dimensions[dimension] ?? {};
      const { cells, total, suppressedCells } = suppressFixtureCells(groups);
      const result: AnalyticsAggregateResult = {
        martCode,
        dimension,
        minCellSizeK: FIXTURE_MIN_CELL_SIZE_K,
        cells,
        total,
        suppressedCells,
      };
      return Promise.resolve(result);
    },
    listMartRefreshLogs: () => Promise.resolve(page(buildMartRefreshLogs())),
    openDisciplinaryCase: (input: DisciplinaryCaseOpenInput) => {
      if (input.chargedEmployeeId === input.disciplinaryAuthorityId) {
        // Mirrors the API's G09_AUTHORITY_COMPETENCE self-authority block.
        return Promise.reject(fixtureError(409, "CONFLICT", "G09_AUTHORITY_COMPETENCE blocks self disciplinary authority"));
      }
      const disciplinaryCase: DisciplinaryCaseView = {
        id: `disciplinary-case-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        caseNo: `DCP/${String(fixtureSequence).padStart(5, "0")}`,
        chargedEmployeeId: input.chargedEmployeeId,
        disciplinaryAuthorityId: input.disciplinaryAuthorityId,
        stage: "INTAKE",
        caseStatus: "OPEN",
        confidential: Boolean(input.confidential),
      };
      fixtureSequence += 1;
      disciplinaryCases.push(disciplinaryCase);
      return Promise.resolve({ disciplinaryCase: { ...disciplinaryCase } });
    },
    serveDisciplinaryCharge: (caseId: string, input: ChargeMemoInput) => {
      const disciplinaryCase = disciplinaryCases.find((candidate) => candidate.id === caseId);
      if (!disciplinaryCase) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture disciplinary case ${caseId} not found`));
      }
      if (disciplinaryCase.stage !== "INTAKE") {
        return Promise.reject(fixtureError(409, "PRECONDITION_FAILED", "Charge memo can only be served at the INTAKE stage"));
      }
      if (input.articles.length === 0) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "At least one article of charge is required"));
      }
      disciplinaryCase.stage = "CHARGE";
      disciplinaryCase.chargeMemoDocumentId = `doc-fixture-${String(fixtureSequence).padStart(6, "0")}`;
      fixtureSequence += 1;
      return Promise.resolve({ disciplinaryCase: { ...disciplinaryCase } });
    },
    listMyDisciplinaryCases: (employeeId: string) =>
      Promise.resolve({ items: myDisciplinaryCases.filter((item) => item.chargedEmployeeId === employeeId).map((item) => ({ ...item })) }),
    listMyShowCauseNotices: (caseId: string) =>
      Promise.resolve({ items: myShowCauseNotices.filter((notice) => notice.caseId === caseId).map((notice) => ({ ...notice })) }),
    respondToShowCause: (noticeId: string, input: RespondToShowCauseInput) => {
      const notice = myShowCauseNotices.find((candidate) => candidate.id === noticeId);
      if (!notice) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture show-cause notice ${noticeId} not found`));
      }
      notice.status = "RESPONDED";
      notice.representationText = input.representationText;
      notice.respondedAt = input.respondedAt;
      return Promise.resolve({ notice: { ...notice } });
    },
    listMyPersonalHearings: (caseId: string) =>
      Promise.resolve({ items: myPersonalHearings.filter((hearing) => hearing.caseId === caseId).map((hearing) => ({ ...hearing })) }),
    requestPersonalHearing: (caseId: string, input: RequestPersonalHearingInput) => {
      const hearing: PersonalHearingView = {
        id: `g09-personal-hearing-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        caseId,
        stage: input.stage,
        requested: true,
        requestedOn: input.requestedOn,
        status: "REQUESTED",
        granted: false,
      };
      fixtureSequence += 1;
      myPersonalHearings.push(hearing);
      return Promise.resolve({ personalHearing: { ...hearing } });
    },
    holdDpc: (promotionCaseId: string, input: DpcHoldInput) => {
      if (promotionCaseId !== promotionCase.id) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture promotion case ${promotionCaseId} not found`));
      }
      const recused = input.recusedEmployeeIds ?? [];
      const candidateIds = new Set(promotionCase.candidates.map((candidate) => candidate.employeeId));
      const conflicted = input.panelMembers.find(
        (member) => member.employeeId && candidateIds.has(member.employeeId) && !recused.includes(member.employeeId)
      );
      if (conflicted) {
        return Promise.reject(
          fixtureError(409, "PANEL_CONFLICT_OF_INTEREST", "A candidate on this case cannot be a DPC panel member unless recused (P02 SoD)")
        );
      }
      const participatingMembers = input.panelMembers.filter((member) => !member.employeeId || !recused.includes(member.employeeId)).length;
      const quorumRequired = input.quorumRequired ?? 2;
      if (participatingMembers < quorumRequired) {
        return Promise.reject(fixtureError(422, "QUORUM_NOT_MET", "DPC quorum is not met"));
      }
      promotionCase.status = "DPC_HELD";
      promotionCase.candidates = promotionCase.candidates.map((candidate, index) => ({
        ...candidate,
        fitness: "FIT",
        isSelected: index < promotionCase.vacancies,
      }));
      promotionCase.dpc = { quorumRequired, participatingMembers, recusedEmployeeIds: [...recused], verdict: "FIT_PANEL" };
      return Promise.resolve({ promotionCase: { ...promotionCase, candidates: promotionCase.candidates.map((candidate) => ({ ...candidate })) } });
    },
    submitAparSelf: (formId: string, input: AparSelfAppraisalInput) => {
      if (!input.narrative.trim()) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "Achievements narrative is required"));
      }
      return aparTierAction(formId, "SELF_APPRAISAL", "RO_ASSESSMENT", (form) => {
        form.selfAppraisalNarrative = input.narrative;
        form.selfAppraisalRatings = input.selfRatings ? { ...input.selfRatings } : undefined;
      });
    },
    recordAparReporting: (formId: string, input: AparReportingInput) => {
      if (!input.grade.trim() || !input.narrative.trim()) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "Reporting grade and narrative are required"));
      }
      return aparTierAction(formId, "RO_ASSESSMENT", "RVO_REVIEW", (form) => {
        form.grade = input.grade;
      });
    },
    recordAparReview: (formId: string, input: AparReviewInput) => {
      if (!input.remarks.trim()) {
        return Promise.reject(fixtureError(400, "VALIDATION_FAILED", "Review remarks are required"));
      }
      return aparTierAction(formId, "RVO_REVIEW", "AA_ACCEPTANCE");
    },
    nominateForTraining: (input: TrainingNominationInput) => {
      const session = trainingSessions.find((candidate) => candidate.id === input.sessionId);
      if (!session) {
        return Promise.reject(fixtureError(404, "NOT_FOUND", `Fixture training session ${input.sessionId} not found`));
      }
      const enrolled = trainingNominations.filter((nomination) => nomination.sessionId === session.id).length;
      const nomination: TrainingNominationView = {
        id: `training-nomination-fixture-${String(fixtureSequence).padStart(6, "0")}`,
        nominationNo: `TN/${String(fixtureSequence).padStart(5, "0")}`,
        sessionId: session.id,
        employeeId: input.employeeId,
        status: enrolled >= session.capacity ? "WAITLISTED" : "PENDING_L1",
        waitlistPosition: enrolled >= session.capacity ? enrolled - session.capacity + 1 : undefined,
      };
      fixtureSequence += 1;
      trainingNominations.push(nomination);
      return Promise.resolve({ nomination: { ...nomination } });
    },
    listTrainingSessions: () => Promise.resolve({ items: trainingSessions.map((session) => ({ ...session })) }),
    listMyTrainingNominations: (employeeId: string) =>
      Promise.resolve({ items: trainingNominations.filter((nomination) => nomination.employeeId === employeeId).map((nomination) => ({ ...nomination })) }),
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
