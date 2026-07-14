import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { ApiContext, ApiQuery, ApiResponse, RouteDefinition } from "../http/apiTypes";
import type { PensionCase } from "../modules/g11/pensionService";
import { PensionScheme } from "../modules/g11/pensionService";
import { G11MoneyRounding, G11RuleAppliesTo } from "../modules/g11/pensionRuleRepository";
import { AccountVerifyMethod, AccountVerifyResult, PenDisbursementLineType } from "../modules/g11/pensionDisbursementRepository";
import {
  G11EnhancedBasis,
  G11GratuityType,
  G11ProceedingsType,
  G11ProvisionalOutcome,
  NpsBenefitEvent,
} from "../modules/g11/pensionBenefitRepository";
import { G11DeathSource, G11LcMethod } from "../modules/g11/pensionerLifecycleRepository";
import { G11RevisionType } from "../modules/g11/pensionRevisionRepository";
import { FoundationError } from "../platform/types";
import { ph03Ids } from "../seed/ph03Seed";

export const g11RouteEvidence = {
  cases: "/api/v1/pension/cases",
  verifyService: "/api/v1/pension/cases/{id}:verify-service",
  compute: "/api/v1/pension/cases/{id}:compute",
  sanction: "/api/v1/pension/cases/{id}:sanction",
  issuePpo: "/api/v1/pension/cases/{id}:issue-ppo",
  // PH-09A / BRD FR-G11-19: effective-dated rule tables E30-E36 (pen_da_relief_rates ..
  // pen_rounding_rules) with as-of resolution.
  rules: "/api/v1/pension/rules/{table}",
  rulesResolve: "/api/v1/pension/rules/{table}/resolve",
  // PH-09C / BRD FR-06/07/08/22: scheme-branched benefit engines on the rule substrate.
  commutation: "/api/v1/pension/cases/{id}/commutation",
  gratuityCompute: "/api/v1/pension/cases/{id}/gratuity:compute",
  familyPensionCompute: "/api/v1/pension/cases/{id}/family-pension:compute",
  provisionalPension: "/api/v1/pension/cases/{id}/provisional-pension",
  provisionalConclude: "/api/v1/pension/provisional-pension/{id}:conclude",
  // PH-15B / BRD FR-G11-12: pen_pensioners lifecycle (created on PPO authorisation) with
  // pen_life_certificates (SUSPENDED_NO_LC on lapse; release-with-arrear on submission)
  // and death -> family-pension conversion (CONVERTED_TO_FAMILY).
  pensioner: "/api/v1/pension/pensioners/{id}",
  lifeCertificate: "/api/v1/pension/pensioners/{id}/life-certificate",
  reportDeath: "/api/v1/pension/pensioners/{id}:report-death",
  lifeCertificateEvaluate: "/api/v1/pension/life-certificates:evaluate",
  familyMembers: "/api/v1/pension/family-members",
  // PH-15B / BRD FR-G11-13: pen_revisions DA / pay-commission batches — deterministic
  // deltas + arrears, P01 approval before APPLY, immutable once applied.
  revisions: "/api/v1/pension/revisions",
  revisionCompute: "/api/v1/pension/revisions/{id}:compute",
  revisionApprove: "/api/v1/pension/revisions/{id}:approve",
  revisionApply: "/api/v1/pension/revisions/{id}:apply",
  markers: [
    "SR_VERIFICATION_GATE",
    "QUALIFYING_SERVICE_LOCKED",
    "PENSION_CALC_TRACE",
    "PPO_ISSUED",
    "G11_SR_POSTED",
    "SUSPENDED_NO_LC",
    "CONVERTED_TO_FAMILY",
  ],
};

function toWirePensionCase(pensionCase: PensionCase): Omit<PensionCase, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = pensionCase;
  return wire;
}

