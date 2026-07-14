import { FoundationError, TenantScope, inScope, requireTenantScope } from "../types";

export type ResolverMechanism =
  | "REPORTING_CHAIN"
  | "POSITION_AUTHORITY"
  | "STATUTORY_AUTHORITY"
  | "ORG_UNIT_HEAD"
  | "NAMED_ROLE"
  | "NAMED_INDIVIDUAL"
  | "NAMED_USER"
  | "WORK_QUEUE"
  | "COMMITTEE"
  | "DELEGATION_OR_ACTING_CHARGE";

export interface OrgUnit {
  id: string;
  tenantId: string;
  entityId?: string;
  name: string;
  parentOrgUnitId?: string;
  headEmployeeId?: string;
}

export interface Position {
  id: string;
  tenantId: string;
  entityId?: string;
  positionCode: string;
  reportsToPositionId?: string;
}

export interface EmployeeAssignment {
  id: string;
  tenantId: string;
  entityId?: string;
  employeeId: string;
  positionId: string;
  orgUnitId: string;
  reportingManagerId?: string;
  /** Secondary/matrix reporting line (BRD RBAC §2.3 dotted_line_manager) — distinct from the
   *  primary reportingManagerId. A dotted-line manager has read-only visibility of the reportee,
   *  never approval authority. */
  dottedLineManagerId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface AuthorityAssignment {
  id: string;
  tenantId: string;
  entityId?: string;
  authorityType: string;
  authorityCode: string;
  scopeType: "ORG_UNIT" | "CADRE" | "ENTITY" | "GLOBAL";
  scopeOrgUnitId?: string;
  scopeCadreId?: string;
  authorityEmployeeId?: string;
  authorityPositionId?: string;
  priority: number;
  effectiveFrom: string;
  effectiveTo?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}

export interface AuthorityDelegation {
  id: string;
  tenantId: string;
  entityId?: string;
  authorityAssignmentId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  kind: "DELEGATION" | "ACTING_CHARGE";
  effectiveFrom: string;
  effectiveTo?: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface NamedIndividual {
  userId: string;
  tenantId: string;
  entityId?: string;
  status: "ACTIVE" | "INACTIVE";
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CommitteeMember {
  memberEmployeeId?: string;
  externalMemberName?: string;
  role: string;
  requiredForQuorum: boolean;
  recusedReason?: string;
}

export interface Committee {
  id: string;
  tenantId: string;
  entityId?: string;
  committeeCode: string;
  quorumRequired: number;
  status: "ACTIVE" | "INACTIVE" | "DISSOLVED";
  members: CommitteeMember[];
}

export interface ResolverRule {
  mechanism: ResolverMechanism;
  subjectEmployeeId?: string;
  authorityCode?: string;
  orgUnitId?: string;
  roleCode?: string;
  userId?: string;
  subjectUserId?: string;
  queueScopeId?: string;
  levelId?: string;
  committeeCode?: string;
}

export interface ResolutionAssignee {
  type: "EMPLOYEE" | "USER" | "ROLE" | "QUEUE" | "EXTERNAL";
  employeeId?: string;
  userId?: string;
  roleCode?: string;
  queueKey?: string;
  label?: string;
}

export interface AuthorityResolution {
  resolverType: ResolverMechanism;
  selectedAssignees: ResolutionAssignee[];
  candidates: ResolutionAssignee[];
  fallbackApplied: boolean;
  evidence: Record<string, unknown>;
}

export class AuthorityResolutionService {
  private readonly orgUnits: OrgUnit[];
  private readonly positions: Position[];
  private readonly assignments: EmployeeAssignment[];
  private readonly authorities: AuthorityAssignment[];
  private readonly delegations: AuthorityDelegation[];
  private readonly committees: Committee[];
  private readonly namedIndividuals: NamedIndividual[];

  constructor(input: {
    orgUnits: OrgUnit[];
    positions: Position[];
    assignments: EmployeeAssignment[];
    authorities: AuthorityAssignment[];
    delegations: AuthorityDelegation[];
    committees: Committee[];
    namedIndividuals?: NamedIndividual[];
  }) {
    this.orgUnits = [...input.orgUnits];
    this.positions = [...input.positions];
    this.assignments = [...input.assignments];
    this.authorities = [...input.authorities];
    this.delegations = [...input.delegations];
    this.committees = [...input.committees];
    this.namedIndividuals = [...(input.namedIndividuals ?? [])];
  }

  registerAuthorityAssignment(assignment: AuthorityAssignment): void {
    this.authorities.push(assignment);
  }

  resolve(scope: TenantScope, rule: ResolverRule, asOf: string): AuthorityResolution {
    requireTenantScope(scope);
    switch (rule.mechanism) {
      case "REPORTING_CHAIN":
        return this.resolveReportingChain(scope, rule);
      case "POSITION_AUTHORITY":
      case "STATUTORY_AUTHORITY":
        return this.resolveAuthority(scope, rule, asOf);
      case "ORG_UNIT_HEAD":
        return this.resolveOrgUnitHead(scope, rule);
      case "NAMED_ROLE":
        return this.resolveNamedRole(rule);
      case "NAMED_INDIVIDUAL":
        return this.resolveNamedIndividual(scope, rule, asOf);
      case "NAMED_USER":
        return this.resolveNamedUser(rule);
      case "WORK_QUEUE":
        return this.resolveWorkQueue(rule);
      case "COMMITTEE":
        return this.resolveCommittee(scope, rule);
      case "DELEGATION_OR_ACTING_CHARGE":
        return this.resolveDelegationOnly(scope, rule, asOf);
      default:
        throw new FoundationError("VALIDATION_FAILED", "Unsupported resolver mechanism");
    }
  }

  /**
   * BRD RBAC §2.3 reporting SUBTREE: every employee whose reporting chain (primary
   * reportingManagerId OR dottedLineManagerId) reaches the given manager, transitively. Backs
   * manager/skip-level team visibility. Returns distinct reportee employee ids (excluding the
   * manager themselves); order is not guaranteed.
   */
  resolveReportingSubtree(scope: TenantScope, managerEmployeeId: string): string[] {
    requireTenantScope(scope);
    const scoped = this.assignments.filter((assignment) => inScope(assignment, scope));
    const reportees = new Set<string>();
    const seen = new Set<string>([managerEmployeeId]);
    let frontier = [managerEmployeeId];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const managerId of frontier) {
        for (const assignment of scoped) {
          const reportsToManager =
            (assignment.reportingManagerId !== undefined && assignment.reportingManagerId === managerId) ||
            (assignment.dottedLineManagerId !== undefined && assignment.dottedLineManagerId === managerId);
          if (reportsToManager && assignment.employeeId !== managerEmployeeId && !seen.has(assignment.employeeId)) {
            seen.add(assignment.employeeId);
            reportees.add(assignment.employeeId);
            next.push(assignment.employeeId);
          }
        }
      }
      frontier = next;
    }
    return [...reportees];
  }

