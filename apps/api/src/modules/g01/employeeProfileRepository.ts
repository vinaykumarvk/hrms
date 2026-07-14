import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, inScope } from "../../platform/types";
import type {
  EmployeeAddress,
  EmployeeAttributeHistoryEntry,
  EmployeeContact,
  EmployeeDependent,
  OutboxEvent,
} from "./employeeMasterService";

/**
 * PH-07A G01 profile repository contract consumed by EmployeeMasterService.
 * Satellite state (employee_contacts, employee_addresses, employee_dependents), the
 * FR-EPM-011 employee_attribute_history spine, and the E33 outbox_events backbone all
 * route through here; the service no longer owns a bare in-memory outbox array.
 */
export interface EmployeeProfileRepository {
  // outbox_events (transactional outbox, monotonic sequence cursor)
  countOutboxEvents(): number;
  appendOutboxEvent(event: OutboxEvent): void;
  listOutboxEvents(scope: TenantScope): OutboxEvent[];
  // employee_contacts
  countContacts(): number;
  insertContact(contact: EmployeeContact): void;
  updateContact(contact: EmployeeContact): void;
  findContact(scope: TenantScope, contactId: string): EmployeeContact | undefined;
  findContactByOfficialEmail(scope: TenantScope, contactValue: string): EmployeeContact | undefined;
  listContacts(scope: TenantScope, employeeId: string): EmployeeContact[];
  // employee_addresses
  countAddresses(): number;
  insertAddress(address: EmployeeAddress): void;
  updateAddress(address: EmployeeAddress): void;
  listAddresses(scope: TenantScope, employeeId: string): EmployeeAddress[];
  // employee_dependents
  countDependents(): number;
  insertDependent(dependent: EmployeeDependent): void;
  listDependents(scope: TenantScope, employeeId: string): EmployeeDependent[];
  /**
   * FR-EPM-015 AC3 (PH-16A): consolidate every non-deleted G01 satellite row under the
   * surviving employee_id during a merge. Returns the moved row ids so the alias
   * merge_snapshot can restore them verbatim on undo. G01-owned tables ONLY — a merge never
   * re-points another module's foreign keys.
   */
  repointSatellitesForMerge(
    scope: TenantScope,
    fromEmployeeId: string,
    toEmployeeId: string
  ): { contactIds: string[]; addressIds: string[]; dependentIds: string[] };
  /** Merge-undo counterpart: re-points exactly the snapshot-listed rows back to the restored loser. */
  repointSatelliteRows(
    scope: TenantScope,
    rowIds: { contactIds: string[]; addressIds: string[]; dependentIds: string[] },
    toEmployeeId: string
  ): void;
  // employee_attribute_history (append-only spine; closing a window updates effective_to only)
  countAttributeHistory(): number;
  appendAttributeHistory(entry: EmployeeAttributeHistoryEntry): void;
  closeAttributeHistory(scope: TenantScope, employeeId: string, attributePath: string, effectiveTo: string): void;
  listAttributeHistory(scope: TenantScope, employeeId: string): EmployeeAttributeHistoryEntry[];
}

/** In-memory implementation of the EmployeeProfileRepository interface, injectable for unit tests. */
export class InMemoryEmployeeProfileRepository implements EmployeeProfileRepository {
  private readonly outboxEvents: OutboxEvent[] = [];
  private readonly contacts: EmployeeContact[] = [];
  private readonly addresses: EmployeeAddress[] = [];
  private readonly dependents: EmployeeDependent[] = [];
  private readonly attributeHistory: EmployeeAttributeHistoryEntry[] = [];

  countOutboxEvents(): number {
    return this.outboxEvents.length;
  }

  appendOutboxEvent(event: OutboxEvent): void {
    this.outboxEvents.push(event);
  }

  listOutboxEvents(scope: TenantScope): OutboxEvent[] {
    return this.outboxEvents.filter((event) => inScope(event, scope));
  }

  countContacts(): number {
    return this.contacts.length;
  }

