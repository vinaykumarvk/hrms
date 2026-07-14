// Synthetic test-employee seed (dev/testing only; never wired into production paths).
//
// Every name, PAN, Aadhaar, phone number, bank/IFSC, address, and email below is fictional
// test data (example.com/example.org reserved domains; PAN prefixed "TEST"; bank named
// "Sample Public Bank"). None of it refers to a real person, employer, or institution.
//
// Off by default: this module is only exercised when FoundationServicesOptions.seedTestEmployees
// is explicitly set to true (see foundationServices.ts), so the existing PH-03 fixture and every
// test that boots createFoundationServices() with no options is byte-for-byte unaffected.
import { ActorContext } from "../platform/types";
import { EmployeeMasterService, EmployeeCreateInput, DependentRelationship } from "../modules/g01/employeeMasterService";
import { NomineeService } from "../modules/g01/nomineeService";
import { EmergencyContactService } from "../modules/g01/emergencyContactService";
import { EducationService, GradeType } from "../modules/g01/educationService";
import { BankAccountService } from "../modules/g01/bankAccountService";
import { LeaveService } from "../modules/g03/leaveService";
import { AttendanceOpsService } from "../modules/g03/attendanceOpsService";
import { DocumentVaultService } from "../modules/g13/documentVaultService";
import { PayRuleService } from "../modules/g10/payRuleService";
import { PayrollEngineService } from "../modules/g10/payrollEngineService";
import { TrainingService } from "../modules/g07/trainingService";
import { AparService } from "../modules/g08/aparService";
import { TransferService } from "../modules/g05/transferService";
import { PayrollService } from "../modules/g10/payrollService";
import { PensionRuleService } from "../modules/g11/pensionRuleService";
import { PromotionService } from "../modules/g06/promotionService";
import { SealedCoverService } from "../modules/g06/sealedCoverService";
import { DisciplinaryService } from "../modules/g09/disciplinaryService";
import { OrgUnit, Position, EmployeeAssignment } from "../platform/authority-resolution/authorityResolutionService";
import { ph03Ids } from "./ph03Seed";

export const testEmployeeSeedIds = {
  orgUnitIt: "55555555-5555-5555-5555-555555550001",
  orgUnitFinance: "55555555-5555-5555-5555-555555550002",
  positionItTrainee: "55555555-5555-5555-5555-555555556001",
  positionItManager: "55555555-5555-5555-5555-555555556002",
  positionFinanceAo: "55555555-5555-5555-5555-555555556003",
  positionAssessmentSa: "55555555-5555-5555-5555-555555556004",
  positionRevenueDm: "55555555-5555-5555-5555-555555556005",
  positionRevenueSdm: "55555555-5555-5555-5555-555555556006",
  assignmentRohan: "55555555-5555-5555-5555-555555557001",
  assignmentArjun: "55555555-5555-5555-5555-555555557002",
  assignmentSunita: "55555555-5555-5555-5555-555555557003",
  assignmentMeera: "55555555-5555-5555-5555-555555557004",
  assignmentDevika: "55555555-5555-5555-5555-555555557005",
  assignmentPriya: "55555555-5555-5555-5555-555555557006",
} as const;

const TEST_SHIFT_CODE = "GEN-TEST";

/** Elevated system actor for seed writes. `*` is the AuthorizationService wildcard escape hatch — the
 *  same one production bootstrap/migration code uses — so every downstream service call still runs its
 *  full business validation (PAN format, IFSC format, share-percent caps, priority uniqueness, etc.);
 *  only the coarse RBAC permission gate is satisfied. */
export function testEmployeeSeedActor(): ActorContext {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "seed-test-employees",
    roles: ["system"],
    permissions: ["*"],
    fieldGrants: ["*"],
  };
}

interface TestEmployeeSpec {
  key: "rohan" | "arjun" | "sunita" | "meera" | "devika" | "priya";
  serviceNo: string;
  firstName: string;
  lastName: string;
  dob: string;
  dateOfJoining: string;
  confirmationDate?: string;
  orgUnitId: string;
  designation: string;
  category: string;
  pan: string;
  aadhaarMasked: string;
  city: string;
  state: string;
  pincode: string;
  mobile: string;
  dependent: { fullName: string; relationship: DependentRelationship };
  education: { level: string; institution: string; yearOfPassing: number; gradeType: GradeType };
  bank: { bankName: string; ifsc: string; accountNumberMasked: string };
  /** Realistic accrual top-up: only credited when the employee's tenure has actually crossed the
   *  leave type's own accrual-cycle length (HALF_YEARLY for EL, YEARLY for CL) — never invented flat. */
  extraAccrual: { el: boolean; cl: boolean };
  reportingManagerKey: "ph03-manager" | "arjun";
}

/** Five fictional employees who joined within the last 24 months, spanning recent-joiner,
 *  on-probation, confirmed, and ~2-year-tenure states, across four departments (two reused
 *  from the existing PH-03 org units, two newly seeded) and two seniority levels of reporting. */