  /**
   * BRD RBAC §2.3 dotted_line_manager: resolves the secondary/matrix manager for an employee, if
   * one is assigned. Dotted-line managers have read-only visibility of the reportee — never
   * approval authority (the primary REPORTING_CHAIN resolver remains the authority path).
   */
  resolveDottedLineManager(scope: TenantScope, rule: ResolverRule): AuthorityResolution {
    requireTenantScope(scope);
    const subjectEmployeeId = requireValue(rule.subjectEmployeeId, "subjectEmployeeId");
    const assignment = this.assignments.find((item) => inScope(item, scope) && item.employeeId === subjectEmployeeId);
    if (!assignment) {
      throw new FoundationError("NOT_FOUND", "Employee assignment not found");
    }
    if (!assignment.dottedLineManagerId) {
      throw new FoundationError("PRECONDITION_FAILED", "No dotted-line manager is assigned for this employee");
    }
    const assignee = { type: "EMPLOYEE" as const, employeeId: assignment.dottedLineManagerId };
    return {
      resolverType: "REPORTING_CHAIN",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: false,
      evidence: { source: "employee_job_assignments.dotted_line_manager_id", assignmentId: assignment.id },
    };
  }

  /**
   * BRD RBAC §2.3 skip-level managers: the chain of managers two-or-more levels above the employee
   * (excludes the direct reporting manager). Walks the primary reportingManagerId chain upward.
   */
  resolveSkipLevelManagers(scope: TenantScope, employeeId: string): string[] {
    requireTenantScope(scope);
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = employeeId;
    while (current !== undefined) {
      const assignment = this.assignments.find((item) => inScope(item, scope) && item.employeeId === current);
      if (!assignment) {
        break;
      }
      const manager = assignment.reportingManagerId;
      if (!manager || seen.has(manager)) {
        break;
      }
      seen.add(manager);
      chain.push(manager);
      current = manager;
    }
    // Skip index 0 (the direct reporting manager); the rest are skip-level.
    return chain.slice(1);
  }