  insertContact(contact: EmployeeContact): void {
    this.contacts.push(contact);
  }

  updateContact(contact: EmployeeContact): void {
    const index = this.contacts.findIndex((item) => item.id === contact.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Contact not found");
    }
    this.contacts[index] = contact;
  }

  findContact(scope: TenantScope, contactId: string): EmployeeContact | undefined {
    return this.contacts.find((item) => inScope(item, scope) && item.id === contactId && !item.isDeleted);
  }

  /** r17: tenant-unique official email across non-deleted rows (tenant-wide, not entity-scoped). */
  findContactByOfficialEmail(scope: TenantScope, contactValue: string): EmployeeContact | undefined {
    const needle = contactValue.toLowerCase();
    return this.contacts.find(
      (item) =>
        item.tenantId === scope.tenantId &&
        item.contactType === "OFFICIAL_EMAIL" &&
        item.contactValue.toLowerCase() === needle &&
        !item.isDeleted
    );
  }

  listContacts(scope: TenantScope, employeeId: string): EmployeeContact[] {
    return this.contacts.filter((item) => inScope(item, scope) && item.employeeId === employeeId && !item.isDeleted);
  }

  countAddresses(): number {
    return this.addresses.length;
  }

  insertAddress(address: EmployeeAddress): void {
    this.addresses.push(address);
  }

  updateAddress(address: EmployeeAddress): void {
    const index = this.addresses.findIndex((item) => item.id === address.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Address not found");
    }
    this.addresses[index] = address;
  }

  listAddresses(scope: TenantScope, employeeId: string): EmployeeAddress[] {
    return this.addresses.filter((item) => inScope(item, scope) && item.employeeId === employeeId && !item.isDeleted);
  }

  countDependents(): number {
    return this.dependents.length;
  }

  insertDependent(dependent: EmployeeDependent): void {
    this.dependents.push(dependent);
  }

  listDependents(scope: TenantScope, employeeId: string): EmployeeDependent[] {
    return this.dependents.filter((item) => inScope(item, scope) && item.employeeId === employeeId && !item.isDeleted);
  }

  repointSatellitesForMerge(
    scope: TenantScope,
    fromEmployeeId: string,
    toEmployeeId: string
  ): { contactIds: string[]; addressIds: string[]; dependentIds: string[] } {
    const moved = { contactIds: [] as string[], addressIds: [] as string[], dependentIds: [] as string[] };
    for (const contact of this.contacts) {
      if (inScope(contact, scope) && contact.employeeId === fromEmployeeId && !contact.isDeleted) {
        contact.employeeId = toEmployeeId;
        moved.contactIds.push(contact.id);
      }
    }
    for (const address of this.addresses) {
      if (inScope(address, scope) && address.employeeId === fromEmployeeId && !address.isDeleted) {
        address.employeeId = toEmployeeId;
        moved.addressIds.push(address.id);
      }
    }
    for (const dependent of this.dependents) {
      if (inScope(dependent, scope) && dependent.employeeId === fromEmployeeId && !dependent.isDeleted) {
        dependent.employeeId = toEmployeeId;
        moved.dependentIds.push(dependent.id);
      }
    }
    return moved;
  }

  repointSatelliteRows(
    scope: TenantScope,
    rowIds: { contactIds: string[]; addressIds: string[]; dependentIds: string[] },
    toEmployeeId: string
  ): void {
    for (const contact of this.contacts) {
      if (inScope(contact, scope) && rowIds.contactIds.includes(contact.id)) {
        contact.employeeId = toEmployeeId;
      }
    }
    for (const address of this.addresses) {
      if (inScope(address, scope) && rowIds.addressIds.includes(address.id)) {
        address.employeeId = toEmployeeId;
      }
    }
    for (const dependent of this.dependents) {
      if (inScope(dependent, scope) && rowIds.dependentIds.includes(dependent.id)) {
        dependent.employeeId = toEmployeeId;
      }
    }
  }