const TEST_EMPLOYEE_SPECS: TestEmployeeSpec[] = [
  {
    key: "rohan",
    serviceNo: "GOV-100301",
    firstName: "Rohan",
    lastName: "Verma",
    dob: "2000-03-10",
    dateOfJoining: "2026-06-22", // recent joiner (~3 weeks before the 2026-07-12 reference date)
    orgUnitId: testEmployeeSeedIds.orgUnitIt,
    designation: "Software Engineer Trainee",
    category: "GEN",
    pan: "TESTA1001Z",
    aadhaarMasked: "xxxx-xxxx-9001",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    mobile: "+919000000301",
    dependent: { fullName: "Suresh Verma", relationship: "FATHER" },
    education: { level: "B.Tech", institution: "National Institute of Engineering Studies", yearOfPassing: 2022, gradeType: "CGPA" },
    bank: { bankName: "Sample Public Bank", ifsc: "SAMP0001234", accountNumberMasked: "XXXXXXXX4001" },
    extraAccrual: { el: false, cl: false },
    reportingManagerKey: "arjun",
  },
  {
    key: "arjun",
    serviceNo: "GOV-100302",
    firstName: "Arjun",
    lastName: "Mehta",
    dob: "1988-11-12",
    dateOfJoining: "2024-08-05", // ~23 months tenure — the "approximately two years" employee
    confirmationDate: "2025-02-05",
    orgUnitId: testEmployeeSeedIds.orgUnitIt,
    designation: "IT Manager",
    category: "OBC",
    pan: "TESTB2002Z",
    aadhaarMasked: "xxxx-xxxx-9002",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560002",
    mobile: "+919000000302",
    dependent: { fullName: "Kavya Mehta", relationship: "SPOUSE" },
    education: { level: "MBA", institution: "State Institute of Management Studies", yearOfPassing: 2013, gradeType: "CGPA" },
    bank: { bankName: "Sample Public Bank", ifsc: "SAMP0001234", accountNumberMasked: "XXXXXXXX4002" },
    extraAccrual: { el: true, cl: true },
    reportingManagerKey: "ph03-manager",
  },
  {
    key: "sunita",
    serviceNo: "GOV-100303",
    firstName: "Sunita",
    lastName: "Iyer",
    dob: "1995-07-30",
    dateOfJoining: "2026-02-16", // ~5 months tenure — still inside the typical 6-month probation window
    orgUnitId: testEmployeeSeedIds.orgUnitFinance,
    designation: "Accounts Officer",
    category: "SC",
    pan: "TESTC3003Z",
    aadhaarMasked: "xxxx-xxxx-9003",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
    mobile: "+919000000303",
    dependent: { fullName: "Lakshmi Iyer", relationship: "MOTHER" },
    education: { level: "B.Com", institution: "Government Degree College for Commerce", yearOfPassing: 2017, gradeType: "PERCENTAGE" },
    bank: { bankName: "Sample Public Bank", ifsc: "SAMP0005678", accountNumberMasked: "XXXXXXXX4003" },
    extraAccrual: { el: false, cl: false },
    reportingManagerKey: "ph03-manager",
  },
  {
    key: "meera",
    serviceNo: "GOV-100304",
    firstName: "Meera",
    lastName: "Krishnan",
    dob: "1992-04-18",
    dateOfJoining: "2025-09-10", // ~10 months tenure, confirmed
    confirmationDate: "2026-03-10",
    orgUnitId: ph03Ids.orgAssessment, // reuse existing PH-03 master data
    designation: "Senior Assistant",
    category: "EWS",
    pan: "TESTD4004Z",
    aadhaarMasked: "xxxx-xxxx-9004",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500001",
    mobile: "+919000000304",
    dependent: { fullName: "Ravi Krishnan", relationship: "SPOUSE" },
    education: { level: "M.Com", institution: "Central University of Commerce", yearOfPassing: 2015, gradeType: "PERCENTAGE" },
    bank: { bankName: "Sample Public Bank", ifsc: "SAMP0005678", accountNumberMasked: "XXXXXXXX4004" },
    extraAccrual: { el: true, cl: false },
    reportingManagerKey: "ph03-manager",
  },
  {
    key: "devika",
    serviceNo: "GOV-100305",
    firstName: "Devika",
    lastName: "Menon",
    dob: "1985-09-25",
    dateOfJoining: "2025-04-14", // ~15 months tenure, confirmed, most senior designation
    confirmationDate: "2025-10-14",
    orgUnitId: ph03Ids.orgRevenue, // reuse existing PH-03 master data
    designation: "Deputy Manager",
    category: "GEN",
    pan: "TESTE5005Z",
    aadhaarMasked: "xxxx-xxxx-9005",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    mobile: "+919000000305",
    dependent: { fullName: "Ananth Menon", relationship: "SPOUSE" },
    education: { level: "MBA", institution: "National School of Public Administration", yearOfPassing: 2009, gradeType: "CGPA" },
    bank: { bankName: "Sample Public Bank", ifsc: "SAMP0005678", accountNumberMasked: "XXXXXXXX4005" },
    extraAccrual: { el: true, cl: true },
    reportingManagerKey: "ph03-manager",
  },
  {
    key: "priya",
    serviceNo: "GOV-100306",
    firstName: "Priya",
    lastName: "Nair",
    dob: "1980-05-20",
    dateOfJoining: "2017-04-01", // ~9 years 3 months tenure — clears the SL leave type's 60-month (5-year) minServiceMonths gate
    confirmationDate: "2017-10-01",
    orgUnitId: ph03Ids.orgRevenue, // reuse existing PH-03 master data (senior officer in the same department as the PH-03 manager)
    designation: "Senior Deputy Manager",
    category: "GEN",
    pan: "TESTF6006Z",
    aadhaarMasked: "xxxx-xxxx-9006",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    mobile: "+919000000306",
    dependent: { fullName: "Anil Nair", relationship: "SPOUSE" },
    education: { level: "M.A. Public Administration", institution: "National Academy of Administrative Studies", yearOfPassing: 2003, gradeType: "PERCENTAGE" },
    bank: { bankName: "Sample Public Bank", ifsc: "SAMP0009012", accountNumberMasked: "XXXXXXXX4006" },
    extraAccrual: { el: true, cl: true },
    reportingManagerKey: "ph03-manager",
  },
];

