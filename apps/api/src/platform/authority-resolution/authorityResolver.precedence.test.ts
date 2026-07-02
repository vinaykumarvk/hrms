// PH-03A resolver PRECEDENCE unit tests. Authored as typed cases so the suite typechecks and compiles
// with the project build; executed under `npm test` via apps/api/test/authorityResolver.precedence.test.cjs,
// which requires the compiled module and wraps each case in node:test. Fixtures reuse the PH-02C seed
// (ph03AuthorityFacts / ph03Ids) where applicable and add NAMED_INDIVIDUAL facts for the named-individual family.
import {
  AuthorityResolutionService,
  AuthorityAssignment,
  NamedIndividual,
} from "./authorityResolutionService";
import { TenantScope } from "../types";
import { ph03AuthorityFacts, ph03Ids } from "../../seed/ph03Seed";

interface PrecedenceCase {
  name: string;
  run: () => void;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  try {
    fn();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!pattern.test(text)) {
      throw new Error(`${message}: thrown "${text}" did not match ${pattern.toString()}`);
    }
    return;
  }
  throw new Error(`${message}: expected a throw matching ${pattern.toString()}`);
}

const scope: TenantScope = { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity };

// PH-02C-aligned named-individual facts (e.g. a G09 named inquiry officer). userId space is deliberately
// distinct from the subject employee ids so the self-approval branch is exercised explicitly.
const namedOfficerActive = "u-named-inquiry-officer-01";
const namedOfficerRetired = "u-named-inquiry-officer-retired";

function namedIndividualFacts(): NamedIndividual[] {
  return [
    { userId: namedOfficerActive, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, status: "ACTIVE", effectiveFrom: "2026-01-01" },
    { userId: namedOfficerRetired, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, status: "INACTIVE", effectiveFrom: "2020-01-01", effectiveTo: "2025-12-31" },
  ];
}

function service(overrides: { authorities?: AuthorityAssignment[]; namedIndividuals?: NamedIndividual[] } = {}): AuthorityResolutionService {
  const facts = ph03AuthorityFacts();
  return new AuthorityResolutionService({
    ...facts,
    authorities: overrides.authorities ?? facts.authorities,
    namedIndividuals: overrides.namedIndividuals ?? namedIndividualFacts(),
  });
}

const asOf = "2026-07-15";

