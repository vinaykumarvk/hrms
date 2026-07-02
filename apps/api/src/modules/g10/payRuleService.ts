import { AuditService } from "../../platform/audit/auditService";
import { AuthorizationService } from "../../platform/authorization/authorizationService";
import { ActorContext, FoundationError, TenantScope, nextId, requireTenantScope } from "../../platform/types";
import { DSL_GRAMMAR_VERSION, validateExpression } from "./payRuleDsl";
import {
  PayCalcMethod,
  PayComponent,
  PayComponentCategory,
  PayRule,
  PayRuleRepository,
  PayRuleStatus,
  RateTableRow,
  RateTableType,
  TaxRegime,
  windowCovers,
} from "./payRuleRepository";

/**
 * PH-09A — persisted, effective-dated G10 rule substrate consumed by resolution logic
 * (BRD G10 FR-01/FR-02): E05 pay_components (catalogue), E06 pay_rules (constrained DSL,
 * VAL-G10-DSL-TOKEN -> ERR-G10-RULE-EXPR), E07 rate_tables (DA/HRA/NPS/PT slabs,
 * state-dimensioned, VAL-G10-RATE-NONOVERLAP -> ERR-G10-RATE-OVERLAP on write).
 * As-of resolution picks exactly ONE effective row for a date and FAILS CLOSED:
 * no covering row -> ERR-G10-RATE-NOTFOUND; PT lookup without a state-of-posting
 * mapping -> ERR-G10-PT-STATE. Money is integer cents; rates are integer basis points.
 */

