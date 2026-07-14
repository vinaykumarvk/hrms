import { NotificationService } from "../../notifications/notificationService";
import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";
import { ActorContext, FoundationError, TenantScope, nextId, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import {
  AparDepthRepository,
  AparGoal,
  AparReportPeriod,
  AparRepresentation,
  AppraisalCycle,
  AppraisalTemplate,
  CalibrationAdjustment,
  CalibrationMethod,
  CalibrationRecommendation,
  CalibrationSession,
  DisclosureLogEntry,
  FormGoalSnapshot,
  InMemoryAparDepthRepository,
  PerformanceImprovementPlan,
  PipMilestone,
  PipMilestoneStatus,
  PipOutcome,
  ProbationConfirmation,
  ProbationOutcome,
  RatingScale,
  validateWeightageSumWSUM,
} from "./aparDepthRepository";

/** FR-G08-03/BRD S3.2: appraisee has C/R/U on their own form only; HR/APAR Cell (HR Admin +
 * Performance Admin) may act on behalf per BRD S2 role mapping. */
const APAR_SELF_OVERRIDE_ROLES = new Set(["hr_admin", "performance_admin", "system"]);

/** Adds whole days to an ISO date (yyyy-mm-dd) — representation window arithmetic. */
export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    throw new FoundationError("VALIDATION_FAILED", "Date must be yyyy-mm-dd", { field: "date", details: { isoDate } });
  }
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export type AparStatus =
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

export interface AparForm {
  id: string;
  tenantId: string;
  entityId?: string;
  formNo: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: AparStatus;
  reportingOfficerId: string;
  reviewingOfficerId: string;
  acceptingAuthorityId: string;
  workflowInstanceId?: string;
  grade?: string;
  sealedCover: boolean;
  g06FeedSuppressed: boolean;
  documentId?: string;
  srEventId?: string;
  /** PH-08D: the governing appraisal_cycles master (representation window, SUPV threshold). */
  cycleId?: string;
  /** VAL-WEIGHTAGE/WSUM passed and the E20 snapshot is written. */
  goalsLocked: boolean;
  /** Disclosure dispatch date; starts the representation-window clock (DISPATCH). */
  disclosedOn?: string;
  /** disclosedOn + cycle.representation_window_days — filing after this is ERR-G08-REPWINDOW. */
  representationDueBy?: string;
  /** FR-G08-18: supervision-weighted aggregate of part-period grades (multi-RO). */
  provisionalGrade?: number;
  /** E7 self_appraisals (FR-G08-03 AC2): the appraisee's own achievements narrative. */
  selfAppraisalNarrative?: string;
  /** E7 self_appraisals (FR-G08-03 AC2): per-goal self-ratings, keyed by goal id. */
  selfAppraisalRatings?: Record<string, number>;
}

export class AparService {
  private readonly forms: AparForm[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly notifications: NotificationService,
    // PH-08D: cycle/template/scale masters, goals+snapshots, disclosure ledger, representations
    // and multi-RO report periods live behind the repository seam.
    private readonly depth: AparDepthRepository = new InMemoryAparDepthRepository()
  ) {}

  openForm(
    actor: ActorContext,
    input: {
      employeeId: string;
      periodStart: string;
      periodEnd: string;
      reportingOfficerId: string;
      reviewingOfficerId: string;
      acceptingAuthorityId: string;
      underCharge?: boolean;
      cycleId?: string;
    }
  ): AparForm {
    this.authorization.check(actor, "g08.apar.form.open", actor);
    if (!this.employeeMaster.getById(actor, input.employeeId)) {
      throw new FoundationError("NOT_FOUND", "Employee not found");
    }
    // P02 SoD: the appraisee cannot author their own RO/RvO tiers (self-adjudication barred).
    if (input.reportingOfficerId === input.employeeId || input.reviewingOfficerId === input.employeeId) {
      throw new FoundationError("FORBIDDEN", "Appraisee cannot be assigned as their own reporting/reviewing officer");
    }
    if (input.cycleId && !this.depth.findCycle(actor, input.cycleId)) {
      throw new FoundationError("NOT_FOUND", "Appraisal cycle not found");
    }
    const sealed = Boolean(input.underCharge);
    const started = sealed
      ? undefined
      : this.workflow.start(actor, {
          workflowCode: "WF-G08-APAR-SEQUENTIAL",
          subjectRef: `g08_apar_forms:${input.employeeId}:${input.periodStart}`,
          stage: "GOALS_PENDING",
          resolverRule: { mechanism: "REPORTING_CHAIN", subjectEmployeeId: input.employeeId },
          asOf: input.periodStart,
        });
    const form: AparForm = {
      id: nextId("apar-form", this.forms.length),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      formNo: `APAR/${input.periodStart.slice(0, 4)}/${String(this.forms.length + 1).padStart(5, "0")}`,
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: sealed ? "SEALED_COVER" : "GOALS_PENDING",
      reportingOfficerId: input.reportingOfficerId,
      reviewingOfficerId: input.reviewingOfficerId,
      acceptingAuthorityId: input.acceptingAuthorityId,
      workflowInstanceId: started?.instance.id,
      sealedCover: sealed,
      g06FeedSuppressed: sealed,
      cycleId: input.cycleId,
      goalsLocked: false,
    };
    this.forms.push(form);
    this.audit.recordMutation(actor, {
      action: "G08_APAR_OPENED",
      subjectRef: `g08_apar_forms:${form.id}`,
      metadata: sealed ? { marker: "SEALED_COVER", feed: "G08_G06_FEED_SUPPRESSED" } : { workflowInstanceId: form.workflowInstanceId },
    });
    return { ...form };
  }

  /** Every form the given employee appears on as appraisee, newest first. Appraisee-self or an
   * HR/APAR Cell override role only — this is the self-service form-discovery surface (BRD S3.2:
   * appraisee has R on their own forms), not a manager/RO/RvO reporting view. */
  listMyForms(actor: ActorContext, employeeId: string): AparForm[] {
    requireTenantScope(actor);
    this.assertSelfOrOverride(actor, employeeId);
    return this.forms.filter((form) => this.inScope(form, actor) && form.employeeId === employeeId).map((form) => ({ ...form }));
  }