export const authorityResolverPrecedenceCases: PrecedenceCase[] = [
  {
    name: "REPORTING_CHAIN prefers direct reporting_manager over the position chain",
    run: () => {
      const resolution = service().resolve(scope, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: ph03Ids.employee }, asOf);
      assertEqual(resolution.resolverType, "REPORTING_CHAIN", "resolverType");
      assertEqual(resolution.selectedAssignees[0]?.employeeId, ph03Ids.manager, "direct manager selected");
      assertEqual(resolution.fallbackApplied, false, "no fallback when direct manager present");
      assertEqual(resolution.evidence.source, "employee_job_assignments.reporting_manager_id", "primary source");
    },
  },
  {
    name: "REPORTING_CHAIN falls back to positions.reports_to_position when the direct manager is absent",
    run: () => {
      const facts = ph03AuthorityFacts();
      const svc = new AuthorityResolutionService({
        ...facts,
        assignments: [
          ...facts.assignments,
          {
            id: "da000000-0000-0000-0000-000000000003",
            tenantId: ph03Ids.tenant,
            entityId: ph03Ids.entity,
            employeeId: "99999999-9999-9999-9999-999999999903",
            positionId: ph03Ids.employeePosition,
            orgUnitId: ph03Ids.orgAssessment,
            effectiveFrom: "2020-01-01",
          },
        ],
      });
      const resolution = svc.resolve(scope, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: "99999999-9999-9999-9999-999999999903" }, asOf);
      assertEqual(resolution.selectedAssignees[0]?.employeeId, ph03Ids.manager, "manager via reports_to_position");
      assertEqual(resolution.fallbackApplied, true, "fallback applied");
      assertEqual(resolution.evidence.source, "positions.reports_to_position_id", "fallback source");
    },
  },
  {
    name: "STATUTORY_AUTHORITY precedence: lowest priority number wins over higher",
    run: () => {
      const facts = ph03AuthorityFacts();
      const higherPriority: AuthorityAssignment = {
        id: "a1000000-0000-0000-0000-0000000000aa",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        authorityType: "TRANSFER_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        scopeType: "ORG_UNIT",
        scopeOrgUnitId: ph03Ids.orgRevenue,
        authorityEmployeeId: ph03Ids.employee,
        priority: 20,
        effectiveFrom: "2026-01-01",
        status: "ACTIVE",
      };
      const resolution = service({ authorities: [...facts.authorities, higherPriority] }).resolve(
        scope,
        { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue },
        asOf
      );
      // candidates records the base authority selection (before delegation is layered on top).
      assertEqual(resolution.candidates[0]?.employeeId, ph03Ids.manager, "priority-10 holder wins the base selection");
    },
  },
  {
    name: "DELEGATION precedence: active acting-charge overrides the base authority holder",
    run: () => {
      const resolution = service().resolve(
        scope,
        { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue, subjectEmployeeId: ph03Ids.manager },
        asOf
      );
      assertEqual(resolution.selectedAssignees[0]?.employeeId, ph03Ids.employee, "delegate selected");
      assertEqual(resolution.evidence.delegatedBy, "d1000000-0000-0000-0000-000000000001", "delegation evidence");
    },
  },
  {
    name: "DELEGATION SoD: delegate equals the subject -> self-approval blocked, base authority retained",
    run: () => {
      const resolution = service().resolve(
        scope,
        { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue, subjectEmployeeId: ph03Ids.employee },
        asOf
      );
      assertEqual(resolution.selectedAssignees[0]?.employeeId, ph03Ids.manager, "base holder retained");
      assertEqual(resolution.evidence.sodBlockedDelegation, true, "delegation SoD-blocked");
    },
  },
  {
    name: "STATUTORY_AUTHORITY ambiguity: two active same-priority rows -> BLOCKED, never guessed",
    run: () => {
      const facts = ph03AuthorityFacts();
      const ambiguous: AuthorityAssignment = {
        id: "a1000000-0000-0000-0000-0000000000bb",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        authorityType: "TRANSFER_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        scopeType: "ORG_UNIT",
        scopeOrgUnitId: ph03Ids.orgRevenue,
        authorityEmployeeId: ph03Ids.employee,
        priority: 10,
        effectiveFrom: "2026-01-01",
        status: "ACTIVE",
      };
      const svc = service({ authorities: [...facts.authorities, ambiguous] });
      assertThrows(
        () => svc.resolve(scope, { mechanism: "STATUTORY_AUTHORITY", authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue }, asOf),
        /Ambiguous statutory authority/,
        "ambiguous authority blocked"
      );
    },
  },
  {
    name: "ORG_UNIT_HEAD prefers org_units.head_employee_id over the authority-assignment fallback",
    run: () => {
      const resolution = service().resolve(scope, { mechanism: "ORG_UNIT_HEAD", orgUnitId: ph03Ids.orgRevenue }, asOf);
      assertEqual(resolution.selectedAssignees[0]?.employeeId, ph03Ids.manager, "head from org_units");
      assertEqual(resolution.fallbackApplied, false, "no fallback");
      assertEqual(resolution.evidence.source, "org_units.head_employee_id", "primary source");
    },
  },
  {
    name: "ORG_UNIT_HEAD falls back to g01_authority_assignments when the head is unset",
    run: () => {
      const resolution = service().resolve(scope, { mechanism: "ORG_UNIT_HEAD", orgUnitId: ph03Ids.orgAssessment }, asOf);
      assertEqual(resolution.selectedAssignees[0]?.employeeId, ph03Ids.manager, "head via authority assignment");
      assertEqual(resolution.fallbackApplied, true, "fallback applied");
      assertEqual(resolution.evidence.source, "g01_authority_assignments", "fallback source");
    },
  },
  {
    name: "NAMED_ROLE resolves to the configured role identity",
    run: () => {
      const resolution = service().resolve(scope, { mechanism: "NAMED_ROLE", roleCode: "APPELLATE_SIGNATORY" }, asOf);
      assertEqual(resolution.resolverType, "NAMED_ROLE", "resolverType");
      assertEqual(resolution.selectedAssignees[0]?.type, "ROLE", "assignee type");
      assertEqual(resolution.selectedAssignees[0]?.roleCode, "APPELLATE_SIGNATORY", "role code");
    },
  },
  {
    name: "NAMED_INDIVIDUAL resolves the configured active user with no fallback",
    run: () => {
      const resolution = service().resolve(scope, { mechanism: "NAMED_INDIVIDUAL", userId: namedOfficerActive }, asOf);
      assertEqual(resolution.resolverType, "NAMED_INDIVIDUAL", "resolverType");
      assertEqual(resolution.selectedAssignees[0]?.type, "USER", "assignee type");
      assertEqual(resolution.selectedAssignees[0]?.userId, namedOfficerActive, "configured user");
      assertEqual(resolution.fallbackApplied, false, "no fallback for named individual");
      assertEqual(resolution.evidence.configuredNamedUserId, namedOfficerActive, "evidence records configured id");
    },
  },
  {
    name: "NAMED_INDIVIDUAL self-approval: configured user equals subject -> BLOCKED",
    run: () => {
      assertThrows(
        () => service().resolve(scope, { mechanism: "NAMED_INDIVIDUAL", userId: namedOfficerActive, subjectUserId: namedOfficerActive }, asOf),
        /self-approval BLOCKED/i,
        "self-approval blocked"
      );
    },
  },
  {
    name: "NAMED_INDIVIDUAL inactive configured id -> BLOCKED, no inference",
    run: () => {
      assertThrows(
        () => service().resolve(scope, { mechanism: "NAMED_INDIVIDUAL", userId: namedOfficerRetired }, asOf),
        /absent or inactive; resolution BLOCKED/i,
        "inactive named individual blocked"
      );
    },
  },
  {
    name: "NAMED_INDIVIDUAL absent configured id -> BLOCKED (no fallback candidate invented)",
    run: () => {
      assertThrows(
        () => service().resolve(scope, { mechanism: "NAMED_INDIVIDUAL", userId: "u-not-configured" }, asOf),
        /absent or inactive; resolution BLOCKED/i,
        "absent named individual blocked"
      );
    },
  },
  {
    name: "WORK_QUEUE resolves to a queue identity rather than a single user",
    run: () => {
      const resolution = service().resolve(scope, { mechanism: "WORK_QUEUE", queueScopeId: "PUDA-REVENUE-Q", orgUnitId: ph03Ids.orgRevenue }, asOf);
      assertEqual(resolution.resolverType, "WORK_QUEUE", "resolverType");
      assertEqual(resolution.selectedAssignees[0]?.type, "QUEUE", "assignee type is queue");
      assert(typeof resolution.selectedAssignees[0]?.queueKey === "string", "queue key present");
    },
  },
  {
    name: "COMMITTEE resolves quorum members; a quorum shortfall is BLOCKED",
    run: () => {
      const met = service().resolve(scope, { mechanism: "COMMITTEE", committeeCode: "PH02-DPC-REVENUE" }, asOf);
      assertEqual(met.selectedAssignees.length, 2, "two members returned");
      assertEqual(met.evidence.quorumCount, 2, "quorum count");

      const facts = ph03AuthorityFacts();
      const shortCommittees = facts.committees.map((committee) => ({ ...committee, quorumRequired: 3 }));
      const svc = new AuthorityResolutionService({ ...facts, committees: shortCommittees });
      assertThrows(
        () => svc.resolve(scope, { mechanism: "COMMITTEE", committeeCode: "PH02-DPC-REVENUE" }, asOf),
        /quorum not met/i,
        "quorum shortfall blocked"
      );
    },
  },
  {
    name: "As-of snapshot determinism: a later-effective authority change does not alter a historical resolution",
    run: () => {
      const facts = ph03AuthorityFacts();
      const futureHigherPriority: AuthorityAssignment = {
        id: "a1000000-0000-0000-0000-0000000000cc",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        authorityType: "TRANSFER_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        scopeType: "ORG_UNIT",
        scopeOrgUnitId: ph03Ids.orgRevenue,
        authorityEmployeeId: ph03Ids.employee,
        priority: 5,
        effectiveFrom: "2026-08-01",
        status: "ACTIVE",
      };
      const svc = service({ authorities: [...facts.authorities, futureHigherPriority] });
      const rule = { mechanism: "STATUTORY_AUTHORITY" as const, authorityCode: "G05_TRANSFER_REVENUE", orgUnitId: ph03Ids.orgRevenue };

      // candidates records the base authority selection (delegation is layered separately), so it
      // isolates the as-of / priority gating we are asserting here.
      // Historical as-of: the future higher-priority row is not yet effective -> original holder stands.
      const historical = svc.resolve(scope, rule, "2026-07-15");
      assertEqual(historical.candidates[0]?.employeeId, ph03Ids.manager, "historical resolution stable");

      // Re-resolving the same as-of must be deterministic and unchanged.
      const replay = svc.resolve(scope, rule, "2026-07-15");
      assertEqual(replay.candidates[0]?.employeeId, ph03Ids.manager, "replay identical to historical");

      // Only a later as-of sees the newer higher-priority holder.
      const later = svc.resolve(scope, rule, "2026-08-15");
      assertEqual(later.candidates[0]?.employeeId, ph03Ids.employee, "later as-of sees the new holder");
    },
  },
];