export function registerG11Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/pension/cases",
      operationId: "g11.createCase",
      protected: true,
      permission: "g11.case.create",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          pensionCase: toWirePensionCase(
            context.services.pension.createCase(context.actor, {
              employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
              separationDate: requiredString(body, "separationDate"),
              scheme: readPensionScheme(body),
            })
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:verify-service",
      operationId: "g11.verifyService",
      protected: true,
      permission: "g11.service.verify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          pensionCase: toWirePensionCase(
            context.services.pension.verifyService(context.actor, requiredParam(context.params, "id"), {
              totalServiceMonths: optionalNumber(body, "totalServiceMonths") ?? 360,
              penaltyExclusionMonths: optionalNumber(body, "penaltyExclusionMonths"),
              srCertified: readBoolean(body, "srCertified", true),
            })
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:compute",
      operationId: "g11.computeBenefits",
      protected: true,
      permission: "g11.pension.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          pensionCase: toWirePensionCase(
            context.services.pension.computeBenefits(context.actor, requiredParam(context.params, "id"), {
              ruleVersion: optionalString(body, "ruleVersion") ?? "PENSION-RULE-2026-01",
              asOf: optionalString(body, "asOf"),
              scheme: optionalString(body, "scheme") === undefined ? undefined : readPensionSchemeValue(requiredString(body, "scheme")),
              upsOptedIn: readOptionalBoolean(body, "upsOptedIn"),
              npsEvent: readNpsEvent(optionalString(body, "npsEvent")),
            })
          ),
        });
      },
    },
    // ---- FR-G11-15: self-service non-binding estimate + "my cases" tracker ----
    {
      method: "POST",
      path: "/api/v1/pension/estimates",
      operationId: "g11.estimateBenefits",
      protected: true,
      permission: "g11.pension.self.read",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          estimate: context.services.pension.estimateBenefits(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            scheme: readPensionScheme(body),
            asOf: requiredString(body, "asOf"),
            qualifyingServiceMonths: optionalNumber(body, "qualifyingServiceMonths"),
            emolumentsBaseCents: optionalNumber(body, "emolumentsBaseCents"),
            upsOptedIn: readOptionalBoolean(body, "upsOptedIn"),
            npsEvent: readNpsEvent(optionalString(body, "npsEvent")),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/pension/employees/{id}/cases",
      operationId: "g11.listMyPensionCases",
      protected: true,
      permission: "g11.pension.self.read",
      handler: (context) => ok({ items: context.services.pension.listMyCases(context.actor, requiredParam(context.params, "id")).map(toWirePensionCase) }),
    },
    // ---- PH-09C / FR-G11-06: commutation (factor lookup by age-next-birthday) ----
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}/commutation",
      operationId: "g11.computeCommutation",
      protected: true,
      permission: "g11.pension.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          commutation: context.services.pensionBenefits.computeCommutation(context.actor, requiredParam(context.params, "id"), {
            commutedFractionBps: requiredNumber(body, "commutedFractionBps"),
            ageNextBirthday: requiredNumber(body, "ageNextBirthday"),
            reductionEffectiveDate: requiredString(body, "reductionEffectiveDate"),
            asOf: optionalString(body, "asOf"),
          }),
        });
      },
    },
    // ---- PH-09C / FR-G11-07: gratuity by type with E33 ceiling clamp ----
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}/gratuity:compute",
      operationId: "g11.computeGratuity",
      protected: true,
      permission: "g11.pension.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          gratuity: context.services.pensionBenefits.computeGratuity(context.actor, requiredParam(context.params, "id"), {
            gratuityType: readGratuityType(requiredString(body, "gratuityType")),
            asOf: optionalString(body, "asOf"),
            serviceSlabFactorTenThousandths: optionalNumber(body, "serviceSlabFactorTenThousandths"),
            serviceGratuityMonthsTenThousandths: optionalNumber(body, "serviceGratuityMonthsTenThousandths"),
          }),
        });
      },
    },
    // ---- PH-09C / FR-G11-08: family pension (normal + ENHANCED window) ----
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}/family-pension:compute",
      operationId: "g11.computeFamilyPension",
      protected: true,
      permission: "g11.pension.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          familyPension: context.services.pensionBenefits.computeFamilyPension(context.actor, requiredParam(context.params, "id"), {
            enhancedBasis: readEnhancedBasis(requiredString(body, "enhancedBasis")),
            eventDate: requiredString(body, "eventDate"),
            dateOfBirth: optionalString(body, "dateOfBirth"),
            wouldBeSuperannuationDate: optionalString(body, "wouldBeSuperannuationDate"),
            asOf: optionalString(body, "asOf"),
          }),
        });
      },
    },
    // ---- PH-09C / FR-G11-22: Rule 9 provisional pension (DCRG withheld) ----
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}/provisional-pension",
      operationId: "g11.createProvisionalPension",
      protected: true,
      permission: "g11.pension.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          provisionalPension: context.services.pensionBenefits.createProvisionalPension(context.actor, requiredParam(context.params, "id"), {
            proceedingsRef: requiredString(body, "proceedingsRef"),
            proceedingsType: readProceedingsType(requiredString(body, "proceedingsType")),
            commencedOn: requiredString(body, "commencedOn"),
            asOf: optionalString(body, "asOf"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/pension/cases/{id}/provisional-pension",
      operationId: "g11.getProvisionalPension",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ provisionalPensions: context.services.pensionBenefits.getProvisionalPension(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/provisional-pension/{id}:conclude",
      operationId: "g11.concludeProvisionalPension",
      protected: true,
      permission: "g11.pension.sanction",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          provisionalPension: context.services.pensionBenefits.concludeProvisionalPension(context.actor, requiredParam(context.params, "id"), {
            conclusionOutcome: readProvisionalOutcome(requiredString(body, "conclusionOutcome")),
            concludedOn: requiredString(body, "concludedOn"),
            finalRecoveryAmountCents: optionalNumber(body, "finalRecoveryAmountCents"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:sanction",
      operationId: "g11.sanction",
      protected: true,
      permission: "g11.pension.sanction",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ pensionCase: toWirePensionCase(context.services.pension.sanction(context.actor, requiredParam(context.params, "id"))) }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/cases/{id}:issue-ppo",
      operationId: "g11.issuePpo",
      protected: true,
      permission: "g11.ppo.issue",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({
          pensionCase: toWirePensionCase(
            context.services.pension.issuePpo(context.actor, requiredParam(context.params, "id"), {
              idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
            })
          ),
        }),
    },
    {
      method: "GET",
      path: "/api/v1/pension/summary",
      operationId: "g11.summary",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok(context.services.pension.summary(context.scope)),
    },
    // ---- PH-15B / FR-G11-12: pensioner master & lifecycle (pen_pensioners, E14) ----
    {
      method: "GET",
      path: "/api/v1/pension/pensioners/{id}",
      operationId: "g11.getPensioner",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ pensioner: context.services.pensionerLifecycle.getPensioner(context.scope, requiredParam(context.params, "id")) }),
    },
    // ---- PH-15B / FR-G11-12 E26: statutory family register consumed by conversion ----
    {
      method: "POST",
      path: "/api/v1/pension/family-members",
      operationId: "g11.registerFamilyMember",
      protected: true,
      permission: "g11.pensioner.maintain",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          familyMember: context.services.pensionerLifecycle.registerFamilyMember(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            memberName: requiredString(body, "memberName"),
            relation: requiredString(body, "relation"),
            statutoryRank: requiredNumber(body, "statutoryRank"),
            dateOfBirth: optionalString(body, "dateOfBirth"),
          }),
        });
      },
    },
    // ---- PH-15B / FR-G11-12 AC1: LC due/grace sweep (JOB-G11-LC-REMIND surface) ----
    {
      method: "POST",
      path: "/api/v1/pension/life-certificates:evaluate",
      operationId: "g11.evaluateLifeCertificates",
      protected: true,
      permission: "g11.pensioner.maintain",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          suspended: context.services.pensionerLifecycle.evaluateLifeCertificates(context.actor, {
            asOf: requiredString(body, "asOf"),
            graceDays: optionalNumber(body, "graceDays"),
          }),
        });
      },
    },
    // ---- PH-15B / FR-G11-12 AC2: LC submission (reactivates + releases with arrear) ----
    {
      method: "POST",
      path: "/api/v1/pension/pensioners/{id}/life-certificate",
      operationId: "g11.submitLifeCertificate",
      protected: true,
      permission: "g11.pensioner.maintain",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          submission: context.services.pensionerLifecycle.submitLifeCertificate(context.actor, requiredParam(context.params, "id"), {
            certificateYear: requiredNumber(body, "certificateYear"),
            method: readLcMethod(requiredString(body, "method")),
            submittedOn: requiredString(body, "submittedOn"),
            jeevanPramaanId: optionalString(body, "jeevanPramaanId"),
          }),
        });
      },
    },
    // ---- PH-15B / FR-G11-12 AC4: death -> family-pension conversion (E26 hierarchy) ----
    {
      method: "POST",
      path: "/api/v1/pension/pensioners/{id}:report-death",
      operationId: "g11.reportPensionerDeath",
      protected: true,
      permission: "g11.pensioner.maintain",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          conversion: context.services.pensionerLifecycle.reportDeath(context.actor, requiredParam(context.params, "id"), {
            dateOfDeath: requiredString(body, "dateOfDeath"),
            source: readDeathSource(optionalString(body, "source")),
          }),
        });
      },
    },
    // ---- PH-15B / FR-G11-13: revision batches (create -> compute -> approve -> apply) ----
    {
      method: "POST",
      path: "/api/v1/pension/revisions",
      operationId: "g11.createRevisionBatch",
      protected: true,
      permission: "g11.revision.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          revisionBatch: context.services.pensionRevisions.createBatch(context.actor, {
            revisionType: readRevisionType(requiredString(body, "revisionType")),
            effectiveDate: requiredString(body, "effectiveDate"),
            fitmentFactorTenThousandths: optionalNumber(body, "fitmentFactorTenThousandths"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/pension/revisions/{id}",
      operationId: "g11.getRevisionBatch",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) =>
        ok({
          revisionBatch: context.services.pensionRevisions.getBatch(context.scope, requiredParam(context.params, "id")),
          lines: context.services.pensionRevisions.listLines(context.scope, requiredParam(context.params, "id")),
        }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/revisions/{id}:compute",
      operationId: "g11.computeRevisionBatch",
      protected: true,
      permission: "g11.revision.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          lines: context.services.pensionRevisions.computeBatch(context.actor, requiredParam(context.params, "id"), {
            asOf: requiredString(body, "asOf"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/revisions/{id}:approve",
      operationId: "g11.approveRevisionBatch",
      protected: true,
      permission: "g11.revision.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ revisionBatch: context.services.pensionRevisions.approveBatch(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/revisions/{id}:apply",
      operationId: "g11.applyRevisionBatch",
      protected: true,
      permission: "g11.revision.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          revisionBatch: context.services.pensionRevisions.applyBatch(context.actor, requiredParam(context.params, "id"), {
            appliedOn: requiredString(body, "appliedOn"),
            jobRunRef: optionalString(body, "jobRunRef"),
          }),
        });
      },
    },
    // ---- PH-09A / FR-G11-19: rule tables E30-E36 (create DRAFT->EFFECTIVE row) ----
    {
      method: "POST",
      path: "/api/v1/pension/rules/{table}",
      operationId: "g11.createRuleRow",
      protected: true,
      permission: "g11.rules.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => createRuleRow(context),
    },
    // ---- PH-09A / FR-G11-19 AC5: as-of resolution (fails closed off-window) ----
    {
      method: "GET",
      path: "/api/v1/pension/rules/{table}/resolve",
      operationId: "g11.resolveRuleRow",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => resolveRuleRow(context),
    },
    // PH-29B — G11 disbursing-authority registry + proactive death detection (route exposure).
    {
      method: "POST",
      path: "/api/v1/pension/pdas",
      operationId: "g11.registerPda",
      protected: true,
      permission: "g11.pda.register",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          pda: context.services.pensionTreasury.registerPda(context.actor, {
            pdaCode: requiredString(body, "pdaCode"),
            name: requiredString(body, "name"),
            pdaDisbursementModel: requiredString(body, "pdaDisbursementModel") as "M11_COMPUTES_FULL" | "PDA_APPLIES_RELIEF",
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/death-reconcile",
      operationId: "g11.reconcileDeath",
      protected: true,
      permission: "g11.death.reconcile",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          vital: context.services.deathRecovery.reconcileDeath(context.actor, {
            pensionerId: requiredString(body, "pensionerId"),
            dateOfDeath: requiredString(body, "dateOfDeath"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/grievances",
      operationId: "g11.raiseGrievance",
      protected: true,
      permission: "g11.grievance.raise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          grievance: context.services.pensionTreasury.raiseGrievance(context.actor, {
            pensionerId: requiredString(body, "pensionerId"),
            category: requiredString(body, "category"),
            description: requiredString(body, "description"),
            receivedOn: requiredString(body, "receivedOn"),
          }),
        });
      },
    },
    // PH-47A — G11 PDA go-live lifecycle (certify sandbox -> activate; read), grievance close, and
    // pensioner bank-account verification. Route exposure for tested pensionTreasury / pensionDisbursement.
    {
      method: "POST",
      path: "/api/v1/pension/pdas/{id}:certify-sandbox",
      operationId: "g11.certifyPdaSandbox",
      protected: true,
      permission: "g11.pda.certify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ pda: context.services.pensionTreasury.certifyPdaSandbox(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/pdas/{id}:activate",
      operationId: "g11.activatePda",
      protected: true,
      permission: "g11.pda.activate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ pda: context.services.pensionTreasury.activatePda(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/pension/pdas/{id}",
      operationId: "g11.getPda",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ pda: context.services.pensionTreasury.getPda(context.scope, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/pension/grievances/{id}:close",
      operationId: "g11.closeGrievance",
      protected: true,
      permission: "g11.grievance.raise",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ grievance: context.services.pensionTreasury.closeGrievance(context.actor, requiredParam(context.params, "id"), { resolutionComment: requiredString(body, "resolutionComment") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/pension/account-verifications",
      operationId: "g11.recordAccountVerification",
      protected: true,
      permission: "g11.pensioner.maintain",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          verification: context.services.pensionDisbursement.recordAccountVerification(context.actor, {
            caseId: requiredString(body, "caseId"),
            accountNoMasked: requiredString(body, "accountNoMasked"),
            ifsc: requiredString(body, "ifsc"),
            accountName: requiredString(body, "accountName"),
            method: requiredString(body, "method") as AccountVerifyMethod,
            nameMatchScoreBps: optionalNumber(body, "nameMatchScoreBps"),
            verifiedName: optionalString(body, "verifiedName"),
            result: requiredString(body, "result") as AccountVerifyResult,
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/pension/cases/{caseId}/account-verifications",
      operationId: "g11.listVerifications",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ items: context.services.pensionDisbursement.listVerifications(context.scope, requiredParam(context.params, "caseId")) }),
    },
    // PH-58A — G11 pension disbursement (transmit + list) + pensioner lifecycle reads (life certificates,
    // pensioner-by-case). Route exposure for already-tested pensionDisbursement / pensionerLifecycle.
    {
      method: "POST",
      path: "/api/v1/pension/disbursements",
      operationId: "g11.disburse",
      protected: true,
      permission: "g11.disbursement.transmit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          disbursement: context.services.pensionDisbursement.disburse(context.actor, {
            caseId: requiredString(body, "caseId"),
            lineType: requiredString(body, "lineType") as PenDisbursementLineType,
            accountNoMasked: requiredString(body, "accountNoMasked"),
            ifsc: requiredString(body, "ifsc"),
            amountPaise: readG11Number(body, "amountPaise"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/pension/cases/{caseId}/disbursements",
      operationId: "g11.listDisbursements",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ items: context.services.pensionDisbursement.listDisbursements(context.scope, requiredParam(context.params, "caseId")) }),
    },
    {
      method: "GET",
      path: "/api/v1/pension/pensioners/{pensionerId}/life-certificates",
      operationId: "g11.listLifeCertificates",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ items: context.services.pensionerLifecycle.listLifeCertificates(context.scope, requiredParam(context.params, "pensionerId")) }),
    },
    {
      method: "GET",
      path: "/api/v1/pension/cases/{caseId}/pensioner",
      operationId: "g11.findPensionerByCase",
      protected: true,
      permission: "g11.pension.read",
      handler: (context) => ok({ pensioner: context.services.pensionerLifecycle.findPensionerByCase(context.scope, requiredParam(context.params, "caseId")) ?? null }),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

/** A required numeric body field accepting a JSON number or a numeric string. */
function readG11Number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new Error(`${key} must be a number`);
  }
  return n;
}

