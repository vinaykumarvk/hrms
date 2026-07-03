import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";

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
          nomination: context.services.training.nominate(context.actor, {
            sessionId: requiredString(body, "sessionId"),
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
          }),
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
      handler: (context) => accepted({ nomination: context.services.training.approveNomination(context.actor, requiredParam(context.params, "id")) }),
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
        return accepted(
          context.services.training.completeNomination(context.actor, requiredParam(context.params, "id"), {
            passed: optionalBoolean(body, "passed") ?? true,
            significantForSr: optionalBoolean(body, "significantForSr") ?? false,
            completionDate: requiredString(body, "completionDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
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
  ];
  routes.forEach((route) => kernel.register(route));
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
