import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";

/**
 * PH-08C G06 depth entities (docs/brd/v3/G06-promotion-posting-progression.md):
 *   (1) reservation_rosters + roster_points (§5.2.16/§5.2.17, FR-PPP-006) — category occupation
 *       with own-merit migration (§5.6-6: own-merit fill occupies an unreserved point with
 *       adjusted_against_category=GEN, never consumes a reserved point);
 *   (2) promotion_refusals (§5.2.32, FR-PPP-019) — refusal consequences: debarment window
 *       (debarment_until) + macp_clock_effect; re-consideration in-window is EMPLOYEE_DEBARRED;
 *   (3) probation_records (§5.2.12, §5.6-11) — auto-created when a promotion order is effected,
 *       scheduled_end = probation_start + probation_months, status ON_PROBATION;
 *   (4) legal_case_links (§5.2.29, FR-PPP-017) — sub-judice handling: an active interim stay
 *       blocks effecting (§5.6-20, ENTITY_SUB_JUDICE).
 * Follows the PH-06A/PH-08A repository pattern: sync interface + in-memory impl (DI default),
 * a durable file-backed impl, and a Postgres impl over migration 0010 (parameterised SQL only).
 */

export type ReservationCategory = "GEN" | "SC" | "ST" | "OBC" | "EWS" | "PWBD";
export type RosterType = "PROMOTION_RESERVATION" | "DIRECT_RECRUITMENT" | "POST_BASED" | "VACANCY_BASED";
export type RosterPointStatus = "VACANT" | "FILLED" | "CARRIED_FORWARD" | "DE_RESERVED" | "INTERCHANGED";
export type ConsequentialSeniorityMode = "CONSEQUENTIAL" | "CATCH_UP";
export type MacpClockEffect = "NONE" | "STOP" | "FORFEIT_NEXT" | "RESET";
export type RefusalStatus = "ACTIVE" | "EXPIRED" | "WAIVED";
export type ProbationStatus = "ON_PROBATION" | "EXTENDED" | "DECLARED_SATISFACTORY" | "REVERTED" | "DISCHARGED";
export type LegalLinkedEntityType = "PROMOTION_CASE" | "PROMOTION_ORDER" | "SENIORITY_LIST" | "ROSTER" | "CANDIDATE";
export type LegalForum = "CAT" | "HIGH_COURT" | "SUPREME_COURT" | "TRIBUNAL_OTHER";
export type LegalStatus = "FILED" | "INTERIM_STAYED" | "PENDING" | "DISPOSED_FAVOURABLE" | "DISPOSED_ADVERSE";

// -----------------------------------------------------------------------------------------
// PH-15F FR-PPP-020 (§5.2.28 seniority_quota_rules + §5.2.2 stream/slot fields): multi-stream
// rota-quota combined seniority construction with a retrievable rotation trace.
// -----------------------------------------------------------------------------------------

/** g06_rotation_method: ROTA_QUOTA slot-by-slot; RUNNING_ACCOUNT reconciles deficiencies; SEPARATE_STREAM no interleave. */
export type RotationMethod = "ROTA_QUOTA" | "RUNNING_ACCOUNT" | "SEPARATE_STREAM";
export type RotationStartSlot = "DR_FIRST" | "PROMOTEE_FIRST";
/** g06_recruitment_stream subset used by the FR-PPP-020 construction engine. */
export type RecruitmentStream = "DIRECT" | "PROMOTEE" | "LDCE";

/** §5.2.28 g06_seniority_quota_rules row (DR:Promotee:LDCE ratios + rotation configuration). */
export interface SeniorityQuotaRule {
  id: string;
  tenantId: string;
  entityId?: string;
  ruleCode: string;
  cadreId: string;
  gradeDesignationId: string;
  drQuotaRatio: number;
  promoteeQuotaRatio: number;
  ldceQuotaRatio: number;
  rotationMethod: RotationMethod;
  rotationStartSlot: RotationStartSlot;
  /** AC-3: unfilled quota slots in a stream carry forward per the rule (no silent loss). */
  unfilledQuotaCarryForward: boolean;
  policyReference?: string;
  isActive: boolean;
}

