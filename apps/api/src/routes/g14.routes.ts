import { ApiKernel, accepted, ok } from "../http/apiKernel";
import { RouteDefinition } from "../http/apiTypes";

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
  ];
  routes.forEach((route) => kernel.register(route));
}
