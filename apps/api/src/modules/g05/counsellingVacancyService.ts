import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, nextId, TenantScope } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { EstablishmentQslRepository } from "../g06/establishmentQslRepository";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { CounsellingVacancyRepository } from "./counsellingVacancyRepository";

/**
 * PH-16D — G05 FR-G05-003 (vacancy publication, ranked preferences, reservation lifecycle),
 * FR-G05-019 (interactive counselling turn engine with vacancy lock + immutable choice log),
 * and BRD rules 5/6 (mutual coupling, vacancy lifecycle with strength read-through).
 *
 * Strength is a READ-THROUGH from the PH-08A sanctioned-posts kernel (G06 g06_sanctioned_posts):
 * vacancy_positions only caches sanctioned_strength/filled_count; vacant_count is DERIVED at
 * read (sanctioned − filled − reserved) and G05 never mutates a local strength counter as
 * truth (BRD G05 §5.2.7).
 */

// --- frozen g05_* domains (docs/data-model/05-G05 §1 / migration 0003+0031) --------------
export type ReservationLifecycleState = "RESERVED" | "VACATED_ON_RELIEF" | "FILLED_ON_JOIN" | "RELEASED" | "EXPIRED";
export type TurnOrderMethod = "SENIORITY" | "MERIT";
export type CounsellingSessionStatus = "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type CounsellingChoiceAction = "CHOSEN" | "PASSED" | "DECLINED" | "AUTO_PASS_TIMEOUT" | "ABSENT";
export type StrengthSource = "G06" | "G01" | "MANUAL_FALLBACK";
export type MutualRequestStatus = "FILED" | "PAIRED" | "ORDERED" | "WITHDRAWN";
export type MutualOrderStatus = "PUBLISHED" | "RELIEVED" | "JOINED" | "CANCELLED";

/** counselling_sessions.turn_timeout_seconds default (frozen DDL default, §5.2.19). */
const DEFAULT_TURN_TIMEOUT_SECONDS = 300;

/** vacancy_positions entity (BRD G05 §5.2.7) — strength read-through cache, never authoritative. */
export interface VacancyPosition {
  id: string;
  tenantId: string;
  entityId?: string;
  orgUnitId: string;
  designationId: string;
  cadre?: string;
  /** Read-through link to the PH-08A g06_sanctioned_posts register row. */
  sanctionedPostId: string;
  sanctionedStrengthCached: number;
  filledCountCached: number;
  /** G05-authoritative drive reservations (the only counter G05 owns). */
  reservedCount: number;
  strengthAsOf: string;
  strengthSource: StrengthSource;
  driveId?: string;
  isPublished: boolean;
}

/** vacant_count is DERIVED at read — never stored, never free-entered (BRD §5.2.7). */
export interface VacancyPositionView extends VacancyPosition {
  vacantCount: number;
}

/** transfer_preferences entity (BRD G05 §5.2.6) — ranked counselling preference list. */
export interface TransferPreference {
  id: string;
  tenantId: string;
  entityId?: string;
  driveId: string;
  employeeId: string;
  preferenceRank: number;
  preferredOrgUnitId: string;
  vacancyPositionId?: string;
  allotted: boolean;
  seniorityScore?: number;
}

/** vacancy_reservations entity (BRD G05 §5.2.16) — RESERVED → VACATED_ON_RELIEF → FILLED_ON_JOIN. */
export interface VacancyReservation {
  id: string;
  tenantId: string;
  entityId?: string;
  vacancyPositionId: string;
  transferOrderId?: string;
  employeeId: string;
  driveId?: string;
  lifecycleState: ReservationLifecycleState;
  reservedAt: string;
  vacatedAt?: string;
  filledAt?: string;
}

/** One ordered candidate in a counselling_sessions turn queue. */
export interface CounsellingCandidate {
  employeeId: string;
  /** Deterministic tie-break key (BRD FR-019: seniority ties broken by service_no). */
  serviceNo: string;
  seniorityScore?: number;
  meritScore?: number;
  turnPosition: number;
}

/** counselling_sessions entity (BRD G05 §5.2.19) — interactive allotment header. */
export interface CounsellingSession {
  id: string;
  tenantId: string;
  entityId?: string;
  sessionCode: string;
  driveId: string;
  scheduledAt: string;
  turnOrderMethod: TurnOrderMethod;
  /** Holds the vacancy lock — only this candidate may choose (one live turn at a time). */
  currentTurnEmployeeId?: string;
  currentTurnStartedAt?: string;
  turnTimeoutSeconds: number;
  status: CounsellingSessionStatus;
  presidingOfficerId: string;
  totalCandidates: number;
  completedCandidates: number;
  queue: CounsellingCandidate[];
}

/** counselling_choices entity (BRD G05 §5.2.20) — immutable append-only choice log (P05). */
export interface CounsellingChoice {
  id: string;
  tenantId: string;
  entityId?: string;
  sessionId: string;
  employeeId: string;
  turnPosition: number;
  vacancyPositionId?: string;
  choiceAction: CounsellingChoiceAction;
  choiceMadeAt: string;
  recordedBy: string;
  remarks?: string;
  createdAt: string;
}