/** One combined seniority entry (§5.2.2 fields): each records its quota_slot_label + rotation_cycle_no. */
export interface CombinedSeniorityEntry {
  employeeId: string;
  rank: number;
  recruitmentStream: RecruitmentStream;
  quotaSlotLabel: string;
  rotationCycleNo: number;
}

/** One rotation-trace slot: which stream slot each cycle issued and whether it carried forward. */
export interface RotationTraceSlot {
  cycleNo: number;
  slotLabel: string;
  stream: RecruitmentStream;
  filledByEmployeeId?: string;
  /** AC-3: an unfilled slot is recorded as carried forward — never silently lost. */
  carriedForward: boolean;
}

/** A persisted multi-stream construction run (entries + trace retrievable by id). */
export interface CombinedSeniorityConstruction {
  id: string;
  tenantId: string;
  entityId?: string;
  quotaRuleId: string;
  cadreId: string;
  entries: CombinedSeniorityEntry[];
  trace: RotationTraceSlot[];
}

/** FR-006: reservation_rosters register row (docs/data-model 5.2.16 g06_reservation_rosters). */
export interface ReservationRoster {
  id: string;
  tenantId: string;
  entityId?: string;
  rosterNo: string;
  cadreId: string;
  gradeDesignationId: string;
  rosterType: RosterType;
  cycleSize: number;
  policyVersion: string;
  rosterApplicable: boolean;
  /** Nagaraj/Jarnail enabling justification (impr. #15). */
  enablingProvisionRef?: string;
  quantifiableDataDocId?: string;
  consequentialSeniorityMode: ConsequentialSeniorityMode;
  status: "ACTIVE" | "REVISED" | "ARCHIVED";
  makerActorId: string;
  approverActorId: string;
}

/** FR-006: one roster point (docs/data-model 5.2.17 g06_roster_points). */
export interface RosterPoint {
  id: string;
  tenantId: string;
  entityId?: string;
  rosterId: string;
  pointNumber: number;
  reservedFor: ReservationCategory;
  status: RosterPointStatus;
  filledByEmployeeId?: string;
  filledInCaseId?: string;
  /** Own-merit migration (§5.6-6): the category the fill is COUNTED against — GEN for own-merit. */
  adjustedAgainstCategory?: ReservationCategory;
  carryForwardFromPointId?: string;
  dereservationAuthorityRef?: string;
}

/** FR-019: refusal consequence row (docs/data-model 5.2.32 g06_promotion_refusals). */
export interface PromotionRefusal {
  id: string;
  tenantId: string;
  entityId?: string;
  promotionOrderId: string;
  employeeId: string;
  refusalDate: string;
  refusalReason?: string;
  debarmentMonths: number;
  /** Debarment window end: refusal_date + debarment_months (§5.6-18). */
  debarmentUntil: string;
  nextConsiderationAfter: string;
  macpClockEffect: MacpClockEffect;
  refusalEffectApplied: boolean;
  status: RefusalStatus;
}

/** §5.6-11 probation lifecycle row (docs/data-model 5.2.12 g06_probation_records). */
export interface ProbationRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  promotionOrderId: string;
  employeeId: string;
  probationStart: string;
  probationMonths: number;
  /** §5.6-11: scheduled_end = probation_start + probation_months. */
  scheduledEnd: string;
  status: ProbationStatus;
}

/** FR-017: court/tribunal linkage row (docs/data-model 5.2.29 g06_legal_case_links). */
export interface LegalCaseLink {
  id: string;
  tenantId: string;
  entityId?: string;
  linkNo: string;
  linkedEntityType: LegalLinkedEntityType;
  linkedEntityRefId: string;
  forum: LegalForum;
  caseReference: string;
  petitioner?: string;
  /** §5.6-20 sub-judice guard: while true, downstream effecting is blocked (ENTITY_SUB_JUDICE). */
  interimStay: boolean;
  stayFromDate?: string;
  stayToDate?: string;
  subjectToOutcome: boolean;
  status: LegalStatus;
}

/** Adds calendar months to an ISO date (yyyy-mm-dd), clamping to month end. */
export function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    throw new FoundationError("VALIDATION_FAILED", "Date must be yyyy-mm-dd", { field: "date", details: { isoDate } });
  }
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  const daysInTarget = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, daysInTarget));
  return base.toISOString().slice(0, 10);
}

