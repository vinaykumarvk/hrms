import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";
import type { PersonalDetailChangeRequest } from "./personalDetailsService";

/**
 * G02 workflow configuration + change-request persistence (PH-07C).
 *
 * The two BRD-frozen config entities (docs/data-model/02-G02-personal-details-workflow.sql
 * E5 field_sensitivity_catalog, E6/E7 approval_matrix_config + approval_matrix_rules) replace
 * the PH-07 hardcoded sensitivity ternary: the workflow stage of a change request is chosen
 * from the catalog entry of the changed field plus the ACTIVE approval-matrix rule for that
 * sensitivity/field group. Entity state routes through this repository; the service owns no
 * bare in-memory arrays.
 */

/** G02 approval-routing axis (frozen enum g02_sensitivity). */
export type G02Sensitivity = "LOW" | "MEDIUM" | "HIGH" | "STATUTORY";
/** Frozen enum g02_field_group (taxonomy only; excludes STATUTORY). */
export type G02FieldGroup = "DEMOGRAPHIC" | "CONTACT" | "FINANCIAL" | "IDENTITY" | "QUALIFICATION";

/** E5 field_sensitivity_catalog — versioned per-field sensitivity/route config. */
export interface FieldSensitivityCatalogEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  fieldKey: string;
  m01FieldKey: string;
  displayLabel: string;
  fieldGroup: G02FieldGroup;
  sensitivity: G02Sensitivity;
  /** P02 field grant consulted by the diff endpoint; unset = value never masked. */
  maskFieldGrant?: string;
  selfServiceEditable: boolean;
  version: number;
}

/** E7 approval_matrix_rules — per sensitivity (x optional field group/key) route to a P01 stage. */
export interface ApprovalMatrixRule {
  id: string;
  sensitivity: G02Sensitivity;
  fieldGroup?: G02FieldGroup;
  fieldKey?: string;
  levelNo: number;
  nodeType: "RECOMMEND" | "APPROVE" | "SANCTION" | "VERIFY";
  stage: string;
  requiredRole: string;
  slaHours: number;
}

/** E6 approval_matrix_config — versioned matrix bound to the P01 workflow code. */
export interface ApprovalMatrixConfig {
  id: string;
  tenantId: string;
  entityId?: string;
  name: string;
  workflowCode: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  version: number;
  rules: ApprovalMatrixRule[];
}

export interface PersonalDetailsRepository {
  countRequests(): number;
  insertRequest(request: PersonalDetailChangeRequest): void;
  updateRequest(request: PersonalDetailChangeRequest): void;
  findRequest(scope: TenantScope, requestId: string): PersonalDetailChangeRequest | undefined;
  listRequests(scope: TenantScope): PersonalDetailChangeRequest[];
  saveSensitivityCatalogEntry(entry: FieldSensitivityCatalogEntry): void;
  findSensitivityCatalogEntry(scope: TenantScope, fieldKey: string): FieldSensitivityCatalogEntry | undefined;
  listSensitivityCatalog(scope: TenantScope): FieldSensitivityCatalogEntry[];
  saveApprovalMatrix(config: ApprovalMatrixConfig): void;
  findActiveApprovalMatrix(scope: TenantScope): ApprovalMatrixConfig | undefined;
}

/**
 * Resolve the routing rule for a field from the ACTIVE matrix. Precedence follows the
 * frozen E7 comment: field_key > field_group > sensitivity-only.
 */
export function resolveApprovalRule(
  matrix: ApprovalMatrixConfig,
  entry: Pick<FieldSensitivityCatalogEntry, "fieldKey" | "fieldGroup" | "sensitivity">
): ApprovalMatrixRule | undefined {
  const candidates = matrix.rules.filter((rule) => rule.sensitivity === entry.sensitivity);
  return (
    candidates.find((rule) => rule.fieldKey === entry.fieldKey) ??
    candidates.find((rule) => !rule.fieldKey && rule.fieldGroup === entry.fieldGroup) ??
    candidates.find((rule) => !rule.fieldKey && !rule.fieldGroup)
  );
}

/** In-memory implementation of the PersonalDetailsRepository interface, injectable for unit tests. */
export class InMemoryPersonalDetailsRepository implements PersonalDetailsRepository {
  private readonly requests: PersonalDetailChangeRequest[] = [];
  private readonly catalog: FieldSensitivityCatalogEntry[] = [];
  private readonly matrices: ApprovalMatrixConfig[] = [];

