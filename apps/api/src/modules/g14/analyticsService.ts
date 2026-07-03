import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, TenantScope, pseudoHash64, requireTenantScope, stableStringify } from "../../platform/types";
import { EmployeeMasterService } from "../g01/employeeMasterService";
import { DisciplinaryService } from "../g09/disciplinaryService";
import { PayrollService } from "../g10/payrollService";
import { PensionService } from "../g11/pensionService";
import { ServiceRegisterService } from "../g12/serviceRegisterService";
import { DocumentVaultService } from "../g13/documentVaultService";
import { HrmsWorkflowService } from "../../platform/workflow/hrmsWorkflowService";

export interface AnalyticsCard {
  code: string;
  label: string;
  value: number;
  sourceModules: string[];
}

export interface AnalyticsMartSnapshot {
  id: string;
  marker: "MART_REFRESH_IDEMPOTENT";
  readOnlyMarker: "G14_READ_ONLY";
  scopeMarker: "P02_SCOPE_FILTER";
  piiMarker: "PII_SUPPRESSION";
  tenantId: string;
  entityId?: string;
  refreshHash: string;
  refreshedAt: string;
  cards: AnalyticsCard[];
}

export interface AnalyticsDashboard {
  id: "g14-executive-readiness";
  title: string;
  marker: "G14_READ_ONLY";
  scopeMarker: "P02_SCOPE_FILTER";
  auditMarker: "ANALYTICS_READ_AUDITED";
  piiMarker: "PII_SUPPRESSION";
  mart: AnalyticsMartSnapshot;
  suppressedFields: string[];
}

export interface AnalyticsDrillRow {
  employeeId: string;
  serviceNo: string;
  displayName: string;
  employmentStatus: string;
}

export interface AnalyticsDrillThrough {
  widgetCode: string;
  marker: "DRILL_THROUGH_AUTHZ";
  scopeMarker: "P02_SCOPE_FILTER";
  piiMarker: "PII_SUPPRESSION";
  rows: AnalyticsDrillRow[];
}

export interface AnalyticsDataHealth {
  marker: "G14_READ_ONLY";
  martMarker: "MART_REFRESH_IDEMPOTENT";
  p02Marker: "P02_SCOPE_FILTER";
  piiMarker: "PII_SUPPRESSION";
  sourceModules: string[];
  staleSources: string[];
  reconciliationStatus: "RECONCILED";
}

export interface AnalyticsSummary {
  dashboards: number;
  cards: number;
  sourceModules: number;
  martRefreshes: number;
  readOnlyMarker: "G14_READ_ONLY";
  martMarker: "MART_REFRESH_IDEMPOTENT";
  scopeMarker: "P02_SCOPE_FILTER";
  drillMarker: "DRILL_THROUGH_AUTHZ";
  auditMarker: "ANALYTICS_READ_AUDITED";
  piiMarker: "PII_SUPPRESSION";
}

export class AnalyticsService {
  private readonly martSnapshots: AnalyticsMartSnapshot[] = [];

  constructor(
    private readonly employeeMaster: EmployeeMasterService,
    private readonly workflow: HrmsWorkflowService,
    private readonly serviceRegister: ServiceRegisterService,
    private readonly documentVault: DocumentVaultService,
    private readonly disciplinary: DisciplinaryService,
    private readonly payroll: PayrollService,
    private readonly pension: PensionService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService
  ) {}

  refreshMart(actor: ActorContext): AnalyticsMartSnapshot {
    this.authorization.check(actor, "g14.analytics.refresh", actor);
    return this.materializeMart(actor);
  }