/** transfer_requests (MUTUAL) subset — reciprocal intent carrying mutual_counterpart_employee_id. */
export interface MutualTransferRequest {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  mutualCounterpartEmployeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  status: MutualRequestStatus;
  pairId?: string;
}

/** transfer_orders (MUTUAL) subset — coupled pair cross-linked via mutual_pair_order_id. */
export interface MutualTransferOrder {
  id: string;
  tenantId: string;
  entityId?: string;
  orderNo: string;
  pairId: string;
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  orderDate: string;
  effectiveDate: string;
  /** Reciprocal order id — paired-progress guard (BRD §5.6-5). */
  mutualPairOrderId: string;
  status: MutualOrderStatus;
  relievedOn?: string;
  joinedOn?: string;
  /** G12 SR event id of the frozen-catalog MUTUAL_TRANSFER fact. */
  srEventId: string;
}

export interface CounsellingVacancyOptions {
  /** Injectable clock for JOB-G05-COUNSEL-TIMEOUT semantics (tests never busy-wait). */
  clock?: () => Date;
}

export interface RecordChoiceResult {
  choice: CounsellingChoice;
  /** Present when choiceAction=CHOSEN — the vacancy converted to a RESERVED reservation. */
  reservation?: VacancyReservation;
  session: CounsellingSession;
}

export interface MutualPairApprovalResult {
  orders: [MutualTransferOrder, MutualTransferOrder];
  srEventIds: [string, string];
}

export class TransferCounsellingService {
  private readonly clock: () => Date;

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly serviceRegister: ServiceRegisterService,
    /** PH-08A sanctioned-posts kernel — the authoritative strength source for the read-through. */
    private readonly establishmentQsl: EstablishmentQslRepository,
    private readonly repository: CounsellingVacancyRepository,
    options: CounsellingVacancyOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  // =====================================================================================
  // FR-G05-003 — vacancy publication (strength read-through) + ranked preferences
  // =====================================================================================

