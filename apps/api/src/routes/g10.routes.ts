import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalNumber, optionalString, readBodyRecord, requiredString } from "../http/body";
import { ApiQuery, RouteDefinition } from "../http/apiTypes";
import { PayrollAdjustmentCode, PayrollAdjustmentSource } from "../modules/g10/payrollService";
import { PayCalcMethod, PayComponentCategory, RateTableType, TaxRegime } from "../modules/g10/payRuleRepository";
import { FoundationError } from "../platform/types";
import { ph03Ids } from "../seed/ph03Seed";

export const g10RouteEvidence = {
  salaryStructures: "/api/v1/payroll/salary-structures",
  runs: "/api/v1/payroll/runs",
  lockInputs: "/api/v1/payroll/runs/{id}:lock-inputs",
  compute: "/api/v1/payroll/runs/{id}:compute",
  disburse: "/api/v1/payroll/runs/{id}:disburse",
  // PH-09A rule substrate (BRD G10 FR-01/FR-02): pay_components / pay_rules / rate_tables.
  payComponents: "/api/v1/payroll/pay-components",
  payRules: "/api/v1/payroll/pay-rules",
  rateTables: "/api/v1/payroll/rate-tables",
  rateResolve: "/api/v1/payroll/rate-tables/resolve",
  markers: ["PAYROLL_TRACE", "RULE_VERSION_SNAPSHOT", "INPUT_LOCKED", "BANK_X3_EXPORT", "LAST_PAY_DRAWN"],
};