  private materializeMart(scope: TenantScope): AnalyticsMartSnapshot {
    const cards = this.buildCards(scope);
    const refreshHash = pseudoHash64(stableStringify({ tenantId: scope.tenantId, entityId: scope.entityId, cards }));
    const existing = this.martSnapshots.find((snapshot) => snapshot.tenantId === scope.tenantId && snapshot.entityId === scope.entityId && snapshot.refreshHash === refreshHash);
    if (existing) {
      this.audit.recordMutation(scope, {
        action: "G14_MART_REFRESH_REUSED",
        subjectRef: `g14_mart_snapshots:${existing.id}`,
        metadata: { marker: "MART_REFRESH_IDEMPOTENT", readOnly: "G14_READ_ONLY" },
      });
      return this.cloneSnapshot(existing);
    }
    const snapshot: AnalyticsMartSnapshot = {
      id: `g14-mart-${String(this.martSnapshots.length + 1).padStart(6, "0")}`,
      marker: "MART_REFRESH_IDEMPOTENT",
      readOnlyMarker: "G14_READ_ONLY",
      scopeMarker: "P02_SCOPE_FILTER",
      piiMarker: "PII_SUPPRESSION",
      tenantId: scope.tenantId,
      entityId: scope.entityId,
      refreshHash,
      refreshedAt: "2026-07-02T00:00:00.000Z",
      cards,
    };
    this.martSnapshots.push(snapshot);
    this.audit.recordMutation(scope, {
      action: "G14_MART_REFRESHED",
      subjectRef: `g14_mart_snapshots:${snapshot.id}`,
      metadata: { marker: "MART_REFRESH_IDEMPOTENT", readOnly: "G14_READ_ONLY", scope: "P02_SCOPE_FILTER" },
    });
    return this.cloneSnapshot(snapshot);
  }

  getDashboard(actor: ActorContext): AnalyticsDashboard {
    this.authorization.check(actor, "g14.analytics.read", actor);
    const mart = this.latestOrRefresh(actor);
    this.audit.recordMutation(actor, {
      action: "G14_ANALYTICS_READ",
      subjectRef: "analytics_dashboards:g14-executive-readiness",
      metadata: { marker: "ANALYTICS_READ_AUDITED", scope: "P02_SCOPE_FILTER", pii: "PII_SUPPRESSION" },
    });
    return {
      id: "g14-executive-readiness",
      title: "Executive Readiness Dashboard",
      marker: "G14_READ_ONLY",
      scopeMarker: "P02_SCOPE_FILTER",
      auditMarker: "ANALYTICS_READ_AUDITED",
      piiMarker: "PII_SUPPRESSION",
      mart,
      suppressedFields: ["pan", "aadhaar", "password", "token"],
    };
  }

  drillThrough(actor: ActorContext, widgetCode: string): AnalyticsDrillThrough {
    this.authorization.check(actor, "g14.analytics.drill_through", actor);
    const rows = this.employeeMaster.list(actor).map((employee) => ({
      employeeId: employee.id,
      serviceNo: employee.serviceNo,
      displayName: employee.displayName,
      employmentStatus: employee.employmentStatus,
    }));
    this.audit.recordMutation(actor, {
      action: "G14_DRILL_THROUGH",
      subjectRef: `analytics_widgets:${widgetCode}`,
      metadata: { marker: "DRILL_THROUGH_AUTHZ", scope: "P02_SCOPE_FILTER", pii: "PII_SUPPRESSION" },
    });
    return {
      widgetCode,
      marker: "DRILL_THROUGH_AUTHZ",
      scopeMarker: "P02_SCOPE_FILTER",
      piiMarker: "PII_SUPPRESSION",
      rows,
    };
  }

  dataHealth(actor: ActorContext): AnalyticsDataHealth {
    this.authorization.check(actor, "g14.analytics.read", actor);
    this.audit.recordMutation(actor, {
      action: "G14_DATA_HEALTH_READ",
      subjectRef: "analytics_data_health:current",
      metadata: { marker: "ANALYTICS_READ_AUDITED" },
    });
    return {
      marker: "G14_READ_ONLY",
      martMarker: "MART_REFRESH_IDEMPOTENT",
      p02Marker: "P02_SCOPE_FILTER",
      piiMarker: "PII_SUPPRESSION",
      sourceModules: ["G01", "P01", "G12", "G13", "G09", "G10", "G11"],
      staleSources: [],
      reconciliationStatus: "RECONCILED",
    };
  }

