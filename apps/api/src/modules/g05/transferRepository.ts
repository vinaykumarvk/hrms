import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, nextId } from "../../platform/types";
import type { ClearanceChecklist, JoiningReport, RelievingOrder, TransferOrder, TransferRepresentation } from "./transferService";

/**
 * G05 transfer repository contract consumed by TransferService.
 * Entity state for transfer orders, clearance checklists/items, relieving orders, joining
 * reports, representations, and the gapless order_number_sequences counters routes through
 * here; the service no longer owns bare in-memory arrays or length-derived numbering.
 */

/** order_number_sequences.sequence_scope (frozen g05_sequence_scope enum). */
export type OrderSequenceScope = "TRANSFER_ORDER" | "RELIEVING_ORDER" | "JOINING_REPORT" | "CLEARANCE" | "REPRESENTATION";

/** A number reserved (not yet committed) from order_number_sequences — BRD G05 §5.2.18. */
export interface OrderNumberReservation {
  sequenceId: string;
  value: number;
  orderNo: string;
}

/** One configured clearance department (g05_clearance_department domain) for an office. */
export interface ClearanceDepartmentConfig {
  code: string;
  label: string;
  slaDays: number;
}

/** Frozen g05_clearance_department enum values (BRD G05 §2218 seeded catalog + OTHER). */
export const G05_CLEARANCE_DEPARTMENT_DOMAIN = ["IT", "LIBRARY", "ACCOUNTS", "STORES", "ADVANCES", "ESTATE_QUARTERS", "HR", "OTHER"] as const;

/**
 * Seeded default clearance department configuration (g05_clearance_department domain).
 * Offices may configure fewer departments (BRD: "an office may legitimately have fewer");
 * this seed is configuration data, not workflow logic.
 */
const DEFAULT_CLEARANCE_DEPARTMENTS: ClearanceDepartmentConfig[] = [
  { code: "IT", label: "IT assets and access clearance", slaDays: 3 },
  { code: "LIBRARY", label: "Library clearance", slaDays: 3 },
  { code: "ACCOUNTS", label: "Accounts clearance", slaDays: 5 },
  { code: "STORES", label: "Stores and inventory clearance", slaDays: 3 },
  { code: "ADVANCES", label: "Outstanding advances clearance", slaDays: 5 },
  { code: "ESTATE_QUARTERS", label: "Quarters and estate clearance", slaDays: 7 },
  { code: "HR", label: "Service book and establishment clearance", slaDays: 3 },
];

export interface TransferRepository {
  countOrders(): number;
  insertOrder(order: TransferOrder): void;
  updateOrder(order: TransferOrder): void;
  findOrder(scope: TenantScope, transferOrderId: string): TransferOrder | undefined;
  listOrders(scope: TenantScope): TransferOrder[];
  countRepresentations(): number;
  insertRepresentation(representation: TransferRepresentation): void;
  updateRepresentation(representation: TransferRepresentation): void;
  findRepresentation(scope: TenantScope, representationId: string): TransferRepresentation | undefined;
  listRepresentations(scope: TenantScope): TransferRepresentation[];
  /** Reserve the next statutory number from order_number_sequences (reserve-then-commit, BRD §5.2.18). */
  reserveOrderNumber(
    scope: TenantScope,
    input: { sequenceScope: OrderSequenceScope; officeOrgUnitId: string; fiscalYear: number; prefixTemplate: string }
  ): OrderNumberReservation;
  /** Commit a previously reserved number (on approval); keeps the committed series gapless. */
  commitOrderNumber(sequenceId: string, value: number): void;
  /** Void a reserved-but-uncommitted number with a reason (audited by the caller). */
  voidOrderNumber(sequenceId: string, value: number, reason: string): void;
  /** Configured clearance departments for an office (falls back to the seeded default catalog). */
  listClearanceDepartments(scope: TenantScope, officeOrgUnitId: string): ClearanceDepartmentConfig[];
  configureClearanceDepartments(scope: TenantScope, officeOrgUnitId: string, departments: ClearanceDepartmentConfig[]): void;
  insertClearanceChecklist(checklist: ClearanceChecklist): void;
  updateClearanceChecklist(checklist: ClearanceChecklist): void;
  findChecklistByOrder(scope: TenantScope, transferOrderId: string): ClearanceChecklist | undefined;
  insertRelievingOrder(relievingOrder: RelievingOrder): void;
  updateRelievingOrder(relievingOrder: RelievingOrder): void;
  listRelievingOrders(scope: TenantScope): RelievingOrder[];
  insertJoiningReport(joiningReport: JoiningReport): void;
  listJoiningReports(scope: TenantScope): JoiningReport[];
}