  private resolveReportingChain(scope: TenantScope, rule: ResolverRule): AuthorityResolution {
    const subjectEmployeeId = requireValue(rule.subjectEmployeeId, "subjectEmployeeId");
    const assignment = this.assignments.find((item) => inScope(item, scope) && item.employeeId === subjectEmployeeId);
    if (!assignment) {
      throw new FoundationError("NOT_FOUND", "Employee assignment not found");
    }
    if (assignment.reportingManagerId) {
      const assignee = { type: "EMPLOYEE" as const, employeeId: assignment.reportingManagerId };
      return {
        resolverType: "REPORTING_CHAIN",
        selectedAssignees: [assignee],
        candidates: [assignee],
        fallbackApplied: false,
        evidence: { source: "employee_job_assignments.reporting_manager_id", assignmentId: assignment.id },
      };
    }
    const position = this.positions.find((item) => inScope(item, scope) && item.id === assignment.positionId);
    const managerPosition = this.positions.find((item) => inScope(item, scope) && item.id === position?.reportsToPositionId);
    const managerAssignment = this.assignments.find((item) => inScope(item, scope) && item.positionId === managerPosition?.id);
    if (!managerAssignment) {
      throw new FoundationError("PRECONDITION_FAILED", "Reporting-chain resolver could not find a manager");
    }
    const assignee = { type: "EMPLOYEE" as const, employeeId: managerAssignment.employeeId };
    return {
      resolverType: "REPORTING_CHAIN",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: true,
      evidence: { source: "positions.reports_to_position_id", positionId: position?.id, managerPositionId: managerPosition?.id },
    };
  }

  private resolveAuthority(scope: TenantScope, rule: ResolverRule, asOf: string): AuthorityResolution {
    const authorityCode = requireValue(rule.authorityCode, "authorityCode");
    const matches = this.activeAuthorities(scope, asOf).filter((item) => {
      if (item.authorityCode !== authorityCode) {
        return false;
      }
      if (rule.orgUnitId && item.scopeType === "ORG_UNIT") {
        return item.scopeOrgUnitId === rule.orgUnitId;
      }
      return true;
    });
    if (matches.length === 0) {
      throw new FoundationError("NOT_FOUND", "No active statutory authority found", { details: { authorityCode } });
    }
    const bestPriority = Math.min(...matches.map((item) => item.priority));
    const best = matches.filter((item) => item.priority === bestPriority);
    if (best.length > 1) {
      throw new FoundationError("CONFLICT", "Ambiguous statutory authority", { details: { authorityCode } });
    }
    const selected = best[0];
    if (!selected) {
      throw new FoundationError("INTERNAL", "Authority selection failed");
    }
    const baseAssignee = this.assignmentToAssignee(scope, selected);
    const delegated = this.applyDelegation(scope, selected, baseAssignee, rule.subjectEmployeeId, asOf);
    return {
      resolverType: rule.mechanism,
      selectedAssignees: [delegated.assignee],
      candidates: [baseAssignee],
      fallbackApplied: delegated.sodBlocked,
      evidence: {
        source: "g01_authority_assignments",
        authorityAssignmentId: selected.id,
        delegatedBy: delegated.delegationId,
        sodBlockedDelegation: delegated.sodBlocked,
      },
    };
  }

