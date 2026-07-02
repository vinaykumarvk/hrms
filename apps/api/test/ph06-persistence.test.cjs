const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "DATABASE_URL not set — persistence integration test skipped";

const {
  createDatabasePool,
  runMigrations,
  PgLeaveRepository,
  PgTransferRepository,
  PgEmployeeProfileRepository,
} = require("../../../dist/apps/api/src");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");
const RUN = String(Date.now());

async function seedCore(pool) {
  const tenant = await pool.query(
    "INSERT INTO tenants (tenant_code, legal_name, display_name, status) VALUES ($1, $2, $3, $4) RETURNING id",
    ["PH06A-" + RUN, "PH-06A Persistence Tenant", "PH-06A Tenant", "ACTIVE"]
  );
  const tenantId = tenant.rows[0].id;
  const entity = await pool.query(
    "INSERT INTO entities (tenant_id, entity_code, legal_name, display_name) VALUES ($1, $2, $3, $4) RETURNING id",
    [tenantId, "ENT-" + RUN, "Directorate of Revenue", "Revenue"]
  );
  const entityId = entity.rows[0].id;
  const sourceOrgUnit = await pool.query(
    "INSERT INTO org_units (tenant_id, entity_id, org_unit_code, name) VALUES ($1, $2, $3, $4) RETURNING id",
    [tenantId, entityId, "OU-SRC-" + RUN, "District Office Mysuru"]
  );
  const destOrgUnit = await pool.query(
    "INSERT INTO org_units (tenant_id, entity_id, org_unit_code, name) VALUES ($1, $2, $3, $4) RETURNING id",
    [tenantId, entityId, "OU-DST-" + RUN, "District Office Ballari"]
  );
  const designation = await pool.query(
    "INSERT INTO designations (tenant_id, designation_code, name) VALUES ($1, $2, $3) RETURNING id",
    [tenantId, "DES-" + RUN, "Revenue Inspector"]
  );
  const employee = await pool.query(
    "INSERT INTO employees (tenant_id, entity_id, service_no, first_name, display_name, dob, date_of_joining, org_unit_id, designation_id) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
    [
      tenantId,
      entityId,
      "SVC-" + RUN.slice(-8),
      "Asha",
      "Asha Rao",
      "1988-04-12",
      "2012-06-01",
      sourceOrgUnit.rows[0].id,
      designation.rows[0].id,
    ]
  );
  return {
    tenantId,
    entityId,
    sourceOrgUnitId: sourceOrgUnit.rows[0].id,
    destOrgUnitId: destOrgUnit.rows[0].id,
    designationId: designation.rows[0].id,
    employeeId: employee.rows[0].id,
  };
}

