const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationServices,
  seedTestEmployeeSatellites,
  testEmployeeSeedActor,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const EXPECTED_SERVICE_NOS = ["GOV-100301", "GOV-100302", "GOV-100303", "GOV-100304", "GOV-100305", "GOV-100306"];

test("seed-test-employees: default createFoundationServices() is unaffected (opt-in only)", () => {
  const services = createFoundationServices();
  const actor = testEmployeeSeedActor();
  const employees = services.employeeMaster.list(actor);
  assert.equal(employees.length, 2, "PH-03 fixture must stay at exactly its 2 employees when the flag is omitted");
  for (const serviceNo of EXPECTED_SERVICE_NOS) {
    assert.equal(services.employeeMaster.getByServiceNo(actor, serviceNo), null);
  }
});

test("seed-test-employees: creates 6 realistic employees with expected variation", () => {
  const services = createFoundationServices({ seedTestEmployees: true });
  const actor = testEmployeeSeedActor();

  const all = services.employeeMaster.list(actor);
  assert.equal(all.length, 8, "PH-03's 2 + the 6 seeded employees");

  const byServiceNo = Object.fromEntries(EXPECTED_SERVICE_NOS.map((no) => [no, services.employeeMaster.getByServiceNo(actor, no)]));
  for (const serviceNo of EXPECTED_SERVICE_NOS) {
    assert.ok(byServiceNo[serviceNo], `${serviceNo} must exist`);
  }

  const rohan = byServiceNo["GOV-100301"];
  const arjun = byServiceNo["GOV-100302"];
  const sunita = byServiceNo["GOV-100303"];
  const meera = byServiceNo["GOV-100304"];
  const devika = byServiceNo["GOV-100305"];
  const priya = byServiceNo["GOV-100306"];

  // Recent joiner, still on probation: no confirmationDate yet.
  assert.equal(rohan.dateOfJoining, "2026-06-22");
  assert.equal(rohan.confirmationDate, undefined);

  // ~23 months tenure ("approximately two years"), confirmed.
  assert.equal(arjun.dateOfJoining, "2024-08-05");
  assert.equal(arjun.confirmationDate, "2025-02-05");

  // On probation: joined ~5 months ago, no confirmationDate.
  assert.equal(sunita.dateOfJoining, "2026-02-16");
  assert.equal(sunita.confirmationDate, undefined);

  // Confirmed employee.
  assert.equal(meera.confirmationDate, "2026-03-10");
  assert.equal(devika.confirmationDate, "2025-10-14");

  // ~9yr tenure, the only seeded employee past SL's 60-month minServiceMonths eligibility gate.
  assert.equal(priya.dateOfJoining, "2017-04-01");
  assert.equal(priya.confirmationDate, "2017-10-01");

  // Department / designation / seniority variation.
  const designations = new Set([rohan, arjun, sunita, meera, devika, priya].map((e) => e.designation));
  assert.equal(designations.size, 6, "all 6 designations must be distinct");
  const orgUnits = new Set([rohan, arjun, sunita, meera, devika, priya].map((e) => e.orgUnitId));
  assert.ok(orgUnits.size >= 3, "employees must span at least 3 distinct org units/departments");
  // Meera, Devika, and Priya reuse the existing PH-03 org units (master-data reuse).
  assert.equal(meera.orgUnitId, ph03Ids.orgAssessment);
  assert.equal(devika.orgUnitId, ph03Ids.orgRevenue);
  assert.equal(priya.orgUnitId, ph03Ids.orgRevenue);

  // All join dates for the recent-joiner cohort fall within the last 24 months of the
  // 2026-07-12 reference date; Priya is deliberately outside that window (see above).
  for (const employee of [rohan, arjun, sunita, meera, devika]) {
    assert.ok(employee.dateOfJoining >= "2024-07-12" && employee.dateOfJoining <= "2026-07-12", `${employee.serviceNo} must have joined within the last 24 months`);
    assert.ok(employee.dob < employee.dateOfJoining, `${employee.serviceNo} dob must precede joining`);
  }
  assert.ok(priya.dob < priya.dateOfJoining);

  // Reporting chain: Rohan reports to Arjun (a peer test employee); the other 5 report to the
  // existing PH-03 manager. Verified indirectly through the leave workflow below.
  assert.equal(
    services.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: rohan.id }, "2026-07-12").selectedAssignees[0].employeeId,
    arjun.id
  );
  assert.equal(
    services.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: arjun.id }, "2026-07-12").selectedAssignees[0].employeeId,
    ph03Ids.manager
  );
  assert.equal(
    services.authorityResolution.resolve(actor, { mechanism: "REPORTING_CHAIN", subjectEmployeeId: priya.id }, "2026-07-12").selectedAssignees[0].employeeId,
    ph03Ids.manager
  );

  // Satellite modules: contacts, addresses, dependents, nominee, emergency contact, education, bank account.
  for (const employee of [rohan, arjun, sunita, meera, devika, priya]) {
    const contacts = services.employeeMaster.listContacts(actor, employee.id);
    assert.ok(contacts.some((c) => c.contactType === "MOBILE" && c.isPrimary));
    assert.ok(contacts.some((c) => c.contactType === "OFFICIAL_EMAIL" && c.contactValue.endsWith("@example.com")));

    const addresses = services.employeeMaster.listAddresses(actor, employee.id);
    assert.ok(addresses.some((a) => a.addressType === "PERMANENT"));
    assert.ok(addresses.some((a) => a.addressType === "PRESENT"));

    assert.equal(services.employeeMaster.listDependents(actor, employee.id).length, 1);

    const nominees = services.nominee.listNominees(actor, employee.id);
    assert.equal(nominees.length, 1);
    assert.equal(nominees[0].sharePct, 100);

    assert.equal(services.emergencyContact.listEmergencyContacts(actor, employee.id).length, 1);

    const educationRecords = services.education.listEducation(actor, employee.id);
    assert.equal(educationRecords.length, 1);
    assert.equal(educationRecords[0].isHighest, true);

    const bankAccounts = services.bankAccount.listBankAccounts(actor, employee.id);
    assert.equal(bankAccounts.length, 1);
    assert.match(bankAccounts[0].ifsc, /^[A-Z]{4}0[A-Z0-9]{6}$/);
    assert.equal(bankAccounts[0].status, "PENDING", "bank account starts PENDING per FR-EPM-008 lifecycle, same as a real add");

    const attendance = services.leave.listAttendance(actor).filter((a) => a.employeeId === employee.id);
    assert.ok(attendance.length >= 3, "modest attendance history, never predating date_of_joining");
    for (const record of attendance) {
      assert.ok(record.attendanceDate >= employee.dateOfJoining);
    }
  }

  // Leave: accrual respects each leave type's own accrual-cycle length relative to tenure.
  const arjunElBalance = services.leave.getBalance(actor, arjun.id, "EL", 2026);
  assert.ok(arjunElBalance.currentBalance > 30, "Arjun (23mo tenure) crossed the HALF_YEARLY EL cycle and got a top-up over the 30-day opening balance");
  const sunitaElBalance = services.leave.getBalance(actor, sunita.id, "EL", 2026);
  assert.equal(sunitaElBalance.currentBalance, 30, "Sunita (5mo tenure) has not crossed a HALF_YEARLY EL cycle yet — opening balance only");

  // One real submitted leave application demonstrating the reporting-chain workflow.
  const rohanApplications = services.leave.listApplications(actor).filter((a) => a.employeeId === rohan.id);
  assert.equal(rohanApplications.length, 1);
  assert.equal(rohanApplications[0].status, "SUBMITTED");
  assert.equal(rohanApplications[0].leaveTypeId, "CL");

  // Priya is the only seeded employee whose tenure clears SL's 60-month eligibility gate; her
  // seeded SL application proves that gate is reachable without inventing service history per-test.
  const priyaApplications = services.leave.listApplications(actor).filter((a) => a.employeeId === priya.id);
  assert.equal(priyaApplications.length, 1);
  assert.equal(priyaApplications[0].status, "SUBMITTED");
  assert.equal(priyaApplications[0].leaveTypeId, "SL");
  assert.throws(
    () => services.leave.submit(actor, { employeeId: rohan.id, leaveTypeId: "SL", fromDate: "2026-09-10", toDate: "2026-09-10" }),
    (error) => error.code === "ELIGIBILITY_FAILED",
    "a recent joiner must still fail SL's minServiceMonths gate"
  );

  // Leave calendar (FR-02): a 2026 gazetted-holiday set is seeded so holiday-aware day counting is
  // exercisable without every caller registering its own ad hoc holiday.
  const holidays = services.leave.listHolidays(actor);
  assert.ok(holidays.some((h) => h.holidayDate === "2026-08-15" && h.name === "Independence Day"));
  assert.ok(holidays.length >= 5, "the seeded 2026 holiday calendar must be present");

  // One synthetic document per employee, clearly marked as such — except Sunita (also has a real
  // G06 promotion-order document from `seedTestPromotion`'s DPC lifecycle) and Meera (also has
  // real G09 charge-memo + inquiry-report documents from `seedTestDisciplinaryCase`'s due-process
  // lifecycle).
  const allDocuments = services.documentVault.list(actor);
  for (const employee of [rohan, arjun, devika, priya]) {
    const ownDocuments = allDocuments.filter((doc) => doc.ownerEmployeeId === employee.id);
    assert.equal(ownDocuments.length, 1);
    assert.match(ownDocuments[0].title, /Synthetic Test Data/);
  }
  const sunitaDocuments = allDocuments.filter((doc) => doc.ownerEmployeeId === sunita.id);
  assert.equal(sunitaDocuments.length, 2, "the usual synthetic document plus the real G06 promotion-order document");
  assert.ok(sunitaDocuments.some((doc) => /Synthetic Test Data/.test(doc.title)));
  const meeraDocuments = allDocuments.filter((doc) => doc.ownerEmployeeId === meera.id);
  assert.equal(meeraDocuments.length, 3, "the usual synthetic document plus the real G09 charge-memo and inquiry-report documents");
  assert.ok(meeraDocuments.some((doc) => /Synthetic Test Data/.test(doc.title)));
});

