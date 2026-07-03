import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import { withTransaction } from "../../db/pool";
import { FoundationError, TenantScope } from "../../platform/types";

/**
 * PH-08D G08 depth entities (docs/brd/v3/G08-performance-appraisal-management.md):
 *   (1) masters — appraisal_cycles (E1, carrying representation_window_days VAL-G08-REPWINDOW and
 *       min_supervision_months VAL-G08-SUPV), appraisal_templates (E2, weightage_policy), and
 *       rating_scales (E3, benchmark/adverse thresholds);
 *   (2) goals (E5) with the named VAL-WEIGHTAGE/WSUM validator at goal-lock (performance siblings
 *       sum to 100 ±0.01, DEVELOPMENT excluded → ERR-G08-WEIGHTAGE) + form_goal_snapshots (E20);
 *   (3) disclosure ledger (E-apar_disclosure_log, append-only) + representations (E13) with the
 *       representation window (elapsed → ERR-G08-REPWINDOW, condonation required);
 *   (4) multi-RO part-period appraisal_report_periods (E19) — below min_supervision_months yields
 *       a No-Report Certificate; aggregate grade is supervision-weighted (FR-G08-18);
 *   (5) SLA escalation transferring authoring rights (is_escalated_author, FR-G08-19/R9).
 * Follows the PH-08A/PH-08C repository pattern: sync interface + in-memory impl (DI default),
 * a durable file-backed impl, and a Postgres impl over migration 0012 (parameterised SQL only).
 */

export type GoalType = "PERFORMANCE" | "DEVELOPMENT";
export type GoalStatus = "DRAFT" | "APPROVED" | "LOCKED";
export type ReportPeriodStatus = "DRAFT" | "ASSESSED" | "NO_REPORT";
export type RepresentationStatus = "FILED" | "UNDER_REVIEW" | "DISPOSED" | "REJECTED_LATE";

/** E1 appraisal_cycles master (representation window + No-Report threshold live here). */
export interface AppraisalCycle {
  id: string;
  tenantId: string;
  entityId?: string;
  cycleCode: string;
  name: string;
  fiscalYear: string;
  appraisalPeriodStart: string;
  appraisalPeriodEnd: string;
  templateId: string;
  ratingScaleId: string;
  /** VAL-G08-REPWINDOW: days after disclosure dispatch within which a representation may be filed. */
  representationWindowDays: number;
  /** VAL-G08-SUPV: below this a report period is a No-Report Certificate (default 3.0). */
  minSupervisionMonths: number;
  /** FR-G08-21: PROBATION cycles yield a probation decision, never a numeric annual grade. */
  cycleType?: "ANNUAL" | "PROBATION";
  /** E1 probation fields (FR-G08-21 AC.3): cap on cumulative probation extension months. */
  probationPeriodMonths?: number;
  probationExtensionMaxMonths?: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
}

/** E2 appraisal_templates master (immutable per published version; weightage_policy R21). */
export interface AppraisalTemplate {
  id: string;
  tenantId: string;
  entityId?: string;
  templateCode: string;
  name: string;
  version: number;
  weightagePolicy: { performanceSum: number; goalSplitPct: number; competencySplitPct: number; developmentInSum: false };
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
}

/** E3 rating_scales master (numeric range, benchmark and adverse thresholds). */
export interface RatingScale {
  id: string;
  tenantId: string;
  entityId?: string;
  scaleCode: string;
  name: string;
  minValue: number;
  maxValue: number;
  benchmarkGrade: number;
  adverseThreshold: number;
  status: "ACTIVE" | "RETIRED";
}

/** E5 goals row (weightage governed by VAL-WEIGHTAGE/WSUM at lock; DEVELOPMENT excluded). */
export interface AparGoal {
  id: string;
  tenantId: string;
  entityId?: string;
  formId: string;
  appraiseeId: string;
  goalType: GoalType;
  title: string;
  weightage: number;
  status: GoalStatus;
  snapshotted: boolean;
}

/** E20 form_goal_snapshots line — immutable snapshot-on-lock; the roll-up reads this, not live goals. */
export interface FormGoalSnapshot {
  id: string;
  tenantId: string;
  formId: string;
  goalId: string;
  goalType: GoalType;
  title: string;
  weightage: number;
  lockedAt: string;
}

/** apar_disclosure_log append-only entry (monotonic seq_no per form). */
export interface DisclosureLogEntry {
  id: string;
  tenantId: string;
  formId: string;
  seqNo: number;
  eventType: "DISPATCHED" | "ACKNOWLEDGED" | "REPRESENTATION_FILED" | "REPRESENTATION_DISPOSED";
  actorId: string;
  eventAt: string;
}

/** E13 representations row (window enforcement: is_late/condoned; ERR-G08-REPWINDOW). */
export interface AparRepresentation {
  id: string;
  tenantId: string;
  entityId?: string;
  repNo: string;
  formId: string;
  appraiseeId: string;
  grounds: string;
  filedAt: string;
  slaDueAt: string;
  isLate: boolean;
  condoned: boolean;
  escalationLevel: number;
  status: RepresentationStatus;
}

