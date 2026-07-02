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
  DisclosureLogEntry,
  FormGoalSnapshot,
  InMemoryAparDepthRepository,
  RatingScale,
  validateWeightageSumWSUM,
} from "./aparDepthRepository";

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

  submitSelf(actor: ActorContext, formId: string): AparForm {
    this.authorization.check(actor, "g08.apar.self.submit", actor);
    const form = this.requireForm(actor, formId);
    this.requireStatus(form, "GOALS_PENDING");
    // R6/R21: once goals exist they must be locked (WSUM-validated + snapshotted) before self-appraisal.
    if (!form.goalsLocked && this.depth.listGoals(actor, form.id).length > 0) {
      throw new FoundationError("PRECONDITION_FAILED", "Goals must be locked (VAL-WEIGHTAGE/WSUM) before self-appraisal");
    }
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

  releaseSealedCover(actor: ActorContext, formId: string, input: { reason: string }): AparForm {
    this.authorization.check(actor, "g08.apar.sealed.release", actor);
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
