export const HRMS_API_ROUTES = {
  biKpis: "/api/v1/analytics/bi-kpis",
  dataSubjectRequests: "/api/v1/dsr",
  counsellingSessions: "/api/v1/transfers/counselling",
  disciplinaryEvidence: "/api/v1/disciplinary/cases",
  workflowTasks: "/api/v1/workflow/tasks",
  workflowInstances: "/api/v1/workflow/instances",
  employees: "/api/v1/employees",
  personalDetailChanges: "/api/v1/personal-details/change-requests",
  changeRequests: "/api/v1/change-requests",
  leaveApplications: "/api/v1/atl/leave-applications",
  leaveBalances: "/api/v1/atl/leave-balances",
  leaveTypes: "/api/v1/atl/leave-types",
  leaveOutbox: "/api/v1/atl/leave-sr-outbox",
  payrollSignals: "/api/v1/atl/payroll-signals",
  leaveSrOutbox: "/api/v1/leave-sr/outbox",
  leaveSrReconciliation: "/api/v1/leave-sr/reconciliation",
  transferOrders: "/api/v1/transfers/orders",
  promotionSummary: "/api/v1/promotions/summary",
  promotionCases: "/api/v1/promotions/cases",
  trainingSummary: "/api/v1/training/summary",
  trainingNominations: "/api/v1/training/nominations",
  aparSummary: "/api/v1/apar/summary",
  aparForms: "/api/v1/apar/forms",
  disciplinarySummary: "/api/v1/disciplinary/summary",
  disciplinaryCases: "/api/v1/disciplinary/cases",
  payrollSummary: "/api/v1/payroll/summary",
  // PH-09E: run-lifecycle console + payslip line source (the compute response carries the
  // per-employee component lines the payslip view renders — no separate payslip read route exists).
  payrollSalaryStructures: "/api/v1/payroll/salary-structures",
  payrollRuns: "/api/v1/payroll/runs",
  pensionSummary: "/api/v1/pension/summary",
  pensionCases: "/api/v1/pension/cases",
  analyticsSummary: "/api/v1/analytics/summary",
  // PH-10E: the PH-10D analytics engine reads the dashboard binds to (live KPI values,
  // suppression-aware aggregates, and datamart_refresh_logs freshness).
  analyticsKpis: "/api/v1/analytics/kpis",
  analyticsAggregate: "/api/v1/analytics/aggregate",
  analyticsRefreshLogs: "/api/v1/analytics/datamarts/refresh-logs",
  srIngest: "/api/v1/sr/ingest",
  srEmployees: "/api/v1/sr/employees",
  documents: "/api/v1/documents",
} as const;

export const HRMS_API_HEADERS = {
  correlationId: "X-Correlation-Id",
  idempotencyKey: "Idempotency-Key",
} as const;

export interface PageResult<TItem> {
  items: TItem[];
  limit: number;
  next_cursor: string | null;
}

/** Cursor-paged reads shipped in PH-04C: limit + next_cursor echoed back as `cursor`. */
export interface PageQuery {
  limit?: number;
  cursor?: string;
}

/** G13 DPDP data-subject request row (PH-15E engine; PH-27A console). */
/** G14 embedded-BI KPI tile (PH-10D analytics engine; PH-34A dashboard). */
export interface BiKpiTile {
  kpiCode: string;
  label: string;
  value: number;
  trend: "UP" | "DOWN" | "FLAT";
}

/** G09 case evidence-vault row (WORM + legal-hold flags) for the evidence listing (PH-27C). */
export interface CaseEvidenceItem {
  documentId: string;
  artefactType: string;
  isWorm: boolean;
  legalHold: boolean;
  isServed: boolean;
}

/** G05 counselling session + a vacancy choice (PH-16D engine; PH-27B console). */
export interface CounsellingSessionView {
  id: string;
  currentTurnEmployeeId: string | null;
  vacancies: Array<{ vacancyId: string; postLabel: string; open: boolean }>;
}

export interface CounsellingChoiceInput {
  sessionId: string;
  employeeId: string;
  vacancyId: string;
}

export interface CounsellingChoiceResult {
  reservationId: string;
  nextTurnEmployeeId: string | null;
}

export interface DsrRecord {
  id: string;
  subjectEmployeeId: string;
  requestType: "ACCESS" | "RECTIFY" | "ERASE";
  status: "RECEIVED" | "UNDER_REVIEW" | "EXEMPTED" | "FULFILLED" | "REJECTED";
  legalBasis?: string;
}

export interface DsrAdjudicateInput {
  decision: "EXEMPTED" | "FULFILLED" | "REJECTED";
  reason: string;
}

export interface WorkflowTaskSummary {
  id: string;
  instanceId: string;
  stage: string;
  status: "PENDING" | "COMPLETED";
}

export interface EmployeeSummary {
  id: string;
  serviceNo: string;
  displayName: string;
  employmentStatus: string;
  designation?: string;
}

/**
 * GET /api/v1/employees/{id}/profile-360 response. Governed PII (pan/aadhaarMasked/category)
 * arrives pre-masked by the API per the actor's P02 fieldGrants — "[HIDDEN]" without a grant,
 * the stored masked form (e.g. xxxx-xxxx-1234 for Aadhaar) with one. The client never unmasks.
 */
export interface EmployeeProfileView {
  id: string;
  serviceNo: string;
  displayName: string;
  employmentStatus: string;
  orgUnitId: string;
  designation?: string;
  dateOfJoining?: string;
  pan?: string;
  aadhaarMasked?: string;
  category?: string;
  rowVersion: number;
}

/** One G12 ledger entry from GET /api/v1/sr/employees/{id}/timeline (append-only, hash-chained). */
export interface SrTimelineEntry {
  id: string;
  sequenceNo: number;
  employeeId: string;
  sourceModule: string;
  eventTypeCode: string;
  eventDate: string;
  entryHash: string;
  previousHash: string;
  status: "ACTIVE" | "SUPERSEDED" | "ANNOTATED";
}

export interface DocumentSummary {
  id: string;
  docNo: string;
  title: string;
  status: string;
  classification: string;
  currentVersionNo: number;
  isWorm: boolean;
  legalHold: boolean;
}

export interface LeaveSliceSummary {
  applicationNo: string;
  status: "SUBMITTED" | "APPROVED";
  resolver: "REPORTING_CHAIN";
  action: "DELEGATE" | "APPROVE";
  balanceAvailable: number;
  g04OutboxStatus: "READY" | "POSTED";
  srEventType: "LEAVE_APPROVED";
  payrollSignalStatus?: "READY_FOR_G10";
  payrollSignalsReady?: number;
}

export interface PersonalDetailsSliceSummary {
  requestNo: string;
  fieldCode: "displayName" | "pan" | "aadhaarMasked";
  status: "IN_REVIEW" | "APPROVED" | "COMMITTED" | "REVERSED";
  sensitivity: "LOW" | "HIGH";
  ownerModule: "G01";
  documentCount: number;
}