  private resolveOrgUnitHead(scope: TenantScope, rule: ResolverRule): AuthorityResolution {
    const orgUnitId = requireValue(rule.orgUnitId, "orgUnitId");
    const orgUnit = this.orgUnits.find((item) => inScope(item, scope) && item.id === orgUnitId);
    if (orgUnit?.headEmployeeId) {
      const assignee = { type: "EMPLOYEE" as const, employeeId: orgUnit.headEmployeeId };
      return {
        resolverType: "ORG_UNIT_HEAD",
        selectedAssignees: [assignee],
        candidates: [assignee],
        fallbackApplied: false,
        evidence: { source: "org_units.head_employee_id", orgUnitId },
      };
    }
    const authority = this.authorities.find(
      (item) => inScope(item, scope) && item.authorityType === "ORG_UNIT_HEAD" && item.scopeOrgUnitId === orgUnitId && item.status === "ACTIVE"
    );
    if (!authority) {
      throw new FoundationError("NOT_FOUND", "Org-unit head not found");
    }
    const assignee = this.assignmentToAssignee(scope, authority);
    return {
      resolverType: "ORG_UNIT_HEAD",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: true,
      evidence: { source: "g01_authority_assignments", authorityAssignmentId: authority.id },
    };
  }

  private resolveNamedRole(rule: ResolverRule): AuthorityResolution {
    const roleCode = requireValue(rule.roleCode, "roleCode");
    const assignee = { type: "ROLE" as const, roleCode };
    return {
      resolverType: "NAMED_ROLE",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: false,
      evidence: { source: "resolver_rule.roleCode" },
    };
  }

  private resolveNamedIndividual(scope: TenantScope, rule: ResolverRule, asOf: string): AuthorityResolution {
    // NAMED_INDIVIDUAL (PH-02 model): resolve exactly the configured user id for exceptional statutory
    // assignments (e.g. a named inquiry officer or appellate signatory). There is NO fallback and NO
    // inference; every fail-closed branch below is BLOCKED, never guessed.
    const configuredUserId = requireValue(rule.userId, "userId");
    const subjectRef = rule.subjectUserId ?? rule.subjectEmployeeId;
    if (subjectRef && subjectRef === configuredUserId) {
      throw new FoundationError("CONFLICT", "Named individual resolves to the subject; self-approval BLOCKED", {
        details: { resolverType: "NAMED_INDIVIDUAL", reason: "SELF_APPROVAL_BLOCKED", configuredUserId },
      });
    }
    const record = this.namedIndividuals.find((item) => inScope(item, scope) && item.userId === configuredUserId);
    const active =
      !!record &&
      record.status === "ACTIVE" &&
      record.effectiveFrom <= asOf &&
      (!record.effectiveTo || record.effectiveTo >= asOf);
    if (!active) {
      throw new FoundationError("PRECONDITION_FAILED", "Configured named individual is absent or inactive; resolution BLOCKED", {
        details: { resolverType: "NAMED_INDIVIDUAL", reason: "INACTIVE_OR_ABSENT", configuredUserId },
      });
    }
    const assignee: ResolutionAssignee = { type: "USER", userId: configuredUserId };
    return {
      resolverType: "NAMED_INDIVIDUAL",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: false,
      evidence: { source: "g01_authority_assignments/workflow_stage_config", configuredNamedUserId: configuredUserId, asOf },
    };
  }

  private resolveNamedUser(rule: ResolverRule): AuthorityResolution {
    const userId = requireValue(rule.userId, "userId");
    const assignee = { type: "USER" as const, userId };
    return {
      resolverType: "NAMED_USER",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: false,
      evidence: { source: "resolver_rule.userId" },
    };
  }

  private resolveWorkQueue(rule: ResolverRule): AuthorityResolution {
    const queueScopeId = requireValue(rule.queueScopeId, "queueScopeId");
    const orgUnitId = rule.orgUnitId ?? "*";
    const levelId = rule.levelId ?? "*";
    const queueKey = `${queueScopeId}:${orgUnitId}:${levelId}`;
    const assignee = { type: "QUEUE" as const, queueKey };
    return {
      resolverType: "WORK_QUEUE",
      selectedAssignees: [assignee],
      candidates: [assignee],
      fallbackApplied: false,
      evidence: { source: "work_queue", queueKey },
    };
  }