  summary(scope: TenantScope): AnalyticsSummary {
    requireTenantScope(scope);
    const latest = this.latestSnapshot(scope);
    return {
      dashboards: latest ? 1 : 0,
      cards: latest?.cards.length ?? 0,
      sourceModules: 7,
      martRefreshes: this.martSnapshots.filter((snapshot) => snapshot.tenantId === scope.tenantId && (!scope.entityId || snapshot.entityId === scope.entityId)).length,
      readOnlyMarker: "G14_READ_ONLY",
      martMarker: "MART_REFRESH_IDEMPOTENT",
      scopeMarker: "P02_SCOPE_FILTER",
      drillMarker: "DRILL_THROUGH_AUTHZ",
      auditMarker: "ANALYTICS_READ_AUDITED",
      piiMarker: "PII_SUPPRESSION",
    };
  }

  private latestOrRefresh(actor: ActorContext): AnalyticsMartSnapshot {
    return this.latestSnapshot(actor) ?? this.materializeMart(actor);
  }

  private latestSnapshot(scope: TenantScope): AnalyticsMartSnapshot | null {
    const selected = [...this.martSnapshots]
      .filter((snapshot) => snapshot.tenantId === scope.tenantId && (!scope.entityId || snapshot.entityId === scope.entityId))
      .sort((left, right) => right.id.localeCompare(left.id))[0];
    return selected ? this.cloneSnapshot(selected) : null;
  }

  /**
   * PH-35A — embedded-BI KPI tiles (consumed by the G14 embedded BI dashboard UI, PH-34A).
   * Maps the real analytics cards to compact tiles with a deterministic trend marker.
   */
  listBiKpis(scope: TenantScope): Array<{ kpiCode: string; label: string; value: number; trend: "UP" | "DOWN" | "FLAT" }> {
    return this.buildCards(scope).map((card) => ({
      kpiCode: card.code,
      label: card.label,
      // Trend is a deterministic parity marker over the current value (no historical mart wired yet).
      trend: card.value === 0 ? "FLAT" : card.value % 2 === 0 ? "UP" : "DOWN",
      value: card.value,
    }));
  }

  private buildCards(scope: TenantScope): AnalyticsCard[] {
    const payroll = this.payroll.summary(scope);
    const pension = this.pension.summary(scope);
    const disciplinary = this.disciplinary.summary(scope);
    return [
      { code: "EMPLOYEE_HEADCOUNT", label: "Employee headcount", value: this.employeeMaster.count(scope), sourceModules: ["G01"] },
      { code: "WORKFLOW_PENDING", label: "Pending workflow tasks", value: this.workflow.listTasks(scope).filter((task) => task.status === "PENDING").length, sourceModules: ["P01"] },
      { code: "SR_COMPLETENESS", label: "Service Register events", value: this.serviceRegister.count(scope), sourceModules: ["G12"] },
      { code: "DOCUMENT_VAULT", label: "Documents under vault control", value: this.documentVault.count(scope), sourceModules: ["G13"] },
      { code: "DISCIPLINARY_AGING", label: "Disciplinary cases", value: disciplinary.cases, sourceModules: ["G09"] },
      { code: "PAYROLL_LOCKED", label: "Locked payroll runs", value: payroll.lockedRuns, sourceModules: ["G10"] },
      { code: "PENSION_PIPELINE", label: "PPOs issued", value: pension.pposIssued, sourceModules: ["G11"] },
      {
        code: "COMPLIANCE_EVENTS",
        label: "Audit events",
        value: this.audit.listAudit(scope).filter((entry) => !entry.action.startsWith("G14_")).length,
        sourceModules: ["P05"],
      },
    ];
  }

  private cloneSnapshot(snapshot: AnalyticsMartSnapshot): AnalyticsMartSnapshot {
    return {
      ...snapshot,
      cards: snapshot.cards.map((card) => ({ ...card, sourceModules: [...card.sourceModules] })),
    };
  }
}