export interface LeaveSrRelaySliceSummary {
  total: number;
  posted: number;
  deadLettered: number;
  discarded: number;
  relayOwner: "G04";
}

export interface ClearanceSummary {
  code: string;
  status: "OPEN" | "CLEARED" | "DEEMED_CLEARED";
}

export interface TransferSliceSummary {
  orderNo: string;
  status: "APPROVED" | "JOINED";
  resolver: "POSITION_AUTHORITY";
  clearancePattern: "PARALLEL_ALL_OF";
  clearances: ClearanceSummary[];
  documentCount: number;
  srEventType: "TRANSFER_JOINED";
}

export interface PromotionSliceSummary {
  seniorityLists: number;
  promotionOrders: number;
  macpEffected: number;
  paySignalsReady: number;
  dpcMarker: "DPC_QUORUM";
  recusalMarker: "DPC_RECUSAL";
  srEventType: "PROMOTION_EFFECTED" | "MACP_EFFECTED";
}

export interface TrainingSliceSummary {
  sessions: number;
  approved: number;
  completed: number;
  srPosted: number;
  workflowCode: "WF-G07-NOMINATION";
  srEventType: "TRAINING_CERTIFICATION_POSTED";
}

export interface AparSliceSummary {
  forms: number;
  posted: number;
  sealedCover: number;
  g06FeedSuppressed: number;
  srEventType: "APAR_FINAL_GRADE";
  sealedMarker: "SEALED_COVER";
  feedMarker: "G08_G06_FEED_SUPPRESSED";
}

export interface DisciplinarySliceSummary {
  cases: number;
  penalties: number;
  confidential: number;
  impactSignals: number;
  competenceMarker: "G09_AUTHORITY_COMPETENCE";
  penaltyEventType: "MAJOR_PENALTY";
  appealMarker: "APPEAL_DECIDED";
}

export interface PayrollSliceSummary {
  salaryStructures: number;
  runs: number;
  lockedRuns: number;
  disbursedRuns: number;
  lastPayDrawnFeeds: number;
  calculationMarker: "PAYROLL_TRACE";
  ruleSnapshotMarker: "RULE_VERSION_SNAPSHOT";
  inputLockMarker: "INPUT_LOCKED";
  x3Marker: "BANK_X3_EXPORT";
  lastPayMarker: "LAST_PAY_DRAWN";
}

export interface PensionSliceSummary {
  cases: number;
  serviceVerified: number;
  sanctioned: number;
  pposIssued: number;
  srPosted: number;
  serviceGateMarker: "SR_VERIFICATION_GATE";
  qualifyingServiceMarker: "QUALIFYING_SERVICE_LOCKED";
  calculationMarker: "PENSION_CALC_TRACE";
  ppoMarker: "PPO_ISSUED";
  srMarker: "G11_SR_POSTED";
}

// ---- PH-09E: G10 payroll run lifecycle + payslip projection ----

/** g10_payroll_runs status machine the run console mirrors (invalid verbs stay hidden). */
export type PayrollRunStatus = "OPEN" | "INPUT_LOCKED" | "COMPUTED" | "RECONCILED" | "APPROVED" | "LOCKED" | "DISBURSED" | "CLOSED";

/** Lifecycle verbs on POST /api/v1/payroll/runs/{id}:{verb} (PH-09 routes). */
export type PayrollRunLifecycleVerb = "lock-inputs" | "compute" | "reconcile" | "approve" | "lock" | "disburse";

/** One payslip component line (BASIC/DA/HRA earnings, NPS/PT/LOP deductions) from the run's PAYROLL_TRACE. */
export interface PayslipComponentLine {
  code: string;
  amountCents: number;
  marker: string;
  sourceRef?: string;
}

/**
 * One employee's computed payslip projection inside a payroll run. The API exposes no
 * separate payslip read route; the compute response's per-employee line (with its
 * component trace) IS the payslip data the payslip view renders.
 */
export interface PayrollRunLineView {
  employeeId: string;
  salaryStructureId: string;
  basicPayCents: number;
  earnedBasicCents: number;
  daCents: number;
  hraCents: number;
  grossCents: number;
  deductionsCents: number;
  netPayCents: number;
  trace: PayslipComponentLine[];
}

/** The payroll run as the g10 lifecycle routes return it (201 create, 202 verbs). */
export interface PayrollRunView {
  id: string;
  period: string;
  status: PayrollRunStatus;
  makerUserId: string;
  approvedByUserId?: string;
  ruleVersionSnapshot?: string;
  inputSnapshotHash?: string;
  lines: PayrollRunLineView[];
  totals: { grossCents: number; deductionsCents: number; netPayCents: number };
  bankBatch?: {
    id: string;
    adapter: "X3_BANK_SANDBOX";
    marker: "BANK_X3_EXPORT";
    status: "TRANSMITTED" | "RECONCILED";
    totalNetCents: number;
  };
}

/** 201/202 body of the g10 run routes. */
export interface PayrollRunActionResult {
  payrollRun: PayrollRunView;
}

/** Request body for POST /api/v1/payroll/salary-structures (g10.createSalaryStructure). */
export interface SalaryStructureCreateInput {
  employeeId: string;
  effectiveFrom: string;
  basicPayCents?: number;
  daRateBps?: number;
  hraRateBps?: number;
  npsRateBps?: number;
  professionalTaxCents?: number;
  ruleVersion?: string;
}

/** 201 body of POST /api/v1/payroll/salary-structures. */
export interface SalaryStructureCreateResult {
  salaryStructure: {
    id: string;
    employeeId: string;
    basicPayCents: number;
    ruleVersion: string;
    effectiveFrom: string;
  };
}

// ---- PH-09E: G11 pension case lifecycle + benefit estimator ----

export type PensionScheme = "OPS" | "NPS" | "UPS";
export type PensionCaseStatus =
  | "DRAFT"
  | "SR_VERIFICATION"
  | "CALCULATION"
  | "PENDING_SANCTION"
  | "SANCTIONED"
  | "PPO_ISSUED"
  | "SETTLED"
  | "CLOSED"
  | "ON_HOLD";

/** NPS benefit event branch for the estimator (FR-G11-05 AC4/AC4a). */
export type PensionNpsEvent = "SUPERANNUATION" | "DEATH_IN_SERVICE" | "INVALIDATION";

/** The scheme-branched calculation the estimator round-trips — figures are SERVER-computed only. */
export interface PensionCalculationView {
  calculationId: string;
  scheme: PensionScheme;
  benefitOutcome: string;
  pensionCents: number;
  trace: {
    marker: "PENSION_CALC_TRACE";
    ruleVersion: string;
    ruleVersionRef: string;
    formula: string;
    inputs: { lastBasicPayCents: number; qualifyingServiceMonths: number };
  };
}