  countAttributeHistory(): number {
    return this.attributeHistory.length;
  }

  appendAttributeHistory(entry: EmployeeAttributeHistoryEntry): void {
    this.attributeHistory.push(entry);
  }

  closeAttributeHistory(scope: TenantScope, employeeId: string, attributePath: string, effectiveTo: string): void {
    for (const entry of this.attributeHistory) {
      if (inScope(entry, scope) && entry.employeeId === employeeId && entry.attributePath === attributePath && !entry.effectiveTo) {
        entry.effectiveTo = effectiveTo;
      }
    }
  }

  listAttributeHistory(scope: TenantScope, employeeId: string): EmployeeAttributeHistoryEntry[] {
    return this.attributeHistory
      .filter((entry) => inScope(entry, scope) && entry.employeeId === employeeId)
      .map((entry) => ({ ...entry }));
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G01 satellite tables (docs/data-model/
// 01-G01-employee-profile.sql + 00-platform-core.sql employee_dependents). Row shapes
// mirror the migration DDL under apps/api/db/migrations/0004_g01_employee_satellites.sql.
// All SQL is parameterised ($1, $2, ...). Every mutating method runs the satellite write,
// the employee_attribute_history append, and the outbox_events row in ONE BEGIN/COMMIT —
// an outbox row without its mutation (or vice versa) cannot be committed.
// ---------------------------------------------------------------------------------------

export interface EmployeeContactRow {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  employee_id: string;
  contact_type: string;
  contact_value: string;
  is_primary: boolean;
  is_verified: boolean;
  visibility: string;
  row_version: number;
}

export interface EmployeeAddressRow {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  employee_id: string;
  address_type: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  is_current: boolean;
  valid_from: Date;
  valid_to: Date | null;
  row_version: number;
}

export interface EmployeeDependentRow {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  employee_id: string;
  full_name: string;
  relationship: string;
  dob: Date | null;
  is_minor: boolean | null;
  is_legal_heir: boolean;
  heir_succession_rank: number | null;
}

export interface AttributeHistoryRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  attribute_path: string;
  value_text: string | null;
  effective_from: Date;
  effective_to: Date | null;
  change_reason: string;
  source: string;
}

export interface OutboxEventRow {
  event_id: string;
  tenant_id: string;
  entity_id: string | null;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

const INSERT_OUTBOX =
  "INSERT INTO outbox_events (tenant_id, entity_id, aggregate_id, event_type, payload, retention_until, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6), $7) " +
  "RETURNING event_id, tenant_id, entity_id, aggregate_id, event_type, payload, occurred_at";

const SELECT_OUTBOX_AFTER =
  "SELECT event_id, tenant_id, entity_id, aggregate_id, event_type, payload, occurred_at " +
  "FROM outbox_events WHERE tenant_id = $1 AND event_id > $2 ORDER BY event_id ASC LIMIT $3";

const DEMOTE_PRIMARY_CONTACT =
  "UPDATE employee_contacts SET is_primary = false, row_version = row_version + 1, updated_at = now(), updated_by = $4 " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND contact_type = $3 AND is_primary AND is_deleted = false";

const INSERT_CONTACT =
  "INSERT INTO employee_contacts (tenant_id, entity_id, employee_id, contact_type, contact_value, is_primary, visibility, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
  "RETURNING id, tenant_id, entity_id, employee_id, contact_type, contact_value, is_primary, is_verified, visibility, row_version";

const SELECT_CONTACTS =
  "SELECT id, tenant_id, entity_id, employee_id, contact_type, contact_value, is_primary, is_verified, visibility, row_version " +
  "FROM employee_contacts WHERE tenant_id = $1 AND employee_id = $2 AND is_deleted = false ORDER BY created_at";

const CLOSE_CURRENT_ADDRESS =
  "UPDATE employee_addresses SET is_current = false, valid_to = $4::date - 1, row_version = row_version + 1, updated_at = now(), updated_by = $5 " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND address_type = $3 AND is_current AND is_deleted = false";

const INSERT_ADDRESS =
  "INSERT INTO employee_addresses (tenant_id, entity_id, employee_id, address_type, line1, line2, city, district, state, country, pincode, valid_from, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13) " +
  "RETURNING id, tenant_id, entity_id, employee_id, address_type, line1, city, state, pincode, is_current, valid_from, valid_to, row_version";

const SELECT_ADDRESSES =
  "SELECT id, tenant_id, entity_id, employee_id, address_type, line1, city, state, pincode, is_current, valid_from, valid_to, row_version " +
  "FROM employee_addresses WHERE tenant_id = $1 AND employee_id = $2 AND is_deleted = false ORDER BY valid_from, created_at";

const INSERT_DEPENDENT =
  "INSERT INTO employee_dependents (tenant_id, entity_id, employee_id, full_name, relationship, dob, is_minor, is_legal_heir, heir_succession_rank, national_id_masked, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, employee_id, full_name, relationship, dob, is_minor, is_legal_heir, heir_succession_rank";

const SELECT_DEPENDENTS =
  "SELECT id, tenant_id, entity_id, employee_id, full_name, relationship, dob, is_minor, is_legal_heir, heir_succession_rank " +
  "FROM employee_dependents WHERE tenant_id = $1 AND employee_id = $2 AND is_deleted = false ORDER BY created_at";

// Closes the open window the day BEFORE the new effective_from so the '[]' daterange
// EXCLUDE constraint (ex_attr_history_nooverlap) never sees overlapping windows.
const CLOSE_ATTRIBUTE_WINDOW =
  "UPDATE employee_attribute_history SET effective_to = $4::date - 1 " +
  "WHERE tenant_id = $1 AND employee_id = $2 AND attribute_path = $3 AND effective_to IS NULL";

const INSERT_ATTRIBUTE_HISTORY =
  "INSERT INTO employee_attribute_history (tenant_id, entity_id, employee_id, attribute_path, value_text, effective_from, change_reason, source, governed_change_id, recorded_by, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $10) " +
  "RETURNING id, tenant_id, employee_id, attribute_path, value_text, effective_from, effective_to, change_reason, source";

const SELECT_ATTRIBUTE_HISTORY =
  "SELECT id, tenant_id, employee_id, attribute_path, value_text, effective_from, effective_to, change_reason, source " +
  "FROM employee_attribute_history WHERE tenant_id = $1 AND employee_id = $2 ORDER BY effective_from, created_at";

const OUTBOX_RETENTION_DAYS = 365;

/**
 * Postgres-backed G01 profile repository over the frozen tables employee_contacts,
 * employee_addresses, employee_dependents, employee_attribute_history, and outbox_events.
 */
export class PgEmployeeProfileRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Insert a contact with its attribute-history append and outbox row in one transaction.
   * When `demoteExistingPrimary` is set the previous primary of the same type is demoted
   * inside the same BEGIN/COMMIT (FR-EPM-003 AC2).
   */
  async insertContactWithOutbox(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    contactType: string;
    contactValue: string;
    isPrimary: boolean;
    visibility: string;
    demoteExistingPrimary: boolean;
    effectiveFrom: string;
    changeReason: string;
    recordedBy: string;
  }): Promise<{ contact: EmployeeContactRow; historyEntry: AttributeHistoryRow; outboxEvent: OutboxEventRow }> {
    return withTransaction(this.pool, async (client) => {
      if (input.demoteExistingPrimary && input.isPrimary) {
        await client.query(DEMOTE_PRIMARY_CONTACT, [input.tenantId, input.employeeId, input.contactType, input.recordedBy]);
      }
      const contactResult = await client.query(INSERT_CONTACT, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.contactType,
        input.contactValue,
        input.isPrimary,
        input.visibility,
        input.recordedBy,
      ]);
      const contact = contactResult.rows[0] as EmployeeContactRow;
      await client.query(CLOSE_ATTRIBUTE_WINDOW, [input.tenantId, input.employeeId, `contact.${input.contactType}`, input.effectiveFrom]);
      const historyResult = await client.query(INSERT_ATTRIBUTE_HISTORY, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        `contact.${input.contactType}`,
        input.contactValue,
        input.effectiveFrom,
        input.changeReason,
        "G01",
        null,
        input.recordedBy,
      ]);
      const outboxResult = await client.query(INSERT_OUTBOX, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        "CONTACT_UPDATED",
        JSON.stringify({ contactId: contact.id, contactType: input.contactType, isPrimary: input.isPrimary }),
        OUTBOX_RETENTION_DAYS,
        input.recordedBy,
      ]);
      return {
        contact,
        historyEntry: historyResult.rows[0] as AttributeHistoryRow,
        outboxEvent: outboxResult.rows[0] as OutboxEventRow,
      };
    });
  }

  /**
   * Effective-dated address insert (FR-EPM-003 AC5): the prior current row of the same type
   * is closed (valid_to, is_current=false), the new row opened, history appended, and the
   * outbox row written — all in one transaction.
   */
  async insertAddressWithOutbox(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    addressType: string;
    line1: string;
    line2?: string;
    city: string;
    district?: string;
    state: string;
    country: string;
    pincode: string;
    validFrom: string;
    changeReason: string;
    recordedBy: string;
  }): Promise<{ address: EmployeeAddressRow; historyEntry: AttributeHistoryRow; outboxEvent: OutboxEventRow }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(CLOSE_CURRENT_ADDRESS, [input.tenantId, input.employeeId, input.addressType, input.validFrom, input.recordedBy]);
      const addressResult = await client.query(INSERT_ADDRESS, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.addressType,
        input.line1,
        input.line2 ?? null,
        input.city,
        input.district ?? null,
        input.state,
        input.country,
        input.pincode,
        input.validFrom,
        input.recordedBy,
      ]);
      const address = addressResult.rows[0] as EmployeeAddressRow;
      await client.query(CLOSE_ATTRIBUTE_WINDOW, [input.tenantId, input.employeeId, `address.${input.addressType}`, input.validFrom]);
      const historyResult = await client.query(INSERT_ATTRIBUTE_HISTORY, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        `address.${input.addressType}`,
        `${input.line1}, ${input.city}, ${input.state} ${input.pincode}`,
        input.validFrom,
        input.changeReason,
        "G01",
        null,
        input.recordedBy,
      ]);
      const outboxResult = await client.query(INSERT_OUTBOX, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        "ADDRESS_UPDATED",
        JSON.stringify({ addressId: address.id, addressType: input.addressType, validFrom: input.validFrom }),
        OUTBOX_RETENTION_DAYS,
        input.recordedBy,
      ]);
      return {
        address,
        historyEntry: historyResult.rows[0] as AttributeHistoryRow,
        outboxEvent: outboxResult.rows[0] as OutboxEventRow,
      };
    });
  }

  /** Dependent insert + attribute-history append + outbox row in one transaction (FR-EPM-004). */
  async insertDependentWithOutbox(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    fullName: string;
    relationship: string;
    dob?: string;
    isMinor?: boolean;
    isLegalHeir: boolean;
    heirSuccessionRank?: number;
    nationalIdMasked?: string;
    effectiveFrom: string;
    changeReason: string;
    recordedBy: string;
  }): Promise<{ dependent: EmployeeDependentRow; historyEntry: AttributeHistoryRow; outboxEvent: OutboxEventRow }> {
    return withTransaction(this.pool, async (client) => {
      const dependentResult = await client.query(INSERT_DEPENDENT, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.fullName,
        input.relationship,
        input.dob ?? null,
        input.isMinor ?? null,
        input.isLegalHeir,
        input.heirSuccessionRank ?? null,
        input.nationalIdMasked ?? null,
        input.recordedBy,
      ]);
      const dependent = dependentResult.rows[0] as EmployeeDependentRow;
      const historyResult = await client.query(INSERT_ATTRIBUTE_HISTORY, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        `dependent.${dependent.id}`,
        `${input.fullName} (${input.relationship})`,
        input.effectiveFrom,
        input.changeReason,
        "G01",
        null,
        input.recordedBy,
      ]);
      const outboxResult = await client.query(INSERT_OUTBOX, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        "DEPENDENT_UPDATED",
        JSON.stringify({ dependentId: dependent.id, relationship: input.relationship, isLegalHeir: input.isLegalHeir }),
        OUTBOX_RETENTION_DAYS,
        input.recordedBy,
      ]);
      return {
        dependent,
        historyEntry: historyResult.rows[0] as AttributeHistoryRow,
        outboxEvent: outboxResult.rows[0] as OutboxEventRow,
      };
    });
  }

  /**
   * Governed core-attribute change (FR-EPM-011/022): closes the open window for the
   * attribute path, appends the new history row, and writes the outbox row in one
   * transaction. Payload carries the attribute path only — no raw attribute values.
   */
  async appendAttributeHistoryWithOutbox(input: {
    tenantId: string;
    entityId?: string;
    employeeId: string;
    attributePath: string;
    valueText: string;
    effectiveFrom: string;
    changeReason: string;
    source: string;
    governedChangeId?: string;
    recordedBy: string;
  }): Promise<{ historyEntry: AttributeHistoryRow; outboxEvent: OutboxEventRow }> {
    return withTransaction(this.pool, async (client) => {
      await client.query(CLOSE_ATTRIBUTE_WINDOW, [input.tenantId, input.employeeId, input.attributePath, input.effectiveFrom]);
      const historyResult = await client.query(INSERT_ATTRIBUTE_HISTORY, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        input.attributePath,
        input.valueText,
        input.effectiveFrom,
        input.changeReason,
        input.source,
        input.governedChangeId ?? null,
        input.recordedBy,
      ]);
      const outboxResult = await client.query(INSERT_OUTBOX, [
        input.tenantId,
        input.entityId ?? null,
        input.employeeId,
        "IDENTITY_CHANGE_COMMITTED",
        JSON.stringify({ attributePath: input.attributePath, governedChangeId: input.governedChangeId ?? null }),
        OUTBOX_RETENTION_DAYS,
        input.recordedBy,
      ]);
      return {
        historyEntry: historyResult.rows[0] as AttributeHistoryRow,
        outboxEvent: outboxResult.rows[0] as OutboxEventRow,
      };
    });
  }

  /** Ordered cursor read of the outbox feed: events strictly after `afterEventId`, ascending event_id. */
  async listOutboxEventsAfter(tenantId: string, afterEventId: number, limit: number): Promise<OutboxEventRow[]> {
    const result = await this.pool.query(SELECT_OUTBOX_AFTER, [tenantId, afterEventId, limit]);
    return result.rows as OutboxEventRow[];
  }

  async listContacts(tenantId: string, employeeId: string): Promise<EmployeeContactRow[]> {
    const result = await this.pool.query(SELECT_CONTACTS, [tenantId, employeeId]);
    return result.rows as EmployeeContactRow[];
  }

  async listAddresses(tenantId: string, employeeId: string): Promise<EmployeeAddressRow[]> {
    const result = await this.pool.query(SELECT_ADDRESSES, [tenantId, employeeId]);
    return result.rows as EmployeeAddressRow[];
  }

  async listDependents(tenantId: string, employeeId: string): Promise<EmployeeDependentRow[]> {
    const result = await this.pool.query(SELECT_DEPENDENTS, [tenantId, employeeId]);
    return result.rows as EmployeeDependentRow[];
  }

  async listAttributeHistory(tenantId: string, employeeId: string): Promise<AttributeHistoryRow[]> {
    const result = await this.pool.query(SELECT_ATTRIBUTE_HISTORY, [tenantId, employeeId]);
    return result.rows as AttributeHistoryRow[];
  }
}