/** POST /api/v1/pension/rules/{table} — the seven E30-E36 tables keyed by kebab-case table segment. */
function createRuleRow(context: ApiContext): ApiResponse {
  const table = requiredParam(context.params, "table");
  const body = readBodyRecord(context.request.body);
  const rules = context.services.pensionRules;
  const actor = context.actor;
  const common = {
    ruleCode: requiredString(body, "ruleCode"),
    effectiveFrom: requiredString(body, "effectiveFrom"),
    effectiveTo: optionalString(body, "effectiveTo"),
  };
  switch (table) {
    case "da-relief-rates":
      return created({
        ruleRow: rules.addDaReliefRate(actor, {
          ...common,
          appliesTo: readAppliesTo(optionalString(body, "appliesTo")),
          daPercentBps: requiredNumber(body, "daPercentBps"),
          payCommissionBasis: optionalString(body, "payCommissionBasis"),
        }),
      });
    case "commutation-factors":
      return created({
        ruleRow: rules.addCommutationFactor(actor, {
          ...common,
          ageNextBirthday: requiredNumber(body, "ageNextBirthday"),
          factorTenThousandths: requiredNumber(body, "factorTenThousandths"),
        }),
      });
    case "family-pension-rates":
      return created({
        ruleRow: rules.addFamilyPensionRate(actor, {
          ...common,
          normalRateBps: requiredNumber(body, "normalRateBps"),
          enhancedRateBps: optionalNumber(body, "enhancedRateBps"),
          enhancedInServiceYears: optionalNumber(body, "enhancedInServiceYears"),
          enhancedAfterRetireYears: optionalNumber(body, "enhancedAfterRetireYears"),
          enhancedAfterRetireAgeCap: optionalNumber(body, "enhancedAfterRetireAgeCap"),
          dualFpCapCents: optionalNumber(body, "dualFpCapCents"),
        }),
      });
    case "gratuity-ceilings":
      return created({
        ruleRow: rules.addGratuityCeiling(actor, {
          ...common,
          baseCeilingCents: requiredNumber(body, "baseCeilingCents"),
          daThresholdBps: optionalNumber(body, "daThresholdBps"),
          autoStepBps: optionalNumber(body, "autoStepBps"),
          currentEffectiveCeilingCents: optionalNumber(body, "currentEffectiveCeilingCents"),
          daRateRef: optionalString(body, "daRateRef"),
        }),
      });
    case "retirement-age-rules":
      return created({
        ruleRow: rules.addRetirementAgeRule(actor, {
          ...common,
          cadre: optionalString(body, "cadre"),
          category: optionalString(body, "category"),
          superannuationAge: requiredNumber(body, "superannuationAge"),
        }),
      });
    case "pension-limit-rules":
      return created({
        ruleRow: rules.addPensionLimitRule(actor, {
          ...common,
          minPensionCents: requiredNumber(body, "minPensionCents"),
          maxPensionCents: requiredNumber(body, "maxPensionCents"),
          minQualifyingYearsForPension: optionalNumber(body, "minQualifyingYearsForPension"),
          minQualifyingYearsForFull: optionalNumber(body, "minQualifyingYearsForFull"),
          upsMinGuaranteeCents: optionalNumber(body, "upsMinGuaranteeCents"),
        }),
      });
    case "rounding-rules":
      return created({
        ruleRow: rules.addRoundingRule(actor, {
          ...common,
          halfYearThresholdMonths: optionalNumber(body, "halfYearThresholdMonths"),
          moneyRounding: readMoneyRounding(optionalString(body, "moneyRounding")),
          qualifyingServiceCapHalfYears: optionalNumber(body, "qualifyingServiceCapHalfYears"),
        }),
      });
    default:
      throw new FoundationError("NOT_FOUND", `Unknown pension rule table ${table}`, { field: "table" });
  }
}

