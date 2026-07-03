import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";
import { CalibrationMethod } from "../modules/g08/aparDepthRepository";

export const g08RouteEvidence = {
  forms: "/api/v1/apar/forms",
  report: "/api/v1/apar/forms/{id}:report",
  review: "/api/v1/apar/forms/{id}:review",
  accept: "/api/v1/apar/forms/{id}:accept",
  postSr: "/api/v1/apar/forms/{id}:post-sr",
  markers: ["APAR_FINAL_GRADE", "SEALED_COVER", "G08_G06_FEED_SUPPRESSED"],
  // PH-08D: appraisal_cycles/templates/rating_scales masters, WSUM goal lock, disclosure +
  // representation window, multi-RO part-periods and SLA escalation.
  cycles: "/api/v1/apar/cycles",
  lockGoals: "/api/v1/apar/forms/{id}:lock-goals",
  disclose: "/api/v1/apar/forms/{id}:disclose",
  representations: "/api/v1/apar/forms/{id}/representations",
  reportPeriods: "/api/v1/apar/forms/{id}/report-periods",
  domainCodes: ["ERR-G08-WEIGHTAGE", "ERR-G08-REPWINDOW"],
};

export function registerG08Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/apar/forms",
      operationId: "g08.openForm",
      protected: true,
      permission: "g08.apar.form.open",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          form: context.services.apar.openForm(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            periodStart: requiredString(body, "periodStart"),
            periodEnd: requiredString(body, "periodEnd"),
            reportingOfficerId: optionalString(body, "reportingOfficerId") ?? ph03Ids.manager,
            reviewingOfficerId: optionalString(body, "reviewingOfficerId") ?? ph03Ids.manager,
            acceptingAuthorityId: optionalString(body, "acceptingAuthorityId") ?? ph03Ids.manager,
            underCharge: optionalBoolean(body, "underCharge"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:submit-self",
      operationId: "g08.submitSelf",
      protected: true,
      permission: "g08.apar.self.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ form: context.services.apar.submitSelf(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:report",
      operationId: "g08.recordReporting",
      protected: true,
      permission: "g08.apar.report",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          form: context.services.apar.recordReporting(context.actor, requiredParam(context.params, "id"), {
            grade: requiredString(body, "grade"),
            narrative: requiredString(body, "narrative"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:review",
      operationId: "g08.recordReview",
      protected: true,
      permission: "g08.apar.review",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          form: context.services.apar.recordReview(context.actor, requiredParam(context.params, "id"), {
            concur: optionalBoolean(body, "concur") ?? true,
            remarks: optionalString(body, "remarks") ?? "Reviewed",
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:accept",
      operationId: "g08.accept",
      protected: true,
      permission: "g08.apar.accept",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ form: context.services.apar.accept(context.actor, requiredParam(context.params, "id"), { finalGrade: requiredString(body, "finalGrade") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:post-sr",
      operationId: "g08.postFinalGrade",
      protected: true,
      permission: "g08.apar.post_sr",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.apar.postFinalGrade(context.actor, requiredParam(context.params, "id"), {
            eventDate: requiredString(body, "eventDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:release-sealed-cover",
      operationId: "g08.releaseSealedCover",
      protected: true,
      permission: "g08.apar.sealed.release",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ form: context.services.apar.releaseSealedCover(context.actor, requiredParam(context.params, "id"), { reason: requiredString(body, "reason") }) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/apar/summary",
      operationId: "g08.summary",
      protected: true,
      permission: "g08.apar.read",
      handler: (context) => ok(context.services.apar.summary(context.scope)),
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: masters — appraisal_cycles (E1), appraisal_templates (E2), rating_scales (E3)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/apar/rating-scales",
      operationId: "g08.defineRatingScale",
      protected: true,
      permission: "g08.masters.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          ratingScale: context.services.apar.defineRatingScale(context.actor, {
            scaleCode: requiredString(body, "scaleCode"),
            name: requiredString(body, "name"),
            minValue: optionalNumber(body, "minValue") ?? 1,
            maxValue: optionalNumber(body, "maxValue") ?? 10,
            benchmarkGrade: optionalNumber(body, "benchmarkGrade") ?? 6,
            adverseThreshold: optionalNumber(body, "adverseThreshold") ?? 4,
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/templates",
      operationId: "g08.defineAppraisalTemplate",
      protected: true,
      permission: "g08.masters.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          template: context.services.apar.defineAppraisalTemplate(context.actor, {
            templateCode: requiredString(body, "templateCode"),
            name: requiredString(body, "name"),
            goalSplitPct: optionalNumber(body, "goalSplitPct"),
            competencySplitPct: optionalNumber(body, "competencySplitPct"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/cycles",
      operationId: "g08.defineAppraisalCycle",
      protected: true,
      permission: "g08.masters.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          cycle: context.services.apar.defineAppraisalCycle(context.actor, {
            cycleCode: requiredString(body, "cycleCode"),
            name: requiredString(body, "name"),
            fiscalYear: requiredString(body, "fiscalYear"),
            appraisalPeriodStart: requiredString(body, "appraisalPeriodStart"),
            appraisalPeriodEnd: requiredString(body, "appraisalPeriodEnd"),
            templateId: requiredString(body, "templateId"),
            ratingScaleId: requiredString(body, "ratingScaleId"),
            representationWindowDays: optionalNumber(body, "representationWindowDays"),
            minSupervisionMonths: optionalNumber(body, "minSupervisionMonths"),
          }),
        });
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: goals + WSUM lock (VAL-WEIGHTAGE/WSUM → ERR-G08-WEIGHTAGE)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}/goals",
      operationId: "g08.addGoal",
      protected: true,
      permission: "g08.apar.goal.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          goal: context.services.apar.addGoal(context.actor, requiredParam(context.params, "id"), {
            title: requiredString(body, "title"),
            goalType: (optionalString(body, "goalType") ?? "PERFORMANCE") as "PERFORMANCE" | "DEVELOPMENT",
            weightage: optionalNumber(body, "weightage") ?? 0,
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:lock-goals",
      operationId: "g08.lockGoals",
      protected: true,
      permission: "g08.apar.goal.lock",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.apar.lockGoals(context.actor, requiredParam(context.params, "id"), {
            lockedAt: requiredString(body, "lockedAt"),
          })
        );
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: disclosure + representation window (elapsed → ERR-G08-REPWINDOW)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:disclose",
      operationId: "g08.discloseToEmployee",
      protected: true,
      permission: "g08.apar.disclose",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.apar.discloseToEmployee(context.actor, requiredParam(context.params, "id"), {
            dispatchedOn: requiredString(body, "dispatchedOn"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}/representations",
      operationId: "g08.fileRepresentation",
      protected: true,
      permission: "g08.apar.representation.file",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          representation: context.services.apar.fileRepresentation(context.actor, requiredParam(context.params, "id"), {
            filedOn: requiredString(body, "filedOn"),
            grounds: requiredString(body, "grounds"),
            condoned: optionalBoolean(body, "condoned"),
          }),
        });
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: multi-RO part-periods + supervision-weighted aggregation + SLA escalation
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}/report-periods",
      operationId: "g08.addReportPeriod",
      protected: true,
      permission: "g08.apar.report_period.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          reportPeriod: context.services.apar.addReportPeriod(context.actor, requiredParam(context.params, "id"), {
            sequenceNo: optionalNumber(body, "sequenceNo") ?? 1,
            periodStart: requiredString(body, "periodStart"),
            periodEnd: requiredString(body, "periodEnd"),
            reportingOfficerId: optionalString(body, "reportingOfficerId") ?? ph03Ids.manager,
            supervisionMonths: optionalNumber(body, "supervisionMonths") ?? 0,
            partPeriodGrade: optionalNumber(body, "partPeriodGrade"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:aggregate-grade",
      operationId: "g08.aggregateProvisionalGrade",
      protected: true,
      permission: "g08.apar.report_period.aggregate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted(context.services.apar.aggregateProvisionalGrade(context.actor, requiredParam(context.params, "id"))),
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:escalate-sla",
      operationId: "g08.escalateReportPeriodAuthor",
      protected: true,
      permission: "g08.apar.sla.escalate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          reportPeriod: context.services.apar.escalateReportPeriodAuthor(context.actor, requiredParam(context.params, "id"), {
            sequenceNo: optionalNumber(body, "sequenceNo") ?? 1,
            escalatedToEmployeeId: requiredString(body, "escalatedToEmployeeId"),
            reason: optionalString(body, "reason") ?? "Tier SLA missed",
          }),
        });
      },
    },
    // PH-30C — G08 DSC e-signature and continuous feedback (route exposure).
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}/e-signature",
      operationId: "g08.signApar",
      protected: true,
      permission: "g08.signature.sign",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          signature: context.services.digitalSignature.sign(context.actor, {
            formId: requiredParam(context.params, "id"),
            actionType: requiredString(body, "actionType") as "CERTIFY" | "RATIFY" | "EXPUNGE",
            method: requiredString(body, "method") as "DSC" | "AADHAAR_ESIGN" | "HSM",
            payload: body.payload ?? {},
            certificateSerial: optionalString(body, "certificateSerial"),
            signedAt: requiredString(body, "signedAt"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/continuous-feedback",
      operationId: "g08.recordContinuousFeedback",
      protected: true,
      permission: "g08.feedback.record",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          feedback: context.services.continuousFeedback.recordFeedback(context.actor, {
            cycleId: requiredString(body, "cycleId"),
            appraiseeId: requiredString(body, "appraiseeId"),
            direction: requiredString(body, "direction") as "UPWARD" | "DOWNWARD" | "PEER",
            note: requiredString(body, "note"),
            recordedAt: requiredString(body, "recordedAt"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/360-feedback",
      operationId: "g08.open360",
      protected: true,
      permission: "g08.360.open",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          feedback360: context.services.feedback360.open360(context.actor, {
            cycleId: requiredString(body, "cycleId"),
            appraiseeId: requiredString(body, "appraiseeId"),
            minRaters: optionalNumber(body, "minRaters"),
          }),
        });
      },
    },
    // PH-38A — APAR calibration lifecycle route exposure (backing service already tested at
    // ph16e-g07-g08-depth). Convene -> recommend -> ratify (SoD) -> apply; diagnostic is read-only.
    {
      method: "POST",
      path: "/api/v1/appraisals/calibration-sessions",
      operationId: "g08.createCalibrationSession",
      protected: true,
      permission: "g08.calibration.convene",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          calibrationSession: context.services.apar.createCalibrationSession(context.actor, {
            cycleId: requiredString(body, "cycleId"),
            orgUnitScope: requiredString(body, "orgUnitScope"),
            method: requiredString(body, "method") as CalibrationMethod,
            committeeMemberIds: readStringArray(body, "committeeMemberIds"),
            targetDistribution: readGradeDistribution(body),
            bellCurveEnabled: optionalBoolean(body, "bellCurveEnabled"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/appraisals/calibration-sessions/{id}:recommend",
      operationId: "g08.proposeCalibrationRecommendation",
      protected: true,
      permission: "g08.calibration.recommend",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          calibrationRecommendation: context.services.apar.proposeCalibrationRecommendation(context.actor, requiredParam(context.params, "id"), {
            formId: requiredString(body, "formId"),
            currentGrade: Number(requiredString(body, "currentGrade")),
            recommendedGrade: Number(requiredString(body, "recommendedGrade")),
            rationale: requiredString(body, "rationale"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/appraisals/calibration-sessions/{id}/recommendations/{recommendationId}:ratify",
      operationId: "g08.ratifyCalibrationRecommendation",
      protected: true,
      permission: "g08.calibration.ratify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({
          calibrationRecommendation: context.services.apar.ratifyCalibrationRecommendation(
            context.actor,
            requiredParam(context.params, "id"),
            requiredParam(context.params, "recommendationId")
          ),
        }),
    },
    {
      method: "POST",
      path: "/api/v1/appraisals/calibration-sessions/{id}/recommendations/{recommendationId}:apply",
      operationId: "g08.applyCalibrationAdjustment",
      protected: true,
      permission: "g08.calibration.apply",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({
          calibrationAdjustment: context.services.apar.applyCalibrationAdjustment(
            context.actor,
            requiredParam(context.params, "id"),
            requiredParam(context.params, "recommendationId")
          ),
        }),
    },
    {
      method: "GET",
      path: "/api/v1/appraisals/calibration-sessions/{id}/distribution",
      operationId: "g08.calibrationDistributionDiagnostic",
      protected: true,
      permission: "g08.calibration.convene",
      handler: (context) => ok(context.services.apar.calibrationDistributionDiagnostic(context.actor, requiredParam(context.params, "id"))),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

/** Read a string[] body field (calibration committee member ids). */
function readStringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value.map((item) => String(item));
}

/** Optional target grade distribution (grade -> weight); undefined when absent. */
function readGradeDistribution(body: Record<string, unknown>): Record<string, number> | undefined {
  const value = body.targetDistribution;
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = readBodyRecord(value);
  const out: Record<string, number> = {};
  for (const [grade, weight] of Object.entries(record)) {
    out[grade] = Number(weight);
  }
  return out;
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