/** The pension case as the g11 routes return it. */
export interface PensionCaseView {
  id: string;
  caseNo: string;
  employeeId: string;
  separationDate: string;
  scheme: PensionScheme;
  status: PensionCaseStatus;
  serviceVerification?: {
    srVerified: boolean;
    totalServiceMonths: number;
    penaltyExclusionMonths: number;
    qualifyingServiceMonths: number;
    status: "QUALIFYING_SERVICE_LOCKED";
  };
  calculation?: PensionCalculationView;
}

/** Request body for POST /api/v1/pension/cases (g11.createCase). */
export interface PensionCaseCreateInput {
  employeeId: string;
  separationDate: string;
  scheme: PensionScheme;
}

/** Request body for POST /api/v1/pension/cases/{id}:verify-service (SR_VERIFICATION_GATE). */
export interface PensionServiceVerifyInput {
  totalServiceMonths: number;
  penaltyExclusionMonths?: number;
  srCertified: boolean;
}

/**
 * Estimator input for POST /api/v1/pension/cases/{id}:compute — the scheme-branched
 * benefit estimation endpoint. The browser validates presence/shape only; every
 * statutory figure comes back from the server.
 */
export interface PensionEstimateInput {
  ruleVersion?: string;
  asOf?: string;
  upsOptedIn?: boolean;
  npsEvent?: PensionNpsEvent;
}

/** 201/202 body of the g11 case routes. */
export interface PensionCaseActionResult {
  pensionCase: PensionCaseView;
}

// ---- PH-10E: G14 dashboard bound to the PH-10D analytics engine ----

/** One governed E03 kpi_definitions row as GET /api/v1/analytics/kpis returns it. */
export interface AnalyticsKpiDefinitionView {
  id: string;
  kpiCode: string;
  name: string;
  description: string;
  domain: string;
  version: number;
  definitionHash: string;
  sourceMartCode: string;
  expression: string;
  unit: string;
  grain: string;
  sensitivity: "PUBLIC" | "INTERNAL" | "RESTRICTED";
  status: "DRAFT" | "ACTIVE" | "RETIRED";
}

/**
 * One aggregate cell from the engine's k-anonymity query boundary (FR-17). `value` is null
 * whenever `suppressed` is true — the raw small count never crosses the wire, so the UI
 * cannot leak it even by mistake.
 */
export interface AnalyticsAggregateCell {
  key: string;
  value: number | null;
  suppressed: boolean;
  suppressionReason?: "ERR-G14-SMALL-CELL" | "ERR-G14-COMP-SUPPRESS";
}

/** GET /api/v1/analytics/aggregate result with suppression applied server-side. */
export interface AnalyticsAggregateResult {
  martCode: string;
  dimension: string;
  minCellSizeK: number;
  cells: AnalyticsAggregateCell[];
  /** Withheld (null) whenever any cell is suppressed so subtraction cannot recover it. */
  total: number | null;
  suppressedCells: number;
}

/** One append-only E10 datamart_refresh_logs row from GET /api/v1/analytics/datamarts/refresh-logs. */
export interface MartRefreshLogView {
  id: string;
  martCode: string;
  runType: "SCHEDULED" | "MANUAL" | "BACKFILL";
  startedAt: string;
  finishedAt?: string;
  rowsRead?: number;
  rowsWritten?: number;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  errorDetail?: string;
}

export interface AnalyticsSliceSummary {
  dashboards: number;
  cards: number;
  sourceModules: number;
  martRefreshes: number;
  readOnlyMarker: "G14_READ_ONLY";
  martMarker: "MART_REFRESH_IDEMPOTENT";
  scopeMarker: "P02_SCOPE_FILTER";
  drillMarker: "DRILL_THROUGH_AUTHZ";
  auditMarker: "ANALYTICS_READ_AUDITED";
  piiMarker: "PII_SUPPRESSION";
  migrationMarker: "MIGRATION_DRY_RUN";
  uatMarker: "UAT_ACCEPTANCE_PACK";
}

/** One E2 employee_contacts row from GET /api/v1/employees/{id}/contacts (PH-07A satellite). */
export interface EmployeeContactRecord {
  id: string;
  employeeId: string;
  contactType: "MOBILE" | "ALT_MOBILE" | "PERSONAL_EMAIL" | "OFFICIAL_EMAIL" | "LANDLINE";
  contactValue: string;
  isPrimary: boolean;
  isVerified: boolean;
  visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "PRIVATE";
  rowVersion: number;
}

/** Request body for POST /api/v1/employees/{id}/contacts (g01.addEmployeeContact). */
export interface EmployeeContactAddInput {
  contactType: EmployeeContactRecord["contactType"];
  contactValue: string;
  isPrimary?: boolean;
  visibility?: EmployeeContactRecord["visibility"];
}

/** 201 body of POST /api/v1/employees/{id}/contacts: the created satellite row. */
export interface EmployeeContactAddResult {
  contact: EmployeeContactRecord;
}

/**
 * One E4 employee_dependents row from GET /api/v1/employees/{id}/dependents.
 * nationalIdMasked arrives pre-masked per P02 field grants; the client never unmasks.
 */
export interface EmployeeDependentRecord {
  id: string;
  employeeId: string;
  fullName: string;
  relationship: "SPOUSE" | "SON" | "DAUGHTER" | "FATHER" | "MOTHER" | "BROTHER" | "SISTER" | "GUARDIAN" | "OTHER";
  dob?: string;
  isMinor?: boolean;
  isLegalHeir: boolean;
  heirSuccessionRank?: number;
  nationalIdMasked?: string;
}

/** Request body for POST /api/v1/employees/{id}/dependents (g01.addEmployeeDependent). */
export interface EmployeeDependentAddInput {
  fullName: string;
  relationship: EmployeeDependentRecord["relationship"];
  dob?: string;
  isLegalHeir?: boolean;
  heirSuccessionRank?: number;
}

/** 201 body of POST /api/v1/employees/{id}/dependents: the created satellite row. */
export interface EmployeeDependentAddResult {
  dependent: EmployeeDependentRecord;
}

/** One row of GET /api/v1/personal-details/change-requests as the G02 routes project it. */
export interface PersonalDetailChangeRecord {
  id: string;
  requestNo: string;
  employeeId: string;
  fieldCode: "displayName" | "pan" | "aadhaarMasked";
  oldValue: string;
  newValue: string;
  sensitivity: "LOW" | "HIGH";
  status: "IN_REVIEW" | "RETURNED" | "APPROVED" | "COMMITTED" | "REJECTED" | "REVERSED" | "WITHDRAWN";
  revisionNo: number;
  decisionComment?: string;
  documentIds: string[];
}

/** Request body for POST /api/v1/personal-details/change-requests (g02.createPersonalDetailChangeRequest). */
export interface PersonalDetailChangeCreateInput {
  employeeId: string;
  fieldCode: PersonalDetailChangeRecord["fieldCode"];
  newValue: string;
  reason: string;
  evidenceTitle?: string;
}

/** 201 body of POST /api/v1/personal-details/change-requests. */
export interface PersonalDetailChangeCreateResult {
  request: PersonalDetailChangeRecord;
}

