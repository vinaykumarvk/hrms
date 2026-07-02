import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope, pseudoHash64, stableStringify } from "../../platform/types";

/**
 * PH-08E G09 natural-justice chain entities (docs/brd/v3/G09-disciplinary-cases-punishment.md,
 * docs/data-model/09-G09-disciplinary-punishment.sql):
 *   (1) preliminary_inquiries (E3, FR-G09-002: ORDERED -> IN_PROGRESS -> SUBMITTED with a
 *       PROCEED_MAJOR/PROCEED_MINOR/DROP/ADMIN_ADVICE recommendation);
 *   (2) suspensions (E4, FR-G09-003: subsistence allowance bounded by the procedure template
 *       floor/ceiling, default 25/75 -> ERR-G09-SUBSISTENCE-OUT-OF-BOUNDS; revision gated on the
 *       non-employment certificate -> ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED; periodic review);
 *   (3) show_cause_notices (E15) carrying proposed_penalty_json for the DI-4 subset rule
 *       (final order penalties must be a subset -> ERR-G09-PENALTY-EXCEEDS-PROPOSED);
 *   (4) authority_competence (E23, FR-G09-018/DI-13) incl. requires_not_subordinate_to_appointing
 *       for the Art. 311(1) DISMISSAL/REMOVAL/COMPULSORY_RETIREMENT guard
 *       (-> ERR-G09-AUTHORITY-NOT-COMPETENT, fail-safe deny on a missing matrix entry);
 *   (5) case_consultations (E24, FR-G09-019/DI-14: mandatory UPSC/CVC/ICC/LEGAL rows must be
 *       CLOSED or WAIVED before finalise -> ERR-G09-CONSULTATION-PENDING);
 *   (6) disagreement_memos (E14: tentative disagreement served and responded before finalise);
 *   (7) case_timeline_events (DI-21: append-only per-case hash chain with seq_no/prev_hash/row_hash;
 *       verify recomputes hashes and raises ERR-G09-AUDIT-CHAIN-BROKEN on tamper);
 *   (8) abatement on death (FR-G09-028/DI-26 -> ERR-G09-CASE-ABATED) recorded on the case.
 * Follows the PH-08A/PH-08C/PH-08D repository pattern: sync interface + in-memory impl (DI
 * default), a durable file-backed impl, and a Postgres impl over migration 0013 (parameterised
 * SQL only; order finalise commits in ONE transaction).
 */

export type PreliminaryInquiryStatus = "ORDERED" | "IN_PROGRESS" | "SUBMITTED" | "CLOSED";
export type PreliminaryInquiryRecommendation = "PROCEED_MAJOR" | "PROCEED_MINOR" | "DROP" | "ADMIN_ADVICE";
export type SuspensionType = "ORDERED" | "DEEMED" | "CONTINUED";
export type SuspensionStatus = "ACTIVE" | "REVOKED" | "EXTENDED" | "DEEMED_REVOKED";
export type ShowCauseNoticeStatus = "ISSUED" | "SERVED" | "RESPONDED" | "NO_RESPONSE" | "CLOSED";
export type ConsultationType = "UPSC" | "CVC_FIRST_STAGE" | "CVC_SECOND_STAGE" | "ICC" | "LEGAL";
export type ConsultationStatus = "REQUIRED" | "REQUESTED" | "RECEIVED" | "CLOSED" | "WAIVED";
export type DisagreementMemoStatus = "ISSUED" | "SERVED" | "RESPONDED" | "FINALISED";
export type TimelineEventType = "STAGE_ENTERED" | "STAGE_COMPLETED" | "SLA_BREACH" | "ESCALATION" | "NOTE";
export type PenaltyClass = "MINOR" | "MAJOR";

/** g09_penalty_type (DDL §1): the full statutory penalty menu incl. the Art. 311 trio. */
export type G09PenaltyType =
  | "CENSURE"
  | "WITHHOLD_INCREMENT"
  | "WITHHOLD_PROMOTION"
  | "RECOVERY"
  | "REDUCTION_IN_RANK"
  | "COMPULSORY_RETIREMENT"
  | "REMOVAL"
  | "DISMISSAL"
  | "FINE"
  | "WARNING";

/** Ordered authority ladder (lowest -> highest); rank comparison drives the subordinate guard. */
export const G09_AUTHORITY_LADDER = [
  "SECTION_OFFICER",
  "HEAD_OF_OFFICE",
  "HEAD_OF_DEPARTMENT",
  "APPOINTING_AUTHORITY",
  "PRESIDENT",
] as const;

export type AuthorityLevel = (typeof G09_AUTHORITY_LADDER)[number];