interface OrderNumberSequenceRow {
  id: string;
  tenantId: string;
  entityId?: string;
  sequenceScope: OrderSequenceScope;
  officeOrgUnitId: string;
  fiscalYear: number;
  nextValue: number;
  reservedHighWater: number;
  prefixTemplate: string;
  voided: { value: number; reason: string }[];
}

function formatOrderNumber(prefixTemplate: string, fiscalYear: number, value: number): string {
  return prefixTemplate.replace("{fy}", String(fiscalYear)).replace("{seq}", String(value).padStart(5, "0"));
}

/** In-memory implementation of the TransferRepository interface, injectable for unit tests. */
export class InMemoryTransferRepository implements TransferRepository {
  private readonly orders: TransferOrder[] = [];
  private readonly representations: TransferRepresentation[] = [];
  private readonly orderNumberSequences: OrderNumberSequenceRow[] = [];
  private readonly clearanceChecklists: ClearanceChecklist[] = [];
  private readonly relievingOrders: RelievingOrder[] = [];
  private readonly joiningReports: JoiningReport[] = [];
  private readonly clearanceDepartmentConfig = new Map<string, ClearanceDepartmentConfig[]>();

  countOrders(): number {
    return this.orders.length;
  }

  insertOrder(order: TransferOrder): void {
    this.orders.push(order);
  }

  updateOrder(order: TransferOrder): void {
    const index = this.orders.findIndex((item) => item.id === order.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Transfer order not found");
    }
    this.orders[index] = order;
  }

