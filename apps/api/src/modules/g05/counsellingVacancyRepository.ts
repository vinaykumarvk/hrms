import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";
import type {
  CounsellingChoice,
  CounsellingSession,
  MutualTransferOrder,
  MutualTransferRequest,
  TransferPreference,
  VacancyPosition,
  VacancyReservation,
} from "./counsellingVacancyService";

/**
 * PH-16D — G05 counselling/vacancy/mutual repository seam (migration 0031 + 0003 tables:
 * vacancy_positions, transfer_preferences, vacancy_reservations, counselling_sessions,
 * counselling_choices; mutual coupling persists on transfer_requests/transfer_orders).
 *
 * Contract highlights:
 *  - reserveVacancyWithGuard / fillReservationWithGuard are ATOMIC: the derived vacant_count
 *    re-check and the write happen as one operation (row-locked transaction in Postgres);
 *    over-allotment and join-time double-fill throw ERR-G05-VACANCY-FULL (409, fail closed).
 *  - counselling_choices is APPEND-ONLY (BRD 5.6-10): insert + list only — no update, no delete.
 *  - insertCoupledMutualOrders persists BOTH cross-linked orders in one atomic write
 *    (both-or-neither, BRD rule 5).
 */
export interface CounsellingVacancyRepository {
  countVacancyPositions(): number;
  insertVacancyPosition(position: VacancyPosition): void;
  updateVacancyPosition(position: VacancyPosition): void;
  findVacancyPosition(scope: TenantScope, vacancyPositionId: string): VacancyPosition | undefined;
  listVacancyPositions(scope: TenantScope, driveId?: string): VacancyPosition[];
  countPreferences(): number;
  /** Replaces the ranked preference set for (drive, employee) — re-submission within the window. */
  replacePreferences(scope: TenantScope, driveId: string, employeeId: string, preferences: TransferPreference[]): void;
  updatePreference(preference: TransferPreference): void;
  listPreferences(scope: TenantScope, driveId: string, employeeId: string): TransferPreference[];
  countReservations(): number;
  /**
   * Transactional allotment guard (BRD rule 6): re-checks derived vacant_count
   * (sanctioned_strength_cached − filled_count_cached − reserved_count) on the vacancy row,
   * inserts the RESERVED reservation and bumps reserved_count atomically;
   * vacant_count <= 0 throws ERR-G05-VACANCY-FULL.
   */
  reserveVacancyWithGuard(
    scope: TenantScope,
    input: { id: string; vacancyPositionId: string; employeeId: string; driveId?: string; reservedAt: string }
  ): VacancyReservation;
  /**
   * Join-time transactional re-check (BRD rule 6): the reservation must be VACATED_ON_RELIEF;
   * a second fill of the same reservation throws ERR-G05-VACANCY-FULL (double-fill).
   */
  fillReservationWithGuard(scope: TenantScope, reservationId: string, joinedOn: string): VacancyReservation;
  updateReservation(reservation: VacancyReservation): void;
  findReservation(scope: TenantScope, reservationId: string): VacancyReservation | undefined;
  listReservations(scope: TenantScope, vacancyPositionId?: string): VacancyReservation[];
  countSessions(): number;
  insertSession(session: CounsellingSession): void;
  updateSession(session: CounsellingSession): void;
  findSession(scope: TenantScope, sessionId: string): CounsellingSession | undefined;
  countChoices(): number;
  /** APPEND-ONLY ledger insert — counselling_choices rows are never updated or deleted. */
  insertChoice(choice: CounsellingChoice): void;
  listChoices(scope: TenantScope, sessionId: string): CounsellingChoice[];
  countMutualRequests(): number;
  insertMutualRequest(request: MutualTransferRequest): void;
  updateMutualRequest(request: MutualTransferRequest): void;
  findMutualRequest(scope: TenantScope, requestId: string): MutualTransferRequest | undefined;
  listMutualRequestsByPair(scope: TenantScope, pairId: string): MutualTransferRequest[];
  countMutualOrders(): number;
  /** Persists BOTH cross-linked coupled orders in one atomic write (both-or-neither). */
  insertCoupledMutualOrders(first: MutualTransferOrder, second: MutualTransferOrder): void;
  updateMutualOrder(order: MutualTransferOrder): void;
  findMutualOrder(scope: TenantScope, orderId: string): MutualTransferOrder | undefined;
  listMutualOrders(scope: TenantScope, pairId?: string): MutualTransferOrder[];
}

