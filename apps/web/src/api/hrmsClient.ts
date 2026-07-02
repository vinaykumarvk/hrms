export const HRMS_API_ROUTES = {
  workflowTasks: "/api/v1/workflow/tasks",
  workflowInstances: "/api/v1/workflow/instances",
  employees: "/api/v1/employees",
  personalDetailChanges: "/api/v1/personal-details/change-requests",
  leaveApplications: "/api/v1/atl/leave-applications",
  leaveTypes: "/api/v1/atl/leave-types",
  leaveOutbox: "/api/v1/atl/leave-sr-outbox",
  payrollSignals: "/api/v1/atl/payroll-signals",
  leaveSrOutbox: "/api/v1/leave-sr/outbox",
  leaveSrReconciliation: "/api/v1/leave-sr/reconciliation",
  transferOrders: "/api/v1/transfers/orders",
  promotionSummary: "/api/v1/promotions/summary",
  trainingSummary: "/api/v1/training/summary",
  aparSummary: "/api/v1/apar/summary",
  disciplinarySummary: "/api/v1/disciplinary/summary",
  payrollSummary: "/api/v1/payroll/summary",
  pensionSummary: "/api/v1/pension/summary",
  analyticsSummary: "/api/v1/analytics/summary",
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
  getServiceRegisterTimeline(employeeId: string, page?: PageQuery): Promise<PageResult<SrTimelineEntry>>;
  listDocuments(): Promise<PageResult<DocumentSummary>>;
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
  getPayrollSlice(): Promise<PayrollSliceSummary>;
  getPensionSlice(): Promise<PensionSliceSummary>;
  getAnalyticsSlice(): Promise<AnalyticsSliceSummary>;
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
    getServiceRegisterTimeline: (employeeId, page = {}) =>
      request<PageResult<SrTimelineEntry>>(
        `${HRMS_API_ROUTES.srEmployees}/${encodeURIComponent(employeeId)}/timeline${toPageQueryString(page)}`
      ),
    listDocuments: () => request<PageResult<DocumentSummary>>(HRMS_API_ROUTES.documents),
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
    getPensionSlice: async () => {
      const summary = await request<Omit<PensionSliceSummary, "qualifyingServiceMarker" | "srMarker">>(HRMS_API_ROUTES.pensionSummary);
      return { ...summary, qualifyingServiceMarker: "QUALIFYING_SERVICE_LOCKED", srMarker: "G11_SR_POSTED" };
    },
    getAnalyticsSlice: async () => {
      const summary = await request<Omit<AnalyticsSliceSummary, "migrationMarker" | "uatMarker">>(HRMS_API_ROUTES.analyticsSummary);
      return { ...summary, migrationMarker: "MIGRATION_DRY_RUN", uatMarker: "UAT_ACCEPTANCE_PACK" };
    },
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

  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    const code = extractEnvelopeCode(body);
    super(`HRMS API request failed (${code})`);
    this.name = "HrmsApiError";
    this.code = code;
  }
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