  findOrder(scope: TenantScope, transferOrderId: string): TransferOrder | undefined {
    return this.orders.find(
      (item) => item.id === transferOrderId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }

  listOrders(scope: TenantScope): TransferOrder[] {
    return this.orders.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  countRepresentations(): number {
    return this.representations.length;
  }

  insertRepresentation(representation: TransferRepresentation): void {
    this.representations.push(representation);
  }

  updateRepresentation(representation: TransferRepresentation): void {
    const index = this.representations.findIndex((item) => item.id === representation.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Transfer representation not found");
    }
    this.representations[index] = representation;
  }

  findRepresentation(scope: TenantScope, representationId: string): TransferRepresentation | undefined {
    return this.representations.find(
      (item) => item.id === representationId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }

  listRepresentations(scope: TenantScope): TransferRepresentation[] {
    return this.representations.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  /**
   * Gapless reserve-then-commit numbering over the order_number_sequences entity
   * (per tenant / scope / office / fiscal year). Reservation bumps the high-water mark;
   * commit (on approval) advances next_value so the committed series stays dense.
   */
  reserveOrderNumber(
    scope: TenantScope,
    input: { sequenceScope: OrderSequenceScope; officeOrgUnitId: string; fiscalYear: number; prefixTemplate: string }
  ): OrderNumberReservation {
    let sequence = this.orderNumberSequences.find(
      (row) =>
        row.tenantId === scope.tenantId &&
        row.sequenceScope === input.sequenceScope &&
        row.officeOrgUnitId === input.officeOrgUnitId &&
        row.fiscalYear === input.fiscalYear
    );
    if (!sequence) {
      sequence = {
        id: nextId("order-number-sequence", this.orderNumberSequences.length),
        tenantId: scope.tenantId,
        entityId: scope.entityId,
        sequenceScope: input.sequenceScope,
        officeOrgUnitId: input.officeOrgUnitId,
        fiscalYear: input.fiscalYear,
        nextValue: 1,
        reservedHighWater: 0,
        prefixTemplate: input.prefixTemplate,
        voided: [],
      };
      this.orderNumberSequences.push(sequence);
    }
    sequence.reservedHighWater += 1;
    const value = sequence.reservedHighWater;
    return { sequenceId: sequence.id, value, orderNo: formatOrderNumber(sequence.prefixTemplate, sequence.fiscalYear, value) };
  }

  commitOrderNumber(sequenceId: string, value: number): void {
    const sequence = this.requireSequence(sequenceId);
    sequence.nextValue = Math.max(sequence.nextValue, value + 1);
  }

  voidOrderNumber(sequenceId: string, value: number, reason: string): void {
    const sequence = this.requireSequence(sequenceId);
    sequence.voided.push({ value, reason });
  }

  listClearanceDepartments(scope: TenantScope, officeOrgUnitId: string): ClearanceDepartmentConfig[] {
    const configured = this.clearanceDepartmentConfig.get(`${scope.tenantId}:${officeOrgUnitId}`);
    return (configured ?? DEFAULT_CLEARANCE_DEPARTMENTS).map((department) => ({ ...department }));
  }

  configureClearanceDepartments(scope: TenantScope, officeOrgUnitId: string, departments: ClearanceDepartmentConfig[]): void {
    for (const department of departments) {
      if (!(G05_CLEARANCE_DEPARTMENT_DOMAIN as readonly string[]).includes(department.code)) {
        throw new FoundationError("VALIDATION_FAILED", "Unknown clearance department code", {
          field: "departments",
          details: { code: department.code, domain: "g05_clearance_department" },
        });
      }
    }
    this.clearanceDepartmentConfig.set(
      `${scope.tenantId}:${officeOrgUnitId}`,
      departments.map((department) => ({ ...department }))
    );
  }

  insertClearanceChecklist(checklist: ClearanceChecklist): void {
    this.clearanceChecklists.push(checklist);
  }

  updateClearanceChecklist(checklist: ClearanceChecklist): void {
    const index = this.clearanceChecklists.findIndex((item) => item.id === checklist.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Clearance checklist not found");
    }
    this.clearanceChecklists[index] = checklist;
  }

  findChecklistByOrder(scope: TenantScope, transferOrderId: string): ClearanceChecklist | undefined {
    return this.clearanceChecklists.find(
      (item) => item.transferOrderId === transferOrderId && item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId)
    );
  }

  insertRelievingOrder(relievingOrder: RelievingOrder): void {
    this.relievingOrders.push(relievingOrder);
  }

  updateRelievingOrder(relievingOrder: RelievingOrder): void {
    const index = this.relievingOrders.findIndex((item) => item.id === relievingOrder.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Relieving order not found");
    }
    this.relievingOrders[index] = relievingOrder;
  }

  listRelievingOrders(scope: TenantScope): RelievingOrder[] {
    return this.relievingOrders.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  insertJoiningReport(joiningReport: JoiningReport): void {
    this.joiningReports.push(joiningReport);
  }

  listJoiningReports(scope: TenantScope): JoiningReport[] {
    return this.joiningReports.filter((item) => item.tenantId === scope.tenantId && (!scope.entityId || item.entityId === scope.entityId));
  }

  private requireSequence(sequenceId: string): OrderNumberSequenceRow {
    const sequence = this.orderNumberSequences.find((row) => row.id === sequenceId);
    if (!sequence) {
      throw new FoundationError("NOT_FOUND", "Order number sequence not found");
    }
    return sequence;
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G05 data model (docs/data-model/05-*.sql).
// Row shapes mirror the migration DDL under apps/api/db/migrations. All SQL is
// parameterised ($1, $2, ...); multi-step writes run in a single transaction.
// ---------------------------------------------------------------------------------------

export interface TransferRequestRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  request_no: string;
  employee_id: string;
  transfer_type: string;
  request_origin: string;
  source_org_unit_id: string;
  status: string;
}

export interface TransferOrderRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  order_no: string;
  order_class: string;
  transfer_request_id: string | null;
  employee_id: string;
  transfer_type: string;
  source_org_unit_id: string;
  dest_org_unit_id: string;
  source_designation_id: string;
  dest_designation_id: string;
  order_date: Date;
  relieve_by_date: Date;
  status: string;
}

export interface ClearanceChecklistRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  checklist_no: string;
  transfer_order_id: string;
  employee_id: string;
  source_org_unit_id: string;
  status: string;
  total_items: number;
  cleared_items: number;
  deemed_items: number;
}

export interface ClearanceItemRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  clearance_checklist_id: string;
  department_code: string;
  status: string;
  cleared_at: Date | null;
}

export interface RelievingOrderRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  relieving_order_no: string;
  transfer_order_id: string;
  employee_id: string;
  clearance_checklist_id: string;
  last_working_day: Date;
  deemed_relief: boolean;
  forced_action_reason: string | null;
  status: string;
}

export interface JoiningReportRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  joining_report_no: string;
  transfer_order_id: string;
  relieving_order_id: string | null;
  employee_id: string;
  dest_org_unit_id: string;
  reported_date: Date;
  joining_date: Date;
  service_continuity_asserted: boolean;
  status: string;
}