function scoped<T extends { tenantId: string; entityId?: string }>(rows: T[], scope: TenantScope): T[] {
  return rows.filter((row) => row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId));
}

/** In-memory implementation (DI default, mirrors InMemoryTransferRepository). */
export class InMemoryCounsellingVacancyRepository implements CounsellingVacancyRepository {
  private readonly vacancyPositions: VacancyPosition[] = [];
  private readonly preferences: TransferPreference[] = [];
  private readonly reservations: VacancyReservation[] = [];
  private readonly sessions: CounsellingSession[] = [];
  /** Append-only: rows are pushed and never mutated or removed (BRD 5.6-10). */
  private readonly choices: CounsellingChoice[] = [];
  private readonly mutualRequests: MutualTransferRequest[] = [];
  private readonly mutualOrders: MutualTransferOrder[] = [];

  countVacancyPositions(): number {
    return this.vacancyPositions.length;
  }

  insertVacancyPosition(position: VacancyPosition): void {
    this.vacancyPositions.push(position);
  }

  updateVacancyPosition(position: VacancyPosition): void {
    const index = this.vacancyPositions.findIndex((row) => row.id === position.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Vacancy position not found");
    }
    this.vacancyPositions[index] = position;
  }

  findVacancyPosition(scope: TenantScope, vacancyPositionId: string): VacancyPosition | undefined {
    return scoped(this.vacancyPositions, scope).find((row) => row.id === vacancyPositionId);
  }

  listVacancyPositions(scope: TenantScope, driveId?: string): VacancyPosition[] {
    return scoped(this.vacancyPositions, scope).filter((row) => !driveId || row.driveId === driveId);
  }

  countPreferences(): number {
    return this.preferences.length;
  }

  replacePreferences(scope: TenantScope, driveId: string, employeeId: string, preferences: TransferPreference[]): void {
    for (let index = this.preferences.length - 1; index >= 0; index -= 1) {
      const row = this.preferences[index];
      if (row && row.tenantId === scope.tenantId && row.driveId === driveId && row.employeeId === employeeId) {
        this.preferences.splice(index, 1);
      }
    }
    this.preferences.push(...preferences);
  }

  updatePreference(preference: TransferPreference): void {
    const index = this.preferences.findIndex((row) => row.id === preference.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Transfer preference not found");
    }
    this.preferences[index] = preference;
  }

  listPreferences(scope: TenantScope, driveId: string, employeeId: string): TransferPreference[] {
    return scoped(this.preferences, scope)
      .filter((row) => row.driveId === driveId && row.employeeId === employeeId)
      .sort((a, b) => a.preferenceRank - b.preferenceRank);
  }

  countReservations(): number {
    return this.reservations.length;
  }

  reserveVacancyWithGuard(
    scope: TenantScope,
    input: { id: string; vacancyPositionId: string; employeeId: string; driveId?: string; reservedAt: string }
  ): VacancyReservation {
    const position = this.findVacancyPosition(scope, input.vacancyPositionId);
    if (!position) {
      throw new FoundationError("NOT_FOUND", "Vacancy position not found");
    }
    // Transactional re-check on the derived count (sanctioned − filled − reserved): this
    // check-and-write is a single synchronous operation — the in-memory analogue of the
    // Postgres row-locked transaction below.
    const vacantCount = position.sanctionedStrengthCached - position.filledCountCached - position.reservedCount;
    if (vacantCount <= 0) {
      throw new FoundationError("ERR-G05-VACANCY-FULL", "Vacancy has no remaining capacity — over-allotment rejected", {
        details: {
          vacancyPositionId: position.id,
          sanctionedStrength: position.sanctionedStrengthCached,
          filledCount: position.filledCountCached,
          reservedCount: position.reservedCount,
        },
      });
    }
    const reservation: VacancyReservation = {
      id: input.id,
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      vacancyPositionId: input.vacancyPositionId,
      employeeId: input.employeeId,
      driveId: input.driveId,
      lifecycleState: "RESERVED",
      reservedAt: input.reservedAt,
    };
    this.reservations.push(reservation);
    position.reservedCount += 1;
    return { ...reservation };
  }