test("PH-06A persistence substrate: migrations + pg-backed G03/G05 repositories on a real Postgres", { skip }, async (t) => {
  const pool = createDatabasePool(DATABASE_URL);
  try {
    const firstRun = await runMigrations(pool, MIGRATIONS_DIR);
    const secondRun = await runMigrations(pool, MIGRATIONS_DIR);
    assert.equal(secondRun.length, 0, "migration runner must be idempotent");
    if (firstRun.length > 0) {
      assert.deepEqual(firstRun, [
        "0001_platform_core.sql",
        "0002_g03_leave.sql",
        "0003_g05_transfer.sql",
        "0004_g01_employee_satellites.sql",
        "0005_g04_leave_sr_relay.sql",
        "0006_g02_workflow_config.sql",
        "0007_g03_payroll_feed.sql",
        "0008_g06_establishment_qsl.sql",
      ]);
    }

    const core = await seedCore(pool);
    const leaveRepo = new PgLeaveRepository(pool);
    const transferRepo = new PgTransferRepository(pool);
    const shared = {};

    await t.test("leave_types and leave_accrual_policies insert/read round-trip", async () => {
      const leaveType = await leaveRepo.insertLeaveType({
        tenantId: core.tenantId,
        entityId: core.entityId,
        leaveCode: "EL",
        name: "Earned Leave",
        category: "PAID",
        isAccruable: true,
        isEncashable: true,
        affectsPay: true,
      });
      assert.ok(leaveType.id, "leave type id assigned by the database");
      const fetched = await leaveRepo.findLeaveTypeByCode(core.tenantId, "EL");
      assert.equal(fetched.id, leaveType.id);
      assert.equal(fetched.name, "Earned Leave");
      assert.equal(fetched.is_accruable, true);
      assert.equal(fetched.status, "ACTIVE");

      const policy = await leaveRepo.insertAccrualPolicy({
        tenantId: core.tenantId,
        entityId: core.entityId,
        leaveTypeId: leaveType.id,
        accrualFrequency: "ANNUAL",
        accrualQuantity: 30,
        accrualBasis: "CALENDAR",
        carryForwardAllowed: true,
        lapseRule: "LAPSE_EXCESS",
        effectiveFrom: "2026-01-01",
      });
      assert.ok(policy.id);
      const policies = await leaveRepo.listAccrualPolicies(core.tenantId, leaveType.id);
      assert.equal(policies.length, 1);
      assert.equal(Number(policies[0].accrual_quantity), 30);
      assert.equal(policies[0].accrual_frequency, "ANNUAL");
      shared.leaveTypeId = leaveType.id;
    });

    await t.test("leave_reservations reserve->debit ledger flow bumps leave_balances.version", async () => {
      const opened = await leaveRepo.openBalance({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        leaveTypeId: shared.leaveTypeId,
        leaveYear: 2026,
        openingBalance: 30,
      });
      assert.equal(Number(opened.version), 0);
      assert.equal(Number(opened.available_balance), 30);

      const application = await leaveRepo.insertLeaveApplication({
        tenantId: core.tenantId,
        entityId: core.entityId,
        applicationNo: "LA/2026/" + RUN.slice(-5),
        employeeId: core.employeeId,
        leaveTypeId: shared.leaveTypeId,
        startDate: "2026-07-13",
        endDate: "2026-07-15",
        totalDays: 3,
        ledgerDebitUnits: 3,
        reason: "Family function",
        status: "SUBMITTED",
      });
      assert.ok(application.id);

      const reserved = await leaveRepo.reserveLeave({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        leaveTypeId: shared.leaveTypeId,
        leaveYear: 2026,
        applicationId: application.id,
        units: 3,
      });
      assert.equal(reserved.reservation.status, "RESERVED");
      assert.equal(Number(reserved.balance.reserved), 3);
      assert.equal(Number(reserved.balance.available_balance), 27);
      assert.equal(Number(reserved.balance.version), 1, "reserve must bump the optimistic-lock version");

      const debited = await leaveRepo.debitReservedLeave({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        leaveTypeId: shared.leaveTypeId,
        leaveYear: 2026,
        reservationId: reserved.reservation.id,
        applicationId: application.id,
        units: 3,
        effectiveDate: "2026-07-13",
      });
      assert.equal(debited.reservation.status, "CONSUMED");
      assert.equal(debited.ledgerEntry.entry_type, "AVAIL");
      assert.equal(Number(debited.ledgerEntry.amount), -3);
      assert.equal(Number(debited.ledgerEntry.balance_after), 27);
      assert.equal(debited.ledgerEntry.source_ref_id, application.id);
      assert.equal(Number(debited.balance.version), 2, "debit must bump the optimistic-lock version again");
      assert.equal(Number(debited.balance.availed), 3);
      assert.equal(Number(debited.balance.reserved), 0);
      assert.equal(Number(debited.balance.current_balance), 27);
      assert.equal(debited.balance.last_ledger_entry_id, debited.ledgerEntry.id);

      const ledger = await leaveRepo.listLedgerEntries(core.tenantId, core.employeeId, shared.leaveTypeId, 2026);
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0].source_ref_type, "LEAVE_APPLICATION");
    });

    await t.test("PH-07D payroll_attendance_feed lock + adjustment round-trip (R6)", async () => {
      const feedRow = await leaveRepo.upsertFeedRow({
        tenantId: core.tenantId,
        entityId: core.entityId,
        payPeriod: "2026-07",
        employeeId: core.employeeId,
        lwpDays: 1,
        halfPayDays: 0,
        paidOtMinutes: 45,
        presentUnits: 21.5,
        encashmentAmount: 0,
      });
      assert.ok(feedRow.id, "feed row persisted with database id");
      assert.equal(feedRow.is_locked, false);

      const lock = await leaveRepo.lockFeedPeriod({ tenantId: core.tenantId, entityId: core.entityId, payPeriod: "2026-07" });
      assert.equal(lock.lockedRowCount, 1);
      assert.equal(await leaveRepo.isFeedPeriodLocked(core.tenantId, "2026-07"), true);

      // Direct write into the locked period must fail closed with PERIOD_ALREADY_LOCKED.
      await assert.rejects(
        () =>
          leaveRepo.upsertFeedRow({
            tenantId: core.tenantId,
            entityId: core.entityId,
            payPeriod: "2026-07",
            employeeId: core.employeeId,
            lwpDays: 2,
            halfPayDays: 0,
            paidOtMinutes: 0,
            presentUnits: 20,
            encashmentAmount: 0,
          }),
        (error) => error.code === "PERIOD_ALREADY_LOCKED"
      );
      const lockedRow = await leaveRepo.findFeedRow(core.tenantId, "2026-07", core.employeeId);
      assert.equal(lockedRow.is_locked, true);
      assert.equal(Number(lockedRow.lwp_days), 1, "locked feed row must not be overwritten");

      const adjustment = await leaveRepo.insertFeedAdjustment({
        tenantId: core.tenantId,
        entityId: core.entityId,
        originalFeedId: feedRow.id,
        appliedInPayPeriod: "2026-08",
        employeeId: core.employeeId,
        adjustmentType: "LWP_DELTA",
        deltaValue: -1,
        reason: "Late regularisation of locked 2026-07",
        sourceRefType: "REGULARISATION",
      });
      assert.equal(adjustment.status, "PENDING");
      const adjustments = await leaveRepo.listFeedAdjustments(core.tenantId, "2026-08");
      assert.equal(adjustments.length, 1);
      assert.equal(adjustments[0].original_feed_id, feedRow.id);
    });

    await t.test("transfer_orders and clearance_items round-trip with transactional checklist creation", async () => {
      const request = await transferRepo.insertTransferRequest({
        tenantId: core.tenantId,
        entityId: core.entityId,
        requestNo: "TRQ-2026-" + RUN.slice(-6),
        employeeId: core.employeeId,
        transferType: "ADMINISTRATIVE",
        requestOrigin: "ADMIN",
        sourceOrgUnitId: core.sourceOrgUnitId,
        status: "SUBMITTED",
      });
      assert.ok(request.id);

      const order = await transferRepo.insertTransferOrder({
        tenantId: core.tenantId,
        entityId: core.entityId,
        orderNo: "TO/2026/" + RUN.slice(-6),
        orderClass: "SUBSTANTIVE",
        transferRequestId: request.id,
        employeeId: core.employeeId,
        transferType: "ADMINISTRATIVE",
        sourceOrgUnitId: core.sourceOrgUnitId,
        destOrgUnitId: core.destOrgUnitId,
        sourceDesignationId: core.designationId,
        destDesignationId: core.designationId,
        orderDate: "2026-07-01",
        relieveByDate: "2026-07-31",
        status: "PENDING_APPROVAL",
      });
      assert.equal(order.status, "PENDING_APPROVAL");
      assert.equal(order.transfer_request_id, request.id);

      const approved = await transferRepo.updateTransferOrderStatus(core.tenantId, order.id, "APPROVED");
      assert.equal(approved.status, "APPROVED");

      const created = await transferRepo.createClearanceChecklist({
        tenantId: core.tenantId,
        entityId: core.entityId,
        checklistNo: "NOD-2026-" + RUN.slice(-6),
        transferOrderId: order.id,
        employeeId: core.employeeId,
        sourceOrgUnitId: core.sourceOrgUnitId,
        departmentCodes: ["ACCOUNTS", "HR", "IT"],
      });
      assert.equal(created.checklist.total_items, 3);
      assert.equal(created.items.length, 3);
      assert.ok(created.items.every((item) => item.status === "PENDING"));

      const cleared = await transferRepo.clearItem(created.items[0].id, "2026-07-10T10:00:00Z");
      assert.equal(cleared.item.status, "CLEARED");
      assert.ok(cleared.item.cleared_at);
      assert.equal(cleared.checklist.cleared_items, 1);

      const items = await transferRepo.listClearanceItems(created.checklist.id);
      assert.equal(items.length, 3);
      assert.equal(items.filter((item) => item.status === "CLEARED").length, 1);
      shared.orderId = order.id;
      shared.checklistId = created.checklist.id;
    });

    await t.test("PH-07A g01 satellites + transactional outbox round-trip on a real Postgres", async () => {
      const profileRepo = new PgEmployeeProfileRepository(pool);

      const contact = await profileRepo.insertContactWithOutbox({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        contactType: "MOBILE",
        contactValue: "+919812340000",
        isPrimary: true,
        visibility: "INTERNAL",
        demoteExistingPrimary: true,
        effectiveFrom: "2026-01-01",
        changeReason: "CORRECTION",
        recordedBy: core.employeeId,
      });
      assert.ok(contact.contact.id);
      assert.equal(contact.contact.is_primary, true);
      assert.equal(contact.historyEntry.attribute_path, "contact.MOBILE");
      assert.ok(contact.outboxEvent.event_id);

      const firstAddress = await profileRepo.insertAddressWithOutbox({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        addressType: "PERMANENT",
        line1: "12 MG Road",
        city: "Mysuru",
        state: "Karnataka",
        country: "India",
        pincode: "570001",
        validFrom: "2020-01-15",
        changeReason: "CORRECTION",
        recordedBy: core.employeeId,
      });
      const secondAddress = await profileRepo.insertAddressWithOutbox({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        addressType: "PERMANENT",
        line1: "4 Palace Road",
        city: "Ballari",
        state: "Karnataka",
        country: "India",
        pincode: "583101",
        validFrom: "2026-06-01",
        changeReason: "CORRECTION",
        recordedBy: core.employeeId,
      });
      const addresses = await profileRepo.listAddresses(core.tenantId, core.employeeId);
      assert.equal(addresses.length, 2);
      const closed = addresses.find((row) => row.id === firstAddress.address.id);
      assert.equal(closed.is_current, false);
      assert.ok(closed.valid_to, "prior current address must be closed in the same transaction");
      const current = addresses.find((row) => row.id === secondAddress.address.id);
      assert.equal(current.is_current, true);

      const dependent = await profileRepo.insertDependentWithOutbox({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        fullName: "Kavya Rao",
        relationship: "DAUGHTER",
        dob: "2015-09-20",
        isMinor: true,
        isLegalHeir: true,
        heirSuccessionRank: 1,
        effectiveFrom: "2026-01-01",
        changeReason: "CORRECTION",
        recordedBy: core.employeeId,
      });
      assert.equal(dependent.dependent.is_minor, true);

      const governed = await profileRepo.appendAttributeHistoryWithOutbox({
        tenantId: core.tenantId,
        entityId: core.entityId,
        employeeId: core.employeeId,
        attributePath: "display_name",
        valueText: "Asha Menon",
        effectiveFrom: "2026-06-15",
        changeReason: "CORRECTION",
        source: "G01",
        recordedBy: core.employeeId,
      });
      assert.equal(governed.historyEntry.attribute_path, "display_name");

      // Ordered cursor feed: monotonic event_id, no gaps in what a cursor walk returns.
      const feed = await profileRepo.listOutboxEventsAfter(core.tenantId, 0, 100);
      assert.ok(feed.length >= 5, "every mutation must have produced exactly one outbox row");
      const ids = feed.map((row) => Number(row.event_id));
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
      const afterCursor = await profileRepo.listOutboxEventsAfter(core.tenantId, ids[0], 100);
      assert.equal(afterCursor.length, feed.length - 1, "cursor must resume strictly after the given event_id");

      const history = await profileRepo.listAttributeHistory(core.tenantId, core.employeeId);
      assert.ok(history.some((row) => row.attribute_path === "contact.MOBILE"));
      assert.ok(history.some((row) => row.attribute_path === "display_name"));
    });

    await t.test("rehydration: fresh pool and repository instances see the committed rows", async () => {
      const pool2 = createDatabasePool(DATABASE_URL);
      try {
        const leaveRepo2 = new PgLeaveRepository(pool2);
        const transferRepo2 = new PgTransferRepository(pool2);

        const leaveType = await leaveRepo2.findLeaveTypeByCode(core.tenantId, "EL");
        assert.equal(leaveType.id, shared.leaveTypeId);

        const balance = await leaveRepo2.getBalance(core.employeeId, shared.leaveTypeId, 2026);
        assert.equal(Number(balance.version), 2);
        assert.equal(Number(balance.available_balance), 27);

        const order = await transferRepo2.getTransferOrder(core.tenantId, shared.orderId);
        assert.equal(order.status, "APPROVED");

        const checklist = await transferRepo2.getClearanceChecklist(core.tenantId, shared.checklistId);
        assert.equal(checklist.total_items, 3);
        assert.equal(checklist.cleared_items, 1);
        const items = await transferRepo2.listClearanceItems(shared.checklistId);
        assert.equal(items.filter((item) => item.status === "CLEARED").length, 1);
      } finally {
        await pool2.end();
      }
    });
  } finally {
    await pool.end();
  }
});