/** Approver verbs on POST /api/v1/personal-details/change-requests/{id}:{verb} (PH-07C lifecycle). */
export type PersonalDetailDecisionVerb = "approve" | "reject" | "send-back";

/** 202 body of the G02 approve / reject / send-back decision routes. */
export interface PersonalDetailDecisionResult {
  request: PersonalDetailChangeRecord;
}

/**
 * One field row of GET /api/v1/change-requests/{id}/diff (FR-G02-005). When `masked` is true the
 * API has already replaced both values with "[HIDDEN]" per P02 field grants; the UI renders the
 * masked values exactly as returned and never reconstructs them.
 */
export interface ChangeRequestFieldDiff {
  fieldCode: string;
  displayLabel: string;
  sensitivity: "LOW" | "HIGH";
  oldValue: string;
  newValue: string;
  masked: boolean;
}

/** 200 body of GET /api/v1/change-requests/{id}/diff. */
export interface ChangeRequestDiffResult {
  changeRequestId: string;
  requestNo: string;
  status: PersonalDetailChangeRecord["status"];
  revisionNo: number;
  fields: ChangeRequestFieldDiff[];
}

/** `balance` object of GET /api/v1/atl/leave-balances (g03.getLeaveBalance). */
export interface LeaveBalanceView {
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  currentBalance: number;
  reserved: number;
  debited: number;
  availableBalance: number;
}

/** One row of GET /api/v1/atl/leave-applications as the G03 routes project it to the web layer. */
export interface LeaveApplicationRecord {
  id: string;
  applicationNo: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "CANCELLED";
  resolverType: "REPORTING_CHAIN";
}

/** Request body for POST /api/v1/atl/leave-applications (g03.submitLeaveApplication). */
export interface LeaveApplicationSubmitInput {
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}

/** 201 body of POST /api/v1/atl/leave-applications: the created application plus the reserved balance. */
export interface LeaveApplicationSubmitResult {
  application: LeaveApplicationRecord;
  balance: { availableBalance: number };
}

/** Approver verbs supported by the G03 leave-apply/inbox demo UI on POST .../{id}/decision. */
export type LeaveDecisionVerb = "APPROVE" | "REJECT";

/** 202 body of POST /api/v1/atl/leave-applications/{id}/decision for APPROVE/REJECT. */
export interface LeaveDecisionResult {
  application: LeaveApplicationRecord;
}

/** One row of GET /api/v1/atl/leave-types (g03.listLeaveTypes) the apply form offers as options. */
export interface LeaveTypeOption {
  leaveTypeId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
}

interface LeaveOutboxApiSummary {
  status: "READY" | "POSTED";
}

interface PayrollSignalApiSummary {
  status: "READY_FOR_G10";
}

interface PersonalDetailsApiSummary {
  requestNo: string;
  fieldCode: PersonalDetailsSliceSummary["fieldCode"];
  status: PersonalDetailsSliceSummary["status"];
  sensitivity: PersonalDetailsSliceSummary["sensitivity"];
  documentIds: string[];
}

interface LeaveSrReconciliationApiSummary {
  report: {
    total: number;
    posted: number;
    deadLettered: number;
    discarded: number;
  };
}

/** One row of GET /api/v1/transfers/orders as the G05 routes project it to the web layer. */
export interface TransferOrderRecord {
  id: string;
  orderNo: string;
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  orderDate: string;
  effectiveDate: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "RELIEVED" | "JOINED" | "RETAINED" | "CANCELLED" | "DEEMED_RELIEVED";
  resolverType: "POSITION_AUTHORITY";
  clearanceItems: ClearanceSummary[];
  orderDocumentId?: string;
  joiningDocumentId?: string;
}

/** Request body for POST /api/v1/transfers/orders (g05.initiateTransferOrder). */
export interface TransferInitiateInput {
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  orderDate: string;
  effectiveDate: string;
  reason?: string;
}

/** 201 body of POST /api/v1/transfers/orders: the created PENDING_APPROVAL order. */
export interface TransferInitiateResult {
  order: TransferOrderRecord;
}

/**
 * One G09 disciplinary case as the g09 routes project it. The API exposes no
 * case-list read route (PH-08B..E scope), so the workbench tracks the cases
 * returned by its own POSTs; `stage` carries the due-process position.
 */
export interface DisciplinaryCaseView {
  id: string;
  caseNo: string;
  chargedEmployeeId: string;
  disciplinaryAuthorityId: string;
  stage: "INTAKE" | "CHARGE" | "INQUIRY" | "INQUIRY_REPORT" | "ORDER" | "CLOSED" | "APPEAL";
  caseStatus: "OPEN" | "PENALTY_IMPOSED" | "ABATED" | "CLOSED";
  confidential: boolean;
  chargeMemoDocumentId?: string;
}

/** Request body for POST /api/v1/disciplinary/cases (g09.openCase — complaint/case intake). */
export interface DisciplinaryCaseOpenInput {
  chargedEmployeeId: string;
  disciplinaryAuthorityId: string;
  allegations: string;
  confidential?: boolean;
}

/** Body of the g09 case routes: 201 on open, 202 on :charge. */
export interface DisciplinaryCaseResult {
  disciplinaryCase: DisciplinaryCaseView;
}

/** Request body for POST /api/v1/disciplinary/cases/{id}:charge (g09.serveChargeMemo). */
export interface ChargeMemoInput {
  articles: string[];
  servedOn: string;
}

/** One DPC panel member row for POST /api/v1/promotions/cases/{id}:hold-dpc. */
export interface DpcPanelMemberInput {
  employeeId?: string;
  externalName?: string;
  role: string;
}

/**
 * Request body for POST /api/v1/promotions/cases/{id}:hold-dpc. Per-member
 * recusal verdicts are carried in recusedEmployeeIds; the API persists the
 * recusal list and a panel-level verdict, not a per-member vote record.
 */
export interface DpcHoldInput {
  panelMembers: DpcPanelMemberInput[];
  recusedEmployeeIds?: string[];
  quorumRequired?: number;
}

export interface PromotionCandidateView {
  employeeId: string;
  rank: number;
  fitness: "PENDING" | "FIT" | "UNFIT";
  isSelected: boolean;
}

/** The promotion case as :hold-dpc returns it, including the recorded DPC block. */
export interface PromotionCaseView {
  id: string;
  caseNo: string;
  status: string;
  vacancies: number;
  candidates: PromotionCandidateView[];
  dpc?: {
    quorumRequired: number;
    participatingMembers: number;
    recusedEmployeeIds: string[];
    verdict: "FIT_PANEL";
  };
}

/** 202 body of POST /api/v1/promotions/cases/{id}:hold-dpc. */
export interface DpcHoldResult {
  promotionCase: PromotionCaseView;
}

