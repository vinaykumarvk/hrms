import { FoundationError, TenantScope, nextId, requireTenantScope } from "../types";

export interface AuditEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  action: string;
  subjectRef: string;
  actorUserId?: string;
  correlationId?: string;
  metadata: Record<string, unknown>;
}

export interface SecurityAuditEntry {
  id: string;
  tenantId: string;
  entityId?: string;
  eventType: string;
  actorUserId?: string;
  result: "SUCCESS" | "DENIED" | "FAILED";
  metadata: Record<string, unknown>;
}

export class AuditService {
  private readonly auditEntries: AuditEntry[] = [];
  private readonly securityEntries: SecurityAuditEntry[] = [];

  recordMutation(scope: TenantScope, input: { action: string; subjectRef: string; metadata?: Record<string, unknown> }): AuditEntry {
    requireTenantScope(scope);
    const entry: AuditEntry = {
      id: nextId("audit", this.auditEntries.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      action: input.action,
      subjectRef: input.subjectRef,
      actorUserId: scope.actorUserId,
      correlationId: scope.correlationId,
      metadata: this.maskMetadata(input.metadata ?? {}),
    };
    this.auditEntries.push(entry);
    return { ...entry, metadata: { ...entry.metadata } };
  }

  recordSecurity(
    scope: TenantScope,
    input: { eventType: string; result: "SUCCESS" | "DENIED" | "FAILED"; metadata?: Record<string, unknown> }
  ): SecurityAuditEntry {
    requireTenantScope(scope);
    const entry: SecurityAuditEntry = {
      id: nextId("security-audit", this.securityEntries.length),
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      eventType: input.eventType,
      actorUserId: scope.actorUserId,
      result: input.result,
      metadata: this.maskMetadata(input.metadata ?? {}),
    };
    this.securityEntries.push(entry);
    return { ...entry, metadata: { ...entry.metadata } };
  }

  listAudit(scope: TenantScope): AuditEntry[] {
    requireTenantScope(scope);
    return this.auditEntries
      .filter((entry) => entry.tenantId === scope.tenantId && (!scope.entityId || entry.entityId === scope.entityId))
      .map((entry) => ({ ...entry, metadata: { ...entry.metadata } }));
  }

  listSecurity(scope: TenantScope): SecurityAuditEntry[] {
    requireTenantScope(scope);
    return this.securityEntries
      .filter((entry) => entry.tenantId === scope.tenantId && (!scope.entityId || entry.entityId === scope.entityId))
      .map((entry) => ({ ...entry, metadata: { ...entry.metadata } }));
  }

  private maskMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (["aadhaar", "pan", "password", "token"].includes(key.toLowerCase())) {
        masked[key] = "[REDACTED]";
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        masked[key] = this.maskMetadata(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  assertAuditExists(scope: TenantScope, subjectRef: string): void {
    if (!this.listAudit(scope).some((entry) => entry.subjectRef === subjectRef)) {
      throw new FoundationError("PRECONDITION_FAILED", "Required audit evidence is missing");
    }
  }
}
