// Manager-hierarchy validation seed (dev/testing only; never wired into production paths).
//
// Builds a single 6-person reporting chain — a leaf employee under five successive manager levels
// (leaf -> L1 -> L2 -> L3 -> L4 -> L5) — so the manager-hierarchy role-validation suite can exercise
// what the runtime actually resolves for a deep chain. Every name/identifier below is fictional test
// data. Off by default: only exercised when FoundationServicesOptions.seedManagerHierarchy is true,
// so createFoundationServices() with no options is byte-for-byte unaffected.
//
// Why a deep chain: AuthorityResolutionService.resolveReportingChain() returns the SINGLE
// reportingManagerId of the subject — never the chain above it, with no L1..L5 level distinction
// (see apps/api/src/platform/authority-resolution/authorityResolutionService.ts). This seed makes
// that behaviour directly observable: for the leaf's workflow tasks only L1 (the direct
// reportingManagerId) ever resolves; L2..L5 are never the resolved assignee. Dotted-line is NOT
// modelled here (EmployeeAssignment carries a single reportingManagerId), so the dotted-line use
// case is documented as unseedable rather than faked.
import { ActorContext } from "../platform/types";
import { EmployeeMasterService, EmployeeCreateInput } from "../modules/g01/employeeMasterService";
import { OrgUnit, Position, EmployeeAssignment } from "../platform/authority-resolution/authorityResolutionService";
import { ph03Ids } from "./ph03Seed";

export const managerHierarchySeedIds = {
  orgUnit: "66666666-6666-6666-6666-666666660001",
  positionLeaf: "66666666-6666-6666-5555-666666666001",
  positionL1: "66666666-6666-6666-5555-666666666002",
  positionL2: "66666666-6666-6666-5555-666666666003",
  positionL3: "66666666-6666-6666-5555-666666666004",
  positionL4: "66666666-6666-6666-5555-666666666005",
  positionL5: "66666666-6666-6666-5555-666666666006",
  assignmentLeaf: "66666666-6666-6666-7777-666666666001",
  assignmentL1: "66666666-6666-6666-7777-666666666002",
  assignmentL2: "66666666-6666-6666-7777-666666666003",
  assignmentL3: "66666666-6666-6666-7777-666666666004",
  assignmentL4: "66666666-6666-6666-7777-666666666005",
  assignmentL5: "66666666-6666-6666-7777-666666666006",
} as const;

export type ManagerHierarchyKey = "leaf" | "l1" | "l2" | "l3" | "l4" | "l5";
export type ManagerHierarchyIdMap = Record<ManagerHierarchyKey, string>;

interface ManagerHierarchySpec {
  key: ManagerHierarchyKey;
  serviceNo: string;
  firstName: string;
  lastName: string;
  dob: string;
  dateOfJoining: string;
  designation: string;
  pan: string;
  aadhaarMasked: string;
  positionId: string;
  assignmentId: string;
  /** Direct reporting manager key, or "ph03-manager" to anchor the top of the chain. */
  reportsToKey: ManagerHierarchyKey | "ph03-manager";
}