/** GET /api/v1/pension/rules/{table}/resolve?asOf=YYYY-MM-DD (plus table-specific dims). */
function resolveRuleRow(context: ApiContext): ApiResponse {
  const table = requiredParam(context.params, "table");
  const query = context.request.query ?? {};
  const asOf = requiredQuery(query, "asOf");
  const rules = context.services.pensionRules;
  const scope = context.scope;
  switch (table) {
    case "da-relief-rates":
      return ok({ ruleRow: rules.resolveDaReliefRate(scope, asOf, readAppliesTo(query.appliesTo)) });
    case "commutation-factors":
      return ok({ ruleRow: rules.resolveCommutationFactor(scope, asOf, Number(requiredQuery(query, "ageNextBirthday"))) });
    case "family-pension-rates":
      return ok({ ruleRow: rules.resolveFamilyPensionRate(scope, asOf) });
    case "gratuity-ceilings":
      return ok({ ruleRow: rules.resolveGratuityCeiling(scope, asOf) });
    case "retirement-age-rules":
      return ok({ ruleRow: rules.resolveRetirementAge(scope, asOf, { cadre: query.cadre, category: query.category }) });
    case "pension-limit-rules":
      return ok({ ruleRow: rules.resolvePensionLimits(scope, asOf) });
    case "rounding-rules":
      return ok({ ruleRow: rules.resolveRoundingRule(scope, asOf) });
    default:
      throw new FoundationError("NOT_FOUND", `Unknown pension rule table ${table}`, { field: "table" });
  }
}