const INSERT_TRANSFER_REQUEST =
  "INSERT INTO transfer_requests (tenant_id, entity_id, request_no, employee_id, transfer_type, request_origin, source_org_unit_id, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
  "RETURNING id, tenant_id, entity_id, request_no, employee_id, transfer_type, request_origin, source_org_unit_id, status";

const INSERT_TRANSFER_ORDER =
  "INSERT INTO transfer_orders (tenant_id, entity_id, order_no, order_class, transfer_request_id, employee_id, transfer_type, source_org_unit_id, dest_org_unit_id, source_designation_id, dest_designation_id, order_date, relieve_by_date, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) " +
  "RETURNING id, tenant_id, entity_id, order_no, order_class, transfer_request_id, employee_id, transfer_type, source_org_unit_id, dest_org_unit_id, source_designation_id, dest_designation_id, order_date, relieve_by_date, status";

const SELECT_TRANSFER_ORDER =
  "SELECT id, tenant_id, entity_id, order_no, order_class, transfer_request_id, employee_id, transfer_type, source_org_unit_id, dest_org_unit_id, source_designation_id, dest_designation_id, order_date, relieve_by_date, status " +
  "FROM transfer_orders WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const UPDATE_TRANSFER_ORDER_STATUS =
  "UPDATE transfer_orders SET status = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, order_no, order_class, transfer_request_id, employee_id, transfer_type, source_org_unit_id, dest_org_unit_id, source_designation_id, dest_designation_id, order_date, relieve_by_date, status";

const INSERT_CLEARANCE_CHECKLIST =
  "INSERT INTO clearance_checklists (tenant_id, entity_id, checklist_no, transfer_order_id, employee_id, source_org_unit_id, total_items) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7) " +
  "RETURNING id, tenant_id, entity_id, checklist_no, transfer_order_id, employee_id, source_org_unit_id, status, total_items, cleared_items, deemed_items";

const INSERT_CLEARANCE_ITEM =
  "INSERT INTO clearance_items (tenant_id, entity_id, clearance_checklist_id, department_code) " +
  "VALUES ($1, $2, $3, $4) " +
  "RETURNING id, tenant_id, entity_id, clearance_checklist_id, department_code, status, cleared_at";

