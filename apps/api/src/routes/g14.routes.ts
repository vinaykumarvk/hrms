import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalNumber, optionalString, optionalStringArray, readBodyRecord, requiredString } from "../http/body";
import { pageItems } from "../http/pagination";
import { RouteDefinition } from "../http/apiTypes";
import { FoundationError } from "../platform/types";
import { G14RefreshRunType } from "../modules/g14/analyticsEngineRepository";

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
      handler: (context) => accepted({ mart: context.services.analytics.refreshMart(context.actor) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/dashboards/executive-readiness",
      operationId: "g14.getExecutiveDashboard",
      protected: true,
      permission: "g14.analytics.read",
      handler: (context) => ok({ dashboard: context.services.analytics.getDashboard(context.actor) }),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/drill-through",
      operationId: "g14.drillThrough",
      protected: true,
      permission: "g14.analytics.drill_through",
      list: { defaultLimit: 25, maxLimit: 100 },
      handler: (context) => ok(context.services.analytics.drillThrough(context.actor, context.request.query?.widgetCode ?? "EMPLOYEE_HEADCOUNT")),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/data-health",
      operationId: "g14.dataHealth",
      protected: true,
      permission: "g14.analytics.read",
      handler: (context) => ok(context.services.analytics.dataHealth(context.actor)),
    },
    {
      method: "GET",
      path: "/api/v1/analytics/summary",
      operationId: "g14.summary",
      protected: true,
      permission: "g14.analytics.read",
      handler: (context) => ok(context.services.analytics.summary(context.scope)),
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
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          kpi: context.services.analyticsEngine.defineKpi(context.actor, {
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
      handler: (context) =>
        ok(pageItems(context.services.analyticsEngine.listKpis(context.scope, context.request.query?.kpiCode), context.pagination ?? { limit: 25 })),
    },
    {
      method: "POST",
      path: "/api/v1/analytics/kpis/{code}:activate",
      operationId: "g14.activateKpi",
      protected: true,
      permission: "g14.kpi.activate",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        const version = optionalNumber(body, "version");
        if (version === undefined) {
          throw new FoundationError("VALIDATION_FAILED", "version is required", { field: "version" });
        }
        return accepted({ kpi: context.services.analyticsEngine.activateKpi(context.actor, { kpiCode: requiredParam(context.params, "code"), version }) });
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
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          snapshot: context.services.analyticsEngine.computeKpiSnapshot(context.actor, {
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
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          snapshot: context.services.analyticsEngine.restateKpiSnapshot(context.actor, {
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
      handler: (context) => {
        const periodKey = context.request.query?.periodKey;
        const asOf = context.request.query?.asOf;
        if (!periodKey || !asOf) {
          throw new FoundationError("VALIDATION_FAILED", "periodKey and asOf are required", { field: !periodKey ? "periodKey" : "asOf" });
        }
        return ok({
          result: context.services.analyticsEngine.kpiValueAsOfKnowledge(context.scope, {
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
      handler: (context) => {
        const martCode = context.request.query?.martCode;
        const dimension = context.request.query?.dimension;
        if (!martCode || !dimension) {
          throw new FoundationError("VALIDATION_FAILED", "martCode and dimension are required", { field: !martCode ? "martCode" : "dimension" });
        }
        const result = context.services.analyticsEngine.queryAggregate(context.actor, { martCode, dimension });
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
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.analyticsEngine.refreshDatamarts(context.actor, {
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
      handler: (context) => ok(pageItems(context.services.analyticsEngine.listRefreshLogs(context.scope), context.pagination ?? { limit: 25 })),
    },
    {
      method: "POST",
      path: "/api/v1/analytics/scope-policies",
      operationId: "g14.createScopePolicy",
      protected: true,
      permission: "g14.scope.manage",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          policy: context.services.analyticsEngine.createScopePolicy(context.actor, {
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
      handler: (context) => accepted({ policy: context.services.analyticsEngine.activateScopePolicy(context.actor, requiredParam(context.params, "id")) }),
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