function requiredNumber(body: Record<string, unknown>, field: string): number {
  const value = optionalNumber(body, field);
  if (value === undefined) {
    throw new FoundationError("VALIDATION_FAILED", `${field} is required`, { field });
  }
  return value;
}

function requiredQuery(query: ApiQuery, key: string): string {
  const value = query[key];
  if (!value) {
    throw new FoundationError("VALIDATION_FAILED", `${key} query parameter is required`, { field: key });
  }
  return value;
}

function readAppliesTo(value: string | undefined): G11RuleAppliesTo | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "PENSIONER" || value === "EMPLOYEE" || value === "BOTH") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported appliesTo ${value}`, { field: "appliesTo" });
}

function readMoneyRounding(value: string | undefined): G11MoneyRounding | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "NEXT_HIGHER_RUPEE" || value === "NEAREST_RUPEE") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported moneyRounding ${value}`, { field: "moneyRounding" });
}

function readPensionScheme(body: Record<string, unknown>): PensionScheme {
  return readPensionSchemeValue(optionalString(body, "scheme") ?? "OPS");
}

function readPensionSchemeValue(value: string): PensionScheme {
  if (value === "OPS" || value === "NPS" || value === "UPS") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported pension scheme ${value}`, { field: "scheme" });
}

function readNpsEvent(value: string | undefined): NpsBenefitEvent | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "SUPERANNUATION" || value === "DEATH_IN_SERVICE" || value === "INVALIDATION") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported npsEvent ${value}`, { field: "npsEvent" });
}

