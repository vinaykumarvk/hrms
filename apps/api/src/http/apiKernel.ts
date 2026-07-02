import { FoundationServices } from "../platform/foundationServices";
import { FoundationError, TenantScope } from "../platform/types";
import { ApiRequest, ApiResponse, ApiParams, RouteDefinition, RouteSummary } from "./apiTypes";
import { CORRELATION_HEADER, normalizeHeaders, resolveCorrelationId } from "./correlation";
import { IDEMPOTENCY_HEADER, requireIdempotencyKey } from "./idempotency";
import { parsePagination } from "./pagination";
import { publicError, unauthenticatedError } from "./errors";

export const API_BASE_PATH = "/api/v1";
export const API_AUTHORIZATION_CHECK_MARKER = "Authorization.check";

interface MatchedRoute {
  route: RouteDefinition;
  params: ApiParams;
}

export class ApiKernel {
  private readonly routes: RouteDefinition[] = [];

  constructor(private readonly services: FoundationServices) {}

  register(route: RouteDefinition): void {
    if (!route.path.startsWith(API_BASE_PATH)) {
      throw new FoundationError("VALIDATION_FAILED", "Route path must use /api/v1", { field: "path" });
    }
    this.routes.push(route);
  }

  dispatch(request: ApiRequest): ApiResponse {
    const matched = this.match(request.method, request.path);
    const routeKey = `${request.method} ${request.path}`;
    const normalizedHeaders = normalizeHeaders(request.headers);
    const correlationId = resolveCorrelationId(normalizedHeaders, routeKey);
    try {
      if (!matched) {
        throw new FoundationError("NOT_FOUND", "Route not found");
      }
      if (matched.route.protected && !request.actor) {
        throw unauthenticatedError();
      }
      const actor = request.actor;
      if (!actor) {
        throw unauthenticatedError();
      }
      const scope: TenantScope = {
        tenantId: actor.tenantId,
        entityId: actor.entityId,
        actorUserId: actor.userId,
        correlationId,
      };
      this.services.authorization.check(actor, matched.route.permission, scope);
      const idempotencyKey = matched.route.unsafe && matched.route.requiresIdempotencyKey ? requireIdempotencyKey(normalizedHeaders) : undefined;
      const pagination = matched.route.list ? parsePagination(request.query) : undefined;
      const response = matched.route.handler({
        request,
        params: matched.params,
        services: this.services,
        actor: { ...actor, correlationId },
        scope,
        correlationId,
        idempotencyKey,
        pagination,
      });
      return this.withCorrelation(response, correlationId);
    } catch (error) {
      const failure = publicError(error);
      return this.withCorrelation({ status: failure.status, headers: {}, body: failure.body }, correlationId);
    }
  }

  listRoutes(): RouteSummary[] {
    return this.routes.map((route) => ({
      method: route.method,
      path: route.path,
      operationId: route.operationId,
      protected: route.protected,
      permission: route.permission,
      unsafe: Boolean(route.unsafe),
      requiresIdempotencyKey: Boolean(route.requiresIdempotencyKey),
      paginated: Boolean(route.list),
    }));
  }

  private withCorrelation(response: ApiResponse, correlationId: string): ApiResponse {
    return {
      ...response,
      headers: {
        ...response.headers,
        [CORRELATION_HEADER]: correlationId,
      },
    };
  }

  private match(method: string, path: string): MatchedRoute | null {
    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }
      const params = matchPath(route.path, path);
      if (params) {
        return { route, params };
      }
    }
    return null;
  }
}

export function createApiKernel(services: FoundationServices): ApiKernel {
  return new ApiKernel(services);
}

export function ok(body: unknown): ApiResponse {
  return { status: 200, headers: {}, body };
}

export function created(body: unknown): ApiResponse {
  return { status: 201, headers: { [IDEMPOTENCY_HEADER]: "required-for-unsafe-route" }, body };
}

export function accepted(body: unknown): ApiResponse {
  return { status: 202, headers: { [IDEMPOTENCY_HEADER]: "required-for-unsafe-route" }, body };
}

function matchPath(template: string, actual: string): ApiParams | null {
  const templateSegments = template.split("/").filter(Boolean);
  const actualSegments = actual.split("/").filter(Boolean);
  if (templateSegments.length !== actualSegments.length) {
    return null;
  }
  const params: ApiParams = {};
  for (let index = 0; index < templateSegments.length; index += 1) {
    const expected = templateSegments[index];
    const received = actualSegments[index];
    if (expected === undefined || received === undefined) {
      return null;
    }
    if (expected.startsWith("{") && expected.includes("}")) {
      const end = expected.indexOf("}");
      const key = expected.slice(1, end);
      const suffix = expected.slice(end + 1);
      if (suffix && !received.endsWith(suffix)) {
        return null;
      }
      const rawValue = suffix ? received.slice(0, -suffix.length) : received;
      if (!rawValue) {
        return null;
      }
      params[key] = decodeURIComponent(rawValue);
      continue;
    }
    if (expected !== received) {
      return null;
    }
  }
  return params;
}