const SPECS: ManagerHierarchySpec[] = [
  {
    key: "leaf",
    serviceNo: "GOV-100501",
    firstName: "Neel",
    lastName: "Sharma",
    dob: "1998-02-14",
    dateOfJoining: "2025-11-03",
    designation: "Junior Analyst",
    pan: "TESTN1001Z",
    aadhaarMasked: "xxxx-xxxx-5001",
    positionId: managerHierarchySeedIds.positionLeaf,
    assignmentId: managerHierarchySeedIds.assignmentLeaf,
    reportsToKey: "l1",
  },
  {
    key: "l1",
    serviceNo: "GOV-100502",
    firstName: "Omar",
    lastName: "Desai",
    dob: "1985-06-21",
    dateOfJoining: "2018-04-01",
    designation: "Team Lead",
    pan: "TESTO1002Z",
    aadhaarMasked: "xxxx-xxxx-5002",
    positionId: managerHierarchySeedIds.positionL1,
    assignmentId: managerHierarchySeedIds.assignmentL1,
    reportsToKey: "l2",
  },
  {
    key: "l2",
    serviceNo: "GOV-100503",
    firstName: "Pia",
    lastName: "Bose",
    dob: "1978-09-30",
    dateOfJoining: "2012-07-15",
    designation: "Department Manager",
    pan: "TESTP1003Z",
    aadhaarMasked: "xxxx-xxxx-5003",
    positionId: managerHierarchySeedIds.positionL2,
    assignmentId: managerHierarchySeedIds.assignmentL2,
    reportsToKey: "l3",
  },
  {
    key: "l3",
    serviceNo: "GOV-100504",
    firstName: "Qadir",
    lastName: "Singh",
    dob: "1972-12-05",
    dateOfJoining: "2006-03-20",
    designation: "Senior Manager",
    pan: "TESTQ1004Z",
    aadhaarMasked: "xxxx-xxxx-5004",
    positionId: managerHierarchySeedIds.positionL3,
    assignmentId: managerHierarchySeedIds.assignmentL3,
    reportsToKey: "l4",
  },
  {
    key: "l4",
    serviceNo: "GOV-100505",
    firstName: "Ritu",
    lastName: "Khan",
    dob: "1966-05-18",
    dateOfJoining: "2000-01-10",
    designation: "General Manager",
    pan: "TESTR1005Z",
    aadhaarMasked: "xxxx-xxxx-5005",
    positionId: managerHierarchySeedIds.positionL4,
    assignmentId: managerHierarchySeedIds.assignmentL4,
    reportsToKey: "l5",
  },
  {
    key: "l5",
    serviceNo: "GOV-100506",
    firstName: "Suresh",
    lastName: "Iyengar",
    dob: "1960-08-27",
    dateOfJoining: "1994-09-01",
    designation: "Chief General Manager",
    pan: "TESTS1006Z",
    aadhaarMasked: "xxxx-xxxx-5006",
    positionId: managerHierarchySeedIds.positionL5,
    assignmentId: managerHierarchySeedIds.assignmentL5,
    reportsToKey: "ph03-manager",
  },
];

/** Idempotent: an employee already present by service_no (from a prior seed run) is reused. */
export function seedManagerHierarchyMasters(employeeMaster: EmployeeMasterService, actor: ActorContext): ManagerHierarchyIdMap {
  const ids = {} as ManagerHierarchyIdMap;
  for (const spec of SPECS) {
    const existing = employeeMaster.getByServiceNo(actor, spec.serviceNo);
    if (existing) {
      ids[spec.key] = existing.id;
      continue;
    }
    const input: EmployeeCreateInput = {
      firstName: spec.firstName,
      lastName: spec.lastName,
      orgUnitId: managerHierarchySeedIds.orgUnit,
      designation: spec.designation,
      dateOfJoining: spec.dateOfJoining,
      dob: spec.dob,
      serviceNo: spec.serviceNo,
      category: "GEN",
      pan: spec.pan,
      aadhaarMasked: spec.aadhaarMasked,
    };
    const { employee } = employeeMaster.create(actor, input);
    ids[spec.key] = employee.id;
  }
  return ids;
}

/** Authority-resolution facts (one org unit + the 6-position/6-assignment chain) merged additively
 *  alongside ph03AuthorityFacts() and testEmployeeAuthorityFacts() so REPORTING_CHAIN resolution
 *  works for every link in the chain. */
export function managerHierarchyAuthorityFacts(ids: ManagerHierarchyIdMap): {
  orgUnits: OrgUnit[];
  positions: Position[];
  assignments: EmployeeAssignment[];
} {
  const orgUnits: OrgUnit[] = [
    {
      id: managerHierarchySeedIds.orgUnit,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      name: "Manager Hierarchy Validation Department",
    },
  ];
  const positions: Position[] = SPECS.map((spec, index) => {
    const nextSpec = SPECS[index + 1];
    return {
      id: spec.positionId,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      positionCode: `POS-MH-${index + 1}`,
      // Position-hierarchy fallback mirrors the reportingManagerId chain (the resolver only reaches
      // this when reportingManagerId is absent, which it never is here — kept for realism).
      reportsToPositionId: nextSpec ? nextSpec.positionId : ph03Ids.managerPosition,
    };
  });
  const assignments: EmployeeAssignment[] = SPECS.map((spec) => ({
    id: spec.assignmentId,
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    employeeId: ids[spec.key],
    positionId: spec.positionId,
    orgUnitId: managerHierarchySeedIds.orgUnit,
    reportingManagerId: spec.reportsToKey === "ph03-manager" ? ph03Ids.manager : ids[spec.reportsToKey],
    effectiveFrom: spec.dateOfJoining,
  }));
  return { orgUnits, positions, assignments };
}