export function authorityRank(level: string): number {
  return G09_AUTHORITY_LADDER.indexOf(level as AuthorityLevel);
}

/** Art. 311(1): true when `level` sits BELOW `appointingLevel` on the ladder (subordinate authority). */
export function isSubordinateAuthority(level: string, appointingLevel: string): boolean {
  return authorityRank(level) < authorityRank(appointingLevel);
}

/** DDL §1 g09_penalty_class mapping for the statutory penalty menu (BRD §5.6 DI-13). */
export function penaltyClassOf(penaltyType: G09PenaltyType): PenaltyClass {
  switch (penaltyType) {
    case "REDUCTION_IN_RANK":
    case "COMPULSORY_RETIREMENT":
    case "REMOVAL":
    case "DISMISSAL":
      return "MAJOR";
    default:
      return "MINOR";
  }
}

/** E3 preliminary_inquiries row (fact-finding before formal charges; FR-G09-002). */
export interface PreliminaryInquiry {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  piOfficerId: string;
  orderedBy: string;
  orderedDate: string;
  dueDate: string;
  status: PreliminaryInquiryStatus;
  findingsSummary?: string;
  recommendation?: PreliminaryInquiryRecommendation;
  submittedAt?: string;
}

/** E4 suspensions row (parallel interim status + subsistence + NEC/deemed review; FR-G09-003). */
export interface Suspension {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  employeeId: string;
  suspensionType: SuspensionType;
  orderNo: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: SuspensionStatus;
  subsistenceRatePct: number;
  /** AI-6/DI-16: subsistence revision is gated on the non-employment certificate. */
  nonEmploymentCertificateReceived: boolean;
  necReceivedDate?: string;
  /** 90-day charge-memo window (Ajay Kumar Choudhary). */
  chargeMemoDueDate?: string;
  subsistenceRevisionDue?: string;
  reviewCommitteeDue?: string;
  revokedReason?: string;
}

/** E15 show_cause_notices row — proposed_penalty_json is the DI-4 subset ceiling for the final order. */
export interface ShowCauseNotice {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  noticeNo: string;
  proposedPenaltyJson: G09PenaltyType[];
  issuedBy: string;
  issuedDate: string;
  servedDate?: string;
  responseDueDate: string;
  representationText?: string;
  respondedAt?: string;
  status: ShowCauseNoticeStatus;
}

/** E23 authority_competence row ((cadre x penalty class/type) -> empowered level; FR-G09-018/DI-13). */
export interface AuthorityCompetenceRule {
  id: string;
  tenantId: string;
  entityId?: string;
  competenceSetCode: string;
  subjectCadre: string;
  penaltyClass: PenaltyClass;
  /** null/undefined = any penalty of the class. */
  penaltyType?: G09PenaltyType;
  minAuthorityLevel: string;
  /** Art. 311(1): DISMISSAL/REMOVAL/COMPULSORY_RETIREMENT must not be passed by a subordinate authority. */
  requiresNotSubordinateToAppointing: boolean;
}

/** Authority-level assignment (delegation modelled as authority level; BRD FR-G09-018 edge case). */
export interface AuthorityLevelAssignment {
  id: string;
  tenantId: string;
  employeeId: string;
  authorityLevel: string;
}

/** E24 case_consultations row (UPSC/CVC/ICC/LEGAL gating finalise; FR-G09-019/DI-14). */
export interface CaseConsultation {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  consultationType: ConsultationType;
  status: ConsultationStatus;
  isMandatory: boolean;
  requestedDate?: string;
  receivedDate?: string;
  adviceSummary?: string;
  waiverReason?: string;
}

/** E14 disagreement_memos row (DA disagreement with IO findings; served + responded before finalise). */
export interface DisagreementMemo {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  inquiryReportRef: string;
  issuedBy: string;
  tentativeDisagreement: string;
  articlesAffected: string[];
  servedDate?: string;
  representationDueDate?: string;
  representationText?: string;
  status: DisagreementMemoStatus;
}

/** DI-21 case_timeline_events row — APPEND-ONLY per-case hash chain (seq_no, prev_hash, row_hash). */
export interface CaseTimelineEvent {
  id: string;
  tenantId: string;
  entityId?: string;
  caseId: string;
  stage: string;
  eventType: TimelineEventType;
  eventAt: string;
  actorId?: string;
  notes?: string;
  seqNo: number;
  prevHash?: string;
  rowHash: string;
}

/**
 * DI-21 row hash: recomputable from the row's own content + the prev link. The verify operation
 * recomputes this for every row — it never trusts a stored row_hash or prev_hash.
 */