function readGratuityType(value: string): G11GratuityType {
  if (value === "RETIREMENT_GRATUITY" || value === "DEATH_GRATUITY" || value === "SERVICE_GRATUITY") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported gratuityType ${value}`, { field: "gratuityType" });
}

function readEnhancedBasis(value: string): G11EnhancedBasis {
  if (value === "IN_SERVICE" || value === "AFTER_RETIREMENT") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported enhancedBasis ${value}`, { field: "enhancedBasis" });
}

function readProceedingsType(value: string): G11ProceedingsType {
  if (value === "DEPARTMENTAL" || value === "JUDICIAL") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported proceedingsType ${value}`, { field: "proceedingsType" });
}

function readLcMethod(value: string): G11LcMethod {
  if (value === "JEEVAN_PRAMAAN_DLC" || value === "PHYSICAL" || value === "VIDEO_KYC" || value === "BANK_CERTIFIED") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported life-certificate method ${value}`, { field: "method" });
}

function readDeathSource(value: string | undefined): G11DeathSource | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "REPORTED" || value === "DEATH_REGISTRY" || value === "DBT_ANOMALY" || value === "LC_FAILURE") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported death source ${value}`, { field: "source" });
}

function readRevisionType(value: string): G11RevisionType {
  if (value === "DA" || value === "PAY_COMMISSION" || value === "RESTORATION" || value === "AGE_INCREMENT") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported revisionType ${value}`, { field: "revisionType" });
}

function readProvisionalOutcome(value: string): G11ProvisionalOutcome {
  if (value === "EXONERATED" || value === "PENALTY_NO_RECOVERY" || value === "PENALTY_WITH_RECOVERY") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported conclusionOutcome ${value}`, { field: "conclusionOutcome" });
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new FoundationError("VALIDATION_FAILED", `${key} must be a boolean`, { field: key });
  }
  return value;
}

function readBoolean(body: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = body[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