test("seed-test-employees: re-running the satellite seed on the same services is idempotent (zero duplicates)", () => {
  const services = createFoundationServices({ seedTestEmployees: true });
  const actor = testEmployeeSeedActor();
  const rohan = services.employeeMaster.getByServiceNo(actor, "GOV-100301");

  const contactsBefore = services.employeeMaster.listContacts(actor, rohan.id).length;
  const nomineesBefore = services.nominee.listNominees(actor, rohan.id).length;
  const applicationsBefore = services.leave.listApplications(actor).filter((a) => a.employeeId === rohan.id).length;
  const shiftsBefore = services.attendanceOps.listShifts(actor).length;

  // Re-invoke the satellite seed directly against the same live services — simulating a second run.
  seedTestEmployeeSatellites(
    {
      employeeMaster: services.employeeMaster,
      nominee: services.nominee,
      emergencyContact: services.emergencyContact,
      education: services.education,
      bankAccount: services.bankAccount,
      leave: services.leave,
      attendanceOps: services.attendanceOps,
      documentVault: services.documentVault,
    },
    {
      rohan: rohan.id,
      arjun: services.employeeMaster.getByServiceNo(actor, "GOV-100302").id,
      sunita: services.employeeMaster.getByServiceNo(actor, "GOV-100303").id,
      meera: services.employeeMaster.getByServiceNo(actor, "GOV-100304").id,
      devika: services.employeeMaster.getByServiceNo(actor, "GOV-100305").id,
      priya: services.employeeMaster.getByServiceNo(actor, "GOV-100306").id,
    },
    actor
  );

  assert.equal(services.employeeMaster.listContacts(actor, rohan.id).length, contactsBefore, "no duplicate contacts on re-run");
  assert.equal(services.nominee.listNominees(actor, rohan.id).length, nomineesBefore, "no duplicate nominees on re-run");
  assert.equal(
    services.leave.listApplications(actor).filter((a) => a.employeeId === rohan.id).length,
    applicationsBefore,
    "no duplicate leave application on re-run"
  );
  assert.equal(services.attendanceOps.listShifts(actor).length, shiftsBefore, "shared shift is not redefined on re-run");
});

test("seed-test-employees: re-running employee-master creation across a fresh boot is idempotent by service_no", () => {
  const { seedTestEmployeeMasters } = require("../../../dist/apps/api/src");
  const services = createFoundationServices({ seedTestEmployees: true });
  const actor = testEmployeeSeedActor();

  // The employees already exist (seeded at construction); calling the master-seed function again
  // against the same live service must skip all 6 rather than creating duplicates or throwing.
  const result = seedTestEmployeeMasters(services.employeeMaster, actor);
  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 6);
  assert.equal(services.employeeMaster.list(actor).length, 8);
});
