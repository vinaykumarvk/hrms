import { EmployeeRecord } from "../modules/g01/employeeMasterService";
import { AuthorityAssignment, AuthorityDelegation, Committee, EmployeeAssignment, OrgUnit, Position } from "../platform/authority-resolution/authorityResolutionService";
import { DocumentRecord } from "../modules/g13/documentVaultService";

export const ph03Ids = {
  tenant: "11111111-1111-1111-1111-111111111111",
  entity: "22222222-2222-2222-2222-222222222201",
  orgRevenue: "33333333-3333-3333-3333-333333333301",
  orgAssessment: "33333333-3333-3333-3333-333333333302",
  cadreRevenue: "44444444-4444-4444-4444-444444444401",
  manager: "99999999-9999-9999-9999-999999999901",
  employee: "99999999-9999-9999-9999-999999999902",
  managerPosition: "b0000000-0000-0000-0000-000000000201",
  employeePosition: "b0000000-0000-0000-0000-000000000150",
  documentAadhaar: "d0c00000-0000-0000-0000-000000001001",
};

export function ph03Employees(): EmployeeRecord[] {
  return [
    {
      id: ph03Ids.manager,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      serviceNo: "GOV-100245",
      displayName: "Ananya Rao",
      firstName: "Ananya",
      lastName: "Rao",
      employmentStatus: "ACTIVE",
      orgUnitId: ph03Ids.orgRevenue,
      designation: "Deputy Collector",
      pan: "ABCDE1234F",
      aadhaarMasked: "xxxx-xxxx-1234",
      category: "OBC",
      rowVersion: 1,
    },
    {
      id: ph03Ids.employee,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      serviceNo: "GOV-100246",
      displayName: "Kiran Patel",
      firstName: "Kiran",
      lastName: "Patel",
      employmentStatus: "ACTIVE",
      orgUnitId: ph03Ids.orgAssessment,
      designation: "Assistant Section Officer",
      pan: "FGHIJ5678K",
      aadhaarMasked: "xxxx-xxxx-5678",
      category: "GEN",
      rowVersion: 1,
    },
  ];
}

export function ph03AuthorityFacts(): {
  orgUnits: OrgUnit[];
  positions: Position[];
  assignments: EmployeeAssignment[];
  authorities: AuthorityAssignment[];
  delegations: AuthorityDelegation[];
  committees: Committee[];
} {
  return {
    orgUnits: [
      { id: ph03Ids.orgRevenue, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, name: "Revenue Department", headEmployeeId: ph03Ids.manager },
      { id: ph03Ids.orgAssessment, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, name: "Assessment Section", parentOrgUnitId: ph03Ids.orgRevenue },
    ],
    positions: [
      { id: ph03Ids.managerPosition, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-REV-DC-01" },
      {
        id: ph03Ids.employeePosition,
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        positionCode: "POS-REV-AS-05",
        reportsToPositionId: ph03Ids.managerPosition,
      },
    ],
    assignments: [
      {
        id: "da000000-0000-0000-0000-000000000001",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        employeeId: ph03Ids.manager,
        positionId: ph03Ids.managerPosition,
        orgUnitId: ph03Ids.orgRevenue,
        effectiveFrom: "2019-06-01",
      },
      {
        id: "da000000-0000-0000-0000-000000000002",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        employeeId: ph03Ids.employee,
        positionId: ph03Ids.employeePosition,
        orgUnitId: ph03Ids.orgAssessment,
        reportingManagerId: ph03Ids.manager,
        effectiveFrom: "1996-06-01",
      },
    ],
    authorities: [
      {
        id: "a1000000-0000-0000-0000-000000000001",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        authorityType: "TRANSFER_AUTHORITY",
        authorityCode: "G05_TRANSFER_REVENUE",
        scopeType: "ORG_UNIT",
        scopeOrgUnitId: ph03Ids.orgRevenue,
        authorityEmployeeId: ph03Ids.manager,
        priority: 10,
        effectiveFrom: "2026-01-01",
        status: "ACTIVE",
      },
      {
        id: "a1000000-0000-0000-0000-000000000002",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        authorityType: "ORG_UNIT_HEAD",
        authorityCode: "G03_LEAVE_HEAD_ASSESSMENT",
        scopeType: "ORG_UNIT",
        scopeOrgUnitId: ph03Ids.orgAssessment,
        authorityEmployeeId: ph03Ids.manager,
        priority: 10,
        effectiveFrom: "2026-01-01",
        status: "ACTIVE",
      },
    ],
    delegations: [
      {
        id: "d1000000-0000-0000-0000-000000000001",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        authorityAssignmentId: "a1000000-0000-0000-0000-000000000001",
        fromEmployeeId: ph03Ids.manager,
        toEmployeeId: ph03Ids.employee,
        kind: "ACTING_CHARGE",
        effectiveFrom: "2026-07-01",
        effectiveTo: "2026-07-31",
        status: "ACTIVE",
      },
    ],
    committees: [
      {
        id: "c1000000-0000-0000-0000-000000000001",
        tenantId: ph03Ids.tenant,
        entityId: ph03Ids.entity,
        committeeCode: "PH02-DPC-REVENUE",
        quorumRequired: 2,
        status: "ACTIVE",
        members: [
          { memberEmployeeId: ph03Ids.manager, role: "CHAIRPERSON", requiredForQuorum: true },
          { externalMemberName: "External PSC Nominee", role: "EXPERT", requiredForQuorum: true },
        ],
      },
    ],
  };
}

export function ph03Documents(): DocumentRecord[] {
  return [
    {
      id: ph03Ids.documentAadhaar,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      docNo: "DOC/2026/0001001",
      title: "Aadhaar Proof - GOV-100245",
      ownerEmployeeId: ph03Ids.manager,
      status: "ACTIVE",
      classification: "CONFIDENTIAL",
      currentVersionNo: 1,
      contentHash: "aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888",
      isWorm: false,
      legalHold: false,
      links: [],
    },
  ];
}
