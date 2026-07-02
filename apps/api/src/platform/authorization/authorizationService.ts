import { ActorContext, FoundationError, TenantScope } from "../types";

export class AuthorizationService {
  check(actor: ActorContext, permission: string, scope: TenantScope): void {
    if (actor.tenantId !== scope.tenantId) {
      throw new FoundationError("FORBIDDEN", "Tenant scope denied");
    }
    if (scope.entityId && actor.entityId && actor.entityId !== scope.entityId) {
      throw new FoundationError("FORBIDDEN", "Entity scope denied");
    }
    if (!actor.permissions.includes(permission) && !actor.permissions.includes("*")) {
      throw new FoundationError("FORBIDDEN", "Permission denied", { details: { permission } });
    }
  }

  canSeeField(actor: ActorContext, field: string): boolean {
    return Boolean(actor.fieldGrants?.includes(field) || actor.fieldGrants?.includes("*"));
  }
}