export type TestEmployeeIdMap = Record<TestEmployeeSpec["key"], string>;

export interface TestEmployeeSeedResult {
  ids: TestEmployeeIdMap;
  created: string[];
  skipped: string[];
}

/** Idempotent: an employee already present by service_no (from a prior seed run) is reused, never re-created. */
export function seedTestEmployeeMasters(employeeMaster: EmployeeMasterService, actor: ActorContext): TestEmployeeSeedResult {
  const ids = {} as TestEmployeeIdMap;
  const created: string[] = [];
  const skipped: string[] = [];
  for (const spec of TEST_EMPLOYEE_SPECS) {
    const existing = employeeMaster.getByServiceNo(actor, spec.serviceNo);
    if (existing) {
      ids[spec.key] = existing.id;
      skipped.push(spec.serviceNo);
      continue;
    }
    const input: EmployeeCreateInput = {
      firstName: spec.firstName,
      lastName: spec.lastName,
      orgUnitId: spec.orgUnitId,
      designation: spec.designation,
      dateOfJoining: spec.dateOfJoining,
      dob: spec.dob,
      serviceNo: spec.serviceNo,
      category: spec.category,
      pan: spec.pan,
      aadhaarMasked: spec.aadhaarMasked,
    };
    const { employee } = employeeMaster.create(actor, input);
    if (spec.confirmationDate) {
      employeeMaster.applyProbationConfirmation(actor, {
        employeeId: employee.id,
        confirmationEffectiveDate: spec.confirmationDate,
        confirmationRef: `SEED/${spec.serviceNo}/CONFIRMATION`,
      });
    }
    ids[spec.key] = employee.id;
    created.push(spec.serviceNo);
  }
  return { ids, created, skipped };
}

/** Authority-resolution facts (org units, positions, reporting-chain assignments) for the 5 test
 *  employees, merged additively alongside ph03AuthorityFacts() so leave-workflow submission (which
 *  resolves REPORTING_CHAIN) works for them. Two brand-new departments (IT, Finance) plus reuse of
 *  the existing PH-03 Revenue/Assessment org units. */