  private resolveCommittee(scope: TenantScope, rule: ResolverRule): AuthorityResolution {
    const committeeCode = requireValue(rule.committeeCode, "committeeCode");
    const committee = this.committees.find((item) => inScope(item, scope) && item.committeeCode === committeeCode && item.status === "ACTIVE");
    if (!committee) {
      throw new FoundationError("NOT_FOUND", "Committee not found");
    }
    const candidates = committee.members
      .filter((member) => !member.recusedReason)
      .map((member): ResolutionAssignee => {
        if (member.memberEmployeeId) {
          return { type: "EMPLOYEE", employeeId: member.memberEmployeeId, label: member.role };
        }
        return { type: "EXTERNAL", label: `${member.role}:${member.externalMemberName ?? "external"}` };
      });
    const quorumCount = committee.members.filter((member) => member.requiredForQuorum && !member.recusedReason).length;
    if (quorumCount < committee.quorumRequired) {
      throw new FoundationError("PRECONDITION_FAILED", "Committee quorum not met");
    }
    return {
      resolverType: "COMMITTEE",
      selectedAssignees: candidates,
      candidates,
      fallbackApplied: false,
      evidence: { source: "g01_committees/g01_committee_members", committeeId: committee.id, quorumCount },
    };
  }

  private resolveDelegationOnly(scope: TenantScope, rule: ResolverRule, asOf: string): AuthorityResolution {
    const authorityCode = requireValue(rule.authorityCode, "authorityCode");
    const authority = this.activeAuthorities(scope, asOf).find((item) => item.authorityCode === authorityCode);
    if (!authority) {
      throw new FoundationError("NOT_FOUND", "Authority for delegation not found");
    }
    const assignee = this.assignmentToAssignee(scope, authority);
    const delegated = this.applyDelegation(scope, authority, assignee, rule.subjectEmployeeId, asOf);
    return {
      resolverType: "DELEGATION_OR_ACTING_CHARGE",
      selectedAssignees: [delegated.assignee],
      candidates: [assignee],
      fallbackApplied: delegated.sodBlocked,
      evidence: { source: "g01_authority_delegations", delegationId: delegated.delegationId, sodBlockedDelegation: delegated.sodBlocked },
    };
  }

  private activeAuthorities(scope: TenantScope, asOf: string): AuthorityAssignment[] {
    return this.authorities.filter(
      (item) => inScope(item, scope) && item.status === "ACTIVE" && item.effectiveFrom <= asOf && (!item.effectiveTo || item.effectiveTo >= asOf)
    );
  }

  private assignmentToAssignee(scope: TenantScope, authority: AuthorityAssignment): ResolutionAssignee {
    if (authority.authorityEmployeeId) {
      return { type: "EMPLOYEE", employeeId: authority.authorityEmployeeId };
    }
    if (authority.authorityPositionId) {
      const assignment = this.assignments.find((item) => inScope(item, scope) && item.positionId === authority.authorityPositionId);
      if (assignment) {
        return { type: "EMPLOYEE", employeeId: assignment.employeeId };
      }
    }
    throw new FoundationError("PRECONDITION_FAILED", "Authority has no resolvable assignee");
  }

  private applyDelegation(
    scope: TenantScope,
    authority: AuthorityAssignment,
    assignee: ResolutionAssignee,
    subjectEmployeeId: string | undefined,
    asOf: string
  ): { assignee: ResolutionAssignee; delegationId?: string; sodBlocked: boolean } {
    if (assignee.type !== "EMPLOYEE" || !assignee.employeeId) {
      return { assignee, sodBlocked: false };
    }
    const delegation = this.delegations.find(
      (item) =>
        inScope(item, scope) &&
        item.authorityAssignmentId === authority.id &&
        item.fromEmployeeId === assignee.employeeId &&
        item.status === "ACTIVE" &&
        item.effectiveFrom <= asOf &&
        (!item.effectiveTo || item.effectiveTo >= asOf)
    );
    if (!delegation) {
      return { assignee, sodBlocked: false };
    }
    if (subjectEmployeeId && delegation.toEmployeeId === subjectEmployeeId) {
      return { assignee, delegationId: delegation.id, sodBlocked: true };
    }
    return { assignee: { type: "EMPLOYEE", employeeId: delegation.toEmployeeId }, delegationId: delegation.id, sodBlocked: false };
  }
}

function requireValue(value: string | undefined, field: string): string {
  if (!value) {
    throw new FoundationError("VALIDATION_FAILED", `${field} is required`, { field });
  }
  return value;
}