export function computeTimelineRowHash(row: {
  caseId: string;
  seqNo: number;
  prevHash?: string;
  stage: string;
  eventType: string;
  eventAt: string;
  actorId?: string;
  notes?: string;
}): string {
  return pseudoHash64(
    stableStringify({
      caseId: row.caseId,
      seqNo: row.seqNo,
      prevHash: row.prevHash ?? "",
      stage: row.stage,
      eventType: row.eventType,
      eventAt: row.eventAt,
      actorId: row.actorId ?? "",
      notes: row.notes ?? "",
    })
  );
}

/**
 * PH-08E due-process repository contract consumed by DisciplinaryService — preliminary inquiries,
 * suspensions, show-cause notices, the competence matrix, consultations, disagreement memos and
 * the hash-chained case timeline live behind this seam, never in module-local arrays.
 */
export interface G09DueProcessRepository {
  savePreliminaryInquiry(row: PreliminaryInquiry): void;
  findPreliminaryInquiry(scope: TenantScope, id: string): PreliminaryInquiry | undefined;
  listPreliminaryInquiries(scope: TenantScope, caseId: string): PreliminaryInquiry[];
  saveSuspension(row: Suspension): void;
  findSuspension(scope: TenantScope, id: string): Suspension | undefined;
  listSuspensions(scope: TenantScope, caseId: string): Suspension[];
  countSuspensions(): number;
  saveShowCauseNotice(row: ShowCauseNotice): void;
  findShowCauseNotice(scope: TenantScope, id: string): ShowCauseNotice | undefined;
  listShowCauseNotices(scope: TenantScope, caseId: string): ShowCauseNotice[];
  saveCompetenceRule(row: AuthorityCompetenceRule): void;
  /** DI-13 lookup: exact penalty-type row wins over the class-wide (penaltyType undefined) row. */
  findCompetenceRule(
    scope: TenantScope,
    query: { competenceSetCode: string; subjectCadre: string; penaltyClass: PenaltyClass; penaltyType: G09PenaltyType }
  ): AuthorityCompetenceRule | undefined;
  saveAuthorityAssignment(row: AuthorityLevelAssignment): void;
  findAuthorityLevel(scope: TenantScope, employeeId: string): string | undefined;
  saveConsultation(row: CaseConsultation): void;
  findConsultation(scope: TenantScope, id: string): CaseConsultation | undefined;
  listConsultations(scope: TenantScope, caseId: string): CaseConsultation[];
  saveDisagreementMemo(row: DisagreementMemo): void;
  findDisagreementMemo(scope: TenantScope, id: string): DisagreementMemo | undefined;
  listDisagreementMemos(scope: TenantScope, caseId: string): DisagreementMemo[];
  /** Append-only: allocates the next seq_no, links prev_hash to the last row, computes row_hash. */
  appendTimelineEvent(row: Omit<CaseTimelineEvent, "id" | "seqNo" | "prevHash" | "rowHash">): CaseTimelineEvent;
  listTimelineEvents(scope: TenantScope, caseId: string): CaseTimelineEvent[];
}

/** In-memory implementation (DI default, mirrors InMemoryAparDepthRepository). */
export class InMemoryG09DueProcessRepository implements G09DueProcessRepository {
  protected readonly preliminaryInquiries: PreliminaryInquiry[] = [];
  protected readonly suspensions: Suspension[] = [];
  protected readonly showCauseNotices: ShowCauseNotice[] = [];
  protected readonly competenceRules: AuthorityCompetenceRule[] = [];
  protected readonly authorityAssignments: AuthorityLevelAssignment[] = [];
  protected readonly consultations: CaseConsultation[] = [];
  protected readonly disagreementMemos: DisagreementMemo[] = [];
  protected readonly timelineEvents: CaseTimelineEvent[] = [];

  savePreliminaryInquiry(row: PreliminaryInquiry): void {
    this.upsert(this.preliminaryInquiries, row);
  }