export interface RateResolutionQuery {
  tableType: RateTableType;
  asOf: string;
  /** State of posting — REQUIRED for PT_SLAB (BRD FR-02 AC5, ERR-G10-PT-STATE). */
  state?: string;
  cityClass?: string;
  regime?: TaxRegime;
  financialYear?: string;
  keyCode?: string;
  /** Slab probe amount (integer cents) for slab-dimensioned tables (PT/TAX). */
  amountCents?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PayRuleService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly repository: PayRuleRepository
  ) {}

  /** E05 pay_components: register a component in the catalogue (BRD FR-01). */
  createPayComponent(
    actor: ActorContext,
    input: {
      componentCode: string;
      name: string;
      category: PayComponentCategory;
      calcMethod: PayCalcMethod;
      isTaxable?: boolean;
      isStatutory?: boolean;
      displayOrder?: number;
      effectiveFrom?: string;
      effectiveTo?: string;
    }
  ): PayComponent {
    this.authorization.check(actor, "g10.payrule.write", actor);
    if (!/^[A-Z][A-Z0-9_]*$/.test(input.componentCode)) {
      throw new FoundationError("VALIDATION_FAILED", "componentCode must be UPPER_SNAKE", { field: "componentCode" });
    }
    if (this.repository.findComponentByCode(actor, input.componentCode)) {
      throw new FoundationError("CONFLICT", `Pay component ${input.componentCode} already exists`, { field: "componentCode" });
    }
    this.assertWindow(input.effectiveFrom, input.effectiveTo);
    const component: PayComponent = {
      id: nextId("pay-component", this.repository.countComponents()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      componentCode: input.componentCode,
      name: input.name,
      category: input.category,
      calcMethod: input.calcMethod,
      isTaxable: input.isTaxable ?? false,
      isStatutory: input.isStatutory ?? false,
      displayOrder: input.displayOrder ?? 0,
      dslGrammarVersion: DSL_GRAMMAR_VERSION,
      status: "ACTIVE",
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    };
    this.repository.saveComponent(component);
    this.audit.recordMutation(actor, {
      action: "G10_PAY_COMPONENT_CREATED",
      subjectRef: `g10_pay_components:${component.id}`,
      metadata: { componentCode: component.componentCode, category: component.category },
    });
    return { ...component };
  }

  /**
   * E06 pay_rules: version a rule against a component. FORMULA rules must pass the
   * whitelist-only DSL validation (VAL-G10-DSL-TOKEN); any disallowed or unknown token
   * rejects with ERR-G10-RULE-EXPR before anything is persisted (BRD FR-01 AC2).
   */
  createPayRule(
    actor: ActorContext,
    input: {
      componentCode: string;
      calcMethod: PayCalcMethod;
      formulaExpression?: string;
      rateTableId?: string;
      computationOrder?: number;
      roundingRule?: string;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): PayRule {
    this.authorization.check(actor, "g10.payrule.write", actor);
    const component = this.repository.findComponentByCode(actor, input.componentCode);
    if (!component) {
      throw new FoundationError("NOT_FOUND", `Pay component ${input.componentCode} not found`, { field: "componentCode" });
    }
    this.assertWindow(input.effectiveFrom, input.effectiveTo);
    if (input.calcMethod === "FORMULA") {
      if (!input.formulaExpression) {
        throw new FoundationError("VALIDATION_FAILED", "FORMULA rules require formulaExpression", { field: "formulaExpression" });
      }
      validateExpression(input.formulaExpression, this.knownReferences(actor));
    }
    const version = this.repository.listRulesForComponent(actor, component.id).length + 1;
    const rule: PayRule = {
      id: nextId("pay-rule", this.repository.countRules()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      payComponentId: component.id,
      version,
      calcMethod: input.calcMethod,
      formulaExpression: input.formulaExpression,
      rateTableId: input.rateTableId,
      computationOrder: input.computationOrder ?? 0,
      roundingRule: input.roundingRule,
      dslGrammarVersion: DSL_GRAMMAR_VERSION,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      status: "ACTIVE",
    };
    this.repository.saveRule(rule);
    this.audit.recordMutation(actor, {
      action: "G10_PAY_RULE_CREATED",
      subjectRef: `g10_pay_rules:${rule.id}`,
      metadata: { componentCode: component.componentCode, version: rule.version, calcMethod: rule.calcMethod },
    });
    return { ...rule };
  }

  /**
   * E07 rate_tables: effective-dated write with the VAL-G10-RATE-NONOVERLAP guard.
   * PT slabs are state-dimensioned — a PT_SLAB row without a state of posting rejects
   * with ERR-G10-PT-STATE (BRD FR-02 AC3/AC5); an overlapping window on the same key
   * rejects with ERR-G10-RATE-OVERLAP (409) from the repository, never a silent write.
   */
  addRateRow(
    actor: ActorContext,
    input: {
      tableType: RateTableType;
      state?: string;
      cityClass?: string;
      regime?: TaxRegime;
      financialYear?: string;
      keyCode?: string;
      slabMinCents?: number;
      slabMaxCents?: number;
      ratePctBps?: number;
      flatAmountCents?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    }
  ): RateTableRow {
    this.authorization.check(actor, "g10.payrule.write", actor);
    this.assertWindow(input.effectiveFrom, input.effectiveTo);
    if (input.tableType === "PT_SLAB" && !input.state) {
      throw new FoundationError("ERR-G10-PT-STATE", "PT slabs are state-dimensioned: state of posting is required", { field: "state" });
    }
    if (input.tableType === "TAX_SLAB" && (!input.regime || !input.financialYear)) {
      throw new FoundationError("VALIDATION_FAILED", "Tax slabs require regime and financialYear", { field: "regime" });
    }
    for (const [field, value] of Object.entries({
      slabMinCents: input.slabMinCents,
      slabMaxCents: input.slabMaxCents,
      ratePctBps: input.ratePctBps,
      flatAmountCents: input.flatAmountCents,
    })) {
      if (value !== undefined && !Number.isInteger(value)) {
        throw new FoundationError("VALIDATION_FAILED", `${field} must be an integer (cents/bps)`, { field });
      }
    }
    if (input.slabMinCents !== undefined && input.slabMaxCents !== undefined && input.slabMaxCents < input.slabMinCents) {
      throw new FoundationError("VALIDATION_FAILED", "slabMaxCents must be >= slabMinCents", { field: "slabMaxCents" });
    }
    const row: RateTableRow = {
      id: nextId("rate-row", this.repository.countRateRows()),
      tenantId: actor.tenantId,
      entityId: actor.entityId,
      tableType: input.tableType,
      state: input.state,
      cityClass: input.cityClass,
      regime: input.regime,
      financialYear: input.financialYear,
      keyCode: input.keyCode,
      slabMinCents: input.slabMinCents,
      slabMaxCents: input.slabMaxCents,
      ratePctBps: input.ratePctBps,
      flatAmountCents: input.flatAmountCents,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      isActive: true,
    };
    this.repository.insertRateRow(row);
    this.audit.recordMutation(actor, {
      action: "G10_RATE_ROW_ADDED",
      subjectRef: `g10_rate_tables:${row.id}`,
      metadata: { tableType: row.tableType, state: row.state, effectiveFrom: row.effectiveFrom },
    });
    return { ...row };
  }

  /**
   * As-of resolution against rate_tables: picks EXACTLY ONE effective row for the date.
   * Fails closed (BRD FR-02/FR-06): no covering row -> ERR-G10-RATE-NOTFOUND (422),
   * PT lookup without a state mapping -> ERR-G10-PT-STATE (422), and more than one
   * covering row -> ERR-G10-RATE-OVERLAP (never silently "latest").
   */
  resolveRate(scope: TenantScope, query: RateResolutionQuery): RateTableRow {
    requireTenantScope(scope);
    if (!ISO_DATE.test(query.asOf)) {
      throw new FoundationError("VALIDATION_FAILED", "asOf must be an ISO date (YYYY-MM-DD)", { field: "asOf" });
    }
    if (query.tableType === "PT_SLAB" && !query.state) {
      throw new FoundationError("ERR-G10-PT-STATE", "PT resolution requires the employee's state of posting", { field: "state" });
    }
    const rows = this.repository.listRateRows(scope, query.tableType).filter((row) => row.isActive);
    const dimensioned = rows.filter(
      (row) =>
        (query.state === undefined || row.state === query.state) &&
        (query.cityClass === undefined || row.cityClass === query.cityClass) &&
        (query.regime === undefined || row.regime === query.regime) &&
        (query.financialYear === undefined || row.financialYear === query.financialYear) &&
        (query.keyCode === undefined || row.keyCode === query.keyCode)
    );
    if (query.tableType === "PT_SLAB" && dimensioned.length === 0) {
      throw new FoundationError("ERR-G10-PT-STATE", `No PT slab mapping for state of posting ${query.state}`, {
        field: "state",
        details: { state: query.state },
      });
    }
    const covering = dimensioned.filter(
      (row) =>
        windowCovers(row.effectiveFrom, row.effectiveTo, query.asOf) &&
        (query.amountCents === undefined ||
          ((row.slabMinCents === undefined || query.amountCents >= row.slabMinCents) &&
            (row.slabMaxCents === undefined || query.amountCents <= row.slabMaxCents)))
    );
    const resolved = covering[0];
    if (!resolved) {
      throw new FoundationError("ERR-G10-RATE-NOTFOUND", `No effective ${query.tableType} rate row as of ${query.asOf}`, {
        field: "asOf",
        details: { tableType: query.tableType, asOf: query.asOf },
      });
    }
    if (covering.length > 1) {
      // Fail closed: ambiguous resolution means the non-overlap invariant is broken.
      throw new FoundationError("ERR-G10-RATE-OVERLAP", `Multiple ${query.tableType} rate rows cover ${query.asOf}`, {
        field: "asOf",
        details: { validation: "VAL-G10-RATE-NONOVERLAP", matches: covering.map((row) => row.id) },
      });
    }
    return { ...resolved };
  }

  listComponents(scope: TenantScope): PayComponent[] {
    requireTenantScope(scope);
    return this.repository.listComponents(scope).map((component) => ({ ...component }));
  }

  /** Identifiers the DSL may reference: registered component codes + rate-table type refs. */
  private knownReferences(scope: TenantScope): ReadonlySet<string> {
    const references = new Set<string>(this.repository.listComponents(scope).map((component) => component.componentCode));
    for (const tableType of ["DA_RATE", "HRA_CLASS", "PT_SLAB", "TAX_SLAB", "NPS_RATE", "GPF_RATE", "GRATUITY_RATE", "OTHER"]) {
      references.add(tableType);
    }
    return references;
  }

  private assertWindow(effectiveFrom: string | undefined, effectiveTo: string | undefined): void {
    if (effectiveFrom !== undefined && !ISO_DATE.test(effectiveFrom)) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveFrom must be an ISO date (YYYY-MM-DD)", { field: "effectiveFrom" });
    }
    if (effectiveTo !== undefined && !ISO_DATE.test(effectiveTo)) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveTo must be an ISO date (YYYY-MM-DD)", { field: "effectiveTo" });
    }
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new FoundationError("VALIDATION_FAILED", "effectiveTo must be on or after effectiveFrom", { field: "effectiveTo" });
    }
  }
}