/** E19 appraisal_report_periods row (multi-RO part-period; No-Report below VAL-G08-SUPV). */
export interface AparReportPeriod {
  id: string;
  tenantId: string;
  entityId?: string;
  formId: string;
  sequenceNo: number;
  periodStart: string;
  periodEnd: string;
  reportingOfficerId?: string;
  supervisionMonths: number;
  partPeriodGrade?: number;
  weightInAggregate?: number;
  noReportCertificate: boolean;
  noReportReason?: string;
  status: ReportPeriodStatus;
  /** R9: true when the SLA escalation transferred authoring to a higher authority. */
  isEscalatedAuthor: boolean;
  escalatedAuthorId?: string;
}

// ---------------------------------------------------------------------------------------
// PH-16E — FR-G08-09 calibration as ratified recommendation (E14 calibration_sessions,
// E21 calibration_recommendations, E15 calibration_adjustments; VAL-DISTRIB diagnostic-only;
// ERR-G08-RATIFY), FR-G08-13 PIP lifecycle (E16 performance_improvement_plans +
// E17 pip_milestones), FR-G08-21 probation decision (E34 probation_confirmations).
// ---------------------------------------------------------------------------------------

/** E14 method — FORCED_DISTRIBUTION removed (R2); BELL_CURVE default-off behind its flag. */
export type CalibrationMethod = "COMMITTEE_REVIEW" | "NORMALISATION" | "BELL_CURVE";
export type CalibrationSessionStatus = "PLANNED" | "IN_SESSION" | "RECOMMENDED" | "RATIFIED" | "COMPLETED" | "CANCELLED";
export type CalibrationRecommendationStatus = "PROPOSED" | "ENDORSED" | "REJECTED" | "RATIFIED" | "DECLINED";
export type PipStatus = "DRAFT" | "ACTIVE" | "UNDER_REVIEW" | "CLOSED";
export type PipOutcome = "SUCCESSFUL" | "EXTENDED" | "UNSUCCESSFUL" | "ABANDONED";
export type PipMilestoneStatus = "PENDING" | "ON_TRACK" | "AT_RISK" | "MET" | "MISSED";
/** E4/E34 probation_outcome — a decision, never a numeric APAR grade (FR-G08-21 BR1). */
export type ProbationOutcome = "CONFIRMED" | "EXTENDED" | "DISCHARGE_RECOMMENDED";
export type ProbationConfirmationStatus = "IN_PROBATION" | "CONFIRMED" | "EXTENDED" | "DISCHARGE_RECOMMENDED";

/** E14 calibration_sessions — target_distribution is VAL-DISTRIB diagnostic-only, never a quota. */
export interface CalibrationSession {
  id: string;
  tenantId: string;
  entityId?: string;
  cycleId: string;
  orgUnitScope: string;
  method: CalibrationMethod;
  bellCurveEnabled: boolean;
  /** Diagnostic-only buckets (VAL-DISTRIB: sum 100); NO code path enforces them as a quota. */
  targetDistribution?: Record<string, number>;
  committeeMemberIds: string[];
  runsBeforeCertification: boolean;
  status: CalibrationSessionStatus;
  outcomeSummary?: string;
}

/** E21 calibration_recommendations — the committee proposes; it NEVER writes final_grade (R1). */
export interface CalibrationRecommendation {
  id: string;
  tenantId: string;
  sessionId: string;
  formId: string;
  currentGrade: number;
  recommendedGrade: number;
  /** Mandatory rationale (ERR-REASON-REQ). */
  rationale: string;
  committeeVote?: Record<string, unknown>;
  preCertification: boolean;
  ratifiedBy?: string;
  ratifiedAt?: string;
  recommendationStatus: CalibrationRecommendationStatus;
}

/** E15 calibration_adjustments — applied ONLY after ratification (ERR-G08-RATIFY otherwise). */
export interface CalibrationAdjustment {
  id: string;
  tenantId: string;
  recommendationId: string;
  sessionId: string;
  formId: string;
  oldGrade: number;
  appliedGrade: number;
  ratifiedBy: string;
  appliedAt: string;
  status: "APPLIED" | "REVERSED";
}

/** E16 performance_improvement_plans header (FR-G08-13). */
export interface PerformanceImprovementPlan {
  id: string;
  tenantId: string;
  entityId?: string;
  pipNo: string;
  appraiseeId: string;
  formId?: string;
  /** Initiating RO — the RvO concurrence principal must be distinct (SoD). */
  initiatedBy: string;
  reason: string;
  successCriteria: string;
  startDate: string;
  targetEndDate: string;
  concurredBy?: string;
  outcome?: PipOutcome;
  outcomeSummary?: string;
  status: PipStatus;
}

/** E17 pip_milestones line — a PIP requires >= 1 (FR-G08-13 AC.1). */
export interface PipMilestone {
  id: string;
  tenantId: string;
  pipId: string;
  title: string;
  dueDate: string;
  metric?: string;
  progressNote?: string;
  status: PipMilestoneStatus;
}

/** E34 probation_confirmations — decision lifecycle around the terminal probation_outcome. */
export interface ProbationConfirmation {
  id: string;
  tenantId: string;
  entityId?: string;
  confirmationNo: string;
  appraiseeId: string;
  formId?: string;
  cycleId?: string;
  dateOfJoining?: string;
  probationEndDate: string;
  probationPeriodMonths: number;
  managerId?: string;
  /** Cumulative extension months — capped by cycle.probation_extension_max_months (AC.3). */
  extensionMonthsTotal: number;
  confirmationEffectiveDate?: string;
  /** Terminal probation_outcome (E4/E34) — CONFIRMED, EXTENDED or DISCHARGE_RECOMMENDED. */
  probationOutcome?: ProbationOutcome;
  status: ProbationConfirmationStatus;
  srEventId?: string;
}

