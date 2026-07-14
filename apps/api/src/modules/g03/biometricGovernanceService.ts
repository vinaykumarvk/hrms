import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";

/**
 * Post-hr_admin-goal thin build (`g03.biometric.govern` capability): govern biometric/geo consent,
 * lawful basis, and retention/purge. Nothing existed for this in G03 before this session — this is
 * a net-new, minimal governance layer, not a full biometric-capture pipeline (no raw biometric
 * templates exist anywhere in this codebase to protect; this governs the *consent/policy* record
 * layer that would sit in front of one).
 */

export type BiometricConsentType = "BIOMETRIC" | "GEO_LOCATION";
export type BiometricDataType = "BIOMETRIC" | "GEO_LOCATION" | "ATTENDANCE_PUNCH";

export interface BiometricConsentRecord {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  consentType: BiometricConsentType;
  granted: boolean;
  lawfulBasis: string;
  recordedAt: string;
  recordedByUserId: string;
  withdrawnAt?: string;
}

export interface BiometricRetentionPolicy {
  dataType: BiometricDataType;
  retentionDays: number;
  configuredByUserId: string;
  configuredAt: string;
}

export interface BiometricPurgeLog {
  id: string;
  tenantId: string;
  entityId?: string;
  dataType: BiometricDataType;
  asOfDate: string;
  eligibleConsentIds: string[];
  purgedByUserId: string;
  purgedAt: string;
}