  fillReservationWithGuard(scope: TenantScope, reservationId: string, joinedOn: string): VacancyReservation {
    const reservation = this.findReservation(scope, reservationId);
    if (!reservation) {
      throw new FoundationError("NOT_FOUND", "Vacancy reservation not found");
    }
    if (reservation.lifecycleState === "FILLED_ON_JOIN") {
      // Join-time double-fill fails closed (BRD rule 6 / FR-010).
      throw new FoundationError("ERR-G05-VACANCY-FULL", "Reservation already filled on join — double-fill rejected", {
        details: { reservationId, lifecycleState: reservation.lifecycleState },
      });
    }
    if (reservation.lifecycleState !== "VACATED_ON_RELIEF") {
      throw new FoundationError("PRECONDITION_FAILED", "Reservation must be VACATED_ON_RELIEF before FILLED_ON_JOIN", {
        details: { reservationId, lifecycleState: reservation.lifecycleState },
      });
    }
    reservation.lifecycleState = "FILLED_ON_JOIN";
    reservation.filledAt = joinedOn;
    return { ...reservation };
  }

  updateReservation(reservation: VacancyReservation): void {
    const index = this.reservations.findIndex((row) => row.id === reservation.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Vacancy reservation not found");
    }
    this.reservations[index] = reservation;
  }

  findReservation(scope: TenantScope, reservationId: string): VacancyReservation | undefined {
    return scoped(this.reservations, scope).find((row) => row.id === reservationId);
  }

  listReservations(scope: TenantScope, vacancyPositionId?: string): VacancyReservation[] {
    return scoped(this.reservations, scope)
      .filter((row) => !vacancyPositionId || row.vacancyPositionId === vacancyPositionId)
      .map((row) => ({ ...row }));
  }

  countSessions(): number {
    return this.sessions.length;
  }

  insertSession(session: CounsellingSession): void {
    this.sessions.push(session);
  }

  updateSession(session: CounsellingSession): void {
    const index = this.sessions.findIndex((row) => row.id === session.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Counselling session not found");
    }
    this.sessions[index] = session;
  }

  findSession(scope: TenantScope, sessionId: string): CounsellingSession | undefined {
    return scoped(this.sessions, scope).find((row) => row.id === sessionId);
  }

  countChoices(): number {
    return this.choices.length;
  }

  insertChoice(choice: CounsellingChoice): void {
    // Append-only ledger: the interface exposes no update/delete for counselling_choices.
    this.choices.push({ ...choice });
  }

  listChoices(scope: TenantScope, sessionId: string): CounsellingChoice[] {
    return scoped(this.choices, scope)
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({ ...row }));
  }

  countMutualRequests(): number {
    return this.mutualRequests.length;
  }

  insertMutualRequest(request: MutualTransferRequest): void {
    this.mutualRequests.push(request);
  }

  updateMutualRequest(request: MutualTransferRequest): void {
    const index = this.mutualRequests.findIndex((row) => row.id === request.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Mutual transfer request not found");
    }
    this.mutualRequests[index] = request;
  }

  findMutualRequest(scope: TenantScope, requestId: string): MutualTransferRequest | undefined {
    return scoped(this.mutualRequests, scope).find((row) => row.id === requestId);
  }

  listMutualRequestsByPair(scope: TenantScope, pairId: string): MutualTransferRequest[] {
    return scoped(this.mutualRequests, scope).filter((row) => row.pairId === pairId);
  }

  countMutualOrders(): number {
    return this.mutualOrders.length;
  }

  insertCoupledMutualOrders(first: MutualTransferOrder, second: MutualTransferOrder): void {
    if (first.mutualPairOrderId !== second.id || second.mutualPairOrderId !== first.id) {
      throw new FoundationError("ERR-G05-MUTUAL-PAIR", "Coupled orders must cross-link mutual_pair_order_id", {
        details: { firstOrderId: first.id, secondOrderId: second.id },
      });
    }
    // Single synchronous push of both rows — the in-memory analogue of the one-transaction
    // coupled INSERT in Postgres (both-or-neither).
    this.mutualOrders.push(first, second);
  }

  updateMutualOrder(order: MutualTransferOrder): void {
    const index = this.mutualOrders.findIndex((row) => row.id === order.id);
    if (index < 0) {
      throw new FoundationError("NOT_FOUND", "Mutual transfer order not found");
    }
    this.mutualOrders[index] = order;
  }

  findMutualOrder(scope: TenantScope, orderId: string): MutualTransferOrder | undefined {
    return scoped(this.mutualOrders, scope).find((row) => row.id === orderId);
  }

  listMutualOrders(scope: TenantScope, pairId?: string): MutualTransferOrder[] {
    return scoped(this.mutualOrders, scope)
      .filter((row) => !pairId || row.pairId === pairId)
      .map((row) => ({ ...row }));
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over the frozen G05 data model (docs/data-model/05-*.sql,
// migrations 0003 + 0031). All SQL is parameterised ($1, $2, ...); the allotment guard,
// join-time re-check, and coupled-order insert each run inside a single transaction.
// ---------------------------------------------------------------------------------------

export interface VacancyPositionRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  org_unit_id: string;
  designation_id: string;
  sanctioned_strength_cached: number;
  filled_count_cached: number;
  reserved_count: number;
  strength_source: string;
  is_published: boolean;
}

export interface VacancyReservationRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  vacancy_position_id: string;
  employee_id: string;
  drive_id: string | null;
  lifecycle_state: string;
  reserved_at: Date;
  vacated_at: Date | null;
  filled_at: Date | null;
}