/**
 * PH-08D depth repository contract consumed by AparService — cycle/template/scale masters,
 * goals + snapshots, the disclosure ledger, representations and report periods live behind
 * this seam, never in module-local arrays. PH-16E adds calibration sessions/recommendations/
 * adjustments, the PIP header + milestones, and probation confirmations.
 */
export interface AparDepthRepository {
  saveCycle(row: AppraisalCycle): void;
  findCycle(scope: TenantScope, id: string): AppraisalCycle | undefined;
  saveTemplate(row: AppraisalTemplate): void;
  findTemplate(scope: TenantScope, id: string): AppraisalTemplate | undefined;
  saveRatingScale(row: RatingScale): void;
  findRatingScale(scope: TenantScope, id: string): RatingScale | undefined;
  saveGoal(row: AparGoal): void;
  findGoal(scope: TenantScope, id: string): AparGoal | undefined;
  listGoals(scope: TenantScope, formId: string): AparGoal[];
  saveGoalSnapshot(row: FormGoalSnapshot): void;
  listGoalSnapshots(scope: TenantScope, formId: string): FormGoalSnapshot[];
  appendDisclosure(row: Omit<DisclosureLogEntry, "id" | "seqNo">): DisclosureLogEntry;
  listDisclosures(scope: TenantScope, formId: string): DisclosureLogEntry[];
  saveRepresentation(row: AparRepresentation): void;
  listRepresentations(scope: TenantScope, formId: string): AparRepresentation[];
  countRepresentations(): number;
  saveReportPeriod(row: AparReportPeriod): void;
  findReportPeriod(scope: TenantScope, formId: string, sequenceNo: number): AparReportPeriod | undefined;
  listReportPeriods(scope: TenantScope, formId: string): AparReportPeriod[];
  countReportPeriods(): number;
  // PH-16E FR-G08-09 — calibration as ratified recommendation.
  saveCalibrationSession(row: CalibrationSession): void;
  findCalibrationSession(scope: TenantScope, id: string): CalibrationSession | undefined;
  saveCalibrationRecommendation(row: CalibrationRecommendation): void;
  findCalibrationRecommendation(scope: TenantScope, id: string): CalibrationRecommendation | undefined;
  listCalibrationRecommendations(scope: TenantScope, sessionId: string): CalibrationRecommendation[];
  saveCalibrationAdjustment(row: CalibrationAdjustment): void;
  listCalibrationAdjustments(scope: TenantScope, formId: string): CalibrationAdjustment[];
  // PH-16E FR-G08-13 — PIP header + milestones.
  savePip(row: PerformanceImprovementPlan): void;
  findPip(scope: TenantScope, id: string): PerformanceImprovementPlan | undefined;
  /** Single-active guard input: every ACTIVE/UNDER_REVIEW PIP for the employee. */
  listOpenPipsForEmployee(scope: TenantScope, appraiseeId: string): PerformanceImprovementPlan[];
  countPips(): number;
  savePipMilestone(row: PipMilestone): void;
  findPipMilestone(scope: TenantScope, pipId: string, milestoneId: string): PipMilestone | undefined;
  listPipMilestones(scope: TenantScope, pipId: string): PipMilestone[];
  // PH-16E FR-G08-21 — probation confirmation decision lifecycle.
  saveProbationConfirmation(row: ProbationConfirmation): void;
  findProbationConfirmation(scope: TenantScope, id: string): ProbationConfirmation | undefined;
  countProbationConfirmations(): number;
}

/** In-memory implementation (DI default, mirrors InMemoryPromotionDepthRepository). */
export class InMemoryAparDepthRepository implements AparDepthRepository {
  protected readonly cycles: AppraisalCycle[] = [];
  protected readonly templates: AppraisalTemplate[] = [];
  protected readonly ratingScales: RatingScale[] = [];
  protected readonly goals: AparGoal[] = [];
  protected readonly goalSnapshots: FormGoalSnapshot[] = [];
  protected readonly disclosures: DisclosureLogEntry[] = [];
  protected readonly representations: AparRepresentation[] = [];
  protected readonly reportPeriods: AparReportPeriod[] = [];
  protected readonly calibrationSessions: CalibrationSession[] = [];
  protected readonly calibrationRecommendations: CalibrationRecommendation[] = [];
  protected readonly calibrationAdjustments: CalibrationAdjustment[] = [];
  protected readonly pips: PerformanceImprovementPlan[] = [];
  protected readonly pipMilestones: PipMilestone[] = [];
  protected readonly probationConfirmations: ProbationConfirmation[] = [];

  saveCycle(row: AppraisalCycle): void {
    this.upsert(this.cycles, row);
  }