export class BiometricGovernanceService {
  private counter = 0;
  private readonly consents: BiometricConsentRecord[] = [];
  private readonly retentionPolicies: BiometricRetentionPolicy[] = [];
  private readonly purgeLogs: BiometricPurgeLog[] = [];

  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService
  ) {}

  private next(prefix: string): string {
    this.counter += 1;
    return nextId(prefix, this.counter);
  }

  private assertDpoGovernance(actor: ActorContext): void {
    this.authorization.check(actor, "g03.biometric.govern", actor);
    if (!actor.permissions?.includes("*") && !actor.roles?.some((role) => role === "dpo_governance" || role === "system")) {
      throw new FoundationError("FORBIDDEN", "Biometric/geo governance requires the dpo_governance capability", { field: "actor" });
    }
  }

  private inScope(row: { tenantId: string; entityId?: string }, scope: TenantScope): boolean {
    return row.tenantId === scope.tenantId && (!scope.entityId || row.entityId === scope.entityId);
  }

  /** Record an employee's consent decision + the lawful basis cited for the processing. */
  recordConsent(actor: ActorContext, input: { employeeId: string; consentType: BiometricConsentType; granted: boolean; lawfulBasis: string }): BiometricConsentRecord {
    this.assertDpoGovernance(actor);
    if (!input.lawfulBasis?.trim()) {
      throw new FoundationError("VALIDATION_FAILED", "A lawful basis citation is required to record biometric/geo consent", { field: "lawfulBasis" });
    }
    const record: BiometricConsentRecord = {
      id: this.next("biometric-consent"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      employeeId: input.employeeId,
      consentType: input.consentType,
      granted: input.granted,
      lawfulBasis: input.lawfulBasis,
      recordedAt: new Date().toISOString(),
      recordedByUserId: actor.userId,
    };
    this.consents.push(record);
    this.audit.recordMutation(actor, {
      action: "G03_BIOMETRIC_CONSENT_RECORDED",
      subjectRef: `biometric_consents:${record.id}`,
      metadata: { employeeId: record.employeeId, consentType: record.consentType, granted: record.granted },
    });
    return { ...record };
  }

  /** Withdraw a previously granted consent (the employee's right to withdraw). */
  withdrawConsent(actor: ActorContext, consentId: string): BiometricConsentRecord {
    this.assertDpoGovernance(actor);
    const record = this.consents.find((c) => c.id === consentId && this.inScope(c, actor));
    if (!record) {
      throw new FoundationError("NOT_FOUND", "Biometric/geo consent record not found");
    }
    if (record.withdrawnAt) {
      return { ...record };
    }
    record.withdrawnAt = new Date().toISOString();
    this.audit.recordMutation(actor, { action: "G03_BIOMETRIC_CONSENT_WITHDRAWN", subjectRef: `biometric_consents:${record.id}` });
    return { ...record };
  }

  listConsents(actor: ActorContext, employeeId: string): BiometricConsentRecord[] {
    this.authorization.check(actor, "g03.biometric.govern", actor);
    requireTenantScope(actor);
    return this.consents.filter((c) => this.inScope(c, actor) && c.employeeId === employeeId).map((c) => ({ ...c }));
  }

  /** Configure a retention policy (days) for a biometric/geo/attendance data type. */
  configureRetentionPolicy(actor: ActorContext, input: { dataType: BiometricDataType; retentionDays: number }): BiometricRetentionPolicy {
    this.assertDpoGovernance(actor);
    if (!Number.isInteger(input.retentionDays) || input.retentionDays <= 0) {
      throw new FoundationError("VALIDATION_FAILED", "retentionDays must be a positive integer", { field: "retentionDays" });
    }
    const policy: BiometricRetentionPolicy = {
      dataType: input.dataType,
      retentionDays: input.retentionDays,
      configuredByUserId: actor.userId,
      configuredAt: new Date().toISOString(),
    };
    const existingIndex = this.retentionPolicies.findIndex((p) => p.dataType === input.dataType);
    if (existingIndex >= 0) {
      this.retentionPolicies[existingIndex] = policy;
    } else {
      this.retentionPolicies.push(policy);
    }
    this.audit.recordMutation(actor, {
      action: "G03_BIOMETRIC_RETENTION_CONFIGURED",
      subjectRef: `biometric_retention_policies:${input.dataType}`,
      metadata: { retentionDays: input.retentionDays },
    });
    return { ...policy };
  }

  getRetentionPolicy(actor: ActorContext, dataType: BiometricDataType): BiometricRetentionPolicy | undefined {
    this.authorization.check(actor, "g03.biometric.govern", actor);
    const policy = this.retentionPolicies.find((p) => p.dataType === dataType);
    return policy ? { ...policy } : undefined;
  }

  /**
   * Purge consent records past their configured retention window as of a given date. Since no raw
   * biometric/geo capture pipeline exists in this codebase yet, this governs the consent-record
   * layer itself (a real, present dataset) rather than a not-yet-built raw-capture store.
   */
  purgeExpiredData(actor: ActorContext, input: { dataType: BiometricDataType; asOfDate: string }): BiometricPurgeLog {
    this.assertDpoGovernance(actor);
    const policy = this.retentionPolicies.find((p) => p.dataType === input.dataType);
    if (!policy) {
      throw new FoundationError("PRECONDITION_FAILED", "No retention policy is configured for this data type", { details: { dataType: input.dataType } });
    }
    const consentType: BiometricConsentType | null = input.dataType === "BIOMETRIC" || input.dataType === "GEO_LOCATION" ? input.dataType : null;
    const asOf = new Date(`${input.asOfDate}T00:00:00Z`).getTime();
    const eligible = consentType
      ? this.consents.filter((c) => {
          if (!this.inScope(c, actor) || c.consentType !== consentType || c.withdrawnAt) {
            return false;
          }
          const cutoff = new Date(c.recordedAt).getTime() + policy.retentionDays * 24 * 60 * 60 * 1000;
          return asOf >= cutoff;
        })
      : [];
    for (const record of eligible) {
      record.withdrawnAt = new Date(input.asOfDate + "T00:00:00.000Z").toISOString();
    }
    const log: BiometricPurgeLog = {
      id: this.next("biometric-purge"),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      dataType: input.dataType,
      asOfDate: input.asOfDate,
      eligibleConsentIds: eligible.map((c) => c.id),
      purgedByUserId: actor.userId,
      purgedAt: new Date().toISOString(),
    };
    this.purgeLogs.push(log);
    this.audit.recordMutation(actor, {
      action: "G03_BIOMETRIC_DATA_PURGED",
      subjectRef: `biometric_purge_logs:${log.id}`,
      metadata: { dataType: input.dataType, purgedCount: eligible.length },
    });
    return { ...log };
  }

  listPurgeLogs(actor: ActorContext, dataType?: BiometricDataType): BiometricPurgeLog[] {
    this.authorization.check(actor, "g03.biometric.govern", actor);
    requireTenantScope(actor);
    return this.purgeLogs.filter((log) => this.inScope(log, actor) && (!dataType || log.dataType === dataType)).map((log) => ({ ...log }));
  }
}
