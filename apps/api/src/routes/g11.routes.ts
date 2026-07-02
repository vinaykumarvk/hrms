import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { ApiContext, ApiQuery, ApiResponse, RouteDefinition } from "../http/apiTypes";
import { PensionScheme } from "../modules/g11/pensionService";
import { G11MoneyRounding, G11RuleAppliesTo } from "../modules/g11/pensionRuleRepository";
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
  markers: ["SR_VERIFICATION_GATE", "QUALIFYING_SERVICE_LOCKED", "PENSION_CALC_TRACE", "PPO_ISSUED", "G11_SR_POSTED"],
};

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
          pensionCase: context.services.pension.createCase(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            separationDate: requiredString(body, "separationDate"),
            scheme: readPensionScheme(body),
          }),
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
          pensionCase: context.services.pension.verifyService(context.actor, requiredParam(context.params, "id"), {
            totalServiceMonths: optionalNumber(body, "totalServiceMonths") ?? 360,
            penaltyExclusionMonths: optionalNumber(body, "penaltyExclusionMonths"),
            srCertified: readBoolean(body, "srCertified", true),
          }),
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
        return accepted({ pensionCase: context.services.pension.computeBenefits(context.actor, requiredParam(context.params, "id"), { ruleVersion: optionalString(body, "ruleVersion") ?? "PENSION-RULE-2026-01" }) });
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
      handler: (context) => accepted({ pensionCase: context.services.pension.sanction(context.actor, requiredParam(context.params, "id")) }),
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
          pensionCase: context.services.pension.issuePpo(context.actor, requiredParam(context.params, "id"), {
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          }),
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
  ];
  routes.forEach((route) => kernel.register(route));
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
  const value = optionalString(body, "scheme") ?? "OPS";
  if (value === "OPS" || value === "NPS" || value === "UPS") {
    return value;
  }
  throw new Error(`Unsupported pension scheme ${value}`);
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
