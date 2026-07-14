import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";
import { CredentialVerificationMethod, SponsorshipType } from "../modules/g07/trainingDepthRepository";
import type { TrainingSession, TrainingNomination } from "../modules/g07/trainingService";
import { FoundationError } from "../platform/types";

/** Session catalog rows carry no maker/internal-only fields beyond tenantId/entityId (a
 *  pre-existing, codebase-wide convention this session's other fixes don't retroactively touch —
 *  see the G12 coverage report's F2 discussion), so only the entity/tenant pair is stripped here. */
function toWireSession(session: TrainingSession): Omit<TrainingSession, "tenantId" | "entityId"> {
  const { tenantId: _tenantId, entityId: _entityId, ...wire } = session;
  return wire;
}

/** workflowInstanceId is an internal P01 linkage id with no meaning to the employee viewing their
 *  own nomination history; strips it alongside tenantId/entityId. */
function toWireNomination(nomination: TrainingNomination): Omit<TrainingNomination, "tenantId" | "entityId" | "workflowInstanceId"> {
  const { tenantId: _tenantId, entityId: _entityId, workflowInstanceId: _workflowInstanceId, ...wire } = nomination;
  return wire;
}

export const g07RouteEvidence = {
  sessions: "/api/v1/training/sessions",
  nominations: "/api/v1/training/nominations",
  approve: "/api/v1/training/nominations/{id}:approve",
  complete: "/api/v1/training/nominations/{id}:complete",
  workflow: "WF-G07-NOMINATION",
  srMarker: "TRAINING_CERTIFICATION_POSTED",
  // PH-08D: taxonomy + gap analysis + the versioned Gap Contract route (FR-G07-024) + campaigns.
  gapContract: "/api/v1/gap-contract/v1",
  campaigns: "/api/v1/training/campaigns",
  certExpiryJob: "JOB-G07-CERTEXPIRY",
};