  /** AC2: "Achievements narrative mandatory (VAL-REQUIRED); per-goal self-ratings within scale
   *  bounds." Ratings are keyed by goal id; each must name a real goal on this form, and — when
   *  the form's cycle resolves a rating scale — fall within that scale's min/max (never an
   *  invented bound when no cycle/scale is bound to the form). */
  submitSelf(actor: ActorContext, formId: string, input: { narrative: string; selfRatings?: Record<string, number> }): AparForm {
    this.authorization.check(actor, "g08.apar.self.submit", actor);
    const form = this.requireForm(actor, formId);
    this.assertSelfOrOverride(actor, form.employeeId);
    this.requireStatus(form, "GOALS_PENDING");
    // R6/R21: once goals exist they must be locked (WSUM-validated + snapshotted) before self-appraisal.
    if (!form.goalsLocked && this.depth.listGoals(actor, form.id).length > 0) {
      throw new FoundationError("PRECONDITION_FAILED", "Goals must be locked (VAL-WEIGHTAGE/WSUM) before self-appraisal");
    }
    if (!input.narrative.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "Achievements narrative is required", { field: "narrative" });
    }
    if (input.selfRatings) {
      const goals = this.depth.listGoals(actor, form.id);
      const cycle = form.cycleId ? this.depth.findCycle(actor, form.cycleId) : undefined;
      const scale = cycle ? this.depth.findRatingScale(actor, cycle.ratingScaleId) : undefined;
      for (const [goalId, rating] of Object.entries(input.selfRatings)) {
        if (!goals.some((goal) => goal.id === goalId)) {
          throw new FoundationError("VALIDATION_FAILED", `Self-rating references an unknown goal: ${goalId}`, { field: "selfRatings" });
        }
        if (scale && (rating < scale.minValue || rating > scale.maxValue)) {
          throw new FoundationError("VALIDATION_FAILED", `Self-rating for goal ${goalId} is outside the scale bounds`, { field: "selfRatings" });
        }
      }
    }
    form.selfAppraisalNarrative = input.narrative;
    form.selfAppraisalRatings = input.selfRatings ? { ...input.selfRatings } : undefined;
    form.status = "RO_ASSESSMENT";
    this.audit.recordMutation(actor, { action: "G08_SELF_SUBMITTED", subjectRef: `g08_apar_forms:${form.id}` });
    return { ...form };
  }

  recordReporting(actor: ActorContext, formId: string, input: { grade: string; narrative: string }): AparForm {
    this.authorization.check(actor, "g08.apar.report", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "RO_ASSESSMENT");
    if (!input.narrative) {
      throw new FoundationError("VALIDATION_FAILED", "Reporting narrative is required", { field: "narrative" });
    }
    form.grade = input.grade;
    form.status = "RVO_REVIEW";
    this.audit.recordMutation(actor, { action: "G08_RO_ASSESSMENT", subjectRef: `g08_apar_forms:${form.id}` });
    return { ...form };
  }

  recordReview(actor: ActorContext, formId: string, input: { concur: boolean; remarks: string }): AparForm {
    this.authorization.check(actor, "g08.apar.review", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "RVO_REVIEW");
    form.status = "AA_ACCEPTANCE";
    this.audit.recordMutation(actor, { action: "G08_RVO_REVIEW", subjectRef: `g08_apar_forms:${form.id}`, metadata: { concur: input.concur, remarks: input.remarks } });
    return { ...form };
  }

  accept(actor: ActorContext, formId: string, input: { finalGrade: string }): AparForm {
    this.authorization.check(actor, "g08.apar.accept", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "AA_ACCEPTANCE");
    const document = this.documentVault.createDocument(actor, {
      title: `Final APAR ${form.formNo}`,
      ownerEmployeeId: form.employeeId,
      classification: "SECRET",
      contentHash: pseudoHash64(stableStringify({ formNo: form.formNo, grade: input.finalGrade })),
      isWorm: true,
    });
    const attached = this.documentVault.attach(actor, document.id, {
      moduleCode: "G08",
      entityName: "apar_forms",
      entityRefId: form.id,
      linkRole: "FINAL_APAR",
    });
    form.grade = input.finalGrade;
    form.status = "FINALISED";
    form.documentId = attached.id;
    form.g06FeedSuppressed = false;
    this.audit.recordMutation(actor, { action: "G08_AA_ACCEPTANCE", subjectRef: `g08_apar_forms:${form.id}`, metadata: { documentId: attached.id } });
    return { ...form };
  }

  /**
   * Post-hr_admin-goal fix: `g08_dual_control` names a second-person-approval capability for
   * "APAR disposal and confidentiality downgrade" — releasing a sealed cover IS that
   * confidentiality downgrade (SEALED_COVER -> DISCLOSURE), but had no dual-control check at all.
   * Modeled as requiring the `g08_dual_control` capability role, consistent with every other
   * capability-flag fix this goal — not a full two-actor request/approve workflow (sealed cover is
   * set automatically at case-open time via `underCharge`, so there is no natural "maker" identity
   * to check a distinct "checker" against).
   */
  releaseSealedCover(actor: ActorContext, formId: string, input: { reason: string }): AparForm {
    this.authorization.check(actor, "g08.apar.sealed.release", actor);
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "g08_dual_control" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Releasing a sealed cover (confidentiality downgrade) requires the g08_dual_control capability", { field: "actor" });
    }
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "SEALED_COVER");
    form.status = "DISCLOSURE";
    form.sealedCover = false;
    form.g06FeedSuppressed = false;
    this.audit.recordMutation(actor, { action: "G08_SEALED_COVER_RELEASED", subjectRef: `g08_apar_forms:${form.id}`, metadata: { reason: input.reason } });
    return { ...form };
  }

  postFinalGrade(actor: ActorContext, formId: string, input: { eventDate: string; idempotencyKey: string }): { form: AparForm; srEventId: string } {
    this.authorization.check(actor, "g08.apar.post_sr", actor);
    const form = this.requireForm(actor, formId);
    if (form.status !== "FINALISED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only finalised APAR forms can be posted to SR");
    }
    if (form.sealedCover || form.g06FeedSuppressed) {
      throw new FoundationError("PRECONDITION_FAILED", "SEALED_COVER suppresses APAR SR/G06 feed", { details: { marker: "G08_G06_FEED_SUPPRESSED" } });
    }
    const sr = this.serviceRegister.ingest(actor, input.idempotencyKey, {
      sourceModule: "G08",
      sourceReferenceId: `g08_apar_forms:${form.id}:FINAL_GRADE`,
      sourceEventVersion: 1,
      employeeId: form.employeeId,
      eventTypeCode: "APAR_FINAL_GRADE",
      eventDate: input.eventDate,
      factKey: `G08:${form.id}:APAR_FINAL_GRADE`,
      payload: { formNo: form.formNo, grade: form.grade, periodStart: form.periodStart, periodEnd: form.periodEnd },
      documentIds: [form.documentId ?? ""].filter((documentId) => documentId.length > 0),
    });
    form.status = "POSTED";
    form.srEventId = sr.event.id;
    this.notifications.publish(actor, { recipientEmployeeId: form.employeeId, messageId: "G08_APAR_POSTED", channel: "IN_APP", relatedRef: `g08_apar_forms:${form.id}`, mergeFields: { grade: form.grade ?? "" } });
    return { form: { ...form }, srEventId: sr.event.id };
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (5) Masters — appraisal_cycles (E1), appraisal_templates (E2), rating_scales (E3)
  // -------------------------------------------------------------------------------------

  defineRatingScale(
    actor: ActorContext,
    input: { scaleCode: string; name: string; minValue: number; maxValue: number; benchmarkGrade: number; adverseThreshold: number }
  ): RatingScale {
    this.authorization.check(actor, "g08.masters.write", actor);
    if (
      input.maxValue <= input.minValue ||
      input.benchmarkGrade < input.minValue ||
      input.benchmarkGrade > input.maxValue ||
      input.adverseThreshold < input.minValue ||
      input.adverseThreshold > input.maxValue
    ) {
      throw new FoundationError("VALIDATION_FAILED", "Rating scale bounds are inconsistent", { field: "ratingScale" });
    }
    const scale: RatingScale = {
      id: nextId("rating-scale", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      scaleCode: input.scaleCode,
      name: input.name,
      minValue: input.minValue,
      maxValue: input.maxValue,
      benchmarkGrade: input.benchmarkGrade,
      adverseThreshold: input.adverseThreshold,
      status: "ACTIVE",
    };
    this.depth.saveRatingScale(scale);
    this.audit.recordMutation(actor, { action: "G08_RATING_SCALE_DEFINED", subjectRef: `g08_rating_scales:${scale.id}` });
    return scale;
  }

  defineAppraisalTemplate(
    actor: ActorContext,
    input: { templateCode: string; name: string; goalSplitPct?: number; competencySplitPct?: number }
  ): AppraisalTemplate {
    this.authorization.check(actor, "g08.masters.write", actor);
    const goalSplitPct = input.goalSplitPct ?? 70;
    const competencySplitPct = input.competencySplitPct ?? 30;
    if (Math.abs(goalSplitPct + competencySplitPct - 100) > 0.01) {
      throw new FoundationError("VALIDATION_FAILED", "weightage_policy splits must sum to 100 (R21)", { field: "weightagePolicy" });
    }
    const template: AppraisalTemplate = {
      id: nextId("appraisal-template", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      templateCode: input.templateCode,
      name: input.name,
      version: 1,
      weightagePolicy: { performanceSum: 100, goalSplitPct, competencySplitPct, developmentInSum: false },
      status: "PUBLISHED",
    };
    this.depth.saveTemplate(template);
    this.audit.recordMutation(actor, { action: "G08_TEMPLATE_DEFINED", subjectRef: `g08_appraisal_templates:${template.id}` });
    return template;
  }

  defineAppraisalCycle(
    actor: ActorContext,
    input: {
      cycleCode: string;
      name: string;
      fiscalYear: string;
      appraisalPeriodStart: string;
      appraisalPeriodEnd: string;
      templateId: string;
      ratingScaleId: string;
      representationWindowDays?: number;
      minSupervisionMonths?: number;
    }
  ): AppraisalCycle {
    this.authorization.check(actor, "g08.masters.write", actor);
    if (!this.depth.findTemplate(actor, input.templateId)) {
      throw new FoundationError("NOT_FOUND", "Appraisal template not found");
    }
    if (!this.depth.findRatingScale(actor, input.ratingScaleId)) {
      throw new FoundationError("NOT_FOUND", "Rating scale not found");
    }
    const representationWindowDays = input.representationWindowDays ?? 30;
    const minSupervisionMonths = input.minSupervisionMonths ?? 3.0;
    if (representationWindowDays < 1) {
      throw new FoundationError("VALIDATION_FAILED", "VAL-G08-REPWINDOW: representation_window_days must be >= 1", { field: "representationWindowDays" });
    }
    if (minSupervisionMonths < 0) {
      throw new FoundationError("VALIDATION_FAILED", "VAL-G08-SUPV: min_supervision_months must be >= 0", { field: "minSupervisionMonths" });
    }
    const cycle: AppraisalCycle = {
      id: nextId("appraisal-cycle", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cycleCode: input.cycleCode,
      name: input.name,
      fiscalYear: input.fiscalYear,
      appraisalPeriodStart: input.appraisalPeriodStart,
      appraisalPeriodEnd: input.appraisalPeriodEnd,
      templateId: input.templateId,
      ratingScaleId: input.ratingScaleId,
      representationWindowDays,
      minSupervisionMonths,
      status: "ACTIVE",
    };
    this.depth.saveCycle(cycle);
    this.audit.recordMutation(actor, { action: "G08_APPRAISAL_CYCLE_DEFINED", subjectRef: `g08_appraisal_cycles:${cycle.id}` });
    return cycle;
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (6) Goals + WSUM lock (E5/E20; VAL-WEIGHTAGE/WSUM → ERR-G08-WEIGHTAGE)
  // -------------------------------------------------------------------------------------

  addGoal(actor: ActorContext, formId: string, input: { title: string; goalType: AparGoal["goalType"]; weightage: number }): AparGoal {
    this.authorization.check(actor, "g08.apar.goal.write", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "GOALS_PENDING");
    if (form.goalsLocked) {
      throw new FoundationError("PRECONDITION_FAILED", "Goals are locked; the snapshot is immutable (E20)");
    }
    if (input.weightage < 0) {
      throw new FoundationError("VALIDATION_FAILED", "Goal weightage must be >= 0", { field: "weightage" });
    }
    const goal: AparGoal = {
      id: nextId("apar-goal", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      formId: form.id,
      appraiseeId: form.employeeId,
      goalType: input.goalType,
      title: input.title,
      weightage: input.weightage,
      status: "APPROVED",
      snapshotted: false,
    };
    this.depth.saveGoal(goal);
    this.audit.recordMutation(actor, { action: "G08_GOAL_ADDED", subjectRef: `g08_goals:${goal.id}` });
    return goal;
  }

  /**
   * Goal-lock (FR-G08-02 AC.2/R21): runs the NAMED VAL-WEIGHTAGE/WSUM validation — sibling
   * performance goals must sum to 100 ±0.01, DEVELOPMENT goals excluded — then locks every
   * goal and writes the immutable E20 form_goal_snapshots in one transactional pass.
   * Violation throws ERR-G08-WEIGHTAGE; nothing is locked and no snapshot is written.
   */
  lockGoals(actor: ActorContext, formId: string, input: { lockedAt: string }): { form: AparForm; snapshots: FormGoalSnapshot[] } {
    this.authorization.check(actor, "g08.apar.goal.lock", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "GOALS_PENDING");
    if (form.goalsLocked) {
      throw new FoundationError("PRECONDITION_FAILED", "Goals are already locked");
    }
    const goals = this.depth.listGoals(actor, form.id);
    // VAL-WEIGHTAGE/WSUM — fail-closed BEFORE any state change (all-or-nothing lock).
    validateWeightageSumWSUM(goals);
    const snapshots: FormGoalSnapshot[] = goals.map((goal, index) => {
      this.depth.saveGoal({ ...goal, status: "LOCKED", snapshotted: true });
      const snapshot: FormGoalSnapshot = {
        id: `${form.id}-goal-snapshot-${index + 1}`,
        tenantId: actor.tenantId,
        formId: form.id,
        goalId: goal.id,
        goalType: goal.goalType,
        title: goal.title,
        weightage: goal.weightage,
        lockedAt: input.lockedAt,
      };
      this.depth.saveGoalSnapshot(snapshot);
      return snapshot;
    });
    form.goalsLocked = true;
    this.audit.recordMutation(actor, {
      action: "G08_GOALS_LOCKED",
      subjectRef: `g08_apar_forms:${form.id}`,
      metadata: { validation: "VAL-WEIGHTAGE/WSUM", snapshotCount: snapshots.length },
    });
    return { form: { ...form }, snapshots };
  }

  listGoalSnapshots(scope: TenantScope, formId: string): FormGoalSnapshot[] {
    requireTenantScope(scope);
    return this.depth.listGoalSnapshots(scope, formId);
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (7) Disclosure + representation window (ERR-G08-REPWINDOW)
  // -------------------------------------------------------------------------------------

  /**
   * Mandatory full disclosure (FR-G08-08): dispatch the finalised APAR to the employee,
   * append the disclosure-ledger entry, and start the representation-window clock
   * (representation_due_by = dispatched_on + cycle.representation_window_days; DISPATCH start).
   */
  discloseToEmployee(actor: ActorContext, formId: string, input: { dispatchedOn: string }): { form: AparForm; disclosure: DisclosureLogEntry } {
    this.authorization.check(actor, "g08.apar.disclose", actor);
    const form = this.requireForm(actor, formId);
    if (form.status !== "FINALISED" && form.status !== "POSTED") {
      throw new FoundationError("PRECONDITION_FAILED", "Only finalised APAR forms can be disclosed");
    }
    if (form.sealedCover) {
      throw new FoundationError("PRECONDITION_FAILED", "SEALED_COVER forms are not disclosed until released");
    }
    const windowDays = this.representationWindowDays(actor, form);
    form.disclosedOn = input.dispatchedOn;
    form.representationDueBy = addDaysIso(input.dispatchedOn, windowDays);
    const disclosure = this.depth.appendDisclosure({
      tenantId: actor.tenantId,
      formId: form.id,
      eventType: "DISPATCHED",
      actorId: actor.userId,
      eventAt: input.dispatchedOn,
    });
    this.notifications.publish(actor, {
      recipientEmployeeId: form.employeeId,
      messageId: "G08_APAR_DISCLOSED",
      channel: "IN_APP",
      relatedRef: `g08_apar_forms:${form.id}`,
      mergeFields: { representationDueBy: form.representationDueBy },
    });
    this.audit.recordMutation(actor, {
      action: "G08_APAR_DISCLOSED",
      subjectRef: `g08_apar_forms:${form.id}`,
      metadata: { representationWindowDays: windowDays, representationDueBy: form.representationDueBy },
    });
    return { form: { ...form }, disclosure };
  }

  /**
   * Representation against the disclosed APAR (FR-G08-09). Filing after the representation
   * window elapsed fails closed with ERR-G08-REPWINDOW (409 CONFLICT — condonation required).
   */
  fileRepresentation(actor: ActorContext, formId: string, input: { filedOn: string; grounds: string; condoned?: boolean }): AparRepresentation {
    this.authorization.check(actor, "g08.apar.representation.file", actor);
    const form = this.requireForm(actor, formId);
    this.assertSelfOrOverride(actor, form.employeeId);
    if (!form.disclosedOn || !form.representationDueBy) {
      throw new FoundationError("PRECONDITION_FAILED", "APAR must be disclosed before a representation can be filed");
    }
    if (!input.grounds) {
      throw new FoundationError("VALIDATION_FAILED", "Representation grounds are required", { field: "grounds" });
    }
    const isLate = input.filedOn > form.representationDueBy;
    if (isLate && !input.condoned) {
      throw new FoundationError("ERR-G08-REPWINDOW", "Representation window elapsed (condonation required)", {
        field: "filedOn",
        details: { disclosedOn: form.disclosedOn, representationDueBy: form.representationDueBy, filedOn: input.filedOn },
      });
    }
    const representation: AparRepresentation = {
      id: nextId("apar-representation", this.depth.countRepresentations()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      repNo: `REP/${form.formNo}/${this.depth.countRepresentations() + 1}`,
      formId: form.id,
      appraiseeId: form.employeeId,
      grounds: input.grounds,
      filedAt: input.filedOn,
      slaDueAt: form.representationDueBy,
      isLate,
      condoned: Boolean(input.condoned && isLate),
      escalationLevel: 1,
      status: "FILED",
    };
    this.depth.saveRepresentation(representation);
    this.depth.appendDisclosure({
      tenantId: actor.tenantId,
      formId: form.id,
      eventType: "REPRESENTATION_FILED",
      actorId: actor.userId,
      eventAt: input.filedOn,
    });
    this.audit.recordMutation(actor, { action: "G08_REPRESENTATION_FILED", subjectRef: `g08_representations:${representation.id}`, metadata: { isLate } });
    return representation;
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (8) Multi-RO part-period (E19) + supervision-weighted aggregation (FR-G08-18)
  // -------------------------------------------------------------------------------------

  /**
   * One report period per RO (E19). A period whose supervision_months falls below the cycle's
   * min_supervision_months (VAL-G08-SUPV) yields a No-Report Certificate — never a grade.
   * SoD: the appraisee cannot be the reporting officer of their own period.
   */
  addReportPeriod(
    actor: ActorContext,
    formId: string,
    input: {
      sequenceNo: number;
      periodStart: string;
      periodEnd: string;
      reportingOfficerId: string;
      supervisionMonths: number;
      partPeriodGrade?: number;
    }
  ): AparReportPeriod {
    this.authorization.check(actor, "g08.apar.report_period.write", actor);
    const form = this.requireForm(actor, formId);
    if (input.reportingOfficerId === form.employeeId) {
      throw new FoundationError("FORBIDDEN", "Appraisee cannot author their own report period (P02 SoD)");
    }
    if (input.supervisionMonths < 0) {
      throw new FoundationError("VALIDATION_FAILED", "VAL-G08-SUPV: supervision_months must be >= 0", { field: "supervisionMonths" });
    }
    if (this.depth.findReportPeriod(actor, form.id, input.sequenceNo)) {
      throw new FoundationError("CONFLICT", "Report period sequence already exists for this form");
    }
    const minSupervisionMonths = this.minSupervisionMonths(actor, form);
    const noReport = input.supervisionMonths < minSupervisionMonths;
    if (!noReport && input.partPeriodGrade === undefined) {
      throw new FoundationError("VALIDATION_FAILED", "A gradable report period requires part_period_grade", { field: "partPeriodGrade" });
    }
    const period: AparReportPeriod = {
      id: nextId("apar-report-period", this.depth.countReportPeriods()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      formId: form.id,
      sequenceNo: input.sequenceNo,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      reportingOfficerId: input.reportingOfficerId,
      supervisionMonths: input.supervisionMonths,
      partPeriodGrade: noReport ? undefined : input.partPeriodGrade,
      noReportCertificate: noReport,
      noReportReason: noReport ? `supervision_months ${input.supervisionMonths} < min_supervision_months ${minSupervisionMonths}` : undefined,
      status: noReport ? "NO_REPORT" : "ASSESSED",
      isEscalatedAuthor: false,
    };
    this.depth.saveReportPeriod(period);
    this.audit.recordMutation(actor, {
      action: noReport ? "G08_NO_REPORT_CERTIFICATE" : "G08_PART_PERIOD_ASSESSED",
      subjectRef: `g08_appraisal_report_periods:${period.id}`,
      metadata: { supervisionMonths: input.supervisionMonths, minSupervisionMonths },
    });
    return period;
  }

  /**
   * FR-G08-18: provisional_grade = supervision-weighted aggregate of assessed part-period grades,
   * NO_REPORT periods excluded. Persists each period's weight_in_aggregate and the form grade
   * in one pass — no partial aggregation state.
   */
  aggregateProvisionalGrade(actor: ActorContext, formId: string): { form: AparForm; provisionalGrade: number; periods: AparReportPeriod[] } {
    this.authorization.check(actor, "g08.apar.report_period.aggregate", actor);
    const form = this.requireForm(actor, formId);
    const periods = this.depth.listReportPeriods(actor, form.id);
    const graded = periods.filter((period) => !period.noReportCertificate && period.partPeriodGrade !== undefined);
    const totalSupervision = graded.reduce((sum, period) => sum + period.supervisionMonths, 0);
    if (totalSupervision <= 0) {
      throw new FoundationError("PRECONDITION_FAILED", "No gradable supervision period to aggregate");
    }
    let provisionalGrade = 0;
    const updated: AparReportPeriod[] = periods.map((period) => {
      if (period.noReportCertificate || period.partPeriodGrade === undefined) {
        return { ...period, weightInAggregate: 0 };
      }
      const weight = period.supervisionMonths / totalSupervision;
      provisionalGrade += weight * period.partPeriodGrade;
      return { ...period, weightInAggregate: Math.round(weight * 10000) / 100 };
    });
    for (const period of updated) {
      this.depth.saveReportPeriod(period);
    }
    provisionalGrade = Math.round(provisionalGrade * 100) / 100;
    form.provisionalGrade = provisionalGrade;
    this.audit.recordMutation(actor, {
      action: "G08_PROVISIONAL_GRADE_AGGREGATED",
      subjectRef: `g08_apar_forms:${form.id}`,
      metadata: { provisionalGrade, gradedPeriods: graded.length, noReportPeriods: periods.length - graded.length },
    });
    return { form: { ...form }, provisionalGrade, periods: updated };
  }

  listReportPeriods(scope: TenantScope, formId: string): AparReportPeriod[] {
    requireTenantScope(scope);
    return this.depth.listReportPeriods(scope, formId);
  }

  // -------------------------------------------------------------------------------------
  // PH-08D (9) SLA escalation — authoring-right transfer (is_escalated_author, FR-G08-19/R9)
  // -------------------------------------------------------------------------------------

  /**
   * FR-G08-19: on a missed tier SLA the authoring right transfers to the next higher authority.
   * The escalated period records is_escalated_author=true and the new author; the appraisee can
   * never receive the authoring right (P02 SoD holds through escalation).
   */
  escalateReportPeriodAuthor(
    actor: ActorContext,
    formId: string,
    input: { sequenceNo: number; escalatedToEmployeeId: string; reason: string }
  ): AparReportPeriod {
    this.authorization.check(actor, "g08.apar.sla.escalate", actor);
    const form = this.requireForm(actor, formId);
    const period = this.depth.findReportPeriod(actor, form.id, input.sequenceNo);
    if (!period) {
      throw new FoundationError("NOT_FOUND", "Report period not found");
    }
    if (period.noReportCertificate) {
      throw new FoundationError("PRECONDITION_FAILED", "A No-Report period has no authoring right to transfer");
    }
    if (input.escalatedToEmployeeId === form.employeeId) {
      throw new FoundationError("FORBIDDEN", "Appraisee cannot receive the escalated authoring right (P02 SoD)");
    }
    const escalated: AparReportPeriod = {
      ...period,
      reportingOfficerId: input.escalatedToEmployeeId,
      isEscalatedAuthor: true,
      escalatedAuthorId: input.escalatedToEmployeeId,
    };
    this.depth.saveReportPeriod(escalated);
    this.notifications.publish(actor, {
      recipientEmployeeId: input.escalatedToEmployeeId,
      messageId: "G08_SLA_AUTHORING_TRANSFERRED",
      channel: "IN_APP",
      relatedRef: `g08_appraisal_report_periods:${escalated.id}`,
      mergeFields: { formNo: form.formNo },
    });
    this.audit.recordMutation(actor, {
      action: "G08_SLA_ESCALATED",
      subjectRef: `g08_appraisal_report_periods:${escalated.id}`,
      metadata: { isEscalatedAuthor: true, escalatedToEmployeeId: input.escalatedToEmployeeId, reason: input.reason },
    });
    return escalated;
  }

  /** Monotonic id counter for depth entities (mirrors nextId usage on module arrays). */
  private depthIdCounter = 0;

  private depthCounter(): number {
    this.depthIdCounter += 1;
    return this.depthIdCounter;
  }

  private representationWindowDays(scope: TenantScope, form: AparForm): number {
    if (form.cycleId) {
      const cycle = this.depth.findCycle(scope, form.cycleId);
      if (cycle) {
        return cycle.representationWindowDays;
      }
    }
    return 30; // E1 default representation_window_days
  }

  private minSupervisionMonths(scope: TenantScope, form: AparForm): number {
    if (form.cycleId) {
      const cycle = this.depth.findCycle(scope, form.cycleId);
      if (cycle) {
        return cycle.minSupervisionMonths;
      }
    }
    return 3.0; // E1 default min_supervision_months (VAL-G08-SUPV)
  }

  summary(scope: TenantScope): { forms: number; posted: number; sealedCover: number; g06FeedSuppressed: number } {
    requireTenantScope(scope);
    const forms = this.forms.filter((form) => this.inScope(form, scope));
    return {
      forms: forms.length,
      posted: forms.filter((form) => form.status === "POSTED").length,
      sealedCover: forms.filter((form) => form.sealedCover).length,
      g06FeedSuppressed: forms.filter((form) => form.g06FeedSuppressed).length,
    };
  }

  // ── PH-16E FR-G08-09: calibration as a RATIFIED recommendation ─────────────────
  // The committee only PROPOSES; the certified grade changes solely through a RATIFIED
  // g08_calibration_recommendations row, applied as a g08_calibration_adjustments row.
  // VAL-DISTRIB is diagnostic-only (never a quota); ERR-G08-RATIFY guards the apply.

  createCalibrationSession(
    actor: ActorContext,
    input: {
      cycleId: string;
      orgUnitScope: string;
      method: CalibrationMethod;
      committeeMemberIds: string[];
      targetDistribution?: Record<string, number>;
      bellCurveEnabled?: boolean;
    }
  ): CalibrationSession {
    this.authorization.check(actor, "g08.calibration.convene", actor);
    if (input.committeeMemberIds.length < 1) {
      throw new FoundationError("VALIDATION_FAILED", "A calibration committee needs at least one member", { field: "committeeMemberIds" });
    }
    const session: CalibrationSession = {
      id: nextId("calibration-session", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      cycleId: input.cycleId,
      orgUnitScope: input.orgUnitScope,
      method: input.method,
      bellCurveEnabled: Boolean(input.bellCurveEnabled),
      targetDistribution: input.targetDistribution,
      committeeMemberIds: input.committeeMemberIds,
      runsBeforeCertification: true,
      status: "IN_SESSION",
    };
    this.depth.saveCalibrationSession(session);
    this.audit.recordMutation(actor, {
      action: "G08_CALIBRATION_SESSION_OPENED",
      subjectRef: `g08_calibration_sessions:${session.id}`,
      metadata: { ledger: "calibration_recommendations", method: session.method },
    });
    return { ...session };
  }

  proposeCalibrationRecommendation(
    actor: ActorContext,
    sessionId: string,
    input: { formId: string; currentGrade: number; recommendedGrade: number; rationale: string }
  ): CalibrationRecommendation {
    this.authorization.check(actor, "g08.calibration.recommend", actor);
    const session = this.depth.findCalibrationSession(actor, sessionId);
    if (!session) {
      throw new FoundationError("NOT_FOUND", "Calibration session not found");
    }
    if (!input.rationale || !input.rationale.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A calibration recommendation requires a rationale", { field: "rationale" });
    }
    const recommendation: CalibrationRecommendation = {
      id: nextId("calibration-recommendation", this.depthCounter()),
      tenantId: actor.tenantId,
      sessionId: session.id,
      formId: input.formId,
      currentGrade: input.currentGrade,
      recommendedGrade: input.recommendedGrade,
      rationale: input.rationale,
      preCertification: true,
      recommendationStatus: "PROPOSED",
    };
    this.depth.saveCalibrationRecommendation(recommendation);
    this.audit.recordMutation(actor, {
      action: "G08_CALIBRATION_RECOMMENDED",
      subjectRef: `g08_calibration_recommendations:${recommendation.id}`,
      metadata: { ledger: "calibration_recommendations", status: "PROPOSED" },
    });
    return { ...recommendation };
  }

  ratifyCalibrationRecommendation(actor: ActorContext, sessionId: string, recommendationId: string): CalibrationRecommendation {
    this.authorization.check(actor, "g08.calibration.ratify", actor);
    const recommendation = this.requireRecommendation(actor, sessionId, recommendationId);
    const session = this.depth.findCalibrationSession(actor, sessionId);
    // SoD: the ratifying authority is not a proposing committee member.
    if (session && session.committeeMemberIds.includes(actor.userId)) {
      throw new FoundationError("FORBIDDEN", "A committee member cannot ratify their own recommendation", {
        details: { recommendationId, ratifier: actor.userId },
      });
    }
    recommendation.recommendationStatus = "RATIFIED";
    recommendation.ratifiedBy = actor.userId;
    recommendation.ratifiedAt = new Date(0).toISOString().slice(0, 10);
    this.depth.saveCalibrationRecommendation(recommendation);
    this.audit.recordMutation(actor, {
      action: "G08_CALIBRATION_RATIFIED",
      subjectRef: `g08_calibration_recommendations:${recommendation.id}`,
      metadata: { ledger: "calibration_recommendations", status: "RATIFIED" },
    });
    return { ...recommendation };
  }

  /** Applies a ratified recommendation. Fail-closed ERR-G08-RATIFY if not yet RATIFIED. */
  applyCalibrationAdjustment(actor: ActorContext, sessionId: string, recommendationId: string): CalibrationAdjustment {
    this.authorization.check(actor, "g08.calibration.apply", actor);
    const recommendation = this.requireRecommendation(actor, sessionId, recommendationId);
    if (recommendation.recommendationStatus !== "RATIFIED" || !recommendation.ratifiedBy) {
      throw new FoundationError("ERR-G08-RATIFY", "A certified grade changes only via a RATIFIED calibration recommendation", {
        details: { recommendationId, status: recommendation.recommendationStatus },
      });
    }
    const adjustment: CalibrationAdjustment = {
      id: nextId("calibration-adjustment", this.depthCounter()),
      tenantId: actor.tenantId,
      recommendationId: recommendation.id,
      sessionId: recommendation.sessionId,
      formId: recommendation.formId,
      oldGrade: recommendation.currentGrade,
      appliedGrade: recommendation.recommendedGrade,
      ratifiedBy: recommendation.ratifiedBy,
      appliedAt: new Date(0).toISOString().slice(0, 10),
      status: "APPLIED",
    };
    this.depth.saveCalibrationAdjustment(adjustment);
    this.audit.recordMutation(actor, {
      action: "G08_CALIBRATION_ADJUSTMENT_APPLIED",
      subjectRef: `g08_calibration_adjustments:${adjustment.id}`,
      metadata: { ledger: "calibration_recommendations", appliedGrade: adjustment.appliedGrade },
    });
    return { ...adjustment };
  }

  /** VAL-DISTRIB — diagnostic-only distribution report; never blocks or forces a grade. */
  calibrationDistributionDiagnostic(
    actor: ActorContext,
    sessionId: string
  ): { targetDistribution?: Record<string, number>; actual: Record<string, number>; diagnostic: string } {
    const session = this.depth.findCalibrationSession(actor, sessionId);
    if (!session) {
      throw new FoundationError("NOT_FOUND", "Calibration session not found");
    }
    const actual: Record<string, number> = {};
    for (const rec of this.depth.listCalibrationRecommendations(actor, sessionId)) {
      const bucket = String(rec.recommendedGrade);
      actual[bucket] = (actual[bucket] ?? 0) + 1;
    }
    return { targetDistribution: session.targetDistribution, actual, diagnostic: "VAL-DISTRIB" };
  }

  // ── PH-16E FR-G08-13: PIP lifecycle (header + milestones + outcome) ─────────────

  createPip(
    actor: ActorContext,
    input: {
      appraiseeId: string;
      reason: string;
      successCriteria: string;
      startDate: string;
      targetEndDate: string;
      milestones: Array<{ title: string; dueDate: string; metric?: string }>;
    }
  ): { pip: PerformanceImprovementPlan; milestones: PipMilestone[] } {
    this.authorization.check(actor, "g08.pip.initiate", actor);
    if (!this.employeeMaster.getById(actor, input.appraiseeId)) {
      throw new FoundationError("NOT_FOUND", "Appraisee not found");
    }
    if (input.milestones.length < 1) {
      throw new FoundationError("VALIDATION_FAILED", "A performance_improvement_plans row requires at least one milestone", { field: "milestones" });
    }
    if (this.depth.listOpenPipsForEmployee(actor, input.appraiseeId).length > 0) {
      throw new FoundationError("PRECONDITION_FAILED", "An open PIP already exists for this employee");
    }
    const pip: PerformanceImprovementPlan = {
      id: nextId("pip", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      pipNo: `PIP/${this.depthCounter()}`,
      appraiseeId: input.appraiseeId,
      initiatedBy: actor.userId,
      reason: input.reason,
      successCriteria: input.successCriteria,
      startDate: input.startDate,
      targetEndDate: input.targetEndDate,
      status: "ACTIVE",
    };
    this.depth.savePip(pip);
    const milestones = input.milestones.map((m) => {
      const milestone: PipMilestone = {
        id: nextId("pip-milestone", this.depthCounter()),
        tenantId: actor.tenantId,
        pipId: pip.id,
        title: m.title,
        dueDate: m.dueDate,
        metric: m.metric,
        status: "PENDING",
      };
      this.depth.savePipMilestone(milestone);
      return milestone;
    });
    this.audit.recordMutation(actor, {
      action: "G08_PIP_OPENED",
      subjectRef: `performance_improvement_plans:${pip.id}`,
      metadata: { ledger: "pip_milestones", milestones: milestones.length },
    });
    return { pip: { ...pip }, milestones };
  }

  updatePipMilestone(
    actor: ActorContext,
    pipId: string,
    milestoneId: string,
    input: { status: PipMilestoneStatus; progressNote?: string }
  ): PipMilestone {
    this.authorization.check(actor, "g08.pip.update", actor);
    const milestone = this.depth.findPipMilestone(actor, pipId, milestoneId);
    if (!milestone) {
      throw new FoundationError("NOT_FOUND", "PIP milestone not found");
    }
    milestone.status = input.status;
    milestone.progressNote = input.progressNote;
    this.depth.savePipMilestone(milestone);
    return { ...milestone };
  }

  closePip(actor: ActorContext, pipId: string, input: { outcome: PipOutcome; outcomeSummary: string }): PerformanceImprovementPlan {
    this.authorization.check(actor, "g08.pip.close", actor);
    const pip = this.depth.findPip(actor, pipId);
    if (!pip) {
      throw new FoundationError("NOT_FOUND", "PIP not found");
    }
    if (pip.status === "CLOSED") {
      throw new FoundationError("PRECONDITION_FAILED", "PIP is already closed");
    }
    pip.status = "CLOSED";
    pip.outcome = input.outcome;
    pip.outcomeSummary = input.outcomeSummary;
    this.depth.savePip(pip);
    this.audit.recordMutation(actor, {
      action: "G08_PIP_CLOSED",
      subjectRef: `performance_improvement_plans:${pip.id}`,
      metadata: { outcome: pip.outcome },
    });
    return { ...pip };
  }

  // ── PH-16E FR-G08-21: probation confirmation with cumulative extension cap ──────

  openProbationConfirmation(
    actor: ActorContext,
    input: {
      appraiseeId: string;
      cycleId?: string;
      probationEndDate: string;
      probationPeriodMonths: number;
      probationExtensionMaxMonths?: number;
    }
  ): ProbationConfirmation {
    this.authorization.check(actor, "g08.probation.open", actor);
    if (!this.employeeMaster.getById(actor, input.appraiseeId)) {
      throw new FoundationError("NOT_FOUND", "Appraisee not found");
    }
    const confirmation: ProbationConfirmation = {
      id: nextId("probation-confirmation", this.depthCounter()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      confirmationNo: `PROB/${this.depthCounter()}`,
      appraiseeId: input.appraiseeId,
      cycleId: input.cycleId,
      probationEndDate: input.probationEndDate,
      probationPeriodMonths: input.probationPeriodMonths,
      extensionMonthsTotal: 0,
      status: "IN_PROBATION",
    };
    this.depth.saveProbationConfirmation(confirmation);
    return { ...confirmation };
  }

  /** CONFIRMED / EXTENDED / DISCHARGE_RECOMMENDED. EXTENDED enforces the cumulative cap. */
  decideProbation(
    actor: ActorContext,
    confirmationId: string,
    input: { outcome: ProbationOutcome; extensionMonths?: number; effectiveDate?: string }
  ): ProbationConfirmation {
    this.authorization.check(actor, "g08.probation.decide", actor);
    const confirmation = this.depth.findProbationConfirmation(actor, confirmationId);
    if (!confirmation) {
      throw new FoundationError("NOT_FOUND", "Probation confirmation not found");
    }
    if (confirmation.status !== "IN_PROBATION" && confirmation.status !== "EXTENDED") {
      throw new FoundationError("PRECONDITION_FAILED", "Probation is already decided");
    }
    const cap = this.probationExtensionMaxMonths(actor, confirmation);
    if (input.outcome === "EXTENDED") {
      const months = input.extensionMonths ?? 0;
      if (!Number.isInteger(months) || months <= 0) {
        throw new FoundationError("VALIDATION_FAILED", "extensionMonths must be a positive integer", { field: "extensionMonths" });
      }
      const total = confirmation.extensionMonthsTotal + months;
      if (total > cap) {
        throw new FoundationError("VALIDATION_FAILED", "Cumulative probation extension exceeds probation_extension_max_months", {
          field: "extensionMonths",
          details: { requestedTotal: total, probationExtensionMaxMonths: cap },
        });
      }
      confirmation.extensionMonthsTotal = total;
      confirmation.status = "EXTENDED";
      confirmation.probationOutcome = "EXTENDED";
    } else {
      confirmation.status = input.outcome === "CONFIRMED" ? "CONFIRMED" : "DISCHARGE_RECOMMENDED";
      confirmation.probationOutcome = input.outcome;
      confirmation.confirmationEffectiveDate = input.effectiveDate;
    }
    this.depth.saveProbationConfirmation(confirmation);
    this.audit.recordMutation(actor, {
      action: "G08_PROBATION_DECIDED",
      subjectRef: `probation_confirmations:${confirmation.id}`,
      metadata: { probationOutcome: confirmation.probationOutcome, extensionMonthsTotal: confirmation.extensionMonthsTotal },
    });
    return { ...confirmation };
  }

  private probationExtensionMaxMonths(scope: TenantScope, confirmation: ProbationConfirmation): number {
    if (confirmation.cycleId) {
      const cycle = this.depth.findCycle(scope, confirmation.cycleId);
      if (cycle && cycle.probationExtensionMaxMonths !== undefined) {
        return cycle.probationExtensionMaxMonths;
      }
    }
    return 6; // FR-G08-21 default cap on cumulative probation extension months
  }

  private requireRecommendation(scope: TenantScope, sessionId: string, recommendationId: string): CalibrationRecommendation {
    const recommendation = this.depth.findCalibrationRecommendation(scope, recommendationId);
    if (!recommendation || recommendation.sessionId !== sessionId) {
      throw new FoundationError("NOT_FOUND", "Calibration recommendation not found");
    }
    return recommendation;
  }

  private assertSelfOrOverride(actor: ActorContext, employeeId: string): void {
    if (actor.permissions?.includes("*") || actor.roles?.some((role) => APAR_SELF_OVERRIDE_ROLES.has(role))) return;
    if (actor.userId === employeeId) return;
    throw new FoundationError("FORBIDDEN", "You may only act on your own APAR form", { field: "employeeId" });
  }

  private requireForm(scope: TenantScope, formId: string): AparForm {
    const form = this.forms.find((item) => item.id === formId && this.inScope(item, scope));
    if (!form) {
      throw new FoundationError("NOT_FOUND", "APAR form not found");
    }
    return form;
  }

  private requireStatus(form: AparForm, expected: AparStatus): void {
    if (form.status !== expected) {
      throw new FoundationError("PRECONDITION_FAILED", `APAR form must be ${expected}`);
    }
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }
}