const SELECT_CLEARANCE_CHECKLIST =
  "SELECT id, tenant_id, entity_id, checklist_no, transfer_order_id, employee_id, source_org_unit_id, status, total_items, cleared_items, deemed_items " +
  "FROM clearance_checklists WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const SELECT_CLEARANCE_ITEMS =
  "SELECT id, tenant_id, entity_id, clearance_checklist_id, department_code, status, cleared_at " +
  "FROM clearance_items WHERE clearance_checklist_id = $1 AND is_deleted = false ORDER BY department_code";

const CLEAR_CLEARANCE_ITEM =
  "UPDATE clearance_items SET status = $2, cleared_at = $3, updated_at = now() WHERE id = $1 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, clearance_checklist_id, department_code, status, cleared_at";

const BUMP_CHECKLIST_CLEARED =
  "UPDATE clearance_checklists SET cleared_items = cleared_items + 1, updated_at = now() WHERE id = $1 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, checklist_no, transfer_order_id, employee_id, source_org_unit_id, status, total_items, cleared_items, deemed_items";

const UPSERT_ORDER_NUMBER_SEQUENCE =
  "INSERT INTO order_number_sequences (tenant_id, entity_id, sequence_scope, office_org_unit_id, fiscal_year, prefix_template) " +
  "VALUES ($1, $2, $3, $4, $5, $6) " +
  "ON CONFLICT (tenant_id, sequence_scope, office_org_unit_id, fiscal_year) DO NOTHING";

const LOCK_ORDER_NUMBER_SEQUENCE =
  "SELECT id, prefix_template, fiscal_year FROM order_number_sequences " +
  "WHERE tenant_id = $1 AND sequence_scope = $2 AND office_org_unit_id = $3 AND fiscal_year = $4 AND is_deleted = false " +
  "FOR UPDATE";

const RESERVE_ORDER_NUMBER =
  "UPDATE order_number_sequences SET reserved_high_water = reserved_high_water + 1, updated_at = now() " +
  "WHERE id = $1 RETURNING reserved_high_water";

const COMMIT_ORDER_NUMBER =
  "UPDATE order_number_sequences SET next_value = GREATEST(next_value, $2 + 1), updated_at = now() " +
  "WHERE id = $1 AND is_deleted = false RETURNING next_value";

const INSERT_RELIEVING_ORDER =
  "INSERT INTO relieving_orders (tenant_id, entity_id, relieving_order_no, transfer_order_id, employee_id, clearance_checklist_id, last_working_day, relieved, deemed_relief, forced_action_reason, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, relieving_order_no, transfer_order_id, employee_id, clearance_checklist_id, last_working_day, deemed_relief, forced_action_reason, status";

const INSERT_JOINING_REPORT =
  "INSERT INTO joining_reports (tenant_id, entity_id, joining_report_no, transfer_order_id, relieving_order_id, employee_id, dest_org_unit_id, reported_date, joining_date, service_continuity_asserted, status) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, joining_report_no, transfer_order_id, relieving_order_id, employee_id, dest_org_unit_id, reported_date, joining_date, service_continuity_asserted, status";

/**
 * Postgres-backed G05 transfer repository over the frozen tables
 * transfer_requests, transfer_orders, order_number_sequences, clearance_checklists,
 * clearance_items, relieving_orders, and joining_reports.
 */
export class PgTransferRepository {
  constructor(private readonly pool: Pool) {}

  async insertTransferRequest(input: {
    tenantId: string;
    entityId: string;
    requestNo: string;
    employeeId: string;
    transferType: string;
    requestOrigin: string;
    sourceOrgUnitId: string;
    status: string;
  }): Promise<TransferRequestRow> {
    const result = await this.pool.query(INSERT_TRANSFER_REQUEST, [
      input.tenantId,
      input.entityId,
      input.requestNo,
      input.employeeId,
      input.transferType,
      input.requestOrigin,
      input.sourceOrgUnitId,
      input.status,
    ]);
    return result.rows[0] as TransferRequestRow;
  }