export function testEmployeeAuthorityFacts(ids: TestEmployeeIdMap): {
  orgUnits: OrgUnit[];
  positions: Position[];
  assignments: EmployeeAssignment[];
} {
  const orgUnits: OrgUnit[] = [
    {
      id: testEmployeeSeedIds.orgUnitIt,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      name: "Information Technology Department",
      headEmployeeId: ids.arjun,
    },
    {
      id: testEmployeeSeedIds.orgUnitFinance,
      tenantId: ph03Ids.tenant,
      entityId: ph03Ids.entity,
      name: "Finance & Accounts Department",
    },
  ];
  const positions: Position[] = [
    { id: testEmployeeSeedIds.positionItTrainee, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-IT-STE-01", reportsToPositionId: testEmployeeSeedIds.positionItManager },
    { id: testEmployeeSeedIds.positionItManager, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-IT-MGR-01", reportsToPositionId: ph03Ids.managerPosition },
    { id: testEmployeeSeedIds.positionFinanceAo, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-FIN-AO-01", reportsToPositionId: ph03Ids.managerPosition },
    { id: testEmployeeSeedIds.positionAssessmentSa, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-ASM-SA-02", reportsToPositionId: ph03Ids.managerPosition },
    { id: testEmployeeSeedIds.positionRevenueDm, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-REV-DM-01", reportsToPositionId: ph03Ids.managerPosition },
    { id: testEmployeeSeedIds.positionRevenueSdm, tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, positionCode: "POS-REV-SDM-01", reportsToPositionId: ph03Ids.managerPosition },
  ];
  const managerIdFor = (spec: TestEmployeeSpec): string => (spec.reportingManagerKey === "arjun" ? ids.arjun : ph03Ids.manager);
  const positionIdFor: Record<TestEmployeeSpec["key"], string> = {
    rohan: testEmployeeSeedIds.positionItTrainee,
    arjun: testEmployeeSeedIds.positionItManager,
    sunita: testEmployeeSeedIds.positionFinanceAo,
    meera: testEmployeeSeedIds.positionAssessmentSa,
    devika: testEmployeeSeedIds.positionRevenueDm,
    priya: testEmployeeSeedIds.positionRevenueSdm,
  };
  const assignmentIdFor: Record<TestEmployeeSpec["key"], string> = {
    rohan: testEmployeeSeedIds.assignmentRohan,
    arjun: testEmployeeSeedIds.assignmentArjun,
    sunita: testEmployeeSeedIds.assignmentSunita,
    meera: testEmployeeSeedIds.assignmentMeera,
    devika: testEmployeeSeedIds.assignmentDevika,
    priya: testEmployeeSeedIds.assignmentPriya,
  };
  const assignments: EmployeeAssignment[] = TEST_EMPLOYEE_SPECS.map((spec) => ({
    id: assignmentIdFor[spec.key],
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    employeeId: ids[spec.key],
    positionId: positionIdFor[spec.key],
    orgUnitId: spec.orgUnitId,
    reportingManagerId: managerIdFor(spec),
    effectiveFrom: spec.dateOfJoining,
  }));
  return { orgUnits, positions, assignments };
}

export interface TestEmployeeSatelliteServices {
  employeeMaster: EmployeeMasterService;
  nominee: NomineeService;
  emergencyContact: EmergencyContactService;
  education: EducationService;
  bankAccount: BankAccountService;
  leave: LeaveService;
  attendanceOps: AttendanceOpsService;
  documentVault: DocumentVaultService;
}

/** Idempotent per employee: if the employee already has a contact on file (the first satellite
 *  write below), the whole per-employee satellite block is skipped on re-run. The shared "GEN-TEST"
 *  shift is guarded separately since it is defined once, not per employee. */
export function seedTestEmployeeSatellites(services: TestEmployeeSatelliteServices, ids: TestEmployeeIdMap, actor: ActorContext): void {
  const { employeeMaster, nominee, emergencyContact, education, bankAccount, leave, attendanceOps, documentVault } = services;

  let shift = attendanceOps.listShifts(actor).find((item) => item.shiftCode === TEST_SHIFT_CODE);
  if (!shift) {
    shift = attendanceOps.defineShift(actor, {
      shiftCode: TEST_SHIFT_CODE,
      name: "General Shift (Test)",
      startTime: "09:00",
      endTime: "17:30",
      graceMinutes: 10,
    });
  }

  for (const spec of TEST_EMPLOYEE_SPECS) {
    const employeeId = ids[spec.key];
    const alreadySeeded = employeeMaster.listContacts(actor, employeeId).length > 0;
    if (alreadySeeded) {
      continue;
    }

    employeeMaster.addContact(actor, { employeeId, contactType: "MOBILE", contactValue: spec.mobile, isPrimary: true, visibility: "INTERNAL" });
    employeeMaster.addContact(actor, {
      employeeId,
      contactType: "OFFICIAL_EMAIL",
      contactValue: `${spec.firstName.toLowerCase()}.${spec.lastName.toLowerCase()}@example.com`,
      isPrimary: true,
      visibility: "INTERNAL",
    });
    employeeMaster.addContact(actor, {
      employeeId,
      contactType: "PERSONAL_EMAIL",
      contactValue: `${spec.firstName.toLowerCase()}.${spec.lastName.toLowerCase()}@example.org`,
      visibility: "PRIVATE",
    });

    employeeMaster.addAddress(actor, {
      employeeId,
      addressType: "PERMANENT",
      line1: `${spec.firstName} ${spec.lastName} Family Residence (Synthetic)`,
      city: spec.city,
      state: spec.state,
      pincode: spec.pincode,
      validFrom: spec.dateOfJoining,
    });
    employeeMaster.addAddress(actor, {
      employeeId,
      addressType: "PRESENT",
      line1: `Test Employee Housing, ${spec.designation} Block`,
      city: spec.city,
      state: spec.state,
      pincode: spec.pincode,
      validFrom: spec.dateOfJoining,
    });

    employeeMaster.addDependent(actor, {
      employeeId,
      fullName: spec.dependent.fullName,
      relationship: spec.dependent.relationship,
      effectiveDate: spec.dateOfJoining,
    });

    nominee.addNominee(actor, employeeId, {
      name: spec.dependent.fullName,
      benefitType: "GRATUITY",
      sharePct: 100,
    });

    emergencyContact.addEmergencyContact(actor, employeeId, {
      name: `${spec.dependent.fullName} (${spec.dependent.relationship})`,
      phone: spec.mobile,
      priority: 1,
    });

    education.addEducation(actor, employeeId, {
      level: spec.education.level,
      institution: spec.education.institution,
      isHighest: true,
      yearOfPassing: spec.education.yearOfPassing,
      gradeType: spec.education.gradeType,
    });

    bankAccount.addBankAccount(actor, employeeId, {
      bankName: spec.bank.bankName,
      ifsc: spec.bank.ifsc,
      accountNumberMasked: spec.bank.accountNumberMasked,
      isPrimarySalary: true,
    });

    // Leave: opening balance always applies on first touch (leave-type catalog default); a realistic
    // top-up is credited only once the employee's tenure has actually crossed that leave type's own
    // accrual-cycle length (HALF_YEARLY for EL, YEARLY for CL) — never an invented flat number.
    if (spec.extraAccrual.el) {
      leave.accrue(actor, { employeeId, leaveTypeId: "EL", leaveYear: 2026, effectiveDate: spec.dateOfJoining });
    }
    if (spec.extraAccrual.cl) {
      leave.accrue(actor, { employeeId, leaveTypeId: "CL", leaveYear: 2026, effectiveDate: spec.dateOfJoining });
    }

    documentVault.createDocument(actor, {
      title: `Educational Certificate — ${spec.firstName} ${spec.lastName} (Synthetic Test Data)`,
      ownerEmployeeId: employeeId,
      classification: "CONFIDENTIAL",
      content: `SYNTHETIC TEST DOCUMENT — ${spec.firstName} ${spec.lastName} — ${spec.education.level}, ${spec.education.institution} (${spec.education.yearOfPassing}). Not a real record.`,
    });

    const roster = attendanceOps.assignRoster(actor, {
      employeeId,
      shiftId: shift.id,
      effectiveFrom: spec.dateOfJoining,
      weeklyOffPattern: ["SUN"],
    });
    attendanceOps.publishRoster(actor, roster.id);

    // Modest attendance history: a handful of recent working days, not an exhaustive back-fill.
    const attendanceDates = ["2026-07-06", "2026-07-07", "2026-07-09", "2026-07-10"];
    for (const attendanceDate of attendanceDates) {
      if (attendanceDate < spec.dateOfJoining) {
        continue; // never predate the employee's own joining date
      }
      leave.captureAttendance(actor, { employeeId, attendanceDate, inTime: "09:05", outTime: "17:35" });
    }

    // Sunita has one missed punch (clocked in, never clocked out) so the FR-05 regularisation queue
    // has a real anomaly to act on without every test/demo inventing one ad hoc.
    if (spec.key === "sunita" && spec.dateOfJoining <= "2026-07-13") {
      const hasMissedPunch = leave.listAttendance(actor).some((record) => record.employeeId === employeeId && record.attendanceDate === "2026-07-13");
      if (!hasMissedPunch) {
        leave.captureAttendance(actor, { employeeId, attendanceDate: "2026-07-13", inTime: "09:12" });
      }
    }
  }

  // One modest leave-application history record, exercising the REPORTING_CHAIN workflow for the
  // employee whose manager (Arjun) is itself another seeded test employee.
  const rohanId = ids.rohan;
  const hasLeaveHistory = leave.listApplications(actor).some((application) => application.employeeId === rohanId);
  if (!hasLeaveHistory) {
    leave.submit(actor, { employeeId: rohanId, leaveTypeId: "CL", fromDate: "2026-07-08", toDate: "2026-07-08", reason: "Personal work" });
  }

  // Priya (~9yr tenure) is the only seeded employee past SL's 60-month eligibility gate — exercise
  // it here so "submit an SL application" is reachable end-to-end without inventing service history
  // ad hoc in every test/demo that needs it.
  const priyaId = ids.priya;
  const priyaHasSlHistory = leave.listApplications(actor).some((application) => application.employeeId === priyaId && application.leaveTypeId === "SL");
  if (!priyaHasSlHistory) {
    leave.submit(actor, { employeeId: priyaId, leaveTypeId: "SL", fromDate: "2026-09-01", toDate: "2026-09-05", reason: "Departmental examination preparation" });
  }

  // Meera: one submitted-AND-approved CL application, so the G04 leave-to-SR relay produces a
  // real LEAVE_APPROVED G12 service-register timeline entry for a seeded employee (FR-09
  // self-service SR timeline view needs at least one real event to be exercisable end-to-end).
  const meeraId = ids.meera;
  const meeraHasApprovedLeave = leave.listApplications(actor).some((application) => application.employeeId === meeraId && application.status === "APPROVED");
  if (!meeraHasApprovedLeave) {
    const submitted = leave.submit(actor, { employeeId: meeraId, leaveTypeId: "CL", fromDate: "2026-07-06", toDate: "2026-07-06", reason: "Family function" });
    leave.approve(actor, submitted.application.id, "seed-meera-leave-approve-001");
  }
}

const TEST_CALENDAR_HOLIDAYS: ReadonlyArray<{ holidayDate: string; name: string }> = [
  { holidayDate: "2026-01-26", name: "Republic Day" },
  { holidayDate: "2026-08-15", name: "Independence Day" },
  { holidayDate: "2026-10-02", name: "Gandhi Jayanti" },
  { holidayDate: "2026-11-08", name: "Diwali" },
  { holidayDate: "2026-12-25", name: "Christmas" },
];

/** FR-02 leave calendar: a tenant-wide 2026 gazetted-holiday set so holiday-aware day counting
 *  (countsHolidays=false leave types excluding these dates; a spell falling entirely on a holiday
 *  being rejected) is exercisable without every caller registering its own ad hoc holiday. Idempotent
 *  per date (LeaveService.addHoliday rejects a duplicate date with CONFLICT). */
export function seedTestLeaveCalendar(leave: LeaveService, actor: ActorContext): void {
  const existing = new Set(leave.listHolidays(actor).map((entry) => entry.holidayDate));
  for (const holiday of TEST_CALENDAR_HOLIDAYS) {
    if (!existing.has(holiday.holidayDate)) {
      leave.addHoliday(actor, holiday);
    }
  }
}

/** Elevated actor distinct from testEmployeeSeedActor(), used only as the second-approver identity
 *  for the payroll engine run's maker!=checker (PAYROLL_SOD) gate below. */
function payrollApproverSeedActor(actor: ActorContext): ActorContext {
  return { ...actor, userId: "seed-test-payroll-approver" };
}

/** FR-EPM-N/A — FR-G10-13/FR-G10-06 self-service payslip/YTD: a minimal tenant-wide pay-rule
 *  substrate (one earning, one deduction, Karnataka PT slab) plus one full engine-run lifecycle
 *  (enrol -> create -> snapshot -> compute -> approve -> lock) for Arjun (Bengaluru/KA), producing
 *  one real PUBLISHED payslip so "view payslips and payroll history" is exercisable against seeded
 *  data rather than a hand-built fixture. Idempotent: skips entirely if Arjun already has a
 *  PUBLISHED payslip for the seeded period from a prior run.
 */
export function seedTestPayrollLifecycle(
  services: { payRules: PayRuleService; payrollEngine: PayrollEngineService },
  arjunEmployeeId: string,
  actor: ActorContext
): void {
  const { payRules, payrollEngine } = services;
  const period = "2026-06";
  const alreadySeeded = payrollEngine
    .listMyPayslips({ ...actor, userId: arjunEmployeeId }, arjunEmployeeId)
    .some((entry) => entry.payslip.period === period);
  if (alreadySeeded) {
    return;
  }

  if (payRules.listComponents(actor).length === 0) {
    payRules.createPayComponent(actor, { componentCode: "BASIC", name: "Basic Pay", category: "EARNING", calcMethod: "FLAT" });
    payRules.createPayComponent(actor, { componentCode: "PT", name: "Professional Tax", category: "DEDUCTION", calcMethod: "SLAB" });
    payRules.createPayRule(actor, { componentCode: "BASIC", calcMethod: "FLAT", computationOrder: 1, effectiveFrom: "2026-01-01" });
    payRules.createPayRule(actor, { componentCode: "PT", calcMethod: "SLAB", computationOrder: 2, effectiveFrom: "2026-01-01" });
    payRules.addRateRow(actor, { tableType: "PT_SLAB", state: "KA", slabMinCents: 0, slabMaxCents: 1500000, flatAmountCents: 20000, effectiveFrom: "2026-01-01" });
    payRules.addRateRow(actor, { tableType: "PT_SLAB", state: "KA", slabMinCents: 1500001, flatAmountCents: 30000, effectiveFrom: "2026-01-01" });
  }

  payrollEngine.enrolEmployee(actor, {
    employeeId: arjunEmployeeId,
    stateOfPosting: "KA",
    componentAmountsCents: { BASIC: 8500000 },
    effectiveFrom: "2026-01-01",
  });

  const run = payrollEngine.createEngineRun(actor, { period, runMode: "FINAL" });
  payrollEngine.snapshotRunInputs(actor, run.id);
  payrollEngine.computeEngineRun(actor, run.id);
  payrollEngine.approveEngineRun(payrollApproverSeedActor(actor), run.id);
  payrollEngine.lockEngineRun(actor, run.id);
}

/** FR-G07-009 self-service "apply for training / view nominations": one open session plus one
 *  real self-nomination (submitted and approved) for Devika, so "browse available programs" and
 *  "track completion" have real seeded data — an employee applying for themselves, not an
 *  invented fixture. Idempotent: skips if Devika already has a nomination on file. */
export function seedTestTraining(training: TrainingService, devikaEmployeeId: string, actor: ActorContext): void {
  const alreadySeeded = training.listMyNominations(actor, devikaEmployeeId).length > 0;
  if (alreadySeeded) {
    return;
  }
  let session = training.listSessions(actor).find((item) => item.programCode === "PROG-LEAD-101");
  if (!session) {
    session = training.createSession(actor, { programCode: "PROG-LEAD-101", title: "Leadership Fundamentals", capacity: 10 });
  }
  const nomination = training.nominate(actor, { sessionId: session.id, employeeId: devikaEmployeeId });
  training.approveNomination(actor, nomination.id);
}

/** FR-G08-03 self-service "submit self-appraisal": one real open APAR form (GOALS_PENDING, no
 *  goals yet, so submitSelf() is immediately reachable) for Rohan, reported on by his real
 *  resolved manager Arjun — an employee submitting their own appraisal, not an invented fixture.
 *  Idempotent: skips if Rohan already has a form on file. */
export function seedTestApar(apar: AparService, ids: { rohan: string; arjun: string }, actor: ActorContext): void {
  const alreadySeeded = apar.listMyForms(actor, ids.rohan).length > 0;
  if (alreadySeeded) {
    return;
  }
  apar.openForm(actor, {
    employeeId: ids.rohan,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    reportingOfficerId: ids.arjun,
    reviewingOfficerId: ph03Ids.manager,
    acceptingAuthorityId: ph03Ids.manager,
  });
}

/** FR-G13-006 "access personal documents": the BRD's clearance gate (§3.3) is deny-by-default
 *  for CONFIDENTIAL+ for every principal, including a document's own owner — an employee needs
 *  an active USER clearance at or above a document's classification to view/download it, the
 *  same as anyone else. `seedTestEmployeeSatellites()` already gives every test employee one
 *  CONFIDENTIAL "Educational Certificate"; grant Rohan a real ACTIVE CONFIDENTIAL clearance so
 *  "access personal documents" is reachable end-to-end for at least one seeded employee, not
 *  just listable-but-unfetchable. Idempotent: skips if Rohan already holds an active clearance. */
export function seedTestDocumentClearance(documentVault: DocumentVaultService, rohanEmployeeId: string, actor: ActorContext): void {
  const alreadyCleared = documentVault
    .listSecurityClearances(actor)
    .some((clearance) => clearance.principalType === "USER" && clearance.principalRef === rohanEmployeeId && clearance.status === "ACTIVE");
  if (alreadyCleared) {
    return;
  }
  documentVault.grantSecurityClearance(
    { ...actor, actorUserId: actor.userId },
    {
      principalType: "USER",
      principalRef: rohanEmployeeId,
      clearanceLevel: "CONFIDENTIAL",
      justification: "Self-service access to own CONFIDENTIAL personal documents (seed data)",
      approvedBy: "seed-test-clearance-approver",
    }
  );
}

/** FR-G05-001 self-service "request a transfer / track status": one real PENDING_APPROVAL
 *  transfer order for Priya (Revenue → Assessment, both real PH-03 org units), routed to the
 *  real seeded G05_TRANSFER_REVENUE POSITION_AUTHORITY (ph03Ids.manager) — an employee raising
 *  their own transfer request, not an invented fixture. Idempotent: skips if Priya already has
 *  an order on file. */
export function seedTestTransfer(transfer: TransferService, priyaEmployeeId: string, actor: ActorContext): void {
  const alreadySeeded = transfer.listMyOrders(actor, priyaEmployeeId).length > 0;
  if (alreadySeeded) {
    return;
  }
  transfer.initiate(actor, {
    employeeId: priyaEmployeeId,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-07-01",
    effectiveDate: "2026-07-20",
    reason: "Administrative posting on request",
  });
}

/** FR-G11-15 self-service "check pension/retirement projections": real E30-E36 pension rule
 *  rows (idempotent — skipped if already resolvable) plus a real G10 last-drawn-pay feed for
 *  Arjun via `PayrollService`'s own run lifecycle (a separate substrate from the G10 payslip
 *  self-service engine seeded earlier this session — the two are independent stores), so
 *  `estimateBenefits()` has real emoluments to compute from rather than a caller-supplied
 *  fixture number. */
export function seedTestPensionEstimate(
  services: { payroll: PayrollService; pensionRules: PensionRuleService },
  arjunEmployeeId: string,
  actor: ActorContext
): void {
  const { payroll, pensionRules } = services;
  const alreadySeeded = (() => {
    try {
      payroll.getLastPayDrawn(actor, arjunEmployeeId);
      return true;
    } catch {
      return false;
    }
  })();
  if (alreadySeeded) {
    return;
  }

  const rulesAlreadySeeded = (() => {
    try {
      pensionRules.resolvePensionLimits(actor, "2026-01-01");
      pensionRules.resolveRoundingRule(actor, "2026-01-01");
      return true;
    } catch {
      return false;
    }
  })();
  if (!rulesAlreadySeeded) {
    pensionRules.addPensionLimitRule(actor, {
      ruleCode: "E35-2026-SEED",
      minPensionCents: 900000,
      maxPensionCents: 12500000,
      minQualifyingYearsForPension: 10,
      effectiveFrom: "2026-01-01",
    });
    pensionRules.addRoundingRule(actor, { ruleCode: "E36-2026-SEED", effectiveFrom: "2026-01-01" });
  }

  const maker = { ...actor, userId: "seed-test-payroll-maker", actorUserId: "seed-test-payroll-maker" };
  const approver = { ...actor, userId: "seed-test-payroll-approver-g11", actorUserId: "seed-test-payroll-approver-g11" };
  payroll.createSalaryStructure(maker, {
    employeeId: arjunEmployeeId,
    basicPayCents: 8500000,
    daRateBps: 4200,
    hraRateBps: 800,
    npsRateBps: 1000,
    professionalTaxCents: 20000,
    ruleVersion: "PAY-RULE-2026-01",
    effectiveFrom: "2026-01-01",
  });
  const run = payroll.createRun(maker, { period: "2026-06" });
  payroll.lockInputs(maker, run.id);
  payroll.computeRun(maker, run.id);
  payroll.reconcileRun(maker, run.id);
  payroll.approveRun(approver, run.id);
  payroll.lockRun(maker, run.id);
  payroll.disburseRun(maker, run.id);
}

/** Self-service "view my promotion & posting history": one real EFFECTED promotion order (and
 *  its auto-created probation record) for Sunita, run through the real DPC lifecycle
 *  (seniority list -> publish -> finalise -> case -> DPC -> issue -> effect), not an invented
 *  fixture. Idempotent: skips if Sunita already has a promotion order on file. */
export function seedTestPromotion(promotion: PromotionService, sunitaEmployeeId: string, actor: ActorContext): void {
  const alreadySeeded = promotion.listPromotionOrders(actor).some((order) => order.employeeId === sunitaEmployeeId);
  if (alreadySeeded) {
    return;
  }
  const list = promotion.createSeniorityList(actor, {
    cadreId: ph03Ids.cadreRevenue,
    effectiveDate: "2026-06-01",
    entries: [{ employeeId: sunitaEmployeeId, serviceNo: "GOV-100303", appointmentDate: "2016-04-01" }],
  });
  promotion.publishSeniorityList(actor, list.id);
  promotion.finaliseSeniorityList(actor, list.id);
  const promotionCase = promotion.createPromotionCase(actor, {
    seniorityListId: list.id,
    vacancies: 1,
    fromDesignation: "Assistant Section Officer",
    toDesignation: "Section Officer",
  });
  const dpc = promotion.holdDpc(actor, promotionCase.id, {
    panelMembers: [
      { employeeId: ph03Ids.manager, role: "CHAIRPERSON" },
      { externalName: "External PSC Nominee", role: "EXPERT" },
    ],
    quorumRequired: 2,
  });
  const orders = promotion.issuePromotionOrders(actor, promotionCase.id);
  const order = orders[0];
  if (!order) {
    throw new Error("seedTestPromotion: DPC issued no promotion orders");
  }
  promotion.effectPromotionOrder(actor, order.id, {
    effectDate: "2026-06-15",
    idempotencyKey: "idem-seed-g06-promotion-sunita-001",
    probationMonths: 24,
  });
  void dpc;
}

/** Self-service "view sealed-cover status concerning me": one real SEALED cover for Devika,
 *  pending a disciplinary/vigilance matter — status is self-service-visible, but `reason` stays
 *  confidential per BRD G09 rules (stripped for non-override actors in `listSealedCovers`). */
export function seedTestSealedCover(sealedCover: SealedCoverService, devikaEmployeeId: string, actor: ActorContext): void {
  const alreadySeeded = sealedCover.listSealedCovers(actor).some((cover) => cover.employeeId === devikaEmployeeId);
  if (alreadySeeded) {
    return;
  }
  sealedCover.placeSealedCover(actor, {
    employeeId: devikaEmployeeId,
    reason: "Pending vigilance inquiry",
  });
}

/** Self-service "view my disciplinary case status; respond to show-cause; request personal
 *  hearing": one real disciplinary case for Meera, run through the real due-process lifecycle
 *  (open -> serve charge -> record inquiry -> issue show-cause), stopped at SHOW_CAUSE so the
 *  employee's own respond/request-hearing self-service actions remain exercisable live rather
 *  than pre-seeded already-done. Idempotent: skips if Meera already has a case on file. */
export function seedTestDisciplinaryCase(disciplinary: DisciplinaryService, meeraEmployeeId: string, authorityEmployeeId: string, actor: ActorContext): void {
  const alreadySeeded = disciplinary.listMyCases(actor, meeraEmployeeId).length > 0;
  if (alreadySeeded) {
    return;
  }
  const opened = disciplinary.openCase(actor, {
    chargedEmployeeId: meeraEmployeeId,
    disciplinaryAuthorityId: authorityEmployeeId,
    allegations: "Unauthorised absence from duty station without leave",
    openedOn: "2026-05-01",
  });
  disciplinary.serveChargeMemo(actor, opened.id, { articles: ["Article I: Unauthorised absence"], servedOn: "2026-05-05" });
  disciplinary.recordInquiryReport(actor, opened.id, { findings: "PROVED", reportDate: "2026-06-10" });
  disciplinary.issueShowCauseNotice(actor, opened.id, {
    proposedPenalties: ["CENSURE", "WITHHOLD_INCREMENT"],
    issuedDate: "2026-06-15",
    responseDueDate: "2026-07-15",
  });
}