  findCycle(scope: TenantScope, id: string): AppraisalCycle | undefined {
    return this.copyOf(this.cycles.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveTemplate(row: AppraisalTemplate): void {
    this.upsert(this.templates, row);
  }

  findTemplate(scope: TenantScope, id: string): AppraisalTemplate | undefined {
    return this.copyOf(this.templates.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveRatingScale(row: RatingScale): void {
    this.upsert(this.ratingScales, row);
  }

  findRatingScale(scope: TenantScope, id: string): RatingScale | undefined {
    return this.copyOf(this.ratingScales.find((item) => item.id === id && this.inScope(item, scope)));
  }

  saveGoal(row: AparGoal): void {
    this.upsert(this.goals, row);
  }

  findGoal(scope: TenantScope, id: string): AparGoal | undefined {
    return this.copyOf(this.goals.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listGoals(scope: TenantScope, formId: string): AparGoal[] {
    return this.goals.filter((item) => item.formId === formId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  saveGoalSnapshot(row: FormGoalSnapshot): void {
    // E20 is APPEND-ONLY: reject overwrite of an existing snapshot line.
    if (this.goalSnapshots.some((item) => item.id === row.id)) {
      throw new FoundationError("CONFLICT", "form_goal_snapshots is append-only");
    }
    this.goalSnapshots.push({ ...row });
    this.persist();
  }

  listGoalSnapshots(scope: TenantScope, formId: string): FormGoalSnapshot[] {
    return this.goalSnapshots.filter((item) => item.formId === formId && item.tenantId === scope.tenantId).map((item) => ({ ...item }));
  }

  appendDisclosure(row: Omit<DisclosureLogEntry, "id" | "seqNo">): DisclosureLogEntry {
    const seqNo = this.disclosures.filter((item) => item.formId === row.formId && item.tenantId === row.tenantId).length + 1;
    const entry: DisclosureLogEntry = { ...row, id: `disclosure-${this.disclosures.length + 1}`, seqNo };
    this.disclosures.push(entry);
    this.persist();
    return { ...entry };
  }

  listDisclosures(scope: TenantScope, formId: string): DisclosureLogEntry[] {
    return this.disclosures
      .filter((item) => item.formId === formId && item.tenantId === scope.tenantId)
      .sort((left, right) => left.seqNo - right.seqNo)
      .map((item) => ({ ...item }));
  }

  saveRepresentation(row: AparRepresentation): void {
    this.upsert(this.representations, row);
  }

  listRepresentations(scope: TenantScope, formId: string): AparRepresentation[] {
    return this.representations.filter((item) => item.formId === formId && this.inScope(item, scope)).map((item) => ({ ...item }));
  }

  countRepresentations(): number {
    return this.representations.length;
  }

  saveReportPeriod(row: AparReportPeriod): void {
    this.upsert(this.reportPeriods, row);
  }

  findReportPeriod(scope: TenantScope, formId: string, sequenceNo: number): AparReportPeriod | undefined {
    return this.copyOf(
      this.reportPeriods.find((item) => item.formId === formId && item.sequenceNo === sequenceNo && this.inScope(item, scope))
    );
  }

  listReportPeriods(scope: TenantScope, formId: string): AparReportPeriod[] {
    return this.reportPeriods
      .filter((item) => item.formId === formId && this.inScope(item, scope))
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((item) => ({ ...item }));
  }

  countReportPeriods(): number {
    return this.reportPeriods.length;
  }

  saveCalibrationSession(row: CalibrationSession): void {
    this.upsert(this.calibrationSessions, {
      ...row,
      committeeMemberIds: [...row.committeeMemberIds],
      targetDistribution: row.targetDistribution ? { ...row.targetDistribution } : undefined,
    });
  }

  findCalibrationSession(scope: TenantScope, id: string): CalibrationSession | undefined {
    const session = this.calibrationSessions.find((item) => item.id === id && this.inScope(item, scope));
    return session
      ? { ...session, committeeMemberIds: [...session.committeeMemberIds], targetDistribution: session.targetDistribution ? { ...session.targetDistribution } : undefined }
      : undefined;
  }

  saveCalibrationRecommendation(row: CalibrationRecommendation): void {
    this.upsert(this.calibrationRecommendations, row);
  }

  findCalibrationRecommendation(scope: TenantScope, id: string): CalibrationRecommendation | undefined {
    return this.copyOf(this.calibrationRecommendations.find((item) => item.id === id && item.tenantId === scope.tenantId));
  }

  listCalibrationRecommendations(scope: TenantScope, sessionId: string): CalibrationRecommendation[] {
    return this.calibrationRecommendations
      .filter((item) => item.sessionId === sessionId && item.tenantId === scope.tenantId)
      .map((item) => ({ ...item }));
  }

  saveCalibrationAdjustment(row: CalibrationAdjustment): void {
    this.upsert(this.calibrationAdjustments, row);
  }

  listCalibrationAdjustments(scope: TenantScope, formId: string): CalibrationAdjustment[] {
    return this.calibrationAdjustments
      .filter((item) => item.formId === formId && item.tenantId === scope.tenantId)
      .map((item) => ({ ...item }));
  }

  savePip(row: PerformanceImprovementPlan): void {
    this.upsert(this.pips, row);
  }

  findPip(scope: TenantScope, id: string): PerformanceImprovementPlan | undefined {
    return this.copyOf(this.pips.find((item) => item.id === id && this.inScope(item, scope)));
  }

  listOpenPipsForEmployee(scope: TenantScope, appraiseeId: string): PerformanceImprovementPlan[] {
    return this.pips
      .filter(
        (item) =>
          item.appraiseeId === appraiseeId &&
          (item.status === "ACTIVE" || item.status === "UNDER_REVIEW") &&
          this.inScope(item, scope)
      )
      .map((item) => ({ ...item }));
  }

  countPips(): number {
    return this.pips.length;
  }

  savePipMilestone(row: PipMilestone): void {
    this.upsert(this.pipMilestones, row);
  }

  findPipMilestone(scope: TenantScope, pipId: string, milestoneId: string): PipMilestone | undefined {
    return this.copyOf(
      this.pipMilestones.find((item) => item.id === milestoneId && item.pipId === pipId && item.tenantId === scope.tenantId)
    );
  }

  listPipMilestones(scope: TenantScope, pipId: string): PipMilestone[] {
    return this.pipMilestones.filter((item) => item.pipId === pipId && item.tenantId === scope.tenantId).map((item) => ({ ...item }));
  }

  saveProbationConfirmation(row: ProbationConfirmation): void {
    this.upsert(this.probationConfirmations, row);
  }

  findProbationConfirmation(scope: TenantScope, id: string): ProbationConfirmation | undefined {
    return this.copyOf(this.probationConfirmations.find((item) => item.id === id && this.inScope(item, scope)));
  }

  countProbationConfirmations(): number {
    return this.probationConfirmations.length;
  }

  /** Durability hook — no-op in memory; the file-backed subclass writes through. */
  protected persist(): void {
    // In-memory repository keeps state in process only.
  }

  protected loadState(state: Partial<ReturnType<InMemoryAparDepthRepository["snapshotState"]>>): void {
    this.cycles.push(...(state.cycles ?? []));
    this.templates.push(...(state.templates ?? []));
    this.ratingScales.push(...(state.ratingScales ?? []));
    this.goals.push(...(state.goals ?? []));
    this.goalSnapshots.push(...(state.goalSnapshots ?? []));
    this.disclosures.push(...(state.disclosures ?? []));
    this.representations.push(...(state.representations ?? []));
    this.reportPeriods.push(...(state.reportPeriods ?? []));
    this.calibrationSessions.push(...(state.calibrationSessions ?? []));
    this.calibrationRecommendations.push(...(state.calibrationRecommendations ?? []));
    this.calibrationAdjustments.push(...(state.calibrationAdjustments ?? []));
    this.pips.push(...(state.pips ?? []));
    this.pipMilestones.push(...(state.pipMilestones ?? []));
    this.probationConfirmations.push(...(state.probationConfirmations ?? []));
  }

  protected snapshotState(): {
    cycles: AppraisalCycle[];
    templates: AppraisalTemplate[];
    ratingScales: RatingScale[];
    goals: AparGoal[];
    goalSnapshots: FormGoalSnapshot[];
    disclosures: DisclosureLogEntry[];
    representations: AparRepresentation[];
    reportPeriods: AparReportPeriod[];
    calibrationSessions: CalibrationSession[];
    calibrationRecommendations: CalibrationRecommendation[];
    calibrationAdjustments: CalibrationAdjustment[];
    pips: PerformanceImprovementPlan[];
    pipMilestones: PipMilestone[];
    probationConfirmations: ProbationConfirmation[];
  } {
    return {
      cycles: this.cycles,
      templates: this.templates,
      ratingScales: this.ratingScales,
      goals: this.goals,
      goalSnapshots: this.goalSnapshots,
      disclosures: this.disclosures,
      representations: this.representations,
      reportPeriods: this.reportPeriods,
      calibrationSessions: this.calibrationSessions,
      calibrationRecommendations: this.calibrationRecommendations,
      calibrationAdjustments: this.calibrationAdjustments,
      pips: this.pips,
      pipMilestones: this.pipMilestones,
      probationConfirmations: this.probationConfirmations,
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
 * Durable file-backed implementation: rehydrates depth-entity state from disk on construction
 * and write-through persists after every mutation with an atomic tmp-file + rename swap.
 */
export class FileBackedAparDepthRepository extends InMemoryAparDepthRepository {
  constructor(private readonly filePath: string) {
    super();
    this.rehydrate();
  }

  private rehydrate(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = readFileSync(this.filePath, "utf8");
    this.loadState(JSON.parse(raw) as Parameters<InMemoryAparDepthRepository["loadState"]>[0]);
  }

  protected override persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.snapshotState()), "utf8");
    renameSync(tmpPath, this.filePath);
  }
}

// ---------------------------------------------------------------------------------------
// Postgres-backed repository over migration 0012_g08_apar_depth.sql (faithful subset of
// docs/data-model/08-G08-performance-appraisal.sql E1/E2/E3/E5/E13/E19/E20 + disclosure log).
// All SQL is parameterised ($1, $2, ...); goal lock (validate + snapshot), disclosure dispatch
// and part-period aggregation each commit in ONE transaction.
// ---------------------------------------------------------------------------------------

const SELECT_GOALS_FOR_LOCK =
  "SELECT id, goal_type, title, weightage FROM g08_goals WHERE tenant_id = $1 AND form_id = $2 AND is_deleted = false FOR UPDATE";

const LOCK_GOAL =
  "UPDATE g08_goals SET status = 'LOCKED', snapshotted = true, updated_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2";

const INSERT_GOAL_SNAPSHOT =
  "INSERT INTO g08_form_goal_snapshots (tenant_id, form_id, goal_id, goal_type, title, weightage, locked_at, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id";

const INSERT_DISCLOSURE =
  "INSERT INTO g08_apar_disclosure_log (tenant_id, form_id, seq_no, event_type, actor_id, event_at, created_by) " +
  "VALUES ($1, $2, (SELECT COALESCE(MAX(seq_no), 0) + 1 FROM g08_apar_disclosure_log WHERE tenant_id = $1 AND form_id = $2), $3, $4, $5, $6) " +
  "RETURNING id, seq_no";

const INSERT_REPRESENTATION =
  "INSERT INTO g08_representations (tenant_id, entity_id, rep_no, form_id, appraisee_id, grounds, filed_at, sla_due_at, is_late, condoned, escalation_level, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, 'FILED', $11) RETURNING id, is_late";

const INSERT_REPORT_PERIOD =
  "INSERT INTO g08_appraisal_report_periods (tenant_id, entity_id, form_id, sequence_no, period_start, period_end, reporting_officer_id, " +
  "supervision_months, part_period_grade, no_report_certificate, no_report_reason, status, is_escalated_author, escalated_author_id, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id";

const SELECT_PERIODS_FOR_AGGREGATE =
  "SELECT id, sequence_no, supervision_months, part_period_grade, no_report_certificate FROM g08_appraisal_report_periods " +
  "WHERE tenant_id = $1 AND form_id = $2 AND is_deleted = false FOR UPDATE";

const SET_PERIOD_WEIGHT =
  "UPDATE g08_appraisal_report_periods SET weight_in_aggregate = $3, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2";

/** Postgres-backed PH-08D G08 depth repository over migration 0012 tables. */
export class PgAparDepthRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Goal lock in ONE transaction: SELECT ... FOR UPDATE, run the named VAL-WEIGHTAGE/WSUM
   * validation (performance siblings sum to 100 ±0.01, DEVELOPMENT excluded — ERR-G08-WEIGHTAGE),
   * then lock every goal and write the immutable E20 snapshots.
   */
  async lockGoalsWithSnapshot(input: { tenantId: string; formId: string; lockedAt: string; updatedBy?: string }): Promise<{ snapshotIds: string[] }> {
    return withTransaction(this.pool, async (client) => {
      const goals = await client.query(SELECT_GOALS_FOR_LOCK, [input.tenantId, input.formId]);
      const rows = goals.rows as Array<{ id: string; goal_type: GoalType; title: string; weightage: string | number }>;
      validateWeightageSumWSUM(rows.map((row) => ({ goalType: row.goal_type, weightage: Number(row.weightage) })));
      const snapshotIds: string[] = [];
      for (const row of rows) {
        await client.query(LOCK_GOAL, [input.tenantId, row.id, input.updatedBy ?? null]);
        const snapshot = await client.query(INSERT_GOAL_SNAPSHOT, [
          input.tenantId,
          input.formId,
          row.id,
          row.goal_type,
          row.title,
          row.weightage,
          input.lockedAt,
          input.updatedBy ?? null,
        ]);
        snapshotIds.push((snapshot.rows[0] as { id: string }).id);
      }
      return { snapshotIds };
    });
  }

  /** Disclosure dispatch: append-only ledger row with a monotonic per-form seq_no. */
  async appendDisclosure(input: {
    tenantId: string;
    formId: string;
    eventType: DisclosureLogEntry["eventType"];
    actorId: string;
    eventAt: string;
    createdBy?: string;
  }): Promise<{ id: string; seqNo: number }> {
    const result = await this.pool.query(INSERT_DISCLOSURE, [
      input.tenantId,
      input.formId,
      input.eventType,
      input.actorId,
      input.eventAt,
      input.createdBy ?? null,
    ]);
    const row = result.rows[0] as { id: string; seq_no: number };
    return { id: row.id, seqNo: Number(row.seq_no) };
  }

  async insertRepresentation(input: {
    tenantId: string;
    entityId?: string;
    repNo: string;
    formId: string;
    appraiseeId: string;
    grounds: string;
    filedAt: string;
    slaDueAt: string;
    isLate: boolean;
    condoned: boolean;
    createdBy?: string;
  }): Promise<{ id: string; isLate: boolean }> {
    const result = await this.pool.query(INSERT_REPRESENTATION, [
      input.tenantId,
      input.entityId ?? null,
      input.repNo,
      input.formId,
      input.appraiseeId,
      input.grounds,
      input.filedAt,
      input.slaDueAt,
      input.isLate,
      input.condoned,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string; isLate: boolean };
  }

  async insertReportPeriod(input: {
    tenantId: string;
    entityId?: string;
    formId: string;
    sequenceNo: number;
    periodStart: string;
    periodEnd: string;
    reportingOfficerId?: string;
    supervisionMonths: number;
    partPeriodGrade?: number;
    noReportCertificate: boolean;
    noReportReason?: string;
    status: ReportPeriodStatus;
    isEscalatedAuthor: boolean;
    escalatedAuthorId?: string;
    createdBy?: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query(INSERT_REPORT_PERIOD, [
      input.tenantId,
      input.entityId ?? null,
      input.formId,
      input.sequenceNo,
      input.periodStart,
      input.periodEnd,
      input.reportingOfficerId ?? null,
      input.supervisionMonths,
      input.partPeriodGrade ?? null,
      input.noReportCertificate,
      input.noReportReason ?? null,
      input.status,
      input.isEscalatedAuthor,
      input.escalatedAuthorId ?? null,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string };
  }

  /**
   * FR-G08-18 aggregation in ONE transaction: locks the form's periods, computes each period's
   * supervision-weighted share (NO_REPORT excluded), persists weight_in_aggregate and returns
   * the supervision-weighted provisional grade.
   */
  async aggregateProvisionalGrade(input: { tenantId: string; formId: string; updatedBy?: string }): Promise<{ provisionalGrade: number }> {
    return withTransaction(this.pool, async (client) => {
      const periods = await client.query(SELECT_PERIODS_FOR_AGGREGATE, [input.tenantId, input.formId]);
      const rows = periods.rows as Array<{ id: string; supervision_months: string | number; part_period_grade: string | number | null; no_report_certificate: boolean }>;
      const graded = rows.filter((row) => !row.no_report_certificate && row.part_period_grade !== null);
      const totalSupervision = graded.reduce((sum, row) => sum + Number(row.supervision_months), 0);
      if (totalSupervision <= 0) {
        throw new FoundationError("PRECONDITION_FAILED", "No gradable supervision period to aggregate");
      }
      let provisionalGrade = 0;
      for (const row of graded) {
        const weight = Number(row.supervision_months) / totalSupervision;
        provisionalGrade += weight * Number(row.part_period_grade);
        await client.query(SET_PERIOD_WEIGHT, [input.tenantId, row.id, Math.round(weight * 10000) / 100, input.updatedBy ?? null]);
      }
      return { provisionalGrade: Math.round(provisionalGrade * 100) / 100 };
    });
  }

  /**
   * FR-G08-09 (PH-16E): committee recommendation into g08_calibration_recommendations —
   * mandatory rationale enforced fail-closed. The committee NEVER writes final_grade (R1).
   */
  async insertCalibrationRecommendation(input: {
    tenantId: string;
    sessionId: string;
    formId: string;
    currentGrade: number;
    recommendedGrade: number;
    rationale: string;
    committeeVote?: Record<string, unknown>;
    preCertification: boolean;
    createdBy?: string;
  }): Promise<{ id: string }> {
    if (!input.rationale) {
      throw new FoundationError("VALIDATION_FAILED", "ERR-REASON-REQ: calibration recommendation rationale is mandatory", { field: "rationale" });
    }
    const result = await this.pool.query(INSERT_CALIBRATION_RECOMMENDATION, [
      input.tenantId,
      input.sessionId,
      input.formId,
      input.currentGrade,
      input.recommendedGrade,
      input.rationale,
      input.committeeVote ? JSON.stringify(input.committeeVote) : null,
      input.preCertification,
      input.createdBy ?? null,
    ]);
    return result.rows[0] as { id: string };
  }

  /**
   * FR-G08-09 AC.4 (R1) in ONE transaction: lock the recommendation row; anything other than
   * recommendation_status='RATIFIED' throws ERR-G08-RATIFY (409, fail closed); then write the
   * g08_calibration_adjustments ratification record preserving old_grade.
   */
  async applyRatifiedCalibrationAdjustment(input: {
    tenantId: string;
    recommendationId: string;
    appliedAt: string;
    createdBy?: string;
  }): Promise<{ adjustmentId: string; appliedGrade: number }> {
    return withTransaction(this.pool, async (client) => {
      const locked = await client.query(LOCK_CALIBRATION_RECOMMENDATION, [input.tenantId, input.recommendationId]);
      const row = locked.rows[0] as
        | { id: string; session_id: string; form_id: string; current_grade: string | number; recommended_grade: string | number; ratified_by: string | null; recommendation_status: string }
        | undefined;
      if (!row) {
        throw new FoundationError("NOT_FOUND", "Calibration recommendation not found");
      }
      if (row.recommendation_status !== "RATIFIED" || !row.ratified_by) {
        throw new FoundationError("ERR-G08-RATIFY", "A certified grade changes only via a RATIFIED calibration recommendation", {
          details: { recommendationId: input.recommendationId, recommendationStatus: row.recommendation_status },
        });
      }
      const adjustment = await client.query(INSERT_CALIBRATION_ADJUSTMENT, [
        input.tenantId,
        row.id,
        row.session_id,
        row.form_id,
        Number(row.current_grade),
        Number(row.recommended_grade),
        row.ratified_by,
        input.appliedAt,
        input.createdBy ?? null,
      ]);
      return { adjustmentId: (adjustment.rows[0] as { id: string }).id, appliedGrade: Number(row.recommended_grade) };
    });
  }

  /**
   * FR-G08-13 AC.1 in ONE transaction: the performance_improvement_plans header commits together
   * with its >= 1 pip_milestones rows — a milestone-less PIP is rejected before any write.
   */
  async insertPipWithMilestones(input: {
    tenantId: string;
    entityId?: string;
    pipNo: string;
    appraiseeId: string;
    formId?: string;
    initiatedBy: string;
    reason: string;
    successCriteria: string;
    startDate: string;
    targetEndDate: string;
    milestones: Array<{ title: string; dueDate: string; metric?: string }>;
    createdBy?: string;
  }): Promise<{ pipId: string; milestoneIds: string[] }> {
    if (input.milestones.length === 0) {
      throw new FoundationError("VALIDATION_FAILED", "A PIP requires at least one pip_milestones row", { field: "milestones" });
    }
    return withTransaction(this.pool, async (client) => {
      const pip = await client.query(INSERT_PIP, [
        input.tenantId,
        input.entityId ?? null,
        input.pipNo,
        input.appraiseeId,
        input.formId ?? null,
        input.initiatedBy,
        input.reason,
        input.successCriteria,
        input.startDate,
        input.targetEndDate,
        input.createdBy ?? null,
      ]);
      const pipId = (pip.rows[0] as { id: string }).id;
      const milestoneIds: string[] = [];
      for (const milestone of input.milestones) {
        const inserted = await client.query(INSERT_PIP_MILESTONE, [
          input.tenantId,
          pipId,
          milestone.title,
          milestone.dueDate,
          milestone.metric ?? null,
          input.createdBy ?? null,
        ]);
        milestoneIds.push((inserted.rows[0] as { id: string }).id);
      }
      return { pipId, milestoneIds };
    });
  }

  /**
   * FR-G08-21 (PH-16E): the probation decision writes probation_outcome on
   * g08_probation_confirmations; the extension cap against probation_extension_max_months is
   * re-checked in the service against the governing cycle before this write.
   */
  async decideProbationConfirmation(input: {
    tenantId: string;
    confirmationId: string;
    probationOutcome: "CONFIRMED" | "EXTENDED" | "DISCHARGE_RECOMMENDED";
    status: string;
    confirmationEffectiveDate?: string;
    extensionMonthsTotal?: number;
    probationEndDate?: string;
    updatedBy?: string;
  }): Promise<void> {
    await this.pool.query(SET_PROBATION_DECISION, [
      input.tenantId,
      input.confirmationId,
      input.probationOutcome,
      input.status,
      input.confirmationEffectiveDate ?? null,
      input.extensionMonthsTotal ?? null,
      input.probationEndDate ?? null,
      input.updatedBy ?? null,
    ]);
  }
}

// PH-16E parameterised SQL over migration 0032 tables (g08_calibration_sessions,
// g08_calibration_recommendations, g08_calibration_adjustments,
// g08_performance_improvement_plans, g08_pip_milestones, g08_probation_confirmations).

const INSERT_CALIBRATION_RECOMMENDATION =
  "INSERT INTO g08_calibration_recommendations (tenant_id, session_id, form_id, current_grade, recommended_grade, rationale, committee_vote, pre_certification, recommendation_status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'PROPOSED', $9) RETURNING id";

const LOCK_CALIBRATION_RECOMMENDATION =
  "SELECT id, session_id, form_id, current_grade, recommended_grade, ratified_by, recommendation_status " +
  "FROM g08_calibration_recommendations WHERE tenant_id = $1 AND id = $2 AND is_deleted = false FOR UPDATE";

const INSERT_CALIBRATION_ADJUSTMENT =
  "INSERT INTO g08_calibration_adjustments (tenant_id, recommendation_id, session_id, form_id, old_grade, applied_grade, ratified_by, applied_at, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'APPLIED', $9) RETURNING id";

const INSERT_PIP =
  "INSERT INTO g08_performance_improvement_plans (tenant_id, entity_id, pip_no, appraisee_id, form_id, initiated_by, reason, success_criteria, start_date, target_end_date, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11) RETURNING id";

const INSERT_PIP_MILESTONE =
  "INSERT INTO g08_pip_milestones (tenant_id, pip_id, title, due_date, metric, status, created_by) " +
  "VALUES ($1, $2, $3, $4, $5, 'PENDING', $6) RETURNING id";

const SET_PROBATION_DECISION =
  // probation_outcome is the E4/E34 terminal decision; extension bumps the cumulative months and
  // the successor probation_end_date window (cap: cycle.probation_extension_max_months).
  "UPDATE g08_probation_confirmations SET probation_outcome = $3, status = $4, confirmation_effective_date = COALESCE($5, confirmation_effective_date), " +
  "extension_months_total = COALESCE($6, extension_months_total), probation_end_date = COALESCE($7, probation_end_date), updated_by = $8, updated_at = now() " +
  "WHERE tenant_id = $1 AND id = $2 AND is_deleted = false";

/**
 * VAL-WEIGHTAGE/WSUM (BRD G08 §5.6 rule 1, R21): sibling APPROVED performance goals must sum to
 * 100 (±0.01) at goal-lock; DEVELOPMENT goals sit OUTSIDE the performance sum. Violation throws
 * the BRD-named domain code ERR-G08-WEIGHTAGE (422 VALIDATION_FAILED on the wire).
 */
export function validateWeightageSumWSUM(goals: Array<{ goalType: GoalType; weightage: number }>): void {
  const performanceGoals = goals.filter((goal) => goal.goalType === "PERFORMANCE");
  if (performanceGoals.length === 0) {
    throw new FoundationError("ERR-G08-WEIGHTAGE", "VAL-WEIGHTAGE/WSUM: at least one performance goal is required at lock", {
      field: "weightage",
      details: { validation: "VAL-WEIGHTAGE/WSUM", performanceGoalCount: 0 },
    });
  }
  const sum = performanceGoals.reduce((total, goal) => total + goal.weightage, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new FoundationError("ERR-G08-WEIGHTAGE", "VAL-WEIGHTAGE/WSUM: performance goal weightages must sum to 100 (±0.01) at lock", {
      field: "weightage",
      details: { validation: "VAL-WEIGHTAGE/WSUM", weightageSum: sum, developmentExcluded: true },
    });
  }
}