  async insertTransferOrder(input: {
    tenantId: string;
    entityId: string;
    orderNo: string;
    orderClass: string;
    transferRequestId?: string;
    employeeId: string;
    transferType: string;
    sourceOrgUnitId: string;
    destOrgUnitId: string;
    sourceDesignationId: string;
    destDesignationId: string;
    orderDate: string;
    relieveByDate: string;
    status: string;
  }): Promise<TransferOrderRow> {
    const result = await this.pool.query(INSERT_TRANSFER_ORDER, [
      input.tenantId,
      input.entityId,
      input.orderNo,
      input.orderClass,
      input.transferRequestId ?? null,
      input.employeeId,
      input.transferType,
      input.sourceOrgUnitId,
      input.destOrgUnitId,
      input.sourceDesignationId,
      input.destDesignationId,
      input.orderDate,
      input.relieveByDate,
      input.status,
    ]);
    return result.rows[0] as TransferOrderRow;
  }

  async getTransferOrder(tenantId: string, transferOrderId: string): Promise<TransferOrderRow | undefined> {
    const result = await this.pool.query(SELECT_TRANSFER_ORDER, [tenantId, transferOrderId]);
    return result.rows[0] as TransferOrderRow | undefined;
  }

  async updateTransferOrderStatus(tenantId: string, transferOrderId: string, status: string): Promise<TransferOrderRow> {
    const result = await this.pool.query(UPDATE_TRANSFER_ORDER_STATUS, [tenantId, transferOrderId, status]);
    const row = result.rows[0] as TransferOrderRow | undefined;
    if (!row) {
      throw new FoundationError("NOT_FOUND", "Transfer order not found");
    }
    return row;
  }