  countRequests(): number {
    return this.requests.length;
  }

  insertRequest(request: PersonalDetailChangeRequest): void {
    this.requests.push(request);
  }

  updateRequest(request: PersonalDetailChangeRequest): void {
    const index = this.requests.findIndex((item) => item.id === request.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "G02 change request not found");
    }
    this.requests[index] = request;
  }

  findRequest(scope: TenantScope, requestId: string): PersonalDetailChangeRequest | undefined {
    return this.requests.find(
      (item) => item.id === requestId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }

  listRequests(scope: TenantScope): PersonalDetailChangeRequest[] {
    return this.requests.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  saveSensitivityCatalogEntry(entry: FieldSensitivityCatalogEntry): void {
    const index = this.catalog.findIndex(
      (item) => item.tenantId === entry.tenantId && item.fieldKey === entry.fieldKey && item.version === entry.version
    );
    if (index < 0) {
      this.catalog.push(entry);
      return;
    }
    this.catalog[index] = entry;
  }

  findSensitivityCatalogEntry(scope: TenantScope, fieldKey: string): FieldSensitivityCatalogEntry | undefined {
    return this.catalog
      .filter(
        (item) =>
          item.fieldKey === fieldKey &&
          item.tenantId === scope.tenantId &&
          (!item.entityId || !scope.entityId || item.entityId === scope.entityId)
      )
      .sort((left, right) => right.version - left.version)[0];
  }

  listSensitivityCatalog(scope: TenantScope): FieldSensitivityCatalogEntry[] {
    return this.catalog.filter(
      (item) => item.tenantId === scope.tenantId && (!item.entityId || !scope.entityId || item.entityId === scope.entityId)
    );
  }

  saveApprovalMatrix(config: ApprovalMatrixConfig): void {
    const index = this.matrices.findIndex(
      (item) => item.tenantId === config.tenantId && item.name === config.name && item.version === config.version
    );
    if (index < 0) {
      this.matrices.push(config);
      return;
    }
    this.matrices[index] = config;
  }

  findActiveApprovalMatrix(scope: TenantScope): ApprovalMatrixConfig | undefined {
    return this.matrices
      .filter(
        (item) =>
          item.status === "ACTIVE" &&
          item.tenantId === scope.tenantId &&
          (!item.entityId || !scope.entityId || item.entityId === scope.entityId)
      )
      .sort((left, right) => right.version - left.version)[0];
  }
}

/**
 * Default PH-07C seed for the two config entities. Grounded in the BRD G02 field taxonomy:
 * displayName is a LOW identity field routed to manager review; PAN and Aadhaar are HIGH
 * (auth/statutory-adjacent identifiers) routed to sensitive review with P02 diff masking.
 */
export function defaultG02WorkflowConfig(tenantId: string): {
  catalog: FieldSensitivityCatalogEntry[];
  matrix: ApprovalMatrixConfig;
} {
  const catalog: FieldSensitivityCatalogEntry[] = [
    {
      id: "fsc-00000000-0000-0000-0000-000000000001",
      tenantId,
      fieldKey: "displayName",
      m01FieldKey: "employee.display_name",
      displayLabel: "Display name",
      fieldGroup: "IDENTITY",
      sensitivity: "LOW",
      selfServiceEditable: true,
      version: 1,
    },
    {
      id: "fsc-00000000-0000-0000-0000-000000000002",
      tenantId,
      fieldKey: "pan",
      m01FieldKey: "employee.pan",
      displayLabel: "PAN",
      fieldGroup: "IDENTITY",
      sensitivity: "HIGH",
      maskFieldGrant: "employee.pan",
      selfServiceEditable: false,
      version: 1,
    },
    {
      id: "fsc-00000000-0000-0000-0000-000000000003",
      tenantId,
      fieldKey: "aadhaarMasked",
      m01FieldKey: "employee.aadhaar_masked",
      displayLabel: "Aadhaar (masked)",
      fieldGroup: "IDENTITY",
      sensitivity: "HIGH",
      maskFieldGrant: "employee.aadhaar",
      selfServiceEditable: false,
      version: 1,
    },
    // PH-16B (FR-G02-018/019): bank/nominee are FINANCIAL HIGH (risk-evaluated, family-pension
    // gate on DECEASED); the mobile number is the auth-bearing CONTACT channel (R1 chain).
    {
      id: "fsc-00000000-0000-0000-0000-000000000004",
      tenantId,
      fieldKey: "bankAccountNumber",
      m01FieldKey: "employee.bank_account_number",
      displayLabel: "Bank account number",
      fieldGroup: "FINANCIAL",
      sensitivity: "HIGH",
      maskFieldGrant: "employee.bank_account",
      selfServiceEditable: true,
      version: 1,
    },
    {
      id: "fsc-00000000-0000-0000-0000-000000000005",
      tenantId,
      fieldKey: "nomineeName",
      m01FieldKey: "employee.nominee_name",
      displayLabel: "Nominee name",
      fieldGroup: "FINANCIAL",
      sensitivity: "HIGH",
      selfServiceEditable: true,
      version: 1,
    },
    {
      id: "fsc-00000000-0000-0000-0000-000000000006",
      tenantId,
      fieldKey: "mobileNumber",
      m01FieldKey: "employee.mobile_number",
      displayLabel: "Mobile number",
      fieldGroup: "CONTACT",
      sensitivity: "MEDIUM",
      selfServiceEditable: true,
      version: 1,
    },
  ];
  const matrix: ApprovalMatrixConfig = {
    id: "amc-00000000-0000-0000-0000-000000000001",
    tenantId,
    name: "G02 default approval matrix",
    workflowCode: "WF-G02-PERSONAL-DETAILS",
    status: "ACTIVE",
    version: 1,
    rules: [
      { id: "amr-1", sensitivity: "LOW", levelNo: 1, nodeType: "APPROVE", stage: "PENDING_MANAGER_REVIEW", requiredRole: "manager", slaHours: 48 },
      { id: "amr-2", sensitivity: "MEDIUM", levelNo: 1, nodeType: "APPROVE", stage: "PENDING_MANAGER_REVIEW", requiredRole: "manager", slaHours: 48 },
      { id: "amr-3", sensitivity: "HIGH", levelNo: 1, nodeType: "APPROVE", stage: "PENDING_SENSITIVE_REVIEW", requiredRole: "hr_admin", slaHours: 24 },
      { id: "amr-4", sensitivity: "STATUTORY", levelNo: 1, nodeType: "SANCTION", stage: "PENDING_SENSITIVE_REVIEW", requiredRole: "hr_admin", slaHours: 24 },
    ],
  };
  return { catalog, matrix };
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G02 config/workflow tables (docs/data-model/
// 02-G02-personal-details-workflow.sql), migrated by apps/api/db/migrations/
// 0006_g02_workflow_config.sql. All SQL is parameterised ($1, $2, ...); multi-step writes
// (matrix + rules, request + item, decision + status) run in a single transaction.
// ---------------------------------------------------------------------------------------

export interface FieldSensitivityCatalogRow {
  id: string;
  tenant_id: string;
  field_key: string;
  m01_field_key: string;
  display_label: string;
  field_group: string;
  sensitivity: string;
  self_service_editable: boolean;
  version: number;
}

export interface ApprovalMatrixConfigRow {
  id: string;
  tenant_id: string;
  name: string;
  workflow_code: string;
  status: string;
  version: number;
}

export interface ApprovalMatrixRuleRow {
  id: string;
  tenant_id: string;
  matrix_id: string;
  sensitivity: string;
  field_group: string | null;
  field_key: string | null;
  level_no: number;
  node_type: string;
  required_role: string;
  sla_hours: number;
}

export interface ChangeRequestRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  cr_number: string;
  target_employee_id: string;
  requested_by: string;
  highest_sensitivity: string;
  status: string;
  reason: string | null;
}

export interface ChangeRequestApprovalRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  change_request_id: string;
  level_no: number;
  node_type: string;
  required_role: string;
  assigned_to: string | null;
  decision: string;
  decision_comment: string | null;
}

const INSERT_CATALOG_ENTRY =
  "INSERT INTO field_sensitivity_catalog (tenant_id, entity_id, field_key, m01_field_key, display_label, field_group, sensitivity, self_service_editable, version) " +
  "VALUES ($1, $2, $3, $4, $5, $6::g02_field_group, $7::g02_sensitivity, $8, $9) RETURNING *";

const SELECT_CATALOG_BY_FIELD =
  "SELECT * FROM field_sensitivity_catalog WHERE tenant_id = $1 AND field_key = $2 AND is_deleted = false ORDER BY version DESC LIMIT 1";

const INSERT_MATRIX =
  "INSERT INTO approval_matrix_config (tenant_id, entity_id, name, workflow_code, status, version) " +
  "VALUES ($1, $2, $3, $4, $5::g02_matrix_status, $6) RETURNING *";

const INSERT_MATRIX_RULE =
  "INSERT INTO approval_matrix_rules (tenant_id, entity_id, matrix_id, sensitivity, field_group, field_key, level_no, node_type, topology, required_role, sla_hours) " +
  "VALUES ($1, $2, $3, $4::g02_sensitivity, $5::g02_field_group, $6, $7, $8::g02_node_type, 'SEQUENTIAL', $9, $10) RETURNING *";

const SELECT_ACTIVE_MATRIX_RULES =
  "SELECT r.* FROM approval_matrix_rules r JOIN approval_matrix_config c ON c.id = r.matrix_id " +
  "WHERE c.tenant_id = $1 AND c.status = 'ACTIVE' AND c.is_deleted = false AND r.is_deleted = false ORDER BY c.version DESC, r.level_no ASC";

const INSERT_CHANGE_REQUEST =
  "INSERT INTO change_requests (tenant_id, entity_id, cr_number, target_employee_id, requested_by, highest_sensitivity, status, reason) " +
  "VALUES ($1, $2, $3, $4, $5, $6::g02_sensitivity, $7::g02_cr_status, $8) RETURNING *";

const INSERT_CHANGE_REQUEST_ITEM =
  "INSERT INTO change_request_items (tenant_id, entity_id, change_request_id, field_key, m01_field_key, old_value, new_value, sensitivity, commit_idempotency_key) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8::g02_sensitivity, $9) RETURNING *";

const SELECT_CHANGE_REQUEST = "SELECT * FROM change_requests WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const UPDATE_CHANGE_REQUEST_STATUS =
  "UPDATE change_requests SET status = $3::g02_cr_status, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *";

const INSERT_APPROVAL =
  "INSERT INTO change_request_approvals (tenant_id, entity_id, change_request_id, level_no, node_type, required_role, assigned_to, decision, decision_comment) " +
  "VALUES ($1, $2, $3, $4, $5::g02_node_type, $6, $7, $8::g02_decision, $9) RETURNING *";

/**
 * Postgres-backed G02 repository over the frozen config + workflow tables. The decision
 * write (approval ledger row + header status move) is a single transaction so a rejected
 * request can never carry a committed approval row without its status flip.
 */
export class PgPersonalDetailsRepository {
  constructor(private readonly pool: Pool) {}

  async insertCatalogEntry(input: {
    tenantId: string;
    entityId?: string;
    fieldKey: string;
    m01FieldKey: string;
    displayLabel: string;
    fieldGroup: G02FieldGroup;
    sensitivity: G02Sensitivity;
    selfServiceEditable: boolean;
    version: number;
  }): Promise<FieldSensitivityCatalogRow> {
    const result = await this.pool.query(INSERT_CATALOG_ENTRY, [
      input.tenantId,
      input.entityId ?? null,
      input.fieldKey,
      input.m01FieldKey,
      input.displayLabel,
      input.fieldGroup,
      input.sensitivity,
      input.selfServiceEditable,
      input.version,
    ]);
    return result.rows[0] as FieldSensitivityCatalogRow;
  }

  async findCatalogEntryByField(tenantId: string, fieldKey: string): Promise<FieldSensitivityCatalogRow | undefined> {
    const result = await this.pool.query(SELECT_CATALOG_BY_FIELD, [tenantId, fieldKey]);
    return result.rows[0] as FieldSensitivityCatalogRow | undefined;
  }

  /** Insert the versioned matrix header and its rules in one transaction. */
  async insertApprovalMatrix(input: {
    tenantId: string;
    entityId?: string;
    name: string;
    workflowCode: string;
    status: "DRAFT" | "ACTIVE" | "RETIRED";
    version: number;
    rules: Array<Pick<ApprovalMatrixRule, "sensitivity" | "fieldGroup" | "fieldKey" | "levelNo" | "nodeType" | "requiredRole" | "slaHours">>;
  }): Promise<{ matrix: ApprovalMatrixConfigRow; rules: ApprovalMatrixRuleRow[] }> {
    return withTransaction(this.pool, async (client) => {
      const matrixResult = await client.query(INSERT_MATRIX, [
        input.tenantId,
        input.entityId ?? null,
        input.name,
        input.workflowCode,
        input.status,
        input.version,
      ]);
      const matrix = matrixResult.rows[0] as ApprovalMatrixConfigRow;
      const rules: ApprovalMatrixRuleRow[] = [];
      for (const rule of input.rules) {
        const ruleResult = await client.query(INSERT_MATRIX_RULE, [
          input.tenantId,
          input.entityId ?? null,
          matrix.id,
          rule.sensitivity,
          rule.fieldGroup ?? null,
          rule.fieldKey ?? null,
          rule.levelNo,
          rule.nodeType,
          rule.requiredRole,
          rule.slaHours,
        ]);
        rules.push(ruleResult.rows[0] as ApprovalMatrixRuleRow);
      }
      return { matrix, rules };
    });
  }

  async listActiveMatrixRules(tenantId: string): Promise<ApprovalMatrixRuleRow[]> {
    const result = await this.pool.query(SELECT_ACTIVE_MATRIX_RULES, [tenantId]);
    return result.rows as ApprovalMatrixRuleRow[];
  }

  /** Insert the request header and its per-field diff item in one transaction. */
  async insertChangeRequest(input: {
    tenantId: string;
    entityId: string;
    crNumber: string;
    targetEmployeeId: string;
    requestedBy: string;
    fieldKey: string;
    m01FieldKey: string;
    oldValue: string;
    newValue: string;
    sensitivity: G02Sensitivity;
    status: string;
    reason: string;
    commitIdempotencyKey: string;
  }): Promise<{ request: ChangeRequestRow }> {
    return withTransaction(this.pool, async (client) => {
      const requestResult = await client.query(INSERT_CHANGE_REQUEST, [
        input.tenantId,
        input.entityId,
        input.crNumber,
        input.targetEmployeeId,
        input.requestedBy,
        input.sensitivity,
        input.status,
        input.reason,
      ]);
      const request = requestResult.rows[0] as ChangeRequestRow;
      await client.query(INSERT_CHANGE_REQUEST_ITEM, [
        input.tenantId,
        input.entityId,
        request.id,
        input.fieldKey,
        input.m01FieldKey,
        input.oldValue,
        input.newValue,
        input.sensitivity,
        input.commitIdempotencyKey,
      ]);
      return { request };
    });
  }

  async findChangeRequest(tenantId: string, requestId: string): Promise<ChangeRequestRow | undefined> {
    const result = await this.pool.query(SELECT_CHANGE_REQUEST, [tenantId, requestId]);
    return result.rows[0] as ChangeRequestRow | undefined;
  }

  /**
   * Record an approve/reject/return decision: appends the change_request_approvals ledger
   * row and moves the header status in the same transaction (BRD FR-G02-004/006).
   */
  async recordDecision(input: {
    tenantId: string;
    entityId: string;
    changeRequestId: string;
    levelNo: number;
    nodeType: "RECOMMEND" | "APPROVE" | "SANCTION" | "VERIFY";
    requiredRole: string;
    assignedTo?: string;
    decision: "APPROVED" | "REJECTED" | "RETURNED";
    decisionComment?: string;
    nextStatus: string;
  }): Promise<{ approval: ChangeRequestApprovalRow; request: ChangeRequestRow }> {
    return withTransaction(this.pool, async (client) => {
      const approvalResult = await client.query(INSERT_APPROVAL, [
        input.tenantId,
        input.entityId,
        input.changeRequestId,
        input.levelNo,
        input.nodeType,
        input.requiredRole,
        input.assignedTo ?? null,
        input.decision,
        input.decisionComment ?? null,
      ]);
      const requestResult = await client.query(UPDATE_CHANGE_REQUEST_STATUS, [input.tenantId, input.changeRequestId, input.nextStatus]);
      if ((requestResult.rowCount ?? 0) === 0) {
        throw new FoundationError("NOT_FOUND", "G02 change request not found");
      }
      return {
        approval: approvalResult.rows[0] as ChangeRequestApprovalRow,
        request: requestResult.rows[0] as ChangeRequestRow,
      };
    });
  }
}