export function registerG10Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/payroll/salary-structures",
      operationId: "g10.createSalaryStructure",
      protected: true,
      permission: "g10.salary.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          salaryStructure: context.services.payroll.createSalaryStructure(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            basicPayCents: optionalNumber(body, "basicPayCents") ?? 10000000,
            daRateBps: optionalNumber(body, "daRateBps") ?? 4200,
            hraRateBps: optionalNumber(body, "hraRateBps") ?? 800,
            npsRateBps: optionalNumber(body, "npsRateBps") ?? 1000,
            professionalTaxCents: optionalNumber(body, "professionalTaxCents") ?? 20000,
            ruleVersion: optionalString(body, "ruleVersion") ?? "PAY-RULE-2026-01",
            effectiveFrom: requiredString(body, "effectiveFrom"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/payroll/adjustments",
      operationId: "g10.addAdjustment",
      protected: true,
      permission: "g10.adjustment.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          adjustment: context.services.payroll.addAdjustment(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            period: requiredString(body, "period"),
            sourceModule: readAdjustmentSource(body),
            code: readAdjustmentCode(body),
            amountCents: optionalNumber(body, "amountCents"),
            lopDays: optionalNumber(body, "lopDays"),
            sourceRef: optionalString(body, "sourceRef") ?? requiredString({ key: context.idempotencyKey }, "key"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs",
      operationId: "g10.createRun",
      protected: true,
      permission: "g10.payroll.run.create",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({ payrollRun: context.services.payroll.createRun(context.actor, { period: requiredString(body, "period") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs/{id}:lock-inputs",
      operationId: "g10.lockInputs",
      protected: true,
      permission: "g10.payroll.input.lock",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ payrollRun: context.services.payroll.lockInputs(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs/{id}:compute",
      operationId: "g10.computeRun",
      protected: true,
      permission: "g10.payroll.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ payrollRun: context.services.payroll.computeRun(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs/{id}:reconcile",
      operationId: "g10.reconcileRun",
      protected: true,
      permission: "g10.payroll.reconcile",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ payrollRun: context.services.payroll.reconcileRun(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs/{id}:approve",
      operationId: "g10.approveRun",
      protected: true,
      permission: "g10.payroll.approve",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ payrollRun: context.services.payroll.approveRun(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs/{id}:lock",
      operationId: "g10.lockRun",
      protected: true,
      permission: "g10.payroll.lock",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ payrollRun: context.services.payroll.lockRun(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/payroll/runs/{id}:disburse",
      operationId: "g10.disburseRun",
      protected: true,
      permission: "g10.payroll.disburse",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ payrollRun: context.services.payroll.disburseRun(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/payroll/summary",
      operationId: "g10.summary",
      protected: true,
      permission: "g10.payroll.read",
      handler: (context) => ok(context.services.payroll.summary(context.scope)),
    },
    // ---- PH-09A rule substrate: E05 pay_components / E06 pay_rules / E07 rate_tables ----
    {
      method: "POST",
      path: "/api/v1/payroll/pay-components",
      operationId: "g10.createPayComponent",
      protected: true,
      permission: "g10.payrule.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          payComponent: context.services.payRules.createPayComponent(context.actor, {
            componentCode: requiredString(body, "componentCode"),
            name: requiredString(body, "name"),
            category: readComponentCategory(body),
            calcMethod: readCalcMethod(body),
            isTaxable: optionalBoolean(body, "isTaxable"),
            isStatutory: optionalBoolean(body, "isStatutory"),
            displayOrder: optionalNumber(body, "displayOrder"),
            effectiveFrom: optionalString(body, "effectiveFrom"),
            effectiveTo: optionalString(body, "effectiveTo"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/payroll/pay-rules",
      operationId: "g10.createPayRule",
      protected: true,
      permission: "g10.payrule.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          payRule: context.services.payRules.createPayRule(context.actor, {
            componentCode: requiredString(body, "componentCode"),
            calcMethod: readCalcMethod(body),
            formulaExpression: optionalString(body, "formulaExpression"),
            rateTableId: optionalString(body, "rateTableId"),
            computationOrder: optionalNumber(body, "computationOrder"),
            roundingRule: optionalString(body, "roundingRule"),
            effectiveFrom: requiredString(body, "effectiveFrom"),
            effectiveTo: optionalString(body, "effectiveTo"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/payroll/rate-tables",
      operationId: "g10.addRateRow",
      protected: true,
      permission: "g10.payrule.write",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          rateRow: context.services.payRules.addRateRow(context.actor, {
            tableType: readRateTableType(requiredString(body, "tableType")),
            state: optionalString(body, "state"),
            cityClass: optionalString(body, "cityClass"),
            regime: readOptionalRegime(optionalString(body, "regime")),
            financialYear: optionalString(body, "financialYear"),
            keyCode: optionalString(body, "keyCode"),
            slabMinCents: optionalNumber(body, "slabMinCents"),
            slabMaxCents: optionalNumber(body, "slabMaxCents"),
            ratePctBps: optionalNumber(body, "ratePctBps"),
            flatAmountCents: optionalNumber(body, "flatAmountCents"),
            effectiveFrom: requiredString(body, "effectiveFrom"),
            effectiveTo: optionalString(body, "effectiveTo"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/payroll/rate-tables/resolve",
      operationId: "g10.resolveRate",
      protected: true,
      permission: "g10.payroll.read",
      handler: (context) => {
        const query = context.request.query ?? {};
        return ok({
          rateRow: context.services.payRules.resolveRate(context.scope, {
            tableType: readRateTableType(requiredQuery(query, "tableType")),
            asOf: requiredQuery(query, "asOf"),
            state: query.state,
            cityClass: query.cityClass,
            regime: readOptionalRegime(query.regime),
            financialYear: query.financialYear,
            keyCode: query.keyCode,
            amountCents: query.amountCents !== undefined ? Number(query.amountCents) : undefined,
          }),
        });
      },
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function readAdjustmentSource(body: Record<string, unknown>): PayrollAdjustmentSource {
  const value = optionalString(body, "sourceModule") ?? "G10";
  if (value === "G03" || value === "G05" || value === "G06" || value === "G09" || value === "G10") {
    return value;
  }
  throw new Error(`Unsupported payroll adjustment source ${value}`);
}

function readAdjustmentCode(body: Record<string, unknown>): PayrollAdjustmentCode {
  const value = optionalString(body, "code") ?? "MANUAL_EARNING";
  if (value === "LOP" || value === "TRANSFER_ALLOWANCE" || value === "PROMOTION_ARREARS" || value === "PENALTY_RECOVERY" || value === "MANUAL_EARNING" || value === "MANUAL_DEDUCTION") {
    return value;
  }
  throw new Error(`Unsupported payroll adjustment code ${value}`);
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
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

function readComponentCategory(body: Record<string, unknown>): PayComponentCategory {
  const value = optionalString(body, "category") ?? "EARNING";
  if (value === "EARNING" || value === "DEDUCTION" || value === "PERQUISITE" || value === "EMPLOYER_CONTRIBUTION" || value === "ROUNDING_ADJUSTMENT" || value === "LEAVE_ENCASHMENT") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported pay component category ${value}`, { field: "category" });
}

function readCalcMethod(body: Record<string, unknown>): PayCalcMethod {
  const value = optionalString(body, "calcMethod") ?? "FORMULA";
  if (value === "FLAT" || value === "PERCENTAGE" || value === "SLAB" || value === "MATRIX" || value === "FORMULA") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported calc method ${value}`, { field: "calcMethod" });
}

function readRateTableType(value: string): RateTableType {
  if (value === "DA_RATE" || value === "HRA_CLASS" || value === "PT_SLAB" || value === "TAX_SLAB" || value === "NPS_RATE" || value === "GPF_RATE" || value === "GRATUITY_RATE" || value === "OTHER") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported rate table type ${value}`, { field: "tableType" });
}

function readOptionalRegime(value: string | undefined): TaxRegime | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "OLD" || value === "NEW") {
    return value;
  }
  throw new FoundationError("VALIDATION_FAILED", `Unsupported tax regime ${value}`, { field: "regime" });
}
