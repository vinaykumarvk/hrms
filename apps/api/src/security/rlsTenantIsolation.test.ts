// PH-03C RLS / tenant-isolation proof. Black-box tests against the data-access/repo layer of the
// foundation (EmployeeMasterService + DocumentVaultService) proving row-level-security scoping:
//   - a viewer scoped to entity A cannot read entity B's rows (cross-entity read is denied),
//   - a viewer scoped to tenant T1 cannot read tenant T2's rows (cross-tenant read is denied),
//   - an AUTHORIZED cross-entity viewer (tenant-scoped, no entity pin) can read across entities.
// Authored as typed cases so the suite typechecks and compiles with the project build; executed under
// `npm test` via apps/api/test/rlsTenantIsolation.test.cjs.
import { EmployeeMasterService, EmployeeRecord } from "../modules/g01/employeeMasterService";
import { DocumentRecord, DocumentVaultService } from "../modules/g13/documentVaultService";
import { ServiceRegisterService } from "../modules/g12/serviceRegisterService";
import { AuditService } from "../platform/audit/auditService";
import { AuthorizationService } from "../platform/authorization/authorizationService";
import { ActorContext, TenantScope } from "../platform/types";

interface IsolationCase {
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

// Two tenants; tenant T1 hosts two independent entities (A and B). RLS must isolate both axes.
const tenantOne = "tenant-1111-1111-1111-111111111111";
const tenantTwo = "tenant-2222-2222-2222-222222222222";
const entityA = "entity-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const entityB = "entity-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const entityT2 = "entity-cccc-cccc-cccc-cccccccccccc";

const empA: EmployeeRecord = {
  id: "emp-a-0000-0000-0000-000000000001",
  tenantId: tenantOne,
  entityId: entityA,
  serviceNo: "A-1001",
  displayName: "Alice Entity-A",
  firstName: "Alice",
  employmentStatus: "ACTIVE",
  orgUnitId: "org-a-1",
  rowVersion: 1,
};
const empB: EmployeeRecord = {
  id: "emp-b-0000-0000-0000-000000000002",
  tenantId: tenantOne,
  entityId: entityB,
  serviceNo: "B-2002",
  displayName: "Bob Entity-B",
  firstName: "Bob",
  employmentStatus: "ACTIVE",
  orgUnitId: "org-b-1",
  rowVersion: 1,
};
const empT2: EmployeeRecord = {
  id: "emp-t2-0000-0000-0000-000000000003",
  tenantId: tenantTwo,
  entityId: entityT2,
  serviceNo: "T2-3003",
  displayName: "Trudy Tenant-2",
  firstName: "Trudy",
  employmentStatus: "ACTIVE",
  orgUnitId: "org-t2-1",
  rowVersion: 1,
};

const docA: DocumentRecord = {
  id: "doc-a-0000-0000-0000-000000000001",
  tenantId: tenantOne,
  entityId: entityA,
  docNo: "DOC/A/1",
  title: "Entity A order",
  status: "ACTIVE",
  classification: "CONFIDENTIAL",
  currentVersionNo: 1,
  contentHash: "a".repeat(64),
  isWorm: false,
  legalHold: false,
  links: [],
};
const docB: DocumentRecord = {
  id: "doc-b-0000-0000-0000-000000000002",
  tenantId: tenantOne,
  entityId: entityB,
  docNo: "DOC/B/1",
  title: "Entity B order",
  status: "ACTIVE",
  classification: "CONFIDENTIAL",
  currentVersionNo: 1,
  contentHash: "b".repeat(64),
  isWorm: false,
  legalHold: false,
  links: [],
};

function employeeService(): EmployeeMasterService {
  const audit = new AuditService();
  const authz = new AuthorizationService();
  const serviceRegister = new ServiceRegisterService(audit);
  return new EmployeeMasterService([empA, empB, empT2], authz, audit, serviceRegister);
}

function documentService(): DocumentVaultService {
  return new DocumentVaultService([docA, docB], new AuditService());
}

// Scoped viewers. An entity-pinned scope is the tenant + entity RLS predicate; a tenant-only scope is
// an authorized cross-entity viewer (e.g. a tenant-wide auditor) that RLS permits across entities.
const scopeEntityA: TenantScope = { tenantId: tenantOne, entityId: entityA };
const scopeEntityB: TenantScope = { tenantId: tenantOne, entityId: entityB };
const scopeTenantOneCrossEntity: TenantScope = { tenantId: tenantOne };
const scopeTenantTwo: TenantScope = { tenantId: tenantTwo, entityId: entityT2 };

function actor(scope: TenantScope): ActorContext {
  return {
    tenantId: scope.tenantId,
    entityId: scope.entityId,
    userId: "u-viewer",
    roles: ["viewer"],
    permissions: ["g01.employee.read"],
    fieldGrants: [],
  };
}

export const rlsTenantIsolationCases: IsolationCase[] = [
  {
    name: "entity-A viewer reads its own employee row but is BLOCKED from entity B and tenant T2 rows",
    run: () => {
      const svc = employeeService();
      assertEqual(svc.getById(scopeEntityA, empA.id)?.id, empA.id, "entity-A viewer sees entity-A row");
      assertEqual(svc.getById(scopeEntityA, empB.id), null, "entity-A viewer BLOCKED from entity-B row");
      assertEqual(svc.getById(scopeEntityA, empT2.id), null, "entity-A viewer BLOCKED from tenant-T2 row");
      assertEqual(svc.getByServiceNo(scopeEntityA, empB.serviceNo), null, "cross-entity service-no lookup BLOCKED");
      assertEqual(svc.count(scopeEntityA), 1, "entity-A viewer counts only entity-A rows");
    },
  },
  {
    name: "entity-B viewer reads its own employee row but is BLOCKED from entity A",
    run: () => {
      const svc = employeeService();
      assertEqual(svc.getById(scopeEntityB, empB.id)?.id, empB.id, "entity-B viewer sees entity-B row");
      assertEqual(svc.getById(scopeEntityB, empA.id), null, "entity-B viewer BLOCKED from entity-A row");
      assertEqual(svc.count(scopeEntityB), 1, "entity-B viewer counts only entity-B rows");
    },
  },
  {
    name: "authorized cross-entity viewer (tenant-scoped, no entity pin) reads BOTH entities in its tenant, never T2",
    run: () => {
      const svc = employeeService();
      assertEqual(svc.getById(scopeTenantOneCrossEntity, empA.id)?.id, empA.id, "cross-entity viewer reads entity-A");
      assertEqual(svc.getById(scopeTenantOneCrossEntity, empB.id)?.id, empB.id, "cross-entity viewer reads entity-B");
      assertEqual(svc.count(scopeTenantOneCrossEntity), 2, "cross-entity viewer counts both tenant-T1 rows");
      assertEqual(svc.getById(scopeTenantOneCrossEntity, empT2.id), null, "cross-entity viewer still BLOCKED from tenant-T2");
    },
  },
  {
    name: "cross-tenant read is BLOCKED: tenant-T2 viewer cannot see tenant-T1 rows",
    run: () => {
      const svc = employeeService();
      assertEqual(svc.getById(scopeTenantTwo, empA.id), null, "T2 viewer BLOCKED from T1 entity-A row");
      assertEqual(svc.getById(scopeTenantTwo, empB.id), null, "T2 viewer BLOCKED from T1 entity-B row");
      assertEqual(svc.getById(scopeTenantTwo, empT2.id)?.id, empT2.id, "T2 viewer reads its own row");
      assertEqual(svc.count(scopeTenantTwo), 1, "T2 viewer counts only T2 rows");
    },
  },
  {
    name: "authorization-enforced read path (readProfile) denies cross-entity access with NOT_FOUND, not a leak",
    run: () => {
      const svc = employeeService();
      const profile = svc.readProfile(actor(scopeEntityA), empA.id);
      assertEqual(profile.id, empA.id, "entity-A actor reads its own profile");
      assertThrows(
        () => svc.readProfile(actor(scopeEntityA), empB.id),
        /Employee not found/,
        "entity-A actor BLOCKED from entity-B profile (fail-closed, no cross-entity leak)"
      );
    },
  },
  {
    name: "document vault repo layer enforces the same cross-entity and cross-tenant isolation",
    run: () => {
      const docs = documentService();
      assertEqual(docs.get(scopeEntityA, docA.id)?.id, docA.id, "entity-A viewer reads entity-A document");
      assertEqual(docs.get(scopeEntityA, docB.id), null, "entity-A viewer BLOCKED from entity-B document");
      assertEqual(docs.count(scopeEntityA), 1, "entity-A viewer counts only entity-A documents");
      assertEqual(docs.count(scopeTenantOneCrossEntity), 2, "cross-entity viewer counts both documents");
      assertEqual(docs.get(scopeTenantTwo, docA.id), null, "cross-tenant document read BLOCKED");
      assert(docs.count(scopeTenantTwo) === 0, "T2 viewer sees no tenant-T1 documents");
    },
  },
];