/**
 * PH-08C depth repository contract consumed by PromotionService — roster occupation,
 * refusal/debarment lookups, probation lifecycle and sub-judice stays live behind this
 * seam, never in module-local arrays.
 */
export interface PromotionDepthRepository {
  countRosters(): number;
  saveRoster(roster: ReservationRoster): void;
  findRoster(scope: TenantScope, rosterId: string): ReservationRoster | undefined;
  countRosterPoints(): number;
  saveRosterPoint(point: RosterPoint): void;
  findRosterPoint(scope: TenantScope, rosterId: string, pointNumber: number): RosterPoint | undefined;
  listRosterPoints(scope: TenantScope, rosterId: string): RosterPoint[];
  countRefusals(): number;
  saveRefusal(refusal: PromotionRefusal): void;
  /** Active refusal whose debarment window covers onDate (§5.6-18 re-consideration bar). */
  findActiveRefusal(scope: TenantScope, employeeId: string, onDate: string): PromotionRefusal | undefined;
  listRefusals(scope: TenantScope, employeeId: string): PromotionRefusal[];
  countProbations(): number;
  saveProbation(probation: ProbationRecord): void;
  listProbations(scope: TenantScope, employeeId: string): ProbationRecord[];
  countLegalCaseLinks(): number;
  saveLegalCaseLink(link: LegalCaseLink): void;
  findLegalCaseLink(scope: TenantScope, legalCaseLinkId: string): LegalCaseLink | undefined;
  /** Active interim stay on the entity (§5.6-20) — presence blocks effecting. */
  findActiveStay(scope: TenantScope, linkedEntityType: LegalLinkedEntityType, linkedEntityRefId: string): LegalCaseLink | undefined;
  // PH-15F FR-PPP-020: seniority_quota_rules + persisted combined constructions/rotation traces.
  countQuotaRules(): number;
  saveSeniorityQuotaRule(rule: SeniorityQuotaRule): void;
  findSeniorityQuotaRule(scope: TenantScope, quotaRuleId: string): SeniorityQuotaRule | undefined;
  countCombinedConstructions(): number;
  saveCombinedSeniorityConstruction(construction: CombinedSeniorityConstruction): void;
  findCombinedSeniorityConstruction(scope: TenantScope, constructionId: string): CombinedSeniorityConstruction | undefined;
}

/** In-memory implementation (DI default, mirrors InMemoryEstablishmentQslRepository). */
export class InMemoryPromotionDepthRepository implements PromotionDepthRepository {
  protected readonly rosters: ReservationRoster[] = [];
  protected readonly rosterPoints: RosterPoint[] = [];
  protected readonly refusals: PromotionRefusal[] = [];
  protected readonly probations: ProbationRecord[] = [];
  protected readonly legalCaseLinks: LegalCaseLink[] = [];
  protected readonly seniorityQuotaRules: SeniorityQuotaRule[] = [];
  protected readonly combinedConstructions: CombinedSeniorityConstruction[] = [];

  countRosters(): number {
    return this.rosters.length;
  }

  saveRoster(roster: ReservationRoster): void {
    this.upsert(this.rosters, roster);
  }

  findRoster(scope: TenantScope, rosterId: string): ReservationRoster | undefined {
    const roster = this.rosters.find((item) => item.id === rosterId && this.inScope(item, scope));
    return roster ? { ...roster } : undefined;
  }

  countRosterPoints(): number {
    return this.rosterPoints.length;
  }

  saveRosterPoint(point: RosterPoint): void {
    this.upsert(this.rosterPoints, point);
  }

  findRosterPoint(scope: TenantScope, rosterId: string, pointNumber: number): RosterPoint | undefined {
    const point = this.rosterPoints.find((item) => item.rosterId === rosterId && item.pointNumber === pointNumber && this.inScope(item, scope));
    return point ? { ...point } : undefined;
  }

  listRosterPoints(scope: TenantScope, rosterId: string): RosterPoint[] {
    return this.rosterPoints
      .filter((item) => item.rosterId === rosterId && this.inScope(item, scope))
      .sort((left, right) => left.pointNumber - right.pointNumber)
      .map((item) => ({ ...item }));
  }