export interface CounsellingChoiceRow {
  id: string;
  tenant_id: string;
  entity_id: string;
  session_id: string;
  employee_id: string;
  turn_position: number;
  vacancy_position_id: string | null;
  choice_action: string;
  choice_made_at: Date;
  recorded_by: string;
}

const INSERT_VACANCY_POSITION =
  "INSERT INTO vacancy_positions (tenant_id, entity_id, org_unit_id, designation_id, cadre, sanctioned_strength_cached, filled_count_cached, strength_as_of, strength_source, drive_id, is_published) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) " +
  "RETURNING id, tenant_id, entity_id, org_unit_id, designation_id, sanctioned_strength_cached, filled_count_cached, reserved_count, strength_source, is_published";

const LOCK_VACANCY_POSITION =
  "SELECT id, sanctioned_strength_cached, filled_count_cached, reserved_count FROM vacancy_positions " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const BUMP_VACANCY_RESERVED_COUNT =
  "UPDATE vacancy_positions SET reserved_count = reserved_count + 1, updated_at = now() WHERE id = $1";

const REFRESH_VACANCY_STRENGTH =
  "UPDATE vacancy_positions SET sanctioned_strength_cached = $3, filled_count_cached = $4, strength_as_of = $5, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

const INSERT_VACANCY_RESERVATION =
  "INSERT INTO vacancy_reservations (tenant_id, entity_id, vacancy_position_id, employee_id, drive_id, lifecycle_state, reserved_at) " +
  "VALUES ($1, $2, $3, $4, $5, 'RESERVED', $6) " +
  "RETURNING id, tenant_id, entity_id, vacancy_position_id, employee_id, drive_id, lifecycle_state, reserved_at, vacated_at, filled_at";

const LOCK_VACANCY_RESERVATION =
  "SELECT id, lifecycle_state FROM vacancy_reservations WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const VACATE_VACANCY_RESERVATION =
  "UPDATE vacancy_reservations SET lifecycle_state = 'VACATED_ON_RELIEF', vacated_at = $3, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, vacancy_position_id, employee_id, drive_id, lifecycle_state, reserved_at, vacated_at, filled_at";

const FILL_VACANCY_RESERVATION =
  "UPDATE vacancy_reservations SET lifecycle_state = 'FILLED_ON_JOIN', filled_at = $3, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false " +
  "RETURNING id, tenant_id, entity_id, vacancy_position_id, employee_id, drive_id, lifecycle_state, reserved_at, vacated_at, filled_at";

const INSERT_TRANSFER_PREFERENCE =
  "INSERT INTO transfer_preferences (tenant_id, entity_id, drive_id, employee_id, preference_rank, preferred_org_unit_id, vacancy_position_id, seniority_score) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
  "RETURNING id, tenant_id, entity_id, drive_id, employee_id, preference_rank, preferred_org_unit_id, vacancy_position_id, allotted, seniority_score";

const SOFT_DELETE_PREFERENCES =
  "UPDATE transfer_preferences SET is_deleted = true, updated_at = now() WHERE tenant_id = $1 AND drive_id = $2 AND employee_id = $3 AND is_deleted = false";

const INSERT_COUNSELLING_SESSION =
  "INSERT INTO counselling_sessions (tenant_id, entity_id, session_code, drive_id, scheduled_at, turn_order_method, turn_timeout_seconds, presiding_officer_id, total_candidates) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
  "RETURNING id, tenant_id, entity_id, session_code, status, turn_timeout_seconds, current_turn_employee_id";