  findPreliminaryInquiry(scope: TenantScope, id: string): PreliminaryInquiry | undefined {
    return this.copyOf(this.preliminaryInquiries.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listPreliminaryInquiries(scope: TenantScope, caseId: string): PreliminaryInquiry[] {
    return this.preliminaryInquiries.filter((item) => item.caseId === caseId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  saveSuspension(row: Suspension): void {
    this.upsert(this.suspensions, row);
  }

  findSuspension(scope: TenantScope, id: string): Suspension | undefined {
    return this.copyOf(this.suspensions.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listSuspensions(scope: TenantScope, caseId: string): Suspension[] {
    return this.suspensions.filter((item) => item.caseId === caseId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  countSuspensions(): number {
    return this.suspensions.length;
  }

  saveShowCauseNotice(row: ShowCauseNotice): void {
    this.upsert(this.showCauseNotices, row);
  }

  findShowCauseNotice(scope: TenantScope, id: string): ShowCauseNotice | undefined {
    return this.copyOf(this.showCauseNotices.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listShowCauseNotices(scope: TenantScope, caseId: string): ShowCauseNotice[] {
    return this.showCauseNotices.filter((item) => item.caseId === caseId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  saveCompetenceRule(row: AuthorityCompetenceRule): void {
    this.upsert(this.competenceRules, row);
  }

  findCompetenceRule(
    scope: TenantScope,
    query: { competenceSetCode: string; subjectCadre: string; penaltyClass: PenaltyClass; penaltyType: G09PenaltyType }
  ): AuthorityCompetenceRule | undefined {
    const candidates = this.competenceRules.filter(
      (item) =>
        this.inScope(item, scope) &&
        item.competenceSetCode === query.competenceSetCode &&
        item.subjectCadre === query.subjectCadre &&
        item.penaltyClass === query.penaltyClass &&
        (item.penaltyType === query.penaltyType || item.penaltyType === undefined)
    );
    const exact = candidates.find((item) => item.penaltyType === query.penaltyType);
    return this.copyOf(exact ?? candidates[0]);
  }

  saveAuthorityAssignment(row: AuthorityLevelAssignment): void {
    const index = this.authorityAssignments.findIndex((item) => item.tenantId === row.tenantId && item.employeeId === row.employeeId);
    if (index < 0) {
      this.authorityAssignments.push({ ...row });
    } else {
      this.authorityAssignments[index] = { ...row };
    }
    this.persist();
  }

  findAuthorityLevel(scope: TenantScope, employeeId: string): string | undefined {
    return this.authorityAssignments.find((item) => item.tenantId === scope.tenantId && item.employeeId === employeeId)?.authorityLevel;
  }

  saveConsultation(row: CaseConsultation): void {
    this.upsert(this.consultations, row);
  }

  findConsultation(scope: TenantScope, id: string): CaseConsultation | undefined {
    return this.copyOf(this.consultations.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listConsultations(scope: TenantScope, caseId: string): CaseConsultation[] {
    return this.consultations.filter((item) => item.caseId === caseId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  saveDisagreementMemo(row: DisagreementMemo): void {
    this.upsert(this.disagreementMemos, row);
  }

  findDisagreementMemo(scope: TenantScope, id: string): DisagreementMemo | undefined {
    return this.copyOf(this.disagreementMemos.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listDisagreementMemos(scope: TenantScope, caseId: string): DisagreementMemo[] {
    return this.disagreementMemos.filter((item) => item.caseId === caseId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  appendTimelineEvent(row: Omit<CaseTimelineEvent, "id" | "seqNo" | "prevHash" | "rowHash">): CaseTimelineEvent {
    const chain = this.timelineEvents.filter((item) => item.caseId === row.caseId && item.tenantId === row.tenantId).sort((left, right) => left.seqNo - right.seqNo);
    const last = chain[chain.length - 1];
    const seqNo = (last?.seqNo ?? 0) + 1;
    const prevHash = last?.rowHash;
    const rowHash = computeTimelineRowHash({ ...row, seqNo, prevHash });
    const event: CaseTimelineEvent = { ...row, id: `g09-timeline-${this.timelineEvents.length + 1}`, seqNo, prevHash, rowHash };
    // DI-21/CONVENTIONS §3: case_timeline_events is APPEND-ONLY — no update path exists.
    this.timelineEvents.push(event);
    this.persist();
    return { ...event };
  }

  listTimelineEvents(scope: TenantScope, caseId: string): CaseTimelineEvent[] {
    return this.timelineEvents
      .filter((item) => item.caseId === caseId && item.tenantId === scope.tenantId)
      .sort((left, right) => left.seqNo - right.seqNo)
      .map((item) => ({ ...item }));
  }

  /** Durability hook — no-op in memory; the file-backed subclass writes through. */
  protected persist(): void {
    // In-memory repository keeps state in process only.
  }

  protected loadState(state: Partial<ReturnType<InMemoryG09DueProcessRepository["snapshotState"]>>): void {
    this.preliminaryInquiries.push(...(state.preliminaryInquiries ?? []));
    this.suspensions.push(...(state.suspensions ?? []));
    this.showCauseNotices.push(...(state.showCauseNotices ?? []));
    this.competenceRules.push(...(state.competenceRules ?? []));
    this.authorityAssignments.push(...(state.authorityAssignments ?? []));
    this.consultations.push(...(state.consultations ?? []));
    this.disagreementMemos.push(...(state.disagreementMemos ?? []));
    this.timelineEvents.push(...(state.timelineEvents ?? []));
  }

  protected snapshotState(): {
    preliminaryInquiries: PreliminaryInquiry[];
    suspensions: Suspension[];
    showCauseNotices: ShowCauseNotice[];
    competenceRules: AuthorityCompetenceRule[];
    authorityAssignments: AuthorityLevelAssignment[];
    consultations: CaseConsultation[];
    disagreementMemos: DisagreementMemo[];
    timelineEvents: CaseTimelineEvent[];
  } {
    return {
      preliminaryInquiries: this.preliminaryInquiries,
      suspensions: this.suspensions,
      showCauseNotices: this.showCauseNotices,
      competenceRules: this.competenceRules,
      authorityAssignments: this.authorityAssignments,
      consultations: this.consultations,
      disagreementMemos: this.disagreementMemos,
      timelineEvents: this.timelineEvents,
    };
  }

  private copyOf<T extends object>(row: T | undefined): T | undefined {
    return row ? { ...row } : undefined;
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
 * Durable file-backed implementation: rehydrates due-process state from disk on construction and
 * write-through persists after every mutation with an atomic tmp-file + rename swap. The DI-21
 * tamper test edits this file directly (a DB-layer mutation the app is not complicit in) and the
 * chain verify must detect it.
 */
export class FileBackedG09DueProcessRepository extends InMemoryG09DueProcessRepository {
  constructor(private readonly filePath: string) {
    super();
    this.rehydrate();
  }

  private rehydrate(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = readFileSync(this.filePath, "utf8");
    this.loadState(JSON.parse(raw) as Parameters<InMemoryG09DueProcessRepository["loadState"]>[0]);
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.snapshotState()), "utf8");
    renameSync(tmpPath, this.filePath);
  }
}

/**
 * Default CCS-CCA competence matrix (E23 seed; BRD FR-G09-018): minor penalties from
 * HEAD_OF_OFFICE, major penalties from HEAD_OF_DEPARTMENT, and the Art. 311(1) trio —
 * DISMISSAL, REMOVAL, COMPULSORY_RETIREMENT — only from an authority that is NOT
 * subordinate to the appointing authority.
 */
export function defaultG09CompetenceMatrix(tenantId: string): AuthorityCompetenceRule[] {
  const base = { tenantId, competenceSetCode: "CCS_CCA_2026", subjectCadre: "GENERAL" } as const;
  return [
    { ...base, id: "g09-competence-000001", penaltyClass: "MINOR", minAuthorityLevel: "HEAD_OF_OFFICE", requiresNotSubordinateToAppointing: false },
    { ...base, id: "g09-competence-000002", penaltyClass: "MAJOR", minAuthorityLevel: "HEAD_OF_DEPARTMENT", requiresNotSubordinateToAppointing: false },
    { ...base, id: "g09-competence-000003", penaltyClass: "MAJOR", penaltyType: "DISMISSAL", minAuthorityLevel: "APPOINTING_AUTHORITY", requiresNotSubordinateToAppointing: true },
    { ...base, id: "g09-competence-000004", penaltyClass: "MAJOR", penaltyType: "REMOVAL", minAuthorityLevel: "APPOINTING_AUTHORITY", requiresNotSubordinateToAppointing: true },
    { ...base, id: "g09-competence-000005", penaltyClass: "MAJOR", penaltyType: "COMPULSORY_RETIREMENT", minAuthorityLevel: "APPOINTING_AUTHORITY", requiresNotSubordinateToAppointing: true },
  ];
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over migration 0013_g09_due_process.sql (faithful subset of
// docs/data-model/09-G09-disciplinary-punishment.sql E3/E4/E14/E15/E23/E24 + DI-21 timeline).
// All SQL is parameterised ($1, $2, ...); the timeline append (seq allocation + prev link) and
// the order finalise (gates + order write + timeline) each commit in ONE transaction.
// ---------------------------------------------------------------------------------------

const INSERT_PRELIMINARY_INQUIRY =
  "INSERT INTO g09_preliminary_inquiries (tenant_id, entity_id, case_id, pi_officer_id, ordered_by, ordered_date, due_date, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, 'ORDERED', $8) RETURNING id";

const SUBMIT_PRELIMINARY_INQUIRY =
  "UPDATE g09_preliminary_inquiries SET status = 'SUBMITTED', findings_summary = $3, recommendation = $4, submitted_at = $5, updated_by = $6, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status IN ('ORDERED','IN_PROGRESS')";

const INSERT_SUSPENSION =
  "INSERT INTO g09_suspensions (tenant_id, entity_id, case_id, employee_id, suspension_type, order_no, effective_from, status, subsistence_rate_pct, " +
  "non_employment_certificate_received, charge_memo_due_date, subsistence_revision_due, review_committee_due, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, false, $9, $10, $11, $12) RETURNING id";

const REVISE_SUBSISTENCE =
  "UPDATE g09_suspensions SET subsistence_rate_pct = $3, subsistence_revision_due = $4, updated_by = $5, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE' AND non_employment_certificate_received = true";

const INSERT_SHOW_CAUSE =
  "INSERT INTO g09_show_cause_notices (tenant_id, entity_id, case_id, notice_no, proposed_penalty_json, issued_by, issued_date, response_due_date, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'ISSUED', $9) RETURNING id";

const SELECT_SHOW_CAUSE_FOR_FINALISE =
  "SELECT id, proposed_penalty_json, status FROM g09_show_cause_notices WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const SELECT_PENDING_MANDATORY_CONSULTATIONS =
  "SELECT id, consultation_type, status FROM g09_case_consultations " +
  "WHERE tenant_id = $1 AND case_id = $2 AND is_mandatory = true AND status NOT IN ('CLOSED','WAIVED') AND is_deleted = false";

const SELECT_LAST_TIMELINE_EVENT =
  "SELECT seq_no, row_hash FROM g09_case_timeline_events WHERE tenant_id = $1 AND case_id = $2 ORDER BY seq_no DESC LIMIT 1 FOR UPDATE";

const INSERT_TIMELINE_EVENT =
  "INSERT INTO g09_case_timeline_events (tenant_id, entity_id, case_id, stage, event_type, event_at, actor_id, notes, seq_no, prev_hash, row_hash, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, seq_no";

const SELECT_TIMELINE_CHAIN =
  "SELECT case_id, stage, event_type, event_at, actor_id, notes, seq_no, prev_hash, row_hash FROM g09_case_timeline_events " +
  "WHERE tenant_id = $1 AND case_id = $2 ORDER BY seq_no ASC";

const INSERT_PENALTY_ORDER =
  "INSERT INTO g09_penalty_orders (tenant_id, entity_id, case_id, order_no, passed_by, competence_verified, order_date, reasoning_text, proportionality_reasoning, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, 'FINALISED', $9) RETURNING id";

const INSERT_PENALTY_ITEM =
  "INSERT INTO g09_penalty_items (tenant_id, order_id, penalty_type, penalty_class, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id";

/** Postgres-backed PH-08E G09 due-process repository over migration 0013 tables. */
export class PgG09DueProcessRepository {
  constructor(private readonly pool: Pool) {}

  async insertPreliminaryInquiry(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    piOfficerId: string;
    orderedBy: string;
    orderedDate: string;
    dueDate: string;
    createdBy?: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query(INSERT_PRELIMINARY_INQUIRY, [
      input.tenantId,
      input.entityId ?? null,
      input.caseId,
      input.piOfficerId,
      input.orderedBy,
      input.orderedDate,
      input.dueDate,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string };
  }

  async submitPreliminaryInquiry(input: {
    tenantId: string;
    id: string;
    findingsSummary: string;
    recommendation: PreliminaryInquiryRecommendation;
    submittedAt: string;
    updatedBy?: string;
  }): Promise<void> {
    const result = await this.pool.query(SUBMIT_PRELIMINARY_INQUIRY, [
      input.tenantId,
      input.id,
      input.findingsSummary,
      input.recommendation,
      input.submittedAt,
      input.updatedBy ?? null,
    ]);
    if (result.rowCount === 0) {
      throw new FoundationError("PRECONDITION_FAILED", "Preliminary inquiry is not open for submission");
    }
  }

  /** FR-G09-003: subsistence bounds are validated by the service before this runs. */
  async insertSuspension(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    employeeId: string;
    suspensionType: SuspensionType;
    orderNo: string;
    effectiveFrom: string;
    subsistenceRatePct: number;
    chargeMemoDueDate?: string;
    subsistenceRevisionDue?: string;
    reviewCommitteeDue?: string;
    createdBy?: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query(INSERT_SUSPENSION, [
      input.tenantId,
      input.entityId ?? null,
      input.caseId,
      input.employeeId,
      input.suspensionType,
      input.orderNo,
      input.effectiveFrom,
      input.subsistenceRatePct,
      input.chargeMemoDueDate ?? null,
      input.subsistenceRevisionDue ?? null,
      input.reviewCommitteeDue ?? null,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string };
  }

  /** DI-16: the SQL predicate itself enforces the NEC gate (0 rows updated => certificate missing). */
  async reviseSubsistenceRate(input: { tenantId: string; id: string; newRatePct: number; nextRevisionDue?: string; updatedBy?: string }): Promise<void> {
    const result = await this.pool.query(REVISE_SUBSISTENCE, [input.tenantId, input.id, input.newRatePct, input.nextRevisionDue ?? null, input.updatedBy ?? null]);
    if (result.rowCount === 0) {
      throw new FoundationError("ERR-G09-NON-EMPLOYMENT-CERT-REQUIRED", "Subsistence revision requires the non-employment certificate on an active suspension", {
        field: "non_employment_certificate_received",
      });
    }
  }

  async insertShowCauseNotice(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    noticeNo: string;
    proposedPenalties: G09PenaltyType[];
    issuedBy: string;
    issuedDate: string;
    responseDueDate: string;
    createdBy?: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query(INSERT_SHOW_CAUSE, [
      input.tenantId,
      input.entityId ?? null,
      input.caseId,
      input.noticeNo,
      JSON.stringify(input.proposedPenalties),
      input.issuedBy,
      input.issuedDate,
      input.responseDueDate,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string };
  }

  /** DI-21 append in ONE transaction: lock the chain tail, allocate seq_no, link prev_hash, compute row_hash. */
  async appendTimelineEvent(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    stage: string;
    eventType: TimelineEventType;
    eventAt: string;
    actorId?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<{ id: string; seqNo: number; rowHash: string }> {
    return withTransaction(this.pool, async (client) => {
      const tail = await client.query(SELECT_LAST_TIMELINE_EVENT, [input.tenantId, input.caseId]);
      const last = tail.rows[0] as { seq_no: string | number; row_hash: string } | undefined;
      const seqNo = Number(last?.seq_no ?? 0) + 1;
      const prevHash = last?.row_hash;
      const rowHash = computeTimelineRowHash({ ...input, seqNo, prevHash });
      const inserted = await client.query(INSERT_TIMELINE_EVENT, [
        input.tenantId,
        input.entityId ?? null,
        input.caseId,
        input.stage,
        input.eventType,
        input.eventAt,
        input.actorId ?? null,
        input.notes ?? null,
        seqNo,
        prevHash ?? null,
        rowHash,
        input.createdBy ?? null,
      ]);
      const row = inserted.rows[0] as { id: string; seq_no: string | number };
      return { id: row.id, seqNo: Number(row.seq_no), rowHash };
    });
  }

  /** FR-G09-027 verify: recomputes every hash from row content — stored hashes are never trusted. */
  async verifyTimelineChain(input: { tenantId: string; caseId: string }): Promise<{ verified: true; eventCount: number }> {
    const result = await this.pool.query(SELECT_TIMELINE_CHAIN, [input.tenantId, input.caseId]);
    const rows = result.rows as Array<{
      case_id: string;
      stage: string;
      event_type: string;
      event_at: string;
      actor_id: string | null;
      notes: string | null;
      seq_no: string | number;
      prev_hash: string | null;
      row_hash: string;
    }>;
    verifyTimelineChainRows(
      rows.map((row) => ({
        caseId: row.case_id,
        stage: row.stage,
        eventType: row.event_type,
        eventAt: row.event_at,
        actorId: row.actor_id ?? undefined,
        notes: row.notes ?? undefined,
        seqNo: Number(row.seq_no),
        prevHash: row.prev_hash ?? undefined,
        rowHash: row.row_hash,
      }))
    );
    return { verified: true, eventCount: rows.length };
  }

  /**
   * Order finalise in ONE transaction (DI-4 + DI-13 + DI-14 + DI-26 already service-validated,
   * re-checked here where the data lives): lock the show-cause notice, re-assert the proposed-penalty
   * subset, re-assert no pending mandatory consultation, then write the FINALISED order, its penalty
   * items, close the notice, and append the chained timeline row. A blocked gate rolls back everything.
   */
  async finaliseOrder(input: {
    tenantId: string;
    entityId?: string;
    caseId: string;
    showCauseNoticeId: string;
    orderNo: string;
    passedBy: string;
    orderDate: string;
    reasoningText: string;
    proportionalityReasoning: string;
    penalties: G09PenaltyType[];
    createdBy?: string;
  }): Promise<{ orderId: string; penaltyItemIds: string[] }> {
    return withTransaction(this.pool, async (client) => {
      const noticeResult = await client.query(SELECT_SHOW_CAUSE_FOR_FINALISE, [input.tenantId, input.showCauseNoticeId]);
      const notice = noticeResult.rows[0] as { id: string; proposed_penalty_json: G09PenaltyType[] } | undefined;
      if (!notice) {
        throw new FoundationError("NOT_FOUND", "Show-cause notice not found");
      }
      const proposed = notice.proposed_penalty_json;
      const exceeds = input.penalties.filter((penalty) => !proposed.includes(penalty));
      if (exceeds.length > 0) {
        throw new FoundationError("ERR-G09-PENALTY-EXCEEDS-PROPOSED", "Final penalty is not a subset of the show-cause proposed penalty set (DI-4)", {
          field: "penalties",
          details: { proposed, exceeds },
        });
      }
      const pending = await client.query(SELECT_PENDING_MANDATORY_CONSULTATIONS, [input.tenantId, input.caseId]);
      if ((pending.rowCount ?? 0) > 0) {
        throw new FoundationError("ERR-G09-CONSULTATION-PENDING", "Mandatory consultation is not CLOSED/WAIVED (DI-14)", {
          details: { pendingConsultations: pending.rows.map((row) => (row as { consultation_type: string }).consultation_type) },
        });
      }
      const orderResult = await client.query(INSERT_PENALTY_ORDER, [
        input.tenantId,
        input.entityId ?? null,
        input.caseId,
        input.orderNo,
        input.passedBy,
        input.orderDate,
        input.reasoningText,
        input.proportionalityReasoning,
        input.createdBy ?? null,
      ]);
      const orderId = (orderResult.rows[0] as { id: string }).id;
      const penaltyItemIds: string[] = [];
      for (const penalty of input.penalties) {
        const item = await client.query(INSERT_PENALTY_ITEM, [input.tenantId, orderId, penalty, penaltyClassOf(penalty), input.createdBy ?? null]);
        penaltyItemIds.push((item.rows[0] as { id: string }).id);
      }
      await client.query("UPDATE g09_show_cause_notices SET status = 'CLOSED', updated_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2", [
        input.tenantId,
        input.showCauseNoticeId,
        input.createdBy ?? null,
      ]);
      const tail = await client.query(SELECT_LAST_TIMELINE_EVENT, [input.tenantId, input.caseId]);
      const last = tail.rows[0] as { seq_no: string | number; row_hash: string } | undefined;
      const seqNo = Number(last?.seq_no ?? 0) + 1;
      const prevHash = last?.row_hash;
      const timelineRow = {
        caseId: input.caseId,
        stage: "ORDER",
        eventType: "STAGE_COMPLETED" as TimelineEventType,
        eventAt: input.orderDate,
        actorId: input.passedBy,
        notes: `Penalty order ${input.orderNo} finalised`,
        seqNo,
        prevHash,
      };
      await client.query(INSERT_TIMELINE_EVENT, [
        input.tenantId,
        input.entityId ?? null,
        input.caseId,
        timelineRow.stage,
        timelineRow.eventType,
        timelineRow.eventAt,
        timelineRow.actorId,
        timelineRow.notes,
        seqNo,
        prevHash ?? null,
        computeTimelineRowHash(timelineRow),
        input.createdBy ?? null,
      ]);
      return { orderId, penaltyItemIds };
    });
  }
}

/**
 * DI-21 chain verification shared by the in-memory/file and Postgres paths: seq_nos must be
 * consecutive from 1, each prev_hash must equal the previous row's RECOMPUTED hash, and each
 * row_hash must equal the hash recomputed from the row's own content. Any mismatch throws the
 * BRD-named ERR-G09-AUDIT-CHAIN-BROKEN with the first broken seq_no.
 */
export function verifyTimelineChainRows(
  rows: Array<{
    caseId: string;
    stage: string;
    eventType: string;
    eventAt: string;
    actorId?: string;
    notes?: string;
    seqNo: number;
    prevHash?: string;
    rowHash: string;
  }>
): void {
  let previousRecomputedHash: string | undefined;
  let expectedSeqNo = 1;
  for (const row of rows) {
    const recomputed = computeTimelineRowHash(row);
    const broken =
      row.seqNo !== expectedSeqNo || (row.prevHash ?? undefined) !== previousRecomputedHash || row.rowHash !== recomputed;
    if (broken) {
      throw new FoundationError("ERR-G09-AUDIT-CHAIN-BROKEN", "Case timeline hash chain verification failed (DI-21)", {
        details: { firstBrokenSeqNo: row.seqNo },
      });
    }
    previousRecomputedHash = recomputed;
    expectedSeqNo += 1;
  }
}