  countRefusals(): number {
    return this.refusals.length;
  }

  saveRefusal(refusal: PromotionRefusal): void {
    this.upsert(this.refusals, refusal);
  }

  findActiveRefusal(scope: TenantScope, employeeId: string, onDate: string): PromotionRefusal | undefined {
    const refusal = this.refusals.find(
      (item) => item.employeeId === employeeId && item.status === "ACTIVE" && onDate <= item.debarmentUntil && this.inScope(item, scope)
    );
    return refusal ? { ...refusal } : undefined;
  }

  listRefusals(scope: TenantScope, employeeId: string): PromotionRefusal[] {
    return this.refusals.filter((item) => item.employeeId === employeeId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  countProbations(): number {
    return this.probations.length;
  }

  saveProbation(probation: ProbationRecord): void {
    this.upsert(this.probations, probation);
  }

  listProbations(scope: TenantScope, employeeId: string): ProbationRecord[] {
    return this.probations.filter((item) => item.employeeId === employeeId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  countLegalCaseLinks(): number {
    return this.legalCaseLinks.length;
  }

  saveLegalCaseLink(link: LegalCaseLink): void {
    this.upsert(this.legalCaseLinks, link);
  }

  findLegalCaseLink(scope: TenantScope, legalCaseLinkId: string): LegalCaseLink | undefined {
    const link = this.legalCaseLinks.find((item) => item.id === legalCaseLinkId && this.inScope(item, scope));
    return link ? { ...link } : undefined;
  }

  findActiveStay(scope: TenantScope, linkedEntityType: LegalLinkedEntityType, linkedEntityRefId: string): LegalCaseLink | undefined {
    const link = this.legalCaseLinks.find(
      (item) =>
        item.linkedEntityType === linkedEntityType &&
        item.linkedEntityRefId === linkedEntityRefId &&
        item.interimStay &&
        this.inScope(item, scope)
    );
    return link ? { ...link } : undefined;
  }

  countQuotaRules(): number {
    return this.seniorityQuotaRules.length;
  }

  saveSeniorityQuotaRule(rule: SeniorityQuotaRule): void {
    this.upsert(this.seniorityQuotaRules, rule);
  }

  findSeniorityQuotaRule(scope: TenantScope, quotaRuleId: string): SeniorityQuotaRule | undefined {
    const rule = this.seniorityQuotaRules.find((item) => item.id === quotaRuleId && this.inScope(item, scope));
    return rule ? { ...rule } : undefined;
  }

  countCombinedConstructions(): number {
    return this.combinedConstructions.length;
  }

  saveCombinedSeniorityConstruction(construction: CombinedSeniorityConstruction): void {
    this.upsert(this.combinedConstructions, construction);
  }

  findCombinedSeniorityConstruction(scope: TenantScope, constructionId: string): CombinedSeniorityConstruction | undefined {
    const construction = this.combinedConstructions.find((item) => item.id === constructionId && this.inScope(item, scope));
    return construction
      ? { ...construction, entries: construction.entries.map((entry) => ({ ...entry })), trace: construction.trace.map((slot) => ({ ...slot })) }
      : undefined;
  }

  /** Durability hook — no-op in memory; the file-backed subclass writes through. */
  protected persist(): void {
    // In-memory repository keeps state in process only.
  }

  protected loadState(state: {
    rosters?: ReservationRoster[];
    rosterPoints?: RosterPoint[];
    refusals?: PromotionRefusal[];
    probations?: ProbationRecord[];
    legalCaseLinks?: LegalCaseLink[];
    seniorityQuotaRules?: SeniorityQuotaRule[];
    combinedConstructions?: CombinedSeniorityConstruction[];
  }): void {
    this.rosters.push(...(state.rosters ?? []));
    this.rosterPoints.push(...(state.rosterPoints ?? []));
    this.refusals.push(...(state.refusals ?? []));
    this.probations.push(...(state.probations ?? []));
    this.legalCaseLinks.push(...(state.legalCaseLinks ?? []));
    this.seniorityQuotaRules.push(...(state.seniorityQuotaRules ?? []));
    this.combinedConstructions.push(...(state.combinedConstructions ?? []));
  }

  protected snapshotState(): {
    rosters: ReservationRoster[];
    rosterPoints: RosterPoint[];
    refusals: PromotionRefusal[];
    probations: ProbationRecord[];
    legalCaseLinks: LegalCaseLink[];
    seniorityQuotaRules: SeniorityQuotaRule[];
    combinedConstructions: CombinedSeniorityConstruction[];
  } {
    return {
      rosters: this.rosters,
      rosterPoints: this.rosterPoints,
      refusals: this.refusals,
      probations: this.probations,
      legalCaseLinks: this.legalCaseLinks,
      seniorityQuotaRules: this.seniorityQuotaRules,
      combinedConstructions: this.combinedConstructions,
    };
  }

  private upsert<T extends { id: string }>(rows: T[], row: T): void {
    const index = rows.findIndex((item) => item.id === row.id);
    if (index < 0) {
      rows.push({ ...row });
    } else {
      rows[index] = { ...row };
    }
    this.persist();
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || !row.entityId || row.entityId === scope.entityId);
  }
}

/**
 * Durable file-backed implementation: rehydrates depth-entity state from disk on construction
 * and write-through persists after every mutation with an atomic tmp-file + rename swap.
 */
export class FileBackedPromotionDepthRepository extends InMemoryPromotionDepthRepository {
  constructor(private readonly filePath: string) {
    super();
    this.rehydrate();
  }

  private rehydrate(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = readFileSync(this.filePath, "utf8");
    this.loadState(JSON.parse(raw) as Parameters<InMemoryPromotionDepthRepository["loadState"]>[0]);
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.snapshotState()), "utf8");
    renameSync(tmpPath, this.filePath);
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over migration 0010_g06_promotion_depth.sql (faithful subset
// of docs/data-model/06-*.sql §5.2.12/16/17/29/32). All SQL is parameterised ($1, $2, ...);
// roster creation (register + points) and roster-point occupation run in one transaction.
// ---------------------------------------------------------------------------------------

const INSERT_ROSTER =
  "INSERT INTO g06_reservation_rosters (tenant_id, entity_id, roster_no, cadre_id, grade_designation_id, roster_type, cycle_size, " +
  "policy_version, roster_applicable, enabling_provision_ref, quantifiable_data_doc_id, consequential_seniority_mode, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id";

const INSERT_ROSTER_POINT =
  "INSERT INTO g06_roster_points (tenant_id, entity_id, roster_id, point_number, reserved_for, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id";

const SELECT_ROSTER_POINT_FOR_UPDATE =
  "SELECT id, roster_id, point_number, reserved_for, status, filled_by_employee_id, adjusted_against_category " +
  "FROM g06_roster_points WHERE tenant_id = $1 AND roster_id = $2 AND point_number = $3 AND is_deleted = false FOR UPDATE";

const FILL_ROSTER_POINT =
  "UPDATE g06_roster_points SET status = 'FILLED', filled_by_employee_id = $4, filled_in_case_id = $5, " +
  "adjusted_against_category = $6, updated_by = $7, updated_at = now() " +
  "WHERE tenant_id = $1 AND roster_id = $2 AND point_number = $3 AND is_deleted = false " +
  "RETURNING id, roster_id, point_number, reserved_for, status, filled_by_employee_id, filled_in_case_id, adjusted_against_category";

const INSERT_REFUSAL =
  "INSERT INTO g06_promotion_refusals (tenant_id, entity_id, order_id, employee_id, refusal_date, refusal_reason, debarment_months, " +
  "debarment_until, macp_clock_effect, next_consideration_after, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, debarment_until, status";

const SELECT_ACTIVE_REFUSAL =
  "SELECT id, order_id, employee_id, refusal_date, debarment_months, debarment_until, macp_clock_effect, next_consideration_after, status " +
  "FROM g06_promotion_refusals WHERE tenant_id = $1 AND employee_id = $2 AND status = 'ACTIVE' AND debarment_until >= $3 AND is_deleted = false";

const INSERT_PROBATION =
  "INSERT INTO g06_probation_records (tenant_id, entity_id, order_id, employee_id, probation_start, probation_months, scheduled_end, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, scheduled_end, status";

const INSERT_LEGAL_CASE_LINK =
  "INSERT INTO g06_legal_case_links (tenant_id, entity_id, link_no, linked_entity_type, linked_entity_id, forum, case_reference, petitioner, " +
  "interim_stay, stay_from_date, subject_to_outcome, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, status";

const SELECT_ACTIVE_STAY =
  "SELECT id, link_no, linked_entity_type, linked_entity_id, case_reference, interim_stay, status " +
  "FROM g06_legal_case_links WHERE tenant_id = $1 AND linked_entity_type = $2 AND linked_entity_id = $3 AND interim_stay = true AND is_deleted = false";

const VACATE_STAY =
  "UPDATE g06_legal_case_links SET interim_stay = false, stay_to_date = $3, status = 'PENDING', updated_by = $4, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false RETURNING id, interim_stay, status";

// PH-15F SQL over migration 0027 (FR-PPP-020 seniority_quota_rules + combined construction) — parameterised only.
const INSERT_SENIORITY_QUOTA_RULE =
  "INSERT INTO g06_seniority_quota_rules (tenant_id, entity_id, rule_code, cadre_id, grade_designation_id, dr_quota_ratio, promotee_quota_ratio, " +
  "ldce_quota_ratio, rotation_method, rotation_start_slot, unfilled_quota_carry_forward, policy_reference, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id";

const INSERT_COMBINED_CONSTRUCTION =
  "INSERT INTO g06_combined_seniority_constructions (tenant_id, entity_id, quota_rule_id, cadre_id, created_by) " +
  "VALUES ($1, $2, $3, $4, $5) RETURNING id";

const INSERT_COMBINED_ENTRY =
  "INSERT INTO g06_combined_seniority_entries (tenant_id, construction_id, employee_id, rank_position, recruitment_stream, quota_slot_label, rotation_cycle_no, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id";

const INSERT_ROTATION_TRACE_SLOT =
  "INSERT INTO g06_rotation_trace_slots (tenant_id, construction_id, cycle_no, slot_label, recruitment_stream, filled_by_employee_id, carried_forward, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id";

/** Postgres-backed PH-08C depth repository over migration 0010 tables. */
export class PgPromotionDepthRepository {
  constructor(private readonly pool: Pool) {}

  /** Roster register + its points commit in ONE transaction — no half-created roster. */
  async insertRosterWithPoints(input: {
    tenantId: string;
    entityId?: string;
    rosterNo: string;
    cadreId: string;
    gradeDesignationId: string;
    rosterType: RosterType;
    cycleSize: number;
    policyVersion: string;
    rosterApplicable: boolean;
    enablingProvisionRef?: string;
    quantifiableDataDocId?: string;
    consequentialSeniorityMode: ConsequentialSeniorityMode;
    points: Array<{ pointNumber: number; reservedFor: ReservationCategory }>;
    createdBy?: string;
  }): Promise<{ rosterId: string; pointIds: string[] }> {
    return withTransaction(this.pool, async (client) => {
      const roster = await client.query(INSERT_ROSTER, [
        input.tenantId,
        input.entityId ?? null,
        input.rosterNo,
        input.cadreId,
        input.gradeDesignationId,
        input.rosterType,
        input.cycleSize,
        input.policyVersion,
        input.rosterApplicable,
        input.enablingProvisionRef ?? null,
        input.quantifiableDataDocId ?? null,
        input.consequentialSeniorityMode,
        input.createdBy ?? null,
      ]);
      const rosterId = (roster.rows[0] as { id: string }).id;
      const pointIds: string[] = [];
      for (const point of input.points) {
        const inserted = await client.query(INSERT_ROSTER_POINT, [
          input.tenantId,
          input.entityId ?? null,
          rosterId,
          point.pointNumber,
          point.reservedFor,
          input.createdBy ?? null,
        ]);
        pointIds.push((inserted.rows[0] as { id: string }).id);
      }
      return { rosterId, pointIds };
    });
  }

  /**
   * FR-006 point occupation in one transaction: SELECT ... FOR UPDATE fails closed on
   * double-fill (ROSTER_POINT_OCCUPIED) and enforces own-merit migration (§5.6-6) — an
   * own-merit fill must land on a GEN point with adjusted_against_category=GEN.
   */
  async fillRosterPoint(input: {
    tenantId: string;
    rosterId: string;
    pointNumber: number;
    employeeId: string;
    candidateCategory: ReservationCategory;
    selectedOnOwnMerit: boolean;
    promotionCaseId?: string;
    updatedBy?: string;
  }): Promise<{ id: string; adjustedAgainstCategory: ReservationCategory }> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(SELECT_ROSTER_POINT_FOR_UPDATE, [input.tenantId, input.rosterId, input.pointNumber]);
      const point = locked.rows[0] as { reserved_for: ReservationCategory; status: RosterPointStatus } | undefined;
      if (!point) {
        throw new FoundationError("NOT_FOUND", "Roster point not found");
      }
      if (point.status !== "VACANT") {
        throw new FoundationError("ROSTER_POINT_OCCUPIED", "Roster point is already occupied", {
          field: "pointNumber",
          details: { pointNumber: input.pointNumber, status: point.status },
        });
      }
      if (input.selectedOnOwnMerit && point.reserved_for !== "GEN") {
        throw new FoundationError("OWN_MERIT_MIGRATION_REQUIRED", "Own-merit reserved candidate must occupy an unreserved (GEN) point", {
          field: "pointNumber",
          details: { pointNumber: input.pointNumber, reservedFor: point.reserved_for },
        });
      }
      if (!input.selectedOnOwnMerit && point.reserved_for !== "GEN" && point.reserved_for !== input.candidateCategory) {
        throw new FoundationError("ROSTER_CATEGORY_MISMATCH", "Reserved point cannot be filled by a non-matching category", {
          field: "candidateCategory",
          details: { reservedFor: point.reserved_for, candidateCategory: input.candidateCategory },
        });
      }
      const adjustedAgainstCategory: ReservationCategory = input.selectedOnOwnMerit ? "GEN" : point.reserved_for;
      const filled = await client.query(FILL_ROSTER_POINT, [
        input.tenantId,
        input.rosterId,
        input.pointNumber,
        input.employeeId,
        input.promotionCaseId ?? null,
        adjustedAgainstCategory,
        input.updatedBy ?? null,
      ]);
      return { id: (filled.rows[0] as { id: string }).id, adjustedAgainstCategory };
    });
  }

  async insertRefusal(input: {
    tenantId: string;
    entityId?: string;
    promotionOrderId: string;
    employeeId: string;
    refusalDate: string;
    refusalReason?: string;
    debarmentMonths: number;
    macpClockEffect: MacpClockEffect;
    createdBy?: string;
  }): Promise<{ id: string; debarmentUntil: string }> {
    const debarmentUntil = addMonthsIso(input.refusalDate, input.debarmentMonths);
    const result = await this.pool.query(INSERT_REFUSAL, [
      input.tenantId,
      input.entityId ?? null,
      input.promotionOrderId,
      input.employeeId,
      input.refusalDate,
      input.refusalReason ?? null,
      input.debarmentMonths,
      debarmentUntil,
      input.macpClockEffect,
      debarmentUntil,
      input.createdBy ?? null,
    ]);
    return { id: (result.rows[0] as { id: string }).id, debarmentUntil };
  }

  async findActiveRefusal(tenantId: string, employeeId: string, onDate: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(SELECT_ACTIVE_REFUSAL, [tenantId, employeeId, onDate]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  async insertProbation(input: {
    tenantId: string;
    entityId?: string;
    promotionOrderId: string;
    employeeId: string;
    probationStart: string;
    probationMonths: number;
    createdBy?: string;
  }): Promise<{ id: string; scheduledEnd: string }> {
    const scheduledEnd = addMonthsIso(input.probationStart, input.probationMonths);
    const result = await this.pool.query(INSERT_PROBATION, [
      input.tenantId,
      input.entityId ?? null,
      input.promotionOrderId,
      input.employeeId,
      input.probationStart,
      input.probationMonths,
      scheduledEnd,
      input.createdBy ?? null,
    ]);
    return { id: (result.rows[0] as { id: string }).id, scheduledEnd };
  }

  async insertLegalCaseLink(input: {
    tenantId: string;
    entityId?: string;
    linkNo: string;
    linkedEntityType: LegalLinkedEntityType;
    linkedEntityRefId: string;
    forum: LegalForum;
    caseReference: string;
    petitioner?: string;
    interimStay: boolean;
    stayFromDate?: string;
    subjectToOutcome: boolean;
    createdBy?: string;
  }): Promise<{ id: string; status: string }> {
    const result = await this.pool.query(INSERT_LEGAL_CASE_LINK, [
      input.tenantId,
      input.entityId ?? null,
      input.linkNo,
      input.linkedEntityType,
      input.linkedEntityRefId,
      input.forum,
      input.caseReference,
      input.petitioner ?? null,
      input.interimStay,
      input.stayFromDate ?? null,
      input.subjectToOutcome,
      input.interimStay ? "INTERIM_STAYED" : "FILED",
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string; status: string };
  }

  async findActiveStay(tenantId: string, linkedEntityType: LegalLinkedEntityType, linkedEntityRefId: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(SELECT_ACTIVE_STAY, [tenantId, linkedEntityType, linkedEntityRefId]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  async vacateStay(input: { tenantId: string; legalCaseLinkId: string; stayToDate: string; updatedBy?: string }): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(VACATE_STAY, [input.tenantId, input.legalCaseLinkId, input.stayToDate, input.updatedBy ?? null]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  /** FR-PPP-020: one seniority_quota_rules row (ratios validated by the service — QUOTA_RULE_INVALID). */
  async insertSeniorityQuotaRule(input: {
    tenantId: string;
    entityId?: string;
    ruleCode: string;
    cadreId: string;
    gradeDesignationId: string;
    drQuotaRatio: number;
    promoteeQuotaRatio: number;
    ldceQuotaRatio: number;
    rotationMethod: RotationMethod;
    rotationStartSlot: RotationStartSlot;
    unfilledQuotaCarryForward: boolean;
    policyReference?: string;
    createdBy?: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query(INSERT_SENIORITY_QUOTA_RULE, [
      input.tenantId,
      input.entityId ?? null,
      input.ruleCode,
      input.cadreId,
      input.gradeDesignationId,
      input.drQuotaRatio,
      input.promoteeQuotaRatio,
      input.ldceQuotaRatio,
      input.rotationMethod,
      input.rotationStartSlot,
      input.unfilledQuotaCarryForward,
      input.policyReference ?? null,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string };
  }

  /**
   * FR-PPP-020: the construction header, its combined entries (quota_slot_label +
   * rotation_cycle_no) and the rotation trace commit in ONE transaction — a failed
   * insert leaves no half-persisted combined list.
   */
  async insertCombinedConstruction(input: {
    tenantId: string;
    entityId?: string;
    quotaRuleId: string;
    cadreId: string;
    entries: CombinedSeniorityEntry[];
    trace: RotationTraceSlot[];
    createdBy?: string;
  }): Promise<{ constructionId: string; entryIds: string[] }> {
    return withTransaction(this.pool, async (client) => {
      const header = await client.query(INSERT_COMBINED_CONSTRUCTION, [
        input.tenantId,
        input.entityId ?? null,
        input.quotaRuleId,
        input.cadreId,
        input.createdBy ?? null,
      ]);
      const constructionId = (header.rows[0] as { id: string }).id;
      const entryIds: string[] = [];
      for (const entry of input.entries) {
        const inserted = await client.query(INSERT_COMBINED_ENTRY, [
          input.tenantId,
          constructionId,
          entry.employeeId,
          entry.rank,
          entry.recruitmentStream,
          entry.quotaSlotLabel,
          entry.rotationCycleNo,
          input.createdBy ?? null,
        ]);
        entryIds.push((inserted.rows[0] as { id: string }).id);
      }
      for (const slot of input.trace) {
        await client.query(INSERT_ROTATION_TRACE_SLOT, [
          input.tenantId,
          constructionId,
          slot.cycleNo,
          slot.slotLabel,
          slot.stream,
          slot.filledByEmployeeId ?? null,
          slot.carriedForward,
          input.createdBy ?? null,
        ]);
      }
      return { constructionId, entryIds };
    });
  }
}