/** The G08 APAR form as the tier-action routes return it. */
export interface AparFormView {
  id: string;
  formNo: string;
  employeeId: string;
  status:
    | "GOALS_PENDING"
    | "SELF_APPRAISAL"
    | "RO_ASSESSMENT"
    | "RVO_REVIEW"
    | "AA_ACCEPTANCE"
    | "FINALISED"
    | "POSTED"
    | "DISCLOSURE"
    | "SEALED_COVER"
    | "WITHDRAWN";
  reportingOfficerId: string;
  reviewingOfficerId: string;
  grade?: string;
  sealedCover: boolean;
}

/** Request body for POST /api/v1/apar/forms/{id}:report (g08.recordReporting — RO tier). */
export interface AparReportingInput {
  grade: string;
  narrative: string;
}

/** Request body for POST /api/v1/apar/forms/{id}:review (g08.recordReview — RvO tier). */
export interface AparReviewInput {
  concur: boolean;
  remarks: string;
}

/** 202 body of the g08 tier-action routes (:submit-self, :report, :review). */
export interface AparFormActionResult {
  form: AparFormView;
}

/** Request body for POST /api/v1/training/nominations (g07.nominate). */
export interface TrainingNominationInput {
  sessionId: string;
  employeeId: string;
}

/** The G07 nomination as the routes return it; WAITLISTED carries capacity feedback. */
export interface TrainingNominationView {
  id: string;
  nominationNo: string;
  sessionId: string;
  employeeId: string;
  status: "PENDING_L1" | "APPROVED" | "WAITLISTED" | "REJECTED" | "COMPLETED" | "NO_SHOW";
  waitlistPosition?: number;
}

/** 201 body of POST /api/v1/training/nominations. */
export interface TrainingNominationResult {
  nomination: TrainingNominationView;
}

export interface ServiceRegisterIngestInput {
  sourceModule: string;
  sourceReferenceId: string;
  sourceEventVersion: number;
  employeeId: string;
  eventTypeCode: string;
  eventDate: string;
  payload: Record<string, unknown>;
}

/** Task-grain action routes shipped in PH-04B: POST /workflow/tasks/{task_id}/{verb}. */
export type WorkflowTaskActionVerb = "claim" | "approve" | "reject" | "delegate";

/** Instance-grain action routes from P01: POST /workflow/instances/{instance_id}/{verb}. */
export type WorkflowInstanceActionVerb = "advance" | "approve" | "reject" | "send-back" | "delegate" | "cancel" | "query";

export interface WorkflowActionRequestBody {
  reason?: string;
  toUserId?: string;
}

export interface HrmsClient {
  listWorkflowTasks(): Promise<PageResult<WorkflowTaskSummary>>;
  actOnWorkflowTask(taskId: string, verb: WorkflowTaskActionVerb, body: WorkflowActionRequestBody, idempotencyKey: string): Promise<unknown>;
  actOnWorkflowInstance(instanceId: string, verb: WorkflowInstanceActionVerb, body: WorkflowActionRequestBody, idempotencyKey: string): Promise<unknown>;
  listEmployees(): Promise<PageResult<EmployeeSummary>>;
  getEmployeeProfile(employeeId: string): Promise<EmployeeProfileView>;
  listEmployeeContacts(employeeId: string): Promise<PageResult<EmployeeContactRecord>>;
  addEmployeeContact(employeeId: string, input: EmployeeContactAddInput, idempotencyKey: string): Promise<EmployeeContactAddResult>;
  listEmployeeDependents(employeeId: string): Promise<PageResult<EmployeeDependentRecord>>;
  addEmployeeDependent(employeeId: string, input: EmployeeDependentAddInput, idempotencyKey: string): Promise<EmployeeDependentAddResult>;
  listPersonalDetailChangeRequests(): Promise<PageResult<PersonalDetailChangeRecord>>;
  createPersonalDetailChangeRequest(input: PersonalDetailChangeCreateInput, idempotencyKey: string): Promise<PersonalDetailChangeCreateResult>;
  decidePersonalDetailChangeRequest(
    requestId: string,
    verb: PersonalDetailDecisionVerb,
    comment: string | undefined,
    idempotencyKey: string
  ): Promise<PersonalDetailDecisionResult>;
  getPersonalDetailChangeRequestDiff(requestId: string): Promise<ChangeRequestDiffResult>;
  getLeaveBalance(employeeId?: string, leaveTypeId?: string): Promise<LeaveBalanceView>;
  getServiceRegisterTimeline(employeeId: string, page?: PageQuery): Promise<PageResult<SrTimelineEntry>>;
  listDocuments(): Promise<PageResult<DocumentSummary>>;
  listBiKpis(): Promise<PageResult<BiKpiTile>>;
  listCaseEvidence(caseId: string): Promise<PageResult<CaseEvidenceItem>>;
  getCounsellingSession(): Promise<CounsellingSessionView>;
  submitCounsellingChoice(input: CounsellingChoiceInput, idempotencyKey: string): Promise<CounsellingChoiceResult>;
  listDataSubjectRequests(): Promise<PageResult<DsrRecord>>;
  adjudicateDsr(id: string, input: DsrAdjudicateInput, idempotencyKey: string): Promise<DsrRecord>;
  listLeaveApplications(): Promise<PageResult<LeaveApplicationRecord>>;
  submitLeaveApplication(input: LeaveApplicationSubmitInput, idempotencyKey: string): Promise<LeaveApplicationSubmitResult>;
  decideLeaveApplication(applicationId: string, decision: LeaveDecisionVerb, idempotencyKey: string): Promise<LeaveDecisionResult>;
  listLeaveTypes(): Promise<PageResult<LeaveTypeOption>>;
  listTransferOrders(): Promise<PageResult<TransferOrderRecord>>;
  initiateTransferOrder(input: TransferInitiateInput, idempotencyKey: string): Promise<TransferInitiateResult>;
  getLeaveSlice(): Promise<LeaveSliceSummary>;
  getPersonalDetailsSlice(): Promise<PersonalDetailsSliceSummary>;
  getLeaveSrRelaySlice(): Promise<LeaveSrRelaySliceSummary>;
  getTransferSlice(): Promise<TransferSliceSummary>;
  getPromotionSlice(): Promise<PromotionSliceSummary>;
  getTrainingSlice(): Promise<TrainingSliceSummary>;
  getAparSlice(): Promise<AparSliceSummary>;
  getDisciplinarySlice(): Promise<DisciplinarySliceSummary>;
  openDisciplinaryCase(input: DisciplinaryCaseOpenInput, idempotencyKey: string): Promise<DisciplinaryCaseResult>;
  serveDisciplinaryCharge(caseId: string, input: ChargeMemoInput, idempotencyKey: string): Promise<DisciplinaryCaseResult>;
  holdDpc(promotionCaseId: string, input: DpcHoldInput, idempotencyKey: string): Promise<DpcHoldResult>;
  submitAparSelf(formId: string, idempotencyKey: string): Promise<AparFormActionResult>;
  recordAparReporting(formId: string, input: AparReportingInput, idempotencyKey: string): Promise<AparFormActionResult>;
  recordAparReview(formId: string, input: AparReviewInput, idempotencyKey: string): Promise<AparFormActionResult>;
  nominateForTraining(input: TrainingNominationInput, idempotencyKey: string): Promise<TrainingNominationResult>;
  getPayrollSlice(): Promise<PayrollSliceSummary>;
  // PH-09E G10: salary structure + run lifecycle (create -> lock-inputs -> compute -> reconcile
  // -> approve -> lock -> disburse); the compute response carries the payslip lines.
  createSalaryStructure(input: SalaryStructureCreateInput, idempotencyKey: string): Promise<SalaryStructureCreateResult>;
  createPayrollRun(period: string, idempotencyKey: string): Promise<PayrollRunActionResult>;
  actOnPayrollRun(runId: string, verb: PayrollRunLifecycleVerb, idempotencyKey: string): Promise<PayrollRunActionResult>;
  getPensionSlice(): Promise<PensionSliceSummary>;
  // PH-09E G11: pension case lifecycle + benefit estimator (scheme-branched server compute).
  createPensionCase(input: PensionCaseCreateInput, idempotencyKey: string): Promise<PensionCaseActionResult>;
  verifyPensionService(caseId: string, input: PensionServiceVerifyInput, idempotencyKey: string): Promise<PensionCaseActionResult>;
  estimatePensionBenefits(caseId: string, input: PensionEstimateInput, idempotencyKey: string): Promise<PensionCaseActionResult>;
  getAnalyticsSlice(): Promise<AnalyticsSliceSummary>;
  // PH-10E G14: live dashboard reads against the PH-10D analytics engine.
  listAnalyticsKpis(kpiCode?: string): Promise<PageResult<AnalyticsKpiDefinitionView>>;
  queryKpiAggregate(martCode: string, dimension: string): Promise<AnalyticsAggregateResult>;
  listMartRefreshLogs(page?: PageQuery): Promise<PageResult<MartRefreshLogView>>;
  ingestServiceRegister(input: ServiceRegisterIngestInput, idempotencyKey: string): Promise<unknown>;
}

