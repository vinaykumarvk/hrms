import { ActorContext, TenantScope } from "../platform/types";
import { FoundationServices } from "../platform/foundationServices";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiHeaders = Record<string, string | undefined>;
export type ApiQuery = Record<string, string | undefined>;
export type ApiParams = Record<string, string>;

export interface ApiRequest {
  method: HttpMethod;
  path: string;
  headers?: ApiHeaders;
  query?: ApiQuery;
  body?: unknown;
  actor?: ActorContext;
}

export interface ApiResponse<TBody = unknown> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

export interface PaginationRequest {
  limit: number;
  cursor?: string;
}

export interface PageResult<TItem> {
  items: TItem[];
  limit: number;
  next_cursor: string | null;
}

export interface ApiContext {
  request: ApiRequest;
  params: ApiParams;
  services: FoundationServices;
  actor: ActorContext;
  scope: TenantScope;
  correlationId: string;
  idempotencyKey?: string;
  pagination?: PaginationRequest;
}

export type RouteHandler = (context: ApiContext) => Promise<ApiResponse>;

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  operationId: string;
  protected: true;
  permission: string;
  unsafe?: boolean;
  requiresIdempotencyKey?: boolean;
  list?: {
    defaultLimit: 25;
    maxLimit: 100;
  };
  handler: RouteHandler;
}

export interface RouteSummary {
  method: HttpMethod;
  path: string;
  operationId: string;
  protected: true;
  permission: string;
  unsafe: boolean;
  requiresIdempotencyKey: boolean;
  paginated: boolean;
}