const SET_SESSION_TURN =
  "UPDATE counselling_sessions SET status = $3, current_turn_employee_id = $4, current_turn_started_at = $5, completed_candidates = $6, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false " +
  "RETURNING id, status, current_turn_employee_id, current_turn_started_at, completed_candidates";

const INSERT_COUNSELLING_CHOICE =
  // APPEND-ONLY (BRD 5.6-10): the ledger has INSERT + SELECT statements only — no UPDATE, no DELETE.
  "INSERT INTO counselling_choices (tenant_id, entity_id, session_id, employee_id, turn_position, vacancy_position_id, choice_action, choice_made_at, recorded_by, remarks) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) " +
  "RETURNING id, tenant_id, entity_id, session_id, employee_id, turn_position, vacancy_position_id, choice_action, choice_made_at, recorded_by";

const SELECT_COUNSELLING_CHOICES =
  "SELECT id, tenant_id, entity_id, session_id, employee_id, turn_position, vacancy_position_id, choice_action, choice_made_at, recorded_by " +
  "FROM counselling_choices WHERE tenant_id = $1 AND session_id = $2 ORDER BY turn_position";

const INSERT_MUTUAL_ORDER =
  "INSERT INTO transfer_orders (tenant_id, entity_id, order_no, order_class, employee_id, transfer_type, source_org_unit_id, dest_org_unit_id, source_designation_id, dest_designation_id, order_date, relieve_by_date, status) " +
  "VALUES ($1, $2, $3, $4, $5, 'MUTUAL', $6, $7, $8, $9, $10, $11, $12) " +
  "RETURNING id";

const CROSS_LINK_MUTUAL_ORDER =
  "UPDATE transfer_orders SET mutual_pair_order_id = $2, updated_at = now() WHERE id = $1";

/**
 * Postgres-backed counselling/vacancy repository over the frozen tables vacancy_positions,
 * transfer_preferences, vacancy_reservations, counselling_sessions, counselling_choices
 * (migration 0031) and the mutual columns of transfer_orders (migration 0003).
 */
export class PgCounsellingVacancyRepository {
  constructor(private readonly pool: Pool) {}

  async insertVacancyPosition(input: {
    tenantId: string;
    entityId: string;
    orgUnitId: string;
    designationId: string;
    cadre?: string;
    sanctionedStrengthCached: number;
    filledCountCached: number;
    strengthAsOf: string;
    strengthSource: string;
    driveId?: string;
    isPublished: boolean;
  }): Promise<VacancyPositionRow> {
    const result = await this.pool.query(INSERT_VACANCY_POSITION, [
      input.tenantId,
      input.entityId,
      input.orgUnitId,
      input.designationId,
      input.cadre ?? null,
      input.sanctionedStrengthCached,
      input.filledCountCached,
      input.strengthAsOf,
      input.strengthSource,
      input.driveId ?? null,
      input.isPublished,
    ]);
    return result.rows[0] as VacancyPositionRow;
  }

  /** Strength read-through refresh — G05 caches, the sanctioned-posts kernel stays authoritative. */
  async refreshVacancyStrength(input: {
    tenantId: string;
    vacancyPositionId: string;
    sanctionedStrength: number;
    filledCount: number;
    strengthAsOf: string;
  }): Promise<void> {
    await this.pool.query(REFRESH_VACANCY_STRENGTH, [
      input.tenantId,
      input.vacancyPositionId,
      input.sanctionedStrength,
      input.filledCount,
      input.strengthAsOf,
    ]);
  }