export type HrmsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Supplies the current session's bearer token. Injected by the composition
 * root (login/session management lands in PH-05B); returning null/undefined
 * sends the request unauthenticated.
 */
export type HrmsTokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

export interface HrmsClientOptions {
  baseUrl?: string;
  correlationId?: string;
  fetcher?: HrmsFetch;
  tokenProvider?: HrmsTokenProvider;
}

export function createHrmsClient(options: HrmsClientOptions = {}): HrmsClient {
  const baseUrl = trimTrailingSlash(options.baseUrl ?? "");
  const correlationId = options.correlationId ?? "corr-web-ph05";
  const fetcher = options.fetcher ?? fetch;
  const tokenProvider = options.tokenProvider;

  async function request<TResponse>(route: string, init: RequestInit = {}): Promise<TResponse> {
    const headers = new Headers(init.headers);
    headers.set(HRMS_API_HEADERS.correlationId, correlationId);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const token = tokenProvider ? await tokenProvider() : null;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetcher(`${baseUrl}${route}`, { ...init, headers });
    const parsed = (await response.json()) as TResponse;
    if (!response.ok) {
      throw new HrmsApiError(response.status, parsed);
    }
    return parsed;
  }

  function workflowAction(route: string, body: WorkflowActionRequestBody, idempotencyKey: string): Promise<unknown> {
    return request<unknown>(route, {
      method: "POST",
      headers: {
        [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  }

  /** Shared POST helper for the statutory-wave action routes: JSON body + fresh Idempotency-Key. */
  function postWithIdempotency<TResponse>(route: string, body: unknown, idempotencyKey: string): Promise<TResponse> {
    return request<TResponse>(route, {
      method: "POST",
      headers: {
        [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  }

  return {
    listWorkflowTasks: () => request<PageResult<WorkflowTaskSummary>>(HRMS_API_ROUTES.workflowTasks),
    actOnWorkflowTask: (taskId, verb, body, idempotencyKey) =>
      workflowAction(`${HRMS_API_ROUTES.workflowTasks}/${encodeURIComponent(taskId)}/${verb}`, body, idempotencyKey),
    actOnWorkflowInstance: (instanceId, verb, body, idempotencyKey) =>
      workflowAction(`${HRMS_API_ROUTES.workflowInstances}/${encodeURIComponent(instanceId)}/${verb}`, body, idempotencyKey),
    listEmployees: () => request<PageResult<EmployeeSummary>>(HRMS_API_ROUTES.employees),
    getEmployeeProfile: async (employeeId) => {
      const result = await request<{ profile: EmployeeProfileView }>(
        `${HRMS_API_ROUTES.employees}/${encodeURIComponent(employeeId)}/profile-360`
      );
      return result.profile;
    },
    listEmployeeContacts: (employeeId) =>
      request<PageResult<EmployeeContactRecord>>(`${HRMS_API_ROUTES.employees}/${encodeURIComponent(employeeId)}/contacts`),
    addEmployeeContact: (employeeId, input, idempotencyKey) =>
      request<EmployeeContactAddResult>(`${HRMS_API_ROUTES.employees}/${encodeURIComponent(employeeId)}/contacts`, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(input),
      }),
    listEmployeeDependents: (employeeId) =>
      request<PageResult<EmployeeDependentRecord>>(`${HRMS_API_ROUTES.employees}/${encodeURIComponent(employeeId)}/dependents`),
    addEmployeeDependent: (employeeId, input, idempotencyKey) =>
      request<EmployeeDependentAddResult>(`${HRMS_API_ROUTES.employees}/${encodeURIComponent(employeeId)}/dependents`, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(input),
      }),
    listPersonalDetailChangeRequests: () => request<PageResult<PersonalDetailChangeRecord>>(HRMS_API_ROUTES.personalDetailChanges),
    createPersonalDetailChangeRequest: (input, idempotencyKey) =>
      request<PersonalDetailChangeCreateResult>(HRMS_API_ROUTES.personalDetailChanges, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(input),
      }),
    decidePersonalDetailChangeRequest: (requestId, verb, comment, idempotencyKey) =>
      request<PersonalDetailDecisionResult>(`${HRMS_API_ROUTES.personalDetailChanges}/${encodeURIComponent(requestId)}:${verb}`, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(comment === undefined ? {} : { comment }),
      }),
    getPersonalDetailChangeRequestDiff: (requestId) =>
      request<ChangeRequestDiffResult>(`${HRMS_API_ROUTES.changeRequests}/${encodeURIComponent(requestId)}/diff`),
    getLeaveBalance: async (employeeId, leaveTypeId) => {
      const params = new URLSearchParams();
      if (employeeId) {
        params.set("employeeId", employeeId);
      }
      if (leaveTypeId) {
        params.set("leaveTypeId", leaveTypeId);
      }
      const query = params.toString();
      const result = await request<{ balance: LeaveBalanceView }>(`${HRMS_API_ROUTES.leaveBalances}${query ? `?${query}` : ""}`);
      return result.balance;
    },
    getServiceRegisterTimeline: (employeeId, page = {}) =>
      request<PageResult<SrTimelineEntry>>(
        `${HRMS_API_ROUTES.srEmployees}/${encodeURIComponent(employeeId)}/timeline${toPageQueryString(page)}`
      ),
    listDocuments: () => request<PageResult<DocumentSummary>>(HRMS_API_ROUTES.documents),
    listBiKpis: () => request<PageResult<BiKpiTile>>(HRMS_API_ROUTES.biKpis),
    listCaseEvidence: (caseId) =>
      request<PageResult<CaseEvidenceItem>>(`${HRMS_API_ROUTES.disciplinaryEvidence}/${encodeURIComponent(caseId)}/evidence`),
    getCounsellingSession: () => request<CounsellingSessionView>(HRMS_API_ROUTES.counsellingSessions),
    submitCounsellingChoice: (input, idempotencyKey) =>
      postWithIdempotency<CounsellingChoiceResult>(`${HRMS_API_ROUTES.counsellingSessions}:choose`, input, idempotencyKey),
    listDataSubjectRequests: () => request<PageResult<DsrRecord>>(HRMS_API_ROUTES.dataSubjectRequests),
    adjudicateDsr: (id, input, idempotencyKey) =>
      postWithIdempotency<DsrRecord>(`${HRMS_API_ROUTES.dataSubjectRequests}/${encodeURIComponent(id)}:adjudicate`, input, idempotencyKey),
    listLeaveApplications: () => request<PageResult<LeaveApplicationRecord>>(HRMS_API_ROUTES.leaveApplications),
    submitLeaveApplication: (input, idempotencyKey) =>
      request<LeaveApplicationSubmitResult>(HRMS_API_ROUTES.leaveApplications, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(input),
      }),
    decideLeaveApplication: (applicationId, decision, idempotencyKey) =>
      request<LeaveDecisionResult>(`${HRMS_API_ROUTES.leaveApplications}/${encodeURIComponent(applicationId)}/decision`, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify({ decision }),
      }),
    listLeaveTypes: () => request<PageResult<LeaveTypeOption>>(HRMS_API_ROUTES.leaveTypes),
    listTransferOrders: () => request<PageResult<TransferOrderRecord>>(HRMS_API_ROUTES.transferOrders),
    initiateTransferOrder: (input, idempotencyKey) =>
      request<TransferInitiateResult>(HRMS_API_ROUTES.transferOrders, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(input),
      }),
    getLeaveSlice: async () => {
      const applications = await request<PageResult<LeaveApplicationRecord>>(HRMS_API_ROUTES.leaveApplications);
      const outbox = await request<PageResult<LeaveOutboxApiSummary>>(HRMS_API_ROUTES.leaveOutbox);
      const payrollSignals = await request<PageResult<PayrollSignalApiSummary>>(HRMS_API_ROUTES.payrollSignals);
      const selected = requireFirst(applications.items, "Leave application");
      const selectedOutbox = outbox.items[0];
      return {
        applicationNo: selected.applicationNo,
        status: selected.status === "APPROVED" ? "APPROVED" : "SUBMITTED",
        resolver: selected.resolverType,
        action: selected.status === "APPROVED" ? "APPROVE" : "DELEGATE",
        balanceAvailable: 0,
        g04OutboxStatus: selectedOutbox?.status ?? "READY",
        srEventType: "LEAVE_APPROVED",
        payrollSignalStatus: "READY_FOR_G10",
        payrollSignalsReady: payrollSignals.items.filter((signal) => signal.status === "READY_FOR_G10").length,
      };
    },
    getPersonalDetailsSlice: async () => {
      const requests = await request<PageResult<PersonalDetailsApiSummary>>(HRMS_API_ROUTES.personalDetailChanges);
      const selected = requireFirst(requests.items, "Personal details change request");
      return {
        requestNo: selected.requestNo,
        fieldCode: selected.fieldCode,
        status: selected.status,
        sensitivity: selected.sensitivity,
        ownerModule: "G01",
        documentCount: selected.documentIds.length,
      };
    },
    getLeaveSrRelaySlice: async () => {
      const summary = await request<LeaveSrReconciliationApiSummary>(HRMS_API_ROUTES.leaveSrReconciliation);
      return { ...summary.report, relayOwner: "G04" };
    },
    getTransferSlice: async () => {
      const orders = await request<PageResult<TransferOrderRecord>>(HRMS_API_ROUTES.transferOrders);
      const selected = requireFirst(orders.items, "Transfer order");
      return {
        orderNo: selected.orderNo,
        status: selected.status === "JOINED" ? "JOINED" : "APPROVED",
        resolver: selected.resolverType,
        clearancePattern: "PARALLEL_ALL_OF",
        clearances: selected.clearanceItems,
        documentCount: [selected.orderDocumentId, selected.joiningDocumentId].filter((documentId) => Boolean(documentId)).length,
        srEventType: "TRANSFER_JOINED",
      };
    },
    getPromotionSlice: async () => {
      const summary = await request<Omit<PromotionSliceSummary, "dpcMarker" | "recusalMarker" | "srEventType">>(HRMS_API_ROUTES.promotionSummary);
      return { ...summary, dpcMarker: "DPC_QUORUM", recusalMarker: "DPC_RECUSAL", srEventType: summary.macpEffected > 0 ? "MACP_EFFECTED" : "PROMOTION_EFFECTED" };
    },
    getTrainingSlice: async () => {
      const summary = await request<Omit<TrainingSliceSummary, "workflowCode" | "srEventType">>(HRMS_API_ROUTES.trainingSummary);
      return { ...summary, workflowCode: "WF-G07-NOMINATION", srEventType: "TRAINING_CERTIFICATION_POSTED" };
    },
    getAparSlice: async () => {
      const summary = await request<Omit<AparSliceSummary, "srEventType" | "sealedMarker" | "feedMarker">>(HRMS_API_ROUTES.aparSummary);
      return { ...summary, srEventType: "APAR_FINAL_GRADE", sealedMarker: "SEALED_COVER", feedMarker: "G08_G06_FEED_SUPPRESSED" };
    },
    getDisciplinarySlice: async () => {
      const summary = await request<Omit<DisciplinarySliceSummary, "competenceMarker" | "penaltyEventType" | "appealMarker">>(HRMS_API_ROUTES.disciplinarySummary);
      return { ...summary, competenceMarker: "G09_AUTHORITY_COMPETENCE", penaltyEventType: "MAJOR_PENALTY", appealMarker: "APPEAL_DECIDED" };
    },
    getPayrollSlice: async () => {
      const summary = await request<Omit<PayrollSliceSummary, "inputLockMarker" | "lastPayMarker">>(HRMS_API_ROUTES.payrollSummary);
      return { ...summary, inputLockMarker: "INPUT_LOCKED", lastPayMarker: "LAST_PAY_DRAWN" };
    },
    createSalaryStructure: (input, idempotencyKey) =>
      postWithIdempotency<SalaryStructureCreateResult>(HRMS_API_ROUTES.payrollSalaryStructures, input, idempotencyKey),
    createPayrollRun: (period, idempotencyKey) =>
      postWithIdempotency<PayrollRunActionResult>(HRMS_API_ROUTES.payrollRuns, { period }, idempotencyKey),
    actOnPayrollRun: (runId, verb, idempotencyKey) =>
      postWithIdempotency<PayrollRunActionResult>(`${HRMS_API_ROUTES.payrollRuns}/${encodeURIComponent(runId)}:${verb}`, {}, idempotencyKey),
    createPensionCase: (input, idempotencyKey) =>
      postWithIdempotency<PensionCaseActionResult>(HRMS_API_ROUTES.pensionCases, input, idempotencyKey),
    verifyPensionService: (caseId, input, idempotencyKey) =>
      postWithIdempotency<PensionCaseActionResult>(
        `${HRMS_API_ROUTES.pensionCases}/${encodeURIComponent(caseId)}:verify-service`,
        input,
        idempotencyKey
      ),
    // The estimator posts to the scheme-branched compute endpoint; the browser never
    // computes statutory figures itself.
    estimatePensionBenefits: (caseId, input, idempotencyKey) =>
      postWithIdempotency<PensionCaseActionResult>(
        `${HRMS_API_ROUTES.pensionCases}/${encodeURIComponent(caseId)}:compute`,
        { ruleVersion: input.ruleVersion ?? "PENSION-RULE-2026-01", asOf: input.asOf, upsOptedIn: input.upsOptedIn, npsEvent: input.npsEvent },
        idempotencyKey
      ),
    getPensionSlice: async () => {
      const summary = await request<Omit<PensionSliceSummary, "qualifyingServiceMarker" | "srMarker">>(HRMS_API_ROUTES.pensionSummary);
      return { ...summary, qualifyingServiceMarker: "QUALIFYING_SERVICE_LOCKED", srMarker: "G11_SR_POSTED" };
    },
    getAnalyticsSlice: async () => {
      const summary = await request<Omit<AnalyticsSliceSummary, "migrationMarker" | "uatMarker">>(HRMS_API_ROUTES.analyticsSummary);
      return { ...summary, migrationMarker: "MIGRATION_DRY_RUN", uatMarker: "UAT_ACCEPTANCE_PACK" };
    },
    listAnalyticsKpis: (kpiCode) =>
      request<PageResult<AnalyticsKpiDefinitionView>>(
        `${HRMS_API_ROUTES.analyticsKpis}${kpiCode ? `?kpiCode=${encodeURIComponent(kpiCode)}` : ""}`
      ),
    queryKpiAggregate: async (martCode, dimension) => {
      const params = new URLSearchParams({ martCode, dimension });
      // The route pages the cells (list route); the client flattens them back onto the
      // engine's aggregate shape. Suppressed cells arrive with value=null and stay null.
      const result = await request<Omit<AnalyticsAggregateResult, "cells"> & { cells: PageResult<AnalyticsAggregateCell> }>(
        `${HRMS_API_ROUTES.analyticsAggregate}?${params.toString()}`
      );
      return { ...result, cells: result.cells.items };
    },
    listMartRefreshLogs: (page = {}) =>
      request<PageResult<MartRefreshLogView>>(`${HRMS_API_ROUTES.analyticsRefreshLogs}${toPageQueryString(page)}`),
    openDisciplinaryCase: (input, idempotencyKey) =>
      postWithIdempotency<DisciplinaryCaseResult>(HRMS_API_ROUTES.disciplinaryCases, input, idempotencyKey),
    serveDisciplinaryCharge: (caseId, input, idempotencyKey) =>
      postWithIdempotency<DisciplinaryCaseResult>(
        `${HRMS_API_ROUTES.disciplinaryCases}/${encodeURIComponent(caseId)}:charge`,
        input,
        idempotencyKey
      ),
    holdDpc: (promotionCaseId, input, idempotencyKey) =>
      postWithIdempotency<DpcHoldResult>(
        `${HRMS_API_ROUTES.promotionCases}/${encodeURIComponent(promotionCaseId)}:hold-dpc`,
        input,
        idempotencyKey
      ),
    submitAparSelf: (formId, idempotencyKey) =>
      postWithIdempotency<AparFormActionResult>(`${HRMS_API_ROUTES.aparForms}/${encodeURIComponent(formId)}:submit-self`, {}, idempotencyKey),
    recordAparReporting: (formId, input, idempotencyKey) =>
      postWithIdempotency<AparFormActionResult>(`${HRMS_API_ROUTES.aparForms}/${encodeURIComponent(formId)}:report`, input, idempotencyKey),
    recordAparReview: (formId, input, idempotencyKey) =>
      postWithIdempotency<AparFormActionResult>(`${HRMS_API_ROUTES.aparForms}/${encodeURIComponent(formId)}:review`, input, idempotencyKey),
    nominateForTraining: (input, idempotencyKey) =>
      postWithIdempotency<TrainingNominationResult>(HRMS_API_ROUTES.trainingNominations, input, idempotencyKey),
    ingestServiceRegister: (input, idempotencyKey) =>
      request<unknown>(HRMS_API_ROUTES.srIngest, {
        method: "POST",
        headers: {
          [HRMS_API_HEADERS.idempotencyKey]: idempotencyKey,
        },
        body: JSON.stringify(input),
      }),
  };
}

function requireFirst<TItem>(items: TItem[], label: string): TItem {
  const selected = items[0];
  if (!selected) {
    throw new HrmsApiError(404, { error: { code: "NOT_FOUND", message: `${label} not found` } });
  }
  return selected;
}

export class HrmsApiError extends Error {
  readonly code: string;
  /** Module error id from error.details.messageId (e.g. ERR-REASON-REQ, ERR-G02-SOD), when present. */
  readonly messageId?: string;

  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    const code = extractEnvelopeCode(body);
    super(`HRMS API request failed (${code})`);
    this.name = "HrmsApiError";
    this.code = code;
    this.messageId = extractEnvelopeMessageId(body);
  }

  /** The most specific renderable code: the module messageId when present, else the wire code. */
  get displayCode(): string {
    return this.messageId ?? this.code;
  }
}

function extractEnvelopeMessageId(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const envelope = (body as { error?: { details?: { messageId?: unknown } } }).error;
    const messageId = envelope?.details?.messageId;
    if (typeof messageId === "string") {
      return messageId;
    }
  }
  return undefined;
}

function extractEnvelopeCode(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const envelope = (body as { error?: { code?: unknown } }).error;
    if (envelope && typeof envelope.code === "string") {
      return envelope.code;
    }
  }
  return "UNKNOWN_ERROR";
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function toPageQueryString(page: PageQuery): string {
  const params = new URLSearchParams();
  if (page.limit !== undefined) {
    params.set("limit", String(page.limit));
  }
  if (page.cursor) {
    params.set("cursor", page.cursor);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}