  /**
   * Publishes a vacancy_positions row with strength READ THROUGH from the PH-08A
   * sanctioned-posts kernel. G05 caches sanctioned/filled and derives vacant_count at read;
   * it never owns strength (BRD 5.2.7 — strength_source=G06).
   */
  publishVacancyPosition(actor: ActorContext, input: { sanctionedPostId: string; driveId?: string; cadre?: string }): VacancyPositionView {
    this.authorization.check(actor, "g05.vacancy.publish", actor);
    const post = this.establishmentQsl.findSanctionedPost(actor, input.sanctionedPostId);
    if (!post) {
      // Recorded dependency: the read-through source must exist; G05 does not fall back to a local counter.
      throw new FoundationError("NOT_FOUND", "Sanctioned post not found for strength read-through", {
        details: { sanctionedPostId: input.sanctionedPostId, strengthSource: "G06" },
      });
    }
    const position: VacancyPosition = {
      id: nextId("vacancy-position", this.repository.countVacancyPositions()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orgUnitId: post.orgUnitId,
      designationId: post.gradeDesignationId,
      cadre: input.cadre,
      sanctionedPostId: post.id,
      sanctionedStrengthCached: post.sanctionedStrength,
      filledCountCached: post.filledCount,
      reservedCount: 0,
      strengthAsOf: this.clock().toISOString(),
      strengthSource: "G06",
      driveId: input.driveId,
      isPublished: true,
    };
    this.repository.insertVacancyPosition(position);
    this.audit.recordMutation(actor, {
      action: "G05_VACANCY_PUBLISHED",
      subjectRef: `vacancy_positions:${position.id}`,
      metadata: { sanctionedPostId: post.id, strengthSource: "G06", driveId: input.driveId },
    });
    return this.toVacancyView(position);
  }

  /** Read-through view — refreshes the cached strength from the kernel, derives vacant_count. */
  getVacancyPosition(actor: ActorContext, vacancyPositionId: string): VacancyPositionView {
    this.authorization.check(actor, "g05.transfer.read", actor);
    const position = this.requireVacancyPosition(actor, vacancyPositionId);
    this.refreshStrengthReadThrough(actor, position);
    return this.toVacancyView(position);
  }

  listVacancyPositions(actor: ActorContext, driveId?: string): VacancyPositionView[] {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return this.repository
      .listVacancyPositions(actor, driveId)
      .map((position) => this.toVacancyView(position));
  }

  /**
   * Captures the ranked transfer_preferences for (drive, employee): ranks must be unique
   * and contiguous starting at 1 (FR-003 AC3); referenced vacancies must be published (AC1).
   */
  capturePreferences(
    actor: ActorContext,
    input: {
      driveId: string;
      employeeId: string;
      preferences: { preferenceRank: number; preferredOrgUnitId: string; vacancyPositionId?: string; seniorityScore?: number }[];
    }
  ): TransferPreference[] {
    this.authorization.check(actor, "g05.preference.submit", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    if (input.preferences.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one preference is required", { field: "preferences" });
    }
    const ranks = input.preferences.map((preference) => preference.preferenceRank).sort((a, b) => a - b);
    for (let index = 0; index < ranks.length; index += 1) {
      if (ranks[index] !== index + 1) {
        throw new FoundationError("VALIDATION_FAILED", "Preference ranks must be unique and contiguous from 1", {
          field: "preferences",
          details: { ranks },
        });
      }
    }
    for (const preference of input.preferences) {
      if (preference.vacancyPositionId) {
        const position = this.requireVacancyPosition(actor, preference.vacancyPositionId);
        if (!position.isPublished) {
          throw new FoundationError("VALIDATION_FAILED", "Only published vacancies are selectable", {
            field: "vacancyPositionId",
            details: { vacancyPositionId: preference.vacancyPositionId },
          });
        }
      }
    }
    const rows: TransferPreference[] = input.preferences.map((preference, index) => ({
      id: nextId("transfer-preference", this.repository.countPreferences() + index),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      driveId: input.driveId,
      employeeId: input.employeeId,
      preferenceRank: preference.preferenceRank,
      preferredOrgUnitId: preference.preferredOrgUnitId,
      vacancyPositionId: preference.vacancyPositionId,
      allotted: false,
      seniorityScore: preference.seniorityScore,
    }));
    this.repository.replacePreferences(actor, input.driveId, input.employeeId, rows);
    this.audit.recordMutation(actor, {
      action: "G05_PREFERENCES_CAPTURED",
      subjectRef: `transfer_preferences:${input.driveId}:${input.employeeId}`,
      metadata: { driveId: input.driveId, employeeId: input.employeeId, count: rows.length },
    });
    return rows.map((row) => ({ ...row }));
  }

  listPreferences(actor: ActorContext, driveId: string, employeeId: string): TransferPreference[] {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return this.repository.listPreferences(actor, driveId, employeeId);
  }

  // =====================================================================================
  // BRD rule 6 — vacancy_reservations lifecycle with the transactional over-allotment guard
  // =====================================================================================

  /**
   * Allotment writes a vacancy_reservation (RESERVED) rather than mutating a local strength
   * counter. The repository guard re-checks the derived vacant_count transactionally at
   * reservation time; over-allotment throws ERR-G05-VACANCY-FULL (409, fail closed).
   */
  allotVacancy(actor: ActorContext, input: { vacancyPositionId: string; employeeId: string; driveId?: string }): VacancyReservation {
    this.authorization.check(actor, "g05.vacancy.allot", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    const position = this.requireVacancyPosition(actor, input.vacancyPositionId);
    // Strength read-through: refresh the cache from the sanctioned-posts kernel BEFORE the guard.
    this.refreshStrengthReadThrough(actor, position);
    const reservation = this.repository.reserveVacancyWithGuard(actor, {
      id: nextId("vacancy-reservation", this.repository.countReservations()),
      vacancyPositionId: input.vacancyPositionId,
      employeeId: input.employeeId,
      driveId: input.driveId,
      reservedAt: this.clock().toISOString(),
    });
    // FR-003 AC4: a successful allotment marks the matching preference allotted=true.
    if (input.driveId) {
      const preference = this.repository
        .listPreferences(actor, input.driveId, input.employeeId)
        .find((row) => row.vacancyPositionId === input.vacancyPositionId);
      if (preference) {
        preference.allotted = true;
        this.repository.updatePreference(preference);
      }
    }
    this.audit.recordMutation(actor, {
      action: "G05_VACANCY_RESERVED",
      subjectRef: `vacancy_reservations:${reservation.id}`,
      metadata: { vacancyPositionId: input.vacancyPositionId, employeeId: input.employeeId, lifecycleState: reservation.lifecycleState },
    });
    return { ...reservation };
  }

  /** Relieving at the source marks the reservation VACATED_ON_RELIEF (BRD rule 6 / FR-008). */
  markReservationVacatedOnRelief(actor: ActorContext, reservationId: string, input: { vacatedOn: string }): VacancyReservation {
    this.authorization.check(actor, "g05.vacancy.lifecycle", actor);
    const reservation = this.requireReservation(actor, reservationId);
    if (reservation.lifecycleState !== "RESERVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a RESERVED reservation can be vacated on relief", {
        details: { reservationId, lifecycleState: reservation.lifecycleState },
      });
    }
    reservation.lifecycleState = "VACATED_ON_RELIEF";
    reservation.vacatedAt = input.vacatedOn;
    this.repository.updateReservation(reservation);
    this.audit.recordMutation(actor, {
      action: "G05_RESERVATION_VACATED_ON_RELIEF",
      subjectRef: `vacancy_reservations:${reservation.id}`,
      metadata: { vacatedOn: input.vacatedOn },
    });
    return { ...reservation };
  }

  /**
   * Joining re-checks the reservation transactionally and marks it FILLED_ON_JOIN
   * (BRD rule 6 / FR-010). A double-fill (already FILLED_ON_JOIN) throws
   * ERR-G05-VACANCY-FULL — the join-time re-check fails closed.
   */
  markReservationFilledOnJoin(actor: ActorContext, reservationId: string, input: { joinedOn: string }): VacancyReservation {
    this.authorization.check(actor, "g05.vacancy.lifecycle", actor);
    const reservation = this.repository.fillReservationWithGuard(actor, reservationId, input.joinedOn);
    this.audit.recordMutation(actor, {
      action: "G05_RESERVATION_FILLED_ON_JOIN",
      subjectRef: `vacancy_reservations:${reservation.id}`,
      metadata: { joinedOn: input.joinedOn },
    });
    return { ...reservation };
  }

  getReservation(actor: ActorContext, reservationId: string): VacancyReservation {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return { ...this.requireReservation(actor, reservationId) };
  }

  listReservations(actor: ActorContext, vacancyPositionId?: string): VacancyReservation[] {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return this.repository.listReservations(actor, vacancyPositionId);
  }

  // =====================================================================================
  // FR-G05-019 — interactive counselling turn engine with vacancy lock + append-only ledger
  // =====================================================================================

  /**
   * Schedules a counselling_session with a deterministic per-candidate turn order:
   * SENIORITY/MERIT score descending, ties broken by service_no (BRD FR-019 business rule).
   */
  scheduleCounsellingSession(
    actor: ActorContext,
    input: {
      sessionCode: string;
      driveId: string;
      scheduledAt: string;
      turnOrderMethod: TurnOrderMethod;
      presidingOfficerId: string;
      turnTimeoutSeconds?: number;
      candidates: { employeeId: string; seniorityScore?: number; meritScore?: number }[];
    }
  ): CounsellingSession {
    this.authorization.check(actor, "g05.counselling.schedule", actor);
    if (input.candidates.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "At least one candidate is required", { field: "candidates" });
    }
    const resolved = input.candidates.map((candidate) => {
      const employee = this.employeeMaster.getById(actor, candidate.employeeId);
      if (!employee) {
        throw new FoundationError("NOT_FOUND", "Counselling candidate not found", { details: { employeeId: candidate.employeeId } });
      }
      return { ...candidate, serviceNo: employee.serviceNo };
    });
    const scoreOf = (candidate: { seniorityScore?: number; meritScore?: number }): number =>
      (input.turnOrderMethod === "SENIORITY" ? candidate.seniorityScore : candidate.meritScore) ?? 0;
    const queue: CounsellingCandidate[] = resolved
      .slice()
      .sort((a, b) => {
        const byScore = scoreOf(b) - scoreOf(a);
        if (byScore !== 0) {
          return byScore;
        }
        // Deterministic tie-break by service_no (BRD FR-019; §5.6-14 inter_se_tiebreak_key).
        return a.serviceNo < b.serviceNo ? -1 : a.serviceNo > b.serviceNo ? 1 : 0;
      })
      .map((candidate, index) => ({
        employeeId: candidate.employeeId,
        serviceNo: candidate.serviceNo,
        seniorityScore: candidate.seniorityScore,
        meritScore: candidate.meritScore,
        turnPosition: index + 1,
      }));
    const session: CounsellingSession = {
      id: nextId("counselling-session", this.repository.countSessions()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      sessionCode: input.sessionCode,
      driveId: input.driveId,
      scheduledAt: input.scheduledAt,
      turnOrderMethod: input.turnOrderMethod,
      turnTimeoutSeconds: input.turnTimeoutSeconds ?? DEFAULT_TURN_TIMEOUT_SECONDS,
      status: "SCHEDULED",
      presidingOfficerId: input.presidingOfficerId,
      totalCandidates: queue.length,
      completedCandidates: 0,
      queue,
    };
    this.repository.insertSession(session);
    this.audit.recordMutation(actor, {
      action: "G05_COUNSELLING_SCHEDULED",
      subjectRef: `counselling_sessions:${session.id}`,
      metadata: { sessionCode: session.sessionCode, turnOrderMethod: session.turnOrderMethod, totalCandidates: session.totalCandidates },
    });
    return this.cloneSession(session);
  }

  /** Opens the session: the first candidate's turn goes live and takes the vacancy lock. */
  startCounsellingSession(actor: ActorContext, sessionId: string): CounsellingSession {
    this.authorization.check(actor, "g05.counselling.conduct", actor);
    const session = this.requireSession(actor, sessionId);
    if (session.status !== "SCHEDULED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a scheduled session can be started", {
        details: { sessionId, status: session.status },
      });
    }
    session.status = "IN_PROGRESS";
    session.currentTurnEmployeeId = session.queue[0]?.employeeId;
    session.currentTurnStartedAt = this.clock().toISOString();
    this.repository.updateSession(session);
    this.audit.recordMutation(actor, {
      action: "G05_COUNSELLING_STARTED",
      subjectRef: `counselling_sessions:${session.id}`,
      metadata: { currentTurnEmployeeId: session.currentTurnEmployeeId },
    });
    return this.cloneSession(session);
  }

  /**
   * Records one immutable counselling_choices row for the LIVE turn only.
   * current_turn_employee_id holds the vacancy lock — a choice by anyone else throws
   * ERR-G05-COUNSEL-TURN (409). A CHOSEN vacancy converts to a RESERVED vacancy_reservation
   * through the same transactional over-allotment guard (fail closed before the ledger append).
   */
  recordChoice(
    actor: ActorContext,
    sessionId: string,
    input: { employeeId: string; choiceAction: Exclude<CounsellingChoiceAction, "AUTO_PASS_TIMEOUT">; vacancyPositionId?: string; remarks?: string }
  ): RecordChoiceResult {
    this.authorization.check(actor, "g05.counselling.choice", actor);
    const session = this.requireSession(actor, sessionId);
    if (session.status !== "IN_PROGRESS") {
      throw new FoundationError("PRECONDITION_FAILED", "Counselling session is not in progress", {
        details: { sessionId, status: session.status },
      });
    }
    if (input.employeeId !== session.currentTurnEmployeeId) {
      // FR-019 AC1: only the current-turn candidate may choose — one live turn at a time.
      throw new FoundationError("ERR-G05-COUNSEL-TURN", "Choice attempted out of turn", {
        details: { sessionId, employeeId: input.employeeId, currentTurnEmployeeId: session.currentTurnEmployeeId },
      });
    }
    const candidate = session.queue.find((row) => row.employeeId === input.employeeId);
    if (!candidate) {
      throw new FoundationError("NOT_FOUND", "Candidate not in the session turn queue", { details: { employeeId: input.employeeId } });
    }
    let reservation: VacancyReservation | undefined;
    if (input.choiceAction === "CHOSEN") {
      if (!input.vacancyPositionId) {
        throw new FoundationError("VALIDATION_FAILED", "CHOSEN requires a vacancyPositionId", { field: "vacancyPositionId" });
      }
      // FR-019 AC5: the chosen vacancy becomes a RESERVED vacancy_reservation; the guard
      // (ERR-G05-VACANCY-FULL) runs BEFORE the ledger append so the log never records
      // an allotment that failed closed.
      reservation = this.allotVacancy(actor, {
        vacancyPositionId: input.vacancyPositionId,
        employeeId: input.employeeId,
        driveId: session.driveId,
      });
    }
    const choice = this.appendChoice(actor, session, candidate, {
      choiceAction: input.choiceAction,
      vacancyPositionId: input.vacancyPositionId,
      recordedBy: actor.actorUserId ?? session.presidingOfficerId,
      remarks: input.remarks,
    });
    this.advanceTurn(session);
    this.repository.updateSession(session);
    this.audit.recordMutation(actor, {
      action: "G05_COUNSELLING_CHOICE_RECORDED",
      subjectRef: `counselling_choices:${choice.id}`,
      metadata: { sessionId, choiceAction: choice.choiceAction, turnPosition: choice.turnPosition, reservationId: reservation?.id },
    });
    return { choice, reservation, session: this.cloneSession(session) };
  }

  /**
   * JOB-G05-COUNSEL-TIMEOUT semantics: when the live turn has exceeded turn_timeout_seconds
   * (per the injected clock), record an immutable AUTO_PASS_TIMEOUT row and advance the turn.
   */
  sweepTurnTimeout(actor: ActorContext, sessionId: string): { timedOut: boolean; session: CounsellingSession } {
    this.authorization.check(actor, "g05.counselling.conduct", actor);
    const session = this.requireSession(actor, sessionId);
    if (session.status !== "IN_PROGRESS" || !session.currentTurnEmployeeId || !session.currentTurnStartedAt) {
      return { timedOut: false, session: this.cloneSession(session) };
    }
    const elapsedMs = this.clock().getTime() - new Date(session.currentTurnStartedAt).getTime();
    if (elapsedMs < session.turnTimeoutSeconds * 1000) {
      return { timedOut: false, session: this.cloneSession(session) };
    }
    const candidate = session.queue.find((row) => row.employeeId === session.currentTurnEmployeeId);
    if (!candidate) {
      throw new FoundationError("INTERNAL", "Live turn candidate missing from the queue");
    }
    const choice = this.appendChoice(actor, session, candidate, {
      choiceAction: "AUTO_PASS_TIMEOUT",
      recordedBy: session.presidingOfficerId,
      remarks: `Turn timed out after ${session.turnTimeoutSeconds}s (JOB-G05-COUNSEL-TIMEOUT)`,
    });
    this.advanceTurn(session);
    this.repository.updateSession(session);
    this.audit.recordMutation(actor, {
      action: "G05_COUNSELLING_TURN_TIMEOUT",
      subjectRef: `counselling_choices:${choice.id}`,
      metadata: { sessionId, employeeId: candidate.employeeId, turnTimeoutSeconds: session.turnTimeoutSeconds },
    });
    return { timedOut: true, session: this.cloneSession(session) };
  }

  getCounsellingSession(actor: ActorContext, sessionId: string): CounsellingSession {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return this.cloneSession(this.requireSession(actor, sessionId));
  }

  /** Append-only choice ledger read (FR-019 AC5 — exportable, never edited or deleted). */
  listChoices(actor: ActorContext, sessionId: string): CounsellingChoice[] {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return this.repository.listChoices(actor, sessionId);
  }

  // =====================================================================================
  // BRD rule 5 — MUTUAL_TRANSFER reciprocal pairing with both-or-neither coupled orders
  // =====================================================================================

  /** Files one side of a MUTUAL request — mutual_counterpart_employee_id is mandatory (FR-001 AC2). */
  fileMutualRequest(
    actor: ActorContext,
    input: { employeeId: string; mutualCounterpartEmployeeId: string; fromOrgUnitId: string; toOrgUnitId: string }
  ): MutualTransferRequest {
    this.authorization.check(actor, "g05.mutual.request", actor);
    if (!input.mutualCounterpartEmployeeId) {
      throw new FoundationError("VALIDATION_FAILED", "MUTUAL requires mutual_counterpart_employee_id", {
        field: "mutualCounterpartEmployeeId",
      });
    }
    if (input.employeeId === input.mutualCounterpartEmployeeId) {
      throw new FoundationError("VALIDATION_FAILED", "Mutual counterpart must be a different employee", {
        field: "mutualCounterpartEmployeeId",
      });
    }
    for (const employeeId of [input.employeeId, input.mutualCounterpartEmployeeId]) {
      if (!this.employeeMaster.getById(actor, employeeId)) {
        throw new FoundationError("NOT_FOUND", "Employee not found", { details: { employeeId } });
      }
    }
    const request: MutualTransferRequest = {
      id: nextId("mutual-transfer-request", this.repository.countMutualRequests()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      mutualCounterpartEmployeeId: input.mutualCounterpartEmployeeId,
      fromOrgUnitId: input.fromOrgUnitId,
      toOrgUnitId: input.toOrgUnitId,
      status: "FILED",
    };
    this.repository.insertMutualRequest(request);
    this.audit.recordMutation(actor, {
      action: "G05_MUTUAL_REQUEST_FILED",
      subjectRef: `transfer_requests:${request.id}`,
      metadata: { employeeId: request.employeeId, mutualCounterpartEmployeeId: request.mutualCounterpartEmployeeId },
    });
    return { ...request };
  }

  /**
   * Pairs two MUTUAL requests after validating full reciprocity: each names the other as
   * mutual_counterpart_employee_id and the org-unit exchange mirrors. Anything less is
   * asymmetric — ERR-G05-MUTUAL-PAIR (409, BRD rule 5).
   */
  pairMutualRequests(actor: ActorContext, input: { requestId: string; counterpartRequestId: string }): { pairId: string; requests: [MutualTransferRequest, MutualTransferRequest] } {
    this.authorization.check(actor, "g05.mutual.pair", actor);
    const first = this.requireMutualRequest(actor, input.requestId);
    const second = this.requireMutualRequest(actor, input.counterpartRequestId);
    for (const request of [first, second]) {
      if (request.status !== "FILED") {
        throw new FoundationError("PRECONDITION_FAILED", "Only FILED mutual requests can be paired", {
          details: { requestId: request.id, status: request.status },
        });
      }
    }
    const reciprocal =
      first.mutualCounterpartEmployeeId === second.employeeId &&
      second.mutualCounterpartEmployeeId === first.employeeId &&
      first.fromOrgUnitId === second.toOrgUnitId &&
      first.toOrgUnitId === second.fromOrgUnitId;
    if (!reciprocal) {
      throw new FoundationError("ERR-G05-MUTUAL-PAIR", "Mutual requests are not reciprocal", {
        details: {
          requestId: first.id,
          counterpartRequestId: second.id,
          expectedCounterpartEmployeeId: first.mutualCounterpartEmployeeId,
          actualCounterpartEmployeeId: second.employeeId,
        },
      });
    }
    const pairId = nextId("mutual-pair", this.repository.countMutualRequests());
    first.status = "PAIRED";
    first.pairId = pairId;
    second.status = "PAIRED";
    second.pairId = pairId;
    this.repository.updateMutualRequest(first);
    this.repository.updateMutualRequest(second);
    this.audit.recordMutation(actor, {
      action: "G05_MUTUAL_PAIRED",
      subjectRef: `transfer_requests:${first.id}`,
      metadata: { pairId, requestIds: [first.id, second.id] },
    });
    return { pairId, requests: [{ ...first }, { ...second }] };
  }

  /**
   * Approves and publishes BOTH coupled orders atomically (both-or-neither, BRD rule 5 /
   * FR-004 AC5): one repository write inserts the cross-linked pair, and each side posts the
   * frozen G12 catalog SR code MUTUAL_TRANSFER (verbatim — never a module-invented variant).
   */
  approveMutualPair(
    actor: ActorContext,
    pairId: string,
    input: { orderDate: string; effectiveDate: string; idempotencyKey: string }
  ): MutualPairApprovalResult {
    this.authorization.check(actor, "g05.mutual.approve", actor);
    const paired = this.repository.listMutualRequestsByPair(actor, pairId);
    const firstRequest = paired[0];
    const secondRequest = paired[1];
    if (paired.length !== 2 || !firstRequest || !secondRequest || paired.some((request) => request.status !== "PAIRED")) {
      throw new FoundationError("ERR-G05-MUTUAL-PAIR", "Mutual pair is not complete — both reciprocal requests must be PAIRED", {
        details: { pairId, requestStates: paired.map((request) => ({ id: request.id, status: request.status })) },
      });
    }
    const baseCount = this.repository.countMutualOrders();
    const firstOrderId = nextId("mutual-transfer-order", baseCount);
    const secondOrderId = nextId("mutual-transfer-order", baseCount + 1);
    const buildOrder = (request: MutualTransferRequest, orderId: string, pairOrderId: string, seq: number): MutualTransferOrder => ({
      id: orderId,
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      orderNo: `MTO/${input.orderDate.slice(0, 4)}/${String(baseCount + seq + 1).padStart(5, "0")}`,
      pairId,
      employeeId: request.employeeId,
      fromOrgUnitId: request.fromOrgUnitId,
      toOrgUnitId: request.toOrgUnitId,
      orderDate: input.orderDate,
      effectiveDate: input.effectiveDate,
      mutualPairOrderId: pairOrderId,
      status: "PUBLISHED",
      srEventId: "",
    });
    const firstOrder = buildOrder(firstRequest, firstOrderId, secondOrderId, 0);
    const secondOrder = buildOrder(secondRequest, secondOrderId, firstOrderId, 1);
    // Frozen G12 catalog: mutual exchanges post MUTUAL_TRANSFER (BRD R2, cited verbatim).
    const srEventIds: [string, string] = [
      this.postMutualSrEvent(actor, firstOrder, `${input.idempotencyKey}:a`),
      this.postMutualSrEvent(actor, secondOrder, `${input.idempotencyKey}:b`),
    ];
    firstOrder.srEventId = srEventIds[0];
    secondOrder.srEventId = srEventIds[1];
    // Both-or-neither: ONE atomic repository write persists the coupled pair.
    this.repository.insertCoupledMutualOrders(firstOrder, secondOrder);
    firstRequest.status = "ORDERED";
    secondRequest.status = "ORDERED";
    this.repository.updateMutualRequest(firstRequest);
    this.repository.updateMutualRequest(secondRequest);
    this.audit.recordMutation(actor, {
      action: "G05_MUTUAL_PAIR_APPROVED",
      subjectRef: `transfer_orders:${firstOrder.id}`,
      metadata: { pairId, orderIds: [firstOrder.id, secondOrder.id], srEventIds, eventTypeCode: "MUTUAL_TRANSFER" },
    });
    return { orders: [{ ...firstOrder }, { ...secondOrder }], srEventIds };
  }

  /** Records relief for one side of the pair (either side may be relieved first). */
  recordMutualRelief(actor: ActorContext, orderId: string, input: { relievedOn: string }): MutualTransferOrder {
    this.authorization.check(actor, "g05.mutual.progress", actor);
    const order = this.requireMutualOrder(actor, orderId);
    if (order.status !== "PUBLISHED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a published mutual order can be relieved", {
        details: { orderId, status: order.status },
      });
    }
    order.status = "RELIEVED";
    order.relievedOn = input.relievedOn;
    this.repository.updateMutualOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_MUTUAL_RELIEF",
      subjectRef: `transfer_orders:${order.id}`,
      metadata: { pairId: order.pairId, relievedOn: input.relievedOn },
    });
    return { ...order };
  }

  /**
   * Paired-progress guard (BRD §5.6-5): joining one side while the reciprocal order has not
   * been relieved is asymmetric completion — ERR-G05-MUTUAL-PAIR (409).
   */
  recordMutualJoin(actor: ActorContext, orderId: string, input: { joinedOn: string }): MutualTransferOrder {
    this.authorization.check(actor, "g05.mutual.progress", actor);
    const order = this.requireMutualOrder(actor, orderId);
    if (order.status !== "RELIEVED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only a relieved mutual order can be joined", {
        details: { orderId, status: order.status },
      });
    }
    const counterpart = this.requireMutualOrder(actor, order.mutualPairOrderId);
    if (counterpart.status === "PUBLISHED") {
      throw new FoundationError("ERR-G05-MUTUAL-PAIR", "Asymmetric mutual completion — counterpart order has not been relieved", {
        details: { orderId, counterpartOrderId: counterpart.id, counterpartStatus: counterpart.status },
      });
    }
    order.status = "JOINED";
    order.joinedOn = input.joinedOn;
    this.repository.updateMutualOrder(order);
    this.audit.recordMutation(actor, {
      action: "G05_MUTUAL_JOIN",
      subjectRef: `transfer_orders:${order.id}`,
      metadata: { pairId: order.pairId, joinedOn: input.joinedOn },
    });
    return { ...order };
  }

  getMutualOrder(actor: ActorContext, orderId: string): MutualTransferOrder {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return { ...this.requireMutualOrder(actor, orderId) };
  }

  listMutualOrders(actor: ActorContext, pairId?: string): MutualTransferOrder[] {
    this.authorization.check(actor, "g05.transfer.read", actor);
    return this.repository.listMutualOrders(actor, pairId);
  }

  // =====================================================================================
  // internals
  // =====================================================================================

  private postMutualSrEvent(actor: ActorContext, order: MutualTransferOrder, idempotencyKey: string): string {
    const result = this.serviceRegister.ingest(actor, idempotencyKey, {
      sourceModule: "G05",
      sourceReferenceId: `g05_transfer_orders:${order.id}`,
      sourceEventVersion: 1,
      employeeId: order.employeeId,
      eventTypeCode: "MUTUAL_TRANSFER",
      eventDate: order.effectiveDate,
      factKey: `EMP:${order.employeeId}|CAT:MUTUAL_TRANSFER|ORDER:${order.orderNo}|EFF:${order.effectiveDate}`,
      orderNo: order.orderNo,
      payload: {
        order_no: order.orderNo,
        from_unit: order.fromOrgUnitId,
        to_unit: order.toOrgUnitId,
        effective_date: order.effectiveDate,
        mutual_pair_order_id: order.mutualPairOrderId,
      },
    });
    return result.event.id;
  }

  private appendChoice(
    actor: ActorContext,
    session: CounsellingSession,
    candidate: CounsellingCandidate,
    input: { choiceAction: CounsellingChoiceAction; vacancyPositionId?: string; recordedBy: string; remarks?: string }
  ): CounsellingChoice {
    const now = this.clock().toISOString();
    const choice: CounsellingChoice = {
      id: nextId("counselling-choice", this.repository.countChoices()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      sessionId: session.id,
      employeeId: candidate.employeeId,
      turnPosition: candidate.turnPosition,
      vacancyPositionId: input.vacancyPositionId,
      choiceAction: input.choiceAction,
      choiceMadeAt: now,
      recordedBy: input.recordedBy,
      remarks: input.remarks,
      createdAt: now,
    };
    // counselling_choices is APPEND-ONLY (BRD 5.6-10): the repository exposes insert + list only.
    this.repository.insertChoice(choice);
    return choice;
  }

  /** Advances the live turn to the next queued candidate; completes the session at queue end. */
  private advanceTurn(session: CounsellingSession): void {
    session.completedCandidates += 1;
    const current = session.queue.find((row) => row.employeeId === session.currentTurnEmployeeId);
    const next = current ? session.queue.find((row) => row.turnPosition === current.turnPosition + 1) : undefined;
    if (next) {
      session.currentTurnEmployeeId = next.employeeId;
      session.currentTurnStartedAt = this.clock().toISOString();
    } else {
      session.currentTurnEmployeeId = undefined;
      session.currentTurnStartedAt = undefined;
      session.status = "COMPLETED";
    }
  }

  /** Read-through refresh: the sanctioned-posts kernel stays authoritative for strength. */
  private refreshStrengthReadThrough(scope: TenantScope, position: VacancyPosition): void {
    const post = this.establishmentQsl.findSanctionedPost(scope, position.sanctionedPostId);
    if (!post) {
      throw new FoundationError("NOT_FOUND", "Sanctioned post no longer available for strength read-through", {
        details: { sanctionedPostId: position.sanctionedPostId, vacancyPositionId: position.id },
      });
    }
    position.sanctionedStrengthCached = post.sanctionedStrength;
    position.filledCountCached = post.filledCount;
    position.strengthAsOf = this.clock().toISOString();
    this.repository.updateVacancyPosition(position);
  }

  private toVacancyView(position: VacancyPosition): VacancyPositionView {
    return {
      ...position,
      // Derived at read (BRD §5.2.7): sanctioned − filled − reserved. Never stored.
      vacantCount: position.sanctionedStrengthCached - position.filledCountCached - position.reservedCount,
    };
  }

  private cloneSession(session: CounsellingSession): CounsellingSession {
    return { ...session, queue: session.queue.map((candidate) => ({ ...candidate })) };
  }

  private requireVacancyPosition(scope: TenantScope, vacancyPositionId: string): VacancyPosition {
    const position = this.repository.findVacancyPosition(scope, vacancyPositionId);
    if (!position) {
      throw new FoundationError("NOT_FOUND", "Vacancy position not found");
    }
    return position;
  }

  private requireReservation(scope: TenantScope, reservationId: string): VacancyReservation {
    const reservation = this.repository.findReservation(scope, reservationId);
    if (!reservation) {
      throw new FoundationError("NOT_FOUND", "Vacancy reservation not found");
    }
    return reservation;
  }

  private requireSession(scope: TenantScope, sessionId: string): CounsellingSession {
    const session = this.repository.findSession(scope, sessionId);
    if (!session) {
      throw new FoundationError("NOT_FOUND", "Counselling session not found");
    }
    return session;
  }

  private requireMutualRequest(scope: TenantScope, requestId: string): MutualTransferRequest {
    const request = this.repository.findMutualRequest(scope, requestId);
    if (!request) {
      throw new FoundationError("NOT_FOUND", "Mutual transfer request not found");
    }
    return request;
  }

  private requireMutualOrder(scope: TenantScope, orderId: string): MutualTransferOrder {
    const order = this.repository.findMutualOrder(scope, orderId);
    if (!order) {
      throw new FoundationError("NOT_FOUND", "Mutual transfer order not found");
    }
    return order;
  }
}