  /**
   * Reserve the next statutory number from order_number_sequences under a row lock
   * (reserve-then-commit, BRD G05 §5.2.18): upsert the per-(tenant, scope, office, fy)
   * counter row, lock it, and bump reserved_high_water — all in one transaction.
   */
  async reserveOrderNumber(input: {
    tenantId: string;
    entityId: string;
    sequenceScope: OrderSequenceScope;
    officeOrgUnitId: string;
    fiscalYear: number;
    prefixTemplate: string;
  }): Promise<{ sequenceId: string; value: number; orderNo: string }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(UPSERT_ORDER_NUMBER_SEQUENCE, [
        input.tenantId,
        input.entityId,
        input.sequenceScope,
        input.officeOrgUnitId,
        input.fiscalYear,
        input.prefixTemplate,
      ]);
      const locked = await client.query(LOCK_ORDER_NUMBER_SEQUENCE, [
        input.tenantId,
        input.sequenceScope,
        input.officeOrgUnitId,
        input.fiscalYear,
      ]);
      const sequence = locked.rows[0] as { id: string; prefix_template: string; fiscal_year: number } | undefined;
      if (!sequence) {
        // Row-lock contention / missing counter row surfaces as ERR-G05-NUMBER-LOCKED (retryable).
        throw new FoundationError("CONFLICT", "Order number sequence unavailable", {
          details: { messageId: "ERR-G05-NUMBER-LOCKED" },
        });
      }
      const reserved = await client.query(RESERVE_ORDER_NUMBER, [sequence.id]);
      const value = Number((reserved.rows[0] as { reserved_high_water: string | number }).reserved_high_water);
      return { sequenceId: sequence.id, value, orderNo: formatOrderNumber(sequence.prefix_template, sequence.fiscal_year, value) };
    });
  }

  /** Commit a reserved number on approval so the committed series stays gapless. */
  async commitOrderNumber(sequenceId: string, value: number): Promise<void> {
    const result = await this.pool.query(COMMIT_ORDER_NUMBER, [sequenceId, value]);
    if (!result.rows[0]) {
      throw new FoundationError("NOT_FOUND", "Order number sequence not found");
    }
  }

  async insertRelievingOrder(input: {
    tenantId: string;
    entityId: string;
    relievingOrderNo: string;
    transferOrderId: string;
    employeeId: string;
    clearanceChecklistId: string;
    lastWorkingDay: string;
    relieved: boolean;
    deemedRelief: boolean;
    forcedActionReason?: string;
    status: string;
  }): Promise<RelievingOrderRow> {
    const result = await this.pool.query(INSERT_RELIEVING_ORDER, [
      input.tenantId,
      input.entityId,
      input.relievingOrderNo,
      input.transferOrderId,
      input.employeeId,
      input.clearanceChecklistId,
      input.lastWorkingDay,
      input.relieved,
      input.deemedRelief,
      input.forcedActionReason ?? null,
      input.status,
    ]);
    return result.rows[0] as RelievingOrderRow;
  }

  async insertJoiningReport(input: {
    tenantId: string;
    entityId: string;
    joiningReportNo: string;
    transferOrderId: string;
    relievingOrderId?: string;
    employeeId: string;
    destOrgUnitId: string;
    reportedDate: string;
    joiningDate: string;
    serviceContinuityAsserted: boolean;
    status: string;
  }): Promise<JoiningReportRow> {
    const result = await this.pool.query(INSERT_JOINING_REPORT, [
      input.tenantId,
      input.entityId,
      input.joiningReportNo,
      input.transferOrderId,
      input.relievingOrderId ?? null,
      input.employeeId,
      input.destOrgUnitId,
      input.reportedDate,
      input.joiningDate,
      input.serviceContinuityAsserted,
      input.status,
    ]);
    return result.rows[0] as JoiningReportRow;
  }

  /**
   * Create the no-dues checklist and one clearance item per configured department in a single
   * transaction so the checklist header count always matches its items.
   */
  async createClearanceChecklist(input: {
    tenantId: string;
    entityId: string;
    checklistNo: string;
    transferOrderId: string;
    employeeId: string;
    sourceOrgUnitId: string;
    departmentCodes: string[];
  }): Promise<{ checklist: ClearanceChecklistRow; items: ClearanceItemRow[] }> {
    return withTransaction(this.pool, async (client) => {
      const checklistResult = await client.query(INSERT_CLEARANCE_CHECKLIST, [
        input.tenantId,
        input.entityId,
        input.checklistNo,
        input.transferOrderId,
        input.employeeId,
        input.sourceOrgUnitId,
        input.departmentCodes.length,
      ]);
      const checklist = checklistResult.rows[0] as ClearanceChecklistRow;
      const items: ClearanceItemRow[] = [];
      for (const departmentCode of input.departmentCodes) {
        const itemResult = await client.query(INSERT_CLEARANCE_ITEM, [input.tenantId, input.entityId, checklist.id, departmentCode]);
        items.push(itemResult.rows[0] as ClearanceItemRow);
      }
      return { checklist, items };
    });
  }

  async getClearanceChecklist(tenantId: string, checklistId: string): Promise<ClearanceChecklistRow | undefined> {
    const result = await this.pool.query(SELECT_CLEARANCE_CHECKLIST, [tenantId, checklistId]);
    return result.rows[0] as ClearanceChecklistRow | undefined;
  }

  async listClearanceItems(checklistId: string): Promise<ClearanceItemRow[]> {
    const result = await this.pool.query(SELECT_CLEARANCE_ITEMS, [checklistId]);
    return result.rows as ClearanceItemRow[];
  }

  /** Clear one item and bump the checklist cleared counter in a single transaction. */
  async clearItem(itemId: string, clearedAt: string): Promise<{ item: ClearanceItemRow; checklist: ClearanceChecklistRow }> {
    return withTransaction(this.pool, async (client) => {
      const itemResult = await client.query(CLEAR_CLEARANCE_ITEM, [itemId, "CLEARED", clearedAt]);
      const item = itemResult.rows[0] as ClearanceItemRow | undefined;
      if (!item) {
        throw new FoundationError("NOT_FOUND", "Clearance item not found");
      }
      const checklistResult = await client.query(BUMP_CHECKLIST_CLEARED, [item.clearance_checklist_id]);
      return { item, checklist: checklistResult.rows[0] as ClearanceChecklistRow };
    });
  }
}