export function registerG07Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/training/sessions",
      operationId: "g07.createSession",
      protected: true,
      permission: "g07.training.session.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          session: context.services.training.createSession(context.actor, {
            programCode: requiredString(body, "programCode"),
            title: requiredString(body, "title"),
            capacity: optionalNumber(body, "capacity") ?? 1,
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/training/sessions",
      operationId: "g07.listSessions",
      protected: true,
      permission: "g07.training.read",
      handler: (context) => ok({ items: context.services.training.listSessions(context.scope).map(toWireSession) }),
    },
    {
      method: "GET",
      path: "/api/v1/training/employees/{id}/nominations",
      operationId: "g07.listMyNominations",
      protected: true,
      permission: "g07.training.read",
      handler: (context) => ok({ items: context.services.training.listMyNominations(context.actor, requiredParam(context.params, "id")).map(toWireNomination) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/nominations",
      operationId: "g07.nominate",
      protected: true,
      permission: "g07.nomination.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          nomination: toWireNomination(
            context.services.training.nominate(context.actor, {
              sessionId: requiredString(body, "sessionId"),
              employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            })
          ),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/nominations/{id}:approve",
      operationId: "g07.approveNomination",
      protected: true,
      permission: "g07.nomination.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) =>
        accepted({ nomination: toWireNomination(context.services.training.approveNomination(context.actor, requiredParam(context.params, "id"))) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/nominations/{id}:complete",
      operationId: "g07.completeNomination",
      protected: true,
      permission: "g07.nomination.complete",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        const result = context.services.training.completeNomination(context.actor, requiredParam(context.params, "id"), {
          passed: optionalBoolean(body, "passed") ?? true,
          significantForSr: optionalBoolean(body, "significantForSr") ?? false,
          completionDate: requiredString(body, "completionDate"),
          idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
        });
        return accepted({ ...result, nomination: toWireNomination(result.nomination) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/training/summary",
      operationId: "g07.summary",
      protected: true,
      permission: "g07.training.read",
      handler: (context) => ok(context.services.training.summary(context.scope)),
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: skills/competencies taxonomy + role competency models + skill inventory
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/training/skill-categories",
      operationId: "g07.defineSkillCategory",
      protected: true,
      permission: "g07.taxonomy.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          skillCategory: context.services.training.defineSkillCategory(context.actor, {
            code: requiredString(body, "code"),
            name: requiredString(body, "name"),
            parentCategoryId: optionalString(body, "parentCategoryId"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/skills",
      operationId: "g07.defineSkill",
      protected: true,
      permission: "g07.taxonomy.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          skill: context.services.training.defineSkill(context.actor, {
            skillCategoryId: requiredString(body, "skillCategoryId"),
            code: requiredString(body, "code"),
            name: requiredString(body, "name"),
            isComplianceSkill: optionalBoolean(body, "isComplianceSkill"),
            defaultValidityMonths: optionalNumber(body, "defaultValidityMonths"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/competencies",
      operationId: "g07.defineCompetency",
      protected: true,
      permission: "g07.taxonomy.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          competency: context.services.training.defineCompetency(context.actor, {
            code: requiredString(body, "code"),
            name: requiredString(body, "name"),
            competencyType: (optionalString(body, "competencyType") ?? "FUNCTIONAL") as "FUNCTIONAL" | "BEHAVIOURAL" | "LEADERSHIP" | "DIGITAL",
            linkedSkillIds: Array.isArray(body.linkedSkillIds) ? (body.linkedSkillIds as string[]) : [],
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/competency-models",
      operationId: "g07.defineCompetencyModel",
      protected: true,
      permission: "g07.competency_model.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          competencyModel: context.services.training.defineCompetencyModel(context.actor, {
            code: requiredString(body, "code"),
            name: requiredString(body, "name"),
            scopeType: (optionalString(body, "scopeType") ?? "ROLE") as "ROLE" | "DESIGNATION" | "CADRE" | "ORG_UNIT" | "GENERIC",
            scopeRef: optionalString(body, "scopeRef"),
            ownerEmployeeId: optionalString(body, "ownerEmployeeId") ?? ph03Ids.manager,
            reviewDueDate: requiredString(body, "reviewDueDate"),
            items: Array.isArray(body.items)
              ? (body.items as Array<{ competencyId: string; targetProficiencyLevel: number; isCritical?: boolean }>)
              : [],
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/employee-skills",
      operationId: "g07.recordEmployeeSkill",
      protected: true,
      permission: "g07.employee_skill.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          employeeSkill: context.services.training.recordEmployeeSkill(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            skillId: requiredString(body, "skillId"),
            currentProficiencyLevel: optionalNumber(body, "currentProficiencyLevel") ?? 0,
            source: optionalString(body, "source") as "SELF" | "MANAGER" | "ASSESSMENT" | "TRAINING" | "CREDENTIAL" | undefined,
            validatedBy: optionalString(body, "validatedBy"),
          }),
        });
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: gap analysis + versioned read-only Gap Contract route (FR-G07-024, §10.6)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/training/gap-analyses",
      operationId: "g07.runSkillGapAnalysis",
      protected: true,
      permission: "g07.gap_analysis.run",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.training.runSkillGapAnalysis(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            competencyModelId: requiredString(body, "competencyModelId"),
            generatedOn: requiredString(body, "generatedOn"),
          })
        );
      },
    },
    {
      // FR-G07-024: the versioned READ-ONLY Gap Contract consumed by G06/G08 — never G07 internals.
      method: "GET",
      path: "/api/v1/gap-contract/v1",
      operationId: "g07.getGapContract",
      protected: true,
      permission: "g07.gap_contract.read",
      handler: (context) =>
        ok({
          gapContract: context.services.training.getGapContract(context.scope, {
            employeeId: context.request.query?.employeeId ?? ph03Ids.employee,
            competencyModelId: context.request.query?.modelId ?? "",
          }),
        }),
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: certification validity/renewal — JOB-G07-CERTEXPIRY (lapsed_mandatory flip)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/training/jobs/cert-expiry:run",
      operationId: "g07.runCertExpiryJob",
      protected: true,
      permission: "g07.jobs.cert_expiry.run",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(context.services.training.runCertExpiryJob(context.actor, { asOf: requiredString(body, "asOf") }));
      },
    },
    // ---------------------------------------------------------------------------------
    // PH-08D: campaign engine basics — waves + escalation (FR-G07-017)
    // ---------------------------------------------------------------------------------
    {
      method: "POST",
      path: "/api/v1/training/campaigns",
      operationId: "g07.createCampaign",
      protected: true,
      permission: "g07.campaign.launch",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          campaign: context.services.training.createCampaign(context.actor, {
            code: requiredString(body, "code"),
            name: requiredString(body, "name"),
            programCode: requiredString(body, "programCode"),
            windowStart: requiredString(body, "windowStart"),
            windowEnd: requiredString(body, "windowEnd"),
            waveSize: optionalNumber(body, "waveSize"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/campaigns/{id}:add-targets",
      operationId: "g07.addCampaignTargets",
      protected: true,
      permission: "g07.campaign.target.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          targets: context.services.training.addCampaignTargets(context.actor, requiredParam(context.params, "id"), {
            employeeIds: Array.isArray(body.employeeIds) ? (body.employeeIds as string[]) : [],
            dueDate: requiredString(body, "dueDate"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/campaigns/{id}:escalate",
      operationId: "g07.escalateCampaignTargets",
      protected: true,
      permission: "g07.campaign.escalate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          escalated: context.services.training.escalateCampaignTargets(context.actor, requiredParam(context.params, "id"), {
            asOf: requiredString(body, "asOf"),
          }),
        });
      },
    },
    // PH-31C — G07 vendor/external-trainer empanelment (route exposure for the PH-20A engine).
    {
      method: "POST",
      path: "/api/v1/training/vendor-empanelments",
      operationId: "g07.applyForEmpanelment",
      protected: true,
      permission: "g07.empanelment.apply",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          empanelment: context.services.vendorEmpanelment.applyForEmpanelment(context.actor, {
            vendorName: requiredString(body, "vendorName"),
            category: requiredString(body, "category"),
            procurementRef: optionalString(body, "procurementRef"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/learning-record-stores",
      operationId: "g07.registerLrs",
      protected: true,
      permission: "g07.lrs.register",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          lrs: context.services.lmsIntegration.registerLrs(context.actor, {
            name: requiredString(body, "name"),
            endpoint: requiredString(body, "endpoint"),
            isPrimary: optionalBoolean(body, "isPrimary"),
          }),
        });
      },
    },
    // PH-41A — FR-G07-020 training-sponsorship + service-bond lifecycle route exposure. Backing already
    // service-tested (propose -> sanction -> activate bond -> fulfil / breach -> emit recovery -> recover;
    // waive; reads). Money is integer paise; bond recovery is pro-rata on unserved months.
    {
      method: "POST",
      path: "/api/v1/training/sponsorships",
      operationId: "g07.createSponsorship",
      protected: true,
      permission: "g07.sponsorship.request",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          sponsorship: context.services.training.createSponsorship(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            sponsorshipType: requiredString(body, "sponsorshipType") as SponsorshipType,
            sponsoredAmountPaise: requiredNumber(body, "sponsoredAmountPaise"),
            startDate: requiredString(body, "startDate"),
            endDate: optionalString(body, "endDate"),
            serviceBondMonths: requiredNumber(body, "serviceBondMonths"),
            trainingProgramId: optionalString(body, "trainingProgramId"),
            externalCourseName: optionalString(body, "externalCourseName"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:sanction",
      operationId: "g07.sanctionSponsorship",
      protected: true,
      permission: "g07.sponsorship.sanction",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ sponsorship: context.services.training.sanctionSponsorship(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:activate-bond",
      operationId: "g07.activateSponsorshipBond",
      protected: true,
      permission: "g07.sponsorship.administer",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ sponsorship: context.services.training.activateSponsorshipBond(context.actor, requiredParam(context.params, "id"), { completionDate: requiredString(body, "completionDate") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:fulfil",
      operationId: "g07.fulfilSponsorshipBond",
      protected: true,
      permission: "g07.sponsorship.administer",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ sponsorship: context.services.training.fulfilSponsorshipBond(context.actor, requiredParam(context.params, "id"), { asOf: requiredString(body, "asOf") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:breach",
      operationId: "g07.markSponsorshipBreached",
      protected: true,
      permission: "g07.sponsorship.administer",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ sponsorship: context.services.training.markSponsorshipBreached(context.actor, requiredParam(context.params, "id"), { breachDate: requiredString(body, "breachDate") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:emit-recovery",
      operationId: "g07.emitBondRecoveryCost",
      protected: true,
      permission: "g07.sponsorship.recovery",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => created({ cost: context.services.training.emitBondRecoveryCost(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:recover",
      operationId: "g07.markSponsorshipRecovered",
      protected: true,
      permission: "g07.sponsorship.recovery",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ sponsorship: context.services.training.markSponsorshipRecovered(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/sponsorships/{id}:waive",
      operationId: "g07.waiveSponsorship",
      protected: true,
      permission: "g07.sponsorship.waive",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ sponsorship: context.services.training.waiveSponsorship(context.actor, requiredParam(context.params, "id"), { reason: requiredString(body, "reason") }) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/training/sponsorships/{id}",
      operationId: "g07.getSponsorship",
      protected: true,
      permission: "g07.sponsorship.read",
      handler: (context) => ok({ sponsorship: context.services.training.getSponsorship(context.scope, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/training/sponsorships/{id}/costs",
      operationId: "g07.listSponsorshipCosts",
      protected: true,
      permission: "g07.sponsorship.read",
      handler: (context) => ok({ items: context.services.training.listSponsorshipCosts(context.scope, requiredParam(context.params, "id")) }),
    },
    // PH-42A — FR-G07-018 external-credential lifecycle (capture -> evidence-review -> verify/reject;
    // SoD; VAL-G07-CREDREF; VERIFIED significant credential posts to G12) + reads.
    {
      method: "POST",
      path: "/api/v1/training/external-credentials",
      operationId: "g07.captureExternalCredential",
      protected: true,
      permission: "g07.credential.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          context.services.training.captureExternalCredential(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            title: requiredString(body, "title"),
            issuingBody: requiredString(body, "issuingBody"),
            externalReferenceNo: requiredString(body, "externalReferenceNo"),
            issueDate: requiredString(body, "issueDate"),
            validUntil: optionalString(body, "validUntil"),
            evidenceDocumentId: optionalString(body, "evidenceDocumentId"),
            significantForSr: optionalBoolean(body, "significantForSr"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/external-credentials/{id}:review-evidence",
      operationId: "g07.reviewCredentialEvidence",
      protected: true,
      permission: "g07.credential.verify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          verification: context.services.training.reviewCredentialEvidence(context.actor, requiredParam(context.params, "id"), {
            reviewedOn: requiredString(body, "reviewedOn"),
            comments: optionalString(body, "comments"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/external-credentials/{id}:verify",
      operationId: "g07.verifyExternalCredential",
      protected: true,
      permission: "g07.credential.verify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.training.verifyExternalCredential(context.actor, requiredParam(context.params, "id"), {
            verifiedOn: requiredString(body, "verifiedOn"),
            verificationMethod: optionalString(body, "verificationMethod") as CredentialVerificationMethod | undefined,
            comments: optionalString(body, "comments"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/training/external-credentials/{id}:reject",
      operationId: "g07.rejectExternalCredential",
      protected: true,
      permission: "g07.credential.verify",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.training.rejectExternalCredential(context.actor, requiredParam(context.params, "id"), {
            rejectedOn: requiredString(body, "rejectedOn"),
            comments: requiredString(body, "comments"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/training/external-credentials/{id}",
      operationId: "g07.getExternalCredential",
      protected: true,
      permission: "g07.credential.read",
      handler: (context) => ok({ credential: context.services.training.getExternalCredential(context.scope, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/training/external-credentials/{id}/verifications",
      operationId: "g07.listCredentialVerifications",
      protected: true,
      permission: "g07.credential.read",
      handler: (context) => ok({ items: context.services.training.listCredentialVerifications(context.scope, requiredParam(context.params, "id")) }),
    },
    // PH-42A — vendor-empanelment review/decide (4-eyes) + read (applyForEmpanelment already routed).
    {
      method: "POST",
      path: "/api/v1/training/vendor-empanelments/{id}:review",
      operationId: "g07.reviewEmpanelment",
      protected: true,
      permission: "g07.empanelment.review",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ empanelment: context.services.vendorEmpanelment.reviewEmpanelment(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/training/vendor-empanelments/{id}:decide",
      operationId: "g07.decideEmpanelment",
      protected: true,
      permission: "g07.empanelment.decide",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          empanelment: context.services.vendorEmpanelment.decideEmpanelment(context.actor, requiredParam(context.params, "id"), {
            decision: requiredString(body, "decision") as "EMPANELLED" | "REJECTED",
            contractRef: optionalString(body, "contractRef"),
            reason: optionalString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/training/vendor-empanelments/{id}",
      operationId: "g07.getEmpanelment",
      protected: true,
      permission: "g07.empanelment.read",
      handler: (context) => {
        const row = context.services.vendorEmpanelment.getEmpanelment(context.scope, requiredParam(context.params, "id"));
        if (!row) {
          throw new FoundationError("NOT_FOUND", "Vendor empanelment not found");
        }
        return ok({ empanelment: row });
      },
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

/** A required numeric body field accepting a JSON number or a numeric string. */
function requiredNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new Error(`${key} must be a number`);
  }
  return n;
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