  /**
   * Transactional allotment guard (BRD rule 6): locks the vacancy row (SELECT ... FOR UPDATE),
   * re-checks the DERIVED vacant_count, inserts the RESERVED reservation, and bumps
   * reserved_count — all in ONE transaction. Over-allotment throws ERR-G05-VACANCY-FULL.
   */
  async reserveVacancyWithGuard(input: {
    tenantId: string;
    entityId: string;
    vacancyPositionId: string;
    employeeId: string;
    driveId?: string;
    reservedAt: string;
  }): Promise<VacancyReservationRow> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_VACANCY_POSITION, [input.tenantId, input.vacancyPositionId]);
      const position = locked.rows[0] as
        | { id: string; sanctioned_strength_cached: number; filled_count_cached: number; reserved_count: number }
        | undefined;
      if (!position) {
        throw new FoundationError("NOT_FOUND", "Vacancy position not found");
      }
      const vacantCount = Number(position.sanctioned_strength_cached) - Number(position.filled_count_cached) - Number(position.reserved_count);
      if (vacantCount <= 0) {
        throw new FoundationError("ERR-G05-VACANCY-FULL", "Vacancy has no remaining capacity — over-allotment rejected", {
          details: { vacancyPositionId: input.vacancyPositionId, vacantCount },
        });
      }
      const inserted = await client.query(INSERT_VACANCY_RESERVATION, [
        input.tenantId,
        input.entityId,
        input.vacancyPositionId,
        input.employeeId,
        input.driveId ?? null,
        input.reservedAt,
      ]);
      await client.query(BUMP_VACANCY_RESERVED_COUNT, [position.id]);
      return inserted.rows[0] as VacancyReservationRow;
    });
  }

  /** RESERVED → VACATED_ON_RELIEF under a row lock. */
  async vacateReservationOnRelief(input: { tenantId: string; reservationId: string; vacatedAt: string }): Promise<VacancyReservationRow> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_VACANCY_RESERVATION, [input.tenantId, input.reservationId]);
      const row = locked.rows[0] as { id: string; lifecycle_state: string } | undefined;
      if (!row) {
        throw new FoundationError("NOT_FOUND", "Vacancy reservation not found");
      }
      if (row.lifecycle_state !== "RESERVED") {
        throw new FoundationError("PRECONDITION_FAILED", "Only a RESERVED reservation can be vacated on relief", {
          details: { reservationId: input.reservationId, lifecycleState: row.lifecycle_state },
        });
      }
      const updated = await client.query(VACATE_VACANCY_RESERVATION, [input.tenantId, input.reservationId, input.vacatedAt]);
      return updated.rows[0] as VacancyReservationRow;
    });
  }

  /**
   * Join-time transactional re-check (BRD rule 6): locks the reservation row; a second fill
   * throws ERR-G05-VACANCY-FULL (double-fill fails closed).
   */
  async fillReservationWithGuard(input: { tenantId: string; reservationId: string; filledAt: string }): Promise<VacancyReservationRow> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_VACANCY_RESERVATION, [input.tenantId, input.reservationId]);
      const row = locked.rows[0] as { id: string; lifecycle_state: string } | undefined;
      if (!row) {
        throw new FoundationError("NOT_FOUND", "Vacancy reservation not found");
      }
      if (row.lifecycle_state === "FILLED_ON_JOIN") {
        throw new FoundationError("ERR-G05-VACANCY-FULL", "Reservation already filled on join — double-fill rejected", {
          details: { reservationId: input.reservationId },
        });
      }
      if (row.lifecycle_state !== "VACATED_ON_RELIEF") {
        throw new FoundationError("PRECONDITION_FAILED", "Reservation must be VACATED_ON_RELIEF before FILLED_ON_JOIN", {
          details: { reservationId: input.reservationId, lifecycleState: row.lifecycle_state },
        });
      }
      const updated = await client.query(FILL_VACANCY_RESERVATION, [input.tenantId, input.reservationId, input.filledAt]);
      return updated.rows[0] as VacancyReservationRow;
    });
  }

  /** Replaces the ranked preference set for (drive, employee) in one transaction. */
  async replacePreferences(input: {
    tenantId: string;
    entityId: string;
    driveId: string;
    employeeId: string;
    preferences: { preferenceRank: number; preferredOrgUnitId: string; vacancyPositionId?: string; seniorityScore?: number }[];
  }): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(SOFT_DELETE_PREFERENCES, [input.tenantId, input.driveId, input.employeeId]);
      for (const preference of input.preferences) {
        await client.query(INSERT_TRANSFER_PREFERENCE, [
          input.tenantId,
          input.entityId,
          input.driveId,
          input.employeeId,
          preference.preferenceRank,
          preference.preferredOrgUnitId,
          preference.vacancyPositionId ?? null,
          preference.seniorityScore ?? null,
        ]);
      }
    });
  }

  async insertCounsellingSession(input: {
    tenantId: string;
    entityId: string;
    sessionCode: string;
    driveId: string;
    scheduledAt: string;
    turnOrderMethod: string;
    turnTimeoutSeconds: number;
    presidingOfficerId: string;
    totalCandidates: number;
  }): Promise<{ sessionId: string }> {
    const result = await this.pool.query(INSERT_COUNSELLING_SESSION, [
      input.tenantId,
      input.entityId,
      input.sessionCode,
      input.driveId,
      input.scheduledAt,
      input.turnOrderMethod,
      input.turnTimeoutSeconds,
      input.presidingOfficerId,
      input.totalCandidates,
    ]);
    return { sessionId: (result.rows[0] as { id: string }).id };
  }

  /** Writes the live-turn vacancy lock holder (current_turn_employee_id) and progress counters. */
  async setSessionTurn(input: {
    tenantId: string;
    sessionId: string;
    status: string;
    currentTurnEmployeeId?: string;
    currentTurnStartedAt?: string;
    completedCandidates: number;
  }): Promise<void> {
    const result = await this.pool.query(SET_SESSION_TURN, [
      input.tenantId,
      input.sessionId,
      input.status,
      input.currentTurnEmployeeId ?? null,
      input.currentTurnStartedAt ?? null,
      input.completedCandidates,
    ]);
    if (!result.rows[0]) {
      throw new FoundationError("NOT_FOUND", "Counselling session not found");
    }
  }

  /** APPEND-ONLY ledger insert — this repository ships no UPDATE/DELETE for counselling_choices. */
  async insertCounsellingChoice(input: {
    tenantId: string;
    entityId: string;
    sessionId: string;
    employeeId: string;
    turnPosition: number;
    vacancyPositionId?: string;
    choiceAction: string;
    choiceMadeAt: string;
    recordedBy: string;
    remarks?: string;
  }): Promise<CounsellingChoiceRow> {
    const result = await this.pool.query(INSERT_COUNSELLING_CHOICE, [
      input.tenantId,
      input.entityId,
      input.sessionId,
      input.employeeId,
      input.turnPosition,
      input.vacancyPositionId ?? null,
      input.choiceAction,
      input.choiceMadeAt,
      input.recordedBy,
      input.remarks ?? null,
    ]);
    return result.rows[0] as CounsellingChoiceRow;
  }

  async listCounsellingChoices(tenantId: string, sessionId: string): Promise<CounsellingChoiceRow[]> {
    const result = await this.pool.query(SELECT_COUNSELLING_CHOICES, [tenantId, sessionId]);
    return result.rows as CounsellingChoiceRow[];
  }

  /**
   * Coupled mutual publish (BRD rule 5): inserts BOTH transfer_orders rows and cross-links
   * mutual_pair_order_id in ONE transaction — both-or-neither, never a lone half of the pair.
   */
  async insertCoupledMutualOrders(input: {
    tenantId: string;
    entityId: string;
    orderDate: string;
    relieveByDate: string;
    status: string;
    orderClass: string;
    sides: [
      { orderNo: string; employeeId: string; sourceOrgUnitId: string; destOrgUnitId: string; sourceDesignationId: string; destDesignationId: string },
      { orderNo: string; employeeId: string; sourceOrgUnitId: string; destOrgUnitId: string; sourceDesignationId: string; destDesignationId: string }
    ];
  }): Promise<{ firstOrderId: string; secondOrderId: string }> {
    return withTransaction(this.pool, async (client) => {
      const ids: string[] = [];
      for (const side of input.sides) {
        const inserted = await client.query(INSERT_MUTUAL_ORDER, [
          input.tenantId,
          input.entityId,
          side.orderNo,
          input.orderClass,
          side.employeeId,
          side.sourceOrgUnitId,
          side.destOrgUnitId,
          side.sourceDesignationId,
          side.destDesignationId,
          input.orderDate,
          input.relieveByDate,
          input.status,
        ]);
        ids.push((inserted.rows[0] as { id: string }).id);
      }
      const [firstOrderId, secondOrderId] = ids;
      if (!firstOrderId || !secondOrderId) {
        // Defensive: RETURNING id always yields one row per INSERT; missing ids abort the pair.
        throw new FoundationError("ERR-G05-MUTUAL-PAIR", "Coupled mutual order insert did not return both ids");
      }
      await client.query(CROSS_LINK_MUTUAL_ORDER, [firstOrderId, secondOrderId]);
      await client.query(CROSS_LINK_MUTUAL_ORDER, [secondOrderId, firstOrderId]);
      return { firstOrderId, secondOrderId };
    });
  }
}
