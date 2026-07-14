import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import { RouteDefinition } from "../http/apiTypes";
import { FoundationError } from "../platform/types";
import { G14RefreshRunType, G14ScopeType } from "../modules/g14/analyticsEngineRepository";

export const g14RouteEvidence = {
  dashboard: "/api/v1/analytics/dashboards/executive-readiness",
  refresh: "/api/v1/analytics/marts:refresh",
  drillThrough: "/api/v1/analytics/drill-through",
  health: "/api/v1/analytics/data-health",
  markers: ["G14_READ_ONLY", "MART_REFRESH_IDEMPOTENT", "P02_SCOPE_FILTER", "DRILL_THROUGH_AUTHZ", "ANALYTICS_READ_AUDITED", "PII_SUPPRESSION"],
};

export function registerG14Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/analytics/marts:refresh",
      operationId: "g14.refreshMart",
      protected: true,
      permission: "g14.analytics.refresh",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => accepted({ mart: await context.services.analytics.refreshMart(context.actor) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/dashboards/executive-readiness",
      operationId: "g14.getExecutiveDashboard",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) => ok({ dashboard: await context.services.analytics.getDashboard(context.actor) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/employees/{id}/dashboard",
      operationId: "g14.getMyDashboard",
      protected: true,
      permission: "g14.analytics.read.self",
      handler: async (context) => ok({ dashboard: await context.services.analytics.getMyDashboard(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/drill-through",
      operationId: "g14.drillThrough",
      protected: true,
      permission: "g14.analytics.drill_through",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => ok(await context.services.analytics.drillThrough(context.actor, context.request.query?.widgetCode ?? "EMPLOYEE_HEADCOUNT")),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/data-health",
      operationId: "g14.dataHealth",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) => ok(await context.services.analytics.dataHealth(context.actor)),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/summary",
      operationId: "g14.summary",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) => ok(await context.services.analytics.summary(context.scope)),
    },
    // ---- PH-10D analytics engine (BRD G14 FR-02/03/04/17/23) --------------------------------
    {
      method: "POST",
      path: "/api/v1/analytics/kpis",
      operationId: "g14.defineKpi",
      protected: true,
      permission: "g14.kpi.manage",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          kpi: await context.services.analyticsEngine.defineKpi(context.actor, {
            kpiCode: requiredString(body, "kpiCode"),
            name: requiredString(body, "name"),
            description: requiredString(body, "description"),
            domain: requiredString(body, "domain"),
            sourceMartCode: requiredString(body, "sourceMartCode"),
            expression: requiredString(body, "expression"),
            unit: requiredString(body, "unit"),
            grain: requiredString(body, "grain"),
            minCellSize: optionalNumber(body, "minCellSize"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/kpis",
      operationId: "g14.listKpis",
      protected: true,
      permission: "g14.analytics.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) =>
        ok(pageItems(await context.services.analyticsEngine.listKpis(context.scope, context.request.query?.kpiCode), context.pagination ?? { limit: 25 })),
    },
    {
      method: "POST",
      path: "/api/v1/analytics/kpis/{code}:activate",
      operationId: "g14.activateKpi",
      protected: true,
      permission: "g14.kpi.activate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const version = optionalNumber(body, "version");
        if (version === undefined) {
          throw new FoundationError("VALIDATION_FAILED", "version is required", { field: "version" });
        }
        return accepted({ kpi: await context.services.analyticsEngine.activateKpi(context.actor, { kpiCode: requiredParam(context.params, "code"), version }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/kpis/{code}:compute",
      operationId: "g14.computeKpiSnapshot",
      protected: true,
      permission: "g14.kpi.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          snapshot: await context.services.analyticsEngine.computeKpiSnapshot(context.actor, {
            kpiCode: requiredParam(context.params, "code"),
            periodKey: requiredString(body, "periodKey"),
            validTime: requiredString(body, "validTime"),
            version: optionalNumber(body, "version"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/kpis/{code}:restate",
      operationId: "g14.restateKpiSnapshot",
      protected: true,
      permission: "g14.kpi.compute",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          snapshot: await context.services.analyticsEngine.restateKpiSnapshot(context.actor, {
            kpiCode: requiredParam(context.params, "code"),
            periodKey: requiredString(body, "periodKey"),
            reason: requiredString(body, "reason"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/kpis/{code}/as-of",
      operationId: "g14.kpiValueAsOfKnowledge",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) => {
        const periodKey = context.request.query?.periodKey;
        const asOf = context.request.query?.asOf;
        if (!periodKey || !asOf) {
          throw new FoundationError("VALIDATION_FAILED", "periodKey and asOf are required", { field: !periodKey ? "periodKey" : "asOf" });
        }
        return ok({
          result: await context.services.analyticsEngine.kpiValueAsOfKnowledge(context.scope, {
            kpiCode: requiredParam(context.params, "code"),
            periodKey,
            asOfKnowledgeTime: asOf,
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/aggregate",
      operationId: "g14.queryAggregate",
      protected: true,
      permission: "g14.analytics.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => {
        const martCode = context.request.query?.martCode;
        const dimension = context.request.query?.dimension;
        if (!martCode || !dimension) {
          throw new FoundationError("VALIDATION_FAILED", "martCode and dimension are required", { field: !martCode ? "martCode" : "dimension" });
        }
        const result = await context.services.analyticsEngine.queryAggregate(context.actor, { martCode, dimension });
        return ok({ ...result, cells: pageItems(result.cells, context.pagination ?? { limit: 25 }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/datamarts:refresh",
      operationId: "g14.refreshDatamarts",
      protected: true,
      permission: "g14.analytics.refresh",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          await context.services.analyticsEngine.refreshDatamarts(context.actor, {
            runType: (optionalString(body, "runType") as G14RefreshRunType | undefined) ?? "MANUAL",
            runKey: context.idempotencyKey ?? requiredString(body, "runKey"),
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/datamarts/refresh-logs",
      operationId: "g14.listRefreshLogs",
      protected: true,
      permission: "g14.analytics.read",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: async (context) => ok(pageItems(await context.services.analyticsEngine.listRefreshLogs(context.scope), context.pagination ?? { limit: 25 })),
    },
    {
      method: "POST",
      path: "/api/v1/analytics/scope-policies",
      operationId: "g14.createScopePolicy",
      protected: true,
      permission: "g14.scope.manage",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          policy: await context.services.analyticsEngine.createScopePolicy(context.actor, {
            role: requiredString(body, "role"),
            scopeDimensions: optionalStringArray(body, "scopeDimensions") ?? [],
            martCode: optionalString(body, "martCode"),
            priority: optionalNumber(body, "priority"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/scope-policies/{id}:activate",
      operationId: "g14.activateScopePolicy",
      protected: true,
      permission: "g14.scope.activate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => accepted({ policy: await context.services.analyticsEngine.activateScopePolicy(context.actor, requiredParam(context.params, "id")) }),
    },
    // PH-29C — G14 natural-language query + probabilistic attrition (route exposure).
    {
      method: "POST",
      path: "/api/v1/analytics/nl-query",
      operationId: "g14.nlQuery",
      protected: true,
      permission: "g14.nlquery.ask",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return ok(await context.services.nlQuery.ask(context.actor, { question: requiredString(body, "question") }));
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/attrition-score",
      operationId: "g14.scoreAttrition",
      protected: true,
      permission: "g14.predict.attrition",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created(
          await context.services.predictiveAnalytics.scoreAttrition(context.actor, {
            employeeId: requiredString(body, "employeeId"),
            features: {
              tenureMonths: optionalNumber(body, "tenureMonths") ?? 0,
              recentTransfers: optionalNumber(body, "recentTransfers") ?? 0,
              leaveUtilisationPct: optionalNumber(body, "leaveUtilisationPct") ?? 0,
              promotionGapMonths: optionalNumber(body, "promotionGapMonths") ?? 0,
            },
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/fairness-report",
      operationId: "g14.fairnessReport",
      protected: true,
      permission: "g14.predict.fairness",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return ok(
          await context.services.predictiveAnalytics.fairnessReport(context.actor, {
            attribute: requiredString(body, "attribute"),
            observations: Array.isArray(body.observations) ? (body.observations as Array<{ group: string; riskScore: number }>) : [],
          })
        );
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/bi-kpis",
      operationId: "g14.listBiKpis",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) => ok({ items: await context.services.analytics.listBiKpis(context.scope), limit: 25, next_cursor: null }),
    },
    // PH-43A — G14 analytics-engine reads + KPI target-setting + predictive-score reads (route exposure
    // for already-tested backing: kpiSeries, listDatamarts, setKpiTarget, drillCohort, listScopePolicies,
    // predictiveAnalytics.listScores).
    {
      method: "GET",
      path: "/api/v1/analytics/kpis/{code}/series",
      operationId: "g14.kpiSeries",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) =>
        ok(
          await context.services.analyticsEngine.kpiSeries(context.scope, {
            kpiCode: requiredParam(context.params, "code"),
            periodKeys: (context.request.query?.periodKeys ?? "").split(",").map((k) => k.trim()).filter((k) => k.length > 0),
            acknowledgeCrossVersion: context.request.query?.acknowledgeCrossVersion === "true",
          })
        ),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/datamarts",
      operationId: "g14.listDatamarts",
      protected: true,
      permission: "g14.analytics.read",
      handler: async (context) => ok({ items: await context.services.analyticsEngine.listDatamarts(context.scope) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/datamarts/{martCode}/cohort",
      operationId: "g14.drillCohort",
      protected: true,
      permission: "g14.analytics.drill_through",
      handler: async (context) => {
        const dimension = context.request.query?.dimension;
        const key = context.request.query?.key;
        if (!dimension || !key) {
          throw new FoundationError("VALIDATION_FAILED", "dimension and key query parameters are required", { field: "dimension" });
        }
        return ok(await context.services.analyticsEngine.drillCohort(context.actor, { martCode: requiredParam(context.params, "martCode"), dimension, key }));
      },
    },
    {
      method: "POST",
      path: "/api/v1/analytics/kpis/{code}/targets",
      operationId: "g14.setKpiTarget",
      protected: true,
      permission: "g14.kpi.manage",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          target: await context.services.analyticsEngine.setKpiTarget(context.actor, {
            kpiCode: requiredParam(context.params, "code"),
            scopeType: optionalString(body, "scopeType") as G14ScopeType | undefined,
            scopeId: optionalString(body, "scopeId"),
            targetValue: requiredNumber(body, "targetValue"),
            effectiveFrom: requiredString(body, "effectiveFrom"),
            effectiveTo: optionalString(body, "effectiveTo"),
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/scope-policies",
      operationId: "g14.listScopePolicies",
      protected: true,
      permission: "g14.scope.manage",
      handler: async (context) => ok({ items: await context.services.analyticsEngine.listScopePolicies(context.scope) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/attrition-scores",
      operationId: "g14.listAttritionScores",
      protected: true,
      permission: "g14.predict.attrition",
      handler: async (context) => ok({ items: await context.services.predictiveAnalytics.listScores(context.scope) }),
    },
    // hr_admin `g14.report.build` capability — self-service report builder over existing mart cards.
    {
      method: "POST",
      path: "/api/v1/analytics/reports",
      operationId: "g14.defineReport",
      protected: true,
      permission: "g14.report.build",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        const format = optionalString(body, "format") ?? "JSON";
        if (format !== "JSON" && format !== "CSV") {
          throw new FoundationError("VALIDATION_FAILED", "format must be JSON or CSV", { field: "format" });
        }
        return created({
          report: await context.services.analytics.defineReport(context.actor, {
            name: requiredString(body, "name"),
            cardCodes: optionalStringArray(body, "cardCodes") ?? [],
            format,
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/reports",
      operationId: "g14.listReportDefinitions",
      protected: true,
      permission: "g14.report.build",
      handler: async (context) => ok({ items: await context.services.analytics.listReportDefinitions(context.actor) }),
    },
    {
      method: "POST",
      path: "/api/v1/analytics/reports/{id}:build",
      operationId: "g14.buildReport",
      protected: true,
      permission: "g14.report.build",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => created({ output: await context.services.analytics.buildReport(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/analytics/reports/{id}:schedule",
      operationId: "g14.scheduleReport",
      protected: true,
      permission: "g14.report.build",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: async (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          schedule: await context.services.analytics.scheduleReport(context.actor, {
            reportDefinitionId: requiredParam(context.params, "id"),
            cronExpression: requiredString(body, "cronExpression"),
            recipients: optionalStringArray(body, "recipients") ?? [],
          }),
        });
      },
    },
    {
      method: "GET",
      path: "/api/v1/analytics/report-schedules",
      operationId: "g14.listScheduledReports",
      protected: true,
      permission: "g14.report.build",
      handler: async (context) => ok({ items: await context.services.analytics.listScheduledReports(context.actor) }),
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

/** A required numeric body field accepting a JSON number or a numeric string. */
function requiredNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new Error(`${key} must be a number`);
  }
  return n;
}
